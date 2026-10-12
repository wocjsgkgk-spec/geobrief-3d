/**
 * terrainFoundation.ts
 *
 * 건물 바닥면 적응형 기초(Adaptive Foundation) 및 경사지 지형 스냅 보정 유틸리티
 * - 경사지에 위치한 건물이 지형 고저차로 인해 공중에 뜨지 않도록 처리
 * - 건물의 외곽선 정점(Vertices) 전체의 DEM 표고를 실시간 샘플링하여 지표면 최저점(Min Elevation) 및 고저차 계산
 * - fill-extrusion-base를 지형 최저점에 스냅(Clamping)하여 경사지 옹벽(기초 콘크리트)이 자연스럽게 지표면에 안착되도록 보정
 */

import * as turf from '@turf/turf';

export interface AdaptiveFoundationResult {
  adaptiveBase: number;       // fill-extrusion-base에 적용할 상대 표고 (음수, m)
  adaptiveHeight: number;     // fill-extrusion-height에 적용할 총 높이 (m)
  foundationDepth: number;    // 경사지 옹벽/기초 깊이 (m)
  minElevation: number;       // 건물 외곽선 정점 중 최저 지표 표고 (m)
  maxElevation: number;       // 건물 외곽선 정점 중 최고 지표 표고 (m)
  slopeDelta: number;         // 지표면 고저차 (m)
}

/**
 * 단일 건물 폴리곤의 모든 정점 DEM 표고를 검사하여 적응형 기초 파라미터를 산출합니다.
 */
export function calculateAdaptiveFoundation(
  coordinates: number[][][] | number[][][][],
  queryElevation: (coords: [number, number]) => number | null,
  nominalHeight: number
): AdaptiveFoundationResult {
  const elevs: number[] = [];

  // 외곽선 정점 좌표 평탄화 추출
  const collectCoords = (arr: any[]) => {
    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      const elev = queryElevation([arr[0], arr[1]]);
      if (elev !== null && !isNaN(elev)) {
        elevs.push(elev);
      }
    } else {
      for (const sub of arr) {
        collectCoords(sub);
      }
    }
  };

  collectCoords(coordinates);

  if (elevs.length === 0) {
    // DEM 표고를 획득할 수 없는 경우 안전 기본값 (0.6m 지반 안착)
    return {
      adaptiveBase: -0.6,
      adaptiveHeight: nominalHeight + 0.6,
      foundationDepth: 0.6,
      minElevation: 0,
      maxElevation: 0,
      slopeDelta: 0,
    };
  }

  const minElevation = Math.min(...elevs);
  const maxElevation = Math.max(...elevs);
  const slopeDelta = Math.max(0, maxElevation - minElevation);

  // 경사 고저차에 비례하여 기초 옹벽 깊이 산출 (기본 여유고 0.8m + 최대 30m)
  const foundationDepth = Math.max(0.8, Math.min(30, slopeDelta + 0.8));
  const adaptiveBase = -foundationDepth;
  const adaptiveHeight = nominalHeight + foundationDepth;

  return {
    adaptiveBase,
    adaptiveHeight: Math.round(adaptiveHeight * 10) / 10,
    foundationDepth: Math.round(foundationDepth * 10) / 10,
    minElevation: Math.round(minElevation * 10) / 10,
    maxElevation: Math.round(maxElevation * 10) / 10,
    slopeDelta: Math.round(slopeDelta * 10) / 10,
  };
}

/**
 * GeoJSON 건물 피처 컬렉션 전체에 적응형 기초(Adaptive Foundation) 속성을 주입합니다.
 */
export function applyAdaptiveFoundationToFeatures<
  G extends GeoJSON.Geometry = GeoJSON.Polygon | GeoJSON.MultiPolygon
>(
  featureCollection: GeoJSON.FeatureCollection<G>,
  queryElevation: (coords: [number, number]) => number | null
): GeoJSON.FeatureCollection<G> {
  if (!featureCollection || !featureCollection.features) {
    return featureCollection;
  }

  const updatedFeatures = featureCollection.features.map((feature) => {
    if (
      !feature.geometry ||
      (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')
    ) {
      return feature;
    }

    const props = (feature.properties || {}) as Record<string, any>;
    const nominalHeight = parseFloat(props.height) || (props.levels ? props.levels * 3.3 : 12);

    const foundation = calculateAdaptiveFoundation(
      (feature.geometry as any).coordinates,
      queryElevation,
      nominalHeight
    );

    return {
      ...feature,
      properties: {
        ...props,
        adaptive_base: foundation.adaptiveBase,
        adaptive_height: foundation.adaptiveHeight,
        foundation_depth: foundation.foundationDepth,
        min_elev: foundation.minElevation,
        max_elev: foundation.maxElevation,
        slope_delta: foundation.slopeDelta,
        is_slope_clamped: foundation.slopeDelta > 0.5,
      },
    };
  });

  return {
    ...featureCollection,
    features: updatedFeatures,
  };
}
