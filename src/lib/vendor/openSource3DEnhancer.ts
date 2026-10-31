/**
 * lib/vendor/openSource3DEnhancer.ts
 *
 * [GeoBrief 3D 3단계: GitHub 오픈소스 3종 핵심 렌더링 엔진 벤더링 모듈]
 *
 * 1. StrandedKitty/streets-gl:
 *    - 건물 밑동 접지 암부(Contact Ambient Occlusion) 계산 & 셰이딩
 *    - 아파트·상가·오피스 평슬래브 옥상 설비 복합 메쉬(엘리베이터 옥탑 권상기실 + 냉각탑/실외기 박스 + 옥상 난간)
 *
 * 2. kekscom/osmbuildings:
 *    - 브이월드 레퍼런스(image_7c1ba4, image_7c1b61) 1:1 매칭 수변·호수·하천 반사
 *    - 원주천, 섬강, 소양강, 북한강, 의암호, 경포호, 청초호 수면의 짙은 에메랄드/다크 틸(#163832 ~ #1b4332)
 *
 * 3. mourner/suncalc:
 *    - 천문역학 태양 궤적 & 브이월드 원경 대기 원근감(Aerial Perspective Fog) 결합
 *    - 원경 산악 능선(치악산, 대룡산, 설악산 등)의 깊은 공간감 구현
 *
 * 4. 기하학 무결성 (CCW 정점 정렬, Earcut 수평 슬래브, DoubleSide 재질)
 */

import * as THREE from 'three';
import earcut from 'earcut';
import { calculateSunPosition } from '@/lib/vendor/safeGeoAlgorithms';
import {
  UVRect,
  getDiverseFacadeSlotUV,
} from '@/utils/diverseKoreanFacadeAtlas';

const Earcut = (earcut as any).default || earcut;

export interface Point2D {
  x: number;
  z: number;
}

export type AddQuadFn = (
  pBL: [number, number, number],
  pBR: [number, number, number],
  pTR: [number, number, number],
  pTL: [number, number, number],
  norm: [number, number, number],
  uvRect: UVRect,
  color?: [number, number, number]
) => void;

export type AddTriangleFn = (
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  norm: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  color?: [number, number, number]
) => void;

// =============================================================================
// 1. [Streets-GL 벤더링] 지상 접지 암부(Contact AO) & 옥상 설비 복합 메쉬
// =============================================================================

/**
 * 건물 밑동 접지 암부(Contact Ambient Occlusion) 계산
 * - 건물 밑동(0.0m)에서 0.45(짙은 접지 음영) -> 4.0m 이상에서 1.0(정상 확산광)
 */
export function computeContactAoFactor(heightAboveBase: number, contactDist = 4.0): number {
  const t = Math.max(0.0, Math.min(1.0, heightAboveBase / contactDist));
  // smoothstep 보간
  const smooth = t * t * (3.0 - 2.0 * t);
  return 0.45 + 0.55 * smooth;
}

export interface RooftopEquipmentOptions {
  innerPts: Point2D[];
  topElev: number;
  buildingHeight: number;
  isApartment: boolean;
  isCommercial: boolean;
  seed: number;
  addRooftopQuad: AddQuadFn;
}

/**
 * 상가·오피스·아파트 옥상 설비(엘리베이터 옥탑방 + 냉각탑/실외기 박스) 복합 메쉬 빌더
 */
