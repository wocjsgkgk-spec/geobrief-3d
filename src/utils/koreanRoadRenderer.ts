/**
 * utils/koreanRoadRenderer.ts
 *
 * [3단계: 고배율 근접 뷰 해상도 보강 및 위성·도로 실측 정합 렌더러]
 * - 고배율(Lv 15~18) 위성사진 픽셀 뭉개짐을 완벽히 보완하는 실측 아스팔트 노면·중앙선·차선 점선
 * - 지수 보간 ['interpolate', ['exponential', 1.5], ['zoom'], ...] 기반 스케일링으로 확대할수록 선명해지는 도로망
 * - 다크 차콜 아스팔트(#1E293B, #26292E, #334155)로 위성사진 흐림을 칼같이 덮고 실측 미터(m) 단위 도로 폭 정합
 * - 선명한 황색 중앙선(#EAB308, 복선 및 단선)과 줌 15 이상 백색 차선 점선([3, 4], #F8FAFC)
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 실측 도로망 MapLibre 등록 통합 레이어 ID 목록
 */
export const KOREAN_ROAD_LAYER_IDS: string[] = [
  'road-casing',
  'road-asphalt',
  'road-edge-left',
  'road-edge-right',
  'road-centerline',
  'road-centerline-double-left',
  'road-centerline-double-right',
  'road-lanes',
  'road-lanes-left',
  'road-lanes-right',
  // 하위 호환성 ID 목록
  'korean-roads-casing',
  'korean-roads-surface',
  'korean-roads-centerline',
];

/**
 * 지수 보간(exponential base 1.5) 미터 스케일 도로 폭 계산기
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
    13, Math.max(minPx, Number((baseMeters * 0.35).toFixed(2))),
    15, Math.max(minPx, Number((baseMeters * 0.95).toFixed(2))),
    16.5, Math.max(minPx, Number((baseMeters * 1.95).toFixed(2))),
    18, Math.max(minPx, Number((baseMeters * 3.65).toFixed(2))),
    20, Math.max(minPx, Number((baseMeters * 7.20).toFixed(2))),
  ];
}

export function createDynamicLanesWidthExpr(
  baseMeters: number,
  minZoom = 11,
  minPx = 1.0
): any[] {
  return createMeterScaleWidthExpr(baseMeters, minZoom, minPx);
}

/**
 * 차선 및 중앙선 오프셋(Offset) 지수 보간 계산기
 */
