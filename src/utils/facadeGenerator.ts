/**
 * utils/facadeGenerator.ts
 *
 * 한국 도심형 아파트 및 상업 오피스 빌딩 고해상도(512x512) 실감 파사드 캔버스 텍스처 생성기
 * - [1. 한국형 아파트 Canvas 텍스처]:
 *   * 층고 3.0m 기준 세대별 발코니 난간 살(Balusters), 이중창 화이트 섀시, 층간 콘크리트 슬래브 분할선
 *   * 도심 신축 아파트 특유의 모던 화이트/오프화이트 톤 (#F8FAFC ~ #F1F5F9)
 * - [2. 상업 오피스 빌딩 Canvas 텍스처]:
 *   * 반사 유리 커튼월 (Curtain Wall) 및 알루미늄 루버(Louver)/멀리언(Mullion) 프레임 패턴
 *   * 딥 스카이블루 유리 반사광 및 메탈릭 하이라이트
 * - [3. MapLibre 스프라이트 등록 (map.addImage)]:
 *   * 'facade-apartment', 'facade-commercial' 패턴 등록
 * - [4. Three.js / Threebox UV RepeatWrapping 텍스처 지원]:
 *   * 3m 단위로 균일하게 반복 타일링되는 CanvasTexture 제공
 */

import * as THREE from 'three';
import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * 1. 한국형 판상형/타워형 아파트 외벽 텍스처 Canvas 생성 (512x512)
 * - 층고 3.0m 기준 세대별 발코니 난간, 이중창 섀시 프레임, 층간 슬래브 분할선이 선명한 모던 화이트 톤
 */
export function createApartmentFacadeCanvas(size = 512): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 외벽 베이스: 따뜻한 크림 아이보리 톤 (#f4f1ea)
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, size, size);

  // 미세한 콘크리트 미장 질감선 및 라이트 웜그레이(#e2e8f0) 투톤 밴드
  ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.fillRect(0, size * 0.5, size, size * 0.5);

  ctx.fillStyle = 'rgba(203, 213, 225, 0.25)';
  for (let y = 0; y < size; y += 6) {
    ctx.fillRect(0, y, size, 1.5);
  }

  // 2) 층간 콘크리트 슬래브 분할선 (상단/하단 경계 밴드)
  // 상단 슬래브 (두께 14px)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, 14);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 12, size, 2.5);
  // 하단 층간 슬래브 음영선
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, size - 8, size, 8);
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, size - 2, size, 2);

  // 세대 간 수직 콘크리트 날개벽 (Fin Pillars: 라이트 웜 그레이 #e2e8f0)
  const pillarW = Math.round(size * 0.08); // 약 41px
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, pillarW, size);
  ctx.fillRect(size - pillarW, 0, pillarW, size);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(pillarW - 2, 0, 2, size);
  ctx.fillRect(size - pillarW, 0, 2, size);

  // 3) 대형 이중창 유리 섀시 영역 (상단 52% 높이)
  const winX = pillarW + 8;
  const winW = size - (pillarW + 8) * 2;
  const winY = 22;
  const winH = Math.round(size * 0.52);

  // 창틀 외곽 선명한 베란다 섀시 프레임 (다크 그레이 #334155)
  ctx.fillStyle = '#334155';
  ctx.fillRect(winX - 3, winY - 3, winW + 6, winH + 6);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(winX - 1.5, winY - 1.5, winW + 3, winH + 3);

  // 하늘빛 반사 틴트 글래스 (이중창 반사 그라데이션)
  const glassGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
  glassGrad.addColorStop(0, '#0f233f');
  glassGrad.addColorStop(0.3, '#1e3a5f');
  glassGrad.addColorStop(0.65, '#0284c7');
  glassGrad.addColorStop(1, '#0f1e36');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 사선 하늘 반사광 하이라이트 (Specular Sky Streaks)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(winX + winW * 0.2, winY);
  ctx.lineTo(winX + winW * 0.42, winY);
  ctx.lineTo(winX + winW * 0.15, winY + winH);
  ctx.lineTo(winX, winY + winH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(winX + winW * 0.55, winY);
  ctx.lineTo(winX + winW * 0.72, winY);
  ctx.lineTo(winX + winW * 0.45, winY + winH);
  ctx.lineTo(winX + winW * 0.3, winY + winH);
  ctx.closePath();
  ctx.fill();

  // 중앙 섀시 분할 멀리언 (창문 4분할 바)
  ctx.fillStyle = '#e2e8f0';
  const midX = winX + winW * 0.5;
  ctx.fillRect(midX - 2.5, winY, 5, winH);
  ctx.fillRect(winX + winW * 0.25 - 1.5, winY, 3, winH);
  ctx.fillRect(winX + winW * 0.75 - 1.5, winY, 3, winH);

  // 수평 환기창 분할선 (상단 25% 지점)
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(winX, winY + winH * 0.25, winW, 3);

  // 4) 발코니 난간 영역 (하단 40% 높이)
  const balY = winY + winH + 8;
  const balH = size - balY - 14;

  // 발코니 하단 콘크리트 베이스 턱
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(winX - 2, balY, winW + 4, balH);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(winX - 2, balY, winW + 4, 3);

  // 세대별 발코니 알루미늄 난간 살 (Balusters - 세로 18개 창살)
  const numBars = 18;
  const barSpacing = winW / numBars;
  ctx.fillStyle = '#475569';
  for (let i = 1; i < numBars; i++) {
    const barX = winX + i * barSpacing;
    ctx.fillRect(barX - 1.5, balY + 4, 3, balH - 12);
  }

  // 발코니 상단 핸드레일 (다크 그레이 #334155)
  ctx.fillStyle = '#334155';
  ctx.fillRect(winX - 4, balY + 3, winW + 8, 4);

  // 에어컨 실외기 거치대 음영 (우측 하단)
  const acW = Math.round(winW * 0.26);
  const acH = Math.round(balH * 0.55);
  const acX = winX + winW - acW - 4;
  const acY = balY + balH - acH - 4;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(acX, acY, acW, acH);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(acX + 2, acY + 2, acW - 4, acH - 4);
  // 실외기 팬 그릴 슬릿
  ctx.fillStyle = '#334155';
  for (let sy = acY + 6; sy < acY + acH - 6; sy += 4) {
    ctx.fillRect(acX + 6, sy, acW - 12, 2);
  }

  return canvas;
}

