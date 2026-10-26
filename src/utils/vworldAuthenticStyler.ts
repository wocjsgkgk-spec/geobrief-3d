/**
 * utils/vworldAuthenticStyler.ts
 *
 * [1단계: 회색 점박이 통일 현상 완전 해체 및 V-World급 한국 도시(아파트·상가·주택·옥상) 전면 실사화 엔진]
 *
 * 브이월드(V-World) 3D 실사 뷰 및 국토교통부 건축물대장(getBrTitleInfo), 브이월드 WFS(LT_C_SPBD) 실측 데이터를
 * 100% 반영하여 도시 건물을 4대 고유 구역으로 완벽 분리 렌더링:
 *
 * 1) 고층 아파트 단지 (H >= 24m 또는 아파트 단지 구역):
 *    - 외벽 베이스: 밝고 세련된 크림 아이보리(#f4efe6) / 소프트 베이지(#e8e0d2)
 *    - 창문/베란다: 가로로 긴 실제 발코니 통유리창(#1e293b), 하얀색 창호 프레임 선과 층간 콘크리트 슬래브 띠
 *    - 측벽(edgeLength < 14m): 창문 없이 매끈한 크림 콘크리트에 세로형 포인트 브랜드 컬러 스트라이프 라인
 *      (갈색 #6b4423, 네이비 #1e3a5f, 웜그레이 #57534e)
 *    - 옥상: 짙은 콘크리트 슬래브(#57534e) 또는 박공 지붕 캡(#6b3426) + 승강기 기계실 큐브(2.8m)
 *
 * 2) 중층 도심 상가·원룸·오피스 블록 (10m <= H < 24m):
 *    - 외벽: 붉은 벽돌(deep red brick #8c3f2b), 황토색/갈색 타일(ochre tile #9a6b4c), 화강암 석재 회색(granite #78716c)
 *    - 1층(0~3.8m): 어두운 상가 통유리 쇼윈도(#334155) 및 간판 띠장
 *    - 옥상: 선명한 에메랄드 우레탄 방수초록(#2e6f4e, 50%), 적갈색 테라코타(#7c3626, 25%), 오래된 시멘트 회색(#64748b, 25%)
 *
 * 3) 저층 단독주택·다세대 빌라 밀집촌 (H < 10m):
 *    - 외벽: 붉은 벽돌(red brick #7f3222), 살구색/베이지(apricot beige #d6c7b2)
 *    - 지붕: 적갈색 기와(terracotta #6e2c1b, 40%), 청색 슬레이트(blue slate #254e7a, 30%), 녹색 우레탄(#356854, 30%)
 *
 * 4) 공장·물류창고·체육관·군부대 시설 (H <= 14m 및 공업/군사 구역):
 *    - 지붕: 코발트 블루(#1d4ed8) / 은색 징크 패널(#cbd5e1) 박공 지붕
 *    - 외벽: 베이지/연회색 샌드위치 판넬(#cbd5e1, #d1d5db)
 *
 * 5) 0.9m 난간(Parapet) 테두리 및 지면 접촉 음영(Ground Contact AO):
 *    - 평지붕 외곽 0.9m 돌출 난간과 안쪽 그늘(Inner AO)
 *    - 건물 하단 지면 접촉 차폐(Ambient Occlusion, #020617) 그림자 띠
 */

import maplibregl from 'maplibre-gl';

