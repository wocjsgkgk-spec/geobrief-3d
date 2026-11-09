/**
 * lib/vendor/vworldReaComposer.ts
 *
 * [2단계: V-World 3D 엔진 아키텍처 역공학(REA) 기반 실사 렌더링 엔진 벤더링]
 *
 * 브이월드(V-World 3D) 실제 WebGL 렌더러와 동일한 시각적 퀄리티를 보장하는
 * 5단 입체 지오메트리 분할 및 16종 독립 실사 PBR Material 싱글톤 엔진:
 *
 * 1. [2-1] V-World 5단 입체 지오메트리 분할 벤더링:
 *    - Part 1: 1층 상가/로비 기단부 (Podium Base: 0m ~ 3.8m)
 *      * 중후한 화강석/대리석 프레임 + 매장 통유리 쇼윈도 + 빨강/파랑/노랑/초록 원색 상가 가로 간판 패치
 *    - Part 2: 기준층 본동 외벽 (Main Wall: 3.8m ~ H)
 *      * Three.js 3.0m 정규화 UV 타일링 (창문 격자, 백색 창틀 샤시, 층간 슬래브 음영선)
 *      * 아파트 측벽(Side Wall) 창문 없는 매끈한 콘크리트 + 단지별 수직 브랜드 컬러 도색 라인
 *    - Part 3: 옥상 테두리 입체 난간 (Parapet Wall: H ~ H + 0.9m)
 *      * 평지붕 외곽을 따라 높이 0.9m 콘크리트 돌출 난간 세워 옥상 안쪽에 깊은 입체 그림자 생성
 *    - Part 4: V-World 실사 지붕 바닥 4종 분리
 *      * 상가·원룸·빌라 (50%): 한국 도심 특유의 초록색/세이지 그린 우레탄 방수 옥상 (#2d6a4f, #3b7a57)
 *      * 아파트·공공청사·빌딩 (30%): 밝은 시멘트 회색 슬래브 (#94a3b8, #cbd5e1)
 *      * 단독주택·농어촌 주택·학교 (15%): 3D 경사 박공지붕 + 적갈색 기와 (#7c2d12, #8c3828)
 *      * 창고·공장 (5%): 코발트 블루 강판 (#1d4ed8)
 *    - Part 5: 엘리베이터 옥탑방 권상기실 (Penthouse Core: H ~ H + 3.0m)
 *      * 4층 이상 건물(H >= 12.0m) 옥상 중앙에 높이 3.0m 옥탑방 박스를 자동 얹어 스카이라인 완성
 *
 * 2. [2-2] 16종 독립 실사 PBR Material 싱글톤 캐싱:
 *    - 앱 최초 로드 시 16종의 고해상도 CanvasTexture 및 MeshStandardMaterial / MeshLambertMaterial 사전 생성(Pre-baking)
 *    - 타일 병합 시 geometry.addGroup(start, count, matIndex) 호출로 단일 드로우콜에서 아파트, 상가, 청사, 주택이 어우러지게 렌더링
 *    - MapLibre GL JS 네이티브 5단 fill-extrusion 레이어 스펙과도 100% 상호 연동 지원
 */

import * as THREE from 'three';
import earcut from 'earcut';
import maplibregl from 'maplibre-gl';
import {
  gpuBuildingBaseExpr,
  BUILDING_HEIGHT_EXPR,
} from '@/utils/gpuRealisticBuildingStack';

const Earcut = (earcut as any).default || earcut;

export interface Point2D {
  x: number;
  z: number;
}

export type VWorldBuildingPart = 'podium' | 'mainwall' | 'parapet' | 'rooftop' | 'penthouse';

export interface VWorldReaStyleAssignment {
  category: 'apartment' | 'commercial' | 'public' | 'villa' | 'industrial';
  facadeSlot: number; // 0..15
  sideWallSlot: number; // 16
  podiumSlot: number; // 17
  signboardSlot: number; // 18
  roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc';
  roofColorHex: string;
  roofColorRgb: [number, number, number];
  parapetColorHex: string;
  parapetHeight: number; // 0.9m
  penthouseHeight: number; // 3.0m
  hasPenthouse: boolean;
}

// =============================================================================
// [1. 16종 서울 V-World 실사 컬러 스펙트럼 팔레트 (hash % 16)]
// =============================================================================

export const VWORLD_REA_16_PALETTE = {
  // 아파트 단지 (15~25층, 45~75m) - Mat 0~4
  aptPureWhite: '#f8fafc',       // 0: 순백색 외벽
  aptCreamIvory: '#f4f1ea',      // 1: 크림 아이보리 외벽
  aptSilverGray: '#e2e8f0',      // 2: 라이트 실버 그레이 외벽
  aptModernCoolGray: '#f1f5f9',  // 3: 모던 쿨 그레이 외벽
  aptSoftWarmGray: '#e7e5e4',    // 4: 소프트 웜 그레이 외벽

  // 시내 중심 상가·근린생활 빌딩 (3~6층, 12~21m) - Mat 5~9
  commercialSabiseok: '#d6cfc2', // 5: 밝은 사비석 화강석
  commercialRedBrick: '#7f1d1d', // 6: 붉은 적벽돌
  commercialCharcoal: '#334155', // 7: 다크 차콜 모던 메탈
  commercialBrownBrick: '#6e473b',// 8: 갈색 파벽돌
  commercialWarmStone: '#bfa588', // 9: 웜스톤 대리석

  // 도청·시청·혁신도시 공공기관·오피스 타워·학교 (7~15층, 16~45m) - Mat 10~12
  officeEmeraldGlass: '#0f766e', // 10: 에메랄드 반사 유리 커튼월
  officeSkyBlueGlass: '#0284c7', // 11: 스카이블루 유리 커튼월
  schoolTerracotta: '#d97742',   // 12: 살구색/테라코타 학교 교사동

  // 단독주택·다세대 빌라·농어촌 주택 (2~3층, 6.5~10.5m) - Mat 13~15
  villaRedBrick: '#7c2d12',      // 13: 적벽돌 빌라
  villaOchreBrick: '#9a3412',    // 14: 황토벽돌
  villaCreamStucco: '#f5f5f4',   // 15: 밝은 크림 스타코

  // 구조 부속물 컬러
  podiumGranite: '#1e293b',      // 1층 기단부 딥 화강석
  podiumShowcaseGlass: '#e0f2fe',// 1층 쇼윈도 통유리
  parapetConcrete: '#cbd5e1',    // 옥상 0.9m 난간 콘크리트
  penthouseLouver: '#94a3b8',    // 옥탑 권상기실 외벽
} as const;

// 4종 실사 지붕 바닥 색상 (V-World 레퍼런스 일치)
export const VWORLD_REA_ROOF_COLORS = {
  // 50% 상가·원룸·빌라: 한국 특유의 초록색/세이지 그린 우레탄 방수 옥상
  urethaneGreenDeep: '#2d6a4f',
  urethaneGreenSage: '#3b7a57',
  urethaneGreenBright: '#40916c',

  // 30% 아파트·공공청사·빌딩: 밝은 시멘트 회색 슬래브
  concreteSlabLight: '#94a3b8',
  concreteSlabSilver: '#cbd5e1',

  // 15% 단독주택·농어촌 주택·학교: 3D 경사 박공지붕 + 적갈색 기와
  terracottaClayTile: '#7c2d12',
  terracottaClayWarm: '#8c3828',
  terracottaClayOchre: '#9a3412',

  // 5% 창고·공장: 코발트 블루 강판
  cobaltBlueSteel: '#1d4ed8',
  cobaltBlueVivid: '#2563eb',
} as const;

// 1층 가로 간판 패치 4원색
export const VWORLD_REA_SIGNBOARD_COLORS = [
  '#dc2626', // 빨강 (식당, 치킨, 베이커리)
  '#2563eb', // 파랑 (약국, 이동통신, 은행)
  '#f59e0b', // 노랑/주황 (카페, 편의점, 학원)
  '#16a34a', // 초록 (마트, 안경원, 클리닉)
] as const;

// 하위 호환 별칭
export const REA_SEOUL_16_PALETTE = VWORLD_REA_16_PALETTE;

// =============================================================================
// [2. MapLibre GL JS 네이티브 5단 fill-extrusion Style Expressions]
// =============================================================================

