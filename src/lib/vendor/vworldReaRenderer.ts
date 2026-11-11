/**
 * src/lib/vendor/vworldReaRenderer.ts
 *
 * [GeoBrief 3D 2단계: V-World 3D 엔진 역공학(REA) 벤더링]
 * 강원 18개 시·군 정위치 건물에 서울 V-World급 5단 입체 구조 및 16종 실사 아틀라스 적용
 *
 * 1. [2-1] 강원 18개 시·군 건물 규모·용도별 정밀 층고 산출:
 *    - 브이월드 LT_C_SPBD 및 건축물대장의 실제 지상층수(gro_flo_co * 3.2m) 최우선 반영
 *    - 층수 미상 건물은 폴리곤 바닥 면적(area)에 따라 강원 전역 일관 높이 부여:
 *      1) 단독주택·다세대 빌라·농어촌 주택 (30㎡ <= area < 220㎡): 6.5m ~ 10.5m (2층 ~ 3층)
 *         -> 좌측 하단 시가지 0m 바닥 눌림 및 비정상 고층 튐 원천 방지
 *      2) 시·군 중심 상가·근린생활·원룸 (220㎡ <= area < 600㎡): 12m ~ 21m (4층 ~ 6층)
 *      3) 도청·시청·군청·혁신도시 공공청사(석탄공사·심평원·건보공단 등)·학교·병원 (area >= 600㎡ 비주거): 16m ~ 45m (4층 ~ 14층)
 *      4) 아파트 단지 (apartments 또는 단지 내 판상형/ㄱ자형/타워형 주거동): 45m ~ 75m (15층 ~ 25층)
 *      5) 비건물 제외: 면적 4,500㎡ 초과 단일 구획(운동장, 공원, 대형 필지 전체) 및 폭 5m 미만 도로/옹벽 폴리곤 압출 제외
 *
 * 2. [2-2] 단일 재질 통일 해체 — geometry.addGroup 기반 16종 독립 실사 Material & 5단 입체 파츠:
 *    - 앱 최초 로드 시 1회 생성되어 전역 캐싱되는 16종 고해상도(1024x1024) CanvasTexture & MeshLambertMaterial 배열(GLOBAL_VWORLD_MATERIALS[0..15])
 *    - 아파트 단지 (Mat 0~4): 밝은 순백색(#f8fafc), 크림 아이보리(#f4f1ea), 실버 그레이(#e2e8f0) 외벽
 *      + 촘촘한 다크 차콜(#1e293b) 발코니 유리창 격자와 백색 창틀 + 하단 3개 층 화강석 기단부 투톤 도색
 *      + 양옆 좁은 측벽(Side Wall) 창문 없는 화이트 벽면에 청록/블루/브라운 수직 브랜드 라인
 *    - 시내 상가·오피스 빌딩 (Mat 5~9): 1층(0~3.8m) 어두운 화강석 쇼윈도 기단부
 *      + 1~3층 창문 아래 빨강·파랑·노랑·초록·흰색 한국형 가로 간판 패치
 *      + 베이지 화강석(#d6cfc2), 붉은 적벽돌(#7f1d1d), 다크 차콜 메탈(#334155) 외벽
 *    - 공공청사·관공서·학교 (Mat 10~12): 화강석 포디움
 *      + 다크 에메랄드/스카이블루(#0f766e ~ #0284c7) 반사 유리 커튼월과 알루미늄 멀리언 프레임
 *      + 살구색/오렌지 테라코타(#d97742) 학교 교사동
 *    - 단독주택·빌라 (Mat 13~15): 적벽돌(#7c2d12), 황토벽돌(#9a3412), 밝은 스타코(#f5f5f4) 외벽과 백색 창틀
 *    - 입체 옥상(윗면) 난간(Parapet) & 4종 지붕 분리:
 *      * 높이 0.85m 회백색 콘크리트 테두리 난간(Parapet, Mat 20)
 *      * 난간 안쪽 옥상 바닥 4종 분리:
 *        ① 한국형 초록색/에메랄드 우레탄 방수 옥상 (#2d6a4f, #3b7a57 — 상가·빌라 50%, Mat 16)
 *        ② 밝은 시멘트 회색 슬래브 (#94a3b8 + 중앙 높이 3m 엘리베이터 옥탑방 박스 — 아파트·빌딩 30%, Mat 17)
 *        ③ 3D 경사 박공지붕 + 적갈색 기와 (#7c2d12 — 주택·학교 15%, Mat 18)
 *        ④ 코발트 블루 강판 (#1d4ed8 — 창고·공장 5%, Mat 19)
 *      * 높이 3.0m 옥탑 엘리베이터 권상기실 (Penthouse Box, Mat 21)
 */

import * as THREE from 'three';
import earcut from 'earcut';
import maplibregl from 'maplibre-gl';
import {
  gpuBuildingBaseExpr,
  BUILDING_HEIGHT_EXPR,
} from '@/utils/gpuRealisticBuildingStack';
import { VworldMasterEngine } from './vworldMasterEngine';

const Earcut = (earcut as any).default || earcut;

export interface Point2D {
  x: number;
  z: number;
}

export interface VWorldReaBuildingStyle {
  slot: number; // 0..15
  category: 'apartment' | 'commercial' | 'public' | 'residential' | 'industrial';
  height: number;
  levels: number;
  roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc';
  roofMaterialIndex: number; // 0..3 (Mat 16..19)
  isApartment: boolean;
  parapetHeight: number; // 0.85m
  penthouseHeight: number; // 3.0m
  hasPenthouse: boolean;
}

export interface BuildVWorldReaMeshOptions {
  pts2D: Point2D[];
  baseElev: number;
  height?: number;
  seed?: number;
  featProps?: Record<string, any>;
  holeIndices?: number[];
  innerRings2D?: Point2D[][];
  areaSqm?: number;
  minWidth?: number;
  coordsLngLat?: [number, number];
}

// =============================================================================
// [1] 전역 싱글톤 16종 독립 Material & 4종 지붕 & 난간 & 옥탑방 캐시
// =============================================================================

