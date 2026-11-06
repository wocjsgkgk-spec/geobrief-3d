/**
 * lib/vendor/seoulGradeFacadeAtlas.ts
 *
 * [GeoBrief 3D 2단계: 서울 LoD3/LoD4급 포토 파사드 아틀라스 엔진]
 *
 * 브이월드(V-World 3D) 서울 실사 파사드(image_1efbec.jpg)를 그대로 재현하는
 * 16개 독립 캔버스 텍스처(1024x1024) 및 PBR Material 매트릭스:
 *
 * 재질 0~4번 (서울 대단지 아파트군):
 *   - 순백색(#f8fafc)·크림 아이보리(#f1f5f9)·밝은 은회색(#e2e8f0) 몸통
 *   - 짙은 슬레이트 섀시 촘촘한 창문 그리드(#1e293b)
 *   - 수직 청록/블루/그린 그라데이션 브랜드 스트라이프(#0284c7 -> #10b981) 또는 웜 테라코타 포인트
 *
 * 재질 5~9번 (서울 밀집 적벽돌 빌라 & 주택가, 면적 < 250㎡, 층고 7~13m):
 *   - 짙은 적벽돌(#7f1d1d), 황토 적벽돌(#9a3412), 따뜻한 베이지 석재 파벽돌(#d6d3d1), 백색 타일 바둑판(#f8fafc)
 *   - 선명한 화이트 창틀 + 1층 필로티 주차장/주차선(#facc15) 및 짙은 현관문
 *
 * 재질 10~15번 (서울 도심 오피스 & 상업 타워):
 *   - 다크 에메랄드/청록 글래스 커튼월 타워 (#134e4a ~ #2dd4bf)
 *   - 딥 스카이블루 반사유리 타워 (#0369a1 ~ #38bdf8)
 *   - 프리캐스트 콘크리트(PC) 화이트 프레임 + 블랙 가로 리본창 오피스 (#0f172a, #f8fafc)
 *   - 화강석 테라코타 공공청사 (#7c2d12, #9a3412)
 *   - 1~2층 짙은 화강석 스트리트 상가 + 컬러풀 간판들 (#dc2626, #2563eb, #eab308)
 *   - 모던 차콜 메탈 패널 상업 빌딩 (#27272a, #3f3f46)
 *
 * 건축 구조물 슬롯 16~19:
 *   - 16: 아파트 측벽 (동 번호 + 수직 브랜드 컬러)
 *   - 17: 상가 포디움 (화강석 기단)
 *   - 18: 가로형 상가 간판 띠장
 *   - 19: 현관 포치 및 캐노피
 */

import * as THREE from 'three';

function createOffscreen1024Canvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    return canvas;
  }
  return { width: 1024, height: 1024 } as any;
}

