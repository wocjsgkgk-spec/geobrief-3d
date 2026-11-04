/**
 * lib/vendor/vworldAuthenticAtlasGenerator.ts
 *
 * [GeoBrief 3D 2단계: V-World 1:1 매칭 16종 포토 파사드 아틀라스 & 5단 입체 지붕 고도화]
 *
 * 국토교통부 브이월드(V-World 3D) 실제 항공촬영 뷰와 1:1 일치하는 16종 독립 1024x1024 고해상도 PBR CanvasTexture 엔진:
 *
 * Group 0 ~ 4 (한국형 아파트 5종 - 단지별 브랜드 외관 차별화):
 *   - Group 0: 화이트 & 민트그레이 발코니 창 아파트 (밝은 크림 화이트 #f8f6f0, 발코니 창 #1e2e2b, 순백색 창틀 #ffffff, 1~3층 브라운 화강석 기단부 #8c583a)
 *   - Group 1: 샌드 베이지 & 테라코타 투톤 아파트 (따뜻한 베이지 #ece4d5, 테라코타 브라운 #7c3f2c 포인트 밴드, 층간 슬래브 음영)
 *   - Group 2: 모던 라이트 웜그레이 아파트 (라이트 그레이 #dcd8d0, 다크 차콜 #334155 계단실 코어 창, 베란다 난간 살)
 *   - Group 3: 하이엔드 네이비 포인트 아파트 (화이트 콘크리트 #f8fafc, 짙은 네이비 #1e3a5f 측벽 도색)
 *   - Group 4: 주상복합 유리 커튼월 타워 (에메랄드/블루그레이 통유리 반사창 #38bdf8~#0284c7, 화이트 수직 프레임)
 *   - 아파트 양끝 좁은 측벽(Side Wall, Slot 16): 창문 없이 매끈한 콘크리트 + 단지별 수직 컬러 라인 & 동 번호!
 *
 * Group 5 ~ 9 (시내 상가·원룸·근린생활 빌딩 5종 - 1층 쇼윈도 & 컬러 간판 완벽 재현):
 *   - Group 5: 밝은 베이지 화강석 상가 (#dcd4c6, 1층 어두운 통유리 쇼윈도, 빨강/파랑/노랑/흰색 가로 간판, 2~6층 화강석 타일과 사각 창문)
 *   - Group 6: 붉은 치장벽돌 상가주택 (1층 상가 매장, 2~5층 선명한 적벽돌 #9e3b28 외벽과 백색 창틀)
 *   - Group 7: 모던 다크 차콜 상업 빌딩 (차콜 메탈 복합패널 #3f3f46, 대형 가로 창호, 컬러 네온 간판)
 *   - Group 8: 황토/갈색 파벽돌 근린상가 (#6e473b 벽돌 줄눈 질감, 온누리약국/클리닉)
 *   - Group 9: 화이트 타일 & 스카이블루 메디컬/학원 빌딩 (순백색 타일, 스카이블루 창호, 메디컬 녹색 십자 엠블럼)
 *
 * Group 10 ~ 12 (혁신도시 공공기관·관공서·학교 3종):
 *   - Group 10: 반곡동 혁신도시 스타일 스카이블루 유리 커튼월 청사 (맑은 하늘색 #7dd3fc 반사 유리, 은색 알루미늄 루버, 1~2층 화강석 로비)
 *   - Group 11: 학교 교사동 (4층 고정, 따뜻한 살구색/테라코타 #d97742 & 크림색 투톤 외벽, 규칙적 교실 창호)
 *   - Group 12: 대형 병원/연구시설 (화이트 패널, 그린 틴티드 수평 창호, 옥상 헬리패드/적십자)
 *
 * Group 13 ~ 15 (저층 빌라·단독주택·군막사 3종):
 *   - Group 13: 적벽돌 다세대 빌라 (선명한 적벽돌 줄눈 + 2구 백색 하이샤시 창문)
 *   - Group 14: 필로티 크림 스타코 원룸 (따뜻한 크림 스타코 #fef3c7 + 1층 필로티 주차장 기둥)
 *   - Group 15: 샌드 베이지 군 표준 통합막사 (샌드 베이지 #e5e0d8 콘크리트, 적갈색 기단부, 격자 창호)
 */

