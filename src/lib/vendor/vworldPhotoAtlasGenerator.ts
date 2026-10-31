/**
 * lib/vendor/vworldPhotoAtlasGenerator.ts
 *
 * [GeoBrief 3D 2단계: morluto/rea 역공학 스펙 기반 브이월드 4대 레퍼런스 1:1 매칭 4096px PBR 포토 아틀라스 합성기]
 *
 * 국토교통부 브이월드(V-World 3D) 실제 항공촬영 영상 및 도시 뷰(image_7c6d3f, image_7c1ba4, image_7c1b86, image_7c1b61)
 * 역공학 스펙을 1:1로 결합하여 4096x4096 고해상도(8x8 그리드, 64개 512x512 슬롯) Canvas PBR 텍스처를 실시간 합성합니다.
 *
 * [핵심 기능 4대 구성]:
 * 1. [브이월드 한국형 아파트 8종 (스타일 1~8)]:
 *    - 스타일 1~3: 밝은 크림 화이트(#f5f3ee) / 소프트 샌드 베이지(#e8e1d5) 콘크리트 벽체 +
 *      연한 민트 그린 틴티드 발코니 유리창(#4a6b65 + 상단 반사광 #9cb8b2) + 촘촘한 흰색 창틀 격자 +
 *      하단 1~3층 브라운/황토색(#a67c52, #8c583a) 투톤 도색 구간.
 *    - 스타일 4~6: 어반 웜그레이(#dcd8d0) & 다크 차콜 수직 계단실 코어 창 + 판상형 발코니.
 *    - 스타일 7~8: 주상복합/신축 하이엔드 타워(에메랄드/블루그레이 통유리 커튼월 + 화이트 수직 프레임 핀).
 *    - 아파트 측벽: 창문 격자 대신 크림/베이지 콘크리트 벽면에 단지 고유 수직 컬러 라인 + 동 번호(101, 102 등) 블록.
 *
 * 2. [한국형 상업 빌딩 & 가로변 상가]:
 *    - 1층: 필로티 기둥과 밝은 상가 쇼윈도 통유리(자동문 버튼, 투명 유리, 내부 조명).
 *    - 2층~상층부: 층마다 다양한 유리창(파란 블라인드, 베이지 커튼, 반사유리) 사이사이에
 *      실제 한국 상가 간판(약국, 서울연세치과, 이비인후과, 대성학원, 파리바게뜨, 피트니스 등) +
 *      다크 그레이/베이지 복합패널 프레임.
 *
 * 3. [학교 및 공공시설]:
 *    - 3~5층(12m~18m) 높이의 따뜻한 오렌지 테라코타/살구색(#d97746, #e89065)/적벽돌 교사동 창문 +
 *      청록색/회색 옥상(#2e6b5d, #828282).
 *
 * 4. [저층 상가주택·원룸·단독주택 4대 외벽 & 4대 옥상]:
 *    - 외벽 4종: 적벽돌(#8c3f30), 황토 벽돌(#9a6b4c), 베이지 화강석(#dcd4c6), 아이보리 드라이비트(#ebe5d8).
 *    - 옥상 4종: 우레탄 방수 세이지 그린(#3b6e52), 콘크리트 회색(#828282), 적갈색 기와(#6e3f32), 코발트 블루(#254e7a).
 *    - 0.8m 회백색 콘크리트 난간(Parapet).
 */

import * as THREE from 'three';

export const VWORLD_ATLAS_SIZE = 4096;
export const VWORLD_ATLAS_COLS = 8;
export const VWORLD_ATLAS_ROWS = 8;
export const VWORLD_CELL_SIZE = Math.floor(VWORLD_ATLAS_SIZE / VWORLD_ATLAS_COLS); // 512px

export interface VworldPhotoUVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * 64 슬롯 명칭 -> ID 매핑 테이블 (하위 호환 36종 슬롯 100% 포용)
 */
export const VWORLD_PHOTO_SLOT_MAP: Record<string, number> = {
  // --- Row 0: 한국형 아파트 8종 파사드 (0 ~ 7) ---
  apt_style_1_cream: 0,
  apt_preset_a: 0,
  apt_cream_white: 0,
  apt_warm_cream: 0,

  apt_style_2_sand: 1,
  apt_preset_b: 1,
  apt_sand_beige: 1,

  apt_style_3_ivory: 2,
  apt_ivory_twotone: 2,

  apt_style_4_warmgray: 3,
  apt_preset_c: 3,
  apt_warm_gray: 3,

  apt_style_5_modern: 4,
  apt_modern_gray: 4,

  apt_style_6_terracotta: 5,
  apt_preset_d: 5,
  apt_terracotta_two: 5,
  apt_modern_twotone: 5,

  apt_style_7_highrise_emerald: 6,
  apt_highrise_emerald: 6,

  apt_style_8_highrise_bluegray: 7,
  apt_highrise_bluegray: 7,

  // --- Row 1: 아파트 측벽(8~11) & 1층 상가 쇼윈도(12~15) ---
  apt_side_brown: 8,
  apt_side_cream: 8,

  apt_side_warmgray: 9,

  apt_side_terracotta: 10,

  apt_side_navy: 11,
  apt_side: 11,

  comm_ground_shop: 12,
  comm_shop_showcase: 12,

  comm_ground_cafe: 13,
  comm_ground_bank: 14,
  comm_ground_mart: 15,

  // --- Row 2: 상업 빌딩 한국어 간판 & 커튼월 (16 ~ 23) ---
  comm_sign_clinic_pharmacy: 16,
  comm_sign_academy_study: 17,
  comm_sign_cafe_bakery: 18,
  comm_sign_fitness_yoga: 19,

  comm_preset_e: 20,
  comm_granite_tile: 20,
  comm_granite_beige: 20,

  comm_preset_f: 21,
  comm_sky_curtain: 21,
  comm_curtainwall: 21,
  comm_curtainwall_sky: 21,

  comm_preset_g: 22,
  comm_emerald_glass: 22,

  comm_preset_h: 23,
  comm_charcoal_panel: 23,
  comm_dark_metal: 23,

  // --- Row 3: 저층 빌라·주택(24~27) & 학교·공공청사(28~31) ---
  villa_preset_i: 24,
  villa_red_brick: 24,
  lowrise_red_brick: 24,

  villa_preset_j: 25,
  villa_brown_brick: 25,
  lowrise_brown_brick: 25,
  comm_red_brick: 25,

  villa_preset_k: 26,
  villa_stucco_ivory: 26,
  lowrise_stucco_ivory: 26,
  house_cream: 26,

  villa_preset_l: 27,
  villa_twotone_piloti: 27,
  villa_granite: 27,
  lowrise_granite: 27,

  school_facade: 28,
  school_terracotta_brick: 28,

  school_brick_facade: 29,
  school_red_brick: 29,

  gov_podium: 30,
  gov_podium_granite: 30,

  gov_tower: 31,
  gov_tower_curtain: 31,

  // --- Row 4: 옥상 4대 마감 & 파라펫/옥탑 (32 ~ 39) ---
  roof_urethane_sage: 32,

  roof_concrete_warmgray: 33,
  roof_apt_slab: 33,

  roof_terracotta_tile: 34,

  roof_zinc_blue: 35,

  roof_school_green: 36,

  parapet_concrete: 37,

  penthouse_wall: 38,
  penthouse_core_wall: 38,

  crown_frame: 39,

  // --- Row 5: 랜드마크 & 특수 옥상 시설 (40 ~ 47) ---
  helipad_h: 40,
  helipad_deck: 40,

  solar_panel: 41,
  solar_array: 41,

  terrace_garden: 42,
  terrace_green: 42,

  ktx_station: 43,
  ktx_arch_truss: 43,

  canopy_glass: 44,

  police_fire_facade: 45,

  hospital_facade: 46,
  hospital_clean_panel: 46,

  facility_military_barracks: 47,
  fac_preset_n: 47,
  public_military: 47,

  // --- Row 6: 물류·산업 시설 & 확장 (48 ~ 55) ---
  facility_corrugated_blue: 48,
  fac_preset_m: 48,
  facility_panel: 48,

  facility_rd_white: 49,
  fac_preset_o: 49,

  facility_industry_gray: 50,
  fac_preset_p: 50,

  comm_concrete_gray: 51,
  comm_sign_retail_office: 52,
  comm_sign_food_pub: 53,
  roof_dark_slate: 54,
  roof_terracotta_modern: 55,

  // --- Row 7: 추가 PBR 보조 텍스처 (56 ~ 63) ---
  pbr_asphalt_clean: 56,
  pbr_concrete_curb: 57,
  pbr_grass_patch: 58,
  pbr_metal_louver: 59,
  pbr_window_reflection: 60,
  pbr_brick_bump: 61,
  pbr_granite_speckle: 62,
  pbr_zinc_standing_seam: 63,
};

