/**
 * utils/koreanAptDetailer.ts
 *
 * [GeoBrief 3D 2단계: 한국형 아파트 및 상가 빌딩 초정밀 입면 고도화 모듈]
 *
 * 1. 한국형 아파트 단지 실사 디테일:
 *    - 측벽(Side Wall): 매끈한 아이보리 콘크리트 외벽 + 건설사 브랜드 수직 컬러 밴드 + 선명한 동 번호(101, 102, 103 ~ 205)
 *    - 배면(Rear Wall): 엘리베이터/계단실 수직 긴 채광창 + 복도창 + 보일러 연통 및 실외기 루버 그릴
 *    - 전면(Front Wall): 거실 광폭 베란다 창호 + 강화유리/철제 난간 + 에어컨 실외기 루버
 *    - 1층 기단부(0m ~ 4m): 짙은 브라운/차콜 화강석 석재 마감 + 공동현관 캐노피 포치(Entrance Canopy) + 유리 자동문 + 필로티 기둥
 * 2. 시내 상가·오피스 빌딩 '간판 밴드' 및 커튼월:
 *    - 1층 쇼윈도 상단 정돈된 한국형 가로 간판 블록(네이비, 다크그레이, 버건디, 화이트) + 텍스트 블록
 *    - 커튼월 빌딩 창문별 법선 미세 교란(Per-window Normal Jitter) 및 대기/구름 반사
 * 3. 옥상 실외기·HVAC 냉각탑 및 경사 지붕캡:
 *    - 회색 루버 & 상단 팬 그릴 & 철제 사다리
 *    - 아파트 상단 경사형 장식 지붕 프레임(Hipped Roof Cap)
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface AptFaceClassification {
  faceType: 'front' | 'rear' | 'side';
  isSideWall: boolean;
  wallSlotId: number;
  dongNumber: string;
}

export interface BrandColorStyle {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  baseWallColor: string;
}

export const KOREAN_APT_BRANDS: BrandColorStyle[] = [
  {
    brandName: 'Xi',
    primaryColor: '#1e3a5f',    // 코발트 네이비
    secondaryColor: '#c5a880',  // 샴페인 골드
    accentColor: '#334155',
    baseWallColor: '#f1efe9',
  },
  {
    brandName: 'Hillstate',
    primaryColor: '#5c1d24',    // 딥 와인 버건디
    secondaryColor: '#3e3835',  // 다크 브라운
    accentColor: '#9c422b',
    baseWallColor: '#dfd9ce',
  },
  {
    brandName: 'Prugio',
    primaryColor: '#1b4332',    // 포레스트 딥 그린
    secondaryColor: '#2d6a4f',  // 브리티시 레이싱 그린
    accentColor: '#d8b26e',
    baseWallColor: '#e8e4dc',
  },
  {
    brandName: 'e-Pyeonhan',
    primaryColor: '#c25e00',    // 테라코타 오렌지
    secondaryColor: '#2b2d42',  // 웜 차콜
    accentColor: '#8d99ae',
    baseWallColor: '#ece8e1',
  },
  {
    brandName: 'Raemian',
    primaryColor: '#1f485b',    // 딥 틸 블루
    secondaryColor: '#7f5539',  // 웜 모카 브라운
    accentColor: '#b08968',
    baseWallColor: '#eae7df',
  },
];

/**
 * 건물 폴리곤 및 속성 기반 아파트 벽면(전면/배면/측벽) 자동 판별
 */
