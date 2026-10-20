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

import { buildOsmBuildingGeometry } from '@/lib/vendor/osmGeometryBuilder';

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

function addBuildingQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  buildingDatas: number[],
  demCoords: number[],
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
  bldType: number,
  floors: number,
  partType: number,
  wallLength: number,
  dem0: { u: number; v: number },
  dem1: { u: number; v: number },
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
    buildingDatas.push(bldType, floors, partType, wallLength);
  }

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);

  // DEM uv per vertex
  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem1.u, dem1.v);
  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem0.u, dem0.v);
}

function addShadowQuad(
  positions: number[],
  colors: number[],
  p0: { x: number; y: number; z: number; a: number },
  p1: { x: number; y: number; z: number; a: number },
  p2: { x: number; y: number; z: number; a: number },
  p3: { x: number; y: number; z: number; a: number },
  r = 0.0392,
  g = 0.0588,
  b = 0.1176
): void {
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  colors.push(r, g, b, p0.a, r, g, b, p1.a, r, g, b, p2.a);

  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  colors.push(r, g, b, p0.a, r, g, b, p2.a, r, g, b, p3.a);
}

function addShadowTriangle(
  positions: number[],
  colors: number[],
  p0: { x: number; y: number; z: number; a: number },
  p1: { x: number; y: number; z: number; a: number },
  p2: { x: number; y: number; z: number; a: number },
  r = 0.059,
  g = 0.090,
  b = 0.165
): void {
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  colors.push(r, g, b, p0.a, r, g, b, p1.a, r, g, b, p2.a);
}

// =============================================================================
// 3. 건물 다각형 1:1 Earcut 압출 및 마스터 버텍스 생성 파이프라인
// =============================================================================

export interface BuildBuildingsPayload {
  features: any[];
  originLngLat: [number, number];
  demBounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  sunDirection?: [number, number, number];       // [sX, sY, sZ]
  zoom?: number;                                 // 카메라 줌 레벨 (LOD 분기용)
  satelliteRoofColors?: Record<string | number, any>;
}

export interface BuildBuildingsResult {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  buildingData: Float32Array; // aBuildingData (vec4)
  demCoords: Float32Array;    // aDemCoord (vec2)
  shadowPositions: Float32Array;
  shadowColors: Float32Array;
  buildingCount: number;
  demBounds: [number, number, number, number];
}

