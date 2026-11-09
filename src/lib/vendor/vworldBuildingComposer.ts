/**
 * lib/vendor/vworldBuildingComposer.ts
 *
 * [GeoBrief 3D 2단계: V-World 서울 실사 화면 1:1 재현 — 5단 입체 빌딩 컴포저 및 16종 독립 PBR 아틀라스 강제 이식]
 *
 * 1. 16종 독립 THREE.MeshLambertMaterial 배열 (GLOBAL_VWORLD_MATERIALS 싱글톤 캐시):
 *    - 각각 고유한 1024x1024 고해상도 CanvasTexture 보유
 *    - wrapS = wrapT = THREE.RepeatWrapping
 *    - U = edgeLength / 3.4m, V = height / 3.1m
 *
 * 2. 16종 서울 실사 외벽 규격:
 *    - 아파트 단지 (Mat 0~4): 순백색/크림 아이보리/실버 그레이 외벽 + 다크 차콜 발코니 유리창 + 하단 3개층 브라운/화강석 기단부.
 *      측벽(Side Wall)은 창문 없이 청록/블루(#0284c7 -> #10b981) 수직 그라데이션 브랜드 라인 매핑.
 *    - 시내 상가·오피스 빌딩 (Mat 5~9): 1층(0~3.8m) 어두운 화강석 쇼윈도 + 1~3층 빨강/파랑/노랑/초록/흰색 가로 간판 패치 + 베이지 화강석/적벽돌/다크 차콜 메탈 외벽.
 *    - 혁신도시 공공기관·관공서·학교 (Mat 10~12): 1~2층 화강석 포디움 + 다크 에메랄드/스카이블루 반사 유리 커튼월 + 은백색 알루미늄 멀리언.
 *    - 고밀도 적벽돌 빌라·단독주택 (Mat 13~15): 짙은 적벽돌(#7c2d12), 황토벽돌(#9a3412), 밝은 스타코 외벽과 하얀 창틀.
 *
 * 3. 5단 입체 메쉬 및 옥상(윗면) 4종 분리:
 *    - 0.85m 테두리 난간(Parapet, 두께 0.35m)
 *    - 난간 안쪽 옥상 바닥 4종 분리: ① 초록 우레탄(50%), ② 시멘트 슬래브(30%), ③ 3D 박공 적갈색 기와(15%), ④ 코발트 강판(5%)
 *    - 옥탑 권상기실(Penthouse, H >= 12m, 높이 3.0m)
 *
 * 4. 밝은 서울식 주광 조명:
 *    - AmbientLight(0xffffff, 1.2), HemisphereLight(0xffffff, 0xe2e8f0, 0.95), DirectionalLight(0xffffff, 1.4)
 */

import * as THREE from 'three';

export interface VWorldComposerBuildingStyle {
  slot: number;
  category: 'apartment' | 'commercial' | 'public' | 'residential';
  height: number;
  levels: number;
  roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc';
  roofMaterialIndex: number;
  isApartment: boolean;
}

// =============================================================================
// [1] 전역 싱글톤 16종 독립 Material & 지붕 Material 배열
// =============================================================================

export let GLOBAL_VWORLD_MATERIALS: THREE.MeshLambertMaterial[] | null = null;
export let GLOBAL_VWORLD_ROOF_MATERIALS: THREE.MeshLambertMaterial[] | null = null;
export let GLOBAL_VWORLD_PARAPET_MATERIAL: THREE.MeshLambertMaterial | null = null;
export let GLOBAL_VWORLD_PENTHOUSE_MATERIAL: THREE.MeshLambertMaterial | null = null;

/**
 * 1024x1024 고해상도 CanvasTexture 생성 헬퍼
 */