// 미세 표면 노이즈 (자연스러운 외벽 음영)
function applyNoise(ctx: CanvasRenderingContext2D, s: number, opacity = 0.025): void {
  try {
    const imgData = ctx.getImageData(0, 0, s, s);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const n = (Math.random() - 0.5) * 45 * opacity;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {}
}

// ---------------------------------------------------------------------------
// [재질 0~4]: 서울 대단지 아파트군 (1024x1024)
// ---------------------------------------------------------------------------

/**
 * Slot 0: 서울 힐스테이트/푸르지오 스타일 순백색 + 청록/그린 그라데이션 브랜드 스트라이프
 */
function drawSlot0_SeoulAptMintTeal(ctx: CanvasRenderingContext2D, s: number): void {
  // 1. 눈부신 순백색 바디 (#f8fafc)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 2. 수직 청록/그린 그라데이션 브랜드 스트라이프 (#0284c7 -> #0d9488 -> #10b981)
  const stripeW = s * 0.16;
  const sGrad = ctx.createLinearGradient(0, 0, 0, s);
  sGrad.addColorStop(0, '#0284c7');
  sGrad.addColorStop(0.5, '#0d9488');
  sGrad.addColorStop(1, '#10b981');
  ctx.fillStyle = sGrad;
  ctx.fillRect(s * 0.04, 0, stripeW, s);

  // 3. 층간 슬래브 줄눈
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.02);
  ctx.lineTo(s, s * 0.02);
  ctx.moveTo(0, s * 0.98);
  ctx.lineTo(s, s * 0.98);
  ctx.stroke();

  // 4. 짙은 슬레이트 섀시 촘촘한 발코니 창문 그리드 (#1e293b)
  const wx = s * 0.24;
  const wy = s * 0.14;
  const ww = s * 0.72;
  const wh = s * 0.72;

  // 창틀 외곽 프레임
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(wx - 4, wy - 4, ww + 8, wh + 8);

  // 반사 유리 그라데이션 (#0f172a -> #1e293b -> #334155)
  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#0f172a');
  gGrad.addColorStop(0.4, '#1e293b');
  gGrad.addColorStop(1, '#334155');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 창문 수직 멀리언 분할 (2베이 대형 발코니)
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.5, wy);
  ctx.lineTo(wx + ww * 0.5, wy + wh);
  ctx.stroke();

  // 하단 안전 난간살 (Balcony Railings)
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.75)';
  ctx.lineWidth = 1.5;
  const railH = wh * 0.42;
  const railY = wy + wh - railH;
  for (let rx = wx + 12; rx < wx + ww - 8; rx += 18) {
    ctx.beginPath();
    ctx.moveTo(rx, railY);
    ctx.lineTo(rx, wy + wh - 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(wx + 4, railY);
  ctx.lineTo(wx + ww - 4, railY);
  ctx.stroke();

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 1: 서울 래미안 스타일 크림 아이보리(#f1f5f9) + 웜 테라코타 포인트 (#9a3412 -> #c2410c)
 */
function drawSlot1_SeoulAptIvoryTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  // 크림 아이보리 바디
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, s, s);

  // 우측 수직 웜 테라코타 브랜드 악센트
  const tGrad = ctx.createLinearGradient(0, 0, 0, s);
  tGrad.addColorStop(0, '#9a3412');
  tGrad.addColorStop(0.6, '#c2410c');
  tGrad.addColorStop(1, '#ea580c');
  ctx.fillStyle = tGrad;
  ctx.fillRect(s * 0.82, 0, s * 0.14, s);

  // 층간 슬래브 음영선
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.02);
  ctx.lineTo(s, s * 0.02);
  ctx.moveTo(0, s * 0.98);
  ctx.lineTo(s, s * 0.98);
  ctx.stroke();

  // 다크 브론즈 창호 영역
  const wx = s * 0.08;
  const wy = s * 0.14;
  const ww = s * 0.68;
  const wh = s * 0.72;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#1c1917');
  gGrad.addColorStop(0.5, '#292524');
  gGrad.addColorStop(1, '#44403c');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 3분할 슬라이딩 섀시 창
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.33, wy);
  ctx.lineTo(wx + ww * 0.33, wy + wh);
  ctx.moveTo(wx + ww * 0.66, wy);
  ctx.lineTo(wx + ww * 0.66, wy + wh);
  ctx.stroke();

  // 베란다 난간
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 1.5;
  const railH = wh * 0.38;
  const railY = wy + wh - railH;
  for (let rx = wx + 10; rx < wx + ww - 6; rx += 16) {
    ctx.beginPath();
    ctx.moveTo(rx, railY);
    ctx.lineTo(rx, wy + wh - 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(wx + 4, railY);
  ctx.lineTo(wx + ww - 4, railY);
  ctx.stroke();

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 2: 서울 아크로/자이 스타일 밝은 은회색(#e2e8f0) + 딥 로얄 블루 스트라이프
 */
function drawSlot2_SeoulAptSilverBlue(ctx: CanvasRenderingContext2D, s: number): void {
  // 밝은 은회색 바디
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, s, s);

  // 좌측 딥 로얄 블루 브랜드 스트라이프 (#1d4ed8 -> #2563eb -> #3b82f6)
  const bGrad = ctx.createLinearGradient(0, 0, 0, s);
  bGrad.addColorStop(0, '#1e3a8a');
  bGrad.addColorStop(0.5, '#1d4ed8');
  bGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = bGrad;
  ctx.fillRect(s * 0.05, 0, s * 0.15, s);

  // 슬래브 라인
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.02);
  ctx.lineTo(s, s * 0.02);
  ctx.stroke();

  // 창문 영역 (연속 수평 창 느낌)
  const wx = s * 0.25;
  const wy = s * 0.15;
  const ww = s * 0.70;
  const wh = s * 0.70;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#020617');
  gGrad.addColorStop(0.5, '#0f172a');
  gGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 알루미늄 멀리언
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.5, wy);
  ctx.lineTo(wx + ww * 0.5, wy + wh);
  ctx.stroke();

  // 투명 접합유리 난간 (Glass Balustrade)
  ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
  const railH = wh * 0.40;
  const railY = wy + wh - railH;
  ctx.fillRect(wx, railY, ww, railH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(wx, railY, ww, railH);

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 3: 서울 아이파크 스타일 순백색(#ffffff) + 볼드 코발트 액센트
 */
function drawSlot3_SeoulAptPureWhiteCobalt(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  // 중앙 사선/수직 코발트 패턴 포인트
  ctx.fillStyle = '#1e40af';
  ctx.fillRect(s * 0.03, 0, s * 0.10, s);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(s * 0.13, 0, s * 0.03, s);

  // 층간 라인
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.02);
  ctx.lineTo(s, s * 0.02);
  ctx.stroke();

  // 창문 영역 (대형 광폭 창)
  const wx = s * 0.22;
  const wy = s * 0.12;
  const ww = s * 0.74;
  const wh = s * 0.76;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#0f172a');
  gGrad.addColorStop(0.7, '#1e293b');
  gGrad.addColorStop(1, '#334155');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 2베이 창호
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.48, wy);
  ctx.lineTo(wx + ww * 0.48, wy + wh);
  ctx.stroke();

  // 안전 난간
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  const railH = wh * 0.38;
  const railY = wy + wh - railH;
  for (let rx = wx + 12; rx < wx + ww - 8; rx += 18) {
    ctx.beginPath();
    ctx.moveTo(rx, railY);
    ctx.lineTo(rx, wy + wh - 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(wx + 4, railY);
  ctx.lineTo(wx + ww - 4, railY);
  ctx.stroke();

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 4: 서울 더샵 스타일 순백색 + 에메랄드 글래스 발코니 커튼월 룩
 */
function drawSlot4_SeoulAptGlassBalcony(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 외곽 프레임
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, s, s);

  // 전체 폭 와이드 에메랄드 틴티드 글래스 창문
  const wx = s * 0.06;
  const wy = s * 0.10;
  const ww = s * 0.88;
  const wh = s * 0.80;

  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#042f2e');
  gGrad.addColorStop(0.4, '#0f766e');
  gGrad.addColorStop(0.8, '#14b8a6');
  gGrad.addColorStop(1, '#2dd4bf');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 정밀 실버 멀리언 격자
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  for (let ci = 1; ci < 4; ci++) {
    const mx = wx + ci * (ww / 4);
    ctx.beginPath();
    ctx.moveTo(mx, wy);
    ctx.lineTo(mx, wy + wh);
    ctx.stroke();
  }

  // 층간 스팬드럴 글래스 바
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(wx, wy, ww, wh * 0.18);

  applyNoise(ctx, s, 0.02);
}

// ---------------------------------------------------------------------------
// [재질 5~9]: 서울 밀집 적벽돌 빌라 & 주택가 (1024x1024, area < 250㎡)
// ---------------------------------------------------------------------------

/**
 * Slot 5: 서울 클래식 짙은 적벽돌(#7f1d1d) 다세대 빌라 + 백색 창틀 + 1층 필로티 주차선
 */
function drawSlot5_SeoulVillaDeepRedBrick(ctx: CanvasRenderingContext2D, s: number): void {
  // 1. 짙은 적벽돌 바탕 줄눈 (#7f1d1d / #991b1b)
  ctx.fillStyle = '#e2e8f0'; // 백색 모르타르 줄눈 바탕
  ctx.fillRect(0, 0, s, s);

  const rowH = 18;
  const brickW = 44;
  const numRows = Math.floor(s / rowH);

  for (let r = 0; r < numRows; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const offset = isOdd ? brickW * 0.5 : 0;
    const numCols = Math.floor(s / brickW) + 2;

    for (let c = -1; c < numCols; c++) {
      const x = c * brickW + offset;
      const hueShift = (Math.sin(r * 11 + c * 7) + 1) * 0.5;
      ctx.fillStyle = hueShift > 0.6 ? '#7f1d1d' : hueShift > 0.3 ? '#991b1b' : '#b91c1c';
      ctx.fillRect(x + 1.5, y + 1.5, brickW - 3, rowH - 3);
    }
  }

  // 2. 2~4층: 선명한 화이트 PVC 하이샤시 이중창문 2구
  const winCols = [
    { x: s * 0.12, y: s * 0.12, w: s * 0.32, h: s * 0.48 },
    { x: s * 0.56, y: s * 0.12, w: s * 0.32, h: s * 0.48 },
  ];

  for (const w of winCols) {
    // 화이트 창틀 케이싱 (#ffffff)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w.x - 6, w.y - 6, w.w + 12, w.h + 12);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x - 6, w.y - 6, w.w + 12, w.h + 12);

    // 하단 화강석 빗물받이 인방
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(w.x - 10, w.y + w.h + 6, w.w + 20, 8);

    // 반사 유리
    const gGrad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    gGrad.addColorStop(0, '#0f172a');
    gGrad.addColorStop(1, '#334155');
    ctx.fillStyle = gGrad;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    // 2구 슬라이딩 창호
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w.x + w.w * 0.5, w.y);
    ctx.lineTo(w.x + w.w * 0.5, w.y + w.h);
    ctx.stroke();

    // 1층 방범창 살 (Security Grilles)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    for (let gx = w.x + 8; gx < w.x + w.w; gx += 12) {
      ctx.beginPath();
      ctx.moveTo(gx, w.y + w.h * 0.45);
      ctx.lineTo(gx, w.y + w.h);
      ctx.stroke();
    }
  }

  // 3. 1층 필로티 주차장 & 짙은 현관문 (하단 28% 영역)
  const pY = s * 0.72;
  const pH = s * 0.28;

  // 필로티 개방구 (콘크리트 내부 음영)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(s * 0.08, pY, s * 0.52, pH);

  // 콘크리트 기둥 (#94a3b8)
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(s * 0.08, pY, 18, pH);
  ctx.fillRect(s * 0.58, pY, 18, pH);

  // 바닥 황색 주차선 (#facc15)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(s * 0.16, pY + pH - 8);
  ctx.lineTo(s * 0.48, pY + pH - 8);
  ctx.stroke();

  // 짙은 목재/메탈 공동현관문 (#3f1a0e)
  const dX = s * 0.68;
  const dW = s * 0.24;
  ctx.fillStyle = '#292524';
  ctx.fillRect(dX, pY, dW, pH);
  ctx.strokeStyle = '#a8a29e';
  ctx.lineWidth = 3;
  ctx.strokeRect(dX, pY, dW, pH);

  // 도어 핸들 & 인터폰
  ctx.fillStyle = '#fef08a'; // 황동 손잡이
  ctx.fillRect(dX + 10, pY + pH * 0.5, 4, 16);

  applyNoise(ctx, s, 0.025);
}

/**
 * Slot 6: 서울 황토 적벽돌(#9a3412) 다세대 빌라 + 백색 창틀 + 필로티 주차구획
 */
function drawSlot6_SeoulVillaOcherRedBrick(ctx: CanvasRenderingContext2D, s: number): void {
  // 백색 모르타르 줄눈
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, s, s);

  const rowH = 18;
  const brickW = 44;
  const numRows = Math.floor(s / rowH);

  for (let r = 0; r < numRows; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const offset = isOdd ? brickW * 0.5 : 0;
    const numCols = Math.floor(s / brickW) + 2;

    for (let c = -1; c < numCols; c++) {
      const x = c * brickW + offset;
      const hueShift = (Math.sin(r * 13 + c * 5) + 1) * 0.5;
      ctx.fillStyle = hueShift > 0.6 ? '#9a3412' : hueShift > 0.3 ? '#b45309' : '#c2410c';
      ctx.fillRect(x + 1.5, y + 1.5, brickW - 3, rowH - 3);
    }
  }

  // 2구 와이드 화이트 창호
  const winCols = [
    { x: s * 0.10, y: s * 0.12, w: s * 0.35, h: s * 0.50 },
    { x: s * 0.55, y: s * 0.12, w: s * 0.35, h: s * 0.50 },
  ];

  for (const w of winCols) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w.x - 6, w.y - 6, w.w + 12, w.h + 12);

    const gGrad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    gGrad.addColorStop(0, '#0f172a');
    gGrad.addColorStop(1, '#334155');
    ctx.fillStyle = gGrad;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w.x + w.w * 0.5, w.y);
    ctx.lineTo(w.x + w.w * 0.5, w.y + w.h);
    ctx.stroke();
  }

  // 1층 필로티 주차장
  const pY = s * 0.72;
  const pH = s * 0.28;
  ctx.fillStyle = '#18181b';
  ctx.fillRect(s * 0.06, pY, s * 0.60, pH);

  // 주차선 (#facc15)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(s * 0.15, pY + pH - 8);
  ctx.lineTo(s * 0.55, pY + pH - 8);
  ctx.stroke();

  // 현관문
  ctx.fillStyle = '#3f3f46';
  ctx.fillRect(s * 0.72, pY, s * 0.22, pH);
  ctx.strokeStyle = '#a1a1aa';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(s * 0.72, pY, s * 0.22, pH);

  applyNoise(ctx, s, 0.025);
}

