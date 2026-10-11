/**
 * buildingTextures.ts
 *
 * 브라우저 Canvas API 기반 동적 건축 외벽(Procedural Facade) 텍스처 생성기
 * - 256x256 Power-of-Two 타일 규격으로 WebGL 텍스처 아틀라스 메모리 최적화
 * - 주거/아파트: 층별 창문 프레임, 발코니 음영선, 층간 콘크리트 슬래브 라인
 * - 상업/업무: 푸른빛 반사형 유리 커튼월(Curtain Wall) 그리드 및 스펙큘러 하이라이트
 * - 군사/공공청사: 정돈된 세로 루버(Louver) 및 다크 슬레이트 방호 창호 패턴
 */

import type maplibregl from 'maplibre-gl';

export interface FacadeTextureResult {
  id: string;
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  dataUrl: string;
}

/**
 * 1. 주거/아파트용 외벽 텍스처 생성기 (Modern Residential / Apartment Facade)
 * - 모던 베이지/그레이 콘크리트 베이스, 8개 층 층간 슬래브, 4개 세대 창문 및 발코니 음영선
 */
export function createResidentialFacade(size = 256): FacadeTextureResult {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 베이스 외벽 컬러 (따뜻한 모던 라이트 베이지-그레이)
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, size, size);

  // 미세한 콘크리트 외벽 질감 블렌딩
  ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
  for (let y = 0; y < size; y += 4) {
    ctx.fillRect(0, y, size, 1.5);
  }

  const floors = 8;
  const fH = size / floors; // 32px per floor
  const bays = 4;
  const bW = size / bays; // 64px per bay

  for (let f = 0; f < floors; f++) {
    const y = f * fH;

    // 1) 층간 콘크리트 슬래브 (두께 4.5px)
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, y, size, 4.5);
    // 슬래브 하단 드롭 섀도우 (깊이감 연출)
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, y + 3.5, size, 1.5);
    ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
    ctx.fillRect(0, y + 4.5, size, 1.0);

    // 2) 세대별 창문 및 발코니 배치
    for (let b = 0; b < bays; b++) {
      const x = b * bW;
      const marginX = 6;
      const winW = bW - marginX * 2; // 52px
      const winH = 15; // 상단 창호 높이
      const winY = y + 6;

      // 구조 기둥 (Pillar) 음영
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(x, y + 4.5, marginX, fH - 4.5);
      ctx.fillRect(x + bW - marginX, y + 4.5, marginX, fH - 4.5);

      // 창문 영역 (고대비 틴트 글래스)
      const glassGrad = ctx.createLinearGradient(x + marginX, winY, x + marginX + winW, winY + winH);
      glassGrad.addColorStop(0, '#334155');
      glassGrad.addColorStop(0.5, '#475569');
      glassGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(x + marginX, winY, winW, winH);

      // 반사광 하이라이트 (사선)
      ctx.fillStyle = 'rgba(248, 250, 252, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x + marginX + 4, winY + winH);
      ctx.lineTo(x + marginX + 16, winY);
      ctx.lineTo(x + marginX + 22, winY);
      ctx.lineTo(x + marginX + 10, winY + winH);
      ctx.closePath();
      ctx.fill();

      // 창호 외곽 프레임 (알루미늄 화이트 새시)
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(x + marginX + 0.5, winY + 0.5, winW - 1, winH - 1);

      // 중앙 창틀 수직 분할바 (Mullion)
      ctx.beginPath();
      ctx.moveTo(x + marginX + winW / 2, winY);
      ctx.lineTo(x + marginX + winW / 2, winY + winH);
      ctx.stroke();

      // 3) 하단 발코니(베란다) 난간 및 스팬드럴 패널 (높이 10px)
      const balY = winY + winH;
      const balH = fH - (winH + 6);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(x + marginX, balY, winW, balH);

      // 발코니 상단 핸드레일 바
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(x + marginX, balY, winW, 1.5);

      // 발코니 안전살 (세로 루버 슬릿)
      ctx.fillStyle = '#64748B';
      for (let sl = x + marginX + 4; sl < x + marginX + winW - 2; sl += 6) {
        ctx.fillRect(sl, balY + 1.5, 1.0, balH - 2.5);
      }

      // 발코니 하단 턱 음영
      ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.fillRect(x + marginX, y + fH - 1.5, winW, 1.5);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return {
    id: 'facade-residential-pattern',
    canvas,
    imageData,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

/**
 * 2. 상업/업무용 외벽 텍스처 생성기 (Commercial Office Curtain Wall)
 * - 다크 네이비 구조체, 8x8 커튼월 그리드, 스카이블루/시안 반사 글래스, 스펙큘러 대각 광택
 */
export function createCommercialFacade(size = 256): FacadeTextureResult {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 베이스 프레임 컬러 (다크 하이테크 네이비)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, size, size);

  const gridCount = 8;
  const cellS = size / gridCount; // 32px per unit

  for (let row = 0; row < gridCount; row++) {
    for (let col = 0; col < gridCount; col++) {
      const x = col * cellS;
      const y = row * cellS;

      // 유리 패널 내부 패딩 1.5px
      const pad = 1.5;
      const pW = cellS - pad * 2;
      const pH = cellS - pad * 2;

      // 반사형 유리 그라데이션 (스카이블루 ~ 시안 ~ 딥 네이비)
      const grad = ctx.createLinearGradient(x + pad, y + pad, x + pad + pW, y + pad + pH);
      grad.addColorStop(0, '#0284C7'); // Deep Sky Blue
      grad.addColorStop(0.35, '#38BDF8'); // Cyan Tint Highlight
      grad.addColorStop(0.7, '#0369A1'); // Reflective Ocean Blue
      grad.addColorStop(1, '#0C4A6E'); // Deep Glass Shadow
      ctx.fillStyle = grad;
      ctx.fillRect(x + pad, y + pad, pW, pH);

      // 상단 스팬드럴 밴드 (층간 차폐용 짙은 프릿 글래스, 5px)
      ctx.fillStyle = 'rgba(8, 47, 73, 0.75)';
      ctx.fillRect(x + pad, y + pad, pW, 5);

      // 스펙큘러 반사광 하이라이트 (빌딩 숲 대각선 햇빛 반사 효과)
      ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
      ctx.beginPath();
      ctx.moveTo(x + pad + 2, y + pad + pH);
      ctx.lineTo(x + pad + pW - 4, y + pad + 5);
      ctx.lineTo(x + pad + pW, y + pad + 5);
      ctx.lineTo(x + pad + 6, y + pad + pH);
      ctx.closePath();
      ctx.fill();

      // 커튼월 알루미늄 프레임 조인트 라인
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(x + 0.5, y + 0.5, cellS, cellS);

      // 금속 스파이더 브래킷 / 포인트 코너 피팅 하이라이트
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // 전체 외벽 수평 층간 띠장 (Floor Slab Spandrel) 강조 (매 32px)
  for (let r = 0; r < gridCount; r++) {
    const y = r * cellS;
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(0, y, size, 1.5);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
    ctx.fillRect(0, y + 1.5, size, 2.0);
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return {
    id: 'facade-commercial-pattern',
    canvas,
    imageData,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

/**
 * 3. 군사/공공청사용 외벽 텍스처 생성기 (Military / Civic Louver Facade)
 * - 매트 다크 슬레이트 콘크리트, 16개 세로 차양 루버(Louver), 방호형 슬릿 창호 패턴
 */
export function createMilitaryFacade(size = 256): FacadeTextureResult {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 베이스 외벽 컬러 (단단한 콘크리트 슬레이트 그레이)
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, size, size);

  // 미세한 콘크리트 질감 블렌딩
  ctx.fillStyle = 'rgba(51, 65, 85, 0.55)';
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 1.5);
  }

  const floors = 8;
  const fH = size / floors; // 32px per floor
  const louvers = 16;
  const lW = size / louvers; // 16px per louver bay

  for (let f = 0; f < floors; f++) {
    const y = f * fH;

    // 1) 견고한 콘크리트 보/슬래브 라인 (두께 5px)
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, y, size, 5);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, y + 4, size, 2);

    // 2) 세로 루버 및 보안 슬릿 창문
    for (let l = 0; l < louvers; l++) {
      const x = l * lW;

      // 방호형 슬릿 창호 (폭 7px, 높이 18px)
      const winW = 7;
      const winH = 18;
      const winX = x + (lW - winW) / 2;
      const winY = y + 7;

      // 어두운 방탄/보안 유리
      const winGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
      winGrad.addColorStop(0, '#0F172A');
      winGrad.addColorStop(0.5, '#134E4A'); // 짙은 텍티컬 그린 틴트
      winGrad.addColorStop(1, '#020617');
      ctx.fillStyle = winGrad;
      ctx.fillRect(winX, winY, winW, winH);

      // 창틀 흑철색 프레임
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(winX + 0.5, winY + 0.5, winW - 1, winH - 1);

      // 3) 세로 건축 루버 핀 (Louver Fin) - 돌출 입체감 연출
      // 좌측 밝은 모서리 (사광 수광면)
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(x, y + 5, 1.5, fH - 5);
      // 우측 그림자 모서리 (그림자면)
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(x + 1.5, y + 5, 2.0, fH - 5);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return {
    id: 'facade-military-pattern',
    canvas,
    imageData,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

/**
 * 4. 모든 건물 외벽 패턴 일괄 생성
 */
export function generateAllBuildingTextures(size = 256): Record<string, FacadeTextureResult> {
  return {
    'facade-residential-pattern': createResidentialFacade(size),
    'facade-commercial-pattern': createCommercialFacade(size),
    'facade-military-pattern': createMilitaryFacade(size),
  };
}

/**
 * 5. MapLibre GL JS 인스턴스에 모든 건축 패턴 안전 등록
 * - 이미 등록되어 있는 경우 스킵하여 중복 메모리 점유 방지
 */
export function registerBuildingTextures(map: maplibregl.Map, size = 256): void {
  if (typeof window === 'undefined' || !map) return;

  try {
    const textures = generateAllBuildingTextures(size);

    for (const [id, result] of Object.entries(textures)) {
      if (!map.hasImage(id)) {
        map.addImage(id, result.imageData);
      }
    }
  } catch (err) {
    console.warn('[buildingTextures] Failed to register facade textures to map:', err);
  }
}
