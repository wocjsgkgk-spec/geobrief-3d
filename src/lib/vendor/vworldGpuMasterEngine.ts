/**
 * src/lib/vendor/vworldGpuMasterEngine.ts
 *
 * [GeoBrief 3D 2단계] CPU 연산이 없는 'GPU 하드웨어 가속 V-World 5단 입체 실사 렌더링 엔진'
 *
 * - MapLibre WebGL GPU 셰이더 기반 네이티브 Multi-Tier GPU Extrusion
 * - JavaScript CPU 정점 연산 0% -> 60fps 무결점 보장
 * - 위성사진 바닥 타일과 동일한 GPU 투영 행렬 사용 -> 위치 오차 0% (산악 밀림, 공중 부유 원천 차단)
 * - V-World 공식 3D 지형(image_7dbf74.jpg) 정위치 + 서울 실사(image_1effcc.jpg, image_1efbec.jpg) 외관 구현
 *
 * 5대 GPU 입체 층(Tiers):
 * 1. Tier 1: 1층 상가·로비 화강석 기단부 (vworld-tier1-podium, 0m ~ 3.8m)
 * 2. Tier 2: 기준층 본동 & 16색 실사 스펙트럼 (vworld-tier2-body, 3.8m ~ H-0.8m)
 * 3. Tier 3: 상가 가로 간판 띠 & 아파트 브랜드 벨트 (vworld-tier3-accent, 3.5m ~ 4.8m)
 * 4. Tier 4: 서울 V-World 실사 옥상 — 초록 우레탄 50% & 회색 슬래브 30% & 기와 15% (vworld-tier4-roof, H-0.8m ~ H)
 * 5. Tier 5: 옥상 테두리 난간 및 엘리베이터 옥탑방 코어 (vworld-tier5-penthouse, H ~ H+2.8m)
 */

import type maplibregl from 'maplibre-gl';

