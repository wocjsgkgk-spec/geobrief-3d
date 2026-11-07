/**
 * lib/vendor/scenarioTexturePipeline.ts
 *
 * [GeoBrief 3D 2단계: scenario-labs/skills 절차적 생성 아키텍처 벤더링]
 *
 * 외부 유료 Scenario MCP 서버 의존성 없이, scenario-labs/skills의 3대 핵심 기법:
 * 1. scenario-consistency: Baseline + Delta 기반 16종 독립 PBR Material 싱글톤 엔진
 * 2. scenario-game-assets: 심리스 PBR 텍스처, 절차적 범프맵(bumpMap) & 거칠기 맵(roughnessMap) 생성
 * 3. scenario-video-color-grade: 서울 V-World 레퍼런스(image_1effcc.jpg, image_1efbec.jpg) 포토 매칭
 *
 * 를 Three.js MeshStandardMaterial 파이프라인으로 100% 자체 벤더링하여 제공합니다.
 */

import * as THREE from 'three';
import {
  getSeoulGradeRooftopMaterial,
  getSeoulGradeRooftopTexture,
  SEOUL_ROOFTOP_COLORS,
  assignSeoulRooftopStyle,
  SeoulRooftopAssignment,
} from './seoulGradeRooftopEngine';

export {
  getSeoulGradeRooftopMaterial,
  getSeoulGradeRooftopTexture,
  SEOUL_ROOFTOP_COLORS,
  assignSeoulRooftopStyle,
};
export type { SeoulRooftopAssignment };

// ---------------------------------------------------------------------------
// 1. 16종 독립 PBR Material 싱글톤 캐시 (Pre-baked Singleton Cache)
// ---------------------------------------------------------------------------

export let GLOBAL_SCENARIO_MATERIALS: THREE.MeshStandardMaterial[] | null = null;
let cachedRooftopPbrMaterial: THREE.MeshStandardMaterial | null = null;

function createOffscreen1024Canvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    return canvas;
  }
  return { width: 1024, height: 1024 } as any;
}

