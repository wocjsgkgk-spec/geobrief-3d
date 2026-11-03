/**
 * lib/vendor/vworldHighDetailAtlas.ts
 *
 * [GeoBrief 3D 3단계: V-World급 고대비(High-Contrast) 실사 파사드 & 입체 옥상 렌더링 엔진]
 *
 * 브이월드(V-World 3D) 실제 항공촬영 영상 및 도시 뷰(image_7c6d3f, image_7c1b86) 분석 기반:
 * 1. 16종 독립 1024x1024 고해상도 PBR Canvas 텍스처 (고대비 십자 창틀, 상가 간판, 화강석 포디움)
 * 2. 아파트 발코니: 깊고 진한 다크 슬레이트/민트 차콜(#1a2e2b ~ #1e293b) + 하늘빛 대각선 반사 하이라이트(#7dd3fc44) + 두께 3px 순백색(#ffffff) 창틀 + 진한 회색 슬래브 줄눈(#94a3b8) + 1~3층 투톤 기단부
 * 3. 반곡동 혁신도시 청사: 화강석 기단부 포디움(#e5e0d5) + 스카이블루 반사 커튼월(#38bdf8 ~ #0284c7) + 은백색(#f1f5f9) 멀리언 격자
 * 4. 시내 상가: 1층 통유리 쇼윈도 + 층간 가로 간판 띠(빨강 #dc2626, 파랑 #2563eb, 노랑 #eab308, 초록 #16a34a)
 * 5. 옥상 실측 분리: 우레탄 초록(#2e6f4e 45%), 시멘트 슬래브(#8c8881 35%), 적갈색 기와(#7c3626) / 청색 강판(#1e40af 20%) + 0.9m 회백색 돌출 난간(Parapet)
 */

import * as THREE from 'three';

export const HIGH_DETAIL_ROOF_COLORS = {
  urethaneGreen: [0.180, 0.435, 0.306] as [number, number, number], // #2e6f4e (45% 상가·원룸)
  concreteSlab: [0.549, 0.533, 0.506] as [number, number, number],  // #8c8881 (35% 아파트·빌딩)
  terracottaTile: [0.486, 0.212, 0.149] as [number, number, number],// #7c3626 (15% 기와)
  blueSlate: [0.118, 0.251, 0.686] as [number, number, number],      // #1e40af (5% 청색 강판)
  zincBlue: [0.278, 0.333, 0.412] as [number, number, number],       // #475569 실버/블루 징크
  parapetGray: [0.780, 0.760, 0.730] as [number, number, number],    // #c7c2ba 밝은 회백색 난간
  penthouseCore: [0.620, 0.605, 0.580] as [number, number, number],  // #9e9a94 옥탑 코어
  roofGardenGreen: [0.231, 0.478, 0.341] as [number, number, number],// #3b7a57 옥상 조경 녹지
};

function createOffscreen1024Canvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    return canvas;
  }
  return { width: 1024, height: 1024 } as any;
}

