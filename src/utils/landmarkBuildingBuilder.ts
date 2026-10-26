/**
 * landmarkBuildingBuilder.ts
 *
 * [GeoBrief 3D 2단계] 강원 18개 시·군 관공서·공공기관·학교·병원 랜드마크 실사 조형 엔진
 *
 * OSMBuildings 복합 건물(Multipart Building) 절차적 생성 기법 벤더링:
 * 1. 관공서·공공청사(원주시청, 도청, 군청, 법원, 검찰청, 심사평가원, 관광공사 등):
 *    - 1~3층 광폭 민원실 포디움 (0m ~ 12m, 화강석 석재 + 통유리 아트리움 로비 + 옥상 조경 테라스)
 *    - 상층부 본관 타워 (12m ~ H, 20% Setback 인셋 + 은청색 반사 유리 커튼월 + 수직 루버)
 *    - 옥상 상징 조형 프레임, 태양광 패널 모듈, 헬리패드
 * 2. 초·중·고교 및 대학교 캠퍼스:
 *    - 4~5층(14m~18m), 적벽돌/아이보리 투톤 + 교실 창문 배열 + 중앙 현관 시계탑/포치 + 세이지 그린 박공지붕
 * 3. 대형 종합병원(원주의료원, 원주세브란스기독병원, 강원대병원, 강릉아산병원 등):
 *    - 화이트/실버 알루미늄 패널 + 그린 틴티드 수평 리본 창호 + 응급실(ER) 앰뷸런스 하차장 캐노피 + 옥상 닥터헬기 헬리패드('H')
 * 4. KTX 기차역(원주역, 만종역, 춘천역, 강릉역 등):
 *    - 대공간 트러스 아치 지붕 + 유리 로비 파사드
 * 5. 강원 18개 시·군 전역 랜드마크 자동 인식 사전 탑재
 */

import Earcut from 'earcut';
import { getDiverseFacadeSlotUV, DiverseUVRect } from './diverseKoreanFacadeAtlas';

export type LandmarkType =
  | 'government' // 시청, 도청, 군청, 법원, 공공기관 (3단 복합 조형)
  | 'school' // 초중고교 및 대학교 캠퍼스 (적벽돌/시계탑/녹색지붕)
  | 'hospital' // 대형 종합병원 (실버패널/그린틴티드창/닥터헬기 헬리패드)
  | 'ktx_station' // KTX 기차역 (곡면 트러스 아치 지붕)
  | 'police_fire'; // 경찰서, 소방서

export interface LandmarkInfo {
  type: LandmarkType;
  name: string;
  targetHeight?: number;
  hasHelipad?: boolean;
  hasClockTower?: boolean;
  hasCanopy?: boolean;
}

export interface LandmarkBuildOptions {
  pts2D: { x: number; z: number }[];
  baseElev: number;
  height: number;
  featProps: Record<string, any>;
  landmark: LandmarkInfo;
  addQuad: (
    pBL: [number, number, number],
    pBR: [number, number, number],
    pTR: [number, number, number],
    pTL: [number, number, number],
    norm: [number, number, number],
    uvRect: DiverseUVRect
  ) => void;
  addTriangle: (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    norm: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number]
  ) => void;
}

// =============================================================================
// [1. 강원 18개 시·군 랜드마크 자동 인식 사전 (GANGWON_18_LANDMARKS)]
// =============================================================================

export interface GangwonLandmarkEntry {
  name: string;
  city: string;
  type: LandmarkType;
  lng: number;
  lat: number;
  radiusMeters: number;
  height: number;
}

