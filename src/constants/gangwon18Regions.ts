/**
 * constants/gangwon18Regions.ts
 *
 * [GeoBrief 3D: 강원특별자치도 18개 시·군 행정구역 및 군 유휴부지·핵심 거점 프리셋]
 *
 * 1. 4대 권역 체계 완비:
 *    - 중부·영서 내륙권: 원주시, 춘천시, 홍천군, 횡성군 (4개 시·군)
 *    - 북부 접경권 (국방개혁 해체·이전 핵심지): 철원군, 화천군, 양구군, 인제군, 고성군 (5개 군)
 *    - 동해안권: 강릉시, 동해시, 속초시, 삼척시, 양양군 (5개 시·군)
 *    - 남부 고원권: 태백시, 평창군, 정선군, 영월군 (4개 시·군)
 *
 * 2. 행정구역코드 (신 51xxx / 구 42xxx) 및 법정동코드 5자리 접두사
 * 3. 국방개혁 2.0에 따른 해체 사단·군단 유휴부지 및 핵심 도시재생/산업 거점 정밀 좌표·면적
 */

export interface MilitarySiteInfo {
  siteId: string;
  name: string;
  category: 'army' | 'airforce' | 'navy' | 'logistics' | 'border_post' | 'depot' | 'urban_hub';
  coords: [number, number]; // [lng, lat]
  areaSqm: number;
  description: string;
  targetUse?: string;
  recommendedCamera?: {
    zoom: number;
    pitch: number;
    bearing: number;
  };
}

export type GangwonSubregion =
  | '중부·영서 내륙권'
  | '북부 접경권 (국방개혁 해체·이전 핵심지)'
  | '동해안권'
  | '남부 고원권';

export const GANGWON_SUBREGIONS: GangwonSubregion[] = [
  '중부·영서 내륙권',
  '북부 접경권 (국방개혁 해체·이전 핵심지)',
  '동해안권',
  '남부 고원권',
];

export interface GangwonRegionPreset {
  id: string;
  name: string;
  fullName: string;
  type: '시' | '군';
  admCode: string;          // 강원특별자치도 신 행정코드 (51xxx)
  legacyAdmCode: string;    // 구 강원도 행정코드 (42xxx)
  bjdPrefix: string;        // 법정동코드 5자리 접두사
  subregion: GangwonSubregion;
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  terrainCharacteristic: string;
  densityType: 'urban_dense' | 'mountain_basin' | 'coastal_port' | 'border_military' | 'highland_rural';
  militarySites: MilitarySiteInfo[];
  description: string;
}

