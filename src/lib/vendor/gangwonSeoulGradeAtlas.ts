/**
 * lib/vendor/gangwonSeoulGradeAtlas.ts
 *
 * [GeoBrief 3D 2단계: 강원특별자치도 18개 시·군 전역 'V-World 서울(LoD3/LoD4)급' 16종 독립 실사 파사드 아틀라스 엔진]
 *
 * 브이월드(V-World 3D) 서울 실사 항공/지상 화면(image_1effcc.jpg, image_1efbec.jpg)을 그대로 복제한
 * 16종 독립 고해상도(1024x1024) CanvasTexture & MeshLambertMaterial 배열(materials[0..15]):
 *
 * 1. 서울식 대단지 아파트 외벽 5종 (Material 0 ~ 4):
 *    - 눈부신 순백색(#f8fafc), 밝은 크림 아이보리(#f4f1ea), 밝은 실버 그레이(#e2e8f0)
 *    - 흑회색/다크민트 발코니 유리창(#1e293b), 선명한 흰색 창틀, 층간 슬래브 음영선
 *    - 측벽 청록/스카이블루(#0284c7 -> #10b981) 수직 그라데이션 도색 및 1~3층 화강석 기단
 *
 * 2. 시·군 시내 중심 상가 & 근린생활 빌딩 5종 (Material 5 ~ 9):
 *    - 1층(0~3.8m) 어두운 화강석 기둥 + 매장 통유리 쇼윈도
 *    - 1~3층 한국형 가로 간판 띠: 빨강(#dc2626), 파랑(#2563eb), 노랑(#eab308), 초록(#16a34a), 흰색 패치 & 간판
 *    - 2층 이상: ① 베이지 사비석 화강석 타일(#d6cfc2), ② 붉은 적벽돌(#7f1d1d), ③ 다크 차콜 메탈(#334155),
 *                ④ 갈색 파벽돌(#6e473b), ⑤ 화이트 타일 & 반사유리 메디컬/학원 외벽
 *
 * 3. 도청·시청·군청·혁신도시 공공기관·학교·리조트 3종 (Material 10 ~ 12):
 *    - Mat 10: 1~2층 화강석 포디움 + 다크 에메랄드/스카이블루(#0f766e ~ #0284c7) 커튼월 + 은백색 알루미늄 멀리언
 *    - Mat 11: 4층 높이 + 따뜻한 살구색/오렌지 테라코타(#d97742) & 적벽돌 투톤 외벽 + 연속 교실 창문
 *    - Mat 12: 화이트 모던 패널 + 청록 틴티드 발코니 창호
 *
 * 4. 서울식 고밀도 적벽돌 빌라·단독주택·농어촌 주택·군 표준막사 3종 (Material 13 ~ 15):
 *    - Mat 13: 짙은 적벽돌(#7c2d12) 다세대 빌라
 *    - Mat 14: 황토벽돌(#9a3412) 단독주택
 *    - Mat 15: 밝은 크림 스타코(#fef3c7) & 회색 시멘트 블록(#94a3b8) 농어촌 주택 / 군 표준막사
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

// 자연스러운 외벽 미세 텍스처 노이즈 도포
function applySurfaceNoise(ctx: CanvasRenderingContext2D, s: number, opacity = 0.02): void {
  try {
    const imgData = ctx.getImageData(0, 0, s, s);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const n = (Math.random() - 0.5) * 35 * opacity;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {}
}

// ---------------------------------------------------------------------------
// [Material 0 ~ 4] 서울식 대단지 아파트 외벽 5종
// ---------------------------------------------------------------------------

/**
 * Material 0: 눈부신 순백색(#f8fafc) + 다크민트 발코니 유리창(#1e293b & #10b981) + 청록 수직 그라데이션 측벽
 */
