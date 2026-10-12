/**
 * koreanBuildingTextures.ts
 *
 * 국내 3D 포털 지도(카카오맵/티맵 3D) 수준의 한국형 실감 건축 파사드 텍스처 아틀라스 생성기
 * - Canvas 2D API 기반 고해상도(512x512) 한국 도심 특화 외벽 텍스처 3종:
 *   1) 한국형 판상형 아파트 (세대별 발코니 난간, 이중창 화이트 섀시, 층간 슬래브, 에어컨 거치대)
 *   2) 상업 오피스 빌딩 (알루미늄 루버 멀리언, 반사 유리 커튼월, 딥블루 스카이 반사광)
 *   3) 저층 근린생활시설 (1층 쇼윈도 통유리, 간판 띠장, 상층부 석재 타일 외장재)
 * - Three.js PBR MeshStandardMaterial 및 UV RepeatWrapping 설정 지원
 */

import * as THREE from 'three';

export interface KoreanBuildingMaterials {
  apartmentMaterial: THREE.MeshStandardMaterial;
  commercialMaterial: THREE.MeshStandardMaterial;
  neighborhoodMaterial: THREE.MeshStandardMaterial;
  landmarkTowerMaterial: THREE.MeshStandardMaterial; // [신규] 반사 유리 고층 타워
  helipadBaseMaterial: THREE.MeshStandardMaterial;   // [신규] 옥상 헬리패드 베이스
  helipadMarkMaterial: THREE.MeshStandardMaterial;   // [신규] 옥상 헬리패드 H 마킹 및 노란색 링
  roofSlateMaterial: THREE.MeshStandardMaterial;
  parapetMaterial: THREE.MeshStandardMaterial;
  penthouseMaterial: THREE.MeshStandardMaterial;
  foundationMaterial: THREE.MeshStandardMaterial;
}

let materialsCache: KoreanBuildingMaterials | null = null;

/**
 * 1. 한국형 판상형 아파트 외벽 텍스처 생성기 (512x512)
 * - 가로 3.0m x 세로 3.0m 실측 1개 세대 비례
 * - 세대별 전면 발코니 난간 살(Balusters), 이중창 유리 섀시, 층간 슬래브 음영선
 */
export function createKoreanApartmentCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 외벽 베이스: 도심 신축 아파트 특유의 밝은 오프화이트/아이보리 톤 (#F8FAFC)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  // 미세한 콘크리트 외장재 질감
  ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 2);
  }

  // 2) 층간 슬래브 밴드 (상단 경계선, 두께 12px)
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 0, size, 12);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(0, 10, size, 3);
  // 하단 층간 이음매 음영선
  ctx.fillStyle = '#64748B';
  ctx.fillRect(0, size - 6, size, 6);

  // 세대 간 수직 콘크리트 날개벽 (Pillars)
  const pillarW = Math.round(size * 0.08); // ~41px
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, pillarW, size);
  ctx.fillRect(size - pillarW, 0, pillarW, size);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(pillarW - 2, 0, 2, size);
  ctx.fillRect(size - pillarW, 0, 2, size);

  // 3) 대형 이중창 유리 섀시 영역 (상단 60% 높이)
  const winX = pillarW + 8;
  const winW = size - (pillarW + 8) * 2;
  const winY = 22;
  const winH = Math.round(size * 0.52); // ~266px

  // 창틀 외곽 화이트/라이트그레이 알루미늄 새시 프레임
  ctx.fillStyle = '#334155';
  ctx.fillRect(winX - 4, winY - 4, winW + 8, winH + 8);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);

  // 어두운 틴트 글래스 (이중창 반사)
  const glassGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
  glassGrad.addColorStop(0, '#0F1E36');
  glassGrad.addColorStop(0.3, '#1E293B');
  glassGrad.addColorStop(0.7, '#0F172A');
  glassGrad.addColorStop(1, '#1E293B');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 사선 하늘 반사광 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.moveTo(winX + 20, winY + winH);
  ctx.lineTo(winX + 110, winY);
  ctx.lineTo(winX + 160, winY);
  ctx.lineTo(winX + 70, winY + winH);
  ctx.closePath();
  ctx.fill();

  // 중앙 슬라이딩 분할 프레임 바
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(winX + Math.round(winW * 0.48), winY, 6, winH);
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(winX, winY, winW, winH);

  // 4) 하단 세대별 발코니(베란다) 난간 영역 (하단 35% 높이)
  const balY = winY + winH + 6;
  const balH = size - balY - 14;

  // 발코니 하단 콘크리트 턱 & 드롭 섀도우
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(winX, balY, winW, balH);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(winX, balY, winW, 8); // 상단 난간 턱

  // 알루미늄 안전 핸드레일 상부 바 (#475569)
  ctx.fillStyle = '#334155';
  ctx.fillRect(winX, balY + 10, winW, 5);

  // 촘촘한 세로형 안전 난간 살 (Vertical Balusters, 18개 균일 배열)
  const balusterCount = 18;
  const balusterSpacing = winW / (balusterCount + 1);
  ctx.fillStyle = '#64748B';
  for (let i = 1; i <= balusterCount; i++) {
    const bx = winX + i * balusterSpacing;
    ctx.fillRect(bx - 1.5, balY + 15, 3, balH - 24);
  }

  // 발코니 하단 안전 가드 바
  ctx.fillStyle = '#475569';
  ctx.fillRect(winX, balY + balH - 12, winW, 4);

  // 에어컨 실외기 거치대 음영 엑센트 (우측 하단)
  const acW = Math.round(winW * 0.24);
  const acH = Math.round(balH * 0.42);
  const acX = winX + winW - acW - 12;
  const acY = balY + balH - acH - 8;
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(acX, acY, acW, acH);
  ctx.fillStyle = '#475569';
  for (let ly = acY + 4; ly < acY + acH - 4; ly += 6) {
    ctx.fillRect(acX + 3, ly, acW - 6, 2);
  }

  return canvas;
}