export function classifyAptWallFace(
  p1: Point2D,
  p2: Point2D,
  centroid: Point2D,
  segLen: number,
  maxEdgeLen: number,
  buildingSeed: number,
  dongNumber: string
): AptFaceClassification {
  // 1. 측벽 판별: 길이가 15m 미만이거나 최장 변의 45% 이하인 경우
  const isSideWall = segLen < 15.0 || (maxEdgeLen >= 18.0 && segLen <= maxEdgeLen * 0.45);

  if (isSideWall) {
    return {
      faceType: 'side',
      isSideWall: true,
      wallSlotId: 4, // apt_side
      dongNumber,
    };
  }

  // 2. 외향 법선(Outward Normal) 계산
  const edgeDx = p2.x - p1.x;
  const edgeDy = p2.y - p1.y;
  // Outward normal in map meter space (Y = North, X = East)
  const nx = edgeDy / segLen;
  const ny = -edgeDx / segLen;

  // 한국 아파트의 남향/남동향 배치 특성:
  // ny < 0 (남쪽 방향)을 향하는 긴 변을 '전면(Front: 베란다/거실)',
  // 반대편 북쪽을 향하는 긴 변을 '배면(Rear: 계단실/복도/보일러실)'으로 판정
  const isFrontFacing = ny <= 0.15;

  if (isFrontFacing) {
    // 전면 발코니 창호 (0: 웜아이보리, 1: 샌드베이지, 3: 모던투톤)
    const frontSlots = [0, 1, 3];
    const slotIdx = Math.floor(buildingSeed * frontSlots.length) % frontSlots.length;
    return {
      faceType: 'front',
      isSideWall: false,
      wallSlotId: frontSlots[slotIdx],
      dongNumber,
    };
  } else {
    // 배면 계단실/복도식 (Slot 2: apt_rear_stairwell)
    return {
      faceType: 'rear',
      isSideWall: false,
      wallSlotId: 2, // Slot 2: 계단실 및 복도 타일
      dongNumber,
    };
  }
}

/**
 * 피처 속성 또는 좌표 해시 기반 한국 아파트 고유 동 번호(예: 101, 102, 203) 산출
 */
export function getAptDongNumber(
  props: Record<string, any> = {},
  centroid: Point2D,
  buildingSeed: number
): string {
  const rawName = String(
    props.name || props.name_ko || props.building_name || props.bld_nm || props['addr:housenumber'] || ''
  );

  // 1. 이름이나 속성에서 "101동", "101호", "101" 패턴 매칭
  const match = rawName.match(/(\d{3,4})\s*(동|호)?/);
  if (match && match[1]) {
    return match[1];
  }

  // 2. 좌표 해시 기반 일관된 동 번호 생성
  const complex = 1 + Math.floor(buildingSeed * 3.0); // 1단지, 2단지, 3단지
  const dongIdx = 1 + Math.floor((Math.abs(centroid.x * 0.05 + centroid.y * 0.03)) % 9);
  return `${complex}0${dongIdx}`;
}

// =============================================================================
// [Canvas 2D 실사 렌더러 함수군]
// =============================================================================

/**
 * 1. [측벽 (Side Wall) 고도화]:
 * - 매끈한 아이보리 외벽 + 건설사 브랜드 수직 컬러 밴드 + 상단 고대비 한국형 동 번호(예: 101) + 3m 층고 V-홈
 */
export function drawAptSideWallWithDong(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dongNumber = '101',
  brandIndex = 0
): void {
  const brand = KOREAN_APT_BRANDS[brandIndex % KOREAN_APT_BRANDS.length];

  // 1. 매끈한 베이지 웜 아이보리 콘크리트 외벽
  ctx.fillStyle = brand.baseWallColor;
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브
  ctx.fillStyle = '#d5cfc4';
  ctx.fillRect(x, y, w, 24);

  // 2. 건설사 브랜드 수직 컬러 밴드
  const bandW1 = Math.round(w * 0.16);
  const bandW2 = Math.round(w * 0.08);
  const bandX = x + Math.round(w * 0.12);

  ctx.fillStyle = brand.primaryColor;
  ctx.fillRect(bandX, y, bandW1, h);

  ctx.fillStyle = brand.secondaryColor;
  ctx.fillRect(bandX + bandW1, y, bandW2, h);

  ctx.fillStyle = brand.accentColor;
  ctx.fillRect(bandX + bandW1 + bandW2, y, 4, h);

  // 3. 하단 30% 차콜 투톤 도색
  const lowerH = Math.round(h * 0.28);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#374151';
  ctx.fillRect(x, lowerY, w, lowerH);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x, lowerY - 3, w, 3);

  // 4. 측벽 상단 스텐실 동 번호 ("101", "102" 등 대형 타이포그래피)
  const textX = x + Math.round(w * 0.65);
  const textY = y + Math.round(h * 0.20);
  ctx.save();
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 42px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dongNumber, textX, textY);

  // 동 번호 하단 세로 라인 층수 인디케이터
  ctx.fillStyle = brand.primaryColor;
  ctx.fillRect(textX - 28, textY + 30, 56, 4);

  // 브랜드 텍스트 라인
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(brand.brandName.toUpperCase(), textX, textY + 48);
  ctx.restore();

  // 5. 층별 얇은 수평 눈금 그루브 줄눈 (3m 층고 단위)
  ctx.fillStyle = 'rgba(71, 85, 105, 0.22)';
  const storyStep = Math.round(h / 8);
  for (let sy = y + storyStep; sy < lowerY; sy += storyStep) {
    ctx.fillRect(x, sy, w, 1.5);
  }
}

