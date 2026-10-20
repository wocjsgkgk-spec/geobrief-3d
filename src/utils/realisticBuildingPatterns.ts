import type maplibregl from 'maplibre-gl';

/**
 * realisticBuildingPatterns.ts
 *
 * [1단계: 고해상도 한국형 실사 외벽 텍스처 패턴(map.addImage) 생성 및 등록 엔진]
 * - MapLibre GPU fill-extrusion-pattern 렌더링을 위한 128x128 고해상도 심리스(Seamless) 건축 패턴 6종
 * - 지도가 로드될 때(map.on('load')) 및 스타일 변경 시 Canvas 2D로 자동 생성하여 등록
 */

export const REALISTIC_BUILDING_PATTERNS = {
  APT_IVORY: 'facade-apt-ivory',
  APT_GRAY: 'facade-apt-gray',
  OFFICE_GLASS: 'facade-office-glass',
  COMMERCIAL_STONE: 'facade-commercial-stone',
  VILLA_BRICK: 'facade-villa-brick',
  MILITARY_BARRACKS: 'facade-military-barracks',
} as const;

/**
 * 1) 따뜻한 크림 아이보리 아파트 외벽 (facade-apt-ivory)
 * - 따뜻한 크림 아이보리(#ebe6dc) 콘크리트 외벽
 * - 어두운 차콜 블루(#1e293b / #334155) 베란다 유리창 격자
 * - 층간 슬래브 그림자 라인(#78716c) 및 알루미늄 발코니 난간(#cbd5e1)
 */
export function createAptIvoryPatternCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 외벽 베이스: 웜 크림 아이보리 (#ebe6dc)
  ctx.fillStyle = '#ebe6dc';
  ctx.fillRect(0, 0, size, size);

  // 미세 콘크리트 입자 질감
  ctx.fillStyle = 'rgba(120, 113, 108, 0.06)';
  for (let i = 0; i < size; i += 4) {
    for (let j = 0; j < size; j += 4) {
      if ((i * 7 + j * 13) % 5 === 0) {
        ctx.fillRect(i, j, 2, 2);
      }
    }
  }

  const floorCount = 4;
  const floorH = size / floorCount; // 32px per floor
  const bayCount = 4;
  const bayW = size / bayCount;     // 32px per bay

  for (let f = 0; f < floorCount; f++) {
    const y0 = f * floorH;

    // 1. 층간 콘크리트 슬래브 음영선 (Slab shadow line)
    ctx.fillStyle = '#78716c';
    ctx.fillRect(0, y0, size, 2);
    ctx.fillStyle = '#a8a29e';
    ctx.fillRect(0, y0 + 2, size, 1);
    ctx.fillStyle = '#f5f5f4'; // 슬래브 하단 하이라이트
    ctx.fillRect(0, y0 + 3, size, 1);

    // 2. 세대별 베란다 창호 및 난간
    for (let b = 0; b < bayCount; b++) {
      const x0 = b * bayW;
      const winX = x0 + 4;
      const winY = y0 + 6;
      const winW = bayW - 8;  // 24px
      const winH = floorH - 9; // 23px

      // 화이트/라이트 그레이 외부 창틀 프레임 (#f1f5f9)
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(winX - 1, winY - 1, winW + 2, winH + 2);

      // 다크 그레이 섀시 내부 프레임 (#1e293b)
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(winX, winY, winW, winH);

      // 베란다 유리창: 다크 차콜 블루 (#1e293b ~ #334155 그라데이션)
      const glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
      glassGrad.addColorStop(0, '#475569');
      glassGrad.addColorStop(0.2, '#334155');
      glassGrad.addColorStop(0.8, '#1e293b');
      glassGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(winX + 1, winY + 1, winW - 2, winH - 2);

      // 상부 트랜섬 유리 반사 하이라이트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(winX + 1, winY + 1, winW - 2, 4);

      // 중앙 세로 창살 (Mullion)
      const midX = Math.floor(winX + winW / 2);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(midX, winY + 1, 1, winH - 2);

      // 하단 안전 발코니 난간 (Railing)
      const railY = winY + winH - 7;
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(winX + 1, railY, winW - 2, 1);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(winX + 1, railY + 1, winW - 2, 1);

      // 난간 수직 살 3개
      const step = Math.floor(winW / 4);
      for (let s = 1; s <= 3; s++) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(winX + s * step, railY, 1, 7);
      }
    }
  }

  // 우측 수직 패널 조인트 줄눈
  ctx.fillStyle = '#d6cfc7';
  ctx.fillRect(size - 1, 0, 1, size);

  return canvas;
}

/**
 * 2) 모던 웜 그레이 아파트 외벽 (facade-apt-gray)
 * - 모던 웜 그레이(#d6d3d1) 아파트 콘크리트 외벽
 * - 넓은 거실 파노라마 창호와 발코니 난간 디테일
 */
