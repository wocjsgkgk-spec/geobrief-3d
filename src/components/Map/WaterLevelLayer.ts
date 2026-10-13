import maplibregl from 'maplibre-gl';
import * as THREE from 'three';

/**
 * 강원권 지형 특화 저류·침수 수위(Water Level) 시뮬레이션 커스텀 레이어
 * - MapLibre WebGL 컨텍스트와 깊이 버퍼(Depth Buffer) 공유
 * - 설정된 해발고도(EL. m) 수평 수면 메쉬 렌더링
 * - 3D DEM 지형보다 낮은 저지대에 물이 차오르고 빠지는 수위 애니메이션
 */
export class WaterLevelLayer implements maplibregl.CustomLayerInterface {
  id = 'custom-water-level-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  private waterMesh: THREE.Mesh | null = null;
  private waterMaterial: THREE.MeshStandardMaterial | null = null;

  private isVisible = false;
  private targetElevation = 100; // 목표 해발고도 (m)
  private currentElevation = 100; // 보간 해발고도 (m)
  private centerLngLat: [number, number] = [127.925, 37.342];
  private planeSizeMeters = 8000; // 가로/세로 8km 수면 평면
  private animTime = 0;

  constructor() {
    this.initWaterMesh();
  }

  private initWaterMesh() {
    // 8km x 8km 고해상도 수면 지오메트리
    const geometry = new THREE.PlaneGeometry(
      this.planeSizeMeters,
      this.planeSizeMeters,
      32,
      32
    );

    // 반투명 에메랄드 블루(#0284C7) 수면 재질
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.48,
      roughness: 0.1,
      metalness: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false, // 투명 수면이므로 depthWrite를 false로 두어 지형과 자연스럽게 블렌딩
    });

    this.waterMesh = new THREE.Mesh(geometry, this.waterMaterial);
    this.scene.add(this.waterMesh);

    // 수면 반사/입체감을 위한 조명
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(50, -50, 100).normalize();
    this.scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x38bdf8, 0.6);
    this.scene.add(ambientLight);
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    try {
      this.map = map;

      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
          alpha: true,
        });
        this.renderer.autoClear = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } catch (err) {
        console.warn('[WaterLevelLayer] WebGLRenderer initialization warning:', err);
      }
    } catch (onAddErr) {
      console.warn('[WaterLevelLayer] onAdd error suppressed:', onAddErr);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer || !this.map) {
      return;
    }

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      // 수위 슬라이더 조작 시 부드러운 수위 상승/하강 보간 (Lerp)
      const diff = this.targetElevation - this.currentElevation;
      if (Math.abs(diff) > 0.05) {
        this.currentElevation += diff * 0.12;
        this.map.triggerRepaint();
      } else {
        this.currentElevation = this.targetElevation;
      }

      // 수면 반사광 잔물결 애니메이션
      this.animTime += 0.015;
      if (this.waterMaterial) {
        const pulse = Math.sin(this.animTime) * 0.03;
        this.waterMaterial.opacity = 0.45 + pulse;
      }

      // Mercator 좌표 변환 (지정된 해발고도 표고 적용)
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.centerLngLat,
        this.currentElevation
      );

      const meterScale = mercator.meterInMercatorCoordinateUnits();

      // Three.js Plane(XY)을 MapLibre 지표면 수평면으로 회전
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);

      // WebGL 상태 복원 및 렌더링
      const prevFbo = gl ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      }

      // 지형(DEM)과의 깊이 테스트를 위해 렌더 후 맵 리페인트 요청 (수위 변화 시)
      if (Math.abs(diff) > 0.05) {
        this.map.triggerRepaint();
      }
    } catch (e) {
      console.warn('[WaterLevelLayer] Render exception:', e);
    }
  }

  onRemove(): void {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      if (Array.isArray(this.waterMesh.material)) {
        this.waterMesh.material.forEach((m) => m.dispose());
      } else {
        this.waterMesh.material.dispose();
      }
      this.waterMesh = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  // 외부 제어 인터페이스
  public setVisible(visible: boolean) {
    this.isVisible = visible;
    this.map?.triggerRepaint();
  }

  public setElevation(elevationMeters: number) {
    this.targetElevation = elevationMeters;
    this.map?.triggerRepaint();
  }

  public setCenter(lngLat: [number, number]) {
    this.centerLngLat = lngLat;
    this.map?.triggerRepaint();
  }

  public getElevation(): number {
    return this.targetElevation;
  }
}
