/**
 * proceduralFacades.ts
 *
 * Three.js 기반 LOD2 실측 층고 기준 UV 매핑 및 건축 외벽(Procedural Facades) 셰이더 모듈
 * - 층고 기준: 1개 층 = 3.0m, 창문 1개 폭 = 2.5m 단위로 UV 좌표의 Repeat 비율 동적 산출
 * - texture.wrapS = THREE.RepeatWrapping, texture.wrapT = THREE.RepeatWrapping 적용
 * - Canvas 2D API 기반 고해상도 건축 파사드 텍스처 (콘크리트/석재 패널 줄눈, 반사형 창호, 1층 로비 캐노피/대형 통유리)
 * - 배칭 및 드로우 콜(Draw Call) 최적화: 수백 동의 건물 벽면을 1층 로비 / 기준층 2개의 단일 버퍼 지오메트리로 병합
 */

import * as THREE from 'three';

export interface FacadeGenerationOptions {
  polygon: [number, number][]; // GeoJSON 외곽선 좌표 [[lng, lat], ...]
  height: number;              // 건축물 실측 높이 (m)
  groundElev?: number;         // 건물 위치 지형 표고 (m)
  type?: string;               // 건물 용도 ('commercial', 'residential', 'military' 등)
  originLngLat: [number, number]; // Threebox 씬 원점 경위도 [lng, lat]
}

export interface FacadeMaterialsCache {
  lobbyCommercial: THREE.MeshStandardMaterial;
  upperCommercial: THREE.MeshStandardMaterial;
  lobbyResidential: THREE.MeshStandardMaterial;
  upperResidential: THREE.MeshStandardMaterial;
  militaryDepot: THREE.MeshStandardMaterial;
}

let materialsCache: FacadeMaterialsCache | null = null;

/**
 * 1. 기준층 상업/업무용 외벽 텍스처 (1개 층 3.0m x 창문 1개 2.5m 비례, 256x256)
 * - 콘크리트 및 석재 패널 줄눈(Joint Line)
 * - 어두운 반사 유리 질감(틴트 글래스 + 사선 반사광 채광)
 * - 밝은 그레이 알루미늄 창호 프레임 및 수직 멀리온(Mullion)
 */