import * as THREE from 'three';

// 옥상 4대 실측 컬러 정의
export const AUTHENTIC_ROOF_COLORS = {
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

/**
 * 한국형 고층 아파트 고대비 발코니 창문 & 외벽 공통 렌더러
 */
function drawAuthenticAptWindow(
  ctx: CanvasRenderingContext2D,
  s: number,
  wallColor: string,
  glassStartColor: string,
  glassEndColor: string,
  podiumBand?: { y: number; h: number; color: string; border?: string },
  verticalStripe?: { x: number; w: number; color: string }
): void {
  // 1. 기본 외벽 바탕
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, s, s);

  // 2. 층간 슬래브 줄눈
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.02);
  ctx.lineTo(s, s * 0.02);
  ctx.moveTo(0, s * 0.98);
  ctx.lineTo(s, s * 0.98);
  ctx.stroke();

  // 3. 하단 기단부 밴드 (1~3층 투톤)
  if (podiumBand) {
    ctx.fillStyle = podiumBand.color;
    ctx.fillRect(0, podiumBand.y, s, podiumBand.h);
    if (podiumBand.border) {
      ctx.fillStyle = podiumBand.border;
      ctx.fillRect(0, podiumBand.y, s, 8);
    }
  }

  // 4. 수직 브랜드 포인트 스트라이프
  if (verticalStripe) {
    ctx.fillStyle = verticalStripe.color;
    ctx.fillRect(verticalStripe.x, 0, verticalStripe.w, s);
  }

  // 5. 창호 영역 산출 (좌우 여백 12%, 상하 여백 14%)
  const wx = s * 0.12;
  const wy = s * 0.14;
  const ww = s * 0.76;
  const wh = s * 0.72;

  // 6. 선명한 순백색(#ffffff) 창틀 외곽 프레임
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 10, wy - 10, ww + 20, wh + 20);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(wx - 10, wy - 10, ww + 20, wh + 20);

  // 7. 깊고 진한 발코니 통유리창 그라데이션
  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, glassStartColor);
  gGrad.addColorStop(0.5, glassEndColor);
  gGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 8. 상단 하늘빛 대각선 반사 하이라이트 광택
  ctx.fillStyle = 'rgba(125, 211, 252, 0.42)';
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh * 0.35);
  ctx.lineTo(wx + ww * 0.55, wy);
  ctx.lineTo(wx + ww * 0.85, wy);
  ctx.lineTo(wx, wy + wh * 0.75);
  ctx.closePath();
  ctx.fill();

  // 9. 창틀 십자 멀리언(Mullion) 프레임 - 선명한 순백색 (#ffffff)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx + ww * 0.5 - 6, wy, 12, wh);
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

/**
 * 상가·근린생활시설 공통 렌더러 (1층 쇼윈도 + 컬러 간판 패치 + 상층 창문)
 */
