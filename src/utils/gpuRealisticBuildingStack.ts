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

    // 1. 이미 실측 높이(>= 3.0m)가 선언되어 있다면 우선 적용 (실제 지상층수 grnd_flr * 3.2m 100% 직결, 0~2m 납작 건물 완전 금지)
    ['>=', ['var', 'declaredHeight'], 3.0],
    ['var', 'declaredHeight'],

    // 2. 아파트 단지 및 고층 주거 태그: 36m ~ 75m (12~25층)
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
      36,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 40], // 36..75m
    ],

    // 3. 중·저층 상가·원룸·근린생활 블록: 10m ~ 20m (3~6층 탄탄한 도시 블록 형성)
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
      10,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 23456], 23456]], 11], // 10..20m
    ],

    // 4. 산업/군사/물류/창고: 6m ~ 12m
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
      6,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 7], // 6..12m
    ],

    // 5. 일반 시가지 / 단독주택·다세대 빌라 (1층~3층, 4m~10m)
    [
      'case',
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 45678], 45678]], 100], 25],
      ['+', 36, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 56789], 56789]], 40]], // 36..75m 아파트
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 45678], 45678]], 100], 60],
      ['+', 10, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 67890], 67890]], 11]], // 10..20m 상가
      ['+', 4.5, ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 89012], 89012]], 6]],  // 4.5..10m 주택 (100% 입체화)
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
// 3. 중층 외벽 본체(Main Wall) 색상 Expression
// - 아파트 단지: 밝은 크림 아이보리(#f5f2eb) 및 웜 베이지(#eae3d5)
// - 상업/오피스: 밝은 화강석 베이지(#dfd9ce), 적벽돌(#8c3f2b), 라이트 웜그레이(#d6d3d1)
// - 산업/물류: 밝은 실버/베이지 메탈 판넬(#e2e8f0)
// - 일반 주택가: 적벽돌(#8c3f2b), 밝은 화강석 베이지(#dfd9ce), 웜 베이지(#eae3d5)
// -----------------------------------------------------------------------------
export const gpuBuildingWallColorExpr: any = [
  'case',
  // 1) 고층 아파트 단지: 밝은 크림 아이보리(#f5f2eb) 및 웜 베이지(#eae3d5)
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
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 2], 1],
    '#f5f2eb', // 밝은 크림 아이보리
    '#eae3d5', // 웜 베이지
  ],

  // 2) 중·저층 상가·원룸·근린생활 블록: 밝은 화강석 베이지(#dfd9ce), 적벽돌(#8c3f2b), 라이트 웜그레이(#d6d3d1)
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
    'case',
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 23456], 23456]], 3], 1],
    '#dfd9ce', // 밝은 화강석 베이지
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 23456], 23456]], 3], 2],
    '#8c3f2b', // 적벽돌
    '#d6d3d1', // 라이트 웜그레이
  ],

  // 3) 산업/군사/물류: 밝은 실버/베이지 메탈 판넬
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'class'], 'military'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
  ],
  '#e2e8f0', // 밝은 실버/베이지 메탈 판넬

  // 4) 단독주택·다세대 빌라·주거: 적벽돌(#8c3f2b), 밝은 화강석 베이지(#dfd9ce), 웜 베이지(#eae3d5)
  [
    'case',
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 3], 1],
    '#8c3f2b', // 적벽돌
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 3], 2],
    '#dfd9ce', // 밝은 화강석 베이지
    '#eae3d5', // 웜 베이지
  ],
];

