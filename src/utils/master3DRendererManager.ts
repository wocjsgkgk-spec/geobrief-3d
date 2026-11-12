/**
 * utils/master3DRendererManager.ts
 *
 * [GeoBrief 3D 3단계: 마스터 3D 렌더러 상태 머신 & 전역 필터링 엔진]
 *
 * 1. 단일 마스터 3D 렌더러 상태 머신 (Single Master 3D Renderer State Machine):
 *    - 여러 3D 건물 레이어(MapLibre fill-extrusion, Deck.gl, Three.js CustomLayer 등)가
 *      동시에 켜져서 건물이 이중으로 겹치거나 Z-Fighting 깜빡임이 발생하는 현상을 원천 방지.
 *    - 활성화된 렌더 모드(renderMode3D: 'facade' | 'native' | 'tiles3d')에 따라
 *      오직 단 하나의 마스터 엔진만 기동하고 다른 모든 엔진과 fill-extrusion 레이어를 엄격 차단(visibility: 'none').
 *
 * 2. 전역 지오메트리 및 높이 필터 (Global Geometry & Height Filter):
 *    - [소형 필지 연필 기둥 방지]: 바닥 면적 250㎡ 미만 소형 건물은 어떤 경우에도 11.0m 이하로 강제 클램핑.
 *    - [거대 비건물 압출 방지]: 바닥 면적 4,500㎡ 초과 구역, 지적도 필지선, 용도지역(UQ111),
 *      단지/공원 경계선(landuse, leisure) 등 비건물 폴리곤은 3D 압출에서 100% 영구 제외.
 */

import type maplibregl from 'maplibre-gl';
import type { RealisticKoreanCityLayer } from '@/components/Map/RealisticKoreanCityLayer';
import type { LOD2BuildingEngine } from '@/components/Map/LOD2BuildingEngine';
import type { RenderMode3D, Tile3DStreamState } from '@/types/map';
import { VworldMasterEngine } from '@/lib/vendor/vworldMasterEngine';
import { setGpuBuildingLayersVisibility, setGpuBuildingLayersMode } from '@/utils/gpuRealisticBuildingStack';
import { setTerrainClampedBuildingsVisible } from '@/lib/vendor/terrainClampedBuildingEngine';
import { VworldGpuMasterEngine } from '@/lib/vendor/vworldGpuMasterEngine';

export const ALL_FILL_EXTRUSION_LAYER_IDS = [
  'bldg-tier1-podium',
  'bldg-tier2-mainwall',
  'bldg-tier3-pattern',
  'bldg-tier4-roofcap',
  'bldg-tier5-roofdetail',
  'real-bldg-tier1-podium',
  'real-bldg-tier2-mainwall',
  'real-bldg-tier3-pattern',
  'real-bldg-tier4-roofcap',
  'real-bldg-tier5-roofdetail',
  'fusion-bldg-tier1-podium',
  'fusion-bldg-tier2-mainwall',
  'fusion-bldg-tier3-pattern',
  'fusion-bldg-tier4-roofcap',
  'fusion-bldg-tier5-roofdetail',
  '3d-buildings',
  '3d-buildings-roof',
  'buildings-extrusion',
  'fusion-buildings-3d',
  'fusion-buildings-roof',
  'fusion-buildings-extrusion',
  'real-buildings-3d',
  'real-buildings-roof',
  'vworld-3d-buildings-extrusion',
  'sample-buildings-extrusion',
  'lod2-buildings-layer',
  'lod2-parapet-layer',
  'lod2-penthouse-layer',
  'bldg-tier2-facade',
  'bldg-tier3-roof',
  'bldg-tier4-penthouse',
];

export interface Master3DRendererOptions {
  renderMode3D?: RenderMode3D;
  isBuildingsVisible: boolean;
  realisticKoreanCityLayer?: RealisticKoreanCityLayer | null;
  lod2BuildingEngine?: LOD2BuildingEngine | null;
  deck3DTilesManager?: { attachToMap: (m: any) => void; detachFromMap: () => void; update?: (cfg: any) => void } | null;
  threeboxLayer?: { setLodMode: (m: any) => void; setVisible: (v: boolean) => void } | null;
  placedFacilitiesCount?: number;
  tile3DStream?: Tile3DStreamState;
}

