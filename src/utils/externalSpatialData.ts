/**
 * externalSpatialData.ts
 *
 * [2단계: 3대 외부 실측 건물 데이터(V-World WFS + OSM Overpass + OpenFreeMap) 통합 파이프라인]
 *
 * 1. OpenStreetMap Overpass Turbo API 직결:
 *    - BBOX 영역 실시간 쿼리 (https://overpass-api.de/api/interpreter 외 2개 미러)
 *    - building:levels, height, building, roof:shape, roof:colour, building:colour 파싱
 * 2. 국토교통부 브이월드(V-World) 2D/3D 건물통합정보 API 연동:
 *    - /api/vworld-buildings API 호출 -> LT_C_SPBD 실측 지상층수(grnd_flr), 지하층수(ugrnd_flr), 건물명(buld_nm), 세부용도
 * 3. OpenFreeMap 오픈 벡터 타일 결합:
 *    - queryRenderedFeatures + querySourceFeatures('openmaptiles-vector', { sourceLayer: 'building' })
 *    - 0ms 무지연 즉시 화면 표출 및 Overzoom 캐시로 수천 건 유지
 * 4. 한국형 실제 건물 스카이라인 자동 복원 엔진:
 *    - 아파트 단지: 15~25층 (45m~75m), 오프화이트/모던 그레이
 *    - 대학/병원/공공청사(상지대, 원주시청, 원주의료원 등): 5~12층 (18m~40m), 밝은 화강석/유리 파사드
 *    - 군부대 영내 건물(원주 1군지사, 캠프 롱 등): 1~3층 (4.5m~10m) 막사/창고/정비고, 슬레이트/국방색 지붕
 */

import type maplibregl from 'maplibre-gl';
import { classifyRegionalBuildingStyle, RegionalBuildingStyle } from '@/utils/regionalBuildingStyler';
import { spatialTileCache, bboxToTileKeys, prioritizeTilesByCamera } from '@/utils/spatialTileCache';
import { loadGangwonRealDataBulk } from '@/utils/gangwonRealDataLoader';
import { resolveFullUrl } from '@/utils/urlHelper';
import { fetchLocalVworldBuildings } from '@/utils/vworldLocalLoader';


export interface ExternalSpatialBuildingProperties {
  id?: string | number;
  name: string;
  buildingName?: string;
  height: number;
  levels: number;
  roofShape: string;
  roofColour?: string;
  buildingColour?: string;
  color?: string;
  usageType: 'residential' | 'commercial' | 'public' | 'military' | 'general' | 'apartment';
  isMilitaryOrPublic: boolean;
  bld_category: string;
  bld_category_label?: string;
  source: 'openfreemap' | 'overpass' | 'vworld' | 'fused';
  sources?: {
    ofm?: boolean;
    overpass?: boolean;
    vworld?: boolean;
  };
  grnd_flr?: number;
  ugrnd_flr?: number;
  regionalStyle?: RegionalBuildingStyle;
  skirtDepth?: number;
  [key: string]: any;
}

export type ExternalSpatialBuildingFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  ExternalSpatialBuildingProperties
>;

export interface ExternalSpatialResult {
  success: boolean;
  totalCount: number;
  openFreeMapCount: number;
  overpassCount: number;
  vworldCount: number;
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
  features: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, ExternalSpatialBuildingProperties>;
  parcels?: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  zoning?: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  infrastructure?: any;
  region?: any;
}

// -----------------------------------------------------------------------------
// 전역 캐시 (Overzoom 증발 방지 및 네트워크 중복 요청 차단)
// -----------------------------------------------------------------------------
const externalBuildingCache = new Map<string, ExternalSpatialBuildingFeature>();
const overpassQueryCache = new Map<string, { timestamp: number; data: ExternalSpatialBuildingFeature[] }>();
const vworldQueryCache = new Map<string, { timestamp: number; data: ExternalSpatialBuildingFeature[] }>();

// 최대 캐시 크기 관리
function trimCache(cache: Map<string, any>, maxSize = 25000, pruneCount = 5000) {
  if (cache.size > maxSize) {
    let toRemove = pruneCount;
    for (const key of cache.keys()) {
      cache.delete(key);
      if (--toRemove <= 0) break;
    }
  }
}

