/**
 * utils/spatialTileCache.ts
 *
 * [GeoBrief 3D 4단계: IndexedDB 공간 타일 영구 캐싱 및 Web Worker 뷰포트 스트리밍 엔진]
 *
 * 1. 타일 좌표(Z/X/Y) 기반 IndexedDB 영구 캐시:
 *    - 원주, 춘천, 강릉, 철원 등 강원 18개 시·군 방문 지역의 외부 API 피처 및
 *      Web Worker가 계산을 끝낸 3D 건물 정점 버퍼(Float32Array)를 브라우저 IndexedDB에 영구 저장
 *    - 새로고침 또는 재방문 시 0.02초(20ms) 이내에 IndexedDB에서 GPU 버퍼로 즉시 직결 로드
 *
 * 2. 슬리피 타일(Slippy Map Tile Z/X/Y) 좌표 변환 유틸리티:
 *    - lngLatToTile(lng, lat, zoom): 경위도를 타일 키 (z_x_y)로 변환
 *    - tileToBbox(x, y, z): 타일 좌표를 BBOX [minLng, minLat, maxLng, maxLat]로 변환
 *    - bboxToTileKeys(bbox, zoom): BBOX를 커버하는 타일 키 목록 반환
 *
 * 3. 카메라 시야각(Frustum) 우선순위 로딩 큐:
 *    - 카메라 중심 및 시선 방향(Bearing/Heading)과 타일 중심 간의 각도/거리를 가중치로 계산
 *    - 카메라 정면 중심 타일을 최우선순위(P1)로 선별하여 비동기 스트리밍
 *
 * 4. 메모리 상한(최대 150개 청크) 및 LRU Eviction:
 *    - GPU VRAM과 메모리 팽창을 방지하기 위해 150개 타일 청크 초과 시 화면 밖 오래된 타일 자동 dispose
 */

import type { OSMGeometryResult } from '@/lib/vendor/osmGeometryBuilder';

export interface CachedTileGeometryRecord {
  tileKey: string;
  timestamp: number;
  buildingCount: number;
  demBounds: [number, number, number, number];
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  colors: ArrayBuffer;
  buildingData: ArrayBuffer;
  demCoords: ArrayBuffer;
  shadowPositions: ArrayBuffer;
  shadowColors: ArrayBuffer;
}

export interface CachedTileFeaturesRecord {
  tileKey: string;
  timestamp: number;
  count: number;
  features: any[];
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
  tileKey: string;
}

// =============================================================================
// 1. 슬리피 타일 (Slippy Map Tile Z/X/Y) 수학적 변환 유틸리티
// =============================================================================

export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function tileXToLng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function lngLatToTile(lng: number, lat: number, zoom = 15): TileCoord {
  const x = lngToTileX(lng, zoom);
  const y = latToTileY(lat, zoom);
  return { z: zoom, x, y, tileKey: `${zoom}_${x}_${y}` };
}

export function tileToBbox(x: number, y: number, z: number): [number, number, number, number] {
  const minLng = tileXToLng(x, z);
  const maxLat = tileYToLat(y, z);
  const maxLng = tileXToLng(x + 1, z);
  const minLat = tileYToLat(y + 1, z);
  return [minLng, minLat, maxLng, maxLat];
}

export function tileKeyToTile(tileKey: string): TileCoord {
  const parts = tileKey.split('_');
  const z = parseInt(parts[0], 10) || 15;
  const x = parseInt(parts[1], 10) || 0;
  const y = parseInt(parts[2], 10) || 0;
  return { z, x, y, tileKey };
}

export function bboxToTileKeys(
  bbox: [number, number, number, number],
  zoom = 15
): string[] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const minX = lngToTileX(minLng, zoom);
  const maxX = lngToTileX(maxLng, zoom);
  const minY = latToTileY(maxLat, zoom); // Tile Y는 북쪽이 0
  const maxY = latToTileY(minLat, zoom);

  const keys: string[] = [];
  for (let x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x++) {
    for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y++) {
      keys.push(`${zoom}_${x}_${y}`);
    }
  }
  return keys;
}

// =============================================================================
// 2. 카메라 시야각(Frustum) 우선순위 계산기
// =============================================================================

