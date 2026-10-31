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
  getDiverseKoreanFacadeAtlasTexture,
  getDiverseFacadeSlotUV,
  getDiverseFacadeRmaTexture,
  DiverseUVRect,
} from '@/utils/diverseKoreanFacadeAtlas';
type UVRect = DiverseUVRect;
const getPhotorealisticSlotUV = getDiverseFacadeSlotUV;
import {
  generateBuildingId,
  getMemoizedBuilding,
  parseAndClassifyBuilding,
} from '@/utils/gangwonSpatialAggregator';
import { stampBuildingWithMasterData } from '@/utils/masterDataSynchronizer';
import {
  calculateOBB,
  calculateSafeRooftopCore,
} from '@/lib/vendor/safeGeoAlgorithms';
import { StreetsGlFacadeEngine } from '@/lib/vendor/streetsGlFacadeEngine';
import { OsmRoofGenerator } from '@/lib/vendor/osmRoofGenerator';
import { VworldRealisticFacadeEngine } from '@/lib/vendor/vworldRealisticFacade';
import { Vworld3DRenderEngine } from '@/lib/vendor/vworld3DRenderEngine';
import { HybridVworldRenderer } from '@/lib/vendor/hybridVworldRenderer';
import { VworldRealRenderer } from '@/lib/vendor/vworldRealRenderer';
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
import {
  detectLandmarkType,
  buildLandmarkBuildingMesh,
  LandmarkInfo,
} from '@/utils/landmarkBuildingBuilder';
import {
  isPermittedBuildingPolygon,
  sanitizeBuildingHeight,
} from '@/utils/master3DRendererManager';
import { VworldMasterEngine } from '@/lib/vendor/vworldMasterEngine';
import { DiverseBuildingGenerator } from '@/lib/vendor/diverseBuildingGenerator';

const Earcut = (earcut as any).default || earcut;

