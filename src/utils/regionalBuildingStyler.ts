/**
 * utils/regionalBuildingStyler.ts
 *
 * [GeoBrief 3D 2단계: 강원권 4대 권역별 맞춤형 실사 건축·지붕·특수시설 렌더링 고도화 엔진]
 *
 * 1) [원주·춘천 도시/혁신도시권 (반곡동·무실동·단계동·우산동·퇴계동·석사동)]:
 *    - 공공기관/혁신도시 대형 청사: 포디움 기단부 + 유리 커튼월/알루미늄 루버 + 옥상 태양광 패널 그리드 & 조경 테라스
 *    - 대단지 브랜드 아파트: 15~29층 실측 층수 반영, 다각형 압출, 크림 베이지/웜그레이 투톤, 측벽 브랜드 도색 라인, 옥상 경사형 장식 캡 & 엘리베이터 코어
 *    - 구도심/역세권 상가 블록: 1층 어두운 화강석 쇼윈도 + 2~5층 타일/벽돌 + 차분한 세이지 그린(#2e5a44) 우레탄 방수 옥상 & 옥상 물탱크/실외기
 *
 * 2) [철원·화천·양구·인제·고성·홍천 접경 및 군사 거점권]:
 *    - 군 주둔지/유휴부지 영내 시설: 신형 통합막사(3~4층 베이지/브라운 투톤 + 청회색/적갈색 박공) & 아치형/트러스형 군수 물류창고(징크 실버/네이비 강판 지붕)
 *    - 농촌 및 읍·면 시가지: 저층 단독주택(적벽돌/크림 + 기와/청색 강판 경사지붕) & 영농 시설(반투명 곡면 비닐하우스/창고)
 *
 * 3) [강릉·동해·속초·삼척·양양 동해안권]:
 *    - 해안가 고층 리조트/호텔/오션뷰 주상복합: 화이트 프레임 + 스카이 블루 반사 통유리 발코니 파사드
 *    - 항만·산업단지 (동해항·삼척 등): 대형 물류 사일로(원통형 구조물), 공장 박공 지붕 및 컨테이너 야적장
 *
 * 4) [태백·평창·정선·영월·횡성 산악 고원권]:
 *    - 급경사 지형 깊은 기초 옹벽(Foundation Skirt -8.0m 연장)
 *    - 다설 지역 30도 급경사 박공지붕 (슬레이트/목재 톤)
 */

import { findGangwonRegionByCoords, getGangwonRegionByIdOrName, GangwonRegionPreset } from '@/constants/gangwon18Regions';

export type GangwonZoneType =
  | 'urban_innovation'   // 원주·춘천 도시/혁신도시권
  | 'border_military'    // 철원·화천·양구·인제·고성·홍천 접경/군사권
  | 'coastal_belt'       // 강릉·동해·속초·삼척·양양 동해안권
  | 'mountain_highland'; // 태백·평창·정선·영월·횡성 산악 고원권

export type GangwonBuildingCategory =
  | 'public_innovation_hq'    // 혁신도시/도심 공공기관 대형 청사
  | 'brand_apartment'         // 대단지 브랜드 아파트
  | 'commercial_old_downtown' // 구도심/역세권 근생 상가 블록
  | 'military_barracks'       // 군 주둔지 통합막사
  | 'military_depot'          // 군수 물류창고/정비창/탄약고
  | 'rural_house'             // 농촌/읍면 단독주택
  | 'rural_greenhouse'        // 영농 비닐하우스/저온저장고
  | 'coastal_resort'          // 해안가 오션뷰 리조트/호텔
  | 'coastal_port_silo'       // 항만 시멘트/곡물 사일로 및 공장
  | 'mountain_chalet';        // 산악 고원 펜션/리조트 및 목조 건축

export interface RegionalBuildingStyle {
  zone: GangwonZoneType;
  category: GangwonBuildingCategory;
  categoryLabel: string;
  height: number;
  levels: number;
  bldType: number;             // 0: 주택/농촌, 1: 상업/청사, 2: 아파트, 3: 군부대/공공, 4: 특수(리조트/사일로)
  defaultWallSlotId: number;   // V-World 스타일 아틀라스 슬롯 ID
  podiumWallSlotId: number;
  roofSlotId: number;
  parapetSlotId: number;
  wallR: number;
  wallG: number;
  wallB: number;
  roofR: number;
  roofG: number;
  roofB: number;
  podiumR: number;
  podiumG: number;
  podiumB: number;
  skirtDepth: number;          // 산악 고원 -8.0m, 일반 -5.0m
  hasCommercialSetback: boolean; // 넓은 포디움 기단부 + 인셋 타워
  hasSolarPanels: boolean;     // 옥상 태양광 패널 그리드
  hasRoofTerrace: boolean;     // 옥상 조경 테라스
  hasRoofCoreCap: boolean;     // 옥상 경사형 장식 캡 & 엘리베이터 코어 돌출
  hasWaterTank: boolean;       // 옥상 STS 원통형 물탱크 및 실외기
  roofShape: 'flat' | 'gabled' | 'hipped' | 'silo' | 'greenhouse';
  roofPitchAngle: number;      // 30도(산악), 20도(농촌/군부대), 0도(평지붕)
  isPitchedRoof: boolean;
  isCylindricalSilo: boolean;
  sideWallStripe: boolean;     // 측벽 브랜드 수직 도색 라인
}

