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

export interface OSMGeometryOptions {
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  originLngLat: [number, number];
  demBounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  sunDirection?: [number, number, number];       // [sX, sY, sZ]
  zoom?: number;
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
  const PARAPET_THICKNESS = 0.4; // 옥상 난간 실측 두께 0.4m
  const PARAPET_HEIGHT = 1.0;    // 옥상 난간 실측 돌출 높이 1.0m

  let buildingCount = 0;

  // 2. 피처별 건물 지오메트리 직렬화
  for (const feat of features) {
    if (!feat.geometry) continue;

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

    const explicitH = rawHei > 0 ? rawHei : (rawFlr > 0 ? rawFlr * STORY_HEIGHT : 0);

    // 건물 폴리곤 좌표 파싱 및 기하학적 치수(폭, 길이, 면적, 종횡비, 중심좌표) 계산
    let dimMin = 10, dimMax = 15, approxArea = 150, cLng = originLngLat[0], cLat = originLngLat[1];
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
      const wMeters = (maxX - minX) * 111320 * cosLat;
      const hMeters = (maxY - minY) * 111320;
      dimMin = Math.max(1, Math.min(wMeters, hMeters));
      dimMax = Math.max(wMeters, hMeters);
      approxArea = Math.max(10, wMeters * hMeters * 0.85);
    }
    const aspectRatio = dimMax / Math.max(1, dimMin);

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

    // (b) 아파트 명칭 및 기하 형태 매칭
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

    // 한국형 판상형: 폭 10~18m, 길이 32~95m, 면적 >= 320m² 또는 대형 타워형
    const isAptByGeometry =
      !isMilitary &&
      ((dimMin >= 9.0 && dimMin <= 20.0 && dimMax >= 32.0 && approxArea >= 320 && aspectRatio >= 1.8) ||
       (dimMin >= 12.0 && dimMax >= 30.0 && approxArea >= 380));

    const isApt = isAptByName || isAptByGeometry;

    // -------------------------------------------------------------------------
    // [강원권 4대 권역별 맞춤형 실사 건축·지붕·특수시설 렌더링 엔진 연동]
    // 1) 원주·춘천 도시/혁신도시권: 공공기관 대형 청사 / 대단지 브랜드 아파트 / 구도심 상가
    // 2) 접경 및 군사 거점권: 신형 통합막사 / 군수 물류창고 / 영농 비닐하우스 / 농촌 단독주택
    // 3) 동해안권: 오션뷰 리조트·호텔 / 항만 물류 사일로 및 공장
    // 4) 산악 고원권: 급경사 기초 옹벽(-8m) / 30도 급경사 다설형 박공지붕
    // -------------------------------------------------------------------------
    const metricsInput = { cLng, cLat, dimMin, dimMax, approxArea, aspectRatio };
    const regStyle = classifyRegionalBuildingStyle(props, metricsInput);

    const buildingSeed = Math.abs(Math.sin(cLng * 127.13 + cLat * 311.71 + approxArea * 0.057)) % 1.0;
    const seedRoof = Math.abs(Math.sin(cLng * 997.13 + cLat * 533.77 + approxArea * 0.19)) % 1.0;
    const seedGeom = Math.abs(Math.sin(cLng * 43.19 + seedRoof * 11.7 + approxArea * 0.031)) % 1.0;

    let totalH = explicitH > 4.0 ? explicitH : regStyle.height;
    totalH = Math.max(3.5, Math.min(250.0, totalH));
    const floors = rawFlr > 0 ? rawFlr : regStyle.levels;
    const bldType = regStyle.bldType;

    // 외벽/지붕 슬롯 및 정점 컬러 (regionalStyle 직결)
    const defaultWallSlotId = regStyle.defaultWallSlotId;
    const wallR = regStyle.wallR, wallG = regStyle.wallG, wallB = regStyle.wallB;
    const roofSlotId = regStyle.roofSlotId;
    const roofR = regStyle.roofR, roofG = regStyle.roofG, roofB = regStyle.roofB;
    const parapetSlotId = regStyle.parapetSlotId;

    // 지붕 형태 분기
    const hasPitchedRoof = regStyle.isPitchedRoof;
    const hasGabledRoof = regStyle.roofShape === 'gabled' || regStyle.roofShape === 'greenhouse';
    const hasHippedRoof = regStyle.roofShape === 'hipped';

    // 기단부(Podium) 색상 및 높이
    const podiumR = regStyle.podiumR, podiumG = regStyle.podiumG, podiumB = regStyle.podiumB;
    const podiumH = Math.min(PODIUM_MAX_HEIGHT, totalH);

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
      const hasCommercialSetback = regStyle.hasCommercialSetback || (totalH >= 20.0 && approxArea >= 600);
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
          if (!isHole && (regStyle.bldType === 2.0 || regStyle.sideWallStripe) && floors >= 7.0 && maxEdgeLen >= 18.0) {
            if (segLen <= 16.0 || segLen <= maxEdgeLen * 0.45) {
              partType = 3.0; // 3=측벽 수직 코어
              isSideWall = true;
            }
          }

          const currentWallSlot = ((regStyle.bldType === 2.0 || regStyle.sideWallStripe) && isSideWall) ? 4.0 : defaultWallSlotId; // 4=apt_side
          const currentPodiumSlot = regStyle.podiumWallSlotId || (bldType === 1.0 ? 9.0 : 21.0);

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

