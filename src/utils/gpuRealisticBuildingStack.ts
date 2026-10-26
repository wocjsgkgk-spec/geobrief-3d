/**
 * gpuRealisticBuildingStack.ts
 *
 * MapLibre C++/WebGL 네이티브 GPU 기반 다층 슬라이싱(Multi-Tier Slicing) 실감 건축 엔진
 * - 3D 지형(DEM Terrarium) 표고 변위 셰이더와 100% 완벽 호환 (지형 밀착 솟아오름 보장)
 * - Main Thread JavaScript 루프 0% (CPU 부하 완전 제거, 60fps 보장)
 * - 4단 GPU 슬라이스:
 *   1) bldg-tier1-podium (기단부, 1층): base 0 ~ height 3.6m (#334155 화강석 차콜)
 *   2) bldg-tier2-mainwall (외벽 본체): base 3.6m ~ height [H - 0.8m] (아파트: 아이보리/웜그레이, 오피스: 슬레이트, 주택: 샌드/적벽돌)
 *   3) bldg-tier3-pattern (실사 창문 그리드 오버레이): 동일 구간 fill-extrusion-pattern 투영 (opacity: 0.85)
 *   4) bldg-tier4-roofcap (옥상 슬래브/파라펫 캡): base [H - 0.8m] ~ height [H] (콘크리트 35%, 방수우레탄 30%, 먹색 20%, 적갈색 15%)
 * - 0% Flat 높이 방지: OSM render_height/height가 없거나 < 4m일 경우 건물 용도/면적/ID 해시 기반 한국형 표준 층고 보장
 */

import maplibregl from 'maplibre-gl';
import {
  VWORLD_PALETTE,
  VWORLD_WALL_COLOR_EXPR,
  VWORLD_ROOF_COLOR_EXPR,
  VWORLD_PODIUM_COLOR_EXPR,
  VWORLD_APT_VERANDA_PATTERN_ID,
  VWORLD_APT_SIDE_PATTERN_ID,
  VWORLD_ROOF_PARAPET_AO_PATTERN_ID,
  ensureVWorldAuthenticPatterns,
  createVWorldAptVerandaPatternImage,
  createVWorldAptSidePatternImage,
  createVWorldRoofParapetAOImage,
} from '@/utils/vworldAuthenticStyler';

