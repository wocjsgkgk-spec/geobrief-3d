/**
 * lib/vendor/vworldAuthenticPalette.ts
 *
 * [2단계: V-World 실사 컬러 그레이딩 및 고해상도 파사드·옥상 정밀 매핑]
 * - 새빨간 원색(#991b1b, #ef4444) 및 쨍한 파란색(#0284c7) 영구 배제
 * - 국토교통부 브이월드(V-World 3D) 실제 항공사진 역공학 기반 저채도(Desaturated) 팔레트
 */

export interface VworldPaletteSpec {
  wallColor: string;
  roofColor: string;
  sideBrandColor?: string;
  roofSlot: 'roof_urethane_sage' | 'roof_concrete_warmgray' | 'roof_terracotta_tile';
  wallSlot: string;
  parapetColor: string;
  parapetHeight: number;
}

export const VWORLD_AUTHENTIC_COLORS = {
  // 1. 고층 아파트 외벽 바탕 75%
  aptWalls: [
    '#f2efe9', // 1) 밝은 웜 화이트
    '#e8e2d5', // 2) 크림 아이보리
    '#ddd6c7', // 3) 라이트 베이지
    '#d4d0c8', // 4) 라이트 웜그레이
  ],

  // 아파트 발코니 창문 & 프레임
  aptBalconyWindow: '#27272a', // 차콜 그레이 직사각형 발코니 유리창
  aptWindowFrame: '#f8fafc',   // 얇은 흰색 창틀 프레임
  aptSlabShadow: '#cbd5e1',    // 층간 슬래브 가로 음영선

  // 아파트 측벽(Side Wall) 차분한 수직 브랜드 라인 (원색 네이비/테라코타 금지!)
  aptSideBrands: [
    { name: '차분한 브라운 브랜드 라인', colorHex: '#6b5344', slot: 'apt_side_brown' },
    { name: '웜그레이 브랜드 라인', colorHex: '#78716c', slot: 'apt_side_warmgray' },
    { name: '소프트 모카 라인', colorHex: '#5e4b3c', slot: 'apt_side_brown' },
    { name: '슬레이트 웜그레이 라인', colorHex: '#64635e', slot: 'apt_side_warmgray' },
  ],

  // 아파트 옥상 평슬래브 (새빨간 지붕 0%!)
  // 65%: 차분한 콘크리트 그레이, 35%: 다크 브라운/슬레이트
  aptRoofs: [
    { hex: '#78716c', slot: 'roof_concrete_warmgray', ratio: 0.65 }, // 콘크리트 그레이
    { hex: '#57534e', slot: 'roof_concrete_warmgray', ratio: 0.35 }, // 다크 브라운 슬레이트
  ],

  // 2. 시내 중·저층 상가·원룸·오피스 외벽 6대 소재
  commWalls: [
    { name: '차분한 적벽돌', hex: '#7c3f30', slot: 'villa_preset_i' },
    { name: '브라운 파벽돌', hex: '#63483a', slot: 'villa_preset_j' },
    { name: '사비석/화강석 베이지', hex: '#d6cfc2', slot: 'comm_granite_beige' },
    { name: '노출콘크리트 그레이', hex: '#9ca3af', slot: 'comm_concrete_gray' },
    { name: '다크 그레이 모던 메탈', hex: '#52525b', slot: 'comm_charcoal_panel' },
    { name: '저채도 스카이그레이 유리', hex: '#64748b', slot: 'comm_curtainwall_sky' },
  ],

  // 상가 1층 어두운 화강석 쇼윈도
  commGroundShowcase: '#1e293b',
  commGroundShowcaseDark: '#0f172a',

  // 상가 옥상 3대 실측 분포 (45% : 35% : 20%)
  commRoofs: [
    { name: '저채도 우레탄 방수 세이지 그린 (45%)', hex: '#3b6e52', slot: 'roof_urethane_sage' as const },
    { name: '노후 시멘트/콘크리트 그레이 슬래브 (35%)', hex: '#828282', slot: 'roof_concrete_warmgray' as const },
    { name: '차분한 테라코타 브라운/다크 슬레이트 (20%)', hex: '#6e3f32', slot: 'roof_terracotta_tile' as const },
  ],

  // 옥상 테두리 회백색 콘크리트 난간(Parapet)
  parapetConcrete: '#d4d4d8',      // 회백색 테두리
  parapetConcreteCap: '#e4e4e7',   // 상단 캡 하이라이트

  // 3. 단독주택 (1~2층, 4m~7.5m)
  detachedHouseWalls: [
    '#7c3f30', // 차분한 적벽돌
    '#f2efe9', // 크림색 스타코
    '#63483a', // 브라운 파벽돌
    '#e8e2d5', // 크림 아이보리
  ],
};