function drawSlot0_AptPureWhiteTeal(ctx: CanvasRenderingContext2D, s: number): void {
  // 1. 바탕: 눈부신 순백색(#f8fafc)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 2. 우측 28% 측벽(Side Wall) 수직 그라데이션 브랜드 도색 (#0284c7 -> #10b981)
  const sideGrad = ctx.createLinearGradient(s * 0.72, 0, s, s);
  sideGrad.addColorStop(0.0, '#0284c7');
  sideGrad.addColorStop(0.5, '#0ea5e9');
  sideGrad.addColorStop(1.0, '#10b981');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(s * 0.72, 0, s * 0.28, s);

  // 측벽 동 번호 그래픽 박스
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('101', s * 0.86, s * 0.25);

  // 3. 좌측 72% 본동 외벽: 4개 층 × 4개 발코니 베이
  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 4;
  const bayW = (s * 0.72) / numBays;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;

    // 층간 가로 슬래브 음영선 (Concrete Slab Shadow Line)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, yTop, s * 0.72, 6);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, yTop + 6, s * 0.72, 2);

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 8;
      const wWin = bayW - 16;
      const hWin = floorH - 32;
      const yWin = yTop + 16;

      // 선명한 흰색 창틀 프레임
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xLeft, yWin, wWin, hWin);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(xLeft + 2, yWin + 2, wWin - 4, hWin - 4);

      // 흑회색 다크민트 유리창
      const glassGrad = ctx.createLinearGradient(xLeft, yWin, xLeft, yWin + hWin);
      glassGrad.addColorStop(0, '#0f172a');
      glassGrad.addColorStop(0.5, '#1e293b');
      glassGrad.addColorStop(1, '#134e4a');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(xLeft + 4, yWin + 4, wWin - 8, hWin - 8);

      // 발코니 하단 안전 난간 살 (Balcony Railing)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.5;
      const railTop = yWin + hWin * 0.55;
      ctx.beginPath();
      ctx.moveTo(xLeft + 4, railTop);
      ctx.lineTo(xLeft + wWin - 4, railTop);
      ctx.stroke();

      for (let r = xLeft + 12; r < xLeft + wWin - 8; r += 10) {
        ctx.beginPath();
        ctx.moveTo(r, railTop);
        ctx.lineTo(r, yWin + hWin - 4);
        ctx.stroke();
      }
    }
  }

  // 4. 하단 1층 화강석 기단부 (Podium)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, s - 45, s * 0.72, 45);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, s - 45, s * 0.72, 3);

  applySurfaceNoise(ctx, s);
}

/**
 * Material 1: 밝은 크림 아이보리(#f4f1ea) + 흑회색 창문 + 스카이블루(#0284c7) 그라데이션 브랜드 라인
 */
function drawSlot1_AptCreamSkyBlue(ctx: CanvasRenderingContext2D, s: number): void {
  // 바탕: 밝은 크림 아이보리(#f4f1ea)
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, s, s);

  // 우측 측벽 스카이블루 도색
  const sideGrad = ctx.createLinearGradient(s * 0.72, 0, s, s);
  sideGrad.addColorStop(0.0, '#0369a1');
  sideGrad.addColorStop(0.6, '#0284c7');
  sideGrad.addColorStop(1.0, '#38bdf8');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(s * 0.72, 0, s * 0.28, s);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('102', s * 0.86, s * 0.25);

  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 4;
  const bayW = (s * 0.72) / numBays;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;

    // 가로 음영선
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, yTop, s * 0.72, 6);

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 8;
      const wWin = bayW - 16;
      const hWin = floorH - 32;
      const yWin = yTop + 16;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xLeft, yWin, wWin, hWin);

      const glassGrad = ctx.createLinearGradient(xLeft, yWin, xLeft, yWin + hWin);
      glassGrad.addColorStop(0, '#1e293b');
      glassGrad.addColorStop(0.7, '#334155');
      glassGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);

      // 창살
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      const midX = xLeft + wWin * 0.5;
      ctx.beginPath();
      ctx.moveTo(midX, yWin + 3);
      ctx.lineTo(midX, yWin + hWin - 3);
      ctx.stroke();
    }
  }

  // 브라운 화강석 기단부
  ctx.fillStyle = '#d6cfc2';
  ctx.fillRect(0, s - 50, s * 0.72, 50);
  ctx.fillStyle = '#8c7d70';
  ctx.fillRect(0, s - 50, s * 0.72, 3);

  applySurfaceNoise(ctx, s);
}

/**
 * Material 2: 밝은 실버 그레이(#e2e8f0) + 다크 틴트 창문 + 네이비 브랜드 라인
 */
function drawSlot2_AptSilverBlue(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, s, s);

  // 우측 측벽 딥 네이비 도색
  const sideGrad = ctx.createLinearGradient(s * 0.72, 0, s, s);
  sideGrad.addColorStop(0.0, '#1e3a8a');
  sideGrad.addColorStop(0.7, '#1d4ed8');
  sideGrad.addColorStop(1.0, '#2563eb');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(s * 0.72, 0, s * 0.28, s);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('103', s * 0.86, s * 0.25);

  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 4;
  const bayW = (s * 0.72) / numBays;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, yTop, s * 0.72, 6);

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 8;
      const wWin = bayW - 16;
      const hWin = floorH - 32;
      const yWin = yTop + 16;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xLeft, yWin, wWin, hWin);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);
    }
  }

  // 1층 다크 그레이 화강석 기단
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, s - 50, s * 0.72, 50);

  applySurfaceNoise(ctx, s);
}

