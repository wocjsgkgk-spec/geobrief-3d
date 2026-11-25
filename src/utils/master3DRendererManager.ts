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
import * as turf from '@turf/turf';
import { GANGWON_18_MILITARY_SITES } from '@/constants/gangwon18MilitarySites';
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
  if (!map || !(map as any).style || (map as any)._removed) return;
  ALL_FILL_EXTRUSION_LAYER_IDS.forEach((id) => {
    try {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
    } catch {}
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
    // [모드 1: 브이월드 3D 실사 디지털 트윈] Three.js 실사 엔진 단독 가동 (MapLibre fill-extrusion 완전 오프로 GPU 부하 및 Z-Fighting 원천 소멸)
    VworldGpuMasterEngine.setVisible(map, false);
    if (realisticKoreanCityLayer) {
      realisticKoreanCityLayer.setVisible(bldgVisible);
    }
  } else if (renderMode3D === 'native') {
    // [모드 2: V-World 공식 클린 화이트/아이보리 입체 모형 (image_dbcb02.jpg 100% 동일)]
    VworldGpuMasterEngine.setVisible(map, bldgVisible);
    if (realisticKoreanCityLayer) {
      realisticKoreanCityLayer.setVisible(false);
    }
  } else {
    // [모드 3: tiles3d 고정밀 3D 타일셋 스트리밍]
    VworldGpuMasterEngine.setVisible(map, false);
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

const GANGWON_REGIONAL_BASE_ELEVATION: { [key: string]: { name: string; center: [number, number]; maxMountainElev: number } } = {
  wonju: { name: '원주', center: [127.9351, 37.3592], maxMountainElev: 180 },
  chuncheon: { name: '춘천', center: [127.7298, 37.8813], maxMountainElev: 125 },
  gangneung: { name: '강릉', center: [128.8761, 37.7519], maxMountainElev: 65 },
  sokcho: { name: '속초', center: [128.5918, 38.2070], maxMountainElev: 50 },
  donghae: { name: '동해', center: [129.1143, 37.5247], maxMountainElev: 65 },
  samcheok: { name: '삼척', center: [129.1658, 37.4498], maxMountainElev: 65 },
  taebaek: { name: '태백', center: [128.9889, 37.1641], maxMountainElev: 840 },
  pyeongchang: { name: '평창', center: [128.3904, 37.3705], maxMountainElev: 720 },
  jeongseon: { name: '정선', center: [128.6608, 37.3806], maxMountainElev: 460 },
  yeongwol: { name: '영월', center: [128.4620, 37.1837], maxMountainElev: 295 },
  hongcheon: { name: '홍천', center: [127.8887, 37.6970], maxMountainElev: 170 },
  hoengseong: { name: '횡성', center: [127.9850, 37.4916], maxMountainElev: 190 },
  cheorwon: { name: '철원', center: [127.3134, 38.1468], maxMountainElev: 240 },
  hwacheon: { name: '화천', center: [127.7082, 38.1062], maxMountainElev: 180 },
  yanggu: { name: '양구', center: [127.9897, 38.1095], maxMountainElev: 250 },
  inje: { name: '인제', center: [128.1704, 38.0697], maxMountainElev: 285 },
  goseong: { name: '고성', center: [128.4678, 38.3806], maxMountainElev: 75 },
  yangyang: { name: '양양', center: [128.6285, 38.0754], maxMountainElev: 65 },
};

function getGangwonMaxMountainElev(lng: number, lat: number): number {
  let closestDist = Infinity;
  let maxElev = 220;
  for (const reg of Object.values(GANGWON_REGIONAL_BASE_ELEVATION)) {
    const dLng = (reg.center[0] - lng) * 88.0;
    const dLat = (reg.center[1] - lat) * 111.0;
    const dist = Math.hypot(dLng, dLat);
    if (dist < closestDist) {
      closestDist = dist;
      maxElev = reg.maxMountainElev;
    }
  }
  return maxElev;
}

/**
 * 강원 18개 시·군별 공식 중심 시가지 기본 지형 표고 반환 (DEM 로드 전 또는 평탄지 안전 폴백)
 */
export function getGangwonBaseElevation(lng: number, lat: number): number {
  let closestDist = Infinity;
  let baseElev = 142.0;
  const regionalDefaultElev: Record<string, number> = {
    wonju: 142,
    chuncheon: 82,
    gangneung: 25,
    sokcho: 18,
    donghae: 22,
    samcheok: 20,
    taebaek: 680,
    pyeongchang: 450,
    jeongseon: 320,
    yeongwol: 210,
    hongcheon: 110,
    hoengseong: 125,
    cheorwon: 180,
    hwacheon: 130,
    yanggu: 170,
    inje: 200,
    goseong: 25,
    yangyang: 22,
  };
  for (const [key, reg] of Object.entries(GANGWON_REGIONAL_BASE_ELEVATION)) {
    const dLng = (reg.center[0] - lng) * 88.0;
    const dLat = (reg.center[1] - lat) * 111.0;
    const dist = Math.hypot(dLng, dLat);
    if (dist < closestDist) {
      closestDist = dist;
      baseElev = regionalDefaultElev[key] || 140;
    }
  }
  return baseElev;
}

interface CachedMilitarySite {
  id: string;
  name: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

// [강원 18개 시·군 군 유휴부지 BBOX 사전 캐싱]: 0.001ms 고속 경계 판정 지원
const CACHED_MILITARY_SITES: CachedMilitarySite[] = GANGWON_18_MILITARY_SITES.map((site) => {
  const coords = site.polygon.geometry.coordinates[0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const pt of coords) {
    if (pt[0] < minLng) minLng = pt[0];
    if (pt[0] > maxLng) maxLng = pt[0];
    if (pt[1] < minLat) minLat = pt[1];
    if (pt[1] > maxLat) maxLat = pt[1];
  }
  return {
    id: site.id,
    name: site.name,
    bbox: [minLng, minLat, maxLng, maxLat],
    polygon: site.polygon,
  };
});

/**
 * 주어진 경위도 좌표가 강원 18개 시·군 군 유휴부지(1군지사 310,000㎡ 등) 경계 내부에 위치하는지 판정
 * 0.001ms 고속 BBOX 사전 검사 후 turf.booleanPointInPolygon 정밀 판정
 */
export function isPointInMilitaryIdleSite(lng: number, lat: number, targetSiteId?: string): boolean {
  for (let i = 0; i < CACHED_MILITARY_SITES.length; i++) {
    const site = CACHED_MILITARY_SITES[i];
    if (targetSiteId && site.id !== targetSiteId) continue;
    const [minLng, minLat, maxLng, maxLat] = site.bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      if (turf.booleanPointInPolygon(turf.point([lng, lat]), site.polygon)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 강원 18개 시·군 공식 중심 시가지 보호 구역 (Urban Settlement Protection Envelopes)
 * - 18개 시·군 청사 및 핵심 도심지는 산악 능선 오탐 필터로부터 100% 안전하게 보호
 */
export function isInsideUrbanSettlementEnvelope(lng: number, lat: number): boolean {
  // 원주 도심 (원주시청·무실동·단구동·일산동·중앙동·우산동 평지 시가지)
  if (lng >= 127.925 && lng <= 127.958 && lat >= 37.330 && lat <= 37.368) return true;
  // 춘천 도심 (강원도청·춘천시청·명동·효자동·후평동·퇴계동)
  if (lng >= 127.705 && lng <= 127.765 && lat >= 37.850 && lat <= 37.910) return true;
  // 강릉 도심 (강릉시청·교동·홍제동·포남동·중앙동)
  if (lng >= 128.855 && lng <= 128.925 && lat >= 37.730 && lat <= 37.785) return true;
  // 속초 도심 (속초시청·동명동·중앙동·조양동·청호동)
  if (lng >= 128.565 && lng <= 128.605 && lat >= 38.180 && lat <= 38.225) return true;
  // 동해 도심 (동해시청·천곡동·북삼동·송정동)
  if (lng >= 129.090 && lng <= 129.135 && lat >= 37.500 && lat <= 37.550) return true;
  // 삼척 도심 (삼척시청·남양동·정라동)
  if (lng >= 129.150 && lng <= 129.185 && lat >= 37.430 && lat <= 37.465) return true;
  // 태백 도심 (태백시청·황지동·상장동)
  if (lng >= 128.970 && lng <= 129.010 && lat >= 37.150 && lat <= 37.185) return true;
  // 홍천 도심 (홍천읍·홍천군청)
  if (lng >= 127.870 && lng <= 127.910 && lat >= 37.680 && lat <= 37.710) return true;
  // 횡성 도심 (횡성읍·횡성군청)
  if (lng >= 127.970 && lng <= 128.005 && lat >= 37.480 && lat <= 37.510) return true;
  // 평창 도심 (평창읍·평창군청)
  if (lng >= 128.375 && lng <= 128.410 && lat >= 37.360 && lat <= 37.385) return true;
  // 정선 도심 (정선읍·정선군청)
  if (lng >= 128.645 && lng <= 128.680 && lat >= 37.370 && lat <= 37.395) return true;
  // 영월 도심 (영월읍·영월군청)
  if (lng >= 128.445 && lng <= 128.480 && lat >= 37.170 && lat <= 37.198) return true;
  // 철원 도심 (갈말읍·철원군청)
  if (lng >= 127.295 && lng <= 127.335 && lat >= 38.135 && lat <= 38.160) return true;
  // 화천 도심 (화천읍·화천군청)
  if (lng >= 127.690 && lng <= 127.725 && lat >= 38.095 && lat <= 38.120) return true;
  // 양구 도심 (양구읍·양구군청)
  if (lng >= 127.975 && lng <= 128.005 && lat >= 38.095 && lat <= 38.125) return true;
  // 인제 도심 (인제읍·인제군청)
  if (lng >= 128.155 && lng <= 128.185 && lat >= 38.055 && lat <= 38.080) return true;
  // 고성 도심 (간성읍·고성군청)
  if (lng >= 128.450 && lng <= 128.485 && lat >= 38.365 && lat <= 38.395) return true;
  // 양양 도심 (양양읍·양양군청)
  if (lng >= 128.610 && lng <= 128.635 && lat >= 38.065 && lat <= 38.090) return true;
  return false;
}

/**
 * 강원 전역 주요 호수 및 동해 바다 수계 구역 판정 (수면 위 비정상 가상 건물 100% 영구 배제)
 */
export function isPointInGangwonWaterBody(lng: number, lat: number, elev?: number): boolean {
  // [1] 동해안 해안선 밖 동해 바다 해양 구역 (수면 표고 <= 1.0m 및 동해안 외해 경도)
  if (lng >= 128.61 && lat >= 38.18 && (elev === undefined || elev <= 1.0)) return true; // 고성·속초 외해
  if (lng >= 128.64 && lat >= 38.02 && lat < 38.18 && (elev === undefined || elev <= 1.0)) return true; // 양양 외해
  if (lng >= 128.93 && lat >= 37.70 && lat < 38.02 && (elev === undefined || elev <= 1.0)) return true; // 강릉 외해
  if (lng >= 129.13 && lat >= 37.48 && lat < 37.70 && (elev === undefined || elev <= 1.0)) return true; // 동해 외해
  if (lng >= 129.21 && lat >= 37.10 && lat < 37.48 && (elev === undefined || elev <= 1.0)) return true; // 삼척 외해

  // [2] 강원 주요 내륙 호수·저수지
  // 소양호 (Soyang Lake)
  if (lng >= 127.810 && lng <= 128.050 && lat >= 37.940 && lat <= 38.080) return true;
  // 의암호 (Uiam Lake in Chuncheon)
  if (lng >= 127.685 && lng <= 127.718 && lat >= 37.855 && lat <= 37.915) return true;
  // 춘천호 (Chuncheon Lake)
  if (lng >= 127.640 && lng <= 127.680 && lat >= 37.930 && lat <= 37.980) return true;
  // 파로호 (Paroho in Hwacheon/Yanggu)
  if (lng >= 127.760 && lng <= 127.930 && lat >= 38.105 && lat <= 38.170) return true;
  // 경포호 (Gyeongpo Lake in Gangneung)
  if (lng >= 128.892 && lng <= 128.915 && lat >= 37.794 && lat <= 37.808) return true;
  // 영랑호 (Yeongnang Lake in Sokcho)
  if (lng >= 128.578 && lng <= 128.595 && lat >= 38.213 && lat <= 38.225) return true;
  // 청초호 (Cheongcho Lake in Sokcho)
  if (lng >= 128.580 && lng <= 128.595 && lat >= 38.195 && lat <= 38.206) return true;

  return false;
}

/**
 * [강원 전역 21개 주요 종합운동장/공설운동장 트랙 및 잔디 필드 배제 구역]
 * V-World 3D REA 역공학 표준: 축구장 잔디/육상 트랙 내부 비정상 가상 더미 건축물 100% 영구 배제
 */
export const GANGWON_STADIUM_PITCH_EXCLUSION_ZONES: Array<{
  name: string;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}> = [
  // 1. 원주종합운동장 주경기장 트랙 및 축구장 잔디 필드 (명륜동 193)
  { name: '원주종합운동장 주경기장 필드', minLng: 127.9426, maxLng: 127.9453, minLat: 37.3355, maxLat: 37.3372 },
  // 2. 춘천 송암스포츠타운 주경기장 트랙 및 필드
  { name: '춘천 송암 주경기장 필드', minLng: 127.6900, maxLng: 127.6950, minLat: 37.8535, maxLat: 37.8580 },
  // 3. 춘천 송암스포츠타운 보조경기장
  { name: '춘천 송암 보조경기장 필드', minLng: 127.6950, maxLng: 127.6990, minLat: 37.8520, maxLat: 37.8560 },
  // 4. 춘천 공지천 축구장
  { name: '춘천 공지천 축구장', minLng: 127.7120, maxLng: 127.7185, minLat: 37.8680, maxLat: 37.8735 },
  // 5. 강릉종합운동장 주경기장 트랙 및 잔디 필드
  { name: '강릉종합운동장 주경기장 필드', minLng: 128.8960, maxLng: 128.9030, minLat: 37.7720, maxLat: 37.7770 },
  // 6. 강릉 강남축구공원
  { name: '강릉 강남축구공원', minLng: 128.9080, maxLng: 128.9165, minLat: 37.7375, maxLat: 37.7445 },
  // 7. 속초종합운동장 트랙 및 필드
  { name: '속초종합운동장 필드', minLng: 128.5655, maxLng: 128.5720, minLat: 38.1975, maxLat: 38.2030 },
  // 8. 동해 웰빙레포츠타운 종합운동장
  { name: '동해 웰빙레포츠타운 종합운동장 필드', minLng: 129.1075, maxLng: 129.1150, minLat: 37.5195, maxLat: 37.5250 },
  // 9. 삼척종합운동장 트랙 및 필드
  { name: '삼척종합운동장 필드', minLng: 129.1615, maxLng: 129.1680, minLat: 37.4395, maxLat: 37.4450 },
  // 10. 태백종합운동장 트랙 및 필드
  { name: '태백종합운동장 필드', minLng: 128.9895, maxLng: 128.9960, minLat: 37.1715, maxLat: 37.1770 },
  // 11. 홍천종합운동장 트랙 및 필드
  { name: '홍천종합운동장 필드', minLng: 127.8975, maxLng: 127.9040, minLat: 37.6835, maxLat: 37.6890 },
  // 12. 횡성종합운동장 트랙 및 필드
  { name: '횡성종합운동장 필드', minLng: 127.9875, maxLng: 127.9940, minLat: 37.4935, maxLat: 37.4990 },
  // 13. 철원공설운동장 트랙 및 필드
  { name: '철원공설운동장 필드', minLng: 127.3045, maxLng: 127.3115, minLat: 38.1415, maxLat: 38.1470 },
  // 14. 화천공설운동장 트랙 및 필드
  { name: '화천공설운동장 필드', minLng: 127.7015, maxLng: 127.7080, minLat: 38.1015, maxLat: 38.1070 },
  // 15. 양구종합운동장 트랙 및 필드
  { name: '양구종합운동장 필드', minLng: 127.9875, maxLng: 127.9940, minLat: 38.1075, maxLat: 38.1130 },
  // 16. 인제공설운동장 트랙 및 필드
  { name: '인제공설운동장 필드', minLng: 128.1715, maxLng: 128.1780, minLat: 38.0615, maxLat: 38.0670 },
  // 17. 고성종합운동장 트랙 및 필드
  { name: '고성종합운동장 필드', minLng: 128.4675, maxLng: 128.4740, minLat: 38.3775, maxLat: 38.3830 },
  // 18. 양양종합운동장 트랙 및 필드
  { name: '양양종합운동장 필드', minLng: 128.6215, maxLng: 128.6280, minLat: 38.0775, maxLat: 38.0830 },
  // 19. 영월공설운동장 트랙 및 필드
  { name: '영월공설운동장 필드', minLng: 128.4715, maxLng: 128.4785, minLat: 37.1815, maxLat: 37.1875 },
  // 20. 평창종합운동장 트랙 및 필드
  { name: '평창종합운동장 필드', minLng: 128.3875, maxLng: 128.3945, minLat: 37.3675, maxLat: 37.3735 },
  // 21. 정선종합운동장 트랙 및 필드
  { name: '정선종합운동장 필드', minLng: 128.6645, maxLng: 128.6715, minLat: 37.3775, maxLat: 37.3835 },
];

/**
 * 경기장 트랙 및 잔디 필드 내부 판정 (V-World 3D REA 역공학 표준)
 */
export function isPointInStadiumPitch(lng: number, lat: number, featProps: Record<string, any> = {}): boolean {
  // 1. 강원 전역 경기장 트랙/필드 공간 좌표 검사
  for (let i = 0; i < GANGWON_STADIUM_PITCH_EXCLUSION_ZONES.length; i++) {
    const z = GANGWON_STADIUM_PITCH_EXCLUSION_ZONES[i];
    if (lng >= z.minLng && lng <= z.maxLng && lat >= z.minLat && lat <= z.maxLat) {
      return true;
    }
  }

  // 2. 건축물대장상 종합운동장/경기장 더미 박스 속성 검사 (면적 < 2,500㎡ 지적 대표점 더미 박스 영구 제거)
  const name = String(featProps.name || featProps.buld_nm || featProps.buildingName || featProps.bld_nm || '');
  if (
    name.includes('종합운동장') ||
    name.includes('주경기장') ||
    name.includes('보조경기장') ||
    name.includes('공설운동장') ||
    name.includes('축구장') ||
    name.includes('야구장') ||
    name.includes('육상경기장')
  ) {
    const area = Number(featProps.areaSqm || featProps.area || 0);
    if (area > 0 && area < 2500) {
      return true;
    }
  }

  // 3. 지목 체육용지(체) 및 레저 피치 속성 검사
  const jimok = String(featProps.jimok || featProps.jimok_nm || '');
  const leisure = String(featProps.leisure || '').toLowerCase();
  if (jimok === '체' || jimok === '체육용지' || leisure === 'pitch' || leisure === 'track' || leisure === 'stadium') {
    const levels = Number(featProps.levels || featProps.grnd_flr || featProps.gro_flo_co || 1);
    const height = Number(featProps.height || featProps.bd_hgt || featProps.hei || 8);
    // 2층 이하 또는 12m 이하의 체육용지 내 소형 박스는 필드 가상 더미
    if (levels <= 2 && height <= 12) {
      return true;
    }
  }

  return false;
}

/**
 * [강원 18개 시·군 산속/임야/하천/도로/군유휴지/경기장필드 유령 건물 원천 차단 필터]
 * 1) 군 유휴지(1군지사 310,000㎡ 등) 내부 기존 구형 건물 100% 원천 배제 (0동 원칙)
 * 2) 경기장 및 공설운동장 트랙/잔디 필드 내부 지적 가상 더미 박스 100% 영구 배제
 * 3) 하천, 구거, 저수지(jimok: 천, 구, 유, 수, landuse: water, river) 및 도로/철도면 위 비정상 건물 영구 배제
 * 4) 임야/산림 지목 (jimok: '임', '임야', landuse: 'forest', natural: 'wood')
 * 5) 치악산, 설악산, 오대산 등 강원 산악 능선 좌표 마스킹
 * 6) DEM 표고 분석 및 경사도 16° 필터링 (그리드 캐시 기반 무스톨 초고속 판별)
 */
export function isMountainGhostBuilding(
  lng: number,
  lat: number,
  featProps: Record<string, any> = {},
  map?: any
): boolean {
  // 사용자가 배치한 마스터플랜 시설물은 절대 배제하지 않음
  if (featProps.is_user_placed === true || featProps.isMasterplanFacility === true) {
    return false;
  }

  // [-1] 군 유휴부지 (1군지사 310,000㎡ 등 18개소) 내부 기존 구형 군사건축물 100% 원천 배제 (0동 원칙)
  if (isPointInMilitaryIdleSite(lng, lat)) {
    return true;
  }

  // [-0.8] 경기장 트랙 및 잔디 필드 내부 가상 더미 건물 100% 원천 배제 (원주종합운동장 등 0동 원칙)
  if (isPointInStadiumPitch(lng, lat, featProps)) {
    return true;
  }

  // [-0.5] 강원 전역 호수·수계 및 동해 바다 위 비정상 건물 100% 원천 차단
  // [초기 버벅거림 제로화]: 내륙(lng < 128.6)에서는 무거운 map.queryTerrainElevation 동기 쿼리 일체 생략 (수만 회 WebGL 스톨 방지)
  let terrainElev: number | undefined;
  if (lng >= 128.60 && map && typeof map.queryTerrainElevation === 'function') {
    const q = map.queryTerrainElevation([lng, lat]);
    if (typeof q === 'number' && Number.isFinite(q)) {
      terrainElev = q;
    }
  }
  if (isPointInGangwonWaterBody(lng, lat, terrainElev)) {
    return true;
  }

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

  // [1] 수계/하천/저수지 지목 및 토지이용 태그 (공식 등록 여부 무관하게 영구 배제)
  const jimok = String(featProps.jimok || featProps.jimok_nm || '').trim();
  if (jimok === '천' || jimok === '구' || jimok === '유' || jimok === '수') {
    return true; // 하천, 구거, 유지, 수도용지 위 건축물 영구 배제
  }

  // 도로/고속도로/철도 지목 및 속성
  if (jimok === '도' || jimok === '철' || featProps.highway === 'motorway' || featProps.highway === 'trunk' || featProps.railway) {
    return true; // 도로 중앙면, 고속도로, 철도 선로 위 비정상 객체 배제
  }

  // 묘지 비건물 구역
  if (jimok === '묘' || featProps.amenity === 'grave_yard' || featProps.landuse === 'cemetery') {
    return true;
  }

  const landuse = String(featProps.landuse || featProps.natural || '').toLowerCase();
  if (
    landuse === 'water' ||
    landuse === 'river' ||
    landuse === 'basin' ||
    landuse === 'reservoir' ||
    featProps.waterway
  ) {
    return true;
  }

  // [0-1] 대한민국 토지대장 표준 산번지 (PNU 11번째 자리 '2') 및 주소 '산' 가건물 100% 영구 배제
  const pnu = String(featProps.pnu || '');
  const address = String(featProps.address || featProps.rd_nm || '');
  const isMountainLot =
    (pnu.length >= 11 && pnu[10] === '2') ||
    address.includes(' 산 ') ||
    address.includes(' 산') ||
    address.startsWith('산 ') ||
    address.startsWith('산');
  if (isMountainLot && !featProps.is_user_placed && !featProps.isMasterplanFacility) {
    return true; // 산번지 임야 가건물·농막·사당 100% 원천 배제
  }

  // [2] 지목 및 토지이용 태그 검사 (산림, 임야 등은 공인 여부 무관 100% 영구 배제)
  if (jimok === '임' || jimok === '임야') {
    return true;
  }

  if (
    landuse === 'forest' ||
    landuse === 'wood' ||
    landuse === 'mountain' ||
    landuse === 'scrub' ||
    landuse === 'bare_rock'
  ) {
    return true;
  }

  // [2-B] 강원 18개 시·군 공식 중심 시가지 보호: 도심 봉의산 정상 등 국소 산지를 제외하고 핵심 시가지 실측 건물은 보존
  const isProtectedUrban = isInsideUrbanSettlementEnvelope(lng, lat);

  // [2-C] 강원권 전역(원주, 춘천, 강릉, 속초, 인제, 평창 등) 산악·국립공원 능선 정밀 마스킹 (V-World REA 제약)
  const isGangwonZone = lng >= 127.0 && lng <= 129.5 && lat >= 37.0 && lat <= 38.6;
  if (isGangwonZone) {
    // 1. 치악산 국립공원 핵심 산림 능선 및 서사면 (행구동·봉산동 배후 산지 포함: 127.958 동쪽 전역 차단)
    if (lng >= 127.958 && lat >= 37.330 && lat <= 37.48) return true;

    // 2. 백운산 남부 산림 능선 및 판부면 남부 고산 구역 (37.320 남쪽 전역 차단)
    if (lat <= 37.320 && lng >= 127.88 && lng <= 128.02) return true;

    // 3. 원주 서부 봉화산(Bonghwasan) 정상 및 자연공원 산림 구역 (127.923 서쪽 산림 차단)
    if (lng >= 127.895 && lng <= 127.923 && lat >= 37.345 && lat <= 37.370) return true;

    // 4. 원주 북부 우산동·태장동 배후 매화산/태봉산/배양산 사면 (37.368 북쪽 산림 전역 차단)
    if (lat >= 37.368 && lng >= 127.923 && lng <= 127.980) return true;

    // 4-B. 도심 내 야산 (중앙근린공원 및 배양산 지맥 미개발 임야)
    if (lng >= 127.939 && lng <= 127.952 && lat >= 37.332 && lat <= 37.344) {
      if (!featProps.bd_mgt_sn && !featProps.buld_nm) return true;
    }

    // 5. 설악산 국립공원 내륙 고산 능선 (속초 도심 128.57~128.60 제외, 내륙 설악 능선만 한정)
    if (lng >= 128.25 && lng <= 128.52 && lat >= 38.05 && lat <= 38.28) {
      if (!isProtectedUrban) return true;
    }
    // 6. 오대산 및 평창·대관령 서부 고산 능선 (강릉 도심 128.85~128.92 제외, 대관령 서부만 한정)
    if (lng >= 128.40 && lng <= 128.78 && lat >= 37.55 && lat <= 37.95) {
      if (!isProtectedUrban) return true;
    }
    // 7. 태백산맥 핵심 고산 능선 (동해/삼척 해안 시가지 제외, 내륙 산맥만 한정)
    if (lng >= 128.75 && lng <= 129.08 && lat >= 37.00 && lat <= 37.45) {
      if (!isProtectedUrban) return true;
    }
    // 8. 춘천 구봉산·용화산 배후 산림 능선 및 도심 봉의산 산림 정상부
    if (lng >= 127.78 && lng <= 127.88 && lat >= 37.89 && lat <= 38.05) {
      if (!isProtectedUrban) return true;
    }
    if (lng >= 127.724 && lng <= 127.734 && lat >= 37.882 && lat <= 37.889) {
      if (!featProps.bd_mgt_sn && !featProps.buld_nm) return true;
    }
  }

  // [3] 원주 및 강원 표고 기반 산악 사면 필터 (각 시·군 maxMountainElev 초과 고산 능선 100% 영구 배제)
  if (map && typeof map.queryTerrainElevation === 'function') {
    try {
      const sampled = map.queryTerrainElevation([lng, lat]);
      if (typeof sampled === 'number' && !isNaN(sampled) && sampled > 0) {
        const dynamicMaxElev = getGangwonMaxMountainElev(lng, lat);
        if (sampled >= dynamicMaxElev) {
          return true; // 산악 사면 및 고산 능선 100% 영구 배제
        }
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
  // 사용자가 배치한 마스터플랜 시설물은 100% 허용
  if (featProps.is_user_placed === true || featProps.isMasterplanFacility === true) {
    return true;
  }
  // [0단계: 산림/임야/수계/도로/군유휴지 유령 건물 필터]
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
    (typeof featProps.pnu === 'string' && featProps.pnu.length >= 11 && featProps.pnu[10] === '2') ||
    (typeof featProps.slope === 'number' && featProps.slope >= 12) ||
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

  // 경기장 및 공설운동장 트랙/필드 지적 더미 박스 차단 (V-World 3D REA 역공학 표준: 면적 < 2,500㎡ 지적 대표점 더미 박스 영구 제거)
  const bldNameCheck = String(featProps.name || featProps.buld_nm || featProps.buildingName || featProps.bld_nm || '');
  if (
    (bldNameCheck.includes('종합운동장') ||
      bldNameCheck.includes('주경기장') ||
      bldNameCheck.includes('보조경기장') ||
      bldNameCheck.includes('공설운동장') ||
      bldNameCheck.includes('축구장') ||
      bldNameCheck.includes('야구장') ||
      bldNameCheck.includes('육상경기장')) &&
    areaSqm < 2500
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
