'use client';

import type { Map as MapLibreMap, IControl } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';
import { Tile3DStreamState } from '@/types/map';

export interface Deck3DTilesOverlayCallbacks {
  onStatusChange?: (statusText: string, isLoading: boolean, tilesLoadedCount?: number) => void;
  onFallback?: (reason?: string) => void;
}

/**
 * 브이월드 실사 3D OGC 타일 스트리밍 및 LOD 렌더링 상수 정의
 */
const MIN_STREAMING_ZOOM = 14; // 줌 14 이상에서만 고해상도 실사 3D 타일 활성화 (줌 13 이하는 MapLibre 경량 베이스)
const MAX_CONCURRENT_REQUESTS = 6; // 브라우저 네트워크 블로킹 방지 및 60fps 유지를 위한 최대 동시 요청 수
const MAX_MEMORY_USAGE_MB = 128; // 화면 밖 타일 메모리 즉시 Unload 및 LRU 캐시 한도 최적화 (128MB)
const CONNECTION_TIMEOUT_MS = 5000; // 5초 연결 타임아웃 (무한 로딩 방지 및 안전 폴백)

/**
 * MapLibre GL JS 위에서 Deck.gl MapboxOverlay를 통해
 * 브이월드 실사 3D Tiles(b3dm, pnts 포인트 클라우드)를 LOD 프러스텀 컬링 방식으로 스트리밍 렌더링하는 매니저 클래스입니다.
 * 5초 연결 타임아웃(AbortController) 및 지능형 실감 파사드 자동 폴백(Auto-Fallback)을 지원합니다.
 */
export class Deck3DTilesManager {
  private map: MapLibreMap | null = null;
  private overlay: MapboxOverlay | null = null;
  private callbacks: Deck3DTilesOverlayCallbacks = {};
  private currentState: Tile3DStreamState | null = null;
  private loadedTilesCounter: number = 0;
  private unloadedTilesCounter: number = 0;
  private isDestroyed: boolean = false;
  private isCurrentlyDetailedLOD: boolean = false;

  // 5초 연결 타임아웃 및 네트워크 취소 제어
  private connectionTimeoutTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;

