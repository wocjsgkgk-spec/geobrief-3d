import * as turf from '@turf/turf';

export interface SlopeCellProperties {
  slopeDeg: number;
  grade: 'gentle' | 'moderate' | 'steep';
  gradeLabel: string;
  color: string;
  elevation: number;
}

export interface SlopeAnalysisResult {
  geoJson: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  totalCells: number;
  avgSlope: number;
  maxSlope: number;
  gentleCount: number;
  gentlePct: number; // <= 15도
  moderateCount: number;
  moderatePct: number; // 15~25도
  steepCount: number;
  steepPct: number; // > 25도
  minElev: number;
  maxElev: number;
  deltaElev: number;
}

export interface ElevationProfilePoint {
  distanceM: number;
  elevation: number;
  coords: [number, number];
}

export interface ElevationProfileResult {
  points: ElevationProfilePoint[];
  minElev: number;
  maxElev: number;
  deltaElev: number;
  totalLengthM: number;
  avgSlope: number;
  startCoords: [number, number];
  endCoords: [number, number];
}

/**
 * 부지 폴리곤 내부의 고도차를 샘플링하여 3단계 경사도 격자(Grid) 피처 컬렉션 및 정량 통계 산출
 * - 15도 이하: 녹색 (#22C55E, 개발 용이)
 * - 15~25도: 황색 (#F59E0B, 조건부 개발)
 * - 25도 초과: 적색 (#EF4444, 급경사 보전)
 */
export function analyzeSlopeGrid(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  queryElevation: (coords: [number, number]) => number
): SlopeAnalysisResult {
  const bbox = turf.bbox(polygon);
  const [minX, minY, maxX, maxY] = bbox;

  // 10 x 10 샘플링 격자
  const gridSize = 10;
  const dx = (maxX - minX) / gridSize;
  const dy = (maxY - minY) / gridSize;

  // 셀 가로/세로 실측 거리 (미터)
  const cellDistXMeters =
    turf.distance([minX, minY], [minX + dx, minY], { units: 'kilometers' }) * 1000;
  const cellDistYMeters =
    turf.distance([minX, minY], [minX, minY + dy], { units: 'kilometers' }) * 1000;
  const avgCellDist = Math.max(10, (cellDistXMeters + cellDistYMeters) / 2);

  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const slopes: number[] = [];
  const elevations: number[] = [];

  let gentleCount = 0;
  let moderateCount = 0;
  let steepCount = 0;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cellW = minX + i * dx;
      const cellE = minX + (i + 1) * dx;
      const cellS = minY + j * dy;
      const cellN = minY + (j + 1) * dy;

      const cellCenter: [number, number] = [(cellW + cellE) / 2, (cellS + cellN) / 2];

      // 폴리곤 경계 내부 또는 경계 부근에 있는 셀만 포함
      const centerPt = turf.point(cellCenter);
      if (!turf.booleanPointInPolygon(centerPt, polygon)) {
        continue;
      }

      // 셀 중심 및 4방향 고도 샘플링
      const elevCenter = queryElevation(cellCenter);
      const elevW = queryElevation([cellW, cellCenter[1]]);
      const elevE = queryElevation([cellE, cellCenter[1]]);
      const elevS = queryElevation([cellCenter[0], cellS]);
      const elevN = queryElevation([cellCenter[0], cellN]);

      elevations.push(elevCenter, elevW, elevE, elevS, elevN);

      // 경사도 산출 (편미분 근사: dz/dx, dz/dy)
      const dz_dx = Math.abs(elevE - elevW) / cellDistXMeters;
      const dz_dy = Math.abs(elevN - elevS) / cellDistYMeters;
      const gradient = Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy);
      const slopeDeg = Math.min(65, Math.round(Math.atan(gradient) * (180 / Math.PI) * 10) / 10);

      slopes.push(slopeDeg);

      let grade: 'gentle' | 'moderate' | 'steep';
      let gradeLabel: string;
      let color: string;

      if (slopeDeg <= 15) {
        grade = 'gentle';
        gradeLabel = '개발 용이 (≤15°)';
        color = '#22C55E'; // 녹색
        gentleCount++;
      } else if (slopeDeg <= 25) {
        grade = 'moderate';
        gradeLabel = '조건부 개발 (15~25°)';
        color = '#F59E0B'; // 황색
        moderateCount++;
      } else {
        grade = 'steep';
        gradeLabel = '급경사 보전 (>25°)';
        color = '#EF4444'; // 적색
        steepCount++;
      }

      const cellPoly = turf.polygon([
        [
          [cellW, cellN],
          [cellE, cellN],
          [cellE, cellS],
          [cellW, cellS],
          [cellW, cellN],
        ],
      ]);

      features.push({
        type: 'Feature',
        properties: {
          slopeDeg,
          grade,
          gradeLabel,
          color,
          elevation: Math.round(elevCenter),
        },
        geometry: cellPoly.geometry,
      });
    }
  }

  const totalCells = Math.max(1, features.length);
  const avgSlope =
    slopes.length > 0
      ? Math.round((slopes.reduce((acc, v) => acc + v, 0) / slopes.length) * 10) / 10
      : 0;
  const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0;

  const validElevs = elevations.filter((e) => typeof e === 'number' && !isNaN(e));
  const minElev = validElevs.length > 0 ? Math.round(Math.min(...validElevs)) : 0;
  const maxElev = validElevs.length > 0 ? Math.round(Math.max(...validElevs)) : 0;

  return {
    geoJson: {
      type: 'FeatureCollection',
      features,
    },
    totalCells,
    avgSlope,
    maxSlope,
    gentleCount,
    gentlePct: Math.round((gentleCount / totalCells) * 100),
    moderateCount,
    moderatePct: Math.round((moderateCount / totalCells) * 100),
    steepCount,
    steepPct: Math.round((steepCount / totalCells) * 100),
    minElev,
    maxElev,
    deltaElev: Math.max(0, maxElev - minElev),
  };
}

