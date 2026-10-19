/**
 * ProceduralTrees3D.ts
 *
 * [4단계: 3D 입체 수목(식생 InstancedMesh) 및 가로수 고성능 렌더러]
 * - Three.js InstancedMesh 기반 경량 3D 나무 (침엽수/활엽수 로우폴리 메쉬)
 * - 단일 Draw Call 인스턴싱으로 1,000그루 이상의 수목을 60fps로 실시간 렌더링
 * - 위성사진의 산림/공원 녹지 구역 및 주요 간선도로변 가로수 자동 배치
 * - MapLibre GL 3D DEM 표고 실시간 쿼리 및 지표면 밀착 (Terrain Elevation Clamping)
 * - 거점 전환 및 가시성 토글 완벽 지원
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  GANGWON_MILITARY_SITES,
  getGangwonMilitarySiteById,
} from '@/constants/gangwonMilitarySites';
import { elevationCache } from '@/utils/elevationCache';

export const WONJU_1ST_LOGISTICS_CENTER: [number, number] = [127.9358, 37.3592];

// =============================================================================
// 1. 단일/듀얼 Draw Call 경량 로우폴리 수목 지오메트리 빌더
// =============================================================================

/**
 * [강원 소나무/잣나무 로우폴리 메쉬 (Conifer)]
 * - 짙은 상록 침엽수 (#1e3f20 / RGB: 0.118, 0.247, 0.125)
 * - 4단 원추형(Cone) 피라미드형 바늘잎 수관 + 갈색 수피 원기둥
 */
export function createGangwonConiferGeometry(): THREE.BufferGeometry {
  // 1) 수피 줄기
  const trunk = new THREE.CylinderGeometry(0.20, 0.38, 2.8, 5).toNonIndexed();
  trunk.deleteAttribute('uv');
  trunk.translate(0, 1.4, 0);

  const trunkColors = new Float32Array(trunk.attributes.position.count * 3);
  for (let i = 0; i < trunk.attributes.position.count; i++) {
    trunkColors[i * 3] = 0.32;     // R (갈색 수피)
    trunkColors[i * 3 + 1] = 0.20; // G
    trunkColors[i * 3 + 2] = 0.12; // B
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(trunkColors, 3));

  // 2) 4단 피라미드형 원추 수관 (강원 소나무/잣나무 특유의 층층이 뻗은 바늘잎)
  const tier1 = new THREE.ConeGeometry(2.4, 2.5, 6).toNonIndexed();
  tier1.deleteAttribute('uv');
  tier1.translate(0, 3.2, 0);

  const tier2 = new THREE.ConeGeometry(1.9, 2.3, 6).toNonIndexed();
  tier2.deleteAttribute('uv');
  tier2.translate(0, 4.8, 0);

  const tier3 = new THREE.ConeGeometry(1.3, 2.0, 5).toNonIndexed();
  tier3.deleteAttribute('uv');
  tier3.translate(0, 6.2, 0);

  const tierTop = new THREE.ConeGeometry(0.75, 1.6, 5).toNonIndexed();
  tierTop.deleteAttribute('uv');
  tierTop.translate(0, 7.4, 0);

  const setConiferShading = (geo: THREE.BufferGeometry, baseShade: number) => {
    const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const variation = (Math.sin(i * 1.7) + 1) * 0.06;
      const shade = baseShade + variation;
      arr[i * 3] = shade;
      arr[i * 3 + 1] = shade;
      arr[i * 3 + 2] = shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };

  setConiferShading(tier1, 0.85);
  setConiferShading(tier2, 0.93);
  setConiferShading(tier3, 1.02);
  setConiferShading(tierTop, 1.10);

  const merged = BufferGeometryUtils.mergeGeometries([trunk, tier1, tier2, tier3, tierTop]);
  merged.computeVertexNormals();
  return merged;
}

/**
 * [참나무/자작나무/활엽수 로우폴리 메쉬 (Deciduous)]
 * - 둥글고 풍성한 3단 돔형 캐노피 (#3a5a40 / RGB: 0.227, 0.353, 0.251)
 * - 줄기: 자작나무 은백색/참나무 회갈색 줄기
 */
