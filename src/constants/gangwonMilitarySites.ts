import * as turf from '@turf/turf';

export type GangwonHubCategory = 'wonju' | 'chuncheon' | 'border' | 'eastcoast';

export type ComplexBuildingPresetType =
  | 'rd_tower'
  | 'knowledge_center'
  | 'logistics_depot'
  | 'watch_tower'
  | 'residential_support'
  | 'civic_convention';

export interface EntryRoadInfo {
  name: string;
  lanes: number;
  widthMeters: number;
  type: 'arterial' | 'access' | 'express';
  startCoord: [number, number];
  endCoord: [number, number];
}

export interface GangwonMilitarySite {
  id: string;
  aliasIds: string[];
  name: string;
  shortName: string;
  hubCategory: GangwonHubCategory;
  hubCategoryLabel: string;
  district: string;
  regionId: string;
  managingAgency: string;
  areaSqm: number;
  areaPyeong: number;
  center: [number, number]; // [lng, lat]
  rotationDeg: number;
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  entryRoads: EntryRoadInfo[];
  recommendedCamera: {
    zoom: number;
    pitch: number;
    bearing: number;
  };
  themeTitle: string;
  devVision: string;
  keyFeatures: string[];
  transitInfo: {
    highway: string;
    railway: string;
    nationalRoad: string;
    score: number; // 1-100
  };
  complex3DPresets: ComplexBuildingPresetType[];
}

/**
 * 부지 중심점과 면적, 종횡비, 회전각을 기반으로 정밀 GeoJSON 폴리곤 생성
 */