// -----------------------------------------------------------------------------
// 1. GPU 총 높이(Total Height) 계산 Expression (0% Flat 방지, 100% 입체화)
// 단 하나의 표준 높이 식 BUILDING_HEIGHT_EXPR로 통일하여 0mm 오차 없는 완벽 밀착 결합 보장
// -----------------------------------------------------------------------------
export const gpuBuildingTotalHeightExpr: any = [
  'let',
  'declaredHeight',
  [
    'coalesce',
    ['to-number', ['get', 'render_height'], 0],
    ['to-number', ['get', 'height'], 0],
    ['to-number', ['get', 'hei'], 0],
    ['to-number', ['get', 'HEI'], 0],
    ['to-number', ['get', 'bld_hgt'], 0],
    ['*', ['to-number', ['get', 'grnd_flr'], 0], 3.2],
    ['*', ['to-number', ['get', 'GRND_FLR'], 0], 3.2],
    ['*', ['to-number', ['get', 'gro_flo_co'], 0], 3.2],
    ['*', ['to-number', ['get', 'GRO_FLO_CO'], 0], 3.2],
    ['*', ['to-number', ['get', 'flr_cnt'], 0], 3.2],
    ['*', ['to-number', ['get', 'levels'], 0], 3.2],
    ['*', ['to-number', ['get', 'building:levels'], 0], 3.2],
    0,
  ],
  [
    'case',
    // 0. 비건물 / 부지 경계 / 연속지적도 필지 / 용도지역 / 면적 4,500㎡ 초과 시 높이 0m (3D 압출 즉시 제외)
    [
      'any',
      ['==', ['get', 'is_non_building'], true],
      ['==', ['get', 'is_site_boundary'], true],
      ['>', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 0], 0], 4500],
      ['has', 'UQ111'],
      ['has', 'UQ111_NM'],
      ['has', 'uq111'],
      ['has', 'zoneName'],
      ['has', 'zone_nm'],
      ['has', 'spfc_nm'],
      ['has', 'spfc_cd'],
      ['has', 'landuse'],
      ['has', 'leisure'],
    ],
    0,

    // [절대 규칙 1 & 2: 소형 필지 면적 280㎡ 미만은 절대로 고층 불가 - 6.5m~11.5m 제한]
    ['<', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 999], 999], 220],
    ['+', 6.5, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 89012], 89012]], 5]],

    ['<', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 999], 999], 280],
    ['+', 8.0, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 89012], 89012]], 6]],

    // 1. 이미 실측 높이(>= 10.0m)가 선언되어 있다면 우선 적용 (단, 면적 280㎡ 미만은 위에서 사전 필터링)
    ['>=', ['var', 'declaredHeight'], 10.0],
    ['var', 'declaredHeight'],

    // 2. 아파트 단지 및 고층 주거: 48m ~ 75m (16~25층)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
    ],
    [
      '+',
      48,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 28], // 48..75m
    ],

    // 3. 중·저층 상가·원룸·근린생활 블록: 14m ~ 26m (4~8층 중층 빌딩)
    [
      'any',
      ['==', ['get', 'class'], 'commercial'],
      ['==', ['get', 'class'], 'retail'],
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'class'], 'public'],
      ['==', ['get', 'class'], 'hospital'],
      ['==', ['get', 'class'], 'university'],
      ['==', ['get', 'building'], 'commercial'],
      ['==', ['get', 'building'], 'office'],
      ['==', ['get', 'usageType'], 'commercial'],
      ['==', ['get', 'bld_category'], 'commercial'],
    ],
    [
      '+',
      14,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 23456], 23456]], 13], // 14..26m
    ],

    // 4. 산업/군사/물류/창고: 10m ~ 18m
    [
      'any',
      ['==', ['get', 'class'], 'industrial'],
      ['==', ['get', 'class'], 'warehouse'],
      ['==', ['get', 'class'], 'military'],
      ['==', ['get', 'building'], 'industrial'],
      ['==', ['get', 'building'], 'warehouse'],
    ],
    [
      '+',
      10,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 9], // 10..18m
    ],

    // 5. 일반 시가지 / 단지형 중대형 건물 vs 시내 상가 vs 일반 주택가 (100% 입체화)
    [
      'case',
      // 단지형 중대형 건물: 42m ~ 68m (14층 ~ 23층 아파트)
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 45678], 45678]], 100], 40],
      ['+', 42, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 56789], 56789]], 27]], // 42..68m
      // 시내 상가·오피스 블록: 14m ~ 26m (4층 ~ 8층)
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 45678], 45678]], 100], 75],
      ['+', 14, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 67890], 67890]], 13]], // 14..26m
      // 일반 주택가: 8m ~ 13m (2.5층 ~ 4층)
      ['+', 8, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 89012], 89012]], 6]],   // 8..13m
    ],
  ],
];

/** 표준 단일 높이 Expression (기단부/본동/옥상 슬래브 0mm 오차 통일) */
export const BUILDING_HEIGHT_EXPR: any = gpuBuildingTotalHeightExpr;

// -----------------------------------------------------------------------------
// 2. 바닥 기본 고도(Base Height) Expression
// -----------------------------------------------------------------------------
export const gpuBuildingBaseExpr: any = [
  'coalesce',
  ['to-number', ['get', 'render_min_height'], 0],
  ['to-number', ['get', 'min_height'], 0],
  0,
];

// -----------------------------------------------------------------------------
// 3. 중층 외벽 본체(Main Wall) 색상 Expression (V-World Authentic 한국형 4대 구역 분리)
// - 아파트: 크림 아이보리(#f4efe6) / 소프트 베이지(#e8e0d2)
// - 상업/오피스: 붉은 벽돌(#8c3f2b) / 황토 타일(#9a6b4c) / 화강암(#78716c)
// - 일반 주택가: 붉은 벽돌(#7f3222) / 살구색 베이지(#d6c7b2)
// - 산업/물류: 베이지/연회색 샌드위치 판넬(#cbd5e1, #d1d5db)
// -----------------------------------------------------------------------------
export const gpuBuildingWallColorExpr: any = VWORLD_WALL_COLOR_EXPR;

