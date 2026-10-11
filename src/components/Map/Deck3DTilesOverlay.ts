'use client';

import type { Map as MapLibreMap, IControl } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';
import { Tile3DStreamState } from '@/types/map';

export interface Deck3DTilesOverlayCallbacks {
  onStatusChange?: (statusText: string, isLoading: boolean, tilesLoadedCount?: number) => void;
}

/**
 * MapLibre GL JS 위에서 Deck.gl MapboxOverlay를 통해
 * 3D Tiles(b3dm, pnts 포인트 클라우드)를 LOD 프러스텀 컬링 방식으로 스트리밍 렌더링하는 매니저 클래스입니다.
 */
export class Deck3DTilesManager {
  private map: MapLibreMap | null = null;
  private overlay: MapboxOverlay | null = null;
  private callbacks: Deck3DTilesOverlayCallbacks = {};
  private loadedTilesCounter: number = 0;
  private isDestroyed: boolean = false;

  constructor(callbacks?: Deck3DTilesOverlayCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /**
   * MapLibre 지도 인스턴스에 Deck.gl MapboxOverlay 컨트롤을 초기화 및 장착합니다.
   */
  public attachToMap(map: MapLibreMap): void {
    if (typeof window === 'undefined' || !map) return;
    this.map = map;
    this.isDestroyed = false;

    try {
      // MapboxOverlay는 MapLibre IControl 규격을 준수하여 카메라와 100% 동기화됩니다.
      this.overlay = new MapboxOverlay({
        interleaved: true, // MapLibre 3D 공간과 깊이 버퍼 인터리빙
        layers: [],
      });

      // MapLibre 컨트롤로 주입
      (this.map as any).addControl(this.overlay as unknown as IControl);
    } catch (err) {
      console.error('[Deck3DTilesManager] Failed to attach MapboxOverlay to MapLibre:', err);
    }
  }

  /**
   * 3D Tiles 스트리밍 상태에 맞춰 Deck.gl 레이어를 갱신합니다.
   */
  public update(state: Tile3DStreamState): void {
    if (!this.overlay || this.isDestroyed) return;

    if (!state.enabled || !state.url) {
      this.overlay.setProps({ layers: [] });
      this.loadedTilesCounter = 0;
      return;
    }

    try {
      this.callbacks.onStatusChange?.('3D Tiles 스트리밍 연결 중...', true, this.loadedTilesCounter);

      const tile3DLayer = new Tile3DLayer({
        id: 'streaming-tile-3d-layer',
        data: state.url,
        loader: Tiles3DLoader,
        // LOD 프러스텀 컬링 파라미터 (화면 공간 오차 한계)
        maximumScreenSpaceError: state.maximumScreenSpaceError || 16,
        opacity: state.opacity !== undefined ? state.opacity : 1.0,
        pointSize: state.pointSize || 2.0,
        pickable: true,
        loadOptions: {
          tiles3d: {
            loadGLTF: true,
          },
        },
        onTilesetLoad: (tileset: any) => {
          this.loadedTilesCounter = 1;
          const rootType = tileset?.root?.content?.uri || tileset?.root?.content?.url || '3D Model';
          this.callbacks.onStatusChange?.(
            `타일셋 메타데이터 수신 완료 (LOD 트랙)`,
            false,
            this.loadedTilesCounter
          );
        },
        onTileLoad: () => {
          this.loadedTilesCounter += 1;
          this.callbacks.onStatusChange?.(
            `스트리밍 중 (${this.loadedTilesCounter}개 노드 로드)`,
            false,
            this.loadedTilesCounter
          );
        },
        onTileError: (tileHeader: any, message: string) => {
          console.warn('[Deck3DTilesManager] Tile load error:', message);
          this.callbacks.onStatusChange?.(`일부 타일 수신 실패 (${message})`, false, this.loadedTilesCounter);
        },
      });

      this.overlay.setProps({
        layers: [tile3DLayer],
      });
    } catch (err: any) {
      console.error('[Deck3DTilesManager] Failed to update Tile3DLayer:', err);
      this.callbacks.onStatusChange?.(`레이어 생성 오류: ${err.message || '알 수 없음'}`, false, 0);
    }
  }

  /**
   * 컨트롤 제거 및 메모리 해제
   */
  public destroy(): void {
    this.isDestroyed = true;
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
  }
}