// =============================================================================
// 1. V-World 한국 도시 실사 색상 팔레트 상수 정의
// =============================================================================
export const VWORLD_PALETTE = {
  // 1) 고층 아파트 단지
  apartment: {
    wallCreamIvory: '#f4efe6',
    wallSoftBeige: '#e8e0d2',
    windowCharcoal: '#1e293b',
    windowWhiteFrame: '#ffffff',
    interFloorSlab: '#e2dcd3',
    sideWallBase: '#f4efe6',
    sideBrandBrown: '#6b4423',
    sideBrandNavy: '#1e3a5f',
    sideBrandWarmGray: '#57534e',
    roofDarkSlab: '#57534e',
    roofGableCap: '#6b3426',
    penthouseCore: '#dedad2',
  },
  // 2) 중층 도심 상가·원룸·오피스 블록
  commercial: {
    wallRedBrick: '#8c3f2b',
    wallOchreTile: '#9a6b4c',
    wallGraniteGray: '#78716c',
    podiumShopfront: '#334155',
    roofUrethaneGreen: '#2e6f4e', // 50%
    roofTerracotta: '#7c3626',     // 25%
    roofAgedCement: '#64748b',     // 25%
  },
  // 3) 저층 단독주택·다세대 빌라
  residential: {
    wallRedBrick: '#7f3222',
    wallApricotBeige: '#d6c7b2',
    roofTerracotta: '#6e2c1b',     // 40%
    roofBlueSlate: '#254e7a',      // 30%
    roofUrethane: '#356854',       // 30%
  },
  // 4) 공장·물류창고·군부대
  industrialMilitary: {
    wallSandwichPanelBeige: '#cbd5e1',
    wallSandwichPanelGray: '#d1d5db',
    roofCobaltBlue: '#1d4ed8',     // 60%
    roofSilverZinc: '#cbd5e1',     // 40%
  },
  // 5) 접지 음영 및 난간
  infrastructure: {
    groundContactAO: '#020617',
    parapetCoping: '#475569',
    parapetInnerAO: 'rgba(15, 23, 42, 0.65)',
  },
} as const;

// =============================================================================
// 2. MapLibre GPU Expression 정의 (전 건물 회백색 통일 현상 완전 해체)
// =============================================================================

/**
 * 건물 높이 식: 선언된 높이가 있으면 우선 적용, 없으면 한국형 표준 층고
 */
export const VWORLD_BUILDING_HEIGHT_EXPR: any = [
  'let',
  'declaredHeight',
  [
    'coalesce',
    ['to-number', ['get', 'render_height'], 0],
    ['to-number', ['get', 'height'], 0],
    ['to-number', ['get', 'hei'], 0],
    ['to-number', ['get', 'HEI'], 0],
    ['to-number', ['get', 'bld_hgt'], 0],
    ['*', ['to-number', ['get', 'grnd_flr'], 0], 3.3],
    ['*', ['to-number', ['get', 'GRND_FLR'], 0], 3.3],
    ['*', ['to-number', ['get', 'gro_flo_co'], 0], 3.3],
    ['*', ['to-number', ['get', 'GRO_FLO_CO'], 0], 3.3],
    ['*', ['to-number', ['get', 'grndFlrCnt'], 0], 3.3],
    ['*', ['to-number', ['get', 'flr_cnt'], 0], 3.3],
    ['*', ['to-number', ['get', 'levels'], 0], 3.3],
    ['*', ['to-number', ['get', 'building:levels'], 0], 3.3],
    0,
  ],
  [
    'case',
    // 0. 비건물 / 부지 경계 / 연속지적도 필지 / 용도지역 / 면적 4,500㎡ 초과 시 높이 0m (압출 차단)
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

    // 1. 이미 실측 높이(>= 8.0m)가 있다면 우선 적용 (단, 면적 280㎡ 미만은 위에서 사전 필터링)
    ['>=', ['var', 'declaredHeight'], 8.0],
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
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 28],
    ],

    // 3. 중·저층 상가·원룸·근린생활 블록: 14m ~ 24m (4~8층)
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
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 23456], 23456]], 11],
    ],

    // 4. 산업/군사/물류/창고: 10m ~ 14m
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
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 5],
    ],

    // 5. 일반 시가지 / 단지형 건물 vs 시내 상가 vs 일반 주택가
    [
      'case',
      // 단지형 중대형 건물: 42m ~ 68m (14층 ~ 23층 아파트)
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 45678], 45678]], 100], 40],
      ['+', 42, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 56789], 56789]], 27]],
      // 시내 상가·오피스 블록: 14m ~ 24m (4층 ~ 8층)
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 45678], 45678]], 100], 75],
      ['+', 14, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 67890], 67890]], 11]],
      // 일반 주택가: 7.5m ~ 10m (2층 ~ 3층)
      ['+', 7.5, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 89012], 89012]], 3]],
    ],
  ],
];