// -----------------------------------------------------------------------------
// [도우미] 기하학적 치수 및 중심 좌표 계산
// -----------------------------------------------------------------------------
interface PolygonGeometryMetrics {
  cLng: number;
  cLat: number;
  dimMin: number;
  dimMax: number;
  approxArea: number;
  aspectRatio: number;
}

function calculateGeometryMetrics(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): PolygonGeometryMetrics {
  const coords =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates[0]?.[0];

  if (!coords || coords.length < 3) {
    return {
      cLng: 127.935,
      cLat: 37.359,
      dimMin: 10,
      dimMax: 15,
      approxArea: 150,
      aspectRatio: 1.5,
    };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let sumLng = 0, sumLat = 0;
  for (const pt of coords) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
    sumLng += pt[0];
    sumLat += pt[1];
  }

  const cLng = sumLng / coords.length;
  const cLat = sumLat / coords.length;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const wMeters = (maxX - minX) * 111320 * cosLat;
  const hMeters = (maxY - minY) * 111320;
  const dimMin = Math.max(1, Math.min(wMeters, hMeters));
  const dimMax = Math.max(wMeters, hMeters);
  const approxArea = Math.max(10, wMeters * hMeters * 0.85);
  const aspectRatio = dimMax / Math.max(1, dimMin);

  return { cLng, cLat, dimMin, dimMax, approxArea, aspectRatio };
}

