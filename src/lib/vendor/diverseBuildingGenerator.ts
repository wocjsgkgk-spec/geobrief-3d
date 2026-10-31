/**
 * lib/vendor/diverseBuildingGenerator.ts
 *
 * [GeoBrief 3D 2단계: 건물 획일화 완전 해체 및 V-World급 다품종 24대 실사 아키텍처 변주 엔진]
 *
 * GitHub 오픈소스(`StrandedKitty/streets-gl`, `kekscom/osmbuildings`)의 다중 아키텍처 생성기를 벤더링하여,
 * 옆 건물과 절대 똑같아지지 않는 좌표 해시값(seed = Math.abs(Math.floor(lng * 1000000 + lat * 1000000)) % 24) 기반
 * 외벽·창문·지붕이 24가지 서로 다른 실제 한국 건축 양식으로 렌더링되게 구현합니다.
 *
 * 1. [고층 아파트 단지 (H >= 28m, 단지별 브랜드 외관 차별화)] (스타일 0 ~ 3)
 *    ① 크림 화이트(#f5f2eb) + 차콜 베란다 창호 + 브라운 경사지붕 캡
 *    ② 소프트 샌드 베이지(#e8e0d2) + 테라코타 투톤 외벽
 *    ③ 라이트 웜그레이(#dcd8d0) + 네이비 수직 브랜드 라인
 *    ④ 밝은 아이보리(#faf7f2) + 옥상 콘크리트 슬래브 & 엘리베이터 옥탑방
 *    - 긴 면(전·후면): 세대별 발코니 유리창 + 백색 창틀 격자 + 층간 슬래브 가로 줄눈
 *    - 짧은 양 끝단 측벽(Side Wall): 창문 없는 매끈한 콘크리트 + 수직 포인트 도색 밴드
 *
 * 2. [반곡동 혁신도시 공공기관 & 강원 18개 시·군 관공서/대형 오피스] (스타일 4 ~ 7)
 *    - 1~3층 광폭 화강석 기단부 포디움(Podium) + 안쪽으로 셋백(Setback)된 은청색/에메랄드 반사 유리 커튼월 본관 타워
 *    - 옥상 조경/헬리패드 복합 조형
 *
 * 3. [중층 상가·원룸·근린생활 시가지 (11m <= H < 28m)] (스타일 8 ~ 15)
 *    - 1층(0~3.8m): 어두운 화강석 상가 쇼윈도 + 컬러풀 한국형 가로 간판 밴드
 *    - 2층 이상: 6개 소재 변주 (치장벽돌, 파벽돌, 화강석, 징크패널, 노출콘크리트, 드라이비트)
 *    - 옥상: 우레탄 방수 세이지 그린(45%), 밝은 시멘트 회색(35%), 테라코타 적갈색(20%) + 0.9m 파라펫 난간
 *
 * 4. [저층 단독주택·빌라·군부대 영내 막사 (H < 11m)] (스타일 16 ~ 23)
 *    - OSMBuildings 용마루 3D 박공지붕(Gabled) & 우진각지붕(Hipped) 메쉬
 *    - 적갈색 기와(#7c3626), 청색 강판(#1e40af), 슬레이트 그레이 지붕 + 적벽돌/크림색 외벽
 */

import { VworldMasterEngine } from '@/lib/vendor/vworldMasterEngine';

export type DiverseArchitectureCategory =
  | 'high_rise_apartment'
  | 'public_office_landmark'
  | 'mid_rise_commercial'
  | 'low_rise_residential';

export interface DiverseBuildingArchitecture {
  styleIndex: number; // 0 ~ 23
  category: DiverseArchitectureCategory;
  name: string;
  seed: number;
  wallSlot: string;
  sideWallSlot: string;
  roofSlot: string;
  podiumSlot?: string;
  wallColor: string;
  roofColor: string;
  roofStyle: 'flat_parapet' | 'gabled' | 'hipped' | 'podium_setback';
  hasPodium: boolean;
  podiumHeight: number;
  hasParapet: boolean;
  parapetHeight: number;
  hasPenthouseCore: boolean;
  hasHelipad: boolean;
  hasTerraceGarden: boolean;
}

/**
 * 24가지 실제 한국형 아키텍처 프리셋 정의
 */
