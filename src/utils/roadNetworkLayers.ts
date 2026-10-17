/**
 * roadNetworkLayers.ts
 *
 * [3단계: 실측 미터(m) 폭 기반 3D 아스팔트 노면·차선·횡단보도 렌더링 엔진]
 * 깃허브 Streets-GL 및 OSM Buildings 아키텍처 벤더링:
 * 1) 줌 레벨 연동 실측 폭 (Meter-scale Width) 지수 보간 (['interpolate', ['exponential', 2], ['zoom'], ...])
 *    - 4차선 주간선도로 (폭 14m / 케이싱 16m)
 *    - 2차선 보조간선/국도 (폭 7m / 케이싱 8.6m)
 *    - 이면/주거지 도로 (폭 4m / 케이싱 5.2m)
 * 2) 최하단 도로 경계석/보도블록 (Casing) 연석 라인 (#94a3b8)
 * 3) 다크 차콜 아스팔트 포장 노면 (#1e293b ~ #334155)
 * 4) 정밀 노면 표기:
 *    - 황색 복선 중앙선 (#eab308)
 *    - 줌 15+ 백색 점선 차선 분리선 ([3, 4], #f8fafc)
 *    - 차도 외곽 백색 실선 (#f8fafc)
 *    - 교량/고가도로 입체 케이싱 (#475569)
 *    - 교차로 횡단보도 및 정지선 (Drape)
 * 5) 3D 지형(DEM) 표면 밀착 및 3D 빌딩 레이어 하위 위계 보장
 */

import type { LayerSpecification } from 'maplibre-gl';