/**
 * Slot 7: 서울 따뜻한 베이지 석재 파벽돌(#d6d3d1, #e7e5e4) 대리석 빌라
 */
function drawSlot7_SeoulVillaBeigeStone(ctx: CanvasRenderingContext2D, s: number): void {
  // 베이지 석재 슬래브 바탕 (#d6d3d1)
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, s, s);

  // 석재 대형 타일 줄눈 (120px x 60px 대형 대리석 패널)
  ctx.strokeStyle = '#a8a29e';
  ctx.lineWidth = 2.5;
  const panelW = 128;
  const panelH = 64;

  for (let y = 0; y < s; y += panelH) {
    const isOdd = Math.floor(y / panelH) % 2 === 1;
    const offset = isOdd ? panelW * 0.5 : 0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();

    for (let x = -panelW; x < s + panelW; x += panelW) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset, y + panelH);
      ctx.stroke();
    }
  }

  // 다크 브론즈 창틀 + 반사유리
  const winCols = [
    { x: s * 0.12, y: s * 0.14, w: s * 0.32, h: s * 0.48 },
    { x: s * 0.56, y: s * 0.14, w: s * 0.32, h: s * 0.48 },
  ];

  for (const w of winCols) {
    ctx.fillStyle = '#292524'; // 다크 브론즈
    ctx.fillRect(w.x - 5, w.y - 5, w.w + 10, w.h + 10);

    const gGrad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    gGrad.addColorStop(0, '#0f172a');
    gGrad.addColorStop(1, '#292524');
    ctx.fillStyle = gGrad;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w.x + w.w * 0.5, w.y);
    ctx.lineTo(w.x + w.w * 0.5, w.y + w.h);
    ctx.stroke();
  }

  // 1층 필로티 자동문 로비 (#1c1917)
  const pY = s * 0.72;
  const pH = s * 0.28;
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(s * 0.10, pY, s * 0.50, pH);

  // 주차 기둥
  ctx.fillStyle = '#78716c';
  ctx.fillRect(s * 0.10, pY, 20, pH);
  ctx.fillRect(s * 0.58, pY, 20, pH);

  // 자동문
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.68, pY, s * 0.24, pH);
  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(s * 0.68, pY, s * 0.24, pH);

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 8: 서울 백색 타일 바둑판(#f8fafc) 모던 빌라 + 블랙 창틀 + 필로티 주차장
 */
function drawSlot8_SeoulVillaWhiteTileGrid(ctx: CanvasRenderingContext2D, s: number): void {
  // 순백색 타일 바탕 (#f8fafc)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 바둑판형 정밀 타일 그리드 줄눈 (#94a3b8)
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  const tileSize = 32;

  for (let x = 0; x < s; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }
  for (let y = 0; y < s; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 블랙 알루미늄 슬림 창틀 (#0f172a)
  const winCols = [
    { x: s * 0.14, y: s * 0.12, w: s * 0.30, h: s * 0.50 },
    { x: s * 0.56, y: s * 0.12, w: s * 0.30, h: s * 0.50 },
  ];

  for (const w of winCols) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(w.x - 6, w.y - 6, w.w + 12, w.h + 12);

    const gGrad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    gGrad.addColorStop(0, '#020617');
    gGrad.addColorStop(0.6, '#0f172a');
    gGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = gGrad;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w.x + w.w * 0.5, w.y);
    ctx.lineTo(w.x + w.w * 0.5, w.y + w.h);
    ctx.stroke();
  }

  // 1층 필로티 주차장
  const pY = s * 0.72;
  const pH = s * 0.28;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.08, pY, s * 0.54, pH);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(s * 0.16, pY + pH - 8);
  ctx.lineTo(s * 0.50, pY + pH - 8);
  ctx.stroke();

  // 현관문
  ctx.fillStyle = '#18181b';
  ctx.fillRect(s * 0.70, pY, s * 0.22, pH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(s * 0.70, pY, s * 0.22, pH);

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 9: 서울 샌드 스타코(#f5f5f4) & 우드 슬랫 루버 단독주택/고급빌라
 */
function drawSlot9_SeoulVillaStuccoWood(ctx: CanvasRenderingContext2D, s: number): void {
  // 샌드 스타코 바탕
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(0, 0, s, s);

  // 우측 수직 삼나무 목재 슬랫 루버 (#78350f, #92400e)
  const louverX = s * 0.65;
  const louverW = s * 0.28;
  ctx.fillStyle = '#451a03';
  ctx.fillRect(louverX, 0, louverW, s);

  const slatW = 8;
  const slatGap = 6;
  for (let x = louverX + 4; x < louverX + louverW - 4; x += slatW + slatGap) {
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x, 0, slatW, s);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + slatW - 2, 0, 2, s);
  }

  // 좌측 모던 픽처 윈도우 (와이드 블랙 프레임)
  const wx = s * 0.10;
  const wy = s * 0.16;
  const ww = s * 0.48;
  const wh = s * 0.48;

  ctx.fillStyle = '#18181b';
  ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);

  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#09090b');
  gGrad.addColorStop(1, '#27272a');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // 1층 주차 및 진입문
  const pY = s * 0.72;
  const pH = s * 0.28;
  ctx.fillStyle = '#27272a';
  ctx.fillRect(s * 0.08, pY, s * 0.45, pH);

  applyNoise(ctx, s, 0.025);
}

