/**
 * lib/vendor/semanticSpatialQuery.ts
 *
 * [GeoBrief 3D: 자연어 공간 시맨틱 쿼리 엔진 (Semantic Spatial Query Engine)]
 *
 * NVIDIA Auto-Ontology 아키텍처 연계:
 * 비정형 자연어 질의(Natural Language Query)를 실시간 파싱하여
 * 지자체·권역, 필요 면적, 허용 경사도, 군사규제 요건, 개발 목적 엔티티를 추출하고
 * 강원 18개 시·군 24개 핵심 군 유휴부지·전략 거점을 다차원 스코어링(0~100점)하여
 * 최적 후보지와 3D 비행 좌표 및 온톨로지 신호등 판정을 반환.
 */

import {
  GANGWON_18_MILITARY_SITES,
  Gangwon18MilitarySite,
} from '@/constants/gangwon18MilitarySites';
import {
  SpatialOntologyEngine,
  LegalOntologyAssessmentReport,
} from './spatialOntologyEngine';

export interface SemanticQueryEntities {
  rawQuery: string;
  targetRegions: string[];         // e.g. ['원주시', '원주']
  targetSubregions: string[];      // e.g. ['영서 중·남부권', '북부 접경권']
  minAreaPyeong?: number;          // e.g. 30000 (3만평)
  minAreaSqm?: number;             // e.g. 99000
  maxSlopeDeg?: number;            // e.g. 15.0
  militaryRegulations: string[];   // e.g. ['제한보호구역', '비행안전구역', '통제보호구역']
  developmentPurposes: string[];   // e.g. ['산업·R&D', '반도체', '복합개발', '스마트팜']
  isPyeongCondition: boolean;
  isSlopeCondition: boolean;
}

export interface SemanticQueryResult {
  site: Gangwon18MilitarySite;
  score: number; // 0 ~ 100
  matchingBadges: string[];
  matchingRationale: string;
  ontologyReport: LegalOntologyAssessmentReport;
}

/**
 * 1. 비정형 자연어 질의에서 공간·규제·목적 엔티티 정밀 추출 (Entity Extraction)
 */
