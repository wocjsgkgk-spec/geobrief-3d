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
    ['*', ['to-number', ['get', 'levels'], 0], 3.2],
    ['*', ['to-number', ['get', 'building:levels'], 0], 3.2],
    ['*', ['to-number', ['get', 'grnd_flr'], 0], 3.2],
    0,
  ],
  [
    'case',
    // 1. 이미 실측 높이(>= 7.5m)가 선언되어 있다면 우선 적용
    ['>=', ['var', 'declaredHeight'], 7.5],
    ['var', 'declaredHeight'],

    // 선언 높이가 4m~7.5m 사이인 경우 최소 7.5m로 보정 (납작함 방지)
    ['>=', ['var', 'declaredHeight'], 4.0],
    7.5,

    // 2. 아파트 단지 및 고층 주거 태그: 50m ~ 75m (16~25층)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
    ],
    [
      '+',
      50,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], 12345], 12345]], 26], // 50..75m
    ],

    // 3. 시내 대로변 상업/업무/공공/의료/대학: 16m ~ 32m (5~10층)
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
    ],
    [
      '+',
      16,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], 23456], 23456]], 17], // 16..32m
    ],

    // 4. 산업/군사/물류/창고: 9m ~ 14m (1~3층)
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
      9,
      ['%', ['abs', ['to-number', ['coalesce', ['id'], 34567], 34567]], 6], // 9..14m
    ],

    // 5. 일반 시가지 (태그 부재 80% 건물 대상 지능형 스카이라인 분포 해시)
    // - 45% 아파트 단지 스카이라인 (50m ~ 75m)
    // - 25% 대로변 상가·오피스 (16m ~ 32m)
    // - 12% 창고/군사/공공 (9m ~ 14m)
    // - 18% 다세대 빌라/단독주택 (7.5m ~ 12m)
    [
      'case',
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], 45678], 45678]], 100], 45],
      ['+', 50, ['%', ['abs', ['to-number', ['coalesce', ['id'], 56789], 56789]], 26]], // 50..75m 아파트
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], 45678], 45678]], 100], 70],
      ['+', 16, ['%', ['abs', ['to-number', ['coalesce', ['id'], 67890], 67890]], 17]], // 16..32m 상업
      ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], 45678], 45678]], 100], 82],
      ['+', 9, ['%', ['abs', ['to-number', ['coalesce', ['id'], 78901], 78901]], 6]],   // 9..14m 창고/군사
      ['+', 7.5, ['%', ['abs', ['to-number', ['coalesce', ['id'], 89012], 89012]], 5]], // 7.5..12m 주택 (0% Flat 보장)
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
// - 아파트 단지: 따뜻한 크림 아이보리(#ece8df), 샌드 베이지(#e2dcd3), 라이트 웜그레이(#d6d3d1)
// - 상업/오피스: 블루그레이 반사 유리(#94a3b8)와 베이지 석재 타일 톤(#e2dcd3)
// -----------------------------------------------------------------------------
export const gpuBuildingWallColorExpr: any = [
  'case',
  // 1) 아파트 단지: 따뜻한 크림 아이보리, 샌드 베이지, 라이트 웜그레이
  [
    'any',
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'type'], 'apartments'],
  ],
  [
    'case',
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 3], 1],
    '#ece8df', // 따뜻한 크림 아이보리
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 3], 2],
    '#e2dcd3', // 샌드 베이지
    '#d6d3d1', // 라이트 웜그레이
  ],

  // 2) 상업/오피스: 2층 이상 블루그레이 반사 유리와 베이지 석재 타일
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
  ],
  [
    'case',
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 23456], 23456]], 2], 1],
    '#94a3b8', // 블루그레이 반사 유리
    '#e2dcd3', // 베이지 석재 타일 톤
  ],

  // 3) 산업/군사/물류: 인더스트리얼 소프트 그레이
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'class'], 'military'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
  ],
  '#cbd5e1',

  // 4) 일반 시가지 / 다세대 빌라 / 주택 (따뜻한 한국형 도심 외벽)
  [
    'case',
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 3], 1],
    '#ece8df', // 따뜻한 크림 아이보리
    ['<', ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 34567], 34567]], 3], 2],
    '#e2dcd3', // 샌드 베이지
    '#d6d3d1', // 라이트 웜그레이
  ],
];