/**
 * UV 좌표 취득 함수 (8x8 그리드 기준, Three.js 텍스처 좌표계 v0/v1)
 */
export function getVworldPhotoSlotUV(slot: number | string): VworldPhotoUVRect {
  let id = 0;
  if (typeof slot === 'number') {
    id = slot;
  } else if (slot in VWORLD_PHOTO_SLOT_MAP) {
    id = VWORLD_PHOTO_SLOT_MAP[slot];
  }
  id = Math.max(0, Math.min(63, Math.floor(id)));

  const col = id % VWORLD_ATLAS_COLS;
  const row = Math.floor(id / VWORLD_ATLAS_COLS);

  const u0 = col / 8.0;
  const u1 = (col + 1) / 8.0;
  const v1 = 1.0 - row / 8.0;
  const v0 = 1.0 - (row + 1) / 8.0;

  return { u0, v0, u1, v1 };
}

// =============================================================================
// [공통 고해상도 그래픽스 유틸리티]
// =============================================================================

function applyFineNoise(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.025): void {
  ctx.save();
  ctx.fillStyle = `rgba(100, 116, 139, ${alpha})`;
  for (let py = y; py < y + h; py += 8) {
    for (let px = x; px < x + w; px += 10) {
      if ((px * 7 + py * 13) % 11 === 0) {
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }
  ctx.restore();
}

/**
 * 브이월드 실사 민트 그린 틴티드 발코니 창문 렌더러
 * - 민트 그린 반사 유리 (#4a6b65) + 상단/대각 하이라이트 글린트 반사 (#9cb8b2)
 * - 얇고 선명한 백색 PVC 창틀 격자 (#ffffff)
 * - 하단 스테인리스 안전 난간대 (핸드레일 + 촘촘한 세로살)
 * - 실외기 루버 그릴
 */
function drawMintBalconyWindow(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  options: {
    frameColor?: string;
    glassBaseColor?: string;
    glassGlintColor?: string;
    hasBalconyRailing?: boolean;
    hasLouverGrill?: boolean;
    hasCurtain?: boolean;
  } = {}
): void {
  const frameColor = options.frameColor || '#ffffff';
  const glassBase = options.glassBaseColor || '#4a6b65';
  const glassGlint = options.glassGlintColor || '#9cb8b2';

  // 1. 외곽 창틀 프레임 (3px 두께)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
  ctx.fillStyle = frameColor;
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

  // 2. 민트 그린 틴티드 유리 바탕
  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  glassGrad.addColorStop(0, glassGlint);
  glassGrad.addColorStop(0.25, glassBase);
  glassGrad.addColorStop(0.70, '#36534d');
  glassGrad.addColorStop(1, '#1b2d28');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 3. 내부 커튼 / 블라인드 (선택적)
  if (options.hasCurtain) {
    ctx.fillStyle = 'rgba(241, 245, 249, 0.45)';
    ctx.fillRect(wx + 4, wy + 4, Math.round(ww * 0.35), Math.round(wh * 0.55));
  }

  // 4. 대각 태양광 반사광 (브이월드 특유의 빛 반사)
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.moveTo(wx + Math.round(ww * 0.15), wy);
  ctx.lineTo(wx + Math.round(ww * 0.55), wy);
  ctx.lineTo(wx + Math.round(ww * 0.35), wy + wh);
  ctx.lineTo(wx, wy + wh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 5. 상단 및 좌측 창틀 오목한 그림자 (깊이감)
  const topShadow = ctx.createLinearGradient(wx, wy, wx, wy + 16);
  topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  topShadow.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = topShadow;
  ctx.fillRect(wx, wy, ww, 16);

  // 6. PVC 십자 멀리언 & 트랜섬 바
  ctx.fillStyle = frameColor;
  // 중앙 수직 멀리언
  const midX = Math.round(wx + ww * 0.5);
  ctx.fillRect(midX - 1.5, wy, 3, wh);
  // 상단 환기창 가로 바 (상단 30%)
  const topY = Math.round(wy + wh * 0.30);
  ctx.fillRect(wx, topY - 1, ww, 2);

  // 7. 하단 스테인리스 베란다 안전 난간 (하단 36% 구간)
  if (options.hasBalconyRailing !== false) {
    const railH = Math.round(wh * 0.36);
    const railY = wy + wh - railH;

    // 핸드레일 상단 바
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wx + 2, railY, ww - 4, 3);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(wx + 2, railY + 3, ww - 4, 1);

    // 수직 살대 (14px 간격)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    for (let rx = wx + 10; rx < wx + ww - 10; rx += 14) {
      ctx.fillRect(rx, railY + 4, 2, railH - 6);
    }
  }

  // 8. 에어컨 실외기 루버 그릴 (우측 하단)
  if (options.hasLouverGrill) {
    const lW = Math.round(ww * 0.25);
    const lH = Math.round(wh * 0.28);
    const lx = wx + ww - lW - 4;
    const ly = wy + wh - lH - 4;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(lx, ly, lW, lH);
    ctx.fillStyle = '#64748b';
    for (let sy = ly + 3; sy < ly + lH - 2; sy += 4) {
      ctx.fillRect(lx + 1, sy, lW - 2, 1.5);
    }
  }
}

/**
 * 한국형 가로 상가 간판 그래픽 렌더러
 */
function drawKoreanSignboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  bgColor: string,
  textColor = '#ffffff',
  accentColor = '#facc15'
): void {
  // 1. 간판 베이스 플레이트 & 입체 테두리
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

  // 간판 그라데이션
  const sGrad = ctx.createLinearGradient(x, y, x, y + h);
  sGrad.addColorStop(0, bgColor);
  sGrad.addColorStop(0.15, bgColor);
  sGrad.addColorStop(1, '#111827');
  ctx.fillStyle = sGrad;
  ctx.fillRect(x, y, w, h);

  // 상단 광택 띠
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(x + 2, y + 2, w - 4, Math.round(h * 0.35));

  // 좌측 액센트 엠블럼 바
  ctx.fillStyle = accentColor;
  ctx.fillRect(x + 4, y + 4, 6, h - 8);

  // 2. 한글 텍스트 (Canvas 폰트 렌더링)
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.max(12, Math.min(22, Math.round(h * 0.52)));
  ctx.font = `bold ${fontSize}px "Pretendard", "Noto Sans KR", -apple-system, sans-serif`;

  // 텍스트 그림자
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  ctx.fillText(text, x + Math.round(w * 0.5), y + Math.round(h * 0.52));
  ctx.restore();
}

