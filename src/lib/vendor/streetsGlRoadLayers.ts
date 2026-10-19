/**
 * lib/vendor/streetsGlRoadLayers.ts
 *
 * [2단계: 한국형 실측 도로망(아스팔트 노면·차선·횡단보도·보도블록 연석) 정밀 렌더링 엔진 브릿지]
 * utils/koreanRoadRenderer.ts와 100% 통합 호환성 레이어
 */

import {
  KOREAN_ROAD_LAYER_IDS,
  getKoreanRoadLayerDefinitions,
  createMeterScaleWidthExpr,
  createDynamicLanesWidthExpr,
  createOffsetExpr,
} from '@/utils/koreanRoadRenderer';

export const STREETS_GL_ROAD_LAYER_IDS = KOREAN_ROAD_LAYER_IDS;
export const getStreetsGlRoadLayerDefinitions = getKoreanRoadLayerDefinitions;
export { createMeterScaleWidthExpr, createDynamicLanesWidthExpr, createOffsetExpr };

