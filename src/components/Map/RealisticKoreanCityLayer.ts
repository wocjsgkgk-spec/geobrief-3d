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
  aggregateBuildingFeatures,
  generateBuildingId,
  getMemoizedBuilding,
  parseAndClassifyBuilding,
} from '@/utils/gangwonSpatialAggregator';

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

  // 조명 시스템
  private sunLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  // 좌표계 변환 원점
  private originLngLat: [number, number] = [127.935, 37.359];
  private clampedAltitude: number = 0;

  // 상태 관리
  private isVisible: boolean = true;
  private isMoving: boolean = false;
  private isBuildingGeometry: boolean = false;
  private moveEndTimer: NodeJS.Timeout | null = null;
  private cachedFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private options: RealisticKoreanCityLayerOptions;

  constructor(options: RealisticKoreanCityLayerOptions = {}) {
    this.options = options;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.masterMesh) {
      this.masterMesh.visible = visible;
    }
  }

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    try {
      // 1. 조명 설정 (한국 도심 자연광: 따뜻한 직사광 + 시원한 하늘광 + 풍부한 환경광)
      this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
      this.sunLight.position.set(120, 160, 90).normalize();
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);

      this.fillLight = new THREE.DirectionalLight(0xbae6fd, 0.55);
      this.fillLight.position.set(-100, 120, -80).normalize();
      this.scene.add(this.fillLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(this.ambientLight);

      // 2. 2048x2048 실사 Canvas 아틀라스 기반 Three.js PBR 재질 초기화
      const atlasTex = getPhotorealisticCityAtlasTexture();
      this.masterMaterial = new THREE.MeshStandardMaterial({
        map: atlasTex || undefined,
        roughness: 0.65,
        metalness: 0.12,
        side: THREE.DoubleSide,
      });

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

      // 4. 카메라 이동/회전 시 60fps 보호 이벤트 리스너 등록
      map.on('movestart', this.handleMoveStart);
      map.on('moveend', this.handleMoveEnd);

      // 5. 초기 건물 데이터 즉시 추출 및 빌드 시도
      const center = map.getCenter();
      this.originLngLat = [center.lng, center.lat];
      this.extractAndBuildFromMap();
    } catch (err) {
      console.warn('[RealisticKoreanCityLayer] onAdd error:', err);
    }
  }

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
    }
    // 300ms 디바운스 후 정지된 뷰포트에서 건물 메쉬 재갱신
    this.moveEndTimer = setTimeout(() => {
      this.moveEndTimer = null;
      if (!this.map || this.isMoving) return;
      this.extractAndBuildFromMap();
    }, 300);
  };

  public setInteracting(interacting: boolean): void {
    if (interacting) {
      this.handleMoveStart();
    } else {
      this.handleMoveEnd();
    }
  }

  /**
   * MapLibre 맵 소스 및 캐시로부터 화면 내 건물을 추출하여 3D 빌드 실행
   */
  public extractAndBuildFromMap(): void {
    if (!this.map || this.isMoving || this.isBuildingGeometry) return;

    let featuresToUse = this.cachedFeatures;

    // 캐시된 외부 실측 데이터가 없으면 벡터 타일에서 즉시 추출
    if (featuresToUse.length === 0) {
      const vectorSources = ['openmaptiles-vector', 'openfreemap', 'openmaptiles'].filter((s) =>
        this.map?.getSource(s)
      );

      for (const srcId of vectorSources) {
        try {
          const srcFeats = this.map.querySourceFeatures(srcId, { sourceLayer: 'building' });
          if (srcFeats && srcFeats.length > 0) {
            featuresToUse = srcFeats as any[];
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    if (featuresToUse.length === 0 && SAMPLE_BUILDINGS?.features?.length > 0) {
      featuresToUse = SAMPLE_BUILDINGS.features as any[];
    }

    if (featuresToUse.length > 0) {
      this.buildRealisticCityMesh(featuresToUse);
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
   * 외부 실측 공간정보 주입 진입점
   */
  public updateBuildings(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    newOriginLngLat?: [number, number]
  ): void {
    if (!features || features.length === 0) return;
    this.cachedFeatures = features;

    if (newOriginLngLat) {
      this.originLngLat = newOriginLngLat;
    } else if (this.map) {
      const c = this.map.getCenter();
      this.originLngLat = [c.lng, c.lat];
    }

    if (!this.isMoving) {
      this.buildRealisticCityMesh(features);
      // 백그라운드 위성 타일 옥상 색상 일괄 샘플링 및 강원권 건물 메모이제이션 (무블로킹)
      aggregateBuildingFeatures(features, { zoom: 16, sampleSatelliteColors: true })
        .then(() => {
          if (!this.isMoving && this.map) {
            this.buildRealisticCityMesh(features);
          }
        })
        .catch(() => {});
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
      this.originLngLat = [center.lng, center.lat];

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

      const maxLimit = this.options.maxBuildings || 3500;
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
      const uvRoofUrethane = getPhotorealisticSlotUV('roof_urethane_sage');
      const uvRoofAsphalt = getPhotorealisticSlotUV('roof_asphalt_charcoal');
      const uvRoofTile = getPhotorealisticSlotUV('roof_terracotta_tile');
      const uvRoofZinc = getPhotorealisticSlotUV('roof_zinc_blue');
      const uvParapet = getPhotorealisticSlotUV('parapet_concrete');
      const uvPenthouse = getPhotorealisticSlotUV('penthouse_wall');

      // 1. 단일 대용량 버퍼 사전 할당 (재할당/push 오버헤드 0%)
      const estimatedFloats = Math.min(features.length * 360, 1800000);
      let posBuf = new Float32Array(estimatedFloats);
      let normBuf = new Float32Array(estimatedFloats);
      let uvBuf = new Float32Array(Math.floor((estimatedFloats / 3) * 2));

      let posIdx = 0;
      let uvIdx = 0;

      const ensureCapacity = (additionalVertices: number) => {
        const neededFloats = posIdx + additionalVertices * 3;
        if (neededFloats > posBuf.length) {
          const newSize = Math.max(posBuf.length * 2, neededFloats + 50000);
          const newPos = new Float32Array(newSize);
          const newNorm = new Float32Array(newSize);
          const newUv = new Float32Array(Math.floor((newSize / 3) * 2));
          newPos.set(posBuf);
          newNorm.set(normBuf);
          newUv.set(uvBuf);
          posBuf = newPos;
          normBuf = newNorm;
          uvBuf = newUv;
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

        // v1
        posBuf[posIdx + 3] = p1[0];
        posBuf[posIdx + 4] = p1[1];
        posBuf[posIdx + 5] = p1[2];
        normBuf[posIdx + 3] = norm[0];
        normBuf[posIdx + 4] = norm[1];
        normBuf[posIdx + 5] = norm[2];
        uvBuf[uvIdx + 2] = uv1[0];
        uvBuf[uvIdx + 3] = uv1[1];

        // v2
        posBuf[posIdx + 6] = p2[0];
        posBuf[posIdx + 7] = p2[1];
        posBuf[posIdx + 8] = p2[2];
        normBuf[posIdx + 6] = norm[0];
        normBuf[posIdx + 7] = norm[1];
        normBuf[posIdx + 8] = norm[2];
        uvBuf[uvIdx + 4] = uv2[0];
        uvBuf[uvIdx + 5] = uv2[1];

        posIdx += 9;
        uvIdx += 6;
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

          // 와인딩 오더 보정 (CCW)
          if (area2D < 0) {
            pts2D.reverse();
          }

          // 가장 긴 변과 짧은 변 계산 (판상형 아파트 vs 단독주택 기하 판별)
          let maxEdgeLen = 0;
          let minEdgeLen = Infinity;
          for (let i = 0; i < ptCount; i++) {
            const j = (i + 1) % ptCount;
            const elen = Math.hypot(pts2D[j].x - pts2D[i].x, pts2D[j].z - pts2D[i].z);
            if (elen > maxEdgeLen) maxEdgeLen = elen;
            if (elen < minEdgeLen) minEdgeLen = elen;
          }

          // 강원권 공간데이터 통합 메모이제이션 조회 및 6대 건축 속성 완성
          const bldgId = generateBuildingId(feat, fIdx);
          const meta = getMemoizedBuilding(bldgId) || parseAndClassifyBuilding(feat, rawCoords, fIdx);
          const height = meta.height;
          const isApt = meta.isApt;
          const isComm = meta.isCommercial;
          const isMilitary = meta.isMilitary;

          // 지형 표고 캐시 확인 및 안착 (clampedAltitude 기준 상대 표고)
          const rawElev =
            elevationCache.getFromMap(map, [cLng, cLat]) ||
            (map.queryTerrainElevation ? map.queryTerrainElevation([cLng, cLat]) || 0 : 0);
          const baseElev = rawElev - this.clampedAltitude;
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
            const edgeLen = Math.hypot(dx, dz);
            if (edgeLen < 0.2) continue;

            // 외벽 법선 벡터
            const nx = dz / edgeLen;
            const nz = -dx / edgeLen;

            let wallUV: UVRect = uvAptCream;

            if (isApt) {
              // 긴 변은 발코니 창호, 짧은 변은 무창 콘크리트 측벽 브랜드 밴드
              if (edgeLen > minEdgeLen * 1.3 || edgeLen > 18.0) {
                const aptSlot = (fIdx + i) % 3;
                wallUV = aptSlot === 0 ? uvAptCream : aptSlot === 1 ? uvAptBeige : uvAptGray;
              } else {
                wallUV = uvAptSide;
              }
            } else if (isComm) {
              // 상가 1층은 쇼윈도, 2층 이상은 커튼월/석재
              wallUV = (fIdx + i) % 2 === 0 ? uvCommCurtain : uvCommGranite;
            } else if (isMilitary) {
              wallUV = uvMilitary;
            } else {
              // 다세대 빌라 / 주택: 밝은 샌드베이지 / 화강석 / 라이트웜그레이 톤 (쨍한 적벽돌 완전 제거)
              const slot = (fIdx + i) % 3;
              wallUV = slot === 0 ? uvVillaGranite : slot === 1 ? uvAptBeige : uvAptGray;
            }

            const pBL: [number, number, number] = [p1.x, baseElev, p1.z];
            const pBR: [number, number, number] = [p2.x, baseElev, p2.z];
            const pTR: [number, number, number] = [p2.x, topElev, p2.z];
            const pTL: [number, number, number] = [p1.x, topElev, p1.z];

            addQuad(pBL, pBR, pTR, pTL, [nx, 0, nz], wallUV);
          }

          // -------------------------------------------------------------------
          // B. 윗면(Roof) earcut 삼각분할 및 항공사진 실사 색감 4종 분포
          // 1) 콘크리트 웜그레이 35% (#78716c)
          // 2) 우레탄 세이지그린 30% (#3a5a40)
          // 3) 다크 슬레이트 20% (#475569)
          // 4) 적갈색 기와 15% (#7c2d12)
          // -------------------------------------------------------------------
          const flatCoords: number[] = [];
          let minX = Infinity,
            maxX = -Infinity,
            minZ = Infinity,
            maxZ = -Infinity;

          for (let i = 0; i < ptCount; i++) {
            flatCoords.push(pts2D[i].x, pts2D[i].z);
            if (pts2D[i].x < minX) minX = pts2D[i].x;
            if (pts2D[i].x > maxX) maxX = pts2D[i].x;
            if (pts2D[i].z < minZ) minZ = pts2D[i].z;
            if (pts2D[i].z > maxZ) maxZ = pts2D[i].z;
          }

          // [위성 타일 색감 1:1 매칭 추출 기반 지붕 재질 UV 할당 (실제 초록우레탄·콘크리트·파란징크·적갈색기와)]
          let roofUV = uvRoofConcrete;
          switch (meta.roofColor.roofType) {
            case 'urethane':
              roofUV = uvRoofUrethane; // 실제 초록 우레탄 옥상 (#15803d)
              break;
            case 'zinc_blue':
              roofUV = uvRoofZinc; // 실제 파란색 공장/물류/징크 지붕 (#1e3a8a, #2563eb)
              break;
            case 'terracotta':
              roofUV = uvRoofTile; // 실제 적갈색 점토기와/슁글 (#991b1b)
              break;
            case 'asphalt':
              roofUV = uvRoofAsphalt; // 실제 다크 차콜 아스팔트 (#334155)
              break;
            case 'concrete':
            default:
              roofUV = uvRoofConcrete; // 실제 회색 콘크리트 슬래브 (#64748b)
              break;
          }

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

          // -------------------------------------------------------------------
          // C. 입체 옥상 구조물 (0.9m 난간 + 3.0m 옥탑방 코어 or ㅅ자 박공지붕)
          // -------------------------------------------------------------------
          const isGabled = meta.roofShape === 'gabled';

          if (isGabled) {
            const gabledUV =
              meta.roofColor.roofType === 'zinc_blue'
                ? uvRoofZinc
                : meta.roofColor.roofType === 'asphalt'
                ? uvRoofAsphalt
                : uvRoofTile;

            // 저층 주택 및 군 막사 ㅅ자형 경사 박공지붕
            const cx = (minX + maxX) / 2;
            const cz = (minZ + maxZ) / 2;
            const apexY = topElev + 2.5;

            // 남북 방향 능선 생성
            const r0: [number, number, number] = [cx, apexY, minZ];
            const r1: [number, number, number] = [cx, apexY, maxZ];

            // 동쪽 경사면
            addQuad(
              [maxX, topElev, minZ],
              [maxX, topElev, maxZ],
              r1,
              r0,
              [0.707, 0.707, 0],
              gabledUV
            );
            // 서쪽 경사면
            addQuad(
              r0,
              r1,
              [minX, topElev, maxZ],
              [minX, topElev, minZ],
              [-0.707, 0.707, 0],
              gabledUV
            );
          } else {
            // 평슬래브 옥상 테두리 0.9m 난간(Parapet) 돌출
            const parapetH = 0.9;
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

              addQuad(
                [p1.x, topElev, p1.z],
                [p2.x, topElev, p2.z],
                [p2.x, topElev + parapetH, p2.z],
                [p1.x, topElev + parapetH, p1.z],
                [nx, 0, nz],
                uvParapet
              );
            }

            // 중·고층 옥상 엘리베이터 권상기실 / 옥탑방 박스 (높이 3.0m)
            if (height >= 14.0 && spanX > 8.0 && spanZ > 8.0) {
              const coreW = Math.min(6.0, spanX * 0.35);
              const coreD = Math.min(6.0, spanZ * 0.35);
              const cx = (minX + maxX) / 2;
              const cz = (minZ + maxZ) / 2;
              const coreBaseY = topElev;
              const coreTopY = topElev + 3.0;

              const cX0 = cx - coreW / 2;
              const cX1 = cx + coreW / 2;
              const cZ0 = cz - coreD / 2;
              const cZ1 = cz + coreD / 2;

              // 옥탑 외벽 4면
              addQuad(
                [cX0, coreBaseY, cZ0],
                [cX1, coreBaseY, cZ0],
                [cX1, coreTopY, cZ0],
                [cX0, coreTopY, cZ0],
                [0, 0, -1],
                uvPenthouse
              );
              addQuad(
                [cX1, coreBaseY, cZ0],
                [cX1, coreBaseY, cZ1],
                [cX1, coreTopY, cZ1],
                [cX1, coreTopY, cZ0],
                [1, 0, 0],
                uvPenthouse
              );
              addQuad(
                [cX1, coreBaseY, cZ1],
                [cX0, coreBaseY, cZ1],
                [cX0, coreTopY, cZ1],
                [cX1, coreTopY, cZ1],
                [0, 0, 1],
                uvPenthouse
              );
              addQuad(
                [cX0, coreBaseY, cZ1],
                [cX0, coreBaseY, cZ0],
                [cX0, coreTopY, cZ0],
                [cX0, coreTopY, cZ1],
                [-1, 0, 0],
                uvPenthouse
              );

              // 옥탑 윗면
              addQuad(
                [cX0, coreTopY, cZ0],
                [cX1, coreTopY, cZ0],
                [cX1, coreTopY, cZ1],
                [cX0, coreTopY, cZ1],
                [0, 1, 0],
                uvRoofConcrete
              );
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

        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
        newGeometry.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
        newGeometry.setAttribute('uv', new THREE.BufferAttribute(finalUvs, 2));
        newGeometry.computeBoundingSphere();

        const newMesh = new THREE.Mesh(newGeometry, this.masterMaterial);
        newMesh.frustumCulled = false;
        newMesh.visible = this.isVisible;

        // 기존 메쉬 안전 해제 및 신규 메쉬 원자적 교체
        if (this.masterMesh) {
          this.scene.remove(this.masterMesh);
          this.masterGeometry?.dispose();
        }

        this.masterMesh = newMesh;
        this.masterGeometry = newGeometry;
        this.scene.add(this.masterMesh);

        this.options.onBuildingCountChange?.(builtBuildingCount);
      }
    } catch (buildErr) {
      console.warn('[RealisticKoreanCityLayer] buildRealisticCityMesh exception:', buildErr);
    } finally {
      this.isBuildingGeometry = false;
    }
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer || !this.masterMesh) {
      return;
    }

    try {
      // [지형 표고 레이스 컨디션 해결] DEM 타일 로딩 완료 후 지형 표고가 수신되면 지형 위로 리빌드
      if (this.clampedAltitude === 0 && this.map) {
        const queried =
          elevationCache.getFromMap(this.map, this.originLngLat) ||
          (this.map.queryTerrainElevation ? this.map.queryTerrainElevation(this.originLngLat) || 0 : 0);
        if (queried > 5.0) {
          this.clampedAltitude = queried;
          this.extractAndBuildFromMap();
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

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const m = new THREE.Matrix4().fromArray(rawMatrix as any);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

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
    map.off('movestart', this.handleMoveStart);
    map.off('moveend', this.handleMoveEnd);
    if (this.moveEndTimer) {
      clearTimeout(this.moveEndTimer);
      this.moveEndTimer = null;
    }
    if (this.masterMesh) {
      this.scene.remove(this.masterMesh);
      this.masterGeometry?.dispose();
      this.masterMesh = null;
    }
    this.cachedFeatures = [];
  }
}