export const ROAD_LAYER_IDS = [
  // 1. 교량 하부 입체 케이싱
  'roads-bridge-casing',
  'roads-bridge-inner',
  // 2. 도로 경계석/보도블록 케이싱 (Curb)
  'roads-casing-motorway',
  'roads-casing-secondary',
  'roads-casing-minor',
  // 3. 메인 아스팔트 포장면
  'roads-asphalt-motorway',
  'roads-asphalt-secondary',
  'roads-asphalt-minor',
  // 4. 차도 외곽 백색 실선
  'roads-edge-white-left',
  'roads-edge-white-right',
  // 5. 황색 중앙선 (복선 및 단선)
  'roads-centerline-yellow-left',
  'roads-centerline-yellow-right',
  'roads-centerline-yellow-single',
  // 6. 백색 점선 차선 분리선 (줌 15 이상)
  'roads-lanes-white-dashed-left',
  'roads-lanes-white-dashed-right',
  // 7. 교차로 횡단보도 및 정지선, 회전교차로
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
 * 줌 레벨 연동 실측 미터(m) 폭 지수 보간 (exponential base 2) 생성 헬퍼
 * 위도 37.35° (원주/강원) 기준:
 * 1 줌 증가 시 1픽셀 당 미터 거리가 절반이 되므로 픽셀 폭은 2배 증가합니다.
 */
function createMeterScaleWidthExpr(
  baseMeters: number,
  minZoom = 12,
  minPx = 1.0
): any[] {
  // 줌 17에서 1미터는 대략 1.05 픽셀
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
 * 줌 레벨 연동 차선 오프셋 지수 보간 헬퍼
 */
function createOffsetExpr(baseOffsetMeters: number): any[] {
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
 * 깃허브 Streets-GL 규격 도로 레이어 스택 정의 생성
 */
export function getRoadNetworkLayerDefinitions(
  sourceId = 'openmaptiles-vector',
  sourceLayer = 'transportation',
  crosswalkSourceId = 'crosswalks-source'
): LayerSpecification[] {
  // 1) 4차선 주간선도로 (motorway, trunk, primary)
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

  // 2) 2차선 보조간선/국도 (secondary, tertiary)
  const secondaryFilter: any[] = [
    'in',
    'class',
    'secondary',
    'secondary_link',
    'tertiary',
    'tertiary_link',
  ];

  // 3) 이면/주거/군사기지 도로 (minor, service, residential, track)
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
    // 0. 교량/고가도로 하부 입체 케이싱 (Bridge Substructure Casing)
    // -------------------------------------------------------------------------
    {
      id: 'roads-bridge-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#475569', // 교량 난간 및 콘크리트 상판 프레임
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
        'line-color': '#0f172a',
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
    // 1. 최하단 도로 경계석 / 보도블록 연석 케이싱 (Curbs & Casings)
    // - 밝은 회색(#94a3b8) 연석 라인으로 아스팔트와 주변 지형/건물을 선명하게 구획
    // -------------------------------------------------------------------------
    // (a) 4차선 주간선 케이싱 (폭 16m = 14m 노면 + 2m 연석/보도)
    {
      id: 'roads-casing-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#94A3B8', // [요구사항 1-1] 밝은 회색 연석 라인
        'line-width': createMeterScaleWidthExpr(16.0, 12, 2.2) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 2차선 보조간선 케이싱 (폭 8.6m = 7m 노면 + 1.6m 연석)
    {
      id: 'roads-casing-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#94A3B8', // [요구사항 1-1] 밝은 회색 연석 라인
        'line-width': createMeterScaleWidthExpr(8.6, 12, 1.6) as any,
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 이면/주거/군사도로 케이싱 (폭 5.2m = 4m 노면 + 1.2m 연석)
    {
      id: 'roads-casing-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#94A3B8', // [요구사항 1-1] 밝은 회색 연석 라인
        'line-width': createMeterScaleWidthExpr(5.2, 13, 1.2) as any,
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 2. 메인 아스팔트 포장 노면 레이어 (Main Asphalt Pavement Surfaces)
    // - 짙은 다크 차콜 아스팔트(#1e293b ~ #334155) 컬러로 위성사진의 흐릿한 도로 덮기
    // -------------------------------------------------------------------------
    // (a) 4차선 주간선 아스팔트 노면 (실측 14m 폭)
    {
      id: 'roads-asphalt-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#1E293B', // [요구사항 1-2] 짙은 다크 차콜 아스팔트
        'line-width': createMeterScaleWidthExpr(14.0, 12, 1.6) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 2차선 보조간선/국도 아스팔트 노면 (실측 7m 폭)
    {
      id: 'roads-asphalt-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#1E293B', // [요구사항 1-2] 차분한 다크 아스팔트
        'line-width': createMeterScaleWidthExpr(7.0, 12, 1.2) as any,
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 이면/주거/군사도로 아스팔트 노면 (실측 4m 폭)
    {
      id: 'roads-asphalt-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#1E293B', // [요구사항 1-2] 차분한 다크 아스팔트
        'line-width': createMeterScaleWidthExpr(4.0, 13, 0.9) as any,
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 3. 차도 외곽 백색 실선 (Outer Edge Lines - 도로 양측 가장자리 구획)
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
    // 4. 주간선도로/국도 중앙선 (황색 복선 #eab308 및 2차선 단선)
    // -------------------------------------------------------------------------
    // (a) 4차선 주간선도로 좌측 황색선
    {
      id: 'roads-centerline-yellow-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#EAB308', // [요구사항 2-1] 선명한 황색 복선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.9,
          16, 1.4,
          18, 2.5,
          20, 5.0,
        ],
        'line-offset': createOffsetExpr(-0.55) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 4차선 주간선도로 우측 황색선
    {
      id: 'roads-centerline-yellow-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#EAB308', // [요구사항 2-1] 선명한 황색 복선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.9,
          16, 1.4,
          18, 2.5,
          20, 5.0,
        ],
        'line-offset': createOffsetExpr(0.55) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 2차선 도로 중앙 단선 황색선
    {
      id: 'roads-centerline-yellow-single',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.5,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#EAB308', // [요구사항 2-1] 선명한 황색
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.5, 0.9,
          16, 1.3,
          18, 2.2,
          20, 4.4,
        ],
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 5. 차선 분리선 (줌 15 이상 백색 점선 [3, 4], #f8fafc)
    // - 주간선도로 1차로와 2차로 사이에 자동 표출
    // -------------------------------------------------------------------------
    // (a) 좌측 방향 차선 분할 점선 (중심에서 -3.5m)
    {
      id: 'roads-lanes-white-dashed-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15, // [요구사항 2-2] 줌 15 이상에서 자동 표출
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.9,
          17, 1.6,
          19, 3.2,
          20, 5.5,
        ],
        'line-dasharray': [3, 4], // [요구사항 2-2] 백색 점선
        'line-offset': createOffsetExpr(-3.5) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 우측 방향 차선 분할 점선 (중심에서 +3.5m)
    {
      id: 'roads-lanes-white-dashed-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15, // [요구사항 2-2] 줌 15 이상에서 자동 표출
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.9,
          17, 1.6,
          19, 3.2,
          20, 5.5,
        ],
        'line-dasharray': [3, 4], // [요구사항 2-2] 백색 점선
        'line-offset': createOffsetExpr(3.5) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 6. 교차로 횡단보도(Crosswalk) 및 정지선 (Stop Line)
    // - 주요 교차로 중심 노드에 백색 줄무늬 횡단보도 패턴과 정지선 표시
    // -------------------------------------------------------------------------
    {
      id: 'crosswalks-fill',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 14,
      filter: ['==', 'type', 'crosswalk-stripe'],
      paint: {
        'fill-color': '#FFFFFF',
        'fill-opacity': 0.96,
      },
      layout: {
        visibility: 'visible',
      },
    },
    {
      id: 'crosswalks-stopline',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 14,
      filter: ['==', 'type', 'stop-line'],
      paint: {
        'line-color': '#FFFFFF',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 1.5,
          16, 3.2,
          18, 6.4,
          20, 12.0,
        ],
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 6-2. 회전교차로 (Roundabout) 중앙 교통섬 및 회전 차선
    // -------------------------------------------------------------------------
    {
      id: 'roundabout-island-fill',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 14,
      filter: ['==', 'type', 'roundabout-island'],
      paint: {
        'fill-color': '#15803D', // 원형 녹지/화단
        'fill-opacity': 0.88,
      },
      layout: { visibility: 'visible' },
    },
    {
      id: 'roundabout-island-casing',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 14,
      filter: ['==', 'type', 'roundabout-island'],
      paint: {
        'line-color': '#94A3B8',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 1.2,
          16, 2.0,
          18, 4.0,
          20, 8.0,
        ],
        'line-opacity': 0.95,
      },
      layout: { visibility: 'visible' },
    },
    {
      id: 'roundabout-circulating-lane',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15,
      filter: ['==', 'type', 'roundabout-circulating-lane'],
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.9,
          17, 1.6,
          19, 3.2,
          20, 5.5,
        ],
        'line-dasharray': [3, 4],
        'line-opacity': 0.95,
      },
      layout: { visibility: 'visible' },
    },

    // -------------------------------------------------------------------------
    // 7. 광역 저배율 오버뷰 도로선 (줌 13 미만 가이드용)
    // -------------------------------------------------------------------------
    {
      id: 'roads-local',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#94A3B8',
        'line-width': 1.0,
        'line-opacity': 0.65,
      },
      layout: { visibility: 'visible' },
    },
    {
      id: 'roads-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 9,
      maxzoom: 13,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#FBBF24',
        'line-width': 1.8,
        'line-opacity': 0.8,
      },
      layout: { visibility: 'visible' },
    },
    {
      id: 'roads-highways',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 7,
      maxzoom: 13,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F97316',
        'line-width': 2.6,
        'line-opacity': 0.9,
      },
      layout: { visibility: 'visible' },
    },
  ];

  return layers;
}