/**
 * 2. 상업 오피스 빌딩 반사 유리 커튼월 및 알루미늄 루버 Canvas 생성 (512x512)
 * - 반사 유리 커튼월(Curtain Wall)과 알루미늄 루버 프레임 그리드 패턴
 */
export function createCommercialFacadeCanvas(size = 512): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 바탕: 딥 오피스 글래스 블루 (#0A192F)
  ctx.fillStyle = '#0A192F';
  ctx.fillRect(0, 0, size, size);

  // 2) 4x4 커튼월 글래스 패널 그리드
  const cols = 4;
  const rows = 4;
  const colW = size / cols;
  const rowH = size / rows;
  const frameThick = 4;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = c * colW;
      const py = r * rowH;

      // 유리 패널 그라데이션 (스카이블루 반사)
      const grad = ctx.createLinearGradient(px, py, px + colW, py + rowH);
      const isTop = r === 0;
      grad.addColorStop(0, isTop ? '#38BDF8' : '#0284C7');
      grad.addColorStop(0.4, '#0369A1');
      grad.addColorStop(0.85, '#0C4A6E');
      grad.addColorStop(1, '#082F49');

      ctx.fillStyle = grad;
      ctx.fillRect(px + frameThick, py + frameThick, colW - frameThick * 2, rowH - frameThick * 2);

      // 알루미늄 수평 루버(Louver) 블라인드 음영선
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let ly = py + 12; ly < py + rowH - 12; ly += 14) {
        ctx.fillRect(px + frameThick, ly, colW - frameThick * 2, 2);
      }

      // 사선 스펙큘러 하이라이트
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(px + colW * 0.3, py + frameThick);
      ctx.lineTo(px + colW * 0.55, py + frameThick);
      ctx.lineTo(px + colW * 0.25, py + rowH - frameThick);
      ctx.lineTo(px + frameThick, py + rowH - frameThick);
      ctx.closePath();
      ctx.fill();

      // 내부 패널 엣지 음영
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + frameThick, py + frameThick, colW - frameThick * 2, rowH - frameThick * 2);
    }
  }

  // 3) 알루미늄 루버 / 멀리언 외곽 프레임 (Mullion Grid)
  ctx.fillStyle = '#64748B'; // 메탈릭 실버 그레이
  // 수직 멀리언
  for (let c = 0; c <= cols; c++) {
    const mx = Math.min(size - frameThick, Math.max(0, c * colW - frameThick * 0.5));
    ctx.fillRect(mx, 0, frameThick, size);
  }
  // 수평 트랜섬
  for (let r = 0; r <= rows; r++) {
    const my = Math.min(size - frameThick, Math.max(0, r * rowH - frameThick * 0.5));
    ctx.fillRect(0, my, size, frameThick);
  }

  // 층간 메탈 스팬드럴 밴드 (두꺼운 이음매)
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, rowH * 2 - 4, size, 8);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(0, rowH * 2 - 2, size, 2);

  return canvas;
}

/**
 * 3. MapLibre GL 스프라이트에 파사드 이미지 동적 등록 (map.addImage)
 */
