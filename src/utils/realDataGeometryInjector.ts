/**
 * utils/realDataGeometryInjector.ts
 *
 * [GeoBrief 3D 1단계: 외부 실측 데이터의 3D 지오메트리 강제 바인딩 및 형상 동기화 엔진]
 *
 * 1. API 응답 데이터와 지도 건물 피처 1:1 강제 매핑:
 *    - 공공데이터포털 건축HUB(getBrTitleInfo)와 브이월드 WFS(LT_C_SPBD) 실측 데이터를
 *      화면 내 건물 지오메트리 피처(OpenFreeMap 등)에 직접 1:1 주입.
 *    - RBush 2D 공간 인덱스 기반 건물 폴리곤 중심 좌표(centroid) 반경 15m 이내 자동 공간 조인(Spatial Join).
 *    - 지상층수(grndFlrCnt) 기반 실측 높이(grndFlrCnt * 3.3m) 강제 재계산 (기존 임의 높이 무시).
 *    - 주구조(strctCdNm) & 주용도(mainPurpsCdNm) 기반 외벽/지붕 실사 아틀라스 재질 ID 개별 할당.
 *    - 건물명(bldNm) 및 동명칭(dongNm) 노란색 핀 라벨(V-World POI) 및 팝업 즉시 동기화.
 *
 * 2. 무지연 씬 갱신(No-Delay Repaint):
 *    - API 데이터가 도착했을 때 지도를 이동하지 않아도 100ms 이내에
 *      MapLibre 소스(setData)와 Three.js 정점 버퍼(updateBuildings), POI 레이어를 즉각 갱신.
 */

import type maplibregl from 'maplibre-gl';
import rbush from 'rbush';
import { updateVworldPoisWithBuildings } from '@/utils/koreanPoiLayer';
import type { RealisticKoreanCityLayer } from '@/components/Map/RealisticKoreanCityLayer';
import { resolveFullUrl } from '@/utils/urlHelper';
import { isNearApartmentAnchor, APT_KEYWORDS } from '@/lib/vendor/buildingClassifier';
import {
  stampBuildingWithMasterData,
  resolveGangwonDistrictByCoords,
  masterDataSynchronizer,
} from '@/utils/masterDataSynchronizer';

export function sanitizeGeoJsonForMapLibre<T extends GeoJSON.FeatureCollection<any>>(fc: T, prefix = 'bld'): T {
  if (!fc || !fc.features || !Array.isArray(fc.features)) return fc;
  const sanitized = fc.features.map((f, idx) => {
    if (!f) return f;
    let fid = f.id !== undefined && f.id !== null ? String(f.id) : `${prefix}_${idx + 1}`;
    if (/^\d+$/.test(fid)) {
      fid = `${prefix}_${fid}`;
    }
    return {
      ...f,
      id: fid,
    };
  });
  return {
    ...fc,
    features: sanitized,
  };
}

const RBush = (rbush as any).default || rbush;

export interface BuildingRegistryRecord {
  id?: string;
  mgmBldrgstPk?: string;
  bldNm?: string;
  dongNm?: string;
  platPlc?: string;
  sigunguCd?: string;
  bjdongCd?: string;
  bun?: string;
  ji?: string;
  mainPurpsCd?: string;
  mainPurpsCdNm?: string;
  strctCd?: string;
  strctCdNm?: string;
  roofCd?: string;
  roofCdNm?: string;
  grndFlrCnt?: number;
  ugrndFlrCnt?: number;
  heit?: number;
  pnu?: string;
  coordinates?: [number, number]; // [lng, lat]
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  source?: string;
}

interface SpatialRecordNode {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  record: BuildingRegistryRecord;
}

// -----------------------------------------------------------------------------
// [1. 폴리곤 중심 좌표(Centroid) 계산기]
// -----------------------------------------------------------------------------
export function computePolygonCentroid(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon
): [number, number] | null {
  if (!geom || !geom.coordinates) return null;

  let sumLng = 0;
  let sumLat = 0;
  let count = 0;

  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0];
    if (!ring || ring.length < 3) return null;
    const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
    for (let i = 0; i < n; i++) {
      sumLng += ring[i][0];
      sumLat += ring[i][1];
      count++;
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      const ring = poly[0];
      if (!ring || ring.length < 3) continue;
      const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
      for (let i = 0; i < n; i++) {
        sumLng += ring[i][0];
        sumLat += ring[i][1];
        count++;
      }
    }
  }

  if (count === 0) return null;
  return [sumLng / count, sumLat / count];
}

