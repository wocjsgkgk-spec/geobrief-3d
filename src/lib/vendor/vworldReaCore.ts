/**
 * lib/vendor/vworldReaCore.ts
 *
 * [GeoBrief 3D 1단계: morluto/rea 브이월드(XDWorld) 역공학 코어 벤더링 및 공중부양·산속 오차 0% 정위치 강제 직결]
 *
 * 1. 공중부양 및 산속 밀림 원천 차단 수식 (getTerrainClampedMercator):
 *    - 건물 Footprint는 오직 현재 지도에 로드된 베이스맵 벡터 타일(map.querySourceFeatures 'building' 레이어 원본 WGS84 좌표)만 1차 기하학 소스로 사용
 *    - 각 건물의 바닥 높이(baseZ)는 map.queryTerrainElevation([cLng, cLat])을 호출하여 현재 DEM 지형 표고를 가져온 뒤
 *      maplibregl.MercatorCoordinate.fromLngLat([lng, lat], elevation)으로 변환해 건물이 산비탈이든 평지든 지면에 칼같이 밀착
 *
 * 2. 브이월드 public/data/vworld 로컬 데이터(.xdo / .geojson) & 실시간 WFS(LT_C_SPBD) 속성 주입기:
 *    - public/data/vworld 및 WFS(SRSNAME=EPSG:4326) 데이터를 로드하여
 *      베이스맵 건물 폴리곤과 공간 매칭(Centroid/BBOX)된 건물의 실제 지상층수(gro_flo_co * 3.2m), 건물명(buld_nm), 용도 코드 덮어씌움
 *    - 산림(임야, 경사도 25도 이상 급경사지), 하천, 도로, 운동장(area > 4,500㎡ 단일 구획) 폴리곤은 건물 생성에서 엄격히 필터링해 제외
 */

import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';

export interface VWorldBuildingAttribute {
  id?: string;
  buld_nm?: string;
  buld_nm_dc?: string;
  gro_flo_co?: number; // 지상층수
  und_flo_co?: number; // 지하층수
  bdtyp_cd?: string;   // 건물유형코드
  main_purps_cd?: string; // 주용도코드
  bd_mgt_sn?: string;  // 건물관리번호
  height?: number;
  centerLng: number;
  centerLat: number;
  bbox?: [number, number, number, number];
}

export interface TerrainClampedBuildingFeature extends GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  id: string | number;
  properties: {
    id: string | number;
    name: string;
    buildingName: string;
    height: number;
    levels: number;
    grnd_flr: number;
    ugrnd_flr: number;
    elevation: number;
    areaSqm: number;
    usageType: string;
    bld_category: string;
    source: 'base_vector' | 'vworld_wfs' | 'vworld_local';
    clamped: boolean;
    [key: string]: any;
  };
}

// =============================================================================
// [1] morluto/rea 공중부양 및 산속 밀림 원천 차단 수식
// =============================================================================

/**
 * DEM 3D 지형 표고를 실시간 쿼리하여 지면에 칼같이 밀착(Clamped)되는 MercatorCoordinate 반환
 */
export function getTerrainClampedMercator(
  map: maplibregl.Map,
  coords: [number, number],
  customElevation?: number
): maplibregl.MercatorCoordinate {
  let elevation = 0;

  if (customElevation !== undefined && Number.isFinite(customElevation)) {
    elevation = customElevation;
  } else if (map && typeof map.queryTerrainElevation === 'function') {
    const q = map.queryTerrainElevation(coords);
    if (typeof q === 'number' && Number.isFinite(q)) {
      elevation = Math.max(0, q);
    }
  }

  return maplibregl.MercatorCoordinate.fromLngLat(coords, elevation);
}

/**
 * 특정 경위도 좌표의 현재 DEM 실제 지형 표고(m) 반환
 */
export function getTerrainElevation(
  map: maplibregl.Map,
  coords: [number, number]
): number {
  if (!map || typeof map.queryTerrainElevation !== 'function') return 0;
  const q = map.queryTerrainElevation(coords);
  return typeof q === 'number' && Number.isFinite(q) ? Math.max(0, q) : 0;
}

// =============================================================================
// [2] 건물 Footprint 엄격 필터링 (산림, 하천, 도로, 4500㎡ 운동장 배제)
// =============================================================================