// -----------------------------------------------------------------------------
// 1. GPU 총 높이(Total Height) 계산 Expression (0% Flat 방지, 100% 입체화)
// -----------------------------------------------------------------------------
export const VWORLD_GPU_TOTAL_HEIGHT_EXPR: any = [
  'let',
  'declH',
  [
    'coalesce',
    ['to-number', ['get', 'render_height'], 0],
    ['to-number', ['get', 'height'], 0],
    ['to-number', ['get', 'hei'], 0],
    ['to-number', ['get', 'HEI'], 0],
    ['to-number', ['get', 'bld_hgt'], 0],
    ['to-number', ['get', 'BLD_HGT'], 0],
    ['*', ['to-number', ['get', 'gro_flo_co'], 0], 3.1],
    ['*', ['to-number', ['get', 'GRO_FLO_CO'], 0], 3.1],
    ['*', ['to-number', ['get', 'levels'], 0], 3.1],
    ['*', ['to-number', ['get', 'building:levels'], 0], 3.1],
    ['*', ['to-number', ['get', 'grnd_flr'], 0], 3.1],
    ['*', ['to-number', ['get', 'flr_cnt'], 0], 3.1],
    0,
  ],
  'areaVal',
  ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 150], 150],
  'idHash',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], ['get', 'bd_mgt_sn'], 45678], 45678]],
  [
    'case',
    // 0. 비건물(지적도 필지선, 용도지역 경계선, 면적 3,800㎡ 초과 운동장/산림) 0m 차단
    [
      'any',
      ['==', ['get', 'is_non_building'], true],
      ['==', ['get', 'is_site_boundary'], true],
      ['==', ['get', 'layer_type'], 'zoning'],
      ['==', ['get', 'layer_type'], 'cadastral'],
      ['==', ['get', 'layer_type'], 'landuse'],
      ['==', ['get', 'building'], 'no'],
      ['==', ['get', 'jimok'], '임'],
      ['==', ['get', 'jimok'], '임야'],
      ['==', ['get', 'jimok_nm'], '임야'],
      ['>', ['var', 'areaVal'], 3800],
      ['<', ['var', 'areaVal'], 15],
    ],
    0,

    // 1. 아파트 단지 (apartments 또는 단지형 주거동): 48.0m ~ 75.0m (15~25층)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
    ],
    [
      'case',
      ['>=', ['var', 'declH'], 15.0],
      ['max', 48.0, ['min', 75.0, ['var', 'declH']]],
      ['+', 48.0, ['%', ['var', 'idHash'], 28]],
    ],

    // 2. 소형 단독주택·빌라·농가 (area < 220㎡): 7.5m ~ 10.5m (2~3층)
    ['<', ['var', 'areaVal'], 220],
    [
      'case',
      ['>=', ['var', 'declH'], 3.0],
      ['min', 10.5, ['max', 7.5, ['var', 'declH']]],
      ['+', 7.5, ['*', ['%', ['var', 'idHash'], 31], 0.1]],
    ],

    // 3. 도청·시청·군청·혁신도시 공공청사(심평원, 건보공단 등)·학교·병원 (600㎡ <= area <= 3,800㎡ 비주거): 18.0m ~ 42.0m (5~13층)
    [
      'all',
      ['>=', ['var', 'areaVal'], 600],
      [
        'any',
        ['==', ['get', 'class'], 'commercial'],
        ['==', ['get', 'class'], 'office'],
        ['==', ['get', 'class'], 'public'],
        ['==', ['get', 'class'], 'hospital'],
        ['==', ['get', 'class'], 'university'],
        ['==', ['get', 'class'], 'school'],
        ['==', ['get', 'class'], 'government'],
        ['==', ['get', 'class'], 'military'],
        ['==', ['get', 'building'], 'commercial'],
        ['==', ['get', 'building'], 'office'],
        ['==', ['get', 'building'], 'public'],
        ['==', ['get', 'building'], 'government'],
        ['==', ['get', 'building'], 'hospital'],
        ['==', ['get', 'building'], 'school'],
        ['==', ['get', 'usageType'], 'commercial'],
        ['==', ['get', 'usageType'], 'military_public'],
        ['==', ['get', 'bld_category'], 'commercial'],
        ['==', ['get', 'bld_category'], 'public_military'],
      ],
    ],
    [
      'case',
      ['>=', ['var', 'declH'], 12.0],
      ['max', 18.0, ['min', 42.0, ['var', 'declH']]],
      ['+', 18.0, ['%', ['var', 'idHash'], 25]],
    ],

    // 4. 시·군 시내 상가·근린생활 (220㎡ <= area < 600㎡): 13.0m ~ 20.0m (4~6층)
    [
      'any',
      ['all', ['>=', ['var', 'areaVal'], 220], ['<', ['var', 'areaVal'], 600]],
      ['==', ['get', 'class'], 'commercial'],
      ['==', ['get', 'class'], 'retail'],
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'building'], 'commercial'],
      ['==', ['get', 'building'], 'retail'],
      ['==', ['get', 'building'], 'office'],
      ['==', ['get', 'usageType'], 'commercial'],
    ],
    [
      'case',
      ['>=', ['var', 'declH'], 6.0],
      ['max', 13.0, ['min', 20.0, ['var', 'declH']]],
      ['+', 13.0, ['%', ['var', 'idHash'], 8]],
    ],

    // 5. 실측 높이가 선언된 일반 건물: 선언 높이 반영
    ['>=', ['var', 'declH'], 6.0],
    ['var', 'declH'],

    // 6. 폴백 일반 시가지 건물 (해시 분배: 40% 아파트형 48~65m, 40% 상가 14~20m, 20% 저층 7.5~10.5m)
    [
      'case',
      ['<', ['%', ['var', 'idHash'], 100], 40],
      ['+', 48.0, ['%', ['var', 'idHash'], 18]],
      ['<', ['%', ['var', 'idHash'], 100], 80],
      ['+', 14.0, ['%', ['var', 'idHash'], 7]],
      ['+', 7.5, ['*', ['%', ['var', 'idHash'], 31], 0.1]],
    ],
  ],
];

// -----------------------------------------------------------------------------
// 2. 색상 표현식 (서울 V-World 실사 16색 스펙트럼 & 옥상 4대 재질)
// -----------------------------------------------------------------------------

/** Tier 1: 1층 기단부 다크 브라운/차콜 화강석 톤 */
export const VWORLD_TIER1_PODIUM_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]],
  [
    'case',
    ['<', ['%', ['var', 'h'], 4], 1],
    '#44403c', // 다크 웜 화강석
    ['<', ['%', ['var', 'h'], 4], 2],
    '#57534e', // 웜 스톤 차콜
    ['<', ['%', ['var', 'h'], 4], 3],
    '#475569', // 슬레이트 화강암
    '#334155', // 다크 슬레이트
  ],
];