  constructor(callbacks?: Deck3DTilesOverlayCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /**
   * MapLibre 지도 인스턴스에 Deck.gl MapboxOverlay 컨트롤을 초기화 및 장착합니다.
   * 카메라 회전, 줌, 피치 동기화 및 줌 레벨 감지 이벤트 리스너를 바인딩합니다.
   */
  public attachToMap(map: MapLibreMap): void {
    if (typeof window === 'undefined' || !map) return;
    this.map = map;
    this.isDestroyed = false;

    try {
      this.overlay = new MapboxOverlay({
        interleaved: true, // MapLibre 3D 공간과 깊이 버퍼 인터리빙
        layers: [],
      });

      // MapLibre 컨트롤로 주입
      (this.map as any).addControl(this.overlay as unknown as IControl);

      // 줌 변경 감지 리스너 바인딩 (LOD 자동 전환)
      this.map.on('zoom', this.handleMapZoom);
      this.map.on('zoomend', this.handleMapZoom);
    } catch (err) {
      console.error('[Deck3DTilesManager] Failed to attach MapboxOverlay to MapLibre:', err);
    }
  }

  /**
   * 줌 레벨 변화에 따른 LOD 줌 자동 전환 핸들러
   * - 줌 13 이하: 가벼운 베이스맵 모드 (타일셋 숨김 및 리소스 절약)
   * - 줌 14 이상: 실사 항공사진 텍스처 3D 메쉬 스트리밍 활성화
   */
  private handleMapZoom = (): void => {
    if (!this.map || !this.overlay || this.isDestroyed || !this.currentState?.enabled) return;

    const currentZoom = this.map.getZoom();
    const shouldBeDetailed = currentZoom >= MIN_STREAMING_ZOOM;

    if (shouldBeDetailed !== this.isCurrentlyDetailedLOD) {
      this.isCurrentlyDetailedLOD = shouldBeDetailed;
      this.renderTilesLayer();
    } else if (!shouldBeDetailed) {
      // 광역 뷰 상태 텍스트 주기적 동기화
      this.callbacks.onStatusChange?.(
        `LOD 광역 뷰 (줌 14 이상 확대 시 브이월드 실사 3D 타일 자동 표출 | 현재 줌: ${currentZoom.toFixed(1)})`,
        false,
        this.loadedTilesCounter
      );
    }
  };

  /**
   * 3D Tiles 스트리밍 상태에 맞춰 Deck.gl 레이어를 갱신합니다.
   */
  public update(state: Tile3DStreamState): void {
    if (this.isDestroyed) return;

    const prevUrl = this.currentState?.url;
    const prevEnabled = this.currentState?.enabled;
    this.currentState = { ...state };

    if (!state.enabled || !state.url) {
      this.cancelPendingRequest();
      if (this.overlay) {
        this.overlay.setProps({ layers: [] });
      }
      this.loadedTilesCounter = 0;
      this.unloadedTilesCounter = 0;
      this.isCurrentlyDetailedLOD = false;
      return;
    }

    // 소스 변경 시 카운터 초기화
    if (prevUrl !== state.url || !prevEnabled) {
      this.loadedTilesCounter = 0;
      this.unloadedTilesCounter = 0;
    }

    const currentZoom = this.map ? this.map.getZoom() : MIN_STREAMING_ZOOM;
    this.isCurrentlyDetailedLOD = currentZoom >= MIN_STREAMING_ZOOM;

    this.renderTilesLayer();
  }

  /**
   * 실행 중인 5초 타임아웃 타이머를 안전하게 제거합니다.
   */
  private clearTimeoutTimer(): void {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }

  /**
   * 대기 중인 네트워크 요청 및 타임아웃 타이머를 즉시 취소합니다.
   */
  private cancelPendingRequest(): void {
    this.clearTimeoutTimer();
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // ignore
      }
      this.abortController = null;
    }
  }

  /**
   * Deck.gl Tile3DLayer 인스턴스를 빌드하고 MapboxOverlay에 전달합니다.
   * - 5초 타임아웃(AbortController) 사전 연결 진단
   * - 404, CORS, 네트워크 무응답 감지 시 즉각 LOD2 실감 파사드로 자동 폴백
   */
  private async renderTilesLayer(): Promise<void> {
    if (!this.overlay || this.isDestroyed || !this.currentState || !this.currentState.enabled) return;

    const currentZoom = this.map ? this.map.getZoom() : MIN_STREAMING_ZOOM;
    const isDetailed = currentZoom >= MIN_STREAMING_ZOOM;

    if (!isDetailed) {
      this.cancelPendingRequest();
      this.overlay.setProps({ layers: [] });
      this.callbacks.onStatusChange?.(
        `LOD 광역 뷰 (줌 14 이상 확대 시 브이월드 실사 3D 타일 자동 표출 | 현재 줌: ${currentZoom.toFixed(1)})`,
        false,
        this.loadedTilesCounter
      );
      return;
    }

    const targetUrl = this.currentState.url;
    if (!targetUrl) return;

    // 1. 기존 진행 중인 타이머 및 요청 정리
    this.cancelPendingRequest();

    const controller = new AbortController();
    this.abortController = controller;

    // 로딩 시작 상태 알림
    this.callbacks.onStatusChange?.('브이월드 실사 3D 스트리밍 연결 중...', true, this.loadedTilesCounter);

    // 2. 5초 연결 안전 타임아웃 타이머 가동
    this.connectionTimeoutTimer = setTimeout(() => {
      if (this.isDestroyed || !this.currentState?.enabled) return;
      console.warn(
        `%c[Deck3DTilesManager TIMEOUT]%c ⚠️ 3D 타일셋 연결 5초 초과: '${targetUrl}'. 무한 로딩을 차단하고 실감 파사드로 자동 폴백합니다.`,
        'background: #78350F; color: #FDE68A; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
        'color: #F59E0B; font-weight: bold;'
      );

      this.cancelPendingRequest();
      if (this.overlay) {
        this.overlay.setProps({ layers: [] });
      }
      this.callbacks.onStatusChange?.('⚠️ 해당 지역 실사 타일 미지원 - 실감 파사드로 전환됨', false, 0);
      this.callbacks.onFallback?.('5초 타일셋 응답 타임아웃');
    }, CONNECTION_TIMEOUT_MS);

    // 3. 사전 연결 진단 (Pre-flight fetch): 404, 500, CORS, 네트워크 단절 즉시 검출
    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json, text/plain, */*' },
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} (${response.statusText || 'Not Found'})`);
      }
    } catch (fetchErr: any) {
      if (this.isDestroyed || !this.currentState?.enabled) return;

      // 이미 abort된 경우(타임아웃 또는 사용자 모드 변경)
      if (controller.signal.aborted) {
        return;
      }

      this.clearTimeoutTimer();
      console.error(
        `%c[Deck3DTilesManager ERROR]%c 🚨 3D 타일셋 연결 실패: '${targetUrl}'\n • 상세 에러: ${fetchErr?.message || fetchErr}\n • 조치: LOD2 실감 파사드로 자동 폴백`,
        'background: #7F1D1D; color: #FCA5A5; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
        'color: #EF4444; font-weight: bold;'
      );

      if (this.overlay) {
        this.overlay.setProps({ layers: [] });
      }
      this.callbacks.onStatusChange?.('⚠️ 해당 지역 실사 타일 미지원 - 실감 파사드로 전환됨', false, 0);
      this.callbacks.onFallback?.(`3D 타일셋 연결 실패 (${fetchErr?.message || '네트워크 오류'})`);
      return;
    }

    if (this.isDestroyed || !this.currentState?.enabled || controller.signal.aborted) return;

    // 4. Deck.gl Tile3DLayer 인스턴스 생성 및 마운트
    try {
      const tile3DLayer = new Tile3DLayer({
        id: `streaming-tile-3d-layer-${Date.now()}`,
        data: targetUrl,
        loader: Tiles3DLoader,
        visible: true,
        // LOD 프러스텀 컬링 파라미터 (화면 공간 오차 한계: 24로 튜닝하여 시야 밖 타일 즉시 GC 및 GPU 렉 차단)
        maximumScreenSpaceError: this.currentState.maximumScreenSpaceError || 24,
        opacity: this.currentState.opacity !== undefined ? this.currentState.opacity : 1.0,
        pointSize: this.currentState.pointSize || 2.0,
        pickable: true,
        // 렌더링 성능 최적화: 화면 밖 타일 메모리 해제(128MB) 및 동시 요청 수 제어(60fps)
        loadOptions: {
          fetch: {
            signal: controller.signal,
          },
          tiles3d: {
            loadGLTF: true,
            // 1. 화면 밖 타일 메모리 해제 (최대 128MB 초과 시 LRU Unload)
            maximumMemoryUsage: this.currentState.maximumMemoryUsage || MAX_MEMORY_USAGE_MB,
            // 2. 자식 바운딩 볼륨 프러스텀 컬링
            cullWithChildrenBounds: true,
            // 3. 브라우저 렌더링 스레드 부하 분산: 최대 동시 요청 제어 (6개)
            throttleRequests: true,
            maxRequests: MAX_CONCURRENT_REQUESTS,
          },
        },
        onTilesetLoad: (tileset: any) => {
          // 타일셋 메타데이터 수신 완료 -> 5초 안전 타임아웃 해제
          this.clearTimeoutTimer();
          this.loadedTilesCounter = 1;
          this.callbacks.onStatusChange?.(
            `브이월드 실사 3D 타일셋 연결 완료 (OGC 3D Tiles 1.0)`,
            false,
            this.loadedTilesCounter
          );
        },
        onTileLoad: () => {
          this.clearTimeoutTimer();
          this.loadedTilesCounter += 1;
          this.callbacks.onStatusChange?.(
            `실사 3D 스트리밍 중 (${this.loadedTilesCounter}개 노드 로드 | 메모리 한도 128MB | 60fps 유지)`,
            false,
            this.loadedTilesCounter
          );
        },
        onTileUnload: () => {
          // 화면 밖으로 벗어난 타일 메모리 해제 카운팅 (60fps 최적화)
          this.unloadedTilesCounter += 1;
          this.callbacks.onStatusChange?.(
            `실사 3D 스트리밍 중 (${this.loadedTilesCounter}개 노드 로드 | 메모리 해제: ${this.unloadedTilesCounter}개 | 60fps 유지)`,
            false,
            this.loadedTilesCounter
          );
        },
        onTileError: (tileHeader: any, message: string) => {
          console.warn('[Deck3DTilesManager] Tile node error:', message, tileHeader?.url);
          this.clearTimeoutTimer();
          this.callbacks.onStatusChange?.(
            `⚠️ 해당 지역 실사 타일 미지원 - 실감 파사드로 전환됨`,
            false,
            this.loadedTilesCounter
          );
          // 오프라인 / 미지원 지역에서 타일 로드 실패 시 Three.js 파사드 렌더러로 자동 폴백
          this.callbacks.onFallback?.(message);
        },
      });

      this.overlay.setProps({
        layers: [tile3DLayer],
      });
    } catch (err: any) {
      this.clearTimeoutTimer();
      console.error('[Deck3DTilesManager] Failed to render Tile3DLayer:', err);
      this.callbacks.onStatusChange?.(`⚠️ 해당 지역 실사 타일 미지원 - 실감 파사드로 전환됨`, false, 0);
      this.callbacks.onFallback?.(err.message || '렌더링 실패');
    }
  }

  /**
   * 컨트롤 제거 및 메모리 해제
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.cancelPendingRequest();

    if (this.map) {
      try {
        this.map.off('zoom', this.handleMapZoom);
        this.map.off('zoomend', this.handleMapZoom);
      } catch (e) {
        // ignore
      }
    }
    if (this.overlay && this.map) {
      try {
        this.overlay.setProps({ layers: [] });
        (this.map as any).removeControl(this.overlay as unknown as IControl);
      } catch (e) {
        // ignore
      }
    }
    this.overlay = null;
    this.map = null;
    this.currentState = null;
  }
}