export let GLOBAL_VWORLD_MATERIALS: THREE.MeshLambertMaterial[] | null = null;
export let GLOBAL_VWORLD_ROOF_MATERIALS: THREE.MeshLambertMaterial[] | null = null;
export let GLOBAL_VWORLD_PARAPET_MATERIAL: THREE.MeshLambertMaterial | null = null;
export let GLOBAL_VWORLD_PENTHOUSE_MATERIAL: THREE.MeshLambertMaterial | null = null;
export let GLOBAL_ALL_VWORLD_REA_MATERIALS: THREE.MeshLambertMaterial[] | null = null;

/**
 * 1024x1024 고해상도 CanvasTexture 생성 헬퍼
 */
function createProceduralCanvasTexture(
  drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    const fallbackCanvas = { width: 1024, height: 1024 };
    const tex = new THREE.CanvasTexture(fallbackCanvas as any);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawFn(ctx, 1024, 1024);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// -----------------------------------------------------------------------------
// [1-1] 16종 서울 V-World 실사 텍스처 드로잉 팩토리
// -----------------------------------------------------------------------------

function drawApartmentFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // Base Wall Colors: 순백색(#f8fafc), 크림 아이보리(#f4f1ea), 실버 그레이(#e2e8f0), 모던 쿨그레이(#f1f5f9), 소프트 웜그레이(#e7e5e4)
  const baseColors = ['#f8fafc', '#f4f1ea', '#e2e8f0', '#f1f5f9', '#e7e5e4'];
  const baseColor = baseColors[variant % baseColors.length];

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  // 전면/배면 메인 창호 영역 (0 ~ w - 80px)
  const mainW = w - 80;

  // 하단 3개 층 (0 ~ 3.8m, 캔버스 하단 260px) 화강석/브라운 기단부 투톤 도색
  const podiumColors = ['#44403c', '#57534e', '#3f3f46', '#475569', '#78350f'];
  ctx.fillStyle = podiumColors[variant % podiumColors.length];
  ctx.fillRect(0, h - 260, mainW, 260);

  // 기단부 상단 띠선
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, h - 268, mainW, 8);

  // 촘촘한 다크 차콜(#1e293b) 발코니 유리창 격자 + 백색 창틀
  const cols = 7;
  const rows = 12;
  const cellW = mainW / cols;
  const cellH = (h - 280) / rows;

  for (let r = 0; r < rows; r++) {
    const y = r * cellH + 15;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 10;
      const winW = cellW - 20;
      const winH = cellH - 20;

      // 순백색 외부 창틀
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2, y - 2, winW + 4, winH + 4);

      // 다크 차콜 발코니 유리창
      const grad = ctx.createLinearGradient(x, y, x, y + winH);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e293b');
      grad.addColorStop(1, '#334155');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, winW, winH);

      // 발코니 하단 안전 난간 살 (Silver White)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.5;
      const railY = y + winH * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, railY);
      ctx.lineTo(x + winW, railY);
      ctx.stroke();

      for (let s = x + 8; s < x + winW; s += 10) {
        ctx.beginPath();
        ctx.moveTo(s, railY);
        ctx.lineTo(s, y + winH);
        ctx.stroke();
      }
    }
  }

  // 아파트 양옆 좁은 측벽(Side Wall) 무창 영역 (w - 80 ~ w):
  // 창문 없는 순백색/아이보리 콘크리트 외벽 + 청록/블루/브라운 수직 브랜드 라인
  const sideStartX = w - 80;
  ctx.fillStyle = baseColor;
  ctx.fillRect(sideStartX, 0, 80, h);

  // 미세한 콘크리트 패널 줄눈
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  for (let y = 0; y < h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(sideStartX, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // 수직 브랜드 악센트 컬러 띠
  const brandColors = ['#0284c7', '#10b981', '#78350f', '#0f766e', '#1e3a5f'];
  ctx.fillStyle = brandColors[variant % brandColors.length];
  ctx.fillRect(sideStartX + 24, 0, 32, h);

  // 브랜드 엠블럼 백색 사각 포인트
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sideStartX + 28, 80, 24, 160);
  ctx.fillStyle = brandColors[variant % brandColors.length];
  ctx.fillRect(sideStartX + 34, 110, 12, 100);
}

function drawPublicHQFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // [Mat 5~8]: 혁신도시 공공청사·관공서·학교·오피스 (4종)
  // 밝은 화강석 포디움(1~2층) + 은청색/스카이블루(#38bdf8 ~ #0284c7) 및 에메랄드 반사 유리 커튼월 + 은백색 알루미늄 멀리언 격자 프레임
  const glassThemes = [
    { start: '#042f2e', mid: '#0f766e', end: '#14b8a6' }, // 0: Emerald Reflective Glass
    { start: '#082f49', mid: '#0284c7', end: '#38bdf8' }, // 1: Sky Blue Reflective Glass
    { start: '#0c4a6e', mid: '#0369a1', end: '#7dd3fc' }, // 2: Cyan / Silver Blue Glass
    { start: '#064e3b', mid: '#059669', end: '#34d399' }, // 3: Vivid Emerald Glass
  ];
  const glassTheme = glassThemes[variant % glassThemes.length];

  const curtainH = h * 0.78;
  const grad = ctx.createLinearGradient(0, 0, w, curtainH);
  grad.addColorStop(0, glassTheme.start);
  grad.addColorStop(0.5, glassTheme.mid);
  grad.addColorStop(1, glassTheme.end);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, curtainH);

  // 은백색 알루미늄 멀리언 수직/수평 격자 프레임
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.95)';
  ctx.lineWidth = 2.5;

  const mullionSpacing = w / 16;
  for (let x = 0; x <= w; x += mullionSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, curtainH);
    ctx.stroke();
  }

  const transomSpacing = curtainH / 14;
  for (let y = 0; y <= curtainH; y += transomSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // 1~2층 (하단 22%) 밝은 화강석 포디움 (시커먼 흑색 완전 배제!)
  const podiumStone = ['#cbd5e1', '#e2e8f0', '#d6cfc2', '#f1f5f9'][variant % 4];
  ctx.fillStyle = podiumStone;
  ctx.fillRect(0, curtainH, w, h - curtainH);

  // 포디움 상단 분리 턱
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, curtainH - 6, w, 8);

  // 포디움 대형 유리 로비 창문
  const lobbies = 6;
  const lobbyW = w / lobbies;
  for (let b = 0; b < lobbies; b++) {
    const lx = b * lobbyW + 14;
    const lw = lobbyW - 28;
    const ly = curtainH + 24;
    const lh = (h - curtainH) - 40;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(lx, ly, lw, lh);

    // 로비 온백색 내부 조명 반사
    ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
    ctx.fillRect(lx + 4, ly + 4, lw - 8, lh * 0.45);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx, ly, lw, lh);
  }
}

function drawCommercialFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // [Mat 9~12]: 시내 상가·근린생활 (4종)
  // Base: 차분한 베이지 화강석(#d6cfc2), 짙은 적벽돌(#7f1d1d), 차콜 메탈(#334155), 브라운 파벽돌(#78350f)
  const wallColors = ['#d6cfc2', '#7f1d1d', '#334155', '#78350f'];
  ctx.fillStyle = wallColors[variant % wallColors.length];
  ctx.fillRect(0, 0, w, h);

  // 1층 (0 ~ 3.8m, 캔버스 하단 300px) 화강석 쇼윈도 기단부
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, h - 300, w, 300);

  // 1층 매장 통유리 쇼윈도 & 내부 온백색 조명 반사
  const shops = 4;
  const shopW = w / shops;
  for (let s = 0; s < shops; s++) {
    const sx = s * shopW + 16;
    const sy = h - 250;
    const sw = shopW - 32;
    const sh = 220;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(sx, sy, sw, sh);

    ctx.fillStyle = 'rgba(254, 240, 138, 0.55)';
    ctx.fillRect(sx + 4, sy + 4, sw - 8, sh * 0.4);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, sy, sw, sh);
  }

  // 1~3층 창문 아래 한국형 가로 간판 패치 (빨강, 파랑, 노랑, 초록, 흰색)
  const signboardColors = ['#dc2626', '#2563eb', '#eab308', '#16a34a', '#f8fafc'];
  const signboardH = 50;
  const signY = h - 300;

  for (let s = 0; s < shops; s++) {
    const sx = s * shopW + 16;
    const sw = shopW - 32;
    const colorIdx = (s + variant) % signboardColors.length;
    ctx.fillStyle = signboardColors[colorIdx];
    ctx.fillRect(sx, signY, sw, signboardH);

    // 간판 백색 텍스트 엠블럼 바
    ctx.fillStyle = colorIdx === 2 ? '#0f172a' : '#ffffff';
    ctx.fillRect(sx + 20, signY + 16, sw - 40, 16);
  }

  // 2층 이상 기준층 오피스 창문 격자
  const cols = 6;
  const rows = 7;
  const cellW = w / cols;
  const cellH = (h - 330) / rows;

  for (let r = 0; r < rows; r++) {
    const y = r * cellH + 20;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 16;
      const winW = cellW - 32;
      const winH = cellH - 24;

      ctx.fillStyle = '#0284c7';
      ctx.fillRect(x, y, winW, winH);

      // 알루미늄 샤시
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, winW, winH);
    }
  }
}

function drawVillaResidentialFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // [Mat 13~15]: 단독주택·빌라·학교 (3종)
  // 13: 적벽돌(#7c2d12), 14: 황토벽돌(#854d0e), 15: 살구색/테라코타 학교 교사동(#d97742)
  const brickThemes = [
    { base: '#7c2d12', mortar: '#d6d3d1' },
    { base: '#854d0e', mortar: '#e7e5e4' },
    { base: '#d97742', mortar: '#fed7aa' },
  ];
  const theme = brickThemes[variant % brickThemes.length];

  ctx.fillStyle = theme.mortar;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = theme.base;
  const bW = 42;
  const bH = 19;
  for (let y = 0; y < h; y += bH + 2) {
    const offset = (Math.floor(y / bH) % 2) * (bW / 2);
    for (let x = -offset; x < w; x += bW + 2) {
      ctx.fillRect(x, y, bW, bH);
    }
  }

  // 백색 창틀 + 다크 차콜 창문
  const cols = 5;
  const rows = 4;
  const cellW = w / cols;
  const cellH = h / rows;

  for (let r = 0; r < rows; r++) {
    const y = r * cellH + 30;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 25;
      const winW = cellW - 50;
      const winH = cellH - 60;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 5, y - 5, winW + 10, winH + 10);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, y, winW, winH);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + winW / 2, y);
      ctx.lineTo(x + winW / 2, y + winH);
      ctx.moveTo(x, y + winH / 2);
      ctx.lineTo(x + winW, y + winH / 2);
      ctx.stroke();
    }
  }
}

// -----------------------------------------------------------------------------
// [1-2] 4종 실사 옥상 & 난간 & 옥탑방 텍스처 드로잉
// -----------------------------------------------------------------------------

function drawUrethaneGreenRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // ① 차분한 세이지 / 다크 우레탄 그린 (#2d6a4f, #3a5a40)
  ctx.fillStyle = '#2d6a4f';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#3a5a40';
  for (let y = 0; y < h; y += 128) {
    for (let x = 0; x < w; x += 128) {
      if ((x + y) % 256 === 0) {
        ctx.fillRect(x, y, 128, 128);
      }
    }
  }

  // 우레탄 줄눈(방수 팽창 줄눈)
  ctx.strokeStyle = '#1e4835';
  ctx.lineWidth = 4;
  for (let x = 0; x <= w; x += 256) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 256) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawConcreteSlabRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // ② 밝은 시멘트/콘크리트 회색 슬래브 (#94a3b8, #cbd5e1)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#cbd5e1';
  for (let y = 0; y < h; y += 128) {
    for (let x = 0; x < w; x += 128) {
      if ((x + y) % 256 === 0) {
        ctx.fillRect(x, y, 128, 128);
      }
    }
  }

  // 콘크리트 슬래브 줄눈
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  for (let x = 0; x <= w; x += 256) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 256) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawTerracottaTileRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // ③ 차분한 적갈색 / 다크브라운 기와 (#6c3428, #5c2c20)
  ctx.fillStyle = '#6c3428';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#5c2c20';
  ctx.lineWidth = 6;
  const tileSpacing = 48;
  for (let y = 0; y < h; y += tileSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, y, w, 8);
  }
}

function drawCobaltSteelRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // ④ 코발트 블루 강판 (#1e40af, #1d4ed8)
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1e40af';
  const seamW = 32;
  for (let x = 0; x < w; x += seamW * 2) {
    ctx.fillRect(x, 0, seamW, h);
  }

  ctx.strokeStyle = '#172554';
  ctx.lineWidth = 3;
  for (let x = 0; x <= w; x += seamW) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

function drawParapetConcrete(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 0.85m 회백색 콘크리트 테두리 난간 (#cbd5e1, #94a3b8)
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 4;
  for (let y = 0; y < h; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPenthouseLouver(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 3m 엘리베이터 옥탑방 권상기실 외벽 및 루버 (#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(80, 80, w - 160, h - 160);

  ctx.fillStyle = '#cbd5e1';
  for (let y = 100; y < h - 100; y += 24) {
    ctx.fillRect(100, y, w - 200, 10);
  }
}

// =============================================================================
// [2] 16종 독립 Material 싱글톤 캐시 초기화 함수
// =============================================================================

export function getGlobalVWorldMaterials(): THREE.MeshLambertMaterial[] {
  if (GLOBAL_VWORLD_MATERIALS && GLOBAL_VWORLD_MATERIALS.length === 16) {
    return GLOBAL_VWORLD_MATERIALS;
  }

  const materials: THREE.MeshLambertMaterial[] = [];

  // Mat 0~4: 아파트 단지 (5종) - 밝은 순백색(#f8fafc), 크림 아이보리(#f4f1ea), 라이트 웜그레이(#e2e8f0) + 촘촘한 다크 차콜 발코니 유리창 격자와 백색 창틀 + 하단 3개 층 화강석 기단부 투톤 + 측벽 무창 브랜드 라인
  for (let i = 0; i < 5; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawApartmentFacade(ctx, w, h, i));
    materials.push(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, color: 0xffffff }));
  }

  // Mat 5~8: 공공청사·관공서·오피스 (4종) - 화강석 포디움(1~2층) + 밝은 스카이블루(#38bdf8 ~ #0284c7)/에메랄드 반사 유리 커튼월과 은백색 알루미늄 멀리언 프레임
  for (let i = 0; i < 4; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawPublicHQFacade(ctx, w, h, i));
    materials.push(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, color: 0xffffff }));
  }

  // Mat 9~12: 시내 상가·근린생활 (4종) - 1층 통유리 쇼윈도 + 1~3층 한국형 가로 간판 패치(빨강, 파랑, 노랑, 초록, 흰색) + 베이지 화강석(#d6cfc2), 적벽돌(#7f1d1d), 차콜 메탈(#334155) 외벽
  for (let i = 0; i < 4; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawCommercialFacade(ctx, w, h, i));
    materials.push(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, color: 0xffffff }));
  }

  // Mat 13~15: 단독주택·빌라·학교 (3종) - 차분한 적벽돌(#7c2d12), 황토벽돌(#854d0e), 살구색/테라코타 학교 교사동(#d97742)
  for (let i = 0; i < 3; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawVillaResidentialFacade(ctx, w, h, i));
    materials.push(new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, color: 0xffffff }));
  }

  GLOBAL_VWORLD_MATERIALS = materials;
  return GLOBAL_VWORLD_MATERIALS;
}

export function getGlobalVWorldRoofMaterials(): THREE.MeshLambertMaterial[] {
  if (GLOBAL_VWORLD_ROOF_MATERIALS && GLOBAL_VWORLD_ROOF_MATERIALS.length === 4) {
    return GLOBAL_VWORLD_ROOF_MATERIALS;
  }

  GLOBAL_VWORLD_ROOF_MATERIALS = [
    // 0: 한국형 초록색 우레탄 방수 옥상 (#2d6a4f, #3b7a57 — 상가·빌라 45%) (Mat 16)
    new THREE.MeshLambertMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawUrethaneGreenRoof(ctx, w, h)),
      side: THREE.DoubleSide,
      color: 0xffffff,
    }),
    // 1: 밝은 시멘트 회색 슬래브 (#94a3b8 + 중앙 3m 엘리베이터 옥탑방 — 아파트·청사 35%) (Mat 17)
    new THREE.MeshLambertMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawConcreteSlabRoof(ctx, w, h)),
      side: THREE.DoubleSide,
      color: 0xffffff,
    }),
    // 2: 3D 경사 박공지붕 + 적갈색 기와 (#6c3428 — 주택·학교 15%) (Mat 18)
    new THREE.MeshLambertMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawTerracottaTileRoof(ctx, w, h)),
      side: THREE.DoubleSide,
      color: 0xffffff,
    }),
    // 3: 코발트 블루 강판 (#1d4ed8 — 5%) (Mat 19)
    new THREE.MeshLambertMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawCobaltSteelRoof(ctx, w, h)),
      side: THREE.DoubleSide,
      color: 0xffffff,
    }),
  ];

  return GLOBAL_VWORLD_ROOF_MATERIALS;
}

export function getGlobalParapetMaterial(): THREE.MeshLambertMaterial {
  if (!GLOBAL_VWORLD_PARAPET_MATERIAL) {
    GLOBAL_VWORLD_PARAPET_MATERIAL = new THREE.MeshLambertMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawParapetConcrete(ctx, w, h)),
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
  }
  return GLOBAL_VWORLD_PARAPET_MATERIAL;
}

