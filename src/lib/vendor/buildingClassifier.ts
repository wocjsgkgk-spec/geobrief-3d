/**
 * lib/vendor/buildingClassifier.ts
 *
 * GitHub 오픈소스 3D 지도(OSMBuildings, F4map, Streets-GL) 벤더링 기반
 * 한국형 실사 건축물 지능형 분류 및 파라메트릭 셰이딩 엔진
 *
 * 1. 절대 실패하지 않는 좌표 정밀 해시(Coordinate Seed):
 *    Math.abs(Math.floor(lng * 100000 + lat * 100000)) % 100 -> 0 ~ 99 고유 시드
 * 2. Shoelace 면적(area), 둘레(perimeter), 장단축 비율(aspectRatio) 기반 한국 실제 건물 유형 6종 분류
 */

export type KoreanBuildingType =
  | 'apartment'    // 유형 1: 한국형 대단지 아파트 (15~25층, 45~75m)
  | 'industrial'   // 유형 2: 산업단지·군수창고·대형공장 (8~14m, 코발트블루/실버/세이지)
  | 'commercial'   // 유형 3: 시내 중층 상업/오피스 빌딩 (4~10층, 14~32m, 우레탄 50% / 시멘트 50%)
  | 'residential'  // 유형 4: 다세대 빌라 & 단독주택가 (2~4층, 6.5~12m, 적벽돌/회벽/화강석, 기와/우레탄/슬레이트)
  | 'public'       // 유형 5: 학교·병원·관공서·대학교 (4~8층, 15~26m, 아이보리/벽돌 투톤)
  | 'military';    // 유형 6: 군 주둔지 영내 막사 (2~3층, 7~10m, 베이지/화이트 + 박공지붕)

export interface ClassifiedBuildingInfo {
  type: KoreanBuildingType;
  typeIndex: number; // 1 ~ 6
  typeName: string;
  seed: number;      // 0 ~ 99
  height: number;    // m
  floors: number;
  areaSqm: number;
  perimeter: number;
  aspectRatio: number;
  minWidth?: number;
  maxLength?: number;
  wallColor: string;
  wallColorRgb: [number, number, number];
  roofColor: string;
  roofColorRgb: [number, number, number];
  atlasWallSlot: string;
  atlasRoofSlot: string;
  hasParapet: boolean;
  hasPenthouseCore: boolean;
  isGabledRoof: boolean;
}

/**
 * 16진수 색상 코드를 0~1 정규화 RGB로 변환
 */
export function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [0.9, 0.9, 0.9];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

/**
 * 정점 좌표 배열에서 신발끈 공식(Shoelace Formula) 기반 실측 투영 면적(m²) 및 둘레 계산
 */
export function calculatePolygonMetrics(coords: [number, number][]): {
  areaSqm: number;
  perimeter: number;
  aspectRatio: number;
  minWidth: number;
  maxLength: number;
  firstLng: number;
  firstLat: number;
  centerLng: number;
  centerLat: number;
} {
  const n = coords.length;
  if (!coords || n < 3) {
    return {
      areaSqm: 100,
      perimeter: 40,
      aspectRatio: 1.2,
      minWidth: 10,
      maxLength: 12,
      firstLng: 127.935,
      firstLat: 37.359,
      centerLng: 127.935,
      centerLat: 37.359,
    };
  }

  const firstLng = coords[0][0];
  const firstLat = coords[0][1];

  let sumLng = 0;
  let sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  const centerLng = sumLng / n;
  const centerLat = sumLat / n;

  // 위도에 따른 경도 1도당 미터수 계산
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const mPerLng = 111320 * cosLat;
  const mPerLat = 110574;

  let areaSum = 0;
  let perimeterSum = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = (coords[i][0] - centerLng) * mPerLng;
    const y1 = (coords[i][1] - centerLat) * mPerLat;
    const x2 = (coords[j][0] - centerLng) * mPerLng;
    const y2 = (coords[j][1] - centerLat) * mPerLat;

    areaSum += x1 * y2 - x2 * y1;
    perimeterSum += Math.hypot(x2 - x1, y2 - y1);

    if (x1 < minX) minX = x1;
    if (x1 > maxX) maxX = x1;
    if (y1 < minY) minY = y1;
    if (y1 > maxY) maxY = y1;
  }

  const areaSqm = Math.max(10, Math.abs(areaSum) * 0.5);
  const perimeter = Math.max(10, perimeterSum);

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const maxSpan = Math.max(spanX, spanY);
  const minSpan = Math.min(spanX, spanY);
  const aspectRatio = maxSpan / Math.max(1, minSpan);

  return {
    areaSqm,
    perimeter,
    aspectRatio,
    minWidth: minSpan,
    maxLength: maxSpan,
    firstLng,
    firstLat,
    centerLng,
    centerLat,
  };
}

// -----------------------------------------------------------------------------
// [강원권 주요 아파트 단지 POI 앵커 및 250m 반경 공간 색인]
// -----------------------------------------------------------------------------
export interface ApartmentPoiAnchor {
  name: string;
  lng: number;
  lat: number;
  radiusMeters: number;
}

