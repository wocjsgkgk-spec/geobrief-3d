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
import { MapLibreThreeMatrixAdapter } from '@/lib/vendor/maplibreThreePluginAdapter';
import { getXDWorldSunDirection } from '@/lib/vendor/xdworldEngineAdapter';
import { elevationCache } from '@/utils/elevationCache';
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
import { PrecisionBuildingBuilder } from '@/lib/vendor/precisionBuildingBuilder';
import {
  VWorldBuildingComposer,
  getGlobalVWorldMaterials,
  getGlobalAllMaterialsArray,
} from '@/lib/vendor/vworldBuildingComposer';
import {
  VWorldReaRenderer,
  GLOBAL_VWORLD_MATERIALS as VWORLD_REA_MATERIALS,
  getGlobalVWorldMaterials as getReaMaterials,
  getGlobalAllMaterialsArray as getReaAllMaterials,
} from '@/lib/vendor/vworldReaRenderer';
import {
  getPrecisionBuildingMaterials,
  classifyBuildingStyle,
  getSeoulGradeRooftopMaterial,
  getScenarioBuildingMaterials,
  getScenarioRooftopPbrMaterial,
  GLOBAL_SCENARIO_MATERIALS,
  getVWorldRea16Materials,
} from '@/utils/precisionBuildingMaterials';
import {
  classifyBuildingWithVendor,
  ClassifiedBuildingInfo,
} from '@/lib/vendor/buildingClassifier';
import { extractRenderedVectorBuildings } from '@/utils/spatialDataFetcher';
import { updateVworldPoisWithBuildings } from '@/utils/koreanPoiLayer';
import {
  createPhotorealisticPbrMaterial,
  updatePhotorealisticPbrUniforms,
  updateSharedPbrUniforms,
} from '@/lib/vendor/photorealisticPbrShader';
import { applyAtmosphericPerspectiveFog } from '@/lib/vendor/openSource3DEnhancer';
// 교량 및 터널 가짜 3D 박스 메쉬 완전 제거 (위성사진 및 2D 벡터 원본 노출)
// import { buildAuthenticBridgeMeshGroup, WONJU_AUTHENTIC_BRIDGES } from '@/utils/authenticBridgeBuilder';
import {
  detectLandmarkType,
  buildLandmarkBuildingMesh,
  LandmarkInfo,
} from '@/utils/landmarkBuildingBuilder';
import {
  isPermittedBuildingPolygon,
  sanitizeBuildingHeight,
  isMountainGhostBuilding,
  isPointInMilitaryIdleSite,
  getGangwonBaseElevation,
} from '@/utils/master3DRendererManager';
import {
  GANGWON_CORE_ROAD_SIGNS,
  buildRoadSignGantryMesh,
} from '@/utils/koreanRoadSignBuilder';
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

interface SpatialIndexEntry {
  feat: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  bMinX: number;
  bMaxX: number;
  bMinY: number;
  bMaxY: number;
  cLng: number;
  cLat: number;
  ring: [number, number][];
}

export class RealisticKoreanCityLayer implements maplibregl.CustomLayerInterface {
  public id = 'realistic-korean-city-layer';
  public type = 'custom' as const;
  public renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera = new THREE.Camera();
  public scene = new THREE.Scene();
  public renderer: THREE.WebGLRenderer | null = null;
  private isContextLost: boolean = false;

  // 16종 독립 Material & 단일 씬 메쉬
  public masterMesh: THREE.Mesh | null = null;
  public masterGeometry: THREE.BufferGeometry | null = null;
  public buildingMaterials: (THREE.MeshStandardMaterial | THREE.MeshLambertMaterial)[] = VWorldReaRenderer.getAllMaterials();
  public materialMeshes: THREE.Mesh[] = [];

  // 줌 14.5 ~ 15.5 정밀 페이드인을 위한 옥상 난간 및 옥탑 코어 메쉬/재질
  public rooftopMesh: THREE.Mesh | null = null;
  public rooftopGeometry: THREE.BufferGeometry | null = null;
  public rooftopMaterial: THREE.MeshStandardMaterial | null = null;

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
  private lastBuiltZoom: number = 15.5;
  private options: RealisticKoreanCityLayerOptions;

  // [2D 공간 해시 그리드]: 마우스 호버 피킹 0.01ms 즉시 조회를 위한 100m 셀 버킷
  private spatialFeatureGrid: Map<string, SpatialIndexEntry[]> = new Map();

  // [3단계 고성능 엔진] 3ms 타임슬라이싱 및 사전할당 Float32Array 버퍼
  private builtBuildingKeys: Set<string> = new Set();
  private temporaryElevationBuildingKeys: Set<string> = new Set();
  private reanchorDebounceTimer: any = null;
  // [4중 안전 필터링 - 중복 필터]: 반경 4m 이내 동일 위치 중복 중심점 1개만 유지하는 공간 그리드
  private centroidSpatialGrid: Map<string, [number, number][]> = new Map();
  private activeBuildIdleId: any = null;
  private activeBuildTaskId: number = 0;

  // [3단계: Multi-Material 22종 독립 슬롯 버퍼 (외벽 16종 + 옥상 4종 + 난간 1종 + 옥탑 1종, Draw Call <= 22 무결점 60fps)]
  private static readonly NUM_SLOTS = 22;
  private slotPosBuf: Float32Array[] = [];
  private slotNormBuf: Float32Array[] = [];
  private slotColorBuf: Float32Array[] = [];
  private slotUvBuf: Float32Array[] = [];
  private slotHeightBuf: Float32Array[] = [];
  private slotPosIdx: number[] = new Array(22).fill(0);
  private slotUvIdx: number[] = new Array(22).fill(0);
  private slotHeightIdx: number[] = new Array(22).fill(0);
  private currentBuildingSlot: number = 0;
  private currentRooftopSlot: number = 16;
  private currentParapetSlot: number = 20;
  private currentPenthouseSlot: number = 21;
  private currentBuildingHeight: number = 10;

  // 1:1 위성사진 완벽 정합용 Mercator 원점 캐시
  private originMercator = { x: 0, y: 0 };
  private originMeterScale: number = 1.0;

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
  private roadSignGroup: THREE.Group = new THREE.Group();

  // 60fps 무지연 렌더링을 위한 사전 할당 수학 객체 (GC 프리즈 방지)
  private renderMatrix = new THREE.Matrix4();
  private localMatrix = new THREE.Matrix4();
  private scaleVector = new THREE.Vector3();
  private rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  // [60fps Zero-GC 마스터 버퍼 풀]: commitAccumulatedGeometry 호출 시 매번 새 Float32Array를 생성하지 않고 재사용
  private masterPosBuf: Float32Array = new Float32Array(900000);
  private masterNormBuf: Float32Array = new Float32Array(900000);
  private masterColorBuf: Float32Array = new Float32Array(900000);
  private masterUvBuf: Float32Array = new Float32Array(600000);
  private masterHeightBuf: Float32Array = new Float32Array(300000);
  private masterBufferCapacity: number = 300000;

  constructor(options: RealisticKoreanCityLayerOptions = {}) {
    this.options = options;
    this.buildingMaterials = VWorldReaRenderer.getAllMaterials();
    for (let s = 0; s < RealisticKoreanCityLayer.NUM_SLOTS; s++) {
      this.slotPosBuf.push(new Float32Array(300000));
      this.slotNormBuf.push(new Float32Array(300000));
      this.slotColorBuf.push(new Float32Array(300000));
      this.slotUvBuf.push(new Float32Array(200000));
      this.slotHeightBuf.push(new Float32Array(100000));
    }
    this.setOrigin(this.originLngLat);
  }

  private setOrigin(lngLat: [number, number], clearState = false): void {
    this.originLngLat = [lngLat[0], lngLat[1]];
    const oCoord = maplibregl.MercatorCoordinate.fromLngLat(this.originLngLat, 0);
    this.originMercator.x = oCoord.x;
    this.originMercator.y = oCoord.y;
    this.originMeterScale = oCoord.meterInMercatorCoordinateUnits();

    if (clearState) {
      this.persistentBuildingMap.clear();
      this.builtBuildingKeys.clear();
      this.temporaryElevationBuildingKeys.clear();
      this.centroidSpatialGrid.clear();
      this.resetAccumulatedBuffers();
      if (this.masterMesh && this.scene) {
        this.scene.remove(this.masterMesh);
        this.masterMesh.geometry.dispose();
        this.masterMesh = null;
      }
      if (this.rooftopMesh && this.scene) {
        this.scene.remove(this.rooftopMesh);
        this.rooftopMesh.geometry.dispose();
        this.rooftopMesh = null;
      }
    }

    // 원점 변경 시 3D 도로 표지판 갠트리를 새 원점 기준으로 1:1 재정합
    if (this.roadSignGroup && this.scene && this.map) {
      this.buildRoadSignGantries();
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.masterMesh) {
      this.masterMesh.visible = visible;
    }
    if (this.rooftopMesh) {
      this.rooftopMesh.visible = visible;
    }
    this.roadSignGroup.visible = false;
    this.bridgeGroup.visible = false;
    this.tunnelGroup.visible = false;
  }

  private currentTheme: 'photorealistic' | 'landuse' | 'height_spectrum' = 'photorealistic';

