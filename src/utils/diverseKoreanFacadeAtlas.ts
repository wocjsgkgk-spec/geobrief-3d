/**
 * utils/diverseKoreanFacadeAtlas.ts
 *
 * [GeoBrief 3D 1단계: Streets-GL 방식 다중 셀(Window Cell) 실사 외벽 아틀라스 & PBR 텍스처 엔진]
 *
 * 1. 외벽 바탕 비율 역전 (밝은 벽면 70% : 어두운 개별 창문 30%):
 *    - 기존의 어두운 남색 바탕 + 가로 흰 줄무늬를 전면 폐기
 *    - 실제 한국 도심 건축물처럼 외벽의 70%는 밝고 따뜻한 콘크리트/석재/벽돌 벽체(기둥 멀리언 + 슬래브)로 채우고,
 *      그 안에 30% 비율의 직사각형 개별 유리창(차콜/백색 창틀 + 반사 유리 + 베란다 난간 + 에어컨 실외기 루버)을 정밀 렌더링.
 *
 * 2. 16종 실사 외벽 프리셋 (A ~ P):
 *    - 프리셋 A~D (한국형 아파트 4종):
 *      ① 크림 화이트(#f5f2eb) + 차콜 베란다 창
 *      ② 소프트 샌드 베이지(#e6dec8) + 브라운 투톤 외벽
 *      ③ 웜 그레이(#d6d3cd) + 세로 강조선 아파트
 *      ④ 테라코타/벽돌색 기단부 + 아이보리 판상형 아파트
 *    - 프리셋 E~H (시내 상업·오피스 빌딩 4종):
 *      ⑤ 밝은 베이지 화강석 석재 타일 빌딩 (1층 통유리 상가 쇼윈도 포함)
 *      ⑥ 스카이 블루 반사 유리 커튼월 오피스
 *      ⑦ 에메랄드/그린 틴티드 유리 빌딩
 *      ⑧ 다크 차콜 알루미늄 복합패널 모던 상가
 *    - 프리셋 I~L (저층 상가주택·원룸·빌라 4종):
 *      ⑨ 붉은 치장벽돌(#9a3b26) + 백색 창틀 빌라
 *      ⑩ 갈색 파벽돌(#6e473b) 상가주택
 *      ⑪ 밝은 아이보리 스타코 + 박공지붕 다세대
 *      ⑫ 투톤 화강석 필로티 원룸
 *    - 프리셋 M~P (공장·창고·군사시설 4종):
 *      ⑬ 블루/실버 골강판 물류창고
 *      ⑭ 샌드 베이지 통합막사 (규칙적 격자창 + 적갈색 박공지붕)
 *      ⑮ 화이트 R&D 연구동
 *      ⑯ 그레이 산업플랜트
 *
 * 3. 옥상 실사 웨더링 슬롯 (우레탄 40% #32694f, 슬래브 35% #736f68, 기와 25% #7c3829, 징크 #254e7a)
 */

import * as THREE from 'three';

export const DIVERSE_ATLAS_SIZE = 2048;
export const DIVERSE_ATLAS_COLS = 6;
export const DIVERSE_ATLAS_ROWS = 6;
export const DIVERSE_CELL_W = Math.floor(DIVERSE_ATLAS_SIZE / DIVERSE_ATLAS_COLS); // 341px
export const DIVERSE_CELL_H = Math.floor(DIVERSE_ATLAS_SIZE / DIVERSE_ATLAS_ROWS); // 341px

export const DIVERSE_SLOT_NAME_TO_ID: Record<string, number> = {
  // 프리셋 A~D (한국형 아파트 4종)
  apt_preset_a: 0,
  apt_cream_white: 0,
  apt_warm_cream: 0,

  apt_preset_b: 1,
  apt_sand_beige: 1,

  apt_preset_c: 2,
  apt_warm_gray: 2,

  apt_preset_d: 3,
  apt_terracotta_two: 3,
  apt_modern_twotone: 3,

  // 아파트 고층 측벽 (양 끝단 단변 전용)
  apt_side: 4,

  // 프리셋 E~H (시내 상업·오피스 빌딩 4종)
  comm_preset_e: 5,
  comm_granite_tile: 5,
  comm_granite_beige: 5,

  comm_preset_f: 6,
  comm_sky_curtain: 6,
  comm_curtainwall: 6,

  comm_preset_g: 7,
  comm_emerald_glass: 7,

  comm_preset_h: 8,
  comm_charcoal_panel: 8,
  comm_dark_metal: 8,

  // 프리셋 I~L (저층 상가주택·원룸·빌라 4종)
  villa_preset_i: 9,
  villa_red_brick: 9,

  villa_preset_j: 10,
  villa_brown_brick: 10,
  comm_red_brick: 10,

  villa_preset_k: 11,
  villa_stucco_ivory: 11,
  house_cream: 11,

  villa_preset_l: 12,
  villa_twotone_piloti: 12,
  villa_granite: 12,

  // 프리셋 M~P (공장·창고·군사시설 4종)
  fac_preset_m: 13,
  facility_corrugated_blue: 13,
  facility_panel: 13,

  fac_preset_n: 14,
  facility_military_barracks: 14,
  public_military: 14,

  fac_preset_o: 15,
  facility_rd_white: 15,

  fac_preset_p: 16,
  facility_industry_gray: 16,

  // 옥상 3대 실사 웨더링 (40% : 35% : 25%)
  roof_urethane_sage: 17,
  roof_concrete_warmgray: 18,
  roof_apt_slab: 18,
  roof_terracotta_tile: 19,
  roof_zinc_blue: 20,

  // 옥상 파라펫 난간, 옥탑방 권상기실 외벽, 1층 상가 쇼윈도
  parapet_concrete: 21,
  penthouse_wall: 22,
  penthouse_core_wall: 22,
  comm_ground_shop: 23,
  comm_shop_showcase: 23,

  // [2단계 신규] 강원 18개 시·군 관공서·공공기관·학교·병원 랜드마크 슬롯 (슬롯 24 ~ 35)
  gov_podium: 24,
  gov_podium_granite: 24,

  gov_tower: 25,
  gov_tower_curtain: 25,

  school_facade: 26,
  school_brick_facade: 26,

  hospital_facade: 27,
  hospital_clean_panel: 27,

  helipad_h: 28,
  helipad_deck: 28,

  solar_panel: 29,
  solar_array: 29,

  terrace_garden: 30,
  terrace_green: 30,

  ktx_station: 31,
  ktx_arch_truss: 31,

  crown_frame: 32,
  roof_school_green: 33,
  canopy_glass: 34,
  police_fire_facade: 35,
};

export interface DiverseUVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}
export type UVRect = DiverseUVRect;