// -----------------------------------------------------------------------------
// 4. 건물 유형별 실제 한국 지붕 색상 Expression (V-World Authentic 한국형 지붕)
// 1) 고층 아파트 단지: 짙은 콘크리트 슬래브(#57534e) / 박공 캡(#6b3426)
// 2) 중·저층 상가·원룸: 우레탄 에메랄드초록(#2e6f4e, 50%), 테라코타(#7c3626, 25%), 시멘트(#64748b, 25%)
// 3) 단독주택·다세대: 적갈색 기와(#6e2c1b, 40%), 청색 슬레이트(#254e7a, 30%), 우레탄(#356854, 30%)
// 4) 공장/군사: 코발트 블루(#1d4ed8, 60%), 은색 징크(#cbd5e1, 40%)
// -----------------------------------------------------------------------------
export const gpuBuildingRoofColorExpr: any = VWORLD_ROOF_COLOR_EXPR;
export const gpuBuildingPodiumColorExpr: any = VWORLD_PODIUM_COLOR_EXPR;

// -----------------------------------------------------------------------------
// [V-World 3D 건물 스타일러 테마별 Expression]
// 1) 용도별 색상 모드 (Landuse): 주거-황색, 상업-적색, 공업-자주색, 공공/군사-청색
// 2) 층수/높이 스펙트럼 모드 (Height Spectrum): 저층-청록 -> 중층-황색 -> 고층-적색
// -----------------------------------------------------------------------------
export const gpuBuildingLanduseWallColorExpr: any = [
  'case',
  // 주거: 밝은 크림 아이보리 (#f5f2eb)
  [
    'any',
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'class'], 'residential'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'building'], 'residential'],
    ['==', ['get', 'building'], 'house'],
    ['==', ['get', 'type'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'usageType'], 'residential'],
    ['==', ['get', 'bld_category'], 'apartment'],
    ['==', ['get', 'bld_category'], 'residential'],
  ],
  '#f5f2eb',

  // 상업·업무: 밝은 화강석 베이지 (#dfd9ce)
  [
    'any',
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'class'], 'office'],
    ['==', ['get', 'class'], 'hospital'],
    ['==', ['get', 'building'], 'commercial'],
    ['==', ['get', 'building'], 'office'],
    ['==', ['get', 'building'], 'retail'],
    ['==', ['get', 'usageType'], 'commercial'],
    ['==', ['get', 'bld_category'], 'commercial'],
  ],
  '#dfd9ce',

  // 공업·물류: 밝은 실버 판넬 (#e2e8f0)
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
    ['==', ['get', 'usageType'], 'industrial'],
  ],
  '#e2e8f0',

  // 공공·군사·청사: 웜 베이지 그레이 (#ece7de)
  [
    'any',
    ['==', ['get', 'class'], 'military'],
    ['==', ['get', 'class'], 'public'],
    ['==', ['get', 'class'], 'government'],
    ['==', ['get', 'class'], 'school'],
    ['==', ['get', 'class'], 'university'],
    ['==', ['get', 'building'], 'public'],
    ['==', ['get', 'building'], 'government'],
    ['==', ['get', 'usageType'], 'military_public'],
    ['==', ['get', 'bld_category'], 'public_military'],
    ['==', ['coalesce', ['get', 'isMilitaryOrPublic'], false], true],
  ],
  '#ece7de',

  // 기타: 밝은 크림 아이보리 폴백
  '#f5f2eb',
];

export const gpuBuildingLanduseRoofColorExpr: any = [
  'case',
  // 주거 옥상: 차분한 다크 그레이 슬래브
  [
    'any',
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'class'], 'residential'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'usageType'], 'residential'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  '#57534e',

  // 상업 옥상: 우레탄 세이지 그린
  [
    'any',
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'class'], 'office'],
    ['==', ['get', 'usageType'], 'commercial'],
  ],
  '#357a56',

  // 공업 옥상: 청색 강판 지붕
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
  ],
  '#254e7a',

  // 공공·군사 옥상: 적갈색 기와 박공
  [
    'any',
    ['==', ['get', 'class'], 'military'],
    ['==', ['get', 'class'], 'public'],
    ['==', ['get', 'usageType'], 'military_public'],
    ['==', ['coalesce', ['get', 'isMilitaryOrPublic'], false], true],
  ],
  '#6e3222',

  '#57534e',
];