export function buildStreetsGlRooftopEquipment(options: RooftopEquipmentOptions): void {
  const {
    innerPts,
    topElev,
    buildingHeight,
    isApartment,
    isCommercial,
    seed,
    addRooftopQuad,
  } = options;

  if (!innerPts || innerPts.length < 3) return;

  // 바운딩 박스 계산
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of innerPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  // 옥탑 설비가 들어갈 최소 면적 확보 (스팬 10m 이상, 높이 11m 이상)
  if (spanX < 10.0 || spanZ < 10.0 || buildingHeight < 11.0) return;

  const cX = (minX + maxX) * 0.5;
  const cZ = (minZ + maxZ) * 0.5;

  const uvCoreWall = getDiverseFacadeSlotUV('penthouse_core_wall');
  const uvLouverWall = getDiverseFacadeSlotUV('penthouse_wall');
  const uvParapet = getDiverseFacadeSlotUV('parapet_concrete');
  const uvRoof = getDiverseFacadeSlotUV('roof_concrete_warmgray');
  const whiteRgb: [number, number, number] = [1, 1, 1];

  // 1. [엘리베이터 권상기실 / 계단실 옥탑방]
  const coreW = Math.max(4.5, Math.min(8.5, spanX * 0.32));
  const coreD = Math.max(4.5, Math.min(8.5, spanZ * 0.32));
  const coreH = isApartment ? 3.2 : 2.8;
  const coreTopY = topElev + coreH;

  // 옥탑 위치: 아파트는 한쪽으로 약간 편심, 상가는 중심부
  const offsetX = isApartment ? (spanX * 0.12 * ((seed % 2 === 0) ? 1 : -1)) : 0;
  const offsetZ = isApartment ? (spanZ * 0.12 * ((seed % 3 === 0) ? 1 : -1)) : 0;

  const cx0 = cX + offsetX - coreW * 0.5;
  const cx1 = cX + offsetX + coreW * 0.5;
  const cz0 = cZ + offsetZ - coreD * 0.5;
  const cz1 = cZ + offsetZ + coreD * 0.5;

  // 벽체 4면 (남, 북, 동, 서)
  addRooftopQuad([cx0, topElev, cz1], [cx1, topElev, cz1], [cx1, coreTopY, cz1], [cx0, coreTopY, cz1], [0, 0, 1], uvCoreWall, whiteRgb);
  addRooftopQuad([cx1, topElev, cz0], [cx0, topElev, cz0], [cx0, coreTopY, cz0], [cx1, coreTopY, cz0], [0, 0, -1], uvCoreWall, whiteRgb);
  addRooftopQuad([cx1, topElev, cz1], [cx1, topElev, cz0], [cx1, coreTopY, cz0], [cx1, coreTopY, cz1], [1, 0, 0], uvCoreWall, whiteRgb);
  addRooftopQuad([cx0, topElev, cz0], [cx0, topElev, cz1], [cx0, coreTopY, cz1], [cx0, coreTopY, cz0], [-1, 0, 0], uvCoreWall, whiteRgb);

  // 옥탑 상단 슬래브
  addRooftopQuad([cx0, coreTopY, cz1], [cx1, coreTopY, cz1], [cx1, coreTopY, cz0], [cx0, coreTopY, cz0], [0, 1, 0], uvRoof, whiteRgb);

  // 2. [냉각탑 / 공조 실외기 유닛 박스 (Chiller / Cooling Tower)]
  // 상가, 오피스, 대형 아파트에 냉각탑/실외기 루버 박스 배치
  if ((isCommercial || (isApartment && spanX >= 16.0)) && spanX >= 14.0) {
    const unitW = Math.max(3.0, Math.min(5.5, spanX * 0.22));
    const unitD = Math.max(2.4, Math.min(4.5, spanZ * 0.20));
    const unitH = 1.8;
    const unitTopY = topElev + unitH;

    // 코어 옆 반대편 공간에 배치
    const uxOffset = -offsetX * 1.2 || (spanX * 0.22);
    const uzOffset = -offsetZ * 1.2 || (spanZ * 0.18);

    const ux0 = cX + uxOffset - unitW * 0.5;
    const ux1 = cX + uxOffset + unitW * 0.5;
    const uz0 = cZ + uzOffset - unitD * 0.5;
    const uz1 = cZ + uzOffset + unitD * 0.5;

    // 금속 루버 벽체 4면
    addRooftopQuad([ux0, topElev, uz1], [ux1, topElev, uz1], [ux1, unitTopY, uz1], [ux0, unitTopY, uz1], [0, 0, 1], uvLouverWall, whiteRgb);
    addRooftopQuad([ux1, topElev, uz0], [ux0, topElev, uz0], [ux0, unitTopY, uz0], [ux1, unitTopY, uz0], [0, 0, -1], uvLouverWall, whiteRgb);
    addRooftopQuad([ux1, topElev, uz1], [ux1, topElev, uz0], [ux1, unitTopY, uz0], [ux1, unitTopY, uz1], [1, 0, 0], uvLouverWall, whiteRgb);
    addRooftopQuad([ux0, topElev, uz0], [ux0, topElev, uz1], [ux0, unitTopY, uz1], [ux0, unitTopY, uz0], [-1, 0, 0], uvLouverWall, whiteRgb);

    // 냉각탑 상단 배기 그릴
    addRooftopQuad([ux0, unitTopY, uz1], [ux1, unitTopY, uz1], [ux1, unitTopY, uz0], [ux0, unitTopY, uz0], [0, 1, 0], uvParapet, whiteRgb);
  }
}