export const GANGWON_18_LANDMARKS: GangwonLandmarkEntry[] = [
  // --- 원주시 (Wonju) ---
  { name: '원주시청', city: '원주', type: 'government', lng: 127.92007, lat: 37.3426, radiusMeters: 140, height: 59.5 },
  { name: '원주시청 백운아트홀', city: '원주', type: 'government', lng: 127.91887, lat: 37.34121, radiusMeters: 90, height: 27.7 },
  { name: '건강보험심사평가원 본원', city: '원주', type: 'government', lng: 127.9738, lat: 37.3323, radiusMeters: 160, height: 110.0 },
  { name: '국민건강보험공단 본부', city: '원주', type: 'government', lng: 127.9782, lat: 37.3276, radiusMeters: 150, height: 86.0 },
  { name: '한국관광공사 본사', city: '원주', type: 'government', lng: 127.9815, lat: 37.3262, radiusMeters: 120, height: 52.0 },
  { name: '국립과학수사연구원', city: '원주', type: 'government', lng: 127.9882, lat: 37.3218, radiusMeters: 140, height: 35.0 },
  { name: '도로교통공단 본부', city: '원주', type: 'government', lng: 127.9751, lat: 37.3298, radiusMeters: 120, height: 48.0 },
  { name: '한국광해광업공단', city: '원주', type: 'government', lng: 127.9765, lat: 37.3287, radiusMeters: 110, height: 54.0 },
  { name: '춘천지방법원 원주지원', city: '원주', type: 'government', lng: 127.9275, lat: 37.3278, radiusMeters: 120, height: 38.0 },
  { name: '춘천지방검찰청 원주지청', city: '원주', type: 'government', lng: 127.9292, lat: 37.3275, radiusMeters: 120, height: 36.0 },
  { name: '강원특별자치도 원주의료원', city: '원주', type: 'hospital', lng: 127.94898, lat: 37.33264, radiusMeters: 140, height: 36.0 },
  { name: '원주세브란스기독병원', city: '원주', type: 'hospital', lng: 127.94668, lat: 37.34799, radiusMeters: 160, height: 49.5 },
  { name: 'KTX 원주역', city: '원주', type: 'ktx_station', lng: 127.9312, lat: 37.3115, radiusMeters: 130, height: 16.5 },
  { name: 'KTX 만종역', city: '원주', type: 'ktx_station', lng: 127.8864, lat: 37.3718, radiusMeters: 130, height: 16.0 },
  { name: '만대초등학교', city: '원주', type: 'school', lng: 127.91987, lat: 37.33946, radiusMeters: 110, height: 16.7 },
  { name: '반곡초등학교', city: '원주', type: 'school', lng: 127.97326, lat: 37.33581, radiusMeters: 110, height: 15.7 },
  { name: '단구중학교', city: '원주', type: 'school', lng: 127.9542, lat: 37.3255, radiusMeters: 120, height: 16.5 },
  { name: '남원주중학교', city: '원주', type: 'school', lng: 127.9378, lat: 37.3262, radiusMeters: 120, height: 16.5 },
  { name: '원주고등학교', city: '원주', type: 'school', lng: 127.9585, lat: 37.3372, radiusMeters: 130, height: 17.5 },
  { name: '치악고등학교', city: '원주', type: 'school', lng: 127.9658, lat: 37.3225, radiusMeters: 120, height: 17.0 },
  { name: '상지대학교', city: '원주', type: 'school', lng: 127.9255, lat: 37.3688, radiusMeters: 250, height: 28.0 },
  { name: '연세대학교 미래캠퍼스', city: '원주', type: 'school', lng: 127.9002, lat: 37.2842, radiusMeters: 300, height: 32.0 },
  { name: '강릉원주대학교 원주캠퍼스', city: '원주', type: 'school', lng: 127.9892, lat: 37.3115, radiusMeters: 250, height: 24.0 },

  // --- 춘천시 (Chuncheon) ---
  { name: '강원특별자치도청', city: '춘천', type: 'government', lng: 127.7298, lat: 37.8854, radiusMeters: 150, height: 42.0 },
  { name: '춘천시청', city: '춘천', type: 'government', lng: 127.7348, lat: 37.8812, radiusMeters: 140, height: 48.0 },
  { name: '강원대학교병원', city: '춘천', type: 'hospital', lng: 127.7462, lat: 37.8765, radiusMeters: 150, height: 42.0 },
  { name: '한림대학교 춘천성심병원', city: '춘천', type: 'hospital', lng: 127.7445, lat: 37.8835, radiusMeters: 140, height: 45.0 },
  { name: 'KTX 춘천역', city: '춘천', type: 'ktx_station', lng: 127.7172, lat: 37.8845, radiusMeters: 130, height: 16.5 },
  { name: 'KTX 남춘천역', city: '춘천', type: 'ktx_station', lng: 127.7235, lat: 37.8638, radiusMeters: 130, height: 16.0 },
  { name: '강원대학교 춘천캠퍼스', city: '춘천', type: 'school', lng: 127.7455, lat: 37.8692, radiusMeters: 350, height: 32.0 },
  { name: '한림대학교', city: '춘천', type: 'school', lng: 127.7392, lat: 37.8868, radiusMeters: 250, height: 28.0 },

  // --- 강릉시 (Gangneung) ---
  { name: '강릉시청', city: '강릉', type: 'government', lng: 128.8785, lat: 37.7518, radiusMeters: 150, height: 68.0 },
  { name: '강릉아산병원', city: '강릉', type: 'hospital', lng: 128.8475, lat: 37.8185, radiusMeters: 180, height: 52.0 },
  { name: '강릉의료원', city: '강릉', type: 'hospital', lng: 128.8925, lat: 37.7538, radiusMeters: 120, height: 28.0 },
  { name: 'KTX 강릉역', city: '강릉', type: 'ktx_station', lng: 128.8992, lat: 37.7645, radiusMeters: 150, height: 18.0 },
  { name: '강릉원주대학교 강릉캠퍼스', city: '강릉', type: 'school', lng: 128.8685, lat: 37.7712, radiusMeters: 300, height: 28.0 },
  { name: '가톨릭관동대학교', city: '강릉', type: 'school', lng: 128.8825, lat: 37.7352, radiusMeters: 280, height: 32.0 },

  // --- 동해시 (Donghae) ---
  { name: '동해시청', city: '동해', type: 'government', lng: 129.1145, lat: 37.5248, radiusMeters: 130, height: 38.0 },
  { name: 'KTX 동해역', city: '동해', type: 'ktx_station', lng: 129.1385, lat: 37.4982, radiusMeters: 130, height: 16.0 },
  { name: '근로복지공단 동해병원', city: '동해', type: 'hospital', lng: 129.1245, lat: 37.5085, radiusMeters: 120, height: 28.0 },

  // --- 태백시 (Taebaek) ---
  { name: '태백시청', city: '태백', type: 'government', lng: 128.9885, lat: 37.1642, radiusMeters: 120, height: 32.0 },
  { name: '근로복지공단 태백병원', city: '태백', type: 'hospital', lng: 128.9952, lat: 37.1725, radiusMeters: 120, height: 28.0 },

  // --- 속초시 (Sokcho) ---
  { name: '속초시청', city: '속초', type: 'government', lng: 128.5918, lat: 38.2072, radiusMeters: 120, height: 36.0 },
  { name: '강원특별자치도 속초의료원', city: '속초', type: 'hospital', lng: 128.5795, lat: 38.2015, radiusMeters: 120, height: 28.0 },

  // --- 삼척시 (Samcheok) ---
  { name: '삼척시청', city: '삼척', type: 'government', lng: 129.1652, lat: 37.4498, radiusMeters: 130, height: 36.0 },
  { name: '강원특별자치도 삼척의료원', city: '삼척', type: 'hospital', lng: 129.1625, lat: 37.4425, radiusMeters: 120, height: 28.0 },
  { name: '강원대학교 삼척캠퍼스', city: '삼척', type: 'school', lng: 129.1612, lat: 37.4565, radiusMeters: 250, height: 28.0 },

  // --- 8개 군청 (Hongcheon, Hoengseong, Yeongwol, Pyeongchang, Jeongseon, Cheorwon, Hwacheon, Yanggu, Inje, Goseong, Yangyang) ---
  { name: '홍천군청', city: '홍천', type: 'government', lng: 127.8885, lat: 37.6972, radiusMeters: 120, height: 32.0 },
  { name: '홍천아산병원', city: '홍천', type: 'hospital', lng: 127.8995, lat: 37.6925, radiusMeters: 110, height: 24.0 },
  { name: '횡성군청', city: '횡성', type: 'government', lng: 127.9852, lat: 37.4918, radiusMeters: 120, height: 32.0 },
  { name: 'KTX 횡성역', city: '횡성', type: 'ktx_station', lng: 127.9625, lat: 37.5052, radiusMeters: 120, height: 16.0 },
  { name: 'KTX 둔내역', city: '횡성', type: 'ktx_station', lng: 128.2175, lat: 37.5125, radiusMeters: 120, height: 16.0 },
  { name: '영월군청', city: '영월', type: 'government', lng: 128.4625, lat: 37.1835, radiusMeters: 120, height: 32.0 },
  { name: '강원특별자치도 영월의료원', city: '영월', type: 'hospital', lng: 128.4685, lat: 37.1812, radiusMeters: 110, height: 26.0 },
  { name: '평창군청', city: '평창', type: 'government', lng: 128.3905, lat: 37.3705, radiusMeters: 120, height: 30.0 },
  { name: 'KTX 평창역', city: '평창', type: 'ktx_station', lng: 128.4385, lat: 37.5412, radiusMeters: 120, height: 16.0 },
  { name: 'KTX 진부역', city: '평창', type: 'ktx_station', lng: 128.6015, lat: 37.6365, radiusMeters: 120, height: 16.0 },
  { name: '정선군청', city: '정선', type: 'government', lng: 128.6605, lat: 37.3805, radiusMeters: 120, height: 30.0 },
  { name: '철원군청', city: '철원', type: 'government', lng: 127.3135, lat: 38.1468, radiusMeters: 120, height: 28.0 },
  { name: '화천군청', city: '화천', type: 'government', lng: 127.7082, lat: 38.1062, radiusMeters: 120, height: 28.0 },
  { name: '양구군청', city: '양구', type: 'government', lng: 127.9895, lat: 38.1065, radiusMeters: 120, height: 28.0 },
  { name: '인제군청', city: '인제', type: 'government', lng: 128.1702, lat: 38.0695, radiusMeters: 120, height: 28.0 },
  { name: '고성군청', city: '고성', type: 'government', lng: 128.4678, lat: 38.3805, radiusMeters: 120, height: 28.0 },
  { name: '양양군청', city: '양양', type: 'government', lng: 128.6242, lat: 38.0755, radiusMeters: 120, height: 28.0 },
];