// 미세 콘크리트 노이즈 (자연스러운 외벽 음영)
function applyNoise(ctx: CanvasRenderingContext2D, s: number, opacity = 0.03): void {
  try {
    const imgData = ctx.getImageData(0, 0, s, s);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const n = (Math.random() - 0.5) * 40 * opacity;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {}
}

// -----------------------------------------------------------------------------
// [공통 고대비 아파트 창호 드로잉 함수]
// 화사한 외벽 + 진한 다크 슬레이트/민트 차콜 유리 + 선명한 3px 순백색 창틀 + 진한 슬래브 줄눈
// -----------------------------------------------------------------------------
function drawHighContrastAptWindow(
  ctx: CanvasRenderingContext2D,
  s: number,
  baseWallColor: string,
  glassStartColor: string,
  glassEndColor: string,
  podiumBand?: { y: number; h: number; color: string; border: string },
  verticalStripe?: { x: number; w: number; color: string }
): void {
  // 1. 화사한 외벽 기본 바탕칠
  ctx.fillStyle = baseWallColor;
  ctx.fillRect(0, 0, s, s);

  // 2. 진한 회색 층간 슬래브 가로 줄눈 (#94a3b8 및 깊은 음영 #475569)
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, s, 14); // 층간 깊은 슬래브 홈
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 14, s, 10); // 슬래브 베이스 라인

  // 3. 기단부 투톤 도색 구간 (따뜻한 브라운/테라코타/차콜)
  if (podiumBand) {
    ctx.fillStyle = podiumBand.color;
    ctx.fillRect(0, podiumBand.y, s, podiumBand.h);
    ctx.fillStyle = podiumBand.border;
    ctx.fillRect(0, podiumBand.y, s, 8);
  }

  // 4. 수직 브랜드 포인트 스트라이프
  if (verticalStripe) {
    ctx.fillStyle = verticalStripe.color;
    ctx.fillRect(verticalStripe.x, 0, verticalStripe.w, s);
  }

  // 5. 창호 영역 산출 (좌우 여백 12%, 상하 여백 14%)
  const wx = s * 0.12;
  const wy = s * 0.15;
  const ww = s * 0.76;
  const wh = s * 0.70;

  // 6. [핵심] 두께 3px 이상의 선명한 순백색(#ffffff) 창틀 외곽 프레임
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 10, wy - 10, ww + 20, wh + 20);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(wx - 10, wy - 10, ww + 20, wh + 20);

  // 7. [핵심] 깊고 진한 다크 슬레이트/민트 차콜 발코니 통유리창 (#1a2e2b ~ #1e293b)
  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, glassStartColor);
  gGrad.addColorStop(0.5, glassEndColor);
  gGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 8. [핵심] 상단 하늘빛 대각선 반사 하이라이트 광택 (#7dd3fc44)
  ctx.fillStyle = 'rgba(125, 211, 252, 0.40)';
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh * 0.35);
  ctx.lineTo(wx + ww * 0.55, wy);
  ctx.lineTo(wx + ww * 0.85, wy);
  ctx.lineTo(wx, wy + wh * 0.75);
  ctx.closePath();
  ctx.fill();

  // 9. [핵심] 창틀 십자 멀리언(Mullion) 프레임 - 선명한 순백색 (#ffffff)
  ctx.fillStyle = '#ffffff';
  // 수직 중앙 프레임
  ctx.fillRect(wx + ww * 0.5 - 6, wy, 12, wh);
  // 수평 분할 프레임 (상부 환기창/하부 발코니 구분)
  ctx.fillRect(wx, wy + wh * 0.52 - 5, ww, 10);

  // 10. 하단 발코니 안전 난간 그릴 (섬세한 철제/유리 난간 살)
  const railY = wy + wh * 0.54;
  const railH = wh * 0.46;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.25)';
  ctx.fillRect(wx, railY, ww, railH);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  const barCount = 10;
  for (let b = 1; b < barCount; b++) {
    const bx = wx + (ww / barCount) * b;
    ctx.beginPath();
    ctx.moveTo(bx, railY);
    ctx.lineTo(bx, wy + wh);
    ctx.stroke();
  }

  // 11. 창문 하단 실외기 루버 그릴 (좌측 하단)
  const louverW = ww * 0.30;
  const louverH = wh * 0.20;
  const louverX = wx + 12;
  const louverY = wy + wh - louverH - 6;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(louverX, louverY, louverW, louverH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  for (let ly = louverY + 5; ly < louverY + louverH - 2; ly += 5) {
    ctx.beginPath();
    ctx.moveTo(louverX + 2, ly);
    ctx.lineTo(louverX + louverW - 2, ly);
    ctx.stroke();
  }

  applyNoise(ctx, s, 0.02);
}

// =============================================================================
// [Group 1: 고층 아파트 단지 (Material 0 ~ 4)]
// =============================================================================

// Slot 0: 밝은 크림 화이트(#f6f4ef) + 딥 민트 차콜(#1a2e2b) 발코니 창 + 따뜻한 브라운(#7c4d32) 1~3층 기단부 투톤
export function drawSlot0_AptCreamWhiteBrown(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastAptWindow(
    ctx,
    s,
    '#f6f4ef',
    '#1a2e2b',
    '#162a26',
    { y: s * 0.78, h: s * 0.22, color: '#7c4d32', border: '#5c3520' }
  );
}