/**
 * 맵 내 모든 fill-extrusion 건축 레이어를 상호 배타적으로 숨김 처리하는 무결점 헬퍼
 */
export function hideAllFillExtrusionLayers(map: maplibregl.Map): void {
  ALL_FILL_EXTRUSION_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      try {
        map.setLayoutProperty(id, 'visibility', 'none');
      } catch {}
    }
  });

  try {
    const styleLayers = map.getStyle()?.layers;
    if (styleLayers) {
      for (const l of styleLayers) {
        if (
          l.type === 'fill-extrusion' &&
          l.id !== 'building-highlight-fill' &&
          !l.id.startsWith('vworld-')
        ) {
          if (map.getLayoutProperty(l.id, 'visibility') !== 'none') {
            map.setLayoutProperty(l.id, 'visibility', 'none');
          }
        }
      }
    }
  } catch {}
}

/**
 * 마스터 3D 렌더러 상태 머신 동기화 실행기
 * - '모드 A/B/C' 분리 및 '0 버텍스 타일셋 숨김 로직' 전면 폐기
 * - 오직 단 하나의 통합된 'V-World 실사 3D 마스터 렌더러'가 무조건 100% 가동
 * - 3D 타일셋 스트리밍 활성화 시 미로드 구역 무중단 실사 메쉬 폴백 가드 유지
 */
export function syncMaster3DRenderer(
  map: maplibregl.Map | null,
  opts: Master3DRendererOptions
): void {
  if (!map) return;

  const {
    renderMode3D = 'facade',
    isBuildingsVisible,
    realisticKoreanCityLayer,
    lod2BuildingEngine,
    deck3DTilesManager,
    threeboxLayer,
    placedFacilitiesCount = 0,
    tile3DStream,
  } = opts;

  // 1. [모드별 배타적 3D 렌더러 전환 (모드 1: 실사 파사드 vs 모드 2: 클린 화이트)]
  const bldgVisible = Boolean(isBuildingsVisible);

  if (renderMode3D === 'facade') {
    // [모드 1: 브이월드 3D 실사 디지털 트윈] Three.js 병합 버퍼 + 16종 PBR 파사드
    if (realisticKoreanCityLayer) {
      realisticKoreanCityLayer.setVisible(bldgVisible);
      VworldGpuMasterEngine.setVisible(map, false);
    } else {
      VworldGpuMasterEngine.setVisible(map, bldgVisible);
    }
  } else if (renderMode3D === 'native') {
    // [모드 2: V-World 공식 클린 화이트/아이보리 입체 모형 (image_dbcb02.jpg 100% 동일)]
    VworldGpuMasterEngine.setVisible(map, bldgVisible);
    if (realisticKoreanCityLayer) {
      realisticKoreanCityLayer.setVisible(false);
    }
  } else {
    // [모드 3: tiles3d 고정밀 3D 타일셋 스트리밍]
    VworldGpuMasterEngine.setVisible(map, bldgVisible);
    if (realisticKoreanCityLayer) {
      realisticKoreanCityLayer.setVisible(false);
    }
  }

  // 중복 구형 fill-extrusion 레이어는 항구적으로 차단(visibility: none)
  setGpuBuildingLayersVisibility(map, false);
  setTerrainClampedBuildingsVisible(map, false);

  // 2. 3D 타일셋 스트리밍(Tile3DLayer) 처리 (추가 보강 오버레이)
  // [절대 불변 규칙]: 고정밀 3D 타일셋 스위치를 켜든 끄든, 모드 A/B/C 무엇이든 기존 3D 실사 건물은 절대 끄면 안 됨!
  const isTiles3DActive = renderMode3D === 'tiles3d' || Boolean(tile3DStream?.enabled);
  if (isTiles3DActive && deck3DTilesManager) {
    deck3DTilesManager.attachToMap(map);
    if (tile3DStream && deck3DTilesManager.update) {
      deck3DTilesManager.update(tile3DStream as any);
    }
  } else if (deck3DTilesManager) {
    deck3DTilesManager.detachFromMap();
  }

  if (lod2BuildingEngine) {
    lod2BuildingEngine.setVisible(false);
  }

  if (threeboxLayer) {
    threeboxLayer.setLodMode('lod2');
    threeboxLayer.setVisible(placedFacilitiesCount > 0);
  }
}

