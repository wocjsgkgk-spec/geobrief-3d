/**
 * utils/vworld16AtlasBuilder.ts
 *
 * [GeoBrief 3D 2단계: 브이월드(V-World 3D) morluto/rea 역공학 16종 실사 포토 아틀라스 엔진]
 *
 * 브이월드 실사 3D 타일 및 강원 18개 시·군(원주 반곡동·단구동·무실동, 춘천, 강릉 등)
 * 실제 건축물 입면을 16가지 독립 카테고리로 절차적 합성하는 4096×4096 (4×4 그리드, 각 1024×1024px)
 * 고해상도 PBR 마스터 아틀라스 캔버스 엔진입니다.
 *
 * [16종 실사 건물 파사드 슬롯 규격]:
 * - 슬롯 0~3: 한국형 고층 아파트 4종
 *   * 슬롯 0: 화이트 & 민트그레이 투톤 발코니 샤시 아파트
 *   * 슬롯 1: 샌드베이지 & 모던 브라운 스트라이프 아파트 (LH / 푸르지오 스타일)
 *   * 슬롯 2: 모던 쿨그레이 & 다크네이비 악센트 아파트 (자이 / 래미안 스타일)
 *   * 슬롯 3: 따뜻한 아이보리 & 테라코타 주황 오렌지 포인트 아파트
 *
 * - 슬롯 4~7: 상가·근린생활시설 4종
 *   * 슬롯 4: 1~2층 화강석 베이지 석재 + 다양한 원색 한글 상가 간판(약국, 카페, 식당, 학원, 편의점), 상층부 통유리/창문
 *   * 슬롯 5: 한국 특유의 붉은 적벽돌(#9e3b28) 상가주택 (1층 소형상점, 2~4층 격자창문)
 *   * 슬롯 6: 모던 다크그레이 알루미늄 복합패널 + 수직 루버 상업빌딩
 *   * 슬롯 7: 화이트 패널 + 블루 포인트 병원/클리닉/은행 근생 빌딩
 *
 * - 슬롯 8~10: 혁신도시 공공기관·오피스 3종
 *   * 슬롯 8: 반곡동 건강보험공단/국민건강보험 스타일 스카이블루(#7dd3fc) 반사유리 커튼월 + 백색 수직 멀리온
 *   * 슬롯 9: 산림항공본부/광물자원공사 스타일 에메랄드 그린(#5eead4) 로이유리 커튼월
 *   * 슬롯 10: 화강석 석재 포디움 + 상층부 모던 오피스 리본 윈도우
 *
 * - 슬롯 11~13: 저층 빌라·단독주택 3종
 *   * 슬롯 11: 4층 다세대 빌라 (적벽돌 #8c3828 + 화강석 창틀 + 에어컨 실외기/발코니)
 *   * 슬롯 12: 투톤 필로티 다가구 원룸 (1층 주차장 필로티 기둥 + 2~4층 그레이/화이트 드라이비트)
 *   * 슬롯 13: 1~2층 단독주택 (황토색/갈색 파벽돌 #78523a + 박공 지붕 디테일)
 *
 * - 슬롯 14~15: 학교 및 체육·공공시설 2종
 *   * 슬롯 14: 초·중·고등학교 교사동 (따뜻한 살구/연주황색 #d97742 외벽 + 균일한 대형 교실창문 + 계단실 수직창)
 *   * 슬롯 15: 실버/블루 패널 물류·창고·체육관 시설
 *
 * [5대 실사 옥상 표면 색상 규격 (벽면 창문 텍스처 오염 100% 방지)]:
 *   ① 초록색 우레탄 방수 페인트 (#3b7a57, 상가/빌라/원룸 45%)
 *   ② 밝은 시멘트 회색 콘크리트 슬래브 (#94a3b8, 아파트/공공기관 30%)
 *   ③ 적갈색 기와/슁글 지붕 (#8c3b2b, 단독주택/빌라 15%)
 *   ④ 코발트 블루 샌드위치 판넬 (#2563eb, 공장/창고/학교 5%)
 *   ⑤ 짙은 브라운 아파트 옥상 엘리베이터탑/경사지붕캡 (#5c4033, 고층아파트 5%)
 */

import * as THREE from 'three';

export const VWORLD16_ATLAS_SIZE = 4096;
export const VWORLD16_SLOT_SIZE = 1024;
export const VWORLD16_GRID_COUNT = 4; // 4x4 = 16 슬롯

export interface Vworld16UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * 4x4 아틀라스 내 16개 슬롯별 정규화 Sub-UV 영역 반환
 * Three.js flipY = true 기준: v0이 아래쪽, v1이 위쪽
 */
export function getVworld16SlotUV(slotIndex: number): Vworld16UVRect {
  const safeSlot = Math.max(0, Math.min(15, Math.floor(slotIndex)));
  const col = safeSlot % VWORLD16_GRID_COUNT;
  const row = Math.floor(safeSlot / VWORLD16_GRID_COUNT);

  const u0 = col / VWORLD16_GRID_COUNT;
  const u1 = (col + 1) / VWORLD16_GRID_COUNT;

  // Three.js 텍스처 flipY = true 대응
  const v1 = 1.0 - row / VWORLD16_GRID_COUNT;
  const v0 = 1.0 - (row + 1) / VWORLD16_GRID_COUNT;

  return { u0, v0, u1, v1 };
}

/**
 * 한국 5대 실측 옥상 컬러 팔레트 (RGB 배열 및 16진수)
 */
export const VWORLD16_ROOF_COLORS = {
  urethaneGreen: { hex: '#3b7a57', rgb: [0.231, 0.478, 0.341] as [number, number, number] },
  concreteGray: { hex: '#94a3b8', rgb: [0.580, 0.639, 0.722] as [number, number, number] },
  terracottaTile: { hex: '#8c3b2b', rgb: [0.549, 0.231, 0.169] as [number, number, number] },
  cobaltBlue: { hex: '#2563eb', rgb: [0.145, 0.388, 0.922] as [number, number, number] },
  darkBrownCap: { hex: '#5c4033', rgb: [0.361, 0.251, 0.200] as [number, number, number] },
};