/**
 * 36 슬롯 UV 좌표 반환 (Three.js flipY = true)
 */
export function getDiverseFacadeSlotUV(slot: number | string): DiverseUVRect {
  let id = 0;
  if (typeof slot === 'number') {
    id = slot;
  } else if (slot in DIVERSE_SLOT_NAME_TO_ID) {
    id = DIVERSE_SLOT_NAME_TO_ID[slot];
  }
  id = Math.max(0, Math.min(35, Math.floor(id)));
  const col = id % 6;
  const row = Math.floor(id / 6);
  const u0 = col / 6.0;
  const u1 = (col + 1) / 6.0;
  const v1 = 1.0 - row / 6.0;
  const v0 = 1.0 - (row + 1) / 6.0;
  return { u0, v0, u1, v1 };
}

export const getPhotorealisticSlotUV = getDiverseFacadeSlotUV;

// =============================================================================
// [공통 드로잉 헬퍼]
// =============================================================================

function applyNoise(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.03): void {
  ctx.save();
  ctx.fillStyle = `rgba(100, 116, 139, ${alpha})`;
  for (let py = y; py < y + h; py += 8) {
    for (let px = x; px < x + w; px += 10) {
      if ((px * 3 + py * 7) % 11 === 0) {
        ctx.fillRect(px, py, 2, 1);
      }
    }
  }
  ctx.restore();
}

/**
 * 개별 직사각형 창문 렌더러 (창틀 + 깊은 드롭섀도우 + 반사 유리 + 베란다 난간 + 실외기 루버)
 * 창문 면적 비율 ~30% 유지
 */
function drawIndividualWindow(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  options: {
    frameColor?: string;
    glassColor1?: string;
    glassColor2?: string;
    hasBalconyRailing?: boolean;
    hasLouverGrill?: boolean;
  } = {}
): void {
  const frameColor = options.frameColor || '#1e293b';
  const glassColor1 = options.glassColor1 || '#1e293b';
  const glassColor2 = options.glassColor2 || '#0f172a';

  // 1. 창틀 프레임 (두께 2px)
  ctx.fillStyle = frameColor;
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

  // 2. 반사 유리 그라데이션
  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  glassGrad.addColorStop(0, glassColor1);
  glassGrad.addColorStop(0.35, '#293548');
  glassGrad.addColorStop(1, glassColor2);
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 3. 상단 및 좌측 깊은 드롭 섀도우 (창문이 벽면 안으로 5~10cm 오목하게 들어간 입체감)
  const topShadow = ctx.createLinearGradient(wx, wy, wx, wy + Math.min(14, wh * 0.25));
  topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.70)');
  topShadow.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = topShadow;
  ctx.fillRect(wx, wy, ww, Math.min(14, wh * 0.25));

  const leftShadow = ctx.createLinearGradient(wx, wy, wx + Math.min(8, ww * 0.15), wy);
  leftShadow.addColorStop(0, 'rgba(0, 0, 0, 0.50)');
  leftShadow.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = leftShadow;
  ctx.fillRect(wx, wy, Math.min(8, ww * 0.15), wh);

  // 4. 중앙 수직 멀리언 (창틀 분할 바)
  if (ww > 36) {
    const midX = Math.round(wx + ww * 0.5);
    ctx.fillStyle = frameColor;
    ctx.fillRect(midX - 1, wy, 2, wh);
  }

  // 5. 베란다 안전 난간 (하단 35% 구간)
  if (options.hasBalconyRailing) {
    const railH = Math.round(wh * 0.35);
    const railY = wy + wh - railH;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(wx + 2, railY, ww - 4, 2); // 핸드레일
    ctx.fillStyle = 'rgba(203, 213, 225, 0.65)';
    for (let rx = wx + 6; rx < wx + ww - 6; rx += 10) {
      ctx.fillRect(rx, railY + 2, 1.5, railH - 2); // 살대
    }
  }

  // 6. 에어컨 실외기 루버 그릴
  if (options.hasLouverGrill) {
    const louverW = Math.round(ww * 0.28);
    const louverH = Math.min(26, Math.round(wh * 0.35));
    const lx = wx + ww - louverW - 3;
    const ly = wy + wh - louverH - 3;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(lx, ly, louverW, louverH);
    ctx.fillStyle = '#64748b';
    for (let sy = ly + 2; sy < ly + louverH; sy += 3.5) {
      ctx.fillRect(lx + 1, sy, louverW - 2, 1);
    }
  }
}

// =============================================================================
// [16종 외벽 프리셋 렌더러]
// =============================================================================

// --- 프리셋 A~D (한국형 아파트 4종) ---
function drawPresetA(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ① 크림 아이보리(#f4efe6) 외벽 (70% 벽면)
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브 & 층간 줄눈
  ctx.fillStyle = '#e8e0d2';
  ctx.fillRect(x, y, w, 24);
  ctx.fillRect(x, y + 22, w, 2);

  // 좌우 기둥 멀리언
  ctx.fillStyle = '#ebe5da';
  ctx.fillRect(x, y, 24, h);
  ctx.fillRect(x + w - 24, y, 24, h);

  // 중앙 거실 대형 베란다 창 (직사각형 발코니 유리창 #1e293b + 흰색 창틀 프레임)
  const winW = Math.round(w * 0.52);
  const winH = Math.round(h * 0.46);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 42;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#ffffff', // 백색 PVC 프레임
    glassColor1: '#1e293b',
    glassColor2: '#0f172a',
    hasBalconyRailing: true,
    hasLouverGrill: true,
  });

  applyNoise(ctx, x, y, w, h, 0.025);
}

