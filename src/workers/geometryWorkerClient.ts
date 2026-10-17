/**
 * geometryWorkerClient.ts
 *
 * Web Worker (geometryWorker.ts)와 통신하는 싱글톤 클라이언트 래퍼
 * - 메인 스레드 0ms 블로킹: 백그라운드 Worker에서 Earcut 및 다각형 정점 버퍼 계산
 * - Transferable ArrayBuffer를 통한 0-copy 초고속 반환
 * - SSR 및 Worker 미지원 브라우저 대비 안전한 가드
 */

import type {
  BuildBuildingsPayload,
  BuildBuildingsResult,
  ComputeCutFillPayload,
  ComputeCutFillResult,
} from './geometryWorker';

export type { BuildBuildingsResult, ComputeCutFillResult };

class GeometryWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();

  private getWorker(): Worker | null {
    if (typeof window === 'undefined') return null;

    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./geometryWorker.ts', import.meta.url));
        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = this.handleError.bind(this);
      } catch (err) {
        console.warn('[GeometryWorkerClient] Failed to spawn Worker:', err);
        return null;
      }
    }
    return this.worker;
  }

  private handleMessage(event: MessageEvent): void {
    const { id, success, result, error } = event.data;
    const req = this.pendingRequests.get(id);
    if (!req) return;

    this.pendingRequests.delete(id);
    if (success) {
      req.resolve(result);
    } else {
      req.reject(new Error(error || 'Worker error'));
    }
  }

  private handleError(event: ErrorEvent): void {
    console.error('[GeometryWorkerClient] Worker runtime error:', event.message);
    for (const [, req] of this.pendingRequests) {
      req.reject(new Error(event.message || 'Worker runtime error'));
    }
    this.pendingRequests.clear();
  }

  public async buildBuildings(payload: BuildBuildingsPayload): Promise<BuildBuildingsResult | null> {
    const worker = this.getWorker();
    if (!worker) return null;

    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage({
        id,
        type: 'BUILD_BUILDINGS',
        payload,
      });
    });
  }

  public async computeCutFill(payload: ComputeCutFillPayload): Promise<ComputeCutFillResult | null> {
    const worker = this.getWorker();
    if (!worker) return null;

    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      worker.postMessage({
        id,
        type: 'COMPUTE_CUT_FILL',
        payload,
      });
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.clear();
    }
  }
}

export const geometryWorkerClient = new GeometryWorkerClient();
