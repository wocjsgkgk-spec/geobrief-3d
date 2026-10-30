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
import type { RenderMode3D } from '@/types/map';

export const ALL_FILL_EXTRUSION_LAYER_IDS = [
  'bldg-tier1-podium',
  'bldg-tier2-mainwall',
  'bldg-tier3-pattern',
  'bldg-tier4-roofcap',
  'bldg-tier5-roofdetail',
  '3d-buildings',
  '3d-buildings-roof',
  'buildings-extrusion',
  'fusion-buildings-3d',
  'fusion-buildings-roof',
  'fusion-buildings-extrusion',
  'real-buildings-3d',
  'real-buildings-roof',
  'vworld-3d-buildings-extrusion',
  'lod2-buildings-layer',
  'lod2-parapet-layer',
  'lod2-penthouse-layer',
];

export interface Master3DRendererOptions {
  renderMode3D: RenderMode3D;
  isBuildingsVisible: boolean;
  realisticKoreanCityLayer?: RealisticKoreanCityLayer | null;
  lod2BuildingEngine?: LOD2BuildingEngine | null;
  deck3DTilesManager?: { attachToMap: (m: any) => void; detachFromMap: () => void; update?: (cfg: any) => void } | null;
  threeboxLayer?: { setLodMode: (m: any) => void; setVisible: (v: boolean) => void } | null;
  placedFacilitiesCount?: number;
}

/**
 * 마스터 3D 렌더러 상태 머신 동기화 실행기
 */
export function syncMaster3DRenderer(
  map: maplibregl.Map | null,
  opts: Master3DRendererOptions
): void {
  if (!map) return;

  const {
    renderMode3D,
    isBuildingsVisible,
    realisticKoreanCityLayer,
    lod2BuildingEngine,
    deck3DTilesManager,
    threeboxLayer,
    placedFacilitiesCount = 0,
  } = opts;

  // 1. 건물이 꺼져 있는 경우: 모든 3D 엔진 일괄 숨김
  if (!isBuildingsVisible) {
    if (realisticKoreanCityLayer) realisticKoreanCityLayer.setVisible(false);
    if (lod2BuildingEngine) lod2BuildingEngine.setVisible(false);
    if (deck3DTilesManager) deck3DTilesManager.detachFromMap();
    if (threeboxLayer) threeboxLayer.setVisible(false);

    // 모든 fill-extrusion 레이어 none
    ALL_FILL_EXTRUSION_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
    });
    return;
  }

  // 2. 건물이 켜져 있는 경우: 모드별 단일 마스터 엔진 활성화 (상호 배타적 분기)
  if (renderMode3D === 'facade') {
    // [모드 A (권장 / 기본)]: Three.js RealisticKoreanCityLayer 단독 활성화
    if (realisticKoreanCityLayer) realisticKoreanCityLayer.setVisible(true);
    if (lod2BuildingEngine) lod2BuildingEngine.setVisible(false);
    if (deck3DTilesManager) deck3DTilesManager.detachFromMap();

    if (threeboxLayer) {
      threeboxLayer.setLodMode('lod2');
      threeboxLayer.setVisible(placedFacilitiesCount > 0);
    }

    // [이중 겹침 및 Z-Fighting 영구 차단]: 모든 MapLibre fill-extrusion 레이어 100% 숨김
    ALL_FILL_EXTRUSION_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
    });
  } else if (renderMode3D === 'native') {
    // [모드 B]: MapLibre 네이티브 GPU 다층 슬라이스 활성화
    if (realisticKoreanCityLayer) realisticKoreanCityLayer.setVisible(false);
    if (lod2BuildingEngine) lod2BuildingEngine.setVisible(false);
    if (deck3DTilesManager) deck3DTilesManager.detachFromMap();

    if (threeboxLayer) {
      threeboxLayer.setLodMode('lod1');
      threeboxLayer.setVisible(placedFacilitiesCount > 0);
    }

    // GPU building layers만 활성화
    const nativeIds = [
      'bldg-tier1-podium',
      'bldg-tier2-mainwall',
      'bldg-tier4-roofcap',
      'bldg-tier5-roofdetail',
      '3d-buildings',
    ];
    nativeIds.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'visible');
      }
    });

    // 불필요한 레이어 숨김
    ['bldg-tier3-pattern', 'buildings-extrusion'].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
    });
  } else if (renderMode3D === 'tiles3d') {
    // [모드 C]: 외부 3D Tiles 스트리밍 활성화
    if (realisticKoreanCityLayer) realisticKoreanCityLayer.setVisible(false);
    if (lod2BuildingEngine) lod2BuildingEngine.setVisible(false);

    if (deck3DTilesManager) {
      deck3DTilesManager.attachToMap(map);
    }

    if (threeboxLayer) {
      threeboxLayer.setLodMode('lod2');
      threeboxLayer.setVisible(placedFacilitiesCount > 0);
    }

    // fill-extrusion 숨김
    ALL_FILL_EXTRUSION_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', 'none');
      }
    });
  }
}

