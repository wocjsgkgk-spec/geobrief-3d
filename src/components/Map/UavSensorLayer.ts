'use client';

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { SurveillanceSensor, UavFlightState } from '@/types/map';

export interface UavTelemetry {
  coords: [number, number]; // [lng, lat]
  elevation: number;
  altitudeAgl: number;
  bearing: number;
  speedKmh: number;
  bankAngleDeg: number;
}

/**
 * [국방·보안 브리핑] UAV 3D 순찰 비행선 & 감시 센서 콘(Sensor FOV Frustum) Three.js 커스텀 레이어
 */
export class UavSensorLayer implements maplibregl.CustomLayerInterface {
  id = 'uav-sensor-custom-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  // 씬 그룹
  private sensorsGroup: THREE.Group = new THREE.Group();
  private uavGroup: THREE.Group = new THREE.Group();
  private pathLineGroup: THREE.Group = new THREE.Group();

  // 드론 내부 서브 부품
  private droneBody: THREE.Group = new THREE.Group();
  private propellers: THREE.Mesh[] = [];

  // 상태 보관
  private sensors: SurveillanceSensor[] = [];
  private uavState: UavFlightState = {
    isActive: false,
    cameraMode: 'orbit',
    speedKmh: 40,
    altitudeMeters: 80,
  };
  private sitePolygon: GeoJSON.Feature<GeoJSON.Polygon> | null = null;
  private siteCenter: [number, number] = [127.925, 37.342];

  // 비행 경로 곡선
  private flightCurve: THREE.CatmullRomCurve3 | null = null;
  private flightPathMercatorPoints: THREE.Vector3[] = [];
  private flightT = 0; // 0 ~ 1 루프 진행률
  private lastTimestamp = 0;
  private currentBankAngle = 0;

  // 펄스 애니메이션 시간
  private pulseTime = 0;
  private sensorMaterials: THREE.MeshStandardMaterial[] = [];

  // 텔레메트리 업데이트 콜백
  public onTelemetryUpdate?: (telemetry: UavTelemetry) => void;

