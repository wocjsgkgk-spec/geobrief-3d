/**
 * reaRealisticBuildingComposer.ts
 *
 * [2단계: V-World & Google 3D 역공학(REA) 및 GitHub 오픈소스 다층 빌딩 파츠 분할(Multi-Part Slicing) 실사화]
 *
 * 1. 5단 다층 구조 (Multi-Part Layering):
 *    - Part 1: 1층 상가/로비 기단부 (Podium Base, 0m ~ 3.8m) - 다크 그레이/브라운 화강석 + 가로 간판 띠
 *    - Part 2: 기준층 본동 (Main Wall, 3.8m ~ H) - 16종 서울 V-World 실사 컬러 스펙트럼
 *    - Part 2-B: 절차적 창문 파사드 (Window Facade Overlay, 3.8m ~ H) - 3.0m 층별 슬래브 + 화이트 창틀 샤시 + 다크 네이비 유리창
 *    - Part 4: 옥상 테두리 입체 난간(Parapet, H ~ H + 0.9m) & 옥상 바닥 4종 분리 (우레탄 50%, 시멘트 30%, 기와 15%, 징크 5%)
 *    - Part 5: 5층 이상 옥상 엘리베이터 권상기실(Penthouse Core, H + 0.9m ~ H + 4.1m, +3.2m 솟아오름)
 *
 * 2. 16종 서울 V-World 실사 컬러 스펙트럼 (hash % 16):
 *    - 아파트 단지 (15~25층): 크림 화이트, 샌드 베이지, 실버 그레이, 모던 라이트그레이
 *    - 공공청사/오피스 (7~15층): 에메랄드 반사유리, 스카이블루 유리, 아이보리 콘크리트
 *    - 중심 상가/근린 (3~6층): 사비석 화강석, 붉은 벽돌, 다크 차콜 메탈, 갈색 파벽돌
 *    - 주택/빌라 (1.5~3층): 적벽돌 빌라, 황토벽돌, 크림 스타코, 살구색 교사동, 웜 베이지
 *
 * 3. 지형 밀착 (Terrain Clamping):
 *    - 모든 건물의 바닥(base: 0)이 MapLibre Terrarium DEM 3D 지형 표면에 1:1 자동 밀착 (공중부양 0%)
 */

import maplibregl from 'maplibre-gl';
import {
  gpuBuildingBaseExpr,
  BUILDING_HEIGHT_EXPR,
} from '@/utils/gpuRealisticBuildingStack';

// =============================================================================
// [1. 16종 서울 V-World 실사 컬러 스펙트럼 (hash % 16)]
// =============================================================================

export const REA_SEOUL_16_PALETTE = {
  // 아파트 단지 (15~25층, 45~75m) - Mat 0~4
  aptPureWhite: '#f8fafc',       // 0: 순백색 외벽
  aptCreamIvory: '#f4f1ea',      // 1: 크림 아이보리 외벽
  aptSilverGray: '#e2e8f0',      // 2: 라이트 실버 그레이 외벽
  aptModernCoolGray: '#f1f5f9',  // 3: 모던 쿨 그레이 외벽
  aptSoftWarmGray: '#e7e5e4',    // 4: 소프트 웜 그레이 외벽

  // 하위 호환 별칭
  aptCreamWhite: '#f8fafc',
  aptSandBeige: '#f4f1ea',

  // 도청·시청·혁신도시 공공기관·오피스 타워·학교 (7~15층, 16~45m) - Mat 10~12
  officeEmeraldGlass: '#0f766e', // 10: 에메랄드 반사 유리 커튼월
  officeSkyBlueGlass: '#0284c7', // 11: 스카이블루 유리 커튼월
  schoolTerracotta: '#d97742',   // 12: 살구색/테라코타 학교 교사동
  officeIvoryFrame: '#cbd5e1',

  // 시내 중심 상가·근린생활 빌딩 (3~6층, 12~21m) - Mat 5~9
  commercialSabiseok: '#d6cfc2', // 5: 밝은 사비석 화강석
  commercialRedBrick: '#7f1d1d', // 6: 붉은 적벽돌
  commercialCharcoal: '#334155', // 7: 다크 차콜 모던 메탈
  commercialBrownBrick: '#6e473b',// 8: 갈색 파벽돌
  commercialWarmStone: '#bfa588', // 9: 웜스톤 대리석

  // 단독주택·다세대 빌라·농어촌 주택 (2~3층, 6.5~10.5m) - Mat 13~15
  villaRedBrick: '#7c2d12',      // 13: 적벽돌 빌라
  villaOchreBrick: '#9a3412',    // 14: 황토벽돌
  villaCreamStucco: '#f5f5f4',   // 15: 밝은 크림 스타코
  villaWarmBeige: '#e7e5e4',     // 폴백 웜 라이트 베이지
};