export interface Vworld16BuildingStyle {
  slotIndex: number;
  category: string;
  categoryLabel: string;
  uvRect: Vworld16UVRect;
  roofColorHex: string;
  roofColorRgb: [number, number, number];
  parapetColorHex: string;
  parapetColorRgb: [number, number, number];
  isHighRise: boolean;
}

/**
 * 건물 좌표, 높이, 면적, 속성을 융합하여 16종 슬롯 중 1개를 정밀 매칭
 */
export function getVworld16BuildingStyle(
  featProps: Record<string, any> = {},
  centroidLng: number,
  centroidLat: number,
  height: number,
  areaSqm: number
): Vworld16BuildingStyle {
  const seed = Math.abs(Math.floor(centroidLng * 100000 + centroidLat * 100000));
  const name = String(featProps.buld_nm || featProps.bldNm || featProps.name || featProps.name_ko || '').toLowerCase();
  const usage = String(featProps.realUse || featProps.main_purps_nm || featProps.use || featProps.usageType || '').toLowerCase();
  const cls = String(featProps.class || featProps.building || '').toLowerCase();

  // 1. 학교 및 교육시설 판별 -> 슬롯 14
  const isSchool =
    name.includes('초등') ||
    name.includes('중학') ||
    name.includes('고등') ||
    name.includes('대학') ||
    name.includes('학교') ||
    usage.includes('교육연구') ||
    usage.includes('학교') ||
    cls.includes('school');

  if (isSchool) {
    const uvRect = getVworld16SlotUV(14);
    const isGreenRoof = (seed % 100) < 65;
    const roof = isGreenRoof ? VWORLD16_ROOF_COLORS.urethaneGreen : VWORLD16_ROOF_COLORS.concreteGray;
    return {
      slotIndex: 14,
      category: 'school',
      categoryLabel: '초·중·고등학교 교사동',
      uvRect,
      roofColorHex: roof.hex,
      roofColorRgb: roof.rgb,
      parapetColorHex: '#cbd5e1',
      parapetColorRgb: [0.796, 0.835, 0.882],
      isHighRise: false,
    };
  }

  // 2. 산업 / 물류 / 체육관 시설 -> 슬롯 15
  const isIndustrial =
    usage.includes('공장') ||
    usage.includes('창고') ||
    usage.includes('자동차') ||
    usage.includes('운동시설') ||
    usage.includes('체육') ||
    cls.includes('industrial') ||
    cls.includes('warehouse');

  if (isIndustrial && height <= 22) {
    const uvRect = getVworld16SlotUV(15);
    const isBlue = (seed % 10) < 7;
    const roof = isBlue ? VWORLD16_ROOF_COLORS.cobaltBlue : VWORLD16_ROOF_COLORS.concreteGray;
    return {
      slotIndex: 15,
      category: 'industrial',
      categoryLabel: '실버/블루 패널 물류·창고·체육관 시설',
      uvRect,
      roofColorHex: roof.hex,
      roofColorRgb: roof.rgb,
      parapetColorHex: '#94a3b8',
      parapetColorRgb: [0.580, 0.639, 0.722],
      isHighRise: false,
    };
  }

  // 3. 원주 반곡동 혁신도시 공공기관 & 대형 오피스 -> 슬롯 8, 9, 10
  const isBangokInnovation =
    (centroidLat >= 37.315 && centroidLat <= 37.348 && centroidLng >= 127.962 && centroidLng <= 128.005) ||
    areaSqm >= 1400 ||
    name.includes('공단') ||
    name.includes('공사') ||
    name.includes('청사') ||
    name.includes('본부') ||
    name.includes('심평원') ||
    name.includes('건보') ||
    usage.includes('업무시설') ||
    usage.includes('공공기관');

  if (isBangokInnovation && height >= 14.0 && !name.includes('아파트')) {
    const subIdx = 8 + (seed % 3); // 8, 9, 10 분배
    const uvRect = getVworld16SlotUV(subIdx);
    const isGardenRoof = (seed % 10) < 35;
    const roof = isGardenRoof ? VWORLD16_ROOF_COLORS.urethaneGreen : VWORLD16_ROOF_COLORS.concreteGray;
    return {
      slotIndex: subIdx,
      category: 'office',
      categoryLabel:
        subIdx === 8
          ? '혁신도시 스카이블루 유리 커튼월 공공청사'
          : subIdx === 9
          ? '혁신도시 에메랄드그린 로이유리 타워'
          : '화강석 포디움 공공기관 오피스',
      uvRect,
      roofColorHex: roof.hex,
      roofColorRgb: roof.rgb,
      parapetColorHex: '#f1f5f9',
      parapetColorRgb: [0.945, 0.961, 0.976],
      isHighRise: height >= 30,
    };
  }

  // 4. 고층 아파트 단지 (높이 25m 이상, 10층 이상) -> 슬롯 0, 1, 2, 3
  const isApartment =
    height >= 25.0 ||
    name.includes('아파트') ||
    name.includes('아이파크') ||
    name.includes('푸르지오') ||
    name.includes('자이') ||
    name.includes('래미안') ||
    name.includes('더샵') ||
    name.includes('롯데캐슬') ||
    name.includes('힐스테이트') ||
    name.includes('e편한세상') ||
    name.includes('현진에버빌') ||
    name.includes('청솔') ||
    usage.includes('공동주택') ||
    usage.includes('아파트') ||
    cls.includes('apartments');

  if (isApartment) {
    const subIdx = seed % 4; // 0, 1, 2, 3 균등 분배
    const uvRect = getVworld16SlotUV(subIdx);
    const isBrownCap = (seed % 100) < 15;
    const roof = isBrownCap ? VWORLD16_ROOF_COLORS.darkBrownCap : VWORLD16_ROOF_COLORS.concreteGray;
    return {
      slotIndex: subIdx,
      category: 'apartment',
      categoryLabel:
        subIdx === 0
          ? '화이트&민트그레이 투톤 아파트'
          : subIdx === 1
          ? '샌드베이지&브라운 스트라이프 아파트'
          : subIdx === 2
          ? '모던 쿨그레이&다크네이비 아파트'
          : '따뜻한 아이보리&테라코타 아파트',
      uvRect,
      roofColorHex: roof.hex,
      roofColorRgb: roof.rgb,
      parapetColorHex: '#e2e8f0',
      parapetColorRgb: [0.886, 0.910, 0.941],
      isHighRise: true,
    };
  }

  // 5. 중·저층 상가 및 근린생활시설 (3~7층, 10m <= height < 25m) -> 슬롯 4, 5, 6, 7
  if (height >= 10.0) {
    const subIdx = 4 + (seed % 4); // 4, 5, 6, 7 분배
    const uvRect = getVworld16SlotUV(subIdx);
    // 상가 옥상 45% 우레탄 초록, 35% 시멘트 회색, 20% 테라코타
    const roofSeed = seed % 100;
    const roof =
      roofSeed < 50
        ? VWORLD16_ROOF_COLORS.urethaneGreen
        : roofSeed < 85
        ? VWORLD16_ROOF_COLORS.concreteGray
        : VWORLD16_ROOF_COLORS.terracottaTile;

    return {
      slotIndex: subIdx,
      category: 'commercial',
      categoryLabel:
        subIdx === 4
          ? '화강석 베이지 1층 상가 간판 빌딩'
          : subIdx === 5
          ? '한국형 적벽돌 상가주택'
          : subIdx === 6
          ? '모던 다크그레이 루버 상업빌딩'
          : '화이트&블루 포인트 클리닉·은행 빌딩',
      uvRect,
      roofColorHex: roof.hex,
      roofColorRgb: roof.rgb,
      parapetColorHex: '#e2e8f0',
      parapetColorRgb: [0.886, 0.910, 0.941],
      isHighRise: false,
    };
  }

  // 6. 저층 빌라 및 단독주택 (1~4층, height < 10m) -> 슬롯 11, 12, 13
  const subIdx = 11 + (seed % 3); // 11, 12, 13 분배
  const uvRect = getVworld16SlotUV(subIdx);
  const roofSeed = seed % 100;
  const roof =
    subIdx === 13
      ? VWORLD16_ROOF_COLORS.terracottaTile // 단독주택: 적갈색 기와/슁글
      : roofSeed < 45
      ? VWORLD16_ROOF_COLORS.urethaneGreen // 빌라/원룸: 45% 우레탄 초록
      : roofSeed < 75
      ? VWORLD16_ROOF_COLORS.concreteGray  // 30% 시멘트
      : VWORLD16_ROOF_COLORS.terracottaTile; // 25% 테라코타

  return {
    slotIndex: subIdx,
    category: 'lowrise',
    categoryLabel:
      subIdx === 11
        ? '4층 다세대 적벽돌 빌라'
        : subIdx === 12
        ? '투톤 필로티 다가구 원룸'
        : '1~2층 전원 단독주택',
    uvRect,
    roofColorHex: roof.hex,
    roofColorRgb: roof.rgb,
    parapetColorHex: '#cbd5e1',
    parapetColorRgb: [0.796, 0.835, 0.882],
    isHighRise: false,
  };
}