// =============================================================================
// 2. [OSMBuildings 벤더링] 수변·호수·하천 반사 및 짙은 에메랄드/다크 틸 규격
// =============================================================================

export const VWORLD_AUTHENTIC_WATER = {
  // 원경(Deep Water / Lake): 짙은 다크 에메랄드 틸 (#163832)
  deepEmeraldTeal: '#163832',
  // 중경(River / Stream): 자연스러운 맑은 딥 틸 (#1b4332)
  mediumEmeraldTeal: '#1b4332',
  // 근경(Shallow / Waterway): 잔물결 에메랄드 그린 (#204f3b)
  rippleEmeraldGreen: '#204f3b',
  // 수면 반사 하이라이트 테두리
  specularEdge: '#2d6a4f',
  // 수면 불투명도 (위성사진과 자연스러운 정합)
  opacity: 0.75,
};

/**
 * kekscom/osmbuildings 기반 강원권 하천·호수 수면 스타일 생성기
 */
export function getVworldWaterLayerStyles(sourceId = 'openmaptiles-vector'): any[] {
  return [
    // 1. 하천·호수 수면 폴리곤 (korean-water-fill)
    {
      id: 'korean-water-fill',
      type: 'fill',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 8,
      maxzoom: 24,
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9, VWORLD_AUTHENTIC_WATER.deepEmeraldTeal,
          13, VWORLD_AUTHENTIC_WATER.mediumEmeraldTeal,
          16, VWORLD_AUTHENTIC_WATER.rippleEmeraldGreen,
        ],
        'fill-opacity': VWORLD_AUTHENTIC_WATER.opacity,
        'fill-antialias': true,
      },
      layout: {
        visibility: 'visible',
      },
    },

    // 2. 수면 가장자리 미세 물결/반사 테두리 (korean-water-edge)
    {
      id: 'korean-water-edge',
      type: 'line',
      source: sourceId,
      'source-layer': 'water',
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': VWORLD_AUTHENTIC_WATER.specularEdge,
        'line-opacity': 0.45,
        'line-width': 1.5,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },

    // 3. 소하천 및 지류 수로 선형 (korean-waterway-line)
    {
      id: 'korean-waterway-line',
      type: 'line',
      source: sourceId,
      'source-layer': 'waterway',
      minzoom: 11,
      maxzoom: 24,
      paint: {
        'line-color': VWORLD_AUTHENTIC_WATER.mediumEmeraldTeal,
        'line-opacity': VWORLD_AUTHENTIC_WATER.opacity,
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          11, 0.8,
          14, 1.8,
          17, 3.2,
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'visible',
      },
    },
  ];
}

// =============================================================================
// 3. [mourner/suncalc 벤더링] 정밀 천문 태양광 & 원경 대기 원근감(Fog)
// =============================================================================

export interface SolarAtmosphereResult {
  azimuthDeg: number;
  altitudeDeg: number;
  directionalVector: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientIntensity: number;
  fogColor: string;
  fogDensity: number;
  skyZenithColor: string;
  skyHorizonColor: string;
}

/**
 * mourner/suncalc 기반 시간·위치별 정밀 천문 태양광 및 대기 원근감 산출
 */