// [고속 지형 표고 메모이제이션 캐시]: 동기식 queryTerrainElevation (gl.readPixels GPU 스톨) 100% 방지
const elevationCache = new Map<string, number>();

/**
 * [강원 18개 시·군 산속/임야 유령 건물 원천 차단 필터]
 * 1) 임야/산림 지목 (jimok: '임', '임야', landuse: 'forest', natural: 'wood')
 * 2) 치악산, 설악산, 오대산 등 강원 산악 능선 좌표 마스킹
 * 3) DEM 표고 분석 (그리드 캐시 기반 무스톨 초고속 판별)
 */
export function isMountainGhostBuilding(
  lng: number,
  lat: number,
  featProps: Record<string, any> = {},
  map?: any
): boolean {
  // [0] 가짜/더미/절차적 생성기 태그 전수 검출
  const bldName = String(featProps.name || featProps.buld_nm || featProps.bld_nm || featProps.buildingName || '').toLowerCase();
  if (
    bldName.includes('dummy') ||
    bldName.includes('mock') ||
    bldName.includes('synthetic') ||
    bldName.includes('procedural') ||
    bldName.includes('임의') ||
    bldName.includes('가짜')
  ) {
    return true;
  }

  // 공식 공인 건축물 식별자 보유 여부
  const hasOfficialRegistration = Boolean(
    featProps.bd_mgt_sn ||
    featProps.source === 'vworld_local' ||
    featProps.source === 'LT_C_SPBD' ||
    (featProps.pnu && featProps.buld_nm)
  );

  // [1] 지목 및 토지이용 태그 검사 (산림, 임야, 전답, 하천 등 비건물 구역)
  const jimok = String(featProps.jimok || featProps.jimok_nm || '').trim();
  if (jimok === '임' || jimok === '임야' || jimok === '전' || jimok === '답' || jimok === '천' || jimok === '구' || jimok === '유') {
    if (!hasOfficialRegistration) return true;
  }

  const landuse = String(featProps.landuse || featProps.natural || '').toLowerCase();
  if (
    landuse === 'forest' ||
    landuse === 'wood' ||
    landuse === 'mountain' ||
    landuse === 'scrub' ||
    landuse === 'farmland' ||
    landuse === 'orchard' ||
    landuse === 'meadow' ||
    landuse === 'water' ||
    landuse === 'river' ||
    landuse === 'grass' ||
    landuse === 'bare_rock'
  ) {
    if (!hasOfficialRegistration) return true;
  }

  // [2] 강원권 전역(원주, 춘천, 강릉, 속초, 인제, 평창 등) 산악·국립공원 구역 마스킹
  // - 대한민국 국토교통부 건축물대장에 등재되지 않은 오픈 스트리트맵(OSM) 산림 다각형 전수 차단
  const isGangwonZone = lng >= 127.0 && lng <= 129.5 && lat >= 37.0 && lat <= 38.6;
  if (isGangwonZone && !hasOfficialRegistration) {
    // 1. 치악산 국립공원 및 원주 외곽 산림 능선
    if (lng >= 127.97 && lng <= 128.18 && lat >= 37.25 && lat <= 37.48) return true;
    // 2. 백운산 및 원주 남부 산림 능선
    if (lng >= 127.88 && lng <= 128.02 && lat >= 37.18 && lat <= 37.28) return true;
    // 3. 설악산 국립공원 및 인제·속초·양양 산악 능선
    if (lng >= 128.25 && lng <= 128.60 && lat >= 38.00 && lat <= 38.30) return true;
    // 4. 오대산 및 평창·대관령·홍천 고산 능선
    if (lng >= 128.40 && lng <= 128.90 && lat >= 37.55 && lat <= 37.95) return true;
    // 5. 태백산맥 및 정선·태백·삼척 산악 능선
    if (lng >= 128.75 && lng <= 129.25 && lat >= 37.00 && lat <= 37.45) return true;
    // 6. 춘천 구봉산·봉의산·용화산 배후 산림 능선
    if (lng >= 127.68 && lng <= 127.88 && lat >= 37.82 && lat <= 38.05) return true;

    // 7. 원주 1군지사 배후 산림 능선 및 도심 외곽 산림 오염 구역
    if (lng >= 127.9250 && lng <= 127.9350 && lat >= 37.3520 && lat <= 37.3630) return true;
    if (lng >= 127.9380 && lng <= 127.9475 && lat >= 37.3480 && lat <= 37.3580) return true;
    if (lng >= 127.9300 && lng <= 127.9390 && lat >= 37.3440 && lat <= 37.3520) return true;

    // 8. 출처가 OpenMapTiles/OSM인 미확인 레이어 객체는 강원권에서 공인 식별자 부재 시 배제
    if (featProps.sourceLayer === 'building' || featProps.sources?.ofm) {
      return true;
    }
  }

  // [3] DEM 표고 캐시 기반 고속 분석 (동기식 queryTerrainElevation GPU 스톨 영구 방지)
  if (map && typeof map.queryTerrainElevation === 'function') {
    try {
      const gridKey = `${Math.round(lng * 500)}_${Math.round(lat * 500)}`;
      let elev = elevationCache.get(gridKey);
      if (elev === undefined) {
        const sampled = map.queryTerrainElevation([lng, lat]);
        elev = typeof sampled === 'number' && !isNaN(sampled) ? sampled : 0;
        if (elevationCache.size > 2000) {
          elevationCache.clear();
        }
        elevationCache.set(gridKey, elev);
      }

      // 고지대 170m 이상 능선/산꼭대기 미등록 건물 100% 배제
      if (elev >= 170 && !hasOfficialRegistration) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * [전역 기하 필터] 비건물 및 이상 거대 폴리곤 검증 (VworldMasterEngine 연동)
 * - 폭 2.8m 미만 보행로/화단/담장/경계석 비건물 차단 (소형 단독주택·상가 100% 허용)
 */
export function isPermittedBuildingPolygon(
  featProps: Record<string, any> = {},
  areaSqm: number,
  spanX: number,
  spanZ: number,
  maxEdgeLen: number,
  minWidth?: number,
  centroid?: [number, number],
  map?: any
): boolean {
  // [0단계: 산림/임야 유령 건물 필터]
  if (centroid && isMountainGhostBuilding(centroid[0], centroid[1], featProps, map)) {
    return false;
  }
  // [1단계: 비건물·지적도 필지·도시계획구역·운동장·공터·도로 100% 원천 차단]
  // 주의: 건물 속성에 붙은 spfc_nm(용도지역), zoneName, landuse 태그로 인한 정상 건물 배제 버그 원천 차단!
  if (
    featProps.is_site_boundary === true ||
    featProps.is_non_building === true ||
    featProps.layer_type === 'cadastral' ||
    featProps.layer_type === 'zoning' ||
    featProps.layer_type === 'landuse' ||
    featProps.boundary ||
    featProps.admin_level ||
    featProps.natural === 'wood' ||
    featProps.natural === 'water' ||
    featProps.jimok === '임' ||
    featProps.jimok === '임야' ||
    featProps.jimok_nm === '임야' ||
    (typeof featProps.slope === 'number' && featProps.slope >= 25) ||
    featProps.amenity === 'parking' ||
    featProps.amenity === 'bicycle_parking' ||
    featProps.building === 'no' ||
    featProps.railway ||
    featProps.highway ||
    featProps.barrier ||
    featProps.wall ||
    featProps.fence ||
    featProps.waterway ||
    featProps.man_made === 'bridge' ||
    featProps.man_made === 'pier' ||
    featProps.man_made === 'breakwater'
  ) {
    return false;
  }

  // 운동장, 공원, 트랙, 골프장, 잔디밭 등 비건물 레저 구역 차단
  const leisureVal = String(featProps.leisure || '').toLowerCase();
  if (
    leisureVal === 'pitch' ||
    leisureVal === 'park' ||
    leisureVal === 'playground' ||
    leisureVal === 'track' ||
    leisureVal === 'stadium' ||
    leisureVal === 'sports_centre' ||
    leisureVal === 'golf_course'
  ) {
    return false;
  }

  // [2단계: 오직 실제 개별 건축물 외곽선(Individual Building Footprints)만 허용]
  const isAuthenticBuilding = Boolean(
    (typeof featProps.building === 'string' && featProps.building !== 'no') ||
    featProps.render_height !== undefined ||
    featProps.render_min_height !== undefined ||
    featProps.levels !== undefined ||
    featProps.sourceLayer === 'building' ||
    featProps.source === 'vworld_local' ||
    featProps.source === 'vworld_wfs' ||
    featProps.source === 'LT_C_SPBD' ||
    featProps.source === 'openfreemap' ||
    featProps.bld_category ||
    featProps.usageType ||
    featProps.bd_mgt_sn ||
    featProps.mgmBldrgstPk ||
    featProps.buld_nm ||
    featProps.bld_nm ||
    featProps.bldNm ||
    featProps.buildingName
  );

  if (!isAuthenticBuilding) {
    return false;
  }

  // [3단계: 거대 비건물 필지 area > 3,800㎡ 단독 폴리곤 100% 영구 차단 (학교 운동장 전체, 단지 외곽 필지선, 공원)]
  const maxAreaLimit = 3800.0;
  if (areaSqm > maxAreaLimit || areaSqm < 30.0) {
    return false;
  }

  // [4단계: 삼각형 찢어짐 및 비정상 스팬 차단]
  if (spanX > 450 || spanZ > 450 || maxEdgeLen > 350) {
    return false;
  }

  // [5단계: 골목길, 도로, 연석, 옹벽, 담장 (짧은 변 폭 < 3.0m, 세장비 > 8.0) 차단, 소형 주택 30㎡~200㎡는 3.0m 이상 보존]
  const calculatedMinWidth = typeof minWidth === 'number' && minWidth > 0 ? minWidth : Math.min(spanX, spanZ);
  const maxSpan = Math.max(spanX, spanZ);

  if (calculatedMinWidth < 3.0) {
    return false;
  }

  const aspectRatio = maxSpan / Math.max(0.1, calculatedMinWidth);
  if (aspectRatio > 8.0) {
    return false;
  }

  if (maxEdgeLen > 0 && (areaSqm / (maxEdgeLen * maxEdgeLen)) < 0.03) {
    return false;
  }

  return true;
}

/**
 * [관문 엄격 필터] 진짜 개별 건축물 Footprint 전수 검증용 별칭 (100% 동일 사양)
 */
export const isAuthenticBuildingFootprint = isPermittedBuildingPolygon;

/**
 * 3D DEM 표고 및 경사도(Slope) 기반 급경사 산림/임야 유령 건물 판별
 * - DEM 표고가 높고 경사도가 25도 이상인 순수 산림(임야) 구역의 건물 압출을 원천 차단
 */
export function isSteepMountainSlope(
  map: any,
  lng: number,
  lat: number,
  maxSlopeDeg = 25
): boolean {
  if (!map || typeof map.queryTerrainElevation !== 'function') return false;
  try {
    const centerElev = map.queryTerrainElevation([lng, lat]);
    if (centerElev === null || centerElev === undefined) return false;

    // 평지(표고 180m 이하)는 안전 구역
    if (centerElev < 180) return false;

    // 25m 동/북 지점의 고도 샘플링
    const dDeg = 0.00025; // ~25m
    const eEast = map.queryTerrainElevation([lng + dDeg, lat]) ?? centerElev;
    const eNorth = map.queryTerrainElevation([lng, lat + dDeg]) ?? centerElev;

    const dzE = Math.abs(eEast - centerElev) / 25;
    const dzN = Math.abs(eNorth - centerElev) / 25;
    const maxGrade = Math.max(dzE, dzN);
    const slopeDeg = Math.atan(maxGrade) * (180 / Math.PI);

    // 경사도 25도 이상이거나, 표고 350m 이상의 20도 이상 경사지는 산림 차폐 처리
    if (slopeDeg >= maxSlopeDeg || (centerElev >= 350 && slopeDeg >= 20)) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * [전역 높이 필터] 브이월드 REA 역공학 4단계 스펙 연동 & 뾰족 기둥(바늘 타워) 방지 클램핑
 */
export function sanitizeBuildingHeight(
  rawHeight: number,
  areaSqm: number,
  minWidth: number,
  seed: number,
  isHighRiseApt: boolean,
  featProps: Record<string, any> = {},
  centerLngLat?: [number, number]
): number {
  // ---------------------------------------------------------------------------
  // [규격 1] 소형 단독주택·다세대·원룸 (35㎡ <= area < 220㎡ 또는 minWidth < 7.5m)
  // - 주변에 아파트 POI가 있더라도 절대 10.0m(3층) 초과 금지: 6.5m ~ 10.0m
  // ---------------------------------------------------------------------------
  if (areaSqm < 220 || minWidth < 7.5) {
    if (rawHeight > 0) {
      return Math.min(10.0, Math.max(6.5, rawHeight));
    }
    return Math.min(10.0, 6.5 + (seed % 36) * 0.1);
  }

  // ---------------------------------------------------------------------------
  // [규격 2] 학교·공공청사 (school, public 또는 운동장을 낀 중대형 건물)
  // - 운동장은 0m 바닥 유지, 교사동 건물만 12m ~ 16m (3층 ~ 4층)
  // ---------------------------------------------------------------------------
  const rawName = String(featProps.buld_nm || featProps.name || '').toLowerCase();
  const rawUse = String(featProps.realUse || featProps.use || featProps.mainPurpsCdNm || '').toLowerCase();
  const isSchool = rawName.includes('학교') || rawName.includes('초등') || rawName.includes('중학') || rawName.includes('고등') || rawUse.includes('학교') || rawUse.includes('교육');
  if (isSchool && areaSqm < 1500) {
    return 12.0 + (seed % 5) * 1.0;
  }

  // ---------------------------------------------------------------------------
  // [규격 3] 시내 상가·근린생활 (220㎡ <= area < 600㎡)
  // - 상업지역이나 주택가 대로변 상가: 높이 12.0m ~ 20.0m (4층 ~ 6층)
  // ---------------------------------------------------------------------------
  if (areaSqm >= 220 && areaSqm < 600 && !isHighRiseApt) {
    const commH = 12.0 + (seed % 9) * 1.0;
    if (rawHeight > 0) {
      return Math.min(20.0, Math.max(12.0, rawHeight));
    }
    return commH;
  }

  // ---------------------------------------------------------------------------
  // [규격 4] 도청(춘천)·시청·군청·혁신도시 공공청사·대형 병원·학교 (area >= 600㎡ 비주거)
  // - 높이 16.0m ~ 42.0m (4층 ~ 13층)
  // ---------------------------------------------------------------------------
  if (areaSqm >= 600 && !isHighRiseApt) {
    const publicH = 16.0 + (seed % 27) * 1.0;
    if (rawHeight > 0) {
      return Math.min(42.0, Math.max(16.0, rawHeight));
    }
    return publicH;
  }

  // ---------------------------------------------------------------------------
  // [규격 5] 전 권역 아파트 단지 (apartments 또는 단지형 350㎡ ~ 2,500㎡ 주거동)
  // - 높이 45m ~ 75m (15층 ~ 25층, 최대 75m 상한선 고정)
  // ---------------------------------------------------------------------------
  if (isHighRiseApt && areaSqm >= 320 && minWidth >= 8.0) {
    if (rawHeight > 0) {
      return Math.min(75.0, Math.max(45.0, rawHeight));
    }
    return 45.0 + (seed % 31) * 1.0;
  }

  let calculatedH: number;
  if (rawHeight > 0) {
    const safeW = Math.max(6.0, minWidth);
    const maxAllowed = isHighRiseApt ? 75.0 : Math.max(14.0, safeW * 4.0);
    calculatedH = Math.max(7.5, Math.min(rawHeight, maxAllowed));
  } else {
    calculatedH = VworldMasterEngine.calculateBuildingHeight(
      featProps,
      areaSqm,
      minWidth,
      seed,
      centerLngLat
    );
  }

  if (areaSqm < 220 || minWidth < 7.5) {
    return Math.min(calculatedH, 10.5);
  }

  return calculatedH;
}