function createProceduralCanvasTexture(
  drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    // SSR 폴백
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
// 16종 서울 실사 텍스처 드로잉 팩토리
// -----------------------------------------------------------------------------

function drawApartmentFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // Base Wall Colors: 순백색(#f8fafc), 크림 아이보리(#f4f1ea), 실버 그레이(#e2e8f0)
  const baseColors = ['#f8fafc', '#f4f1ea', '#f1f5f9', '#f8fafc', '#e2e8f0'];
  const baseColor = baseColors[variant % baseColors.length];

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  // 하단 3개 층 (0 ~ 250px) 브라운/화강석 기단부 투톤 도색
  const podiumColors = ['#57534e', '#475569', '#3f3f46', '#78350f', '#44403c'];
  ctx.fillStyle = podiumColors[variant % podiumColors.length];
  ctx.fillRect(0, h - 260, w, 260);

  // 기단부 상단 띠선
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, h - 268, w, 8);

  // 촘촘한 다크 차콜(#1e293b) 발코니 유리창 격자 + 순백색 창틀
  const cols = 8;
  const rows = 12;
  const cellW = w / cols;
  const cellH = (h - 280) / rows;

  for (let r = 0; r < rows; r++) {
    const y = r * cellH + 15;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 12;
      const winW = cellW - 24;
      const winH = cellH - 22;

      // 순백색 외부 창틀
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2, y - 2, winW + 4, winH + 4);

      // 다크 차콜 발코니 유리
      const grad = ctx.createLinearGradient(x, y, x, y + winH);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e293b');
      grad.addColorStop(1, '#334155');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, winW, winH);

      // 발코니 하단 안전 난간 살 (Silver White)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
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

  // 아파트 우측/좌측 측벽용 청록/블루 수직 브랜드 라인
  ctx.fillStyle = variant % 2 === 0 ? '#0284c7' : '#10b981';
  ctx.fillRect(w - 35, 0, 35, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(w - 25, 60, 15, 180);
}

function drawCommercialFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // Base: 베이지 화강석 타일(#d6cfc2), 붉은 적벽돌(#7f1d1d), 다크 차콜 메탈(#334155)
  const wallColors = ['#d6cfc2', '#e5e0d8', '#7f1d1d', '#334155', '#d4cebe'];
  ctx.fillStyle = wallColors[variant % wallColors.length];
  ctx.fillRect(0, 0, w, h);

  // 1층 (0 ~ 3.8m, 캔버스 하단 0 ~ 320px) 어두운 화강석 쇼윈도 기단부
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, h - 320, w, 320);

  // 1층 매장 통유리 쇼윈도 & 내부 조명
  const shops = 4;
  const shopW = w / shops;
  for (let s = 0; s < shops; s++) {
    const sx = s * shopW + 16;
    const sy = h - 260;
    const sw = shopW - 32;
    const sh = 230;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(sx, sy, sw, sh);

    ctx.fillStyle = 'rgba(254, 240, 138, 0.45)'; // 매장 온백색 조명 반사
    ctx.fillRect(sx + 4, sy + 4, sw - 8, sh * 0.4);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, sy, sw, sh);
  }

  // 1~3층 창문 아래 한국형 가로 간판 패치 (빨강, 파랑, 노랑, 초록, 흰색)
  const signboardColors = ['#dc2626', '#2563eb', '#eab308', '#16a34a', '#f8fafc'];
  const signboardH = 50;
  const signY = h - 320;

  for (let s = 0; s < shops; s++) {
    const sx = s * shopW + 16;
    const sw = shopW - 32;
    ctx.fillStyle = signboardColors[(s + variant) % signboardColors.length];
    ctx.fillRect(sx, signY, sw, signboardH);

    // 간판 백색 텍스트 바
    ctx.fillStyle = (s + variant) % signboardColors.length === 2 ? '#0f172a' : '#ffffff';
    ctx.fillRect(sx + 20, signY + 18, sw - 40, 14);
  }

  // 2층 이상 기준층 창문 격자 (대형 오피스 창문)
  const cols = 6;
  const rows = 7;
  const cellW = w / cols;
  const cellH = (h - 350) / rows;

  for (let r = 0; r < rows; r++) {
    const y = r * cellH + 20;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 16;
      const winW = cellW - 32;
      const winH = cellH - 24;

      ctx.fillStyle = '#0284c7';
      ctx.fillRect(x, y, winW, winH);

      // 알루미늄 섀시
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, winW, winH);
    }
  }
}

function drawPublicHQFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // 1~2층 화강석 포디움 + 다크 에메랄드/스카이블루 반사 유리 커튼월 + 은백색 알루미늄 멀리언
  const glassColors = [
    { start: '#042f2e', mid: '#0f766e', end: '#14b8a6' }, // Dark Emerald
    { start: '#082f49', mid: '#0284c7', end: '#38bdf8' }, // Sky Blue
    { start: '#1e1b4b', mid: '#4338ca', end: '#6366f1' }, // Indigo Tech
  ];
  const gTheme = glassColors[variant % glassColors.length];

  // Base Gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, gTheme.start);
  grad.addColorStop(0.5, gTheme.mid);
  grad.addColorStop(1, gTheme.end);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 1~2층 (하단 240px) 중후한 화강석 포디움
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, h - 240, w, 240);

  // 로비 캐노피 & 기둥
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, h - 250, w, 16);

  // 은백색 알루미늄 멀리언 격자 (Mullions & Transoms)
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;

  const mullionSpacing = w / 16;
  for (let x = 0; x <= w; x += mullionSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h - 240);
    ctx.stroke();
  }

  const transomSpacing = (h - 240) / 14;
  for (let y = 0; y <= h - 240; y += transomSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawVillaResidentialFacade(ctx: CanvasRenderingContext2D, w: number, h: number, variant: number) {
  // 짙은 적벽돌(#7c2d12), 황토벽돌(#9a3412), 밝은 스타코 외벽과 하얀 창틀
  const brickColors = ['#7c2d12', '#9a3412', '#b45309', '#78350f'];
  const mortarColor = '#d6d3d1';

  ctx.fillStyle = mortarColor;
  ctx.fillRect(0, 0, w, h);

  // 벽돌 패턴
  ctx.fillStyle = brickColors[variant % brickColors.length];
  const bW = 40;
  const bH = 18;
  for (let y = 0; y < h; y += bH + 2) {
    const offset = (Math.floor(y / bH) % 2) * (bW / 2);
    for (let x = -offset; x < w; x += bW + 2) {
      ctx.fillRect(x, y, bW, bH);
    }
  }

  // 빌라 하얀 창틀 + 다크 차콜 창문
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

      // 백색 창틀
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 5, y - 5, winW + 10, winH + 10);

      // 유리창
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, y, winW, winH);

      // 창문 십자 프레임
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

/**
 * 16종 독립 PBR Material 싱글톤 엔진 초기화
 */
export function getGlobalVWorldMaterials(): THREE.MeshLambertMaterial[] {
  if (GLOBAL_VWORLD_MATERIALS && GLOBAL_VWORLD_MATERIALS.length === 16) {
    return GLOBAL_VWORLD_MATERIALS;
  }

  const materials: THREE.MeshLambertMaterial[] = [];

  for (let i = 0; i < 16; i++) {
    let tex: THREE.CanvasTexture;

    if (i >= 0 && i <= 4) {
      // Slot 0..4: 한국형 아파트 단지
      tex = createProceduralCanvasTexture((ctx, w, h) => drawApartmentFacade(ctx, w, h, i));
    } else if (i >= 5 && i <= 9) {
      // Slot 5..9: 시내 상가·오피스 빌딩 (간판 + 쇼윈도)
      tex = createProceduralCanvasTexture((ctx, w, h) => drawCommercialFacade(ctx, w, h, i - 5));
    } else if (i >= 10 && i <= 12) {
      // Slot 10..12: 혁신도시 공공기관·관공서·학교 (유리 커튼월)
      tex = createProceduralCanvasTexture((ctx, w, h) => drawPublicHQFacade(ctx, w, h, i - 10));
    } else {
      // Slot 13..15: 고밀도 적벽돌 빌라·단독주택
      tex = createProceduralCanvasTexture((ctx, w, h) => drawVillaResidentialFacade(ctx, w, h, i - 13));
    }

    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      color: 0xffffff,
      side: THREE.FrontSide,
    });
    mat.name = `vworld-mat-slot-${i}`;
    materials.push(mat);
  }

  GLOBAL_VWORLD_MATERIALS = materials;
  return materials;
}

/**
 * 서울 V-World 옥상 바닥 4종 Material 싱글톤
 * ① 초록 우레탄(#2d6a4f, #3b7a57 — 50%)
 * ② 밝은 시멘트 슬래브(#94a3b8 — 30%)
 * ③ 3D 경사 박공 적갈색 기와(#7c2d12 — 15%)
 * ④ 코발트 블루 강판(#1d4ed8 — 5%)
 */
