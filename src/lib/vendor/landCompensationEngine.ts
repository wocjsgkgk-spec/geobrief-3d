/**
 * lib/vendor/landCompensationEngine.ts
 *
 * [GeoBrief 3D 3단계: 감정평가·토지보상법 기반 보상가액 및 보상방안 자동 판정 엔진]
 *
 * 1. 3-Tier 토지 가격 산정 모델:
 *    - Tier 1: 총 개별공시지가 = 공시지가(원/㎡) × 면적(㎡)
 *    - Tier 2: 현실화율 반영 추정 시세 (탁상감정 추정가) = 공시지가 × 현실화율 배수 (1.2x ~ 2.2x)
 *    - Tier 3: 토지보상법 제70조 기준 추정 보상금 = 표준지공시지가 × 시점수정 × 지역/개별요인 × 기타요인(1.45배) + 지장물 + 간접보상
 *
 * 2. 4대 맞춤형 보상 및 취득 전략:
 *    - 방안 A: 국방부 기부대양여 (군사기지 및 군사시설 이전 특별법 & 국유재산법 제55조)
 *    - 방안 B: 토지보상법 협의취득 및 수용재결 6단계 로드맵 (토지보상법 제19조~제34조)
 *    - 방안 C: 대토보상 (제63조) & 보상채권 혼합형 전략 (초기 현금 절감)
 *    - 방안 D: 군사기지법 규제 감가 및 매수청구권 검토 (군사기지법 제13조~제16조)
 *
 * 3. 경제적 타당성(B/C 분석) 및 실시간 리액티브 시뮬레이션
 */

/**
 * 금액(원)을 한국어 억/만원 단위 텍스트로 변환
 */
export function formatKoreanWon(won: number): string {
  if (!won || won <= 0) return '0원';
  const eok = Math.floor(won / 100000000);
  const man = Math.round((won % 100000000) / 10000);
  if (eok > 0 && man > 0) {
    return `${eok.toLocaleString()}억 ${man.toLocaleString()}만원`;
  }
  if (eok > 0) {
    return `${eok.toLocaleString()}억원`;
  }
  return `${man.toLocaleString()}만원`;
}

export interface LandCompensationInput {
  basePricePerSqm: number;         // 2026년 기준 ㎡당 개별공시지가 (원)
  areaSqm: number;                 // 부지 면적 (㎡)
  buildingAreaSqm?: number;        // 지상 건축 연면적 (㎡)
  floors?: number;                 // 지상 층수
  zoningName?: string;             // 용도지역명
  jimok?: string;                  // 지목 (대, 잡, 임, 전, 답, 군용지 등)
  isMilitarySite?: boolean;        // 군 유휴부지 여부
  regionName?: string;             // 시·군명 (원주시, 춘천시 등)
  subregion?: string;              // 권역 (중부내륙, 북부접경, 동해안, 남부고원)

  // 동적 슬라이더 파라미터 (미지정 시 기본값 자동 적용)
  realizationMultiplier?: number;  // 현실화율 배율 (1.0x ~ 2.5x, 기본 1.55x)
  daetoRatio?: number;             // 대토보상 비율 (0% ~ 50%, 기본 20%)
  bondRatio?: number;              // 채권보상 비율 (0% ~ 40%, 기본 15%)
  targetFAR?: number;              // 종상향 목표 용적률 (%: 150% ~ 400%, 기본 250%)
  buildingUnitCostManwon?: number; // 분양/매각 평당단가 (만원, 기본 1,450만원)
}

/**
 * 3-Tier 가격 비교 데이터 구조
 */
export interface ThreeTierValuation {
  tier1: {
    title: string;
    subtitle: string;
    totalAmount: number;
    totalAmountFormatted: string;
    pricePerSqm: number;
    pricePerPyeong: number;
    basis: string;
  };
  tier2: {
    title: string;
    subtitle: string;
    totalAmount: number;
    totalAmountFormatted: string;
    pricePerSqm: number;
    pricePerPyeong: number;
    multiplier: number;
    basis: string;
  };
  tier3: {
    title: string;
    subtitle: string;
    totalAmount: number;
    totalAmountFormatted: string;
    pricePerSqm: number;
    pricePerPyeong: number;
    multiplierVsOfficial: number;
    breakdown: {
      landCompensation: number;
      structureCompensation: number;
      indirectCompensation: number;
    };
    basis: string;
  };
}

