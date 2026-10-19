/**
 * customLayerMatrix.ts
 *
 * MapLibre v3 / v4 / v5 CustomLayer render() 투영 행렬 안전 추출 및 검증 유틸리티
 * - MapLibre v3: render(gl, matrix: Float64Array | number[])
 * - MapLibre v4 / v5: render(gl, args: CustomRenderMethodInput)
 * - MapLibre 버전에 따라 args가 객체 또는 배열로 전달되더라도
 *   16개 유효 숫자(Float32Array/Float64Array/Array)를 안전하게 추출하고,
 *   NaN이나 undefined로 인한 Three.js 카메라 투영 행렬 오염을 원천 차단합니다.
 */

import type maplibregl from 'maplibre-gl';

export function extractCustomLayerMatrix(
  args: any,
  map?: maplibregl.Map | null
): Float64Array | Float32Array | number[] | null {
  if (args) {
    // 1) args 자체가 16개 이상의 배열 또는 TypedArray인 경우 (MapLibre v3 호환)
    if ((Array.isArray(args) || ArrayBuffer.isView(args)) && (args as any).length >= 16) {
      if (isValidMatrix(args)) return args as any;
    }

    // 2) MapLibre v4 / v5 구조체 내부 행렬 탐색
    const candidates = [
      args.defaultProjectionData?.mainMatrix,
      args.modelViewProjectionMatrix,
      args.projectionMatrix,
      args.viewProjectionMatrix,
      args.matrix,
      args.mainMatrix,
      args.u_matrix,
    ];

    for (const c of candidates) {
      if (c && (Array.isArray(c) || ArrayBuffer.isView(c)) && (c as any).length >= 16) {
        if (isValidMatrix(c)) return c as any;
      }
    }
  }

  // 3) 최후의 안전망: map.transform.customLayerMatrix()에서 실시간 추출
  if (map) {
    try {
      const transform = (map as any).transform || (map as any).painter?.transform;
      if (transform && typeof transform.customLayerMatrix === 'function') {
        const mat: any = transform.customLayerMatrix();
        if (mat && (Array.isArray(mat) || ArrayBuffer.isView(mat)) && (mat as any).length >= 16) {
          if (isValidMatrix(mat)) return mat as any;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function isValidMatrix(arr: any): boolean {
  if (!arr || typeof arr.length !== 'number' || arr.length < 16) return false;
  for (let i = 0; i < 16; i++) {
    const val = arr[i];
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      return false;
    }
  }
  return true;
}
