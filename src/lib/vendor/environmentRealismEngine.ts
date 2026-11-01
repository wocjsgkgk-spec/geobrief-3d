/**
 * lib/vendor/environmentRealismEngine.ts
 *
 * [GeoBrief 3D 3단계: GitHub 오픈소스 3종(Streets-GL, OSMBuildings, Three-Geo) 환경 렌더링 벤더링 모듈]
 *
 * 1. [Streets-GL 벤더링] 단지 조경 및 가로수·공원 3D 식생 Instanced 렌더링
 *    - THREE.InstancedMesh 기반 단일 Draw Call 수목 렌더링
 *    - 브이월드 4대 레퍼런스(image_7c6d3f ~ image_7c1b61) 1:1 매칭 짙은 녹색/올리브 그린 톤(#2d4c3b, #3a5a40)
 *    - 공원(단관공원, 캠프 롱 등), 아파트 단지 내 조경 녹지, 주요 간선도로변 가로수 열주 자동 배치
 *
 * 2. [OSMBuildings & Three-Geo 벤더링] 하천·호수 수변 환경 & 둔치 정합
 *    - 원주천·섬강 등 수계에 인위적인 파란색 띠 대신 깊은 다크 에메랄드/틸 수면(#1b4332 ~ #0f2942) 적용
 *    - 실제 도로 선형을 따르는 콘크리트 상판(#cbd5e1), 방호벽 난간(#94a3b8), 30m 간격 하부 교각(Pier) 자동 정합
 *
 * 3. [Streets-GL 도로 정밀화] 노란색 고속도로/간선도로 과장된 줄무늬 교정
 *    - 바닥 항공위성 사진의 실제 아스팔트와 교차로 차선이 자연스럽게 드러나도록 1px, 투명도 0.65 슬림 규격화
 *
 * 4. [SunCalc & PBR 셰이더] 실시간 태양광 그림자 & 접지 음영(Contact AO) & 원경 대기 안개(Fog)
 *    - 건물 밑동 0~4m 부드러운 접지 암부(AO)로 건물이 지면에 칼같이 안착
 *    - 치악산 등 원경 산악 능선의 은은한 대기 원근감(FogExp2, #cbd5e1, 0.00018) 결합
 */

import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import {
  createGangwonConiferGeometry,
  createGangwonDeciduousGeometry,
  generateTreeDistribution,
  TreeInstanceData,
} from '@/components/Map/ProceduralTrees3D';
import {
  WONJU_AUTHENTIC_BRIDGES,
  buildAuthenticBridgeMeshGroup,
} from '@/utils/authenticBridgeBuilder';
import {
  VWORLD_AUTHENTIC_WATER,
  computeContactAoFactor,
  computeSolarAtmosphere,
  applyAtmosphericPerspectiveFog,
} from '@/lib/vendor/openSource3DEnhancer';
import { elevationCache } from '@/utils/elevationCache';

export interface EnvironmentRealismOptions {
  enableTrees?: boolean;
  treeColorTone?: 'olive' | 'emerald' | 'deepGreen';
  enableWaterStyling?: boolean;
  enableFog?: boolean;
  fogColor?: string;
  fogDensity?: number;
}

export class EnvironmentRealismEngine {
  private map: maplibregl.Map | null = null;
  private scene: THREE.Scene | null = null;
  private coniferMesh: THREE.InstancedMesh | null = null;
  private deciduousMesh: THREE.InstancedMesh | null = null;
  private bridgeMasterGroup: THREE.Group | null = null;
  private options: Required<EnvironmentRealismOptions>;

  constructor(options: EnvironmentRealismOptions = {}) {
    this.options = {
      enableTrees: options.enableTrees !== undefined ? options.enableTrees : true,
      treeColorTone: options.treeColorTone || 'deepGreen',
      enableWaterStyling: options.enableWaterStyling !== undefined ? options.enableWaterStyling : true,
      enableFog: options.enableFog !== undefined ? options.enableFog : true,
      fogColor: options.fogColor || '#cbd5e1',
      fogDensity: options.fogDensity || 0.00018,
    };
  }