/**
 * 부지 중심을 가로지르는 동서(또는 주요 축) 단면선상의 고도 단면도(Elevation Profile) 데이터 생성
 */
export function generateElevationProfile(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  queryElevation: (coords: [number, number]) => number,
  samples = 32
): ElevationProfileResult {
  const bbox = turf.bbox(polygon);
  const [minX, minY, maxX, maxY] = bbox;
  const midY = (minY + maxY) / 2;

  // 동서 횡단 단면선
  const startPt: [number, number] = [minX, midY];
  const endPt: [number, number] = [maxX, midY];

  const totalLengthM = turf.distance(startPt, endPt, { units: 'kilometers' }) * 1000;
  const points: ElevationProfilePoint[] = [];

  for (let s = 0; s <= samples; s++) {
    const ratio = s / samples;
    const curLng = minX + ratio * (maxX - minX);
    const curLat = midY;
    const curDist = Math.round(ratio * totalLengthM);

    const elev = Math.round(queryElevation([curLng, curLat]));

    points.push({
      distanceM: curDist,
      elevation: elev,
      coords: [curLng, curLat],
    });
  }

  const elevs = points.map((p) => p.elevation);
  const minElev = Math.min(...elevs);
  const maxElev = Math.max(...elevs);
  const deltaElev = maxElev - minElev;

  // 시작점과 끝점 간 경사도
  const avgSlope =
    totalLengthM > 0
      ? Math.round(Math.atan(deltaElev / totalLengthM) * (180 / Math.PI) * 10) / 10
      : 0;

  return {
    points,
    minElev,
    maxElev,
    deltaElev,
    totalLengthM: Math.round(totalLengthM),
    avgSlope,
    startCoords: startPt,
    endCoords: endPt,
  };
}
