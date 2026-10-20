/**
 * utils/koreanRoadRenderer.ts
 *
 * [1단계: 고성능 도로망 통합 렌더러 (71개 중복 레이어 -> 2개 통합 레이어)]
 * - MapLibre 레이어 수를 15개 이하로 다이어트하고 60fps를 보장하기 위해
 *   수십 개의 도로 케이싱/차선/교량 레이어를 2개의 고성능 벡터 라인 레이어로 완전 통합.
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 실측 도로 렌더링에 등록되는 통합 레이어 ID 목록 (단 2개)
 */
export const KOREAN_ROAD_LAYER_IDS: string[] = [
  'korean-roads-casing',
  'korean-roads-surface',
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
 * 한국형 실측 도로망 MapLibre 레이어 스펙 생성 함수 (2단 고성능 통합)
 */
export function getKoreanRoadLayerDefinitions(
  sourceId = 'openmaptiles-vector',
  sourceLayer = 'transportation',
  crosswalkSourceId = 'crosswalks-source'
): LayerSpecification[] {
  const layers: LayerSpecification[] = [
    // 1) 도로 외곽 아스팔트 케이싱 (단일 패스)
    {
      id: 'korean-roads-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#0f172a',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk'], 2.8, ['primary', 'secondary'], 1.8, 1.0],
          14, ['match', ['get', 'class'], ['motorway', 'trunk'], 8.0, ['primary', 'secondary'], 6.0, 3.2],
          16, ['match', ['get', 'class'], ['motorway', 'trunk'], 18.0, ['primary', 'secondary'], 13.0, 6.5],
          18, ['match', ['get', 'class'], ['motorway', 'trunk'], 36.0, ['primary', 'secondary'], 24.0, 12.0],
        ],
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // 2) 도로 표면 위계별 색상 및 노면 (단일 패스)
    {
      id: 'korean-roads-surface',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk'], '#ea580c', // 주황색 고속도로
          ['primary'], '#f59e0b',           // 황색 주간선도로
          ['secondary', 'tertiary'], '#f8fafc', // 백색 보조간선도로
          ['rail', 'transit'], '#94a3b8',   // 철도
          '#64748b'                         // 일반/이면도로 아스팔트
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk'], 2.0, ['primary', 'secondary'], 1.2, 0.6],
          14, ['match', ['get', 'class'], ['motorway', 'trunk'], 6.5, ['primary', 'secondary'], 4.8, 2.4],
          16, ['match', ['get', 'class'], ['motorway', 'trunk'], 15.0, ['primary', 'secondary'], 10.5, 5.0],
          18, ['match', ['get', 'class'], ['motorway', 'trunk'], 30.0, ['primary', 'secondary'], 20.0, 9.5],
        ],
        'line-opacity': 0.95,
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
