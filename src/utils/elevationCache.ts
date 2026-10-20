/**
 * elevationCache.ts
 *
 * [1단계: 3D 지형 연산 병목 해소 및 고도 캐싱 최적화]
 * - 렌더링 루프 및 move 이벤트에서 매 프레임 queryTerrainElevation 호출 방지
 * - 지형 표고(Z값)를 좌표 해시 기반 Map 객체에 캐싱하여 중복 연산 완전 제거
 * - 건물 다각형 정점 전체 샘플링 대신 중심점(Centroid) 1회 샘플링으로 연산량 90% 이상 감축
 */

import type maplibregl from 'maplibre-gl';

export class ElevationCache {
  private cache = new Map<string, number>();
  private maxCacheSize = 20000;
  private isInteractionLocked = false;

  /**
   * 회전/이동 인터랙션 중 무거운 지형 표고 쿼리 잠금 제어
   */
  public setInteractionLock(locked: boolean): void {
    this.isInteractionLocked = locked;
  }

  public isLocked(): boolean {
    return this.isInteractionLocked;
  }

  /**
   * 경위도 좌표를 정밀도 5자리(약 1m 오차) 문자열 키로 변환
   */
  private makeCoordKey(lng: number, lat: number): string {
    return `${lng.toFixed(5)},${lat.toFixed(5)}`;
  }

  /**
   * 단일 좌표의 지형 고도를 캐시에서 조회하거나, 없을 경우 쿼리 후 캐싱
   */
  public get(
    coord: [number, number],
    queryFn?: (c: [number, number]) => number | null
  ): number {
    if (!coord || !Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) {
      return 0;
    }

    const key = this.makeCoordKey(coord[0], coord[1]);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // [인터랙션 잠금] 회전/이동 중에는 비캐시 신규 고도 쿼리(queryTerrainElevation) 일체 차단
    if (this.isInteractionLocked) {
      return 0;
    }

    let elevation = 0;
    let hasValidQuery = false;
    if (queryFn) {
      const q = queryFn(coord);
      if (q !== null && q !== undefined && Number.isFinite(q) && !Number.isNaN(q)) {
        elevation = Math.round(q * 10) / 10;
        hasValidQuery = true;
      }
    }

    // [중요: 지형 타일 미로드 시 0m 영구 캐싱 방지]
    // DEM 타일이 준비되어 유효한 양수 표고가 조회된 경우에만 캐시에 저장
    if (hasValidQuery && elevation > 0) {
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(key, elevation);
    }
    return elevation;
  }

  /**
   * MapLibre Map 인스턴스를 통한 고도 조회 및 캐싱
   */
  public getFromMap(map: maplibregl.Map | null, coord: [number, number]): number {
    if (!map || !coord) return 0;
    return this.get(coord, (c) => {
      if (typeof map.queryTerrainElevation === 'function') {
        return map.queryTerrainElevation(c);
      }
      return 0;
    });
  }

  /**
   * 다각형 정점 배열의 중심점(Centroid)을 고속 계산
   */
  public getPolygonCentroid(
    ring: [number, number][] | number[][]
  ): [number, number] {
    if (!ring || ring.length === 0) return [0, 0];
    if (ring.length === 1) return [ring[0][0], ring[0][1]];

    let sumLng = 0;
    let sumLat = 0;
    const len = ring.length;

    for (let i = 0; i < len; i++) {
      sumLng += ring[i][0];
      sumLat += ring[i][1];
    }

    return [sumLng / len, sumLat / len];
  }

  /**
   * 건물 다각형 전체 정점을 순회하지 않고, 중심점 1개만 샘플링하여 고도 반환 (연산량 90% 이상 절감)
   */
  public getElevationForPolygon(
    ring: [number, number][] | number[][],
    queryFn?: (c: [number, number]) => number | null
  ): number {
    const centroid = this.getPolygonCentroid(ring);
    return this.get(centroid, queryFn);
  }

  /**
   * MapLibre Map 인스턴스를 통한 다각형 중심점 고도 조회
   */
  public getElevationForPolygonFromMap(
    map: maplibregl.Map | null,
    ring: [number, number][] | number[][]
  ): number {
    const centroid = this.getPolygonCentroid(ring);
    return this.getFromMap(map, centroid);
  }

  /**
   * 지형 On/Off 또는 DEM 소스 변경 시 캐시 전면 초기화
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * 현재 캐시 항목 수 반환
   */
  public get size(): number {
    return this.cache.size;
  }
}

// 전역 싱글톤 인스턴스
export const elevationCache = new ElevationCache();

// 편의 헬퍼 함수
export function getCachedElevation(
  coord: [number, number],
  queryFn?: (c: [number, number]) => number | null
): number {
  return elevationCache.get(coord, queryFn);
}

export function getCentroidElevation(
  ring: [number, number][] | number[][],
  queryFn?: (c: [number, number]) => number | null
): number {
  return elevationCache.getElevationForPolygon(ring, queryFn);
}

export function clearElevationCache(): void {
  elevationCache.clear();
}
