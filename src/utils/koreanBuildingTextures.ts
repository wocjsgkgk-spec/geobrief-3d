/**
 * koreanBuildingTextures.ts
 *
 * 국내 3D 포털 지도(카카오맵/티맵 3D) 및 OSM Buildings 수준의 한국형 실감 건축 파사드 & 옥상 구조물 엔진
 * - Canvas 2D API 기반 고해상도(512x512) 한국 도심 특화 외벽 & 설비 텍스처:
 *   1) 한국형 판상형 아파트 (세대별 발코니 난간, 이중창 화이트 섀시, 층간 슬래브, 에어컨 거치대)
 *   2) 상업 오피스 빌딩 (알루미늄 루버 멀리언, 반사 유리 커튼월, 딥블루 스카이 반사광)
 *   3) 저층 근린생활시설 (1층 쇼윈도 통유리, 간판 띠장, 상층부 석재 타일 외장재)
 *   4) 랜드마크 고층 커튼월 (반사율 85% 초고층 유리 타워)
 *   5) 사각 태양광 패널 그리드 텍스처 (솔라셀 웨이퍼 & 실버 버스바)
 * - Three.js PBR MeshStandardMaterial 및 UV RepeatWrapping 설정 지원
 */

import * as THREE from 'three';

export interface KoreanBuildingMaterials {
  apartmentMaterial: THREE.MeshStandardMaterial;
  commercialMaterial: THREE.MeshStandardMaterial;
  neighborhoodMaterial: THREE.MeshStandardMaterial;
  landmarkTowerMaterial: THREE.MeshStandardMaterial; // 반사 유리 고층 타워
  helipadBaseMaterial: THREE.MeshStandardMaterial;   // 옥상 헬리패드 베이스 (호환용)
  helipadGreenBaseMaterial: THREE.MeshStandardMaterial; // 옥상 헬리패드 녹색 우레탄 원형 바탕
  helipadMarkMaterial: THREE.MeshStandardMaterial;   // 옥상 헬리패드 마킹 (호환용)
  helipadWhiteMarkMaterial: THREE.MeshStandardMaterial; // 옥상 헬리패드 백색 'H' 마킹
  helipadYellowRingMaterial: THREE.MeshStandardMaterial; // 옥상 헬리패드 노란색 안전 경계 링
  solarPanelMaterial: THREE.MeshStandardMaterial;    // 사각 태양광 패널 그리드
  waterTankMaterial: THREE.MeshStandardMaterial;     // 옥상 STS 원통형 물탱크
  ventHvacMaterial: THREE.MeshStandardMaterial;      // 옥상 환기 벤트 / 공조 덕트
  roofSlateMaterial: THREE.MeshStandardMaterial;     // 차콜 그레이 옥상 방수 슬래브
  parapetMaterial: THREE.MeshStandardMaterial;       // 1.2m 돌출 난간 (Parapet)
  penthouseMaterial: THREE.MeshStandardMaterial;     // 엘리베이터 기계실 / 권상기실
  gabledRoofMaterial: THREE.MeshStandardMaterial;    // 20도 입체 박공 지붕 (Gabled Roof)
  foundationMaterial: THREE.MeshStandardMaterial;    // 지형 밀착 기초 옹벽
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

  // 3) 대형 이중창 유리 섀시 영역 (상단 55% 높이)
  const winX = pillarW + 8;
  const winW = size - (pillarW + 8) * 2;
  const winY = 22;
  const winH = Math.round(size * 0.52); // ~266px