/**
 * Material 3: 순백색(#ffffff) + 샴페인 골드/브라운 브랜드 라인
 */
function drawSlot3_AptModernGold(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  // 측벽 브라운/골드 도색
  const sideGrad = ctx.createLinearGradient(s * 0.72, 0, s, s);
  sideGrad.addColorStop(0.0, '#78350f');
  sideGrad.addColorStop(0.6, '#b45309');
  sideGrad.addColorStop(1.0, '#d97706');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(s * 0.72, 0, s * 0.28, s);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('104', s * 0.86, s * 0.25);

  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 4;
  const bayW = (s * 0.72) / numBays;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, yTop, s * 0.72, 5);

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 8;
      const wWin = bayW - 16;
      const hWin = floorH - 30;
      const yWin = yTop + 15;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xLeft, yWin, wWin, hWin);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);

      // 발코니 유리 가드
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fillRect(xLeft + 3, yWin + hWin * 0.5, wWin - 6, hWin * 0.5 - 3);
    }
  }

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, s - 50, s * 0.72, 50);

  applySurfaceNoise(ctx, s);
}

/**
 * Material 4: 크림 아이보리(#fbfaf8) + 세이지 그린/에메랄드 그라데이션 브랜드 라인
 */
function drawSlot4_AptSageGreen(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#fbfaf8';
  ctx.fillRect(0, 0, s, s);

  const sideGrad = ctx.createLinearGradient(s * 0.72, 0, s, s);
  sideGrad.addColorStop(0.0, '#065f46');
  sideGrad.addColorStop(0.6, '#059669');
  sideGrad.addColorStop(1.0, '#10b981');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(s * 0.72, 0, s * 0.28, s);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('105', s * 0.86, s * 0.25);

  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 4;
  const bayW = (s * 0.72) / numBays;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, yTop, s * 0.72, 5);

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 8;
      const wWin = bayW - 16;
      const hWin = floorH - 30;
      const yWin = yTop + 15;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xLeft, yWin, wWin, hWin);

      ctx.fillStyle = '#134e4a';
      ctx.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);
    }
  }

  ctx.fillStyle = '#d6cfc2';
  ctx.fillRect(0, s - 50, s * 0.72, 50);

  applySurfaceNoise(ctx, s);
}

// ---------------------------------------------------------------------------
// [Material 5 ~ 9] 시·군 시내 중심 상가 & 근린생활 빌딩 5종
// (1층 쇼윈도 + 1~3층 한국형 가로 간판 패치 + 2층 이상 실사 외벽)
// ---------------------------------------------------------------------------

/**
 * 1층 상가 쇼윈도 및 기둥 공통 렌더러
 */
function drawCommercialGroundFloor(ctx: CanvasRenderingContext2D, s: number, y0: number, h: number): void {
  // 짙은 화강석 기둥
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, y0, s, h);

  // 4개 매장 통유리 쇼윈도
  const shopW = s / 4;
  for (let i = 0; i < 4; i++) {
    const sx = i * shopW + 12;
    const sw = shopW - 24;
    const sy = y0 + 10;
    const sh = h - 18;

    // 쇼윈도 유리 & 내부 조명 광원
    const shopGrad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    shopGrad.addColorStop(0.0, '#334155');
    shopGrad.addColorStop(0.5, '#fef08a'); // 따뜻한 매장 내부 조명
    shopGrad.addColorStop(1.0, '#1e293b');
    ctx.fillStyle = shopGrad;
    ctx.fillRect(sx, sy, sw, sh);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
  }
}

/**
 * 층간 한국형 가로 간판 패치 렌더러 (빨강, 파랑, 노랑, 초록, 흰색)
 */
function drawSignboardBand(
  ctx: CanvasRenderingContext2D,
  s: number,
  y0: number,
  h: number,
  signs: { text: string; bg: string; color: string }[]
): void {
  // 간판 바 백그라운드
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, y0, s, h);

  const pad = 12;
  const totalW = s - pad * 2;
  const count = signs.length;
  const signW = (totalW - (count - 1) * 8) / count;

  for (let i = 0; i < count; i++) {
    const sign = signs[i];
    const x = pad + i * (signW + 8);

    // 간판 백그라운드
    ctx.fillStyle = sign.bg;
    ctx.fillRect(x, y0 + 4, signW, h - 8);

    // 간판 테두리
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y0 + 4, signW, h - 8);

    // 텍스트 라벨
    ctx.fillStyle = sign.color;
    ctx.font = 'bold 22px "Malgun Gothic", "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sign.text, x + signW * 0.5, y0 + h * 0.5);
  }
}