export function parseSemanticSpatialQuery(query: string): SemanticQueryEntities {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  const targetRegions: string[] = [];
  const targetSubregions: string[] = [];
  const militaryRegulations: string[] = [];
  const developmentPurposes: string[] = [];

  // 강원 18개 시·군 매칭
  const regionKeywords: Record<string, string[]> = {
    원주시: ['원주', '원주시'],
    춘천시: ['춘천', '춘천시'],
    강릉시: ['강릉', '강릉시'],
    동해시: ['동해', '동해시'],
    속초시: ['속초', '속초시'],
    삼척시: ['삼척', '삼척시'],
    태백시: ['태백', '태백시'],
    홍천군: ['홍천', '홍천군'],
    횡성군: ['횡성', '횡성군'],
    영월군: ['영월', '영월군'],
    평창군: ['평창', '평창군'],
    정선군: ['정선', '정선군'],
    철원군: ['철원', '철원군'],
    화천군: ['화천', '화천군'],
    양구군: ['양구', '양구군'],
    인제군: ['인제', '인제군'],
    고성군: ['고성', '고성군'],
    양양군: ['양양', '양양군'],
  };

  for (const [regionName, kws] of Object.entries(regionKeywords)) {
    if (kws.some((kw) => trimmed.includes(kw))) {
      targetRegions.push(regionName);
    }
  }

  // 3대 권역 매칭
  if (trimmed.includes('접경') || trimmed.includes('북부') || trimmed.includes('민통선') || trimmed.includes('dmz')) {
    targetSubregions.push('북부 접경권');
  }
  if (trimmed.includes('영서') || trimmed.includes('중부') || trimmed.includes('남부')) {
    targetSubregions.push('영서 중·남부권');
  }
  if (trimmed.includes('영동') || trimmed.includes('동해안') || trimmed.includes('해안') || trimmed.includes('태백')) {
    targetSubregions.push('동해안 및 태백권');
  }

  // 면적 엔티티 파싱: "3만평", "3만 평", "10만평", "5만m2", "50,000㎡"
  let minAreaPyeong: number | undefined;
  let minAreaSqm: number | undefined;
  let isPyeongCondition = false;

  const manPyeongMatch = trimmed.match(/([0-9.]+)\s*만\s*평/);
  if (manPyeongMatch) {
    minAreaPyeong = parseFloat(manPyeongMatch[1]) * 10000;
    minAreaSqm = minAreaPyeong * 3.30578;
    isPyeongCondition = true;
  } else {
    const pyeongMatch = trimmed.match(/([0-9,]+)\s*평/);
    if (pyeongMatch) {
      minAreaPyeong = parseFloat(pyeongMatch[1].replace(/,/g, ''));
      minAreaSqm = minAreaPyeong * 3.30578;
      isPyeongCondition = true;
    } else {
      const sqmMatch = trimmed.match(/([0-9,]+)\s*(?:m2|㎡|제곱미터)/i);
      if (sqmMatch) {
        minAreaSqm = parseFloat(sqmMatch[1].replace(/,/g, ''));
        minAreaPyeong = Math.round(minAreaSqm / 3.30578);
        isPyeongCondition = true;
      }
    }
  }

  // 경사도 엔티티 파싱: "경사도 15도 이하", "15도 미만", "경사 10도", "평탄", "완경사"
  let maxSlopeDeg: number | undefined;
  let isSlopeCondition = false;
  const slopeMatch = trimmed.match(/경사(?:도)?\s*([0-9.]+)\s*도/);
  if (slopeMatch) {
    maxSlopeDeg = parseFloat(slopeMatch[1]);
    isSlopeCondition = true;
  } else if (trimmed.includes('평탄') || trimmed.includes('평지')) {
    maxSlopeDeg = 5.0;
    isSlopeCondition = true;
  } else if (trimmed.includes('완경사')) {
    maxSlopeDeg = 15.0;
    isSlopeCondition = true;
  }

  // 군사 규제 엔티티 매칭
  if (trimmed.includes('제한보호구역') || trimmed.includes('제한보호')) {
    militaryRegulations.push('제한보호구역');
  }
  if (trimmed.includes('통제보호구역') || trimmed.includes('통제보호')) {
    militaryRegulations.push('통제보호구역');
  }
  if (trimmed.includes('비행안전구역') || trimmed.includes('비행안전') || trimmed.includes('비행장') || trimmed.includes('고도제한')) {
    militaryRegulations.push('비행안전구역');
  }
  if (trimmed.includes('군사규제') || trimmed.includes('기부대양여') || trimmed.includes('반환')) {
    militaryRegulations.push('군사규제완화');
  }

  // 개발 목적 엔티티 매칭
  const purposeMap: Record<string, string[]> = {
    '산업·R&D': ['산업', 'r&d', '연구', '테크노', '클러스터', '지식산업'],
    '반도체': ['반도체', '팹리스', '소부장'],
    '바이오·의료': ['바이오', '의료', '헬스케어'],
    '복합개발': ['복합개발', '스마트시티', '복합단지', '도시개발'],
    '물류·유통': ['물류', '유통', '물류단지', '터미널'],
    '주거·생태': ['주거', '아파트', '정주', '생태', '힐링'],
    '관광·레저': ['관광', '레저', '휴양', '리조트', '문화'],
    '스마트팜': ['스마트팜', '농업', '애그리', '농생명'],
    '데이터센터': ['데이터센터', 'idc', '인공지능', 'ai센터'],
  };

  for (const [purpose, kws] of Object.entries(purposeMap)) {
    if (kws.some((kw) => lower.includes(kw))) {
      developmentPurposes.push(purpose);
    }
  }

  return {
    rawQuery: trimmed,
    targetRegions,
    targetSubregions,
    minAreaPyeong,
    minAreaSqm,
    maxSlopeDeg,
    militaryRegulations,
    developmentPurposes,
    isPyeongCondition,
    isSlopeCondition,
  };
}

/**
 * 2. 엔티티 기반 후보지 다차원 스코어링 & 랭킹 알고리즘 (Scoring & Ranking Engine)
 */
