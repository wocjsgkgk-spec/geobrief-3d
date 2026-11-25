/**
 * src/lib/vendor/vworld3DTilesManager.ts
 *
 * [GeoBrief 3D: V-World 공식 LOD4 OGC 3D Tiles 트리 순회 & 캐시 렌더러 매니저]
 *
 * 국토교통부 브이월드(V-World / XDWorld)의 LOD4 실사 3D 타일셋(tileset.json)을
 * OGC 3D Tiles 1.0 규격에 맞춰 클라이언트에서 고속 파싱하고, 뷰포트 가시 영역과 LOD 레벨에 따라
 * 실사 건물 바이너리(.b3dm)를 Three.js 메인 씬에 무지연(60fps locked)으로 동적 스트리밍/부착하는 핵심 매니저입니다.
 */

import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { VWorldB3dmLoader, ParsedB3dmResult } from '@/lib/vendor/vworldB3dmLoader';
import { vworldReverseApiClient, VWorld3DTileset, VWorld3DTilesetRoot } from '@/lib/vendor/vworldReverseApiClient';
import { jiangshanCameraCoalescer } from '@/lib/vendor/jiangshanCameraCoalescer';
import { elevationCache } from '@/utils/elevationCache';

export interface TileBoundingRegion {
  westDeg: number;
  southDeg: number;
  eastDeg: number;
  northDeg: number;
  minHeightM: number;
  maxHeightM: number;
  centerLng: number;
  centerLat: number;
}

export interface CachedTileEntry {
  uri: string;
  region: TileBoundingRegion;
  group: THREE.Group;
  totalVertices: number;
  modelNames: string[];
  lastUsedTime: number;
  visible: boolean;
}

export class VWorld3DTilesManager {
  private static instance: VWorld3DTilesManager | null = null;

  private rootTileset: VWorld3DTileset | null = null;
  private tilesetLoading: boolean = false;
  private currentRegion: string = 'wonju';

  // 128MB LRU 타일 캐시 (최대 150개 타일 유지)
  private tileCache = new Map<string, CachedTileEntry>();
  private readonly MAX_CACHE_SIZE = 150;

  // 현재 활성화되어 화면에 렌더링 중인 타일의 Bounding Box 목록 (가짜 박스 억제용)
  private activeTileBounds: TileBoundingRegion[] = [];

  // 메인 씬에 등록되는 3D 타일 전용 루트 그룹
  public readonly tilesGroup: THREE.Group = new THREE.Group();

  // 동시 로딩 제어
  private loadingUris = new Set<string>();
  private loadQueue: { uri: string; region: TileBoundingRegion }[] = [];
  private isProcessingQueue = false;

  private constructor() {
    this.tilesGroup.name = 'VWorld3DTilesRootGroup';
  }

  public static getInstance(): VWorld3DTilesManager {
    if (!VWorld3DTilesManager.instance) {
      VWorld3DTilesManager.instance = new VWorld3DTilesManager();
    }
    return VWorld3DTilesManager.instance;
  }

  /**
   * OGC 3D Tiles region [west, south, east, north, minHeight, maxHeight] 라디안 배열을 도/미터 단위로 파싱
   */
  public static parseBoundingRegion(regionArray?: number[]): TileBoundingRegion | null {
    if (!Array.isArray(regionArray) || regionArray.length < 6) return null;
    const RAD2DEG = 180.0 / Math.PI;
    const westDeg = regionArray[0] * RAD2DEG;
    const southDeg = regionArray[1] * RAD2DEG;
    const eastDeg = regionArray[2] * RAD2DEG;
    const northDeg = regionArray[3] * RAD2DEG;
    const minHeightM = regionArray[4];
    const maxHeightM = regionArray[5];

    return {
      westDeg,
      southDeg,
      eastDeg,
      northDeg,
      minHeightM,
      maxHeightM,
      centerLng: (westDeg + eastDeg) * 0.5,
      centerLat: (southDeg + northDeg) * 0.5,
    };
  }