/**
 * 2. 상업 오피스 빌딩 외벽 텍스처 생성기 (512x512)
 * - 가로 3.0m x 세로 3.0m 기준
 * - 격자형 알루미늄 루버와 반사 유리 커튼월(Curtain Wall), 딥블루 스카이 하이라이트
 */
export function createCommercialOfficeCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 딥블루 커튼월 반사 유리 바탕
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#0369A1'); // 맑은 스카이블루 반사
  bgGrad.addColorStop(0.35, '#0284C7');
  bgGrad.addColorStop(0.7, '#075985');
  bgGrad.addColorStop(1, '#0C4A6E');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2) 사선 반사광 셰브론 밴드 (Glass Reflection Streaks)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.moveTo(30, size);
  ctx.lineTo(180, 0);
  ctx.lineTo(240, 0);
  ctx.lineTo(90, size);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(186, 230, 253, 0.18)';
  ctx.beginPath();
  ctx.moveTo(220, size);
  ctx.lineTo(370, 0);
  ctx.lineTo(410, 0);
  ctx.lineTo(260, size);
  ctx.closePath();
  ctx.fill();

  // 3) 격자형 수평/수직 알루미늄 멀리언 프레임 (#334155, #64748B)
  // 외곽 테두리 프레임
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, size, size);

  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  // 중앙 수직 멀리언 (2분할)
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(size / 2 - 4, 0, 8, size);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(size / 2 - 1.5, 0, 3, size);

  // 수평 트랜섬 바 (상단 1/3, 하단 2/3)
  const hLines = [Math.round(size * 0.32), Math.round(size * 0.68)];
  for (const hy of hLines) {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, hy - 4, size, 8);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, hy - 1.5, size, 3);
  }

  // 4) 내부 블라인드/루버 쉐이딩 패턴 (오피스 디테일)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
  for (let y = 16; y < size * 0.32 - 8; y += 8) {
    ctx.fillRect(12, y, size / 2 - 20, 2.5);
    ctx.fillRect(size / 2 + 8, y, size / 2 - 20, 2.5);
  }

  // 층간 스팬드럴 글래스 다크 밴드
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fillRect(0, 0, size, 18);
  ctx.fillRect(0, size - 18, size, 18);

  return canvas;
}

/**
 * 3. 저층 근린생활시설 외벽 텍스처 생성기 (512x512)
 * - 1층 쇼윈도 통유리 + 출입문 + 상층부 고급 석재 타일 외장재
 */
export function createNeighborhoodCommercialCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 상층부 베이스: 세련된 트래버틴 베이지 석재 타일 (#E2E8F0, #F1F5F9)
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, size, size);

  // 석재 패널 격자 줄눈 (가로 4칸 x 세로 4칸)
  ctx.fillStyle = '#94A3B8';
  for (let y = 0; y < size * 0.55; y += Math.round(size * 0.14)) {
    ctx.fillRect(0, y, size, 3);
  }
  for (let x = 0; x < size; x += Math.round(size * 0.25)) {
    ctx.fillRect(x, 0, 3, Math.round(size * 0.55));
  }

  // 상층부 통창 (2개 나란히 배치)
  const upperWinW = Math.round(size * 0.36);
  const upperWinH = Math.round(size * 0.3);
  const upperWinY = 24;
  const winXs = [Math.round(size * 0.09), Math.round(size * 0.55)];

  for (const wx of winXs) {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(wx - 3, upperWinY - 3, upperWinW + 6, upperWinH + 6);
    ctx.fillStyle = '#0F1E36';
    ctx.fillRect(wx, upperWinY, upperWinW, upperWinH);

    // 반사광
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.moveTo(wx + 10, upperWinY + upperWinH);
    ctx.lineTo(wx + 45, upperWinY);
    ctx.lineTo(wx + 70, upperWinY);
    ctx.lineTo(wx + 35, upperWinY + upperWinH);
    ctx.closePath();
    ctx.fill();

    // 섀시 프레임
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx, upperWinY, upperWinW, upperWinH);
  }

  // 2) 중간 간판 띠장 영역 (Signboard Band)
  const signY = Math.round(size * 0.52);
  const signH = Math.round(size * 0.1);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, signY, size, signH);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, signY, size, 4);
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, signY + signH - 3, size, 3);

  // 간판 은은한 네온 텍스트 실루엣 라인
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(Math.round(size * 0.2), signY + Math.round(signH * 0.35), Math.round(size * 0.6), 6);

  // 3) 1층 대형 쇼윈도 통유리 아트리움 (하단 38%)
  const shopY = signY + signH;
  const shopH = size - shopY;

  // 쇼윈도 내부 웜라이트 조명 그라데이션
  const shopGrad = ctx.createLinearGradient(0, shopY, 0, size);
  shopGrad.addColorStop(0, '#0F1E36');
  shopGrad.addColorStop(0.4, '#1E293B');
  shopGrad.addColorStop(1, '#2D3748');
  ctx.fillStyle = shopGrad;
  ctx.fillRect(0, shopY, size, shopH);

  // 1층 매장 실내 웜라이트 확산
  const warmLight = ctx.createRadialGradient(size / 2, size - 20, 10, size / 2, size - 20, 120);
  warmLight.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
  warmLight.addColorStop(0.6, 'rgba(253, 224, 71, 0.08)');
  warmLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = warmLight;
  ctx.fillRect(10, shopY + 10, size - 20, shopH - 10);

  // 스테인리스 스틸 쇼윈도 멀리온 프레임
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, shopY + 5, size - 20, shopH - 10);

  // 중앙 자동 출입문 분할선
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(size / 2 - 2, shopY + 5, 4, shopH - 10);

  return canvas;
}

/**
 * 4. 랜드마크 및 고층 타워 반사 유리 커튼월 외벽 텍스처 생성기 (512x512)
 * - 15층 이상 고층 빌딩 및 주요 공공청사용
 * - 반사 유리 그라디언트, 초정밀 수직/수평 알루미늄 멀리언 그리드, 스팬드럴 글래스 패널
 */
export function createLandmarkCurtainWallCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 딥 로열 블루 / 사이언 하이라이트 글래스 베이스 그라데이션
  const baseGrad = ctx.createLinearGradient(0, 0, size, size);
  baseGrad.addColorStop(0, '#0F172A');
  baseGrad.addColorStop(0.2, '#1E3A8A');
  baseGrad.addColorStop(0.5, '#1D4ED8');
  baseGrad.addColorStop(0.8, '#2563EB');
  baseGrad.addColorStop(1, '#0284C7');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // 2) 층간 스팬드럴 글래스 밴드 (어두운 반사 패널, 64px 마다)
  const floorHeight = 64; // ~3.0m 층고 축척
  for (let y = 0; y < size; y += floorHeight) {
    // 층간 슬래브 내부 차폐용 스팬드럴 영역
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, y, size, 14);

    // 알루미늄 트랜섬(가로 프레임) 바
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, y + 14, size, 3);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, y + 17, size, 2);
  }

  // 3) 수직 알루미늄 멀리언 기둥 라인 (32px 간격)
  const mullionStep = 32;
  for (let x = 0; x < size; x += mullionStep) {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(x, 0, 2, size);
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(x + 2, 0, 1, size);
  }

  // 4) 초고층 타워 특유의 대각선 하늘 반사 하이라이트 (Specular Sheen)
  const sheenGrad = ctx.createLinearGradient(0, size, size, 0);
  sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheenGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
  sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.28)');
  sheenGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.08)');
  sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheenGrad;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.7);
  ctx.lineTo(size * 0.7, 0);
  ctx.lineTo(size, 0);
  ctx.lineTo(0, size);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