export const GANGWON_18_REGIONS: GangwonRegionPreset[] = [
  // ===========================================================================
  // [1. 중부·영서 내륙권] (원주시, 춘천시, 홍천군, 횡성군)
  // ===========================================================================
  {
    id: 'wonju',
    name: '원주시',
    fullName: '강원특별자치도 원주시',
    type: '시',
    admCode: '51130',
    legacyAdmCode: '42130',
    bjdPrefix: '51130',
    subregion: '중부·영서 내륙권',
    center: [127.9351, 37.3592],
    zoom: 14.0,
    pitch: 52,
    bearing: 20,
    bbox: [127.75, 37.15, 128.15, 37.55],
    terrainCharacteristic: '치악산 서사면 완경사지 및 원주천 침식 분지, 영서 광역 교통 허브',
    densityType: 'urban_dense',
    militarySites: [
      {
        siteId: 'wj-1st-logistics',
        name: '제1군수지원사령부(1군지사) 이전 유휴부지',
        category: 'logistics',
        coords: [127.9389, 37.3653],
        areaSqm: 310000,
        description: '우산동·학성동 중심부 군수 보급창고 및 정비창 부지, 도시재생 혁신지구 및 청년 스마트 밸리',
        targetUse: '도시재생 혁신지구·스마트 ICT 복합타운',
        recommendedCamera: { zoom: 16.2, pitch: 58, bearing: 25 },
      },
      {
        siteId: 'wj-camp-long',
        name: '캠프 롱(Camp Long) 미군 반환 기지',
        category: 'army',
        coords: [127.9542, 37.3789],
        areaSqm: 340000,
        description: '태장동 소재 주한미군 기지 반환 부지, 국립원주과학관 및 북원 복합체육공원 조성지',
        targetUse: '국립과학관·북원 복합체육공원',
        recommendedCamera: { zoom: 16.0, pitch: 55, bearing: 15 },
      },
      {
        siteId: 'wj-taejang-hakseong',
        name: '태장동·학성동 군 유휴부지',
        category: 'depot',
        coords: [127.9435, 37.3695],
        areaSqm: 185000,
        description: '학성동 철도 폐선부지 및 태장동 구 보급창 연결 녹지축 유휴지',
        targetUse: '도심 생태문화공원 및 공공임대 복합주거단지',
        recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 30 },
      },
      {
        siteId: 'wj-bangok-innovation',
        name: '반곡동 혁신도시 복합클러스터 부지',
        category: 'urban_hub',
        coords: [127.9782, 37.3298],
        areaSqm: 260000,
        description: '건강보험공단·도로교통공단 등 13개 공공기관 배후 미개발 첨단의료 클러스터 용지',
        targetUse: '디지털 헬스케어 R&D 실증단지',
        recommendedCamera: { zoom: 15.5, pitch: 50, bearing: 10 },
      },
    ],
    description: '강원도 최대 인구 도시이자 의료기기·스마트물류 거점, 중부내륙 고속철도 환승 허브',
  },
  {
    id: 'chuncheon',
    name: '춘천시',
    fullName: '강원특별자치도 춘천시',
    type: '시',
    admCode: '51110',
    legacyAdmCode: '42110',
    bjdPrefix: '51110',
    subregion: '중부·영서 내륙권',
    center: [127.7342, 37.8853],
    zoom: 13.8,
    pitch: 52,
    bearing: 15,
    bbox: [127.50, 37.68, 127.95, 38.08],
    terrainCharacteristic: '의암호·소양호 수변 및 봉의산 중심 분지형 도심',
    densityType: 'urban_dense',
    militarySites: [
      {
        siteId: 'cc-camp-page',
        name: '캠프 페이지(Camp Page) 미군 반환부지',
        category: 'army',
        coords: [127.7225, 37.8883],
        areaSqm: 540000,
        description: '춘천역 앞 대규모 미군 항공대대 반환 공여지, 복합 문화·스마트 공원 및 K-컬처 복합타운',
        targetUse: 'K-컬처 복합타운 및 도시재생 혁신파크',
        recommendedCamera: { zoom: 16.0, pitch: 55, bearing: 20 },
      },
      {
        siteId: 'cc-102-depot',
        name: '옛 102보충대 유휴부지',
        category: 'depot',
        coords: [127.7548, 37.9304],
        areaSqm: 145000,
        description: '신북읍 용산리 소재 보충대 해체 부지, 청년 창업 및 융복합 관광단지 추진',
        targetUse: '청년 창업 캠퍼스 및 복합 관광단지',
        recommendedCamera: { zoom: 15.8, pitch: 50, bearing: 10 },
      },
      {
        siteId: 'cc-sinbuk-idle',
        name: '신북읍 항공대대 인접 유휴부지',
        category: 'airforce',
        coords: [127.7635, 37.9182],
        areaSqm: 178000,
        description: '신북읍 율문리 항공대 인근 완충구역, 수소드론 및 스마트 모빌리티 실증지구',
        targetUse: '수소 드론 비행시험장 및 도심항공교통(UAM) 기지',
        recommendedCamera: { zoom: 15.5, pitch: 48, bearing: 5 },
      },
    ],
    description: '강원특별자치도청 소재지이자 호반의 도시, 바이오·ICT 첨단 지식산업 중심지',
  },
  {
    id: 'hongcheon',
    name: '홍천군',
    fullName: '강원특별자치도 홍천군',
    type: '군',
    admCode: '51720',
    legacyAdmCode: '42720',
    bjdPrefix: '51720',
    subregion: '중부·영서 내륙권',
    center: [127.8886, 37.6972],
    zoom: 13.5,
    pitch: 50,
    bearing: 15,
    bbox: [127.60, 37.50, 128.30, 37.90],
    terrainCharacteristic: '홍천강 유역 분지 및 동서 횡단 산악 지형, 전국 기초자치단체 중 최대 면적',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'hc-hongcheon-idle',
        name: '홍천읍 갈마곡리 군 유휴부지 (구 11사단 부지)',
        category: 'army',
        coords: [127.8945, 37.6832],
        areaSqm: 230000,
        description: '홍천읍 갈마곡리·연봉리 소재 전차대대 이전부지, 국가 바이오 항체신약 클러스터 연계',
        targetUse: '바이오 항체 신약 클러스터 R&D 단지',
        recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 25 },
      },
      {
        siteId: 'hc-bukbang-depot',
        name: '북방면 하화계리 군수지원단 유휴지',
        category: 'logistics',
        coords: [127.8725, 37.7214],
        areaSqm: 165000,
        description: '북방면 소재 미활용 군수시설, 스마트팜 및 고령친화 헬스케어 실증 타운',
        targetUse: '미래형 스마트팜 융복합 단지',
        recommendedCamera: { zoom: 15.2, pitch: 48, bearing: 10 },
      },
    ],
    description: '수도권과 강원 내륙을 잇는 교통 관문, 국가 항체 신약 클러스터 및 생명건강 특화군',
  },
  {
    id: 'hoengseong',
    name: '횡성군',
    fullName: '강원특별자치도 횡성군',
    type: '군',
    admCode: '51730',
    legacyAdmCode: '42730',
    bjdPrefix: '51730',
    subregion: '중부·영서 내륙권',
    center: [127.9852, 37.4915],
    zoom: 13.6,
    pitch: 52,
    bearing: 20,
    bbox: [127.80, 37.35, 128.30, 37.70],
    terrainCharacteristic: '섬강 상류 평야지대 및 원주공항 비행안전구역 연접 완경사지',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'hs-hoengseong-hub',
        name: '횡성읍 곡교리 비행안전구역 주변 거점 (원주공항 인근)',
        category: 'airforce',
        coords: [127.9652, 37.4621],
        areaSqm: 260000,
        description: '공군 제8전투비행단 인접 소음대책 완충구역, 강원 e-모빌리티 실증단지 및 시험장',
        targetUse: '초소형 e-모빌리티 클러스터 및 주행시험장',
        recommendedCamera: { zoom: 15.6, pitch: 50, bearing: 15 },
      },
      {
        siteId: 'hs-mukgye-art',
        name: '묵계리 옛 군부대 문화예술 유휴부지',
        category: 'depot',
        coords: [127.9715, 37.4789],
        areaSqm: 110000,
        description: '횡성읍 묵계리 탄약부대 철수 부지, 복합 문화예술공원 및 군민 쉼터',
        targetUse: '문화예술 복합단지 및 사계절 힐링파크',
        recommendedCamera: { zoom: 15.5, pitch: 52, bearing: 20 },
      },
    ],
    description: '강원 e-모빌리티 연구개발 중심지, 명품 횡성한우 및 수도권 초인접 물류 교통 요충지',
  },

  // ===========================================================================
  // [2. 북부 접경권 (국방개혁 해체·이전 핵심지)] (철원, 화천, 양구, 인제, 고성)
  // ===========================================================================
  {
    id: 'cheorwon',
    name: '철원군',
    fullName: '강원특별자치도 철원군',
    type: '군',
    admCode: '51780',
    legacyAdmCode: '42780',
    bjdPrefix: '51780',
    subregion: '북부 접경권 (국방개혁 해체·이전 핵심지)',
    center: [127.3135, 38.1468],
    zoom: 13.5,
    pitch: 54,
    bearing: 15,
    bbox: [127.05, 38.00, 127.60, 38.35],
    terrainCharacteristic: '한탄강 현무암 협곡 용암대지 평야 및 DMZ 남방한계선 접경 고지군',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'cw-6th-division',
        name: '옛 6사단(청성부대) 사령부 및 연대 유휴지',
        category: 'army',
        coords: [127.3112, 38.1345],
        areaSqm: 420000,
        description: '국방개혁으로 포천·철원 통합 재배치된 옛 6사단 주둔지, 평화밀리터리 복합레저단지',
        targetUse: '평화 밀리터리 파크 및 한탄강 복합레저타운',
        recommendedCamera: { zoom: 15.7, pitch: 56, bearing: 20 },
      },
      {
        siteId: 'cw-3rd-division',
        name: '옛 3사단(백골부대) 서면 와수리·자등리 유휴지',
        category: 'army',
        coords: [127.4385, 38.1725],
        areaSqm: 380000,
        description: '서면 와수리 상권 배후 군부대 통합 부지, 국경 평화관광 및 특화 스마트 농업지구',
        targetUse: '접경 스마트 바이오 농업단지 및 군장병 복합타운',
        recommendedCamera: { zoom: 15.5, pitch: 52, bearing: 15 },
      },
    ],
    description: '유네스코 세계지질공원 한탄강, 철원오대쌀의 고장이자 한반도 중부 DMZ 안보평화 거점',
  },
  {
    id: 'hwacheon',
    name: '화천군',
    fullName: '강원특별자치도 화천군',
    type: '군',
    admCode: '51790',
    legacyAdmCode: '42790',
    bjdPrefix: '51790',
    subregion: '북부 접경권 (국방개혁 해체·이전 핵심지)',
    center: [127.7082, 38.1062],
    zoom: 13.5,
    pitch: 56,
    bearing: 25,
    bbox: [127.45, 37.95, 127.95, 38.30],
    terrainCharacteristic: '북한강 상류 및 파로호·화천호 협곡 산악지형, 사방이 1,000m급 험준 산지',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'hc-27th-sanae',
        name: '옛 27사단(이기자부대) 사내면 사창리 해체 유휴부지',
        category: 'army',
        coords: [127.5345, 38.1215],
        areaSqm: 350000,
        description: '국방개혁 2.0으로 2022년 공식 해체된 27사단 사령부 및 주둔지, 사내면 복합상생타운',
        targetUse: '사내면 군관 복합 상생타운 및 실버 웰니스 타운',
        recommendedCamera: { zoom: 15.8, pitch: 55, bearing: 20 },
      },
      {
        siteId: 'hc-hwacheon-idle',
        name: '화천읍 아리 산천어축제 배후 군 유휴지',
        category: 'depot',
        coords: [127.7045, 38.1125],
        areaSqm: 195000,
        description: '화천읍내 북한강변 미활용 군수시설, 산천어 글로벌 관광 연계 사계절 테마단지',
        targetUse: '산천어 사계절 생태체험 및 워터파크 단지',
        recommendedCamera: { zoom: 15.6, pitch: 50, bearing: 30 },
      },
    ],
    description: '세계 4대 겨울축제 산천어축제 개최지, 평화의 댐과 백암산을 품은 청정 호반 산악군',
  },
  {
    id: 'yanggu',
    name: '양구군',
    fullName: '강원특별자치도 양구군',
    type: '군',
    admCode: '51800',
    legacyAdmCode: '42800',
    bjdPrefix: '51800',
    subregion: '북부 접경권 (국방개혁 해체·이전 핵심지)',
    center: [127.9885, 38.1092],
    zoom: 13.5,
    pitch: 54,
    bearing: 20,
    bbox: [127.85, 37.95, 128.25, 38.35],
    terrainCharacteristic: '국토 정중앙 지점, 해안면 운석분지(펀치볼) 및 소양호 최상류 고지대',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'yg-2nd-sangri',
        name: '옛 2사단(노도부대) 양구읍 상리 유휴부지',
        category: 'army',
        coords: [127.9945, 38.1042],
        areaSqm: 280000,
        description: '2사단 해체 후 양구읍 시가지 연접 대규모 유휴 군용지, 동서고속철도 양구역세권 배후단지',
        targetUse: '동서고속화철도 양구역세권 스마트 복합주거단지',
        recommendedCamera: { zoom: 15.8, pitch: 54, bearing: 15 },
      },
      {
        siteId: 'yg-2nd-hari',
        name: '옛 2사단 양구읍 하리·정림리 병영 유휴지',
        category: 'depot',
        coords: [127.9812, 38.0985],
        areaSqm: 195000,
        description: '양구 서천변 구 포병대대 및 연대 부지, 국토정중앙 스포츠 종합 콤플렉스 확장지',
        targetUse: '국토정중앙 사계절 전지훈련 스포츠파크',
        recommendedCamera: { zoom: 15.5, pitch: 50, bearing: 25 },
      },
    ],
    description: '대한민국 국토정중앙 지리적 중심, 백자의 고장이자 DMZ 펀치볼 지질생태 보고',
  },
  {
    id: 'inje',
    name: '인제군',
    fullName: '강원특별자치도 인제군',
    type: '군',
    admCode: '51810',
    legacyAdmCode: '42810',
    bjdPrefix: '51810',
    subregion: '북부 접경권 (국방개혁 해체·이전 핵심지)',
    center: [128.1704, 38.0695],
    zoom: 13.4,
    pitch: 56,
    bearing: 20,
    bbox: [128.00, 37.85, 128.50, 38.30],
    terrainCharacteristic: '설악산·점봉산·방태산 백두대간 고산준령 및 내린천·북천 급류 계곡',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'ij-12th-wontong',
        name: '옛 12사단·3군단 북면 원통리 군수정비 유휴부지',
        category: 'logistics',
        coords: [128.2045, 38.1289],
        areaSqm: 310000,
        description: '원통 시가지 확장축 연접 대규모 군수보급창고 부지, 동서고속철 백담역 연계 역세권',
        targetUse: '백담역 역세권 환승센터 및 설악 힐링 복합타운',
        recommendedCamera: { zoom: 15.7, pitch: 55, bearing: 20 },
      },
      {
        siteId: 'ij-3rd-girin',
        name: '옛 3군단 사령부 기린면 현리 유휴부지',
        category: 'army',
        coords: [128.3215, 37.9452],
        areaSqm: 290000,
        description: '3군단 해체·개편에 따른 기린면 현리 소재 핵심 지휘주둔지, 내린천 레저휴양 특화지구',
        targetUse: '내린천 산림 레포츠 복합단지 및 공공연수원',
        recommendedCamera: { zoom: 15.5, pitch: 52, bearing: 15 },
      },
    ],
    description: '원대리 자작나무숲과 내린천 래프팅, 인제스피디움 및 설악산 국립공원 보유 힐링 산림수도',
  },
  {
    id: 'goseong',
    name: '고성군',
    fullName: '강원특별자치도 고성군',
    type: '군',
    admCode: '51820',
    legacyAdmCode: '42820',
    bjdPrefix: '51820',
    subregion: '북부 접경권 (국방개혁 해체·이전 핵심지)',
    center: [128.4678, 38.3805],
    zoom: 13.5,
    pitch: 54,
    bearing: 0,
    bbox: [128.25, 38.20, 128.60, 38.65],
    terrainCharacteristic: '동해 북단 최북단 해안선 및 금강산 자락 신선봉·화암사 해양산악 단구',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'gs-22nd-ganseong',
        name: '옛 22사단 간성읍 상리 군 유휴부지',
        category: 'army',
        coords: [128.4715, 38.3752],
        areaSqm: 250000,
        description: '간성읍 소재 22사단 군수지원 및 정비부대 이전지, 고성군 복합 행정·문화타운',
        targetUse: '고성 행정·복합문화 커뮤니티 파크',
        recommendedCamera: { zoom: 15.6, pitch: 52, bearing: 10 },
      },
      {
        siteId: 'gs-22nd-geojin',
        name: '옛 22사단 거진읍 거진리 해안 군 유휴지',
        category: 'border_post',
        coords: [128.4582, 38.4412],
        areaSqm: 210000,
        description: '거진항 배후 해안경계 초소 및 레이더기지 통폐합 부지, 환동해 해양레저마린파크',
        targetUse: '거진항 해양레저 마리나 및 복합리조트',
        recommendedCamera: { zoom: 15.5, pitch: 50, bearing: 350 },
      },
    ],
    description: '한반도 최북단 명태의 고장, 통일전망대와 화진포 석호를 간직한 환동해 평화물류 시발점',
  },

  // ===========================================================================
  // [3. 동해안권] (강릉시, 동해시, 속초시, 삼척시, 양양군)
  // ===========================================================================
  {
    id: 'gangneung',
    name: '강릉시',
    fullName: '강원특별자치도 강릉시',
    type: '시',
    admCode: '51150',
    legacyAdmCode: '42150',
    bjdPrefix: '51150',
    subregion: '동해안권',
    center: [128.8761, 37.7519],
    zoom: 13.6,
    pitch: 52,
    bearing: -10,
    bbox: [128.60, 37.50, 129.10, 37.95],
    terrainCharacteristic: '대관령 동사면 급경사면과 경포호·안목해변 석호 및 남대천 충적 평야',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'gn-gyodong',
        name: '교동 올림픽 파크 주변 군 유휴지',
        category: 'urban_hub',
        coords: [128.8952, 37.7735],
        areaSqm: 180000,
        description: '강릉종합운동장 및 하키센터 인접 구 국방부 통신시설 유휴지, K-스포츠 미디어 타운',
        targetUse: '올림픽 유산 K-스포츠 ICT 융합파크',
        recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 0 },
      },
      {
        siteId: 'gn-gyeongpo',
        name: '경포호 북측 안보체험 유휴부지',
        category: 'border_post',
        coords: [128.9052, 37.8012],
        areaSqm: 145000,
        description: '경포호·사근진해변 해안 군 경계철책 철거지 배후지, 생태습지 복원 및 관광단지',
        targetUse: '경포호 국가생태정원 및 사계절 테마파크',
        recommendedCamera: { zoom: 15.5, pitch: 50, bearing: 345 },
      },
      {
        siteId: 'gn-okgye-port',
        name: '옥계항 배후 군 완충 및 산업 유휴지',
        category: 'logistics',
        coords: [129.0415, 37.6085],
        areaSqm: 320000,
        description: '옥계일반산업단지 및 항만 인접 완충지, 천연물 바이오 및 환동해 해상물류 거점',
        targetUse: '환동해 복합 물류터미널 및 수소에너지 단지',
        recommendedCamera: { zoom: 15.3, pitch: 48, bearing: 20 },
      },
    ],
    description: '영동권의 행정·문화·관광 중심도시, KTX 강릉선 종착역 및 2018 올림픽 빙상 경기 개최지',
  },
  {
    id: 'donghae',
    name: '동해시',
    fullName: '강원특별자치도 동해시',
    type: '시',
    admCode: '51170',
    legacyAdmCode: '42170',
    bjdPrefix: '51170',
    subregion: '동해안권',
    center: [129.1143, 37.5247],
    zoom: 13.5,
    pitch: 52,
    bearing: 0,
    bbox: [128.98, 37.40, 129.18, 37.62],
    terrainCharacteristic: '묵호항·동해신항 해안선 및 북평산업단지 해안 배후지, 두타산 급경사 병풍',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'dh-1st-fleet',
        name: '해군 제1함대 사령부 인근 송정동 완충부지',
        category: 'navy',
        coords: [129.1085, 37.5012],
        areaSqm: 190000,
        description: '송정동 배후 해군 1함대 기지 외곽 완충 구역 및 철도 인입선 유휴지',
        targetUse: '동해항 연계 복합 물류보관기지 및 스마트 항만 배후단지',
        recommendedCamera: { zoom: 15.6, pitch: 54, bearing: 10 },
      },
      {
        siteId: 'dh-donghae-port',
        name: '동해신항 및 북평국가산단 유휴 배후지',
        category: 'logistics',
        coords: [129.1295, 37.4852],
        areaSqm: 275000,
        description: '동해항 3단계 석탄·시멘트 친환경 전환에 따른 배후 군수·산업 유휴부지',
        targetUse: '수소저장운송 클러스터 및 암모니아 친환경 벙커링 터미널',
        recommendedCamera: { zoom: 15.4, pitch: 50, bearing: 20 },
      },
    ],
    description: '환동해권 북방물류 중심항만 및 수소·해양 신소재 신산업 전략 거점',
  },
  {
    id: 'sokcho',
    name: '속초시',
    fullName: '강원특별자치도 속초시',
    type: '시',
    admCode: '51210',
    legacyAdmCode: '42210',
    bjdPrefix: '51210',
    subregion: '동해안권',
    center: [128.5918, 38.2070],
    zoom: 14.0,
    pitch: 52,
    bearing: 20,
    bbox: [128.48, 38.15, 128.62, 38.25],
    terrainCharacteristic: '청초호·영랑호 2대 석호와 설악산 울산바위가 바다로 맞닿는 콤팩트 도시',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'sc-cheongcho',
        name: '청초호 남측 조양동 군 유휴부지',
        category: 'urban_hub',
        coords: [128.5845, 38.1925],
        areaSqm: 120000,
        description: '동서고속화철도 속초역 역세권 예정지 인근 구 군부대 유휴지',
        targetUse: '속초역 역세권 콤팩트시티 및 MICE 컨벤션 타운',
        recommendedCamera: { zoom: 16.0, pitch: 55, bearing: 30 },
      },
      {
        siteId: 'sc-yeongrang',
        name: '영랑호 북측 영랑동 해안 안보 유휴지',
        category: 'border_post',
        coords: [128.5982, 38.2215],
        areaSqm: 85000,
        description: '해안 경계초소 통폐합 구역 배후지, 영랑호 생태 순환로 및 해양 힐링파크',
        targetUse: '영랑호 해양 치유 복합단지',
        recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 10 },
      },
    ],
    description: '동서고속화철도 종착역, 글로벌 크루즈 관광항 및 대한민국 대표 4계절 해양관광도시',
  },
  {
    id: 'samcheok',
    name: '삼척시',
    fullName: '강원특별자치도 삼척시',
    type: '시',
    admCode: '51230',
    legacyAdmCode: '42230',
    bjdPrefix: '51230',
    subregion: '동해안권',
    center: [129.1658, 37.4498],
    zoom: 13.5,
    pitch: 52,
    bearing: 15,
    bbox: [128.95, 37.05, 129.40, 37.55],
    terrainCharacteristic: '오십천 협곡 및 삼척항 해식애 단구, 남부 원덕읍 대규모 천연가스 인수기지',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'sc-samcheok-port',
        name: '삼척항 정라동 배후 방어유휴지',
        category: 'navy',
        coords: [129.1825, 37.4385],
        areaSqm: 135000,
        description: '삼척항 입구 절벽지대 해안방어시설 통합 유휴지, 나릿골 감성마을 확장 연계',
        targetUse: '나릿골 해양문화 랜드마크 및 바다전망타워',
        recommendedCamera: { zoom: 15.6, pitch: 52, bearing: 25 },
      },
      {
        siteId: 'sc-wondeok-hydrogen',
        name: '원덕읍 호산항 LNG 생산기지 인근 군 완충부지',
        category: 'depot',
        coords: [129.3142, 37.1625],
        areaSqm: 175000,
        description: '국가중요시설 방호 완충 구역, 액화수소 R&D 특화단지 및 해양 에너지 기지',
        targetUse: '액화수소 규제자유특구 제조·저장 실증단지',
        recommendedCamera: { zoom: 15.4, pitch: 50, bearing: 10 },
      },
    ],
    description: '수소 R&D 특화도시, 한국가스공사 LNG 생산기지 및 해양레일바이크 보유 에너지 허브',
  },
  {
    id: 'yangyang',
    name: '양양군',
    fullName: '강원특별자치도 양양군',
    type: '군',
    admCode: '51830',
    legacyAdmCode: '42830',
    bjdPrefix: '51830',
    subregion: '동해안권',
    center: [128.6285, 38.0754],
    zoom: 13.5,
    pitch: 50,
    bearing: 15,
    bbox: [128.45, 37.85, 128.80, 38.15],
    terrainCharacteristic: '남대천 연어 회귀 하천 및 서피비치·기사문 완만한 해안사구 평야',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'yy-coastal-wire-clear',
        name: '현북면 중광정리 해안 군 경계철책 해제 유휴부지 (서피비치 연접)',
        category: 'border_post',
        coords: [128.7185, 38.0215],
        areaSqm: 215000,
        description: '동해안 군 경계철책 철거로 시민에게 환원된 서피비치 인접 국유지 및 군 유휴지',
        targetUse: '글로벌 해양 서핑 빌리지 및 청년 워케이션 타운',
        recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 20 },
      },
      {
        siteId: 'yy-airport-buffer',
        name: '손양면 양양국제공항 인근 공군 완충지',
        category: 'airforce',
        coords: [128.6652, 38.0612],
        areaSqm: 320000,
        description: '공항 및 해안 방공진지 주변 완충구역, 항공 정비(MRO) 및 복합 관광물류',
        targetUse: '항공 MRO 정비복합단지 및 스마트 물류기지',
        recommendedCamera: { zoom: 15.4, pitch: 48, bearing: 15 },
      },
    ],
    description: '대한민국 서핑 1번지 서피비치, 낙산사 및 양양국제공항 보유 관광 특화군',
  },

  // ===========================================================================
  // [4. 남부 고원권] (태백시, 평창군, 정선군, 영월군)
  // ===========================================================================
  {
    id: 'taebaek',
    name: '태백시',
    fullName: '강원특별자치도 태백시',
    type: '시',
    admCode: '51190',
    legacyAdmCode: '42190',
    bjdPrefix: '51190',
    subregion: '남부 고원권',
    center: [128.9888, 37.1640],
    zoom: 13.5,
    pitch: 56,
    bearing: 25,
    bbox: [128.85, 37.05, 129.10, 37.30],
    terrainCharacteristic: '해발 700m+ 고원 분지 지형, 한강·낙동강 발원지(검룡소·황지연못)',
    densityType: 'highland_rural',
    militarySites: [
      {
        siteId: 'tb-jangseong-mine',
        name: '장성동 구 대한석탄공사 장성광업소 재생 거점',
        category: 'depot',
        coords: [129.0125, 37.1085],
        areaSqm: 360000,
        description: '2024년 공식 폐광된 대한민국 최대 탄광 부지, 청정 청정에너지 실증 및 지하 물류 R&D',
        targetUse: '청정 무탄소 에너지 실증연구단지 및 탄광 헤리티지 파크',
        recommendedCamera: { zoom: 15.7, pitch: 58, bearing: 20 },
      },
      {
        siteId: 'tb-hwangji-reserve',
        name: '황지동 구 지역방위 대대 유휴지',
        category: 'depot',
        coords: [128.9754, 37.1812],
        areaSqm: 110000,
        description: '탄광 구조조정 및 군부대 통폐합에 따른 고원 청정 스포츠 과학 실증단지',
        targetUse: '고원 스포츠 과학 훈련센터 및 산악 힐링파크',
        recommendedCamera: { zoom: 15.5, pitch: 54, bearing: 15 },
      },
    ],
    description: '대한민국 최고 지대 고원도시, 산악 관광 및 고원 스포츠 훈련 메카',
  },
  {
    id: 'pyeongchang',
    name: '평창군',
    fullName: '강원특별자치도 평창군',
    type: '군',
    admCode: '51760',
    legacyAdmCode: '42760',
    bjdPrefix: '51760',
    subregion: '남부 고원권',
    center: [128.3905, 37.3705],
    zoom: 13.4,
    pitch: 54,
    bearing: 20,
    bbox: [128.15, 37.20, 128.85, 37.80],
    terrainCharacteristic: '대관령 해발 800m 고원 초지 및 오대산국립공원 고지대 산악',
    densityType: 'highland_rural',
    militarySites: [
      {
        siteId: 'pc-alpensia-hub',
        name: '대관령면 횡계리 올림픽 유휴거점 (알펜시아 인근)',
        category: 'urban_hub',
        coords: [128.7102, 37.6741],
        areaSqm: 140000,
        description: '2018 평창동계올림픽 지원 군시설 이전지, 평화 테마파크 및 산악 고원 레저타운',
        targetUse: '평창 평화 테마파크 및 글로벌 산악 레저파크',
        recommendedCamera: { zoom: 15.8, pitch: 55, bearing: 15 },
      },
      {
        siteId: 'pc-jinbu-station',
        name: '진부면 오대산역 역세권 배후 유휴지',
        category: 'logistics',
        coords: [128.5612, 37.6385],
        areaSqm: 185000,
        description: 'KTX 진부역 인접 미개발 완충구역, 스마트 고랭지 그린바이오 연구단지',
        targetUse: '그린바이오 융합 스마트팜 연구센터',
        recommendedCamera: { zoom: 15.4, pitch: 50, bearing: 10 },
      },
    ],
    description: '2018 평창동계올림픽 개최지, 평화 테마 관광 및 청정 산림치유의 고장',
  },
  {
    id: 'jeongseon',
    name: '정선군',
    fullName: '강원특별자치도 정선군',
    type: '군',
    admCode: '51770',
    legacyAdmCode: '42770',
    bjdPrefix: '51770',
    subregion: '남부 고원권',
    center: [128.6605, 37.3805],
    zoom: 13.4,
    pitch: 55,
    bearing: 20,
    bbox: [128.45, 37.15, 129.00, 37.65],
    terrainCharacteristic: '조양강·동강 사행천 및 가리왕산·민둥산 백두대간 급경사 고산계곡',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'js-sabuk-gohan',
        name: '사북읍·고한읍 폐광 안보보안 유휴지',
        category: 'depot',
        coords: [128.8105, 37.2289],
        areaSqm: 130000,
        description: '구 동원탄좌 폐광 시설 및 산악 보안 완충지, 산림 생태 재생 및 산악 레포츠 파크',
        targetUse: '동원탄좌 문화예술 광산 및 사계절 산악 액티비티 파크',
        recommendedCamera: { zoom: 15.7, pitch: 56, bearing: 20 },
      },
      {
        siteId: 'js-gariwangsan',
        name: '가리왕산 하봉 알파인 경기장 하부 유휴거점',
        category: 'urban_hub',
        coords: [128.6185, 37.4585],
        areaSqm: 220000,
        description: '올림픽 곤돌라 하부 광장 및 유휴 국유지, 국가정원 유치 연계 웰니스 거점',
        targetUse: '가리왕산 국가정원 생태 웰니스 콤플렉스',
        recommendedCamera: { zoom: 15.5, pitch: 54, bearing: 15 },
      },
    ],
    description: '정선아리랑의 발상지, 가리왕산 올림픽 국가정원 및 사계절 웰니스 산악 레저벨트',
  },
  {
    id: 'yeongwol',
    name: '영월군',
    fullName: '강원특별자치도 영월군',
    type: '군',
    admCode: '51750',
    legacyAdmCode: '42750',
    bjdPrefix: '51750',
    subregion: '남부 고원권',
    center: [128.4615, 37.1835],
    zoom: 13.5,
    pitch: 52,
    bearing: 15,
    bbox: [128.20, 37.00, 128.80, 37.40],
    terrainCharacteristic: '동강과 서강이 합류하는 남한강 상류 하안단구 및 카르스트 석회암 지형',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'yw-drone-testing',
        name: '영월읍 덕포리 드론 전용 비행시험장 거점',
        category: 'urban_hub',
        coords: [128.4852, 37.1852],
        areaSqm: 195000,
        description: '국토교통부 지정 드론 전용 공역 및 비행시험장 주변 유휴부지, UAM 실증단지',
        targetUse: '도심항공교통(UAM) 종합 실증파크 및 드론 산업단지',
        recommendedCamera: { zoom: 15.8, pitch: 52, bearing: 15 },
      },
      {
        siteId: 'yw-defense-battery',
        name: '영월읍 하송리 방공진지 주변지',
        category: 'depot',
        coords: [128.4712, 37.1725],
        areaSqm: 95000,
        description: '발전소 및 철도교 방호 진지 주변 완충지, 생태문화 복합체육공원',
        targetUse: '동강 생태문화 복합체육공원',
        recommendedCamera: { zoom: 15.5, pitch: 50, bearing: 20 },
      },
    ],
    description: '단종의 역사와 동강의 생태 보고, 미래 드론 산업 중심 대한민국 대표 실증도시',
  },
];