/**
 * 방안 A: 국방부 기부대양여 수지타산 모델
 */
export interface StrategyA_DonationTransfer {
  strategyId: 'strategy_a';
  title: string;
  legalBasis: string;
  applicableSite: string;
  transferAssetValue: number;        // 종전부지 양여평가액 (억원)
  donationCost: number;              // 대체 군사시설 신축·이전 기부액 (억원)
  netSettlementBalance: number;       // 수지타산 정산 차액 (양여액 - 기부액)
  settlementMethod: string;           // 정산 방식 (국고 납입 또는 추가 기부시설 협의)
  financialFeasibility: {
    landSaleRevenue: number;         // 잔여부지 매각/분양 예상 매출 (억원)
    siteDevelopmentCost: number;     // 기반시설 조성공사비 (억원)
    netProfit: number;               // 지자체/시행사 순이익 (억원)
    roiPercent: number;              // 투자수익률 ROI (%)
  };
  pros: string[];
  cons: string[];
}

/**
 * 방안 B: 토지보상법 협의취득 및 수용재결 6단계 로드맵
 */
export interface StrategyB_EminentDomain {
  strategyId: 'strategy_b';
  title: string;
  legalBasis: string;
  estimatedTotalCompensation: number; // 총 보상비 (억원)
  roadmap: Array<{
    stepNumber: number;
    stepName: string;
    duration: string;
    description: string;
    legalArticle: string;
    keyDeliverable: string;
  }>;
  negotiationTimelineMonths: number;  // 협의 완료 시 예상 기간 (개월)
  expropriationTimelineMonths: number;// 수용재결 시 예상 기간 (개월)
  projectedAdjudicationIncrease: number; // 수용재결 시 증액 추정치 (+3%~+7%)
  pros: string[];
  cons: string[];
}

/**
 * 방안 C: 대토보상 & 채권보상 혼합 전략
 */
export interface StrategyC_LandSubstitution {
  strategyId: 'strategy_c';
  title: string;
  legalBasis: string;
  cashRatio: number;                 // 현금 보상 비율 (%)
  daetoRatio: number;                // 대토 보상 비율 (%)
  bondRatio: number;                 // 채권 보상 비율 (%)
  cashPaymentAmount: number;         // 초기 현금 지출액 (억원)
  daetoPaymentAmount: number;        // 대토 보상액 (억원)
  bondPaymentAmount: number;         // 채권 보상액 (억원)
  initialCashSavingsAmount: number;  // 초기 현금 유동성 절감액 (억원)
  financialInterestSavings: number;  // 3개년 PF 금융이자 절감 효과 (억원)
  daetoLandSupplyType: string;        // 공급 대상 조성토지 (상업·근생용지)
  pros: string[];
  cons: string[];
}

/**
 * 방안 D: 군사기지법 규제 감가 및 매수청구권 검토
 */
export interface StrategyD_MilitaryDevaluation {
  strategyId: 'strategy_d';
  title: string;
  legalBasis: string;
  militaryRestrictionLevel: string;  // 규제 등급 (통제보호구역, 제한보호구역 등)
  discountRatePercent: number;       // 규제에 따른 지가 감가율 (%: -18% ~ -35%)
  discountedValue: number;           // 규제 상태 감정평가액 (억원)
  buyoutClaimEligible: boolean;      // 토지 매수청구권 성립 여부
  buyoutClaimCondition: string;      // 매수청구 요건 설명
  deregulationUpsideValue: number;   // 규제 해제/종상향 시 개발이익 상승분 (억원)
  potentialGainPercent: number;      // 상승 잠재율 (%)
  pros: string[];
  cons: string[];
}

/**
 * 종합 사업 타당성 (B/C 분석) 리포트
 */