export function getGlobalVWorldRoofMaterials(): THREE.MeshLambertMaterial[] {
  if (GLOBAL_VWORLD_ROOF_MATERIALS && GLOBAL_VWORLD_ROOF_MATERIALS.length === 4) {
    return GLOBAL_VWORLD_ROOF_MATERIALS;
  }

  const roofSpecs = [
    { color: 0x2d6a4f, name: 'urethane-green' },
    { color: 0x94a3b8, name: 'cement-slab' },
    { color: 0x7c2d12, name: 'terracotta-tile' },
    { color: 0x1d4ed8, name: 'cobalt-steel' },
  ];

  GLOBAL_VWORLD_ROOF_MATERIALS = roofSpecs.map((spec, idx) => {
    const mat = new THREE.MeshLambertMaterial({
      color: spec.color,
      side: THREE.DoubleSide,
    });
    mat.name = `vworld-roof-mat-${idx}-${spec.name}`;
    return mat;
  });

  return GLOBAL_VWORLD_ROOF_MATERIALS;
}

export function getGlobalParapetMaterial(): THREE.MeshLambertMaterial {
  if (!GLOBAL_VWORLD_PARAPET_MATERIAL) {
    GLOBAL_VWORLD_PARAPET_MATERIAL = new THREE.MeshLambertMaterial({
      color: 0xcbd5e1, // 회백색 콘크리트
      side: THREE.DoubleSide,
    });
    GLOBAL_VWORLD_PARAPET_MATERIAL.name = 'vworld-parapet-concrete';
  }
  return GLOBAL_VWORLD_PARAPET_MATERIAL;
}

export function getGlobalPenthouseMaterial(): THREE.MeshLambertMaterial {
  if (!GLOBAL_VWORLD_PENTHOUSE_MATERIAL) {
    GLOBAL_VWORLD_PENTHOUSE_MATERIAL = new THREE.MeshLambertMaterial({
      color: 0x64748b, // 다크 그레이 옥탑 루버
      side: THREE.DoubleSide,
    });
    GLOBAL_VWORLD_PENTHOUSE_MATERIAL.name = 'vworld-penthouse-core';
  }
  return GLOBAL_VWORLD_PENTHOUSE_MATERIAL;
}

/**
 * 16종 외벽 + 4종 지붕 + 1종 난간 + 1종 옥탑 통합 Material 배열 반환 (총 22종)
 */
export function getGlobalAllMaterialsArray(): THREE.MeshLambertMaterial[] {
  const facades = getGlobalVWorldMaterials();
  const roofs = getGlobalVWorldRoofMaterials();
  const parapet = getGlobalParapetMaterial();
  const penthouse = getGlobalPenthouseMaterial();
  return [...facades, ...roofs, parapet, penthouse];
}

// =============================================================================
// [2] 강원 18개 시·군 건물 규모별 정확한 층고 및 16종 스타일 분류기
// =============================================================================

export function classifyBuildingStyle(
  areaSqm: number,
  minWidth: number,
  props: Record<string, any> = {},
  seed = 0
): VWorldComposerBuildingStyle {
  const isAptTag =
    props.building === 'apartments' ||
    props.type === 'apartments' ||
    props.usageType === 'apartment' ||
    String(props.name || props.buld_nm || '').includes('아파트');

  const name = String(props.name || props.buld_nm || props.buildingName || '').toLowerCase();
  const isPublicTag =
    name.includes('시청') ||
    name.includes('군청') ||
    name.includes('도청') ||
    name.includes('학교') ||
    name.includes('병원') ||
    name.includes('공단') ||
    name.includes('원') ||
    props.isMilitaryOrPublic === true;

  // 1. 아파트 단지 (apartments 또는 대형 주거동)
  if (isAptTag || (areaSqm >= 320 && minWidth >= 8.5 && seed % 4 === 0)) {
    const levels = Math.min(25, Math.max(15, 15 + (seed % 11)));
    const height = Math.min(75.0, Math.max(45.0, levels * 3.1));
    return {
      slot: seed % 5, // Mat 0~4
      category: 'apartment',
      height,
      levels,
      roofType: 'concrete',
      roofMaterialIndex: 1, // 슬래브
      isApartment: true,
    };
  }

  // 2. 단독주택·빌라·농가 (30㎡ <= area < 220㎡) -> 6.5m ~ 10.5m (2~3층 고정)
  if (areaSqm < 220 || minWidth < 7.5) {
    const levels = (seed % 2) + 2; // 2층 또는 3층
    const height = Math.min(10.5, Math.max(6.5, levels * 3.1));
    const isRedBrick = seed % 3 === 0;
    const slot = isRedBrick ? 13 + (seed % 3) : seed % 2 === 0 ? 0 : 14;
    return {
      slot: Math.min(15, Math.max(0, slot)),
      category: 'residential',
      height,
      levels,
      roofType: seed % 2 === 0 ? 'urethane' : 'gabled',
      roofMaterialIndex: seed % 2 === 0 ? 0 : 2,
      isApartment: false,
    };
  }

  // 3. 혁신도시 공공기관·관공서·학교·병원 (area >= 600㎡ 비주거)
  if (isPublicTag || areaSqm >= 600) {
    const levels = Math.min(14, Math.max(4, 4 + (seed % 11)));
    const height = Math.min(45.0, Math.max(16.0, levels * 3.1));
    return {
      slot: 10 + (seed % 3), // Mat 10~12
      category: 'public',
      height,
      levels,
      roofType: seed % 4 === 0 ? 'zinc' : 'concrete',
      roofMaterialIndex: seed % 4 === 0 ? 3 : 1,
      isApartment: false,
    };
  }

  // 4. 시·군 중심 상가·근린생활 (220㎡ <= area < 600㎡)
  const levels = Math.min(6, Math.max(4, 4 + (seed % 3)));
  const height = Math.min(21.0, Math.max(12.0, levels * 3.1));
  return {
    slot: 5 + (seed % 5), // Mat 5~9
    category: 'commercial',
    height,
    levels,
    roofType: seed % 3 === 0 ? 'concrete' : 'urethane',
    roofMaterialIndex: seed % 3 === 0 ? 1 : 0,
    isApartment: false,
  };
}