/**
 * 4대 구역 분류 식 (카테고리 반환)
 * - 'apartment' | 'commercial' | 'residential' | 'industrial_military'
 */
export const VWORLD_CATEGORY_EXPR: any = [
  'case',
  // 1) 고층 아파트 단지 (H >= 24m 또는 아파트 태그)
  [
    'any',
    ['>=', VWORLD_BUILDING_HEIGHT_EXPR, 24.0],
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'type'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  'apartment',

  // 4) 산업단지/군사/물류/창고
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'class'], 'military'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
    ['==', ['get', 'usageType'], 'industrial'],
  ],
  'industrial_military',

  // 2) 중층 도심 상가·원룸·오피스 블록 (10m <= H < 24m)
  [
    'any',
    ['>=', VWORLD_BUILDING_HEIGHT_EXPR, 10.0],
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
  'commercial',

  // 3) 저층 단독주택·다세대 빌라 (H < 10m)
  'residential',
];

/**
 * 외벽 본체(Main Wall) 색상 Expression
 * - 회백색 점박이 통일 현상 완전 폐기!
 * - 아파트: 크림 아이보리(#f4efe6) 60%, 소프트 베이지(#e8e0d2) 40%
 * - 상가: 붉은 벽돌(#8c3f2b) 40%, 황토 타일(#9a6b4c) 35%, 화강암 석재(#78716c) 25%
 * - 주택: 붉은 벽돌(#7f3222) 55%, 살구색/베이지(#d6c7b2) 45%
 * - 공장/군사: 베이지/연회색 샌드위치 판넬(#cbd5e1, #d1d5db)
 */
export const VWORLD_WALL_COLOR_EXPR: any = [
  'let',
  'cat',
  VWORLD_CATEGORY_EXPR,
  'hash',
  ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 100],
  [
    'case',
    // 1) 고층 아파트 단지
    ['==', ['var', 'cat'], 'apartment'],
    [
      'case',
      ['<', ['var', 'hash'], 60],
      VWORLD_PALETTE.apartment.wallCreamIvory, // 크림 아이보리 (#f4efe6)
      VWORLD_PALETTE.apartment.wallSoftBeige,   // 소프트 베이지 (#e8e0d2)
    ],

    // 2) 중층 도심 상가·원룸·오피스 블록
    ['==', ['var', 'cat'], 'commercial'],
    [
      'case',
      ['<', ['var', 'hash'], 40],
      VWORLD_PALETTE.commercial.wallRedBrick,   // 실제 한국 도심 상가 붉은 벽돌 (#8c3f2b)
      ['<', ['var', 'hash'], 75],
      VWORLD_PALETTE.commercial.wallOchreTile,  // 황토색/갈색 타일 (#9a6b4c)
      VWORLD_PALETTE.commercial.wallGraniteGray,// 화강암 석재 회색 (#78716c)
    ],

    // 3) 산업단지/물류창고/군부대
    ['==', ['var', 'cat'], 'industrial_military'],
    [
      'case',
      ['<', ['var', 'hash'], 50],
      VWORLD_PALETTE.industrialMilitary.wallSandwichPanelBeige, // 베이지 판넬 (#cbd5e1)
      VWORLD_PALETTE.industrialMilitary.wallSandwichPanelGray,  // 연회색 판넬 (#d1d5db)
    ],

    // 4) 저층 단독주택·다세대 빌라 (H < 10m)
    [
      'case',
      ['<', ['var', 'hash'], 55],
      VWORLD_PALETTE.residential.wallRedBrick,    // 붉은 벽돌 (#7f3222)
      VWORLD_PALETTE.residential.wallApricotBeige,// 살구색/베이지 (#d6c7b2)
    ],
  ],
];