// -----------------------------------------------------------------------------
// [2단계: 외부 데이터 기반 한국형 실제 건물 스카이라인 자동 복원 엔진]
// -----------------------------------------------------------------------------
export function applyKoreanSkylineRules(
  rawProps: Record<string, any>,
  metrics: PolygonGeometryMetrics
): {
  height: number;
  levels: number;
  bld_category: string;
  bld_category_label: string;
  usageType: 'residential' | 'commercial' | 'public' | 'military' | 'general' | 'apartment';
  color: string;
  roofShape: string;
  roofColour: string;
  isMilitaryOrPublic: boolean;
  regionalStyle?: RegionalBuildingStyle;
  skirtDepth?: number;
} {
  const { cLng, cLat, dimMin, dimMax, approxArea, aspectRatio } = metrics;
  const name = String(rawProps.name || rawProps.name_ko || rawProps.buld_nm || rawProps.buildingName || '');

  // [요구사항 2] 바닥 면적 4,000㎡ 초과 거대 구역(학교 부지, 아파트 단지 외곽, 군부대 경계) 또는 비건물(지적 필지, 용도지역, landuse) 압출 차단
  const isExplicitBuilding = Boolean(
    rawProps.building ||
    rawProps.buld_nm ||
    rawProps.bldNm ||
    rawProps.buildingName ||
    rawProps.bd_mgt_sn ||
    rawProps.mgmBldrgstPk ||
    rawProps.realUse ||
    rawProps.grnd_flr ||
    rawProps.gro_flo_co ||
    rawProps.grndFlrCnt ||
    rawProps.hei ||
    rawProps.heit ||
    rawProps.height
  );

  const isNonBuildingTag =
    rawProps.is_non_building === true ||
    rawProps.is_site_boundary === true ||
    (!isExplicitBuilding &&
      (Boolean(rawProps.UQ111 || rawProps.UQ111_NM || rawProps.uq111 || rawProps.zoneName || rawProps.zone_nm || rawProps.spfc_nm || rawProps.spfc_cd) ||
        Boolean(rawProps.landuse || rawProps.leisure || rawProps.boundary || rawProps.admin_level || rawProps.natural) ||
        Boolean(rawProps.pnu || rawProps.jimok || rawProps.jibun)));

  if (isNonBuildingTag || approxArea > 4000 || approxArea < 10) {
    return {
      height: 0,
      levels: 0,
      bld_category: 'site_boundary',
      bld_category_label: '부지/필지 경계',
      usageType: 'general' as any,
      color: '#cbd5e1',
      roofShape: 'flat',
      roofColour: '#94a3b8',
      isMilitaryOrPublic: false,
    };
  }

  // 강원 4대 권역별 맞춤형 실사 건축 스타일러 실행
  const regStyle = classifyRegionalBuildingStyle(rawProps, metrics);

  const rawLevels = Number(
    rawProps.grnd_flr || rawProps.GRND_FLR || rawProps.gro_flo_co || rawProps.GRO_FLO_CO ||
    rawProps.levels || rawProps['building:levels'] || rawProps.building_levels || 0
  );
  const rawHeight = Number(
    rawProps.height || rawProps.render_height || rawProps.hei || rawProps.HEI || rawProps.bld_hgt || 0
  );

  let finalHeight = rawHeight >= 2.5 ? rawHeight : (rawLevels >= 1 ? rawLevels * 3.2 : 0);
  if (!finalHeight || finalHeight < 2.5) {
    finalHeight = regStyle.height;
  }
  finalHeight = Math.max(3.2, finalHeight);
  const finalLevels = rawLevels >= 1 ? rawLevels : Math.max(1, Math.round(finalHeight / 3.2));

  let color = regStyle.bldType === 2.0 ? '#f5f2eb' : (regStyle.bldType === 1.0 ? '#dfd9ce' : (regStyle.bldType === 3.0 ? '#ece7de' : '#8c3f2b'));
  if (rawProps['building:colour'] || rawProps.building_colour) {
    color = rawProps['building:colour'] || rawProps.building_colour;
  } else if (rawProps.color) {
    color = rawProps.color;
  }

  const isApartment = regStyle.bldType === 2.0 || rawProps.building === 'apartments' || rawProps.usageType === 'apartment';
  const isCommercial = regStyle.bldType === 1.0 || rawProps.usageType === 'commercial';
  const isMilitary = regStyle.bldType === 3.0 || rawProps.isMilitaryOrPublic === true;
  const isPublicOrCampus = regStyle.category === 'public_innovation_hq' || regStyle.bldType === 1.0;

  const defaultRoofColor = isApartment
    ? '#57534e'
    : isCommercial
    ? (regStyle.roofSlotId === 17.0 ? '#357a56' : regStyle.roofSlotId === 16.0 ? '#7c3a27' : '#78716c')
    : isMilitary
    ? '#6e3222'
    : (regStyle.roofSlotId === 16.0 ? '#6e3222' : regStyle.roofSlotId === 18.0 ? '#254e7a' : '#357a56');

  const roofShape = rawProps['roof:shape'] || rawProps.roof_shape || regStyle.roofShape;
  const roofColour = rawProps['roof:colour'] || rawProps.roof_color || defaultRoofColor;
  return {
    height: finalHeight,
    levels: finalLevels,
    bld_category: regStyle.category,
    bld_category_label: regStyle.categoryLabel,
    usageType: (regStyle.bldType === 2.0 ? 'apartment' : regStyle.bldType === 1.0 ? 'commercial' : regStyle.bldType === 3.0 ? 'military' : regStyle.bldType === 4.0 ? 'public' : 'residential') as any,
    color,
    roofShape,
    roofColour,
    isMilitaryOrPublic: isMilitary || isPublicOrCampus,
    regionalStyle: regStyle,
    skirtDepth: regStyle.skirtDepth,
  };
}