// Slot 1: 소프트 샌드 베이지(#ece4d5) + 딥 슬레이트(#1e293b) 발코니 창 + 테라코타(#8c3f2b) 투톤
export function drawSlot1_AptSandBeigeTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastAptWindow(
    ctx,
    s,
    '#ece4d5',
    '#1e293b',
    '#0f172a',
    { y: s * 0.78, h: s * 0.22, color: '#8c3f2b', border: '#6c2e1f' },
    { x: s * 0.84, w: s * 0.16, color: '#8c3f2b' }
  );
}

// Slot 2: 라이트 웜그레이(#e2ded7) + 민트 차콜(#1a2e2b) 발코니 창 + 다크 차콜(#334155) 수직 계단실 코어
export function drawSlot2_AptWarmGrayCharcoal(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastAptWindow(
    ctx,
    s,
    '#e2ded7',
    '#1a2e2b',
    '#0f172a',
    { y: s * 0.80, h: s * 0.20, color: '#334155', border: '#1e293b' },
    { x: 0, w: s * 0.14, color: '#334155' }
  );
  // 계단실 수직 슬릿 창호 (#7dd3fc 반사광)
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(s * 0.04, s * 0.10, s * 0.06, s * 0.80);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(s * 0.04, s * 0.10, s * 0.06, s * 0.80);
}

// Slot 3: 아이보리 판상형(#fefce8) + 코발트 네이비(#1e3a8a) 포인트 밴드 + 고대비 창호
export function drawSlot3_AptCoolGrayNavy(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastAptWindow(
    ctx,
    s,
    '#f8fafc',
    '#1e293b',
    '#0f172a',
    { y: s * 0.80, h: s * 0.20, color: '#1e3a8a', border: '#172554' },
    { x: 0, w: s * 0.12, color: '#1e3a8a' }
  );
}

// Slot 4: 주상복합 하이엔드 블루/에메랄드 커튼월 타워
export function drawSlot4_AptCurtainWallTower(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, s, s);

  // 전면 미러 글라스 커튼월 그라데이션
  const gGrad = ctx.createLinearGradient(0, 0, s, s);
  gGrad.addColorStop(0, '#38bdf8');
  gGrad.addColorStop(0.35, '#0284c7');
  gGrad.addColorStop(0.7, '#0369a1');
  gGrad.addColorStop(1, '#082f49');
  ctx.fillStyle = gGrad;
  ctx.fillRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);

  // 대각선 반사 하이라이트 광택
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.moveTo(s * 0.04, s * 0.5);
  ctx.lineTo(s * 0.55, s * 0.04);
  ctx.lineTo(s * 0.85, s * 0.04);
  ctx.lineTo(s * 0.04, s * 0.85);
  ctx.closePath();
  ctx.fill();

  // 은백색 알루미늄 멀리언 그리드 (3x3 분할)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.strokeRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);
  ctx.beginPath();
  ctx.moveTo(s * 0.35, s * 0.04);
  ctx.lineTo(s * 0.35, s * 0.96);
  ctx.moveTo(s * 0.68, s * 0.04);
  ctx.lineTo(s * 0.68, s * 0.96);
  ctx.moveTo(s * 0.04, s * 0.50);
  ctx.lineTo(s * 0.96, s * 0.50);
  ctx.stroke();
}

// =============================================================================
// [Group 2: 시내 상가·근린생활·오피스 빌딩 (Material 5 ~ 9)]
// 1층 쇼윈도 + 층간 가로 간판 띠(Signboard Band: 빨강, 파랑, 노랑, 녹색) + 고대비 창호
// =============================================================================