  constructor() {
    this.scene.add(this.sensorsGroup);
    this.scene.add(this.pathLineGroup);
    this.scene.add(this.uavGroup);
    this.buildDroneModel();
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    // 조명 파이프라인
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, -50, 100).normalize();
    this.scene.add(dirLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambLight);

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
      console.warn('[UavSensorLayer] WebGLRenderer setup error:', err);
    }

    this.rebuildFlightPath();
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.map || !this.renderer) return;

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      // 1. MapLibre 뷰 행렬 바인딩
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(rawMatrix);

      const now = performance.now();
      const deltaSec = this.lastTimestamp ? Math.min((now - this.lastTimestamp) / 1000, 0.1) : 0.016;
      this.lastTimestamp = now;

      // TWEEN 갱신
      TWEEN.update();

      // 2. 센서 콘 펄스 애니메이션 (네온 그린 펄스 밝기 왕복)
      this.pulseTime += deltaSec * 2.5;
      const pulseIntensity = 0.25 + 0.18 * Math.sin(this.pulseTime);
      for (const mat of this.sensorMaterials) {
        mat.opacity = pulseIntensity;
      }

      // 3. 드론 비행 시뮬레이션 애니메이션
      if (this.uavState.isActive && this.flightCurve) {
        // 프로펠러 고속 회전 (분당 수천 회전)
        for (const prop of this.propellers) {
          prop.rotation.y += deltaSec * 35;
        }

        // 비행 속도 (km/h -> 진행률 t 증가)
        // 곡선 대략적인 둘레 3000m 기준
        const speedMps = (this.uavState.speedKmh * 1000) / 3600;
        const curveLengthMeters = 2500;
        const step = (speedMps * deltaSec) / curveLengthMeters;
        this.flightT = (this.flightT + step) % 1;

        // 현재 및 다음 지점 샘플링
        const ptCurrent = this.flightCurve.getPointAt(this.flightT);
        const tangent = this.flightCurve.getTangentAt(this.flightT).normalize();

        // 드론 위치 이동 (Mercator 좌표계)
        this.uavGroup.position.copy(ptCurrent);

        // 드론 방향 회전 (진행 방향을 정면으로 정렬)
        const lookTarget = ptCurrent.clone().add(tangent);
        this.uavGroup.lookAt(lookTarget);

        // 선회 시 Bank Turn (기울기 Roll) 연출
        const nextT = (this.flightT + 0.02) % 1;
        const nextTangent = this.flightCurve.getTangentAt(nextT).normalize();
        const crossZ = tangent.x * nextTangent.y - tangent.y * nextTangent.x;
        const targetBank = THREE.MathUtils.clamp(crossZ * 450, -0.4, 0.4);
        this.currentBankAngle += (targetBank - this.currentBankAngle) * 0.1;
        this.droneBody.rotation.z = -this.currentBankAngle;

        // 텔레메트리 계산
        const lngLat = this.mercatorToLngLat(ptCurrent.x, ptCurrent.y);
        let terrainElev = 120;
        if (this.map && this.map.queryTerrainElevation) {
          const e = this.map.queryTerrainElevation(lngLat);
          if (e !== null && e !== undefined) terrainElev = Math.round(e);
        }
        const headingDeg = (Math.atan2(tangent.x, -tangent.y) * 180) / Math.PI;
        const normalizedBearing = (headingDeg + 360) % 360;

        if (this.onTelemetryUpdate) {
          this.onTelemetryUpdate({
            coords: lngLat,
            elevation: terrainElev + this.uavState.altitudeMeters,
            altitudeAgl: this.uavState.altitudeMeters,
            bearing: Math.round(normalizedBearing),
            speedKmh: this.uavState.speedKmh,
            bankAngleDeg: Math.round(THREE.MathUtils.radToDeg(this.currentBankAngle)),
          });
        }

        // 1인칭 FPV 관측 시점 카메라 동기화
        if (this.uavState.cameraMode === 'fpv') {
          this.map.jumpTo({
            center: lngLat,
            bearing: normalizedBearing,
            pitch: 65,
          });
        }
      }

      // 4. WebGL 상태 복원 및 렌더링
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    } catch (renderErr) {
      console.warn('[UavSensorLayer] render error suppressed:', renderErr);
    }
  }

  /**
   * 감시 초소/CCTV 센서 콘(FOV Frustum) 재구축
   */
  public updateSensors(sensors: SurveillanceSensor[]): void {
    this.sensors = sensors;
    while (this.sensorsGroup.children.length > 0) {
      const c = this.sensorsGroup.children[0];
      this.sensorsGroup.remove(c);
    }
    this.sensorMaterials = [];

    for (const sensor of sensors) {
      const sensorMeshGroup = this.buildSensorConeMesh(sensor);
      this.sensorsGroup.add(sensorMeshGroup);
    }

    if (this.map) this.map.triggerRepaint();
  }

  /**
   * 단일 센서 콘 메쉬 그룹 생성 (기둥 + 카메라 헤드 + 3D Frustum 콘)
   */
  private buildSensorConeMesh(sensor: SurveillanceSensor): THREE.Group {
    const group = new THREE.Group();

    // 1. Mercator 위치 변환
    const mercator = maplibregl.MercatorCoordinate.fromLngLat(
      sensor.coords,
      sensor.elevation
    );
    const meterScale = mercator.meterInMercatorCoordinateUnits();

    group.position.set(mercator.x, mercator.y, mercator.z);
    group.scale.set(meterScale, meterScale, meterScale);

    // Three.js 좌표계(Y-Up) -> MapLibre Mercator(Z-Up) 회전
    group.rotation.x = Math.PI / 2;

    // 2. 초소/감시탑 기둥 메쉬 (Mast: 지름 1.2m x 높이 15m)
    const mastGeo = new THREE.CylinderGeometry(0.5, 0.7, sensor.mastHeightMeters, 12);
    const mastMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.3,
    });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = sensor.mastHeightMeters / 2;
    group.add(mast);

    // 3. 상단 감시 돔 카메라 헤드
    const domeGeo = new THREE.SphereGeometry(1.2, 16, 12);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.1,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = sensor.mastHeightMeters;
    group.add(dome);

    // 4. [반투명 3D 레이더 센서 콘 (Sensor Frustum)]
    // ConeGeometry: radius, height, radialSegments, heightSegments, openEnded
    const halfFovRad = THREE.MathUtils.degToRad(sensor.fovDegrees / 2);
    const coneHeight = sensor.rangeMeters;
    const coneRadius = coneHeight * Math.tan(halfFovRad);

    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);

    // 레이더 네온 그린 반투명 재질 (#10B981, opacity: 0.35)
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.35,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sensorMaterials.push(coneMat);

    const coneMesh = new THREE.Mesh(coneGeo, coneMat);

    // 콘 끝단 림 엣지 (원형 테두리 라인으로 가시성 극대화)
    const rimGeo = new THREE.RingGeometry(coneRadius * 0.98, coneRadius * 1.02, 32);
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -coneHeight / 2;
    coneMesh.add(rim);

    // 3개 방위 가이드라인
    const lineMat = new THREE.LineBasicMaterial({ color: 0x6ee7b7 });
    for (let angle = 0; angle < Math.PI * 2; angle += (Math.PI * 2) / 4) {
      const pts = [
        new THREE.Vector3(0, coneHeight / 2, 0),
        new THREE.Vector3(
          coneRadius * Math.cos(angle),
          -coneHeight / 2,
          coneRadius * Math.sin(angle)
        ),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(lineGeo, lineMat);
      coneMesh.add(line);
    }

    // 콘 회전 및 조준 (지면 방향 피치 틸트각 및 감시 방위각 적용)
    // Three.js Cone의 기본 꼭짓점은 +Y를 향하므로, 뒤집어서 거꾸로 지면을 찌르도록 조정
    const conePivot = new THREE.Group();
    conePivot.position.y = sensor.mastHeightMeters;

    coneMesh.position.y = -coneHeight / 2; // 꼭짓점을 피봇에 맞춤

    conePivot.rotation.y = THREE.MathUtils.degToRad(-sensor.yawDeg);
    conePivot.rotation.x = THREE.MathUtils.degToRad(sensor.pitchDeg);

    conePivot.add(coneMesh);
    group.add(conePivot);

    return group;
  }

  /**
   * 부지 경계 기반 UAV 비행 경로 곡선(Catmull-Rom Bezier) 재계산
   */
  public updateSitePolygon(
    poly: GeoJSON.Feature<GeoJSON.Polygon> | null,
    center: [number, number]
  ): void {
    this.sitePolygon = poly;
    this.siteCenter = center;
    this.rebuildFlightPath();
  }

  public updateUavState(state: Partial<UavFlightState>): void {
    this.uavState = { ...this.uavState, ...state };
    this.uavGroup.visible = this.uavState.isActive;
    this.pathLineGroup.visible = this.uavState.isActive;
    if (this.map) this.map.triggerRepaint();
  }

  private rebuildFlightPath(): void {
    while (this.pathLineGroup.children.length > 0) {
      const c = this.pathLineGroup.children[0];
      this.pathLineGroup.remove(c);
    }

    const waypointsLngLat: [number, number][] = [];
    const altAgl = this.uavState.altitudeMeters;

    if (
      this.sitePolygon &&
      this.sitePolygon.geometry &&
      this.sitePolygon.geometry.coordinates[0].length >= 4
    ) {
      // 부지 외곽 꼭짓점 기준 버퍼 순찰 경로
      const ring = this.sitePolygon.geometry.coordinates[0];
      const count = ring.length - 1;
      for (let i = 0; i < count; i++) {
        const p = ring[i];
        // 중심에서 외곽으로 1.3배 확장된 경로
        const lng = this.siteCenter[0] + (p[0] - this.siteCenter[0]) * 1.35;
        const lat = this.siteCenter[1] + (p[1] - this.siteCenter[1]) * 1.35;
        waypointsLngLat.push([lng, lat]);
      }
    } else {
      // 타원형 기본 비행 경로 (반경 약 600m)
      const rLng = 0.007;
      const rLat = 0.005;
      for (let i = 0; i < 6; i++) {
        const theta = (i / 6) * Math.PI * 2;
        const lng = this.siteCenter[0] + rLng * Math.cos(theta);
        const lat = this.siteCenter[1] + rLat * Math.sin(theta);
        waypointsLngLat.push([lng, lat]);
      }
    }

    if (waypointsLngLat.length < 3) return;

    // Mercator 좌표로 변환
    this.flightPathMercatorPoints = waypointsLngLat.map((pt) => {
      let elev = 140;
      if (this.map && this.map.queryTerrainElevation) {
        const e = this.map.queryTerrainElevation(pt);
        if (e !== null && e !== undefined) elev = Math.max(0, e);
      }
      const merc = maplibregl.MercatorCoordinate.fromLngLat(pt, elev + altAgl);
      return new THREE.Vector3(merc.x, merc.y, merc.z);
    });

    // 3D 폐곡선 베지에(Catmull-Rom) 생성
    this.flightCurve = new THREE.CatmullRomCurve3(
      this.flightPathMercatorPoints,
      true, // closed loop
      'centripetal',
      0.5
    );

    // 비행 궤적 리본 라인 메쉬 (네온 시안 #06B6D4)
    const pathSamples = this.flightCurve.getPoints(120);
    const pathGeo = new THREE.BufferGeometry().setFromPoints(pathSamples);
    const pathMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 2,
      transparent: true,
      opacity: 0.75,
    });
    const pathLine = new THREE.LineLoop(pathGeo, pathMat);
    this.pathLineGroup.add(pathLine);

    this.uavGroup.visible = this.uavState.isActive;
    this.pathLineGroup.visible = this.uavState.isActive;
  }

  /**
   * Three.js 정찰 드론(UAV) 3D 기체 모델 빌드 (쿼드콥터 + 짐벌 카메라 + 프로펠러)
   */
  private buildDroneModel(): void {
    const root = this.droneBody;
    const bodyScale = 4.5; // 가시성을 위해 적절한 브리핑 스케일

    // 1. 메인 퓨젤라지 동체 (카본 매트 다크 슬레이트)
    const bodyGeo = new THREE.BoxGeometry(1.6 * bodyScale, 0.45 * bodyScale, 2.2 * bodyScale);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    root.add(body);

    // 2. 4개 쿼드콥터 로터 암 (X자 프레임)
    const armGeo = new THREE.CylinderGeometry(0.12 * bodyScale, 0.12 * bodyScale, 3.8 * bodyScale, 8);
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.2,
    });

    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.z = Math.PI / 4;
    arm1.rotation.y = Math.PI / 2;
    root.add(arm1);

    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.z = -Math.PI / 4;
    arm2.rotation.y = Math.PI / 2;
    root.add(arm2);

    // 3. 4개 로터 모터 및 프로펠러 블레이드
    const motorGeo = new THREE.CylinderGeometry(0.25 * bodyScale, 0.25 * bodyScale, 0.4 * bodyScale, 12);
    const motorMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.8,
      roughness: 0.2,
    });

    const propGeo = new THREE.BoxGeometry(2.4 * bodyScale, 0.04 * bodyScale, 0.22 * bodyScale);
    const propMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.5,
      roughness: 0.3,
      transparent: true,
      opacity: 0.85,
    });

    const rotorPositions = [
      [1.35 * bodyScale, 0.2 * bodyScale, 1.35 * bodyScale],
      [-1.35 * bodyScale, 0.2 * bodyScale, 1.35 * bodyScale],
      [1.35 * bodyScale, 0.2 * bodyScale, -1.35 * bodyScale],
      [-1.35 * bodyScale, 0.2 * bodyScale, -1.35 * bodyScale],
    ];

    rotorPositions.forEach(([rx, ry, rz]) => {
      const motor = new THREE.Mesh(motorGeo, motorMat);
      motor.position.set(rx, ry, rz);
      root.add(motor);

      const prop = new THREE.Mesh(propGeo, propMat);
      prop.position.set(rx, ry + 0.25 * bodyScale, rz);
      root.add(prop);
      this.propellers.push(prop);
    });

    // 4. 하단 광학/적외선(FLIR) 3축 짐벌 카메라 돔
    const gimbalGeo = new THREE.SphereGeometry(0.42 * bodyScale, 16, 12);
    const gimbalMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // 감시 렌즈 글래스
      metalness: 0.95,
      roughness: 0.1,
    });
    const gimbal = new THREE.Mesh(gimbalGeo, gimbalMat);
    gimbal.position.set(0, -0.4 * bodyScale, 0.8 * bodyScale);
    root.add(gimbal);

    // 5. 항법 스트로브 비콘 (좌현 적색, 우현 녹색)
    const beaconRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * bodyScale, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    beaconRed.position.set(-1.4 * bodyScale, 0, 0);
    root.add(beaconRed);

    const beaconGreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * bodyScale, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    beaconGreen.position.set(1.4 * bodyScale, 0, 0);
    root.add(beaconGreen);

    // 드론 모델 전체를 Mercator 미터 스케일로 감싸서 uavGroup에 탑재
    // Three.js(Y-Up) -> Mercator(Z-Up)
    root.rotation.x = Math.PI / 2;

    const dummyWrapper = new THREE.Group();
    // 가시성을 위한 적정 스케일 (실제 드론 2m보다 약간 크게 브리핑 가시성 확보)
    dummyWrapper.scale.set(0.000008, 0.000008, 0.000008);
    dummyWrapper.add(root);
    this.uavGroup.add(dummyWrapper);
  }

  private mercatorToLngLat(x: number, y: number): [number, number] {
    const lng = x * 360 - 180;
    const y2 = 180 - y * 360;
    const lat = (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90;
    return [Math.round(lng * 100000) / 100000, Math.round(lat * 100000) / 100000];
  }

  onRemove(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.map = null;
  }
}