/**
 * ID 또는 시·군명으로 강원 18개 시군 프리셋 검색
 */
export function getGangwonRegionByIdOrName(query: string): GangwonRegionPreset | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  return GANGWON_18_REGIONS.find(
    (r) =>
      r.id.toLowerCase() === q ||
      r.name.includes(q) ||
      r.fullName.includes(q) ||
      r.admCode === q ||
      r.legacyAdmCode === q
  );
}

/**
 * 좌표(경위도)가 포함된 강원도 시·군 탐색 (BBOX 히트 테스트)
 */
export function findGangwonRegionByCoords(lng: number, lat: number): GangwonRegionPreset | undefined {
  for (const r of GANGWON_18_REGIONS) {
    const [minLng, minLat, maxLng, maxLat] = r.bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      return r;
    }
  }
  return undefined;
}

/**
 * 4대 권역별 시·군 목록 필터링
 */
export function getRegionsBySubregion(subregion: GangwonSubregion): GangwonRegionPreset[] {
  return GANGWON_18_REGIONS.filter((r) => r.subregion === subregion);
}

/**
 * 강원 전역 18개 시군의 모든 군 유휴부지 및 핵심 거점 목록 반환
 */
export function getAllGangwonMilitarySites(): Array<MilitarySiteInfo & { regionId: string; regionName: string }> {
  const all: Array<MilitarySiteInfo & { regionId: string; regionName: string }> = [];
  for (const r of GANGWON_18_REGIONS) {
    for (const s of r.militarySites) {
      all.push({
        ...s,
        regionId: r.id,
        regionName: r.name,
      });
    }
  }
  return all;
}

/**
 * siteId로 군 유휴부지 단건 조회
 */
export function getGangwonMilitarySiteBySiteId(
  siteId: string
): (MilitarySiteInfo & { regionId: string; regionName: string }) | undefined {
  if (!siteId) return undefined;
  return getAllGangwonMilitarySites().find((s) => s.siteId === siteId);
}
