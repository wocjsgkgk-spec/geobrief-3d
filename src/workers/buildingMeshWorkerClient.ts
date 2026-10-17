/**
 * workers/buildingMeshWorkerClient.ts
 *
 * Web Worker (buildingMeshWorker.ts)와 통신하는 전용 싱글톤 클라이언트 래퍼
 * - 메인 스레드 0ms 블로킹 보장
 * - Transferable Objects 기반 초고속 0-copy 버퍼 수신
 * - SSR 및 Worker 미지원 브라우저 대비 안전한 Fallback 제공
 */

import type { OSMGeometryOptions, OSMGeometryResult } from '@/lib/vendor/osmGeometryBuilder';

export type { OSMGeometryOptions, OSMGeometryResult };

class BuildingMeshWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (val: OSMGeometryResult) => void; reject: (err: any) => void }
  >();

  private getWorker(): Worker | null {
    if (typeof window === 'undefined') return null;

    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./buildingMeshWorker.ts', import.meta.url));
        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = this.handleError.bind(this);
      } catch (err) {
        console.warn('[BuildingMeshWorkerClient] Failed to spawn Worker:', err);
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
    if (success && result) {
      req.resolve(result);
    } else {
      req.reject(new Error(error || 'Worker computation error'));
    }
  }

  private handleError(event: ErrorEvent): void {
    console.error('[BuildingMeshWorkerClient] Worker runtime error:', event.message);
    for (const [, req] of this.pendingRequests) {
      req.reject(new Error(event.message || 'Worker runtime error'));
    }
    this.pendingRequests.clear();
  }

  /**
   * 건물의 정점 버퍼(Position, Normal, UV, Color, Shading Data)를 백그라운드 Worker에서 일괄 직렬화
   */
  public async buildBuildings(payload: OSMGeometryOptions): Promise<OSMGeometryResult | null> {
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

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.clear();
    }
  }
}

export const buildingMeshWorkerClient = new BuildingMeshWorkerClient();