function drawHighContrastCommercialBuilding(
  ctx: CanvasRenderingContext2D,
  s: number,
  facadeBgColor: string,
  signBgColor: string,
  signTextColor: string,
  signLabelText: string,
  isBrick = false,
  brickMortar = '#ffffff'
): void {
  // 1. 외벽 기본 배경
  ctx.fillStyle = facadeBgColor;
  ctx.fillRect(0, 0, s, s);

  if (isBrick) {
    // 치장벽돌 줄눈 패턴
    ctx.strokeStyle = brickMortar;
    ctx.lineWidth = 2.5;
    const rowH = s * 0.055;
    const colW = s * 0.11;
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

  // 2. 1층(0~4m, 하단 38% 영역): 어두운 화강석 기단부 + 밝은 매장 통유리 쇼윈도
  const shopY = s * 0.58;
  const shopH = s * 0.42;

  // 어두운 화강석 프레임 (#1e293b)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, shopY, s, shopH);

  // 쇼윈도 밝은 내부 투명유리 (#fef08a 내부 조명 + #38bdf8 반사광)
  const showGrad = ctx.createLinearGradient(0, shopY, 0, s);
  showGrad.addColorStop(0, '#fef08a');
  showGrad.addColorStop(0.35, '#38bdf8');
  showGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = showGrad;
  ctx.fillRect(s * 0.06, shopY + 12, s * 0.88, shopH - 24);

  // 쇼윈도 알루미늄 프레임 & 출입문
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.06, shopY + 12, s * 0.88, shopH - 24);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, shopY + 12);
  ctx.lineTo(s * 0.5, s - 12);
  ctx.stroke();

  // 3. [핵심] 층간 가로 간판 띠 (Signboard Band) - 원색 직사각형 패치 + 흰색 타이포 블록
  const signH = s * 0.14;
  const signY = shopY - signH - 8;

  // 간판 박스 바탕
  ctx.fillStyle = signBgColor;
  ctx.fillRect(s * 0.05, signY, s * 0.90, signH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.05, signY, s * 0.90, signH);

  // 간판 글씨 블록 (원거리에서도 한국 상가 간판임이 확연히 구별되도록 굵은 패치 구성)
  ctx.fillStyle = signTextColor;
  // 주 상호명 블록
  ctx.fillRect(s * 0.12, signY + signH * 0.28, s * 0.28, signH * 0.44);
  ctx.fillRect(s * 0.44, signY + signH * 0.28, s * 0.24, signH * 0.44);
  // 전화번호 및 보조 텍스트
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.72, signY + signH * 0.35, s * 0.18, signH * 0.30);

  // 4. 상층부 일반 창호 (2~4층 창문)
  const uwX = s * 0.10;
  const uwY = s * 0.08;
  const uwW = s * 0.80;
  const uwH = signY - uwY - 14;

  if (uwH > 30) {
    // 백색 하이샤시 프레임
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(uwX - 6, uwY - 6, uwW + 12, uwH + 12);

    // 짙은 반사유리
    const wGrad = ctx.createLinearGradient(uwX, uwY, uwX, uwY + uwH);
    wGrad.addColorStop(0, '#38bdf8');
    wGrad.addColorStop(0.5, '#0284c7');
    wGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = wGrad;
    ctx.fillRect(uwX, uwY, uwW, uwH);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(uwX, uwY, uwW, uwH);

    // 3열 창문 분할선
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(uwX + uwW * 0.33, uwY);
    ctx.lineTo(uwX + uwW * 0.33, uwY + uwH);
    ctx.moveTo(uwX + uwW * 0.66, uwY);
    ctx.lineTo(uwX + uwW * 0.66, uwY + uwH);
    ctx.stroke();
  }

  applyNoise(ctx, s, 0.03);
}

// Slot 5: 밝은 사비석 화강석 타일(#dcd4c6) + 빨간색 식당/카페 간판(#dc2626)
export function drawSlot5_CommBeigeGraniteSign(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastCommercialBuilding(ctx, s, '#dcd4c6', '#dc2626', '#ffffff', '식당/카페');
}

// Slot 6: 붉은 치장벽돌(#8c3828) + 파란색 학원/부동산 간판(#2563eb)
export function drawSlot6_CommRedBrickCommercial(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastCommercialBuilding(ctx, s, '#8c3828', '#2563eb', '#ffffff', '대성학원', true, '#ffffff');
}

// Slot 7: 다크 차콜 메탈 패널(#3f3f46) + 노란색 편의점/베이커리 간판(#eab308)
export function drawSlot7_CommDarkMetalOffice(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastCommercialBuilding(ctx, s, '#3f3f46', '#eab308', '#0f172a', '편의점');
}

// Slot 8: 갈색 파벽돌(#6e473b) + 초록색 약국/클리닉 간판(#16a34a)
export function drawSlot8_CommBrownBrick(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastCommercialBuilding(ctx, s, '#6e473b', '#16a34a', '#ffffff', '온누리약국', true, '#e2e8f0');
}

