/**
 * spatialDataFetcher.ts
 *
 * [1단계: 멀티 공간정보 API(OpenFreeMap + Overpass API + V-World) 3중 하이브리드 수집 파이프라인]
 * 1) 1차 실시간 벡터 소스: OpenFreeMap(https://tiles.openfreemap.org/planet) 무인증 글로벌 벡터 타일(building & transportation)
 * 2) 2차 정밀 속성 보강: Overpass API(https://overpass-api.de/api/interpreter) 실시간 층수(building:levels), 높이(height), 지붕형태(roof:shape), 차선수(lanes)
 * 3) 3차 브이월드/국토부 결합: V-World WFS 실측 필지·건축물대장 층고 데이터 결합 및 뷰포트 건물 로드 수 정밀 카운팅
 */

import type maplibregl from 'maplibre-gl';
import { fetchFusionBuildings, FusionBuildingsFetchResult } from '@/services/fusionBuildingsService';

export interface SpatialBuildingProperties {
  id?: string | number;
  name: string;
  buildingName?: string;
  height: number;
  levels: number;
  roofShape: string;
  roofColour?: string;
  usageType: 'residential' | 'commercial' | 'public' | 'military' | 'general' | 'apartment';
  isMilitaryOrPublic: boolean;
  color: string;
  bld_category: string;
  source: 'openfreemap' | 'overpass' | 'vworld' | 'fusion';
  lanes?: number;
}

export interface SpatialDataFetchResult {
  success: boolean;
  totalCount: number;
  openFreeMapCount: number;
  overpassCount: number;
  vworldCount: number;
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
  features: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  overpassRoadsCount: number;
}

/**
 * 뷰포트 내 MapLibre 렌더링 벡터 타일(OpenFreeMap 'openmaptiles-vector')의 건물 객체 추출 및 중복 제거
 */
export function extractRenderedVectorBuildings(
  map: maplibregl.Map
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] {
  if (!map) return [];

  try {
    const targetLayers = ['3d-buildings', '3d-buildings-roof', 'fusion-buildings-3d', 'fusion-buildings-roof'].filter((l) => map.getLayer(l));
    let rendered: (maplibregl.MapGeoJSONFeature | maplibregl.GeoJSONFeature)[] = [];
    if (targetLayers.length > 0) {
      try {
        rendered = map.queryRenderedFeatures(undefined, { layers: targetLayers });
      } catch {
        // ignore
      }
    }

    if ((!rendered || rendered.length === 0) && map.getSource('openmaptiles-vector')) {
      try {
        rendered = map.querySourceFeatures('openmaptiles-vector', {
          sourceLayer: 'building',
        });
      } catch {
        // ignore
      }
    }

    const seen = new Set<string>();
    const uniqueFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];

    for (const feat of rendered) {
      if (!feat.geometry || (feat.geometry.type !== 'Polygon' && feat.geometry.type !== 'MultiPolygon')) {
        continue;
      }

      // 고유 키 (id 또는 첫 좌표쌍)
      const key = feat.id !== undefined && feat.id !== null
        ? String(feat.id)
        : JSON.stringify(
            feat.geometry.type === 'Polygon'
              ? feat.geometry.coordinates[0]?.[0]
              : feat.geometry.coordinates[0]?.[0]?.[0]
          );

      if (seen.has(key)) continue;
      seen.add(key);

      const props = feat.properties || {};
      const name = String(props.name || props.name_ko || props.buld_nm || props.buildingName || '');
      const usageType = String(props.type || props.class || props.building || props.usageType || props.bld_category || 'general').toLowerCase();

      // 건물 면적 및 종횡비 계산으로 누락된 층고/높이 지능형 복원
      let approxArea = 0;
      let aspectRatio = 1.0;
      if (feat.geometry.type === 'Polygon' && feat.geometry.coordinates[0]?.length >= 3) {
        const ring = feat.geometry.coordinates[0];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const pt of ring) {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
        const cosLat = Math.cos((((minY + maxY) * 0.5) * Math.PI) / 180);
        const wMeters = (maxX - minX) * 111319.5 * cosLat;
        const hMeters = (maxY - minY) * 111319.5;
        approxArea = Math.max(10, wMeters * hMeters);
        const maxD = Math.max(wMeters, hMeters);
        const minD = Math.max(1, Math.min(wMeters, hMeters));
        aspectRatio = maxD / minD;
      }

      const isApartment = name.includes('아파트') || usageType.includes('apartment') || (aspectRatio >= 1.6 && approxArea >= 350);
      const isCommercial = name.includes('타워') || name.includes('빌딩') || name.includes('센터') || usageType.includes('commercial') || usageType.includes('office') || approxArea >= 600;

      const rawFlr = Number(
        props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || props.levels || 0
      );
      const rawHei = Number(
        props.hei || props.HEI || props.render_height || props.height || props.bld_hgt || 0
      );

      let renderHeight = rawHei > 0 ? rawHei : (rawFlr > 0 ? rawFlr * 3.2 : 0);

      if (!renderHeight || renderHeight <= 0) {
        if (isApartment) {
          // 판상형/타워형 아파트 단지: 15층~25층 (45m~75m)
          const seed = Math.abs(Math.sin(approxArea * 17.13 + (feat.id ? Number(feat.id) : 42))) % 1;
          const aptStories = Math.round(15 + seed * 10);
          renderHeight = aptStories * 3.0; // 45m ~ 75m
        } else if (isCommercial) {
          // 대로변 상업/업무 빌딩: 4층~8층 (15m~28m)
          const seed = Math.abs(Math.sin(approxArea * 23.41 + 19)) % 1;
          const commStories = Math.round(4 + seed * 4);
          renderHeight = commStories * 3.5; // 14m ~ 28m
        } else {
          // 일반 주택 및 군 막사: 1층~3층 (4m~10m)
          if (approxArea < 120) {
            renderHeight = 4.0; // 1층 (4m)
          } else if (approxArea < 240) {
            renderHeight = 7.0; // 2층 (7m)
          } else {
            renderHeight = 10.0; // 3층 (10m)
          }
        }
      }

      const levels = Math.max(1, Math.round(renderHeight / 3.0));

      uniqueFeatures.push({
        type: 'Feature',
        id: feat.id || `ofm-bld-${uniqueFeatures.length}`,
        properties: {
          ...props,
          name: props.name || props.name_ko || '건축물',
          buildingName: props.name || props.name_ko || '',
          height: renderHeight,
          levels,
          roofShape: props['roof:shape'] || props.roof_shape || 'flat',
          roofColour: props['roof:colour'] || '#334155',
          usageType: isApartment ? 'apartment' : (props.type || props.class || 'general').toLowerCase() as any,
          isMilitaryOrPublic: false,
          color: '#F1F5F9',
          bld_category: isApartment ? 'apartment' : (props.class || 'building'),
          source: 'openfreemap',
        },
        geometry: feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      });
    }

    return uniqueFeatures;
  } catch (err) {
    console.warn('[spatialDataFetcher] queryRenderedFeatures notice:', err);
    return [];
  }
}

