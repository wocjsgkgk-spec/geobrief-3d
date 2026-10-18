/**
 * utils/vworldStyleAtlas.ts
 *
 * [GeoBrief 3D 1단계: 24종 실사풍 건축 다양성(Photorealistic Variation) 텍스처 아틀라스]
 *
 * - 2048x2048 크기의 고해상도 Canvas 아틀라스 (6열 x 4행 = 24 슬롯)
 * - Three.js CanvasTexture (anisotropy: 16, mipmaps: true, RepeatWrapping, SRGB) 바인딩
 *
 * [24종 슬롯 구성]:
 *  0: apt_warm_cream       - 아파트 Type A (웜 크림 베이지 #ebe6dc + 브라운 하단 + 비대칭 창호)
 *  1: apt_modern_gray      - 아파트 Type B (모던 웜 그레이 #dcdcdc + 테라코타/네이비 포인트 + 수직 핀)
 *  2: apt_ivory_white      - 아파트 Type C (아이보리 화이트 #f3f1ed + 유리 난간형 발코니 + 긴 계단실 창호)
 *  3: apt_glass_stone      - 아파트 Type D (주상복합 쿨 그레이/블루 반사 유리 + 화강석 프레임)
 *  4: apt_side             - 아파트 측벽 (콘크리트 외벽 + 브랜드 수직 컬러 밴드 + 동 번호 스텐실)
 *  5: comm_granite_beige   - 상가 Type A (화강석 베이지 석재 타일 + 리본 윈도우 + 줄눈)
 *  6: comm_dark_metal      - 상가 Type B (다크 그레이 모던 메탈 빌딩 #334155 + 틴티드 글래스)
 *  7: comm_red_brick       - 상가 Type C (붉은 치장벽돌 상가 #9a3412 + 화강석 창대/코너석)
 *  8: comm_curtainwall     - 상가 Type D (통유리 오피스 커튼월, 하늘빛 반사 그라데이션)
 *  9: comm_ground_shop     - 1층 상가 쇼윈도 + 컬러 간판 띠장 + 자동문
 * 10: villa_red_brick      - 주택 Type A (적벽돌 #8b3a2b 다세대 빌라 + 백색 PVC 이중창)
 * 11: villa_granite        - 주택 Type B (밝은 사비석 화강석 빌라 + 석재 창대)
 * 12: house_cream          - 주택 Type C (크림색 단독주택 + 덧창/우드 악센트)
 * 13: facility_panel       - 시설 Type D (샌드위치 패널 실버/청색 창고·공장)
 * 14: roof_concrete_warmgray - 지붕 30% (노후 콘크리트 슬래브 웜 그레이 #78716c)
 * 15: roof_asphalt_charcoal  - 지붕 25% (어두운 아스팔트 슁글 / 차콜 그레이 #334155)
 * 16: roof_terracotta_tile   - 지붕 20% (적갈색 기와 / 브라운 박공 #6b2d1f)
 * 17: roof_urethane_sage     - 지붕 15% (물 빠진 저채도 우레탄 세이지 그린 #3b5249)
 * 18: roof_zinc_blue         - 지붕 10% (청회색 징크 / 네이비 강판 지붕 #2c4257)
 * 19: penthouse_wall       - 옥탑 권상기실 외벽 Type 1 (콘크리트 + 철문 + 루버)
 * 20: penthouse_metal      - 옥탑 권상기실 외벽 Type 2 (다크 메탈 패널)
 * 21: parapet_concrete     - 옥상 난간 (회백색 콘크리트 + 두겁석)
 * 22: parapet_dark         - 옥상 난간 (다크 스톤 코핑)
 * 23: public_military      - 군 막사 / 공공청사 단정한 아이보리 외벽
 */

import * as THREE from 'three';

export const VWORLD_ATLAS_SIZE = 2048;
export const VWORLD_COLS = 6;
export const VWORLD_ROWS = 4;
export const VWORLD_SLOTS_TOTAL = 24;
export const VWORLD_CELL_W = Math.floor(VWORLD_ATLAS_SIZE / VWORLD_COLS); // 341.33px
export const VWORLD_CELL_H = Math.floor(VWORLD_ATLAS_SIZE / VWORLD_ROWS); // 512px