// Slot 9: 화이트 메디컬/클리닉 빌딩(#ffffff) + 파랑/녹색 치과·의원 듀얼 간판
export function drawSlot9_CommWhiteBlueMedical(ctx: CanvasRenderingContext2D, s: number): void {
  drawHighContrastCommercialBuilding(ctx, s, '#f8fafc', '#0284c7', '#ffffff', '연세치과의원');
  // 녹색 십자 마크
  ctx.fillStyle = '#16a34a';
  const cx = s * 0.85;
  const cy = s * 0.20;
  ctx.fillRect(cx - 18, cy - 6, 36, 12);
  ctx.fillRect(cx - 6, cy - 18, 12, 36);
}

// =============================================================================
// [Group 3: 반곡동 혁신도시 공공기관·관공서·학교·병원 (Material 10 ~ 12)]
// =============================================================================

// Slot 10: 반곡동 혁신도시 공공청사 - 밝은 화강석 포디움(#e5e0d5) + 은청색/스카이블루 커튼월(#38bdf8 ~ #0284c7) + 은백색 멀리언(#f1f5f9)
export function drawSlot10_GovSkyBlueGlassPodium(ctx: CanvasRenderingContext2D, s: number): void {
  // 상층부 스카이블루 반사 커튼월
  const curGrad = ctx.createLinearGradient(0, 0, s, s);
  curGrad.addColorStop(0, '#7dd3fc');
  curGrad.addColorStop(0.4, '#38bdf8');
  curGrad.addColorStop(0.8, '#0284c7');
  curGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = curGrad;
  ctx.fillRect(0, 0, s, s);

  // 대각선 반사 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.4);
  ctx.lineTo(s * 0.5, 0);
  ctx.lineTo(s * 0.8, 0);
  ctx.lineTo(0, s * 0.7);
  ctx.closePath();
  ctx.fill();

  // 은백색 알루미늄 멀리언 수직/수평 격자 프레임
  ctx.fillStyle = '#f1f5f9';
  for (let x = 0; x < s; x += s * 0.10) {
    ctx.fillRect(x, 0, 6, s * 0.70);
  }
  for (let y = s * 0.12; y < s * 0.70; y += s * 0.15) {
    ctx.fillRect(0, y, s, 5);
  }

  // 1~2층 밝은 화강석 기단부 포디움 (#e5e0d5, 하단 30% 영역)
  ctx.fillStyle = '#e5e0d5';
  ctx.fillRect(0, s * 0.70, s, s * 0.30);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, s * 0.70, s, 8); // 몰딩 턱

  // 대형 유리 로비 현관 및 회전문
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.20, s * 0.76, s * 0.60, s * 0.24);
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(s * 0.22, s * 0.78, s * 0.56, s * 0.20);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.22, s * 0.78, s * 0.56, s * 0.20);
}

// Slot 11: 4층 초·중·고교 교사동 - 오렌지 테라코타(#ea580c) & 크림 화이트 + 규칙적인 교실 창문
export function drawSlot11_GovSchoolTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s);

  // 상단 및 하단 오렌지 테라코타 밴드
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, s, s * 0.12);
  ctx.fillRect(0, s * 0.88, s, s * 0.12);

  // 3열 와이드 교실 창문
  const wW = s * 0.25;
  const wH = s * 0.62;
  const y = s * 0.18;

  for (let c = 0; c < 3; c++) {
    const x = s * 0.05 + c * (wW + s * 0.07);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, y - 5, wW + 10, wH + 10);

    const winGrad = ctx.createLinearGradient(x, y, x, y + wH);
    winGrad.addColorStop(0, '#67e8f9');
    winGrad.addColorStop(1, '#0e7490');
    ctx.fillStyle = winGrad;
    ctx.fillRect(x, y, wW, wH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, wW, wH);
    ctx.beginPath();
    ctx.moveTo(x, y + wH * 0.35);
    ctx.lineTo(x + wW, y + wH * 0.35);
    ctx.stroke();
  }
}

