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

  // [2단계: 건물 벽면 실제 미터(m) 길이에 맞춘 왜곡 없는 UV 타일링 규격]
  // 가로 3.2m(1세대/1스팬), 세로 3.0m(1개 층) 단위
  const WINDOW_BAY_WIDTH = 3.2;
  const STORY_HEIGHT = 3.0;
  const PODIUM_MAX_HEIGHT = 3.8;
  const PARAPET_THICKNESS = 0.35; // 옥상 난간 실측 두께 0.35m
  const PARAPET_HEIGHT = 0.9;     // 옥상 난간 실측 높이 0.9m

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

    // (c) 중대형 상업/오피스
    const isCommName =
      name.includes('타워') || name.includes('빌딩') || name.includes('센터') ||
      name.includes('상가') || name.includes('마트') || name.includes('병원') ||
      name.includes('의원') || name.includes('스퀘어') || name.includes('프라자') ||
      name.includes('호텔') || usageType.includes('commercial') || usageType.includes('office') ||
      props.bld_category === 'commercial';
    const isCommByGeometry = !isMilitary && !isApt && (approxArea >= 320 && aspectRatio < 2.0 || approxArea >= 550);
    const isComm = isCommName || isCommByGeometry;

    let totalH = explicitH;
    if (totalH <= 4.0) {
      if (isMilitary) {
        // 군 표준 병영막사 및 군수창고: 2층~3층 (7.0m~10.5m)
        const seed = Math.abs(Math.sin(cLng * 71.1 + cLat * 193.3 + approxArea)) % 1;
        const milStories = (approxArea < 200) ? 2 : Math.round(2 + seed);
        totalH = milStories * 3.5;
      } else if (isApt) {
        // 한국형 아파트 단지(원주·춘천 등): 15층~25층 (45m~75m)
        const seed = Math.abs(Math.sin(cLng * 173.31 + cLat * 317.19 + approxArea * 0.17)) % 1;
        const aptStories = Math.round(15 + seed * 10);
        totalH = aptStories * STORY_HEIGHT; // 45m ~ 75m
      } else if (isComm) {
        // 간선도로변 중대형 상업 빌딩: 4층~10층 (14m~32m)
        const seed = Math.abs(Math.sin(cLng * 93.7 + cLat * 241.3 + approxArea * 0.23)) % 1;
        const commStories = Math.round(4 + seed * 6);
        totalH = commStories * 3.2; // 13m ~ 32m
      } else {
        // 주택가 다세대 빌라/단독주택: 2층~4층 (6m~12m)
        const seed = Math.abs(Math.sin(cLng * 51.9 + cLat * 187.3 + approxArea)) % 1;
        const villaStories = approxArea < 110 ? 2 : Math.round(2 + seed * 2);
        totalH = villaStories * STORY_HEIGHT; // 6m ~ 12m
      }
    }
    totalH = Math.max(3.5, Math.min(250.0, totalH));
    const floors = rawFlr > 0 ? rawFlr : Math.max(1, Math.round(totalH / STORY_HEIGHT));
    const bldType = isApt ? 2.0 : isComm ? 1.0 : isMilitary ? 3.0 : 0.0;

    // -------------------------------------------------------------------------
    // [1. 건물 고유 ID 및 중심 좌표 기반 결정론적 난수 (Deterministic Hash)]
    // -------------------------------------------------------------------------
    const buildingSeed = Math.abs(Math.sin(cLng * 127.13 + cLat * 311.71 + approxArea * 0.057)) % 1.0;
    const seedRoof = Math.abs(Math.sin(cLng * 997.13 + cLat * 533.77 + approxArea * 0.19)) % 1.0;
    const seedGeom = Math.abs(Math.sin(cLng * 43.19 + seedRoof * 11.7 + approxArea * 0.031)) % 1.0;

    // [2. 한국 아파트·상가·주택 12종 외벽 프리셋 슬롯 및 정점 컬러 결정]
    let defaultWallSlotId = 0.0;
    let wallR = 0.92, wallG = 0.90, wallB = 0.86;

    if (isApt) {
      // 아파트 단지 4종 변주
      const aptVariant = Math.floor(buildingSeed * 4.0) % 4;
      if (aptVariant === 0) {
        defaultWallSlotId = 0.0; // apt_warm_cream (#ebe6dc)
        wallR = 0.92; wallG = 0.90; wallB = 0.86;
      } else if (aptVariant === 1) {
        defaultWallSlotId = 1.0; // apt_modern_gray (#dcdcdc)
        wallR = 0.86; wallG = 0.86; wallB = 0.86;
      } else if (aptVariant === 2) {
        defaultWallSlotId = 2.0; // apt_ivory_white (#f3f1ed)
        wallR = 0.95; wallG = 0.94; wallB = 0.93;
      } else {
        defaultWallSlotId = 3.0; // apt_glass_stone (#cbd5e1)
        wallR = 0.82; wallG = 0.85; wallB = 0.89;
      }
    } else if (isComm) {
      // 시내 상가 및 중층 빌딩 4종 변주
      const commVariant = 5.0 + (Math.floor(buildingSeed * 4.0) % 4);
      defaultWallSlotId = commVariant;
      if (commVariant === 5.0) {
        wallR = 0.88; wallG = 0.86; wallB = 0.84; // comm_granite_beige
      } else if (commVariant === 6.0) {
        wallR = 0.38; wallG = 0.42; wallB = 0.48; // comm_dark_metal (#334155)
      } else if (commVariant === 7.0) {
        wallR = 0.68; wallG = 0.32; wallB = 0.22; // comm_red_brick (#9a3412)
      } else {
        wallR = 0.75; wallG = 0.84; wallB = 0.92; // comm_curtainwall
      }
    } else if (isMilitary) {
      defaultWallSlotId = 23.0; // public_military
      wallR = 0.89; wallG = 0.90; wallB = 0.92;
    } else {
      // 저층 주택·빌라·공장 시설 4종 변주
      const resVariant = 10.0 + (Math.floor(buildingSeed * 4.0) % 4);
      defaultWallSlotId = resVariant;
      if (resVariant === 10.0) {
        wallR = 0.55; wallG = 0.23; wallB = 0.17; // villa_red_brick (#8b3a2b)
      } else if (resVariant === 11.0) {
        wallR = 0.91; wallG = 0.89; wallB = 0.85; // villa_granite (사비석 화강석)
      } else if (resVariant === 12.0) {
        wallR = 0.96; wallG = 0.94; wallB = 0.88; // house_cream (크림색 단독주택)
      } else {
        wallR = 0.78; wallG = 0.82; wallB = 0.86; // facility_panel (샌드위치 패널)
      }
    }

    // -------------------------------------------------------------------------
    // [3. 100% 초록색 지붕 폐기 -> 실제 항공사진 지붕 비율 (30%:25%:20%:15%:10%)]
    // -------------------------------------------------------------------------
    let roofSlotId = 14.0;
    let roofR = 0.47, roofG = 0.44, roofB = 0.42;

    if (isApt || totalH >= 45.0) {
      // 대단지 아파트 및 고층 건물
      if (seedRoof < 0.55) {
        roofSlotId = 14.0; roofR = 0.47; roofG = 0.44; roofB = 0.42; // roof_concrete_warmgray
      } else if (seedRoof < 0.80) {
        roofSlotId = 15.0; roofR = 0.20; roofG = 0.25; roofB = 0.33; // roof_asphalt_charcoal
      } else if (seedRoof < 0.95) {
        roofSlotId = 17.0; roofR = 0.23; roofG = 0.32; roofB = 0.29; // roof_urethane_sage
      } else {
        roofSlotId = 18.0; roofR = 0.17; roofG = 0.26; roofB = 0.34; // roof_zinc_blue
      }
    } else {
      // 저·중층 건물 전 지역: 실제 항공사진 지붕 비율 엄격 적용
      if (seedRoof < 0.30) {
        // 30%: 노후 콘크리트 슬래브 웜 그레이 (#78716c ~ #57534e)
        roofSlotId = 14.0; roofR = 0.47; roofG = 0.44; roofB = 0.42;
      } else if (seedRoof < 0.55) {
        // 25%: 어두운 아스팔트 슁글 / 차콜 그레이 (#334155 ~ #1e293b)
        roofSlotId = 15.0; roofR = 0.20; roofG = 0.25; roofB = 0.33;
      } else if (seedRoof < 0.75) {
        // 20%: 적갈색 기와 / 브라운 박공지붕 (#6b2d1f ~ #78350f)
        roofSlotId = 16.0; roofR = 0.42; roofG = 0.18; roofB = 0.12;
      } else if (seedRoof < 0.90) {
        // 15%: 물 빠진 저채도 우레탄 세이지 그린 (#3b5249, 쨍한 초록색 완전 배제)
        roofSlotId = 17.0; roofR = 0.23; roofG = 0.32; roofB = 0.29;
      } else {
        // 10%: 청회색 징크 / 네이비 강판 지붕 (#2c4257)
        roofSlotId = 18.0; roofR = 0.17; roofG = 0.26; roofB = 0.34;
      }
    }

    // -------------------------------------------------------------------------
    // [4. 지붕 입체 형태(Roof Geometry) 분기]
    // -------------------------------------------------------------------------
    const isPitchedCandidate = !isApt && !isComm && floors <= 3 && totalH <= 12.0;
    const hasGabledRoof = isPitchedCandidate && (seedGeom < 0.35);
    const hasHippedRoof = isPitchedCandidate && (seedGeom >= 0.35 && seedGeom < 0.65);
    const hasPitchedRoof = hasGabledRoof || hasHippedRoof;

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

          let nx = edgeDy / segLen;
          let nz = -edgeDx / segLen;
          if (isHole) {
            nx = -nx;
            nz = -nz;
          }

          let partType = 0.0;
          let isSideWall = false;
          if (!isHole && isApt && floors >= 7.0 && maxEdgeLen >= 18.0) {
            if (segLen <= 16.0 || segLen <= maxEdgeLen * 0.45) {
              partType = 3.0; // 3=측벽 수직 코어
              isSideWall = true;
            }
          }

          const currentWallSlot = (isApt && isSideWall) ? 4.0 : defaultWallSlotId; // 4=apt_side
          // 상업/근린생활: 9=comm_ground_shop | 아파트/다세대: 23=apt_pilotis_lobby (어두운 화강석 필로티/공동현관)
          const currentPodiumSlot = isComm ? 9.0 : 23.0;

          const dem0 = { u: (c1[0] - minLng) / rangeLng, v: (c1[1] - minLat) / rangeLat };
          const dem1 = { u: (c2[0] - minLng) / rangeLng, v: (c2[1] - minLat) / rangeLat };

          let u0 = cumLength / WINDOW_BAY_WIDTH;
          let u1 = (cumLength + segLen) / WINDOW_BAY_WIDTH;
          if (isSideWall) {
            u0 = 0.0;
            u1 = 1.0;
          }

          // (a) 1층 기단부 (0 ~ 3.8m)
          const vBase0 = 0.0;
          const vPodiumTop = podiumH / STORY_HEIGHT;
          const curPodiumR = isComm ? 0.16 : 0.20;
          const curPodiumG = isComm ? 0.20 : 0.24;
          const curPodiumB = isComm ? 0.26 : 0.30;

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
            4.0, // partType: 4=기단부
            currentPodiumSlot,
            dem0, dem1,
            curPodiumR, curPodiumG, curPodiumB
          );

          // (b) 본동 외벽 (3.8m ~ H) 및 최상층 0.4m 두겁석(Cornice) 분리
          const corniceH = 0.4;
          if (totalH > podiumH + corniceH) {
            const wallH = totalH - corniceH;
            const vWallTop = wallH / STORY_HEIGHT;
            addQuadVertices(
              masterPositions, masterNormals, masterUvs, masterColors,
              masterBuildingData, masterDemCoords,
              { x: p1.x, y: podiumH, z: -p1.y },
              { x: p2.x, y: podiumH, z: -p2.y },
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

            // (c) 최상층 0.4m 두겁석 (Cornice 띠 - 선명한 화이트 콘크리트 마감)
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
          } else if (totalH > podiumH) {
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
              currentWallSlot,
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

      // Bounding box for roof geometries
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of outerPts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const bW = maxX - minX;
      const bD = maxY - minY;
      const demMid = { u: (rawOuterRing[0][0] - minLng) / rangeLng, v: (rawOuterRing[0][1] - minLat) / rangeLat };

      // -----------------------------------------------------------------------
      // [2. 평지붕(Flat Roof) 분기: 난간(Parapet) + 옥상 슬래브 + 엘리베이터 옥탑]
      // -----------------------------------------------------------------------
      if (!hasPitchedRoof) {
        // (a) 가변 옥상 난간 (Parapet, 높이 0.8m ~ 1.25m)
        const parapetH = 0.8 + ((buildingSeed * 73.19) % 1.0) * 0.45;
        const parapetSlotId = seedGeom < 0.6 ? 21.0 : 22.0; // 21=parapet_concrete, 22=parapet_dark
        const parapetTopY = totalH + parapetH;

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
            roofR * 0.52, roofG * 0.52, roofB * 0.52 // 구석 앰비언트 오클루전 그림자 톤
          );
        }

        // (b) 옥상 슬래브 (Roof Slab) earcut 삼각화
        const flatCoords: number[] = [];
        const holeIndices: number[] = [];
        const allVertsList: { pt: Point2D; raw: [number, number] }[] = [];

        for (let i = 0; i < outerPts.length; i++) {
          flatCoords.push(outerPts[i].x, outerPts[i].y);
          allVertsList.push({ pt: outerPts[i], raw: rawOuterRing[i] });
        }

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

        // (c) 엘리베이터 옥탑방 (Penthouse): 위치 다양성 및 복수 코어 배치
        if (floors >= 4 || totalH >= 12.0) {
          let cx = 0, cy = 0;
          for (const p of outerPts) {
            cx += p.x;
            cy += p.y;
          }
          cx /= outerPts.length;
          cy /= outerPts.length;

          const boxW = Math.max(3.2, Math.min(bW * 0.35, 11.0));
          const boxD = Math.max(3.2, Math.min(bD * 0.35, 11.0));
          const hw = boxW * 0.5;
          const hd = boxD * 0.5;

          const seedPent = (buildingSeed * 89.23) % 1.0;
          const pHouseH = 2.6 + ((buildingSeed * 103.7) % 1.0) * 0.9;
          const pHouseTop = roofH + pHouseH;
          const pHouseSlot = seedPent < 0.5 ? 19.0 : 20.0; // 19=penthouse_wall, 20=penthouse_metal

          // 대형 판상형 건물(bW >= 36m)은 2개 계단실 코어 분할 배치, 그 외는 중앙/좌/우 편심 배치
          const coreOffsets: { ox: number; oy: number }[] = [];
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
          }
        }
      }

      // -----------------------------------------------------------------------
      // [3. 경사지붕(Pitched Roof) 분기: 박공지붕(Gabled) & 우진각지붕(Hipped)]
      // -----------------------------------------------------------------------
      if (hasPitchedRoof) {
        const ridgeH = totalH + Math.min(2.5, Math.min(bW, bD) * 0.32 + 1.2);

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
