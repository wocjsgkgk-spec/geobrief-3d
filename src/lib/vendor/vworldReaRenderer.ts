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
import { attachSharedPbrShader } from './photorealisticPbrShader';

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

export let GLOBAL_VWORLD_MATERIALS: THREE.MeshStandardMaterial[] | null = null;
export let GLOBAL_VWORLD_ROOF_MATERIALS: THREE.MeshStandardMaterial[] | null = null;
export let GLOBAL_VWORLD_PARAPET_MATERIAL: THREE.MeshStandardMaterial | null = null;
export let GLOBAL_VWORLD_PENTHOUSE_MATERIAL: THREE.MeshStandardMaterial | null = null;
export let GLOBAL_ALL_VWORLD_REA_MATERIALS: THREE.MeshStandardMaterial[] | null = null;

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
    // [V-World 실사 자재 미세 그레인] 단색 플라스틱 느낌을 제거하고 실제 콘크리트/석재/방수 입자감 부여
    try {
      const imgData = ctx.getImageData(0, 0, 1024, 1024);
      const d = imgData.data;
      let seed = 1337;
      for (let i = 0; i < d.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) | 0;
        const grain = ((seed >>> 24) & 0xf) - 7; // -7 .. +8 미세 입자
        d[i] = Math.min(255, Math.max(0, d[i] + grain));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + grain));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + grain));
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // ignore if canvas tainted
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// -----------------------------------------------------------------------------
// [1-1] 16종 서울 V-World 실사 텍스처 드로잉 팩토리
// -----------------------------------------------------------------------------

function drawApartmentSideWall(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  const configs = [
    { base: '#ffffff', stripeA: '#1e3a8a', stripeB: '#ea580c', dong: '101동', border: '#00e5ff' }, // Navy / Orange
    { base: '#fdfbf7', stripeA: '#881337', stripeB: '#d97706', dong: '102동', border: '#f59e0b' }, // Burgundy / Gold
    { base: '#f8fafc', stripeA: '#047857', stripeB: '#64748b', dong: '201동', border: '#10b981' }, // Forest Green / Silver
  ];
  const cfg = configs[variant % configs.length];

  ctx.fillStyle = cfg.base;
  ctx.fillRect(0, 0, w, h);

  // 브랜드 수직 밴드 (브랜드 컬러 스트라이프)
  ctx.fillStyle = cfg.stripeA;
  ctx.fillRect(w * 0.38, 0, w * 0.20, h);
  ctx.fillStyle = cfg.stripeB;
  ctx.fillRect(w * 0.58, 0, w * 0.04, h);

  // 수평 콘크리트 패널 줄눈
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.lineTo(w, h * 0.5);
  ctx.stroke();

  // 대형 동 번호 배지
  ctx.save();
  const badgeW = w * 0.56;
  const badgeH = h * 0.24;
  const badgeX = w * 0.22;
  const badgeY = h * 0.26;

  ctx.fillStyle = 'rgba(10, 25, 47, 0.94)';
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 18);
  } else {
    ctx.rect(badgeX, badgeY, badgeW, badgeH);
  }
  ctx.fill();

  ctx.strokeStyle = cfg.border;
  ctx.lineWidth = 6;
  ctx.stroke();

  // 순백색 고대비 동 번호 텍스트
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 78px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.dong, w * 0.50, badgeY + badgeH * 0.5);
  ctx.restore();
}

function drawCommercialUpperFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  const wallThemes = [
    { base: '#ece6da', stone: '#dce1e7', frame: '#64748b' }, // Sunlit Beige Limestone
    { base: '#c97b63', stone: '#d98f76', frame: '#334155' }, // Warm Sunlit Terracotta Brick
  ];
  const theme = wallThemes[variant % wallThemes.length];

  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, w, h);

  // 정갈한 석재 줄눈 (연한 명암)
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.lineWidth = 3;
  for (let y = 0; y < h; y += 256) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let x = 0; x < w; x += 340) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 상가/오피스 창문 (화사한 스카이 블루 반사 유리)
  const wx = 120;
  const wy = 160;
  const ww = w - 240;
  const wh = 700;

  ctx.fillStyle = theme.frame;
  ctx.fillRect(wx - 14, wy - 14, ww + 28, wh + 28);

  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  glassGrad.addColorStop(0, '#7dd3fc');
  glassGrad.addColorStop(0.5, '#0284c7');
  glassGrad.addColorStop(1, '#1e3a8a');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.5, wy);
  ctx.lineTo(wx + ww * 0.5, wy + wh);
  ctx.moveTo(wx, wy + 200);
  ctx.lineTo(wx + ww, wy + 200);
  ctx.stroke();
}

function drawCommercialPodiumFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // 1층 다크 화강석 기단부
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, w, h);

  // 1층 상단 가로 간판 구역 (y: 60 ~ 320)
  const signH = 240;
  const signY = 60;
  const signW = w - 80;
  const signX = 40;

  ctx.save();
  if (variant === 0) {
    // 24시 편의점 (GS25 / CU 스타일)
    ctx.fillStyle = '#059669'; // Emerald Green
    ctx.fillRect(signX, signY, signW, signH);
    ctx.fillStyle = '#0284c7'; // Sky Blue accent
    ctx.fillRect(signX, signY, 120, signH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('24시 편의점', w * 0.5, signY + signH * 0.5);
  } else if (variant === 1) {
    // 베이커리 & 약국
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(signX, signY, signW * 0.5 - 10, signH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BAKERY', signX + (signW * 0.5 - 10) * 0.5, signY + signH * 0.5);

    ctx.fillStyle = '#2563eb';
    ctx.fillRect(signX + signW * 0.5 + 10, signY, signW * 0.5 - 10, signH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('약 국 (十)', signX + signW * 0.5 + 10 + (signW * 0.5 - 10) * 0.5, signY + signH * 0.5);
  } else {
    // CAFE & BISTRO
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(signX, signY, signW, signH);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(signX + 6, signY + 6, signW - 12, signH - 12);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAFE & BISTRO', w * 0.5, signY + signH * 0.5);
  }
  ctx.restore();

  // 1층 하단 통유리 쇼윈도 및 출입문 (y: 350 ~ 980)
  const glassY = 350;
  const glassH = h - glassY - 30;
  const glassX = 50;
  const glassW = w - 100;

  const glassGrad = ctx.createLinearGradient(glassX, glassY, glassX, glassY + glassH);
  glassGrad.addColorStop(0, '#38bdf8');
  glassGrad.addColorStop(0.3, '#0284c7');
  glassGrad.addColorStop(0.7, '#0f172a');
  glassGrad.addColorStop(1, '#020617');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(glassX, glassY, glassW, glassH);

  // 알루미늄 통유리 프레임 및 출입문 분할선
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.strokeRect(glassX, glassY, glassW, glassH);

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, glassY);
  ctx.lineTo(w * 0.5, glassY + glassH);
  ctx.moveTo(glassX + glassW * 0.25, glassY);
  ctx.lineTo(glassX + glassW * 0.25, glassY + glassH);
  ctx.moveTo(glassX + glassW * 0.75, glassY);
  ctx.lineTo(glassX + glassW * 0.75, glassY + glassH);
  ctx.stroke();

  // 문 손잡이
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(w * 0.5 - 12, glassY + glassH * 0.45, 6, 80);
  ctx.fillRect(w * 0.5 + 6, glassY + glassH * 0.45, 6, 80);
}

function drawApartmentFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // Variant 4: 아파트 측벽 (기본 101동)
  if (variant === 4) {
    drawApartmentSideWall(ctx, w, h, 0);
    return;
  }

  // 1-Bay (3.2m) × 1-Floor (3.0m) Korean Apartment Veranda Unit at 1024×1024
  const baseColors = ['#ffffff', '#fcfbf9', '#f8fafc', '#fefce8', '#f5f7fa'];
  const baseColor = baseColors[variant % baseColors.length];

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  // 1) Upper floor slab dividing band (0 ~ 90px) - 부드러운 V-World 실사 톤
  ctx.fillStyle = '#e8edf2';
  ctx.fillRect(0, 0, w, 90);
  ctx.fillStyle = 'rgba(100, 116, 139, 0.22)';
  ctx.fillRect(0, 85, w, 8);

  // 2) Lower floor slab dividing band (930 ~ 1024px)
  ctx.fillStyle = '#e8edf2';
  ctx.fillRect(0, 930, w, 94);
  ctx.fillStyle = 'rgba(100, 116, 139, 0.16)';
  ctx.fillRect(0, 925, w, 6);

  // 3) Left and Right Concrete Structural Pier Columns
  ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
  ctx.fillRect(0, 0, 90, h);
  ctx.fillRect(w - 90, 0, 90, h);

  // 4) Balcony Veranda Window Outer Frame (x: 100 to 924, y: 115 to 915)
  const winX = 100;
  const winY = 115;
  const winW = w - 200; // 824px wide (2.57m actual glass width)
  const winH = 800; // 800px high (2.34m actual glass height)

  const sashColors = ['#ffffff', '#ffffff', '#1e293b', '#334155', '#475569'];
  ctx.fillStyle = sashColors[variant % sashColors.length];
  ctx.fillRect(winX - 12, winY - 12, winW + 24, winH + 24);

  // 5) High-Performance Tinted Double-Glazed Glass with Sky Reflection
  const glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
  glassGrad.addColorStop(0, '#7dd3fc'); // bright sky reflection
  glassGrad.addColorStop(0.35, '#38bdf8'); // sky blue
  glassGrad.addColorStop(0.70, '#1e3a8a'); // deep indigo glass
  glassGrad.addColorStop(1.0, '#0f172a'); // dark floor shadow
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 6) Diagonal Glass Sheen Reflection
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(winX + 40, winY);
  ctx.lineTo(winX + 260, winY);
  ctx.lineTo(winX + 160, winY + winH);
  ctx.lineTo(winX, winY + winH);
  ctx.closePath();
  ctx.fill();

  // 7) Central Sliding Sash Divider (Mullion, x = 502~522)
  ctx.fillStyle = sashColors[variant % sashColors.length];
  ctx.fillRect(winX + winW * 0.5 - 10, winY, 20, winH);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(winX + winW * 0.5 - 10, winY, 20, winH);

  // 8) Balcony Lower Safety Guardrail (하단 1.1m 안전 난간, y: 520 to 890)
  const railTopY = winY + winH * 0.52;
  const railH = winY + winH - railTopY;

  // Railing glass semi-transparent tinted backdrop
  ctx.fillStyle = 'rgba(226, 232, 240, 0.25)';
  ctx.fillRect(winX, railTopY, winW, railH);

  // Top Stainless Handrail
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(winX, railTopY - 6, winW, 14);
  ctx.fillStyle = 'rgba(100, 116, 139, 0.7)';
  ctx.fillRect(winX, railTopY + 8, winW, 3); // shadow under handrail

  // 8 Vertical Balustrade Bars
  const numBars = 8;
  const barSpacing = winW / (numBars + 1);
  ctx.lineWidth = 5;
  for (let b = 1; b <= numBars; b++) {
    const bx = winX + b * barSpacing;
    ctx.strokeStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(bx, railTopY + 8);
    ctx.lineTo(bx, winY + winH - 6);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
    ctx.beginPath();
    ctx.moveTo(bx + 2, railTopY + 8);
    ctx.lineTo(bx + 2, winY + winH - 6);
    ctx.stroke();
  }

  // 9) Air conditioner outdoor unit louver grille (실외기실 루버)
  const acW = 220;
  const acH = 150;
  const acX = winX + winW - acW - 20;
  const acY = winY + winH - acH - 18;
  ctx.fillStyle = '#334155';
  ctx.fillRect(acX, acY, acW, acH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(acX, acY, acW, acH);
  ctx.fillStyle = '#64748b';
  for (let ly = acY + 12; ly < acY + acH - 8; ly += 16) {
    ctx.fillRect(acX + 6, ly, acW - 12, 6);
  }
}

function drawPublicHQFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // 1-Bay (3.2m) × 1-Floor (3.0m) High-Grade Curtain Wall Module at 1024×1024
  const glassThemes = [
    { start: '#042f2e', mid: '#0f766e', end: '#14b8a6', mullion: '#e2e8f0' }, // 0: Emerald Reflective Glass
    { start: '#082f49', mid: '#0284c7', end: '#38bdf8', mullion: '#f8fafc' }, // 1: Sky Blue Reflective Glass
    { start: '#0f172a', mid: '#0369a1', end: '#7dd3fc', mullion: '#cbd5e1' }, // 2: Cyan Silver Mirror
    { start: '#1c1917', mid: '#44403c', end: '#78716c', mullion: '#94a3b8' }, // 3: Vivid Emerald Glass
  ];
  const theme = glassThemes[variant % glassThemes.length];

  // Base Reflective Glass
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, theme.start);
  grad.addColorStop(0.4, theme.mid);
  grad.addColorStop(1, theme.end);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Interior venetian blind simulation (top 35% of vision glass)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let by = 30; by < 320; by += 18) {
    ctx.fillRect(15, by, w - 30, 8);
  }

  // Aluminum Mullion & Transom Architecture (Silver profile)
  ctx.fillStyle = theme.mullion;
  // Outer perimeter frames
  ctx.fillRect(0, 0, 16, h); // left mullion
  ctx.fillRect(w - 16, 0, 16, h); // right mullion
  ctx.fillRect(0, 0, w, 22); // top transom
  ctx.fillRect(0, h - 22, w, 22); // bottom transom

  // Center vertical mullion (dividing 3.2m bay into two 1.6m panes)
  ctx.fillRect(w * 0.5 - 12, 0, 24, h);

  // Horizontal mid-transom (vision vs spandrel)
  ctx.fillRect(0, 320, w, 18);

  // Bevel shadow on mullions
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(16, 0, 4, h);
  ctx.fillRect(w * 0.5 + 12, 0, 4, h);
  ctx.fillRect(0, 22, w, 4);
  ctx.fillRect(0, 338, w, 4);
}

function drawCommercialFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // 1-Bay (3.2m) × 1-Floor (3.0m) Clean V-World Commercial/Office Module at 1024×1024
  const wallThemes = [
    { base: '#ece6da', stone: '#dfd7c8', frame: '#475569', accent: '#10b981' }, // 0: Sunlit Ivory Granite
    { base: '#d8dee6', stone: '#cbd5e1', frame: '#334155', accent: '#2563eb' }, // 1: Cool Silver-Gray Stone
    { base: '#c97b63', stone: '#b86850', frame: '#475569', accent: '#dc2626' }, // 2: Warm Terracotta Brick
    { base: '#e2d7c5', stone: '#d4c5ae', frame: '#64748b', accent: '#d97706' }, // 3: Champagne Limestone
  ];
  const theme = wallThemes[variant % wallThemes.length];

  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, w, h);

  // Subtle architectural stone cladding joints (저주파 연회색 줄눈으로 원경 모아레 방지)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 2;
  for (let y = 0; y < h; y += 512) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Commercial Office/Retail Glazing (x: 112px to 912px, y: 150px to 870px)
  const wx = 112;
  const wy = 150;
  const ww = w - 224;
  const wh = 720;

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);

  const glassGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  glassGrad.addColorStop(0, '#bae6fd');
  glassGrad.addColorStop(0.5, '#7dd3fc');
  glassGrad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // Clean sunlit sky glint & vertical mullion sash
  ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(wx + ww * 0.55, wy);
  ctx.lineTo(wx + ww * 0.20, wy + wh);
  ctx.lineTo(wx, wy + wh);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 5;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath();
  ctx.moveTo(wx + ww * 0.5, wy);
  ctx.lineTo(wx + ww * 0.5, wy + wh);
  ctx.moveTo(wx, wy + 220);
  ctx.lineTo(wx + ww, wy + 220);
  ctx.stroke();

  // Clean architectural transom accent bar (no repeating text artifacts)
  if (variant === 0 || variant === 3) {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(wx + 6, wy + 6, ww - 12, 54);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(wx + 6, wy + 6, ww - 12, 12);
  }
}

function drawVillaResidentialFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // 1-Bay (3.2m) × 1-Floor (3.0m) Clean V-World Residential Villa/School Module at 1024×1024
  const brickThemes = [
    { base: '#c46d4c', mortar: '#efe9e0' }, // Sunlit Terracotta Brick
    { base: '#d9c3a5', mortar: '#f5efe6' }, // Warm Beige Brick
    { base: '#dfd8cc', mortar: '#f8fafc' }, // Clean Limestone Brick
  ];
  const theme = brickThemes[variant % brickThemes.length];

  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, w, h);
  // 옅은 수평 마감선만 배치해 원경 노이즈 제거
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  for (let y = 0; y < h; y += 256) {
    ctx.fillRect(0, y, w, 6);
  }

  // Residential Casement Window (x: 190 to 834, y: 170 to 830)
  const wx = 190;
  const wy = 170;
  const ww = w - 380;
  const wh = 660;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx - 16, wy - 16, ww + 32, wh + 32);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(wx - 16, wy - 16, ww + 32, wh + 32);

  const gGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  gGrad.addColorStop(0, '#7dd3fc');
  gGrad.addColorStop(0.5, '#38bdf8');
  gGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = gGrad;
  ctx.fillRect(wx, wy, ww, wh);

  // White window sash division
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx + ww * 0.5 - 8, wy, 16, wh);
  ctx.fillRect(wx, wy + wh * 0.5 - 8, ww, 16);
}