export const VWORLD_SLOT_NAME_TO_ID: Record<string, number> = {
  apt_warm_cream: 0,
  apt_modern_gray: 1,
  apt_ivory_white: 2,
  apt_glass_stone: 3,
  apt_side: 4,
  comm_granite_beige: 5,
  comm_dark_metal: 6,
  comm_red_brick: 7,
  comm_curtainwall: 8,
  comm_ground_shop: 9,
  villa_red_brick: 10,
  villa_granite: 11,
  house_cream: 12,
  facility_panel: 13,
  roof_concrete_warmgray: 14,
  roof_asphalt_charcoal: 15,
  roof_terracotta_tile: 16,
  roof_urethane_sage: 17,
  roof_zinc_blue: 18,
  penthouse_wall: 19,
  penthouse_metal: 20,
  parapet_concrete: 21,
  parapet_dark: 22,
  public_military: 23,
};

// 하위 호환 별칭
export const VWORLD_LEGACY_ALIAS: Record<string, number> = {
  apt_front: 0,
  commercial_mid: 5,
  commercial_ground: 9,
  villa_residential: 10,
  roof_urethane: 17,
  roof_concrete: 14,
  roof_gable_brick: 16,
  roof_gable_blue: 18,
};

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * 아틀라스 슬롯 UV 반환 (Three.js flipY = true 기준)
 */
export function getVWorldAtlasSlotUV(slot: number | string): UVRect {
  let id = 0;
  if (typeof slot === 'number') {
    id = slot;
  } else if (slot in VWORLD_SLOT_NAME_TO_ID) {
    id = VWORLD_SLOT_NAME_TO_ID[slot];
  } else if (slot in VWORLD_LEGACY_ALIAS) {
    id = VWORLD_LEGACY_ALIAS[slot];
  }
  id = Math.max(0, Math.min(23, Math.floor(id)));
  const col = id % 6;
  const row = Math.floor(id / 6);
  const u0 = col / 6.0;
  const u1 = (col + 1) / 6.0;
  const v1 = 1.0 - row / 4.0;
  const v0 = 1.0 - (row + 1) / 4.0;
  return { u0, v0, u1, v1 };
}

// =============================================================================
// 실사풍 Canvas 아틀라스 렌더링 드로잉 함수군 (24종)
// =============================================================================

function addWeatheringNoise(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.05) {
  ctx.save();
  ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
  for (let py = y; py < y + h; py += 12) {
    for (let px = x; px < x + w; px += 16) {
      if ((px + py) % 7 === 0) {
        ctx.fillRect(px, py, 3, 2);
      }
    }
  }
  ctx.restore();
}

/**
 * Slot 0: 아파트 Type A (웜 크림 베이지 #ebe6dc + 브라운 하단 + 비대칭 베란다)
 */
