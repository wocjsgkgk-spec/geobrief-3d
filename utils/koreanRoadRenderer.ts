/**
 * utils/koreanRoadRenderer.ts
 *
 * [2단계: 한국형 정밀 아스팔트 도로망 및 하천 횡단 대교·수변 3D 실사 렌더러]
 *
 * 1. 도로 등급별 실제 폭 아스팔트 포장(#2a2d34) 및 밝은 연석 테두리(#94a3b8):
 *    - 위성사진의 흐릿한 타이어 자국을 완전히 덮는 다크 아스팔트 노면(불투명도 0.88~0.96)
 *    - 도로 양옆 밝은 연석 테두리(road-curb-casing)를 깔아 브이월드처럼 도시 블록이 칼같이 정돈됨
 *
 * 2. 왕복 4차선 이상 간선도로 황색 중앙선(#eab308) & 백색 차선 점선(#ffffff):
 *    - 규격 황색 중앙선(1.2px ~ 2.4px)과 백색 차선 점선(dasharray: [3, 4])
 *    - 주요 사거리 교차로 백색 정지선 및 규격 횡단보도(crosswalk) 스트라이프 실시간 렌더링
 *
 * 3. 원주천·섬강·소양강 하천 수면(Water) 및 둔치(Floodplain) 실사화:
 *    - 맑은 네이비/틸 블루 수면(#1e3a5f ~ #0f2942)과 부드러운 수면 반사광(#38bdf8)
 *    - 원주천 둔치 산책로·녹지 폴리곤(#36533c, 38% 블렌딩)으로 대교와 수변 풍경의 선명한 대비
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 실측 도로망 & 단지 지상 인프라 MapLibre 등록 통합 레이어 ID 목록
 */