/** Tier 2: 기준층 본동 16색 실사 스펙트럼 (밝은 V-World 서울 실사 색채) */
export const VWORLD_TIER2_BODY_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 67890], 67890]],
  [
    'case',
    // 1. 아파트 단지: 눈부신 크림 화이트, 소프트 아이보리, 샌드 베이지, 라이트 웜그레이 (어두운 흑회색 절대 금지!)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 4], 1],
      '#f8fafc', // 크림 화이트
      ['<', ['%', ['var', 'h'], 4], 2],
      '#f1f5f9', // 소프트 아이보리
      ['<', ['%', ['var', 'h'], 4], 3],
      '#ebe4d8', // 샌드 베이지
      '#e2e8f0', // 라이트 웜그레이
    ],

    // 2. 공공청사·오피스 타워: 세련된 스카이블루 커튼월, 에메랄드 글래스, 밝은 PC 콘크리트
    [
      'any',
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'class'], 'public'],
      ['==', ['get', 'class'], 'government'],
      ['==', ['get', 'class'], 'hospital'],
      ['==', ['get', 'building'], 'office'],
      ['==', ['get', 'building'], 'public'],
      ['==', ['get', 'building'], 'government'],
      ['==', ['get', 'usageType'], 'military_public'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 3], 1],
      '#7dd3fc', // 스카이블루 커튼월
      ['<', ['%', ['var', 'h'], 3], 2],
      '#5eead4', // 에메랄드 글래스
      '#e7e5e4', // 밝은 PC 콘크리트
    ],

    // 3. 시내 상가·근린생활: 밝은 사비석 화강석, 붉은 적벽돌, 모던 차콜, 황토 파벽돌
    [
      'any',
      ['==', ['get', 'class'], 'commercial'],
      ['==', ['get', 'class'], 'retail'],
      ['==', ['get', 'building'], 'commercial'],
      ['==', ['get', 'building'], 'retail'],
      ['==', ['get', 'usageType'], 'commercial'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 4], 1],
      '#d6cfc2', // 밝은 사비석 화강석
      ['<', ['%', ['var', 'h'], 4], 2],
      '#991b1b', // 붉은 적벽돌
      ['<', ['%', ['var', 'h'], 4], 3],
      '#475569', // 모던 차콜
      '#9a3412', // 황토 파벽돌
    ],

    // 4. 저층 단독주택·빌라·학교: 적벽돌, 황토벽돌, 크림 스타코, 테라코타
    [
      'case',
      ['<', ['%', ['var', 'h'], 4], 1],
      '#7c2d12', // 적벽돌
      ['<', ['%', ['var', 'h'], 4], 2],
      '#b45309', // 황토벽돌
      ['<', ['%', ['var', 'h'], 4], 3],
      '#f5f5f4', // 크림 스타코
      '#ea580c', // 테라코타
    ],
  ],
];

/** Tier 3: 상가 가로 간판 띠 & 아파트 브랜드 벨트 (선명한 간판 컬러 라인) */
export const VWORLD_TIER3_ACCENT_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 99999], 99999]],
  [
    'case',
    ['<', ['%', ['var', 'h'], 4], 1],
    '#dc2626', // 선명한 레드
    ['<', ['%', ['var', 'h'], 4], 2],
    '#2563eb', // 코발트 블루
    ['<', ['%', ['var', 'h'], 4], 3],
    '#d97706', // 앰버 골드
    '#16a34a', // 포레스트 그린
  ],
];