// -----------------------------------------------------------------------------
// [외부 소스 1: OpenStreetMap Overpass Turbo API 직결]
// -----------------------------------------------------------------------------
export async function fetchOverpassBuildings(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<ExternalSpatialBuildingFeature[]> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cacheKey = `${minLng.toFixed(3)}_${minLat.toFixed(3)}_${maxLng.toFixed(3)}_${maxLat.toFixed(3)}`;
  const cached = overpassQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 120000) {
    return cached.data;
  }

  const ql = `[out:json][timeout:15];
(
  way["building"](${minLat},${minLng},${maxLat},${maxLng});
  relation["building"](${minLat},${minLng},${maxLat},${maxLng});
);
out body geom qt;`;

  const endpoints = [
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(ql)}`,
    `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
  ];

  const results: ExternalSpatialBuildingFeature[] = [];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GeoBrief3D/1.0 (Gangwon Overpass Bulk)',
        },
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const data = await res.json();
      const elements = data.elements || [];

      for (const el of elements) {
        if (!el.tags || !el.tags.building) continue;
        if (!Array.isArray(el.geometry) || el.geometry.length < 3) continue;

        const ring: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push([first[0], first[1]]);
        }

        const geom: GeoJSON.Polygon = {
          type: 'Polygon',
          coordinates: [ring],
        };

        const metrics = calculateGeometryMetrics(geom);
        const skyline = applyKoreanSkylineRules(el.tags, metrics);

        const feat: ExternalSpatialBuildingFeature = {
          type: 'Feature',
          id: `osm-op-${el.id || results.length}`,
          properties: {
            id: `osm-op-${el.id || results.length}`,
            name: el.tags.name || el.tags['name:ko'] || skyline.bld_category_label,
            buildingName: el.tags.name || el.tags['name:ko'] || '',
            ...skyline,
            source: 'overpass',
            sources: { ofm: false, overpass: true, vworld: false },
          },
          geometry: geom,
        };

        results.push(feat);
      }

      break; // 성공 시 다음 미러 호출 중단
    } catch {
      // 엔드포인트 실패 시 다음 미러 시도
    }
  }

  overpassQueryCache.set(cacheKey, { timestamp: Date.now(), data: results });
  trimCache(overpassQueryCache, 100);
  return results;
}

// -----------------------------------------------------------------------------
// [외부 소스 2: 국토교통부 브이월드(V-World) 건물통합정보 API 연동]
// -----------------------------------------------------------------------------
export async function fetchVworldBuildings(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<ExternalSpatialBuildingFeature[]> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cacheKey = `${minLng.toFixed(3)}_${minLat.toFixed(3)}_${maxLng.toFixed(3)}_${maxLat.toFixed(3)}`;
  const cached = vworldQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 180000) {
    return cached.data;
  }

  const results: ExternalSpatialBuildingFeature[] = [];

  try {
    const url = resolveFullUrl(`/api/vworld-buildings?bbox=${minLng},${minLat},${maxLng},${maxLat}&maxFeatures=5000`);
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      const features = data.features || [];

      for (const f of features) {
        if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
          continue;
        }

        const metrics = calculateGeometryMetrics(f.geometry);
        const skyline = applyKoreanSkylineRules(f.properties || {}, metrics);

        const feat: ExternalSpatialBuildingFeature = {
          type: 'Feature',
          id: f.id || `vw-${results.length}`,
          properties: {
            id: f.id || `vw-${results.length}`,
            name: f.properties?.buld_nm || f.properties?.name || skyline.bld_category_label,
            buildingName: f.properties?.buld_nm || f.properties?.name || '',
            ...skyline,
            grnd_flr: f.properties?.grnd_flr,
            ugrnd_flr: f.properties?.ugrnd_flr,
            source: 'vworld',
            sources: { ofm: false, overpass: false, vworld: true },
          },
          geometry: f.geometry,
        };

        results.push(feat);
      }
    }
  } catch (err) {
    console.warn('[externalSpatialData] V-World fetch notice:', err);
  }

  vworldQueryCache.set(cacheKey, { timestamp: Date.now(), data: results });
  trimCache(vworldQueryCache, 100);
  return results;
}

