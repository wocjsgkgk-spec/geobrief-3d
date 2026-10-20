import * as turf from '@turf/turf';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CutFillResult } from '@/types/map';

export interface CutFillOptions {
  gridSizeMeters?: 5 | 10;
  targetElevation?: number | null;
}

/**
 * 지정된 부지 폴리곤 내부를 정밀 격자(5m/10m)로 분할하고,
 * 각 격자의 DEM 지형 표고를 실시간 샘플링하여 절토/성토 토공량 및 덤프트럭 환산 대수를 계산합니다.
 */
export function calculateCutFill(
  map: MapLibreMap,
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | GeoJSON.Polygon,
  options: CutFillOptions = {}
): CutFillResult | null {
  if (!map || !polygon) return null;

  const gridSizeMeters = options.gridSizeMeters ?? 10;
  const cellSideKm = gridSizeMeters / 1000;
  const cellAreaSqm = gridSizeMeters * gridSizeMeters;

  const polyFeature: GeoJSON.Feature<GeoJSON.Polygon> =
    polygon.type === 'Feature' ? (polygon as GeoJSON.Feature<GeoJSON.Polygon>) : turf.feature(polygon);

  // 1. 부지 BBOX 계산 및 정사각 격자 생성
  const bbox = turf.bbox(polyFeature);
  let rawGrid: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  try {
    rawGrid = turf.squareGrid(bbox, cellSideKm, { units: 'kilometers' });
  } catch (err) {
    console.error('Error generating square grid:', err);
    return null;
  }

  // 2. 부지 내부 격자 셀만 필터링 및 중심점 표고 샘플링
  interface SampledCellData {
    feature: GeoJSON.Feature<GeoJSON.Polygon>;
    coords: [number, number];
    elevation: number;
  }

  const sampledCells: SampledCellData[] = [];
  const elevations: number[] = [];

  for (let i = 0; i < rawGrid.features.length; i++) {
    const cell = rawGrid.features[i];
    const centroid = turf.centroid(cell);
    const coords = centroid.geometry.coordinates as [number, number];

    // 부지 폴리곤 내부인지 검사
    if (turf.booleanPointInPolygon(centroid, polyFeature)) {
      // DEM 지형 해발고도 추출
      let elev: number | null = null;
      if (typeof map.queryTerrainElevation === 'function') {
        try {
          elev = map.queryTerrainElevation(coords);
        } catch {
          elev = null;
        }
      }

      // fallback
      const validElev = elev !== null && elev !== undefined && !isNaN(elev) ? elev : 100;
      sampledCells.push({
        feature: cell,
        coords,
        elevation: validElev,
      });
      elevations.push(validElev);
    }
  }

  if (sampledCells.length === 0) return null;

  // 3. 지형 표고 기초 통계 (대용량 배열 콜 스택 초과 방지 루프)
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let sumElevation = 0;
  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i];
    if (v < minElevation) minElevation = v;
    if (v > maxElevation) maxElevation = v;
    sumElevation += v;
  }
  const avgElevation = elevations.length > 0 ? Math.round((sumElevation / elevations.length) * 10) / 10 : 0;

  // 4. 절성토 토량 평형고(Zero Balance Elevation) 계산
  // Cut(E) = Sum(elev - E for elev > E), Fill(E) = Sum(E - elev for elev < E)
  // Cut(E) - Fill(E) = Sum(elev) - N * E = 0  =>  E = Sum(elev) / N (선형 가중 시 평균 표고와 거의 일치)
  const zeroBalanceElevation = Math.round(avgElevation * 10) / 10;

  // 5. 목표 계획고 결정
  const targetElevation =
    options.targetElevation !== undefined && options.targetElevation !== null
      ? options.targetElevation
      : Math.round(avgElevation);

  // 6. 각 격자 셀의 절토/성토 체적 연산 및 속성 부여
  let totalCutVolumeM3 = 0;
  let totalFillVolumeM3 = 0;
  let cutCellCount = 0;
  let fillCellCount = 0;
  let balancedCellCount = 0;

  const resultFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (let i = 0; i < sampledCells.length; i++) {
    const item = sampledCells[i];
    const elev = Math.round(item.elevation * 10) / 10;
    const diff = Math.round((elev - targetElevation) * 10) / 10;

    let type: 'cut' | 'fill' | 'balanced' = 'balanced';
    let volumeM3 = 0;
    let color = '#10B981'; // 기본 균형(녹색)
    let borderColor = '#059669';

    if (diff > 0.5) {
      // 절토 구역 (깎아낼 토사량)
      type = 'cut';
      volumeM3 = Math.round(diff * cellAreaSqm * 10) / 10;
      totalCutVolumeM3 += volumeM3;
      cutCellCount++;
      // 절토량 높이에 따른 선명한 적색 계열
      color = '#EF4444';
      borderColor = '#B91C1C';
    } else if (diff < -0.5) {
      // 성토 구역 (메워야 할 토사량)
      type = 'fill';
      volumeM3 = Math.round(Math.abs(diff) * cellAreaSqm * 10) / 10;
      totalFillVolumeM3 += volumeM3;
      fillCellCount++;
      // 성토 깊이에 따른 선명한 청색 계열
      color = '#3B82F6';
      borderColor = '#1D4ED8';
    } else {
      // 표고 오차 0.5m 이내 균형점
      type = 'balanced';
      balancedCellCount++;
      color = '#10B981';
      borderColor = '#059669';
    }

    const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
      ...item.feature,
      id: i,
      properties: {
        id: i,
        elevation: elev,
        targetElevation,
        diff,
        type,
        volumeM3,
        color,
        borderColor,
        cellAreaSqm,
      },
    };

    resultFeatures.push(feature);
  }

  totalCutVolumeM3 = Math.round(totalCutVolumeM3);
  totalFillVolumeM3 = Math.round(totalFillVolumeM3);
  const netVolumeM3 = totalCutVolumeM3 - totalFillVolumeM3;

  // 15톤 덤프트럭(약 10m3 적재) 기준 환산 대수
  const dumpTruck15tCutCount = Math.ceil(totalCutVolumeM3 / 10);
  const dumpTruck15tFillCount = Math.ceil(totalFillVolumeM3 / 10);
  const dumpTruck15tNetCount = Math.ceil(Math.abs(netVolumeM3) / 10);

  const totalCellCount = sampledCells.length;
  const sampledAreaSqm = totalCellCount * cellAreaSqm;

  const cutAreaPercent = Math.round((cutCellCount / totalCellCount) * 100);
  const fillAreaPercent = Math.round((fillCellCount / totalCellCount) * 100);
  const balancedAreaPercent = Math.max(0, 100 - cutAreaPercent - fillAreaPercent);

  const geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
    type: 'FeatureCollection',
    features: resultFeatures,
  };

  return {
    gridSizeMeters,
    cellAreaSqm,
    totalCellCount,
    sampledAreaSqm,
    minElevation: Math.round(minElevation * 10) / 10,
    maxElevation: Math.round(maxElevation * 10) / 10,
    avgElevation,
    targetElevation,
    totalCutVolumeM3,
    totalFillVolumeM3,
    netVolumeM3,
    dumpTruck15tCutCount,
    dumpTruck15tFillCount,
    dumpTruck15tNetCount,
    cutCellCount,
    fillCellCount,
    balancedCellCount,
    cutAreaPercent,
    fillAreaPercent,
    balancedAreaPercent,
    zeroBalanceElevation,
    geojson,
  };
}