export function createUpperFloorCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1) 베이스 외벽 컬러: 모던 라이트 베이지-그레이 석재 질감 (#E2E8F0)
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, size, size);

  // 미세 석재 질감 노이즈
  ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
  for (let y = 0; y < size; y += 4) {
    ctx.fillRect(0, y, size, 1.5);
  }

  // 2) 층간 슬래브 및 수평 줄눈 (두께 4.5px 밝은 그레이)
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(0, 0, size, 4); // 상단 층간 경계선
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 4, size, 2);
  ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
  ctx.fillRect(0, size - 2, size, 2); // 하단 슬래브 접합부

  // 석재 패널 세로 줄눈 (Vertical Joint Lines)
  ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(size - 2, 0, 2, size);
  ctx.fillRect(size / 2 - 1, 0, 1.5, size); // 중앙 패널 줄눈

  // 패널 베벨 하이라이트 (3D 홈 입체감)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(2, 6, size - 4, 1.0);

  // 3) 창문 영역 배치 (가로 72%, 세로 62% 비례)
  const marginX = Math.round(size * 0.12); // ~31px
  const winW = size - marginX * 2; // ~194px
  const winY = Math.round(size * 0.14); // ~36px
  const winH = Math.round(size * 0.62); // ~159px

  // 창호 외곽 알루미늄 새시 프레임 (#334155, #64748B)
  ctx.fillStyle = '#334155';
  ctx.fillRect(marginX - 4, winY - 4, winW + 8, winH + 8);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(marginX - 2, winY - 2, winW + 4, winH + 4);

  // 어두운 반사 유리 질감 (그라데이션 틴트 글래스)
  const glassGrad = ctx.createLinearGradient(marginX, winY, marginX + winW, winY + winH);
  glassGrad.addColorStop(0, '#0F1E36'); // 짙은 딥블루 스카이 반사
  glassGrad.addColorStop(0.35, '#1E293B');
  glassGrad.addColorStop(0.7, '#0F172A');
  glassGrad.addColorStop(1, '#1A293E');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(marginX, winY, winW, winH);

  // 사선 유리 반사광 채광 스트릭 (Specular Sheen Bands)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(marginX + 10, winY + winH);
  ctx.lineTo(marginX + 55, winY);
  ctx.lineTo(marginX + 78, winY);
  ctx.lineTo(marginX + 33, winY + winH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(186, 230, 253, 0.14)';
  ctx.beginPath();
  ctx.moveTo(marginX + 65, winY + winH);
  ctx.lineTo(marginX + 110, winY);
  ctx.lineTo(marginX + 125, winY);
  ctx.lineTo(marginX + 80, winY + winH);
  ctx.closePath();
  ctx.fill();

  // 4) 밝은 그레이 알루미늄 창호 멀리온 (수직/수평 분할 프레임)
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2.0;
  // 중앙 수직 멀리온
  ctx.beginPath();
  ctx.moveTo(marginX + winW / 2, winY);
  ctx.lineTo(marginX + winW / 2, winY + winH);
  ctx.stroke();
  // 상단 트랜섬 분할바 (1/3 높이)
  ctx.beginPath();
  ctx.moveTo(marginX, winY + winH * 0.32);
  ctx.lineTo(marginX + winW, winY + winH * 0.32);
  ctx.stroke();

  // 창문 내측 음영 테두리
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.0;
  ctx.strokeRect(marginX + 1, winY + 1, winW - 2, winH - 2);

  // 5) 창호 하단 스팬드럴 패널 & 창틀 턱 (Sill Drop Shadow)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(marginX - 4, winY + winH + 4, winW + 8, 3);

  return canvas;
}

/**
 * 2. 1층 전용 로비 파사드 텍스처 (1개 층 3.0m x 창문 1개 2.5m 비례, 256x256)
 * - 출입문 캐노피 및 차양 드롭 섀도우
 * - 대형 전면 통유리창(Curtain Wall Lobby) 및 실내 웜라이트 은은한 조명
 * - 화강암 다크 석재 기둥 & 자동 출입문 프레임
 */