export const VWORLD_REA_HASH_EXPR: any = [
  '%',
  [
    'abs',
    [
      'coalesce',
      ['to-number', ['id'], 0],
      ['to-number', ['get', 'osm_id'], 0],
      ['to-number', ['get', 'mgmBldrgstPk'], 0],
      ['to-number', ['get', 'bd_mgt_sn'], 0],
      12345,
    ],
  ],
  16,
];
export const REA_BUILDING_HASH_EXPR = VWORLD_REA_HASH_EXPR;

export const VWORLD_REA_16_SPECTRUM_EXPR: any = [
  'case',
  // 1) 고층 아파트 단지 (H >= 38m 또는 아파트 명칭) - Mat 0~4
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 38.0],
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'type'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 0], VWORLD_REA_16_PALETTE.aptPureWhite,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 1], VWORLD_REA_16_PALETTE.aptCreamIvory,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 2], VWORLD_REA_16_PALETTE.aptSilverGray,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 3], VWORLD_REA_16_PALETTE.aptModernCoolGray,
    VWORLD_REA_16_PALETTE.aptSoftWarmGray,
  ],

  // 2) 도청·시청·혁신도시 공공기관·오피스 타워·학교 (H >= 22m 또는 오피스/공공/학교) - Mat 10~12
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 22.0],
    ['==', ['get', 'class'], 'office'],
    ['==', ['get', 'class'], 'public'],
    ['==', ['get', 'class'], 'government'],
    ['==', ['get', 'class'], 'school'],
    ['==', ['get', 'class'], 'university'],
    ['==', ['get', 'class'], 'hospital'],
    ['==', ['get', 'building'], 'office'],
    ['==', ['get', 'building'], 'public'],
    ['==', ['get', 'building'], 'government'],
    ['==', ['get', 'building'], 'school'],
    ['==', ['get', 'usageType'], 'military_public'],
    ['==', ['get', 'bld_category'], 'public_military'],
  ],
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 3], 0], VWORLD_REA_16_PALETTE.officeEmeraldGlass,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 3], 1], VWORLD_REA_16_PALETTE.officeSkyBlueGlass,
    VWORLD_REA_16_PALETTE.schoolTerracotta,
  ],

  // 3) 시내 중심 상가·근린생활 빌딩 (H >= 11m 또는 상가) - Mat 5~9
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 11.0],
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'building'], 'commercial'],
    ['==', ['get', 'building'], 'retail'],
    ['==', ['get', 'usageType'], 'commercial'],
    ['==', ['get', 'bld_category'], 'commercial'],
  ],
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 0], VWORLD_REA_16_PALETTE.commercialSabiseok,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 1], VWORLD_REA_16_PALETTE.commercialRedBrick,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 2], VWORLD_REA_16_PALETTE.commercialCharcoal,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 5], 3], VWORLD_REA_16_PALETTE.commercialBrownBrick,
    VWORLD_REA_16_PALETTE.commercialWarmStone,
  ],

  // 4) 저층 단독주택·다세대 빌라·농가 (H < 11m) - Mat 13~15
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 3], 0], VWORLD_REA_16_PALETTE.villaRedBrick,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 3], 1], VWORLD_REA_16_PALETTE.villaOchreBrick,
    VWORLD_REA_16_PALETTE.villaCreamStucco,
  ],
];
export const REA_SEOUL_16_SPECTRUM_EXPR = VWORLD_REA_16_SPECTRUM_EXPR;

// 1층 상가/로비 기단부 (0m ~ 3.8m)
export const VWORLD_REA_PODIUM_COLOR_EXPR: any = [
  'case',
  // 상업·근린: 다크 차콜/화강석 기단부 (#1e293b)
  [
    'any',
    ['==', ['get', 'class'], 'commercial'],
    ['==', ['get', 'class'], 'retail'],
    ['==', ['get', 'building'], 'commercial'],
    ['==', ['get', 'usageType'], 'commercial'],
  ],
  '#1e293b',
  // 아파트: 브라운/웜그레이 화강석 기단부 (#44403c)
  [
    'any',
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
  ],
  '#44403c',
  // 기본 기단부: 중후한 화강석 다크그레이 (#334155)
  '#334155',
];
export const REA_PODIUM_COLOR_EXPR = VWORLD_REA_PODIUM_COLOR_EXPR;

// V-World 실사 지붕 바닥 4종 분리
export const VWORLD_REA_ROOFTOP_4TYPE_COLOR_EXPR: any = [
  'case',
  // 1) 고층 아파트 단지 및 대형 오피스 타워: 30% 밝은 시멘트 회색 슬래브 (#94a3b8, #cbd5e1)
  [
    'any',
    ['>=', BUILDING_HEIGHT_EXPR, 28.0],
    ['==', ['get', 'class'], 'apartments'],
    ['==', ['get', 'building'], 'apartments'],
    ['==', ['get', 'usageType'], 'apartment'],
    ['==', ['get', 'bld_category'], 'apartment'],
  ],
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 2], 0], VWORLD_REA_ROOF_COLORS.concreteSlabLight,
    VWORLD_REA_ROOF_COLORS.concreteSlabSilver,
  ],

  // 2) 공장·체육관·창고: 5% 코발트 블루 강판 지붕 (#1d4ed8)
  [
    'any',
    ['==', ['get', 'class'], 'industrial'],
    ['==', ['get', 'class'], 'warehouse'],
    ['==', ['get', 'building'], 'industrial'],
    ['==', ['get', 'building'], 'warehouse'],
    ['==', ['get', 'usageType'], 'industrial'],
  ],
  VWORLD_REA_ROOF_COLORS.cobaltBlueSteel,

  // 3) 단독주택·농어촌주택·학교: 15% 3D 경사 박공지붕 + 적갈색 기와 (#7c2d12, #8c3828)
  [
    'any',
    ['==', ['get', 'class'], 'house'],
    ['==', ['get', 'class'], 'school'],
    ['==', ['get', 'building'], 'house'],
    ['==', ['get', 'building'], 'school'],
    ['==', ['get', 'usageType'], 'residential'],
  ],
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 2], 0], VWORLD_REA_ROOF_COLORS.terracottaClayTile,
    VWORLD_REA_ROOF_COLORS.terracottaClayWarm,
  ],

  // 4) 상가·빌라·원룸·근린생활: 50% 한국 특유의 초록색/세이지 그린 우레탄 방수 옥상 (#2d6a4f, #3b7a57)
  [
    'case',
    ['==', ['%', VWORLD_REA_HASH_EXPR, 3], 0], VWORLD_REA_ROOF_COLORS.urethaneGreenDeep,
    ['==', ['%', VWORLD_REA_HASH_EXPR, 3], 1], VWORLD_REA_ROOF_COLORS.urethaneGreenSage,
    VWORLD_REA_ROOF_COLORS.urethaneGreenBright,
  ],
];
export const REA_ROOFTOP_4TYPE_COLOR_EXPR = VWORLD_REA_ROOFTOP_4TYPE_COLOR_EXPR;

// =============================================================================
// [3. 16종 독립 실사 CanvasTexture 및 Material 싱글톤 엔진]
// =============================================================================

export let GLOBAL_VWORLD_REA_MATERIALS: THREE.MeshStandardMaterial[] | null = null;
export let GLOBAL_VWORLD_REA_PBR_MATERIALS: THREE.MeshStandardMaterial[] | null = null;
let cachedRooftopMaterials: THREE.MeshStandardMaterial[] | null = null;
let cachedParapetMaterial: THREE.MeshStandardMaterial | null = null;
let cachedPenthouseMaterial: THREE.MeshStandardMaterial | null = null;

function createOffscreen1024Canvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    return canvas;
  }
  return { width: 1024, height: 1024 } as any;
}