// ---------------------------------------------------------------------------
// [재질 10~15]: 서울 도심 오피스 & 상업 타워 (1024x1024)
// ---------------------------------------------------------------------------

/**
 * Slot 10: 다크 에메랄드/청록 글래스 커튼월 타워 (#134e4a ~ #2dd4bf)
 */
function drawSlot10_SeoulCurtainWallEmerald(ctx: CanvasRenderingContext2D, s: number): void {
  // 다크 에메랄드/청록 글래스 그라데이션
  const gGrad = ctx.createLinearGradient(0, 0, 0, s);
  gGrad.addColorStop(0, '#134e4a');
  gGrad.addColorStop(0.4, '#0f766e');
  gGrad.addColorStop(0.7, '#14b8a6');
  gGrad.addColorStop(1, '#2dd4bf');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, 0, s, s);

  // 층간 스팬드럴 글래스 밴드 (어두운 유리 띠)
  ctx.fillStyle = 'rgba(4, 47, 46, 0.65)';
  const numFloors = 4;
  const floorH = s / numFloors;
  for (let f = 0; f < numFloors; f++) {
    ctx.fillRect(0, f * floorH, s, floorH * 0.25);
  }

  // 실버/알루미늄 수직 & 수평 구조 멀리언 그리드 (#e2e8f0)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;

  const numMullions = 6;
  const stepX = s / numMullions;
  for (let i = 1; i < numMullions; i++) {
    ctx.beginPath();
    ctx.moveTo(i * stepX, 0);
    ctx.lineTo(i * stepX, s);
    ctx.stroke();
  }

  for (let f = 0; f <= numFloors; f++) {
    ctx.beginPath();
    ctx.moveTo(0, f * floorH);
    ctx.lineTo(s, f * floorH);
    ctx.stroke();
  }

  // 유리 반사 하이라이트 (사선 빛 반사 효과)
  const lGrad = ctx.createLinearGradient(0, 0, s, s);
  lGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  lGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
  lGrad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
  ctx.fillStyle = lGrad;
  ctx.fillRect(0, 0, s, s);
}