/**
 * Material 5: 시내 상가 #1 — 밝은 베이지 사비석 화강석 타일(#d6cfc2) + 빨강/파랑 한국형 간판 패치
 */
function drawSlot5_CommercialBeigeStone(ctx: CanvasRenderingContext2D, s: number): void {
  // 2층 이상: 사비석 화강석 타일
  ctx.fillStyle = '#d6cfc2';
  ctx.fillRect(0, 0, s, s);

  // 화강석 줄눈(Groove) 격자
  ctx.strokeStyle = 'rgba(120, 113, 108, 0.35)';
  ctx.lineWidth = 2;
  for (let y = 0; y < s; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }
  for (let x = 0; x < s; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }

  // 상층부 창문 (2~4층)
  for (let f = 0; f < 3; f++) {
    const yWin = 50 + f * 200;
    for (let b = 0; b < 4; b++) {
      const xWin = 20 + b * 250;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xWin, yWin, 210, 110);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(xWin + 4, yWin + 4, 202, 102);
    }
  }

  // 2층 간판 띠장 (빨강 #dc2626 & 파랑 #2563eb)
  drawSignboardBand(ctx, s, 640, 52, [
    { text: '연세치과의원', bg: '#dc2626', color: '#ffffff' },
    { text: '종로약국', bg: '#2563eb', color: '#ffffff' },
    { text: '이화부동산', bg: '#f59e0b', color: '#000000' },
  ]);

  // 1층 쇼윈도 및 입구 (하단 240px)
  drawCommercialGroundFloor(ctx, s, 740, 284);

  applySurfaceNoise(ctx, s);
}

/**
 * Material 6: 시내 상가 #2 — 붉은 적벽돌(#7f1d1d) + 노랑/초록 한국형 간판 띠
 */
function drawSlot6_CommercialRedBrick(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(0, 0, s, s);

  // 벽돌 줄눈
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < s; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 창문
  for (let f = 0; f < 3; f++) {
    const yWin = 50 + f * 200;
    for (let b = 0; b < 4; b++) {
      const xWin = 24 + b * 250;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xWin, yWin, 200, 110);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(xWin + 4, yWin + 4, 192, 102);
    }
  }

  // 간판 띠 (노랑 #eab308 & 초록 #16a34a)
  drawSignboardBand(ctx, s, 640, 52, [
    { text: '파리바게뜨', bg: '#1d4ed8', color: '#ffffff' },
    { text: '올리브영', bg: '#16a34a', color: '#ffffff' },
    { text: '메가커피', bg: '#eab308', color: '#000000' },
  ]);

  drawCommercialGroundFloor(ctx, s, 740, 284);
  applySurfaceNoise(ctx, s);
}

/**
 * Material 7: 시내 상가 #3 — 다크 차콜 메탈 복합패널(#334155) + 모던 네온 간판 띠
 */
function drawSlot7_CommercialCharcoalMetal(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, s, s);

  // 메탈 패널 메지 라인
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  for (let y = 0; y < s; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  for (let f = 0; f < 3; f++) {
    const yWin = 40 + f * 200;
    for (let b = 0; b < 4; b++) {
      const xWin = 20 + b * 250;
      ctx.fillStyle = '#0284c7'; // 블루 틴티드 창호
      ctx.fillRect(xWin, yWin, 210, 120);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(xWin + 3, yWin + 3, 204, 114);
    }
  }

  drawSignboardBand(ctx, s, 640, 52, [
    { text: '스타벅스', bg: '#065f46', color: '#ffffff' },
    { text: 'IBK기업은행', bg: '#1e3a8a', color: '#ffffff' },
    { text: '투썸플레이스', bg: '#991b1b', color: '#ffffff' },
  ]);

  drawCommercialGroundFloor(ctx, s, 740, 284);
  applySurfaceNoise(ctx, s);
}

/**
 * Material 8: 시내 상가 #4 — 갈색 파벽돌(#6e473b) + 다채로운 상가 간판 패치
 */
function drawSlot8_CommercialBrownBrick(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#6e473b';
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < s; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  for (let f = 0; f < 3; f++) {
    const yWin = 50 + f * 200;
    for (let b = 0; b < 4; b++) {
      const xWin = 24 + b * 250;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(xWin, yWin, 200, 110);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(xWin + 4, yWin + 4, 192, 102);
    }
  }

  drawSignboardBand(ctx, s, 640, 52, [
    { text: 'CU 편의점', bg: '#7c3aed', color: '#22c55e' },
    { text: '한양독서실', bg: '#0369a1', color: '#ffffff' },
    { text: '경희한의원', bg: '#15803d', color: '#ffffff' },
  ]);

  drawCommercialGroundFloor(ctx, s, 740, 284);
  applySurfaceNoise(ctx, s);
}

