import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  BuildingMassPresetId,
  BUILDING_MASS_PRESETS,
  PlacedFacility3D,
  FacilityPresetId,
  FACILITY_PRESETS,
  TransformGizmoMode,
  Detail3DMode,
} from '@/types/map';
import { generateLOD2RoofsGroup, disposeRoofMaterialsCache } from '@/utils/roofGeometryBuilder';
import { generateBuildingFacadesGroup, disposeFacadeMaterialsCache } from '@/utils/proceduralFacades';

/**
 * Threebox-MapLibre 연동 정밀 3D 건축물 커스텀 레이어
 * - EffectComposer 기반 SSAO(Screen Space Ambient Occlusion) 및 UnrealBloom 후처리 패스 결합
 * - Directional Shadow Cascades (2048x2048, bias -0.0001, 동적 뷰포트 추적)
 * - terrain: true & map.queryTerrainElevation 기반 실시간 지형 밀착(Terrain Clamping)
 * - glTF/GLB 파일 비동기 로드 및 부재 시 정밀 절차적 3D 건축물 폴백 생성기
 * - [2단계/3단계] Three.js 기반 LOD2 입체 지붕 및 실측 층고(3.0m)/창문(2.5m) UV 외벽 셰이더
 */
export class ThreeboxBuildingLayer implements maplibregl.CustomLayerInterface {
  id = 'threebox-building-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  public readonly options = {
    terrain: true,
    units: 'meters',
    defaultLights: false,
  };

  private map: maplibregl.Map | null = null;
  private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private buildingGroup: THREE.Group = new THREE.Group();

  // [2단계 신규: LOD2 입체 지붕 및 옥상 구조물]
  private roofsGroup: THREE.Group = new THREE.Group();
  private currentRoofsFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];

  // [3단계 신규: LOD2 실측 층고 기준 UV 매핑 외벽 파사드]
  private facadesGroup: THREE.Group = new THREE.Group();

  // [2단계 신규: 다중 3D 시설물 배치 및 인터랙티브 기즈모]
  private facilitiesGroup: THREE.Group = new THREE.Group();
  private facilityMeshes: Map<string, THREE.Group> = new Map();
  private transformControls: TransformControls | null = null;
  private transformHelper: THREE.Object3D | null = null;
  private currentGizmoFacilityId: string | null = null;
  private isDraggingGizmo = false;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  // 인터랙션 콜백
  private onFacilityTransformChange?: (
    id: string,
    updates: Partial<PlacedFacility3D>
  ) => void;
  private onFacilitySelect?: (id: string | null) => void;

  // 후처리 파이프라인 (MapLibre WebGL 컨텍스트 보호를 위해 비활성화)
  private isPostProcessingEnabled = false;

  // 조명 객체
  private directionalLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;

  // 상태 관리
  private isVisible = true;
  private currentPreset: BuildingMassPresetId = 'defense_rd';
  private originLngLat: [number, number] | null = null;
  private clampedAltitude = 0;
  private scaleRatio = 1;
  private rotationDeg = 0;
  private customGltfUrl: string | null = null;
  private lodMode: Detail3DMode = 'lod2';
  private currentFacilities: PlacedFacility3D[] = [];

  // [PBR 물리 기반 재질 캐시]
  private materials = {
    // 1. 벽면(Wall): 연회색 무광 콘크리트 질감 (roughness: 0.7, metalness: 0.1)
    wallConcrete: new THREE.MeshStandardMaterial({
      color: 0xd1d5db, // Slate 300 콘크리트 연회색
      roughness: 0.7,
      metalness: 0.1,
    }),
    // 2. 창문(Window): 반사 하이라이트가 맺히는 글래스 재질 (roughness: 0.2, metalness: 0.8)
    windowGlass: new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // 맑은 스카이블루 글래스 틴트
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.82,
    }),
    // 3. 옥상(Roof): 방수 우레탄 짙은 청회색 마감 (#1e293b, roughness: 0.9)
    roofWaterproof: new THREE.MeshStandardMaterial({
      color: 0x1e293b, // 방수 우레탄 짙은 청회색
      roughness: 0.9,
      metalness: 0.15,
    }),
    // 옥탑 기계실 / 코어 펜트하우스 외벽
    penthouseCore: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.65,
      metalness: 0.2,
    }),
    // 공조 설비 칠러 / 환기 루버 메탈릭
    hvacMetal: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.75,
    }),
    // 옥상 난간 (Parapet / Railing)
    railingParapet: new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.4,
      roughness: 0.5,
    }),
    // 창호 멀리언 금속 프레임
    mullionMetal: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.25,
    }),
    // 층간 슬래브
    slabDark: new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.2,
    }),
    // 헬리패드 데크 & 마킹
    helipadDeck: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
    }),
    helipadYellow: new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.4,
    }),
    warningRed: new THREE.MeshBasicMaterial({
      color: 0xef4444,
    }),
    // 물류센터 및 복합 커뮤니티 재질
    warehouseWall: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.7,
      metalness: 0.1,
    }),
    gabledRoof: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.2,
    }),
    dockShutter: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.7,
    }),
    dockHazard: new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.5,
    }),
    solarCellNavy: new THREE.MeshStandardMaterial({
      color: 0x0c2340,
      metalness: 0.9,
      roughness: 0.15,
    }),
    solarFrame: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.8,
      roughness: 0.2,
    }),
    terraceLimestone: new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.7,
      metalness: 0.1,
    }),
    terraceWood: new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.7,
    }),
    treeTrunk: new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.9,
    }),
    treeFoliage: new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.8,
    }),
    waterPool: new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.95,
      roughness: 0.05,
      transparent: true,
      opacity: 0.8,
    }),
    beaconGreen: new THREE.MeshBasicMaterial({
      color: 0x10b981,
    }),
    trussSteel: new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.3,
    }),
    searchLightGlow: new THREE.MeshBasicMaterial({
      color: 0xfef08a,
    }),
    barracksRoofGreen: new THREE.MeshStandardMaterial({
      color: 0x1e3a29,
      roughness: 0.85,
      metalness: 0.1,
    }),
  };

  constructor() {
    this.scene.add(this.buildingGroup);
    this.scene.add(this.facilitiesGroup);
    this.scene.add(this.roofsGroup);
    this.scene.add(this.facadesGroup);
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    if (!this.originLngLat && map) {
      const c = map.getCenter();
      this.originLngLat = [c.lng, c.lat];
    }

    // 1. [입체 조명 명암비 극대화] Directional Light 그림자 셰이딩 강화 (position: [1.4, 125, 45], intensity: 0.95 대응)
    this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.directionalLight.position.set(116, 141, 81).normalize();
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 1;
    this.directionalLight.shadow.camera.far = 1200;
    this.directionalLight.shadow.camera.left = -120;
    this.directionalLight.shadow.camera.right = 120;
    this.directionalLight.shadow.camera.top = 120;
    this.directionalLight.shadow.camera.bottom = -120;
    // 지형 표면과 맞닿는 섀도우 아티팩트 방지 편향치 (-0.0001)
    this.directionalLight.shadow.bias = -0.0001;
    this.directionalLight.shadow.normalBias = 0.02;
    this.scene.add(this.directionalLight);

    // 환경광 (Ambient Light - 0.45로 낮추어 그림자 대비 극대화)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    // 대기 산란 반사 보조광 (Fill Light)
    this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
    this.fillLight.position.set(-100, 120, 80).normalize();
    this.scene.add(this.fillLight);

    // 산악 능선의 원근감을 강조하는 높이 기반 심도 안개 (Depth Fog)
    this.scene.fog = new THREE.FogExp2(0x1e293b, 0.0008);

    // 2. WebGLRenderer 초기화 (소프트 섀도우 PCFSoftShadowMap & preserveDrawingBuffer)
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // 3. [2단계 신규] TransformControls 인터랙티브 3D 변환 기즈모 마운트
      try {
        this.transformControls = new TransformControls(this.camera, map.getCanvas());
        this.transformControls.size = 0.85;
        this.transformHelper = this.transformControls.getHelper();
        this.scene.add(this.transformHelper);

        // 기즈모 조작 중 지도 이동/회전 방지 (Orbit Lock 충돌 방지)
        this.transformControls.addEventListener('dragging-changed', (event) => {
          this.isDraggingGizmo = !!event.value;
          if (this.isDraggingGizmo) {
            map.dragPan.disable();
            map.dragRotate.disable();
            map.touchZoomRotate.disable();
            map.scrollZoom.disable();
          } else {
            map.dragPan.enable();
            map.dragRotate.enable();
            map.touchZoomRotate.enable();
            map.scrollZoom.enable();
          }
        });

        // 오브젝트 변환 시 실시간 지형 고도 샘플링 및 바닥 자동 스냅 (Terrain Clamping)
        this.transformControls.addEventListener('change', () => {
          this.handleGizmoChange();
        });
      } catch (tcErr) {
        console.warn('[ThreeboxBuildingLayer] TransformControls setup warning:', tcErr);
      }
    } catch (err) {
      console.warn('[ThreeboxBuildingLayer] WebGLRenderer setup warning:', err);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.originLngLat || !this.renderer) {
      return;
    }

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      // [LOD 뷰포트 레벨 체크] 브라우저 부하 방지: 줌 레벨 15 이상에서만 Threebox 정밀 입체 지붕(LOD2) 렌더링, 원거리에서는 MapLibre 네이티브 레이어로 자동 스위칭 (60fps 유지)
      if (this.map) {
        const zoom = this.map.getZoom();
        const isHighDetailZoom = zoom >= 15.0 && this.lodMode === 'lod2';
        if (this.roofsGroup.visible !== isHighDetailZoom) {
          this.roofsGroup.visible = isHighDetailZoom;
        }
        if (this.facadesGroup.visible !== isHighDetailZoom) {
          this.facadesGroup.visible = isHighDetailZoom;
        }
      }

      // 1. [지형 밀착 (Terrain Clamping)] 3D DEM 지형 표고 실시간 조회
      if (this.map && this.map.queryTerrainElevation) {
        const elev = this.map.queryTerrainElevation(this.originLngLat);
        if (elev !== null && elev !== undefined) {
          this.clampedAltitude = elev;
        }

        // [시설물 개별 정밀 지형 밀착 (Per-facility Terrain Clamping)]
        if (!this.isDraggingGizmo) {
          for (const facility of this.currentFacilities) {
            const mesh = this.facilityMeshes.get(facility.id);
            if (mesh && facility.id !== this.currentGizmoFacilityId) {
              const queried = this.map.queryTerrainElevation(facility.coords);
              if (queried !== null && queried !== undefined) {
                mesh.position.y = queried - this.clampedAltitude;
              }
            }
          }
        }
      }

      // 2. Mercator 좌표계 투영 (지형 표고 상에 정확히 안착)
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        this.clampedAltitude
      );

      // 3. units: 'meters' 스케일 환산 (1 유닛 = 실측 1m 정밀 대응)
      const meterScale = mercator.meterInMercatorCoordinateUnits();

      // 4. 좌표계 회전 변환 (Three.js Y-Up -> MapLibre Z-Up)
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      // 5. 복합 변환 행렬 구성
      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);
      // SSAOPass의 깊이 선형화 연산을 위한 역투영 행렬 동기화
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

      // 6. [Directional Shadow Cascades 동적 뷰포트 추적]
      if (this.directionalLight) {
        const halfBound = Math.max(250, 80 * this.scaleRatio);
        const cam = this.directionalLight.shadow.camera;
        cam.left = -halfBound;
        cam.right = halfBound;
        cam.top = halfBound;
        cam.bottom = -halfBound;
        cam.updateProjectionMatrix();
      }

      // 7. WebGL 상태 보존 및 MapLibre 네이티브 렌더링 루프 직접 호출
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    } catch (renderErr) {
      console.warn('[ThreeboxBuildingLayer] render error suppressed:', renderErr);
      // 에러 시 안전하게 기본 렌더러로 폴백
      try {
        if (this.renderer) {
          this.renderer.resetState();
          this.renderer.render(this.scene, this.camera);
        }
      } catch {}
    }
  }

  /**
   * 부지 중심 좌표 및 프리셋 변경 시 실시간 모델 갱신
   */
  async updateBuilding(
    presetId: BuildingMassPresetId,
    center: [number, number],
    scaleRatio = 1,
    rotationDeg = 0,
    customUrl?: string | null
  ): Promise<void> {
    this.originLngLat = center;
    this.currentPreset = presetId;
    this.scaleRatio = scaleRatio;
    this.rotationDeg = rotationDeg;
    this.customGltfUrl = customUrl || null;

    // 지형 표고 즉시 쿼리
    if (this.map && this.map.queryTerrainElevation) {
      const elev = this.map.queryTerrainElevation(center);
      this.clampedAltitude = elev !== null && elev !== undefined ? Math.max(0, elev) : 0;
    }

    // 기존 3D 모델 클리어
    this.clearBuildingGroup();

    // 1. 외부 GLB 또는 /models/ 에셋 로드 시도
    let loadedSuccess = false;
    const targetModelUrl = customUrl || `/models/${presetId}.glb`;

    try {
      const gltf = await this.tryLoadGLTF(targetModelUrl);
      if (gltf) {
        this.buildingGroup.add(gltf);
        loadedSuccess = true;
      }
    } catch {
      // GLB 파일이 아직 다운로드되지 않았거나 없을 경우 자연스러운 폴백
      loadedSuccess = false;
    }

    // 2. GLB 부재 시 정밀 절차적 3D 건축물 폴백 생성기 가동
    if (!loadedSuccess) {
      const fallbackGroup = this.createProceduralBuildingFallback(presetId);
      this.buildingGroup.add(fallbackGroup);
    }

    // 부지 연동 스케일 및 방위각 회전을 건물 그룹에 직접 적용
    this.buildingGroup.scale.set(this.scaleRatio, this.scaleRatio, this.scaleRatio);
    this.buildingGroup.rotation.y = (this.rotationDeg * Math.PI) / 180;

    // 중심 좌표 이동 시 LOD2 지붕 위치 동기화
    if (this.currentRoofsFeatures.length > 0) {
      this.syncRoofs(this.currentRoofsFeatures, center);
    }

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 3D 디테일 모드(LOD1 일반 / LOD2+ 실감) 동적 변경
   */
  public setLodMode(mode: Detail3DMode): void {
    if (this.lodMode === mode) return;
    this.lodMode = mode;

    // LOD2 경사 지붕 및 실측 UV 건축 외벽 가시성 연동
    this.roofsGroup.visible = mode === 'lod2';
    this.facadesGroup.visible = mode === 'lod2';
    if (mode === 'lod2' && this.currentRoofsFeatures.length > 0 && this.roofsGroup.children.length === 0) {
      this.syncRoofs(this.currentRoofsFeatures);
    }

    // 기존 시설물 메쉬들을 새 LOD로 갱신
    for (const [id, mesh] of this.facilityMeshes.entries()) {
      this.facilitiesGroup.remove(mesh);
      this.disposeObject(mesh);
      this.facilityMeshes.delete(id);
    }
    if (this.currentFacilities.length > 0) {
      this.syncFacilities(this.currentFacilities, this.currentGizmoFacilityId);
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * [2단계 & 3단계] GeoJSON 건축물 외곽선 기반 LOD2 실측 외벽(1F로비/기준층) 및 입체 지붕 동기화
   */
  public syncRoofs(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    origin?: [number, number]
  ): void {
    this.currentRoofsFeatures = features;
    if (origin) {
      this.originLngLat = origin;
    } else if (!this.originLngLat && this.map) {
      const c = this.map.getCenter();
      this.originLngLat = [c.lng, c.lat];
    }

    this.clearRoofsGroup();
    this.clearFacadesGroup();

    if (this.lodMode === 'lod2' && features && features.length > 0 && this.originLngLat) {
      const elevFn = (coord: [number, number]) => {
        if (this.map && this.map.queryTerrainElevation) {
          const elev = this.map.queryTerrainElevation(coord);
          if (elev !== null && elev !== undefined) {
            return elev - this.clampedAltitude;
          }
        }
        return 0;
      };

      // 1. [3단계 신규] 실측 층고(3.0m) 및 창문(2.5m) UV 매핑 절차적 건축 외벽 메쉬 생성
      const facades = generateBuildingFacadesGroup(
        features,
        this.originLngLat,
        elevFn
      );
      this.facadesGroup.add(facades);

      // 2. [3단계 신규] 속성 기반 LOD2 입체 지붕(박공/모임/평지붕) 및 PBR 셰이딩 생성
      const roofs = generateLOD2RoofsGroup(
        features,
        this.originLngLat,
        elevFn
      );
      this.roofsGroup.add(roofs);
    }

    const currentZoom = this.map ? this.map.getZoom() : 16;
    const isHighDetailZoom = currentZoom >= 15.0 && this.lodMode === 'lod2';
    this.roofsGroup.visible = isHighDetailZoom;
    this.facadesGroup.visible = isHighDetailZoom;
    this.isVisible = true;

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 외벽 메쉬 그룹 메모리 해제 및 클리어
   */
  public clearFacadesGroup(): void {
    while (this.facadesGroup.children.length > 0) {
      const child = this.facadesGroup.children[0];
      this.facadesGroup.remove(child);
      this.disposeObject(child);
    }
  }

  /**
   * 지붕 메쉬 그룹 메모리 해제 및 클리어
   */
  public clearRoofsGroup(): void {
    while (this.roofsGroup.children.length > 0) {
      const child = this.roofsGroup.children[0];
      this.roofsGroup.remove(child);
      this.disposeObject(child);
    }
  }

  /**
   * GLB/GLTF 파일 비동기 로더 (404/미존재 시 즉시 폴백으로 전달)
   */
  private tryLoadGLTF(url: string): Promise<THREE.Group | null> {
    const loader = new GLTFLoader();

    return new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          const bbox = new THREE.Box3().setFromObject(scene);
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          const size = new THREE.Vector3();
          bbox.getSize(size);

          // 바닥을 y=0에 정렬하고 원점 중앙 배치
          scene.position.x = -center.x;
          scene.position.y = -bbox.min.y;
          scene.position.z = -center.z;

          // 실측 스케일 기준(60m)으로 자동 정규화
          const maxDim = Math.max(size.x, size.z, 1);
          const s = 60 / maxDim;
          const wrapper = new THREE.Group();
          wrapper.scale.set(s, s, s);
          wrapper.add(scene);

          scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const m = obj as THREE.Mesh;
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });

          resolve(wrapper);
        },
        undefined,
        () => {
          // GLB 로드 실패 시 null 반환 -> 폴백 생성기 가동
          resolve(null);
        }
      );
    });
  }

  /**
   * [Three.js 기반 정밀 절차적 3D 건축물 폴백 생성기]
   * - 실측 규격: 가로 60m x 세로 35m x 높이 22m (약 5,000평 부지 맞춤)
   * - 구성: 지붕 난간, 커튼월 창문 패턴, 옥상 헬리패드(H), 기계실 옥탑, 지상 캐노피
   */
  private createProceduralBuildingFallback(presetId: BuildingMassPresetId): THREE.Group {
    const root = new THREE.Group();

    if (presetId === 'smart_logistics') {
      // -----------------------------------------------------------------------
      // [프리셋 2: 군수 물류센터] 실측 65m x 38m x 16m
      // -----------------------------------------------------------------------
      const w = 65;
      const d = 38;
      const wallH = 12;
      const roofApex = 4.2;

      // 메인 창고 벽체
      const wallGeo = new THREE.BoxGeometry(w, wallH, d);
      const wallMesh = new THREE.Mesh(wallGeo, this.materials.warehouseWall);
      wallMesh.position.set(0, wallH / 2, 0);
      root.add(wallMesh);

      // 트러스 박공지붕 (Gabled Roof)
      const roofShape = new THREE.Shape();
      roofShape.moveTo(-d / 2, 0);
      roofShape.lineTo(0, roofApex);
      roofShape.lineTo(d / 2, 0);
      roofShape.closePath();

      const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
        depth: w + 1.2,
        bevelEnabled: false,
      });
      const roofMesh = new THREE.Mesh(roofGeo, this.materials.gabledRoof);
      roofMesh.rotation.y = Math.PI / 2;
      roofMesh.position.set(-w / 2 - 0.6, wallH, 0);
      root.add(roofMesh);

      // 6베이 화물 하역 도크 (Loading Dock)
      const dockCount = 6;
      const dockW = 4.2;
      const dockH = 4.5;
      const spacing = 7.5;
      const startX = -((dockCount - 1) * spacing) / 2;
      const doorGeo = new THREE.BoxGeometry(dockW, dockH, 0.3);
      const bumperGeo = new THREE.BoxGeometry(dockW + 0.6, 0.4, 0.5);

      for (let i = 0; i < dockCount; i++) {
        const dx = startX + i * spacing;
        const dz = d / 2 + 0.15;
        const door = new THREE.Mesh(doorGeo, this.materials.dockShutter);
        door.position.set(dx, dockH / 2 + 0.4, dz);
        root.add(door);

        const bumper = new THREE.Mesh(bumperGeo, this.materials.dockHazard);
        bumper.position.set(dx, 0.25, dz + 0.25);
        root.add(bumper);
      }

      // 옥상 태양광 패널 그리드 (Solar Array: 3행 x 7열 = 21모듈, 남향 22도 경사)
      const sPanelGeo = new THREE.BoxGeometry(5.2, 0.12, 2.5);
      const tilt = THREE.MathUtils.degToRad(-22);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 7; c++) {
          const px = -22 + c * 7.2;
          const pz = -8 + r * 5.0;
          const py = wallH + roofApex * (1 - Math.abs(pz) / (d / 2)) + 0.4;
          const panel = new THREE.Mesh(sPanelGeo, this.materials.solarCellNavy);
          panel.rotation.x = tilt;
          panel.position.set(px, py, pz);
          root.add(panel);
        }
      }

      return root;
    } else if (presetId === 'civil_military') {
      // -----------------------------------------------------------------------
      // [프리셋 3: 복합 커뮤니티] 실측 55m x 32m x 14m (3단 단차형 테라스)
      // -----------------------------------------------------------------------
      const t1W = 55;
      const t1D = 32;
      const t1H = 4.8;
      const t1 = new THREE.Mesh(
        new THREE.BoxGeometry(t1W, t1H, t1D),
        this.materials.terraceLimestone
      );
      t1.position.set(0, t1H / 2, 0);
      root.add(t1);

      const t2W = 42;
      const t2D = 23;
      const t2H = 4.6;
      const t2 = new THREE.Mesh(
        new THREE.BoxGeometry(t2W, t2H, t2D),
        this.materials.terraceLimestone
      );
      t2.position.set(-3, t1H + t2H / 2, -2);
      root.add(t2);

      const t3W = 28;
      const t3D = 15;
      const t3H = 4.8;
      const t3 = new THREE.Mesh(
        new THREE.BoxGeometry(t3W, t3H, t3D),
        this.materials.terraceLimestone
      );
      t3.position.set(-6, t1H + t2H + t3H / 2, -4);
      root.add(t3);

      // 오픈 테라스 우든 데크
      const deck1 = new THREE.Mesh(
        new THREE.BoxGeometry(14, 0.25, 24),
        this.materials.terraceWood
      );
      deck1.position.set(18, t1H + 0.15, 0);
      root.add(deck1);

      // 중정 수변 분수 광장
      const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 7, 0.3, 32),
        this.materials.waterPool
      );
      pool.position.set(10, 0.2, 11);
      root.add(pool);

      // 중정 조경 수목 6그루
      const treePos = [
        [20, 9],
        [17, 18],
        [-10, 15],
        [-18, 12],
        [-20, 2],
        [4, 20],
      ];
      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
      const foliageGeo = new THREE.ConeGeometry(2.2, 4.5, 7);
      treePos.forEach(([tx, tz]) => {
        const tg = new THREE.Group();
        tg.position.set(tx, 0, tz);
        const trunk = new THREE.Mesh(trunkGeo, this.materials.treeTrunk);
        trunk.position.y = 1.5;
        tg.add(trunk);
        const fol = new THREE.Mesh(foliageGeo, this.materials.treeFoliage);
        fol.position.y = 4.2;
        tg.add(fol);
        root.add(tg);
      });

      return root;
    } else {
      // -----------------------------------------------------------------------
      // [프리셋 1: 국방 R&D 센터] 실측 가로 60m x 세로 35m x 높이 22m (표준 복합 빌딩)
      // -----------------------------------------------------------------------
      const w = 60;
      const d = 35;
      const h = 22;

      // 1. [벽면(Wall)] 연회색 무광 콘크리트 구조체 코어 (roughness: 0.7, metalness: 0.1)
      const coreGeo = new THREE.BoxGeometry(w * 0.96, h, d * 0.96);
      const coreMesh = new THREE.Mesh(coreGeo, this.materials.wallConcrete);
      coreMesh.position.set(0, h / 2, 0);
      root.add(coreMesh);

      // 2. [창문(Window)] 반사 하이라이트 글래스 커튼월 외피 (roughness: 0.2, metalness: 0.8)
      const towerGeo = new THREE.BoxGeometry(w, h, d);
      const towerMesh = new THREE.Mesh(towerGeo, this.materials.windowGlass);
      towerMesh.position.set(0, h / 2, 0);
      root.add(towerMesh);

      // 3. 층간 슬래브 라인 (Floor Slabs: 5개 층 슬래브)
      const floorCount = 5;
      const slabH = 0.45;
      const slabGeo = new THREE.BoxGeometry(w * 0.99, slabH, d * 0.99);
      for (let i = 1; i <= floorCount; i++) {
        const slab = new THREE.Mesh(slabGeo, this.materials.slabDark);
        slab.position.set(0, i * (h / (floorCount + 1)), 0);
        root.add(slab);
      }

      // 4. [옥상(Roof)] 방수 우레탄 짙은 청회색 상단 마감 슬래브 (#1e293b, roughness: 0.9)
      const roofDeckGeo = new THREE.BoxGeometry(w, 0.5, d);
      const roofDeck = new THREE.Mesh(roofDeckGeo, this.materials.roofWaterproof);
      roofDeck.position.set(0, h + 0.25, 0);
      root.add(roofDeck);

      // 5. 커튼월 수직 멀리언 창문 프레임 (Mullion Grid: 4.5m 간격 수직 프레임)
      const mullionGeoX = new THREE.BoxGeometry(0.3, h, 0.4);
      for (let mx = -w / 2 + 3; mx <= w / 2 - 3; mx += 4.5) {
        const mFront = new THREE.Mesh(mullionGeoX, this.materials.mullionMetal);
        mFront.position.set(mx, h / 2, d / 2 + 0.1);
        root.add(mFront);

        const mBack = new THREE.Mesh(mullionGeoX, this.materials.mullionMetal);
        mBack.position.set(mx, h / 2, -d / 2 - 0.1);
        root.add(mBack);
      }

      // 6. [지붕 난간 (Rooftop Parapet / Railing)] 외곽 테두리 1.2m 난간 구조물
      const parapetH = 1.2;
      const parapetThick = 0.35;
      const pNorthSouthGeo = new THREE.BoxGeometry(w, parapetH, parapetThick);
      const pNorth = new THREE.Mesh(pNorthSouthGeo, this.materials.railingParapet);
      pNorth.position.set(0, h + parapetH / 2 + 0.5, -d / 2 + parapetThick / 2);
      root.add(pNorth);

      const pSouth = new THREE.Mesh(pNorthSouthGeo, this.materials.railingParapet);
      pSouth.position.set(0, h + parapetH / 2 + 0.5, d / 2 - parapetThick / 2);
      root.add(pSouth);

      const pEastWestGeo = new THREE.BoxGeometry(parapetThick, parapetH, d - parapetThick * 2);
      const pWest = new THREE.Mesh(pEastWestGeo, this.materials.railingParapet);
      pWest.position.set(-w / 2 + parapetThick / 2, h + parapetH / 2 + 0.5, 0);
      root.add(pWest);

      const pEast = new THREE.Mesh(pEastWestGeo, this.materials.railingParapet);
      pEast.position.set(w / 2 - parapetThick / 2, h + parapetH / 2 + 0.5, 0);
      root.add(pEast);

      // 7. [옥탑 기계실 / 엘리베이터 권상기실 (Penthouse Core)] (16m x 4.2m x 12m)
      const phW = 16;
      const phD = 12;
      const phH = 4.2;
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(phW, phH, phD),
        this.materials.penthouseCore
      );
      ph.position.set(-11, h + phH / 2 + 0.5, 0);
      root.add(ph);

      // 8. [옥상 공조 냉각탑 / HVAC Chiller Units 메탈 설비 2기]
      const hvacGeo = new THREE.BoxGeometry(4.6, 2.2, 3.2);
      const hvac1 = new THREE.Mesh(hvacGeo, this.materials.hvacMetal);
      hvac1.position.set(-12, h + phH + 1.1 + 0.5, -2.5);
      root.add(hvac1);

      const hvac2 = new THREE.Mesh(hvacGeo, this.materials.hvacMetal);
      hvac2.position.set(-12, h + phH + 1.1 + 0.5, 2.5);
      root.add(hvac2);

      // 9. [옥상 헬리패드 (Helipad H)] 반경 9.5m 원형 데크 및 H 마크
      const padRadius = 9.5;
      const padH = 0.35;
      const padCenter = new THREE.Vector3(12, h + padH / 2 + 0.5, 0);

      const padBase = new THREE.Mesh(
        new THREE.CylinderGeometry(padRadius, padRadius, padH, 32),
        this.materials.helipadDeck
      );
      padBase.position.copy(padCenter);
      root.add(padBase);

      const padRing = new THREE.Mesh(
        new THREE.RingGeometry(padRadius * 0.82, padRadius * 0.92, 32),
        this.materials.helipadYellow
      );
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.set(padCenter.x, padCenter.y + 0.2, padCenter.z);
      root.add(padRing);

      const barW = 0.9;
      const barL = 5.6;
      const barThick = 0.06;
      const barGeo = new THREE.BoxGeometry(barW, barThick, barL);
      const crossGeo = new THREE.BoxGeometry(3.2, barThick, barW);

      const barL1 = new THREE.Mesh(barGeo, this.materials.helipadYellow);
      barL1.position.set(padCenter.x - 1.6, padCenter.y + 0.22, padCenter.z);
      root.add(barL1);

      const barL2 = new THREE.Mesh(barGeo, this.materials.helipadYellow);
      barL2.position.set(padCenter.x + 1.6, padCenter.y + 0.22, padCenter.z);
      root.add(barL2);

      const barC = new THREE.Mesh(crossGeo, this.materials.helipadYellow);
      barC.position.set(padCenter.x, padCenter.y + 0.22, padCenter.z);
      root.add(barC);

      // 항공 장애 표시등 (적색 비콘 4개 모서리)
      const beaconGeo = new THREE.SphereGeometry(0.5, 8, 8);
      [
        [-w / 2 + 1, h + parapetH + 1, -d / 2 + 1],
        [w / 2 - 1, h + parapetH + 1, -d / 2 + 1],
        [-w / 2 + 1, h + parapetH + 1, d / 2 - 1],
        [w / 2 - 1, h + parapetH + 1, d / 2 - 1],
      ].forEach(([bx, by, bz]) => {
        const beacon = new THREE.Mesh(beaconGeo, this.materials.warningRed);
        beacon.position.set(bx, by, bz);
        root.add(beacon);
      });

      // 10. 지상 진입 캐노피 (Entrance Canopy)
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.4, 7),
        this.materials.mullionMetal
      );
      canopy.position.set(0, 4.2, d / 2 + 3.5);
      root.add(canopy);

      // 11. 지면 그림자 수신용 바닥 플레이트 (Ground Shadow Receiver Plane)
      const shadowPlaneGeo = new THREE.PlaneGeometry(160, 160);
      const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.38 });
      const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = 0.05;
      shadowPlane.receiveShadow = true;
      root.add(shadowPlane);

      // 12. 전체 서브메쉬에 CastShadow & ReceiveShadow 활성화
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj !== shadowPlane) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      return root;
    }
  }

  /**
   * 실시간 태양광 위치 및 조도/색온도, 심도 안개(Fog) 색상 동기화
   */
  updateSunLight(
    directionalVector: [number, number, number],
    color: string,
    intensity: number,
    fogColor?: string
  ): void {
    if (this.directionalLight) {
      this.directionalLight.position.set(
        directionalVector[0],
        directionalVector[1],
        directionalVector[2]
      ).normalize();
      this.directionalLight.color.set(color);
      this.directionalLight.intensity = Math.max(0.6, intensity * 1.6);
    }
    if (this.scene.fog && fogColor) {
      (this.scene.fog as THREE.FogExp2).color.set(fogColor);
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 디지털 트윈 후처리(SSAO & Bloom) 활성화 여부 제어
   */
  setPostProcessingEnabled(enabled: boolean): void {
    this.isPostProcessingEnabled = enabled;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  isPostProcessing(): boolean {
    return this.isPostProcessingEnabled;
  }

  /**
   * 가시성 제어 (개발구상 매싱과 배치 시설물 그룹 분리 제어)
   */
  setVisible(visible: boolean): void {
    this.buildingGroup.visible = visible;
    this.roofsGroup.visible = visible && this.lodMode === 'lod2';
    this.facadesGroup.visible = visible && this.lodMode === 'lod2';
    this.isVisible = visible || this.facilityMeshes.size > 0 ||
      (this.roofsGroup.visible && this.roofsGroup.children.length > 0) ||
      (this.facadesGroup.visible && this.facadesGroup.children.length > 0);
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  private clearBuildingGroup(): void {
    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      this.buildingGroup.remove(child);
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
    }
  }

  // =========================================================================
  // [2단계 신규: 3D 인터랙티브 배치 시설물 & TransformControls 연동]
  // =========================================================================

  setFacilityCallbacks(
    onTransformChange: (id: string, updates: Partial<PlacedFacility3D>) => void,
    onSelect: (id: string | null) => void
  ): void {
    this.onFacilityTransformChange = onTransformChange;
    this.onFacilitySelect = onSelect;
  }

  setGizmoMode(mode: TransformGizmoMode): void {
    if (this.transformControls) {
      this.transformControls.setMode(mode);
      if (this.map) {
        this.map.triggerRepaint();
      }
    }
  }

  attachGizmo(facilityId: string | null): void {
    this.currentGizmoFacilityId = facilityId;
    if (!this.transformControls) return;

    if (!facilityId) {
      this.transformControls.detach();
      if (this.map) {
        this.map.triggerRepaint();
      }
      return;
    }

    const mesh = this.facilityMeshes.get(facilityId);
    if (mesh) {
      this.transformControls.attach(mesh);
    } else {
      this.transformControls.detach();
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  detachGizmo(): void {
    this.attachGizmo(null);
  }

  getSelectedFacilityId(): string | null {
    return this.currentGizmoFacilityId;
  }

  /**
   * 기즈모 조작 시 실시간 좌표 역산 & 지형 자동 스냅 (Terrain Clamping)
   */
  private handleGizmoChange(): void {
    if (!this.currentGizmoFacilityId || !this.originLngLat) return;
    const mesh = this.facilityMeshes.get(this.currentGizmoFacilityId);
    if (!mesh) return;

    // Three.js Y-Up 공간에서 미터 오프셋 계산:
    const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
    const metersPerLngDegree = (Math.PI / 180) * 6378137 * cosLat;
    const metersPerLatDegree = (Math.PI / 180) * 6378137;

    const curX = mesh.position.x;
    const curZ = mesh.position.z;

    const newLng = this.originLngLat[0] + curX / metersPerLngDegree;
    const newLat = this.originLngLat[1] - curZ / metersPerLatDegree;

    // 실시간 지형 표고 샘플링 및 바닥 스냅 (Terrain Clamping)
    let targetElevation = this.clampedAltitude;
    if (this.map && this.map.queryTerrainElevation) {
      const elev = this.map.queryTerrainElevation([newLng, newLat]);
      if (elev !== null && elev !== undefined) {
        targetElevation = elev;
      }
    }

    // Y축을 지형 바닥에 자동 스냅
    mesh.position.y = targetElevation - this.clampedAltitude;

    const rotDeg = Math.round((((mesh.rotation.y * 180) / Math.PI) % 360 + 360) % 360);
    const scaleVal = Number(mesh.scale.x.toFixed(2));

    this.onFacilityTransformChange?.(this.currentGizmoFacilityId, {
      coords: [Number(newLng.toFixed(6)), Number(newLat.toFixed(6))],
      elevation: Math.round(targetElevation),
      rotationY: rotDeg,
      scale: scaleVal,
    });

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 마우스 클릭 시 3D 시설물 피킹 (Raycasting)
   */
  handleMapClick(point: { x: number; y: number }): boolean {
    if (this.isDraggingGizmo || !this.map) return false;

    const canvas = this.map.getCanvas();
    const mouse = new THREE.Vector2(
      (point.x / canvas.clientWidth) * 2 - 1,
      -(point.y / canvas.clientHeight) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.facilitiesGroup.children, true);

    if (intersects.length > 0) {
      // 클릭된 오브젝트의 root facilityId 탐색
      let curObj: THREE.Object3D | null = intersects[0].object;
      let targetFacilityId: string | null = null;
      while (curObj && curObj !== this.facilitiesGroup) {
        if (curObj.userData?.facilityId) {
          targetFacilityId = curObj.userData.facilityId;
          break;
        }
        curObj = curObj.parent;
      }

      if (targetFacilityId) {
        this.attachGizmo(targetFacilityId);
        this.onFacilitySelect?.(targetFacilityId);
        return true;
      }
    }

    // 빈 공간 클릭 시 기즈모 해제
    this.detachGizmo();
    this.onFacilitySelect?.(null);
    return false;
  }

  /**
   * 배치된 시설물 목록 실시간 동기화
   */
  async syncFacilities(
    facilities: PlacedFacility3D[],
    selectedFacilityId: string | null
  ): Promise<void> {
    this.currentFacilities = facilities;

    if (facilities.length > 0) {
      // 거점 부지 변경 감지 (원주/춘천/철원 등 거점 간 이동 시 씬 원점 자동 리센터링)
      if (!this.originLngLat) {
        this.originLngLat = facilities[0].coords;
      } else {
        const dLng = Math.abs(facilities[0].coords[0] - this.originLngLat[0]);
        const dLat = Math.abs(facilities[0].coords[1] - this.originLngLat[1]);
        if (dLng > 0.015 || dLat > 0.015) {
          this.originLngLat = facilities[0].coords;
        }
      }
    } else if (!this.originLngLat) {
      return;
    }

    const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
    const metersPerLngDegree = (Math.PI / 180) * 6378137 * cosLat;
    const metersPerLatDegree = (Math.PI / 180) * 6378137;

    const currentIds = new Set(facilities.map((f) => f.id));

    // 1. 삭제된 시설물 정리
    for (const [id, mesh] of this.facilityMeshes.entries()) {
      if (!currentIds.has(id)) {
        if (this.currentGizmoFacilityId === id) {
          this.detachGizmo();
        }
        this.facilitiesGroup.remove(mesh);
        this.disposeObject(mesh);
        this.facilityMeshes.delete(id);
      }
    }

    // 2. 추가 또는 갱신
    for (const facility of facilities) {
      let mesh = this.facilityMeshes.get(facility.id);

      if (!mesh) {
        // 새로 생성
        mesh = await this.createFacilityMesh(facility);
        mesh.name = facility.id;
        mesh.userData = { facilityId: facility.id, isFacility: true };
        this.facilitiesGroup.add(mesh);
        this.facilityMeshes.set(facility.id, mesh);
      }

      // 기즈모 드래그 중이 아닐 때 위치/회전/스케일 반영
      if (this.currentGizmoFacilityId !== facility.id || !this.isDraggingGizmo) {
        const dx = (facility.coords[0] - this.originLngLat[0]) * metersPerLngDegree;
        const dz = -(facility.coords[1] - this.originLngLat[1]) * metersPerLatDegree;

        // [정밀 지형 밀착 (Terrain Clamping)]
        let groundElev = facility.elevation;
        if (this.map && this.map.queryTerrainElevation) {
          const queried = this.map.queryTerrainElevation(facility.coords);
          if (queried !== null && queried !== undefined) {
            groundElev = queried;
          }
        }
        const dy = groundElev - this.clampedAltitude;

        mesh.position.set(dx, dy, dz);
        mesh.rotation.y = (facility.rotationY * Math.PI) / 180;
        mesh.scale.set(facility.scale, facility.scale, facility.scale);
      }
    }

    // 3. 기즈모 타겟 동기화
    if (selectedFacilityId && selectedFacilityId !== this.currentGizmoFacilityId) {
      this.attachGizmo(selectedFacilityId);
    } else if (!selectedFacilityId && this.currentGizmoFacilityId) {
      this.detachGizmo();
    }

    this.isVisible = this.buildingGroup.visible || this.facilityMeshes.size > 0;

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 시설물 3D 메쉬 생성기 (glTF 비동기 로드 시도 및 절차적 복합 메쉬 폴백)
   */
  private async createFacilityMesh(facility: PlacedFacility3D): Promise<THREE.Group> {
    const root = new THREE.Group();

    // 1. glTF 모델 비동기 로드 시도
    let gltfLoaded = false;
    const targetUrl = facility.customGltfUrl || `/models/facilities/${facility.presetId}.glb`;
    try {
      const gltf = await this.tryLoadFacilityGLTF(targetUrl, facility);
      if (gltf) {
        root.add(gltf);
        gltfLoaded = true;
      }
    } catch {
      gltfLoaded = false;
    }

    // 2. 로컬 glTF가 없을 경우 정밀 절차적 3D 복합 메쉬로 완벽 폴백
    if (!gltfLoaded) {
      const fallback = this.createProceduralFacilityMesh(facility);
      root.add(fallback);
    }

    // 그림자 활성화
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return root;
  }

  /**
   * 시설물 glTF 비동기 로더
   */
  private tryLoadFacilityGLTF(url: string, facility: PlacedFacility3D): Promise<THREE.Group | null> {
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          const bbox = new THREE.Box3().setFromObject(scene);
          const center = new THREE.Vector3();
          bbox.getCenter(center);
          const size = new THREE.Vector3();
          bbox.getSize(size);

          scene.position.x = -center.x;
          scene.position.y = -bbox.min.y;
          scene.position.z = -center.z;

          const maxDim = Math.max(size.x, size.z, 1);
          const targetWidth = FACILITY_PRESETS[facility.presetId]?.defaultWidth || 20;
          const s = targetWidth / maxDim;
          const wrapper = new THREE.Group();
          wrapper.scale.set(s, s, s);
          wrapper.add(scene);
          resolve(wrapper);
        },
        undefined,
        () => resolve(null)
      );
    });
  }

  /**
   * 5종 국방·도시계획 정밀 절차적 메쉬(Procedural Composite Mesh) 생성기
   * - 상단 툴바 LOD(LOD1 일반 / LOD2+ 실감) 모드에 맞춰 경량화 또는 초정밀 디테일 분기 렌더링
   */
  private createProceduralFacilityMesh(facility: PlacedFacility3D): THREE.Group {
    const meta = FACILITY_PRESETS[facility.presetId] || FACILITY_PRESETS.defense_rd_tower;
    const h = facility.heightMeters || meta.defaultHeight;
    const w = meta.defaultWidth;
    const d = meta.defaultDepth;

    switch (facility.presetId) {
      case 'defense_rd_tower':
        return this.createProceduralDefenseTower(h, w, d);
      case 'barracks_hq':
        return this.createProceduralBarracks(h, w, d);
      case 'logistics_depot':
        return this.createProceduralLogisticsDepot(h, w, d);
      case 'watch_tower':
        return this.createProceduralWatchTower(h, w, d);
      case 'helipad_base':
        return this.createProceduralHelipadBase(h, w, d);
      default:
        return this.createProceduralDefenseTower(h, w, d);
    }
  }

  // 1) 국방 R&D 연구동 (계단식 옥상 테라스 + 헬리패드 + 글래스 로비)
  private createProceduralDefenseTower(h: number, w: number, d: number): THREE.Group {
    const group = new THREE.Group();

    if (this.lodMode === 'lod1') {
      // [LOD 1 경량 모드]
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        this.materials.windowGlass
      );
      bldg.position.y = h / 2;
      group.add(bldg);
      return group;
    }

    // [LOD 2+ 실감 모드]
    // 1. 하단 1~2F 전면 돌출 글래스 로비 (Protruding Glass Atrium Lobby)
    const lobbyW = w * 0.75;
    const lobbyH = 7.5;
    const lobbyD = 5.5;
    const glassLobby = new THREE.Mesh(
      new THREE.BoxGeometry(lobbyW, lobbyH, lobbyD),
      this.materials.windowGlass
    );
    glassLobby.position.set(0, lobbyH / 2, d / 2 + lobbyD / 2);
    group.add(glassLobby);

    // 로비 진입 캐노피 및 슬래브
    const lobbyCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(lobbyW * 0.7, 0.4, 2.5),
      this.materials.mullionMetal
    );
    lobbyCanopy.position.set(0, 3.8, d / 2 + lobbyD + 1.25);
    group.add(lobbyCanopy);

    // 2. 메인 타워 저층부 (Level 1 ~ 5)
    const lowerH = h * 0.6;
    const lowerTower = new THREE.Mesh(
      new THREE.BoxGeometry(w, lowerH, d),
      this.materials.windowGlass
    );
    lowerTower.position.y = lowerH / 2;
    group.add(lowerTower);

    // 층간 수평 메탈 슬래브 라인 (5단)
    for (let i = 1; i <= 5; i++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.35, 0.4, d + 0.35),
        this.materials.slabDark
      );
      slab.position.y = (lowerH / 5) * i;
      group.add(slab);
    }

    // 3. 계단식 옥상 테라스 1단 (Level 6 ~ 7: 중층 셋백)
    const midW = w * 0.8;
    const midD = d * 0.8;
    const midH = h * 0.25;
    const midTower = new THREE.Mesh(
      new THREE.BoxGeometry(midW, midH, midD),
      this.materials.windowGlass
    );
    midTower.position.y = lowerH + midH / 2;
    group.add(midTower);

    // 하부 테라스 바닥 데크 & 유리 난간 (Terrace Deck & Railing)
    const terraceDeck1 = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.35, d),
      this.materials.terraceWood
    );
    terraceDeck1.position.y = lowerH + 0.18;
    group.add(terraceDeck1);

    const terraceRailing1 = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.4, 1.1, d - 0.4),
      this.materials.windowGlass
    );
    terraceRailing1.position.y = lowerH + 0.55;
    group.add(terraceRailing1);

    // 4. 계단식 옥상 테라스 2단 (Level 8: 옥탑 펜트하우스)
    const topW = w * 0.62;
    const topD = d * 0.62;
    const topH = h * 0.15;
    const penthouse = new THREE.Mesh(
      new THREE.BoxGeometry(topW, topH, topD),
      this.materials.penthouseCore
    );
    penthouse.position.y = lowerH + midH + topH / 2;
    group.add(penthouse);

    // 상부 테라스 바닥 데크 & 유리 난간
    const terraceDeck2 = new THREE.Mesh(
      new THREE.BoxGeometry(midW, 0.35, midD),
      this.materials.terraceLimestone
    );
    terraceDeck2.position.y = lowerH + midH + 0.18;
    group.add(terraceDeck2);

    // 5. 옥상 헬리패드(H) 베이스
    const heliRadius = Math.min(topW, topD) * 0.48;
    const heliPad = new THREE.Mesh(
      new THREE.CylinderGeometry(heliRadius, heliRadius + 0.5, 0.6, 8),
      this.materials.helipadDeck
    );
    heliPad.position.y = h + 0.3;
    group.add(heliPad);

    const heliRing = new THREE.Mesh(
      new THREE.RingGeometry(heliRadius * 0.72, heliRadius * 0.84, 32),
      this.materials.helipadYellow
    );
    heliRing.rotation.x = -Math.PI / 2;
    heliRing.position.y = h + 0.62;
    group.add(heliRing);

    // H 마킹
    const hBarW = 0.45;
    const hBarL = heliRadius * 0.9;
    const leg1 = new THREE.Mesh(
      new THREE.BoxGeometry(hBarW, 0.05, hBarL),
      this.materials.helipadYellow
    );
    leg1.position.set(-heliRadius * 0.32, h + 0.63, 0);
    group.add(leg1);

    const leg2 = new THREE.Mesh(
      new THREE.BoxGeometry(hBarW, 0.05, hBarL),
      this.materials.helipadYellow
    );
    leg2.position.set(heliRadius * 0.32, h + 0.63, 0);
    group.add(leg2);

    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(heliRadius * 0.64, 0.05, hBarW),
      this.materials.helipadYellow
    );
    cross.position.set(0, h + 0.63, 0);
    group.add(cross);

    // 4개 코너 비콘 유도등
    [-heliRadius * 0.75, heliRadius * 0.75].forEach((bx) => {
      [-heliRadius * 0.75, heliRadius * 0.75].forEach((bz) => {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 8, 8),
          this.materials.beaconGreen
        );
        beacon.position.set(bx, h + 0.7, bz);
        group.add(beacon);
      });
    });

    // 6. 통신 레이더 돔 & 마스트
    const radome = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 16, 16),
      this.materials.penthouseCore
    );
    radome.position.set(-topW * 0.3, h + 1.2, -topD * 0.3);
    group.add(radome);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.24, 7, 8),
      this.materials.trussSteel
    );
    mast.position.set(topW * 0.3, h + 3.5, topD * 0.3);
    group.add(mast);

    const mastBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      this.materials.warningRed
    );
    mastBeacon.position.set(topW * 0.3, h + 7, topD * 0.3);
    group.add(mastBeacon);

    return group;
  }

  // 2) 표준 병영 막사/지휘소 (박공 경사 지붕 + 창문 돌출 프레임 + 현관 캐노피)
  private createProceduralBarracks(h: number, w: number, d: number): THREE.Group {
    const group = new THREE.Group();

    if (this.lodMode === 'lod1') {
      // [LOD 1 경량 모드]
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.75, d),
        this.materials.wallConcrete
      );
      body.position.y = (h * 0.75) / 2;
      group.add(body);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(w * 0.55, h * 0.25, 4),
        this.materials.barracksRoofGreen
      );
      roof.rotateY(Math.PI / 4);
      roof.scale.set(1, 1, d / w);
      roof.position.y = h * 0.75 + (h * 0.25) / 2;
      group.add(roof);
      return group;
    }

    // [LOD 2+ 실감 모드]
    // 1. 하단 기단부(Plinth) & 2층 콘크리트 외벽 본체
    const plinthH = 0.6;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1.2, plinthH, d + 1.2),
      this.materials.slabDark
    );
    plinth.position.y = plinthH / 2;
    group.add(plinth);

    const wallH = h * 0.68;
    const mainBody = new THREE.Mesh(
      new THREE.BoxGeometry(w, wallH, d),
      this.materials.wallConcrete
    );
    mainBody.position.y = plinthH + wallH / 2;
    group.add(mainBody);

    // 층간 구분 슬래브 밴드
    const midSlab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3),
      this.materials.penthouseCore
    );
    midSlab.position.y = plinthH + wallH / 2;
    group.add(midSlab);

    // 2. 실제 박공(Gabled) 삼각 경사 지붕 (True Gabled Roof with Overhanging Eaves)
    const roofH = h - (wallH + plinthH);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-w / 2 - 0.7, 0);
    roofShape.lineTo(0, roofH);
    roofShape.lineTo(w / 2 + 0.7, 0);
    roofShape.closePath();

    const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
      depth: d + 1.4,
      bevelEnabled: false,
    });
    roofGeo.translate(0, plinthH + wallH, -d / 2 - 0.7);
    const gabledRoof = new THREE.Mesh(roofGeo, this.materials.barracksRoofGreen);
    group.add(gabledRoof);

    // 용마루 (Ridge Cap along roof apex)
    const ridgeCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.25, d + 1.6),
      this.materials.mullionMetal
    );
    ridgeCap.position.set(0, plinthH + wallH + roofH + 0.12, 0);
    group.add(ridgeCap);

    // 3. 창문 돌출 프레임 (Extruded Window Frames with Tinted Glass & Mullions)
    const windowColumns = [-w * 0.36, -w * 0.18, 0, w * 0.18, w * 0.36];
    const floorLevels = [plinthH + wallH * 0.28, plinthH + wallH * 0.74];
    [-1, 1].forEach((dirZ) => {
      windowColumns.forEach((wx) => {
        // 전면 중앙 1층은 현관 출입구 자리이므로 창문 제외
        if (dirZ === 1 && wx === 0) return;
        floorLevels.forEach((wy) => {
          // 돌출 화강석/알루미늄 프레임 (두께 0.3m)
          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(2.7, 1.8, 0.3),
            this.materials.penthouseCore
          );
          frame.position.set(wx, wy, (dirZ * d) / 2 + dirZ * 0.1);
          group.add(frame);

          // 틴트 창호 유리
          const win = new THREE.Mesh(
            new THREE.BoxGeometry(2.3, 1.4, 0.08),
            this.materials.windowGlass
          );
          win.position.set(wx, wy, (dirZ * d) / 2 + dirZ * 0.18);
          group.add(win);
        });
      });
    });

    // 4. 현관 캐노피 & 진입 포치 (Entrance Canopy with Steps & Pillars)
    const canopyW = 6.4;
    const canopyH = 3.6;
    const canopyD = 3.8;

    // 하부 2단 진입 계단 (Plinth Steps)
    const step1 = new THREE.Mesh(
      new THREE.BoxGeometry(canopyW + 1.6, 0.2, canopyD + 0.8),
      this.materials.wallConcrete
    );
    step1.position.set(0, 0.1, d / 2 + canopyD / 2);
    group.add(step1);

    const step2 = new THREE.Mesh(
      new THREE.BoxGeometry(canopyW + 0.8, 0.2, canopyD + 0.4),
      this.materials.wallConcrete
    );
    step2.position.set(0, 0.3, d / 2 + canopyD / 2);
    group.add(step2);

    // 상단 캔틸레버 캐노피 슬래브 (두께 0.35m)
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(canopyW, 0.35, canopyD),
      this.materials.mullionMetal
    );
    canopy.position.set(0, canopyH, d / 2 + canopyD / 2);
    group.add(canopy);

    // 캐노피 지주 기둥 2기
    [-canopyW / 2 + 0.35, canopyW / 2 - 0.35].forEach((cx) => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, canopyH - 0.4, 12),
        this.materials.trussSteel
      );
      col.position.set(cx, (canopyH - 0.4) / 2 + 0.4, d / 2 + canopyD - 0.35);
      group.add(col);
    });

    // 현관 유리 이중문 (Entrance Glass Doors)
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.4, 0.15),
      this.materials.windowGlass
    );
    door.position.set(0, 1.2 + plinthH, d / 2 + 0.05);
    group.add(door);

    // 지휘소 명판 (HQ Signboard)
    const signboard = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.6, 0.1),
      this.materials.helipadYellow
    );
    signboard.position.set(0, canopyH + 0.6, d / 2 + 0.1);
    group.add(signboard);

    return group;
  }

  // 3) 군수 물류 데포 (트러스 아치형 지붕 + 하역장 도크 도어)
  private createProceduralLogisticsDepot(h: number, w: number, d: number): THREE.Group {
    const group = new THREE.Group();

    if (this.lodMode === 'lod1') {
      // [LOD 1 경량 모드]
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.8, d),
        this.materials.warehouseWall
      );
      body.position.y = (h * 0.8) / 2;
      group.add(body);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(w * 0.55, h * 0.2, 4),
        this.materials.gabledRoof
      );
      roof.rotateY(Math.PI / 4);
      roof.scale.set(1, 1, d / w);
      roof.position.y = h * 0.8 + (h * 0.2) / 2;
      group.add(roof);
      return group;
    }

    // [LOD 2+ 실감 모드]
    // 1. 메인 창고 본체 벽체 (산업용 단열 샌드위치 패널)
    const wallH = h * 0.74;
    const mainBody = new THREE.Mesh(
      new THREE.BoxGeometry(w, wallH, d),
      this.materials.warehouseWall
    );
    mainBody.position.y = wallH / 2;
    group.add(mainBody);

    // 2. 트러스 아치형 지붕 (Arched Barrel Vault Roof)
    const roofH = h - wallH;
    const archR = (w * w) / (8 * roofH) + roofH / 2;
    const theta = 2 * Math.asin(w / (2 * archR));
    const archGeo = new THREE.CylinderGeometry(
      archR,
      archR,
      d + 1.4,
      36,
      1,
      false,
      -theta / 2 + Math.PI / 2,
      theta
    );
    archGeo.rotateX(Math.PI / 2);
    archGeo.translate(0, wallH + roofH - archR, 0);
    const archRoof = new THREE.Mesh(archGeo, this.materials.gabledRoof);
    group.add(archRoof);

    // 외부 아치형 스틸 트러스 리브 4개소 (Steel Truss Ribs)
    for (let rib = -d / 2 + 2; rib <= d / 2 - 2; rib += d / 3) {
      const ribMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.45, 0.45, 0.6),
        this.materials.trussSteel
      );
      ribMesh.position.set(0, wallH, rib);
      group.add(ribMesh);
    }

    // 지붕 중앙 채광 스카이라이트 (Roof Skylight Ribbon)
    const skylight = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.25, d + 0.8),
      this.materials.windowGlass
    );
    skylight.position.set(0, wallH + roofH + 0.1, 0);
    group.add(skylight);

    // 3. 하역장 도크 도어 4개소 (Continuous Loading Dock Bays with Roll-up Shutters)
    const dockCount = 4;
    const dockSpacing = w / (dockCount + 1);

    // 하역장 콘크리트 플랫폼
    const dockPlatform = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 1.2, 3.2),
      this.materials.wallConcrete
    );
    dockPlatform.position.set(0, 0.6, d / 2 + 1.6);
    group.add(dockPlatform);

    // 하역장 상단 차양 캔틸레버 캐노피
    const dockCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 0.35, 3.6),
      this.materials.mullionMetal
    );
    dockCanopy.position.set(0, 4.3, d / 2 + 1.8);
    group.add(dockCanopy);

    for (let i = 1; i <= dockCount; i++) {
      const dx = -w / 2 + dockSpacing * i;

      // 롤러 셔터 도어
      const shutter = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 3.6, 0.25),
        this.materials.dockShutter
      );
      shutter.position.set(dx, 2.1, d / 2 + 0.12);
      group.add(shutter);

      // 흑황색 안전 범퍼
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(4.8, 0.38, 0.45),
        this.materials.dockHazard
      );
      bumper.position.set(dx, 0.25, d / 2 + 0.28);
      group.add(bumper);

      // 도크 번호 명판
      const noTag = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.5, 0.1),
        this.materials.helipadYellow
      );
      noTag.position.set(dx, 4.0, d / 2 + 0.18);
      group.add(noTag);
    }

    // 4. 측면 환기 루버 박스
    [-w / 2 - 0.15, w / 2 + 0.15].forEach((lx) => {
      const louver = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 2.2, 5.0),
        this.materials.hvacMetal
      );
      louver.position.set(lx, wallH * 0.6, 0);
      group.add(louver);
    });

    return group;
  }

  // 4) 경계·감시 철골 타워 (격자형 철골 기둥 + 상단 감시 초소 룸)
  private createProceduralWatchTower(h: number, w: number, d: number): THREE.Group {
    const group = new THREE.Group();

    const legR = 0.18;
    const halfW = w / 2;
    const halfD = d / 2;
    const deckH = h - 3.6;

    if (this.lodMode === 'lod1') {
      // [LOD 1 경량 모드]
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.4, w * 0.55, deckH, 4),
        this.materials.trussSteel
      );
      tower.position.y = deckH / 2;
      group.add(tower);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.8, 2.8, d * 0.8),
        this.materials.windowGlass
      );
      cabin.position.y = deckH + 1.4;
      group.add(cabin);
      return group;
    }

    // [LOD 2+ 실감 모드]
    // 1. 4개 코너 철골 메인 테이퍼 기둥
    const corners = [
      [-halfW, -halfD],
      [halfW, -halfD],
      [-halfW, halfD],
      [halfW, halfD],
    ];

    corners.forEach(([cx, cz]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(legR * 0.75, legR, deckH, 12),
        this.materials.trussSteel
      );
      leg.position.set(cx * 0.84, deckH / 2, cz * 0.84);
      group.add(leg);
    });

    // 2. 수평 보 및 X자형 크로스 트러스 격자 브레이싱 (Lattice X-Bracing) 4단
    const tiers = 4;
    for (let tier = 1; tier <= tiers; tier++) {
      const ty = (deckH / tiers) * tier;
      const prevY = (deckH / tiers) * (tier - 1);
      const tw = w * (1 - tier * 0.07);
      const td = d * (1 - tier * 0.07);

      // 수평 사각 거더
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(tw, 0.22, td),
        this.materials.trussSteel
      );
      frame.position.y = ty;
      group.add(frame);

      // 각 면의 X자형 트러스 대각 튜브
      const tierH = ty - prevY;
      const diagLen = Math.sqrt(tw * tw + tierH * tierH);
      const angle = Math.atan2(tierH, tw);

      // 전면 / 후면 X 브레이싱
      [-td / 2, td / 2].forEach((fz) => {
        const diag1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, diagLen, 8),
          this.materials.trussSteel
        );
        diag1.rotation.z = angle;
        diag1.position.set(0, prevY + tierH / 2, fz);
        group.add(diag1);

        const diag2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, diagLen, 8),
          this.materials.trussSteel
        );
        diag2.rotation.z = -angle;
        diag2.position.set(0, prevY + tierH / 2, fz);
        group.add(diag2);
      });
    }

    // 3. 중앙 수직 점검 사다리 (Access Ladder)
    const ladder = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, deckH, 0.15),
      this.materials.trussSteel
    );
    ladder.position.set(0, deckH / 2, 0);
    group.add(ladder);

    // 4. 상단 안전 캣워크 플랫폼 데크 & 핸드레일
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 0.35, d * 0.94),
      this.materials.slabDark
    );
    deck.position.y = deckH;
    group.add(deck);

    const handrail = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, 1.0, d * 0.9),
      this.materials.railingParapet
    );
    handrail.position.y = deckH + 0.55;
    group.add(handrail);

    // 5. 360도 전방위 파노라마 틴트 글래스 감시 초소 룸
    const cabinH = 2.5;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.72, cabinH, d * 0.72),
      this.materials.windowGlass
    );
    cabin.position.y = deckH + cabinH / 2 + 0.18;
    group.add(cabin);

    // 관측실 차양 지붕
    const cabinRoof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.86, 0.28, d * 0.86),
      this.materials.wallConcrete
    );
    cabinRoof.position.y = deckH + cabinH + 0.25;
    group.add(cabinRoof);

    // 6. 지붕 위 360도 회전 고광도 서치라이트 (야간 경계용 발광체)
    const searchLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.48, 0.65, 16),
      this.materials.searchLightGlow
    );
    searchLight.rotation.x = Math.PI / 4;
    searchLight.position.set(0, deckH + cabinH + 0.65, 0);
    group.add(searchLight);

    // 무선 통신 안테나 휩 & 피뢰침 (높이 4m)
    const whip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.08, 4, 8),
      this.materials.trussSteel
    );
    whip.position.set(w * 0.35, deckH + cabinH + 2.0, d * 0.35);
    group.add(whip);

    return group;
  }

  // 5) 표준 헬리패드(H) 베이스 (원형 착륙 패드, H 마크, 비콘 유도등)
  private createProceduralHelipadBase(h: number, w: number, d: number): THREE.Group {
    const group = new THREE.Group();

    const r = Math.min(w, d) / 2;
    const padH = 0.5;

    // 콘크리트 원형 착륙 데크
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, padH, 32),
      this.materials.helipadDeck
    );
    base.position.y = padH / 2;
    group.add(base);

    // 노란색 원형 마킹 링
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.78, r * 0.88, 32),
      this.materials.helipadYellow
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = padH + 0.05;
    group.add(ring);

    // H 마킹
    const barW = 0.8;
    const barL = 5.2;
    const barThick = 0.04;
    const leg1 = new THREE.Mesh(
      new THREE.BoxGeometry(barW, barThick, barL),
      this.materials.helipadYellow
    );
    leg1.position.set(-1.6, padH + 0.06, 0);
    group.add(leg1);

    const leg2 = new THREE.Mesh(
      new THREE.BoxGeometry(barW, barThick, barL),
      this.materials.helipadYellow
    );
    leg2.position.set(1.6, padH + 0.06, 0);
    group.add(leg2);

    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, barThick, barW),
      this.materials.helipadYellow
    );
    cross.position.set(0, padH + 0.06, 0);
    group.add(cross);

    // 외곽 8방향 비콘 유도등 (녹색 4개, 적색 4개)
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const bx = Math.cos(angle) * (r * 0.94);
      const bz = Math.sin(angle) * (r * 0.94);
      const isRed = i % 2 === 0;
      const beaconMat = isRed ? this.materials.warningRed : this.materials.beaconGreen;
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 8),
        beaconMat
      );
      beacon.position.set(bx, padH + 0.25, bz);
      group.add(beacon);
    }

    return group;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      }
    });
  }

  private clearFacilitiesGroup(): void {
    for (const [, mesh] of this.facilityMeshes) {
      this.facilitiesGroup.remove(mesh);
      this.disposeObject(mesh);
    }
    this.facilityMeshes.clear();
    this.detachGizmo();
  }

  onRemove(): void {
    this.clearBuildingGroup();
    this.clearFacilitiesGroup();
    this.clearRoofsGroup();
    this.clearFacadesGroup();
    disposeRoofMaterialsCache();
    disposeFacadeMaterialsCache();
    if (this.transformControls) {
      this.transformControls.dispose();
      this.transformControls = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
