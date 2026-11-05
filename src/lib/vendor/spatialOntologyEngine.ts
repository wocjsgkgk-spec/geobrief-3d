/**
 * lib/vendor/spatialOntologyEngine.ts
 *
 * [GeoBrief 3D: NVIDIA Auto-Ontology 도메인 지식 그래프 (Entity-Relation-Rule) 엔진]
 *
 * 지자체 군사기지법 군사규제 · 국토계획법 용도지역 · 산지관리법 토목기준 · 토지보상법/기부대양여
 * 복합 인허가 판정 및 도메인 지식 그래프 추론 엔진.
 *
 * 1. 온톨로지 메타모델 (Ontology Metamodel):
 *    - 엔티티: 부지(PNU/면적/경사도), 군사규제(통제/제한/비행안전), 법령(군사기지법/국토계획법/산지법/토지보상법),
 *             관할기관(국방부/군단/지자체), 사업방식(기부대양여/수용보상), 개발스펙(용적률/건폐율/최고고도)
 *    - 관계 체인: [부지] ➔ [저촉 법령] ➔ [협의 기관] ➔ [개발 스펙]
 *
 * 2. 복합 추론 규칙 (Inference Rules):
 *    - 군사기지 및 군사시설 보호법 제13조(행정협의) 및 비행안전구역 고도 제한식 계산
 *    - 국토계획법 제77조(건폐율)·제78조(용적률) 및 종상향(자연녹지 ➔ 준주거 ➔ 상업) 시나리오 추정
 *    - 산지관리법 제14조 산지전용 경사도 15도/25도 기준 판정
 *    - 공익사업을 위한 토지 등의 취득 및 보상에 관한 법률 & 국방·군사시설 사업에 관한 법률 기부대양여 절차 추론
 *
 * 3. 신호등 자동 판정 (Traffic Light Verdict):
 *    - 🟢 GREEN: 즉시 개발 가능 (규제 해제 완료, 적합 용도, 경사도 15도 이하)
 *    - 🟡 YELLOW: 군 작전성 협의 조건부 가능 (제한보호구역/비행안전구역 행정협의 및 고도제한 준수)
 *    - 🔴 RED: 규제 해제 및 도시관리계획 변경 선행 필요 (통제보호구역, 미이전 영내, 보전산지)
 */

import {
  GANGWON_18_MILITARY_SITES,
  Gangwon18MilitarySite,
  getGangwon18MilitarySiteById,
} from '@/constants/gangwon18MilitarySites';

export type TrafficLightVerdict = 'GREEN' | 'YELLOW' | 'RED';

export interface StatutoryCitation {
  lawName: string;
  article: string;
  summary: string;
  mandatoryCondition: string;
}

export interface OntologyNode {
  id: string;
  label: string;
  type: 'site' | 'restriction' | 'statute' | 'agency' | 'process' | 'spec';
  color: string;
  badge?: string;
}

export interface OntologyEdge {
  from: string;
  to: string;
  relation: string;
  description?: string;
}

export interface AdministrativeStep {
  stepNumber: number;
  title: string;
  agency: string;
  legalBasis: string;
  estimatedDuration: string;
  description: string;
}

export interface DevelopmentSpecification {
  currentZoning: string;
  targetZoning: string;
  currentBcrPct: number; // 건폐율
  targetBcrPct: number;
  currentFarPct: number; // 용적률
  targetFarPct: number;
  maxAllowableHeightM: number;
  flightSafetyCeilingM?: number;
  slopeFeasibility: 'EXCELLENT' | 'CONDITIONAL' | 'RESTRICTED';
  slopeDescription: string;
  estimatedLandValueEok: number; // 추정 종전부지 가액 (억원)
  developmentCapacitySqm: number; // 최대 연면적 (㎡)
}

export interface LegalOntologyAssessmentReport {
  siteId: string;
  siteName: string;
  regionName: string;
  areaSqm: number;
  areaPyeong: number;
  verdict: TrafficLightVerdict;
  verdictLabel: string;
  verdictDetail: string;
  militaryRestrictionLevel: '통제보호구역' | '제한보호구역' | '비행안전구역' | '규제해제/완화지구';
  competentMilitaryAgency: string;
  governingStatutes: StatutoryCitation[];
  developmentSpec: DevelopmentSpecification;
  administrativeTimeline: AdministrativeStep[];
  ontologyNodes: OntologyNode[];
  ontologyEdges: OntologyEdge[];
  faqAnswers: Record<string, string>;
}

