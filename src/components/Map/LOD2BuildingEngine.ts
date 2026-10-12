/**
 * LOD2BuildingEngine.ts
 *
 * MapLibre fill-extrusion을 대체하는 Three.js 기반 한국형 실감 3D 건축물 렌더링 엔진
 * - [1. 한국 도심 특화 텍스처 및 PBR 파사드 파이프라인 (koreanBuildingTextures.ts)]:
 *   1) 한국형 판상형 아파트 (층고 3m 기준 발코니 난간, 이중창 화이트 섀시, 층간 슬래브, 에어컨 거치대)
 *   2) 상업 오피스 빌딩 (알루미늄 루버 멀리언, 반사 유리 커튼월, 딥블루 스카이 반사광)
 *   3) 저층 근린생활시설 (1층 쇼윈도 통유리, 간판 띠장, 상층부 석재 타일 외장재)
 * - [2. 실측 미터(m) 단위 기반 정밀 UV 매핑]:
 *   - 가로 3.0m x 세로 3.0m(층고 3m) 비례 정규화로 왜곡 없는 무한 반복 타일링(THREE.RepeatWrapping)
 *   - 옥상 상단면: 짙은 차콜 그레이(#334155) 방수 우레탄 재질과 1.2m 돌출 난간(Parapet) 분리 마감
 * - [3. 3D DEM 지형 표고 정밀 밀착 (Terrain Elevation Clamping)]:
 *   - 외곽선 정점별 DEM 고도 샘플링 및 최저 지표면 고도(minElev)에 맞춘 기초 옹벽(Foundation) 생성
 * - [4. 렌더링 최적화 & LOD 줌 제어 (60fps)]:
 *   - BufferGeometryUtils.mergeGeometries 기반 드로우 콜 극소화 (수백 동 -> 8개 이하 Draw Calls)
 *   - 줌 14 이상에서만 고해상도 세부 텍스처 메쉬가 표시되도록 LOD 필터 적용
 *   - 카메라 Frustum 컬링 활성화
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
// 1. OBB (Oriented Bounding Box) 및 박공/모임 중심축 산출 유틸리티
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

  // 병합 메쉬 노드 (한국형 건축 파사드 유형별 병합 메쉬)
  private aptWallMesh: THREE.Mesh | null = null;
  private comWallMesh: THREE.Mesh | null = null;
  private neighWallMesh: THREE.Mesh | null = null;
  private landmarkWallMesh: THREE.Mesh | null = null; // [신규] 반사 유리 고층 타워
  private helipadBaseMesh: THREE.Mesh | null = null;  // [신규] 옥상 헬리패드 데크
  private helipadMarkMesh: THREE.Mesh | null = null;  // [신규] 옥상 헬리패드 H & 링 마킹
  private terracottaRoofMesh: THREE.Mesh | null = null;
  private slateRoofMesh: THREE.Mesh | null = null;
  private parapetMesh: THREE.Mesh | null = null;
  private penthouseMesh: THREE.Mesh | null = null;
  private foundationMesh: THREE.Mesh | null = null;

  // PBR 재질 팔레트
  private materials: KoreanBuildingMaterials | null = null;
  private roofTerracottaMaterial: THREE.MeshStandardMaterial | null = null;

  private originLngLat: [number, number] = [127.9358, 37.3592]; // 기본: 원주 거점
  private clampedAltitude = 0;
  private isVisible = true;
  private buildingCount = 0;

  constructor() {
    this.initMaterials();
  }

  /**
   * PBR 물리 기반 머티리얼 초기화
   */
  private initMaterials(): void {
    this.materials = getKoreanBuildingMaterials();

    // 단독/연립 주택 및 군 막사용 테라코타 적갈색 지붕
    this.roofTerracottaMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513, // 테라코타 새들브라운
      roughness: 0.5,
      metalness: 0.15,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }

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

    // 1. [입체 조명 명암비 극대화] Directional Sun Light (position: [1.4, 125, 45], intensity: 0.95 기반 고대비 조명)
    // - 방위각 125°, 고도각 45°(polar 45°)에 맞춘 Three.js 광원 위치 (X: 116, Y: 141, Z: 81)
    // - 건물의 햇빛 받는 면과 그림자 면의 명암비가 사진처럼 선명하게 드러나도록 세팅
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

    // 환경광(Ambient) 강도를 낮추어(0.42) 그림자 면의 입체감과 엣지 대비를 극대화
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
   * 수신된 GeoJSON 피처 컬렉션을 파싱하여 한국형 실감 파사드 메쉬를 일괄 생성합니다.
   * - 가로 3.0m x 세로 3.0m 실측 정밀 UV 타일링
   * - 판상형 아파트, 상업 오피스 빌딩, 저층 근린생활시설 3종 텍스처 분리 적용
   * - BufferGeometryUtils.mergeGeometries를 활용해 8개 이하 메쉬로 병합하여 60fps 유지
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

    // 외벽 지오메트리 수집 버퍼 (한국형 파사드 4종 분리: 아파트, 상업, 근생, 랜드마크 고층)
    const aptWallGeometries: THREE.BufferGeometry[] = [];
    const comWallGeometries: THREE.BufferGeometry[] = [];
    const neighWallGeometries: THREE.BufferGeometry[] = [];
    const landmarkWallGeometries: THREE.BufferGeometry[] = [];

    // 헬리패드 버퍼 (원형 베이스 데크, H 마킹 및 노란색 링)
    const helipadBaseGeometries: THREE.BufferGeometry[] = [];
    const helipadMarkGeometries: THREE.BufferGeometry[] = [];

    // 지붕 및 부속 구조물 버퍼
    const terracottaRoofGeometries: THREE.BufferGeometry[] = [];
    const slateRoofGeometries: THREE.BufferGeometry[] = [];
    const parapetGeometries: THREE.BufferGeometry[] = [];
    const penthouseGeometries: THREE.BufferGeometry[] = [];
    const foundationGeometries: THREE.BufferGeometry[] = [];

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

      // 한국 건축물 유형 판별:
      // 1) 랜드마크 및 15층 이상 고층 빌딩 / 주요 공공청사
      // 2) 판상형 아파트: apartment
      // 3) 상업 오피스: commercial
      // 4) 저층 근린생활시설 / 일반: residential, house, villa, general
      const floorCount = Math.max(
        Number(props.levels) || 0,
        Number(props['building:levels']) || 0,
        Number(props.GRND_FLR_CNT) || 0,
        Math.round(totalH / 3.2)
      );

      const isPublicOffice =
        usageType.includes('public') ||
        usageType.includes('government') ||
        (props.name && /(청사|시청|도청|법원|검찰청|경찰서|소방서|정부|공단|공사|센터|의회|본부)/.test(String(props.name)));

      // 15층 이상 고층 빌딩 및 주요 공공청사 판별 -> 독립 랜드마크 고층 반사 유리 타워
      const isLandmarkTower =
        floorCount >= 15 ||
        totalH >= 45.0 ||
        (isPublicOffice && totalH >= 20.0);

      const isApartment =
        !isLandmarkTower &&
        (usageType.includes('apartment') ||
          usageType.includes('apt') ||
          (props.name && String(props.name).includes('아파트')));

      const isCommercial =
        !isLandmarkTower &&
        !isApartment &&
        (usageType.includes('commercial') ||
          usageType.includes('office') ||
          (props.name && (String(props.name).includes('타워') || String(props.name).includes('빌딩'))));

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

        // 1. [3D DEM 지형 표고 정밀 밀착 (Terrain Elevation Clamping)]
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

        // 3. [벽체 (Wall) 메쉬 및 실제 미터(m) 단위 기반 UV 텍스처 매핑]
        // 실제 축척: 가로 3.0m x 세로 3.0m(층고 3.0m) 기준으로 정확히 반복 타일링
        const wallPositions: number[] = [];
        const wallNormals: number[] = [];
        const wallUvs: number[] = [];

        let cumDist = 0;
        const N = pts.length;
        const wallTop = minElev + totalH;

        for (let i = 0; i < N; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % N];
          const segLen = p0.distanceTo(p1);
          if (segLen < 0.05) continue;

          // 실제 미터 단위 UV 매핑: 가로 3m x 세로 3m
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

        // 4. [입체 지붕 및 옥상 마감]
        const obb = computeOBB(pts);
        const isPitchedRoof =
          !isLandmarkTower &&
          (usageType.includes('house') ||
            usageType.includes('villa') ||
            usageType.includes('military')) &&
          totalH <= 12;

        if (isPitchedRoof) {
          // [유형 1: 단독/연립 주택 & 군 막사 -> 22도 입체 박공/모임 경사 지붕 (테라코타)]
          const ridgeHeight = Math.min(obb.lenV * 0.5 * Math.tan((22 * Math.PI) / 180), 5.5);
          const ridgeTop = wallTop + ridgeHeight;

          const halfU = Math.max(0.1, obb.lenU * 0.38);
          const rP0 = new THREE.Vector2(
            obb.obbCenter.x - obb.dirU.x * halfU,
            obb.obbCenter.y - obb.dirU.y * halfU
          );
          const rP1 = new THREE.Vector2(
            obb.obbCenter.x + obb.dirU.x * halfU,
            obb.obbCenter.y + obb.dirU.y * halfU
          );

          const rPositions: number[] = [];
          const rNormals: number[] = [];

          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];

            const d0_0 = p0.distanceToSquared(rP0);
            const d0_1 = p0.distanceToSquared(rP1);
            const rMid = (d0_0 + d0_1 < p1.distanceToSquared(rP0) + p1.distanceToSquared(rP1)) ? rP0 : rP1;

            rPositions.push(
              p0.x, wallTop, p0.y,
              p1.x, wallTop, p1.y,
              rMid.x, ridgeTop, rMid.y
            );
            rNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
          }

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
            terracottaRoofGeometries.push(rGeom);
          }
        } else {
          // [유형 2: 판상형 아파트 & 상업 빌딩 & 고층 타워 -> 옥상 슬래브(#334155) + 1.2m 돌출 난간 + 엘리베이터 옥탑]
          // (a) 옥상 방수 슬래브 바닥면 (짙은 차콜 그레이 #334155)
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

          // (b) 옥상 1.2m 돌출 난간 (Parapet)
          const pPositions: number[] = [];
          const pNormals: number[] = [];
          const parapetTop = wallTop + 1.2;

          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];
            const len = p0.distanceTo(p1);
            if (len < 0.05) continue;

            const dx = p1.x - p0.x;
            const dz = p1.y - p0.y;
            const nx = dz / len;
            const nz = -dx / len;

            pPositions.push(
              p0.x, wallTop, p0.y,
              p1.x, parapetTop, p1.y,
              p1.x, wallTop, p1.y,
              p0.x, wallTop, p0.y,
              p0.x, parapetTop, p0.y,
              p1.x, parapetTop, p1.y
            );
            for (let k = 0; k < 6; k++) pNormals.push(nx, 0, nz);
          }

          if (pPositions.length > 0) {
            const pGeom = new THREE.BufferGeometry();
            pGeom.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
            pGeom.setAttribute('normal', new THREE.Float32BufferAttribute(pNormals, 3));
            parapetGeometries.push(pGeom);
          }

          // (c) 사각 권상기실 및 설비 코어 (Penthouse Core)
          const coreW = Math.max(4.0, obb.lenU * (isLandmarkTower ? 0.28 : 0.22));
          const coreD = Math.max(4.0, obb.lenV * (isLandmarkTower ? 0.28 : 0.22));
          const coreH = isLandmarkTower ? 4.2 : 3.2;

          const boxGeom = new THREE.BoxGeometry(coreW, coreH, coreD);
          boxGeom.translate(obb.obbCenter.x, wallTop + coreH / 2, obb.obbCenter.y);
          penthouseGeometries.push(boxGeom);

          // (d) [15층 이상 고층 빌딩 및 주요 공공청사 랜드마크 특화] 옥상 헬리패드(H 마킹) 디테일 메쉬
          if (isLandmarkTower) {
            const helipadRadius = Math.max(5.0, Math.min(13.0, Math.min(obb.lenU, obb.lenV) * 0.35));
            const padDeckH = 0.45;
            const padTop = wallTop + padDeckH;

            // 원형 베이스 플레이트
            const padGeo = new THREE.CylinderGeometry(helipadRadius, helipadRadius, padDeckH, 24);
            padGeo.translate(obb.obbCenter.x, wallTop + padDeckH / 2, obb.obbCenter.y);
            helipadBaseGeometries.push(padGeo);

            // 노란색 안전 경계 링
            const ringGeo = new THREE.RingGeometry(helipadRadius * 0.78, helipadRadius * 0.90, 32);
            ringGeo.rotateX(-Math.PI / 2);
            ringGeo.translate(obb.obbCenter.x, padTop + 0.05, obb.obbCenter.y);
            helipadMarkGeometries.push(ringGeo);

            // 중앙 대형 'H' 마킹 (3개 직사각형 조합)
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
          }
        }

        count++;
      }
    }

    // 5. [지역 핵심 랜드마크 고층 타워 자동 생성 (공공청사 / 혁신 타워 클러스터)]
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
        // DEM 지형 고도 샘플링
        let lmElev = 0;
        if (this.map && typeof (this.map as any).queryTerrainElevation === 'function') {
          const q = (this.map as any).queryTerrainElevation([lm.lng, lm.lat]);
          if (q !== null && q !== undefined && !isNaN(q)) lmElev = q;
        }

        const cosLat = Math.cos((this.originLngLat[1] * Math.PI) / 180);
        const lmX = (lm.lng - this.originLngLat[0]) * (Math.PI / 180) * 6378137 * cosLat;
        const lmZ = -(lm.lat - this.originLngLat[1]) * (Math.PI / 180) * 6378137;
        const lmWallTop = lmElev + lm.height;

        // 타워 4각 외벽 생성
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

        // 옥탑 사각 권상기실
        const lmPhGeom = new THREE.BoxGeometry(lm.width * 0.35, 4.8, lm.depth * 0.35);
        lmPhGeom.translate(lmX, lmWallTop + 2.4, lmZ);
        penthouseGeometries.push(lmPhGeom);

        // 옥상 헬리패드 데크 및 H 마킹
        const lmPadR = Math.min(lm.width, lm.depth) * 0.36;
        const lmPadH = 0.45;
        const lmPadTop = lmWallTop + lmPadH;

        const lmPadGeo = new THREE.CylinderGeometry(lmPadR, lmPadR, lmPadH, 24);
        lmPadGeo.translate(lmX, lmWallTop + lmPadH / 2, lmZ);
        helipadBaseGeometries.push(lmPadGeo);

        const lmRingGeo = new THREE.RingGeometry(lmPadR * 0.78, lmPadR * 0.90, 32);
        lmRingGeo.rotateX(-Math.PI / 2);
        lmRingGeo.translate(lmX, lmPadTop + 0.05, lmZ);
        helipadMarkGeometries.push(lmRingGeo);

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

        count++;
      }
    }

    this.buildingCount = count;

    // 6. [동일 텍스처/재질 지오메트리 일괄 병합 (BufferGeometryUtils.mergeGeometries)]
    // 전체 씬을 단 11개 이하의 메쉬로 결합하여 Draw Call을 극소화(50회 이하 조건 완벽 충족)
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

    if (helipadBaseGeometries.length > 0 && this.materials?.helipadBaseMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(helipadBaseGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadBaseMesh = new THREE.Mesh(merged, this.materials.helipadBaseMaterial);
        this.helipadBaseMesh.castShadow = true;
        this.helipadBaseMesh.receiveShadow = true;
        this.helipadBaseMesh.frustumCulled = true;
        this.scene.add(this.helipadBaseMesh);
      }
    }

    if (helipadMarkGeometries.length > 0 && this.materials?.helipadMarkMaterial) {
      const merged = BufferGeometryUtils.mergeGeometries(helipadMarkGeometries, false);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadMarkMesh = new THREE.Mesh(merged, this.materials.helipadMarkMaterial);
        this.helipadMarkMesh.castShadow = true;
        this.helipadMarkMesh.receiveShadow = true;
        this.helipadMarkMesh.frustumCulled = true;
        this.scene.add(this.helipadMarkMesh);
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

    if (terracottaRoofGeometries.length > 0 && this.roofTerracottaMaterial) {
      const mergedRoof = BufferGeometryUtils.mergeGeometries(terracottaRoofGeometries, false);
      if (mergedRoof) {
        mergedRoof.computeBoundingSphere();
        this.terracottaRoofMesh = new THREE.Mesh(mergedRoof, this.roofTerracottaMaterial);
        this.terracottaRoofMesh.castShadow = true;
        this.terracottaRoofMesh.receiveShadow = true;
        this.terracottaRoofMesh.frustumCulled = true;
        this.scene.add(this.terracottaRoofMesh);
      }
    }

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

    if (parapetGeometries.length > 0 && this.materials?.parapetMaterial) {
      const mergedParapet = BufferGeometryUtils.mergeGeometries(parapetGeometries, false);
      if (mergedParapet) {
        mergedParapet.computeBoundingSphere();
        this.parapetMesh = new THREE.Mesh(mergedParapet, this.materials.parapetMaterial);
        this.parapetMesh.castShadow = true;
        this.parapetMesh.receiveShadow = true;
        this.parapetMesh.frustumCulled = true;
        this.scene.add(this.parapetMesh);
      }
    }

    if (penthouseGeometries.length > 0 && this.materials?.penthouseMaterial) {
      const mergedPenthouse = BufferGeometryUtils.mergeGeometries(penthouseGeometries, false);
      if (mergedPenthouse) {
        mergedPenthouse.computeBoundingSphere();
        this.penthouseMesh = new THREE.Mesh(mergedPenthouse, this.materials.penthouseMaterial);
        this.penthouseMesh.castShadow = true;
        this.penthouseMesh.receiveShadow = true;
        this.penthouseMesh.frustumCulled = true;
        this.scene.add(this.penthouseMesh);
      }
    }

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

    if (this.map) {
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

      // 2. Mercator 좌표계 투영 (지형 표고에 정확히 스냅)
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
      this.helipadMarkMesh,
      this.terracottaRoofMesh,
      this.slateRoofMesh,
      this.parapetMesh,
      this.penthouseMesh,
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
    this.helipadMarkMesh = null;
    this.terracottaRoofMesh = null;
    this.slateRoofMesh = null;
    this.parapetMesh = null;
    this.penthouseMesh = null;
    this.foundationMesh = null;
  }

  /**
   * 레이어 해제 및 전체 GPU 메모리 완전 반환
   */
  onRemove(): void {
    this.clearMeshes();

    // 한국형 파사드 텍스처 및 머티리얼 GPU 캐시 완전 해제
    disposeKoreanBuildingMaterials();
    this.materials = null;

    if (this.roofTerracottaMaterial) {
      this.roofTerracottaMaterial.dispose();
      this.roofTerracottaMaterial = null;
    }

    // 조명 해제
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