/**
 * 고유 ID/좌표/명칭 해시 기반 서울 16색 스펙트럼 Expression
 */
export const REA_BUILDING_HASH_EXPR: any = [
  '%',
  [
    'abs',
    [
      'coalesce',
      ['to-number', ['id'], 0],
      ['to-number', ['get', 'osm_id'], 0],
      ['to-number', ['get', 'mgmBldrgstPk'], 0],
      ['to-number', ['get', 'bd_mgt_sn'], 0],
      12345,
    ],
  ],
  16,
];

export const REA_SEOUL_16_SPECTRUM_EXPR: any = [
  'case',
  // 1) 고층 아파트 단지 (H >= 38m 또는 아파트 명칭) - Mat 0~4
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 38.0],
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'type'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 0], REA_SEOUL_16_PALETTE.aptPureWhite,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 1], REA_SEOUL_16_PALETTE.aptCreamIvory,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 2], REA_SEOUL_16_PALETTE.aptSilverGray,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 3], REA_SEOUL_16_PALETTE.aptModernCoolGray,
    REA_SEOUL_16_PALETTE.aptSoftWarmGray,
  ],

  // 2) 도청·시청·혁신도시 공공기관·오피스 타워·학교 (H >= 22m 또는 오피스/공공/학교 명칭) - Mat 10~12
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 22.0],
    ['==', ['get', 'class'], 'office'],
    ['==', ['get', 'class'], 'public'],
    ['==', ['get', 'class'], 'government'],
    ['==', ['get', 'class'], 'school'],
    ['==', ['get', 'class'], 'university'],
    ['==', ['get', 'class'], 'hospital'],
    ['==', ['get', 'building'], 'office'],
    ['==', ['get', 'building'], 'public'],
    ['==', ['get', 'building'], 'government'],
    ['==', ['get', 'building'], 'school'],
    ['==', ['get', 'usageType'], 'military_public'],
    ['==', ['get', 'bld_category'], 'public_military'],
  ],
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 3], 0], REA_SEOUL_16_PALETTE.officeEmeraldGlass,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 3], 1], REA_SEOUL_16_PALETTE.officeSkyBlueGlass,
    REA_SEOUL_16_PALETTE.schoolTerracotta,
  ],

  // 3) 시내 중심 상가·근린생활 빌딩 (H >= 11m 또는 상가 명칭) - Mat 5~9
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 11.0],
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'building'], 'commercial'],
    ['==', ['get', 'building'], 'retail'],
    ['==', ['get', 'usageType'], 'commercial'],
    ['==', ['get', 'bld_category'], 'commercial'],
  ],
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 0], REA_SEOUL_16_PALETTE.commercialSabiseok,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 1], REA_SEOUL_16_PALETTE.commercialRedBrick,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 2], REA_SEOUL_16_PALETTE.commercialCharcoal,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 5], 3], REA_SEOUL_16_PALETTE.commercialBrownBrick,
    REA_SEOUL_16_PALETTE.commercialWarmStone,
  ],

  // 4) 저층 단독주택·다세대 빌라·농가 (H < 11m) - Mat 13~15
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 3], 0], REA_SEOUL_16_PALETTE.villaRedBrick,
    ['==', ['%', REA_BUILDING_HASH_EXPR, 3], 1], REA_SEOUL_16_PALETTE.villaOchreBrick,
    REA_SEOUL_16_PALETTE.villaCreamStucco,
  ],
];

// =============================================================================
// [2. Part 1: 1층 기단부(Podium Base) 색상 및 간판 띠]
// =============================================================================

export const REA_PODIUM_COLOR_EXPR: any = [
  'case',
  // 상업·근린: 다크 차콜 화강석 기단부
  [
    'any',
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'building'], 'commercial'],
    ['==', ['get', 'usageType'], 'commercial'],
  ],
  '#44403c',
  // 아파트: 브라운/웜그레이 화강석 기단부
  [
    'any',
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
  ],
  '#57534e',
  // 기본 기단부: 중후한 화강석 다크그레이
  '#52525b',
];