// Overpass API 응답 캐시 (60초 유지, Rate-limit 방어)
const overpassCache = new Map<string, { timestamp: number; data: any }>();

/**
 * 2차: Overpass API 실시간 쿼리 (건물 층수, 높이, 지붕형태, 도로 차선수 수집)
 */
export async function fetchOverpassEnrichment(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<{
  buildingTags: Map<string, { levels?: number; height?: number; roofShape?: string; roofColour?: string }>;
  overpassFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  roadLanesMap: Map<string, number>;
}> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cacheKey = `${minLng.toFixed(3)}_${minLat.toFixed(3)}_${maxLng.toFixed(3)}_${maxLat.toFixed(3)}`;
  const cached = overpassCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.data;
  }

  const buildingTags = new Map<string, { levels?: number; height?: number; roofShape?: string; roofColour?: string }>();
  const overpassFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  const roadLanesMap = new Map<string, number>();

  const ql = `[out:json][timeout:5];
(
  way["building"](${minLat},${minLng},${maxLat},${maxLng});
  way["highway"](${minLat},${minLng},${maxLat},${maxLng});
);
out geom 350;`;

  const endpoints = [
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
    `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(ql)}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const data = await res.json();
      const elements = data.elements || [];

      for (const el of elements) {
        if (!el.tags) continue;
        const t = el.tags;

        // 1) 도로 차선수 파싱
        if (t.highway) {
          const lanes = t.lanes ? parseInt(t.lanes, 10) : undefined;
          const roadName = (t.name || t['name:ko'] || '').trim().toLowerCase();
          if (roadName && lanes && !isNaN(lanes)) {
            roadLanesMap.set(roadName, lanes);
          }
        }

        // 2) 건물 속성 파싱
        if (t.building) {
          const bldName = (t.name || t['name:ko'] || '').trim().toLowerCase();
          const roofShape = t['roof:shape'] || t['building:roof:shape'];
          const roofColour = t['roof:colour'] || t['roof:color'];
          const levels = t['building:levels'] ? parseInt(t['building:levels'], 10) : undefined;
          const height = t.height ? parseFloat(t.height) : undefined;

          if (bldName) {
            buildingTags.set(bldName, {
              levels: isNaN(levels as number) ? undefined : levels,
              height: isNaN(height as number) ? undefined : height,
              roofShape,
              roofColour,
            });
          }

          // 지오메트리 폴리곤 구성
          if (Array.isArray(el.geometry) && el.geometry.length >= 3) {
            const ring: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              ring.push([first[0], first[1]]);
            }

            const calcH = height || (levels ? levels * 3.2 : 12);

            overpassFeatures.push({
              type: 'Feature',
              id: `op-${el.id || overpassFeatures.length}`,
              properties: {
                name: t.name || t['name:ko'] || '건축물',
                buildingName: t.name || t['name:ko'] || '',
                height: calcH,
                levels: levels || Math.round(calcH / 3.2),
                roofShape: roofShape || 'flat',
                roofColour: roofColour || '#334155',
                usageType: (t['building:use'] || t.building || 'general').toLowerCase() as any,
                isMilitaryOrPublic: false,
                color: '#F1F5F9',
                bld_category: t.building || 'building',
                source: 'overpass',
              },
              geometry: {
                type: 'Polygon',
                coordinates: [ring],
              },
            });
          }
        }
      }

      // 성공적으로 데이터를 수신했으면 대체 엔드포인트 호출 중단
      break;
    } catch {
      // 엔드포인트 실패 시 다음 미러로 안전 폴백
    }
  }

  const resObj = { buildingTags, overpassFeatures, roadLanesMap };
  overpassCache.set(cacheKey, { timestamp: Date.now(), data: resObj });
  return resObj;
}

/**
 * 3중 데이터 수집 파이프라인 통합 실행 (OpenFreeMap + Overpass + V-World/국토교통부)
 */
export async function fetchHybridSpatialBuildings(
  map: maplibregl.Map,
  bbox: [number, number, number, number],
  options?: { signal?: AbortSignal }
): Promise<SpatialDataFetchResult> {
  // 1단계: OpenFreeMap 실시간 렌더링 벡터 타일 건물 추출
  const ofmFeatures = extractRenderedVectorBuildings(map);
  const ofmCount = ofmFeatures.length;

  // 2단계 & 3단계 병렬 실행 (Overpass 속성 보강 + 브이월드/국토부 융합 API)
  const [overpassRes, fusionRes] = await Promise.allSettled([
    fetchOverpassEnrichment(bbox, options?.signal),
    fetchFusionBuildings(bbox, options),
  ]);

  const overpass =
    overpassRes.status === 'fulfilled'
      ? overpassRes.value
      : { buildingTags: new Map(), overpassFeatures: [], roadLanesMap: new Map() };

  const fusion: FusionBuildingsFetchResult =
    fusionRes.status === 'fulfilled'
      ? fusionRes.value
      : { success: false, status: 'error', featureCount: 0, message: '' };

  const vworldFeatures = fusion.features?.features || [];
  const vworldCount = vworldFeatures.length;
  const overpassCount = overpass.overpassFeatures.length;

  // 피처 컬렉션 통합 (V-World 우선 -> Overpass -> OpenFreeMap)
  const combinedMap = new Map<string, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>();

  // 1) OpenFreeMap 벡터 타일 기본 적재
  for (const f of ofmFeatures) {
    const key = String(f.id || f.properties?.name || JSON.stringify(f.geometry.coordinates[0]?.[0]));
    combinedMap.set(key, f);
  }

  // 2) Overpass API 정밀 지오메트리 & 속성 보강
  for (const f of overpass.overpassFeatures) {
    const key = String(f.id || f.properties?.name || JSON.stringify(f.geometry.coordinates[0]?.[0]));
    const existing = combinedMap.get(key);
    if (existing) {
      existing.properties = {
        ...existing.properties,
        ...f.properties,
        height: f.properties?.height || existing.properties?.height,
        roofShape: f.properties?.roofShape || existing.properties?.roofShape,
      };
    } else {
      combinedMap.set(key, f);
    }
  }

  // 3) V-World / 국토교통부 실측 대장 데이터 우선 병합
  for (const f of vworldFeatures) {
    const key = String(f.id || f.properties?.buildingName || JSON.stringify((f.geometry as any).coordinates[0]?.[0]));
    combinedMap.set(key, f as any);
  }

  const mergedFeatures = Array.from(combinedMap.values());
  const totalCount = Math.max(mergedFeatures.length, ofmCount, vworldCount);

  return {
    success: true,
    totalCount,
    openFreeMapCount: ofmCount,
    overpassCount,
    vworldCount,
    status: 'connected',
    message: `실시간 공간정보 연동 가동 중 (총 ${totalCount.toLocaleString()}건 로드 / OpenFreeMap · Overpass · V-World)`,
    features: {
      type: 'FeatureCollection',
      features: mergedFeatures,
    },
    overpassRoadsCount: overpass.roadLanesMap.size,
  };
}