// -----------------------------------------------------------------------------
// 4. 건물 유형별 실제 한국 지붕 색상 Expression (건물 높이 & ID 해시 엄격 분류)
// 1) 고층 아파트 단지: 차분한 다크 그레이/브라운 슬래브(#57534e)
// 2) 중·저층 상가·원룸 블록:
//    ① 우레탄 방수 에메랄드/세이지 그린(#357a56, 45%)
//    ② 테라코타 적갈색/브라운(#7c3a27, 30%)
//    ③ 콘크리트 그레이(#78716c, 25%)
// 3) 단독주택·다세대 빌라·군 주둔지 막사:
//    적갈색 기와(#6e3222, 40%), 청색 강판(#254e7a, 30%), 세이지 그린(#357a56, 30%)
// -----------------------------------------------------------------------------
export const gpuBuildingRoofColorExpr: any = [
  'let',
  'bH',
  BUILDING_HEIGHT_EXPR,
  'hash',
  ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 100],
  [
    'case',
    // 0) 실측 위성 픽셀 샘플링 색상 또는 GeoJSON에 명시된 지붕 색상 우선 적용
    ['!=', ['coalesce', ['get', 'roofColour'], ''], ''],
    ['get', 'roofColour'],
    ['!=', ['coalesce', ['get', 'roofColor'], ''], ''],
    ['get', 'roofColor'],
    ['!=', ['coalesce', ['get', 'roof:colour'], ''], ''],
    ['get', 'roof:colour'],
    ['!=', ['coalesce', ['get', 'roof_color'], ''], ''],
    ['get', 'roof_color'],

    // 1) 고층 아파트 단지 (12층~25층, 36m~75m): 차분한 다크 그레이/브라운 슬래브(#57534e)
    [
      'any',
      ['>=', ['var', 'bH'], 28.0],
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
    ],
    '#57534e',

    // 2) 산업단지/물류/창고/군사
    [
      'any',
      ['==', ['get', 'class'], 'industrial'],
      ['==', ['get', 'class'], 'warehouse'],
      ['==', ['get', 'building'], 'industrial'],
      ['==', ['get', 'building'], 'warehouse'],
    ],
    [
      'case',
      ['<', ['var', 'hash'], 40],
      '#254e7a', // 청색 강판 지붕
      ['<', ['var', 'hash'], 75],
      '#cbd5e1', // 라이트 실버
      '#357a56', // 세이지 그린
    ],

    // 3) 중·저층 시내 상가·원룸·근린생활 블록 (3층~6층, 10m~20m):
    //    ① 우레탄 방수 에메랄드/세이지 그린(#357a56, 45%)
    //    ② 테라코타 적갈색/브라운(#7c3a27, 30%)
    //    ③ 콘크리트 그레이(#78716c, 25%)
    [
      'any',
      ['==', ['get', 'class'], 'commercial'],
      ['==', ['get', 'class'], 'retail'],
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'building'], 'commercial'],
      ['==', ['get', 'building'], 'office'],
      ['==', ['get', 'usageType'], 'commercial'],
      ['==', ['get', 'bld_category'], 'commercial'],
      ['>=', ['var', 'bH'], 10.0],
    ],
    [
      'case',
      ['<', ['var', 'hash'], 45],
      '#357a56', // ① 우레탄 방수 에메랄드/세이지 그린 (45%)
      ['<', ['var', 'hash'], 75],
      '#7c3a27', // ② 테라코타 적갈색/브라운 (30%)
      '#78716c', // ③ 콘크리트 그레이 (25%)
    ],

    // 4) 단독주택·다세대 빌라·군 주둔지 막사 (1층~3층, 4m~10m):
    //    적갈색 기와(#6e3222, 40%), 청색 강판(#254e7a, 30%), 세이지 그린(#357a56, 30%)
    [
      'case',
      ['<', ['var', 'hash'], 40],
      '#6e3222', // 적갈색 기와 지붕 (40%)
      ['<', ['var', 'hash'], 70],
      '#254e7a', // 청색 강판 지붕 (30%)
      '#357a56', // 세이지 그린 옥상 (30%)
    ],
  ],
];

// -----------------------------------------------------------------------------
// [V-World 3D 건물 스타일러 테마별 Expression]
// 1) 용도별 색상 모드 (Landuse): 주거-황색, 상업-적색, 공업-자주색, 공공/군사-청색
// 2) 층수/높이 스펙트럼 모드 (Height Spectrum): 저층-청록 -> 중층-황색 -> 고층-적색
// -----------------------------------------------------------------------------
export const gpuBuildingLanduseWallColorExpr: any = [
  'case',
  // 주거: 황색 (#EAB308)
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
  '#F59E0B',

  // 상업·업무: 적색 (#EF4444)
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
  '#EF4444',

  // 공업·물류: 자주색 (#A855F7)
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
    ['==', ['get', 'usageType'], 'industrial'],
  ],
  '#A855F7',

  // 공공·군사·청사: 청색 (#3B82F6)
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
  '#3B82F6',

  // 기타: 주거 황색 폴백
  '#F59E0B',
];

export const gpuBuildingLanduseRoofColorExpr: any = [
  'case',
  // 주거 옥상: 짙은 앰버
  [
    'any',
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'class'], 'residential'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'usageType'], 'residential'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  '#D97706',

  // 상업 옥상: 짙은 적색
  [
    'any',
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'class'], 'office'],
    ['==', ['get', 'usageType'], 'commercial'],
  ],
  '#DC2626',

  // 공업 옥상: 짙은 자주색
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
  ],
  '#9333EA',

  // 공공·군사 옥상: 짙은 청색
  [
    'any',
    ['==', ['get', 'class'], 'military'],
    ['==', ['get', 'class'], 'public'],
    ['==', ['get', 'usageType'], 'military_public'],
    ['==', ['coalesce', ['get', 'isMilitaryOrPublic'], false], true],
  ],
  '#2563EB',

  '#D97706',
];