function drawPresetB(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ② 샌드 베이지(#e8e0d2) + 브라운(#78523a) 투톤
  ctx.fillStyle = '#e8e0d2';
  ctx.fillRect(x, y, w, h);

  // 하단 30% 브라운 투톤 악센트
  const btmH = Math.round(h * 0.30);
  ctx.fillStyle = '#78523a';
  ctx.fillRect(x, y + h - btmH, w, btmH);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y + h - btmH - 2, w, 2);

  // 창문 2개 분할 (안방 창 + 거실 창)
  const winW = Math.round(w * 0.42);
  const winH = Math.round(h * 0.42);
  const winX = x + 30;
  const winY = y + 38;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#ffffff',
    glassColor1: '#1e293b',
    glassColor2: '#111827',
    hasBalconyRailing: true,
    hasLouverGrill: false,
  });

  const win2W = Math.round(w * 0.30);
  const win2X = winX + winW + 16;
  drawIndividualWindow(ctx, win2X, winY, win2W, winH, {
    frameColor: '#ffffff',
    glassColor1: '#1e293b',
    glassColor2: '#0f172a',
    hasBalconyRailing: false,
    hasLouverGrill: true,
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPresetC(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ③ 라이트 웜그레이(#dcd8d0) + 세로 강조선 아파트
  ctx.fillStyle = '#dcd8d0';
  ctx.fillRect(x, y, w, h);

  // 좌측 다크 슬레이트 버티컬 컬러 밴드
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + 20, y, 16, h);

  // 층간 수평 그루브
  ctx.fillStyle = '#b0aba1';
  ctx.fillRect(x, y, w, 18);
  ctx.fillRect(x, y + h - 18, w, 18);

  const winW = Math.round(w * 0.50);
  const winH = Math.round(h * 0.45);
  const winX = x + 60;
  const winY = y + 40;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#ffffff',
    glassColor1: '#1e293b',
    glassColor2: '#0d131d',
    hasBalconyRailing: true,
    hasLouverGrill: true,
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPresetD(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ④ 테라코타(#8c3b2b) 기단부 + 크림 아이보리(#f4f0e6) 상층부
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect(x, y, w, h);

  // 하단 25% 테라코타 벽돌 기단부
  const btmH = Math.round(h * 0.25);
  ctx.fillStyle = '#8c3b2b';
  ctx.fillRect(x, y + h - btmH, w, btmH);
  ctx.fillStyle = '#f8fafc';
  for (let py = y + h - btmH + 12; py < y + h; py += 14) {
    ctx.fillRect(x, py, w, 1);
  }

  const winW = Math.round(w * 0.54);
  const winH = Math.round(h * 0.44);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 36;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#ffffff', // 백색 PVC 프레임
    glassColor1: '#1e293b',
    glassColor2: '#0a1017',
    hasBalconyRailing: true,
    hasLouverGrill: false,
  });

  applyNoise(ctx, x, y, w, h, 0.025);
}

// --- 측벽 슬롯 4 ---
function drawAptSideWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 매끈한 크림 아이보리(#f4f0e6) 콘크리트 측벽 (창문 일절 없음!)
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect(x, y, w, h);

  // 층간 슬래브 미세 홈선
  ctx.strokeStyle = '#e2ded5';
  ctx.lineWidth = 1;
  const flrH = Math.round(h / 8);
  for (let fy = y + flrH; fy < y + h; fy += flrH) {
    ctx.beginPath();
    ctx.moveTo(x, fy);
    ctx.lineTo(x + w, fy);
    ctx.stroke();
  }

  // 단지별 브랜드 액센트 수직 컬러 밴드 (브라운, 딥 네이비, 테라코타, 포레스트 그린)
  const barW = Math.round(w * 0.20);
  const barX = x + Math.round((w - barW) * 0.5);
  const brandGrad = ctx.createLinearGradient(barX, y, barX + barW, y);
  brandGrad.addColorStop(0, '#1e3a8a'); // 딥 네이비
  brandGrad.addColorStop(0.5, '#2563eb');
  brandGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = brandGrad;
  ctx.fillRect(barX, y, barW, h);

  // 상단 단지 동 번호 그래픽 박스 (예: 101, 102동)
  const badgeY = y + Math.round(h * 0.12);
  const badgeH = 44;
  const badgeW = Math.round(w * 0.55);
  const badgeX = x + Math.round((w - badgeW) * 0.5);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 2;
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

  // 동 번호 '101' 그래픽
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101동', x + Math.round(w * 0.5), badgeY + Math.round(badgeH * 0.5));

  applyNoise(ctx, x, y, w, h, 0.015);
}

// --- 프리셋 E~H (시내 상업·오피스 빌딩 4종) ---
function drawPresetE(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑤ 밝은 베이지 화강석 석재 타일 빌딩 (#dcd4c6)
  ctx.fillStyle = '#dcd4c6';
  ctx.fillRect(x, y, w, h);

  // 석재 타일 줄눈 그리드 (Stone Grout Joints)
  ctx.fillStyle = 'rgba(160, 150, 138, 0.45)';
  for (let px = x; px < x + w; px += 44) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 32) ctx.fillRect(x, py, w, 1.5);

  // 수평 리본 윈도우
  const winW = w - 48;
  const winH = Math.round(h * 0.38);
  const winX = x + 24;
  const winY = y + 42;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#334155',
    glassColor1: '#253549',
    glassColor2: '#0e1622',
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPresetF(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑥ 스카이 블루 반사 유리 커튼월 오피스 (#64748b)
  ctx.fillStyle = '#64748b'; // 스카이 블루 / 슬레이트 외곽 프레임
  ctx.fillRect(x, y, w, h);

  const glassW = w - 24;
  const glassH = h - 30;
  const gx = x + 12;
  const gy = y + 15;

  const skyGrad = ctx.createLinearGradient(gx, gy, gx, gy + glassH);
  skyGrad.addColorStop(0, '#bae6fd');
  skyGrad.addColorStop(0.35, '#7dd3fc');
  skyGrad.addColorStop(0.85, '#38bdf8');
  skyGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(gx, gy, glassW, glassH);

  // 다크 슬레이트 커튼월 그리드 멀리언
  ctx.fillStyle = '#1e293b';
  for (let px = gx; px < gx + glassW; px += 36) ctx.fillRect(px, gy, 2, glassH);
  for (let py = gy; py < gy + glassH; py += 36) ctx.fillRect(gx, py, glassW, 2);

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawPresetG(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑦ 에메랄드/그린 틴티드 유리 빌딩
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y, w, h);

  const glassW = w - 28;
  const glassH = h - 36;
  const gx = x + 14;
  const gy = y + 18;

  const emeraldGrad = ctx.createLinearGradient(gx, gy, gx, gy + glassH);
  emeraldGrad.addColorStop(0, '#a7f3d0');
  emeraldGrad.addColorStop(0.40, '#34d399');
  emeraldGrad.addColorStop(1, '#059669');
  ctx.fillStyle = emeraldGrad;
  ctx.fillRect(gx, gy, glassW, glassH);

  // 브론즈 멀리언
  ctx.fillStyle = '#1e293b';
  for (let px = gx; px < gx + glassW; px += 40) ctx.fillRect(px, gy, 2.5, glassH);
  for (let py = gy; py < gy + glassH; py += 40) ctx.fillRect(gx, py, glassW, 2.5);

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawPresetH(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑧ 모던 차콜 메탈 패널 (#475569)
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, w, h);

  // 실버 패널 줄눈
  ctx.fillStyle = '#94a3b8';
  for (let px = x; px < x + w; px += 56) ctx.fillRect(px, y, 2, h);
  for (let py = y; py < y + h; py += 42) ctx.fillRect(x, py, w, 2);

  const winW = Math.round(w * 0.55);
  const winH = Math.round(h * 0.42);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 36;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#0f172a',
    glassColor1: '#38bdf8',
    glassColor2: '#0369a1',
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

// --- 프리셋 I~L (저층 상가주택·원룸·빌라 4종) ---
function drawPresetI(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑨ 붉은 치장벽돌(#8c3b2b) + 백색 창틀 빌라
  ctx.fillStyle = '#8c3b2b';
  ctx.fillRect(x, y, w, h);

  // 백색 몰탈 줄눈
  ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
  for (let py = y; py < y + h; py += 12) ctx.fillRect(x, py, w, 1);
  for (let px = x; px < x + w; px += 24) ctx.fillRect(px, y, 1, h);

  const winW = Math.round(w * 0.46);
  const winH = Math.round(h * 0.44);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 36;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#f8fafc', // 백색 PVC 이중창틀
    glassColor1: '#263445',
    glassColor2: '#0e1620',
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPresetJ(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑩ 갈색 파벽돌(#6e473b) 상가주택
  ctx.fillStyle = '#6e473b';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(200, 190, 180, 0.35)';
  for (let py = y; py < y + h; py += 14) ctx.fillRect(x, py, w, 1);

  // 1층 상가 쇼윈도 + 2층 주거 창호
  const winW = Math.round(w * 0.50);
  const winH = Math.round(h * 0.42);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 34;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#1e293b',
    glassColor1: '#2a394d',
    glassColor2: '#0f172a',
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPresetK(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑪ 밝은 아이보리 스타코(#f5f0e6) + 박공 다세대
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(x, y, w, h);

  // 상단 처마 몰딩
  ctx.fillStyle = '#d4c7b2';
  ctx.fillRect(x, y, w, 18);

  const winW = Math.round(w * 0.44);
  const winH = Math.round(h * 0.44);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 38;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#78350f', // 브라운 우드 창틀
    glassColor1: '#233142',
    glassColor2: '#0b1219',
  });

  applyNoise(ctx, x, y, w, h, 0.025);
}

function drawPresetL(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑫ 투톤 화강석 필로티 원룸 (#dfd8cc)
  ctx.fillStyle = '#dfd8cc';
  ctx.fillRect(x, y, w, h);

  // 석재 타일 줄눈
  ctx.fillStyle = 'rgba(160, 150, 140, 0.40)';
  for (let py = y; py < y + h; py += 28) ctx.fillRect(x, py, w, 1.5);
  for (let px = x; px < x + w; px += 42) ctx.fillRect(px, y, 1.5, h);

  const winW = Math.round(w * 0.42);
  const winH = Math.round(h * 0.42);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 36;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#334155',
    glassColor1: '#263445',
    glassColor2: '#0f1722',
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

// --- 프리셋 M~P (공장·창고·군사시설 4종) ---
function drawPresetM(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑬ 블루/실버 골강판 물류창고
  const halfH = Math.round(h * 0.45);
  ctx.fillStyle = '#2563eb'; // 상부 코발트 블루
  ctx.fillRect(x, y, w, halfH);
  ctx.fillStyle = '#94a3b8'; // 하부 실버
  ctx.fillRect(x, y + halfH, w, h - halfH);

  // 세로 골강판 리브
  ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
  for (let px = x; px < x + w; px += 14) ctx.fillRect(px, y, 2, h);

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawPresetN(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑭ 샌드 베이지 통합막사 (#e2dbcc)
  ctx.fillStyle = '#e2dbcc';
  ctx.fillRect(x, y, w, h);

  // 국방 올리브/브라운 처마
  ctx.fillStyle = '#3f4b3b';
  ctx.fillRect(x, y, w, 16);

  // 규칙적 규격 창호 2개
  const winW = Math.round(w * 0.32);
  const winH = Math.round(h * 0.40);
  const win1X = x + 24;
  const win2X = x + w - winW - 24;
  const winY = y + 36;

  drawIndividualWindow(ctx, win1X, winY, winW, winH, { frameColor: '#1e293b' });
  drawIndividualWindow(ctx, win2X, winY, winW, winH, { frameColor: '#1e293b' });

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPresetO(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑮ 화이트 R&D 연구동 (#ffffff) + 블루 악센트 밴드
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#0284c7'; // 블루 띠장
  ctx.fillRect(x, y + 20, w, 10);

  const winW = w - 40;
  const winH = Math.round(h * 0.38);
  const winX = x + 20;
  const winY = y + 42;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#0f172a',
    glassColor1: '#38bdf8',
    glassColor2: '#0369a1',
  });

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawPresetP(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // ⑯ 그레이 산업플랜트 (#5a6270)
  ctx.fillStyle = '#5a6270';
  ctx.fillRect(x, y, w, h);

  // 안전 옐로우 악센트
  ctx.fillStyle = '#eab308';
  ctx.fillRect(x, y, w, 8);

  const winW = Math.round(w * 0.50);
  const winH = Math.round(h * 0.36);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 36;

  drawIndividualWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#1e293b',
    glassColor1: '#334155',
    glassColor2: '#0f172a',
  });

  applyNoise(ctx, x, y, w, h, 0.03);
}

// --- 옥상 슬롯 (17, 18, 19, 20) & 부속 슬롯 (21, 22, 23) ---
function drawRoofUrethane(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // [GeoBrief 3D 3단계] 에메랄드/세이지 그린 우레탄 방수 옥상 (#2e6f4e, 도심 상가 45%)
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.08, x + w * 0.5, y + h * 0.5, w * 0.72);
  grad.addColorStop(0, '#3d8262'); // 하이라이트 세이지 그린
  grad.addColorStop(0.7, '#2e6f4e'); // 에메랄드 우레탄 방수 (#2e6f4e)
  grad.addColorStop(1, '#1e4b37'); // 코너 AO 음영
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 십자형 방수 조인트 줄눈
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  for (let px = x; px < x + w; px += 36) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 36) ctx.fillRect(x, py, w, 1.5);

  // 테두리 드레인 거터 & 코너 AO
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 20, y + 20, w - 40, h - 40);

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawRoofConcrete(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // [GeoBrief 3D 3단계] 밝은 시멘트 슬래브 (#8c8881, 도심 상가 30%, 단독주택 20%)
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.08, x + w * 0.5, y + h * 0.5, w * 0.72);
  grad.addColorStop(0, '#9c978f'); // 밝은 시멘트 슬래브 중앙
  grad.addColorStop(0.7, '#8c8881'); // 표준 시멘트 슬래브
  grad.addColorStop(1, '#7a7670'); // 테두리 AO
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  for (let px = x; px < x + w; px += 48) ctx.fillRect(px, y, 1.5, h);
  for (let py = y; py < y + h; py += 48) ctx.fillRect(x, py, w, 1.5);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 20, y + 20, w - 40, h - 40);

  applyNoise(ctx, x, y, w, h, 0.04);
}

function drawRoofTerracotta(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // [GeoBrief 3D 3단계] 테라코타 적갈색 기와 (#7c3626 / #7f3222, 상가 25%, 박공 50%)
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.08, x + w * 0.5, y + h * 0.5, w * 0.72);
  grad.addColorStop(0, '#954231');
  grad.addColorStop(0.65, '#7c3626');
  grad.addColorStop(1, '#662b1e');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 기와 골 줄무늬 (타일 리지)
  ctx.fillStyle = 'rgba(68, 25, 17, 0.45)';
  for (let py = y; py < y + h; py += 16) ctx.fillRect(x, py, w, 3);

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawRoofZinc(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // [GeoBrief 3D 3단계] 코발트 블루 강판 (#1e40af, 박공 30%)
  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.08, x + w * 0.5, y + h * 0.5, w * 0.72);
  grad.addColorStop(0, '#2563eb');
  grad.addColorStop(0.7, '#1e40af');
  grad.addColorStop(1, '#172554');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 징크 골 (Standing seams)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  for (let px = x; px < x + w; px += 20) ctx.fillRect(px, y, 2, h);

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawParapetConcrete(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#94a3b8'; // 콘크리트 난간
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y, w, 4);
  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawPenthouseWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#cbd5e1'; // 옥탑방 권상기실 외벽
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1e293b';
  // 철제 출입문
  const doorW = 40;
  const doorH = 70;
  ctx.fillRect(x + Math.round((w - doorW) * 0.5), y + h - doorH - 10, doorW, doorH);
  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawGroundShopShowcase(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // [1층]: 0m ~ 3.8m 어두운 화강석 프레임 (#1c1917, #292524)
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(x, y, w, h);

  // 1층 상단 정돈된 한국형 가로 간판 블록 띠 (Signboard Band)
  const signH = Math.round(h * 0.22);
  const signY = y + 10;
  const signW = w - 16;
  const signX = x + 8;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(signX, signY, signW, signH);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(signX, signY, signW, signH);

  // 다채로운 한국형 상호 간판 블록 (청색, 주황색, 녹색 간판)
  const bW = Math.round((signW - 12) / 3);
  const colors = ['#1d4ed8', '#c2410c', '#15803d'];
  for (let k = 0; k < 3; k++) {
    const kX = signX + 3 + k * (bW + 3);
    ctx.fillStyle = colors[k % colors.length];
    ctx.fillRect(kX, signY + 3, bW, signH - 6);
    // 흰색 한글 상호 텍스트 실루엣 블록
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(kX + 8, signY + Math.round(signH * 0.35), bW - 16, 5);
    ctx.fillRect(kX + 14, signY + Math.round(signH * 0.55), bW - 28, 4);
  }

  // 밝은 상가 통유리 쇼윈도 (#e0f2fe ~ #0284c7)
  const shopY = signY + signH + 8;
  const shopH = h - shopY - 10;
  const shopW = w - 20;
  const shopX = x + 10;

  // 통유리 내부 조명 및 쇼윈도
  const glassGrad = ctx.createLinearGradient(shopX, shopY, shopX, shopY + shopH);
  glassGrad.addColorStop(0, '#e0f2fe');
  glassGrad.addColorStop(0.35, '#bae6fd');
  glassGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(shopX, shopY, shopW, shopH);

  // 어두운 화강석/알루미늄 창틀 프레임 (#334155)
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(shopX, shopY, shopW, shopH);

  // 중앙 자동문 출입구 프레임
  const doorW = Math.round(shopW * 0.34);
  const doorX = shopX + Math.round((shopW - doorW) * 0.5);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(doorX, shopY, doorW, shopH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX, shopY + 2, doorW, shopH - 2);

  applyNoise(ctx, x, y, w, h, 0.02);
}

// --- [2단계 신규] 랜드마크 전용 슬롯 (24 ~ 35) ---
function drawGovPodium(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 24: 1~3층 광폭 민원실 포디움 (밝은 화강석 석재 #e2dcd3 + 중앙 대형 유리 아트리움 현관)
  ctx.fillStyle = '#e2dcd3';
  ctx.fillRect(x, y, w, h);

  // 화강석 줄눈 그리드
  ctx.strokeStyle = '#cac3b8';
  ctx.lineWidth = 1;
  const tileH = 48;
  const tileW = 68;
  for (let py = y; py < y + h; py += tileH) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  for (let px = x; px < x + w; px += tileW) {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }

  // 중앙 대형 유리 아트리움 로비
  const atW = Math.round(w * 0.72);
  const atH = Math.round(h * 0.65);
  const atX = x + Math.round((w - atW) * 0.5);
  const atY = y + Math.round(h * 0.28);

  const atGrad = ctx.createLinearGradient(atX, atY, atX, atY + atH);
  atGrad.addColorStop(0, '#0f172a');
  atGrad.addColorStop(0.5, '#1e293b');
  atGrad.addColorStop(1, '#0b1120');
  ctx.fillStyle = atGrad;
  ctx.fillRect(atX, atY, atW, atH);

  // 수직/수평 커튼월 멀리언 (다크 차콜)
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  const colW = Math.round(atW / 6);
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(atX + i * colW, atY);
    ctx.lineTo(atX + i * colW, atY + atH);
    ctx.stroke();
  }
  ctx.strokeRect(atX, atY, atW, atH);

  // 유리 반사광 글린트
  ctx.fillStyle = 'rgba(147, 197, 253, 0.25)';
  ctx.beginPath();
  ctx.moveTo(atX + 15, atY + atH - 10);
  ctx.lineTo(atX + Math.round(atW * 0.55), atY + 10);
  ctx.lineTo(atX + Math.round(atW * 0.68), atY + 10);
  ctx.lineTo(atX + 35, atY + atH - 10);
  ctx.closePath();
  ctx.fill();

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawGovTower(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 25: 상층부 본관 타워 (은청색 반사 유리 커튼월 #64748b ~ #93c5fd + 알루미늄 수직 루버)
  const skyGrad = ctx.createLinearGradient(x, y, x, y + h);
  skyGrad.addColorStop(0, '#64748b');
  skyGrad.addColorStop(0.4, '#93c5fd');
  skyGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(x, y, w, h);

  // 알루미늄 수직 루버 (Vertical Louvers)
  const louverCount = 14;
  const louverStep = w / louverCount;
  for (let i = 0; i <= louverCount; i++) {
    const lx = x + i * louverStep;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(lx - 2, y, 4, h);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(lx + 2, y, 2, h);
  }

  // 층간 스팬드럴 알루미늄 밴드
  const flH = 64;
  for (let py = y; py < y + h; py += flH) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(x, py, w, 8);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(x, py + 8, w, 2);
  }

  // 태양광 반사 글린트 대각 띠
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(x + 20, y + h);
  ctx.lineTo(x + w - 40, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + 60, y + h);
  ctx.closePath();
  ctx.fill();

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawSchoolFacade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 26: 초·중·고교 및 대학교 캠퍼스 (적벽돌/아이보리 투톤 + 규칙적 교실 창문 + 시계탑)
  // 기단부/1층 적벽돌
  ctx.fillStyle = '#9a3b26';
  ctx.fillRect(x, y + Math.round(h * 0.45), w, Math.round(h * 0.55));
  // 상층부 따뜻한 아이보리 스타코
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(x, y, w, Math.round(h * 0.45));

  // 층간 마감 띠장
  ctx.fillStyle = '#e2dcd3';
  ctx.fillRect(x, y + Math.round(h * 0.45) - 4, w, 8);

  // 규칙적인 교실 창문 3열 x 4행 배열
  const cols = 4;
  const rows = 3;
  const colStep = (w - 32) / cols;
  const rowStep = (h - 40) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + 16 + c * colStep + 6;
      const wy = y + 20 + r * rowStep + 4;
      const ww = colStep - 12;
      const wh = rowStep - 12;

      // 백색 창틀
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      // 교실 반사 유리
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx, wy, ww, wh);
      // 창살 십자 프레임
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + Math.round(ww * 0.5), wy);
      ctx.lineTo(wx + Math.round(ww * 0.5), wy + wh);
      ctx.moveTo(wx, wy + Math.round(wh * 0.4));
      ctx.lineTo(wx + ww, wy + Math.round(wh * 0.4));
      ctx.stroke();
    }
  }

  // 상단 중앙 시계탑 다이얼 (Clock dial)
  const dialR = 18;
  const dialX = x + Math.round(w * 0.5);
  const dialY = y + 26;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // 시계 바늘 (10시 10분)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dialX, dialY);
  ctx.lineTo(dialX - 8, dialY - 8);
  ctx.moveTo(dialX, dialY);
  ctx.lineTo(dialX + 9, dialY - 9);
  ctx.stroke();

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawHospitalFacade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 27: 대형 종합병원 (깨끗한 화이트/실버 알루미늄 패널 + 그린 틴티드 수평 창호)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, w, h);

  // 알루미늄 패널 메지 라인
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  const panelH = 55;
  for (let py = y; py < y + h; py += panelH) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  // 그린 틴티드 연속 수평 리본 창호 (3개 층)
  const bandCount = 3;
  const bandStep = h / (bandCount + 1);
  for (let b = 1; b <= bandCount; b++) {
    const by = y + b * bandStep - 18;
    const bh = 34;
    // 다크 프레임
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 16, by - 2, w - 32, bh + 4);
    // 에메랄드 그린 틴티드 유리
    const glassGrad = ctx.createLinearGradient(x, by, x, by + bh);
    glassGrad.addColorStop(0, '#047857');
    glassGrad.addColorStop(0.5, '#10b981');
    glassGrad.addColorStop(1, '#064e3b');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(x + 18, by, w - 36, bh);

    // 수평 루버/멀리언
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let px = x + 36; px < x + w - 36; px += 45) {
      ctx.beginPath();
      ctx.moveTo(px, by);
      ctx.lineTo(px, by + bh);
      ctx.stroke();
    }
  }

  // 상단 적십자/의료 엠블럼 악센트 (Red Cross)
  const crossX = x + Math.round(w * 0.5);
  const crossY = y + 24;
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(crossX - 4, crossY - 14, 8, 28);
  ctx.fillRect(crossX - 14, crossY - 4, 28, 8);

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawHelipadH(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 28: 옥상 녹색 헬리패드 (선명한 백색 원 + 'H' 마크)
  // 진녹색 우레탄 바탕
  ctx.fillStyle = '#1b5e20';
  ctx.fillRect(x, y, w, h);

  // 외곽 황색 안전 경계 테두리
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);

  const cx = x + Math.round(w * 0.5);
  const cy = y + Math.round(h * 0.5);
  const r = Math.round(Math.min(w, h) * 0.36);

  // 백색 원형 링
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // 백색 'H' 마크
  const hW = Math.round(r * 0.95);
  const hH = Math.round(r * 1.15);
  const barThick = Math.round(r * 0.26);

  ctx.fillStyle = '#ffffff';
  // 좌측 기둥
  ctx.fillRect(cx - Math.round(hW * 0.5), cy - Math.round(hH * 0.5), barThick, hH);
  // 우측 기둥
  ctx.fillRect(cx + Math.round(hW * 0.5) - barThick, cy - Math.round(hH * 0.5), barThick, hH);
  // 중앙 수평 연결바
  ctx.fillRect(cx - Math.round(hW * 0.5), cy - Math.round(barThick * 0.5), hW, barThick);

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawSolarPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 29: 옥상 태양광 패널 모듈 (네이비 실리콘 셀 + 알루미늄 프레임 그리드)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, h);

  // 4x4 태양광 셀 어레이
  const cellCols = 4;
  const cellRows = 4;
  const cW = (w - 24) / cellCols;
  const cH = (h - 24) / cellRows;

  for (let r = 0; r < cellRows; r++) {
    for (let c = 0; c < cellCols; c++) {
      const cx = x + 12 + c * cW;
      const cy = y + 12 + r * cH;

      const pGrad = ctx.createLinearGradient(cx, cy, cx + cW, cy + cH);
      pGrad.addColorStop(0, '#1e3a8a');
      pGrad.addColorStop(0.5, '#0284c7');
      pGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = pGrad;
      ctx.fillRect(cx + 2, cy + 2, cW - 4, cH - 4);

      // 은색 실리콘 회로선 (Busbars)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.round(cW * 0.33), cy + 2);
      ctx.lineTo(cx + Math.round(cW * 0.33), cy + cH - 2);
      ctx.moveTo(cx + Math.round(cW * 0.66), cy + 2);
      ctx.lineTo(cx + Math.round(cW * 0.66), cy + cH - 2);
      ctx.stroke();

      // 알루미늄 프레임
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx + 1, cy + 1, cW - 2, cH - 2);
    }
  }

  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawTerraceGarden(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 30: 포디움 옥상 녹지 조경 테라스 (잔디 텍스처 #3b6e5c + 콘크리트 보행 블록)
  ctx.fillStyle = '#3b6e5c';
  ctx.fillRect(x, y, w, h);

  // 보행 블록 그리드
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 16, y + 16, w - 32, h - 32);

  // 십자 보행로
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x + Math.round(w * 0.5) - 10, y + 16, 20, h - 32);
  ctx.fillRect(x + 16, y + Math.round(h * 0.5) - 10, w - 32, 20);

  // 보행로 디딤돌 라인
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + Math.round(w * 0.5) - 10, y + 16, 20, h - 32);
  ctx.strokeRect(x + 16, y + Math.round(h * 0.5) - 10, w - 32, 20);

  applyNoise(ctx, x, y, w, h, 0.06);
}