export function createAptGrayPatternCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 외벽 베이스: 모던 웜 그레이 (#d6d3d1)
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, size, size);

  const floorCount = 4;
  const floorH = size / floorCount; // 32px
  const bayCount = 3;               // 3개 광폭 베이
  const bayW = size / bayCount;     // ~42.6px

  for (let f = 0; f < floorCount; f++) {
    const y0 = f * floorH;

    // 층간 슬래브 강조 밴드 (#78716c)
    ctx.fillStyle = '#57534e';
    ctx.fillRect(0, y0, size, 2);
    ctx.fillStyle = '#a8a29e';
    ctx.fillRect(0, y0 + 2, size, 2);

    for (let b = 0; b < bayCount; b++) {
      const x0 = Math.floor(b * bayW);
      const curW = Math.floor((b + 1) * bayW) - x0;
      const winX = x0 + 4;
      const winY = y0 + 6;
      const winW = curW - 8;
      const winH = floorH - 9;

      // 다크 그라파이트 프레임 (#1f2937)
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(winX - 1, winY - 1, winW + 2, winH + 2);

      // 넓은 거실 창호: 딥 슬레이트 (#1e293b ~ #334155)
      const grad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
      grad.addColorStop(0, '#64748b');
      grad.addColorStop(0.3, '#334155');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(winX, winY, winW, winH);

      // 대각선 유리 반사 하이라이트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(winX + 2, winY + 2, winW - 4, 3);

      // 3분할 수직 창호 프레임
      const partW = Math.floor(winW / 3);
      ctx.fillStyle = '#111827';
      ctx.fillRect(winX + partW, winY, 1, winH);
      ctx.fillRect(winX + partW * 2, winY, 1, winH);

      // 발코니 하부 가로 안전 바
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(winX, winY + winH - 6, winW, 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(winX, winY + winH - 3, winW, 1);
    }
  }

  // 외벽 수직 기둥 홈
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(0, 0, 1, size);
  ctx.fillRect(size - 1, 0, 1, size);

  return canvas;
}

/**
 * 3) 하늘빛 반사 유리 커튼월 (facade-office-glass)
 * - 스카이/슬레이트 블루(#64748b ~ #1e293b) 반사 유리 커튼월
 * - 슬릭 알루미늄 멀리언 프레임 & 스팬드럴 글래스
 */
export function createOfficeGlassPatternCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 기본 알루미늄 프레임 배경 (#1e293b)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  const rowCount = 4;
  const colCount = 4;
  const cellH = size / rowCount; // 32px
  const cellW = size / colCount; // 32px

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const x = c * cellW;
      const y = r * cellH;

      // 유리창 영역
      const gx = x + 2;
      const gy = y + 2;
      const gw = cellW - 4;
      const gh = cellH - 4;

      // 반사 유리 그라디언트: 스카이 블루 -> 다크 슬레이트 블루 (#64748b ~ #1e293b)
      const grad = ctx.createLinearGradient(gx, gy, gx, gy + gh);
      grad.addColorStop(0, '#64748b');
      grad.addColorStop(0.35, '#475569');
      grad.addColorStop(0.7, '#1e293b');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(gx, gy, gw, gh);

      // 하늘빛 반사광 (Sky Reflection Sheen)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.30)';
      ctx.fillRect(gx, gy, gw, 5);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(gx, gy + 5, gw, 4);

      // 하부 스팬드럴 글래스 바 (Spandrel band)
      ctx.fillStyle = '#090d16';
      ctx.fillRect(gx, gy + gh - 6, gw, 6);

      // 알루미늄 멀리언 하이라이트 (#cbd5e1 / #94a3b8)
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x, y, cellW, 1);
      ctx.fillRect(x, y, 1, cellH);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + cellW - 1, y, 1, cellH);
      ctx.fillRect(x, y + cellH - 1, cellW, 1);
    }
  }

  return canvas;
}

/**
 * 4) 시내 상가 화강석 베이지 타일 외벽 (facade-commercial-stone)
 * - 화강석 베이지(#e2d9cc / #d5cbb8) 타일 외벽
 * - 가로형 연속 띠창문 프레임 & 상가 간판 밴드
 */