export function createLobbyCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1) 1층 외벽 배경: 중후한 흑색 화강석 기단부 (#1E293B)
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, size, size);

  // 좌우 화강암 구조 기둥 (Pillars)
  const pillarW = 22;
  const colGrad1 = ctx.createLinearGradient(0, 0, pillarW, 0);
  colGrad1.addColorStop(0, '#0F172A');
  colGrad1.addColorStop(0.5, '#334155');
  colGrad1.addColorStop(1, '#1E293B');
  ctx.fillStyle = colGrad1;
  ctx.fillRect(0, 0, pillarW, size);

  const colGrad2 = ctx.createLinearGradient(size - pillarW, 0, size, 0);
  colGrad2.addColorStop(0, '#1E293B');
  colGrad2.addColorStop(0.5, '#334155');
  colGrad2.addColorStop(1, '#0F172A');
  ctx.fillStyle = colGrad2;
  ctx.fillRect(size - pillarW, 0, pillarW, size);

  // 2) 대형 로비 통유리 아트리움 (Double-height Clear Glass)
  const lobbyX = pillarW;
  const lobbyW = size - pillarW * 2;
  const lobbyY = 28;
  const lobbyH = size - 38;

  const lobbyGlassGrad = ctx.createLinearGradient(lobbyX, lobbyY, lobbyX, lobbyY + lobbyH);
  lobbyGlassGrad.addColorStop(0, '#0F1E36');
  lobbyGlassGrad.addColorStop(0.65, '#162E48');
  lobbyGlassGrad.addColorStop(1, '#243C5A'); // 실내 바닥 웜라이트 확산
  ctx.fillStyle = lobbyGlassGrad;
  ctx.fillRect(lobbyX, lobbyY, lobbyW, lobbyH);

  // 실내 로비 데스크 및 웜라이트 조명 확산
  const warmLight = ctx.createRadialGradient(size / 2, size - 30, 10, size / 2, size - 30, 80);
  warmLight.addColorStop(0, 'rgba(254, 240, 138, 0.20)');
  warmLight.addColorStop(0.6, 'rgba(253, 224, 71, 0.08)');
  warmLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = warmLight;
  ctx.fillRect(lobbyX, lobbyY + lobbyH * 0.4, lobbyW, lobbyH * 0.6);

  // 3) 상단 출입문 캐노피 (Entrance Canopy Slab)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(lobbyX - 4, 18, lobbyW + 8, 10);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(lobbyX - 3, 19, lobbyW + 6, 2);
  // 캐노피 하단 짙은 드롭 섀도우
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(lobbyX, 28, lobbyW, 8);

  // 캐노피 하단 매립형 LED 다운라이트 4구
  for (let i = 1; i <= 4; i++) {
    const lx = lobbyX + (lobbyW / 5) * i;
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(lx, 27, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
    ctx.beginPath();
    ctx.arc(lx, 30, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4) 자동 출입문(Sliding Glass Entrance Doors) 프레임
  const doorW = lobbyW * 0.65;
  const doorX = size / 2 - doorW / 2;
  const doorY = Math.round(size * 0.45);
  const doorH = size - doorY - 10;

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX, doorY, doorW, doorH);

  // 양개형 자동문 중앙 분할선
  ctx.beginPath();
  ctx.moveTo(doorX + doorW / 2, doorY);
  ctx.lineTo(doorX + doorW / 2, doorY + doorH);
  ctx.stroke();

  // 도어 손잡이 바
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(doorX + doorW / 2 - 5, doorY + doorH * 0.4, 2, doorH * 0.25);
  ctx.fillRect(doorX + doorW / 2 + 3, doorY + doorH * 0.4, 2, doorH * 0.25);

  // 5) 지면 맞닿는 석재 걸레받이 (Granite Plinth)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, size - 10, size, 10);

  return canvas;
}

/**
 * 3. 주거/아파트용 외벽 텍스처 (1개 층 3.0m x 창문 1개 2.5m 비례, 256x256)
 * - 발코니 난간선 및 층간 콘크리트 슬래브 특화
 * - 알루미늄 화이트 새시와 고대비 틴트 글래스
 */
export function createResidentialCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 베이스 웜 베이지/오프화이트 콘크리트 (#F8FAFC)
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  // 층간 콘크리트 슬래브 (두께 5px)
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 0, size, 5);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(0, 4.5, size, 1.5);

  const marginX = 20;
  const winW = size - marginX * 2;
  const winY = 14;
  const winH = Math.round(size * 0.52);

  // 창문 어두운 틴트 글래스
  const glassGrad = ctx.createLinearGradient(marginX, winY, marginX + winW, winY + winH);
  glassGrad.addColorStop(0, '#1E293B');
  glassGrad.addColorStop(0.5, '#334155');
  glassGrad.addColorStop(1, '#0F172A');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(marginX, winY, winW, winH);

  // 사선 반사광 하이라이트
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.moveTo(marginX + 10, winY + winH);
  ctx.lineTo(marginX + 45, winY);
  ctx.lineTo(marginX + 65, winY);
  ctx.lineTo(marginX + 30, winY + winH);
  ctx.closePath();
  ctx.fill();

  // 창틀 새시 (화이트/연회색 알루미늄)
  ctx.strokeStyle = '#F1F5F9';
  ctx.lineWidth = 2;
  ctx.strokeRect(marginX, winY, winW, winH);
  ctx.beginPath();
  ctx.moveTo(marginX + winW / 2, winY);
  ctx.lineTo(marginX + winW / 2, winY + winH);
  ctx.stroke();

  // 하단 발코니(베란다) 난간 및 스팬드럴 패널
  const balY = winY + winH;
  const balH = size - balY - 5;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(marginX, balY, winW, balH);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(marginX, balY, winW, 2);

  // 세로 살 (Railing Balusters)
  ctx.fillStyle = '#64748B';
  for (let x = marginX + 6; x < marginX + winW - 4; x += 10) {
    ctx.fillRect(x, balY + 2, 1.5, balH - 3);
  }

  return canvas;
}

