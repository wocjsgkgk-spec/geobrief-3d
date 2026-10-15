/**
 * LOD2BuildingEngine.ts
 *
 * MapLibre fill-extrusion을 대체하는 Three.js 기반 한국형 실사 3D 건축물 렌더링 엔진
 * [2단계: 한국형 실사 건축물 텍스처 아틀라스(초록 우레탄 옥상·아파트 베란다·상업 빌딩) 엔진]
 *
 * - [1. 2048x2048 한국 도시 특화 고해상도 아틀라스 연동]:
 *   1) 판상형 아파트 전면 (아이보리 콘크리트 #f5f5f0 + 베란다 섀시 + 에어컨 실외기 루버)
 *   2) 판상형 아파트 측벽 (동 번호 '101' 스텐실 마킹 + 네이비/브라운 브랜드 포인트 밴드)
 *   3) 중층 상가/오피스 (화강석 타일 + 리본 윈도우 + 1층 상가 간판 컬러 띠)
 *   4) 고층 커튼월 타워 (블루/그린 반사 글래스 그리드 #0369a1 ~ #0f172a)
 *   5) 다세대 빌라/단독주택 (적벽돌 #7c2d12 + 밝은 화강석 빌라 외벽)
 *   6) 공공청사/산업시설 (베이지/실버 메탈 패널 + 수직 루버 핀)
 *   7) 지붕 4종 (초록 우레탄 #15803d, 청색 징크 #1d4ed8, 적갈색 슁글 #78350f, 설비 쿨루프 #475569)
 *
 * - [2. 건물 형태·높이·면적 기반 지능형 재질 자동 매핑 (classifyBuilding)]:
 *   - 아파트: 긴 면에 apartment_front, 좁은 측벽에 apartment_side, 75% 초록 우레탄 옥상
 *   - 중층 상가: commercial_mid, 70% 초록 우레탄 옥상, 30% 쿨루프/징크
 *   - 고층 타워: curtainwall_high, 설비 쿨루프
 *   - 저층 빌라: villa_residential, 65% 초록 우레탄, 35% 박공(슁글/징크)
 *
 * - [3. 옥상 1.0m 난간(Parapet) 및 엘리베이터 권상기실(Penthouse) 입체감 연계]:
 *   - 외벽·상단 코핑·내벽 3면 렌더링으로 초록색 우레탄 바닥이 1.0m 깊이로 쏙 들어가 보이게 연출
 *   - 옥탑 중앙 엘리베이터 기계실(3.2m 큐브)에 콘크리트/철문 텍스처 적용
 *
 * - [4. 단일 GPU Draw Call (Single Draw Call)]:
 *   - 모든 건물의 버텍스를 단일 BufferGeometry로 일괄 병합하여 전체 도시를 1~2 Draw Call로 60fps 렌더링
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getKoreanBuildingMaterials,
  disposeKoreanBuildingMaterials,
  KoreanBuildingMaterials,
} from '@/utils/koreanBuildingTextures';
import { updateFacadeShaderLights } from '@/shaders/buildingFacadeShader';
import { elevationCache } from '@/utils/elevationCache';
import {
  getKoreanCityAtlasMaterial,
  disposeKoreanCityAtlas,
  getAtlasSlotUV,
  classifyBuilding,
  AtlasSlot,
} from '@/utils/koreanCityAtlas';

// =============================================================================
// 1. 기하 유틸리티 (OBB, 좌표 변환, 삼각화, 쿼드 버퍼)
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

  if (indices.length === 0) {
    for (let i = 1; i < n - 1; i++) {
      indices.push(0, i, i + 1);
    }
  }

  return indices;
}

/**
 * 4개 정점으로 이루어진 사각 평면(Quad)을 2개 삼각형으로 변환하여 버퍼에 추가합니다.
 */
function addQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  p0: { x: number; y: number; z: number }, // BL
  p1: { x: number; y: number; z: number }, // BR
  p2: { x: number; y: number; z: number }, // TR
  p3: { x: number; y: number; z: number }, // TL
  nx: number,
  ny: number,
  nz: number,
  uv0: { u: number; v: number }, // BL UV
  uv1: { u: number; v: number }, // BR UV
  uv2: { u: number; v: number }, // TR UV
  uv3: { u: number; v: number }  // TL UV
): void {
  // Triangle 1: p0 -> p1 -> p2
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  // Triangle 2: p0 -> p2 -> p3
  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);

  for (let k = 0; k < 6; k++) {
    normals.push(nx, ny, nz);
  }

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);
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
  private onErrorCallback?: (err: any) => void;
  private consecutiveErrors = 0;

  public setOnError(cb: (err: any) => void): void {
    this.onErrorCallback = cb;
  }

  // 3점 조명 (태양 직사광 + 하늘 반구광 + 전역 앰비언트 + 보조 채움광)
  private directionalLight: THREE.DirectionalLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  // [핵심] 도시 전체 단일 마스터 메쉬 (Single Draw Call)
  private masterCityMesh: THREE.Mesh | null = null;
  private masterAtlasMaterial: THREE.MeshStandardMaterial | null = null;

  // 랜드마크 옥상 헬리패드 보조 메쉬 (데크, 황색 링, 백색 H)
  private helipadBaseMesh: THREE.Mesh | null = null;
  private helipadRingMesh: THREE.Mesh | null = null;
  private helipadMarkMesh: THREE.Mesh | null = null;

  // 인스턴싱 메쉬 (아파트 옥상 STS 물탱크, 벤트, 태양광 패널)
  private waterTankInstancedMesh: THREE.InstancedMesh | null = null;
  private ventInstancedMesh: THREE.InstancedMesh | null = null;
  private solarPanelInstancedMesh: THREE.InstancedMesh | null = null;

  private static unitWaterTankGeo: THREE.CylinderGeometry | null = null;
  private static unitVentGeo: THREE.CylinderGeometry | null = null;
  private static unitSolarGeo: THREE.BoxGeometry | null = null;

  // 폴백용 재질 참조
  private materials: KoreanBuildingMaterials | null = null;

  private originLngLat: [number, number] = [127.9358, 37.3592]; // 원주 기준
  private clampedAltitude = 0;
  private lastFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private isVisible = true;
  private buildingCount = 0;
  private currentZoomLOD = 16;

  constructor() {
    this.initGeometries();
    this.initMaterials();
  }

  private initGeometries(): void {
    if (!LOD2BuildingEngine.unitWaterTankGeo) {
      LOD2BuildingEngine.unitWaterTankGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16);
      LOD2BuildingEngine.unitWaterTankGeo.translate(0, 0.5, 0);

      LOD2BuildingEngine.unitVentGeo = new THREE.CylinderGeometry(0.3, 0.38, 1.0, 12);
      LOD2BuildingEngine.unitVentGeo.translate(0, 0.5, 0);

      LOD2BuildingEngine.unitSolarGeo = new THREE.BoxGeometry(2.4, 0.08, 1.4);
    }
  }

  private initMaterials(): void {
    this.materials = getKoreanBuildingMaterials();
    this.masterAtlasMaterial = getKoreanCityAtlasMaterial();
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

  public updateZoomLOD(currentZoom: number): void {
    const isDetailed = currentZoom >= 13.0;
    this.currentZoomLOD = currentZoom;

    if (this.masterCityMesh) {
      this.masterCityMesh.visible = isDetailed;
    }
    if (this.waterTankInstancedMesh) {
      this.waterTankInstancedMesh.visible = isDetailed;
    }
    if (this.ventInstancedMesh) {
      this.ventInstancedMesh.visible = isDetailed;
    }
    if (this.solarPanelInstancedMesh) {
      this.solarPanelInstancedMesh.visible = isDetailed;
    }
    if (this.helipadBaseMesh) {
      this.helipadBaseMesh.visible = isDetailed;
    }
    if (this.helipadRingMesh) {
      this.helipadRingMesh.visible = isDetailed;
    }
    if (this.helipadMarkMesh) {
      this.helipadMarkMesh.visible = isDetailed;
    }

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public updateSunLight(
    vector: [number, number, number],
    color: string,
    intensity: number
  ): void {
    if (this.directionalLight) {
      this.directionalLight.position.set(vector[0], vector[1], vector[2]).normalize();
      this.directionalLight.color.set(color);
      this.directionalLight.intensity = Math.max(1.0, intensity * 1.15);
    }
    if (this.materials) {
      updateFacadeShaderLights(
        [
          this.materials.apartmentShaderMaterial,
          this.materials.commercialShaderMaterial,
          this.materials.neighborhoodShaderMaterial,
          this.materials.landmarkShaderMaterial,
        ],
        vector,
        color,
        intensity
      );
    }
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    try {
      this.map = map;
      const center = map.getCenter();
      this.originLngLat = [center.lng, center.lat];

      // 1. [검은색 벽면 방지 3점 조명 시스템]
      this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.2);
      this.directionalLight.position.set(120, 180, 100).normalize();
      this.directionalLight.castShadow = false;
      this.scene.add(this.directionalLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 0.85);
      this.scene.add(this.hemisphereLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(this.ambientLight);

      this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
      this.fillLight.position.set(-80, 100, 80).normalize();
      this.scene.add(this.fillLight);

      // [스카이라인 대기 안개 연동 (Atmospheric Horizon Fog #cbd5e1)]
      this.scene.fog = new THREE.Fog(0xcbd5e1, 1500, 7500);

      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
          alpha: true,
        });
        this.renderer.autoClear = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = false;
      } catch (err) {
        console.warn('[LOD2BuildingEngine] WebGLRenderer setup notice:', err);
      }
    } catch (onAddErr) {
      console.warn('[LOD2BuildingEngine] onAdd exception caught:', onAddErr);
    }
  }

  /**
   * 한국형 실사 아틀라스 기반 지능형 3D 건물 일괄 생성 및 단일 Draw Call 병합
   */
  public updateBuildings(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    newOriginLngLat?: [number, number]
  ): void {
    if (!features || features.length === 0) {
      this.clearMeshes();
      this.buildingCount = 0;
      this.lastFeatures = [];
      return;
    }

    this.lastFeatures = features;

    if (newOriginLngLat) {
      this.originLngLat = newOriginLngLat;
    } else if (this.map) {
      const c = this.map.getCenter();
      this.originLngLat = [c.lng, c.lat];
    }

    if (this.map) {
      const queried = elevationCache.getFromMap(this.map, this.originLngLat);
      if (Number.isFinite(queried)) {
        this.clampedAltitude = queried;
      }
    }

    this.clearMeshes();

    if (!this.masterAtlasMaterial) {
      this.masterAtlasMaterial = getKoreanCityAtlasMaterial();
    }
    if (!this.materials) {
      this.initMaterials();
    }

    console.log('[LOD2BuildingEngine] updateBuildings START: features count =', features.length, 'origin =', this.originLngLat);

    // 마스터 아틀라스 버텍스 배열 (단일 BufferGeometry로 병합)
    const masterPositions: number[] = [];
    const masterNormals: number[] = [];
    const masterUvs: number[] = [];

    // 헬리패드 보조 버퍼
    const helipadBaseGeometries: THREE.BufferGeometry[] = [];
    const helipadRingGeometries: THREE.BufferGeometry[] = [];
    const helipadMarkGeometries: THREE.BufferGeometry[] = [];

    // 인스턴싱 설비 버퍼
    const waterTankMatrices: THREE.Matrix4[] = [];
    const ventMatrices: THREE.Matrix4[] = [];
    const solarMatrices: THREE.Matrix4[] = [];

    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();
    const tempMat = new THREE.Matrix4();
    const tempEuler = new THREE.Euler();

    let count = 0;

    for (const feat of features) {
      if (!feat.geometry) continue;

      const props = feat.properties || {};
      const name = String(props.name || props.name_ko || '');
      const usageType = String(
        props.usageType || props.bld_category || props.type || props.class || ''
      ).toLowerCase();

      const explicitH = Number(
        props.height ||
        props.render_height ||
        (props.levels ? props.levels * 3.0 : 0) ||
        (props['building:levels'] ? Number(props['building:levels']) * 3.0 : 0) ||
        0
      );

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

        const obb = computeOBB(pts);
        const approxArea = Math.max(10, obb.lenU * obb.lenV);
        const aspectRatio = obb.lenU / Math.max(1.0, obb.lenV);

        // [3단계 신규] 높이 값이 없는 저층 건물 2~4층(7m~14m) 자동 복원 및 아파트 단지 15~25층(45m~75m) 스카이라인 적용
        let totalH = explicitH;
        const isApt = name.includes('아파트') || usageType.includes('apartment') || (aspectRatio >= 1.6 && approxArea >= 350);
        const isComm = name.includes('타워') || name.includes('빌딩') || name.includes('센터') || usageType.includes('commercial') || usageType.includes('office') || approxArea >= 600;

        if (!totalH || totalH <= 0 || (totalH === 12 && !props.height && !props.levels && !props['building:levels'] && !props.gro_flo_co)) {
          if (isApt) {
            // 판상형/타워형 아파트 단지 구역: 15층~25층 (45m~75m)
            const seed = Math.abs(Math.sin(obb.centroid.x * 12.9898 + obb.centroid.y * 78.233)) % 1;
            const aptStories = Math.round(15 + seed * 10);
            totalH = aptStories * 3.0; // 45m ~ 75m
          } else if (isComm) {
            // 대로변 상업/업무 빌딩: 4층~8층 (15m~28m)
            const seed = Math.abs(Math.sin(obb.centroid.x * 37.11 + obb.centroid.y * 53.77)) % 1;
            const commStories = Math.round(4 + seed * 4);
            totalH = commStories * 3.5; // 14m ~ 28m
          } else {
            // 일반 주택 및 군 막사: 1층~3층 (4m~10m)
            if (approxArea < 120) {
              totalH = 4.0; // 1층 (4m)
            } else if (approxArea < 240) {
              totalH = 7.0; // 2층 (7m)
            } else {
              totalH = 10.0; // 3층 (10m)
            }
          }
        }

        // 지형 표고 정합 (중심점 1회 해시 캐시 조회 후 clampedAltitude 기준 상대고도 산출)
        const elev = elevationCache.getElevationForPolygonFromMap(this.map, ring);
        const relElev = elev - this.clampedAltitude;
        const wallTop = relElev + totalH;

        // [2단계 & 3단계: 건물 형태·높이·면적 기반 지능형 재질 자동 매핑]
        const cls = classifyBuilding(pts, totalH, {
          ...props,
          usageType: isApt ? 'apartment' : usageType,
        });

        // Bounding Box (지붕 UV 매핑용)
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const rangeX = Math.max(0.1, maxX - minX);
        const rangeY = Math.max(0.1, maxY - minY);

        // 1. [외벽 (Wall) 지오메트리 & 아틀라스 UV 매핑]
        const N = pts.length;
        const wallBaseY = relElev - 2.5; // 경사지 및 기단부 밀착용 2.5m 지하 매립 기초
        const totalWallH = wallTop - wallBaseY;

        for (let i = 0; i < N; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % N];
          const dx = p1.x - p0.x;
          const dz = p1.y - p0.y;
          const segLen = Math.sqrt(dx * dx + dz * dz);
          if (segLen < 0.05) continue;

          const nx = -dz / segLen;
          const nz = dx / segLen;

          if (cls.category === 'apartment') {
            // 아파트 측벽 판별: OBB 단축(dirV)과의 방향 일치율 > 0.65
            const isNarrowSide = Math.abs(dx * obb.dirV.x + dz * obb.dirV.y) / segLen > 0.65;

            if (isNarrowSide) {
              // (1) 한국형 아파트 측벽: 전체 측벽을 1회 매핑하여 동 번호 '101'과 포인트 도색 밴드 상단 표출
              const sideUV = getAtlasSlotUV('apartment_side');
              addQuad(
                masterPositions, masterNormals, masterUvs,
                { x: p0.x, y: wallBaseY, z: p0.y },
                { x: p1.x, y: wallBaseY, z: p1.y },
                { x: p1.x, y: wallTop, z: p1.y },
                { x: p0.x, y: wallTop, z: p0.y },
                nx, 0, nz,
                { u: sideUV.u0, v: sideUV.v0 },
                { u: sideUV.u1, v: sideUV.v0 },
                { u: sideUV.u1, v: sideUV.v1 },
                { u: sideUV.u0, v: sideUV.v1 }
              );
            } else {
              // (2) 한국형 아파트 전/후면: 세대별 베란다 창문 격자 및 실외기 루버 (가로 6m x 2개층 6m 타일링)
              const frontUV = getAtlasSlotUV('apartment_front');
              const nBays = Math.max(1, Math.round(segLen / 6.0));
              const nStories = Math.max(1, Math.round(totalWallH / 6.0));

              for (let b = 0; b < nBays; b++) {
                const t0 = b / nBays;
                const t1 = (b + 1) / nBays;
                const bx0 = p0.x + dx * t0;
                const bz0 = p0.y + dz * t0;
                const bx1 = p0.x + dx * t1;
                const bz1 = p0.y + dz * t1;

                for (let s = 0; s < nStories; s++) {
                  const y0 = wallBaseY + (totalWallH * s) / nStories;
                  const y1 = wallBaseY + (totalWallH * (s + 1)) / nStories;

                  addQuad(
                    masterPositions, masterNormals, masterUvs,
                    { x: bx0, y: y0, z: bz0 },
                    { x: bx1, y: y0, z: bz1 },
                    { x: bx1, y: y1, z: bz1 },
                    { x: bx0, y: y1, z: bz0 },
                    nx, 0, nz,
                    { u: frontUV.u0, v: frontUV.v0 },
                    { u: frontUV.u1, v: frontUV.v0 },
                    { u: frontUV.u1, v: frontUV.v1 },
                    { u: frontUV.u0, v: frontUV.v1 }
                  );
                }
              }
            }
          } else {
            // (3) 상업/오피스, 커튼월 타워, 다세대 빌라, 공공청사
            const wallUV = getAtlasSlotUV(cls.wallFrontSlot);
            const modW = cls.category === 'villa' ? 4.5 : 6.0;
            const modH = cls.category === 'villa' ? 3.0 : 6.0;
            const nBays = Math.max(1, Math.round(segLen / modW));
            const nStories = Math.max(1, Math.round(totalWallH / modH));

            for (let b = 0; b < nBays; b++) {
              const t0 = b / nBays;
              const t1 = (b + 1) / nBays;
              const bx0 = p0.x + dx * t0;
              const bz0 = p0.y + dz * t0;
              const bx1 = p0.x + dx * t1;
              const bz1 = p0.y + dz * t1;

              for (let s = 0; s < nStories; s++) {
                const y0 = wallBaseY + (totalWallH * s) / nStories;
                const y1 = wallBaseY + (totalWallH * (s + 1)) / nStories;

                addQuad(
                  masterPositions, masterNormals, masterUvs,
                  { x: bx0, y: y0, z: bz0 },
                  { x: bx1, y: y0, z: bz1 },
                  { x: bx1, y: y1, z: bz1 },
                  { x: bx0, y: y1, z: bz0 },
                  nx, 0, nz,
                  { u: wallUV.u0, v: wallUV.v0 },
                  { u: wallUV.u1, v: wallUV.v0 },
                  { u: wallUV.u1, v: wallUV.v1 },
                  { u: wallUV.u0, v: wallUV.v1 }
                );
              }
            }
          }
        }

        // 2. [지붕 (Roof) 지오메트리 & 아틀라스 UV 매핑]
        if (cls.isPitchedRoof) {
          // (a) 입체 박공 지붕 (Gabled Roof - 적갈색 슁글 또는 청색 징크)
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

          const roofUV = getAtlasSlotUV(cls.roofSlot);

          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];

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

            // 경사면 법선 벡터
            const vA = new THREE.Vector3(p0.x, wallTop, p0.y);
            const vB = new THREE.Vector3(p1.x, wallTop, p1.y);
            const vC = new THREE.Vector3(proj1.x, ridgeTop, proj1.y);
            const cb = new THREE.Vector3().subVectors(vC, vB);
            const ab = new THREE.Vector3().subVectors(vA, vB);
            const fn = new THREE.Vector3().crossVectors(cb, ab).normalize();
            if (fn.y < 0) fn.negate();

            const u0 = roofUV.u0 + ((p0.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
            const v0 = roofUV.v0 + ((p0.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);
            const u1 = roofUV.u0 + ((p1.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
            const v1 = roofUV.v0 + ((p1.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);
            const up0 = roofUV.u0 + ((proj0.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
            const vp0 = roofUV.v0 + ((proj0.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);
            const up1 = roofUV.u0 + ((proj1.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
            const vp1 = roofUV.v0 + ((proj1.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);

            addQuad(
              masterPositions, masterNormals, masterUvs,
              { x: p0.x, y: wallTop, z: p0.y },
              { x: p1.x, y: wallTop, z: p1.y },
              { x: proj1.x, y: ridgeTop, z: proj1.y },
              { x: proj0.x, y: ridgeTop, z: proj0.y },
              fn.x, fn.y, fn.z,
              { u: u0, v: v0 },
              { u: u1, v: v1 },
              { u: up1, v: vp1 },
              { u: up0, v: vp0 }
            );
          }

          // 전/후면 박공벽 삼각형
          const uA = roofUV.u0 + ((rP0.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
          const vA = roofUV.v0 + ((rP0.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);
          const uB = roofUV.u0 + ((rP1.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
          const vB = roofUV.v0 + ((rP1.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);
          const uC = roofUV.u0 + ((obb.centroid.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
          const vC = roofUV.v0 + ((obb.centroid.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);

          masterPositions.push(
            rP0.x, ridgeTop, rP0.y,
            rP1.x, ridgeTop, rP1.y,
            obb.centroid.x, wallTop, obb.centroid.y
          );
          masterNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
          masterUvs.push(uA, vA, uB, vB, uC, vC);

        } else {
          // (b) 한국형 평지붕 (초록색 우레탄 방수 옥상 #15803d, 오피스 쿨루프 #475569 등)
          const roofTriangles = triangulatePolygon2D(pts);
          if (roofTriangles.length > 0) {
            const roofUV = getAtlasSlotUV(cls.roofSlot);
            for (const idx of roofTriangles) {
              const p = pts[idx];
              const u = roofUV.u0 + ((p.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
              const v = roofUV.v0 + ((p.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);

              masterPositions.push(p.x, wallTop, p.y);
              masterNormals.push(0, 1, 0);
              masterUvs.push(u, v);
            }
          }

          // 3. [1.0m 콘크리트 난간(Parapet) 3면 입체 모델링]
          // 초록색 우레탄 바닥이 1.0m 깊이로 쏙 들어가 보이도록 외벽·코핑·내벽 3면 생성
          if (cls.hasParapet) {
            const parapetUV = getAtlasSlotUV('parapet_concrete');
            const pH = cls.parapetHeight || 1.0;
            const pThick = 0.35;

            for (let i = 0; i < N; i++) {
              const p0 = pts[i];
              const p1 = pts[(i + 1) % N];
              const dx = p1.x - p0.x;
              const dz = p1.y - p0.y;
              const segLen = Math.sqrt(dx * dx + dz * dz);
              if (segLen < 0.1) continue;

              const nx = -dz / segLen;
              const nz = dx / segLen;

              // 안쪽 내벽 오프셋 좌표 (0.35m 내측)
              const p0i_x = p0.x - nx * pThick;
              const p0i_z = p0.y - nz * pThick;
              const p1i_x = p1.x - nx * pThick;
              const p1i_z = p1.y - nz * pThick;

              // 1) 난간 외벽면 (높이 1.0m)
              addQuad(
                masterPositions, masterNormals, masterUvs,
                { x: p0.x, y: wallTop, z: p0.y },
                { x: p1.x, y: wallTop, z: p1.y },
                { x: p1.x, y: wallTop + pH, z: p1.y },
                { x: p0.x, y: wallTop + pH, z: p0.y },
                nx, 0, nz,
                { u: parapetUV.u0, v: parapetUV.v0 },
                { u: parapetUV.u1, v: parapetUV.v0 },
                { u: parapetUV.u1, v: parapetUV.v1 },
                { u: parapetUV.u0, v: parapetUV.v1 }
              );

              // 2) 난간 상단 코핑 (두께 0.35m 수평 마감)
              addQuad(
                masterPositions, masterNormals, masterUvs,
                { x: p0.x, y: wallTop + pH, z: p0.y },
                { x: p0i_x, y: wallTop + pH, z: p0i_z },
                { x: p1i_x, y: wallTop + pH, z: p1i_z },
                { x: p1.x, y: wallTop + pH, z: p1.y },
                0, 1, 0,
                { u: parapetUV.u0, v: parapetUV.v0 },
                { u: parapetUV.u0, v: parapetUV.v1 },
                { u: parapetUV.u1, v: parapetUV.v1 },
                { u: parapetUV.u1, v: parapetUV.v0 }
              );

              // 3) 난간 안쪽 내벽 (상단 코핑에서 우레탄 옥상 바닥으로 1.0m 내려가는 벽)
              addQuad(
                masterPositions, masterNormals, masterUvs,
                { x: p1i_x, y: wallTop, z: p1i_z },
                { x: p0i_x, y: wallTop, z: p0i_z },
                { x: p0i_x, y: wallTop + pH, z: p0i_z },
                { x: p1i_x, y: wallTop + pH, z: p1i_z },
                -nx, 0, -nz,
                { u: parapetUV.u0, v: parapetUV.v0 },
                { u: parapetUV.u1, v: parapetUV.v0 },
                { u: parapetUV.u1, v: parapetUV.v1 },
                { u: parapetUV.u0, v: parapetUV.v1 }
              );
            }
          }

          // 4. [엘리베이터 권상기실(Penthouse) 큐브 & 콘크리트/철문 텍스처]
          if (cls.hasPenthouse) {
            const pentUV = getAtlasSlotUV('penthouse_wall');
            const coolRoofUV = getAtlasSlotUV('roof_concrete_cool');
            const coreW = Math.max(3.8, Math.min(obb.lenU * 0.22, 10.0));
            const coreD = Math.max(3.8, Math.min(obb.lenV * 0.22, 8.0));
            const coreH = 3.2;

            const hw = coreW * 0.5;
            const hd = coreD * 0.5;
            const cx = obb.obbCenter.x;
            const cz = obb.obbCenter.y;
            const u = obb.dirU;
            const v = obb.dirV;

            const c0 = { x: cx - u.x * hw - v.x * hd, z: cz - u.y * hw - v.y * hd };
            const c1 = { x: cx + u.x * hw - v.x * hd, z: cz + u.y * hw - v.y * hd };
            const c2 = { x: cx + u.x * hw + v.x * hd, z: cz + u.y * hw + v.y * hd };
            const c3 = { x: cx - u.x * hw + v.x * hd, z: cz - u.y * hw + v.y * hd };
            const corners = [c0, c1, c2, c3];

            // 4면 기계실 벽체 (철문 및 환기 루버 포함)
            for (let k = 0; k < 4; k++) {
              const ca = corners[k];
              const cb = corners[(k + 1) % 4];
              const cdx = cb.x - ca.x;
              const cdz = cb.z - ca.z;
              const clen = Math.sqrt(cdx * cdx + cdz * cdz);
              const cnx = cdz / clen;
              const cnz = -cdx / clen;

              addQuad(
                masterPositions, masterNormals, masterUvs,
                { x: ca.x, y: wallTop, z: ca.z },
                { x: cb.x, y: wallTop, z: cb.z },
                { x: cb.x, y: wallTop + coreH, z: cb.z },
                { x: ca.x, y: wallTop + coreH, z: ca.z },
                cnx, 0, cnz,
                { u: pentUV.u0, v: pentUV.v0 },
                { u: pentUV.u1, v: pentUV.v0 },
                { u: pentUV.u1, v: pentUV.v1 },
                { u: pentUV.u0, v: pentUV.v1 }
              );
            }

            // 기계실 옥탑 슬래브
            addQuad(
              masterPositions, masterNormals, masterUvs,
              { x: c0.x, y: wallTop + coreH, z: c0.z },
              { x: c1.x, y: wallTop + coreH, z: c1.z },
              { x: c2.x, y: wallTop + coreH, z: c2.z },
              { x: c3.x, y: wallTop + coreH, z: c3.z },
              0, 1, 0,
              { u: coolRoofUV.u0, v: coolRoofUV.v0 },
              { u: coolRoofUV.u1, v: coolRoofUV.v0 },
              { u: coolRoofUV.u1, v: coolRoofUV.v1 },
              { u: coolRoofUV.u0, v: coolRoofUV.v1 }
            );
          }

          // 5. [아파트 부속 설비 인스턴싱: STS 원통 물탱크 & 환기 벤트]
          if (cls.category === 'apartment') {
            const coreW = Math.max(3.8, Math.min(obb.lenU * 0.22, 10.0));
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

            // 옥상 벤트 4기
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

          // 6. [랜드마크 타워 옥상 헬리패드 & 태양광 패널]
          if (cls.category === 'curtainwall' && totalH >= 35.0) {
            const helipadRadius = Math.max(5.0, Math.min(11.0, Math.min(obb.lenU, obb.lenV) * 0.35));
            const padDeckH = 0.45;
            const padTop = wallTop + padDeckH;

            const padGeo = new THREE.CylinderGeometry(helipadRadius, helipadRadius, padDeckH, 24);
            padGeo.translate(obb.obbCenter.x, wallTop + padDeckH / 2, obb.obbCenter.y);
            helipadBaseGeometries.push(padGeo);

            const ringGeo = new THREE.RingGeometry(helipadRadius * 0.78, helipadRadius * 0.90, 32);
            ringGeo.rotateX(-Math.PI / 2);
            ringGeo.translate(obb.obbCenter.x, padTop + 0.05, obb.obbCenter.y);
            helipadRingGeometries.push(ringGeo);

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

            // 남향 태양광 패널 그리드
            if (obb.lenU >= 16.0 && obb.lenV >= 14.0) {
              const panelCols = Math.max(2, Math.min(4, Math.floor(obb.lenU / 6.0)));
              const panelRows = 2;
              const spacingX = 2.8;
              const spacingZ = 2.0;

              const solarCenterX = obb.obbCenter.x - obb.dirU.x * (obb.lenU * 0.28);
              const solarCenterZ = obb.obbCenter.y - obb.dirU.y * (obb.lenU * 0.28);

              tempEuler.set(-15 * (Math.PI / 180), 0, 0, 'YXZ');
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

    // [1단계: 가상 더미 박스 삭제 및 전역 실제 건물 폴리곤 동기화]
    // 실제 GIS 데이터(건물 외곽선 폴리곤)에 기반하지 않은 임의의 사각 박스 생성을 완전히 배제하고,
    // 오직 실제 GeoJSON 폴리곤 피처들만 렌더링합니다.
    this.buildingCount = count;

    console.log('[LOD2BuildingEngine] masterPositions count =', masterPositions.length, 'buildingCount =', count);

    // 8. [단일 마스터 메쉬 생성 (BufferGeometry) -> 단 1회의 Draw Call로 도시 전체 렌더링]
    if (masterPositions.length > 0) {
      const masterGeo = new THREE.BufferGeometry();
      masterGeo.setAttribute('position', new THREE.Float32BufferAttribute(masterPositions, 3));
      masterGeo.setAttribute('normal', new THREE.Float32BufferAttribute(masterNormals, 3));
      masterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(masterUvs, 2));
      masterGeo.computeBoundingSphere();

      if (!this.masterAtlasMaterial) {
        this.masterAtlasMaterial = getKoreanCityAtlasMaterial();
      }

      if (this.masterAtlasMaterial) {
        this.masterCityMesh = new THREE.Mesh(masterGeo, this.masterAtlasMaterial);
        this.masterCityMesh.castShadow = true;
        this.masterCityMesh.receiveShadow = true;
        this.masterCityMesh.frustumCulled = true;
        this.scene.add(this.masterCityMesh);
        console.log('[LOD2BuildingEngine] masterCityMesh successfully created and added to scene! Vertices =', masterPositions.length / 3);
      } else {
        console.warn('[LOD2BuildingEngine] masterAtlasMaterial is NULL!');
      }
    } else {
      console.warn('[LOD2BuildingEngine] masterPositions is EMPTY!');
    }

    const safeMerge = (geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
      if (geoms.length === 0) return null;
      try {
        const nonIndexed = geoms.map(g => (g.index ? g.toNonIndexed() : g));
        return BufferGeometryUtils.mergeGeometries(nonIndexed, false);
      } catch (e) {
        console.warn('[LOD2BuildingEngine] safeMerge error:', e);
        return null;
      }
    };

    // 헬리패드 보조 메쉬
    if (helipadBaseGeometries.length > 0 && this.materials?.helipadGreenBaseMaterial) {
      const merged = safeMerge(helipadBaseGeometries);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadBaseMesh = new THREE.Mesh(merged, this.materials.helipadGreenBaseMaterial);
        this.helipadBaseMesh.frustumCulled = true;
        this.scene.add(this.helipadBaseMesh);
      }
    }
    if (helipadRingGeometries.length > 0 && this.materials?.helipadYellowRingMaterial) {
      const merged = safeMerge(helipadRingGeometries);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadRingMesh = new THREE.Mesh(merged, this.materials.helipadYellowRingMaterial);
        this.helipadRingMesh.frustumCulled = true;
        this.scene.add(this.helipadRingMesh);
      }
    }
    if (helipadMarkGeometries.length > 0 && this.materials?.helipadWhiteMarkMaterial) {
      const merged = safeMerge(helipadMarkGeometries);
      if (merged) {
        merged.computeBoundingSphere();
        this.helipadMarkMesh = new THREE.Mesh(merged, this.materials.helipadWhiteMarkMaterial);
        this.helipadMarkMesh.frustumCulled = true;
        this.scene.add(this.helipadMarkMesh);
      }
    }

    // 아파트 옥상 STS 원통형 물탱크
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
      this.waterTankInstancedMesh.frustumCulled = true;
      this.scene.add(this.waterTankInstancedMesh);
    }

    // 옥상 환기 벤트
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
      this.ventInstancedMesh.frustumCulled = true;
      this.scene.add(this.ventInstancedMesh);
    }

    // 사각 태양광 패널 그리드
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
      this.solarPanelInstancedMesh.frustumCulled = true;
      this.scene.add(this.solarPanelInstancedMesh);
    }

    if (this.map) {
      this.updateZoomLOD(this.map.getZoom());
      this.map.triggerRepaint();
    }
  }

  /**
   * MapLibre 커스텀 레이어 렌더링 루프
   */
  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer) {
      return;
    }

    if (gl && typeof (gl as any).isContextLost === 'function' && (gl as any).isContextLost()) {
      this.setVisible(false);
      if (this.onErrorCallback) {
        this.onErrorCallback(new Error('WebGL context lost'));
      }
      return;
    }

    // 줌 13 미만 광역 뷰에서는 렌더링 스킵 (줌 13부터 도심 건물 100% 고밀도 표출)
    if (this.map) {
      const zoom = this.map.getZoom();
      if (zoom < 13.0) {
        return;
      }
    }

    try {
      const rawMatrix =
        options?.defaultProjectionData?.mainMatrix ||
        options?.modelViewProjectionMatrix ||
        options;
      if (!rawMatrix) return;

      // DEM 표고 실시간 적응 (초기 로드 후 DEM 타일 수신 시 자동 재스냅)
      if (this.map) {
        const queried = elevationCache.getFromMap(this.map, this.originLngLat);
        if (Number.isFinite(queried)) {
          if (this.clampedAltitude === 0 && queried > 5.0) {
            this.clampedAltitude = queried;
            if (this.lastFeatures && this.lastFeatures.length > 0) {
              this.updateBuildings(this.lastFeatures, this.originLngLat);
              return;
            }
          }
        }
      }

      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        this.clampedAltitude
      );
      const meterScale = mercator.meterInMercatorCoordinateUnits();

      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);

      const prevFbo = gl ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      }
      this.consecutiveErrors = 0;
    } catch (renderErr) {
      console.warn('[LOD2BuildingEngine] render warning:', renderErr);
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= 3) {
        this.setVisible(false);
        if (this.onErrorCallback) {
          this.onErrorCallback(renderErr);
        }
      }
    }
  }

  /**
   * 메쉬 제거 및 지오메트리 GPU 메모리 해제
   */
  private clearMeshes(): void {
    if (this.masterCityMesh) {
      this.scene.remove(this.masterCityMesh);
      if (this.masterCityMesh.geometry) {
        this.masterCityMesh.geometry.dispose();
      }
      this.masterCityMesh = null;
    }

    const extraMeshes = [
      this.helipadBaseMesh,
      this.helipadRingMesh,
      this.helipadMarkMesh,
    ];
    for (const mesh of extraMeshes) {
      if (mesh) {
        this.scene.remove(mesh);
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
      }
    }
    this.helipadBaseMesh = null;
    this.helipadRingMesh = null;
    this.helipadMarkMesh = null;

    // 인스턴싱 메쉬 해제
    const instanced = [
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
    this.waterTankInstancedMesh = null;
    this.ventInstancedMesh = null;
    this.solarPanelInstancedMesh = null;
  }

  /**
   * 레이어 해제 및 전체 GPU 메모리 완전 반환
   */
  onRemove(): void {
    this.clearMeshes();

    disposeKoreanCityAtlas();
    disposeKoreanBuildingMaterials();
    this.materials = null;
    this.masterAtlasMaterial = null;

    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      this.directionalLight.dispose();
      this.directionalLight = null;
    }
    if (this.hemisphereLight) {
      this.scene.remove(this.hemisphereLight);
      this.hemisphereLight.dispose();
      this.hemisphereLight = null;
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
