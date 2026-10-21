/**
 * utils/koreanLanduseRenderer.ts
 *
 * [1단계: 위성 격자 얼룩 제거 및 국토부 브이월드 균일 항공영상 토지피복 블렌딩]
 * - 타일 간 색차(녹색/갈색 격자)를 중화시키는 벡터 토지피복(landcover, landuse 산림/녹지 #2d4a3e, 투명도 0.22) 블렌딩
 * - 위성사진 상단에 부드럽게 융합되어 타일 경계선이 드러나지 않도록 지형 색감을 균일하게 통일
 */

import type { LayerSpecification } from 'maplibre-gl';

export const KOREAN_LANDUSE_LAYER_IDS: string[] = [
  'korean-landcover-forest-blend',
  'korean-landuse-forest-blend',
];

export function getKoreanLanduseLayerDefinitions(
  sourceId = 'openmaptiles-vector'
): LayerSpecification[] {
  return [
    {
      id: 'korean-landcover-forest-blend',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landcover',
      minzoom: 8,
      maxzoom: 24,
      filter: [
        'match',
        ['get', 'class'],
        ['wood', 'forest', 'scrub', 'grass'],
        true,
        false,
      ],
      paint: {
        'fill-color': '#2d4a3e', // 사용자 지정 산림/녹지 톤
        'fill-opacity': 0.22,    // 사용자 지정 투명도 0.22
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'korean-landuse-forest-blend',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 8,
      maxzoom: 24,
      filter: [
        'match',
        ['get', 'class'],
        ['forest', 'wood', 'park', 'grass'],
        true,
        false,
      ],
      paint: {
        'fill-color': '#2d4a3e', // 사용자 지정 산림/녹지 톤
        'fill-opacity': 0.22,    // 사용자 지정 투명도 0.22
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },
  ];
}
