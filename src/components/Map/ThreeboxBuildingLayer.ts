import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BuildingMassPresetId, BUILDING_MASS_PRESETS } from '@/types/map';

/**
 * Threebox-MapLibre 연동 정밀 3D 건축물 커스텀 레이어
 * - EffectComposer 기반 SSAO(Screen Space Ambient Occlusion) 및 UnrealBloom 후처리 패스 결합
 * - Directional Shadow Cascades (2048x2048, bias -0.0001, 동적 뷰포트 추적)
 * - terrain: true & map.queryTerrainElevation 기반 실시간 지형 밀착(Terrain Clamping)
 * - glTF/GLB 파일 비동기 로드 및 부재 시 정밀 절차적 3D 건축물 폴백 생성기
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

  // 후처리 파이프라인
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private ssaoPass: SSAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private outputPass: OutputPass | null = null;
  private isPostProcessingEnabled = true;
  private lastWidth = 0;
  private lastHeight = 0;

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
  };

  constructor() {
    this.scene.add(this.buildingGroup);
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    // 1. Directional Light 그림자 셰이딩 강화 (2048x2048, bias -0.0001, 동적 뷰포트 추적)
    this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.2);
    this.directionalLight.position.set(120, -140, 160).normalize();
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

    // 환경광 (Ambient Light)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
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

      // 3. Three.js EffectComposer 기반 후처리 파이프라인 결합 (SSAO & UnrealBloom)
      this.initPostProcessing(map);
    } catch (err) {
      console.warn('[ThreeboxBuildingLayer] WebGLRenderer setup warning:', err);
    }
  }

  /**
   * Three.js EffectComposer 기반 SSAO 및 UnrealBloom 후처리 패스 결합
   */
  private initPostProcessing(map: maplibregl.Map): void {
    if (!this.renderer) return;

    try {
      const canvas = map.getCanvas();
      const width = canvas.clientWidth || 800;
      const height = canvas.clientHeight || 600;
      const pixelRatio = window.devicePixelRatio || 1;

      // 알파 투명도를 보존하는 렌더 타깃 (MapLibre 하부 지도 투과)
      const renderTarget = new THREE.WebGLRenderTarget(
        Math.floor(width * pixelRatio),
        Math.floor(height * pixelRatio),
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          stencilBuffer: false,
          depthBuffer: true,
        }
      );

      this.composer = new EffectComposer(this.renderer, renderTarget);
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);

      // (1) RenderPass (하부 캔버스 투과를 위해 clearAlpha: 0)
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.renderPass.clearAlpha = 0;
      this.renderPass.clear = true;
      this.composer.addPass(this.renderPass);

      // (2) SSAOPass (Screen Space Ambient Occlusion)
      // - 건물 하단, 모서리 틈새, 산악 계곡의 굴곡진 틈에 자연스러운 소프트 음영을 생성해 지형 밀착감 극대화
      // - kernelRadius: 0.8, minDistance: 0.005, maxDistance: 0.1
      this.ssaoPass = new SSAOPass(this.scene, this.camera, width, height);
      this.ssaoPass.kernelRadius = 0.8;
      this.ssaoPass.minDistance = 0.005;
      this.ssaoPass.maxDistance = 0.1;
      this.composer.addPass(this.ssaoPass);

      // (3) UnrealBloomPass (은은한 야간/하이라이트 블룸)
      // - 도로망 및 네온 지시선에 은은한 발광 효과 (strength: 0.35, radius: 0.4, threshold: 0.85)
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.35,
        0.4,
        0.85
      );
      this.composer.addPass(this.bloomPass);

      // (4) OutputPass (sRGB 색공간 톤매핑 & 감마 보정)
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);

      this.lastWidth = width;
      this.lastHeight = height;
    } catch (postErr) {
      console.warn('[ThreeboxBuildingLayer] Failed to initialize post-processing pipeline:', postErr);
      this.composer = null;
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.originLngLat || !this.renderer) {
      return;
    }

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      // 1. [지형 밀착 (Terrain Clamping)] 3D DEM 지형 표고 실시간 조회
      if (this.map && this.map.queryTerrainElevation) {
        const elev = this.map.queryTerrainElevation(this.originLngLat);
        if (elev !== null && elev !== undefined) {
          this.clampedAltitude = elev;
        }
      }

      // 2. Mercator 좌표계 투영 (지형 표고 상에 정확히 안착)
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        this.clampedAltitude
      );

      // 3. units: 'meters' 스케일 환산 (부지 면적 연동 스케일 비율)
      const meterScale = mercator.meterInMercatorCoordinateUnits() * this.scaleRatio;

      // 4. 좌표계 회전 변환 (Three.js Y-Up -> MapLibre Z-Up, 방위각 회전)
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        (this.rotationDeg * Math.PI) / 180
      );

      // 5. 복합 변환 행렬 구성
      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);
      // SSAOPass의 깊이 선형화 연산을 위한 역투영 행렬 동기화
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

      // 6. [Directional Shadow Cascades 동적 뷰포트 추적]
      if (this.directionalLight) {
        const halfBound = Math.max(80, 80 * this.scaleRatio);
        const cam = this.directionalLight.shadow.camera;
        cam.left = -halfBound;
        cam.right = halfBound;
        cam.top = halfBound;
        cam.bottom = -halfBound;
        cam.updateProjectionMatrix();
      }

      // 7. 뷰포트 리사이즈 감지 시 후처리 패스 버퍼 동기화
      if (this.map && this.composer) {
        const canvas = this.map.getCanvas();
        const curW = canvas.clientWidth;
        const curH = canvas.clientHeight;
        if (curW > 0 && curH > 0 && (curW !== this.lastWidth || curH !== this.lastHeight)) {
          this.lastWidth = curW;
          this.lastHeight = curH;
          this.composer.setSize(curW, curH);
          this.ssaoPass?.setSize(curW, curH);
          this.bloomPass?.setSize(curW, curH);
        }
      }

      // 8. WebGL 상태 보존 및 렌더링 (SSAO 후처리 파이프라인 또는 기본 렌더)
      this.renderer.resetState();

      if (this.isPostProcessingEnabled && this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
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

    if (this.map) {
      this.map.triggerRepaint();
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
   * 가시성 제어
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
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

  onRemove(): void {
    this.clearBuildingGroup();
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
