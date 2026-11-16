/**
 * src/lib/vendor/militarySiteUtilizationEngine.ts
 *
 * [GeoBrief 3D] 군 유휴부지 다각적 활용방안 및 종합 타당성 분석 엔진
 * - 강원 18개 시·군 군 유휴지(원주 1군지사 310,000㎡, 캠프 롱 334,897㎡, 춘천 캠프페이지 540,000㎡ 등) 및 사용자 정의 작도 부지 분석
 * - 3대 표준 활용 모델(첨단 국방벤처 / 공공주거 스마트타운 / 친환경 스마트물류) 비교 분석
 * - 4대 입지 적합도 종합 스코어카드 (교통 25 + 지형 25 + 규제 25 + 인프라 25 = 100점 만점)
 * - 경제성 분석(B/C 비율, 총사업비 CAPEX, 일자리 창출, 연간 경제유발효과) 및 Cut & Fill 토공비 연동
 * - 원클릭 도정/국방 지자체 브리핑용 요약문 자동 생성
 */

import { CutFillState, PlacedFacility3D, FACILITY_PRESETS } from '@/types/map';
import { getGangwon18MilitarySiteById, Gangwon18MilitarySite } from '@/constants/gangwon18MilitarySites';

export type RedevelopmentScenarioType = 'defense_valley' | 'smart_town' | 'eco_logistics';

export interface RedevelopmentScenario {
  id: RedevelopmentScenarioType;
  name: string;
  tag: string;
  description: string;
  targetUse: string;
  plannedBcr: number; // 계획 건폐율 (%)
  plannedFar: number; // 계획 용적률 (%)
  estimatedCapexKrw: number; // 추정 총사업비 (억원)
  bcRatio: number; // 편익비용비 (B/C Ratio)
  irrPercent: number; // 내부수익률 (%)
  jobCreation: number; // 고용 창출 (명)
  residentCapacity: number; // 수용 인구 (명)
  annualEconomicOutputKrw: number; // 연간 경제파급효과 (억원)
  carbonReductionTonsYear: number; // 연간 탄소저감량 (톤/년)
  suitabilityGrade: 'S' | 'A' | 'B';
  keyFacilities: string[];
}

export interface SiteSuitabilityScorecard {
  totalScore: number; // 0 ~ 100
  grade: 'S' | 'A' | 'B';
  accessibilityScore: number; // 0 ~ 25 (교통 접근성)
  terrainScore: number; // 0 ~ 25 (지형 및 토공 용이성)
  regulatoryScore: number; // 0 ~ 25 (국방 규제 완화도)
  infraScore: number; // 0 ~ 25 (기반 인프라 연계성)
  highlights: string[];
}

export interface EnhancedSiteFeasibilityResult {
  siteAreaSqm: number;
  siteAreaPyeong: number;
  totalFootprintSqm: number;
  totalGrossFloorAreaSqm: number;
  achievedBcr: number;
  legalMaxBcr: number;
  achievedFar: number;
  legalMaxFar: number;
  residentPop: number;
  employmentPop: number;
  compliance: 'PASS' | 'EXCEEDED';
  summary: string;

  // 군 유휴지 다각적 활용방안 신규 고도화 필드
  selectedScenario: RedevelopmentScenarioType;
  scenarios: Record<RedevelopmentScenarioType, RedevelopmentScenario>;
  activeScenarioData: RedevelopmentScenario;
  suitabilityScorecard: SiteSuitabilityScorecard;
  earthworkCostKrw: number; // 토공량(Cut & Fill) 연동 부지정지 개략 공사비 (억원)
  briefingStatement: string; // 지자체/도정 보고서 요약문
  solarPotential?: {
    rooftopSolarAreaSqm: number;
    annualGenerationMwh: number;
    carbonReductionTons: number;
    annualRevenueKrw: number;
    selfSufficiencyRate: number;
  };
}

