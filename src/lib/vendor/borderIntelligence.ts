// @ts-nocheck
/**
 * Vendored and adapted from project5army-v21-release (advanced-border-intelligence.ts)
 * Defense Facility Protection Zone & Border Spatial Risk Matrix Engine for Gangwon Digital Twin
 */

export type FlightSafetyDecision = 'PERMITTED' | 'PRELIMINARY' | 'OFFICIAL_REVIEW_REQUIRED' | 'RESTRICTED';

export interface FlightSafetyEvaluation {
  zoneName: string;
  maxHeightLimitM: number;
  currentHeightM: number;
  decision: FlightSafetyDecision;
  decisionLabel: string;
  detail: string;
  legalBasis: string;
}

export type RiskLevel = 'LOW' | 'REVIEW' | 'HIGH_REVIEW';

export interface RiskMatrixItem {
  category: 'regulation' | 'law' | 'spatial' | 'coordination' | 'environment' | 'schedule';
  categoryLabel: string;
  level: RiskLevel;
  levelLabel: string;
  score: number; // 0-100
  evidence: string;
  nextAction: string;
}

export interface BorderFacilityProfile {
  id: string;
  siteName: string;
  region: string;
  lat: number;
  lng: number;
  zoneType: '통제보호구역' | '제한보호구역' | '비행안전구역' | '일반군사지역';
  distanceToDemarcationKm: number;
  flightSafety: FlightSafetyEvaluation;
  riskMatrix: RiskMatrixItem[];
  overallFeasibilityScore: number;
  fiscalSelfReliancePct: number;
  roadPavingPct: number;
}

export function evaluateFlightSafety(input: {
  zone: string;
  projectHeightM: number;
  baseElevationM: number;
}): FlightSafetyEvaluation {
  const { zone, projectHeightM, baseElevationM } = input;

  if (zone.includes('제1구역')) {
    return {
      zoneName: '비행안전 제1구역 (활주로)',
      maxHeightLimitM: 0,
      currentHeightM: projectHeightM,
      decision: 'RESTRICTED',
      decisionLabel: '건축 절대 불허 (금지구역)',
      detail: '비행안전 제1구역은 활주로 표면으로 지상 구조물 및 인공 시설물 설치가 군사기지법상 절대 금지됩니다.',
      legalBasis: '군사기지 및 군사시설 보호법 제8조',
    };
  }

  if (zone.includes('제2구역') || zone.includes('진입표면')) {
    const limit = 15.0;
    const isExceeded = projectHeightM > limit;
    return {
      zoneName: '비행안전 제2구역 (진입표면 1/50 경사)',
      maxHeightLimitM: limit,
      currentHeightM: projectHeightM,
      decision: isExceeded ? 'HIGH_REVIEW' : 'PRELIMINARY',
      decisionLabel: isExceeded ? '고도제한 초과 위험' : '예비 승인 가능 (심의필)',
      detail: `진입표면 경사도(1/50) 산정 기준 허용고는 +${limit}m입니다. 계획고 +${projectHeightM}m 검토가 필요합니다.`,
      legalBasis: '군사기지 및 군사시설 보호법 시행령 제7조',
    };
  }

  if (zone.includes('제5구역') || zone.includes('수평표면')) {
    const limit = 45.0;
    return {
      zoneName: '비행안전 제5구역 (수평표면)',
      maxHeightLimitM: limit,
      currentHeightM: projectHeightM,
      decision: projectHeightM <= limit ? 'PRELIMINARY' : 'OFFICIAL_REVIEW_REQUIRED',
      decisionLabel: projectHeightM <= limit ? '고도 이내 충족' : '관할 군부대 작전협의 필수',
      detail: `공항 반경 4km 수평표면 제한고도 해발 +${baseElevationM + limit}m(지상고 ${limit}m) 기준 적용구역입니다.`,
      legalBasis: '공항시설법 및 군사시설보호심의기준',
    };
  }

  return {
    zoneName: '제한보호구역 (작전기지 외곽)',
    maxHeightLimitM: 65.0,
    currentHeightM: projectHeightM,
    decision: 'PERMITTED',
    decisionLabel: '개발 협의 양호',
    detail: '위탁고도 범위 내 건축 행위 시 지자체 장의 허가만으로 착공 가능합니다.',
    legalBasis: '군사기지법 제13조(행정처분의 협의)',
  };
}

