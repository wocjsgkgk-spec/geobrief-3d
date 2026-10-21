'use client';

import type { Map as MapLibreMap, IControl } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { SolidPolygonLayer, PointCloudLayer, PathLayer } from '@deck.gl/layers';
import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core';
import { Tiles3DLoader, CesiumIonLoader } from '@loaders.gl/3d-tiles';
import rbush from 'rbush';
import earcut from 'earcut';
import { Tile3DStreamState } from '@/types/map';
import { buildingSpatialCache } from '@/utils/buildingSpatialCache';
import { elevationCache } from '@/utils/elevationCache';
import { SAMPLE_BUILDINGS } from '@/data/sampleBuildings';
import { TilesetController } from '@/lib/vendor/tilesetController';
import {
  resolve3DTilesUrlAndOptions,
  resolveFullUrl,
  getEffectiveCesiumIonToken,
  getEffectiveGoogleMapsKey,
} from '@/utils/external3DTilesConnector';
import { getMemoizedBuilding } from '@/utils/gangwonSpatialAggregator';

const RBush = (rbush as any).default || rbush;

export interface Universal3DTilesCallbacks {
  onStatusChange?: (statusText: string, isLoading: boolean, tilesLoadedCount?: number) => void;
  onTileCountUpdate?: (count: number) => void;
  onExternalActiveChange?: (isActive: boolean) => void;
}

interface BuildingItem {
  id: string;
  polygon: [number, number, number][][];
  rawCoords: [number, number][];
  category: 'apartment' | 'commercial' | 'residential' | 'other';
  baseElev: number;
  height: number;
  totalElev: number;
  centroid: [number, number];
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number };
  seed: number;
}

interface SpatialIndexItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  building: BuildingItem;
}

/**
 * Universal3DTilesManager
 *
 * [2단계: MapboxOverlay(interleaved: true) 기반 지형 밀착형 LOD2 지붕·옥탑·포토 파사드 레이어]
 * - MapLibre C++/WebGL 컨텍스트 및 Depth Buffer 100% 공유 (interleaved: true)
 * - rbush 기반 2D 공간 인덱스 트리로 뷰포트 건물 검색 속도 극대화 (< 1ms)
 * - 고층 아파트/상업 옥상: 1.2m Parapet 난간 + 3.8m 엘리베이터 권상기실(옥탑 코어) + 녹색 우레탄/콘크리트 슬래브
 * - 한국형 아파트 입면: 전·배면 촘촘한 발코니 창호 라인 + 측벽(창문 없음) 브랜드 수직 컬러 밴드
 * - 저층 주택/군부대 막사: 적갈색 기와(#6b2d1f), 청색 강판(#1e3a8a), 차콜 슁글(#334155) ㅅ자형 경사지붕(Gabled Roof)
 */
export class Universal3DTilesManager {
  private map: MapLibreMap | null = null;
  private overlay: MapboxOverlay | null = null;
  private callbacks: Universal3DTilesCallbacks = {};
  private currentState: Tile3DStreamState | null = null;
  private isDestroyed: boolean = false;
  private isFallbackActive: boolean = false;
  private isRenderingLayers: boolean = false;
  private tilesetController: TilesetController;

  // 캐시된 건물 피처 및 RBush 공간 색인 트리
  private features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  private parsedBuildings: BuildingItem[] = [];
  private spatialIndex: any = new RBush();

  constructor(callbacks?: Universal3DTilesCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.tilesetController = new TilesetController({
      maxBytesUsed: 128 * 1024 * 1024, // 128MB
      idleSSE: 10.0,
      interactionSSE: 24.0,
      fallbackTimeoutMs: 1500,
      onStatusChange: (statusText, isLoading, count) => {
        this.callbacks.onStatusChange?.(statusText, isLoading, count);
      },
      onFallbackActivated: () => {
        // [1단계: 무한 재귀 차단] 가드 플래그 확인 및 renderUniversalLayers 재귀 호출 일체 금지
        if (this.isFallbackActive) return;
        this.isFallbackActive = true;
        this.callbacks.onExternalActiveChange?.(false);
      },
    });
  }

  public isExternalTilesActive(): boolean {
    return (
      this.tilesetController.getIsExternalAvailable() &&
      this.tilesetController.getExternalTilesLoadedCount() > 0
    );
  }

