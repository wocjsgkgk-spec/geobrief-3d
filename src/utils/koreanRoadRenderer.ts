/**
 * utils/koreanRoadRenderer.ts
 *
 * [2단계: 한국형 실측 도로망(아스팔트 노면·차선·횡단보도·보도블록 연석) 정밀 렌더링 엔진]
 *
 * 1. 도로 등급별 실제 폭(Meter) 지수 보간 및 보도블록 연석(Curb) 입체화:
 *    - 대로 (고속도로·주간선도로 24.0m / 연석 27.5m / 단차 음영 28.5m)
 *    - 중로 (보조간선·집산도로 13.5m / 연석 15.5m / 단차 음영 16.3m)
 *    - 소로 (국지도로·주거이면 7.0m / 연석 8.4m / 단차 음영 8.9m)
 *    - 램프 (가감속 연결로 6.0m / 연석 7.4m)
 *    - 최하단 연석 경계: 밝은 화강석 연석 라인(#cbd5e1) + 은은한 단차 음영(#334155 ~ #475569)
 *    - 아스팔트 포장 노면: 다크 슬레이트 차콜(#26292e ~ #32363d)로 위성 노면 완벽 정돈
 *
 * 2. 한국 도로 규격 노면 마킹(Lane Markings) 정밀 구현:
 *    - 중앙선: 4차선 이상 주간선 황색 복선(두 줄 실선 #eab308, 좌우 ±0.38m 오프셋), 2차선 도로 황색 단선(#eab308)
 *    - 차로 분리선: 차로 폭 3.25m 간격 백색 점선(line-dasharray: [3, 5], #f8fafc, opacity 0.85)
 *    - 차도 갓길선: 도로 양측 외곽 백색 실선(#f8fafc)
 *    - 진출입 램프: 가감속 합류부 유도선(청색 안내선 #0284c7 및 백색 점선 [2, 3])
 *    - 교차로: 백색 굵은 정지선 및 줄무늬 횡단보도(Zebra Crossing) 패턴
 *
 * 3. 레이어 순서(Z-Order) 무결성:
 *    - DEM 3D 지형 표면에 완전 밀착(Drape)되며 3D 건물 및 건물 접지 그림자 하단에 정렬
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 실측 도로 렌더링에 등록되는 전체 레이어 ID 목록
 */
export const KOREAN_ROAD_LAYER_IDS: string[] = [
  // 0. 하천·계곡 횡단 교량 입체 구조 (거더·상판·방호벽 난간)
  'road-bridge-shadow',
  'road-bridge-girder',
  'road-bridge-casing',
  'road-bridge-deck',
  'road-bridge-barrier-left-motorway',
  'road-bridge-barrier-right-motorway',
  'road-bridge-barrier-left-secondary',
  'road-bridge-barrier-right-secondary',
  'road-bridge-piers-marker',

  // 1. 철도 선로 (자갈 도상·침목·은백색 듀얼 강철 레일)
  'rail-ballast-shadow',
  'rail-ballast',
  'rail-ballast-grain',
  'rail-sleepers',
  'rail-steel-base-left',
  'rail-steel-base-right',
  'rail-steel-left',
  'rail-steel-right',
  'rail-overview',

  // 2. 최하단 보도블록/연석 단차 음영 (Curb Shadow)
  'road-curb-shadow-motorway',
  'road-curb-shadow-secondary',
  'road-curb-shadow-minor',
  'road-curb-shadow-link',

  // 3. 밝은 화강석 연석 라인 (Granite Curb #cbd5e1)
  'road-curb-motorway',
  'road-curb-secondary',
  'road-curb-minor',
  'road-curb-link',

  // 4. 다크 슬레이트 차콜 아스팔트 포장 노면 (Dark Asphalt #26292e ~ #32363d)
  'road-asphalt-motorway',
  'road-asphalt-secondary',
  'road-asphalt-minor',
  'road-asphalt-link',

  // 5. 고속도로/국도 진출입 램프 가감속 차로 합류 유도선
  'road-ramp-guide-blue',
  'road-ramp-guide-dash',

  // 6. 차도 외곽 갓길 백색 실선 (Outer Edge Lines #f8fafc)
  'road-edge-white-left-motorway',
  'road-edge-white-right-motorway',
  'road-edge-white-left-secondary',
  'road-edge-white-right-secondary',

  // 7. 왕복 4차선 이상 주간선도로 중앙분리대 및 가드레일 (Median Strip & Barrier)
  'road-median-shadow',
  'road-median-curb',
  'road-median-strip',
  'road-median-guardrail',

  // 8. 한국 도로 규격 황색 중앙선 (Yellow Centerline #eab308)
  'road-centerline-yellow-left',
  'road-centerline-yellow-right',
  'road-centerline-yellow-single',

  // 9. 차로 폭 3.25m 규격 백색 점선 차로 분리선 (White Dashed Lane Lines [3, 5])
  'road-lanes-dashed-left-1',
  'road-lanes-dashed-right-1',
  'road-lanes-dashed-left-2',
  'road-lanes-dashed-right-2',
  'road-lanes-dashed-left-3',
  'road-lanes-dashed-right-3',

  // 10. 교차로 횡단보도, 정지선 및 회전교차로
  'crosswalks-fill',
  'crosswalks-stopline',
  'roundabout-island-fill',
  'roundabout-island-casing',
  'roundabout-circulating-lane',

  // 11. 광역 저배율 오버뷰 도로망 (줌 13 미만)
  'roads-overview-highway',
  'roads-overview-secondary',
  'roads-overview-local',

  // 12. 아파트 단지 및 학교/공공부지 외곽 담장/경계석 & 단지 내부 보행로
  'complex-boundary-wall',
  'complex-boundary-curb',
  'road-complex-footway-casing',
  'road-complex-footway',
];