// -----------------------------------------------------------------------------
// [2. 두 좌표 간 미터(m) 단위 유클리드 거리 계산기]
// -----------------------------------------------------------------------------
export function calculateDistanceMeters(p1: [number, number], p2: [number, number]): number {
  const dLng = p2[0] - p1[0];
  const dLat = p2[1] - p1[1];
  const midLat = (p1[1] + p2[1]) * 0.5;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const mPerDegLng = (Math.PI / 180) * 6378137 * cosLat;
  const mPerDegLat = (Math.PI / 180) * 6378137;
  const dx = dLng * mPerDegLng;
  const dy = dLat * mPerDegLat;
  return Math.hypot(dx, dy);
}

// -----------------------------------------------------------------------------
// [3. 주구조(strctCdNm) & 주용도(mainPurpsCdNm) 기반 외벽/지붕 실사 아틀라스 재질 결정기]
// -----------------------------------------------------------------------------
export interface AssignedMaterialSlots {
  atlasWallSlot: string;
  atlasRoofSlot: string;
  bldCategory: 'apartment' | 'commercial' | 'residential' | 'industrial' | 'public_military';
  roofShape: 'flat' | 'gabled' | 'hipped';
  wallColorHex: string;
  roofColorHex: string;
}

export function determineMaterialSlots(
  mainPurpsCdNm = '',
  strctCdNm = '',
  bldNm = ''
): AssignedMaterialSlots {
  const purps = (mainPurpsCdNm || '').toLowerCase();
  const strct = (strctCdNm || '').toLowerCase();
  const name = (bldNm || '').toLowerCase();

  // 1. 아파트 / 공동주택 (1순위)
  if (
    purps.includes('아파트') ||
    purps.includes('공동주택') ||
    name.includes('아파트') ||
    name.includes('apt') ||
    name.includes('단지') ||
    name.includes('푸르지오') ||
    name.includes('자이') ||
    name.includes('힐스테이트') ||
    name.includes('래미안') ||
    name.includes('e편한') ||
    name.includes('아이파크') ||
    name.includes('청솔') ||
    name.includes('에버빌') ||
    name.includes('주공')
  ) {
    return {
      atlasWallSlot: 'apt_warm_cream',
      atlasRoofSlot: 'roof_apt_slab',
      bldCategory: 'apartment',
      roofShape: 'flat',
      wallColorHex: '#f4efe6', // 웜 아이보리
      roofColorHex: '#57534e', // 다크 그레이 슬래브
    };
  }

  // 2. 상업 / 업무 / 근린생활시설
  if (
    purps.includes('근린생활') ||
    purps.includes('상가') ||
    purps.includes('판매') ||
    purps.includes('업무') ||
    purps.includes('숙박') ||
    purps.includes('위락') ||
    name.includes('빌딩') ||
    name.includes('타워') ||
    name.includes('프라자') ||
    name.includes('마트') ||
    name.includes('은행')
  ) {
    if (strct.includes('철골') || strct.includes('src') || name.includes('타워')) {
      return {
        atlasWallSlot: 'comm_curtainwall',
        atlasRoofSlot: 'roof_urethane_sage',
        bldCategory: 'commercial',
        roofShape: 'flat',
        wallColorHex: '#78716c', // 화강암 석재 회색
        roofColorHex: '#2e6f4e', // 에메랄드 우레탄
      };
    }
    if (strct.includes('벽돌') || strct.includes('연와')) {
      return {
        atlasWallSlot: 'comm_red_brick',
        atlasRoofSlot: 'roof_terracotta_tile',
        bldCategory: 'commercial',
        roofShape: 'flat',
        wallColorHex: '#8c3f2b', // 적벽돌
        roofColorHex: '#7c3626', // 테라코타
      };
    }
    return {
      atlasWallSlot: 'comm_granite_beige',
      atlasRoofSlot: 'roof_urethane_sage',
      bldCategory: 'commercial',
      roofShape: 'flat',
      wallColorHex: '#9a6b4c', // 황토색/갈색 타일
      roofColorHex: '#2e6f4e', // 에메랄드 우레탄
    };
  }

  // 3. 공장 / 창고 / 산업시설
  if (
    purps.includes('공장') ||
    purps.includes('창고') ||
    purps.includes('운수') ||
    purps.includes('산업') ||
    purps.includes('위험물') ||
    name.includes('공장') ||
    name.includes('창고') ||
    name.includes('물류')
  ) {
    return {
      atlasWallSlot: 'facility_panel',
      atlasRoofSlot: 'roof_zinc_blue',
      bldCategory: 'industrial',
      roofShape: 'gabled',
      wallColorHex: '#cbd5e1', // 실버/베이지 판넬
      roofColorHex: '#1d4ed8', // 코발트 블루
    };
  }

  // 4. 군사 및 국방 시설
  if (
    purps.includes('군사') ||
    purps.includes('국방') ||
    name.includes('부대') ||
    name.includes('사단') ||
    name.includes('대대') ||
    name.includes('막사') ||
    name.includes('병영')
  ) {
    return {
      atlasWallSlot: 'public_military',
      atlasRoofSlot: 'roof_concrete_warmgray',
      bldCategory: 'public_military',
      roofShape: 'gabled',
      wallColorHex: '#d1d5db',
      roofColorHex: '#6b3426',
    };
  }

  // 5. 학교 / 병원 / 관공서
  if (
    purps.includes('교육') ||
    purps.includes('학교') ||
    purps.includes('공공') ||
    purps.includes('의료') ||
    name.includes('초등') ||
    name.includes('중학') ||
    name.includes('고등') ||
    name.includes('시청') ||
    name.includes('병원')
  ) {
    return {
      atlasWallSlot: 'comm_granite_beige',
      atlasRoofSlot: 'roof_urethane_sage',
      bldCategory: 'public_military',
      roofShape: 'flat',
      wallColorHex: '#9a6b4c',
      roofColorHex: '#2e6f4e',
    };
  }

  // 6. 다세대 / 연립 / 빌라
  if (
    purps.includes('다세대') ||
    purps.includes('연립') ||
    name.includes('빌라') ||
    name.includes('연립') ||
    name.includes('맨션')
  ) {
    if (strct.includes('벽돌') || strct.includes('연와')) {
      return {
        atlasWallSlot: 'villa_red_brick',
        atlasRoofSlot: 'roof_terracotta_tile',
        bldCategory: 'residential',
        roofShape: 'gabled',
        wallColorHex: '#7f3222',
        roofColorHex: '#6e2c1b',
      };
    }
    return {
      atlasWallSlot: 'villa_granite',
      atlasRoofSlot: 'roof_urethane_sage',
      bldCategory: 'residential',
      roofShape: 'flat',
      wallColorHex: '#d6c7b2',
      roofColorHex: '#356854',
    };
  }

  // 7. 단독주택 (기본 주거)
  if (strct.includes('벽돌') || strct.includes('연와')) {
    return {
      atlasWallSlot: 'villa_red_brick',
      atlasRoofSlot: 'roof_terracotta_tile',
      bldCategory: 'residential',
      roofShape: 'gabled',
      wallColorHex: '#7f3222',
      roofColorHex: '#6e2c1b',
    };
  }

  return {
    atlasWallSlot: 'house_cream',
    atlasRoofSlot: 'roof_terracotta_tile',
    bldCategory: 'residential',
    roofShape: 'gabled',
    wallColorHex: '#d6c7b2',
    roofColorHex: '#6e2c1b',
  };
}