export const KOREAN_ROAD_LAYER_IDS: string[] = [
  // 1. 하천 수면 및 둔치 레이어 (최하단)
  'korean-riverbank-floodplain',
  'korean-water-fill',
  'korean-water-edge',
  'korean-waterway-line',
  // 2. 단지 및 상업지구 지상 인프라
  'complex-parking-area',
  'complex-parking-curb',
  'complex-service-casing',
  'complex-service-asphalt',
  'complex-pedestrian-path',
  'complex-parking-bays',
  // 3. 교량 상판 및 케이싱
  'road-bridge-casing',
  'road-bridge-deck',
  // 4. 도시 전체 정밀 아스팔트 도로망 및 연석 테두리
  'road-curb-casing',
  'road-asphalt',
  'road-centerline',
  'road-lanes',
  // 5. 주요 교차로 정밀 횡단보도 및 정지선
  'korean-crosswalk-stripes',
  'korean-crosswalk-stoplines',
  'korean-roundabout-island',
  'korean-roundabout-lane',
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
  crosswalkSourceId = 'crosswalks-source'
): LayerSpecification[] {
  // 왕복 4차선 이상 주간선도로 필터
  const arterialFilter: any = [
    'match',
    ['get', 'class'],
    ['motorway', 'trunk', 'primary'],
    true,
    false,
  ];

  // 실제 지도 도로 레이어의 brunnel === 'bridge' / bridge === 'yes' 교량 선형 필터
  const bridgeFilter: any = [
    'any',
    ['==', ['get', 'brunnel'], 'bridge'],
    ['==', ['get', 'bridge'], 'yes'],
    ['==', ['get', 'bridge'], 1],
    ['==', ['get', 'bridge'], '1'],
    ['==', ['get', 'class'], 'bridge'],
  ];

  const layers: LayerSpecification[] = [
    // -------------------------------------------------------------------------
    // [3단계] 원주천·섬강·소양강 하천 수면 및 둔치(Water & Floodplain) 레이어
    // -------------------------------------------------------------------------
    // 0-1. 원주천·섬강 수변 둔치(Floodplain) 잔디/생태공원 폴리곤
    {
      id: 'korean-riverbank-floodplain',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landcover',
      minzoom: 10,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['grass', 'wetland', 'park'], true, false],
      paint: {
        'fill-color': '#36533c', // 생기 있는 원주천 둔치 녹지 톤
        'fill-opacity': 0.38,
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },

    // 0-2. 원주천·섬강·소양강 맑은 네이비/틸 블루 수면 폴리곤 (korean-water-fill)
    {
      id: 'korean-water-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 8,
      maxzoom: 24,
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, '#0f2942',  // 원경: 깊은 틸 블루
          13, '#1e3a5f', // 중경: 맑고 깨끗한 네이비 블루
          16, '#18476d', // 근경: 청명한 강물 반사 톤
        ],
        'fill-opacity': 0.88,
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },

    // 0-3. 하천 가장자리 부드러운 수면 반사광/물결 테두리 라인 (korean-water-edge)
    {
      id: 'korean-water-edge',
      type: 'line',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#38bdf8', // 맑은 하늘빛 수면 반사광 라인
        'line-opacity': 0.45,
        'line-width': 1.6,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // 0-4. 소하천 및 지류 물길 선형 (korean-waterway-line)
    {
      id: 'korean-waterway-line',
      type: 'line',
      source: sourceId,
      'source-layer': 'waterway',
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#1e3a5f',
        'line-opacity': 0.85,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, 1.8,
          14, 3.8,
          17, 8.5,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 단지 및 상업지구 지상 인프라 (주차장 구역, 보도블록 연석, 보행로)
    // -------------------------------------------------------------------------
    {
      id: 'complex-parking-area',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 13,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['parking', 'garages'], true, false],
      paint: {
        'fill-color': '#1e242d',
        'fill-opacity': 0.90,
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'complex-parking-curb',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['parking', 'garages'], true, false],
      paint: {
        'line-color': '#94a3b8',
        'line-opacity': 0.92,
        'line-width': 1.8,
      },
      layout: {
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'complex-service-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['service', 'residential', 'living_street', 'unclassified'], true, false],
      paint: {
        'line-color': '#94a3b8',
        'line-opacity': 0.95,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          13, 3.2,
          14, 5.0,
          15, 8.6,
          16.5, 14.5,
          18, 24.0,
          20, 40.0,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'complex-service-asphalt',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['service', 'residential', 'living_street', 'unclassified'], true, false],
      paint: {
        'line-color': '#2a2d34',
        'line-opacity': 0.92,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          13, 1.8,
          14, 3.4,
          15, 6.4,
          16.5, 11.2,
          18, 19.5,
          20, 34.0,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'complex-pedestrian-path',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14,
      maxzoom: 24,
      filter: ['match', ['get', 'class'], ['path', 'pedestrian', 'footway', 'steps'], true, false],
      paint: {
        'line-color': '#c29b82', // 웜톤 인터로킹 보도블록
        'line-opacity': 0.90,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          14, 1.6,
          15, 3.0,
          16.5, 5.5,
          18, 9.2,
          20, 16.0,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'complex-parking-bays',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 16.5,
      maxzoom: 24,
      filter: [
        'any',
        ['==', ['get', 'service'], 'parking_aisle'],
        ['match', ['get', 'class'], ['service'], true, false],
      ],
      paint: {
        'line-color': '#ffffff',
        'line-dasharray': [2, 3],
        'line-opacity': 0.75,
        'line-width': 1.2,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 교량 외곽 방호벽/상판 2D 벡터 베이스
    // -------------------------------------------------------------------------
    {
      id: 'road-bridge-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      filter: bridgeFilter,
      paint: {
        'line-color': '#64748b',
        'line-opacity': 0.98,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 4.5, ['secondary', 'tertiary'], 3.0, 2.0],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 8.2, ['secondary', 'tertiary'], 5.0, 3.0],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 15.0, ['secondary', 'tertiary'], 8.2, 4.8],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 23.5, ['secondary', 'tertiary'], 12.5, 7.2],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 38.0, ['secondary', 'tertiary'], 18.5, 10.5],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 68.0, ['secondary', 'tertiary'], 31.0, 16.5],
        ],
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'road-bridge-deck',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      filter: bridgeFilter,
      paint: {
        'line-color': '#26292e', // 다크 아스팔트 교량 도로 상판
        'line-opacity': 0.96,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 3.2, ['secondary', 'tertiary'], 2.0, 1.2],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 6.4, ['secondary', 'tertiary'], 3.8, 2.2],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 12.5, ['secondary', 'tertiary'], 6.5, 3.6],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 20.0, ['secondary', 'tertiary'], 10.2, 5.6],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 33.5, ['secondary', 'tertiary'], 15.5, 8.5],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 60.0, ['secondary', 'tertiary'], 26.5, 13.5],
        ],
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // [2단계] 한국형 실측 도로망: 밝은 연석 테두리 (road-curb-casing)
    // - 도로 양옆에 밝은 연석 테두리(#94a3b8)를 깔아 도시 블록 구획이 칼같이 정돈됨
    // -------------------------------------------------------------------------
    {
      id: 'road-curb-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#94a3b8', // 밝은 콘크리트 연석 테두리
        'line-opacity': 0.96,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 3.8, ['secondary', 'tertiary'], 2.6, 1.8],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 7.2, ['secondary', 'tertiary'], 4.6, 2.8],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 13.5, ['secondary', 'tertiary'], 7.5, 4.4],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 21.5, ['secondary', 'tertiary'], 11.8, 6.8],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 35.5, ['secondary', 'tertiary'], 17.5, 9.8],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 63.0, ['secondary', 'tertiary'], 29.5, 15.5],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // [2단계] 도로 본체 다크 아스팔트 노면 포장 (road-asphalt)
    // - 위성사진의 흐릿한 타이어 자국을 완전히 덮는 실제 아스팔트 포장(#2a2d34)
    // -------------------------------------------------------------------------
    {
      id: 'road-asphalt',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': '#2a2d34', // 실제 아스팔트 노면 컬러
        'line-opacity': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary'],
          0.96, // 주간선도로 완전 덮음
          ['secondary', 'tertiary'],
          0.94,
          0.90, // 골목길 및 보조도로
        ],
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 2.4, ['secondary', 'tertiary'], 1.5, 0.8],
          13, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 5.2, ['secondary', 'tertiary'], 3.0, 1.5],
          15, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 10.8, ['secondary', 'tertiary'], 5.4, 2.6],
          16.5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 17.5, ['secondary', 'tertiary'], 8.8, 4.4],
          18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 30.0, ['secondary', 'tertiary'], 13.8, 7.0],
          20, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 55.0, ['secondary', 'tertiary'], 24.5, 11.5],
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // [2단계] 왕복 4차선 이상 간선도로 선명한 황색 중앙선 (road-centerline)
    // -------------------------------------------------------------------------
    {
      id: 'road-centerline',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      maxzoom: 24,
      filter: arterialFilter, // 오직 왕복 4차선 이상 주간선도로에만 표출
      paint: {
        'line-color': '#eab308', // 규격 황색 중앙선
        'line-opacity': 0.98,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 1.0,
          15, 1.6,
          18, 2.4,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // [2단계] 간선도로 백색 차선 점선 (road-lanes)
    // -------------------------------------------------------------------------
    {
      id: 'road-lanes',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15,
      maxzoom: 24,
      filter: arterialFilter,
      paint: {
        'line-color': '#ffffff',
        'line-dasharray': [3, 4],
        'line-opacity': 0.85,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15, 1.0,
          18, 1.8,
        ],
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // [2단계] 주요 사거리 교차로 정밀 횡단보도(Crosswalk) 스트라이프 & 정지선
    // -------------------------------------------------------------------------
    {
      id: 'korean-crosswalk-stripes',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 14,
      maxzoom: 24,
      filter: ['==', ['get', 'type'], 'crosswalk-stripe'],
      paint: {
        'fill-color': '#ffffff', // 백색 횡단보도 스트라이프
        'fill-opacity': 0.95,
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'korean-crosswalk-stoplines',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 14,
      maxzoom: 24,
      filter: ['==', ['get', 'type'], 'stop-line'],
      paint: {
        'line-color': '#ffffff', // 백색 교차로 전방 정지선
        'line-opacity': 0.95,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14, 1.6,
          16, 2.5,
          18, 3.8,
        ],
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'korean-roundabout-island',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 13,
      maxzoom: 24,
      filter: ['==', ['get', 'type'], 'roundabout-island'],
      paint: {
        'fill-color': '#2d5a3c', // 회전교차로 중앙 원형 교통섬 녹지
        'fill-opacity': 0.92,
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'korean-roundabout-lane',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 13,
      maxzoom: 24,
      filter: ['==', ['get', 'type'], 'roundabout-circulating-lane'],
      paint: {
        'line-color': '#ffffff',
        'line-dasharray': [2, 3],
        'line-opacity': 0.85,
        'line-width': 1.6,
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