// -----------------------------------------------------------------------------
// [1-2] 4종 실사 옥상 & 난간 & 옥탑방 텍스처 드로잉
// -----------------------------------------------------------------------------

function drawUrethaneGreenRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Seamless clean V-World sage-emerald waterproof urethane coating
  ctx.fillStyle = '#4b9c68';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#54a872';
  for (let y = 0; y < h; y += 128) {
    for (let x = 0; x < w; x += 128) {
      if ((x + y) % 256 === 0) {
        ctx.fillRect(x, y, 128, 128);
      }
    }
  }

  // Clean subtle expansion control joint seams
  ctx.strokeStyle = 'rgba(20, 62, 34, 0.28)';
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
  ctx.strokeStyle = 'rgba(134, 239, 172, 0.22)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 256) {
    ctx.beginPath();
    ctx.moveTo(x + 3, 0);
    ctx.lineTo(x + 3, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 256) {
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    ctx.lineTo(w, y + 3);
    ctx.stroke();
  }
}

function drawConcreteSlabRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Seamless clean V-World bright warm concrete slab surface
  ctx.fillStyle = '#dfe5ec';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#e8edf3';
  for (let y = 0; y < h; y += 128) {
    for (let x = 0; x < w; x += 128) {
      if ((x + y) % 256 === 0) {
        ctx.fillRect(x, y, 128, 128);
      }
    }
  }

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.30)';
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
  // Bright sunlit Korean clay terracotta tile (#b85d43, #cc7256)
  ctx.fillStyle = '#b85d43';
  ctx.fillRect(0, 0, w, h);

  const tileSpacing = 42;
  for (let y = 0; y < h; y += tileSpacing) {
    ctx.fillStyle = 'rgba(67, 20, 7, 0.24)';
    ctx.fillRect(0, y, w, 6);
    ctx.fillStyle = '#cc7256';
    ctx.fillRect(0, y + 6, w, 14);
  }
}

function drawCobaltSteelRoof(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Bright Korean cobalt blue corrugated steel (#3b76d8, #558ae8)
  ctx.fillStyle = '#3b76d8';
  ctx.fillRect(0, 0, w, h);

  const ribW = 32;
  for (let x = 0; x < w; x += ribW * 2) {
    ctx.fillStyle = '#558ae8';
    ctx.fillRect(x, 0, ribW, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fillRect(x + ribW - 3, 0, 3, h);
  }
}

function drawParapetConcrete(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 0.85m Parapet Coping Rim with Light Concrete Cap & Inner Drop Shadow
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, w, h);

  // Top coping edge
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, w, 160);

  // Coping drip edge line
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 160, w, 24);

  // Inner vertical drop shadow gradient
  const shadowGrad = ctx.createLinearGradient(0, 184, 0, h);
  shadowGrad.addColorStop(0, 'rgba(30, 41, 59, 0.45)');
  shadowGrad.addColorStop(1, 'rgba(30, 41, 59, 0.05)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(0, 184, w, h - 184);
}

function drawPenthouseLouver(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 3.0m Elevator Traction Machine Room Penthouse
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, w, h);

  // Aluminum acoustic ventilation louvers
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(80, 80, w - 160, 480);

  ctx.fillStyle = '#cbd5e1';
  for (let y = 100; y < 540; y += 22) {
    ctx.fillRect(95, y, w - 190, 8);
  }

  // Steel machine room door (bottom center)
  const dw = 240;
  const dh = 360;
  const dx = (w - dw) / 2;
  const dy = h - dh - 20;
  ctx.fillStyle = '#475569';
  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(dx, dy, dw, dh);
  // Door handle
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(dx + 28, dy + dh * 0.5 - 6, 12, 32);
}

// =============================================================================
// [2] 16종 독립 Material 싱글톤 캐시 초기화 함수
// =============================================================================