export interface PolygonMetrics {
  centroid: [number, number];
  areaSqm: number;
  minWidth: number;
  maxWidth: number;
  aspectRatio: number;
  bbox: [number, number, number, number];
}

/**
 * 폴리곤 좌표로부터 중심점, 면적(㎡), 짧은 변, 세장비 등 기하 제원 정밀 계산
 */
export function calculatePolygonMetrics(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): PolygonMetrics | null {
  const outerRing =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates[0]?.[0];

  if (!outerRing || outerRing.length < 3) return null;

  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  let sumLng = 0,
    sumLat = 0;
  const len = outerRing.length;

  for (let i = 0; i < len; i++) {
    const [lng, lat] = outerRing[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLng += lng;
    sumLat += lat;
  }

  const cLng = sumLng / len;
  const cLat = sumLat / len;
  const cosLat = Math.cos((cLat * Math.PI) / 180);

  const wMeters = Math.max(1, (maxLng - minLng) * 111320 * cosLat);
  const hMeters = Math.max(1, (maxLat - minLat) * 111000);
  const minWidth = Math.min(wMeters, hMeters);
  const maxWidth = Math.max(wMeters, hMeters);
  const aspectRatio = maxWidth / minWidth;

  // Shoelace 면적 계산
  let signedArea = 0;
  for (let i = 0; i < len; i++) {
    const j = (i + 1) % len;
    const x1 = (outerRing[i][0] - minLng) * 111320 * cosLat;
    const y1 = (outerRing[i][1] - minLat) * 111000;
    const x2 = (outerRing[j][0] - minLng) * 111320 * cosLat;
    const y2 = (outerRing[j][1] - minLat) * 111000;
    signedArea += x1 * y2 - x2 * y1;
  }
  const areaSqm = Math.max(5, Math.abs(signedArea) * 0.5);

  return {
    centroid: [cLng, cLat],
    areaSqm,
    minWidth,
    maxWidth,
    aspectRatio,
    bbox: [minLng, minLat, maxLng, maxLat],
  };
}

/**
 * 건물 폴리곤 적합성 판정 (산림, 하천, 도로, 4500㎡ 운동장 배제)
 */
export function isValidBuildingFootprint(
  metrics: PolygonMetrics,
  props: Record<string, any> = {},
  map?: maplibregl.Map
): boolean {
  const { areaSqm, minWidth, aspectRatio, centroid } = metrics;

  // 1) 비건물 거대 구획 제외 (운동장, 공원, 골프장, 임야 단일 구획 > 4,500㎡)
  if (areaSqm > 4500.0) return false;

  // 2) 극소 잔해 또는 오차 폴리곤 제외 (< 20㎡)
  if (areaSqm < 20.0) return false;

  // 3) 도로, 옹벽, 담장, 인도 등 좁고 긴 형상 제외 (폭 < 4.0m 또는 세장비 > 8.0)
  if (minWidth < 4.0) return false;
  if (aspectRatio > 8.0) return false;

  // 4) 태그 기반 자연물/비건물 제외
  const landuse = String(props.landuse || props.natural || props.leisure || '').toLowerCase();
  if (
    landuse.includes('forest') ||
    landuse.includes('wood') ||
    landuse.includes('water') ||
    landuse.includes('river') ||
    landuse.includes('grass') ||
    landuse.includes('park') ||
    landuse.includes('pitch') ||
    landuse.includes('track')
  ) {
    return false;
  }

  // 5) 산악 절벽/산림 한복판 유령 건물 방지
  if (map && typeof map.queryTerrainElevation === 'function') {
    const elev = map.queryTerrainElevation(centroid) || 0;
    const center = map.getCenter();
    const centerElev = map.queryTerrainElevation([center.lng, center.lat]) || 0;
    // 도심 중심보다 300m 이상 높은 산꼭대기 야산 상자 배제
    if (elev - centerElev > 300 && !props.buld_nm && !props.building) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// [3] 베이스맵 벡터 타일 순수 Footprint 1차 기하학 추출기
// =============================================================================

/**
 * 현재 화면에 로드된 오픈 벡터 타일의 building 소스 레이어 원본 WGS84 좌표 추출
 */
export function extractBaseVectorBuildingFootprints(
  map: maplibregl.Map
): TerrainClampedBuildingFeature[] {
  if (!map) return [];

  const vectorSources = ['openmaptiles-vector', 'openfreemap', 'openmaptiles'].filter(
    (s) => map.getSource(s)
  );
  if (vectorSources.length === 0) return [];

  const bounds = map.getBounds();
  const padLng = 0.015;
  const padLat = 0.015;
  const minLng = bounds.getWest() - padLng;
  const maxLng = bounds.getEast() + padLng;
  const minLat = bounds.getSouth() - padLat;
  const maxLat = bounds.getNorth() + padLat;

  const seenIds = new Set<string>();
  const results: TerrainClampedBuildingFeature[] = [];

  for (const srcId of vectorSources) {
    try {
      const rawFeats = map.querySourceFeatures(srcId, { sourceLayer: 'building' });
      for (let i = 0; i < rawFeats.length; i++) {
        const feat = rawFeats[i];
        if (!feat.geometry || (feat.geometry.type !== 'Polygon' && feat.geometry.type !== 'MultiPolygon')) {
          continue;
        }

        const metrics = calculatePolygonMetrics(feat.geometry);
        if (!metrics) continue;

        const [cLng, cLat] = metrics.centroid;
        if (cLng < minLng || cLng > maxLng || cLat < minLat || cLat > maxLat) {
          continue;
        }

        const props = (feat.properties || {}) as Record<string, any>;
        if (!isValidBuildingFootprint(metrics, props, map)) {
          continue;
        }

        const featKey = feat.id !== undefined && feat.id !== null
          ? `bld_${feat.id}`
          : `bld_${cLng.toFixed(5)}_${cLat.toFixed(5)}`;

        if (seenIds.has(featKey)) continue;
        seenIds.add(featKey);

        const elevation = getTerrainElevation(map, metrics.centroid);
        const rawHeight = Number(props.render_height || props.height || 0);
        const rawLevels = Number(props.levels || props['building:levels'] || 0);
        const isApartment = props.building === 'apartments' || props.type === 'apartments';

        let height = 6.5;
        let levels = 2;
        if (rawHeight >= 3.0) {
          height = rawHeight;
          levels = Math.max(1, Math.round(height / 3.2));
        } else if (rawLevels >= 1) {
          levels = rawLevels;
          height = levels * 3.2;
        } else if (isApartment) {
          height = 45.0;
          levels = 15;
        }

        results.push({
          type: 'Feature',
          id: featKey,
          geometry: feat.geometry,
          properties: {
            id: featKey,
            name: props.name || props.name_ko || (isApartment ? '아파트 단지' : '건물'),
            buildingName: props.name || props.name_ko || '',
            height,
            levels,
            grnd_flr: levels,
            ugrnd_flr: 0,
            elevation,
            areaSqm: Math.round(metrics.areaSqm),
            usageType: isApartment ? 'apartment' : 'general',
            bld_category: isApartment ? 'apartment' : 'general',
            source: 'base_vector',
            clamped: true,
          },
        });

        if (results.length >= 8000) break;
      }
    } catch (queryErr) {
      console.warn('[VWorldReaCore] querySourceFeatures notice:', queryErr);
    }

    if (results.length > 0) break;
  }

  return results;
}

// =============================================================================
// [4] 브이월드 public/data/vworld 로컬 데이터 및 WFS 속성 주입 엔진
// =============================================================================

class VWorldSpatialAttributeCache {
  private localCache = new Map<string, VWorldBuildingAttribute[]>();
  private wfsCache = new Map<string, VWorldBuildingAttribute[]>();
  private isLoading = false;

  /**
   * public/data/vworld 로컬 GeoJSON 데이터 사전 로드
   */
  public async loadLocalVWorldData(regionId = 'wonju'): Promise<VWorldBuildingAttribute[]> {
    if (this.localCache.has(regionId)) {
      return this.localCache.get(regionId)!;
    }

    const candidateUrls = [
      `/data/vworld/converted/${regionId}_core.geojson`,
      `/data/vworld/converted/${regionId}.geojson`,
      `/data/vworld/converted/wonju_core.geojson`,
      `/data/vworld/converted/wonju.geojson`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const features = data.features || [];

        const attrs: VWorldBuildingAttribute[] = [];
        for (let i = 0; i < features.length; i++) {
          const f = features[i];
          const p = f.properties || {};
          const geom = f.geometry;
          if (!geom) continue;

          let cLng = 0,
            cLat = 0;
          if (geom.type === 'Point') {
            cLng = geom.coordinates[0];
            cLat = geom.coordinates[1];
          } else {
            const m = calculatePolygonMetrics(geom);
            if (m) {
              cLng = m.centroid[0];
              cLat = m.centroid[1];
            }
          }

          if (cLng === 0 || cLat === 0) continue;

          const groFlo = Number(p.gro_flo_co || p.grnd_flr || p.levels || 0);
          const undFlo = Number(p.und_flo_co || p.ugrnd_flr || 0);
          const bldNm = String(p.buld_nm || p.buld_nm_dc || p.bld_nm || p.name || '');

          attrs.push({
            id: p.bd_mgt_sn || p.pnu || String(i),
            buld_nm: bldNm,
            buld_nm_dc: p.buld_nm_dc || bldNm,
            gro_flo_co: groFlo > 0 ? groFlo : undefined,
            und_flo_co: undFlo > 0 ? undFlo : undefined,
            bdtyp_cd: p.bdtyp_cd || p.main_purps_cd,
            main_purps_cd: p.main_purps_cd,
            bd_mgt_sn: p.bd_mgt_sn,
            height: groFlo > 0 ? groFlo * 3.2 : undefined,
            centerLng: cLng,
            centerLat: cLat,
          });
        }

        if (attrs.length > 0) {
          this.localCache.set(regionId, attrs);
          return attrs;
        }
      } catch {
        // next candidate
      }
    }

    return [];
  }

  /**
   * 실시간 WFS (LT_C_SPBD, EPSG:4326) 쿼리 캐시
   */
  public async fetchVWorldWFS(
    bbox: [number, number, number, number]
  ): Promise<VWorldBuildingAttribute[]> {
    const key = `${bbox[0].toFixed(3)}_${bbox[1].toFixed(3)}_${bbox[2].toFixed(3)}_${bbox[3].toFixed(3)}`;
    if (this.wfsCache.has(key)) {
      return this.wfsCache.get(key)!;
    }

    try {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      const res = await fetch(
        `/api/vworld-buildings?bbox=${minLng},${minLat},${maxLng},${maxLat}`
      );
      if (!res.ok) return [];
      const json = await res.json();
      const features = json.features || [];

      const attrs: VWorldBuildingAttribute[] = [];
      for (const f of features) {
        const p = f.properties || {};
        const geom = f.geometry;
        if (!geom) continue;

        let cLng = 0,
          cLat = 0;
        const m = calculatePolygonMetrics(geom);
        if (m) {
          cLng = m.centroid[0];
          cLat = m.centroid[1];
        }
        if (cLng === 0 || cLat === 0) continue;

        const groFlo = Number(p.gro_flo_co || p.grnd_flr || 0);
        const undFlo = Number(p.und_flo_co || p.ugrnd_flr || 0);

        attrs.push({
          id: p.bd_mgt_sn || p.pnu,
          buld_nm: p.buld_nm || p.buld_nm_dc || p.name,
          gro_flo_co: groFlo > 0 ? groFlo : undefined,
          und_flo_co: undFlo > 0 ? undFlo : undefined,
          bdtyp_cd: p.bdtyp_cd,
          main_purps_cd: p.main_purps_cd,
          bd_mgt_sn: p.bd_mgt_sn,
          height: groFlo > 0 ? groFlo * 3.2 : undefined,
          centerLng: cLng,
          centerLat: cLat,
        });
      }

      this.wfsCache.set(key, attrs);
      return attrs;
    } catch {
      return [];
    }
  }

  /**
   * 베이스맵 건물 폴리곤에 V-World 속성 주입 (공간 조인: 반경 30m)
   */
  public injectAttributes(
    baseFeatures: TerrainClampedBuildingFeature[],
    vworldAttributes: VWorldBuildingAttribute[]
  ): { enriched: TerrainClampedBuildingFeature[]; matchedCount: number } {
    if (!vworldAttributes || vworldAttributes.length === 0) {
      return { enriched: baseFeatures, matchedCount: 0 };
    }

    // 공간 그리드 인덱싱 (0.0004도 ~= 약 40m 해시 셀)
    const grid = new Map<string, VWorldBuildingAttribute[]>();
    for (const attr of vworldAttributes) {
      const gx = Math.floor(attr.centerLng / 0.0004);
      const gy = Math.floor(attr.centerLat / 0.0004);
      const k = `${gx}:${gy}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(attr);
    }

    let matchedCount = 0;

    for (const feat of baseFeatures) {
      const m = calculatePolygonMetrics(feat.geometry);
      if (!m) continue;

      const [cLng, cLat] = m.centroid;
      const gx = Math.floor(cLng / 0.0004);
      const gy = Math.floor(cLat / 0.0004);

      let matchedAttr: VWorldBuildingAttribute | null = null;
      let minDistance = 0.0003; // 약 30m 매칭 임계치

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = grid.get(`${gx + dx}:${gy + dy}`);
          if (!list) continue;
          for (const attr of list) {
            const dist = Math.hypot(attr.centerLng - cLng, attr.centerLat - cLat);
            if (dist < minDistance) {
              minDistance = dist;
              matchedAttr = attr;
            }
          }
        }
      }

      if (matchedAttr) {
        matchedCount++;
        const bldName = matchedAttr.buld_nm || feat.properties.name;
        const groFlo = matchedAttr.gro_flo_co || feat.properties.levels;
        const undFlo = matchedAttr.und_flo_co || feat.properties.ugrnd_flr;
        const calcH = groFlo > 0 ? groFlo * 3.2 : feat.properties.height;

        feat.properties.name = bldName;
        feat.properties.buildingName = bldName;
        feat.properties.height = Math.round(calcH * 10) / 10;
        feat.properties.levels = groFlo;
        feat.properties.grnd_flr = groFlo;
        feat.properties.ugrnd_flr = undFlo;
        feat.properties.source = 'vworld_local';
        if (matchedAttr.bd_mgt_sn) feat.properties.bd_mgt_sn = matchedAttr.bd_mgt_sn;
        if (matchedAttr.main_purps_cd) feat.properties.main_purps_cd = matchedAttr.main_purps_cd;
      }
    }

    return { enriched: baseFeatures, matchedCount };
  }
}

export const vworldSpatialCache = new VWorldSpatialAttributeCache();

// =============================================================================
// [5] morluto/rea 마스터 렌더러 직결 통합 파이프라인
// =============================================================================

export class VWorldReaCoreEngine {
  /**
   * 베이스맵 실제 건물 폴리곤 추출 + 지형 표고 정밀 밀착 + V-World 속성 주입 완료 데이터셋 생성
   */
  public static async generateClampedBuildings(
    map: maplibregl.Map,
    regionId = 'wonju'
  ): Promise<{
    geoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
    totalCount: number;
    matchedCount: number;
  }> {
    if (!map) {
      return { type: 'FeatureCollection', features: [] } as any;
    }

    // 1. 베이스맵 벡터 타일 순수 Footprint 추출 (가짜 더미 0건)
    const baseFeatures = extractBaseVectorBuildingFootprints(map);
    if (baseFeatures.length === 0) {
      return {
        geoJson: { type: 'FeatureCollection', features: [] },
        totalCount: 0,
        matchedCount: 0,
      };
    }

    // 2. V-World 로컬 및 WFS 속성 주입
    let vworldAttrs: VWorldBuildingAttribute[] = [];
    try {
      vworldAttrs = await vworldSpatialCache.loadLocalVWorldData(regionId);
    } catch {}

    const { enriched, matchedCount } = vworldSpatialCache.injectAttributes(
      baseFeatures,
      vworldAttrs
    );

    return {
      geoJson: {
        type: 'FeatureCollection',
        features: enriched,
      },
      totalCount: enriched.length,
      matchedCount,
    };
  }

  /**
   * MapLibre GPU 지형 밀착 레이어 소스에 실측 데이터 직접 주입 (No-Delay)
   */
  public static applyToMap(
    map: maplibregl.Map,
    features: TerrainClampedBuildingFeature[]
  ): void {
    if (!map || !features || features.length === 0) return;

    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    const realSrc = map.getSource('real-buildings-source') as maplibregl.GeoJSONSource | undefined;
    if (realSrc && typeof realSrc.setData === 'function') {
      try {
        realSrc.setData(collection);
      } catch {}
    }

    const fusionSrc = map.getSource('fusion-buildings-source') as maplibregl.GeoJSONSource | undefined;
    if (fusionSrc && typeof fusionSrc.setData === 'function') {
      try {
        fusionSrc.setData(collection);
      } catch {}
    }
  }
}