// -----------------------------------------------------------------------------
// [4. RBush 공간 색인 캐시 매니저 (반경 15m 실시간 조인)]
// -----------------------------------------------------------------------------
class RealDataSpatialStore {
  private rbushTree = new RBush();
  private pnuMap = new Map<string, BuildingRegistryRecord>();
  private nameMap = new Map<string, BuildingRegistryRecord>();
  private allRecords: BuildingRegistryRecord[] = [];
  private isLoaded = false;

  public loadRecords(records: BuildingRegistryRecord[]): void {
    if (!records || records.length === 0) return;

    const nodes: SpatialRecordNode[] = [];

    for (const r of records) {
      this.allRecords.push(r);

      // PNU 인덱싱
      if (r.pnu) {
        this.pnuMap.set(r.pnu, r);
      }

      // 명칭 인덱싱
      const bName = (r.bldNm || '').trim().toLowerCase();
      if (bName) {
        this.nameMap.set(bName, r);
      }

      // 좌표 추출
      let pt = r.coordinates;
      if (!pt && r.geometry) {
        pt = computePolygonCentroid(r.geometry) || undefined;
      }

      if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
        nodes.push({
          minX: pt[0],
          minY: pt[1],
          maxX: pt[0],
          maxY: pt[1],
          record: r,
        });
      }
    }