function buildBuildingGeometry(payload: BuildBuildingsPayload): BuildBuildingsResult {
  const { features, originLngLat, demBounds, sunDirection, zoom = 16 } = payload;
  const isNearDetail = zoom >= 15.2; // 근접 상세 뷰 (15.2 이상)
  const isStandardOrAbove = zoom >= 13.5; // 표준 조감도 뷰 (13.5 이상)
  const sunDir = sunDirection || [0.65, 0.75, 0.45];
  const sX = sunDir[0];
  const sY = Math.max(0.25, sunDir[1]);
  const sZ = sunDir[2];

  const masterPositions: number[] = [];
  const masterNormals: number[] = [];
  const masterUvs: number[] = [];
  const masterColors: number[] = [];
  const masterBuildingData: number[] = [];
  const masterDemCoords: number[] = [];

  const shadowPositions: number[] = [];
  const shadowColors: number[] = [];

  // 지리적 경계 산출 (DEM 텍스처 좌표 매핑용)
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  if (demBounds && demBounds.length === 4) {
    [minLng, minLat, maxLng, maxLat] = demBounds;
  } else {
    for (const feat of features) {
      if (!feat.geometry) continue;
      const rings: [number, number][][] = [];
      if (feat.geometry.type === 'Polygon') {
        rings.push(feat.geometry.coordinates[0]);
      } else if (feat.geometry.type === 'MultiPolygon') {
        for (const poly of feat.geometry.coordinates) rings.push(poly[0]);
      }
      for (const ring of rings) {
        if (!ring) continue;
        for (const pt of ring) {
          if (!pt) continue;
          const lng = pt[0], lat = pt[1];
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
  }

  if (!Number.isFinite(minLng)) {
    minLng = originLngLat[0] - 0.02;
    maxLng = originLngLat[0] + 0.02;
    minLat = originLngLat[1] - 0.02;
    maxLat = originLngLat[1] + 0.02;
  }
  const rangeLng = Math.max(0.0001, maxLng - minLng);
  const rangeLat = Math.max(0.0001, maxLat - minLat);

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

      const isApt =
        name.includes('아파트') ||
        name.includes('apt') ||
        name.includes('단지') ||
        name.includes('푸르지오') ||
        name.includes('자이') ||
        name.includes('힐스테이트') ||
        name.includes('래미안') ||
        name.includes('e편한') ||
        name.includes('더샵') ||
        name.includes('아이파크') ||
        name.includes('롯데캐슬') ||
        name.includes('한신') ||
        name.includes('삼호') ||
        name.includes('두산') ||
        name.includes('우성') ||
        name.includes('현대') ||
        name.includes('동보') ||
        name.includes('세경') ||
        name.includes('코아루') ||
        name.includes('부영') ||
        name.includes('주공') ||
        usageType.includes('apartment');

      const isComm =
        name.includes('타워') ||
        name.includes('빌딩') ||
        name.includes('센터') ||
        usageType.includes('commercial') ||
        usageType.includes('office');

      // 높이 및 목표 층수 결정
      let totalH = explicitH;
      if (totalH <= 0) {
        totalH = isApt ? 54.0 : isComm ? 12.0 : 6.0;
      }
      totalH = Math.max(3.5, Math.min(250.0, totalH));
      const floors = rawFlr > 0 ? rawFlr : Math.max(1, Math.round(totalH / 3.0));

      // 건물 유형 코드: 0=주택, 1=상업, 2=아파트
      const bldType = isApt ? 2.0 : (isComm ? 1.0 : 0.0);

      // 벽면 기본 색상 팔레트 (한국 실제 건축물 유형별 실측 도색)
      let r = 0.957, g = 0.945, b = 0.918; // 아파트 기본 크림 아이보리 (#f4f1ea)
      if (isComm) {
        r = 0.839; g = 0.827; b = 0.820; // 상업/근린생활시설 베이지·그레이 스톤 (#d6d3d1)
      } else if (!isApt) {
        r = 0.604; g = 0.204; b = 0.071; // 일반 주택 적벽돌 (#9a3412) / 회벽 투톤
      }

      const numPts = pts.length;

      // 태양광 투영 그림자 오프셋 산출 (rgba(15, 23, 42, 0.45))
      const dropScale = Math.min(2.5, 1.0 / sY);
      const dropLength = totalH * dropScale;
      const dropDx = -sX * dropLength;
      const dropDz = -sZ * dropLength;

      // 다각형 내 최장 변 길이 산출 (측벽 코어 판정용)
      let maxEdgeLen = 0;
      for (let i = 0; i < numPts; i++) {
        const nextIdx = (i + 1) % numPts;
        const edx = pts[nextIdx].x - pts[i].x;
        const edz = pts[nextIdx].y - pts[i].y;
        const elen = Math.sqrt(edx * edx + edz * edz);
        if (elen > maxEdgeLen) maxEdgeLen = elen;
      }

      // 1) 외벽(Wall) 1:1 수직 압출
      for (let i = 0; i < numPts; i++) {
        const nextIdx = (i + 1) % numPts;
        const p1 = pts[i];
        const p2 = pts[nextIdx];
        const coord1 = ring[i];
        const coord2 = ring[nextIdx];

        const edgeDx = p2.x - p1.x;
        const edgeDz = p2.y - p1.y;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDz * edgeDz);
        if (edgeLen < 0.05) continue;

        // 외향 법선
        const nx = edgeDz / edgeLen;
        const nz = -edgeDx / edgeLen;

        // 측벽 코어 판정: 10층 이상 아파트 단지의 단변(폭 16m 이하 또는 장변 대비 45% 이하)은 무창 엘리베이터 코어 벽면
        let partType = 0.0; // 0=외벽 파사드
        if (isApt && floors >= 10.0 && maxEdgeLen >= 25.0) {
          if (edgeLen <= 16.0 || edgeLen <= maxEdgeLen * 0.45) {
            partType = 3.0; // 3=측벽 수직 코어
          }
        }

        // DEM 텍스처 정규 좌표 (0.0 ~ 1.0)
        const dem0 = {
          u: (coord1[0] - minLng) / rangeLng,
          v: (coord1[1] - minLat) / rangeLat,
        };
        const dem1 = {
          u: (coord2[0] - minLng) / rangeLng,
          v: (coord2[1] - minLat) / rangeLat,
        };

        // 단일 쿼드 압출 (0m ~ totalH, 셰이더에서 0~3.5m 기단부 및 층별 슬래브/창문 자동 분기)
        addBuildingQuad(
          masterPositions, masterNormals, masterUvs, masterColors,
          masterBuildingData, masterDemCoords,
          { x: p1.x, y: 0, z: -p1.y },
          { x: p2.x, y: 0, z: -p2.y },
          { x: p2.x, y: totalH, z: -p2.y },
          { x: p1.x, y: totalH, z: -p1.y },
          nx, 0, -nz,
          { u: 0, v: 0 },
          { u: edgeLen, v: 0 },
          { u: edgeLen, v: totalH },
          { u: 0, v: totalH },
          bldType,
          floors,
          partType,
          edgeLen,
          dem0,
          dem1,
          r, g, b
        );

        // 1) 접지 음영 (Contact Ambient Occlusion: 투명도 0.12 이하)
        const aoWidth = 1.5;
        addShadowQuad(
          shadowPositions, shadowColors,
          { x: p1.x, y: 0.02, z: -p1.y, a: 0.12 },
          { x: p2.x, y: 0.02, z: -p2.y, a: 0.12 },
          { x: p2.x + nx * aoWidth, y: 0.015, z: -(p2.y - nz * aoWidth), a: 0.0 },
          { x: p1.x + nx * aoWidth, y: 0.015, z: -(p1.y - nz * aoWidth), a: 0.0 },
          0.015, 0.025, 0.045
        );

        if (isNearDetail) {
          addShadowQuad(
            shadowPositions, shadowColors,
            { x: p1.x, y: 0.025, z: -p1.y, a: 0.12 },
            { x: p2.x, y: 0.025, z: -p2.y, a: 0.12 },
            { x: p2.x + nx * 0.75, y: 0.022, z: -(p2.y - nz * 0.75), a: 0.05 },
            { x: p1.x + nx * 0.75, y: 0.022, z: -(p1.y - nz * 0.75), a: 0.05 },
            0.008, 0.015, 0.030
          );
        }

        // 2) 태양광 방향 일치 평면 투영 그림자 (Planar Shadow: 투명도 0.10)
        const nDotL = nx * sX + (-nz) * sZ;
        if (nDotL < 0.20 && totalH >= 3.0) {
          addShadowQuad(
            shadowPositions, shadowColors,
            { x: p1.x, y: 0.02, z: -p1.y, a: 0.10 },
            { x: p2.x, y: 0.02, z: -p2.y, a: 0.10 },
            { x: p1.x + dropDx, y: 0.015, z: -p2.y + dropDz, a: 0.10 },
            { x: p1.x + dropDx, y: 0.015, z: -p1.y + dropDz, a: 0.10 },
            0.0392, 0.0588, 0.1176
          );
        }
      }

      // 2) 지붕(Roof) Earcut 1:1 정밀 삼각화
      const flatCoords: number[] = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        flatCoords.push(p.x, p.y);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const polyDiameter = Math.max(maxX - minX, maxY - minY, 1.0);

      const triangles = earcut(flatCoords, null, 2);
      if (triangles.length > 0) {
        // [실제 한국 도심 지붕 색감 팔레트]:
        // 대단지 아파트/오피스: 웨더링된 콘크리트 웜 그레이 #64748b 및 다크 차콜 #475569
        // 중·저층 상가/빌라: 실제 우레탄 방수 톤 세이지 그린 #2e5a44 및 다크 올리브 그린 #365314
        // 단독주택: 테라코타 브라운 #7c2d12 / 다크 네이비 슬레이트 #1e3a8a
        let roofR = 0.180, roofG = 0.353, roofB = 0.267; // 기본: 차분한 세이지 그린 #2e5a44
        if (isApt || totalH >= 25.0) {
          roofR = 0.392; roofG = 0.455; roofB = 0.545; // 아파트/오피스: 웨더링 웜 그레이 #64748b
        } else if (isComm || (totalH >= 9.0 && totalH < 25.0)) {
          roofR = 0.180; roofG = 0.353; roofB = 0.267; // 상가: 세이지 그린 #2e5a44
        } else {
          roofR = 0.486; roofG = 0.176; roofB = 0.071; // 저층 주택: 테라코타 브라운 #7c2d12
        }

        const roofH = totalH + 0.15; // 미세 단차
        for (let t = 0; t < triangles.length; t += 3) {
          const idx0 = triangles[t];
          const idx1 = triangles[t + 1];
          const idx2 = triangles[t + 2];

          const p0 = pts[idx0];
          const p1 = pts[idx1];
          const p2 = pts[idx2];

          const c0 = ring[idx0] || ring[0];
          const c1 = ring[idx1] || ring[0];
          const c2 = ring[idx2] || ring[0];

          // 삼각형 추가 (Top Face: Normal = 0, 1, 0)
          masterPositions.push(p0.x, roofH, -p0.y);
          masterPositions.push(p1.x, roofH, -p1.y);
          masterPositions.push(p2.x, roofH, -p2.y);

          for (let k = 0; k < 3; k++) {
            masterNormals.push(0, 1, 0);
            masterColors.push(roofR, roofG, roofB);
            masterBuildingData.push(bldType, floors, 1.0, polyDiameter); // partType: 1.0 (옥상)
          }

          masterUvs.push(p0.x, p0.y);
          masterUvs.push(p1.x, p1.y);
          masterUvs.push(p2.x, p2.y);

          masterDemCoords.push((c0[0] - minLng) / rangeLng, (c0[1] - minLat) / rangeLat);
          masterDemCoords.push((c1[0] - minLng) / rangeLng, (c1[1] - minLat) / rangeLat);
          masterDemCoords.push((c2[0] - minLng) / rangeLng, (c2[1] - minLat) / rangeLat);
        }

        // 3) 초경량 평면 투영 그림자 (Planar Drop Shadow: 옥상 다각형 전체 투영)
        // 건물 복합 형태(ㄱ자, ㄷ자)가 지면에 완전한 실루엣으로 투영 (근접 상세 뷰 또는 고층 건물에서 활성화)
        if (totalH >= 5.0 && (isNearDetail || totalH >= 20.0)) {
          for (let t = 0; t < triangles.length; t += 3) {
            const idx0 = triangles[t];
            const idx1 = triangles[t + 1];
            const idx2 = triangles[t + 2];

            const p0 = pts[idx0];
            const p1 = pts[idx1];
            const p2 = pts[idx2];

            addShadowTriangle(
              shadowPositions, shadowColors,
              { x: p0.x + dropDx, y: 0.012, z: -p0.y + dropDz, a: 0.10 },
              { x: p1.x + dropDx, y: 0.012, z: -p1.y + dropDz, a: 0.10 },
              { x: p2.x + dropDx, y: 0.012, z: -p2.y + dropDz, a: 0.10 },
              0.0392, 0.0588, 0.1176
            );
          }
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
    buildingData: new Float32Array(masterBuildingData),
    demCoords: new Float32Array(masterDemCoords),
    shadowPositions: new Float32Array(shadowPositions),
    shadowColors: new Float32Array(shadowColors),
    buildingCount: count,
    demBounds: [minLng, minLat, maxLng, maxLat],
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
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let sumElevation = 0;
  for (let i = 0; i < cells.length; i++) {
    const e = cells[i].elevation;
    if (e < minElevation) minElevation = e;
    if (e > maxElevation) maxElevation = e;
    sumElevation += e;
  }
  const avgElevation = cells.length > 0 ? Math.round((sumElevation / cells.length) * 10) / 10 : 0;
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
      const result = buildOsmBuildingGeometry(payload as any);
      // Transferable ArrayBuffers (0-copy 전송)
      const transferList = [
        result.positions.buffer,
        result.normals.buffer,
        result.uvs.buffer,
        result.colors.buffer,
        result.buildingData.buffer,
        result.demCoords.buffer,
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