// =============================================================================
// [3. Part 4: 옥상 테두리 난간(Parapet) & 서울 V-World 옥상 바닥 4종 분리]
// - 50% (상가·빌라·원룸): 한국 도심 특유의 에메랄드 우레탄 방수 옥상 (#2d6a4f, #3b7a57, #40916c)
// - 30% (아파트·대형 빌딩): 밝은 시멘트 회색 슬래브 (#94a3b8, #cbd5e1)
// - 15% (단독주택·학교): 적갈색/오렌지 기와 지붕 (#7c2d12, #9a3412)
// - 5% (공장·체육관·창고): 코발트 블루 강판 지붕 (#1d4ed8)
// =============================================================================

export const REA_ROOFTOP_4TYPE_COLOR_EXPR: any = [
  'case',
  // 1) 고층 아파트 단지 및 대형 오피스 타워: 30% 밝은 시멘트 회색 슬래브
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 28.0],
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 2], 0], '#94a3b8',
    '#cbd5e1',
  ],

  // 2) 공장·체육관·창고: 5% 코발트 블루 강판 지붕
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
    ['==', ['get', 'usageType'], 'industrial'],
  ],
  '#1d4ed8',

  // 3) 단독주택·농어촌주택·학교: 15% 적갈색/오렌지 기와 지붕
  [
    'any',
    ['==', ['get', 'class'], 'house'],
    ['==', ['get', 'class'], 'school'],
    ['==', ['get', 'building'], 'house'],
    ['==', ['get', 'building'], 'school'],
    ['==', ['get', 'usageType'], 'residential'],
  ],
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 2], 0], '#7c2d12',
    '#9a3412',
  ],

  // 4) 상가·빌라·원룸·근린생활: 50% 한국 도심 특유의 에메랄드 우레탄 방수 옥상
  [
    'case',
    ['==', ['%', REA_BUILDING_HASH_EXPR, 3], 0], '#2d6a4f', // 다크 에메랄드
    ['==', ['%', REA_BUILDING_HASH_EXPR, 3], 1], '#3b7a57', // 표준 세이지 그린
    '#40916c', // 밝은 우레탄 그린
  ],
];

// =============================================================================
// [4. 캔버스 절차적 텍스처 패턴 등록 (map.addImage)]
// =============================================================================

export const REA_PATTERN_IDS = {
  PODIUM_COMMERCIAL: 'rea-podium-commercial-signboard',
  WINDOW_FACADE_GRID: 'rea-window-facade-grid',
  ROOF_PARAPET_AO: 'rea-roof-parapet-ao',
  PENTHOUSE_CORE: 'rea-penthouse-core',
} as const;

/**
 * 1층 상가 가로 간판 띠 + 로비 쇼윈도 패턴 생성
 */
export function createReaPodiumSignboardImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 하단 기단부 화강석 베이스 (#44403c)
  ctx.fillStyle = '#44403c';
  ctx.fillRect(0, 0, size, size);

  // 2. 상단 25% 가로 간판 띠 (Signboard Band)
  const signH = Math.round(size * 0.28);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, signH);

  // 간판 포인트 조명 바
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(4, 4, Math.round(size * 0.45), signH - 8);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(Math.round(size * 0.52), 4, Math.round(size * 0.42), signH - 8);

  // 3. 하단 쇼윈도 유리창 2구획
  const winY = signH + 8;
  const winH = size - winY - 8;
  const winW = Math.round((size - 24) / 2);

  for (let col = 0; col < 2; col++) {
    const wx = 8 + col * (winW + 8);
    // 화강석 프레임
    ctx.fillStyle = '#292524';
    ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);
    // 쇼윈도 유리
    const g = ctx.createLinearGradient(wx, winY, wx, winY + winH);
    g.addColorStop(0, '#1e293b');
    g.addColorStop(0.5, '#0f172a');
    g.addColorStop(1, '#090d16');
    ctx.fillStyle = g;
    ctx.fillRect(wx, winY, winW, winH);
    // 도어 손잡이
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(wx + winW - 6, winY + Math.round(winH * 0.4), 3, 20);
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * 층별 슬래브 + 화이트 창틀 샤시 + 다크 네이비 유리창 실사 격자 패턴 생성
 * - 3.0m 층간 슬래브 + 흰색 창틀이 100% 선명하게 표출
 */
export function createReaWindowFacadeGridImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 투명 배경 (아래의 16종 외벽 색상이 비치도록 알파 채널 유지)
  // 층간 2개 층 (각 128px)
  const floorH = size / 2;

  for (let f = 0; f < 2; f++) {
    const fY = f * floorH;

    // (1) 층간 콘크리트 슬래브 띠 (Floor Slab Band)
    ctx.fillStyle = '#e2e8f0f0';
    ctx.fillRect(0, fY, size, 14);

    // 슬래브 턱 그림자 라인
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, fY + 12, size, 2);

    // (2) 세대별 2구획 창문
    const marginSide = 14;
    const centerGap = 16;
    const winW = Math.round((size - marginSide * 2 - centerGap) / 2);
    const winY = fY + 22;
    const winH = floorH - 34;

    const winXs = [marginSide, marginSide + winW + centerGap];

    for (const wx of winXs) {
      // 화이트 샤시 외곽 프레임
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);

      // 다크 네이비 유리창 그라디언트
      const g = ctx.createLinearGradient(wx, winY, wx, winY + winH);
      g.addColorStop(0, '#2c3e50'); // 상단 반사광
      g.addColorStop(0.35, '#1e293b'); // 깊은 차콜 네이비
      g.addColorStop(1, '#0f172a'); // 하단 깊은 음영
      ctx.fillStyle = g;
      ctx.fillRect(wx, winY, winW, winH);

      // 상단 드롭 섀도우
      ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
      ctx.fillRect(wx, winY, winW, 8);

      // 중앙 세로 화이트 샤시 (Mullion)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(wx + winW / 2 - 1.5), winY, 3, winH);

      // 가로 분할 샤시 (Transom)
      ctx.fillRect(wx, Math.round(winY + winH * 0.42), winW, 2);

      // 발코니 안전 난간 핸드레일
      const railTop = Math.round(winY + winH * 0.60);
      const railH = winH - Math.round(winH * 0.60);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(wx + 2, railTop, winW - 4, 3);

      // 세로 난간 살 5개
      const pickets = 5;
      const pStep = (winW - 8) / (pickets + 1);
      ctx.fillStyle = '#94a3b8';
      for (let p = 1; p <= pickets; p++) {
        ctx.fillRect(Math.round(wx + 4 + p * pStep), railTop + 3, 2, railH - 3);
      }
    }
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * 옥상 테두리 난간 연석 및 내부 AO 음영 패턴 생성
 */
export function createReaRoofParapetAOImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 회백색 콘크리트 난간 벽체 (#cbd5e1)
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, size, size);

  // 2. 상단 두겁석(Coping Stone) 라인
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, 14);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 14, size, 3);

  // 3. 하단 테두리 내부 AO 섀도우 그라디언트
  const g = ctx.createLinearGradient(0, size - 32, 0, size);
  g.addColorStop(0, 'rgba(15, 23, 42, 0.0)');
  g.addColorStop(1, 'rgba(15, 23, 42, 0.65)');
  ctx.fillStyle = g;
  ctx.fillRect(0, size - 32, size, 32);

  return ctx.getImageData(0, 0, size, size);
}

/**
 * 5층 이상 옥상 엘리베이터 권상기실 / 옥탑방 코어 패턴 생성
 */
export function createReaPenthouseCoreImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 1. 옥탑 콘크리트 외벽 (#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, size, size);

  // 2. 환기 알루미늄 루버 그릴 (Vent Louver)
  const louverX = 24;
  const louverY = 24;
  const louverW = Math.round(size * 0.45);
  const louverH = Math.round(size * 0.55);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);

  ctx.fillStyle = '#cbd5e1';
  for (let ly = louverY + 4; ly < louverY + louverH - 2; ly += 6) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 2.5);
  }

  // 3. 옥상 점검 철제 도어 (Inspection Door)
  const doorX = Math.round(size * 0.65);
  const doorY = 32;
  const doorW = Math.round(size * 0.25);
  const doorH = size - doorY - 12;

  ctx.fillStyle = '#475569';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(doorX + 3, doorY + 3, doorW - 6, doorH - 6);
  // 도어 핸들
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(doorX + doorW - 8, doorY + Math.round(doorH * 0.5), 3, 14);

  return ctx.getImageData(0, 0, size, size);
}

/**
 * MapLibre 인스턴스에 REA 패턴 등록
 */
export function ensureReaPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  const patterns = [
    { id: REA_PATTERN_IDS.PODIUM_COMMERCIAL, fn: createReaPodiumSignboardImage },
    { id: REA_PATTERN_IDS.WINDOW_FACADE_GRID, fn: createReaWindowFacadeGridImage },
    { id: REA_PATTERN_IDS.ROOF_PARAPET_AO, fn: createReaRoofParapetAOImage },
    { id: REA_PATTERN_IDS.PENTHOUSE_CORE, fn: createReaPenthouseCoreImage },
  ];

  for (const p of patterns) {
    if (!map.hasImage(p.id)) {
      try {
        const img = p.fn(256);
        if (img) {
          map.addImage(p.id, img);
        }
      } catch (err) {
        console.warn(`[REAPatterns] addImage notice (${p.id}):`, err);
      }
    }
  }
}

