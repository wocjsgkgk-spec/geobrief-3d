/**
 * geometryWorker.ts
 *
 * GeoBrief 3D 지오메트리 및 공간 연산 전용 Web Worker
 * - 메인 스레드 블로킹(10ms+ 연산)을 완전 제거하기 위한 백그라운드 워커
 * - Earcut 기반 다각형 정밀 삼각분할
 * - 3D 건물 외벽/지붕/난간/옥탑 버텍스 및 UV/컬러 Float32Array 버퍼 일괄 생성
 * - 토공량(Cut & Fill) 격자 체적 계산
 * - Transferable Objects(ArrayBuffer) 전송으로 0-copy 초고속 반환
 */

// =============================================================================
// 1. 순수 고성능 Earcut 삼각분할 알고리즘 (Zero-Dependency)
// =============================================================================

function earcut(data: number[], holeIndices: number[] | null = null, dim = 2): number[] {
  const hasHoles = holeIndices && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles: number[] = [];

  if (!outerNode || outerNode.next === outerNode.prev) return triangles;

  if (hasHoles) outerNode = eliminateHoles(data, holeIndices!, outerNode, dim);

  // 귀(Ear) 자르기 메인 루프
  earcutLinked(outerNode, triangles, dim);
  return triangles;
}

interface Node {
  i: number;
  x: number;
  y: number;
  prev: Node;
  next: Node;
  z: number;
  prevZ: Node | null;
  nextZ: Node | null;
  steiner: boolean;
}

function linkedList(data: number[], start: number, end: number, dim: number, clockwise: boolean): Node | null {
  let last: Node | null = null;
  if (clockwise === signedArea(data, start, end, dim) > 0) {
    for (let i = start; i < end; i += dim) {
      last = insertNode(i / dim, data[i], data[i + 1], last);
    }
  } else {
    for (let i = end - dim; i >= start; i -= dim) {
      last = insertNode(i / dim, data[i], data[i + 1], last);
    }
  }

  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

function insertNode(i: number, x: number, y: number, last: Node | null): Node {
  const p: Node = {
    i,
    x,
    y,
    prev: null as any,
    next: null as any,
    z: 0,
    prevZ: null,
    nextZ: null,
    steiner: false,
  };

  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

function removeNode(p: Node): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function signedArea(data: number[], start: number, end: number, dim: number): number {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

function equals(p1: Node, p2: Node): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

function area(p: Node, q: Node, r: Node): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (
    (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
    (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
    (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0
  );
}

function isEar(ear: Node): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) return false;

  let p = ear.next.next;
  while (p !== ear.prev) {
    if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) {
      return false;
    }
    p = p.next;
  }
  return true;
}

function earcutLinked(ear: Node | null, triangles: number[], dim: number, pass = 0): void {
  if (!ear) return;

  let stop: Node = ear;
  while (ear && ear.prev !== ear.next) {
    const prev: Node = ear.prev;
    const next: Node = ear.next;

    if (isEar(ear)) {
      triangles.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }

    ear = next;
    if (ear === stop) {
      if (pass === 0) {
        earcutLinked(filterPoints(ear), triangles, dim, 1);
      }
      break;
    }
  }
}

function filterPoints(start: Node | null, end?: Node): Node | null {
  if (!start) return start;
  if (!end) end = start;

  let p = start;
  let again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);

  return end;
}

function eliminateHoles(data: number[], holeIndices: number[], outerNode: Node, dim: number): Node {
  const queue: Node[] = [];
  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * dim;
    const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (list === list?.next) list.steiner = true;
    if (list) queue.push(getLeftmost(list));
  }

  queue.sort((a, b) => a.x - b.x);

  for (let i = 0; i < queue.length; i++) {
    eliminateHole(queue[i], outerNode);
    outerNode = filterPoints(outerNode, outerNode.next)!;
  }
  return outerNode;
}

function getLeftmost(start: Node): Node {
  let p = start;
  let leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}

function eliminateHole(hole: Node, outerNode: Node): void {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
}

function findHoleBridge(hole: Node, outerNode: Node): Node | null {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: Node | null = null;

  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
      }
    }
    p = p.next;
  } while (p !== outerNode);

  return m || outerNode;
}