// 미세 표면 노이즈 (자연스러운 외벽 콘크리트/벽돌 질감)
function applySurfaceNoise(ctx: CanvasRenderingContext2D, s: number, opacity = 0.02): void {
  try {
    const imgData = ctx.getImageData(0, 0, s, s);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const n = (Math.random() - 0.5) * 32 * opacity;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {}
}

// ---------------------------------------------------------------------------
// 2. 16종 슬롯별 Albedo(Color), Bump(Height), Roughness 절차적 생성 함수
// ---------------------------------------------------------------------------

export interface PbrCanvasSet {
  color: HTMLCanvasElement;
  bump: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

/**
 * [아파트 Baseline 공통 드로잉]
 * 좌측 72% 본동 외벽 (4개 층 × 4개 발코니 베이), 우측 28% 측벽
 */
function drawApartmentPbr(
  ctxC: CanvasRenderingContext2D,
  ctxB: CanvasRenderingContext2D,
  ctxR: CanvasRenderingContext2D,
  s: number,
  options: {
    wallColor: string;
    sideGradStart: string;
    sideGradEnd: string;
    bldgNum: string;
    glassColorTop: string;
    glassColorBot: string;
    podiumColor: string;
  }
): void {
  // 1. Albedo 바탕
  ctxC.fillStyle = options.wallColor;
  ctxC.fillRect(0, 0, s, s);

  // Bump 바탕: 외벽 기준면 140/255
  ctxB.fillStyle = '#8c8c8c';
  ctxB.fillRect(0, 0, s, s);

  // Roughness 바탕: 콘크리트 외벽 0.85 (#d9d9d9)
  ctxR.fillStyle = '#d9d9d9';
  ctxR.fillRect(0, 0, s, s);

  // 2. 우측 28% 측벽 (Side Wall) 브랜드 도색
  const sideGradC = ctxC.createLinearGradient(s * 0.72, 0, s, s);
  sideGradC.addColorStop(0.0, options.sideGradStart);
  sideGradC.addColorStop(1.0, options.sideGradEnd);
  ctxC.fillStyle = sideGradC;
  ctxC.fillRect(s * 0.72, 0, s * 0.28, s);

  // 측벽 Bump: 살짝 돌출된 브랜드 도색 패널 (150/255)
  ctxB.fillStyle = '#969696';
  ctxB.fillRect(s * 0.72, 0, s * 0.28, s);

  // 측벽 Roughness: 매끈한 코팅 페인트 (0.65 = #a6a6a6)
  ctxR.fillStyle = '#a6a6a6';
  ctxR.fillRect(s * 0.72, 0, s * 0.28, s);

  // 측벽 동 번호
  ctxC.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctxC.font = 'bold 38px sans-serif';
  ctxC.textAlign = 'center';
  ctxC.fillText(options.bldgNum, s * 0.86, s * 0.24);

  // 3. 좌측 72% 본동 외벽: 4개 층 × 4개 발코니 베이
  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 4;
  const bayW = (s * 0.72) / numBays;

  for (let f = 0; f < numFloors; f++) {
    const yTop = f * floorH;

    // 층간 가로 슬래브 음영선
    ctxC.fillStyle = '#cbd5e1';
    ctxC.fillRect(0, yTop, s * 0.72, 6);
    ctxC.fillStyle = '#94a3b8';
    ctxC.fillRect(0, yTop + 6, s * 0.72, 2);

    // 슬래브 Bump: 돌출된 수평 턱 (180/255)
    ctxB.fillStyle = '#b4b4b4';
    ctxB.fillRect(0, yTop, s * 0.72, 7);

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 8;
      const wWin = bayW - 16;
      const hWin = floorH - 32;
      const yWin = yTop + 16;

      // 흰색 창틀 프레임
      ctxC.fillStyle = '#ffffff';
      ctxC.fillRect(xLeft, yWin, wWin, hWin);
      ctxC.fillStyle = '#e2e8f0';
      ctxC.fillRect(xLeft + 2, yWin + 2, wWin - 4, hWin - 4);

      // 창틀 Bump: 돌출 (220/255)
      ctxB.fillStyle = '#dcdcdc';
      ctxB.fillRect(xLeft, yWin, wWin, hWin);

      // 창틀 Roughness: 새시 반사광 0.35 (#595959)
      ctxR.fillStyle = '#595959';
      ctxR.fillRect(xLeft, yWin, wWin, hWin);

      // 발코니 통유리창
      const glassGradC = ctxC.createLinearGradient(xLeft, yWin, xLeft, yWin + hWin);
      glassGradC.addColorStop(0, options.glassColorTop);
      glassGradC.addColorStop(1, options.glassColorBot);
      ctxC.fillStyle = glassGradC;
      ctxC.fillRect(xLeft + 4, yWin + 4, wWin - 8, hWin - 8);

      // 유리창 Bump: 안으로 오목하게 들어감 (60/255)
      ctxB.fillStyle = '#3c3c3c';
      ctxB.fillRect(xLeft + 4, yWin + 4, wWin - 8, hWin - 8);

      // 유리창 Roughness: 매끈한 반사 유리 0.15 (#262626)
      ctxR.fillStyle = '#262626';
      ctxR.fillRect(xLeft + 4, yWin + 4, wWin - 8, hWin - 8);

      // 창문 십자 격자 (Cross Mullions)
      ctxC.fillStyle = '#ffffff';
      ctxC.fillRect(xLeft + wWin * 0.5 - 1.5, yWin + 4, 3, hWin - 8);
      ctxC.fillRect(xLeft + 4, yWin + hWin * 0.5 - 1.5, wWin - 8, 3);

      ctxB.fillStyle = '#d0d0d0';
      ctxB.fillRect(xLeft + wWin * 0.5 - 1.5, yWin + 4, 3, hWin - 8);
      ctxB.fillRect(xLeft + 4, yWin + hWin * 0.5 - 1.5, wWin - 8, 3);

      ctxR.fillStyle = '#595959';
      ctxR.fillRect(xLeft + wWin * 0.5 - 1.5, yWin + 4, 3, hWin - 8);
      ctxR.fillRect(xLeft + 4, yWin + hWin * 0.5 - 1.5, wWin - 8, 3);

      // 발코니 하단 안전 난간 살 (Balcony Railing)
      ctxC.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctxC.lineWidth = 1.5;
      const railTop = yWin + hWin * 0.55;
      ctxC.beginPath();
      ctxC.moveTo(xLeft + 4, railTop);
      ctxC.lineTo(xLeft + wWin - 4, railTop);
      ctxC.stroke();

      for (let r = xLeft + 12; r < xLeft + wWin - 8; r += 10) {
        ctxC.beginPath();
        ctxC.moveTo(r, railTop);
        ctxC.lineTo(r, yWin + hWin - 4);
        ctxC.stroke();
      }
    }
  }

  // 4. 하단 1층 화강석 기단부 (Podium)
  ctxC.fillStyle = options.podiumColor;
  ctxC.fillRect(0, s - 48, s * 0.72, 48);
  ctxC.fillStyle = '#64748b';
  ctxC.fillRect(0, s - 48, s * 0.72, 3);

  ctxB.fillStyle = '#aaaaaa';
  ctxB.fillRect(0, s - 48, s * 0.72, 48);
  ctxR.fillStyle = '#b0b0b0'; // 연마 화강석 0.70
  ctxR.fillRect(0, s - 48, s * 0.72, 48);

  applySurfaceNoise(ctxC, s);
}

/**
 * [상가·근린생활 빌딩 Baseline 공통 드로잉]
 * 1층 쇼윈도 + 1~3층 한국형 가로 간판 패치 + 2층 이상 상층 외벽
 */
function drawCommercialPbr(
  ctxC: CanvasRenderingContext2D,
  ctxB: CanvasRenderingContext2D,
  ctxR: CanvasRenderingContext2D,
  s: number,
  options: {
    upperWallColor: string;
    isBrick: boolean;
    brickMortarColor?: string;
    signTexts: string[];
    signColors: string[];
    windowFrameColor: string;
  }
): void {
  // 1. 2층 이상 상층 외벽 Albedo
  ctxC.fillStyle = options.upperWallColor;
  ctxC.fillRect(0, 0, s, s);

  // Bump 기준면: 140/255 (벽돌일 경우 줄눈 음영 적용)
  ctxB.fillStyle = '#8c8c8c';
  ctxB.fillRect(0, 0, s, s);

  // Roughness 기준면: 외벽 0.85 (#d9d9d9)
  ctxR.fillStyle = '#d9d9d9';
  ctxR.fillRect(0, 0, s, s);

  // 벽돌 패턴 (벽돌 옵션일 때 줄눈 음영)
  if (options.isBrick) {
    const brickH = 20;
    const brickW = 44;
    ctxC.strokeStyle = options.brickMortarColor || '#d6d3d1';
    ctxC.lineWidth = 1.5;
    ctxB.strokeStyle = '#505050'; // 줄눈 파임
    ctxB.lineWidth = 1.5;

    for (let y = 0; y < s - 180; y += brickH) {
      ctxC.beginPath();
      ctxC.moveTo(0, y);
      ctxC.lineTo(s, y);
      ctxC.stroke();

      ctxB.beginPath();
      ctxB.moveTo(0, y);
      ctxB.lineTo(s, y);
      ctxB.stroke();

      const offset = (Math.floor(y / brickH) % 2) * (brickW * 0.5);
      for (let x = offset; x < s; x += brickW) {
        ctxC.beginPath();
        ctxC.moveTo(x, y);
        ctxC.lineTo(x, y + brickH);
        ctxC.stroke();

        ctxB.beginPath();
        ctxB.moveTo(x, y);
        ctxB.lineTo(x, y + brickH);
        ctxB.stroke();
      }
    }
  }

  // 2. 상층 창문 배치 (3개 층 × 3개 창문 베이)
  const numUpperFloors = 3;
  const floorH = (s - 180) / numUpperFloors;
  const numBays = 3;
  const bayW = s / numBays;

  for (let f = 0; f < numUpperFloors; f++) {
    const yTop = f * floorH;

    for (let b = 0; b < numBays; b++) {
      const xLeft = b * bayW + 24;
      const wWin = bayW - 48;
      const hWin = floorH - 64;
      const yWin = yTop + 20;

      // 창틀
      ctxC.fillStyle = options.windowFrameColor;
      ctxC.fillRect(xLeft, yWin, wWin, hWin);
      ctxB.fillStyle = '#dcdcdc';
      ctxB.fillRect(xLeft, yWin, wWin, hWin);
      ctxR.fillStyle = '#595959';
      ctxR.fillRect(xLeft, yWin, wWin, hWin);

      // 상가 창문 유리 (반사 유리)
      ctxC.fillStyle = '#1e293b';
      ctxC.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);
      ctxB.fillStyle = '#3c3c3c';
      ctxB.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);
      ctxR.fillStyle = '#262626'; // 0.15 거칠기
      ctxR.fillRect(xLeft + 3, yWin + 3, wWin - 6, hWin - 6);

      // 창문 수직 멀리언
      ctxC.fillStyle = options.windowFrameColor;
      ctxC.fillRect(xLeft + wWin * 0.5 - 1.5, yWin + 3, 3, hWin - 6);
      ctxB.fillStyle = '#dcdcdc';
      ctxB.fillRect(xLeft + wWin * 0.5 - 1.5, yWin + 3, 3, hWin - 6);
      ctxR.fillStyle = '#595959';
      ctxR.fillRect(xLeft + wWin * 0.5 - 1.5, yWin + 3, 3, hWin - 6);

      // 한국형 가로 간판 블록 (1~3층 창문 하단)
      const signIdx = (f * numBays + b) % options.signTexts.length;
      const signColor = options.signColors[signIdx % options.signColors.length];
      const signText = options.signTexts[signIdx];
      const ySign = yWin + hWin + 4;
      const hSign = 32;

      ctxC.fillStyle = signColor;
      ctxC.fillRect(xLeft, ySign, wWin, hSign);
      ctxC.strokeStyle = '#ffffff';
      ctxC.lineWidth = 1.5;
      ctxC.strokeRect(xLeft + 1, ySign + 1, wWin - 2, hSign - 2);

      // 간판 텍스트
      ctxC.fillStyle = signColor === '#ffffff' || signColor === '#fef08a' ? '#0f172a' : '#ffffff';
      ctxC.font = 'bold 18px sans-serif';
      ctxC.textAlign = 'center';
      ctxC.fillText(signText, xLeft + wWin * 0.5, ySign + 22);

      // 간판 Bump: 외벽보다 크게 돌출 (225/255)
      ctxB.fillStyle = '#e1e1e1';
      ctxB.fillRect(xLeft, ySign, wWin, hSign);

      // 간판 Roughness: 아크릴 간판 매끄러움 0.40 (#666666)
      ctxR.fillStyle = '#666666';
      ctxR.fillRect(xLeft, ySign, wWin, hSign);
    }
  }

  // 3. 1층(0~3.8m = 하단 180px): 어두운 화강석 기둥 + 대형 쇼윈도 통유리
  const yGround = s - 180;
  ctxC.fillStyle = '#1e293b'; // 다크 화강석 기둥
  ctxC.fillRect(0, yGround, s, 180);

  ctxB.fillStyle = '#a0a0a0';
  ctxB.fillRect(0, yGround, s, 180);
  ctxR.fillStyle = '#808080';
  ctxR.fillRect(0, yGround, s, 180);

  const numShops = 2;
  const shopW = s / numShops;
  for (let k = 0; k < numShops; k++) {
    const sx = k * shopW + 28;
    const sw = shopW - 56;
    const sy = yGround + 24;
    const sh = 180 - 40;

    // 쇼윈도 외곽 프레임
    ctxC.fillStyle = '#cbd5e1';
    ctxC.fillRect(sx, sy, sw, sh);
    ctxB.fillStyle = '#dcdcdc';
    ctxB.fillRect(sx, sy, sw, sh);
    ctxR.fillStyle = '#595959';
    ctxR.fillRect(sx, sy, sw, sh);

    // 밝은 쇼윈도 통유리 (실내 조명 빛 반사)
    const shopGradC = ctxC.createLinearGradient(sx, sy, sx, sy + sh);
    shopGradC.addColorStop(0, '#f0f9ff');
    shopGradC.addColorStop(0.5, '#e0f2fe');
    shopGradC.addColorStop(1, '#bae6fd');
    ctxC.fillStyle = shopGradC;
    ctxC.fillRect(sx + 4, sy + 4, sw - 8, sh - 8);

    ctxB.fillStyle = '#282828'; // 유리 깊숙이 들어감
    ctxB.fillRect(sx + 4, sy + 4, sw - 8, sh - 8);
    ctxR.fillStyle = '#262626'; // 0.15 극저 거칠기 (반짝이는 쇼윈도)
    ctxR.fillRect(sx + 4, sy + 4, sw - 8, sh - 8);

    // 쇼윈도 출입문 손잡이 디테일
    ctxC.fillStyle = '#64748b';
    ctxC.fillRect(sx + sw * 0.5 - 2, sy + sh * 0.45, 4, 32);
  }

  applySurfaceNoise(ctxC, s);
}

