/**
 * components/Map/VWorld3DTileLayer.ts
 *
 * [GeoBrief 3D 2단계: 브이월드(V-World 3D) 실사 타일 스트리밍 및 파싱 레이어]
 *
 * 브이월드 역공학 쿼드트리 인덱싱(VWorldQuadtreeIndexer)과 XDO 바이너리 파서(VWorldXDOParser)를
 * MapLibre GL 3D 커스텀 레이어 파이프라인에 직결하여, 뷰포트 내 브이월드 실사 3D 건축물을
 * 비동기 쿼드트리 청크 단위로 스트리밍 렌더링합니다.
 *
 * [핵심 아키텍처]
 *  1. [LOD 동적 분기 & 지능형 프러스텀 컬링]:
 *     - Zoom < 13: 대기 모드 (GPU Draw Call 절약)
 *     - Zoom 13 ~ 14.5: 레벨 14 (LOD2 중경 건축물 청크)
 *     - Zoom >= 14.5: 레벨 15 (LOD3+ 초정밀 실사 건축물 메쉬)
 *  2. [LRU 메모리 캐시 & VRAM 누수 원천 차단]:
 *     - 최대 48개 타일 캐시 유지, 뷰포트 이탈 시 geometry/material dispose
 *  3. [64비트 정밀도 보존 & 지형 밀착]:
 *     - MapLibre MercatorCoordinate 및 extractCustomLayerMatrix 연동
 *  4. [황금비 조명 & 대기 안개 동기화]:
 *     - VWorldWebGLShaderSpec 사양 적용
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import {
  VWorldQuadtreeIndexer,
  VWorldXDOParser,
  VWorldTileBounds,
  VWorldParsedXDO,
  VWorldWebGLShaderSpec,
} from '@/lib/vendor/vworldReverseSpec';
import { extractCustomLayerMatrix } from '@/utils/customLayerMatrix';
import { elevationCache } from '@/utils/elevationCache';
import { useMapStore } from '@/store/useMapStore';

interface CachedTile {
  key: string;
  level: number;
  idx: number;
  idy: number;
  group: THREE.Group;
  parsed: VWorldParsedXDO;
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
  private tilesRootGroup: THREE.Group = new THREE.Group();

  // 조명 및 안개
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
  private tileCache: Map<string, CachedTile> = new Map();
  private pendingFetches: Set<string> = new Set();
  private activeLevel = 15;
  private maxCachedTiles = 48;
  private isVisible = true;
  private isDestroyed = false;
  private moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.tilesRootGroup.name = 'VWorld_3D_Tiles_Root';
    this.scene.add(this.tilesRootGroup);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.tilesRootGroup.visible = visible;
    if (this.map) {
      this.map.triggerRepaint();
    }
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
    if (this.isDestroyed || !this.isVisible) return;
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
   * 뷰포트 프러스텀 내의 브이월드 쿼드트리 타일 동적 산출 및 스트리밍
   */
  private updateVisibleTiles(): void {
    if (!this.map || this.isDestroyed || !this.isVisible) return;

    const zoom = this.map.getZoom();

    // 줌 13 미만에서는 타일 로딩을 중지하고 숨김 처리하여 성능 확보
    if (zoom < 13.0) {
      this.tilesRootGroup.visible = false;
      return;
    }
    this.tilesRootGroup.visible = true;

    // LOD 레벨 분기: 14.5 이상은 Level 15 (초정밀), 이하는 Level 14
    const level = zoom >= 14.5 ? VWorldQuadtreeIndexer.LEVEL_BUILDING_LOD3_REALISTIC : VWorldQuadtreeIndexer.LEVEL_BUILDING_LOD2;
    this.activeLevel = level;

    // 현재 뷰포트 BBOX 계산
    const bounds = this.map.getBounds();
    const minLon = bounds.getWest();
    const maxLon = bounds.getEast();
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();

    // 쿼드트리 인덱서로 BBOX 내 타일 목록 추출
    const tiles = VWorldQuadtreeIndexer.getTilesForBbox([minLon, minLat, maxLon, maxLat], level);

    const center = this.map.getCenter();
    const cLon = center.lng;
    const cLat = center.lat;

    // 카메라 중심에서 가까운 순으로 정렬 (중앙 우선 스트리밍)
    tiles.sort((a, b) => {
      const bA = VWorldQuadtreeIndexer.getTileBounds(a.idx, a.idy, level);
      const bB = VWorldQuadtreeIndexer.getTileBounds(b.idx, b.idy, level);
      const distA = Math.hypot(bA.centerLon - cLon, bA.centerLat - cLat);
      const distB = Math.hypot(bB.centerLon - cLon, bB.centerLat - cLat);
      return distA - distB;
    });

    // 1회 최대 활성 타일 수: 12개 (60fps 및 VRAM 보호)
    const activeTiles = tiles.slice(0, 12);
    const activeKeys = new Set<string>();

    for (const tile of activeTiles) {
      const key = `${tile.level}_${tile.idx}_${tile.idy}`;
      activeKeys.add(key);

      if (this.tileCache.has(key)) {
        const cached = this.tileCache.get(key)!;
        cached.lastAccessed = Date.now();
        cached.group.visible = true;
      } else {
        // 비동기 스트리밍 요청
        this.fetchAndLoadTile(tile.level, tile.idx, tile.idy, key);
      }
    }

    // 활성 뷰포트에서 벗어난 타일 숨김 처리
    for (const [key, cached] of this.tileCache.entries()) {
      if (!activeKeys.has(key)) {
        cached.group.visible = false;
      }
    }

    // LRU 캐시 정리 (최대치 초과 시 오래된 타일 폐기)
    this.trimCache();
    this.updateStats();
  }

  /**
   * XDO 타일 비동기 다운로드 및 3D 메쉬 생성
   */
  private async fetchAndLoadTile(level: number, idx: number, idy: number, key: string): Promise<void> {
    if (this.pendingFetches.has(key) || this.tileCache.has(key) || this.isDestroyed) {
      return;
    }

    this.pendingFetches.add(key);

    try {
      const proxyUrl = VWorldQuadtreeIndexer.getProxyTileUrl({
        layer: 'facility_build',
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

      // 기준 원점 대비 상대 미터 위치 계산
      const origin = this.originLngLat || [tileBounds.centerLon, tileBounds.centerLat];
      const metersPerLng = 111319.49 * Math.cos((origin[1] * Math.PI) / 180.0);
      const metersPerLat = 111132.92;

      const localX = (tileBounds.centerLon - origin[0]) * metersPerLng;
      const localZ = -(tileBounds.centerLat - origin[1]) * metersPerLat;

      // 지형 표고 조회
      const terrainElev =
        (this.map && elevationCache.getFromMap(this.map, [tileBounds.centerLon, tileBounds.centerLat])) ||
        110.0;

      // XDO 파싱
      const parsed = VWorldXDOParser.parse(buffer, {
        originCenter: [0, 0, 0],
        scale: 1.0,
      });

      // 타일 서브그룹 위치 설정
      parsed.group.position.set(localX, terrainElev - this.clampedAltitude, localZ);
      this.tilesRootGroup.add(parsed.group);

      const cachedItem: CachedTile = {
        key,
        level,
        idx,
        idy,
        group: parsed.group,
        parsed,
        bounds: tileBounds,
        lastAccessed: Date.now(),
      };

      this.tileCache.set(key, cachedItem);
      this.updateStats();

      if (this.map) {
        this.map.triggerRepaint();
      }
    } catch (err) {
      console.warn(`[VWorld3DTileLayer] Failed to load tile ${key}:`, err);
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  /**
   * LRU 캐시 정리
   */
  private trimCache(): void {
    if (this.tileCache.size <= this.maxCachedTiles) return;

    const entries = Array.from(this.tileCache.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    const excessCount = this.tileCache.size - this.maxCachedTiles;
    for (let i = 0; i < excessCount; i++) {
      const [key, item] = entries[i];
      this.disposeTile(item);
      this.tileCache.delete(key);
    }
  }

  private disposeTile(tile: CachedTile): void {
    this.tilesRootGroup.remove(tile.group);

    for (const geom of tile.parsed.geometries) {
      geom.dispose();
    }
    for (const mat of tile.parsed.materials) {
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
  }

  private disposeAllTiles(): void {
    for (const tile of this.tileCache.values()) {
      this.disposeTile(tile);
    }
    this.tileCache.clear();
    this.pendingFetches.clear();
  }

  private updateStats(): void {
    let totalVertices = 0;
    let totalTriangles = 0;

    for (const tile of this.tileCache.values()) {
      if (tile.group.visible) {
        totalVertices += tile.parsed.totalVertices;
        totalTriangles += tile.parsed.totalTriangles;
      }
    }

    try {
      const store = useMapStore.getState();
      if ((store as any).setVworldTileStats) {
        (store as any).setVworldTileStats({
          loadedTiles: this.tileCache.size,
          totalVertices,
          totalTriangles,
          currentLevel: this.activeLevel,
        });
      }
    } catch {}
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer || !this.map || !this.originLngLat) {
      return;
    }

    try {
      // 뷰포트 원점 이동 보정: 원점과 현재 중심의 거리가 5km 이상 벌어지면 좌표 재설정
      const center = this.map.getCenter();
      const distKm = Math.hypot(center.lng - this.originLngLat[0], center.lat - this.originLngLat[1]) * 111.0;
      if (distKm > 5.0) {
        this.originLngLat = [center.lng, center.lat];
        this.disposeAllTiles();
        this.updateVisibleTiles();
      }

      // 지형 고도 클램핑
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
      // 프레임 렌더 오류 억제 (지도 메인루프 보호)
      console.warn('[VWorld3DTileLayer] Render cycle caught error:', renderErr);
    }
  }
}