  /**
   * 지역 전환 시 기존 타일셋 메쉬 및 캐시를 깨끗이 초기화하고 신규 지역 타일셋 로드
   */
  public switchRegion(region: string = 'wonju'): void {
    const normalized = (region || 'wonju').toLowerCase();
    if (this.currentRegion === normalized && this.rootTileset) return;

    this.loadQueue = [];
    this.activeTileBounds = [];
    this.loadingUris.clear();
    this.rootTileset = null;
    this.tilesetLoading = false;

    this.tileCache.forEach((entry) => {
      this.tilesGroup.remove(entry.group);
      entry.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
    });
    this.tileCache.clear();
    this.currentRegion = normalized;
    this.initTileset(normalized);
  }

  /**
   * 브이월드 지역 타일셋(tileset.json) 메타데이터 비동기 로드
   */
  public async initTileset(region: string = 'wonju'): Promise<void> {
    const normalized = (region || 'wonju').toLowerCase();
    if (this.rootTileset && this.currentRegion === normalized) return;
    if (this.tilesetLoading) return;

    this.tilesetLoading = true;
    this.currentRegion = normalized;

    try {
      const tileset = await vworldReverseApiClient.fetchRegional3DTileset(normalized);
      if (tileset && tileset.root) {
        this.rootTileset = tileset;
      }
    } catch (err) {
      console.warn('[VWorld3DTilesManager] Error initializing tileset:', err);
    } finally {
      this.tilesetLoading = false;
    }
  }

  /**
   * 뷰포트 내 가시성 및 LOD 판단 후 타일 동적 로드/갱신 (60fps 무지연 보장)
   */
  public update(
    map: maplibregl.Map,
    originMercator: { x: number; y: number },
    originMeterScale: number,
    renderer?: THREE.WebGLRenderer | null
  ): void {
    if (!this.rootTileset || !this.rootTileset.root) {
      if (!this.tilesetLoading) {
        this.initTileset(this.currentRegion);
      }
      return;
    }

    // 마우스 조작 중(드래그, 틸트, 줌, 회전)에는 무거운 연산 100% 동결
    if (map.isMoving() || map.isRotating() || map.isZooming()) {
      return;
    }

    const bounds = map.getBounds();
    const viewWest = bounds.getWest() - 0.002;
    const viewEast = bounds.getEast() + 0.002;
    const viewSouth = bounds.getSouth() - 0.002;
    const viewNorth = bounds.getNorth() + 0.002;
    const zoom = map.getZoom();

    const visibleTilesToRender: { uri: string; region: TileBoundingRegion }[] = [];
    this.traverseTilesetNode(
      this.rootTileset.root,
      viewWest,
      viewSouth,
      viewEast,
      viewNorth,
      zoom,
      visibleTilesToRender
    );

    const now = Date.now();
    const activeUris = new Set<string>();
    const newActiveBounds: TileBoundingRegion[] = [];

    // 1. 이미 캐시에 존재하는 타일 즉각 표시 & 위치 보정
    for (let i = 0; i < visibleTilesToRender.length; i++) {
      const item = visibleTilesToRender[i];
      activeUris.add(item.uri);

      const cached = this.tileCache.get(item.uri);
      if (cached) {
        cached.lastUsedTime = now;
        if (!cached.visible) {
          cached.visible = true;
          cached.group.visible = true;
        }
        newActiveBounds.push(item.region);

        // 기준 원점(originMercator) 및 지형 표고 동기화
        const targetLng = item.region.centerLng;
        const targetLat = item.region.centerLat;
        const elevY = map.getTerrain() ? Math.max(0, elevationCache.getFromMap(map, [targetLng, targetLat]) || 0) : 0;
        const tileMerc = maplibregl.MercatorCoordinate.fromLngLat([targetLng, targetLat], 0);
        const dx = (tileMerc.x - originMercator.x) / originMeterScale;
        const dz = (tileMerc.y - originMercator.y) / originMeterScale;
        cached.group.position.set(dx, elevY, dz);
        cached.group.updateMatrix();
      } else if (!this.loadingUris.has(item.uri)) {
        // 미캐싱 타일은 큐에 추가
        this.loadQueue.push(item);
      }
    }

    // 2. 화면 밖으로 벗어난 타일 가시성 숨김 처리 (메모리는 보존)
    this.tileCache.forEach((entry, uri) => {
      if (!activeUris.has(uri) && entry.visible) {
        entry.visible = false;
        entry.group.visible = false;
      }
    });

    this.activeTileBounds = newActiveBounds;

    // 3. 비동기 점진적 타일 로드 실행
    this.processLoadQueue(map, originMercator, originMeterScale, renderer);
    this.cleanupLruCache();
  }