/**
 * 2. [배면(뒷면) 계단실/복도식 파사드 (Slot 2)]:
 * - 중앙 엘리베이터/계단실의 좁고 긴 수직 채광창 + 복도창 + 보일러 연통 + 실외기 루버
 */
export function drawAptRearStairwell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // 웜 그레이 콘크리트 베이스
  ctx.fillStyle = '#d8d7d2';
  ctx.fillRect(x, y, w, h);

  // 상단 슬래브
  ctx.fillStyle = '#c2c0ba';
  ctx.fillRect(x, y, w, 22);

  // 하단 25% 웜그레이 투톤 기단부
  const lowerH = Math.round(h * 0.25);
  const lowerY = y + h - lowerH;
  ctx.fillStyle = '#475569';
  ctx.fillRect(x, lowerY, w, lowerH);

  // 1) 중앙/좌측: 엘리베이터 및 계단실 수직 긴 채광창 타워
  const stairW = Math.round(w * 0.22);
  const stairX = x + Math.round(w * 0.12);
  const stairY = y + 26;
  const stairH = h - 42;

  // 계단실 백드롭 그레이
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(stairX, stairY, stairW, stairH);

  // 계단실 수직 멀리언 및 창호 분할
  ctx.fillStyle = '#475569';
  ctx.fillRect(stairX - 2, stairY, 2, stairH);
  ctx.fillRect(stairX + stairW, stairY, 2, stairH);
  for (let sy = stairY + 18; sy < stairY + stairH; sy += 28) {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(stairX, sy, stairW, 2.5);
    // 창유리 매트 톤
    ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.fillRect(stairX + 2, sy + 3, stairW - 4, 22);
  }

  // 2) 우측: 세대별 주방/다용도실 2중창 및 복도창
  const winX = stairX + stairW + 24;
  const winW = w - (winX - x) - 16;
  const winH = Math.round(h * 0.38);
  const winY = y + 36;

  // 창문 프레임
  ctx.fillStyle = '#334155';
  ctx.fillRect(winX, winY, winW, winH);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(winX + 3, winY + 3, winW - 6, winH - 6);

  // 창유리 반사
  ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
  ctx.fillRect(winX + 5, winY + 5, Math.round((winW - 12) * 0.5), winH - 10);
  ctx.fillRect(winX + Math.round(winW * 0.5) + 2, winY + 5, Math.round((winW - 12) * 0.5), winH - 10);

  // 3) 보일러 연통 (소형 원형 스테인리스 배기구)
  const ventX = winX + winW - 14;
  const ventY = winY + winH + 16;
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(ventX, ventY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(ventX, ventY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // 4) 에어컨 실외기 루버 그릴
  const louverW = Math.round(winW * 0.48);
  const louverH = 24;
  const louverX = winX;
  const louverY = ventY - 4;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);
  ctx.fillStyle = '#64748b';
  for (let ly = louverY + 2; ly < louverY + louverH; ly += 3.5) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 1.5);
  }
}

/**
 * 3. [1층 필로티 및 공동현관 포치 (Slot 22)]:
 * - 0m ~ 4m 아파트 기단부 짙은 화강석 석재 마감 + 공동현관 캐노피 포치 + 자동문 프레임 + 필로티 주차장 기둥 음영
 */