/**
 * 1층 상가 필로티 기둥 및 쇼윈도 렌더러
 */
function drawPilotiStorefront(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  themeColor = '#1e293b'
): void {
  // 기둥 배경
  ctx.fillStyle = themeColor;
  ctx.fillRect(x, y, w, h);

  // 좌우 화강석 기둥 (두께 36px)
  const pillarW = 36;
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, pillarW, h);
  ctx.fillRect(x + w - pillarW, y, pillarW, h);

  // 기둥 줄눈
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  for (let py = y + 40; py < y + h; py += 48) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + pillarW, py);
    ctx.moveTo(x + w - pillarW, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  // 중앙 쇼윈도 통유리 구역
  const shopX = x + pillarW + 8;
  const shopW = w - (pillarW + 8) * 2;
  const shopY = y + 24;
  const shopH = h - 36;

  // 유리창 그라데이션 (상가 내부 조명 느낌)
  const shopGrad = ctx.createLinearGradient(shopX, shopY, shopX, shopY + shopH);
  shopGrad.addColorStop(0, '#0f172a');
  shopGrad.addColorStop(0.4, '#1e293b');
  shopGrad.addColorStop(0.9, '#334155');
  shopGrad.addColorStop(1, '#475569');
  ctx.fillStyle = shopGrad;
  ctx.fillRect(shopX, shopY, shopW, shopH);

  // 내부 온화한 전구색 조명 반사
  ctx.fillStyle = 'rgba(254, 240, 138, 0.12)';
  ctx.fillRect(shopX, shopY, shopW, shopH);

  // 자동문 프레임 및 손잡이
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(shopX, shopY, shopW, shopH);

  const doorMid = Math.round(shopX + shopW * 0.5);
  ctx.beginPath();
  ctx.moveTo(doorMid, shopY);
  ctx.lineTo(doorMid, shopY + shopH);
  ctx.stroke();

  // 자동문 push 버튼
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(doorMid - 14, shopY + Math.round(shopH * 0.5), 10, 4);
  ctx.fillRect(doorMid + 4, shopY + Math.round(shopH * 0.5), 10, 4);
}

// =============================================================================
// [64개 개별 슬롯 렌더러 함수군]
// =============================================================================

// --- Row 0: 한국형 아파트 8종 파사드 ---