export function createCommercialStonePatternCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 베이스: 화강석 베이지 (#e2d9cc)
  ctx.fillStyle = '#e2d9cc';
  ctx.fillRect(0, 0, size, size);

  // 화강석 석재 타일 줄눈 (32px x 16px 타일 패턴)
  ctx.fillStyle = '#b8ad9e';
  for (let y = 0; y < size; y += 16) {
    ctx.fillRect(0, y, size, 1);
  }
  for (let y = 0; y < size; y += 16) {
    const isOdd = (y / 16) % 2 === 1;
    const offset = isOdd ? 16 : 0;
    for (let x = offset; x < size; x += 32) {
      ctx.fillRect(x, y, 1, 16);
    }
  }

  // 미세 석재 노이즈
  ctx.fillStyle = 'rgba(80, 70, 60, 0.08)';
  for (let i = 0; i < size; i += 3) {
    for (let j = 0; j < size; j += 3) {
      if ((i * 11 + j * 17) % 7 === 0) {
        ctx.fillRect(i, j, 1, 1);
      }
    }
  }

  // 4개 층 가로형 연속 상가 창문 (Horizontal ribbon windows)
  const floorH = size / 4; // 32px
  for (let f = 0; f < 4; f++) {
    const y0 = f * floorH;

    // 상가 간판/처마 밴드 (#44403c)
    ctx.fillStyle = '#44403c';
    ctx.fillRect(0, y0, size, 3);

    // 가로 연속 창문 개구부 (좌우 여백 6px, 높이 18px)
    const winY = y0 + 6;
    const winH = 18;

    // 다크 브론즈 창틀
    ctx.fillStyle = '#292524';
    ctx.fillRect(4, winY - 1, size - 8, winH + 2);

    // 다크 브론즈 반사 유리 (#1c1917)
    const glassGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
    glassGrad.addColorStop(0, '#57534e');
    glassGrad.addColorStop(0.3, '#292524');
    glassGrad.addColorStop(1, '#0c0a09');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(5, winY, size - 10, winH);

    // 상단 반사광
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(5, winY, size - 10, 3);

    // 창문 수직 프레임 (4개 창틀 분할)
    for (let w = 1; w <= 3; w++) {
      const colX = Math.floor((size / 4) * w);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(colX - 1, winY, 2, winH);
      ctx.fillStyle = '#78716c';
      ctx.fillRect(colX, winY, 1, winH);
    }

    // 창대 하부 화강석 비드 (#d5cbb8)
    ctx.fillStyle = '#d5cbb8';
    ctx.fillRect(4, winY + winH, size - 8, 2);
  }

  return canvas;
}

/**
 * 5) 다세대 주택/빌라용 적벽돌 및 백색 창틀 (facade-villa-brick)
 * - 적벽돌(#7c2d12, #9a3412, #b91c1c) 텍스처
 * - 백색 창틀(#f8fafc) 및 단열 유리
 */