function drawAuthenticCommercialBuilding(
  ctx: CanvasRenderingContext2D,
  s: number,
  wallColor: string,
  signColor: string,
  signTextColor: string,
  signText: string,
  isBrick = false,
  brickMortar = '#ffffff'
): void {
  // 1. 외벽 기본 바탕
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, s, s);

  // 2. 벽돌 질감인 경우
  if (isBrick) {
    ctx.strokeStyle = brickMortar;
    ctx.lineWidth = 2;
    const rowH = s * 0.04;
    const colW = s * 0.08;
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
  } else {
    // 화강석 타일 줄눈
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    for (let y = s * 0.15; y < s; y += s * 0.20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
  }

  // 3. 1층 쇼윈도 (어두운 통유리 매장)
  const f1Y = s * 0.65;
  const f1H = s * 0.35;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.04, f1Y, s * 0.92, f1H);

  const glassGrad = ctx.createLinearGradient(0, f1Y, 0, f1Y + f1H);
  glassGrad.addColorStop(0, '#1e293b');
  glassGrad.addColorStop(0.4, '#0f172a');
  glassGrad.addColorStop(1, '#020617');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(s * 0.06, f1Y + 8, s * 0.88, f1H - 16);

  // 1층 쇼윈도 프레임 & 출입문
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.06, f1Y + 8, s * 0.88, f1H - 16);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, f1Y + 8);
  ctx.lineTo(s * 0.5, f1Y + f1H - 8);
  ctx.stroke();

  // 4. [핵심] 층간 한국형 컬러 가로 간판 패치
  const signY = s * 0.50;
  const signH = s * 0.12;
  const signX = s * 0.05;
  const signW = s * 0.90;

  ctx.fillStyle = signColor;
  ctx.fillRect(signX, signY, signW, signH);

  // 간판 입체 베젤 프레임
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(signX, signY, signW, signH);

  // 간판 텍스트
  ctx.fillStyle = signTextColor;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(signText, s * 0.5, signY + signH * 0.5);

  // 5. 상층부 (2~4층) 사각 창문
  const uwY = s * 0.12;
  const uwH = s * 0.32;
  const uwX = s * 0.10;
  const uwW = s * 0.80;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(uwX - 6, uwY - 6, uwW + 12, uwH + 12);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.strokeRect(uwX - 6, uwY - 6, uwW + 12, uwH + 12);

  const uGrad = ctx.createLinearGradient(0, uwY, 0, uwY + uwH);
  uGrad.addColorStop(0, '#38bdf8');
  uGrad.addColorStop(0.3, '#0284c7');
  uGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = uGrad;
  ctx.fillRect(uwX, uwY, uwW, uwH);

  // 상층 창문 3분할 멀리언
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(uwX + uwW * 0.33, uwY);
  ctx.lineTo(uwX + uwW * 0.33, uwY + uwH);
  ctx.moveTo(uwX + uwW * 0.66, uwY);
  ctx.lineTo(uwX + uwW * 0.66, uwY + uwH);
  ctx.stroke();

  applyNoise(ctx, s, 0.03);
}

// =============================================================================
// [Group 0 ~ 4: 한국형 아파트 5종]
// =============================================================================

// Group 0: 화이트 & 민트그레이 발코니 창 아파트 (#f8f6f0 + #1e2e2b + #ffffff + 하단 3개층 #8c583a)
export function drawGroup0_AptWhiteMint(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticAptWindow(
    ctx,
    s,
    '#f8f6f0',
    '#1e2e2b',
    '#162a26',
    { y: s * 0.78, h: s * 0.22, color: '#8c583a', border: '#5c3520' }
  );
}

// Group 1: 샌드 베이지 & 테라코타 투톤 아파트 (#ece4d5 + #7c3f2c 포인트 밴드)
export function drawGroup1_AptSandTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticAptWindow(
    ctx,
    s,
    '#ece4d5',
    '#1e293b',
    '#0f172a',
    { y: s * 0.78, h: s * 0.22, color: '#7c3f2c', border: '#5a2d1f' },
    { x: s * 0.82, w: s * 0.18, color: '#7c3f2c' }
  );
}

// Group 2: 모던 라이트 웜그레이 아파트 (#dcd8d0 + #334155 계단실 코어 창)
export function drawGroup2_AptWarmGray(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticAptWindow(
    ctx,
    s,
    '#dcd8d0',
    '#1a2e2b',
    '#0f172a',
    { y: s * 0.80, h: s * 0.20, color: '#334155', border: '#1e293b' },
    { x: 0, w: s * 0.14, color: '#334155' }
  );
  // 계단실 수직 슬릿 창호 (#7dd3fc 반사광)
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(s * 0.04, s * 0.10, s * 0.06, s * 0.80);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(s * 0.04, s * 0.10, s * 0.06, s * 0.80);
}