// =============================================================================
// [2D Canvas Procedural Facade Drawing Renders (16 Slots)]
// =============================================================================

function drawGridLines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lx = x; lx <= x + w; lx += step) {
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
  }
  for (let ly = y; ly <= y + h; ly += step) {
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
  }
  ctx.stroke();
}

/**
 * 슬롯 0: 화이트 & 민트그레이 투톤 발코니 샤시 아파트
 */
function drawSlot0_AptWhiteMint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (밝고 화사한 쿨 화이트)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, w, h);

  // 미세 가로 줄눈
  drawGridLines(ctx, x, y, w, h, 64, '#e2e8f0');

  // 2. 1~2층 포디움 기단부 (석재 브라운 베이지)
  const podiumH = Math.floor(h * 0.16);
  ctx.fillStyle = '#78716c';
  ctx.fillRect(x, y + h - podiumH, w, podiumH);
  ctx.fillStyle = '#57534e';
  ctx.fillRect(x, y + h - podiumH, w, 6);

  // 로비 현관 유리문
  const doorW = 160;
  const doorH = 90;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + w * 0.5 - doorW * 0.5, y + h - doorH - 10, doorW, doorH);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + w * 0.5 - doorW * 0.5 + 8, y + h - doorH - 2, doorW - 16, doorH - 16);

  // 3. 발코니 창문 격자 (4열 x 6행)
  const cols = 4;
  const rows = 6;
  const marginX = 40;
  const marginTop = 30;
  const gridW = w - marginX * 2;
  const gridH = h - podiumH - marginTop - 40;
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + marginTop + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + marginX + c * cellW;

      // 발코니 오목 프레임 외곽
      const pad = 12;
      const winW = cellW - pad * 2;
      const winH = cellH - pad * 2;

      // 발코니 돌출 턱 및 난간 벽
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + pad, cy + pad, winW, winH);

      // 민트그린 발코니 유리창 (실제 한국 아파트 전형적인 틴티드 유리)
      ctx.fillStyle = '#334e48';
      ctx.fillRect(cx + pad + 4, cy + pad + 4, winW - 8, winH - 8);

      // 상단 하늘 반사 하이라이트
      const grad = ctx.createLinearGradient(0, cy + pad, 0, cy + pad + winH * 0.45);
      grad.addColorStop(0, 'rgba(167, 243, 208, 0.45)');
      grad.addColorStop(1, 'rgba(51, 78, 72, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx + pad + 4, cy + pad + 4, winW - 8, Math.floor(winH * 0.45));

      // 백색 창틀 십자 멀리온
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx + pad + 4, cy + pad + 4, winW - 8, winH - 8);
      ctx.beginPath();
      ctx.moveTo(cx + pad + winW * 0.5, cy + pad + 4);
      ctx.lineTo(cx + pad + winW * 0.5, cy + pad + winH - 4);
      ctx.stroke();

      // 하단 안전 난간 (스테인리스 격자)
      const railH = winH * 0.35;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(cx + pad + 4, cy + pad + winH - railH, winW - 8, railH);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      for (let rx = cx + pad + 12; rx < cx + pad + winW - 8; rx += 12) {
        ctx.beginPath();
        ctx.moveTo(rx, cy + pad + winH - railH);
        ctx.lineTo(rx, cy + pad + winH - 4);
        ctx.stroke();
      }
    }
  }

  // 4. 중앙 수직 민트그레이 악센트 스트라이프
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x + w * 0.5 - 12, y, 24, h - podiumH);
}