/**
 * [전역 기하 필터] 비건물 및 이상 거대 폴리곤 검증 (면적 > 4,500㎡ 차단)
 */
export function isPermittedBuildingPolygon(
  featProps: Record<string, any> = {},
  areaSqm: number,
  spanX: number,
  spanZ: number,
  maxEdgeLen: number
): boolean {
  // 1. 면적 4,500㎡ 초과 비건물 (필지, 단지, 공원, 행정구역 경계) 영구 차단
  if (areaSqm > 4500 || areaSqm < 4.0) {
    return false;
  }

  // 2. 가로/세로 span 220m 초과 또는 단일 변 180m 초과 (찢어짐 방지)
  if (spanX > 220 || spanZ > 220 || maxEdgeLen > 180) {
    return false;
  }

  // 3. 비건물 속성 태그 영구 차단
  if (featProps.is_non_building === true || featProps.is_site_boundary === true) {
    return false;
  }

  // 용도지역(UQ111), 단지(landuse), 공원(leisure), 행정경계(admin_level)
  if (
    featProps.UQ111 ||
    featProps.UQ111_NM ||
    featProps.uq111 ||
    featProps.zoneName ||
    featProps.zone_nm ||
    featProps.spfc_nm ||
    featProps.spfc_cd ||
    featProps.landuse ||
    featProps.leisure ||
    featProps.boundary ||
    featProps.admin_level ||
    featProps.natural
  ) {
    return false;
  }

  // 순수 지적도 필지(PNU, 지번, 지목만 있고 건축물 속성이 없는 경우)
  const isPureCadastralParcel =
    Boolean(featProps.pnu || featProps.jimok || featProps.jibun) &&
    !featProps.bd_mgt_sn &&
    !featProps.buld_nm &&
    !featProps.bldNm &&
    !featProps.buildingName &&
    !featProps.grnd_flr &&
    !featProps.gro_flo_co &&
    !featProps.grndFlrCnt &&
    !featProps.hei &&
    !featProps.heit &&
    !featProps.height;

  if (isPureCadastralParcel) {
    return false;
  }

  return true;
}

/**
 * [전역 높이 필터] 소형 필지(area < 250㎡) 연필 기둥 방지 및 세장비 제한
 */
export function sanitizeBuildingHeight(
  rawHeight: number,
  areaSqm: number,
  minWidth: number,
  seed: number,
  isHighRiseApt: boolean
): number {
  let h = rawHeight;

  // 1. 소형 필지(area < 250㎡) 연필 기둥 현상 영구 차단:
  // 어떤 경우에도 11.0m 이하(2.5~3층)로 엄격 제한!
  if (areaSqm < 250) {
    const maxSmallH = 7.5 + (seed % 4) * 0.8; // 7.5m ~ 9.9m
    if (h > 11.0) {
      h = Math.min(11.0, maxSmallH);
    }
  }

  // 2. 바닥 면적 250㎡ ~ 450㎡ 중소형 건물
  if (areaSqm >= 250 && areaSqm < 450 && !isHighRiseApt) {
    if (h > 18.0) {
      h = Math.min(18.0, 12.0 + (seed % 5) * 1.0);
    }
  }

  // 3. 세장비(Slenderness Ratio) 안전 제한: 높이는 건물 최소 폭의 3.5배를 초과 불가
  const maxAllowedSlenderH = Math.max(8.0, minWidth * 3.5);
  if (h > maxAllowedSlenderH) {
    h = Math.min(h, Math.max(8.0, maxAllowedSlenderH));
  }

  // 4. 진짜 대단지 아파트 (45m ~ 78m 보장)
  if (isHighRiseApt && areaSqm >= 350 && h < 45.0) {
    h = 48.0 + (seed % 28) * 1.0;
  }

  return Math.max(6.5, Math.round(h * 10) / 10);
}