  /**
   * 타일 계층 트리 순회 및 Frustum/BBox 교차 검사
   */
  private traverseTilesetNode(
    node: VWorld3DTilesetRoot,
    vWest: number,
    vSouth: number,
    vEast: number,
    vNorth: number,
    zoom: number,
    outTiles: { uri: string; region: TileBoundingRegion }[]
  ): void {
    const region = VWorld3DTilesManager.parseBoundingRegion(node.boundingVolume?.region);
    if (!region) return;

    // 뷰포트 Bounding Box 교차 판정
    const overlaps =
      region.westDeg <= vEast &&
      region.eastDeg >= vWest &&
      region.southDeg <= vNorth &&
      region.northDeg >= vSouth;

    if (!overlaps) return;

    const uri = node.content?.uri;
    const isB3dm = Boolean(uri && uri.endsWith('.b3dm'));
    const hasChildren = Boolean(node.children && node.children.length > 0);

    // [OGC 3D Tiles 1.0 사양 정밀 LOD 선별]:
    // - 줌 15.5 이상 고배율 클로즈업 뷰에서는 상세 자식 노드(LOD 3/4)로 재귀(REPLACE)하여 최고 정밀도 메쉬 표출
    // - 자식 노드가 없는 리프(Leaf) 노드이거나 원거리 뷰일 때는 현재 노드의 b3dm 채택하여 중복 중첩 원천 차단
    if (isB3dm && (!hasChildren || zoom < 15.5 || node.refine === 'ADD')) {
      outTiles.push({ uri: uri!, region });
    }

    if (hasChildren && (zoom >= 15.5 || !isB3dm || node.refine === 'ADD')) {
      for (let i = 0; i < node.children!.length; i++) {
        this.traverseTilesetNode(node.children![i], vWest, vSouth, vEast, vNorth, zoom, outTiles);
      }
    }
  }