export function drawAptGroundLobby(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // 1. 짙은 브라운/차콜 화강석 석재 마감 외벽 (#334155 / #27272a)
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(x, y, w, h);

  // 화강석 판석 가로/세로 줄눈 격자
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  for (let py = y; py < y + h; py += 32) {
    ctx.fillRect(x, py, w, 2);
  }
  for (let px = x; px < x + w; px += 44) {
    ctx.fillRect(px, y, 2, h);
  }

  // 2. 상단 돌출형 공동현관 캐노피 포치 (Entrance Canopy)
  const canopyH = Math.round(h * 0.16);
  const canopyY = y + 18;
  const canopyW = Math.round(w * 0.72);
  const canopyX = x + Math.round((w - canopyW) * 0.5);

  // 캐노피 상판 (알루미늄 복합패널 다크그레이)
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(canopyX, canopyY, canopyW, canopyH);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(canopyX, canopyY + canopyH - 3, canopyW, 3);

  // 캐노피 하부 드롭 섀도우
  const shadowGrad = ctx.createLinearGradient(canopyX, canopyY + canopyH, canopyX, canopyY + canopyH + 20);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(canopyX, canopyY + canopyH, canopyW, 20);

  // 캐노피 천장 매립 LED 다운라이트 조명
  ctx.fillStyle = '#fef08a';
  for (let lx = canopyX + 24; lx < canopyX + canopyW - 24; lx += 36) {
    ctx.beginPath();
    ctx.arc(lx, canopyY + canopyH - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. 공동현관 유리 자동문 (Sliding Glass Auto Door)
  const doorW = Math.round(canopyW * 0.58);
  const doorH = h - (canopyY + canopyH) - 16;
  const doorX = canopyX + Math.round((canopyW - doorW) * 0.5);
  const doorY = canopyY + canopyH + 10;

  // 자동문 백드롭 (어두운 로비 내부)
  const lobbyGrad = ctx.createLinearGradient(doorX, doorY, doorX, doorY + doorH);
  lobbyGrad.addColorStop(0, '#0f172a');
  lobbyGrad.addColorStop(0.6, '#020617');
  lobbyGrad.addColorStop(1, '#000000');
  ctx.fillStyle = lobbyGrad;
  ctx.fillRect(doorX, doorY, doorW, doorH);

  // 스테인리스 헤어라인 프레임
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(doorX, doorY, doorW, doorH);

  // 좌우 양개 슬라이딩 유리문 분할선
  ctx.fillStyle = '#64748b';
  ctx.fillRect(doorX + Math.round(doorW * 0.5) - 1.5, doorY, 3, doorH);

  // 손잡이 바 및 주의 마크
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(doorX + Math.round(doorW * 0.5) - 10, doorY + Math.round(doorH * 0.45), 3, 28);
  ctx.fillRect(doorX + Math.round(doorW * 0.5) + 7, doorY + Math.round(doorH * 0.45), 3, 28);

  // 4. 로비폰 / 키패드 스탠드 인터폰 패널
  const phoneX = doorX + doorW + 8;
  const phoneY = doorY + Math.round(doorH * 0.35);
  if (phoneX + 16 < x + w) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(phoneX, phoneY, 14, 30);
    ctx.fillStyle = '#38bdf8'; // 로비폰 액정 블루
    ctx.fillRect(phoneX + 2, phoneY + 4, 10, 8);
    ctx.fillStyle = '#94a3b8'; // 키패드
    ctx.fillRect(phoneX + 3, phoneY + 15, 8, 11);
  }

  // 5. 좌우 필로티 주차장 기둥 음영
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y + 16, Math.max(8, canopyX - x - 8), h - 24);
  ctx.fillRect(canopyX + canopyW + 8, y + 16, Math.max(8, x + w - (canopyX + canopyW + 8)), h - 24);
}

/**
 * 4. [시내 상가 1층 쇼윈도 + 정돈된 한국형 가로 간판 블록 (Slot 9)]:
 * - 1층 쇼윈도와 2층 창문 사이 구간에 네이비/다크그레이/버건디/화이트 톤 간판 패널 + 텍스트 블록
 */