/**
 * 슬롯 1: 샌드베이지 & 모던 브라운 스트라이프 아파트 (LH / 푸르지오 스타일)
 */
function drawSlot1_AptSandBrown(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (따뜻한 샌드 베이지)
  ctx.fillStyle = '#f5ede0';
  ctx.fillRect(x, y, w, h);

  // 2. 브라운 가로 스트라이프 밴드
  ctx.fillStyle = '#7c4d32';
  ctx.fillRect(x, y + Math.floor(h * 0.28), w, 48);
  ctx.fillRect(x, y + Math.floor(h * 0.58), w, 48);

  // 3. 1~2층 포디움 (다크 모카 브라운 석재)
  const podiumH = Math.floor(h * 0.18);
  ctx.fillStyle = '#5c3d28';
  ctx.fillRect(x, y + h - podiumH, w, podiumH);

  // 4. 발코니 창문 격자
  const cols = 4;
  const rows = 6;
  const marginX = 35;
  const marginTop = 35;
  const cellW = (w - marginX * 2) / cols;
  const cellH = (h - podiumH - marginTop - 30) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + marginTop + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + marginX + c * cellW;
      const pad = 10;
      const winW = cellW - pad * 2;
      const winH = cellH - pad * 2;

      ctx.fillStyle = '#ebe5d8';
      ctx.fillRect(cx + pad, cy + pad, winW, winH);

      // 브론즈 다크 유리
      ctx.fillStyle = '#26211c';
      ctx.fillRect(cx + pad + 3, cy + pad + 3, winW - 6, winH - 6);

      // 창호 프레임
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx + pad + 3, cy + pad + 3, winW - 6, winH - 6);
      ctx.beginPath();
      ctx.moveTo(cx + pad + winW * 0.5, cy + pad + 3);
      ctx.lineTo(cx + pad + winW * 0.5, cy + pad + winH - 3);
      ctx.stroke();
    }
  }

  // 상단 지붕 크라운 몰딩
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(x, y, w, 28);
}

/**
 * 슬롯 2: 모던 쿨그레이 & 다크네이비 악센트 아파트 (자이 / 래미안 스타일)
 */
function drawSlot2_AptCoolgrayNavy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (모던 쿨그레이)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, w, h);

  // 2. 다크네이비 수직 타워 및 측벽 프레임
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(x + 20, y, 60, h);
  ctx.fillRect(x + w - 80, y, 60, h);

  // 3. 1~2층 포디움 (다크 차콜 화강석)
  const podiumH = Math.floor(h * 0.17);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y + h - podiumH, w, podiumH);

  // 4. 와이드 전면 통유리 발코니 (고급 아파트 스타일)
  const cols = 3;
  const rows = 6;
  const marginX = 100;
  const marginTop = 30;
  const cellW = (w - marginX * 2) / cols;
  const cellH = (h - podiumH - marginTop - 30) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + marginTop + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + marginX + c * cellW;
      const pad = 8;
      const winW = cellW - pad * 2;
      const winH = cellH - pad * 2;

      // 흑연색 알루미늄 커튼월 프레임
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx + pad, cy + pad, winW, winH);

      // 푸른빛 은은한 반사유리
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx + pad + 2, cy + pad + 2, winW - 4, winH - 4);

      // 상단 하늘 스카이 반사
      const grad = ctx.createLinearGradient(0, cy + pad, 0, cy + pad + winH * 0.5);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.40)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx + pad + 2, cy + pad + 2, winW - 4, Math.floor(winH * 0.5));

      // 알루미늄 슬림 루버 멀리온
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + pad + winW * 0.33, cy + pad + 2);
      ctx.lineTo(cx + pad + winW * 0.33, cy + pad + winH - 2);
      ctx.moveTo(cx + pad + winW * 0.66, cy + pad + 2);
      ctx.lineTo(cx + pad + winW * 0.66, cy + pad + winH - 2);
      ctx.stroke();
    }
  }

  // 상단 스카이라인 옥탑 징크 프레임
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, 24);
}

/**
 * 슬롯 3: 따뜻한 아이보리 & 테라코타 주황 오렌지 포인트 아파트
 */
function drawSlot3_AptIvoryTerracotta(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (아이보리 크림)
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x, y, w, h);

  // 2. 테라코타 오렌지 수직/수평 포인트 프레임
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(x + Math.floor(w * 0.42), y, Math.floor(w * 0.16), h);
  ctx.fillRect(x, y + 20, w, 24);

  // 3. 기단부
  const podiumH = Math.floor(h * 0.16);
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(x, y + h - podiumH, w, podiumH);

  // 4. 창문 격자
  const cols = 4;
  const rows = 6;
  const marginX = 30;
  const marginTop = 45;
  const cellW = (w - marginX * 2) / cols;
  const cellH = (h - podiumH - marginTop - 25) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + marginTop + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + marginX + c * cellW;
      const pad = 10;
      const winW = cellW - pad * 2;
      const winH = cellH - pad * 2;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + pad, cy + pad, winW, winH);

      ctx.fillStyle = '#1c1917';
      ctx.fillRect(cx + pad + 3, cy + pad + 3, winW - 6, winH - 6);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + pad + 3, cy + pad + 3, winW - 6, winH - 6);
      ctx.beginPath();
      ctx.moveTo(cx + pad + winW * 0.5, cy + pad + 3);
      ctx.lineTo(cx + pad + winW * 0.5, cy + pad + winH - 3);
      ctx.stroke();
    }
  }
}