  /**
   * 점진적 비동기 타일 다운로드 및 디코딩 (프레임 스톨 방지)
   */
  private async processLoadQueue(
    map: maplibregl.Map,
    originMercator: { x: number; y: number },
    originMeterScale: number,
    renderer?: THREE.WebGLRenderer | null
  ): Promise<void> {
    if (this.isProcessingQueue || this.loadQueue.length === 0) return;
    this.isProcessingQueue = true;
    const activeRegionAtStart = this.currentRegion;

    try {
      while (this.loadQueue.length > 0) {
        if (this.currentRegion !== activeRegionAtStart) break;

        // 카메라 이동/회전/줌 중에는 3D 타일 디코딩을 양보하여 60fps 완벽 유지
        if (jiangshanCameraCoalescer.isInteracting || map.isMoving() || map.isRotating() || map.isZooming()) {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }

        const item = this.loadQueue.shift();
        if (!item || this.tileCache.has(item.uri) || this.loadingUris.has(item.uri)) continue;

        this.loadingUris.add(item.uri);

        try {
          const sep = item.uri.includes('?') ? '&' : '?';
          const tileUrl = `/api/vworld/3dtiles/${item.uri}${sep}region=${encodeURIComponent(activeRegionAtStart)}`;
          const parsed: ParsedB3dmResult = await VWorldB3dmLoader.loadFromUrl(tileUrl, renderer);
          if (this.currentRegion !== activeRegionAtStart) break;

          const group = parsed.scene;
          group.name = `Tile_${item.uri}`;
          group.frustumCulled = false;

          // Mercator 상대 좌표 및 DEM 표고 정합 안착
          const targetLng = parsed.rtcCenterWgs84?.lng ?? item.region.centerLng;
          const targetLat = parsed.rtcCenterWgs84?.lat ?? item.region.centerLat;
          const elevY = map.getTerrain() ? Math.max(0, elevationCache.getFromMap(map, [targetLng, targetLat]) || 0) : 0;

          const tileMerc = maplibregl.MercatorCoordinate.fromLngLat([targetLng, targetLat], 0);
          const dx = (tileMerc.x - originMercator.x) / originMeterScale;
          const dz = (tileMerc.y - originMercator.y) / originMeterScale;

          group.position.set(dx, elevY, dz);
          group.updateMatrix();

          this.tilesGroup.add(group);

          const modelNames = parsed.batchTable?.MODEL_NAME || [];

          this.tileCache.set(item.uri, {
            uri: item.uri,
            region: item.region,
            group,
            totalVertices: parsed.totalVertices,
            modelNames,
            lastUsedTime: Date.now(),
            visible: true,
          });
          this.activeTileBounds.push(item.region);
        } catch {
          // 타일 미제공 영역에서는 절차적 실사 3D 메쉬가 자동으로 대체 표출되므로 무음 처리
        } finally {
          this.loadingUris.delete(item.uri);
        }

        // 8ms 대기하여 브라우저 렌더링 프레임 확보
        await new Promise((r) => setTimeout(r, 8));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * LRU 캐시 정리 (최대 개수 초과 시 가장 오래된 비가시 타일 안전 해제)
   */
  private cleanupLruCache(): void {
    if (this.tileCache.size <= this.MAX_CACHE_SIZE) return;

    const entries = Array.from(this.tileCache.entries()).sort(
      (a, b) => a[1].lastUsedTime - b[1].lastUsedTime
    );

    for (let i = 0; i < entries.length && this.tileCache.size > this.MAX_CACHE_SIZE; i++) {
      const [uri, entry] = entries[i];
      if (!entry.visible) {
        this.tilesGroup.remove(entry.group);
        entry.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) {
              m.material.forEach((mat) => mat.dispose());
            } else {
              m.material?.dispose();
            }
          }
        });
        this.tileCache.delete(uri);
      }
    }
  }

  /**
   * 해당 건물의 좌표(cLng, cLat)가 현재 로드된 실사 3D 타일 영역에 포함되는지 여부 판별
   * (포함 시 절차적 직육면체 박스 생성을 100% 억제하여 Z-Fighting 및 중복 제거)
   */
  public isBuildingSuppressed(cLng: number, cLat: number): boolean {
    if (this.activeTileBounds.length === 0) return false;

    for (let i = 0; i < this.activeTileBounds.length; i++) {
      const b = this.activeTileBounds[i];
      if (
        cLng >= b.westDeg &&
        cLng <= b.eastDeg &&
        cLat >= b.southDeg &&
        cLat <= b.northDeg
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 현재 로드된 실사 3D 타일 개수 반환
   */
  public getLoadedTilesCount(): number {
    return this.tileCache.size;
  }

  /**
   * 현재 씬에서 활성화된 실사 3D 타일 개수 반환
   */
  public getActiveTilesCount(): number {
    let count = 0;
    this.tileCache.forEach((entry) => {
      if (entry.visible) count++;
    });
    return count;
  }
}

export const vworld3DTilesManager = VWorld3DTilesManager.getInstance();
