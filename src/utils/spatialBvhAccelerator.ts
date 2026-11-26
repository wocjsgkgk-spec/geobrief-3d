/**
 * src/utils/spatialBvhAccelerator.ts
 *
 * [BVH 공간 레이캐스팅 가속 & Turf.js 고급 공간 연산 유틸리티]
 * - 3D 가시권(Viewshed) / 일조권 / 건물 피킹을 위한 경량 AABB 공간 분할 트리
 * - @turf/turf 기반 도로 오프셋 및 반경 세력권 생성 헬퍼
 */

import * as turf from '@turf/turf';

export interface SpatialBvhItem {
  id: string;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export class SpatialBvhAccelerator {
  private items: SpatialBvhItem[] = [];

  public build(items: SpatialBvhItem[]): void {
    this.items = items;
  }

  /**
   * 3D 광선(Ray)과 교차하는 건물 바운딩 박스 고속 조회 (Slab Method)
   */
  public raycast(
    origin: [number, number, number],
    dir: [number, number, number],
    maxDist: number = 1500
  ): SpatialBvhItem | null {
    let closest: SpatialBvhItem | null = null;
    let bestT = maxDist;

    const invX = dir[0] !== 0 ? 1 / dir[0] : 1e9;
    const invY = dir[1] !== 0 ? 1 / dir[1] : 1e9;
    const invZ = dir[2] !== 0 ? 1 / dir[2] : 1e9;

    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i];
      const t1 = (b.minX - origin[0]) * invX;
      const t2 = (b.maxX - origin[0]) * invX;
      const t3 = (b.minY - origin[1]) * invY;
      const t4 = (b.maxY - origin[1]) * invY;
      const t5 = (b.minZ - origin[2]) * invZ;
      const t6 = (b.maxZ - origin[2]) * invZ;

      const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
      const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));

      if (tmax >= 0 && tmin <= tmax && tmin < bestT) {
        bestT = tmin;
        closest = b;
      }
    }
    return closest;
  }
}

/**
 * 도로 중심선 기준 좌/우 평행 오프셋 라인 생성 (가로수·가로등 배치용)
 */
export function computeRoadSideOffsetLine(
  lineCoords: [number, number][],
  offsetMeters: number
): [number, number][] {
  if (lineCoords.length < 2) return lineCoords;
  try {
    const line = turf.lineString(lineCoords);
    const offset = turf.lineOffset(line, offsetMeters, { units: 'meters' });
    return (offset.geometry.coordinates as [number, number][]) || lineCoords;
  } catch {
    return lineCoords;
  }
}

/**
 * 기준점 반경 세력권(Isochrone/Buffer) 폴리곤 생성
 */
export function createCatchmentBufferPolygon(
  centerLngLat: [number, number],
  radiusMeters: number
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  try {
    const pt = turf.point(centerLngLat);
    return turf.buffer(pt, radiusMeters, { units: 'meters' }) || null;
  } catch {
    return null;
  }
}