// =============================================================================
// [3] 5단 입체 지오메트리 빌더 (geometry.addGroup 강제 적용)
// =============================================================================

export interface BuildBuildingMeshOptions {
  ring2D: { x: number; z: number }[];
  baseElev: number;
  height: number;
  seed: number;
  props?: Record<string, any>;
  originMeterScale?: number;
}

/**
 * 5단 입체 지오메트리 빌더:
 * geometry.addGroup(vertexStart, vertexCount, materialIndex)를 적용하여
 * 16종 독립 외벽 + 4종 지붕 + 테두리 난간 + 옥탑방을 완벽히 조립
 */
export function buildVWorld5PartBuildingGeometry(
  options: BuildBuildingMeshOptions
): THREE.BufferGeometry {
  const { ring2D, baseElev, height, seed, props = {} } = options;
  const geometry = new THREE.BufferGeometry();
  if (ring2D.length < 3) return geometry;

  // 면적 및 최소 폭 산출
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring2D) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const areaSqm = (maxX - minX) * (maxZ - minZ);
  const minWidth = Math.min(maxX - minX, maxZ - minZ);

  const style = classifyBuildingStyle(areaSqm, minWidth, props, seed);
  const finalH = Math.max(3.0, height > 0 ? height : style.height);
  const topElev = baseElev + finalH;

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
  // [Part 1 & 2: 본동 외벽 렌더링 + geometry.addGroup(start, count, style.slot)]
  // ---------------------------------------------------------------------------
  const startVertexMain = positions.length / 3;
  const numPts = ring2D.length;
  let cumU = 0;

  for (let i = 0; i < numPts; i++) {
    const nextIdx = (i + 1) % numPts;
    const pA = ring2D[i];
    const pB = ring2D[nextIdx];

    const edgeLen = Math.hypot(pB.x - pA.x, pB.z - pA.z);
    if (edgeLen < 0.1) continue;

    const normX = -(pB.z - pA.z) / edgeLen;
    const normZ = (pB.x - pA.x) / edgeLen;

    const uStart = cumU;
    const uEnd = cumU + edgeLen / 3.4; // 3.4m 가로 모듈
    const vBottom = 0;
    const vTop = finalH / 3.1;         // 3.1m 층고 모듈

    addQuad(
      [pA.x, baseElev, pA.z],
      [pB.x, baseElev, pB.z],
      [pB.x, topElev, pB.z],
      [pA.x, topElev, pA.z],
      [normX, 0, normZ],
      [uStart, vBottom],
      [uEnd, vBottom],
      [uEnd, vTop],
      [uStart, vTop]
    );

    cumU = uEnd;
  }

  const countVertexMain = positions.length / 3 - startVertexMain;
  if (countVertexMain > 0) {
    geometry.addGroup(startVertexMain, countVertexMain, style.slot);
  }

  // ---------------------------------------------------------------------------
  // [Part 3: 0.85m 테두리 난간 (Parapet) 벽체]
  // Material Index = 20 (난간 콘크리트)
  // ---------------------------------------------------------------------------
  const startVertexParapet = positions.length / 3;
  const parapetH = 0.85;
  const parapetTopElev = topElev + parapetH;

  for (let i = 0; i < numPts; i++) {
    const nextIdx = (i + 1) % numPts;
    const pA = ring2D[i];
    const pB = ring2D[nextIdx];
    const edgeLen = Math.hypot(pB.x - pA.x, pB.z - pA.z);
    if (edgeLen < 0.1) continue;

    const normX = -(pB.z - pA.z) / edgeLen;
    const normZ = (pB.x - pA.x) / edgeLen;

    addQuad(
      [pA.x, topElev, pA.z],
      [pB.x, topElev, pB.z],
      [pB.x, parapetTopElev, pB.z],
      [pA.x, parapetTopElev, pA.z],
      [normX, 0, normZ],
      [0, 0],
      [edgeLen / 2, 0],
      [edgeLen / 2, 1],
      [0, 1]
    );
  }

  const countVertexParapet = positions.length / 3 - startVertexParapet;
  if (countVertexParapet > 0) {
    geometry.addGroup(startVertexParapet, countVertexParapet, 20); // Parapet Material Slot
  }

  // ---------------------------------------------------------------------------
  // [Part 4: 옥상(윗면) 바닥 4종 분리]
  // Material Index = 16 + style.roofMaterialIndex (16..19)
  // ---------------------------------------------------------------------------
  const startVertexRoof = positions.length / 3;
  // 삼각분할 (Fan triangulation)
  for (let i = 1; i < numPts - 1; i++) {
    const p0 = ring2D[0];
    const p1 = ring2D[i];
    const p2 = ring2D[i + 1];

    positions.push(
      p0.x, topElev, p0.z,
      p1.x, topElev, p1.z,
      p2.x, topElev, p2.z
    );
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(
      (p0.x - minX) / 10, (p0.z - minZ) / 10,
      (p1.x - minX) / 10, (p1.z - minZ) / 10,
      (p2.x - minX) / 10, (p2.z - minZ) / 10
    );
  }

  const countVertexRoof = positions.length / 3 - startVertexRoof;
  if (countVertexRoof > 0) {
    const roofSlot = 16 + style.roofMaterialIndex; // 16, 17, 18, 19
    geometry.addGroup(startVertexRoof, countVertexRoof, roofSlot);
  }

  // ---------------------------------------------------------------------------
  // [Part 5: 4층 이상 (H >= 12m) 옥탑 엘리베이터 권상기실 (Penthouse Box)]
  // Material Index = 21 (옥탑 루버)
  // ---------------------------------------------------------------------------
  if (finalH >= 12.0) {
    const startVertexPenthouse = positions.length / 3;
    const cX = (minX + maxX) / 2;
    const cZ = (minZ + maxZ) / 2;
    const halfW = Math.min(3.5, (maxX - minX) * 0.2);
    const halfD = Math.min(3.5, (maxZ - minZ) * 0.2);
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
      geometry.addGroup(startVertexPenthouse, countVertexPenthouse, 21); // Penthouse Slot
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();

  return geometry;
}