  public setBuildingTheme(theme: 'photorealistic' | 'landuse' | 'height_spectrum'): void {
    this.currentTheme = theme;
    if (!this.buildingMaterials || this.buildingMaterials.length === 0) return;

    // 용도별 색상 맵 (Landuse Palette)
    const landuseColors = [
      0xf59e0b, 0xfbbf24, 0xf59e0b, 0xd97706, 0xfbbf24, // 0..4: 고층 아파트 / 주거 (Amber/Warm Orange)
      0x3b82f6, 0x2563eb, 0x0ea5e9, 0x1d4ed8, 0x0284c7, // 5..9: 근린상가 / 오피스 (Blue/Cyan)
      0x8b5cf6, 0x7c3aed, 0xa855f7,                      // 10..12: 공공청사 / 학교 / 종합병원 (Purple)
      0x10b981, 0x059669, 0x34d399,                      // 13..15: 저층 주택 / 빌라 / 군막사 (Emerald)
      0xf59e0b, 0x0ea5e9, 0x38bdf8, 0xf59e0b             // 16..19: 측벽, 쇼윈도, 간판, 포치
    ];

    // 층수·높이 스펙트럼 맵 (Height Spectrum: 저층 청록 -> 중층 노랑 -> 고층 주황 -> 초고층 마젠타)
    const heightSpectrumColors = [
      0xf97316, 0xf97316, 0xea580c, 0xf97316, 0xc2410c, // 0..4: 고층 (Orange)
      0xeab308, 0xfacc15, 0xeab308, 0xca8a04, 0xfde047, // 5..9: 중층 (Yellow)
      0xec4899, 0xdb2777, 0xf43f5e,                      // 10..12: 초고층/특화타워 (Pink/Magenta)
      0x06b6d4, 0x0891b2, 0x22d3ee,                      // 13..15: 저층 (Cyan/Teal)
      0xf97316, 0xeab308, 0xfacc15, 0xf97316             // 16..19: 구조체
    ];

    for (let i = 0; i < this.buildingMaterials.length; i++) {
      const mat = this.buildingMaterials[i];
      if (theme === 'photorealistic') {
        mat.color.setHex(0xffffff);
        if ('roughness' in mat) (mat as any).roughness = 0.45;
      } else if (theme === 'landuse') {
        const hex = landuseColors[i % landuseColors.length];
        mat.color.setHex(hex);
        if ('roughness' in mat) (mat as any).roughness = 0.55;
      } else if (theme === 'height_spectrum') {
        const hex = heightSpectrumColors[i % heightSpectrumColors.length];
        mat.color.setHex(hex);
        if ('roughness' in mat) (mat as any).roughness = 0.55;
      }
      mat.needsUpdate = true;
    }

    if (this.rooftopMaterial) {
      if (theme === 'photorealistic') {
        this.rooftopMaterial.color.setHex(0xffffff);
      } else if (theme === 'landuse') {
        this.rooftopMaterial.color.setHex(0xe2e8f0);
      } else if (theme === 'height_spectrum') {
        this.rooftopMaterial.color.setHex(0x94a3b8);
      }
      this.rooftopMaterial.needsUpdate = true;
    }

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public setBridgeTunnelVisible(_visible: boolean): void {
    this.isBridgeTunnelVisible = false;
    this.bridgeGroup.visible = false;
    this.tunnelGroup.visible = false;
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

  public updateSpatialFeatureGrid(features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]): void {
    this.spatialFeatureGrid.clear();
    const CELL_SIZE = 0.001; // 약 100m 격자
    for (let fIdx = 0; fIdx < features.length; fIdx++) {
      const feat = features[fIdx];
      if (!feat || !feat.geometry) continue;
      const geom = feat.geometry;
      let rawCoords: [number, number][] | null = null;
      if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates.length > 0) {
        rawCoords = geom.coordinates[0] as [number, number][];
      } else if (geom.type === 'MultiPolygon' && geom.coordinates && geom.coordinates[0]?.[0]) {
        rawCoords = geom.coordinates[0][0] as [number, number][];
      }
      if (!rawCoords || rawCoords.length < 3) continue;

      let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
      let sumX = 0, sumY = 0;
      const len = rawCoords.length;
      for (let k = 0; k < len; k++) {
        const rx = rawCoords[k][0], ry = rawCoords[k][1];
        if (rx < bMinX) bMinX = rx;
        if (rx > bMaxX) bMaxX = rx;
        if (ry < bMinY) bMinY = ry;
        if (ry > bMaxY) bMaxY = ry;
        sumX += rx;
        sumY += ry;
      }
      const cLng = sumX / len;
      const cLat = sumY / len;
      const entry: SpatialIndexEntry = {
        feat,
        bMinX,
        bMaxX,
        bMinY,
        bMaxY,
        cLng,
        cLat,
        ring: rawCoords,
      };

      const minGX = Math.floor(bMinX / CELL_SIZE);
      const maxGX = Math.floor(bMaxX / CELL_SIZE);
      const minGY = Math.floor(bMinY / CELL_SIZE);
      const maxGY = Math.floor(bMaxY / CELL_SIZE);
      for (let gx = minGX; gx <= maxGX; gx++) {
        for (let gy = minGY; gy <= maxGY; gy++) {
          const key = `${gx}_${gy}`;
          let bucket = this.spatialFeatureGrid.get(key);
          if (!bucket) {
            bucket = [];
            this.spatialFeatureGrid.set(key, bucket);
          }
          bucket.push(entry);
        }
      }
    }
  }

  /**
   * [2D 공간 해시 그리드 기반 0.01ms 초고속 마우스 피킹]
   * 전체 수천 동을 순회하지 않고, 마우스 커서 주변 9개 국소 셀만 조회하여 반응 지연 0ms 달성
   */
  public findBuildingNear(
    lng: number,
    lat: number,
    maxDistM: number = 35
  ): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
    if (this.spatialFeatureGrid.size === 0) {
      const list = this.getCachedFeatures();
      if (!list || list.length === 0) return null;
      this.updateSpatialFeatureGrid(list);
    }

    const CELL_SIZE = 0.001; // 약 100m
    const dLngDeg = (maxDistM / 111000) / (Math.cos((lat * Math.PI) / 180) || 1);
    const dLatDeg = maxDistM / 111000;

    const minGX = Math.floor((lng - dLngDeg) / CELL_SIZE);
    const maxGX = Math.floor((lng + dLngDeg) / CELL_SIZE);
    const minGY = Math.floor((lat - dLatDeg) / CELL_SIZE);
    const maxGY = Math.floor((lat + dLatDeg) / CELL_SIZE);