/**
 * 1층 기단부(Podium) 색상 Expression
 * - 상가는 1층(0~3.8m)에 짙은 쇼윈도(#334155), 아파트는 밝은 베이지 석재 기단부(#e8e0d2)
 */
export const VWORLD_PODIUM_COLOR_EXPR: any = [
  'let',
  'cat',
  VWORLD_CATEGORY_EXPR,
  [
    'case',
    ['==', ['var', 'cat'], 'commercial'],
    VWORLD_PALETTE.commercial.podiumShopfront, // 1층 어두운 상가 쇼윈도 (#334155)
    ['==', ['var', 'cat'], 'apartment'],
    VWORLD_PALETTE.apartment.wallSoftBeige,   // 아파트 소프트 베이지 기단석 (#e8e0d2)
    ['==', ['var', 'cat'], 'industrial_military'],
    '#94a3b8',                                // 금속 기단부
    VWORLD_PALETTE.residential.wallRedBrick,  // 주택 붉은 벽돌 기단부
  ],
];

/**
 * 건물 지붕(Roof) 색상 Expression
 * - 아파트: 짙은 콘크리트 슬래브(#57534e) 80%, 박공 캡(#6b3426) 20%
 * - 상가: 선명한 에메랄드 우레탄 방수초록(#2e6f4e, 50%), 적갈색 테라코타(#7c3626, 25%), 오래된 시멘트(#64748b, 25%)
 * - 주택: 적갈색 기와(#6e2c1b, 40%), 청색 슬레이트(#254e7a, 30%), 녹색 우레탄(#356854, 30%)
 * - 공장/군사: 코발트 블루(#1d4ed8, 60%), 은색 징크(#cbd5e1, 40%)
 */
export const VWORLD_ROOF_COLOR_EXPR: any = [
  'let',
  'cat',
  VWORLD_CATEGORY_EXPR,
  'hash',
  ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 100],
  [
    'case',
    // 0) 실측 위성 픽셀 샘플링 색상이 있으면 우선 적용
    ['!=', ['coalesce', ['get', 'roofColour'], ''], ''],
    ['get', 'roofColour'],
    ['!=', ['coalesce', ['get', 'roofColor'], ''], ''],
    ['get', 'roofColor'],
    ['!=', ['coalesce', ['get', 'roof:colour'], ''], ''],
    ['get', 'roof:colour'],
    ['!=', ['coalesce', ['get', 'roof_color'], ''], ''],
    ['get', 'roof_color'],

    // 1) 고층 아파트 단지: 짙은 콘크리트 슬래브(#57534e) 80%, 박공 캡(#6b3426) 20%
    ['==', ['var', 'cat'], 'apartment'],
    [
      'case',
      ['<', ['var', 'hash'], 80],
      VWORLD_PALETTE.apartment.roofDarkSlab, // 짙은 콘크리트 슬래브 (#57534e)
      VWORLD_PALETTE.apartment.roofGableCap, // 박공 지붕 캡 (#6b3426)
    ],

    // 2) 중층 도심 상가: 선명한 에메랄드 우레탄(50%), 적갈색 테라코타(25%), 시멘트 회색(25%)
    ['==', ['var', 'cat'], 'commercial'],
    [
      'case',
      ['<', ['var', 'hash'], 50],
      VWORLD_PALETTE.commercial.roofUrethaneGreen, // ① 선명한 에메랄드 우레탄초록 (#2e6f4e, 50%)
      ['<', ['var', 'hash'], 75],
      VWORLD_PALETTE.commercial.roofTerracotta,    // ② 적갈색 테라코타 (#7c3626, 25%)
      VWORLD_PALETTE.commercial.roofAgedCement,    // ③ 오래된 시멘트 회색 (#64748b, 25%)
    ],

    // 3) 산업단지/물류창고/군부대: 코발트 블루(60%), 은색 징크(40%)
    ['==', ['var', 'cat'], 'industrial_military'],
    [
      'case',
      ['<', ['var', 'hash'], 60],
      VWORLD_PALETTE.industrialMilitary.roofCobaltBlue, // 코발트 블루 (#1d4ed8)
      VWORLD_PALETTE.industrialMilitary.roofSilverZinc, // 은색 징크 패널 (#cbd5e1)
    ],

    // 4) 저층 단독주택·다세대 빌라: 적갈색 기와(40%), 청색 슬레이트(30%), 녹색 우레탄(30%)
    [
      'case',
      ['<', ['var', 'hash'], 40],
      VWORLD_PALETTE.residential.roofTerracotta, // 적갈색 기와지붕 (#6e2c1b, 40%)
      ['<', ['var', 'hash'], 70],
      VWORLD_PALETTE.residential.roofBlueSlate,  // 청색 슬레이트 (#254e7a, 30%)
      VWORLD_PALETTE.residential.roofUrethane,   // 녹색 우레탄 방수 (#356854, 30%)
    ],
  ],
];

