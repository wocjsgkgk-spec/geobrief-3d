/**
 * LOD2BuildingEngine.ts
 *
 * MapLibre fill-extrusion을 대체하는 Three.js 기반 한국형 실감 3D 건축물 렌더링 엔진
 * - [1. 한국 도심 특화 실감 옥상 구조물(Roof Structures) 절차적 생성]:
 *   1) 아파트 단지 옥상: 1.2m 차콜 그레이 난간(Parapet), 엘리베이터 권상기실, 옥상 STS 물탱크, 환기 벤트 메쉬
 *   2) 대형 빌딩/공공청사: 옥상 헬리패드(녹색 원형 바탕 + 백색 'H' 마킹 + 황색 안전 링) 및 사각 태양광 패널 그리드
 *   3) 저층 단독/군사 시설: 용마루 선이 살아있는 20도 각도의 입체 박공 지붕(Gabled Roof) 메쉬
 * - [2. 층고 비례(3.0m) 정밀 창문/베란다 텍스처 매핑]:
 *   - 실측 미터 단위(가로 3m x 세로 3m) UV 매핑 (RepeatWrapping)으로 왜곡 없는 무한 반복 타일링
 *   - 창문 유리면 은은한 하늘빛 반사(Roughness: 0.2, Metalness: 0.8) 하이라이트
 * - [3. 메모리 최적화 및 인스턴싱(Instancing)]:
 *   - 지붕 난간, 엘리베이터 옥탑, 물탱크, 벤트, 태양광 패널을 THREE.InstancedMesh로 일괄 병합 렌더링 (60fps 유지)
 * - [4. 3D DEM 지형 표고 정밀 밀착 (Terrain Elevation Clamping)]
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getKoreanBuildingMaterials,
  disposeKoreanBuildingMaterials,
  KoreanBuildingMaterials,
} from '@/utils/koreanBuildingTextures';

// =============================================================================
// 1. OBB (Oriented Bounding Box) 및 지붕 중심축 산출 유틸리티
// =============================================================================
interface OBBResult {
  centroid: THREE.Vector2;
  dirU: THREE.Vector2; // 긴 축 단위벡터
  dirV: THREE.Vector2; // 짧은 축 단위벡터
  lenU: number;        // 긴 축 길이
  lenV: number;        // 짧은 축 길이
  obbCenter: THREE.Vector2;
}

function computeOBB(pts: THREE.Vector2[]): OBBResult {
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.y;
  }
  cx /= pts.length;
  cz /= pts.length;
  const centroid = new THREE.Vector2(cx, cz);

  let covXX = 0;
  let covZZ = 0;
  let covXZ = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dz = p.y - cz;
    covXX += dx * dx;
    covZZ += dz * dz;
    covXZ += dx * dz;
  }
  const phi = 0.5 * Math.atan2(2 * covXZ, covXX - covZZ);
  let dirU = new THREE.Vector2(Math.cos(phi), Math.sin(phi));
  let dirV = new THREE.Vector2(-Math.sin(phi), Math.cos(phi));

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of pts) {
    const du = (p.x - cx) * dirU.x + (p.y - cz) * dirU.y;
    const dv = (p.x - cx) * dirV.x + (p.y - cz) * dirV.y;
    minU = Math.min(minU, du);
    maxU = Math.max(maxU, du);
    minV = Math.min(minV, dv);
    maxV = Math.max(maxV, dv);
  }

  let lenU = maxU - minU;
  let lenV = maxV - minV;
  if (lenU < lenV) {
    const tmpDir = dirU;
    dirU = dirV;
    dirV = tmpDir;
    const tmpLen = lenU;
    lenU = lenV;
    lenV = tmpLen;
    const tmpMin = minU;
    minU = minV;
    minV = tmpMin;
    const tmpMax = maxU;
    maxU = maxV;
    maxV = tmpMax;
  }

  const midU = (minU + maxU) * 0.5;
  const midV = (minV + maxV) * 0.5;
  const obbCenter = new THREE.Vector2(
    centroid.x + dirU.x * midU + dirV.x * midV,
    centroid.y + dirU.y * midU + dirV.y * midV
  );

  return { centroid, dirU, dirV, lenU, lenV, obbCenter };
}

// WGS84 좌표 배열을 원점 기준 로컬 미터 좌표로 투영 변환
function projectCoordsToLocalMeters(
  coords: [number, number][],
  origin: [number, number]
): THREE.Vector2[] {
  if (!coords || coords.length < 3) return [];

  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
  const metersPerLat = (Math.PI / 180) * 6378137;

  const pts: THREE.Vector2[] = [];
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    if (i === len - 1 && len > 3) {
      const d0 = Math.abs(coords[i][0] - coords[0][0]);
      const d1 = Math.abs(coords[i][1] - coords[0][1]);
      if (d0 < 1e-7 && d1 < 1e-7) break;
    }
    const x = (coords[i][0] - origin[0]) * metersPerLng;
    const z = -(coords[i][1] - origin[1]) * metersPerLat;
    pts.push(new THREE.Vector2(x, z));
  }

  // CCW (반시계방향) 와인딩 오더 보장
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  if (area < 0) {
    pts.reverse();
  }

  return pts;
}

// 2D 폴리곤 Earcut 삼각화
function triangulatePolygon2D(pts: THREE.Vector2[]): number[] {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  const indices: number[] = [];
  const V: number[] = [];
  for (let i = 0; i < n; i++) V.push(i);

  let count = 2 * n;
  let v = n - 1;

  while (V.length > 2) {
    if (count-- <= 0) break;

    const u = v >= V.length ? 0 : v;
    v = (u + 1) % V.length;
    const w = (v + 1) % V.length;

    const A = pts[V[u]];
    const B = pts[V[v]];
    const C = pts[V[w]];

    const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    if (cross <= 1e-5) continue;

    let isEar = true;
    for (let p = 0; p < V.length; p++) {
      if (p === u || p === v || p === w) continue;
      const P = pts[V[p]];
      const sign1 = (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
      const sign2 = (C.x - B.x) * (P.y - B.y) - (C.y - B.y) * (P.x - B.x);
      const sign3 = (A.x - C.x) * (P.y - C.y) - (A.y - C.y) * (P.x - C.x);
      const hasNeg = sign1 < 0 || sign2 < 0 || sign3 < 0;
      const hasPos = sign1 > 0 || sign2 > 0 || sign3 > 0;
      if (!(hasNeg && hasPos)) {
        isEar = false;
        break;
      }
    }

    if (isEar) {
      indices.push(V[u], V[v], V[w]);
      V.splice(v, 1);
      count = 2 * V.length;
    }
  }

  // 폴백: 삼각팬
  if (indices.length === 0) {
    for (let i = 1; i < n - 1; i++) {
      indices.push(0, i, i + 1);
    }
  }

  return indices;
}

// =============================================================================
// 2. LOD2BuildingEngine 클래스 (MapLibre 3D 커스텀 레이어)
// =============================================================================
export class LOD2BuildingEngine implements maplibregl.CustomLayerInterface {
  id = 'lod2-building-engine-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  // 조명 객체
  private directionalLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  // 병합 메쉬 노드 (벽체, 슬래브, 지형 옹벽)
  private aptWallMesh: THREE.Mesh | null = null;
  private comWallMesh: THREE.Mesh | null = null;
  private neighWallMesh: THREE.Mesh | null = null;
  private landmarkWallMesh: THREE.Mesh | null = null;
  private helipadBaseMesh: THREE.Mesh | null = null;  // 녹색 우레탄 원형 바탕 데크
  private helipadRingMesh: THREE.Mesh | null = null;  // 노란색 안전 경계 링
  private helipadMarkMesh: THREE.Mesh | null = null;  // 백색 'H' 마킹
  private gabledRoofMesh: THREE.Mesh | null = null;   // 20도 입체 박공 지붕
  private slateRoofMesh: THREE.Mesh | null = null;    // 옥상 방수 슬래브 (#334155)
  private foundationMesh: THREE.Mesh | null = null;

  // [신규] 인스턴싱 메쉬 노드 (THREE.InstancedMesh - 일괄 렌더링 & 60fps 보장)
  private parapetInstancedMesh: THREE.InstancedMesh | null = null;    // 1.2m 돌출 난간
  private penthouseInstancedMesh: THREE.InstancedMesh | null = null;  // 엘리베이터 권상기실
  private waterTankInstancedMesh: THREE.InstancedMesh | null = null;  // 옥상 STS 원통형 물탱크
  private ventInstancedMesh: THREE.InstancedMesh | null = null;       // 옥상 환기 벤트
  private solarPanelInstancedMesh: THREE.InstancedMesh | null = null; // 사각 태양광 패널 그리드

  // 재사용 단위 지오메트리 캐시
  private static unitParapetGeo: THREE.BoxGeometry | null = null;
  private static unitPenthouseGeo: THREE.BoxGeometry | null = null;
  private static unitWaterTankGeo: THREE.CylinderGeometry | null = null;
  private static unitVentGeo: THREE.CylinderGeometry | null = null;
  private static unitSolarGeo: THREE.BoxGeometry | null = null;

  // PBR 재질 팔레트
  private materials: KoreanBuildingMaterials | null = null;

  private originLngLat: [number, number] = [127.9358, 37.3592]; // 기본: 원주 거점
  private clampedAltitude = 0;
  private isVisible = true;
  private buildingCount = 0;

  constructor() {
    this.initGeometries();
    this.initMaterials();
  }

  /**
   * 인스턴싱용 단위 지오메트리 초기화
   */
  private initGeometries(): void {
    if (!LOD2BuildingEngine.unitParapetGeo) {
      // 1.2m 난간 빔 (폭 1.0m, 높이 1.2m, 두께 0.25m, 바닥 Y=0)
      LOD2BuildingEngine.unitParapetGeo = new THREE.BoxGeometry(1.0, 1.2, 0.25);
      LOD2BuildingEngine.unitParapetGeo.translate(0, 0.6, 0);

      // 엘리베이터 권상기실 (1m x 1m x 1m, 바닥 Y=0)
      LOD2BuildingEngine.unitPenthouseGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
      LOD2BuildingEngine.unitPenthouseGeo.translate(0, 0.5, 0);

      // STS 원통형 물탱크 (반경 0.5m = 직경 1m, 높이 1m, 바닥 Y=0)
      LOD2BuildingEngine.unitWaterTankGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16);
      LOD2BuildingEngine.unitWaterTankGeo.translate(0, 0.5, 0);

      // 옥상 환기 벤트 (버섯/원통형, 반경 0.35m, 높이 1.0m, 바닥 Y=0)
      LOD2BuildingEngine.unitVentGeo = new THREE.CylinderGeometry(0.3, 0.38, 1.0, 12);
      LOD2BuildingEngine.unitVentGeo.translate(0, 0.5, 0);

      // 사각 태양광 패널 모듈 (가로 2.4m, 두께 0.08m, 세로 1.4m)
      LOD2BuildingEngine.unitSolarGeo = new THREE.BoxGeometry(2.4, 0.08, 1.4);
    }
  }

  /**
   * PBR 물리 기반 머티리얼 초기화
   */
  private initMaterials(): void {
    this.materials = getKoreanBuildingMaterials();
  }

  private currentZoomLOD = 16;
  private solidWallMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
    color: 0xF1F5F9,
    roughness: 0.65,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public getBuildingCount(): number {
    return this.buildingCount;
  }

  /**
   * 줌 레벨 최적화 (LOD 제어):
   * - 줌 14 미만: 경량 단색 음영(Solid Color), 미세 난간/설비 비표출로 60fps 유지
   * - 줌 14 이상: 실감 파사드 텍스처(창문/베란다 격자) 및 1.2m 돌출 난간 렌더링
   */
  public updateZoomLOD(currentZoom: number): void {
    const isDetailed = currentZoom >= 14;
    const wasDetailed = this.currentZoomLOD >= 14;
    this.currentZoomLOD = currentZoom;

    if (isDetailed === wasDetailed) return;

    if (this.aptWallMesh && this.materials) {
      this.aptWallMesh.material = isDetailed ? this.materials.apartmentMaterial : this.solidWallMaterial;
    }
    if (this.comWallMesh && this.materials) {
      this.comWallMesh.material = isDetailed ? this.materials.commercialMaterial : this.solidWallMaterial;
    }
    if (this.neighWallMesh && this.materials) {
      this.neighWallMesh.material = isDetailed ? this.materials.neighborhoodMaterial : this.solidWallMaterial;
    }

    if (this.parapetInstancedMesh) {
      this.parapetInstancedMesh.visible = isDetailed;
    }
    if (this.ventInstancedMesh) {
      this.ventInstancedMesh.visible = isDetailed;
    }
    if (this.waterTankInstancedMesh) {
      this.waterTankInstancedMesh.visible = isDetailed;
    }

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  /**
   * 태양광 방향각 및 조명 업데이트
   */
  public updateSunLight(
    vector: [number, number, number],
    color: string,
    intensity: number
  ): void {
    if (this.directionalLight) {
      this.directionalLight.position.set(vector[0], vector[1], vector[2]).normalize();
      this.directionalLight.color.set(color);
      this.directionalLight.intensity = intensity * 1.8;
    }
  }

  /**
   * MapLibre 지도 장착 콜백
   */
  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    const center = map.getCenter();
    this.originLngLat = [center.lng, center.lat];

    // 1. [입체 조명 명암비 극대화] Directional Sun Light
    this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.directionalLight.position.set(116, 141, 81).normalize();
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.bias = -0.0001;
    this.scene.add(this.directionalLight);

    this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    this.fillLight.position.set(-80, 100, 80).normalize();
    this.scene.add(this.fillLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.42);
    this.scene.add(this.ambientLight);

    // 2. WebGLRenderer 연동
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch (err) {
      console.warn('[LOD2BuildingEngine] WebGLRenderer setup notice:', err);
    }
  }

  /**
   * 수신된 GeoJSON 피처 컬렉션을 파싱하여 한국형 실감 파사드 & 옥상 구조물 메쉬를 생성합니다.
   * - 층고 3.0m 정밀 창문/베란다 UV 매핑 (RepeatWrapping, Roughness: 0.2, Metalness: 0.8)
   * - 옥상 난간, 권상기실, 물탱크, 벤트, 태양광 패널 -> THREE.InstancedMesh 일괄 인스턴싱
   * - 대형 빌딩 옥상 헬리패드 (녹색 원형 바탕 + 백색 'H' 마킹)
   * - 저층 단독/군사 시설 20도 입체 박공 지붕 (Gabled Roof)
   */
  public updateBuildings(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    newOriginLngLat?: [number, number]
  ): void {
    if (!features || features.length === 0) {
      this.clearMeshes();
      this.buildingCount = 0;
      return;
    }

    if (newOriginLngLat) {
      this.originLngLat = newOriginLngLat;
    } else if (this.map) {
      const c = this.map.getCenter();
      this.originLngLat = [c.lng, c.lat];
    }

    this.clearMeshes();

    if (!this.materials) {
      this.initMaterials();
    }

    // 외벽 지오메트리 수집 버퍼
    const aptWallGeometries: THREE.BufferGeometry[] = [];
    const comWallGeometries: THREE.BufferGeometry[] = [];
    const neighWallGeometries: THREE.BufferGeometry[] = [];
    const landmarkWallGeometries: THREE.BufferGeometry[] = [];

    // 헬리패드 버퍼 (녹색 원형 데크, 노란색 안전 링, 백색 'H' 마킹)
    const helipadBaseGeometries: THREE.BufferGeometry[] = [];
    const helipadRingGeometries: THREE.BufferGeometry[] = [];
    const helipadMarkGeometries: THREE.BufferGeometry[] = [];

    // 지붕 및 기초 옹벽 버퍼
    const gabledRoofGeometries: THREE.BufferGeometry[] = [];
    const slateRoofGeometries: THREE.BufferGeometry[] = [];
    const foundationGeometries: THREE.BufferGeometry[] = [];

    // [신규] 인스턴싱 행렬 수집 배열 (THREE.InstancedMesh용)
    const parapetMatrices: THREE.Matrix4[] = [];
    const penthouseMatrices: THREE.Matrix4[] = [];
    const waterTankMatrices: THREE.Matrix4[] = [];
    const ventMatrices: THREE.Matrix4[] = [];
    const solarMatrices: THREE.Matrix4[] = [];

    // 변환 계산용 임시 객체
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();
    const tempMat = new THREE.Matrix4();
    const tempEuler = new THREE.Euler();

    let count = 0;

    for (const feat of features) {
      if (!feat.geometry) continue;

      const props = feat.properties || {};
      const totalH = Number(
        props.height ||
        props.render_height ||
        (props.levels ? props.levels * 3.0 : 0) ||
        (props['building:levels'] ? Number(props['building:levels']) * 3.0 : 0) ||
        12.0
      );

      const usageType = String(
        props.usageType ||
        props.bld_category ||
        props.type ||
        ''
      ).toLowerCase();

      const floorCount = Math.max(
        Number(props.levels) || 0,
        Number(props['building:levels']) || 0,
        Number(props.GRND_FLR_CNT) || 0,
        Math.round(totalH / 3.0)
      );

      const isPublicOffice =
        usageType.includes('public') ||
        usageType.includes('government') ||
        (props.name && /(청사|시청|도청|법원|검찰청|경찰서|소방서|정부|공단|공사|센터|의회|본부)/.test(String(props.name)));

      // 1) 15층 이상 고층 빌딩 및 주요 공공청사 -> 랜드마크 커튼월 타워
      const isLandmarkTower =
        floorCount >= 15 ||
        totalH >= 45.0 ||
        (isPublicOffice && totalH >= 20.0);

      // 2) 한국형 아파트: 아파트 키워드 or 주거용 5층 이상
      const isApartment =
        !isLandmarkTower &&
        (usageType.includes('apartment') ||
          usageType.includes('apt') ||
          (props.name && String(props.name).includes('아파트')) ||
          (usageType.includes('residential') && (floorCount >= 5 || totalH >= 15.0)));

      // 3) 상업 오피스 빌딩
      const isCommercial =
        !isLandmarkTower &&
        !isApartment &&
        (usageType.includes('commercial') ||
          usageType.includes('office') ||
          usageType.includes('retail') ||
          (props.name && (String(props.name).includes('타워') || String(props.name).includes('빌딩') || String(props.name).includes('센터'))));

      // 4) 저층 단독/군사 시설 박공 지붕 판별
      const isPitchedRoof =
        !isLandmarkTower &&
        !isApartment &&
        !isCommercial &&
        (usageType.includes('house') ||
          usageType.includes('villa') ||
          usageType.includes('military') ||
          usageType.includes('barracks') ||
          usageType.includes('detached') ||
          usageType.includes('warehouse') ||
          (usageType.includes('residential') && totalH <= 14.0)) &&
        totalH <= 18.0;

      const rings: [number, number][][] = [];
      if (feat.geometry.type === 'Polygon') {
        rings.push(feat.geometry.coordinates[0] as [number, number][]);
      } else if (feat.geometry.type === 'MultiPolygon') {
        for (const poly of feat.geometry.coordinates) {
          rings.push(poly[0] as [number, number][]);
        }
      }

      for (const ring of rings) {
        if (!ring || ring.length < 3) continue;

        const pts = projectCoordsToLocalMeters(ring, this.originLngLat);
        if (pts.length < 3) continue;

        // 1. [3D DEM 지형 표고 정밀 밀착]
        const elevations: number[] = [];
        for (const coord of ring) {
          let elev = 0;
          if (this.map && typeof (this.map as any).queryTerrainElevation === 'function') {
            const q = (this.map as any).queryTerrainElevation(coord);
            if (q !== null && q !== undefined && !isNaN(q)) {
              elev = q;
            }
          }
          elevations.push(elev);
        }

        const minElev = Math.min(...elevations);
        const maxElev = Math.max(...elevations);
        const wallTop = minElev + totalH;

        // 2. [기초 옹벽 (Adaptive Foundation Clamping) 메쉬 생성]
        if (maxElev - minElev > 0.2) {
          const fPositions: number[] = [];
          const fNormals: number[] = [];
          const N = pts.length;
          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];
            const e0 = elevations[i] || minElev;
            const e1 = elevations[(i + 1) % N] || minElev;

            const dx = p1.x - p0.x;
            const dz = p1.y - p0.y;
            const len = Math.hypot(dx, dz);
            if (len < 0.05) continue;
            const nx = dz / len;
            const nz = -dx / len;

            fPositions.push(
              p0.x, minElev, p0.y,
              p1.x, e1, p1.y,
              p1.x, minElev, p1.y,
              p0.x, minElev, p0.y,
              p0.x, e0, p0.y,
              p1.x, e1, p1.y
            );
            for (let k = 0; k < 6; k++) fNormals.push(nx, 0, nz);
          }
          if (fPositions.length > 0) {
            const fGeom = new THREE.BufferGeometry();
            fGeom.setAttribute('position', new THREE.Float32BufferAttribute(fPositions, 3));
            fGeom.setAttribute('normal', new THREE.Float32BufferAttribute(fNormals, 3));
            foundationGeometries.push(fGeom);
          }
        }

        // 3. [벽체 (Wall) 메쉬 및 층고 3.0m 비례 정밀 UV 텍스처 매핑]
        // 벽면 길이 / 3.0m, 높이 / 3.0m 비율로 UV 좌표가 균일하게 RepeatWrapping 되도록 보정
        const wallPositions: number[] = [];
        const wallNormals: number[] = [];
        const wallUvs: number[] = [];

        let cumDist = 0;
        const N = pts.length;

        for (let i = 0; i < N; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % N];
          const segLen = p0.distanceTo(p1);
          if (segLen < 0.05) continue;

          // 실제 미터(3.0m) 단위 정밀 UV 매핑
          const u0 = cumDist / 3.0;
          const u1 = (cumDist + segLen) / 3.0;
          cumDist += segLen;

          const vTop = totalH / 3.0;

          const dx = p1.x - p0.x;
          const dz = p1.y - p0.y;
          const nx = dz / segLen;
          const nz = -dx / segLen;

          wallPositions.push(
            p0.x, minElev, p0.y,
            p1.x, wallTop, p1.y,
            p1.x, minElev, p1.y,
            p0.x, minElev, p0.y,
            p0.x, wallTop, p0.y,
            p1.x, wallTop, p1.y
          );
          for (let k = 0; k < 6; k++) wallNormals.push(nx, 0, nz);
          wallUvs.push(
            u0, 0,
            u1, vTop,
            u1, 0,
            u0, 0,
            u0, vTop,
            u1, vTop
          );
        }

        if (wallPositions.length > 0) {
          const wGeom = new THREE.BufferGeometry();
          wGeom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
          wGeom.setAttribute('normal', new THREE.Float32BufferAttribute(wallNormals, 3));
          wGeom.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));

          if (isLandmarkTower) {
            landmarkWallGeometries.push(wGeom);
          } else if (isApartment) {
            aptWallGeometries.push(wGeom);
          } else if (isCommercial) {
            comWallGeometries.push(wGeom);
          } else {
            neighWallGeometries.push(wGeom);
          }
        }

        // 4. [한국 도심 특화 실감 옥상 구조물(Roof Structures) 생성]
        const obb = computeOBB(pts);

        if (isPitchedRoof) {
          // [유형 1: 저층 단독/군사 시설 -> 용마루 선이 살아있는 20도 각도의 입체 박공 지붕(Gabled Roof)]
          const ridgeAngleRad = (20 * Math.PI) / 180;
          const ridgeHeight = Math.max(1.4, Math.min(5.5, (obb.lenV * 0.5) * Math.tan(ridgeAngleRad)));
          const ridgeTop = wallTop + ridgeHeight;

          const halfRidgeU = Math.max(0.1, obb.lenU * 0.48);
          const rP0 = new THREE.Vector2(
            obb.obbCenter.x - obb.dirU.x * halfRidgeU,
            obb.obbCenter.y - obb.dirU.y * halfRidgeU
          );
          const rP1 = new THREE.Vector2(
            obb.obbCenter.x + obb.dirU.x * halfRidgeU,
            obb.obbCenter.y + obb.dirU.y * halfRidgeU
          );

          const rPositions: number[] = [];
          const rNormals: number[] = [];

          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];

            // 용마루 선 투영 계산
            const d0 = (p0.x - obb.obbCenter.x) * obb.dirU.x + (p0.y - obb.obbCenter.y) * obb.dirU.y;
            const d1 = (p1.x - obb.obbCenter.x) * obb.dirU.x + (p1.y - obb.obbCenter.y) * obb.dirU.y;
            const cd0 = Math.max(-halfRidgeU, Math.min(halfRidgeU, d0));
            const cd1 = Math.max(-halfRidgeU, Math.min(halfRidgeU, d1));

            const proj0 = new THREE.Vector2(
              obb.obbCenter.x + obb.dirU.x * cd0,
              obb.obbCenter.y + obb.dirU.y * cd0
            );
            const proj1 = new THREE.Vector2(
              obb.obbCenter.x + obb.dirU.x * cd1,
              obb.obbCenter.y + obb.dirU.y * cd1
            );

            // 경사면 사각 패널 (2개 삼각형)
            rPositions.push(
              p0.x, wallTop, p0.y,
              p1.x, wallTop, p1.y,
              proj1.x, ridgeTop, proj1.y,
              p0.x, wallTop, p0.y,
              proj1.x, ridgeTop, proj1.y,
              proj0.x, ridgeTop, proj0.y
            );

            // 법선 벡터 산출 (경사각 20도 반영)
            const vA = new THREE.Vector3(p0.x, wallTop, p0.y);
            const vB = new THREE.Vector3(p1.x, wallTop, p1.y);
            const vC = new THREE.Vector3(proj1.x, ridgeTop, proj1.y);
            const cb = new THREE.Vector3().subVectors(vC, vB);
            const ab = new THREE.Vector3().subVectors(vA, vB);
            const fn = new THREE.Vector3().crossVectors(cb, ab).normalize();
            if (fn.y < 0) fn.negate();

            for (let k = 0; k < 6; k++) {
              rNormals.push(fn.x, fn.y, fn.z);
            }
          }

          // 전/후면 삼각 박공벽 (Gable Triangles) 마감
          rPositions.push(
            rP0.x, ridgeTop, rP0.y,
            rP1.x, ridgeTop, rP1.y,
            obb.centroid.x, wallTop, obb.centroid.y
          );
          for (let k = 0; k < 3; k++) rNormals.push(0, 1, 0);

          if (rPositions.length > 0) {
            const rGeom = new THREE.BufferGeometry();
            rGeom.setAttribute('position', new THREE.Float32BufferAttribute(rPositions, 3));
            rGeom.setAttribute('normal', new THREE.Float32BufferAttribute(rNormals, 3));
            gabledRoofGeometries.push(rGeom);
          }
        } else {
          // [유형 2: 평지붕 건물 - 아파트, 대형 빌딩, 공공청사, 상업, 근생]

          // (a) 옥상 방수 슬래브 (차콜 그레이 #334155)
          const roofTriangles = triangulatePolygon2D(pts);
          if (roofTriangles.length > 0) {
            const slabPos: number[] = [];
            const slabNorm: number[] = [];
            for (const idx of roofTriangles) {
              const p = pts[idx];
              slabPos.push(p.x, wallTop, p.y);
              slabNorm.push(0, 1, 0);
            }
            const slabGeom = new THREE.BufferGeometry();
            slabGeom.setAttribute('position', new THREE.Float32BufferAttribute(slabPos, 3));
            slabGeom.setAttribute('normal', new THREE.Float32BufferAttribute(slabNorm, 3));
            slateRoofGeometries.push(slabGeom);
          }

          // (b) [인스턴싱] 옥상 테두리를 따라 높이 1.2m의 차콜 그레이 난간(Parapet) 자동 생성
          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];
            const segLen = p0.distanceTo(p1);
            if (segLen < 0.1) continue;

            const midX = (p0.x + p1.x) * 0.5;
            const midZ = (p0.y + p1.y) * 0.5;
            const angleY = -Math.atan2(p1.y - p0.y, p1.x - p0.x);

            tempPos.set(midX, wallTop, midZ);
            tempEuler.set(0, angleY, 0, 'YXZ');
            tempQuat.setFromEuler(tempEuler);
            tempScale.set(segLen, 1.0, 1.0);
            tempMat.compose(tempPos, tempQuat, tempScale);
            parapetMatrices.push(tempMat.clone());
          }

          // (c) [인스턴싱] 중앙에 솟아오른 엘리베이터 기계실(권상기실) 큐브
          const coreW = Math.max(3.8, obb.lenU * (isLandmarkTower ? 0.28 : 0.22));
          const coreD = Math.max(3.8, obb.lenV * (isLandmarkTower ? 0.28 : 0.22));
          const coreH = isLandmarkTower ? 4.2 : 3.4;

          tempPos.set(obb.obbCenter.x, wallTop, obb.obbCenter.y);
          const phi = Math.atan2(obb.dirU.y, obb.dirU.x);
          tempEuler.set(0, -phi, 0, 'YXZ');
          tempQuat.setFromEuler(tempEuler);
          tempScale.set(coreW, coreH, coreD);
          tempMat.compose(tempPos, tempQuat, tempScale);
          penthouseMatrices.push(tempMat.clone());

          // (d) [아파트 전용 인스턴싱]: 옥상 STS 원통형 물탱크 + 환기 벤트 메쉬
          if (isApartment) {
            // 원통형 STS 물탱크
            const tankRadius = Math.max(1.0, Math.min(1.8, obb.lenV * 0.12));
            const tankHeight = 2.4;
            const tankOffsetX = obb.dirU.x * (coreW * 0.5 + tankRadius * 1.3);
            const tankOffsetZ = obb.dirU.y * (coreW * 0.5 + tankRadius * 1.3);

            tempPos.set(
              obb.obbCenter.x + tankOffsetX,
              wallTop,
              obb.obbCenter.y + tankOffsetZ
            );
            tempQuat.identity();
            tempScale.set(tankRadius * 2, tankHeight, tankRadius * 2);
            tempMat.compose(tempPos, tempQuat, tempScale);
            waterTankMatrices.push(tempMat.clone());

            // 18층 이상 대단지는 보조 물탱크 1기 추가
            if (floorCount >= 18 || totalH >= 50.0) {
              tempPos.set(
                obb.obbCenter.x - tankOffsetX,
                wallTop,
                obb.obbCenter.y - tankOffsetZ
              );
              tempMat.compose(tempPos, tempQuat, tempScale);
              waterTankMatrices.push(tempMat.clone());
            }

            // 옥상 환기 벤트 (4개 균일 분산)
            const ventCount = 4;
            for (let v = 0; v < ventCount; v++) {
              const vAngle = (v / ventCount) * Math.PI * 2;
              const distU = Math.max(3.0, Math.min(obb.lenU * 0.28, 7.5));
              const distV = Math.max(2.5, Math.min(obb.lenV * 0.28, 5.5));
              const vx = obb.obbCenter.x + Math.cos(vAngle) * distU;
              const vz = obb.obbCenter.y + Math.sin(vAngle) * distV;

              tempPos.set(vx, wallTop, vz);
              tempQuat.identity();
              tempScale.set(0.7, 0.95, 0.7);
              tempMat.compose(tempPos, tempQuat, tempScale);
              ventMatrices.push(tempMat.clone());
            }
          }

          // (e) [대형 빌딩 / 공공청사 전용]: 옥상 헬리패드(녹색 원형 바탕 + 백색 'H' 마킹) 및 사각 태양광 패널 그리드
          if (isLandmarkTower || (isCommercial && totalH >= 30.0) || (isPublicOffice && totalH >= 20.0)) {
            const helipadRadius = Math.max(5.0, Math.min(12.0, Math.min(obb.lenU, obb.lenV) * 0.35));
            const padDeckH = 0.45;
            const padTop = wallTop + padDeckH;

            // 1) 헬리패드 녹색 원형 우레탄 바탕 플레이트
            const padGeo = new THREE.CylinderGeometry(helipadRadius, helipadRadius, padDeckH, 24);
            padGeo.translate(obb.obbCenter.x, wallTop + padDeckH / 2, obb.obbCenter.y);
            helipadBaseGeometries.push(padGeo);

            // 2) 헬리패드 황색 안전 경계 링
            const ringGeo = new THREE.RingGeometry(helipadRadius * 0.78, helipadRadius * 0.90, 32);
            ringGeo.rotateX(-Math.PI / 2);
            ringGeo.translate(obb.obbCenter.x, padTop + 0.05, obb.obbCenter.y);
            helipadRingGeometries.push(ringGeo);

            // 3) 헬리패드 백색 'H' 마킹 메쉬
            const hSpan = helipadRadius * 0.85;
            const hBarW = helipadRadius * 0.16;
            const hSpacing = helipadRadius * 0.32;

            const leftBar = new THREE.BoxGeometry(hBarW, 0.08, hSpan);
            leftBar.translate(obb.obbCenter.x - hSpacing, padTop + 0.08, obb.obbCenter.y);
            helipadMarkGeometries.push(leftBar);

            const rightBar = new THREE.BoxGeometry(hBarW, 0.08, hSpan);
            rightBar.translate(obb.obbCenter.x + hSpacing, padTop + 0.08, obb.obbCenter.y);
            helipadMarkGeometries.push(rightBar);

            const crossBar = new THREE.BoxGeometry(hSpacing * 2, 0.08, hBarW);
            crossBar.translate(obb.obbCenter.x, padTop + 0.08, obb.obbCenter.y);
            helipadMarkGeometries.push(crossBar);

            // 4) [인스턴싱] 사각 태양광 패널 그리드 (헬리패드 반대편 옥상 공간에 남향 15도 경사 배열)
            if (obb.lenU >= 16.0 && obb.lenV >= 14.0) {
              const panelCols = Math.max(2, Math.min(4, Math.floor(obb.lenU / 6.0)));
              const panelRows = 2;
              const spacingX = 2.8;
              const spacingZ = 2.0;

              // 헬리패드 반대편 코너로 오프셋
              const solarCenterX = obb.obbCenter.x - obb.dirU.x * (obb.lenU * 0.28);
              const solarCenterZ = obb.obbCenter.y - obb.dirU.y * (obb.lenU * 0.28);

              tempEuler.set(-15 * (Math.PI / 180), 0, 0, 'YXZ'); // 남향 15도 경사
              tempQuat.setFromEuler(tempEuler);
              tempScale.set(1.0, 1.0, 1.0);

              for (let r = 0; r < panelRows; r++) {
                for (let c = 0; c < panelCols; c++) {
                  const px = solarCenterX + (c - (panelCols - 1) * 0.5) * spacingX;
                  const pz = solarCenterZ + (r - (panelRows - 1) * 0.5) * spacingZ;

                  tempPos.set(px, wallTop + 0.45 + r * 0.12, pz);
                  tempMat.compose(tempPos, tempQuat, tempScale);
                  solarMatrices.push(tempMat.clone());
                }
              }
            }
          }
        }

        count++;
      }
    }

    // 5. [지역 핵심 랜드마크 고층 타워 자동 생성 (원주 시청, 혁신 타워 클러스터 등)]
    const REGIONAL_LANDMARKS = [
      { name: '건강보험심사평가원 본원 타워', lng: 127.9790, lat: 37.3225, floors: 27, height: 115, width: 44, depth: 32 },
      { name: '국민건강보험공단 본부 타워', lng: 127.9735, lat: 37.3255, floors: 30, height: 130, width: 46, depth: 34 },
      { name: '원주시청 행정복합타워', lng: 127.9295, lat: 37.3422, floors: 16, height: 68, width: 52, depth: 36 },
      { name: '원주 1군지사 첨단 R&D 타워', lng: 127.9545, lat: 37.3778, floors: 18, height: 65, width: 38, depth: 28 },
      { name: '강원특별자치도청 본관 타워', lng: 127.7298, lat: 37.8853, floors: 16, height: 65, width: 48, depth: 32 },
    ];

    for (const lm of REGIONAL_LANDMARKS) {
      const dLng = Math.abs(lm.lng - this.originLngLat[0]);
      const dLat = Math.abs(lm.lat - this.originLngLat[1]);
      if (dLng < 0.15 && dLat < 0.15) {
        let lmElev = 0;
        if (this.map && typeof (this.map as any).queryTerrainElevation === 'function') {
          const q = (this.map as any).queryTerrainElevation([lm.lng, lm.lat]);
          if (q !== null && q !== undefined && !isNaN(q)) lmElev = q;
        }

        const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
        const lmX = (lm.lng - this.originLngLat[0]) * (Math.PI / 180) * 6378137 * cosLat;
        const lmZ = -(lm.lat - this.originLngLat[1]) * (Math.PI / 180) * 6378137;
        const lmWallTop = lmElev + lm.height;

        const hw = lm.width / 2;
        const hd = lm.depth / 2;
        const corners = [
          new THREE.Vector2(lmX - hw, lmZ - hd),
          new THREE.Vector2(lmX + hw, lmZ - hd),
          new THREE.Vector2(lmX + hw, lmZ + hd),
          new THREE.Vector2(lmX - hw, lmZ + hd),
        ];

        const lmWallPos: number[] = [];
        const lmWallNorm: number[] = [];
        const lmWallUvs: number[] = [];
        let lmDist = 0;

        for (let i = 0; i < 4; i++) {
          const p0 = corners[i];
          const p1 = corners[(i + 1) % 4];
          const segLen = p0.distanceTo(p1);
          const u0 = lmDist / 3.0;
          const u1 = (lmDist + segLen) / 3.0;
          lmDist += segLen;
          const vTop = lm.height / 3.0;

          const dx = p1.x - p0.x;
          const dz = p1.y - p0.y;
          const nx = dz / segLen;
          const nz = -dx / segLen;

          lmWallPos.push(
            p0.x, lmElev, p0.y,
            p1.x, lmWallTop, p1.y,
            p1.x, lmElev, p1.y,
            p0.x, lmElev, p0.y,
            p0.x, lmWallTop, p0.y,
            p1.x, lmWallTop, p1.y
          );
          for (let k = 0; k < 6; k++) lmWallNorm.push(nx, 0, nz);
          lmWallUvs.push(u0, 0, u1, vTop, u1, 0, u0, 0, u0, vTop, u1, vTop);

          // 난간 인스턴스
          const midX = (p0.x + p1.x) * 0.5;
          const midZ = (p0.y + p1.y) * 0.5;
          const angleY = -Math.atan2(dz, dx);
          tempPos.set(midX, lmWallTop, midZ);
          tempEuler.set(0, angleY, 0, 'YXZ');
          tempQuat.setFromEuler(tempEuler);
          tempScale.set(segLen, 1.0, 1.0);
          tempMat.compose(tempPos, tempQuat, tempScale);
          parapetMatrices.push(tempMat.clone());
        }

        const lmWGeom = new THREE.BufferGeometry();
        lmWGeom.setAttribute('position', new THREE.Float32BufferAttribute(lmWallPos, 3));
        lmWGeom.setAttribute('normal', new THREE.Float32BufferAttribute(lmWallNorm, 3));
        lmWGeom.setAttribute('uv', new THREE.Float32BufferAttribute(lmWallUvs, 2));
        landmarkWallGeometries.push(lmWGeom);

        // 옥상 슬래브
        const lmSlabPos = [
          corners[0].x, lmWallTop, corners[0].y,
          corners[1].x, lmWallTop, corners[1].y,
          corners[2].x, lmWallTop, corners[2].y,
          corners[0].x, lmWallTop, corners[0].y,
          corners[2].x, lmWallTop, corners[2].y,
          corners[3].x, lmWallTop, corners[3].y,
        ];
        const lmSlabGeom = new THREE.BufferGeometry();
        lmSlabGeom.setAttribute('position', new THREE.Float32BufferAttribute(lmSlabPos, 3));
        lmSlabGeom.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
        slateRoofGeometries.push(lmSlabGeom);

        // 권상기실 인스턴스
        tempPos.set(lmX, lmWallTop, lmZ);
        tempQuat.identity();
        tempScale.set(lm.width * 0.35, 4.8, lm.depth * 0.35);
        tempMat.compose(tempPos, tempQuat, tempScale);
        penthouseMatrices.push(tempMat.clone());

        // 옥상 헬리패드 (녹색 바탕 + 황색 링 + 백색 H)
        const lmPadR = Math.min(lm.width, lm.depth) * 0.36;
        const lmPadH = 0.45;
        const lmPadTop = lmWallTop + lmPadH;

        const lmPadGeo = new THREE.CylinderGeometry(lmPadR, lmPadR, lmPadH, 24);
        lmPadGeo.translate(lmX, lmWallTop + lmPadH / 2, lmZ);
        helipadBaseGeometries.push(lmPadGeo);

        const lmRingGeo = new THREE.RingGeometry(lmPadR * 0.78, lmPadR * 0.90, 32);
        lmRingGeo.rotateX(-Math.PI / 2);
        lmRingGeo.translate(lmX, lmPadTop + 0.05, lmZ);
        helipadRingGeometries.push(lmRingGeo);

        const lmHSpan = lmPadR * 0.85;
        const lmHBarW = lmPadR * 0.16;
        const lmHSpace = lmPadR * 0.32;

        const lmLBar = new THREE.BoxGeometry(lmHBarW, 0.08, lmHSpan);
        lmLBar.translate(lmX - lmHSpace, lmPadTop + 0.08, lmZ);
        helipadMarkGeometries.push(lmLBar);

        const lmRBar = new THREE.BoxGeometry(lmHBarW, 0.08, lmHSpan);
        lmRBar.translate(lmX + lmHSpace, lmPadTop + 0.08, lmZ);
        helipadMarkGeometries.push(lmRBar);

        const lmCBar = new THREE.BoxGeometry(lmHSpace * 2, 0.08, lmHBarW);
        lmCBar.translate(lmX, lmPadTop + 0.08, lmZ);
        helipadMarkGeometries.push(lmCBar);

        // 사각 태양광 패널 그리드 인스턴스 (랜드마크 옥상 남향 배열)
        const lmSolarCols = 3;
        const lmSolarRows = 2;
        tempEuler.set(-15 * (Math.PI / 180), 0, 0, 'YXZ');
        tempQuat.setFromEuler(tempEuler);
        tempScale.set(1.0, 1.0, 1.0);

        for (let r = 0; r < lmSolarRows; r++) {
          for (let c = 0; c < lmSolarCols; c++) {
            const px = lmX + (c - 1) * 3.0;
            const pz = lmZ + lm.depth * 0.3 + r * 2.2;
            tempPos.set(px, lmWallTop + 0.5 + r * 0.12, pz);
            tempMat.compose(tempPos, tempQuat, tempScale);
            solarMatrices.push(tempMat.clone());
          }
        }

        count++;
      }
    }

    this.buildingCount = count;

    // 6. [지오메트리 일괄 병합 (BufferGeometryUtils.mergeGeometries)]
    if (landmarkWallGeometries.length > 0 && this.materials?.landmarkTowerMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(landmarkWallGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.landmarkWallMesh = new THREE.Mesh(merged, this.materials.landmarkTowerMaterial);
        this.landmarkWallMesh.castShadow = true;
        this.landmarkWallMesh.receiveShadow = true;
        this.landmarkWallMesh.frustumCulled = true;
        this.scene.add(this.landmarkWallMesh);
      }
    }

    if (aptWallGeometries.length > 0 && this.materials?.apartmentMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(aptWallGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.aptWallMesh = new THREE.Mesh(merged, this.materials.apartmentMaterial);
        this.aptWallMesh.castShadow = true;
        this.aptWallMesh.receiveShadow = true;
        this.aptWallMesh.frustumCulled = true;
        this.scene.add(this.aptWallMesh);
      }
    }

    if (comWallGeometries.length > 0 && this.materials?.commercialMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(comWallGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.comWallMesh = new THREE.Mesh(merged, this.materials.commercialMaterial);
        this.comWallMesh.castShadow = true;
        this.comWallMesh.receiveShadow = true;
        this.comWallMesh.frustumCulled = true;
        this.scene.add(this.comWallMesh);
      }
    }

    if (neighWallGeometries.length > 0 && this.materials?.neighborhoodMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(neighWallGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.neighWallMesh = new THREE.Mesh(merged, this.materials.neighborhoodMaterial);
        this.neighWallMesh.castShadow = true;
        this.neighWallMesh.receiveShadow = true;
        this.neighWallMesh.frustumCulled = true;
        this.scene.add(this.neighWallMesh);
      }
    }

    // 헬리패드 녹색 바탕 데크
    if (helipadBaseGeometries.length > 0 && this.materials?.helipadGreenBaseMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(helipadBaseGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadBaseMesh = new THREE.Mesh(merged, this.materials.helipadGreenBaseMaterial);
        this.helipadBaseMesh.castShadow = true;
        this.helipadBaseMesh.receiveShadow = true;
        this.helipadBaseMesh.frustumCulled = true;
        this.scene.add(this.helipadBaseMesh);
      }
    }

    // 헬리패드 황색 링
    if (helipadRingGeometries.length > 0 && this.materials?.helipadYellowRingMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(helipadRingGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadRingMesh = new THREE.Mesh(merged, this.materials.helipadYellowRingMaterial);
        this.helipadRingMesh.castShadow = true;
        this.helipadRingMesh.receiveShadow = true;
        this.helipadRingMesh.frustumCulled = true;
        this.scene.add(this.helipadRingMesh);
      }
    }

    // 헬리패드 백색 'H' 마킹
    if (helipadMarkGeometries.length > 0 && this.materials?.helipadWhiteMarkMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(helipadMarkGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadMarkMesh = new THREE.Mesh(merged, this.materials.helipadWhiteMarkMaterial);
        this.helipadMarkMesh.castShadow = true;
        this.helipadMarkMesh.receiveShadow = true;
        this.helipadMarkMesh.frustumCulled = true;
        this.scene.add(this.helipadMarkMesh);
      }
    }

    // 20도 입체 박공 지붕 (Gabled Roof)
    if (gabledRoofGeometries.length > 0 && this.materials?.gabledRoofMaterial) {
      const mergedRoof = BufferGeometryUtils.mergeGeometries(gabledRoofGeometries, false);
      if (mergedRoof) {
        mergedRoof.computeBoundingSphere();
        this.gabledRoofMesh = new THREE.Mesh(mergedRoof, this.materials.gabledRoofMaterial);
        this.gabledRoofMesh.castShadow = true;
        this.gabledRoofMesh.receiveShadow = true;
        this.gabledRoofMesh.frustumCulled = true;
        this.scene.add(this.gabledRoofMesh);
      }
    }

    // 옥상 방수 슬래브 바닥면
    if (slateRoofGeometries.length > 0 && this.materials?.roofSlateMaterial) {
      const mergedSlate = BufferGeometryUtils.mergeGeometries(slateRoofGeometries, false);
      if (mergedSlate) {
        mergedSlate.computeBoundingSphere();
        this.slateRoofMesh = new THREE.Mesh(mergedSlate, this.materials.roofSlateMaterial);
        this.slateRoofMesh.castShadow = true;
        this.slateRoofMesh.receiveShadow = true;
        this.slateRoofMesh.frustumCulled = true;
        this.scene.add(this.slateRoofMesh);
      }
    }

    // 지형 밀착 기초 옹벽
    if (foundationGeometries.length > 0 && this.materials?.foundationMaterial) {
      const mergedFoundation = BufferGeometryUtils.mergeGeometries(foundationGeometries, false);
      if (mergedFoundation) {
        mergedFoundation.computeBoundingSphere();
        this.foundationMesh = new THREE.Mesh(mergedFoundation, this.materials.foundationMaterial);
        this.foundationMesh.receiveShadow = true;
        this.foundationMesh.frustumCulled = true;
        this.scene.add(this.foundationMesh);
      }
    }

    // 7. [THREE.InstancedMesh 일괄 인스턴싱 렌더링 (Draw Call 극소화 & 60fps 유지)]
    // (a) 지붕 난간 (Parapet) 인스턴싱
    if (parapetMatrices.length > 0 && this.materials?.parapetMaterial && LOD2BuildingEngine.unitParapetGeo) {
      this.parapetInstancedMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitParapetGeo,
        this.materials.parapetMaterial,
        parapetMatrices.length
      );
      for (let i = 0; i < parapetMatrices.length; i++) {
        this.parapetInstancedMesh.setMatrixAt(i, parapetMatrices[i]);
      }
      this.parapetInstancedMesh.instanceMatrix.needsUpdate = true;
      this.parapetInstancedMesh.computeBoundingSphere();
      this.parapetInstancedMesh.castShadow = true;
      this.parapetInstancedMesh.receiveShadow = true;
      this.parapetInstancedMesh.frustumCulled = true;
      this.scene.add(this.parapetInstancedMesh);
    }

    // (b) 엘리베이터 권상기실 / 기계실 (Penthouse) 인스턴싱
    if (penthouseMatrices.length > 0 && this.materials?.penthouseMaterial && LOD2BuildingEngine.unitPenthouseGeo) {
      this.penthouseInstancedMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitPenthouseGeo,
        this.materials.penthouseMaterial,
        penthouseMatrices.length
      );
      for (let i = 0; i < penthouseMatrices.length; i++) {
        this.penthouseInstancedMesh.setMatrixAt(i, penthouseMatrices[i]);
      }
      this.penthouseInstancedMesh.instanceMatrix.needsUpdate = true;
      this.penthouseInstancedMesh.computeBoundingSphere();
      this.penthouseInstancedMesh.castShadow = true;
      this.penthouseInstancedMesh.receiveShadow = true;
      this.penthouseInstancedMesh.frustumCulled = true;
      this.scene.add(this.penthouseInstancedMesh);
    }

    // (c) 옥상 STS 원통형 물탱크 (Water Tank) 인스턴싱
    if (waterTankMatrices.length > 0 && this.materials?.waterTankMaterial && LOD2BuildingEngine.unitWaterTankGeo) {
      this.waterTankInstancedMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitWaterTankGeo,
        this.materials.waterTankMaterial,
        waterTankMatrices.length
      );
      for (let i = 0; i < waterTankMatrices.length; i++) {
        this.waterTankInstancedMesh.setMatrixAt(i, waterTankMatrices[i]);
      }
      this.waterTankInstancedMesh.instanceMatrix.needsUpdate = true;
      this.waterTankInstancedMesh.computeBoundingSphere();
      this.waterTankInstancedMesh.castShadow = true;
      this.waterTankInstancedMesh.receiveShadow = true;
      this.waterTankInstancedMesh.frustumCulled = true;
      this.scene.add(this.waterTankInstancedMesh);
    }

    // (d) 옥상 환기 벤트 (Vent / HVAC) 인스턴싱
    if (ventMatrices.length > 0 && this.materials?.ventHvacMaterial && LOD2BuildingEngine.unitVentGeo) {
      this.ventInstancedMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitVentGeo,
        this.materials.ventHvacMaterial,
        ventMatrices.length
      );
      for (let i = 0; i < ventMatrices.length; i++) {
        this.ventInstancedMesh.setMatrixAt(i, ventMatrices[i]);
      }
      this.ventInstancedMesh.instanceMatrix.needsUpdate = true;
      this.ventInstancedMesh.computeBoundingSphere();
      this.ventInstancedMesh.castShadow = true;
      this.ventInstancedMesh.receiveShadow = true;
      this.ventInstancedMesh.frustumCulled = true;
      this.scene.add(this.ventInstancedMesh);
    }

    // (e) 사각 태양광 패널 그리드 (Solar Panel) 인스턴싱
    if (solarMatrices.length > 0 && this.materials?.solarPanelMaterial && LOD2BuildingEngine.unitSolarGeo) {
      this.solarPanelInstancedMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitSolarGeo,
        this.materials.solarPanelMaterial,
        solarMatrices.length
      );
      for (let i = 0; i < solarMatrices.length; i++) {
        this.solarPanelInstancedMesh.setMatrixAt(i, solarMatrices[i]);
      }
      this.solarPanelInstancedMesh.instanceMatrix.needsUpdate = true;
      this.solarPanelInstancedMesh.computeBoundingSphere();
      this.solarPanelInstancedMesh.castShadow = true;
      this.solarPanelInstancedMesh.receiveShadow = true;
      this.solarPanelInstancedMesh.frustumCulled = true;
      this.scene.add(this.solarPanelInstancedMesh);
    }

    if (this.map) {
      this.updateZoomLOD(this.map.getZoom());
      this.map.triggerRepaint();
    }
  }

  /**
   * MapLibre 렌더링 루프
   * - 줌 14 이상에서만 세부 텍스처 메쉬가 표시되도록 LOD 필터 적용
   */
  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer) {
      return;
    }

    // [LOD 줌 필터]: 줌 14 미만 광역 뷰에서는 세부 실감 텍스처 메쉬 렌더링을 스킵하여 60fps 유지
    if (this.map) {
      const zoom = this.map.getZoom();
      if (zoom < 14.0) {
        return;
      }
    }

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      // 1. [3D DEM 지형 표고 실시간 조회]
      if (this.map && typeof (this.map as any).queryTerrainElevation === 'function') {
        const queried = (this.map as any).queryTerrainElevation(this.originLngLat);
        if (queried !== null && queried !== undefined) {
          this.clampedAltitude = Math.max(0, queried);
        }
      }

      // 2. Mercator 좌표계 투영
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        this.clampedAltitude
      );

      // 3. units: 'meters' 스케일 환산
      const meterScale = mercator.meterInMercatorCoordinateUnits();

      // 4. 좌표계 회전 변환 (Three.js Y-Up -> MapLibre Z-Up)
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      // 5. 복합 변환 행렬 구성
      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);

      // 6. WebGL 렌더링
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    } catch (renderErr) {
      console.warn('[LOD2BuildingEngine] render warning:', renderErr);
    }
  }

  /**
   * 메쉬 제거 및 지오메트리 GPU 메모리 해제
   */
  private clearMeshes(): void {
    const meshes = [
      this.aptWallMesh,
      this.comWallMesh,
      this.neighWallMesh,
      this.landmarkWallMesh,
      this.helipadBaseMesh,
      this.helipadRingMesh,
      this.helipadMarkMesh,
      this.gabledRoofMesh,
      this.slateRoofMesh,
      this.foundationMesh,
    ];

    for (const mesh of meshes) {
      if (mesh) {
        this.scene.remove(mesh);
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
      }
    }

    this.aptWallMesh = null;
    this.comWallMesh = null;
    this.neighWallMesh = null;
    this.landmarkWallMesh = null;
    this.helipadBaseMesh = null;
    this.helipadRingMesh = null;
    this.helipadMarkMesh = null;
    this.gabledRoofMesh = null;
    this.slateRoofMesh = null;
    this.foundationMesh = null;

    // 인스턴싱 메쉬 해제
    const instanced = [
      this.parapetInstancedMesh,
      this.penthouseInstancedMesh,
      this.waterTankInstancedMesh,
      this.ventInstancedMesh,
      this.solarPanelInstancedMesh,
    ];

    for (const im of instanced) {
      if (im) {
        this.scene.remove(im);
        im.dispose();
      }
    }

    this.parapetInstancedMesh = null;
    this.penthouseInstancedMesh = null;
    this.waterTankInstancedMesh = null;
    this.ventInstancedMesh = null;
    this.solarPanelInstancedMesh = null;
  }

  /**
   * 레이어 해제 및 전체 GPU 메모리 완전 반환
   */
  onRemove(): void {
    this.clearMeshes();

    disposeKoreanBuildingMaterials();
    this.materials = null;

    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      if (this.directionalLight.shadow?.map) {
        this.directionalLight.shadow.map.dispose();
      }
      this.directionalLight.dispose();
      this.directionalLight = null;
    }
    if (this.fillLight) {
      this.scene.remove(this.fillLight);
      this.fillLight.dispose();
      this.fillLight = null;
    }
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }

    this.scene.clear();
    this.renderer = null;
    this.map = null;
  }
}