/**
 * 건물 용도 및 크기에 따른 실사 팔레트 스펙 결정기
 */
export function resolveAuthenticPalette(
  category: 'high_rise_apartment' | 'mid_rise_commercial' | 'low_rise_residential' | 'public_office_landmark',
  seed: number,
  areaSqm: number,
  height: number
): VworldPaletteSpec {
  const parapetColor = VWORLD_AUTHENTIC_COLORS.parapetConcrete;

  // 1) 고층 아파트 단지
  if (category === 'high_rise_apartment' || (height >= 25.0 && areaSqm >= 320)) {
    const wallColor = VWORLD_AUTHENTIC_COLORS.aptWalls[seed % 4];
    const brand = VWORLD_AUTHENTIC_COLORS.aptSideBrands[seed % 4];
    const isDarkSlate = (seed % 100) < 35;
    const roofColor = isDarkSlate ? '#57534e' : '#78716c';

    return {
      wallColor,
      roofColor,
      sideBrandColor: brand.colorHex,
      roofSlot: 'roof_concrete_warmgray',
      wallSlot: `apt_preset_${['a', 'b', 'c', 'd'][seed % 4]}`,
      parapetColor,
      parapetHeight: 0.9,
    };
  }

  // 2) 단독주택 (바닥면적 < 200㎡, 1~2층)
  if (category === 'low_rise_residential' && areaSqm < 200 && height <= 8.5) {
    const wallColor = VWORLD_AUTHENTIC_COLORS.detachedHouseWalls[seed % 4];
    const roofPick = seed % 100;
    let roofColor = '#3b6e52';
    let roofSlot: 'roof_urethane_sage' | 'roof_concrete_warmgray' | 'roof_terracotta_tile' = 'roof_urethane_sage';

    if (roofPick < 45) {
      roofColor = '#3b6e52'; // 45% 세이지 그린
      roofSlot = 'roof_urethane_sage';
    } else if (roofPick < 80) {
      roofColor = '#828282'; // 35% 콘크리트 그레이
      roofSlot = 'roof_concrete_warmgray';
    } else {
      roofColor = '#6e3f32'; // 20% 차분한 테라코타 브라운
      roofSlot = 'roof_terracotta_tile';
    }

    return {
      wallColor,
      roofColor,
      roofSlot,
      wallSlot: (seed % 2 === 0) ? 'villa_preset_i' : 'villa_preset_k',
      parapetColor,
      parapetHeight: 0.8,
    };
  }

  // 3) 시내 중·저층 상가·원룸·오피스 블록
  const commMat = VWORLD_AUTHENTIC_COLORS.commWalls[seed % 6];
  const roofPick = seed % 100;
  let roofColor = '#3b6e52';
  let roofSlot: 'roof_urethane_sage' | 'roof_concrete_warmgray' | 'roof_terracotta_tile' = 'roof_urethane_sage';

  if (roofPick < 45) {
    roofColor = '#3b6e52'; // 45% 세이지 그린
    roofSlot = 'roof_urethane_sage';
  } else if (roofPick < 80) {
    roofColor = '#828282'; // 35% 시멘트 그레이
    roofSlot = 'roof_concrete_warmgray';
  } else {
    roofColor = '#6e3f32'; // 20% 차분한 테라코타 브라운/다크 슬레이트
    roofSlot = 'roof_terracotta_tile';
  }

  return {
    wallColor: commMat.hex,
    roofColor,
    roofSlot,
    wallSlot: commMat.slot,
    parapetColor,
    parapetHeight: 0.8,
  };
}