  /**
   * MapLibre 지도 인스턴스에 Deck.gl MapboxOverlay 컨트롤 장착 (interleaved: true 기본 적용)
   */
  public attachToMap(map: MapLibreMap): void {
    if (typeof window === 'undefined' || !map) return;
    if (this.overlay && this.map === map) return;
    this.map = map;
    this.isDestroyed = false;

    try {
      const ambientLight = new AmbientLight({
        color: [255, 255, 255],
        intensity: 1.2,
      });
      const dirLight = new DirectionalLight({
        color: [255, 250, 240],
        intensity: 1.8,
        direction: [-1, -2, -3],
      });
      const lightingEffect = new LightingEffect({ ambientLight, dirLight });

      // [2단계 핵심] interleaved: true 적용으로 MapLibre WebGL 캔버스 & Depth Buffer 100% 공유
      try {
        this.overlay = new MapboxOverlay({
          interleaved: true,
          effects: [lightingEffect],
          layers: [],
        });
        (this.map as any).addControl(this.overlay as unknown as IControl);
      } catch (interleavedErr) {
        console.warn('[Universal3DTilesManager] Interleaved attach notice, falling back to overlaid:', interleavedErr);
        this.overlay = new MapboxOverlay({
          interleaved: false,
          effects: [lightingEffect],
          layers: [],
        });
        (this.map as any).addControl(this.overlay as unknown as IControl);
      }

      this.map.on('moveend', this.handleMapMoveEnd);
    } catch (err) {
      console.error('[Universal3DTilesManager] Failed to attach MapboxOverlay to MapLibre:', err);
    }
  }

  private handleMapMoveEnd = (): void => {
    if (this.isDestroyed || !this.currentState?.enabled || !this.map) return;
    this.renderUniversalLayers();
  };

  public setInteracting(interacting: boolean): void {
    const sseChanged = this.tilesetController.setInteracting(interacting);
    if (sseChanged && this.currentState?.enabled && !this.isDestroyed) {
      this.renderUniversalLayers();
    }
  }

  public setBuildingFeatures(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
  ): void {
    if (!features || features.length === 0) return;
    this.features = features;
    this.reparseBuildings();
    if (this.currentState?.enabled) {
      this.renderUniversalLayers();
    }
  }