// Group 3: 하이엔드 네이비 포인트 아파트 (화이트 콘크리트 #f8fafc + 짙은 네이비 #1e3a5f)
export function drawGroup3_AptNavyPoint(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticAptWindow(
    ctx,
    s,
    '#f8fafc',
    '#1e293b',
    '#0f172a',
    { y: s * 0.80, h: s * 0.20, color: '#1e3a5f', border: '#172554' },
    { x: 0, w: s * 0.14, color: '#1e3a5f' }
  );
}

// Group 4: 주상복합 유리 커튼월 타워 (에메랄드/블루그레이 통유리 반사창 + 화이트 프레임)
export function drawGroup4_AptCurtainWallTower(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, s, s);

  // 미러 글라스 커튼월 그라데이션
  const gGrad = ctx.createLinearGradient(0, 0, s, s);
  gGrad.addColorStop(0, '#38bdf8');
  gGrad.addColorStop(0.35, '#0284c7');
  gGrad.addColorStop(0.7, '#0369a1');
  gGrad.addColorStop(1, '#082f49');
  ctx.fillStyle = gGrad;
  ctx.fillRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);

  // 대각선 반사 하이라이트 광택
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.beginPath();
  ctx.moveTo(s * 0.04, s * 0.5);
  ctx.lineTo(s * 0.55, s * 0.04);
  ctx.lineTo(s * 0.85, s * 0.04);
  ctx.lineTo(s * 0.04, s * 0.85);
  ctx.closePath();
  ctx.fill();

  // 화이트 알루미늄 멀리언 수직/수평 격자 프레임
  ctx.fillStyle = '#ffffff';
  for (let x = s * 0.04; x <= s * 0.96; x += s * 0.16) {
    ctx.fillRect(x - 3, s * 0.04, 6, s * 0.92);
  }
  for (let y = s * 0.04; y <= s * 0.96; y += s * 0.23) {
    ctx.fillRect(s * 0.04, y - 4, s * 0.92, 8);
  }

  // 층간 짙은 스팬드럴 글래스 바
  ctx.fillStyle = '#0c4a6e';
  ctx.fillRect(s * 0.04, s * 0.46, s * 0.92, s * 0.08);
}

// =============================================================================
// [Group 5 ~ 9: 시내 상가·원룸·근린생활 빌딩 5종]
// =============================================================================

// Group 5: 밝은 베이지 화강석 상가 (#dcd4c6, 빨간색 식당/카페 간판)
export function drawGroup5_CommBeigeGranite(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticCommercialBuilding(ctx, s, '#dcd4c6', '#dc2626', '#ffffff', '식당 / 카페');
}

// Group 6: 붉은 치장벽돌 상가주택 (#9e3b28, 파란색 학원/부동산 간판)
export function drawGroup6_CommRedBrick(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticCommercialBuilding(ctx, s, '#9e3b28', '#2563eb', '#ffffff', '대성학원', true, '#ffffff');
}

// Group 7: 모던 다크 차콜 상업 빌딩 (#3f3f46, 노란색 편의점/베이커리 간판)
export function drawGroup7_CommDarkMetal(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticCommercialBuilding(ctx, s, '#3f3f46', '#eab308', '#0f172a', '편의점 / 카페');
}

// Group 8: 황토/갈색 파벽돌 근린상가 (#6e473b, 초록색 약국 간판)
export function drawGroup8_CommBrownBrick(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticCommercialBuilding(ctx, s, '#6e473b', '#16a34a', '#ffffff', '온누리약국', true, '#e2e8f0');
}