  // 창틀 외곽 화이트/라이트그레이 알루미늄 새시 프레임
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(winX - 4, winY - 4, winW + 8, winH + 8);
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);

  // 하늘빛 반사 틴트 글래스 (이중창 반사)
  const glassGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
  glassGrad.addColorStop(0, '#0F233F');
  glassGrad.addColorStop(0.3, '#1E3A5F');
  glassGrad.addColorStop(0.65, '#0284C7');
  glassGrad.addColorStop(1, '#0F1E36');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(winX, winY, winW, winH);

  // 사선 하늘 반사광 하이라이트 (Specular Sky Streaks)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.moveTo(winX + 20, winY + winH);
  ctx.lineTo(winX + 110, winY);
  ctx.lineTo(winX + 160, winY);
  ctx.lineTo(winX + 70, winY + winH);
  ctx.closePath();
  ctx.fill();

  // 중앙 슬라이딩 분할 프레임 바
  ctx.fillStyle = '#F8FAFC';
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

  // 알루미늄 안전 핸드레일 상부 바 (#334155)
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
  bgGrad.addColorStop(0, '#0369A1');
  bgGrad.addColorStop(0.35, '#0284C7');
  bgGrad.addColorStop(0.7, '#075985');
  bgGrad.addColorStop(1, '#0C4A6E');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2) 사선 반사광 셰브론 밴드
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.moveTo(30, size);
  ctx.lineTo(180, 0);
  ctx.lineTo(240, 0);
  ctx.lineTo(90, size);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(186, 230, 253, 0.20)';
  ctx.beginPath();
  ctx.moveTo(220, size);
  ctx.lineTo(370, 0);
  ctx.lineTo(410, 0);
  ctx.lineTo(260, size);
  ctx.closePath();
  ctx.fill();

  // 3) 격자형 수평/수직 알루미늄 멀리언 프레임
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

  // 4) 내부 블라인드/루버 쉐이딩 패턴
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

  // 1) 상층부 베이스: 트래버틴 베이지 석재 타일
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, size, size);

  // 석재 패널 격자 줄눈
  ctx.fillStyle = '#94A3B8';
  for (let y = 0; y < size * 0.55; y += Math.round(size * 0.14)) {
    ctx.fillRect(0, y, size, 3);
  }
  for (let x = 0; x < size; x += Math.round(size * 0.25)) {
    ctx.fillRect(x, 0, 3, Math.round(size * 0.55));
  }

  // 상층부 통창
  const upperWinW = Math.round(size * 0.36);
  const upperWinH = Math.round(size * 0.3);
  const upperWinY = 24;
  const winXs = [Math.round(size * 0.09), Math.round(size * 0.55)];

  for (const wx of winXs) {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(wx - 3, upperWinY - 3, upperWinW + 6, upperWinH + 6);
    ctx.fillStyle = '#0F1E36';
    ctx.fillRect(wx, upperWinY, upperWinW, upperWinH);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(wx + 10, upperWinY + upperWinH);
    ctx.lineTo(wx + 45, upperWinY);
    ctx.lineTo(wx + 70, upperWinY);
    ctx.lineTo(wx + 35, upperWinY + upperWinH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx, upperWinY, upperWinW, upperWinH);
  }

  // 2) 중간 간판 띠장 영역
  const signY = Math.round(size * 0.52);
  const signH = Math.round(size * 0.1);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, signY, size, signH);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, signY, size, 4);
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, signY + signH - 3, size, 3);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(Math.round(size * 0.2), signY + Math.round(signH * 0.35), Math.round(size * 0.6), 6);

  // 3) 1층 대형 쇼윈도 통유리 아트리움
  const shopY = signY + signH;
  const shopH = size - shopY;

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

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, shopY + 5, size - 20, shopH - 10);

  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(size / 2 - 2, shopY + 5, 4, shopH - 10);

  return canvas;
}

/**
 * 4. 랜드마크 및 고층 타워 반사 유리 커튼월 외벽 텍스처 생성기 (512x512)
 */
export function createLandmarkCurtainWallCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const baseGrad = ctx.createLinearGradient(0, 0, size, size);
  baseGrad.addColorStop(0, '#0F172A');
  baseGrad.addColorStop(0.2, '#1E3A8A');
  baseGrad.addColorStop(0.5, '#1D4ED8');
  baseGrad.addColorStop(0.8, '#2563EB');
  baseGrad.addColorStop(1, '#0284C7');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  const floorHeight = 64;
  for (let y = 0; y < size; y += floorHeight) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(0, y, size, 14);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, y + 14, size, 3);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, y + 17, size, 2);
  }

  const mullionStep = 32;
  for (let x = 0; x < size; x += mullionStep) {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(x, 0, 2, size);
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(x + 2, 0, 1, size);
  }

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
 * 5. 사각 태양광 패널 그리드 텍스처 생성기 (256x256)
 * - 옥상 태양광 발전기 모듈 그리드 (솔라셀 웨이퍼 & 실버 버스바 전극선)
 */
