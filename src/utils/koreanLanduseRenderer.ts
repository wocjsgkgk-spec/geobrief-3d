/**
 * utils/koreanLanduseRenderer.ts
 *
 * [3단계: 벡터 토지피복(Landuse/Landcover) 디테일 블렌딩 및 실사 색감 정합 엔진]
 *
 * 1. 흐릿한 위성 바닥을 선명하게 살리는 토지피복 반투명 오버레이:
 *    - 줌 14.5~15.0 이상에서 위성사진이 픽셀화되어 흐릿해 보이는 현상을 보완
 *    - 벡터 타일(openmaptiles-vector)의 토지 용도별 미세 질감 레이어를 위성사진 위에
 *      15~25% 투명도로 자연스럽게 합성(Overlay/Multiply 블렌딩)
 *
 * 2. 세부 카테고리 구성:
 *    1) 학교 운동장·군부대 연병장 (pitch, playground, military):
 *       - 선명한 마사토/인조잔디 톤(#c29b68, #2e7d32)과 트랙 라인(#ffffff) 정돈
 *       - 군부대 연병장 황토/마사토 톤(#b89065) 및 외곽 경계 라인(#78593a)
 *    2) 도시 공원·골프장·산림 (park, grass, wood):
 *       - 고해상도 자연 녹지 색감 보정(#38a169, #2d6a4f, #1b4332)으로 얼룩덜룩한 색차 정리
 *       - 공원/골프장 수목 가장자리 톤 정돈
 *    3) 야외 주차장·광장 (parking, plaza):
 *       - 깔끔한 다크 그레이 아스팔트 포장(#2d3748) 및 연석 라인(#cbd5e1)
 *       - 주차 구획선 점선 패턴([2, 3]) 및 보도블록/인터로킹 블록 톤(#e2e8f0)
 */

import type { LayerSpecification } from 'maplibre-gl';

/**
 * 한국형 토지피복 렌더링에 등록되는 전체 레이어 ID 목록
 */
export const KOREAN_LANDUSE_LAYER_IDS: string[] = [
  // 1. 도시 공원·골프장·산림 (녹지 색감 보정)
  'landcover-wood-fill',
  'landcover-grass-fill',
  'landuse-park-fill',
  'landuse-park-boundary',

  // 2. 학교 운동장·군부대 연병장
  'landuse-military-fill',
  'landuse-military-boundary',
  'landuse-pitch-ground-fill',
  'landuse-pitch-turf-fill',
  'landuse-pitch-track-line',
  'landuse-playground-fill',

  // 3. 야외 주차장·광장
  'landuse-parking-fill',
  'landuse-parking-curb',
  'landuse-parking-lines',
  'landuse-plaza-fill',
  'landuse-plaza-boundary',

  // 4. 강원권 하천·호수 수계 및 강변 모래톱/둔치 (소양강, 북한강, 섬강, 원주천, 남대천 등)
  'water-river-fill',
  'water-river-shallow',
  'water-river-sandbar',
  'water-river-edge',
  'waterway-stream-casing',
  'waterway-stream-line',
];

/**
 * MapLibre 레이어 정의 배열 생성
 */