export interface CompensationFeasibilityAnalysis {
  input: LandCompensationInput;
  valuation3Tier: ThreeTierValuation;
  strategies: {
    strategyA: StrategyA_DonationTransfer;
    strategyB: StrategyB_EminentDomain;
    strategyC: StrategyC_LandSubstitution;
    strategyD: StrategyD_MilitaryDevaluation;
  };
  recommendedStrategy: 'strategy_a' | 'strategy_b' | 'strategy_c' | 'strategy_d';
  recommendedStrategyLabel: string;
  recommendationReason: string;

  // 경제적 타당성 지표 (B/C 분석)
  financialSummary: {
    totalCompensationCost: number;   // 총 보상비 (억원)
    initialCashRequired: number;     // 초기 현금 소요액 (억원)
    cashSavings: number;             // 대토/채권 적용 시 현금 절감액 (억원)
    sitePrepCost: number;            // 부지조성 토목공사비 (억원)
    indirectCost: number;            // 인허가·금융·감리 부대비용 (억원)
    totalProjectCost: number;        // 총 사업비 (억원)
    totalFloorAreaPyeong: number;    // 목표 용적률 적용 개발 연면적 (평)
    projectedRevenue: number;        // 개발 분양/매각 기대수익 (억원)
    netProfit: number;               // 개발 순이익 (억원)
    bcRatio: number;                 // B/C 비율 (편익비용비)
    feasibilityVerdict: '탁월' | '양호' | '보통' | '재검토';
  };
}

