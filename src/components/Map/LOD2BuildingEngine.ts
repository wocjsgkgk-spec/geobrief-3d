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
  classifyBuilding,
  AtlasSlot,
} from '@/utils/koreanCityAtlas';
import { buildingMeshWorkerClient, OSMGeometryResult } from '@/workers/buildingMeshWorkerClient';
import { geometryWorkerClient, BuildBuildingsResult } from '@/workers/geometryWorkerClient';
import { createRealisticCityMaterial } from '@/shaders/realisticCityShader';
import { createStreetsGlBuildingMaterial } from '@/lib/vendor/streetsGlBuildingShader';
import {
  getVWorldAtlasTexture,
  getVWorldAtlasSlotUV,
  VWORLD_SLOT_NAME_TO_ID,
  disposeVWorldAtlas,
} from '@/utils/vworldStyleAtlas';
import { buildOsmBuildingGeometry } from '@/lib/vendor/osmGeometryBuilder';

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

/**
 * 2D 점이 다각형 내부에 완전히 포함되는지 검사 (Ray-casting Algorithm)
 */
function isPointInPolygon2D(x: number, y: number, pts: THREE.Vector2[]): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * THREE.ShapeUtils.triangulateShape (표준 Earcut 알고리즘) 기반
 * ㄱ자, ㄷ자, 요(凹)철형 및 복합 다각형을 1mm 오차 없이 정밀 삼각화
 */
function triangulatePolygon2D(pts: THREE.Vector2[]): number[] {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  try {
    const faces = THREE.ShapeUtils.triangulateShape(pts, []);
    const indices: number[] = [];
    for (const f of faces) {
      indices.push(f[0], f[1], f[2]);
    }
    if (indices.length > 0) {
      return indices;
    }
  } catch (e) {
    // 폴백
  }

  // 폴백 단순 삼각화
  const fallbackIndices: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    fallbackIndices.push(0, i, i + 1);
  }
  return fallbackIndices;
}

/**
 * 4개 정점으로 이루어진 사각 평면(Quad)을 2개 삼각형으로 변환하여 버퍼에 추가합니다.
 */
function addQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
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
  uv3: { u: number; v: number }, // TL UV
  r = 0.98,
  g = 0.98,
  b = 0.99
): void {
  // Triangle 1: p0 -> p1 -> p2
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  // Triangle 2: p0 -> p2 -> p3
  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);

  for (let k = 0; k < 6; k++) {
    normals.push(nx, ny, nz);
    colors.push(r, g, b);
  }

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);
}

/**
 * 지면 접지 그림자 및 실시간 태양광 투영 그림자 쿼드를 RGBA 버텍스 컬러와 함께 버퍼에 추가합니다.
 */
