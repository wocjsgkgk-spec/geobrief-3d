/**
 * utils/precisionBuildingMaterials.ts
 *
 * [GeoBrief 3D 1단계: 16종 독립 건축 Material 배열 & 고해상도 CanvasTexture 엔진]
 *
 * 브이월드(V-World 3D) 실제 외관을 기반으로 16개의 독립된 MeshStandardMaterial 및
 * 4개의 전용 건축 구조물(측벽, 기단부, 간판, 포치) Material 배열을 생성합니다.
 *
 * 각 텍스처는 1베이(3.2m) × 1층고(3.0m) 규격의 고해상도 타일로 생성되며,
 * Three.js RepeatWrapping을 통해 건물 외벽 전체에 오차 없이 일대일 타일링됩니다.
 */

import * as THREE from 'three';

export interface BuildingStyleAssignment {
  category: 'apartment' | 'commercial' | 'public' | 'villa';
  facadeSlot: number; // 0..15
  sideWallSlot: number; // 16
  podiumSlot: number; // 17
  signboardSlot: number; // 18
  porchSlot: number; // 19
  roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc';
  roofColorRgb: [number, number, number];
  parapetColorRgb: [number, number, number];
  penthouseColorRgb: [number, number, number];
}

import { HIGH_DETAIL_ROOF_COLORS } from '@/lib/vendor/vworldHighDetailAtlas';

// 옥상 4대 실측 컬러 및 2단계 옥상 디테일 컬러 정의
export const ROOF_COLORS = {
  urethaneGreen: HIGH_DETAIL_ROOF_COLORS.urethaneGreen, // #2e6f4e (45% 상가·원룸)
  concreteSlab: HIGH_DETAIL_ROOF_COLORS.concreteSlab,   // #8c8881 (35% 아파트·빌딩)
  terracottaTile: HIGH_DETAIL_ROOF_COLORS.terracottaTile,// #7c3626 (15% 기와)
  blueSlate: HIGH_DETAIL_ROOF_COLORS.blueSlate,         // #1e40af (5% 청색 강판)
  zincBlue: HIGH_DETAIL_ROOF_COLORS.zincBlue,           // #475569 실버/블루 징크 (5%)
  parapetGray: HIGH_DETAIL_ROOF_COLORS.parapetGray,     // #c7c2ba 밝은 회백색 난간
  penthouseCore: HIGH_DETAIL_ROOF_COLORS.penthouseCore, // #9e9a94 옥탑 코어
  // [2단계 신규] 옥상 디테일(태양광 패널, 물탱크, 옥상 정원, 박공벽) 컬러
  solarCell: [0.09, 0.14, 0.24] as [number, number, number],     // 딥블루 솔라 셀
  solarFrame: [0.42, 0.45, 0.48] as [number, number, number],    // 아연도금 지지대 프레임
  waterTankBlue: [0.18, 0.42, 0.68] as [number, number, number], // FRP 파랑 물탱크
  waterTankSilver: [0.72, 0.74, 0.77] as [number, number, number],// 스테인리스 물탱크
  lawnGreen: HIGH_DETAIL_ROOF_COLORS.roofGardenGreen,            // #3b7a57 옥상 조경 녹지
  woodDeck: [0.55, 0.40, 0.26] as [number, number, number],      // 옥상 목재 데크
  gableWall: [0.82, 0.80, 0.76] as [number, number, number],     // 박공벽 외벽 콘크리트
};

/**
 * 건물 속성 및 해시를 기반으로 16개 스타일 중 최적 스타일 배분
 */