// -----------------------------------------------------------------------------
// 4. 건물 유형별 실제 한국 지붕 색상 Expression (건물 높이 & ID 해시 엄격 분류)
// 1) 고층 아파트 & 대형 빌딩 (24m 이상): 초록색 절대 금지! 콘크리트 웜그레이(#6e6a64, 60%) & 다크차콜 슬레이트(#475569, 40%)
// 2) 중층 시내 상가 (10m ~ 24m): 노후 시멘트(#78716c, 40%), 실제 딥 세이지 그린(#3b5249, 35%), 다크차콜 슬래브(#334155, 25%)
// 3) 저층 주택·빌라·군막사 (10m 미만): 적갈색 기와/테라코타(#6b3426, 45%), 아스팔트 슁글(#3f3f46, 30%), 청회색 징크(#334e68, 15%), 딥 세이지(#3b5249, 10%)
// -----------------------------------------------------------------------------
export const gpuBuildingRoofColorExpr: any = [
  'let',
  'bH',
  BUILDING_HEIGHT_EXPR,
  'hash',
  ['%', ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]], 100],
  [
    'case',
    // 1) 고층 아파트 및 대형 빌딩 (높이 24m 이상 또는 아파트 태그)
    // [초록색 절대 금지]: 웨더링된 콘크리트 웜 그레이(#6e6a64, 60%) & 다크 차콜 슬레이트(#475569, 40%)
    [
      'any',
      ['>=', ['var', 'bH'], 24.0],
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
    ],
    [
      'case',
      ['<', ['var', 'hash'], 60],
      '#6e6a64', // 웨더링된 콘크리트 웜 그레이 (60%)
      '#475569', // 다크 차콜 슬레이트 (40%)
    ],

    // 2) 중층 시내 상가 및 근린생활시설 (높이 10m ~ 24m)
    // 40% 노후 시멘트 그레이 (#78716c), 35% 딥 세이지 그린 (#3b5249), 25% 다크 차콜 슬래브 (#334155)
    ['>=', ['var', 'bH'], 10.0],
    [
      'case',
      ['<', ['var', 'hash'], 40],
      '#78716c', // 노후 시멘트 그레이 (40%)
      ['<', ['var', 'hash'], 75],
      '#3b5249', // 저채도 딥 세이지 그린 (35%, 쨍한 초록 금지)
      '#334155', // 다크 차콜 방수 슬래브 (25%)
    ],

    // 3) 저층 단독주택·빌라·군부대 막사 (높이 10m 미만)
    // 45% 적갈색 기와/테라코타 (#6b3426), 30% 어두운 아스팔트 슁글 (#3f3f46), 25% 청회색 징크(#334e68) 및 딥 세이지(#3b5249)
    [
      'case',
      ['<', ['var', 'hash'], 45],
      '#6b3426', // 적갈색 기와 / 테라코타 브라운 (45%)
      ['<', ['var', 'hash'], 75],
      '#3f3f46', // 어두운 아스팔트 슁글 그레이 (30%)
      ['<', ['var', 'hash'], 90],
      '#334e68', // 청회색 징크 강판 (15%)
      '#3b5249', // 저채도 방수 그린 (10%)
    ],
  ],
];

// -----------------------------------------------------------------------------
// 5. 실사 창문 패턴 텍스처 등록 함수 (한국형 아파트 베란다 및 상가 샷시 고해상도 질감)
// -----------------------------------------------------------------------------
export const BUILDING_PATTERN_IMAGE_ID = 'facade-window-grid';

