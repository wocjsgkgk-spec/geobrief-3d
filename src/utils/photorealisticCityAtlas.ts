/**
 * utils/photorealisticCityAtlas.ts
 *
 * [GeoBrief 3D 2-A단계: 한국형 포토리얼리스틱 건축 입면·지붕 텍스처 엔진]
 *
 * - 2048x2048 고해상도 Canvas 2D 포토리얼리스틱 아틀라스 (6열 x 4행 = 24 슬롯)
 * - Three.js CanvasTexture (anisotropy: 16, mipmaps: true, LinearMipmapLinearFilter, RepeatWrapping, SRGB)
 *
 * [핵심 실사화 기술]:
 * 1. 콘크리트 마이크로 입자 노이즈(Value Grain Noise) 및 수직 빗물 자국(Vertical Grime)
 * 2. 창호 3cm~15cm 깊이감 드롭 섀도우 & 세대별 무작위 블라인드/커튼/하늘빛 반사
 * 3. 한국형 아파트 4종 톤 변주 (순백색 금지: 웜아이보리, 샌드베이지, 웜그레이, 모던투톤)
 * 4. 한국형 아파트 좁은 측벽(Side Wall) 전용 타일 (창문 없음, 건설사 브랜드 컬러 밴드 & 스텐실 동 번호)
 * 5. 중층 상업/근린생활 빌딩 6종 변주 & 1층(0m~4m) 전용 상가 통유리 쇼윈도 + 간판 띠장
 * 6. 저층 주택/다세대 빌라 붉은 치장벽돌 & 필로티 주차장 기둥 음영
 * 7. 실제 항공사진과 100% 융화되는 옥상 5종 (35% 노후 콘크리트, 25% 딥세이지 우레탄, 20% 차콜 아스팔트, 12% 기와, 8% 징크)
 *    모든 옥상 타일 외곽 1.0m 난간 내측 그림자(Corner AO) 및 빗물 배수로 필수 삽입
 */

import * as THREE from 'three';
import {
  drawAptSideWallWithDong,
  drawAptRearStairwell,
  drawAptGroundLobby,
  drawCommercialSignboardBand,
  drawHVACCoolingTower,
} from './koreanAptDetailer';

export const PHOTOREALISTIC_ATLAS_SIZE = 2048;
export const PHOTOREALISTIC_COLS = 6;
export const PHOTOREALISTIC_ROWS = 4;
export const PHOTOREALISTIC_SLOTS_TOTAL = 24;
export const PHOTOREALISTIC_CELL_W = Math.floor(PHOTOREALISTIC_ATLAS_SIZE / PHOTOREALISTIC_COLS); // 341px
export const PHOTOREALISTIC_CELL_H = Math.floor(PHOTOREALISTIC_ATLAS_SIZE / PHOTOREALISTIC_ROWS); // 512px