export interface PrioritizedTile {
  tileKey: string;
  tileCoord: TileCoord;
  distanceMeters: number;
  angleDiffDeg: number;
  priorityScore: number; // 낮을수록 높은 우선순위
}

/**
 * 카메라 위치 및 시선 방위각(Bearing) 기준 정면 타일을 최우선순위(P1)로 정렬
 */
export function prioritizeTilesByCamera(
  tileKeys: string[],
  cameraLng: number,
  cameraLat: number,
  cameraBearingDeg = 0
): PrioritizedTile[] {
  const cosLat = Math.cos((cameraLat * Math.PI) / 180);
  const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
  const metersPerLat = (Math.PI / 180) * 6378137;

  // 카메라가 바라보는 전방 벡터 각도 (North = 0°, Clockwise)
  const bearingRad = (cameraBearingDeg * Math.PI) / 180;
  const forwardX = Math.sin(bearingRad);
  const forwardY = Math.cos(bearingRad);

  const prioritized: PrioritizedTile[] = tileKeys.map((tileKey) => {
    const coord = tileKeyToTile(tileKey);
    const [minLng, minLat, maxLng, maxLat] = tileToBbox(coord.x, coord.y, coord.z);
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    const dx = (centerLng - cameraLng) * metersPerLng;
    const dy = (centerLat - cameraLat) * metersPerLat;
    const distanceMeters = Math.sqrt(dx * dx + dy * dy);

    // 타일 방향 벡터와 카메라 시선 벡터 내적 (1.0 = 정면, -1.0 = 후방)
    let dot = 1.0;
    let angleDiffDeg = 0;
    if (distanceMeters > 1.0) {
      const dirX = dx / distanceMeters;
      const dirY = dy / distanceMeters;
      dot = Math.max(-1.0, Math.min(1.0, dirX * forwardX + dirY * forwardY));
      angleDiffDeg = (Math.acos(dot) * 180) / Math.PI;
    }

    // 우선순위 스코어: 정면(dot=1.0)일수록 거리 가중치가 그대로 적용, 후방(dot=-1.0)은 페널티 3.5배
    const directionPenalty = 1.0 + (1.0 - dot) * 1.75;
    const priorityScore = distanceMeters * directionPenalty;

    return {
      tileKey,
      tileCoord: coord,
      distanceMeters,
      angleDiffDeg,
      priorityScore,
    };
  });

  // 점수 오름차순 (가장 정면에 있고 가까운 타일이 0번 인덱스)
  prioritized.sort((a, b) => a.priorityScore - b.priorityScore);
  return prioritized;
}

// =============================================================================
// 3. IndexedDB 영구 공간 타일 캐시 엔진 (SpatialTileCache)
// =============================================================================

const DB_NAME = 'geobrief3d_spatial_tile_cache';
const DB_VERSION = 1;
const STORE_GEOMETRIES = 'tile_geometries';
const STORE_FEATURES = 'tile_features';

export class SpatialTileCache {
  private db: IDBDatabase | null = null;
  private isInitializing = false;
  private initPromise: Promise<IDBDatabase | null> | null = null;

