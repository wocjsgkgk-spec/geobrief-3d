/**
 * utils/koreanLanduseRenderer.ts
 *
 * [1단계: 레이어 다이어트 - 토지피복 중복 레이어 비활성화]
 * - 위성사진이 고해상도 베이스로 표출되므로 중복 21개 토지피복 레이어를 제외하여
 *   스타일 레이어 총합을 15개 이하로 유지하고 60fps를 보장합니다.
 */

import type { LayerSpecification } from 'maplibre-gl';

export const KOREAN_LANDUSE_LAYER_IDS: string[] = [];

export function getKoreanLanduseLayerDefinitions(
  sourceId = 'openmaptiles-vector',
  sourceLayer = 'landuse'
): LayerSpecification[] {
  return [];
}
