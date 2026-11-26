/**
 * src/lib/vendor/openSource3DAdapters.ts
 *
 * [오픈소스 3D 통합 어댑터 (camera-controls 감쇠 보간, 3D Tiles 프러스텀 컬링, GeoTIFF/RTIN 지형)]
 * - 기존 V-World 3D 건물 파이프라인과 독립적으로 동작하는 보조 유틸리티 모음
 */

export interface DampedCameraState {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * [pmndrs/camera-controls 방식] 지수 감쇠(Damping) 기반 부드러운 드론 투어 보간기
 */
export function stepDampedCamera(
  current: DampedCameraState,
  target: DampedCameraState,
  deltaSec: number,
  smoothTime: number = 0.35
): DampedCameraState {
  const alpha = 1 - Math.exp(-deltaSec / Math.max(0.05, smoothTime));
  return {
    lng: current.lng + (target.lng - current.lng) * alpha,
    lat: current.lat + (target.lat - current.lat) * alpha,
    zoom: current.zoom + (target.zoom - current.zoom) * alpha,
    pitch: current.pitch + (target.pitch - current.pitch) * alpha,
    bearing: current.bearing + (target.bearing - current.bearing) * alpha,
  };
}

/**
 * [mapbox/martini 스타일] DEM 그리드에서 경사도 기반 중요 샘플 포인트 추출 (RTIN 경량화 보조)
 */
export function extractAdaptiveTerrainSamples(
  elevGrid: Float32Array,
  gridSize: number,
  errorThresholdM: number = 2.0
): Array<{ x: number; y: number; elev: number }> {
  const samples: Array<{ x: number; y: number; elev: number }> = [];
  const step = Math.max(1, Math.floor(gridSize / 32));
  for (let y = 0; y < gridSize; y += step) {
    for (let x = 0; x < gridSize; x += step) {
      const idx = y * gridSize + x;
      const elev = elevGrid[idx] ?? 0;
      const right = elevGrid[Math.min(gridSize - 1, x + step) + y * gridSize] ?? elev;
      const down = elevGrid[x + Math.min(gridSize - 1, y + step) * gridSize] ?? elev;
      if (Math.abs(elev - right) >= errorThresholdM || Math.abs(elev - down) >= errorThresholdM || x === 0 || y === 0) {
        samples.push({ x, y, elev });
      }
    }
  }
  return samples;
}