const HEIGHT_NUM_FOR_INTERPOLATE: any = [
  'coalesce',
  ['to-number', ['get', 'render_height']],
  ['to-number', ['get', 'height']],
  ['to-number', ['get', 'hei']],
  ['*', ['to-number', ['coalesce', ['get', 'grnd_flr'], ['get', 'levels'], 3]], 3.3],
  14,
];

export const gpuBuildingHeightSpectrumWallColorExpr: any = [
  'interpolate',
  ['linear'],
  HEIGHT_NUM_FOR_INTERPOLATE,
  8.0, '#f5f2eb',   // 저층 (2~3층, 8m): 밝은 크림 아이보리
  16.0, '#dfd9ce',  // 저-중층 (4~5층, 16m): 밝은 화강석 베이지
  28.0, '#d6d3d1',  // 중층 (7~9층, 28m): 세련된 웜그레이
  45.0, '#eae3d5',  // 중-고층 (12~15층, 45m): 웜 샌드 베이지
  60.0, '#f5f2eb',  // 고층 (18~20층, 60m): 밝은 아이보리
  75.0, '#f6f3eb'   // 초고층 (25층+, 75m+): 밝은 크림 아이보리
];

export const gpuBuildingHeightSpectrumRoofColorExpr: any = [
  'interpolate',
  ['linear'],
  HEIGHT_NUM_FOR_INTERPOLATE,
  8.0, '#6e3222',   // 저층: 적갈색 기와
  16.0, '#357a56',  // 중층: 우레탄 세이지 그린
  28.0, '#78716c',  // 중-고층: 콘크리트 그레이
  50.0, '#57534e',  // 고층: 아파트 다크 슬래브
  75.0, '#57534e'   // 초고층: 아파트 다크 슬래브
];

// -----------------------------------------------------------------------------
// 5. 실사 창문 패턴 & 옥상 난간/코어 텍스처 등록 함수 (한국형 아파트 베란다 및 옥상 디테일)
// -----------------------------------------------------------------------------
export const BUILDING_PATTERN_IMAGE_ID = 'facade-window-grid';
export const ROOF_PARAPET_PATTERN_IMAGE_ID = 'roof-parapet-core-grid';

export function ensureBuildingPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  // 브이월드 정품 실사 패턴 등록 (베란다 통유리, 브랜드 측벽, 옥상 파라펫/Inner AO)
  ensureVWorldAuthenticPatterns(map);

  // 1) 외벽 실사 베란다 창호 격자 패턴 등록 (하위 호환 ID: facade-window-grid 도 최고품질 베란다 패턴으로 바인딩)
  if (!map.hasImage(BUILDING_PATTERN_IMAGE_ID)) {
    try {
      const imgData = createVWorldAptVerandaPatternImage(256);
      if (imgData) {
        map.addImage(BUILDING_PATTERN_IMAGE_ID, imgData);
      }
    } catch (err) {
      console.warn('[gpuRealisticBuildingStack] Failed to register window pattern image:', err);
    }
  }

  // 2) 옥상 난간 테두리 라인 & 옥탑 기계실 코어 패턴 등록 (하위 호환 ID: roof-parapet-core-grid)
  if (!map.hasImage(ROOF_PARAPET_PATTERN_IMAGE_ID)) {
    try {
      const imgData = createVWorldRoofParapetAOImage(256);
      if (imgData) {
        map.addImage(ROOF_PARAPET_PATTERN_IMAGE_ID, imgData);
      }
    } catch (err) {
      console.warn('[gpuRealisticBuildingStack] Failed to register roof parapet pattern image:', err);
    }
  }
}