function splitPolygon(a: Node, b: Node): Node {
  const a2: Node = { i: a.i, x: a.x, y: a.y, prev: null as any, next: null as any, z: 0, prevZ: null, nextZ: null, steiner: false };
  const b2: Node = { i: b.i, x: b.x, y: b.y, prev: null as any, next: null as any, z: 0, prevZ: null, nextZ: null, steiner: false };

  const an = a.next;
  const bp = b.prev;

  a.next = b;
  b.prev = a;

  a2.next = an;
  an.prev = a2;

  b2.next = a2;
  a2.prev = b2;

  bp.next = b2;
  b2.prev = bp;

  return b2;
}

// =============================================================================
// 2. 좌표 투영 및 지오메트리 헬퍼
// =============================================================================

function projectCoordsToLocalMeters(ring: [number, number][], origin: [number, number]): { x: number; y: number }[] {
  const [origLng, origLat] = origin;
  const latRad = (origLat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const dx = (lng - origLng) * metersPerDegLng;
    const dy = (lat - origLat) * metersPerDegLat;
    pts.push({ x: dx, y: dy });
  }
  return pts;
}

function addQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  p0: { x: number; y: number; z: number },
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number },
  nx: number,
  ny: number,
  nz: number,
  uv0: { u: number; v: number },
  uv1: { u: number; v: number },
  uv2: { u: number; v: number },
  uv3: { u: number; v: number },
  r = 0.98,
  g = 0.98,
  b = 0.99
): void {
  // Triangle 1: p0 -> p1 -> p2
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  // Triangle 2: p0 -> p2 -> p3
  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);

  for (let k = 0; k < 6; k++) {
    normals.push(nx, ny, nz);
    colors.push(r, g, b);
  }

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);
}

function addShadowQuad(
  positions: number[],
  colors: number[],
  p0: { x: number; y: number; z: number; a: number },
  p1: { x: number; y: number; z: number; a: number },
  p2: { x: number; y: number; z: number; a: number },
  p3: { x: number; y: number; z: number; a: number },
  r = 0.008,
  g = 0.024,
  b = 0.09
): void {
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  colors.push(r, g, b, p0.a, r, g, b, p1.a, r, g, b, p2.a);

  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  colors.push(r, g, b, p0.a, r, g, b, p2.a, r, g, b, p3.a);
}

// =============================================================================
// 3. 건물 다각형 1:1 Earcut 압출 및 마스터 버텍스 생성 파이프라인
// =============================================================================

export interface BuildBuildingsPayload {
  features: any[];
  originLngLat: [number, number];
}

export interface BuildBuildingsResult {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  shadowPositions: Float32Array;
  shadowColors: Float32Array;
  buildingCount: number;
}

