// 국방 규제 및 비행안전 고도제한 심층 분석 타입 정의
// 「군사기지 및 군사시설 보호법」 기준 3단 분류 (통제보호 / 제한보호 / 비행안전)

export type DefenseZoneClassification =
  | 'controlled'    // 통제보호구역 (원칙적 민간 건축 제한, 군사시설 보호)
  | 'restricted'    // 제한보호구역 (관할 부대 작전성 검토 및 위탁 고도 범위 내 조건부 개발)
  | 'flight_safety' // 비행안전구역 (군 비행장 활주로 인근 장애물 제한 표면)
  | 'general';      // 일반 관리구역 (군사시설보호구역 외)

export type FeasibilityGrade =
  | 'PROHIBITED'            // 건축 제한 (불가 / 극히 제한)
  | 'CONDITIONAL'           // 조건부 가능 (작전성 검토 필요)
  | 'PERMITTED_WITH_LIMIT'  // 고도제한 이하 가능
  | 'PERMITTED';            // 개발 용이 (협의 간소)

export interface AirfieldInfo {
  id: string;
  name: string;             // 비행기지 명칭 (예: 원주 K-46, 강릉 K-18 등)
  unit: string;             // 관할 비행단/항공단 (예: 공군 제8전투비행단)
  center: [number, number]; // [lng, lat]
  elevation: number;        // 활주로 표고 (EL. m)
  radiusKm: number;         // 비행안전구역 영향 반경 (km)
  zoneType: string;         // 세부 구역 (예: 비행안전 제5구역(원추표면))
  maxSurfaceHeight: number; // 지표면 기준 최대 허용 높이 (m)
  maxSeaLevelHeight: number;// 해발고도 기준 EL. (m)
  recommendedFloors: string;// 권장 층수 (예: 지하 1층 ~ 지상 12층 이하 권장)
  shieldingNotes: string;   // 차폐선 적용 가능 여부 및 설명
}

export interface DefenseAnalysisResult {
  // 3단 분류 판정
  classification: DefenseZoneClassification;
  zoneName: string;         // 표출용 구역 명칭 (예: "제한보호구역 & 비행안전 제5구역")
  subZones: string[];       // 세부 저촉 구역 목록
  statute: string;          // 근거 법령 (예: 「군사기지 및 군사시설 보호법」 제4조 및 제9조, 제10조)
  jurisdiction: string;     // 관할 사단/군단/비행단 (예: 육군 제2군단 / 공군 제8전투비행단)
  
  // 인허가 가능성 평가
  feasibility: FeasibilityGrade;
  feasibilityText: string;  // 배지 라벨 (예: "조건부 개발 가능")
  feasibilityDescription: string;
  badgeVariant: 'rose' | 'amber' | 'emerald' | 'blue';

  // 3D 비행안전 고도제한 (Ceiling)
  hasFlightSafetyZone: boolean;
  airfield?: AirfieldInfo;
  distanceToAirfieldKm?: number;
  maxSurfaceHeight: number; // 지표면 기준 허용 고도 (m)
  maxSeaLevelHeight: number;// 해발 표고 기준 허용 고도 (EL. m)
  recommendedFloors: string;// 권장 층수
  shieldingContourApplicable: boolean; // 차폐선(Shielding Contour) 적용 가능성

  // 군 협의 소견서 초안
  officialOpinionDraft: string;

  // 정밀 분석 세부 항목
  keyCheckpoints: {
    label: string;
    value: string;
    status: 'pass' | 'warn' | 'block';
  }[];
}
