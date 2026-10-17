/**
 * lib/vendor/streetsGlRoadLayers.ts
 *
 * GitHub StrandedKitty/streets-gl 저장소의 실측 폭(Meter-scale) 도로망 아키텍처 벤더링 모듈
 * [2단계: Streets-GL 스타일 PBR 빌딩 파사드 셰이더 및 실측 폭 도로망 업데이트]
 *
 * 1) 줌 레벨 연동 실측 미터(m) 폭 지수 보간 (['interpolate', ['exponential', 2], ['zoom'], ...])
 *    - 4차선 주간선도로 (차도 14.0m / 연석·보도 케이싱 16.0m)
 *    - 2차선 보조간선/국도 (차도 7.0m / 연석 케이싱 8.6m)
 *    - 이면/주거/군사도로 (차도 4.5m / 연석 케이싱 5.8m)
 * 2) 4단 레이어 정밀 스택 (위성사진 흐릿한 도로 완벽 정돈):
 *    - 1단계: 보도블록/연석 외곽선 (Curb & Sidewalk Casing #94a3b8)
 *    - 2단계: 다크 차콜 아스팔트 노면 (Dark Asphalt #1e293b)
 *    - 3단계: 황색 중앙선 (Yellow Centerline #eab308: 4차선 복선, 2차선 단선)
 *    - 4단계: 백색 점선 차선 및 외곽선 (White Markings #f8fafc: 점선 차선, 실선 갓길선)
 * 3) 교량/고가도로 입체 상판 구조(#475569) 및 교차로 횡단보도/정지선 연동
 */

import type { LayerSpecification } from 'maplibre-gl';

export const STREETS_GL_ROAD_LAYER_IDS = [
  // 1. 교량 하부 입체 케이싱 및 데크
  'roads-bridge-casing',
  'roads-bridge-inner',
  // 2. 도로 경계석 / 보도블록 연석 외곽선 (#94a3b8)
  'roads-casing-motorway',
  'roads-casing-secondary',
  'roads-casing-minor',
  // 3. 다크 차콜 아스팔트 포장 노면 (#1e293b)
  'roads-asphalt-motorway',
  'roads-asphalt-secondary',
  'roads-asphalt-minor',
  // 4. 차도 외곽 백색 실선 (#f8fafc)
  'roads-edge-white-left',
  'roads-edge-white-right',
  // 5. 황색 중앙선 (#eab308)
  'roads-centerline-yellow-left',
  'roads-centerline-yellow-right',
  'roads-centerline-yellow-single',
  // 6. 백색 점선 차선 분리선 (#f8fafc)
  'roads-lanes-white-dashed-left',
  'roads-lanes-white-dashed-right',
  // 7. 교차로 횡단보도, 정지선 및 회전교차로
  'crosswalks-fill',
  'crosswalks-stopline',
  'roundabout-island-fill',
  'roundabout-island-casing',
  'roundabout-circulating-lane',
  // 8. 광역 저배율 오버뷰 라인 (줌 13 미만)
  'roads-highways',
  'roads-secondary',
  'roads-local',
];

/**
 * Streets-GL 줌 레벨 연동 실측 미터(m) 폭 지수 보간 (exponential base 2) 생성 함수
 * 위도 37.35° (원주/한국 중부) 기준:
 * 줌 1 증가 시 1픽셀 당 미터 거리가 정확히 1/2이 되므로 픽셀 폭은 2배로 지수 확장됩니다.
 */
export function createMeterScaleWidthExpr(
  baseMeters: number,
  minZoom = 12,
  minPx = 1.0
): any[] {
  // 줌 17 기준: 1미터 ≈ 1.05 픽셀
  const pxAt17 = baseMeters * 1.05;
  const pxAt16 = pxAt17 / 2.0;
  const pxAt15 = pxAt16 / 2.0;
  const pxAt14 = pxAt15 / 2.0;
  const pxAt13 = Math.max(minPx, pxAt14 / 2.0);
  const pxAt12 = Math.max(minPx * 0.8, pxAt13 / 2.0);

  const pxAt18 = pxAt17 * 2.0;
  const pxAt19 = pxAt18 * 2.0;
  const pxAt20 = pxAt19 * 2.0;

  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    12, Number(pxAt12.toFixed(1)),
    13, Number(pxAt13.toFixed(1)),
    14, Number(pxAt14.toFixed(1)),
    15, Number(pxAt15.toFixed(1)),
    16, Number(pxAt16.toFixed(1)),
    17, Number(pxAt17.toFixed(1)),
    18, Number(pxAt18.toFixed(1)),
    19, Number(pxAt19.toFixed(1)),
    20, Number(pxAt20.toFixed(1)),
  ];
}