function applyCanvasNoise(ctx: CanvasRenderingContext2D, size: number, opacity = 0.03): void {
  try {
    const imgData = ctx.getImageData(0, 0, size, size);
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
 * 1) 아파트 단지 5종 (Mat 0 ~ 4):
 *    - 3.0m 층고 정규화 UV 타일링 (4개 층 × 3개 베이)
 *    - 백색 창틀 샤시 (#ffffff) + 다크 네이비/차콜 반사 유리창 + 발코니 안전 난간
 *    - 우측 28% 측벽 (Side Wall) 창문 없는 매끈한 콘크리트 + 단지별 수직 브랜드 도색 밴드 (#1e3a5f, #0284c7 등)
 */
function drawVWorldApartmentTexture(
  ctx: CanvasRenderingContext2D,
  s: number,
  options: {
    wallColor: string;
    brandColorStart: string;
    brandColorEnd: string;
    glassTop: string;
    glassBot: string;
    bldgNum?: string;
  }
): void {
  // 1. 메인 외벽 바탕
  ctx.fillStyle = options.wallColor;
  ctx.fillRect(0, 0, s, s);

  // 2. 우측 28% 측벽 (Side Wall) 매끈한 콘크리트 및 수직 브랜드 도색 라인
  const sideW = Math.round(s * 0.28);
  const sideX = s - sideW;
  const brandGrad = ctx.createLinearGradient(sideX, 0, s, s);
  brandGrad.addColorStop(0.0, options.brandColorStart);
  brandGrad.addColorStop(1.0, options.brandColorEnd);
  ctx.fillStyle = brandGrad;
  ctx.fillRect(sideX, 0, sideW, s);

  // 측벽 분할 핀스트라이프
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sideX + 6, 0, 4, s);

  // 동 번호 표시 플레이트 (예: 101, 102)
  if (options.bldgNum) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(sideX + Math.round(sideW * 0.2), Math.round(s * 0.12), Math.round(sideW * 0.6), 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(options.bldgNum, sideX + Math.round(sideW * 0.5), Math.round(s * 0.12) + 40);
  }

  // 3. 좌측 72% 본동 외벽 (4개 층 × 3개 발코니 베이)
  const mainW = sideX;
  const numFloors = 4;
  const floorH = s / numFloors;
  const numBays = 3;
  const bayW = mainW / numBays;

  for (let f = 0; f < numFloors; f++) {
    const fY = f * floorH;

    // 층간 슬래브 음영선 (Floor Slab Band)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, fY, mainW, 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, fY + 11, mainW, 3);

    for (let b = 0; b < numBays; b++) {
      const bX = b * bayW + 16;
      const wW = bayW - 32;
      const wY = fY + 22;
      const wH = floorH - 34;

      // 백색 창틀 십자 프레임 외곽 (White Sash Frame)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bX - 3, wY - 3, wW + 6, wH + 6);

      // 다크 네이비 유리창 그라디언트
      const glassGrad = ctx.createLinearGradient(bX, wY, bX, wY + wH);
      glassGrad.addColorStop(0, options.glassTop);
      glassGrad.addColorStop(0.35, '#1e293b');
      glassGrad.addColorStop(1, options.glassBot);
      ctx.fillStyle = glassGrad;
      ctx.fillRect(bX, wY, wW, wH);

      // 상단 그림자
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(bX, wY, wW, 8);

      // 중앙 세로 백색 멀리언
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(bX + wW / 2 - 2), wY, 4, wH);

      // 가로 트랜섬 바
      ctx.fillRect(bX, Math.round(wY + wH * 0.42), wW, 2);

      // 발코니 안전 난간 핸드레일
      const railY = Math.round(wY + wH * 0.62);
      const railH = wH - Math.round(wH * 0.62);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(bX + 2, railY, wW - 4, 3);

      // 세로 난간 살 5개
      const pickets = 5;
      const pStep = (wW - 8) / (pickets + 1);
      ctx.fillStyle = '#94a3b8';
      for (let p = 1; p <= pickets; p++) {
        ctx.fillRect(Math.round(bX + 4 + p * pStep), railY + 3, 2, railH - 3);
      }
    }
  }

  applyCanvasNoise(ctx, s, 0.03);
}

/**
 * 2) 시내 상가·근린생활 빌딩 5종 (Mat 5 ~ 9):
 *    - 1층(0m ~ 3.8m): 다크 화강석 프레임 + 매장 통유리 쇼윈도 + 1층 상단 가로 간판 패치 (빨강/파랑/노랑/초록)
 *    - 2층 이상: 석재/벽돌 타일 외벽 + 상가 창문 및 2~3층 개별 간판 블록
 */
function drawVWorldCommercialTexture(
  ctx: CanvasRenderingContext2D,
  s: number,
  options: {
    upperWallColor: string;
    isBrick: boolean;
    brickMortarColor?: string;
    windowFrameColor: string;
    signPrimaryColor: string;
  }
): void {
  // 1. 2층 이상 상층 외벽 Albedo
  ctx.fillStyle = options.upperWallColor;
  ctx.fillRect(0, 0, s, s);

  // 벽돌 줄눈 옵션
  if (options.isBrick) {
    const brickH = 22;
    const brickW = 48;
    ctx.strokeStyle = options.brickMortarColor || '#d6d3d1';
    ctx.lineWidth = 1.5;

    for (let y = 0; y < s - 180; y += brickH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();

      const offset = (Math.floor(y / brickH) % 2) * (brickW * 0.5);
      for (let x = offset; x < s; x += brickW) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + brickH);
        ctx.stroke();
      }
    }
  }

  // 2. 상층 창문 배치 (3개 층 × 3개 베이)
  const numUpperFloors = 3;
  const floorH = (s - 180) / numUpperFloors;
  const numBays = 3;
  const bayW = s / numBays;

  for (let f = 0; f < numUpperFloors; f++) {
    const yTop = f * floorH;

    for (let b = 0; b < numBays; b++) {
      const bX = b * bayW + 20;
      const wW = bayW - 40;
      const wH = floorH - 60;
      const wY = yTop + 18;

      // 창틀 프레임
      ctx.fillStyle = options.windowFrameColor;
      ctx.fillRect(bX - 2, wY - 2, wW + 4, wH + 4);

      // 상가 반사 유리
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bX, wY, wW, wH);

      // 창문 수직 멀리언
      ctx.fillStyle = options.windowFrameColor;
      ctx.fillRect(Math.round(bX + wW / 2 - 1.5), wY, 3, wH);

      // 2~3층 창문 하단 가로 간판 패치
      const signColor = VWORLD_REA_SIGNBOARD_COLORS[(f * numBays + b) % VWORLD_REA_SIGNBOARD_COLORS.length];
      const signY = wY + wH + 4;
      const signH = 28;

      ctx.fillStyle = signColor;
      ctx.fillRect(bX, signY, wW, signH);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bX + 1, signY + 1, wW - 2, signH - 2);

      // 간판 텍스트 바
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bX + 8, signY + 10, wW - 16, 8);
    }
  }

  // 3. 1층 상가 기단부 (0m ~ 3.8m = 하단 180px): 중후한 화강석 프레임 + 매장 통유리 쇼윈도 + 가로 간판 띠
  const yGround = s - 180;

  // 화강석 프레임 (#1e293b)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, yGround, s, 180);

  // 1층 상단 가로 간판 띠 (빨강/파랑/노랑/초록 4원색 간판 패치)
  const signBandH = 46;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, yGround, s, signBandH);

  const numSigns = 4;
  const signW = Math.round((s - 32) / numSigns);
  for (let k = 0; k < numSigns; k++) {
    const sx = 16 + k * signW;
    const scolor = VWORLD_REA_SIGNBOARD_COLORS[k % VWORLD_REA_SIGNBOARD_COLORS.length];
    ctx.fillStyle = scolor;
    ctx.fillRect(sx + 3, yGround + 4, signW - 6, signBandH - 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 4, yGround + 5, signW - 8, signBandH - 10);
    // 간판 백색 텍스트 바
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 10, yGround + 18, signW - 20, 10);
  }

  // 하단 쇼윈도 통유리 2구획
  const numShops = 2;
  const shopW = s / numShops;
  for (let k = 0; k < numShops; k++) {
    const sx = k * shopW + 24;
    const sw = shopW - 48;
    const sy = yGround + signBandH + 10;
    const sh = 180 - signBandH - 20;

    // 쇼윈도 외곽 프레임
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(sx, sy, sw, sh);

    // 밝은 쇼윈도 실내 조명 반사 통유리 그라디언트
    const shopGrad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    shopGrad.addColorStop(0, '#f0f9ff');
    shopGrad.addColorStop(0.5, '#e0f2fe');
    shopGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = shopGrad;
    ctx.fillRect(sx + 3, sy + 3, sw - 6, sh - 6);

    // 출입문 핸들 디테일
    ctx.fillStyle = '#475569';
    ctx.fillRect(sx + Math.round(sw * 0.5 - 2), sy + Math.round(sh * 0.4), 4, 30);
  }

  applyCanvasNoise(ctx, s, 0.03);
}

/**
 * 3) 공공청사·오피스 타워·학교 3종 (Mat 10 ~ 12):
 *    - 에메랄드/스카이블루 커튼월 반사 유리, 살구색 테라코타 교사동
 */