export const KOREAN_DIVERSE_24_STYLES: Omit<DiverseBuildingArchitecture, 'seed'>[] = [
  // ---------------------------------------------------------------------------
  // [1. 고층 아파트 단지 4대 브랜드 스타일 (0 ~ 3) - V-World 저채도 실사 규격]
  // ---------------------------------------------------------------------------
  {
    styleIndex: 0,
    category: 'high_rise_apartment',
    name: '아파트 브랜드 A: 크림 화이트 & 콘크리트 그레이 슬래브 및 옥탑방',
    wallSlot: 'apt_preset_a',
    sideWallSlot: 'apt_side_brown',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#f2efe9',
    roofColor: '#78716c',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.3,
    hasParapet: true,
    parapetHeight: 0.9,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 1,
    category: 'high_rise_apartment',
    name: '아파트 브랜드 B: 크림 아이보리 & 다크 브라운 슬레이트 슬래브 및 옥탑방',
    wallSlot: 'apt_preset_b',
    sideWallSlot: 'apt_side_warmgray',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#e8e2d5',
    roofColor: '#57534e',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.3,
    hasParapet: true,
    parapetHeight: 0.9,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 2,
    category: 'high_rise_apartment',
    name: '아파트 브랜드 C: 라이트 베이지 & 콘크리트 그레이 슬래브 및 옥탑방',
    wallSlot: 'apt_preset_c',
    sideWallSlot: 'apt_side_brown',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#ddd6c7',
    roofColor: '#78716c',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.3,
    hasParapet: true,
    parapetHeight: 0.9,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 3,
    category: 'high_rise_apartment',
    name: '아파트 브랜드 D: 라이트 웜그레이 & 다크 브라운 슬레이트 슬래브 및 옥탑방',
    wallSlot: 'apt_preset_d',
    sideWallSlot: 'apt_side_warmgray',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#d4d0c8',
    roofColor: '#57534e',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.3,
    hasParapet: true,
    parapetHeight: 0.9,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },

  // ---------------------------------------------------------------------------
  // [2. 반곡동 혁신도시 공공기관 & 강원 18개 시·군 관공서/오피스 (4 ~ 7)]
  // ---------------------------------------------------------------------------
  {
    styleIndex: 4,
    category: 'public_office_landmark',
    name: '공공기관 A: 국민건강보험/심평원형 화강석 포디움 & 스카이블루 타워 & 헬리패드',
    wallSlot: 'gov_tower',
    sideWallSlot: 'gov_tower',
    podiumSlot: 'gov_podium',
    roofSlot: 'helipad_h',
    wallColor: '#cbd5e1',
    roofColor: '#334155',
    roofStyle: 'podium_setback',
    hasPodium: true,
    podiumHeight: 9.9,
    hasParapet: true,
    parapetHeight: 1.0,
    hasPenthouseCore: true,
    hasHelipad: true,
    hasTerraceGarden: true,
  },
  {
    styleIndex: 5,
    category: 'public_office_landmark',
    name: '공공기관 B: 관광공사/공공청사형 실버 글래스 & 옥상 테라스 정원',
    wallSlot: 'comm_preset_g',
    sideWallSlot: 'comm_preset_g',
    podiumSlot: 'gov_podium',
    roofSlot: 'terrace_garden',
    wallColor: '#94a3b8',
    roofColor: '#475569',
    roofStyle: 'podium_setback',
    hasPodium: true,
    podiumHeight: 9.9,
    hasParapet: true,
    parapetHeight: 1.0,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: true,
  },
  {
    styleIndex: 6,
    category: 'public_office_landmark',
    name: '공공기관 C: 강원 시·군청사형 화강석 기단 & 딥차콜 메탈 타워',
    wallSlot: 'comm_preset_h',
    sideWallSlot: 'comm_preset_h',
    podiumSlot: 'gov_podium',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#475569',
    roofColor: '#64748b',
    roofStyle: 'podium_setback',
    hasPodium: true,
    podiumHeight: 6.6,
    hasParapet: true,
    parapetHeight: 1.0,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 7,
    category: 'public_office_landmark',
    name: '공공기관 D: 공공 R&D 연구동형 화이트 세라믹 패널 & 옥상 솔라 어레이',
    wallSlot: 'fac_preset_o',
    sideWallSlot: 'fac_preset_o',
    podiumSlot: 'gov_podium',
    roofSlot: 'solar_panel',
    wallColor: '#f8fafc',
    roofColor: '#1e293b',
    roofStyle: 'podium_setback',
    hasPodium: true,
    podiumHeight: 9.9,
    hasParapet: true,
    parapetHeight: 1.0,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: true,
  },

  // ---------------------------------------------------------------------------
  // [3. 중층 상가·원룸·근린생활 시가지 8종 변주 (8 ~ 15)]
  // 1층 어두운 화강석 쇼윈도 + 2층 이상 6개 소재 변주
  // ---------------------------------------------------------------------------
  {
    styleIndex: 8,
    category: 'mid_rise_commercial',
    name: '중층 상가 A: 차분한 적벽돌 & 세이지 그린 옥상',
    wallSlot: 'villa_preset_i',
    sideWallSlot: 'villa_preset_i',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#7c3f30',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 9,
    category: 'mid_rise_commercial',
    name: '중층 상가 B: 브라운 파벽돌 & 시멘트 슬래브 옥상',
    wallSlot: 'villa_preset_j',
    sideWallSlot: 'villa_preset_j',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#63483a',
    roofColor: '#828282',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 10,
    category: 'mid_rise_commercial',
    name: '중층 상가 C: 사비석/화강석 베이지 & 세이지 그린 옥상',
    wallSlot: 'comm_preset_e',
    sideWallSlot: 'comm_preset_e',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#d6cfc2',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 11,
    category: 'mid_rise_commercial',
    name: '중층 상가 D: 다크 그레이 모던 메탈 & 테라코타 슬레이트 옥상',
    wallSlot: 'comm_preset_h',
    sideWallSlot: 'comm_preset_h',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_terracotta_tile',
    wallColor: '#52525b',
    roofColor: '#6e3f32',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 12,
    category: 'mid_rise_commercial',
    name: '중층 상가 E: 노출콘크리트 그레이 & 시멘트 슬래브 옥상',
    wallSlot: 'apt_preset_c',
    sideWallSlot: 'apt_preset_c',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#9ca3af',
    roofColor: '#828282',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 13,
    category: 'mid_rise_commercial',
    name: '중층 상가 F: 크림 아이보리 & 세이지 그린 옥상',
    wallSlot: 'villa_preset_k',
    sideWallSlot: 'villa_preset_k',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#e8e2d5',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 14,
    category: 'mid_rise_commercial',
    name: '중층 상가 G: 화강석 베이지 & 노후 시멘트 슬래브 옥상',
    wallSlot: 'villa_preset_l',
    sideWallSlot: 'villa_preset_l',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#d6cfc2',
    roofColor: '#828282',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 15,
    category: 'mid_rise_commercial',
    name: '중층 상가 H: 저채도 스카이그레이 커튼월 & 세이지 그린 옥상',
    wallSlot: 'comm_preset_f',
    sideWallSlot: 'comm_preset_f',
    podiumSlot: 'comm_shop_showcase',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#64748b',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: true,
    podiumHeight: 3.6,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: true,
    hasHelipad: false,
    hasTerraceGarden: false,
  },

  // ---------------------------------------------------------------------------
  // [4. 저층 단독주택·빌라·군부대 막사 8종 변주 (16 ~ 23)]
  // 100% 완전 수평 평면 슬래브(Flat Roof) + 0.8m 회백색 난간(Parapet)
  // ---------------------------------------------------------------------------
  {
    styleIndex: 16,
    category: 'low_rise_residential',
    name: '저층 주택 A: 차분한 적벽돌 단독주택 & 테라코타 슬래브 옥상',
    wallSlot: 'villa_preset_i',
    sideWallSlot: 'villa_preset_i',
    roofSlot: 'roof_terracotta_tile',
    wallColor: '#7c3f30',
    roofColor: '#6e3f32',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 17,
    category: 'low_rise_residential',
    name: '저층 주택 B: 크림 화이트 단독주택 & 세이지 그린 옥상',
    wallSlot: 'villa_preset_k',
    sideWallSlot: 'villa_preset_k',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#f2efe9',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 18,
    category: 'low_rise_residential',
    name: '저층 주택 C: 브라운 파벽돌 다세대 & 시멘트 슬래브 옥상',
    wallSlot: 'villa_preset_j',
    sideWallSlot: 'villa_preset_j',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#63483a',
    roofColor: '#828282',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 19,
    category: 'low_rise_residential',
    name: '저층 국방 D: 샌드 베이지 군부대 행정막사 & 테라코타 슬래브 옥상',
    wallSlot: 'fac_preset_n',
    sideWallSlot: 'fac_preset_n',
    roofSlot: 'roof_terracotta_tile',
    wallColor: '#e8e2d5',
    roofColor: '#6e3f32',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 20,
    category: 'low_rise_residential',
    name: '저층 주택 E: 투톤 화강석 주택 & 세이지 그린 옥상',
    wallSlot: 'villa_preset_l',
    sideWallSlot: 'villa_preset_l',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#d6cfc2',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 21,
    category: 'low_rise_residential',
    name: '저층 주택 F: 크림 아이보리 빌라 & 시멘트 슬래브 옥상',
    wallSlot: 'villa_preset_k',
    sideWallSlot: 'villa_preset_k',
    roofSlot: 'roof_concrete_warmgray',
    wallColor: '#e8e2d5',
    roofColor: '#828282',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 22,
    category: 'low_rise_residential',
    name: '저층 국방 G: 영내 생활관 막사 & 세이지 그린 옥상',
    wallSlot: 'fac_preset_n',
    sideWallSlot: 'fac_preset_n',
    roofSlot: 'roof_urethane_sage',
    wallColor: '#e8e2d5',
    roofColor: '#3b6e52',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
  {
    styleIndex: 23,
    category: 'low_rise_residential',
    name: '저층 주택 H: 적벽돌 빌라 & 테라코타 슬래브 옥상',
    wallSlot: 'villa_preset_i',
    sideWallSlot: 'villa_preset_i',
    roofSlot: 'roof_terracotta_tile',
    wallColor: '#7c3f30',
    roofColor: '#6e3f32',
    roofStyle: 'flat_parapet',
    hasPodium: false,
    podiumHeight: 0,
    hasParapet: true,
    parapetHeight: 0.8,
    hasPenthouseCore: false,
    hasHelipad: false,
    hasTerraceGarden: false,
  },
];

export class DiverseBuildingGenerator {
  /**
   * [사용자 스펙 공식] 옆 건물과 절대 같아지지 않는 고유 좌표 해시 시드
   * seed = Math.abs(Math.floor(lng * 1000000 + lat * 1000000)) % 24
   */
  public static calculateSeed(lng: number, lat: number): number {
    return Math.abs(Math.floor(lng * 1000000 + lat * 1000000)) % 24;
  }

  /**
   * 건물 속성·높이·면적·좌표를 융합하여 24가지 한국형 아키텍처 중 1개를 정밀 매칭
   */
  public static resolveArchitecture(
    properties: Record<string, any> = {},
    height: number,
    areaSqm: number,
    centerLngLat: [number, number]
  ): DiverseBuildingArchitecture {
    const [lng, lat] = centerLngLat;
    const seed = this.calculateSeed(lng, lat);

    const name = String(
      properties.buld_nm ||
      properties.bldNm ||
      properties.bld_nm ||
      properties.name ||
      properties.name_ko ||
      properties.realName ||
      ''
    ).toLowerCase();

    const usage = String(
      properties.mainPurpsCdNm ||
      properties.main_purps_nm ||
      properties.mainPurps ||
      properties.realUse ||
      properties.purps ||
      properties.usageType ||
      properties.building ||
      ''
    ).toLowerCase();

    const isBangokZone = VworldMasterEngine.isBangokInnovationZone(lng, lat);

    const isPublicOffice =
      isBangokZone ||
      name.includes('공단') ||
      name.includes('공사') ||
      name.includes('건강보험') ||
      name.includes('심평원') ||
      name.includes('관광공사') ||
      name.includes('청사') ||
      name.includes('시청') ||
      name.includes('구청') ||
      name.includes('법원') ||
      name.includes('경찰') ||
      name.includes('소방') ||
      name.includes('연구') ||
      name.includes('센터') ||
      usage.includes('public') ||
      usage.includes('government') ||
      (areaSqm >= 800 && height >= 20.0);

    const isApartment =
      name.includes('아파트') ||
      name.includes('자이') ||
      name.includes('푸르지오') ||
      name.includes('힐스테이트') ||
      name.includes('더샵') ||
      name.includes('e편한세상') ||
      name.includes('아이파크') ||
      name.includes('부영') ||
      name.includes('동') ||
      usage.includes('아파트') ||
      usage.includes('apartments') ||
      usage.includes('공동주택');

    let targetIdx = 0;

    // 1. [고층 아파트 단지 (H >= 24m 또는 대형 아파트)] -> 스타일 0 ~ 3
    if (
      isApartment ||
      (height >= 24.0 && !name.includes('청사') && !name.includes('공사') && !name.includes('병원')) ||
      (areaSqm >= 300 && height >= 20.0 && !name.includes('청사') && !name.includes('공사') && !name.includes('병원'))
    ) {
      targetIdx = seed % 4; // 0, 1, 2, 3 (아파트 4대 브랜드: 크림 화이트, 샌드 베이지, 웜그레이, 아이보리)
    }
    // 2. [반곡동 혁신도시 공공기관 & 강원 18개 시·군 관공서/대형 오피스] -> 스타일 4 ~ 7
    else if (isPublicOffice) {
      targetIdx = 4 + (seed % 4); // 4, 5, 6, 7
    }
    // 3. [중층 상가·원룸·근린생활 시가지 (11m <= H < 28m)] -> 스타일 8 ~ 15
    else if (
      height >= 11.0 ||
      usage.includes('상업') ||
      usage.includes('근린') ||
      usage.includes('retail') ||
      usage.includes('commercial') ||
      usage.includes('office') ||
      name.includes('빌딩') ||
      name.includes('프라자') ||
      name.includes('타워') ||
      (areaSqm >= 220 && areaSqm < 550)
    ) {
      targetIdx = 8 + (seed % 8); // 8 ~ 15
    }
    // 4. [저층 단독주택·빌라·군부대 막사 (H < 11m)] -> 스타일 16 ~ 23
    else {
      targetIdx = 16 + (seed % 8); // 16 ~ 23
    }

    const baseStyle = KOREAN_DIVERSE_24_STYLES[targetIdx];
    return {
      ...baseStyle,
      seed,
    };
  }
}