export function registerFacadeImagesToMap(map: MapLibreMap): void {
  if (typeof window === 'undefined' || !map) return;

  try {
    // 1) 아파트 파사드 스프라이트 등록
    if (!map.hasImage('facade-apartment')) {
      const aptCanvas = createApartmentFacadeCanvas(512);
      const ctx = aptCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, 512, 512);
        map.addImage('facade-apartment', imgData, { pixelRatio: 2 });
      }
    }

    // 2) 상업 빌딩 파사드 스프라이트 등록
    if (!map.hasImage('facade-commercial')) {
      const comCanvas = createCommercialFacadeCanvas(512);
      const ctx = comCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, 512, 512);
        map.addImage('facade-commercial', imgData, { pixelRatio: 2 });
      }
    }
  } catch (err) {
    console.warn('[facadeGenerator] map.addImage skipped or already loaded:', err);
  }
}

// =============================================================================
// Three.js UV RepeatWrapping 텍스처 및 머티리얼 캐시
// =============================================================================
let aptTextureCache: THREE.CanvasTexture | null = null;
let comTextureCache: THREE.CanvasTexture | null = null;

let aptMaterialCache: THREE.MeshStandardMaterial | null = null;
let comMaterialCache: THREE.MeshStandardMaterial | null = null;
let lowLodMaterialCache: THREE.MeshStandardMaterial | null = null;

/**
 * Three.js 아파트 파사드 RepeatWrapping 텍스처 획득
 */
export function getApartmentFacadeTexture(): THREE.CanvasTexture {
  if (!aptTextureCache) {
    const canvas = createApartmentFacadeCanvas(512);
    aptTextureCache = new THREE.CanvasTexture(canvas);
    aptTextureCache.wrapS = THREE.RepeatWrapping;
    aptTextureCache.wrapT = THREE.RepeatWrapping;
    aptTextureCache.colorSpace = THREE.SRGBColorSpace;
    aptTextureCache.generateMipmaps = true;
    aptTextureCache.minFilter = THREE.LinearMipmapLinearFilter;
    aptTextureCache.magFilter = THREE.LinearFilter;
    aptTextureCache.needsUpdate = true;
  }
  return aptTextureCache;
}

/**
 * Three.js 상업 빌딩 커튼월 RepeatWrapping 텍스처 획득
 */
export function getCommercialFacadeTexture(): THREE.CanvasTexture {
  if (!comTextureCache) {
    const canvas = createCommercialFacadeCanvas(512);
    comTextureCache = new THREE.CanvasTexture(canvas);
    comTextureCache.wrapS = THREE.RepeatWrapping;
    comTextureCache.wrapT = THREE.RepeatWrapping;
    comTextureCache.colorSpace = THREE.SRGBColorSpace;
    comTextureCache.generateMipmaps = true;
    comTextureCache.minFilter = THREE.LinearMipmapLinearFilter;
    comTextureCache.magFilter = THREE.LinearFilter;
    comTextureCache.needsUpdate = true;
  }
  return comTextureCache;
}

/**
 * 줌 레벨 최적화 머티리얼 제공
 * - 줌 14 이상: 세부 창문/베란다 Canvas 텍스처 적용 PBR 머티리얼
 * - 줌 14 미만: 경량 단색 음영 머티리얼 (60fps 성능 보장)
 */
export function getFacadeMaterials(isDetailedLOD = true): {
  apartment: THREE.MeshStandardMaterial;
  commercial: THREE.MeshStandardMaterial;
  lowLod: THREE.MeshStandardMaterial;
} {
  if (!lowLodMaterialCache) {
    lowLodMaterialCache = new THREE.MeshStandardMaterial({
      color: 0xF1F5F9,
      roughness: 0.65,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
  }

  if (!aptMaterialCache) {
    aptMaterialCache = new THREE.MeshStandardMaterial({
      map: getApartmentFacadeTexture(),
      roughness: 0.25,
      metalness: 0.75,
      side: THREE.DoubleSide,
    });
  }

  if (!comMaterialCache) {
    comMaterialCache = new THREE.MeshStandardMaterial({
      map: getCommercialFacadeTexture(),
      roughness: 0.15,
      metalness: 0.85,
      side: THREE.DoubleSide,
    });
  }

  return {
    apartment: isDetailedLOD ? aptMaterialCache : lowLodMaterialCache,
    commercial: isDetailedLOD ? comMaterialCache : lowLodMaterialCache,
    lowLod: lowLodMaterialCache,
  };
}

/**
 * 텍스처 캐시 메모리 해제
 */
export function disposeFacadeGeneratorTextures(): void {
  if (aptTextureCache) {
    aptTextureCache.dispose();
    aptTextureCache = null;
  }
  if (comTextureCache) {
    comTextureCache.dispose();
    comTextureCache = null;
  }
  if (aptMaterialCache) {
    aptMaterialCache.dispose();
    aptMaterialCache = null;
  }
  if (comMaterialCache) {
    comMaterialCache.dispose();
    comMaterialCache = null;
  }
  if (lowLodMaterialCache) {
    lowLodMaterialCache.dispose();
    lowLodMaterialCache = null;
  }
}