/**
 * 슬롯 4: 1~2층 화강석 베이지 석재 + 다양한 원색 한글 상가 간판, 상층부 통유리/창문
 */
function drawSlot4_CommercialSigns(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (화강석 베이지 타일)
  ctx.fillStyle = '#dcd4c6';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 64, '#b8ad9c');

  // 2. 1층 상가 쇼윈도 통유리 (어두운 화강석 프레임 + 유리창)
  const floor1H = Math.floor(h * 0.28);
  const floor1Y = y + h - floor1H;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, floor1Y, w, floor1H);

  // 1층 쇼윈도 통유리 3개
  const shopCols = 3;
  const shopW = (w - 60) / shopCols;
  for (let sc = 0; sc < shopCols; sc++) {
    const sx = x + 30 + sc * shopW;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(sx + 6, floor1Y + 30, shopW - 12, floor1H - 45);
    // 내부 온백색 조명 반사
    const grad = ctx.createLinearGradient(0, floor1Y + 30, 0, floor1Y + floor1H - 15);
    grad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx + 8, floor1Y + 32, shopW - 16, floor1H - 49);
  }

  // 3. 실제 한국 도심 가로 간판 4단
  const signConfigs = [
    { text: '약  국  +  PHARMACY', bg: '#15803d', fg: '#ffffff', yOff: 0.12 },
    { text: 'MEGA COFFEE  카페', bg: '#78350f', fg: '#fef08a', yOff: 0.32 },
    { text: '대성학원  입시전문', bg: '#1e3a8a', fg: '#ffffff', yOff: 0.52 },
    { text: 'GS25  편의점', bg: '#0284c7', fg: '#ffffff', yOff: 0.74 },
  ];

  for (const sign of signConfigs) {
    const sy = y + Math.floor(h * sign.yOff);
    const sH = 55;
    // 간판 돌출 프레임
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 30, sy - 3, w - 60, sH + 6);
    // 간판 배경색
    ctx.fillStyle = sign.bg;
    ctx.fillRect(x + 33, sy, w - 66, sH);

    // 간판 한글 텍스트 렌더링
    ctx.fillStyle = sign.fg;
    ctx.font = 'bold 26px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sign.text, x + w * 0.5, sy + sH * 0.5);
  }

  // 4. 상층부 통유리 오피스 창문들
  const winRows = [0.03, 0.22, 0.42, 0.62];
  for (const rOff of winRows) {
    const wy = y + Math.floor(h * rOff);
    for (let c = 0; c < 3; c++) {
      const wx = x + 40 + c * ((w - 80) / 3);
      const ww = (w - 80) / 3 - 16;
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(wx, wy, ww, 45);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx, wy, ww, 45);
    }
  }
}

/**
 * 슬롯 5: 한국 특유의 붉은 적벽돌(#9e3b28) 상가주택
 */
function drawSlot5_RedBrickMixedUse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (전통 한국 적벽돌 #9e3b28)
  ctx.fillStyle = '#9e3b28';
  ctx.fillRect(x, y, w, h);

  // 적벽돌 벽돌 패턴 (러닝 본드)
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  const brickH = 20;
  const brickW = 44;
  for (let by = y; by < y + h; by += brickH) {
    const rowIdx = Math.floor((by - y) / brickH);
    const xOffset = (rowIdx % 2) * (brickW * 0.5);
    ctx.beginPath();
    ctx.moveTo(x, by);
    ctx.lineTo(x + w, by);
    ctx.stroke();

    for (let bx = x - xOffset; bx < x + w; bx += brickW) {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by + brickH);
      ctx.stroke();
    }
  }

  // 2. 1층 소형 근생 점포 (베이커리 / 미용실 쇼윈도)
  const floor1H = Math.floor(h * 0.26);
  const floor1Y = y + h - floor1H;
  ctx.fillStyle = '#334155';
  ctx.fillRect(x + 20, floor1Y, w - 40, floor1H);

  // 상점 어닝 (스트라이프 천막)
  const awningH = 26;
  for (let ax = x + 20; ax < x + w - 20; ax += 24) {
    ctx.fillStyle = ((ax - x) / 24) % 2 === 0 ? '#ef4444' : '#ffffff';
    ctx.fillRect(ax, floor1Y, 24, awningH);
  }

  // 3. 2~4층 주거용 격자 창문 (백색 프레임 + 에어컨 실외기)
  const rows = 3;
  const cols = 4;
  const winTop = y + 40;
  const winAreaH = floor1Y - winTop - 20;
  const cellW = (w - 60) / cols;
  const cellH = winAreaH / rows;

  for (let r = 0; r < rows; r++) {
    const cy = winTop + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + 30 + c * cellW;
      const winW = cellW - 20;
      const winH = cellH - 24;

      // 창틀 화강석 인방 (Lintel)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx + 8, cy + 6, winW + 4, 6);
      ctx.fillRect(cx + 8, cy + winH + 12, winW + 4, 6);

      // 창틀 및 유리
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 10, cy + 12, winW, winH);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx + 14, cy + 16, winW - 8, winH - 8);

      // 백색 격자살
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 10 + winW * 0.5, cy + 16);
      ctx.lineTo(cx + 10 + winW * 0.5, cy + 16 + winH - 8);
      ctx.moveTo(cx + 14, cy + 16 + winH * 0.5);
      ctx.lineTo(cx + 14 + winW - 8, cy + 16 + winH * 0.5);
      ctx.stroke();

      // 에어컨 실외기 박스 (2개 중 1개 설치)
      if ((r + c) % 2 === 0) {
        ctx.fillStyle = '#d1d5db';
        ctx.fillRect(cx + 14, cy + winH + 18, 36, 20);
        ctx.strokeStyle = '#9ca3af';
        ctx.strokeRect(cx + 14, cy + winH + 18, 36, 20);
      }
    }
  }
}

/**
 * 슬롯 6: 모던 다크그레이 알루미늄 복합패널 + 수직 루버 상업빌딩
 */