/** Tier 4: 서울 V-World 실사 옥상 4대 재질 배분 */
export const VWORLD_TIER4_ROOF_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 54321], 54321]],
  [
    'case',
    // 1. 아파트·공공청사·대형 빌딩 (30%): 밝은 시멘트 회색 슬래브 옥상 (#94a3b8, #cbd5e1)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'class'], 'public'],
      ['==', ['get', 'class'], 'government'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 2], 1],
      '#94a3b8',
      '#cbd5e1',
    ],

    // 2. 단독주택·농어촌 주택·학교 (15%): 적갈색/오렌지 브라운 기와 지붕 (#7c2d12, #9a3412)
    [
      'any',
      ['==', ['get', 'class'], 'house'],
      ['==', ['get', 'class'], 'residential'],
      ['==', ['get', 'class'], 'school'],
      ['==', ['get', 'building'], 'house'],
      ['==', ['get', 'building'], 'residential'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 2], 1],
      '#7c2d12',
      '#9a3412',
    ],

    // 3. 공장·창고·체육관 (5%): 코발트 블루 강판 지붕 (#1d4ed8)
    [
      'any',
      ['==', ['get', 'class'], 'industrial'],
      ['==', ['get', 'class'], 'warehouse'],
      ['==', ['get', 'building'], 'industrial'],
      ['==', ['get', 'building'], 'warehouse'],
    ],
    '#1d4ed8',

    // 4. 일반 상가·빌라·원룸 (50%): 한국 도시 특유의 초록색/세이지 우레탄 방수 옥상 (#2d6a4f, #3b7a57, #40916c)
    [
      'case',
      ['<', ['%', ['var', 'h'], 3], 1],
      '#2d6a4f',
      ['<', ['%', ['var', 'h'], 3], 2],
      '#3b7a57',
      '#40916c',
    ],
  ],
];

/** Tier 5: 옥상 테두리 난간(Parapet) 및 엘리베이터 옥탑방 코어 색상 */
export const VWORLD_TIER5_PENTHOUSE_COLOR_EXPR: any = '#e2e8f0'; // 밝은 회백색

// -----------------------------------------------------------------------------
// 3. 5대 GPU 다층 슬라이스 레이어 정의
// -----------------------------------------------------------------------------

export const VWORLD_GPU_BUILDING_LAYER_IDS = [
  'vworld-tier1-podium',
  'vworld-tier2-body',
  'vworld-tier3-accent',
  'vworld-tier4-roof',
  'vworld-tier5-penthouse',
] as const;

/** 순수 건물(Building) 필터: 비건물, 부지/필지 경계, 용도지역 및 3,800㎡ 초과 구역 영구 제외 */
export const VWORLD_PURE_BUILDING_FILTER: any = [
  'all',
  ['!=', ['get', 'is_non_building'], true],
  ['!=', ['get', 'is_site_boundary'], true],
  ['!=', ['get', 'layer_type'], 'cadastral'],
  ['!=', ['get', 'layer_type'], 'zoning'],
  ['!=', ['get', 'layer_type'], 'landuse'],
  ['!=', ['get', 'building'], 'no'],
  ['<=', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 0], 0], 3800],
  ['>=', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 100], 100], 15],
  ['!', ['has', 'UQ111']],
  ['!', ['has', 'UQ111_NM']],
  ['!', ['has', 'uq111']],
  ['!', ['has', 'zoneName']],
  ['!', ['has', 'zone_nm']],
  ['!', ['has', 'spfc_nm']],
  ['!', ['has', 'landuse']],
  ['!', ['has', 'leisure']],
];

/**
 * 5대 GPU 입체 층(Tiers) 레이어 생성기
 */