export function createVillaBrickPatternCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 모르타르 줄눈 배경 (#e2e8f0)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, size);

  // 16단 벽돌 레이어 (8px 높이, 7px 벽돌 + 1px 줄눈)
  const brickH = 7;
  const rowH = 8;
  const brickColors = ['#7c2d12', '#9a3412', '#b91c1c', '#c2410c', '#a16207', '#831843'];

  for (let r = 0; r < size / rowH; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const offset = isOdd ? 10 : 0;
    const brickW = 19;
    const stride = 20;

    for (let x = -20 + offset; x < size + 20; x += stride) {
      const colorIdx = Math.abs((x * 7 + r * 13) % brickColors.length);
      ctx.fillStyle = brickColors[colorIdx];
      ctx.fillRect(x, y, brickW, brickH);

      // 벽돌 질감 미세 하이라이트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x, y, brickW, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(x, y + brickH - 1, brickW, 1);
    }
  }

  // 4개 주택 창호 삽입 (2층 x 2열)
  const winW = 24;
  const winH = 30;
  const windows = [
    { x: 16, y: 16 },
    { x: 80, y: 16 },
    { x: 16, y: 76 },
    { x: 80, y: 76 },
  ];

  for (const win of windows) {
    // 화강석 인방/창대 (White granite sill & lintel)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(win.x - 2, win.y - 3, winW + 4, winH + 6);

    // 창틀 프레임 (#1e293b)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(win.x, win.y, winW, winH);

    // 창문 유리 (#1e293b ~ #334155)
    ctx.fillStyle = '#334155';
    ctx.fillRect(win.x + 2, win.y + 2, winW - 4, winH - 4);

    // 상부 유리 반사 하이라이트
    ctx.fillStyle = '#64748b';
    ctx.fillRect(win.x + 2, win.y + 2, winW - 4, 5);

    // 백색 십자 창살 (#f8fafc)
    const midX = win.x + Math.floor(winW / 2);
    const midY = win.y + Math.floor(winH / 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(midX, win.y + 2, 2, winH - 4);
    ctx.fillRect(win.x + 2, midY, winW - 4, 2);
  }

  return canvas;
}

/**
 * 6) 군부대 막사/관공서 샌드 베이지 외벽 (facade-military-barracks)
 * - 정돈된 샌드 베이지(#dfd7c5) 외벽
 * - 규칙적인 격자 창문 패턴 & 슬레이트 처마 라인
 */
export function createMilitaryBarracksPatternCanvas(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 외벽 베이스: 샌드 베이지 (#dfd7c5)
  ctx.fillStyle = '#dfd7c5';
  ctx.fillRect(0, 0, size, size);

  // 미세 음영 그라데이션
  ctx.fillStyle = 'rgba(60, 50, 40, 0.05)';
  for (let i = 0; i < size; i += 4) {
    ctx.fillRect(i, 0, 1, size);
  }

  const floorCount = 4;
  const floorH = size / floorCount; // 32px
  const bayCount = 4;
  const bayW = size / bayCount;     // 32px

  for (let f = 0; f < floorCount; f++) {
    const y0 = f * floorH;

    // 수평 콘크리트 코니스 몰딩 (#9ca3af)
    ctx.fillStyle = '#71717a';
    ctx.fillRect(0, y0, size, 2);
    ctx.fillStyle = '#d4d4d8';
    ctx.fillRect(0, y0 + 2, size, 1);

    for (let b = 0; b < bayCount; b++) {
      const x0 = b * bayW;
      const winX = x0 + 6;
      const winY = y0 + 7;
      const winW = bayW - 12; // 20px
      const winH = floorH - 12; // 20px

      // 다크 올리브/슬레이트 창틀 프레임 (#3f3f46)
      ctx.fillStyle = '#27272a';
      ctx.fillRect(winX - 1, winY - 1, winW + 2, winH + 2);

      // 유리창 (#334155)
      ctx.fillStyle = '#334155';
      ctx.fillRect(winX, winY, winW, winH);

      // 상단 환기창/트랜섬 라인
      ctx.fillStyle = '#52525b';
      ctx.fillRect(winX, winY, winW, 4);

      // 중앙 세로 창살
      const midX = winX + Math.floor(winW / 2);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(midX, winY, 1, winH);

      // 창호 하단 화강석 턱 (#e4e4e7)
      ctx.fillStyle = '#e4e4e7';
      ctx.fillRect(winX - 1, winY + winH, winW + 2, 2);
    }
  }

  return canvas;
}

/**
 * MapLibre 지도 인스턴스에 6종 고해상도 실사 외벽 패턴 자동 생성 및 등록
 */
export function registerRealisticBuildingPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  const patterns = [
    { id: REALISTIC_BUILDING_PATTERNS.APT_IVORY, factory: createAptIvoryPatternCanvas },
    { id: REALISTIC_BUILDING_PATTERNS.APT_GRAY, factory: createAptGrayPatternCanvas },
    { id: REALISTIC_BUILDING_PATTERNS.OFFICE_GLASS, factory: createOfficeGlassPatternCanvas },
    { id: REALISTIC_BUILDING_PATTERNS.COMMERCIAL_STONE, factory: createCommercialStonePatternCanvas },
    { id: REALISTIC_BUILDING_PATTERNS.VILLA_BRICK, factory: createVillaBrickPatternCanvas },
    { id: REALISTIC_BUILDING_PATTERNS.MILITARY_BARRACKS, factory: createMilitaryBarracksPatternCanvas },
  ];

  try {
    for (const { id, factory } of patterns) {
      if (!map.hasImage(id)) {
        const cvs = factory(128);
        const ctx = cvs.getContext('2d');
        if (ctx) {
          const imgData = ctx.getImageData(0, 0, 128, 128);
          map.addImage(id, imgData);
        }
      }
    }

    // 하위 호환 별칭 패턴 등록
    const legacyAliases = [
      { alias: 'pattern-apt', target: REALISTIC_BUILDING_PATTERNS.APT_IVORY, factory: createAptIvoryPatternCanvas },
      { alias: 'facade-apartment', target: REALISTIC_BUILDING_PATTERNS.APT_IVORY, factory: createAptIvoryPatternCanvas },
      { alias: 'pattern-office', target: REALISTIC_BUILDING_PATTERNS.OFFICE_GLASS, factory: createOfficeGlassPatternCanvas },
      { alias: 'facade-commercial', target: REALISTIC_BUILDING_PATTERNS.COMMERCIAL_STONE, factory: createCommercialStonePatternCanvas },
      { alias: 'pattern-brick', target: REALISTIC_BUILDING_PATTERNS.VILLA_BRICK, factory: createVillaBrickPatternCanvas },
      { alias: 'facade-residential', target: REALISTIC_BUILDING_PATTERNS.VILLA_BRICK, factory: createVillaBrickPatternCanvas },
    ];

    for (const { alias, factory } of legacyAliases) {
      if (!map.hasImage(alias)) {
        const cvs = factory(128);
        const ctx = cvs.getContext('2d');
        if (ctx) {
          map.addImage(alias, ctx.getImageData(0, 0, 128, 128));
        }
      }
    }
  } catch (err) {
    console.warn('[realisticBuildingPatterns] Failed to register patterns to map:', err);
  }
}
