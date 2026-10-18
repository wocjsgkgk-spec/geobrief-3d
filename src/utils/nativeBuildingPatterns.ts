import type maplibregl from 'maplibre-gl';

/**
 * [1. 고해상도 한국형 창문·베란다 심리스 패턴 생성 및 등록 엔진]
 * - MapLibre 네이티브 GPU fill-extrusion-pattern 렌더링을 위한 64x64 심리스 건축 텍스처
 * - 지도가 로드될 때 단 1회만 Canvas로 생성 후 map.addImage()에 등록
 */

export const NATIVE_BUILDING_PATTERNS = {
  APT: 'pattern-apt',
  OFFICE: 'pattern-office',
  BRICK: 'pattern-brick',
} as const;

/**
 * 1) 한국 아파트 전용 창문·베란다 심리스 패턴 (pattern-apt)
 * - 밝은 크림 아이보리(#f4f1ea) 외벽
 * - 다크 슬레이트(#334155) 베란다 유리창 격자
 * - 층간 슬래브 가로 홈(#94a3b8) 및 세대별 발코니 난간(#cbd5e1)
 */
export function createApartmentPatternCanvas(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 외벽 베이스: 밝은 크림 아이보리 (#f4f1ea)
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, size, size);

  const floorCount = 4;
  const floorH = size / floorCount; // 16px per floor
  const bayCount = 4;
  const bayW = size / bayCount;     // 16px per bay

  for (let f = 0; f < floorCount; f++) {
    const y0 = f * floorH;

    // 1. 층간 콘크리트 슬래브 가로 홈 (Slab groove)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, y0, size, 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, y0 + 1, size, 1);

    // 2. 세대별 베란다 창호 배치
    for (let b = 0; b < bayCount; b++) {
      const x0 = b * bayW;

      // 기둥 벽면 제외 창문 영역
      const winX = x0 + 2;
      const winY = y0 + 3;
      const winW = bayW - 4; // 12px
      const winH = floorH - 4; // 12px

      // 다크 그레이 섀시 외곽 프레임
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(winX, winY, winW, winH);

      // 다크 슬레이트 베란다 유리창 (#334155)
      ctx.fillStyle = '#334155';
      ctx.fillRect(winX + 1, winY + 1, winW - 2, winH - 2);

      // 상부 트랜섬/유리 반사 하이라이트 (#475569)
      ctx.fillStyle = '#475569';
      ctx.fillRect(winX + 1, winY + 1, winW - 2, 3);

      // 창문 중앙 수직 창살 (Mullion bar)
      const midX = Math.floor(winX + winW / 2);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(midX, winY + 1, 1, winH - 2);

      // 하부 알루미늄 발코니 안전 난간 (Railing)
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(winX + 1, winY + winH - 4, winW - 2, 1);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(winX + 1, winY + winH - 2, winW - 2, 1);
    }
  }

  // 우측 모서리 패널 수직 조인트 줄눈
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(size - 1, 0, 1, size);

  return canvas;
}

/**
 * 2) 상업/오피스 빌딩 반사 유리 & 알루미늄 커튼월 패턴 (pattern-office)
 * - 스카이 블루/그레이 반사 유리(#94a3b8 ~ #1e293b)
 * - 정밀 알루미늄 창틀 프레임(#cbd5e1 / #475569)
 */
export function createOfficePatternCanvas(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 기본 알루미늄 프레임 배경 (#334155)
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, size, size);

  const rowCount = 4;
  const colCount = 4;
  const cellH = size / rowCount;
  const cellW = size / colCount;

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const x = c * cellW;
      const y = r * cellH;

      // 유리창 영역
      const gx = x + 1;
      const gy = y + 1;
      const gw = cellW - 2;
      const gh = cellH - 2;

      // 반사 유리 그라디언트 (스카이블루/그레이 #94a3b8 -> #1e293b)
      const grad = ctx.createLinearGradient(gx, gy, gx, gy + gh);
      grad.addColorStop(0, '#94a3b8');
      grad.addColorStop(0.35, '#64748b');
      grad.addColorStop(0.7, '#334155');
      grad.addColorStop(1, '#1e293b');

      ctx.fillStyle = grad;
      ctx.fillRect(gx, gy, gw, gh);

      // 커튼월 스카이 반사광 터치 (#38bdf8 / 반투명 스카이블루)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.fillRect(gx, gy, gw, 3);

      // 하부 스팬드럴 글래스 바 (#0f172a)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(gx, gy + gh - 3, gw, 3);

      // 미세 알루미늄 모서리 하이라이트 (#cbd5e1)
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(gx, gy, gw, 1);
      ctx.fillRect(gx, gy, 1, gh);
    }
  }

  return canvas;
}