export const CITY_SLOT_NAME_TO_ID: Record<string, number> = {
  apt_warm_cream: 0,
  apt_sand_beige: 1,
  apt_warm_gray: 2,
  apt_rear_stairwell: 2,
  apt_modern_twotone: 3,
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
  cooling_tower: 20,
  parapet_concrete: 21,
  parapet_dark: 21,
  apt_pilotis_lobby: 22,
  public_military: 23,
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
export function getPhotorealisticSlotUV(slot: number | string): UVRect {
  let id = 0;
  if (typeof slot === 'number') {
    id = slot;
  } else if (slot in CITY_SLOT_NAME_TO_ID) {
    id = CITY_SLOT_NAME_TO_ID[slot];
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
// [공통 텍스처 질감 렌더링 헬퍼 함수]
// =============================================================================

/**
 * 1. 미세 콘크리트 입자 노이즈 (Value Grain Noise)
 * - 단색 플라스틱 느낌을 원천 차단하고 실물 외벽의 미세한 질감을 표현
 */
function applyConcreteGrainNoise(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.03
): void {
  ctx.save();
  ctx.fillStyle = `rgba(100, 116, 139, ${alpha * 0.6})`;
  for (let py = y; py < y + h; py += 6) {
    for (let px = x; px < x + w; px += 8) {
      if ((px * 3 + py * 5) % 7 === 0) {
        ctx.fillRect(px, py, 2, 1);
      }
    }
  }
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
  for (let py = y + 3; py < y + h; py += 8) {
    for (let px = x + 3; px < x + w; px += 10) {
      if ((px * 7 + py * 3) % 11 === 0) {
        ctx.fillRect(px, py, 2, 1);
      }
    }
  }
  ctx.restore();
}

/**
 * 2. 수직 빗물 자국 그라데이션 (Vertical Weathering Grime)
 * - 처마나 창틀 아래로 빗물이 흘러내려 생긴 자연스러운 세월의 흔적
 */
function applyVerticalRainGrime(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  startY: number,
  length: number,
  alpha = 0.05
): void {
  ctx.save();
  const grad = ctx.createLinearGradient(x, startY, x, startY + length);
  grad.addColorStop(0, `rgba(100, 116, 139, ${alpha})`);
  grad.addColorStop(0.3, `rgba(100, 116, 139, ${alpha * 0.5})`);
  grad.addColorStop(1, 'rgba(100, 116, 139, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, startY, w, length);
  ctx.restore();
}

/**
 * 3. 창호 3cm~15cm 깊이감 드롭 섀도우
 */
function drawWindowFrameWithShadow(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  frameColor = '#334155',
  frameWidth = 2
): void {
  // 외곽 프레임
  ctx.fillStyle = frameColor;
  ctx.fillRect(wx - frameWidth, wy - frameWidth, ww + frameWidth * 2, wh + frameWidth * 2);

  // 상단 및 좌측 드롭 섀도우 (창틀 안쪽으로 떨어지는 깊은 그림자)
  const topShadow = ctx.createLinearGradient(wx, wy, wx, wy + Math.min(18, wh * 0.25));
  topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  topShadow.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = topShadow;
  ctx.fillRect(wx, wy, ww, Math.min(18, wh * 0.25));

  const leftShadow = ctx.createLinearGradient(wx, wy, wx + Math.min(12, ww * 0.2), wy);
  leftShadow.addColorStop(0, 'rgba(0, 0, 0, 0.40)');
  leftShadow.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = leftShadow;
  ctx.fillRect(wx, wy, Math.min(12, ww * 0.2), wh);
}

/**
 * 4. 세대별 창문 유리 렌더러 (다크 슬레이트 틴티드 + 블라인드/커튼 농도차 + 하늘빛 은은한 반사)
 */
function drawRealisticWindowGlass(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  variant: number
): void {
  // 기본 다크 틴티드 글래스 (원색 파란색 절대 금지: 실제 한국 아파트 창문 톤 #1e293b ~ #0f172a)
  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  if (variant === 0) {
    // 딥 차콜 블루
    glassGrad.addColorStop(0, '#283344');
    glassGrad.addColorStop(0.3, '#192231');
    glassGrad.addColorStop(1, '#090d16');
  } else if (variant === 1) {
    // 은은한 하늘빛 슬레이트 반사
    glassGrad.addColorStop(0, '#3e4c5e');
    glassGrad.addColorStop(0.4, '#243042');
    glassGrad.addColorStop(1, '#0f172a');
  } else {
    // 다크 그레이 틴티드
    glassGrad.addColorStop(0, '#2d3748');
    glassGrad.addColorStop(0.5, '#1a202c');
    glassGrad.addColorStop(1, '#0a0f1d');
  }
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 창틀 내부 그림자
  drawWindowFrameWithShadow(ctx, wx, wy, ww, wh);

  // 블라인드/커튼 세대별 농도차
  if (variant === 0) {
    // 가로 알루미늄 슬랫 블라인드 30% 내림
    const blindH = wh * 0.38;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.22)';
    ctx.fillRect(wx + 2, wy + 2, ww - 4, blindH);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    for (let by = wy + 4; by < wy + blindH; by += 4) {
      ctx.fillRect(wx + 2, by, ww - 4, 1);
    }
  } else if (variant === 1) {
    // 베이지 미색 암막 커튼 좌측 40% 닫힘
    const curtainW = ww * 0.42;
    ctx.fillStyle = 'rgba(214, 211, 209, 0.28)';
    ctx.fillRect(wx + 2, wy + 2, curtainW, wh - 4);
    // 커튼 주름
    ctx.fillStyle = 'rgba(41, 37, 36, 0.20)';
    for (let cx = wx + 6; cx < wx + curtainW - 4; cx += 8) {
      ctx.fillRect(cx, wy + 2, 2, wh - 4);
    }
  } else if (variant === 2) {
    // 롤스크린 70% 차양
    const rollH = wh * 0.68;
    ctx.fillStyle = 'rgba(203, 213, 225, 0.24)';
    ctx.fillRect(wx + 2, wy + 2, ww - 4, rollH);
    ctx.fillStyle = 'rgba(51, 65, 85, 0.45)';
    ctx.fillRect(wx + 2, wy + rollH - 2, ww - 4, 2);
  }

  // 창문 수직 멀리언 (창문 분할 프레임)
  if (ww > 36) {
    const midX = Math.round(wx + ww * 0.5);
    ctx.fillStyle = '#475569';
    ctx.fillRect(midX - 1, wy, 2, wh);
  }
}

// =============================================================================
// [1. 한국형 아파트 4종 톤 변주 (슬롯 0, 1, 2, 3)]
// - 순백색 금지: 웜아이보리(#e8e4dc), 샌드베이지(#dfd9ce), 웜그레이(#d4d4d0), 모던투톤(#ebe7e1)
// - 1개 세대 단위: 거실 대형 발코니 창 + 안방 중형 창 + 수직 날개벽 + 에어컨 실외기 루버 그릴
// =============================================================================

/**
 * Slot 0: 아파트 Type A (웜 아이보리 #ebe6dc + 딥 브라운 투톤 기단부 #4a3b32)
 */
function drawAptWarmIvory(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 베이스 웜 아이보리 외벽 (한국 도심 실사 색감)
  ctx.fillStyle = '#ebe6dc';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브 & 빗물 드립선
  ctx.fillStyle = '#dcd7cd';
  ctx.fillRect(x, y, w, 24);
  ctx.fillStyle = '#b8b1a3';
  ctx.fillRect(x, y + 22, w, 2);
  applyVerticalRainGrime(ctx, x, y, w, h, y + 24, 30, 0.15);

  // 하단 28% 딥 브라운 투톤 도색 (한국 아파트 전통 투톤 컬러링)
  const lowerH = Math.round(h * 0.28);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#4a3b32';
  ctx.fillRect(x, lowerY, w, lowerH);
  ctx.fillStyle = '#342922';
  ctx.fillRect(x, lowerY - 3, w, 3);

  // 세대 간 수직 콘크리트 날개벽 (Wing Wall)
  const wingW = 12;
  ctx.fillStyle = '#dcd5c9';
  ctx.fillRect(x, y, wingW, h);
  ctx.fillRect(x + w - wingW, y, wingW, h);

  // 창호 영역 배치
  const marginX = wingW + 8;
  const availW = w - marginX * 2;
  const winY = y + 42;
  const winH = Math.round(h * 0.48);

  // 거실 대형 발코니 창 (60%)
  const livW = Math.round(availW * 0.58);
  const livX = x + marginX;
  drawRealisticWindowGlass(ctx, livX, winY, livW, winH, 0);

  // 안방 중형 창 (38%)
  const bedX = livX + livW + 10;
  const bedW = availW - livW - 10;
  drawRealisticWindowGlass(ctx, bedX, winY, bedW, winH, 1);

  // 에어컨 실외기 루버 그릴 (Louver Grill)
  const louverY = winY + winH - 34;
  const louverH = 32;
  const louverW = Math.round(livW * 0.32);
  const louverX = livX + livW - louverW - 4;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);
  ctx.fillStyle = '#475569';
  for (let ly = louverY + 3; ly < louverY + louverH; ly += 4) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 1.5);
  }

  // 발코니 난간 살대
  const railY = winY + winH + 4;
  const railH = lowerY - railY - 4;
  if (railH > 8) {
    ctx.fillStyle = '#dcd5c9';
    ctx.fillRect(livX, railY, availW, railH);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(livX, railY, availW, 2);
    for (let rx = livX + 6; rx < livX + availW - 6; rx += 12) {
      ctx.fillRect(rx, railY + 2, 1.5, railH - 2);
    }
  }

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 1: 아파트 Type B (샌드 베이지 #dfd9ce + 차콜 브라운 #3e3835)
 */
function drawAptSandBeige(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#dfd9ce';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브
  ctx.fillStyle = '#ccc5b8';
  ctx.fillRect(x, y, w, 22);
  applyVerticalRainGrime(ctx, x, y, w, h, y + 22, 28, 0.14);

  // 하단 차콜 브라운 도색
  const lowerH = Math.round(h * 0.25);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#3e3835';
  ctx.fillRect(x, lowerY, w, lowerH);

  // 테라코타 오렌지 수직 포인트 라인
  ctx.fillStyle = '#9c422b';
  ctx.fillRect(x + 16, y, 6, h);

  // 3연동 모던 발코니 창호
  const winX = x + 30;
  const winW = w - 46;
  const winY = y + 38;
  const winH = Math.round(h * 0.52);

  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 2);

  // 에어컨 실외기 루버
  const louverH = 34;
  const louverW = Math.round(winW * 0.25);
  const louverX = winX + winW - louverW - 4;
  const louverY = winY + winH - louverH - 4;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);
  ctx.fillStyle = '#64748b';
  for (let ly = louverY + 3; ly < louverY + louverH; ly += 4) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 1.5);
  }

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 2: 아파트 Type C (웜 그레이 #d4d4d0 + 모던 웜그레이 #4b5563 + 세로 계단실 창호)
 */
function drawAptWarmGray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#d4d4d0';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브
  ctx.fillStyle = '#bfbfba';
  ctx.fillRect(x, y, w, 20);
  applyVerticalRainGrime(ctx, x, y, w, h, y + 20, 26, 0.14);

  // 좌측: 세로로 길게 이어진 엘리베이터/계단실 창호 타워
  const stairW = Math.round(w * 0.24);
  const stairX = x + 12;
  const stairY = y + 26;
  const stairH = h - 40;
  drawRealisticWindowGlass(ctx, stairX, stairY, stairW, stairH, 0);

  // 우측: 세대별 거실 및 침실 창호
  const resX = stairX + stairW + 14;
  const resW = w - resX + x - 12;
  const resY = y + 42;
  const resH = Math.round(h * 0.50);
  drawRealisticWindowGlass(ctx, resX, resY, resW, resH, 1);

  // 하단 모던 웜그레이 투톤
  const lowerH = Math.round(h * 0.24);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(resX - 6, lowerY, resW + 6, lowerH);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 3: 아파트 Type D (모던 투톤 #ebe7e1 + 딥 네이비 기단부 #1e293b)
 */
function drawAptModernTwotone(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#ebe7e1';
  ctx.fillRect(x, y, w, h);

  // 상단 옥상 처마선
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, 18);
  applyVerticalRainGrime(ctx, x, y, w, h, y + 18, 25, 0.12);

  // 하단 딥 네이비 기단부
  const lowerH = Math.round(h * 0.26);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, lowerY, w, lowerH);

  // 유리 난간형 모던 발코니 창호
  const winX = x + 16;
  const winW = w - 32;
  const winY = y + 36;
  const winH = Math.round(h * 0.54);
  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 0);

  // 발코니 하단 반투명 강화유리 난간 (#475569)
  const glassRailY = winY + winH - 28;
  ctx.fillStyle = 'rgba(71, 85, 105, 0.75)';
  ctx.fillRect(winX, glassRailY, winW, 28);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(winX, glassRailY, winW, 2);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