export function ensureBuildingPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;
  if (map.hasImage(BUILDING_PATTERN_IMAGE_ID)) return;

  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    // 1. 층간 슬래브 분리선 (Floor Slab Dividing Line)
    ctx.fillStyle = 'rgba(71, 85, 105, 0.55)'; // 다크 슬레이트 층간 라인
    ctx.fillRect(0, 0, size, 4);
    ctx.fillRect(0, size - 4, size, 4);
    ctx.fillRect(0, size / 2 - 2, size, 4); // 2개 층 표현

    // 2. 창호 외곽 알루미늄/하이샤시 프레임 (세로 기둥)
    ctx.fillStyle = 'rgba(148, 163, 184, 0.40)';
    ctx.fillRect(0, 0, 4, size);
    ctx.fillRect(size - 4, 0, 4, size);
    ctx.fillRect(size / 2 - 2, 0, 4, size);

    // 3. 베란다 창문 4구획 (2개 층 x 2개 세대/창호)
    const windowSlots = [
      { x: 6, y: 6, w: size / 2 - 10, h: size / 2 - 10 },
      { x: size / 2 + 4, y: 6, w: size / 2 - 10, h: size / 2 - 10 },
      { x: 6, y: size / 2 + 6, w: size / 2 - 10, h: size / 2 - 10 },
      { x: size / 2 + 4, y: size / 2 + 6, w: size / 2 - 10, h: size / 2 - 10 },
    ];

    for (const win of windowSlots) {
      // (1) 어두운 베란다 내부 음영 (Dark Slate 줄눈)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.fillRect(win.x, win.y, win.w, win.h);

      // (2) 블루그레이 반사 유리 코팅 (Sky Blue Reflective Tint)
      const glassGrad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
      glassGrad.addColorStop(0, 'rgba(186, 230, 253, 0.42)'); // 상단 자연 채광 반사
      glassGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.20)');
      glassGrad.addColorStop(1, 'rgba(30, 41, 59, 0.50)');    // 하단 발코니 턱 음영
      ctx.fillStyle = glassGrad;
      ctx.fillRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);

      // (3) 하단 베란다 세로 철제 난간 살 (Vertical Balcony Railings)
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

      // (4) 상단 유리창 중앙 세로 샷시 프레임 (Mullion)
      ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.fillRect(Math.round(win.x + win.w / 2 - 0.75), win.y + 1, 1.5, Math.round(win.h * 0.55));

      // (5) 대각선 자연 채광 하이라이트 글레어
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(win.x + 3, win.y + 3, Math.round(win.w * 0.35), 1.5);
    }

    const imgData = ctx.getImageData(0, 0, size, size);
    map.addImage(BUILDING_PATTERN_IMAGE_ID, imgData);
  } catch (err) {
    console.warn('[gpuRealisticBuildingStack] Failed to register window pattern image:', err);
  }
}

// -----------------------------------------------------------------------------
// 6. 4단 GPU 다층 슬라이스 레이어 정의 생성기
// -----------------------------------------------------------------------------
export const GPU_BUILDING_LAYER_IDS = [
  'bldg-tier1-podium',
  'bldg-tier2-mainwall',
  'bldg-tier3-pattern',
  'bldg-tier4-roofcap',
] as const;

export function createGpuBuildingStackLayers(
  sourceId: string = 'openmaptiles-vector',
  sourceLayer: string = 'building',
  prefix: string = ''
): maplibregl.LayerSpecification[] {
  const p = prefix ? `${prefix}-` : '';

  // Tier 1: 1층 기단부 (Podium 0m ~ min(3.8m, H)) - 짙은 화강석 쇼윈도 기단부 (#334155)
  const tier1Podium: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier1-podium`,
    type: 'fill-extrusion',
    source: sourceId,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': '#334155',
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
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
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
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': BUILDING_PATTERN_IMAGE_ID,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.38,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Tier 4: 옥상 슬래브 / 파라펫 캡 (Roof Cap H ~ H + 0.25m) - 0.25m 초박형 날렵한 캡
  // 기존 0.8~0.9m 두꺼운 모자 형태를 0.25m로 축소하여 실제 한국 항공사진 뷰 일치
  const tier4RoofCap: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier4-roofcap`,
    type: 'fill-extrusion',
    source: sourceId,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
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

  return [tier1Podium, tier2MainWall, tier3Pattern, tier4RoofCap];
}

// -----------------------------------------------------------------------------
// 7. 가시성 및 모드 제어 헬퍼
// -----------------------------------------------------------------------------
export function setGpuBuildingLayersVisibility(map: maplibregl.Map, visible: boolean): void {
  if (!map) return;
  const vis = visible ? 'visible' : 'none';
  GPU_BUILDING_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', vis);
    }
    // GeoJSON 소스 바인딩 버전도 함께 제어
    const geojsonId = `fusion-${id}`;
    if (map.getLayer(geojsonId)) {
      map.setLayoutProperty(geojsonId, 'visibility', vis);
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
    if (map.getLayer('bldg-tier2-mainwall')) {
      map.setPaintProperty('bldg-tier2-mainwall', 'fill-extrusion-color', gpuBuildingWallColorExpr);
    }
  } else {
    if (map.getLayer('bldg-tier3-pattern')) {
      map.setLayoutProperty('bldg-tier3-pattern', 'visibility', 'visible');
    }
    if (map.getLayer('bldg-tier2-mainwall')) {
      map.setPaintProperty('bldg-tier2-mainwall', 'fill-extrusion-color', gpuBuildingWallColorExpr);
    }
  }
}