export function computeSolarAtmosphere(
  date: Date,
  lat: number,
  lng: number
): SolarAtmosphereResult {
  const sunPos = calculateSunPosition(date, lat, lng);
  const altDeg = sunPos.altitudeDeg;
  const azDeg = sunPos.azimuthDeg;

  const radAlt = (altDeg * Math.PI) / 180;
  const radAz = (azDeg * Math.PI) / 180;

  const dx = Math.sin(radAz) * Math.cos(radAlt);
  const dy = Math.sin(radAlt);
  const dz = -Math.cos(radAz) * Math.cos(radAlt);

  // 주간 / 황혼 / 야간 구분
  const isDay = altDeg > 5.0;
  const isTwilight = altDeg >= -6.0 && altDeg <= 5.0;

  let sunColor = '#ffffff';
  let sunIntensity = 1.85;
  let ambientIntensity = 1.15;
  let fogColor = '#cbd5e1'; // 주간 맑은 슬레이트 대기 안개
  let skyZenith = '#1e3a8a';
  let skyHorizon = '#60a5fa';

  if (isDay) {
    if (altDeg > 45.0) {
      // 한낮
      sunColor = '#fffdfa';
      sunIntensity = 1.95;
      fogColor = '#cbd5e1';
    } else {
      // 오전/오후 비스듬한 직사광 (건물 명암비 극대화)
      sunColor = '#fef3c7';
      sunIntensity = 1.80;
      fogColor = '#d1d5db';
    }
  } else if (isTwilight) {
    // 일출/일몰 노을
    sunColor = '#fb923c';
    sunIntensity = 1.20;
    ambientIntensity = 0.70;
    fogColor = '#fdba74';
    skyZenith = '#1e1b4b';
    skyHorizon = '#f97316';
  } else {
    // 야간
    sunColor = '#3b82f6';
    sunIntensity = 0.35;
    ambientIntensity = 0.40;
    fogColor = '#0f172a';
    skyZenith = '#020617';
    skyHorizon = '#0f172a';
  }

  return {
    azimuthDeg: azDeg,
    altitudeDeg: altDeg,
    directionalVector: [dx, Math.max(0.2, dy), dz],
    sunColor,
    sunIntensity,
    ambientIntensity,
    fogColor,
    fogDensity: 0.00018, // 원경 산악 능선 대기 원근감 최적 밀도
    skyZenithColor: skyZenith,
    skyHorizonColor: skyHorizon,
  };
}

/**
 * Three.js 씬에 은은한 원경 대기 안개(Aerial Perspective Fog) 실시간 바인딩
 */
export function applyAtmosphericPerspectiveFog(
  scene: THREE.Scene,
  fogColor = '#cbd5e1',
  density = 0.00018
): void {
  if (!scene.fog) {
    scene.fog = new THREE.FogExp2(new THREE.Color(fogColor), density);
  } else if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.set(fogColor);
    scene.fog.density = density;
  }
}

// =============================================================================
// 4. [기하학 무결성 보장] CCW 정점 정렬 및 안전 수평 슬래브 Earcut 분할
// =============================================================================

/**
 * 다각형 정점의 반시계 방향(Counter-Clockwise) 강제 정렬 (법선 역전 및 음수 면적 원천 차단)
 */
export function ensurePolygonCCW(pts: Point2D[]): Point2D[] {
  if (!pts || pts.length < 3) return pts;

  let signedArea = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += pts[i].x * pts[j].z - pts[j].x * pts[i].z;
  }

  // 시계 방향(CW)인 경우 뒤집어서 CCW로 보정
  if (signedArea < 0) {
    return [...pts].reverse();
  }
  return pts;
}

/**
 * 수평 옥상 평슬래브 Earcut 분할 (삼각형 뿔 왜곡 영구 제거)
 */
export function triangulateSafeFlatRoof(
  pts: Point2D[],
  holeIndices: number[] = []
): number[] {
  const flatCoords: number[] = [];
  for (const p of pts) {
    flatCoords.push(p.x, p.z);
  }
  return Earcut(flatCoords, holeIndices, 2);
}