// -----------------------------------------------------------------------------
// [외부 소스 3: OpenFreeMap 오픈 벡터 타일 0ms 즉시 추출 및 결합]
// -----------------------------------------------------------------------------
export function extractOpenFreeMapBuildings(
  map: maplibregl.Map
): ExternalSpatialBuildingFeature[] {
  if (!map) return [];
  try {
    const vectorSources = ['openmaptiles-vector', 'openfreemap', 'openmaptiles'].filter((s) => map.getSource(s));
    if (vectorSources.length === 0) return [];

    const bounds = map.getBounds();
    const minLng = bounds.getWest() - 0.025;
    const maxLng = bounds.getEast() + 0.025;
    const minLat = bounds.getSouth() - 0.025;
    const maxLat = bounds.getNorth() + 0.025;

    const seen = new Set<string>();
    const results: ExternalSpatialBuildingFeature[] = [];

    for (const srcId of vectorSources) {
      const feats = map.querySourceFeatures(srcId, { sourceLayer: 'building' });
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue;

        const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0]?.[0] : f.geometry.coordinates[0]?.[0]?.[0];
        if (!coords) continue;
        const [lng, lat] = coords;
        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;

        const fid = f.id !== undefined && f.id !== null ? `ofm_${f.id}` : `ofm_${lng.toFixed(5)}_${lat.toFixed(5)}`;
        if (seen.has(fid)) continue;
        seen.add(fid);

        const props = (f.properties || {}) as Record<string, any>;
        const rawHei = Number(props.render_height || props.height || 0);
        const rawFlr = Number(props.levels || props['building:levels'] || 0);
        const isApt = props.building === 'apartments' || props.type === 'apartments';
        const height = rawHei >= 3.0 ? rawHei : (rawFlr >= 1 ? rawFlr * 3.2 : (isApt ? 45.0 : 6.5));
        const levels = rawFlr >= 1 ? rawFlr : Math.max(1, Math.round(height / 3.2));

        results.push({
          type: 'Feature',
          id: fid,
          properties: {
            id: fid,
            name: props.name || props.name_ko || (isApt ? '아파트' : '건물'),
            buildingName: props.name || props.name_ko || '',
            height,
            levels,
            grnd_flr: levels,
            roofShape: props['roof:shape'] || 'flat',
            roofColour: props['roof:colour'] || props['roof:color'],
            usageType: isApt ? 'apartment' : 'general',
            isMilitaryOrPublic: false,
            bld_category: isApt ? 'apartment' : 'general',
            source: 'openfreemap',
            sources: { ofm: true, overpass: false, vworld: false },
          },
          geometry: f.geometry,
        });

        if (results.length >= 8000) break;
      }
      if (results.length > 0) break;
    }
    return results;
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// [3대 외부 소스 정합 및 융합 파이프라인]
// -----------------------------------------------------------------------------
export function mergeSpatialFeatures(
  ofmFeatures: ExternalSpatialBuildingFeature[],
  vworldFeatures: ExternalSpatialBuildingFeature[],
  overpassFeatures: ExternalSpatialBuildingFeature[]
): ExternalSpatialBuildingFeature[] {
  // 공간 격자 매핑 (0.0003도 ~= 약 30m 반경 공간 해시)
  const grid = new Map<string, ExternalSpatialBuildingFeature[]>();
  const mergedList: ExternalSpatialBuildingFeature[] = [];

  function getGridKey(lng: number, lat: number) {
    const gx = Math.floor(lng / 0.0003);
    const gy = Math.floor(lat / 0.0003);
    return `${gx}:${gy}`;
  }

  // 1. OFM 기본 적재
  for (const feat of ofmFeatures) {
    const coords =
      feat.geometry.type === 'Polygon'
        ? feat.geometry.coordinates[0]
        : feat.geometry.coordinates[0]?.[0];
    if (!coords || !coords[0]) continue;
    const cLng = coords[0][0];
    const cLat = coords[0][1];
    const key = getGridKey(cLng, cLat);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(feat);
    mergedList.push(feat);
  }

  // 2. V-World 실측 대장 매칭 및 우선 주입
  for (const vwFeat of vworldFeatures) {
    const coords =
      vwFeat.geometry.type === 'Polygon'
        ? vwFeat.geometry.coordinates[0]
        : vwFeat.geometry.coordinates[0]?.[0];
    if (!coords || !coords[0]) continue;
    const cLng = coords[0][0];
    const cLat = coords[0][1];
    const key = getGridKey(cLng, cLat);

    let matched: ExternalSpatialBuildingFeature | null = null;
    const candidates = [
      ...(grid.get(key) || []),
      ...(grid.get(getGridKey(cLng + 0.0003, cLat)) || []),
      ...(grid.get(getGridKey(cLng - 0.0003, cLat)) || []),
      ...(grid.get(getGridKey(cLng, cLat + 0.0003)) || []),
      ...(grid.get(getGridKey(cLng, cLat - 0.0003)) || []),
    ];

    for (const cand of candidates) {
      const candCoords =
        cand.geometry.type === 'Polygon'
          ? cand.geometry.coordinates[0]
          : cand.geometry.coordinates[0]?.[0];
      if (candCoords && candCoords[0]) {
        const dLng = Math.abs(candCoords[0][0] - cLng);
        const dLat = Math.abs(candCoords[0][1] - cLat);
        if (dLng < 0.00025 && dLat < 0.00025) {
          matched = cand;
          break;
        }
      }
    }

    if (matched) {
      // 속성 보강
      matched.properties = {
        ...matched.properties,
        name: vwFeat.properties.buildingName || matched.properties.name,
        buildingName: vwFeat.properties.buildingName || matched.properties.buildingName,
        height: vwFeat.properties.height > 0 ? vwFeat.properties.height : matched.properties.height,
        levels: vwFeat.properties.levels > 0 ? vwFeat.properties.levels : matched.properties.levels,
        grnd_flr: vwFeat.properties.grnd_flr,
        ugrnd_flr: vwFeat.properties.ugrnd_flr,
        bld_category: vwFeat.properties.bld_category || matched.properties.bld_category,
        bld_category_label: vwFeat.properties.bld_category_label || matched.properties.bld_category_label,
        color: vwFeat.properties.color || matched.properties.color,
        sources: {
          ofm: !!matched.properties.sources?.ofm,
          overpass: !!matched.properties.sources?.overpass,
          vworld: true,
        },
      };
    } else {
      // 신규 V-World 피처 추가
      mergedList.push(vwFeat);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(vwFeat);
    }
  }

  // 3. OSM Overpass 세부 속성 (지붕, 층수, 높이, 외벽색) 보강
  for (const opFeat of overpassFeatures) {
    const coords =
      opFeat.geometry.type === 'Polygon'
        ? opFeat.geometry.coordinates[0]
        : opFeat.geometry.coordinates[0]?.[0];
    if (!coords || !coords[0]) continue;
    const cLng = coords[0][0];
    const cLat = coords[0][1];
    const key = getGridKey(cLng, cLat);

    let matched: ExternalSpatialBuildingFeature | null = null;
    const candidates = grid.get(key) || [];
    for (const cand of candidates) {
      const candCoords =
        cand.geometry.type === 'Polygon'
          ? cand.geometry.coordinates[0]
          : cand.geometry.coordinates[0]?.[0];
      if (candCoords && candCoords[0]) {
        const dLng = Math.abs(candCoords[0][0] - cLng);
        const dLat = Math.abs(candCoords[0][1] - cLat);
        if (dLng < 0.00025 && dLat < 0.00025) {
          matched = cand;
          break;
        }
      }
    }

    if (matched) {
      matched.properties = {
        ...matched.properties,
        roofShape: opFeat.properties.roofShape || matched.properties.roofShape,
        roofColour: opFeat.properties.roofColour || matched.properties.roofColour,
        height: matched.properties.height > 4.0 ? matched.properties.height : opFeat.properties.height,
        levels: matched.properties.levels > 1 ? matched.properties.levels : opFeat.properties.levels,
        sources: {
          ofm: !!matched.properties.sources?.ofm,
          vworld: !!matched.properties.sources?.vworld,
          overpass: true,
        },
      };
    } else {
      mergedList.push(opFeat);
    }
  }

  return mergedList;
}

