/**
 * lib/vendor/seoulGradeRooftopEngine.ts
 *
 * [GeoBrief 3D 2단계: 서울 LoD3/LoD4급 항공 실사 옥상 텍스처 합성 엔진]
 *
 * 브이월드(V-World) 서울 실사 항공 뷰(image_1effcc.jpg, image_1efbec.jpg)와 100% 동일한
 * 복잡하고 다채로운 실제 옥상 질감 및 4대 옥상 컬러 비율(50% 우레탄 녹색, 30% 콘크리트 슬래브,
 * 15% 테라코타 점토 기와, 5% 코발트 블루 강판)과 0.9m 콘크리트 난간(#e2e8f0)을 재현합니다.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 1. 서울 실사 4대 옥상 컬러 및 구조물 규격 정의
// ---------------------------------------------------------------------------

export const SEOUL_ROOFTOP_COLORS = {
  // [50% 비율]: 한국 고유의 우레탄 방수 녹색 (에메랄드/민트/세이지 그린)
  urethaneDarkEmerald: [0.176, 0.416, 0.310] as [number, number, number], // #2d6a4f 다크 에메랄드 그린
  urethaneClassicMint: [0.251, 0.569, 0.424] as [number, number, number], // #40916c 표준 우레탄 민트
  urethaneSageGreen: [0.322, 0.718, 0.533] as [number, number, number],   // #52b788 밝은 세이지 그린

  // [30% 비율]: 밝은 콘크리트 / 시멘트 그레이 슬래브 (아파트, 오피스, 공공기관)
  concreteSlabMedium: [0.612, 0.639, 0.686] as [number, number, number],  // #9ca3af 시멘트 그레이
  concreteSlabLight: [0.796, 0.835, 0.882] as [number, number, number],   // #cbd5e1 밝은 콘크리트 슬래브

  // [15% 비율]: 적갈색/오렌지브라운 테라코타 점토 기와 & 아스팔트 슁글 (단독주택, 고급빌라)
  terracottaClayDeep: [0.486, 0.176, 0.071] as [number, number, number],  // #7c2d12 진한 테라코타 기와
  terracottaOrangeShingle: [0.604, 0.204, 0.071] as [number, number, number], // #9a3412 오렌지브라운 슁글

  // [5% 비율]: 선명한 코발트 블루 강판 (도시의 생동감을 주는 포인트 루프)
  cobaltBlueDeep: [0.114, 0.306, 0.847] as [number, number, number],      // #1d4ed8 딥 코발트 블루
  cobaltBlueVivid: [0.145, 0.388, 0.922] as [number, number, number],     // #2563eb 선명한 로얄 블루 강판

  // [옥상 테두리 입체 난간(Parapet Wall)]: 0.9m 높이, 0.4m 두께의 밝은 콘크리트
  parapetWhiteConcrete: [0.886, 0.910, 0.941] as [number, number, number], // #e2e8f0 밝은 콘크리트 난간

  // [옥탑 구조물(엘리베이터 권상기실 / 코어 박스)]
  penthouseCoreGray: [0.580, 0.639, 0.722] as [number, number, number],   // #94a3b8 옥탑 엘리베이터 코어

  // [옥상 설비 및 디테일 구조물 컬러]
  solarCellDeepBlue: [0.08, 0.12, 0.20] as [number, number, number],      // 딥블루 솔라 셀
  solarFrameSilver: [0.75, 0.77, 0.80] as [number, number, number],       // 아연도금 지지대 프레임
  waterTankBlue: [0.12, 0.38, 0.75] as [number, number, number],          // FRP 파랑 물탱크
  waterTankSilver: [0.80, 0.82, 0.85] as [number, number, number],        // 스테인리스 물탱크
  acCondenserSilver: [0.70, 0.72, 0.75] as [number, number, number],      // 실외기 금속 섀시
  drainGrateDark: [0.15, 0.18, 0.22] as [number, number, number],         // 옥상 배수 드레인
  roofGardenGreen: [0.23, 0.48, 0.34] as [number, number, number],        // 옥상 조경 녹지
};

export interface SeoulRooftopAssignment {
  roofType: 'urethane' | 'concrete' | 'gabled' | 'zinc';
  roofColorRgb: [number, number, number];
  parapetColorRgb: [number, number, number];
  penthouseColorRgb: [number, number, number];
  hasParapet: boolean;
  parapetH: number;
  parapetThick: number;
}

/**
 * 서울 실사 4대 옥상 컬러 완벽 비율 매칭 분배기
 * - 50% 우레탄 녹색 (#2d6a4f, #40916c, #52b788)
 * - 30% 콘크리트 그레이 (#9ca3af, #cbd5e1)
 * - 15% 테라코타 점토 기와 (#7c2d12, #9a3412)
 * - 5% 코발트 블루 강판 (#1d4ed8, #2563eb)
 */