function drawSlot6_ModernDarkLouver(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (다크그레이 알루미늄 패널)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 80, '#334155');

  // 2. 우측 절반 수직 건축 루버 (Architectural Louvers)
  const louverX = x + Math.floor(w * 0.55);
  const louverW = Math.floor(w * 0.40);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(louverX, y, louverW, h);

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 4;
  for (let lx = louverX + 12; lx < louverX + louverW; lx += 18) {
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
    ctx.stroke();
  }

  // 3. 좌측 절반 리본 윈도우 통유리
  const winCols = 2;
  const winRows = 5;
  const leftW = louverX - x - 40;
  const cellW = leftW / winCols;
  const cellH = (h - 60) / winRows;

  for (let r = 0; r < winRows; r++) {
    const cy = y + 30 + r * cellH;
    for (let c = 0; c < winCols; c++) {
      const cx = x + 25 + c * cellW;
      const winW = cellW - 14;
      const winH = cellH - 18;

      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx, cy, winW, winH);

      // 스카이 글레어 그라데이션
      const grad = ctx.createLinearGradient(0, cy, 0, cy + winH);
      grad.addColorStop(0, 'rgba(125, 211, 252, 0.6)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx, cy, winW, winH);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, winW, winH);
    }
  }
}

/**
 * 슬롯 7: 화이트 패널 + 블루 포인트 병원/클리닉/은행 근생 빌딩
 */
function drawSlot7_WhiteBlueClinic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (청결한 화이트 에나멜 패널)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 64, '#f1f5f9');

  // 2. 블루 & 시안 포인트 밴드
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(x, y + Math.floor(h * 0.22), w, 18);
  ctx.fillRect(x, y + Math.floor(h * 0.54), w, 18);

  // 3. 1층 은행 / 클리닉 로비 (시안색 통유리)
  const floor1H = Math.floor(h * 0.26);
  const floor1Y = y + h - floor1H;
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(x + 20, floor1Y, w - 40, floor1H);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 20, floor1Y, w - 40, floor1H);

  // 간판 텍스트
  ctx.fillStyle = '#0369a1';
  ctx.font = 'bold 28px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('연세내과·이비인후과 / 메디컬센터', x + w * 0.5, floor1Y + floor1H * 0.35);

  // 4. 상층부 모던 창호 격자
  const rows = 4;
  const cols = 4;
  const cellW = (w - 60) / cols;
  const cellH = (floor1Y - y - 60) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + 40 + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + 30 + c * cellW;
      const winW = cellW - 14;
      const winH = cellH - 16;

      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx, cy, winW, winH);

      const grad = ctx.createLinearGradient(0, cy, 0, cy + winH);
      grad.addColorStop(0, '#7dd3fc');
      grad.addColorStop(1, '#0c4a6e');
      ctx.fillStyle = grad;
      ctx.fillRect(cx + 2, cy + 2, winW - 4, winH - 4);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, winW, winH);
    }
  }
}

/**
 * 슬롯 8: 반곡동 건강보험공단 스타일 스카이블루(#7dd3fc) 반사유리 커튼월 + 백색 수직 멀리온
 */
function drawSlot8_GovSkyCurtain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 하단 화강석 웅장한 포디움 기단부 (1~2층)
  const podiumH = Math.floor(h * 0.22);
  const podiumY = y + h - podiumH;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, podiumY, w, podiumH);
  drawGridLines(ctx, x, podiumY, w, podiumH, 64, '#cbd5e1');

  // 포디움 웅장한 기둥열 (Colonnade)
  ctx.fillStyle = '#94a3b8';
  for (let px = x + 40; px < x + w - 40; px += 100) {
    ctx.fillRect(px, podiumY, 32, podiumH);
  }

  // 2. 상층부 스카이블루 반사유리 커튼월 타워
  const towerH = podiumY - y;
  const skyGrad = ctx.createLinearGradient(x, y, x + w, y + towerH);
  skyGrad.addColorStop(0, '#7dd3fc');
  skyGrad.addColorStop(0.35, '#38bdf8');
  skyGrad.addColorStop(0.7, '#0284c7');
  skyGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(x, y, w, towerH);

  // 3. 백색 수직 알루미늄 멀리온 (Vertical Mullions)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3.5;
  const mullionStep = 32;
  for (let mx = x; mx <= x + w; mx += mullionStep) {
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(mx, podiumY);
    ctx.stroke();
  }

  // 4. 가로 층간 스팬드럴 글래스 줄눈 (Floor Slabs)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 2;
  const floorStep = 72;
  for (let fy = y; fy < podiumY; fy += floorStep) {
    ctx.beginPath();
    ctx.moveTo(x, fy);
    ctx.lineTo(x + w, fy);
    ctx.stroke();
  }

  // 최상단 옥탑 헬리패드 / 차양 루버
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, 22);
}

/**
 * 슬롯 9: 산림항공본부/광물자원공사 스타일 에메랄드 그린(#5eead4) 로이유리 커튼월
 */
function drawSlot9_GovEmeraldGlass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 에메랄드 그린 Low-E 유리 커튼월 베이스
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#5eead4');
  grad.addColorStop(0.4, '#14b8a6');
  grad.addColorStop(0.8, '#0f766e');
  grad.addColorStop(1, '#115e59');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 2. 가로 브러시드 실버 알루미늄 선셰이드 (Horizontal Louvers)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  for (let ly = y + 36; ly < y + h; ly += 54) {
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();
  }

  // 3. 얇은 수직 멀리온
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  for (let mx = x + 40; mx < x + w; mx += 60) {
    ctx.beginPath();
    ctx.moveTo(mx, y);
    ctx.lineTo(mx, y + h);
    ctx.stroke();
  }
}

/**
 * 슬롯 10: 화강석 석재 포디움 + 상층부 모던 오피스 리본 윈도우
 */