/**
 * 위도 37.35° (대한민국 중부/원주) 기준 줌 레벨 연동 실측 미터(m) 폭 지수 보간 (base 2)
 * 줌 17 기준 1미터 ≈ 1.05 픽셀
 */
export function createMeterScaleWidthExpr(
  baseMeters: number,
  minZoom = 12,
  minPx = 1.0
): any[] {
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
 * 한국형 실측 도로망 MapLibre 레이어 스펙 생성 함수
 */
export function getKoreanRoadLayerDefinitions(
  sourceId = 'openmaptiles-vector',
  sourceLayer = 'transportation',
  crosswalkSourceId = 'crosswalks-source'
): LayerSpecification[] {
  // 1) 4차선 이상 주간선도로 필터 (고속도로, 도시고속화, 주간선 국도/대로)
  const motorwayFilter: any[] = [
    'in',
    'class',
    'motorway',
    'trunk',
    'primary',
  ];

  // 2) 2차선 보조간선/국도 필터 (중로, 보조간선)
  const secondaryFilter: any[] = [
    'in',
    'class',
    'secondary',
    'tertiary',
  ];

  // 3) 소로/국지/이면도로 필터 (단독주택, 빌라, 상가 골목, 군부대 진입로)
  const minorFilter: any[] = [
    'in',
    'class',
    'minor',
    'service',
    'residential',
    'track',
    'unclassified',
  ];

  // 4) 고속도로/국도 진출입 램프 필터 (_link)
  const rampFilter: any[] = [
    'in',
    'class',
    'motorway_link',
    'trunk_link',
    'primary_link',
    'secondary_link',
    'tertiary_link',
  ];

  // 5) 교량 (Bridge) 필터 (도로 및 철교)
  const bridgeFilter: any[] = [
    'all',
    ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
    ['==', 'brunnel', 'bridge'],
  ];

  // 6) 철도 선로 (Railway) 필터
  const railFilter: any[] = [
    'in',
    'class',
    'rail',
    'transit',
  ];

  const layers: LayerSpecification[] = [
    // -------------------------------------------------------------------------
    // 0. 하천·계곡·도로 횡단 교량(Bridge) 3D 상판 두께 및 방호벽 난간
    // -------------------------------------------------------------------------
    // (a) 교량 지면/수면 투영 짙은 그림자
    {
      id: 'road-bridge-shadow',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12.5,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#0F172A',
        'line-width': createMeterScaleWidthExpr(33.0, 12.5, 3.8) as any,
        'line-opacity': 0.58,
        'line-blur': 1.0,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 두께 1.5m의 교량 상판 측면 및 하부 콘크리트 거더 (Girder)
    {
      id: 'road-bridge-girder',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12.5,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#475569', // 두께 1.5m 콘크리트 거더 측면
        'line-width': createMeterScaleWidthExpr(29.5, 12.5, 3.2) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 교량 외곽 콘크리트 난간 케이싱
    {
      id: 'road-bridge-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#334155', // 교량 콘크리트 난간 및 외곽 프레임
        'line-width': createMeterScaleWidthExpr(28.0, 13, 2.9) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 교량 상판 아스팔트 슬래브
    {
      id: 'road-bridge-deck',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12.5,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#1E293B', // 교량 상판 슬래브
        'line-width': createMeterScaleWidthExpr(25.5, 12.5, 2.5) as any,
        'line-opacity': 0.99,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (e) 주간선 교량 좌측 높이 1.1m 회백색 콘크리트 방호벽/난간
    {
      id: 'road-bridge-barrier-left-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: ['all', bridgeFilter, motorwayFilter] as any,
      paint: {
        'line-color': '#E2E8F0', // 높이 1.1m 회백색 콘크리트 방호벽
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 1.0,
          15, 1.8,
          17, 3.6,
          19, 7.2,
        ],
        'line-offset': createOffsetExpr(-13.8) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (f) 주간선 교량 우측 높이 1.1m 회백색 콘크리트 방호벽/난간
    {
      id: 'road-bridge-barrier-right-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: ['all', bridgeFilter, motorwayFilter] as any,
      paint: {
        'line-color': '#E2E8F0',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 1.0,
          15, 1.8,
          17, 3.6,
          19, 7.2,
        ],
        'line-offset': createOffsetExpr(13.8) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (g) 중로 교량 좌측 높이 1.1m 회백색 방호벽
    {
      id: 'road-bridge-barrier-left-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: ['all', bridgeFilter, secondaryFilter] as any,
      paint: {
        'line-color': '#E2E8F0',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 0.8,
          15, 1.5,
          17, 3.0,
          19, 6.0,
        ],
        'line-offset': createOffsetExpr(-7.8) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (h) 중로 교량 우측 높이 1.1m 회백색 방호벽
    {
      id: 'road-bridge-barrier-right-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: ['all', bridgeFilter, secondaryFilter] as any,
      paint: {
        'line-color': '#E2E8F0',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 0.8,
          15, 1.5,
          17, 3.0,
          19, 6.0,
        ],
        'line-offset': createOffsetExpr(7.8) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (i) 35m 간격 교량 하부 교각(Pier) 위치 심볼 마커
    {
      id: 'road-bridge-piers-marker',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: bridgeFilter as any,
      paint: {
        'line-color': '#334155',
        'line-width': createMeterScaleWidthExpr(5.4, 14, 1.5) as any,
        'line-dasharray': [1, 7],
        'line-opacity': 0.90,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 0-B. 실제 철도 선로(Railway) 및 역사 주변 침목·레일 정밀 렌더링
    // -------------------------------------------------------------------------
    // (a) 하단 자갈 도상 접지 음영 (Ballast Shadow)
    {
      id: 'rail-ballast-shadow',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11.0,
      filter: railFilter as any,
      paint: {
        'line-color': '#1C1917',
        'line-width': createMeterScaleWidthExpr(6.4, 11, 1.8) as any,
        'line-opacity': 0.45,
        'line-blur': 0.6,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 폭 5m 다크 브라운/그레이 자갈 도상 (Ballast #44403c)
    {
      id: 'rail-ballast',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11.0,
      filter: railFilter as any,
      paint: {
        'line-color': '#44403C', // 실제 자갈 도상 컬러 (#44403c)
        'line-width': createMeterScaleWidthExpr(5.0, 11, 1.4) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 자갈 미세 요철 질감 (Ballast Grain)
    {
      id: 'rail-ballast-grain',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.5,
      filter: railFilter as any,
      paint: {
        'line-color': '#292524',
        'line-width': createMeterScaleWidthExpr(4.6, 14.5, 1.2) as any,
        'line-dasharray': [1, 1],
        'line-opacity': 0.40,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 촘촘한 가로 침목 패턴 (Sleepers, line-dasharray: [0.4, 0.8])
    {
      id: 'rail-sleepers',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12.5,
      filter: railFilter as any,
      paint: {
        'line-color': '#57534E', // 콘크리트/방부목 침목 톤
        'line-width': createMeterScaleWidthExpr(3.8, 12.5, 1.1) as any,
        'line-dasharray': [0.4, 0.8], // 촘촘한 가로 침목 패턴
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (e) 좌측 강철 레일 베이스 플레이트 및 음영
    {
      id: 'rail-steel-base-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: railFilter as any,
      paint: {
        'line-color': '#1E293B',
        'line-width': createMeterScaleWidthExpr(0.75, 13.5, 0.9) as any,
        'line-offset': createOffsetExpr(-0.72) as any,
        'line-opacity': 0.65,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (f) 우측 강철 레일 베이스 플레이트 및 음영
    {
      id: 'rail-steel-base-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: railFilter as any,
      paint: {
        'line-color': '#1E293B',
        'line-width': createMeterScaleWidthExpr(0.75, 13.5, 0.9) as any,
        'line-offset': createOffsetExpr(0.72) as any,
        'line-opacity': 0.65,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (g) 좌측 은백색 강철 레일 (표준궤 -0.72m)
    {
      id: 'rail-steel-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.0,
      filter: railFilter as any,
      paint: {
        'line-color': '#E2E8F0', // 은백색 강철 레일 두부
        'line-width': createMeterScaleWidthExpr(0.45, 13, 0.75) as any,
        'line-offset': createOffsetExpr(-0.72) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (h) 우측 은백색 강철 레일 (표준궤 +0.72m)
    {
      id: 'rail-steel-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.0,
      filter: railFilter as any,
      paint: {
        'line-color': '#E2E8F0', // 은백색 강철 레일 두부
        'line-width': createMeterScaleWidthExpr(0.45, 13, 0.75) as any,
        'line-offset': createOffsetExpr(0.72) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (i) 줌 12.5 미만 광역 철도망 가시화
    {
      id: 'rail-overview',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      maxzoom: 12.5,
      filter: railFilter as any,
      paint: {
        'line-color': '#57534E',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          6, 0.5,
          9, 1.2,
          12.5, 2.0,
        ],
        'line-dasharray': [4, 3],
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 1. [1단계: 최하단 보도블록/연석 단차 음영 (Curb Shadow #334155 ~ #475569)]
    // - 차도와 인도 사이의 15cm 단차에서 발생하는 은은한 음영을 구현
    // -------------------------------------------------------------------------
    {
      id: 'road-curb-shadow-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#334155',
        'line-width': createMeterScaleWidthExpr(28.5, 13.5, 2.8) as any,
        'line-opacity': 0.40,
        'line-blur': 0.5,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'road-curb-shadow-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#334155',
        'line-width': createMeterScaleWidthExpr(16.3, 13.5, 2.0) as any,
        'line-opacity': 0.38,
        'line-blur': 0.5,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'road-curb-shadow-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: minorFilter as any,
      paint: {
        'line-color': '#475569',
        'line-width': createMeterScaleWidthExpr(8.9, 14.0, 1.4) as any,
        'line-opacity': 0.32,
        'line-blur': 0.4,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    {
      id: 'road-curb-shadow-link',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: rampFilter as any,
      paint: {
        'line-color': '#334155',
        'line-width': createMeterScaleWidthExpr(7.8, 13.5, 1.4) as any,
        'line-opacity': 0.35,
        'line-blur': 0.4,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 2. [1단계: 밝은 화강석 연석 라인 (Granite Curb #cbd5e1)]
    // - 도로 양옆 가장자리에 밝은 화강석 연석 라인을 넣어 인도와 차도를 명확히 구분
    // -------------------------------------------------------------------------
    // (a) 대로 연석 (실측 27.5m = 24.0m 노면 + 양측 1.75m 화강석 연석/측구)
    {
      id: 'road-curb-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#CBD5E1', // 밝은 화강석 연석
        'line-width': createMeterScaleWidthExpr(27.5, 12, 2.6) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 중로 연석 (실측 15.5m = 13.5m 노면 + 양측 1.0m 연석)
    {
      id: 'road-curb-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#CBD5E1', // 밝은 화강석 연석
        'line-width': createMeterScaleWidthExpr(15.5, 12, 1.8) as any,
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 소로 연석 (실측 8.4m = 7.0m 노면 + 양측 0.7m 연석)
    {
      id: 'road-curb-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#CBD5E1', // 밝은 화강석 연석
        'line-width': createMeterScaleWidthExpr(8.4, 13, 1.3) as any,
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 램프 연석 (실측 7.4m = 6.0m 노면 + 0.7m 연석)
    {
      id: 'road-curb-link',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: rampFilter as any,
      paint: {
        'line-color': '#CBD5E1',
        'line-width': createMeterScaleWidthExpr(7.4, 13, 1.3) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 3. [1단계: 다크 슬레이트 차콜 아스팔트 포장 노면 (#26292e ~ #32363d)]
    // - 위성사진에 찍힌 흐릿한 차량 자국과 지저분한 노면을 깔끔하게 정돈
    // -------------------------------------------------------------------------
    // (a) 대로 아스팔트 노면 (실측 24.0m)
    {
      id: 'road-asphalt-motorway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#26292E', // 다크 슬레이트 차콜
        'line-width': createMeterScaleWidthExpr(24.0, 12, 2.0) as any,
        'line-opacity': 0.99,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 중로 아스팔트 노면 (실측 13.5m)
    {
      id: 'road-asphalt-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 12,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#2B2E35', // 다크 슬레이트 차콜
        'line-width': createMeterScaleWidthExpr(13.5, 12, 1.4) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 소로 아스팔트 노면 (실측 7.0m)
    {
      id: 'road-asphalt-minor',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#32363D', // 다크 슬레이트 차콜
        'line-width': createMeterScaleWidthExpr(7.0, 13, 1.0) as any,
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 진출입 램프 아스팔트 노면 (실측 6.0m)
    {
      id: 'road-asphalt-link',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13,
      filter: rampFilter as any,
      paint: {
        'line-color': '#282B31',
        'line-width': createMeterScaleWidthExpr(6.0, 13, 1.0) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 4. [2단계: 고속도로/국도 진출입 램프 가감속 차로 합류 유도선]
    // -------------------------------------------------------------------------
    // (a) 하이패스 및 램프 주 유도선 (선명한 하늘빛 청색 #0284c7)
    {
      id: 'road-ramp-guide-blue',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.2,
      filter: rampFilter as any,
      paint: {
        'line-color': '#0284C7',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.2, 0.9,
          16, 1.4,
          18, 2.6,
          20, 5.0,
        ],
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 합류부 백색 점선 유도선 ([2, 3] 대시 패턴)
    {
      id: 'road-ramp-guide-dash',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15.0,
      filter: rampFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.7,
          17, 1.3,
          19, 2.5,
        ],
        'line-dasharray': [2, 3],
        'line-offset': createOffsetExpr(1.8) as any,
        'line-opacity': 0.90,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 5. [2단계: 차도 외곽 갓길 백색 실선 (Outer Edge Lines #f8fafc)]
    // -------------------------------------------------------------------------
    // (a) 대로 좌측 갓길 실선 (오프셋 -11.6m)
    {
      id: 'road-edge-white-left-motorway',
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
          18, 2.4,
          20, 4.6,
        ],
        'line-offset': createOffsetExpr(-11.6) as any,
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 대로 우측 갓길 실선 (오프셋 +11.6m)
    {
      id: 'road-edge-white-right-motorway',
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
          18, 2.4,
          20, 4.6,
        ],
        'line-offset': createOffsetExpr(11.6) as any,
        'line-opacity': 0.88,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 중로 좌측 갓길 실선 (오프셋 -6.4m)
    {
      id: 'road-edge-white-left-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.8,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.8, 0.7,
          16, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-offset': createOffsetExpr(-6.4) as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 중로 우측 갓길 실선 (오프셋 +6.4m)
    {
      id: 'road-edge-white-right-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.8,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.8, 0.7,
          16, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-offset': createOffsetExpr(6.4) as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 6. [3단계: 왕복 4차선 이상 주간선도로 중앙분리대(Median Strip) 및 콘크리트 방호벽/가드레일]
    // -------------------------------------------------------------------------
    // (a) 중앙분리대 단차 미세 그림자
    {
      id: 'road-median-shadow',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#0F172A',
        'line-width': createMeterScaleWidthExpr(2.8, 13.5, 1.8) as any,
        'line-opacity': 0.45,
        'line-blur': 0.6,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 중앙분리대 화강석 연석 라인 (Granite Curb)
    {
      id: 'road-median-curb',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#CBD5E1', // 밝은 화강석 연석
        'line-width': createMeterScaleWidthExpr(2.2, 13.5, 1.4) as any,
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 녹지형 중앙분리대 관목/식재 매트
    {
      id: 'road-median-strip',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#15803D', // 자연스러운 딥 그린 관목/잔디 식재
        'line-width': createMeterScaleWidthExpr(1.6, 14.0, 1.2) as any,
        'line-opacity': 0.92,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 중앙 콘크리트 방호벽 / 아연도금 가드레일 센터 빔
    {
      id: 'road-median-guardrail',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.2,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#E2E8F0', // 회색 콘크리트 방호벽 / 가드레일
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.2, 0.7,
          16, 1.3,
          18, 2.5,
          20, 4.8,
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
    // 7. [2단계: 한국 도로 규격 황색 중앙선 (Yellow Centerline #eab308)]
    // - 왕복 4차선 이상 주간선도로: 중앙분리대 양옆 황색 복선 (두 줄 실선 #eab308, 좌우 ±1.2m)
    // - 2차선 도로: 황색 단선 (도로 정중앙 배치)
    // -------------------------------------------------------------------------
    // (a) 주간선 좌측 황색 실선 (중앙분리대 좌측 경계)
    {
      id: 'road-centerline-yellow-left',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#EAB308', // 선명한 황색 중앙선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.9,
          16, 1.5,
          18, 2.8,
          20, 5.2,
        ],
        'line-offset': createOffsetExpr(-1.2) as any,
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 주간선 우측 황색 실선 (중앙분리대 우측 경계)
    {
      id: 'road-centerline-yellow-right',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#EAB308', // 선명한 황색 중앙선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.9,
          16, 1.5,
          18, 2.8,
          20, 5.2,
        ],
        'line-offset': createOffsetExpr(1.2) as any,
        'line-opacity': 0.96,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 2차선 보조간선/국도 황색 단선 (정중앙 1줄)
    {
      id: 'road-centerline-yellow-single',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 13.5,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#EAB308', // 황색 중앙 단선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 0.8,
          15, 1.2,
          17, 2.2,
          19, 4.2,
        ],
        'line-opacity': 0.94,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 7. [2단계: 차로 폭 3.25m 규격 백색 점선 차로 분리선 (White Dashed Lane Lines [3, 5])]
    // - 다차선 도로의 중앙선 양옆으로 차로 폭(3.25m) 간격에 맞춘 백색 점선
    // -------------------------------------------------------------------------
    // (a) 1차로-2차로 좌측 분리선 (-3.25m)
    {
      id: 'road-lanes-dashed-left-1',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.8,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.8, 0.7,
          16.5, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-dasharray': [3, 5],
        'line-offset': createOffsetExpr(-3.25) as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 1차로-2차로 우측 분리선 (+3.25m)
    {
      id: 'road-lanes-dashed-right-1',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.8,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.8, 0.7,
          16.5, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-dasharray': [3, 5],
        'line-offset': createOffsetExpr(3.25) as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 2차로-3차로 좌측 분리선 (-6.50m)
    {
      id: 'road-lanes-dashed-left-2',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15.2,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15.2, 0.7,
          16.5, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-dasharray': [3, 5],
        'line-offset': createOffsetExpr(-6.50) as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 2차로-3차로 우측 분리선 (+6.50m)
    {
      id: 'road-lanes-dashed-right-2',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 15.2,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15.2, 0.7,
          16.5, 1.1,
          18, 2.0,
          20, 3.8,
        ],
        'line-dasharray': [3, 5],
        'line-offset': createOffsetExpr(6.50) as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (e) 3차로-4차로 좌측 분리선 (-9.75m, 광폭 고속도로/대로 전용)
    {
      id: 'road-lanes-dashed-left-3',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 16.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          16, 0.8,
          18, 1.9,
          20, 3.6,
        ],
        'line-dasharray': [3, 5],
        'line-offset': createOffsetExpr(-9.75) as any,
        'line-opacity': 0.80,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (f) 3차로-4차로 우측 분리선 (+9.75m)
    {
      id: 'road-lanes-dashed-right-3',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 16.0,
      filter: motorwayFilter as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          16, 0.8,
          18, 1.9,
          20, 3.6,
        ],
        'line-dasharray': [3, 5],
        'line-offset': createOffsetExpr(9.75) as any,
        'line-opacity': 0.80,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 8. [2단계: 교차로 횡단보도 및 정지선 (Crosswalks & Stoplines)]
    // -------------------------------------------------------------------------
    // (a) 줄무늬 횡단보도 (Zebra Crossing) 패턴 폴리곤
    {
      id: 'crosswalks-fill',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['in', 'type', 'crosswalk-stripe', 'zebra_stripe'] as any,
      paint: {
        'fill-color': '#F8FAFC', // 백색 횡단보도 스트라이프
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          15.0, 0.0,
          15.5, 0.88,
          17.0, 0.96,
        ],
      },
      layout: {
        visibility: 'visible',
      },
    },
    // (b) 교차로 진입부 백색 굵은 정지선 (Stop Line)
    {
      id: 'crosswalks-stopline',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['in', 'type', 'stop-line', 'stop_line'] as any,
      paint: {
        'line-color': '#F8FAFC', // 백색 굵은 정지선
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15.0, 1.5,
          17.0, 3.2,
          19.0, 6.0,
        ],
        'line-opacity': 0.98,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 회전교차로 연석 케이싱
    {
      id: 'roundabout-island-casing',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['in', 'type', 'roundabout-island', 'roundabout_island'] as any,
      paint: {
        'line-color': '#CBD5E1', // 화강석 연석
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 1.2,
          17, 2.5,
          19, 4.8,
        ],
        'line-opacity': 0.98,
      },
      layout: {
        visibility: 'visible',
      },
    },
    // (d) 회전교차로 중앙 녹지 교통섬
    {
      id: 'roundabout-island-fill',
      type: 'fill',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['in', 'type', 'roundabout-island', 'roundabout_island'] as any,
      paint: {
        'fill-color': '#166534', // 중앙 녹지/조경
        'fill-opacity': 0.90,
      },
      layout: {
        visibility: 'visible',
      },
    },
    // (e) 회전교차로 순환 차로 점선
    {
      id: 'roundabout-circulating-lane',
      type: 'line',
      source: crosswalkSourceId,
      minzoom: 15.0,
      filter: ['in', 'type', 'roundabout-circulating-lane', 'roundabout_circulating'] as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15, 0.8,
          17, 1.6,
          19, 3.2,
        ],
        'line-dasharray': [3, 5],
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 9. 광역 저배율 오버뷰 도로망 (줌 13 미만 고속 가시화)
    // -------------------------------------------------------------------------
    {
      id: 'roads-overview-highway',
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
          11, 2.4,
          13, 3.8,
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
      id: 'roads-overview-secondary',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      maxzoom: 13,
      filter: secondaryFilter as any,
      paint: {
        'line-color': '#CBD5E1',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          7, 0.4,
          10, 1.0,
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
      id: 'roads-overview-local',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 11,
      maxzoom: 13,
      filter: minorFilter as any,
      paint: {
        'line-color': '#94A3B8',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          11, 0.4,
          13, 1.4,
        ],
        'line-opacity': 0.70,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 10. [아파트 단지 및 학교/공공부지 외곽 담장 & 단지 내 보행로]
    // -------------------------------------------------------------------------
    // (a) 단지 외곽 얕은 담장 라인 (#64748b)
    {
      id: 'complex-boundary-wall',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 13.5,
      filter: ['in', 'class', 'residential', 'school', 'hospital', 'military', 'industrial'] as any,
      paint: {
        'line-color': '#64748B',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 1.0,
          16, 2.2,
          18, 4.0,
        ],
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (b) 단지 외곽 경계석/연석 라인 (#cbd5e1)
    {
      id: 'complex-boundary-curb',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.0,
      filter: ['in', 'class', 'residential', 'school', 'hospital', 'military', 'industrial'] as any,
      paint: {
        'line-color': '#CBD5E1',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14, 0.7,
          16, 1.3,
          18, 2.4,
        ],
        'line-opacity': 0.95,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 단지 내부 보행로/서비스도로 경계석 라인 (실측 4.2m 케이싱)
    {
      id: 'road-complex-footway-casing',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: ['in', 'class', 'path', 'track', 'service', 'footway', 'pedestrian', 'steps'] as any,
      paint: {
        'line-color': '#64748B',
        'line-width': createMeterScaleWidthExpr(4.2, 14, 1.2) as any,
        'line-opacity': 0.75,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 단지 내부 보행로 밝은 보도블록 톤 (#94a3b8 ~ #cbd5e1, 실측 3.2m)
    {
      id: 'road-complex-footway',
      type: 'line',
      source: sourceId,
      'source-layer': sourceLayer,
      minzoom: 14.0,
      filter: ['in', 'class', 'path', 'track', 'service', 'footway', 'pedestrian', 'steps'] as any,
      paint: {
        'line-color': '#94A3B8', // 밝은 보도블록 톤
        'line-width': createMeterScaleWidthExpr(3.2, 14, 0.9) as any,
        'line-opacity': 0.92,
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
