/**
 * facadeTextures.ts
 *
 * 브라우저 Canvas API 기반 한국형 고해상도(512x512) 건축 파사드 텍스처 아틀라스 생성기
 *
 * [1. 아파트 단지 파사드]
 * - 층고 3.0m 기준 세대별 발코니 난간(Balcony Railings)
 * - 이중창 알루미늄/하이섀시 프레임 및 하늘빛 반사 틴트 글래스
 * - 층간 콘크리트 슬래브 분할선 및 세대간 분할 기둥 (모던 베이지/화이트 톤: #F8FAFC, #F1F5F9)
 *
 * [2. 상업/업무 빌딩 파사드]
 * - 알루미늄 수직 루버(Louver) 및 멀리온
 * - 반사형 유리 커튼월(Curtain Wall) 그리드 패턴 및 사선 스펙큘러 하이라이트
 *
 * [3. MapLibre 스프라이트 등록]
 * - map.addImage()를 통해 맵 스프라이트에 'facade-apartment', 'facade-commercial' 등록
 */

import * as THREE from 'three';
import type maplibregl from 'maplibre-gl';

export interface FacadeCanvasResult {
  id: string;
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  dataUrl: string;
}

/**
 * 1. 한국형 아파트 단지 외벽 캔버스 텍스처 (512x512)
 * - 층고 3.0m 비례 4개 층 x 4개 세대 그리드
 * - 세대별 발코니 난간, 이중창 섀시 프레임, 층간 슬래브 분할선
 */
export function createApartmentFacadeCanvas(size = 512): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // 1) 외벽 베이스: 깔끔하고 모던한 베이지-화이트 콘크리트 (#F8FAFC)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  // 미세 콘크리트 외장 질감
  ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
  for (let y = 0; y < size; y += 6) {
    ctx.fillRect(0, y, size, 1.5);
  }

  const floors = 4; // 512px / 4 = 128px per floor (3.0m 층고 기준)
  const floorH = size / floors;
  const bays = 4;   // 512px / 4 = 128px per bay
  const bayW = size / bays;

  for (let f = 0; f < floors; f++) {
    const y = f * floorH;

    // 2) 층간 콘크리트 슬래브 분할선 (두께 10px, 입체 음영선)
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, y, size, 10);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, y + 8, size, 2);
    ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
    ctx.fillRect(0, y + 10, size, 2);

    for (let b = 0; b < bays; b++) {
      const x = b * bayW;

      // 세대 간 수직 콘크리트 날개벽 (Pillars)
      const pillarW = 10;
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(x, y + 10, pillarW, floorH - 10);
      ctx.fillRect(x + bayW - pillarW, y + 10, pillarW, floorH - 10);
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(x + pillarW - 2, y + 10, 2, floorH - 10);

      const marginX = pillarW + 6;
      const winW = bayW - marginX * 2;
      const winH = Math.round(floorH * 0.48); // 상단 이중창 높이 (~61px)
      const winY = y + 14;

      // 3) 이중창 알루미늄/화이트 섀시 프레임
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(marginX + x - 2, winY - 2, winW + 4, winH + 4);
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(marginX + x - 1, winY - 1, winW + 2, winH + 2);

      // 하늘빛 반사 틴트 글래스 (이중창 반사 그라데이션)
      const glassGrad = ctx.createLinearGradient(x + marginX, winY, x + marginX + winW, winY + winH);
      glassGrad.addColorStop(0, '#0F233F');
      glassGrad.addColorStop(0.35, '#1E3A5F');
      glassGrad.addColorStop(0.7, '#0284C7');
      glassGrad.addColorStop(1, '#0F1E36');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(marginX + x, winY, winW, winH);

      // 사선 반사광 하이라이트 (Specular Sheen)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.moveTo(x + marginX + 6, winY + winH);
      ctx.lineTo(x + marginX + winW * 0.45, winY);
      ctx.lineTo(x + marginX + winW * 0.6, winY);
      ctx.lineTo(x + marginX + winW * 0.22, winY + winH);
      ctx.closePath();
      ctx.fill();

      // 중앙 창틀 수직 분할바 (Mullion)
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + marginX + winW / 2, winY);
      ctx.lineTo(x + marginX + winW / 2, winY + winH);
      ctx.stroke();

      // 4) 세대별 전면 발코니 난간 (Balcony Railings)
      const balcY = winY + winH + 4;
      const balcH = floorH - (winY - y) - winH - 6; // ~40px

      // 발코니 하부 콘크리트 턱 및 바닥 슬래브
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(x + marginX, balcY, winW, balcH);
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(x + marginX, balcY + balcH - 4, winW, 4);

      // 반투명 발코니 세이프티 글래스 패널
      ctx.fillStyle = 'rgba(15, 35, 63, 0.45)';
      ctx.fillRect(x + marginX + 2, balcY + 4, winW - 4, balcH - 8);

      // 발코니 상단 스테인리스 핸드레일 (Handrail)
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(x + marginX, balcY, winW, 3.5);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(x + marginX, balcY + 0.5, winW, 1.0);

      // 발코니 수직 난간살 (Balusters)
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.7)';
      ctx.lineWidth = 1.5;
      const balusterCount = 7;
      const balusterStep = (winW - 8) / (balusterCount + 1);
      ctx.beginPath();
      for (let k = 1; k <= balusterCount; k++) {
        const bx = x + marginX + 4 + k * balusterStep;
        ctx.moveTo(bx, balcY + 3);
        ctx.lineTo(bx, balcY + balcH - 4);
      }
      ctx.stroke();
    }
  }

  return canvas;
}