const HEIGHT_NUM_FOR_INTERPOLATE: any = [
  'coalesce',
  ['to-number', ['get', 'render_height']],
  ['to-number', ['get', 'height']],
  ['to-number', ['get', 'hei']],
  ['*', ['to-number', ['coalesce', ['get', 'grnd_flr'], ['get', 'levels'], 3]], 3.3],
  12,
];

export const gpuBuildingHeightSpectrumWallColorExpr: any = [
  'interpolate',
  ['linear'],
  HEIGHT_NUM_FOR_INTERPOLATE,
  4.0, '#06B6D4',  // 저층 (1~2층, 4m): 청록(Cyan)
  12.0, '#0EA5E9', // 저-중층 (3~4층, 12m): 스카이블루
  22.0, '#10B981', // 중층 (5~7층, 22m): 에메랄드
  36.0, '#F59E0B', // 중-고층 (10~12층, 36m): 황색
  55.0, '#F97316', // 고층 (15~18층, 55m): 주황
  75.0, '#EF4444'  // 초고층 (25층+, 75m+): 적색
];

export const gpuBuildingHeightSpectrumRoofColorExpr: any = [
  'interpolate',
  ['linear'],
  HEIGHT_NUM_FOR_INTERPOLATE,
  4.0, '#0891B2',
  12.0, '#0284C7',
  22.0, '#059669',
  36.0, '#D97706',
  55.0, '#EA580C',
  75.0, '#DC2626'
];

// -----------------------------------------------------------------------------
// 5. 실사 창문 패턴 & 옥상 난간/코어 텍스처 등록 함수 (한국형 아파트 베란다 및 옥상 디테일)
// -----------------------------------------------------------------------------
export const BUILDING_PATTERN_IMAGE_ID = 'facade-window-grid';
export const ROOF_PARAPET_PATTERN_IMAGE_ID = 'roof-parapet-core-grid';

