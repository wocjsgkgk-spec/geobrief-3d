import * as turf from '@turf/turf';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Measure3DResult } from '@/types/map';

/**
 * 두 지점 사이의 지형 표고 굴곡을 정밀 샘플링하여 3D 실제 지표 거리, 고저차, 평균 경사도를 계산합니다.
 */
export function calculate3DMeasurement(
  map: MapLibreMap,
  point1: [number, number],
  point2: [number, number],
  samples = 24
): Measure3DResult {
  const p1 = turf.point(point1);
  const p2 = turf.point(point2);

  // 1. 2D 수평 거리 (m)
  const horizontalDistanceMeters = Math.round(
    turf.distance(p1, p2, { units: 'kilometers' }) * 1000
  );

  // 2. 시작점과 끝점 표고 (m)
  const rawElev1 = map.queryTerrainElevation ? map.queryTerrainElevation(point1) : 0;
  const rawElev2 = map.queryTerrainElevation ? map.queryTerrainElevation(point2) : 0;
  const elev1 = rawElev1 !== null && rawElev1 !== undefined ? rawElev1 : 0;
  const elev2 = rawElev2 !== null && rawElev2 !== undefined ? rawElev2 : 0;

  const elevationDeltaMeters = Math.round((elev2 - elev1) * 10) / 10;

  // 3. 직선 3D 공간 거리 (피타고라스)
  const directDistanceMeters = Math.round(
    Math.sqrt(
      horizontalDistanceMeters * horizontalDistanceMeters +
        elevationDeltaMeters * elevationDeltaMeters
    )
  );

  // 4. 지형 굴곡을 따라가는 3D 실측 지표 거리 (Surface Distance)
  let surfaceDistanceMeters = 0;
  let previousCoords = point1;
  let previousElev = elev1;

  for (let i = 1; i <= samples; i++) {
    const fraction = i / samples;
    // 대권 코스 상의 중간 지점 보간
    const midLng = point1[0] + (point2[0] - point1[0]) * fraction;
    const midLat = point1[1] + (point2[1] - point1[1]) * fraction;
    const currentCoords: [number, number] = [midLng, midLat];

    const rawCurrentElev = map.queryTerrainElevation
      ? map.queryTerrainElevation(currentCoords)
      : null;
    const currentElev =
      rawCurrentElev !== null && rawCurrentElev !== undefined
        ? rawCurrentElev
        : elev1 + (elev2 - elev1) * fraction;

    const segment2D =
      turf.distance(turf.point(previousCoords), turf.point(currentCoords), {
        units: 'kilometers',
      }) * 1000;
    const deltaH = currentElev - previousElev;
    const segment3D = Math.sqrt(segment2D * segment2D + deltaH * deltaH);

    surfaceDistanceMeters += segment3D;
    previousCoords = currentCoords;
    previousElev = currentElev;
  }

  surfaceDistanceMeters = Math.round(surfaceDistanceMeters);

  // 5. 평균 경사도 및 경사각 계산
  const slopePercent =
    horizontalDistanceMeters > 0
      ? Math.round((Math.abs(elevationDeltaMeters) / horizontalDistanceMeters) * 1000) / 10
      : 0;

  const slopeDegrees =
    horizontalDistanceMeters > 0
      ? Math.round(
          (Math.atan(Math.abs(elevationDeltaMeters) / horizontalDistanceMeters) * 180) / Math.PI * 10
        ) / 10
      : 0;

  return {
    points: [point1, point2],
    elevations: [Math.round(elev1 * 10) / 10, Math.round(elev2 * 10) / 10],
    horizontalDistanceMeters,
    surfaceDistanceMeters,
    directDistanceMeters,
    elevationDeltaMeters,
    slopePercent,
    slopeDegrees,
  };
}