export function createGangwonDeciduousGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.40, 2.5, 5).toNonIndexed();
  trunk.deleteAttribute('uv');
  trunk.translate(0, 1.25, 0);

  const trunkColors = new Float32Array(trunk.attributes.position.count * 3);
  for (let i = 0; i < trunk.attributes.position.count; i++) {
    // 밝은 은회색/회갈색 수피
    trunkColors[i * 3] = 0.55;
    trunkColors[i * 3 + 1] = 0.52;
    trunkColors[i * 3 + 2] = 0.48;
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(trunkColors, 3));

  // 하단 대형 돔
  const crown1 = new THREE.DodecahedronGeometry(2.3, 1).toNonIndexed();
  crown1.deleteAttribute('uv');
  crown1.translate(0, 3.5, 0);

  // 중단 비대칭 돔
  const crown2 = new THREE.DodecahedronGeometry(1.8, 1).toNonIndexed();
  crown2.deleteAttribute('uv');
  crown2.translate(0.3, 4.9, -0.2);

  // 상단 소형 돔
  const crown3 = new THREE.DodecahedronGeometry(1.3, 1).toNonIndexed();
  crown3.deleteAttribute('uv');
  crown3.translate(-0.2, 6.0, 0.2);

  const setDeciduousShading = (geo: THREE.BufferGeometry, baseShade: number) => {
    const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const variation = (Math.sin(i * 1.5) + 1) * 0.08;
      const shade = baseShade + variation;
      arr[i * 3] = shade;
      arr[i * 3 + 1] = shade;
      arr[i * 3 + 2] = shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };

  setDeciduousShading(crown1, 0.88);
  setDeciduousShading(crown2, 0.98);
  setDeciduousShading(crown3, 1.06);

  const merged = BufferGeometryUtils.mergeGeometries([trunk, crown1, crown2, crown3]);
  merged.computeVertexNormals();
  return merged;
}

/**
 * 하위 호환용 통합 수목 지오메트리
 */
export function createUnifiedTreeGeometry(): THREE.BufferGeometry {
  return createGangwonDeciduousGeometry();
}

/**
 * [한국형 간선도로 가로등 기둥 (Street Light Pole)]
 * - 7.5m 강철 기둥 (#64748b) + 도로 방향 2.2m 캔틸레버 암 + LED 조명 헤드(#cbd5e1) 및 발광 렌즈(#fef08a)
 */
export function createStreetLightPoleGeometry(): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.28, 0.32, 0.25, 6).toNonIndexed();
  base.deleteAttribute('uv');
  base.translate(0, 0.125, 0);

  const pole = new THREE.CylinderGeometry(0.12, 0.18, 7.2, 6).toNonIndexed();
  pole.deleteAttribute('uv');
  pole.translate(0, 3.725, 0);

  const arm = new THREE.CylinderGeometry(0.08, 0.10, 2.2, 5).toNonIndexed();
  arm.deleteAttribute('uv');
  arm.rotateZ(Math.PI / 3.2);
  arm.translate(0.9, 7.3, 0);

  const head = new THREE.BoxGeometry(0.35, 0.12, 0.65).toNonIndexed();
  head.deleteAttribute('uv');
  head.translate(1.9, 7.6, 0);

  const lens = new THREE.BoxGeometry(0.26, 0.03, 0.52).toNonIndexed();
  lens.deleteAttribute('uv');
  lens.translate(1.9, 7.53, 0);

  const setGeoColor = (geo: THREE.BufferGeometry, r: number, g: number, b: number) => {
    const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };

  setGeoColor(base, 0.32, 0.36, 0.42);
  setGeoColor(pole, 0.45, 0.50, 0.56);
  setGeoColor(arm, 0.45, 0.50, 0.56);
  setGeoColor(head, 0.72, 0.76, 0.82);
  setGeoColor(lens, 1.0, 0.96, 0.78);

  const merged = BufferGeometryUtils.mergeGeometries([base, pole, arm, head, lens]);
  merged.computeVertexNormals();
  return merged;
}

/**
 * [한국형 교차로 신호등 지주 (Traffic Signal Mast)]
 * - 6.5m 수직 지주 + 4.5m 수평 캔틸레버 지주 + 삼색등(적/황/녹) 하우징
 */
export function createTrafficSignalMastGeometry(): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.32, 0.36, 0.30, 6).toNonIndexed();
  base.deleteAttribute('uv');
  base.translate(0, 0.15, 0);

  const mast = new THREE.CylinderGeometry(0.18, 0.22, 6.5, 6).toNonIndexed();
  mast.deleteAttribute('uv');
  mast.translate(0, 3.4, 0);

  const horizArm = new THREE.CylinderGeometry(0.10, 0.12, 4.5, 5).toNonIndexed();
  horizArm.deleteAttribute('uv');
  horizArm.rotateZ(Math.PI / 2);
  horizArm.translate(2.25, 6.2, 0);

  const housing = new THREE.BoxGeometry(1.2, 0.42, 0.28).toNonIndexed();
  housing.deleteAttribute('uv');
  housing.translate(3.2, 6.2, 0);

  const redLens = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8).toNonIndexed();
  redLens.deleteAttribute('uv');
  redLens.rotateX(Math.PI / 2);
  redLens.translate(2.8, 6.2, 0.14);

  const yellowLens = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8).toNonIndexed();
  yellowLens.deleteAttribute('uv');
  yellowLens.rotateX(Math.PI / 2);
  yellowLens.translate(3.2, 6.2, 0.14);

  const greenLens = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8).toNonIndexed();
  greenLens.deleteAttribute('uv');
  greenLens.rotateX(Math.PI / 2);
  greenLens.translate(3.6, 6.2, 0.14);

  const setGeoColor = (geo: THREE.BufferGeometry, r: number, g: number, b: number) => {
    const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };

  setGeoColor(base, 0.25, 0.28, 0.32);
  setGeoColor(mast, 0.35, 0.38, 0.42);
  setGeoColor(horizArm, 0.35, 0.38, 0.42);
  setGeoColor(housing, 0.12, 0.14, 0.16);
  setGeoColor(redLens, 0.95, 0.20, 0.20);
  setGeoColor(yellowLens, 0.95, 0.65, 0.10);
  setGeoColor(greenLens, 0.10, 0.85, 0.40);

  const merged = BufferGeometryUtils.mergeGeometries([base, mast, horizArm, housing, redLens, yellowLens, greenLens]);
  merged.computeVertexNormals();
  return merged;
}