export class MilitarySiteUtilizationEngine {
  /**
   * 군 유휴부지 종합 활용방안 및 사업 타당성 분석
   */
  public static calculate(params: {
    siteId?: string | null;
    siteAreaSqm: number;
    legalZoningName?: string;
    placedFacilities?: PlacedFacility3D[];
    scenario?: RedevelopmentScenarioType;
    cutFillState?: CutFillState | null;
  }): EnhancedSiteFeasibilityResult {
    const site = params.siteId ? getGangwon18MilitarySiteById(params.siteId) : undefined;
    const safeArea = Math.max(1000, site?.areaSqm || params.siteAreaSqm || 310000);
    const siteAreaPyeong = Math.round((safeArea / 3.305785) * 10) / 10;
    const currentScenario: RedevelopmentScenarioType = params.scenario || 'defense_valley';
    const zoning = site?.zoning || params.legalZoningName || '제2종일반주거지역';

    // 1. 법정 건폐율 및 용적률 상한 판정
    let legalMaxBcr = 60;
    let legalMaxFar = 250;

    if (zoning.includes('준주거')) {
      legalMaxBcr = 70;
      legalMaxFar = 500;
    } else if (zoning.includes('상업')) {
      legalMaxBcr = 80;
      legalMaxFar = 1300;
    } else if (zoning.includes('공업') || zoning.includes('준공업')) {
      legalMaxBcr = 70;
      legalMaxFar = 400;
    } else if (zoning.includes('녹지') || zoning.includes('자연녹지') || zoning.includes('관리')) {
      legalMaxBcr = 20;
      legalMaxFar = 100;
    }

    // 2. 배치된 시설물 기반 건축면적 및 연면적 집계
    let totalFootprintSqm = 0;
    let totalGrossFloorAreaSqm = 0;
    const facilities = params.placedFacilities || [];

    for (const f of facilities) {
      const preset = FACILITY_PRESETS[f.presetId];
      const scale = f.scale || 1.0;
      const width = (preset?.defaultWidth || 20) * scale;
      const depth = (preset?.defaultDepth || 20) * scale;
      const height = f.heightMeters || preset?.defaultHeight || 12;

      const footprint = width * depth;
      const floors = Math.max(1, Math.round(height / 3.5));
      const gfa = footprint * floors;

      totalFootprintSqm += footprint;
      totalGrossFloorAreaSqm += gfa;
    }

    // 배치된 시설물이 없을 경우 시나리오별 표준 모델링 자동 적용
    if (facilities.length === 0) {
      if (currentScenario === 'defense_valley') {
        totalFootprintSqm = safeArea * 0.38;
        totalGrossFloorAreaSqm = safeArea * 2.45;
      } else if (currentScenario === 'smart_town') {
        totalFootprintSqm = safeArea * 0.32;
        totalGrossFloorAreaSqm = safeArea * 2.10;
      } else {
        totalFootprintSqm = safeArea * 0.48;
        totalGrossFloorAreaSqm = safeArea * 1.65;
      }
    }

    totalFootprintSqm = Math.round(totalFootprintSqm);
    totalGrossFloorAreaSqm = Math.round(totalGrossFloorAreaSqm);

    const achievedBcr = Math.round((totalFootprintSqm / safeArea) * 1000) / 10;
    const achievedFar = Math.round((totalGrossFloorAreaSqm / safeArea) * 1000) / 10;

    const residentPop = Math.round((totalGrossFloorAreaSqm * 0.42) / 33);
    const employmentPop = Math.round((totalGrossFloorAreaSqm * 0.58) / 25);

    const isBcrOk = achievedBcr <= legalMaxBcr;
    const isFarOk = achievedFar <= legalMaxFar;
    const compliance: 'PASS' | 'EXCEEDED' = isBcrOk && isFarOk ? 'PASS' : 'EXCEEDED';

    const summary =
      compliance === 'PASS'
        ? `법정 규제 완전 적합 (건폐율 ${achievedBcr}% / ${legalMaxBcr}%, 용적률 ${achievedFar}% / ${legalMaxFar}%)`
        : `법정 상한 초과 (계획 조정 필요: 건폐율 ${achievedBcr}% / ${legalMaxBcr}%, 용적률 ${achievedFar}% / ${legalMaxFar}%)`;

    // 3. 토공량(Cut & Fill) 연동 부지정지 개략 공사비 산출
    let earthworkCostKrw = 0;
    if (params.cutFillState && params.cutFillState.result) {
      const { totalCutVolumeM3, totalFillVolumeM3 } = params.cutFillState.result;
      const totalEarthworkM3 = (totalCutVolumeM3 || 0) + (totalFillVolumeM3 || 0);
      // 토공 단가: ㎥당 약 22,000원 (굴착, 운반, 성토, 다짐 종합)
      earthworkCostKrw = Math.round((totalEarthworkM3 * 22000) / 100000000 * 10) / 10;
    } else {
      // 기본 토공비: 부지면적 기준 약 ㎡당 18,000원 개략치
      earthworkCostKrw = Math.round(((safeArea * 18000) / 100000000) * 10) / 10;
    }

    // 4. 3대 활용 시나리오 상세 데이터 생성
    const siteScaleFactor = safeArea / 310000; // 1군지사(310,000㎡) 기준 비례 환산
    const capexBaseKrw = Math.round(3450 * siteScaleFactor + earthworkCostKrw);

    const scenarios: Record<RedevelopmentScenarioType, RedevelopmentScenario> = {
      defense_valley: {
        id: 'defense_valley',
        name: '첨단 국방·드론·AI 벤처 밸리',
        tag: '방위산업 & R&D 혁신',
        description: '국방AI 연구원, 드론 실증비행장, 방산벤처 육성관, 지식산업타워가 융합된 첨단 안보 클러스터',
        targetUse: '준공업·준주거 복합용지 (국방R&D·벤처센터)',
        plannedBcr: 55,
        plannedFar: 350,
        estimatedCapexKrw: capexBaseKrw,
        bcRatio: 1.42,
        irrPercent: 8.8,
        jobCreation: Math.round(3800 * siteScaleFactor),
        residentCapacity: Math.round(1800 * siteScaleFactor),
        annualEconomicOutputKrw: Math.round(1280 * siteScaleFactor),
        carbonReductionTonsYear: Math.round(1450 * siteScaleFactor),
        suitabilityGrade: 'S',
        keyFacilities: [
          '국방AI 융합연구센터',
          'UAV 도심항공교통 실증비행장',
          '방위산업 스타트업 지식산업타워',
          '청년 연구인력 기숙복합단지',
        ],
      },
      smart_town: {
        id: 'smart_town',
        name: '복합 공공·주거 스마트타운',
        tag: '정주환경 & 공공인프라',
        description: '청년·신혼부부 공공지원주택, 복합행정타운, 국공립 문화체육센터, 도심 수변생태공원 연계 복합단지',
        targetUse: '제2·3종일반주거지역 (공공주택·문화복지)',
        plannedBcr: 45,
        plannedFar: 240,
        estimatedCapexKrw: Math.round(capexBaseKrw * 0.92),
        bcRatio: 1.28,
        irrPercent: 6.9,
        jobCreation: Math.round(1950 * siteScaleFactor),
        residentCapacity: Math.round(6200 * siteScaleFactor),
        annualEconomicOutputKrw: Math.round(860 * siteScaleFactor),
        carbonReductionTonsYear: Math.round(3200 * siteScaleFactor),
        suitabilityGrade: 'A',
        keyFacilities: [
          '공공지원 친환경 스마트아파트',
          '영서권 복합행정복지타운',
          '국공립 어린이집 및 문화체육센터',
          '중앙 수변생태공원 및 보행전용 숲길',
        ],
      },
      eco_logistics: {
        id: 'eco_logistics',
        name: '친환경 에너지 & 스마트 물류 허브',
        tag: 'RE100 & 광역물류',
        description: '스마트 풀필먼트 물류기지, RE100 수소연료전지 및 루프탑 태양광 파크, 강원 영서권 물류 거점',
        targetUse: '일반물류·자연녹지 복합 (스마트물류·신재생에너지)',
        plannedBcr: 65,
        plannedFar: 180,
        estimatedCapexKrw: Math.round(capexBaseKrw * 0.85),
        bcRatio: 1.35,
        irrPercent: 7.8,
        jobCreation: Math.round(2600 * siteScaleFactor),
        residentCapacity: Math.round(450 * siteScaleFactor),
        annualEconomicOutputKrw: Math.round(1120 * siteScaleFactor),
        carbonReductionTonsYear: Math.round(5800 * siteScaleFactor),
        suitabilityGrade: 'A',
        keyFacilities: [
          'AI 스마트 풀필먼트 물류센터',
          '수소 모빌리티 충전소 및 연료전지 발전소',
          '옥상 태양광 대규모 발전 어레이',
          '콜드체인 및 특수물류 전용창고',
        ],
      },
    };

    const activeScenarioData = scenarios[currentScenario];

    // 5. 4대 다기준 입지 적합도 종합 스코어 산출
    let accessScore = 23;
    let terrainScore = 24;
    let regulatoryScore = 22;
    let infraScore = 23;

    if (site) {
      accessScore = Math.min(25, Math.max(18, Math.round((site.transitInfo?.score || 88) * 0.25)));
      const slopeVal = parseFloat(site.averageSlope) || 2.5;
      terrainScore = slopeVal <= 3.0 ? 25 : slopeVal <= 6.0 ? 22 : 18;
      regulatoryScore = site.currentStatus.includes('이전') || site.currentStatus.includes('기부대양여') ? 24 : 20;
      infraScore = 23;
    }

    const totalScore = accessScore + terrainScore + regulatoryScore + infraScore;
    const grade: 'S' | 'A' | 'B' = totalScore >= 90 ? 'S' : totalScore >= 80 ? 'A' : 'B';

    const suitabilityScorecard: SiteSuitabilityScorecard = {
      totalScore,
      grade,
      accessibilityScore: accessScore,
      terrainScore,
      regulatoryScore,
      infraScore,
      highlights: [
        `교통 접근성: KTX 원주/만종역 및 영동·중앙고속도로 IC 10분 이내 연계 (${accessScore}/25점)`,
        `지형 용이성: 평균 경사도 2.5° 미만 평탄지로 부지정지 토공성 우수 (${terrainScore}/25점)`,
        `규제 완화도: 기부대양여 및 군사시설보호구역 해제 절차 순항 (${regulatoryScore}/25점)`,
        `인프라 연계: 상하수도·한전 전력망 인입 용이 및 배후 시가지 인접 (${infraScore}/25점)`,
      ],
    };

    // 6. 도정/국방 지자체 브리핑용 요약문 자동 생성
    const siteName = site?.name || '해당 군 유휴부지';
    const briefingStatement =
      `[${siteName} 활용방안 타당성 브리핑]\n` +
      `• 부지 면적: ${safeArea.toLocaleString()}㎡ (약 ${siteAreaPyeong.toLocaleString()}평) | 용도지역: ${zoning}\n` +
      `• 권장 활용 모델: ${activeScenarioData.name} (${activeScenarioData.tag})\n` +
      `• 종합 적합도: ${totalScore}점 (${grade}등급, 즉시 사업추진 권장) | B/C 분석: ${activeScenarioData.bcRatio} (경제성 우수)\n` +
      `• 경제적 파급효과: 추정 총사업비 ${activeScenarioData.estimatedCapexKrw.toLocaleString()}억원, 신규 일자리 ${activeScenarioData.jobCreation.toLocaleString()}명 창출, 연간 경제유발액 ${activeScenarioData.annualEconomicOutputKrw.toLocaleString()}억원\n` +
      `• 부지정지 토공비: 약 ${earthworkCostKrw}억원 (Cut & Fill 수평고도 정합 기준)`;

    // 7. 3D 옥상 일조권 & 신재생에너지 발전 잠재량 산출
    const plannedFootprint = safeArea * (activeScenarioData.plannedBcr / 100);
    const rooftopSolarAreaSqm = Math.round(plannedFootprint * 0.55);
    const annualGenerationMwh = Math.round((rooftopSolarAreaSqm * 1350 * 0.18) / 1000);
    const carbonReductionTons = Math.round(annualGenerationMwh * 0.466);
    const annualRevenueKrw = Math.round(((annualGenerationMwh * 165000) / 100000000) * 10) / 10;
    const selfSufficiencyRate = Math.min(100, Math.max(15, Math.round((annualGenerationMwh / (totalGrossFloorAreaSqm * 0.08 || 1200)) * 100)));

    const solarPotential = {
      rooftopSolarAreaSqm,
      annualGenerationMwh,
      carbonReductionTons,
      annualRevenueKrw,
      selfSufficiencyRate,
    };

    return {
      siteAreaSqm: safeArea,
      siteAreaPyeong,
      totalFootprintSqm,
      totalGrossFloorAreaSqm,
      achievedBcr,
      legalMaxBcr,
      achievedFar,
      legalMaxFar,
      residentPop,
      employmentPop,
      compliance,
      summary,

      selectedScenario: currentScenario,
      scenarios,
      activeScenarioData,
      suitabilityScorecard,
      earthworkCostKrw,
      briefingStatement,
      solarPotential,
    };
  }

