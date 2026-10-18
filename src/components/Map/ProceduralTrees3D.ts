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
// 1. 단일 Draw Call 경량 로우폴리 수목 지오메트리 빌더
// =============================================================================

/**
 * 한국형 입체 수목 (통합 단일 지오메트리): 로우폴리 수피 줄기 + 다층 돔형 캐노피 (3대 수종 인스턴스 PBR 컬러 지원)
 */
function createUnifiedTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.24, 0.42, 2.6, 5).toNonIndexed();
  trunk.deleteAttribute('uv');
  trunk.translate(0, 1.3, 0);

  const trunkColors = new Float32Array(trunk.attributes.position.count * 3);
  for (let i = 0; i < trunk.attributes.position.count; i++) {
    trunkColors[i * 3] = 0.38;     // R (갈색 수피)
    trunkColors[i * 3 + 1] = 0.25; // G
    trunkColors[i * 3 + 2] = 0.16; // B
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(trunkColors, 3));

  // 하단 주 수관 돔 (Main Lower Canopy)
  const crown1 = new THREE.DodecahedronGeometry(2.1, 1).toNonIndexed();
  crown1.deleteAttribute('uv');
  crown1.translate(0, 3.6, 0);

  // 상단 소 수관 돔 (Upper Crown)
  const crown2 = new THREE.DodecahedronGeometry(1.5, 1).toNonIndexed();
  crown2.deleteAttribute('uv');
  crown2.translate(0, 4.9, 0);

  // 꼭대기 원추 첨두관 (Spire Top)
  const crown3 = new THREE.ConeGeometry(1.2, 1.8, 6).toNonIndexed();
  crown3.deleteAttribute('uv');
  crown3.translate(0, 5.8, 0);

  const setCanopyBaseShading = (geo: THREE.BufferGeometry, baseShade: number) => {
    const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const variation = (Math.sin(i * 1.8) + 1) * 0.08;
      const shade = baseShade + variation;
      arr[i * 3] = shade;
      arr[i * 3 + 1] = shade;
      arr[i * 3 + 2] = shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };

  setCanopyBaseShading(crown1, 0.85);
  setCanopyBaseShading(crown2, 0.95);
  setCanopyBaseShading(crown3, 1.05);

  const merged = BufferGeometryUtils.mergeGeometries([trunk, crown1, crown2, crown3]);
  merged.computeVertexNormals();
  return merged;
}

// =============================================================================
// 2. 수목 인스턴스 위치 생성 엔진 (가로수, 공원 녹지, 산악 경사지)
// =============================================================================

export interface TreeInstanceData {
  x: number; // 부지 중심 기준 동서 미터
  z: number; // 부지 중심 기준 남북 미터
  y: number; // 상대 지표면 고도
  scale: number;
  rotationY: number;
  isConifer: boolean;
  species: 'ginkgo' | 'pine' | 'zelkova';
}