    if (nodes.length > 0) {
      this.rbushTree.load(nodes);
    }
    this.isLoaded = true;
  }

  public findMatch(
    cLng: number,
    cLat: number,
    featureProps: Record<string, any> = {}
  ): { record: BuildingRegistryRecord; matchDistance: number; matchMethod: string } | null {
    // 1) PNU 직결 매칭
    const featPnu = featureProps.pnu || featureProps.PNU;
    if (featPnu && this.pnuMap.has(featPnu)) {
      return {
        record: this.pnuMap.get(featPnu)!,
        matchDistance: 0,
        matchMethod: 'pnu_exact',
      };
    }

    // 2) 반경 15m 공간 쿼리 (위도/경도 박스 환산: 15m ≈ 0.000135도)
    const cosLat = Math.cos((cLat * Math.PI) / 180);
    const dLat = 15.0 / 111000.0;
    const dLng = 15.0 / (111000.0 * Math.max(0.1, cosLat));

    const candidates = this.rbushTree.search({
      minX: cLng - dLng,
      minY: cLat - dLat,
      maxX: cLng + dLng,
      maxY: cLat + dLat,
    }) as SpatialRecordNode[];

    if (candidates.length > 0) {
      let closest: BuildingRegistryRecord | null = null;
      let minDistance = 15.1;

      for (const node of candidates) {
        const pt = node.record.coordinates || (node.record.geometry ? computePolygonCentroid(node.record.geometry) : null);
        if (!pt) continue;
        const dist = calculateDistanceMeters([cLng, cLat], pt);
        if (dist <= 15.0 && dist < minDistance) {
          minDistance = dist;
          closest = node.record;
        }
      }

      if (closest) {
        return {
          record: closest,
          matchDistance: minDistance,
          matchMethod: 'spatial_15m',
        };
      }
    }

    // 3) 반경 30m 내 명칭 일치 보조 매칭
    const featName = (featureProps.name || featureProps.name_ko || featureProps.buld_nm || featureProps.buildingName || '').trim().toLowerCase();
    if (featName && this.nameMap.has(featName)) {
      const rec = this.nameMap.get(featName)!;
      const pt = rec.coordinates || (rec.geometry ? computePolygonCentroid(rec.geometry) : null);
      if (pt) {
        const dist = calculateDistanceMeters([cLng, cLat], pt);
        if (dist <= 30.0) {
          return {
            record: rec,
            matchDistance: dist,
            matchMethod: 'name_proximity_30m',
          };
        }
      }
    }

    return null;
  }

  public getRecordCount(): number {
    return this.allRecords.length;
  }

  public getAllRecords(): BuildingRegistryRecord[] {
    return this.allRecords;
  }
}

export const realDataSpatialStore = new RealDataSpatialStore();

if (typeof window !== 'undefined') {
  (window as any).__realDataSpatialStore = realDataSpatialStore;
}