function createSitePolygon(
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

/**
 * 강원특별자치도 핵심 군 유휴부지 & 다중 거점 통합 데이터베이스
 * 1) 원주권: 원주 1군지사 이전부지, 원주 캠프 롱 반환부지
 * 2) 춘천권: 춘천 캠프 페이지 반환부지, 춘천 102보충대 유휴부지
 * 3) 영서·접경권: 철원 접경 거점(구 보병연대), 인제 스마트물류(기린면 거점), 화천 사내면 거점
 * 4) 동해·강릉권: 동해안 군사 유휴지 및 해양방산 클러스터
 */
export const GANGWON_MILITARY_SITES: GangwonMilitarySite[] = [
  // 1-1. [원주권] 1군지사 이전부지
  {
    id: 'first-logistics-wonju',
    aliasIds: ['wonju-1st-logistics', 'first-logistics-wonju'],
    name: '원주 1군지사 이전부지',
    shortName: '원주 1군지사',
    hubCategory: 'wonju',
    hubCategoryLabel: '원주권',
    district: '강원특별자치도 원주시 우산동·학성동',
    regionId: 'wonju',
    managingAgency: '국방부 (호저면 대체시설 이전 연계)',
    areaSqm: 310000,
    areaPyeong: 93775,
    center: [127.9358, 37.3592],
    rotationDeg: -12,
    polygon: createSitePolygon([127.9358, 37.3592], 310000, 1.7, -12),
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
        endCoord: [127.9358, 37.362],
      },
    ],
    recommendedCamera: {
      zoom: 15.6,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '첨단 국방·반도체 R&D 밸리 & 스마트 모빌리티 복합단지',
    devVision: '스마트 도심물류 허브 및 민군 복합 반도체·모빌리티 청년혁신타운',
    keyFeatures: [
      '원주 구도심 상권 및 시외버스터미널 생활권 밀착',
      '제1군수지원사령부 호저면 대체시설 이전 확정지',
      '중앙고속도로 북원주IC 및 영동고속도로 원주IC 5분 내 진입',
      '평탄한 도심 준주거·상업 복합개발 최우선지',
    ],
    transitInfo: {
      highway: '영동고속도로 원주IC (3.5km, 차량 6분)',
      railway: 'KTX 원주역 (4.2km, 차량 8분)',
      nationalRoad: '국도 5호선 및 북원로 직결',
      score: 95,
    },
    complex3DPresets: ['rd_tower', 'knowledge_center', 'civic_convention'],
  },

  // 1-2. [원주권] 캠프 롱 반환부지
  {
    id: 'camp-long-wonju',
    aliasIds: ['wonju-camp-long', 'camp-long-wonju'],
    name: '원주 캠프 롱 반환부지',
    shortName: '원주 캠프 롱',
    hubCategory: 'wonju',
    hubCategoryLabel: '원주권',
    district: '강원특별자치도 원주시 태장동',
    regionId: 'wonju',
    managingAgency: '국방부 / 원주시 (주한미군공여구역 반환)',
    areaSqm: 344332,
    areaPyeong: 104160,
    center: [127.9545, 37.3778],
    rotationDeg: 18,
    polygon: createSitePolygon([127.9545, 37.3778], 344332, 1.45, 18),
    entryRoads: [
      {
        name: '태장 북원로 진입로',
        lanes: 4,
        widthMeters: 16,
        type: 'arterial',
        startCoord: [127.952, 37.376],
        endCoord: [127.957, 37.3795],
      },
    ],
    recommendedCamera: {
      zoom: 15.6,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '의료·모빌리티 스마트 복합단지 & 바이오 R&D 밸리',
    devVision: '민·군 상생 첨단의료 R&D 및 에코 아트파크 혁신거점',
    keyFeatures: [
      '주한미군 공여구역 반환 완료 및 토양오염 정화 완료 단계',
      '국립원주과학관 및 대규모 복합체육문화공원 연계',
      '영동고속도로 원주IC 인접 (차량 5분)',
      '디지털 헬스케어 및 첨단의료기기 테크노밸리 확장지',
    ],
    transitInfo: {
      highway: '영동고속도로 원주IC (2.8km, 차량 5분)',
      railway: 'KTX 만종역 (7.5km, 차량 12분)',
      nationalRoad: '국도 42호선 우회도로 연접',
      score: 92,
    },
    complex3DPresets: ['rd_tower', 'knowledge_center', 'residential_support', 'logistics_depot'],
  },

  // 2-1. [춘천권] 캠프 페이지 반환부지
  {
    id: 'chuncheon-camp-page',
    aliasIds: ['chuncheon-camp-page', 'camp-page-chuncheon'],
    name: '춘천 캠프 페이지 반환부지',
    shortName: '춘천 캠프 페이지',
    hubCategory: 'chuncheon',
    hubCategoryLabel: '춘천권',
    district: '강원특별자치도 춘천시 근화동·소양로',
    regionId: 'chuncheon',
    managingAgency: '국방부 / 춘천시 (미군기지 반환)',
    areaSqm: 540000,
    areaPyeong: 163350,
    center: [127.7225, 37.886],
    rotationDeg: 24,
    polygon: createSitePolygon([127.7225, 37.886], 540000, 1.85, 24),
    entryRoads: [
      {
        name: '춘천역 지하차도 연결간선로',
        lanes: 6,
        widthMeters: 22,
        type: 'arterial',
        startCoord: [127.719, 37.884],
        endCoord: [127.726, 37.888],
      },
    ],
    recommendedCamera: {
      zoom: 15.5,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '도심 첨단 문화·관광 복합타운 & 바이오 테크노파크',
    devVision: '레고랜드·춘천역세권 연계 도심형 첨단 메가 랜드마크 파크',
    keyFeatures: [
      '경춘선/ITX 춘천역 도보 1분 초역세권 유휴지',
      '의암호 수변공간 및 레고랜드 코리아 리조트 직결',
      '춘천 도청 신청사 이전 및 역세권 입체복합환승센터 연계',
      '첨단 영상문화·K-콘텐츠 및 바이오 테크 창업 허브',
    ],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (8.2km, 차량 15분)',
      railway: '경춘선 KTX/ITX 춘천역 (0.3km, 도보 3분)',
      nationalRoad: '국도 5호선 및 의암호 순환로 인접',
      score: 98,
    },
    complex3DPresets: ['rd_tower', 'knowledge_center', 'civic_convention'],
  },

  // 2-2. [춘천권] 102보충대 유휴부지
  {
    id: 'ch-102-chuncheon',
    aliasIds: ['chuncheon-102-depot', 'ch-102-chuncheon', '102-depot-chuncheon'],
    name: '춘천 102보충대 유휴부지',
    shortName: '춘천 102보충대',
    hubCategory: 'chuncheon',
    hubCategoryLabel: '춘천권',
    district: '강원특별자치도 춘천시 신북읍 율문리',
    regionId: 'chuncheon',
    managingAgency: '국방부 / 춘천시',
    areaSqm: 143000,
    areaPyeong: 43257,
    center: [127.7584, 37.9255],
    rotationDeg: 35,
    polygon: createSitePolygon([127.7584, 37.9255], 143000, 1.35, 35),
    entryRoads: [
      {
        name: '신북로 4차선 접속도로',
        lanes: 4,
        widthMeters: 16,
        type: 'access',
        startCoord: [127.756, 37.924],
        endCoord: [127.761, 37.927],
      },
    ],
    recommendedCamera: {
      zoom: 15.7,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '바이오 테크노파크 & 평화·보훈 연수 힐링파크',
    devVision: '평화·보훈 연수 힐링파크 및 K-바이오 푸드 클러스터',
    keyFeatures: [
      '수십 년간 강원권 입영 장병의 상징 거점 역사성 보유',
      '국도 5호선 및 소양강 수변축 인접으로 쾌적한 환경',
      '공공 복지연수원 및 반려동물·바이오 테마파크 연계 기획',
      '강원대·한림대 연구소 연계 스마트 바이오 실증단지',
    ],
    transitInfo: {
      highway: '중앙고속도로 춘천IC (12.5km, 차량 18분)',
      railway: '경춘선 춘천역 (6.8km, 차량 10분)',
      nationalRoad: '국도 5호선 및 국도 46호선 직결',
      score: 84,
    },
    complex3DPresets: ['knowledge_center', 'logistics_depot', 'residential_support', 'watch_tower'],
  },

  // 3-1. [영서·접경권] 철원 접경 거점 (구 보병연대 주둔지)
  {
    id: 'cheorwon-infantry',
    aliasIds: ['cheorwon-border-hub', 'cheorwon-infantry'],
    name: '철원 접경 거점 (구 보병연대)',
    shortName: '철원 접경 거점',
    hubCategory: 'border',
    hubCategoryLabel: '영서·접경권',
    district: '강원특별자치도 철원군 갈말읍 지경리',
    regionId: 'cheorwon',
    managingAgency: '국방부 / 관할사단 (국방혁신 4.0 감축지)',
    areaSqm: 198000,
    areaPyeong: 59895,
    center: [127.3225, 38.1632],
    rotationDeg: 50,
    polygon: createSitePolygon([127.3225, 38.1632], 198000, 1.8, 50),
    entryRoads: [
      {
        name: '국도 43호선 전술 연결로',
        lanes: 4,
        widthMeters: 16,
        type: 'arterial',
        startCoord: [127.319, 38.161],
        endCoord: [127.326, 38.166],
      },
    ],
    recommendedCamera: {
      zoom: 15.5,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '민·군 상생 평화 스마트팜 거점 & 전방 스마트 군수보급 물류 데포',
    devVision: '접경지 그린바이오 스마트팜 및 통일 대비 평화 방산물류 기지',
    keyFeatures: [
      '국방개혁 병력 감축 해체 연대 부지 (대규모 평탄 부지)',
      '국도 43호선 축선상 대형 화물차량 및 트럭 진출입 원활',
      '험준한 산악 접경지형 특성을 반영한 군수 시설 및 경계·감시 타워 메쉬',
      '신재생에너지 및 스마트 온실 농업 연계 RE100 실증',
    ],
    transitInfo: {
      highway: '세종포천고속도로 신북IC (28km, 차량 30분)',
      railway: '경원선 백마고지역 (14.5km, 차량 16분)',
      nationalRoad: '국도 43호선 호국로 직결',
      score: 79,
    },
    complex3DPresets: ['watch_tower', 'logistics_depot', 'residential_support'],
  },

  // 3-2. [영서·접경권] 인제 스마트물류 (기린면 거점)
  {
    id: 'inje-girin',
    aliasIds: ['inje-smart-logistics', 'inje-girin'],
    name: '인제 스마트물류 (기린면 거점)',
    shortName: '인제 스마트물류',
    hubCategory: 'border',
    hubCategoryLabel: '영서·접경권',
    district: '강원특별자치도 인제군 기린면 현리',
    regionId: 'inje',
    managingAgency: '국방부 / 인제군 (사단 개편 유휴지)',
    areaSqm: 165000,
    areaPyeong: 49912,
    center: [128.2982, 37.9585],
    rotationDeg: 12,
    polygon: createSitePolygon([128.2982, 37.9585], 165000, 1.6, 12),
    entryRoads: [
      {
        name: '내린천로 연결 지방도',
        lanes: 2,
        widthMeters: 12,
        type: 'access',
        startCoord: [128.295, 37.956],
        endCoord: [128.301, 37.961],
      },
    ],
    recommendedCamera: {
      zoom: 15.6,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '전방 스마트 군수보급 물류 데포 & 산림 바이오 에코빌리지',
    devVision: '내린천 스마트 에코 물류밸리 및 산림 바이오 의약소재 연구센터',
    keyFeatures: [
      '서울양양고속도로 인제IC 인접 (차량 8분, 수도권 1시간대)',
      '내린천 수변 생태축과 연계된 천혜의 자연경관',
      '전방 군수지원 스마트 풀필먼트 자동화 창고 적지',
      '군 장병 가족 복합 주거 및 산림 치유 힐링 시설 연계',
    ],
    transitInfo: {
      highway: '서울양양고속도로 인제IC (6.2km, 차량 8분)',
      railway: '동서고속화철도 원통역(예정) (18km, 차량 20분)',
      nationalRoad: '국도 31호선 및 지방도 418호선',
      score: 85,
    },
    complex3DPresets: ['logistics_depot', 'knowledge_center', 'residential_support', 'watch_tower'],
  },

  // 4-1. [동해·강릉권] 해양 방산 거점 (강릉 비행장 완화 & 주문진 해안 유휴지)
  {
    id: 'gangneung-defense-cluster',
    aliasIds: ['gangneung-defense-cluster', 'gangneung-coastal', 'eastcoast-naval-hub'],
    name: '강릉·동해 해양방산 스마트 클러스터',
    shortName: '강릉·동해 해양방산',
    hubCategory: 'eastcoast',
    hubCategoryLabel: '동해·강릉권',
    district: '강원특별자치도 강릉시 주문진읍·교동 일원',
    regionId: 'gangneung',
    managingAgency: '국방부 / 강릉시 / 해군 1함대',
    areaSqm: 175000,
    areaPyeong: 52937,
    center: [128.895, 37.785],
    rotationDeg: -15,
    polygon: createSitePolygon([128.895, 37.785], 175000, 1.55, -15),
    entryRoads: [
      {
        name: '동해대로 (국도 7호선)',
        lanes: 6,
        widthMeters: 24,
        type: 'arterial',
        startCoord: [128.892, 37.782],
        endCoord: [128.898, 37.788],
      },
    ],
    recommendedCamera: {
      zoom: 15.5,
      pitch: 55,
      bearing: 20,
    },
    themeTitle: '해양 물류 거점 및 스마트 방산 부품 클러스터',
    devVision: '동해안 해양 무인체계 R&D 및 첨단 방위산업 스마트 제조 벨트',
    keyFeatures: [
      '군 비행장 고도제한 완화에 따른 개발 가용지 확보',
      '동해선 KTX 강릉역 및 옥계항·묵호항 물류망 인접',
      '해양 유·무인 복합전투체계 실증 테스트베드',
      '강릉과학산업단지 신소재 테크노밸리와 클러스터링',
    ],
    transitInfo: {
      highway: '동해고속도로 북강릉IC (3.8km, 차량 6분)',
      railway: 'KTX 강릉역 (5.5km, 차량 10분)',
      nationalRoad: '국도 7호선 동해대로 직결',
      score: 93,
    },
    complex3DPresets: ['rd_tower', 'logistics_depot', 'knowledge_center'],
  },
];

/**
 * ID 또는 별칭(alias)으로 강원 군 유휴부지 조회
 */
export function getGangwonMilitarySiteById(id: string): GangwonMilitarySite | undefined {
  return GANGWON_MILITARY_SITES.find(
    (site) => site.id === id || site.aliasIds.includes(id)
  );
}
