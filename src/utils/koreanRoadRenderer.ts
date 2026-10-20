/**
 * utils/koreanRoadRenderer.ts
 *
 * [2단계: 실측 도로망 및 위성사진 자연스러운 블렌딩 렌더러]
 * - 흰색 도로 외곽선(Casing)의 투명도를 0.25로 낮추고 폭을 축소하여 위성사진과 자연스럽게 어우러지게 정돈
 * - 도로 본체는 차분한 다크 아스팔트(#26292e)로 처리
 * - 주요 간선도로에는 얇고 선명한 황색 중앙선(#eab308)을 부여하여 한국 실측 도로 외관 완성
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 실측 도로 렌더링에 등록되는 통합 레이어 ID 목록 (단 3개)
 */
export const KOREAN_ROAD_LAYER_IDS: string[] = [
  'korean-roads-casing',
  'korean-roads-surface',
  'korean-roads-centerline',
];

export function createMeterScaleWidthExpr(
  baseMeters: number,
  minZoom = 11,
  minPx = 1.0
): any[] {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    minZoom, minPx,
    14, Math.max(minPx, baseMeters * 0.25),
    16, Math.max(minPx, baseMeters * 0.7),
    18, Math.max(minPx, baseMeters * 1.5),
  ];
}

export function createDynamicLanesWidthExpr(
  baseMeters: number,
  minZoom = 11,
  minPx = 1.0
): any[] {
  return createMeterScaleWidthExpr(baseMeters, minZoom, minPx);
}

export function createOffsetExpr(baseOffsetMeters: number): any[] {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    11, 0,
    14, Number((baseOffsetMeters * 0.25).toFixed(2)),
    16, Number((baseOffsetMeters * 0.7).toFixed(2)),
    18, Number((baseOffsetMeters * 1.5).toFixed(2)),
  ];
}

/**
 * 한국형 실측 도로망 MapLibre 레이어 스펙 생성 함수
 */
export function getKoreanRoadLayerDefinitions(
  sourceId = 'openmaptiles-vector',
  sourceLayer = 'transportation',
  _crosswalkSourceId = 'crosswalks-source'
): LayerSpecification[] {
  const layers: LayerSpecification[] = [
    // 1) 도로 외곽선 케이싱 (투명도 0.25, 폭 축소로 위성사진과의 부드러운 블렌딩)
    {
      id: 'korean-roads-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.25, // 요구사항 반영: 투명도 0.25
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk'], 2.0, ['primary', 'secondary'], 1.4, 0.8],
          14, ['match', ['get', 'class'], ['motorway', 'trunk'], 5.0, ['primary', 'secondary'], 3.8, 2.0],
          16, ['match', ['get', 'class'], ['motorway', 'trunk'], 11.0, ['primary', 'secondary'], 8.2, 4.2],
          18, ['match', ['get', 'class'], ['motorway', 'trunk'], 20.0, ['primary', 'secondary'], 14.5, 7.5],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // 2) 도로 본체 아스팔트 노면 (차분한 다크 아스팔트 #26292e)
    {
      id: 'korean-roads-surface',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#26292e', // 요구사항 반영: 차분한 다크 아스팔트
        'line-opacity': 0.92,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk'], 1.5, ['primary', 'secondary'], 1.0, 0.5],
          14, ['match', ['get', 'class'], ['motorway', 'trunk'], 4.0, ['primary', 'secondary'], 3.0, 1.5],
          16, ['match', ['get', 'class'], ['motorway', 'trunk'], 9.2, ['primary', 'secondary'], 7.0, 3.2],
          18, ['match', ['get', 'class'], ['motorway', 'trunk'], 17.0, ['primary', 'secondary'], 12.0, 6.0],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // 3) 주요 간선도로 얇고 선명한 황색 중앙선 (#eab308)
    {
      id: 'korean-roads-centerline',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
      minzoom: 12,
      maxzoom: 24,
      paint: {
        'line-color': '#eab308', // 요구사항 반영: 얇고 선명한 황색 중앙선
        'line-opacity': 0.9,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12, 0.6,
          14, 1.1,
          16, 1.8,
          18, 2.8,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
  ];

  return layers;
}
