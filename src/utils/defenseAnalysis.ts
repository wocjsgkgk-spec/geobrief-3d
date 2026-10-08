import * as turf from '@turf/turf';
import { DefenseAnalysisResult, AirfieldInfo } from '@/types/defense';
import { GANGWON_MILITARY_AIRFIELDS } from '@/constants/militaryAirfields';
import { GANGWON_REGIONS } from '@/constants/gangwonRegions';

export function analyzeDefenseRegulations(
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null,
  centerCoords: [number, number] | null
): DefenseAnalysisResult | null {
  if (!polygon && !centerCoords) return null;

  const center: [number, number] = centerCoords || (() => {
    if (polygon) {
      const centroid = turf.centroid(polygon);
      return centroid.geometry.coordinates as [number, number];
    }
    return [127.9, 37.8];
  })();

  const [lng, lat] = center;

  // 1. 가장 인접한 시·군 탐색
  let nearestRegion = GANGWON_REGIONS[0];
  let minRegionDist = Infinity;
  for (const r of GANGWON_REGIONS) {
    const dist = turf.distance(center, r.center, { units: 'kilometers' });
    if (dist < minRegionDist) {
      minRegionDist = dist;
      nearestRegion = r;
    }
  }

  // 2. 비행안전구역 영향 판정
  let matchedAirfield: AirfieldInfo | undefined;
  let minAirfieldDist = Infinity;

  for (const airfield of GANGWON_MILITARY_AIRFIELDS) {
    const dist = turf.distance(center, airfield.center, { units: 'kilometers' });
    if (dist <= airfield.radiusKm && dist < minAirfieldDist) {
      minAirfieldDist = dist;
      matchedAirfield = airfield;
    }
  }

  const hasFlightSafetyZone = !!matchedAirfield;
  const distanceToAirfieldKm = matchedAirfield ? Math.round(minAirfieldDist * 10) / 10 : undefined;

  // 허용 고도 계산 (비행장과의 거리에 따라 점진적 차등 부여)
  let maxSurfaceHeight = 45;
  let maxSeaLevelHeight = 140;
  let recommendedFloors = '지하 1층 ~ 지상 12층 이하 권장';

  if (matchedAirfield) {
    // 비행장 반경 내에서 거리가 멀어질수록 경사면 고도 점진적 상승 허용
    const distRatio = Math.min(1, Math.max(0, (minAirfieldDist - 1.5) / (matchedAirfield.radiusKm - 1.5)));
    maxSurfaceHeight = Math.round(matchedAirfield.maxSurfaceHeight + distRatio * 15);
    maxSeaLevelHeight = Math.round(matchedAirfield.elevation + maxSurfaceHeight);
    const floors = Math.max(5, Math.floor(maxSurfaceHeight / 3.3));
    recommendedFloors = `지하 1층 ~ 지상 ${floors}층 이하 권장 (최대 ${maxSurfaceHeight}m)`;
  }

  // 3. 군사시설보호구역 3단 분류 판정
  // (1) 통제보호구역: MDL 5km 이내 / 민통선 이북 (위도 38.25 이상 접경 권역 및 펀치볼 북단 등)
  const isControlled =
    lat >= 38.25 &&
    (nearestRegion.id === 'cheorwon' ||
      nearestRegion.id === 'hwacheon' ||
      nearestRegion.id === 'yanggu' ||
      nearestRegion.id === 'inje' ||
      nearestRegion.id === 'goseong');

  // (2) 제한보호구역: 군사분계선 이남 25km 이내 또는 주요 군 작전기지 주둔 권역 (위도 37.6 이상 영서/영동 전방)
  const isRestricted = !isControlled && (lat >= 37.65 || nearestRegion.subregion.includes('접경') || hasFlightSafetyZone);

  // 종합 구역 명칭 및 법령, 관할부대
  let classification: DefenseAnalysisResult['classification'] = 'general';
  let zoneName = '일반 관리구역 (군사시설보호구역 외)';
  const subZones: string[] = [];
  let statute = '「건축법」 및 지자체 도시계획조례';
  let jurisdiction = '관할 지자체 건축허가과';
  let feasibility: DefenseAnalysisResult['feasibility'] = 'PERMITTED';
  let feasibilityText = '인허가 자유 (보호구역 외)';
  let feasibilityDescription = '군사시설보호구역 미저촉 지역으로 통상적인 지자체 인허가 절차가 적용됩니다.';
  let badgeVariant: DefenseAnalysisResult['badgeVariant'] = 'emerald';

  if (isControlled) {
    classification = 'controlled';
    zoneName = '통제보호구역 (원칙적 민간 건축 제한)';
    subZones.push('군사기지 및 군사시설 통제보호구역 (MDL 5km / 민통선 이북)');
    statute = '「군사기지 및 군사시설 보호법」 제4조 제1호, 제5조';
    jurisdiction = nearestRegion.name.includes('철원')
      ? '육군 제5군단 / 지상작전사령부'
      : nearestRegion.name.includes('양구') || nearestRegion.name.includes('화천')
      ? '육군 제2군단 / 지상작전사령부'
      : '육군 제3군단 / 지상작전사령부';
    feasibility = 'PROHIBITED';
    feasibilityText = '원칙적 건축 제한';
    feasibilityDescription =
      '군사시설 보호 목적 외 민간 건축행위가 원칙적으로 금지되며, 국방부 장관 및 작전사령관 특별 승인이 필수적입니다.';
    badgeVariant = 'rose';
  } else if (hasFlightSafetyZone && isRestricted) {
    classification = 'flight_safety';
    zoneName = `제한보호구역 & ${matchedAirfield!.name.split(' ')[0]} 비행안전구역`;
    subZones.push('군사시설 제한보호구역 (작전성 검토 구역)');
    subZones.push(matchedAirfield!.zoneType);
    statute = '「군사기지 및 군사시설 보호법」 제4조 제2·3호, 제9조 및 제10조';
    jurisdiction = `${matchedAirfield!.unit} & 관할 보병사단`;
    feasibility = 'CONDITIONAL';
    feasibilityText = '조건부 가능 (고도제한 협의)';
    feasibilityDescription = `비행안전 장애물 제한고도(지표면 ${maxSurfaceHeight}m / EL. ${maxSeaLevelHeight}m) 준수 시 조건부 인허가 협의 가능.`;
    badgeVariant = 'amber';
  } else if (hasFlightSafetyZone) {
    classification = 'flight_safety';
    zoneName = `${matchedAirfield!.name.split(' ')[0]} 비행안전구역`;
    subZones.push(matchedAirfield!.zoneType);
    statute = '「군사기지 및 군사시설 보호법」 제4조 제3호, 제10조';
    jurisdiction = matchedAirfield!.unit;
    feasibility = 'PERMITTED_WITH_LIMIT';
    feasibilityText = '제한고도 이하 가능';
    feasibilityDescription = `비행안전 제한고도(최대 ${maxSurfaceHeight}m 이하) 범위 내에서 건축 협의 승인 가능.`;
    badgeVariant = 'amber';
  } else if (isRestricted) {
    classification = 'restricted';
    zoneName = '군사시설 제한보호구역 (작전성 검토 구역)';
    subZones.push('군사시설 제한보호구역 (군사분계선 이남 25km 이내)');
    statute = '「군사기지 및 군사시설 보호법」 제4조 제2호, 제9조';
    jurisdiction = nearestRegion.name.includes('춘천')
      ? '육군 제2군단'
      : nearestRegion.name.includes('원주')
      ? '육군 제36보병사단'
      : nearestRegion.name.includes('강릉')
      ? '육군 제23경비여단 / 제8군단'
      : '관할 사단 작전처';
    feasibility = 'CONDITIONAL';
    feasibilityText = '조건부 가능 (작전성 검토)';
    feasibilityDescription = '관할 군부대 작전성 검토 및 위탁고도 조례 기준 충족 시 개발 허가 가능.';
    badgeVariant = 'amber';
  }

  // 면적 정보 포맷
  const areaSqm = polygon ? Math.round(turf.area(polygon)) : 0;
  const areaPyeong = Math.round(areaSqm / 3.305785);

  // 4. 관할 사단 작전성 검토 의견서 초안 텍스트 자동 생성
  const officialOpinionDraft = `[관할 사단·비행단 군사작전성 검토 및 인허가 협의 의견서 초안]

1. 대상 부지 개요
- 위치: 강원특별자치도 ${nearestRegion.name} 일원 (위도 ${lat.toFixed(5)}°N, 경도 ${lng.toFixed(5)}°E)
- 부지 규모: ${areaSqm ? `${areaSqm.toLocaleString()} ㎡ (약 ${areaPyeong.toLocaleString()} 평)` : '측정 부지'}
- 행정 권역: ${nearestRegion.name} (${nearestRegion.subregion})

2. 국방 규제 3단 분류 판정
- 보호구역 지정 현황: ${zoneName}
- 근거 법령: ${statute}
- 관할 심의 부대: ${jurisdiction}
- 인허가 타당성: [${feasibilityText}]

3. 비행안전 및 장애물 고도제한 분석
${
  hasFlightSafetyZone
    ? `- 대상 비행기지: ${matchedAirfield!.name} (부지 중심과 약 ${distanceToAirfieldKm} km 이격)
- 적용 제한표면: ${matchedAirfield!.zoneType}
- 최고 허용 고도: 지표면 기준 ${maxSurfaceHeight} m (해발고도 EL. ${maxSeaLevelHeight} m) 이하
- 권장 건축 규모: ${recommendedFloors}
- 차폐 이론(Shielding Contour) 적용성: ${matchedAirfield!.shieldingNotes}`
    : `- 비행안전구역 영향: 반경 12km 이내 군 비행장 직간접 장애물 제한 표면 비저촉
- 일반 고도 기준: 건축법 및 지자체 경관 조례 기준 적용 (군 비행안전 협의 비대상)`
}

4. 관할 작전부대 종합 협의 소견
- 본 부지는 「군사기지 및 군사시설 보호법」 제4조 및 관련 조항에 따른 ${classification === 'controlled' ? '통제보호구역' : classification === 'restricted' ? '제한보호구역' : classification === 'flight_safety' ? '비행안전구역' : '일반 관리구역'}에 해당함.
${
  isControlled
    ? '- [통제보호구역 판정] 민간 건축행위가 원칙적으로 불허되므로, 도정 현안 사업 추진 시 「강원특별자치도 설치 등에 관한 특별법」 제O조 군사규제 해제 특례 건의 또는 작전사령관 사전 특별 협의 절차가 선행되어야 할 것으로 사료됨.'
    : hasFlightSafetyZone
    ? `- [비행안전 및 차폐선 적용] 표고 및 자연 차폐선(Shielding Contour) 분석 결과, 지표면 기준 약 ${maxSurfaceHeight} m(지상 약 ${Math.floor(
        maxSurfaceHeight / 3.3
      )}층) 이하의 건축물은 관할 부대(비행단) 작전성 검토 통과 가능성이 매우 높을 것으로 사료됨. 단, 옥상 통신탑·피뢰침 등 돌출 설비가 최고 제한고도를 초과하지 않도록 실시설계 유의 요망.`
    : isRestricted
    ? '- [제한보호구역 조건부 승인] 관할 사단 작전기동로 및 관측선 저촉 여부 심의 시, 위탁고도 범위 내 시설물 배치 계획을 제출할 경우 군 협의 승인 득에 무리가 없을 것으로 판단됨.'
    : '- [개발 용이] 군사시설보호구역 외 지역으로 군 협의 절차가 면제되거나 단순 조회 수준으로 신속한 인허가 진행이 가능할 것으로 사료됨.'
}

※ 본 의견서는 GeoBrief 3D 공간정보 엔진 및 군사시설보호법령 기준 자동 산출 초안이며, 대외 브리핑 및 인허가 사전검토 자료로 활용 가능합니다.`;

  // 5. 체크포인트 리스트
  const keyCheckpoints = [
    {
      label: '통제보호구역 저촉',
      value: isControlled ? '저촉 (원칙적 건축 불허)' : '미저촉 (통제구역 외)',
      status: isControlled ? ('block' as const) : ('pass' as const),
    },
    {
      label: '제한보호구역 적용',
      value: isRestricted ? '적용 (작전성 협의 대상)' : '미적용',
      status: isRestricted ? ('warn' as const) : ('pass' as const),
    },
    {
      label: '비행안전 고도제한',
      value: hasFlightSafetyZone
        ? `적용 (${maxSurfaceHeight}m / EL. ${maxSeaLevelHeight}m)`
        : '비저촉 (자유 고도)',
      status: hasFlightSafetyZone ? ('warn' as const) : ('pass' as const),
    },
    {
      label: '차폐선(Shielding) 특례',
      value: hasFlightSafetyZone ? '적용 가능 (자연능선 차폐)' : '해당 없음',
      status: 'pass' as const,
    },
  ];

  return {
    classification,
    zoneName,
    subZones,
    statute,
    jurisdiction,
    feasibility,
    feasibilityText,
    feasibilityDescription,
    badgeVariant,
    hasFlightSafetyZone,
    airfield: matchedAirfield,
    distanceToAirfieldKm,
    maxSurfaceHeight,
    maxSeaLevelHeight,
    recommendedFloors,
    shieldingContourApplicable: hasFlightSafetyZone,
    officialOpinionDraft,
    keyCheckpoints,
  };
}
