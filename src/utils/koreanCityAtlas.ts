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
  | 'commercial_ground'
  | 'curtainwall_high'
  | 'villa_residential'
  | 'public_facility'
  | 'foundation_stone'
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

  commercial_ground: { col: 0, row: 3 },
  foundation_stone: { col: 1, row: 3 },
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
  // 1) 외벽 베이스: 밝은 크림/아이보리색 콘크리트 외벽 (#f8fafc)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, s, s);

  // 미세 콘크리트 결
  ctx.fillStyle = 'rgba(203, 213, 225, 0.35)';
  for (let i = 0; i < s; i += 6) {
    ctx.fillRect(x, y + i, s, 1.2);
  }

  // 2) 층간 콘크리트 슬래브 (상단 & 하단 마감: 1개 층 3.0m 기준)
  const slabH = 22;
  // 상단 슬래브
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y, s, slabH);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y + slabH - 4, s, 4);
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, y + slabH, s, 2);

  // [입면 요철 강화] 층간 슬래브 하단 0.25m 폭(약 36px) 미세한 드롭 섀도우 그라데이션
  const slabShadow = ctx.createLinearGradient(x, y + slabH + 2, x, y + slabH + 38);
  slabShadow.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
  slabShadow.addColorStop(0.5, 'rgba(15, 23, 42, 0.18)');
  slabShadow.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = slabShadow;
  ctx.fillRect(x, y + slabH + 2, s, 36);

  // 하단 슬래브
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y + s - slabH, s, slabH);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x, y + s - slabH, s, 3);

  // 3) 세대 간 수직 콘크리트 기둥 (Pillars) 및 수직 우수관 (Downspout)
  const pillarW = Math.round(s * 0.07);
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, pillarW, s);
  ctx.fillRect(x + s - pillarW, y, pillarW, s);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + pillarW - 2, y, 2, s);
  ctx.fillRect(x + s - pillarW, y, 2, s);

  // 세대별 수직 우수관 (Downspout 라인 및 벽면 그림자)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.fillRect(x + pillarW - 6, y, 4, s);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x + pillarW - 8, y, 3, s);

  // 4) 1개 층(3.0m) 대형 베란다 이중창 및 안전 난간, 실외기 루버 (폭 2.8m 1베이)
  const winW = s - (pillarW + 12) * 2;
  const winX = x + pillarW + 12;
  const floorY = y + slabH + 6;
  const availH = s - slabH * 2 - 12;
  const windowH = Math.round(availH * 0.58);
  const balconyH = availH - windowH - 6;

  // (a) 다크 그레이 창문 섀시 프레임 (#1e293b)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX - 3, floorY - 3, winW + 6, windowH + 6);

  // (b) 하늘 반사 유리 그라데이션 (#7dd3fc ~ #0f172a)
  const glassGrad = ctx.createLinearGradient(winX, floorY, winX, floorY + windowH);
  glassGrad.addColorStop(0, '#7dd3fc');
  glassGrad.addColorStop(0.3, '#38bdf8');
  glassGrad.addColorStop(0.7, '#0284c7');
  glassGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, floorY, winW, windowH);

  // 창호 화이트 4분할 섀시
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(winX + winW * 0.5 - 2, floorY, 4, windowH);
  ctx.fillRect(winX + winW * 0.25 - 1.5, floorY, 3, windowH);
  ctx.fillRect(winX + winW * 0.75 - 1.5, floorY, 3, windowH);
  ctx.fillRect(winX, floorY + windowH * 0.45 - 1.5, winW, 3);

  // (c) 베란다 하단 안전 난간 (철제 세로살 격자)
  const balcY = floorY + windowH + 6;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(winX, balcY, winW, balconyH);

  // 난간 상단 핸드레일
  ctx.fillStyle = '#64748b';
  ctx.fillRect(winX, balcY, winW, 4);

  // 세로 난간 살 (Balusters)
  ctx.fillStyle = '#94a3b8';
  for (let bx = winX + 8; bx < winX + winW - 8; bx += 14) {
    ctx.fillRect(bx, balcY + 4, 2, balconyH - 4);
  }

  // (d) 세대별 에어컨 실외기 루버 (오른쪽 28% 폭)
  const acW = Math.round(winW * 0.28);
  const acX = winX + winW - acW - 4;
  const acY = balcY + 3;
  const acH = balconyH - 6;

  ctx.fillStyle = '#475569';
  ctx.fillRect(acX, acY, acW, acH);
  ctx.fillStyle = '#cbd5e1';
  for (let ly = acY + 3; ly < acY + acH - 3; ly += 6) {
    ctx.fillRect(acX + 2, ly, acW - 4, 2);
  }
}