function addShadowQuad(
  positions: number[],
  colors: number[],
  p0: { x: number; y: number; z: number; a: number },
  p1: { x: number; y: number; z: number; a: number },
  p2: { x: number; y: number; z: number; a: number },
  p3: { x: number; y: number; z: number; a: number },
  r = 0.008,
  g = 0.024,
  b = 0.09
): void {
  // Triangle 1: p0 -> p1 -> p2
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  colors.push(r, g, b, p0.a, r, g, b, p1.a, r, g, b, p2.a);

  // Triangle 2: p0 -> p2 -> p3
  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  colors.push(r, g, b, p0.a, r, g, b, p2.a, r, g, b, p3.a);
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
  private realisticCityMaterial: THREE.ShaderMaterial | null = null;
  private threeDemTexture: THREE.DataTexture | null = null;

  // [단일 배칭 최적화] 랜드마크 옥상 헬리패드 통합 단일 메쉬 (정점 컬러 베이스 + 링 + 백색 H 단일 Draw Call)
  private helipadUnifiedMesh: THREE.Mesh | null = null;
  private helipadUnifiedMaterial: THREE.MeshStandardMaterial | null = null;

  // 인스턴싱 메쉬 (아파트 옥상 STS 물탱크, 벤트, 태양광 패널, HVAC 냉각탑)
  private waterTankInstancedMesh: THREE.InstancedMesh | null = null;
  private ventInstancedMesh: THREE.InstancedMesh | null = null;
  private solarPanelInstancedMesh: THREE.InstancedMesh | null = null;
  private hvacInstancedMesh: THREE.InstancedMesh | null = null;

  // [신규] 지면 접지 그림자 및 실시간 태양광 투영 그림자 메쉬
  private contactShadowMesh: THREE.Mesh | null = null;
  private contactShadowMaterial: THREE.ShaderMaterial | null = null;
  private sunLightDirection: THREE.Vector3 = new THREE.Vector3(0.65, 0.75, 0.45).normalize();

  private static unitWaterTankGeo: THREE.CylinderGeometry | null = null;
  private static unitVentGeo: THREE.CylinderGeometry | null = null;
  private static unitSolarGeo: THREE.BoxGeometry | null = null;
  private static unitHvacGeo: THREE.BoxGeometry | null = null;

  // 폴백용 재질 참조
  private materials: KoreanBuildingMaterials | null = null;

  private originLngLat: [number, number] = [127.9358, 37.3592]; // 원주 기준
  private clampedAltitude = 0;
  private lastFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private isVisible = true;
  private buildingCount = 0;
  private currentZoomLOD = 16;
  private opacity = 1.0;
  private sseQuality = 16;
  private styleMode: 'photorealistic' | 'clean_mass' = 'photorealistic';

  // [3단계: 타일/피처 단위 청크 메쉬 캐시 (60fps 무중단 화면 유지)]
  private chunkMeshCache = new Map<string, OSMGeometryResult>();
  private readonly MAX_CHUNK_CACHE_ENTRIES = 64;

  /**
   * 지도 이동/회전 시 0ms 즉각 재사용을 위한 청크 고유 해시 키 계산
   */
  private computeChunkKey(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    origin: [number, number],
    zoom: number
  ): string {
    const len = features.length;
    if (len === 0) return 'empty';
    const firstId = String(features[0]?.id || features[0]?.properties?.name || '0');
    const midIdx = Math.floor(len / 2);
    const midId = String(features[midIdx]?.id || features[midIdx]?.properties?.name || 'mid');
    const lastId = String(features[len - 1]?.id || features[len - 1]?.properties?.name || 'end');
    const rx = Math.round(origin[0] * 200) / 200; // ~500m 타일 그리드
    const ry = Math.round(origin[1] * 200) / 200;
    const lod = zoom < 13.5 ? 0 : zoom < 15.2 ? 1 : 2;
    return `${rx}_${ry}_cnt${len}_${firstId}_${midId}_${lastId}_lod${lod}`;
  }

  public clearChunkCache(): void {
    this.chunkMeshCache.clear();
  }

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

      LOD2BuildingEngine.unitHvacGeo = new THREE.BoxGeometry(2.6, 1.6, 1.8);
      LOD2BuildingEngine.unitHvacGeo.translate(0, 0.8, 0);
    }
  }

  private initMaterials(): void {
    this.materials = getKoreanBuildingMaterials();
    this.masterAtlasMaterial = getKoreanCityAtlasMaterial();
    const isPhotorealistic = this.styleMode === 'photorealistic';
    const vworldTex = getVWorldAtlasTexture();
    if (!this.realisticCityMaterial) {
      this.realisticCityMaterial = createStreetsGlBuildingMaterial({
        sunDirection: this.sunLightDirection,
        atlasTexture: vworldTex,
        useAtlasTexture: isPhotorealistic && !!vworldTex,
        opacity: this.opacity,
      });
    } else if (this.realisticCityMaterial.uniforms) {
      if (vworldTex && this.realisticCityMaterial.uniforms.uAtlasTexture) {
        this.realisticCityMaterial.uniforms.uAtlasTexture.value = vworldTex;
      }
      if (this.realisticCityMaterial.uniforms.uUseAtlasTexture) {
        this.realisticCityMaterial.uniforms.uUseAtlasTexture.value = isPhotorealistic;
      }
      if (this.realisticCityMaterial.uniforms.uOpacity) {
        this.realisticCityMaterial.uniforms.uOpacity.value = this.opacity;
      }
      this.realisticCityMaterial.transparent = this.opacity < 0.99;
      this.realisticCityMaterial.needsUpdate = true;
    }
    if (!this.contactShadowMaterial) {
      this.contactShadowMaterial = new THREE.ShaderMaterial({
        vertexShader: `
          attribute vec4 color;
          varying vec4 vColor;
          void main() {
            vColor = color;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec4 vColor;
          void main() {
            gl_FragColor = vColor;
          }
        `,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
        side: THREE.DoubleSide,
      });
    }
  }

  /**
   * [3단계: GPU Terrain Clamping] DEM 표고 데이터텍스처 갱신 및 셰이더 바인딩
   */
  public updateDemTexture(bounds: [number, number, number, number]): void {
    if (!this.map || !this.realisticCityMaterial) return;
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const size = 64;
    const data = new Uint8Array(size * size * 4);

    const dLng = (maxLng - minLng) / Math.max(1, size - 1);
    const dLat = (maxLat - minLat) / Math.max(1, size - 1);

    for (let y = 0; y < size; y++) {
      const lat = minLat + y * dLat;
      for (let x = 0; x < size; x++) {
        const lng = minLng + x * dLng;
        const elev = Math.max(0, this.map.queryTerrainElevation ? (this.map.queryTerrainElevation([lng, lat]) || 0) : 0);
        const val = Math.max(0, Math.min(65535, elev + 32768));
        const r = Math.floor(val / 256);
        const g = Math.floor(val % 256);
        const b = Math.floor((val - Math.floor(val)) * 256);

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    if (this.threeDemTexture) {
      this.threeDemTexture.dispose();
    }
    this.threeDemTexture = texture;

    const exaggeration = (this.map as any)?.painter?.terrain?.exaggeration || 1.0;

    this.realisticCityMaterial.uniforms.uDemTexture.value = this.threeDemTexture;
    this.realisticCityMaterial.uniforms.uUseDemTexture.value = true;
    this.realisticCityMaterial.uniforms.uDemExaggeration.value = exaggeration;
    this.realisticCityMaterial.needsUpdate = true;
  }

  private isInteracting = false;
  private pendingFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] | null = null;
  private pendingOriginLngLat?: [number, number];

  public setInteracting(interacting: boolean): void {
    this.isInteracting = interacting;
    if (!interacting && this.pendingFeatures) {
      const feats = this.pendingFeatures;
      const origin = this.pendingOriginLngLat;
      this.pendingFeatures = null;
      this.pendingOriginLngLat = undefined;
      this.updateBuildings(feats, origin);
    }
  }

  public setPixelRatio(ratio: number): void {
    if (this.renderer) {
      this.renderer.setPixelRatio(ratio);
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.map && !this.isInteracting) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public getBuildingCount(): number {
    return this.buildingCount;
  }

  public setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
    if (this.realisticCityMaterial && this.realisticCityMaterial.uniforms.uOpacity) {
      this.realisticCityMaterial.uniforms.uOpacity.value = this.opacity;
      this.realisticCityMaterial.transparent = this.opacity < 0.99;
      this.realisticCityMaterial.needsUpdate = true;
    }
    if (this.masterAtlasMaterial) {
      this.masterAtlasMaterial.opacity = this.opacity;
      this.masterAtlasMaterial.transparent = this.opacity < 0.99;
      this.masterAtlasMaterial.needsUpdate = true;
    }
    if (this.contactShadowMaterial) {
      (this.contactShadowMaterial as any).opacity = this.opacity * 0.70;
      this.contactShadowMaterial.transparent = true;
      this.contactShadowMaterial.needsUpdate = true;
    }
    if (this.masterCityMesh && this.masterCityMesh.material) {
      const mat = this.masterCityMesh.material as THREE.Material;
      mat.transparent = this.opacity < 0.99;
      mat.opacity = this.opacity;
      mat.needsUpdate = true;
    }
    if (this.map && this.isVisible && !this.isInteracting) {
      this.map.triggerRepaint();
    }
  }

  public setStyleMode(mode: 'photorealistic' | 'clean_mass'): void {
    this.styleMode = mode;
    const useAtlas = mode === 'photorealistic';
    if (this.realisticCityMaterial && this.realisticCityMaterial.uniforms.uUseAtlasTexture) {
      this.realisticCityMaterial.uniforms.uUseAtlasTexture.value = useAtlas;
      this.realisticCityMaterial.needsUpdate = true;
    }
    if (this.map && this.isVisible && !this.isInteracting) {
      this.map.triggerRepaint();
    }
  }

  public setSSE(sse: number): void {
    this.sseQuality = sse;
    this.updateZoomLOD(this.currentZoomLOD);
  }

  /**
   * [1. 카메라 거리에 따른 3단계 자동 LOD 시스템 + 동적 SSE 품질 연동]
   * - SSE 8 (초정밀): 먼 거리에서도 옥탑/난간/설비 디테일 적극 노출
   * - SSE 16 (균형): 표준 거리
   * - SSE 24 (고성능): 근접 시에만 세부 구조물 노출
   */
  public updateZoomLOD(currentZoom: number): void {
    if (!this.isVisible) return;
    this.currentZoomLOD = currentZoom;

    const standardThreshold = this.sseQuality <= 8 ? 12.8 : this.sseQuality <= 16 ? 13.5 : 14.2;
    const detailThreshold = this.sseQuality <= 8 ? 14.0 : this.sseQuality <= 16 ? 15.2 : 16.0;

    const isStandardOrAbove = currentZoom >= standardThreshold;
    const isNearDetail = currentZoom >= detailThreshold;

    // 1) 건물 본체 파사드 및 접지 그림자: Zoom 13.5 이상 표준 조감도 뷰에서 활성화
    if (this.masterCityMesh) {
      this.masterCityMesh.visible = isStandardOrAbove;
    }
    if (this.contactShadowMesh) {
      this.contactShadowMesh.visible = isStandardOrAbove;
    }

    // 2) 옥상 입체 난간, STS 물탱크, 벤트, 태양광 패널, HVAC 냉각탑, 헬리패드 등 세부 구조물: Zoom 15.2 이상 근접 상세 뷰에서만 활성화
    if (this.waterTankInstancedMesh) {
      this.waterTankInstancedMesh.visible = isNearDetail;
    }
    if (this.ventInstancedMesh) {
      this.ventInstancedMesh.visible = isNearDetail;
    }
    if (this.solarPanelInstancedMesh) {
      this.solarPanelInstancedMesh.visible = isNearDetail;
    }
    if (this.hvacInstancedMesh) {
      this.hvacInstancedMesh.visible = isNearDetail;
    }
    if (this.helipadUnifiedMesh) {
      this.helipadUnifiedMesh.visible = isNearDetail;
    }

    if (this.map && this.isVisible && !this.isInteracting) {
      this.map.triggerRepaint();
    }
  }

  public updateSunLight(
    vector: [number, number, number],
    color: string,
    intensity: number
  ): void {
    this.sunLightDirection.set(vector[0], vector[1], vector[2]).normalize();
    if (this.directionalLight) {
      this.directionalLight.position.set(vector[0], vector[1], vector[2]).normalize();
      this.directionalLight.color.set(color);
      this.directionalLight.intensity = Math.max(1.25, intensity * 1.25);
    }
    if (this.hemisphereLight) {
      this.hemisphereLight.intensity = 0.90;
    }
    if (this.ambientLight) {
      this.ambientLight.intensity = 0.75;
    }
    if (this.fillLight) {
      this.fillLight.intensity = 0.45;
    }
    if (this.realisticCityMaterial) {
      this.realisticCityMaterial.uniforms.uSunDirection.value.set(vector[0], vector[1], vector[2]).normalize();
      const c = new THREE.Color(color);
      this.realisticCityMaterial.uniforms.uSunColor.value.set(c.r, c.g, c.b);
      this.realisticCityMaterial.uniforms.uSunIntensity.value = Math.max(1.0, intensity);
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

      // 1. [화사한 주간 태양광 3점 조명 시스템 - 검은색 벽면 방지 & 아이보리 톤 극대화]
      this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.25);
      this.directionalLight.position.set(120, 180, 100).normalize();
      this.directionalLight.castShadow = false;
      this.scene.add(this.directionalLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.90);
      this.scene.add(this.hemisphereLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      this.scene.add(this.ambientLight);

      this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
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
        const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
        this.renderer.setPixelRatio(pr);
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
    if (this.isInteracting) {
      this.pendingFeatures = features;
      this.pendingOriginLngLat = newOriginLngLat;
      return;
    }

    if (!features || features.length === 0) {
      if (this.masterCityMesh) {
        // [무중단 원자적 캐시] 기존에 렌더링된 메쉬를 유지하여 깜빡임/소실 원천 차단
        return;
      }
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

    // [Double Buffering] 신규 지오메트리 빌드 완료 전까지 구형 메쉬를 지우지 않고 유지

    if (!this.masterAtlasMaterial) {
      this.masterAtlasMaterial = getKoreanCityAtlasMaterial();
    }
    if (!this.materials) {
      this.initMaterials();
    }

    // [3단계: 타일 단위 청크 메쉬 캐시 선조회 (0ms 즉시 화면 유지, 60fps)]
    const chunkKey = this.computeChunkKey(features, this.originLngLat, this.currentZoomLOD);
    if (this.chunkMeshCache.has(chunkKey)) {
      const cached = this.chunkMeshCache.get(chunkKey)!;
      // LRU 갱신
      this.chunkMeshCache.delete(chunkKey);
      this.chunkMeshCache.set(chunkKey, cached);
      this.applyWorkerResult(cached);
      return;
    }

    // [1단계: Web Worker 기반 고속 건물 지오메트리 엔진 구축]
    // OSMBuildings & mapbox/earcut 벤더링 전용 buildingMeshWorker(Transferable Objects)로 백그라운드 0ms 연산
    buildingMeshWorkerClient
      .buildBuildings({
        features,
        originLngLat: this.originLngLat,
        sunDirection: [
          this.sunLightDirection.x,
          this.sunLightDirection.y,
          this.sunLightDirection.z,
        ],
        zoom: this.currentZoomLOD,
      })
      .then((workerResult) => {
        if (workerResult && workerResult.positions && workerResult.positions.length > 0) {
          // 청크 캐시에 등록 (LRU 용량 제어)
          if (this.chunkMeshCache.size >= this.MAX_CHUNK_CACHE_ENTRIES) {
            const oldest = this.chunkMeshCache.keys().next().value;
            if (oldest) this.chunkMeshCache.delete(oldest);
          }
          this.chunkMeshCache.set(chunkKey, workerResult);
          this.applyWorkerResult(workerResult);
        } else {
          geometryWorkerClient
            .buildBuildings({
              features,
              originLngLat: this.originLngLat,
              sunDirection: [
                this.sunLightDirection.x,
                this.sunLightDirection.y,
                this.sunLightDirection.z,
              ],
              zoom: this.currentZoomLOD,
            })
            .then((fallbackResult) => {
              if (fallbackResult && fallbackResult.positions && fallbackResult.positions.length > 0) {
                if (this.chunkMeshCache.size >= this.MAX_CHUNK_CACHE_ENTRIES) {
                  const oldest = this.chunkMeshCache.keys().next().value;
                  if (oldest) this.chunkMeshCache.delete(oldest);
                }
                this.chunkMeshCache.set(chunkKey, fallbackResult as any);
                this.applyWorkerResult(fallbackResult);
              } else {
                this.buildFallbackSync(features);
              }
            });
        }
      })
      .catch((err) => {
        console.warn('[LOD2BuildingEngine] buildingMeshWorker error, falling back:', err);
        this.buildFallbackSync(features);
      });
  }

  /**
   * Worker 미지원 또는 예외 발생 시 동기식 폴백 빌더
   */
  private buildFallbackSync(features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]): void {
    // [1순위: 24종 실사 아틀라스 & 다중 지붕 지오메트리 동기 빌더 직결]
    try {
      const osmResult = buildOsmBuildingGeometry({
        features,
        originLngLat: this.originLngLat,
        sunDirection: [
          this.sunLightDirection.x,
          this.sunLightDirection.y,
          this.sunLightDirection.z,
        ],
        zoom: this.currentZoomLOD,
      });
      if (osmResult && osmResult.positions && osmResult.positions.length > 0) {
        this.applyWorkerResult(osmResult);
        return;
      }
    } catch (err) {
      console.warn('[LOD2BuildingEngine] buildOsmBuildingGeometry direct fallback error:', err);
    }

    // 마스터 아틀라스 버텍스 배열 (2차 안전 폴백)
    const masterPositions: number[] = [];
    const masterNormals: number[] = [];
    const masterUvs: number[] = [];
    const masterColors: number[] = [];

    // 헬리패드 보조 버퍼
    const helipadBaseGeometries: THREE.BufferGeometry[] = [];
    const helipadRingGeometries: THREE.BufferGeometry[] = [];
    const helipadMarkGeometries: THREE.BufferGeometry[] = [];

    // 인스턴싱 설비 버퍼
    const waterTankMatrices: THREE.Matrix4[] = [];
    const ventMatrices: THREE.Matrix4[] = [];
    const solarMatrices: THREE.Matrix4[] = [];
    const hvacMatrices: THREE.Matrix4[] = [];

    // [신규] 지면 접지 그림자(Contact Shadow) 및 실시간 태양광 투영 그림자 버퍼
    const shadowPositions: number[] = [];
    const shadowColors: number[] = [];

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

      const rawFlr = Number(
        props['building:levels'] || props.building_levels || props.levels || props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || 0
      );
      const rawHei = Number(
        props.height || props.render_height || props.hei || props.HEI || props.bld_hgt || 0
      );

      // [3. 실측 층수 기반 정확한 높이 스케일링: 1개 층 = 정확히 3.0m]
      const explicitH = rawHei > 0 ? rawHei : (rawFlr > 0 ? rawFlr * 3.0 : 0);

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

        const isMilitary =
          name.includes('부대') ||
          name.includes('군') ||
          name.includes('막사') ||
          name.includes('병영') ||
          name.includes('창고') ||
          name.includes('보급') ||
          name.includes('사령부') ||
          usageType.includes('military') ||
          usageType.includes('barracks') ||
          props.isMilitaryOrPublic === true;

        // [Z축 스케일 정밀 복원: 1개 층 3.0m 기준 및 실측 비례 매핑]
        let totalH = explicitH;
        const isApt =
          !isMilitary && (
            name.includes('아파트') ||
            name.includes('apt') ||
            name.includes('단지') ||
            name.includes('푸르지오') ||
            name.includes('자이') ||
            name.includes('힐스테이트') ||
            name.includes('래미안') ||
            name.includes('e편한') ||
            name.includes('더샵') ||
            name.includes('아이파크') ||
            name.includes('롯데캐슬') ||
            name.includes('한신') ||
            name.includes('삼호') ||
            name.includes('두산') ||
            name.includes('우성') ||
            name.includes('현대') ||
            name.includes('동보') ||
            name.includes('세경') ||
            name.includes('코아루') ||
            name.includes('부영') ||
            name.includes('주공') ||
            usageType.includes('apartment') ||
            props.bld_category === 'apartment' ||
            (aspectRatio >= 1.4 && approxArea >= 280)
          );

        const isComm =
          !isMilitary && !isApt && (
            name.includes('타워') ||
            name.includes('빌딩') ||
            name.includes('센터') ||
            usageType.includes('commercial') ||
            usageType.includes('office') ||
            props.bld_category === 'commercial' ||
            approxArea >= 500
          );

        // [3. 실측 층수 기반 정확한 높이 스케일링: 1개 층 3.0m 엄격 준수]
        if (!totalH || totalH <= 4.0) {
          if (isMilitary) {
            const seed = Math.abs(Math.sin(obb.centroid.x * 31.7 + obb.centroid.y * 89.3)) % 1;
            const milStories = approxArea < 200 ? 2 : Math.round(2 + seed);
            totalH = milStories * 3.5; // 7.0m ~ 10.5m
          } else if (isApt) {
            // 아파트 단지: 층수 부재 시 실제 동별 층수 15~25층 (45m~75m, 3.0m/층)
            const seed = Math.abs(Math.sin(obb.centroid.x * 12.9898 + obb.centroid.y * 78.233)) % 1;
            const defaultAptStories = Math.round(15 + seed * 10); // 15~25층
            totalH = defaultAptStories * 3.0; // 정확히 3.0m/층 (45m~75m)
          } else if (isComm) {
            // 일반 시내 상가: 층수 부재 시 4~10층 (13m~32m)
            const seed = Math.abs(Math.sin(obb.centroid.x * 37.11 + obb.centroid.y * 53.77)) % 1;
            const stories = approxArea >= 700 ? Math.round(5 + seed * 4) : (seed > 0.5 ? 4 : 3);
            totalH = stories * 3.2;
          } else {
            // 단독주택 / 빌라: 층수 부재 시 2~4층 (6m~12m)
            if (approxArea < 130 || usageType.includes('house')) {
              totalH = 6.0; // 2층 단독주택 (6.0m)
            } else if (approxArea < 350) {
              totalH = 9.0; // 3층 빌라/다세대 (9.0m)
            } else {
              totalH = 12.0; // 4층 저층 상가주택 (12.0m)
            }
          }
        }
        totalH = Math.max(3.5, totalH);

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

        // 0. [건물 바닥 외곽 지면 접지 그림자(Contact Shadow) 및 실시간 태양광 투영 그림자(Sun Drop Shadow)]
        const N = pts.length;
        const shadowRadius = Math.max(2.5, Math.min(4.0, totalH * 0.08 + 2.2));
        const sX = this.sunLightDirection.x;
        const sY = Math.max(0.25, this.sunLightDirection.y);
        const sZ = this.sunLightDirection.z;
        const projScale = Math.min(1.35, Math.max(0.35, 1.0 / Math.tan(Math.asin(sY)))) * 0.45;
        const dropLength = totalH * projScale;
        const dropDx = -sX * dropLength;
        const dropDz = -sZ * dropLength;

        for (let i = 0; i < N; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % N];
          const dx = p1.x - p0.x;
          const dz = p1.y - p0.y;
          const segLen = Math.sqrt(dx * dx + dz * dz);
          if (segLen < 0.05) continue;

          // Inward normal: (-dz/len, dx/len)
          // Outward normal: (dz/len, -dx/len)
          const outNx = dz / segLen;
          const outNz = -dx / segLen;

          // (1) 지면 접지 그림자 (Contact Shadow Skirt: 2.5m~4.0m 외곽 방향 전개)
          const p0_out_x = p0.x + outNx * shadowRadius;
          const p0_out_z = p0.y + outNz * shadowRadius;
          const p1_out_x = p1.x + outNx * shadowRadius;
          const p1_out_z = p1.y + outNz * shadowRadius;

          addShadowQuad(
            shadowPositions,
            shadowColors,
            { x: p0.x, y: relElev + 0.04, z: p0.y, a: 0.70 },
            { x: p1.x, y: relElev + 0.04, z: p1.y, a: 0.70 },
            { x: p1_out_x, y: relElev + 0.04, z: p1_out_z, a: 0.0 },
            { x: p0_out_x, y: relElev + 0.04, z: p0_out_z, a: 0.0 },
            0.059, 0.090, 0.165 // 다크 네이비 rgba(15, 23, 42)
          );

          // (2) 실시간 태양광 투영 그림자 (Drop Shadow: 건물 높이에 비례하여 광원 반대 방향으로 연장 투영)
          if (totalH >= 4.0 && (outNx * sX + outNz * sZ) < 0.20) {
            addShadowQuad(
              shadowPositions,
              shadowColors,
              { x: p0.x, y: relElev + 0.03, z: p0.y, a: 0.45 },
              { x: p1.x, y: relElev + 0.03, z: p1.y, a: 0.45 },
              { x: p1.x + dropDx, y: relElev + 0.03, z: p1.y + dropDz, a: 0.45 },
              { x: p0.x + dropDx, y: relElev + 0.03, z: p0.y + dropDz, a: 0.45 },
              0.059, 0.090, 0.165 // 다크 네이비 rgba(15, 23, 42, 0.45)
            );
          }
        }

        // 1. [외벽 (Wall) 지오메트리 & 경사지 건물 들뜸 방지 지하 기초 옹벽(Foundation Skirt -5.0m)]
        // 급경사 산비탈이나 구릉지에서도 건물의 바닥 한쪽이 공중에 뜨지 않도록 지하 -5.0m까지 콘크리트 화강석 기초 옹벽을 연장
        const wallBaseY = relElev - 5.0;
        const aboveGroundH = Math.max(2.8, wallTop - relElev); // 지상 실측 높이

        // [Part 1. 저층 기단부 (0m ~ 4m)]: 짙은 화강석 그레이 #94a3b8로 지면과 건물의 경계를 단단하게 고정
        const podiumH = Math.min(4.0, aboveGroundH);
        const podiumTopY = relElev + podiumH;
        const towerH = Math.max(0, wallTop - podiumTopY);

        // 정밀 UV 규격: 1개 층(높이 3.0m) x 창문 1칸(폭 2.8m)
        const BAY_WIDTH = 2.8;
        const STORY_HEIGHT = 3.0;

        const buildingSeed = Math.abs(Math.sin(obb.centroid.x * 12.9898 + obb.centroid.y * 78.233)) % 1;
        const seedRoof = Math.abs(Math.sin(obb.centroid.x * 45.164 + obb.centroid.y * 91.733)) % 1;
        let roofSlotId = 14;
        let roofR = 0.47, roofG = 0.44, roofB = 0.42; // 30%: 노후 콘크리트 슬래브 웜 그레이
        if (seedRoof < 0.30) {
          roofSlotId = 14; roofR = 0.47; roofG = 0.44; roofB = 0.42;
        } else if (seedRoof < 0.55) {
          roofSlotId = 15; roofR = 0.20; roofG = 0.25; roofB = 0.33; // 25%: 아스팔트 차콜
        } else if (seedRoof < 0.75) {
          roofSlotId = 16; roofR = 0.42; roofG = 0.18; roofB = 0.12; // 20%: 적갈색 기와
        } else if (seedRoof < 0.90) {
          roofSlotId = 17; roofR = 0.23; roofG = 0.32; roofB = 0.29; // 15%: 세이지 그린
        } else {
          roofSlotId = 18; roofR = 0.17; roofG = 0.26; roofB = 0.34; // 10%: 청회색 징크
        }

        const podiumSlotId = isComm ? 9 : 5;
        const fndUV = getVWorldAtlasSlotUV(podiumSlotId);
        const skirtUV = getVWorldAtlasSlotUV(21); // 21: parapet_concrete / 옹벽 콘크리트
        const aptFrontSlot = Math.floor(buildingSeed * 4); // 0, 1, 2, 3
        const aptFrontUV = getVWorldAtlasSlotUV(aptFrontSlot);
        const aptSideUV = getVWorldAtlasSlotUV(4); // 4: apt_side
        const commSlot = 5 + Math.floor(buildingSeed * 4);
        const resSlot = isMilitary ? 23 : 10 + Math.floor(buildingSeed * 4);
        const wallSlotId = isComm ? commSlot : resSlot;
        const genWallUV = getVWorldAtlasSlotUV(wallSlotId);

        for (let i = 0; i < N; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % N];
          const dx = p1.x - p0.x;
          const dz = p1.y - p0.y;
          const segLen = Math.sqrt(dx * dx + dz * dz);
          if (segLen < 0.05) continue;

          const outNx = dz / segLen;
          const outNz = -dx / segLen;

          // ===================================================================
          // [Part 0. 지하 기초 옹벽 (Foundation Skirt: -5.0m ~ 0m)]
          // 경사지/구릉지에서 지면 아래로 파고들어 건물이 공중에 뜨지 않도록 완벽 밀착
          // 콘크리트 화강석 기단부 (#475569)
          // ===================================================================
          addQuad(
            masterPositions, masterNormals, masterUvs, masterColors,
            { x: p0.x, y: wallBaseY, z: p0.y },
            { x: p1.x, y: wallBaseY, z: p1.y },
            { x: p1.x, y: relElev, z: p1.y },
            { x: p0.x, y: relElev, z: p0.y },
            outNx, 0, outNz,
            { u: skirtUV.u0, v: skirtUV.v0 },
            { u: skirtUV.u1, v: skirtUV.v0 },
            { u: skirtUV.u1, v: skirtUV.v1 },
            { u: skirtUV.u0, v: skirtUV.v1 },
            0.28, 0.33, 0.41 // #475569 콘크리트 화강석 옹벽 톤
          );

          // ===================================================================
          // [Part 1. 저층 기단부 (0m ~ 4m)]
          // 지상 0m(relElev)부터 지상 4m(podiumTopY)까지 일체형 화강석 기단부 외벽 구성
          // ===================================================================
          addQuad(
            masterPositions, masterNormals, masterUvs, masterColors,
            { x: p0.x, y: relElev, z: p0.y },
            { x: p1.x, y: relElev, z: p1.y },
            { x: p1.x, y: podiumTopY, z: p1.y },
            { x: p0.x, y: podiumTopY, z: p0.y },
            outNx, 0, outNz,
            { u: fndUV.u0, v: fndUV.v0 },
            { u: fndUV.u1, v: fndUV.v0 },
            { u: fndUV.u1, v: fndUV.v1 },
            { u: fndUV.u0, v: fndUV.v1 },
            0.98, 0.98, 0.98
          );

          // ===================================================================
          // [Part 2. 본동 외벽 및 창문 파사드 (4m ~ H)]
          // ===================================================================
          if (towerH > 0.5) {
            const nBays = Math.max(1, Math.round(segLen / BAY_WIDTH));
            const nStories = Math.max(1, Math.round(towerH / STORY_HEIGHT));

            if (cls.category === 'apartment') {
              // 아파트 측벽 판별: OBB 단축(dirV)과의 방향 일치율 > 0.65
              const isNarrowSide = Math.abs(dx * obb.dirV.x + dz * obb.dirV.y) / segLen > 0.65;

              if (isNarrowSide) {
                // (1) 한국형 아파트 측벽: 밝은 크림 아이보리(#f8fafc) + 측벽 수직 코어 라인 + 상단 동 번호 마킹
                addQuad(
                  masterPositions, masterNormals, masterUvs, masterColors,
                  { x: p0.x, y: podiumTopY, z: p0.y },
                  { x: p1.x, y: podiumTopY, z: p1.y },
                  { x: p1.x, y: wallTop, z: p1.y },
                  { x: p0.x, y: wallTop, z: p0.y },
                  outNx, 0, outNz,
                  { u: aptSideUV.u0, v: aptSideUV.v0 },
                  { u: aptSideUV.u1, v: aptSideUV.v0 },
                  { u: aptSideUV.u1, v: aptSideUV.v1 },
                  { u: aptSideUV.u0, v: aptSideUV.v1 },
                  0.98, 0.98, 0.99
                );
              } else {
                // (2) 한국형 아파트 전/후면: 세대별 베란다 창문 격자 및 실외기 루버 (3m 층고 단위 격자)
                for (let b = 0; b < nBays; b++) {
                  const t0 = b / nBays;
                  const t1 = (b + 1) / nBays;
                  const bx0 = p0.x + dx * t0;
                  const bz0 = p0.y + dz * t0;
                  const bx1 = p0.x + dx * t1;
                  const bz1 = p0.y + dz * t1;

                  for (let s = 0; s < nStories; s++) {
                    const y0 = podiumTopY + (towerH * s) / nStories;
                    const y1 = podiumTopY + (towerH * (s + 1)) / nStories;

                    addQuad(
                      masterPositions, masterNormals, masterUvs, masterColors,
                      { x: bx0, y: y0, z: bz0 },
                      { x: bx1, y: y0, z: bz1 },
                      { x: bx1, y: y1, z: bz1 },
                      { x: bx0, y: y1, z: bz0 },
                      outNx, 0, outNz,
                      { u: aptFrontUV.u0, v: aptFrontUV.v0 },
                      { u: aptFrontUV.u1, v: aptFrontUV.v0 },
                      { u: aptFrontUV.u1, v: aptFrontUV.v1 },
                      { u: aptFrontUV.u0, v: aptFrontUV.v1 },
                      0.98, 0.98, 0.99
                    );
                  }
                }
              }
            } else {
              // (3) 상업/오피스 (4종 5~8), 주택/시설 (4종 10~13), 군 시설 (23)
              const wallUV = genWallUV;

              for (let b = 0; b < nBays; b++) {
                const t0 = b / nBays;
                const t1 = (b + 1) / nBays;
                const bx0 = p0.x + dx * t0;
                const bz0 = p0.y + dz * t0;
                const bx1 = p0.x + dx * t1;
                const bz1 = p0.y + dz * t1;

                for (let s = 0; s < nStories; s++) {
                  const y0 = podiumTopY + (towerH * s) / nStories;
                  const y1 = podiumTopY + (towerH * (s + 1)) / nStories;

                  addQuad(
                    masterPositions, masterNormals, masterUvs, masterColors,
                    { x: bx0, y: y0, z: bz0 },
                    { x: bx1, y: y0, z: bz1 },
                    { x: bx1, y: y1, z: bz1 },
                    { x: bx0, y: y1, z: bz0 },
                    outNx, 0, outNz,
                    { u: wallUV.u0, v: wallUV.v0 },
                    { u: wallUV.u1, v: wallUV.v0 },
                    { u: wallUV.u1, v: wallUV.v1 },
                    { u: wallUV.u0, v: wallUV.v1 },
                    0.98, 0.98, 0.99
                  );
                }
              }
            }
          }
        }

        // 2. [지붕 (Roof) 지오메트리 & 아틀라스 UV 매핑 - 실제 GIS 건물 다각형 100% 1:1 Earcut 정밀 수직 압출]
        const roofTriangles = triangulatePolygon2D(pts);
        if (roofTriangles.length > 0) {
          const roofUV = getVWorldAtlasSlotUV(roofSlotId);
          for (const idx of roofTriangles) {
            const p = pts[idx];
            const u = roofUV.u0 + ((p.x - minX) / rangeX) * (roofUV.u1 - roofUV.u0);
            const v = roofUV.v0 + ((p.y - minY) / rangeY) * (roofUV.v1 - roofUV.v0);

            masterPositions.push(p.x, wallTop, p.y);
            masterNormals.push(0, 1, 0); // normal.y = 1
            masterUvs.push(u, v);
            masterColors.push(roofR, roofG, roofB);
          }
        }

        // 3. [0.9m 실측 규격 콘크리트 난간(Parapet) - 외곽선 안쪽으로만 0.35m 두께 정밀 모델링]
        if (cls.hasParapet && obb.lenV >= 2.5 && approxArea >= 20) {
          const parapetUV = getVWorldAtlasSlotUV(21);
          const pH = 0.9; // 옥상 난간 높이 0.9m
          const pThick = 0.35; // 외곽선 안쪽 테두리 두께 0.35m (실측 규격)

          for (let i = 0; i < N; i++) {
            const p0 = pts[i];
            const p1 = pts[(i + 1) % N];
            const dx = p1.x - p0.x;
            const dz = p1.y - p0.y;
            const segLen = Math.sqrt(dx * dx + dz * dz);
            if (segLen < 0.1) continue;

            // Inward normal (다각형 내부 방향)
            const inNx = -dz / segLen;
            const inNz = dx / segLen;
            // Outward normal (다각형 외부 방향)
            const outNx = -inNx;
            const outNz = -inNz;

            // 안쪽 내벽 오프셋 좌표 (다각형 내부로 0.25m 이동)
            const p0i_x = p0.x + inNx * pThick;
            const p0i_z = p0.y + inNz * pThick;
            const p1i_x = p1.x + inNx * pThick;
            const p1i_z = p1.y + inNz * pThick;

            // 1) 난간 외벽면 (높이 0.8m, 외벽 라인과 1:1 완벽 정합)
            addQuad(
              masterPositions, masterNormals, masterUvs, masterColors,
              { x: p0.x, y: wallTop, z: p0.y },
              { x: p1.x, y: wallTop, z: p1.y },
              { x: p1.x, y: wallTop + pH, z: p1.y },
              { x: p0.x, y: wallTop + pH, z: p0.y },
              outNx, 0, outNz,
              { u: parapetUV.u0, v: parapetUV.v0 },
              { u: parapetUV.u1, v: parapetUV.v0 },
              { u: parapetUV.u1, v: parapetUV.v1 },
              { u: parapetUV.u0, v: parapetUV.v1 },
              0.98, 0.98, 0.99
            );

            // 2) 난간 상단 코핑 (두께 0.25m 수평 마감)
            addQuad(
              masterPositions, masterNormals, masterUvs, masterColors,
              { x: p0.x, y: wallTop + pH, z: p0.y },
              { x: p0i_x, y: wallTop + pH, z: p0i_z },
              { x: p1i_x, y: wallTop + pH, z: p1i_z },
              { x: p1.x, y: wallTop + pH, z: p1.y },
              0, 1, 0,
              { u: parapetUV.u0, v: parapetUV.v0 },
              { u: parapetUV.u0, v: parapetUV.v1 },
              { u: parapetUV.u1, v: parapetUV.v1 },
              { u: parapetUV.u1, v: parapetUV.v0 },
              1.0, 1.0, 1.0
            );

            // 3) 난간 안쪽 내벽 (상단 코핑에서 우레탄 옥상 바닥으로 0.8m 내려가는 내벽)
            addQuad(
              masterPositions, masterNormals, masterUvs, masterColors,
              { x: p1i_x, y: wallTop, z: p1i_z },
              { x: p0i_x, y: wallTop, z: p0i_z },
              { x: p0i_x, y: wallTop + pH, z: p0i_z },
              { x: p1i_x, y: wallTop + pH, z: p1i_z },
              inNx, 0, inNz,
              { u: parapetUV.u0, v: parapetUV.v0 },
              { u: parapetUV.u0, v: parapetUV.v1 },
              { u: parapetUV.u1, v: parapetUV.v1 },
              { u: parapetUV.u0, v: parapetUV.v1 },
              0.98, 0.98, 0.99
            );
          }
        }

        // 4. [엘리베이터 권상기실(Penthouse) 컴팩트화 & 다각형 내부 100% 포함 검증]
        // 좁거나 오목/복합 다각형(ㄱ자, ㄷ자) 건물 위 억지 사각 옥탑 박스 배제 -> 깔끔한 평슬래브 유지
        let hasValidPenthouse = false;
        let pentCX = 0;
        let pentCZ = 0;
        let pentW = 0;
        let pentD = 0;
        const pentH = 2.4; // 실측 엘리베이터 권상기실 높이 2.4m

        if (cls.hasPenthouse && totalH >= 18.0 && approxArea >= 150) {
          const coreW = Math.max(2.8, Math.min(obb.lenU * 0.16, 5.0));
          const coreD = Math.max(2.4, Math.min(obb.lenV * 0.22, 4.0));
          const hw = coreW * 0.5 + 0.35; // 외곽 난간과의 0.35m 이격 마진
          const hd = coreD * 0.5 + 0.35;
          const cx = obb.obbCenter.x;
          const cz = obb.obbCenter.y;
          const u = obb.dirU;
          const v = obb.dirV;

          const c0 = { x: cx - u.x * hw - v.x * hd, z: cz - u.y * hw - v.y * hd };
          const c1 = { x: cx + u.x * hw - v.x * hd, z: cz + u.y * hw - v.y * hd };
          const c2 = { x: cx + u.x * hw + v.x * hd, z: cz + u.y * hw + v.y * hd };
          const c3 = { x: cx - u.x * hw + v.x * hd, z: cz - u.y * hw + v.y * hd };

          // 옥탑 4개 모서리 및 중심점이 실제 GIS 다각형 내부에 완전히 들어있는지 엄격 검증
          const isInside =
            isPointInPolygon2D(cx, cz, pts) &&
            isPointInPolygon2D(c0.x, c0.z, pts) &&
            isPointInPolygon2D(c1.x, c1.z, pts) &&
            isPointInPolygon2D(c2.x, c2.z, pts) &&
            isPointInPolygon2D(c3.x, c3.z, pts);

          if (isInside) {
            hasValidPenthouse = true;
            pentCX = cx;
            pentCZ = cz;
            pentW = coreW;
            pentD = coreD;

            const pentUV = getVWorldAtlasSlotUV(19);
            const coolRoofUV = getVWorldAtlasSlotUV(14);
            const realHw = coreW * 0.5;
            const realHd = coreD * 0.5;
            const rc0 = { x: cx - u.x * realHw - v.x * realHd, z: cz - u.y * realHw - v.y * realHd };
            const rc1 = { x: cx + u.x * realHw - v.x * realHd, z: cz + u.y * realHw - v.y * realHd };
            const rc2 = { x: cx + u.x * realHw + v.x * realHd, z: cz + u.y * realHw + v.y * realHd };
            const rc3 = { x: cx - u.x * realHw + v.x * realHd, z: cz - u.y * realHw + v.y * realHd };
            const corners = [rc0, rc1, rc2, rc3];

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
                masterPositions, masterNormals, masterUvs, masterColors,
                { x: ca.x, y: wallTop, z: ca.z },
                { x: cb.x, y: wallTop, z: cb.z },
                { x: cb.x, y: wallTop + pentH, z: cb.z },
                { x: ca.x, y: wallTop + pentH, z: ca.z },
                cnx, 0, cnz,
                { u: pentUV.u0, v: pentUV.v0 },
                { u: pentUV.u1, v: pentUV.v0 },
                { u: pentUV.u1, v: pentUV.v1 },
                { u: pentUV.u0, v: pentUV.v1 },
                0.98, 0.98, 0.99
              );
            }

            // 기계실 옥탑 슬래브
            addQuad(
              masterPositions, masterNormals, masterUvs, masterColors,
              { x: rc0.x, y: wallTop + pentH, z: rc0.z },
              { x: rc1.x, y: wallTop + pentH, z: rc1.z },
              { x: rc2.x, y: wallTop + pentH, z: rc2.z },
              { x: rc3.x, y: wallTop + pentH, z: rc3.z },
              0, 1, 0,
              { u: coolRoofUV.u0, v: coolRoofUV.v0 },
              { u: coolRoofUV.u1, v: coolRoofUV.v0 },
              { u: coolRoofUV.u1, v: coolRoofUV.v1 },
              { u: coolRoofUV.u0, v: coolRoofUV.v1 },
              1.0, 1.0, 1.0
            );
          }
        }

        // 5. [한국형 옥상 부속 설비 인스턴싱: STS 원통/사각 물탱크 & 환기 파이프 벤트]
        if (cls.category === 'apartment' && hasValidPenthouse) {
          const tankRadius = Math.max(0.8, Math.min(1.4, obb.lenV * 0.10));
          const tankHeight = 2.0;
          const tankOffsetX = obb.dirU.x * (pentW * 0.5 + tankRadius * 1.3);
          const tankOffsetZ = obb.dirU.y * (pentW * 0.5 + tankRadius * 1.3);

          const tx = pentCX + tankOffsetX;
          const tz = pentCZ + tankOffsetZ;

          if (isPointInPolygon2D(tx, tz, pts)) {
            tempPos.set(tx, wallTop, tz);
            tempEuler.set(0, Math.atan2(obb.dirU.y, obb.dirU.x), 0, 'YXZ');
            tempQuat.setFromEuler(tempEuler);
            tempScale.set(tankRadius * 2, tankHeight, tankRadius * 2);
            tempMat.compose(tempPos, tempQuat, tempScale);
            waterTankMatrices.push(tempMat.clone());
          }

          // 옥상 벤트 2~4기 (다각형 내부 포함점만 선별 배치)
          const ventCount = Math.max(2, Math.min(4, Math.floor(obb.lenU / 7.0)));
          for (let v = 0; v < ventCount; v++) {
            const vAngle = (v / ventCount) * Math.PI * 2;
            const distU = Math.max(2.0, Math.min(obb.lenU * 0.25, 6.0));
            const distV = Math.max(1.5, Math.min(obb.lenV * 0.22, 4.0));
            const vx = pentCX + Math.cos(vAngle) * distU;
            const vz = pentCZ + Math.sin(vAngle) * distV;

            if (isPointInPolygon2D(vx, vz, pts)) {
              tempPos.set(vx, wallTop, vz);
              tempQuat.identity();
              tempScale.set(0.65, 0.95, 0.65);
              tempMat.compose(tempPos, tempQuat, tempScale);
              ventMatrices.push(tempMat.clone());
            }
          }
        } else if ((cls.category === 'commercial' || cls.category === 'villa') && totalH >= 7.0 && approxArea >= 50.0) {
          // 상가 및 저층 주택/빌라: STS 물탱크 1~2기와 벤트 파이프 배치 (위성사진 실루엣 재현)
          const tankRadius = Math.max(0.7, Math.min(1.2, obb.lenV * 0.08));
          const tankHeight = 1.8;
          const tankAngle = Math.atan2(obb.dirU.y, obb.dirU.x);
          const nTanks = approxArea >= 180 ? 2 : 1;
          for (let t = 0; t < nTanks; t++) {
            const offsetMag = (t === 0 ? 1 : -1) * (obb.lenU * 0.22);
            const tx = obb.obbCenter.x + obb.dirU.x * offsetMag;
            const tz = obb.obbCenter.y + obb.dirU.y * offsetMag;
            if (isPointInPolygon2D(tx, tz, pts)) {
              tempPos.set(tx, wallTop, tz);
              tempEuler.set(0, tankAngle, 0, 'YXZ');
              tempQuat.setFromEuler(tempEuler);
              tempScale.set(tankRadius * 2, tankHeight, tankRadius * 2);
              tempMat.compose(tempPos, tempQuat, tempScale);
              waterTankMatrices.push(tempMat.clone());
            }
          }

          // 환기 파이프 벤트
          const vx = obb.obbCenter.x - obb.dirV.x * (obb.lenV * 0.2);
          const vz = obb.obbCenter.y - obb.dirV.y * (obb.lenV * 0.2);
          if (isPointInPolygon2D(vx, vz, pts)) {
            tempPos.set(vx, wallTop, vz);
            tempQuat.identity();
            tempScale.set(0.5, 0.8, 0.5);
            tempMat.compose(tempPos, tempQuat, tempScale);
            ventMatrices.push(tempMat.clone());
          }
        }

        // 6. [랜드마크 타워 옥상 헬리패드 & 태양광 패널 - 다각형 내부 포함 검증]
        if (cls.category === 'curtainwall' && totalH >= 35.0) {
          const helipadRadius = Math.max(4.0, Math.min(9.0, Math.min(obb.lenU, obb.lenV) * 0.30));
          const fitsHelipad =
            isPointInPolygon2D(obb.obbCenter.x, obb.obbCenter.y, pts) &&
            isPointInPolygon2D(obb.obbCenter.x + helipadRadius, obb.obbCenter.y, pts) &&
            isPointInPolygon2D(obb.obbCenter.x - helipadRadius, obb.obbCenter.y, pts) &&
            isPointInPolygon2D(obb.obbCenter.x, obb.obbCenter.y + helipadRadius, pts) &&
            isPointInPolygon2D(obb.obbCenter.x, obb.obbCenter.y - helipadRadius, pts);

          if (fitsHelipad) {
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
          }

          // 건물 주축 방향 남향 태양광 패널 그리드
          if (obb.lenU >= 16.0 && obb.lenV >= 14.0) {
            const panelCols = Math.max(2, Math.min(4, Math.floor(obb.lenU / 6.0)));
            const panelRows = 2;
            const spacingX = 2.8;
            const spacingZ = 2.0;

            const solarCenterX = obb.obbCenter.x - obb.dirU.x * (obb.lenU * 0.28);
            const solarCenterZ = obb.obbCenter.y - obb.dirU.y * (obb.lenU * 0.28);
            const bAngle = Math.atan2(obb.dirU.y, obb.dirU.x);

            tempEuler.set(-15 * (Math.PI / 180), bAngle, 0, 'YXZ');
            tempQuat.setFromEuler(tempEuler);
            tempScale.set(1.0, 1.0, 1.0);

            for (let r = 0; r < panelRows; r++) {
              for (let c = 0; c < panelCols; c++) {
                const uOff = (c - (panelCols - 1) * 0.5) * spacingX;
                const vOff = (r - (panelRows - 1) * 0.5) * spacingZ;
                const px = solarCenterX + obb.dirU.x * uOff + obb.dirV.x * vOff;
                const pz = solarCenterZ + obb.dirU.y * uOff + obb.dirV.y * vOff;

                if (isPointInPolygon2D(px, pz, pts)) {
                  tempPos.set(px, wallTop + 0.45 + r * 0.12, pz);
                  tempMat.compose(tempPos, tempQuat, tempScale);
                  solarMatrices.push(tempMat.clone());
                }
              }
            }
          }
        }

        // 7. [아파트 및 상업/오피스 옥상: 대형 HVAC 실외기(냉각탑) 유닛 블록 건물 방향 정렬 배치]
        if ((cls.category === 'commercial' || cls.category === 'curtainwall' || (cls.category === 'apartment' && totalH >= 18.0)) && approxArea >= 120) {
          const nHvac = approxArea >= 350 ? 2 : 1;
          for (let h = 0; h < nHvac; h++) {
            const hDist = (h - (nHvac - 1) * 0.5) * 4.5;
            const hx = obb.obbCenter.x + obb.dirU.x * hDist + obb.dirV.x * (obb.lenV * 0.16);
            const hz = obb.obbCenter.y + obb.dirU.y * hDist + obb.dirV.y * (obb.lenV * 0.16);
            if (isPointInPolygon2D(hx, hz, pts)) {
              tempPos.set(hx, wallTop, hz);
              tempEuler.set(0, Math.atan2(obb.dirU.y, obb.dirU.x), 0, 'YXZ');
              tempQuat.setFromEuler(tempEuler);
              tempScale.set(1.0, 1.0, 1.0);
              tempMat.compose(tempPos, tempQuat, tempScale);
              hvacMatrices.push(tempMat.clone());
            }
          }
        }

        // 8. [아파트 및 상업/오피스: 건물 주축 방향 정렬 남향 태양광 패널 그리드]
        if ((cls.category === 'commercial' || cls.category === 'apartment') && totalH >= 15.0 && approxArea >= 200 && obb.lenU >= 14.0) {
          const panelCols = Math.max(2, Math.min(4, Math.floor(obb.lenU / 6.0)));
          const panelRows = 2;
          const spacingX = 2.6;
          const spacingZ = 1.8;
          const solarCenterX = obb.obbCenter.x - obb.dirU.x * (obb.lenU * 0.22);
          const solarCenterZ = obb.obbCenter.y - obb.dirU.y * (obb.lenU * 0.22);
          const bAngle = Math.atan2(obb.dirU.y, obb.dirU.x);

          tempEuler.set(-15 * (Math.PI / 180), bAngle, 0, 'YXZ');
          tempQuat.setFromEuler(tempEuler);
          tempScale.set(1.0, 1.0, 1.0);

          for (let r = 0; r < panelRows; r++) {
            for (let c = 0; c < panelCols; c++) {
              const uOff = (c - (panelCols - 1) * 0.5) * spacingX;
              const vOff = (r - (panelRows - 1) * 0.5) * spacingZ;
              const px = solarCenterX + obb.dirU.x * uOff + obb.dirV.x * vOff;
              const pz = solarCenterZ + obb.dirU.y * uOff + obb.dirV.y * vOff;
              if (isPointInPolygon2D(px, pz, pts)) {
                tempPos.set(px, wallTop + 0.45 + r * 0.12, pz);
                tempMat.compose(tempPos, tempQuat, tempScale);
                solarMatrices.push(tempMat.clone());
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
    let newMasterMesh: THREE.Mesh | null = null;
    let newHelipadUnifiedMesh: THREE.Mesh | null = null;
    let newWaterTankMesh: THREE.InstancedMesh | null = null;
    let newVentMesh: THREE.InstancedMesh | null = null;
    let newSolarMesh: THREE.InstancedMesh | null = null;
    let newHvacMesh: THREE.InstancedMesh | null = null;
    let newContactShadowMesh: THREE.Mesh | null = null;

    if (masterPositions.length > 0) {
      // [2) 법선 벡터 기반 정점 컬러 / UV 매핑 분리]
      // 건물 옆면(외벽) 법선 벡터(normal.z < 0.5)에는 밝은 아이보리/화이트 콘크리트(#f8fafc) 및 창문 격자 색상,
      // 오직 건물 최상단 수평면(normal.z >= 0.5)에만 초록색 우레탄 옥상(#15803d)이나 슬레이트 회색(#334155) 정밀 부여
      for (let i = 0; i < masterNormals.length; i += 3) {
        const ny = masterNormals[i + 1]; // 로컬 y축 법선 = 회전 후 월드 z축 법선
        if (Math.abs(ny) < 0.5) {
          masterColors[i] = Math.max(masterColors[i], 0.95);
          masterColors[i + 1] = Math.max(masterColors[i + 1], 0.95);
          masterColors[i + 2] = Math.max(masterColors[i + 2], 0.95);
        }
      }

      const masterGeo = new THREE.BufferGeometry();
      masterGeo.setAttribute('position', new THREE.Float32BufferAttribute(masterPositions, 3));
      masterGeo.setAttribute('normal', new THREE.Float32BufferAttribute(masterNormals, 3));
      masterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(masterUvs, 2));
      masterGeo.setAttribute('color', new THREE.Float32BufferAttribute(masterColors, 3));
      masterGeo.computeBoundingSphere();

      if (!this.masterAtlasMaterial) {
        this.masterAtlasMaterial = getKoreanCityAtlasMaterial();
      }

      const fallbackMat = this.realisticCityMaterial || this.masterAtlasMaterial;
      if (fallbackMat) {
        newMasterMesh = new THREE.Mesh(masterGeo, fallbackMat);
        newMasterMesh.castShadow = true;
        newMasterMesh.receiveShadow = true;
        newMasterMesh.frustumCulled = false;
        console.log('[LOD2BuildingEngine] newMasterMesh created! Vertices =', masterPositions.length / 3);
      } else {
        console.warn('[LOD2BuildingEngine] master material is NULL!');
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

    // [단일 배칭 최적화] 헬리패드 베이스/황색 링/백색 H 마크를 정점 컬러 단일 BufferGeometry로 일괄 병합 (Draw Call 1회로 극소화)
    const helipadParts: THREE.BufferGeometry[] = [];
    const colorizeGeo = (geo: THREE.BufferGeometry, r: number, g: number, b: number) => {
      const nonIdx = geo.index ? geo.toNonIndexed() : geo.clone();
      const count = nonIdx.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      nonIdx.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return nonIdx;
    };

    for (const bg of helipadBaseGeometries) {
      helipadParts.push(colorizeGeo(bg, 0.08, 0.45, 0.22));
    }
    for (const rg of helipadRingGeometries) {
      helipadParts.push(colorizeGeo(rg, 0.92, 0.82, 0.12));
    }
    for (const mg of helipadMarkGeometries) {
      helipadParts.push(colorizeGeo(mg, 0.95, 0.95, 0.95));
    }

    if (helipadParts.length > 0) {
      const mergedHelipad = safeMerge(helipadParts);
      if (mergedHelipad) {
        mergedHelipad.computeBoundingSphere();
        if (!this.helipadUnifiedMaterial) {
          this.helipadUnifiedMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.55,
            metalness: 0.2,
            side: THREE.DoubleSide,
          });
        }
        newHelipadUnifiedMesh = new THREE.Mesh(mergedHelipad, this.helipadUnifiedMaterial);
        newHelipadUnifiedMesh.frustumCulled = false;
      }
    }

    // 아파트 옥상 STS 원통형 물탱크
    if (waterTankMatrices.length > 0 && this.materials?.waterTankMaterial && LOD2BuildingEngine.unitWaterTankGeo) {
      newWaterTankMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitWaterTankGeo,
        this.materials.waterTankMaterial,
        waterTankMatrices.length
      );
      for (let i = 0; i < waterTankMatrices.length; i++) {
        newWaterTankMesh.setMatrixAt(i, waterTankMatrices[i]);
      }
      newWaterTankMesh.instanceMatrix.needsUpdate = true;
      newWaterTankMesh.computeBoundingSphere();
      newWaterTankMesh.frustumCulled = false;
    }

    // 옥상 환기 벤트
    if (ventMatrices.length > 0 && this.materials?.ventHvacMaterial && LOD2BuildingEngine.unitVentGeo) {
      newVentMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitVentGeo,
        this.materials.ventHvacMaterial,
        ventMatrices.length
      );
      for (let i = 0; i < ventMatrices.length; i++) {
        newVentMesh.setMatrixAt(i, ventMatrices[i]);
      }
      newVentMesh.instanceMatrix.needsUpdate = true;
      newVentMesh.computeBoundingSphere();
      newVentMesh.frustumCulled = false;
    }

    // 사각 태양광 패널 그리드
    if (solarMatrices.length > 0 && this.materials?.solarPanelMaterial && LOD2BuildingEngine.unitSolarGeo) {
      newSolarMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitSolarGeo,
        this.materials.solarPanelMaterial,
        solarMatrices.length
      );
      for (let i = 0; i < solarMatrices.length; i++) {
        newSolarMesh.setMatrixAt(i, solarMatrices[i]);
      }
      newSolarMesh.instanceMatrix.needsUpdate = true;
      newSolarMesh.computeBoundingSphere();
      newSolarMesh.frustumCulled = false;
    }

    // 대형 HVAC 실외기(냉각탑) 인스턴싱 메쉬
    if (hvacMatrices.length > 0 && this.materials?.ventHvacMaterial && LOD2BuildingEngine.unitHvacGeo) {
      newHvacMesh = new THREE.InstancedMesh(
        LOD2BuildingEngine.unitHvacGeo,
        this.materials.ventHvacMaterial,
        hvacMatrices.length
      );
      for (let i = 0; i < hvacMatrices.length; i++) {
        newHvacMesh.setMatrixAt(i, hvacMatrices[i]);
      }
      newHvacMesh.instanceMatrix.needsUpdate = true;
      newHvacMesh.computeBoundingSphere();
      newHvacMesh.frustumCulled = false;
    }

    // [지면 접지 그림자 및 실시간 태양광 투영 그림자 메쉬]
    if (shadowPositions.length > 0 && this.contactShadowMaterial) {
      const shadowGeo = new THREE.BufferGeometry();
      shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));
      shadowGeo.setAttribute('color', new THREE.Float32BufferAttribute(shadowColors, 4));
      shadowGeo.computeBoundingSphere();
      newContactShadowMesh = new THREE.Mesh(shadowGeo, this.contactShadowMaterial);
      newContactShadowMesh.frustumCulled = false;
      newContactShadowMesh.renderOrder = -1;
    }

    // [Double Buffering 원자적 교체 (Atomic Swap)]
    // 신규 메쉬가 준비되었을 때만 이전 메쉬를 교체하여 0ms 무깜빡임 유지
    const oldMeshes = [
      this.masterCityMesh,
      this.helipadUnifiedMesh,
      this.waterTankInstancedMesh,
      this.ventInstancedMesh,
      this.solarPanelInstancedMesh,
      this.hvacInstancedMesh,
      this.contactShadowMesh,
    ];

    if (newContactShadowMesh) {
      this.contactShadowMesh = newContactShadowMesh;
      this.scene.add(this.contactShadowMesh);
    }
    if (newMasterMesh) {
      this.masterCityMesh = newMasterMesh;
      this.scene.add(this.masterCityMesh);
    }
    if (newHelipadUnifiedMesh) {
      this.helipadUnifiedMesh = newHelipadUnifiedMesh;
      this.scene.add(this.helipadUnifiedMesh);
    }
    if (newWaterTankMesh) {
      this.waterTankInstancedMesh = newWaterTankMesh;
      this.scene.add(this.waterTankInstancedMesh);
    }
    if (newVentMesh) {
      this.ventInstancedMesh = newVentMesh;
      this.scene.add(this.ventInstancedMesh);
    }
    if (newSolarMesh) {
      this.solarPanelInstancedMesh = newSolarMesh;
      this.scene.add(this.solarPanelInstancedMesh);
    }
    if (newHvacMesh) {
      this.hvacInstancedMesh = newHvacMesh;
      this.scene.add(this.hvacInstancedMesh);
    }

    // [1) Three.js 절두체 컬링(Frustum Culling) 100% 강제 해제]
    // 카메라 피치(Pitch)나 방위각(Bearing) 조작 시 건물이 통째로 사라지는 현상 원천 차단
    this.scene.traverse((obj) => {
      (obj as any).frustumCulled = false;
    });

    // 구형 메쉬 안전 제거 및 GPU 메모리 해제
    for (const old of oldMeshes) {
      if (
        old &&
        old !== this.masterCityMesh &&
        old !== this.helipadUnifiedMesh &&
        old !== this.waterTankInstancedMesh &&
        old !== this.ventInstancedMesh &&
        old !== this.solarPanelInstancedMesh &&
        old !== this.hvacInstancedMesh &&
        old !== this.contactShadowMesh
      ) {
        this.scene.remove(old);
        if ((old as any).geometry) {
          (old as any).geometry.dispose();
        }
        if (typeof (old as any).dispose === 'function') {
          (old as any).dispose();
        }
      }
    }

    if (this.map && this.isVisible && !this.isInteracting) {
      this.updateZoomLOD(this.map.getZoom());
      this.map.triggerRepaint();
    }
  }

  /**
   * [3단계: Web Worker 수신 데이터 즉시 GPU 업로드]
   * Worker에서 계산된 순수 Float32Array 버퍼(Transferable Objects)를 메인 스레드 0ms로 GPU에 직접 반영
   */
  private applyWorkerResult(result: BuildBuildingsResult | OSMGeometryResult): void {
    if (!result || !result.positions || result.positions.length === 0) return;

    if (!this.realisticCityMaterial) {
      this.initMaterials();
    }

    const masterGeo = new THREE.BufferGeometry();
    masterGeo.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
    masterGeo.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3));
    masterGeo.setAttribute('uv', new THREE.BufferAttribute(result.uvs, 2));
    masterGeo.setAttribute('color', new THREE.BufferAttribute(result.colors, 3));
    if (result.buildingData && result.buildingData.length > 0) {
      masterGeo.setAttribute('aBuildingData', new THREE.BufferAttribute(result.buildingData, 4));
    }
    if (result.demCoords && result.demCoords.length > 0) {
      masterGeo.setAttribute('aDemCoord', new THREE.BufferAttribute(result.demCoords, 2));
    }
    masterGeo.computeBoundingSphere();

    if (this.masterCityMesh) {
      this.scene.remove(this.masterCityMesh);
      if (this.masterCityMesh.geometry) {
        this.masterCityMesh.geometry.dispose();
      }
    }

    const mat =
      this.realisticCityMaterial ||
      this.masterAtlasMaterial ||
      getKoreanCityAtlasMaterial() ||
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.6,
      });
    this.masterCityMesh = new THREE.Mesh(masterGeo, mat);
    this.masterCityMesh.castShadow = true;
    this.masterCityMesh.receiveShadow = true;
    (this.masterCityMesh as any).frustumCulled = false;
    this.scene.add(this.masterCityMesh);

    // [3단계: GPU Terrain Clamping] DEM 표고 데이터텍스처 셰이더 바인딩
    if (result.demBounds) {
      this.updateDemTexture(result.demBounds);
    }

    // 지면 접지 그림자 메쉬
    if (result.shadowPositions && result.shadowPositions.length > 0 && this.contactShadowMaterial) {
      const shadowGeo = new THREE.BufferGeometry();
      shadowGeo.setAttribute('position', new THREE.BufferAttribute(result.shadowPositions, 3));
      shadowGeo.setAttribute('color', new THREE.BufferAttribute(result.shadowColors, 4));
      shadowGeo.computeBoundingSphere();

      if (this.contactShadowMesh) {
        this.scene.remove(this.contactShadowMesh);
        if (this.contactShadowMesh.geometry) {
          this.contactShadowMesh.geometry.dispose();
        }
      }

      this.contactShadowMesh = new THREE.Mesh(shadowGeo, this.contactShadowMaterial);
      (this.contactShadowMesh as any).frustumCulled = false;
      this.contactShadowMesh.renderOrder = -1;
      this.scene.add(this.contactShadowMesh);
    }

    this.buildingCount = result.buildingCount;
    this.setOpacity(this.opacity);
    this.setStyleMode(this.styleMode);
    this.updateZoomLOD(this.currentZoomLOD);
    if (this.map && this.isVisible && !this.isInteracting) {
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

    // 줌 13.5 미만 광역 뷰에서는 Three.js 렌더링 패스 완전 스킵 (초경량 GPU Extrusion 레이어가 전담)
    if (this.map) {
      const zoom = this.map.getZoom();
      if (zoom < 13.5) {
        return;
      }
    }

    try {
      const rawMatrix =
        options?.defaultProjectionData?.mainMatrix ||
        options?.modelViewProjectionMatrix ||
        options;
      if (!rawMatrix) return;

      // DEM 표고 실시간 적응 (초기 로드 후 DEM 타일 수신 시 자동 재스냅 - 회전/이동 중에는 고도 쿼리 스킵)
      if (!this.isInteracting && this.map) {
        // [3단계: GPU Terrain Clamping] DEM 과장율 실시간 동기화
        if (this.realisticCityMaterial) {
          const terrain = (this.map as any)?.painter?.terrain;
          if (terrain && Number.isFinite(terrain.exaggeration)) {
            if (this.realisticCityMaterial.uniforms.uDemExaggeration.value !== terrain.exaggeration) {
              this.realisticCityMaterial.uniforms.uDemExaggeration.value = terrain.exaggeration;
            }
          }
        }

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
      // [1) 메르카토르 Z축 스케일 보정] center 기준 고도 0에서의 순수 메르카토르 미터 스케일
      const meterScale = maplibregl.MercatorCoordinate.fromLngLat(
        this.originLngLat,
        0
      ).meterInMercatorCoordinateUnits();

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
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

      if (gl) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      }
      try {
        (this.renderer.state as any).buffers?.depth?.setTest(true);
      } catch {}

      // [1) Three.js 절두체 컬링 재확인 - 카메라 피치/방위각 조작 시 소실 방지]
      this.scene.traverse((obj) => {
        (obj as any).frustumCulled = false;
      });

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

    if (this.helipadUnifiedMesh) {
      this.scene.remove(this.helipadUnifiedMesh);
      if (this.helipadUnifiedMesh.geometry) {
        this.helipadUnifiedMesh.geometry.dispose();
      }
      this.helipadUnifiedMesh = null;
    }

    // 인스턴싱 메쉬 해제
    const instanced = [
      this.waterTankInstancedMesh,
      this.ventInstancedMesh,
      this.solarPanelInstancedMesh,
      this.hvacInstancedMesh,
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
    this.hvacInstancedMesh = null;

    if (this.contactShadowMesh) {
      this.scene.remove(this.contactShadowMesh);
      if (this.contactShadowMesh.geometry) {
        this.contactShadowMesh.geometry.dispose();
      }
      this.contactShadowMesh = null;
    }
  }

  /**
   * 레이어 해제 및 전체 GPU 메모리 완전 반환
   */
  onRemove(): void {
    this.clearMeshes();

    disposeVWorldAtlas();
    disposeKoreanCityAtlas();
    disposeKoreanBuildingMaterials();
    this.materials = null;
    this.masterAtlasMaterial = null;

    if (this.realisticCityMaterial) {
      this.realisticCityMaterial.dispose();
      this.realisticCityMaterial = null;
    }
    if (this.helipadUnifiedMaterial) {
      this.helipadUnifiedMaterial.dispose();
      this.helipadUnifiedMaterial = null;
    }
    if (this.contactShadowMaterial) {
      this.contactShadowMaterial.dispose();
      this.contactShadowMaterial = null;
    }
    if (this.threeDemTexture) {
      this.threeDemTexture.dispose();
      this.threeDemTexture = null;
    }

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

    this.chunkMeshCache.clear();
    this.scene.clear();
    this.renderer = null;
    this.map = null;
  }
}
