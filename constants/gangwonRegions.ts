export interface RegionPreset {
  id: string;
  name: string;
  type: '시' | '군';
  subregion: '영서북부(접경)' | '영서남부' | '영동북부(접경)' | '영동남부';
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export const GANGWON_REGIONS: RegionPreset[] = [
  { id: 'chuncheon', name: '춘천시', type: '시', subregion: '영서북부(접경)', center: [127.7342, 37.8853], zoom: 12.8, pitch: 52, bearing: 15, description: '도청 소재지, 수변 및 산악 분지 지형' },
  { id: 'wonju', name: '원주시', type: '시', subregion: '영서남부', center: [127.9198, 37.3422], zoom: 12.5, pitch: 50, bearing: 20, description: '영서 남부 거점, 군 유휴부지 및 광역 교통망 밀집' },
  { id: 'gangneung', name: '강릉시', type: '시', subregion: '영동남부', center: [128.8761, 37.7519], zoom: 12.7, pitch: 55, bearing: -10, description: '영동 거점, 동해안 해안선과 대관령 산맥 3D 대비' },
  { id: 'donghae', name: '동해시', type: '시', subregion: '영동남부', center: [129.1143, 37.5247], zoom: 13.0, pitch: 52, bearing: 0, description: '항만 물류 및 해안 단구 산업 인프라' },
  { id: 'taebaek', name: '태백시', type: '시', subregion: '영서남부', center: [128.9888, 37.1640], zoom: 13.2, pitch: 58, bearing: 25, description: '고원 산악 분지 지형, 표고 고저차 극대화' },
  { id: 'sokcho', name: '속초시', type: '시', subregion: '영동북부(접경)', center: [128.5918, 38.2070], zoom: 13.4, pitch: 54, bearing: -20, description: '설악산 국립공원과 동해안 결합 조감' },
  { id: 'samcheok', name: '삼척시', type: '시', subregion: '영동남부', center: [129.1658, 37.4498], zoom: 12.8, pitch: 52, bearing: 10, description: '복합 해안·산악 에너지 벨트 지형' },
  { id: 'hongcheon', name: '홍천군', type: '군', subregion: '영서남부', center: [127.8887, 37.6972], zoom: 12.0, pitch: 50, bearing: 15, description: '전국 기초지자체 최대 면적, 군사작전 도로망' },
  { id: 'hoengseong', name: '횡성군', type: '군', subregion: '영서남부', center: [127.9851, 37.4918], zoom: 12.6, pitch: 50, bearing: 20, description: '원주 인접 완충 구역, 공군기지 인접 평탄지' },
  { id: 'yeongwol', name: '영월군', type: '군', subregion: '영서남부', center: [128.4619, 37.1838], zoom: 12.5, pitch: 55, bearing: 30, description: '감입곡류 하천 및 석회암 카르스트 지형' },
  { id: 'pyeongchang', name: '평창군', type: '군', subregion: '영서남부', center: [128.3902, 37.3705], zoom: 12.2, pitch: 54, bearing: 15, description: '고랭지 산악 지형, 대관령 고원지대' },
  { id: 'jeongseon', name: '정선군', type: '군', subregion: '영서남부', center: [128.6606, 37.3805], zoom: 12.5, pitch: 56, bearing: 20, description: '깊은 산악 협곡 및 석탄 폐광 유휴 인프라' },
  { id: 'cheorwon', name: '철원군', type: '군', subregion: '영서북부(접경)', center: [127.3134, 38.1468], zoom: 12.3, pitch: 50, bearing: 0, description: '최전방 접경 분지, 군사시설보호구역 최다 밀집' },
  { id: 'hwacheon', name: '화천군', type: '군', subregion: '영서북부(접경)', center: [127.7082, 38.1062], zoom: 12.5, pitch: 54, bearing: 10, description: '평화의 댐·북한강 수계 및 전방 군사 배후지' },
  { id: 'yanggu', name: '양구군', type: '군', subregion: '영서북부(접경)', center: [127.9897, 38.1054], zoom: 12.6, pitch: 52, bearing: 15, description: '국토 정중앙, 펀치볼(해안분지) 3D 지형' },
  { id: 'inje', name: '인제군', type: '군', subregion: '영서북부(접경)', center: [128.1704, 38.0697], zoom: 12.2, pitch: 55, bearing: 25, description: '백두대간 관통 국도망 및 군 유휴지 분석 권역' },
  { id: 'goseong', name: '고성군', type: '군', subregion: '영동북부(접경)', center: [128.4678, 38.3806], zoom: 12.5, pitch: 52, bearing: -15, description: '동해선 철도 연결축 및 동해안 접경 최북단' },
  { id: 'yangyang', name: '양양군', type: '군', subregion: '영동북부(접경)', center: [128.6289, 38.0754], zoom: 12.6, pitch: 50, bearing: -10, description: '양양국제공항, 고속도로 종점 연계 광역 교통축' }
];