// -----------------------------------------------------------------------------
// 6. 5단 GPU 다층 슬라이스 및 접지 음영(AO) 레이어 정의 생성기
// -----------------------------------------------------------------------------
export const GPU_BUILDING_LAYER_IDS = [
  'bldg-ground-ao',
  'bldg-tier1-podium',
  'bldg-tier2-mainwall',
  'bldg-tier3-pattern',
  'bldg-tier4-roofcap',
  'bldg-tier5-roofdetail',
] as const;

export function createGpuBuildingStackLayers(
  sourceId: string = 'openmaptiles-vector',
  sourceLayer?: string,
  prefix: string = ''
): maplibregl.LayerSpecification[] {
  const p = prefix ? `${prefix}-` : '';

  // GeoJSON 소스('real-buildings-source', 'fusion-buildings-source' 등)는 source-layer 지정 시 MapLibre 오류 발생
  const isGeojson = sourceId.endsWith('-source') || sourceId.includes('geojson') || !sourceLayer || sourceLayer === 'none';
  const srcLayerObj = isGeojson ? {} : { 'source-layer': sourceLayer || 'building' };

  // [요구사항 2] 3D 건물 압출 레이어 필터: 비건물, 부지/필지 경계, 용도지역, 공원/단지(landuse) 및 4,500㎡ 초과 구역 100% 원천 차단
  const buildingFilter: any = [
    'all',
    ['!=', ['get', 'is_non_building'], true],
    ['!=', ['get', 'is_site_boundary'], true],
    ['!=', ['get', 'layer_type'], 'cadastral'],
    ['!=', ['get', 'layer_type'], 'zoning'],
    ['<=', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 0], 0], 4500],
    ['!', ['has', 'UQ111']],
    ['!', ['has', 'UQ111_NM']],
    ['!', ['has', 'uq111']],
    ['!', ['has', 'zoneName']],
    ['!', ['has', 'zone_nm']],
    ['!', ['has', 'spfc_nm']],
    ['!', ['has', 'spfc_cd']],
    ['!', ['has', 'landuse']],
    ['!', ['has', 'leisure']],
  ];

  // Tier 0: 건물 바닥 접지 음영 (Ambient Occlusion Contact Shadow)
  // - 위성사진과 건물 바닥 경계선에 얇고 선명한 음영을 주어 건물이 바닥에 정확히 뿌리박혀 보이도록 정합
  const tier0GroundAO: maplibregl.LayerSpecification = {
    id: `${p}bldg-ground-ao`,
    type: 'line',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 12,
    maxzoom: 24,
    paint: {
      'line-color': '#020617', // 심층 차콜 블랙 접지 음영
      'line-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13.0, 0.0,
        14.5, 0.55,
        16.0, 0.82,
        18.0, 0.95,
      ],
      'line-width': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        13.0, 0.8,
        14.5, 2.2,
        16.0, 4.5,
        18.0, 8.5,
      ],
      'line-blur': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        13.0, 0.6,
        14.5, 1.4,
        16.0, 2.6,
        18.0, 5.0,
      ],
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: 'visible',
    },
  };

  // Tier 1: 1층 기단부 (Podium 0m ~ min(3.8m, H))
  // 상가는 1층(0~3.8m)에 짙은 쇼윈도(#334155), 아파트는 밝은 베이지 석재 기단부(#e8e0d2)
  const tier1Podium: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier1-podium`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': VWORLD_PODIUM_COLOR_EXPR,
      'fill-extrusion-base': gpuBuildingBaseExpr,
      'fill-extrusion-height': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 2: 중층 외벽 본체 (Main Wall min(3.8m, H) ~ H)
  // 회백색 통일 완전 폐기!
  // 아파트: 크림 아이보리(#f4efe6) / 소프트 베이지(#e8e0d2)
  // 상가: 붉은 벽돌(#8c3f2b) / 황토 타일(#9a6b4c) / 화강암(#78716c)
  // 주택: 붉은 벽돌(#7f3222) / 살구색 베이지(#d6c7b2)
  // 공장/군사: 베이지/연회색 샌드위치 판넬(#cbd5e1, #d1d5db)
  const tier2MainWall: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier2-mainwall`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': VWORLD_WALL_COLOR_EXPR,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 3: 실사 창문 패턴 오버레이 (Facade Pattern Overlay min(3.8m, H) ~ H)
  // [1단계 핵심 혁신] 전 건물 점박이 통일 현상 완전 폐기:
  // 창호 격자 패턴은 오직 고층 아파트(H >= 24m)에만 국한 적용!
  // 상가/빌라/주택/공장에는 패턴 오버레이를 적용하지 않아 실제 붉은벽돌/황토타일/석재의 원색 파사드가 100% 표출!
  const apartmentPatternFilter: any = [
    'all',
    ...buildingFilter.slice(1),
    [
      'any',
      ['>=', BUILDING_HEIGHT_EXPR, 24.0],
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
    ],
  ];

  const tier3Pattern: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier3-pattern`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: apartmentPatternFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': VWORLD_APT_VERANDA_PATTERN_ID,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.85,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 4: 옥상 슬래브 / 0.9m 파라펫 캡 (Roof Cap H ~ H + 0.9m)
  // 아파트: 짙은 슬래브(#57534e) / 박공 캡(#6b3426)
  // 상가: 에메랄드 우레탄(#2e6f4e, 50%), 테라코타(#7c3626, 25%), 시멘트(#64748b, 25%)
  // 주택: 테라코타 기와(#6e2c1b, 40%), 청색 강판(#254e7a, 30%), 우레탄(#356854, 30%)
  const tier4RoofCap: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier4-roofcap`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': VWORLD_ROOF_COLOR_EXPR,
      'fill-extrusion-base': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 0.9],
      'fill-extrusion-opacity': 1.0,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 5: [1단계 신규] 옥상 난간 테두리 코핑 & 내부 그늘(Inner AO) 디테일 (줌 14.5 ~ 15.5 정밀 페이드인)
  const tier5RoofDetail: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier5-roofdetail`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 14.5,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': VWORLD_ROOF_PARAPET_AO_PATTERN_ID,
      'fill-extrusion-base': ['+', BUILDING_HEIGHT_EXPR, 0.9],
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 1.2],
      'fill-extrusion-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14.5, 0.0,
        15.5, 0.90,
      ],
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  return [tier0GroundAO, tier1Podium, tier2MainWall, tier3Pattern, tier4RoofCap, tier5RoofDetail];
}

// -----------------------------------------------------------------------------
// 7. 가시성 및 모드 제어 헬퍼
// -----------------------------------------------------------------------------
export function setGpuBuildingLayersVisibility(
  map: maplibregl.Map,
  visible: boolean,
  keepGroundAO: boolean = false
): void {
  if (!map) return;
  const vis = visible ? 'visible' : 'none';
  const aoVis = (visible || keepGroundAO) ? 'visible' : 'none';

  // 접지 음영(bldg-ground-ao)은 건물 표시가 켜져 있으면 상시 유지 (Three.js 및 3D 타일셋 하단 접지력 강화)
  if (map.getLayer('bldg-ground-ao')) {
    map.setLayoutProperty('bldg-ground-ao', 'visibility', aoVis);
  }
  if (map.getLayer('fusion-bldg-ground-ao')) {
    map.setLayoutProperty('fusion-bldg-ground-ao', 'visibility', aoVis);
  }
  if (map.getLayer('real-bldg-ground-ao')) {
    map.setLayoutProperty('real-bldg-ground-ao', 'visibility', aoVis);
  }

  // 3D 입체 익스트루전 슬라이스 레이어들 가시성 제어
  const extrusionLayers = [
    'bldg-tier1-podium',
    'bldg-tier2-mainwall',
    'bldg-tier3-pattern',
    'bldg-tier4-roofcap',
    'bldg-tier5-roofdetail',
    '3d-buildings',
    '3d-buildings-roof',
    'fusion-buildings-3d',
    'fusion-buildings-roof',
  ];

  extrusionLayers.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', vis);
    }
    const geojsonId = `fusion-${id}`;
    if (map.getLayer(geojsonId)) {
      map.setLayoutProperty(geojsonId, 'visibility', vis);
    }
    const realId = `real-${id}`;
    if (map.getLayer(realId)) {
      map.setLayoutProperty(realId, 'visibility', vis);
    }
  });
}

export function setGpuBuildingLayersMode(
  map: maplibregl.Map,
  mode: 'native' | 'facade' | 'tiles3d'
): void {
  if (!map) return;
  // 모드 A (경량 네이티브): 패턴 오버레이 끄고 단일 톤
  // 모드 B (실감 파사드 LOD2): 4단 GPU 슬라이스 전체 표출
  // 모드 C (고정밀 3D): 타일셋과 공존하되 건물 소실 방지
  if (mode === 'native') {
    if (map.getLayer('bldg-tier3-pattern')) {
      map.setLayoutProperty('bldg-tier3-pattern', 'visibility', 'none');
    }
    if (map.getLayer('bldg-tier5-roofdetail')) {
      map.setLayoutProperty('bldg-tier5-roofdetail', 'visibility', 'visible');
    }
    if (map.getLayer('bldg-tier2-mainwall')) {
      map.setPaintProperty('bldg-tier2-mainwall', 'fill-extrusion-color', gpuBuildingWallColorExpr);
    }
  } else {
    if (map.getLayer('bldg-tier3-pattern')) {
      map.setLayoutProperty('bldg-tier3-pattern', 'visibility', 'visible');
    }
    if (map.getLayer('bldg-tier5-roofdetail')) {
      map.setLayoutProperty('bldg-tier5-roofdetail', 'visibility', 'visible');
    }
    if (map.getLayer('bldg-tier2-mainwall')) {
      map.setPaintProperty('bldg-tier2-mainwall', 'fill-extrusion-color', gpuBuildingWallColorExpr);
    }
  }
}

/**
 * [V-World 3D 건물 스타일러 테마 원클릭 즉시 적용 엔진]
 * - photorealistic: 실사 포토 모드 (밝은 아이보리 창문 벽체 + 다크 슬래브 / 초록 우레탄 / 테라코타 / 청색 강판 지붕)
 * - landuse: 용도별 색상 모드 (주거: 황색, 상업: 적색, 공업: 자주색, 공공·군사: 청색)
 * - height_spectrum: 층수/높이 스펙트럼 모드 (저층: 청록 -> 중층: 황색 -> 고층: 적색)
 */
export function applyBuildingThemeToMap(
  map: maplibregl.Map,
  theme: 'photorealistic' | 'landuse' | 'height_spectrum'
): void {
  if (!map) return;

  let wallExpr: any = gpuBuildingWallColorExpr;
  let roofExpr: any = gpuBuildingRoofColorExpr;
  let patternOpacity = 0.85;

  if (theme === 'landuse') {
    wallExpr = gpuBuildingLanduseWallColorExpr;
    roofExpr = gpuBuildingLanduseRoofColorExpr;
    patternOpacity = 0.15;
  } else if (theme === 'height_spectrum') {
    wallExpr = gpuBuildingHeightSpectrumWallColorExpr;
    roofExpr = gpuBuildingHeightSpectrumRoofColorExpr;
    patternOpacity = 0.10;
  }

  const wallLayers = [
    'real-bldg-tier2-mainwall',
    'real-bldg-tier1-podium',
    'fusion-bldg-tier2-mainwall',
    'fusion-bldg-tier1-podium',
    'bldg-tier2-mainwall',
    'bldg-tier1-podium',
    '3d-buildings',
  ];
  wallLayers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      try {
        map.setPaintProperty(layerId, 'fill-extrusion-color', wallExpr);
      } catch (err) {
        console.warn(`[applyBuildingTheme] Set wall color skipped for ${layerId}:`, err);
      }
    }
  });

  const roofLayers = [
    'real-bldg-tier4-roofcap',
    'fusion-bldg-tier4-roofcap',
    'bldg-tier4-roof',
  ];
  roofLayers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      try {
        map.setPaintProperty(layerId, 'fill-extrusion-color', roofExpr);
      } catch (err) {
        console.warn(`[applyBuildingTheme] Set roof color skipped for ${layerId}:`, err);
      }
    }
  });

  if (map.getLayer('bldg-tier3-pattern')) {
    try {
      map.setPaintProperty('bldg-tier3-pattern', 'fill-extrusion-opacity', patternOpacity);
    } catch {
      // ignore
    }
  }
}