/**
 * 2. 상업/업무 빌딩 반사형 유리 커튼월 & 알루미늄 루버 텍스처 (512x512)
 * - 세로 알루미늄 루버(Louver) / 멀리언 그리드
 * - 반사형 유리 커튼월 및 고광택 스펙큘러 하이라이트
 */
export function createCommercialFacadeCanvas(size = 512): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // 1) 딥블루 반사 유리 베이스 그라데이션
  const baseGrad = ctx.createLinearGradient(0, 0, size, size);
  baseGrad.addColorStop(0, '#0F172A');
  baseGrad.addColorStop(0.25, '#1E3A8A');
  baseGrad.addColorStop(0.55, '#1D4ED8');
  baseGrad.addColorStop(0.85, '#2563EB');
  baseGrad.addColorStop(1, '#0284C7');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // 2) 층간 스팬드럴 글래스 / 수평 알루미늄 트랜섬 밴드 (64px 주기 = 8개 층)
  const floorH = 64;
  for (let y = 0; y < size; y += floorH) {
    // 짙은 스팬드럴 패널 음영
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, y, size, 14);

    // 알루미늄 수평 바 (트랜섬)
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, y + 14, size, 3.5);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, y + 17.5, size, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, y + 14, size, 1);
  }

  // 3) 알루미늄 수직 루버(Louver) 및 멀리온 (32px 주기 = 16 bays)
  const mullionStep = 32;
  for (let x = 0; x < size; x += mullionStep) {
    // 음영면
    ctx.fillStyle = '#475569';
    ctx.fillRect(x, 0, 4, size);
    // 메탈릭 알루미늄 루버 하이라이트
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(x + 1, 0, 2, size);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 1, 0, 1, size);
  }

  // 4) 와이드 사선 스펙큘러 하이라이트 (태양광 및 스카이라인 채광 반사)
  const sheenGrad = ctx.createLinearGradient(0, size, size, 0);
  sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheenGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
  sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.32)');
  sheenGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.08)');
  sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheenGrad;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.75);
  ctx.lineTo(size * 0.75, 0);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, size);
  ctx.closePath();
  ctx.fill();

  // 보조 스펙큘러 밴드
  const sheenGrad2 = ctx.createLinearGradient(0, size * 0.5, size * 0.5, 0);
  sheenGrad2.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheenGrad2.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)');
  sheenGrad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheenGrad2;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.lineTo(size * 0.35, 0);
  ctx.lineTo(size * 0.55, 0);
  ctx.lineTo(0, size * 0.55);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