function drawApartmentSide(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 외벽 베이스: 밝은 크림/아이보리 콘크리트 외벽 (#f8fafc)
  ctx.fillStyle = '#f8fafc';
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
  // 1) 밝은 화강석/대리석 석재 타일 베이스 (#f1f5f9 / #e2e8f0)
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, s, s);

  // 화강석 질감 미세 반점
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
  for (let i = 0; i < s; i += 16) {
    for (let j = 0; j < s; j += 16) {
      if ((i + j) % 32 === 0) ctx.fillRect(x + i, y + j, 2, 2);
    }
  }

  // 석재 타일 조적 줄눈 (#cbd5e1)
  ctx.fillStyle = '#cbd5e1';
  for (let px = x; px < x + s; px += 64) {
    ctx.fillRect(px, y, 1.5, s);
  }
  for (let py = y; py < y + s; py += 48) {
    ctx.fillRect(x, py, s, 1.5);
  }

  // 2) 가로형 연속 유리창 (Ribbon Window, 높이 52% 영역)
  const winTop = y + s * 0.22;
  const winH = s * 0.52;

  // 창틀 다크 프레임 (#1e293b)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, winTop - 3, s, winH + 6);

  // 유리창 daylight 반사 그라데이션 (#93c5fd ~ #1e3a8a)
  const winGrad = ctx.createLinearGradient(x, winTop, x, winTop + winH);
  winGrad.addColorStop(0, '#bae6fd');
  winGrad.addColorStop(0.3, '#60a5fa');
  winGrad.addColorStop(0.7, '#2563eb');
  winGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = winGrad;
  ctx.fillRect(x, winTop, s, winH);

  // 알루미늄 멀리언 수직 바 (창문 분할)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + s * 0.5 - 2, winTop, 4, winH);
  ctx.fillRect(x + s * 0.25 - 1.5, winTop, 3, winH);
  ctx.fillRect(x + s * 0.75 - 1.5, winTop, 3, winH);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, winTop + winH * 0.5 - 1.5, s, 3);

  // 상단 스팬드럴 및 하단 창대석 마감
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, winTop + winH + 3, s, 4);
}

function drawCommercialGround(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 1층 화강석 베이스
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x, y, s, s);

  // 2) 1층 상가 간판 컬러 띠장 (상단 32% 높이)
  const signH = Math.round(s * 0.32);
  const signY = y + 12;

  // 간판 외곽 블랙 프레임 & 캐노피
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 4, signY - 2, s - 8, signH + 4);

  // 상가 간판 컬러 (오렌지/에메랄드/블루 그라데이션)
  const signGrad = ctx.createLinearGradient(x, signY, x + s, signY);
  signGrad.addColorStop(0, '#059669'); // 약국/베이커리 녹색
  signGrad.addColorStop(0.5, '#ea580c'); // 카페/식당 주황색
  signGrad.addColorStop(1, '#2563eb'); // 편의점/은행 파란색
  ctx.fillStyle = signGrad;
  ctx.fillRect(x + 8, signY + 2, s - 16, signH - 4);

  // 간판 텍스트 실루엣 및 로고 마킹
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STORE • MART', x + s * 0.5, signY + signH * 0.5);

  // 3) 1층 상가 쇼윈도 통유리 및 자동 출입문 (하단 60% 높이)
  const shopY = signY + signH + 8;
  const shopH = s - (signY + signH + 16);

  // 통유리 프레임
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 6, shopY - 2, s - 12, shopH + 4);

  // 쇼윈도 글래스 반사
  const shopGrad = ctx.createLinearGradient(x, shopY, x, shopY + shopH);
  shopGrad.addColorStop(0, '#7dd3fc');
  shopGrad.addColorStop(0.3, '#1e293b');
  shopGrad.addColorStop(1, '#020617');
  ctx.fillStyle = shopGrad;
  ctx.fillRect(x + 8, shopY, s - 16, shopH);

  // 중앙 자동문 프레임
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + s * 0.5 - 24, shopY, 48, shopH);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + s * 0.5 - 20, shopY + 6, 40, shopH - 12);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + s * 0.5 - 2, shopY + 6, 4, shopH - 12);
}