export function getKoreanLanduseLayerDefinitions(
  sourceId = 'openmaptiles-vector'
): LayerSpecification[] {
  return [
    // -------------------------------------------------------------------------
    // 1. 도시 공원·골프장·산림 (고해상도 자연 녹지 색감 보정 - 위성 색차 정리)
    // -------------------------------------------------------------------------
    // (a) 산림/숲 (wood) - 깊은 침엽/활엽수림 톤 (#1b4332)
    {
      id: 'landcover-wood-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landcover',
      minzoom: 13.5,
      filter: ['==', 'class', 'wood'] as any,
      paint: {
        'fill-color': '#1B4332',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          13.5, 0.0,
          14.5, 0.14,
          16.0, 0.22,
          18.0, 0.24,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (b) 잔디·초지 (grass, scrub) - 선명한 싱그러운 에메랄드 잔디 톤 (#38a169)
    {
      id: 'landcover-grass-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landcover',
      minzoom: 13.8,
      filter: ['in', 'class', 'grass', 'scrub', 'crop'] as any,
      paint: {
        'fill-color': '#38A169',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          13.8, 0.0,
          14.8, 0.15,
          16.0, 0.22,
          18.0, 0.25,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (c) 도시 공원·골프장·묘원 조경 녹지 (park, golf_course, cemetery) (#2d6a4f)
    {
      id: 'landuse-park-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 13.5,
      filter: ['in', 'class', 'park', 'cemetery', 'recreation_ground', 'golf_course'] as any,
      paint: {
        'fill-color': '#2D6A4F',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          13.5, 0.0,
          14.5, 0.15,
          16.0, 0.21,
          18.0, 0.24,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (d) 공원 외곽 수목 경계선 (#1b4332)
    {
      id: 'landuse-park-boundary',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.8,
      filter: ['in', 'class', 'park', 'recreation_ground', 'golf_course'] as any,
      paint: {
        'line-color': '#1B4332',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.8, 0.6,
          16.5, 1.4,
          18.5, 2.6,
        ] as any,
        'line-opacity': 0.55,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 2. 학교 운동장·군부대 연병장
    // -------------------------------------------------------------------------
    // (a) 군부대 연병장 및 군사시설 부지 (military) - 다져진 황토/마사토 톤 (#b89065)
    {
      id: 'landuse-military-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 13.5,
      filter: ['==', 'class', 'military'] as any,
      paint: {
        'fill-color': '#B89065', // 다져진 마사토 연병장 톤
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          13.5, 0.0,
          14.5, 0.16,
          16.0, 0.20,
          18.0, 0.22,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (b) 군부대 연병장/부지 외곽 경계선 (#78593a)
    {
      id: 'landuse-military-boundary',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.2,
      filter: ['==', 'class', 'military'] as any,
      paint: {
        'line-color': '#78593A',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.2, 0.8,
          16.0, 1.8,
          18.0, 3.2,
        ] as any,
        'line-opacity': 0.70,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 학교 운동장/경기장 마사토 바닥 (pitch, track, stadium) (#c29b68)
    {
      id: 'landuse-pitch-ground-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.2,
      filter: ['in', 'class', 'pitch', 'track', 'stadium'] as any,
      paint: {
        'fill-color': '#C29B68', // 선명한 마사토 황토색
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          14.2, 0.0,
          15.0, 0.18,
          16.5, 0.24,
          18.5, 0.25,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (d) 운동장 내부 인조잔디 축구장 필드 (#2e7d32)
    {
      id: 'landuse-pitch-turf-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.8,
      filter: ['==', 'class', 'pitch'] as any,
      paint: {
        'fill-color': '#2E7D32', // 선명한 인조잔디 톤
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          14.8, 0.0,
          15.5, 0.16,
          16.5, 0.22,
          18.5, 0.25,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (e) 운동장 트랙 라인 및 필드 마킹 (#ffffff)
    {
      id: 'landuse-pitch-track-line',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 15.0,
      filter: ['in', 'class', 'pitch', 'track', 'stadium'] as any,
      paint: {
        'line-color': '#FFFFFF',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15.0, 0.9,
          16.5, 1.8,
          18.5, 3.2,
        ] as any,
        'line-opacity': 0.68,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (f) 놀이터 및 소형 체육공간 (playground) - 모래/탄성포장재 톤 (#ddb892)
    {
      id: 'landuse-playground-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.8,
      filter: ['==', 'class', 'playground'] as any,
      paint: {
        'fill-color': '#DDB892',
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          14.8, 0.0,
          15.5, 0.18,
          17.0, 0.22,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },

    // -------------------------------------------------------------------------
    // 3. 야외 주차장·광장
    // -------------------------------------------------------------------------
    // (a) 야외 주차장 아스팔트 포장 (parking) - 다크 슬레이트 차콜 (#2d3748)
    {
      id: 'landuse-parking-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.0,
      filter: ['==', 'class', 'parking'] as any,
      paint: {
        'fill-color': '#2D3748', // 깔끔한 다크 그레이 아스팔트
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          14.0, 0.0,
          14.8, 0.18,
          16.0, 0.23,
          18.0, 0.25,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (b) 야외 주차장 외곽 연석 경계선 (#cbd5e1)
    {
      id: 'landuse-parking-curb',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.5,
      filter: ['==', 'class', 'parking'] as any,
      paint: {
        'line-color': '#CBD5E1', // 밝은 화강석 연석 라인
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.5, 0.8,
          16.5, 1.6,
          18.5, 2.8,
        ] as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 주차 구획선/주차 레인 백색 점선 패턴 (#f8fafc)
    {
      id: 'landuse-parking-lines',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 15.5,
      filter: ['==', 'class', 'parking'] as any,
      paint: {
        'line-color': '#F8FAFC',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          15.5, 0.6,
          17.0, 1.2,
          18.5, 2.0,
        ] as any,
        'line-dasharray': [2, 3],
        'line-opacity': 0.65,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 보행 광장 및 보행자 전용 공간 (plaza, pedestrian) (#e2e8f0)
    {
      id: 'landuse-plaza-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.2,
      filter: ['in', 'class', 'pedestrian', 'plaza'] as any,
      paint: {
        'fill-color': '#E2E8F0', // 화강석 보도블록/인터로킹 블록 톤
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          14.2, 0.0,
          15.0, 0.17,
          16.5, 0.22,
          18.5, 0.24,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (e) 광장 경계 및 보도 패턴 라인 (#94a3b8)
    {
      id: 'landuse-plaza-boundary',
      type: 'line',
      source: sourceId,
      'source-layer': 'landuse',
      minzoom: 14.8,
      filter: ['in', 'class', 'pedestrian', 'plaza'] as any,
      paint: {
        'line-color': '#94A3B8',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.8, 0.7,
          16.5, 1.5,
          18.5, 2.6,
        ] as any,
        'line-opacity': 0.72,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // -------------------------------------------------------------------------
    // 4. 강원권 하천·호수 수계 및 강변 모래톱/둔치 (소양강, 북한강, 섬강, 원주천, 남대천 등)
    // -------------------------------------------------------------------------
    // (a) 하천/호수 본류 수면 폴리곤 - 깊은 심수 에메랄드/코발트 블루 (#0284c7 ~ #0369a1)
    {
      id: 'water-river-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 11.0,
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['zoom'],
          11.0, '#0284C7',
          14.0, '#0369A1',
          16.5, '#075985',
        ] as any,
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          11.0, 0.40,
          13.5, 0.55,
          15.5, 0.68,
          17.5, 0.78,
        ] as any,
      },
      layout: { visibility: 'visible' },
    },
    // (b) 천수/모래톱 수변 가장자리 에메랄드 톤 반사광 (#38bdf8)
    {
      id: 'water-river-shallow',
      type: 'line',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 12.5,
      paint: {
        'line-color': '#38BDF8', // 얕은 여울/모래톱 에메랄드 수변
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          12.5, 1.2,
          14.5, 3.2,
          16.5, 7.5,
          18.5, 16.0,
        ] as any,
        'line-blur': 2.0,
        'line-opacity': 0.60,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (c) 강변 모래톱/자갈밭 둔치 경계선 (소양강·섬강·원주천 모래톱 자연 블렌딩)
    {
      id: 'water-river-sandbar',
      type: 'line',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 13.5,
      paint: {
        'line-color': '#CBD5E1', // 마사토/자갈 둔치 경계
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.5, 1.5,
          15.0, 3.8,
          17.0, 9.0,
          19.0, 18.0,
        ] as any,
        'line-blur': 1.5,
        'line-opacity': 0.48,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (d) 하천 제방 및 외곽 테두리선
    {
      id: 'water-river-edge',
      type: 'line',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 14.0,
      paint: {
        'line-color': '#64748B', // 하천 석축/콘크리트 제방 라인
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          14.0, 0.8,
          16.0, 1.8,
          18.0, 3.2,
        ] as any,
        'line-opacity': 0.70,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (e) 세부 지류/실개천 수로 케이싱 (waterway)
    {
      id: 'waterway-stream-casing',
      type: 'line',
      source: sourceId,
      'source-layer': 'waterway',
      minzoom: 13.0,
      paint: {
        'line-color': '#0284C7',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.0, 1.4,
          15.0, 3.2,
          17.0, 6.8,
        ] as any,
        'line-opacity': 0.65,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
    // (f) 세부 지류/실개천 코어 라인
    {
      id: 'waterway-stream-line',
      type: 'line',
      source: sourceId,
      'source-layer': 'waterway',
      minzoom: 13.0,
      paint: {
        'line-color': '#38BDF8',
        'line-width': [
          'interpolate', ['exponential', 2], ['zoom'],
          13.0, 0.8,
          15.0, 1.8,
          17.0, 4.0,
        ] as any,
        'line-opacity': 0.85,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
  ];
}

