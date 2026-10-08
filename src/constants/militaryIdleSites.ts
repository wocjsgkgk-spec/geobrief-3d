import * as turf from '@turf/turf';

export interface MilitaryIdleSite {
  id: string;
  name: string;
  regionId: string;
  district: string;
  managingAgency: string;
  areaSqm: number;
  areaPyeong: number;
  center: [number, number]; // [lng, lat]
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  recommendedCamera: {
    zoom: number;
    pitch: number;
    bearing: number;
  };
  keyFeatures: string[];
  description: string;
  devVision: string;
}

/**
 * 면적(㎡)과 중심점, 종횡비(가로:세로), 회전각을 기반으로 다각형 폴리곤 생성 헬퍼
 */
function createSitePolygon(
  center: [number, number],
  areaSqm: number,
  aspectRatio = 1.6, // 가로 / 세로
  rotation = 0
): GeoJSON.Feature<GeoJSON.Polygon> {
  // 면적 = w * h = (aspectRatio * h) * h = aspectRatio * h^2
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
 * 강원특별자치도 주요 군 유휴부지 실증 데이터셋 카탈로그 (총 9개소)
 */
export const MILITARY_IDLE_SITES: MilitaryIdleSite[] = [
  {
    id: 'camp-long-wonju',
    name: '원주 캠프 롱 반환부지',
    regionId: 'wonju',
    district: '강원특별자치도 원주시 태장동',
    managingAgency: '국방부 / 원주시 (주한미군공여구역 반환)',
    areaSqm: 344332,
    areaPyeong: 104160,
    center: [127.9545, 37.3778],
    polygon: createSitePolygon([127.9545, 37.3778], 344332, 1.45, 18),
    recommendedCamera: {
      zoom: 14.8,
      pitch: 52,
      bearing: 25,
    },
    keyFeatures: [
      '주한미군기지 반환 완료 (토양정화 진행)',
      '문화·체육공원 및 복합의료 R&D 부지 조성 계획',
      '영동고속도로 원주IC 인접 (차량 5분)',
    ],
    description: '원주시 북부권 핵심 거점으로 미군 반환 이후 대규모 시민 친화 문화복합공간 및 미래 첨단의료클러스터 조성이 추진되는 전략 유휴지입니다.',
    devVision: '민·군 상생 첨단의료 R&D 및 에코 아트파크 혁신거점',
  },
  {
    id: 'first-logistics-wonju',
    name: '원주 1군지사 이전부지',
    regionId: 'wonju',
    district: '강원특별자치도 원주시 우산동·학성동',
    managingAgency: '국방부 (군사시설 이전 대상지)',
    areaSqm: 310000,
    areaPyeong: 93775,
    center: [127.9358, 37.3592],
    polygon: createSitePolygon([127.9358, 37.3592], 310000, 1.7, -12),
    recommendedCamera: {
      zoom: 14.9,
      pitch: 54,
      bearing: 340,
    },
    keyFeatures: [
      '원주역(구도심) 및 고속버스터미널 생활권 밀착',
      '제1군수지원사령부 호저면 대체시설 이전 연계',
      '평탄한 도심 준주거·상업 복합개발 용이',
    ],
    description: '원주 도심 한가운데 위치했던 대형 군수부지로, 군부대 외곽 이전에 따른 구도심 재생 및 스마트 도시물류 거점 전환의 핵심 요충지입니다.',
    devVision: '스마트 도심물류 허브 및 민군 복합 청년혁신타운',
  },
  {
    id: 'ch-102-chuncheon',
    name: '춘천 102보충대 유휴부지',
    regionId: 'chuncheon',
    district: '강원특별자치도 춘천시 신북읍 율문리',
    managingAgency: '국방부 / 춘천시',
    areaSqm: 143000,
    areaPyeong: 43257,
    center: [127.7584, 37.9255],
    polygon: createSitePolygon([127.7584, 37.9255], 143000, 1.35, 35),
    recommendedCamera: {
      zoom: 15.2,
      pitch: 48,
      bearing: 15,
    },
    keyFeatures: [
      '수십 년간 강원권 입영 장병의 상징 거점',
      '국도 5호선 및 소양강 수변축 인접',
      '공공 복지연수원 및 반려동물·바이오 테마파크 연계',
    ],
    description: '육군 제102보충대대 해체 후 보존된 역사성 높은 부지로, 춘천 강북권역 활성화를 위한 복합 휴양·웰니스 거점으로 기획 중입니다.',
    devVision: '평화·보훈 연수 힐링파크 및 K-바이오 푸드 클러스터',
  },
  {
    id: 'cheorwon-infantry',
    name: '철원 구 보병연대 주둔지',
    regionId: 'cheorwon',
    district: '강원특별자치도 철원군 갈말읍 지경리',
    managingAgency: '국방부 / 관할사단 (국방혁신 4.0 감축지)',
    areaSqm: 198000,
    areaPyeong: 59895,
    center: [127.3225, 38.1632],
    polygon: createSitePolygon([127.3225, 38.1632], 198000, 1.8, 50),
    recommendedCamera: {
      zoom: 14.7,
      pitch: 56,
      bearing: 40,
    },
    keyFeatures: [
      '국방개혁 병력 감축 해체 연대 부지',
      '국도 43호선 축선상 대형 화물차량 진출입 용이',
      '통일 대비 미래 스마트농업 및 신재생 거점 적지',
    ],
    description: '철원 평야 중심부에 자리한 군부대 주둔 유휴지로 넓은 평지와 간선도로 접근성을 보유하여 스마트팜 및 국방 소재 실증단지에 최적입니다.',
    devVision: '접경지 그린바이오 스마트팜 및 통일 평화물류 기지',
  },
  {
    id: 'hwacheon-sanae',
    name: '화천 사내면 군 유휴거점',
    regionId: 'hwacheon',
    district: '강원특별자치도 화천군 사내면 사창리',
    managingAgency: '국방부 / 화천군 (27사단 해체 부지)',
    areaSqm: 125000,
    areaPyeong: 37812,
    center: [127.5258, 38.0745],
    polygon: createSitePolygon([127.5258, 38.0745], 125000, 1.5, -20),
    recommendedCamera: {
      zoom: 15.1,
      pitch: 58,
      bearing: 210,
    },
    keyFeatures: [
      '27사단(이기자부대) 해체에 따른 지역 상권 회생 최우선지',
      '사창리 면소재지 생활 인프라 연접',
      '밀리터리 e스포츠 테마파크 및 산악레포츠 베이스캠프',
    ],
    description: '사단 해체로 인한 인구 감소 위기를 극복하기 위해 군 장병·가족 특화 문화복지 및 산악 치유 레포츠 융복합 단지로의 전환을 추진 중입니다.',
    devVision: '밀리터리 복합문화체험타운 및 산악 익스트림 관광거점',
  },
  {
    id: 'inje-girin',
    name: '인제 기린면 군 유휴거점',
    regionId: 'inje',
    district: '강원특별자치도 인제군 기린면 현리',
    managingAgency: '국방부 / 인제군',
    areaSqm: 165000,
    areaPyeong: 49912,
    center: [128.2982, 37.9585],
    polygon: createSitePolygon([128.2982, 37.9585], 165000, 1.6, 12),
    recommendedCamera: {
      zoom: 14.9,
      pitch: 55,
      bearing: 30,
    },
    keyFeatures: [
      '서울양양고속도로 인제IC 인접 (차량 8분)',
      '내린천 수변 생태축과 연계된 자연경관 우수',
      '산림 치유·바이오 메디컬 연구 실증기지',
    ],
    description: '동서고속도로 개통으로 수도권 1시간대 접근성을 갖춘 현리 거점으로, 청정 내린천과 연계한 국방 웰니스 및 산림휴양 단지 적지입니다.',
    devVision: '내린천 스마트 에코빌리지 및 산림 바이오 연구센터',
  },
  {
    id: 'yanggu-south',
    name: '양구 국토정중앙면 유휴지',
    regionId: 'yanggu',
    district: '강원특별자치도 양구군 국토정중앙면 송청리',
    managingAgency: '국방부 / 양구군',
    areaSqm: 112000,
    areaPyeong: 33880,
    center: [127.9942, 38.0925],
    polygon: createSitePolygon([127.9942, 38.0925], 112000, 1.4, -45),
    recommendedCamera: {
      zoom: 15.3,
      pitch: 52,
      bearing: 160,
    },
    keyFeatures: [
      '한반도 국토 정중앙 상징성 보유',
      '국도 31호선 직결, 평탄한 분지형 지형',
      '신재생에너지 RE100 데이터센터 및 특화농업 복합단지',
    ],
    description: '포병대대 이전 후 남겨진 유휴지로 지형 기복이 적어 대규모 신재생에너지 및 제로에너지 공공 연구단지 조성이 유리합니다.',
    devVision: '국토정중앙 탄소중립 실증단지 및 RE100 스마트파크',
  },
  {
    id: 'goseong-gateway',
    name: '고성 평화관광 관문 유휴지',
    regionId: 'goseong',
    district: '강원특별자치도 고성군 현내면 마차진리',
    managingAgency: '국방부 / 고성군',
    areaSqm: 88000,
    areaPyeong: 26620,
    center: [128.4235, 38.562],
    polygon: createSitePolygon([128.4235, 38.562], 88000, 1.7, 75),
    recommendedCamera: {
      zoom: 15.0,
      pitch: 60,
      bearing: 350,
    },
    keyFeatures: [
      '대한민국 최북단 동해안 해안선 조망 우수',
      '통일전망대 및 DMZ 평화의길 길목 위치',
      '남북교류협력 대비 물류·숙박·환승 관문 인프라',
    ],
    description: '통일전망대 출입 관문에 위치한 해안 경계부대 종전부지로, 수려한 동해 절경을 활용한 안보평화 관광 및 해양복합리조트 개발 최적지입니다.',
    devVision: 'DMZ 해양 평화관광 랜드마크 및 남북경협 물류스테이션',
  },
  {
    id: 'sokcho-coastal',
    name: '속초 영랑동 해안초소 거점',
    regionId: 'sokcho',
    district: '강원특별자치도 속초시 영랑동',
    managingAgency: '국방부 / 속초시',
    areaSqm: 52000,
    areaPyeong: 15730,
    center: [128.5912, 38.2198],
    polygon: createSitePolygon([128.5912, 38.2198], 52000, 1.3, -15),
    recommendedCamera: {
      zoom: 15.5,
      pitch: 50,
      bearing: 90,
    },
    keyFeatures: [
      '영랑호 및 동해안 바다 조망권 동시 확보',
      '군 해안철책 철거에 따른 공공 개방 구역',
      '해양 ICT 청년창업 및 문화 레지던시 적지',
    ],
    description: '동해안 군 경계철책 철거 및 군부대 철수로 시민 품으로 돌아온 해안 유휴부지로, 바다와 석호를 잇는 워터프론트 공공문화단지 조성이 추진됩니다.',
    devVision: '워터프론트 해양 ICT 창업센터 및 공공 아트 빌리지',
  },
];
