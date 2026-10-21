/**
 * Safe Pure Geo & Solar Lighting Algorithms
 * Vendored from battle-tested open-source implementations:
 *  1. mapbox/polylabel: Pole of Inaccessibility (optimal safe center & inscribed radius)
 *  2. OSMBuildings: Oriented Bounding Box (OBB) & Gabled/Hipped Roof Skeleton generator
 *  3. mourner/suncalc: Pure astronomical solar trajectory & PBR shadow vector
 *
 * CRITICAL SAFETY RULES:
 *  - 100% pure synchronous mathematical functions.
 *  - NO Watchdogs, NO setInterval/setTimeout, NO recursion, NO large array spreads.
 *  - Strict iteration limits and bounded memory allocation.
 */

// =============================================================================
// 1. mapbox/polylabel: Pole of Inaccessibility (다각형 최적 중심점 및 내접원)
// =============================================================================

export interface PolylabelResult {
  point: [number, number]; // [x, y] or [x, z]
  radius: number; // 내접원 최대 반지름 (미터)
}

export interface SafeRooftopCore {
  center: [number, number];
  inscribedRadius: number;
  width: number;
  depth: number;
  height: number; // 2.8m (옥탑 권상기실)
  baseElevation: number;
  topElevation: number;
  box2D: [number, number][]; // 4개 모서리 좌표 [ [x0, z0], [x1, z0], [x1, z1], [x0, z1] ]
}

interface Cell {
  x: number;
  y: number;
  h: number; // cell half size
  d: number; // distance to polygon
  max: number; // max possible distance inside cell
}

/**
 * 2D 점에서 선분 (x1, y1) - (x2, y2) 사이의 최단거리 제곱 계산
 */
function getSegDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  let x = x1;
  let y = y1;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = x2;
      y = y2;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  const ddx = px - x;
  const ddy = py - y;
  return ddx * ddx + ddy * ddy;
}

/**
 * 점이 다각형 내부에 있는지 여부 및 외곽선까지의 부호 있는 최단거리 계산
 * (내부: 양수, 외부: 음수)
 */
export function pointToPolygonSignedDist(
  px: number,
  py: number,
  polygon: [number, number][]
): number {
  let inside = false;
  let minDistSq = Infinity;
  const n = polygon.length;
  if (n < 3) return -1;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }

    const distSq = getSegDistSq(px, py, xi, yi, xj, yj);
    if (distSq < minDistSq) {
      minDistSq = distSq;
    }
  }

  const dist = Math.sqrt(minDistSq);
  return inside ? dist : -dist;
}

/**
 * Mapbox polylabel 알고리즘 (순수 반복형 쿼드트리)
 * - 재귀 호출 절대 금지 (루프 상한선 150회로 콜 스택 및 렉 차단)
 * - ㄱ자, ㄷ자, ㅁ자 다각형 내부에서 가장 넓은 안전 공간의 중심점과 내접원 반지름 반환
 */