export function createSolarPanelCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1) 깊은 네이비 솔라셀 베이스 (#081426)
  ctx.fillStyle = '#081426';
  ctx.fillRect(0, 0, size, size);

  // 2) 솔라셀 그리드 (6열 x 3행)
  const cols = 6;
  const rows = 3;
  const cellW = size / cols;
  const cellH = size / rows;
  const gap = 2.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + gap;
      const y = r * cellH + gap;
      const w = cellW - gap * 2;
      const h = cellH - gap * 2;

      // 실리콘 웨이퍼 반사광 그라디언트
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#0a2540');
      grad.addColorStop(0.35, '#0284c7');
      grad.addColorStop(0.7, '#0369a1');
      grad.addColorStop(1, '#082f49');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      // 버스바(Busbar) 은색 전극선 2개
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(x + w * 0.33, y, 1.5, h);
      ctx.fillRect(x + w * 0.66, y, 1.5, h);
    }
  }

  // 3) 외곽 알루미늄 보호 프레임
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

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
  const solarCanvas = createSolarPanelCanvas(256);

  const aptTex = createRepeatTexture(aptCanvas);
  const comTex = createRepeatTexture(comCanvas);
  const neighTex = createRepeatTexture(neighCanvas);
  const landmarkTex = createRepeatTexture(landmarkCanvas);
  const solarTex = createRepeatTexture(solarCanvas);

  const greenBaseMat = new THREE.MeshStandardMaterial({
    color: 0x15803d, // 녹색 원형 바탕 (#15803d: 산뜻한 항공 헬리패드 녹색 우레탄)
    roughness: 0.55,
    metalness: 0.15,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const whiteMarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // 백색 'H' 마킹
    roughness: 0.25,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  materialsCache = {
    // 1) 한국형 판상형 아파트 외벽 머티리얼 (창문 반사광 강화: roughness 0.2, metalness 0.8)
    apartmentMaterial: new THREE.MeshStandardMaterial({
      map: aptTex,
      roughness: 0.2, // 요구 조건 완벽 일치: 햇빛 각도에 따라 반짝이는 하이라이트
      metalness: 0.8, // 요구 조건 완벽 일치: 은은한 하늘빛 반사
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

    // 4) 랜드마크 및 15층 이상 고층 반사 유리 커튼월 타워 (roughness: 0.15, metalness: 0.85)
    landmarkTowerMaterial: new THREE.MeshStandardMaterial({
      map: landmarkTex,
      color: 0x1d4ed8,
      roughness: 0.15,
      metalness: 0.85,
      side: THREE.DoubleSide,
    }),

    // 5) 옥상 헬리패드 녹색 원형 바탕 (호환용 alias 포함)
    helipadBaseMaterial: greenBaseMat,
    helipadGreenBaseMaterial: greenBaseMat,

    // 6) 옥상 헬리패드 백색 'H' 마킹 (호환용 alias 포함)
    helipadMarkMaterial: whiteMarkMat,
    helipadWhiteMarkMaterial: whiteMarkMat,

    // 7) 옥상 헬리패드 노란색 안전 경계 링
    helipadYellowRingMaterial: new THREE.MeshStandardMaterial({
      color: 0xfacc15, // 고휘도 항공 노랑
      roughness: 0.35,
      metalness: 0.25,
      side: THREE.DoubleSide,
    }),

    // 8) 사각 태양광 패널 그리드
    solarPanelMaterial: new THREE.MeshStandardMaterial({
      map: solarTex,
      roughness: 0.15,
      metalness: 0.85,
      side: THREE.DoubleSide,
    }),

    // 9) 옥상 STS 원통형 물탱크 (스테인리스 스틸 실버)
    waterTankMaterial: new THREE.MeshStandardMaterial({
      color: 0xc8d1dc,
      roughness: 0.2,
      metalness: 0.85,
    }),

    // 10) 옥상 환기 벤트 / 공조 덕트
    ventHvacMaterial: new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.4,
      metalness: 0.65,
    }),

    // 11) 옥상 방수 슬래브 (차콜 그레이 #334155)
    roofSlateMaterial: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.2,
      flatShading: true,
      side: THREE.DoubleSide,
    }),

    // 12) 1.2m 돌출 난간 (Parapet) - 차콜 그레이 (#334155)
    parapetMaterial: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.25,
      flatShading: true,
      side: THREE.DoubleSide,
    }),

    // 13) 엘리베이터 권상기실 / 옥탑 코어 (Penthouse)
    penthouseMaterial: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.3,
      flatShading: true,
    }),

    // 14) 20도 입체 박공 지붕 (Gabled Roof) - 테라코타 기와 적갈색
    gabledRoofMaterial: new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.45,
      metalness: 0.2,
      flatShading: true,
      side: THREE.DoubleSide,
    }),

    // 15) 지형 밀착 기초 옹벽 (Foundation Clamping Wall)
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
    materialsCache.helipadGreenBaseMaterial,
    materialsCache.helipadMarkMaterial,
    materialsCache.helipadWhiteMarkMaterial,
    materialsCache.helipadYellowRingMaterial,
    materialsCache.solarPanelMaterial,
    materialsCache.waterTankMaterial,
    materialsCache.ventHvacMaterial,
    materialsCache.roofSlateMaterial,
    materialsCache.parapetMaterial,
    materialsCache.penthouseMaterial,
    materialsCache.gabledRoofMaterial,
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