function drawKtxStation(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 31: KTX 기차역 (곡면 대공간 트러스 아치 + 은백색 복합패널)
  const archGrad = ctx.createLinearGradient(x, y, x, y + h);
  archGrad.addColorStop(0, '#94a3b8');
  archGrad.addColorStop(0.3, '#f1f5f9');
  archGrad.addColorStop(0.7, '#cbd5e1');
  archGrad.addColorStop(1, '#475569');
  ctx.fillStyle = archGrad;
  ctx.fillRect(x, y, w, h);

  // 사선형 스페이스 트러스 격자 (Diamond Truss)
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  const gridStep = 45;
  for (let px = x - h; px < x + w + h; px += gridStep) {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + h, y + h);
    ctx.moveTo(px, y + h);
    ctx.lineTo(px + h, y);
    ctx.stroke();
  }

  // 역명 사인 밴드
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(x + 20, y + Math.round(h * 0.42), w - 40, 28);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 20, y + Math.round(h * 0.42), w - 40, 28);

  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawCrownFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 32: 옥상 상징 조형 프레임
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  applyNoise(ctx, x, y, w, h, 0.03);
}

function drawRoofSchoolGreen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 33: 학교 세이지 그린 박공지붕
  ctx.fillStyle = '#2d5a45';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3d6b58';
  ctx.lineWidth = 2;
  for (let py = y; py < y + h; py += 16) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  applyNoise(ctx, x, y, w, h, 0.04);
}

