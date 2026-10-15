/**
 * koreanCityAtlas.ts
 *
 * [2단계: 한국형 실사 건축물 텍스처 아틀라스 렌더링 엔진]
 * - 2048x2048 크기의 단일 고해상도 Canvas 텍스처 아틀라스 생성기
 * - [외벽 텍스처 6종]:
 *   1) apartment_front: 한국형 판상형 아파트 전면 (아이보리 콘크리트 #f5f5f0 + 베란다 이중창 섀시 + 실외기 루버)
 *   2) apartment_side: 한국형 아파트 측벽 (동 번호 마킹 + 네이비/브라운 브랜드 포인트 도색 밴드)
 *   3) commercial_mid: 중층 상가/오피스 (화강석 석재 타일 + 가로형 연속 유리창 + 1층 상가 간판 컬러 띠)
 *   4) curtainwall_high: 고층 유리 커튼월 타워 (블루/그린 반사 글래스 그리드 #0369a1 ~ #0f172a)
 *   5) villa_residential: 다세대 빌라/단독주택 (적벽돌 #7c2d12 + 밝은 화강석 빌라 외벽 + 직사각형 창호)
 *   6) public_facility: 공공청사/산업시설 (정돈된 베이지/실버 메탈 패널 + 수직 루버 핀)
 * - [지붕/옥상 텍스처 4종]:
 *   1) roof_green_urethane: 한국 특유의 초록색 우레탄 방수 옥상 (#15803d ~ #166534 + 회색 난간 연석 라인)
 *   2) roof_blue_zinc: 청색 징크/강판 지붕 (#1d4ed8 돌출 이음 리브)
 *   3) roof_brown_shingle: 적갈색/브라운 아스팔트 슁글 지붕 (#78350f 비늘형 슁글 질감)
 *   4) roof_concrete_cool: 고층 빌딩 콘크리트 설비 옥상 (#475569 회색 슬래브 + 냉각탑/공조 설비)
 * - [보조 설비 텍스처]:
 *   5) penthouse_wall: 옥탑 권상기실 / 기계실 외벽
 *   6) parapet_concrete: 옥상 난간(Parapet) 콘크리트 및 코핑 마감
 * - 단일 아틀라스 기반 지능형 UV 매핑을 통해 GPU Draw Call을 극소화하면서 실사 도시 뷰 완성
 */

import * as THREE from 'three';

export type AtlasSlot =
  | 'apartment_front'
  | 'apartment_side'
  | 'commercial_mid'
  | 'curtainwall_high'
  | 'villa_residential'
  | 'public_facility'
  | 'roof_green_urethane'
  | 'roof_blue_zinc'
  | 'roof_brown_shingle'
  | 'roof_concrete_cool'
  | 'penthouse_wall'
  | 'parapet_concrete';

export interface SlotCoords {
  col: number; // 0..3
  row: number; // 0..3
}

export const ATLAS_GRID_SIZE = 2048;
export const ATLAS_CELL_SIZE = 512;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

export const ATLAS_SLOT_COORDS: Record<AtlasSlot, SlotCoords> = {
  apartment_front: { col: 0, row: 0 },
  apartment_side: { col: 1, row: 0 },
  commercial_mid: { col: 2, row: 0 },
  curtainwall_high: { col: 3, row: 0 },

  villa_residential: { col: 0, row: 1 },
  public_facility: { col: 1, row: 1 },
  roof_green_urethane: { col: 2, row: 1 },
  roof_blue_zinc: { col: 3, row: 1 },

  roof_brown_shingle: { col: 0, row: 2 },
  roof_concrete_cool: { col: 1, row: 2 },
  penthouse_wall: { col: 2, row: 2 },
  parapet_concrete: { col: 3, row: 2 },
};

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * 4x4 아틀라스 슬롯의 정규화된 UV 좌표 [u0, v0, u1, v1]를 반환합니다.
 * Three.js CanvasTexture (flipY = true 기본값) 기준:
 * - Canvas의 Y=0(상단)이 WebGL의 V=1.0에 대응
 */