function drawAptWarmCream(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#ebe6dc';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브
  ctx.fillStyle = '#d6cebe';
  ctx.fillRect(x, y, w, 22);
  ctx.fillStyle = '#b8ad9c';
  ctx.fillRect(x, y + 20, w, 3);

  // 슬래브 하단 드롭 섀도우
  const shadow = ctx.createLinearGradient(x, y + 22, x, y + 50);
  shadow.addColorStop(0, 'rgba(30, 20, 10, 0.40)');
  shadow.addColorStop(1, 'rgba(30, 20, 10, 0.0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + 22, w, 28);

  // 하단 25% 웜 브라운 투톤 도색
  const lowerH = Math.round(h * 0.28);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#6e5a4e';
  ctx.fillRect(x, lowerY, w, lowerH);
  ctx.fillStyle = '#4a3b33';
  ctx.fillRect(x, lowerY - 3, w, 3);

  // 비대칭 베란다 창호 (거실 광폭창 62% + 침실 소폭창 38%)
  const marginX = 18;
  const availW = w - marginX * 2;
  const winY = y + 36;
  const winH = Math.round(h * 0.52);

  // 거실창
  const livW = Math.round(availW * 0.60);
  const livX = x + marginX;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(livX - 2, winY - 2, livW + 4, winH + 4);

  const glassGrad = ctx.createLinearGradient(livX, winY, livX, winY + winH);
  glassGrad.addColorStop(0, '#60a5fa');
  glassGrad.addColorStop(0.3, '#1d4ed8');
  glassGrad.addColorStop(0.8, '#0f172a');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(livX, winY, livW, winH);

  // 블라인드 비침
  ctx.fillStyle = 'rgba(254, 243, 199, 0.26)';
  ctx.fillRect(livX + 4, winY + 4, livW - 8, winH * 0.5);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (let by = winY + 6; by < winY + winH * 0.5; by += 6) {
    ctx.fillRect(livX + 4, by, livW - 8, 1.5);
  }

  // 침실창
  const bedX = livX + livW + 10;
  const bedW = availW - livW - 10;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(bedX - 2, winY - 2, bedW + 4, winH + 4);
  ctx.fillStyle = glassGrad;
  ctx.fillRect(bedX, winY, bedW, winH);

  // 발코니 난간 살대
  const railY = winY + winH + 6;
  const railH = lowerY - railY - 6;
  if (railH > 8) {
    ctx.fillStyle = '#ebe6dc';
    ctx.fillRect(livX, railY, availW, railH);
    ctx.fillStyle = '#475569';
    ctx.fillRect(livX, railY, availW, 3);
    for (let rx = livX + 6; rx < livX + availW - 6; rx += 14) {
      ctx.fillRect(rx, railY + 3, 2, railH - 3);
    }
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 1: 아파트 Type B (모던 웜 그레이 #dcdcdc + 테라코타/네이비 포인트 + 수직 핀)
 */
function drawAptModernGray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(x, y, w, h);

  // 수직 콘크리트 핀 (Fin Pillar, 양단 10% 돌출)
  const finW = Math.round(w * 0.08);
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(x, y, finW, h);
  ctx.fillRect(x + w - finW, y, finW, h);

  // 테라코타 & 네이비 수직 라인 도색
  ctx.fillStyle = '#993d24'; // 테라코타
  ctx.fillRect(x + finW, y, 10, h);
  ctx.fillStyle = '#1e3a8a'; // 네이비
  ctx.fillRect(x + finW + 10, y, 6, h);

  // 층간 슬래브
  ctx.fillStyle = '#c4c4c4';
  ctx.fillRect(x + finW, y, w - finW * 2, 18);

  // 3분할 모던 베란다 창호
  const winX = x + finW + 24;
  const winW = w - finW * 2 - 32;
  const winY = y + 32;
  const winH = Math.round(h * 0.58);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);

  const glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  glassGrad.addColorStop(0, '#93c5fd');
  glassGrad.addColorStop(0.35, '#2563eb');
  glassGrad.addColorStop(1, '#020617');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 모던 화이트 멀리언
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(winX + winW * 0.33, winY, 3, winH);
  ctx.fillRect(winX + winW * 0.66, winY, 3, winH);

  // 실외기 에어컨 루버
  const acW = Math.round(winW * 0.28);
  const acH = 42;
  const acX = winX + winW - acW - 4;
  const acY = winY + winH - acH - 4;
  ctx.fillStyle = '#334155';
  ctx.fillRect(acX, acY, acW, acH);
  ctx.fillStyle = '#94a3b8';
  for (let ly = acY + 3; ly < acY + acH - 3; ly += 6) {
    ctx.fillRect(acX + 2, ly, acW - 4, 2);
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 2: 아파트 Type C (아이보리 화이트 #f3f1ed + 유리 난간형 발코니 + 긴 계단실 창호)
 */
function drawAptIvoryWhite(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#f3f1ed';
  ctx.fillRect(x, y, w, h);

  // 계단실 수직 긴 창문 라인 (좌측 22% 구간)
  const stairW = Math.round(w * 0.22);
  ctx.fillStyle = '#e5e0d8';
  ctx.fillRect(x, y, stairW, h);

  const stairWinX = x + Math.round(stairW * 0.25);
  const stairWinW = Math.round(stairW * 0.50);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(stairWinX - 2, y + 10, stairWinW + 4, h - 20);

  const stairGlass = ctx.createLinearGradient(stairWinX, y, stairWinX, y + h);
  stairGlass.addColorStop(0, '#38bdf8');
  stairGlass.addColorStop(0.5, '#0284c7');
  stairGlass.addColorStop(1, '#090d16');
  ctx.fillStyle = stairGlass;
  ctx.fillRect(stairWinX, y + 12, stairWinW, h - 24);

  // 본동 거실 유리 난간형 발코니
  const winX = x + stairW + 16;
  const winW = w - stairW - 32;
  const winY = y + 28;
  const winH = Math.round(h * 0.52);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);

  const gGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  gGrad.addColorStop(0, '#7dd3fc');
  gGrad.addColorStop(0.3, '#0284c7');
  gGrad.addColorStop(1, '#020617');
  ctx.fillStyle = gGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 유리 난간 (Cyan Tinted Glass)
  const balcY = winY + winH + 6;
  const balcH = Math.round(h * 0.26);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.fillRect(winX, balcY, winW, balcH);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(winX, balcY, winW, 3); // 상부 핸드레일

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 3: 아파트 Type D (주상복합 쿨 그레이/블루 반사 유리 + 화강석 프레임)
 */
function drawAptGlassStone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // 중후한 화강석 프레임 (#334155 / #475569)
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, w, h);

  // 통창 글래스 영역
  const margin = 14;
  const winX = x + margin;
  const winY = y + margin;
  const winW = w - margin * 2;
  const winH = h - margin * 2;

  const glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  glassGrad.addColorStop(0, '#93c5fd');
  glassGrad.addColorStop(0.2, '#38bdf8');
  glassGrad.addColorStop(0.6, '#0f172a');
  glassGrad.addColorStop(1, '#020617');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 알루미늄 커튼월 수직/수평 격자
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(winX + winW * 0.33, winY, 2.5, winH);
  ctx.fillRect(winX + winW * 0.66, winY, 2.5, winH);
  ctx.fillRect(winX, winY + winH * 0.5, winW, 2.5);

  // 내부 프리미엄 롤스크린
  ctx.fillStyle = 'rgba(254, 243, 199, 0.22)';
  ctx.fillRect(winX + 4, winY + 4, winW * 0.33 - 6, winH * 0.4);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 4: 아파트 측벽 (apt_side)
 */
function drawAptSide(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, w, h);

  // 수직 코어 조인트 줄눈
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + w * 0.33, y, 2, h);
  ctx.fillRect(x + w * 0.66, y, 2, h);

  // 브랜드 컬러 수직 밴드 (네이비 & 웜브라운)
  const stripeW = w * 0.30;
  const stripeX = x + w * 0.12;

  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(stripeX, y, stripeW, h);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(stripeX + stripeW, y, 18, h);
  ctx.fillStyle = '#334155';
  ctx.fillRect(stripeX - 6, y, 6, h);

  // 동 번호 스텐실 타이포그래피 ("101")
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.font = `900 ${Math.round(w * 0.22)}px "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101', stripeX + stripeW * 0.5, y + h * 0.38);

  ctx.font = `bold ${Math.round(w * 0.05)}px "Arial", sans-serif`;
  ctx.fillText('GEOBRIEF', stripeX + stripeW * 0.5, y + h * 0.50);
  ctx.restore();

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 5: 상가 Type A (화강석 베이지 석재 타일 + 리본 윈도우 + 줄눈)
 */
function drawCommGraniteBeige(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(x, y, w, h);

  // 석재 조적 줄눈
  ctx.fillStyle = '#a8a29e';
  for (let px = x; px < x + w; px += 48) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 36) ctx.fillRect(x, py, w, 1.5);

  // 가로형 연속 대형 알루미늄 통유리창
  const winTop = y + h * 0.22;
  const winH = h * 0.54;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, winTop - 2, w, winH + 4);

  const winGrad = ctx.createLinearGradient(x, winTop, x, winTop + winH);
  winGrad.addColorStop(0, '#bae6fd');
  winGrad.addColorStop(0.3, '#38bdf8');
  winGrad.addColorStop(0.7, '#0284c7');
  winGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = winGrad;
  ctx.fillRect(x, winTop, w, winH);

  // 멀리언
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + w * 0.5 - 1.5, winTop, 3, winH);
  ctx.fillRect(x + w * 0.25 - 1.5, winTop, 3, winH);
  ctx.fillRect(x + w * 0.75 - 1.5, winTop, 3, winH);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 6: 상가 Type B (다크 그레이 모던 메탈 빌딩 #334155 + 틴티드 글래스)
 */
function drawCommDarkMetal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, w, h);

  // 수직 메탈 패널 핀 (#475569)
  for (let px = x; px < x + w; px += 24) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(px, y, 18, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 18, y, 6, h);
  }

  // 다크 틴티드 브론즈 글래스
  const winY = y + h * 0.18;
  const winH = h * 0.62;
  const winW = w * 0.84;
  const winX = x + (w - winW) * 0.5;

  ctx.fillStyle = '#020617';
  ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);

  const glass = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  glass.addColorStop(0, '#38bdf8');
  glassGlass: glass.addColorStop(0.4, '#1e293b');
  glass.addColorStop(1, '#020617');
  ctx.fillStyle = glass;
  ctx.fillRect(winX, winY, winW, winH);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 7: 상가 Type C (붉은 치장벽돌 상가 #9a3412 + 화강석 창대/코너석)
 */
function drawCommRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(x, y, w, h);

  // 벽돌 조적 텍스처
  for (let py = y; py < y + h; py += 12) {
    ctx.fillStyle = 'rgba(69, 26, 3, 0.45)';
    ctx.fillRect(x, py, w, 1.5);
  }

  // 화강석 코너석 (Quoin stones, 양단)
  const qW = 20;
  ctx.fillStyle = '#e2e8f0';
  for (let py = y; py < y + h; py += 32) {
    ctx.fillRect(x, py, qW, 24);
    ctx.fillRect(x + w - qW, py, qW, 24);
  }

  // 아치형/사각 클래식 상가 창문 2열
  const winW = Math.round(w * 0.32);
  const winH = Math.round(h * 0.48);
  const winY = y + h * 0.25;

  const w1X = x + qW + 12;
  const w2X = x + w - qW - winW - 12;

  for (const wx of [w1X, w2X]) {
    // 화강석 창틀
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(wx - 4, winY - 4, winW + 8, winH + 8);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(wx, winY, winW, winH);

    const wg = ctx.createLinearGradient(wx, winY, wx, winY + winH);
    wg.addColorStop(0, '#7dd3fc');
    wg.addColorStop(0.5, '#0284c7');
    wg.addColorStop(1, '#020617');
    ctx.fillStyle = wg;
    ctx.fillRect(wx + 2, winY + 2, winW - 4, winH - 4);
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 8: 상가 Type D (통유리 오피스 커튼월, 하늘빛 반사)
 */
function drawCommCurtainwall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const skyGrad = ctx.createLinearGradient(x, y, x, y + h);
  skyGrad.addColorStop(0, '#bae6fd');
  skyGrad.addColorStop(0.25, '#38bdf8');
  skyGrad.addColorStop(0.65, '#0369a1');
  skyGrad.addColorStop(1, '#082f49');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(x, y, w, h);

  // 알루미늄 슬림 그리드 멀리언
  ctx.fillStyle = '#e2e8f0';
  for (let px = x; px < x + w; px += 40) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 32) ctx.fillRect(x, py, w, 1.5);

  // 하부 스팬드럴 글래스 바
  for (let py = y + 26; py < y + h; py += 32) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fillRect(x, py, w, 6);
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 9: 1층 상가 쇼윈도 + 컬러 간판 띠장 + 자동문 (comm_ground_shop)
 */
function drawCommGroundShop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, w, h);

  // 간판 띠장
  const signH = Math.round(h * 0.28);
  const signY = y + 14;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 4, signY - 2, w - 8, signH + 4);

  const signGrad = ctx.createLinearGradient(x, signY, x + w, signY);
  signGrad.addColorStop(0, '#047857');
  signGrad.addColorStop(0.5, '#c2410c');
  signGrad.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = signGrad;
  ctx.fillRect(x + 6, signY, w - 12, signH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STORE • MART • CAFE', x + w * 0.5, signY + signH * 0.5);

  // 쇼윈도
  const shopY = signY + signH + 10;
  const shopH = h - shopY - 14;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 6, shopY, w - 12, shopH);

  const shopGrad = ctx.createLinearGradient(x, shopY, x, shopY + shopH);
  shopGrad.addColorStop(0, '#7dd3fc');
  shopGrad.addColorStop(0.3, '#1e293b');
  shopGrad.addColorStop(1, '#020617');
  ctx.fillStyle = shopGrad;
  ctx.fillRect(x + 8, shopY + 2, w - 16, shopH - 4);

  // 자동문
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + w * 0.5 - 20, shopY + 2, 40, shopH - 4);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + w * 0.5 - 17, shopY + 6, 34, shopH - 12);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 10: 주택 Type A (적벽돌 #8b3a2b 다세대 빌라 + 백색 PVC 이중창)
 */
function drawVillaRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#8b3a2b';
  ctx.fillRect(x, y, w, h);

  // 상단 25% 화강석 투톤 마감
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(x, y, w, h * 0.22);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(x, y + h * 0.22 - 3, w, 3);

  // 적벽돌 조적
  for (let py = y + h * 0.22; py < y + h; py += 12) {
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x, py, w, 1.5);
  }

  // 백색 창틀 + 소형 이중창
  const winW = w * 0.62;
  const winX = x + (w - winW) * 0.5;
  const winY = y + h * 0.36;
  const winH = h * 0.46;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(winX - 4, winY - 4, winW + 8, winH + 8);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX, winY, winW, winH);

  const vg = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  vg.addColorStop(0, '#7dd3fc');
  vg.addColorStop(0.5, '#0284c7');
  vg.addColorStop(1, '#0f172a');
  ctx.fillStyle = vg;
  ctx.fillRect(winX + 2, winY + 2, winW - 4, winH - 4);

  // 십자 창살
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(winX + winW * 0.5 - 1.5, winY, 3, winH);
  ctx.fillRect(winX, winY + winH * 0.45 - 1.5, winW, 3);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 11: 주택 Type B (밝은 사비석 화강석 빌라 + 석재 창대)
 */
function drawVillaGranite(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#e8dfcf'; // 사비석 옐로우 베이지
  ctx.fillRect(x, y, w, h);

  // 석재 타일 조적선
  ctx.fillStyle = '#c5ba9d';
  for (let px = x; px < x + w; px += 44) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 32) ctx.fillRect(x, py, w, 1.5);

  // 다크 그레이 창틀 2열
  const winW = Math.round(w * 0.34);
  const winH = Math.round(h * 0.48);
  const winY = y + h * 0.28;

  for (const wx of [x + 24, x + w - winW - 24]) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(wx - 3, winY - 3, winW + 6, winH + 6);

    const vg = ctx.createLinearGradient(wx, winY, wx, winY + winH);
    vg.addColorStop(0, '#93c5fd');
    vg.addColorStop(0.4, '#1e293b');
    vg.addColorStop(1, '#020617');
    ctx.fillStyle = vg;
    ctx.fillRect(wx, winY, winW, winH);
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 12: 주택 Type C (크림색 단독주택 + 덧창/우드 악센트)
 */
function drawHouseCream(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#fdf4dc'; // 크림 스타코
  ctx.fillRect(x, y, w, h);

  // 하단 그레이 석재 기단
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y + h - 28, w, 28);

  // 우드 톤 창문 덧창 (#78350f)
  const winW = Math.round(w * 0.48);
  const winH = Math.round(h * 0.44);
  const winX = x + (w - winW) * 0.5;
  const winY = y + h * 0.26;

  // 좌우 목재 덧창
  ctx.fillStyle = '#78350f';
  ctx.fillRect(winX - 18, winY, 14, winH);
  ctx.fillRect(winX + winW + 4, winY, 14, winH);

  // 중앙 창문
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX, winY, winW, winH);
  const wg = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  wg.addColorStop(0, '#bae6fd');
  wg.addColorStop(0.5, '#0284c7');
  wg.addColorStop(1, '#0f172a');
  ctx.fillStyle = wg;
  ctx.fillRect(winX + 2, winY + 2, winW - 4, winH - 4);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 13: 시설 Type D (샌드위치 패널 실버/청색 창고·공장)
 */
function drawFacilityPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#94a3b8'; // 실버 메탈
  ctx.fillRect(x, y, w, h);

  // 수직 골판 리브 (Ribbed Profile)
  for (let px = x; px < x + w; px += 18) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(px, y, 10, h);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(px + 10, y, 8, h);
  }

  // 공장/창고 상단 블루 밴드 (#1e3a8a)
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(x, y, w, 28);

  // 산업용 수평 밴드 창문
  const winY = y + h * 0.40;
  const winH = Math.round(h * 0.24);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 16, winY, w - 32, winH);

  const glass = ctx.createLinearGradient(x, winY, x, winY + winH);
  glass.addColorStop(0, '#38bdf8');
  glass.addColorStop(0.6, '#0f172a');
  ctx.fillStyle = glass;
  ctx.fillRect(x + 18, winY + 2, w - 36, winH - 4);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 14: 지붕 30% (노후 콘크리트 슬래브 웜 그레이 #78716c ~ #57534e)
 */
function drawRoofConcreteWarmGray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const roofGrad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, 30, x + w * 0.5, y + h * 0.5, w * 0.65);
  roofGrad.addColorStop(0, '#78716c');
  roofGrad.addColorStop(0.5, '#655e58');
  roofGrad.addColorStop(1, '#57534e');
  ctx.fillStyle = roofGrad;
  ctx.fillRect(x, y, w, h);

  // 슬래브 팽창 줄눈 (Grid joints)
  ctx.fillStyle = 'rgba(28, 25, 23, 0.45)';
  for (let px = x; px < x + w; px += 48) ctx.fillRect(px, y, 2, h);
  for (let py = y; py < y + h; py += 48) ctx.fillRect(x, py, w, 2);

  // 우수 배수구
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(x + 36, y + 36, 12, 0, Math.PI * 2);
  ctx.fill();

  addWeatheringNoise(ctx, x, y, w, h, 0.08);
}

/**
 * Slot 15: 지붕 25% (어두운 아스팔트 슁글 / 차콜 그레이 #334155 ~ #1e293b)
 */
function drawRoofAsphaltCharcoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, w, h);

  // 아스팔트 슁글 패턴
  let row = 0;
  for (let py = y; py < y + h; py += 16) {
    const shift = (row % 2) * 20;
    for (let px = x - 20 + shift; px < x + w; px += 40) {
      ctx.fillStyle = (row + px) % 3 === 0 ? '#334155' : '#1e293b';
      ctx.fillRect(px, py, 38, 14);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px, py + 14, 38, 2);
    }
    row++;
  }

  addWeatheringNoise(ctx, x, y, w, h, 0.06);
}

/**
 * Slot 16: 지붕 20% (적갈색 기와 / 브라운 박공 #6b2d1f ~ #78350f)
 */
function drawRoofTerracottaTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#6b2d1f';
  ctx.fillRect(x, y, w, h);

  // 한국형 곡선 기와 가로 골
  for (let py = y; py < y + h; py += 18) {
    ctx.fillStyle = '#853726';
    ctx.fillRect(x, py, w, 12);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x, py + 12, w, 6);
  }

  addWeatheringNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 17: 지붕 15% (물 빠진 저채도 우레탄 세이지 그린 #3b5249 - 쨍한 초록색 배제)
 */
function drawRoofUrethaneSage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const roofGrad = ctx.createRadialGradient(x + w * 0.45, y + h * 0.45, 30, x + w * 0.5, y + h * 0.5, w * 0.7);
  roofGrad.addColorStop(0, '#4a6b5e');
  roofGrad.addColorStop(0.4, '#3b5249');
  roofGrad.addColorStop(0.8, '#2d3f38');
  roofGrad.addColorStop(1, '#22302b');
  ctx.fillStyle = roofGrad;
  ctx.fillRect(x, y, w, h);

  // 난간 테두리 연석 (#64748b)
  const borderW = 18;
  ctx.fillStyle = '#57534e';
  ctx.fillRect(x, y, w, borderW);
  ctx.fillRect(x, y + h - borderW, w, borderW);
  ctx.fillRect(x, y, borderW, h);
  ctx.fillRect(x + w - borderW, y, borderW, h);

  // 배수구
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(x + borderW + 24, y + borderW + 24, 10, 0, Math.PI * 2);
  ctx.fill();

  addWeatheringNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 18: 지붕 10% (청회색 징크 / 네이비 강판 지붕 #2c4257)
 */
function drawRoofZincBlue(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#2c4257';
  ctx.fillRect(x, y, w, h);

  // 돌출 이음 징크 리브 (Standing seam)
  for (let px = x; px < x + w; px += 20) {
    ctx.fillStyle = '#476580';
    ctx.fillRect(px, y, 2.5, h);
    ctx.fillStyle = '#172533';
    ctx.fillRect(px + 2.5, y, 3.5, h);
  }

  addWeatheringNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 19: 옥탑 권상기실 외벽 Type 1 (콘크리트 + 철문 + 루버)
 */
function drawPenthouseWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, w, h);

  // 철제 출입문
  const doorW = Math.round(w * 0.32);
  const doorH = Math.round(h * 0.55);
  const doorX = x + Math.round(w * 0.16);
  const doorY = y + h - doorH - 20;

  ctx.fillStyle = '#334155';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(doorX + 3, doorY + 3, doorW - 6, doorH - 6);

  // 루버 그릴
  const luvX = x + Math.round(w * 0.58);
  const luvY = y + Math.round(h * 0.32);
  const luvW = Math.round(w * 0.30);
  const luvH = Math.round(h * 0.32);
  ctx.fillStyle = '#334155';
  ctx.fillRect(luvX, luvY, luvW, luvH);
  ctx.fillStyle = '#94a3b8';
  for (let ly = luvY + 4; ly < luvY + luvH - 4; ly += 6) {
    ctx.fillRect(luvX + 2, ly, luvW - 4, 2);
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 20: 옥탑 권상기실 외벽 Type 2 (다크 메탈 패널)
 */
function drawPenthouseMetal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, h);

  // 메탈 패널 라인
  ctx.fillStyle = '#1e293b';
  for (let px = x; px < x + w; px += 36) ctx.fillRect(px, y, 2, h);
  for (let py = y; py < y + h; py += 36) ctx.fillRect(x, py, w, 2);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 21: 옥상 난간 (회백색 콘크리트 + 두겁석)
 */
function drawParapetConcrete(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y, w, h);

  // 두겁석 코핑
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y, w, 28);
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y + 26, w, 3);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 22: 옥상 난간 (다크 스톤 코핑)
 */
function drawParapetDark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, w, h);

  // 다크 징크 코핑
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, w, 32);

  addWeatheringNoise(ctx, x, y, w, h);
}

/**
 * Slot 23: 군 막사 / 공공청사 단정한 아이보리 외벽
 */
function drawPublicMilitary(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, w, h);

  // 패널 조적선
  ctx.fillStyle = '#94a3b8';
  for (let px = x; px < x + w; px += 56) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 56) ctx.fillRect(x, py, w, 1.5);

  // 균일한 2x2 격자형 관사/막사 창문
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const wx = x + 36 + c * 150;
      const wy = y + 42 + r * 210;
      const wSize = 100;

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx - 3, wy - 3, wSize + 6, wSize + 6);

      const wg = ctx.createLinearGradient(wx, wy, wx, wy + wSize);
      wg.addColorStop(0, '#bae6fd');
      wg.addColorStop(0.5, '#38bdf8');
      wg.addColorStop(1, '#0369a1');
      ctx.fillStyle = wg;
      ctx.fillRect(wx, wy, wSize, wSize);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx + wSize * 0.5 - 1, wy, 2, wSize);
      ctx.fillRect(wx, wy + wSize * 0.5 - 1, wSize, 2);
    }
  }

  addWeatheringNoise(ctx, x, y, w, h);
}

// =============================================================================
// 아틀라스 캔버스 생성 및 Three.js Texture 싱글톤 관리
// =============================================================================

let cachedVWorldCanvas: HTMLCanvasElement | null = null;
let cachedVWorldTexture: THREE.CanvasTexture | null = null;

export function createVWorldAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = VWORLD_ATLAS_SIZE;
  canvas.height = VWORLD_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 전체 배경 초기화
  ctx.fillStyle = '#e7e5e4';
  ctx.fillRect(0, 0, VWORLD_ATLAS_SIZE, VWORLD_ATLAS_SIZE);

  const cellW = VWORLD_CELL_W;
  const cellH = VWORLD_CELL_H;

  const drawers = [
    drawAptWarmCream,     // 0
    drawAptModernGray,    // 1
    drawAptIvoryWhite,    // 2
    drawAptGlassStone,    // 3
    drawAptSide,          // 4
    drawCommGraniteBeige, // 5
    drawCommDarkMetal,    // 6
    drawCommRedBrick,     // 7
    drawCommCurtainwall,  // 8
    drawCommGroundShop,   // 9
    drawVillaRedBrick,    // 10
    drawVillaGranite,     // 11
    drawHouseCream,       // 12
    drawFacilityPanel,    // 13
    drawRoofConcreteWarmGray, // 14 (30%)
    drawRoofAsphaltCharcoal,  // 15 (25%)
    drawRoofTerracottaTile,   // 16 (20%)
    drawRoofUrethaneSage,     // 17 (15%)
    drawRoofZincBlue,         // 18 (10%)
    drawPenthouseWall,    // 19
    drawPenthouseMetal,   // 20
    drawParapetConcrete,  // 21
    drawParapetDark,      // 22
    drawPublicMilitary,   // 23
  ];

  for (let i = 0; i < drawers.length; i++) {
    const col = i % VWORLD_COLS;
    const row = Math.floor(i / VWORLD_COLS);
    const x = col * cellW;
    const y = row * cellH;
    drawers[i](ctx, x, y, cellW, cellH);
  }

  return canvas;
}

/**
 * Three.js 고성능 CanvasTexture 반환 (anisotropy: 16, mipmaps: true)
 */
export function getVWorldAtlasTexture(): THREE.CanvasTexture | null {
  if (typeof window === 'undefined') return null;

  if (cachedVWorldTexture) {
    return cachedVWorldTexture;
  }

  cachedVWorldCanvas = createVWorldAtlasCanvas();
  const tex = new THREE.CanvasTexture(cachedVWorldCanvas);
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  cachedVWorldTexture = tex;
  return tex;
}

export function disposeVWorldAtlas(): void {
  if (cachedVWorldTexture) {
    cachedVWorldTexture.dispose();
    cachedVWorldTexture = null;
  }
  cachedVWorldCanvas = null;
}