/**
 * 캔버스로부터 RepeatWrapping CanvasTexture 생성
 */
function createRepeatTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 한국 도심 특화 PBR 머티리얼 세트 캐시 반환
 */
export function getKoreanBuildingMaterials(): KoreanBuildingMaterials {
  if (materialsCache) {
    return materialsCache;
  }

  const aptCanvas = createKoreanApartmentCanvas(512);
  const comCanvas = createCommercialOfficeCanvas(512);
  const neighCanvas = createNeighborhoodCommercialCanvas(512);
  const landmarkCanvas = createLandmarkCurtainWallCanvas(512);

  const aptTex = createRepeatTexture(aptCanvas);
  const comTex = createRepeatTexture(comCanvas);
  const neighTex = createRepeatTexture(neighCanvas);
  const landmarkTex = createRepeatTexture(landmarkCanvas);

  materialsCache = {
    // 1) 한국형 판상형 아파트 외벽 머티리얼 (roughness: 0.6, metalness: 0.2)
    apartmentMaterial: new THREE.MeshStandardMaterial({
      map: aptTex,
      roughness: 0.6,
      metalness: 0.2,
      side: THREE.DoubleSide,
    }),

    // 2) 상업 오피스 빌딩 머티리얼 (커튼월 반사 강조, metalness: 0.45, roughness: 0.3)
    commercialMaterial: new THREE.MeshStandardMaterial({
      map: comTex,
      roughness: 0.3,
      metalness: 0.45,
      side: THREE.DoubleSide,
    }),

    // 3) 저층 근린생활시설 머티리얼 (석재 타일 + 1층 쇼윈도, roughness: 0.55, metalness: 0.25)
    neighborhoodMaterial: new THREE.MeshStandardMaterial({
      map: neighTex,
      roughness: 0.55,
      metalness: 0.25,
      side: THREE.DoubleSide,
    }),

    // 4) [신규] 랜드마크 및 15층 이상 고층 반사 유리 커튼월 타워 (roughness: 0.15, metalness: 0.85)
    landmarkTowerMaterial: new THREE.MeshStandardMaterial({
      map: landmarkTex,
      color: 0x1d4ed8, // 로열 글래스 블루
      roughness: 0.15, // 요구 조건 완벽 일치 (초정밀 거울 반사)
      metalness: 0.85, // 요구 조건 완벽 일치 (금속/유리 고반사)
      side: THREE.DoubleSide,
    }),

    // 5) [신규] 옥상 헬리패드 베이스 데크
    helipadBaseMaterial: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true,
      side: THREE.DoubleSide,
    }),

    // 6) [신규] 옥상 헬리패드 H 마킹 및 노란색 링
    helipadMarkMaterial: new THREE.MeshStandardMaterial({
      color: 0xfacc15, // 고휘도 항공 노랑
      roughness: 0.35,
      metalness: 0.25,
      emissive: 0x422006, // 은은한 발광감
      side: THREE.DoubleSide,
    }),

    // 7) 옥상 방수 슬래브 (짙은 차콜 그레이 #334155)
    roofSlateMaterial: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.2,
      flatShading: true,
      side: THREE.DoubleSide,
    }),

    // 8) 1.2m 돌출 난간 (Parapet)
    parapetMaterial: new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.65,
      metalness: 0.15,
      flatShading: true,
      side: THREE.DoubleSide,
    }),

    // 9) 엘리베이터 권상기실 / 옥탑 코어 (Penthouse)
    penthouseMaterial: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.3,
      flatShading: true,
    }),

    // 10) 지형 밀착 기초 옹벽 (Foundation Clamping Wall)
    foundationMaterial: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
  };

  return materialsCache;
}

/**
 * 텍스처 및 PBR 머티리얼 GPU 메모리 완전 해제
 */
export function disposeKoreanBuildingMaterials(): void {
  if (!materialsCache) return;

  const mats = [
    materialsCache.apartmentMaterial,
    materialsCache.commercialMaterial,
    materialsCache.neighborhoodMaterial,
    materialsCache.landmarkTowerMaterial,
    materialsCache.helipadBaseMaterial,
    materialsCache.helipadMarkMaterial,
    materialsCache.roofSlateMaterial,
    materialsCache.parapetMaterial,
    materialsCache.penthouseMaterial,
    materialsCache.foundationMaterial,
  ];

  for (const mat of mats) {
    if (mat.map) {
      mat.map.dispose();
    }
    mat.dispose();
  }

  materialsCache = null;
}