export function getAtlasSlotUV(slot: AtlasSlot): UVRect {
  const coords = ATLAS_SLOT_COORDS[slot] || ATLAS_SLOT_COORDS.apartment_front;
  const u0 = coords.col * 0.25;
  const u1 = (coords.col + 1) * 0.25;
  // flipY = true 일 때 row 0(상단)은 v 0.75 ~ 1.00
  const v1 = 1.0 - coords.row * 0.25;
  const v0 = 1.0 - (coords.row + 1) * 0.25;
  return { u0, v0, u1, v1 };
}

// =============================================================================
// 1. 고해상도 2048x2048 Canvas 아틀라스 렌더러
// =============================================================================

function drawApartmentFront(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 외벽 베이스: 밝은 아이보리/크림색 콘크리트 외벽 (#f5f5f0)
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(x, y, s, s);

  // 미세 콘크리트 결
  ctx.fillStyle = 'rgba(218, 222, 229, 0.45)';
  for (let i = 0; i < s; i += 6) {
    ctx.fillRect(x, y + i, s, 1.5);
  }

  // 2) 층간 콘크리트 슬래브 가로 밴드 (2개 층 표현)
  const halfH = s * 0.5;
  const slabH = 14;

  const drawSlab = (sy: number) => {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x, sy, s, slabH);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x, sy + slabH - 3, s, 3);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x, sy + slabH, s, 2);
  };

  drawSlab(y);
  drawSlab(y + halfH - slabH * 0.5);
  drawSlab(y + s - slabH);

  // 3) 세대 간 수직 콘크리트 날개벽 (Pillars)
  const pillarW = Math.round(s * 0.08);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, pillarW, s);
  ctx.fillRect(x + s - pillarW, y, pillarW, s);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + pillarW - 2, y, 2, s);
  ctx.fillRect(x + s - pillarW, y, 2, s);

  // 4) 층별 대형 베란다 이중창 및 안전 난간, 실외기 루버
  const winW = s - (pillarW + 12) * 2;
  const winX = x + pillarW + 12;

  for (let f = 0; f < 2; f++) {
    const floorY = y + f * halfH + slabH + 4;
    const availH = halfH - slabH - 8;
    const windowH = Math.round(availH * 0.58);
    const balconyH = availH - windowH - 4;

    // (a) 다크 그레이 창문 섀시 프레임 (#1e293b)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(winX - 3, floorY - 3, winW + 6, windowH + 6);

    // (b) 하늘 반사 유리 그라데이션 (#38bdf8 ~ #1e293b)
    const glassGrad = ctx.createLinearGradient(winX, floorY, winX, floorY + windowH);
    glassGrad.addColorStop(0, '#7dd3fc');
    glassGrad.addColorStop(0.3, '#38bdf8');
    glassGrad.addColorStop(0.7, '#0284c7');
    glassGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(winX, floorY, winW, windowH);

    // 창호 중앙 세로/가로 화이트 분할 섀시
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(winX + winW * 0.5 - 2, floorY, 4, windowH);
    ctx.fillRect(winX + winW * 0.25 - 1.5, floorY, 3, windowH);
    ctx.fillRect(winX + winW * 0.75 - 1.5, floorY, 3, windowH);
    ctx.fillRect(winX, floorY + windowH * 0.45 - 1.5, winW, 3);

    // (c) 베란다 하단 안전 난간 (철제 세로살 격자)
    const balcY = floorY + windowH + 4;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(winX, balcY, winW, balconyH);

    // 난간 상단 핸드레일
    ctx.fillStyle = '#64748b';
    ctx.fillRect(winX, balcY, winW, 3);

    // 세로 난간 살 (Balusters)
    ctx.fillStyle = '#94a3b8';
    for (let bx = winX + 6; bx < winX + winW - 6; bx += 10) {
      ctx.fillRect(bx, balcY + 3, 2, balconyH - 3);
    }

    // (d) 세대별 에어컨 실외기 루버 (오른쪽 25% 폭)
    const acW = Math.round(winW * 0.28);
    const acX = winX + winW - acW - 4;
    const acY = balcY + 2;
    const acH = balconyH - 4;

    ctx.fillStyle = '#475569';
    ctx.fillRect(acX, acY, acW, acH);
    ctx.fillStyle = '#94a3b8';
    for (let ly = acY + 2; ly < acY + acH - 2; ly += 4) {
      ctx.fillRect(acX + 2, ly, acW - 4, 1.5);
    }
  }
}