export function getGlobalPenthouseMaterial(): THREE.MeshLambertMaterial {
  if (!GLOBAL_VWORLD_PENTHOUSE_MATERIAL) {
    GLOBAL_VWORLD_PENTHOUSE_MATERIAL = new THREE.MeshLambertMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawPenthouseLouver(ctx, w, h)),
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
  }
  return GLOBAL_VWORLD_PENTHOUSE_MATERIAL;
}

/**
 * 22개 전체 Material 슬롯 일괄 반환 (geometry.addGroup 바인딩용)
 * - 0..15: 16종 외벽 Material
 * - 16..19: 4종 지붕 Material
 * - 20: 0.85m 테두리 난간(Parapet)
 * - 21: 3.0m 옥탑 권상기실(Penthouse)
 */
export function getGlobalAllMaterialsArray(): THREE.MeshLambertMaterial[] {
  if (GLOBAL_ALL_VWORLD_REA_MATERIALS && GLOBAL_ALL_VWORLD_REA_MATERIALS.length === 22) {
    return GLOBAL_ALL_VWORLD_REA_MATERIALS;
  }

  const walls = getGlobalVWorldMaterials();
  const roofs = getGlobalVWorldRoofMaterials();
  const parapet = getGlobalParapetMaterial();
  const penthouse = getGlobalPenthouseMaterial();

  GLOBAL_ALL_VWORLD_REA_MATERIALS = [...walls, ...roofs, parapet, penthouse];
  return GLOBAL_ALL_VWORLD_REA_MATERIALS;
}

// =============================================================================
// [3] 강원 18개 시·군 건물 규모·용도별 정밀 층고 산출 엔진 (지시사항 [2-1])
// =============================================================================

export function calculateVWorldPreciseBuildingHeight(
  featProps: Record<string, any> = {},
  areaSqm: number = 150,
  minWidth: number = 10,
  seed: number = 0,
  _coordsLngLat?: [number, number]
): number {
  // [규격 5: 비건물 단일 구획 면적 > 3,800㎡ 및 폭 < 4.5m 제외]
  if (
    featProps.is_site_boundary === true ||
    featProps.is_non_building === true ||
    featProps.layer_type === 'cadastral' ||
    featProps.layer_type === 'zoning' ||
    featProps.layer_type === 'landuse' ||
    featProps.building === 'no' ||
    featProps.jimok === '임' ||
    featProps.jimok === '임야' ||
    featProps.natural === 'wood' ||
    featProps.natural === 'water' ||
    areaSqm > 3800.0 ||
    areaSqm < 30.0 ||
    minWidth < 4.5
  ) {
    return 0;
  }

  // 1) 국토부 브이월드 LT_C_SPBD 및 건축물대장의 실제 지상층수(gro_flo_co * 3.1m) 최우선 반영
  const rawFlr = Number(
    featProps.gro_flo_co ||
    featProps.grnd_flr ||
    featProps.levels ||
    featProps.FLR_CNT ||
    featProps['building:levels'] ||
    0
  );
  const rawH = Number(featProps.height || featProps.bd_hgt || featProps.hei || 0);

  if (rawFlr > 0) {
    return Math.max(6.5, rawFlr * 3.1);
  }
  if (rawH >= 4.0) {
    return rawH;
  }

  // 2) 층수 미상 건물: 폴리곤 바닥 면적(areaSqm)에 따라 강원 전역 실제 도시 비례 높이 부여
  const isApt = Boolean(
    featProps.usageType === 'apartment' ||
    featProps.bld_category === 'apartment' ||
    featProps.class === 'apartments' ||
    featProps.building === 'apartments' ||
    String(featProps.name || featProps.buld_nm || '').includes('아파트') ||
    areaSqm >= 2000.0
  );

  // 4) 아파트 단지 (15층 ~ 25층): 45.0m ~ 75.0m
  if (isApt && areaSqm >= 220) {
    return 45.0 + (Math.abs(seed) % 31) * 1.0;
  }

  // 1) 단독주택·빌라·농가 (30㎡ <= area < 220㎡): 6.5m ~ 10.0m (2~3층)
  if (areaSqm < 220 || minWidth < 7.5) {
    return 6.5 + (Math.abs(seed) % 36) * 0.1; // 6.5m ~ 10.0m
  }

  // 2) 시내 중심 상가·근린생활 (220㎡ <= area < 600㎡): 12.0m ~ 20.0m (4~6층)
  if (areaSqm >= 220 && areaSqm < 600) {
    return 12.0 + (Math.abs(seed) % 9) * 1.0; // 12.0m ~ 20.0m
  }

  // 3) 공공청사(혁신도시 심평원·건보공단·석탄공사 등)·시군청·학교·병원 (600㎡ <= area <= 3,800㎡ 비주거): 16.0m ~ 42.0m (4~13층)
  return 16.0 + (Math.abs(seed) % 27) * 1.0; // 16.0m ~ 42.0m
}

// -----------------------------------------------------------------------------
// [3-1] 건축 스타일 및 머티리얼 슬롯 분류 함수
// -----------------------------------------------------------------------------