export function classifyBuildingStyle(
  featProps: Record<string, any> = {},
  seed: number,
  areaSqm: number,
  height: number,
  centerLngLat?: [number, number]
): BuildingStyleAssignment {
  const buldNm = String(featProps.buld_nm || featProps.name || '');
  const realUse = String(featProps.realUse || featProps.use || featProps.type || '');
  const absSeed = Math.abs(seed);

  const isApt =
    realUse.includes('아파트') ||
    realUse.includes('공동주택') ||
    buldNm.includes('아파트') ||
    buldNm.includes('아이파크') ||
    buldNm.includes('푸르지오') ||
    buldNm.includes('힐스테이트') ||
    buldNm.includes('자이') ||
    buldNm.includes('롯데캐슬') ||
    buldNm.includes('에버빌') ||
    buldNm.includes('더샵') ||
    buldNm.includes('청솔') ||
    (height >= 24 && areaSqm >= 280);

  const isGovPublic =
    realUse.includes('공공') ||
    realUse.includes('관공서') ||
    realUse.includes('업무') ||
    realUse.includes('청사') ||
    realUse.includes('학교') ||
    realUse.includes('교육') ||
    realUse.includes('병원') ||
    buldNm.includes('청사') ||
    buldNm.includes('시청') ||
    buldNm.includes('도청') ||
    buldNm.includes('공단') ||
    buldNm.includes('공사') ||
    buldNm.includes('센터') ||
    buldNm.includes('학교') ||
    buldNm.includes('초등학교') ||
    buldNm.includes('중학교') ||
    buldNm.includes('고등학교') ||
    buldNm.includes('병원') ||
    // 반곡동 혁신도시 공공기관 클러스터 좌표
    (centerLngLat &&
      centerLngLat[0] >= 127.965 &&
      centerLngLat[0] <= 128.005 &&
      centerLngLat[1] >= 37.315 &&
      centerLngLat[1] <= 37.345 &&
      height >= 14);

  const isIndustrial =
    realUse.includes('공장') ||
    realUse.includes('창고') ||
    realUse.includes('물류') ||
    realUse.includes('체육') ||
    buldNm.includes('창고') ||
    buldNm.includes('물류') ||
    (areaSqm >= 1200 && height <= 15);

  const isLowRiseResidential =
    height <= 12 &&
    (realUse.includes('단독') ||
      realUse.includes('다세대') ||
      realUse.includes('연립') ||
      realUse.includes('빌라') ||
      realUse.includes('주택') ||
      areaSqm < 220);

  let category: 'apartment' | 'commercial' | 'public' | 'villa';
  let facadeSlot = 0;
  let roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc' = 'concrete';
  let roofColorRgb = ROOF_COLORS.concreteSlab;

  if (isApt) {
    category = 'apartment';
    facadeSlot = absSeed % 5; // Group 0~4
    roofType = 'concrete';
    roofColorRgb = ROOF_COLORS.concreteSlab;
  } else if (isGovPublic) {
    category = 'public';
    facadeSlot = 10 + (absSeed % 3); // Group 10~12
    roofType = 'concrete';
    roofColorRgb = ROOF_COLORS.concreteSlab;
  } else if (isIndustrial) {
    category = 'commercial';
    facadeSlot = 7; // 다크 모던 메탈
    roofType = 'zinc';
    roofColorRgb = ROOF_COLORS.zincBlue;
  } else if (isLowRiseResidential) {
    category = 'villa';
    facadeSlot = 13 + (absSeed % 3); // Group 13~15
    // 단독주택·빌라는 15% 박공기와, 나머지 우레탄 녹색
    if (absSeed % 10 < 4) {
      roofType = 'gabled';
      roofColorRgb = absSeed % 2 === 0 ? ROOF_COLORS.terracottaTile : ROOF_COLORS.blueSlate;
    } else {
      roofType = 'urethane';
      roofColorRgb = ROOF_COLORS.urethaneGreen;
    }
  } else {
    // 일반 근린상가 및 오피스
    category = 'commercial';
    facadeSlot = 5 + (absSeed % 5); // Group 5~9
    // 상가는 우레탄 녹색(45%) 또는 콘크리트 슬래브(35%)
    if (absSeed % 10 < 6) {
      roofType = 'urethane';
      roofColorRgb = ROOF_COLORS.urethaneGreen;
    } else {
      roofType = 'concrete';
      roofColorRgb = ROOF_COLORS.concreteSlab;
    }
  }

  return {
    category,
    facadeSlot,
    sideWallSlot: 16,
    podiumSlot: 17,
    signboardSlot: 18,
    porchSlot: 19,
    roofType,
    roofColorRgb,
    parapetColorRgb: [0.72, 0.70, 0.67],
    penthouseColorRgb: [0.65, 0.63, 0.60],
  };
}