export function executeSemanticSpatialQuery(query: string): SemanticQueryResult[] {
  const entities = parseSemanticSpatialQuery(query);
  if (!entities.rawQuery || entities.rawQuery.length < 2) {
    return [];
  }

  const results: SemanticQueryResult[] = [];

  for (const site of GANGWON_18_MILITARY_SITES) {
    let score = 0;
    const badges: string[] = [];
    const rationaleParts: string[] = [];

    // 1) 지역 / 권역 일치도 (최대 35점)
    if (entities.targetRegions.length > 0) {
      if (entities.targetRegions.includes(site.regionName)) {
        score += 35;
        badges.push(site.regionName);
        rationaleParts.push(`요청 지역(${site.regionName})과 100% 일치`);
      } else {
        // 지역이 명시되었으나 다른 지역인 경우 큰 감점
        score -= 20;
      }
    } else if (entities.targetSubregions.length > 0) {
      if (entities.targetSubregions.includes(site.subregion)) {
        score += 25;
        badges.push(site.subregion);
        rationaleParts.push(`요청 권역(${site.subregion}) 관할 부지`);
      }
    } else {
      // 지역 조건이 없으면 기본 점수
      score += 15;
    }

    // 2) 면적 요건 (최대 25점)
    if (entities.minAreaPyeong) {
      if (site.areaPyeong >= entities.minAreaPyeong) {
        score += 25;
        badges.push(`대지 ${site.areaPyeong.toLocaleString()}평`);
        rationaleParts.push(`요청 면적(${entities.minAreaPyeong.toLocaleString()}평 이상) 충족`);
      } else if (site.areaPyeong >= entities.minAreaPyeong * 0.7) {
        score += 12;
        rationaleParts.push(`요청 면적 근접(${site.areaPyeong.toLocaleString()}평)`);
      } else {
        score -= 10;
      }
    } else {
      score += 10;
    }

    // 3) 경사도 요건 (최대 15점)
    let slopeVal = 4.0;
    if (site.averageSlope) {
      const match = site.averageSlope.match(/([0-9.]+)/);
      if (match) slopeVal = parseFloat(match[1]);
    }

    if (entities.maxSlopeDeg !== undefined) {
      if (slopeVal <= entities.maxSlopeDeg) {
        score += 15;
        badges.push(`경사 ${slopeVal.toFixed(1)}°`);
        rationaleParts.push(`법정 허용 경사(${entities.maxSlopeDeg}° 이하) 충족`);
      } else {
        score -= 8;
      }
    } else {
      if (slopeVal <= 5.0) score += 10;
      else if (slopeVal <= 15.0) score += 5;
    }

    // 4) 군사 규제 및 인허가 적합도 (최대 15점)
    if (entities.militaryRegulations.length > 0) {
      if (entities.militaryRegulations.includes('비행안전구역')) {
        if (site.id.includes('airfield') || site.name.includes('비행장') || site.name.includes('항공대')) {
          score += 15;
          badges.push('비행안전구역');
          rationaleParts.push('비행안전구역 고도제한 분석 대상');
        }
      }
      if (entities.militaryRegulations.includes('제한보호구역')) {
        if (!site.district.includes('민통선')) {
          score += 15;
          badges.push('제한보호구역');
          rationaleParts.push('군사기지법 제13조 행정협의 가능 제한보호구역');
        }
      }
      if (entities.militaryRegulations.includes('통제보호구역')) {
        if (site.subregion === '북부 접경권' || site.district.includes('민통선')) {
          score += 15;
          badges.push('통제보호구역');
          rationaleParts.push('민통선 북방 통제보호구역 저촉 부지');
        }
      }
      if (entities.militaryRegulations.includes('군사규제완화')) {
        if (site.currentStatus.includes('반환') || site.currentStatus.includes('기부대양여')) {
          score += 15;
          badges.push('규제 완화/반환 진행');
          rationaleParts.push('국방부 기부대양여 및 반환 협의 진행 중');
        }
      }
    } else {
      score += 8;
    }

    // 5) 개발 목적 매칭 (최대 15점)
    if (entities.developmentPurposes.length > 0) {
      let purposeMatched = false;
      for (const purp of entities.developmentPurposes) {
        if (
          site.targetUse.includes(purp) ||
          site.devVision.includes(purp) ||
          site.keyFeatures.some((k) => k.includes(purp))
        ) {
          score += 15;
          badges.push(purp);
          rationaleParts.push(`개발 목적(${purp})과 마스터플랜 부합`);
          purposeMatched = true;
          break;
        }
      }
      if (!purposeMatched) {
        // 간접 키워드 매칭
        const combined = `${site.targetUse} ${site.devVision}`.toLowerCase();
        if (combined.includes('산업') || combined.includes('복합') || combined.includes('첨단')) {
          score += 8;
        }
      }
    } else {
      score += 8;
    }

    // 텍스트 단순 포함 가산점
    if (site.name.includes(entities.rawQuery) || site.district.includes(entities.rawQuery)) {
      score += 20;
    }

    // 최종 스코어 보정 (0 ~ 100 범위)
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

    // 최소 점수 40점 이상인 경우만 결과에 포함
    if (normalizedScore >= 40) {
      const ontologyReport = SpatialOntologyEngine.assessLegalFeasibility({
        siteId: site.id,
        areaSqm: site.areaSqm,
        averageSlopeDeg: slopeVal,
      });

      const verdictBadge =
        ontologyReport.verdict === 'GREEN'
          ? '🟢 개발적지'
          : ontologyReport.verdict === 'YELLOW'
          ? '🟡 조건부협의'
          : '🔴 규제완화선행';

      results.push({
        site,
        score: normalizedScore,
        matchingBadges: [verdictBadge, ...badges],
        matchingRationale: rationaleParts.join(' · ') || '공간 지식 그래프 기반 적지 분석 일치',
        ontologyReport,
      });
    }
  }

  // 스코어 내림차순 정렬
  results.sort((a, b) => b.score - a.score);

  return results;
}