/**
 * Material 9: 시내 상가 #5 — 화이트 타일 & 반사유리 메디컬/학원 외벽 (#ffffff & #0284c7)
 */
function drawSlot9_CommercialMedicalWhite(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  for (let y = 0; y < s; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 와이드 메디컬 창호
  for (let f = 0; f < 3; f++) {
    const yWin = 40 + f * 200;
    for (let b = 0; b < 4; b++) {
      const xWin = 15 + b * 250;
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(xWin, yWin, 220, 120);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(xWin + 3, yWin + 3, 214, 114);
    }
  }

  drawSignboardBand(ctx, s, 640, 52, [
    { text: '서울내과의원', bg: '#0284c7', color: '#ffffff' },
    { text: '대성학원', bg: '#b91c1c', color: '#ffffff' },
    { text: '바른안과의원', bg: '#0f766e', color: '#ffffff' },
  ]);

  drawCommercialGroundFloor(ctx, s, 740, 284);
  applySurfaceNoise(ctx, s);
}

// ---------------------------------------------------------------------------
// [Material 10 ~ 12] 도청·시청·군청·공공기관·학교·리조트 3종
// ---------------------------------------------------------------------------

/**
 * Material 10: 공공기관/시·군청/오피스 타워 — 1~2층 밝은 화강석 + 상층부 다크 에메랄드/스카이블루 커튼월
 */
function drawSlot10_CivicCurtainWall(ctx: CanvasRenderingContext2D, s: number): void {
  // 상층부 에메랄드/스카이블루 반사 유리 그라데이션
  const glassGrad = ctx.createLinearGradient(0, 0, s, s);
  glassGrad.addColorStop(0.0, '#0f766e');
  glassGrad.addColorStop(0.5, '#0369a1');
  glassGrad.addColorStop(1.0, '#0284c7');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(0, 0, s, s * 0.75);

  // 은백색 알루미늄 멀리언(Mullion) 격자 프레임
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.75)';
  ctx.lineWidth = 2.5;
  for (let x = 0; x < s; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s * 0.75);
    ctx.stroke();
  }
  for (let y = 0; y < s * 0.75; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 1~2층 밝은 화강석 포디움
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, s * 0.75, s, s * 0.25);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, s * 0.75, s, 6);

  // 포디움 대형 유리 로비 창문
  for (let b = 0; b < 6; b++) {
    const lx = 20 + b * 165;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(lx, s * 0.75 + 25, 140, s * 0.25 - 45);
  }

  applySurfaceNoise(ctx, s);
}

/**
 * Material 11: 전 권역 초·중·고·대학교 교사동 — 살구색/오렌지 테라코타(#d97742) & 적벽돌 투톤
 */
function drawSlot11_SchoolTerracotta(ctx: CanvasRenderingContext2D, s: number): void {
  // 따뜻한 살구색/오렌지 테라코타
  ctx.fillStyle = '#d97742';
  ctx.fillRect(0, 0, s, s);

  // 하단 적벽돌 투톤
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(0, s * 0.75, s, s * 0.25);

  // 연속 교실 창문 (4개 층)
  const floorH = s / 4;
  for (let f = 0; f < 4; f++) {
    const yTop = f * floorH + 20;
    const hWin = floorH - 40;

    for (let b = 0; b < 5; b++) {
      const xWin = 15 + b * 200;
      const wWin = 175;

      // 흰색 창틀
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xWin, yTop, wWin, hWin);

      // 교실 창유리
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(xWin + 3, yTop + 3, wWin - 6, hWin - 6);

      // 교실 창살
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xWin + wWin * 0.5, yTop + 3);
      ctx.lineTo(xWin + wWin * 0.5, yTop + hWin - 3);
      ctx.stroke();
    }
  }

  applySurfaceNoise(ctx, s);
}

/**
 * Material 12: 종합병원·동해안 호텔/리조트 — 화이트 모던 패널 + 청록 틴티드 발코니 창호
 */