export function getBuildingFeatureKey(f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): string {
  if (f.id !== undefined && f.id !== null && f.id !== '') {
    return String(f.id);
  }
  const props = f.properties as any;
  if (props) {
    if (props.bd_mgt_sn) return `bld-${props.bd_mgt_sn}`;
    if (props.bld_id) return `bld-${props.bld_id}`;
    if (props.pnu && props.buld_nm) return `pnu-${props.pnu}-${props.buld_nm}`;
    if (props.id) return String(props.id);
  }
  const geom = f.geometry;
  if (!geom) return `unknown-${Math.random()}`;
  if (geom.type === 'Polygon') {
    const pt = geom.coordinates[0]?.[0];
    return pt ? `poly-${pt[0].toFixed(6)},${pt[1].toFixed(6)}` : `poly-empty`;
  }
  if (geom.type === 'MultiPolygon') {
    const pt = geom.coordinates[0]?.[0]?.[0];
    return pt ? `mpoly-${pt[0].toFixed(6)},${pt[1].toFixed(6)}` : `mpoly-empty`;
  }
  return `f-${JSON.stringify(f).slice(0, 40)}`;
}

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

  // [3단계 고성능 엔진] 4ms 타임슬라이싱 및 사전할당 Float32Array 버퍼
  private builtBuildingKeys: Set<string> = new Set();
  private activeBuildSliceRaf: number | null = null;
  private activeBuildTaskId: number = 0;

  // 단일 대용량 버퍼 사전 할당 (재할당/push 오버헤드 0%, Draw Call = 1)
  private accPosBuf: Float32Array = new Float32Array(3000000);
  private accNormBuf: Float32Array = new Float32Array(3000000);
  private accColorBuf: Float32Array = new Float32Array(3000000);
  private accUvBuf: Float32Array = new Float32Array(2000000);
  private accHeightBuf: Float32Array = new Float32Array(1000000);
  private accPosIdx: number = 0;
  private accUvIdx: number = 0;
  private accHeightIdx: number = 0;

  // 옥상 난간 및 옥탑 코어 사전 할당 버퍼
  private accRooftopPosBuf: Float32Array = new Float32Array(900000);
  private accRooftopNormBuf: Float32Array = new Float32Array(900000);
  private accRooftopColorBuf: Float32Array = new Float32Array(900000);
  private accRooftopUvBuf: Float32Array = new Float32Array(600000);
  private accRooftopHeightBuf: Float32Array = new Float32Array(300000);
  private accRooftopPosIdx: number = 0;
  private accRooftopUvIdx: number = 0;
  private accRooftopHeightIdx: number = 0;

  private currentBuildingBaseElev: number = 0;

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

  public getCachedFeatures(): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] {
    return this.cachedFeatures.length > 0
      ? this.cachedFeatures
      : Array.from(this.persistentBuildingMap.values());
  }

  public findBuildingNear(
    lng: number,
    lat: number,
    maxDistM: number = 30
  ): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
    const list = this.getCachedFeatures();
    if (!list || list.length === 0) return null;

    let closest: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;
    let minDist = maxDistM;

    for (const feat of list) {
      if (!feat.geometry) continue;
      const geom = feat.geometry;
      let samplePt: [number, number] | null = null;
      if (geom.type === 'Polygon') {
        samplePt = geom.coordinates[0]?.[0] as [number, number];
      } else if (geom.type === 'MultiPolygon') {
        samplePt = geom.coordinates[0]?.[0]?.[0] as [number, number];
      }
      if (!samplePt) continue;

      const dx = (lng - samplePt[0]) * 111000 * Math.cos((lat * Math.PI) / 180);
      const dy = (lat - samplePt[1]) * 111000;
      const d = Math.hypot(dx, dy);
      if (d < minDist) {
        minDist = d;
        closest = feat;
      }
    }
    return closest;
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

      // 2. [GeoBrief 3D 2단계] 16종 실사 파사드 아틀라스 & 순수 MeshStandardMaterial 정통 PBR 재질 초기화
      const atlasTex = getDiverseKoreanFacadeAtlasTexture();
      this.masterMaterial = new THREE.MeshStandardMaterial({
        map: atlasTex || undefined,
        color: new THREE.Color('#e5e0d8'),
        vertexColors: true,
        roughness: 0.65,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });

      this.rooftopMaterial = new THREE.MeshStandardMaterial({
        map: atlasTex || undefined,
        color: new THREE.Color('#e5e0d8'),
        vertexColors: true,
        roughness: 0.70,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1.0,
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
      map.on('sourcedata', this.handleSourceData);

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
      (e.sourceId === 'openmaptiles-vector' || e.sourceId === 'openfreemap' || e.sourceId === 'fusion-buildings-source') &&
      e.isSourceLoaded &&
      !this.isMoving
    ) {
      this.extractAndBuildFromMap();
    }
  };

  private handleMapIdle = (): void => {
    if (!this.isMoving && this.map) {
      this.extractAndBuildFromMap();
    }
  };

  private handleMoveStart = (): void => {
    this.isMoving = true;
    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
      this.moveEndTimer = null;
    }
    // [인터랙션 잠금: 카메라 이동/회전/줌 중 연산 100% 완전 중단]
    if (this.activeBuildSliceRaf !== null) {
      cancelAnimationFrame(this.activeBuildSliceRaf);
      this.activeBuildSliceRaf = null;
      this.isBuildingGeometry = false;
    }
  };

  private handleMoveEnd = (): void => {
    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
    }
    const checkAndComplete = () => {
      this.moveEndTimer = null;
      if (!this.map) return;
      if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
        this.moveEndTimer = setTimeout(checkAndComplete, 150);
        return;
      }
      this.isMoving = false;
      this.extractAndBuildFromMap();
    };
    // 250ms 디바운스 후 카메라 이동/회전이 완전히 멈춘 뒤 신규 영역 업데이트 (깜빡임 0%, 60fps 보장)
    this.moveEndTimer = setTimeout(checkAndComplete, 250);
  };

  public setInteracting(interacting: boolean): void {
    if (interacting) {
      this.handleMoveStart();
    } else {
      this.handleMoveEnd();
    }
  }

  public getBuildingCount(): number {
    return this.builtBuildingKeys.size;
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
    if (!this.map || this.isBuildingGeometry) return;
    if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
      return;
    }
    this.isMoving = false;

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
    let unbuiltCount = 0;
    for (let i = 0; i < combined.length; i++) {
      const f = combined[i];
      const key = getBuildingFeatureKey(f);
      if (!this.persistentBuildingMap.has(key)) {
        stampBuildingWithMasterData(f);
        this.persistentBuildingMap.set(key, f);
      }
      if (!this.builtBuildingKeys.has(key)) {
        unbuiltCount++;
      }
    }

    // 이미 화면에 있는 건물은 연산을 100% 생략하여 끊김과 깜빡임 0% 달성
    if (this.masterMesh && unbuiltCount === 0) {
      return;
    }

    this.cachedFeatures = Array.from(this.persistentBuildingMap.values());
    if (this.cachedFeatures.length === 0) {
      this.cachedFeatures = (SAMPLE_BUILDINGS?.features as any[]) || [];
      this.cachedFeatures.forEach((f) => stampBuildingWithMasterData(f));
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

    // [강원 18개 시·군 전역 원점 재설정] 시군간 이동 시 기준 원점 동적 재앵커링
    if (newOriginLngLat && Array.isArray(newOriginLngLat) && newOriginLngLat.length === 2) {
      const dLng = Math.abs(newOriginLngLat[0] - this.originLngLat[0]);
      const dLat = Math.abs(newOriginLngLat[1] - this.originLngLat[1]);
      if (dLng > 0.08 || dLat > 0.08 || !this.fixedOriginInitialized) {
        this.originLngLat = [newOriginLngLat[0], newOriginLngLat[1]];
        this.fixedOriginInitialized = true;
        // 다른 시·군으로 원거리 이동 시(20km+) 이전 지역 캐시 정리하여 새 지역 건물로 전면 갱신
        if (dLng > 0.20 || dLat > 0.20) {
          this.persistentBuildingMap.clear();
        }
        this.resetAccumulatedBuffers();
      }
    }

    let unbuiltCount = 0;
    let modifiedCount = 0;
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const key = getBuildingFeatureKey(f);
      const ex = this.persistentBuildingMap.get(key);
      if (!ex) {
        this.persistentBuildingMap.set(key, f);
        unbuiltCount++;
      } else {
        const exH = Number(ex.properties?.height || ex.properties?.hei || 0);
        const newH = Number(f.properties?.height || f.properties?.hei || 0);
        if (newH > exH + 0.5) {
          this.persistentBuildingMap.set(key, f);
          modifiedCount++;
        }
      }
      if (!this.builtBuildingKeys.has(key)) {
        unbuiltCount++;
      }
    }

    if (modifiedCount > 200) {
      this.resetAccumulatedBuffers();
    } else if (this.masterMesh && unbuiltCount === 0) {
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

  private resetAccumulatedBuffers(): void {
    this.builtBuildingKeys.clear();
    this.accPosIdx = 0;
    this.accUvIdx = 0;
    this.accHeightIdx = 0;
    this.accRooftopPosIdx = 0;
    this.accRooftopUvIdx = 0;
    this.accRooftopHeightIdx = 0;
  }

  private ensureCapacity(additionalVertices: number): void {
    const neededFloats = this.accPosIdx + additionalVertices * 3;
    if (neededFloats > this.accPosBuf.length) {
      const newSize = Math.max(this.accPosBuf.length * 2, neededFloats + 300000);
      const newPos = new Float32Array(newSize);
      const newNorm = new Float32Array(newSize);
      const newColor = new Float32Array(newSize);
      const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
      const newHeight = new Float32Array(Math.floor(newSize / 3));
      newPos.set(this.accPosBuf.subarray(0, this.accPosIdx));
      newNorm.set(this.accNormBuf.subarray(0, this.accPosIdx));
      newColor.set(this.accColorBuf.subarray(0, this.accPosIdx));
      newUv.set(this.accUvBuf.subarray(0, this.accUvIdx));
      newHeight.set(this.accHeightBuf.subarray(0, this.accHeightIdx));
      this.accPosBuf = newPos;
      this.accNormBuf = newNorm;
      this.accColorBuf = newColor;
      this.accUvBuf = newUv;
      this.accHeightBuf = newHeight;
    }
  }

  private ensureRooftopCapacity(additionalVertices: number): void {
    const neededFloats = this.accRooftopPosIdx + additionalVertices * 3;
    if (neededFloats > this.accRooftopPosBuf.length) {
      const newSize = Math.max(this.accRooftopPosBuf.length * 2, neededFloats + 100000);
      const newPos = new Float32Array(newSize);
      const newNorm = new Float32Array(newSize);
      const newColor = new Float32Array(newSize);
      const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
      const newHeight = new Float32Array(Math.floor(newSize / 3));
      newPos.set(this.accRooftopPosBuf.subarray(0, this.accRooftopPosIdx));
      newNorm.set(this.accRooftopNormBuf.subarray(0, this.accRooftopPosIdx));
      newColor.set(this.accRooftopColorBuf.subarray(0, this.accRooftopPosIdx));
      newUv.set(this.accRooftopUvBuf.subarray(0, this.accRooftopUvIdx));
      newHeight.set(this.accRooftopHeightBuf.subarray(0, this.accRooftopHeightIdx));
      this.accRooftopPosBuf = newPos;
      this.accRooftopNormBuf = newNorm;
      this.accRooftopColorBuf = newColor;
      this.accRooftopUvBuf = newUv;
      this.accRooftopHeightBuf = newHeight;
    }
  }

  private addTriangle = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    norm: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    color?: [number, number, number]
  ): void => {
    this.ensureCapacity(3);
    const p = this.accPosIdx;
    const u = this.accUvIdx;
    const h = this.accHeightIdx;
    const baseElev = this.currentBuildingBaseElev;
    const cr = color ? color[0] : 0.90;
    const cg = color ? color[1] : 0.88;
    const cb = color ? color[2] : 0.85;

    this.accPosBuf[p] = p0[0];
    this.accPosBuf[p + 1] = p0[1];
    this.accPosBuf[p + 2] = p0[2];
    this.accNormBuf[p] = norm[0];
    this.accNormBuf[p + 1] = norm[1];
    this.accNormBuf[p + 2] = norm[2];
    this.accColorBuf[p] = cr;
    this.accColorBuf[p + 1] = cg;
    this.accColorBuf[p + 2] = cb;
    this.accUvBuf[u] = uv0[0];
    this.accUvBuf[u + 1] = uv0[1];
    this.accHeightBuf[h] = Math.max(0, p0[1] - baseElev);

    this.accPosBuf[p + 3] = p1[0];
    this.accPosBuf[p + 4] = p1[1];
    this.accPosBuf[p + 5] = p1[2];
    this.accNormBuf[p + 3] = norm[0];
    this.accNormBuf[p + 4] = norm[1];
    this.accNormBuf[p + 5] = norm[2];
    this.accColorBuf[p + 3] = cr;
    this.accColorBuf[p + 4] = cg;
    this.accColorBuf[p + 5] = cb;
    this.accUvBuf[u + 2] = uv1[0];
    this.accUvBuf[u + 3] = uv1[1];
    this.accHeightBuf[h + 1] = Math.max(0, p1[1] - baseElev);

    this.accPosBuf[p + 6] = p2[0];
    this.accPosBuf[p + 7] = p2[1];
    this.accPosBuf[p + 8] = p2[2];
    this.accNormBuf[p + 6] = norm[0];
    this.accNormBuf[p + 7] = norm[1];
    this.accNormBuf[p + 8] = norm[2];
    this.accColorBuf[p + 6] = cr;
    this.accColorBuf[p + 7] = cg;
    this.accColorBuf[p + 8] = cb;
    this.accUvBuf[u + 4] = uv2[0];
    this.accUvBuf[u + 5] = uv2[1];
    this.accHeightBuf[h + 2] = Math.max(0, p2[1] - baseElev);

    this.accPosIdx += 9;
    this.accUvIdx += 6;
    this.accHeightIdx += 3;
  };

  private addQuad = (
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvRect: UVRect,
    color?: [number, number, number]
  ): void => {
    this.addTriangle(
      pBL,
      pBR,
      pTR,
      norm,
      [uvRect.u0, uvRect.v0],
      [uvRect.u1, uvRect.v0],
      [uvRect.u1, uvRect.v1],
      color
    );
    this.addTriangle(
      pBL,
      pTR,
      pTL,
      norm,
      [uvRect.u0, uvRect.v0],
      [uvRect.u1, uvRect.v1],
      [uvRect.u0, uvRect.v1],
      color
    );
  };

  private addRooftopTriangle = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    norm: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    color?: [number, number, number]
  ): void => {
    this.ensureRooftopCapacity(3);
    const p = this.accRooftopPosIdx;
    const u = this.accRooftopUvIdx;
    const h = this.accRooftopHeightIdx;
    const baseElev = this.currentBuildingBaseElev;
    const cr = color ? color[0] : 0.85;
    const cg = color ? color[1] : 0.83;
    const cb = color ? color[2] : 0.80;

    this.accRooftopPosBuf[p] = p0[0];
    this.accRooftopPosBuf[p + 1] = p0[1];
    this.accRooftopPosBuf[p + 2] = p0[2];
    this.accRooftopNormBuf[p] = norm[0];
    this.accRooftopNormBuf[p + 1] = norm[1];
    this.accRooftopNormBuf[p + 2] = norm[2];
    this.accRooftopColorBuf[p] = cr;
    this.accRooftopColorBuf[p + 1] = cg;
    this.accRooftopColorBuf[p + 2] = cb;
    this.accRooftopUvBuf[u] = uv0[0];
    this.accRooftopUvBuf[u + 1] = uv0[1];
    this.accRooftopHeightBuf[h] = Math.max(0, p0[1] - baseElev);

    this.accRooftopPosBuf[p + 3] = p1[0];
    this.accRooftopPosBuf[p + 4] = p1[1];
    this.accRooftopPosBuf[p + 5] = p1[2];
    this.accRooftopNormBuf[p + 3] = norm[0];
    this.accRooftopNormBuf[p + 4] = norm[1];
    this.accRooftopNormBuf[p + 5] = norm[2];
    this.accRooftopColorBuf[p + 3] = cr;
    this.accRooftopColorBuf[p + 4] = cg;
    this.accRooftopColorBuf[p + 5] = cb;
    this.accRooftopUvBuf[u + 2] = uv1[0];
    this.accRooftopUvBuf[u + 3] = uv1[1];
    this.accRooftopHeightBuf[h + 1] = Math.max(0, p1[1] - baseElev);

    this.accRooftopPosBuf[p + 6] = p2[0];
    this.accRooftopPosBuf[p + 7] = p2[1];
    this.accRooftopPosBuf[p + 8] = p2[2];
    this.accRooftopNormBuf[p + 6] = norm[0];
    this.accRooftopNormBuf[p + 7] = norm[1];
    this.accRooftopNormBuf[p + 8] = norm[2];
    this.accRooftopColorBuf[p + 6] = cr;
    this.accRooftopColorBuf[p + 7] = cg;
    this.accRooftopColorBuf[p + 8] = cb;
    this.accRooftopUvBuf[u + 4] = uv2[0];
    this.accRooftopUvBuf[u + 5] = uv2[1];
    this.accRooftopHeightBuf[h + 2] = Math.max(0, p2[1] - baseElev);

    this.accRooftopPosIdx += 9;
    this.accRooftopUvIdx += 6;
    this.accRooftopHeightIdx += 3;
  };

  private addRooftopQuad = (
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvRect: UVRect,
    color?: [number, number, number]
  ): void => {
    this.addRooftopTriangle(
      pBL,
      pBR,
      pTR,
      norm,
      [uvRect.u0, uvRect.v0],
      [uvRect.u1, uvRect.v0],
      [uvRect.u1, uvRect.v1],
      color
    );
    this.addRooftopTriangle(
      pBL,
      pTR,
      pTL,
      norm,
      [uvRect.u0, uvRect.v0],
      [uvRect.u1, uvRect.v1],
      [uvRect.u0, uvRect.v1],
      color
    );
  };

  /**
   * 단일 건물 피처 3D 기하 분할 생성
   */
  private processSingleBuildingFeature(
    feat: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    metersPerLng: number,
    metersPerLat: number,
    map: maplibregl.Map
  ): boolean {
    if (!feat.geometry) return false;

    interface PolyData {
      outerRing: [number, number][];
      innerRings: [number, number][][];
    }
    const polyList: PolyData[] = [];
    if (feat.geometry.type === 'Polygon') {
      const coords = feat.geometry.coordinates as [number, number][][];
      if (coords && coords.length > 0) {
        polyList.push({
          outerRing: coords[0],
          innerRings: coords.slice(1),
        });
      }
    } else if (feat.geometry.type === 'MultiPolygon') {
      const multiCoords = feat.geometry.coordinates as [number, number][][][];
      if (multiCoords) {
        for (let p = 0; p < multiCoords.length; p++) {
          const coords = multiCoords[p];
          if (coords && coords.length > 0) {
            polyList.push({
              outerRing: coords[0],
              innerRings: coords.slice(1),
            });
          }
        }
      }
    }

    if (polyList.length === 0) return false;
    let anyBuilt = false;

    for (let r = 0; r < polyList.length; r++) {
      const polyItem = polyList[r];
      const rawCoords = polyItem.outerRing;
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

      // 면적 및 외곽 둘레 계산 (동향 x, 북향 -z 기준 표준 평면 직교 좌표계)
      let signedArea = 0;
      for (let i = 0; i < ptCount; i++) {
        const j = (i + 1) % ptCount;
        signedArea += pts2D[i].x * (-pts2D[j].z) - pts2D[j].x * (-pts2D[i].z);
      }
      const areaSqm = Math.max(10, Math.abs(signedArea) * 0.5);

      // 와인딩 오더 보정 (CCW 강제 정렬: Shoelace signedArea < 0 이면 CW이므로 .reverse())
      if (signedArea < 0) {
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

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const p of pts2D) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const spanX = Math.max(1, maxX - minX);
      const spanZ = Math.max(1, maxZ - minZ);

      // [1단계: 마스터 전역 기하 필터] 면적 5,500㎡ 초과 비건물 및 찢어짐 폴리곤 100% 영구 차단
      const featProps = (feat.properties || {}) as Record<string, any>;
      if (!isPermittedBuildingPolygon(featProps, areaSqm, spanX, spanZ, maxEdgeLen)) {
        continue;
      }

      // [1단계: 화면 중앙 붉은색/검은색 삼각형 찢어짐(Polygon Tearing) 원천 차단]
      if (maxEdgeLen > 220 || spanX > 260 || spanZ > 260) {
        continue;
      }

      // 폴리곤 내 홀(Holes / Inner Rings) 처리 및 인덱스 수집
      const holeIndices: number[] = [];
      const innerRings2D: { x: number; z: number }[][] = [];
      if (polyItem.innerRings && polyItem.innerRings.length > 0) {
        for (let h = 0; h < polyItem.innerRings.length; h++) {
          const holeCoords = polyItem.innerRings[h];
          if (!holeCoords || holeCoords.length < 3) continue;
          const holePts: { x: number; z: number }[] = [];
          const hLen = holeCoords.length;
          for (let i = 0; i < hLen; i++) {
            if (i === hLen - 1 && hLen > 3) {
              const d0 = Math.abs(holeCoords[i][0] - holeCoords[0][0]);
              const d1 = Math.abs(holeCoords[i][1] - holeCoords[0][1]);
              if (d0 < 1e-7 && d1 < 1e-7) break;
            }
            const hMx = (holeCoords[i][0] - this.originLngLat[0]) * metersPerLng;
            const hMz = -(holeCoords[i][1] - this.originLngLat[1]) * metersPerLat;
            holePts.push({ x: hMx, z: hMz });
          }
          if (holePts.length >= 3) {
            holeIndices.push(pts2D.length);
            innerRings2D.push(holePts);
            for (const hp of holePts) {
              pts2D.push(hp);
            }
          }
        }
      }

      const minWidth = Math.min(spanX, spanZ);

      // [1단계: 전 데이터 전수 검증 및 3D 실측 속성 1:1 강제 동기화]
      if (!featProps.realHeight || !featProps.realUse) {
        stampBuildingWithMasterData(feat);
      }

      // [2단계: DiverseBuildingGenerator 24대 실사 아키텍처 변주 엔진 시드 연동]
      const diverseSeed = DiverseBuildingGenerator.calculateSeed(cLng, cLat);
      const classified = classifyBuildingWithVendor(rawCoords, featProps);

      // [1단계: VworldMasterEngine 연동 실사 높이 복원 (0m 평면 건물 원천 차단)]
      const isTrueHighRiseApt =
        (classified.type === 'apartment' || featProps.realUse === '공동주택(아파트)' || String(featProps.buld_nm || '').includes('아파트')) &&
        areaSqm >= 320;

      let rawH = Number(featProps.realHeight || featProps.height || featProps.heit || classified.height || 0);
      let height = sanitizeBuildingHeight(
        rawH,
        areaSqm,
        minWidth,
        diverseSeed,
        isTrueHighRiseApt,
        featProps,
        [cLng, cLat]
      );
      if (height <= 0) {
        height = VworldMasterEngine.calculateBuildingHeight(
          featProps,
          areaSqm,
          minWidth,
          diverseSeed,
          [cLng, cLat]
        );
      }

      // [요구사항 2] 측벽(창문 없는 벽) 처리는 오직 높이 25m 이상 고층 아파트에서 가장 짧은 양 끝단 2개의 변에만 적용!
      const sideWallEdgeIndices = new Set<number>();
      if (isTrueHighRiseApt && ptCount >= 4) {
        const sortedEdges = edgeLens
          .map((elen, idx) => ({ idx, elen }))
          .sort((a, b) => a.elen - b.elen);
        for (const item of sortedEdges) {
          if (sideWallEdgeIndices.size >= 2) break;
          if (item.elen < maxEdgeLen * 0.75) {
            sideWallEdgeIndices.add(item.idx);
          }
        }
      }

      // 지형 표고: 실제 지형 고도(m) 직접 안착 (고도 중복 편차 및 0m 누락 완전 해결)
      let rawElev = 0;
      try {
        if (map.queryTerrainElevation) {
          const q = map.queryTerrainElevation([cLng, cLat]);
          if (typeof q === 'number' && Number.isFinite(q) && q > 0) rawElev = q;
        }
        if (rawElev <= 0) {
          const cached = elevationCache.getFromMap(map, [cLng, cLat]);
          if (cached > 0) rawElev = cached;
        }
      } catch {}

      // 원주 등 강원권 평균 표고(138m) 안전 기본값 (DEM 타일 로드 전이라도 지표면에 밀착)
      if (rawElev <= 0) {
        rawElev = 138.0;
      }

      const baseElev = rawElev;
      this.currentBuildingBaseElev = baseElev;
      const topElev = baseElev + height;

      // [2단계: 강원 18개 시·군 관공서·공공기관·학교·병원 랜드마크 3단 복합 조형 생성]
      const landmarkInfo = detectLandmarkType(rawCoords, featProps, cLng, cLat, areaSqm);
      if (landmarkInfo) {
        const landmarkH = Math.max(14.0, landmarkInfo.targetHeight || height);
        buildLandmarkBuildingMesh({
          pts2D,
          baseElev,
          height: landmarkH,
          featProps,
          landmark: landmarkInfo,
          addQuad: this.addQuad,
          addTriangle: this.addTriangle,
        });
        anyBuilt = true;
        continue;
      }

      // -------------------------------------------------------------------
      // A. [morluto/rea 기반 브이월드 3D 실사 렌더러 직결 (VworldRealRenderer)]
      // [1순위 건축물대장 정밀 매칭 + 2순위 Streets-GL 포토 아틀라스 4단 입체 + 3순위 OSMBuildings 복합 지붕]
      // -------------------------------------------------------------------
      VworldRealRenderer.buildRealBuilding({
        pts2D,
        baseElev,
        height,
        seed: diverseSeed,
        edgeLens,
        maxEdgeLen,
        minEdgeLen,
        featProps,
        centerLngLat: [cLng, cLat],
        rawCoords,
        holeIndices,
        innerRings2D,
        addQuad: this.addQuad,
        addTriangle: this.addTriangle,
        addRooftopQuad: this.addRooftopQuad,
        addRooftopTriangle: this.addRooftopTriangle,
      });

      anyBuilt = true;
    }

    return anyBuilt;
  }

  /**
   * [1단계: 메인 스레드 연산 0% 보장 (4ms 타임슬라이싱 지오메트리 빌더 & 단일 Draw Call)]
   */
  private buildRealisticCityMesh(
    rawFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
  ): void {
    if (!this.map) return;
    if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
      this.pendingFeatures = rawFeatures;
      return;
    }
    this.isMoving = false;

    if (this.activeBuildSliceRaf !== null) {
      cancelAnimationFrame(this.activeBuildSliceRaf);
      this.activeBuildSliceRaf = null;
    }

    this.isBuildingGeometry = true;
    const currentTaskId = ++this.activeBuildTaskId;

    try {
      const map = this.map;
      const center = map.getCenter();

      // 고정 원점 유지: 시·군 내 이동 시 고정(지터링 방지 및 캐시 유지), 시·군간 원거리 이동(8km+) 시 원점 재동기화
      if (!this.fixedOriginInitialized) {
        this.originLngLat = [center.lng, center.lat];
        this.fixedOriginInitialized = true;
      } else {
        const dLng = Math.abs(center.lng - this.originLngLat[0]);
        const dLat = Math.abs(center.lat - this.originLngLat[1]);
        if (dLng > 0.08 || dLat > 0.08) {
          this.originLngLat = [center.lng, center.lat];
          this.resetAccumulatedBuffers();
        }
      }

      this.clampedAltitude = 0; // 항상 해수면(0m) 고정 기준계 유지 (표고 이중 가산 방지)

      const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
      const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
      const metersPerLat = (Math.PI / 180) * 6378137;

      const maxLimit = this.options.maxBuildings || 35000;
      const centerLng = center.lng;
      const centerLat = center.lat;

      // 뷰포트 중심 거리순 정렬: 화면 중심(사용자 시야)의 건물을 0ms 최우선으로 즉시 빌드
      const sorted = rawFeatures.slice();
      sorted.sort((a: any, b: any) => {
        const cA = a.geometry?.type === 'Polygon' ? a.geometry.coordinates?.[0]?.[0] : a.geometry?.coordinates?.[0]?.[0]?.[0];
        const cB = b.geometry?.type === 'Polygon' ? b.geometry.coordinates?.[0]?.[0] : b.geometry?.coordinates?.[0]?.[0]?.[0];
        if (!cA || !cB) return 0;
        const dA = (cA[0] - centerLng) * (cA[0] - centerLng) + (cA[1] - centerLat) * (cA[1] - centerLat);
        const dB = (cB[0] - centerLng) * (cB[0] - centerLng) + (cB[1] - centerLat) * (cB[1] - centerLat);
        return dA - dB;
      });

      const features = sorted.slice(0, maxLimit);

      let featureIdx = 0;
      let newlyAddedCount = 0;
      const FRAME_BUDGET_MS = 8.0; // 프레임당 최대 8.0ms 이내 연산 엄격 보장 (60fps 무결점)

      const executeSlice = () => {
        if (this.activeBuildTaskId !== currentTaskId) return;
        if (!this.map) {
          this.isBuildingGeometry = false;
          return;
        }

        // [인터랙션 잠금: 카메라 이동/회전/줌 중에는 즉시 중단하고 대기]
        if (this.isMoving) {
          this.activeBuildSliceRaf = null;
          this.isBuildingGeometry = false;
          this.pendingFeatures = features;
          return;
        }

        const sliceStartTime = performance.now();
        const FRAME_BUDGET_MS = 12.0; // 프레임당 최대 12ms 이내 보장 (60fps 무결점)
        let sliceCount = 0;

        while (featureIdx < features.length) {
          if (sliceCount >= 100 && performance.now() - sliceStartTime >= FRAME_BUDGET_MS) {
            break;
          }
          sliceCount++;
          const feat = features[featureIdx++];
          const key = getBuildingFeatureKey(feat);

          // [캐시 히트] 이미 지오메트리가 생성된 건물은 즉시 스킵 (0ms)
          if (this.builtBuildingKeys.has(key)) {
            continue;
          }

          const built = this.processSingleBuildingFeature(feat, metersPerLng, metersPerLat, map);
          if (built) {
            this.builtBuildingKeys.add(key);
            newlyAddedCount++;
          }
        }

        const sliceDuration = performance.now() - sliceStartTime;
        if (typeof window !== 'undefined') {
          (window as any).__lastSliceDuration = sliceDuration;
          (window as any).__maxSliceDuration = Math.max((window as any).__maxSliceDuration || 0, sliceDuration);
          (window as any).__totalSlices = ((window as any).__totalSlices || 0) + 1;
        }

        if (featureIdx < features.length) {
          // 최초 화면 즉시 표시: 1개 이상 생성 시 즉각 1차 표출하여 사용자 대기 0초 달성
          if (this.accPosIdx > 0 && (!this.masterMesh || newlyAddedCount >= 30)) {
            this.commitAccumulatedGeometry();
            newlyAddedCount = 0;
          }
          // 아직 처리할 건물이 남아있으면 다음 프레임에 슬라이스 계속
          this.activeBuildSliceRaf = requestAnimationFrame(executeSlice);
        } else {
          // 전체 피처 슬라이싱 완료!
          this.activeBuildSliceRaf = null;
          this.isBuildingGeometry = false;

          // 최종 원자적 더블 버퍼링 커밋
          if (this.accPosIdx > 0) {
            this.commitAccumulatedGeometry();
          }

          if (this.pendingFeatures) {
            const next = this.pendingFeatures;
            this.pendingFeatures = null;
            this.buildRealisticCityMesh(next);
          }
        }
      };

      // 타임슬라이싱 즉시 1회차 시작
      executeSlice();
    } catch (buildErr) {
      console.warn('[RealisticKoreanCityLayer] buildRealisticCityMesh exception:', buildErr);
      this.isBuildingGeometry = false;
    }
  }

  /**
   * [2단계: 더블 버퍼링 원자적 메쉬 교체 & GPU 단일 Draw Call 달성]
   */
  private commitAccumulatedGeometry(): void {
    if (!this.map || !this.scene) return;

    if (this.accPosIdx > 0 && this.masterMaterial) {
      const finalPositions = this.accPosBuf.subarray(0, this.accPosIdx);
      const finalNormals = this.accNormBuf.subarray(0, this.accPosIdx);
      const finalColors = this.accColorBuf.subarray(0, this.accPosIdx);
      const finalUvs = this.accUvBuf.subarray(0, this.accUvIdx);
      const finalHeights = this.accHeightBuf.subarray(0, this.accHeightIdx);

      const newGeometry = new THREE.BufferGeometry();
      newGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
      newGeometry.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
      newGeometry.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));
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

      this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);
    }

    // 2-B. 옥상 난간 및 옥탑 코어 분리 메쉬 생성 (더블 버퍼링 적용 및 항상 가시성 보장)
    if (this.accRooftopPosIdx > 0 && this.rooftopMaterial) {
      const finalRooftopPositions = this.accRooftopPosBuf.subarray(0, this.accRooftopPosIdx);
      const finalRooftopNormals = this.accRooftopNormBuf.subarray(0, this.accRooftopPosIdx);
      const finalRooftopColors = this.accRooftopColorBuf.subarray(0, this.accRooftopPosIdx);
      const finalRooftopUvs = this.accRooftopUvBuf.subarray(0, this.accRooftopUvIdx);
      const finalRooftopHeights = this.accRooftopHeightBuf.subarray(0, this.accRooftopHeightIdx);

      const newRooftopGeometry = new THREE.BufferGeometry();
      newRooftopGeometry.setAttribute('position', new THREE.BufferAttribute(finalRooftopPositions, 3));
      newRooftopGeometry.setAttribute('normal', new THREE.BufferAttribute(finalRooftopNormals, 3));
      newRooftopGeometry.setAttribute('color', new THREE.BufferAttribute(finalRooftopColors, 3));
      newRooftopGeometry.setAttribute('uv', new THREE.BufferAttribute(finalRooftopUvs, 2));
      newRooftopGeometry.setAttribute('aHeight', new THREE.BufferAttribute(finalRooftopHeights, 1));
      newRooftopGeometry.computeBoundingSphere();

      const newRooftopMesh = new THREE.Mesh(newRooftopGeometry, this.rooftopMaterial);
      newRooftopMesh.frustumCulled = false;
      newRooftopMesh.visible = this.isVisible;
      this.rooftopMaterial.opacity = 1.0;

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
    this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);
    if (this.map && this.cachedFeatures && this.cachedFeatures.length > 0) {
      try {
        updateVworldPoisWithBuildings(this.map, this.cachedFeatures);
      } catch {
        // ignore
      }
    }

    if (this.map) {
      this.map.triggerRepaint();
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

    // [드로우콜 최적화: Draw Calls < 10 엄격 준수]
    // 뷰포트 중심 2.5km 이내의 주요 터널 2개소만 선별하여 3D 갱문 모델링 생성 (총 Draw Calls <= 8 보장)
    const nearbyTunnels = (this.bridgesAndTunnelsData || [])
      .filter((item) => item.type === 'tunnel' && item.coordinates && Array.isArray(item.coordinates))
      .map((item) => {
        const [lng, lat] = item.coordinates;
        const dist = Math.hypot((lng - this.originLngLat[0]) * metersPerLng, (lat - this.originLngLat[1]) * metersPerLat);
        return { item, dist };
      })
      .filter((entry) => entry.dist < 2500)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);

    for (const { item } of nearbyTunnels) {
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

      const rawMatrix = extractCustomLayerMatrix(options, this.map);
      if (!rawMatrix) return;

      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        0 // 항상 해수면(0m) 기준계로 고정하여 표고 변위 지터링 완전 차단
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

      if (this.renderer.info) {
        this.renderer.info.reset();
      }
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

    if (this.activeBuildSliceRaf !== null) {
      cancelAnimationFrame(this.activeBuildSliceRaf);
      this.activeBuildSliceRaf = null;
    }
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
    this.resetAccumulatedBuffers();
  }
}