// Slot 12: 종합병원·의료원 - 화이트 메탈 패널 + 그린 틴티드 창호 + 적십자 엠블럼
export function drawSlot12_GovHospitalHelipad(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 그린 틴티드 연속 수평 창호
  const hGrad = ctx.createLinearGradient(0, s * 0.25, 0, s * 0.70);
  hGrad.addColorStop(0, '#5eead4');
  hGrad.addColorStop(0.5, '#0f766e');
  hGrad.addColorStop(1, '#134e4a');
  ctx.fillStyle = hGrad;
  ctx.fillRect(s * 0.05, s * 0.25, s * 0.90, s * 0.45);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.05, s * 0.25, s * 0.90, s * 0.45);

  // 적십자 마크
  ctx.fillStyle = '#ef4444';
  const ex = s * 0.5;
  const ey = s * 0.12;
  ctx.fillRect(ex - 22, ey - 7, 44, 14);
  ctx.fillRect(ex - 7, ey - 22, 14, 44);
}

// =============================================================================
// [Group 4: 저층 주택·빌라·군 통합막사 (Material 13 ~ 15)]
// =============================================================================

// Slot 13: 적벽돌 다세대 빌라 (#991b1b)
export function drawSlot13_ResiRedBrickVilla(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(0, 0, s, s);

  // 백색 줄눈
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
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

  // 2개의 백색 하이샤시 단창
  const vW = s * 0.32;
  const vH = s * 0.50;
  const y = s * 0.25;
  for (let i = 0; i < 2; i++) {
    const x = s * 0.12 + i * (vW + s * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 6, y - 6, vW + 12, vH + 12);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, vW, vH);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 3, y + 3, vW - 6, vH * 0.45);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, vW, vH);
    ctx.beginPath();
    ctx.moveTo(x + vW * 0.5, y);
    ctx.lineTo(x + vW * 0.5, y + vH);
    ctx.stroke();
  }
}

// Slot 14: 크림 스타코(#fef3c7) + 1층 필로티 주차장 원룸
export function drawSlot14_ResiPilotiStuccoStudio(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s * 0.65);

  // 1층 필로티 주차장
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, s * 0.65, s, s * 0.35);

  // 화강석 콘크리트 기둥 3개
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(s * 0.10, s * 0.65, s * 0.12, s * 0.35);
  ctx.fillRect(s * 0.44, s * 0.65, s * 0.12, s * 0.35);
  ctx.fillRect(s * 0.78, s * 0.65, s * 0.12, s * 0.35);

  // 2개의 단창
  const wW = s * 0.28;
  const wH = s * 0.42;
  const y = s * 0.12;
  for (let i = 0; i < 2; i++) {
    const x = s * 0.14 + i * (wW + s * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, y - 5, wW + 10, wH + 10);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(x, y, wW, wH);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, wW, wH);
  }
}

// Slot 15: 샌드 베이지 군 표준 통합막사 (#e5e0d8) + 적벽돌 기단
export function drawSlot15_ResiSandBeigeBarracks(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#e5e0d8';
  ctx.fillRect(0, 0, s, s);

  // 하단 적벽돌 기단부
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(0, s * 0.80, s, s * 0.20);
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(0, s * 0.80, s, 6);

  // 격자 내무반 창문
  const bW = s * 0.30;
  const bH = s * 0.50;
  const y = s * 0.18;
  for (let i = 0; i < 2; i++) {
    const x = s * 0.12 + i * (bW + s * 0.16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, y - 5, bW + 10, bH + 10);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, bW, bH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, bW, bH);
    ctx.beginPath();
    ctx.moveTo(x + bW * 0.5, y);
    ctx.lineTo(x + bW * 0.5, y + bH);
    ctx.stroke();
  }
}

// =============================================================================
// [구조물 전용 재질 4종 (Material 16 ~ 19)]
// =============================================================================

// Slot 16: 아파트 양옆 좁은 측벽(Side Wall) - 창문 없는 매끈한 콘크리트 + 단지별 수직 컬러 밴드 & 동 번호
export function drawSlot16_AptSideWall(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 네이비 블루 & 오렌지 수직 브랜드 스트라이프
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(s * 0.10, 0, s * 0.12, s);
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(s * 0.22, 0, s * 0.03, s);

  // 아파트 동 번호 표시 (101)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(s * 0.42, s * 0.15, s * 0.40, s * 0.12);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.48, s * 0.18, s * 0.06, s * 0.06);
  ctx.fillRect(s * 0.59, s * 0.18, s * 0.06, s * 0.06);
  ctx.fillRect(s * 0.70, s * 0.18, s * 0.06, s * 0.06);

  applyNoise(ctx, s, 0.02);
}