function buildBuildingGeometry(payload: BuildBuildingsPayload): BuildBuildingsResult {
  const { features, originLngLat } = payload;

  const masterPositions: number[] = [];
  const masterNormals: number[] = [];
  const masterUvs: number[] = [];
  const masterColors: number[] = [];

  const shadowPositions: number[] = [];
  const shadowColors: number[] = [];

  let count = 0;

  for (const feat of features) {
    if (!feat.geometry) continue;

    const props = feat.properties || {};
    const name = String(props.name || props.name_ko || '');
    const usageType = String(
      props.usageType || props.bld_category || props.type || props.class || ''
    ).toLowerCase();

    const rawFlr = Number(
      props['building:levels'] || props.building_levels || props.levels || props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || 0
    );
    const rawHei = Number(
      props.height || props.render_height || props.hei || props.HEI || props.bld_hgt || 0
    );

    // 1개 층 3.0m 기준 높이
    const explicitH = rawHei > 0 ? rawHei : (rawFlr > 0 ? rawFlr * 3.0 : 0);

    const rings: [number, number][][] = [];
    if (feat.geometry.type === 'Polygon') {
      rings.push(feat.geometry.coordinates[0] as [number, number][]);
    } else if (feat.geometry.type === 'MultiPolygon') {
      for (const poly of feat.geometry.coordinates) {
        rings.push(poly[0] as [number, number][]);
      }
    }

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;

      const pts = projectCoordsToLocalMeters(ring, originLngLat);
      if (pts.length < 3) continue;

      // 높이 결정
      let totalH = explicitH;
      const isApt =
        name.includes('아파트') ||
        name.includes('apt') ||
        usageType.includes('apartment');
      const isComm =
        name.includes('타워') ||
        name.includes('빌딩') ||
        usageType.includes('commercial') ||
        usageType.includes('office');

      if (totalH <= 0) {
        totalH = isApt ? 60.0 : isComm ? 12.0 : 6.0;
      }
      totalH = Math.max(3.0, Math.min(200.0, totalH));

      // 벽면 색상 팔레트
      let r = 0.97, g = 0.98, b = 0.99; // 아파트 기본 화이트/아이보리
      if (isComm) {
        r = 0.80; g = 0.85; b = 0.92; // 상업 쿨그레이/블루
      } else if (!isApt) {
        r = 0.95; g = 0.96; b = 0.97; // 일반 주택 웜베이지
      }

      const numPts = pts.length;

      // 1) 외벽(Wall) 1:1 수직 압출
      for (let i = 0; i < numPts; i++) {
        const nextIdx = (i + 1) % numPts;
        const p1 = pts[i];
        const p2 = pts[nextIdx];

        const edgeDx = p2.x - p1.x;
        const edgeDz = p2.y - p1.y;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDz * edgeDz);
        if (edgeLen < 0.05) continue;

        // 외향 법선
        const nx = edgeDz / edgeLen;
        const nz = -edgeDx / edgeLen;

        const baseH = 0;
        const topH = totalH;

        // 기단부 (0 ~ 3.5m)
        const foundationH = Math.min(3.5, topH);
        addQuad(
          masterPositions, masterNormals, masterUvs, masterColors,
          { x: p1.x, y: baseH, z: -p1.y },
          { x: p2.x, y: baseH, z: -p2.y },
          { x: p2.x, y: foundationH, z: -p2.y },
          { x: p1.x, y: foundationH, z: -p1.y },
          nx, 0, -nz,
          { u: 0, v: 0 }, { u: edgeLen / 4.0, v: 0 },
          { u: edgeLen / 4.0, v: 1 }, { u: 0, v: 1 },
          0.39, 0.45, 0.55 // 다크 화강석 #64748b
        );

        // 본체 (3.5m ~ topH)
        if (topH > foundationH) {
          addQuad(
            masterPositions, masterNormals, masterUvs, masterColors,
            { x: p1.x, y: foundationH, z: -p1.y },
            { x: p2.x, y: foundationH, z: -p2.y },
            { x: p2.x, y: topH, z: -p2.y },
            { x: p1.x, y: topH, z: -p1.y },
            nx, 0, -nz,
            { u: 0, v: 0 }, { u: edgeLen / 4.0, v: 0 },
            { u: edgeLen / 4.0, v: (topH - foundationH) / 3.0 }, { u: 0, v: (topH - foundationH) / 3.0 },
            r, g, b
          );
        }

        // 지면 접지 그림자(Ground Contact Shadow)
        const shadowWidth = 1.8;
        addShadowQuad(
          shadowPositions, shadowColors,
          { x: p1.x, y: 0.02, z: -p1.y, a: 0.45 },
          { x: p2.x, y: 0.02, z: -p2.y, a: 0.45 },
          { x: p2.x + nx * shadowWidth, y: 0.01, z: -(p2.y - nz * shadowWidth), a: 0.0 },
          { x: p1.x + nx * shadowWidth, y: 0.01, z: -(p1.y - nz * shadowWidth), a: 0.0 }
        );
      }

      // 2) 지붕(Roof) Earcut 1:1 정밀 삼각화
      const flatCoords: number[] = [];
      for (const p of pts) {
        flatCoords.push(p.x, p.y);
      }

      const triangles = earcut(flatCoords, null, 2);
      if (triangles.length > 0) {
        // 옥상 색상: 고층 다크슬레이트 #334155, 저층 초록 우레탄 #15803d
        let roofR = 0.08, roofG = 0.50, roofB = 0.24; // 초록 #15803d
        if (totalH >= 28.0 || isApt || isComm) {
          roofR = 0.20; roofG = 0.25; roofB = 0.33; // 다크 슬레이트 #334155
        }

        const roofH = totalH + 0.15; // 미세 단차
        for (let t = 0; t < triangles.length; t += 3) {
          const idx0 = triangles[t];
          const idx1 = triangles[t + 1];
          const idx2 = triangles[t + 2];

          const p0 = pts[idx0];
          const p1 = pts[idx1];
          const p2 = pts[idx2];

          // 삼각형 추가 (Top Face: Normal = 0, 1, 0)
          masterPositions.push(p0.x, roofH, -p0.y);
          masterPositions.push(p1.x, roofH, -p1.y);
          masterPositions.push(p2.x, roofH, -p2.y);

          for (let k = 0; k < 3; k++) {
            masterNormals.push(0, 1, 0);
            masterColors.push(roofR, roofG, roofB);
          }

          masterUvs.push(p0.x / 10.0, p0.y / 10.0);
          masterUvs.push(p1.x / 10.0, p1.y / 10.0);
          masterUvs.push(p2.x / 10.0, p2.y / 10.0);
        }
      }

      count++;
    }
  }

  return {
    positions: new Float32Array(masterPositions),
    normals: new Float32Array(masterNormals),
    uvs: new Float32Array(masterUvs),
    colors: new Float32Array(masterColors),
    shadowPositions: new Float32Array(shadowPositions),
    shadowColors: new Float32Array(shadowColors),
    buildingCount: count,
  };
}