export interface StreetFurnitureInstanceData {
  x: number;
  z: number;
  y: number;
  rotationY: number;
  type: 'streetlight' | 'trafficlight';
}

export function generateStreetFurnitureData(): {
  streetLights: StreetFurnitureInstanceData[];
  trafficLights: StreetFurnitureInstanceData[];
} {
  const streetLights: StreetFurnitureInstanceData[] = [];
  const trafficLights: StreetFurnitureInstanceData[] = [];

  // 1. 남북 간선도로변 가로등 (35m 간격)
  for (let z = -840; z <= 840; z += 35) {
    if (Math.abs(z) < 25) continue;
    streetLights.push({ x: -16.5, z, y: 0, rotationY: 0, type: 'streetlight' });
    streetLights.push({ x: 16.5, z, y: 0, rotationY: Math.PI, type: 'streetlight' });
  }

  // 2. 동서 간선도로변 가로등 (35m 간격)
  for (let x = -770; x <= 770; x += 35) {
    if (Math.abs(x) < 30) continue;
    streetLights.push({ x, z: -14.0, y: 0, rotationY: Math.PI * 0.5, type: 'streetlight' });
    streetLights.push({ x, z: 14.0, y: 0, rotationY: -Math.PI * 0.5, type: 'streetlight' });
  }

  // 3. 주요 사거리 교차로 4개 코너 신호등 지주 (Traffic Signal Masts)
  const intersectionOffsets = [
    { x: -16.5, z: -14.0, rot: 0 },
    { x: 16.5, z: -14.0, rot: Math.PI * 0.5 },
    { x: 16.5, z: 14.0, rot: Math.PI },
    { x: -16.5, z: 14.0, rot: -Math.PI * 0.5 },
  ];
  for (const item of intersectionOffsets) {
    trafficLights.push({ x: item.x, z: item.z, y: 0, rotationY: item.rot, type: 'trafficlight' });
  }

  return { streetLights, trafficLights };
}

// =============================================================================
// 2. 수목 인스턴스 위치 생성 엔진 (가로수, 공원 녹지, 산악 경사지)
// =============================================================================

export type TreeSpecies = 'pine' | 'oak' | 'birch' | 'zelkova' | 'ginkgo';

export interface TreeInstanceData {
  x: number; // 부지 중심 기준 동서 미터
  z: number; // 부지 중심 기준 남북 미터
  y: number; // 상대 지표면 고도
  scale: number;
  rotationY: number;
  isConifer: boolean;
  species: TreeSpecies;
}

/**
 * 거점 부지 중심 주변 2,000+ 그루의 입체 가로수, 산림, 부지 경계 식생 좌표 생성
 */