// ---------------------------------------------------------------------------
// 16종 독립 고해상도 캔버스 텍스처 드로잉 엔진 (512×512)
// ---------------------------------------------------------------------------

function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return { width, height } as any;
}

/**
 * Slot 0: 크림 화이트 + 민트빛 발코니 유리창 + 브라운 기단
 */
function drawSlot0_AptCreamWhiteMint(ctx: CanvasRenderingContext2D, s: number): void {
  // 외벽 바탕 크림 화이트
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 상단 슬래브 음영선
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, s, s * 0.08);

  // 좌우 벽체 마진 & 창문 영역 (중앙 70% 너비, 65% 높이)
  const wx = s * 0.15;
  const wy = s * 0.18;
  const ww = s * 0.70;
  const wh = s * 0.68;

  // 창틀 백색 하이샤시
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(wx - 4, wy - 4, ww + 8, wh + 8);

  // 민트빛 발코니 통유리창
  ctx.fillStyle = '#102a28';
  ctx.fillRect(wx, wy, ww, wh);

  // 상단 유리 반사 그라데이션
  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh * 0.5);
  glassGrad.addColorStop(0, '#5eead4');
  glassGrad.addColorStop(1, '#0f766e');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh * 0.5);

  // 중앙 멀리언(Mullion) 프레임
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx + ww * 0.5 - 3, wy, 6, wh);

  // 하단 발코니 안전 난간 살 (철제 그릴)
  const railY = wy + wh * 0.55;
  const railH = wh * 0.45;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.45)';
  ctx.fillRect(wx, railY, ww, railH);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  const barCount = 6;
  for (let i = 1; i < barCount; i++) {
    const bx = wx + (ww / barCount) * i;
    ctx.beginPath();
    ctx.moveTo(bx, railY);
    ctx.lineTo(bx, wy + wh);
    ctx.stroke();
  }

  // 창문 하단 실외기 그릴 박스 (좌측 하단)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(wx + 10, wy + wh - 22, ww * 0.35, 18);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(wx + 10, wy + wh - 22, ww * 0.35, 18);
}

/**
 * Slot 1: 소프트 베이지 + 다크차콜 창틀 + 테라코타 포인트
 */
function drawSlot1_AptSoftBeigeCharcoal(ctx: CanvasRenderingContext2D, s: number): void {
  // 소프트 베이지 바탕
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(0, 0, s, s);

  // 우측 수직 테라코타 포인트 밴드
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(s * 0.82, 0, s * 0.18, s);

  // 창문 영역
  const wx = s * 0.10;
  const wy = s * 0.16;
  const ww = s * 0.66;
  const wh = s * 0.70;

  // 다크차콜 알루미늄 창틀
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);

  // 틴티드 유리
  const gGrad = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
  gGrad.addColorStop(0, '#38bdf8');
  gGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 3단 분할 수직 프레임
  ctx.fillStyle = '#334155';
  ctx.fillRect(wx + ww * 0.33, wy, 4, wh);
  ctx.fillRect(wx + ww * 0.66, wy, 4, wh);

  // 발코니 하부 그레이 패널
  ctx.fillStyle = '#e7e5e4';
  ctx.fillRect(wx, wy + wh * 0.55, ww, wh * 0.45);
  ctx.strokeStyle = '#a8a29e';
  ctx.lineWidth = 2;
  ctx.strokeRect(wx, wy + wh * 0.55, ww, wh * 0.45);
}