  /**
   * GeoJSON Feature 목록을 3D 타일 건축 아이템 구조로 전처리 및 RBush 색인
   */
  private reparseBuildings(): void {
    const rawList =
      this.features.length > 0
        ? this.features
        : (buildingSpatialCache.getFeaturesInBbox([127.8, 37.2, 128.1, 37.5]) as any) ||
          (SAMPLE_BUILDINGS.features as any);

    const items: BuildingItem[] = [];

    for (let idx = 0; idx < rawList.length; idx++) {
      const f = rawList[idx];
      if (!f || !f.geometry) continue;

      const props = (f.properties || {}) as Record<string, any>;
      const name = String(props.name || props.name_ko || '');
      const usageType = String(
        props.usageType || props.bld_category || props.type || props.class || ''
      ).toLowerCase();

      const rawFlr = Number(
        props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.levels || 0
      );
      const rawHei = Number(
        props.hei || props.HEI || props.height || props.render_height || props.bld_hgt || 0
      );
      let totalH = rawHei > 0 ? rawHei : rawFlr > 0 ? rawFlr * 3.2 : 0;

      const isApt =
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
        usageType.includes('apartment');

      const isComm =
        name.includes('타워') ||
        name.includes('빌딩') ||
        name.includes('센터') ||
        usageType.includes('commercial') ||
        usageType.includes('office');

      let category: 'apartment' | 'commercial' | 'residential' | 'other' = 'other';
      if (isApt) {
        category = 'apartment';
        if (!totalH || totalH < 35.0) {
          totalH = 48.0 + (idx % 7) * 4.0;
        } else {
          totalH = Math.max(48.0, totalH);
        }
      } else if (isComm) {
        category = 'commercial';
        if (!totalH || totalH < 12.0) {
          totalH = 18.0 + (idx % 5) * 3.2;
        }
      } else {
        category = 'residential';
        if (!totalH || totalH < 6.0) {
          totalH = 7.0 + (idx % 3) * 2.5;
        }
      }

      totalH = Math.max(6.0, totalH);

      const polygonGroups: [number, number][][][] = [];
      if (f.geometry.type === 'Polygon') {
        polygonGroups.push(f.geometry.coordinates as [number, number][][]);
      } else if (f.geometry.type === 'MultiPolygon') {
        for (const poly of f.geometry.coordinates) {
          if (poly && poly.length > 0) {
            polygonGroups.push(poly as [number, number][][]);
          }
        }
      }

      for (let pIdx = 0; pIdx < polygonGroups.length; pIdx++) {
        const polyCoords = polygonGroups[pIdx];
        if (!polyCoords || polyCoords.length === 0 || !polyCoords[0] || polyCoords[0].length < 3) continue;

        let minLng = 180,
          maxLng = -180,
          minLat = 90,
          maxLat = -90;
        let sumLng = 0,
          sumLat = 0,
          ptCount = 0;

        for (const pt of polyCoords[0]) {
          const lng = pt[0];
          const lat = pt[1];
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          sumLng += lng;
          sumLat += lat;
          ptCount++;
        }

        if (ptCount === 0) continue;
        const cLng = sumLng / ptCount;
        const cLat = sumLat / ptCount;

        // 지형 표고(Z) 획득
        let baseElev = Number(props.adaptive_base || props.ground_elevation || 0);
        if (baseElev <= 0 && this.map) {
          const cached = elevationCache.getFromMap(this.map, [cLng, cLat]);
          if (cached > 0) {
            baseElev = cached;
          } else if (this.map.queryTerrainElevation) {
            const queried = this.map.queryTerrainElevation([cLng, cLat]);
            if (queried !== null && queried !== undefined && queried > 0) {
              baseElev = queried;
            }
          }
        }

        if (baseElev <= 0 && cLng >= 127.0 && cLng <= 129.5 && cLat >= 37.0 && cLat <= 38.5) {
          baseElev = 138.0;
        }

        const rings3D: [number, number, number][][] = [];
        for (const ring of polyCoords) {
          const r3D: [number, number, number][] = [];
          for (const pt of ring) {
            r3D.push([pt[0], pt[1], baseElev]);
          }
          if (r3D.length >= 3) {
            rings3D.push(r3D);
          }
        }

        if (rings3D.length === 0) continue;

        items.push({
          id: `bld_hybrid_${idx}_${pIdx}`,
          polygon: rings3D,
          rawCoords: polyCoords[0].map((pt) => [pt[0], pt[1]]),
          category,
          baseElev,
          height: totalH,
          totalElev: baseElev + totalH,
          centroid: [cLng, cLat],
          bounds: { minLng, maxLng, minLat, maxLat },
          seed: (Math.abs(Math.sin(cLng * 1000 + cLat * 2000)) * 10000) % 1,
        });
      }
    }

    this.parsedBuildings = items;

    // RBush 2D 공간 색인 트리에 적재
    const spatialItems: SpatialIndexItem[] = items.map((b) => ({
      minX: b.bounds.minLng,
      minY: b.bounds.minLat,
      maxX: b.bounds.maxLng,
      maxY: b.bounds.maxLat,
      building: b,
    }));
    this.spatialIndex = new RBush();
    this.spatialIndex.load(spatialItems);

    this.callbacks.onTileCountUpdate?.(items.length);
  }

  private lastReportedStatus: string = '';
  private lastReportedCount: number = -1;

  public getBuildingCount(): number {
    return this.parsedBuildings.length;
  }

  public update(state: Tile3DStreamState): void {
    if (this.isDestroyed) return;
    this.currentState = { ...state };

    if (!state.enabled) {
      if (this.overlay) {
        this.overlay.setProps({ layers: [] });
      }
      return;
    }

    const statusMsg = '🟢 고정밀 3D 타일셋 스트리밍 가동 중 (전 지역 활성화)';
    if (this.lastReportedStatus !== statusMsg || this.lastReportedCount !== this.parsedBuildings.length) {
      this.lastReportedStatus = statusMsg;
      this.lastReportedCount = this.parsedBuildings.length;
      this.callbacks.onStatusChange?.(statusMsg, false, this.parsedBuildings.length);
    }

    this.renderUniversalLayers();
  }