function drawAptStyle1(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 1: 밝은 크림 화이트(#f5f3ee) + 민트그린 발코니창 + 하단 브라운(#a67c52) 투톤
  ctx.fillStyle = '#f5f3ee';
  ctx.fillRect(x, y, w, h);

  // 하단 1~3층 따뜻한 브라운 투톤 도색 구간
  const baseH = Math.round(h * 0.28);
  ctx.fillStyle = '#a67c52';
  ctx.fillRect(x, y + h - baseH, w, baseH);
  ctx.fillStyle = '#8c583a';
  ctx.fillRect(x, y + h - baseH, w, 4);

  // 층간 가로 슬래브 줄눈
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y + 28, w, 3);
  ctx.fillRect(x, y + Math.round(h * 0.52), w, 3);

  // 좌우 기둥 멀리언
  ctx.fillStyle = '#ebe5dc';
  ctx.fillRect(x, y, 32, h);
  ctx.fillRect(x + w - 32, y, 32, h);

  // 발코니 창문 2개 배치 (민트 그린 틴티드 유리)
  const winW = Math.round(w * 0.38);
  const winH = Math.round(h * 0.38);
  const winY1 = y + 42;

  drawMintBalconyWindow(ctx, x + 44, winY1, winW, winH, {
    frameColor: '#ffffff',
    glassBaseColor: '#4a6b65',
    glassGlintColor: '#9cb8b2',
    hasBalconyRailing: true,
    hasLouverGrill: true,
  });

  drawMintBalconyWindow(ctx, x + w - winW - 44, winY1, winW, winH, {
    frameColor: '#ffffff',
    glassBaseColor: '#4a6b65',
    glassGlintColor: '#9cb8b2',
    hasBalconyRailing: true,
    hasLouverGrill: false,
    hasCurtain: true,
  });

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawAptStyle2(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 2: 소프트 샌드 베이지(#e8e1d5) + 민트그린 발코니 + 하단 황토색(#8c583a)
  ctx.fillStyle = '#e8e1d5';
  ctx.fillRect(x, y, w, h);

  // 하단 황토색 기단부
  const baseH = Math.round(h * 0.26);
  ctx.fillStyle = '#8c583a';
  ctx.fillRect(x, y + h - baseH, w, baseH);
  ctx.fillStyle = '#6e3f28';
  ctx.fillRect(x, y + h - baseH, w, 4);

  // 층간 슬래브 줄눈
  ctx.fillStyle = '#d4c7b2';
  ctx.fillRect(x, y + 24, w, 3);
  ctx.fillRect(x, y + Math.round(h * 0.50), w, 3);

  const winW = Math.round(w * 0.76);
  const winH = Math.round(h * 0.40);
  const winX = x + Math.round((w - winW) * 0.5);
  const winY = y + 40;

  drawMintBalconyWindow(ctx, winX, winY, winW, winH, {
    frameColor: '#ffffff',
    glassBaseColor: '#4a6b65',
    glassGlintColor: '#9cb8b2',
    hasBalconyRailing: true,
    hasLouverGrill: true,
  });

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawAptStyle3(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 3: 아이보리 화이트(#faf7f0) + 상층부 브라운 액센트 밴드(#936848) + 민트그린
  ctx.fillStyle = '#faf7f0';
  ctx.fillRect(x, y, w, h);

  // 상층부 브라운 액센트 밴드
  ctx.fillStyle = '#936848';
  ctx.fillRect(x, y, w, 28);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x, y + 28, w, 3);

  // 창문 2개 분할
  const winW = Math.round(w * 0.38);
  const winH = Math.round(h * 0.42);
  const winY = y + 44;

  drawMintBalconyWindow(ctx, x + 40, winY, winW, winH, {
    frameColor: '#ffffff',
    glassBaseColor: '#456860',
    glassGlintColor: '#9bb8b0',
    hasBalconyRailing: true,
    hasLouverGrill: true,
  });
  drawMintBalconyWindow(ctx, x + w - winW - 40, winY, winW, winH, {
    frameColor: '#ffffff',
    glassBaseColor: '#456860',
    glassGlintColor: '#9bb8b0',
    hasBalconyRailing: true,
    hasLouverGrill: false,
  });

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawAptStyle4(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 4: 어반 웜그레이(#dcd8d0) & 다크 차콜 계단실 코어 창(#27272a)
  ctx.fillStyle = '#dcd8d0';
  ctx.fillRect(x, y, w, h);

  // 중앙 수직 다크 차콜 계단실 코어
  const coreW = Math.round(w * 0.28);
  const coreX = x + Math.round((w - coreW) * 0.5);
  ctx.fillStyle = '#27272a';
  ctx.fillRect(coreX, y, coreW, h);

  // 계단실 세로 창문
  ctx.fillStyle = '#64748b';
  for (let py = y + 16; py < y + h - 20; py += 38) {
    ctx.fillRect(coreX + 8, py, coreW - 16, 24);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(coreX + 8, py, coreW - 16, 2);
    ctx.fillStyle = '#64748b';
  }

  // 좌우 세대 발코니 창문
  const winW = Math.round((coreX - x) * 0.72);
  const winH = Math.round(h * 0.42);
  const winY = y + 42;

  drawMintBalconyWindow(ctx, x + 16, winY, winW, winH, {
    frameColor: '#ffffff',
    hasBalconyRailing: true,
  });
  drawMintBalconyWindow(ctx, x + w - winW - 16, winY, winW, winH, {
    frameColor: '#ffffff',
    hasBalconyRailing: true,
  });

  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawAptStyle5(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 5: 모던 라이트 그레이(#d5d0c7) + 차콜 수직 핀 스트라이프
  ctx.fillStyle = '#d5d0c7';
  ctx.fillRect(x, y, w, h);

  // 차콜 수직 스트라이프
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(x + Math.round(w * 0.48), y, 16, h);

  const winW = Math.round(w * 0.36);
  const winH = Math.round(h * 0.42);
  const winY = y + 40;

  drawMintBalconyWindow(ctx, x + 32, winY, winW, winH, { frameColor: '#ffffff', hasBalconyRailing: true });
  drawMintBalconyWindow(ctx, x + w - winW - 32, winY, winW, winH, { frameColor: '#ffffff', hasBalconyRailing: true });

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawAptStyle6(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 6: 웜 베이지(#e5ded2) + 테라코타 브라운 기단(#7c4432)
  ctx.fillStyle = '#e5ded2';
  ctx.fillRect(x, y, w, h);

  const baseH = Math.round(h * 0.30);
  ctx.fillStyle = '#7c4432';
  ctx.fillRect(x, y + h - baseH, w, baseH);

  const winW = Math.round(w * 0.78);
  const winH = Math.round(h * 0.38);
  drawMintBalconyWindow(ctx, x + Math.round((w - winW) * 0.5), y + 36, winW, winH, {
    frameColor: '#ffffff',
    glassBaseColor: '#486862',
    hasBalconyRailing: true,
  });

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawAptStyle7(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 7: 주상복합 하이엔드 타워 - 에메랄드 통유리 커튼월(#2c5f56) + 화이트 수직 핀
  const emGrad = ctx.createLinearGradient(x, y, x, y + h);
  emGrad.addColorStop(0, '#2c5f56');
  emGrad.addColorStop(0.3, '#68a69b');
  emGrad.addColorStop(0.7, '#1b3f38');
  emGrad.addColorStop(1, '#0e2420');
  ctx.fillStyle = emGrad;
  ctx.fillRect(x, y, w, h);

  // 화이트 알루미늄 수직 핀 루버 (Vertical Fin Mullions)
  ctx.fillStyle = '#ffffff';
  for (let px = x + 32; px < x + w; px += 48) {
    ctx.fillRect(px, y, 4, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(px + 4, y, 2, h);
    ctx.fillStyle = '#ffffff';
  }

  // 층간 스팬드럴 글래스 가로 띠
  for (let py = y + 54; py < y + h; py += 64) {
    ctx.fillStyle = '#0f2922';
    ctx.fillRect(x, py, w, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, py + 8, w, 2);
  }

  applyFineNoise(ctx, x, y, w, h, 0.015);
}

function drawAptStyle8(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 스타일 8: 신축 타워 블루그레이 반사 통유리(#334e68) + 화이트 프레임
  const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
  bgGrad.addColorStop(0, '#334e68');
  bgGrad.addColorStop(0.35, '#829ab1');
  bgGrad.addColorStop(0.8, '#1b2d3d');
  bgGrad.addColorStop(1, '#0c1720');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(x, y, w, h);

  // 화이트 알루미늄 그리드
  ctx.fillStyle = '#ffffff';
  for (let px = x + 40; px < x + w; px += 56) {
    ctx.fillRect(px, y, 3, h);
  }
  for (let py = y + 50; py < y + h; py += 58) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, py, w, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, py + 6, w, 2);
  }

  applyFineNoise(ctx, x, y, w, h, 0.015);
}

// --- Row 1: 아파트 측벽 (8~11) & 1층 쇼윈도 (12~15) ---

function drawAptSideWallGeneric(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  wallColor: string,
  brandColor: string,
  dongNum: string
): void {
  // 매끈한 콘크리트 바탕
  ctx.fillStyle = wallColor;
  ctx.fillRect(x, y, w, h);

  // 수직 컬러 브랜드 밴드 (폭 56px)
  const bandX = x + Math.round(w * 0.28);
  ctx.fillStyle = brandColor;
  ctx.fillRect(bandX, y, 56, h);

  // 하이라이트 골드/화이트 얇은 라인
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bandX + 56, y, 3, h);

  // 동 번호 블록 (상단 25% 지점)
  const numBoxW = 140;
  const numBoxH = 68;
  const numBoxX = x + Math.round((w - numBoxW) * 0.5);
  const numBoxY = y + Math.round(h * 0.22);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(numBoxX - 2, numBoxY - 2, numBoxW + 4, numBoxH + 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(numBoxX, numBoxY, numBoxW, numBoxH);

  // 동 번호 텍스트
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.fillText(dongNum, numBoxX + Math.round(numBoxW * 0.5), numBoxY + Math.round(numBoxH * 0.5));
  ctx.restore();

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawAptSideBrown(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawAptSideWallGeneric(ctx, x, y, w, h, '#f5f3ee', '#6b5344', '101');
}

function drawAptSideWarmgray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawAptSideWallGeneric(ctx, x, y, w, h, '#dcd8d0', '#57534e', '102');
}

function drawAptSideTerracotta(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawAptSideWallGeneric(ctx, x, y, w, h, '#e8e1d5', '#8c3b2b', '103');
}

function drawAptSideNavy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawAptSideWallGeneric(ctx, x, y, w, h, '#ebe5d8', '#1e3a5f', '105');
}

function drawCommGroundShop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawPilotiStorefront(ctx, x, y, w, h, '#1e293b');
}

function drawCommGroundCafe(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawPilotiStorefront(ctx, x, y, w, h, '#292524');
  // 카페 어닝(차양)
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(x + 40, y + 16, w - 80, 20);
  ctx.fillStyle = '#ffffff';
  for (let px = x + 40; px < x + w - 40; px += 24) {
    ctx.fillRect(px, y + 16, 12, 20);
  }
}

function drawCommGroundBank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawPilotiStorefront(ctx, x, y, w, h, '#1e3a8a');
}

function drawCommGroundMart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawPilotiStorefront(ctx, x, y, w, h, '#047857');
}

// --- Row 2: 상업 빌딩 가로 간판 & 커튼월 (16~23) ---

function drawCommSignClinicPharmacy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 베이지 알루미늄 복합패널 외벽
  ctx.fillStyle = '#dfd8cc';
  ctx.fillRect(x, y, w, h);

  // 창문 3개
  const winW = Math.round((w - 80) / 3);
  const winH = Math.round(h * 0.45);
  const winY = y + 36;
  for (let i = 0; i < 3; i++) {
    const wx = x + 24 + i * (winW + 16);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);
    ctx.fillStyle = '#334155';
    ctx.fillRect(wx, winY, winW, winH);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(wx, winY, winW, 2);
  }

  // 상단 간판: 온누리약국 (Green & Red Cross)
  drawKoreanSignboard(ctx, x + 20, y + Math.round(h * 0.62), Math.round(w * 0.44), 48, '온누리약국', '#15803d', '#ffffff', '#ef4444');

  // 우측 간판: 서울연세치과 (Blue & White)
  drawKoreanSignboard(ctx, x + Math.round(w * 0.50), y + Math.round(h * 0.62), Math.round(w * 0.46), 48, '서울연세치과', '#1d4ed8', '#ffffff', '#facc15');

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawCommSignAcademyStudy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 그레이 알루미늄 복합패널
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y, w, h);

  // 창문 3개
  const winW = Math.round((w - 80) / 3);
  const winH = Math.round(h * 0.45);
  const winY = y + 36;
  for (let i = 0; i < 3; i++) {
    const wx = x + 24 + i * (winW + 16);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(wx, winY, winW, winH);
  }

  // 상단 간판: 대성학원 초중고
  drawKoreanSignboard(ctx, x + 20, y + Math.round(h * 0.62), Math.round(w * 0.44), 48, '대성학원', '#b91c1c', '#ffffff', '#facc15');

  // 우측 간판: 청담어학원
  drawKoreanSignboard(ctx, x + Math.round(w * 0.50), y + Math.round(h * 0.62), Math.round(w * 0.46), 48, '청담어학원', '#1e3a8a', '#ffffff', '#38bdf8');

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawCommSignCafeBakery(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 화강석 타일 외벽
  ctx.fillStyle = '#e2dacb';
  ctx.fillRect(x, y, w, h);

  // 화강석 타일 줄눈
  ctx.strokeStyle = '#c5baaa';
  ctx.lineWidth = 1;
  for (let py = y; py < y + h; py += 36) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  // 창문
  const winW = Math.round(w * 0.78);
  const winH = Math.round(h * 0.42);
  const winX = x + Math.round((w - winW) * 0.5);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX, y + 32, winW, winH);

  // 간판: 파리바게뜨
  drawKoreanSignboard(ctx, x + 28, y + Math.round(h * 0.60), Math.round(w * 0.52), 52, '파리바게뜨', '#0f2942', '#ffffff', '#f59e0b');

  // 간판: 투썸플레이스
  drawKoreanSignboard(ctx, x + Math.round(w * 0.56), y + Math.round(h * 0.60), Math.round(w * 0.40), 52, '투썸플레이스', '#831843', '#ffffff', '#f43f5e');

  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawCommSignFitnessYoga(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 모던 차콜 징크 메탈
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(x, y, w, h);

  // 간판: 피트니스 & GYM 24H
  drawKoreanSignboard(ctx, x + 20, y + Math.round(h * 0.58), Math.round(w * 0.48), 52, '피트니스 GYM', '#18181b', '#facc15', '#e11d48');

  // 간판: 필라테스 & 요가
  drawKoreanSignboard(ctx, x + Math.round(w * 0.52), y + Math.round(h * 0.58), Math.round(w * 0.44), 52, '필라테스·요가', '#4c0519', '#fda4af', '#f43f5e');

  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawCommGraniteOffice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#d6cfc2';
  ctx.fillRect(x, y, w, h);
  // 석재 줄눈
  ctx.strokeStyle = '#baa893';
  ctx.lineWidth = 1;
  for (let py = y; py < y + h; py += 38) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  // 대형 오피스 창문
  const winW = Math.round(w * 0.82);
  const winH = Math.round(h * 0.48);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + Math.round((w - winW) * 0.5), y + 36, winW, winH);
  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawCommSkyCurtain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const cGrad = ctx.createLinearGradient(x, y, x, y + h);
  cGrad.addColorStop(0, '#64748b');
  cGrad.addColorStop(0.3, '#93c5fd');
  cGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = cGrad;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#cbd5e1';
  for (let px = x + 36; px < x + w; px += 44) ctx.fillRect(px, y, 2, h);
  for (let py = y + 42; py < y + h; py += 48) ctx.fillRect(x, py, w, 3);
  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawCommEmeraldGlass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const eGrad = ctx.createLinearGradient(x, y, x, y + h);
  eGrad.addColorStop(0, '#047857');
  eGrad.addColorStop(0.4, '#10b981');
  eGrad.addColorStop(1, '#064e3b');
  ctx.fillStyle = eGrad;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#ffffff';
  for (let px = x + 32; px < x + w; px += 42) ctx.fillRect(px, y, 2, h);
  for (let py = y + 40; py < y + h; py += 46) ctx.fillRect(x, py, w, 2);
  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawCommCharcoalPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#27272a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#52525b';
  for (let px = x + 24; px < x + w; px += 32) ctx.fillRect(px, y, 2, h);
  applyFineNoise(ctx, x, y, w, h, 0.02);
}

// --- Row 3: 저층 주택(24~27) & 학교·공공(28~31) ---

function drawVillaRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 적벽돌(#8c3f30)
  ctx.fillStyle = '#8c3f30';
  ctx.fillRect(x, y, w, h);

  // 백색 모르타르 줄눈
  ctx.fillStyle = 'rgba(230, 220, 210, 0.35)';
  for (let py = y; py < y + h; py += 12) ctx.fillRect(x, py, w, 1);
  for (let px = x; px < x + w; px += 24) ctx.fillRect(px, y, 1, h);

  // 창문 2개
  const winW = Math.round(w * 0.38);
  const winH = Math.round(h * 0.44);
  const winY = y + 36;
  drawMintBalconyWindow(ctx, x + 36, winY, winW, winH, { frameColor: '#ffffff', hasBalconyRailing: false });
  drawMintBalconyWindow(ctx, x + w - winW - 36, winY, winW, winH, { frameColor: '#ffffff', hasBalconyRailing: false });

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawVillaBrownBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 황토/갈색 벽돌(#9a6b4c)
  ctx.fillStyle = '#9a6b4c';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(210, 195, 180, 0.35)';
  for (let py = y; py < y + h; py += 14) ctx.fillRect(x, py, w, 1);

  const winW = Math.round(w * 0.72);
  const winH = Math.round(h * 0.44);
  drawMintBalconyWindow(ctx, x + Math.round((w - winW) * 0.5), y + 36, winW, winH, {
    frameColor: '#ffffff',
    hasBalconyRailing: false,
  });

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawVillaStuccoIvory(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 아이보리 드라이비트(#ebe5d8)
  ctx.fillStyle = '#ebe5d8';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#c7bca8';
  ctx.fillRect(x, y, w, 16); // 처마 몰딩

  const winW = Math.round(w * 0.42);
  const winH = Math.round(h * 0.44);
  drawMintBalconyWindow(ctx, x + 32, y + 38, winW, winH, { frameColor: '#78350f', hasBalconyRailing: false });
  drawMintBalconyWindow(ctx, x + w - winW - 32, y + 38, winW, winH, { frameColor: '#78350f', hasBalconyRailing: false });

  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawVillaGranite(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 베이지 화강석 타일(#dcd4c6)
  ctx.fillStyle = '#dcd4c6';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(150, 140, 130, 0.40)';
  for (let py = y; py < y + h; py += 32) ctx.fillRect(x, py, w, 1.5);
  for (let px = x; px < x + w; px += 44) ctx.fillRect(px, y, 1.5, h);

  const winW = Math.round(w * 0.76);
  const winH = Math.round(h * 0.42);
  drawMintBalconyWindow(ctx, x + Math.round((w - winW) * 0.5), y + 36, winW, winH, { frameColor: '#ffffff', hasBalconyRailing: false });

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawSchoolTerracottaBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 학교: 따뜻한 오렌지 테라코타/살구색(#d97746) 교사동 외벽
  ctx.fillStyle = '#d97746';
  ctx.fillRect(x, y, w, h);

  // 상단 콘크리트 처마 & 가로 슬래브 차양 띠
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, 18);
  ctx.fillRect(x, y + Math.round(h * 0.52), w, 8);

  // 학교 대형 격자창 (교실 3개 분할)
  const roomW = Math.round((w - 56) / 3);
  const roomH = Math.round(h * 0.38);
  const roomY = y + 30;

  for (let r = 0; r < 3; r++) {
    const rx = x + 16 + r * (roomW + 12);

    // 창틀
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx - 2, roomY - 2, roomW + 4, roomH + 4);

    // 내부 녹색 칠판 느낌 유리
    const cGrad = ctx.createLinearGradient(rx, roomY, rx, roomY + roomH);
    cGrad.addColorStop(0, '#1e3a5f');
    cGrad.addColorStop(0.5, '#064e3b');
    cGrad.addColorStop(1, '#022c22');
    ctx.fillStyle = cGrad;
    ctx.fillRect(rx, roomY, roomW, roomH);

    // 격자 멀리언
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx + Math.round(roomW * 0.33), roomY, 2, roomH);
    ctx.fillRect(rx + Math.round(roomW * 0.66), roomY, 2, roomH);
    ctx.fillRect(rx, roomY + Math.round(roomH * 0.5), roomW, 2);
  }

  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawSchoolRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 학교: 따뜻한 적벽돌 교사동(#9c4936)
  ctx.fillStyle = '#9c4936';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, 16);
  ctx.fillRect(x, y + Math.round(h * 0.52), w, 6);

  const roomW = Math.round((w - 56) / 3);
  const roomH = Math.round(h * 0.38);
  for (let r = 0; r < 3; r++) {
    const rx = x + 16 + r * (roomW + 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx - 2, y + 28, roomW + 4, roomH + 4);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(rx, y + 30, roomW, roomH);
  }
  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawGovPodium(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 화강석 포디움
  ctx.fillStyle = '#e2dcd3';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#cac3b8';
  ctx.lineWidth = 1;
  for (let py = y; py < y + h; py += 48) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  // 중앙 유리 아트리움 현관
  const atW = Math.round(w * 0.72);
  const atH = Math.round(h * 0.68);
  const atX = x + Math.round((w - atW) * 0.5);
  const atY = y + Math.round(h * 0.26);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(atX, atY, atW, atH);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.strokeRect(atX, atY, atW, atH);

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawGovTower(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 은청색 커튼월 타워
  const skyGrad = ctx.createLinearGradient(x, y, x, y + h);
  skyGrad.addColorStop(0, '#64748b');
  skyGrad.addColorStop(0.4, '#93c5fd');
  skyGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#cbd5e1';
  for (let px = x + 36; px < x + w; px += 44) ctx.fillRect(px, y, 3, h);
  applyFineNoise(ctx, x, y, w, h, 0.02);
}

// --- Row 4: 옥상 4대 마감 & 파라펫/옥탑 (32~39) ---

function drawRoofUrethaneSage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1) 우레탄 방수 세이지 그린(#3b6e52)
  ctx.fillStyle = '#3b6e52';
  ctx.fillRect(x, y, w, h);

  // 미세 신축 줄눈 그리드 (120px 격자)
  ctx.strokeStyle = 'rgba(25, 60, 42, 0.45)';
  ctx.lineWidth = 2;
  for (let py = y + 120; py < y + h; py += 120) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  for (let px = x + 120; px < x + w; px += 120) {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }

  // 빗물 배수구 드레인 자국
  const drainX = x + Math.round(w * 0.75);
  const drainY = y + Math.round(h * 0.75);
  ctx.fillStyle = '#1e382b';
  ctx.beginPath();
  ctx.arc(drainX, drainY, 14, 0, Math.PI * 2);
  ctx.fill();

  applyFineNoise(ctx, x, y, w, h, 0.035);
}

function drawRoofConcreteWarmgray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 2) 콘크리트 회색 슬래브(#828282)
  ctx.fillStyle = '#828282';
  ctx.fillRect(x, y, w, h);

  // 콘크리트 줄눈
  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 2;
  for (let py = y + 96; py < y + h; py += 96) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  for (let px = x + 96; px < x + w; px += 96) {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }

  applyFineNoise(ctx, x, y, w, h, 0.04);
}

function drawRoofTerracottaTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 3) 적갈색 기와(#6e3f32)
  ctx.fillStyle = '#6e3f32';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = '#4a281e';
  ctx.lineWidth = 3;
  for (let py = y + 24; py < y + h; py += 24) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawRoofZincBlue(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 4) 코발트 블루 징크(#254e7a)
  ctx.fillStyle = '#254e7a';
  ctx.fillRect(x, y, w, h);

  // 돌출 잇기 세로 리브
  ctx.fillStyle = '#1e3a5f';
  for (let px = x + 24; px < x + w; px += 28) {
    ctx.fillRect(px, y, 3, h);
  }

  applyFineNoise(ctx, x, y, w, h, 0.025);
}

function drawRoofSchoolGreen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 학교 옥상: 청록/에메랄드 세이지(#2e6b5d)
  ctx.fillStyle = '#2e6b5d';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#1b453b';
  ctx.lineWidth = 2;
  for (let py = y + 80; py < y + h; py += 80) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawParapetConcrete(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 파라펫 난간 캡
  ctx.fillStyle = '#d4d4d8';
  ctx.fillRect(x, y, w, h);

  // 상단 캡 몰딩 하이라이트
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = '#a1a1aa';
  ctx.fillRect(x, y + 12, w, 3);
  ctx.fillRect(x, y + h - 6, w, 6);

  applyFineNoise(ctx, x, y, w, h, 0.02);
}

function drawPenthouseWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 옥탑방/기계실 외벽
  ctx.fillStyle = '#78716c';
  ctx.fillRect(x, y, w, h);

  // 환기 루버 그릴
  const louverW = Math.round(w * 0.52);
  const louverH = Math.round(h * 0.42);
  const lx = x + Math.round((w - louverW) * 0.5);
  const ly = y + Math.round((h - louverH) * 0.5);

  ctx.fillStyle = '#1c1917';
  ctx.fillRect(lx, ly, louverW, louverH);
  ctx.fillStyle = '#a8a29e';
  for (let sy = ly + 4; sy < ly + louverH - 2; sy += 6) {
    ctx.fillRect(lx + 2, sy, louverW - 4, 2);
  }

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawCrownFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 16, y + 16, w - 32, h - 32);
}

// --- Row 5: 랜드마크 & 특수 시설 (40~47) ---

function drawHelipadH(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 옥상 헬리패드
  ctx.fillStyle = '#1b5e20';
  ctx.fillRect(x, y, w, h);

  // 황색 테두리
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.strokeRect(x + 16, y + 16, w - 32, h - 32);

  const cx = x + Math.round(w * 0.5);
  const cy = y + Math.round(h * 0.5);
  const r = Math.round(Math.min(w, h) * 0.36);

  // 백색 원
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // 백색 'H' 마크
  const hW = Math.round(r * 0.95);
  const hH = Math.round(r * 1.15);
  const barThick = Math.round(r * 0.26);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - Math.round(hW * 0.5), cy - Math.round(hH * 0.5), barThick, hH);
  ctx.fillRect(cx + Math.round(hW * 0.5) - barThick, cy - Math.round(hH * 0.5), barThick, hH);
  ctx.fillRect(cx - Math.round(hW * 0.5), cy - Math.round(barThick * 0.5), hW, barThick);

  applyFineNoise(ctx, x, y, w, h, 0.03);
}

function drawSolarPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, h);

  const cCols = 4;
  const cRows = 4;
  const cW = (w - 32) / cCols;
  const cH = (h - 32) / cRows;

  for (let r = 0; r < cRows; r++) {
    for (let c = 0; c < cCols; c++) {
      const cx = x + 16 + c * cW;
      const cy = y + 16 + r * cH;

      const pGrad = ctx.createLinearGradient(cx, cy, cx + cW, cy + cH);
      pGrad.addColorStop(0, '#1e3a8a');
      pGrad.addColorStop(0.5, '#0284c7');
      pGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = pGrad;
      ctx.fillRect(cx + 2, cy + 2, cW - 4, cH - 4);
    }
  }
}

function drawTerraceGarden(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#3f6212';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#78716c';
  ctx.fillRect(x + 24, y + 24, w - 48, h - 48);
}

function drawKtxStation(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 24, y + 24, w - 48, h - 48);
}

function drawCanopyGlass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
}

function drawPoliceFireFacade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(x, y + Math.round(h * 0.35), w, 32);
}

