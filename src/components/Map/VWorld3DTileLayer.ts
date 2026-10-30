/**
 * components/Map/VWorld3DTileLayer.ts
 *
 * [GeoBrief 3D 3단계: 브이월드(V-World 3D) 실사 건물·교량·DEM 통합 스트리밍 엔진]
 *
 * 브이월드 역공학 쿼드트리 인덱싱(VWorldQuadtreeIndexer), XDO 바이너리 파서(VWorldXDOParser),
 * 및 DEM 수치표고모델 파서(VWorldDEMParser)를 통합하여, 뷰포트 내 3대 핵심 레이어를
 * 비동기 쿼드트리 청크 단위로 독립적·동시 스트리밍 렌더링합니다:
 *
 *  1. [실사 3D 건축물 (facility_build)]:
 *     - Zoom >= 13: 레벨 14/15 고정밀 실사 입면·외벽 텍스처 메쉬
 *  2. [전국 3D 교량 및 교각 (facility_bridge)]:
 *     - Zoom >= 13: 하천 횡단 대교, 고가교, 인터체인지 입체 교량 상판 및 교각 메쉬
 *  3. [수치표고모델 지형 격자 (dem)]:
 *     - Zoom >= 11: 65x65 고밀도 DEM 지형 표고 와이어프레임 & 고도 메쉬
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import {
  VWorldQuadtreeIndexer,
  VWorldXDOParser,
  VWorldDEMParser,
  VWorldTileBounds,
  VWorldParsedXDO,
  VWorldParsedDEM,
  VWorldWebGLShaderSpec,
} from '@/lib/vendor/vworldReverseSpec';
import { extractCustomLayerMatrix } from '@/utils/customLayerMatrix';
import { elevationCache } from '@/utils/elevationCache';
import { useMapStore } from '@/store/useMapStore';

interface CachedTile {
  key: string;
  layer: 'facility_build' | 'facility_bridge';
  level: number;
  idx: number;
  idy: number;
  group: THREE.Group;
  parsed: VWorldParsedXDO;
  bounds: VWorldTileBounds;
  lastAccessed: number;
}

interface CachedDemTile {
  key: string;
  level: number;
  idx: number;
  idy: number;
  mesh: THREE.Mesh;
  parsed: VWorldParsedDEM;
  bounds: VWorldTileBounds;
  lastAccessed: number;
}

export class VWorld3DTileLayer implements maplibregl.CustomLayerInterface {
  public readonly id = 'vworld-3d-tile-layer';
  public readonly type = 'custom' as const;
  public readonly renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;

  // 3대 서브 레이어 루트 그룹
  private buildingsRootGroup: THREE.Group = new THREE.Group();
  private bridgesRootGroup: THREE.Group = new THREE.Group();
  private demRootGroup: THREE.Group = new THREE.Group();

  // 조명 객체
  private dirLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private ambLight: THREE.AmbientLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;

  // 원점 및 매트릭스 변환
  private originLngLat: [number, number] | null = null;
  private clampedAltitude = 0;
  private renderMatrix = new THREE.Matrix4();
  private localMatrix = new THREE.Matrix4();
  private scaleVector = new THREE.Vector3();
  private rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);

  // 타일 캐시 및 큐 관리
  private buildingTileCache: Map<string, CachedTile> = new Map();
  private bridgeTileCache: Map<string, CachedTile> = new Map();
  private demTileCache: Map<string, CachedDemTile> = new Map();
  private pendingFetches: Set<string> = new Set();

  private activeLevel = 15;
  private maxCachedTiles = 48;
  private isBuildingsVisible = true;
  private isBridgesVisible = true;
  private isDemVisible = false;
  private isDestroyed = false;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.buildingsRootGroup.name = 'VWorld_Buildings_Root';
    this.bridgesRootGroup.name = 'VWorld_Bridges_Root';
    this.demRootGroup.name = 'VWorld_DEM_Root';

    this.scene.add(this.buildingsRootGroup);
    this.scene.add(this.bridgesRootGroup);
    this.scene.add(this.demRootGroup);
  }

  public setVisible(visible: boolean): void {
    this.isBuildingsVisible = visible;
    this.buildingsRootGroup.visible = visible;
    if (this.map) this.map.triggerRepaint();
  }

  public setBuildingsVisible(visible: boolean): void {
    this.isBuildingsVisible = visible;
    this.buildingsRootGroup.visible = visible;
    if (this.map) this.map.triggerRepaint();
    this.scheduleTileUpdate(50);
  }

  public setBridgesVisible(visible: boolean): void {
    this.isBridgesVisible = visible;
    this.bridgesRootGroup.visible = visible;
    if (this.map) this.map.triggerRepaint();
    this.scheduleTileUpdate(50);
  }

  public setDemVisible(visible: boolean): void {
    this.isDemVisible = visible;
    this.demRootGroup.visible = visible;
    if (this.map) this.map.triggerRepaint();
    this.scheduleTileUpdate(50);
  }

  public onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;

    const center = map.getCenter();
    this.originLngLat = [center.lng, center.lat];

    // 브이월드 역공학 셰이더 조명 및 대기 안개 적용
    const lights = VWorldWebGLShaderSpec.applyToScene(this.scene);
    this.dirLight = lights.dirLight;
    this.hemiLight = lights.hemiLight;
    this.ambLight = lights.ambLight;
    this.fillLight = lights.fillLight;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = VWorldWebGLShaderSpec.LIGHTING.toneMapping;
      this.renderer.toneMappingExposure = VWorldWebGLShaderSpec.LIGHTING.exposure;
      this.renderer.shadowMap.enabled = false;
    } catch (err) {
      console.warn('[VWorld3DTileLayer] Renderer init warning:', err);
    }

    // 지도 이동 및 줌 변경 시 뷰포트 쿼드트리 타일 스트리밍 트리거
    map.on('moveend', this.onMapMoveEnd);
    map.on('zoomend', this.onMapMoveEnd);

    // 초기 타일 로드 실행
    this.scheduleTileUpdate(100);
  }

  public onRemove(): void {
    this.isDestroyed = true;
    if (this.moveDebounceTimer) {
      clearTimeout(this.moveDebounceTimer);
      this.moveDebounceTimer = null;
    }

    if (this.map) {
      this.map.off('moveend', this.onMapMoveEnd);
      this.map.off('zoomend', this.onMapMoveEnd);
      this.map = null;
    }

    // 모든 타일 자원 명시적 해제
    this.disposeAllTiles();
  }

  private onMapMoveEnd = (): void => {
    if (this.isDestroyed) return;
    this.scheduleTileUpdate(200);
  };

  private scheduleTileUpdate(delayMs: number): void {
    if (this.moveDebounceTimer) {
      clearTimeout(this.moveDebounceTimer);
    }
    this.moveDebounceTimer = setTimeout(() => {
      this.updateVisibleTiles();
    }, delayMs);
  }

  /**
   * 뷰포트 프러스텀 내의 브이월드 쿼드트리 타일(건물·교량·DEM) 동적 산출 및 스트리밍
   */
  private updateVisibleTiles(): void {
    if (!this.map || this.isDestroyed) return;

    const zoom = this.map.getZoom();

    // 1. [실사 건물 및 교량 스트리밍] 줌 13 이상에서 가동
    if (zoom >= 13.0) {
      const level =
        zoom >= 14.5
          ? VWorldQuadtreeIndexer.LEVEL_BUILDING_LOD3_REALISTIC
          : VWorldQuadtreeIndexer.LEVEL_BUILDING_LOD2;
      this.activeLevel = level;

      const bounds = this.map.getBounds();
      const minLon = bounds.getWest();
      const maxLon = bounds.getEast();
      const minLat = bounds.getSouth();
      const maxLat = bounds.getNorth();

      const tiles = VWorldQuadtreeIndexer.getTilesForBbox([minLon, minLat, maxLon, maxLat], level);
      const center = this.map.getCenter();
      const cLon = center.lng;
      const cLat = center.lat;

      // 카메라 중심 거리 기준 정렬
      tiles.sort((a, b) => {
        const bA = VWorldQuadtreeIndexer.getTileBounds(a.idx, a.idy, level);
        const bB = VWorldQuadtreeIndexer.getTileBounds(b.idx, b.idy, level);
        const distA = Math.hypot(bA.centerLon - cLon, bA.centerLat - cLat);
        const distB = Math.hypot(bB.centerLon - cLon, bB.centerLat - cLat);
        return distA - distB;
      });

      const activeTiles = tiles.slice(0, 12);
      const activeBldgKeys = new Set<string>();
      const activeBridgeKeys = new Set<string>();

      // 건물 스트리밍
      if (this.isBuildingsVisible) {
        this.buildingsRootGroup.visible = true;
        for (const tile of activeTiles) {
          const key = `bldg_${tile.level}_${tile.idx}_${tile.idy}`;
          activeBldgKeys.add(key);

          if (this.buildingTileCache.has(key)) {
            const cached = this.buildingTileCache.get(key)!;
            cached.lastAccessed = Date.now();
            cached.group.visible = true;
          } else {
            this.fetchAndLoadXdoTile('facility_build', tile.level, tile.idx, tile.idy, key);
          }
        }
      } else {
        this.buildingsRootGroup.visible = false;
      }

      // 교량 스트리밍
      if (this.isBridgesVisible) {
        this.bridgesRootGroup.visible = true;
        for (const tile of activeTiles) {
          const key = `bridge_${tile.level}_${tile.idx}_${tile.idy}`;
          activeBridgeKeys.add(key);

          if (this.bridgeTileCache.has(key)) {
            const cached = this.bridgeTileCache.get(key)!;
            cached.lastAccessed = Date.now();
            cached.group.visible = true;
          } else {
            this.fetchAndLoadXdoTile('facility_bridge', tile.level, tile.idx, tile.idy, key);
          }
        }
      } else {
        this.bridgesRootGroup.visible = false;
      }

      // 화면 이탈 타일 가시성 제어
      for (const [key, cached] of this.buildingTileCache.entries()) {
        if (!activeBldgKeys.has(key)) cached.group.visible = false;
      }
      for (const [key, cached] of this.bridgeTileCache.entries()) {
        if (!activeBridgeKeys.has(key)) cached.group.visible = false;
      }
    } else {
      this.buildingsRootGroup.visible = false;
      this.bridgesRootGroup.visible = false;
    }

    // 2. [DEM 지형 표고 격자 스트리밍] 줌 11 이상 및 토글 활성화 시 가동
    if (this.isDemVisible && zoom >= 11.0) {
      this.demRootGroup.visible = true;
      const demLevel = Math.max(10, Math.min(13, Math.floor(zoom - 1.5)));
      const bounds = this.map.getBounds();
      const demTiles = VWorldQuadtreeIndexer.getTilesForBbox(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        demLevel
      ).slice(0, 8);

      const activeDemKeys = new Set<string>();
      for (const tile of demTiles) {
        const key = `dem_${tile.level}_${tile.idx}_${tile.idy}`;
        activeDemKeys.add(key);

        if (this.demTileCache.has(key)) {
          const cached = this.demTileCache.get(key)!;
          cached.lastAccessed = Date.now();
          cached.mesh.visible = true;
        } else {
          this.fetchAndLoadDemTile(tile.level, tile.idx, tile.idy, key);
        }
      }

      for (const [key, cached] of this.demTileCache.entries()) {
        if (!activeDemKeys.has(key)) cached.mesh.visible = false;
      }
    } else {
      this.demRootGroup.visible = false;
    }

    // LRU 캐시 정리 & 통계 발행
    this.trimCache();
    this.updateStats();
  }

  /**
   * 건물 또는 교량 XDO 바이너리 비동기 스트리밍 로드
   */
  private async fetchAndLoadXdoTile(
    layer: 'facility_build' | 'facility_bridge',
    level: number,
    idx: number,
    idy: number,
    key: string
  ): Promise<void> {
    if (this.pendingFetches.has(key) || this.isDestroyed) return;
    const targetCache = layer === 'facility_build' ? this.buildingTileCache : this.bridgeTileCache;
    if (targetCache.has(key)) return;

    this.pendingFetches.add(key);

    try {
      const proxyUrl = VWorldQuadtreeIndexer.getProxyTileUrl({
        layer,
        level,
        idx,
        idy,
        dataFile: `${idx}_${idy}.xdo`,
      });

      const res = await fetch(proxyUrl);
      if (!res.ok) {
        this.pendingFetches.delete(key);
        return;
      }

      const buffer = await res.arrayBuffer();
      if (this.isDestroyed || buffer.byteLength === 0) {
        this.pendingFetches.delete(key);
        return;
      }

      const tileBounds = VWorldQuadtreeIndexer.getTileBounds(idx, idy, level);
      const origin = this.originLngLat || [tileBounds.centerLon, tileBounds.centerLat];
      const metersPerLng = 111319.49 * Math.cos((origin[1] * Math.PI) / 180.0);
      const metersPerLat = 111132.92;

      const localX = (tileBounds.centerLon - origin[0]) * metersPerLng;
      const localZ = -(tileBounds.centerLat - origin[1]) * metersPerLat;

      const terrainElev =
        (this.map && elevationCache.getFromMap(this.map, [tileBounds.centerLon, tileBounds.centerLat])) ||
        110.0;

      const parsed = VWorldXDOParser.parse(buffer, {
        originCenter: [0, 0, 0],
        scale: 1.0,
      });

      // 교량의 경우 고급 콘크리트 상판 및 금속 재질 적용
      if (layer === 'facility_bridge') {
        parsed.materials.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.color = new THREE.Color(0xe2e8f0);
            m.metalness = 0.35;
            m.roughness = 0.55;
          }
        });
      }

      parsed.group.position.set(localX, terrainElev - this.clampedAltitude, localZ);

      const targetRoot = layer === 'facility_build' ? this.buildingsRootGroup : this.bridgesRootGroup;
      targetRoot.add(parsed.group);

      const cachedItem: CachedTile = {
        key,
        layer,
        level,
        idx,
        idy,
        group: parsed.group,
        parsed,
        bounds: tileBounds,
        lastAccessed: Date.now(),
      };

      targetCache.set(key, cachedItem);
      this.updateStats();

      if (this.map) this.map.triggerRepaint();
    } catch (err) {
      console.warn(`[VWorld3DTileLayer] Failed to load ${layer} tile ${key}:`, err);
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  /**
   * DEM 수치표고모델 바이너리 비동기 스트리밍 로드
   */
  private async fetchAndLoadDemTile(level: number, idx: number, idy: number, key: string): Promise<void> {
    if (this.pendingFetches.has(key) || this.demTileCache.has(key) || this.isDestroyed) return;
    this.pendingFetches.add(key);

    try {
      const proxyUrl = VWorldQuadtreeIndexer.getProxyTileUrl({
        layer: 'dem',
        level,
        idx,
        idy,
      });

      const res = await fetch(proxyUrl);
      if (!res.ok) {
        this.pendingFetches.delete(key);
        return;
      }

      const buffer = await res.arrayBuffer();
      if (this.isDestroyed || buffer.byteLength === 0) {
        this.pendingFetches.delete(key);
        return;
      }

      const tileBounds = VWorldQuadtreeIndexer.getTileBounds(idx, idy, level);
      const parsedDem = VWorldDEMParser.parse(buffer, 65, tileBounds);

      // 에메랄드 토포그래피 와이어프레임 & 반투명 지형 셰이더
      const terrainMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x059669),
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        roughness: 0.8,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(parsedDem.geometry, terrainMat);
      mesh.name = `VWorld_DEM_${key}`;

      const origin = this.originLngLat || [tileBounds.centerLon, tileBounds.centerLat];
      const metersPerLng = 111319.49 * Math.cos((origin[1] * Math.PI) / 180.0);
      const metersPerLat = 111132.92;
      const localX = (tileBounds.centerLon - origin[0]) * metersPerLng;
      const localZ = -(tileBounds.centerLat - origin[1]) * metersPerLat;

      mesh.position.set(localX, parsedDem.meanElevation - this.clampedAltitude, localZ);
      this.demRootGroup.add(mesh);

      const cachedDem: CachedDemTile = {
        key,
        level,
        idx,
        idy,
        mesh,
        parsed: parsedDem,
        bounds: tileBounds,
        lastAccessed: Date.now(),
      };

      this.demTileCache.set(key, cachedDem);
      this.updateStats();

      if (this.map) this.map.triggerRepaint();
    } catch (err) {
      console.warn(`[VWorld3DTileLayer] Failed to load dem tile ${key}:`, err);
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  /**
   * LRU 캐시 정리
   */
  private trimCache(): void {
    // 건물 캐시 정리
    if (this.buildingTileCache.size > this.maxCachedTiles) {
      const entries = Array.from(this.buildingTileCache.entries()).sort(
        (a, b) => a[1].lastAccessed - b[1].lastAccessed
      );
      const excess = this.buildingTileCache.size - this.maxCachedTiles;
      for (let i = 0; i < excess; i++) {
        const [k, item] = entries[i];
        this.disposeXdoTile(this.buildingsRootGroup, item);
        this.buildingTileCache.delete(k);
      }
    }

    // 교량 캐시 정리
    if (this.bridgeTileCache.size > this.maxCachedTiles) {
      const entries = Array.from(this.bridgeTileCache.entries()).sort(
        (a, b) => a[1].lastAccessed - b[1].lastAccessed
      );
      const excess = this.bridgeTileCache.size - this.maxCachedTiles;
      for (let i = 0; i < excess; i++) {
        const [k, item] = entries[i];
        this.disposeXdoTile(this.bridgesRootGroup, item);
        this.bridgeTileCache.delete(k);
      }
    }

    // DEM 캐시 정리
    if (this.demTileCache.size > 24) {
      const entries = Array.from(this.demTileCache.entries()).sort(
        (a, b) => a[1].lastAccessed - b[1].lastAccessed
      );
      const excess = this.demTileCache.size - 24;
      for (let i = 0; i < excess; i++) {
        const [k, item] = entries[i];
        this.demRootGroup.remove(item.mesh);
        item.mesh.geometry.dispose();
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach((m) => m.dispose());
        } else {
          item.mesh.material.dispose();
        }
        this.demTileCache.delete(k);
      }
    }
  }

  private disposeXdoTile(root: THREE.Group, tile: CachedTile): void {
    root.remove(tile.group);
    for (const geom of tile.parsed.geometries) geom.dispose();
    for (const mat of tile.parsed.materials) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  }

  private disposeAllTiles(): void {
    for (const tile of this.buildingTileCache.values()) {
      this.disposeXdoTile(this.buildingsRootGroup, tile);
    }
    this.buildingTileCache.clear();

    for (const tile of this.bridgeTileCache.values()) {
      this.disposeXdoTile(this.bridgesRootGroup, tile);
    }
    this.bridgeTileCache.clear();

    for (const tile of this.demTileCache.values()) {
      this.demRootGroup.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      if (Array.isArray(tile.mesh.material)) tile.mesh.material.forEach((m) => m.dispose());
      else tile.mesh.material.dispose();
    }
    this.demTileCache.clear();
    this.pendingFetches.clear();
  }

  private updateStats(): void {
    let totalVertices = 0;
    let totalTriangles = 0;

    for (const tile of this.buildingTileCache.values()) {
      if (tile.group.visible) {
        totalVertices += tile.parsed.totalVertices;
        totalTriangles += tile.parsed.totalTriangles;
      }
    }

    for (const tile of this.bridgeTileCache.values()) {
      if (tile.group.visible) {
        totalVertices += tile.parsed.totalVertices;
        totalTriangles += tile.parsed.totalTriangles;
      }
    }

    for (const tile of this.demTileCache.values()) {
      if (tile.mesh.visible) {
        totalVertices += 65 * 65;
        totalTriangles += 64 * 64 * 2;
      }
    }

    try {
      const store = useMapStore.getState();
      if ((store as any).setVworldTileStats) {
        (store as any).setVworldTileStats({
          loadedTiles: this.buildingTileCache.size,
          loadedBridges: this.bridgeTileCache.size,
          loadedDemTiles: this.demTileCache.size,
          totalVertices,
          totalTriangles,
          currentLevel: this.activeLevel,
        });
      }
    } catch {}
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.renderer || !this.map || !this.originLngLat) return;
    if (!this.isBuildingsVisible && !this.isBridgesVisible && !this.isDemVisible) return;

    try {
      const center = this.map.getCenter();
      const distKm = Math.hypot(center.lng - this.originLngLat[0], center.lat - this.originLngLat[1]) * 111.0;
      if (distKm > 5.0) {
        this.originLngLat = [center.lng, center.lat];
        this.disposeAllTiles();
        this.updateVisibleTiles();
      }

      if (this.clampedAltitude === 0 && this.map.queryTerrainElevation) {
        const alt = this.map.queryTerrainElevation(this.originLngLat);
        if (alt && alt > 5.0) {
          this.clampedAltitude = alt;
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

      this.renderMatrix.fromArray(rawMatrix as any);
      this.scaleVector.set(meterScale, -meterScale, meterScale);
      this.localMatrix
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(this.scaleVector)
        .multiply(this.rotationX);

      this.camera.projectionMatrix.copy(this.renderMatrix).multiply(this.localMatrix);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

      if (gl) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      }

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    } catch (renderErr) {
      console.warn('[VWorld3DTileLayer] Render error:', renderErr);
    }
  }
}