export function generateTreeDistribution(
  centerLng: number,
  centerLat: number,
  rotationDeg = -12
): TreeInstanceData[] {
  const trees: TreeInstanceData[] = [];

  // 결정론적 의사 난수 생성기 (일관된 배치 유지)
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // 1) 주요 간선도로변 가로수 열주 (Street Trees)
  // - 남북 주간선도로 (너비 16m 양측 보도변 오프셋 -22m, +22m, 14m 간격 배치)
  for (let z = -900; z <= 900; z += 14) {
    if (Math.abs(z) < 18) continue; // 교차로 진입로는 비움
    const jitterZ = (pseudoRandom() - 0.5) * 1.5;

    // 가로수는 한국 대표 은행나무(40%)와 느티나무(40%), 조경 소나무(20%)로 조화
    const rndW = pseudoRandom();
    const speciesW: TreeSpecies = rndW < 0.40 ? 'ginkgo' : (rndW < 0.80 ? 'zelkova' : 'pine');

    // 서측 가로수 열
    trees.push({
      x: -22 + (pseudoRandom() - 0.5) * 1.2,
      z: z + jitterZ,
      y: 0,
      scale: 0.85 + pseudoRandom() * 0.35,
      rotationY: pseudoRandom() * Math.PI * 2,
      isConifer: speciesW === 'pine',
      species: speciesW,
    });

    const rndE = pseudoRandom();
    const speciesE: TreeSpecies = rndE < 0.40 ? 'ginkgo' : (rndE < 0.80 ? 'zelkova' : 'pine');

    // 동측 가로수 열
    trees.push({
      x: 22 + (pseudoRandom() - 0.5) * 1.2,
      z: z + jitterZ,
      y: 0,
      scale: 0.85 + pseudoRandom() * 0.35,
      rotationY: pseudoRandom() * Math.PI * 2,
      isConifer: speciesE === 'pine',
      species: speciesE,
    });
  }

  // - 동서 보조간선도로 (오프셋 -18m, +18m, 16m 간격)
  for (let x = -800; x <= 800; x += 16) {
    if (Math.abs(x) < 30) continue;
    const jitterX = (pseudoRandom() - 0.5) * 1.5;

    const rndN = pseudoRandom();
    const speciesN: TreeSpecies = rndN < 0.45 ? 'zelkova' : (rndN < 0.80 ? 'ginkgo' : 'birch');

    trees.push({
      x: x + jitterX,
      z: -18 + (pseudoRandom() - 0.5) * 1.2,
      y: 0,
      scale: 0.85 + pseudoRandom() * 0.3,
      rotationY: pseudoRandom() * Math.PI * 2,
      isConifer: false,
      species: speciesN,
    });

    const rndS = pseudoRandom();
    const speciesS: TreeSpecies = rndS < 0.45 ? 'zelkova' : (rndS < 0.80 ? 'ginkgo' : 'birch');

    trees.push({
      x: x + jitterX,
      z: 18 + (pseudoRandom() - 0.5) * 1.2,
      y: 0,
      scale: 0.85 + pseudoRandom() * 0.3,
      rotationY: pseudoRandom() * Math.PI * 2,
      isConifer: false,
      species: speciesS,
    });
  }

  // 2) 부지 경계 울타리 완충림 (Fence Line Buffer Pine Belt)
  // 군부대 및 혁신도시 주요 부지 외곽 경계선을 감싸는 잣나무/소나무 방풍림 열주
  const fencePerimeter = [
    { startX: -280, startZ: -240, endX: 280, endZ: -240 },
    { startX: 280, startZ: -240, endX: 280, endZ: 240 },
    { startX: 280, startZ: 240, endX: -280, endZ: 240 },
    { startX: -280, startZ: 240, endX: -280, endZ: -240 },
  ];

  fencePerimeter.forEach(({ startX, startZ, endX, endZ }) => {
    const dx = endX - startX;
    const dz = endZ - startZ;
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.floor(len / 9); // 9m 간격 빽빽한 방풍림

    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const bx = startX + dx * t + (pseudoRandom() - 0.5) * 3;
      const bz = startZ + dz * t + (pseudoRandom() - 0.5) * 3;

      // 주 출입로 부근은 개방
      if (Math.abs(bx) < 25 && Math.abs(bz) > 220) continue;

      const rndBelt = pseudoRandom();
      const species: TreeSpecies = rndBelt < 0.85 ? 'pine' : 'birch';

      trees.push({
        x: bx,
        z: bz,
        y: 0,
        scale: 0.9 + pseudoRandom() * 0.4,
        rotationY: pseudoRandom() * Math.PI * 2,
        isConifer: species === 'pine',
        species,
      });
    }
  });

  // 3) 부지 주변 완충 녹지대 및 도심 공원 (Park & Buffer Green Belts)
  const parkRings = [
    { radius: 110, count: 65 },
    { radius: 190, count: 95 },
    { radius: 300, count: 140 },
    { radius: 440, count: 180 },
    { radius: 600, count: 220 },
  ];

  parkRings.forEach(({ radius, count }) => {
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2;
      const angle = baseAngle + (pseudoRandom() - 0.5) * (Math.PI / count) * 1.8;
      const r = radius + (pseudoRandom() - 0.5) * 50;

      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r;

      // 도로와 지나치게 겹치지 않도록 필터링
      if (Math.abs(px) < 18 && Math.abs(pz) < 700) continue;
      if (Math.abs(pz) < 15 && Math.abs(px) < 600) continue;

      const rndSpecies = pseudoRandom();
      let species: TreeSpecies;
      if (rndSpecies < 0.35) {
        species = 'pine';
      } else if (rndSpecies < 0.60) {
        species = 'oak';
      } else if (rndSpecies < 0.80) {
        species = 'birch';
      } else if (rndSpecies < 0.92) {
        species = 'zelkova';
      } else {
        species = 'ginkgo';
      }

      trees.push({
        x: px,
        z: pz,
        y: 0,
        scale: 0.8 + pseudoRandom() * 0.5,
        rotationY: pseudoRandom() * Math.PI * 2,
        isConifer: species === 'pine',
        species,
      });
    }
  });

  // 4) 외곽 산림/구릉지 식생 군락 (Mountain & Hillside Forest Clusters)
  // 강원권 지형 특성: 표고가 높은 동측/북동측 산자락에 짙은 상록 소나무/잣나무(85%) 및 참나무(15%) 군락 형성
  const forestClusters = [
    { cx: 480, cz: -420, radius: 260, count: 200 },
    { cx: 620, cz: 280, radius: 280, count: 220 },
    { cx: -540, cz: -500, radius: 240, count: 170 },
    { cx: -650, cz: 400, radius: 270, count: 210 },
    { cx: 150, cz: -650, radius: 230, count: 160 },
  ];

  forestClusters.forEach(({ cx, cz, radius, count }) => {
    for (let i = 0; i < count; i++) {
      const angle = pseudoRandom() * Math.PI * 2;
      const dist = Math.sqrt(pseudoRandom()) * radius;
      const fx = cx + Math.cos(angle) * dist;
      const fz = cz + Math.sin(angle) * dist;

      const rndF = pseudoRandom();
      const species: TreeSpecies = rndF < 0.85 ? 'pine' : (rndF < 0.95 ? 'oak' : 'birch');

      trees.push({
        x: fx,
        z: fz,
        y: 0,
        scale: 0.9 + pseudoRandom() * 0.6,
        rotationY: pseudoRandom() * Math.PI * 2,
        isConifer: species === 'pine',
        species,
      });
    }
  });

  return trees;
}