/**
 * 2-2. 한국형 단독주택 / 빌라 / 다세대 캔버스 텍스처 (512x512)
 * - 웜 베이지(#F1F5F9) 외벽 베이스
 * - 층간 슬래브 분할선 및 세대 창문 프레임
 */
export function createResidentialFacadeCanvas(size = 512): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    return {} as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // 1) 외벽 베이스: 웜 베이지 (#F1F5F9)
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, size, size);

  // 미세 가로 줄눈
  ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 1.5);
  }

  const floors = 4;
  const floorH = size / floors;
  const bays = 4;
  const bayW = size / bays;

  for (let f = 0; f < floors; f++) {
    const y = f * floorH;

    // 층간 슬래브 밴드
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, y, size, 8);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, y + 6, size, 2);

    for (let b = 0; b < bays; b++) {
      const x = b * bayW;
      const marginX = 14;
      const winW = bayW - marginX * 2;
      const winH = Math.round(floorH * 0.52);
      const winY = y + 16;

      // 창호 프레임
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + marginX - 2, winY - 2, winW + 4, winH + 4);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(x + marginX - 1, winY - 1, winW + 2, winH + 2);

      // 유리창 반사 그라데이션
      const glassGrad = ctx.createLinearGradient(x + marginX, winY, x + marginX + winW, winY + winH);
      glassGrad.addColorStop(0, '#1E293B');
      glassGrad.addColorStop(0.4, '#0F172A');
      glassGrad.addColorStop(0.7, '#0369A1');
      glassGrad.addColorStop(1, '#0284C7');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(x + marginX, winY, winW, winH);

      // 창틀 십자 섀시 분할
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(x + marginX + winW * 0.5 - 1, winY, 2, winH);
      ctx.fillRect(x + marginX, winY + winH * 0.45 - 1, winW, 2);
    }
  }

  return canvas;
}

/**
 * 3. MapLibre 맵 인스턴스에 512x512 파사드 텍스처 스프라이트 안전 등록
 */
export function registerFacadeTexturesToMap(map: maplibregl.Map, size = 512): void {
  if (!map || typeof document === 'undefined') return;

  try {
    // 1) 아파트 단지 텍스처 등록 (밝은 크림 아이보리 #f8fafc)
    if (!map.hasImage('facade-apartment')) {
      const aptCanvas = createApartmentFacadeCanvas(size);
      const ctx = aptCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage('facade-apartment', imgData);
        if (!map.hasImage('facade-residential-512')) {
          map.addImage('facade-residential-512', imgData);
        }
      }
    }

    // 2) 상업/업무 빌딩 커튼월 루버 텍스처 등록 (쿨 그레이/블루 #cbd5e1)
    if (!map.hasImage('facade-commercial')) {
      const comCanvas = createCommercialFacadeCanvas(size);
      const ctx = comCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage('facade-commercial', imgData);
        if (!map.hasImage('facade-curtainwall-512')) {
          map.addImage('facade-curtainwall-512', imgData);
        }
      }
    }

    // 3) 일반 단독주택 / 빌라 외벽 텍스처 등록 (웜 베이지 #f1f5f9)
    if (!map.hasImage('facade-residential')) {
      const resCanvas = createResidentialFacadeCanvas(size);
      const ctx = resCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage('facade-residential', imgData);
        if (!map.hasImage('facade-villa')) {
          map.addImage('facade-villa', imgData);
        }
      }
    }
  } catch (err) {
    console.warn('[facadeTextures] registerFacadeTexturesToMap notice:', err);
  }
}

/**
 * 4. Three.js PBR 렌더링용 층고 비례 RepeatWrapping 아파트 텍스처
 */
export function getApartmentFacadeTexture(size = 512): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = createApartmentFacadeCanvas(size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 5. Three.js PBR 렌더링용 층고 비례 RepeatWrapping 상업 커튼월 텍스처
 */
export function getCommercialFacadeTexture(size = 512): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = createCommercialFacadeCanvas(size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
