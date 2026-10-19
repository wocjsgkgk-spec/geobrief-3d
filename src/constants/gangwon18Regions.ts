/**
 * constants/gangwon18Regions.ts
 *
 * [GeoBrief 3D 1단계: 강원특별자치도 18개 시·군 행정구역 코드 및 중심 거점 프리셋]
 *
 * - 강원특별자치도 18개 전 시·군 (7개 시, 11개 군) 완비
 * - 행정구역코드 (시군구코드 5자리: 신 51xxx / 구 42xxx 상호 매핑)
 * - 대표 군 유휴부지/전략 거점 좌표, 카메라 조감도 각도, 지역 지형 특성
 */

export interface MilitarySiteInfo {
  siteId: string;
  name: string;
  category: 'army' | 'airforce' | 'logistics' | 'border_post' | 'depot';
  coords: [number, number];
  areaSqm: number;
  description: string;
}

export interface GangwonRegionPreset {
  id: string;
  name: string;
  fullName: string;
  type: '시' | '군';
  admCode: string;          // 강원특별자치도 신 행정코드 (51xxx)
  legacyAdmCode: string;    // 구 강원도 행정코드 (42xxx)
  bjdPrefix: string;        // 법정동코드 5자리 접두사
  subregion: '영서북부(접경)' | '영서남부' | '영동북부(접경)' | '영동남부';
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
  // ---------------------------------------------------------------------------
  // [1. 춘천시] 도청 소재지, 수변 및 산악 분지 지형
  // ---------------------------------------------------------------------------
  {
    id: 'chuncheon',
    name: '춘천시',
    fullName: '강원특별자치도 춘천시',
    type: '시',
    admCode: '51110',
    legacyAdmCode: '42110',
    bjdPrefix: '51110',
    subregion: '영서북부(접경)',
    center: [127.7342, 37.8853],
    zoom: 13.0,
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
        description: '춘천역 앞 대규모 미군 항공대대 반환 공여지, 복합 문화·스마트 공원 개발',
      },
      {
        siteId: 'cc-102-depot',
        name: '구 102보충대 유휴부지',
        category: 'depot',
        coords: [127.7548, 37.9304],
        areaSqm: 145000,
        description: '신북읍 용산리 보충대 해체 부지, 청년 창업 및 융복합 관광단지 추진',
      },
    ],
    description: '강원특별자치도청 소재지이자 호반의 도시, 바이오·ICT 첨단 지식산업 중심지',
  },

  // ---------------------------------------------------------------------------
  // [2. 원주시] 영서 남부 거점, 군수·물류 교통망 밀집
  // ---------------------------------------------------------------------------
  {
    id: 'wonju',
    name: '원주시',
    fullName: '강원특별자치도 원주시',
    type: '시',
    admCode: '51130',
    legacyAdmCode: '42130',
    bjdPrefix: '51130',
    subregion: '영서남부',
    center: [127.9351, 37.3592],
    zoom: 13.2,
    pitch: 50,
    bearing: 20,
    bbox: [127.75, 37.15, 128.15, 37.55],
    terrainCharacteristic: '치악산 서사면 경사지 및 원주천 침식 분지, 광역 고속철도 분기점',
    densityType: 'urban_dense',
    militarySites: [
      {
        siteId: 'wj-1st-logistics',
        name: '제1군수지원사령부(1군지사) 이전 유휴부지',
        category: 'logistics',
        coords: [127.9389, 37.3653],
        areaSqm: 310000,
        description: '우산동·학성동 중심부 군수 보급창고 및 정비창 부지, 도시재생 혁신지구',
      },
      {
        siteId: 'wj-camp-long',
        name: '캠프 롱(Camp Long) 미군 반환 기지',
        category: 'army',
        coords: [127.9542, 37.3789],
        areaSqm: 340000,
        description: '태장동 소재 주한미군 기지, 국립원주과학관 및 북원 복합체육공원 조성',
      },
    ],
    description: '강원도 최대 인구 도시이자 의료기기·스마트물류 거점, 중부내륙 철도 허브',
  },

  // ---------------------------------------------------------------------------
  // [3. 강릉시] 영동 거점, 대관령과 동해안 해안선 대비
  // ---------------------------------------------------------------------------
  {
    id: 'gangneung',
    name: '강릉시',
    fullName: '강원특별자치도 강릉시',
    type: '시',
    admCode: '51150',
    legacyAdmCode: '42150',
    bjdPrefix: '51150',
    subregion: '영동남부',
    center: [128.8761, 37.7519],
    zoom: 13.0,
    pitch: 54,
    bearing: -10,
    bbox: [128.60, 37.50, 129.10, 37.95],
    terrainCharacteristic: '대관령 산맥 급경사면과 경포호·남대천 동해안 석호 평야',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'gn-18-fighter-wing',
        name: '공군 제18전투비행단 인접 완충지구',
        category: 'airforce',
        coords: [128.9431, 37.7534],
        areaSqm: 280000,
        description: '남항진동·입암동 비행안전구역 주변 유휴 완충녹지 및 해양관광 연계축',
      },
    ],
    description: '영동권의 행정·문화·관광 중심지, 올림픽 유산 및 환동해 물류 거점',
  },

  // ---------------------------------------------------------------------------
  // [4. 동해시] 항만 물류 및 해안 단구 산업 인프라
  // ---------------------------------------------------------------------------
  {
    id: 'donghae',
    name: '동해시',
    fullName: '강원특별자치도 동해시',
    type: '시',
    admCode: '51170',
    legacyAdmCode: '42170',
    bjdPrefix: '51170',
    subregion: '영동남부',
    center: [129.1143, 37.5247],
    zoom: 13.1,
    pitch: 52,
    bearing: 0,
    bbox: [128.98, 37.40, 129.18, 37.62],
    terrainCharacteristic: '묵호항·동해신항 해안선 및 북평산업단지 해안 배후지',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'dh-1st-fleet',
        name: '해군 제1함대 사령부 외곽 완충부지',
        category: 'army',
        coords: [129.1085, 37.5012],
        areaSqm: 190000,
        description: '송정동 배후 해군 기지 외곽 완충 구역 및 철도 인입선 유휴지',
      },
    ],
    description: '환동해권 북방물류 중심항만 및 수소·해양 신산업 전략 거점',
  },

  // ---------------------------------------------------------------------------
  // [5. 태백시] 해발 700m+ 고원 산악 분지 지형
  // ---------------------------------------------------------------------------
  {
    id: 'taebaek',
    name: '태백시',
    fullName: '강원특별자치도 태백시',
    type: '시',
    admCode: '51190',
    legacyAdmCode: '42190',
    bjdPrefix: '51190',
    subregion: '영서남부',
    center: [128.9888, 37.1640],
    zoom: 13.3,
    pitch: 58,
    bearing: 25,
    bbox: [128.85, 37.05, 129.10, 37.28],
    terrainCharacteristic: '태백산·함백산 고원 침식 분지, 황지연못 발원지 고지대',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'tb-reserve-depot',
        name: '황지동 구 지역방위 대대 유휴지',
        category: 'depot',
        coords: [128.9754, 37.1812],
        areaSqm: 110000,
        description: '탄광 구조조정 및 군부대 통폐합에 따른 고원 청정에너지 실증단지',
      },
    ],
    description: '대한민국 최고 지대 고원도시, 산악 관광 및 청정 고원 스포츠 메카',
  },

  // ---------------------------------------------------------------------------
  // [6. 속초시] 설악산 국립공원과 동해안 석호 결합 조감
  // ---------------------------------------------------------------------------
  {
    id: 'sokcho',
    name: '속초시',
    fullName: '강원특별자치도 속초시',
    type: '시',
    admCode: '51210',
    legacyAdmCode: '42210',
    bjdPrefix: '51210',
    subregion: '영동북부(접경)',
    center: [128.5918, 38.2070],
    zoom: 13.4,
    pitch: 54,
    bearing: -20,
    bbox: [128.48, 38.12, 128.62, 38.25],
    terrainCharacteristic: '설악산 울산바위 배경과 청초호·영랑호 해안 석호 평지',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'sc-coastal-radar',
        name: '영랑동 해안감시 레이더 주변 유휴지',
        category: 'border_post',
        coords: [128.5982, 38.2215],
        areaSqm: 85000,
        description: '해안 철책 철거 구역 배후지, 해양 레저 및 생태 탐방로 연결',
      },
    ],
    description: '동서고속화철도 종착역, 글로벌 크루즈 관광 및 설악권 국제 관광 거점',
  },

  // ---------------------------------------------------------------------------
  // [7. 삼척시] 복합 해안·산악 에너지 벨트 지형
  // ---------------------------------------------------------------------------
  {
    id: 'samcheok',
    name: '삼척시',
    fullName: '강원특별자치도 삼척시',
    type: '시',
    admCode: '51230',
    legacyAdmCode: '42230',
    bjdPrefix: '51230',
    subregion: '영동남부',
    center: [129.1658, 37.4498],
    zoom: 13.0,
    pitch: 52,
    bearing: 10,
    bbox: [128.95, 37.05, 129.35, 37.52],
    terrainCharacteristic: '석회암 카르스트 동굴 지대와 동해 중부 굴곡 해안 단구',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'sc-energy-buffer',
        name: '원덕읍 LNG 생산기지 인근 군 완충부지',
        category: 'border_post',
        coords: [129.3142, 37.1625],
        areaSqm: 175000,
        description: '국가중요시설 방호 완충 구역, 수소 R&D 특화단지 조성 추진',
      },
    ],
    description: '수소 R&D 특화도시, 천연가스 인수기지 및 해양 에너지 신산업 거점',
  },

  // ---------------------------------------------------------------------------
  // [8. 홍천군] 전국 기초지자체 최대 면적, 군사작전 도로망
  // ---------------------------------------------------------------------------
  {
    id: 'hongcheon',
    name: '홍천군',
    fullName: '강원특별자치도 홍천군',
    type: '군',
    admCode: '51720',
    legacyAdmCode: '42720',
    bjdPrefix: '51720',
    subregion: '영서남부',
    center: [127.8887, 37.6972],
    zoom: 12.4,
    pitch: 50,
    bearing: 15,
    bbox: [127.50, 37.45, 128.40, 37.95],
    terrainCharacteristic: '홍천강 곡류 수계와 방대한 산림 산악 능선, 44번 국도 군류축',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'hc-11th-division',
        name: '구 11기동사단 하부 군수 유휴부지',
        category: 'army',
        coords: [127.8945, 37.6832],
        areaSqm: 230000,
        description: '홍천읍 갈마곡리·연봉리 소재 전차대대 이전부지, 스마트 바이오 허브',
      },
    ],
    description: '수도권과 강원 내륙을 잇는 교통 관문, 바이오·항체 신약 클러스터',
  },

  // ---------------------------------------------------------------------------
  // [9. 횡성군] 원주 인접 완충 구역, 군 비행장 인접 평탄지
  // ---------------------------------------------------------------------------
  {
    id: 'hoengseong',
    name: '횡성군',
    fullName: '강원특별자치도 횡성군',
    type: '군',
    admCode: '51730',
    legacyAdmCode: '42730',
    bjdPrefix: '51730',
    subregion: '영서남부',
    center: [127.9851, 37.4918],
    zoom: 12.8,
    pitch: 50,
    bearing: 20,
    bbox: [127.80, 37.30, 128.25, 37.65],
    terrainCharacteristic: '섬강 상류 충적 평야 및 완만한 구릉지대, 원주공항 인접 평지',
    densityType: 'urban_dense',
    militarySites: [
      {
        siteId: 'hs-wonju-airport',
        name: '횡성읍 곡교리 비행안전구역 주변 유휴부지',
        category: 'airforce',
        coords: [127.9652, 37.4621],
        areaSqm: 260000,
        description: '공군 제8전투비행단 인접 소음대책 완충구역, e-모빌리티 실증단지',
      },
    ],
    description: '강원 e-모빌리티 클러스터의 중심, 한우 명품화 및 수도권 인접 물류지',
  },

  // ---------------------------------------------------------------------------
  // [10. 영월군] 감입곡류 하천 및 석회암 카르스트 지형
  // ---------------------------------------------------------------------------
  {
    id: 'yeongwol',
    name: '영월군',
    fullName: '강원특별자치도 영월군',
    type: '군',
    admCode: '51750',
    legacyAdmCode: '42750',
    bjdPrefix: '51750',
    subregion: '영서남부',
    center: [128.4619, 37.1838],
    zoom: 12.6,
    pitch: 55,
    bearing: 30,
    bbox: [128.20, 37.00, 128.75, 37.35],
    terrainCharacteristic: '동강과 서강이 합류하는 감입곡류 및 한반도지형 석회암 절벽',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'yw-defense-battery',
        name: '영월읍 하송리 방공진지 주변지',
        category: 'depot',
        coords: [128.4712, 37.1725],
        areaSqm: 95000,
        description: '발전소 및 철도교 방호 진지 주변 완충지, 드론 실증 비행장 조성',
      },
    ],
    description: '단종의 역사와 동강 생태 보고, 미래 드론 산업 중심 실증도시',
  },

  // ---------------------------------------------------------------------------
  // [11. 평창군] 고랭지 산악 지형, 대관령 고원지대
  // ---------------------------------------------------------------------------
  {
    id: 'pyeongchang',
    name: '평창군',
    fullName: '강원특별자치도 평창군',
    type: '군',
    admCode: '51760',
    legacyAdmCode: '42760',
    bjdPrefix: '51760',
    subregion: '영서남부',
    center: [128.3902, 37.3705],
    zoom: 12.3,
    pitch: 54,
    bearing: 15,
    bbox: [128.15, 37.20, 128.75, 37.75],
    terrainCharacteristic: '평균 해발 600m+ 고원 구릉지대, 동계올림픽 경기장 슬로프',
    densityType: 'highland_rural',
    militarySites: [
      {
        siteId: 'pc-olympic-depot',
        name: '대관령면 횡계리 군수지원 유휴시설',
        category: 'depot',
        coords: [128.7102, 37.6741],
        areaSqm: 140000,
        description: '올림픽 안전지원 군 본부 이전부지, 평화테마파크 및 산악레저',
      },
    ],
    description: '2018 평창동계올림픽 개최지, 평화 테마 관광 및 청정 산림치유 거점',
  },

  // ---------------------------------------------------------------------------
  // [12. 정선군] 깊은 산악 협곡 및 석탄 폐광 유휴 인프라
  // ---------------------------------------------------------------------------
  {
    id: 'jeongseon',
    name: '정선군',
    fullName: '강원특별자치도 정선군',
    type: '군',
    admCode: '51770',
    legacyAdmCode: '42770',
    bjdPrefix: '51770',
    subregion: '영서남부',
    center: [128.6606, 37.3805],
    zoom: 12.6,
    pitch: 56,
    bearing: 20,
    bbox: [128.40, 37.15, 128.95, 37.60],
    terrainCharacteristic: '조양강 산악 협곡과 백운산·민둥산 험준한 산세',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'js-mine-security',
        name: '사북읍·고한읍 폐광 보안시설 유휴부지',
        category: 'depot',
        coords: [128.8105, 37.2289],
        areaSqm: 130000,
        description: '구 탄광 보안 시설 및 보급창고, 산림 생태 재생 및 레저 파크',
      },
    ],
    description: '아리랑의 발상지, 가리왕산 국가정원 및 사계절 웰니스 산악 레저벨트',
  },

  // ---------------------------------------------------------------------------
  // [13. 철원군] 최전방 접경 분지, 군사시설보호구역 최다 밀집
  // ---------------------------------------------------------------------------
  {
    id: 'cheorwon',
    name: '철원군',
    fullName: '강원특별자치도 철원군',
    type: '군',
    admCode: '51780',
    legacyAdmCode: '42780',
    bjdPrefix: '51780',
    subregion: '영서북부(접경)',
    center: [127.3134, 38.1468],
    zoom: 12.5,
    pitch: 50,
    bearing: 0,
    bbox: [127.05, 38.00, 127.55, 38.35],
    terrainCharacteristic: '한탄강 현무암 주상절리 협곡과 철원평야의 광활한 평탄지',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'cw-6th-division-post',
        name: '갈말읍 문혜리 포병사격장 인근 군 유휴지',
        category: 'army',
        coords: [127.3512, 38.1345],
        areaSqm: 420000,
        description: '접경지역 군사시설 재배치에 따른 미활용 군용지, 평화밀리터리 테마파크',
      },
      {
        siteId: 'cw-dmz-border',
        name: '철원읍 월정리역 DMZ 평화공원 예정지',
        category: 'border_post',
        coords: [127.2045, 38.2712],
        areaSqm: 380000,
        description: '민간인통제선 북방 최전방 유휴부지, 남북 철도 복원 및 생태 공원',
      },
    ],
    description: '국토 최전방 안보·생태의 보고, 유네스코 한탄강 지질공원과 철원오대쌀 산지',
  },

  // ---------------------------------------------------------------------------
  // [14. 화천군] 평화의 댐·북한강 수계 및 전방 군사 배후지
  // ---------------------------------------------------------------------------
  {
    id: 'hwacheon',
    name: '화천군',
    fullName: '강원특별자치도 화천군',
    type: '군',
    admCode: '51790',
    legacyAdmCode: '42790',
    bjdPrefix: '51790',
    subregion: '영서북부(접경)',
    center: [127.7082, 38.1062],
    zoom: 12.6,
    pitch: 54,
    bearing: 10,
    bbox: [127.45, 38.00, 127.90, 38.30],
    terrainCharacteristic: '파로호·화천호 수계와 용화산·화악산 험준한 산악 협곡',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'hc-27th-division',
        name: '구 27사단(이기자부대) 해체 부지',
        category: 'army',
        coords: [127.5345, 38.1215],
        areaSqm: 350000,
        description: '사내면 사창리 소재 사단 사령부 및 연대 주둔지, 복합 복지·상생 타운',
      },
      {
        siteId: 'hc-peace-dam',
        name: '동촌리 평화의 댐 상류 국방 배후지',
        category: 'border_post',
        coords: [127.8489, 38.2145],
        areaSqm: 180000,
        description: '북한강 최북단 군사 방호 부지, DMZ 평화의 길 안보 생태 공원',
      },
    ],
    description: '산천어축제의 본고장, 사계절 호수 생태관광 및 국방 산업 연계 지역',
  },

  // ---------------------------------------------------------------------------
  // [15. 양구군] 국토 정중앙, 펀치볼(해안분지) 3D 지형
  // ---------------------------------------------------------------------------
  {
    id: 'yanggu',
    name: '양구군',
    fullName: '강원특별자치도 양구군',
    type: '군',
    admCode: '51800',
    legacyAdmCode: '42800',
    bjdPrefix: '51800',
    subregion: '영서북부(접경)',
    center: [127.9897, 38.1054],
    zoom: 12.7,
    pitch: 52,
    bearing: 15,
    bbox: [127.85, 38.00, 128.25, 38.35],
    terrainCharacteristic: '화강암 차별침식으로 형성된 완벽한 원형 해안분지(Punch Bowl)',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'yg-punchbowl-post',
        name: '해안면 펀치볼 외곽 군 경계 진지',
        category: 'border_post',
        coords: [128.1456, 38.2845],
        areaSqm: 210000,
        description: '해안분지 고지대 관측소 및 사격장 완충 구역, 지질 안보 생태 투어',
      },
      {
        siteId: 'yg-2nd-division',
        name: '구 2사단(노도부대) 사령부 유휴지',
        category: 'army',
        coords: [127.9945, 38.1125],
        areaSqm: 290000,
        description: '양구읍 하리 소재 군단 직할 부지, 스마트 국방 벤처·문화 힐링 지구',
      },
    ],
    description: '한반도 정중앙 좌표점 보유, 을지전망대·제4땅굴 등 평화·안보 관광지',
  },

  // ---------------------------------------------------------------------------
  // [16. 인제군] 백두대간 관통 국도망 및 군 유휴지 분석 권역
  // ---------------------------------------------------------------------------
  {
    id: 'inje',
    name: '인제군',
    fullName: '강원특별자치도 인제군',
    type: '군',
    admCode: '51810',
    legacyAdmCode: '42810',
    bjdPrefix: '51810',
    subregion: '영서북부(접경)',
    center: [128.1704, 38.0697],
    zoom: 12.4,
    pitch: 55,
    bearing: 25,
    bbox: [128.00, 37.85, 128.45, 38.30],
    terrainCharacteristic: '내린천·소양강 상류 계곡과 점봉산·대암산 고산 령맥',
    densityType: 'mountain_basin',
    militarySites: [
      {
        siteId: 'ij-wontong-depot',
        name: '북면 원통리 군 보급정비대대 유휴부지',
        category: 'logistics',
        coords: [128.2045, 38.1289],
        areaSqm: 310000,
        description: '원통 시가지 확장 연계 군수 유휴지, 동서고속철도 백담역 역세권 개발',
      },
    ],
    description: '자작나무숲과 래프팅의 고장, 모터스포츠 및 내린천 힐링 산림수도',
  },

  // ---------------------------------------------------------------------------
  // [17. 고성군] 동해선 철도 연결축 및 동해안 접경 최북단
  // ---------------------------------------------------------------------------
  {
    id: 'goseong',
    name: '고성군',
    fullName: '강원특별자치도 고성군',
    type: '군',
    admCode: '51820',
    legacyAdmCode: '42820',
    bjdPrefix: '51820',
    subregion: '영동북부(접경)',
    center: [128.4678, 38.3806],
    zoom: 12.6,
    pitch: 52,
    bearing: -15,
    bbox: [128.25, 38.20, 128.60, 38.65],
    terrainCharacteristic: '통일전망대·화진포 석호와 금강산 초입 해안선 연결축',
    densityType: 'border_military',
    militarySites: [
      {
        siteId: 'gs-dmz-observatory',
        name: '현내면 통일전망대 배후 국방 유휴지',
        category: 'border_post',
        coords: [128.3689, 38.5789],
        areaSqm: 240000,
        description: '동해선 도로·철도 최북단 CIQ 주변지, 남북 평화교류 물류 전진기지',
      },
      {
        siteId: 'gs-coastal-wire',
        name: '거진읍 해안 경계초소 철거 유휴지',
        category: 'border_post',
        coords: [128.4578, 38.4412],
        areaSqm: 95000,
        description: '해안선 군 철책 제거 개방 지구, 동해안 해안 트레킹 관광로',
      },
    ],
    description: '대한민국 최북단 명태의 고장, 화진포·송지호 석호 및 금강산 육로 관문',
  },

  // ---------------------------------------------------------------------------
  // [18. 양양군] 양양국제공항, 고속도로 종점 연계 광역 교통축
  // ---------------------------------------------------------------------------
  {
    id: 'yangyang',
    name: '양양군',
    fullName: '강원특별자치도 양양군',
    type: '군',
    admCode: '51830',
    legacyAdmCode: '42830',
    bjdPrefix: '51830',
    subregion: '영동북부(접경)',
    center: [128.6289, 38.0754],
    zoom: 12.8,
    pitch: 50,
    bearing: -10,
    bbox: [128.40, 37.90, 128.75, 38.15],
    terrainCharacteristic: '남대천 연어 회귀 하천 및 서피비치·기사문 완만한 해안사구',
    densityType: 'coastal_port',
    militarySites: [
      {
        siteId: 'yy-airport-buffer',
        name: '손양면 양양국제공항 인근 공군 완충지',
        category: 'airforce',
        coords: [128.6652, 38.0612],
        areaSqm: 320000,
        description: '공항 및 해안 방공진지 주변 완충구역, 항공 물류 및 복합 리조트',
      },
    ],
    description: '대한민국 서핑 1번지 서피비치, 낙산사 및 양양국제공항 보유 관광 특화군',
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