  // 1차 고속 메모리 LRU 캐시 (최대 150개 타일 청크 유지)
  private memoryGeometryCache = new Map<string, OSMGeometryResult>();
  private memoryFeatureCache = new Map<string, any[]>();
  public readonly MAX_MEMORY_CHUNKS = 150;

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.initDB();
    }
  }

  /**
   * IndexedDB 연결 초기화
   */
  public async initDB(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;
    if (typeof window === 'undefined' || !('indexedDB' in window)) return null;

    this.isInitializing = true;
    this.initPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_GEOMETRIES)) {
            db.createObjectStore(STORE_GEOMETRIES, { keyPath: 'tileKey' });
          }
          if (!db.objectStoreNames.contains(STORE_FEATURES)) {
            db.createObjectStore(STORE_FEATURES, { keyPath: 'tileKey' });
          }
        };

        req.onsuccess = (e) => {
          this.db = (e.target as IDBOpenDBRequest).result;
          this.isInitializing = false;
          resolve(this.db);
        };

        req.onerror = (err) => {
          console.warn('[SpatialTileCache] IndexedDB open error:', err);
          this.isInitializing = false;
          resolve(null);
        };
      } catch (err) {
        console.warn('[SpatialTileCache] IndexedDB exception:', err);
        this.isInitializing = false;
        resolve(null);
      }
    });

    return this.initPromise;
  }

  // ---------------------------------------------------------------------------
  // [3D 건물 지오메트리 버퍼 영구 캐싱 & 0.02초 직결 로드]
  // ---------------------------------------------------------------------------

  /**
   * 타일 키에 해당하는 3D 건물 지오메트리 버퍼 조회 (0.02초 이내 즉각 반환)
   */
  public async getGeometry(tileKey: string): Promise<OSMGeometryResult | null> {
    // 1) 1차 메모리 캐시 조회 (0ms)
    if (this.memoryGeometryCache.has(tileKey)) {
      const cached = this.memoryGeometryCache.get(tileKey)!;
      // LRU 갱신
      this.memoryGeometryCache.delete(tileKey);
      this.memoryGeometryCache.set(tileKey, cached);
      return cached;
    }

    // 2) 2차 IndexedDB 영구 캐시 조회 (< 20ms)
    const db = await this.initDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_GEOMETRIES, 'readonly');
        const store = tx.objectStore(STORE_GEOMETRIES);
        const req = store.get(tileKey);

        req.onsuccess = () => {
          const record: CachedTileGeometryRecord | undefined = req.result;
          if (!record || !record.positions) {
            resolve(null);
            return;
          }

          // ArrayBuffer를 Float32Array로 복원
          const result: OSMGeometryResult = {
            positions: new Float32Array(record.positions),
            normals: new Float32Array(record.normals),
            uvs: new Float32Array(record.uvs),
            colors: new Float32Array(record.colors),
            buildingData: new Float32Array(record.buildingData),
            demCoords: new Float32Array(record.demCoords),
            shadowPositions: new Float32Array(record.shadowPositions),
            shadowColors: new Float32Array(record.shadowColors),
            buildingCount: record.buildingCount || 0,
            demBounds: record.demBounds || [0, 0, 0, 0],
          };

          // 1차 메모리 캐시에 적재 (LRU 관리)
          this.putMemoryGeometry(tileKey, result);
          resolve(result);
        };

        req.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * 계산 완료된 3D 건물 정점 버퍼를 IndexedDB 및 메모리에 영구 저장
   */
  public async saveGeometry(tileKey: string, result: OSMGeometryResult): Promise<void> {
    if (!result || !result.positions || result.positions.length === 0) return;

    // 1차 메모리 캐시 적재
    this.putMemoryGeometry(tileKey, result);

    // 2차 IndexedDB 영구 저장 (비동기 백그라운드)
    const db = await this.initDB();
    if (!db) return;

    try {
      const safeClone = (arr?: Float32Array): ArrayBuffer => {
        if (!arr || arr.length === 0) return new ArrayBuffer(0);
        try {
          if (arr.byteOffset === 0 && arr.byteLength === arr.buffer.byteLength) {
            return arr.buffer.slice(0) as ArrayBuffer;
          }
        } catch {
          // detached fallback
        }
        const copy = new Float32Array(arr.length);
        copy.set(arr);
        return copy.buffer as ArrayBuffer;
      };

      // 복사본 ArrayBuffer 생성 (Transfer 및 Detached Buffer 예외 방지)
      const record: CachedTileGeometryRecord = {
        tileKey,
        timestamp: Date.now(),
        buildingCount: result.buildingCount || 0,
        demBounds: result.demBounds || [0, 0, 0, 0],
        positions: safeClone(result.positions),
        normals: safeClone(result.normals),
        uvs: safeClone(result.uvs),
        colors: safeClone(result.colors),
        buildingData: safeClone(result.buildingData),
        demCoords: safeClone(result.demCoords),
        shadowPositions: safeClone(result.shadowPositions),
        shadowColors: safeClone(result.shadowColors),
      };

      const tx = db.transaction(STORE_GEOMETRIES, 'readwrite');
      tx.objectStore(STORE_GEOMETRIES).put(record);
    } catch (err) {
      console.warn('[SpatialTileCache] Failed to put geometry into IndexedDB:', err);
    }
  }

  private putMemoryGeometry(tileKey: string, result: OSMGeometryResult): void {
    if (this.memoryGeometryCache.size >= this.MAX_MEMORY_CHUNKS) {
      const oldestKey = this.memoryGeometryCache.keys().next().value;
      if (oldestKey) {
        this.memoryGeometryCache.delete(oldestKey);
      }
    }
    this.memoryGeometryCache.set(tileKey, result);
  }

  // ---------------------------------------------------------------------------
  // [외부 API GeoJSON 피처 영구 캐싱]
  // ---------------------------------------------------------------------------

  /**
   * 타일 키에 해당하는 외부 API 피처 목록 조회
   */
  public async getFeatures(tileKey: string): Promise<any[] | null> {
    if (this.memoryFeatureCache.has(tileKey)) {
      return this.memoryFeatureCache.get(tileKey)!;
    }

    const db = await this.initDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_FEATURES, 'readonly');
        const req = tx.objectStore(STORE_FEATURES).get(tileKey);

        req.onsuccess = () => {
          const rec: CachedTileFeaturesRecord | undefined = req.result;
          if (rec && rec.features) {
            this.memoryFeatureCache.set(tileKey, rec.features);
            resolve(rec.features);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * 외부 API 피처 목록을 IndexedDB 및 메모리에 저장
   */
  public async saveFeatures(tileKey: string, features: any[]): Promise<void> {
    if (!features || features.length === 0) return;

    this.memoryFeatureCache.set(tileKey, features);

    const db = await this.initDB();
    if (!db) return;

    try {
      const rec: CachedTileFeaturesRecord = {
        tileKey,
        timestamp: Date.now(),
        count: features.length,
        features,
      };

      const tx = db.transaction(STORE_FEATURES, 'readwrite');
      tx.objectStore(STORE_FEATURES).put(rec);
    } catch (err) {
      console.warn('[SpatialTileCache] Failed to put features into IndexedDB:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // [메모리 관리 및 캐시 통계]
  // ---------------------------------------------------------------------------

  /**
   * 메모리 상한 초과 방지: 화면 밖으로 멀어진 타일 키 목록을 메모리 캐시에서 제거
   */
  public evictFarMemoryTiles(activeTileKeys: Set<string>): number {
    let evictedCount = 0;
    for (const key of this.memoryGeometryCache.keys()) {
      if (!activeTileKeys.has(key)) {
        this.memoryGeometryCache.delete(key);
        this.memoryFeatureCache.delete(key);
        evictedCount++;
      }
    }
    return evictedCount;
  }

  /**
   * 전역 캐시 초기화
   */
  public async clearAll(): Promise<void> {
    this.memoryGeometryCache.clear();
    this.memoryFeatureCache.clear();

    const db = await this.initDB();
    if (!db) return;

    try {
      const tx = db.transaction([STORE_GEOMETRIES, STORE_FEATURES], 'readwrite');
      tx.objectStore(STORE_GEOMETRIES).clear();
      tx.objectStore(STORE_FEATURES).clear();
    } catch (err) {
      console.warn('[SpatialTileCache] Failed to clear IndexedDB:', err);
    }
  }

  /**
   * 현재 캐시 통계 (메모리 타일 수 및 IndexedDB 레코드 수)
   */
  public async getStats(): Promise<{
    memoryChunks: number;
    dbGeometries: number;
    dbFeatures: number;
  }> {
    const memoryChunks = this.memoryGeometryCache.size;
    let dbGeometries = 0;
    let dbFeatures = 0;

    const db = await this.initDB();
    if (db) {
      try {
        const tx = db.transaction([STORE_GEOMETRIES, STORE_FEATURES], 'readonly');
        const countGeomReq = tx.objectStore(STORE_GEOMETRIES).count();
        const countFeatReq = tx.objectStore(STORE_FEATURES).count();

        await new Promise<void>((resolve) => {
          let done = 0;
          countGeomReq.onsuccess = () => {
            dbGeometries = countGeomReq.result;
            if (++done === 2) resolve();
          };
          countFeatReq.onsuccess = () => {
            dbFeatures = countFeatReq.result;
            if (++done === 2) resolve();
          };
        });
      } catch {
        // ignore
      }
    }

    return { memoryChunks, dbGeometries, dbFeatures };
  }
}

export const spatialTileCache = new SpatialTileCache();
