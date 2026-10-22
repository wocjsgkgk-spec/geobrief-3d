/**
 * lib/vendor/osmGeometryBuilder.ts
 *
 * OSMBuildings (OSMBuildings/OSMBuildings) & mapbox/earcut 핵심 알고리즘 벤더링 모듈
 * - Earcut 기반 다각형 정밀 삼각분할 (외부 링 및 내부 중정 Holes 완벽 지원)
 * - 한국형 건축물 4단 입체 구조 [기단부(0~3.5m) + 본동 외벽(3.5m~H) + 옥상 난간(Parapet: 0.3m두께, 0.9m높이) + 옥상 슬래브]
 * - 미터(m) 단위 창문 1칸 폭 2.8m, 층고 3.0m 비례 균일 UV 직렬화
 * - 단일 Draw Call 렌더링을 위한 순수 Float32Array 지오메트리 버퍼 생성 (Transferable Objects 대응)
 */

import earcut from 'earcut';
import { classifyRegionalBuildingStyle, RegionalBuildingStyle } from '@/utils/regionalBuildingStyler';
import type { SatelliteRoofColor } from '@/utils/satelliteRoofSampler';
import { classifyBuildingWithVendor } from '@/lib/vendor/buildingClassifier';

export interface OSMGeometryOptions {
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  originLngLat: [number, number];
  demBounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  sunDirection?: [number, number, number];       // [sX, sY, sZ]
  zoom?: number;
  satelliteRoofColors?: Record<string | number, SatelliteRoofColor>;
  maxLod2Count?: number; // 카메라 중심 우선 2,500동 완전한 LOD2 기하구조 (기본: 2500)
}

export interface OSMGeometryResult {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  buildingData: Float32Array; // [bldType, floors, partType, wallLength] (vec4)
  demCoords: Float32Array;    // [u, v] (vec2)
  shadowPositions: Float32Array;
  shadowColors: Float32Array;
  buildingCount: number;
  demBounds: [number, number, number, number];
}

interface Point2D {
  x: number;
  y: number;
}

/**
 * WGS84 [lng, lat] 좌표를 originLngLat 중심 로컬 미터(m) 평면 좌표로 투영 (메르카토르 왜곡 보정)
 */
function projectPointToMeters(lng: number, lat: number, origin: [number, number]): Point2D {
  const [origLng, origLat] = origin;
  const latRad = (origLat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);
  return {
    x: (lng - origLng) * metersPerDegLng,
    y: (lat - origLat) * metersPerDegLat,
  };
}

/**
 * 닫힌 폴리곤 링의 중복 끝점(last === first)을 정돈
 */
function cleanRingCoords(ring: [number, number][]): [number, number][] {
  if (!ring || ring.length < 3) return [];
  const pts = [...ring];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-7 && Math.abs(first[1] - last[1]) < 1e-7) {
    pts.pop();
  }
  return pts;
}

/**
 * 2D 다각형 부호 면적 계산 (양수: CCW, 음수: CW)
 */
function signedArea(pts: Point2D[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area * 0.5;
}

/**
 * 다각형의 안쪽 수직 법선 방향으로 insetDist(미터)만큼 축소(Inset)한 다각형을 계산합니다.
 */
function computePolygonInset(pts: Point2D[], insetDist: number): Point2D[] {
  const n = pts.length;
  if (n < 3) return pts;
  const result: Point2D[] = [];

  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const l1 = Math.hypot(d1x, d1y);
    if (l1 < 1e-4) { result.push({ ...curr }); continue; }
    const inN1x = -d1y / l1;
    const inN1y = d1x / l1;

    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l2 = Math.hypot(d2x, d2y);
    if (l2 < 1e-4) { result.push({ ...curr }); continue; }
    const inN2x = -d2y / l2;
    const inN2y = d2x / l2;

    let avgNx = inN1x + inN2x;
    let avgNy = inN1y + inN2y;
    const avgLen = Math.hypot(avgNx, avgNy);
    if (avgLen < 1e-4) {
      const toCx = cx - curr.x;
      const toCy = cy - curr.y;
      const toCLen = Math.hypot(toCx, toCy);
      if (toCLen > 1e-4) {
        result.push({ x: curr.x + (toCx / toCLen) * insetDist, y: curr.y + (toCy / toCLen) * insetDist });
      } else {
        result.push({ ...curr });
      }
      continue;
    }

    avgNx /= avgLen;
    avgNy /= avgLen;

    const sinHalfAngle = inN1x * avgNx + inN1y * avgNy;
    const miterScale = Math.min(2.0, Math.max(0.7, 1.0 / Math.max(0.3, sinHalfAngle)));

    result.push({
      x: curr.x + avgNx * insetDist * miterScale,
      y: curr.y + avgNy * insetDist * miterScale,
    });
  }

  // 면적이 너무 작아지거나 뒤집히면 중심 방향 스케일링으로 폴백
  const origArea = signedArea(pts);
  const insetArea = signedArea(result);
  if (insetArea <= 0 || insetArea < origArea * 0.25) {
    const scale = Math.max(0.75, 1.0 - (insetDist * 2.0) / Math.max(10.0, Math.sqrt(Math.abs(origArea))));
    return pts.map(p => ({
      x: cx + (p.x - cx) * scale,
      y: cy + (p.y - cy) * scale,
    }));
  }

  return result;
}

/**
 * 다각형의 바깥쪽 수직 법선 방향으로 outsetDist(미터)만큼 확장(Outset/Buffer)한 다각형을 계산합니다.
 * 위성사진 바닥의 2D 평면 지붕 잔상을 완전히 덮는 지면 인페인팅 마스크로 사용됩니다.
 */
function computePolygonOutset(pts: Point2D[], outsetDist: number): Point2D[] {
  const n = pts.length;
  if (n < 3) return pts;
  const result: Point2D[] = [];

  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const l1 = Math.hypot(d1x, d1y);
    if (l1 < 1e-4) { result.push({ ...curr }); continue; }
    // 바깥쪽 법선 (CCW 기준 우측 수직)
    const outN1x = d1y / l1;
    const outN1y = -d1x / l1;

    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l2 = Math.hypot(d2x, d2y);
    if (l2 < 1e-4) { result.push({ ...curr }); continue; }
    const outN2x = d2y / l2;
    const outN2y = -d2x / l2;

    let avgNx = outN1x + outN2x;
    let avgNy = outN1y + outN2y;
    const avgLen = Math.hypot(avgNx, avgNy);
    if (avgLen < 1e-4) {
      const fromCx = curr.x - cx;
      const fromCy = curr.y - cy;
      const fromCLen = Math.hypot(fromCx, fromCy);
      if (fromCLen > 1e-4) {
        result.push({ x: curr.x + (fromCx / fromCLen) * outsetDist, y: curr.y + (fromCy / fromCLen) * outsetDist });
      } else {
        result.push({ ...curr });
      }
      continue;
    }

    avgNx /= avgLen;
    avgNy /= avgLen;

    const sinHalfAngle = outN1x * avgNx + outN1y * avgNy;
    const miterScale = Math.min(2.0, Math.max(0.7, 1.0 / Math.max(0.3, sinHalfAngle)));

    result.push({
      x: curr.x + avgNx * outsetDist * miterScale,
      y: curr.y + avgNy * outsetDist * miterScale,
    });
  }

  return result;
}

/**
 * 사각 쿼드(Quad)를 2개의 삼각형(6 버텍스)으로 버퍼에 직렬화
 */
function addQuadVertices(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  buildingDatas: number[],
  demCoords: number[],
  p0: { x: number; y: number; z: number }, // BL
  p1: { x: number; y: number; z: number }, // BR
  p2: { x: number; y: number; z: number }, // TR
  p3: { x: number; y: number; z: number }, // TL
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
  slotId: number,
  dem0: { u: number; v: number },
  dem1: { u: number; v: number },
  r: number,
  g: number,
  b: number
): void {
  // Triangle 1: p0 -> p1 -> p2
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  // Triangle 2: p0 -> p2 -> p3
  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);

  for (let k = 0; k < 6; k++) {
    normals.push(nx, ny, nz);
    colors.push(r, g, b);
    buildingDatas.push(bldType, floors, partType, slotId);
  }

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);

  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem1.u, dem1.v);
  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem0.u, dem0.v);
}

/**
 * 4개 정점별로 색상 그라데이션이 적용되는 쿼드 생성기 (1.2m 난간 내측 AO 전용)
 */
function addQuadGradientVertices(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  buildingDatas: number[],
  demCoords: number[],
  p0: { x: number; y: number; z: number }, // BL
  p1: { x: number; y: number; z: number }, // BR
  p2: { x: number; y: number; z: number }, // TR
  p3: { x: number; y: number; z: number }, // TL
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
  slotId: number,
  dem0: { u: number; v: number },
  dem1: { u: number; v: number },
  c0: [number, number, number],
  c1: [number, number, number],
  c2: [number, number, number],
  c3: [number, number, number]
): void {
  // Triangle 1: p0 -> p1 -> p2
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  // Triangle 2: p0 -> p2 -> p3
  positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);

  for (let k = 0; k < 6; k++) {
    normals.push(nx, ny, nz);
    buildingDatas.push(bldType, floors, partType, slotId);
  }

  // Tri 1: c0 -> c1 -> c2
  colors.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
  // Tri 2: c0 -> c2 -> c3
  colors.push(c0[0], c0[1], c0[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);

  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem1.u, dem1.v);
  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem0.u, dem0.v);
}

function addTriangleVertices(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  buildingDatas: number[],
  demCoords: number[],
  p0: { x: number; y: number; z: number },
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  nx: number,
  ny: number,
  nz: number,
  uv0: { u: number; v: number },
  uv1: { u: number; v: number },
  uv2: { u: number; v: number },
  bldType: number,
  floors: number,
  partType: number,
  slotId: number,
  dem0: { u: number; v: number },
  dem1: { u: number; v: number },
  dem2: { u: number; v: number },
  r: number,
  g: number,
  b: number
): void {
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  for (let k = 0; k < 3; k++) {
    normals.push(nx, ny, nz);
    colors.push(r, g, b);
    buildingDatas.push(bldType, floors, partType, slotId);
  }
  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem2.u, dem2.v);
}

/**
 * 접지 그림자 및 실시간 태양광 투영 그림자 쿼드 직렬화
 */
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
  r = 0.0392,
  g = 0.0588,
  b = 0.1176
): void {
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  colors.push(r, g, b, p0.a, r, g, b, p1.a, r, g, b, p2.a);
}

/**
 * OSMBuildings 다각형 압출 및 earcut 지붕 삼각분할 기반 단일 버퍼 지오메트리 빌더
 */