  /**
   * Three.js 씬 및 MapLibre 맵 인스턴스에 환경 실사화 엔진 바인딩
   */
  public attach(map: maplibregl.Map, scene: THREE.Scene): void {
    this.map = map;
    this.scene = scene;

    if (this.options.enableFog) {
      applyAtmosphericPerspectiveFog(this.scene, this.options.fogColor, this.options.fogDensity);
    }
  }

  /**
   * 1. [Streets-GL 벤더링] 단지 조경 및 가로수·공원 3D 식생 InstancedMesh 빌드
   */
  public buildVegetation(
    centerLngLat: [number, number],
    originLngLat: [number, number] = centerLngLat
  ): { conifer: THREE.InstancedMesh | null; deciduous: THREE.InstancedMesh | null } {
    if (!this.scene) return { conifer: null, deciduous: null };

    // 이전 메쉬 해제
    this.disposeVegetation();

    if (!this.options.enableTrees) return { conifer: null, deciduous: null };

    const rawTrees: TreeInstanceData[] = generateTreeDistribution(centerLngLat[0], centerLngLat[1]);
    const coniferList: TreeInstanceData[] = [];
    const deciduousList: TreeInstanceData[] = [];

    for (const tree of rawTrees) {
      if (tree.isConifer || tree.species === 'pine') {
        coniferList.push(tree);
      } else {
        deciduousList.push(tree);
      }
    }

    const treeMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    // (A) 소나무/잣나무 (Conifer) - 브이월드 레퍼런스 실사 올리브-다크그린 (#2d4c3b)
    if (coniferList.length > 0) {
      const coniferGeo = createGangwonConiferGeometry();
      this.coniferMesh = new THREE.InstancedMesh(coniferGeo, treeMaterial, coniferList.length);
      this.coniferMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.coniferMesh.castShadow = true;
      this.coniferMesh.receiveShadow = true;

      for (let i = 0; i < coniferList.length; i++) {
        const item = coniferList[i];
        let elev = 0;
        if (this.map) {
          const q = elevationCache.getFromMap(this.map, [
            centerLngLat[0] + (item.x / 111000) * 1.25,
            centerLngLat[1] + (item.z / 111000),
          ]);
          if (typeof q === 'number' && Number.isFinite(q)) elev = q;
        }

        dummy.position.set(item.x, elev, item.z);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.updateMatrix();
        this.coniferMesh.setMatrixAt(i, dummy.matrix);

        // #2d4c3b 베이스 (R: 0.176, G: 0.298, B: 0.231)
        tempColor.setRGB(0.16 + item.scale * 0.02, 0.28 + item.scale * 0.03, 0.21 + item.scale * 0.02);
        this.coniferMesh.setColorAt(i, tempColor);
      }

      this.coniferMesh.instanceMatrix.needsUpdate = true;
      if (this.coniferMesh.instanceColor) this.coniferMesh.instanceColor.needsUpdate = true;
      this.coniferMesh.frustumCulled = false;
      this.scene.add(this.coniferMesh);
    }

    // (B) 활엽수/참나무/느티나무 (Deciduous) - 짙은 올리브 그린 (#3a5a40)
    if (deciduousList.length > 0) {
      const deciduousGeo = createGangwonDeciduousGeometry();
      this.deciduousMesh = new THREE.InstancedMesh(deciduousGeo, treeMaterial, deciduousList.length);
      this.deciduousMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.deciduousMesh.castShadow = true;
      this.deciduousMesh.receiveShadow = true;

      for (let i = 0; i < deciduousList.length; i++) {
        const item = deciduousList[i];
        let elev = 0;
        if (this.map) {
          const q = elevationCache.getFromMap(this.map, [
            centerLngLat[0] + (item.x / 111000) * 1.25,
            centerLngLat[1] + (item.z / 111000),
          ]);
          if (typeof q === 'number' && Number.isFinite(q)) elev = q;
        }

        dummy.position.set(item.x, elev, item.z);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.updateMatrix();
        this.deciduousMesh.setMatrixAt(i, dummy.matrix);

        // #3a5a40 베이스 (R: 0.227, G: 0.353, B: 0.251)
        tempColor.setRGB(0.20 + item.scale * 0.03, 0.33 + item.scale * 0.03, 0.23 + item.scale * 0.02);
        this.deciduousMesh.setColorAt(i, tempColor);
      }

      this.deciduousMesh.instanceMatrix.needsUpdate = true;
      if (this.deciduousMesh.instanceColor) this.deciduousMesh.instanceColor.needsUpdate = true;
      this.deciduousMesh.frustumCulled = false;
      this.scene.add(this.deciduousMesh);
    }

    return { conifer: this.coniferMesh, deciduous: this.deciduousMesh };
  }