/**
 * Slot 2: 라이트 웜그레이 + 네이비 수직 라인
 */
function drawSlot2_AptWarmGrayNavy(ctx: CanvasRenderingContext2D, s: number): void {
  // 라이트 웜그레이 바탕
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, s, s);

  // 좌측 네이비 타워 라인
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(0, 0, s * 0.14, s);

  // 통창 영역
  const wx = s * 0.22;
  const wy = s * 0.15;
  const ww = s * 0.68;
  const wh = s * 0.72;

  // 창틀
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);

  // 스카이블루 반사 유리
  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#7dd3fc');
  gGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 가로 통창 분할선
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh * 0.4);
  ctx.lineTo(wx + ww, wy + wh * 0.4);
  ctx.stroke();

  // 안전 유리 난간
  ctx.fillStyle = 'rgba(125, 211, 252, 0.4)';
  ctx.fillRect(wx, wy + wh * 0.6, ww, wh * 0.4);
}

/**
 * Slot 3: 아이보리 판상형 + 복도식 격자창
 */
function drawSlot3_AptIvoryCorridor(ctx: CanvasRenderingContext2D, s: number): void {
  // 부드러운 아이보리
  ctx.fillStyle = '#fefce8';
  ctx.fillRect(0, 0, s, s);

  // 복도식 2분할 창문
  const w = s * 0.36;
  const h = s * 0.65;
  const y = s * 0.18;

  for (let k = 0; k < 2; k++) {
    const x = s * 0.10 + k * (w + s * 0.08);
    // 알루미늄 샤시 프레임
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    // 유리
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, w, h);
    // 십자 격자창
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.5, y + h);
    ctx.moveTo(x, y + h * 0.5);
    ctx.lineTo(x + w, y + h * 0.5);
    ctx.stroke();
  }
}

/**
 * Slot 4: 주상복합 하이엔드 블루그레이 커튼월
 */
function drawSlot4_AptHighEndCurtainWall(ctx: CanvasRenderingContext2D, s: number): void {
  // 다크 블루그레이 바탕
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, s, s);

  // 전면 미러 글라스 커튼월
  const gGrad = ctx.createLinearGradient(0, 0, s, s);
  gGrad.addColorStop(0, '#38bdf8');
  gGrad.addColorStop(0.5, '#0284c7');
  gGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = gGrad;
  ctx.fillRect(s * 0.05, s * 0.05, s * 0.90, s * 0.90);

  // 메탈릭 수평/수직 멀리언 그리드
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.05, s * 0.05, s * 0.90, s * 0.90);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.05);
  ctx.lineTo(s * 0.5, s * 0.95);
  ctx.moveTo(s * 0.05, s * 0.5);
  ctx.lineTo(s * 0.95, s * 0.5);
  ctx.stroke();
}

/**
 * Slot 5: 베이지 화강석 + 컬러 간판 패치 상가
 */
function drawSlot5_CommGraniteColorSign(ctx: CanvasRenderingContext2D, s: number): void {
  // 베이지 화강석 줄눈 패턴
  ctx.fillStyle = '#e7e5e4';
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, s - 8, s - 8);

  // 상단 컬러 가로 간판 패치 (빨강/파랑 원색)
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(s * 0.08, s * 0.08, s * 0.84, s * 0.22);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.15, s * 0.14, s * 0.25, s * 0.10);
  ctx.fillRect(s * 0.50, s * 0.14, s * 0.35, s * 0.10);

  // 하단 쇼윈도 통유리
  const wx = s * 0.10;
  const wy = s * 0.38;
  const ww = s * 0.80;
  const wh = s * 0.54;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(wx, wy, ww, wh);
  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#38bdf8');
  gGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
}

/**
 * Slot 6: 붉은 치장벽돌 상가주택
 */