// =============================================================================
// [2. 한국형 아파트 좁은 측벽 (Side Wall) 전용 타일 (슬롯 4)]
// - 건물 다각형에서 길이가 짧은 양옆 측면 벽체 (edgeLength < 15m)
// - 창문 격자 금지! 매끈한 콘크리트 외벽 + 건설사 브랜드 수직 컬러 밴드 + 동 번호 스텐실
// =============================================================================

/**
 * Slot 4: 아파트 측벽 (Side Wall)
 */
function drawAptSideWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 매끈한 베이지 웜 아이보리 콘크리트 외벽 (위성 정합 #ebe6dc)
  ctx.fillStyle = '#ebe6dc';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브
  ctx.fillStyle = '#d5cfc4';
  ctx.fillRect(x, y, w, 24);
  applyVerticalRainGrime(ctx, x, y, w, h, y + 24, 35, 0.18);

  // 2. 건설사 브랜드 스타일 수직 컬러 밴드 (브라운 #5c4033 + 네이비 #1e3a5f + 딥그레이 #374151)
  const bandW1 = Math.round(w * 0.16);
  const bandW2 = Math.round(w * 0.08);
  const bandX = x + Math.round(w * 0.12);

  ctx.fillStyle = '#5c4033'; // 브라운 주 밴드
  ctx.fillRect(bandX, y, bandW1, h);

  ctx.fillStyle = '#1e3a5f'; // 네이비 보조 밴드
  ctx.fillRect(bandX + bandW1, y, bandW2, h);

  ctx.fillStyle = '#374151'; // 딥그레이 악센트 라인
  ctx.fillRect(bandX + bandW1 + bandW2, y, 4, h);

  // 3. 하단 30% 차콜 투톤 도색
  const lowerH = Math.round(h * 0.30);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#374151';
  ctx.fillRect(x, lowerY, w, lowerH);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x, lowerY - 3, w, 3);

  // 4. 측벽 상단 스텐실 동 번호 ("101" 대형 타이포그래피)
  const textX = x + Math.round(w * 0.65);
  const textY = y + Math.round(h * 0.22);
  ctx.save();
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101', textX, textY);

  // 하단 세로 라인 층수 인디케이터
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(textX - 22, textY + 28, 44, 3);
  ctx.restore();

  // 5. 층별 얇은 수평 눈금 그루브 줄눈 (3m 층고 단위)
  ctx.fillStyle = 'rgba(71, 85, 105, 0.25)';
  const storyStep = Math.round(h / 8);
  for (let sy = y + storyStep; sy < lowerY; sy += storyStep) {
    ctx.fillRect(x, sy, w, 1.5);
  }

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.04);
}