/**
 * 16종 독립 슬롯별 생성 팩토리
 */
export function buildPbrSlot(slotIdx: number, s = 1024): PbrCanvasSet {
  const cCanvas = createOffscreen1024Canvas();
  const bCanvas = createOffscreen1024Canvas();
  const rCanvas = createOffscreen1024Canvas();

  const ctxC = typeof cCanvas.getContext === 'function' ? cCanvas.getContext('2d') : null;
  const ctxB = typeof bCanvas.getContext === 'function' ? bCanvas.getContext('2d') : null;
  const ctxR = typeof rCanvas.getContext === 'function' ? rCanvas.getContext('2d') : null;

  if (!ctxC || !ctxB || !ctxR) {
    return { color: cCanvas, bump: bCanvas, roughness: rCanvas };
  }

  switch (slotIdx) {
    // -------------------------------------------------------------------------
    // Mat 0 ~ 4: 아파트 단지 5종
    // -------------------------------------------------------------------------
    case 0:
      // Mat 0: 순백색(#f8fafc) + 청록 그라데이션 측벽(#0284c7 -> #10b981) + 다크민트 유리
      drawApartmentPbr(ctxC, ctxB, ctxR, s, {
        wallColor: '#f8fafc',
        sideGradStart: '#0284c7',
        sideGradEnd: '#10b981',
        bldgNum: '101',
        glassColorTop: '#0f172a',
        glassColorBot: '#134e4a',
        podiumColor: '#e2e8f0',
      });
      break;

    case 1:
      // Mat 1: 크림 아이보리(#f4f1ea) + 스카이블루 브랜드 라인(#0284c7)
      drawApartmentPbr(ctxC, ctxB, ctxR, s, {
        wallColor: '#f4f1ea',
        sideGradStart: '#0369a1',
        sideGradEnd: '#38bdf8',
        bldgNum: '102',
        glassColorTop: '#1e293b',
        glassColorBot: '#0f172a',
        podiumColor: '#d6cfc2',
      });
      break;

    case 2:
      // Mat 2: 실버 그레이(#e2e8f0) + 로얄 블루 수직 라인(#1d4ed8)
      drawApartmentPbr(ctxC, ctxB, ctxR, s, {
        wallColor: '#e2e8f0',
        sideGradStart: '#1e40af',
        sideGradEnd: '#3b82f6',
        bldgNum: '203',
        glassColorTop: '#090d16',
        glassColorBot: '#1e293b',
        podiumColor: '#94a3b8',
      });
      break;

    case 3:
      // Mat 3: 모던 골드/브라운(#f5f5f4) + 테라코타 브랜드 스트라이프(#9a3412 -> #d97706)
      drawApartmentPbr(ctxC, ctxB, ctxR, s, {
        wallColor: '#f5f5f4',
        sideGradStart: '#9a3412',
        sideGradEnd: '#d97706',
        bldgNum: '304',
        glassColorTop: '#292524',
        glassColorBot: '#1c1917',
        podiumColor: '#a8a29e',
      });
      break;

    case 4:
      // Mat 4: 세이지 그린(#f0fdf4) + 포레스트 그린 수직 도색(#15803d -> #84cc16)
      drawApartmentPbr(ctxC, ctxB, ctxR, s, {
        wallColor: '#f0fdf4',
        sideGradStart: '#14532d',
        sideGradEnd: '#65a30d',
        bldgNum: '505',
        glassColorTop: '#064e3b',
        glassColorBot: '#022c22',
        podiumColor: '#dcfce7',
      });
      break;

    // -------------------------------------------------------------------------
    // Mat 5 ~ 9: 시·군 중심가 상가·근린생활 빌딩 5종
    // -------------------------------------------------------------------------
    case 5:
      // Mat 5: 사비석 베이지 화강석 타일(#d6cfc2) + 쇼윈도 + 다채로운 간판
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#d6cfc2',
        isBrick: false,
        signTexts: ['약국', '이비인후과', '스타벅스', '베이커리', '헤어샵', '편의점'],
        signColors: ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#ffffff', '#0284c7'],
        windowFrameColor: '#ffffff',
      });
      break;

    case 6:
      // Mat 6: 붉은 적벽돌(#7f1d1d) + 쇼윈도 + 간판
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#7f1d1d',
        isBrick: true,
        brickMortarColor: '#f5f5f4',
        signTexts: ['카페', '한의원', '치킨앤호프', '안경점', '수학학원', '세탁소'],
        signColors: ['#ffffff', '#2563eb', '#dc2626', '#eab308', '#16a34a', '#475569'],
        windowFrameColor: '#ffffff',
      });
      break;

    case 7:
      // Mat 7: 다크 차콜 메탈 복합패널(#334155) 모던 빌딩
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#334155',
        isBrick: false,
        signTexts: ['피트니스', '법률사무소', '어학원', '디자인랩', '스튜디오', '클리닉'],
        signColors: ['#38bdf8', '#f8fafc', '#facc15', '#4ade80', '#fb7185', '#a855f7'],
        windowFrameColor: '#94a3b8',
      });
      break;

    case 8:
      // Mat 8: 갈색 파벽돌(#6e473b) 빈티지 상가
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#6e473b',
        isBrick: true,
        brickMortarColor: '#e7e5e4',
        signTexts: ['레스토랑', '플라워', '베이커리', '북카페', '바버샵', '공방'],
        signColors: ['#eab308', '#ffffff', '#16a34a', '#dc2626', '#0284c7', '#d97706'],
        windowFrameColor: '#ffffff',
      });
      break;

    case 9:
      // Mat 9: 화이트 메디컬/오피스 타일(#f1f5f9)
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#f1f5f9',
        isBrick: false,
        signTexts: ['정형외과', '치과의원', '소아청소년과', '안과의원', '피부과', '약국'],
        signColors: ['#0284c7', '#10b981', '#2563eb', '#06b6d4', '#ec4899', '#dc2626'],
        windowFrameColor: '#ffffff',
      });
      break;

    // -------------------------------------------------------------------------
    // Mat 10 ~ 12: 관공서, 학교, 병원 3종
    // -------------------------------------------------------------------------
    case 10: {
      // Mat 10: 도청·시청·공공청사 커튼월 유리 & 화강석 포디움
      ctxC.fillStyle = '#cbd5e1';
      ctxC.fillRect(0, 0, s, s);
      ctxB.fillStyle = '#8c8c8c';
      ctxB.fillRect(0, 0, s, s);
      ctxR.fillStyle = '#d9d9d9';
      ctxR.fillRect(0, 0, s, s);

      // 상층 에메랄드/스카이블루 반사유리 커튼월
      const curH = s - 180;
      const glassGradC = ctxC.createLinearGradient(0, 0, 0, curH);
      glassGradC.addColorStop(0, '#0f766e');
      glassGradC.addColorStop(0.5, '#0284c7');
      glassGradC.addColorStop(1, '#0e7490');
      ctxC.fillStyle = glassGradC;
      ctxC.fillRect(16, 16, s - 32, curH - 16);

      ctxB.fillStyle = '#323232';
      ctxB.fillRect(16, 16, s - 32, curH - 16);
      ctxR.fillStyle = '#262626'; // 0.15 반사 유리
      ctxR.fillRect(16, 16, s - 32, curH - 16);

      // 은백색 알루미늄 멀리언 그리드 (Vertical & Horizontal Mullions)
      const numCurCols = 8;
      const colW = (s - 32) / numCurCols;
      const numCurRows = 6;
      const rowH = (curH - 16) / numCurRows;

      ctxC.fillStyle = '#ffffff';
      ctxB.fillStyle = '#dcdcdc';
      ctxR.fillStyle = '#595959';

      for (let c = 0; c <= numCurCols; c++) {
        const x = 16 + c * colW;
        ctxC.fillRect(x - 2, 16, 4, curH - 16);
        ctxB.fillRect(x - 2, 16, 4, curH - 16);
        ctxR.fillRect(x - 2, 16, 4, curH - 16);
      }
      for (let r = 0; r <= numCurRows; r++) {
        const y = 16 + r * rowH;
        ctxC.fillRect(16, y - 2, s - 32, 4);
        ctxB.fillRect(16, y - 2, s - 32, 4);
        ctxR.fillRect(16, y - 2, s - 32, 4);
      }

      // 하단 1~2층 포디움
      ctxC.fillStyle = '#64748b';
      ctxC.fillRect(0, s - 180, s, 180);
      ctxB.fillStyle = '#a0a0a0';
      ctxB.fillRect(0, s - 180, s, 180);
      ctxR.fillStyle = '#a0a0a0';
      ctxR.fillRect(0, s - 180, s, 180);
      applySurfaceNoise(ctxC, s);
      break;
    }

    case 11: {
      // Mat 11: 학교 교사동 (오렌지 테라코타 #d97742 + 적벽돌 투톤 + 연속 교실 창호)
      ctxC.fillStyle = '#d97742';
      ctxC.fillRect(0, 0, s, s);
      ctxB.fillStyle = '#8c8c8c';
      ctxB.fillRect(0, 0, s, s);
      ctxR.fillStyle = '#d9d9d9';
      ctxR.fillRect(0, 0, s, s);

      // 하단 적벽돌 띠
      ctxC.fillStyle = '#9a3412';
      ctxC.fillRect(0, s - 160, s, 160);
      ctxB.fillStyle = '#787878';
      ctxB.fillRect(0, s - 160, s, 160);

      // 4개 층 연속 교실 창호
      const floorH = (s - 80) / 4;
      for (let f = 0; f < 4; f++) {
        const yTop = f * floorH + 30;
        const hWin = floorH - 60;

        ctxC.fillStyle = '#ffffff';
        ctxC.fillRect(20, yTop, s - 40, hWin);
        ctxB.fillStyle = '#dcdcdc';
        ctxB.fillRect(20, yTop, s - 40, hWin);
        ctxR.fillStyle = '#595959';
        ctxR.fillRect(20, yTop, s - 40, hWin);

        ctxC.fillStyle = '#1e293b';
        ctxC.fillRect(24, yTop + 3, s - 48, hWin - 6);
        ctxB.fillStyle = '#3c3c3c';
        ctxB.fillRect(24, yTop + 3, s - 48, hWin - 6);
        ctxR.fillStyle = '#262626';
        ctxR.fillRect(24, yTop + 3, s - 48, hWin - 6);

        // 연속 창호 수직 프레임
        const numPains = 12;
        const pW = (s - 48) / numPains;
        ctxC.fillStyle = '#ffffff';
        ctxB.fillStyle = '#dcdcdc';
        ctxR.fillStyle = '#595959';
        for (let p = 1; p < numPains; p++) {
          ctxC.fillRect(24 + p * pW - 1.5, yTop + 3, 3, hWin - 6);
          ctxB.fillRect(24 + p * pW - 1.5, yTop + 3, 3, hWin - 6);
          ctxR.fillRect(24 + p * pW - 1.5, yTop + 3, 3, hWin - 6);
        }
      }
      applySurfaceNoise(ctxC, s);
      break;
    }

    case 12: {
      // Mat 12: 종합병원 / 테크 센터 (클린 화이트 #f8fafc + 라이트 블루 창호 #0284c7)
      ctxC.fillStyle = '#f8fafc';
      ctxC.fillRect(0, 0, s, s);
      ctxB.fillStyle = '#8c8c8c';
      ctxB.fillRect(0, 0, s, s);
      ctxR.fillStyle = '#d9d9d9';
      ctxR.fillRect(0, 0, s, s);

      // 중앙 십자 메디컬 심볼 포인트 라인
      ctxC.fillStyle = '#0284c7';
      ctxC.fillRect(0, s * 0.45, s, 16);

      const floorH = s / 4;
      for (let f = 0; f < 4; f++) {
        const yTop = f * floorH + 20;
        const hWin = floorH - 45;

        for (let b = 0; b < 4; b++) {
          const bx = b * (s / 4) + 16;
          const bw = s / 4 - 32;

          ctxC.fillStyle = '#e2e8f0';
          ctxC.fillRect(bx, yTop, bw, hWin);
          ctxB.fillStyle = '#dcdcdc';
          ctxB.fillRect(bx, yTop, bw, hWin);
          ctxR.fillStyle = '#595959';
          ctxR.fillRect(bx, yTop, bw, hWin);

          ctxC.fillStyle = '#0f172a';
          ctxC.fillRect(bx + 3, yTop + 3, bw - 6, hWin - 6);
          ctxB.fillStyle = '#3c3c3c';
          ctxB.fillRect(bx + 3, yTop + 3, bw - 6, hWin - 6);
          ctxR.fillStyle = '#262626';
          ctxR.fillRect(bx + 3, yTop + 3, bw - 6, hWin - 6);
        }
      }
      applySurfaceNoise(ctxC, s);
      break;
    }

    // -------------------------------------------------------------------------
    // Mat 13 ~ 15: 적벽돌 빌라, 단독주택, 군 표준막사 3종
    // -------------------------------------------------------------------------
    case 13:
      // Mat 13: 고밀도 적벽돌 빌라(#7c2d12)
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#7c2d12',
        isBrick: true,
        brickMortarColor: '#e2e8f0',
        signTexts: ['빌라 101동', '주차금지', '빌라 201동', '택배보관함', '경비실', '클린하우스'],
        signColors: ['#334155', '#dc2626', '#334155', '#2563eb', '#475569', '#16a34a'],
        windowFrameColor: '#ffffff',
      });
      break;

    case 14:
      // Mat 14: 황토벽돌 단독주택(#9a3412)
      drawCommercialPbr(ctxC, ctxB, ctxR, s, {
        upperWallColor: '#9a3412',
        isBrick: true,
        brickMortarColor: '#f5f5f4',
        signTexts: ['전원마을', '단독주택', '공동생활관', '관리사무소', '산림조합', '마을회관'],
        signColors: ['#16a34a', '#78350f', '#0284c7', '#475569', '#15803d', '#b45309'],
        windowFrameColor: '#ffffff',
      });
      break;

    case 15:
    default: {
      // Mat 15: 아이보리 스타코 외벽 & 군 표준막사 / 농어촌 주택(#f1f5f9)
      ctxC.fillStyle = '#f1f5f9';
      ctxC.fillRect(0, 0, s, s);
      ctxB.fillStyle = '#8c8c8c';
      ctxB.fillRect(0, 0, s, s);
      ctxR.fillStyle = '#d9d9d9';
      ctxR.fillRect(0, 0, s, s);

      // 하단 올리브/차콜 콘크리트 기단부
      ctxC.fillStyle = '#334155';
      ctxC.fillRect(0, s - 80, s, 80);
      ctxB.fillStyle = '#a0a0a0';
      ctxB.fillRect(0, s - 80, s, 80);

      const floorH = (s - 80) / 2;
      for (let f = 0; f < 2; f++) {
        const yTop = f * floorH + 30;
        const hWin = floorH - 60;

        for (let b = 0; b < 3; b++) {
          const bx = b * (s / 3) + 30;
          const bw = s / 3 - 60;

          ctxC.fillStyle = '#ffffff';
          ctxC.fillRect(bx, yTop, bw, hWin);
          ctxB.fillStyle = '#dcdcdc';
          ctxB.fillRect(bx, yTop, bw, hWin);
          ctxR.fillStyle = '#595959';
          ctxR.fillRect(bx, yTop, bw, hWin);

          ctxC.fillStyle = '#1e293b';
          ctxC.fillRect(bx + 4, yTop + 4, bw - 8, hWin - 8);
          ctxB.fillStyle = '#3c3c3c';
          ctxB.fillRect(bx + 4, yTop + 4, bw - 8, hWin - 8);
          ctxR.fillStyle = '#262626';
          ctxR.fillRect(bx + 4, yTop + 4, bw - 8, hWin - 8);
        }
      }
      applySurfaceNoise(ctxC, s);
      break;
    }
  }

  return { color: cCanvas, bump: bCanvas, roughness: rCanvas };
}