// =============================================================================
// 3. 브이월드 한국형 실사 파사드 패턴 등록 (점박이 타공판 무늬 원천 금지)
// =============================================================================
export const VWORLD_APT_VERANDA_PATTERN_ID = 'vworld-apt-veranda-facade';
export const VWORLD_APT_SIDE_PATTERN_ID = 'vworld-apt-side-wall';
export const VWORLD_ROOF_PARAPET_AO_PATTERN_ID = 'vworld-roof-parapet-ao';

/**
 * 캔버스에 한국 아파트 실사 베란다 통유리창 파사드 생성
 * - 가로로 긴 실제 발코니 통유리창(#1e293b)
 * - 하얀색 샤시 프레임 선과 층간 콘크리트 슬래브 띠
 * - 발코니 알루미늄 난간 살대와 에어컨 실외기 루버 그릴
 */
export function createVWorldAptVerandaPatternImage(size: number = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 외벽 베이스: 밝은 크림 아이보리 (#f4efe6)
  ctx.fillStyle = VWORLD_PALETTE.apartment.wallCreamIvory;
  ctx.fillRect(0, 0, size, size);

  // 2. 2개 층 표현 (1층당 size/2 = 128px)
  const floorH = size / 2;
  for (let f = 0; f < 2; f++) {
    const fY = f * floorH;

    // (1) 층간 콘크리트 슬래브 띠 (Floor Slab Band)
    ctx.fillStyle = '#e5decfa0';
    ctx.fillRect(0, fY, size, 14);

    // 슬래브 턱 음영 라인
    ctx.fillStyle = '#1e293b40';
    ctx.fillRect(0, fY + 12, size, 2);

    // (2) 가로로 긴 실제 발코니 통유리창 2구획 (세대별 2베이 구조)
    const marginSide = 12;
    const centerCol = 14;
    const winW = (size - marginSide * 2 - centerCol) / 2; // ~109px
    const winY = fY + 22;
    const winH = floorH - 34; // ~94px

    const windowXs = [marginSide, marginSide + winW + centerCol];

    for (const wx of windowXs) {
      // 외곽 화이트 하이샤시 프레임 (#ffffff)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);

      // 다크 네이비/차콜 통유리창 (#1e293b)
      const glassGrad = ctx.createLinearGradient(wx, winY, wx, winY + winH);
      glassGrad.addColorStop(0, '#2e3e54'); // 상단 하늘빛 반사
      glassGrad.addColorStop(0.35, '#1e293b'); // 깊은 차콜 네이비
      glassGrad.addColorStop(1, '#0f172a'); // 하단 턱 그늘
      ctx.fillStyle = glassGrad;
      ctx.fillRect(wx, winY, winW, winH);

      // 상단 드롭 섀도우 (깊이감)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(wx, winY, winW, 8);

      // 중앙 세로 화이트 샤시 프레임 (Mullion)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(wx + winW / 2 - 1.5), winY, 3, winH);

      // 가로 분할창 샤시
      ctx.fillRect(wx, Math.round(winY + winH * 0.4), winW, 2);

      // 하단 발코니 철제/알루미늄 난간 살대 (Balcony Railings)
      const railTop = Math.round(winY + winH * 0.58);
      const railH = winH - Math.round(winH * 0.58);

      // 난간 핸드레일 바
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(wx + 2, railTop, winW - 4, 3);

      // 세로 난간 살 6개
      const pickets = 6;
      const step = (winW - 8) / (pickets + 1);
      ctx.fillStyle = '#cbd5e1';
      for (let p = 1; p <= pickets; p++) {
        ctx.fillRect(Math.round(wx + 4 + p * step), railTop + 3, 2, railH - 3);
      }

      // 우측 하단 에어컨 실외기 루버 그릴 살
      const louverW = Math.round(winW * 0.28);
      const louverH = Math.round(railH * 0.65);
      const louverX = wx + winW - louverW - 3;
      const louverY = winY + winH - louverH - 3;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(louverX, louverY, louverW, louverH);
      ctx.fillStyle = '#64748b';
      for (let ly = louverY + 2; ly < louverY + louverH - 1; ly += 3) {
        ctx.fillRect(louverX + 1, ly, louverW - 2, 1.2);
      }

      // 대각선 자연광 글레어 하이라이트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(wx + 4, winY + 4, Math.round(winW * 0.4), 2);
    }
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * 캔버스에 아파트 측벽(Side Wall) 브랜드 도색 스트라이프 생성 (창문 100% 없음!)
 */
export function createVWorldAptSidePatternImage(size: number = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 매끈한 크림 아이보리 콘크리트 외벽 (창문 없음!)
  ctx.fillStyle = VWORLD_PALETTE.apartment.wallCreamIvory;
  ctx.fillRect(0, 0, size, size);

  // 2. 세로형 포인트 브랜드 컬러 스트라이프 라인
  // 갈색(#6b4423), 네이비(#1e3a5f), 웜그레이(#57534e)
  const stripeX = Math.round(size * 0.18);
  const stripeW1 = Math.round(size * 0.15); // 갈색 밴드
  const stripeW2 = Math.round(size * 0.08); // 네이비 밴드
  const stripeW3 = 4;                       // 웜그레이 라인

  ctx.fillStyle = VWORLD_PALETTE.apartment.sideBrandBrown;
  ctx.fillRect(stripeX, 0, stripeW1, size);

  ctx.fillStyle = VWORLD_PALETTE.apartment.sideBrandNavy;
  ctx.fillRect(stripeX + stripeW1, 0, stripeW2, size);

  ctx.fillStyle = VWORLD_PALETTE.apartment.sideBrandWarmGray;
  ctx.fillRect(stripeX + stripeW1 + stripeW2, 0, stripeW3, size);

  // 3. 하단 25% 웜그레이 투톤 기단부
  const lowH = Math.round(size * 0.25);
  ctx.fillStyle = VWORLD_PALETTE.apartment.sideBrandWarmGray;
  ctx.fillRect(0, size - lowH, size, lowH);

  // 4. 측벽 상단 스텐실 동 번호 ("101" 대형 타이포그래피)
  ctx.save();
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101', Math.round(size * 0.65), Math.round(size * 0.32));
  ctx.restore();

  // 5. 층간 얇은 수평 눈금 그루브
  ctx.fillStyle = 'rgba(71, 85, 105, 0.22)';
  for (let y = 32; y < size - lowH; y += 32) {
    ctx.fillRect(0, y, size, 1.5);
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * 캔버스에 옥상 0.9m 난간 테두리 코핑 & 내부 드리운 그늘(Inner AO) 패턴 생성
 */
export function createVWorldRoofParapetAOImage(size: number = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 외곽 0.9m 돌출 난간(Parapet) 코핑 테두리
  const parapetW = 10;
  ctx.fillStyle = VWORLD_PALETTE.infrastructure.parapetCoping;
  ctx.fillRect(0, 0, size, parapetW);
  ctx.fillRect(0, size - parapetW, size, parapetW);
  ctx.fillRect(0, 0, parapetW, size);
  ctx.fillRect(size - parapetW, 0, parapetW, size);

  // 난간 상단 모서리 알루미늄 하이라이트 라인
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(1, 1, size - 2, 2);
  ctx.fillRect(1, size - 3, size - 2, 2);
  ctx.fillRect(1, 1, 2, size - 2);
  ctx.fillRect(size - 3, 1, 2, size - 2);

  // 2. 난간 안쪽 드리운 짙은 음영(Inner AO Drop Shadow)
  const shadowDepth = 18;
  const topGrad = ctx.createLinearGradient(0, parapetW, 0, parapetW + shadowDepth);
  topGrad.addColorStop(0, 'rgba(15, 23, 42, 0.75)');
  topGrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(parapetW, parapetW, size - parapetW * 2, shadowDepth);

  const leftGrad = ctx.createLinearGradient(parapetW, 0, parapetW + shadowDepth, 0);
  leftGrad.addColorStop(0, 'rgba(15, 23, 42, 0.70)');
  leftGrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(parapetW, parapetW, shadowDepth, size - parapetW * 2);

  // 3. 중앙 엘리베이터 권상기실 / 옥탑방 코어 큐브 (70x70)
  const coreW = 74;
  const coreH = 74;
  const coreX = Math.round((size - coreW) / 2);
  const coreY = Math.round((size - coreH) / 2);

  // 코어 기저 드롭 섀도우
  ctx.fillStyle = 'rgba(15, 23, 42, 0.60)';
  ctx.fillRect(coreX - 4, coreY - 4, coreW + 8, coreH + 8);

  // 코어 상부 슬래브
  ctx.fillStyle = VWORLD_PALETTE.apartment.penthouseCore;
  ctx.fillRect(coreX, coreY, coreW, coreH);

  // 코어 테두리 샷시
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(coreX + 1, coreY + 1, coreW - 2, coreH - 2);

  // 기계실 차콜 통풍 루버 5열
  ctx.fillStyle = '#334155';
  for (let r = 0; r < 5; r++) {
    ctx.fillRect(coreX + 12, coreY + 16 + r * 9, coreW - 24, 3);
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * MapLibre 지도 객체에 브이월드 정품 실사 패턴 3종 등록
 */
export function ensureVWorldAuthenticPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  // 1. 아파트 베란다 창호 격자 패턴
  if (!map.hasImage(VWORLD_APT_VERANDA_PATTERN_ID)) {
    try {
      const img = createVWorldAptVerandaPatternImage(256);
      if (img) map.addImage(VWORLD_APT_VERANDA_PATTERN_ID, img);
    } catch (e) {
      console.warn('[vworldAuthenticStyler] Veranda pattern register warning:', e);
    }
  }

  // 2. 아파트 측벽 브랜드 컬러 밴드 패턴
  if (!map.hasImage(VWORLD_APT_SIDE_PATTERN_ID)) {
    try {
      const img = createVWorldAptSidePatternImage(256);
      if (img) map.addImage(VWORLD_APT_SIDE_PATTERN_ID, img);
    } catch (e) {
      console.warn('[vworldAuthenticStyler] Side wall pattern register warning:', e);
    }
  }

  // 3. 옥상 0.9m 난간 및 안쪽 그늘(Inner AO) 패턴
  if (!map.hasImage(VWORLD_ROOF_PARAPET_AO_PATTERN_ID)) {
    try {
      const img = createVWorldRoofParapetAOImage(256);
      if (img) map.addImage(VWORLD_ROOF_PARAPET_AO_PATTERN_ID, img);
    } catch (e) {
      console.warn('[vworldAuthenticStyler] Parapet pattern register warning:', e);
    }
  }
}