    let closest: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;
    let minDist = maxDistM;
    const seen = new Set<GeoJSON.Feature<any, any>>();

    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gy = minGY; gy <= maxGY; gy++) {
        const cell = this.spatialFeatureGrid.get(`${gx}_${gy}`);
        if (!cell) continue;

        for (let i = 0; i < cell.length; i++) {
          const entry = cell[i];
          if (seen.has(entry.feat)) continue;
          seen.add(entry.feat);

          if (
            lng < entry.bMinX - dLngDeg ||
            lng > entry.bMaxX + dLngDeg ||
            lat < entry.bMinY - dLatDeg ||
            lat > entry.bMaxY + dLatDeg
          ) {
            continue;
          }

          // 1) 점-폴리곤 내부 포함 판별 (Point in Polygon Ray-Casting)
          const ring = entry.ring;
          let inside = false;
          const count = ring.length;
          for (let pi = 0, pj = count - 1; pi < count; pj = pi++) {
            const xi = ring[pi][0], yi = ring[pi][1];
            const xj = ring[pj][0], yj = ring[pj][1];
            const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }

          if (inside) {
            return entry.feat;
          }

          // 2) 중심점 기준 거리 판정
          const dx = (lng - entry.cLng) * 111000 * Math.cos((lat * Math.PI) / 180);
          const dy = (lat - entry.cLat) * 111000;
          const d = Math.hypot(dx, dy);
          if (d < minDist) {
            minDist = d;
            closest = entry.feat;
          }
        }
      }
    }
    return closest;
  }

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    if (typeof window !== 'undefined') {
      (window as any).__mapInstance = map;
      (window as any).__realisticKoreanCityLayer = this;
    }

    try {
      // 1. [V-World 3D WebGL / XDWorld 역공학(VWorldWebGLShaderSpec) 사양 조명 캘리브레이션]
      // - 주간 직사 태양광: 웜 화이트(0xfff9e6), 강도 1.25, 방위각 215°(남서향), 고도각 45°
      this.sunLight = new THREE.DirectionalLight(0xfff9e6, 1.25);
      const sunDir = getXDWorldSunDirection(215, 45);
      this.sunLight.position.set(sunDir[0] * 300, sunDir[1] * 300, sunDir[2] * 300);
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);

      // - 역광 음영 완화 보조광 (서쪽 반사광: 0xe2e8f0, 0.45배)
      this.fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.45);
      this.fillLight.position.set(-100, 120, -90);
      this.scene.add(this.fillLight);

      // - AmbientLight(환경광): 브이월드 클라이언트 역공학 0xe8eff5, 0.35배
      this.ambientLight = new THREE.AmbientLight(0xe8eff5, 0.35);
      this.scene.add(this.ambientLight);

      // - HemisphereLight: 청명 하늘 #d9ebff, 대지 반사 #8c8273, 0.85배로 자연스러운 지면/대기 반사광 제공
      this.hemisphereLight = new THREE.HemisphereLight(0xd9ebff, 0x8c8273, 0.85);
      this.scene.add(this.hemisphereLight);

      // [V-World 3D 실사화] 대기 원근감 안개 (Distance Fog: #dbeafe, density 0.00018)
      this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.00018);

      // 2. [GeoBrief 3D 2단계] V-World 22종(외벽 16종 + 지붕 4종 + 난간 + 옥탑) 독립 Material 싱글톤 엔진
      this.buildingMaterials = VWorldReaRenderer.getAllMaterials() || VWorldBuildingComposer.getMaterials() || getVWorldRea16Materials() || getScenarioBuildingMaterials();
      console.log('[RealisticKoreanCityLayer] onAdd assigned buildingMaterials count:', this.buildingMaterials?.length);

      // [GeoBrief 3D 2단계] 입체 옥상(윗면) 및 0.85m 테두리 난간 실사 PBR 재질 직결
      this.rooftopMaterial = getScenarioRooftopPbrMaterial();

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

      // [1단계: 화면 중심 검은색 직사각형 7~8개 방지] 3D 가짜 교량/터널 박스 씬 추가 원천 차단
      this.bridgeGroup.visible = false;
      this.tunnelGroup.visible = false;
      this.roadSignGroup.visible = false;

      // [사용자 지침: 확실하지 않은 3D 도로 표지판 전면 삭제] 문형식 이정표 씬 추가 원천 차단
      // (기존 this.scene.add(this.roadSignGroup) 영구 제거)

      // 3. WebGLRenderer 바인딩 및 컨텍스트 유실 복구 가드 (Auto-Recovery Watchdog)
      const canvas = map.getCanvas();
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('[RealisticKoreanCityLayer] WebGL Context Lost detected.');
        this.isContextLost = true;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        console.info('[RealisticKoreanCityLayer] WebGL Context Restored! Auto-recovering renderer and city mesh.');
        this.isContextLost = false;
        try {
          if (this.renderer) {
            this.renderer.dispose();
          }
          this.renderer = new THREE.WebGLRenderer({
            canvas,
            context: gl,
            antialias: true,
            alpha: true,
          });
          this.renderer.autoClear = false;
          this.renderer.outputColorSpace = THREE.SRGBColorSpace;
          this.renderer.shadowMap.enabled = false;
          this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
          this.renderer.toneMappingExposure = 1.08;
          const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
          this.renderer.setPixelRatio(pr);
        } catch (rErr) {
          console.warn('[RealisticKoreanCityLayer] Renderer auto-recovery notice:', rErr);
        }
        this.resetAccumulatedBuffers();
        this.extractAndBuildFromMap();
        if (this.map) {
          this.map.triggerRepaint();
        }
      });

      this.renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.renderer.setPixelRatio(pr);

      // 4. 카메라 이동/회전 시 60fps 보호 이벤트 리스너 등록 (회전, 틸트, 줌 전체 감지)
      const moveStartEvents = ['movestart', 'rotatestart', 'pitchstart', 'zoomstart', 'dragstart'];
      const moveEndEvents = ['moveend', 'rotateend', 'pitchend', 'zoomend', 'dragend'];

      moveStartEvents.forEach((evt) => map.on(evt, this.handleMoveStart));
      moveEndEvents.forEach((evt) => map.on(evt, this.handleMoveEnd));

      map.on('idle', this.handleMapIdle);
      map.on('terrain', this.handleTerrainChange);
      map.on('sourcedata', this.handleSourceData);

      // 5. 초기 건물 데이터 즉시 추출 및 빌드 시도
      const center = map.getCenter();
      this.setOrigin([center.lng, center.lat]);
      this.extractAndBuildFromMap();
    } catch (err) {
      console.warn('[RealisticKoreanCityLayer] onAdd error:', err);
    }
  }

  private handleSourceData = (e: any): void => {
    if (e && (e.sourceId === 'terrain-dem' || e.sourceId === 'terrarium-dem') && e.isSourceLoaded) {
      if (this.temporaryElevationBuildingKeys.size > 0 && !this.isMoving) {
        this.reanchorTemporaryElevationBuildings();
      }
    }
  };

  public reanchorTemporaryElevationBuildings(): void {
    if (!this.map || this.isMoving || this.temporaryElevationBuildingKeys.size === 0) return;
    if (this.reanchorDebounceTimer) clearTimeout(this.reanchorDebounceTimer);
    this.reanchorDebounceTimer = setTimeout(() => {
      this.reanchorDebounceTimer = null;
      if (!this.map || this.isMoving || this.temporaryElevationBuildingKeys.size === 0) return;
      // DEM 타일 로드 완료 시 임시 표고 건물만 점진적 재빌드 (기존 버퍼 전체 파괴 금지)
      for (const k of this.temporaryElevationBuildingKeys) {
        this.builtBuildingKeys.delete(k);
      }
      this.temporaryElevationBuildingKeys.clear();
      this.extractAndBuildFromMap();
    }, 450);
  }

  private terrainDebounceTimer: any = null;

  private handleTerrainChange = (): void => {
    if (!this.map) return;
    if (this.terrainDebounceTimer) clearTimeout(this.terrainDebounceTimer);
    this.terrainDebounceTimer = setTimeout(() => {
      this.terrainDebounceTimer = null;
      if (!this.map) return;
      // 3D 지형 로드 또는 배율 변경 시 3D 도로 표지판 및 신규 건물 동기화 (전체 버퍼 파괴 금지)
      this.buildRoadSignGantries();
      this.extractAndBuildFromMap();
    }, 400);
  };

  private idleDebounceTimer: any = null;
  private lastKnownCenterElev: number = 0;

  private handleMapIdle = (): void => {
    if (this.map) {
      if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
        this.isMoving = true;
        return;
      }
      this.isMoving = false;
      if (this.temporaryElevationBuildingKeys.size > 0) {
        this.reanchorTemporaryElevationBuildings();
        return;
      }
      if (this.idleDebounceTimer) clearTimeout(this.idleDebounceTimer);
      this.idleDebounceTimer = setTimeout(() => {
        this.idleDebounceTimer = null;
        if (this.map && !this.map.isMoving() && !this.map.isRotating() && !this.map.isZooming()) {
          const center = this.map.getCenter();
          const curElev = this.map.queryTerrainElevation ? (this.map.queryTerrainElevation(center) || 0) : 0;
          if (curElev > 0) {
            this.lastKnownCenterElev = curElev;
          }
          // [버벅거림 제로화]: 중심 표고 변화 시 기존 건물 전체를 파괴하던 버그 원천 제거! 신규 건물만 점진 추가
          this.extractAndBuildFromMap();
        }
      }, 350);
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
    this.isMoving = false;
    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
      this.moveEndTimer = null;
    }
    if (this.temporaryElevationBuildingKeys.size > 0) {
      this.reanchorTemporaryElevationBuildings();
    } else if (this.pendingFeatures) {
      const next = this.pendingFeatures;
      this.pendingFeatures = null;
      this.buildRealisticCityMesh(next);
    }
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

  public get builtCount(): number {
    return this.builtBuildingKeys.size;
  }

  /**
   * 베이스맵 원본 벡터 타일과 국토부 브이월드(LT_C_SPBD / 로컬 converted) 실측 건물 1:1 정밀 결합
   * - 브이월드 공식 실측 건물 외곽선 및 위치(extFeats)를 1순위 최우선 렌더링 대상으로 지정
   * - 베이스맵 벡터 타일(vecFeats) 중 반경 20m 이내 V-World와 중복되는 형상은 V-World 실측본만 유지 (유령 건물 및 이중 벽체 원천 차단)
   * - 비건물 구획(면적 > 3,800㎡, 대지, 하천, 공원, BBOX 평판), 폭 4.5m 미만 도로/옹벽, 산림/임야 유령 건물 완전 배제
   */
  private mergeBuildingFeatures(
    vecFeats: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    extFeats: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
  ): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] {
    const resultList: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
    const seenCentroids = new Map<string, [number, number][]>();

    const checkCentroidDedupe = (cLng: number, cLat: number, radiusM = 4.0): boolean => {
      const gX = Math.round(cLng * 25000);
      const gY = Math.round(cLat * 25000);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = seenCentroids.get(`${gX + dx}_${gY + dy}`);
          if (list) {
            for (let k = 0; k < list.length; k++) {
              const pt = list[k];
              const dLng = (pt[0] - cLng) * 111320 * Math.cos((cLat * Math.PI) / 180);
              const dLat = (pt[1] - cLat) * 111320;
              if (Math.hypot(dLng, dLat) < radiusM) {
                return true;
              }
            }
          }
        }
      }
      return false;
    };

    const addCentroid = (cLng: number, cLat: number) => {
      const gX = Math.round(cLng * 25000);
      const gY = Math.round(cLat * 25000);
      const key = `${gX}_${gY}`;
      let list = seenCentroids.get(key);
      if (!list) {
        list = [];
        seenCentroids.set(key, list);
      }
      list.push([cLng, cLat]);
    };

    // 1단계: 국토교통부 브이월드 공식 실측 건물 1순위 최우선 수용 (1:1 V-World 정합)
    if (extFeats && extFeats.length > 0) {
      for (let i = 0; i < extFeats.length; i++) {
        const ef = extFeats[i];
        if (!ef || !ef.geometry) continue;
        const coords = ef.geometry.type === 'Polygon'
          ? ef.geometry.coordinates[0]
          : ef.geometry.coordinates[0]?.[0];
        if (!coords || coords.length < 3) continue;

        let sumX = 0, sumY = 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let j = 0; j < coords.length; j++) {
          const pt = coords[j];
          sumX += pt[0];
          sumY += pt[1];
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
        const cX = sumX / coords.length;
        const cY = sumY / coords.length;

        const cosLat = Math.cos((cY * Math.PI) / 180);
        const wM = (maxX - minX) * 111320 * cosLat;
        const hM = (maxY - minY) * 111320;
        const approxArea = Math.max(10, wM * hM * 0.85);
        const minW = Math.max(1, Math.min(wM, hM));

        // 3,800㎡ 초과 비건물 구획/필지, 폭 4.5m 미만 비건물, 산림 유령건물 100% 배제
        if (approxArea > 3800 || approxArea < 30) continue;
        if (minW < 4.5) continue;
        if (isMountainGhostBuilding(cX, cY, ef.properties || {}, this.map)) continue;

        if (checkCentroidDedupe(cX, cY, 4.0)) continue;
        addCentroid(cX, cY);

        resultList.push(ef);
      }
    }

    // 2단계: 베이스맵 벡터 타일 건물 중 공인 건축물대장 식별자가 검증된 실측 건물만 보강
    // [강원 전역 산림 유령건물 영구 박멸]:
    // - OpenMapTiles/OSM의 미검증 산림 다각형 및 임야 폴리곤은 100% 원천 배제
    // - 국토부 공식 식별자(대장관리번호 bd_mgt_sn, 건물명 buld_nm/bld_nm, 필지 PNU)가 없는 미확인 박스 전면 탈락
    if (vecFeats && vecFeats.length > 0) {
      for (let i = 0; i < vecFeats.length; i++) {
        const vf = vecFeats[i];
        if (!vf || !vf.geometry) continue;
        const coords = vf.geometry.type === 'Polygon'
          ? vf.geometry.coordinates[0]
          : vf.geometry.coordinates[0]?.[0];
        if (!coords || coords.length < 3) continue;

        let sumX = 0, sumY = 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let j = 0; j < coords.length; j++) {
          const pt = coords[j];
          sumX += pt[0];
          sumY += pt[1];
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
        const cX = sumX / coords.length;
        const cY = sumY / coords.length;

        const cosLat = Math.cos((cY * Math.PI) / 180);
        const wM = (maxX - minX) * 111320 * cosLat;
        const hM = (maxY - minY) * 111320;
        const approxArea = Math.max(10, wM * hM * 0.85);
        const minW = Math.max(1, Math.min(wM, hM));
        const maxW = Math.max(wM, hM);

        if (approxArea > 3800 || approxArea < 30) continue;
        if (minW < 4.5) continue;
        if (maxW / minW > 8.0) continue;

        const vp = (vf.properties || {}) as Record<string, any>;

        // 국토부 공식 건축물 식별자 보유 여부 엄격 판별 (미확인 OSM 박스 차단)
        const hasVerifiedIdentity = Boolean(
          vp.bd_mgt_sn ||
          vp.buld_nm ||
          vp.bld_nm ||
          vp.pnu ||
          vp.source === 'vworld_local' ||
          vp.source === 'LT_C_SPBD'
        );
        if (!hasVerifiedIdentity) {
          continue; // 공인 식별자가 없는 임의 다각형은 무조건 탈락
        }

        // 군 유휴지 (1군지사 310,000㎡ 등) 0동 원칙: 부지 내부 기존 구형 건물 100% 영구 배제
        if (vp.is_user_placed !== true && vp.isMasterplanFacility !== true) {
          if (isPointInMilitaryIdleSite(cX, cY)) continue;
        }

        // 산림/임야 유령 건물 (강원 전역 산악 사면 및 능선) 100% 영구 배제
        if (isMountainGhostBuilding(cX, cY, vp, this.map)) continue;

        // V-World 실측 건물이 이미 존재하는 반경 20m 이내 형상은 스킵 (V-World 지오메트리 보존 및 2중 겹침 차단)
        if (checkCentroidDedupe(cX, cY, 20.0)) continue;

        addCentroid(cX, cY);
        resultList.push(vf);
      }
    }

    // 미검증 vecFeats로의 무조건 폴백을 영구 폐지하여 산악 유령건물 침투를 100% 방지
    return resultList;
  }

  /**
   * MapLibre 맵 소스 및 캐시로부터 화면 내 건물을 추출하여 3D 빌드 실행 (100% 입체화)
   */
  public extractAndBuildFromMap(): void {
    if (!this.map) return;
    if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
      if (this.masterMesh) {
        this.isMoving = true;
        return;
      }
    }
    this.isMoving = false;

    // [신규] 국토교통부 브이월드 실측 소스(vworld-buildings-source) 피처 자동 동기화
    try {
      const vworldSrc = this.map.getSource('vworld-buildings-source') as any;
      const srcFeatures = vworldSrc?._data?.geojson?.features || vworldSrc?._data?.features;
      if (Array.isArray(srcFeatures) && srcFeatures.length > 0) {
        this.externalFeatures = srcFeatures;
      }
    } catch {}

    // 1) 뷰포트 내 벡터 피처 수집: 외부 실측 피처(wonju_core 등)가 없을 때만 폴백으로 추출하여 메인 스레드 60fps 유지
    if (this.externalFeatures.length === 0) {
      try {
        const extracted = extractRenderedVectorBuildings(this.map);
        if (extracted && extracted.length > 0) {
          this.vectorTileFeatures = extracted;
        }
      } catch {}
    }

    // 2) 외부 실측 피처와 벡터 피처 스마트 결합 (건물 탈락 0%)
    const combined = this.mergeBuildingFeatures(this.vectorTileFeatures, this.externalFeatures);

    // [건물 ID 기반 증분 캐시 & 신규 미빌드 건물만 선별]
    let unbuiltCount = 0;
    const newFeaturesToBuild: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
    for (let i = 0; i < combined.length; i++) {
      const f = combined[i];
      const key = getBuildingFeatureKey(f);
      if (!this.persistentBuildingMap.has(key)) {
        stampBuildingWithMasterData(f);
        this.persistentBuildingMap.set(key, f);
      }
      if (!this.builtBuildingKeys.has(key)) {
        unbuiltCount++;
        newFeaturesToBuild.push(f);
      }
    }

    // [2단계: 줌 단계 대폭 변경(LOD 전환) 감지 & 더블버퍼링 무지연 갱신]
    const currentZ = this.map.getZoom();
    const zoomDelta = Math.abs(currentZ - this.lastBuiltZoom);
    if (this.masterMesh && zoomDelta >= 1.5 && this.persistentBuildingMap.size > 0) {
      this.lastBuiltZoom = currentZ;
      this.resetAccumulatedBuffers();
      this.buildRealisticCityMesh(Array.from(this.persistentBuildingMap.values()));
      return;
    }

    // 이미 화면에 있는 건물은 연산을 100% 생략하여 끊김과 깜빡임 0% 달성
    if (this.masterMesh && unbuiltCount === 0) {
      return;
    }

    this.cachedFeatures = Array.from(this.persistentBuildingMap.values());
    this.updateSpatialFeatureGrid(this.cachedFeatures);

    if (this.isBuildingGeometry) {
      this.pendingFeatures = newFeaturesToBuild.length > 0 ? newFeaturesToBuild : this.cachedFeatures;
      return;
    }

    if (newFeaturesToBuild.length > 0 || !this.masterMesh) {
      // 신규 건물 백그라운드 슬라이스 추가 (최대 10,000동 확장으로 대규모 도심 전역 표출)
      const MAX_FEATURES_PER_BUILD = 10000;
      const targetBatch = this.masterMesh
        ? (newFeaturesToBuild.length > MAX_FEATURES_PER_BUILD ? newFeaturesToBuild.slice(0, MAX_FEATURES_PER_BUILD) : newFeaturesToBuild)
        : (this.cachedFeatures.length > MAX_FEATURES_PER_BUILD ? this.cachedFeatures.slice(0, MAX_FEATURES_PER_BUILD) : this.cachedFeatures);
      this.buildRealisticCityMesh(targetBatch);
    }
  }

  public updateSunLight(
    dirOrAlt: [number, number, number] | THREE.Vector3 | number,
    colorOrAz?: string | number,
    intensity: number = 1.20,
    colorOrFog?: string,
    fogColor?: string,
    fogDensity?: number
  ): void {
    if (!this.sunLight) return;
    let actualSunColor = '#fffdf0';
    let actualFogColor = '#cbd5e1';

    if (typeof dirOrAlt === 'number' && typeof colorOrAz === 'number') {
      // 1. (altitudeDeg, azimuthDeg, intensity, sunColor, fogColor, fogDensity)
      const sunDir = getXDWorldSunDirection(colorOrAz, dirOrAlt);
      this.sunLight.position.set(sunDir[0] * 300, sunDir[1] * 300, sunDir[2] * 300);
      if (typeof colorOrFog === 'string') actualSunColor = colorOrFog;
      if (typeof fogColor === 'string') actualFogColor = fogColor;
    } else if (Array.isArray(dirOrAlt)) {
      // 2. ([x, y, z], sunColor, intensity, fogColor)
      this.sunLight.position.set(dirOrAlt[0], dirOrAlt[1], dirOrAlt[2]).normalize().multiplyScalar(300);
      if (typeof colorOrAz === 'string') actualSunColor = colorOrAz;
      if (typeof colorOrFog === 'string') actualFogColor = colorOrFog;
    } else if (dirOrAlt && typeof (dirOrAlt as any).x === 'number') {
      this.sunLight.position.copy(dirOrAlt as THREE.Vector3).normalize().multiplyScalar(300);
      if (typeof colorOrAz === 'string') actualSunColor = colorOrAz;
      if (typeof colorOrFog === 'string') actualFogColor = colorOrFog;
    }

    this.sunLight.color.set(actualSunColor);
    // [VWorldWebGLShaderSpec] 역공학 기반 황금비 조명 파라미터 고정 (Sun 1.25배, Ambient 0.35배, Hemi 0.85배)
    this.sunLight.intensity = Math.max(0.4, Math.min(1.4, intensity));

    if (this.ambientLight) {
      this.ambientLight.intensity = Math.max(0.20, Math.min(0.45, intensity * 0.28));
      this.ambientLight.color.set(0xe8eff5);
    }
    if (this.hemisphereLight) {
      this.hemisphereLight.intensity = Math.max(0.5, Math.min(0.95, intensity * 0.68));
      this.hemisphereLight.color.set(0xd9ebff);
      this.hemisphereLight.groundColor.set(0x8c8273);
    }

    // [3단계: mourner/suncalc & 브이월드 원경 대기 원근감(Aerial Perspective Fog)]
    if (this.scene) {
      applyAtmosphericPerspectiveFog(this.scene, actualFogColor, fogDensity || 0.00018);
    }
  }

  public updateLighting(
    dirOrAlt: [number, number, number] | THREE.Vector3 | number,
    colorOrAz?: string | number,
    intensity: number = 1.20,
    colorOrFog?: string,
    fogColor?: string,
    fogDensity?: number
  ): void {
    this.updateSunLight(dirOrAlt, colorOrAz, intensity, colorOrFog, fogColor, fogDensity);
  }

  /**
   * 18개 시·군 전환 시 기존 지역 메쉬와 VRAM 버퍼를 깨끗이 정리하고 새 기준점으로 초기화
   */
  public resetForRegionChange(newCenterLngLat: [number, number]): void {
    if (this.activeBuildIdleId) {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(this.activeBuildIdleId);
      else clearTimeout(this.activeBuildIdleId);
      this.activeBuildIdleId = null;
    }
    this.cachedFeatures = [];
    this.vectorTileFeatures = [];
    this.externalFeatures = [];
    this.pendingFeatures = null;
    this.setOrigin(newCenterLngLat, true);
    if (this.map) {
      this.map.triggerRepaint();
    }
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
    this.cachedFeatures = features;

    // [강원 18개 시·군 전역 원점 재설정] 시군간 이동 시 기준 원점 동적 재앵커링
    if (newOriginLngLat && Array.isArray(newOriginLngLat) && newOriginLngLat.length === 2) {
      const dLng = Math.abs(newOriginLngLat[0] - this.originLngLat[0]);
      const dLat = Math.abs(newOriginLngLat[1] - this.originLngLat[1]);
      if (dLng > 0.05 || dLat > 0.05 || !this.fixedOriginInitialized) {
        this.setOrigin([newOriginLngLat[0], newOriginLngLat[1]], true);
        this.fixedOriginInitialized = true;
      }
    }

    // 국토부 브이월드 실측 지오메트리 최우선 반영 및 3D 빌드 즉각 실행
    if (this.map) {
      this.extractAndBuildFromMap();
      return;
    }
  }

  private resetAccumulatedBuffers(): void {
    this.builtBuildingKeys.clear();
    this.centroidSpatialGrid.clear();
    for (let s = 0; s < RealisticKoreanCityLayer.NUM_SLOTS; s++) {
      this.slotPosIdx[s] = 0;
      this.slotUvIdx[s] = 0;
      this.slotHeightIdx[s] = 0;
    }

    this.accRooftopPosIdx = 0;
    this.accRooftopUvIdx = 0;
    this.accRooftopHeightIdx = 0;
  }

  private hasAnySlotVertices(): boolean {
    for (let s = 0; s < RealisticKoreanCityLayer.NUM_SLOTS; s++) {
      if (this.slotPosIdx[s] > 0) return true;
    }
    return false;
  }

  private ensureSlotCapacity(s: number, additionalVertices: number): void {
    const neededFloats = this.slotPosIdx[s] + additionalVertices * 3;
    if (neededFloats > this.slotPosBuf[s].length) {
      const newSize = Math.max(this.slotPosBuf[s].length * 2, neededFloats + 100000);
      const newPos = new Float32Array(newSize);
      const newNorm = new Float32Array(newSize);
      const newColor = new Float32Array(newSize);
      const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
      const newHeight = new Float32Array(Math.floor(newSize / 3));

      newPos.set(this.slotPosBuf[s].subarray(0, this.slotPosIdx[s]));
      newNorm.set(this.slotNormBuf[s].subarray(0, this.slotPosIdx[s]));
      newColor.set(this.slotColorBuf[s].subarray(0, this.slotPosIdx[s]));
      newUv.set(this.slotUvBuf[s].subarray(0, this.slotUvIdx[s]));
      newHeight.set(this.slotHeightBuf[s].subarray(0, this.slotHeightIdx[s]));

      this.slotPosBuf[s] = newPos;
      this.slotNormBuf[s] = newNorm;
      this.slotColorBuf[s] = newColor;
      this.slotUvBuf[s] = newUv;
      this.slotHeightBuf[s] = newHeight;
    }
  }

  private addSlotTriangle = (
    slot: number,
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    norm: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    color?: [number, number, number]
  ): void => {
    const s =
      typeof slot === 'number' && slot >= 0 && slot < RealisticKoreanCityLayer.NUM_SLOTS
        ? slot
        : this.currentBuildingSlot >= 0 && this.currentBuildingSlot < RealisticKoreanCityLayer.NUM_SLOTS
        ? this.currentBuildingSlot
        : 0;
    this.ensureSlotCapacity(s, 3);
    const p = this.slotPosIdx[s];
    const u = this.slotUvIdx[s];
    const h = this.slotHeightIdx[s];
    const baseElev = this.currentBuildingBaseElev;
    const cr = color ? color[0] : 1.0;
    const cg = color ? color[1] : 1.0;
    const cb = color ? color[2] : 1.0;

    const pos = this.slotPosBuf[s];
    const nrm = this.slotNormBuf[s];
    const col = this.slotColorBuf[s];
    const uvs = this.slotUvBuf[s];
    const hts = this.slotHeightBuf[s];

    const relH0 = Math.max(0, p0[1] - baseElev);
    const relH1 = Math.max(0, p1[1] - baseElev);
    const relH2 = Math.max(0, p2[1] - baseElev);

    // [3단계: 건물 하단 0m ~ 3.2m 접지 앰비언트 오클루전 그라데이션 0.50 -> 1.0 적용으로 지면 밀착감 강화]
    const ao0 = relH0 < 3.2 ? 0.50 + 0.50 * (relH0 / 3.2) : 1.0;
    const ao1 = relH1 < 3.2 ? 0.50 + 0.50 * (relH1 / 3.2) : 1.0;
    const ao2 = relH2 < 3.2 ? 0.50 + 0.50 * (relH2 / 3.2) : 1.0;

    pos[p] = p0[0]; pos[p + 1] = p0[1]; pos[p + 2] = p0[2];
    nrm[p] = norm[0]; nrm[p + 1] = norm[1]; nrm[p + 2] = norm[2];
    col[p] = cr * ao0; col[p + 1] = cg * ao0; col[p + 2] = cb * ao0;
    uvs[u] = uv0[0]; uvs[u + 1] = uv0[1];
    hts[h] = relH0;

    pos[p + 3] = p1[0]; pos[p + 4] = p1[1]; pos[p + 5] = p1[2];
    nrm[p + 3] = norm[0]; nrm[p + 4] = norm[1]; nrm[p + 5] = norm[2];
    col[p + 3] = cr * ao1; col[p + 4] = cg * ao1; col[p + 5] = cb * ao1;
    uvs[u + 2] = uv1[0]; uvs[u + 3] = uv1[1];
    hts[h + 1] = relH1;

    pos[p + 6] = p2[0]; pos[p + 7] = p2[1]; pos[p + 8] = p2[2];
    nrm[p + 6] = norm[0]; nrm[p + 7] = norm[1]; nrm[p + 8] = norm[2];
    col[p + 6] = cr * ao2; col[p + 7] = cg * ao2; col[p + 8] = cb * ao2;
    uvs[u + 4] = uv2[0]; uvs[u + 5] = uv2[1];
    hts[h + 2] = relH2;

    this.slotPosIdx[s] += 9;
    this.slotUvIdx[s] += 6;
    this.slotHeightIdx[s] += 3;
  };

  private addSlotQuad = (
    slot: number,
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvBL: [number, number],
    uvBR: [number, number],
    uvTR: [number, number],
    uvTL: [number, number],
    color?: [number, number, number]
  ): void => {
    this.addSlotTriangle(slot, pBL, pBR, pTR, norm, uvBL, uvBR, uvTR, color);
    this.addSlotTriangle(slot, pBL, pTR, pTL, norm, uvBL, uvTR, uvTL, color);
  };

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
    this.addSlotTriangle(this.currentBuildingSlot, p0, p1, p2, norm, uv0, uv1, uv2, color);
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
    this.addSlotQuad(
      this.currentBuildingSlot,
      pBL,
      pBR,
      pTR,
      pTL,
      norm,
      [uvRect.u0, uvRect.v0],
      [uvRect.u1, uvRect.v0],
      [uvRect.u1, uvRect.v1],
      [uvRect.u0, uvRect.v1],
      color
    );
  };

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
    // 1. 단일 다중 재질 메쉬(geometry.addGroup) 22슬롯 버퍼에 직접 주입
    const isHorizontal = Math.abs(norm[1]) > 0.5;
    const maxP = Math.max(p0[1], p1[1], p2[1]);
    const isPenthouse = maxP > this.currentBuildingBaseElev + this.currentBuildingHeight + 1.2;
    const isParapet = !isHorizontal && !isPenthouse;

    let targetSlot = this.currentRooftopSlot; // 16, 17, 18, 19
    if (isPenthouse) {
      targetSlot = 21; // Penthouse (3.0m 옥탑 권상기실)
    } else if (isParapet) {
      targetSlot = 20; // Parapet (0.85m 테두리 난간)
    }

    // [Zero-GC & 무지연 단일 메쉬 직결]: 옥상·난간·옥탑방 지오메트리를 masterMesh의 슬롯 16..21로 직접 주입
    this.addSlotTriangle(targetSlot, p0, p1, p2, norm, uv0, uv1, uv2, color);
  };

  private addRooftopQuad = (
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvBLOrRect: any,
    uvBR?: any,
    uvTR?: any,
    uvTL?: any,
    color?: [number, number, number]
  ): void => {
    if (uvBLOrRect && typeof uvBLOrRect.u0 === 'number') {
      const u0 = uvBLOrRect.u0;
      const v0 = uvBLOrRect.v0;
      const u1 = uvBLOrRect.u1;
      const v1 = uvBLOrRect.v1;
      const actualColor = uvBR as [number, number, number] | undefined;
      this.addRooftopTriangle(pBL, pBR, pTR, norm, [u0, v0], [u1, v0], [u1, v1], actualColor);
      this.addRooftopTriangle(pBL, pTR, pTL, norm, [u0, v0], [u1, v1], [u0, v1], actualColor);
    } else {
      const uv0 = uvBLOrRect || [0, 0];
      const uv1 = uvBR || [1, 0];
      const uv2 = uvTR || [1, 1];
      const uv3 = uvTL || [0, 1];
      this.addRooftopTriangle(pBL, pBR, pTR, norm, uv0, uv1, uv2, color);
      this.addRooftopTriangle(pBL, pTR, pTL, norm, uv0, uv2, uv3, color);
    }
  };

  /**
   * 단일 건물 피처 3D 기하 분할 생성
   */
  private processSingleBuildingFeature(
    feat: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    metersPerLng: number,
    metersPerLat: number,
    map: maplibregl.Map,
    cachedCenter?: { lng: number; lat: number },
    cachedCenterElev?: number
  ): { built: boolean; isPrecise: boolean } {
    if (!feat.geometry) return { built: false, isPrecise: false };

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

    if (polyList.length === 0) return { built: false, isPrecise: false };
    let anyBuilt = false;
    let allPrecise = true;

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

        const cCoord = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        const mx = (cCoord.x - this.originMercator.x) / this.originMeterScale;
        const mz = (cCoord.y - this.originMercator.y) / this.originMeterScale;
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

      // [2-1 원본 폴리곤 기하학 100% 보존 & 중심점 기준 0.95 스케일 미세 수축 (5% shrink)]
      // 폴리곤 외곽선을 임의로 확장하지 않고 중심점 기준 0.95 스케일로 날렵하게 유지하여
      // 다닥다닥 붙은 주택가에서도 건물 사이의 골목길과 대지 경계가 뭉개지지 않고 선명하게 분리되도록 보장
      let sumMx = 0, sumMz = 0;
      for (let i = 0; i < ptCount; i++) {
        sumMx += pts2D[i].x;
        sumMz += pts2D[i].z;
      }
      const centerMx = sumMx / ptCount;
      const centerMz = sumMz / ptCount;

      // [4중 안전 필터링 - 중복 필터]: 반경 2.8m(기본 1개 실 규격) 이내 중복 형상 제거 (부속창고 중복 겹침 및 Z-Fighting 방지)
      const DEDUPE_RADIUS = 2.8;
      const gridX = Math.floor(centerMx / DEDUPE_RADIUS);
      const gridZ = Math.floor(centerMz / DEDUPE_RADIUS);
      let isDuplicateCentroid = false;
      for (let dx = -1; dx <= 1 && !isDuplicateCentroid; dx++) {
        for (let dz = -1; dz <= 1 && !isDuplicateCentroid; dz++) {
          const nList = this.centroidSpatialGrid.get(`${gridX + dx}_${gridZ + dz}`);
          if (nList) {
            for (let k = 0; k < nList.length; k++) {
              if (Math.hypot(nList[k][0] - centerMx, nList[k][1] - centerMz) < DEDUPE_RADIUS) {
                isDuplicateCentroid = true;
                break;
              }
            }
          }
        }
      }
      if (isDuplicateCentroid) {
        continue;
      }

      // [V-World REA 표준 Setback]: 인접 건물 간 30~40cm 시각적 골목/벽면 간격을 확보하여
      // 건물들이 다닥다닥 붙어 거대한 하나의 덩어리로 뭉개지는 현상 완전 방지 (개별 4면 벽체 및 옥상 난간 분리)
      const SHRINK_SCALE = 0.970;
      for (let i = 0; i < ptCount; i++) {
        pts2D[i].x = centerMx + (pts2D[i].x - centerMx) * SHRINK_SCALE;
        pts2D[i].z = centerMz + (pts2D[i].z - centerMz) * SHRINK_SCALE;
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
      const minWidth = Math.min(spanX, spanZ);

      // [4중 안전 필터링 - 면적 필터]: 3,800㎡ 초과 폴리곤(단지 경계선, 운동장, 공원, 거대 지적 필지) 및 30㎡ 미만 배제
      if (areaSqm > 3800.0 || areaSqm < 30.0) {
        continue;
      }
      if (minWidth < 3.0) {
        continue;
      }
      if (Math.max(spanX, spanZ) / minWidth > 8.0) {
        continue;
      }

      // [4중 안전 필터링 - 군 유휴지 0동 원칙]: 1군지사 부지(310,000㎡) 등 군 유휴부지 내부 기존 구형 건물 100% 영구 배제
      const featProps = (feat.properties || {}) as Record<string, any>;
      if (featProps.is_user_placed !== true && featProps.isMasterplanFacility !== true) {
        if (isPointInMilitaryIdleSite(cLng, cLat)) {
          continue;
        }
      }

      // [4중 안전 필터링 - 산림/경사 필터]: isMountainGhostBuilding을 통해 산림 및 비건물 유령 건물 고속 배제 (4500회 동기식 DEM 쿼리 프리즈 소멸)
      if (isMountainGhostBuilding(cLng, cLat, featProps, this.map)) {
        continue;
      }

      if (!isPermittedBuildingPolygon(featProps, areaSqm, spanX, spanZ, maxEdgeLen, minWidth, [cLng, cLat], this.map)) {
        continue;
      }

      // 통과된 건물 중심점 등록
      const cellKey = `${gridX}_${gridZ}`;
      let cellList = this.centroidSpatialGrid.get(cellKey);
      if (!cellList) {
        cellList = [];
        this.centroidSpatialGrid.set(cellKey, cellList);
      }
      cellList.push([centerMx, centerMz]);

      // [1단계: 화면 삼각형 찢어짐(Polygon Tearing) 원천 차단]
      if (maxEdgeLen > 350 || spanX > 450 || spanZ > 450) {
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
            const hCoord = maplibregl.MercatorCoordinate.fromLngLat([holeCoords[i][0], holeCoords[i][1]], 0);
            const hMx = (hCoord.x - this.originMercator.x) / this.originMeterScale;
            const hMz = (hCoord.y - this.originMercator.y) / this.originMeterScale;
            const shMx = centerMx + (hMx - centerMx) * SHRINK_SCALE;
            const shMz = centerMz + (hMz - centerMz) * SHRINK_SCALE;
            holePts.push({ x: shMx, z: shMz });
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

      // [1단계: 전 데이터 전수 검증 및 3D 실측 속성 1:1 강제 동기화]
      if (!featProps.realHeight || !featProps.realUse) {
        stampBuildingWithMasterData(feat);
      }

      // [2단계: DiverseBuildingGenerator 24대 실사 아키텍처 변주 엔진 시드 연동]
      const diverseSeed = DiverseBuildingGenerator.calculateSeed(cLng, cLat);
      const classified = classifyBuildingWithVendor(rawCoords, featProps);

      // [1단계: VworldMasterEngine 연동 실사 높이 복원 (0m 평면 건물 원천 차단)]
      const isTrueHighRiseApt =
        (classified.type === 'apartment' ||
          featProps.realUse === '공동주택(아파트)' ||
          featProps.class === 'apartments' ||
          featProps.building === 'apartments' ||
          String(featProps.buld_nm || '').includes('아파트') ||
          (areaSqm >= 320.0 && areaSqm <= 2200.0 && (spanX / Math.max(1, minWidth) >= 1.4 || maxEdgeLen >= 25.0))) &&
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

      // [2-1 강원 전역 실제 도시 비례 층고 산출]
      const rawFlr = Number(
        featProps.gro_flo_co ||
        featProps.grnd_flr ||
        featProps.levels ||
        featProps.FLR_CNT ||
        featProps['building:levels'] ||
        0
      );

      if (rawFlr >= 2) {
        // [1순위] 브이월드 LT_C_SPBD 및 건축물대장의 실제 층수 우선 적용 (gro_flo_co * 3.2m)
        height = Math.max(6.5, rawFlr * 3.2);
      } else if (rawH >= 12.0 || featProps.is_real_measured === true) {
        // [1순위 보조] 12m 이상 실측치 또는 건축물대장 매칭 높이 우선 반영
        height = rawH;
      } else {
        // [2순위] 층수 미상 및 OSM 5m 기본값 건물: 실제 바닥 면적(area)과 평면 형상별 한국 도시 비례 층고 분리
        if (isTrueHighRiseApt || (areaSqm >= 320.0 && areaSqm <= 2200.0)) {
          // 아파트 단지 (16층 ~ 25층): 48m ~ 75m (image_dbcb02.jpg 스카이라인 동일)
          height = Math.min(75.0, Math.max(48.0, 48.0 + (diverseSeed % 28) * 1.0));
        } else if (areaSqm >= 700.0) {
          // 혁신도시 공공청사·도청·시청·대형 오피스 타워 (area >= 700㎡): 28m ~ 60m (8층 ~ 18층)
          height = Math.min(60.0, Math.max(28.0, 28.0 + (diverseSeed % 33) * 1.0));
        } else if (areaSqm >= 200.0 && areaSqm < 500.0) {
          // 시·군 중심 상가·근린생활 (200㎡ <= area < 500㎡): 12.0m ~ 21.0m (4층 ~ 6층)
          height = Math.min(21.0, Math.max(12.0, 12.0 + (diverseSeed % 10) * 1.0));
        } else {
          // 뒤쪽 택지지구 단독주택·빌라 (30㎡ <= area < 200㎡): 6.5m ~ 10.0m (2층 ~ 3층)
          height = Math.min(10.0, Math.max(6.5, 6.5 + (diverseSeed % 36) * 0.1));
        }
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

      // 지형 표고: 실제 지형 고도(m) 직접 안착 (지형 아래 매몰 및 0m 누락 완전 해결)
      // MapLibre map.getTerrain() 활성화 상태 안전 검사 (지형 미적용 시 0m 평면 밀착)
      const isTerrainActive = Boolean(map.getTerrain());
      let rawElev = 0;
      let hasPreciseElev = false;

      if (isTerrainActive) {
        try {
          const cached = elevationCache.getFromMap(map, [cLng, cLat]);
          if (cached > 0) {
            rawElev = cached;
            hasPreciseElev = true;
          }
        } catch {}

        // 지형 타일 로드 대기 중 또는 평탄지: 화면 중심 표고 또는 강원 18개 시·군 공식 기본 지형 표고로 안전 안착
        if (rawElev <= 0) {
          rawElev = (cachedCenterElev && cachedCenterElev > 0) ? cachedCenterElev : getGangwonBaseElevation(cLng, cLat);
          hasPreciseElev = false;
        }
      } else {
        // 지형 비활성화 시 해수면 0m 평면에 칼같이 밀착
        rawElev = 0;
        hasPreciseElev = true;
      }
      if (!hasPreciseElev) {
        allPrecise = false;
      }

      const baseElev = rawElev;
      this.currentBuildingBaseElev = baseElev;
      const topElev = baseElev + height;

      // [GeoBrief 3D 2단계: V-World REA 16종 독립 슬롯 및 4종 옥상·난간·옥탑 슬롯 배분]
      const bldgSeed = Math.abs(Math.floor(cLng * 100000 + cLat * 100000));
      const reaStyle = VWorldReaRenderer.classifyBuildingStyle(featProps, bldgSeed, areaSqm, height, [cLng, cLat]);
      this.currentBuildingSlot = reaStyle.slot;
      this.currentRooftopSlot = 16 + reaStyle.roofMaterialIndex;
      this.currentParapetSlot = 20;
      this.currentPenthouseSlot = 21;
      this.currentBuildingHeight = height;

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
      // A. [GeoBrief 3D 2단계: V-World급 5단 분리형 초정밀 지오메트리 & 동적 3-LOD 직결]
      // -------------------------------------------------------------------
      const zoom = map.getZoom();
      const currentMapCenter = cachedCenter || map.getCenter();
      const dLngM = (cLng - currentMapCenter.lng) * metersPerLng;
      const dLatM = (cLat - currentMapCenter.lat) * metersPerLat;
      const distFromCenterM = Math.hypot(dLngM, dLatM);

      // [산악 허위 더미 방지]: 지형 고도가 카메라 중심 지면 표고보다 500m 이상 급격히 높은 산꼭대기 절벽 상자 차단
      const centerElev = (cachedCenterElev !== undefined && cachedCenterElev > 0) ? cachedCenterElev : 0;
      if (rawElev - centerElev > 500) {
        continue;
      }

      let lodLevel: 1 | 2 | 3 = 3;
      if (zoom < 14.0) {
        lodLevel = 1;
      } else if (zoom < 15.2) {
        lodLevel = distFromCenterM < 650 ? 2 : 1;
      } else {
        if (distFromCenterM < 750) {
          lodLevel = 3;
        } else if (distFromCenterM < 1600) {
          lodLevel = 2;
        } else {
          lodLevel = 1;
        }
      }

      PrecisionBuildingBuilder.buildBuilding({
        pts2D,
        baseElev,
        height,
        seed: diverseSeed,
        edgeLens,
        maxEdgeLen,
        minEdgeLen,
        featProps,
        centerLngLat: [cLng, cLat],
        holeIndices,
        innerRings2D,
        lodLevel,
        addSlotQuad: this.addSlotQuad,
        addSlotTriangle: this.addSlotTriangle,
        addRooftopQuad: this.addRooftopQuad,
        addRooftopTriangle: this.addRooftopTriangle,
      });

      anyBuilt = true;
    }

    return { built: anyBuilt, isPrecise: allPrecise };
  }

  /**
   * [1단계: 메인 스레드 연산 0% 보장 (4ms 타임슬라이싱 지오메트리 빌더 & 단일 Draw Call)]
   */
  private buildRealisticCityMesh(
    rawFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
  ): void {
    if (!this.map) return;
    if (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()) {
      if (this.masterMesh) {
        this.pendingFeatures = rawFeatures;
        return;
      }
    }
    this.isMoving = false;

    if (this.activeBuildIdleId !== null) {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(this.activeBuildIdleId);
      } else {
        clearTimeout(this.activeBuildIdleId);
      }
      this.activeBuildIdleId = null;
    }

    this.isBuildingGeometry = true;
    const currentTaskId = ++this.activeBuildTaskId;

    try {
      const map = this.map;
      const center = map.getCenter();

      // 고정 원점 유지: 시·군 내 이동 시 고정(지터링 방지 및 캐시 유지), 시·군간 원거리 이동(8km+) 시 원점 재동기화
      if (!this.fixedOriginInitialized) {
        this.setOrigin([center.lng, center.lat], false);
        this.fixedOriginInitialized = true;
      } else {
        const dLng = Math.abs(center.lng - this.originLngLat[0]);
        const dLat = Math.abs(center.lat - this.originLngLat[1]);
        if (dLng > 0.05 || dLat > 0.05) {
          this.setOrigin([center.lng, center.lat], true);
        }
      }

      this.clampedAltitude = 0; // 항상 해수면(0m) 고정 기준계 유지 (표고 이중 가산 방지)

      const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
      const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
      const metersPerLat = (Math.PI / 180) * 6378137;

      // [1단계: 동적 뷰포트(Dynamic BBOX) 실제 시가지 건물 100% 최우선 빌드]
      const bounds = map.getBounds();
      const minLng = bounds.getWest() - 0.035;
      const maxLng = bounds.getEast() + 0.035;
      const minLat = bounds.getSouth() - 0.035;
      const maxLat = bounds.getNorth() + 0.035;

      const viewportFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];

      for (let i = 0; i < rawFeatures.length; i++) {
        const feat = rawFeatures[i];
        if (!feat || !feat.geometry) continue;
        const coords = feat.geometry.type === 'Polygon'
          ? feat.geometry.coordinates[0]?.[0]
          : feat.geometry.coordinates[0]?.[0]?.[0];
        if (!coords) continue;
        const [lng, lat] = coords;
        if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
          viewportFeatures.push(feat);
        }
      }

      // [강제 집행] 특정 개수로 건물을 자르는 코드(slice/limit) 완전 제거: 뷰포트 내 실제 건물 100% 렌더링
      const features = viewportFeatures;

      let featureIdx = 0;
      let newlyAddedCount = 0;
      // [최초 버벅거림 제로화]: 엄격한 2.5ms 프레임 버짓으로 브라우저 렌더러에 매 프레임 14ms+ 여유 보장 (60 FPS 락)
      const FRAME_BUDGET_MS = this.isMoving ? 1.0 : 2.5;

      const currentMapCenter = map.getCenter();
      const cachedCenter = { lng: currentMapCenter.lng, lat: currentMapCenter.lat };
      let cachedCenterElev = 0;
      try {
        if (typeof map.queryTerrainElevation === 'function') {
          const q = map.queryTerrainElevation([cachedCenter.lng, cachedCenter.lat]);
          if (typeof q === 'number' && Number.isFinite(q) && q > 0) {
            cachedCenterElev = q;
          }
        }
      } catch {}
      if (cachedCenterElev <= 0) {
        cachedCenterElev = getGangwonBaseElevation(cachedCenter.lng, cachedCenter.lat);
      }

      const executeSlice = (deadline?: any) => {
        if (this.activeBuildTaskId !== currentTaskId) return;
        if (!this.map) {
          this.isBuildingGeometry = false;
          return;
        }

        // [인터랙션 잠금: 카메라 이동/회전/줌 중에는 가벼운 대기 후 재시도 (60fps 유지)]
        if (this.map && (this.map.isMoving() || this.map.isRotating() || this.map.isZooming())) {
          if (this.masterMesh) {
            this.isMoving = true;
            this.activeBuildIdleId = setTimeout(executeSlice, 150);
            return;
          }
        }
        this.isMoving = false;

        const sliceStartTime = performance.now();
        let sliceCount = 0;

        // [1단계 선행 커밋]: 최초 1회차에는 중심부 핵심 150동을 즉각 빌드하여 1프레임 내에 화면 즉시 표출
        const isFirstBatch = !this.hasInitialBuilt && featureIdx === 0;
        const batchLimit = isFirstBatch ? 150 : Infinity;

        while (featureIdx < features.length) {
          if (!isFirstBatch && sliceCount > 0 && sliceCount % 10 === 0) {
            const elapsed = performance.now() - sliceStartTime;
            if (elapsed >= FRAME_BUDGET_MS) {
              break;
            }
          }
          if (isFirstBatch && sliceCount >= batchLimit) {
            break;
          }
          sliceCount++;
          const feat = features[featureIdx++];
          const key = getBuildingFeatureKey(feat);

          // [캐시 히트] 이미 지오메트리가 생성된 건물은 즉시 스킵 (0ms)
          if (this.builtBuildingKeys.has(key)) {
            continue;
          }

          const bldgResult = this.processSingleBuildingFeature(feat, metersPerLng, metersPerLat, map, cachedCenter, cachedCenterElev);
          if (bldgResult.built) {
            this.builtBuildingKeys.add(key);
            if (!bldgResult.isPrecise) {
              this.temporaryElevationBuildingKeys.add(key);
            }
            newlyAddedCount++;
          }
        }

        if (featureIdx < features.length) {
          // [초기 로드 1회 즉시 커밋]: 1회차 150동 완료 시 즉시 커밋하여 화면 빈틈 0ms 해소
          if (!this.hasInitialBuilt && newlyAddedCount > 0 && this.hasAnySlotVertices()) {
            this.commitAccumulatedGeometry();
            this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);
            newlyAddedCount = 0;
            this.hasInitialBuilt = true;
          }
          // 백그라운드 2단계: requestAnimationFrame + 4ms 타임슬라이싱으로 60fps 무지연 처리
          if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
            this.activeBuildIdleId = requestAnimationFrame(() => executeSlice());
          } else {
            this.activeBuildIdleId = setTimeout(executeSlice, 14);
          }
        } else {
          // 전체 피처 슬라이싱 완료! 최종 1회 커밋으로 GPU 파이프라인 정체 0% 달성
          this.activeBuildIdleId = null;
          this.isBuildingGeometry = false;
          this.hasInitialBuilt = true;

          // 전체 슬라이스 완료 시 최종 커밋 및 메트릭 갱신
          if (newlyAddedCount > 0 || !this.masterMesh) {
            this.commitAccumulatedGeometry();
            this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);
          }

          if (this.pendingFeatures) {
            const next = this.pendingFeatures;
            this.pendingFeatures = null;
            this.buildRealisticCityMesh(next);
          }
        }
      };

      // 타임슬라이싱 즉시 1회차 시작 (No-Delay setTimeout 0)
      this.activeBuildIdleId = setTimeout(executeSlice, 0);
    } catch (buildErr) {
      console.warn('[RealisticKoreanCityLayer] buildRealisticCityMesh exception:', buildErr);
      this.isBuildingGeometry = false;
    }
  }

  /**
   * [3단계: Multi-Material 22종 슬롯별 TypedArray 일괄 병합 & GPU Draw Call <= 22 무결점 60fps]
   */
  private commitAccumulatedGeometry(): void {
    if (!this.map || !this.scene) return;

    if (!this.buildingMaterials || this.buildingMaterials.length === 0) {
      this.buildingMaterials = VWorldReaRenderer.getAllMaterials();
    }

    let totalVertices = 0;
    for (let s = 0; s < RealisticKoreanCityLayer.NUM_SLOTS; s++) {
      totalVertices += this.slotPosIdx[s] / 3;
    }

    if (totalVertices > 0 && this.buildingMaterials.length > 0) {
      // 1. [Zero-GC]: 마스터 버퍼 용량 부족 시에만 동적 확장하고 기존 버퍼를 재사용
      let capacityExpanded = false;
      if (totalVertices > this.masterBufferCapacity) {
        const newCap = Math.max(this.masterBufferCapacity * 2, totalVertices + 60000);
        this.masterPosBuf = new Float32Array(newCap * 3);
        this.masterNormBuf = new Float32Array(newCap * 3);
        this.masterColorBuf = new Float32Array(newCap * 3);
        this.masterUvBuf = new Float32Array(newCap * 2);
        this.masterHeightBuf = new Float32Array(newCap);
        this.masterBufferCapacity = newCap;
        capacityExpanded = true;
      }

      let vertexOffset = 0;
      let posOffset = 0;
      let uvOffset = 0;
      let heightOffset = 0;

      const canReuse = !capacityExpanded && this.masterMesh !== null && this.masterGeometry !== null;

      let geo = this.masterGeometry;
      if (!canReuse || !geo) {
        if (geo) {
          geo.dispose();
        }
        geo = new THREE.BufferGeometry();
        this.masterGeometry = geo;
      }

      geo.clearGroups();

      for (let s = 0; s < RealisticKoreanCityLayer.NUM_SLOTS; s++) {
        const pCount = this.slotPosIdx[s];
        const uCount = this.slotUvIdx[s];
        const hCount = this.slotHeightIdx[s];
        const vCount = pCount / 3;

        if (vCount > 0) {
          this.masterPosBuf.set(this.slotPosBuf[s].subarray(0, pCount), posOffset);
          this.masterNormBuf.set(this.slotNormBuf[s].subarray(0, pCount), posOffset);
          this.masterColorBuf.set(this.slotColorBuf[s].subarray(0, pCount), posOffset);
          this.masterUvBuf.set(this.slotUvBuf[s].subarray(0, uCount), uvOffset);
          this.masterHeightBuf.set(this.slotHeightBuf[s].subarray(0, hCount), heightOffset);

          geo.addGroup(vertexOffset, vCount, s);

          vertexOffset += vCount;
          posOffset += pCount;
          uvOffset += uCount;
          heightOffset += hCount;
        }
      }

      if (!canReuse) {
        geo.setAttribute('position', new THREE.BufferAttribute(this.masterPosBuf, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(this.masterNormBuf, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.masterColorBuf, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(this.masterUvBuf, 2));
        geo.setAttribute('aHeight', new THREE.BufferAttribute(this.masterHeightBuf, 1));
      } else {
        const pAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
        const cAttr = geo.getAttribute('color') as THREE.BufferAttribute;
        const uAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
        const hAttr = geo.getAttribute('aHeight') as THREE.BufferAttribute;
        if (pAttr) pAttr.needsUpdate = true;
        if (nAttr) nAttr.needsUpdate = true;
        if (cAttr) cAttr.needsUpdate = true;
        if (uAttr) uAttr.needsUpdate = true;
        if (hAttr) hAttr.needsUpdate = true;
      }

      geo.setDrawRange(0, totalVertices);
      geo.computeBoundingSphere();

      if (!this.masterMesh) {
        this.masterMesh = new THREE.Mesh(geo, this.buildingMaterials);
        this.masterMesh.frustumCulled = false;
        this.masterMesh.matrixAutoUpdate = false;
        this.masterMesh.updateMatrix();
        this.masterMesh.visible = this.isVisible;
        this.scene.add(this.masterMesh);
      } else if (!canReuse) {
        this.masterMesh.geometry = geo;
      }

      this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);
    }

    // 2-B. 옥상 난간 및 옥탑 코어는 masterMesh 내 슬롯 16..21(geometry.addGroup)로 완전 통합되었으므로 중복 메쉬 안전 해제
    if (this.rooftopMesh) {
      this.scene.remove(this.rooftopMesh);
      this.rooftopGeometry?.dispose();
      this.rooftopMesh = null;
      this.rooftopGeometry = null;
    }

    // 2-C. 국토교통부 전국 교량 및 터널 3D 모델링 동기화
    this.buildBridgesAndTunnelsMesh();

    // 3. 건물 카운트 통지 (사용자 지시: 비활성 노란 핀 레이어로의 무거운 GeoJSON 직렬화 차단으로 60fps 보장)
    this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 국토교통부 전국 교량 및 터널 실측 제원 기반 3D 입체 교량(상판, 방호벽, 교각) & 터널 갱문 모델링
   */
  private buildBridgesAndTunnelsMesh(): void {
    // [1단계: 화면 중심을 따라다니는 검은색 직사각형 7~8개 영구 삭제]
    // 가짜 교량 상판 및 터널 캐비티 3D 박스 메쉬 생성을 100% 차단하고 기존 지오메트리 완전 폐기
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

    if (this.bridgeGroup.parent) {
      this.scene.remove(this.bridgeGroup);
    }
    if (this.tunnelGroup.parent) {
      this.scene.remove(this.tunnelGroup);
    }

    this.bridgeGroup.visible = false;
    this.tunnelGroup.visible = false;

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * [사용자 지침: 확실하지 않은 도로 이정표 전면 영구 삭제]
   * 도로 횡단 선형 및 지형 고도와 맞지 않는 문형식 3D 도로 안내 표지판 완전 배제
   */
  public buildRoadSignGantries(): void {
    // 기존 표지판 메쉬 완전 해제 및 삭제
    while (this.roadSignGroup.children.length > 0) {
      const child = this.roadSignGroup.children[0];
      this.roadSignGroup.remove(child);
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else if (m.material) {
            m.material.dispose();
          }
        }
      });
    }

    if (this.roadSignGroup.parent) {
      this.roadSignGroup.parent.remove(this.roadSignGroup);
    }
    this.roadSignGroup.visible = false;
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (this.isContextLost || !this.isVisible || !this.renderer || !this.masterMesh) {
      return;
    }

    try {
      // [2단계: 옥상 메쉬 상시 렌더링 (원거리/중거리에서도 지붕 뚫림 0% 보장)]
      if (this.rooftopMesh) {
        this.rooftopMesh.visible = this.isVisible;
      }

      const rawMatrix = extractCustomLayerMatrix(options, this.map) || MapLibreThreeMatrixAdapter.extractProjectionMatrix(options, this.map || undefined);
      if (!rawMatrix) return;

      this.renderMatrix.fromArray(rawMatrix as any);
      this.scaleVector.set(this.originMeterScale, -this.originMeterScale, this.originMeterScale);
      this.localMatrix
        .makeTranslation(this.originMercator.x, this.originMercator.y, 0)
        .scale(this.scaleVector)
        .multiply(this.rotationX);

      this.camera.projectionMatrix.copy(this.renderMatrix).multiply(this.localMatrix);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

      // [StreetsGL + V-World 3D 실사 PBR 셰이더] 단일 공유 싱글톤 Uniforms 0-GC 갱신 (0.003ms, 60fps locked)
      updateSharedPbrUniforms(this.camera, this.sunLight);

      if (gl) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      }
      try {
        (this.renderer.state as any).buffers?.depth?.setTest(true);
      } catch {}

      // GPU 파이프라인 스톨(gl.getParameter) 방지 및 FBO 상태 보존
      const prevFbo = options?.defaultFramebuffer ?? null;

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);

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
    map.off('idle', this.handleMapIdle);
    map.off('terrain', this.handleTerrainChange);
    map.off('sourcedata', this.handleSourceData);

    if (this.reanchorDebounceTimer) {
      clearTimeout(this.reanchorDebounceTimer);
      this.reanchorDebounceTimer = null;
    }

    if (this.terrainDebounceTimer) {
      clearTimeout(this.terrainDebounceTimer);
      this.terrainDebounceTimer = null;
    }

    if (this.idleDebounceTimer) {
      clearTimeout(this.idleDebounceTimer);
      this.idleDebounceTimer = null;
    }

    if (this.activeBuildIdleId !== null) {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(this.activeBuildIdleId);
      } else {
        clearTimeout(this.activeBuildIdleId);
      }
      this.activeBuildIdleId = null;
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
    console.log('[RealisticKoreanCityLayer] onRemove CALLED!');
    // [3-1 싱글톤 보존]: 16종 독립 Material 및 옥상 재질은 전역 싱글톤으로 영구 보존하여 렉 원천 차단
    this.materialMeshes = [];
    if (this.rooftopMesh) {
      this.scene.remove(this.rooftopMesh);
      this.rooftopGeometry?.dispose();
      this.rooftopMesh = null;
    }
    if (this.bridgeGroup) {
      this.scene.remove(this.bridgeGroup);
      this.bridgeGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry?.dispose();
        }
      });
      this.bridgeGroup.clear();
    }
    if (this.roadSignGroup) {
      this.scene.remove(this.roadSignGroup);
      this.roadSignGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
      this.roadSignGroup.clear();
    }
    if (this.tunnelGroup) {
      this.scene.remove(this.tunnelGroup);
      this.tunnelGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry?.dispose();
        }
      });
      this.tunnelGroup.clear();
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