export interface GeometryMetricsInput {
  cLng: number;
  cLat: number;
  dimMin: number;
  dimMax: number;
  approxArea: number;
  aspectRatio: number;
}

/**
 * 시·군 ID 또는 좌표로부터 4대 권역을 판정합니다.
 */
export function getGangwonZone(regionIdOrName?: string, cLng?: number, cLat?: number): GangwonZoneType {
  let reg: GangwonRegionPreset | undefined;

  if (regionIdOrName) {
    reg = getGangwonRegionByIdOrName(regionIdOrName);
  }
  if (!reg && typeof cLng === 'number' && typeof cLat === 'number') {
    reg = findGangwonRegionByCoords(cLng, cLat);
  }

  const regId = reg?.id || '';

  // 1) 원주·춘천 도시/혁신도시권
  if (regId === 'wonju' || regId === 'chuncheon') {
    return 'urban_innovation';
  }

  // 2) 철원·화천·양구·인제·고성·홍천 접경 및 군사 거점권
  if (['cheorwon', 'hwacheon', 'yanggu', 'inje', 'goseong', 'hongcheon'].includes(regId)) {
    return 'border_military';
  }

  // 3) 강릉·동해·속초·삼척·양양 동해안권
  if (['gangneung', 'donghae', 'sokcho', 'samcheok', 'yangyang'].includes(regId)) {
    return 'coastal_belt';
  }

  // 4) 태백·평창·정선·영월·횡성 산악 고원권
  if (['taebaek', 'pyeongchang', 'jeongseon', 'yeongwol', 'hoengseong'].includes(regId)) {
    return 'mountain_highland';
  }

  // 좌표 기반 폴백
  if (typeof cLng === 'number' && typeof cLat === 'number') {
    if (cLng >= 128.75) return 'coastal_belt';
    if (cLat >= 37.95) return 'border_military';
    if (cLat <= 37.55 && cLng >= 128.0) return 'mountain_highland';
    if ((cLat >= 37.25 && cLat <= 37.45 && cLng <= 128.05) || (cLat >= 37.8 && cLat <= 37.95 && cLng <= 127.85)) {
      return 'urban_innovation';
    }
  }

  return 'urban_innovation'; // 기본값
}

/**
 * 건축물 구조/용도 코드, 지오메트리 메트릭스 및 권역 정보로부터 정밀 실사 스타일을 도출합니다.
 */