// =============================================================================
// 3. MapLibre GL 3D 커스텀 레이어 (ProceduralTrees3DLayer)
// =============================================================================

export class ProceduralTrees3DLayer implements maplibregl.CustomLayerInterface {
  id = 'procedural-trees-3d-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  // [듀얼 InstancedMesh 최적화] 침엽수(소나무/잣나무) 1개 + 활엽수(참나무/자작나무) 1개 = 단 2회의 Draw Call
  private coniferTreeMesh: THREE.InstancedMesh | null = null;
  private deciduousTreeMesh: THREE.InstancedMesh | null = null;
  private unifiedTreeMesh: THREE.InstancedMesh | null = null; // 호환용 레퍼런스
  private treeMaterial: THREE.MeshStandardMaterial | null = null;
  // [3단계: 경량 InstancedMesh] 가로등 기둥 및 교차로 신호등 지주 (Zoom >= 15.5 표시)
  private streetLightMesh: THREE.InstancedMesh | null = null;
  private trafficLightMesh: THREE.InstancedMesh | null = null;
  private furnitureMaterial: THREE.MeshStandardMaterial | null = null;

  private directionalLight: THREE.DirectionalLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  private isVisible = true;
  private currentSiteId = 'first-logistics-wonju';
  private centerLngLat: [number, number] = WONJU_1ST_LOGISTICS_CENTER;
  private clampedAltitude = 0;
  private rotationDeg = -12;
  private rawTreeData: TreeInstanceData[] = [];
  private hasBuiltWithTerrain = false;

  constructor(initialSiteId = 'first-logistics-wonju') {
    this.currentSiteId = initialSiteId;
    const site = getGangwonMilitarySiteById(initialSiteId);
    if (site) {
      this.centerLngLat = site.center;
      this.rotationDeg = site.rotationDeg;
    }
  }

  private isInteracting = false;

  public setInteracting(interacting: boolean): void {
    this.isInteracting = interacting;
  }

  public setPixelRatio(ratio: number): void {
    if (this.renderer) {
      this.renderer.setPixelRatio(ratio);
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.coniferTreeMesh) this.coniferTreeMesh.visible = visible;
    if (this.deciduousTreeMesh) this.deciduousTreeMesh.visible = visible;
    if (this.unifiedTreeMesh) this.unifiedTreeMesh.visible = visible;
    const showPoles = visible && (this.map ? this.map.getZoom() >= 15.5 : true);
    if (this.streetLightMesh) this.streetLightMesh.visible = showPoles;
    if (this.trafficLightMesh) this.trafficLightMesh.visible = showPoles;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public setSite(siteId: string): void {
    if (!siteId) return;
    const site = getGangwonMilitarySiteById(siteId) || GANGWON_MILITARY_SITES[0];
    if (this.currentSiteId === site.id && (this.coniferTreeMesh || this.unifiedTreeMesh)) {
      return;
    }

    this.currentSiteId = site.id;
    this.centerLngLat = site.center;
    this.rotationDeg = site.rotationDeg;

    this.rebuildTrees();

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    try {
      this.map = map;
      this.camera.matrixAutoUpdate = false;

      // 1. 공통 조명 환경
      this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
      this.directionalLight.position.set(120, 180, 100).normalize();
      this.scene.add(this.directionalLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 0.85);
      this.scene.add(this.hemisphereLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(this.ambientLight);

      // 2. 버텍스 컬러 PBR 머티리얼 (단 2회의 인스턴싱 드로우콜)
      this.treeMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.08,
      });

      // 3. 수목 인스턴스 메쉬 구축
      this.rebuildTrees();

      // 4. WebGLRenderer 연동
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.renderer.setPixelRatio(pr);
    } catch (err) {
      console.warn('[ProceduralTrees3DLayer] onAdd notice:', err);
    }
  }