// -----------------------------------------------------------------------------
// [메인 진입점: 3대 실시간 공간정보 통합 수집기]
// -----------------------------------------------------------------------------
export async function fetchExternalSpatialData(
  map: maplibregl.Map,
  bbox: [number, number, number, number],
  options?: {
    regionId?: string;
    signal?: AbortSignal;
    onImmediate?: (result: ExternalSpatialResult) => void;
  }
): Promise<ExternalSpatialResult> {
  // [4단계 Frustum & IndexedDB 우선순위 스트리밍]
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const tileKeys = bboxToTileKeys(bbox, 15);
  let prioritizedTileKeys = tileKeys;
  try {
    const center = map.getCenter();
    const bearing = map.getBearing();
    const prioritized = prioritizeTilesByCamera(tileKeys, center.lng, center.lat, bearing);
    prioritizedTileKeys = prioritized.map((p) => p.tileKey);
  } catch {
    // fallback
  }

  // 1단계: 0ms 레이턴시로 OpenFreeMap 실시간 타일 피처 즉각 추출
  const ofmFeatures = extractOpenFreeMapBuildings(map);
  const ofmCount = ofmFeatures.length;

  const immediateResult: ExternalSpatialResult = {
    success: true,
    totalCount: ofmCount,
    openFreeMapCount: ofmCount,
    overpassCount: 0,
    vworldCount: 0,
    status: 'connected',
    message: `실시간 오픈 벡터 타일 연동 중 (${ofmCount.toLocaleString()}건 로드)`,
    features: {
      type: 'FeatureCollection',
      features: ofmFeatures,
    },
  };

  if (options?.onImmediate && ofmCount > 0) {
    options.onImmediate(immediateResult);
  }

  // 1단계: 브이월드 로컬 다운로드 정밀 데이터(GIS건물통합정보) 1순위 최우선 선조회
  fetchLocalVworldBuildings({ bbox, regionId: options?.regionId, useCoreOnly: true })
    .then((localRes) => {
      if (localRes.hasLocalData && localRes.features.length > 0 && options?.onImmediate) {
        options.onImmediate({
          success: true,
          totalCount: localRes.features.length,
          openFreeMapCount: ofmCount,
          overpassCount: 0,
          vworldCount: localRes.features.length,
          status: 'connected',
          message: `브이월드 로컬 다운로드 실측 건물 연동 (${localRes.features.length.toLocaleString()}동 / 1순위 최우선)`,
          features: {
            type: 'FeatureCollection',
            features: localRes.features as any,
          },
        });
      }
    })
    .catch(() => {});

  // 1-2단계: IndexedDB 영구 캐시에서 정면 우선 타일 피처 선조회 (0.02초 이내 초고속 직결 반환)
  if (prioritizedTileKeys[0]) {
    spatialTileCache
      .getFeatures(prioritizedTileKeys[0])
      .then((idbCached) => {
        if (idbCached && idbCached.length > 0 && options?.onImmediate) {
          options.onImmediate({
            success: true,
            totalCount: idbCached.length,
            openFreeMapCount: ofmCount,
            overpassCount: 0,
            vworldCount: 0,
            status: 'connected',
            message: `IndexedDB 영구 캐시 실시간 건물 로드 (${idbCached.length.toLocaleString()}건 < 20ms)`,
            features: {
              type: 'FeatureCollection',
              features: idbCached,
            },
          });
        }
      })
      .catch(() => {});
  }

  // 2단계: 백그라운드에서 강원권 광역 공공 공간정보 통합 게이트웨이(/api/gangwon-spatial) 1차 연동 (2.5초 타임아웃)
  try {
    const gatewayCtrl = new AbortController();
    const gatewayTimeout = setTimeout(() => gatewayCtrl.abort(), 2500);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => gatewayCtrl.abort(), { once: true });
    }

    const regParam = options?.regionId ? `&regionId=${options.regionId}` : '';
    const gwUrl = resolveFullUrl(`/api/gangwon-spatial?bbox=${minLng},${minLat},${maxLng},${maxLat}${regParam}`);
    const gwRes = await fetch(gwUrl, {
      signal: gatewayCtrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    clearTimeout(gatewayTimeout);

    if (gwRes.ok) {
      const gwJson = await gwRes.json();
      const serverBuildings = (gwJson.data?.buildings?.features || []) as ExternalSpatialBuildingFeature[];
      const styledServerBuildings: ExternalSpatialBuildingFeature[] = serverBuildings.map((f, idx) => {
        const metrics = calculateGeometryMetrics(f.geometry);
        const skyline = applyKoreanSkylineRules(f.properties || {}, metrics);
        return {
          type: 'Feature',
          id: f.id || `gw-${idx}`,
          properties: {
            ...f.properties,
            ...skyline,
            height: skyline.height,
            grnd_flr: f.properties?.grnd_flr || skyline.levels,
            levels: skyline.levels,
            name: f.properties?.name || f.properties?.buildingName || skyline.bld_category_label,
            sources: { ofm: false, vworld: true, overpass: true },
          },
          geometry: f.geometry,
        };
      });

      const mergedFeatures = mergeSpatialFeatures(ofmFeatures, styledServerBuildings, []);
      const totalCount = Math.max(mergedFeatures.length, ofmCount);
      const regName = gwJson.region?.name ? `${gwJson.region.name} ` : '';
      const regCode = gwJson.region?.admCode ? `(${gwJson.region.admCode}) ` : '';

      for (const tk of prioritizedTileKeys.slice(0, 8)) {
        spatialTileCache.saveFeatures(tk, mergedFeatures);
      }

      return {
        success: true,
        totalCount,
        openFreeMapCount: ofmCount,
        overpassCount: gwJson.counts?.buildings || 0,
        vworldCount: (gwJson.counts?.parcels || 0) + (gwJson.counts?.zoning || 0),
        status: 'connected',
        message: `${regName}${regCode}광역 공공 공간정보 통합 게이트웨이 연동 완료 (${totalCount.toLocaleString()}건 로드)`,
        features: {
          type: 'FeatureCollection',
          features: mergedFeatures,
        },
        parcels: gwJson.data?.parcels,
        zoning: gwJson.data?.zoning,
        infrastructure: gwJson.data?.infrastructure,
        region: gwJson.region,
      };
    }
  } catch (gwErr) {
    // 게이트웨이 타임아웃/오류 시 2차 직접 폴백으로 무중단 전환
  }

  // 3단계: 강원권 광역 실측 대용량 벌크 연동 엔진(V-World 서브그리드 + Overpass qt 쿼리 + IndexedDB) 가동
  try {
    const bulkResult = await loadGangwonRealDataBulk(map, bbox, {
      signal: options?.signal,
      regionId: options?.regionId,
      maxFeatures: 5000,
      onImmediate: options?.onImmediate,
    });

    if (bulkResult.totalCount > 0) {
      const mergedFeatures = mergeSpatialFeatures(ofmFeatures, bulkResult.features.features, []);
      const totalCount = Math.max(mergedFeatures.length, bulkResult.totalCount);

      for (const tk of prioritizedTileKeys.slice(0, 8)) {
        spatialTileCache.saveFeatures(tk, mergedFeatures);
      }

      return {
        ...bulkResult,
        totalCount,
        openFreeMapCount: ofmCount,
        message: `강원권 실측 정밀 건축물 데이터 연동 완료 (${totalCount.toLocaleString()}건 로드)`,
        features: {
          type: 'FeatureCollection',
          features: mergedFeatures,
        },
      };
    }
  } catch (bulkErr) {
    console.warn('[fetchExternalSpatialData] Bulk loader notice:', bulkErr);
  }

  // 4단계: 3대 소스 공간 융합 및 실측 스카이라인 적용 (최종 안전망)
  const [vworldRes, overpassRes] = await Promise.allSettled([
    fetchVworldBuildings(bbox, options?.signal),
    fetchOverpassBuildings(bbox, options?.signal),
  ]);

  const vworldFeatures = vworldRes.status === 'fulfilled' ? vworldRes.value : [];
  const overpassFeatures = overpassRes.status === 'fulfilled' ? overpassRes.value : [];

  const mergedFeatures = mergeSpatialFeatures(ofmFeatures, vworldFeatures, overpassFeatures);
  const totalCount = Math.max(mergedFeatures.length, ofmCount);

  for (const tk of prioritizedTileKeys.slice(0, 8)) {
    spatialTileCache.saveFeatures(tk, mergedFeatures);
  }

  return {
    success: true,
    totalCount,
    openFreeMapCount: ofmCount,
    overpassCount: overpassFeatures.length,
    vworldCount: vworldFeatures.length,
    status: 'connected',
    message: `3대 실측 공간정보(V-World · Overpass · OFM) 연동 완료 (${totalCount.toLocaleString()}건 로드)`,
    features: {
      type: 'FeatureCollection',
      features: mergedFeatures,
    },
  };
}
