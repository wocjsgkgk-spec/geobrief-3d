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
  private waterMaterial: THREE.ShaderMaterial | THREE.MeshStandardMaterial | null = null;

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
    // 8km x 8km 고해상도 수면 지오메트리 (128x128 서브디비전으로 자연스러운 잔물결 정점 파동)
    const geometry = new THREE.PlaneGeometry(
      this.planeSizeMeters,
      this.planeSizeMeters,
      128,
      128
    );

    // [강원권 수계 특화 Fresnel 수면 반사 셰이더]
    // - 소양강, 북한강, 섬강, 원주천, 남대천 등 청정 하천의 에메랄드/코발트 블루 (#0284c7 ~ #0369a1)
    // - 시선 각도에 따른 주변 산세/하늘빛 Fresnel 반사 (pow(1.0 - dot(N, V), 3.0))
    // - 강변 모래톱/둔치 경계 소프트 블렌딩
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeepWaterColor: { value: new THREE.Color(0x0369a1) },    // 심수 코발트 블루
        uShallowWaterColor: { value: new THREE.Color(0x38bdf8) }, // 천수/모래톱 수변 에메랄드
        uSkyReflectionColor: { value: new THREE.Color(0xe0f2fe) },// 주변 산세 & 하늘빛 반사
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // 실시간 수면 파동 애니메이션 (다중 사인파 노이즈 결합)
          float wave1 = sin(pos.x * 0.015 + uTime * 1.8) * cos(pos.y * 0.012 + uTime * 1.4) * 0.45;
          float wave2 = sin(pos.x * 0.040 - uTime * 2.3) * sin(pos.y * 0.035 + uTime * 1.9) * 0.20;
          float wave3 = cos((pos.x + pos.y) * 0.08 + uTime * 3.1) * 0.08;
          pos.z += wave1 + wave2 + wave3;

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPosition = worldPos.xyz;

          // 노멀 변위 근사
          float dWx = cos(pos.x * 0.015 + uTime * 1.8) * 0.015 * 0.45;
          float dWy = -sin(pos.y * 0.012 + uTime * 1.4) * 0.012 * 0.45;
          vec3 perturbedNormal = normalize(vec3(-dWx, -dWy, 1.0));
          vNormal = normalize(mat3(modelMatrix) * perturbedNormal);

          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uDeepWaterColor;
        uniform vec3 uShallowWaterColor;
        uniform vec3 uSkyReflectionColor;
        uniform vec3 uSunDir;
        uniform float uTime;

        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec2 vUv;

        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewDir);
          vec3 L = normalize(uSunDir);

          // 1. Fresnel 수면 반사 계수 (시선이 수평에 가까울수록 하늘빛/주변 산세 반사 극대화)
          float NdotV = max(dot(N, V), 0.0);
          float fresnel = pow(1.0 - NdotV, 3.2);

          // 2. 수면 베이스 컬러 (모래톱 천수 -> 깊은 심수 보간)
          float depthNoise = sin(vWorldPosition.x * 0.005) * cos(vWorldPosition.y * 0.005) * 0.5 + 0.5;
          vec3 waterBase = mix(uDeepWaterColor, uShallowWaterColor, depthNoise * 0.35);

          // 3. 하늘빛 및 주변 산세 반사 합성
          vec3 waterWithSky = mix(waterBase, uSkyReflectionColor, fresnel * 0.68);

          // 4. 태양광 스펙큘러 하이라이트 (Sun Glint / Ripple Specular)
          vec3 H = normalize(L + V);
          float NdotH = max(dot(N, H), 0.0);
          float specular = pow(NdotH, 64.0);
          vec3 sunGlint = vec3(1.0, 0.98, 0.90) * specular * 0.75;

          // 5. 모래톱/둔치 가장자리 부드러운 페이드 (Edge Blending)
          float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float edgeAlpha = smoothstep(0.0, 0.06, edgeDist);
          float finalAlpha = mix(0.58, 0.88, fresnel) * edgeAlpha;

          gl_FragColor = vec4(waterWithSky + sunGlint, finalAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.waterMesh = new THREE.Mesh(geometry, this.waterMaterial);
    this.scene.add(this.waterMesh);

    // 수면 반사/입체감을 위한 보조 조명
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
        const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
        this.renderer.setPixelRatio(pr);
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

      // 수면 반사광 잔물결 애니메이션 (uTime 갱신)
      this.animTime += 0.016;
      if (this.waterMaterial) {
        if ('uniforms' in this.waterMaterial && this.waterMaterial.uniforms.uTime) {
          this.waterMaterial.uniforms.uTime.value = this.animTime;
        } else {
          const pulse = Math.sin(this.animTime) * 0.03;
          this.waterMaterial.opacity = 0.45 + pulse;
        }
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