export class LandCompensationEngine {
  /**
   * 토지보상 및 타당성 분석 일괄 산출
   */
  public static calculate(input: LandCompensationInput): CompensationFeasibilityAnalysis {
    const basePrice = Math.max(input.basePricePerSqm, 50000);
    const area = Math.max(input.areaSqm, 100);
    const bldArea = input.buildingAreaSqm || area * 0.5;
    const realMult = input.realizationMultiplier ?? 1.55;
    const daetoPct = (input.daetoRatio ?? 0.20) * 100;
    const bondPct = (input.bondRatio ?? 0.15) * 100;
    const cashPct = Math.max(0, 100 - daetoPct - bondPct);
    const targetFar = input.targetFAR ?? 250;
    const saleUnitPrice = input.buildingUnitCostManwon ?? 1450; // 만원/평

    // -------------------------------------------------------------------------
    // [1] 3-Tier 토지 가격 산정
    // -------------------------------------------------------------------------
    // Tier 1: 개별공시지가
    const tier1Total = Math.round(basePrice * area);
    const tier1Pyeong = Math.round((basePrice / 0.3025) / 10000) * 10000;

    // Tier 2: 현실화율 반영 시세
    const tier2PricePerSqm = Math.round(basePrice * realMult);
    const tier2Total = Math.round(tier2PricePerSqm * area);
    const tier2Pyeong = Math.round((tier2PricePerSqm / 0.3025) / 10000) * 10000;

    // Tier 3: 토지보상법 제70조 기준 보상평가액
    // 보상배율: 시점수정(1.025) × 지역(1.00) × 개별(1.05) × 인근 보상사례(1.42) = 약 1.52배
    const landCompFactor = 1.025 * 1.05 * 1.42; // 약 1.528
    const landCompensation = Math.round(basePrice * landCompFactor * area);

    // 지장물 보상비: 건축물 연면적 기준 재조달원가 잔존가치 산출 (㎡당 약 72만원 수준)
    const structureUnitPrice = input.jimok === '임' || input.jimok === '임야' ? 45000 : 720000;
    const structureCompensation = Math.round(bldArea * structureUnitPrice);

    // 간접보상비: 영업손실보상/이주정착비 (토지보상비의 약 6.5%)
    const indirectCompensation = Math.round(landCompensation * 0.065);
    const tier3Total = landCompensation + structureCompensation + indirectCompensation;
    const tier3PricePerSqm = Math.round(tier3Total / area);
    const tier3Pyeong = Math.round((tier3PricePerSqm / 0.3025) / 10000) * 10000;

    const valuation3Tier: ThreeTierValuation = {
      tier1: {
        title: '총 개별공시지가',
        subtitle: '국토교통부 표준 법정 공시가격',
        totalAmount: tier1Total,
        totalAmountFormatted: formatKoreanWon(tier1Total),
        pricePerSqm: basePrice,
        pricePerPyeong: tier1Pyeong,
        basis: '부동산 가격공시에 관한 법률 제10조 (세무·조세 부과 기준)',
      },
      tier2: {
        title: '현실화율 반영 추정 시세',
        subtitle: '인근 실거래가 및 탁상감정 추정액',
        totalAmount: tier2Total,
        totalAmountFormatted: formatKoreanWon(tier2Total),
        pricePerSqm: tier2PricePerSqm,
        pricePerPyeong: tier2Pyeong,
        multiplier: realMult,
        basis: `공시지가 현실화율 ${realMult.toFixed(2)}배 적용 (국토교통부 실거래가 공개시스템 유사 거래사례 기준)`,
      },
      tier3: {
        title: '토지보상법 추정 보상금',
        subtitle: '법적 정당보상 (토지 + 지장물 + 간접보상)',
        totalAmount: tier3Total,
        totalAmountFormatted: formatKoreanWon(tier3Total),
        pricePerSqm: tier3PricePerSqm,
        pricePerPyeong: tier3Pyeong,
        multiplierVsOfficial: Math.round((tier3Total / tier1Total) * 100) / 100,
        breakdown: {
          landCompensation,
          structureCompensation,
          indirectCompensation,
        },
        basis: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률 제70조 (표준지공시지가 기준 감정평가)',
      },
    };

    // -------------------------------------------------------------------------
    // [2] 4대 취득 및 보상 전략 산출
    // -------------------------------------------------------------------------
    const totalCompEok = Math.round((tier3Total / 100000000) * 10) / 10;

    // 방안 A: 국방부 기부대양여
    const transferAssetValueEok = Math.round(((tier2Total * 1.1) / 100000000) * 10) / 10;
    const donationCostEok = Math.round(((transferAssetValueEok * 0.78) / 1) * 10) / 10;
    const netSettlementBalanceEok = Math.round((transferAssetValueEok - donationCostEok) * 10) / 10;
    const devSaleRevenueEok = Math.round(((area * 0.3025 * (targetFar / 100) * saleUnitPrice) / 10000) * 10) / 10;
    const siteDevCostEok = Math.round(((area * 0.3025 * 280) / 10000) * 10) / 10; // 조성공사비 평당 280만원
    const netStrategyAProfitEok = Math.round((devSaleRevenueEok - donationCostEok - siteDevCostEok) * 10) / 10;

    const strategyA: StrategyA_DonationTransfer = {
      strategyId: 'strategy_a',
      title: '방안 A: 국방부 기부대양여 사업',
      legalBasis: '군사기지 및 군사시설 이전 특별법 제5조 / 국유재산법 제55조',
      applicableSite: input.isMilitarySite
        ? '군 유휴지 및 이전 군사시설 (최적합 판정)'
        : '국공유지 및 대체시설 수용 가능 부지',
      transferAssetValue: transferAssetValueEok,
      donationCost: donationCostEok,
      netSettlementBalance: netSettlementBalanceEok,
      settlementMethod: netSettlementBalanceEok >= 0
        ? `양여가액 초과분(약 ${netSettlementBalanceEok}억원) 국고납입 또는 지자체 공공기여 시설 추가 대체`
        : `기부초과분(약 ${Math.abs(netSettlementBalanceEok)}억원) 부지 내 추가 잔여부지 양여 협의`,
      financialFeasibility: {
        landSaleRevenue: devSaleRevenueEok,
        siteDevelopmentCost: siteDevCostEok,
        netProfit: netStrategyAProfitEok,
        roiPercent: Math.round((netStrategyAProfitEok / (donationCostEok + siteDevCostEok)) * 100),
      },
      pros: [
        '초기 막대한 토지보상금 현금 지출 없이 군부대 부지 확보 가능',
        '대체시설 완공 후 종전부지 소유권 완전 이전으로 리스크 최소화',
        '지자체와 국방부 간 1:1 패키지 협상으로 인허가 속도 가속화',
      ],
      cons: [
        '대체 군사시설 이전 부지 선정 시 주민 민원 및 갈등 발생 가능성',
        '국방부 합참 승인 및 군사작전성 평가 통과 필수',
      ],
    };

    // 방안 B: 토지보상법 일반 공익사업 협의취득 및 수용재결
    const strategyB: StrategyB_EminentDomain = {
      strategyId: 'strategy_b',
      title: '방안 B: 토지보상법 협의취득 및 수용재결',
      legalBasis: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률 제19조 ~ 제34조',
      estimatedTotalCompensation: totalCompEok,
      roadmap: [
        {
          stepNumber: 1,
          stepName: '사업인정 고시 및 주민 열람',
          duration: '1~2개월',
          description: '국토부 또는 강원특별자치도 사업인정 고시 및 공익성 검토 통과',
          legalArticle: '토지보상법 제20조, 제21조',
          keyDeliverable: '사업인정고시문 및 토지세목조서 관보 게재',
        },
        {
          stepNumber: 2,
          stepName: '토지·물건조서 작성 및 기본조사',
          duration: '2~3개월',
          description: '현장 실측 및 건물·수목·영업장 등 지장물 전수조사 조서 날인',
          legalArticle: '토지보상법 제14조',
          keyDeliverable: '토지조서 및 물건조서 확정본 작성',
        },
        {
          stepNumber: 3,
          stepName: '보상계획 공고 및 감정평가사 추천',
          duration: '14일~1개월',
          description: '보상계획 공고 후 토지소유자 추천(1인) + 시도지사(1인) + 시행자(1인) 3인 감정평가단 구성',
          legalArticle: '토지보상법 제15조, 제28조',
          keyDeliverable: '감정평가법인 3개사 추천 완료 통지',
        },
        {
          stepNumber: 4,
          stepName: '감정평가 실시 및 보상액 산정',
          duration: '1~2개월',
          description: '표준지 공시지가 기준 3개 감정평가법인의 산술평균가로 정당보상액 확정',
          legalArticle: '토지보상법 제68조',
          keyDeliverable: '손실보상 감정평가서 3부 취합 및 최종 보상액 확정',
        },
        {
          stepNumber: 5,
          stepName: '손실보상 협의 계약 체결',
          duration: '30일 이상',
          description: '토지소유자와 보상금 지급 협의 (전액 현금 지급 또는 대토 신청 접수)',
          legalArticle: '토지보상법 제16조, 제17조',
          keyDeliverable: '협의보상 계약서 날인 및 보상금 계좌 지급',
        },
        {
          stepNumber: 6,
          stepName: '협의 불성립 시 수용재결 및 공탁',
          duration: '4~6개월',
          description: '강원도 지방토지수용위원회(지토위) 수용재결 신청, 재결금 공탁 후 강제 소유권 취득',
          legalArticle: '토지보상법 제28조, 제40조',
          keyDeliverable: '수용재결서 송달 및 법원 보상금 공탁서 교부',
        },
      ],
      negotiationTimelineMonths: 7,
      expropriationTimelineMonths: 14,
      projectedAdjudicationIncrease: Math.round(((totalCompEok * 0.045) / 1) * 10) / 10, // 평균 +4.5% 증액 추정
      pros: [
        '소유자 협의 불응 시에도 법적 강제 수용권 확보로 사업 무산 방지',
        '법정 절차 준수로 행정소송 패소 위험 원천 차단',
      ],
      cons: [
        '전액 현금 보상 시 시행자의 초기 PF 유동성 부담 극대화',
        '수용재결 및 이의신청 시 사업 기간이 1년 이상 장기화될 수 있음',
      ],
    };

    // 방안 C: 대토보상 & 보상채권 혼합 전략
    const cashAmountEok = Math.round(((totalCompEok * cashPct) / 100) * 10) / 10;
    const daetoAmountEok = Math.round(((totalCompEok * daetoPct) / 100) * 10) / 10;
    const bondAmountEok = Math.round(((totalCompEok * bondPct) / 100) * 10) / 10;
    const cashSavingsEok = Math.round((daetoAmountEok + bondAmountEok) * 10) / 10;
    // 3개년 PF 이자(연 6.5%) 절감액 추정
    const interestSavingsEok = Math.round((cashSavingsEok * 0.065 * 3) * 10) / 10;

    const strategyC: StrategyC_LandSubstitution = {
      strategyId: 'strategy_c',
      title: '방안 C: 대토보상 (제63조) & 보상채권 혼합 전략',
      legalBasis: '토지보상법 제63조 (현금보상 및 대토보상 기준)',
      cashRatio: cashPct,
      daetoRatio: daetoPct,
      bondRatio: bondPct,
      cashPaymentAmount: cashAmountEok,
      daetoPaymentAmount: daetoAmountEok,
      bondPaymentAmount: bondAmountEok,
      initialCashSavingsAmount: cashSavingsEok,
      financialInterestSavings: interestSavingsEok,
      daetoLandSupplyType: '준비된 당해 사업지구 내 조성 근린상업·복합업무 용지 우선 분양권',
      pros: [
        `초기 현금 지출을 ${cashSavingsEok}억원 절감하여 사업 시행자 PF 부담 대폭 완화`,
        `3개년 PF 금융이자 비용 약 ${interestSavingsEok}억원 추가 절감 효과`,
        '원주민의 재정착률 제고 및 토지 소유자의 보상 협의율 상승 유도',
      ],
      cons: [
        '향후 개발사업 완료 후 공급할 조성토지(대토) 면적 사전 확보 필요',
        '준공 지연 시 대토 대상 토지주의 지체상금 민원 관리 필요',
      ],
    };

    // 방안 D: 군사기지법 규제 감가 및 매수청구권 검토
    const discountPct = input.isMilitarySite || input.subregion?.includes('북부') ? 28 : 18;
    const discountedTotalEok = Math.round((((tier2Total * (100 - discountPct)) / 100) / 100000000) * 10) / 10;
    const potentialGainEok = Math.round((((tier2Total * 1.45) - (tier2Total * (100 - discountPct) / 100)) / 100000000) * 10) / 10;

    const strategyD: StrategyD_MilitaryDevaluation = {
      strategyId: 'strategy_d',
      title: '방안 D: 군사기지법 규제 감가 및 매수청구권 검토',
      legalBasis: '군사기지 및 군사시설 보호법 제13조 ~ 제16조',
      militaryRestrictionLevel: input.isMilitarySite
        ? '군사기지 영내 및 작전보호구역'
        : '군사시설 제한보호구역 (고도제한 및 협의구역)',
      discountRatePercent: discountPct,
      discountedValue: discountedTotalEok,
      buyoutClaimEligible: Boolean(input.isMilitarySite || (input.jimok === '임' && discountPct >= 25)),
      buyoutClaimCondition:
        '군사작전상 사용제한으로 인해 종래의 용도대로 사용할 수 없어 토지효용이 현저히 감소한 경우 국방부에 매수 청구 가능',
      deregulationUpsideValue: potentialGainEok,
      potentialGainPercent: Math.round(((potentialGainEok / discountedTotalEok) * 100)),
      pros: [
        `군사규제로 인한 ${discountPct}% 감가 평가로 저렴한 초기 취득단가 적용 가능`,
        `향후 규제 완화 또는 지구단위계획 수립 시 약 ${potentialGainEok}억원의 막대한 개발이익 창출`,
      ],
      cons: [
        '관할 군단/사단과의 작전성 검토 협의 불발 시 건축 인허가 지연 리스크',
        '군사시설 보호구역 해제 고시까지 최소 6~12개월 행정 소요',
      ],
    };

    // -------------------------------------------------------------------------
    // [3] 최적 추천 전략 판정
    // -------------------------------------------------------------------------
    let recommendedStrategy: 'strategy_a' | 'strategy_b' | 'strategy_c' | 'strategy_d' = 'strategy_b';
    let recommendedStrategyLabel = '토지보상법 협의보상 및 대토 혼합';
    let recommendationReason = '';

    if (input.isMilitarySite || input.jimok?.includes('군') || input.jimok?.includes('국')) {
      recommendedStrategy = 'strategy_a';
      recommendedStrategyLabel = '국방부 기부대양여 사업 (최우선 권장)';
      recommendationReason =
        '대상 부지가 군사시설/국공유지이므로 국방부 기부대양여 제도를 활용할 때 토지매입비 현금 지출 없이 대체시설 기부만으로 종전부지를 전액 양여받아 최적의 수지타산을 확보할 수 있습니다.';
    } else if (daetoPct >= 20 || totalCompEok >= 150) {
      recommendedStrategy = 'strategy_c';
      recommendedStrategyLabel = '대토보상(제63조) & 채권 혼합 (현금 절감 권장)';
      recommendationReason =
        `총 보상비 규모가 약 ${totalCompEok}억원으로 대형 사업이므로, 대토보상(${daetoPct}%)과 보상채권(${bondPct}%)을 결합해 초기 현금 유동성을 ${cashSavingsEok}억원 절감하는 것이 가장 안전합니다.`;
    } else if (input.subregion?.includes('북부') || discountPct >= 25) {
      recommendedStrategy = 'strategy_d';
      recommendedStrategyLabel = '군사규제 감가 취득 후 보호구역 완화 종상향';
      recommendationReason =
        '군사시설 보호구역 감가율(-28%)을 반영하여 낮은 단가로 취득 후, 지자체 협의를 통해 군사보호구역을 해제/완화함으로써 개발이익을 극대화할 수 있습니다.';
    } else {
      recommendedStrategy = 'strategy_b';
      recommendedStrategyLabel = '토지보상법 표준 6단계 협의취득';
      recommendationReason =
        '일반 민간 토지로서 감정평가 3인 추천을 통한 신속한 협의보상(협의율 80% 이상 목표)과 잔여부지 수용재결 로드맵을 적용하는 것이 공기 단축에 가장 효과적입니다.';
    }

    // -------------------------------------------------------------------------
    // [4] 종합 사업 타당성 (B/C 분석) 지표 계산
    // -------------------------------------------------------------------------
    const totalComp = totalCompEok;
    const initialCash = cashAmountEok;
    const cashSavings = cashSavingsEok;
    const sitePrep = siteDevCostEok;
    const indirect = Math.round(((totalComp + sitePrep) * 0.12) * 10) / 10;
    const totalProjectCost = Math.round((totalComp + sitePrep + indirect) * 10) / 10;
    const totalFloorAreaPyeong = Math.round(area * 0.3025 * (targetFar / 100));
    const projectedRevenue = Math.round(((totalFloorAreaPyeong * saleUnitPrice) / 10000) * 10) / 10;
    const netProfit = Math.round((projectedRevenue - totalProjectCost) * 10) / 10;
    const bcRatio = totalProjectCost > 0 ? Math.round((projectedRevenue / totalProjectCost) * 100) / 100 : 1.25;

    let feasibilityVerdict: '탁월' | '양호' | '보통' | '재검토' = '양호';
    if (bcRatio >= 1.35) {
      feasibilityVerdict = '탁월';
    } else if (bcRatio >= 1.08) {
      feasibilityVerdict = '양호';
    } else if (bcRatio >= 0.95) {
      feasibilityVerdict = '보통';
    } else {
      feasibilityVerdict = '재검토';
    }

    return {
      input,
      valuation3Tier,
      strategies: {
        strategyA,
        strategyB,
        strategyC,
        strategyD,
      },
      recommendedStrategy,
      recommendedStrategyLabel,
      recommendationReason,
      financialSummary: {
        totalCompensationCost: totalComp,
        initialCashRequired: initialCash,
        cashSavings,
        sitePrepCost: sitePrep,
        indirectCost: indirect,
        totalProjectCost,
        totalFloorAreaPyeong,
        projectedRevenue,
        netProfit,
        bcRatio,
        feasibilityVerdict,
      },
    };
  }
}