function drawSlot6_CommRedBrickCommercial(ctx: CanvasRenderingContext2D, s: number): void {
  // 붉은 치장벽돌 바탕
  ctx.fillStyle = '#8c3b2b';
  ctx.fillRect(0, 0, s, s);

  // 벽돌 줄눈 텍스처
  ctx.strokeStyle = '#6c2b1e';
  ctx.lineWidth = 1.5;
  const rowH = s / 8;
  for (let y = rowH; y < s; y += rowH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 백색 창호와 짙은 유리
  const wx = s * 0.20;
  const wy = s * 0.22;
  const ww = s * 0.60;
  const wh = s * 0.62;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(wx, wy, ww, wh);

  // 창문 십자 프레임
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx + ww * 0.5 - 2, wy, 4, wh);
  ctx.fillRect(wx, wy + wh * 0.5 - 2, ww, 4);
}

/**
 * Slot 7: 다크 차콜 모던 메탈 빌딩
 */
function drawSlot7_CommDarkMetalOffice(ctx: CanvasRenderingContext2D, s: number): void {
  // 다크 차콜 메탈 바탕
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  // 수직 알루미늄 루버 핀
  ctx.fillStyle = '#0f172a';
  for (let x = s * 0.05; x < s; x += s * 0.12) {
    ctx.fillRect(x, 0, 4, s);
  }

  // 브론즈 리플렉션 띠창
  const wy = s * 0.25;
  const wh = s * 0.50;
  const bGrad = ctx.createLinearGradient(0, wy, 0, wy + wh);
  bGrad.addColorStop(0, '#ca8a04');
  bGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bGrad;
  ctx.fillRect(s * 0.08, wy, s * 0.84, wh);
}

/**
 * Slot 8: 브라운 파벽돌 근린상가
 */
function drawSlot8_CommBrownBrick(ctx: CanvasRenderingContext2D, s: number): void {
  // 브라운 파벽돌 바탕
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0, 0, s, s);

  // 상단 사비석 베이지 띠장
  ctx.fillStyle = '#dcd4c6';
  ctx.fillRect(0, s * 0.08, s, s * 0.12);

  // 2개의 세로 창문
  const w = s * 0.32;
  const h = s * 0.58;
  const y = s * 0.28;

  for (let k = 0; k < 2; k++) {
    const x = s * 0.12 + k * (w + s * 0.12);
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 2, y + 2, w - 4, h * 0.4);
  }
}

/**
 * Slot 9: 화이트/블루 메디컬·학원 빌딩
 */
function drawSlot9_CommWhiteBlueMedical(ctx: CanvasRenderingContext2D, s: number): void {
  // 화이트 세라믹 패널
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  // 코발트블루 액센트 밴드
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(s * 0.06, s * 0.08, s * 0.88, s * 0.14);

  // 대형 클리닉 와이드 통창
  const wx = s * 0.08;
  const wy = s * 0.30;
  const ww = s * 0.84;
  const wh = s * 0.60;

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(wx, wy, ww, wh);

  // 백색 격자 프레임
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.33, wy);
  ctx.lineTo(wx + ww * 0.33, wy + wh);
  ctx.moveTo(wx + ww * 0.66, wy);
  ctx.lineTo(wx + ww * 0.66, wy + wh);
  ctx.stroke();
}

/**
 * Slot 10: 반곡동 혁신도시 스카이블루 유리 커튼월 + 화강석 포디움
 */
function drawSlot10_GovSkyBlueGlassPodium(ctx: CanvasRenderingContext2D, s: number): void {
  // 밝은 화강석 프레임
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, s, s);

  // 혁신도시 스카이블루 커튼월 타워
  const wx = s * 0.06;
  const wy = s * 0.06;
  const ww = s * 0.88;
  const wh = s * 0.88;

  const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  skyGrad.addColorStop(0, '#7dd3fc');
  skyGrad.addColorStop(0.6, '#38bdf8');
  skyGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 알루미늄 커튼월 수직/수평 멀리언 그리드 (3×3)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  for (let i = 1; i <= 3; i++) {
    const gx = wx + (ww / 4) * i;
    ctx.beginPath();
    ctx.moveTo(gx, wy);
    ctx.lineTo(gx, wy + wh);
    ctx.stroke();

    const gy = wy + (wh / 4) * i;
    ctx.beginPath();
    ctx.moveTo(wx, gy);
    ctx.lineTo(wx + ww, gy);
    ctx.stroke();
  }
}