export function classifyVWorldReaStyle(
  featProps: Record<string, any> = {},
  seed: number = 0,
  areaSqm: number = 150,
  height: number = 10,
  coordsLngLat?: [number, number]
): VWorldReaBuildingStyle {
  const isApt = Boolean(
    featProps.usageType === 'apartment' ||
    featProps.bld_category === 'apartment' ||
    featProps.class === 'apartments' ||
    featProps.building === 'apartments' ||
    String(featProps.name || featProps.buld_nm || '').includes('아파트') ||
    areaSqm >= 2000.0 ||
    height >= 38.0
  );

  const rawUse = String(
    featProps.usageType ||
    featProps.bld_category ||
    featProps.class ||
    featProps.building ||
    featProps.main_purps_cd_nm ||
    ''
  ).toLowerCase();

  const cLng = coordsLngLat ? coordsLngLat[0] : Number(featProps.centerLng || featProps.lng || 0);
  const cLat = coordsLngLat ? coordsLngLat[1] : Number(featProps.centerLat || featProps.lat || 0);
  const isBangokZone = cLng > 0 && cLat > 0 && VworldMasterEngine.isBangokInnovationZone(cLng, cLat);

  // [혁신도시 공공청사·관공서·학교·오피스 (Mat 5~8)]: 밝은 화강석 포디움 + 에메랄드/스카이블루 커튼월
  const isPublic =
    !isApt &&
    ((isBangokZone && (areaSqm >= 220 || height >= 14.0)) ||
      (areaSqm >= 600 &&
        (rawUse.includes('public') ||
          rawUse.includes('government') ||
          rawUse.includes('hospital') ||
          rawUse.includes('office') ||
          rawUse.includes('civic') ||
          String(featProps.name || featProps.buld_nm || '').includes('청사') ||
          String(featProps.name || featProps.buld_nm || '').includes('공단') ||
          String(featProps.name || featProps.buld_nm || '').includes('공사') ||
          String(featProps.name || featProps.buld_nm || '').includes('병원') ||
          String(featProps.name || featProps.buld_nm || '').includes('학교'))));

  // [시내 상가·근린생활 (Mat 9~12)]: 쇼윈도 기단부 + 한국형 가로 간판
  const isCommercial =
    !isApt &&
    !isPublic &&
    (rawUse.includes('commercial') ||
      rawUse.includes('retail') ||
      (areaSqm >= 220 && areaSqm < 600));

  let slot = 0;
  let category: VWorldReaBuildingStyle['category'] = 'residential';
  let roofType: VWorldReaBuildingStyle['roofType'] = 'concrete';
  let roofMaterialIndex = 1; // 1: 시멘트 슬래브 (Mat 17)

  if (isApt) {
    category = 'apartment';
    slot = Math.abs(seed) % 5; // Mat 0~4: 아파트 단지 (5종)
    // 아파트 옥상: 65% 밝은 시멘트 슬래브(Mat 17) + 35% 우레탄 방수 초록(Mat 16)
    roofType = (Math.abs(seed) % 100) < 65 ? 'concrete' : 'urethane';
    roofMaterialIndex = roofType === 'concrete' ? 1 : 0;
  } else if (isPublic) {
    category = 'public';
    // 혁신도시 및 공공청사: Mat 5~8 (4종 에메랄드/스카이블루/시안 커튼월)
    slot = 5 + (Math.abs(seed) % 4); // Mat 5~8
    // 공공기관: 75% 콘크리트 슬래브(Mat 17) + 25% 우레탄 초록(Mat 16)
    roofType = (Math.abs(seed) % 100) < 75 ? 'concrete' : 'urethane';
    roofMaterialIndex = roofType === 'concrete' ? 1 : 0;
  } else if (isCommercial) {
    category = 'commercial';
    // 시내 상가·근린생활: Mat 9~12 (4종 베이지 화강석, 적벽돌, 다크 차콜 메탈, 브라운 파벽돌)
    slot = 9 + (Math.abs(seed) % 4); // Mat 9~12
    // 상가: 70% 우레탄 방수 초록(Mat 16) + 30% 콘크리트 슬래브(Mat 17)
    roofType = (Math.abs(seed) % 100) < 70 ? 'urethane' : 'concrete';
    roofMaterialIndex = roofType === 'urethane' ? 0 : 1;
  } else {
    category = 'residential';
    // 단독주택·빌라·학교: Mat 13~15 (3종 적벽돌, 황토벽돌, 살구색/테라코타)
    slot = 13 + (Math.abs(seed) % 3); // Mat 13~15
    // 단독주택·빌라: ① 우레탄 초록(Mat 16 45%), ③ 박공기와(Mat 18 35%), ② 콘크리트 슬래브(Mat 17 15%), ④ 코발트 강판(Mat 19 5%)
    const pick = Math.abs(seed) % 100;
    if (pick < 45) {
      roofType = 'urethane';
      roofMaterialIndex = 0; // Mat 16
    } else if (pick < 80) {
      roofType = 'gabled';
      roofMaterialIndex = 2; // Mat 18
    } else if (pick < 95) {
      roofType = 'concrete';
      roofMaterialIndex = 1; // Mat 17
    } else {
      roofType = 'zinc';
      roofMaterialIndex = 3; // Mat 19
    }
  }

  return {
    slot,
    category,
    height,
    levels: Math.max(1, Math.round(height / 3.1)),
    roofType,
    roofMaterialIndex,
    isApartment: isApt,
    parapetHeight: 0.85,
    penthouseHeight: 3.0,
    hasPenthouse: height >= 12.0 && roofType !== 'gabled',
  };
}

// =============================================================================
// [4] 5단 입체 지오메트리 빌더 (geometry.addGroup 강제 적용 — 지시사항 [2-2])
// =============================================================================