export function getGlobalVWorldMaterials(): THREE.MeshStandardMaterial[] {
  if (GLOBAL_VWORLD_MATERIALS && GLOBAL_VWORLD_MATERIALS.length === 16) {
    return GLOBAL_VWORLD_MATERIALS;
  }

  const materials: THREE.MeshStandardMaterial[] = [];

  // Mat 0~3: 아파트 전·후면 발코니 샤시 (4종)
  for (let i = 0; i < 4; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawApartmentFacade(ctx, w, h, i));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      metalness: 0.22,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 4: 아파트 측벽 Variant A - 101동 (네이비 & 오렌지 브랜드 밴드)
  {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawApartmentSideWall(ctx, w, h, 0));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.45,
      metalness: 0.15,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 5~6: 상가·오피스 기준층(2층+) 외벽 (간판 없이 정돈된 오피스 창호)
  for (let i = 0; i < 2; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawCommercialUpperFacade(ctx, w, h, i));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      metalness: 0.20,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 7~9: 상가 1층 포디움 쇼윈도 & 실제 한국형 브랜드 가로 간판 (편의점, 약국/베이커리, 카페)
  for (let i = 0; i < 3; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawCommercialPodiumFacade(ctx, w, h, i));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.28,
      metalness: 0.30,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 10~11: 공공청사·관공서·하이엔드 오피스 PBR 반사 유리 커튼월 (블루/에메랄드)
  for (let i = 0; i < 2; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawPublicHQFacade(ctx, w, h, i));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.15,
      metalness: 0.65,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 12~13: 다세대 빌라·단독주택 (적벽돌 & 스타코)
  for (let i = 0; i < 2; i++) {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawVillaResidentialFacade(ctx, w, h, i));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      metalness: 0.08,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 14: 아파트 측벽 Variant B - 102동 (버건디 & 골드 티타늄 브랜드 밴드)
  {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawApartmentSideWall(ctx, w, h, 1));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.45,
      metalness: 0.15,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // Mat 15: 아파트 측벽 Variant C - 201동 (포레스트 틸 & 실버 브랜드 밴드)
  {
    const tex = createProceduralCanvasTexture((ctx, w, h) => drawApartmentSideWall(ctx, w, h, 2));
    materials.push(new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.45,
      metalness: 0.15,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }));
  }

  // 22개 멀티 재질에 StreetsGL + V-World 실사 PBR 셰이더 (15cm 창호 인셋 드롭 섀도우 & GGX 스페큘러) 일괄 주입
  for (let m = 0; m < materials.length; m++) {
    attachSharedPbrShader(materials[m]);
  }

  GLOBAL_VWORLD_MATERIALS = materials;
  return GLOBAL_VWORLD_MATERIALS;
}

export function getGlobalVWorldRoofMaterials(): THREE.MeshStandardMaterial[] {
  if (GLOBAL_VWORLD_ROOF_MATERIALS && GLOBAL_VWORLD_ROOF_MATERIALS.length === 4) {
    return GLOBAL_VWORLD_ROOF_MATERIALS;
  }

  GLOBAL_VWORLD_ROOF_MATERIALS = [
    // 0: 한국형 초록색 우레탄 방수 옥상 (#2d6a4f, #3b7a57 — 상가·빌라 45%) (Mat 16)
    new THREE.MeshStandardMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawUrethaneGreenRoof(ctx, w, h)),
      roughness: 0.32,
      metalness: 0.10,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }),
    // 1: 밝은 시멘트 회색 슬래브 (#94a3b8 + 중앙 3m 엘리베이터 옥탑방 — 아파트·청사 35%) (Mat 17)
    new THREE.MeshStandardMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawConcreteSlabRoof(ctx, w, h)),
      roughness: 0.60,
      metalness: 0.05,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }),
    // 2: 3D 경사 박공지붕 + 적갈색 기와 (#6c3428 — 주택·학교 15%) (Mat 18)
    new THREE.MeshStandardMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawTerracottaTileRoof(ctx, w, h)),
      roughness: 0.55,
      metalness: 0.06,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }),
    // 3: 코발트 블루 강판 (#1d4ed8 — 5%) (Mat 19)
    new THREE.MeshStandardMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawCobaltSteelRoof(ctx, w, h)),
      roughness: 0.22,
      metalness: 0.50,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    }),
  ];

  for (let m = 0; m < GLOBAL_VWORLD_ROOF_MATERIALS.length; m++) {
    attachSharedPbrShader(GLOBAL_VWORLD_ROOF_MATERIALS[m]);
  }

  return GLOBAL_VWORLD_ROOF_MATERIALS;
}