export const APARTMENT_POI_ANCHORS: ApartmentPoiAnchor[] = [
  { name: '청솔아파트', lng: 127.9585, lat: 37.3250, radiusMeters: 300 },
  { name: '동보렉스', lng: 127.9535, lat: 37.3245, radiusMeters: 280 },
  { name: '중앙하이츠', lng: 127.9505, lat: 37.3265, radiusMeters: 280 },
  { name: '단구아이파크', lng: 127.9515, lat: 37.3355, radiusMeters: 300 },
  { name: '성일아파트', lng: 127.9450, lat: 37.3280, radiusMeters: 280 },
  { name: '현진에버빌', lng: 127.9555, lat: 37.3275, radiusMeters: 320 },
  { name: '단구한신휴플러스', lng: 127.9520, lat: 37.3300, radiusMeters: 300 },
  { name: '구곡주공아파트', lng: 127.9570, lat: 37.3220, radiusMeters: 300 },
  { name: '세경아파트', lng: 127.9490, lat: 37.3330, radiusMeters: 280 },
  { name: '대림e편한세상', lng: 127.9475, lat: 37.3325, radiusMeters: 300 },
  { name: '삼호아파트', lng: 127.9360, lat: 37.3620, radiusMeters: 280 },
  { name: '우산현대아파트', lng: 127.9320, lat: 37.3660, radiusMeters: 300 },
  { name: '무실주공', lng: 127.9260, lat: 37.3360, radiusMeters: 300 },
  { name: '무실e편한세상', lng: 127.9230, lat: 37.3340, radiusMeters: 300 },
  { name: '단계이안', lng: 127.9310, lat: 37.3520, radiusMeters: 300 },
  { name: '원주푸르지오', lng: 127.9340, lat: 37.3470, radiusMeters: 300 },
  { name: '태장주공', lng: 127.9610, lat: 37.3780, radiusMeters: 300 },
  { name: '반곡아이파크', lng: 127.9780, lat: 37.3280, radiusMeters: 300 },
  { name: '혁신중흥S클래스', lng: 127.9820, lat: 37.3230, radiusMeters: 300 },
];

export const APT_KEYWORDS = [
  '아파트', '타운', '맨션', '빌라트', '아이파크', '에버빌', '하이츠', '렉스',
  '주공', '부영', '롯데', '현대', 'e편한세상', 'e편한', '푸르지오', '자이', '더샵',
  '청솔', '동보', '성일', '한신', '세경', '삼호', '코아루', '호반', '센트럴', '단지',
  'apt', 'apartment'
];

export function isNearApartmentAnchor(lng: number, lat: number): boolean {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const mPerLng = 111320 * cosLat;
  const mPerLat = 110574;
  for (let i = 0; i < APARTMENT_POI_ANCHORS.length; i++) {
    const a = APARTMENT_POI_ANCHORS[i];
    const dx = (lng - a.lng) * mPerLng;
    const dy = (lat - a.lat) * mPerLat;
    if (dx * dx + dy * dy <= a.radiusMeters * a.radiusMeters) {
      return true;
    }
  }
  return false;
}

/**
 * 절대 실패하지 않는 좌표·면적·형상 기반 한국형 건축물 분류기
 */
