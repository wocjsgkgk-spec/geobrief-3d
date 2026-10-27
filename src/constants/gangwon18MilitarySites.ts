/**
 * constants/gangwon18MilitarySites.ts
 *
 * [GeoBrief 3D 2단계: 강원특별자치도 18개 시·군 전역 군 유휴부지 & 전략 거점 데이터베이스]
 *
 * 국방개혁 2.0 및 군사시설 이전·재배치 사업에 따른 강원 18개 전 시·군
 * 핵심 군 유휴부지(이전·해체 군사시설 및 미군 반환 공여지) 실측 데이터베이스:
 *
 * 1. 영서 중·남부권 (원주·횡성·홍천·영월·평창·정선):
 *    - 원주시: 제1군수지원사령부(우산동·학성동, 310,000㎡), 캠프 롱(태장동, 334,897㎡), 옛 국군원주병원(태장동, 120,000㎡), 반곡동 종축장(145,000㎡)
 *    - 춘천시: 캠프 페이지(소양로, 540,000㎡), 옛 102보충대(신북읍, 331,900㎡), 옛 6군단 신북·동내면 유휴부지(180,000㎡)
 *    - 홍천군: 홍천읍 옛 제1야전군 이전부지 및 남면 군 유휴지(250,000㎡)
 *    - 횡성군: 횡성읍·묵계리 옛 군사시설 유휴부지(220,000㎡)
 *    - 영월군·평창군·정선군: 각 군 핵심 공공·지역개발 유휴부지
 *
 * 2. 북부 접경권 (철원·화천·양구·인제·고성 — 국방개혁 2.0 사단 해체·통폐합 핵심지):
 *    - 철원군: 옛 6사단(청성부대) 사령부(동송·갈말) 및 옛 3사단 예하 유휴부지(480,000㎡)
 *    - 화천군: 옛 27사단(이기자부대) 사령부 및 사내면 사창리·화천읍 해체 유휴부지(420,000㎡)
 *    - 양구군: 옛 2사단(노도부대) 사령부 및 양구읍 상리·하리·남면 유휴부지(380,000㎡)
 *    - 인제군: 옛 12사단/3군단 북면 원통리·기린면 군 유휴부지(310,000㎡)
 *    - 고성군: 옛 22사단 간성읍·거진읍·현내면 군 유휴지 및 동해선 역세권(350,000㎡)
 *
 * 3. 동해안 및 태백권 (강릉·동해·속초·삼척·양양·태백):
 *    - 강릉시: 옥계·주문진·교동 옛 군사/공공 유휴지(260,000㎡)
 *    - 동해시: 1함대 인접 및 묵호·북평 거점(190,000㎡)
 *    - 속초시: 영랑동·노학동 군 유휴지(170,000㎡)
 *    - 삼척시·양양군: 동해안 군 경계철책 철거 해제 유휴부지(각 210,000㎡)
 *    - 태백시: 장성·철암 핵심 개발 거점(180,000㎡)
 */

import * as turf from '@turf/turf';

export type GangwonSubregionType =
  | '영서 중·남부권'
  | '북부 접경권'
  | '동해안 및 태백권';

export type MilitarySiteDisplayMode = 'current_military' | 'future_masterplan';

export interface EntryRoadSpec {
  name: string;
  lanes: number;
  widthMeters: number;
  type: 'arterial' | 'access' | 'express';
  startCoord: [number, number];
  endCoord: [number, number];
}

export interface TransitMetric {
  highway: string;
  railway: string;
  nationalRoad: string;
  score: number; // 0 - 100
}

export interface ExistingMilitaryBuildingSpec {
  name: string;
  type: 'barracks' | 'parade_ground' | 'depot' | 'warehouse' | 'guard_post';
  height: number;
  floors: number;
  footprintSqm: number;
  roofType: 'gabled' | 'flat';
  description: string;
}

export interface FutureMasterPlanBuildingSpec {
  name: string;
  type: 'rd_tower' | 'knowledge_center' | 'civic_park' | 'residential' | 'convention';
  height: number;
  floors: number;
  footprintSqm: number;
  roofType: 'curtain_helipad' | 'terrace_solar' | 'green_park';
  description: string;
}

export interface Gangwon18MilitarySite {
  id: string;
  aliasIds: string[];
  name: string;
  shortName: string;
  subregion: GangwonSubregionType;
  regionId: string;
  regionName: string;
  admCode: string;          // 신 행정구역코드 (51xxx)
  legacyAdmCode: string;    // 구 행정구역코드 (42xxx)
  district: string;
  managingAgency: string;
  areaSqm: number;
  areaPyeong: number;
  center: [number, number]; // [lng, lat]
  rotationDeg: number;
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  currentStatus: string;    // 현재 상태 (예: 이전 진행 중 / 국방부·원주시 기부대양여 협의)
  targetUse: string;        // 계획 용도 (예: 첨단산업·주거·문화 복합단지)
  averageSlope: string;     // 평균 경사도 (예: 2.4° (평탄지))
  zoning: string;           // 용도지역 (예: 준주거지역 / 제2종일반주거지역)
  themeTitle: string;
  devVision: string;
  keyFeatures: string[];
  transitInfo: TransitMetric;
  entryRoads: EntryRoadSpec[];
  recommendedCamera: {
    zoom: number;
    pitch: number;
    bearing: number;
  };
  existingBuildings: ExistingMilitaryBuildingSpec[];
  futureBuildings: FutureMasterPlanBuildingSpec[];
}

/**
 * 중심점, 면적, 종횡비, 회전각을 기반으로 정밀한 GeoJSON 다각형 폴리곤 생성
 */
export function generateSitePolygon(
  center: [number, number],
  areaSqm: number,
  aspectRatio = 1.6,
  rotation = 0
): GeoJSON.Feature<GeoJSON.Polygon> {
  const hMeters = Math.sqrt(areaSqm / aspectRatio);
  const wMeters = hMeters * aspectRatio;

  const halfWKm = wMeters / 2 / 1000;
  const halfHKm = hMeters / 2 / 1000;
  const pt = turf.point(center);

  const north = turf.destination(pt, halfHKm, 0, { units: 'kilometers' }).geometry.coordinates[1];
  const south = turf.destination(pt, halfHKm, 180, { units: 'kilometers' }).geometry.coordinates[1];
  const east = turf.destination(pt, halfWKm, 90, { units: 'kilometers' }).geometry.coordinates[0];
  const west = turf.destination(pt, halfWKm, 270, { units: 'kilometers' }).geometry.coordinates[0];

  let poly = turf.polygon([
    [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
      [west, north],
    ],
  ]);

  if (rotation !== 0) {
    poly = turf.transformRotate(poly, rotation, { pivot: center });
  }

  return poly;
}