export function getGlobalParapetMaterial(): THREE.MeshStandardMaterial {
  if (!GLOBAL_VWORLD_PARAPET_MATERIAL) {
    GLOBAL_VWORLD_PARAPET_MATERIAL = new THREE.MeshStandardMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawParapetConcrete(ctx, w, h)),
      roughness: 0.65,
      metalness: 0.05,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    });
    attachSharedPbrShader(GLOBAL_VWORLD_PARAPET_MATERIAL);
  }
  return GLOBAL_VWORLD_PARAPET_MATERIAL;
}

export function getGlobalPenthouseMaterial(): THREE.MeshStandardMaterial {
  if (!GLOBAL_VWORLD_PENTHOUSE_MATERIAL) {
    GLOBAL_VWORLD_PENTHOUSE_MATERIAL = new THREE.MeshStandardMaterial({
      map: createProceduralCanvasTexture((ctx, w, h) => drawPenthouseLouver(ctx, w, h)),
      roughness: 0.50,
      metalness: 0.15,
      vertexColors: true,
      side: THREE.DoubleSide,
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    });
    attachSharedPbrShader(GLOBAL_VWORLD_PENTHOUSE_MATERIAL);
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
export function getGlobalAllMaterialsArray(): THREE.MeshStandardMaterial[] {
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
    (areaSqm >= 320.0 && areaSqm <= 2500.0) ||
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
      (areaSqm >= 200 && areaSqm < 600));

  let slot = 0;
  let category: VWorldReaBuildingStyle['category'] = 'residential';
  let roofType: VWorldReaBuildingStyle['roofType'] = 'concrete';
  let roofMaterialIndex = 1; // 1: 시멘트 슬래브 (Mat 17)
  let computedHeight = height;

  if (isApt) {
    category = 'apartment';
    slot = Math.abs(seed) % 4; // Mat 0~3: 아파트 전·후면 발코니 샤시 (4종)
    const aptPick = Math.abs(seed) % 100;
    if (aptPick < 65) {
      roofType = 'concrete';
      roofMaterialIndex = 1; // Mat 17 밝은 콘크리트
    } else if (aptPick < 85) {
      roofType = 'urethane';
      roofMaterialIndex = 0; // Mat 16 에메랄드 우레탄
    } else {
      roofType = 'zinc';
      roofMaterialIndex = 3; // Mat 19 코발트/징크 강판
    }
    if (computedHeight < 45.0) {
      computedHeight = 48.0 + (Math.abs(seed) % 28) * 1.0; // 48m ~ 75m
    }
  } else if (isPublic) {
    category = 'public';
    // 혁신도시 및 공공청사: Mat 10~11 (2종 에메랄드/스카이블루 반사 PBR 커튼월)
    slot = 10 + (Math.abs(seed) % 2);
    const pubPick = Math.abs(seed) % 100;
    roofType = pubPick < 70 ? 'concrete' : 'zinc';
    roofMaterialIndex = pubPick < 70 ? 1 : 3;
    if (computedHeight < 25.0) {
      computedHeight = 28.0 + (Math.abs(seed) % 33) * 1.0; // 28m ~ 60m
    }
  } else if (isCommercial) {
    category = 'commercial';
    // 시내 상가·오피스 기준층: Mat 5~6 (2종 베이지 화강석, 적벽돌 오피스 창호)
    slot = 5 + (Math.abs(seed) % 2);
    const comPick = Math.abs(seed) % 100;
    if (comPick < 40) {
      roofType = 'urethane';
      roofMaterialIndex = 0; // Mat 16
    } else if (comPick < 80) {
      roofType = 'concrete';
      roofMaterialIndex = 1; // Mat 17
    } else {
      roofType = 'zinc';
      roofMaterialIndex = 3; // Mat 19
    }
    if (computedHeight < 11.0 || computedHeight > 25.0) {
      computedHeight = 12.0 + (Math.abs(seed) % 10) * 1.0; // 12m ~ 21m
    }
  } else {
    category = 'residential';
    // 단독주택·빌라: Mat 12~13 (2종 적벽돌, 스타코)
    slot = 12 + (Math.abs(seed) % 2);
    const pick = Math.abs(seed) % 100;
    if (pick < 55) {
      roofType = 'gabled';
      roofMaterialIndex = 2; // Mat 18 (기와)
    } else if (pick < 80) {
      roofType = 'concrete';
      roofMaterialIndex = 1; // Mat 17 (슬래브)
    } else if (pick < 90) {
      roofType = 'urethane';
      roofMaterialIndex = 0; // Mat 16 (우레탄)
    } else {
      roofType = 'zinc';
      roofMaterialIndex = 3; // Mat 19 (징크/코발트)
    }
    if (computedHeight < 6.0 || computedHeight > 11.0) {
      computedHeight = 6.5 + (Math.abs(seed) % 36) * 0.1; // 6.5m ~ 10.0m
    }
  }

  return {
    slot,
    category,
    height: computedHeight,
    levels: Math.max(1, Math.round(computedHeight / 3.1)),
    roofType,
    roofMaterialIndex,
    isApartment: isApt,
    parapetHeight: 0.85,
    penthouseHeight: 3.0,
    hasPenthouse: computedHeight >= 14.0 && roofType !== 'gabled',
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
  // [Part 1 & 2: 본동 외벽 (0 ~ H) — geometry.addGroup]
  // 아파트(isApartment)인 경우:
  // - 장변(전·후면 발코니 샤시): style.slot (0..3)
  // - 단변(측벽 2개 변): slot 4 (순백 콘크리트 + 브랜드 스트라이프 + 101동 네온 배지)
  // ---------------------------------------------------------------------------
  const n = pts2D.length;
  const edgeLens: number[] = [];
  let maxEdgeLen = 0;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const elen = Math.hypot(pts2D[next].x - pts2D[i].x, pts2D[next].z - pts2D[i].z);
    edgeLens.push(elen);
    if (elen > maxEdgeLen) maxEdgeLen = elen;
  }

  const sideWallIndices = new Set<number>();
  if (style.isApartment && finalH >= 20.0 && n >= 4) {
    const sorted = edgeLens
      .map((elen, idx) => ({ idx, elen }))
      .sort((a, b) => a.elen - b.elen);
    for (const item of sorted) {
      if (sideWallIndices.size >= 2) break;
      if (item.elen < maxEdgeLen * 0.75) {
        sideWallIndices.add(item.idx);
      }
    }
  }

  // 1) 전·후면 메인 파사드 외벽
  const startVertexMain = positions.length / 3;
  for (let i = 0; i < n; i++) {
    if (sideWallIndices.has(i)) continue;
    const next = (i + 1) % n;
    const p1 = pts2D[i];
    const p2 = pts2D[next];
    const edgeLen = edgeLens[i];
    if (edgeLen < 0.001) continue;

    const nx = -(p2.z - p1.z) / edgeLen;
    const nz = (p2.x - p1.x) / edgeLen;

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
    geometry.addGroup(startVertexMain, countVertexMain, style.slot); // Mat 0..15 (아파트의 경우 0..3)
  }

  // 2) 아파트 측벽 (Side Wall, Mat 4: 순백색 콘크리트 + 101동 배지)
  if (sideWallIndices.size > 0) {
    const startVertexSide = positions.length / 3;
    for (const i of sideWallIndices) {
      const next = (i + 1) % n;
      const p1 = pts2D[i];
      const p2 = pts2D[next];
      const edgeLen = edgeLens[i];
      if (edgeLen < 0.001) continue;

      const nx = -(p2.z - p1.z) / edgeLen;
      const nz = (p2.x - p1.x) / edgeLen;

      // 측벽 전체 1회 맵핑 (101동 배지가 상층부에 정위치 배치)
      const uRepeat = 1.0;
      const vRepeat = 1.0;

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

    const countVertexSide = positions.length / 3 - startVertexSide;
    if (countVertexSide > 0) {
      const sideWallSlot = [4, 14, 15][Math.abs(seed) % 3];
      geometry.addGroup(startVertexSide, countVertexSide, sideWallSlot); // Mat 4, 14, 15: 101동/102동/201동 배지
    }
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
  public static getMaterials(): THREE.MeshStandardMaterial[] {
    return getGlobalVWorldMaterials();
  }

  public static getRoofMaterials(): THREE.MeshStandardMaterial[] {
    return getGlobalVWorldRoofMaterials();
  }

  public static getAllMaterials(): THREE.MeshStandardMaterial[] {
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