function drawVWorldPublicTexture(
  ctx: CanvasRenderingContext2D,
  s: number,
  options: {
    curtainWallColor: string;
    mullionColor: string;
    isTerracottaSchool?: boolean;
  }
): void {
  if (options.isTerracottaSchool) {
    // 학교 교사동: 살구색/테라코타 벽체 + 질서정연한 교실 창문
    ctx.fillStyle = '#d97742';
    ctx.fillRect(0, 0, s, s);

    const floors = 4;
    const floorH = s / floors;
    const bays = 4;
    const bayW = s / bays;

    for (let f = 0; f < floors; f++) {
      const fY = f * floorH;
      // 슬래브 띠
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(0, fY, s, 12);

      for (let b = 0; b < bays; b++) {
        const bX = b * bayW + 16;
        const wW = bayW - 32;
        const wY = fY + 20;
        const wH = floorH - 34;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bX - 2, wY - 2, wW + 4, wH + 4);

        ctx.fillStyle = '#1e3a5f';
        ctx.fillRect(bX, wY, wW, wH);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(bX + wW / 2 - 1), wY, 2, wH);
      }
    }
  } else {
    // 오피스/청사 커튼월 타워
    ctx.fillStyle = options.curtainWallColor;
    ctx.fillRect(0, 0, s, s);

    // 커튼월 미세 반사 그라디언트
    const curtainGrad = ctx.createLinearGradient(0, 0, s, s);
    curtainGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    curtainGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.0)');
    curtainGrad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = curtainGrad;
    ctx.fillRect(0, 0, s, s);

    // 정밀 유리 멀리언 격자선
    ctx.strokeStyle = options.mullionColor;
    ctx.lineWidth = 3;

    const gridH = s / 8;
    for (let y = 0; y <= s; y += gridH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }

    const gridW = s / 8;
    for (let x = 0; x <= s; x += gridW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
  }

  applyCanvasNoise(ctx, s, 0.02);
}

/**
 * 4) 단독주택·빌라 3종 (Mat 13 ~ 15):
 *    - 적벽돌, 황토벽돌, 크림 스타코 외벽 + 아늑한 가정용 창호
 */
function drawVWorldVillaTexture(
  ctx: CanvasRenderingContext2D,
  s: number,
  options: {
    wallColor: string;
    brickMortar?: string;
    isStucco?: boolean;
  }
): void {
  ctx.fillStyle = options.wallColor;
  ctx.fillRect(0, 0, s, s);

  if (!options.isStucco) {
    const brickH = 20;
    const brickW = 44;
    ctx.strokeStyle = options.brickMortar || '#a8a29e';
    ctx.lineWidth = 1.5;

    for (let y = 0; y < s; y += brickH) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();

      const offset = (Math.floor(y / brickH) % 2) * (brickW * 0.5);
      for (let x = offset; x < s; x += brickW) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + brickH);
        ctx.stroke();
      }
    }
  }

  // 2개 층 × 2개 창호
  const floors = 2;
  const floorH = s / floors;
  const bays = 2;
  const bayW = s / bays;

  for (let f = 0; f < floors; f++) {
    const fY = f * floorH;

    for (let b = 0; b < bays; b++) {
      const bX = b * bayW + 48;
      const wW = bayW - 96;
      const wY = fY + 36;
      const wH = floorH - 72;

      // 화강석 창호 인방 및 창대
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(bX - 6, wY - 6, wW + 12, wH + 12);

      // 화이트 샤시
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bX - 2, wY - 2, wW + 4, wH + 4);

      // 유리창
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bX, wY, wW, wH);

      // 십자 멀리언
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(bX + wW / 2 - 1.5), wY, 3, wH);
      ctx.fillRect(bX, Math.round(wY + wH / 2 - 1.5), wW, 3);
    }
  }

  applyCanvasNoise(ctx, s, 0.04);
}

/**
 * 16종 독립 슬롯 캔버스 텍스처 생성기
 */
export function buildVWorldReaCanvas(slotIdx: number, s = 1024): HTMLCanvasElement {
  const canvas = createOffscreen1024Canvas();
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return canvas;

  switch (slotIdx) {
    // -------------------------------------------------------------------------
    // Mat 0 ~ 4: 아파트 단지 5종
    // -------------------------------------------------------------------------
    case 0:
      drawVWorldApartmentTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.aptPureWhite,
        brandColorStart: '#0284c7',
        brandColorEnd: '#0f766e',
        glassTop: '#1e3a5f',
        glassBot: '#090d16',
        bldgNum: '101',
      });
      break;
    case 1:
      drawVWorldApartmentTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.aptCreamIvory,
        brandColorStart: '#d97706',
        brandColorEnd: '#78350f',
        glassTop: '#1e293b',
        glassBot: '#0f172a',
        bldgNum: '102',
      });
      break;
    case 2:
      drawVWorldApartmentTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.aptSilverGray,
        brandColorStart: '#475569',
        brandColorEnd: '#1e293b',
        glassTop: '#2563eb',
        glassBot: '#0f172a',
        bldgNum: '103',
      });
      break;
    case 3:
      drawVWorldApartmentTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.aptModernCoolGray,
        brandColorStart: '#0284c7',
        brandColorEnd: '#1e40af',
        glassTop: '#0f766e',
        glassBot: '#090d16',
        bldgNum: '104',
      });
      break;
    case 4:
      drawVWorldApartmentTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.aptSoftWarmGray,
        brandColorStart: '#7c2d12',
        brandColorEnd: '#451a03',
        glassTop: '#1e293b',
        glassBot: '#090d16',
        bldgNum: '105',
      });
      break;

    // -------------------------------------------------------------------------
    // Mat 5 ~ 9: 시내 중심 상가·근린생활 빌딩 5종
    // -------------------------------------------------------------------------
    case 5:
      drawVWorldCommercialTexture(ctx, s, {
        upperWallColor: VWORLD_REA_16_PALETTE.commercialSabiseok,
        isBrick: false,
        windowFrameColor: '#1e293b',
        signPrimaryColor: '#2563eb',
      });
      break;
    case 6:
      drawVWorldCommercialTexture(ctx, s, {
        upperWallColor: VWORLD_REA_16_PALETTE.commercialRedBrick,
        isBrick: true,
        brickMortarColor: '#e7e5e4',
        windowFrameColor: '#ffffff',
        signPrimaryColor: '#dc2626',
      });
      break;
    case 7:
      drawVWorldCommercialTexture(ctx, s, {
        upperWallColor: VWORLD_REA_16_PALETTE.commercialCharcoal,
        isBrick: false,
        windowFrameColor: '#f8fafc',
        signPrimaryColor: '#f59e0b',
      });
      break;
    case 8:
      drawVWorldCommercialTexture(ctx, s, {
        upperWallColor: VWORLD_REA_16_PALETTE.commercialBrownBrick,
        isBrick: true,
        brickMortarColor: '#d6d3d1',
        windowFrameColor: '#334155',
        signPrimaryColor: '#16a34a',
      });
      break;
    case 9:
      drawVWorldCommercialTexture(ctx, s, {
        upperWallColor: VWORLD_REA_16_PALETTE.commercialWarmStone,
        isBrick: false,
        windowFrameColor: '#1e293b',
        signPrimaryColor: '#dc2626',
      });
      break;

    // -------------------------------------------------------------------------
    // Mat 10 ~ 12: 공공청사·오피스·학교 3종
    // -------------------------------------------------------------------------
    case 10:
      drawVWorldPublicTexture(ctx, s, {
        curtainWallColor: VWORLD_REA_16_PALETTE.officeEmeraldGlass,
        mullionColor: '#134e4a',
      });
      break;
    case 11:
      drawVWorldPublicTexture(ctx, s, {
        curtainWallColor: VWORLD_REA_16_PALETTE.officeSkyBlueGlass,
        mullionColor: '#0c4a6e',
      });
      break;
    case 12:
      drawVWorldPublicTexture(ctx, s, {
        curtainWallColor: VWORLD_REA_16_PALETTE.schoolTerracotta,
        mullionColor: '#9a3412',
        isTerracottaSchool: true,
      });
      break;

    // -------------------------------------------------------------------------
    // Mat 13 ~ 15: 단독주택·빌라 3종
    // -------------------------------------------------------------------------
    case 13:
      drawVWorldVillaTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.villaRedBrick,
        brickMortar: '#e7e5e4',
      });
      break;
    case 14:
      drawVWorldVillaTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.villaOchreBrick,
        brickMortar: '#fed7aa',
      });
      break;
    case 15:
    default:
      drawVWorldVillaTexture(ctx, s, {
        wallColor: VWORLD_REA_16_PALETTE.villaCreamStucco,
        isStucco: true,
      });
      break;
  }

  return canvas;
}

