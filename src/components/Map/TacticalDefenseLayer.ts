'use client';

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import {
  ThreatDomeState,
  SecurityWallState,
  LosAnalysisState,
  LosAnalysisResult,
  LosPoint,
} from '@/types/map';

/**
 * [3단계 신규: 지휘통제 및 보안 관제]
 * - 1. 반구형 3D 레이더/방공 센서 탐지 돔 (Hemisphere Threat Dome)
 * - 2. 3D 수직 경계 울타리 / 보안벽 (Perimeter Security Curtain Wall)
 * - 3. 정밀 3D 가시선 (Line of Sight, LOS) DEM 레이캐스트 광선 분석
 */
export class TacticalDefenseLayer implements maplibregl.CustomLayerInterface {
  id = 'tactical-defense-custom-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  // 3개 하위 그룹
  private threatDomeGroup: THREE.Group = new THREE.Group();
  private securityWallGroup: THREE.Group = new THREE.Group();
  private losGroup: THREE.Group = new THREE.Group();

  // 레이더 스위프 빔 & 펄스 애니메이션 객체
  private radarSweepMesh: THREE.Mesh | null = null;
  private radarPulseMesh: THREE.Mesh | null = null;
  private wallMaterial: THREE.MeshBasicMaterial | null = null;
  private wallTexture: THREE.CanvasTexture | null = null;
  private losBlockedPulseMesh: THREE.Mesh | null = null;
  private losBlockedRotMesh: THREE.Mesh | null = null;
  private losClearPulseMesh: THREE.Group | null = null;
  private losClearStartPt: THREE.Vector3 = new THREE.Vector3();
  private losClearEndPt: THREE.Vector3 = new THREE.Vector3();

  // 상태 데이터 캐시
  private threatDomeState: ThreatDomeState = {
    enabled: false,
    coords: [127.925, 37.342],
    elevation: 100,
    radiusMeters: 3000,
    color: '#06B6D4',
  };
  private securityWallState: SecurityWallState = {
    enabled: false,
    heightMeters: 6,
    color: '#F59E0B',
    pulseSpeed: 0.3,
  };
  private losState: LosAnalysisState = {
    isActive: false,
    step: 'idle',
    pointA: null,
    pointB: null,
    result: null,
  };
  private polygonGeojson: GeoJSON.Feature<GeoJSON.Polygon> | null = null;

  // 애니메이션 타이머
  private lastTime = 0;
  private animTimer = 0;

  // 콜백
  private onLosCalculated?: (result: LosAnalysisResult) => void;
  private isVisible = true;

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.threatDomeGroup.visible = visible && this.threatDomeState.enabled;
    this.securityWallGroup.visible = visible && this.securityWallState.enabled;
    this.losGroup.visible = visible && this.losState.isActive;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  constructor() {
    this.scene.add(this.threatDomeGroup);
    this.scene.add(this.securityWallGroup);
    this.scene.add(this.losGroup);
  }

  setCallbacks(onLosCalculated: (result: LosAnalysisResult) => void): void {
    this.onLosCalculated = onLosCalculated;
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
        console.warn('[TacticalDefenseLayer] WebGLRenderer setup error:', err);
      }

      // 1. 보안벽 전용 동적 네온 사선 스트라이프 텍스처 생성
      this.initWallTexture();