function drawHospitalFacade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, w, h);

  // 적십자 마크
  const cx = x + Math.round(w * 0.5);
  const cy = y + 42;
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 6, cy - 20, 12, 40);
  ctx.fillRect(cx - 20, cy - 6, 40, 12);
}

function drawMilitaryBarracks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#e2dbcc';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#3f4b3b';
  ctx.fillRect(x, y, w, 24);
}

// --- Row 6: 물류·산업 및 기타 (48~55) ---

function drawFacilityBlue(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  for (let px = x + 16; px < x + w; px += 24) ctx.fillRect(px, y, 3, h);
}

function drawFacilityWhite(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#94a3b8';
  for (let py = y + 40; py < y + h; py += 48) ctx.fillRect(x, py, w, 2);
}

function drawFacilityGray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, w, h);
}

function drawCommConcreteGray(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(x, y, w, h);
}

function drawCommRetailOffice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawCommSignClinicPharmacy(ctx, x, y, w, h);
}

function drawCommFoodPub(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  drawCommSignCafeBakery(ctx, x, y, w, h);
}

function drawRoofDarkSlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#57534e';
  ctx.fillRect(x, y, w, h);
}

function drawRoofTerracottaModern(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#7c3f30';
  ctx.fillRect(x, y, w, h);
}