// =============================================================================
// 4. 토공량(Cut & Fill) 격자 체적 백그라운드 계산
// =============================================================================

export interface ComputeCutFillPayload {
  cells: {
    coords: [number, number];
    elevation: number;
    feature: any;
  }[];
  targetElevation: number;
  cellAreaM2: number;
}

export interface ComputeCutFillResult {
  totalCutVolumeM3: number;
  totalFillVolumeM3: number;
  cutCellCount: number;
  fillCellCount: number;
  balancedCellCount: number;
  zeroBalanceElevation: number;
  avgElevation: number;
  minElevation: number;
  maxElevation: number;
  items: {
    elevation: number;
    diff: number;
    type: 'cut' | 'fill' | 'balanced';
    volumeM3: number;
  }[];
}

function computeCutFill(payload: ComputeCutFillPayload): ComputeCutFillResult {
  const { cells, targetElevation, cellAreaM2 } = payload;
  const elevations = cells.map((c) => c.elevation);

  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const sumElevation = elevations.reduce((acc, v) => acc + v, 0);
  const avgElevation = Math.round((sumElevation / (elevations.length || 1)) * 10) / 10;
  const zeroBalanceElevation = avgElevation;

  let totalCutVolumeM3 = 0;
  let totalFillVolumeM3 = 0;
  let cutCellCount = 0;
  let fillCellCount = 0;
  let balancedCellCount = 0;

  const items = cells.map((item) => {
    const elev = Math.round(item.elevation * 10) / 10;
    const diff = Math.round((elev - targetElevation) * 10) / 10;

    let type: 'cut' | 'fill' | 'balanced' = 'balanced';
    let volumeM3 = 0;

    if (diff > 0.1) {
      type = 'cut';
      volumeM3 = Math.round(diff * cellAreaM2 * 10) / 10;
      totalCutVolumeM3 += volumeM3;
      cutCellCount++;
    } else if (diff < -0.1) {
      type = 'fill';
      volumeM3 = Math.round(Math.abs(diff) * cellAreaM2 * 10) / 10;
      totalFillVolumeM3 += volumeM3;
      fillCellCount++;
    } else {
      type = 'balanced';
      balancedCellCount++;
    }

    return {
      elevation: elev,
      diff,
      type,
      volumeM3,
    };
  });

  return {
    totalCutVolumeM3: Math.round(totalCutVolumeM3),
    totalFillVolumeM3: Math.round(totalFillVolumeM3),
    cutCellCount,
    fillCellCount,
    balancedCellCount,
    zeroBalanceElevation,
    avgElevation,
    minElevation,
    maxElevation,
    items,
  };
}

// =============================================================================
// 5. Worker 메시지 디스패처 (Transferable Objects 지원)
// =============================================================================

self.onmessage = (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'BUILD_BUILDINGS') {
      const result = buildBuildingGeometry(payload);
      // Transferable ArrayBuffers (0-copy 전송)
      const transferList = [
        result.positions.buffer,
        result.normals.buffer,
        result.uvs.buffer,
        result.colors.buffer,
        result.shadowPositions.buffer,
        result.shadowColors.buffer,
      ];
      (self as any).postMessage({ id, type, success: true, result }, transferList);
    } else if (type === 'COMPUTE_CUT_FILL') {
      const result = computeCutFill(payload);
      (self as any).postMessage({ id, type, success: true, result });
    } else {
      (self as any).postMessage({ id, type, success: false, error: `Unknown worker action: ${type}` });
    }
  } catch (err: any) {
    (self as any).postMessage({ id, type, success: false, error: err?.message || String(err) });
  }
};