// =============================================================================
// [3. 중층 상업/근린생활 빌딩 파사드 6종 (슬롯 5, 6, 7, 8, 9, 23)]
// - 5: 화강석 석재 타일 줄눈 외벽
// - 6: 알루미늄 복합패널 (실버/다크그레이)
// - 7: 적벽돌 상가
// - 8: 블루/그린 틴티드 커튼월 통유리
// - 9: 1층 전용 상가 통유리 쇼윈도 + 간판 수평 띠장
// - 23: 공공청사 / 군부대 막사 단정 외벽
// =============================================================================

/**
 * Slot 5: 상가 Type A (화강석 석재 타일 줄눈 외벽)
 */
function drawCommGraniteBeige(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 베이지/쿨그레이 대리석 외벽
  ctx.fillStyle = '#e2ded7';
  ctx.fillRect(x, y, w, h);

  // 석재 타일 줄눈 그리드 (Stone Grout Grid)
  ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
  for (let px = x; px < x + w; px += 42) {
    ctx.fillRect(px, y, 1.5, h);
  }
  for (let py = y; py < y + h; py += 32) {
    ctx.fillRect(x, py, w, 1.5);
  }

  // 리본 윈도우 (수평 띠 창호)
  const winY = y + Math.round(h * 0.25);
  const winH = Math.round(h * 0.45);
  const winX = x + 16;
  const winW = w - 32;

  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 1);

  // 창틀 화강석 두겁 창대
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(winX - 4, winY + winH, winW + 8, 4);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.06);
}

/**
 * Slot 6: 상가 Type B (알루미늄 복합패널 실버 & 다크그레이)
 */
function drawCommDarkMetal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 다크 메탈 패널 베이스
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, h);

  // 패널 그리드 줄눈
  ctx.fillStyle = '#1e293b';
  for (let px = x; px < x + w; px += 56) {
    ctx.fillRect(px, y, 2, h);
  }
  for (let py = y; py < y + h; py += 38) {
    ctx.fillRect(x, py, w, 2);
  }

  // 실버 패널 악센트 기둥
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 10, y, 14, h);
  ctx.fillRect(x + w - 24, y, 14, h);

  // 모던 사각 창호
  const winX = x + 34;
  const winW = w - 68;
  const winY = y + Math.round(h * 0.22);
  const winH = Math.round(h * 0.52);
  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 0);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.04);
}