/**
 * Slot 11: 에메랄드 그린 유리 오피스
 */
function drawSlot11_GovEmeraldGreenOffice(ctx: CanvasRenderingContext2D, s: number): void {
  // 다크 알루미늄 프레임
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  // 에메랄드 그린 열선반사유리
  const emGrad = ctx.createLinearGradient(0, 0, s, s);
  emGrad.addColorStop(0, '#5eead4');
  emGrad.addColorStop(0.5, '#14b8a6');
  emGrad.addColorStop(1, '#042f2e');
  ctx.fillStyle = emGrad;
  ctx.fillRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84);

  // 수평 멀리언 밴드
  ctx.fillStyle = '#475569';
  ctx.fillRect(s * 0.08, s * 0.48, s * 0.84, 6);
}

/**
 * Slot 12: 살구색/오렌지 테라코타 & 적벽돌 학교 교사동
 */
function drawSlot12_GovSchoolTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  // 오렌지 테라코타 벽돌
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, s, s);

  // 상단 백색 처마 밴드
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s * 0.12);

  // 2개의 대형 교실 창문
  const w = s * 0.38;
  const h = s * 0.62;
  const y = s * 0.22;

  for (let k = 0; k < 2; k++) {
    const x = s * 0.08 + k * (w + s * 0.08);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(x + 2, y + 2, w - 4, h * 0.5);
    // 십자 창살
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
}

/**
 * Slot 13: 적벽돌 다세대 빌라
 */
function drawSlot13_ResiRedBrickVilla(ctx: CanvasRenderingContext2D, s: number): void {
  // 적벽돌
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(0, 0, s, s);

  // 백색 하이샤시 단창
  const wx = s * 0.22;
  const wy = s * 0.20;
  const ww = s * 0.56;
  const wh = s * 0.64;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(wx, wy, ww, wh);

  // 창살 및 방범창
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.5, wy);
  ctx.lineTo(wx + ww * 0.5, wy + wh);
  ctx.stroke();

  // 하단 화강석 창대석(Sill)
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(wx - 8, wy + wh + 2, ww + 16, 8);
}

/**
 * Slot 14: 크림 스타코 필로티 원룸
 */
function drawSlot14_ResiCreamPilotiStudio(ctx: CanvasRenderingContext2D, s: number): void {
  // 크림 스타코 바탕
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s);

  // 세로 슬릿 창문 (원룸 스타일)
  const wx = s * 0.30;
  const wy = s * 0.15;
  const ww = s * 0.40;
  const wh = s * 0.72;

  // 차콜 알루미늄 샤시
  ctx.fillStyle = '#334155';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(wx, wy + wh * 0.5, ww, wh * 0.5);
}

/**
 * Slot 15: 샌드 베이지 표준 병영막사
 */
function drawSlot15_ResiSandBeigeBarracks(ctx: CanvasRenderingContext2D, s: number): void {
  // 샌드 베이지 바탕
  ctx.fillStyle = '#d4b996';
  ctx.fillRect(0, 0, s, s);

  // 녹색 국방 테두리 몰딩
  ctx.fillStyle = '#3f6212';
  ctx.fillRect(0, 0, s, s * 0.10);
  ctx.fillRect(0, s * 0.90, s, s * 0.10);

  // 격자 내무반 창문
  const wx = s * 0.20;
  const wy = s * 0.25;
  const ww = s * 0.60;
  const wh = s * 0.52;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(wx, wy, ww, wh);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.5, wy);
  ctx.lineTo(wx + ww * 0.5, wy + wh);
  ctx.stroke();
}