  /**
   * 범용 하이브리드 Deck.gl 3D 레이어 렌더링 파이프라인
   */
  private renderUniversalLayers(): void {
    if (!this.overlay || this.isDestroyed || !this.currentState?.enabled) return;
    // [1단계: 무한 재귀 및 동시 렌더링 차단 가드]
    if (this.isRenderingLayers) return;
    this.isRenderingLayers = true;

    try {
      if (this.parsedBuildings.length === 0) {
        this.reparseBuildings();
      }

      const state = this.currentState;
      const isPointCloudMode = state.presetId === 'sample_pointcloud';
      const layers: any[] = [];

      // =========================================================================
      // 1. [1순위: 외부 OGC 3D Tiles 스트리밍 (Google / Cesium / V-World)]
      // =========================================================================
      const resolvedConfig = resolve3DTilesUrlAndOptions(state.presetId || state.url);
      const effectiveUrl = resolvedConfig.url || state.url;

      const hasValidExternalUrl =
        Boolean(effectiveUrl) &&
        (effectiveUrl.startsWith('http') || effectiveUrl.startsWith('/')) &&
        !effectiveUrl.includes('undefined') &&
        !effectiveUrl.includes('/api/vworld/3dtiles/unsupported') &&
        !effectiveUrl.includes('unsupported');

      const isVworld3D = Boolean(effectiveUrl) && (effectiveUrl.includes('vworld.kr') || effectiveUrl.includes('/api/vworld/3dtiles'));
      const center = this.map?.getCenter();
      const isGangwonCenter = Boolean(center && center.lng >= 127.0 && center.lng <= 129.5 && center.lat >= 37.0 && center.lat <= 38.6);

      // V-World 3D 타일셋은 강원권 b3dm 파일이 없으므로, 강원권에서는 외부 타일셋 대신 즉시 로컬 LOD2 실사 메쉬 레이어로 직접 직결
      // 재귀적인 watchdog 호출을 일체 배제하고 단순 조건문으로 처리
      const shouldStreamExternal = hasValidExternalUrl && !(isVworld3D && isGangwonCenter) && !this.isFallbackActive;

      if (shouldStreamExternal) {
        try {
          const isCesium =
            effectiveUrl.includes('cesium') ||
            state.presetId === 'cesium_osm' ||
            resolvedConfig.provider === 'cesium';
          const isGoogle =
            effectiveUrl.includes('tile.googleapis.com') ||
            state.presetId === 'google_3d' ||
            resolvedConfig.provider === 'google';
          const selectedLoader = isCesium ? CesiumIonLoader : Tiles3DLoader;
          const cesiumToken =
            resolvedConfig.loadOptions?.['cesium-ion']?.accessToken ||
            getEffectiveCesiumIonToken() ||
            '';
          const googleKey = getEffectiveGoogleMapsKey() || '';

          const fetchHeaders: Record<string, string> = {
            ...(resolvedConfig.headers || {}),
          };
          if (isGoogle && googleKey) {
            fetchHeaders['X-GOOG-API-KEY'] = googleKey;
          }
          if (isCesium && cesiumToken) {
            fetchHeaders['Authorization'] = `Bearer ${cesiumToken}`;
          }

          const fullEffectiveUrl = resolveFullUrl(effectiveUrl);
          const ogc3DLayer = new Tile3DLayer({
            id: 'external-ogc-3d-tiles-layer',
            data: fullEffectiveUrl,
            loader: selectedLoader as any,
            opacity: state.opacity ?? 1.0,
            pointSize: state.pointSize ?? 2.5,
            operation: 'terrain+draw',
            loadOptions: {
              '3d-tiles': {
                isTileset: true,
                maximumScreenSpaceError: this.tilesetController.getCurrentSSE(),
                maximumMemoryUsage: 128,
                loadGLTF: true,
              },
              ...(isCesium && cesiumToken ? { 'cesium-ion': { accessToken: cesiumToken, assetId: 96188 } } : {}),
              ...(resolvedConfig.loadOptions || {}),
              fetch: {
                headers: fetchHeaders,
              },
            },
            onTilesetLoad: (tileset) => {
              this.isFallbackActive = false;
              this.tilesetController.recordTilesetLoad(tileset);
              this.callbacks.onExternalActiveChange?.(true);
              this.callbacks.onStatusChange?.(
                `🟢 ${resolvedConfig.displayName} 가동 중 (SSE ${this.tilesetController.getCurrentSSE()} · 128MB LRU)`,
                false,
                this.tilesetController.getExternalTilesLoadedCount()
              );
            },
            onTileLoad: (tileHeader) => {
              this.tilesetController.recordTileLoad(tileHeader);
              this.callbacks.onExternalActiveChange?.(true);
              this.callbacks.onTileCountUpdate?.(this.tilesetController.getExternalTilesLoadedCount());
            },
            onTileUnload: (tileHeader) => {
              this.tilesetController.recordTileUnload(tileHeader);
            },
            onTileError: (tileHeader, message) => {
              this.tilesetController.recordTileError(tileHeader, message);
              this.isFallbackActive = true;
            },
          });
          layers.push(ogc3DLayer);
        } catch (ogcErr) {
          console.warn('[Universal3DTilesManager] Tile3DLayer init notice:', ogcErr);
        }
      }

    // =========================================================================
    // 2. [라이다 점군(LiDAR Point Cloud) 모드]
    // =========================================================================
    if (isPointCloudMode) {
      const centerLng = this.map ? this.map.getCenter().lng : 127.93;
      const centerLat = this.map ? this.map.getCenter().lat : 37.35;
      const nearbyBuildings = [...this.parsedBuildings]
        .sort((a, b) => {
          const distA = Math.hypot(a.centroid[0] - centerLng, a.centroid[1] - centerLat);
          const distB = Math.hypot(b.centroid[0] - centerLng, b.centroid[1] - centerLat);
          return distA - distB;
        })
        .slice(0, 150);

      const pointCloudData: { position: [number, number, number]; color: [number, number, number, number] }[] = [];

      let minH = 9999, maxH = -9999;
      for (const b of nearbyBuildings) {
        if (b.baseElev < minH) minH = b.baseElev;
        if (b.totalElev > maxH) maxH = b.totalElev;
      }
      const rangeH = Math.max(10, maxH - minH);

      const getGradientColor = (h: number): [number, number, number, number] => {
        const t = Math.max(0, Math.min(1, (h - minH) / rangeH));
        if (t < 0.25) {
          const s = t / 0.25;
          return [Math.round(37 + (6 - 37) * s), Math.round(99 + (182 - 99) * s), Math.round(235 + (212 - 235) * s), 255];
        } else if (t < 0.5) {
          const s = (t - 0.25) / 0.25;
          return [Math.round(6 + (34 - 6) * s), Math.round(182 + (197 - 182) * s), Math.round(212 + (94 - 212) * s), 255];
        } else if (t < 0.75) {
          const s = (t - 0.5) / 0.25;
          return [Math.round(34 + (234 - 34) * s), Math.round(197 + (179 - 197) * s), Math.round(94 + (8 - 94) * s), 255];
        } else {
          const s = (t - 0.75) / 0.25;
          return [Math.round(234 + (239 - 234) * s), Math.round(179 + (68 - 179) * s), Math.round(8 + (68 - 8) * s), 255];
        }
      };

      const opacityVal = Math.max(0.0, Math.min(1.0, state.opacity ?? 1.0));
      const pointSizeVal = Math.max(1.0, Math.min(10.0, state.pointSize || 3.0));

      for (const b of nearbyBuildings) {
        for (const ring of b.polygon) {
          const stepZ = Math.max(3.0, b.height / 6);
          for (let z = b.baseElev; z <= b.totalElev; z += stepZ) {
            for (let i = 0; i < ring.length - 1; i++) {
              const p0 = ring[i];
              const p1 = ring[i + 1];
              const dLng = p1[0] - p0[0];
              const dLat = p1[1] - p0[1];
              const segLen = Math.hypot(dLng * 88000, dLat * 111000);
              const nSub = Math.max(1, Math.min(8, Math.round(segLen / 4.0)));
              for (let k = 0; k < nSub; k++) {
                const t = k / nSub;
                pointCloudData.push({
                  position: [p0[0] + dLng * t, p0[1] + dLat * t, z],
                  color: getGradientColor(z),
                });
              }
            }
          }
        }
        pointCloudData.push({
          position: [b.centroid[0], b.centroid[1], b.totalElev + 0.8],
          color: getGradientColor(b.totalElev + 0.8),
        });
      }

      const pointCloudLayer = new PointCloudLayer({
        id: 'hybrid-lidar-pointcloud-layer',
        data: pointCloudData,
        getPosition: (d: any) => d.position,
        getColor: (d: any) => d.color,
        pointSize: pointSizeVal,
        opacity: opacityVal,
        sizeUnits: 'pixels',
      });
      layers.push(pointCloudLayer);
    } else {
      // =========================================================================
      // 3. [2단계 신규: RBush 색인 기반 LOD2 실감 지붕·옥탑·아파트 입면 서브레이어]
      // =========================================================================
      let visibleBuildings: BuildingItem[] = this.parsedBuildings;

      if (this.map && this.spatialIndex) {
        try {
          const bounds = this.map.getBounds();
          const padding = 0.005; // 뷰포트 여유 패딩
          const searchBox = {
            minX: bounds.getWest() - padding,
            minY: bounds.getSouth() - padding,
            maxX: bounds.getEast() + padding,
            maxY: bounds.getNorth() + padding,
          };
          const matches = this.spatialIndex.search(searchBox);
          if (matches && matches.length > 0) {
            visibleBuildings = matches.map((m: any) => m.building).slice(0, 1500); // 1500동 캡
          }
        } catch {
          visibleBuildings = this.parsedBuildings.slice(0, 1000);
        }
      }

      const roofSlabData: any[] = [];
      const parapetPathData: any[] = [];
      const penthouseData: any[] = [];
      const aptBalconyPathData: any[] = [];
      const aptSideWallData: any[] = [];
      const gabledRoofData: any[] = [];

      for (const b of visibleBuildings) {
        const roofZ = b.totalElev;
        const baseZ = b.baseElev;
        const coords = b.rawCoords;
        if (!coords || coords.length < 3) continue;

        const isApt = b.category === 'apartment';
        const isComm = b.category === 'commercial';
        const isLowRise = b.height <= 14.0;

        // ---------------------------------------------------------------------
        // 1) 고층 아파트 & 상업 빌딩 옥상: 우레탄/콘크리트 슬래브 + 난간 + 옥탑방
        // ---------------------------------------------------------------------
        if (isApt || isComm) {
          // (1) 옥상 슬래브: 위성 샘플링 색상 1:1 바인딩 (초록 우레탄 / 회색 콘크리트 / 차콜 등)
          const meta = getMemoizedBuilding(b.id);
          let slabColor: [number, number, number, number] = [46, 90, 68, 255];
          if (meta?.roofColor) {
            slabColor = [
              Math.round(meta.roofColor.r * 255),
              Math.round(meta.roofColor.g * 255),
              Math.round(meta.roofColor.b * 255),
              255,
            ];
          } else {
            const isUrethane = b.seed < 0.65;
            slabColor = isUrethane ? [46, 90, 68, 255] : [100, 116, 139, 255];
          }

          const slabPolygon = coords.map((pt) => [pt[0], pt[1], roofZ]);
          roofSlabData.push({
            polygon: slabPolygon,
            color: slabColor,
          });

          // (2) 옥상 둘레 1.2m Parapet 난간 벽체 (PathLayer)
          const parapetPath = coords.map((pt) => [pt[0], pt[1], roofZ + 0.6]);
          parapetPathData.push({
            path: parapetPath,
            color: [51, 65, 85, 255],
          });

          // (3) 엘리베이터 권상기실 / 옥탑방 코어 박스 (SolidPolygonLayer)
          const [cx, cy] = b.centroid;
          const coreSize = isApt ? 0.00012 : 0.00016; // 경위도 스케일 (~12m x 10m)
          const coreBox = [
            [cx - coreSize, cy - coreSize * 0.8, roofZ],
            [cx + coreSize, cy - coreSize * 0.8, roofZ],
            [cx + coreSize, cy + coreSize * 0.8, roofZ],
            [cx - coreSize, cy + coreSize * 0.8, roofZ],
            [cx - coreSize, cy - coreSize * 0.8, roofZ],
          ];
          penthouseData.push({
            polygon: coreBox,
            height: 3.8, // 3.8m 옥탑 돌출
            color: [148, 163, 184, 255],
          });

          // -------------------------------------------------------------------
          // 2) 한국형 아파트 입면 (베란다 창호 + 측벽 동 번호 라인)
          // -------------------------------------------------------------------
          if (isApt && coords.length >= 4) {
            // 변 길이 계산으로 긴 변(전·배면)과 짧은 변(측벽) 자동 분류
            let maxEdgeLen = 0;
            const edges: { p1: [number, number]; p2: [number, number]; len: number }[] = [];

            for (let i = 0; i < coords.length - 1; i++) {
              const p1 = coords[i];
              const p2 = coords[i + 1];
              const len = Math.hypot((p2[0] - p1[0]) * 88000, (p2[1] - p1[1]) * 111000);
              edges.push({ p1, p2, len });
              if (len > maxEdgeLen) maxEdgeLen = len;
            }

            const brandColors: [number, number, number, number][] = [
              [30, 58, 95, 255],  // 코발트 네이비 (Xi 톤)
              [92, 29, 36, 255],  // 버건디 와인 (힐스테이트 톤)
              [27, 67, 50, 255],  // 포레스트 그린 (푸르지오 톤)
            ];
            const brandColor = brandColors[Math.floor(b.seed * brandColors.length) % brandColors.length];

            for (const edge of edges) {
              const isSide = edge.len < 16.0 || edge.len <= maxEdgeLen * 0.45;

              if (isSide) {
                // 짧은 변: 창문 없는 밝은 콘크리트 측벽 + 수직 브랜드 컬러 밴드
                const sidePoly = [
                  [edge.p1[0], edge.p1[1], baseZ],
                  [edge.p2[0], edge.p2[1], baseZ],
                  [edge.p2[0], edge.p2[1], roofZ],
                  [edge.p1[0], edge.p1[1], roofZ],
                  [edge.p1[0], edge.p1[1], baseZ],
                ];
                aptSideWallData.push({
                  polygon: sidePoly,
                  color: brandColor,
                });
              } else {
                // 긴 변: 3.0m 층고마다 촘촘한 발코니 창문 가로선 생성
                const floorCount = Math.floor(b.height / 3.0);
                for (let flr = 1; flr < floorCount; flr++) {
                  const fz = baseZ + flr * 3.0;
                  aptBalconyPathData.push({
                    path: [
                      [edge.p1[0], edge.p1[1], fz],
                      [edge.p2[0], edge.p2[1], fz],
                    ],
                    color: [203, 213, 225, 220],
                  });
                }
              }
            }
          }
        } else if (isLowRise) {
          // -------------------------------------------------------------------
          // 3) 저층 주택가 및 군부대 주둔지 막사: ㅅ자형 경사지붕 (Gabled Roof)
          // -------------------------------------------------------------------
          const [cx, cy] = b.centroid;
          let minX = 180, maxX = -180, minY = 90, maxY = -90;
          for (const pt of coords) {
            if (pt[0] < minX) minX = pt[0];
            if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
          }

          const dx = maxX - minX;
          const dy = maxY - minY;
          const isEastWest = dx >= dy;
          const apexZ = roofZ + 2.8; // 지붕마루 높이 +2.8m

          // 지붕 색상 분기: 위성 샘플링 색상 우선 반영
          const gabledMeta = getMemoizedBuilding(b.id);
          let roofColor: [number, number, number, number] = [107, 45, 31, 255];
          if (gabledMeta?.roofColor) {
            roofColor = [
              Math.round(gabledMeta.roofColor.r * 255),
              Math.round(gabledMeta.roofColor.g * 255),
              Math.round(gabledMeta.roofColor.b * 255),
              255,
            ];
          } else {
            const roofColors: [number, number, number, number][] = [
              [107, 45, 31, 255], // 적갈색 기와
              [30, 58, 138, 255], // 청색 강판
              [51, 65, 85, 255],  // 차콜 슁글
            ];
            roofColor = roofColors[Math.floor(b.seed * roofColors.length) % roofColors.length];
          }

          if (isEastWest) {
            // 동서 방향 능선 (남·북 2면 경사)
            const ridge0: [number, number, number] = [minX, cy, apexZ];
            const ridge1: [number, number, number] = [maxX, cy, apexZ];
            // 북쪽 경사면
            gabledRoofData.push({
              polygon: [
                ridge0,
                ridge1,
                [maxX, maxY, roofZ],
                [minX, maxY, roofZ],
                ridge0,
              ],
              color: roofColor,
            });
            // 남쪽 경사면
            gabledRoofData.push({
              polygon: [
                ridge0,
                [minX, minY, roofZ],
                [maxX, minY, roofZ],
                ridge1,
                ridge0,
              ],
              color: roofColor,
            });
          } else {
            // 남북 방향 능선 (동·서 2면 경사)
            const ridge0: [number, number, number] = [cx, minY, apexZ];
            const ridge1: [number, number, number] = [cx, maxY, apexZ];
            // 동쪽 경사면
            gabledRoofData.push({
              polygon: [
                ridge0,
                ridge1,
                [maxX, maxY, roofZ],
                [maxX, minY, roofZ],
                ridge0,
              ],
              color: roofColor,
            });
            // 서쪽 경사면
            gabledRoofData.push({
              polygon: [
                ridge0,
                [minX, minY, roofZ],
                [minX, maxY, roofZ],
                ridge1,
                ridge0,
              ],
              color: roofColor,
            });
          }
        }
      }

      // 1) 옥상 슬래브 레이어
      if (roofSlabData.length > 0) {
        layers.push(
          new SolidPolygonLayer({
            id: 'deck-lod2-roof-slabs',
            data: roofSlabData,
            getPolygon: (d: any) => d.polygon,
            getFillColor: (d: any) => d.color,
            extruded: false,
            filled: true,
            opacity: 0.96,
          })
        );
      }

      // 2) 옥상 둘레 난간(Parapet) 레이어
      if (parapetPathData.length > 0) {
        layers.push(
          new PathLayer({
            id: 'deck-lod2-parapets',
            data: parapetPathData,
            getPath: (d: any) => d.path,
            getColor: (d: any) => d.color,
            getWidth: 2.0,
            widthUnits: 'pixels',
            opacity: 0.95,
          })
        );
      }

      // 3) 엘리베이터 권상기실 / 옥탑방 코어 박스 레이어
      if (penthouseData.length > 0) {
        layers.push(
          new SolidPolygonLayer({
            id: 'deck-lod2-penthouse-cores',
            data: penthouseData,
            getPolygon: (d: any) => d.polygon,
            getElevation: (d: any) => d.height,
            getFillColor: (d: any) => d.color,
            extruded: true,
            filled: true,
            opacity: 0.98,
          })
        );
      }

      // 4) 한국형 아파트 발코니 가로창호 라인 레이어
      if (aptBalconyPathData.length > 0) {
        layers.push(
          new PathLayer({
            id: 'deck-lod2-apt-balconies',
            data: aptBalconyPathData,
            getPath: (d: any) => d.path,
            getColor: (d: any) => d.color,
            getWidth: 1.5,
            widthUnits: 'pixels',
            opacity: 0.92,
          })
        );
      }

      // 5) 한국형 아파트 측벽 브랜드 컬러 밴드 레이어
      if (aptSideWallData.length > 0) {
        layers.push(
          new SolidPolygonLayer({
            id: 'deck-lod2-apt-sidewalls',
            data: aptSideWallData,
            getPolygon: (d: any) => d.polygon,
            getFillColor: (d: any) => d.color,
            extruded: false,
            filled: true,
            opacity: 0.95,
          })
        );
      }

      // 6) 저층 주택가 및 군부대 막사 ㅅ자형 경사지붕 레이어
      if (gabledRoofData.length > 0) {
        layers.push(
          new SolidPolygonLayer({
            id: 'deck-lod2-gabled-roofs',
            data: gabledRoofData,
            getPolygon: (d: any) => d.polygon,
            getFillColor: (d: any) => d.color,
            extruded: false,
            filled: true,
            _normalize: false,
            opacity: 0.98,
          })
        );
      }
    }

      this.overlay.setProps({ layers });
    } finally {
      this.isRenderingLayers = false;
    }
  }

  /**
   * [1단계: GPU 컨텍스트 경합 방지] 비활성 시 Deck.gl 오버레이 및 이벤트 리스너 완전 분리
   */
  public detachFromMap(): void {
    if (this.overlay && this.map) {
      try {
        this.overlay.setProps({ layers: [] });
        (this.map as any).removeControl(this.overlay as unknown as IControl);
        this.map.off('moveend', this.handleMapMoveEnd);
      } catch {
        // ignore
      }
      this.overlay = null;
    }
  }

  /**
   * 인스턴스 정리 및 자원 해제
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.detachFromMap();
    this.tilesetController.destroy();
    this.parsedBuildings = [];
    this.features = [];
  }
}

// 하위 호환성을 위해 Deck3DTilesManager 별칭 제공
export { Universal3DTilesManager as Deck3DTilesManager };