/**
 * 16종 독립 실사 PBR Material 싱글톤 사전 생성(Pre-baking) 및 캐시 반환
 */
export function prebakeVWorldRea16Materials(): THREE.MeshStandardMaterial[] {
  if (GLOBAL_VWORLD_REA_MATERIALS && GLOBAL_VWORLD_REA_MATERIALS.length === 16) {
    return GLOBAL_VWORLD_REA_MATERIALS;
  }

  const materials: THREE.MeshStandardMaterial[] = [];

  for (let i = 0; i < 16; i++) {
    const canvas = buildVWorldReaCanvas(i, 1024);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 16;
    texture.needsUpdate = true;

    // 용도별 PBR 거칠기/금속성 설정
    let roughness = 0.85;
    let metalness = 0.05;

    if (i >= 10 && i <= 11) {
      // 유리 커튼월
      roughness = 0.15;
      metalness = 0.85;
    } else if (i >= 0 && i <= 4) {
      // 아파트
      roughness = 0.75;
      metalness = 0.10;
    } else if (i === 7) {
      // 다크 차콜 메탈 상가
      roughness = 0.40;
      metalness = 0.60;
    }

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness,
      metalness,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    mat.name = `vworld-rea-mat-${i}`;

    materials.push(mat);
  }

  GLOBAL_VWORLD_REA_MATERIALS = materials;
  GLOBAL_VWORLD_REA_PBR_MATERIALS = materials;
  return materials;
}

export function getVWorldRea16Materials(): THREE.MeshStandardMaterial[] {
  return prebakeVWorldRea16Materials();
}

/**
 * V-World 실사 지붕 바닥 4종 Material 싱글톤
 * - 0: 우레탄 초록 (50%)
 * - 1: 콘크리트 슬래브 (30%)
 * - 2: 테라코타 기와 (15%)
 * - 3: 코발트 강판 (5%)
 */
export function getVWorldReaRooftopMaterials(): THREE.MeshStandardMaterial[] {
  if (cachedRooftopMaterials && cachedRooftopMaterials.length === 4) {
    return cachedRooftopMaterials;
  }

  const colors = [
    VWORLD_REA_ROOF_COLORS.urethaneGreenSage,
    VWORLD_REA_ROOF_COLORS.concreteSlabLight,
    VWORLD_REA_ROOF_COLORS.terracottaClayTile,
    VWORLD_REA_ROOF_COLORS.cobaltBlueSteel,
  ];

  const roughnesses = [0.85, 0.90, 0.80, 0.35];
  const metalnesses = [0.05, 0.05, 0.05, 0.65];

  cachedRooftopMaterials = colors.map((colHex, idx) => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colHex),
      roughness: roughnesses[idx],
      metalness: metalnesses[idx],
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    mat.name = `vworld-rea-roof-mat-${idx}`;
    return mat;
  });

  return cachedRooftopMaterials;
}

/**
 * 옥상 0.9m 테두리 난간 콘크리트 Material
 */
export function getVWorldReaParapetMaterial(): THREE.MeshStandardMaterial {
  if (!cachedParapetMaterial) {
    cachedParapetMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(VWORLD_REA_16_PALETTE.parapetConcrete),
      roughness: 0.88,
      metalness: 0.05,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    cachedParapetMaterial.name = 'vworld-rea-parapet-mat';
  }
  return cachedParapetMaterial;
}

/**
 * 옥탑 권상기실(Penthouse) Material
 */
export function getVWorldReaPenthouseMaterial(): THREE.MeshStandardMaterial {
  if (!cachedPenthouseMaterial) {
    cachedPenthouseMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(VWORLD_REA_16_PALETTE.penthouseLouver),
      roughness: 0.70,
      metalness: 0.25,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    cachedPenthouseMaterial.name = 'vworld-rea-penthouse-mat';
  }
  return cachedPenthouseMaterial;
}

/**
 * 16종 외벽 + 옥상 4종 + 난간 1종 + 옥탑 1종 통합 Material 배열 (총 22종)
 */
export function getVWorldReaAllMaterials(): THREE.MeshStandardMaterial[] {
  const facades = getVWorldRea16Materials();
  const rooftops = getVWorldReaRooftopMaterials();
  const parapet = getVWorldReaParapetMaterial();
  const penthouse = getVWorldReaPenthouseMaterial();

  return [...facades, parapet, penthouse, ...rooftops];
}

// =============================================================================
// [4. 건물 속성 및 해시 기반 건축 스타일 분류기]
// =============================================================================

export function classifyVWorldReaBuildingStyle(
  featProps: Record<string, any> = {},
  seed: number,
  areaSqm: number,
  height: number
): VWorldReaStyleAssignment {
  const hash = Math.abs(seed) % 16;
  const buldNm = String(featProps.buld_nm || featProps.name || '');
  const realUse = String(featProps.realUse || featProps.use || featProps.type || featProps.class || '');

  const isApt =
    realUse.includes('apartment') ||
    realUse.includes('아파트') ||
    realUse.includes('공동주택') ||
    buldNm.includes('아파트') ||
    buldNm.includes('아이파크') ||
    buldNm.includes('푸르지오') ||
    buldNm.includes('힐스테이트') ||
    buldNm.includes('자이') ||
    buldNm.includes('롯데캐슬') ||
    buldNm.includes('더샵') ||
    (height >= 35.0 && areaSqm >= 250);

  const isGovPublic =
    realUse.includes('office') ||
    realUse.includes('public') ||
    realUse.includes('government') ||
    realUse.includes('school') ||
    realUse.includes('university') ||
    realUse.includes('hospital') ||
    realUse.includes('공공') ||
    realUse.includes('관공서') ||
    realUse.includes('청사') ||
    realUse.includes('학교') ||
    realUse.includes('병원') ||
    buldNm.includes('청사') ||
    buldNm.includes('시청') ||
    buldNm.includes('도청') ||
    buldNm.includes('학교') ||
    buldNm.includes('병원');

  const isIndustrial =
    realUse.includes('industrial') ||
    realUse.includes('warehouse') ||
    realUse.includes('factory') ||
    realUse.includes('공장') ||
    realUse.includes('창고');

  const isLowRiseResidential =
    height < 11.0 &&
    (realUse.includes('residential') ||
      realUse.includes('house') ||
      realUse.includes('단독') ||
      realUse.includes('다세대') ||
      realUse.includes('빌라') ||
      realUse.includes('주택') ||
      areaSqm < 220);

  let category: 'apartment' | 'commercial' | 'public' | 'villa' | 'industrial';
  let facadeSlot = 0;
  let roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc' = 'concrete';
  let roofColorHex: string = VWORLD_REA_ROOF_COLORS.concreteSlabLight;
  let roofColorRgb: [number, number, number] = [0.58, 0.64, 0.72];

  if (isApt) {
    category = 'apartment';
    facadeSlot = hash % 5; // Mat 0..4
    roofType = 'concrete'; // 30% 밝은 시멘트 회색 슬래브
    roofColorHex = (hash % 2 === 0) ? VWORLD_REA_ROOF_COLORS.concreteSlabLight : VWORLD_REA_ROOF_COLORS.concreteSlabSilver;
    roofColorRgb = [0.58, 0.64, 0.72];
  } else if (isGovPublic) {
    category = 'public';
    facadeSlot = 10 + (hash % 3); // Mat 10..12
    roofType = 'concrete';
    roofColorHex = VWORLD_REA_ROOF_COLORS.concreteSlabLight;
    roofColorRgb = [0.58, 0.64, 0.72];
  } else if (isIndustrial) {
    category = 'industrial';
    facadeSlot = 5 + (hash % 5);
    roofType = 'zinc'; // 5% 코발트 블루 강판
    roofColorHex = VWORLD_REA_ROOF_COLORS.cobaltBlueSteel;
    roofColorRgb = [0.11, 0.31, 0.85];
  } else if (isLowRiseResidential) {
    category = 'villa';
    facadeSlot = 13 + (hash % 3); // Mat 13..15
    if (hash % 10 < 3) {
      roofType = 'gabled'; // 15% 박공기와
      roofColorHex = VWORLD_REA_ROOF_COLORS.terracottaClayTile;
      roofColorRgb = [0.49, 0.18, 0.07];
    } else {
      roofType = 'urethane'; // 50% 우레탄 녹색
      roofColorHex = VWORLD_REA_ROOF_COLORS.urethaneGreenSage;
      roofColorRgb = [0.23, 0.48, 0.34];
    }
  } else {
    category = 'commercial';
    facadeSlot = 5 + (hash % 5); // Mat 5..9
    if (hash % 10 < 5) {
      roofType = 'urethane'; // 50% 우레탄 녹색
      roofColorHex = (hash % 2 === 0) ? VWORLD_REA_ROOF_COLORS.urethaneGreenDeep : VWORLD_REA_ROOF_COLORS.urethaneGreenSage;
      roofColorRgb = [0.18, 0.42, 0.31];
    } else {
      roofType = 'concrete';
      roofColorHex = VWORLD_REA_ROOF_COLORS.concreteSlabLight;
      roofColorRgb = [0.58, 0.64, 0.72];
    }
  }

  // 4층 이상(H >= 12.0m) 건물에는 3.0m 높이 옥탑 권상기실 배치
  const hasPenthouse = height >= 12.0;

  return {
    category,
    facadeSlot,
    sideWallSlot: 16,
    podiumSlot: 17,
    signboardSlot: 18,
    roofType,
    roofColorHex,
    roofColorRgb,
    parapetColorHex: VWORLD_REA_16_PALETTE.parapetConcrete,
    parapetHeight: 0.9,
    penthouseHeight: 3.0,
    hasPenthouse,
  };
}