export function buildOsmBuildingGeometry(options: OSMGeometryOptions): OSMGeometryResult {
  const { features, originLngLat, demBounds, sunDirection, zoom = 16 } = options;
  const isNearDetail = zoom >= 15.2;

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

  // 1. DEM 정규화 바운드 계산
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  if (demBounds && demBounds.length === 4) {
    [minLng, minLat, maxLng, maxLat] = demBounds;
  } else {
    for (const feat of features) {
      if (!feat.geometry) continue;
      const polys = feat.geometry.type === 'Polygon'
        ? [feat.geometry.coordinates]
        : feat.geometry.type === 'MultiPolygon'
        ? feat.geometry.coordinates
        : [];
      for (const poly of polys) {
        for (const ring of poly) {
          for (const pt of ring) {
            const [lng, lat] = pt;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
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

  // [2단계: 건물 벽면 실제 미터(m) 길이에 맞춘 왜곡 없는 UV 타일링 규격]
  // 가로 3.2m(1세대/1스팬), 세로 3.0m(1개 층) 단위
  const WINDOW_BAY_WIDTH = 3.2;
  const STORY_HEIGHT = 3.0;
  const PODIUM_MAX_HEIGHT = 3.8;
  const PARAPET_THICKNESS = 0.35; // 옥상 난간 실측 두께 0.35m
  const PARAPET_HEIGHT = 0.9;    // 옥상 난간 실측 돌출 높이 0.9m

  const maxLod2Count = options.maxLod2Count ?? 2500;
  let buildingCount = 0;

  // 2. 피처별 건물 지오메트리 직렬화 (카메라 중심 2,500동 완전한 LOD2 / 원거리 경량 LOD1 매스 모델)
  for (let featIdx = 0; featIdx < features.length; featIdx++) {
    const feat = features[featIdx];
    if (!feat.geometry) continue;

    const isLOD2 = featIdx < maxLod2Count;

    const props = feat.properties || {};
    const name = String(props.name || props.name_ko || props.buld_nm || props.buildingName || '');
    const usageType = String(
      props.usageType || props.bld_category || props.type || props.class || props.building || ''
    ).toLowerCase();

    const rawFlr = Number(
      props['building:levels'] || props.building_levels || props.levels || props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || 0
    );
    const rawHei = Number(
      props.height || props.render_height || props.hei || props.HEI || props.bld_hgt || 0
    );

    const explicitH = rawHei > 4.0 ? rawHei : (rawFlr >= 2 ? rawFlr * STORY_HEIGHT : 0);

    // 건물 폴리곤 좌표 파싱 및 기하학적 치수(폭, 길이, 정밀 Shoelace 면적, 둘레, 종횡비, 중심좌표) 계산
    let dimMin = 10, dimMax = 15, approxArea = 150, trueArea = 150, truePerimeter = 50, cLng = originLngLat[0], cLat = originLngLat[1];
    const firstPoly = feat.geometry.type === 'Polygon'
      ? (feat.geometry.coordinates[0] as [number, number][])
      : feat.geometry.type === 'MultiPolygon'
      ? (feat.geometry.coordinates[0]?.[0] as [number, number][])
      : null;

    if (firstPoly && firstPoly.length >= 3) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let sumLng = 0, sumLat = 0;
      for (const pt of firstPoly) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
        sumLng += pt[0];
        sumLat += pt[1];
      }
      cLng = sumLng / firstPoly.length;
      cLat = sumLat / firstPoly.length;
      const cosLat = Math.cos((cLat * Math.PI) / 180);
      const mPerLng = 111320 * cosLat;
      const mPerLat = 111320;
      const wMeters = (maxX - minX) * mPerLng;
      const hMeters = (maxY - minY) * mPerLat;
      dimMin = Math.max(1, Math.min(wMeters, hMeters));
      dimMax = Math.max(wMeters, hMeters);
      approxArea = Math.max(10, wMeters * hMeters * 0.85);

      // [핵심] 신발끈 공식(Shoelace formula) 기반 100% 회전 불변 정밀 바닥 면적(m²) 및 둘레(m) 산출
      let areaSum = 0;
      let pSum = 0;
      const nPts = firstPoly.length;
      for (let i = 0; i < nPts; i++) {
        const j = (i + 1) % nPts;
        const x1 = (firstPoly[i][0] - cLng) * mPerLng;
        const y1 = (firstPoly[i][1] - cLat) * mPerLat;
        const x2 = (firstPoly[j][0] - cLng) * mPerLng;
        const y2 = (firstPoly[j][1] - cLat) * mPerLat;
        areaSum += x1 * y2 - x2 * y1;
        pSum += Math.hypot(x2 - x1, y2 - y1);
      }
      trueArea = Math.max(10, Math.abs(areaSum) * 0.5);
      truePerimeter = Math.max(10, pSum);
    }

    // [요구사항 2] 바닥 면적이 4,500㎡를 초과하는 거대 구역 폴리곤(학교 부지, 아파트 단지 외곽, 군부대 경계 등) 및 비건물 3D 압출 즉시 제외
    const isNonBuildingTag =
      props.is_non_building === true ||
      props.is_site_boundary === true ||
      Boolean(props.UQ111 || props.UQ111_NM || props.uq111 || props.zoneName || props.zone_nm || props.spfc_nm || props.spfc_cd) ||
      Boolean(props.landuse || props.leisure || props.boundary || props.admin_level || props.natural) ||
      (Boolean(props.pnu || props.jimok || props.jibun) &&
        !props.bd_mgt_sn &&
        !props.buld_nm &&
        !props.bldNm &&
        !props.buildingName &&
        !props.grnd_flr &&
        !props.gro_flo_co &&
        !props.grndFlrCnt &&
        !props.hei &&
        !props.heit &&
        !props.height);

    if (isNonBuildingTag || trueArea > 4500) {
      continue;
    }

    const aspectRatio = dimMax / Math.max(1, dimMin);
    const pToAreaRatio = truePerimeter / Math.sqrt(trueArea);

    const metricsInput = { cLng, cLat, dimMin, dimMax, approxArea: trueArea, aspectRatio };
    const regStyle = classifyRegionalBuildingStyle(props, metricsInput);

    // (a) 군부대 주둔지 판정 (1군지사 우산동, 캠프 롱 태장동, 접경 군부대)
    const isWonjuMilitarySite =
      (cLat >= 37.355 && cLat <= 37.375 && cLng >= 127.930 && cLng <= 127.948) || // 1군지사(우산동)
      (cLat >= 37.370 && cLat <= 37.390 && cLng >= 127.945 && cLng <= 127.965);   // 캠프 롱(태장동)
    const isBorderMilitaryZone = cLat >= 38.0; // 철원·화천·양구·인제 등 접경 군부대
    const isMilitaryName =
      name.includes('부대') || name.includes('군') || name.includes('막사') ||
      name.includes('병영') || name.includes('창고') || name.includes('보급') ||
      name.includes('사령부') || usageType.includes('military') || usageType.includes('barracks');

    const isMilitary = isMilitaryName || (isWonjuMilitarySite && dimMin <= 22 && dimMax >= 18) || (isBorderMilitaryZone && isMilitaryName) || props.isMilitaryOrPublic === true;

    // (b) 대형 경기장/체육시설/종합운동장 판정 (커튼월 유리 반사감 및 트러스 지붕 메쉬)
    const isStadiumOrArena =
      name.includes('경기장') || name.includes('체육관') || name.includes('종합운동장') ||
      name.includes('스타디움') || name.includes('아레나') || name.includes('stadium') ||
      name.includes('arena') || usageType.includes('stadium') ||
      (trueArea >= 1200 && !name.includes('아파트') && !name.includes('apt') && aspectRatio <= 2.2);

    // (c) 고층 랜드마크 타워
    const isHighriseLandmark =
      !isStadiumOrArena &&
      (name.includes('타워') || name.includes('tower') || (trueArea >= 800 && explicitH >= 35.0));

    // (d) 아파트 명칭 및 기하 형태(면적/둘레비) 매칭
    const isAptByName =
      name.includes('아파트') || name.includes('apt') || name.includes('단지') ||
      name.includes('푸르지오') || name.includes('자이') || name.includes('힐스테이트') ||
      name.includes('래미안') || name.includes('e편한') || name.includes('더샵') ||
      name.includes('아이파크') || name.includes('롯데캐슬') || name.includes('한신') ||
      name.includes('삼호') || name.includes('두산') || name.includes('우성') ||
      name.includes('현대') || name.includes('동보') || name.includes('세경') ||
      name.includes('코아루') || name.includes('부영') || name.includes('주공') ||
      name.includes('호반') || name.includes('중흥') || name.includes('센트럴') ||
      usageType.includes('apartment') || props.bld_category === 'apartment';

    // 한국형 판상형/타워형 아파트 단지: 바닥 면적 260m² 이상 직사각형 또는 350m² 이상 대형 매스
    const isAptByGeometry =
      !isMilitary && !isStadiumOrArena &&
      ((trueArea >= 260 && (aspectRatio >= 1.4 || pToAreaRatio >= 4.2)) ||
       (trueArea >= 350));

    const isApt = isAptByName || isAptByGeometry;

    // (e) 대로변 및 상업구역 중형 건물(상가/오피스) 매칭
    const isCommByName =
      name.includes('빌딩') || name.includes('상가') || name.includes('프라자') ||
      name.includes('마트') || name.includes('병원') || name.includes('은행') ||
      name.includes('센터') || name.includes('오피스') || usageType.includes('commercial') ||
      usageType.includes('retail') || usageType.includes('office') || props.bld_category === 'commercial';

    const isCommByGeometry =
      !isMilitary && !isApt && !isStadiumOrArena &&
      ((trueArea >= 140 && trueArea < 650 && aspectRatio < 2.4) || (trueArea >= 180));

    const isComm = isCommByName || isCommByGeometry;

    const buildingSeed = Math.abs(Math.sin(cLng * 127.13 + cLat * 311.71 + trueArea * 0.057)) % 1.0;
    const seedRoof = Math.abs(Math.sin(cLng * 997.13 + cLat * 533.77 + trueArea * 0.19)) % 1.0;
    const seedGeom = Math.abs(Math.sin(cLng * 43.19 + seedRoof * 11.7 + trueArea * 0.031)) % 1.0;

    // -------------------------------------------------------------------------
    // [1단계: 납작한 회색 판(1~2m) 완전 제거 -> 실측 층수·높이 100% 입체화]
    // height/render_height/building:levels 부재 또는 4m 미만 시 바닥 면적(Area)과 둘레비로 자동 산출
    // -------------------------------------------------------------------------
    let totalH = explicitH;
    let floors = rawFlr;
    let bldType = 0.0; // 0=주택/빌라, 1=상업/오피스, 2=아파트, 4=특수(경기장/랜드마크)

    if (!totalH || totalH <= 4.0) {
      if (isStadiumOrArena) {
        // 대형 경기장/체육시설: 24m ~ 34m
        totalH = 26.0 + buildingSeed * 8.0;
        floors = 4;
        bldType = 4.0;
      } else if (isHighriseLandmark) {
        // 고층 랜드마크 타워: 65m ~ 110m (20~35층)
        totalH = 65.0 + buildingSeed * 45.0;
        floors = Math.round(totalH / 3.5);
        bldType = 1.0;
      } else if (isMilitary) {
        // 군부대 막사/창고: 7m ~ 10.5m
        const milStories = trueArea < 200 ? 2 : Math.round(2 + buildingSeed * 1.5);
        totalH = milStories * 3.5;
        floors = milStories;
        bldType = 3.0;
      } else if (isApt) {
        // 단지형 중대형 직사각형 건물(아파트 단지): 45m ~ 75m (15층 ~ 25층)
        const aptStories = Math.round(15 + buildingSeed * 10); // 15~25층
        totalH = aptStories * 3.0; // 45.0m ~ 75.0m
        floors = aptStories;
        bldType = 2.0;
      } else if (isComm) {
        // 대로변 및 상업구역 중형 건물(상가/오피스): 14m ~ 28m (4층 ~ 8층)
        const commStories = Math.round(4 + buildingSeed * 4); // 4~8층
        totalH = commStories * 3.5; // 14.0m ~ 28.0m
        floors = commStories;
        bldType = 1.0;
      } else {
        // 일반 주택가 밀집 건물(다세대/빌라/주택): 7m ~ 13m (2층 ~ 4층, 빽빽한 2~4층 입체 시가지)
        if (trueArea <= 110) {
          const houseStories = buildingSeed > 0.45 ? 3 : 2; // 2~3층
          totalH = 7.0 + buildingSeed * 2.5; // 7.0m ~ 9.5m
          floors = houseStories;
        } else {
          const villaStories = buildingSeed > 0.5 ? 4 : 3; // 3~4층
          totalH = 9.5 + buildingSeed * 3.5; // 9.5m ~ 13.0m
          floors = villaStories;
        }
        bldType = 0.0;
      }
    } else {
      // 명시적 높이가 4m 초과인 경우
      if (isApt || totalH >= 40.0) bldType = 2.0;
      else if (isComm || totalH >= 14.0) bldType = 1.0;
      else bldType = 0.0;
      floors = rawFlr > 0 ? rawFlr : Math.max(2, Math.round(totalH / 3.2));
    }

    // 절대 7.0m 미만으로 납작해지지 않도록 하한 클램프
    totalH = Math.max(7.0, Math.min(250.0, totalH));

    // -------------------------------------------------------------------------
    // [2단계: 저층·중층 시가지 포토 파사드 & 복합 옥상 텍스처/지오메트리 분기]
    // - 노후 콘크리트(#78716c), 적벽돌(#6b2d1f), 베이지 화강석(#a8a29e)
    // - 옥상 안쪽: 초록 우레탄(#2d5a43), 노후 시멘트 그레이(#57534e), 짙은 방수재(#334155)
    // - 저층 건물 중 약 30%는 백색 처마 + 적갈색(#6b2d1f)/청색(#1e3a8a) 기와 경사 박공지붕(ㅅ자)
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // [벤더링 6대 분류기 적용] 좌표 시드 및 면적·형상 기반 절대 실패 없는 한국형 실측 분류
    // -------------------------------------------------------------------------
    const classified = firstPoly && firstPoly.length >= 3 ? classifyBuildingWithVendor(firstPoly, props) : null;

    let defaultWallSlotId = 0.0;
    let wallR = 0.953, wallG = 0.937, wallB = 0.902; // 크림 아이보리 #f3efe6
    let roofR = 0.549, roofG = 0.533, roofB = 0.506; // 밝은 콘크리트 #8c8881
    let roofSlotId = 14.0;
    const parapetSlotId = 21.0;

    if (classified) {
      wallR = classified.wallColorRgb[0];
      wallG = classified.wallColorRgb[1];
      wallB = classified.wallColorRgb[2];
      roofR = classified.roofColorRgb[0];
      roofG = classified.roofColorRgb[1];
      roofB = classified.roofColorRgb[2];

      if (!explicitH || explicitH <= 4.0) {
        totalH = classified.height;
        floors = classified.floors;
      }
    }

    if (bldType === 2.0 || isApt) {
      const aptVariant = Math.floor(buildingSeed * 3.0);
      defaultWallSlotId = aptVariant === 0 ? 0.0 : aptVariant === 1 ? 1.0 : 2.0;
    } else if (bldType === 1.0 || isComm) {
      if (buildingSeed < 0.40) defaultWallSlotId = 5.0; // comm_granite_beige
      else if (buildingSeed < 0.70) defaultWallSlotId = 8.0; // comm_curtainwall
      else defaultWallSlotId = 6.0; // comm_dark_metal
    } else if (isStadiumOrArena || isHighriseLandmark) {
      defaultWallSlotId = 8.0; // 커튼월 유리
    } else {
      if (buildingSeed < 0.40) defaultWallSlotId = 10.0; // villa_red_brick
      else if (buildingSeed < 0.70) defaultWallSlotId = 11.0; // villa_granite
      else defaultWallSlotId = 12.0; // house_cream
    }

    // [지붕 형태 분기]: 저층 주택/군 막사 박공지붕
    const isLowRiseGable = classified ? classified.isGabledRoof : (totalH <= 13.5 && !isApt && !isComm && seedRoof < 0.30);
    let hasPitchedRoof = isLowRiseGable || isStadiumOrArena;
    let hasGabledRoof = isLowRiseGable;
    let hasHippedRoof = isStadiumOrArena;

    if (classified) {
      if (classified.type === 'apartment') roofSlotId = 14.0;
      else if (classified.type === 'industrial') roofSlotId = seedRoof < 0.5 ? 18.0 : 17.0;
      else if (classified.type === 'commercial') roofSlotId = seedRoof < 0.5 ? 17.0 : 14.0;
      else if (classified.type === 'residential') roofSlotId = seedRoof < 0.35 ? 16.0 : seedRoof < 0.65 ? 17.0 : 15.0;
      else if (classified.type === 'military') roofSlotId = seedRoof < 0.5 ? 16.0 : 18.0;
    }

    // [위성 픽셀 실시간 샘플링 지붕 색상 오버라이드]
    const featId = feat.id ?? props.id ?? props.buld_id ?? buildingCount;
    const sampledRoof = options.satelliteRoofColors?.[featId];
    if (sampledRoof && sampledRoof.isSampled && !hasPitchedRoof) {
      roofR = sampledRoof.r;
      roofG = sampledRoof.g;
      roofB = sampledRoof.b;
      roofSlotId = sampledRoof.matchedSlotId;
    }

    // 기단부(Podium) 색상 및 높이 (1층 기단부: 짙은 화강석/필로티 석재 마감)
    const podiumR = 0.28, podiumG = 0.32, podiumB = 0.38;
    const podiumH = Math.min(PODIUM_MAX_HEIGHT, totalH);
    const isKoreanAptHighrise = isApt && (totalH >= 24.0 || floors >= 7);

    // 태양광 그림자 오프셋
    const dropScale = Math.min(2.5, 1.0 / sY);
    const dropLength = totalH * dropScale;
    const dropDx = -sX * dropLength;
    const dropDz = -sZ * dropLength;

    const polys = feat.geometry.type === 'Polygon'
      ? [feat.geometry.coordinates]
      : feat.geometry.type === 'MultiPolygon'
      ? feat.geometry.coordinates
      : [];

    for (const poly of polys) {
      if (!poly || poly.length === 0) continue;

      // 1) 외곽 링 및 내부 홀(중정) 파싱
      const rawOuterRing = cleanRingCoords(poly[0] as [number, number][]);
      if (rawOuterRing.length < 3) continue;

      const outerPts: Point2D[] = rawOuterRing.map(([lng, lat]) => projectPointToMeters(lng, lat, originLngLat));
      if (signedArea(outerPts) < 0) {
        outerPts.reverse();
        rawOuterRing.reverse();
      }

      const holesPts: Point2D[][] = [];
      const rawHolesRings: [number, number][][] = [];

      for (let h = 1; h < poly.length; h++) {
        const rawHole = cleanRingCoords(poly[h] as [number, number][]);
        if (rawHole.length < 3) continue;
        const hPts: Point2D[] = rawHole.map(([lng, lat]) => projectPointToMeters(lng, lat, originLngLat));
        if (signedArea(hPts) > 0) {
          hPts.reverse();
          rawHole.reverse();
        }
        holesPts.push(hPts);
        rawHolesRings.push(rawHole);
      }

      // 최장 벽면 길이 산출 (측벽 코어 및 아파트 주진입면 판정용)
      let maxEdgeLen = 0;
      let maxEdgeIdx = 0;
      for (let i = 0; i < outerPts.length; i++) {
        const next = (i + 1) % outerPts.length;
        const edx = outerPts[next].x - outerPts[i].x;
        const edy = outerPts[next].y - outerPts[i].y;
        const elen = Math.sqrt(edx * edx + edy * edy);
        if (elen > maxEdgeLen) {
          maxEdgeLen = elen;
          maxEdgeIdx = i;
        }
      }

      // -----------------------------------------------------------------------
      // [1. 건물 용도별 다단 스텝(Multi-Step Setback) 입체 지오메트리 판정]
      // - 중·대형 상업/업무 빌딩 (높이 20m 이상, 면적 600㎡ 이상):
      //   1~3층(0m ~ 11m): 원래 건물 바닥 폴리곤(100% 면적)으로 넓은 상가·로비 포디움(Podium) 기단부 생성 및 옥상 테라스 마감.
      //   4층~최상층(11m ~ H): 폴리곤을 안쪽으로 15~20% 축소(Inset 2.5m)하여 본동 타워가 기단부 위로 솟아오름.
      // -----------------------------------------------------------------------
      const hasCommercialSetback = isLOD2 && (regStyle.hasCommercialSetback || (totalH >= 20.0 && approxArea >= 600));
      const PODIUM_SETBACK_HEIGHT = 11.0;
      const effectivePodiumH = hasCommercialSetback ? PODIUM_SETBACK_HEIGHT : podiumH;
      const insetTowerPts = hasCommercialSetback ? computePolygonInset(outerPts, 2.5) : outerPts;
      const roofTargetPts = hasCommercialSetback ? insetTowerPts : outerPts;

      // -----------------------------------------------------------------------
      // [1-A. 외벽 압출 파이프라인]
      // -----------------------------------------------------------------------
      const allRings = [{ pts: outerPts, raw: rawOuterRing, isHole: false }].concat(
        holesPts.map((hPts, idx) => ({ pts: hPts, raw: rawHolesRings[idx], isHole: true }))
      );

      for (const ringData of allRings) {
        const rPts = ringData.pts;
        const rRaw = ringData.raw;
        const isHole = ringData.isHole;
        const rLen = rPts.length;

        let cumLength = 0;

        for (let i = 0; i < rLen; i++) {
          const nextIdx = (i + 1) % rLen;
          const p1 = rPts[i];
          const p2 = rPts[nextIdx];
          const c1 = rRaw[i];
          const c2 = rRaw[nextIdx];

          const edgeDx = p2.x - p1.x;
          const edgeDy = p2.y - p1.y;
          const segLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          if (segLen < 0.05) continue;

          let nx = edgeDy / segLen;
          let nz = -edgeDx / segLen;
          if (isHole) {
            nx = -nx;
            nz = -nz;
          }

          let partType = 0.0;
          let isSideWall = false;
          // [한국형 아파트 좁은 측벽 자동 판별]: edgeLength < 15m 또는 단축 비율 조건
          if (!isHole && (regStyle.bldType === 2.0 || regStyle.sideWallStripe || isApt) && (floors >= 4.0 || totalH >= 12.0) && maxEdgeLen >= 15.0) {
            if (segLen < 15.0 || segLen <= maxEdgeLen * 0.45) {
              partType = 3.0; // 3=측벽 수직 코어
              isSideWall = true;
            }
          }

          let currentWallSlot = ((regStyle.bldType === 2.0 || regStyle.sideWallStripe || isApt) && isSideWall) ? 4.0 : defaultWallSlotId; // 4=apt_side

          // [한국형 아파트 전면(베란다) vs 배면(계단실/복도/보일러연통) 분기]
          if (!isHole && !isSideWall && (regStyle.bldType === 2.0 || isApt)) {
            // Outward normal in map meter space: (-nz) points North/South
            // 북향(-nz < -0.10)은 배면 계단실/복도식 타일 (Slot 2: apt_rear_stairwell)
            // 남향(-nz >= -0.10)은 전면 발코니 창호 타일 (0, 1, 3)
            if (-nz < -0.10) {
              currentWallSlot = 2.0; // 2=apt_rear_stairwell
            }
          }

          // [1층 기단부 0m ~ 4m 슬롯 분기]:
          // - 아파트: slot 22 (apt_pilotis_lobby: 짙은 화강석 석재 마감 + 공동현관 캐노피 포치 & 자동문)
          // - 상업/오피스: slot 9 (comm_ground_shop: 1층 쇼윈도 + 정돈된 한국형 가로 간판 블록)
          const currentPodiumSlot = regStyle.podiumWallSlotId ||
            (isApt || bldType === 2.0 ? 22.0 : (bldType === 1.0 ? 9.0 : 21.0));

          const dem0 = { u: (c1[0] - minLng) / rangeLng, v: (c1[1] - minLat) / rangeLat };
          const dem1 = { u: (c2[0] - minLng) / rangeLng, v: (c2[1] - minLat) / rangeLat };

          let u0 = cumLength / WINDOW_BAY_WIDTH;
          let u1 = (cumLength + segLen) / WINDOW_BAY_WIDTH;
          if (isSideWall) {
            u0 = 0.0;
            u1 = 1.0;
          }

          // (a-0) 경사지 건물 들뜸 방지 지하 기초 옹벽 (Foundation Skirt)
          // 태백·평창·정선·영월·횡성 산악 고원권은 급경사 지형에 맞춰 -8.0m 연장!
          const SKIRT_DEPTH = regStyle.skirtDepth || -5.0;
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: SKIRT_DEPTH, z: -p1.y },
            { x: p2.x, y: SKIRT_DEPTH, z: -p2.y },
            { x: p2.x, y: 0, z: -p2.y },
            { x: p1.x, y: 0, z: -p1.y },
            nx, 0, -nz,
            { u: u0, v: 0.0 },
            { u: u1, v: 0.0 },
            { u: u1, v: 1.0 },
            { u: u0, v: 1.0 },
            bldType,
            floors,
            4.0, // partType: 4=기단부/기초
            21.0, // slotId: 21=콘크리트 옹벽
            dem0, dem1,
            0.28, 0.33, 0.41 // 콘크리트 화강석 기초 기단부 (#475569)
          );

          // (a) 저층 기단부/포디움 외벽 (0 ~ effectivePodiumH)
          const vBase0 = 0.0;
          const vPodiumTop = effectivePodiumH / STORY_HEIGHT;
          const curPodiumR = podiumR;
          const curPodiumG = podiumG;
          const curPodiumB = podiumB;

          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: 0, z: -p1.y },
            { x: p2.x, y: 0, z: -p2.y },
            { x: p2.x, y: effectivePodiumH, z: -p2.y },
            { x: p1.x, y: effectivePodiumH, z: -p1.y },
            nx, 0, -nz,
            { u: u0, v: vBase0 },
            { u: u1, v: vBase0 },
            { u: u1, v: vPodiumTop },
            { u: u0, v: vPodiumTop },
            bldType,
            floors,
            4.0, // partType: 4=기단부
            currentPodiumSlot,
            dem0, dem1,
            curPodiumR, curPodiumG, curPodiumB
          );

          // 상업 빌딩 세트백이 아닐 경우 원래 링으로 본동 외벽 계속 압출
          if (!hasCommercialSetback) {
            const corniceH = 0.4;
            if (totalH > effectivePodiumH + corniceH) {
              const wallH = totalH - corniceH;
              const vWallTop = wallH / STORY_HEIGHT;
              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                { x: p1.x, y: effectivePodiumH, z: -p1.y },
                { x: p2.x, y: effectivePodiumH, z: -p2.y },
                { x: p2.x, y: wallH, z: -p2.y },
                { x: p1.x, y: wallH, z: -p1.y },
                nx, 0, -nz,
                { u: u0, v: vPodiumTop },
                { u: u1, v: vPodiumTop },
                { u: u1, v: vWallTop },
                { u: u0, v: vWallTop },
                bldType,
                floors,
                partType,
                currentWallSlot,
                dem0, dem1,
                wallR, wallG, wallB
              );

              // 최상층 0.4m 두겁석 (Cornice 띠)
              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                { x: p1.x, y: wallH, z: -p1.y },
                { x: p2.x, y: wallH, z: -p2.y },
                { x: p2.x, y: totalH, z: -p2.y },
                { x: p1.x, y: totalH, z: -p1.y },
                nx, 0, -nz,
                { u: 0, v: 0 },
                { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
                { u: segLen / WINDOW_BAY_WIDTH, v: 1.0 },
                { u: 0, v: 1.0 },
                bldType,
                floors,
                2.0, // partType: 2.0 (두겁석/난간)
                21.0, // 21=parapet_concrete
                dem0, dem1,
                0.92, 0.94, 0.96 // 밝은 콘크리트 #e2e8f0 ~ #f1f5f9
              );
            } else if (totalH > effectivePodiumH) {
              const vWallTop = totalH / STORY_HEIGHT;
              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                { x: p1.x, y: effectivePodiumH, z: -p1.y },
                { x: p2.x, y: effectivePodiumH, z: -p2.y },
                { x: p2.x, y: totalH, z: -p2.y },
                { x: p1.x, y: totalH, z: -p1.y },
                nx, 0, -nz,
                { u: u0, v: vPodiumTop },
                { u: u1, v: vPodiumTop },
                { u: u1, v: vWallTop },
                { u: u0, v: vWallTop },
                bldType,
                floors,
                partType,
                currentWallSlot,
                dem0, dem1,
                wallR, wallG, wallB
              );
            }
          }

          // 외곽 링에 대해 1.5m 접지 음영(Contact AO) 및 태양광 투영 그림자 생성 (LOD2 중심 건물 한정)
          if (!isHole && isLOD2) {
            // [접지 음영(Contact AO): 건물 하단 0.85m 밀착 림으로 지면 안착감 부여]
            const aoWidth = 0.85;
            addShadowQuad(
              shadowPositions, shadowColors,
              { x: p1.x, y: 0.02, z: -p1.y, a: 0.35 },
              { x: p2.x, y: 0.02, z: -p2.y, a: 0.35 },
              { x: p2.x + nx * aoWidth, y: 0.015, z: -(p2.y - nz * aoWidth), a: 0.0 },
              { x: p1.x + nx * aoWidth, y: 0.015, z: -(p1.y - nz * aoWidth), a: 0.0 },
              0.035, 0.050, 0.080
            );

            if (isNearDetail) {
              addShadowQuad(
                shadowPositions, shadowColors,
                { x: p1.x, y: 0.025, z: -p1.y, a: 0.28 },
                { x: p2.x, y: 0.025, z: -p2.y, a: 0.28 },
                { x: p2.x + nx * 0.45, y: 0.022, z: -(p2.y - nz * 0.45), a: 0.0 },
                { x: p1.x + nx * 0.45, y: 0.022, z: -(p1.y - nz * 0.45), a: 0.0 },
                0.020, 0.030, 0.055
              );
            }

            // [태양광 방향 일치 평면 투영 그림자 (Planar Shadow)]
            const nDotL = nx * sX + (-nz) * sZ;
            if (nDotL < 0.20 && totalH >= 3.0) {
              addShadowQuad(
                shadowPositions, shadowColors,
                { x: p1.x, y: 0.02, z: -p1.y, a: 0.35 },
                { x: p2.x, y: 0.02, z: -p2.y, a: 0.35 },
                { x: p2.x + dropDx, y: 0.015, z: -p2.y + dropDz, a: 0.35 },
                { x: p1.x + dropDx, y: 0.015, z: -p1.y + dropDz, a: 0.35 },
                0.035, 0.050, 0.080
              );
            }
          }

          cumLength += segLen;
        }
      }

      // -----------------------------------------------------------------------
      // [1-B. 상업 빌딩 세트백(Setback) 본동 타워(11m ~ H) 및 포디움 테라스 슬래브]
      // -----------------------------------------------------------------------
      if (hasCommercialSetback) {
        const inLen = insetTowerPts.length;

        // 1) 11.0m 포디움 옥상 테라스 난간 (높이 0.8m)
        const oLen = outerPts.length;
        for (let i = 0; i < oLen; i++) {
          const nextIdx = (i + 1) % oLen;
          const p1 = outerPts[i];
          const p2 = outerPts[nextIdx];
          const edgeDx = p2.x - p1.x;
          const edgeDy = p2.y - p1.y;
          const segLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          if (segLen < 0.1) continue;
          const outNx = edgeDy / segLen;
          const outNz = -edgeDx / segLen;

          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: PODIUM_SETBACK_HEIGHT, z: -p1.y },
            { x: p2.x, y: PODIUM_SETBACK_HEIGHT, z: -p2.y },
            { x: p2.x, y: PODIUM_SETBACK_HEIGHT + 0.8, z: -p2.y },
            { x: p1.x, y: PODIUM_SETBACK_HEIGHT + 0.8, z: -p1.y },
            outNx, 0, -outNz,
            { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
            { u: segLen / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
            bldType, floors, 2.0, 21.0,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            0.88, 0.90, 0.94
          );
        }

        // 2) 11.0m 포디움과 인셋 타워 사이의 옥상 테라스 슬래브 쿼드 연결
        for (let i = 0; i < oLen; i++) {
          const nextIdx = (i + 1) % oLen;
          const p1 = outerPts[i];
          const p2 = outerPts[nextIdx];
          const ip1 = insetTowerPts[i % inLen];
          const ip2 = insetTowerPts[nextIdx % inLen];

          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: PODIUM_SETBACK_HEIGHT + 0.05, z: -p1.y },
            { x: p2.x, y: PODIUM_SETBACK_HEIGHT + 0.05, z: -p2.y },
            { x: ip2.x, y: PODIUM_SETBACK_HEIGHT + 0.05, z: -ip2.y },
            { x: ip1.x, y: PODIUM_SETBACK_HEIGHT + 0.05, z: -ip1.y },
            0, 1, 0,
            { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 1.0, roofSlotId,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            roofR, roofG, roofB
          );
        }

        // 3) 4층~최상층 축소된 본동 타워 외벽 (11.0m ~ H)
        let towerCumLen = 0;
        const towerWallH = totalH - 0.4;
        for (let i = 0; i < inLen; i++) {
          const nextIdx = (i + 1) % inLen;
          const p1 = insetTowerPts[i];
          const p2 = insetTowerPts[nextIdx];
          const edgeDx = p2.x - p1.x;
          const edgeDy = p2.y - p1.y;
          const segLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          if (segLen < 0.05) continue;
          const outNx = edgeDy / segLen;
          const outNz = -edgeDx / segLen;

          const u0 = towerCumLen / WINDOW_BAY_WIDTH;
          const u1 = (towerCumLen + segLen) / WINDOW_BAY_WIDTH;
          const v0 = PODIUM_SETBACK_HEIGHT / STORY_HEIGHT;
          const v1 = towerWallH / STORY_HEIGHT;

          // 본동 타워 외벽
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: PODIUM_SETBACK_HEIGHT, z: -p1.y },
            { x: p2.x, y: PODIUM_SETBACK_HEIGHT, z: -p2.y },
            { x: p2.x, y: towerWallH, z: -p2.y },
            { x: p1.x, y: towerWallH, z: -p1.y },
            outNx, 0, -outNz,
            { u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 },
            bldType, floors, 0.0, defaultWallSlotId,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            wallR, wallG, wallB
          );

          // 본동 타워 최상층 0.4m 두겁석
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: towerWallH, z: -p1.y },
            { x: p2.x, y: towerWallH, z: -p2.y },
            { x: p2.x, y: totalH, z: -p2.y },
            { x: p1.x, y: totalH, z: -p1.y },
            outNx, 0, -outNz,
            { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
            { u: segLen / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
            bldType, floors, 2.0, 21.0,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            0.92, 0.94, 0.96
          );

          towerCumLen += segLen;
        }
      }

      // -----------------------------------------------------------------------
      // [1-C. 한국형 아파트 1층 공동현관 캐노피 포치(돌출 포치)]
      // (높이 30m 이상 아파트 전면 중앙 하단에 폭 3.8m, 돌출 2.0m, 높이 3.2m 포치 결합)
      // -----------------------------------------------------------------------
      if (isLOD2 && isApt && totalH >= 30.0 && maxEdgeLen >= 14.0) {
        const pA = outerPts[maxEdgeIdx];
        const pB = outerPts[(maxEdgeIdx + 1) % outerPts.length];
        const eDx = pB.x - pA.x;
        const eDy = pB.y - pA.y;
        const eLen = Math.hypot(eDx, eDy);
        if (eLen >= 12.0) {
          const fwdNx = eDy / eLen;
          const fwdNz = -eDx / eLen;
          const midX = (pA.x + pB.x) * 0.5;
          const midY = (pA.y + pB.y) * 0.5;
          const tanX = eDx / eLen;
          const tanY = eDy / eLen;
          const porchHalfW = 1.9;
          const porchDepth = 2.0;
          const porchH = 3.2;

          const poBL = { x: midX - tanX * porchHalfW, y: midY - tanY * porchHalfW };
          const poBR = { x: midX + tanX * porchHalfW, y: midY + tanY * porchHalfW };
          const poTR = { x: poBR.x + fwdNx * porchDepth, y: poBR.y + fwdNz * porchDepth };
          const poTL = { x: poBL.x + fwdNx * porchDepth, y: poBL.y + fwdNz * porchDepth };

          // 1) 포치 상판 캐노피 슬래브 (y: 3.2m ~ 3.35m)
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: poBL.x, y: 3.35, z: -poBL.y },
            { x: poBR.x, y: 3.35, z: -poBR.y },
            { x: poTR.x, y: 3.35, z: -poTR.y },
            { x: poTL.x, y: 3.35, z: -poTL.y },
            0, 1, 0,
            { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 4.0, 21.0,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            0.82, 0.85, 0.88
          );

          // 2) 포치 전면 벽면 / 자동문 출입구 (y: 0m ~ 3.2m)
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: poTL.x, y: 0, z: -poTL.y },
            { x: poTR.x, y: 0, z: -poTR.y },
            { x: poTR.x, y: porchH, z: -poTR.y },
            { x: poTL.x, y: porchH, z: -poTL.y },
            fwdNx, 0, -fwdNz,
            { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 4.0, 23.0,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            0.18, 0.22, 0.28
          );

          // 3) 포치 좌측면 (y: 0m ~ 3.2m)
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: poBL.x, y: 0, z: -poBL.y },
            { x: poTL.x, y: 0, z: -poTL.y },
            { x: poTL.x, y: porchH, z: -poTL.y },
            { x: poBL.x, y: porchH, z: -poBL.y },
            -tanX, 0, tanY,
            { u: 0, v: 0 }, { u: 0.6, v: 0 }, { u: 0.6, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 4.0, 23.0,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            0.22, 0.25, 0.30
          );

          // 4) 포치 우측면 (y: 0m ~ 3.2m)
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: poTR.x, y: 0, z: -poTR.y },
            { x: poBR.x, y: 0, z: -poBR.y },
            { x: poBR.x, y: porchH, z: -poBR.y },
            { x: poTR.x, y: porchH, z: -poTR.y },
            tanX, 0, -tanY,
            { u: 0, v: 0 }, { u: 0.6, v: 0 }, { u: 0.6, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 4.0, 23.0,
            { u: 0, v: 0 }, { u: 1, v: 1 },
            0.22, 0.25, 0.30
          );
        }
      }

      // Bounding box for roof geometries (상업 빌딩 세트백 시 축소 타워 단면 기준)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of roofTargetPts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const bW = maxX - minX;
      const bD = maxY - minY;
      const demMid = { u: (rawOuterRing[0][0] - minLng) / rangeLng, v: (rawOuterRing[0][1] - minLat) / rangeLat };

      // -----------------------------------------------------------------------
      // [2. 평지붕(Flat Roof) 분기: 난간(Parapet) / 경사형 지붕 캡 + 옥상 슬래브 + 엘리베이터/계단실 코어]
      // -----------------------------------------------------------------------
      if (!hasPitchedRoof) {
        const isKoreanAptHighrise = isApt && (totalH >= 24.0 || floors >= 7);
        const oLen = roofTargetPts.length;

        // (a) 가변 옥상 난간 (Parapet) / 한국형 아파트 경사 파라펫 캡 (Mansard Cap) - LOD2 상세 건물 한정
        if (isLOD2) {
          if (isKoreanAptHighrise) {
          // 한국 아파트 특유의 경사형 지붕 캡 (장식용 경사 파라펫 구조물):
          // 높이 1.8m, 상단 1.2m 안쪽으로 꺾여 올라가는 다크 슬레이트 파라펫 캡
          const CAP_H = 1.8;
          const CAP_INSET = 1.2;
          const capTopY = totalH + CAP_H;

          for (let i = 0; i < oLen; i++) {
            const nextIdx = (i + 1) % oLen;
            const p1 = roofTargetPts[i];
            const p2 = roofTargetPts[nextIdx];
            const c1 = rawOuterRing[i % rawOuterRing.length];
            const c2 = rawOuterRing[nextIdx % rawOuterRing.length];

            const edgeDx = p2.x - p1.x;
            const edgeDy = p2.y - p1.y;
            const segLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
            if (segLen < 0.1) continue;

            const outNx = edgeDy / segLen;
            const outNz = -edgeDx / segLen;
            const inNx = -outNx;
            const inNz = -outNz;

            const p1Top = { x: p1.x + inNx * CAP_INSET, y: p1.y + inNz * CAP_INSET };
            const p2Top = { x: p2.x + inNx * CAP_INSET, y: p2.y + inNz * CAP_INSET };
            const p1In = { x: p1Top.x + inNx * 0.25, y: p1Top.y + inNz * 0.25 };
            const p2In = { x: p2Top.x + inNx * 0.25, y: p2Top.y + inNz * 0.25 };

            const dem0 = { u: (c1[0] - minLng) / rangeLng, v: (c1[1] - minLat) / rangeLat };
            const dem1 = { u: (c2[0] - minLng) / rangeLng, v: (c2[1] - minLat) / rangeLat };

            // 1) 경사 파라펫 외벽면 (Mansard Sloped Surface)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1.x, y: totalH, z: -p1.y },
              { x: p2.x, y: totalH, z: -p2.y },
              { x: p2Top.x, y: capTopY, z: -p2Top.y },
              { x: p1Top.x, y: capTopY, z: -p1Top.y },
              outNx * 0.707, 0.707, -outNz * 0.707,
              { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
              { u: segLen / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
              bldType, floors, 6.0, 22.0, // 22=parapet_dark
              dem0, dem1,
              0.22, 0.26, 0.32
            );

            // 2) 캡 상단 두겁석
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1Top.x, y: capTopY, z: -p1Top.y },
              { x: p1In.x, y: capTopY, z: -p1In.y },
              { x: p2In.x, y: capTopY, z: -p2In.y },
              { x: p2Top.x, y: capTopY, z: -p2Top.y },
              0, 1, 0,
              { u: 0, v: 0 }, { u: 0, v: 0.25 },
              { u: segLen, v: 0.25 }, { u: segLen, v: 0 },
              bldType, floors, 2.0, 22.0,
              dem0, dem1,
              0.18, 0.22, 0.28
            );

            // 3) 캡 내측 수직 벽면
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p2In.x, y: totalH, z: -p2In.y },
              { x: p1In.x, y: totalH, z: -p1In.y },
              { x: p1In.x, y: capTopY, z: -p1In.y },
              { x: p2In.x, y: capTopY, z: -p2In.y },
              inNx, 0, -inNz,
              { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
              { u: segLen / WINDOW_BAY_WIDTH, v: CAP_H / STORY_HEIGHT },
              { u: 0, v: CAP_H / STORY_HEIGHT },
              bldType, floors, 2.0, 21.0,
              dem0, dem1,
              0.85, 0.88, 0.92
            );

            // 4) 옥상 안쪽 빗물 배수로 및 구석 음영 (Corner AO 1.2m 구간 실측 스케일)
            const p1g = { x: p1In.x + inNx * 1.2, y: p1In.y + inNz * 1.2 };
            const p2g = { x: p2In.x + inNx * 1.2, y: p2In.y + inNz * 1.2 };
            addQuadGradientVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1In.x, y: totalH + 0.055, z: -p1In.y },
              { x: p2In.x, y: totalH + 0.055, z: -p2In.y },
              { x: p2g.x, y: totalH + 0.055, z: -p2g.y },
              { x: p1g.x, y: totalH + 0.055, z: -p1g.y },
              0, 1, 0,
              { u: 0, v: 0 }, { u: segLen * 0.1, v: 0 },
              { u: segLen * 0.1, v: 1.0 }, { u: 0, v: 1.0 },
              bldType, floors, 1.0, roofSlotId,
              dem0, dem1,
              [roofR * 0.22, roofG * 0.22, roofB * 0.22],
              [roofR * 0.22, roofG * 0.22, roofB * 0.22],
              [roofR, roofG, roofB],
              [roofR, roofG, roofB]
            );
          }
        } else {
          // 일반 수직 옥상 난간 (Parapet, 실측 높이 0.9m 엄격 돌출)
          const parapetH = 0.9;
          const parapetSlotId = seedGeom < 0.6 ? 21.0 : 22.0; // 21=parapet_concrete, 22=parapet_dark
          const parapetTopY = totalH + parapetH;

          for (let i = 0; i < oLen; i++) {
            const nextIdx = (i + 1) % oLen;
            const p1 = roofTargetPts[i];
            const p2 = roofTargetPts[nextIdx];
            const c1 = rawOuterRing[i % rawOuterRing.length];
            const c2 = rawOuterRing[nextIdx % rawOuterRing.length];

            const edgeDx = p2.x - p1.x;
            const edgeDy = p2.y - p1.y;
            const segLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
            if (segLen < 0.1) continue;

            const outNx = edgeDy / segLen;
            const outNz = -edgeDx / segLen;
            const inNx = -outNx;
            const inNz = -outNz;

            const p1i = { x: p1.x + inNx * PARAPET_THICKNESS, y: p1.y + inNz * PARAPET_THICKNESS };
            const p2i = { x: p2.x + inNx * PARAPET_THICKNESS, y: p2.y + inNz * PARAPET_THICKNESS };

            const dem0 = { u: (c1[0] - minLng) / rangeLng, v: (c1[1] - minLat) / rangeLat };
            const dem1 = { u: (c2[0] - minLng) / rangeLng, v: (c2[1] - minLat) / rangeLat };

            // 1) 난간 외벽면
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1.x, y: totalH, z: -p1.y },
              { x: p2.x, y: totalH, z: -p2.y },
              { x: p2.x, y: parapetTopY, z: -p2.y },
              { x: p1.x, y: parapetTopY, z: -p1.y },
              outNx, 0, -outNz,
              { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
              { u: segLen / WINDOW_BAY_WIDTH, v: parapetH / STORY_HEIGHT },
              { u: 0, v: parapetH / STORY_HEIGHT },
              bldType, floors, 2.0, parapetSlotId,
              dem0, dem1,
              0.85, 0.88, 0.92
            );

            // 2) 난간 상단 코핑
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1.x, y: parapetTopY, z: -p1.y },
              { x: p1i.x, y: parapetTopY, z: -p1i.y },
              { x: p2i.x, y: parapetTopY, z: -p2i.y },
              { x: p2.x, y: parapetTopY, z: -p2.y },
              0, 1, 0,
              { u: 0, v: 0 }, { u: 0, v: PARAPET_THICKNESS },
              { u: segLen, v: PARAPET_THICKNESS }, { u: segLen, v: 0 },
              bldType, floors, 2.0, parapetSlotId,
              dem0, dem1,
              0.80, 0.83, 0.88
            );

            // 3) 난간 내측 벽면
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p2i.x, y: totalH, z: -p2i.y },
              { x: p1i.x, y: totalH, z: -p1i.y },
              { x: p1i.x, y: parapetTopY, z: -p1i.y },
              { x: p2i.x, y: parapetTopY, z: -p2i.y },
              inNx, 0, -inNz,
              { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
              { u: segLen / WINDOW_BAY_WIDTH, v: parapetH / STORY_HEIGHT },
              { u: 0, v: parapetH / STORY_HEIGHT },
              bldType, floors, 2.0, parapetSlotId,
              dem0, dem1,
              0.85, 0.88, 0.92
            );

            // 4) 옥상 테두리(난간 바로 안쪽 1.2m 구간 실측 스케일): 빗물 배수로 라인 및 짙은 구석 그림자(Corner AO)
            const GUTTER_WIDTH = 1.2;
            const p1g = { x: p1i.x + inNx * GUTTER_WIDTH, y: p1i.y + inNz * GUTTER_WIDTH };
            const p2g = { x: p2i.x + inNx * GUTTER_WIDTH, y: p2i.y + inNz * GUTTER_WIDTH };

            addQuadGradientVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1i.x, y: totalH + 0.055, z: -p1i.y },
              { x: p2i.x, y: totalH + 0.055, z: -p2i.y },
              { x: p2g.x, y: totalH + 0.055, z: -p2g.y },
              { x: p1g.x, y: totalH + 0.055, z: -p1g.y },
              0, 1, 0,
              { u: 0, v: 0 },
              { u: segLen * 0.1, v: 0 },
              { u: segLen * 0.1, v: 1.0 },
              { u: 0, v: 1.0 },
              bldType,
              floors,
              1.0, // partType 1.0 = 지붕
              roofSlotId,
              dem0, dem1,
              [roofR * 0.22, roofG * 0.22, roofB * 0.22],
              [roofR * 0.22, roofG * 0.22, roofB * 0.22],
              [roofR, roofG, roofB],
              [roofR, roofG, roofB]
            );
          }
        }
        }

        // (b) 옥상 슬래브 (Roof Slab) earcut 삼각화
        const flatCoords: number[] = [];
        const holeIndices: number[] = [];
        const allVertsList: { pt: Point2D; raw: [number, number] }[] = [];

        for (let i = 0; i < roofTargetPts.length; i++) {
          flatCoords.push(roofTargetPts[i].x, roofTargetPts[i].y);
          allVertsList.push({ pt: roofTargetPts[i], raw: rawOuterRing[i % rawOuterRing.length] });
        }

        if (!hasCommercialSetback) {
          let offset = roofTargetPts.length;
          for (let h = 0; h < holesPts.length; h++) {
            holeIndices.push(offset);
            const hPts = holesPts[h];
            const hRaw = rawHolesRings[h];
            for (let i = 0; i < hPts.length; i++) {
              flatCoords.push(hPts[i].x, hPts[i].y);
              allVertsList.push({ pt: hPts[i], raw: hRaw[i] });
            }
            offset += hPts.length;
          }
        }

        const triangles = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : null, 2);
        const roofH = totalH + 0.05;

        if (triangles.length > 0) {
          for (let t = 0; t < triangles.length; t += 3) {
            const idx0 = triangles[t];
            const idx1 = triangles[t + 1];
            const idx2 = triangles[t + 2];

            const v0 = allVertsList[idx0];
            const v1 = allVertsList[idx1];
            const v2 = allVertsList[idx2];

            masterPositions.push(v0.pt.x, roofH, -v0.pt.y);
            masterPositions.push(v1.pt.x, roofH, -v1.pt.y);
            masterPositions.push(v2.pt.x, roofH, -v2.pt.y);

            for (let k = 0; k < 3; k++) {
              masterNormals.push(0, 1, 0);
              masterColors.push(roofR, roofG, roofB);
              masterBuildingData.push(bldType, floors, 1.0, roofSlotId);
            }

            masterUvs.push(v0.pt.x, v0.pt.y);
            masterUvs.push(v1.pt.x, v1.pt.y);
            masterUvs.push(v2.pt.x, v2.pt.y);

            masterDemCoords.push((v0.raw[0] - minLng) / rangeLng, (v0.raw[1] - minLat) / rangeLat);
            masterDemCoords.push((v1.raw[0] - minLng) / rangeLng, (v1.raw[1] - minLat) / rangeLat);
            masterDemCoords.push((v2.raw[0] - minLng) / rangeLng, (v2.raw[1] - minLat) / rangeLat);
          }

          if (totalH >= 4.0 && (isNearDetail || totalH >= 15.0)) {
            for (let t = 0; t < triangles.length; t += 3) {
              const v0 = allVertsList[triangles[t]];
              const v1 = allVertsList[triangles[t + 1]];
              const v2 = allVertsList[triangles[t + 2]];

              addShadowTriangle(
                shadowPositions, shadowColors,
                { x: v0.pt.x + dropDx, y: 0.012, z: -v0.pt.y + dropDz, a: 0.10 },
                { x: v1.pt.x + dropDx, y: 0.012, z: -v1.pt.y + dropDz, a: 0.10 },
                { x: v2.pt.x + dropDx, y: 0.012, z: -v2.pt.y + dropDz, a: 0.10 },
                0.0392, 0.0588, 0.1176
              );
            }
          }

          // -------------------------------------------------------------------
          // [지면 인페인팅 바닥 슬래브 (Ground Footprint Inpainting Buffer)]
          // 위성사진 바닥에 원래 인쇄된 2D 평면 지붕 잔상을 100% 가리는 지면 차폐 패드
          // 건물 용도별 지면 에이프런(광장/주차구획선 패드) 확장 (LOD2 상세 건물 한정)
          if (isLOD2) {
            const groundPadOutset = (isApt || bldType === 2.0) ? 2.5 : (bldType === 1.0 ? 2.0 : 0.5);
          const outsetBasePts = computePolygonOutset(outerPts, groundPadOutset);
          if (outsetBasePts.length >= 3) {
            const baseFlatCoords: number[] = [];
            for (const bp of outsetBasePts) {
              baseFlatCoords.push(bp.x, bp.y);
            }
            const baseTriangles = earcut(baseFlatCoords, null, 2);
            const baseElevY = 0.018; // 지표면 바로 위 밀착

            for (let bt = 0; bt < baseTriangles.length; bt += 3) {
              const b0 = outsetBasePts[baseTriangles[bt]];
              const b1 = outsetBasePts[baseTriangles[bt + 1]];
              const b2 = outsetBasePts[baseTriangles[bt + 2]];
              if (!b0 || !b1 || !b2) continue;

              masterPositions.push(b0.x, baseElevY, -b0.y);
              masterPositions.push(b1.x, baseElevY, -b1.y);
              masterPositions.push(b2.x, baseElevY, -b2.y);

              for (let k = 0; k < 3; k++) {
                masterNormals.push(0, 1, 0);
                // 도시 지표면 보도블록/아스팔트 콘크리트 패드 웜 그레이 (#3b4252 ~ #475569)
                masterColors.push(0.26, 0.29, 0.33);
                masterBuildingData.push(bldType, floors, 4.0, 21.0); // 4.0: 기단부, 21.0: 콘크리트 기단
              }

              masterUvs.push(b0.x, b0.y);
              masterUvs.push(b1.x, b1.y);
              masterUvs.push(b2.x, b2.y);

              const demMidU = (cLng - minLng) / rangeLng;
              const demMidV = (cLat - minLat) / rangeLat;
              const bRaw0 = (rawOuterRing && rawOuterRing.length > 0) ? rawOuterRing[baseTriangles[bt] % rawOuterRing.length] : null;
              const bRaw1 = (rawOuterRing && rawOuterRing.length > 0) ? rawOuterRing[baseTriangles[bt + 1] % rawOuterRing.length] : null;
              const bRaw2 = (rawOuterRing && rawOuterRing.length > 0) ? rawOuterRing[baseTriangles[bt + 2] % rawOuterRing.length] : null;

              masterDemCoords.push(bRaw0 ? (bRaw0[0] - minLng) / rangeLng : demMidU, bRaw0 ? (bRaw0[1] - minLat) / rangeLat : demMidV);
              masterDemCoords.push(bRaw1 ? (bRaw1[0] - minLng) / rangeLng : demMidU, bRaw1 ? (bRaw1[1] - minLat) / rangeLat : demMidV);
              masterDemCoords.push(bRaw2 ? (bRaw2[0] - minLng) / rangeLng : demMidU, bRaw2 ? (bRaw2[1] - minLat) / rangeLat : demMidV);
            }

            // -----------------------------------------------------------------
            // [실제 도시 화강석 경계석 (Kerb Stone) 3D 입체 림 (높이 0.15m, 폭 0.20m)]
            // 도로(위성사진)와 부지 대지 사이의 실측 화강석 연석을 입체로 구현
            // -----------------------------------------------------------------
            const KERB_H = 0.15;
            const KERB_WIDTH = 0.20;
            const kerbOuterPts = computePolygonOutset(outsetBasePts, KERB_WIDTH);
            const kLen = outsetBasePts.length;

            if (kerbOuterPts && kerbOuterPts.length === kLen && kLen >= 3) {
              for (let ki = 0; ki < kLen; ki++) {
                const nextKi = (ki + 1) % kLen;
                const kp1 = outsetBasePts[ki];
                const kp2 = outsetBasePts[nextKi];
                const kop1 = kerbOuterPts[ki];
                const kop2 = kerbOuterPts[nextKi];
                if (!kp1 || !kp2 || !kop1 || !kop2 || !Number.isFinite(kop1.x) || !Number.isFinite(kop2.x)) continue;

                const kDx = kp2.x - kp1.x;
                const kDy = kp2.y - kp1.y;
                const kSegLen = Math.hypot(kDx, kDy);
                if (kSegLen < 0.1) continue;

                const kOutNx = kDy / kSegLen;
                const kOutNz = -kDx / kSegLen;

                // 1) 연석 외측 수직면 (y: 0.018m ~ 0.168m)
                addQuadVertices(
                  masterPositions, masterNormals, masterUvs, masterColors,
                  masterBuildingData, masterDemCoords,
                  { x: kop1.x, y: baseElevY, z: -kop1.y },
                  { x: kop2.x, y: baseElevY, z: -kop2.y },
                  { x: kop2.x, y: baseElevY + KERB_H, z: -kop2.y },
                  { x: kop1.x, y: baseElevY + KERB_H, z: -kop1.y },
                  kOutNx, 0, -kOutNz,
                  { u: 0, v: 0 }, { u: kSegLen / 1.0, v: 0 },
                  { u: kSegLen / 1.0, v: 1.0 }, { u: 0, v: 1.0 },
                  bldType, floors, 4.0, 21.0,
                  { u: 0, v: 0 }, { u: 1, v: 1 },
                  0.72, 0.76, 0.82 // 화강석 연석 외측면
                );

                // 2) 연석 상단 수평면 (y: 0.168m)
                addQuadVertices(
                  masterPositions, masterNormals, masterUvs, masterColors,
                  masterBuildingData, masterDemCoords,
                  { x: kop1.x, y: baseElevY + KERB_H, z: -kop1.y },
                  { x: kop2.x, y: baseElevY + KERB_H, z: -kop2.y },
                  { x: kp2.x, y: baseElevY + KERB_H, z: -kp2.y },
                  { x: kp1.x, y: baseElevY + KERB_H, z: -kp1.y },
                  0, 1, 0,
                  { u: 0, v: 0 }, { u: kSegLen / 1.0, v: 0 },
                  { u: kSegLen / 1.0, v: 0.2 }, { u: 0, v: 0.2 },
                  bldType, floors, 4.0, 21.0,
                  { u: 0, v: 0 }, { u: 1, v: 1 },
                  0.80, 0.84, 0.89 // 화강석 연석 상단면
                );
              }
            }
          }
          }
        }

        let cx = 0, cy = 0;
        for (const p of roofTargetPts) {
          cx += p.x;
          cy += p.y;
        }
        if (roofTargetPts.length > 0) {
          cx /= roofTargetPts.length;
          cy /= roofTargetPts.length;
        }

        // (c) 엘리베이터 옥탑방 (Penthouse) 및 계단실 코어 (LOD2 상세 건물 한정):
        // 한국 아파트(높이 30m 이상): 2.8m 돌출된 동 중앙/양측 계단실 코어 생성
        if (isLOD2 && (floors >= 4 || totalH >= 12.0)) {

          const pHouseH = isKoreanAptHighrise
            ? (2.8 + ((buildingSeed * 73.1) % 0.7))
            : (2.8 + ((buildingSeed * 103.7) % 0.7)); // 실측 2.8m ~ 3.5m 직사각형 옥탑방
          const pHouseTop = roofH + pHouseH;
          const pHouseSlot = isKoreanAptHighrise ? 19.0 : (((buildingSeed * 89.23) % 1.0) < 0.5 ? 19.0 : 20.0);

          let boxW = Math.max(3.2, Math.min(bW * 0.35, 11.0));
          let boxD = Math.max(3.2, Math.min(bD * 0.35, 11.0));
          if (isKoreanAptHighrise) {
            boxW = Math.max(3.8, Math.min(bW * 0.18, 6.8));
            boxD = Math.max(3.8, Math.min(bD * 0.32, 7.8));
          }
          const hw = boxW * 0.5;
          const hd = boxD * 0.5;

          const coreOffsets: { ox: number; oy: number }[] = [];
          if (isKoreanAptHighrise) {
            // 한국형 판상형 아파트: 동 중앙 및 양측 계단실 코어 분할 배치
            if (bW >= 42.0) {
              coreOffsets.push({ ox: -bW * 0.30, oy: 0 });
              coreOffsets.push({ ox: 0, oy: 0 });
              coreOffsets.push({ ox: bW * 0.30, oy: 0 });
            } else if (bW >= 24.0) {
              coreOffsets.push({ ox: -bW * 0.22, oy: 0 });
              coreOffsets.push({ ox: bW * 0.22, oy: 0 });
            } else if (bD >= 42.0) {
              coreOffsets.push({ ox: 0, oy: -bD * 0.30 });
              coreOffsets.push({ ox: 0, oy: 0 });
              coreOffsets.push({ ox: 0, oy: bD * 0.30 });
            } else if (bD >= 24.0) {
              coreOffsets.push({ ox: 0, oy: -bD * 0.22 });
              coreOffsets.push({ ox: 0, oy: bD * 0.22 });
            } else {
              coreOffsets.push({ ox: 0, oy: 0 });
            }
          } else {
            if (bW >= 36.0) {
              coreOffsets.push({ ox: -bW * 0.25, oy: 0 });
              coreOffsets.push({ ox: bW * 0.25, oy: 0 });
            } else if (bD >= 36.0) {
              coreOffsets.push({ ox: 0, oy: -bD * 0.25 });
              coreOffsets.push({ ox: 0, oy: bD * 0.25 });
            } else {
              const posSeed = (buildingSeed * 53.11) % 1.0;
              const ox = posSeed < 0.35 ? 0 : (posSeed < 0.68 ? -(bW - boxW) * 0.25 : (bW - boxW) * 0.25);
              coreOffsets.push({ ox, oy: 0 });
            }
          }

          for (const core of coreOffsets) {
            const ccx = cx + core.ox;
            const ccy = cy + core.oy;
            const corners = [
              { x: ccx - hw, y: ccy - hd },
              { x: ccx + hw, y: ccy - hd },
              { x: ccx + hw, y: ccy + hd },
              { x: ccx - hw, y: ccy + hd },
            ];

            for (let k = 0; k < 4; k++) {
              const nextK = (k + 1) % 4;
              const k1 = corners[k];
              const k2 = corners[nextK];
              const kdx = k2.x - k1.x;
              const kdy = k2.y - k1.y;
              const kLen = Math.sqrt(kdx * kdx + kdy * kdy);
              const knx = kdy / kLen;
              const knz = -kdx / kLen;

              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                { x: k1.x, y: roofH, z: -k1.y },
                { x: k2.x, y: roofH, z: -k2.y },
                { x: k2.x, y: pHouseTop, z: -k2.y },
                { x: k1.x, y: pHouseTop, z: -k1.y },
                knx, 0, -knz,
                { u: 0, v: 0 },
                { u: kLen / WINDOW_BAY_WIDTH, v: 0 },
                { u: kLen / WINDOW_BAY_WIDTH, v: pHouseH / STORY_HEIGHT },
                { u: 0, v: pHouseH / STORY_HEIGHT },
                bldType, floors, 5.0, pHouseSlot,
                demMid, demMid,
                0.88, 0.91, 0.94
              );
            }

            // 옥탑 상단 지붕 슬래브
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: corners[0].x, y: pHouseTop, z: -corners[0].y },
              { x: corners[1].x, y: pHouseTop, z: -corners[1].y },
              { x: corners[2].x, y: pHouseTop, z: -corners[2].y },
              { x: corners[3].x, y: pHouseTop, z: -corners[3].y },
              0, 1, 0,
              { u: 0, v: 0 }, { u: boxW / 4.0, v: 0 },
              { u: boxW / 4.0, v: boxD / 4.0 }, { u: 0, v: boxD / 4.0 },
              bldType, floors, 1.0, 14.0, // 14=roof_concrete_warmgray
              demMid, demMid,
              0.64, 0.74, 0.82
            );
            // (1) 대단지 브랜드 아파트 및 고층 건물: 옥상 경사형 장식 캡 (Hipped Roof Cap)
            if (regStyle.hasRoofCoreCap || isKoreanAptHighrise) {
              const capH = pHouseTop + 1.8;
              const overhang = 0.35;
              const b0 = { x: corners[0].x - overhang, y: pHouseTop, z: -(corners[0].y - overhang) };
              const b1 = { x: corners[1].x + overhang, y: pHouseTop, z: -(corners[1].y - overhang) };
              const b2 = { x: corners[2].x + overhang, y: pHouseTop, z: -(corners[2].y + overhang) };
              const b3 = { x: corners[3].x - overhang, y: pHouseTop, z: -(corners[3].y + overhang) };

              // 중심 용마루 능선 (Ridge line)
              const rLen = Math.max(1.0, boxW * 0.40);
              const r0 = { x: ccx - rLen * 0.5, y: capH, z: -ccy };
              const r1 = { x: ccx + rLen * 0.5, y: capH, z: -ccy };

              // 1) 남측 경사면 (b0 -> b1 -> r1 -> r0)
              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                b0, b1, r1, r0,
                0, 0.707, -0.707,
                { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
                bldType, floors, 6.0, 15.0, // 다크 차콜 슬레이트 캡 (#334155)
                demMid, demMid,
                0.22, 0.26, 0.32
              );
              // 2) 북측 경사면 (b2 -> b3 -> r0 -> r1)
              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                b2, b3, r0, r1,
                0, 0.707, 0.707,
                { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
                bldType, floors, 6.0, 15.0,
                demMid, demMid,
                0.18, 0.21, 0.27
              );
              // 3) 서측 박공 삼각형 (b3 -> b0 -> r0)
              masterPositions.push(b3.x, b3.y, b3.z, b0.x, b0.y, b0.z, r0.x, r0.y, r0.z);
              for (let k = 0; k < 3; k++) {
                masterNormals.push(-0.707, 0.707, 0);
                masterColors.push(0.20, 0.24, 0.30);
                masterBuildingData.push(bldType, floors, 6.0, 15.0);
              }
              masterUvs.push(0, 0, 1, 0, 0.5, 1);
              masterDemCoords.push(demMid.u, demMid.v, demMid.u, demMid.v, demMid.u, demMid.v);

              // 4) 동측 박공 삼각형 (b1 -> b2 -> r1)
              masterPositions.push(b1.x, b1.y, b1.z, b2.x, b2.y, b2.z, r1.x, r1.y, r1.z);
              for (let k = 0; k < 3; k++) {
                masterNormals.push(0.707, 0.707, 0);
                masterColors.push(0.20, 0.24, 0.30);
                masterBuildingData.push(bldType, floors, 6.0, 15.0);
              }
              masterUvs.push(0, 0, 1, 0, 0.5, 1);
              masterDemCoords.push(demMid.u, demMid.v, demMid.u, demMid.v, demMid.u, demMid.v);
            }

            // (2) 옥탑 옆 소형 실외기/환기구 설비 큐브 및 HVAC 냉각탑 (Equipment Box / HVAC Units)
            // 평평한 옥상에 실사 도시 디테일 부여 (단일 버퍼 병합, Draw Call 증가 없음)
            const equipCount = isKoreanAptHighrise ? 2 : 1;
            for (let eqIdx = 0; eqIdx < equipCount; eqIdx++) {
              const eqW = 1.6 + ((buildingSeed * 37.1 + eqIdx * 13.7) % 0.6); // 1.6m ~ 2.2m
              const eqD = 1.4 + ((buildingSeed * 53.3 + eqIdx * 19.1) % 0.6); // 1.4m ~ 2.0m
              const eqH = 1.2 + ((buildingSeed * 71.9 + eqIdx * 23.3) % 0.4); // 1.2m ~ 1.6m

              // 옥탑 측면에 오프셋 배치
              const sideSign = eqIdx === 0 ? 1 : -1;
              const eqCx = ccx + (hw + eqW * 0.6 + 0.4) * (bW >= bD ? 0 : sideSign);
              const eqCy = ccy + (hd + eqD * 0.6 + 0.4) * (bW >= bD ? sideSign : 0);

              // 옥상 경계 내에 있는지 안전 체크 (중심 기준 bW*0.42, bD*0.42 이내)
              if (Math.abs(eqCx - cx) < bW * 0.42 && Math.abs(eqCy - cy) < bD * 0.42) {
                const eqHw = eqW * 0.5;
                const eqHd = eqD * 0.5;
                const eqTop = roofH + eqH;
                const eqCorners = [
                  { x: eqCx - eqHw, y: eqCy - eqHd },
                  { x: eqCx + eqHw, y: eqCy - eqHd },
                  { x: eqCx + eqHw, y: eqCy + eqHd },
                  { x: eqCx - eqHw, y: eqCy + eqHd },
                ];

                // 4개 측벽 (slot 20: penthouse_metal)
                for (let k = 0; k < 4; k++) {
                  const nextK = (k + 1) % 4;
                  const k1 = eqCorners[k];
                  const k2 = eqCorners[nextK];
                  const kdx = k2.x - k1.x;
                  const kdy = k2.y - k1.y;
                  const kLen = Math.hypot(kdx, kdy);
                  if (kLen < 0.05) continue;
                  const knx = kdy / kLen;
                  const knz = -kdx / kLen;

                  addQuadVertices(
                    masterPositions, masterNormals, masterUvs, masterColors,
                    masterBuildingData, masterDemCoords,
                    { x: k1.x, y: roofH, z: -k1.y },
                    { x: k2.x, y: roofH, z: -k2.y },
                    { x: k2.x, y: eqTop, z: -k2.y },
                    { x: k1.x, y: eqTop, z: -k1.y },
                    knx, 0, -knz,
                    { u: 0, v: 0 }, { u: 1.0, v: 0 },
                    { u: 1.0, v: 1.0 }, { u: 0, v: 1.0 },
                    bldType, floors, 5.0, 20.0, // 20: penthouse_metal
                    demMid, demMid,
                    0.72, 0.76, 0.82 // 메탈릭 실버 그레이
                  );
                }
                // 설비 상단
                addQuadVertices(
                  masterPositions, masterNormals, masterUvs, masterColors,
                  masterBuildingData, masterDemCoords,
                  { x: eqCorners[0].x, y: eqTop, z: -eqCorners[0].y },
                  { x: eqCorners[1].x, y: eqTop, z: -eqCorners[1].y },
                  { x: eqCorners[2].x, y: eqTop, z: -eqCorners[2].y },
                  { x: eqCorners[3].x, y: eqTop, z: -eqCorners[3].y },
                  0, 1, 0,
                  { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
                  bldType, floors, 1.0, 20.0,
                  demMid, demMid,
                  0.65, 0.70, 0.76
                );
              }
            }
          }
        }

        // (c-1) 혁신도시 공공기관 대형 청사 옥상 태양광 패널 그리드 & 조경 테라스
        if (isLOD2 && regStyle.hasSolarPanels && bW >= 12.0 && bD >= 12.0) {
          const panelRows = Math.min(3, Math.max(1, Math.floor(bD / 5.0)));
          const panelCols = Math.min(4, Math.max(1, Math.floor(bW / 4.5)));
          const pSpanX = (bW * 0.6) / panelCols;
          const pSpanY = (bD * 0.5) / panelRows;
          const pStartX = cx - (bW * 0.28);
          const pStartY = cy - (bD * 0.25);

          for (let pr = 0; pr < panelRows; pr++) {
            for (let pc = 0; pc < panelCols; pc++) {
              const px = pStartX + pc * pSpanX;
              const py = pStartY + pr * pSpanY;
              const pw = pSpanX * 0.85;
              const ph = pSpanY * 0.78;
              const baseY = roofH + 0.35;
              const tiltY = baseY + 0.65; // 18도 경사각 남향 태양광 모듈

              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                { x: px - pw * 0.5, y: baseY, z: -(py - ph * 0.5) },
                { x: px + pw * 0.5, y: baseY, z: -(py - ph * 0.5) },
                { x: px + pw * 0.5, y: tiltY, z: -(py + ph * 0.5) },
                { x: px - pw * 0.5, y: tiltY, z: -(py + ph * 0.5) },
                0, 0.95, 0.31,
                { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
                bldType, floors, 1.0, 18.0,
                demMid, demMid,
                0.08, 0.12, 0.24 // 딥 솔라 셀 네이비 블루
              );
            }
          }
        }

        if (isLOD2 && regStyle.hasRoofTerrace && bW >= 14.0 && bD >= 14.0) {
          const tw = bW * 0.26;
          const td = bD * 0.26;
          const tx = cx + (bW * 0.26);
          const ty = cy + (bD * 0.26);
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: tx - tw * 0.5, y: roofH + 0.08, z: -(ty - td * 0.5) },
            { x: tx + tw * 0.5, y: roofH + 0.08, z: -(ty - td * 0.5) },
            { x: tx + tw * 0.5, y: roofH + 0.08, z: -(ty + td * 0.5) },
            { x: tx - tw * 0.5, y: roofH + 0.08, z: -(ty + td * 0.5) },
            0, 1, 0,
            { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 1.0, 17.0,
            demMid, demMid,
            0.16, 0.48, 0.25 // 조경 잔디 테라스 그린 (#297a40)
          );
        }

        // (c-2) 구도심/역세권 상가 블록 옥상 STS 원통형 물탱크 및 실외기
        if (regStyle.hasWaterTank && bW >= 7.0 && bD >= 7.0) {
          const tankRadius = 0.9;
          const tankH = 1.6;
          const tankCx = cx + Math.min(bW * 0.28, bW * 0.5 - tankRadius - 0.4);
          const tankCy = cy + Math.min(bD * 0.28, bD * 0.5 - tankRadius - 0.4);
          const segs = 8;
          for (let s = 0; s < segs; s++) {
            const a1 = (s / segs) * Math.PI * 2;
            const a2 = ((s + 1) / segs) * Math.PI * 2;
            const tx1 = tankCx + Math.cos(a1) * tankRadius;
            const ty1 = tankCy + Math.sin(a1) * tankRadius;
            const tx2 = tankCx + Math.cos(a2) * tankRadius;
            const ty2 = tankCy + Math.sin(a2) * tankRadius;
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: tx1, y: roofH, z: -ty1 },
              { x: tx2, y: roofH, z: -ty2 },
              { x: tx2, y: roofH + tankH, z: -ty2 },
              { x: tx1, y: roofH + tankH, z: -ty1 },
              (Math.cos(a1) + Math.cos(a2)) * 0.5, 0, -(Math.sin(a1) + Math.sin(a2)) * 0.5,
              { u: 0, v: 0 }, { u: 0.5, v: 0 }, { u: 0.5, v: 1 }, { u: 0, v: 1 },
              bldType, floors, 5.0, 20.0,
              demMid, demMid,
              0.84, 0.88, 0.92 // STS 스테인리스 스틸 실버
            );
          }
          // 물탱크 상판
          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: tankCx - tankRadius, y: roofH + tankH, z: -(tankCy - tankRadius) },
            { x: tankCx + tankRadius, y: roofH + tankH, z: -(tankCy - tankRadius) },
            { x: tankCx + tankRadius, y: roofH + tankH, z: -(tankCy + tankRadius) },
            { x: tankCx - tankRadius, y: roofH + tankH, z: -(tankCy + tankRadius) },
            0, 1, 0,
            { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
            bldType, floors, 1.0, 20.0,
            demMid, demMid,
            0.86, 0.90, 0.94
          );
        }
      }

      // -----------------------------------------------------------------------
      // [3. 경사지붕(Pitched Roof) 분기: 박공지붕(Gabled) & 우진각지붕(Hipped)]
      // -----------------------------------------------------------------------
      if (hasPitchedRoof) {
        const pitchAngleRad = (regStyle.roofPitchAngle || 20) * (Math.PI / 180);
        const ridgeH = totalH + Math.max(1.8, Math.min(bW, bD) * 0.5 * Math.tan(pitchAngleRad));

        if (hasHippedRoof) {
          // (a) 우진각지붕 (Hipped Roof: 4면 경사지붕)
          if (bW >= bD) {
            const inset = Math.min(bW * 0.30, bD * 0.45);
            const cy = (minY + maxY) * 0.5;
            const r0 = { x: minX + inset, y: cy };
            const r1 = { x: maxX - inset, y: cy };
            const e0 = { x: minX, y: minY };
            const e1 = { x: maxX, y: minY };
            const e2 = { x: maxX, y: maxY };
            const e3 = { x: minX, y: maxY };

            // 1) South Slope (사다리꼴)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e0.x, y: totalH, z: -e0.y },
              { x: e1.x, y: totalH, z: -e1.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              0, 0.707, 0.707,
              { u: 0, v: 0 }, { u: bW / WINDOW_BAY_WIDTH, v: 0 },
              { u: bW / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // 2) North Slope (사다리꼴)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: r0.x, y: ridgeH, z: -r0.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: e3.x, y: totalH, z: -e3.y },
              0, 0.707, -0.707,
              { u: 0, v: 1.0 }, { u: bW / WINDOW_BAY_WIDTH, v: 1.0 },
              { u: bW / WINDOW_BAY_WIDTH, v: 0 }, { u: 0, v: 0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // 3) West Hip (삼각형 경사)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e3.x, y: totalH, z: -e3.y },
              { x: e0.x, y: totalH, z: -e0.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              -0.707, 0.707, 0,
              { u: 0, v: 0 }, { u: bD / WINDOW_BAY_WIDTH, v: 0 }, { u: (bD * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid, demMid,
              roofR, roofG, roofB
            );

            // 4) East Hip (삼각형 경사)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e1.x, y: totalH, z: -e1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              0.707, 0.707, 0,
              { u: 0, v: 0 }, { u: bD / WINDOW_BAY_WIDTH, v: 0 }, { u: (bD * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid, demMid,
              roofR, roofG, roofB
            );
          } else {
            const inset = Math.min(bD * 0.30, bW * 0.45);
            const cx = (minX + maxX) * 0.5;
            const r0 = { x: cx, y: minY + inset };
            const r1 = { x: cx, y: maxY - inset };
            const e0 = { x: minX, y: minY };
            const e1 = { x: minX, y: maxY };
            const e2 = { x: maxX, y: maxY };
            const e3 = { x: maxX, y: minY };

            // 1) West Slope (사다리꼴)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e0.x, y: totalH, z: -e0.y },
              { x: e1.x, y: totalH, z: -e1.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              -0.707, 0.707, 0,
              { u: 0, v: 0 }, { u: bD / WINDOW_BAY_WIDTH, v: 0 },
              { u: bD / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // 2) East Slope (사다리꼴)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: r0.x, y: ridgeH, z: -r0.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: e3.x, y: totalH, z: -e3.y },
              0.707, 0.707, 0,
              { u: 0, v: 1.0 }, { u: bD / WINDOW_BAY_WIDTH, v: 1.0 },
              { u: bD / WINDOW_BAY_WIDTH, v: 0 }, { u: 0, v: 0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // 3) South Hip (삼각형 경사)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e3.x, y: totalH, z: -e3.y },
              { x: e0.x, y: totalH, z: -e0.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              0, 0.707, 0.707,
              { u: 0, v: 0 }, { u: bW / WINDOW_BAY_WIDTH, v: 0 }, { u: (bW * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid, demMid,
              roofR, roofG, roofB
            );

            // 4) North Hip (삼각형 경사)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e1.x, y: totalH, z: -e1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              0, 0.707, -0.707,
              { u: 0, v: 0 }, { u: bW / WINDOW_BAY_WIDTH, v: 0 }, { u: (bW * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid, demMid,
              roofR, roofG, roofB
            );
          }
        } else {
          // (b) ㅅ자형 박공지붕 (Gabled Roof)
          if (bW >= bD) {
            const r0 = { x: minX, y: (minY + maxY) * 0.5 };
            const r1 = { x: maxX, y: (minY + maxY) * 0.5 };
            const e0 = { x: minX, y: minY };
            const e1 = { x: maxX, y: minY };
            const e2 = { x: maxX, y: maxY };
            const e3 = { x: minX, y: maxY };

            // Slope 1 (South)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e0.x, y: totalH, z: -e0.y },
              { x: e1.x, y: totalH, z: -e1.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              0, 0.707, 0.707,
              { u: 0, v: 0 }, { u: bW / WINDOW_BAY_WIDTH, v: 0 },
              { u: bW / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // Slope 2 (North)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: r0.x, y: ridgeH, z: -r0.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: e3.x, y: totalH, z: -e3.y },
              0, 0.707, -0.707,
              { u: 0, v: 1.0 }, { u: bW / WINDOW_BAY_WIDTH, v: 1.0 },
              { u: bW / WINDOW_BAY_WIDTH, v: 0 }, { u: 0, v: 0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // Gable Wall 1 (West)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e3.x, y: totalH, z: -e3.y },
              { x: e0.x, y: totalH, z: -e0.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              -1, 0, 0,
              { u: 0, v: 0 }, { u: bD / WINDOW_BAY_WIDTH, v: 0 }, { u: (bD * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 0.0, defaultWallSlotId,
              demMid, demMid, demMid,
              wallR, wallG, wallB
            );

            // Gable Wall 2 (East)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e1.x, y: totalH, z: -e1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              1, 0, 0,
              { u: 0, v: 0 }, { u: bD / WINDOW_BAY_WIDTH, v: 0 }, { u: (bD * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 0.0, defaultWallSlotId,
              demMid, demMid, demMid,
              wallR, wallG, wallB
            );
          } else {
            const r0 = { x: (minX + maxX) * 0.5, y: minY };
            const r1 = { x: (minX + maxX) * 0.5, y: maxY };
            const e0 = { x: minX, y: minY };
            const e1 = { x: minX, y: maxY };
            const e2 = { x: maxX, y: maxY };
            const e3 = { x: maxX, y: minY };

            // Slope 1 (West)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e0.x, y: totalH, z: -e0.y },
              { x: e1.x, y: totalH, z: -e1.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              -0.707, 0.707, 0,
              { u: 0, v: 0 }, { u: bD / WINDOW_BAY_WIDTH, v: 0 },
              { u: bD / WINDOW_BAY_WIDTH, v: 1.0 }, { u: 0, v: 1.0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // Slope 2 (East)
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: r0.x, y: ridgeH, z: -r0.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: e3.x, y: totalH, z: -e3.y },
              0.707, 0.707, 0,
              { u: 0, v: 1.0 }, { u: bD / WINDOW_BAY_WIDTH, v: 1.0 },
              { u: bD / WINDOW_BAY_WIDTH, v: 0 }, { u: 0, v: 0 },
              bldType, floors, 6.0, roofSlotId,
              demMid, demMid,
              roofR, roofG, roofB
            );

            // Gable Wall 1 (South)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e3.x, y: totalH, z: -e3.y },
              { x: e0.x, y: totalH, z: -e0.y },
              { x: r0.x, y: ridgeH, z: -r0.y },
              0, 0, 1,
              { u: 0, v: 0 }, { u: bW / WINDOW_BAY_WIDTH, v: 0 }, { u: (bW * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 0.0, defaultWallSlotId,
              demMid, demMid, demMid,
              wallR, wallG, wallB
            );

            // Gable Wall 2 (North)
            addTriangleVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: e1.x, y: totalH, z: -e1.y },
              { x: e2.x, y: totalH, z: -e2.y },
              { x: r1.x, y: ridgeH, z: -r1.y },
              0, 0, -1,
              { u: 0, v: 0 }, { u: bW / WINDOW_BAY_WIDTH, v: 0 }, { u: (bW * 0.5) / WINDOW_BAY_WIDTH, v: 1.0 },
              bldType, floors, 0.0, defaultWallSlotId,
              demMid, demMid, demMid,
              wallR, wallG, wallB
            );
          }
        }
      }

      buildingCount++;
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
    buildingCount,
    demBounds: [minLng, minLat, maxLng, maxLat],
  };
}