// ---------------------------------------------------------------------------
// 3. Three.js PBR Material 싱글톤 생성자
// ---------------------------------------------------------------------------

export function getScenarioBuildingMaterials(): THREE.MeshStandardMaterial[] {
  if (GLOBAL_SCENARIO_MATERIALS && GLOBAL_SCENARIO_MATERIALS.length === 16) {
    return GLOBAL_SCENARIO_MATERIALS;
  }

  const materials: THREE.MeshStandardMaterial[] = [];
  const s = 1024;

  for (let i = 0; i < 16; i++) {
    const { color, bump, roughness } = buildPbrSlot(i, s);

    // Color Texture (Albedo)
    const colorTex = new THREE.CanvasTexture(color);
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.generateMipmaps = true;
    colorTex.minFilter = THREE.LinearMipmapLinearFilter;
    colorTex.magFilter = THREE.LinearFilter;
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.needsUpdate = true;

    // Bump Texture
    const bumpTex = new THREE.CanvasTexture(bump);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.generateMipmaps = true;
    bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
    bumpTex.magFilter = THREE.LinearFilter;
    bumpTex.needsUpdate = true;

    // Roughness Texture
    const roughnessTex = new THREE.CanvasTexture(roughness);
    roughnessTex.wrapS = THREE.RepeatWrapping;
    roughnessTex.wrapT = THREE.RepeatWrapping;
    roughnessTex.generateMipmaps = true;
    roughnessTex.minFilter = THREE.LinearMipmapLinearFilter;
    roughnessTex.magFilter = THREE.LinearFilter;
    roughnessTex.needsUpdate = true;

    // High-fidelity PBR Material
    const mat = new THREE.MeshStandardMaterial({
      map: colorTex,
      bumpMap: bumpTex,
      bumpScale: 0.04, // 요구사항: bumpScale: 0.04
      roughnessMap: roughnessTex,
      roughness: 0.75, // 기본 거칠기 (roughnessMap에 의해 유리 0.15, 벽면 0.85로 제어)
      metalness: 0.15, // 반사성 멀리언/새시 지원
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
    mat.name = `scenario_pbr_mat_${i}`;

    materials.push(mat);
  }

  GLOBAL_SCENARIO_MATERIALS = materials;
  return GLOBAL_SCENARIO_MATERIALS;
}

export function getScenarioRooftopPbrMaterial(): THREE.MeshStandardMaterial {
  if (cachedRooftopPbrMaterial) return cachedRooftopPbrMaterial;
  cachedRooftopPbrMaterial = getSeoulGradeRooftopMaterial();
  return cachedRooftopPbrMaterial;
}