/**
 * Slot 16: 아파트 측벽 (창문 없는 매끈한 콘크리트 + 단지 브랜드 수직 줄눈)
 */
function drawSlot16_AptSideWall(ctx: CanvasRenderingContext2D, s: number): void {
  // 매끈한 크림 콘크리트 바탕
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, s, s);

  // 중앙 굵은 브랜드 컬러 라인 (다크 네이비 & 오렌지 띠)
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(s * 0.40, 0, s * 0.16, s);
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(s * 0.56, 0, s * 0.04, s);

  // 미세한 콘크리트 패널 줄눈
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.5);
  ctx.lineTo(s, s * 0.5);
  ctx.stroke();
}

/**
 * Slot 17: 상가 1층 기단부 (화강석 프레임 + 틴티드 쇼윈도)
 */
function drawSlot17_CommPodium(ctx: CanvasRenderingContext2D, s: number): void {
  // 짙은 그레이 화강석 기둥 프레임
  ctx.fillStyle = '#78716c';
  ctx.fillRect(0, 0, s, s);

  // 어두운 통유리 쇼윈도
  const wx = s * 0.08;
  const wy = s * 0.12;
  const ww = s * 0.84;
  const wh = s * 0.78;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(wx, wy, ww, wh);

  // 내부 은은한 조명 반사
  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#38bdf8');
  gGrad.addColorStop(0.3, '#0369a1');
  gGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);

  // 스테인리스 스틸 출입문 프레임
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(wx + ww * 0.5 - 25, wy + 10, 50, wh - 10);
}

/**
 * Slot 18: 한국형 가로 간판 박스 (원색 간판 그래픽 패치)
 */
function drawSlot18_Signboard(ctx: CanvasRenderingContext2D, s: number): void {
  // 프레임
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  // 3개 분할 컬러풀 상가 간판
  // 1) 붉은색 식당/카페 간판
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(s * 0.04, s * 0.10, s * 0.28, s * 0.80);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.08, s * 0.35, s * 0.20, s * 0.30);

  // 2) 노란색 약국/편의점 간판
  ctx.fillStyle = '#eab308';
  ctx.fillRect(s * 0.36, s * 0.10, s * 0.28, s * 0.80);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(s * 0.40, s * 0.35, s * 0.20, s * 0.30);

  // 3) 파란색 병원/학원 간판
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(s * 0.68, s * 0.10, s * 0.28, s * 0.80);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.72, s * 0.35, s * 0.20, s * 0.30);
}

/**
 * Slot 19: 아파트 현관 포치 & 캐노피
 */
function drawSlot19_AptPorch(ctx: CanvasRenderingContext2D, s: number): void {
  // 화강석 브라운 & 다크 알루미늄
  ctx.fillStyle = '#5c4033';
  ctx.fillRect(0, 0, s, s);

  // 캐노피 언더라이트 (따뜻한 백색광)
  const lGrad = ctx.createRadialGradient(s * 0.5, s * 0.5, 10, s * 0.5, s * 0.5, s * 0.45);
  lGrad.addColorStop(0, '#fef08a');
  lGrad.addColorStop(0.6, '#ca8a04');
  lGrad.addColorStop(1, '#5c4033');
  ctx.fillStyle = lGrad;
  ctx.fillRect(s * 0.10, s * 0.10, s * 0.80, s * 0.80);
}

// ---------------------------------------------------------------------------
// 20개 Material 배열 팩토리 (싱글톤 캐시)
// ---------------------------------------------------------------------------

import {
  getVworldPhotorealMaterials,
  classifyVworldPhotorealBuilding,
  PHOTOREAL_ROOF_COLORS,
} from '@/lib/vendor/vworldPhotorealEngine';

export function getPrecisionBuildingMaterials(): THREE.MeshStandardMaterial[] {
  return getVworldPhotorealMaterials();
}