// =============================================================================
// [2. 랜드마크 자동 식별 함수 (detectLandmarkType)]
// =============================================================================

export function detectLandmarkType(
  rawCoords: [number, number][],
  props: Record<string, any>,
  cLng: number,
  cLat: number
): LandmarkInfo | null {
  const name = String(props.name || props.buildingName || props.buld_nm || props.bldNm || '').trim();
  const purps = String(props.main_purps_cd_nm || props.mainPurpsCdNm || props.use || props.usageType || '').trim();
  const address = String(props.address || props.jibun || '').trim();
  const amenity = String(props.amenity || '').toLowerCase();
  const office = String(props.office || '').toLowerCase();
  const building = String(props.building || '').toLowerCase();
  const railway = String(props.railway || '').toLowerCase();

  const fullText = `${name} ${purps} ${address} ${amenity} ${office} ${building}`.toLowerCase();

  // 1. 강원 18개 시·군 랜드마크 지리적 근접성 대조 (반경 r 이내)
  for (const lm of GANGWON_18_LANDMARKS) {
    const dLng = (cLng - lm.lng) * 88800; // ~meters at lat 37.3
    const dLat = (cLat - lm.lat) * 111000;
    const dist = Math.hypot(dLng, dLat);

    if (dist <= lm.radiusMeters) {
      // 반경 내 건물이면 랜드마크 확정
      return {
        type: lm.type,
        name: lm.name,
        targetHeight: lm.height,
        hasHelipad: lm.type === 'hospital' || lm.height >= 50.0,
        hasClockTower: lm.type === 'school',
        hasCanopy: true,
      };
    }
  }

  // 2. 주소 기반 원주시청 메인 콤플렉스 식별 (시청로 1 / 무실동 1)
  if (address.includes('무실동 1') || address.includes('시청로 1')) {
    if (name.includes('행정동') || name.includes('본관') || fullText.includes('시청')) {
      return {
        type: 'government',
        name: '원주시청 행정동',
        targetHeight: 59.5,
        hasHelipad: true,
        hasCanopy: true,
      };
    }
    if (name.includes('공연장') || name.includes('백운아트홀')) {
      return {
        type: 'government',
        name: '원주시청 백운아트홀',
        targetHeight: 27.7,
        hasHelipad: false,
        hasCanopy: true,
      };
    }
    return {
      type: 'government',
      name: '원주시청 청사',
      targetHeight: 32.0,
      hasCanopy: true,
    };
  }

  // 3. KTX 철도 역사 (railway === 'station' or KTX역)
  if (railway === 'station' || fullText.includes('ktx') || (name.endsWith('역') && !name.includes('역세권') && !name.includes('역삼'))) {
    return {
      type: 'ktx_station',
      name: name || 'KTX 역사',
      targetHeight: 16.0,
      hasCanopy: true,
    };
  }

  // 4. 대형 종합병원 / 의료원
  if (
    amenity === 'hospital' ||
    purps.includes('의료시설') ||
    fullText.includes('병원') ||
    fullText.includes('의료원') ||
    fullText.includes('세브란스') ||
    fullText.includes('아산병원') ||
    fullText.includes('기독병원')
  ) {
    const isMajor = fullText.includes('종합') || fullText.includes('의료원') || fullText.includes('대학') || fullText.includes('세브란스');
    return {
      type: 'hospital',
      name: name || '종합병원',
      targetHeight: isMajor ? 36.0 : 22.0,
      hasHelipad: isMajor,
      hasCanopy: true,
    };
  }

  // 5. 초·중·고교 및 대학교 (교육연구시설)
  if (
    amenity === 'school' ||
    amenity === 'university' ||
    amenity === 'college' ||
    building === 'school' ||
    building === 'university' ||
    purps.includes('교육연구시설') ||
    fullText.includes('초등학교') ||
    fullText.includes('중학교') ||
    fullText.includes('고등학교') ||
    fullText.includes('대학교') ||
    fullText.includes('캠퍼스') ||
    fullText.includes('초교') ||
    fullText.includes('고교')
  ) {
    return {
      type: 'school',
      name: name || '학교 캠퍼스',
      targetHeight: 16.0,
      hasClockTower: true,
      hasCanopy: true,
    };
  }

  // 6. 경찰서 / 소방서
  if (
    amenity === 'police' ||
    amenity === 'fire_station' ||
    fullText.includes('경찰서') ||
    fullText.includes('소방서') ||
    fullText.includes('지구대') ||
    fullText.includes('파출소') ||
    fullText.includes('119')
  ) {
    return {
      type: 'police_fire',
      name: name || '경찰/소방 공공청사',
      targetHeight: 16.5,
      hasCanopy: true,
    };
  }

  // 7. 일반 관공서 / 공공청사 / 공단 / 진흥원
  if (
    amenity === 'townhall' ||
    amenity === 'public_building' ||
    office === 'government' ||
    purps.includes('공공업무시설') ||
    purps.includes('업무시설(관공서)') ||
    fullText.includes('시청') ||
    fullText.includes('도청') ||
    fullText.includes('군청') ||
    fullText.includes('구청') ||
    fullText.includes('행정복지센터') ||
    fullText.includes('주민센터') ||
    fullText.includes('법원') ||
    fullText.includes('검찰청') ||
    fullText.includes('공단') ||
    fullText.includes('진흥원') ||
    fullText.includes('심사평가원') ||
    fullText.includes('관광공사') ||
    fullText.includes('한국국토정보공사') ||
    fullText.includes('우체국') ||
    fullText.includes('세무서')
  ) {
    return {
      type: 'government',
      name: name || '공공청사',
      targetHeight: 28.0,
      hasHelipad: false,
      hasCanopy: true,
    };
  }

  return null;
}