function drawSlot12_HospitalResortModern(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, s, s);

  // 수직 청록 악센트 바
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(0, 0, 40, s);
  ctx.fillRect(s - 40, 0, 40, s);

  // 층간 발코니 창호
  const floorH = s / 4;
  for (let f = 0; f < 4; f++) {
    const yTop = f * floorH;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, yTop, s, 6);

    for (let b = 0; b < 4; b++) {
      const xWin = 60 + b * 225;
      const wWin = 200;
      const hWin = floorH - 32;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xWin, yTop + 16, wWin, hWin);

      // 청록 틴티드 유리
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(xWin + 4, yTop + 20, wWin - 8, hWin - 8);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.fillRect(xWin + 4, yTop + 20 + hWin * 0.45, wWin - 8, hWin * 0.55 - 8);
    }
  }

  applySurfaceNoise(ctx, s);
}

// ---------------------------------------------------------------------------
// [Material 13 ~ 15] 서울식 고밀도 적벽돌 빌라·단독주택·농어촌 주택·군 표준막사 3종
// ---------------------------------------------------------------------------

/**
 * Material 13: 짙은 적벽돌(#7c2d12) 고밀도 빌라/주택
 */
function drawSlot13_VillaDeepRedBrick(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(0, 0, s, s);

  // 촘촘한 적벽돌 줄눈
  ctx.strokeStyle = '#431407';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < s; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 촘촘한 하얀 창틀 격자
  const floorH = s / 4;
  for (let f = 0; f < 4; f++) {
    const yTop = f * floorH + 18;
    for (let b = 0; b < 4; b++) {
      const xWin = 25 + b * 245;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xWin, yTop, 195, floorH - 36);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(xWin + 3, yTop + 3, 189, floorH - 42);

      // 이중창 창살
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xWin + 97, yTop + 3);
      ctx.lineTo(xWin + 97, yTop + floorH - 39);
      ctx.stroke();
    }
  }

  // 1층 주차장 필로티 라인
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, s - 60, s, 60);

  applySurfaceNoise(ctx, s);
}

/**
 * Material 14: 황토벽돌(#9a3412) 단독주택 / 빌라
 */
function drawSlot14_VillaOcherBrick(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(0, 0, s, s);

  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < s; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  const floorH = s / 4;
  for (let f = 0; f < 4; f++) {
    const yTop = f * floorH + 18;
    for (let b = 0; b < 4; b++) {
      const xWin = 25 + b * 245;
      ctx.fillStyle = '#fef3c7'; // 따뜻한 크림 창틀
      ctx.fillRect(xWin, yTop, 195, floorH - 36);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(xWin + 3, yTop + 3, 189, floorH - 42);
    }
  }

  applySurfaceNoise(ctx, s);
}

/**
 * Material 15: 밝은 크림 스타코(#fef3c7) & 회색 시멘트 블록 농어촌 주택 / 군 표준막사
 */
function drawSlot15_RuralStuccoCement(ctx: CanvasRenderingContext2D, s: number): void {
  // 밝은 크림 스타코(#fef3c7)
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, s, s * 0.7);

  // 하단 회색 시멘트 블록(#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, s * 0.7, s, s * 0.3);

  // 군 표준막사/농가 단정한 창문
  const floorH = s / 3;
  for (let f = 0; f < 2; f++) {
    const yTop = f * floorH + 30;
    for (let b = 0; b < 4; b++) {
      const xWin = 30 + b * 240;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(xWin, yTop, 180, floorH - 60);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(xWin + 4, yTop + 4, 172, floorH - 68);
    }
  }

  applySurfaceNoise(ctx, s);
}

// ---------------------------------------------------------------------------
// 16종 독립 Material 싱글톤 캐시
// ---------------------------------------------------------------------------

let cachedGangwonSeoulMaterials: THREE.MeshLambertMaterial[] | null = null;

export const GANGWON_SEOUL_GRADE_DRAW_FNS = [
  // 0 ~ 4: 서울식 대단지 아파트 외벽 5종
  drawSlot0_AptPureWhiteTeal,
  drawSlot1_AptCreamSkyBlue,
  drawSlot2_AptSilverBlue,
  drawSlot3_AptModernGold,
  drawSlot4_AptSageGreen,
  // 5 ~ 9: 시·군 시내 중심 상가 & 근린생활 빌딩 5종
  drawSlot5_CommercialBeigeStone,
  drawSlot6_CommercialRedBrick,
  drawSlot7_CommercialCharcoalMetal,
  drawSlot8_CommercialBrownBrick,
  drawSlot9_CommercialMedicalWhite,
  // 10 ~ 12: 도청·시청·공공기관·학교·리조트 3종
  drawSlot10_CivicCurtainWall,
  drawSlot11_SchoolTerracotta,
  drawSlot12_HospitalResortModern,
  // 13 ~ 15: 고밀도 적벽돌 빌라·단독주택·농어촌 주택·군 표준막사 3종
  drawSlot13_VillaDeepRedBrick,
  drawSlot14_VillaOcherBrick,
  drawSlot15_RuralStuccoCement,
];