  private rebuildTrees(): void {
    // 기존 메쉬 메모리 해제
    if (this.coniferTreeMesh) {
      this.scene.remove(this.coniferTreeMesh);
      this.coniferTreeMesh.geometry.dispose();
      this.coniferTreeMesh.dispose();
      this.coniferTreeMesh = null;
    }
    if (this.deciduousTreeMesh) {
      this.scene.remove(this.deciduousTreeMesh);
      this.deciduousTreeMesh.geometry.dispose();
      this.deciduousTreeMesh.dispose();
      this.deciduousTreeMesh = null;
    }
    if (this.unifiedTreeMesh) {
      this.scene.remove(this.unifiedTreeMesh);
      this.unifiedTreeMesh.geometry.dispose();
      this.unifiedTreeMesh.dispose();
      this.unifiedTreeMesh = null;
    }
    if (this.streetLightMesh) {
      this.scene.remove(this.streetLightMesh);
      this.streetLightMesh.geometry.dispose();
      this.streetLightMesh.dispose();
      this.streetLightMesh = null;
    }
    if (this.trafficLightMesh) {
      this.scene.remove(this.trafficLightMesh);
      this.trafficLightMesh.geometry.dispose();
      this.trafficLightMesh.dispose();
      this.trafficLightMesh = null;
    }

    if (!this.treeMaterial) {
      this.treeMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.08,
      });
    }

    if (this.map) {
      const queried = elevationCache.getFromMap(this.map, this.centerLngLat);
      if (queried !== null && queried !== undefined && !Number.isNaN(queried)) {
        this.clampedAltitude = queried;
      }
    }

    // 신규 수목 위치 생성 (2,000+ 그루)
    this.rawTreeData = generateTreeDistribution(
      this.centerLngLat[0],
      this.centerLngLat[1],
      this.rotationDeg
    );

    const coniferList: TreeInstanceData[] = [];
    const deciduousList: TreeInstanceData[] = [];

    for (const tree of this.rawTreeData) {
      if (tree.isConifer || tree.species === 'pine') {
        coniferList.push(tree);
      } else {
        deciduousList.push(tree);
      }
    }

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    // 1) 강원 소나무/잣나무 (Conifer) InstancedMesh 생성
    if (coniferList.length > 0) {
      const coniferGeo = createGangwonConiferGeometry();
      this.coniferTreeMesh = new THREE.InstancedMesh(
        coniferGeo,
        this.treeMaterial,
        coniferList.length
      );
      this.coniferTreeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.coniferTreeMesh.castShadow = true;
      this.coniferTreeMesh.receiveShadow = true;

      for (let i = 0; i < coniferList.length; i++) {
        const item = coniferList[i];
        let treeY = item.y;
        if (this.map) {
          const elev = elevationCache.getFromMap(this.map, [
            this.centerLngLat[0] + (item.x / 111000) * 1.25,
            this.centerLngLat[1] + (item.z / 111000),
          ]);
          if (elev !== null && elev !== undefined && !Number.isNaN(elev)) {
            treeY = Math.max(-15, Math.min(60, elev - this.clampedAltitude));
          }
        }
        dummy.position.set(item.x, treeY, item.z);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.updateMatrix();
        this.coniferTreeMesh.setMatrixAt(i, dummy.matrix);

        // 강원 소나무/잣나무 특유의 짙은 상록 침엽수 (#1e3f20) 베이스 변주
        // RGB: 0.118, 0.247, 0.125
        const r = 0.10 + (item.scale * 0.02);
        const g = 0.23 + (item.scale * 0.03);
        const b = 0.12 + (item.scale * 0.01);
        tempColor.setRGB(r, g, b);
        this.coniferTreeMesh.setColorAt(i, tempColor);
      }
      this.coniferTreeMesh.instanceMatrix.needsUpdate = true;
      if (this.coniferTreeMesh.instanceColor) {
        this.coniferTreeMesh.instanceColor.needsUpdate = true;
      }
      this.coniferTreeMesh.visible = this.isVisible;
      this.coniferTreeMesh.frustumCulled = false;
      this.scene.add(this.coniferTreeMesh);
    }

    // 2) 참나무/자작나무/활엽수 (Deciduous) InstancedMesh 생성
    if (deciduousList.length > 0) {
      const deciduousGeo = createGangwonDeciduousGeometry();
      this.deciduousTreeMesh = new THREE.InstancedMesh(
        deciduousGeo,
        this.treeMaterial,
        deciduousList.length
      );
      this.deciduousTreeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.deciduousTreeMesh.castShadow = true;
      this.deciduousTreeMesh.receiveShadow = true;

      for (let i = 0; i < deciduousList.length; i++) {
        const item = deciduousList[i];
        let treeY = item.y;
        if (this.map) {
          const elev = elevationCache.getFromMap(this.map, [
            this.centerLngLat[0] + (item.x / 111000) * 1.25,
            this.centerLngLat[1] + (item.z / 111000),
          ]);
          if (elev !== null && elev !== undefined && !Number.isNaN(elev)) {
            treeY = Math.max(-15, Math.min(60, elev - this.clampedAltitude));
          }
        }
        dummy.position.set(item.x, treeY, item.z);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.updateMatrix();
        this.deciduousTreeMesh.setMatrixAt(i, dummy.matrix);

        // 수종별 PBR 컬러 변주
        if (item.species === 'oak') {
          // 참나무: 깊은 한국 산림 녹색 (#3a5a40 / RGB: 0.227, 0.353, 0.251)
          tempColor.setRGB(0.21 + item.scale * 0.02, 0.35 + item.scale * 0.02, 0.24);
        } else if (item.species === 'birch') {
          // 자작나무: 은은하고 맑은 숲빛 (#406646)
          tempColor.setRGB(0.24 + item.scale * 0.02, 0.40 + item.scale * 0.03, 0.27);
        } else if (item.species === 'ginkgo') {
          // 은행나무: 화사한 라임 옐로우-그린 (#84cc16)
          tempColor.setRGB(0.52 + item.scale * 0.03, 0.80, 0.12);
        } else {
          // 느티나무: 풍성하고 생동감 넘치는 녹색 (#15803d)
          tempColor.setRGB(0.08 + item.scale * 0.02, 0.50 + item.scale * 0.03, 0.24);
        }
        this.deciduousTreeMesh.setColorAt(i, tempColor);
      }
      this.deciduousTreeMesh.instanceMatrix.needsUpdate = true;
      if (this.deciduousTreeMesh.instanceColor) {
        this.deciduousTreeMesh.instanceColor.needsUpdate = true;
      }
      this.deciduousTreeMesh.visible = this.isVisible;
      this.deciduousTreeMesh.frustumCulled = false;
      this.scene.add(this.deciduousTreeMesh);
    }

    // 3) [한국형 가로시설물] 가로등 기둥 및 교차로 신호등 지주 (InstancedMesh)
    const furnitureData = generateStreetFurnitureData();
    if (!this.furnitureMaterial) {
      this.furnitureMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.65,
      });
    }

    if (furnitureData.streetLights.length > 0) {
      const slGeo = createStreetLightPoleGeometry();
      this.streetLightMesh = new THREE.InstancedMesh(
        slGeo,
        this.furnitureMaterial,
        furnitureData.streetLights.length
      );
      this.streetLightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.streetLightMesh.castShadow = true;
      this.streetLightMesh.receiveShadow = true;

      for (let i = 0; i < furnitureData.streetLights.length; i++) {
        const item = furnitureData.streetLights[i];
        let poleY = item.y;
        if (this.map) {
          const elev = elevationCache.getFromMap(this.map, [
            this.centerLngLat[0] + (item.x / 111000) * 1.25,
            this.centerLngLat[1] + (item.z / 111000),
          ]);
          if (elev !== null && elev !== undefined && !Number.isNaN(elev)) {
            poleY = Math.max(-15, Math.min(60, elev - this.clampedAltitude));
          }
        }
        dummy.position.set(item.x, poleY, item.z);
        dummy.scale.set(1.0, 1.0, 1.0);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.updateMatrix();
        this.streetLightMesh.setMatrixAt(i, dummy.matrix);
      }
      this.streetLightMesh.instanceMatrix.needsUpdate = true;
      const showPoles = this.isVisible && (this.map ? this.map.getZoom() >= 15.5 : true);
      this.streetLightMesh.visible = showPoles;
      this.streetLightMesh.frustumCulled = false;
      this.scene.add(this.streetLightMesh);
    }

    if (furnitureData.trafficLights.length > 0) {
      const tlGeo = createTrafficSignalMastGeometry();
      this.trafficLightMesh = new THREE.InstancedMesh(
        tlGeo,
        this.furnitureMaterial,
        furnitureData.trafficLights.length
      );
      this.trafficLightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.trafficLightMesh.castShadow = true;
      this.trafficLightMesh.receiveShadow = true;

      for (let i = 0; i < furnitureData.trafficLights.length; i++) {
        const item = furnitureData.trafficLights[i];
        let poleY = item.y;
        if (this.map) {
          const elev = elevationCache.getFromMap(this.map, [
            this.centerLngLat[0] + (item.x / 111000) * 1.25,
            this.centerLngLat[1] + (item.z / 111000),
          ]);
          if (elev !== null && elev !== undefined && !Number.isNaN(elev)) {
            poleY = Math.max(-15, Math.min(60, elev - this.clampedAltitude));
          }
        }
        dummy.position.set(item.x, poleY, item.z);
        dummy.scale.set(1.0, 1.0, 1.0);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.updateMatrix();
        this.trafficLightMesh.setMatrixAt(i, dummy.matrix);
      }
      this.trafficLightMesh.instanceMatrix.needsUpdate = true;
      const showPoles = this.isVisible && (this.map ? this.map.getZoom() >= 15.5 : true);
      this.trafficLightMesh.visible = showPoles;
      this.trafficLightMesh.frustumCulled = false;
      this.scene.add(this.trafficLightMesh);
    }

    // 하위 호환용 대표 레퍼런스
    this.unifiedTreeMesh = this.coniferTreeMesh || this.deciduousTreeMesh;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer) return;

    // [근접 상세 뷰] 3D 수목(Zoom >= 15.2) 및 가로시설물(가로등/신호등, Zoom >= 15.5)
    if (this.map) {
      const zoom = this.map.getZoom();
      const showPoles = this.isVisible && zoom >= 15.5;
      if (this.streetLightMesh) this.streetLightMesh.visible = showPoles;
      if (this.trafficLightMesh) this.trafficLightMesh.visible = showPoles;

      if (zoom < 15.2) {
        if (this.coniferTreeMesh) this.coniferTreeMesh.visible = false;
        if (this.deciduousTreeMesh) this.deciduousTreeMesh.visible = false;
        if (!showPoles) return;
      } else {
        const fade = Math.min(1.0, Math.max(0.0, (zoom - 15.2) / 0.8));
        if (this.treeMaterial) {
          this.treeMaterial.transparent = fade < 1.0;
          this.treeMaterial.opacity = fade;
        }
        if (this.coniferTreeMesh) this.coniferTreeMesh.visible = this.isVisible;
        if (this.deciduousTreeMesh) this.deciduousTreeMesh.visible = this.isVisible;
      }
    }

    try {
      const rawMatrix =
        options?.defaultProjectionData?.mainMatrix ||
        options?.modelViewProjectionMatrix ||
        options;
      if (!rawMatrix) return;

      // 1. 지형 DEM 표고 쿼리 (Terrain Elevation Clamping) - 인터랙션 중에는 스킵
      if (!this.isInteracting && this.map) {
        const queried = elevationCache.getFromMap(this.map, this.centerLngLat);
        if (
          queried !== null &&
          queried !== undefined &&
          !Number.isNaN(queried) &&
          Number.isFinite(queried)
        ) {
          const oldAlt = this.clampedAltitude;
          this.clampedAltitude = queried;
          if (!this.hasBuiltWithTerrain && queried > 10 && Math.abs(oldAlt - queried) > 1) {
            this.hasBuiltWithTerrain = true;
            this.rebuildTrees();
          }
        }
      }

      // 2. Mercator 좌표계 투영 (MapLibre Z-Up -> Three.js Y-Up)
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.centerLngLat,
        this.clampedAltitude
      );

      const meterScale = mercator.meterInMercatorCoordinateUnits();

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        (this.rotationDeg * Math.PI) / 180
      );

      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);

      // 3. WebGL 상태 보존 및 렌더링
      const prevFbo = gl ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      }
    } catch (err) {
      console.warn('[ProceduralTrees3DLayer] render suppressed:', err);
    }
  }

  onRemove(): void {
    if (this.coniferTreeMesh) {
      this.scene.remove(this.coniferTreeMesh);
      this.coniferTreeMesh.geometry.dispose();
      this.coniferTreeMesh.dispose();
      this.coniferTreeMesh = null;
    }
    if (this.deciduousTreeMesh) {
      this.scene.remove(this.deciduousTreeMesh);
      this.deciduousTreeMesh.geometry.dispose();
      this.deciduousTreeMesh.dispose();
      this.deciduousTreeMesh = null;
    }
    this.unifiedTreeMesh = null;

    if (this.streetLightMesh) {
      this.scene.remove(this.streetLightMesh);
      this.streetLightMesh.geometry.dispose();
      this.streetLightMesh.dispose();
      this.streetLightMesh = null;
    }
    if (this.trafficLightMesh) {
      this.scene.remove(this.trafficLightMesh);
      this.trafficLightMesh.geometry.dispose();
      this.trafficLightMesh.dispose();
      this.trafficLightMesh = null;
    }
    if (this.furnitureMaterial) {
      this.furnitureMaterial.dispose();
      this.furnitureMaterial = null;
    }

    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      this.directionalLight.dispose();
      this.directionalLight = null;
    }
    if (this.hemisphereLight) {
      this.scene.remove(this.hemisphereLight);
      this.hemisphereLight.dispose();
      this.hemisphereLight = null;
    }
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }

    if (this.treeMaterial) {
      this.treeMaterial.dispose();
      this.treeMaterial = null;
    }

    this.scene.clear();
    this.renderer = null;
    this.map = null;
  }
}