      // 2. 초기 메쉬 빌드
      this.rebuildThreatDome();
      this.rebuildSecurityWall();
      this.rebuildLosRay();
    } catch (onAddErr) {
      console.warn('[TacticalDefenseLayer] onAdd error suppressed:', onAddErr);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.map || !this.renderer || !this.isVisible) return;

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(rawMatrix);

      const now = performance.now();
      const deltaSec = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) : 0.016;
      this.lastTime = now;
      this.animTimer += deltaSec;

      // 1. 레이더 스위프 빔 360도 회전 및 중심 펄스 애니메이션
      if (this.threatDomeState.enabled && this.radarSweepMesh) {
        this.radarSweepMesh.rotation.y += deltaSec * 1.5;

        if (this.radarPulseMesh) {
          const pulseScale = 1 + 0.35 * Math.sin(this.animTimer * 4);
          this.radarPulseMesh.scale.set(pulseScale, pulseScale, pulseScale);
        }
      }

      // 2. 3D 보안벽 상향 네온 펄스 텍스처 스크롤
      if (this.securityWallState.enabled && this.wallTexture) {
        this.wallTexture.offset.y += deltaSec * this.securityWallState.pulseSpeed;
      }

      // 3. LOS 시계 차단 지점 및 발광 펄스 애니메이션
      if (this.losClearPulseMesh) {
        const pulseT = (this.animTimer * 1.5) % 1.0;
        this.losClearPulseMesh.position.lerpVectors(
          this.losClearStartPt,
          this.losClearEndPt,
          pulseT
        );
      }

      if (this.losBlockedPulseMesh) {
        const s = 1 + 0.45 * Math.sin(this.animTimer * 6);
        this.losBlockedPulseMesh.scale.set(s, s, s);
      }

      if (this.losBlockedRotMesh) {
        this.losBlockedRotMesh.rotation.y += deltaSec * 3.0;
      }

      const prevFbo = gl ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      }

      // [온디맨드 렌더링 최적화] 정적 돔/벽체는 카메라 이동 시 MapLibre가 자동으로 렌더하므로 상시 렌더 루프 중단
      // (LOS 펄스 빔 애니메이션이 활성화되어 있을 때만 프레임 갱신)
      if (this.losClearPulseMesh || this.losBlockedPulseMesh) {
        this.map.triggerRepaint();
      }
    } catch (renderErr) {
      console.warn('[TacticalDefenseLayer] render error suppressed:', renderErr);
    }
  }

  // =========================================================================
  // 1. 반구형 3D 레이더/방공 센서 탐지 돔 (Hemisphere Threat Dome)
  // =========================================================================

  updateThreatDome(dome: ThreatDomeState): void {
    this.threatDomeState = { ...dome };
    this.rebuildThreatDome();
  }

  private rebuildThreatDome(): void {
    // 기존 메쉬 정리
    while (this.threatDomeGroup.children.length > 0) {
      const child = this.threatDomeGroup.children[0];
      this.threatDomeGroup.remove(child);
      this.disposeHierarchy(child);
    }
    this.radarSweepMesh = null;
    this.radarPulseMesh = null;

    if (!this.threatDomeState.enabled || !this.map) return;

    const { coords, elevation, radiusMeters, color } = this.threatDomeState;
    const baseColor = new THREE.Color(color || '#06B6D4');

    // Mercator 좌표계 정렬
    const mercator = maplibregl.MercatorCoordinate.fromLngLat(coords, elevation);
    const meterScale = mercator.meterInMercatorCoordinateUnits();

    const root = new THREE.Group();
    root.position.set(mercator.x, mercator.y, mercator.z);
    root.scale.set(meterScale, meterScale, meterScale);
    root.rotation.x = Math.PI / 2; // Y-Up -> Z-Up 정렬

    // (1) 3D 반구 기하구조 (SphereGeometry 상단 반구: theta 0 ~ PI/2)
    const sphereGeo = new THREE.SphereGeometry(
      radiusMeters,
      40,
      24,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );

    // 반투명 쉘 메쉬
    const shellMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shellMesh = new THREE.Mesh(sphereGeo, shellMat);
    root.add(shellMesh);

    // 위도/경도 와이어프레임 라인 메쉬
    const wireGeo = new THREE.WireframeGeometry(sphereGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: baseColor.clone().offsetHSL(0, 0, 0.15),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const wireSegments = new THREE.LineSegments(wireGeo, wireMat);
    root.add(wireSegments);

    // (2) 바닥 레이더 등간격 동심 링 (25%, 50%, 75%, 100%)
    [0.25, 0.5, 0.75, 1.0].forEach((ratio) => {
      const r = radiusMeters * ratio;
      const ringGeo = new THREE.RingGeometry(r * 0.995, r * 1.005, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: ratio === 1.0 ? 0.75 : 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.5;
      root.add(ring);
    });

    // 바닥 십자 방위 축선 (Crosshair Azimuth Axis)
    const axisMat = new THREE.LineBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const axisGeoX = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-radiusMeters, 0.5, 0),
      new THREE.Vector3(radiusMeters, 0.5, 0),
    ]);
    const axisGeoZ = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.5, -radiusMeters),
      new THREE.Vector3(0, 0.5, radiusMeters),
    ]);
    root.add(new THREE.Line(axisGeoX, axisMat));
    root.add(new THREE.Line(axisGeoZ, axisMat));

    // (3) 레이더 스위프(Sweep) 360도 회전 빔 부채꼴 메쉬 (45도 섹터)
    const sweepGroup = new THREE.Group();
    const sweepGeo = new THREE.CircleGeometry(radiusMeters, 32, 0, Math.PI / 4);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: baseColor.clone().offsetHSL(0, 0, 0.25),
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const sweepCircle = new THREE.Mesh(sweepGeo, sweepMat);
    sweepCircle.rotation.x = -Math.PI / 2;
    sweepCircle.position.y = 0.8;
    sweepGroup.add(sweepCircle);

    // 수직 회전 빔 평면 (Vertical Fan Beam)
    const vertFanGeo = new THREE.BufferGeometry();
    const vertVerts = new Float32Array([
      0, 0, 0,
      radiusMeters, 0, 0,
      0, radiusMeters, 0,
    ]);
    vertFanGeo.setAttribute('position', new THREE.BufferAttribute(vertVerts, 3));
    const vertFanMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const vertFanMesh = new THREE.Mesh(vertFanGeo, vertFanMat);
    sweepGroup.add(vertFanMesh);

    root.add(sweepGroup);
    this.radarSweepMesh = sweepGroup as unknown as THREE.Mesh;

    // (4) 레이더 중심 송신탑 및 펄스 코어 구체
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radiusMeters * 0.025, 16, 16), coreMat);
    coreMesh.position.y = radiusMeters * 0.03;
    root.add(coreMesh);

    const pulseMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.6,
      wireframe: true,
    });
    const pulseMesh = new THREE.Mesh(new THREE.SphereGeometry(radiusMeters * 0.045, 16, 16), pulseMat);
    pulseMesh.position.y = radiusMeters * 0.03;
    root.add(pulseMesh);
    this.radarPulseMesh = pulseMesh;

    this.threatDomeGroup.add(root);
    this.map.triggerRepaint();
  }

  // =========================================================================
  // 2. 3D 수직 경계 울타리 / 보안벽 (Perimeter Security Wall)
  // =========================================================================

  updateSecurityWall(
    wall: SecurityWallState,
    polygon: GeoJSON.Feature<GeoJSON.Polygon> | null
  ): void {
    this.securityWallState = { ...wall };
    this.polygonGeojson = polygon;
    this.rebuildSecurityWall();
  }

  private initWallTexture(): void {
    // 256x256 캔버스에 사선 군사 경고 스트라이프 및 상향 그라데이션 그리기
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 배경: 상향 네온 그라데이션 (하단: 반투명, 상단: 밝은 네온)
    const grad = ctx.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
    grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.45)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // 사선 보안 스트라이프 (/ / / /)
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 14;
    for (let x = -256; x < 512; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.lineTo(x + 256, 0);
      ctx.stroke();
    }

    // 최상단 경계선 볼드 라인
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 256, 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 1);

    this.wallTexture = texture;
    this.wallMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(this.securityWallState.color || '#F59E0B'),
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  private rebuildSecurityWall(): void {
    while (this.securityWallGroup.children.length > 0) {
      const child = this.securityWallGroup.children[0];
      this.securityWallGroup.remove(child);
      this.disposeHierarchy(child);
    }

    if (
      !this.securityWallState.enabled ||
      !this.polygonGeojson ||
      !this.map ||
      !this.wallMaterial
    ) {
      return;
    }

    const coords = this.polygonGeojson.geometry.coordinates[0];
    if (!coords || coords.length < 3) return;

    const wallHeight = this.securityWallState.heightMeters || 6;
    this.wallMaterial.color.set(this.securityWallState.color || '#F59E0B');

    // 쿼드 스트립 정점 생성 (지면 하단점과 상단점 연결)
    const positions: number[] = [];
    const uvs: number[] = [];
    const topPoints: THREE.Vector3[] = [];

    let totalLenMeters = 0;
    const mercatorPoints: { bottom: THREE.Vector3; top: THREE.Vector3 }[] = [];

    for (let i = 0; i < coords.length; i++) {
      const pt = coords[i];
      let elev = 0;
      if (this.map.queryTerrainElevation) {
        const queryVal = this.map.queryTerrainElevation(pt as [number, number]);
        if (queryVal !== null && queryVal !== undefined) {
          elev = queryVal;
        }
      }

      const mercBottom = maplibregl.MercatorCoordinate.fromLngLat(
        pt as [number, number],
        elev
      );
      const mercTop = maplibregl.MercatorCoordinate.fromLngLat(
        pt as [number, number],
        elev + wallHeight
      );

      mercatorPoints.push({
        bottom: new THREE.Vector3(mercBottom.x, mercBottom.y, mercBottom.z),
        top: new THREE.Vector3(mercTop.x, mercTop.y, mercTop.z),
      });

      topPoints.push(new THREE.Vector3(mercTop.x, mercTop.y, mercTop.z));

      if (i > 0) {
        const prevPt = coords[i - 1];
        const dx = (pt[0] - prevPt[0]) * 88000;
        const dy = (pt[1] - prevPt[1]) * 111000;
        totalLenMeters += Math.sqrt(dx * dx + dy * dy);
      }
    }

    // 쿼드 메쉬 버텍스 결합
    let currentLen = 0;
    for (let i = 0; i < mercatorPoints.length - 1; i++) {
      const p0 = mercatorPoints[i];
      const p1 = mercatorPoints[i + 1];

      const u0 = currentLen / 15; // 15m마다 텍스처 패턴 반복
      const pt0 = coords[i];
      const pt1 = coords[i + 1];
      const segLen = Math.hypot((pt1[0] - pt0[0]) * 88000, (pt1[1] - pt0[1]) * 111000);
      currentLen += segLen;
      const u1 = currentLen / 15;

      // 삼각형 1 (p0.bottom, p1.bottom, p0.top)
      positions.push(p0.bottom.x, p0.bottom.y, p0.bottom.z);
      uvs.push(u0, 0);
      positions.push(p1.bottom.x, p1.bottom.y, p1.bottom.z);
      uvs.push(u1, 0);
      positions.push(p0.top.x, p0.top.y, p0.top.z);
      uvs.push(u0, 1);

      // 삼각형 2 (p1.bottom, p1.top, p0.top)
      positions.push(p1.bottom.x, p1.bottom.y, p1.bottom.z);
      uvs.push(u1, 0);
      positions.push(p1.top.x, p1.top.y, p1.top.z);
      uvs.push(u1, 1);
      positions.push(p0.top.x, p0.top.y, p0.top.z);
      uvs.push(u0, 1);
    }

    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const wallMesh = new THREE.Mesh(wallGeo, this.wallMaterial);
    this.securityWallGroup.add(wallMesh);

    // 최상단 경계선 발광 네온 라인
    const topLineGeo = new THREE.BufferGeometry().setFromPoints(topPoints);
    const topLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const topLine = new THREE.Line(topLineGeo, topLineMat);
    this.securityWallGroup.add(topLine);

    this.map.triggerRepaint();
  }

  // =========================================================================
  // 3. 정밀 3D 가시선 (Line of Sight, LOS) DEM 레이캐스트 광선 분석
  // =========================================================================

  updateLosState(state: LosAnalysisState): void {
    this.losState = { ...state };
    this.rebuildLosRay();
  }

  private rebuildLosRay(): void {
    while (this.losGroup.children.length > 0) {
      const child = this.losGroup.children[0];
      this.losGroup.remove(child);
      this.disposeHierarchy(child);
    }
    this.losBlockedPulseMesh = null;
    this.losBlockedRotMesh = null;
    this.losClearPulseMesh = null;

    if (!this.map) return;
    const { pointA, pointB } = this.losState;
    if (!pointA) return;

    // 1. 관측점 A 단독 마커 렌더링
    const mercA = maplibregl.MercatorCoordinate.fromLngLat(
      pointA.coords,
      pointA.elevation + (pointA.heightOffset || 2.5)
    );
    const markerAMesh = this.buildPointMarker(
      mercA,
      '#10B981',
      pointA.coords,
      pointA.elevation,
      pointA.heightOffset || 2.5
    );
    this.losGroup.add(markerAMesh);

    if (!pointB) {
      this.map.triggerRepaint();
      return;
    }

    // 2. 목표점 B 마커 렌더링
    const mercB = maplibregl.MercatorCoordinate.fromLngLat(
      pointB.coords,
      pointB.elevation + (pointB.heightOffset || 1.8)
    );
    const markerBMesh = this.buildPointMarker(
      mercB,
      '#38BDF8',
      pointB.coords,
      pointB.elevation,
      pointB.heightOffset || 1.8
    );
    this.losGroup.add(markerBMesh);

    // 3. DEM 표고 광선 추적 (Terrarium DEM 지형 표고 5m 간격 정밀 샘플링)
    const startAlt = pointA.elevation + (pointA.heightOffset || 2.5);
    const endAlt = pointB.elevation + (pointB.heightOffset || 1.8);
    const dx = (pointB.coords[0] - pointA.coords[0]) * 88000;
    const dy = (pointB.coords[1] - pointA.coords[1]) * 111000;
    const horizDist = Math.hypot(dx, dy);
    const elevDiff = endAlt - startAlt;
    const directDist = Math.hypot(horizDist, elevDiff);

    // 5m 간격 정밀 샘플링 (최소 20개, 최대 1000개)
    const sampleInterval = 5.0;
    const samples = Math.max(20, Math.min(1000, Math.ceil(directDist / sampleInterval)));

    let isBlocked = false;
    let blockedT = 1.0;
    let blockedCoord: [number, number] = [0, 0];
    let blockedTerrainAlt = 0;
    let blockedRayAlt = 0;
    let maxObstacleElevation = Math.max(startAlt, endAlt);
    let maxPenetration = 0;

    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const curLng = pointA.coords[0] + t * (pointB.coords[0] - pointA.coords[0]);
      const curLat = pointA.coords[1] + t * (pointB.coords[1] - pointA.coords[1]);
      const curRayAlt = startAlt + t * (endAlt - startAlt);

      let curTerrainAlt = 0;
      if (this.map.queryTerrainElevation) {
        const queryVal = this.map.queryTerrainElevation([curLng, curLat]);
        if (queryVal !== null && queryVal !== undefined) {
          curTerrainAlt = queryVal;
        }
      }

      if (curTerrainAlt > maxObstacleElevation) {
        maxObstacleElevation = curTerrainAlt;
      }

      const pen = curTerrainAlt - curRayAlt;
      // 지형이 광선보다 0.5m 이상 높을 경우 시계 차단으로 판정
      if (pen > 0.5) {
        if (!isBlocked) {
          isBlocked = true;
          blockedT = t;
          blockedCoord = [curLng, curLat];
          blockedTerrainAlt = curTerrainAlt;
          blockedRayAlt = curRayAlt;
        }
        if (pen > maxPenetration) {
          maxPenetration = pen;
        }
      }
    }

    // 4. 결과 통계 및 콜백 통지
    if (this.onLosCalculated && this.losState.step === 'analyzed') {
      this.onLosCalculated({
        pointA,
        pointB,
        isClear: !isBlocked,
        distanceMeters: Math.round(directDist),
        horizontalDistanceMeters: Math.round(horizDist),
        elevationDiffMeters: Math.round(elevDiff),
        maxObstacleElevation: Math.round(maxObstacleElevation),
        maxPenetrationDepth: Math.round(maxPenetration * 10) / 10,
        samplingIntervalMeters: 5,
        blockedPoint: isBlocked
          ? {
              coords: blockedCoord,
              elevation: Math.round(blockedTerrainAlt),
              rayElevation: Math.round(blockedRayAlt),
              distanceFromA: Math.round(directDist * blockedT),
              t: blockedT,
              maxObstacleElevation: Math.round(maxObstacleElevation),
              maxPenetration: Math.round(maxPenetration * 10) / 10,
            }
          : undefined,
        samplingCount: samples,
        calculatedAt: Date.now(),
      });
    }

    // 5. 3D 가시선 빔 렌더링 & 발광 펄스
    if (!isBlocked) {
      // (1) 관측 성공: A부터 B까지 네온 그린(#10B981) 실선 빔
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mercA.x, mercA.y, mercA.z),
        new THREE.Vector3(mercB.x, mercB.y, mercB.z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      this.losGroup.add(new THREE.Line(lineGeo, lineMat));

      // 네온 그린 발광 펄스 패킷 (빛 알갱이의 실시간 광선 주사)
      const pulseGroup = new THREE.Group();
      const photon = new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x34d399 })
      );
      pulseGroup.add(photon);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(4.5, 6.5, 16),
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      halo.rotation.x = -Math.PI / 2;
      pulseGroup.add(halo);

      this.losGroup.add(pulseGroup);
      this.losClearPulseMesh = pulseGroup;
      this.losClearStartPt.set(mercA.x, mercA.y, mercA.z);
      this.losClearEndPt.set(mercB.x, mercB.y, mercB.z);
    } else {
      // (2) 관측 차단: A -> 차단점(네온 그린 실선 + 펄스), 차단점 -> B(붉은색 점선)
      const mercBlocked = maplibregl.MercatorCoordinate.fromLngLat(
        blockedCoord,
        blockedRayAlt
      );

      // A -> 차단점 (네온 그린 실선)
      const clearGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mercA.x, mercA.y, mercA.z),
        new THREE.Vector3(mercBlocked.x, mercBlocked.y, mercBlocked.z),
      ]);
      const clearMat = new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      this.losGroup.add(new THREE.Line(clearGeo, clearMat));

      // 네온 그린 발광 펄스 패킷
      const pulseGroup = new THREE.Group();
      const photon = new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x34d399 })
      );
      pulseGroup.add(photon);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(4.5, 6.5, 16),
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      halo.rotation.x = -Math.PI / 2;
      pulseGroup.add(halo);

      this.losGroup.add(pulseGroup);
      this.losClearPulseMesh = pulseGroup;
      this.losClearStartPt.set(mercA.x, mercA.y, mercA.z);
      this.losClearEndPt.set(mercBlocked.x, mercBlocked.y, mercBlocked.z);

      // 차단점 -> B (붉은색 점선 #EF4444)
      const blockedGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mercBlocked.x, mercBlocked.y, mercBlocked.z),
        new THREE.Vector3(mercB.x, mercB.y, mercB.z),
      ]);
      const blockedMat = new THREE.LineDashedMaterial({
        color: 0xef4444,
        dashSize: 4,
        gapSize: 2,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const blockedLine = new THREE.Line(blockedGeo, blockedMat);
      blockedLine.computeLineDistances();
      this.losGroup.add(blockedLine);

      // (3) [시계 차단 봉우리] 3D 경고 마커 & 능선 충돌 펄스 링 & 3D 라벨
      const meterScale = mercBlocked.meterInMercatorCoordinateUnits();
      const markerGroup = new THREE.Group();
      markerGroup.position.set(mercBlocked.x, mercBlocked.y, mercBlocked.z);
      markerGroup.scale.set(meterScale, meterScale, meterScale);
      markerGroup.rotation.x = Math.PI / 2;

      // 붉은색 역원추(Cone) 마커
      const coneGeo = new THREE.ConeGeometry(5, 14, 8);
      coneGeo.rotateX(Math.PI);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.9,
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.y = 10;
      markerGroup.add(coneMesh);

      // 3D 회전 다이아몬드 비컨 (Octahedron)
      const diamondGeo = new THREE.OctahedronGeometry(4.5, 0);
      const diamondMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        wireframe: false,
      });
      const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
      diamondMesh.position.y = 19;
      markerGroup.add(diamondMesh);
      this.losBlockedRotMesh = diamondMesh;

      // 지면까지 이어지는 수직 적색 점선 지시선
      const mercGround = maplibregl.MercatorCoordinate.fromLngLat(
        blockedCoord,
        blockedTerrainAlt
      );
      const groundLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mercBlocked.x, mercBlocked.y, mercBlocked.z),
        new THREE.Vector3(mercGround.x, mercGround.y, mercGround.z),
      ]);
      const groundLineMat = new THREE.LineBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.75,
      });
      this.losGroup.add(new THREE.Line(groundLineGeo, groundLineMat));

      // 차단점 충돌 펄스 링
      const pulseGeo = new THREE.RingGeometry(8, 11, 24);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      });
      const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
      pulseRing.rotation.x = -Math.PI / 2;
      markerGroup.add(pulseRing);
      this.losBlockedPulseMesh = pulseRing;

      // 3D 텍스트 빌보드 스프라이트 [⚠️ 시계 차단 봉우리 EL. xxx m]
      try {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 384;
        labelCanvas.height = 72;
        const lCtx = labelCanvas.getContext('2d');
        if (lCtx) {
          lCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          lCtx.beginPath();
          lCtx.roundRect(4, 4, 376, 64, 10);
          lCtx.fill();
          lCtx.strokeStyle = '#EF4444';
          lCtx.lineWidth = 3;
          lCtx.stroke();

          lCtx.fillStyle = '#EF4444';
          lCtx.fillRect(10, 10, 8, 52);

          lCtx.fillStyle = '#FFFFFF';
          lCtx.font = 'bold 22px sans-serif';
          lCtx.fillText(`⚠️ 시계 차단 봉우리 EL. ${Math.round(blockedTerrainAlt)}m`, 28, 44);
        }
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const spriteMat = new THREE.SpriteMaterial({
          map: labelTex,
          depthTest: false,
          transparent: true,
        });
        const labelSprite = new THREE.Sprite(spriteMat);
        labelSprite.scale.set(45, 9, 1);
        labelSprite.position.set(0, 28, 0);
        markerGroup.add(labelSprite);
      } catch (spriteErr) {
        // Sprite creation fallback
      }

      this.losGroup.add(markerGroup);
    }

    this.map.triggerRepaint();
  }

  /**
   * 관측점/목표점 3D 핀 마커 생성 헬퍼
   */
  private buildPointMarker(
    merc: maplibregl.MercatorCoordinate,
    hexColor: string,
    coords: [number, number],
    groundElev: number,
    heightOffset: number
  ): THREE.Group {
    const group = new THREE.Group();
    const meterScale = merc.meterInMercatorCoordinateUnits();

    // 지면에서 광선 높이까지 올라가는 수직 기둥
    const mercGround = maplibregl.MercatorCoordinate.fromLngLat(coords, groundElev);
    const stemGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(mercGround.x, mercGround.y, mercGround.z),
      new THREE.Vector3(merc.x, merc.y, merc.z),
    ]);
    const stemMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(hexColor),
      transparent: true,
      opacity: 0.8,
    });
    group.add(new THREE.Line(stemGeo, stemMat));

    // 상단 발광 구체 마커
    const headGroup = new THREE.Group();
    headGroup.position.set(merc.x, merc.y, merc.z);
    headGroup.scale.set(meterScale, meterScale, meterScale);
    headGroup.rotation.x = Math.PI / 2;

    const sphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hexColor) })
    );
    headGroup.add(sphereMesh);

    // 외곽 링
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(4.2, 5.2, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hexColor),
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    headGroup.add(ringMesh);

    group.add(headGroup);
    return group;
  }

  private disposeHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const m = child as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      }
    });
  }

  onRemove(): void {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      this.disposeHierarchy(child);
    }
    if (this.wallTexture) {
      this.wallTexture.dispose();
      this.wallTexture = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