/**
 * Slot 7: 상가 Type C (적벽돌 상가 건물)
 */
function drawCommRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 따뜻한 샌드스톤 / 모던 웜그레이 베이스 (#d6d3d1)
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(x, y, w, h);

  // 석재 타일 가로 줄눈
  ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
  for (let py = y; py < y + h; py += 16) {
    ctx.fillRect(x, py, w, 1);
  }

  // 화강석 창대 및 인방
  const winX = x + 24;
  const winW = w - 48;
  const winY = y + Math.round(h * 0.24);
  const winH = Math.round(h * 0.50);

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(winX - 6, winY - 6, winW + 12, 6); // 상단 인방
  ctx.fillRect(winX - 6, winY + winH, winW + 12, 6); // 하단 창대

  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 2);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.04);
}

/**
 * Slot 8: 상가 Type D (블루/그린 틴티드 커튼월 빌딩)
 */
function drawCommCurtainwall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 딥 슬레이트 글래스 베이스
  const curtainGrad = ctx.createLinearGradient(x, y, x, y + h);
  curtainGrad.addColorStop(0, '#1e293b');
  curtainGrad.addColorStop(0.5, '#0f172a');
  curtainGrad.addColorStop(1, '#020617');
  ctx.fillStyle = curtainGrad;
  ctx.fillRect(x, y, w, h);

  // 알루미늄 커튼월 그리드 멀리언
  ctx.fillStyle = '#64748b';
  for (let px = x; px < x + w; px += 38) {
    ctx.fillRect(px, y, 2.5, h);
  }
  for (let py = y; py < y + h; py += 38) {
    ctx.fillRect(x, py, w, 2.5);
  }

  // 내부 블라인드 무작위 실루엣
  ctx.fillStyle = 'rgba(241, 245, 249, 0.14)';
  for (let py = y + 4; py < y + h - 38; py += 76) {
    for (let px = x + 4; px < x + w - 38; px += 76) {
      if ((px + py) % 3 === 0) {
        ctx.fillRect(px, py, 32, 28);
      }
    }
  }

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.03);
}

/**
 * Slot 9: 1층 전용 상가 통유리 쇼윈도 + 간판 수평 띠장 (0m ~ 4m 전용)
 */
function drawCommGroundShop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 화강석 기단부 베이스
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, w, h);

  // 상단 간판 띠장 (Signboard Band)
  const signH = Math.round(h * 0.28);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 12, y + 14, w - 24, signH);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 12, y + 14, w - 24, signH);

  // 간판 텍스트 실루엣
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + 28, y + 26, Math.round(w * 0.45), 12);

  // 1층 어두운 통유리 쇼윈도
  const shopY = y + signH + 24;
  const shopH = h - shopY + y - 14;
  const shopW = w - 28;
  const shopX = x + 14;

  const shopGrad = ctx.createLinearGradient(shopX, shopY, shopX, shopY + shopH);
  shopGrad.addColorStop(0, '#111827');
  shopGrad.addColorStop(0.5, '#030712');
  shopGrad.addColorStop(1, '#000000');
  ctx.fillStyle = shopGrad;
  ctx.fillRect(shopX, shopY, shopW, shopH);

  // 자동문 프레임
  const doorW = Math.round(shopW * 0.36);
  const doorX = shopX + Math.round((shopW - doorW) * 0.5);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX, shopY + 2, doorW, shopH - 2);

  // 매장 내부 온백색 조명 반사
  ctx.fillStyle = 'rgba(254, 240, 138, 0.12)';
  ctx.fillRect(shopX + 4, shopY + 4, shopW - 8, shopH * 0.6);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 23: 공공청사 / 군부대 막사 단정한 아이보리 외벽
 */
function drawPublicMilitary(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#dcd8cf';
  ctx.fillRect(x, y, w, h);

  // 상단 처마
  ctx.fillStyle = '#b8b2a5';
  ctx.fillRect(x, y, w, 18);

  // 규격 사각 창호
  const winX = x + 24;
  const winW = w - 48;
  const winY = y + 36;
  const winH = Math.round(h * 0.50);
  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 0);

  // 하단 화강석 기단석
  const lowerH = Math.round(h * 0.22);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y + h - lowerH, w, lowerH);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

// =============================================================================
// [4. 저층 주택/다세대 빌라 파사드 (슬롯 10, 11, 12, 13)]
// - 10: 붉은 치장벽돌 다세대 빌라 + 백색 PVC 이중창 + 필로티 주차장 기둥 음영
// - 11: 화강석 빌라 (사비석 외벽)
// - 12: 아이보리 드라이비트 단독주택
// - 13: 샌드위치 패널 창고/군 막사
// =============================================================================

/**
 * Slot 10: 한국형 모던 빌라 (따뜻한 샌드 베이지 & 화강석 필로티 기단)
 */
function drawVillaRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 따뜻한 샌드 베이지 외벽 (#e5e0d8)
  ctx.fillStyle = '#e5e0d8';
  ctx.fillRect(x, y, w, h);

  // 미세 석재 분할선
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
  for (let py = y; py < y + h; py += 18) {
    ctx.fillRect(x, py, w, 1);
  }

  // 백색 PVC 이중창 프레임
  const winX = x + 22;
  const winW = w - 44;
  const winY = y + 32;
  const winH = Math.round(h * 0.48);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(winX - 4, winY - 4, winW + 8, winH + 8);
  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 1);

  // 하단 1층 필로티 주차장 기단부 화강석 그레이 (#64748b)
  const lowerH = Math.round(h * 0.30);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, lowerY, w, lowerH);

  // 콘크리트 사각 기둥 2개 (밝은 그레이 #94a3b8)
  const colW = Math.round(w * 0.18);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 16, lowerY, colW, lowerH);
  ctx.fillRect(x + w - colW - 16, lowerY, colW, lowerH);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.03);
}

/**
 * Slot 11: 화강석 빌라 (밝은 사비석/화강석 외벽)
 */
function drawVillaGranite(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#dcd8cf';
  ctx.fillRect(x, y, w, h);

  // 석재 줄눈
  ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
  for (let py = y; py < y + h; py += 32) {
    ctx.fillRect(x, py, w, 1.5);
  }
  for (let px = x; px < x + w; px += 48) {
    ctx.fillRect(px, y, 1.5, h);
  }

  const winX = x + 26;
  const winW = w - 52;
  const winY = y + 36;
  const winH = Math.round(h * 0.50);
  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 0);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 12: 아이보리 드라이비트 단독주택
 */
function drawHouseCream(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#ece8df';
  ctx.fillRect(x, y, w, h);

  const winX = x + 30;
  const winW = w - 60;
  const winY = y + 40;
  const winH = Math.round(h * 0.50);

  // 우드 창틀 몰딩
  ctx.fillStyle = '#78350f';
  ctx.fillRect(winX - 5, winY - 5, winW + 10, winH + 10);
  drawRealisticWindowGlass(ctx, winX, winY, winW, winH, 2);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.06);
}

/**
 * Slot 13: 샌드위치 패널 창고/군 시설
 */
function drawFacilityPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y, w, h);

  // 세로 골강판 줄무늬
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  for (let px = x; px < x + w; px += 16) {
    ctx.fillRect(px, y, 2, h);
  }

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.04);
}

// =============================================================================
// [5. 실제 항공사진과 100% 융화되는 실사 옥상 5종 (슬롯 14, 15, 16, 17, 18)]
// - 35%: 노후 콘크리트 슬래브 (웜 그레이 #6e6a64 ~ #52504c, 슬롯 14)
// - 25%: 실사 우레탄 방수 옥상 (형광 초록 절대 금지! 딥 세이지 그린 #355e4b ~ #2b4c3d, 슬롯 17)
// - 20%: 다크 아스팔트 슁글 및 차콜 슬래브 (#383e42, 슬롯 15)
// - 12%: 적갈색 기와 및 브라운 슁글 (#693628, 슬롯 16)
// - 8%:  청회색/네이비 금속 징크 지붕 (#2c4257, 슬롯 18)
// - 필수: 모든 옥상 외곽 1.0m 난간 내측 그림자(Corner AO) 및 빗물 배수로 라인 삽입
// =============================================================================

function drawRoofBaseGutterAndAO(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  gutterDepth = 34 // 1.2m 구간 실측 스케일
): void {
  // 테두리 1.2m 난간 내측 부드러운 검은색 그라데이션 음영 (Corner AO)
  const topAO = ctx.createLinearGradient(x, y, x, y + gutterDepth);
  topAO.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  topAO.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
  topAO.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = topAO;
  ctx.fillRect(x, y, w, gutterDepth);

  const btmAO = ctx.createLinearGradient(x, y + h, x, y + h - gutterDepth);
  btmAO.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  btmAO.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
  btmAO.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = btmAO;
  ctx.fillRect(x, y + h - gutterDepth, w, gutterDepth);

  const leftAO = ctx.createLinearGradient(x, y, x + gutterDepth, y);
  leftAO.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  leftAO.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
  leftAO.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = leftAO;
  ctx.fillRect(x, y, gutterDepth, h);

  const rightAO = ctx.createLinearGradient(x + w, y, x + w - gutterDepth, y);
  rightAO.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  rightAO.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
  rightAO.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = rightAO;
  ctx.fillRect(x + w - gutterDepth, y, gutterDepth, h);

  // 빗물 배수로 홈 라인 (Gutter Trench)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.88)';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(x + 22, y + 22, w - 44, h - 44);

  // 모서리 루프 드레인 배수구
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.arc(x + 30, y + 30, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * Slot 14: 35% 노후 콘크리트 슬래브 (위성 실측 #64748b ~ #475569)
 */
function drawRoofConcreteWarmGray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.1, x + w * 0.5, y + h * 0.5, w * 0.75);
  grad.addColorStop(0, '#64748b');
  grad.addColorStop(1, '#475569');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 콘크리트 팽창 줄눈 그리드 (Expansion Joint Grid)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (let px = x; px < x + w; px += 48) {
    ctx.fillRect(px, y, 2, h);
  }
  for (let py = y; py < y + h; py += 48) {
    ctx.fillRect(x, py, w, 2);
  }

  // 풍화 얼룩
  for (let i = 0; i < 5; i++) {
    const px = x + ((i * 67 + 23) % Math.round(w * 0.7)) + w * 0.15;
    const py = y + ((i * 53 + 37) % Math.round(h * 0.7)) + h * 0.15;
    const pr = 28 + (i * 13) % 32;
    const pgrad = ctx.createRadialGradient(px, py, 4, px, py, pr);
    pgrad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
    pgrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
    ctx.fillStyle = pgrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  drawRoofBaseGutterAndAO(ctx, x, y, w, h);
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.06);
}

/**
 * Slot 17: 25% 실사 우레탄 방수 옥상 (위성 실측 세이지 그린 #2d5a43 ~ #1e3d2d, 형광 초록 금지)
 */
function drawRoofUrethaneSage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.1, x + w * 0.5, y + h * 0.5, w * 0.75);
  grad.addColorStop(0, '#2d5a43');
  grad.addColorStop(1, '#1e3d2d');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 미세한 방수재 줄눈 격자 (Waterproofing Joint Grid)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  for (let px = x; px < x + w; px += 36) {
    ctx.fillRect(px, y, 1.5, h);
  }
  for (let py = y; py < y + h; py += 36) {
    ctx.fillRect(x, py, w, 1.5);
  }

  // 표면 코팅 광택 및 덧칠 수리 패치 흔적 (한국 우레탄 옥상 고유 디테일)
  for (let i = 0; i < 6; i++) {
    const px = x + ((i * 71 + 17) % Math.round(w * 0.65)) + w * 0.15;
    const py = y + ((i * 61 + 29) % Math.round(h * 0.65)) + h * 0.15;
    const pw = 36 + (i * 19) % 40;
    const ph = 24 + (i * 13) % 30;

    // 수리 덧칠 부위는 조금 더 짙은 올리브 그린
    ctx.fillStyle = 'rgba(24, 43, 34, 0.38)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(24, 43, 34, 0.60)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, pw, ph);
  }

  drawRoofBaseGutterAndAO(ctx, x, y, w, h);
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