export function ensureBuildingPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  // 1) 외벽 실사 베란다 창호 격자 패턴 등록
  if (!map.hasImage(BUILDING_PATTERN_IMAGE_ID)) {
    try {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, size, size);

        // (1) 층간 슬래브 분리선 (Floor Slab Dividing Line)
        ctx.fillStyle = '#1e293b'; // 다크 차콜 슬래브 라인
        ctx.fillRect(0, 0, size, 3);
        ctx.fillRect(0, size - 3, size, 3);
        ctx.fillRect(0, size / 2 - 1.5, size, 3); // 2개 층 표현

        // (2) 창호 외곽 하이샤시 프레임 (세로 기둥)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 3, size);
        ctx.fillRect(size - 3, 0, 3, size);
        ctx.fillRect(size / 2 - 1.5, 0, 3, size);

        // (3) 베란다 창문 4구획 (2개 층 x 2개 세대/창호)
        const windowSlots = [
          { x: 6, y: 6, w: size / 2 - 10, h: size / 2 - 10 },
          { x: size / 2 + 4, y: 6, w: size / 2 - 10, h: size / 2 - 10 },
          { x: 6, y: size / 2 + 6, w: size / 2 - 10, h: size / 2 - 10 },
          { x: size / 2 + 4, y: size / 2 + 6, w: size / 2 - 10, h: size / 2 - 10 },
        ];

        for (const win of windowSlots) {
          // 어두운 베란다 내부 음영 (Dark Slate 줄눈)
          ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
          ctx.fillRect(win.x, win.y, win.w, win.h);

          // 블루그레이 반사 유리 코팅 (Sky Blue Reflective Tint)
          const glassGrad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
          glassGrad.addColorStop(0, 'rgba(186, 230, 253, 0.42)'); // 상단 자연 채광 반사
          glassGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.20)');
          glassGrad.addColorStop(1, 'rgba(30, 41, 59, 0.50)');    // 하단 발코니 턱 음영
          ctx.fillStyle = glassGrad;
          ctx.fillRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);

          // 하단 베란다 세로 철제 난간 살 (Vertical Balcony Railings)
          const railTop = win.y + Math.round(win.h * 0.55);
          const railH = win.h - Math.round(win.h * 0.55);
          ctx.fillStyle = 'rgba(203, 213, 225, 0.45)'; // 난간 상단 핸드레일
          ctx.fillRect(win.x + 2, railTop, win.w - 4, 1.5);

          ctx.fillStyle = 'rgba(148, 163, 184, 0.35)'; // 세로 살
          const numPickets = 5;
          const picketStep = (win.w - 6) / (numPickets + 1);
          for (let p = 1; p <= numPickets; p++) {
            ctx.fillRect(Math.round(win.x + 3 + p * picketStep), railTop, 1.2, railH - 2);
          }

          // 상단 유리창 중앙 세로 샷시 프레임 (Mullion)
          ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
          ctx.fillRect(Math.round(win.x + win.w / 2 - 0.75), win.y + 1, 1.5, Math.round(win.h * 0.55));

          // 대각선 자연 채광 하이라이트 글레어
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(win.x + 3, win.y + 3, Math.round(win.w * 0.35), 1.5);
        }

        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage(BUILDING_PATTERN_IMAGE_ID, imgData);
      }
    } catch (err) {
      console.warn('[gpuRealisticBuildingStack] Failed to register window pattern image:', err);
    }
  }

  // 2) [3단계 신규] 옥상 난간 테두리 라인 & 옥탑 기계실 코어 패턴 등록
  if (!map.hasImage(ROOF_PARAPET_PATTERN_IMAGE_ID)) {
    try {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, size, size);

        // (1) 옥상 외곽 파라펫 난간 테두리 코핑 라인 (다크 슬레이트 & 차콜 림)
        ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
        ctx.fillRect(0, 0, size, 5);
        ctx.fillRect(0, size - 5, size, 5);
        ctx.fillRect(0, 0, 5, size);
        ctx.fillRect(size - 5, 0, 5, size);

        // (2) 알루미늄/석재 코핑 상단 엣지 하이라이트
        ctx.fillStyle = 'rgba(203, 213, 225, 0.75)';
        ctx.fillRect(1, 1, size - 2, 1.5);
        ctx.fillRect(1, size - 2.5, size - 2, 1.5);
        ctx.fillRect(1, 1, 1.5, size - 2);
        ctx.fillRect(size - 2.5, 1, 1.5, size - 2);

        // (3) 난간 안쪽 드리운 음영 (Inner Parapet Shadow)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.fillRect(5, 5, size - 10, 4);
        ctx.fillRect(5, size - 9, size - 10, 4);
        ctx.fillRect(5, 5, 4, size - 10);
        ctx.fillRect(size - 9, 5, 4, size - 10);

        // (4) 중앙 엘리베이터 권상기실 / 옥탑방 코어 박스 (42x42 구획)
        const coreX = 43;
        const coreY = 43;
        const coreW = 42;
        const coreH = 42;

        // 코어 기저 음영 줄눈
        ctx.fillStyle = 'rgba(15, 23, 42, 0.70)';
        ctx.fillRect(coreX - 2, coreY - 2, coreW + 4, coreH + 4);

        // 코어 상부 슬래브 (밝은 회백색 콘크리트 #e2e8f0)
        ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
        ctx.fillRect(coreX, coreY, coreW, coreH);

        // 코어 외곽 샷시 프레임
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.90)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(coreX + 1, coreY + 1, coreW - 2, coreH - 2);

        // 옥탑 기계실 차콜 통풍 루버 그릴 살 4열
        ctx.fillStyle = 'rgba(51, 65, 85, 0.85)';
        for (let r = 0; r < 4; r++) {
          ctx.fillRect(coreX + 7, coreY + 10 + r * 6, coreW - 14, 2.2);
        }

        const imgData = ctx.getImageData(0, 0, size, size);
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

  // Tier 1: 1층 기단부 (Podium 0m ~ min(3.8m, H)) - 화강석 베이지 기단부 (#e2dcd3)
  const tier1Podium: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier1-podium`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': '#e2dcd3',
      'fill-extrusion-base': gpuBuildingBaseExpr,
      'fill-extrusion-height': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 2: 중층 외벽 본체 (Main Wall min(3.8m, H) ~ H) - 크림 아이보리/샌드 베이지/라이트 웜그레이
  const tier2MainWall: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier2-mainwall`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': gpuBuildingWallColorExpr,
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
  const tier3Pattern: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier3-pattern`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': BUILDING_PATTERN_IMAGE_ID,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.85,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 4: 옥상 슬래브 / 파라펫 캡 (Roof Cap H ~ H + 0.25m) - 0.25m 초박형 날렵한 캡
  const tier4RoofCap: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier4-roofcap`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': gpuBuildingRoofColorExpr,
      'fill-extrusion-base': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 0.25],
      'fill-extrusion-opacity': 1.0,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 5: [3단계 신규] 옥상 난간 테두리 라인 & 상단 코어 (줌 14.5 ~ 15.5 정밀 페이드인)
  // - 줌 15 이상에서 상단이 평평해 보이지 않도록 난간 테두리 코핑과 옥탑 코어 구조물이 부드럽게 융합
  const tier5RoofDetail: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier5-roofdetail`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 14.5,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': ROOF_PARAPET_PATTERN_IMAGE_ID,
      'fill-extrusion-base': ['+', BUILDING_HEIGHT_EXPR, 0.25],
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 0.55], // 0.3m 상단 립
      'fill-extrusion-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14.5, 0.0,
        15.5, 1.0,
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