// Group 9: 화이트 타일 & 스카이블루 메디컬/학원 빌딩 (#f8fafc + 스카이블루 + 십자 마크)
export function drawGroup9_CommWhiteMedical(ctx: CanvasRenderingContext2D, s: number): void {
  drawAuthenticCommercialBuilding(ctx, s, '#f8fafc', '#0284c7', '#ffffff', '연세치과의원');
  // 메디컬 녹색 십자 마크
  ctx.fillStyle = '#16a34a';
  const cx = s * 0.85;
  const cy = s * 0.20;
  ctx.fillRect(cx - 18, cy - 6, 36, 12);
  ctx.fillRect(cx - 6, cy - 18, 12, 36);
}

// =============================================================================
// [Group 10 ~ 12: 혁신도시 공공기관·관공서·학교 3종]
// =============================================================================

// Group 10: 반곡동 혁신도시 스타일 스카이블루 유리 커튼월 청사 (#7dd3fc 반사 유리 + 은색 알루미늄 루버)
export function drawGroup10_GovSkyBlueGlass(ctx: CanvasRenderingContext2D, s: number): void {
  const curGrad = ctx.createLinearGradient(0, 0, s, s);
  curGrad.addColorStop(0, '#7dd3fc');
  curGrad.addColorStop(0.4, '#38bdf8');
  curGrad.addColorStop(0.8, '#0284c7');
  curGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = curGrad;
  ctx.fillRect(0, 0, s, s);

  // 대각선 반사 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.4);
  ctx.lineTo(s * 0.5, 0);
  ctx.lineTo(s * 0.8, 0);
  ctx.lineTo(0, s * 0.7);
  ctx.closePath();
  ctx.fill();

  // 은백색 알루미늄 멀리언 격자 프레임
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
  ctx.fillRect(0, s * 0.70, s, 8);

  // 대형 유리 로비 현관 및 회전문
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.20, s * 0.76, s * 0.60, s * 0.24);
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(s * 0.22, s * 0.78, s * 0.56, s * 0.20);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.22, s * 0.78, s * 0.56, s * 0.20);
}

// Group 11: 4층 초·중·고교 교사동 (따뜻한 살구색/테라코타 #d97742 & 크림색 투톤 외벽)
export function drawGroup11_GovSchool(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s);

  // 상단 및 하단 따뜻한 살구색/테라코타 밴드 (#d97742)
  ctx.fillStyle = '#d97742';
  ctx.fillRect(0, 0, s, s * 0.13);
  ctx.fillRect(0, s * 0.87, s, s * 0.13);

  // 3열 와이드 교실 창문
  const wW = s * 0.25;
  const wH = s * 0.60;
  const y = s * 0.20;

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

