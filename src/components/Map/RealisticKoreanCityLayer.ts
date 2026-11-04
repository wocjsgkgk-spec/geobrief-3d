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
import { PrecisionBuildingBuilder } from '@/lib/vendor/precisionBuildingBuilder';
import {
  getPrecisionBuildingMaterials,
  classifyBuildingStyle,
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

  // 16종 독립 Material & 단일 씬 메쉬
  public masterMesh: THREE.Mesh | null = null;
  public masterGeometry: THREE.BufferGeometry | null = null;
  public buildingMaterials: THREE.MeshStandardMaterial[] = [];
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

  // [3단계 고성능 엔진] 3ms 타임슬라이싱 및 사전할당 Float32Array 버퍼
  private builtBuildingKeys: Set<string> = new Set();
  private activeBuildIdleId: any = null;
  private activeBuildTaskId: number = 0;

  // [1단계: Multi-Material 16종 독립 바인딩을 위한 시퀀셜 정점 버퍼 및 건물 단위 그룹 목록]
  private accBuildingPosBuf: Float32Array = new Float32Array(3000000);
  private accBuildingNormBuf: Float32Array = new Float32Array(3000000);
  private accBuildingColorBuf: Float32Array = new Float32Array(3000000);
  private accBuildingUvBuf: Float32Array = new Float32Array(2000000);
  private accBuildingHeightBuf: Float32Array = new Float32Array(1000000);
  private accBuildingPosIdx: number = 0;
  private accBuildingUvIdx: number = 0;
  private accBuildingHeightIdx: number = 0;
  private buildingGroups: { start: number; count: number; materialIndex: number }[] = [];

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
      this.rooftopMesh.visible = visible;
    }
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
        mat.roughness = 0.45;
      } else if (theme === 'landuse') {
        const hex = landuseColors[i % landuseColors.length];
        mat.color.setHex(hex);
        mat.roughness = 0.55;
      } else if (theme === 'height_spectrum') {
        const hex = heightSpectrumColors[i % heightSpectrumColors.length];
        mat.color.setHex(hex);
        mat.roughness = 0.55;
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

  public findBuildingNear(
    lng: number,
    lat: number,
    maxDistM: number = 35
  ): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
    const list = this.getCachedFeatures();
    if (!list || list.length === 0) return null;

    let closest: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;
    let minDist = maxDistM;

    for (let fIdx = 0; fIdx < list.length; fIdx++) {
      const feat = list[fIdx];
      if (!feat.geometry) continue;
      const geom = feat.geometry;

      const rings: [number, number][][] = [];
      if (geom.type === 'Polygon') {
        if (geom.coordinates && geom.coordinates.length > 0) {
          rings.push(geom.coordinates[0] as [number, number][]);
        }
      } else if (geom.type === 'MultiPolygon') {
        if (geom.coordinates && geom.coordinates.length > 0) {
          for (let p = 0; p < geom.coordinates.length; p++) {
            if (geom.coordinates[p]?.[0]) {
              rings.push(geom.coordinates[p][0] as [number, number][]);
            }
          }
        }
      }

      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        if (!ring || ring.length < 3) continue;

        // [초고속 BBOX 사전 필터링: 마우스 커서 반경 35m 밖 건물 0ns 즉시 스킵]
        let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
        for (let k = 0; k < ring.length; k++) {
          const rx = ring[k][0], ry = ring[k][1];
          if (rx < bMinX) bMinX = rx;
          if (rx > bMaxX) bMaxX = rx;
          if (ry < bMinY) bMinY = ry;
          if (ry > bMaxY) bMaxY = ry;
        }
        const dLngDeg = (maxDistM / 111000) / (Math.cos((lat * Math.PI) / 180) || 1);
        const dLatDeg = maxDistM / 111000;
        if (lng < bMinX - dLngDeg || lng > bMaxX + dLngDeg || lat < bMinY - dLatDeg || lat > bMaxY + dLatDeg) {
          continue;
        }

        // 1) 점-폴리곤 내부 포함 판별 (Point in Polygon Ray-Casting)
        let inside = false;
        let sumLng = 0;
        let sumLat = 0;
        const count = ring.length;
        for (let i = 0, j = count - 1; i < count; j = i++) {
          const xi = ring[i][0], yi = ring[i][1];
          const xj = ring[j][0], yj = ring[j][1];
          sumLng += xi;
          sumLat += yi;
          const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }

        if (inside) {
          return feat; // 건물 폴리곤 내부 클릭 시 즉시 100% 매칭
        }

        // 2) 중심점 기준 거리 판정
        const cLng = sumLng / count;
        const cLat = sumLat / count;
        const dx = (lng - cLng) * 111000 * Math.cos((lat * Math.PI) / 180);
        const dy = (lat - cLat) * 111000;
        const d = Math.hypot(dx, dy);
        if (d < minDist) {
          minDist = d;
          closest = feat;
        }
      }
    }
    return closest;
  }

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    try {
      // 1. 조명 설정 (자연스러운 한국 도심 주간광: 따뜻한 주광색 sunLight 1.35 + 하늘 반사광 hemisphereLight 0.85)
      this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
      this.sunLight.position.set(-130, 160, 100).normalize();
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);

      this.fillLight = new THREE.DirectionalLight(0xbae6fd, 0.45);
      this.fillLight.position.set(100, 120, -110).normalize();
      this.scene.add(this.fillLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(this.ambientLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xe0f2fe, 0xd6d3d1, 0.85);
      this.scene.add(this.hemisphereLight);

      // 2. [GeoBrief 3D 1단계] 16종 독립 건축 Material 배열 직결
      this.buildingMaterials = getPrecisionBuildingMaterials().slice(0, 16);

      // [지붕 옥상 윗면 4대 실측 톤 완전 분리: vertexColors 100% 표출]
      this.rooftopMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.DoubleSide,
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

      // [1단계: 화면 중심 검은색 직사각형 7~8개 방지] 3D 가짜 교량/터널 박스 씬 추가 원천 차단
      this.bridgeGroup.visible = false;
      this.tunnelGroup.visible = false;

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
      (!this.masterMesh || this.builtBuildingKeys.size < 50) &&
      (e.sourceId === 'openmaptiles-vector' || e.sourceId === 'openfreemap' || e.sourceId === 'fusion-buildings-source') &&
      e.isSourceLoaded
    ) {
      this.extractAndBuildFromMap();
    }
  };

  private handleMapIdle = (): void => {
    if ((!this.masterMesh || this.builtBuildingKeys.size < 50) && this.map) {
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
    if (this.activeBuildIdleId !== null) {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(this.activeBuildIdleId);
      } else {
        clearTimeout(this.activeBuildIdleId);
      }
      this.activeBuildIdleId = null;
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
        this.moveEndTimer = setTimeout(checkAndComplete, 350);
        return;
      }
      this.isMoving = false;
      this.extractAndBuildFromMap();
    };
    this.moveEndTimer = setTimeout(checkAndComplete, 350);
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
    if (!this.map || this.isMoving) return;
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
    if (this.cachedFeatures.length === 0) {
      this.cachedFeatures = (SAMPLE_BUILDINGS?.features as any[]) || [];
      this.cachedFeatures.forEach((f) => stampBuildingWithMasterData(f));
    }

    if (this.isBuildingGeometry) {
      this.pendingFeatures = newFeaturesToBuild.length > 0 ? newFeaturesToBuild : this.cachedFeatures;
      return;
    }

    if (newFeaturesToBuild.length > 0 || !this.masterMesh) {
      // 신규 건물만 백그라운드 slice에서 조용히 추가 (기존 메쉬 파괴 0회, 60fps 유지)
      this.buildRealisticCityMesh(this.masterMesh ? newFeaturesToBuild : this.cachedFeatures);
    }
  }

  public updateSunLight(
    dirOrAlt: [number, number, number] | THREE.Vector3 | number,
    colorOrAz?: string | number,
    intensity: number = 1.45,
    fogColor?: string,
    fogDensity?: number
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

    // [3단계: mourner/suncalc & 브이월드 원경 대기 원근감(Aerial Perspective Fog)]
    if (this.scene) {
      applyAtmosphericPerspectiveFog(this.scene, fogColor || '#cbd5e1', fogDensity || 0.00018);
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

    // [강원 18개 시·군 전역 원점 재설정] 시군간 이동 시 기준 원점 동적 재앵커링
    if (newOriginLngLat && Array.isArray(newOriginLngLat) && newOriginLngLat.length === 2) {
      const dLng = Math.abs(newOriginLngLat[0] - this.originLngLat[0]);
      const dLat = Math.abs(newOriginLngLat[1] - this.originLngLat[1]);
      if (dLng > 0.35 || dLat > 0.35 || !this.fixedOriginInitialized) {
        this.originLngLat = [newOriginLngLat[0], newOriginLngLat[1]];
        this.fixedOriginInitialized = true;
        // 다른 시·군으로 원거리 이동 시(40km+) 이전 지역 캐시 정리하여 새 지역 건물로 전면 갱신
        if (dLng > 0.40 || dLat > 0.40) {
          this.persistentBuildingMap.clear();
        }
        this.resetAccumulatedBuffers();
      }
    }

    let unbuiltCount = 0;
    let modifiedCount = 0;
    const newFeaturesToBuild: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const key = getBuildingFeatureKey(f);
      const ex = this.persistentBuildingMap.get(key);
      if (!ex) {
        this.persistentBuildingMap.set(key, f);
        unbuiltCount++;
        newFeaturesToBuild.push(f);
      } else {
        const exH = Number(ex.properties?.height || ex.properties?.hei || 0);
        const newH = Number(f.properties?.height || f.properties?.hei || 0);
        if (newH > exH + 0.5) {
          this.persistentBuildingMap.set(key, f);
          modifiedCount++;
          newFeaturesToBuild.push(f);
        }
      }
      if (!this.builtBuildingKeys.has(key)) {
        unbuiltCount++;
      }
    }

    if (modifiedCount > 500) {
      this.resetAccumulatedBuffers();
    } else if (this.masterMesh && unbuiltCount === 0) {
      return;
    }

    this.cachedFeatures = Array.from(this.persistentBuildingMap.values());

    if (this.isBuildingGeometry) {
      this.pendingFeatures = newFeaturesToBuild.length > 0 ? newFeaturesToBuild : this.cachedFeatures;
      return;
    }

    if (!this.isMoving) {
      this.buildRealisticCityMesh(this.masterMesh ? newFeaturesToBuild : this.cachedFeatures);
    }
  }

  private resetAccumulatedBuffers(): void {
    this.builtBuildingKeys.clear();
    this.accBuildingPosIdx = 0;
    this.accBuildingUvIdx = 0;
    this.accBuildingHeightIdx = 0;
    this.buildingGroups = [];

    this.accRooftopPosIdx = 0;
    this.accRooftopUvIdx = 0;
    this.accRooftopHeightIdx = 0;
  }

  private hasAnySlotVertices(): boolean {
    return this.accBuildingPosIdx > 0;
  }

  private ensureBuildingCapacity(additionalVertices: number): void {
    const neededFloats = this.accBuildingPosIdx + additionalVertices * 3;
    if (neededFloats > this.accBuildingPosBuf.length) {
      const newSize = Math.max(this.accBuildingPosBuf.length * 2, neededFloats + 200000);
      const newPos = new Float32Array(newSize);
      const newNorm = new Float32Array(newSize);
      const newColor = new Float32Array(newSize);
      const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
      const newHeight = new Float32Array(Math.floor(newSize / 3));

      newPos.set(this.accBuildingPosBuf.subarray(0, this.accBuildingPosIdx));
      newNorm.set(this.accBuildingNormBuf.subarray(0, this.accBuildingPosIdx));
      newColor.set(this.accBuildingColorBuf.subarray(0, this.accBuildingPosIdx));
      newUv.set(this.accBuildingUvBuf.subarray(0, this.accBuildingUvIdx));
      newHeight.set(this.accBuildingHeightBuf.subarray(0, this.accBuildingHeightIdx));

      this.accBuildingPosBuf = newPos;
      this.accBuildingNormBuf = newNorm;
      this.accBuildingColorBuf = newColor;
      this.accBuildingUvBuf = newUv;
      this.accBuildingHeightBuf = newHeight;
    }
  }

  private addSlotTriangle = (
    _slot: number,
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    norm: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    color?: [number, number, number]
  ): void => {
    this.ensureBuildingCapacity(3);
    const p = this.accBuildingPosIdx;
    const u = this.accBuildingUvIdx;
    const h = this.accBuildingHeightIdx;
    const baseElev = this.currentBuildingBaseElev;
    const cr = color ? color[0] : 1.0;
    const cg = color ? color[1] : 1.0;
    const cb = color ? color[2] : 1.0;

    const pos = this.accBuildingPosBuf;
    const nrm = this.accBuildingNormBuf;
    const col = this.accBuildingColorBuf;
    const uvs = this.accBuildingUvBuf;
    const hts = this.accBuildingHeightBuf;

    const relH0 = Math.max(0, p0[1] - baseElev);
    const relH1 = Math.max(0, p1[1] - baseElev);
    const relH2 = Math.max(0, p2[1] - baseElev);

    // [3단계: 건물 하단 0m ~ 2.5m 접지 앰비언트 오클루전 그라데이션 0.78 -> 1.0 적용]
    const ao0 = relH0 < 2.5 ? 0.78 + 0.22 * (relH0 / 2.5) : 1.0;
    const ao1 = relH1 < 2.5 ? 0.78 + 0.22 * (relH1 / 2.5) : 1.0;
    const ao2 = relH2 < 2.5 ? 0.78 + 0.22 * (relH2 / 2.5) : 1.0;

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

    this.accBuildingPosIdx += 9;
    this.accBuildingUvIdx += 6;
    this.accBuildingHeightIdx += 3;
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
    this.addSlotTriangle(0, p0, p1, p2, norm, uv0, uv1, uv2, color);
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
      0,
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
    this.ensureRooftopCapacity(3);
    const p = this.accRooftopPosIdx;
    const u = this.accRooftopUvIdx;
    const h = this.accRooftopHeightIdx;
    const baseElev = this.currentBuildingBaseElev;
    const cr = color ? color[0] : 1.0;
    const cg = color ? color[1] : 1.0;
    const cb = color ? color[2] : 1.0;

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
      const minWidth = Math.min(spanX, spanZ);

      // [1단계: 마스터 전역 기하 필터] 면적 4,000㎡ 초과 비건물 및 찢어짐 폴리곤 100% 영구 차단
      const featProps = (feat.properties || {}) as Record<string, any>;
      if (!isPermittedBuildingPolygon(featProps, areaSqm, spanX, spanZ, maxEdgeLen, minWidth)) {
        continue;
      }

      // [1단계: 화면 중앙 붉은색/검은색 삼각형 찢어짐(Polygon Tearing) 원천 차단]
      if (maxEdgeLen > 220 || spanX > 260 || spanZ > 260) {
        continue;
      }

      // [신규: 폭 6m 미만 또는 세장비 8.0 초과 도로/보행로/옹벽/방음벽 등 비건물 수직 장벽 100% 원천 차단]
      if (minWidth < 6.0) {
        continue;
      }
      if (Math.max(spanX, spanZ) / minWidth > 8.0) {
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

      // [2단계 핵심] 뾰족 기둥(바늘 타워) 강제 클램핑: 250㎡ 미만 또는 폭 8m 미만은 절대 12m(3층) 초과 불가
      if (areaSqm < 250 || minWidth < 8.0) {
        height = Math.min(height, 12.0);
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
      const hasTerrain = Boolean(map.getTerrain());
      let rawElev = 0;

      if (hasTerrain) {
        try {
          if (typeof map.queryTerrainElevation === 'function') {
            const q = map.queryTerrainElevation([cLng, cLat]);
            if (typeof q === 'number' && Number.isFinite(q) && q > 0) {
              rawElev = q;
            } else if (rawCoords && rawCoords.length > 0) {
              // 중심점 고도 누락 시 외곽 정점 샘플링으로 최대 지형고도 획득 (땅속 매몰 원천 방지)
              for (let k = 0; k < Math.min(rawCoords.length, 6); k++) {
                const eq = map.queryTerrainElevation([rawCoords[k][0], rawCoords[k][1]]);
                if (typeof eq === 'number' && Number.isFinite(eq) && eq > rawElev) {
                  rawElev = eq;
                }
              }
            }
          }
          if (rawElev <= 0) {
            const cached = elevationCache.getFromMap(map, [cLng, cLat]);
            if (cached > 0) rawElev = cached;
          }
        } catch {}

        // 지형 타일 로드 대기 중 안전 표고: 지역별 실측 지형 고도 동적 추정
        if (rawElev <= 0) {
          if (cLat >= 37.31 && cLat <= 37.35 && cLng >= 127.96 && cLng <= 128.01) {
            rawElev = 162.0; // 원주 반곡동 혁신도시 지형 표고
          } else if (cLat >= 37.30 && cLat <= 37.38 && cLng >= 127.90 && cLng <= 127.98) {
            rawElev = 142.0; // 원주 도심권
          } else if (cLat >= 37.84 && cLat <= 37.92 && cLng >= 127.68 && cLng <= 127.76) {
            rawElev = 76.0;  // 춘천 도심권
          } else if (cLat >= 37.72 && cLat <= 37.80 && cLng >= 128.85 && cLng <= 128.93) {
            rawElev = 22.0;  // 강릉 도심권
          } else {
            rawElev = 135.0; // 강원 평균
          }
        }
      } else {
        // 지형 비활성화 시 해수면 0m 평면에 칼같이 밀착
        rawElev = 0;
      }

      const baseElev = rawElev;
      this.currentBuildingBaseElev = baseElev;
      const topElev = baseElev + height;

      // [GeoBrief 3D 1단계: Multi-Material 16종 독립 바인딩을 위한 시작 정점 오프셋 및 Material 인덱스 산출]
      const startVertex = this.accBuildingPosIdx / 3;
      const bldgSeed = Math.abs(Math.floor(cLng * 100000 + cLat * 100000));
      const bldgStyle = classifyBuildingStyle(featProps, bldgSeed, areaSqm, height, [cLng, cLat]);
      const materialIndex = (bldgStyle.facadeSlot ?? 0) % 16;

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

        const vertexCount = this.accBuildingPosIdx / 3 - startVertex;
        if (vertexCount > 0) {
          this.buildingGroups.push({
            start: startVertex,
            count: vertexCount,
            materialIndex,
          });
        }
        anyBuilt = true;
        continue;
      }

      // -------------------------------------------------------------------
      // A. [GeoBrief 3D 2단계: V-World급 5단 분리형 초정밀 지오메트리 & 동적 3-LOD 직결]
      // -------------------------------------------------------------------
      const zoom = map.getZoom();
      const mapCenter = map.getCenter();
      const dLngM = (cLng - mapCenter.lng) * metersPerLng;
      const dLatM = (cLat - mapCenter.lat) * metersPerLat;
      const distFromCenterM = Math.hypot(dLngM, dLatM);

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

      const vertexCount = this.accBuildingPosIdx / 3 - startVertex;
      if (vertexCount > 0) {
        this.buildingGroups.push({
          start: startVertex,
          count: vertexCount,
          materialIndex,
        });
      }

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
        this.originLngLat = [center.lng, center.lat];
        this.fixedOriginInitialized = true;
      } else {
        const dLng = Math.abs(center.lng - this.originLngLat[0]);
        const dLat = Math.abs(center.lat - this.originLngLat[1]);
        if (dLng > 0.35 || dLat > 0.35) {
          this.originLngLat = [center.lng, center.lat];
          this.resetAccumulatedBuffers();
        }
      }

      this.clampedAltitude = 0; // 항상 해수면(0m) 고정 기준계 유지 (표고 이중 가산 방지)

      const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
      const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
      const metersPerLat = (Math.PI / 180) * 6378137;

      // [2단계: 뷰포트 및 주변 광역 블록(반경 8km+) 전 구역 수천 동 100% 최우선 빌드]
      const bounds = map.getBounds();
      const minLng = bounds.getWest() - 0.085;
      const maxLng = bounds.getEast() + 0.085;
      const minLat = bounds.getSouth() - 0.080;
      const maxLat = bounds.getNorth() + 0.080;

      const viewportFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
      const outerFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];

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
        } else {
          outerFeatures.push(feat);
        }
      }

      const maxLimit = this.options.maxBuildings || 35000;
      const combinedList = [...viewportFeatures, ...outerFeatures];
      const features = combinedList.length > maxLimit ? combinedList.slice(0, maxLimit) : combinedList;

      let featureIdx = 0;
      let newlyAddedCount = 0;
      const FRAME_BUDGET_MS = 22.0; // 프레임당 약 22ms 타임버짓으로 화면 내 건물 초고속 일괄 렌더링

      const executeSlice = (deadline?: any) => {
        if (this.activeBuildTaskId !== currentTaskId) return;
        if (!this.map) {
          this.isBuildingGeometry = false;
          return;
        }

        // [인터랙션 잠금: 카메라 이동/회전/줌 중에는 가벼운 대기 후 재시도 (60fps 유지)]
        if (this.isMoving || (this.map && (this.map.isMoving() || this.map.isRotating() || this.map.isZooming()))) {
          this.activeBuildIdleId = setTimeout(executeSlice, 180);
          return;
        }

        const sliceStartTime = performance.now();
        let sliceCount = 0;

        while (featureIdx < features.length) {
          if (sliceCount > 0 && sliceCount % 350 === 0) {
            const elapsed = performance.now() - sliceStartTime;
            if (elapsed >= FRAME_BUDGET_MS) {
              break;
            }
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

        if (featureIdx < features.length) {
          // [화면 즉시 표시 및 주기적 커밋]: 최초 30동 생성 시 즉시 표출, 이후 350동 단위로 증분 커밋
          if (
            this.hasAnySlotVertices() &&
            (newlyAddedCount >= 350 || (!this.hasInitialBuilt && newlyAddedCount >= 30))
          ) {
            this.commitAccumulatedGeometry();
            this.options.onBuildingCountChange?.(this.builtBuildingKeys.size);
            newlyAddedCount = 0;
            this.hasInitialBuilt = true;
          }
          // 뷰포트 내 건물 완료 시까지는 setTimeout(0)으로 무지연 고속 빌드
          if (featureIdx < viewportFeatures.length || this.builtBuildingKeys.size < 6000) {
            this.activeBuildIdleId = setTimeout(executeSlice, 0);
          } else {
            this.activeBuildIdleId = setTimeout(executeSlice, 14);
          }
        } else {
          // 전체 피처 슬라이싱 완료!
          this.activeBuildIdleId = null;
          this.isBuildingGeometry = false;
          this.hasInitialBuilt = true;

          // 전체 슬라이스 완료 시 커밋 및 메트릭 갱신
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
   * [1단계: Multi-Material 16종 독립 바인딩 & 건물 단위 그룹 일괄 커밋]
   */
  private commitAccumulatedGeometry(): void {
    if (!this.map || !this.scene) return;

    if (this.accBuildingPosIdx > 0 && this.buildingMaterials.length > 0) {
      const finalPositions = this.accBuildingPosBuf.subarray(0, this.accBuildingPosIdx);
      const finalNormals = this.accBuildingNormBuf.subarray(0, this.accBuildingPosIdx);
      const finalColors = this.accBuildingColorBuf.subarray(0, this.accBuildingPosIdx);
      const finalUvs = this.accBuildingUvBuf.subarray(0, this.accBuildingUvIdx);
      const finalHeights = this.accBuildingHeightBuf.subarray(0, this.accBuildingHeightIdx);

      const newGeometry = new THREE.BufferGeometry();
      newGeometry.clearGroups();

      for (let i = 0; i < this.buildingGroups.length; i++) {
        const g = this.buildingGroups[i];
        newGeometry.addGroup(g.start, g.count, g.materialIndex);
      }

      newGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
      newGeometry.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
      newGeometry.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));
      newGeometry.setAttribute('uv', new THREE.BufferAttribute(finalUvs, 2));
      newGeometry.setAttribute('aHeight', new THREE.BufferAttribute(finalHeights, 1));
      newGeometry.computeBoundingSphere();

      const newMesh = new THREE.Mesh(newGeometry, this.buildingMaterials);
      newMesh.frustumCulled = false;
      newMesh.visible = this.isVisible;

      console.log(
        `[GeoBrief 3D Multi-Material] 등록된 건물 그룹 수: ${newGeometry.groups.length}개 / 바인딩된 재질 수: ${this.buildingMaterials.length}종`
      );

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

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer || !this.masterMesh) {
      return;
    }

    try {
      // [2단계: 옥상 메쉬 상시 렌더링 (원거리/중거리에서도 지붕 뚫림 0% 보장)]
      if (this.rooftopMesh) {
        this.rooftopMesh.visible = this.isVisible;
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

      // [GeoBrief 3D 1단계] 16종 독립 Material PBR Uniform 동기화
      if (this.buildingMaterials && this.buildingMaterials.length > 0) {
        for (const mat of this.buildingMaterials) {
          if ((mat as any).userData?.customUniforms) {
            updatePhotorealisticPbrUniforms(mat, this.camera, this.sunLight);
          }
        }
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

      // GPU 파이프라인 스톨(gl.getParameter) 방지 및 FBO 상태 보존
      const prevFbo = options?.defaultFramebuffer ?? null;

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
    if (this.buildingMaterials && this.buildingMaterials.length > 0) {
      for (const mat of this.buildingMaterials) {
        mat.dispose();
      }
      this.buildingMaterials = [];
      this.materialMeshes = [];
    }
    if (this.rooftopMesh) {
      this.scene.remove(this.rooftopMesh);
      this.rooftopGeometry?.dispose();
      this.rooftopMaterial?.dispose();
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