export function createOffsetExpr(baseOffsetMeters: number): any[] {
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    11, 0,
    13, Number((baseOffsetMeters * 0.35).toFixed(2)),
    15, Number((baseOffsetMeters * 0.95).toFixed(2)),
    16.5, Number((baseOffsetMeters * 1.95).toFixed(2)),
    18, Number((baseOffsetMeters * 3.65).toFixed(2)),
    20, Number((baseOffsetMeters * 7.20).toFixed(2)),
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
  // 도로 위계 필터
  const motorwayFilter: any = [
    'match',
    ['get', 'class'],
    ['motorway', 'trunk', 'primary'],
    true,
    false,
  ];

  const layers: LayerSpecification[] = [
    // -------------------------------------------------------------------------
    // 1. 도로 외곽 케이싱 / 보도 연석 경계선 (road-casing)
    // - 위성사진과의 부드럽고 자연스러운 블렌딩을 위해 낮은 투명도(0.28)와 슬레이트 틴트 적용
    // -------------------------------------------------------------------------
    {
      id: 'road-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.28,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 3.2, ['secondary', 'tertiary'], 2.0, 1.2],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 7.2, ['secondary', 'tertiary'], 4.5, 2.4],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 16.5, ['secondary', 'tertiary'], 9.6, 5.2],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 32.0, ['secondary', 'tertiary'], 18.5, 10.2],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 58.0, ['secondary', 'tertiary'], 33.5, 18.5],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 118.0, ['secondary', 'tertiary'], 66.0, 36.0],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 2. 실측 폭 다크 아스팔트 노면 레이어 (road-asphalt)
    // - 고배율(Lv 15+)에서 픽셀화된 위성사진 도로 바닥을 완전히 덮는 짙은 차콜 아스팔트
    // - 지수 보간 ['interpolate', ['exponential', 1.5], ['zoom'], ...] 정밀 적용
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
          '#1E293B', // 주간선 다크 차콜 아스팔트
          ['secondary', 'tertiary'],
          '#26292E', // 보조간선/국도 아스팔트
          '#334155', // 주거/이면/군사도로 차콜 그레이
        ],
        'line-opacity': 0.98,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 2.4, ['secondary', 'tertiary'], 1.5, 0.8],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 5.8, ['secondary', 'tertiary'], 3.6, 1.8],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 14.5, ['secondary', 'tertiary'], 8.2, 4.4],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 28.5, ['secondary', 'tertiary'], 16.0, 8.8],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 54.0, ['secondary', 'tertiary'], 30.0, 16.5],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 110.0, ['secondary', 'tertiary'], 60.0, 32.0],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 3. 주간선도로 차도 외곽 백색 실선 (road-edge-left / road-edge-right)
    // -------------------------------------------------------------------------
    {
      id: 'road-edge-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.5,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#F1F5F9',
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14.5, 0.0,
          15.2, 0.88,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          14.5, 0.7,
          16, 1.3,
          17.5, 2.4,
          19, 4.5,
        ],
        'line-offset': createOffsetExpr(-6.2) as any,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'road-edge-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.5,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#F1F5F9',
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14.5, 0.0,
          15.2, 0.88,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          14.5, 0.7,
          16, 1.3,
          17.5, 2.4,
          19, 4.5,
        ],
        'line-offset': createOffsetExpr(6.2) as any,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 4. 황색 중앙선 레이어 (road-centerline)
    // - 보조간선/국도 황색 단선 (#EAB308, 지수 보간 base 1.5)
    // -------------------------------------------------------------------------
    {
      id: 'road-centerline',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      maxzoom: 24,
      filter: [
        'match',
        ['get', 'class'],
        ['secondary', 'tertiary'],
        true,
        false,
      ],
      paint: {
        'line-color': '#EAB308',
        'line-opacity': 0.96,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          12, 0.7,
          14, 1.2,
          15.5, 2.2,
          17, 4.0,
          18.5, 6.8,
          20, 11.5,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // 주간선도로 황색 복선 (좌측)
    {
      id: 'road-centerline-double-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#EAB308',
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13.5, 0.0,
          14.2, 0.98,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          13.5, 0.7,
          15, 1.3,
          16.5, 2.4,
          18, 4.2,
          20, 8.0,
        ],
        'line-offset': createOffsetExpr(-0.65) as any,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // 주간선도로 황색 복선 (우측)
    {
      id: 'road-centerline-double-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#EAB308',
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13.5, 0.0,
          14.2, 0.98,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          13.5, 0.7,
          15, 1.3,
          16.5, 2.4,
          18, 4.2,
          20, 8.0,
        ],
        'line-offset': createOffsetExpr(0.65) as any,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 5. 줌 15 이상 백색 차선 점선 (road-lanes)
    // - 주간선도로 1차로와 2차로 사이에 정밀 점선([3, 4], #F8FAFC) 표출
    // - 줌 14.8 ~ 15.5 부드러운 페이드인과 지수 보간 base 1.5 폭 계산
    // -------------------------------------------------------------------------
    {
      id: 'road-lanes-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.8,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#F8FAFC',
        'line-dasharray': [3, 4], // 도로교통공단 규격 백색 점선
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14.8, 0.0,
          15.5, 0.96,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          14.8, 0.8,
          16, 1.4,
          17.5, 2.6,
          19, 4.8,
        ],
        'line-offset': createOffsetExpr(-3.5) as any,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'road-lanes-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.8,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#F8FAFC',
        'line-dasharray': [3, 4], // 도로교통공단 규격 백색 점선
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14.8, 0.0,
          15.5, 0.96,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          14.8, 0.8,
          16, 1.4,
          17.5, 2.6,
          19, 4.8,
        ],
        'line-offset': createOffsetExpr(3.5) as any,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // 단일 ID 'road-lanes' 참조를 위한 대표 레이어
    {
      id: 'road-lanes',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15.0,
      maxzoom: 24,
      filter: motorwayFilter,
      paint: {
        'line-color': '#F8FAFC',
        'line-dasharray': [3, 4],
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15.0, 0.0,
          15.5, 0.96,
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          15.0, 0.9,
          16.5, 1.8,
          18.0, 3.4,
          20.0, 6.8,
        ],
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