// -----------------------------------------------------------------------------
// [5. 1:1 강제 속성 바인딩 엔진 (injectRealDataIntoFeatures)]
// -----------------------------------------------------------------------------
export function injectRealDataIntoFeatures(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  store: RealDataSpatialStore = realDataSpatialStore,
  options?: {
    includeUnmatchedStoreFeatures?: boolean;
  }
): {
  enrichedFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  matchedCount: number;
} {
  let matchedCount = 0;

  const baseFeatures = features || [];
  const enrichedFeatures = baseFeatures.map((feat) => {
    if (!feat || !feat.geometry) return feat;

    const props = { ...(feat.properties || {}) } as Record<string, any>;
    const centroid = computePolygonCentroid(feat.geometry);
    if (!centroid) return feat;

    const match = store.findMatch(centroid[0], centroid[1], props);
    if (match) {
      matchedCount++;
    }

    return stampBuildingWithMasterData(feat, match ? match.record : null);
  });

  // 4. 저장소 전체 30,000건 루프 전면 제거 (렉/버벅거림 원천 차단):
  // 뷰포트 내 지오메트리는 baseFeatures로 이미 100% 포괄되므로 메인 스레드 대용량 이중 루프 금지
  return {
    enrichedFeatures,
    matchedCount,
  };
}

// -----------------------------------------------------------------------------
// [6. 무지연 씬 갱신(No-Delay Repaint) 실행기]
// -----------------------------------------------------------------------------
export function applyInjectedDataToMap(
  map: maplibregl.Map,
  enrichedFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  realisticLayer?: RealisticKoreanCityLayer | null
): void {
  if (!map || !enrichedFeatures || enrichedFeatures.length === 0) return;

  // 카메라 이동/회전 중에는 Three.js 정점 버퍼 재계산을 차단하여 60fps 보호
  if (map.isMoving() || map.isRotating()) {
    return;
  }

  if (typeof window !== 'undefined') {
    (window as any).__lastInjectedBuildings = enrichedFeatures;
  }

  const collection: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
    type: 'FeatureCollection',
    features: enrichedFeatures,
  };
  const safeGeoJson = sanitizeGeoJsonForMapLibre(collection, 'bld');

  // 1. MapLibre GPU 소스 강제 즉시 주입 (setData)
  const realSrc = map.getSource('real-buildings-source') as maplibregl.GeoJSONSource | undefined;
  if (realSrc) realSrc.setData(safeGeoJson);

  const fusionSrc = map.getSource('fusion-buildings-source') as maplibregl.GeoJSONSource | undefined;
  if (fusionSrc) fusionSrc.setData(safeGeoJson);

  // 2. Three.js RealisticKoreanCityLayer 정점 버퍼 즉시 리빌드 (< 100ms)
  if (realisticLayer) {
    try {
      const center = map.getCenter();
      realisticLayer.updateBuildings(enrichedFeatures, [center.lng, center.lat]);
    } catch (layerErr) {
      console.warn('[realDataGeometryInjector] RealisticKoreanCityLayer update notice:', layerErr);
    }
  }

  // 3. 브이월드 스타일 노란 핀 라벨(POI) 실시간 강제 갱신
  try {
    updateVworldPoisWithBuildings(map, enrichedFeatures);
  } catch (poiErr) {
    console.warn('[realDataGeometryInjector] updateVworldPoisWithBuildings notice:', poiErr);
  }

  // 4. 지도 씬 강제 리페인트 (No-Delay Repaint)
  map.triggerRepaint();
}

