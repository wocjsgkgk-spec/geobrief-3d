import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { BuildingMassPresetId } from '@/types/map';
import { buildPreset3DModel, loadExternalGLTFModel } from '@/utils/buildingModels3D';

/**
 * MapLibre GL JS용 Three.js 커스텀 3D 레이어 (CustomLayerInterface 구현)
 * - MapLibre WebGL 컨텍스트와 Three.js의 Scene / Camera / Directional Light 동기화
 * - 지형 고도(Terrain Elevation) 자동 매칭(Terrain Clamping)
 * - 대상 부지 중심점, 회전각, Bounding Box 크기에 맞춘 정밀 3D 모델 렌더링
 * - 외부 glTF / glb 모델 로딩 파이프라인 탑재
 */
export class ThreeDModelLayer implements maplibregl.CustomLayerInterface {
  id = 'custom-three-model-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private modelRoot: THREE.Group = new THREE.Group();
  private directionalLight: THREE.DirectionalLight | null = null;

  private isVisible = true;
  private currentPreset: BuildingMassPresetId | 'custom_gltf' | null = null;
  private originLngLat: [number, number] | null = null;
  private altitudeMeters = 0;
  private scaleRatio = 1;
  private rotationDeg = 0;

  constructor() {
    this.scene.add(this.modelRoot);
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    // 1. 태양광 및 앰비언트 조명 구축 (입체 음영비 극대화 & 소프트 섀도우)
    this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.6);
    this.directionalLight.position.set(80, -120, 150).normalize();
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 1;
    this.directionalLight.shadow.camera.far = 800;
    this.directionalLight.shadow.camera.left = -100;
    this.directionalLight.shadow.camera.right = 100;
    this.directionalLight.shadow.camera.top = 100;
    this.directionalLight.shadow.camera.bottom = -100;
    this.directionalLight.shadow.bias = -0.0005;
    this.directionalLight.shadow.normalBias = 0.02;
    this.scene.add(this.directionalLight);

    // 보조 채움광 (Fill Light - 반대편 대기 산란광)
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.5);
    fillLight.position.set(-80, 120, 90).normalize();
    this.scene.add(fillLight);

    // 전방향 환경광 (Ambient Light)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambientLight);

    // 2. Three.js WebGLRenderer 초기화 (소프트 섀도우 활성화)
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (err) {
      console.warn('[ThreeDModelLayer] WebGLRenderer initialization warning:', err);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.originLngLat || !this.renderer) {
      return;
    }

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;
      // 1. 위경도 + 해발고도를 Mercator 좌표계로 투영
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        this.altitudeMeters
      );

      // 2. Mercator 1m 단위 환산 스케일
      const meterScale = mercator.meterInMercatorCoordinateUnits() * this.scaleRatio;

      // 3. Three.js (Y-Up) 좌표계를 MapLibre Mercator (Z-Up, Y-South)로 변환
      // rotateX(PI/2): Three.js Y축을 하늘(Z) 방향으로 세움
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      // 모델 자체 회전각 (시계방향 방위각)
      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        (this.rotationDeg * Math.PI) / 180
      );

      // 4. 합성 변환 행렬 구성
      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);

      // 5. MapLibre의 WebGL 상태를 보존하며 Three.js 씬 렌더링
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    } catch (renderErr) {
      // 렌더 에러 시 지도 전체 중단 방지
      console.warn('[ThreeDModelLayer] render error suppressed:', renderErr);
    }
  }

  /**
   * 프리셋 모델 갱신 및 파라미터 적용
   */
  updatePresetModel(
    presetId: BuildingMassPresetId,
    center: [number, number],
    altitude: number,
    scaleRatio = 1,
    rotationDeg = 0
  ): void {
    this.originLngLat = center;
    this.altitudeMeters = altitude;
    this.scaleRatio = scaleRatio;
    this.rotationDeg = rotationDeg;

    // 기존 자식 노드 제거 및 메모리 해제
    this.clearModelRoot();

    // 신규 프리셋 빌드
    const newModel = buildPreset3DModel(presetId, 1);
    this.modelRoot.add(newModel);
    this.currentPreset = presetId;

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 외부 glTF/GLB 파일 비동기 로딩
   */
  async loadGLTF(
    url: string,
    center: [number, number],
    altitude: number,
    targetSize = 50,
    rotationDeg = 0
  ): Promise<void> {
    try {
      this.originLngLat = center;
      this.altitudeMeters = altitude;
      this.rotationDeg = rotationDeg;
      this.scaleRatio = 1;

      const gltfModel = await loadExternalGLTFModel(url, targetSize);
      this.clearModelRoot();
      this.modelRoot.add(gltfModel);
      this.currentPreset = 'custom_gltf';

      if (this.map) {
        this.map.triggerRepaint();
      }
    } catch (err) {
      console.error('[ThreeDModelLayer] Failed to load external glTF:', err);
      throw err;
    }
  }

  /**
   * 레이어 가시성 제어
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 고도 및 위치 실시간 미세 조정
   */
  updatePosition(center: [number, number], altitude: number, rotationDeg?: number): void {
    this.originLngLat = center;
    this.altitudeMeters = altitude;
    if (rotationDeg !== undefined) {
      this.rotationDeg = rotationDeg;
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 실시간 태양광 위치 및 조도/색온도 동기화 (그림자 회전 및 각도 갱신)
   */
  updateSunLight(directionalVector: [number, number, number], color: string, intensity: number): void {
    if (this.directionalLight) {
      this.directionalLight.position.set(
        directionalVector[0],
        directionalVector[1],
        directionalVector[2]
      ).normalize();
      this.directionalLight.color.set(color);
      this.directionalLight.intensity = Math.max(0.6, intensity * 1.8);
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  private clearModelRoot(): void {
    while (this.modelRoot.children.length > 0) {
      const obj = this.modelRoot.children[0];
      this.modelRoot.remove(obj);
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    }
  }

  onRemove(): void {
    this.clearModelRoot();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