/**
 * 4. 군사/공공청사/물류데포 외벽 텍스처 (1개 층 3.0m x 창문 1개 2.5m 비례, 256x256)
 * - 짙은 슬레이트 카키 그레이 및 방호 루버 창호 패턴
 */
export function createMilitaryCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 짙은 슬레이트 카키 그레이
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, size, size);

  // 슬래브 조인트
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, size, 4);
  ctx.fillRect(0, size - 3, size, 3);

  // 창문 (방호형 컴팩트 윈도우)
  const winX = 32;
  const winW = size - 64;
  const winY = 32;
  const winH = Math.round(size * 0.45);

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(winX, winY, winW, winH);

  // 세로 방호 루버
  ctx.fillStyle = '#475569';
  for (let x = winX + 8; x < winX + winW; x += 12) {
    ctx.fillRect(x, winY, 2.5, winH);
  }

  // 창틀 외곽 스틸 프레임
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 2;
  ctx.strokeRect(winX, winY, winW, winH);

  return canvas;
}

/**
 * Three.js 캔버스 텍스처 싱글톤 생성 및 반복 타일링 속성 설정
 */
function setupTexture(canvas: HTMLCanvasElement, repeatV = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = repeatV ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * MapLibre 인스턴스에 절차적 외벽 스프라이트 등록 (256x256)
 */
export function registerProceduralFacadeTextures(map: any, size = 256): void {
  if (typeof window === 'undefined' || !map) return;

  try {
    const list = [
      { id: 'facade-window-grid-commercial', canvas: createUpperFloorCanvas(size) },
      { id: 'facade-window-grid-residential', canvas: createResidentialCanvas(size) },
      { id: 'facade-window-grid-lobby', canvas: createLobbyCanvas(size) },
      { id: 'facade-window-grid-military', canvas: createMilitaryCanvas(size) },
    ];

    for (const item of list) {
      if (!map.hasImage(item.id)) {
        const ctx = item.canvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.getImageData(0, 0, size, size);
          map.addImage(item.id, imgData);
        }
      }
    }
  } catch (err) {
    console.warn('[proceduralFacades] Failed to register facade textures to map:', err);
  }
}

/**
 * 건축 파사드 PBR 재질 싱글톤 캐시 반환 (256x256 타일 규격)
 */
export function getFacadeMaterials(): FacadeMaterialsCache | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (materialsCache) return materialsCache;

  const upperComCanvas = createUpperFloorCanvas(256);
  const lobbyComCanvas = createLobbyCanvas(256);
  const upperResCanvas = createResidentialCanvas(256);
  const lobbyResCanvas = createLobbyCanvas(256);
  const milCanvas = createMilitaryCanvas(256);

  const upperComTex = setupTexture(upperComCanvas, true);
  const lobbyComTex = setupTexture(lobbyComCanvas, false);
  const upperResTex = setupTexture(upperResCanvas, true);
  const lobbyResTex = setupTexture(lobbyResCanvas, false);
  const milTex = setupTexture(milCanvas, true);

  materialsCache = {
    upperCommercial: new THREE.MeshStandardMaterial({
      map: upperComTex,
      roughness: 0.35,
      metalness: 0.65,
      side: THREE.DoubleSide,
    }),
    lobbyCommercial: new THREE.MeshStandardMaterial({
      map: lobbyComTex,
      roughness: 0.3,
      metalness: 0.7,
      side: THREE.DoubleSide,
    }),
    upperResidential: new THREE.MeshStandardMaterial({
      map: upperResTex,
      roughness: 0.45,
      metalness: 0.45,
      side: THREE.DoubleSide,
    }),
    lobbyResidential: new THREE.MeshStandardMaterial({
      map: lobbyResTex,
      roughness: 0.35,
      metalness: 0.65,
      side: THREE.DoubleSide,
    }),
    militaryDepot: new THREE.MeshStandardMaterial({
      map: milTex,
      roughness: 0.55,
      metalness: 0.35,
      side: THREE.DoubleSide,
    }),
  };

  return materialsCache;
}