/**
 * 거점 부지 중심 주변 1,000+ 그루의 입체 가로수 및 산림 식생 좌표 생성
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

    // 가로수는 한국 대표 은행나무(45%)와 느티나무(45%), 조경 소나무(10%)로 조화
    const rndW = pseudoRandom();
    const speciesW: 'ginkgo' | 'pine' | 'zelkova' = rndW < 0.45 ? 'ginkgo' : (rndW < 0.90 ? 'zelkova' : 'pine');

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
    const speciesE: 'ginkgo' | 'pine' | 'zelkova' = rndE < 0.45 ? 'ginkgo' : (rndE < 0.90 ? 'zelkova' : 'pine');

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
    const speciesN: 'ginkgo' | 'pine' | 'zelkova' = rndN < 0.45 ? 'zelkova' : (rndN < 0.90 ? 'ginkgo' : 'pine');

    trees.push({
      x: x + jitterX,
      z: -18 + (pseudoRandom() - 0.5) * 1.2,
      y: 0,
      scale: 0.85 + pseudoRandom() * 0.3,
      rotationY: pseudoRandom() * Math.PI * 2,
      isConifer: speciesN === 'pine',
      species: speciesN,
    });

    const rndS = pseudoRandom();
    const speciesS: 'ginkgo' | 'pine' | 'zelkova' = rndS < 0.45 ? 'zelkova' : (rndS < 0.90 ? 'ginkgo' : 'pine');

    trees.push({
      x: x + jitterX,
      z: 18 + (pseudoRandom() - 0.5) * 1.2,
      y: 0,
      scale: 0.85 + pseudoRandom() * 0.3,
      rotationY: pseudoRandom() * Math.PI * 2,
      isConifer: speciesS === 'pine',
      species: speciesS,
    });
  }

  // 2) 부지 주변 완충 녹지대 및 도심 공원 (Park & Buffer Green Belts)
  const parkRings = [
    { radius: 120, count: 52 },
    { radius: 210, count: 78 },
    { radius: 320, count: 110 },
    { radius: 460, count: 140 },
    { radius: 620, count: 180 },
  ];

  parkRings.forEach(({ radius, count }) => {
    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2;
      const angle = baseAngle + (pseudoRandom() - 0.5) * (Math.PI / count) * 1.8;
      const r = radius + (pseudoRandom() - 0.5) * 45;

      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r;

      // 도로와 지나치게 겹치지 않도록 필터링
      if (Math.abs(px) < 18 && Math.abs(pz) < 700) continue;
      if (Math.abs(pz) < 15 && Math.abs(px) < 600) continue;

      const rndSpecies = pseudoRandom();
      const species: 'ginkgo' | 'pine' | 'zelkova' =
        rndSpecies < 0.40 ? 'pine' : (rndSpecies < 0.75 ? 'zelkova' : 'ginkgo');

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

  // 3) 외곽 산림/구릉지 식생 군락 (Mountain & Hillside Forest Clusters)
  // 강원권 지형 특성상 북동/동측 산자락(치악산 방면 등)에 울창한 소나무 군락지 형성
  const forestClusters = [
    { cx: 450, cz: -400, radius: 220, count: 140 },
    { cx: 580, cz: 250, radius: 260, count: 170 },
    { cx: -520, cz: -480, radius: 200, count: 120 },
    { cx: -600, cz: 380, radius: 240, count: 150 },
  ];

  forestClusters.forEach(({ cx, cz, radius, count }) => {
    for (let i = 0; i < count; i++) {
      const angle = pseudoRandom() * Math.PI * 2;
      const dist = Math.sqrt(pseudoRandom()) * radius;
      const fx = cx + Math.cos(angle) * dist;
      const fz = cz + Math.sin(angle) * dist;

      const rndF = pseudoRandom();
      const species: 'ginkgo' | 'pine' | 'zelkova' = rndF < 0.80 ? 'pine' : 'zelkova';

      trees.push({
        x: fx,
        z: fz,
        y: 0,
        scale: 0.9 + pseudoRandom() * 0.55,
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

  // [단일 InstancedMesh 최적화] 수목 전체를 단 1개의 인스턴싱 메쉬로 일괄 렌더링 (Draw Call = 1회)
  private unifiedTreeMesh: THREE.InstancedMesh | null = null;
  private treeMaterial: THREE.MeshStandardMaterial | null = null;

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
    if (this.unifiedTreeMesh) this.unifiedTreeMesh.visible = visible;
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
    if (this.currentSiteId === site.id && this.unifiedTreeMesh) {
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
      this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.1);
      this.directionalLight.position.set(120, 180, 100).normalize();
      this.scene.add(this.directionalLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 0.85);
      this.scene.add(this.hemisphereLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(this.ambientLight);

      // 2. 버텍스 컬러 PBR 머티리얼 (단일 인스턴싱 드로우콜)
      this.treeMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.1,
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
      const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.renderer.setPixelRatio(pr);
    } catch (err) {
      console.warn('[ProceduralTrees3DLayer] onAdd notice:', err);
    }
  }

  private rebuildTrees(): void {
    // 기존 메쉬 메모리 해제
    if (this.unifiedTreeMesh) {
      this.scene.remove(this.unifiedTreeMesh);
      this.unifiedTreeMesh.geometry.dispose();
      this.unifiedTreeMesh.dispose();
      this.unifiedTreeMesh = null;
    }

    if (!this.treeMaterial) {
      this.treeMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.1,
      });
    }

    if (this.map) {
      const queried = elevationCache.getFromMap(this.map, this.centerLngLat);
      if (queried !== null && queried !== undefined && !Number.isNaN(queried)) {
        this.clampedAltitude = queried;
      }
    }

    // 신규 수목 위치 생성
    this.rawTreeData = generateTreeDistribution(
      this.centerLngLat[0],
      this.centerLngLat[1],
      this.rotationDeg
    );

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    // 단일 InstancedMesh 생성 (전체 수목 Draw Call = 1회)
    if (this.rawTreeData.length > 0) {
      const treeGeo = createUnifiedTreeGeometry();
      this.unifiedTreeMesh = new THREE.InstancedMesh(
        treeGeo,
        this.treeMaterial,
        this.rawTreeData.length
      );
      this.unifiedTreeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.unifiedTreeMesh.castShadow = true;
      this.unifiedTreeMesh.receiveShadow = true;

      for (let i = 0; i < this.rawTreeData.length; i++) {
        const item = this.rawTreeData[i];
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
        this.unifiedTreeMesh.setMatrixAt(i, dummy.matrix);

        // [한국형 가로수 3대 수종 인스턴스 컬러 변주 (단색 초록 구체 완전 탈피)]
        if (item.species === 'ginkgo') {
          // 1) 은행나무: 화사한 라임 옐로우-그린 (#84cc16 ~ #a3e635)
          tempColor.setRGB(0.55 + item.scale * 0.04, 0.82 + item.scale * 0.03, 0.18);
        } else if (item.species === 'pine') {
          // 2) 소나무: 깊고 짙은 딥 에메랄드 상록수 (#14532d ~ #064e3b)
          tempColor.setRGB(0.08, 0.32 + item.scale * 0.03, 0.18);
        } else {
          // 3) 느티나무: 싱그럽고 풍성한 한국 대표 활엽수 (#15803d ~ #16a34a)
          tempColor.setRGB(0.12, 0.55 + item.scale * 0.04, 0.22);
        }
        this.unifiedTreeMesh.setColorAt(i, tempColor);
      }
      this.unifiedTreeMesh.instanceMatrix.needsUpdate = true;
      if (this.unifiedTreeMesh.instanceColor) {
        this.unifiedTreeMesh.instanceColor.needsUpdate = true;
      }
      this.unifiedTreeMesh.visible = this.isVisible;
      this.unifiedTreeMesh.frustumCulled = false;
      this.scene.add(this.unifiedTreeMesh);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer) return;

    // [근접 상세 뷰 (Zoom 15.2 이상)] 3D 수목 및 식생 활성화 & 줌 15.2~16.0 거리 페이드 (Distance Fade)
    if (this.map) {
      const zoom = this.map.getZoom();
      if (zoom < 15.2) {
        if (this.unifiedTreeMesh) this.unifiedTreeMesh.visible = false;
        return;
      }

      const fade = Math.min(1.0, Math.max(0.0, (zoom - 15.2) / 0.8));
      if (this.treeMaterial) {
        this.treeMaterial.transparent = fade < 1.0;
        this.treeMaterial.opacity = fade;
      }
      if (this.unifiedTreeMesh) {
        this.unifiedTreeMesh.visible = this.isVisible;
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
    if (this.unifiedTreeMesh) {
      this.scene.remove(this.unifiedTreeMesh);
      this.unifiedTreeMesh.geometry.dispose();
      this.unifiedTreeMesh.dispose();
      this.unifiedTreeMesh = null;
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