function drawSlot10_GovGranitePodium(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (묵직한 밝은 그레이 화강암 석재)
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 64, '#9ca3af');

  // 2. 가로 연속 띠유리창 (Ribbon Windows, 4개 층)
  const rows = 4;
  const bandH = 65;
  const gapH = (h - 80 - rows * bandH) / (rows + 1);

  for (let r = 0; r < rows; r++) {
    const by = y + 40 + gapH * (r + 1) + r * bandH;
    // 다크 글래스 리본
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 20, by, w - 40, bandH);

    // 반사 하이라이트
    const rGrad = ctx.createLinearGradient(0, by, 0, by + bandH);
    rGrad.addColorStop(0, '#38bdf8');
    rGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = rGrad;
    ctx.fillRect(x + 22, by + 2, w - 44, bandH - 4);

    // 수직 창살
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    for (let vx = x + 60; vx < x + w - 40; vx += 50) {
      ctx.beginPath();
      ctx.moveTo(vx, by);
      ctx.lineTo(vx, by + bandH);
      ctx.stroke();
    }
  }
}

/**
 * 슬롯 11: 4층 다세대 빌라 (적벽돌 #8c3828 + 화강석 창틀 + 에어컨 실외기/발코니)
 */
function drawSlot11_VillaRedBrick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (다세대 적벽돌)
  ctx.fillStyle = '#8c3828';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 32, '#a54432');

  // 2. 창문 3열 x 4행
  const cols = 3;
  const rows = 4;
  const cellW = (w - 60) / cols;
  const cellH = (h - 60) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + 30 + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + 30 + c * cellW;
      const winW = cellW - 24;
      const winH = cellH - 24;

      // 화강석 백색 창틀
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cx + 8, cy + 8, winW + 8, winH + 8);

      // 다크 유리창
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx + 12, cy + 12, winW, winH);

      // 창살
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 12 + winW * 0.5, cy + 12);
      ctx.lineTo(cx + 12 + winW * 0.5, cy + 12 + winH);
      ctx.stroke();

      // 에어컨 실외기 거치대
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(cx + 14, cy + winH + 14, 40, 22);
    }
  }
}

/**
 * 슬롯 12: 투톤 필로티 다가구 원룸 (1층 주차장 필로티 기둥 + 2~4층 그레이/화이트 드라이비트)
 */
function drawSlot12_PilotisStudio(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 상층부 (화이트 / 쿨그레이 드라이비트 스투코)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, w, Math.floor(h * 0.45));
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y + Math.floor(h * 0.45), w, Math.floor(h * 0.30));

  // 2. 1층 필로티 주차장 (오픈 기둥 공간)
  const pilotisH = Math.floor(h * 0.25);
  const pilotisY = y + h - pilotisH;
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, pilotisY, w, pilotisH);

  // 필로티 콘크리트 기둥열
  ctx.fillStyle = '#94a3b8';
  for (let px = x + 40; px < x + w - 40; px += 120) {
    ctx.fillRect(px, pilotisY, 36, pilotisH);
  }

  // 3. 원룸 세대별 콤팩트 창문
  const cols = 4;
  const rows = 3;
  const cellW = (w - 60) / cols;
  const cellH = (pilotisY - y - 40) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + 25 + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + 30 + c * cellW;
      const winW = cellW - 20;
      const winH = cellH - 24;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 8, cy + 8, winW + 4, winH + 4);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx + 10, cy + 10, winW, winH);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx + 10, cy + 10, winW, winH);
    }
  }
}

/**
 * 슬롯 13: 1~2층 단독주택 (황토색/갈색 파벽돌 #78523a + 박공 지붕 디테일)
 */
function drawSlot13_DetachedHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (황토 파벽돌 #78523a)
  ctx.fillStyle = '#78523a';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 28, '#8c6245');

  // 2. 목조 현관문 및 창문
  const cols = 3;
  const rows = 2;
  const cellW = (w - 80) / cols;
  const cellH = (h - 80) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + 50 + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = x + 40 + c * cellW;
      const winW = cellW - 30;
      const winH = cellH - 30;

      // 1층 가운데는 원목 현관문
      if (r === 1 && c === 1) {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(cx + 10, cy + 10, winW, winH + 15);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(cx + 15, cy + winH * 0.5, 8, 8); // 황동 손잡이
        continue;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 10, cy + 10, winW, winH);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx + 14, cy + 14, winW - 8, winH - 8);

      // 격자 방범창
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 14, cy + 14, winW - 8, winH - 8);
    }
  }

  // 상단 적갈색 처마 몰딩
  ctx.fillStyle = '#5c3d2e';
  ctx.fillRect(x, y, w, 28);
}

/**
 * 슬롯 14: 초·중·고등학교 교사동 (따뜻한 살구/연주황색 #d97742 외벽 + 균일한 대형 교실창문 + 계단실 수직창)
 */
function drawSlot14_SchoolTerracotta(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (한국 초중고 전형적인 살구 주황 #d97742)
  ctx.fillStyle = '#d97742';
  ctx.fillRect(x, y, w, h);
  drawGridLines(ctx, x, y, w, h, 64, '#b85e2b');

  // 2. 좌측 15% 계단실 수직 통유리창
  const stairW = Math.floor(w * 0.18);
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(x + 25, y + 30, stairW, h - 60);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 25, y + 30, stairW, h - 60);

  // 계단실 수직 줄눈
  for (let sy = y + 70; sy < y + h - 60; sy += 70) {
    ctx.beginPath();
    ctx.moveTo(x + 25, sy);
    ctx.lineTo(x + 25 + stairW, sy);
    ctx.stroke();
  }

  // 3. 교실 균일 대형 창호열 (3개 층 x 4열)
  const rows = 4;
  const cols = 4;
  const classX = x + stairW + 40;
  const classW = w - (stairW + 65);
  const cellW = classW / cols;
  const cellH = (h - 70) / rows;

  for (let r = 0; r < rows; r++) {
    const cy = y + 35 + r * cellH;
    for (let c = 0; c < cols; c++) {
      const cx = classX + c * cellW;
      const winW = cellW - 16;
      const winH = cellH - 20;

      // 백색 창틀
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx, cy, winW, winH);

      // 교실 창문 유리 (푸른 틴트)
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(cx + 3, cy + 3, winW - 6, winH - 6);

      // 교실 블라인드 상단 반사
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(cx + 3, cy + 3, winW - 6, Math.floor(winH * 0.35));

      // 창살
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + winW * 0.5, cy + 3);
      ctx.lineTo(cx + winW * 0.5, cy + winH - 3);
      ctx.stroke();
    }
  }
}