// Slot 17: 상가 1층 기단부(Podium) - 어두운 화강석 프레임 + 틴티드 쇼윈도 + 스테인리스 도어
export function drawSlot17_CommPodium(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  const wGrad = ctx.createLinearGradient(0, s * 0.1, 0, s * 0.9);
  wGrad.addColorStop(0, '#fef08a');
  wGrad.addColorStop(0.35, '#38bdf8');
  wGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = wGrad;
  ctx.fillRect(s * 0.06, s * 0.1, s * 0.88, s * 0.8);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(s * 0.06, s * 0.1, s * 0.88, s * 0.8);
}

// Slot 18: 가로 간판 박스(Signboard) - 빨강/파랑/노랑/녹색 원색 패치 4분할
export function drawSlot18_Signboard(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  const colors = ['#dc2626', '#2563eb', '#eab308', '#16a34a'];
  const w = s * 0.22;
  const h = s * 0.70;
  const y = s * 0.15;

  for (let i = 0; i < 4; i++) {
    const x = s * 0.04 + i * (w + s * 0.02);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // 흰색 타이포 블록
    ctx.fillStyle = i === 2 ? '#0f172a' : '#ffffff';
    ctx.fillRect(x + w * 0.15, y + h * 0.35, w * 0.70, h * 0.30);
  }
}

// Slot 19: 아파트 입구 현관 포치 & 캐노피
export function drawSlot19_AptPorch(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#7c4d32';
  ctx.fillRect(0, 0, s, s);

  // 알루미늄 캐노피 상판
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s * 0.28);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, s * 0.26, s, 6);

  // 현관 자동문 유리
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(s * 0.15, s * 0.35, s * 0.70, s * 0.65);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.15, s * 0.35, s * 0.70, s * 0.65);
}

// =============================================================================
// [20종 고대비 실사 PBR Material 생성 팩토리]
// =============================================================================

let cachedHighDetailMaterials: THREE.MeshStandardMaterial[] | null = null;

export function getVworldHighDetailMaterials(): THREE.MeshStandardMaterial[] {
  if (cachedHighDetailMaterials && cachedHighDetailMaterials.length === 20) {
    return cachedHighDetailMaterials;
  }

  const s = 1024;
  const drawFns = [
    drawSlot0_AptCreamWhiteBrown,
    drawSlot1_AptSandBeigeTerracotta,
    drawSlot2_AptWarmGrayCharcoal,
    drawSlot3_AptCoolGrayNavy,
    drawSlot4_AptCurtainWallTower,
    drawSlot5_CommBeigeGraniteSign,
    drawSlot6_CommRedBrickCommercial,
    drawSlot7_CommDarkMetalOffice,
    drawSlot8_CommBrownBrick,
    drawSlot9_CommWhiteBlueMedical,
    drawSlot10_GovSkyBlueGlassPodium,
    drawSlot11_GovSchoolTerracotta,
    drawSlot12_GovHospitalHelipad,
    drawSlot13_ResiRedBrickVilla,
    drawSlot14_ResiPilotiStuccoStudio,
    drawSlot15_ResiSandBeigeBarracks,
    drawSlot16_AptSideWall,
    drawSlot17_CommPodium,
    drawSlot18_Signboard,
    drawSlot19_AptPorch,
  ];

  const materials: THREE.MeshStandardMaterial[] = [];

  for (let i = 0; i < drawFns.length; i++) {
    const canvas = createOffscreen1024Canvas();
    const ctx = typeof (canvas as any).getContext === 'function' ? canvas.getContext('2d') : null;
    if (ctx) {
      drawFns[i](ctx, s);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 16;

    const isCurtainWall = i === 4 || i === 10;
    const isMetal = i === 7;

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      vertexColors: true,
      roughness: isCurtainWall ? 0.20 : isMetal ? 0.32 : 0.60,
      metalness: isCurtainWall ? 0.28 : isMetal ? 0.58 : 0.04,
      side: THREE.DoubleSide,
    });

    materials.push(mat);
  }

  cachedHighDetailMaterials = materials;
  return materials;
}