export function classifyBuildingWithVendor(
  coords: [number, number][],
  properties: Record<string, any> = {}
): ClassifiedBuildingInfo {
  const metrics = calculatePolygonMetrics(coords);
  const { areaSqm, perimeter, aspectRatio, firstLng, firstLat, centerLng, centerLat } = metrics;

  // 1. 고유 시드 생성 (옆 건물과 절대 똑같아지지 않는 0 ~ 99 정수 해시)
  const seed = Math.abs(Math.floor(firstLng * 100000 + firstLat * 100000)) % 100;

  // [요구사항 2] 연속지적도 필지, 용도지역 구역, 공원/단지(landuse) 경계 및 바닥면적 4,500㎡ 초과 거대 구역 3D 압출 즉시 차단
  const isNonBuildingTag =
    properties.is_non_building === true ||
    properties.is_site_boundary === true ||
    Boolean(properties.UQ111 || properties.UQ111_NM || properties.uq111 || properties.zoneName || properties.zone_nm || properties.spfc_nm || properties.spfc_cd) ||
    Boolean(properties.landuse || properties.leisure || properties.boundary || properties.admin_level || properties.natural) ||
    (Boolean(properties.pnu || properties.jimok || properties.jibun) &&
      !properties.bd_mgt_sn &&
      !properties.buld_nm &&
      !properties.bldNm &&
      !properties.buildingName &&
      !properties.grnd_flr &&
      !properties.gro_flo_co &&
      !properties.grndFlrCnt &&
      !properties.hei &&
      !properties.heit &&
      !properties.height);

  if (isNonBuildingTag || areaSqm > 4500) {
    return {
      type: 'residential',
      typeIndex: 0,
      typeName: '부지/필지 경계 (3D 압출 제외)',
      seed,
      height: 0,
      floors: 0,
      areaSqm,
      perimeter,
      aspectRatio,
      wallColor: '#dfd9ce',
      wallColorRgb: [0.87, 0.85, 0.81],
      roofColor: '#78716c',
      roofColorRgb: [0.47, 0.44, 0.42],
      atlasWallSlot: 'apt_warm_gray',
      atlasRoofSlot: 'roof_concrete_warmgray',
      hasParapet: false,
      hasPenthouseCore: false,
      isGabledRoof: false,
    };
  }

  // 속성 태그 및 명칭 정규화
  const name = String(
    properties.name || properties.name_ko || properties.buld_nm || properties.buildingName || properties.bldNm || ''
  ).toLowerCase();
  const usage = String(
    properties.usageType || properties.bld_category || properties.type || properties.class || properties.building || ''
  ).toLowerCase();
  const zone = String(
    properties.zoneName || properties.zone_nm || properties.spfc_nm || properties.UQ111_NM ||
    properties.uq111 || properties.landuse || properties.zoning || properties.zone || ''
  ).toLowerCase();
  const mainPurps = String(
    properties.mainPurpsCdNm || properties.main_purps_nm || properties.mainPurps || properties.bdtyp_cd || ''
  ).toLowerCase();

  // 원주 군부대(1군지사 우산동, 캠프롱 태장동) 좌표 바운드
  const isWonju1GunJisa = centerLat >= 37.355 && centerLat <= 37.375 && centerLng >= 127.930 && centerLng <= 127.948;
  const isWonjuCampLong = centerLat >= 37.370 && centerLat <= 37.390 && centerLng >= 127.945 && centerLng <= 127.965;
  const isMilitaryBoundary = isWonju1GunJisa || isWonjuCampLong || properties.isMilitaryOrPublic === true;

  const isMilitaryName =
    name.includes('부대') || name.includes('군') || name.includes('막사') ||
    name.includes('병영') || name.includes('위병소') || name.includes('사령부') ||
    usage.includes('military') || usage.includes('barracks');

  const isIndustrialTag =
    usage.includes('industrial') || usage.includes('warehouse') || usage.includes('factory') ||
    name.includes('공장') || name.includes('창고') || name.includes('물류') || name.includes('산업단지') ||
    mainPurps.includes('공장') || mainPurps.includes('창고') || zone.includes('공업') || zone.includes('산업');

  const isPublicTag =
    usage.includes('school') || usage.includes('university') || usage.includes('hospital') ||
    usage.includes('public') || usage.includes('civic') || usage.includes('government') ||
    name.includes('학교') || name.includes('초등') || name.includes('중학') || name.includes('고등') ||
    name.includes('대학') || name.includes('병원') || name.includes('시청') || name.includes('구청') ||
    name.includes('주민센터') || name.includes('보건소') || name.includes('경찰') || name.includes('소방') ||
    mainPurps.includes('교육') || mainPurps.includes('공공') || mainPurps.includes('의료');

  const isNearAptAnchor = isNearApartmentAnchor(centerLng, centerLat);
  const isAptKeyword = APT_KEYWORDS.some((kw) => name.includes(kw));

  const isExplicitAptRegister =
    mainPurps.includes('아파트') ||
    (mainPurps.includes('공동주택') && !mainPurps.includes('다세대') && !mainPurps.includes('연립') && !mainPurps.includes('기숙사'));

  const isResidentialTag =
    usage.includes('house') || usage.includes('residential') || usage.includes('detached') ||
    name.includes('주택') || name.includes('빌라') || name.includes('원룸') || name.includes('다가구') || name.includes('다세대') ||
    mainPurps.includes('단독주택') || mainPurps.includes('다세대') || mainPurps.includes('연립');

  // 단지 내부 부속 소형 건물 (상가동, 경비실, 관리소, 어린이집 등 area < 400㎡)
  const isAuxiliaryInApt =
    !isResidentialTag &&
    (isAptKeyword || isExplicitAptRegister) &&
    areaSqm < 400 &&
    (
      name.includes('아파트상가') || name.includes('단지내상가') || name.includes('단지상가') ||
      name.includes('경비') || name.includes('관리실') || name.includes('관리사무') ||
      name.includes('어린이집') || name.includes('유치원') || name.includes('노인정') ||
      name.includes('복지관') || (name.includes('상가') && isAptKeyword)
    );

  // [진짜 아파트 동] 바닥면적 450㎡ 이상이면서 (장단축비율 2.2 이상인 판상형/ㄱ자형/타워형이거나 건축물대장 공동주택(아파트))
  const isTrueApartmentBlock =
    areaSqm >= 450 &&
    !isAuxiliaryInApt &&
    (
      isExplicitAptRegister ||
      (aspectRatio >= 2.2 && (isNearAptAnchor || isAptKeyword || zone.includes('2종') || zone.includes('3종') || zone.includes('제2종') || zone.includes('제3종'))) ||
      (isAptKeyword && areaSqm >= 500)
    );

  const isCommercialTag =
    usage.includes('commercial') || usage.includes('retail') || usage.includes('office') ||
    name.includes('빌딩') || name.includes('상가') || name.includes('타워') || name.includes('프라자') ||
    name.includes('마트') || name.includes('은행') || name.includes('백화점') || name.includes('호텔') ||
    mainPurps.includes('근린생활') || mainPurps.includes('업무') || mainPurps.includes('판매') ||
    zone.includes('상업') || zone.includes('준주거');

  // ---------------------------------------------------------------------------
  // 6개 유형 엄격 매칭 판정 (건축HUB 표제부 + 용도지역 UQ111 융합)
  // ---------------------------------------------------------------------------
  let bType: KoreanBuildingType = 'residential';
  let typeIndex = 4;
  let typeName = '다세대 빌라 & 단독주택가';

  // [유형 6] 군 주둔지 영내 막사
  if (isMilitaryName || (isMilitaryBoundary && areaSqm < 1500 && !isTrueApartmentBlock)) {
    bType = 'military';
    typeIndex = 6;
    typeName = '군 주둔지 영내 막사';
  }
  // [유형 2] 산업단지·군수창고·대형공장
  else if (isIndustrialTag || (areaSqm >= 1400 && !isTrueApartmentBlock && !isPublicTag)) {
    bType = 'industrial';
    typeIndex = 2;
    typeName = '산업단지·군수창고·대형공장';
  }
  // [유형 5] 학교·병원·관공서·대학교 (원주의료원 등)
  else if (isPublicTag) {
    bType = 'public';
    typeIndex = 5;
    typeName = '학교·병원·관공서·대학교';
  }
  // [유형 1] 진짜 한국형 대단지 아파트 동 (area >= 450㎡ & aspectRatio >= 2.2 판상형/타워형 또는 건축물대장 아파트)
  else if (isTrueApartmentBlock) {
    bType = 'apartment';
    typeIndex = 1;
    typeName = '한국형 대단지 아파트';
  }
  // [유형 3] 시내 중층 상업/오피스/근린생활 (220㎡ <= area < 550㎡ 또는 상업지역 또는 단지내 부속 상가)
  else if (
    isCommercialTag ||
    isAuxiliaryInApt ||
    zone.includes('상업') ||
    zone.includes('준주거') ||
    (areaSqm >= 220 && areaSqm < 550 && !isResidentialTag)
  ) {
    bType = 'commercial';
    typeIndex = 3;
    typeName = '시내 중층 상업/오피스 빌딩';
  }
  // [유형 4] 소형 단독주택·다세대 빌라 (area < 220㎡ 소형 필지)
  else {
    bType = 'residential';
    typeIndex = 4;
    typeName = '다세대 빌라 & 단독주택가';
  }

  // ---------------------------------------------------------------------------
  // 유형별 높이, 층수, 외벽 색상, 지붕 색상, 디테일 생성
  // ---------------------------------------------------------------------------
  let height = 8.5;
  let floors = 2;
  let wallColor = '#f3efe6';
  let roofColor = '#8c8881';
  let atlasWallSlot = 'villa_red_brick';
  let atlasRoofSlot = 'roof_terracotta_tile';
  let hasParapet = false;
  let hasPenthouseCore = false;
  let isGabledRoof = true;

  switch (bType) {
    // -------------------------------------------------------------------------
    // 유형 1 [한국형 대단지 아파트] (14층~24층, 42m~72m 고층 스카이라인)
    // - 오직 area >= 450㎡ 진짜 아파트동만 적용
    // -------------------------------------------------------------------------
    case 'apartment': {
      floors = 14 + (seed % 11); // 14층 ~ 24층
      height = 42.0 + (seed % 31) * 1.0; // 42m ~ 72m 고층 아파트 스카이라인
      const aptPick = seed % 3;
      if (aptPick === 0) {
        wallColor = '#f4efe6'; // 크림 아이보리 (#f4efe6)
        atlasWallSlot = 'apt_preset_a';
      } else if (aptPick === 1) {
        wallColor = '#e8e0d2'; // 샌드 베이지 (#e8e0d2)
        atlasWallSlot = 'apt_preset_b';
      } else {
        wallColor = '#dcd8d0'; // 라이트 웜그레이 (#dcd8d0)
        atlasWallSlot = 'apt_preset_c';
      }

      if (seed % 10 < 8) {
        roofColor = '#8c8881'; // 콘크리트 슬래브 (80%)
        atlasRoofSlot = 'roof_concrete_warmgray';
        isGabledRoof = false;
      } else {
        roofColor = '#7c3626'; // 박공 지붕 캡 (20%)
        atlasRoofSlot = 'roof_terracotta_tile';
        isGabledRoof = true;
      }
      hasParapet = !isGabledRoof;
      hasPenthouseCore = true; // 2.8m 엘리베이터/권상기실 옥탑 코어
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 2 [산업단지·군수창고·대형공장]
    // 높이: 8m~14m
    // -------------------------------------------------------------------------
    case 'industrial': {
      height = 8.0 + (seed % 7) * 1.0; // 8m ~ 14m
      floors = Math.max(1, Math.round(height / 4.0));
      if (seed % 2 === 0) {
        wallColor = '#3b82f6'; // 프리셋 M: 블루/실버 골강판
        atlasWallSlot = 'fac_preset_m';
      } else {
        wallColor = '#64748b'; // 프리셋 P: 그레이 산업플랜트
        atlasWallSlot = 'fac_preset_p';
      }

      if (seed % 10 < 6) {
        roofColor = '#1e40af'; // 코발트 블루 강판 (60%)
        atlasRoofSlot = 'roof_zinc_blue';
      } else {
        roofColor = '#8c8881'; // 은색 징크 패널 (40%)
        atlasRoofSlot = 'roof_concrete_warmgray';
      }
      hasParapet = false;
      hasPenthouseCore = false;
      isGabledRoof = seed % 2 === 0;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 3 [시내 중·저층 상가·원룸·오피스 블록]
    // - 단지 부속 건물(상가동, 경비실, 어린이집 area < 400㎡): 4m ~ 9m (1~2층)
    // - 중형 시가지 건물 (220㎡ <= area < 550㎡): 11m ~ 18m (3~5층)
    // - 5대 외벽 소재 불규칙 배분 (붉은 치장벽돌, 갈색 파벽돌, 화강석, 차콜 메탈, 반사 유리)
    // -------------------------------------------------------------------------
    case 'commercial': {
      if (isAuxiliaryInApt) {
        floors = 1 + (seed % 2); // 1층 ~ 2층
        height = 4.0 + (seed % 6) * 1.0; // 4.0m ~ 9.0m
      } else if (areaSqm < 550) {
        floors = 3 + (seed % 3); // 3층 ~ 5층
        height = 11.0 + (seed % 8) * 1.0; // 11m ~ 18m
      } else {
        floors = 4 + (seed % 4); // 4층 ~ 7층
        height = 14.0 + (seed % 10) * 1.0; // 14m ~ 23m
      }

      const commPick = seed % 5;
      if (commPick === 0) {
        wallColor = '#8c3b2b'; // ① 붉은 치장벽돌 (#8c3b2b)
        atlasWallSlot = 'villa_red_brick';
      } else if (commPick === 1) {
        wallColor = '#6e473b'; // ② 갈색 파벽돌 (#6e473b)
        atlasWallSlot = 'villa_brown_brick';
      } else if (commPick === 2) {
        wallColor = '#dcd4c6'; // ③ 밝은 화강석 베이지 타일 (#dcd4c6)
        atlasWallSlot = 'comm_granite_tile';
      } else if (commPick === 3) {
        wallColor = '#475569'; // ④ 모던 차콜 메탈 (#475569)
        atlasWallSlot = 'comm_charcoal_panel';
      } else {
        wallColor = '#64748b'; // ⑤ 스카이 블루 반사 유리 (#64748b)
        atlasWallSlot = 'comm_sky_curtain';
      }

      // 옥상 분포: 에메랄드/세이지 그린 우레탄 45%, 밝은 콘크리트 회색 35%, 테라코타 적갈색 20%
      const commRoofSeed = seed % 100;
      if (commRoofSeed < 45) {
        roofColor = '#2e6f4e'; // ① 에메랄드 우레탄 방수초록색 (45%)
        atlasRoofSlot = 'roof_urethane_sage';
      } else if (commRoofSeed < 80) {
        roofColor = '#8c8881'; // ② 밝은 시멘트 회색 (35%)
        atlasRoofSlot = 'roof_concrete_warmgray';
      } else {
        roofColor = '#7c3626'; // ③ 적갈색 테라코타 (20%)
        atlasRoofSlot = 'roof_terracotta_tile';
      }
      hasParapet = true;
      hasPenthouseCore = height >= 11.0;
      isGabledRoof = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 4 [소형 필지 단독주택·다세대 빌라]
    // -------------------------------------------------------------------------
    case 'residential': {
      floors = 2 + (seed % 2); // 2층 ~ 3층
      height = 8.0 + (seed % 6) * 1.0; // 8.0m ~ 13.0m

      const resPick = seed % 4;
      if (resPick === 0) {
        wallColor = '#8c3b2b'; // 프리셋 I: 붉은 치장벽돌 (#8c3b2b) + 백색 창틀
        atlasWallSlot = 'villa_preset_i';
      } else if (resPick === 1) {
        wallColor = '#6e473b'; // 프리셋 J: 갈색 파벽돌 (#6e473b)
        atlasWallSlot = 'villa_preset_j';
      } else if (resPick === 2) {
        wallColor = '#f5f0e6'; // 프리셋 K: 밝은 아이보리 스타코 + 박공
        atlasWallSlot = 'villa_preset_k';
      } else {
        wallColor = '#dfd8cc'; // 프리셋 L: 투톤 화강석 필로티 원룸
        atlasWallSlot = 'villa_preset_l';
      }

      // 지붕: 적갈색 기와 박공(50%), 청색 강판 박공(30%), 슬레이트 그레이(20%)
      const resRoofSeed = seed % 100;
      if (resRoofSeed < 50) {
        roofColor = '#7c3626'; // 적갈색 기와 지붕 (50%)
        atlasRoofSlot = 'roof_terracotta_tile';
        isGabledRoof = true;
      } else if (resRoofSeed < 80) {
        roofColor = '#1e40af'; // 청색 강판 지붕 (30%)
        atlasRoofSlot = 'roof_zinc_blue';
        isGabledRoof = true;
      } else {
        roofColor = '#475569'; // 슬레이트 그레이 (20%)
        atlasRoofSlot = 'comm_charcoal_panel';
        isGabledRoof = true;
      }
      hasParapet = !isGabledRoof;
      hasPenthouseCore = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 5 [학교·병원·관공서·대학교]
    // -------------------------------------------------------------------------
    case 'public': {
      floors = 4 + (seed % 5); // 4층 ~ 8층
      height = 15.0 + (seed % 5) * 2.5; // 15m ~ 26m
      if (seed % 2 === 0) {
        wallColor = '#f8fafc'; // 프리셋 O: 화이트 R&D 연구동
        atlasWallSlot = 'fac_preset_o';
      } else {
        wallColor = '#ece8df'; // 프리셋 E: 밝은 베이지 화강석
        atlasWallSlot = 'comm_preset_e';
      }

      if (seed < 45) {
        roofColor = '#3b7a57';
        atlasRoofSlot = 'roof_urethane_sage';
      } else if (seed < 80) {
        roofColor = '#8c8881';
        atlasRoofSlot = 'roof_concrete_warmgray';
      } else {
        roofColor = '#475569';
        atlasRoofSlot = 'roof_concrete_warmgray';
      }
      hasParapet = true;
      hasPenthouseCore = true;
      isGabledRoof = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 6 [군 주둔지 영내 막사]
    // -------------------------------------------------------------------------
    case 'military': {
      floors = 1 + (seed % 3);
      height = 6.5 + (seed % 5) * 1.2;
      wallColor = '#ebe3d5'; // 프리셋 N: 샌드 베이지 통합막사
      atlasWallSlot = 'fac_preset_n';

      const roofPick = seed % 3;
      if (roofPick === 0) {
        roofColor = '#7c3f2c';
        atlasRoofSlot = 'roof_terracotta_tile';
      } else if (roofPick === 1) {
        roofColor = '#285580';
        atlasRoofSlot = 'roof_zinc_blue';
      } else {
        roofColor = '#3b7a57';
        atlasRoofSlot = 'roof_urethane_sage';
      }
      hasParapet = false;
      hasPenthouseCore = false;
      isGabledRoof = true;
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // [1순위: 건축HUB 건축물대장 표제부 실측 높이(heit) 및 지상층수(grndFlrCnt) 적용]
  // ---------------------------------------------------------------------------
  const regHeit = Number(
    properties.heit ||
    properties.HEI ||
    properties.hei ||
    properties.height ||
    properties.render_height ||
    properties.bld_hgt ||
    0
  );
  const regFloors = Number(
    properties.grndFlrCnt ||
    properties.grnd_flr ||
    properties.GRND_FLR ||
    properties.gro_flo_co ||
    properties.GRO_FLO_CO ||
    properties.levels ||
    properties['building:levels'] ||
    properties.flr_cnt ||
    0
  );

  const isRealMeasured = properties.is_real_measured === true || Boolean(properties.mgmBldrgstPk);
  if (isRealMeasured && regHeit >= 3.0) {
    height = regHeit;
    floors = regFloors >= 1 ? regFloors : Math.max(1, Math.round(height / 3.3));
  } else if (regHeit >= 10.0) {
    height = regHeit;
    floors = regFloors >= 1 ? regFloors : Math.max(1, Math.round(height / 3.3));
  } else if (regFloors >= 3) {
    floors = regFloors;
    height = Math.max(10.0, regFloors * 3.3);
  }

  // ---------------------------------------------------------------------------
  // [절대 규칙 1: 세장비 제한 (Slenderness Ratio Limit)]
  // 어떤 건물이든 건물 바닥의 짧은 변 폭(minWidth) 대비 높이가 3.5배를 넘을 수 없음!
  // ---------------------------------------------------------------------------
  const minWidth = Math.max(1, metrics.minWidth || Math.sqrt(areaSqm));
  const maxAllowedBySlenderness = Math.max(8.0, minWidth * 3.5);
  if (height > maxAllowedBySlenderness) {
    height = Math.min(height, Math.max(8.0, maxAllowedBySlenderness));
    floors = Math.max(2, Math.round(height / 3.3));
  }

  // ---------------------------------------------------------------------------
  // [절대 규칙 2: 바닥 면적 280㎡ 미만 소형 건물은 절대로 고층(15m 이상) 불가!]
  // 주변에 아파트 POI가 있더라도 무조건 15m 이하로 엄격 제한!
  // ---------------------------------------------------------------------------
  if (areaSqm < 280) {
    if (height > 15.0) {
      height = Math.min(15.0, areaSqm < 220 ? (8.0 + (seed % 6) * 1.0) : (11.0 + (seed % 5) * 0.9));
      floors = Math.max(2, Math.round(height / 3.3));
    }
    if (bType === 'apartment') {
      bType = areaSqm < 220 ? 'residential' : 'commercial';
      typeName = areaSqm < 220 ? '소형 단독주택·다가구' : '중형 근린생활상가';
    }
  }

  // ---------------------------------------------------------------------------
  // [절대 규칙 3: 바닥 면적 220㎡ 미만 소형 필지는 8.0m ~ 13.5m (2~4층)]
  // ---------------------------------------------------------------------------
  if (areaSqm < 220) {
    if (height > 15.0) {
      height = 8.0 + (seed % 6) * 1.0;
      floors = 2 + (seed % 2);
    }
    if (bType === 'apartment') {
      bType = 'residential';
      typeName = '소형 단독주택·다가구';
    }
  } else if (areaSqm < 550 && !isTrueApartmentBlock) {
    // 220㎡ <= area < 550㎡ 중형 시가지: 11m ~ 18m (3~5층)
    if (height > 18.0 || height < 11.0) {
      height = 11.0 + (seed % 8) * 1.0;
      floors = 3 + (seed % 3);
    }
    if (bType === 'apartment') {
      bType = 'commercial';
      typeName = '중형 시가지 상가·빌라';
    }
  }

  // 아파트 단지 내부 소형 부속 건물 (상가, 경비실 등 area < 400㎡): 4m ~ 9m
  if (isAuxiliaryInApt) {
    height = Math.min(height, 4.0 + (seed % 6) * 1.0);
    floors = 1 + (seed % 2);
    if (bType === 'apartment') {
      bType = 'commercial';
      typeName = '단지 부속 근린상가/관리실';
    }
  }

  // [3단계: 소형 건물(50㎡ ~ 250㎡) 무실동 등 입체 복원 의무 규격: 최소 8.0m ~ 15.0m (2.5층 ~ 4층)]
  if (areaSqm >= 50 && areaSqm <= 250 && !isAuxiliaryInApt) {
    const minSmallH = 8.0 + (seed % 8) * 1.0; // 8.0m ~ 15.0m
    if (height < minSmallH) {
      height = minSmallH;
      floors = Math.max(2, Math.round(height / 3.3));
    }
  }

  // 일반 건물 최소 볼륨 보장 (0% Flat 납작화 방지: 일반 건물 6.5m, 부속 건물 4.0m)
  const minFloorCeiling = isAuxiliaryInApt ? 4.0 : (areaSqm >= 50 && areaSqm <= 250 ? 8.0 : 6.5);
  if (height < minFloorCeiling) {
    height = minFloorCeiling + (seed % 4) * 0.8;
    floors = Math.max(2, Math.round(height / 3.3));
  }

  // ---------------------------------------------------------------------------
  // [최종 높이 및 유형에 따른 외벽/지붕 텍스처 엄격 동기화]
  // ---------------------------------------------------------------------------
  if (bType === 'apartment' && height >= 25.0 && areaSqm >= 450) {
    typeName = '고층 아파트 단지';
    const aptPick = seed % 4;
    if (aptPick === 0) {
      wallColor = '#f5f2eb';
      atlasWallSlot = 'apt_preset_a';
    } else if (aptPick === 1) {
      wallColor = '#e6dec8';
      atlasWallSlot = 'apt_preset_b';
    } else if (aptPick === 2) {
      wallColor = '#d6d3cd';
      atlasWallSlot = 'apt_preset_c';
    } else {
      wallColor = '#e2dbd0';
      atlasWallSlot = 'apt_preset_d';
    }
    roofColor = '#6e6a64';
    atlasRoofSlot = 'roof_concrete_warmgray';
    hasParapet = true;
    hasPenthouseCore = true;
    isGabledRoof = false;
  } else if (bType === 'commercial' || (height >= 11.0 && bType !== 'public' && bType !== 'military')) {
    typeName = isAuxiliaryInApt ? '단지 부속 근린상가' : '시내 중층 상가·오피스 블록';
    bType = 'commercial';
    const commPick = seed % 4;
    if (commPick === 0) {
      wallColor = '#ece8df';
      atlasWallSlot = 'comm_preset_e';
    } else if (commPick === 1) {
      wallColor = '#93c5fd';
      atlasWallSlot = 'comm_preset_f';
    } else if (commPick === 2) {
      wallColor = '#6ee7b7';
      atlasWallSlot = 'comm_preset_g';
    } else {
      wallColor = '#334155';
      atlasWallSlot = 'comm_preset_h';
    }
    if (seed < 50) {
      roofColor = '#2e6f4e'; // 우레탄 초록
      atlasRoofSlot = 'roof_urethane_sage';
    } else if (seed < 75) {
      roofColor = '#7c3626'; // 테라코타
      atlasRoofSlot = 'roof_terracotta_tile';
    } else {
      roofColor = '#64748b'; // 콘크리트 슬래브
      atlasRoofSlot = 'roof_concrete_warmgray';
    }
    hasParapet = true;
    hasPenthouseCore = height >= 11.0;
    isGabledRoof = false;
  } else if (bType === 'military') {
    typeName = '군 주둔지 영내 막사';
    wallColor = '#ebe3d5';
    atlasWallSlot = 'fac_preset_n';
    isGabledRoof = true;
    hasParapet = false;
    hasPenthouseCore = false;
  } else if (bType === 'public') {
    typeName = '학교·병원·관공서';
    if (seed % 2 === 0) {
      wallColor = '#f8fafc';
      atlasWallSlot = 'fac_preset_o';
    } else {
      wallColor = '#ece8df';
      atlasWallSlot = 'comm_preset_e';
    }
    hasParapet = true;
    hasPenthouseCore = true;
    isGabledRoof = false;
  } else {
    // 저층 단독주택·다세대 빌라 (height < 11.0m)
    bType = 'residential';
    typeName = '저층 단독주택·빌라';
    const resPick = seed % 4;
    if (resPick === 0) {
      wallColor = '#9a3b26';
      atlasWallSlot = 'villa_preset_i';
    } else if (resPick === 1) {
      wallColor = '#6e473b';
      atlasWallSlot = 'villa_preset_j';
    } else if (resPick === 2) {
      wallColor = '#f3eee3';
      atlasWallSlot = 'villa_preset_k';
    } else {
      wallColor = '#d8d2c4';
      atlasWallSlot = 'villa_preset_l';
    }

    const roofPick = seed % 10;
    if (roofPick < 4) {
      roofColor = '#6e2c1b'; // 적갈색 기와
      atlasRoofSlot = 'roof_terracotta_tile';
      isGabledRoof = true;
    } else if (roofPick < 7) {
      roofColor = '#254e7a'; // 청색 슬레이트
      atlasRoofSlot = 'roof_zinc_blue';
      isGabledRoof = true;
    } else {
      roofColor = '#356854'; // 녹색 우레탄
      atlasRoofSlot = 'roof_urethane_sage';
      isGabledRoof = false;
    }
    hasParapet = !isGabledRoof;
    hasPenthouseCore = false;
  }

  // 지붕 색상 선언 또는 위성 샘플링 색상 우선 반영
  const directRoofColor = properties.roofColour || properties.roofColor || properties['roof:colour'] || properties.roof_color;
  if (directRoofColor && typeof directRoofColor === 'string') {
    roofColor = directRoofColor;
    const low = directRoofColor.toLowerCase();
    if (low.includes('green') || low === '#15803d' || low === '#3b7a57' || low === '#357a56' || low === '#32694f' || low === '#356854' || low === '#3d6b58' || low === '#3b6e5c') {
      atlasRoofSlot = 'roof_urethane_sage';
      roofColor = '#3b7a57';
    } else if (low.includes('blue') || low === '#285580' || low === '#254e7a' || low === '#2b5b84' || low === '#1e3a8a' || low === '#2563eb' || low === '#334e68') {
      atlasRoofSlot = 'roof_zinc_blue';
      roofColor = '#285580';
    } else if (low.includes('red') || low === '#7c3f2c' || low === '#7c3a27' || low === '#6e3222' || low === '#8c3b2b' || low === '#991b1b' || low === '#a84a32') {
      atlasRoofSlot = 'roof_terracotta_tile';
      roofColor = '#7c3f2c';
    } else if (low === '#6e6a64' || low === '#57534e') {
      atlasRoofSlot = 'roof_apt_slab';
      roofColor = '#6e6a64';
    } else if (low === '#8c8881' || low === '#78716c' || low === '#736f68' || low === '#94a3b8') {
      atlasRoofSlot = 'roof_concrete_warmgray';
      roofColor = '#8c8881';
    } else if (low === '#475569' || low === '#64748b' || low === '#334155' || low === '#1e293b') {
      atlasRoofSlot = 'roof_asphalt_charcoal';
      roofColor = '#475569';
    }
  }

  return {
    type: bType,
    typeIndex,
    typeName,
    seed,
    height,
    floors,
    areaSqm,
    perimeter,
    aspectRatio,
    minWidth,
    maxLength: metrics.maxLength,
    wallColor,
    wallColorRgb: hexToRgb01(wallColor),
    roofColor,
    roofColorRgb: hexToRgb01(roofColor),
    atlasWallSlot,
    atlasRoofSlot,
    hasParapet,
    hasPenthouseCore,
    isGabledRoof,
  };
}