function drawApartmentSide(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 외벽 베이스: 밝은 회백색/아이보리 콘크리트 외벽
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, s, s);

  // 콘크리트 수직 패널 줄눈
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + s * 0.33, y, 2, s);
  ctx.fillRect(x + s * 0.66, y, 2, s);

  // 2) 한국 대단지 아파트 특유의 브랜드 포인트 도색 밴드 (네이비/브라운 세로 줄무늬)
  const stripeW = s * 0.26;
  const stripeX = x + s * 0.12;

  // 네이비 블루 메인 밴드 (#1e3a8a)
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(stripeX, y, stripeW, s);

  // 웜 브라운 보조 밴드 (#78350f)
  ctx.fillStyle = '#78350f';
  ctx.fillRect(stripeX + stripeW, y, 24, s);

  // 다크 슬레이트 얇은 라인 (#334155)
  ctx.fillStyle = '#334155';
  ctx.fillRect(stripeX - 8, y, 8, s);

  // 3) 아파트 동 번호 스텐실 타이포그래피 마킹 ("101" / "102")
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.font = `900 ${Math.round(s * 0.18)}px "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('101', stripeX + stripeW * 0.5, y + s * 0.38);

  // 영문 서브 라벨 ("GEOBRIEF TOWER")
  ctx.font = `bold ${Math.round(s * 0.038)}px "Arial", sans-serif`;
  ctx.letterSpacing = '3px';
  ctx.fillText('GEOBRIEF', stripeX + stripeW * 0.5, y + s * 0.52);
  ctx.restore();

  // 상단 환기 그릴
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + s * 0.72, y + 40, 60, 40);
  ctx.fillStyle = '#94a3b8';
  for (let gy = y + 45; gy < y + 75; gy += 6) {
    ctx.fillRect(x + s * 0.72 + 4, gy, 52, 2);
  }
}

function drawCommercialMid(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 화강석/대리석 석재 타일 베이스
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, s, s);

  // 석재 타일 조적 줄눈 (#94a3b8)
  ctx.fillStyle = '#cbd5e1';
  for (let px = x; px < x + s; px += 64) {
    ctx.fillRect(px, y, 1.5, s);
  }
  for (let py = y; py < y + s; py += 48) {
    ctx.fillRect(x, py, s, 1.5);
  }

  // 2) 가로형 연속 유리창 밴드 (Ribbon Windows, 상단 2개 층)
  const floorH = s * 0.32;
  for (let f = 0; f < 2; f++) {
    const fy = y + f * floorH + 16;
    const winH = floorH - 32;

    // 프레임 (#1e293b)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 10, fy - 2, s - 20, winH + 4);

    // 유리창 반사 그라데이션
    const winGrad = ctx.createLinearGradient(x, fy, x, fy + winH);
    winGrad.addColorStop(0, '#93c5fd');
    winGrad.addColorStop(0.5, '#3b82f6');
    winGrad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = winGrad;
    ctx.fillRect(x + 12, fy, s - 24, winH);

    // 알루미늄 멀리언 수직 바
    ctx.fillStyle = '#cbd5e1';
    for (let mx = x + 40; mx < x + s - 30; mx += 48) {
      ctx.fillRect(mx, fy, 2, winH);
    }
  }

  // 3) 1층 상가 간판 컬러 띠장 및 쇼윈도 통유리 (하단 35%)
  const gY = y + s * 0.65;
  const gH = s * 0.35;

  // 1층 캐노피
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, gY, s, 8);

  // 상가 간판 컬러 띠 (다채로운 상권 표현: 오렌지, 블루, 에메랄드)
  const signH = 34;
  const sW1 = s * 0.36;
  const sW2 = s * 0.32;
  const sW3 = s - sW1 - sW2;

  ctx.fillStyle = '#059669'; // 약국/베이커리 녹색
  ctx.fillRect(x, gY + 8, sW1, signH);
  ctx.fillStyle = '#ea580c'; // 식당/카페 주황색
  ctx.fillRect(x + sW1, gY + 8, sW2, signH);
  ctx.fillStyle = '#2563eb'; // 편의점/은행 파란색
  ctx.fillRect(x + sW1 + sW2, gY + 8, sW3, signH);

  // 간판 텍스트 실루엣
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 16, gY + 20, sW1 - 32, 8);
  ctx.fillRect(x + sW1 + 16, gY + 20, sW2 - 32, 8);
  ctx.fillRect(x + sW1 + sW2 + 16, gY + 20, sW3 - 32, 8);

  // 1층 대형 쇼윈도 통유리
  const showY = gY + 8 + signH + 4;
  const showH = gH - 8 - signH - 8;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 8, showY, s - 16, showH);

  const showGrad = ctx.createLinearGradient(x, showY, x, showY + showH);
  showGrad.addColorStop(0, '#60a5fa');
  showGrad.addColorStop(0.4, '#1e293b');
  showGrad.addColorStop(1, '#020617');
  ctx.fillStyle = showGrad;
  ctx.fillRect(x + 10, showY + 2, s - 20, showH - 4);

  // 1층 자동문 프레임
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + s * 0.5 - 20, showY, 40, showH);
}

function drawCurtainwallHigh(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 고층 반사 유리 딥블루/그린 그라데이션 베이스 (#0369a1 ~ #0f172a)
  const bgGrad = ctx.createLinearGradient(x, y, x + s, y + s);
  bgGrad.addColorStop(0, '#0369a1');
  bgGrad.addColorStop(0.4, '#0284c7');
  bgGrad.addColorStop(0.8, '#0f172a');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(x, y, s, s);

  // 2) 층간 스팬드럴 패널 수평 밴드
  const bandH = 64;
  for (let py = y; py < y + s; py += bandH) {
    ctx.fillStyle = 'rgba(2, 132, 199, 0.5)';
    ctx.fillRect(x, py + bandH - 12, s, 12);
  }

  // 3) 알루미늄 커튼월 수직 멀리언 & 수평 트랜섬 그리드
  ctx.fillStyle = '#94a3b8';
  for (let px = x; px < x + s; px += 32) {
    ctx.fillRect(px, y, 1.5, s);
  }
  for (let py = y; py < y + s; py += 32) {
    ctx.fillRect(x, py, s, 1.5);
  }

  // 주요 기둥 강조선
  ctx.fillStyle = '#e2e8f0';
  for (let px = x; px < x + s; px += 128) {
    ctx.fillRect(px - 1, y, 3, s);
  }

  // 4) 대각선 하늘 반사 광택 (Sky Reflection Glare)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y);
  ctx.lineTo(x + s * 0.55, y);
  ctx.lineTo(x + s * 0.35, y + s);
  ctx.lineTo(x, y + s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawVillaResidential(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 한국 빌라 특유의 붉은 적벽돌 조적 (#7c2d12, #991b1b)
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(x, y, s, s);

  // 벽돌 패턴 (개별 벽돌 음영)
  const bW = 28;
  const bH = 12;
  ctx.fillStyle = '#991b1b';
  let row = 0;
  for (let py = y; py < y + s; py += bH + 2) {
    const shift = (row % 2) * (bW * 0.5);
    for (let px = x - bW + shift; px < x + s; px += bW + 2) {
      ctx.fillRect(px, py, bW, bH);
    }
    row++;
  }

  // 줄눈 모르타르
  ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
  for (let py = y; py < y + s; py += bH + 2) {
    ctx.fillRect(x, py + bH, s, 2);
  }

  // 2) 1층 및 코너 화강석 마감 (#f1f5f9)
  const cornerW = 32;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, cornerW, s);
  ctx.fillRect(x + s - cornerW, y, cornerW, s);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + cornerW, y, 2, s);
  ctx.fillRect(x + s - cornerW - 2, y, 2, s);

  // 1층 하단 대리석 기단
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y + s - 60, s, 60);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y + s - 60, s, 4);

  // 3) 직사각형 창문 6개 (화이트 PVC 프레임)
  const cols = 2;
  const rows = 3;
  const winW = 64;
  const winH = 72;
  const startX = x + cornerW + 36;
  const gapX = (s - (cornerW * 2 + 72 + winW * cols)) / (cols - 1 || 1);

  for (let r = 0; r < rows; r++) {
    const wy = y + 24 + r * (winH + 48);
    for (let c = 0; c < cols; c++) {
      const wx = startX + c * (winW + gapX);

      // 화이트 PVC 프레임
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx - 4, wy - 4, winW + 8, winH + 8);
      // 창틀 하단 화강석 창대석
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(wx - 6, wy + winH + 4, winW + 12, 6);

      // 다크 글래스
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx, wy, winW, winH);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(wx + 2, wy + 2, winW - 4, winH * 0.45);
      // 창살
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(wx + winW * 0.5 - 1.5, wy, 3, winH);
    }
  }
}

function drawPublicFacility(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 정돈된 베이지/실버 알루미늄 복합 패널 (#e2e8f0, #d1d5db)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, s, s);

  // 패널 그리드
  ctx.fillStyle = '#94a3b8';
  for (let px = x; px < x + s; px += 64) ctx.fillRect(px, y, 2, s);
  for (let py = y; py < y + s; py += 64) ctx.fillRect(x, py, s, 2);

  // 2) 정방형 오피스 창호 4개
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const wx = x + 48 + c * 230;
      const wy = y + 48 + r * 230;
      const wSize = 150;

      // 다크 그레이 창틀
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx - 4, wy - 4, wSize + 8, wSize + 8);

      // 유리창
      const wGrad = ctx.createLinearGradient(wx, wy, wx, wy + wSize);
      wGrad.addColorStop(0, '#bae6fd');
      wGrad.addColorStop(0.5, '#38bdf8');
      wGrad.addColorStop(1, '#0369a1');
      ctx.fillStyle = wGrad;
      ctx.fillRect(wx, wy, wSize, wSize);

      // 외벽 수직 일사 차양 루버 핀 (Sun Louvers)
      ctx.fillStyle = '#64748b';
      ctx.fillRect(wx - 8, wy - 8, 4, wSize + 16);
      ctx.fillRect(wx + wSize + 4, wy - 8, 4, wSize + 16);
    }
  }

  // 상단 파라펫 메탈 트림
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, s, 10);
}

function drawRoofGreenUrethane(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 한국 특유의 초록색 우레탄 방수 옥상 베이스 (#15803d ~ #166534)
  const roofGrad = ctx.createRadialGradient(
    x + s * 0.45, y + s * 0.45, 40,
    x + s * 0.5, y + s * 0.5, s * 0.7
  );
  roofGrad.addColorStop(0, '#16a34a');
  roofGrad.addColorStop(0.4, '#15803d');
  roofGrad.addColorStop(0.85, '#166534');
  roofGrad.addColorStop(1, '#14532d');
  ctx.fillStyle = roofGrad;
  ctx.fillRect(x, y, s, s);

  // 롤러 도색 결 및 미세 텍스처
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < s; i += 8) {
    ctx.fillRect(x, y + i, s, 2);
  }

  // 2) 회색 콘크리트 테두리 난간 연석 라인 (Parapet border #94a3b8)
  const borderW = 28;
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y, s, borderW);
  ctx.fillRect(x, y + s - borderW, s, borderW);
  ctx.fillRect(x, y, borderW, s);
  ctx.fillRect(x + s - borderW, y, borderW, s);

  // 코핑 음영선
  ctx.fillStyle = '#64748b';
  ctx.strokeRect(x + borderW, y + borderW, s - borderW * 2, s - borderW * 2);

  // 3) 원형 배수구(Drain) 및 옥상 점검 해치 도어
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(x + borderW + 32, y + borderW + 32, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(x + borderW + 32, y + borderW + 32, 6, 0, Math.PI * 2);
  ctx.fill();

  // 점검 해치 도어 (스퀘어)
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + s * 0.65, y + s * 0.65, 56, 56);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x + s * 0.65 + 4, y + s * 0.65 + 4, 48, 48);
}

function drawRoofBlueZinc(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 청색 징크/강판 지붕 베이스 (#1d4ed8 ~ #1e40af)
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(x, y, s, s);

  // 2) 돌출 이음(Standing Seam) 리브 라인 (세로 줄무늬)
  const ribStep = 24;
  for (let px = x; px < x + s; px += ribStep) {
    // 하이라이트
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(px, y, 2, s);
    // 섀도우
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(px + 2, y, 3, s);
  }

  // 금속성 은은한 사선 반사 광택
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.3, y);
  ctx.lineTo(x + s * 0.6, y);
  ctx.lineTo(x + s * 0.3, y + s);
  ctx.lineTo(x, y + s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoofBrownShingle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 적갈색/브라운 아스팔트 슁글 베이스 (#78350f ~ #451a03)
  ctx.fillStyle = '#78350f';
  ctx.fillRect(x, y, s, s);

  // 비늘형 아스팔트 슁글 타일
  const sW = 40;
  const sH = 20;
  let r = 0;
  for (let py = y; py < y + s; py += sH) {
    const shift = (r % 2) * (sW * 0.5);
    for (let px = x - sW + shift; px < x + s; px += sW) {
      ctx.fillStyle = (r + px) % 3 === 0 ? '#92400e' : (r + px) % 3 === 1 ? '#78350f' : '#451a03';
      ctx.fillRect(px, py, sW - 1, sH - 1);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(px, py + sH - 2, sW - 1, 2);
    }
    r++;
  }
}

function drawRoofConcreteCool(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 쿨루프 회색 콘크리트 슬래브 (#475569 ~ #64748b)
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y, s, s);

  // 콘크리트 팽창 줄눈 (Expansion Joints)
  ctx.fillStyle = '#334155';
  for (let px = x; px < x + s; px += 128) ctx.fillRect(px, y, 2, s);
  for (let py = y; py < y + s; py += 128) ctx.fillRect(x, py, s, 2);

  // 2) 냉각탑(Cooling Tower) 루버 & 실외기 팬 설비 패턴
  // 대형 냉각탑
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 50, y + 50, 140, 140);
  ctx.fillStyle = '#64748b';
  for (let py = y + 55; py < y + 185; py += 10) {
    ctx.fillRect(x + 55, py, 130, 4);
  }

  // 옥상 실외기 팬 4기
  for (let i = 0; i < 4; i++) {
    const fx = x + 240 + (i % 2) * 80;
    const fy = y + 60 + Math.floor(i / 2) * 80;
    ctx.fillStyle = '#334155';
    ctx.fillRect(fx, fy, 60, 60);
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(fx + 30, fy + 30, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(fx + 30, fy + 30, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPenthouseWall(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 옥탑 권상기실 / 엘리베이터 기계실 외벽
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, s, s);

  // 상단 차골 난간 캡
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, s, 16);

  // 철제 루버 출입문
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + s * 0.35, y + s * 0.3, s * 0.3, s * 0.65);
  ctx.fillStyle = '#94a3b8';
  for (let ly = y + s * 0.35; ly < y + s * 0.85; ly += 12) {
    ctx.fillRect(x + s * 0.37, ly, s * 0.26, 4);
  }

  // 위험 경고 표지판
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x + s * 0.42, y + s * 0.22, 40, 20);
}

function drawParapetConcrete(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 옥상 난간(Parapet) 콘크리트 외벽 & 코핑 캡
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y, s, s);

  // 상단 다크 스톤 코핑 캡 (#334155)
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, s, s * 0.25);

  // 콘크리트 수직 패널 이음매
  ctx.fillStyle = '#94a3b8';
  for (let px = x; px < x + s; px += 64) {
    ctx.fillRect(px, y + s * 0.25, 2, s * 0.75);
  }
}

/**
 * 2048x2048 고해상도 Canvas 아틀라스를 생성합니다.
 */
export function generateKoreanCityAtlasCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_GRID_SIZE;
  canvas.height = ATLAS_GRID_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 전체 배경 초기화
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, ATLAS_GRID_SIZE, ATLAS_GRID_SIZE);

  const s = ATLAS_CELL_SIZE;

  // Row 0: 외벽 주요 4종
  drawApartmentFront(ctx, 0 * s, 0 * s, s);
  drawApartmentSide(ctx, 1 * s, 0 * s, s);
  drawCommercialMid(ctx, 2 * s, 0 * s, s);
  drawCurtainwallHigh(ctx, 3 * s, 0 * s, s);

  // Row 1: 외벽 2종 + 지붕 2종
  drawVillaResidential(ctx, 0 * s, 1 * s, s);
  drawPublicFacility(ctx, 1 * s, 1 * s, s);
  drawRoofGreenUrethane(ctx, 2 * s, 1 * s, s);
  drawRoofBlueZinc(ctx, 3 * s, 1 * s, s);

  // Row 2: 지붕 2종 + 옥탑/난간 보조 2종
  drawRoofBrownShingle(ctx, 0 * s, 2 * s, s);
  drawRoofConcreteCool(ctx, 1 * s, 2 * s, s);
  drawPenthouseWall(ctx, 2 * s, 2 * s, s);
  drawParapetConcrete(ctx, 3 * s, 2 * s, s);

  // Row 3: 예비 확장 슬롯 (변형 패턴 복제)
  drawApartmentFront(ctx, 0 * s, 3 * s, s);
  drawRoofGreenUrethane(ctx, 1 * s, 3 * s, s);
  drawCommercialMid(ctx, 2 * s, 3 * s, s);
  drawCurtainwallHigh(ctx, 3 * s, 3 * s, s);

  return canvas;
}

let cachedAtlasTexture: THREE.CanvasTexture | null = null;

/**
 * 전역 싱글톤 CanvasTexture 인스턴스를 반환합니다.
 */
export function getKoreanCityAtlasTexture(): THREE.CanvasTexture | null {
  if (cachedAtlasTexture) return cachedAtlasTexture;

  const canvas = generateKoreanCityAtlasCanvas();
  if (!canvas) return null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  cachedAtlasTexture = texture;
  return cachedAtlasTexture;
}

let cachedMasterMaterial: THREE.MeshStandardMaterial | null = null;

/**
 * 아틀라스 텍스처를 사용하는 단일 PBR 마스터 머티리얼을 반환합니다.
 */
export function getKoreanCityAtlasMaterial(): THREE.MeshStandardMaterial | null {
  if (cachedMasterMaterial) return cachedMasterMaterial;

  const tex = getKoreanCityAtlasTexture();
  if (!tex) return null;

  cachedMasterMaterial = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.65,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  return cachedMasterMaterial;
}

/**
 * 아틀라스 텍스처 및 머티리얼 메모리를 해제합니다.
 */
export function disposeKoreanCityAtlas(): void {
  if (cachedAtlasTexture) {
    cachedAtlasTexture.dispose();
    cachedAtlasTexture = null;
  }
  if (cachedMasterMaterial) {
    cachedMasterMaterial.dispose();
    cachedMasterMaterial = null;
  }
}

// =============================================================================
// 2. 건물 형태·높이·면적 기반 지능형 재질 자동 분류기
// =============================================================================

export interface BuildingClassification {
  category: 'apartment' | 'curtainwall' | 'commercial' | 'villa' | 'public';
  wallFrontSlot: AtlasSlot;
  wallSideSlot: AtlasSlot;
  roofSlot: AtlasSlot;
  hasParapet: boolean;
  parapetHeight: number;
  hasPenthouse: boolean;
  isPitchedRoof: boolean;
}

/**
 * 좌표 기반 결정론적(Deterministic) 유사 난수 생성 (0.0 ~ 1.0)
 */
function pseudoRandom(x: number, y: number): number {
  const sinVal = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return sinVal - Math.floor(sinVal);
}

/**
 * 건물 폴리곤 좌표, 실측 높이, 속성 정보를 기반으로
 * 한국형 실사 아틀라스 재질 슬롯을 지능적으로 분류합니다.
 */
export function classifyBuilding(
  pts: THREE.Vector2[],
  height: number,
  props: Record<string, any> = {}
): BuildingClassification {
  const totalH = Math.max(3.0, height);
  const name = String(props.name || '');
  const usageType = String(
    props.usageType || props.bld_category || props.type || ''
  ).toLowerCase();

  // OBB 및 외곽선 치수 계산
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;

  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    cx += p.x;
    cy += p.y;
  }
  const N = Math.max(1, pts.length);
  cx /= N;
  cy /= N;

  const lenX = Math.max(0.1, maxX - minX);
  const lenY = Math.max(0.1, maxY - minY);
  const maxDim = Math.max(lenX, lenY);
  const minDim = Math.min(lenX, lenY);
  const aspectRatio = maxDim / Math.max(minDim, 1.0);
  const approxArea = lenX * lenY;

  const rnd = pseudoRandom(cx, cy);

  // 1) [규칙 1]: 높이 30m 이상 & 긴 직사각형 폴리곤 -> '한국형 대단지 아파트'
  // (또는 이름에 '아파트' 포함되거나 주거용 15m 이상)
  const isAptByName = name.includes('아파트') || usageType.includes('apartment');
  if (
    (totalH >= 30.0 && aspectRatio >= 1.5) ||
    (isAptByName && totalH >= 15.0) ||
    (usageType.includes('residential') && totalH >= 24.0)
  ) {
    const isGreenRoof = rnd < 0.75;
    return {
      category: 'apartment',
      wallFrontSlot: 'apartment_front',
      wallSideSlot: 'apartment_side',
      roofSlot: isGreenRoof ? 'roof_green_urethane' : 'roof_concrete_cool',
      hasParapet: true,
      parapetHeight: 1.0,
      hasPenthouse: true,
      isPitchedRoof: false,
    };
  }

  // 2) [규칙 2]: 높이 25m 이상 & 넓은 면적 -> '유리 커튼월 오피스 타워' 또는 '화이트 석재 빌딩'
  if (totalH >= 25.0) {
    const isCurtain = totalH >= 40.0 || rnd < 0.6 || name.includes('타워') || usageType.includes('office');
    return {
      category: isCurtain ? 'curtainwall' : 'commercial',
      wallFrontSlot: isCurtain ? 'curtainwall_high' : 'commercial_mid',
      wallSideSlot: isCurtain ? 'curtainwall_high' : 'commercial_mid',
      roofSlot: 'roof_concrete_cool', // 고층 빌딩 콘크리트 설비 옥상
      hasParapet: true,
      parapetHeight: 1.0,
      hasPenthouse: true,
      isPitchedRoof: false,
    };
  }

  // 3) [규칙 3]: 높이 10m~24m 중층 건물 -> '중층 상가 빌딩'
  // 70% 확률로 초록색 우레탄 방수 옥상, 30% 확률로 회색/청색 지붕 적용
  if (totalH >= 10.0 && totalH < 25.0) {
    const isPublic = usageType.includes('public') || name.includes('청사') || name.includes('센터');
    let roofSlot: AtlasSlot = 'roof_green_urethane'; // 70% 초록 우레탄
    if (rnd >= 0.70 && rnd < 0.90) {
      roofSlot = 'roof_concrete_cool'; // 20% 회색 콘크리트
    } else if (rnd >= 0.90) {
      roofSlot = 'roof_blue_zinc'; // 10% 청색 징크
    }

    return {
      category: isPublic ? 'public' : 'commercial',
      wallFrontSlot: isPublic ? 'public_facility' : 'commercial_mid',
      wallSideSlot: isPublic ? 'public_facility' : 'commercial_mid',
      roofSlot,
      hasParapet: true,
      parapetHeight: 1.0,
      hasPenthouse: true,
      isPitchedRoof: false,
    };
  }

  // 4) [규칙 4]: 높이 10m 미만 저층 건물 -> '적벽돌/화강석 빌라'
  // 초록 우레탄 옥상(65%) 또는 경사 지붕(35%)
  const isPitched = rnd >= 0.65 || usageType.includes('house');
  let roofSlot: AtlasSlot = 'roof_green_urethane';
  if (isPitched) {
    roofSlot = rnd < 0.82 ? 'roof_brown_shingle' : 'roof_blue_zinc';
  }

  return {
    category: 'villa',
    wallFrontSlot: 'villa_residential',
    wallSideSlot: 'villa_residential',
    roofSlot,
    hasParapet: !isPitched,
    parapetHeight: 1.0,
    hasPenthouse: false,
    isPitchedRoof: isPitched,
  };
}