// =============================================================================
// [3. 랜드마크 맞춤형 절차적 지오메트리 빌더 함수들]
// =============================================================================

/**
 * 1. 관공서·공공청사 3단 복합 조형 (Podium + 20% Setback Tower + Crown Frame + Terrace Garden + Solar Panel)
 */
export function buildGovernmentMultipartMesh(options: LandmarkBuildOptions): void {
  const { pts2D, baseElev, addQuad, addTriangle, landmark } = options;
  const ptCount = pts2D.length;
  if (ptCount < 3) return;

  const totalH = Math.max(18.0, landmark.targetHeight || options.height);
  const podiumH = Math.min(12.0, totalH * 0.40);
  const towerH = totalH - podiumH;

  const podiumElev = baseElev + podiumH;
  const towerElev = baseElev + totalH;

  const uvPodium = getDiverseFacadeSlotUV('gov_podium');
  const uvTower = getDiverseFacadeSlotUV('gov_tower');
  const uvTerrace = getDiverseFacadeSlotUV('terrace_garden');
  const uvRoofConcrete = getDiverseFacadeSlotUV('roof_concrete_warmgray');
  const uvSolar = getDiverseFacadeSlotUV('solar_panel');
  const uvHelipad = getDiverseFacadeSlotUV('helipad_h');
  const uvCrown = getDiverseFacadeSlotUV('crown_frame');
  const uvCanopy = getDiverseFacadeSlotUV('canopy_glass');

  // 중심점(Centroid) 계산
  let cX = 0, cZ = 0;
  for (let i = 0; i < ptCount; i++) {
    cX += pts2D[i].x;
    cZ += pts2D[i].z;
  }
  cX /= ptCount;
  cZ /= ptCount;

  // ---------------------------------------------------------------------------
  // [1단] 포디움(Podium) 외벽 (0m ~ 12m, 밝은 화강석 석재 + 통유리 아트리움 로비)
  // ---------------------------------------------------------------------------
  let maxEdgeIdx = 0;
  let maxEdgeLen = 0;

  for (let i = 0; i < ptCount; i++) {
    const j = (i + 1) % ptCount;
    const p1 = pts2D[i];
    const p2 = pts2D[j];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const elen = Math.hypot(dx, dz);
    if (elen > maxEdgeLen) {
      maxEdgeLen = elen;
      maxEdgeIdx = i;
    }
    if (elen < 0.2) continue;

    const nx = dz / elen;
    const nz = -dx / elen;

    addQuad(
      [p1.x, baseElev, p1.z],
      [p2.x, baseElev, p2.z],
      [p2.x, podiumElev, p2.z],
      [p1.x, podiumElev, p1.z],
      [nx, 0, nz],
      uvPodium
    );
  }

  // [현관 캐노피] 가장 긴 변(정면) 중앙에 4.5m 돌출 유리 캐노피 생성
  if (maxEdgeLen >= 12.0) {
    const p1 = pts2D[maxEdgeIdx];
    const p2 = pts2D[(maxEdgeIdx + 1) % ptCount];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const nx = dz / maxEdgeLen;
    const nz = -dx / maxEdgeLen;

    const midX = (p1.x + p2.x) * 0.5;
    const midZ = (p1.z + p2.z) * 0.5;
    const ux = dx / maxEdgeLen;
    const uz = dz / maxEdgeLen;

    const cWidth = 9.0;
    const cDepth = 4.5;
    const cHeight = 4.2;

    const c00: [number, number, number] = [midX - ux * (cWidth / 2), baseElev + cHeight, midZ - uz * (cWidth / 2)];
    const c10: [number, number, number] = [midX + ux * (cWidth / 2), baseElev + cHeight, midZ + uz * (cWidth / 2)];
    const c11: [number, number, number] = [c10[0] + nx * cDepth, baseElev + cHeight, c10[2] + nz * cDepth];
    const c01: [number, number, number] = [c00[0] + nx * cDepth, baseElev + cHeight, c00[2] + nz * cDepth];

    // 캐노피 상판
    addQuad(c00, c10, c11, c01, [0, 1, 0], uvCanopy);
    // 캐노피 전면
    addQuad(
      [c01[0], baseElev, c01[2]],
      [c11[0], baseElev, c11[2]],
      c11,
      c01,
      [nx, 0, nz],
      uvCanopy
    );
  }

  // ---------------------------------------------------------------------------
  // [2단] 상층부 본관 타워 (12m ~ H, 원래 폴리곤 20% 축소 Setback 인셋)
  // ---------------------------------------------------------------------------
  const setbackFactor = 0.80; // 20% setback
  const towerPts2D: { x: number; z: number }[] = pts2D.map((p) => ({
    x: cX + (p.x - cX) * setbackFactor,
    z: cZ + (p.z - cZ) * setbackFactor,
  }));

  // 포디움 옥상 조경 테라스 (원래 폴리곤과 타워 인셋 폴리곤 사이 테라스)
  // earcut으로 원래 폴리곤과 타워 인셋(홀) 사이 분할
  const flatPodium: number[] = [];
  for (let i = 0; i < ptCount; i++) flatPodium.push(pts2D[i].x, pts2D[i].z);
  const towerHoleStart = ptCount;
  for (let i = 0; i < ptCount; i++) flatPodium.push(towerPts2D[i].x, towerPts2D[i].z);

  const terraceTriangles = Earcut(flatPodium, [towerHoleStart], 2);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts2D) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  for (let t = 0; t < terraceTriangles.length; t += 3) {
    const i0 = terraceTriangles[t];
    const i1 = terraceTriangles[t + 1];
    const i2 = terraceTriangles[t + 2];

    const p0x = flatPodium[i0 * 2];
    const p0z = flatPodium[i0 * 2 + 1];
    const p1x = flatPodium[i1 * 2];
    const p1z = flatPodium[i1 * 2 + 1];
    const p2x = flatPodium[i2 * 2];
    const p2z = flatPodium[i2 * 2 + 1];

    const uv0: [number, number] = [
      uvTerrace.u0 + ((p0x - minX) / spanX) * (uvTerrace.u1 - uvTerrace.u0),
      uvTerrace.v0 + ((p0z - minZ) / spanZ) * (uvTerrace.v1 - uvTerrace.v0),
    ];
    const uv1: [number, number] = [
      uvTerrace.u0 + ((p1x - minX) / spanX) * (uvTerrace.u1 - uvTerrace.u0),
      uvTerrace.v0 + ((p1z - minZ) / spanZ) * (uvTerrace.v1 - uvTerrace.v0),
    ];
    const uv2: [number, number] = [
      uvTerrace.u0 + ((p2x - minX) / spanX) * (uvTerrace.u1 - uvTerrace.u0),
      uvTerrace.v0 + ((p2z - minZ) / spanZ) * (uvTerrace.v1 - uvTerrace.v0),
    ];

    addTriangle(
      [p0x, podiumElev, p0z],
      [p1x, podiumElev, p1z],
      [p2x, podiumElev, p2z],
      [0, 1, 0],
      uv0,
      uv1,
      uv2
    );
  }

  // 타워 외벽 (은청색 반사 커튼월 + 수직 루버)
  for (let i = 0; i < ptCount; i++) {
    const j = (i + 1) % ptCount;
    const p1 = towerPts2D[i];
    const p2 = towerPts2D[j];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const elen = Math.hypot(dx, dz);
    if (elen < 0.2) continue;

    const nx = dz / elen;
    const nz = -dx / elen;

    addQuad(
      [p1.x, podiumElev, p1.z],
      [p2.x, podiumElev, p2.z],
      [p2.x, towerElev, p2.z],
      [p1.x, towerElev, p1.z],
      [nx, 0, nz],
      uvTower
    );
  }

  // 타워 지붕 슬래브 earcut 분할
  const flatTower: number[] = [];
  for (let i = 0; i < ptCount; i++) flatTower.push(towerPts2D[i].x, towerPts2D[i].z);
  const towerRoofTriangles = Earcut(flatTower, null, 2);

  for (let t = 0; t < towerRoofTriangles.length; t += 3) {
    const i0 = towerRoofTriangles[t];
    const i1 = towerRoofTriangles[t + 1];
    const i2 = towerRoofTriangles[t + 2];

    const p0 = towerPts2D[i0];
    const p1 = towerPts2D[i1];
    const p2 = towerPts2D[i2];

    const uv0: [number, number] = [
      uvRoofConcrete.u0 + ((p0.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p0.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];
    const uv1: [number, number] = [
      uvRoofConcrete.u0 + ((p1.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p1.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];
    const uv2: [number, number] = [
      uvRoofConcrete.u0 + ((p2.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p2.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];

    addTriangle(
      [p0.x, towerElev, p0.z],
      [p1.x, towerElev, p1.z],
      [p2.x, towerElev, p2.z],
      [0, 1, 0],
      uv0,
      uv1,
      uv2
    );
  }

  // ---------------------------------------------------------------------------
  // [3단] 옥상 상징 조형 프레임, 헬리패드, 태양광 패널
  // ---------------------------------------------------------------------------
  // A. 옥상 중심 상징 조형물 프레임 (Crown Frame, 높이 3.6m)
  const crownSize = Math.max(4.0, Math.min(10.0, spanX * 0.25));
  const crHalf = crownSize / 2;
  const crTopY = towerElev + 3.6;

  const crX0 = cX - crHalf, crX1 = cX + crHalf;
  const crZ0 = cZ - crHalf, crZ1 = cZ + crHalf;

  addQuad([crX0, towerElev, crZ0], [crX1, towerElev, crZ0], [crX1, crTopY, crZ0], [crX0, crTopY, crZ0], [0, 0, -1], uvCrown);
  addQuad([crX1, towerElev, crZ0], [crX1, towerElev, crZ1], [crX1, crTopY, crZ1], [crX1, crTopY, crZ0], [1, 0, 0], uvCrown);
  addQuad([crX1, towerElev, crZ1], [crX0, towerElev, crZ1], [crX0, crTopY, crZ1], [crX1, crTopY, crZ1], [0, 0, 1], uvCrown);
  addQuad([crX0, towerElev, crZ1], [crX0, towerElev, crZ0], [crX0, crTopY, crZ0], [crX0, crTopY, crZ1], [-1, 0, 0], uvCrown);
  addQuad([crX0, crTopY, crZ0], [crX1, crTopY, crZ0], [crX1, crTopY, crZ1], [crX0, crTopY, crZ1], [0, 1, 0], uvCrown);

  // B. 옥상 헬리패드 (원주시청 또는 45m 이상 고층 공공기관)
  if (landmark.hasHelipad || totalH >= 45.0) {
    const heliSize = Math.min(14.0, spanX * 0.35);
    const hHalf = heliSize / 2;
    const hX = cX + crHalf + hHalf + 1.5;
    const hZ = cZ;
    const hTopY = towerElev + 0.15;

    addQuad(
      [hX - hHalf, hTopY, hZ - hHalf],
      [hX + hHalf, hTopY, hZ - hHalf],
      [hX + hHalf, hTopY, hZ + hHalf],
      [hX - hHalf, hTopY, hZ + hHalf],
      [0, 1, 0],
      uvHelipad
    );
  }

  // C. 옥상 태양광 패널 모듈 어레이 (Solar Panels)
  const solarSize = Math.min(9.0, spanX * 0.30);
  const sHalf = solarSize / 2;
  const sX = cX - crHalf - sHalf - 1.5;
  const sZ = cZ;
  const sTopY = towerElev + 0.6;

  addQuad(
    [sX - sHalf, sTopY, sZ - sHalf],
    [sX + sHalf, sTopY, sZ - sHalf],
    [sX + sHalf, sTopY, sZ + sHalf],
    [sX - sHalf, sTopY, sZ + sHalf],
    [0, 1, 0],
    uvSolar
  );
}

/**
 * 2. 학교·대학교 캠퍼스 맞춤 조형 (적벽돌/아이보리 투톤 + 규칙적 교실 창문 + 중앙 시계탑 + 세이지 그린 박공지붕)
 */
export function buildSchoolMultipartMesh(options: LandmarkBuildOptions): void {
  const { pts2D, baseElev, addQuad, addTriangle } = options;
  const ptCount = pts2D.length;
  if (ptCount < 3) return;

  const height = Math.max(14.0, Math.min(18.0, options.landmark.targetHeight || options.height || 16.0));
  const topElev = baseElev + height;

  const uvSchool = getDiverseFacadeSlotUV('school_facade');
  const uvRoofGreen = getDiverseFacadeSlotUV('roof_school_green');

  // 외벽 생성
  let maxEdgeIdx = 0;
  let maxEdgeLen = 0;

  for (let i = 0; i < ptCount; i++) {
    const j = (i + 1) % ptCount;
    const p1 = pts2D[i];
    const p2 = pts2D[j];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const elen = Math.hypot(dx, dz);
    if (elen > maxEdgeLen) {
      maxEdgeLen = elen;
      maxEdgeIdx = i;
    }
    if (elen < 0.2) continue;

    const nx = dz / elen;
    const nz = -dx / elen;

    addQuad(
      [p1.x, baseElev, p1.z],
      [p2.x, baseElev, p2.z],
      [p2.x, topElev, p2.z],
      [p1.x, topElev, p1.z],
      [nx, 0, nz],
      uvSchool
    );
  }

  // 중앙 현관 시계탑 (돌출 2.5m, 폭 7m, 옥상 위 +3.5m 솟아오름)
  if (maxEdgeLen >= 10.0) {
    const p1 = pts2D[maxEdgeIdx];
    const p2 = pts2D[(maxEdgeIdx + 1) % ptCount];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const nx = dz / maxEdgeLen;
    const nz = -dx / maxEdgeLen;

    const midX = (p1.x + p2.x) * 0.5;
    const midZ = (p1.z + p2.z) * 0.5;
    const ux = dx / maxEdgeLen;
    const uz = dz / maxEdgeLen;

    const twW = 7.0;
    const twD = 2.8;
    const twH = height + 3.8;
    const twTopY = baseElev + twH;

    const t00: [number, number, number] = [midX - ux * (twW / 2), baseElev, midZ - uz * (twW / 2)];
    const t10: [number, number, number] = [midX + ux * (twW / 2), baseElev, midZ + uz * (twW / 2)];
    const t11: [number, number, number] = [t10[0] + nx * twD, baseElev, t10[2] + nz * twD];
    const t01: [number, number, number] = [t00[0] + nx * twD, baseElev, t00[2] + nz * twD];

    const t00Top: [number, number, number] = [t00[0], twTopY, t00[2]];
    const t10Top: [number, number, number] = [t10[0], twTopY, t10[2]];
    const t11Top: [number, number, number] = [t11[0], twTopY, t11[2]];
    const t01Top: [number, number, number] = [t01[0], twTopY, t01[2]];

    // 시계탑 전면
    addQuad([t01[0], baseElev, t01[2]], [t11[0], baseElev, t11[2]], t11Top, t01Top, [nx, 0, nz], uvSchool);
    // 시계탑 좌/우측면
    addQuad(t00, t01, t01Top, t00Top, [-ux, 0, -uz], uvSchool);
    addQuad(t11, t10, t10Top, t11Top, [ux, 0, uz], uvSchool);

    // 시계탑 상단 사각 피라미드 지붕
    const pyrApex: [number, number, number] = [(t00[0] + t11[0]) * 0.5, twTopY + 2.2, (t00[2] + t11[2]) * 0.5];
    addTriangle(t01Top, t11Top, pyrApex, [nx, 0.7, nz], [uvRoofGreen.u0, uvRoofGreen.v0], [uvRoofGreen.u1, uvRoofGreen.v0], [0.5, uvRoofGreen.v1]);
    addTriangle(t00Top, t01Top, pyrApex, [-ux, 0.7, -uz], [uvRoofGreen.u0, uvRoofGreen.v0], [uvRoofGreen.u1, uvRoofGreen.v0], [0.5, uvRoofGreen.v1]);
    addTriangle(t11Top, t10Top, pyrApex, [ux, 0.7, uz], [uvRoofGreen.u0, uvRoofGreen.v0], [uvRoofGreen.u1, uvRoofGreen.v0], [0.5, uvRoofGreen.v1]);
    addTriangle(t10Top, t00Top, pyrApex, [-nx, 0.7, -nz], [uvRoofGreen.u0, uvRoofGreen.v0], [uvRoofGreen.u1, uvRoofGreen.v0], [0.5, uvRoofGreen.v1]);
  }

  // 메인 옥상: 세이지 그린 박공/평지붕
  const flatCoords: number[] = [];
  for (let i = 0; i < ptCount; i++) flatCoords.push(pts2D[i].x, pts2D[i].z);
  const triangles = Earcut(flatCoords, null, 2);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts2D) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t];
    const i1 = triangles[t + 1];
    const i2 = triangles[t + 2];

    const p0 = pts2D[i0];
    const p1 = pts2D[i1];
    const p2 = pts2D[i2];

    const uv0: [number, number] = [
      uvRoofGreen.u0 + ((p0.x - minX) / spanX) * (uvRoofGreen.u1 - uvRoofGreen.u0),
      uvRoofGreen.v0 + ((p0.z - minZ) / spanZ) * (uvRoofGreen.v1 - uvRoofGreen.v0),
    ];
    const uv1: [number, number] = [
      uvRoofGreen.u0 + ((p1.x - minX) / spanX) * (uvRoofGreen.u1 - uvRoofGreen.u0),
      uvRoofGreen.v0 + ((p1.z - minZ) / spanZ) * (uvRoofGreen.v1 - uvRoofGreen.v0),
    ];
    const uv2: [number, number] = [
      uvRoofGreen.u0 + ((p2.x - minX) / spanX) * (uvRoofGreen.u1 - uvRoofGreen.u0),
      uvRoofGreen.v0 + ((p2.z - minZ) / spanZ) * (uvRoofGreen.v1 - uvRoofGreen.v0),
    ];

    addTriangle(
      [p0.x, topElev, p0.z],
      [p1.x, topElev, p1.z],
      [p2.x, topElev, p2.z],
      [0, 1, 0],
      uv0,
      uv1,
      uv2
    );
  }
}

/**
 * 3. 대형 종합병원 맞춤 조형 (화이트/실버 알루미늄 패널 + 에메랄드 그린 리본창 + ER 캐노피 + 닥터헬기 헬리패드)
 */
export function buildHospitalMultipartMesh(options: LandmarkBuildOptions): void {
  const { pts2D, baseElev, addQuad, addTriangle, landmark } = options;
  const ptCount = pts2D.length;
  if (ptCount < 3) return;

  const height = Math.max(22.0, landmark.targetHeight || options.height || 36.0);
  const topElev = baseElev + height;

  const uvHospital = getDiverseFacadeSlotUV('hospital_facade');
  const uvHelipad = getDiverseFacadeSlotUV('helipad_h');
  const uvRoofConcrete = getDiverseFacadeSlotUV('roof_concrete_warmgray');
  const uvCanopy = getDiverseFacadeSlotUV('canopy_glass');
  const uvPenthouse = getDiverseFacadeSlotUV('penthouse_core_wall');

  let cX = 0, cZ = 0;
  for (let i = 0; i < ptCount; i++) {
    cX += pts2D[i].x;
    cZ += pts2D[i].z;
  }
  cX /= ptCount;
  cZ /= ptCount;

  let maxEdgeIdx = 0;
  let maxEdgeLen = 0;

  for (let i = 0; i < ptCount; i++) {
    const j = (i + 1) % ptCount;
    const p1 = pts2D[i];
    const p2 = pts2D[j];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const elen = Math.hypot(dx, dz);
    if (elen > maxEdgeLen) {
      maxEdgeLen = elen;
      maxEdgeIdx = i;
    }
    if (elen < 0.2) continue;

    const nx = dz / elen;
    const nz = -dx / elen;

    addQuad(
      [p1.x, baseElev, p1.z],
      [p2.x, baseElev, p2.z],
      [p2.x, topElev, p2.z],
      [p1.x, topElev, p1.z],
      [nx, 0, nz],
      uvHospital
    );
  }

  // 응급실(ER) 앰뷸런스 하차장 돌출 캐노피 (폭 12m, 돌출 5.5m, 높이 4.5m)
  if (maxEdgeLen >= 14.0) {
    const p1 = pts2D[maxEdgeIdx];
    const p2 = pts2D[(maxEdgeIdx + 1) % ptCount];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const nx = dz / maxEdgeLen;
    const nz = -dx / maxEdgeLen;

    const midX = (p1.x + p2.x) * 0.5;
    const midZ = (p1.z + p2.z) * 0.5;
    const ux = dx / maxEdgeLen;
    const uz = dz / maxEdgeLen;

    const cWidth = 12.0;
    const cDepth = 5.5;
    const cHeight = 4.5;

    const c00: [number, number, number] = [midX - ux * (cWidth / 2), baseElev + cHeight, midZ - uz * (cWidth / 2)];
    const c10: [number, number, number] = [midX + ux * (cWidth / 2), baseElev + cHeight, midZ + uz * (cWidth / 2)];
    const c11: [number, number, number] = [c10[0] + nx * cDepth, baseElev + cHeight, c10[2] + nz * cDepth];
    const c01: [number, number, number] = [c00[0] + nx * cDepth, baseElev + cHeight, c00[2] + nz * cDepth];

    addQuad(c00, c10, c11, c01, [0, 1, 0], uvCanopy);
    addQuad(
      [c01[0], baseElev, c01[2]],
      [c11[0], baseElev, c11[2]],
      c11,
      c01,
      [nx, 0, nz],
      uvCanopy
    );
  }

  // 지붕 슬래브 earcut
  const flatCoords: number[] = [];
  for (let i = 0; i < ptCount; i++) flatCoords.push(pts2D[i].x, pts2D[i].z);
  const triangles = Earcut(flatCoords, null, 2);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts2D) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t];
    const i1 = triangles[t + 1];
    const i2 = triangles[t + 2];

    const p0 = pts2D[i0];
    const p1 = pts2D[i1];
    const p2 = pts2D[i2];

    const uv0: [number, number] = [
      uvRoofConcrete.u0 + ((p0.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p0.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];
    const uv1: [number, number] = [
      uvRoofConcrete.u0 + ((p1.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p1.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];
    const uv2: [number, number] = [
      uvRoofConcrete.u0 + ((p2.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p2.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];

    addTriangle(
      [p0.x, topElev, p0.z],
      [p1.x, topElev, p1.z],
      [p2.x, topElev, p2.z],
      [0, 1, 0],
      uv0,
      uv1,
      uv2
    );
  }

  // 옥상 닥터헬기 헬리패드 (선명한 백색 원 + 'H' 마크)
  const heliSize = Math.min(16.0, Math.min(spanX, spanZ) * 0.65);
  const hHalf = heliSize / 2;
  const hTopY = topElev + 0.15;

  addQuad(
    [cX - hHalf, hTopY, cZ - hHalf],
    [cX + hHalf, hTopY, cZ - hHalf],
    [cX + hHalf, hTopY, cZ + hHalf],
    [cX - hHalf, hTopY, cZ + hHalf],
    [0, 1, 0],
    uvHelipad
  );

  // 옥상 엘리베이터 권상기실 / 공조실 (2.8m 큐브)
  const coreW = 4.5;
  const coreTopY = topElev + 2.8;
  const c0x = cX - hHalf - coreW - 1.0;
  const c1x = c0x + coreW;
  const c0z = cZ - 2.0;
  const c1z = cZ + 2.0;

  addQuad([c0x, topElev, c0z], [c1x, topElev, c0z], [c1x, coreTopY, c0z], [c0x, coreTopY, c0z], [0, 0, -1], uvPenthouse);
  addQuad([c1x, topElev, c0z], [c1x, topElev, c1z], [c1x, coreTopY, c1z], [c1x, coreTopY, c0z], [1, 0, 0], uvPenthouse);
  addQuad([c1x, topElev, c1z], [c0x, topElev, c1z], [c0x, coreTopY, c1z], [c1x, coreTopY, c1z], [0, 0, 1], uvPenthouse);
  addQuad([c0x, topElev, c1z], [c0x, topElev, c0z], [c0x, coreTopY, c0z], [c0x, coreTopY, c1z], [-1, 0, 0], uvPenthouse);
  addQuad([c0x, coreTopY, c0z], [c1x, coreTopY, c0z], [c1x, coreTopY, c1z], [c0x, coreTopY, c1z], [0, 1, 0], uvRoofConcrete);
}

/**
 * 4. KTX 기차역 맞춤 조형 (유리 파사드 로비 + 곡면 대공간 스페이스 트러스 아치 지붕)
 */
export function buildKtxStationMesh(options: LandmarkBuildOptions): void {
  const { pts2D, baseElev, addQuad } = options;
  const ptCount = pts2D.length;
  if (ptCount < 3) return;

  const totalH = Math.max(14.0, options.landmark.targetHeight || options.height || 16.5);
  const lobbyH = 6.0;
  const archH = totalH - lobbyH;
  const lobbyTopElev = baseElev + lobbyH;

  const uvCurtain = getDiverseFacadeSlotUV('comm_sky_curtain');
  const uvKtxArch = getDiverseFacadeSlotUV('ktx_station');

  // 하부 유리 파사드 로비
  for (let i = 0; i < ptCount; i++) {
    const j = (i + 1) % ptCount;
    const p1 = pts2D[i];
    const p2 = pts2D[j];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const elen = Math.hypot(dx, dz);
    if (elen < 0.2) continue;

    const nx = dz / elen;
    const nz = -dx / elen;

    addQuad(
      [p1.x, baseElev, p1.z],
      [p2.x, baseElev, p2.z],
      [p2.x, lobbyTopElev, p2.z],
      [p1.x, lobbyTopElev, p1.z],
      [nx, 0, nz],
      uvCurtain
    );
  }

  // 상부 아치형 트러스 지붕 (Barrel Vault / Arch Roof along major axis)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts2D) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const isXMajor = spanX >= spanZ;

  const segments = 6;
  if (isXMajor) {
    // Z 방향으로 둥글게 휘는 아치
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const z0 = minZ + t0 * spanZ;
      const z1 = minZ + t1 * spanZ;

      // sin 곡선으로 아치 표고 계산
      const y0 = lobbyTopElev + Math.sin(t0 * Math.PI) * archH;
      const y1 = lobbyTopElev + Math.sin(t1 * Math.PI) * archH;

      const pBL: [number, number, number] = [minX, y0, z0];
      const pBR: [number, number, number] = [maxX, y0, z0];
      const pTR: [number, number, number] = [maxX, y1, z1];
      const pTL: [number, number, number] = [minX, y1, z1];

      const dy = y1 - y0;
      const dz = z1 - z0;
      const ny = dz;
      const nz = -dy;
      const nlen = Math.hypot(ny, nz);

      addQuad(pBL, pBR, pTR, pTL, [0, ny / nlen, nz / nlen], uvKtxArch);
    }
  } else {
    // X 방향으로 둥글게 휘는 아치
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const x0 = minX + t0 * spanX;
      const x1 = minX + t1 * spanX;

      const y0 = lobbyTopElev + Math.sin(t0 * Math.PI) * archH;
      const y1 = lobbyTopElev + Math.sin(t1 * Math.PI) * archH;

      const pBL: [number, number, number] = [x0, y0, minZ];
      const pBR: [number, number, number] = [x1, y1, minZ];
      const pTR: [number, number, number] = [x1, y1, maxZ];
      const pTL: [number, number, number] = [x0, y0, maxZ];

      const dy = y1 - y0;
      const dx = x1 - x0;
      const ny = dx;
      const nx = -dy;
      const nlen = Math.hypot(nx, ny);

      addQuad(pBL, pBR, pTR, pTL, [nx / nlen, ny / nlen, 0], uvKtxArch);
    }
  }
}

/**
 * 5. 경찰서 / 소방서 공공기관 맞춤 조형
 */
export function buildPoliceFireMesh(options: LandmarkBuildOptions): void {
  const { pts2D, baseElev, addQuad, addTriangle } = options;
  const ptCount = pts2D.length;
  if (ptCount < 3) return;

  const height = Math.max(14.0, options.landmark.targetHeight || options.height || 16.5);
  const topElev = baseElev + height;

  const uvPoliceFire = getDiverseFacadeSlotUV('police_fire_facade');
  const uvRoofConcrete = getDiverseFacadeSlotUV('roof_concrete_warmgray');
  const uvCanopy = getDiverseFacadeSlotUV('canopy_glass');

  for (let i = 0; i < ptCount; i++) {
    const j = (i + 1) % ptCount;
    const p1 = pts2D[i];
    const p2 = pts2D[j];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const elen = Math.hypot(dx, dz);
    if (elen < 0.2) continue;

    const nx = dz / elen;
    const nz = -dx / elen;

    addQuad(
      [p1.x, baseElev, p1.z],
      [p2.x, baseElev, p2.z],
      [p2.x, topElev, p2.z],
      [p1.x, topElev, p1.z],
      [nx, 0, nz],
      uvPoliceFire
    );
  }

  // 지붕 슬래브 earcut
  const flatCoords: number[] = [];
  for (let i = 0; i < ptCount; i++) flatCoords.push(pts2D[i].x, pts2D[i].z);
  const triangles = Earcut(flatCoords, null, 2);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts2D) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t];
    const i1 = triangles[t + 1];
    const i2 = triangles[t + 2];

    const p0 = pts2D[i0];
    const p1 = pts2D[i1];
    const p2 = pts2D[i2];

    const uv0: [number, number] = [
      uvRoofConcrete.u0 + ((p0.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p0.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];
    const uv1: [number, number] = [
      uvRoofConcrete.u0 + ((p1.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p1.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];
    const uv2: [number, number] = [
      uvRoofConcrete.u0 + ((p2.x - minX) / spanX) * (uvRoofConcrete.u1 - uvRoofConcrete.u0),
      uvRoofConcrete.v0 + ((p2.z - minZ) / spanZ) * (uvRoofConcrete.v1 - uvRoofConcrete.v0),
    ];

    addTriangle(
      [p0.x, topElev, p0.z],
      [p1.x, topElev, p1.z],
      [p2.x, topElev, p2.z],
      [0, 1, 0],
      uv0,
      uv1,
      uv2
    );
  }
}

/**
 * 랜드마크 타입에 따라 적절한 빌더 호출
 */
export function buildLandmarkBuildingMesh(options: LandmarkBuildOptions): void {
  switch (options.landmark.type) {
    case 'government':
      buildGovernmentMultipartMesh(options);
      break;
    case 'school':
      buildSchoolMultipartMesh(options);
      break;
    case 'hospital':
      buildHospitalMultipartMesh(options);
      break;
    case 'ktx_station':
      buildKtxStationMesh(options);
      break;
    case 'police_fire':
      buildPoliceFireMesh(options);
      break;
    default:
      buildGovernmentMultipartMesh(options);
      break;
  }
}