/**
 * Slot 15: 20% 다크 아스팔트 슁글 및 차콜 슬래브 (#383e42)
 */
function drawRoofAsphaltCharcoal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.1, x + w * 0.5, y + h * 0.5, w * 0.75);
  grad.addColorStop(0, '#383e42');
  grad.addColorStop(1, '#25292c');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 아스팔트 슁글 격자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let py = y; py < y + h; py += 24) {
    ctx.fillRect(x, py, w, 2);
  }

  drawRoofBaseGutterAndAO(ctx, x, y, w, h);
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.07);
}

/**
 * Slot 16: 12% 적갈색 기와 및 브라운 슁글 (위성 실측 #6b2d1f ~ #451a13)
 */
function drawRoofTerracottaTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.1, x + w * 0.5, y + h * 0.5, w * 0.75);
  grad.addColorStop(0, '#6b2d1f');
  grad.addColorStop(1, '#451a13');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 기와 골 줄무늬
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  for (let py = y; py < y + h; py += 18) {
    ctx.fillRect(x, py, w, 2);
  }

  drawRoofBaseGutterAndAO(ctx, x, y, w, h);
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.06);
}

/**
 * Slot 18: 8% 청회색/네이비 금속 징크 지붕 (#2c4257, 골강판 세로 줄무늬)
 */
function drawRoofZincBlue(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.1, x + w * 0.5, y + h * 0.5, w * 0.75);
  grad.addColorStop(0, '#2c4257');
  grad.addColorStop(1, '#1b2936');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 금속 징크 세로 골강판 라인
  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  for (let px = x; px < x + w; px += 20) {
    ctx.fillRect(px, y, 2.5, h);
  }

  drawRoofBaseGutterAndAO(ctx, x, y, w, h);
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.04);
}

// =============================================================================
// [6. 옥탑 권상기실 및 난간 (슬롯 19, 20, 21, 22)]
// =============================================================================

function drawPenthouseWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y, w, h);

  // 철제 출입문
  const doorW = Math.round(w * 0.35);
  const doorH = Math.round(h * 0.65);
  const doorX = x + Math.round((w - doorW) * 0.5);
  const doorY = y + h - doorH - 12;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(doorX, doorY, doorW, doorH);

  // 환기 루버 갤러리창
  const louverW = Math.round(w * 0.45);
  const louverH = 26;
  const louverX = x + Math.round((w - louverW) * 0.5);
  const louverY = y + 24;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(louverX, louverY, louverW, louverH);
  ctx.fillStyle = '#94a3b8';
  for (let ly = louverY + 3; ly < louverY + louverH; ly += 4) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 1.5);
  }

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

function drawPenthouseMetal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1e293b';
  for (let px = x; px < x + w; px += 44) {
    ctx.fillRect(px, y, 2, h);
  }
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.04);
}

function drawParapetConcrete(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y, w, h);

  // 상단 두겁석 (Coping Stone)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y, w, 28);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y + 26, w, 3);

  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

function drawParapetDark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, 28);
  applyConcreteGrainNoise(ctx, x, y, w, h, 0.05);
}

// =============================================================================
// 아틀라스 캔버스 생성 및 Three.js CanvasTexture 싱글톤
// =============================================================================

let cachedPhotorealisticCanvas: HTMLCanvasElement | null = null;
let cachedPhotorealisticTexture: THREE.CanvasTexture | null = null;