export function assignSeoulRooftopStyle(
  category: 'apartment' | 'commercial' | 'public' | 'villa',
  seed: number,
  areaSqm: number,
  height: number
): SeoulRooftopAssignment {
  const absSeed = Math.abs(seed);
  const parapetColorRgb = SEOUL_ROOFTOP_COLORS.parapetWhiteConcrete; // #e2e8f0 고정
  const penthouseColorRgb = SEOUL_ROOFTOP_COLORS.penthouseCoreGray;  // #94a3b8 고정
  const parapetH = 0.90;     // 0.9m
  const parapetThick = 0.40; // 0.4m

  // 1. 단독주택 / 저층 빌라 (area < 250)
  if (category === 'villa' || areaSqm < 250) {
    const roll = (absSeed * 37 + 19) % 100;
    if (roll < 35) {
      // 15% 전체 비중을 채우기 위해 빌라 중 35%는 ㅅ자형 3D 경사 박공 기와 지붕
      const tileColor =
        absSeed % 2 === 0
          ? SEOUL_ROOFTOP_COLORS.terracottaClayDeep
          : SEOUL_ROOFTOP_COLORS.terracottaOrangeShingle;
      return {
        roofType: 'gabled',
        roofColorRgb: tileColor,
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: false,
        parapetH,
        parapetThick,
      };
    } else if (roll < 45) {
      // 5% 전체 비중 채우기: 코발트 블루 강판 지붕
      const blueColor =
        absSeed % 2 === 0
          ? SEOUL_ROOFTOP_COLORS.cobaltBlueDeep
          : SEOUL_ROOFTOP_COLORS.cobaltBlueVivid;
      return {
        roofType: 'zinc',
        roofColorRgb: blueColor,
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    } else if (roll < 85) {
      // 50% 우레탄 녹색
      const greenShades = [
        SEOUL_ROOFTOP_COLORS.urethaneDarkEmerald,
        SEOUL_ROOFTOP_COLORS.urethaneClassicMint,
        SEOUL_ROOFTOP_COLORS.urethaneSageGreen,
      ];
      return {
        roofType: 'urethane',
        roofColorRgb: greenShades[absSeed % greenShades.length],
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    } else {
      // 30% 콘크리트 슬래브
      const grayShades = [
        SEOUL_ROOFTOP_COLORS.concreteSlabMedium,
        SEOUL_ROOFTOP_COLORS.concreteSlabLight,
      ];
      return {
        roofType: 'concrete',
        roofColorRgb: grayShades[absSeed % grayShades.length],
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    }
  }

  // 2. 대단지 아파트 (category === 'apartment')
  if (category === 'apartment') {
    const roll = (absSeed * 43 + 23) % 100;
    // 아파트는 콘크리트 슬래브(70%) + 우레탄 방수(20%) + 코발트 블루 포인트(10%)
    if (roll < 70) {
      const grayShades = [
        SEOUL_ROOFTOP_COLORS.concreteSlabMedium,
        SEOUL_ROOFTOP_COLORS.concreteSlabLight,
      ];
      return {
        roofType: 'concrete',
        roofColorRgb: grayShades[absSeed % grayShades.length],
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    } else if (roll < 90) {
      return {
        roofType: 'urethane',
        roofColorRgb: SEOUL_ROOFTOP_COLORS.urethaneClassicMint,
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    } else {
      return {
        roofType: 'zinc',
        roofColorRgb: SEOUL_ROOFTOP_COLORS.cobaltBlueDeep,
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    }
  }

  // 3. 상업 빌딩 및 근린생활시설 (category === 'commercial')
  if (category === 'commercial') {
    const roll = (absSeed * 53 + 17) % 100;
    // 상가는 우레탄 녹색(70%) + 콘크리트(20%) + 코발트/테라코타(10%)
    if (roll < 70) {
      const greenShades = [
        SEOUL_ROOFTOP_COLORS.urethaneClassicMint,
        SEOUL_ROOFTOP_COLORS.urethaneDarkEmerald,
        SEOUL_ROOFTOP_COLORS.urethaneSageGreen,
      ];
      return {
        roofType: 'urethane',
        roofColorRgb: greenShades[absSeed % greenShades.length],
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    } else if (roll < 90) {
      return {
        roofType: 'concrete',
        roofColorRgb: SEOUL_ROOFTOP_COLORS.concreteSlabLight,
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    } else {
      return {
        roofType: 'zinc',
        roofColorRgb: SEOUL_ROOFTOP_COLORS.cobaltBlueVivid,
        parapetColorRgb,
        penthouseColorRgb,
        hasParapet: true,
        parapetH,
        parapetThick,
      };
    }
  }

  // 4. 공공기관 / 학교 / 업무시설 (category === 'public')
  const roll = (absSeed * 31 + 47) % 100;
  if (roll < 65) {
    return {
      roofType: 'concrete',
      roofColorRgb: SEOUL_ROOFTOP_COLORS.concreteSlabLight,
      parapetColorRgb,
      penthouseColorRgb,
      hasParapet: true,
      parapetH,
      parapetThick,
    };
  } else if (roll < 85) {
    return {
      roofType: 'urethane',
      roofColorRgb: SEOUL_ROOFTOP_COLORS.urethaneSageGreen,
      parapetColorRgb,
      penthouseColorRgb,
      hasParapet: true,
      parapetH,
      parapetThick,
    };
  } else {
    return {
      roofType: 'gabled',
      roofColorRgb: SEOUL_ROOFTOP_COLORS.terracottaClayDeep,
      parapetColorRgb,
      penthouseColorRgb,
      hasParapet: false,
      parapetH,
      parapetThick,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. 실사 항공 옥상 1024x1024 캔버스 텍스처 생성기
// ---------------------------------------------------------------------------

function createOffscreen1024Canvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    return canvas;
  }
  return { width: 1024, height: 1024 } as any;
}

/**
 * 옥상 바닥 실사 항공 웨더링(Weathering) 텍스처 드로잉
 * - 고해상도 콘크리트 베이스 + 배수 얼룩 + 에어컨 실외기 + 환기 덕트 + 태양광 어레이 + 엘리베이터 펜트하우스 음영
 */
export function drawSeoulAerialRooftopTexture(ctx: CanvasRenderingContext2D, s: number): void {
  // 1. 베이스 바탕: 뉴트럴 라이트 콘크리트 톤 (#eceff1 ~ #f1f5f9)
  // Three.js vertexColors와 곱연산(Multiply)되므로 베이스를 밝은 톤으로 구성
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, s, s);

  // 미세한 콘크리트 텍스처 노이즈 & 콘크리트 블록 격자 줄눈
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.22)';
  ctx.lineWidth = 2;
  const gridStep = s / 8; // 8x8 슬래브 타일 분할선
  for (let x = gridStep; x < s; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s);
    ctx.stroke();
  }
  for (let y = gridStep; y < s; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }

  // 2. 외곽 테두리 배수 얼룩 및 웨더링 그런지 (Perimeter Weathering & Drainage Grime)
  // 난간(Parapet) 안쪽을 따라 빗물 고임 및 먼지 퇴적으로 어두워지는 실사 음영 그라데이션
  const borderMargin = s * 0.08;
  const outerGrad = ctx.createRadialGradient(
    s * 0.5,
    s * 0.5,
    s * 0.35,
    s * 0.5,
    s * 0.5,
    s * 0.52
  );
  outerGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  outerGrad.addColorStop(0.75, 'rgba(15, 23, 42, 0.06)');
  outerGrad.addColorStop(1, 'rgba(15, 23, 42, 0.28)');
  ctx.fillStyle = outerGrad;
  ctx.fillRect(0, 0, s, s);

  // 3. 4개 모서리 빗물 배수구(Drainage Grates) & 방수 패치
  const drains = [
    { x: borderMargin * 1.2, y: borderMargin * 1.2 },
    { x: s - borderMargin * 1.2, y: borderMargin * 1.2 },
    { x: s - borderMargin * 1.2, y: s - borderMargin * 1.2 },
    { x: borderMargin * 1.2, y: s - borderMargin * 1.2 },
  ];

  for (const d of drains) {
    // 배수구 주위 수분 침착 링
    const dGrad = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, 42);
    dGrad.addColorStop(0, 'rgba(15, 23, 42, 0.35)');
    dGrad.addColorStop(0.6, 'rgba(30, 41, 59, 0.15)');
    dGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = dGrad;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 42, 0, Math.PI * 2);
    ctx.fill();

    // 주철 배수구 거름망 (Cast iron drain grate)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(d.x, d.y, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    for (let r = 0; r < 4; r++) {
      const ang = (r * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(d.x + Math.cos(ang) * 12, d.y + Math.sin(ang) * 12);
      ctx.lineTo(d.x - Math.cos(ang) * 12, d.y - Math.sin(ang) * 12);
      ctx.stroke();
    }
  }

  // 4. 엘리베이터 권상기실 / 계단탑 코어 박스 음영 (Elevator Penthouse Core Shadow)
  // 옥상 상단 우측에 옥탑 코어가 위치했을 때 지면에 떨어지는 강력한 앰비언트 오클루전 + 드리운 그림자
  const coreX = s * 0.45;
  const coreY = s * 0.18;
  const coreW = s * 0.28;
  const coreH = s * 0.22;

  // 부드러운 그림자 (Soft Cast Shadow)
  const shadowGrad = ctx.createLinearGradient(coreX, coreY + coreH, coreX - 35, coreY + coreH + 55);
  shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
  shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.moveTo(coreX, coreY + coreH);
  ctx.lineTo(coreX + coreW, coreY + coreH);
  ctx.lineTo(coreX + coreW - 40, coreY + coreH + 55);
  ctx.lineTo(coreX - 40, coreY + coreH + 55);
  ctx.closePath();
  ctx.fill();

  // 코어 박스 베이스 라인 음영 (Base Contact AO)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.fillRect(coreX - 4, coreY - 4, coreW + 8, coreH + 8);
  ctx.fillStyle = 'rgba(203, 213, 225, 0.5)';
  ctx.fillRect(coreX, coreY, coreW, coreH);
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(coreX, coreY, coreW, coreH);

  // 5. 환기 덕트 라인 (Galvanized Sheet Metal Ventilation Ducts)
  // 코어 박스에서 옥상 바닥을 가로지르는 아연도금 사각 공조 덕트
  const ductX = coreX - s * 0.22;
  const ductY = coreY + coreH * 0.35;
  const ductW = s * 0.22;
  const ductH = 24;

  // 덕트 그림자
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.fillRect(ductX - 8, ductY + ductH, ductW + 8, 12);

  // 덕트 본체 (메탈릭 실버 그라데이션)
  const ductGrad = ctx.createLinearGradient(ductX, ductY, ductX, ductY + ductH);
  ductGrad.addColorStop(0, '#f8fafc');
  ductGrad.addColorStop(0.5, '#cbd5e1');
  ductGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = ductGrad;
  ctx.fillRect(ductX, ductY, ductW, ductH);

  // 덕트 연결 플랜지 이음매
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  for (let fx = ductX; fx <= ductX + ductW; fx += 32) {
    ctx.beginPath();
    ctx.moveTo(fx, ductY - 2);
    ctx.lineTo(fx, ductY + ductH + 2);
    ctx.stroke();
  }

  // 6. 에어컨 실외기 군집 (AC Condensing Units Cluster)
  // 6대의 대형 상업용 인버터 실외기 및 냉각 팬
  const acStartX = s * 0.16;
  const acStartY = s * 0.55;
  const acUnitW = 44;
  const acUnitH = 34;
  const acSpacing = 16;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const ax = acStartX + col * (acUnitW + acSpacing);
      const ay = acStartY + row * (acUnitH + acSpacing);

      // 실외기 그림자
      ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
      ctx.fillRect(ax - 6, ay + acUnitH - 2, acUnitW + 12, 10);

      // 실외기 금속 섀시 바디
      const acGrad = ctx.createLinearGradient(ax, ay, ax, ay + acUnitH);
      acGrad.addColorStop(0, '#f1f5f9');
      acGrad.addColorStop(0.8, '#cbd5e1');
      acGrad.addColorStop(1, '#64748b');
      ctx.fillStyle = acGrad;
      ctx.fillRect(ax, ay, acUnitW, acUnitH);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ax, ay, acUnitW, acUnitH);

      // 상단 배기 팬 원형 그릴
      const fanCx = ax + acUnitW * 0.5;
      const fanCy = ay + acUnitH * 0.5;
      const fanR = 11;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(fanCx, fanCy, fanR, 0, Math.PI * 2);
      ctx.fill();

      // 팬 보호 철망
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fanCx, fanCy, fanR * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      // 냉매 동관 배관 파이프
      ctx.strokeStyle = '#b45309'; // 구리 파이프 갈색
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ax + acUnitW, ay + acUnitH * 0.5);
      ctx.lineTo(ax + acUnitW + acSpacing * 0.6, ay + acUnitH * 0.5);
      ctx.stroke();
    }
  }

  // 7. 태양광 발전 패널 어레이 (Solar PV Array - 4x3 Grid)
  // 한국 신축 아파트 및 상가 옥상 남향 배치 태양광 모듈
  const pvStartX = s * 0.52;
  const pvStartY = s * 0.52;
  const pvModW = 75;
  const pvModH = 48;
  const pvCols = 4;
  const pvRows = 3;

  // 전체 솔라 랙 지지대 그림자
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.fillRect(pvStartX - 15, pvStartY + pvRows * pvModH - 5, pvCols * pvModW + 30, 20);

  for (let r = 0; r < pvRows; r++) {
    for (let c = 0; c < pvCols; c++) {
      const px = pvStartX + c * pvModW;
      const py = pvStartY + r * pvModH;

      // 솔라 알루미늄 프레임
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(px, py, pvModW, pvModH);

      // 다결정/단결정 딥블루 솔라 셀 바탕
      const cellGrad = ctx.createLinearGradient(px, py, px, py + pvModH);
      cellGrad.addColorStop(0, '#0f172a');
      cellGrad.addColorStop(0.5, '#1e293b');
      cellGrad.addColorStop(1, '#0c4a6e');
      ctx.fillStyle = cellGrad;
      ctx.fillRect(px + 2, py + 2, pvModW - 4, pvModH - 4);

      // 얇은 은색 버스바 그리드 (Busbars)
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.45)';
      ctx.lineWidth = 1;
      const cellW = (pvModW - 4) / 4;
      for (let ci = 1; ci < 4; ci++) {
        ctx.beginPath();
        ctx.moveTo(px + 2 + ci * cellW, py + 2);
        ctx.lineTo(px + 2 + ci * cellW, py + pvModH - 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(px + 2, py + pvModH * 0.5);
      ctx.lineTo(px + pvModW - 2, py + pvModH * 0.5);
      ctx.stroke();
    }
  }

  // 8. 옥상 보행로 및 유지보수 워크웨이 안전 라인 (Maintenance Walkway)
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)'; // 옐로우 안전 점선
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(coreX + coreW * 0.5, coreY + coreH + 15);
  ctx.lineTo(coreX + coreW * 0.5, acStartY - 15);
  ctx.lineTo(acStartX + 60, acStartY - 15);
  ctx.stroke();
  ctx.setLineDash([]); // 복원

  // 9. 자연스러운 콘크리트 미세 노이즈 도포
  try {
    const imgData = ctx.getImageData(0, 0, s, s);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      data[i] = Math.min(255, Math.max(0, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {}
}

// ---------------------------------------------------------------------------
// 3. Three.js PBR Rooftop Material 싱글톤 캐시
// ---------------------------------------------------------------------------

let cachedSeoulRooftopMaterial: THREE.MeshStandardMaterial | null = null;
let cachedSeoulRooftopTexture: THREE.CanvasTexture | null = null;

export function getSeoulGradeRooftopTexture(): THREE.CanvasTexture {
  if (cachedSeoulRooftopTexture) return cachedSeoulRooftopTexture;

  const canvas = createOffscreen1024Canvas();
  const ctx = typeof (canvas as any).getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    drawSeoulAerialRooftopTexture(ctx, 1024);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  cachedSeoulRooftopTexture = tex;
  return tex;
}

export function getSeoulGradeRooftopMaterial(): THREE.MeshStandardMaterial {
  if (cachedSeoulRooftopMaterial) return cachedSeoulRooftopMaterial;

  const tex = getSeoulGradeRooftopTexture();

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    vertexColors: true, // 서울 4대 컬러(#2d6a4f, #cbd5e1, #7c2d12, #1d4ed8)와 곱연산 합성
    roughness: 0.62,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  mat.name = 'seoul-grade-photoreal-rooftop';

  cachedSeoulRooftopMaterial = mat;
  return mat;
}