/**
 * Slot 11: 딥 스카이블루 반사유리 타워 (#0369a1 ~ #38bdf8)
 */
function drawSlot11_SeoulCurtainWallSkyBlue(ctx: CanvasRenderingContext2D, s: number): void {
  // 딥 스카이블루 반사유리 그라데이션
  const gGrad = ctx.createLinearGradient(0, 0, 0, s);
  gGrad.addColorStop(0, '#0c4a6e');
  gGrad.addColorStop(0.3, '#0369a1');
  gGrad.addColorStop(0.7, '#0284c7');
  gGrad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, 0, s, s);

  // 스팬드럴 섀도우 밴드
  ctx.fillStyle = 'rgba(8, 47, 73, 0.70)';
  const numFloors = 4;
  const floorH = s / numFloors;
  for (let f = 0; f < numFloors; f++) {
    ctx.fillRect(0, f * floorH, s, floorH * 0.22);
  }

  // 딥 차콜 메탈 트랜섬 바 (#0f172a)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3.5;

  const numMullions = 8;
  const stepX = s / numMullions;
  for (let i = 1; i < numMullions; i++) {
    ctx.beginPath();
    ctx.moveTo(i * stepX, 0);
    ctx.lineTo(i * stepX, s);
    ctx.stroke();
  }
  for (let f = 0; f <= numFloors; f++) {
    ctx.beginPath();
    ctx.moveTo(0, f * floorH);
    ctx.lineTo(s, f * floorH);
    ctx.stroke();
  }

  // 빛 반사 사선 그라데이션
  const sGrad = ctx.createLinearGradient(0, s * 0.2, s, s * 0.8);
  sGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  sGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)');
  sGrad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  ctx.fillStyle = sGrad;
  ctx.fillRect(0, 0, s, s);
}