export function buildDevelopmentRiskMatrix(params: {
  zoneType: string;
  distanceKm: number;
  fiscalSelfReliancePct: number;
}): RiskMatrixItem[] {
  const isHighSecurity = params.zoneType === '통제보호구역' || params.distanceKm < 15;

  return [
    {
      category: 'regulation',
      categoryLabel: '군사규제',
      level: isHighSecurity ? 'HIGH_REVIEW' : 'REVIEW',
      levelLabel: isHighSecurity ? '고위험 (군작전 통제)' : '보통 (위탁구역)',
      score: isHighSecurity ? 88 : 45,
      evidence: `군사시설보호구역 유형: ${params.zoneType} (MDL 이격거리 ${params.distanceKm.toFixed(1)}km)`,
      nextAction: isHighSecurity ? '국방부 군사시설기획관실 합동참모본부 직접심의 신청' : '관할 사단 작전처 행정위탁 승인원 접수',
    },
    {
      category: 'law',
      categoryLabel: '관련법령',
      level: 'REVIEW',
      levelLabel: '검토 (국유재산법 등)',
      score: 52,
      evidence: '국유재산특례제한법 및 강원특별자치도 설치 특별법 제34조 군사규제 특례 적용 검토',
      nextAction: '강원도청 평화지역발전과 특례 지구 지정 적합성 질의',
    },
    {
      category: 'spatial',
      categoryLabel: '공간입지',
      level: 'LOW',
      levelLabel: '양호 (평탄화 완료)',
      score: 22,
      evidence: '3D 지형분석 결과 부지 경사도 5도 미만, 표고차 8m 이내로 토공량 균형 우수',
      nextAction: '현장 지내력 시험 및 지반 침하 조사서 확인',
    },
    {
      category: 'coordination',
      categoryLabel: '부대협의',
      level: isHighSecurity ? 'HIGH_REVIEW' : 'LOW',
      levelLabel: isHighSecurity ? '심층작전성 검토' : '통상협의 가능',
      score: isHighSecurity ? 78 : 30,
      evidence: '관할 군단 및 지자체 간 기부대양여 또는 부지교환 협의체 구성 요망',
      nextAction: '군관합동협의회 정례 안건 상정 및 실무단 구성',
    },
    {
      category: 'environment',
      categoryLabel: '환경생태',
      level: 'REVIEW',
      levelLabel: '환경영향평가 대상',
      score: 48,
      evidence: '백두대간 생태축 인접 및 토양오염(유류·중금속) 정화 이력 모니터링 필요',
      nextAction: '원주지방환경청 소규모 환경영향평가 협의 진행',
    },
    {
      category: 'schedule',
      categoryLabel: '추진일정',
      level: 'LOW',
      levelLabel: '정상 진척 가능',
      score: 35,
      evidence: '사전타당성 조사 완료 시 2027년 착공 및 2029년 준공 로드맵 부합',
      nextAction: '기본계획 수립 예산 반영 및 행안부 투자심사 의뢰',
    },
  ];
}

export const GANGWON_BORDER_DEFENSE_PROFILES: BorderFacilityProfile[] = [
  {
    id: 'wonju-1st-logistics',
    siteName: '원주 제1군수지원사령부 종전부지',
    region: '원주시 단계동/우산동',
    lat: 37.35251,
    lng: 127.935757,
    zoneType: '제한보호구역',
    distanceToDemarcationKm: 85.4,
    fiscalSelfReliancePct: 29.8,
    roadPavingPct: 91.2,
    flightSafety: evaluateFlightSafety({ zone: '제한보호구역', projectHeightM: 25, baseElevationM: 145 }),
    riskMatrix: buildDevelopmentRiskMatrix({ zoneType: '제한보호구역', distanceKm: 85.4, fiscalSelfReliancePct: 29.8 }),
    overallFeasibilityScore: 84.5,
  },
  {
    id: 'chuncheon-camp-page',
    siteName: '춘천 캠프페이지 (Camp Page)',
    region: '춘천시 근화동',
    lat: 37.8847,
    lng: 127.7198,
    zoneType: '비행안전구역',
    distanceToDemarcationKm: 46.2,
    fiscalSelfReliancePct: 24.5,
    roadPavingPct: 88.5,
    flightSafety: evaluateFlightSafety({ zone: '제5구역 수평표면', projectHeightM: 35, baseElevationM: 78 }),
    riskMatrix: buildDevelopmentRiskMatrix({ zoneType: '비행안전구역', distanceKm: 46.2, fiscalSelfReliancePct: 24.5 }),
    overallFeasibilityScore: 78.2,
  },
  {
    id: 'cheorwon-dmz-frontline',
    siteName: '철원 전방 사단 이전 유휴지',
    region: '철원군 갈말읍 문혜리',
    lat: 38.1467,
    lng: 127.3134,
    zoneType: '통제보호구역',
    distanceToDemarcationKm: 11.2,
    fiscalSelfReliancePct: 11.4,
    roadPavingPct: 76.4,
    flightSafety: evaluateFlightSafety({ zone: '통제보호구역', projectHeightM: 12, baseElevationM: 210 }),
    riskMatrix: buildDevelopmentRiskMatrix({ zoneType: '통제보호구역', distanceKm: 11.2, fiscalSelfReliancePct: 11.4 }),
    overallFeasibilityScore: 61.0,
  },
  {
    id: 'gangneung-airbase-perimeter',
    siteName: '강릉 제18전투비행단 인접 유휴부지',
    region: '강릉시 남항진동',
    lat: 37.7519,
    lng: 128.9431,
    zoneType: '비행안전구역',
    distanceToDemarcationKm: 98.7,
    fiscalSelfReliancePct: 20.1,
    roadPavingPct: 86.0,
    flightSafety: evaluateFlightSafety({ zone: '제2구역 진입표면', projectHeightM: 18, baseElevationM: 12 }),
    riskMatrix: buildDevelopmentRiskMatrix({ zoneType: '비행안전구역', distanceKm: 98.7, fiscalSelfReliancePct: 20.1 }),
    overallFeasibilityScore: 72.8,
  },
];