function drawFoundationStone(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 지하 및 기단부 매립용 다크 그레이 화강석 기초
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, s, s);

  // 석재 조적 블록
  const bW = 64;
  const bH = 32;
  let row = 0;
  for (let py = y; py < y + s; py += bH) {
    const shift = (row % 2) * (bW * 0.5);
    for (let px = x - bW + shift; px < x + s; px += bW) {
      ctx.fillStyle = (row + px) % 2 === 0 ? '#475569' : '#334155';
      ctx.fillRect(px + 1, py + 1, bW - 2, bH - 2);
    }
    row++;
  }
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

  // 2) 층간 스팬드럴 패널 수평 밴드 (상단 16%)
  const bandH = Math.round(s * 0.16);
  ctx.fillStyle = 'rgba(2, 132, 199, 0.6)';
  ctx.fillRect(x, y, s, bandH);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x, y + bandH - 3, s, 3);

  // 3) 알루미늄 커튼월 수직 멀리언 & 수평 트랜섬 그리드
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + s * 0.5 - 1.5, y, 3, s);
  ctx.fillRect(x + s * 0.25 - 1.5, y, 3, s);
  ctx.fillRect(x + s * 0.75 - 1.5, y, 3, s);
  ctx.fillRect(x, y + s * 0.55 - 1.5, s, 3);

  // 4) 대각선 daylight 하늘 반사 광택 (Sky Reflection Glare)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y);
  ctx.lineTo(x + s * 0.6, y);
  ctx.lineTo(x + s * 0.4, y + s);
  ctx.lineTo(x, y + s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawVillaResidential(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // 1) 한국 빌라/단독주택 특유의 붉은 적벽돌 조적 (#7c2d12, #991b1b)
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(x, y, s, s);

  // 벽돌 패턴
  const bW = 32;
  const bH = 14;
  let row = 0;
  for (let py = y; py < y + s; py += bH + 2) {
    const shift = (row % 2) * (bW * 0.5);
    for (let px = x - bW + shift; px < x + s; px += bW + 2) {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(px, py, bW, bH);
    }
    row++;
  }

  // 줄눈 모르타르 (#e2e8f0)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
  for (let py = y; py < y + s; py += bH + 2) {
    ctx.fillRect(x, py + bH, s, 2);
  }

  // 2) 좌우 모서리 화강석 마감 (#f1f5f9)
  const cornerW = 28;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(x, y, cornerW, s);
  ctx.fillRect(x + s - cornerW, y, cornerW, s);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + cornerW - 2, y, 2, s);
  ctx.fillRect(x + s - cornerW, y, 2, s);

  // 3) 1개 층(3.0m) 직사각형 이중 창문 (화이트 PVC 프레임)
  const winW = s - (cornerW + 36) * 2;
  const winX = x + cornerW + 36;
  const winY = y + s * 0.22;
  const winH = s * 0.54;

  // 화이트 PVC 외곽 프레임
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(winX - 6, winY - 6, winW + 12, winH + 12);
  // 창틀 하단 화강석 창대석
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(winX - 10, winY + winH + 6, winW + 20, 8);

  // 다크 글래스 & 하늘 반사
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(winX, winY, winW, winH);
  const vGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  vGrad.addColorStop(0, '#7dd3fc');
  vGrad.addColorStop(0.4, '#0284c7');
  vGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = vGrad;
  ctx.fillRect(winX + 2, winY + 2, winW - 4, winH - 4);

  // 화이트 PVC 십자 섀시 창살
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(winX + winW * 0.5 - 2, winY, 4, winH);
  ctx.fillRect(winX, winY + winH * 0.45 - 2, winW, 4);
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

  // [입체 마이크로 디테일 1] 1.2m 옥상 난간 테두리 내측 그림자 (Parapet Inner Drop Shadow)
  // 난간 안쪽 바닥면으로 36px 폭의 부드러운 드롭 섀도우를 부여하여 우레탄 바닥이 1.2m 깊이로 푹 들어간 깊이감 극대화
  const innerShadowW = 36;
  // 상단 내측 그림자 (북쪽 난간에 의한 음영)
  const topInShadow = ctx.createLinearGradient(x, y + borderW, x, y + borderW + innerShadowW);
  topInShadow.addColorStop(0, 'rgba(2, 6, 23, 0.45)');
  topInShadow.addColorStop(0.6, 'rgba(2, 6, 23, 0.16)');
  topInShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = topInShadow;
  ctx.fillRect(x + borderW, y + borderW, s - borderW * 2, innerShadowW);

  // 좌측 내측 그림자 (서쪽 난간에 의한 음영)
  const leftInShadow = ctx.createLinearGradient(x + borderW, y, x + borderW + innerShadowW, y);
  leftInShadow.addColorStop(0, 'rgba(2, 6, 23, 0.40)');
  leftInShadow.addColorStop(0.6, 'rgba(2, 6, 23, 0.14)');
  leftInShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = leftInShadow;
  ctx.fillRect(x + borderW, y + borderW, innerShadowW, s - borderW * 2);

  // 우측/하단 앰비언트 오클루전 미세 접촉선
  ctx.fillStyle = 'rgba(2, 6, 23, 0.22)';
  ctx.fillRect(x + s - borderW - 8, y + borderW, 8, s - borderW * 2);
  ctx.fillRect(x + borderW, y + s - borderW - 8, s - borderW * 2, 8);

  // [입체 마이크로 디테일 2] 미세한 배수로 줄눈(Drainage Gutters / Joint Grooves)
  // 십자형 주 배수 트렌치 홈
  const trenchW = 4;
  const midX = x + Math.round(s * 0.5);
  const midY = y + Math.round(s * 0.5);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(midX - 2, y + borderW, trenchW, s - borderW * 2);
  ctx.fillRect(x + borderW, midY - 2, s - borderW * 2, trenchW);
  // 배수 홈 테두리 하이라이트
  ctx.fillStyle = '#166534';
  ctx.fillRect(midX + 2, y + borderW, 1.5, s - borderW * 2);
  ctx.fillRect(x + borderW, midY + 2, s - borderW * 2, 1.5);

  // 사선 집수 구배 줄눈 (모서리 배수구 방향)
  ctx.strokeStyle = 'rgba(20, 83, 45, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + borderW, y + borderW);
  ctx.lineTo(midX, midY);
  ctx.moveTo(x + s - borderW, y + borderW);
  ctx.lineTo(midX, midY);
  ctx.stroke();

  // 3) 원형 배수구(Drain) 및 옥상 점검 해치 도어
  // 좌상단 주 배수구
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(x + borderW + 32, y + borderW + 32, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(x + borderW + 32, y + borderW + 32, 7, 0, Math.PI * 2);
  ctx.fill();

  // 우하단 보조 배수구
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(x + s - borderW - 32, y + s - borderW - 32, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(x + s - borderW - 32, y + s - borderW - 32, 6, 0, Math.PI * 2);
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

  // [입체 마이크로 디테일 3] 은색 HVAC 설비 배관 파이프 라인 (Piping Network)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'; // 파이프 하단 그림자
  ctx.fillRect(x + 190, y + 120, 260, 6);
  ctx.fillRect(x + 190, y + 120, 6, 120);

  ctx.fillStyle = '#cbd5e1'; // 은색 메탈 파이프
  ctx.fillRect(x + 190, y + 118, 260, 4);
  ctx.fillRect(x + 190, y + 118, 4, 120);

  // [입체 마이크로 디테일 4] 태양광 집열판(Solar Panel) 어레이 그리드 (2x3 배열)
  const solarCols = 3;
  const solarRows = 2;
  const pW = 100;
  const pH = 65;
  const sStartX = x + 60;
  const sStartY = y + 270;

  for (let r = 0; r < solarRows; r++) {
    for (let c = 0; c < solarCols; c++) {
      const px = sStartX + c * (pW + 24);
      const py = sStartY + r * (pH + 20);

      // 패널 지면 그림자
      ctx.fillStyle = 'rgba(2, 6, 23, 0.40)';
      ctx.fillRect(px + 4, py + 4, pW, pH);

      // 메탈 지지대 프레임
      ctx.fillStyle = '#475569';
      ctx.fillRect(px - 2, py - 2, pW + 4, pH + 4);

      // 감청색 고효율 태양광 패널 셀
      const sGrad = ctx.createLinearGradient(px, py, px + pW, py + pH);
      sGrad.addColorStop(0, '#1e3a8a');
      sGrad.addColorStop(0.5, '#1e40af');
      sGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = sGrad;
      ctx.fillRect(px, py, pW, pH);

      // 솔라 셀 분할 버스바 그리드
      ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
      ctx.fillRect(px + pW * 0.33, py, 1.5, pH);
      ctx.fillRect(px + pW * 0.66, py, 1.5, pH);
      ctx.fillRect(px, py + pH * 0.5, pW, 1.5);
    }
  }

  // [입체 마이크로 디테일 5] 옥상 테두리 난간 내측 그림자 (Parapet Inner Drop Shadow)
  const cBorderW = 20;
  const cInnerShadow = 32;
  const cTopInShadow = ctx.createLinearGradient(x, y + cBorderW, x, y + cBorderW + cInnerShadow);
  cTopInShadow.addColorStop(0, 'rgba(2, 6, 23, 0.45)');
  cTopInShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = cTopInShadow;
  ctx.fillRect(x + cBorderW, y + cBorderW, s - cBorderW * 2, cInnerShadow);

  const cLeftInShadow = ctx.createLinearGradient(x + cBorderW, y, x + cBorderW + cInnerShadow, y);
  cLeftInShadow.addColorStop(0, 'rgba(2, 6, 23, 0.40)');
  cLeftInShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = cLeftInShadow;
  ctx.fillRect(x + cBorderW, y + cBorderW, cInnerShadow, s - cBorderW * 2);
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

  // Row 3: 상가 1층 간판/쇼윈도 + 기초 화강석 석재 + 보조 슬롯
  drawCommercialGround(ctx, 0 * s, 3 * s, s);
  drawFoundationStone(ctx, 1 * s, 3 * s, s);
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
    roughness: 0.50,
    metalness: 0.10,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthTest: true,
    depthWrite: true,
    vertexColors: true,
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
  category: 'apartment' | 'curtainwall' | 'commercial' | 'villa' | 'public' | 'military';
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

  // 1) [규칙 1]: 아파트 (높이 30m 이상 또는 아파트 명칭/브랜드/용도)
  // 외벽: 밝은 크림/아이보리색(#f8fafc) + 세대별 베란다 유리창 격자 + 측벽 동 번호 라인
  // 옥상: 회색 콘크리트 옥상 및 3.2m 엘리베이터 옥탑방 돌출
  const isAptByName =
    name.includes('아파트') ||
    name.includes('apt') ||
    name.includes('단지') ||
    name.includes('푸르지오') ||
    name.includes('자이') ||
    name.includes('힐스테이트') ||
    name.includes('래미안') ||
    name.includes('e편한') ||
    name.includes('더샵') ||
    name.includes('아이파크') ||
    name.includes('롯데캐슬') ||
    name.includes('한신') ||
    name.includes('삼호') ||
    name.includes('두산') ||
    name.includes('우성') ||
    name.includes('현대') ||
    name.includes('동보') ||
    name.includes('세경') ||
    name.includes('코아루') ||
    name.includes('부영') ||
    name.includes('주공') ||
    usageType.includes('apartment');

  if (
    isAptByName ||
    (totalH >= 30.0 && aspectRatio >= 1.35) ||
    (usageType.includes('residential') && totalH >= 24.0)
  ) {
    return {
      category: 'apartment',
      wallFrontSlot: 'apartment_front',
      wallSideSlot: 'apartment_side',
      roofSlot: 'roof_concrete_cool', // 회색 콘크리트 옥상 슬래브
      hasParapet: true,
      parapetHeight: 1.2, // 1.2m 옥상 테두리 난간
      hasPenthouse: true, // 엘리베이터 옥탑방 돌출 (3.2m)
      isPitchedRoof: false,
    };
  }

  // 2) [규칙 2]: 중·저층 상가 및 일반 빌딩 (높이 10m~28m)
  // 외벽: 밝은 화강석/타일 외벽 + 가로형 창문 프레임 + 1층 상가 간판
  // 옥상: 한국 특유의 초록색 우레탄 방수 옥상(#15803d) + 1.2m 옥상 테두리 난간(Parapet)
  if (totalH >= 10.0 && totalH < 28.0) {
    const isPublic = usageType.includes('public') || name.includes('청사') || name.includes('센터');
    return {
      category: isPublic ? 'public' : 'commercial',
      wallFrontSlot: isPublic ? 'public_facility' : 'commercial_mid',
      wallSideSlot: isPublic ? 'public_facility' : 'commercial_mid',
      roofSlot: 'roof_green_urethane', // 한국 특유의 초록색 우레탄 방수 옥상 100%
      hasParapet: true,
      parapetHeight: 1.2, // 1.2m 옥상 테두리 난간
      hasPenthouse: true,
      isPitchedRoof: false,
    };
  }

  // 3) [규칙 3]: 초고층 타워 (높이 28m 이상 일반/업무 타워)
  if (totalH >= 28.0) {
    const isCurtain = totalH >= 40.0 || rnd < 0.6 || name.includes('타워') || usageType.includes('office');
    return {
      category: isCurtain ? 'curtainwall' : 'commercial',
      wallFrontSlot: isCurtain ? 'curtainwall_high' : 'commercial_mid',
      wallSideSlot: isCurtain ? 'curtainwall_high' : 'commercial_mid',
      roofSlot: 'roof_concrete_cool',
      hasParapet: true,
      parapetHeight: 1.2, // 1.2m 옥상 테두리 난간
      hasPenthouse: true,
      isPitchedRoof: false,
    };
  }

  // 4) [규칙 4]: 저층 주택 및 군부대 시설 (높이 10m 미만)
  // 외벽: 베이지/적벽돌 외벽 + 초록색 방수 지붕 또는 적갈색/청색 박공 경사 지붕
  const isMilitary =
    usageType.includes('military') ||
    usageType.includes('barracks') ||
    name.includes('부대') ||
    name.includes('군') ||
    name.includes('대대') ||
    name.includes('사령부') ||
    name.includes('막사');

  const isPitched = !isMilitary && (rnd >= 0.55 || usageType.includes('house'));
  let roofSlot: AtlasSlot = 'roof_green_urethane'; // 기본 초록색 방수 지붕
  if (isPitched) {
    roofSlot = rnd < 0.75 ? 'roof_brown_shingle' : 'roof_blue_zinc'; // 적갈색 슁글 또는 청색 징크
  }

  return {
    category: isMilitary ? 'military' : 'villa',
    wallFrontSlot: isMilitary ? 'public_facility' : 'villa_residential',
    wallSideSlot: isMilitary ? 'public_facility' : 'villa_residential',
    roofSlot,
    hasParapet: !isPitched,
    parapetHeight: 1.2, // 1.2m 옥상 테두리 난간
    hasPenthouse: false,
    isPitchedRoof: isPitched,
  };
}