export function createPhotorealisticCityAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = PHOTOREALISTIC_ATLAS_SIZE;
  canvas.height = PHOTOREALISTIC_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 전체 배경 초기화
  ctx.fillStyle = '#e2ded7';
  ctx.fillRect(0, 0, PHOTOREALISTIC_ATLAS_SIZE, PHOTOREALISTIC_ATLAS_SIZE);

  const cellW = PHOTOREALISTIC_CELL_W;
  const cellH = PHOTOREALISTIC_CELL_H;

  const drawers = [
    drawAptWarmIvory,        // 0: 아파트 Type A (웜 아이보리 전면 발코니)
    drawAptSandBeige,        // 1: 아파트 Type B (샌드 베이지 전면 발코니)
    (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      drawAptRearStairwell(c, x, y, w, h);
      applyConcreteGrainNoise(c, x, y, w, h, 0.05);
    },                       // 2: 한국형 아파트 배면 (계단실/복도식 수직 채광창 + 보일러 연통/실외기)
    drawAptModernTwotone,    // 3: 아파트 Type D (모던 투톤 전면 발코니)
    (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      drawAptSideWallWithDong(c, x, y, w, h, '101', 0);
      applyVerticalRainGrime(c, x, y, w, h, y + 24, 35, 0.18);
      applyConcreteGrainNoise(c, x, y, w, h, 0.04);
    },                       // 4: 한국형 아파트 좁은 측벽 (건설사 브랜드 수직 밴드 + 동 번호 스텐실)
    drawCommGraniteBeige,    // 5: 상가 Type A (화강석 석재 타일)
    drawCommDarkMetal,       // 6: 상가 Type B (알루미늄 복합패널)
    drawCommRedBrick,        // 7: 상가 Type C (적벽돌 상가)
    drawCommCurtainwall,     // 8: 상가 Type D (블루/그린 틴티드 커튼월)
    (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      drawCommercialSignboardBand(c, x, y, w, h);
      applyConcreteGrainNoise(c, x, y, w, h, 0.05);
    },                       // 9: 1층 상가 쇼윈도 + 정돈된 한국형 가로 간판 블록 (0m~4m)
    drawVillaRedBrick,       // 10: 주택 Type A (적벽돌 빌라 + 필로티 주차장 기둥)
    drawVillaGranite,        // 11: 주택 Type B (화강석 빌라)
    drawHouseCream,          // 12: 주택 Type C (아이보리 드라이비트 주택)
    drawFacilityPanel,       // 13: 시설 Type D (샌드위치 패널 창고/군 시설)
    drawRoofConcreteWarmGray,// 14: 옥상 35% (노후 콘크리트 슬래브 웜 그레이)
    drawRoofAsphaltCharcoal, // 15: 옥상 20% (다크 아스팔트 슁글)
    drawRoofTerracottaTile,  // 16: 옥상 12% (적갈색 기와 및 브라운 슁글)
    drawRoofUrethaneSage,    // 17: 옥상 25% (실사 딥 세이지 우레탄 그린)
    drawRoofZincBlue,        // 18: 옥상 8%  (청회색/네이비 금속 징크 지붕)
    drawPenthouseWall,       // 19: 옥탑 엘리베이터 권상기실 외벽
    (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      drawHVACCoolingTower(c, x, y, w, h);
      applyConcreteGrainNoise(c, x, y, w, h, 0.04);
    },                       // 20: 옥상 설비 HVAC 냉각탑 루버 & 상단 팬 그릴 & 철제 사다리
    drawParapetConcrete,     // 21: 콘크리트 난간 + 두겁석
    (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      drawAptGroundLobby(c, x, y, w, h);
      applyConcreteGrainNoise(c, x, y, w, h, 0.05);
    },                       // 22: 한국형 아파트 1층 짙은 화강석 기단부 + 공동현관 캐노피 포치 & 자동문
    drawPublicMilitary,      // 23: 공공청사 / 군부대 막사 단정 외벽
  ];

  for (let i = 0; i < drawers.length; i++) {
    const col = i % PHOTOREALISTIC_COLS;
    const row = Math.floor(i / PHOTOREALISTIC_COLS);
    const x = col * cellW;
    const y = row * cellH;
    drawers[i](ctx, x, y, cellW, cellH);
  }

  return canvas;
}

/**
 * Three.js 고성능 CanvasTexture 반환 (anisotropy: 16, mipmaps: true, LinearMipmapLinearFilter)
 */
export function getPhotorealisticCityAtlasTexture(): THREE.CanvasTexture | null {
  if (typeof window === 'undefined') return null;

  if (cachedPhotorealisticTexture) {
    return cachedPhotorealisticTexture;
  }

  cachedPhotorealisticCanvas = createPhotorealisticCityAtlasCanvas();
  const tex = new THREE.CanvasTexture(cachedPhotorealisticCanvas);
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  cachedPhotorealisticTexture = tex;
  return tex;
}

export function disposePhotorealisticCityAtlas(): void {
  if (cachedPhotorealisticTexture) {
    cachedPhotorealisticTexture.dispose();
    cachedPhotorealisticTexture = null;
  }
  cachedPhotorealisticCanvas = null;
}
