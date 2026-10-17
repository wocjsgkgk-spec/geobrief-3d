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
  wallLength: number,
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
    buildingDatas.push(bldType, floors, partType, wallLength);
  }

  uvs.push(uv0.u, uv0.v, uv1.u, uv1.v, uv2.u, uv2.v);
  uvs.push(uv0.u, uv0.v, uv2.u, uv2.v, uv3.u, uv3.v);

  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem1.u, dem1.v);
  demCoords.push(dem0.u, dem0.v, dem1.u, dem1.v, dem0.u, dem0.v);
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
  r = 0.059,
  g = 0.090,
  b = 0.165
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

  // 창문 1칸 폭 2.8m, 층고 3.0m 비례 규격
  const WINDOW_BAY_WIDTH = 2.8;
  const STORY_HEIGHT = 3.0;
  const PODIUM_MAX_HEIGHT = 3.5;
  const PARAPET_THICKNESS = 0.3; // 옥상 난간 두께 0.3m
  const PARAPET_HEIGHT = 0.9;    // 옥상 난간 높이 0.9m

  let buildingCount = 0;

  // 2. 피처별 건물 지오메트리 직렬화
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

    const explicitH = rawHei > 0 ? rawHei : (rawFlr > 0 ? rawFlr * STORY_HEIGHT : 0);

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

    let totalH = explicitH;
    if (totalH <= 0) {
      totalH = isApt ? 54.0 : isComm ? 12.0 : 6.0;
    }
    totalH = Math.max(3.5, Math.min(250.0, totalH));
    const floors = rawFlr > 0 ? rawFlr : Math.max(1, Math.round(totalH / STORY_HEIGHT));
    const bldType = isApt ? 2.0 : (isComm ? 1.0 : 0.0);

    // 건물 외벽 기본 실사 색상 팔레트
    let wallR = 0.957, wallG = 0.945, wallB = 0.918; // 아파트: 크림 아이보리 (#f4f1ea)
    if (isComm) {
      wallR = 0.839; wallG = 0.827; wallB = 0.820; // 상업/오피스: 베이지·그레이 스톤 (#d6d3d1)
    } else if (!isApt) {
      wallR = 0.604; wallG = 0.204; wallB = 0.071; // 일반 주택: 적벽돌 (#9a3412)
    }

    // 옥상 지붕 색상
    let roofR = 0.180, roofG = 0.353, roofB = 0.267; // 우레탄 세이지 그린 (#2e5a44)
    if (isApt || totalH >= 25.0) {
      roofR = 0.392; roofG = 0.455; roofB = 0.545; // 아파트/고층: 웨더링 웜 그레이 (#64748b)
    } else if (isComm || totalH >= 9.0) {
      roofR = 0.180; roofG = 0.353; roofB = 0.267; // 상가: 세이지 그린 (#2e5a44)
    } else {
      roofR = 0.486; roofG = 0.176; roofB = 0.071; // 저층 주택: 테라코타 브라운 (#7c2d12)
    }

    // 기단부(Podium) 색상: 다크 화강석 그레이 (#64748b)
    const podiumR = 0.392, podiumG = 0.455, podiumB = 0.545;
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
        // Earcut에서 Holes는 CW(시계방향, signedArea < 0) 규격
        if (signedArea(hPts) > 0) {
          hPts.reverse();
          rawHole.reverse();
        }
        holesPts.push(hPts);
        rawHolesRings.push(rawHole);
      }

      // 최장 벽면 길이 산출 (측벽 코어 판정용)
      let maxEdgeLen = 0;
      for (let i = 0; i < outerPts.length; i++) {
        const next = (i + 1) % outerPts.length;
        const edx = outerPts[next].x - outerPts[i].x;
        const edy = outerPts[next].y - outerPts[i].y;
        const elen = Math.sqrt(edx * edx + edy * edy);
        if (elen > maxEdgeLen) maxEdgeLen = elen;
      }

      // -----------------------------------------------------------------------
      // [1. 기단부(0~3.5m) + 본동 외벽(3.5m~H)] 외벽 압출 (외부 링 + 내부 중정 링)
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

          // 법선 벡터: outer는 외향, hole은 내부 중정 향
          let nx = edgeDy / segLen;
          let nz = -edgeDx / segLen;
          if (isHole) {
            nx = -nx;
            nz = -nz;
          }

          // 아파트 측벽 판정
          let partType = 0.0;
          if (!isHole && isApt && floors >= 10.0 && maxEdgeLen >= 25.0) {
            if (segLen <= 16.0 || segLen <= maxEdgeLen * 0.45) {
              partType = 3.0; // 3=측벽 수직 코어
            }
          }

          const dem0 = { u: (c1[0] - minLng) / rangeLng, v: (c1[1] - minLat) / rangeLat };
          const dem1 = { u: (c2[0] - minLng) / rangeLng, v: (c2[1] - minLat) / rangeLat };

          const u0 = cumLength / WINDOW_BAY_WIDTH;
          const u1 = (cumLength + segLen) / WINDOW_BAY_WIDTH;

          // (a) Section 1: 기단부 (0 ~ 3.5m)
          const vBase0 = 0.0;
          const vPodiumTop = podiumH / STORY_HEIGHT;

          addQuadVertices(
            masterPositions, masterNormals, masterUvs, masterColors,
            masterBuildingData, masterDemCoords,
            { x: p1.x, y: 0, z: -p1.y },
            { x: p2.x, y: 0, z: -p2.y },
            { x: p2.x, y: podiumH, z: -p2.y },
            { x: p1.x, y: podiumH, z: -p1.y },
            nx, 0, -nz,
            { u: u0, v: vBase0 },
            { u: u1, v: vBase0 },
            { u: u1, v: vPodiumTop },
            { u: u0, v: vPodiumTop },
            bldType,
            floors,
            4.0, // partType: 4=기단부 화강석
            segLen,
            dem0, dem1,
            podiumR, podiumG, podiumB
          );

          // (b) Section 2: 본동 외벽 (3.5m ~ H)
          if (totalH > podiumH) {
            const vWallTop = totalH / STORY_HEIGHT;
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1.x, y: podiumH, z: -p1.y },
              { x: p2.x, y: podiumH, z: -p2.y },
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
              segLen,
              dem0, dem1,
              wallR, wallG, wallB
            );
          }

          // 외곽 링에 대해 접지 그림자 및 태양광 투영 그림자 생성
          if (!isHole) {
            const aoWidth = Math.max(2.5, Math.min(4.5, totalH * 0.08 + 2.0));
            addShadowQuad(
              shadowPositions, shadowColors,
              { x: p1.x, y: 0.02, z: -p1.y, a: 0.78 },
              { x: p2.x, y: 0.02, z: -p2.y, a: 0.78 },
              { x: p2.x + nx * aoWidth, y: 0.015, z: -(p2.y - nz * aoWidth), a: 0.0 },
              { x: p1.x + nx * aoWidth, y: 0.015, z: -(p1.y - nz * aoWidth), a: 0.0 },
              0.008, 0.024, 0.090
            );

            if (isNearDetail) {
              addShadowQuad(
                shadowPositions, shadowColors,
                { x: p1.x, y: 0.025, z: -p1.y, a: 0.88 },
                { x: p2.x, y: 0.025, z: -p2.y, a: 0.88 },
                { x: p2.x + nx * 0.6, y: 0.022, z: -(p2.y - nz * 0.6), a: 0.25 },
                { x: p1.x + nx * 0.6, y: 0.022, z: -(p1.y - nz * 0.6), a: 0.25 },
                0.005, 0.012, 0.040
              );
            }

            const nDotL = nx * sX + (-nz) * sZ;
            if (nDotL < 0.20 && totalH >= 4.0) {
              addShadowQuad(
                shadowPositions, shadowColors,
                { x: p1.x, y: 0.02, z: -p1.y, a: 0.45 },
                { x: p2.x, y: 0.02, z: -p2.y, a: 0.45 },
                { x: p2.x + dropDx, y: 0.015, z: -p2.y + dropDz, a: 0.45 },
                { x: p1.x + dropDx, y: 0.015, z: -p1.y + dropDz, a: 0.45 },
                0.059, 0.090, 0.165
              );
            }
          }

          cumLength += segLen;
        }
      }

      // -----------------------------------------------------------------------
      // [2. 옥상 난간 (Parapet, 두께 0.3m, 높이 0.9m)]
      // -----------------------------------------------------------------------
      const oLen = outerPts.length;
      for (let i = 0; i < oLen; i++) {
        const nextIdx = (i + 1) % oLen;
        const p1 = outerPts[i];
        const p2 = outerPts[nextIdx];
        const c1 = rawOuterRing[i];
        const c2 = rawOuterRing[nextIdx];

        const edgeDx = p2.x - p1.x;
        const edgeDy = p2.y - p1.y;
        const segLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
        if (segLen < 0.1) continue;

        const outNx = edgeDy / segLen;
        const outNz = -edgeDx / segLen;
        const inNx = -outNx;
        const inNz = -outNz;

        // 안쪽 내벽 오프셋 (0.3m 내측)
        const p1i = { x: p1.x + inNx * PARAPET_THICKNESS, y: p1.y + inNz * PARAPET_THICKNESS };
        const p2i = { x: p2.x + inNx * PARAPET_THICKNESS, y: p2.y + inNz * PARAPET_THICKNESS };

        const dem0 = { u: (c1[0] - minLng) / rangeLng, v: (c1[1] - minLat) / rangeLat };
        const dem1 = { u: (c2[0] - minLng) / rangeLng, v: (c2[1] - minLat) / rangeLat };

        const parapetTopY = totalH + PARAPET_HEIGHT;

        // 1) 난간 외벽면 (H ~ H + 0.9m)
        addQuadVertices(
          masterPositions, masterNormals, masterUvs, masterColors,
          masterBuildingData, masterDemCoords,
          { x: p1.x, y: totalH, z: -p1.y },
          { x: p2.x, y: totalH, z: -p2.y },
          { x: p2.x, y: parapetTopY, z: -p2.y },
          { x: p1.x, y: parapetTopY, z: -p1.y },
          outNx, 0, -outNz,
          { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
          { u: segLen / WINDOW_BAY_WIDTH, v: PARAPET_HEIGHT / STORY_HEIGHT },
          { u: 0, v: PARAPET_HEIGHT / STORY_HEIGHT },
          bldType, floors, 2.0, segLen,
          dem0, dem1,
          0.58, 0.64, 0.72 // #94a3b8
        );

        // 2) 난간 상단 코핑 (두께 0.3m 상단 수평면)
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
          bldType, floors, 2.0, segLen,
          dem0, dem1,
          0.20, 0.25, 0.33 // #334155 다크 스톤 코핑
        );

        // 3) 난간 내측 벽면 (H + 0.9m ~ H, 다각형 내부 방향)
        addQuadVertices(
          masterPositions, masterNormals, masterUvs, masterColors,
          masterBuildingData, masterDemCoords,
          { x: p2i.x, y: totalH, z: -p2i.y },
          { x: p1i.x, y: totalH, z: -p1i.y },
          { x: p1i.x, y: parapetTopY, z: -p1i.y },
          { x: p2i.x, y: parapetTopY, z: -p2i.y },
          inNx, 0, -inNz,
          { u: 0, v: 0 }, { u: segLen / WINDOW_BAY_WIDTH, v: 0 },
          { u: segLen / WINDOW_BAY_WIDTH, v: PARAPET_HEIGHT / STORY_HEIGHT },
          { u: 0, v: PARAPET_HEIGHT / STORY_HEIGHT },
          bldType, floors, 2.0, segLen,
          dem0, dem1,
          0.58, 0.64, 0.72
        );
      }

      // -----------------------------------------------------------------------
      // [3. 옥상 슬래브 (Roof Slab)] earcut(flatCoords, holeIndices, 2) 정밀 삼각화
      // -----------------------------------------------------------------------
      const flatCoords: number[] = [];
      const holeIndices: number[] = [];
      const allVertsList: { pt: Point2D; raw: [number, number] }[] = [];

      // 외부 링
      for (let i = 0; i < outerPts.length; i++) {
        flatCoords.push(outerPts[i].x, outerPts[i].y);
        allVertsList.push({ pt: outerPts[i], raw: rawOuterRing[i] });
      }

      // 내부 홀 링들 (중정)
      let offset = outerPts.length;
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

      const triangles = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : null, 2);
      const roofH = totalH + 0.05;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of outerPts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const polyDiameter = Math.max(maxX - minX, maxY - minY, 1.0);

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
            masterBuildingData.push(bldType, floors, 1.0, polyDiameter); // partType: 1.0 (옥상)
          }

          masterUvs.push(v0.pt.x, v0.pt.y);
          masterUvs.push(v1.pt.x, v1.pt.y);
          masterUvs.push(v2.pt.x, v2.pt.y);

          masterDemCoords.push((v0.raw[0] - minLng) / rangeLng, (v0.raw[1] - minLat) / rangeLat);
          masterDemCoords.push((v1.raw[0] - minLng) / rangeLng, (v1.raw[1] - minLat) / rangeLat);
          masterDemCoords.push((v2.raw[0] - minLng) / rangeLng, (v2.raw[1] - minLat) / rangeLat);
        }

        // 옥상 슬래브 투영 그림자
        if (totalH >= 5.0 && (isNearDetail || totalH >= 20.0)) {
          for (let t = 0; t < triangles.length; t += 3) {
            const v0 = allVertsList[triangles[t]];
            const v1 = allVertsList[triangles[t + 1]];
            const v2 = allVertsList[triangles[t + 2]];

            addShadowTriangle(
              shadowPositions, shadowColors,
              { x: v0.pt.x + dropDx, y: 0.012, z: -v0.pt.y + dropDz, a: 0.45 },
              { x: v1.pt.x + dropDx, y: 0.012, z: -v1.pt.y + dropDz, a: 0.45 },
              { x: v2.pt.x + dropDx, y: 0.012, z: -v2.pt.y + dropDz, a: 0.45 },
              0.059, 0.090, 0.165
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