/**
 * 슬롯 15: 실버/블루 패널 물류·창고·체육관 시설
 */
function drawSlot15_FacilityRibbed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // 1. 외벽 베이스 (실버 메탈 샌드위치 판넬)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y, w, h);

  // 리브 골판 수직 주름
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  for (let lx = x; lx <= x + w; lx += 16) {
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
    ctx.stroke();
  }

  // 2. 코발트 블루 악센트 띠 (상단 및 하단)
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(x, y, w, 40);
  ctx.fillRect(x, y + Math.floor(h * 0.50), w, 32);
  ctx.fillRect(x, y + h - 50, w, 50);

  // 3. 대형 산업용 롤업 셔터문 2개
  const doorW = Math.floor(w * 0.35);
  const doorH = Math.floor(h * 0.32);
  const doorY = y + h - doorH - 10;

  for (let d = 0; d < 2; d++) {
    const dx = x + 60 + d * (doorW + 80);
    ctx.fillStyle = '#334155';
    ctx.fillRect(dx, doorY, doorW, doorH);

    // 셔터 수평 주름
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    for (let sy = doorY + 6; sy < doorY + doorH; sy += 10) {
      ctx.beginPath();
      ctx.moveTo(dx, sy);
      ctx.lineTo(dx + doorW, sy);
      ctx.stroke();
    }
  }
}

const ALL_16_SLOT_RENDERERS = [
  drawSlot0_AptWhiteMint,
  drawSlot1_AptSandBrown,
  drawSlot2_AptCoolgrayNavy,
  drawSlot3_AptIvoryTerracotta,
  drawSlot4_CommercialSigns,
  drawSlot5_RedBrickMixedUse,
  drawSlot6_ModernDarkLouver,
  drawSlot7_WhiteBlueClinic,
  drawSlot8_GovSkyCurtain,
  drawSlot9_GovEmeraldGlass,
  drawSlot10_GovGranitePodium,
  drawSlot11_VillaRedBrick,
  drawSlot12_PilotisStudio,
  drawSlot13_DetachedHouse,
  drawSlot14_SchoolTerracotta,
  drawSlot15_FacilityRibbed,
];

// =============================================================================
// [Master 4096px 4x4 Atlas Canvas Generator]
// =============================================================================

export function createVworld16MasterAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return { width: VWORLD16_ATLAS_SIZE, height: VWORLD16_ATLAS_SIZE } as any;
  }

  const canvas = document.createElement('canvas');
  canvas.width = VWORLD16_ATLAS_SIZE;
  canvas.height = VWORLD16_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 전체 배경 흰색 초기화
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, VWORLD16_ATLAS_SIZE, VWORLD16_ATLAS_SIZE);

  // 16개 슬롯 순차 드로잉
  for (let slotId = 0; slotId < 16; slotId++) {
    const col = slotId % VWORLD16_GRID_COUNT;
    const row = Math.floor(slotId / VWORLD16_GRID_COUNT);
    const x = col * VWORLD16_SLOT_SIZE;
    const y = row * VWORLD16_SLOT_SIZE;

    const renderer = ALL_16_SLOT_RENDERERS[slotId];
    if (renderer) {
      renderer(ctx, x, y, VWORLD16_SLOT_SIZE, VWORLD16_SLOT_SIZE);
    }
  }

  return canvas;
}

/**
 * 16종 실사 PBR Roughness-Metalness-AO (RMA) 맵 Canvas 생성
 */
export function createVworld16RmaAtlasCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return { width: VWORLD16_ATLAS_SIZE, height: VWORLD16_ATLAS_SIZE } as any;
  }

  const canvas = document.createElement('canvas');
  canvas.width = VWORLD16_ATLAS_SIZE;
  canvas.height = VWORLD16_ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // R: Roughness, G: Metalness, B: Ambient Occlusion
  // 기본 콘크리트 무광: R=0.85, G=0.04, B=1.0 -> rgb(217, 10, 255)
  ctx.fillStyle = 'rgb(217, 10, 255)';
  ctx.fillRect(0, 0, VWORLD16_ATLAS_SIZE, VWORLD16_ATLAS_SIZE);

  // 오피스 유리창 구역 (슬롯 8, 9, 6): R=0.15, G=0.85, B=0.90 -> rgb(38, 217, 230)
  for (const s of [8, 9, 6]) {
    const col = s % VWORLD16_GRID_COUNT;
    const row = Math.floor(s / VWORLD16_GRID_COUNT);
    ctx.fillStyle = 'rgb(38, 217, 230)';
    ctx.fillRect(col * VWORLD16_SLOT_SIZE, row * VWORLD16_SLOT_SIZE, VWORLD16_SLOT_SIZE, VWORLD16_SLOT_SIZE);
  }

  return canvas;
}

let cachedMasterAtlasTexture: THREE.CanvasTexture | null = null;
let cachedRmaAtlasTexture: THREE.CanvasTexture | null = null;

export function getVworld16MasterAtlasTexture(): THREE.CanvasTexture {
  if (cachedMasterAtlasTexture) return cachedMasterAtlasTexture;

  const canvas = createVworld16MasterAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  cachedMasterAtlasTexture = texture;
  return texture;
}

export function getVworld16RmaAtlasTexture(): THREE.CanvasTexture {
  if (cachedRmaAtlasTexture) return cachedRmaAtlasTexture;

  const canvas = createVworld16RmaAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  cachedRmaAtlasTexture = texture;
  return texture;
}

export function disposeVworld16Atlas(): void {
  if (cachedMasterAtlasTexture) {
    cachedMasterAtlasTexture.dispose();
    cachedMasterAtlasTexture = null;
  }
  if (cachedRmaAtlasTexture) {
    cachedRmaAtlasTexture.dispose();
    cachedRmaAtlasTexture = null;
  }
}
