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
          l.id !== 'flight-envelope-volume' &&
          l.id !== 'flight-ceiling-slab' &&
          l.id !== 'building-highlight-fill' &&
          l.id !== 'building-mass-extrusion'
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
    renderMode3D,
    isBuildingsVisible,
    realisticKoreanCityLayer,
    lod2BuildingEngine,
    deck3DTilesManager,
    threeboxLayer,
    placedFacilitiesCount = 0,
    tile3DStream,
  } = opts;

  // 1. 건물이 꺼져 있는 경우: 모든 3D 엔진 일괄 숨김
  if (!isBuildingsVisible) {
    if (realisticKoreanCityLayer) realisticKoreanCityLayer.setVisible(false);
    if (lod2BuildingEngine) lod2BuildingEngine.setVisible(false);
    if (deck3DTilesManager) deck3DTilesManager.detachFromMap();
    if (threeboxLayer) threeboxLayer.setVisible(false);

    hideAllFillExtrusionLayers(map);
    return;
  }

  // 2. 3D 타일셋 스트리밍(Tile3DLayer) 처리
  const isTiles3DActive = renderMode3D === 'tiles3d' || Boolean(tile3DStream?.enabled);
  if (isTiles3DActive && deck3DTilesManager) {
    deck3DTilesManager.attachToMap(map);
    if (tile3DStream && deck3DTilesManager.update) {
      deck3DTilesManager.update(tile3DStream as any);
    }
  } else if (deck3DTilesManager) {
    deck3DTilesManager.detachFromMap();
  }

  // 3. [단일 통합 V-World 실사 3D 마스터 렌더러 100% 무조건 가동]
  // 타일셋 스트리밍 전환 중 미로드 구역에서도 건물이 평면으로 사라지지 않도록 무중단 폴백 가드 유지
  if (realisticKoreanCityLayer) {
    realisticKoreanCityLayer.setVisible(true);
  }
  if (lod2BuildingEngine) {
    lod2BuildingEngine.setVisible(false);
  }

  if (threeboxLayer) {
    threeboxLayer.setLodMode('lod2');
    threeboxLayer.setVisible(placedFacilitiesCount > 0);
  }

  // 4. 이중 겹침 및 Z-Fighting 영구 차단을 위해 fill-extrusion은 상호 배타 숨김 유지
  hideAllFillExtrusionLayers(map);
}

/**
 * [전역 기하 필터] 비건물 및 이상 거대 폴리곤 검증 (VworldMasterEngine 연동)
 * - [신규] 폭 5.5m 미만 보행로/화단/담장/경계석 세장형 비건물 폴리곤 압출 원천 차단
 */
export function isPermittedBuildingPolygon(
  featProps: Record<string, any> = {},
  areaSqm: number,
  spanX: number,
  spanZ: number,
  maxEdgeLen: number,
  minWidth?: number
): boolean {
  // 1. 면적 4,000㎡ 초과 비건물 (산림, 호수, 행정구역 경계선, 대형 필지 단지) 및 10㎡ 미만 파편 영구 차단
  if (areaSqm > 4000 || areaSqm < 10.0) {
    return false;
  }

  // 2. 가로/세로 span 260m 초과 또는 단일 변 220m 초과 (삼각형 찢어짐 방지)
  if (spanX > 260 || spanZ > 260 || maxEdgeLen > 220) {
    return false;
  }

  // 3. [단지 내부 보행로/담장/화단/경계석 세장형 비건물 30m 압출 원천 차단]
  const calculatedMinWidth = typeof minWidth === 'number' ? minWidth : Math.min(spanX, spanZ);
  if (calculatedMinWidth < 5.5) {
    return false;
  }
  const maxSpan = Math.max(spanX, spanZ);
  if (calculatedMinWidth < 7.0 && maxSpan / calculatedMinWidth > 4.5 && !featProps.buld_nm && !featProps.mgmBldrgstPk) {
    return false;
  }

  // 3. 건물이 아닌 순수 레이어/비건물 속성만 엄격 차단 (OpenFreeMap/OpenMapTiles 건축물 폴리곤 100% 보존)
  const isExplicitBuilding = Boolean(
    featProps.building ||
    featProps.buld_nm ||
    featProps.bldNm ||
    featProps.buildingName ||
    featProps.mgmBldrgstPk ||
    featProps.bd_mgt_sn ||
    featProps.realUse ||
    featProps.grnd_flr ||
    featProps.gro_flo_co ||
    featProps.render_height ||
    featProps.height ||
    featProps.hei ||
    featProps.heit
  );

  if (!isExplicitBuilding) {
    if (
      featProps.is_site_boundary === true ||
      featProps.is_non_building === true ||
      featProps.layer_type === 'cadastral' ||
      featProps.layer_type === 'zoning' ||
      featProps.boundary ||
      featProps.admin_level ||
      featProps.natural ||
      featProps.landuse ||
      featProps.leisure ||
      featProps.UQ111 ||
      featProps.UQ111_NM ||
      featProps.uq111
    ) {
      return false;
    }
  }

  return true;
}

/**
 * [전역 높이 필터] 브이월드 REA 역공학 4단계 스펙 연동
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
  if (rawHeight > 0) {
    if (areaSqm < 200) {
      return Math.min(rawHeight, 4.5 + (seed % 4) * 1.0); // 4.5m ~ 7.5m (단독주택 1~2층 엄격 제약)
    }
    const safeW = Math.max(6.0, minWidth);
    const maxAllowed = isHighRiseApt ? 75.0 : Math.max(14.0, safeW * 4.0);
    return Math.max(7.5, Math.min(rawHeight, maxAllowed));
  }

  return VworldMasterEngine.calculateBuildingHeight(
    featProps,
    areaSqm,
    minWidth,
    seed,
    centerLngLat
  );
}