          // 외곽 링에 대해 1.5m 접지 음영(Contact AO) 및 태양광 투영 그림자 생성
          if (!isHole) {
            // [접지 음영(Contact AO): 건물 하단 0.8m 밀착 림으로 지면 안착감 부여]
            const aoWidth = 0.85;
            addShadowQuad(
              shadowPositions, shadowColors,
              { x: p1.x, y: 0.02, z: -p1.y, a: 0.22 },
              { x: p2.x, y: 0.02, z: -p2.y, a: 0.22 },
              { x: p2.x + nx * aoWidth, y: 0.015, z: -(p2.y - nz * aoWidth), a: 0.0 },
              { x: p1.x + nx * aoWidth, y: 0.015, z: -(p1.y - nz * aoWidth), a: 0.0 },
              0.020, 0.028, 0.038
            );

            if (isNearDetail) {
              addShadowQuad(
                shadowPositions, shadowColors,
                { x: p1.x, y: 0.025, z: -p1.y, a: 0.15 },
                { x: p2.x, y: 0.025, z: -p2.y, a: 0.15 },
                { x: p2.x + nx * 0.45, y: 0.022, z: -(p2.y - nz * 0.45), a: 0.0 },
                { x: p1.x + nx * 0.45, y: 0.022, z: -(p1.y - nz * 0.45), a: 0.0 },
                0.012, 0.018, 0.026
              );
            }

            // [태양광 방향 일치 평면 투영 그림자 (Planar Shadow)]
            const nDotL = nx * sX + (-nz) * sZ;
            if (nDotL < 0.20 && totalH >= 3.0) {
              addShadowQuad(
                shadowPositions, shadowColors,
                { x: p1.x, y: 0.02, z: -p1.y, a: 0.15 },
                { x: p2.x, y: 0.02, z: -p2.y, a: 0.15 },
                { x: p2.x + dropDx, y: 0.015, z: -p2.y + dropDz, a: 0.15 },
                { x: p1.x + dropDx, y: 0.015, z: -p1.y + dropDz, a: 0.15 },
                0.035, 0.045, 0.065
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
      if (isApt && totalH >= 30.0 && maxEdgeLen >= 14.0) {
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
        const isKoreanAptHighrise = isApt && totalH >= 30.0;
        const oLen = roofTargetPts.length;

        // (a) 가변 옥상 난간 (Parapet) / 한국형 아파트 경사 파라펫 캡 (Mansard Cap)
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

            // 4) 옥상 안쪽 빗물 배수로 및 구석 음영 (Corner AO)
            const p1g = { x: p1In.x + inNx * 0.8, y: p1In.y + inNz * 0.8 };
            const p2g = { x: p2In.x + inNx * 0.8, y: p2In.y + inNz * 0.8 };
            addQuadVertices(
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
              roofR * 0.52, roofG * 0.52, roofB * 0.52
            );
          }
        } else {
          // 일반 수직 옥상 난간 (Parapet, 실측 높이 1.0m 엄격 돌출)
          const parapetH = 1.0;
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

            // 4) 옥상 테두리(난간 바로 안쪽 0.8m 구간): 빗물 배수로 라인 및 짙은 구석 그림자(Corner AO)
            const GUTTER_WIDTH = 0.8;
            const p1g = { x: p1i.x + inNx * GUTTER_WIDTH, y: p1i.y + inNz * GUTTER_WIDTH };
            const p2g = { x: p2i.x + inNx * GUTTER_WIDTH, y: p2i.y + inNz * GUTTER_WIDTH };

            addQuadVertices(
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
              roofR * 0.52, roofG * 0.52, roofB * 0.52
            );
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
          // 건물 외곽선보다 0.35m 바깥으로 확장(Outset)한 폴리곤을 지면 고도(y = 0.018m)에 배치
          // -------------------------------------------------------------------
          const outsetBasePts = computePolygonOutset(outerPts, 0.35);
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

        let cx = 0, cy = 0;
        for (const p of roofTargetPts) {
          cx += p.x;
          cy += p.y;
        }
        if (roofTargetPts.length > 0) {
          cx /= roofTargetPts.length;
          cy /= roofTargetPts.length;
        }

        // (c) 엘리베이터 옥탑방 (Penthouse) 및 계단실 코어:
        // 한국 아파트(높이 30m 이상): 2.8m 돌출된 동 중앙/양측 계단실 코어 생성
        if (floors >= 4 || totalH >= 12.0) {

          const pHouseH = isKoreanAptHighrise ? 2.8 : (2.6 + ((buildingSeed * 103.7) % 1.0) * 0.9);
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
            // (1) 대단지 브랜드 아파트: 옥상 경사형 장식 캡 (Architectural Decorative Cap)
            if (regStyle.hasRoofCoreCap) {
              const capH = pHouseTop + 1.6;
              const capInset = 0.25;
              addQuadVertices(
                masterPositions, masterNormals, masterUvs, masterColors,
                masterBuildingData, masterDemCoords,
                { x: corners[0].x - capInset, y: pHouseTop, z: -(corners[0].y - capInset) },
                { x: corners[1].x + capInset, y: pHouseTop, z: -(corners[1].y - capInset) },
                { x: corners[2].x + capInset, y: capH, z: -(corners[2].y + capInset) },
                { x: corners[3].x - capInset, y: capH, z: -(corners[3].y + capInset) },
                0, 0.85, -0.52,
                { u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 },
                bldType, floors, 6.0, 15.0, // 다크 차콜 슬레이트 캡 (#334155)
                demMid, demMid,
                0.20, 0.25, 0.33
              );
            }
          }
        }

        // (c-1) 혁신도시 공공기관 대형 청사 옥상 태양광 패널 그리드 & 조경 테라스
        if (regStyle.hasSolarPanels && bW >= 12.0 && bD >= 12.0) {
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

        if (regStyle.hasRoofTerrace && bW >= 14.0 && bD >= 14.0) {
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