/**
 * Slot 12: 프리캐스트 콘크리트(PC) 화이트 프레임 + 블랙 가로 리본창 오피스 (#0f172a, #f8fafc)
 */
function drawSlot12_SeoulRibbonOfficePC(ctx: CanvasRenderingContext2D, s: number): void {
  // 화이트 PC 프레임 바탕 (#f8fafc)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  const numFloors = 3;
  const floorH = s / numFloors;

  for (let f = 0; f < numFloors; f++) {
    const fy = f * floorH;

    // 상단 PC 스팬드럴 보 (Precast concrete beam)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, fy, s, floorH * 0.35);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, fy, s, floorH * 0.35);

    // 연속 블랙 수평 리본창 (Continuous ribbon window, #0f172a)
    const winY = fy + floorH * 0.35;
    const winH = floorH * 0.65;

    const rGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
    rGrad.addColorStop(0, '#020617');
    rGrad.addColorStop(0.5, '#0f172a');
    rGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = rGrad;
    ctx.fillRect(0, winY, s, winH);

    // 슬림 실버 창호 분할 멀리언
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.5;
    const numPanels = 6;
    const pw = s / numPanels;
    for (let p = 1; p < numPanels; p++) {
      ctx.beginPath();
      ctx.moveTo(p * pw, winY);
      ctx.lineTo(p * pw, winY + winH);
      ctx.stroke();
    }
  }

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 13: 화강석 테라코타 공공청사 / 대형 사옥 (#7c2d12, #9a3412)
 */
function drawSlot13_SeoulTerracottaCivicTower(ctx: CanvasRenderingContext2D, s: number): void {
  // 테라코타 화강석 바탕
  const tGrad = ctx.createLinearGradient(0, 0, 0, s);
  tGrad.addColorStop(0, '#7c2d12');
  tGrad.addColorStop(0.5, '#9a3412');
  tGrad.addColorStop(1, '#b45309');
  ctx.fillStyle = tGrad;
  ctx.fillRect(0, 0, s, s);

  // 화강석 석재 블록 줄눈
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  const bw = 96;
  const bh = 54;
  for (let y = 0; y < s; y += bh) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }
  for (let x = 0; x < s; x += bw) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }

  // 규칙적 정방형 깊은 오피스 창호 4개 (Punched square windows)
  const rows = 2;
  const cols = 2;
  const wW = s * 0.32;
  const wH = s * 0.30;
  const startX = s * 0.12;
  const startY = s * 0.12;
  const gapX = s * 0.12;
  const gapY = s * 0.16;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = startX + c * (wW + gapX);
      const wy = startY + r * (wH + gapY);

      // 깊은 석재 창문 음영 프레임
      ctx.fillStyle = '#451a03';
      ctx.fillRect(wx - 6, wy - 6, wW + 12, wH + 12);

      const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wH);
      gGrad.addColorStop(0, '#0f172a');
      gGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = gGrad;
      ctx.fillRect(wx, wy, wW, wH);

      // 알루미늄 루버 살
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(wx + wW * 0.5, wy);
      ctx.lineTo(wx + wW * 0.5, wy + wH);
      ctx.stroke();
    }
  }

  applyNoise(ctx, s, 0.025);
}

/**
 * Slot 14: 시내 고밀도 스트리트 복합 상가 (1~2층 짙은 화강석 + 레드 #dc2626, 블루 #2563eb, 옐로우 #eab308 실사 간판)
 */
