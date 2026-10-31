/**
 * lib/vendor/vworldAuthenticPalette.ts
 *
 * [2단계: V-World 실사 컬러 그레이딩 및 4096px 고해상도 파사드·옥상 정밀 매핑]
 * - 새빨간 원색(#991b1b, #ef4444) 및 쨍한 파란색(#0284c7) 영구 배제
 * - 국토교통부 브이월드(V-World 3D) 실제 항공사진 역공학 기반 저채도(Desaturated) 팔레트
 * - 한국형 아파트 8종, 상가 가로 간판 패치 4종, 학교 오렌지 테라코타, 저층 4대 외벽 & 4대 옥상 동기화
 */

export interface VworldPaletteSpec {
  wallColor: string;
  roofColor: string;
  sideBrandColor?: string;
  roofSlot: 'roof_urethane_sage' | 'roof_concrete_warmgray' | 'roof_terracotta_tile' | 'roof_zinc_blue' | 'roof_school_green';
  wallSlot: string;
  sideWallSlot?: string;
  parapetColor: string;
  parapetHeight: number;
}

export const VWORLD_AUTHENTIC_COLORS = {
  // 1. 고층 아파트 외벽 바탕 8종 (브이월드 실측 컬러 스펙)
  aptStyles: [
    {
      id: 0,
      name: '아파트 스타일 1: 밝은 크림 화이트 & 브라운 투톤 (민트그린 발코니)',
      wallColor: '#f5f3ee',
      wallSlot: 'apt_style_1_cream',
      sideBrandColor: '#6b5344',
      sideWallSlot: 'apt_side_brown',
      roofColor: '#78716c',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 1,
      name: '아파트 스타일 2: 소프트 샌드 베이지 & 황토색 기단 (민트그린 발코니)',
      wallColor: '#e8e1d5',
      wallSlot: 'apt_style_2_sand',
      sideBrandColor: '#64635e',
      sideWallSlot: 'apt_side_warmgray',
      roofColor: '#57534e',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 2,
      name: '아파트 스타일 3: 아이보리 화이트 & 상층부 브라운 액센트',
      wallColor: '#faf7f0',
      wallSlot: 'apt_style_3_ivory',
      sideBrandColor: '#8c3b2b',
      sideWallSlot: 'apt_side_terracotta',
      roofColor: '#78716c',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 3,
      name: '아파트 스타일 4: 어반 웜그레이 & 다크 차콜 계단실 코어',
      wallColor: '#dcd8d0',
      wallSlot: 'apt_style_4_warmgray',
      sideBrandColor: '#1e3a5f',
      sideWallSlot: 'apt_side_navy',
      roofColor: '#57534e',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 4,
      name: '아파트 스타일 5: 모던 라이트 그레이 & 차콜 수직 핀',
      wallColor: '#d5d0c7',
      wallSlot: 'apt_style_5_modern',
      sideBrandColor: '#5e4b3c',
      sideWallSlot: 'apt_side_brown',
      roofColor: '#78716c',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 5,
      name: '아파트 스타일 6: 웜 베이지 & 테라코타 브라운 기단',
      wallColor: '#e5ded2',
      wallSlot: 'apt_style_6_terracotta',
      sideBrandColor: '#7c4432',
      sideWallSlot: 'apt_side_terracotta',
      roofColor: '#57534e',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 6,
      name: '아파트 스타일 7: 주상복합 하이엔드 에메랄드 통유리 커튼월',
      wallColor: '#2c5f56',
      wallSlot: 'apt_style_7_highrise_emerald',
      sideBrandColor: '#1b3f38',
      sideWallSlot: 'apt_side_navy',
      roofColor: '#57534e',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
    {
      id: 7,
      name: '아파트 스타일 8: 신축 타워 블루그레이 반사 통유리 & 루버',
      wallColor: '#334e68',
      wallSlot: 'apt_style_8_highrise_bluegray',
      sideBrandColor: '#1b2d3d',
      sideWallSlot: 'apt_side_warmgray',
      roofColor: '#78716c',
      roofSlot: 'roof_concrete_warmgray' as const,
    },
  ],

  // 하위 호환 아파트 벽체
  aptWalls: [
    '#f5f3ee', // 1) 밝은 크림 화이트
    '#e8e1d5', // 2) 소프트 샌드 베이지
    '#faf7f0', // 3) 아이보리 화이트
    '#dcd8d0', // 4) 라이트 웜그레이
  ],

  // 아파트 발코니 창문 & 프레임 (민트그린 실사)
  aptBalconyWindow: '#4a6b65', // 민트 그린 틴티드 발코니 유리창
  aptBalconyGlint: '#9cb8b2',  // 상단 반사 하이라이트 글린트
  aptWindowFrame: '#ffffff',   // 얇은 흰색 창틀 프레임
  aptSlabShadow: '#cbd5e1',    // 층간 슬래브 가로 음영선

  // 아파트 측벽(Side Wall) 4대 브랜드 수직 도색 라인
  aptSideBrands: [
    { name: '차분한 브라운 브랜드 라인 (101동)', colorHex: '#6b5344', slot: 'apt_side_brown' },
    { name: '웜그레이 브랜드 라인 (102동)', colorHex: '#57534e', slot: 'apt_side_warmgray' },
    { name: '테라코타 브랜드 라인 (103동)', colorHex: '#8c3b2b', slot: 'apt_side_terracotta' },
    { name: '클래식 네이비 브랜드 라인 (105동)', colorHex: '#1e3a5f', slot: 'apt_side_navy' },
  ],

  // 아파트 옥상 평슬래브 (65%: 콘크리트 그레이, 35%: 다크 브라운 슬레이트)
  aptRoofs: [
    { hex: '#78716c', slot: 'roof_concrete_warmgray', ratio: 0.65 },
    { hex: '#57534e', slot: 'roof_concrete_warmgray', ratio: 0.35 },
  ],

  // 2. 시내 중·저층 상가·원룸·오피스 외벽 8대 소재 (한국어 간판 패치 포함)
  commWalls: [
    { name: '약국·치과·이비인후과 상가 간판 & 베이지 패널', hex: '#dfd8cc', slot: 'comm_sign_clinic_pharmacy' },
    { name: '대성·청담 어학원 상가 간판 & 그레이 패널', hex: '#cbd5e1', slot: 'comm_sign_academy_study' },
    { name: '파리바게뜨·투썸 카페 간판 & 화강석 타일', hex: '#e2dacb', slot: 'comm_sign_cafe_bakery' },
    { name: '피트니스 GYM·필라테스 간판 & 모던 메탈', hex: '#3f3f46', slot: 'comm_sign_fitness_yoga' },
    { name: '사비석/화강석 베이지 오피스', hex: '#d6cfc2', slot: 'comm_granite_tile' },
    { name: '스카이블루 반사 유리 커튼월', hex: '#64748b', slot: 'comm_sky_curtain' },
    { name: '에메랄드 그린 틴티드 유리 빌딩', hex: '#047857', slot: 'comm_emerald_glass' },
    { name: '다크 차콜 알루미늄 복합패널', hex: '#27272a', slot: 'comm_charcoal_panel' },
  ],

  // 상가 1층 필로티 쇼윈도
  commGroundShowcase: '#1e293b',
  commGroundShowcaseDark: '#0f172a',

  // 상가 옥상 3대 실측 분포 (45% : 35% : 20%)
  commRoofs: [
    { name: '저채도 우레탄 방수 세이지 그린 (45%)', hex: '#3b6e52', slot: 'roof_urethane_sage' as const },
    { name: '노후 시멘트/콘크리트 그레이 슬래브 (35%)', hex: '#828282', slot: 'roof_concrete_warmgray' as const },
    { name: '차분한 테라코타 브라운 기와 (20%)', hex: '#6e3f32', slot: 'roof_terracotta_tile' as const },
  ],

  // 옥상 테두리 회백색 콘크리트 난간(Parapet)
  parapetConcrete: '#d4d4d8',
  parapetConcreteCap: '#e4e4e7',

  // 3. 저층 단독주택·빌라 (4대 외벽 & 4대 옥상)
  detachedHouseWalls: [
    { name: '차분한 적벽돌', hex: '#8c3f30', slot: 'villa_red_brick' },
    { name: '황토 파벽돌', hex: '#9a6b4c', slot: 'villa_brown_brick' },
    { name: '베이지 화강석 타일', hex: '#dcd4c6', slot: 'villa_granite' },
    { name: '아이보리 드라이비트', hex: '#ebe5d8', slot: 'villa_stucco_ivory' },
  ],

  detachedHouseRoofs: [
    { name: '우레탄 방수 세이지 그린 (45%)', hex: '#3b6e52', slot: 'roof_urethane_sage' as const },
    { name: '콘크리트 회색 슬래브 (35%)', hex: '#828282', slot: 'roof_concrete_warmgray' as const },
    { name: '적갈색 기와 (15%)', hex: '#6e3f32', slot: 'roof_terracotta_tile' as const },
    { name: '코발트 블루 징크 (5%)', hex: '#254e7a', slot: 'roof_zinc_blue' as const },
  ],

  // 4. 학교 및 공공시설 (3~5층, 12m~18m)
  schoolWalls: [
    { name: '오렌지 테라코타 교사동', hex: '#d97746', slot: 'school_terracotta_brick' },
    { name: '살구색 교사동', hex: '#e89065', slot: 'school_terracotta_brick' },
    { name: '따뜻한 적벽돌 교사동', hex: '#9c4936', slot: 'school_brick_facade' },
    { name: '화이트 아이보리 교사동', hex: '#f1f5f9', slot: 'school_facade' },
  ],
  schoolRoofs: [
    { name: '청록색 옥상', hex: '#2e6b5d', slot: 'roof_school_green' as const },
    { name: '콘크리트 회색 옥상', hex: '#828282', slot: 'roof_concrete_warmgray' as const },
    { name: '테라코타 옥상', hex: '#6e3f32', slot: 'roof_terracotta_tile' as const },
  ],
};

/**
 * 건물 용도 및 크기, 해시에 따른 실사 팔레트 스펙 결정기
 */
export function resolveAuthenticPalette(
  category: 'high_rise_apartment' | 'mid_rise_commercial' | 'low_rise_residential' | 'public_office_landmark',
  seed: number,
  areaSqm: number,
  height: number,
  isSchool = false
): VworldPaletteSpec {
  const parapetColor = VWORLD_AUTHENTIC_COLORS.parapetConcrete;

  // 1) 고층 아파트 단지: 8가지 실제 한국형 아파트 스타일 차별화
  if (category === 'high_rise_apartment' || (height >= 25.0 && areaSqm >= 320)) {
    const aptStyleIndex = Math.abs(seed) % 8;
    const style = VWORLD_AUTHENTIC_COLORS.aptStyles[aptStyleIndex];

    return {
      wallColor: style.wallColor,
      roofColor: style.roofColor,
      sideBrandColor: style.sideBrandColor,
      roofSlot: style.roofSlot,
      wallSlot: style.wallSlot,
      sideWallSlot: style.sideWallSlot,
      parapetColor,
      parapetHeight: 0.9,
    };
  }

  // 2) 학교 및 교육·공공시설 (3~5층, 12m~18m)
  if (isSchool || (category === 'public_office_landmark' && height >= 10.0 && height <= 22.0)) {
    const sIdx = Math.abs(seed) % VWORLD_AUTHENTIC_COLORS.schoolWalls.length;
    const rIdx = Math.abs(seed) % VWORLD_AUTHENTIC_COLORS.schoolRoofs.length;
    const wall = VWORLD_AUTHENTIC_COLORS.schoolWalls[sIdx];
    const roof = VWORLD_AUTHENTIC_COLORS.schoolRoofs[rIdx];

    return {
      wallColor: wall.hex,
      roofColor: roof.hex,
      roofSlot: roof.slot,
      wallSlot: wall.slot,
      parapetColor,
      parapetHeight: 0.8,
    };
  }

  // 3) 단독주택·빌라 (바닥면적 < 200㎡, 1~3층, H <= 11m)
  if (category === 'low_rise_residential' || (areaSqm < 220 && height <= 11.0)) {
    const wIdx = Math.abs(seed) % VWORLD_AUTHENTIC_COLORS.detachedHouseWalls.length;
    const wall = VWORLD_AUTHENTIC_COLORS.detachedHouseWalls[wIdx];

    const roofPick = Math.abs(seed) % 100;
    let roof = VWORLD_AUTHENTIC_COLORS.detachedHouseRoofs[0];
    if (roofPick < 45) {
      roof = VWORLD_AUTHENTIC_COLORS.detachedHouseRoofs[0]; // 45% 우레탄 그린
    } else if (roofPick < 80) {
      roof = VWORLD_AUTHENTIC_COLORS.detachedHouseRoofs[1]; // 35% 콘크리트 그레이
    } else if (roofPick < 95) {
      roof = VWORLD_AUTHENTIC_COLORS.detachedHouseRoofs[2]; // 15% 적갈색 기와
    } else {
      roof = VWORLD_AUTHENTIC_COLORS.detachedHouseRoofs[3]; // 5% 코발트 블루 징크
    }

    return {
      wallColor: wall.hex,
      roofColor: roof.hex,
      roofSlot: roof.slot,
      wallSlot: wall.slot,
      parapetColor,
      parapetHeight: 0.8,
    };
  }

  // 4) 시내 중·저층 상가·원룸·오피스 블록 (한국형 가로 간판 포함)
  const cIdx = Math.abs(seed) % VWORLD_AUTHENTIC_COLORS.commWalls.length;
  const commMat = VWORLD_AUTHENTIC_COLORS.commWalls[cIdx];

  const roofPick = Math.abs(seed) % 100;
  let roof = VWORLD_AUTHENTIC_COLORS.commRoofs[0];
  if (roofPick < 45) {
    roof = VWORLD_AUTHENTIC_COLORS.commRoofs[0]; // 45% 우레탄 세이지 그린
  } else if (roofPick < 80) {
    roof = VWORLD_AUTHENTIC_COLORS.commRoofs[1]; // 35% 시멘트 그레이
  } else {
    roof = VWORLD_AUTHENTIC_COLORS.commRoofs[2]; // 20% 테라코타 적갈색 기와
  }

  return {
    wallColor: commMat.hex,
    roofColor: roof.hex,
    roofSlot: roof.slot,
    wallSlot: commMat.slot,
    parapetColor,
    parapetHeight: 0.8,
  };
}