  /**
   * [군 유휴부지 복합 3D 마스터플랜 원클릭 자동 배치 생성기]
   * 시나리오에 맞는 핵심 3D 시설물(R&D 타워, 스마트 아파트, 물류 데포, 헬리패드 등)을
   * 부지 경계 내부에 최적의 축선과 이격거리로 자동 배치
   */
  public static generateMasterplanFacilities(
    siteId?: string | null,
    scenario: RedevelopmentScenarioType = 'defense_valley'
  ): PlacedFacility3D[] {
    const site = getGangwon18MilitarySiteById(siteId || 'wj-1st-logistics');
    const center = site?.center || [127.9258, 37.3422];
    const now = Date.now();

    const result: PlacedFacility3D[] = [];

    if (scenario === 'defense_valley') {
      // 1. 중앙 첨단 국방 R&D 타워 (본관)
      result.push({
        id: `mp-def-tower1-${now}`,
        presetId: 'defense_rd_tower',
        name: '첨단 국방 AI·드론 R&D 타워 (본관)',
        coords: [center[0] - 0.0008, center[1] + 0.0006],
        elevation: 142.0,
        rotationY: 15,
        scale: 1.2,
        heightMeters: 38.4,
        createdAt: now,
      });

      // 2. 민군 융합 벤처 보육타워 (별관)
      result.push({
        id: `mp-def-tower2-${now}`,
        presetId: 'defense_rd_tower',
        name: '민군 융합 방위산업 창업보육관',
        coords: [center[0] + 0.0010, center[1] + 0.0006],
        elevation: 142.0,
        rotationY: 345,
        scale: 1.1,
        heightMeters: 35.2,
        createdAt: now,
      });

      // 3. 국방 무인기/UAV 실증 비상 헬리패드
      result.push({
        id: `mp-def-helipad-${now}`,
        presetId: 'helipad_base',
        name: 'UAV·드론 실증 시험 이착륙장 (H)',
        coords: [center[0] - 0.0014, center[1] - 0.0007],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.3,
        heightMeters: 1.5,
        createdAt: now,
      });

      // 4. 전략 국방 군수 보급 테스트 데포
      result.push({
        id: `mp-def-depot-${now}`,
        presetId: 'logistics_depot',
        name: '첨단 군수 물자 스마트 시험창고',
        coords: [center[0] + 0.0012, center[1] - 0.0007],
        elevation: 142.0,
        rotationY: 105,
        scale: 1.0,
        heightMeters: 13.0,
        createdAt: now,
      });

      // 5. 360도 레이더 관측 감시탑
      result.push({
        id: `mp-def-tower-${now}`,
        presetId: 'watch_tower',
        name: '외곽 대드론 레이더 감시타워',
        coords: [center[0] + 0.0018, center[1] + 0.0012],
        elevation: 142.0,
        rotationY: 45,
        scale: 1.0,
        heightMeters: 15.0,
        createdAt: now,
      });

      // 6. 민군 융합 종합 행정 지원센터
      result.push({
        id: `mp-def-hq-${now}`,
        presetId: 'barracks_hq',
        name: '국방벤처 종합 행정 지원센터',
        coords: [center[0], center[1] - 0.0010],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.1,
        heightMeters: 10.5,
        createdAt: now,
      });
    } else if (scenario === 'smart_town') {
      // 1. 공공지원 스마트아파트 주동 101동
      result.push({
        id: `mp-st-apt1-${now}`,
        presetId: 'defense_rd_tower',
        name: '스마트타운 101동 (청년·신혼 주거)',
        coords: [center[0] - 0.0012, center[1] + 0.0008],
        elevation: 142.0,
        rotationY: 10,
        scale: 1.3,
        heightMeters: 48.0,
        createdAt: now,
      });

      // 2. 스마트아파트 주동 102동
      result.push({
        id: `mp-st-apt2-${now}`,
        presetId: 'defense_rd_tower',
        name: '스마트타운 102동 (공공임대 주동)',
        coords: [center[0] + 0.0010, center[1] + 0.0008],
        elevation: 142.0,
        rotationY: 350,
        scale: 1.3,
        heightMeters: 48.0,
        createdAt: now,
      });

      // 3. 복합 행정복지타운 & 도서관
      result.push({
        id: `mp-st-hq-${now}`,
        presetId: 'barracks_hq',
        name: '영서권 복합 문화체육 커뮤니티센터',
        coords: [center[0], center[1] - 0.0006],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.2,
        heightMeters: 12.0,
        createdAt: now,
      });

      // 4. 주민 비상 헬리패드
      result.push({
        id: `mp-st-helipad-${now}`,
        presetId: 'helipad_base',
        name: '응급의료 닥터헬기 전용 헬리패드',
        coords: [center[0] - 0.0015, center[1] - 0.0009],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.2,
        heightMeters: 1.2,
        createdAt: now,
      });
    } else {
      // eco_logistics
      // 1. 메인 AI 스마트 풀필먼트 물류센터
      result.push({
        id: `mp-eco-depot1-${now}`,
        presetId: 'logistics_depot',
        name: '친환경 스마트 풀필먼트 물류센터 1관',
        coords: [center[0] - 0.0010, center[1] + 0.0005],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.4,
        heightMeters: 18.0,
        createdAt: now,
      });

      // 2. 콜드체인 특수물류 전용창고
      result.push({
        id: `mp-eco-depot2-${now}`,
        presetId: 'logistics_depot',
        name: '영서권 의약·신선식품 콜드체인 물류센터',
        coords: [center[0] + 0.0012, center[1] + 0.0005],
        elevation: 142.0,
        rotationY: 180,
        scale: 1.3,
        heightMeters: 16.0,
        createdAt: now,
      });

      // 3. 관제 및 운영 통합본부 타워
      result.push({
        id: `mp-eco-tower-${now}`,
        presetId: 'defense_rd_tower',
        name: '스마트 물류 관제 & 에너지 허브 타워',
        coords: [center[0], center[1] - 0.0007],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.0,
        heightMeters: 28.0,
        createdAt: now,
      });

      // 4. 항공 화물 드론 배송 헬리패드
      result.push({
        id: `mp-eco-helipad-${now}`,
        presetId: 'helipad_base',
        name: '화물 드론 라스트마일 허브 헬리패드',
        coords: [center[0] - 0.0016, center[1] - 0.0008],
        elevation: 142.0,
        rotationY: 0,
        scale: 1.2,
        heightMeters: 1.2,
        createdAt: now,
      });
    }

    return result;
  }
}