// --- Row 7: PBR 보조 텍스처 (56~63) ---
function drawDummyPbrSlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  applyFineNoise(ctx, x, y, w, h, 0.02);
}

// =============================================================================
// [64개 슬롯 함수 배열]
// =============================================================================

const ALL_64_RENDERERS: ((ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void)[] = [
  // Row 0: 아파트 8종
  drawAptStyle1,
  drawAptStyle2,
  drawAptStyle3,
  drawAptStyle4,
  drawAptStyle5,
  drawAptStyle6,
  drawAptStyle7,
  drawAptStyle8,

  // Row 1: 아파트 측벽(8~11) & 쇼윈도(12~15)
  drawAptSideBrown,
  drawAptSideWarmgray,
  drawAptSideTerracotta,
  drawAptSideNavy,
  drawCommGroundShop,
  drawCommGroundCafe,
  drawCommGroundBank,
  drawCommGroundMart,

  // Row 2: 상업 간판 및 커튼월
  drawCommSignClinicPharmacy,
  drawCommSignAcademyStudy,
  drawCommSignCafeBakery,
  drawCommSignFitnessYoga,
  drawCommGraniteOffice,
  drawCommSkyCurtain,
  drawCommEmeraldGlass,
  drawCommCharcoalPanel,

  // Row 3: 저층 빌라 및 학교·공공
  drawVillaRedBrick,
  drawVillaBrownBrick,
  drawVillaStuccoIvory,
  drawVillaGranite,
  drawSchoolTerracottaBrick,
  drawSchoolRedBrick,
  drawGovPodium,
  drawGovTower,

  // Row 4: 옥상 4대 마감 및 파라펫/옥탑
  drawRoofUrethaneSage,
  drawRoofConcreteWarmgray,
  drawRoofTerracottaTile,
  drawRoofZincBlue,
  drawRoofSchoolGreen,
  drawParapetConcrete,
  drawPenthouseWall,
  drawCrownFrame,

  // Row 5: 랜드마크 & 특수 시설
  drawHelipadH,
  drawSolarPanel,
  drawTerraceGarden,
  drawKtxStation,
  drawCanopyGlass,
  drawPoliceFireFacade,
  drawHospitalFacade,
  drawMilitaryBarracks,

  // Row 6: 물류·산업 및 기타
  drawFacilityBlue,
  drawFacilityWhite,
  drawFacilityGray,
  drawCommConcreteGray,
  drawCommRetailOffice,
  drawCommFoodPub,
  drawRoofDarkSlate,
  drawRoofTerracottaModern,

  // Row 7: PBR 보조 슬롯
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#2a2d34'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#94a3b8'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#3f6212'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#52525b'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#93c5fd'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#7c3f30'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#dcd4c6'),
  (ctx, x, y, w, h) => drawDummyPbrSlot(ctx, x, y, w, h, '#254e7a'),
];

// =============================================================================
// [아틀라스 생성 및 Three.js 텍스처 캐싱]
// =============================================================================

let cachedDiffuseAtlasTexture: THREE.CanvasTexture | null = null;
let cachedRmaAtlasTexture: THREE.CanvasTexture | null = null;

export function createVworldPhotoAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return { width: 16, height: 16 } as any;
  }

  const canvas = document.createElement('canvas');
  canvas.width = VWORLD_ATLAS_SIZE;
  canvas.height = VWORLD_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  for (let slotId = 0; slotId < 64; slotId++) {
    const col = slotId % VWORLD_ATLAS_COLS;
    const row = Math.floor(slotId / VWORLD_ATLAS_COLS);
    const x = col * VWORLD_CELL_SIZE;
    const y = row * VWORLD_CELL_SIZE;

    if (ALL_64_RENDERERS[slotId]) {
      ALL_64_RENDERERS[slotId](ctx, x, y, VWORLD_CELL_SIZE, VWORLD_CELL_SIZE);
    }
  }

  return canvas;
}