  /**
   * 2. [OSMBuildings & Three-Geo 벤더링] 하천 횡단 대교(원주교, 개운교, 봉평교) 3D 입체 결합
   */
  public buildAuthenticBridges(
    originLngLat: [number, number],
    getTerrainElev: (p: [number, number]) => number = () => 0
  ): THREE.Group | null {
    if (!this.scene) return null;

    if (this.bridgeMasterGroup) {
      this.scene.remove(this.bridgeMasterGroup);
      this.bridgeMasterGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
      this.bridgeMasterGroup = null;
    }

    this.bridgeMasterGroup = buildAuthenticBridgeMeshGroup(
      WONJU_AUTHENTIC_BRIDGES,
      originLngLat,
      getTerrainElev
    );

    this.scene.add(this.bridgeMasterGroup);
    return this.bridgeMasterGroup;
  }

  /**
   * 3. [Streets-GL 벤더링] 건물 접지 암부(Contact AO) 계수 산출 유틸리티
   */
  public getContactAo(heightAboveGround: number): number {
    return computeContactAoFactor(heightAboveGround, 4.0);
  }

  /**
   * 4. [SunCalc 벤더링] 실시간 천문 태양광 및 대기 원근감 갱신
   */
  public updateSunAndFog(date: Date, lat: number, lng: number): void {
    if (!this.scene) return;
    const result = computeSolarAtmosphere(date, lat, lng);
    applyAtmosphericPerspectiveFog(this.scene, result.fogColor, result.fogDensity);
  }

  /**
   * 식생 가시성 토글
   */
  public setVegetationVisible(visible: boolean): void {
    this.options.enableTrees = visible;
    if (this.coniferMesh) this.coniferMesh.visible = visible;
    if (this.deciduousMesh) this.deciduousMesh.visible = visible;
  }

  /**
   * 교량 가시성 토글
   */
  public setBridgesVisible(visible: boolean): void {
    if (this.bridgeMasterGroup) this.bridgeMasterGroup.visible = visible;
  }

  /**
   * 메모리 안전 해제
   */
  public dispose(): void {
    this.disposeVegetation();
    if (this.bridgeMasterGroup && this.scene) {
      this.scene.remove(this.bridgeMasterGroup);
      this.bridgeMasterGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
      this.bridgeMasterGroup = null;
    }
    this.map = null;
    this.scene = null;
  }

  private disposeVegetation(): void {
    if (!this.scene) return;
    if (this.coniferMesh) {
      this.scene.remove(this.coniferMesh);
      this.coniferMesh.geometry?.dispose();
      if (Array.isArray(this.coniferMesh.material)) {
        this.coniferMesh.material.forEach((m) => m.dispose());
      } else if (this.coniferMesh.material) {
        this.coniferMesh.material.dispose();
      }
      this.coniferMesh.dispose();
      this.coniferMesh = null;
    }
    if (this.deciduousMesh) {
      this.scene.remove(this.deciduousMesh);
      this.deciduousMesh.geometry?.dispose();
      if (Array.isArray(this.deciduousMesh.material)) {
        this.deciduousMesh.material.forEach((m) => m.dispose());
      } else if (this.deciduousMesh.material) {
        this.deciduousMesh.material.dispose();
      }
      this.deciduousMesh.dispose();
      this.deciduousMesh = null;
    }
  }
}

export const environmentRealismEngine = new EnvironmentRealismEngine();