// =============================================================================
// [5. REA 5단 다층 건축 파츠 레이어 생성기 (Multi-Part Layering)]
// =============================================================================

export function createReaBuildingStackLayers(
  sourceId: string = 'openmaptiles-vector',
  sourceLayer?: string,
  prefix: string = ''
): maplibregl.LayerSpecification[] {
  const p = prefix ? `${prefix}-` : '';

  const isGeojson = sourceId.endsWith('-source') || sourceId.includes('geojson') || !sourceLayer || sourceLayer === 'none';
  const srcLayerObj = isGeojson ? {} : { 'source-layer': sourceLayer || 'building' };

  // 비건물 거대 폴리곤 & 옹벽 필터링 (골프장, 산림 임야, 4,500㎡ 초과 대형 구획 원천 차단)
  const buildingFilter: any = [
    'all',
    ['!=', ['get', 'is_non_building'], true],
    ['!=', ['get', 'is_site_boundary'], true],
    ['!=', ['get', 'layer_type'], 'cadastral'],
    ['!=', ['get', 'layer_type'], 'zoning'],
    ['!=', ['get', 'building'], 'no'],
    ['!=', ['get', 'jimok'], '임'],
    ['!=', ['get', 'jimok'], '임야'],
    ['!=', ['get', 'jimok_nm'], '임야'],
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
    ['!', ['has', 'natural']],
  ];

  // ---------------------------------------------------------------------------
  // Part 1: 1층 상가/로비 기단부 (Podium Base, 0m ~ 3.8m)
  // ---------------------------------------------------------------------------
  const part1Podium: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier1-podium`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': REA_PODIUM_COLOR_EXPR,
      'fill-extrusion-base': gpuBuildingBaseExpr,
      'fill-extrusion-height': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // ---------------------------------------------------------------------------
  // Part 2: 기준층 본동 (Main Wall, 3.8m ~ H) - 16종 서울 V-World 실사 컬러 스펙트럼
  // ---------------------------------------------------------------------------
  const part2MainWall: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier2-mainwall`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': REA_SEOUL_16_SPECTRUM_EXPR,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // ---------------------------------------------------------------------------
  // Part 2-B: 절차적 창문 파사드 오버레이 (Window Facade Overlay, 3.8m ~ H)
  // - 3.0m 층별 슬래브 + 화이트 창틀 + 다크 네이비 유리창 격자
  // ---------------------------------------------------------------------------
  const part2WindowPattern: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier3-pattern`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11.5,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': REA_PATTERN_IDS.WINDOW_FACADE_GRID,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.88,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // ---------------------------------------------------------------------------
  // Part 4: 옥상 테두리 입체 난간(Parapet, H ~ H + 0.85m) & 옥상 바닥 4종 분리
  // ---------------------------------------------------------------------------
  const part4RoofCap: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier4-roofcap`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': REA_ROOFTOP_4TYPE_COLOR_EXPR,
      'fill-extrusion-base': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 0.85],
      'fill-extrusion-opacity': 1.0,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // ---------------------------------------------------------------------------
  // Part 5: 5층 이상 옥상 엘리베이터 권상기실 (Penthouse Core, H + 0.85m ~ H + 4.05m)
  // - 5층 이상(H >= 14m) 건물 옥상 중앙에 +3.2m 솟아오른 옥탑방 코어 메쉬
  // ---------------------------------------------------------------------------
  const penthouseFilter: any = [
    'all',
    ...buildingFilter.slice(1),
    ['>=', BUILDING_HEIGHT_EXPR, 14.0], // 5층 이상 건물에만 옥탑방 배치
  ];

  const part5Penthouse: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier5-roofdetail`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: penthouseFilter,
    minzoom: 13.5,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': REA_PATTERN_IDS.PENTHOUSE_CORE,
      'fill-extrusion-base': ['+', BUILDING_HEIGHT_EXPR, 0.85],
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 4.05], // Parapet(0.85m) 위 +3.2m 엘리베이터 권상기실
      'fill-extrusion-opacity': 0.95,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  return [part1Podium, part2MainWall, part2WindowPattern, part4RoofCap, part5Penthouse];
}