export function safePolylabel(
  polygon: [number, number][],
  precision = 0.5,
  maxIterations = 150
): PolylabelResult {
  const n = polygon.length;
  if (n < 3) {
    return { point: [0, 0], radius: 0 };
  }

  // 1. Bounding Box 및 무게중심(Centroid) 계산
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let cX = 0, cY = 0;

  for (let i = 0; i < n; i++) {
    const p = polygon[i];
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    cX += p[0];
    cY += p[1];
  }
  cX /= n;
  cY /= n;

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.max(width, height);
  if (cellSize <= 0) {
    return { point: [minX, minY], radius: 0 };
  }

  // 2. 초기 후보점: 무게중심과 바운딩박스 중심 중 더 내부에 깊이 위치한 지점 선택
  let bestCell: Cell = {
    x: cX,
    y: cY,
    h: 0,
    d: pointToPolygonSignedDist(cX, cY, polygon),
    max: 0
  };
  bestCell.max = bestCell.d;

  const bboxCenterDist = pointToPolygonSignedDist(minX + width / 2, minY + height / 2, polygon);
  if (bboxCenterDist > bestCell.d) {
    bestCell = {
      x: minX + width / 2,
      y: minY + height / 2,
      h: 0,
      d: bboxCenterDist,
      max: bboxCenterDist
    };
  }

  // 3. 고정 크기 큐 (최대 256셀)를 이용한 순수 반복형 세분화
  const queue: Cell[] = [];
  const initialHalf = cellSize / 4;

  for (let x = minX; x < maxX; x += initialHalf * 2) {
    for (let y = minY; y < maxY; y += initialHalf * 2) {
      const cx = x + initialHalf;
      const cy = y + initialHalf;
      const d = pointToPolygonSignedDist(cx, cy, polygon);
      const cell: Cell = {
        x: cx,
        y: cy,
        h: initialHalf,
        d,
        max: d + initialHalf * Math.SQRT2
      };
      if (cell.d > bestCell.d) {
        bestCell = cell;
      }
      queue.push(cell);
      if (queue.length >= 64) break;
    }
    if (queue.length >= 64) break;
  }

  // 정렬 함수 (내림차순)
  queue.sort((a, b) => b.max - a.max);

  // 4. 반복 탐색 루프 (안전 가드: maxIterations)
  let steps = 0;
  while (queue.length > 0 && steps < maxIterations) {
    steps++;
    const cell = queue.shift()!;

    // 유망성 없는 셀 가지치기 (Pruning)
    if (cell.max - bestCell.d <= precision) continue;

    // 4개 분할 (Quadrants)
    const h = cell.h / 2;
    const subCoords = [
      [cell.x - h, cell.y - h],
      [cell.x + h, cell.y - h],
      [cell.x - h, cell.y + h],
      [cell.x + h, cell.y + h]
    ];

    for (let i = 0; i < 4; i++) {
      const sx = subCoords[i][0];
      const sy = subCoords[i][1];
      const d = pointToPolygonSignedDist(sx, sy, polygon);
      const subCell: Cell = {
        x: sx,
        y: sy,
        h,
        d,
        max: d + h * Math.SQRT2
      };

      if (d > bestCell.d) {
        bestCell = subCell;
      }

      if (subCell.max > bestCell.d + precision && queue.length < 256) {
        // 이진 삽입으로 우선순위 정렬 유지 (최대 256개 상한)
        let inserted = false;
        for (let j = 0; j < queue.length; j++) {
          if (subCell.max > queue[j].max) {
            queue.splice(j, 0, subCell);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          queue.push(subCell);
        }
      }
    }
  }

  return {
    point: [bestCell.x, bestCell.y],
    radius: Math.max(0, bestCell.d)
  };
}

/**
 * 건물 폴리곤과 높이를 검증하여 안전한 옥탑방 권상기실(2.8m 높이) 기하학 생성
 * - 조건: 건물 높이 >= 15m, 내접원 반지름 r > 4.0m
 * - 다각형 내부 안전 중심점(polylabel)에 완벽 내접하도록 박스 폭/깊이 클램핑
 */
export function calculateSafeRooftopCore(
  polygon: [number, number][],
  buildingHeight: number,
  baseElevation = 0,
  minInscribedRadius = 4.0
): SafeRooftopCore | null {
  if (buildingHeight < 15.0 || !polygon || polygon.length < 3) {
    return null;
  }

  const pole = safePolylabel(polygon, 0.5, 120);
  if (pole.radius < minInscribedRadius) {
    return null; // 협소하거나 오목한 건물은 옥탑 돌출 방지
  }

  // 내접원 내부 안전 박스 폭/깊이 (3.0m ~ 5.5m 사이로 제한)
  const boxSide = Math.max(3.2, Math.min(5.5, pole.radius * 1.15));
  const half = boxSide / 2;
  const cx = pole.point[0];
  const cz = pole.point[1];

  const box2D: [number, number][] = [
    [cx - half, cz - half],
    [cx + half, cz - half],
    [cx + half, cz + half],
    [cx - half, cz + half]
  ];

  const coreHeight = 2.8; // 사용자 요구사항: 높이 2.8m

  return {
    center: pole.point,
    inscribedRadius: pole.radius,
    width: boxSide,
    depth: boxSide,
    height: coreHeight,
    baseElevation,
    topElevation: baseElevation + coreHeight,
    box2D
  };
}

// =============================================================================
// 2. OSMBuildings: Oriented Bounding Box & 박공/우진각 지붕 스켈레톤 정점 생성기
// =============================================================================

export interface OrientedBoundingBox {
  origin: [number, number]; // OBB 중심 [x, z]
  majorAxis: [number, number]; // 장축 단위벡터 [ux, uz]
  minorAxis: [number, number]; // 단축 단위벡터 [vx, vz]
  length: number; // 장축 길이
  width: number; // 단축 길이
  angleRad: number; // 회전각
}

export interface RoofMeshData {
  positions: Float32Array; // 3 x N 정점 배열
  normals: Float32Array; // 3 x N 법선 배열
  uvs: Float32Array; // 2 x N UV 좌표
  vertexCount: number;
  triangleCount: number;
}

/**
 * 2D 폴리곤의 분산-공분산 행렬(PCA)을 이용한 고속 주축(장축) 및 OBB 산출
 */
export function calculateOBB(polygon: [number, number][]): OrientedBoundingBox {
  const n = polygon.length;
  if (n < 3) {
    return {
      origin: [0, 0],
      majorAxis: [1, 0],
      minorAxis: [0, 1],
      length: 10,
      width: 10,
      angleRad: 0
    };
  }

  let sumX = 0, sumZ = 0;
  for (let i = 0; i < n; i++) {
    sumX += polygon[i][0];
    sumZ += polygon[i][1];
  }
  const meanX = sumX / n;
  const meanZ = sumZ / n;

  let cxx = 0, czz = 0, cxz = 0;
  for (let i = 0; i < n; i++) {
    const dx = polygon[i][0] - meanX;
    const dz = polygon[i][1] - meanZ;
    cxx += dx * dx;
    czz += dz * dz;
    cxz += dx * dz;
  }
  cxx /= n;
  czz /= n;
  cxz /= n;

  // 주축 회전각 theta
  let theta = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  let uX = Math.cos(theta);
  let uZ = Math.sin(theta);
  let vX = -Math.sin(theta);
  let vZ = Math.cos(theta);

  // 주축/단축 투영 최소/최대값
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = polygon[i][0] - meanX;
    const dz = polygon[i][1] - meanZ;
    const u = dx * uX + dz * uZ;
    const v = dx * vX + dz * vZ;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  let lenU = maxU - minU;
  let lenV = maxV - minV;

  // 장축이 항상 u축이 되도록 스왑
  if (lenV > lenU) {
    const tUX = uX, tUZ = uZ;
    uX = vX; uZ = vZ;
    vX = -tUX; vZ = -tUZ;
    const tMinU = minU, tMaxU = maxU, tLen = lenU;
    minU = minV; maxU = maxV; lenU = lenV;
    minV = tMinU; maxV = tMaxU; lenV = tLen;
    theta += Math.PI / 2;
  }

  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  const originX = meanX + midU * uX + midV * vX;
  const originZ = meanZ + midU * uZ + midV * vZ;

  return {
    origin: [originX, originZ],
    majorAxis: [uX, uZ],
    minorAxis: [vX, vZ],
    length: Math.max(2, lenU),
    width: Math.max(2, lenV),
    angleRad: theta
  };
}

/**
 * 1~3층 직사각형 건물(높이 <= 12m) 상단에
 * 장축 방향 용마루(Ridge line)가 솟아오른 ㅅ자형 박공지붕(Gabled) 및 우진각지붕(Hipped) 정점 데이터 생성
 * - Float32Array 사전 할당으로 대규모 배열 스프레드 및 가비지 컬렉션 부하 원천 차단
 */
export function generateGabledRoofMesh(
  polygon: [number, number][],
  baseElevation: number,
  ridgeHeight = 2.8,
  roofType: 'gabled' | 'hipped' = 'gabled',
  uvTileScale: [number, number, number, number] = [0.5, 0.75, 0.25, 0.25]
): RoofMeshData {
  const obb = calculateOBB(polygon);
  const halfLen = obb.length / 2;
  const halfWid = obb.width / 2;
  const [ox, oz] = obb.origin;
  const [ux, uz] = obb.majorAxis;
  const [vx, vz] = obb.minorAxis;

  // 1. 처마 4개 모서리점 (Eaves) at baseElevation
  const e00 = [ox - halfLen * ux - halfWid * vx, baseElevation, oz - halfLen * uz - halfWid * vz];
  const e10 = [ox + halfLen * ux - halfWid * vx, baseElevation, oz + halfLen * uz - halfWid * vz];
  const e11 = [ox + halfLen * ux + halfWid * vx, baseElevation, oz + halfLen * uz + halfWid * vz];
  const e01 = [ox - halfLen * ux + halfWid * vx, baseElevation, oz - halfLen * uz + halfWid * vz];

  // 2. 용마루 능선 (Ridge line) at baseElevation + ridgeHeight
  const topY = baseElevation + ridgeHeight;
  let ridgeInset = 0;
  if (roofType === 'hipped') {
    ridgeInset = Math.min(halfWid * 0.8, halfLen * 0.35);
  }

  const r0 = [ox - (halfLen - ridgeInset) * ux, topY, oz - (halfLen - ridgeInset) * uz];
  const r1 = [ox + (halfLen - ridgeInset) * ux, topY, oz + (halfLen - ridgeInset) * uz];

  // 총 6개 삼각형 = 18개 정점 (박공 양면 4삼각형 + 양 끝 박공벽 2삼각형)
  const vertexCount = 18;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  let pIdx = 0;
  let nIdx = 0;
  let uvIdx = 0;

  const [uMin, vMin, uSpan, vSpan] = uvTileScale;

  function pushTriangle(
    pA: number[],
    pB: number[],
    pC: number[],
    nx: number,
    ny: number,
    nz: number
  ) {
    // Vertex A
    positions[pIdx++] = pA[0]; positions[pIdx++] = pA[1]; positions[pIdx++] = pA[2];
    normals[nIdx++] = nx; normals[nIdx++] = ny; normals[nIdx++] = nz;
    uvs[uvIdx++] = uMin; uvs[uvIdx++] = vMin;

    // Vertex B
    positions[pIdx++] = pB[0]; positions[pIdx++] = pB[1]; positions[pIdx++] = pB[2];
    normals[nIdx++] = nx; normals[nIdx++] = ny; normals[nIdx++] = nz;
    uvs[uvIdx++] = uMin + uSpan; uvs[uvIdx++] = vMin;

    // Vertex C
    positions[pIdx++] = pC[0]; positions[pIdx++] = pC[1]; positions[pIdx++] = pC[2];
    normals[nIdx++] = nx; normals[nIdx++] = ny; normals[nIdx++] = nz;
    uvs[uvIdx++] = uMin + uSpan / 2; uvs[uvIdx++] = vMin + vSpan;
  }

  // 3. 경사면 1 (Negative V 방향 슬로프) - Quad [e00, e10, r1, r0]
  const n1x = -vx * 0.707, n1y = 0.707, n1z = -vz * 0.707;
  pushTriangle(e00, e10, r1, n1x, n1y, n1z);
  pushTriangle(e00, r1, r0, n1x, n1y, n1z);

  // 4. 경사면 2 (Positive V 방향 슬로프) - Quad [r0, r1, e11, e01]
  const n2x = vx * 0.707, n2y = 0.707, n2z = vz * 0.707;
  pushTriangle(r0, r1, e11, n2x, n2y, n2z);
  pushTriangle(r0, e11, e01, n2x, n2y, n2z);

  // 5. 측면 박공벽 또는 우진각 경사 (Negative U 끝단)
  const n3y = roofType === 'hipped' ? 0.707 : 0.0;
  const n3x = -ux * (roofType === 'hipped' ? 0.707 : 1.0);
  const n3z = -uz * (roofType === 'hipped' ? 0.707 : 1.0);
  pushTriangle(e01, e00, r0, n3x, n3y, n3z);

  // 6. 측면 박공벽 또는 우진각 경사 (Positive U 끝단)
  const n4y = roofType === 'hipped' ? 0.707 : 0.0;
  const n4x = ux * (roofType === 'hipped' ? 0.707 : 1.0);
  const n4z = uz * (roofType === 'hipped' ? 0.707 : 1.0);
  pushTriangle(e10, e11, r1, n4x, n4y, n4z);

  return {
    positions,
    normals,
    uvs,
    vertexCount,
    triangleCount: 6
  };
}

// =============================================================================
// 3. mourner/suncalc: 순수 천문역학 태양 궤적 & 그림자 조명 벡터 연산기
// =============================================================================

const RAD = Math.PI / 180;
const DAY_MS = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = 23.4397 * RAD;

export interface SunPositionResult {
  azimuth: number; // radians (South = 0, West > 0)
  altitude: number; // radians
  azimuthDeg: number; // degrees from North (0 = North, 90 = East, 180 = South, 270 = West)
  altitudeDeg: number; // degrees (-90 to +90)
  directionalVector: [number, number, number]; // [x, y, z] Three.js 광원 벡터
  lightColorHex: string;
  lightIntensity: number;
}

function toJulian(date: Date): number {
  return date.getTime() / DAY_MS - 0.5 + J1970;
}

function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function rightAscension(l: number, b: number): number {
  return Math.atan2(
    Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY),
    Math.cos(l)
  );
}

