/**
 * workers/buildingMeshWorker.ts
 *
 * OSMBuildings & earcut 기반 건물 지오메트리 전용 Web Worker
 * - 메인 스레드 블로킹(10ms+ Earcut & 압출 연산) 100% 제거
 * - 완성된 단일 Float32Array 버퍼들을 Transferable Objects(0-copy)로 즉시 반환
 */

import {
  buildOsmBuildingGeometry,
  OSMGeometryOptions,
  OSMGeometryResult,
} from '@/lib/vendor/osmGeometryBuilder';

export interface BuildingWorkerMessage {
  id: number;
  type: 'BUILD_BUILDINGS';
  payload: OSMGeometryOptions;
}

export interface BuildingWorkerResponse {
  id: number;
  type: 'BUILD_BUILDINGS';
  success: boolean;
  result?: OSMGeometryResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<BuildingWorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'BUILD_BUILDINGS') {
      const result = buildOsmBuildingGeometry(payload);

      // Transferable Objects (복사 비용 0ms, ArrayBuffer 소유권 이전)
      const transferList: Transferable[] = [
        result.positions.buffer as ArrayBuffer,
        result.normals.buffer as ArrayBuffer,
        result.uvs.buffer as ArrayBuffer,
        result.colors.buffer as ArrayBuffer,
        result.buildingData.buffer as ArrayBuffer,
        result.demCoords.buffer as ArrayBuffer,
        result.shadowPositions.buffer as ArrayBuffer,
        result.shadowColors.buffer as ArrayBuffer,
      ];

      const response: BuildingWorkerResponse = {
        id,
        type,
        success: true,
        result,
      };

      (self as any).postMessage(response, transferList);
    } else {
      (self as any).postMessage({
        id,
        type,
        success: false,
        error: `Unknown worker action: ${type}`,
      });
    }
  } catch (err: any) {
    (self as any).postMessage({
      id,
      type,
      success: false,
      error: err?.message || String(err),
    });
  }
};