export function getVworldPhotoAtlasTexture(): THREE.CanvasTexture {
  if (cachedDiffuseAtlasTexture) return cachedDiffuseAtlasTexture;

  const canvas = createVworldPhotoAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  cachedDiffuseAtlasTexture = texture;
  return texture;
}

export function createVworldPhotoRmaCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return { width: 16, height: 16 } as any;
  }

  const canvas = document.createElement('canvas');
  canvas.width = VWORLD_ATLAS_SIZE;
  canvas.height = VWORLD_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 기본 바탕 (콘크리트 벽체: R=217, G=10, B=255)
  ctx.fillStyle = 'rgb(217, 10, 255)';
  ctx.fillRect(0, 0, VWORLD_ATLAS_SIZE, VWORLD_ATLAS_SIZE);

  for (let slotId = 0; slotId < 64; slotId++) {
    const col = slotId % VWORLD_ATLAS_COLS;
    const row = Math.floor(slotId / VWORLD_ATLAS_COLS);
    const x = col * VWORLD_CELL_SIZE;
    const y = row * VWORLD_CELL_SIZE;

    // 1. 아파트 발코니 창문 & 상업 커튼월 (유리: R=38, G=217, B=220)
    if ((slotId >= 0 && slotId <= 7) || (slotId >= 21 && slotId <= 23)) {
      const winW = Math.round(VWORLD_CELL_SIZE * 0.75);
      const winH = Math.round(VWORLD_CELL_SIZE * 0.42);
      const winX = x + Math.round((VWORLD_CELL_SIZE - winW) * 0.5);
      const winY = y + 36;
      ctx.fillStyle = 'rgb(38, 217, 220)';
      ctx.fillRect(winX, winY, winW, winH);
    }
    // 2. 우레탄 옥상 (R=89, G=10, B=255)
    else if (slotId === 32 || slotId === 36) {
      ctx.fillStyle = 'rgb(89, 10, 255)';
      ctx.fillRect(x, y, VWORLD_CELL_SIZE, VWORLD_CELL_SIZE);
    }
    // 3. 징크/금속 루프 (R=50, G=180, B=255)
    else if (slotId === 35 || slotId === 48) {
      ctx.fillStyle = 'rgb(50, 180, 255)';
      ctx.fillRect(x, y, VWORLD_CELL_SIZE, VWORLD_CELL_SIZE);
    }
    // 4. 태양광 패널 (R=25, G=230, B=240)
    else if (slotId === 41) {
      ctx.fillStyle = 'rgb(25, 230, 240)';
      ctx.fillRect(x, y, VWORLD_CELL_SIZE, VWORLD_CELL_SIZE);
    }
  }

  return canvas;
}

export function getVworldPhotoRmaTexture(): THREE.CanvasTexture {
  if (cachedRmaAtlasTexture) return cachedRmaAtlasTexture;

  const canvas = createVworldPhotoRmaCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  cachedRmaAtlasTexture = texture;
  return texture;
}

export function disposeVworldPhotoAtlas(): void {
  if (cachedDiffuseAtlasTexture) {
    cachedDiffuseAtlasTexture.dispose();
    cachedDiffuseAtlasTexture = null;
  }
  if (cachedRmaAtlasTexture) {
    cachedRmaAtlasTexture.dispose();
    cachedRmaAtlasTexture = null;
  }
}