function drawSlot14_SeoulCommercialVibrantSigns(ctx: CanvasRenderingContext2D, s: number): void {
  // 1. 상층부(3~6층): 밝은 그레이 화강석 타일 외벽 (#d6d3d1)
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, s, s);

  // 상층 창문 3개
  const topWinY = s * 0.08;
  const topWinH = s * 0.34;
  const numWins = 3;
  const ww = s * 0.24;
  const wGap = s * 0.08;

  for (let i = 0; i < numWins; i++) {
    const wx = s * 0.08 + i * (ww + wGap);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wx - 4, topWinY - 4, ww + 8, topWinH + 8);

    const gGrad = ctx.createLinearGradient(wx, topWinY, wx, topWinY + topWinH);
    gGrad.addColorStop(0, '#0f172a');
    gGrad.addColorStop(1, '#334155');
    ctx.fillStyle = gGrad;
    ctx.fillRect(wx, topWinY, ww, topWinH);

    // 창문 유리 시트지 글자 띠 (치과 / 학원)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(wx + 4, topWinY + topWinH * 0.4, ww - 8, 14);
  }

  // 2. 2층 간판 띠장 (#2563eb 블루 & #16a34a 그린 약국/학원 간판)
  const signY1 = s * 0.46;
  const signH1 = s * 0.12;

  // 블루 학원 간판
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(s * 0.05, signY1, s * 0.55, signH1);
  ctx.fillStyle = '#fef08a'; // 노란 텍스트 박스
  ctx.fillRect(s * 0.12, signY1 + 12, s * 0.40, signH1 - 24);

  // 그린 온누리약국/클리닉 간판
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(s * 0.63, signY1, s * 0.32, signH1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.70, signY1 + 12, s * 0.18, signH1 - 24);

  // 3. 1층 스트리트 상가 (짙은 블랙 화강석 포디움, #1c1917)
  const baseY = s * 0.62;
  const baseH = s * 0.38;
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, baseY, s, baseH);

  // 1층 레드 메인 간판 (#dc2626 식당/마트/카페)
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(s * 0.06, baseY + 6, s * 0.48, 48);
  ctx.fillStyle = '#ffffff'; // 백색 텍스트 바
  ctx.fillRect(s * 0.12, baseY + 18, s * 0.36, 24);

  // 1층 옐로우 편의점/부동산 간판 (#eab308)
  ctx.fillStyle = '#eab308';
  ctx.fillRect(s * 0.58, baseY + 6, s * 0.36, 48);
  ctx.fillStyle = '#0f172a'; // 다크 텍스트 바
  ctx.fillRect(s * 0.64, baseY + 18, s * 0.24, 24);

  // 1층 투명 대형 쇼윈도 창 (통유리 매장)
  const shopY = baseY + 62;
  const shopH = baseH - 72;

  // 쇼윈도 1 (내부 조명 웜 화이트)
  const sw1Grad = ctx.createLinearGradient(s * 0.06, shopY, s * 0.06, shopY + shopH);
  sw1Grad.addColorStop(0, '#fef08a');
  sw1Grad.addColorStop(0.3, '#ca8a04');
  sw1Grad.addColorStop(1, '#18181b');
  ctx.fillStyle = sw1Grad;
  ctx.fillRect(s * 0.06, shopY, s * 0.44, shopH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(s * 0.06, shopY, s * 0.44, shopH);

  // 쇼윈도 2 (통유리 도어)
  const sw2Grad = ctx.createLinearGradient(s * 0.54, shopY, s * 0.54, shopY + shopH);
  sw2Grad.addColorStop(0, '#bae6fd');
  sw2Grad.addColorStop(0.4, '#0284c7');
  sw2Grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = sw2Grad;
  ctx.fillRect(s * 0.54, shopY, s * 0.40, shopH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(s * 0.54, shopY, s * 0.40, shopH);

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 15: 모던 차콜 메탈 패널 상업 빌딩 (#27272a, #3f3f46) + 웜 인테리어 쇼윈도
 */
function drawSlot15_SeoulCharcoalMetalCommercial(ctx: CanvasRenderingContext2D, s: number): void {
  // 다크 차콜 메탈 복합패널 (#27272a)
  ctx.fillStyle = '#27272a';
  ctx.fillRect(0, 0, s, s);

  // 메탈 패널 헤어라인 줄눈
  ctx.strokeStyle = '#52525b';
  ctx.lineWidth = 2.5;
  const pw = 160;
  const ph = 80;
  for (let y = 0; y < s; y += ph) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }
  for (let x = 0; x < s; x += pw) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }

  // 상층부 와이드 다크 글래스 창문
  const winY = s * 0.12;
  const winH = s * 0.44;
  const wx = s * 0.10;
  const ww = s * 0.80;

  ctx.fillStyle = '#18181b';
  ctx.fillRect(wx - 6, winY - 6, ww + 12, winH + 12);

  const gGrad = ctx.createLinearGradient(wx, winY, wx, winY + winH);
  gGrad.addColorStop(0, '#09090b');
  gGrad.addColorStop(0.5, '#18181b');
  gGrad.addColorStop(1, '#27272a');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, winY, ww, winH);

  ctx.strokeStyle = '#71717a';
  ctx.lineWidth = 3;
  for (let ci = 1; ci < 4; ci++) {
    const mx = wx + ci * (ww / 4);
    ctx.beginPath();
    ctx.moveTo(mx, winY);
    ctx.lineTo(mx, winY + winH);
    ctx.stroke();
  }

  // 1층 카페/베이커리 쇼윈도 (따뜻한 웜 옐로우 조명 대비)
  const baseY = s * 0.65;
  const baseH = s * 0.35;

  const wGrad = ctx.createLinearGradient(wx, baseY, wx, baseY + baseH);
  wGrad.addColorStop(0, '#fef08a');
  wGrad.addColorStop(0.3, '#ca8a04');
  wGrad.addColorStop(1, '#451a03');
  ctx.fillStyle = wGrad;
  ctx.fillRect(wx, baseY, ww, baseH - 12);

  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(wx, baseY, ww, baseH - 12);

  applyNoise(ctx, s, 0.02);
}

// ---------------------------------------------------------------------------
// [슬롯 16~19]: 한국형 전용 건축 구조물 (측벽, 포디움, 간판띠, 포치)
// ---------------------------------------------------------------------------

/**
 * Slot 16: 아파트 측벽 (동 번호 + 수직 브랜드 컬러)
 */