/**
 * 줌 레벨 연동 차선 오프셋(미터) 지수 보간 헬퍼
 */
export function createOffsetExpr(baseOffsetMeters: number): any[] {
  const off17 = baseOffsetMeters * 1.05;
  const off16 = off17 / 2.0;
  const off15 = off16 / 2.0;
  const off14 = off15 / 2.0;
  const off18 = off17 * 2.0;
  const off19 = off18 * 2.0;
  const off20 = off19 * 2.0;

  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    14, Number(off14.toFixed(2)),
    15, Number(off15.toFixed(2)),
    16, Number(off16.toFixed(2)),
    17, Number(off17.toFixed(2)),
    18, Number(off18.toFixed(2)),
    19, Number(off19.toFixed(2)),
    20, Number(off20.toFixed(2)),
  ];
}

/**
 * Streets-GL 규격 실측 폭 도로망 레이어 스택 정의 생성
 */
export function getStreetsGlRoadLayerDefinitions(
  sourceId = 'openmaptiles-vector',
  sourceLayer = 'transportation',
  crosswalkSourceId = 'crosswalks-source'
): LayerSpecification[] {
  // 1) 4차선 주간선도로 필터 (고속도로, 간선, 광로)
  const motorwayFilter: any[] = [
    'in',
    'class',
    'motorway',
    'motorway_link',
    'trunk',
    'trunk_link',
    'primary',
    'primary_link',
  ];

  // 2) 2차선 보조간선/국도 필터 (대로, 중로)
  const secondaryFilter: any[] = [
    'in',
    'class',
    'secondary',
    'secondary_link',
    'tertiary',
    'tertiary_link',
  ];

  // 3) 이면/주거/군사기지 도로 필터 (소로, 골목)
  const minorFilter: any[] = [
    'in',
    'class',
    'minor',
    'service',
    'residential',
    'track',
    'unclassified',
  ];

  // 4) 교량 (Bridge) 필터
  const bridgeFilter: any[] = [
    'all',
    ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
    ['==', 'brunnel', 'bridge'],
  ];

  const layers: LayerSpecification[] = [
    // -------------------------------------------------------------------------
    // 0. 교량/고가도로 하부 입체 상판 및 난간 케이싱
    // -------------------------------------------------------------------------
    {
      id: 'roads-bridge-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#475569', // 교량 콘크리트 난간 및 상판 프레임
        'line-width': createMeterScaleWidthExpr(17.5, 13, 2.8) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'roads-bridge-inner',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#0F172A',
        'line-width': createMeterScaleWidthExpr(15.2, 13, 2.2) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 1. [Streets-GL 1단계] 보도블록 / 연석 외곽선 케이싱 (#94a3b8)
    // - 밝은 그레이 연석 라인으로 아스팔트와 보도/주변 지형을 선명하게 구획
    // -------------------------------------------------------------------------
    // (a) 4차선 주간선 케이싱 (실측 16.0m = 14m 노면 + 2m 연석/보도)
    {
      id: 'roads-casing-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#94A3B8', // 보도블록/연석 외곽선
        'line-width': createMeterScaleWidthExpr(16.0, 12, 2.2) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 2차선 보조간선/국도 케이싱 (실측 8.6m = 7m 노면 + 1.6m 연석)
    {
      id: 'roads-casing-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#94A3B8', // 보도블록/연석 외곽선
        'line-width': createMeterScaleWidthExpr(8.6, 12, 1.6) as any,
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 이면/주거/군사도로 케이싱 (실측 5.8m = 4.5m 노면 + 1.3m 연석)
    {
      id: 'roads-casing-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#94A3B8', // 보도블록/연석 외곽선
        'line-width': createMeterScaleWidthExpr(5.8, 13, 1.2) as any,
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 2. [Streets-GL 2단계] 다크 차콜 아스팔트 노면 (#1e293b)
    // - 위성사진의 흐릿한 도로 흔적을 짙고 선명하게 덮어 시각적 안정감 극대화
    // -------------------------------------------------------------------------
    // (a) 4차선 주간선 아스팔트 (실측 14.0m)
    {
      id: 'roads-asphalt-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#1E293B', // 다크 차콜 아스팔트
        'line-width': createMeterScaleWidthExpr(14.0, 12, 1.6) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 2차선 보조간선/국도 아스팔트 (실측 7.0m)
    {
      id: 'roads-asphalt-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#1E293B', // 다크 차콜 아스팔트
        'line-width': createMeterScaleWidthExpr(7.0, 12, 1.2) as any,
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 이면/주거/군사도로 아스팔트 (실측 4.5m)
    {
      id: 'roads-asphalt-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#1E293B', // 다크 차콜 아스팔트
        'line-width': createMeterScaleWidthExpr(4.5, 13, 0.9) as any,
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 3. 차도 외곽 백색 실선 (Outer Edge Lines)
    // -------------------------------------------------------------------------
    {
      id: 'roads-edge-white-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.5,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.5, 0.8,
          16, 1.2,
          18, 2.2,
          20, 4.2,
        ],
        'line-offset': createOffsetExpr(-6.2) as any,
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'roads-edge-white-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.5,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.5, 0.8,
          16, 1.2,
          18, 2.2,
          20, 4.2,
        ],
        'line-offset': createOffsetExpr(6.2) as any,
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 4. [Streets-GL 3단계] 황색 중앙선 (#eab308)
    // - 4차선 주간선도로: 황색 복선 (좌/우 0.25m 이격)
    // - 2차선 보조간선: 황색 단선
    // -------------------------------------------------------------------------
    // (a) 4차선 주간선 좌측 황색선
    {
      id: 'roads-centerline-yellow-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#EAB308', // 황색 중앙선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.8,
          16, 1.3,
          18, 2.5,
          20, 4.5,
        ],
        'line-offset': createOffsetExpr(-0.35) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 4차선 주간선 우측 황색선
    {
      id: 'roads-centerline-yellow-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#EAB308', // 황색 중앙선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.8,
          16, 1.3,
          18, 2.5,
          20, 4.5,
        ],
        'line-offset': createOffsetExpr(0.35) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 2차선 보조간선/국도 황색 단선
    {
      id: 'roads-centerline-yellow-single',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#EAB308', // 황색 중앙 단선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 0.7,
          15, 1.1,
          17, 2.0,
          19, 3.8,
        ],
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 5. [Streets-GL 4단계] 백색 점선 차선 분리선 (#f8fafc)
    // - 줌 15 이상에서 활성화되는 정밀 주행 차선 분리선 ([3, 4] 대시 패턴)
    // -------------------------------------------------------------------------
    // (a) 좌측 방향 2차로 점선
    {
      id: 'roads-lanes-white-dashed-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC', // 백색 점선 차선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.7,
          16.5, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-dasharray': [3, 4],
        'line-offset': createOffsetExpr(-3.3) as any,
        'line-opacity': 0.90,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 우측 방향 2차로 점선
    {
      id: 'roads-lanes-white-dashed-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC', // 백색 점선 차선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.7,
          16.5, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-dasharray': [3, 4],
        'line-offset': createOffsetExpr(3.3) as any,
        'line-opacity': 0.90,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 6. 교차로 횡단보도, 정지선 및 회전교차로 (Drape)
    // -------------------------------------------------------------------------
    {
      id: 'crosswalks-fill',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 15.2,
      filter: ['==', 'type', 'zebra_stripe'],
      paint: {
        'fill-color': '#F8FAFC',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          15.2, 0.0,
          15.8, 0.88,
          17.0, 0.96,
        ],
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'crosswalks-stopline',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15.2,
      filter: ['==', 'type', 'stop_line'],
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15.2, 1.0,
          17, 2.5,
          19, 5.0,
        ],
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'roundabout-island-casing',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['==', 'type', 'roundabout_island'],
      paint: {
        'line-color': '#94A3B8',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 1.0,
          17, 2.2,
          19, 4.0,
        ],
        'line-opacity': 0.95,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'roundabout-island-fill',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['==', 'type', 'roundabout_island'],
      paint: {
        'fill-color': '#15803D',
        'fill-opacity': 0.85,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'roundabout-circulating-lane',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['==', 'type', 'roundabout_circulating'],
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.8,
          17, 1.6,
          19, 3.2,
        ],
        'line-dasharray': [3, 4],
        'line-opacity': 0.90,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 7. 광역 저배율 오버뷰 도로망 (줌 13 미만 고속 렌더링)
    // -------------------------------------------------------------------------
    {
      id: 'roads-highways',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      maxzoom: 13,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F59E0B',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          5, 0.5,
          8, 1.2,
          11, 2.2,
          13, 3.5,
        ],
        'line-opacity': 0.90,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'roads-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      maxzoom: 13,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#E2E8F0',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          8, 0.4,
          10, 0.8,
          12, 1.6,
          13, 2.4,
        ],
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'roads-local',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 10,
      maxzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#94A3B8',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, 0.2,
          12, 0.6,
          13, 1.2,
        ],
        'line-opacity': 0.60,
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