export function classifyRegionalBuildingStyle(
  rawProps: Record<string, any>,
  metrics: GeometryMetricsInput,
  regionHint?: string
): RegionalBuildingStyle {
  const { cLng, cLat, dimMin, dimMax, approxArea, aspectRatio } = metrics;
  const zone = getGangwonZone(regionHint || rawProps.regionId || rawProps.admCode, cLng, cLat);

  const name = String(rawProps.name || rawProps.name_ko || rawProps.buld_nm || rawProps.buildingName || '').trim();
  const rawType = String(
    rawProps.bld_category || rawProps.usageType || rawProps.type || rawProps.building || rawProps.class ||
    rawProps.main_purps_cd_nm || rawProps.strct_cd_nm || ''
  ).toLowerCase();

  const rawLevels = Number(
    rawProps.grnd_flr || rawProps.GRND_FLR || rawProps.gro_flo_co || rawProps.GRO_FLO_CO ||
    rawProps.levels || rawProps['building:levels'] || rawProps.building_levels || 0
  );
  const rawHeight = Number(
    rawProps.height || rawProps.render_height || rawProps.hei || rawProps.HEI || rawProps.bld_hgt || 0
  );

  const seed = Math.abs(Math.sin(cLng * 93.17 + cLat * 311.41 + approxArea * 0.071)) % 1.0;
  const seedRoof = Math.abs(Math.sin(cLng * 773.13 + cLat * 513.79 + approxArea * 0.13)) % 1.0;

  // ---------------------------------------------------------------------------
  // [공통 판별 키워드]
  // ---------------------------------------------------------------------------
  const isMilitaryKeyword =
    name.includes('부대') || name.includes('군') || name.includes('막사') ||
    name.includes('병영') || name.includes('정비') || name.includes('탄약') ||
    name.includes('보급') || name.includes('사령부') || name.includes('생활관') ||
    name.includes('사단') || name.includes('연대') || name.includes('대대') ||
    name.includes('군지사') || name.includes('1군지사') || name.includes('캠프롱') ||
    name.includes('camp') || name.includes('camplong') ||
    rawType.includes('military') || rawType.includes('barracks');

  const isAptKeyword =
    name.includes('아파트') || name.includes('apt') || name.includes('단지') ||
    name.includes('푸르지오') || name.includes('자이') || name.includes('힐스테이트') ||
    name.includes('래미안') || name.includes('e편한') || name.includes('더샵') ||
    name.includes('아이파크') || name.includes('롯데캐슬') || name.includes('한신') ||
    name.includes('센트럴') || name.includes('호반') || name.includes('부영') ||
    name.includes('주공') || name.includes('코아루') || name.includes('두산') ||
    rawType.includes('apartment');

  const isPublicOrHQKeyword =
    name.includes('건강보험') || name.includes('도로교통') || name.includes('관광공사') ||
    name.includes('광해') || name.includes('국립공원') || name.includes('보훈') ||
    name.includes('시청') || name.includes('도청') || name.includes('군청') ||
    name.includes('구청') || name.includes('청사') || name.includes('혁신') ||
    name.includes('공공기관') || name.includes('법원') || name.includes('검찰') ||
    name.includes('의료원') || name.includes('대학') || name.includes('캠퍼스') ||
    name.includes('연구원') || rawType.includes('public') || rawType.includes('government');

  const isResortKeyword =
    name.includes('호텔') || name.includes('리조트') || name.includes('콘도') ||
    name.includes('오션') || name.includes('비치') || name.includes('스테이') ||
    name.includes('씨마크') || name.includes('라카이') || name.includes('세인트존스') ||
    name.includes('스카이베이') || name.includes('탑스텐') || name.includes('하이원') ||
    name.includes('알펜시아') || name.includes('용평') || name.includes('웰리힐리') ||
    name.includes('오크밸리') || name.includes('소노') || name.includes('펜션');

  const isPortIndustrialKeyword =
    name.includes('사일로') || name.includes('시멘트') || name.includes('쌍용') ||
    name.includes('한라') || name.includes('삼표') || name.includes('화력') ||
    name.includes('발전') || name.includes('항만') || name.includes('부두') ||
    name.includes('공장') || name.includes('야적장') || name.includes('물류창고') ||
    rawType.includes('industrial') || rawType.includes('port');

  const isGreenhouseKeyword =
    name.includes('비닐하우스') || name.includes('온실') || name.includes('축사') ||
    name.includes('돈사') || name.includes('우사') || name.includes('계사') ||
    name.includes('저온저장고') || (aspectRatio >= 2.8 && approxArea >= 120 && approxArea <= 650 && (rawHeight <= 4.5 || rawLevels <= 1));

  // ---------------------------------------------------------------------------
  // [1. 원주·춘천 도시/혁신도시권]
  // ---------------------------------------------------------------------------
  if (zone === 'urban_innovation') {
    // 1-0) 원주 1군지사·캠프 롱 영내 군부대 막사 및 군수 물류창고 (용마루 선이 살아있는 ㅅ자형 박공지붕)
    if (isMilitaryKeyword) {
      const isDepot = name.includes('창고') || name.includes('정비') || name.includes('보급') || name.includes('탄약') || approxArea >= 350;
      const calcFloors = rawLevels > 0 ? rawLevels : (isDepot ? 1 : Math.round(Math.max(1, Math.min(3, 1 + seed * 2))));
      const calcHeight = rawHeight > 4.0 ? rawHeight : (isDepot ? 7.5 : calcFloors * 3.5);

      return {
        zone,
        category: isDepot ? 'military_depot' : 'military_barracks',
        categoryLabel: isDepot ? '군수 물류창고·정비창' : '원주 영내 통합막사·군부대',
        height: Math.max(7.0, calcHeight),
        levels: calcFloors,
        bldType: 3.0,
        defaultWallSlotId: isDepot ? 13.0 : 23.0, // facility_panel or public_military
        podiumWallSlotId: 21.0,
        roofSlotId: isDepot ? 18.0 : (seedRoof > 0.5 ? 16.0 : 15.0),
        parapetSlotId: 21.0,
        wallR: isDepot ? 0.82 : 0.90,
        wallG: isDepot ? 0.85 : 0.88,
        wallB: isDepot ? 0.89 : 0.84,
        roofR: isDepot ? 0.16 : 0.38,
        roofG: isDepot ? 0.28 : 0.32,
        roofB: isDepot ? 0.44 : 0.30,
        podiumR: 0.38, podiumG: 0.40, podiumB: 0.42,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: false,
        hasRoofTerrace: false,
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: 'gabled', // 용마루 선이 살아있는 ㅅ자형 박공지붕
        roofPitchAngle: 20,
        isPitchedRoof: true,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 1-0b) 대형 경기장/체육시설/종합운동장/아레나 (커튼월 반사감 + 트러스 지붕 메쉬)
    const isStadiumOrArena =
      name.includes('경기장') || name.includes('체육관') || name.includes('종합운동장') ||
      name.includes('스타디움') || name.includes('아레나') || name.includes('stadium') ||
      name.includes('arena') || rawType.includes('stadium') ||
      (approxArea >= 1200 && !isAptKeyword && aspectRatio <= 2.2);

    if (isStadiumOrArena) {
      const calcHeight = rawHeight > 4.0 ? rawHeight : (26.0 + seed * 8.0);
      return {
        zone,
        category: 'coastal_resort',
        categoryLabel: '종합경기장·체육시설·트러스 돔',
        height: Math.max(24.0, Math.min(36.0, calcHeight)),
        levels: 4,
        bldType: 4.0, // 특수 경기장/타워
        defaultWallSlotId: 8.0, // comm_curtainwall (골드/실버/블루그레이 커튼월 반사감)
        podiumWallSlotId: 5.0,
        roofSlotId: 18.0, // 청회색 트러스 메탈 강판 지붕
        parapetSlotId: 22.0,
        wallR: 0.72, wallG: 0.85, wallB: 0.98,
        roofR: 0.28, roofG: 0.33, roofB: 0.41,
        podiumR: 0.35, podiumG: 0.38, podiumB: 0.42,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: true,
        hasRoofTerrace: false,
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: 'hipped', // 곡면/트러스 아치형 지붕
        roofPitchAngle: 15,
        isPitchedRoof: true,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 1-1) 혁신도시 대형 공공기관 청사 / 관공서 본원 / 고층 랜드마크 타워
    // (반곡동 혁신도시 혁신로, 무실동 시청/법조타운, 퇴계동/석사동 공공기관)
    const isBanGokOrInnovation =
      isPublicOrHQKeyword ||
      (approxArea >= 650 && (rawHeight >= 18 || rawLevels >= 5 || rawType.includes('commercial')));

    if (isBanGokOrInnovation && !isAptKeyword) {
      const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(6, Math.min(26, 6 + seed * 12)));
      const calcHeight = rawHeight > 4.0 ? rawHeight : calcFloors * 3.6;

      return {
        zone,
        category: 'public_innovation_hq',
        categoryLabel: '혁신도시·도심 공공기관 청사',
        height: Math.max(22.0, calcHeight),
        levels: calcFloors,
        bldType: 1.0, // 상업/오피스
        defaultWallSlotId: 8.0, // comm_curtainwall (유리 커튼월 및 알루미늄 루버)
        podiumWallSlotId: 5.0,  // comm_granite_beige (넓은 화강석 기단부)
        roofSlotId: 14.0,       // roof_concrete_warmgray (콘크리트 슬래브)
        parapetSlotId: 22.0,    // parapet_dark
        wallR: 0.78, wallG: 0.86, wallB: 0.94, // 스카이 블루 커튼월
        roofR: 0.45, roofG: 0.48, roofB: 0.52, // 웜 그레이 콘크리트
        podiumR: 0.32, podiumG: 0.36, podiumB: 0.42, // 다크 화강석
        skirtDepth: -5.0,
        hasCommercialSetback: true, // 1~3층 포디움(11m) + 타워 인셋
        hasSolarPanels: true,      // 옥상 대형 태양광 패널 그리드
        hasRoofTerrace: true,      // 조경 테라스
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: 'flat',
        roofPitchAngle: 0,
        isPitchedRoof: false,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 1-2) 대단지 브랜드 아파트 (15~25층, 45m ~ 75m 실측 스카이라인 형성)
    const isApartment =
      isAptKeyword ||
      (!isMilitaryKeyword &&
        ((dimMin >= 9.0 && dimMin <= 20.0 && dimMax >= 32.0 && approxArea >= 260 && aspectRatio >= 1.4) ||
         (dimMin >= 12.0 && dimMax >= 26.0 && approxArea >= 320)));

    if (isApartment) {
      const calcFloors = rawLevels >= 5 ? Math.min(rawLevels, 25) : Math.round(Math.max(15, Math.min(25, 15 + seed * 10)));
      const calcHeight = rawHeight > 4.0 ? rawHeight : (calcFloors * 3.0);

      const aptVariant = Math.floor(seed * 3.0);
      const wallSlot = aptVariant === 0 ? 0.0 : aptVariant === 1 ? 1.0 : 2.0;

      return {
        zone,
        category: 'brand_apartment',
        categoryLabel: '대단지 브랜드 아파트',
        height: Math.max(45.0, Math.min(75.0, calcHeight)), // 15층~25층 (45m ~ 75m)
        levels: calcFloors,
        bldType: 2.0, // 아파트
        defaultWallSlotId: wallSlot, // apt_warm_cream / modern_gray / ivory_white
        podiumWallSlotId: 23.0,      // 필로티/공동현관 로비
        roofSlotId: seedRoof < 0.50 ? 14.0 : (seedRoof < 0.80 ? 15.0 : 17.0),
        parapetSlotId: 21.0,         // parapet_concrete
        wallR: 0.957, wallG: 0.945, wallB: 0.918, // 크림 베이지 (#f4f1ea)
        roofR: seedRoof < 0.50 ? 0.341 : (seedRoof < 0.80 ? 0.200 : 0.176),
        roofG: seedRoof < 0.50 ? 0.325 : (seedRoof < 0.80 ? 0.255 : 0.353),
        roofB: seedRoof < 0.50 ? 0.306 : (seedRoof < 0.80 ? 0.333 : 0.263),
        podiumR: 0.28, podiumG: 0.32, podiumB: 0.38,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: false,
        hasRoofTerrace: false,
        hasRoofCoreCap: true,        // 옥상 경사형 장식 캡 & 엘리베이터 코어 돌출
        hasWaterTank: false,
        roofShape: 'flat',
        roofPitchAngle: 0,
        isPitchedRoof: false,
        isCylindricalSilo: false,
        sideWallStripe: true,        // 측벽 브랜드 수직 도색 라인
      };
    }

    // 1-3) 주택가 빌라 및 단독주택 (2층~4층, 7m~13m & 저층 중 30% 입체 박공 경사지붕)
    const isVillaKeyword =
      name.includes('빌라') || name.includes('연립') || name.includes('맨션') ||
      name.includes('원룸') || name.includes('다세대') || rawType.includes('villa');

    const isHouseKeyword =
      name.includes('주택') || name.includes('단독') ||
      rawType.includes('house') || rawType.includes('detached') || rawType.includes('residential');

    const isLowRiseResidential =
      isVillaKeyword || isHouseKeyword ||
      (!isPublicOrHQKeyword && approxArea <= 240 && (rawLevels <= 4 || rawHeight <= 14) && !rawType.includes('commercial') && !rawType.includes('retail'));

    if (isLowRiseResidential) {
      const isSingleHouse = isHouseKeyword || (!isVillaKeyword && (approxArea <= 120 || rawLevels <= 2));

      if (isSingleHouse) {
        // 1~2층 단독주택 (7m ~ 9.5m, 2~3층): 약 30%는 용마루 선이 살아있는 ㅅ자형 박공지붕, 70%는 평지붕
        const calcFloors = rawLevels >= 2 ? Math.min(rawLevels, 3) : (seed > 0.45 ? 3 : 2);
        const calcHeight = rawHeight > 4.0 ? rawHeight : (7.0 + seed * 2.5);
        const isGabled = seedRoof < 0.30; // 30% 비율 경사 박공지붕

        return {
          zone,
          category: 'rural_house',
          categoryLabel: '도심 단독주택·경사지붕',
          height: Math.max(7.0, Math.min(9.5, calcHeight)), // 7m ~ 9.5m (2~3층)
          levels: calcFloors,
          bldType: 0.0,
          defaultWallSlotId: seed > 0.5 ? 10.0 : 12.0, // villa_red_brick (#6b2d1f) or house_cream
          podiumWallSlotId: 11.0,
          roofSlotId: isGabled ? (seedRoof < 0.18 ? 16.0 : 18.0) : (seedRoof < 0.70 ? 17.0 : 14.0),
          parapetSlotId: 21.0,
          wallR: seed > 0.5 ? 0.420 : 0.94,
          wallG: seed > 0.5 ? 0.176 : 0.92,
          wallB: seed > 0.5 ? 0.122 : 0.86,
          roofR: isGabled ? (seedRoof < 0.18 ? 0.420 : 0.118) : (seedRoof < 0.70 ? 0.176 : 0.341),
          roofG: isGabled ? (seedRoof < 0.18 ? 0.176 : 0.227) : (seedRoof < 0.70 ? 0.353 : 0.325),
          roofB: isGabled ? (seedRoof < 0.18 ? 0.122 : 0.541) : (seedRoof < 0.70 ? 0.263 : 0.306),
          podiumR: 0.45, podiumG: 0.42, podiumB: 0.40,
          skirtDepth: -5.0,
          hasCommercialSetback: false,
          hasSolarPanels: false,
          hasRoofTerrace: false,
          hasRoofCoreCap: false,
          hasWaterTank: false,
          roofShape: isGabled ? 'gabled' : 'flat',
          roofPitchAngle: 22,
          isPitchedRoof: isGabled,
          isCylindricalSilo: false,
          sideWallStripe: false,
        };
      } else {
        // 2~4층 다세대 빌라 (9.5m ~ 13m): 30% 경사 박공지붕, 70% 초록 우레탄 평지붕
        const calcFloors = rawLevels >= 2 ? Math.min(rawLevels, 4) : Math.round(Math.max(3, Math.min(4, 3 + seed * 1.5)));
        const calcHeight = rawHeight > 4.0 ? rawHeight : (9.5 + seed * 3.5);
        const isGabled = seedRoof < 0.30;

        return {
          zone,
          category: 'rural_house',
          categoryLabel: '주택가 다세대 빌라',
          height: Math.max(9.5, Math.min(13.0, calcHeight)), // 3층~4층 (9.5m ~ 13m)
          levels: calcFloors,
          bldType: 0.0,
          defaultWallSlotId: seed > 0.5 ? 10.0 : 11.0, // villa_red_brick (#6b2d1f) or villa_granite (#a8a29e)
          podiumWallSlotId: 11.0, // 필로티 주차장 기둥 음영
          roofSlotId: isGabled ? (seedRoof < 0.18 ? 16.0 : 18.0) : (seedRoof < 0.65 ? 17.0 : (seedRoof < 0.88 ? 14.0 : 15.0)),
          parapetSlotId: 21.0,
          wallR: seed > 0.5 ? 0.420 : 0.659,
          wallG: seed > 0.5 ? 0.176 : 0.635,
          wallB: seed > 0.5 ? 0.122 : 0.620,
          roofR: isGabled ? (seedRoof < 0.18 ? 0.420 : 0.118) : (seedRoof < 0.65 ? 0.176 : (seedRoof < 0.88 ? 0.341 : 0.200)),
          roofG: isGabled ? (seedRoof < 0.18 ? 0.176 : 0.227) : (seedRoof < 0.65 ? 0.353 : (seedRoof < 0.88 ? 0.325 : 0.255)),
          roofB: isGabled ? (seedRoof < 0.18 ? 0.122 : 0.541) : (seedRoof < 0.65 ? 0.263 : (seedRoof < 0.88 ? 0.306 : 0.333)),
          podiumR: 0.35, podiumG: 0.38, podiumB: 0.42,
          skirtDepth: -5.0,
          hasCommercialSetback: false,
          hasSolarPanels: false,
          hasRoofTerrace: false,
          hasRoofCoreCap: false,
          hasWaterTank: false,
          roofShape: isGabled ? 'gabled' : 'flat',
          roofPitchAngle: 20,
          isPitchedRoof: isGabled,
          isCylindricalSilo: false,
          sideWallStripe: false,
        };
      }
    }

    // 1-4) 시내 대로변 상가 / 오피스 빌딩 및 구도심 상가 블록
    // 4층~8층 (14m ~ 28m)으로 층고의 고저차 리듬감 부여
    const calcFloors = rawLevels >= 2 ? Math.min(rawLevels, 8) : Math.round(Math.max(4, Math.min(8, 4 + seed * 4)));
    const calcHeight = rawHeight > 4.0 ? rawHeight : (calcFloors * 3.5);

    return {
      zone,
      category: 'commercial_old_downtown',
      categoryLabel: '시내 대로변 상가·오피스 빌딩',
      height: Math.max(14.0, Math.min(28.0, calcHeight)), // 4층~8층 (14m ~ 28m)
      levels: calcFloors,
      bldType: 1.0,
      defaultWallSlotId: seed > 0.6 ? 6.0 : (seed > 0.3 ? 5.0 : 7.0), // dark_metal, granite_beige (#a8a29e), or red_brick (#6b2d1f)
      podiumWallSlotId: 9.0, // comm_ground_shop (1층 어두운 상가 쇼윈도 + 간판 띠)
      roofSlotId: seedRoof < 0.70 ? 17.0 : 14.0, // 70% 초록 우레탄 (#2d5a43), 30% 노후 콘크리트 (#57534e)
      parapetSlotId: 22.0,
      wallR: seed > 0.6 ? 0.35 : (seed > 0.3 ? 0.659 : 0.420),
      wallG: seed > 0.6 ? 0.38 : (seed > 0.3 ? 0.635 : 0.176),
      wallB: seed > 0.6 ? 0.42 : (seed > 0.3 ? 0.620 : 0.122),
      roofR: seedRoof < 0.70 ? 0.176 : 0.341, // 초록 우레탄 (#2d5a43) or 노후 콘크리트 (#57534e)
      roofG: seedRoof < 0.70 ? 0.353 : 0.325,
      roofB: seedRoof < 0.70 ? 0.263 : 0.306,
      podiumR: 0.20, podiumG: 0.22, podiumB: 0.26, // 어두운 화강석 쇼윈도
      skirtDepth: -5.0,
      hasCommercialSetback: calcFloors >= 6,
      hasSolarPanels: false,
      hasRoofTerrace: false,
      hasRoofCoreCap: false,
      hasWaterTank: true,   // 옥상 STS 원통형 물탱크 및 실외기
      roofShape: 'flat',
      roofPitchAngle: 0,
      isPitchedRoof: false,
      isCylindricalSilo: false,
      sideWallStripe: false,
    };
  }

  // ---------------------------------------------------------------------------
  // [2. 철원·화천·양구·인제·고성·홍천 접경 및 군사 거점권]
  // ---------------------------------------------------------------------------
  if (zone === 'border_military') {
    // 2-1) 영농 시설 (곡면 비닐하우스 / 저온저장고 클러스터)
    if (isGreenhouseKeyword) {
      return {
        zone,
        category: 'rural_greenhouse',
        categoryLabel: '영농 시설·곡면 비닐하우스',
        height: 3.8,
        levels: 1,
        bldType: 0.0,
        defaultWallSlotId: 13.0, // facility_panel (반투명 실버/화이트)
        podiumWallSlotId: 13.0,
        roofSlotId: 13.0,
        parapetSlotId: 21.0,
        wallR: 0.92, wallG: 0.94, wallB: 0.96, // 반투명 실버/화이트
        roofR: 0.88, roofG: 0.91, roofB: 0.94,
        podiumR: 0.65, podiumG: 0.68, podiumB: 0.72,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: false,
        hasRoofTerrace: false,
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: 'greenhouse',
        roofPitchAngle: 15,
        isPitchedRoof: true,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 2-2) 군 주둔지 / 유휴부지 영내 군수 물류창고/정비창/탄약고
    const isDepot =
      name.includes('창고') || name.includes('정비') || name.includes('보급') ||
      name.includes('탄약') || name.includes('수송') || name.includes('물류') ||
      (isMilitaryKeyword && (approxArea >= 350 || (rawHeight <= 7.5 && rawLevels <= 2)));

    if (isDepot) {
      const calcFloors = rawLevels > 0 ? rawLevels : 1;
      const calcHeight = rawHeight > 0 ? rawHeight : (approxArea > 600 ? 7.5 : 5.5);

      return {
        zone,
        category: 'military_depot',
        categoryLabel: '군수 물류창고·정비창',
        height: calcHeight,
        levels: calcFloors,
        bldType: 3.0, // 군부대
        defaultWallSlotId: 13.0, // facility_panel (샌드위치 패널)
        podiumWallSlotId: 21.0,
        roofSlotId: 18.0,        // roof_zinc_blue (징크 실버/네이비 강판 지붕)
        parapetSlotId: 21.0,
        wallR: 0.82, wallG: 0.85, wallB: 0.89, // 라이트 실버 패널
        roofR: 0.16, roofG: 0.28, roofB: 0.44, // 징크 네이비 / 스틸
        podiumR: 0.38, podiumG: 0.42, podiumB: 0.46,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: false,
        hasRoofTerrace: false,
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: 'gabled',
        roofPitchAngle: 18,
        isPitchedRoof: true,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 2-3) 신형 통합막사 / 본부 병영 (3~4층 베이지/브라운 콘크리트 + 청회색/적갈색 박공)
    if (isMilitaryKeyword || cLat >= 38.08) {
      const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(2, Math.min(4, 2 + seed * 2)));
      const calcHeight = rawHeight > 0 ? rawHeight : calcFloors * 3.4;

      const roofIsRed = seedRoof > 0.5;

      return {
        zone,
        category: 'military_barracks',
        categoryLabel: '신형 통합병영막사',
        height: Math.max(7.0, calcHeight),
        levels: calcFloors,
        bldType: 3.0,
        defaultWallSlotId: 23.0, // public_military (베이지/브라운 투톤 콘크리트)
        podiumWallSlotId: 21.0,
        roofSlotId: roofIsRed ? 16.0 : 15.0, // roof_terracotta_tile or asphalt_charcoal
        parapetSlotId: 21.0,
        wallR: 0.90, wallG: 0.88, wallB: 0.84, // 단정한 베이지/브라운 콘크리트
        roofR: roofIsRed ? 0.486 : 0.28,
        roofG: roofIsRed ? 0.20 : 0.32,
        roofB: roofIsRed ? 0.12 : 0.38,
        podiumR: 0.42, podiumG: 0.40, podiumB: 0.38,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: false,
        hasRoofTerrace: false,
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: 'gabled',
        roofPitchAngle: 22,
        isPitchedRoof: true,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 2-4) 농촌 및 읍·면 시가지 저층 단독주택 (적벽돌/크림 + 기와/강판 경사지붕)
    const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(1, Math.min(2, 1 + seed)));
    const calcHeight = rawHeight > 0 ? rawHeight : calcFloors * 3.2;
    const isCream = seed > 0.5;

    return {
      zone,
      category: 'rural_house',
      categoryLabel: '농촌·읍면 단독주택',
      height: Math.max(3.8, calcHeight),
      levels: calcFloors,
      bldType: 0.0,
      defaultWallSlotId: isCream ? 12.0 : 10.0, // house_cream or villa_red_brick
      podiumWallSlotId: 11.0,
      roofSlotId: seedRoof > 0.4 ? 16.0 : 18.0, // 적갈색 기와(#7c2d12) or 청색 강판(#1d4ed8)
      parapetSlotId: 21.0,
      wallR: isCream ? 0.96 : 0.62,
      wallG: isCream ? 0.94 : 0.26,
      wallB: isCream ? 0.88 : 0.20,
      roofR: seedRoof > 0.4 ? 0.486 : 0.14,
      roofG: seedRoof > 0.4 ? 0.176 : 0.26,
      roofB: seedRoof > 0.4 ? 0.071 : 0.62,
      podiumR: 0.45, podiumG: 0.42, podiumB: 0.40,
      skirtDepth: -5.0,
      hasCommercialSetback: false,
      hasSolarPanels: false,
      hasRoofTerrace: false,
      hasRoofCoreCap: false,
      hasWaterTank: false,
      roofShape: seedRoof > 0.5 ? 'gabled' : 'hipped',
      roofPitchAngle: 20,
      isPitchedRoof: true,
      isCylindricalSilo: false,
      sideWallStripe: false,
    };
  }

  // ---------------------------------------------------------------------------
  // [3. 강릉·동해·속초·삼척·양양 동해안권]
  // ---------------------------------------------------------------------------
  if (zone === 'coastal_belt') {
    // 3-1) 항만·산업단지 대형 물류 사일로 & 공장 박공지붕 (동해항, 묵호항, 삼척항, 옥계항)
    if (isPortIndustrialKeyword) {
      const isSilo = name.includes('사일로') || (aspectRatio < 1.3 && approxArea <= 400 && rawHeight >= 18);
      const calcHeight = isSilo ? Math.max(28.0, rawHeight || 32.0) : Math.max(9.0, rawHeight || 12.0);

      return {
        zone,
        category: 'coastal_port_silo',
        categoryLabel: isSilo ? '항만 시멘트·물류 사일로' : '항만 물류·산업 설비',
        height: calcHeight,
        levels: Math.round(calcHeight / 4.0),
        bldType: 4.0, // 특수 산업
        defaultWallSlotId: 23.0, // 화이트/그레이 콘크리트 사일로
        podiumWallSlotId: 21.0,
        roofSlotId: 15.0,        // roof_asphalt_charcoal
        parapetSlotId: 21.0,
        wallR: 0.88, wallG: 0.90, wallB: 0.92,
        roofR: 0.32, roofG: 0.36, roofB: 0.42,
        podiumR: 0.28, podiumG: 0.30, podiumB: 0.34,
        skirtDepth: -5.0,
        hasCommercialSetback: false,
        hasSolarPanels: false,
        hasRoofTerrace: false,
        hasRoofCoreCap: false,
        hasWaterTank: false,
        roofShape: isSilo ? 'silo' : 'gabled',
        roofPitchAngle: isSilo ? 10 : 20,
        isPitchedRoof: !isSilo,
        isCylindricalSilo: isSilo,
        sideWallStripe: false,
      };
    }

    // 3-2) 해안가 고층 리조트/호텔/오션뷰 주상복합 (경포·강문·안목, 속초해변, 양양 낙산 등)
    // 밝은 화이트 프레임 + 스카이 블루 반사 통유리 발코니
    const isOceanView =
      isResortKeyword ||
      rawHeight >= 20 ||
      rawLevels >= 7 ||
      (isAptKeyword && cLng >= 128.85);

    if (isOceanView) {
      const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(7, Math.min(30, 8 + seed * 16)));
      const calcHeight = rawHeight > 0 ? rawHeight : calcFloors * 3.3;

      return {
        zone,
        category: 'coastal_resort',
        categoryLabel: '해안가 오션뷰 리조트·호텔',
        height: Math.max(24.0, calcHeight),
        levels: calcFloors,
        bldType: 4.0,
        defaultWallSlotId: 8.0, // comm_curtainwall (스카이 블루 반사 통유리)
        podiumWallSlotId: 2.0,  // apt_ivory_white (밝은 화이트 프레임)
        roofSlotId: 14.0,       // 쿨 그레이 테라스
        parapetSlotId: 21.0,
        wallR: 0.82, wallG: 0.92, wallB: 0.98, // 밝은 오션 스카이블루
        roofR: 0.45, roofG: 0.50, roofB: 0.56,
        podiumR: 0.94, podiumG: 0.96, podiumB: 0.98, // 순백색 프레임
        skirtDepth: -5.0,
        hasCommercialSetback: true,
        hasSolarPanels: false,
        hasRoofTerrace: true, // 루프탑 인피니티풀/전망 테라스
        hasRoofCoreCap: true,
        hasWaterTank: false,
        roofShape: 'flat',
        roofPitchAngle: 0,
        isPitchedRoof: false,
        isCylindricalSilo: false,
        sideWallStripe: false,
      };
    }

    // 3-3) 동해안 일반 주거/상가
    const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(2, Math.min(5, 2 + seed * 2)));
    const calcHeight = rawHeight > 0 ? rawHeight : calcFloors * 3.2;

    return {
      zone,
      category: 'commercial_old_downtown',
      categoryLabel: '동해안 도심 근린시설',
      height: Math.max(6.5, calcHeight),
      levels: calcFloors,
      bldType: 1.0,
      defaultWallSlotId: 5.0,
      podiumWallSlotId: 9.0,
      roofSlotId: 17.0, // 세이지 그린
      parapetSlotId: 22.0,
      wallR: 0.88, wallG: 0.86, wallB: 0.84,
      roofR: 0.18, roofG: 0.353, roofB: 0.267,
      podiumR: 0.22, podiumG: 0.24, podiumB: 0.28,
      skirtDepth: -5.0,
      hasCommercialSetback: false,
      hasSolarPanels: false,
      hasRoofTerrace: false,
      hasRoofCoreCap: false,
      hasWaterTank: true,
      roofShape: 'flat',
      roofPitchAngle: 0,
      isPitchedRoof: false,
      isCylindricalSilo: false,
      sideWallStripe: false,
    };
  }

  // ---------------------------------------------------------------------------
  // [4. 태백·평창·정선·영월·횡성 산악 고원권]
  // ---------------------------------------------------------------------------
  // 급경사 지형 깊은 기초 옹벽(Foundation Skirt -8.0m 연장) + 30도 급경사 박공지붕
  const isAptInHighland = isAptKeyword && rawLevels >= 10;
  if (isAptInHighland) {
    const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(10, Math.min(22, 10 + seed * 10)));
    const calcHeight = rawHeight > 0 ? rawHeight : calcFloors * 2.95;

    return {
      zone,
      category: 'brand_apartment',
      categoryLabel: '산악 고원지대 아파트',
      height: Math.max(28.0, calcHeight),
      levels: calcFloors,
      bldType: 2.0,
      defaultWallSlotId: 1.0, // modern_gray
      podiumWallSlotId: 21.0,
      roofSlotId: 14.0,
      parapetSlotId: 21.0,
      wallR: 0.90, wallG: 0.90, wallB: 0.88,
      roofR: 0.35, roofG: 0.38, roofB: 0.44,
      podiumR: 0.26, podiumG: 0.30, podiumB: 0.36,
      skirtDepth: -8.0, // 고원 급경사 지형 -8.0m 기초 연장
      hasCommercialSetback: false,
      hasSolarPanels: false,
      hasRoofTerrace: false,
      hasRoofCoreCap: true,
      hasWaterTank: false,
      roofShape: 'flat',
      roofPitchAngle: 0,
      isPitchedRoof: false,
      isCylindricalSilo: false,
      sideWallStripe: true,
    };
  }

  // 산악 고원 펜션 / 리조트 / 주택 (30도 급경사 박공 슬레이트/목재 톤)
  const calcFloors = rawLevels > 0 ? rawLevels : Math.round(Math.max(1, Math.min(4, 2 + seed * 2)));
  const calcHeight = rawHeight > 0 ? rawHeight : calcFloors * 3.3;
  const isTimber = seedRoof > 0.4;

  return {
    zone,
    category: 'mountain_chalet',
    categoryLabel: '산악 고원 목조·슬레이트 건축',
    height: Math.max(5.5, calcHeight),
    levels: calcFloors,
    bldType: 0.0,
    defaultWallSlotId: isTimber ? 11.0 : 7.0, // 사비석 화강석 / 치장벽돌
    podiumWallSlotId: 21.0,
    roofSlotId: isTimber ? 16.0 : 15.0,      // 테라코타 브라운 기와 or 다크 차콜 슬레이트
    parapetSlotId: 21.0,
    wallR: isTimber ? 0.78 : 0.65,
    wallG: isTimber ? 0.65 : 0.42,
    wallB: isTimber ? 0.52 : 0.32, // 내추럴 목재/석재 톤
    roofR: isTimber ? 0.42 : 0.20,
    roofG: isTimber ? 0.24 : 0.25,
    roofB: isTimber ? 0.16 : 0.33, // 30도 슬레이트/목재 톤
    podiumR: 0.28, podiumG: 0.33, podiumB: 0.41,
    skirtDepth: -8.0, // 급경사 산비탈 대비 8.0m 옹벽 필수 연장
    hasCommercialSetback: false,
    hasSolarPanels: false,
    hasRoofTerrace: false,
    hasRoofCoreCap: false,
    hasWaterTank: false,
    roofShape: 'gabled',
    roofPitchAngle: 30, // 30도 급경사 다설형 박공
    isPitchedRoof: true,
    isCylindricalSilo: false,
    sideWallStripe: false,
  };
}
