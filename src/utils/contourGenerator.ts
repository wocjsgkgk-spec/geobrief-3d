/**
 * contourGenerator.ts
 *
 * 국토지리정보원 수치지형도 1:5,000 기준 정밀 등고선(Contour) 생성 및 셰이딩 엔진
 * - 주곡선(Index Contour): 50m 간격 골드 라인 (#F59E0B, 0.8px, opacity 0.40)
 * - 간곡선(Intermediate Contour): 10m 간격 반투명 화이트/골드 (#FEF3C7, 0.5px, opacity 0.25)
 * - DEM 표고 그리드 기반 등치선(Marching Squares) 실시간 알고리즘 내장
 * - 강원권 핵심 군 유휴지 거점(원주 캠프 롱, 춘천 102보충대, 철원 관할 부지 등) 정밀 등고선 지원
 */

import * as turf from '@turf/turf';

export interface ContourFeatureProperties {
  elevation: number;
  type: 'index' | 'intermediate';
  label: string;
  color: string;
  width: number;
  opacity: number;
}

/**
 * 2D 격자 표고 배열과 Marching Squares 선형 보간을 활용하여
 * 주어진 등고 표고(Level)에 해당하는 선분(Segment)들을 추출합니다.
 */
function traceIsolinesAtLevel(
  grid: number[][],
  lngs: number[],
  lats: number[],
  level: number
): [number, number][][] {
  const segments: [[number, number], [number, number]][] = [];
  const rows = lats.length;
  const cols = lngs.length;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v0 = grid[r][c];         // Bottom-Left (SW)
      const v1 = grid[r][c + 1];     // Bottom-Right (SE)
      const v2 = grid[r + 1][c + 1]; // Top-Right (NE)
      const v3 = grid[r + 1][c];     // Top-Left (NW)

      // 4개 정점의 이진 상태 마스크 (0 ~ 15)
      let mask = 0;
      if (v0 >= level) mask |= 1;
      if (v1 >= level) mask |= 2;
      if (v2 >= level) mask |= 4;
      if (v3 >= level) mask |= 8;

      if (mask === 0 || mask === 15) continue;

      const x0 = lngs[c];
      const x1 = lngs[c + 1];
      const y0 = lats[r];
      const y1 = lats[r + 1];

      // 각 변에서의 선형 보간 좌표 계산
      const interpX = (valA: number, valB: number, xA: number, xB: number) => {
        if (Math.abs(valB - valA) < 1e-6) return (xA + xB) / 2;
        const t = (level - valA) / (valB - valA);
        return xA + t * (xB - xA);
      };

      const interpY = (valA: number, valB: number, yA: number, yB: number) => {
        if (Math.abs(valB - valA) < 1e-6) return (yA + yB) / 2;
        const t = (level - valA) / (valB - valA);
        return yA + t * (yB - yA);
      };

      const pBottom: [number, number] = [interpX(v0, v1, x0, x1), y0];
      const pRight: [number, number] = [x1, interpY(v1, v2, y0, y1)];
      const pTop: [number, number] = [interpX(v3, v2, x0, x1), y1];
      const pLeft: [number, number] = [x0, interpY(v0, v3, y0, y1)];

      switch (mask) {
        case 1:
        case 14:
          segments.push([pLeft, pBottom]);
          break;
        case 2:
        case 13:
          segments.push([pBottom, pRight]);
          break;
        case 3:
        case 12:
          segments.push([pLeft, pRight]);
          break;
        case 4:
        case 11:
          segments.push([pRight, pTop]);
          break;
        case 5:
          segments.push([pLeft, pTop]);
          segments.push([pBottom, pRight]);
          break;
        case 6:
        case 9:
          segments.push([pBottom, pTop]);
          break;
        case 7:
        case 8:
          segments.push([pLeft, pTop]);
          break;
        case 10:
          segments.push([pLeft, pBottom]);
          segments.push([pRight, pTop]);
          break;
      }
    }
  }

  // 선분들을 연결하여 연속된 LineString 배열 생성
  const lines: [number, number][][] = [];
  const visited = new Uint8Array(segments.length);

  for (let i = 0; i < segments.length; i++) {
    if (visited[i]) continue;
    visited[i] = 1;

    const line: [number, number][] = [segments[i][0], segments[i][1]];
    let extended = true;

    while (extended) {
      extended = false;
      const head = line[0];
      const tail = line[line.length - 1];

      for (let j = 0; j < segments.length; j++) {
        if (visited[j]) continue;
        const [pA, pB] = segments[j];

        const distHeadA = Math.hypot(head[0] - pA[0], head[1] - pA[1]);
        const distHeadB = Math.hypot(head[0] - pB[0], head[1] - pB[1]);
        const distTailA = Math.hypot(tail[0] - pA[0], tail[1] - pA[1]);
        const distTailB = Math.hypot(tail[0] - pB[0], tail[1] - pB[1]);

        const tol = 0.0001; // 경위도 오차 허용 범위

        if (distTailA < tol) {
          line.push(pB);
          visited[j] = 1;
          extended = true;
          break;
        } else if (distTailB < tol) {
          line.push(pA);
          visited[j] = 1;
          extended = true;
          break;
        } else if (distHeadB < tol) {
          line.unshift(pA);
          visited[j] = 1;
          extended = true;
          break;
        } else if (distHeadA < tol) {
          line.unshift(pB);
          visited[j] = 1;
          extended = true;
          break;
        }
      }
    }

    if (line.length >= 2) {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * 뷰포트 영역의 DEM 표고를 샘플링하여 국토지리정보원 표준 등고선 GeoJSON을 실시간 생성합니다.
 */
export function generateContourLines(
  bbox: [number, number, number, number],
  queryElevation: (coords: [number, number]) => number | null,
  options?: {
    gridResolution?: number; // 기본값 28x28
    intermediateInterval?: number; // 간곡선 간격 (기본 10m)
    indexInterval?: number; // 주곡선 간격 (기본 50m)
  }
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const resolution = options?.gridResolution || 28;
  const intermediateInterval = options?.intermediateInterval || 10;
  const indexInterval = options?.indexInterval || 50;

  const dLng = (maxLng - minLng) / (resolution - 1);
  const dLat = (maxLat - minLat) / (resolution - 1);

  const lngs: number[] = [];
  const lats: number[] = [];
  for (let c = 0; c < resolution; c++) lngs.push(minLng + c * dLng);
  for (let r = 0; r < resolution; r++) lats.push(minLat + r * dLat);

  const grid: number[][] = [];
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let r = 0; r < resolution; r++) {
    const row: number[] = [];
    for (let c = 0; c < resolution; c++) {
      const elev = queryElevation([lngs[c], lats[r]]);
      const safeElev = elev !== null && !isNaN(elev) ? elev : 150;
      row.push(safeElev);
      if (safeElev < minElev) minElev = safeElev;
      if (safeElev > maxElev) maxElev = safeElev;
    }
    grid.push(row);
  }

  // 유효한 등고선이 생성될 수 없는 평지인 경우
  if (!isFinite(minElev) || !isFinite(maxElev) || maxElev - minElev < 2) {
    minElev = 100;
    maxElev = 200;
  }

  const startLevel = Math.ceil(minElev / intermediateInterval) * intermediateInterval;
  const endLevel = Math.floor(maxElev / intermediateInterval) * intermediateInterval;

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (let level = startLevel; level <= endLevel; level += intermediateInterval) {
    const isIndex = level % indexInterval === 0;
    const lines = traceIsolinesAtLevel(grid, lngs, lats, level);

    for (const line of lines) {
      if (line.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: {
          elevation: level,
          type: isIndex ? 'index' : 'intermediate',
          label: `${level}m`,
          color: isIndex ? '#F59E0B' : '#FEF3C7',
          width: isIndex ? 0.8 : 0.5,
          opacity: isIndex ? 0.40 : 0.25,
        },
        geometry: {
          type: 'LineString',
          coordinates: line,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