export function buildVWorldRea5PartGeometry(
  options: BuildVWorldReaMeshOptions
): THREE.BufferGeometry {
  const {
    pts2D,
    baseElev,
    seed = 0,
    featProps = {},
    holeIndices,
    areaSqm = 150,
    minWidth = 10,
    coordsLngLat,
  } = options;

  const geometry = new THREE.BufferGeometry();
  if (!pts2D || pts2D.length < 3) return geometry;

  // 1. 정밀 층고 계산
  let finalH = options.height || 0;
  if (finalH <= 0) {
    finalH = calculateVWorldPreciseBuildingHeight(featProps, areaSqm, minWidth, seed, coordsLngLat);
  }
  finalH = Math.max(6.5, finalH);

  // 2. 바운딩 박스
  let minX = pts2D[0].x, maxX = pts2D[0].x;
  let minZ = pts2D[0].z, maxZ = pts2D[0].z;
  for (let i = 1; i < pts2D.length; i++) {
    minX = Math.min(minX, pts2D[i].x);
    maxX = Math.max(maxX, pts2D[i].x);
    minZ = Math.min(minZ, pts2D[i].z);
    maxZ = Math.max(maxZ, pts2D[i].z);
  }

  // 3. 건축 스타일 분류
  const style = classifyVWorldReaStyle(featProps, seed, areaSqm, finalH);

  const topElev = baseElev + finalH;
  const parapetTopElev = topElev + style.parapetHeight; // H + 0.85m

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  geometry.clearGroups();

  function addQuad(
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvBL: [number, number],
    uvBR: [number, number],
    uvTR: [number, number],
    uvTL: [number, number]
  ) {
    positions.push(
      pBL[0], pBL[1], pBL[2],
      pBR[0], pBR[1], pBR[2],
      pTR[0], pTR[1], pTR[2],
      pBL[0], pBL[1], pBL[2],
      pTR[0], pTR[1], pTR[2],
      pTL[0], pTL[1], pTL[2]
    );
    normals.push(
      norm[0], norm[1], norm[2],
      norm[0], norm[1], norm[2],
      norm[0], norm[1], norm[2],
      norm[0], norm[1], norm[2],
      norm[0], norm[1], norm[2],
      norm[0], norm[1], norm[2]
    );
    uvs.push(
      uvBL[0], uvBL[1],
      uvBR[0], uvBR[1],
      uvTR[0], uvTR[1],
      uvBL[0], uvBL[1],
      uvTR[0], uvTR[1],
      uvTL[0], uvTL[1]
    );
  }

  // ---------------------------------------------------------------------------
  // [Part 1 & 2: 본동 외벽 (0 ~ H) — geometry.addGroup(start, count, style.slot)]
  // ---------------------------------------------------------------------------
  const startVertexMain = positions.length / 3;
  const n = pts2D.length;

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const p1 = pts2D[i];
    const p2 = pts2D[next];

    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const edgeLen = Math.hypot(dx, dz);
    if (edgeLen < 0.001) continue;

    const nx = -dz / edgeLen;
    const nz = dx / edgeLen;

    const uRepeat = edgeLen / 3.4;
    const vRepeat = finalH / 3.1;

    addQuad(
      [p1.x, baseElev, p1.z],
      [p2.x, baseElev, p2.z],
      [p2.x, topElev, p2.z],
      [p1.x, topElev, p1.z],
      [nx, 0, nz],
      [0, 0],
      [uRepeat, 0],
      [uRepeat, vRepeat],
      [0, vRepeat]
    );
  }

  const countVertexMain = positions.length / 3 - startVertexMain;
  if (countVertexMain > 0) {
    geometry.addGroup(startVertexMain, countVertexMain, style.slot); // Mat 0..15
  }

  // ---------------------------------------------------------------------------
  // [Part 3: 0.85m 회백색 콘크리트 테두리 난간(Parapet Wall, H ~ H + 0.85m)]
  // Material Index = 20 (Parapet Slot)
  // ---------------------------------------------------------------------------
  const startVertexParapet = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const p1 = pts2D[i];
    const p2 = pts2D[next];

    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const edgeLen = Math.hypot(dx, dz);
    if (edgeLen < 0.001) continue;

    const nx = -dz / edgeLen;
    const nz = dx / edgeLen;

    const uRepeat = edgeLen / 2.0;
    const vRepeat = style.parapetHeight / 0.85;

    // 외측 난간벽
    addQuad(
      [p1.x, topElev, p1.z],
      [p2.x, topElev, p2.z],
      [p2.x, parapetTopElev, p2.z],
      [p1.x, parapetTopElev, p1.z],
      [nx, 0, nz],
      [0, 0],
      [uRepeat, 0],
      [uRepeat, vRepeat],
      [0, vRepeat]
    );
  }

  const countVertexParapet = positions.length / 3 - startVertexParapet;
  if (countVertexParapet > 0) {
    geometry.addGroup(startVertexParapet, countVertexParapet, 20); // Mat 20: Parapet
  }

  // ---------------------------------------------------------------------------
  // [Part 4: 4종 실사 옥상 바닥 (H)]
  // Material Index = 16 + roofMaterialIndex (Mat 16, 17, 18, 19)
  // ---------------------------------------------------------------------------
  const startVertexRoof = positions.length / 3;
  const flatCoords: number[] = [];
  for (let i = 0; i < pts2D.length; i++) {
    flatCoords.push(pts2D[i].x, pts2D[i].z);
  }

  try {
    const triangles = Earcut(flatCoords, holeIndices, 2);
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);

    for (let t = 0; t < triangles.length; t += 3) {
      const idxA = triangles[t];
      const idxB = triangles[t + 1];
      const idxC = triangles[t + 2];

      const pA = pts2D[idxA];
      const pB = pts2D[idxB];
      const pC = pts2D[idxC];

      if (!pA || !pB || !pC) continue;

      positions.push(
        pA.x, topElev, pA.z,
        pB.x, topElev, pB.z,
        pC.x, topElev, pC.z
      );
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);

      uvs.push(
        (pA.x - minX) / spanX, (pA.z - minZ) / spanZ,
        (pB.x - minX) / spanX, (pB.z - minZ) / spanZ,
        (pC.x - minX) / spanX, (pC.z - minZ) / spanZ
      );
    }
  } catch {}

  const countVertexRoof = positions.length / 3 - startVertexRoof;
  if (countVertexRoof > 0) {
    const roofSlot = 16 + style.roofMaterialIndex; // 16, 17, 18, 19
    geometry.addGroup(startVertexRoof, countVertexRoof, roofSlot);
  }

  // ---------------------------------------------------------------------------
  // [Part 5: 4층 이상 (H >= 12m) 옥탑 엘리베이터 권상기실 (Penthouse Box)]
  // Material Index = 21 (Penthouse Slot)
  // ---------------------------------------------------------------------------
  if (style.hasPenthouse) {
    const startVertexPenthouse = positions.length / 3;
    const cX = (minX + maxX) / 2;
    const cZ = (minZ + maxZ) / 2;
    const halfW = Math.min(3.5, (maxX - minX) * 0.22);
    const halfD = Math.min(3.5, (maxZ - minZ) * 0.22);
    const pentH = 3.0;
    const pBottom = topElev;
    const pTop = topElev + pentH;

    const pBoxPts = [
      { x: cX - halfW, z: cZ - halfD },
      { x: cX + halfW, z: cZ - halfD },
      { x: cX + halfW, z: cZ + halfD },
      { x: cX - halfW, z: cZ + halfD },
    ];

    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const pA = pBoxPts[i];
      const pB = pBoxPts[next];

      addQuad(
        [pA.x, pBottom, pA.z],
        [pB.x, pBottom, pB.z],
        [pB.x, pTop, pB.z],
        [pA.x, pTop, pA.z],
        [0, 0, 1],
        [0, 0], [1, 0], [1, 1], [0, 1]
      );
    }

    // Penthouse Roof
    positions.push(
      pBoxPts[0].x, pTop, pBoxPts[0].z,
      pBoxPts[1].x, pTop, pBoxPts[1].z,
      pBoxPts[2].x, pTop, pBoxPts[2].z,
      pBoxPts[0].x, pTop, pBoxPts[0].z,
      pBoxPts[2].x, pTop, pBoxPts[2].z,
      pBoxPts[3].x, pTop, pBoxPts[3].z
    );
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);

    const countVertexPenthouse = positions.length / 3 - startVertexPenthouse;
    if (countVertexPenthouse > 0) {
      geometry.addGroup(startVertexPenthouse, countVertexPenthouse, 21); // Mat 21
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();

  return geometry;
}