export function getGangwonSeoulGradeMaterials(): THREE.MeshLambertMaterial[] {
  if (cachedGangwonSeoulMaterials) return cachedGangwonSeoulMaterials;

  const materials: THREE.MeshLambertMaterial[] = [];
  const s = 1024;

  for (let i = 0; i < GANGWON_SEOUL_GRADE_DRAW_FNS.length; i++) {
    const canvas = createOffscreen1024Canvas();
    const ctx = typeof (canvas as any).getContext === 'function' ? canvas.getContext('2d') : null;
    if (ctx) {
      GANGWON_SEOUL_GRADE_DRAW_FNS[i](ctx, s);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
    mat.name = `gangwon_seoul_grade_mat_${i}`;
    materials.push(mat);
  }

  cachedGangwonSeoulMaterials = materials;
  return materials;
}

// ---------------------------------------------------------------------------
// 강원 18개 시·군 건물 스타일 정밀 분류기 (좌표 해시 seed 기반 16종 슬롯 매핑)
// ---------------------------------------------------------------------------

export interface GangwonBuildingStyleResult {
  category: 'apartment' | 'commercial' | 'public' | 'villa';
  facadeSlot: number; // 0..15
  sideWallSlot: number;
  podiumSlot: number;
  signboardSlot: number;
  roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc';
  roofColorRgb: [number, number, number];
  parapetColorRgb: [number, number, number];
  penthouseColorRgb: [number, number, number];
  parapetH: number;
  parapetThick: number;
}

export function classifyGangwonSeoulBuildingStyle(
  featProps: Record<string, any> = {},
  seed16: number,
  areaSqm: number,
  height: number,
  centerLngLat?: [number, number]
): GangwonBuildingStyleResult {
  const buldNm = String(featProps.buld_nm || featProps.name || '');
  const realUse = String(featProps.realUse || featProps.use || featProps.type || '');
  const absSeed = Math.abs(seed16);

  // 기본 색상 정의
  const parapetColorRgb: [number, number, number] = [0.886, 0.910, 0.941]; // #e2e8f0 밝은 콘크리트 난간
  const penthouseColorRgb: [number, number, number] = [0.580, 0.639, 0.722]; // #94a3b8 회색 옥탑
  const parapetH = 0.85; // 요구사항: 높이 0.85m
  const parapetThick = 0.35; // 요구사항: 두께 0.35m

  // 1. [소형 단독주택·다세대·원룸·농어촌 주택·군막사] area < 220㎡
  if (areaSqm < 220 || height <= 10.5) {
    const facadeSlot = 13 + (absSeed % 3); // Material 13, 14, 15
    const roll = (absSeed * 37 + 19) % 100;

    let roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc' = 'urethane';
    let roofColorRgb: [number, number, number] = [0.251, 0.569, 0.424]; // #40916c 우레탄 녹색

    if (roll < 35) {
      // 15% 비중: 3D 경사 박공 기와 지붕
      roofType = 'gabled';
      roofColorRgb = absSeed % 2 === 0 ? [0.486, 0.176, 0.071] : [0.604, 0.204, 0.071]; // #7c2d12 or #9a3412
    } else if (roll < 45) {
      // 5% 비중: 코발트 블루 강판 지붕
      roofType = 'zinc';
      roofColorRgb = [0.114, 0.306, 0.847]; // #1d4ed8
    } else if (roll < 85) {
      // 50% 비중: 초록 우레탄 옥상
      roofType = 'urethane';
      roofColorRgb = [0.176, 0.416, 0.310]; // #2d6a4f
    } else {
      // 30% 비중: 밝은 콘크리트 슬래브
      roofType = 'concrete';
      roofColorRgb = [0.796, 0.835, 0.882]; // #cbd5e1
    }

    return {
      category: 'villa',
      facadeSlot,
      sideWallSlot: facadeSlot,
      podiumSlot: facadeSlot,
      signboardSlot: facadeSlot,
      roofType,
      roofColorRgb,
      parapetColorRgb,
      penthouseColorRgb,
      parapetH,
      parapetThick,
    };
  }

  // 2. [도청·시청·군청·공공기관·학교·병원·리조트]
  const isSchool =
    buldNm.includes('학교') ||
    buldNm.includes('초등') ||
    buldNm.includes('중학') ||
    buldNm.includes('고등') ||
    realUse.includes('학교') ||
    realUse.includes('교육');

  const isHospitalOrResort =
    buldNm.includes('병원') ||
    buldNm.includes('의료원') ||
    buldNm.includes('호텔') ||
    buldNm.includes('리조트') ||
    realUse.includes('숙박') ||
    realUse.includes('의료');

  const isCivicGov =
    isSchool ||
    isHospitalOrResort ||
    realUse.includes('공공') ||
    realUse.includes('관공서') ||
    realUse.includes('업무') ||
    realUse.includes('청사') ||
    buldNm.includes('청사') ||
    buldNm.includes('도청') ||
    buldNm.includes('시청') ||
    buldNm.includes('군청') ||
    buldNm.includes('경찰') ||
    buldNm.includes('소방') ||
    (areaSqm >= 600 && height >= 22 && !buldNm.includes('아파트'));

  if (isCivicGov) {
    let facadeSlot = 10; // 공공기관/시·군청 커튼월
    if (isSchool) {
      facadeSlot = 11; // 초·중·고·대 교사동 테라코타
    } else if (isHospitalOrResort) {
      facadeSlot = 12; // 종합병원 / 호텔 / 리조트
    }

    const roll = (absSeed * 47 + 13) % 100;
    const roofType = roll < 70 ? 'concrete' : 'urethane';
    const roofColorRgb: [number, number, number] =
      roofType === 'concrete' ? [0.796, 0.835, 0.882] : [0.176, 0.416, 0.310];

    return {
      category: 'public',
      facadeSlot,
      sideWallSlot: facadeSlot,
      podiumSlot: facadeSlot,
      signboardSlot: facadeSlot,
      roofType,
      roofColorRgb,
      parapetColorRgb,
      penthouseColorRgb,
      parapetH,
      parapetThick,
    };
  }

  // 3. [서울식 대단지 아파트] (45m ~ 75m, 또는 아파트 명칭)
  const isApt =
    realUse.includes('아파트') ||
    buldNm.includes('아파트') ||
    buldNm.includes('자이') ||
    buldNm.includes('힐스테이트') ||
    buldNm.includes('푸르지오') ||
    buldNm.includes('아이파크') ||
    buldNm.includes('e편한') ||
    buldNm.includes('더샵') ||
    buldNm.includes('롯데캐슬') ||
    (areaSqm >= 320 && height >= 35);

  if (isApt) {
    const facadeSlot = absSeed % 5; // Material 0, 1, 2, 3, 4
    const roll = (absSeed * 41 + 17) % 100;

    let roofType: 'concrete' | 'urethane' | 'zinc' = 'concrete';
    let roofColorRgb: [number, number, number] = [0.796, 0.835, 0.882]; // #cbd5e1

    if (roll < 70) {
      roofType = 'concrete';
      roofColorRgb = [0.796, 0.835, 0.882];
    } else if (roll < 90) {
      roofType = 'urethane';
      roofColorRgb = [0.251, 0.569, 0.424];
    } else {
      roofType = 'zinc';
      roofColorRgb = [0.114, 0.306, 0.847];
    }

    return {
      category: 'apartment',
      facadeSlot,
      sideWallSlot: facadeSlot,
      podiumSlot: facadeSlot,
      signboardSlot: facadeSlot,
      roofType,
      roofColorRgb,
      parapetColorRgb,
      penthouseColorRgb,
      parapetH,
      parapetThick,
    };
  }

  // 4. [시·군 시내 중심 상가 & 근린생활 빌딩] (220㎡ <= area < 600㎡)
  const facadeSlot = 5 + (absSeed % 5); // Material 5, 6, 7, 8, 9
  const roll = (absSeed * 29 + 31) % 100;

  let roofType: 'urethane' | 'concrete' | 'zinc' = 'urethane';
  let roofColorRgb: [number, number, number] = [0.176, 0.416, 0.310]; // 50% 우레탄 녹색 #2d6a4f

  if (roll < 65) {
    roofType = 'urethane';
    roofColorRgb = [0.176, 0.416, 0.310];
  } else if (roll < 90) {
    roofType = 'concrete';
    roofColorRgb = [0.612, 0.639, 0.686];
  } else {
    roofType = 'zinc';
    roofColorRgb = [0.145, 0.388, 0.922];
  }

  return {
    category: 'commercial',
    facadeSlot,
    sideWallSlot: facadeSlot,
    podiumSlot: facadeSlot,
    signboardSlot: facadeSlot,
    roofType,
    roofColorRgb,
    parapetColorRgb,
    penthouseColorRgb,
    parapetH,
    parapetThick,
  };
}