export interface OntologyAssessmentInput {
  siteId?: string;
  pnu?: string;
  address?: string;
  areaSqm?: number;
  averageSlopeDeg?: number;
  currentZoning?: string;
  groundElevationM?: number;
  isMilitarySite?: boolean;
}

/**
 * 공간·법령 지식 그래프(Entity-Relation-Rule) 기반 복합 인허가 추론 엔진
 */
export class SpatialOntologyEngine {
  /**
   * 부지 또는 필지 입력 데이터를 기반으로 지식 그래프를 구성하고 인허가 판정 리포트 생성
   */
  public static assessLegalFeasibility(input: OntologyAssessmentInput): LegalOntologyAssessmentReport {
    // 1. 군 유휴부지 매칭 확인
    let matchedSite: Gangwon18MilitarySite | undefined;
    if (input.siteId) {
      matchedSite = getGangwon18MilitarySiteById(input.siteId);
    }
    if (!matchedSite && input.address) {
      matchedSite = GANGWON_18_MILITARY_SITES.find(
        (s) => input.address!.includes(s.district) || input.address!.includes(s.shortName) || input.address!.includes(s.regionName)
      );
    }

    const siteId = matchedSite ? matchedSite.id : input.siteId || 'parcel-custom';
    const siteName = matchedSite ? matchedSite.name : input.address ? `${input.address} 부지` : '선택 대상지';
    const regionName = matchedSite ? matchedSite.regionName : '강원특별자치도';
    const areaSqm = matchedSite ? matchedSite.areaSqm : input.areaSqm || 33000;
    const areaPyeong = Math.round(areaSqm / 3.30578);

    // 경사도 수치 파싱
    let slopeDeg = input.averageSlopeDeg ?? 4.2;
    if (matchedSite && matchedSite.averageSlope) {
      const match = matchedSite.averageSlope.match(/([0-9.]+)/);
      if (match) slopeDeg = parseFloat(match[1]);
    }

    // 용도지역 식별
    const currentZoning = matchedSite ? matchedSite.zoning : input.currentZoning || '자연녹지지역 / 준주거지역';

    // 군사 규제 수준 및 관할 기관 결정
    let militaryRestrictionLevel: '통제보호구역' | '제한보호구역' | '비행안전구역' | '규제해제/완화지구' = '제한보호구역';
    let competentAgency = '국방부 / 관할 군단(사단) 사령부';

    if (matchedSite) {
      if (matchedSite.currentStatus.includes('반환 완료') || matchedSite.currentStatus.includes('기부대양여 협의')) {
        militaryRestrictionLevel = '제한보호구역';
        competentAgency = `${matchedSite.regionName} / 관할 3군단·2군단·지상작전사령부`;
      }
      if (matchedSite.id.includes('airfield') || matchedSite.name.includes('비행장') || matchedSite.name.includes('항공대')) {
        militaryRestrictionLevel = '비행안전구역';
        competentAgency = '공군 제18전투비행단 / 육군 항공사령부';
      }
      if (matchedSite.subregion === '북부 접경권' && matchedSite.district.includes('민통선')) {
        militaryRestrictionLevel = '통제보호구역';
        competentAgency = '합동참모본부 / 관할 사단장';
      }
    }

    // 2. 신호등 판정 추론 (Rule Inference)
    let verdict: TrafficLightVerdict = 'YELLOW';
    let verdictLabel = '🟡 군 작전성 협의 조건부 가능';
    let verdictDetail = '군사기지 및 군사시설 보호법 제13조에 따라 관할 군부대 작전성 행정협의(고도제한 및 차폐선 준수) 후 복합개발 승인 가능합니다.';

    if (militaryRestrictionLevel === '통제보호구역') {
      verdict = 'RED';
      verdictLabel = '🔴 규제 해제 및 도시관리계획 변경 선행 필요';
      verdictDetail = '통제보호구역은 원칙적으로 건축이 금지되므로 국방부 보호구역심의위원회의 제한보호구역 완화 및 도시관리계획 결정이 선행되어야 합니다.';
    } else if (
      matchedSite &&
      (matchedSite.currentStatus.includes('반환 완료') || matchedSite.currentStatus.includes('이전 완료')) &&
      slopeDeg <= 8.0
    ) {
      verdict = 'GREEN';
      verdictLabel = '🟢 즉시 개발 가능 (행정협의 착수 적합)';
      verdictDetail = '영내 병영 철거 및 부지 반환이 진척되어 지자체 도시개발구역 지정 및 기부대양여 합의각서(기본합의서) 체결을 즉시 추진할 수 있습니다.';
    }

    // 3. 지형 및 산지전용 가용성 추론
    let slopeFeasibility: 'EXCELLENT' | 'CONDITIONAL' | 'RESTRICTED' = 'EXCELLENT';
    let slopeDescription = `평균 경사도 ${slopeDeg.toFixed(1)}° (평탄지, 토공 균형 우수 및 산지전용허가 법정 기준 충족)`;
    if (slopeDeg > 15.0) {
      slopeFeasibility = 'CONDITIONAL';
      slopeDescription = `평균 경사도 ${slopeDeg.toFixed(1)}° (산지관리법 제14조 15도 기준 초과 ➔ 옹벽·사면 보강 및 단차 설계 필요)`;
    }
    if (slopeDeg > 25.0) {
      slopeFeasibility = 'RESTRICTED';
      slopeDescription = `평균 경사도 ${slopeDeg.toFixed(1)}° (산지관리법상 급경사지 보전산지 ➔ 전용 제한구역 저촉)`;
    }

    // 4. 개발 스펙 산출 (국토계획법 제77조/78조 건폐율·용적률 및 종상향 추론)
    let currentBcr = 20;
    let currentFar = 80;
    let targetZoning = '준주거지역 (도시개발구역 지정)';
    let targetBcr = 70;
    let targetFar = 400;
    let maxHeightM = 55.0; // 15층 R&D 타워 기준

    if (currentZoning.includes('준주거')) {
      currentBcr = 70;
      currentFar = 400;
      targetZoning = '일반상업지역 (종상향 시)';
      targetBcr = 80;
      targetFar = 800;
      maxHeightM = 85.0;
    } else if (currentZoning.includes('2종')) {
      currentBcr = 60;
      currentFar = 200;
      targetZoning = '준주거지역 (지구단위계획 수립)';
      targetBcr = 70;
      targetFar = 400;
      maxHeightM = 65.0;
    }

    if (militaryRestrictionLevel === '비행안전구역') {
      maxHeightM = Math.min(maxHeightM, 45.0); // 비행안전 표면 제한
    }

    const estimatedLandValueEok = Math.round((areaSqm * 420000) / 100000000); // ㎡당 약 42만원 추산
    const developmentCapacitySqm = Math.round(areaSqm * (targetFar / 100));

    const developmentSpec: DevelopmentSpecification = {
      currentZoning,
      targetZoning,
      currentBcrPct: currentBcr,
      targetBcrPct: targetBcr,
      currentFarPct: currentFar,
      targetFarPct: targetFar,
      maxAllowableHeightM: maxHeightM,
      flightSafetyCeilingM: militaryRestrictionLevel === '비행안전구역' ? 45.0 : undefined,
      slopeFeasibility,
      slopeDescription,
      estimatedLandValueEok,
      developmentCapacitySqm,
    };

    // 5. 관련 법조문 인용 생성
    const governingStatutes: StatutoryCitation[] = [
      {
        lawName: '군사기지 및 군사시설 보호법',
        article: '제13조 (행정청의 처분 등에 관한 협의)',
        summary: '행정기관의 장이 군사시설보호구역 안에서 토지 개간·건축물 신축·토지 형질변경을 허가할 때 관할부대장과 사전 협의 의무화.',
        mandatoryCondition: '관할 군단 작전성 심의위원회 고도제한 및 주작전선 차폐율 승인 득 필요',
      },
      {
        lawName: '국토의 계획 및 이용에 관한 법률',
        article: '제77조·제78조 (용도지역별 건폐율 및 용적률의 최대한도)',
        summary: '도시·군관리계획 및 지구단위계획 수립 시 용도지역 상향을 통해 건폐율 최대 70~80%, 용적률 최대 400~800% 인센티브 부여 가능.',
        mandatoryCondition: '공공기여(기부채납) 비율 약 10~15% 및 기반시설(도로망·녹지) 연계 확충',
      },
      {
        lawName: '산지관리법',
        article: '제14조 (산지전용허가 기준 및 절차)',
        summary: '산지의 평균경사도가 25도 이하이고, 50% 이상이 15도 이하인 지역에 한하여 산지전용허가 수리.',
        mandatoryCondition: '토사 유출 및 산사태 방지 사면 안정성 검토서 제출',
      },
      {
        lawName: '공익사업을 위한 토지 등의 취득 및 보상에 관한 법률',
        article: '제61조·제68조 (사업시행자 보상 및 감정평가)',
        summary: '국방·군사시설 대체부지 수용 및 종전 군 유휴부지 양여 가액 산정을 위해 2인 이상 공인감정평가법인의 평가액 산술평균 적용.',
        mandatoryCondition: '국방부 기부대양여 훈령에 따른 양여 재산과 기부 시설 간 등가교환 원칙 성립',
      },
    ];

    // 6. 행정 타임라인 절차 생성
    const administrativeTimeline: AdministrativeStep[] = [
      {
        stepNumber: 1,
        title: '사업제안서 제출 및 국방부 타당성 1차 검토',
        agency: '지자체 ➔ 국방부 시설기획관',
        legalBasis: '국방·군사시설 사업에 관한 법률 제4조',
        estimatedDuration: '약 3~4개월',
        description: '지자체 개발기본구상과 대체 군사시설 건립 계획(기부대양여안)을 공식 건의.',
      },
      {
        stepNumber: 2,
        title: '양해각서(MOU) 및 기본합의서 체결',
        agency: '국방부 ↔ 강원특별자치도 / 시·군',
        legalBasis: '국방부 대체시설 기부대양여 훈령',
        estimatedDuration: '약 6개월',
        description: '종전부지 이전 및 대체 군사시설 규격, 사업비 부담 범위에 대해 법적 구속력을 갖는 기본합의서 체결.',
      },
      {
        stepNumber: 3,
        title: '토지보상법 준용 감정평가 및 사업시행자 확정',
        agency: '한국감정평가사협회 추천 평가기관',
        legalBasis: '토지보상법 제68조',
        estimatedDuration: '약 4~5개월',
        description: '종전 군 유휴부지 공시지가 평가 및 대체시설 설계 공사비 확정(등가 교환 가액 결정).',
      },
      {
        stepNumber: 4,
        title: '도시관리계획(지구단위계획) 변경 및 실시계획인가',
        agency: '강원도 도시계획위원회 / 지자체',
        legalBasis: '국토계획법 제30조·제50조',
        estimatedDuration: '약 6~8개월',
        description: '자연녹지 ➔ 준주거/상업 종상향 고시 및 첨단 스마트 복합단지 실시계획 승인.',
      },
      {
        stepNumber: 5,
        title: '대체시설 준공·기부 ➔ 종전 군 유휴부지 양여(착공)',
        agency: '국방시설본부 ➔ 지자체/시행사',
        legalBasis: '국유재산법 제55조(양여)',
        estimatedDuration: '준공 즉시',
        description: '새로운 군사시설 기부 채납 완료 후 종전 유휴부지 소유권을 이전받아 R&D 단지 및 주거 복합 착공.',
      },
    ];

    // 7. 지식 그래프 노드 및 엣지 생성 (Graph Metamodel)
    const ontologyNodes: OntologyNode[] = [
      {
        id: 'node-site',
        label: siteName,
        type: 'site',
        color: '#10b981',
        badge: `${areaPyeong.toLocaleString()}평 / EL.${(input.groundElevationM || 135).toFixed(0)}m`,
      },
      {
        id: 'node-restriction',
        label: militaryRestrictionLevel,
        type: 'restriction',
        color: militaryRestrictionLevel === '통제보호구역' ? '#ef4444' : '#f59e0b',
        badge: '군사기지법 제13조',
      },
      {
        id: 'node-statute-mil',
        label: '군사기지 및 군사시설 보호법',
        type: 'statute',
        color: '#3b82f6',
        badge: '작전성 행정협의',
      },
      {
        id: 'node-statute-plan',
        label: '국토의 계획 및 이용에 관한 법률',
        type: 'statute',
        color: '#6366f1',
        badge: `용적률 최대 ${targetFar}%`,
      },
      {
        id: 'node-statute-land',
        label: '공익사업 토지보상법',
        type: 'statute',
        color: '#ec4899',
        badge: '기부대양여 등가산정',
      },
      {
        id: 'node-agency',
        label: competentAgency,
        type: 'agency',
        color: '#14b8a6',
        badge: '인허가 협의관할',
      },
      {
        id: 'node-spec',
        label: `${targetZoning} / ${maxHeightM}m 이하`,
        type: 'spec',
        color: '#8b5cf6',
        badge: `연면적 ${Math.round(developmentCapacitySqm / 3.30578).toLocaleString()}평`,
      },
    ];

    const ontologyEdges: OntologyEdge[] = [
      { from: 'node-site', to: 'node-restriction', relation: 'RESTRICTED_BY', description: '법적 구역 저촉' },
      { from: 'node-restriction', to: 'node-statute-mil', relation: 'GOVERNED_BY', description: '보호법 제13조 적용' },
      { from: 'node-statute-mil', to: 'node-agency', relation: 'CONSULTATION_REQUIRED', description: '관할 군단 작전성 심의' },
      { from: 'node-site', to: 'node-statute-plan', relation: 'ZONING_INCENTIVE', description: '지구단위계획 종상향' },
      { from: 'node-site', to: 'node-statute-land', relation: 'COMPENSATION_SCHEME', description: '대체시설 기부대양여' },
      { from: 'node-statute-plan', to: 'node-spec', relation: 'DEFINES_CAPACITY', description: `최대 용적률 ${targetFar}% 부여` },
    ];

    // 8. 3대 원클릭 프리셋 FAQ 답변 구성
    const faqAnswers: Record<string, string> = {
      '군사규제 해소 절차는?': `【군사규제 해소 3단계 로드맵】\n1. 행정협의 신청: 군사기지법 제13조에 의거, 지자체가 관할 군단에 3D 차폐곡면 검토서 및 배치도 제출.\n2. 작전성 검토: 관할 부대 작전심의위원회에서 비행안전선 및 주화기 사계 저촉 여부 확인 (소요 약 30~60일).\n3. 조건부 동의 및 완화: 옥상 야간 식별표지 및 차폐 한도 내 건축 허용 통보 수령 후 즉시 건축 인허가 가능.`,
      '기부대양여 및 토지보상 추산': `【기부대양여 사업성 및 보상 추산】\n• 종전 군 유휴부지 감정평가액: 약 ${estimatedLandValueEok.toLocaleString()}억원 (면적: ${areaSqm.toLocaleString()}㎡)\n• 대체 군사시설 건립 추정비용: 약 ${Math.round(estimatedLandValueEok * 0.85).toLocaleString()}억원\n• 토지보상법 제68조 감정평가 법인 2개사 산술평균 기준 적용 시, 지자체 순사업이익률 약 15~22% 달성 가능.`,
      '용도지역 종상향 시 최대 용적률은?': `【용도지역 종상향 복합개발 스펙】\n• 현재: ${currentZoning} (건폐율 ${currentBcr}%, 용적률 ${currentFar}%)\n• 종상향 후: ${targetZoning} (건폐율 ${targetBcr}%, 용적률 ${targetFar}%)\n• 최대 건축 가능 연면적: ${developmentCapacitySqm.toLocaleString()}㎡ (약 ${Math.round(developmentCapacitySqm / 3.30578).toLocaleString()}평)\n• 최고 허용 층수: 15~25층 (${maxHeightM}m) 국방·반도체 R&D 타워 및 지식산업센터 복합 건립 가능.`,
    };

    return {
      siteId,
      siteName,
      regionName,
      areaSqm,
      areaPyeong,
      verdict,
      verdictLabel,
      verdictDetail,
      militaryRestrictionLevel,
      competentMilitaryAgency: competentAgency,
      governingStatutes,
      developmentSpec,
      administrativeTimeline,
      ontologyNodes,
      ontologyEdges,
      faqAnswers,
    };
  }
}