// =============================================================================
// [5] 밝은 서울식 주광 조명 시스템
// =============================================================================

export function setupSeoulDaylightLighting(scene: THREE.Scene): {
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  directionalLight: THREE.DirectionalLight;
} {
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.0);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.45);

  directionalLight.position.set(200, 450, 150);

  scene.add(ambientLight);
  scene.add(hemisphereLight);
  scene.add(directionalLight);

  return { ambientLight, hemisphereLight, directionalLight };
}

// =============================================================================
// [6] MapLibre 네이티브 5단 fill-extrusion 실사 레이어 및 패턴 연동
// =============================================================================

export const VWORLD_REA_PATTERN_IDS = {
  PODIUM_COMMERCIAL: 'vworld-rea-podium-signboard',
  WINDOW_FACADE_GRID: 'vworld-rea-window-facade-grid',
  ROOF_PARAPET_AO: 'vworld-rea-roof-parapet-ao',
  PENTHOUSE_CORE: 'vworld-rea-penthouse-core',
} as const;

export function ensureVWorldReaPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  const patterns = [
    {
      id: VWORLD_REA_PATTERN_IDS.PODIUM_COMMERCIAL,
      draw: (ctx: CanvasRenderingContext2D, size: number) => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(8, 8, size - 16, 40);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(20, 22, size - 40, 12);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(8, 60, size - 16, size - 68);
        ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
        ctx.fillRect(12, 64, size - 24, 40);
      },
    },
    {
      id: VWORLD_REA_PATTERN_IDS.WINDOW_FACADE_GRID,
      draw: (ctx: CanvasRenderingContext2D, size: number) => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, size, size);
        const cols = 4, rows = 4;
        const cW = size / cols, cH = size / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(c * cW + 4, r * cH + 4, cW - 8, cH - 8);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(c * cW + 7, r * cH + 7, cW - 14, cH - 14);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(c * cW + 7, r * cH + 7, cW - 14, cH - 14);
          }
        }
      },
    },
    {
      id: VWORLD_REA_PATTERN_IDS.ROOF_PARAPET_AO,
      draw: (ctx: CanvasRenderingContext2D, size: number) => {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, size, size);
        const g = ctx.createLinearGradient(0, size - 32, 0, size);
        g.addColorStop(0, 'rgba(15, 23, 42, 0.0)');
        g.addColorStop(1, 'rgba(15, 23, 42, 0.65)');
        ctx.fillStyle = g;
        ctx.fillRect(0, size - 32, size, 32);
      },
    },
    {
      id: VWORLD_REA_PATTERN_IDS.PENTHOUSE_CORE,
      draw: (ctx: CanvasRenderingContext2D, size: number) => {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(16, 16, Math.round(size * 0.45), Math.round(size * 0.55));
        ctx.fillStyle = '#cbd5e1';
        for (let y = 20; y < size * 0.55; y += 6) {
          ctx.fillRect(18, y, Math.round(size * 0.45) - 4, 2.5);
        }
      },
    },
  ];

  for (const p of patterns) {
    if (!map.hasImage(p.id)) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          p.draw(ctx, 256);
          const img = ctx.getImageData(0, 0, 256, 256);
          map.addImage(p.id, img);
        }
      } catch (err) {
        console.warn(`[VWorldReaRenderer] addImage notice (${p.id}):`, err);
      }
    }
  }
}

// =============================================================================
// [7] VWorldReaRenderer 마스터 통합 클래스
// =============================================================================

export class VWorldReaRenderer {
  public static getMaterials(): THREE.MeshLambertMaterial[] {
    return getGlobalVWorldMaterials();
  }

  public static getRoofMaterials(): THREE.MeshLambertMaterial[] {
    return getGlobalVWorldRoofMaterials();
  }

  public static getAllMaterials(): THREE.MeshLambertMaterial[] {
    return getGlobalAllMaterialsArray();
  }

  public static calculatePreciseHeight(
    featProps: Record<string, any> = {},
    areaSqm: number = 150,
    minWidth: number = 10,
    seed: number = 0,
    coordsLngLat?: [number, number]
  ): number {
    return calculateVWorldPreciseBuildingHeight(featProps, areaSqm, minWidth, seed, coordsLngLat);
  }

  public static classifyBuildingStyle(
    featProps: Record<string, any> = {},
    seed: number = 0,
    areaSqm: number = 150,
    height: number = 10,
    coordsLngLat?: [number, number]
  ): VWorldReaBuildingStyle {
    return classifyVWorldReaStyle(featProps, seed, areaSqm, height, coordsLngLat);
  }

  public static buildBuildingGeometry(options: BuildVWorldReaMeshOptions): THREE.BufferGeometry {
    return buildVWorldRea5PartGeometry(options);
  }

  public static setupLighting(scene: THREE.Scene) {
    return setupSeoulDaylightLighting(scene);
  }

  public static ensurePatterns(map: maplibregl.Map): void {
    ensureVWorldReaPatterns(map);
  }
}
