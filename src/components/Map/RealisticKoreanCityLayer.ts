/**
 * components/Map/RealisticKoreanCityLayer.ts
 *
 * [2단계: Three.js 단일 버퍼 기반 한국형 실사 포토 파사드 & 입체 지붕 메쉬 엔진]
 *
 * 1. 지도 로드 즉시 100% 가동되는 단일 버퍼 Three.js 커스텀 레이어 (Draw Call = 1):
 *    - 3D 지형 고도(map.queryTerrainElevation)를 건물 중심점 기준 1회 캐싱 반영하여 지형 위에 정확히 안착
 *    - 건물 높이(Height) 실측 복원 (납작한 건물 원천 금지):
 *      * 아파트 단지 구역(원주 우산동·학성동·단계동 등): 15층 ~ 25층 (45m ~ 75m)
 *      * 대로변 상가 및 오피스 빌딩: 4층 ~ 9층 (14m ~ 28m)
 *      * 밀집 주택가 다세대 빌라·단독주택 및 군 막사: 2층 ~ 4층 (7m ~ 13m)
 *
 * 2. 건물 외벽(Wall) & 지붕(Roof) 완전 분리 2048x2048 실사 Canvas 아틀라스 (anisotropy: 16):
 *    - 옆면(외벽):
 *      * 아파트(25m+): 긴 벽면(전·배면) 웜 아이보리/베란다 창호 격자 + 슬래브 음영, 짧은 측벽 창문 없는 콘크리트 및 브랜드 도색 줄무늬
 *      * 중층 상가: 1층(0~3.8m) 화강석 상가 쇼윈도 + 간판 밴드, 2층+ 석재 타일 & 커튼월
 *      * 저층 주택/군부대: 세월의 얼룩 적벽돌(#7c2d12), 회갈색 노후 콘크리트(#78716c), 베이지 회벽
 *    - 윗면(옥상):
 *      * 평슬래브 외곽 0.9m 콘크리트 난간(Parapet) 테두리 돌출
 *      * 옥상 바닥 항공사진 색감 4종 분포 (시멘트 슬래브 35%, 우레탄 세이지 그린 25%, 아스팔트 차콜 20%, 적갈색 기와 20%)
 *      * 중·고층 옥상 3.0m 엘리베이터 권상기실(옥탑방 코어)
 *      * 저층 주택 및 군 막사 ㅅ자형 경사 박공지붕(Gabled Roof) 메쉬
 *
 * 3. 렉 제로(60fps) 보장:
 *    - TypedArray 직접 할당(Float32Array) 및 단일 THREE.Mesh 렌더링
 *    - 이동 중 메쉬 재생성 차단(isMoving 가드), 이동 종료 후 300ms 디바운스
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import earcut from 'earcut';
import { extractCustomLayerMatrix } from '@/utils/customLayerMatrix';
import { elevationCache } from '@/utils/elevationCache';
import { SAMPLE_BUILDINGS } from '@/data/sampleBuildings';
import {
  getPhotorealisticCityAtlasTexture,
  getPhotorealisticSlotUV,
  UVRect,
} from '@/utils/photorealisticCityAtlas';
import {
  generateBuildingId,
  getMemoizedBuilding,
  parseAndClassifyBuilding,
} from '@/utils/gangwonSpatialAggregator';
import {
  calculateOBB,
  calculateSafeRooftopCore,
  generateGabledRoofMesh,
} from '@/lib/vendor/safeGeoAlgorithms';
import {
  classifyBuildingWithVendor,
  ClassifiedBuildingInfo,
} from '@/lib/vendor/buildingClassifier';
import { extractRenderedVectorBuildings } from '@/utils/spatialDataFetcher';
import { updateVworldPoisWithBuildings } from '@/utils/koreanPoiLayer';
import {
  createPhotorealisticPbrMaterial,
  updatePhotorealisticPbrUniforms,
} from '@/lib/vendor/photorealisticPbrShader';
import {
  buildAuthenticBridgeMeshGroup,
  WONJU_AUTHENTIC_BRIDGES,
} from '@/utils/authenticBridgeBuilder';

const Earcut = (earcut as any).default || earcut;

export interface RealisticKoreanCityLayerOptions {
  onBuildingCountChange?: (count: number) => void;
  maxBuildings?: number;
}

export class RealisticKoreanCityLayer implements maplibregl.CustomLayerInterface {
  public id = 'realistic-korean-city-layer';
  public type = 'custom' as const;
  public renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  // 단일 Draw Call을 위한 마스터 메쉬 및 재질
  private masterMesh: THREE.Mesh | null = null;
  private masterGeometry: THREE.BufferGeometry | null = null;
  private masterMaterial: THREE.MeshStandardMaterial | null = null;

  // 줌 14.5 ~ 15.5 정밀 페이드인을 위한 옥상 난간 및 옥탑 코어 메쉬/재질
  private rooftopMesh: THREE.Mesh | null = null;
  private rooftopGeometry: THREE.BufferGeometry | null = null;
  private rooftopMaterial: THREE.MeshStandardMaterial | null = null;

  // 조명 시스템
  private sunLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;

  // 좌표계 변환 원점 (안정적 앵커 유지)
  private originLngLat: [number, number] = [127.935, 37.359];
  private clampedAltitude: number = 0;
  private fixedOriginInitialized: boolean = false;

  // 상태 관리 및 증분 캐시
  private isVisible: boolean = true;
  private isMoving: boolean = false;
  private isBuildingGeometry: boolean = false;
  private pendingFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] | null = null;
  private moveEndTimer: NodeJS.Timeout | null = null;
  private cachedFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private vectorTileFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private externalFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private persistentBuildingMap: Map<string, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>> = new Map();
  private hasInitialBuilt: boolean = false;
  private options: RealisticKoreanCityLayerOptions;

  // 국토교통부 전국 교량 및 터널 3D 모델링 시스템
  private bridgeGroup: THREE.Group = new THREE.Group();
  private tunnelGroup: THREE.Group = new THREE.Group();
  private bridgeMaterial: THREE.MeshStandardMaterial | null = null;
  private guardrailMaterial: THREE.MeshStandardMaterial | null = null;
  private tunnelArchMaterial: THREE.MeshStandardMaterial | null = null;
  private tunnelInteriorMaterial: THREE.MeshBasicMaterial | null = null;
  private bridgesAndTunnelsData: any[] = [];
  private isBridgeTunnelVisible: boolean = true;

  // 60fps 무지연 렌더링을 위한 사전 할당 수학 객체 (GC 프리즈 방지)
  private renderMatrix = new THREE.Matrix4();
  private localMatrix = new THREE.Matrix4();
  private scaleVector = new THREE.Vector3();
  private rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  constructor(options: RealisticKoreanCityLayerOptions = {}) {
    this.options = options;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.masterMesh) {
      this.masterMesh.visible = visible;
    }
    if (this.rooftopMesh) {
      const z = this.map ? this.map.getZoom() : 15.0;
      const t = Math.max(0, Math.min(1, (z - 14.5) / 1.0));
      this.rooftopMesh.visible = visible && t > 0.01;
    }
    this.bridgeGroup.visible = visible && this.isBridgeTunnelVisible;
    this.tunnelGroup.visible = visible && this.isBridgeTunnelVisible;
  }

  public setBridgeTunnelVisible(visible: boolean): void {
    this.isBridgeTunnelVisible = visible;
    this.bridgeGroup.visible = visible;
    this.tunnelGroup.visible = visible;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public updateBridgesAndTunnels(items: any[]): void {
    if (!items || items.length === 0) return;
    this.bridgesAndTunnelsData = items;
    this.buildBridgesAndTunnelsMesh();
  }

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    try {
      // 1. 조명 설정 (한국 도심 자연광: 2.2배 주간 태양광 + 하늘빛 필라이트 + 1.2배 풍부한 환경광/헤미스피어)
      this.sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
      this.sunLight.position.set(120, 160, 90).normalize();
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);

      this.fillLight = new THREE.DirectionalLight(0xbae6fd, 0.95);
      this.fillLight.position.set(-100, 120, -80).normalize();
      this.scene.add(this.fillLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 1.20);
      this.scene.add(this.ambientLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xa0aec0, 1.20);
      this.scene.add(this.hemisphereLight);

      // 2. [GeoBrief 3D 2단계] 24종 아틀라스 & RMA 연동 PBR 실사 셰이더 메터리얼 초기화
      const atlasTex = getPhotorealisticCityAtlasTexture();
      this.masterMaterial = createPhotorealisticPbrMaterial({
        map: atlasTex || null,
        roughness: 0.85, // 콘크리트 무광 베이스 (창문 영역은 RMA 맵 및 PBR 인젝션으로 0.15로 동적 전환)
        metalness: 0.04, // (창문 영역은 0.85로 동적 전환)
        side: THREE.DoubleSide,
        sunDirection: this.sunLight?.position,
      });

      this.rooftopMaterial = createPhotorealisticPbrMaterial({
        map: atlasTex || null,
        roughness: 0.70,
        metalness: 0.05,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        sunDirection: this.sunLight?.position,
      });

      // 2-B. 국토교통부 전국 교량 및 터널 실사 PBR 재질 초기화
      this.bridgeMaterial = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1, // 밝은 콘크리트 그레이
        roughness: 0.55,
        metalness: 0.15,
        side: THREE.DoubleSide,
      });

      this.guardrailMaterial = new THREE.MeshStandardMaterial({
        color: 0x94a3b8, // 교량 방호벽 아연도금/콘크리트 난간
        roughness: 0.45,
        metalness: 0.35,
        side: THREE.DoubleSide,
      });

      this.tunnelArchMaterial = new THREE.MeshStandardMaterial({
        color: 0x94a3b8, // 터널 갱문 콘크리트 아치
        roughness: 0.65,
        metalness: 0.10,
        side: THREE.DoubleSide,
      });

      this.tunnelInteriorMaterial = new THREE.MeshBasicMaterial({
        color: 0x090d16, // 산악 터널 내부 암흑 캐비티
        side: THREE.DoubleSide,
      });

      this.bridgeGroup.visible = this.isBridgeTunnelVisible;
      this.tunnelGroup.visible = this.isBridgeTunnelVisible;
      this.scene.add(this.bridgeGroup);
      this.scene.add(this.tunnelGroup);

      // 3. WebGLRenderer 바인딩
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = false;
      const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.renderer.setPixelRatio(pr);

      // 4. 카메라 이동/회전 시 60fps 보호 이벤트 리스너 등록 (회전, 틸트, 줌 전체 감지)
      const moveStartEvents = ['movestart', 'rotatestart', 'pitchstart', 'zoomstart', 'dragstart'];
      const moveEndEvents = ['moveend', 'rotateend', 'pitchend', 'zoomend', 'dragend'];

      moveStartEvents.forEach((evt) => map.on(evt, this.handleMoveStart));
      moveEndEvents.forEach((evt) => map.on(evt, this.handleMoveEnd));

      map.on('idle', this.handleMapIdle);

      // 5. 초기 건물 데이터 즉시 추출 및 빌드 시도
      const center = map.getCenter();
      this.originLngLat = [center.lng, center.lat];
      this.extractAndBuildFromMap();
    } catch (err) {
      console.warn('[RealisticKoreanCityLayer] onAdd error:', err);
    }
  }

  private handleSourceData = (e: any): void => {
    if (
      (e.sourceId === 'openmaptiles-vector' || e.sourceId === 'openfreemap') &&
      e.isSourceLoaded &&
      this.vectorTileFeatures.length === 0 &&
      !this.isMoving
    ) {
      this.extractAndBuildFromMap();
    }
  };

  private handleMapIdle = (): void => {
    if (!this.hasInitialBuilt && !this.isMoving && this.map) {
      this.extractAndBuildFromMap();
    }
  };

  private handleMoveStart = (): void => {
    this.isMoving = true;
    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
      this.moveEndTimer = null;
    }
  };

  private handleMoveEnd = (): void => {
    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
    }
    // 350ms 디바운스 후 카메라 이동/회전이 완전히 멈춘 뒤에만 신규 영역 업데이트 (깜빡임 0%, 60fps 보장)
    this.moveEndTimer = setTimeout(() => {
      this.moveEndTimer = null;
      if (!this.map) return;
      if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
        return;
      }
      this.isMoving = false;
      this.extractAndBuildFromMap();
    }, 350);
  };

  public setInteracting(interacting: boolean): void {
    if (interacting) {
      this.handleMoveStart();
    } else {
      this.handleMoveEnd();
    }
  }

  /**
   * 벡터 타일 건물 피처(6,400여동)와 외부 실측 대장(WFS/Overpass) 피처 결합
   */
  private mergeBuildingFeatures(
    vecFeats: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    extFeats: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
  ): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] {
    if (!extFeats || extFeats.length === 0) return vecFeats;
    if (!vecFeats || vecFeats.length === 0) return extFeats;

    const result: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [...vecFeats];
    const seen = new Set<string>();

    for (let i = 0; i < vecFeats.length; i++) {
      const f = vecFeats[i];
      if (f.id) seen.add(String(f.id));
    }

    for (let j = 0; j < extFeats.length; j++) {
      const ext = extFeats[j];
      const extId = ext.id ? String(ext.id) : `ext-${j}`;
      if (!seen.has(extId)) {
        seen.add(extId);
        result.push(ext);
      }
    }

    return result;
  }

  /**
   * MapLibre 맵 소스 및 캐시로부터 화면 내 건물을 추출하여 3D 빌드 실행 (100% 입체화)
   */
  public extractAndBuildFromMap(): void {
    if (!this.map || this.isMoving || this.isBuildingGeometry) return;

    // 1) 뷰포트 내 MapLibre 벡터 타일 피처 전체 수집 (6,400+ 저층/중층 건물 100% 추출)
    try {
      const extracted = extractRenderedVectorBuildings(this.map);
      if (extracted && extracted.length > 0) {
        this.vectorTileFeatures = extracted;
      }
    } catch {}

    if (this.vectorTileFeatures.length === 0) {
      const vectorSources = ['openmaptiles-vector', 'openfreemap', 'openmaptiles'].filter((s) =>
        this.map?.getSource(s)
      );

      for (const srcId of vectorSources) {
        try {
          const srcFeats = this.map.querySourceFeatures(srcId, { sourceLayer: 'building' });
          if (srcFeats && srcFeats.length > 0) {
            this.vectorTileFeatures = srcFeats as any[];
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    // 2) 외부 실측 피처와 벡터 피처 스마트 결합 (건물 탈락 0%)
    const combined = this.mergeBuildingFeatures(this.vectorTileFeatures, this.externalFeatures);

    // [건물 ID 기반 증분 캐시 & 연산 100% 생략]
    let newFeaturesCount = 0;
    for (let i = 0; i < combined.length; i++) {
      const f = combined[i];
      const key = f.id
        ? String(f.id)
        : JSON.stringify(
            f.geometry.type === 'Polygon'
              ? f.geometry.coordinates[0]?.[0]
              : f.geometry.coordinates[0]?.[0]?.[0]
          );
      if (!this.persistentBuildingMap.has(key)) {
        this.persistentBuildingMap.set(key, f);
        newFeaturesCount++;
      }
    }

    // 이미 화면에 있는 건물은 연산을 100% 생략하여 끊김과 깜빡임 0% 달성
    if (this.masterMesh && newFeaturesCount === 0) {
      return;
    }

    this.cachedFeatures = Array.from(this.persistentBuildingMap.values());
    if (this.cachedFeatures.length === 0) {
      this.cachedFeatures = (SAMPLE_BUILDINGS?.features as any[]) || [];
    }

    if (this.cachedFeatures.length > 0) {
      this.hasInitialBuilt = true;
      this.buildRealisticCityMesh(this.cachedFeatures);
    }
  }

  public updateSunLight(
    dirOrAlt: [number, number, number] | THREE.Vector3 | number,
    colorOrAz?: string | number,
    intensity: number = 1.85
  ): void {
    if (!this.sunLight) return;
    if (typeof dirOrAlt === 'number' && typeof colorOrAz === 'number') {
      const radAlt = (dirOrAlt * Math.PI) / 180;
      const radAz = (colorOrAz * Math.PI) / 180;
      const x = Math.sin(radAz) * Math.cos(radAlt) * 150;
      const y = Math.sin(radAlt) * 150;
      const z = -Math.cos(radAz) * Math.cos(radAlt) * 150;
      this.sunLight.position.set(x, y, z).normalize();
    } else if (Array.isArray(dirOrAlt)) {
      this.sunLight.position.set(dirOrAlt[0], dirOrAlt[1], dirOrAlt[2]).normalize();
    } else if (dirOrAlt && typeof (dirOrAlt as any).x === 'number') {
      this.sunLight.position.copy(dirOrAlt as THREE.Vector3).normalize();
    }
    if (typeof colorOrAz === 'string') {
      this.sunLight.color.set(colorOrAz);
    }
    this.sunLight.intensity = Math.max(0.2, intensity);
  }

  /**
   * 외부 실측 공간정보 주입 진입점 (기존 벡터 타일 저층 건물과 완전 융합)
   */
  public updateBuildings(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    newOriginLngLat?: [number, number]
  ): void {
    if (!features || features.length === 0) return;
    this.externalFeatures = features;

    let newCount = 0;
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const key = f.id
        ? String(f.id)
        : JSON.stringify(
            f.geometry.type === 'Polygon'
              ? f.geometry.coordinates[0]?.[0]
              : f.geometry.coordinates[0]?.[0]?.[0]
          );
      const ex = this.persistentBuildingMap.get(key);
      if (!ex) {
        this.persistentBuildingMap.set(key, f);
        newCount++;
      } else {
        const exH = Number(ex.properties?.height || ex.properties?.hei || 0);
        const newH = Number(f.properties?.height || f.properties?.hei || 0);
        if (newH > exH + 0.5) {
          this.persistentBuildingMap.set(key, f);
          newCount++;
        }
      }
    }

    if (this.masterMesh && newCount === 0) {
      return;
    }

    this.cachedFeatures = Array.from(this.persistentBuildingMap.values());

    if (this.isBuildingGeometry) {
      this.pendingFeatures = this.cachedFeatures;
      return;
    }

    if (!this.isMoving) {
      this.buildRealisticCityMesh(this.cachedFeatures);
    }
  }

  /**
   * 단일 TypedArray 할당 기반 한국형 실사 3D 빌딩 지오메트리 빌더 (단일 Draw Call)
   */
  private buildRealisticCityMesh(
    rawFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
  ): void {
    if (!this.map || this.isBuildingGeometry) return;
    this.isBuildingGeometry = true;

    try {
      const map = this.map;
      const center = map.getCenter();

      // 고정 원점 유지: 35km 이내 이동/회전 시 원점을 고정하여 버텍스 지터링 및 좌표 튐 원천 방지
      if (!this.fixedOriginInitialized) {
        this.originLngLat = [center.lng, center.lat];
        this.fixedOriginInitialized = true;
      } else {
        const dLng = Math.abs(center.lng - this.originLngLat[0]);
        const dLat = Math.abs(center.lat - this.originLngLat[1]);
        if (dLng > 0.35 || dLat > 0.35) {
          this.originLngLat = [center.lng, center.lat];
        }
      }

      // 중심점 기준 지형 고도 캐싱 (DEM 타일 로드 상태 반영)
      const queriedAltitude =
        elevationCache.getFromMap(map, this.originLngLat) ||
        (map.queryTerrainElevation ? map.queryTerrainElevation(this.originLngLat) || 0 : 0);
      if (Number.isFinite(queriedAltitude) && queriedAltitude > 0) {
        this.clampedAltitude = queriedAltitude;
      }

      const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
      const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
      const metersPerLat = (Math.PI / 180) * 6378137;

      const maxLimit = this.options.maxBuildings || 35000;
      const features = rawFeatures.slice(0, maxLimit);

      // 슬롯별 UV 사전 캐싱
      const uvAptCream = getPhotorealisticSlotUV('apt_warm_cream');
      const uvAptBeige = getPhotorealisticSlotUV('apt_sand_beige');
      const uvAptGray = getPhotorealisticSlotUV('apt_warm_gray');
      const uvAptSide = getPhotorealisticSlotUV('apt_side');
      const uvCommShop = getPhotorealisticSlotUV('comm_ground_shop');
      const uvCommCurtain = getPhotorealisticSlotUV('comm_curtainwall');
      const uvCommGranite = getPhotorealisticSlotUV('comm_granite_beige');
      const uvVillaBrick = getPhotorealisticSlotUV('villa_red_brick');
      const uvVillaGranite = getPhotorealisticSlotUV('villa_granite');
      const uvMilitary = getPhotorealisticSlotUV('public_military');

      const uvRoofConcrete = getPhotorealisticSlotUV('roof_concrete_warmgray');
      const uvRoofAptSlab = getPhotorealisticSlotUV('roof_apt_slab');
      const uvRoofUrethane = getPhotorealisticSlotUV('roof_urethane_sage');
      const uvRoofAsphalt = getPhotorealisticSlotUV('roof_asphalt_charcoal');
      const uvRoofTile = getPhotorealisticSlotUV('roof_terracotta_tile');
      const uvRoofZinc = getPhotorealisticSlotUV('roof_zinc_blue');
      const uvParapet = getPhotorealisticSlotUV('parapet_concrete');
      const uvPenthouse = getPhotorealisticSlotUV('penthouse_wall');

      // 1. 단일 대용량 버퍼 사전 할당 (재할당/push 오버헤드 0%)
      const estimatedFloats = Math.min(features.length * 480, 4800000);
      let posBuf = new Float32Array(estimatedFloats);
      let normBuf = new Float32Array(estimatedFloats);
      let uvBuf = new Float32Array(Math.floor((estimatedFloats / 3) * 2));
      let heightBuf = new Float32Array(Math.floor(estimatedFloats / 3));

      let posIdx = 0;
      let uvIdx = 0;
      let heightIdx = 0;

      // 1-B. [3단계 신규] 줌 14.5 ~ 15.5 페이드인을 위한 옥상 난간 및 옥탑 코어 분리 버퍼
      const estRooftopFloats = Math.min(features.length * 120, 1200000);
      let rooftopPosBuf = new Float32Array(estRooftopFloats);
      let rooftopNormBuf = new Float32Array(estRooftopFloats);
      let rooftopUvBuf = new Float32Array(Math.floor((estRooftopFloats / 3) * 2));
      let rooftopHeightBuf = new Float32Array(Math.floor(estRooftopFloats / 3));
      let rooftopPosIdx = 0;
      let rooftopUvIdx = 0;
      let rooftopHeightIdx = 0;

      let currentBuildingBaseElev = 0;

      const ensureCapacity = (additionalVertices: number) => {
        const neededFloats = posIdx + additionalVertices * 3;
        if (neededFloats > posBuf.length) {
          const newSize = Math.max(posBuf.length * 2, neededFloats + 50000);
          const newPos = new Float32Array(newSize);
          const newNorm = new Float32Array(newSize);
          const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
          const newHeight = new Float32Array(Math.floor(newSize / 3));
          newPos.set(posBuf);
          newNorm.set(normBuf);
          newUv.set(uvBuf);
          newHeight.set(heightBuf);
          posBuf = newPos;
          normBuf = newNorm;
          uvBuf = newUv;
          heightBuf = newHeight;
        }
      };

      const ensureRooftopCapacity = (additionalVertices: number) => {
        const neededFloats = rooftopPosIdx + additionalVertices * 3;
        if (neededFloats > rooftopPosBuf.length) {
          const newSize = Math.max(rooftopPosBuf.length * 2, neededFloats + 30000);
          const newPos = new Float32Array(newSize);
          const newNorm = new Float32Array(newSize);
          const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
          const newHeight = new Float32Array(Math.floor(newSize / 3));
          newPos.set(rooftopPosBuf);
          newNorm.set(rooftopNormBuf);
          newUv.set(rooftopUvBuf);
          newHeight.set(rooftopHeightBuf);
          rooftopPosBuf = newPos;
          rooftopNormBuf = newNorm;
          rooftopUvBuf = newUv;
          rooftopHeightBuf = newHeight;
        }
      };

      const addTriangle = (
        p0: [number, number, number],
        p1: [number, number, number],
        p2: [number, number, number],
        norm: [number, number, number],
        uv0: [number, number],
        uv1: [number, number],
        uv2: [number, number]
      ) => {
        ensureCapacity(3);

        // v0
        posBuf[posIdx] = p0[0];
        posBuf[posIdx + 1] = p0[1];
        posBuf[posIdx + 2] = p0[2];
        normBuf[posIdx] = norm[0];
        normBuf[posIdx + 1] = norm[1];
        normBuf[posIdx + 2] = norm[2];
        uvBuf[uvIdx] = uv0[0];
        uvBuf[uvIdx + 1] = uv0[1];
        heightBuf[heightIdx] = Math.max(0, p0[1] - currentBuildingBaseElev);

        // v1
        posBuf[posIdx + 3] = p1[0];
        posBuf[posIdx + 4] = p1[1];
        posBuf[posIdx + 5] = p1[2];
        normBuf[posIdx + 3] = norm[0];
        normBuf[posIdx + 4] = norm[1];
        normBuf[posIdx + 5] = norm[2];
        uvBuf[uvIdx + 2] = uv1[0];
        uvBuf[uvIdx + 3] = uv1[1];
        heightBuf[heightIdx + 1] = Math.max(0, p1[1] - currentBuildingBaseElev);

        // v2
        posBuf[posIdx + 6] = p2[0];
        posBuf[posIdx + 7] = p2[1];
        posBuf[posIdx + 8] = p2[2];
        normBuf[posIdx + 6] = norm[0];
        normBuf[posIdx + 7] = norm[1];
        normBuf[posIdx + 8] = norm[2];
        uvBuf[uvIdx + 4] = uv2[0];
        uvBuf[uvIdx + 5] = uv2[1];
        heightBuf[heightIdx + 2] = Math.max(0, p2[1] - currentBuildingBaseElev);

        posIdx += 9;
        uvIdx += 6;
        heightIdx += 3;
      };

      const addQuad = (
        pBL: [number, number, number],
        pBR: [number, number, number],
        pTR: [number, number, number],
        pTL: [number, number, number],
        norm: [number, number, number],
        uvRect: UVRect
      ) => {
        // T1: BL -> BR -> TR
        addTriangle(
          pBL,
          pBR,
          pTR,
          norm,
          [uvRect.u0, uvRect.v0],
          [uvRect.u1, uvRect.v0],
          [uvRect.u1, uvRect.v1]
        );
        // T2: BL -> TR -> TL
        addTriangle(
          pBL,
          pTR,
          pTL,
          norm,
          [uvRect.u0, uvRect.v0],
          [uvRect.u1, uvRect.v1],
          [uvRect.u0, uvRect.v1]
        );
      };

      const addRooftopTriangle = (
        p0: [number, number, number],
        p1: [number, number, number],
        p2: [number, number, number],
        norm: [number, number, number],
        uv0: [number, number],
        uv1: [number, number],
        uv2: [number, number]
      ) => {
        ensureRooftopCapacity(3);

        rooftopPosBuf[rooftopPosIdx] = p0[0];
        rooftopPosBuf[rooftopPosIdx + 1] = p0[1];
        rooftopPosBuf[rooftopPosIdx + 2] = p0[2];
        rooftopNormBuf[rooftopPosIdx] = norm[0];
        rooftopNormBuf[rooftopPosIdx + 1] = norm[1];
        rooftopNormBuf[rooftopPosIdx + 2] = norm[2];
        rooftopUvBuf[rooftopUvIdx] = uv0[0];
        rooftopUvBuf[rooftopUvIdx + 1] = uv0[1];
        rooftopHeightBuf[rooftopHeightIdx] = Math.max(0, p0[1] - currentBuildingBaseElev);

        rooftopPosBuf[rooftopPosIdx + 3] = p1[0];
        rooftopPosBuf[rooftopPosIdx + 4] = p1[1];
        rooftopPosBuf[rooftopPosIdx + 5] = p1[2];
        rooftopNormBuf[rooftopPosIdx + 3] = norm[0];
        rooftopNormBuf[rooftopPosIdx + 4] = norm[1];
        rooftopNormBuf[rooftopPosIdx + 5] = norm[2];
        rooftopUvBuf[rooftopUvIdx + 2] = uv1[0];
        rooftopUvBuf[rooftopUvIdx + 3] = uv1[1];
        rooftopHeightBuf[rooftopHeightIdx + 1] = Math.max(0, p1[1] - currentBuildingBaseElev);

        rooftopPosBuf[rooftopPosIdx + 6] = p2[0];
        rooftopPosBuf[rooftopPosIdx + 7] = p2[1];
        rooftopPosBuf[rooftopPosIdx + 8] = p2[2];
        rooftopNormBuf[rooftopPosIdx + 6] = norm[0];
        rooftopNormBuf[rooftopPosIdx + 7] = norm[1];
        rooftopNormBuf[rooftopPosIdx + 8] = norm[2];
        rooftopUvBuf[rooftopUvIdx + 4] = uv2[0];
        rooftopUvBuf[rooftopUvIdx + 5] = uv2[1];
        rooftopHeightBuf[rooftopHeightIdx + 2] = Math.max(0, p2[1] - currentBuildingBaseElev);

        rooftopPosIdx += 9;
        rooftopUvIdx += 6;
        rooftopHeightIdx += 3;
      };

      const addRooftopQuad = (
        pBL: [number, number, number],
        pBR: [number, number, number],
        pTR: [number, number, number],
        pTL: [number, number, number],
        norm: [number, number, number],
        uvRect: UVRect
      ) => {
        // [3단계: 입체 지붕 조형 단일 메쉬 완전 결합]:
        // 옥상 난간(Parapet, 높이 0.9m) 및 엘리베이터 권상기실(2.8m 큐브)을 masterMesh에 물리적으로 직접 결합하여 단일 드로우콜(Draw Call = 1) 달성 및 줌 레벨 제한 없이 항시 100% 실사 표출
        addQuad(pBL, pBR, pTR, pTL, norm, uvRect);
      };

      let builtBuildingCount = 0;

      // -----------------------------------------------------------------------
      // 건물 피처 순회 및 정밀 기하 메쉬 생성
      // -----------------------------------------------------------------------
      for (let fIdx = 0; fIdx < features.length; fIdx++) {
        const feat = features[fIdx];
        if (!feat.geometry) continue;

        const rings: [number, number][][] = [];
        if (feat.geometry.type === 'Polygon') {
          rings.push(feat.geometry.coordinates[0] as [number, number][]);
        } else if (feat.geometry.type === 'MultiPolygon') {
          for (let p = 0; p < feat.geometry.coordinates.length; p++) {
            rings.push(feat.geometry.coordinates[p][0] as [number, number][]);
          }
        }

        for (let r = 0; r < rings.length; r++) {
          const rawCoords = rings[r];
          if (!rawCoords || rawCoords.length < 3) continue;

          // 2D 로컬 미터 좌표 환산
          const pts2D: { x: number; z: number }[] = [];
          let sumLng = 0,
            sumLat = 0;
          const len = rawCoords.length;

          for (let i = 0; i < len; i++) {
            if (i === len - 1 && len > 3) {
              const d0 = Math.abs(rawCoords[i][0] - rawCoords[0][0]);
              const d1 = Math.abs(rawCoords[i][1] - rawCoords[0][1]);
              if (d0 < 1e-7 && d1 < 1e-7) break;
            }
            const lng = rawCoords[i][0];
            const lat = rawCoords[i][1];
            sumLng += lng;
            sumLat += lat;

            const mx = (lng - this.originLngLat[0]) * metersPerLng;
            const mz = -(lat - this.originLngLat[1]) * metersPerLat;
            pts2D.push({ x: mx, z: mz });
          }

          if (pts2D.length < 3) continue;

          const ptCount = pts2D.length;
          const cLng = sumLng / ptCount;
          const cLat = sumLat / ptCount;

          // 면적 및 외곽 둘레 계산
          let area2D = 0;
          for (let i = 0; i < ptCount; i++) {
            const j = (i + 1) % ptCount;
            area2D += pts2D[i].x * pts2D[j].z - pts2D[j].x * pts2D[i].z;
          }
          const areaSqm = Math.max(10, Math.abs(area2D) * 0.5);

          // [요구사항 2] 바닥 면적이 4,500㎡를 초과하는 거대 구역 폴리곤(학교 운동장 포함 부지 전체, 아파트 단지 외곽 전체 경계, 군부대 부지 전체 경계 등) 3D 압출 즉시 제외
          if (areaSqm > 4500) {
            continue;
          }

          // [요구사항 2] 건물이 아닌 곳(연속지적도 필지, 용도지역, 공원/단지 landuse/leisure 경계) 3D 압출 100% 원천 차단
          const featProps = (feat.properties || {}) as Record<string, any>;
          const isNonBuildingTag =
            featProps.is_non_building === true ||
            featProps.is_site_boundary === true ||
            Boolean(featProps.UQ111 || featProps.UQ111_NM || featProps.uq111 || featProps.zoneName || featProps.zone_nm || featProps.spfc_nm || featProps.spfc_cd) ||
            Boolean(featProps.landuse || featProps.leisure || featProps.boundary || featProps.admin_level || featProps.natural) ||
            (Boolean(featProps.pnu || featProps.jimok || featProps.jibun) &&
              !featProps.bd_mgt_sn &&
              !featProps.buld_nm &&
              !featProps.bldNm &&
              !featProps.buildingName &&
              !featProps.grnd_flr &&
              !featProps.gro_flo_co &&
              !featProps.grndFlrCnt &&
              !featProps.hei &&
              !featProps.heit &&
              !featProps.height);

          if (isNonBuildingTag) {
            continue;
          }

          // 와인딩 오더 보정 (CCW)
          if (area2D < 0) {
            pts2D.reverse();
          }

          // 가장 긴 변과 짧은 변 계산 (판상형 아파트 vs 단독주택 기하 판별)
          let maxEdgeLen = 0;
          let minEdgeLen = Infinity;
          const edgeLens: number[] = [];
          for (let i = 0; i < ptCount; i++) {
            const j = (i + 1) % ptCount;
            const elen = Math.hypot(pts2D[j].x - pts2D[i].x, pts2D[j].z - pts2D[i].z);
            edgeLens.push(elen);
            if (elen > maxEdgeLen) maxEdgeLen = elen;
            if (elen < minEdgeLen) minEdgeLen = elen;
          }

          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const p of pts2D) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
          }
          const spanX = Math.max(1, maxX - minX);
          const spanZ = Math.max(1, maxZ - minZ);
          const minWidth = Math.min(spanX, spanZ);
          const maxLength = Math.max(spanX, spanZ);
          const polyAspectRatio = maxLength / Math.max(1, minWidth);

          // [벤더링 6대 분류기 적용] 좌표 시드 및 면적·형상 기반 절대 실패 없는 한국형 실측 분류
          const classified = classifyBuildingWithVendor(rawCoords, featProps);
          let height = classified.height;
          if (height <= 0) {
            continue;
          }

          // [절대 규칙 1: 세장비 제한 (Slenderness Ratio Limit)]
          // 어떤 건물이든 건물 바닥의 짧은 변 폭(minWidth) 대비 높이가 3.5배를 넘을 수 없음!
          const maxAllowedSlenderH = minWidth * 3.5;
          if (height > maxAllowedSlenderH) {
            height = Math.min(height, Math.max(6.5, maxAllowedSlenderH));
          }

          // [절대 규칙 2: 바닥 면적 280㎡ 미만 소형 건물은 절대로 고층(15m 이상) 불가!]
          // 주변에 아파트 POI가 있더라도 무조건 15m 이하로 엄격 제한!
          if (areaSqm < 280 && height > 15.0) {
            height = Math.min(15.0, areaSqm < 220 ? (6.5 + (classified.seed % 6) * 1.0) : (11.0 + (classified.seed % 5) * 0.9));
          }

          // [절대 규칙 3: 바닥 면적 220㎡ 미만 소형 필지는 무조건 6.5m ~ 11.5m (2~3.5층)]
          if (areaSqm < 220) {
            height = Math.min(height, 6.5 + (classified.seed % 6) * 1.0);
          } else if (areaSqm < 550 && height > 18.0 && (classified.type !== 'apartment' || polyAspectRatio < 2.2)) {
            height = 11.0 + (classified.seed % 8) * 1.0;
          }

          // [진짜 아파트 동 판정] 바닥면적 450㎡ 이상 & 고층(25m 이상)
          const isTrueHighRiseApt = classified.type === 'apartment' && height >= 25.0 && areaSqm >= 450;
          const isApt = isTrueHighRiseApt;
          const isComm = classified.type === 'commercial';
          const isMilitary = classified.type === 'military';

          // [요구사항 2] 측벽(창문 없는 벽) 처리는 오직 높이 25m 이상 고층 아파트에서 가장 짧은 양 끝단 2개의 변에만 적용!
          const sideWallEdgeIndices = new Set<number>();
          if (isTrueHighRiseApt && ptCount >= 4) {
            const sortedEdges = edgeLens
              .map((len, idx) => ({ idx, len }))
              .sort((a, b) => a.len - b.len);
            for (const item of sortedEdges) {
              if (sideWallEdgeIndices.size >= 2) break;
              if (item.len < maxEdgeLen * 0.75) {
                sideWallEdgeIndices.add(item.idx);
              }
            }
          }

          // 지형 표고 캐시 확인 및 안착 (clampedAltitude 기준 상대 표고)
          const rawElev =
            elevationCache.getFromMap(map, [cLng, cLat]) ||
            (map.queryTerrainElevation ? map.queryTerrainElevation([cLng, cLat]) || 0 : 0);
          const baseElev = rawElev - this.clampedAltitude;
          currentBuildingBaseElev = baseElev;
          const topElev = baseElev + height;

          // -------------------------------------------------------------------
          // A. 건물 외벽(Wall) 쿼드 생성 (한국 도심 실사 색감 매핑)
          // -------------------------------------------------------------------
          for (let i = 0; i < ptCount; i++) {
            const j = (i + 1) % ptCount;
            const p1 = pts2D[i];
            const p2 = pts2D[j];

            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const edgeLen = edgeLens[i];
            if (edgeLen < 0.2) continue;

            // 외벽 법선 벡터
            const nx = dz / edgeLen;
            const nz = -dx / edgeLen;

            let wallUV: UVRect = uvAptCream;

            if (isTrueHighRiseApt) {
              const isSideGableWall = sideWallEdgeIndices.has(i);
              if (isSideGableWall) {
                // [아파트 측벽] 오직 높이 25m 이상 고층 아파트의 가장 짧은 양 끝단 2개 변에만 적용: 매끈한 크림 콘크리트에 세로형 포인트 브랜드 컬러 스트라이프
                wallUV = uvAptSide;
                addQuad(
                  [p1.x, baseElev, p1.z],
                  [p2.x, baseElev, p2.z],
                  [p2.x, topElev, p2.z],
                  [p1.x, topElev, p1.z],
                  [nx, 0, nz],
                  wallUV
                );
              } else {
                // [아파트 정면·후면] 밝은 아이보리 외벽 위에 3.3m 층고마다 차콜 슬레이트 베란다 통유리창 격자 패턴 1:1 매핑
                wallUV = getPhotorealisticSlotUV(classified.atlasWallSlot);
                const floorHeight = 3.3; // 한국 아파트 표준 층고 3.3m
                const numFloors = Math.max(1, Math.round(height / floorHeight));
                const bayWidth = 7.5; // 베이 폭 7.5m
                const numBays = Math.max(1, Math.round(edgeLen / bayWidth));
                const dH = height / numFloors;

                for (let f = 0; f < numFloors; f++) {
                  const y0 = baseElev + f * dH;
                  const y1 = baseElev + (f + 1) * dH;

                  for (let b = 0; b < numBays; b++) {
                    const t0 = b / numBays;
                    const t1 = (b + 1) / numBays;

                    addQuad(
                      [p1.x + dx * t0, y0, p1.z + dz * t0],
                      [p1.x + dx * t1, y0, p1.z + dz * t1],
                      [p1.x + dx * t1, y1, p1.z + dz * t1],
                      [p1.x + dx * t0, y1, p1.z + dz * t0],
                      [nx, 0, nz],
                      wallUV
                    );
                  }
                }
              }
            } else if (classified.type === 'commercial' || classified.type === 'public' || height >= 11.0) {
              // 중층 시내 상가·원룸·오피스 블록 (10m <= H < 24m):
              // 1층(0~3.8m)은 짙은 화강석 쇼윈도 기단부(#334155), 2층 이상은 붉은 벽돌/황토 타일/화강암 석재
              const podiumH = 3.8;
              if (height > podiumH + 1.5) {
                const podiumTop = baseElev + podiumH;
                const pBL: [number, number, number] = [p1.x, baseElev, p1.z];
                const pBR: [number, number, number] = [p2.x, baseElev, p2.z];
                const pPodTR: [number, number, number] = [p2.x, podiumTop, p2.z];
                const pPodTL: [number, number, number] = [p1.x, podiumTop, p1.z];
                addQuad(pBL, pBR, pPodTR, pPodTL, [nx, 0, nz], uvCommShop);

                const upperUV = getPhotorealisticSlotUV(classified.atlasWallSlot);
                const upperH = height - podiumH;
                const numUpperFloors = Math.max(1, Math.round(upperH / 3.3));
                const dUH = upperH / numUpperFloors;

                for (let f = 0; f < numUpperFloors; f++) {
                  const y0 = podiumTop + f * dUH;
                  const y1 = podiumTop + (f + 1) * dUH;
                  addQuad(
                    [p1.x, y0, p1.z],
                    [p2.x, y0, p2.z],
                    [p2.x, y1, p2.z],
                    [p1.x, y1, p1.z],
                    [nx, 0, nz],
                    upperUV
                  );
                }
              } else {
                addQuad(
                  [p1.x, baseElev, p1.z],
                  [p2.x, baseElev, p2.z],
                  [p2.x, topElev, p2.z],
                  [p1.x, topElev, p1.z],
                  [nx, 0, nz],
                  uvCommShop
                );
              }
            } else if (classified.type === 'industrial') {
              // 산업단지·군수창고·대형공장: 단일 쿼드 메탈 판넬
              wallUV = getPhotorealisticSlotUV('facility_panel');
              addQuad(
                [p1.x, baseElev, p1.z],
                [p2.x, baseElev, p2.z],
                [p2.x, topElev, p2.z],
                [p1.x, topElev, p1.z],
                [nx, 0, nz],
                wallUV
              );
            } else if (classified.type === 'military') {
              // 군 영내 막사: 크림색 회벽
              wallUV = uvMilitary;
              addQuad(
                [p1.x, baseElev, p1.z],
                [p2.x, baseElev, p2.z],
                [p2.x, topElev, p2.z],
                [p1.x, topElev, p1.z],
                [nx, 0, nz],
                wallUV
              );
            } else {
              // 저층 단독주택 & 다세대 빌라 (높이 11m 미만: 따뜻한 적벽돌 #9a4632 및 크림색 회벽 #f0ead6)
              wallUV = getPhotorealisticSlotUV(classified.atlasWallSlot);
              addQuad(
                [p1.x, baseElev, p1.z],
                [p2.x, baseElev, p2.z],
                [p2.x, topElev, p2.z],
                [p1.x, topElev, p1.z],
                [nx, 0, nz],
                wallUV
              );
            }
          }

          // -------------------------------------------------------------------
          // B. 윗면(Roof) earcut 삼각분할 및 항공사진 실사 색감 매핑
          // -------------------------------------------------------------------
          const flatCoords: number[] = [];
          for (let i = 0; i < ptCount; i++) {
            flatCoords.push(pts2D[i].x, pts2D[i].z);
          }

          // [분류기 기반 한국 실제 지붕 재질 UV 즉시 할당 & 위성 실시간 색상 연동]
          let roofUV = getPhotorealisticSlotUV(classified.atlasRoofSlot);

          const bldId = String(feat.id || (feat.properties as any)?.buld_id || `${cLng.toFixed(5)}_${cLat.toFixed(5)}`);
          const memo = getMemoizedBuilding(bldId);
          const directRoofType = (feat.properties as any)?.roofType || memo?.roofColor?.roofType;
          const directRoofCol = (feat.properties as any)?.roofColour || (feat.properties as any)?.roofColor || memo?.roofColor?.hex;
          const roofCdNm = String((feat.properties as any)?.roofCdNm || (feat.properties as any)?.roof_cd_nm || '').toLowerCase();

          if (memo?.roofColor?.slotId !== undefined) {
            roofUV = getPhotorealisticSlotUV(memo.roofColor.slotId);
          } else if (directRoofType) {
            const slotMap: Record<string, string> = {
              urethane: 'roof_urethane_sage',
              concrete: 'roof_concrete_warmgray',
              zinc_blue: 'roof_zinc_blue',
              terracotta: 'roof_terracotta_tile',
              asphalt: 'roof_asphalt_charcoal',
            };
            if (slotMap[directRoofType]) {
              roofUV = getPhotorealisticSlotUV(slotMap[directRoofType]);
            }
          } else if (roofCdNm) {
            if (roofCdNm.includes('우레탄') || roofCdNm.includes('방수')) {
              roofUV = uvRoofUrethane;
            } else if (roofCdNm.includes('기와') || roofCdNm.includes('슁글') || roofCdNm.includes('적갈')) {
              roofUV = uvRoofTile;
            } else if (roofCdNm.includes('슬래브') || roofCdNm.includes('콘크리트') || roofCdNm.includes('평지붕')) {
              roofUV = isApt ? uvRoofAptSlab : uvRoofConcrete;
            } else if (roofCdNm.includes('강판') || roofCdNm.includes('징크') || roofCdNm.includes('철골')) {
              roofUV = uvRoofZinc;
            } else {
              const seedVal = classified.seed;
              if (seedVal < 40) {
                roofUV = uvRoofUrethane; // 우레탄 방수 딥그린 (40%)
              } else if (seedVal < 75) {
                roofUV = isApt ? uvRoofAptSlab : uvRoofConcrete; // 노후 콘크리트 슬래브 (35%)
              } else {
                roofUV = uvRoofTile; // 적갈색 기와/슁글 (25%)
              }
            }
          } else if (directRoofCol) {
            const low = String(directRoofCol).toLowerCase();
            if (low.includes('green') || low === '#15803d' || low === '#357a56' || low === '#32694f' || low === '#356854' || low === '#3d6b58' || low === '#3b6e5c') {
              roofUV = uvRoofUrethane;
            } else if (low.includes('blue') || low === '#254e7a' || low === '#2b5b84' || low === '#1e3a8a' || low === '#2563eb' || low === '#334e68') {
              roofUV = uvRoofZinc;
            } else if (low.includes('red') || low === '#7c3a27' || low === '#7c3829' || low === '#6e3222' || low === '#8c3b2b' || low === '#991b1b' || low === '#a84a32') {
              roofUV = uvRoofTile;
            } else if (low === '#57534e') {
              roofUV = uvRoofAptSlab;
            } else if (low === '#78716c' || low === '#736f68' || low === '#94a3b8') {
              roofUV = uvRoofConcrete;
            } else if (low === '#64748b' || low === '#334155' || low === '#1e293b') {
              roofUV = uvRoofAsphalt;
            } else {
              const seedVal = classified.seed;
              if (seedVal < 40) {
                roofUV = uvRoofUrethane;
              } else if (seedVal < 75) {
                roofUV = isApt ? uvRoofAptSlab : uvRoofConcrete;
              } else {
                roofUV = uvRoofTile;
              }
            }
          } else {
            // [V-World 옥상 실사화 40% : 35% : 25% 엄격 배분]:
            // 건물 고유 해시와 대장 지붕코드 미지정 시 도시 전역 1:1 매핑:
            // 1) 우레탄 방수 딥그린 (#32694f, 40%): seedVal < 40
            // 2) 노후 콘크리트 슬래브 (#736f68, 35%): seedVal < 75
            // 3) 적갈색 기와/슁글 (#7c3829, 25%): seedVal >= 75
            const seedVal = classified.seed;
            if (seedVal < 40) {
              roofUV = uvRoofUrethane; // ① 우레탄 방수 딥그린 (40%)
            } else if (seedVal < 75) {
              roofUV = isApt ? uvRoofAptSlab : uvRoofConcrete; // ② 노후 콘크리트 슬래브 (35%)
            } else {
              roofUV = uvRoofTile; // ③ 적갈색 기와/슁글 (25%)
            }
          }

          // -------------------------------------------------------------------
          // B & C. [GeoBrief 3D 3단계] 실제 입체 지붕 조형 다각화 (옥탑 코어 & 박공지붕 & 3D 난간)
          // -------------------------------------------------------------------
          const isGabled =
            (classified.type === 'residential' || classified.type === 'military' || classified.isGabledRoof) &&
            height <= 16.0;

          const poly2D: [number, number][] = [];
          for (let i = 0; i < ptCount; i++) {
            poly2D.push([pts2D[i].x, pts2D[i].z]);
          }

          if (isGabled) {
            // [1. 단독주택·다세대 빌라·군부대 막사: 장축을 따라 솟아오른 ㅅ자형 박공지붕(Gabled Roof)]
            // - 직사각형 평면의 장축을 따라 능선이 올라오는 실제 ㅅ자형 박공지붕 정점 생성
            // - 슬로프: 적갈색 기와(#7c3829, 60%) / 청회색 강판/슬레이트(#254e7a, 40%)
            // - 박공벽: 건물 외벽과 1:1 매칭되는 마감 텍스처
            const obb = calculateOBB(poly2D);
            const halfLen = obb.length / 2;
            const halfWid = obb.width / 2;
            const [ox, oz] = obb.origin;
            const [ux, uz] = obb.majorAxis;
            const [vx, vz] = obb.minorAxis;

            const ridgeH = Math.max(1.8, Math.min(3.4, obb.width * 0.40));
            const topY = topElev;
            const ridgeY = topElev + ridgeH;

            // 기와 색상: 적갈색 기와(60%) / 청회색 강판·슬레이트(40%)
            const gPick = classified.seed % 10;
            const gabledRoofUV = gPick < 6 ? uvRoofTile : uvRoofZinc;

            // 4개 처마 모서리점 (Eaves) at topY
            const e00: [number, number, number] = [ox - halfLen * ux - halfWid * vx, topY, oz - halfLen * uz - halfWid * vz];
            const e10: [number, number, number] = [ox + halfLen * ux - halfWid * vx, topY, oz + halfLen * uz - halfWid * vz];
            const e11: [number, number, number] = [ox + halfLen * ux + halfWid * vx, topY, oz + halfLen * uz + halfWid * vz];
            const e01: [number, number, number] = [ox - halfLen * ux + halfWid * vx, topY, oz - halfLen * uz + halfWid * vz];

            // 2개 용마루 정점 (Ridge line) at ridgeY
            const r0: [number, number, number] = [ox - halfLen * ux, ridgeY, oz - halfLen * uz];
            const r1: [number, number, number] = [ox + halfLen * ux, ridgeY, oz + halfLen * uz];

            // 슬로프 법선 벡터
            const hyp = Math.hypot(ridgeH, halfWid);
            const sinA = ridgeH / hyp;
            const cosA = halfWid / hyp;

            // 경사면 1 (-V 방향 슬로프): 법선 (-vx * sinA, cosA, -vz * sinA)
            const n1: [number, number, number] = [-vx * sinA, cosA, -vz * sinA];
            addQuad(e00, e10, r1, r0, n1, gabledRoofUV);

            // 경사면 2 (+V 방향 슬로프): 법선 (vx * sinA, cosA, vz * sinA)
            const n2: [number, number, number] = [vx * sinA, cosA, vz * sinA];
            addQuad(r0, r1, e11, e01, n2, gabledRoofUV);

            // 박공벽 1 (-U 방향 끝단 박공 삼각형)
            const bldWallUV = getPhotorealisticSlotUV(classified.atlasWallSlot);
            const n3: [number, number, number] = [-ux, 0, -uz];
            addTriangle(
              e01, e00, r0,
              n3,
              [bldWallUV.u0, bldWallUV.v0],
              [bldWallUV.u1, bldWallUV.v0],
              [(bldWallUV.u0 + bldWallUV.u1) * 0.5, bldWallUV.v1]
            );

            // 박공벽 2 (+U 방향 끝단 박공 삼각형)
            const n4: [number, number, number] = [ux, 0, uz];
            addTriangle(
              e10, e11, r1,
              n4,
              [bldWallUV.u0, bldWallUV.v0],
              [bldWallUV.u1, bldWallUV.v0],
              [(bldWallUV.u0 + bldWallUV.u1) * 0.5, bldWallUV.v1]
            );
          } else {
            // [2. 아파트 및 중대형 상업 빌딩: 평평한 뚜껑 제거 -> 침하형 옥상 슬래브 + 0.35m 돌출 난간 + 2.8m 옥탑 코어]
            // A. 지붕 슬래브 earcut 분할 (40% 우레탄 그린 / 35% 콘크리트 슬래브 / 25% 기와)
            const spanX = Math.max(1, maxX - minX);
            const spanZ = Math.max(1, maxZ - minZ);

            const triangles = Earcut(flatCoords, null, 2);
            for (let t = 0; t < triangles.length; t += 3) {
              const i0 = triangles[t];
              const i1 = triangles[t + 1];
              const i2 = triangles[t + 2];

              const pt0 = pts2D[i0];
              const pt1 = pts2D[i1];
              const pt2 = pts2D[i2];

              const uv0: [number, number] = [
                roofUV.u0 + ((pt0.x - minX) / spanX) * (roofUV.u1 - roofUV.u0),
                roofUV.v0 + ((pt0.z - minZ) / spanZ) * (roofUV.v1 - roofUV.v0),
              ];
              const uv1: [number, number] = [
                roofUV.u0 + ((pt1.x - minX) / spanX) * (roofUV.u1 - roofUV.u0),
                roofUV.v0 + ((pt1.z - minZ) / spanZ) * (roofUV.v1 - roofUV.v0),
              ];
              const uv2: [number, number] = [
                roofUV.u0 + ((pt2.x - minX) / spanX) * (roofUV.u1 - roofUV.u0),
                roofUV.v0 + ((pt2.z - minZ) / spanZ) * (roofUV.v1 - roofUV.v0),
              ];

              addTriangle(
                [pt0.x, topElev, pt0.z],
                [pt1.x, topElev, pt1.z],
                [pt2.x, topElev, pt2.z],
                [0, 1, 0],
                uv0,
                uv1,
                uv2
              );
            }

            // B. 옥상 테두리 3D 돌출 난간 (두께 0.35m, 높이 0.9m)
            const parapetH = (classified.hasParapet || isApt || classified.type === 'commercial' || height >= 11.0) ? 0.9 : 0.0;
            const parapetW = 0.35; // 0.35m 실측 두께

            if (parapetH > 0.0) {
              const topCapY = topElev + parapetH;

              for (let i = 0; i < ptCount; i++) {
                const j = (i + 1) % ptCount;
                const p1 = pts2D[i];
                const p2 = pts2D[j];

                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const edgeLen = Math.hypot(dx, dz);
                if (edgeLen < 0.2) continue;

                const nx = dz / edgeLen;
                const nz = -dx / edgeLen;

                // 0.35m 안쪽 점
                const p1In = { x: p1.x - nx * parapetW, z: p1.z - nz * parapetW };
                const p2In = { x: p2.x - nx * parapetW, z: p2.z - nz * parapetW };

                // 1) 외측 수직면 (높이 0.9m)
                addRooftopQuad(
                  [p1.x, topElev, p1.z],
                  [p2.x, topElev, p2.z],
                  [p2.x, topCapY, p2.z],
                  [p1.x, topCapY, p1.z],
                  [nx, 0, nz],
                  uvParapet
                );

                // 2) 상단 수평 코핑 캡 (두께 0.35m)
                addRooftopQuad(
                  [p1.x, topCapY, p1.z],
                  [p2.x, topCapY, p2.z],
                  [p2In.x, topCapY, p2In.z],
                  [p1In.x, topCapY, p1In.z],
                  [0, 1, 0],
                  uvParapet
                );

                // 3) 내측 수직면 (높이 0.9m, 지붕 바닥으로 하강)
                addRooftopQuad(
                  [p2In.x, topCapY, p2In.z],
                  [p1In.x, topCapY, p1In.z],
                  [p1In.x, topElev, p1In.z],
                  [p2In.x, topElev, p2In.z],
                  [-nx, 0, -nz],
                  uvParapet
                );
              }
            }

            // C. 옥상 중심 엘리베이터 권상기실(옥탑방 큐브, 높이 2.8m)
            const coreHeight = 2.8;
            const obb = calculateOBB(poly2D);

            if (isApt && obb.length >= 36.0) {
              // 판상형 대형 아파트: 2개 계단/엘리베이터 코어 배치
              const coreW = 4.2;
              const coreD = 3.6;
              const halfW = coreW / 2;
              const halfD = coreD / 2;
              const offsets = [-0.22 * obb.length, 0.22 * obb.length];

              for (const off of offsets) {
                const cx = obb.origin[0] + off * obb.majorAxis[0];
                const cz = obb.origin[1] + off * obb.majorAxis[1];

                const cX0 = cx - halfW;
                const cX1 = cx + halfW;
                const cZ0 = cz - halfD;
                const cZ1 = cz + halfD;
                const coreTopY = topElev + coreHeight;

                addRooftopQuad([cX0, topElev, cZ0], [cX1, topElev, cZ0], [cX1, coreTopY, cZ0], [cX0, coreTopY, cZ0], [0, 0, -1], uvPenthouse);
                addRooftopQuad([cX1, topElev, cZ0], [cX1, topElev, cZ1], [cX1, coreTopY, cZ1], [cX1, coreTopY, cZ0], [1, 0, 0], uvPenthouse);
                addRooftopQuad([cX1, topElev, cZ1], [cX0, topElev, cZ1], [cX0, coreTopY, cZ1], [cX1, coreTopY, cZ1], [0, 0, 1], uvPenthouse);
                addRooftopQuad([cX0, topElev, cZ1], [cX0, topElev, cZ0], [cX0, coreTopY, cZ0], [cX0, coreTopY, cZ1], [-1, 0, 0], uvPenthouse);

                addRooftopQuad([cX0, coreTopY, cZ0], [cX1, coreTopY, cZ0], [cX1, coreTopY, cZ1], [cX0, coreTopY, cZ1], [0, 1, 0], uvRoofAptSlab);
              }
            } else {
              // 단일 중심 코어 (아파트 소형동 또는 중대형 상업 빌딩)
              const safeCore = calculateSafeRooftopCore(poly2D, height, topElev, 2.0);
              let cX0 = 0, cX1 = 0, cZ0 = 0, cZ1 = 0;
              let hasCore = false;

              if (safeCore) {
                [cX0, cZ0] = safeCore.box2D[0];
                [cX1, cZ1] = safeCore.box2D[2];
                hasCore = true;
              } else if (obb.width >= 7.0 && obb.length >= 7.0) {
                const halfW = 2.0;
                const halfD = 1.8;
                cX0 = obb.origin[0] - halfW;
                cX1 = obb.origin[0] + halfW;
                cZ0 = obb.origin[1] - halfD;
                cZ1 = obb.origin[1] + halfD;
                hasCore = true;
              }

              if (hasCore) {
                const coreTopY = topElev + coreHeight;

                addRooftopQuad([cX0, topElev, cZ0], [cX1, topElev, cZ0], [cX1, coreTopY, cZ0], [cX0, coreTopY, cZ0], [0, 0, -1], uvPenthouse);
                addRooftopQuad([cX1, topElev, cZ0], [cX1, topElev, cZ1], [cX1, coreTopY, cZ1], [cX1, coreTopY, cZ0], [1, 0, 0], uvPenthouse);
                addRooftopQuad([cX1, topElev, cZ1], [cX0, topElev, cZ1], [cX0, coreTopY, cZ1], [cX1, coreTopY, cZ1], [0, 0, 1], uvPenthouse);
                addRooftopQuad([cX0, topElev, cZ1], [cX0, topElev, cZ0], [cX0, coreTopY, cZ0], [cX0, coreTopY, cZ1], [-1, 0, 0], uvPenthouse);

                addRooftopQuad([cX0, coreTopY, cZ0], [cX1, coreTopY, cZ0], [cX1, coreTopY, cZ1], [cX0, coreTopY, cZ1], [0, 1, 0], isApt ? uvRoofAptSlab : uvRoofConcrete);
              }
            }
          }

          builtBuildingCount++;
        }
      }

      // -----------------------------------------------------------------------
      // 2. 단일 BufferGeometry 구성 및 원자적 메쉬 교체
      // -----------------------------------------------------------------------
      if (posIdx > 0 && this.masterMaterial) {
        const finalPositions = posBuf.subarray(0, posIdx);
        const finalNormals = normBuf.subarray(0, posIdx);
        const finalUvs = uvBuf.subarray(0, uvIdx);
        const finalHeights = heightBuf.subarray(0, heightIdx);

        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
        newGeometry.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
        newGeometry.setAttribute('uv', new THREE.BufferAttribute(finalUvs, 2));
        newGeometry.setAttribute('aHeight', new THREE.BufferAttribute(finalHeights, 1));
        newGeometry.computeBoundingSphere();

        const newMesh = new THREE.Mesh(newGeometry, this.masterMaterial);
        newMesh.frustumCulled = false;
        newMesh.visible = this.isVisible;

        // [더블 버퍼링]: 신규 메쉬를 씬에 먼저 등록한 후 이전 메쉬를 안전 해제 (빈 화면 0프레임)
        const oldMesh = this.masterMesh;
        const oldGeo = this.masterGeometry;

        this.masterMesh = newMesh;
        this.masterGeometry = newGeometry;
        this.scene.add(this.masterMesh);

        if (oldMesh) {
          this.scene.remove(oldMesh);
          oldGeo?.dispose();
        }

        this.options.onBuildingCountChange?.(builtBuildingCount);
      }

      // 2-B. 옥상 난간 및 옥탑 코어 분리 메쉬 생성 (더블 버퍼링 적용)
      if (rooftopPosIdx > 0 && this.rooftopMaterial) {
        const finalRooftopPositions = rooftopPosBuf.subarray(0, rooftopPosIdx);
        const finalRooftopNormals = rooftopNormBuf.subarray(0, rooftopPosIdx);
        const finalRooftopUvs = rooftopUvBuf.subarray(0, rooftopUvIdx);
        const finalRooftopHeights = rooftopHeightBuf.subarray(0, rooftopHeightIdx);

        const newRooftopGeometry = new THREE.BufferGeometry();
        newRooftopGeometry.setAttribute('position', new THREE.BufferAttribute(finalRooftopPositions, 3));
        newRooftopGeometry.setAttribute('normal', new THREE.BufferAttribute(finalRooftopNormals, 3));
        newRooftopGeometry.setAttribute('uv', new THREE.BufferAttribute(finalRooftopUvs, 2));
        newRooftopGeometry.setAttribute('aHeight', new THREE.BufferAttribute(finalRooftopHeights, 1));
        newRooftopGeometry.computeBoundingSphere();

        const newRooftopMesh = new THREE.Mesh(newRooftopGeometry, this.rooftopMaterial);
        newRooftopMesh.frustumCulled = false;
        const curZ = this.map ? this.map.getZoom() : 15.0;
        const initT = Math.max(0, Math.min(1, (curZ - 14.5) / 1.0));
        newRooftopMesh.visible = this.isVisible && initT > 0.01;
        this.rooftopMaterial.opacity = initT;

        const oldRooftop = this.rooftopMesh;
        const oldRooftopGeo = this.rooftopGeometry;

        this.rooftopMesh = newRooftopMesh;
        this.rooftopGeometry = newRooftopGeometry;
        this.scene.add(this.rooftopMesh);

        if (oldRooftop) {
          this.scene.remove(oldRooftop);
          oldRooftopGeo?.dispose();
        }
      } else if (this.rooftopMesh) {
        this.scene.remove(this.rooftopMesh);
        this.rooftopGeometry?.dispose();
        this.rooftopMesh = null;
        this.rooftopGeometry = null;
      }

      // 2-C. 국토교통부 전국 교량 및 터널 3D 모델링 동기화
      this.buildBridgesAndTunnelsMesh();

      // 3. 브이월드 스타일 노란 핀 + 한글 명칭 POI 라벨 실시간 갱신 및 건물 카운트 통지
      this.options.onBuildingCountChange?.(builtBuildingCount);
      if (this.map && rawFeatures && rawFeatures.length > 0) {
        try {
          updateVworldPoisWithBuildings(this.map, rawFeatures);
        } catch {
          // ignore
        }
      }
    } catch (buildErr) {
      console.warn('[RealisticKoreanCityLayer] buildRealisticCityMesh exception:', buildErr);
    } finally {
      this.isBuildingGeometry = false;
      if (this.pendingFeatures) {
        const next = this.pendingFeatures;
        this.pendingFeatures = null;
        this.buildRealisticCityMesh(next);
      }
      if (this.map) {
        this.map.triggerRepaint();
      }
    }
  }

  /**
   * 국토교통부 전국 교량 및 터널 실측 제원 기반 3D 입체 교량(상판, 방호벽, 교각) & 터널 갱문 모델링
   */
  private buildBridgesAndTunnelsMesh(): void {
    if (!this.map || !this.bridgeMaterial || !this.guardrailMaterial || !this.tunnelArchMaterial || !this.tunnelInteriorMaterial) {
      return;
    }

    // 기존 지오메트리 안전 정리
    while (this.bridgeGroup.children.length > 0) {
      const child = this.bridgeGroup.children[0] as THREE.Group;
      this.bridgeGroup.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry?.dispose();
        }
      });
    }

    while (this.tunnelGroup.children.length > 0) {
      const child = this.tunnelGroup.children[0] as THREE.Group;
      this.tunnelGroup.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry?.dispose();
        }
      });
    }

    const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
    const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
    const metersPerLat = (Math.PI / 180) * 6378137;

    // -------------------------------------------------------------------------
    // [1단계: 하천·도로 횡단 '대교(Bridge)' 실제 도로 선형 기반 3D 입체 구조물 생성]
    // - Streets-GL 벤더링: 실제 하천(원주천, 섬강 등)을 건너는 교량 선형(LineString)을 따라
    //   다크 아스팔트 상판(#26292e), 1.6m 거더(#64748b), 1.2m 방호벽(#e2e8f0), 30m 간격 교각(#94a3b8)
    // -------------------------------------------------------------------------
    const getTerrainElev = (p: [number, number]) => {
      if (!this.map) return 0;
      return (
        elevationCache.getFromMap(this.map, p) ||
        (this.map.queryTerrainElevation ? this.map.queryTerrainElevation(p) || 0 : 0)
      );
    };

    const authenticBridgesMeshGroup = buildAuthenticBridgeMeshGroup(
      WONJU_AUTHENTIC_BRIDGES,
      this.originLngLat,
      getTerrainElev
    );
    this.bridgeGroup.add(authenticBridgesMeshGroup);

    for (const item of this.bridgesAndTunnelsData) {
      if (!item.coordinates || !Array.isArray(item.coordinates) || item.coordinates.length < 2) continue;
      const [lng, lat] = item.coordinates;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

      const mx = (lng - this.originLngLat[0]) * metersPerLng;
      const mz = -(lat - this.originLngLat[1]) * metersPerLat;

      // [요구사항 1] 공중부양 교량 3D 박스 메쉬 전면 삭제
      // 교량(Bridge)은 국토부 단일 좌표에 가짜 박스를 띄우지 않고, 실제 도로 선형(LineString)을 따라가며
      // MapLibre DEM 지형에 밀착된 콘크리트 상판(#e2e8f0) 및 난간 라인과 마커 배지로만 표출합니다.
      if (item.type === 'tunnel') {
        const widthM = Number(item.widthM || 14.0);
        const heightM = Number(item.heightM || 6.5);
        const headingRad = (((item.heading || 40)) * Math.PI) / 180;

        const tunnelSubGroup = new THREE.Group();
        tunnelSubGroup.position.set(mx, 0, mz);
        tunnelSubGroup.rotation.y = headingRad;

        // 1. Concrete Headwall (포털 전면 사각 프레임)
        const wallW = widthM + 4.0;
        const wallH = heightM + 3.0;
        const wallThick = 2.0;

        const portalShape = new THREE.Shape();
        portalShape.moveTo(-wallW / 2, 0);
        portalShape.lineTo(wallW / 2, 0);
        portalShape.lineTo(wallW / 2, wallH);
        portalShape.lineTo(-wallW / 2, wallH);
        portalShape.closePath();

        const archHole = new THREE.Path();
        const r = widthM / 2;
        archHole.moveTo(-r, 0);
        archHole.lineTo(r, 0);
        archHole.lineTo(r, heightM - r);
        archHole.absarc(0, heightM - r, r, 0, Math.PI, false);
        archHole.lineTo(-r, 0);
        portalShape.holes.push(archHole);

        const portalGeo = new THREE.ExtrudeGeometry(portalShape, { depth: wallThick, bevelEnabled: false });
        const portalMesh = new THREE.Mesh(portalGeo, this.tunnelArchMaterial);
        portalMesh.position.set(0, 0, -wallThick / 2);
        tunnelSubGroup.add(portalMesh);

        // 2. Dark Tunnel Interior Cavity (암흑 내부 진입 통로)
        const interiorDepth = 25.0;
        const cavityShape = new THREE.Shape();
        cavityShape.moveTo(-r, 0);
        cavityShape.lineTo(r, 0);
        cavityShape.lineTo(r, heightM - r);
        cavityShape.absarc(0, heightM - r, r, 0, Math.PI, false);
        cavityShape.closePath();

        const cavityGeo = new THREE.ExtrudeGeometry(cavityShape, { depth: interiorDepth, bevelEnabled: false });
        const cavityMesh = new THREE.Mesh(cavityGeo, this.tunnelInteriorMaterial);
        cavityMesh.position.set(0, 0, -interiorDepth);
        tunnelSubGroup.add(cavityMesh);

        this.tunnelGroup.add(tunnelSubGroup);
      }
    }

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer || !this.masterMesh) {
      return;
    }

    try {
      // [3단계 신규] 줌 14.5 ~ 15.5 사이에서 옥상 난간 및 옥탑 코어 부드러운 페이드인
      if (this.rooftopMesh && this.map) {
        const z = this.map.getZoom();
        const t = Math.max(0, Math.min(1, (z - 14.5) / 1.0));
        this.rooftopMesh.visible = t > 0.01 && this.isVisible;
        if (this.rooftopMaterial) {
          this.rooftopMaterial.opacity = t;
        }
      }

      // [지형 표고 레이스 컨디션 해결] DEM 타일 로딩 완료 후 지형 표고가 수신되면 지형 위로 리빌드
      if (this.clampedAltitude === 0 && this.map) {
        const queried =
          elevationCache.getFromMap(this.map, this.originLngLat) ||
          (this.map.queryTerrainElevation ? this.map.queryTerrainElevation(this.originLngLat) || 0 : 0);
        if (queried > 5.0) {
          this.clampedAltitude = queried;
          setTimeout(() => {
            if (!this.isMoving) this.extractAndBuildFromMap();
          }, 50);
        }
      }

      const rawMatrix = extractCustomLayerMatrix(options, this.map);
      if (!rawMatrix) return;

      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        this.clampedAltitude
      );

      const meterScale = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        0
      ).meterInMercatorCoordinateUnits();

      this.renderMatrix.fromArray(rawMatrix as any);
      this.scaleVector.set(meterScale, -meterScale, meterScale);
      this.localMatrix
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(this.scaleVector)
        .multiply(this.rotationX);

      this.camera.projectionMatrix.copy(this.renderMatrix).multiply(this.localMatrix);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

      // [GeoBrief 3D 2단계] 카메라 시점 및 태양광 물리 반사(PBR Specular & Sky Reflection) 프레임 동기화
      if (this.masterMaterial) {
        updatePhotorealisticPbrUniforms(this.masterMaterial, this.camera, this.sunLight);
      }
      if (this.rooftopMaterial) {
        updatePhotorealisticPbrUniforms(this.rooftopMaterial, this.camera, this.sunLight);
      }

      if (gl) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      }
      try {
        (this.renderer.state as any).buffers?.depth?.setTest(true);
      } catch {}

      const prevFbo =
        options?.defaultFramebuffer !== undefined
          ? options.defaultFramebuffer
          : gl
          ? gl.getParameter(gl.FRAMEBUFFER_BINDING)
          : null;

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      }
    } catch (renderErr) {
      console.warn('[RealisticKoreanCityLayer] render exception:', renderErr);
    }
  }

  public onRemove(map: maplibregl.Map): void {
    const moveStartEvents = ['movestart', 'rotatestart', 'pitchstart', 'zoomstart', 'dragstart'];
    const moveEndEvents = ['moveend', 'rotateend', 'pitchend', 'zoomend', 'dragend'];

    moveStartEvents.forEach((evt) => map.off(evt, this.handleMoveStart));
    moveEndEvents.forEach((evt) => map.off(evt, this.handleMoveEnd));

    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
      this.moveEndTimer = null;
    }
    if (this.masterMesh) {
      this.scene.remove(this.masterMesh);
      this.masterGeometry?.dispose();
      this.masterMesh = null;
    }
    if (this.rooftopMesh) {
      this.scene.remove(this.rooftopMesh);
      this.rooftopGeometry?.dispose();
      this.rooftopMaterial?.dispose();
      this.rooftopMesh = null;
    }
    if (this.bridgeGroup) {
      this.scene.remove(this.bridgeGroup);
    }
    if (this.tunnelGroup) {
      this.scene.remove(this.tunnelGroup);
    }
    this.bridgeMaterial?.dispose();
    this.guardrailMaterial?.dispose();
    this.tunnelArchMaterial?.dispose();
    this.tunnelInteriorMaterial?.dispose();
    this.cachedFeatures = [];
    this.persistentBuildingMap.clear();
  }
}