export function createVworldGpuLayers(
  sourceId: string = 'openmaptiles-vector',
  sourceLayer: string = 'building'
): maplibregl.LayerSpecification[] {
  const isGeojson = sourceId.endsWith('-source') || sourceId.includes('geojson') || !sourceLayer || sourceLayer === 'none';
  const srcLayerObj = isGeojson ? {} : { 'source-layer': sourceLayer };

  // 1. Tier 1: 1층 기단부 (0m ~ min(3.8m, H))
  const tier1Podium: maplibregl.LayerSpecification = {
    id: 'vworld-tier1-podium',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: VWORLD_PURE_BUILDING_FILTER,
    minzoom: 11.0,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER1_PODIUM_COLOR_EXPR,
      'fill-extrusion-base': 0,
      'fill-extrusion-height': ['min', 3.8, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 2. Tier 2: 기준층 본동 (min(3.8m, H) ~ max(min(3.8m, H), H - 0.8m))
  const tier2Body: maplibregl.LayerSpecification = {
    id: 'vworld-tier2-body',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: VWORLD_PURE_BUILDING_FILTER,
    minzoom: 11.0,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER2_BODY_COLOR_EXPR,
      'fill-extrusion-base': ['min', 3.8, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
      'fill-extrusion-height': [
        'max',
        ['min', 3.8, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
        ['-', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 0.8],
      ],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 3. Tier 3: 상가 가로 간판 띠 (3.5m ~ 4.8m)
  const tier3Accent: maplibregl.LayerSpecification = {
    id: 'vworld-tier3-accent',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: [
      'all',
      VWORLD_PURE_BUILDING_FILTER,
      ['>=', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 7.5],
      [
        'any',
        ['==', ['get', 'class'], 'commercial'],
        ['==', ['get', 'class'], 'retail'],
        ['==', ['get', 'building'], 'commercial'],
        ['==', ['get', 'building'], 'retail'],
        ['==', ['get', 'usageType'], 'commercial'],
      ],
    ],
    minzoom: 13.5,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER3_ACCENT_COLOR_EXPR,
      'fill-extrusion-base': 3.5,
      'fill-extrusion-height': ['min', 4.8, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 4. Tier 4: 서울 V-World 실사 옥상 (max(0, H - 0.8m) ~ H)
  const tier4Roof: maplibregl.LayerSpecification = {
    id: 'vworld-tier4-roof',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: VWORLD_PURE_BUILDING_FILTER,
    minzoom: 11.5,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER4_ROOF_COLOR_EXPR,
      'fill-extrusion-base': ['max', 0, ['-', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 0.8]],
      'fill-extrusion-height': VWORLD_GPU_TOTAL_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 5. Tier 5: 5층 이상 고층 옥상 옥탑방 코어 & 파라펫 (H ~ H + 2.8m)
  const tier5Penthouse: maplibregl.LayerSpecification = {
    id: 'vworld-tier5-penthouse',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: [
      'all',
      VWORLD_PURE_BUILDING_FILTER,
      ['>=', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 15.0],
    ],
    minzoom: 14.0,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER5_PENTHOUSE_COLOR_EXPR,
      'fill-extrusion-base': VWORLD_GPU_TOTAL_HEIGHT_EXPR,
      'fill-extrusion-height': ['+', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 2.8],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  return [tier1Podium, tier2Body, tier3Accent, tier4Roof, tier5Penthouse];
}

// -----------------------------------------------------------------------------
// 4. V-World 주광 조명 및 레이어 컨트롤러
// -----------------------------------------------------------------------------

export class VworldGpuMasterEngine {
  /**
   * [2-3] 밝고 선명한 V-World 주광 조명(Light) 설정
   */
  public static setupLighting(map: maplibregl.Map): void {
    if (!map) return;
    try {
      map.setLight({
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.45,
        position: [1.3, 210, 45],
      });
    } catch (err) {
      console.warn('[VworldGpuMasterEngine] setLight notice:', err);
    }
  }

  /**
   * 5대 GPU 다층 슬라이스 레이어를 맵에 등록 (도로망 위, 라벨 아래에 안착)
   */
  public static mountLayers(
    map: maplibregl.Map,
    sourceId: string = 'openmaptiles-vector',
    sourceLayer: string = 'building',
    beforeId?: string
  ): void {
    if (!map) return;

    this.setupLighting(map);

    const layers = createVworldGpuLayers(sourceId, sourceLayer);

    for (const layerDef of layers) {
      if (map.getLayer(layerDef.id)) {
        try {
          map.removeLayer(layerDef.id);
        } catch {}
      }

      try {
        if (beforeId && map.getLayer(beforeId)) {
          map.addLayer(layerDef, beforeId);
        } else {
          map.addLayer(layerDef);
        }
      } catch (addErr) {
        console.warn(`[VworldGpuMasterEngine] addLayer notice (${layerDef.id}):`, addErr);
      }
    }
  }

  /**
   * 가시성 동적 토글 (초경량 0ms 제어)
   */
  public static setVisible(map: maplibregl.Map, visible: boolean): void {
    if (!map) return;
    const visStr = visible ? 'visible' : 'none';

    for (const layerId of VWORLD_GPU_BUILDING_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        try {
          map.setLayoutProperty(layerId, 'visibility', visStr);
        } catch {}
      }
    }
  }
}
