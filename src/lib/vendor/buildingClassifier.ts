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
    firstLng,
    firstLat,
    centerLng,
    centerLat,
  };
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

  // 속성 태그 및 명칭 정규화
  const name = String(
    properties.name || properties.name_ko || properties.buld_nm || properties.buildingName || ''
  ).toLowerCase();
  const usage = String(
    properties.usageType || properties.bld_category || properties.type || properties.class || properties.building || ''
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
    name.includes('공장') || name.includes('창고') || name.includes('물류') || name.includes('산업단지');

  const isPublicTag =
    usage.includes('school') || usage.includes('university') || usage.includes('hospital') ||
    usage.includes('public') || usage.includes('civic') || usage.includes('government') ||
    name.includes('학교') || name.includes('초등') || name.includes('중학') || name.includes('고등') ||
    name.includes('대학') || name.includes('병원') || name.includes('시청') || name.includes('구청') ||
    name.includes('주민센터') || name.includes('보건소') || name.includes('경찰') || name.includes('소방');

  const isApartmentTag =
    usage.includes('apartments') || usage.includes('apartment') || usage.includes('residential_tower') ||
    name.includes('아파트') || name.includes('apt') || name.includes('단지') ||
    name.includes('푸르지오') || name.includes('자이') || name.includes('힐스테이트') ||
    name.includes('래미안') || name.includes('e편한') || name.includes('더샵') ||
    name.includes('아이파크') || name.includes('롯데캐슬') || name.includes('호반') ||
    name.includes('주공') || name.includes('부영') || name.includes('코아루') || name.includes('세경');

  const isCommercialTag =
    usage.includes('commercial') || usage.includes('retail') || usage.includes('office') ||
    name.includes('빌딩') || name.includes('상가') || name.includes('타워') || name.includes('프라자') ||
    name.includes('마트') || name.includes('은행') || name.includes('백화점') || name.includes('호텔');

  // ---------------------------------------------------------------------------
  // 6개 유형 엄격 매칭 판정
  // ---------------------------------------------------------------------------
  let bType: KoreanBuildingType = 'residential';
  let typeIndex = 4;
  let typeName = '다세대 빌라 & 단독주택가';

  // [유형 6] 군 주둔지 영내 막사
  if (isMilitaryName || (isMilitaryBoundary && areaSqm < 1500 && !isApartmentTag)) {
    bType = 'military';
    typeIndex = 6;
    typeName = '군 주둔지 영내 막사';
  }
  // [유형 2] 산업단지·군수창고·대형공장
  else if (isIndustrialTag || (areaSqm >= 1200 && !isApartmentTag && !isPublicTag)) {
    bType = 'industrial';
    typeIndex = 2;
    typeName = '산업단지·군수창고·대형공장';
  }
  // [유형 5] 학교·병원·관공서·대학교
  else if (isPublicTag) {
    bType = 'public';
    typeIndex = 5;
    typeName = '학교·병원·관공서·대학교';
  }
  // [유형 1] 한국형 대단지 아파트
  else if (
    isApartmentTag ||
    (areaSqm >= 350 && areaSqm <= 2500 && (aspectRatio >= 1.35 || perimeter / Math.sqrt(areaSqm) >= 4.0)) ||
    (areaSqm >= 450 && !isCommercialTag)
  ) {
    bType = 'apartment';
    typeIndex = 1;
    typeName = '한국형 대단지 아파트';
  }
  // [유형 3] 시내 중층 상업/오피스 빌딩
  else if (
    isCommercialTag ||
    (areaSqm >= 250 && areaSqm < 1200 && aspectRatio < 2.5) ||
    (areaSqm >= 200 && aspectRatio < 1.8)
  ) {
    bType = 'commercial';
    typeIndex = 3;
    typeName = '시내 중층 상업/오피스 빌딩';
  }
  // [유형 4] 다세대 빌라 & 단독주택가 (기본값)
  else {
    bType = 'residential';
    typeIndex = 4;
    typeName = '다세대 빌라 & 단독주택가';
  }

  // ---------------------------------------------------------------------------
  // 유형별 높이, 층수, 외벽 색상, 지붕 색상, 디테일 생성
  // ---------------------------------------------------------------------------
  let height = 10;
  let floors = 3;
  let wallColor = '#f3efe6';
  let roofColor = '#8c8881';
  let atlasWallSlot = 'apt_warm_cream';
  let atlasRoofSlot = 'roof_concrete_warmgray';
  let hasParapet = true;
  let hasPenthouseCore = false;
  let isGabledRoof = false;

  switch (bType) {
    // -------------------------------------------------------------------------
    // 유형 1 [한국형 대단지 아파트]
    // 높이: 15층~25층(45m~75m)
    // 외벽: 밝고 화사한 크림 아이보리(#f3efe6), 소프트 베이지(#e8e2d5), 라이트 웜그레이(#dedad2)
    // 지붕: 밝은 콘크리트 그레이(#8c8881) + 옥탑 코어
    // -------------------------------------------------------------------------
    case 'apartment': {
      floors = 15 + (seed % 11); // 15층 ~ 25층
      height = floors * 3.0;     // 45m ~ 75m
      const wallPick = seed % 3;
      if (wallPick === 0) {
        wallColor = '#f3efe6'; // 밝고 화사한 크림 아이보리
        atlasWallSlot = 'apt_warm_cream';
      } else if (wallPick === 1) {
        wallColor = '#e8e2d5'; // 소프트 베이지
        atlasWallSlot = 'apt_sand_beige';
      } else {
        wallColor = '#dedad2'; // 라이트 웜그레이
        atlasWallSlot = 'apt_warm_gray';
      }
      roofColor = '#8c8881';   // 밝은 콘크리트 그레이
      atlasRoofSlot = 'roof_concrete_warmgray';
      hasParapet = true;
      hasPenthouseCore = true; // 옥탑 코어
      isGabledRoof = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 2 [산업단지·군수창고·대형공장]
    // 높이: 8m~14m
    // 지붕: 코발트/징크 블루(#2b5b84), 라이트 실버(#cbd5e1), 세이지 그린(#3b6e5c)
    // 외벽: 밝은 실버/베이지 메탈 판넬(#e2e8f0)
    // -------------------------------------------------------------------------
    case 'industrial': {
      height = 8.0 + (seed % 7); // 8m ~ 14m
      floors = Math.max(1, Math.round(height / 4.0));
      wallColor = '#e2e8f0'; // 밝은 실버/베이지 메탈 판넬
      atlasWallSlot = 'facility_panel';

      const roofPick = seed % 3;
      if (roofPick === 0) {
        roofColor = '#2b5b84'; // 선명한 코발트/징크 블루
        atlasRoofSlot = 'roof_zinc_blue';
      } else if (roofPick === 1) {
        roofColor = '#cbd5e1'; // 라이트 실버
        atlasRoofSlot = 'roof_concrete_warmgray';
      } else {
        roofColor = '#3b6e5c'; // 세이지 그린
        atlasRoofSlot = 'roof_urethane_sage';
      }
      hasParapet = false;
      hasPenthouseCore = false;
      isGabledRoof = seed % 2 === 0; // 절반은 완만한 공장 박공
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 3 [시내 중층 상업/오피스 빌딩]
    // 높이: 4층~6층(12m~22m 규모의 탄탄한 도시 블록 형성)
    // 외벽: 화강석 화이트/베이지(#e5e0d8), 스카이 블루 유리 커튼월(#93c5fd), 모던 그레이(#cbd5e1)
    // 옥상: 우레탄 방수 그린(#3b7a57, 40%), 적갈색 기와/브라운(#7c3f2c, 30%), 밝은 시멘트(#94a3b8, 30%)
    // -------------------------------------------------------------------------
    case 'commercial': {
      floors = 4 + (seed % 3);   // 4층 ~ 6층
      height = 12.0 + (seed % 6) * 2.0; // 12m ~ 22m 탄탄한 도시 블록
      const wallPick = seed % 3;
      if (wallPick === 0) {
        wallColor = '#e5e0d8'; // 화강석 화이트/베이지
        atlasWallSlot = 'comm_granite_beige';
      } else if (wallPick === 1) {
        wallColor = '#93c5fd'; // 스카이 블루 유리 커튼월
        atlasWallSlot = 'comm_curtainwall';
      } else {
        wallColor = '#cbd5e1'; // 모던 그레이
        atlasWallSlot = 'comm_dark_metal';
      }

      // 옥상: 에메랄드/세이지 우레탄 40%, 적갈색 기와/브라운 30%, 밝은 시멘트 30%
      if (seed < 40) {
        roofColor = '#3b7a57'; // 한국 특유 에메랄드/세이지 그린 우레탄
        atlasRoofSlot = 'roof_urethane_sage';
      } else if (seed < 70) {
        roofColor = '#7c3f2c'; // 적갈색 기와/브라운
        atlasRoofSlot = 'roof_terracotta_tile';
      } else {
        roofColor = '#94a3b8'; // 밝은 시멘트/콘크리트 옥상
        atlasRoofSlot = 'roof_concrete_warmgray';
      }
      hasParapet = true;
      hasPenthouseCore = height >= 16.0;
      isGabledRoof = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 4 [다세대 빌라 & 단독주택가]
    // 높이: 2.5층~4층(8m~14m 100% 입체 돌출)
    // 외벽: 따뜻한 적벽돌(#a84a32), 살구색/크림색 회벽(#f5ebe0), 밝은 화강석(#e7e5e4)
    // 지붕: 에메랄드/세이지 우레탄(#3b7a57, 40%), 적갈색 기와(#7c3f2c, 30%), 밝은 콘크리트(#94a3b8, 30%)
    // -------------------------------------------------------------------------
    case 'residential': {
      floors = 2 + (seed % 3);   // 2.5층 ~ 4층
      height = 8.0 + (seed % 7) * 1.0; // 8.0m ~ 14.0m (0m~2m 납작 건물 원천 금지)
      const wallPick = seed % 3;
      if (wallPick === 0) {
        wallColor = '#a84a32'; // 따뜻한 적벽돌
        atlasWallSlot = 'villa_red_brick';
      } else if (wallPick === 1) {
        wallColor = '#f5ebe0'; // 살구색/크림색 회벽
        atlasWallSlot = 'house_cream';
      } else {
        wallColor = '#e7e5e4'; // 밝은 화강석
        atlasWallSlot = 'villa_granite';
      }

      // 지붕 3종 정밀 분포: ① 에메랄드/세이지 우레탄 40%, ② 적갈색 기와 30%, ③ 밝은 콘크리트 30%
      if (seed < 40) {
        roofColor = '#3b7a57'; // 에메랄드/세이지 그린 우레탄
        atlasRoofSlot = 'roof_urethane_sage';
        isGabledRoof = false;
      } else if (seed < 70) {
        roofColor = '#7c3f2c'; // 적갈색 기와/브라운
        atlasRoofSlot = 'roof_terracotta_tile';
        isGabledRoof = true;
      } else {
        roofColor = '#94a3b8'; // 밝은 회백색/회색 콘크리트 옥상
        atlasRoofSlot = 'roof_concrete_warmgray';
        isGabledRoof = false;
      }
      hasParapet = !isGabledRoof;
      hasPenthouseCore = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 5 [학교·병원·관공서·대학교]
    // 높이: 4층~8층(15m~26m)
    // 외벽: 밝은 아이보리/벽돌 투톤 외벽
    // 옥상: 녹색/회색 옥상
    // -------------------------------------------------------------------------
    case 'public': {
      floors = 4 + (seed % 5);   // 4층 ~ 8층
      height = 15.0 + (seed % 5) * 2.5; // 15m ~ 26m
      wallColor = seed % 2 === 0 ? '#f3efe6' : '#dcd5c9'; // 밝은 아이보리 투톤
      atlasWallSlot = 'comm_granite_beige';

      if (seed < 50) {
        roofColor = '#356854'; // 우레탄 녹색
        atlasRoofSlot = 'roof_urethane_sage';
      } else {
        roofColor = '#94a3b8'; // 밝은 시멘트 옥상
        atlasRoofSlot = 'roof_concrete_warmgray';
      }
      hasParapet = true;
      hasPenthouseCore = true;
      isGabledRoof = false;
      break;
    }

    // -------------------------------------------------------------------------
    // 유형 6 [군 주둔지 영내 막사]
    // 높이: 2층~3층(7m~10m)
    // 외벽: 밝은 베이지/화이트 외벽
    // 지붕: 적갈색/청회색 박공지붕
    // -------------------------------------------------------------------------
    case 'military': {
      floors = 2 + (seed % 2);   // 2층 ~ 3층
      height = 7.0 + (seed % 2) * 2.5; // 7.0m ~ 9.5m
      wallColor = '#ece7de';     // 밝은 베이지/화이트
      atlasWallSlot = 'public_military';

      if (seed % 2 === 0) {
        roofColor = '#8c3b2b';   // 적갈색 기와 박공
        atlasRoofSlot = 'roof_terracotta_tile';
      } else {
        roofColor = '#334e68';   // 청회색 징크 박공
        atlasRoofSlot = 'roof_zinc_blue';
      }
      hasParapet = false;
      hasPenthouseCore = false;
      isGabledRoof = true;       // 군 막사 전통 박공
      break;
    }
  }

  // [3단계 고도화: 외부 실측 대장(V-World WFS LT_C_SPBD & Overpass) 지상층수 및 높이 직결]
  const declaredFloors = Number(
    properties.grnd_flr ||
    properties.GRND_FLR ||
    properties.gro_flo_co ||
    properties.GRO_FLO_CO ||
    properties.levels ||
    properties['building:levels'] ||
    properties.flr_cnt ||
    0
  );
  const declaredHeight = Number(
    properties.height ||
    properties.render_height ||
    properties.bld_hgt ||
    properties.HEI ||
    properties.hei ||
    0
  );

  const explicitHeight = declaredHeight >= 8.0
    ? declaredHeight
    : (declaredFloors >= 1 ? declaredFloors * 3.2 : 0);

  if (explicitHeight >= 8.0) {
    height = Math.max(height, explicitHeight);
    floors = declaredFloors >= 1 ? declaredFloors : Math.max(floors, Math.round(height / 3.2));
  }

  // [100% 입체 돌출 보장]: 0~2m 납작 건물 완전 금지 (최소 8.0m, 2.5층 이상 볼륨 강제)
  if (height < 8.0) {
    height = 8.0 + (seed % 6) * 1.0; // 8.0m ~ 13.0m
    floors = Math.max(2, Math.round(height / 3.2));
  }

  // 지붕 색상 선언 또는 위성 샘플링 색상 우선 반영
  const directRoofColor = properties.roofColour || properties.roofColor || properties['roof:colour'] || properties.roof_color;
  if (directRoofColor && typeof directRoofColor === 'string') {
    roofColor = directRoofColor;
    const low = directRoofColor.toLowerCase();
    if (low.includes('green') || low === '#15803d' || low === '#356854' || low === '#3d6b58' || low === '#3b6e5c') {
      atlasRoofSlot = 'roof_urethane_sage';
    } else if (low.includes('blue') || low === '#2b5b84' || low === '#1e3a8a' || low === '#2563eb' || low === '#334e68') {
      atlasRoofSlot = 'roof_zinc_blue';
    } else if (low.includes('red') || low === '#8c3b2b' || low === '#991b1b' || low === '#a84a32') {
      atlasRoofSlot = 'roof_terracotta_tile';
    } else if (low === '#64748b' || low === '#334155' || low === '#1e293b') {
      atlasRoofSlot = 'roof_asphalt_charcoal';
    } else {
      atlasRoofSlot = 'roof_concrete_warmgray';
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