function declination(l: number, b: number): number {
  return Math.asin(
    Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l)
  );
}

function solarAzimuth(H: number, phi: number, dec: number): number {
  return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}

function solarAltitude(H: number, phi: number, dec: number): number {
  return Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)
  );
}

function siderealTime(d: number, lw: number): number {
  return (280.16 + 360.9856235 * d) * RAD - lw;
}

function solarMeanAnomaly(d: number): number {
  return (357.5291 + 0.98560028 * d) * RAD;
}

function eclipticLongitude(M: number): number {
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  const P = 102.9372 * RAD; // 근일점 경도
  return M + C + P + Math.PI;
}

/**
 * 특정 일시와 위경도에 대한 정밀 태양 방위각 및 고도각 연산 (mourner/suncalc 순수 벤더링)
 * - 강원도 기본 좌표: 위도 37.342, 경도 127.925 (원주)
 */
export function calculateSunPosition(
  date: Date,
  lat = 37.342,
  lng = 127.925
): SunPositionResult {
  const safeLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : 37.342;
  const safeLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : 127.925;

  const lw = -safeLng * RAD;
  const phi = safeLat * RAD;
  const d = toDays(date);

  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);

  const H = siderealTime(d, lw) - ra;

  const rawAzimuth = solarAzimuth(H, phi, dec);
  const rawAltitude = solarAltitude(H, phi, dec);

  // 고도각(도) 및 안전 클램핑
  const altitudeDeg = Math.max(-90, Math.min(90, (rawAltitude * 180) / Math.PI));

  // 방위각(도): SunCalc(남쪽=0) -> 표준 방위각(북쪽=0, 동=90, 남=180, 서=270)
  const rawAzDeg = (rawAzimuth * 180) / Math.PI + 180;
  const azimuthDeg = ((rawAzDeg % 360) + 360) % 360;

  // Three.js / WebGL 3D 광원 위치 벡터 연산
  // +Y: 상향, +X: 동쪽, -Z: 북쪽
  const azRad = azimuthDeg * RAD;
  const altRad = Math.max(0.08, rawAltitude); // 최저 5도 이상 유지하여 완전 암전 방지
  const cosAlt = Math.cos(altRad);

  const dirX = Math.sin(azRad) * cosAlt;
  const dirY = Math.sin(altRad);
  const dirZ = -Math.cos(azRad) * cosAlt;

  // 고도각에 따른 태양광 색온도 및 조도 강도
  let lightColorHex = '#fff8ed';
  let lightIntensity = 1.15;

  if (altitudeDeg > 25) {
    lightColorHex = '#fffbf0';
    lightIntensity = 1.15;
  } else if (altitudeDeg > 12) {
    lightColorHex = '#fed7aa'; // 골든아워
    lightIntensity = 1.0;
  } else if (altitudeDeg > 2) {
    lightColorHex = '#fb923c'; // 노을
    lightIntensity = 0.8;
  } else {
    lightColorHex = '#93c5fd'; // 일몰 후 박명
    lightIntensity = 0.35;
  }

  return {
    azimuth: rawAzimuth,
    altitude: rawAltitude,
    azimuthDeg,
    altitudeDeg,
    directionalVector: [dirX, dirY, dirZ],
    lightColorHex,
    lightIntensity
  };
}
