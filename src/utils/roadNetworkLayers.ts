/**
 * roadNetworkLayers.ts
 *
 * [3단계: 실측 미터(m) 폭 기반 3D 아스팔트 노면·차선·횡단보도 렌더링 엔진]
 * Streets-GL 벤더링 모듈(lib/vendor/streetsGlRoadLayers.ts)과 100% 통합 및 호환성 브릿지
 */

import {
  STREETS_GL_ROAD_LAYER_IDS,
  getStreetsGlRoadLayerDefinitions,
  createMeterScaleWidthExpr,
  createOffsetExpr,
} from '@/lib/vendor/streetsGlRoadLayers';

export {
  STREETS_GL_ROAD_LAYER_IDS,
  getStreetsGlRoadLayerDefinitions,
  createMeterScaleWidthExpr,
  createOffsetExpr,
};

export const ROAD_LAYER_IDS = STREETS_GL_ROAD_LAYER_IDS;
export const getRoadNetworkLayerDefinitions = getStreetsGlRoadLayerDefinitions;