// =============================================================================
// [강원특별자치도 18개 시·군 전역 군 유휴부지 & 핵심 전략 거점 24개소 전수 탑재]
// =============================================================================

export const GANGWON_18_MILITARY_SITES: Gangwon18MilitarySite[] = [
  // ---------------------------------------------------------------------------
  // [1. 영서 중·남부권] (원주, 춘천, 홍천, 횡성, 영월, 평창, 정선)
  // ---------------------------------------------------------------------------

  // 1-1. 원주시: 제1군수지원사령부(1군지사) 이전부지
  {
    id: 'wj-1st-logistics',
    aliasIds: ['first-logistics-wonju', 'wonju-1st-logistics'],
    name: '원주 제1군수지원사령부 이전부지',
    shortName: '원주 1군지사',
    subregion: '영서 중·남부권',
    regionId: 'wonju',
    regionName: '원주시',
    admCode: '51130',
    legacyAdmCode: '42130',
    district: '강원특별자치도 원주시 우산동·학성동 114 일원',
    managingAgency: '국방부 / 원주시 (호저면 대체시설 이전 연계 기부대양여)',
    areaSqm: 310000,
    areaPyeong: 93775,
    center: [127.9358, 37.3592],
    rotationDeg: -12,
    polygon: generateSitePolygon([127.9358, 37.3592], 310000, 1.7, -12),
    currentStatus: '이전 진행 중 / 호저면 대체기지 완공 및 부지 반환 협의 완료',
    targetUse: '첨단 반도체·디지털헬스케어 R&D 밸리 & 청년복합타운',
    averageSlope: '2.1° (평탄지)',
    zoning: '준주거지역 / 제2종일반주거지역',
    themeTitle: '첨단 국방·반도체 R&D 밸리 & 스마트 모빌리티 복합단지',
    devVision: '스마트 도심물류 허브 및 민군 복합 반도체·모빌리티 청년혁신타운',
    keyFeatures: [
      '원주 구도심 상권 및 시외버스터미널 생활권 밀착',
      '제1군수지원사령부 호저면 대체시설 이전 확정지',
      '영동고속도로 원주IC 및 중앙고속도로 북원주IC 5분 내 진입',
      '평탄한 도심 준주거·상업 복합개발 최우선지',
    ],
    transitInfo: {
      highway: '영동고속도로 원주IC (3.5km, 차량 6분)',
      railway: 'KTX 원주역 (4.2km, 차량 8분)',
      nationalRoad: '국도 5호선 및 북원로 직결',
      score: 95,
    },
    entryRoads: [
      {
        name: '우산로 4차선 주간선도로',
        lanes: 4,
        widthMeters: 16,
        type: 'arterial',
        startCoord: [127.9335, 37.3575],
        endCoord: [127.9381, 37.3609],
      },
      {
        name: '학성 도심 연결 지선망',
        lanes: 2,
        widthMeters: 12,
        type: 'access',
        startCoord: [127.9358, 37.3565],
        endCoord: [127.9358, 37.3620],
      },
    ],
    recommendedCamera: { zoom: 15.6, pitch: 55, bearing: 20 },
    existingBuildings: [
      { name: '1군지사 본부 병영막사(3동)', type: 'barracks', height: 9.5, floors: 3, footprintSqm: 1800, roofType: 'gabled', description: '지상 3층 샌드 베이지 통합막사, 적갈색 기와 박공' },
      { name: '중앙 연병장 및 헬리패드', type: 'parade_ground', height: 0.1, floors: 1, footprintSqm: 12000, roofType: 'flat', description: '토사 연병장 및 전술 헬기 이착륙 포장패드' },
      { name: '대형 군수장비 정비고', type: 'depot', height: 8.5, floors: 1, footprintSqm: 3200, roofType: 'gabled', description: '철골 트러스 아치 지붕 및 롤러셔터 정비창' },
      { name: '군수물자 종합 보급창고(4동)', type: 'warehouse', height: 7.2, floors: 1, footprintSqm: 4500, roofType: 'gabled', description: '블루 골강판 물류창고 및 지게차 하역도크' },
    ],
    futureBuildings: [
      { name: '국방·반도체 R&D 메가타워', type: 'rd_tower', height: 62.0, floors: 16, footprintSqm: 2400, roofType: 'curtain_helipad', description: '스카이블루 커튼월 및 옥탑 닥터헬기 헬리패드' },
      { name: '스마트 지식산업센터', type: 'knowledge_center', height: 28.0, floors: 7, footprintSqm: 3600, roofType: 'terrace_solar', description: '테라스형 조경 및 120kW 옥상 태양광 발전 어레이' },
      { name: '청년혁신 복합주거단지', type: 'residential', height: 45.0, floors: 15, footprintSqm: 2800, roofType: 'terrace_solar', description: '투톤 아이보리 콘크리트 및 스마트 커뮤니티 센터' },
      { name: '센트럴 시민문화공원 & 컨벤션', type: 'civic_park', height: 16.0, floors: 3, footprintSqm: 5000, roofType: 'green_park', description: '곡선 글라스 아치 및 15,000㎡ 잔디광장' },
    ],
  },

  // 1-2. 원주시: 캠프 롱(Camp Long) 미군 반환 공여지
  {
    id: 'wj-camp-long',
    aliasIds: ['camp-long-wonju', 'wonju-camp-long'],
    name: '원주 캠프 롱 반환부지',
    shortName: '원주 캠프 롱',
    subregion: '영서 중·남부권',
    regionId: 'wonju',
    regionName: '원주시',
    admCode: '51130',
    legacyAdmCode: '42130',
    district: '강원특별자치도 원주시 태장동 1191 일원',
    managingAgency: '국방부 / 원주시 (주한미군공여구역 반환 완료)',
    areaSqm: 334897,
    areaPyeong: 101306,
    center: [127.9545, 37.3778],
    rotationDeg: 18,
    polygon: generateSitePolygon([127.9545, 37.3778], 334897, 1.45, 18),
    currentStatus: '반환 완료 / 토양오염 정화 완료 및 문화체육공원 착공',
    targetUse: '국립강원전문과학관·문화체육공원 & 바이오·모빌리티 융합단지',
    averageSlope: '3.2° (완경사)',
    zoning: '자연녹지지역 (도시계획시설 공원·체육시설 결정)',
    themeTitle: '의료·모빌리티 스마트 복합단지 & 에코 아트파크',
    devVision: '민·군 상생 첨단의료 R&D 및 시민친화 에코 테마파크 혁신거점',
    keyFeatures: [
      '주한미군 공여구역 반환 완료 및 토양오염 정화 마무리',
      '국립강원전문과학관(2025 건립) 및 복합체육공원 연계',
      '영동고속도로 원주IC 5분 거리의 광역 접근성',
      '북원주 역세권 배후 바이오헬스 확장 축',
    ],
    transitInfo: {
      highway: '영동고속도로 원주IC (2.8km, 차량 5분)',
      railway: 'KTX 만종역 (7.5km, 차량 12분)',
      nationalRoad: '국도 42호선 우회도로 연접',
      score: 92,
    },
    entryRoads: [
      {
        name: '태장 북원로 진입로',
        lanes: 4,
        widthMeters: 16,
        type: 'arterial',
        startCoord: [127.9520, 37.3760],
        endCoord: [127.9570, 37.3795],
      },
    ],
    recommendedCamera: { zoom: 15.6, pitch: 55, bearing: 20 },
    existingBuildings: [
      { name: '미군 사령부 막사 및 클럽(Camp HQ)', type: 'barracks', height: 7.5, floors: 2, footprintSqm: 2200, roofType: 'gabled', description: '붉은 적벽돌 및 슬레이트 박공지붕 미군 전통 병영' },
      { name: '대형 미군 비행패드 및 야구장', type: 'parade_ground', height: 0.1, floors: 1, footprintSqm: 18000, roofType: 'flat', description: '아스팔트 헬리패드 및 천연잔디 체육시설' },
    ],
    futureBuildings: [
      { name: '국립강원전문과학관', type: 'convention', height: 22.0, floors: 4, footprintSqm: 4200, roofType: 'curtain_helipad', description: '의료·바이오 특화 첨단 미래형 돔 조형' },
      { name: '복합 문화체육센터 & 수영장', type: 'civic_park', height: 18.0, floors: 3, footprintSqm: 3800, roofType: 'green_park', description: '친환경 목구조 및 태양광 지붕 트러스' },
    ],
  },

  // 1-3. 원주시: 옛 국군원주병원 및 학성동 군수부대 부지
  {
    id: 'wj-military-hospital',
    aliasIds: ['wonju-military-hospital'],
    name: '원주 옛 국군원주병원 부지',
    shortName: '옛 국군원주병원',
    subregion: '영서 중·남부권',
    regionId: 'wonju',
    regionName: '원주시',
    admCode: '51130',
    legacyAdmCode: '42130',
    district: '강원특별자치도 원주시 태장동 1338 일원',
    managingAgency: '국방부 / 원주시',
    areaSqm: 120000,
    areaPyeong: 36300,
    center: [127.9482, 37.3685],
    rotationDeg: 8,
    polygon: generateSitePolygon([127.9482, 37.3685], 120000, 1.5, 8),
    currentStatus: '병원 이전 완료 / 유휴 군사시설 철거 및 공공개발 계획',
    targetUse: '공공의료 클러스터 및 시니어 복합 헬스케어 타운',
    averageSlope: '2.8°',
    zoning: '제2종일반주거지역',
    themeTitle: '시니어 헬스케어 & 메디컬 웰니스 파크',
    devVision: '원주 공공의료 인프라와 연계된 메디컬 케어 혁신지구',
    keyFeatures: ['원주세브란스 및 의료원 연계축', '태장2동 주거밀집지 배후지'],
    transitInfo: {
      highway: '영동고속도로 원주IC (3.2km, 차량 6분)',
      railway: '원주역 (5.0km)',
      nationalRoad: '북원로 직결',
      score: 88,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 15 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-4. 원주시: 반곡동 옛 종축장 부지 (혁신도시 확장 거점)
  {
    id: 'wj-jongchukjang',
    aliasIds: ['wonju-jongchukjang'],
    name: '원주 반곡동 옛 종축장 부지',
    shortName: '반곡동 옛 종축장',
    subregion: '영서 중·남부권',
    regionId: 'wonju',
    regionName: '원주시',
    admCode: '51130',
    legacyAdmCode: '42130',
    district: '강원특별자치도 원주시 반곡동 974 일원',
    managingAgency: '강원특별자치도개발공사 / 원주시',
    areaSqm: 145000,
    areaPyeong: 43862,
    center: [127.9712, 37.3325],
    rotationDeg: -5,
    polygon: generateSitePolygon([127.9712, 37.3325], 145000, 1.4, -5),
    currentStatus: '강원혁신도시 인접 공공 유휴부지 / 도시개발구역 지정 추진',
    targetUse: '강원 혁신비즈니스 컨벤션 & ICT 스타트업 캠퍼스',
    averageSlope: '3.5°',
    zoning: '자연녹지지역 / 준주거지역 검토',
    themeTitle: '혁신도시 비즈니스 타운 & 공공기관 오픈 R&D 거점',
    devVision: '건강보험심사평가원·국민건강보험공단 배후 디지털헬스케어 산학연 클러스터',
    keyFeatures: ['13개 공공기관 이전 혁신도시 중심축 연계', '치악산 국립공원 조망 경관'],
    transitInfo: {
      highway: '중앙고속도로 남원주IC (4.5km, 차량 8분)',
      railway: 'KTX 원주역 (3.5km, 차량 6분)',
      nationalRoad: '혁신로 직결',
      score: 94,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 30 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-5. 춘천시: 캠프 페이지(Camp Page) 미군 반환 공여지
  {
    id: 'cc-camp-page',
    aliasIds: ['chuncheon-camp-page', 'camp-page-chuncheon'],
    name: '춘천 캠프 페이지 반환부지',
    shortName: '춘천 캠프 페이지',
    subregion: '영서 중·남부권',
    regionId: 'chuncheon',
    regionName: '춘천시',
    admCode: '51110',
    legacyAdmCode: '42110',
    district: '강원특별자치도 춘천시 근화동·소양로 1가 일원',
    managingAgency: '국방부 / 춘천시 (반환 완료)',
    areaSqm: 540000,
    areaPyeong: 163350,
    center: [127.7225, 37.8860],
    rotationDeg: 24,
    polygon: generateSitePolygon([127.7225, 37.8860], 540000, 1.85, 24),
    currentStatus: '반환 완료 / 도시재생혁신지구 국가시범지구 공모 추진',
    targetUse: 'K-영상문화·바이오 비즈니스 허브 & 메가 센트럴파크',
    averageSlope: '1.2° (초평탄지)',
    zoning: '자연녹지지역 / 일반상업지역 복합용도',
    themeTitle: '춘천 도심형 첨단 영상문화 & 의암호 수변 스마트 시티',
    devVision: '경춘선 춘천역세권·레고랜드 연계 강원 메가 랜드마크 파크',
    keyFeatures: [
      '춘천역(경춘선/ITX) 도보 1분 초역세권 유휴지',
      '의암호 수변공간 및 레고랜드 코리아 리조트 직결',
      '강원도청 신청사 동내면 이전 연계 도심 신성장 동력',
    ],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (8.2km, 차량 15분)',
      railway: '경춘선/ITX 춘천역 (0.3km, 도보 3분)',
      nationalRoad: '국도 5호선 및 의암호 순환로 인접',
      score: 98,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.5, pitch: 55, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-6. 춘천시: 옛 102보충대 유휴부지
  {
    id: 'cc-102-depot',
    aliasIds: ['chuncheon-102-depot', 'ch-102-chuncheon', '102-depot-chuncheon'],
    name: '춘천 옛 102보충대 유휴부지',
    shortName: '춘천 102보충대',
    subregion: '영서 중·남부권',
    regionId: 'chuncheon',
    regionName: '춘천시',
    admCode: '51110',
    legacyAdmCode: '42110',
    district: '강원특별자치도 춘천시 신북읍 용산리·율문리 일원',
    managingAgency: '국방부 / 춘천시',
    areaSqm: 331900,
    areaPyeong: 100400,
    center: [127.7584, 37.9255],
    rotationDeg: 35,
    polygon: generateSitePolygon([127.7584, 37.9255], 331900, 1.4, 35),
    currentStatus: '부대 해체 완료 / 공공복합타운 및 반려동물·바이오 테마파크 계획',
    targetUse: '평화·보훈 연수 힐링파크 & 스마트 푸드테크 R&D 밸리',
    averageSlope: '3.1°',
    zoning: '계획관리지역 / 자연녹지지역',
    themeTitle: '보훈 역사문화 & 푸드테크·바이오 혁신 거점',
    devVision: '강원 장병 추억의 공간을 평화 치유와 푸드바이오 산업기지로 전환',
    keyFeatures: ['소양강댐 진입축 국도 5호선 인접', '대규모 평탄 군영지'],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (12.5km, 차량 18분)',
      railway: '경춘선 춘천역 (6.8km, 차량 10분)',
      nationalRoad: '국도 5호선 직결',
      score: 84,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 25 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-7. 춘천시: 옛 6군단 예하 신북읍·동내면 군 유휴지
  {
    id: 'cc-6th-corps-site',
    aliasIds: ['chuncheon-6th-corps'],
    name: '춘천 옛 6군단 예하 신북·동내 군 유휴부지',
    shortName: '춘천 신북·동내 유휴지',
    subregion: '영서 중·남부권',
    regionId: 'chuncheon',
    regionName: '춘천시',
    admCode: '51110',
    legacyAdmCode: '42110',
    district: '강원특별자치도 춘천시 동내면 고은리 450 일원',
    managingAgency: '국방부 / 춘천시',
    areaSqm: 180000,
    areaPyeong: 54450,
    center: [127.7650, 37.8420],
    rotationDeg: -10,
    polygon: generateSitePolygon([127.7650, 37.8420], 180000, 1.5, -10),
    currentStatus: '강원도청 신청사 행정복합타운 인접 배후 유휴지',
    targetUse: '도청 행정복합타운 배후 공공업무 및 공공주택지구',
    averageSlope: '3.8°',
    zoning: '자연녹지지역 / 주거지역 추진',
    themeTitle: '행정복합타운 지원 배후 스마트 밸리',
    devVision: '강원도청 신청사 이전 효과를 극대화하는 산학연관 클러스터',
    keyFeatures: ['춘천IC 인접 교통 요지', '도청 신청사 2028년 완공 연계'],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (2.5km, 차량 4분)',
      railway: '경춘선 남춘천역 (5.2km)',
      nationalRoad: '국도 46호선 순환망',
      score: 93,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.7, pitch: 52, bearing: 18 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-8. 홍천군: 홍천읍 옛 제1야전군 예하 이전부지 & 남면 군 유휴지
  {
    id: 'hc-1st-army-site',
    aliasIds: ['hongcheon-1st-army'],
    name: '홍천 옛 제1야전군 예하 이전 유휴부지',
    shortName: '홍천 군 유휴지',
    subregion: '영서 중·남부권',
    regionId: 'hongcheon',
    regionName: '홍천군',
    admCode: '51720',
    legacyAdmCode: '42720',
    district: '강원특별자치도 홍천군 홍천읍 연봉리 230 일원',
    managingAgency: '국방부 / 홍천군',
    areaSqm: 250000,
    areaPyeong: 75625,
    center: [127.8760, 37.6780],
    rotationDeg: 15,
    polygon: generateSitePolygon([127.8760, 37.6780], 250000, 1.6, 15),
    currentStatus: '부대 이전 완료 / 국가 항체클러스터 및 복합문화단지 조성',
    targetUse: '강원 국가항체산업 클러스터 2단계 및 도시재생',
    averageSlope: '3.0°',
    zoning: '자연녹지지역 / 계획관리지역',
    themeTitle: '홍천 첨단 항체·바이오 연구단지 & 웰니스 테크 파크',
    devVision: '바이오 백신·항체 진흥원 연계 중부내륙 메디바이오 거점',
    keyFeatures: ['홍천 시가지 인접', '홍천IC 차량 5분'],
    transitInfo: {
      highway: '중앙고속도로 홍천IC (3.5km, 차량 5분)',
      railway: '용문-홍천 광역철도 계획선 인접',
      nationalRoad: '국도 44호선 직결',
      score: 87,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 53, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-9. 횡성군: 횡성읍·묵계리 옛 군사시설 유휴부지
  {
    id: 'hs-mukgye-site',
    aliasIds: ['hoengseong-mukgye'],
    name: '횡성 묵계리 옛 군사시설 유휴부지',
    shortName: '횡성 묵계리 유휴지',
    subregion: '영서 중·남부권',
    regionId: 'hoengseong',
    regionName: '횡성군',
    admCode: '51730',
    legacyAdmCode: '42730',
    district: '강원특별자치도 횡성군 횡성읍 묵계리 145 일원',
    managingAgency: '국방부 / 횡성군',
    areaSqm: 220000,
    areaPyeong: 66550,
    center: [127.9780, 37.4760],
    rotationDeg: -8,
    polygon: generateSitePolygon([127.9780, 37.4760], 220000, 1.5, -8),
    currentStatus: '탄약고 및 군사시설 이전 완료 / 미래모빌리티 실증단지 기획',
    targetUse: 'e-모빌리티 연구실증단지 & 드론봇 방산 시험평가원',
    averageSlope: '2.5°',
    zoning: '계획관리지역',
    themeTitle: '이모빌리티 특화단지 & 첨단 모빌리티 실증센터',
    devVision: '초소형 전기차·특수목적차량 국가 생산기지 연계',
    keyFeatures: ['KTX 횡성역 차량 5분', '원주공항 인접'],
    transitInfo: {
      highway: '중앙고속도로 횡성IC (4.2km)',
      railway: 'KTX 횡성역 (3.0km, 차량 5분)',
      nationalRoad: '국도 5호선 및 국도 6호선 교차',
      score: 89,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.7, pitch: 52, bearing: 15 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 1-10. 영월·평창·정선 핵심 공공·지역개발 유휴부지
  {
    id: 'yw-deokpo-site',
    aliasIds: ['yeongwol-deokpo'],
    name: '영월 덕포리 공공개발 유휴거점',
    shortName: '영월 덕포 거점',
    subregion: '영서 중·남부권',
    regionId: 'yeongwol',
    regionName: '영월군',
    admCode: '51750',
    legacyAdmCode: '42750',
    district: '강원특별자치도 영월군 영월읍 덕포리 520 일원',
    managingAgency: '국토교통부 / 영월군',
    areaSqm: 160000,
    areaPyeong: 48400,
    center: [128.4720, 37.1850],
    rotationDeg: 12,
    polygon: generateSitePolygon([128.4720, 37.1850], 160000, 1.6, 12),
    currentStatus: '철도 및 공공 유휴부지 / 도시재생 뉴딜사업 추진 중',
    targetUse: '영월역세권 드론·항공 모빌리티 복합타운',
    averageSlope: '2.2°',
    zoning: '일반상업지역 / 제2종일반주거지역',
    themeTitle: '영월 드론전용비행시험장 연계 UAM 실증 허브',
    devVision: '동강 수변과 영월역세권을 아우르는 남부내륙 관광·드론 복합거점',
    keyFeatures: ['영월역 도보 5분', '드론 국가전용공역 배후지'],
    transitInfo: {
      highway: '제천영월고속도로(추진)',
      railway: '태백선 KTX-이음 영월역 (0.5km)',
      nationalRoad: '국도 38호선 직결',
      score: 85,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.7, pitch: 53, bearing: 22 },
    existingBuildings: [],
    futureBuildings: [],
  },
  {
    id: 'pc-daegwallyeong-site',
    aliasIds: ['pyeongchang-olympic'],
    name: '평창 대관령 올림픽 유산 공공유휴지',
    shortName: '평창 대관령 거점',
    subregion: '영서 중·남부권',
    regionId: 'pyeongchang',
    regionName: '평창군',
    admCode: '51760',
    legacyAdmCode: '42760',
    district: '강원특별자치도 평창군 대관령면 횡계리 310 일원',
    managingAgency: '강원특별자치도 / 평창군',
    areaSqm: 190000,
    areaPyeong: 57475,
    center: [128.7120, 37.6680],
    rotationDeg: -20,
    polygon: generateSitePolygon([128.7120, 37.6680], 190000, 1.7, -20),
    currentStatus: '올림픽 플라자 배후지 / 평화레저 복합단지 조성',
    targetUse: '국제 평화테마파크 & 고원 산림치유 리조트',
    averageSlope: '4.5°',
    zoning: '자연녹지지역 / 관광휴양개발진흥지구',
    themeTitle: '평창 올림픽 헤리티지 평화관광 밸리',
    devVision: '해발 700m 청정 고원 스포츠·휴양 메카',
    keyFeatures: ['영동고속도로 대관령IC 인접', '올림픽 유산 인프라'],
    transitInfo: {
      highway: '영동고속도로 대관령IC (2.0km)',
      railway: 'KTX 진부역 (14km)',
      nationalRoad: '국도 6호선',
      score: 86,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 15 },
    existingBuildings: [],
    futureBuildings: [],
  },
  {
    id: 'js-sabuk-site',
    aliasIds: ['jeongseon-sabuk'],
    name: '정선 사북·고한 폐광산 공공재생 거점',
    shortName: '정선 사북 거점',
    subregion: '영서 중·남부권',
    regionId: 'jeongseon',
    regionName: '정선군',
    admCode: '51770',
    legacyAdmCode: '42770',
    district: '강원특별자치도 정선군 사북읍 사북리 280 일원',
    managingAgency: '한국광해광업공단 / 정선군',
    areaSqm: 150000,
    areaPyeong: 45375,
    center: [128.8150, 37.2280],
    rotationDeg: 15,
    polygon: generateSitePolygon([128.8150, 37.2280], 150000, 1.5, 15),
    currentStatus: '폐광 유휴지 토양복원 완료 / 탄소중립 힐링파크 개발',
    targetUse: '산림 레포츠 파크 & 탄소중립 에코리조트',
    averageSlope: '6.5°',
    zoning: '계획관리지역',
    themeTitle: '석탄산업 유산 재생 & 산악 웰니스 타운',
    devVision: '하이원리조트와 연계된 4계절 가족형 마운틴 힐링 리조트',
    keyFeatures: ['사북역 인접', '강원랜드 배후지'],
    transitInfo: {
      highway: '국도 38호선 4차선',
      railway: '태백선 사북역 (1.2km)',
      nationalRoad: '국도 38호선',
      score: 81,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.8, pitch: 56, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // ---------------------------------------------------------------------------
  // [2. 북부 접경권] (철원, 화천, 양구, 인제, 고성 — 국방개혁 2.0 사단 해체지)
  // ---------------------------------------------------------------------------

  // 2-1. 철원군: 옛 6사단(청성부대) 사령부 및 갈말·동송 군 유휴지
  {
    id: 'cw-6th-div-site',
    aliasIds: ['cheorwon-6th-div', 'cheorwon-infantry', 'cheorwon-border-hub'],
    name: '철원 옛 6사단 사령부 및 접경 군 유휴지',
    shortName: '철원 6사단 유휴지',
    subregion: '북부 접경권',
    regionId: 'cheorwon',
    regionName: '철원군',
    admCode: '51780',
    legacyAdmCode: '42780',
    district: '강원특별자치도 철원군 갈말읍 지경리·동송읍 일원',
    managingAgency: '국방부 / 철원군 (국방개혁 2.0 사단 통폐합 이전)',
    areaSqm: 480000,
    areaPyeong: 145200,
    center: [127.3225, 38.1632],
    rotationDeg: 50,
    polygon: generateSitePolygon([127.3225, 38.1632], 480000, 1.8, 50),
    currentStatus: '사단 사령부 이전 완료 / 평화스마트농업 및 방산물류단지 기획',
    targetUse: '그린바이오 스마트팜 거점 & 전방 스마트 군수보급 물류 데포',
    averageSlope: '1.5° (대규모 평탄지)',
    zoning: '계획관리지역 / 군사시설보호구역 해제 완료',
    themeTitle: '민·군 상생 평화 스마트팜 & 첨단 방산물류 거점',
    devVision: '사단 해체 유휴지를 접경지 RE100 스마트팜과 통일 대비 전진기지로 재생',
    keyFeatures: [
      '국도 43호선 축선상 대형 화물차량 진출입 최적',
      '수십만 평의 완벽한 평탄 대지 확보',
      '한탄강 주상절리길 및 철원평야 배후지',
    ],
    transitInfo: {
      highway: '세종포천고속도로 신북IC (28km, 차량 30분)',
      railway: '경원선 백마고지역 (14.5km, 차량 16분)',
      nationalRoad: '국도 43호선 호국로 직결',
      score: 79,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.5, pitch: 55, bearing: 20 },
    existingBuildings: [
      { name: '6사단 사령부 본청사', type: 'barracks', height: 11.5, floors: 3, footprintSqm: 2400, roofType: 'gabled', description: '지상 3층 적벽돌 사령부 본청' },
      { name: '대형 연병장 및 훈련장', type: 'parade_ground', height: 0.1, floors: 1, footprintSqm: 22000, roofType: 'flat', description: '사단 열병식용 대형 천연잔디 연병장' },
    ],
    futureBuildings: [
      { name: '철원 그린바이오 스마트팜 타워', type: 'rd_tower', height: 35.0, floors: 8, footprintSqm: 3200, roofType: 'terrace_solar', description: '수직농장 및 식물공장 R&D 센터' },
      { name: '평화 방산물류 통합물류데포', type: 'knowledge_center', height: 15.0, floors: 2, footprintSqm: 8500, roofType: 'green_park', description: '자동화 물류창고 및 드론 배송 거점' },
    ],
  },

  // 2-2. 화천군: 옛 27사단(이기자부대) 사령부 및 사내면 사창리 해체 유휴지
  {
    id: 'hc-27th-div-site',
    aliasIds: ['hwacheon-27th-div', 'hwacheon-sanae'],
    name: '화천 옛 27사단 사령부 및 사내면 유휴부지',
    shortName: '화천 27사단 유휴지',
    subregion: '북부 접경권',
    regionId: 'hwacheon',
    regionName: '화천군',
    admCode: '51790',
    legacyAdmCode: '42790',
    district: '강원특별자치도 화천군 사내면 사창리 120 일원',
    managingAgency: '국방부 / 화천군 (사단 해체 완료)',
    areaSqm: 420000,
    areaPyeong: 127050,
    center: [127.5250, 38.0750],
    rotationDeg: -15,
    polygon: generateSitePolygon([127.5250, 38.0750], 420000, 1.6, -15),
    currentStatus: '사단 공식 해체(2022년) 완료 / 군 유휴부지 종합개발 마스터플랜 수립',
    targetUse: '사내면 활력복합타운 & 군 장병 복지연수원 & 복합문화체육파크',
    averageSlope: '2.8°',
    zoning: '계획관리지역 / 제1종지구단위계획',
    themeTitle: '사내면 상권 회생 복합타운 & 밀리터리 테마파크',
    devVision: '이기자부대 해체 충격을 극복하는 접경지 거점 주거·문화·교육 자족도시',
    keyFeatures: ['사창리 시가지 생활권 직결', '국도 56호선 관통'],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (38km)',
      railway: '경춘선 춘천역 (32km)',
      nationalRoad: '국도 56호선 직결',
      score: 75,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 22 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 2-3. 양구군: 옛 2사단(노도부대) 사령부 및 양구읍 상리·하리 유휴지
  {
    id: 'yg-2nd-div-site',
    aliasIds: ['yanggu-2nd-div', 'yanggu-nodo'],
    name: '양구 옛 2사단 사령부 및 읍내 군 유휴부지',
    shortName: '양구 2사단 유휴지',
    subregion: '북부 접경권',
    regionId: 'yanggu',
    regionName: '양구군',
    admCode: '51800',
    legacyAdmCode: '42800',
    district: '강원특별자치도 양구군 양구읍 하리 160 일원',
    managingAgency: '국방부 / 양구군 (사단 해체 완료)',
    areaSqm: 380000,
    areaPyeong: 114950,
    center: [127.9920, 38.1080],
    rotationDeg: 28,
    polygon: generateSitePolygon([127.9920, 38.1080], 380000, 1.5, 28),
    currentStatus: '2사단 해체 완료 / 양구 종합스포츠타운 및 KTX 역세권 복합개발',
    targetUse: '동서고속화철도 양구역세권 & 스포츠·웰니스 행정복합타운',
    averageSlope: '2.0° (평탄지)',
    zoning: '제2종일반주거지역 / 자연녹지지역',
    themeTitle: '양구 역세권 스마트 스포츠 타운 & 국방 치유복합단지',
    devVision: '2027년 KTX 양구역 개통과 연계된 1박2일 스포츠 힐링 전진기지',
    keyFeatures: ['동서고속화철도 양구역 예정지 1km', '양구 도심 인접'],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (45km)',
      railway: '동서고속화철도 양구역(2027 개통 예정)',
      nationalRoad: '국도 31호선 직결',
      score: 83,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 2-4. 인제군: 옛 12사단/3군단 북면 원통리·기린면 군 유휴지
  {
    id: 'ij-12th-div-site',
    aliasIds: ['inje-smart-logistics', 'inje-12th-div'],
    name: '인제 북면 원통리·기린면 군 유휴부지',
    shortName: '인제 군 유휴지',
    subregion: '북부 접경권',
    regionId: 'inje',
    regionName: '인제군',
    admCode: '51810',
    legacyAdmCode: '42810',
    district: '강원특별자치도 인제군 북면 원통리 410 / 기린면 현리 일원',
    managingAgency: '국방부 / 인제군',
    areaSqm: 310000,
    areaPyeong: 93775,
    center: [128.2120, 38.1350],
    rotationDeg: -18,
    polygon: generateSitePolygon([128.2120, 38.1350], 310000, 1.7, -18),
    currentStatus: '부대 감축 및 재배치 완료 / 스마트물류 및 역세권 명품도시 조성',
    targetUse: '동서고속화철도 원통역세권 스마트 복합물류 허브 & 주거단지',
    averageSlope: '3.1°',
    zoning: '계획관리지역 / 도시지역 확장',
    themeTitle: '동서고속화철도 원통역세권 스마트 물류 & 주거단지',
    devVision: '설악산 관문 원통역 중심의 관광·군수 물류 스마트 시티',
    keyFeatures: ['동서고속화철도 백담역/인제역 인접', '국도 44호선·46호선 결절점'],
    transitInfo: {
      highway: '서울양양고속도로 인제IC (24km)',
      railway: '동서철도 원통역(예정)',
      nationalRoad: '국도 44·46호선 직결',
      score: 82,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 18 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 2-5. 고성군: 옛 22사단 간성읍·거진읍 군 유휴지 및 동해북부선 거점
  {
    id: 'gs-22th-div-site',
    aliasIds: ['goseong-22th-div', 'goseong-ganseong'],
    name: '고성 옛 22사단 간성읍·거진읍 군 유휴부지',
    shortName: '고성 군 유휴지',
    subregion: '북부 접경권',
    regionId: 'goseong',
    regionName: '고성군',
    admCode: '51820',
    legacyAdmCode: '42820',
    district: '강원특별자치도 고성군 간성읍 신안리 / 거진읍 일원',
    managingAgency: '국방부 / 고성군',
    areaSqm: 350000,
    areaPyeong: 105875,
    center: [128.4680, 38.3820],
    rotationDeg: 10,
    polygon: generateSitePolygon([128.4680, 38.3820], 350000, 1.6, 10),
    currentStatus: '해안 경계철책 철거 및 군부대 통폐합 유휴지',
    targetUse: '동해북부선 고성역세권 해양관광 & 통일 물류 평화복합단지',
    averageSlope: '2.4°',
    zoning: '자연녹지지역 / 계획관리지역',
    themeTitle: '동해선 철도망 직결 유라시아 물류 거점 & 평화 리조트',
    devVision: '남북 동해선 철도 연결과 DMZ 평화관광을 잇는 최북단 복합거점',
    keyFeatures: ['동해북부선 철도역 연계', '동해안 청정 해변 조망'],
    transitInfo: {
      highway: '동해고속도로 속초IC (18km)',
      railway: '동해북부선 고성역(2027년 개통 예정)',
      nationalRoad: '국도 7호선 직결',
      score: 80,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 53, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // ---------------------------------------------------------------------------
  // [3. 동해안 및 태백권] (강릉, 동해, 속초, 삼척, 양양, 태백)
  // ---------------------------------------------------------------------------

  // 3-1. 강릉시: 옥계·주문진·교동 옛 군사/공공 유휴지
  {
    id: 'gn-okgye-site',
    aliasIds: ['gangneung-okgye'],
    name: '강릉 옥계·주문진 해양신소재 유휴거점',
    shortName: '강릉 옥계 거점',
    subregion: '동해안 및 태백권',
    regionId: 'gangneung',
    regionName: '강릉시',
    admCode: '51150',
    legacyAdmCode: '42150',
    district: '강원특별자치도 강릉시 옥계면 주수리 340 일원',
    managingAgency: '동해안권경제자유구역청 / 강릉시',
    areaSqm: 260000,
    areaPyeong: 78650,
    center: [129.0350, 37.6150],
    rotationDeg: -25,
    polygon: generateSitePolygon([129.0350, 37.6150], 260000, 1.5, -25),
    currentStatus: '경제자유구역 옥계지구 군 해안경계 해제 연계',
    targetUse: '해양 첨단신소재 및 마그네슘·희소금속 산업단지',
    averageSlope: '2.0°',
    zoning: '일반공업지역 / 경제자유구역',
    themeTitle: '동해안 첨단 신소재 산업기지 & 무역항만 배후단지',
    devVision: '옥계항만 인입철도와 결합된 동해안 환동해 광역 물류 허브',
    keyFeatures: ['옥계항만 직결', '동해고속도로 옥계IC 3분'],
    transitInfo: {
      highway: '동해고속도로 옥계IC (1.5km)',
      railway: '영동선 옥계역 (1.0km)',
      nationalRoad: '국도 7호선',
      score: 91,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 25 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 3-2. 동해시: 해군 1함대 인접 및 묵호·북평 거점
  {
    id: 'dh-bukpyeong-site',
    aliasIds: ['donghae-bukpyeong'],
    name: '동해 묵호·북평 해양방산물류 유휴지',
    shortName: '동해 북평 거점',
    subregion: '동해안 및 태백권',
    regionId: 'donghae',
    regionName: '동해시',
    admCode: '51170',
    legacyAdmCode: '42170',
    district: '강원특별자치도 동해시 구미동 210 일원',
    managingAgency: '국방부 / 동해시',
    areaSqm: 190000,
    areaPyeong: 57475,
    center: [129.1350, 37.4920],
    rotationDeg: 12,
    polygon: generateSitePolygon([129.1350, 37.4920], 190000, 1.6, 12),
    currentStatus: '해군 배후 유휴지 정비 및 수소·방산 클러스터 추진',
    targetUse: '그린수소 항만 에너지 저장소 및 해군 특수방산 R&D 센터',
    averageSlope: '1.8°',
    zoning: '일반공업지역',
    themeTitle: '환동해 그린수소·해양방산 복합 플랫폼',
    devVision: '북평국가산단 및 동해항만 연계 해양에너지 클러스터',
    keyFeatures: ['동해신항만 배후지', '동해역 KTX 차량 5분'],
    transitInfo: {
      highway: '동해고속도로 동해IC (3.5km)',
      railway: '동해선 KTX 동해역 (2.5km)',
      nationalRoad: '국도 7호선',
      score: 90,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 3-3. 속초시: 영랑동·노학동 군 유휴지
  {
    id: 'sc-nohak-site',
    aliasIds: ['sokcho-nohak'],
    name: '속초 노학동 옛 군사시설 유휴부지',
    shortName: '속초 노학 거점',
    subregion: '동해안 및 태백권',
    regionId: 'sokcho',
    regionName: '속초시',
    admCode: '51210',
    legacyAdmCode: '42210',
    district: '강원특별자치도 속초시 노학동 480 일원',
    managingAgency: '국방부 / 속초시',
    areaSqm: 170000,
    areaPyeong: 51425,
    center: [128.5580, 38.1980],
    rotationDeg: -12,
    polygon: generateSitePolygon([128.5580, 38.1980], 170000, 1.5, -12),
    currentStatus: '군 시설 이전 완료 / 동서철도 속초역세권 배후단지 기획',
    targetUse: '동서고속화철도 속초역세권 마이스(MICE) 리조트',
    averageSlope: '3.2°',
    zoning: '자연녹지지역 / 주거·상업 복합화',
    themeTitle: '설악산·동해안 관문 글로벌 마이스 리조트',
    devVision: '2027년 서울-속초 1시간대 고속철 개통 수혜 핵심지',
    keyFeatures: ['속초역 예정지 1.5km', '울산바위 파노라마 뷰'],
    transitInfo: {
      highway: '서울양양고속도로 양양IC (14km)',
      railway: '동서철도 속초역(2027 개통)',
      nationalRoad: '국도 7호선',
      score: 93,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 55, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 3-4. 삼척시: 동해안 군 경계철책 철거 해제 유휴지
  {
    id: 'sc-samcheok-fence',
    aliasIds: ['samcheok-fence'],
    name: '삼척 동해안 군 경계철책 철거 유휴해안',
    shortName: '삼척 해안 유휴지',
    subregion: '동해안 및 태백권',
    regionId: 'samcheok',
    regionName: '삼척시',
    admCode: '51230',
    legacyAdmCode: '42230',
    district: '강원특별자치도 삼척시 교동·갈천동 해안 일원',
    managingAgency: '국방부 / 삼척시',
    areaSqm: 210000,
    areaPyeong: 63525,
    center: [129.1820, 37.4520],
    rotationDeg: 20,
    polygon: generateSitePolygon([129.1820, 37.4520], 210000, 1.7, 20),
    currentStatus: '해안 철책선 완전 철거 / 평화 해양관광 힐링로드 조성',
    targetUse: '삼척 이사부 평화 해양리조트 & 서핑·해양레포츠 파크',
    averageSlope: '2.5°',
    zoning: '자연녹지지역 / 관광휴양형',
    themeTitle: '동해안 철책 개방 에코마린 리조트',
    devVision: '반세기 동안 닫혀있던 동해안 해안선을 품은 프리미엄 오션 파크',
    keyFeatures: ['동해바다 에메랄드 해변 직면', '쏠비치 삼척 인접'],
    transitInfo: {
      highway: '동해고속도로 삼척IC (4.5km)',
      railway: '동해선 삼척역 (3.0km)',
      nationalRoad: '국도 7호선',
      score: 88,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 25 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 3-5. 양양군: 동해안 군 경계철책 철거 해제 및 하조대 배후 유휴지
  {
    id: 'yy-hajodae-site',
    aliasIds: ['yangyang-hajodae'],
    name: '양양 하조대·낙산 군 경계철책 해제 유휴지',
    shortName: '양양 해안 유휴지',
    subregion: '동해안 및 태백권',
    regionId: 'yangyang',
    regionName: '양양군',
    admCode: '51830',
    legacyAdmCode: '42830',
    district: '강원특별자치도 양양군 현북면 하조대해안길 일원',
    managingAgency: '국방부 / 양양군',
    areaSqm: 210000,
    areaPyeong: 63525,
    center: [128.7210, 38.0250],
    rotationDeg: -15,
    polygon: generateSitePolygon([128.7210, 38.0250], 210000, 1.6, -15),
    currentStatus: '철책선 철거 완료 / 대한민국 서핑 메카 글로벌 해양레저 파크',
    targetUse: '양양 글로벌 워케이션 센터 & 오션 스마트 빌리지',
    averageSlope: '1.8°',
    zoning: '자연녹지지역 / 계획관리지역',
    themeTitle: '서핑 비치 & 글로벌 디지털 노마드 워케이션 밸리',
    devVision: '양양국제공항 및 서울양양고속도로 수혜지, 청년 창업 허브',
    keyFeatures: ['양양국제공항 차량 8분', '하조대 서피비치 인접'],
    transitInfo: {
      highway: '서울양양고속도로 하조대IC (2.5km, 차량 3분)',
      railway: '동해북부선 양양역(예정)',
      nationalRoad: '국도 7호선',
      score: 95,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 20 },
    existingBuildings: [],
    futureBuildings: [],
  },

  // 3-6. 태백시: 장성·철암 탄광 및 공공산업 유휴거점
  {
    id: 'tb-jangseong-site',
    aliasIds: ['taebaek-jangseong'],
    name: '태백 장성 옛 광산·공공개발 거점',
    shortName: '태백 장성 거점',
    subregion: '동해안 및 태백권',
    regionId: 'taebaek',
    regionName: '태백시',
    admCode: '51190',
    legacyAdmCode: '42190',
    district: '강원특별자치도 태백시 장성동 120 일원',
    managingAgency: '대한석탄공사 / 태백시',
    areaSqm: 180000,
    areaPyeong: 54450,
    center: [129.0050, 37.1080],
    rotationDeg: 30,
    polygon: generateSitePolygon([129.0050, 37.1080], 180000, 1.5, 30),
    currentStatus: '장성광업소 폐광(2024년) / 미래 지하연구시설(URF) 및 청정수소기지 추진',
    targetUse: '심부 지하물리연구시설 & 스마트 클린에너지 파크',
    averageSlope: '5.2°',
    zoning: '전용공업지역 / 계획관리지역',
    themeTitle: '지하 1,000m 광산 재활용 극한물리 연구소 & 수소 단지',
    devVision: '대한민국 최초 석탄광업소를 미래 과학연구와 수소에너지 전초기지로 탈바꿈',
    keyFeatures: ['태백 시가지 인접', '철암역 KTX-이음 접근'],
    transitInfo: {
      highway: '국도 31·35호선 결절점',
      railway: '영동선/태백선 철암역 (3.5km)',
      nationalRoad: '국도 31호선',
      score: 82,
    },
    entryRoads: [],
    recommendedCamera: { zoom: 15.6, pitch: 55, bearing: 22 },
    existingBuildings: [],
    futureBuildings: [],
  },
];

/**
 * ID 또는 별칭(Alias)으로 18개 시·군 군 유휴부지 조회
 */
export function getGangwon18MilitarySiteById(idOrAlias: string): Gangwon18MilitarySite | undefined {
  if (!idOrAlias) return undefined;
  return GANGWON_18_MILITARY_SITES.find(
    (s) => s.id === idOrAlias || s.aliasIds.includes(idOrAlias)
  );
}

/**
 * 특정 시·군(regionId)에 속한 모든 군 유휴부지 조회
 */
export function getMilitarySitesByRegionId(regionId: string): Gangwon18MilitarySite[] {
  if (!regionId) return [];
  return GANGWON_18_MILITARY_SITES.filter((s) => s.regionId === regionId);
}

/**
 * 3대 권역별 군 유휴부지 그룹 조회
 */
export function getMilitarySitesBySubregion(subregion: GangwonSubregionType): Gangwon18MilitarySite[] {
  return GANGWON_18_MILITARY_SITES.filter((s) => s.subregion === subregion);
}

/**
 * 전체 군 유휴부지 경계 GeoJSON FeatureCollection 생성
 */
export function generateAllMilitarySitesGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: GANGWON_18_MILITARY_SITES.map((site) => ({
      type: 'Feature',
      id: site.id,
      properties: {
        id: site.id,
        name: site.name,
        shortName: site.shortName,
        regionId: site.regionId,
        regionName: site.regionName,
        admCode: site.admCode,
        legacyAdmCode: site.legacyAdmCode,
        areaSqm: site.areaSqm,
        areaPyeong: site.areaPyeong,
        currentStatus: site.currentStatus,
        targetUse: site.targetUse,
        averageSlope: site.averageSlope,
        zoning: site.zoning,
        themeTitle: site.themeTitle,
        devVision: site.devVision,
        transitScore: site.transitInfo.score,
        centerLng: site.center[0],
        centerLat: site.center[1],
      },
      geometry: site.polygon.geometry,
    })),
  };
}