/**
 * WGS84 좌표 배열을 Three.js 씬 원점 기준 상대 미터([x, z]) 좌표로 변환
 */
function projectCoordsToLocalMeters(
  coords: [number, number][],
  origin: [number, number]
): THREE.Vector2[] {
  if (!coords || coords.length < 3) return [];

  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
  const metersPerLat = (Math.PI / 180) * 6378137;

  const pts: THREE.Vector2[] = [];
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    if (i === len - 1 && len > 3) {
      const d0 = Math.abs(coords[i][0] - coords[0][0]);
      const d1 = Math.abs(coords[i][1] - coords[0][1]);
      if (d0 < 1e-7 && d1 < 1e-7) break;
    }
    const x = (coords[i][0] - origin[0]) * metersPerLng;
    const z = -(coords[i][1] - origin[1]) * metersPerLat;
    pts.push(new THREE.Vector2(x, z));
  }

  // 반시계 방향(CCW) 와인딩 오더 보장
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  if (area < 0) {
    pts.reverse();
  }

  return pts;
}

/**
 * [배칭 최적화] 다중 GeoJSON 건축물 피처 컬렉션 일괄 외벽 생성 유틸리티
 * - 1개 층 3.0m, 창문 폭 2.5m 기준 정밀 UV 매핑
 * - 1층 로비와 기준층을 각각 단일 BufferGeometry로 병합하여 Draw Call을 2개로 극소화
 */
