/**
 * utils/layerBudgetGuard.ts
 *
 * GPU 과부하 및 프레임 드랍을 원천 방지하기 위해
 * MapLibre 맵의 전체 활성 레이어(visibility !== 'none') 수를 항상 15개 이하로 엄격히 제한하는 성능 가드레일.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

export const MAX_ACTIVE_LAYERS_LIMIT = 60;

/**
 * 절대 숨기면 안 되는 핵심 필수 레이어 접두사 목록
 */
const ESSENTIAL_LAYER_PREFIXES = [
  'satellite-base',
  'clean-layer',
  'streetsgl-road',
  'realistic-korean',
  'vworld-poi',
  'vworld-zoning',
  'local-cadastral',
  'molit-bridge-tunnel',
  'bldg-',
  'real-',
  '3d-buildings',
  'fusion-buildings',
  'custom-water-level',
  'tactical-defense',
];

/**
 * 현재 활성 레이어 수를 검사하고 15개를 초과할 경우 비필수 레이어부터 비활성화
 */
export function enforceMaxActiveLayers(map: MapLibreMap, maxLimit = MAX_ACTIVE_LAYERS_LIMIT): number {
  if (!map) return 0;
  const style = map.getStyle();
  if (!style || !style.layers) return 0;

  const visibleLayers: any[] = [];
  for (const layer of style.layers) {
    try {
      const vis = map.getLayoutProperty(layer.id, 'visibility');
      if (vis !== 'none') {
        visibleLayers.push(layer);
      }
    } catch {
      // ignore
    }
  }

  if (visibleLayers.length <= maxLimit) {
    return visibleLayers.length;
  }

  // 15개 초과 시: 비필수 레이어(비활성 분석 오버레이, 버퍼링, 측정 도구 등)부터 차례로 숨김 처리
  let count = visibleLayers.length;
  for (let i = visibleLayers.length - 1; i >= 0 && count > maxLimit; i--) {
    const layer = visibleLayers[i];
    const isEssential = ESSENTIAL_LAYER_PREFIXES.some((p) => layer.id.startsWith(p));
    if (!isEssential) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        count--;
      } catch {
        // ignore
      }
    }
  }

  return count;
}