function drawSlot16_SeoulAptSideWall(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 수직 컬러 스트라이프
  const bGrad = ctx.createLinearGradient(0, 0, 0, s);
  bGrad.addColorStop(0, '#0284c7');
  bGrad.addColorStop(0.5, '#0d9488');
  bGrad.addColorStop(1, '#10b981');
  ctx.fillStyle = bGrad;
  ctx.fillRect(s * 0.12, 0, s * 0.18, s);

  // 상단 아파트 동 번호 원형 배지 ("101")
  const cx = s * 0.58;
  const cy = s * 0.28;
  const r = s * 0.14;

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(s * 0.10)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101', cx, cy);

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 17: 상가 포디움 (1~3층 화강석 기단)
 */
function drawSlot17_SeoulCommercialPodium(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  const gw = 128;
  const gh = 72;
  for (let y = 0; y < s; y += gh) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }
  for (let x = 0; x < s; x += gw) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }

  // 매장 쇼윈도
  const swGrad = ctx.createLinearGradient(s * 0.1, s * 0.2, s * 0.1, s * 0.85);
  swGrad.addColorStop(0, '#fef08a');
  swGrad.addColorStop(0.4, '#0f172a');
  swGrad.addColorStop(1, '#020617');
  ctx.fillStyle = swGrad;
  ctx.fillRect(s * 0.1, s * 0.2, s * 0.8, s * 0.65);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.strokeRect(s * 0.1, s * 0.2, s * 0.8, s * 0.65);

  applyNoise(ctx, s, 0.02);
}

/**
 * Slot 18: 가로형 상가 간판 띠장
 */
function drawSlot18_SeoulSignboardBand(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, s, s);

  // 레드 간판
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(s * 0.04, s * 0.15, s * 0.28, s * 0.70);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.08, s * 0.32, s * 0.20, s * 0.36);

  // 블루 간판
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(s * 0.36, s * 0.15, s * 0.28, s * 0.70);
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(s * 0.40, s * 0.32, s * 0.20, s * 0.36);

  // 옐로우 간판
  ctx.fillStyle = '#eab308';
  ctx.fillRect(s * 0.68, s * 0.15, s * 0.28, s * 0.70);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(s * 0.72, s * 0.32, s * 0.20, s * 0.36);
}

/**
 * Slot 19: 현관 포치 및 캐노피
 */
function drawSlot19_SeoulEntrancePorch(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#292524';
  ctx.fillRect(0, 0, s, s);

  // 따뜻한 백색 천장 조명 다운라이트
  const lGrad = ctx.createRadialGradient(s * 0.5, s * 0.5, 10, s * 0.5, s * 0.5, s * 0.45);
  lGrad.addColorStop(0, '#fef08a');
  lGrad.addColorStop(0.6, '#b45309');
  lGrad.addColorStop(1, '#292524');
  ctx.fillStyle = lGrad;
  ctx.fillRect(s * 0.10, s * 0.10, s * 0.80, s * 0.80);
}

// ---------------------------------------------------------------------------
// 16+4 = 20개 Material 배열 싱글톤 캐시
// ---------------------------------------------------------------------------

let cachedSeoulBuildingMaterials: THREE.MeshStandardMaterial[] | null = null;

export function getSeoulGradeBuildingMaterials(): THREE.MeshStandardMaterial[] {
  if (cachedSeoulBuildingMaterials) return cachedSeoulBuildingMaterials;

  const drawFns = [
    // 0..4: 서울 대단지 아파트군
    drawSlot0_SeoulAptMintTeal,
    drawSlot1_SeoulAptIvoryTerracotta,
    drawSlot2_SeoulAptSilverBlue,
    drawSlot3_SeoulAptPureWhiteCobalt,
    drawSlot4_SeoulAptGlassBalcony,
    // 5..9: 서울 밀집 빌라 & 주택가
    drawSlot5_SeoulVillaDeepRedBrick,
    drawSlot6_SeoulVillaOcherRedBrick,
    drawSlot7_SeoulVillaBeigeStone,
    drawSlot8_SeoulVillaWhiteTileGrid,
    drawSlot9_SeoulVillaStuccoWood,
    // 10..15: 서울 도심 오피스 & 상업 타워
    drawSlot10_SeoulCurtainWallEmerald,
    drawSlot11_SeoulCurtainWallSkyBlue,
    drawSlot12_SeoulRibbonOfficePC,
    drawSlot13_SeoulTerracottaCivicTower,
    drawSlot14_SeoulCommercialVibrantSigns,
    drawSlot15_SeoulCharcoalMetalCommercial,
    // 16..19: 한국형 전용 구조물
    drawSlot16_SeoulAptSideWall,
    drawSlot17_SeoulCommercialPodium,
    drawSlot18_SeoulSignboardBand,
    drawSlot19_SeoulEntrancePorch,
  ];

  const materials: THREE.MeshStandardMaterial[] = [];
  const s = 1024;

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

    // 슬롯별 PBR 물성
    let roughness = 0.46;
    let metalness = 0.05;

    if (i === 10 || i === 11) {
      // 에메랄드 / 스카이블루 커튼월 타워
      roughness = 0.18;
      metalness = 0.28;
    } else if (i === 4) {
      // 더샵 글래스 발코니 타워
      roughness = 0.22;
      metalness = 0.22;
    } else if (i === 15) {
      // 다크 차콜 메탈 복합패널
      roughness = 0.32;
      metalness = 0.35;
    } else if (i === 5 || i === 6 || i === 8) {
      // 적벽돌 및 타일 빌라
      roughness = 0.72;
      metalness = 0.02;
    } else if (i === 13) {
      // 테라코타 공공청사
      roughness = 0.60;
      metalness = 0.06;
    }

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness,
      metalness,
      side: THREE.DoubleSide,
    });
    mat.name = `seoul-grade-slot-${i}`;
    materials.push(mat);
  }

  cachedSeoulBuildingMaterials = materials;
  return materials;
}