// =============================================================================
// [5. V-World 5단 입체 지오메트리 빌더 (geometry.addGroup 지원)]
// =============================================================================

export interface VWorldMultiPartBuildOptions {
  pts2D: Point2D[];
  baseElev: number;
  height: number;
  seed?: number;
  featProps?: Record<string, any>;
  holeIndices?: number[];
  innerRings2D?: Point2D[][];
}

/**
 * 건물을 브이월드 LOD2+ 모델 규격대로 5개 건축 파츠로 자동 분할하고
 * geometry.addGroup(start, count, matIndex)를 적용한 BufferGeometry 생성
 */
export function buildVWorldMultiPartGeometry(
  options: VWorldMultiPartBuildOptions
): THREE.BufferGeometry {
  const { pts2D, baseElev, height, seed = 0, featProps = {}, holeIndices } = options;
  const geometry = new THREE.BufferGeometry();

  if (pts2D.length < 3) return geometry;

  // 폴리곤 중심 및 근사 면적 계산
  let minX = pts2D[0].x;
  let maxX = pts2D[0].x;
  let minZ = pts2D[0].z;
  let maxZ = pts2D[0].z;
  let cX = 0;
  let cZ = 0;

  for (let i = 0; i < pts2D.length; i++) {
    const p = pts2D[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    cX += p.x;
    cZ += p.z;
  }
  cX /= pts2D.length;
  cZ /= pts2D.length;
  const approxArea = (maxX - minX) * (maxZ - minZ);

  // 건축 스타일 분류
  const style = classifyVWorldReaBuildingStyle(featProps, seed, approxArea, height);

  // 5개 파츠 높이 경계 설정
  const H = Math.max(2.5, height);
  const podiumH = Math.min(3.8, H);
  const hasUpper = H > 3.8;
  const parapetH = style.parapetHeight; // 0.9m

  // 정점 버퍼 수집용
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];

  // 머티리얼 인덱스 정의
  // 0..15: 본동 외벽 슬롯
  // 16: 0.9m 파라펫 콘크리트
  // 17: 3.0m 옥탑 권상기실
  // 18: 우레탄 초록 지붕 (roofType === 'urethane')
  // 19: 콘크리트 슬래브 지붕 (roofType === 'concrete')
  // 20: 테라코타 기와 지붕 (roofType === 'gabled')
  // 21: 코발트 블루 강판 지붕 (roofType === 'zinc')
  const matIdxMain = style.facadeSlot;
  const matIdxParapet = 16;
  const matIdxPenthouse = 17;
  let matIdxRoof = 19; // 콘크리트 기본
  if (style.roofType === 'urethane') matIdxRoof = 18;
  else if (style.roofType === 'gabled') matIdxRoof = 20;
  else if (style.roofType === 'zinc') matIdxRoof = 21;

  geometry.clearGroups();

  // ---------------------------------------------------------------------------
  // Helper: 사각형 쿼드(트라이앵글 2개) 추가
  // ---------------------------------------------------------------------------
  function addQuad(
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvBL: [number, number],
    uvBR: [number, number],
    uvTR: [number, number],
    uvTL: [number, number],
    col: [number, number, number]
  ) {
    // T1: BL, BR, TR
    positions.push(pBL[0], pBL[1], pBL[2], pBR[0], pBR[1], pBR[2], pTR[0], pTR[1], pTR[2]);
    normals.push(norm[0], norm[1], norm[2], norm[0], norm[1], norm[2], norm[0], norm[1], norm[2]);
    colors.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    uvs.push(uvBL[0], uvBL[1], uvBR[0], uvBR[1], uvTR[0], uvTR[1]);

    // T2: BL, TR, TL
    positions.push(pBL[0], pBL[1], pBL[2], pTR[0], pTR[1], pTR[2], pTL[0], pTL[1], pTL[2]);
    normals.push(norm[0], norm[1], norm[2], norm[0], norm[1], norm[2], norm[0], norm[1], norm[2]);
    colors.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    uvs.push(uvBL[0], uvBL[1], uvTR[0], uvTR[1], uvTL[0], uvTL[1]);
  }

  // ---------------------------------------------------------------------------
  // [Part 1 & Part 2] 외벽 렌더링 (1층 기단부 0~3.8m + 기준층 본동 3.8m~H)
  // ---------------------------------------------------------------------------
  const startVertexMain = positions.length / 3;
  const numPts = pts2D.length;

  for (let i = 0; i < numPts; i++) {
    const nextIdx = (i + 1) % numPts;
    const pA = pts2D[i];
    const pB = pts2D[nextIdx];

    const dx = pB.x - pA.x;
    const dz = pB.z - pA.z;
    const edgeLen = Math.hypot(dx, dz);
    if (edgeLen < 0.001) continue;

    // 외곽 법선 벡터
    const norm: [number, number, number] = [dz / edgeLen, 0, -dx / edgeLen];

    // UV 타일링 (가로 3.2m 베이 단위)
    const uSpan = edgeLen / 3.2;

    // Part 1: 기단부 (0m ~ podiumH)
    const y0 = baseElev;
    const yPodium = baseElev + podiumH;
    addQuad(
      [pA.x, y0, pA.z],
      [pB.x, y0, pB.z],
      [pB.x, yPodium, pB.z],
      [pA.x, yPodium, pA.z],
      norm,
      [0, 0],
      [uSpan, 0],
      [uSpan, podiumH / 3.0],
      [0, podiumH / 3.0],
      [0.92, 0.92, 0.92]
    );

    // Part 2: 기준층 본동 (podiumH ~ H)
    if (hasUpper) {
      const yH = baseElev + H;
      const upperH = H - podiumH;
      addQuad(
        [pA.x, yPodium, pA.z],
        [pB.x, yPodium, pB.z],
        [pB.x, yH, pB.z],
        [pA.x, yH, pA.z],
        norm,
        [0, podiumH / 3.0],
        [uSpan, podiumH / 3.0],
        [uSpan, (podiumH + upperH) / 3.0],
        [0, (podiumH + upperH) / 3.0],
        [1.0, 1.0, 1.0]
      );
    }
  }

  const countVertexMain = positions.length / 3 - startVertexMain;
  if (countVertexMain > 0) {
    geometry.addGroup(startVertexMain, countVertexMain, matIdxMain);
  }

  // ---------------------------------------------------------------------------
  // [Part 3] 옥상 테두리 입체 난간 (Parapet Wall, H ~ H + 0.9m)
  // ---------------------------------------------------------------------------
  const startVertexParapet = positions.length / 3;
  const yRoofBase = baseElev + H;
  const yParapetTop = yRoofBase + parapetH;

  for (let i = 0; i < numPts; i++) {
    const nextIdx = (i + 1) % numPts;
    const pA = pts2D[i];
    const pB = pts2D[nextIdx];

    const dx = pB.x - pA.x;
    const dz = pB.z - pA.z;
    const edgeLen = Math.hypot(dx, dz);
    if (edgeLen < 0.001) continue;

    const norm: [number, number, number] = [dz / edgeLen, 0, -dx / edgeLen];
    const uSpan = edgeLen / 3.2;

    // 돌출 난간 외벽
    addQuad(
      [pA.x, yRoofBase, pA.z],
      [pB.x, yRoofBase, pB.z],
      [pB.x, yParapetTop, pB.z],
      [pA.x, yParapetTop, pA.z],
      norm,
      [0, 0],
      [uSpan, 0],
      [uSpan, parapetH / 3.0],
      [0, parapetH / 3.0],
      [0.85, 0.85, 0.85]
    );

    // 안쪽 깊은 AO 그림자를 위한 내벽 (역방향 법선)
    const inNorm: [number, number, number] = [-norm[0], 0, -norm[2]];
    addQuad(
      [pB.x, yRoofBase, pB.z],
      [pA.x, yRoofBase, pA.z],
      [pA.x, yParapetTop, pA.z],
      [pB.x, yParapetTop, pB.z],
      inNorm,
      [0, 0],
      [uSpan, 0],
      [uSpan, parapetH / 3.0],
      [0, parapetH / 3.0],
      [0.55, 0.55, 0.55] // 안쪽 그림자 음영
    );
  }

  const countVertexParapet = positions.length / 3 - startVertexParapet;
  if (countVertexParapet > 0) {
    geometry.addGroup(startVertexParapet, countVertexParapet, matIdxParapet);
  }

  // ---------------------------------------------------------------------------
  // [Part 4] V-World 실사 지붕 바닥 4종 분리 (Rooftop Deck at H)
  // ---------------------------------------------------------------------------
  const startVertexRoof = positions.length / 3;
  const flatCoords: number[] = [];
  for (let i = 0; i < numPts; i++) {
    flatCoords.push(pts2D[i].x, pts2D[i].z);
  }

  const triIndices = Earcut(flatCoords, holeIndices, 2);
  const rNorm: [number, number, number] = [0, 1, 0];
  const rCol = style.roofColorRgb;

  for (let k = 0; k < triIndices.length; k += 3) {
    const idx0 = triIndices[k];
    const idx1 = triIndices[k + 1];
    const idx2 = triIndices[k + 2];

    const p0 = pts2D[idx0];
    const p1 = pts2D[idx1];
    const p2 = pts2D[idx2];

    positions.push(p0.x, yRoofBase, p0.z, p1.x, yRoofBase, p1.z, p2.x, yRoofBase, p2.z);
    normals.push(rNorm[0], rNorm[1], rNorm[2], rNorm[0], rNorm[1], rNorm[2], rNorm[0], rNorm[1], rNorm[2]);
    colors.push(rCol[0], rCol[1], rCol[2], rCol[0], rCol[1], rCol[2], rCol[0], rCol[1], rCol[2]);

    // 평면 UV 투영
    uvs.push(
      (p0.x - minX) / Math.max(1, maxX - minX),
      (p0.z - minZ) / Math.max(1, maxZ - minZ),
      (p1.x - minX) / Math.max(1, maxX - minX),
      (p1.z - minZ) / Math.max(1, maxZ - minZ),
      (p2.x - minX) / Math.max(1, maxX - minX),
      (p2.z - minZ) / Math.max(1, maxZ - minZ)
    );
  }

  const countVertexRoof = positions.length / 3 - startVertexRoof;
  if (countVertexRoof > 0) {
    geometry.addGroup(startVertexRoof, countVertexRoof, matIdxRoof);
  }

  // ---------------------------------------------------------------------------
  // [Part 5] 4층 이상 엘리베이터 옥탑방 권상기실 (Penthouse Core, H ~ H + 3.0m)
  // ---------------------------------------------------------------------------
  if (style.hasPenthouse && (maxX - minX) >= 8.0 && (maxZ - minZ) >= 8.0) {
    const startVertexPenthouse = positions.length / 3;
    const coreW = Math.min(10.0, (maxX - minX) * 0.35);
    const coreD = Math.min(10.0, (maxZ - minZ) * 0.35);
    const coreH = style.penthouseHeight; // 3.0m
    const yCoreBase = yRoofBase;
    const yCoreTop = yRoofBase + coreH;

    const halfW = coreW * 0.5;
    const halfD = coreD * 0.5;

    // 옥탑방 사각 박스 코너
    const c0: Point2D = { x: cX - halfW, z: cZ - halfD };
    const c1: Point2D = { x: cX + halfW, z: cZ - halfD };
    const c2: Point2D = { x: cX + halfW, z: cZ + halfD };
    const c3: Point2D = { x: cX - halfW, z: cZ + halfD };
    const coreCorners = [c0, c1, c2, c3];

    // 4면 외벽
    for (let i = 0; i < 4; i++) {
      const nextI = (i + 1) % 4;
      const pa = coreCorners[i];
      const pb = coreCorners[nextI];
      const ndx = pb.x - pa.x;
      const ndz = pb.z - pa.z;
      const nlen = Math.hypot(ndx, ndz);
      const cNorm: [number, number, number] = [ndz / nlen, 0, -ndx / nlen];

      addQuad(
        [pa.x, yCoreBase, pa.z],
        [pb.x, yCoreBase, pb.z],
        [pb.x, yCoreTop, pb.z],
        [pa.x, yCoreTop, pa.z],
        cNorm,
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0.85, 0.85, 0.85]
      );
    }

    // 옥탑방 윗면
    addQuad(
      [c0.x, yCoreTop, c0.z],
      [c1.x, yCoreTop, c1.z],
      [c2.x, yCoreTop, c2.z],
      [c3.x, yCoreTop, c3.z],
      [0, 1, 0],
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.75, 0.75, 0.75]
    );

    const countVertexPenthouse = positions.length / 3 - startVertexPenthouse;
    if (countVertexPenthouse > 0) {
      geometry.addGroup(startVertexPenthouse, countVertexPenthouse, matIdxPenthouse);
    }
  }

  // BufferAttributes 설정
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * 1동의 건물에 대해 5단 파츠 분할 및 22종 Material 배열을 바인딩한 THREE.Mesh 생성
 */