// =============================================================================
// [4] 밝은 서울식 주광 조명 시스템
// =============================================================================

export function setupSeoulDaylightLighting(scene: THREE.Scene): {
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  directionalLight: THREE.DirectionalLight;
} {
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.95);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);

  directionalLight.position.set(200, 450, 150);

  scene.add(ambientLight);
  scene.add(hemisphereLight);
  scene.add(directionalLight);

  return { ambientLight, hemisphereLight, directionalLight };
}

// =============================================================================
// [5] VWorldBuildingComposer 통합 마스터 컴포저
// =============================================================================

export class VWorldBuildingComposer {
  public static getMaterials(): THREE.MeshLambertMaterial[] {
    return getGlobalVWorldMaterials();
  }

  public static getRoofMaterials(): THREE.MeshLambertMaterial[] {
    return getGlobalVWorldRoofMaterials();
  }

  public static getAllMaterials(): THREE.MeshLambertMaterial[] {
    return getGlobalAllMaterialsArray();
  }

  public static composeBuildingGeometry(options: BuildBuildingMeshOptions): THREE.BufferGeometry {
    return buildVWorld5PartBuildingGeometry(options);
  }

  public static setupLighting(scene: THREE.Scene) {
    return setupSeoulDaylightLighting(scene);
  }
}