/**
 * 3) 적벽돌 및 밝은 베이지 다세대/주택 외벽 패턴 (pattern-brick)
 * - 적벽돌 텍스처(#9a3412, #b91c1c, #7c2d12)
 * - 미세 모르타르 줄눈(#e2e8f0)
 * - 주택 창호 및 화강석 창대(#ffffff, #334155)
 */
export function createBrickPatternCanvas(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 모르타르 줄눈 배경 (#e2e8f0)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, size);

  // 8개 벽돌 레이어 (8px 높이)
  const brickH = 7;
  const rowH = 8;
  const brickColors = ['#9a3412', '#b91c1c', '#7c2d12', '#c2410c', '#a16207'];

  for (let r = 0; r < size / rowH; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const offset = isOdd ? 8 : 0;
    const brickW = 14;
    const stride = 16;

    for (let x = -16 + offset; x < size + 16; x += stride) {
      const colorIdx = Math.abs(Math.floor((x * 7 + r * 13) % brickColors.length));
      ctx.fillStyle = brickColors[colorIdx];
      ctx.fillRect(x, y, brickW, brickH);
    }
  }

  // 주택 창문 2개 삽입 (상단 좌/우)
  const windows = [
    { x: 10, y: 10, w: 14, h: 18 },
    { x: 40, y: 38, w: 14, h: 18 },
  ];

  for (const win of windows) {
    // 화강석 창대 (Window sill)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(win.x - 1, win.y - 1, win.w + 2, win.h + 3);

    // 창틀 (#1e293b)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(win.x, win.y, win.w, win.h);

    // 창문 유리 (#334155)
    ctx.fillStyle = '#334155';
    ctx.fillRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);

    // 유리 반사광 (#64748b)
    ctx.fillStyle = '#64748b';
    ctx.fillRect(win.x + 1, win.y + 1, win.w - 2, 4);

    // 창살 십자선 (#cbd5e1)
    const midX = win.x + Math.floor(win.w / 2);
    const midY = win.y + Math.floor(win.h / 2);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(midX, win.y + 1, 1, win.h - 2);
    ctx.fillRect(win.x + 1, midY, win.w - 2, 1);
  }

  return canvas;
}

/**
 * MapLibre 맵 인스턴스에 64x64 심리스 건축 패턴 이미지 일괄 등록
 */
export function registerNativeBuildingPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  try {
    // 1) 한국 아파트 전용 패턴
    if (!map.hasImage(NATIVE_BUILDING_PATTERNS.APT)) {
      const aptCanvas = createApartmentPatternCanvas(64);
      const ctx = aptCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, 64, 64);
        map.addImage(NATIVE_BUILDING_PATTERNS.APT, imgData);
        // 하위 호환 별칭 등록
        if (!map.hasImage('facade-apartment')) {
          map.addImage('facade-apartment', imgData);
        }
      }
    }

    // 2) 상업/오피스 빌딩 패턴
    if (!map.hasImage(NATIVE_BUILDING_PATTERNS.OFFICE)) {
      const officeCanvas = createOfficePatternCanvas(64);
      const ctx = officeCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, 64, 64);
        map.addImage(NATIVE_BUILDING_PATTERNS.OFFICE, imgData);
        // 하위 호환 별칭 등록
        if (!map.hasImage('facade-commercial')) {
          map.addImage('facade-commercial', imgData);
        }
      }
    }

    // 3) 적벽돌 및 주택 패턴
    if (!map.hasImage(NATIVE_BUILDING_PATTERNS.BRICK)) {
      const brickCanvas = createBrickPatternCanvas(64);
      const ctx = brickCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, 64, 64);
        map.addImage(NATIVE_BUILDING_PATTERNS.BRICK, imgData);
        // 하위 호환 별칭 등록
        if (!map.hasImage('facade-residential')) {
          map.addImage('facade-residential', imgData);
        }
      }
    }
  } catch (err) {
    console.warn('[nativeBuildingPatterns] Failed to register pattern images:', err);
  }
}