export function composeVWorldBuildingMesh(
  options: VWorldMultiPartBuildOptions
): THREE.Mesh {
  const geometry = buildVWorldMultiPartGeometry(options);
  const materials = getVWorldReaAllMaterials();
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.frustumCulled = false;
  return mesh;
}

// =============================================================================
// [6. MapLibre GL JS 네이티브 5단 fill-extrusion 파이프라인 레이어 팩토리]
// =============================================================================

export const VWORLD_REA_PATTERN_IDS = {
  PODIUM_COMMERCIAL: 'vworld-rea-podium-signboard',
  WINDOW_FACADE_GRID: 'vworld-rea-window-facade-grid',
  ROOF_PARAPET_AO: 'vworld-rea-roof-parapet-ao',
  PENTHOUSE_CORE: 'vworld-rea-penthouse-core',
} as const;

export const REA_PATTERN_IDS = VWORLD_REA_PATTERN_IDS;

export function createVWorldReaPodiumSignboardImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 화강석 베이스 (#1e293b)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  // 상단 가로 간판 띠
  const signH = Math.round(size * 0.28);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, signH);

  // 빨강/파랑 원색 간판
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(4, 4, Math.round(size * 0.45), signH - 8);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(Math.round(size * 0.52), 4, Math.round(size * 0.42), signH - 8);

  // 하단 쇼윈도 통유리 2구획
  const winY = signH + 8;
  const winH = size - winY - 8;
  const winW = Math.round((size - 24) / 2);

  for (let col = 0; col < 2; col++) {
    const wx = 8 + col * (winW + 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);

    const g = ctx.createLinearGradient(wx, winY, wx, winY + winH);
    g.addColorStop(0, '#f0f9ff');
    g.addColorStop(0.5, '#e0f2fe');
    g.addColorStop(1, '#bae6fd');
    ctx.fillStyle = g;
    ctx.fillRect(wx, winY, winW, winH);

    ctx.fillStyle = '#475569';
    ctx.fillRect(wx + winW - 6, winY + Math.round(winH * 0.4), 3, 20);
  }

  return ctx.getImageData(0, 0, size, size);
}

export function createVWorldReaWindowFacadeGridImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  const floorH = size / 2;
  for (let f = 0; f < 2; f++) {
    const fY = f * floorH;

    // 층간 콘크리트 슬래브 띠
    ctx.fillStyle = '#e2e8f0f0';
    ctx.fillRect(0, fY, size, 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, fY + 12, size, 2);

    // 세대별 창문 2베이
    const marginSide = 14;
    const centerGap = 16;
    const winW = Math.round((size - marginSide * 2 - centerGap) / 2);
    const winY = fY + 22;
    const winH = floorH - 34;

    const winXs = [marginSide, marginSide + winW + centerGap];
    for (const wx of winXs) {
      // 화이트 샤시 프레임
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);

      // 다크 네이비 유리창
      const g = ctx.createLinearGradient(wx, winY, wx, winY + winH);
      g.addColorStop(0, '#2c3e50');
      g.addColorStop(0.35, '#1e293b');
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(wx, winY, winW, winH);

      // 중앙 세로 멀리언
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(wx + winW / 2 - 1.5), winY, 3, winH);
      ctx.fillRect(wx, Math.round(winY + winH * 0.42), winW, 2);

      // 발코니 안전 난간
      const railTop = Math.round(winY + winH * 0.60);
      const railH = winH - Math.round(winH * 0.60);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(wx + 2, railTop, winW - 4, 3);

      const pickets = 5;
      const pStep = (winW - 8) / (pickets + 1);
      ctx.fillStyle = '#94a3b8';
      for (let p = 1; p <= pickets; p++) {
        ctx.fillRect(Math.round(wx + 4 + p * pStep), railTop + 3, 2, railH - 3);
      }
    }
  }

  return ctx.getImageData(0, 0, size, size);
}

export function createVWorldReaRoofParapetAOImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 회백색 콘크리트 난간 벽체
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, size, size);

  // 두겁석 라인
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, 14);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 14, size, 3);

  // 하단 AO 그림자
  const g = ctx.createLinearGradient(0, size - 32, 0, size);
  g.addColorStop(0, 'rgba(15, 23, 42, 0.0)');
  g.addColorStop(1, 'rgba(15, 23, 42, 0.65)');
  ctx.fillStyle = g;
  ctx.fillRect(0, size - 32, size, 32);

  return ctx.getImageData(0, 0, size, size);
}

export function createVWorldReaPenthouseCoreImage(size = 256): ImageData | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  // 옥탑 콘크리트 외벽
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 0, size, size);

  // 환기 루버 그릴
  const louverX = 24;
  const louverY = 24;
  const louverW = Math.round(size * 0.45);
  const louverH = Math.round(size * 0.55);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);

  ctx.fillStyle = '#cbd5e1';
  for (let ly = louverY + 4; ly < louverY + louverH - 2; ly += 6) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 2.5);
  }

  // 철제 출입 도어
  const doorX = Math.round(size * 0.65);
  const doorY = 32;
  const doorW = Math.round(size * 0.25);
  const doorH = size - doorY - 12;

  ctx.fillStyle = '#475569';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(doorX + 3, doorY + 3, doorW - 6, doorH - 6);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(doorX + doorW - 8, doorY + Math.round(doorH * 0.5), 3, 14);

  return ctx.getImageData(0, 0, size, size);
}

export function ensureVWorldReaPatterns(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;

  const patterns = [
    { id: VWORLD_REA_PATTERN_IDS.PODIUM_COMMERCIAL, fn: createVWorldReaPodiumSignboardImage },
    { id: VWORLD_REA_PATTERN_IDS.WINDOW_FACADE_GRID, fn: createVWorldReaWindowFacadeGridImage },
    { id: VWORLD_REA_PATTERN_IDS.ROOF_PARAPET_AO, fn: createVWorldReaRoofParapetAOImage },
    { id: VWORLD_REA_PATTERN_IDS.PENTHOUSE_CORE, fn: createVWorldReaPenthouseCoreImage },
  ];

  for (const p of patterns) {
    if (!map.hasImage(p.id)) {
      try {
        const img = p.fn(256);
        if (img) {
          map.addImage(p.id, img);
        }
      } catch (err) {
        console.warn(`[VWorldReaPatterns] addImage notice (${p.id}):`, err);
      }
    }
  }
}
export const ensureReaPatterns = ensureVWorldReaPatterns;

/**
 * MapLibre 5단 다층 건축 파츠 레이어 생성기
 */
export function createVWorldReaBuildingLayers(
  sourceId: string = 'openmaptiles-vector',
  sourceLayer?: string,
  prefix: string = ''
): maplibregl.LayerSpecification[] {
  const p = prefix ? `${prefix}-` : '';
  const isGeojson = sourceId.endsWith('-source') || sourceId.includes('geojson') || !sourceLayer || sourceLayer === 'none';
  const srcLayerObj = isGeojson ? {} : { 'source-layer': sourceLayer || 'building' };

  // 비건물 거대 폴리곤 & 임야 마스킹 필터링 (산림 임야, 골프장, 4,500㎡ 초과 비건물 원천 배제)
  const buildingFilter: any = [
    'all',
    ['!=', ['get', 'is_non_building'], true],
    ['!=', ['get', 'is_site_boundary'], true],
    ['!=', ['get', 'layer_type'], 'cadastral'],
    ['!=', ['get', 'layer_type'], 'zoning'],
    ['!=', ['get', 'building'], 'no'],
    ['!=', ['get', 'jimok'], '임'],
    ['!=', ['get', 'jimok'], '임야'],
    ['!=', ['get', 'jimok_nm'], '임야'],
    ['<=', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 0], 0], 4500],
    ['!', ['has', 'UQ111']],
    ['!', ['has', 'UQ111_NM']],
    ['!', ['has', 'uq111']],
    ['!', ['has', 'zoneName']],
    ['!', ['has', 'zone_nm']],
    ['!', ['has', 'spfc_nm']],
    ['!', ['has', 'spfc_cd']],
    ['!', ['has', 'landuse']],
    ['!', ['has', 'leisure']],
    ['!', ['has', 'natural']],
  ];

  // Part 1: 1층 상가/로비 기단부 (0m ~ 3.8m)
  const part1Podium: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier1-podium`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': VWORLD_REA_PODIUM_COLOR_EXPR,
      'fill-extrusion-base': gpuBuildingBaseExpr,
      'fill-extrusion-height': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Part 2: 기준층 본동 (3.8m ~ H) - 16종 서울 V-World 실사 컬러 스펙트럼
  const part2MainWall: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier2-mainwall`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': VWORLD_REA_16_SPECTRUM_EXPR,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Part 3: 창문 파사드 오버레이 (3.8m ~ H) - 3.0m 층별 슬래브 + 백색 샤시 격자
  const part2WindowPattern: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier3-pattern`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11.5,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': VWORLD_REA_PATTERN_IDS.WINDOW_FACADE_GRID,
      'fill-extrusion-base': ['min', 3.8, BUILDING_HEIGHT_EXPR],
      'fill-extrusion-height': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.88,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Part 4: 옥상 테두리 입체 난간(Parapet, H ~ H + 0.9m) & 4종 실사 옥상 바닥
  const part4RoofCap: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier4-roofcap`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: buildingFilter,
    minzoom: 11,
    maxzoom: 24,
    paint: {
      'fill-extrusion-color': VWORLD_REA_ROOFTOP_4TYPE_COLOR_EXPR,
      'fill-extrusion-base': BUILDING_HEIGHT_EXPR,
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 0.9],
      'fill-extrusion-opacity': 1.0,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // Part 5: 4층 이상(H >= 12.0m) 옥상 엘리베이터 권상기실 (Penthouse Core, H + 0.9m ~ H + 3.9m)
  const penthouseFilter: any = [
    'all',
    ...buildingFilter.slice(1),
    ['>=', BUILDING_HEIGHT_EXPR, 12.0],
  ];

  const part5Penthouse: maplibregl.LayerSpecification = {
    id: `${p}bldg-tier5-roofdetail`,
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: penthouseFilter,
    minzoom: 13.5,
    maxzoom: 24,
    paint: {
      'fill-extrusion-pattern': VWORLD_REA_PATTERN_IDS.PENTHOUSE_CORE,
      'fill-extrusion-base': ['+', BUILDING_HEIGHT_EXPR, 0.9],
      'fill-extrusion-height': ['+', BUILDING_HEIGHT_EXPR, 3.9], // 3.0m 높이 옥탑방 박스
      'fill-extrusion-opacity': 0.95,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  return [part1Podium, part2MainWall, part2WindowPattern, part4RoofCap, part5Penthouse];
}

export const createReaBuildingStackLayers = createVWorldReaBuildingLayers;