export function generateBuildingFacadesGroup(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  originLngLat: [number, number],
  queryElevationFn?: (lngLat: [number, number]) => number | null
): THREE.Group {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'procedural-building-facades-group';

  const mats = getFacadeMaterials();
  if (!mats) return rootGroup;

  // 버퍼 배열 (상업/업무 기준층 & 로비)
  const comLobbyPositions: number[] = [];
  const comLobbyNormals: number[] = [];
  const comLobbyUvs: number[] = [];

  const comUpperPositions: number[] = [];
  const comUpperNormals: number[] = [];
  const comUpperUvs: number[] = [];

  // 주거/기타
  const resUpperPositions: number[] = [];
  const resUpperNormals: number[] = [];
  const resUpperUvs: number[] = [];

  for (const feat of features) {
    if (!feat.geometry) continue;

    const props = feat.properties || {};
    const totalH = Number(props.height || props.render_height || (props['building:levels'] ? props['building:levels'] * 3.5 : 16));
    const bldType = String(props.type || props.bld_category || props.class || '').toLowerCase();
    const isResidential = bldType.includes('residential') || bldType.includes('apartment') || bldType.includes('villa');

    const rings: [number, number][][] = [];
    if (feat.geometry.type === 'Polygon') {
      rings.push(feat.geometry.coordinates[0] as [number, number][]);
    } else if (feat.geometry.type === 'MultiPolygon') {
      for (const poly of feat.geometry.coordinates) {
        rings.push(poly[0] as [number, number][]);
      }
    }

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;

      const pts = projectCoordsToLocalMeters(ring, originLngLat);
      if (pts.length < 3) continue;

      let groundElev = typeof props.min_elev === 'number' ? props.min_elev : 0;
      if (groundElev === 0 && queryElevationFn) {
        let minE = Infinity;
        for (const coord of ring) {
          const e = queryElevationFn(coord);
          if (e !== null && !isNaN(e) && e < minE) minE = e;
        }
        groundElev = isFinite(minE) ? minE : (queryElevationFn(ring[0]) ?? 0);
      }

      const H_1F = Math.min(totalH, 3.5);
      const H_Upper = Math.max(0, totalH - H_1F);

      let cumDist = 0;
      const N = pts.length;

      for (let i = 0; i < N; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % N];
        const segW = p0.distanceTo(p1);
        if (segW < 0.1) continue;

        // [실측 층고 기준 UV 타일링 계산]
        // 창문 1개 폭 = 2.5m 단위
        const u0 = cumDist / 2.5;
        const u1 = (cumDist + segW) / 2.5;
        cumDist += segW;

        // 외향 법선 벡터
        const dx = p1.x - p0.x;
        const dz = p1.y - p0.y;
        const nx = dz / segW;
        const nz = -dx / segW;

        // 1) 1층 로비 벽면 생성 (0.0m ~ 3.5m)
        const y0 = groundElev;
        const y1 = groundElev + H_1F;
        const vLobbyTop = 1.0;

        // 외향 법선 와인딩: (v0, v2, v1) 및 (v0, v3, v2)
        comLobbyPositions.push(
          p0.x, y0, p0.y,
          p1.x, y1, p1.y,
          p1.x, y0, p1.y,
          p0.x, y0, p0.y,
          p0.x, y1, p0.y,
          p1.x, y1, p1.y
        );
        for (let k = 0; k < 6; k++) comLobbyNormals.push(nx, 0, nz);
        comLobbyUvs.push(
          u0, 0,
          u1, vLobbyTop,
          u1, 0,
          u0, 0,
          u0, vLobbyTop,
          u1, vLobbyTop
        );

        // 2) 기준층 외벽 벽면 생성 (3.5m ~ totalH)
        if (H_Upper > 0.5) {
          const y2 = groundElev + totalH;
          // 층고 3.0m 단위
          const vUpperTop = H_Upper / 3.0;

          const targetPos = isResidential ? resUpperPositions : comUpperPositions;
          const targetNorm = isResidential ? resUpperNormals : comUpperNormals;
          const targetUv = isResidential ? resUpperUvs : comUpperUvs;

          targetPos.push(
            p0.x, y1, p0.y,
            p1.x, y2, p1.y,
            p1.x, y1, p1.y,
            p0.x, y1, p0.y,
            p0.x, y2, p0.y,
            p1.x, y2, p1.y
          );
          for (let k = 0; k < 6; k++) targetNorm.push(nx, 0, nz);
          targetUv.push(
            u0, 0,
            u1, vUpperTop,
            u1, 0,
            u0, 0,
            u0, vUpperTop,
            u1, vUpperTop
          );
        }
      }
    }
  }

  // 1) 1층 로비 병합 메쉬
  if (comLobbyPositions.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(comLobbyPositions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(comLobbyNormals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(comLobbyUvs, 2));

    const mesh = new THREE.Mesh(geom, mats.lobbyCommercial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootGroup.add(mesh);
  }

  // 2) 상업/업무 기준층 병합 메쉬
  if (comUpperPositions.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(comUpperPositions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(comUpperNormals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(comUpperUvs, 2));

    const mesh = new THREE.Mesh(geom, mats.upperCommercial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootGroup.add(mesh);
  }

  // 3) 주거 기준층 병합 메쉬
  if (resUpperPositions.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(resUpperPositions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(resUpperNormals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(resUpperUvs, 2));

    const mesh = new THREE.Mesh(geom, mats.upperResidential);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rootGroup.add(mesh);
  }

  return rootGroup;
}