// Group 12: 대형 병원/연구시설 (화이트 패널 + 그린 틴티드 창호 + 옥상 헬리패드/적십자)
export function drawGroup12_GovHospital(ctx: CanvasRenderingContext2D, s: number): void {
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
// [Group 13 ~ 15: 저층 주택·빌라·군 통합막사]
// =============================================================================

// Group 13: 적벽돌 다세대 빌라 (#9e3b28 + 정교한 흰색 줄눈 + 2구 하이샤시 창문)
export function drawGroup13_ResiRedBrickVilla(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#9e3b28';
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

// Group 14: 필로티 크림 스타코 원룸 (#fef3c7 + 1층 필로티 주차장 기둥)
export function drawGroup14_ResiPilotiStucco(ctx: CanvasRenderingContext2D, s: number): void {
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

// Group 15: 샌드 베이지 군 표준 통합막사 (#e5e0d8 + 적갈색 기단부)
export function drawGroup15_ResiSandBarracks(ctx: CanvasRenderingContext2D, s: number): void {
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
// [구조물 전용 재질 4종 (Slot 16 ~ 19)]
// =============================================================================

// Slot 16: 아파트 양끝 좁은 측벽 (Side Wall) - 창문 없는 매끈한 콘크리트 + 단지별 수직 컬러 밴드 & 동 번호
export function drawGroup16_AptSideWall(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 수직 컬러 포인트 라인 (네이비 #1e3a8a & 골드 #d97706)
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(s * 0.18, 0, s * 0.14, s);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(s * 0.32, 0, s * 0.04, s);

  // 상단 굵은 동 번호 ("101")
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101', s * 0.65, s * 0.25);

  applyNoise(ctx, s, 0.02);
}

// Slot 17: 상가 기단부 (Podium)
export function drawGroup17_CommPodium(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#dcd4c6';
  ctx.fillRect(0, 0, s, s);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.05, s * 0.15, s * 0.90, s * 0.85);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(s * 0.08, s * 0.18, s * 0.84, s * 0.78);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.08, s * 0.18, s * 0.84, s * 0.78);
}

// Slot 18: 간판 (Signboard)
export function drawGroup18_Signboard(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, s, s);

  const colors = ['#dc2626', '#2563eb', '#eab308', '#16a34a'];
  const labels = ['식당', '학원', '카페', '약국'];
  const blockW = s * 0.23;
  for (let i = 0; i < 4; i++) {
    const x = s * 0.03 + i * (blockW + s * 0.015);
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, s * 0.20, blockW, s * 0.60);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, s * 0.20, blockW, s * 0.60);
    ctx.fillStyle = i === 2 ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i], x + blockW * 0.5, s * 0.50);
  }
}

// Slot 19: 아파트 포치 (Porch)
export function drawGroup19_AptPorch(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#7c4d32';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.20, s * 0.25, s * 0.60, s * 0.75);
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(s * 0.24, s * 0.30, s * 0.52, s * 0.65);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.24, s * 0.30, s * 0.52, s * 0.65);
}

// =============================================================================
// [16종 + 4종 독립 Material 배열 팩토리 & 싱글톤 캐시]
// =============================================================================

let cachedAuthenticMaterials: THREE.MeshStandardMaterial[] | null = null;

export function getVworldAuthenticMaterials(): THREE.MeshStandardMaterial[] {
  if (cachedAuthenticMaterials && cachedAuthenticMaterials.length === 20) {
    return cachedAuthenticMaterials;
  }

  const s = 1024;
  const drawFns = [
    drawGroup0_AptWhiteMint,
    drawGroup1_AptSandTerracotta,
    drawGroup2_AptWarmGray,
    drawGroup3_AptNavyPoint,
    drawGroup4_AptCurtainWallTower,
    drawGroup5_CommBeigeGranite,
    drawGroup6_CommRedBrick,
    drawGroup7_CommDarkMetal,
    drawGroup8_CommBrownBrick,
    drawGroup9_CommWhiteMedical,
    drawGroup10_GovSkyBlueGlass,
    drawGroup11_GovSchool,
    drawGroup12_GovHospital,
    drawGroup13_ResiRedBrickVilla,
    drawGroup14_ResiPilotiStucco,
    drawGroup15_ResiSandBarracks,
    drawGroup16_AptSideWall,
    drawGroup17_CommPodium,
    drawGroup18_Signboard,
    drawGroup19_AptPorch,
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
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    // 슬롯별 특성에 맞는 러프니스/메탈니스 설정
    let roughness = 0.45;
    let metalness = 0.05;
    if (i === 4 || i === 10) {
      // 커튼월 타워 및 공공청사 유리
      roughness = 0.20;
      metalness = 0.25;
    } else if (i === 7) {
      // 다크 메탈 오피스
      roughness = 0.35;
      metalness = 0.30;
    } else if (i === 6 || i === 8 || i === 13) {
      // 벽돌 질감
      roughness = 0.70;
      metalness = 0.02;
    }

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness,
      metalness,
      side: THREE.DoubleSide,
    });
    mat.name = `vworld-authentic-slot-${i}`;
    materials.push(mat);
  }

  cachedAuthenticMaterials = materials;
  return materials;
}
