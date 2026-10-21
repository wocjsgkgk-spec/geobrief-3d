/**
 * utils/koreanRoadRenderer.ts
 *
 * [2단계: 도로 노란색 이중선 과다 표출 정리 및 한국형 실측 도로 렌더러]
 * - 노란색 중앙선(#eab308)은 오직 왕복 4차선 이상 주간선도로(motorway, trunk, primary)에만 얇게(1px~1.5px) 표시
 * - 일반 시내 도로와 골목길(secondary, tertiary, residential, service)은 노란색 선 없이 차분한 다크 아스팔트(#2c3038, 투명도 0.75)로만 깔끔하게 표출
 * - 고배율에서도 위성사진을 과도하게 가리지 않고 자연스러운 실측 노면 정합 제공
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 실측 도로망 MapLibre 등록 통합 레이어 ID 목록
 */
export const KOREAN_ROAD_LAYER_IDS: string[] = [
  'road-asphalt',
  'road-centerline',
  'road-lanes',
  // 하위 호환성 ID 목록
  'korean-roads-surface',
  'korean-roads-centerline',
];

/**
 * 지수 보간(exponential base 1.5) 도로 폭 계산기
 */
export function createMeterScaleWidthExpr(
  baseMeters: number,
  minZoom = 11,
  minPx = 1.0
): any[] {
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    minZoom, minPx,
    13, Math.max(minPx, Number((baseMeters * 0.28).toFixed(2))),
    15, Math.max(minPx, Number((baseMeters * 0.75).toFixed(2))),
    16.5, Math.max(minPx, Number((baseMeters * 1.55).toFixed(2))),
    18, Math.max(minPx, Number((baseMeters * 2.85).toFixed(2))),
    20, Math.max(minPx, Number((baseMeters * 5.50).toFixed(2))),
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
    ['exponential', 1.5],
    ['zoom'],
    11, 0,
    13, Number((baseOffsetMeters * 0.28).toFixed(2)),
    15, Number((baseOffsetMeters * 0.75).toFixed(2)),
    16.5, Number((baseOffsetMeters * 1.55).toFixed(2)),
    18, Number((baseOffsetMeters * 2.85).toFixed(2)),
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
  // 왕복 4차선 이상 주간선도로 필터
  const arterialFilter: any = [
    'match',
    ['get', 'class'],
    ['motorway', 'trunk', 'primary'],
    true,
    false,
  ];

  const layers: LayerSpecification[] = [
    // -------------------------------------------------------------------------
    // 1. 도로 본체 아스팔트 노면 레이어 (road-asphalt)
    // - 주간선도로: 짙은 다크 차콜 아스팔트 (#1E293B, 투명도 0.92)
    // - 일반 시내 도로 및 골목길: 차분한 다크 아스팔트 (#2c3038, 투명도 0.75)
    // -------------------------------------------------------------------------
    {
      id: 'road-asphalt',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary'],
          '#1E293B', // 주간선 다크 차콜
          '#2c3038', // 일반 시내도로 및 골목길 (secondary, tertiary, residential, service)
        ],
        'line-opacity': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary'],
          0.92,
          0.75, // 요구사항 반영: 좁은 골목길 투명도 0.75로 차분하게 표출
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 2.0, ['secondary', 'tertiary'], 1.2, 0.6],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 4.5, ['secondary', 'tertiary'], 2.5, 1.2],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 9.5, ['secondary', 'tertiary'], 4.5, 2.2],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 16.0, ['secondary', 'tertiary'], 7.5, 3.8],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 28.0, ['secondary', 'tertiary'], 12.0, 6.0],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 52.0, ['secondary', 'tertiary'], 22.0, 10.0],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 2. 얇고 선명한 황색 중앙선 레이어 (road-centerline)
    // - 요구사항: 골목길 표출 전면 배제!
    // - 오직 왕복 4차선 이상 주간선도로(motorway, trunk, primary)에만 얇게(1px~1.5px) 표시
    // -------------------------------------------------------------------------
    {
      id: 'road-centerline',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      maxzoom: 24,
      filter: arterialFilter, // 오직 주간선도로에만 한정
      paint: {
        'line-color': '#eab308', // 요구사항 반영: 규격 황색 중앙선
        'line-opacity': 0.95,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 0.8,
          15, 1.2,
          18, 1.5, // 1px ~ 1.5px로 얇고 날렵하게 유지
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 3. 고속도로/도시고속도로 전용 은은한 백색 차선 점선 (road-lanes)
    // - 줌 16 이상에서만 오직 motorway/trunk에 은은하게 최소화 표출
    // -------------------------------------------------------------------------
    {
      id: 'road-lanes',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 16,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk'], true, false],
      paint: {
        'line-color': '#f8fafc',
        'line-dasharray': [3, 4],
        'line-opacity': 0.65,
        'line-width': 1.0,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
  ];

  return layers;
}