function drawCanopyGlass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 34: 통유리 캐노피
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  applyNoise(ctx, x, y, w, h, 0.02);
}

function drawPoliceFireFacade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 슬롯 35: 경찰서/소방서 공공기관 파사드
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1e3a8a'; // 경찰/소방 시그니처 네이비 밴드
  ctx.fillRect(x, y + Math.round(h * 0.35), w, 24);
  applyNoise(ctx, x, y, w, h, 0.03);
}

// =============================================================================
// [아틀라스 생성 및 캐싱]
// =============================================================================

let cachedDiffuseAtlasTexture: THREE.CanvasTexture | null = null;
let cachedRmaAtlasTexture: THREE.CanvasTexture | null = null;

export function createDiverseKoreanFacadeAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return { width: 16, height: 16 } as any;
  }
  const canvas = document.createElement('canvas');
  canvas.width = DIVERSE_ATLAS_SIZE;
  canvas.height = DIVERSE_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const renderers: ((ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void)[] = [
    drawPresetA,
    drawPresetB,
    drawPresetC,
    drawPresetD,
    drawAptSideWall,
    drawPresetE,
    drawPresetF,
    drawPresetG,
    drawPresetH,
    drawPresetI,
    drawPresetJ,
    drawPresetK,
    drawPresetL,
    drawPresetM,
    drawPresetN,
    drawPresetO,
    drawPresetP,
    drawRoofUrethane,
    drawRoofConcrete,
    drawRoofTerracotta,
    drawRoofZinc,
    drawParapetConcrete,
    drawPenthouseWall,
    drawGroundShopShowcase,
    drawGovPodium,
    drawGovTower,
    drawSchoolFacade,
    drawHospitalFacade,
    drawHelipadH,
    drawSolarPanel,
    drawTerraceGarden,
    drawKtxStation,
    drawCrownFrame,
    drawRoofSchoolGreen,
    drawCanopyGlass,
    drawPoliceFireFacade,
  ];

  for (let slotId = 0; slotId < 36; slotId++) {
    const col = slotId % 6;
    const row = Math.floor(slotId / 6);
    const x = col * DIVERSE_CELL_W;
    const y = row * DIVERSE_CELL_H;
    renderers[slotId](ctx, x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
  }
  return canvas;
}

export function disposeDiverseKoreanFacadeAtlas(): void {
  if (cachedDiffuseAtlasTexture) {
    cachedDiffuseAtlasTexture.dispose();
    cachedDiffuseAtlasTexture = null;
  }
  if (cachedRmaAtlasTexture) {
    cachedRmaAtlasTexture.dispose();
    cachedRmaAtlasTexture = null;
  }
}

export function getDiverseKoreanFacadeAtlasTexture(): THREE.CanvasTexture {
  if (cachedDiffuseAtlasTexture) return cachedDiffuseAtlasTexture;

  const canvas = createDiverseKoreanFacadeAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if ('colorSpace' in texture) {
    (texture as any).colorSpace = THREE.SRGBColorSpace;
  }

  cachedDiffuseAtlasTexture = texture;
  return cachedDiffuseAtlasTexture;
}

/**
 * 36 슬롯 1:1 매칭 PBR RMA (Roughness - Metalness - AO) 텍스처 생성기
 */
export function getDiverseFacadeRmaTexture(): THREE.CanvasTexture {
  if (cachedRmaAtlasTexture) return cachedRmaAtlasTexture;

  if (typeof document === 'undefined') {
    const dummy = { width: 16, height: 16 } as any;
    return new THREE.CanvasTexture(dummy);
  }

  const canvas = document.createElement('canvas');
  canvas.width = DIVERSE_ATLAS_SIZE;
  canvas.height = DIVERSE_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 기본 벽체 (Roughness 0.85 = 217, Metalness 0.04 = 10, AO 1.0 = 255)
  ctx.fillStyle = 'rgb(217, 10, 255)';
  ctx.fillRect(0, 0, DIVERSE_ATLAS_SIZE, DIVERSE_ATLAS_SIZE);

  // 각 슬롯별 창문 영역 유리 (Roughness 0.15 = 38, Metalness 0.85 = 217, AO 0.90 = 230)
  for (let slotId = 0; slotId < 36; slotId++) {
    const col = slotId % 6;
    const row = Math.floor(slotId / 6);
    const x = col * DIVERSE_CELL_W;
    const y = row * DIVERSE_CELL_H;

    if (slotId >= 0 && slotId <= 3) {
      // 아파트 A~D 창문
      const winW = Math.round(DIVERSE_CELL_W * 0.52);
      const winH = Math.round(DIVERSE_CELL_H * 0.45);
      const winX = x + Math.round((DIVERSE_CELL_W - winW) * 0.5);
      const winY = y + 40;
      ctx.fillStyle = 'rgb(38, 217, 230)';
      ctx.fillRect(winX, winY, winW, winH);
    } else if (slotId === 5) {
      // 상가 E 리본 창문
      ctx.fillStyle = 'rgb(38, 217, 230)';
      ctx.fillRect(x + 24, y + 42, DIVERSE_CELL_W - 48, Math.round(DIVERSE_CELL_H * 0.38));
    } else if (slotId === 6 || slotId === 7) {
      // 커튼월 F, G
      ctx.fillStyle = 'rgb(30, 235, 240)'; // 금속성 0.92, 거칠기 0.12
      ctx.fillRect(x + 12, y + 15, DIVERSE_CELL_W - 24, DIVERSE_CELL_H - 30);
    } else if (slotId === 8) {
      // 차콜 패널 상가 H 창문
      ctx.fillStyle = 'rgb(38, 217, 230)';
      const winW = Math.round(DIVERSE_CELL_W * 0.55);
      const winH = Math.round(DIVERSE_CELL_H * 0.42);
      ctx.fillRect(x + Math.round((DIVERSE_CELL_W - winW) * 0.5), y + 36, winW, winH);
    } else if (slotId >= 9 && slotId <= 12) {
      // 빌라 I~L 창문
      ctx.fillStyle = 'rgb(42, 205, 230)';
      const winW = Math.round(DIVERSE_CELL_W * 0.45);
      const winH = Math.round(DIVERSE_CELL_H * 0.44);
      ctx.fillRect(x + Math.round((DIVERSE_CELL_W - winW) * 0.5), y + 36, winW, winH);
    } else if (slotId === 13) {
      // 골강판 M (메탈)
      ctx.fillStyle = 'rgb(110, 180, 245)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 14 || slotId === 15 || slotId === 16) {
      // 시설 N, O, P 창문
      ctx.fillStyle = 'rgb(38, 217, 230)';
      ctx.fillRect(x + 20, y + 36, DIVERSE_CELL_W - 40, Math.round(DIVERSE_CELL_H * 0.40));
    } else if (slotId === 17) {
      // 옥상 우레탄 (Roughness 0.35 = 89, Metalness 0.08 = 20)
      ctx.fillStyle = 'rgb(89, 20, 230)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 18) {
      // 옥상 콘크리트 슬래브 (Roughness 0.82 = 209, Metalness 0.02 = 5)
      ctx.fillStyle = 'rgb(209, 5, 230)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 19) {
      // 옥상 적갈색 기와 (Roughness 0.78 = 199, Metalness 0.03 = 8)
      ctx.fillStyle = 'rgb(199, 8, 220)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 20) {
      // 옥상 징크 블루 (Roughness 0.38 = 97, Metalness 0.70 = 178)
      ctx.fillStyle = 'rgb(97, 178, 240)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 23) {
      // 1층 쇼윈도 통유리
      ctx.fillStyle = 'rgb(30, 230, 245)';
      ctx.fillRect(x + 12, y + 60, DIVERSE_CELL_W - 24, DIVERSE_CELL_H - 75);
    } else if (slotId === 24) {
      // 슬롯 24: 관공서 포디움 (화강석 0.70/0.08, 아트리움 유리 0.15/0.85)
      ctx.fillStyle = 'rgb(178, 20, 255)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
      const atW = Math.round(DIVERSE_CELL_W * 0.72);
      const atH = Math.round(DIVERSE_CELL_H * 0.65);
      const atX = x + Math.round((DIVERSE_CELL_W - atW) * 0.5);
      const atY = y + Math.round(DIVERSE_CELL_H * 0.28);
      ctx.fillStyle = 'rgb(38, 217, 230)';
      ctx.fillRect(atX, atY, atW, atH);
    } else if (slotId === 25) {
      // 슬롯 25: 관공서 타워 커튼월 (Roughness 0.12 = 30, Metalness 0.90 = 230)
      ctx.fillStyle = 'rgb(30, 230, 240)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 26) {
      // 슬롯 26: 학교 파사드 (적벽돌 0.85/0.04, 창문 0.18/0.80)
      ctx.fillStyle = 'rgb(217, 10, 255)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
      const cols = 4;
      const rows = 3;
      const colStep = (DIVERSE_CELL_W - 32) / cols;
      const rowStep = (DIVERSE_CELL_H - 40) / rows;
      ctx.fillStyle = 'rgb(46, 204, 230)';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + 16 + c * colStep + 6;
          const wy = y + 20 + r * rowStep + 4;
          ctx.fillRect(wx, wy, colStep - 12, rowStep - 12);
        }
      }
    } else if (slotId === 27) {
      // 슬롯 27: 종합병원 파사드 (실버 패널 0.25/0.75, 그린 틴티드 창호)
      ctx.fillStyle = 'rgb(64, 190, 245)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
      const bandCount = 3;
      const bandStep = DIVERSE_CELL_H / (bandCount + 1);
      ctx.fillStyle = 'rgb(30, 220, 240)';
      for (let b = 1; b <= bandCount; b++) {
        const by = y + b * bandStep - 18;
        ctx.fillRect(x + 18, by, DIVERSE_CELL_W - 36, 34);
      }
    } else if (slotId === 28) {
      // 슬롯 28: 헬리패드 (Roughness 0.50 = 128, Metalness 0.02 = 5)
      ctx.fillStyle = 'rgb(128, 5, 240)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 29) {
      // 슬롯 29: 태양광 패널 (Roughness 0.10 = 25, Metalness 0.95 = 242)
      ctx.fillStyle = 'rgb(25, 242, 250)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 30) {
      // 슬롯 30: 테라스 녹지 조경 (Roughness 0.92 = 235, Metalness 0.01 = 2)
      ctx.fillStyle = 'rgb(235, 2, 230)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 31) {
      // 슬롯 31: KTX 기차역 트러스/유리 (Roughness 0.30 = 76, Metalness 0.80 = 204)
      ctx.fillStyle = 'rgb(76, 204, 245)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 32) {
      // 슬롯 32: 옥상 상징 프레임 (Roughness 0.40 = 102, Metalness 0.70 = 178)
      ctx.fillStyle = 'rgb(102, 178, 240)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 33) {
      // 슬롯 33: 학교 녹색 박공지붕 (Roughness 0.75 = 191, Metalness 0.10 = 25)
      ctx.fillStyle = 'rgb(191, 25, 230)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 34) {
      // 슬롯 34: 통유리 캐노피 (Roughness 0.10 = 25, Metalness 0.90 = 230)
      ctx.fillStyle = 'rgb(25, 230, 245)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    } else if (slotId === 35) {
      // 슬롯 35: 경찰/소방 공공기관 (Roughness 0.65 = 166, Metalness 0.20 = 51)
      ctx.fillStyle = 'rgb(166, 51, 240)';
      ctx.fillRect(x, y, DIVERSE_CELL_W, DIVERSE_CELL_H);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if ('colorSpace' in texture) {
    (texture as any).colorSpace = THREE.NoColorSpace;
  }

  cachedRmaAtlasTexture = texture;
  return cachedRmaAtlasTexture;
}