// -----------------------------------------------------------------------------
// [7. 외부 API 실시간 수집 및 원클릭 강제 주입 통합 파이프라인]
// -----------------------------------------------------------------------------
export async function fetchAndInjectViewportRealData(
  map: maplibregl.Map,
  currentFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  options?: {
    realisticLayer?: RealisticKoreanCityLayer | null;
    signal?: AbortSignal;
    onStatus?: (msg: string, matchedCount: number) => void;
  }
): Promise<{
  enrichedFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  matchedCount: number;
}> {
  if (!map) {
    return { enrichedFeatures: currentFeatures, matchedCount: 0 };
  }

  const bounds = map.getBounds();
  const minLng = bounds.getWest();
  const minLat = bounds.getSouth();
  const maxLng = bounds.getEast();
  const maxLat = bounds.getNorth();

  const center = map.getCenter();
  const district = resolveGangwonDistrictByCoords(center.lng, center.lat);

  const fetchedRecords: BuildingRegistryRecord[] = [];

  // A. 국토교통부 건축HUB 표제부 API 호출 (강원 18개 시·군 신/구코드 동적 바인딩)
  try {
    const hubUrl = resolveFullUrl(
      `/api/molit-hub?service=building-register&sigunguCd=${district.admCode}&sigunguName=${encodeURIComponent(district.name)}`
    );
    const hubRes = await fetch(hubUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (hubRes.ok) {
      const hubJson = await hubRes.json();
      const bldgList = hubJson.buildingRegisters || [];
      for (const item of bldgList) {
        fetchedRecords.push({
          mgmBldrgstPk: item.mgmBldrgstPk,
          bldNm: item.bldNm,
          dongNm: item.dongNm,
          platPlc: item.platPlc,
          mainPurpsCdNm: item.mainPurpsCdNm,
          strctCdNm: item.strctCdNm,
          roofCdNm: item.roofCdNm,
          grndFlrCnt: Number(item.grndFlrCnt || 1),
          heit: Number(item.heit || 0),
          pnu: item.pnu,
          coordinates: item.coordinates,
          source: 'molit_hub_api',
        });
      }
    }
  } catch {
    // ignore
  }

  // B. 브이월드 WFS(LT_C_SPBD) 실측 건물 융합 데이터 호출
  try {
    const fusionUrl = resolveFullUrl(`/api/buildings/fusion?bbox=${minLng},${minLat},${maxLng},${maxLat}`);
    const fusionRes = await fetch(fusionUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (fusionRes.ok) {
      const fusionJson = await fusionRes.json();
      const feats = fusionJson?.features?.features || [];
      for (const f of feats) {
        const p = f.properties || {};
        fetchedRecords.push({
          id: f.id,
          bldNm: p.buildingName || p.buld_nm || p.name,
          dongNm: p.dongName || p.dongNm,
          platPlc: p.address,
          mainPurpsCdNm: p.main_purps_cd_nm || p.usage_nm,
          strctCdNm: p.strct_cd_nm || p.strctCdNm,
          roofCdNm: p.roof_cd_nm,
          grndFlrCnt: Number(p.grnd_flr || p.gro_flo_co || p.levels || 1),
          heit: Number(p.height || p.hei || 0),
          pnu: p.pnu,
          geometry: f.geometry,
          source: 'vworld_wfs_fusion',
        });
      }
    }
  } catch {
    // ignore
  }

  // C. 공간 인덱스(RBush & MasterDataSynchronizer)에 적재
  realDataSpatialStore.loadRecords(fetchedRecords);
  masterDataSynchronizer.ingestRecords(fetchedRecords as any);

  // D. 건물 피처들에 실측 데이터 1:1 강제 주입
  const baseFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] =
    currentFeatures.length > 0
      ? currentFeatures
      : fetchedRecords
          .filter((r) => r.geometry)
          .map((r, idx) => ({
            type: 'Feature' as const,
            id: r.id || `real_${idx}`,
            geometry: r.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
            properties: {
              name: r.bldNm,
              bldNm: r.bldNm,
              dongNm: r.dongNm,
              grndFlrCnt: r.grndFlrCnt,
              height: r.heit,
              mainPurpsCdNm: r.mainPurpsCdNm,
              strctCdNm: r.strctCdNm,
              roofCdNm: r.roofCdNm,
              source: r.source,
            },
          }));

  const { enrichedFeatures, matchedCount } = injectRealDataIntoFeatures(
    baseFeatures,
    realDataSpatialStore,
    { includeUnmatchedStoreFeatures: true }
  );

  // E. 씬 즉각 강제 갱신 (< 100ms)
  applyInjectedDataToMap(map, enrichedFeatures, options?.realisticLayer);

  options?.onStatus?.(
    `실측 공간정보(건축HUB · V-World WFS) 1:1 바인딩 완료 (총 ${matchedCount}동 실측 속성 및 층수 동기화)`,
    matchedCount
  );

  return {
    enrichedFeatures,
    matchedCount,
  };
}
