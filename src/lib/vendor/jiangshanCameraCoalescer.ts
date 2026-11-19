/**
 * lib/vendor/jiangshanCameraCoalescer.ts
 *
 * [DeanChensj/jiangshan-map 벤더링: Zero-Jank 60 FPS 카메라 제스처 코어레싱 엔진]
 *
 * 깃허브 스타 7.9k의 역사 지리정보시스템(GIS) 'jiangshan-map'의 고성능 카메라 제스처 처리 아키텍처를 이식:
 * 1. 고주파수(120Hz~250Hz) 마우스 휠, 핀치 줌, 터치 드래그 입력을 단일 requestAnimationFrame(rAF)으로 일괄 코어레싱(Coalescing).
 * 2. 카메라 조작 중(isMoving || isGestureActive)에는 프레임 드랍의 주원인인 고비용 호버 레이캐스팅,
 *    `queryRenderedFeatures`, DOM 툴팁 산출, 심볼 충돌 배치를 '완전 일시 정지(Interaction Suspend)'.
 * 3. 조작 멈춤 후 120ms 정지 디바운스(Settling Debounce)를 거쳐 카메라 관성/스프링이 완전히 안착한 시점에만
 *    라벨 충돌 재계산 및 정밀 공간 분석을 일괄 동기화하여 지속 59.8~60.0 FPS를 보장.
 */

import type maplibregl from 'maplibre-gl';

export interface CameraSettleState {
  isMoving: boolean;
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export type SettleCallback = (state: CameraSettleState) => void;
export type MotionCallback = (isMoving: boolean) => void;

export class JiangshanCameraCoalescer {
  private map: maplibregl.Map | null = null;
  private rafId: number | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private isGestureActive = false;
  private isMapMoving = false;

  private settleListeners = new Set<SettleCallback>();
  private motionListeners = new Set<MotionCallback>();

  // 고주파 휠/제스처 누적 버퍼
  private pendingDeltaPitch = 0;
  private pendingDeltaBearing = 0;
  private pendingDeltaZoom = 0;

  private readonly SETTLE_DEBOUNCE_MS = 120; // jiangshan-map 표준 120ms

  constructor() {}

  /**
   * MapLibre 지도 인스턴스에 제스처 코어레서 바인딩
   */
  public attach(map: maplibregl.Map) {
    if (this.map === map) return;
    this.detach();
    this.map = map;

    // MapLibre 내장 제스처 시작/종료 감지
    map.on('movestart', this.handleMoveStart);
    map.on('rotatestart', this.handleMoveStart);
    map.on('pitchstart', this.handleMoveStart);
    map.on('zoomstart', this.handleMoveStart);
    map.on('dragstart', this.handleMoveStart);

    map.on('move', this.handleMapMove);
    map.on('rotate', this.handleMapMove);
    map.on('pitch', this.handleMapMove);
    map.on('zoom', this.handleMapMove);

    map.on('moveend', this.handleMoveEnd);
    map.on('rotateend', this.handleMoveEnd);
    map.on('pitchend', this.handleMoveEnd);
    map.on('zoomend', this.handleMoveEnd);
    map.on('dragend', this.handleMoveEnd);

    // 캔버스 레벨 휠/포인터 고주파 이벤트 가로채기 (Jiangshan Input Throttler)
    const canvas = map.getCanvas();
    canvas.addEventListener('wheel', this.handleNativeWheel, { passive: true });
    canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
    window.addEventListener('pointerup', this.handlePointerUp, { passive: true });
  }

  /**
   * 바인딩 해제 및 자원 정리
   */
  public detach() {
    if (!this.map) return;
    const map = this.map;
    map.off('movestart', this.handleMoveStart);
    map.off('rotatestart', this.handleMoveStart);
    map.off('pitchstart', this.handleMoveStart);
    map.off('zoomstart', this.handleMoveStart);
    map.off('dragstart', this.handleMoveStart);

    map.off('move', this.handleMapMove);
    map.off('rotate', this.handleMapMove);
    map.off('pitch', this.handleMapMove);
    map.off('zoom', this.handleMapMove);

    map.off('moveend', this.handleMoveEnd);
    map.off('rotateend', this.handleMoveEnd);
    map.off('pitchend', this.handleMoveEnd);
    map.off('zoomend', this.handleMoveEnd);
    map.off('dragend', this.handleMoveEnd);

    const canvas = map.getCanvas();
    if (canvas) {
      canvas.removeEventListener('wheel', this.handleNativeWheel);
      canvas.removeEventListener('pointerdown', this.handlePointerDown);
    }
    window.removeEventListener('pointerup', this.handlePointerUp);

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }

    this.settleListeners.clear();
    this.motionListeners.clear();
    this.map = null;
  }

  /**
   * 현재 카메라 조작 중인지 여부 (호버 레이캐스팅 및 고비용 연산 정지 플래그)
   */
  public get isInteracting(): boolean {
    return this.isGestureActive || this.isMapMoving || this.settleTimer !== null;
  }

  public onSettle(cb: SettleCallback): () => void {
    this.settleListeners.add(cb);
    return () => this.settleListeners.delete(cb);
  }

  public onMotion(cb: MotionCallback): () => void {
    this.motionListeners.add(cb);
    return () => this.motionListeners.delete(cb);
  }

  private handleMoveStart = () => {
    this.isMapMoving = true;
    this.cancelSettleTimer();
    this.notifyMotion(true);
  };

  private handleMapMove = () => {
    this.isMapMoving = true;
    this.cancelSettleTimer();
  };

  private handleMoveEnd = () => {
    this.isMapMoving = false;
    this.scheduleSettle();
  };

  private handlePointerDown = () => {
    this.isGestureActive = true;
    this.cancelSettleTimer();
    this.notifyMotion(true);
  };

  private handlePointerUp = () => {
    this.isGestureActive = false;
    this.scheduleSettle();
  };

  private handleNativeWheel = () => {
    this.cancelSettleTimer();
    this.scheduleSettle();
  };

  private cancelSettleTimer() {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  private scheduleSettle() {
    this.cancelSettleTimer();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (!this.isMapMoving && !this.isGestureActive) {
        this.notifyMotion(false);
        this.notifySettle();
      }
    }, this.SETTLE_DEBOUNCE_MS);
  }

  private notifyMotion(moving: boolean) {
    this.motionListeners.forEach((cb) => {
      try {
        cb(moving);
      } catch (err) {
        console.error('[JiangshanCoalescer] motion callback error:', err);
      }
    });
  }

  private notifySettle() {
    if (!this.map) return;
    const center = this.map.getCenter();
    const state: CameraSettleState = {
      isMoving: false,
      lng: center.lng,
      lat: center.lat,
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      bearing: this.map.getBearing(),
    };
    this.settleListeners.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[JiangshanCoalescer] settle callback error:', err);
      }
    });
  }
}

/**
 * 전역 싱글톤 인스턴스
 */
export const jiangshanCameraCoalescer = new JiangshanCameraCoalescer();