export function drawCommercialSignboardBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // 화강석 기단부 베이스
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, h);

  // 상단 간판 밴드 영역 (Signboard Band: 전체 높이의 32%)
  const signBandY = y + 12;
  const signBandH = Math.round(h * 0.32);
  const signBandW = w - 20;
  const signBandX = x + 10;

  // 간판 블록 3~4개 가로 분할 배치
  const panelCount = 3;
  const gap = 4;
  const panelW = Math.floor((signBandW - (panelCount - 1) * gap) / panelCount);

  const signPalettes = [
    { bg: '#1e3a5f', border: '#3b82f6', text: '#ffffff' }, // 네이비 (약국, 안경점, 은행)
    { bg: '#27272a', border: '#71717a', text: '#fafafa' }, // 다크그레이 (카페, 헤어샵)
    { bg: '#701a25', border: '#e11d48', text: '#fff1f2' }, // 버건디 (식당, 클리닉)
  ];

  for (let p = 0; p < panelCount; p++) {
    const px = signBandX + p * (panelW + gap);
    const pal = signPalettes[p % signPalettes.length];

    // 간판 백드롭
    ctx.fillStyle = pal.bg;
    ctx.fillRect(px, signBandY, panelW, signBandH);
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, signBandY, panelW, signBandH);

    // 간판 텍스트 블록 패턴 (한국형 가로 상가 간판)
    ctx.fillStyle = pal.text;
    const textW = Math.round(panelW * 0.65);
    const textH = 8;
    const textY = signBandY + Math.round((signBandH - textH) * 0.5);
    ctx.fillRect(px + Math.round((panelW - textW) * 0.5), textY, textW, textH);

    // 보조 작은 글씨 라인
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillRect(px + Math.round((panelW - textW * 0.5) * 0.5), textY + 12, textW * 0.5, 3.5);
  }

  // 간판 하단 미세 간접 조명 라인
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(signBandX, signBandY + signBandH + 1, signBandW, 2);

  // 1층 대형 통유리 쇼윈도 (0m ~ 3m 구간)
  const shopY = signBandY + signBandH + 12;
  const shopH = h - shopY + y - 10;
  const shopW = w - 24;
  const shopX = x + 12;

  const shopGrad = ctx.createLinearGradient(shopX, shopY, shopX, shopY + shopH);
  shopGrad.addColorStop(0, '#111827');
  shopGrad.addColorStop(0.5, '#030712');
  shopGrad.addColorStop(1, '#000000');
  ctx.fillStyle = shopGrad;
  ctx.fillRect(shopX, shopY, shopW, shopH);

  // 자동문 및 멀리언 프레임
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.0;
  ctx.strokeRect(shopX, shopY, shopW, shopH);

  const midX = shopX + Math.round(shopW * 0.5);
  ctx.beginPath();
  ctx.moveTo(midX, shopY);
  ctx.lineTo(midX, shopY + shopH);
  ctx.stroke();

  // 매장 내부 온백색 진열대 조명 반사
  ctx.fillStyle = 'rgba(254, 240, 138, 0.16)';
  ctx.fillRect(shopX + 6, shopY + 6, shopW - 12, shopH * 0.55);
}

/**
 * 5. [옥상 HVAC 냉각탑 및 루버 패널 (Slot 20)]:
 * - 회색 루버 패널 + 상단 원형 팬 그릴 + 안전 철제 사다리
 */
export function drawHVACCoolingTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // 다크 슬레이트 메탈 베이스
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y, w, h);

  // 상단 원형 배기 팬 그릴
  const fanR = Math.round(Math.min(w, h) * 0.22);
  const fanCX = x + Math.round(w * 0.5);
  const fanCY = y + Math.round(h * 0.26);

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(fanCX, fanCY, fanR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 팬 날개
  ctx.fillStyle = '#64748b';
  for (let a = 0; a < 4; a++) {
    ctx.save();
    ctx.translate(fanCX, fanCY);
    ctx.rotate((a * Math.PI) / 2);
    ctx.fillRect(-3, -fanR + 4, 6, fanR - 6);
    ctx.restore();
  }

  // 하단 냉각탑 루버 핀 (Louver Fins)
  const louverY = fanCY + fanR + 18;
  const louverH = h - (louverY - y) - 14;
  const louverW = w - 36;
  const louverX = x + 18;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(louverX, louverY, louverW, louverH);

  ctx.fillStyle = '#94a3b8';
  for (let ly = louverY + 4; ly < louverY + louverH - 4; ly += 6) {
    ctx.fillRect(louverX + 2, ly, louverW - 4, 2.5);
  }

  // 안전 철제 사다리 (측면)
  const ladderX = x + w - 16;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(ladderX, y + 10, 2, h - 20);
  ctx.fillRect(ladderX + 8, y + 10, 2, h - 20);
  for (let ry = y + 16; ry < y + h - 16; ry += 12) {
    ctx.fillRect(ladderX, ry, 10, 2);
  }
}
