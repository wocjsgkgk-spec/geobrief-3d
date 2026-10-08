// 교통·인프라 접근성 정량 분석 타입 정의

export type InfrastructureCategory =
  | 'expressway_ic'   // 고속도로 IC
  | 'railway_ktx'     // 철도역 / KTX
  | 'national_road'   // 주 간선도로 / 국도
  | 'public_military';// 관할 지자체 청사 / 군부대 거점

export interface InfrastructurePoint {
  id: string;
  name: string;
  category: InfrastructureCategory;
  categoryKor: string;
  coords: [number, number]; // [lng, lat]
  routeOrUnit: string;      // e.g. "서울양양고속도로", "강릉선 KTX", "국도 46호선"
  description?: string;
}

export interface AccessibilityRowData {
  id: string;
  category: InfrastructureCategory;
  categoryLabel: string;   // "고속도로 IC", "철도역(KTX)", "주 간선국도", "행정·군 거점"
  facilityName: string;    // "남춘천 IC", "춘천역", "국도 46호선"
  coords: [number, number];
  distanceKm: number;      // 5.4
  travelMinutes: number;   // 6
  travelTimeText: string;  // "약 6분"
  customNote?: string;     // 사용자 인라인 수정 메모 (예: "직접 연결 예정")
}

export interface AccessibilityAnalysisResult {
  siteCenter: [number, number];
  rows: AccessibilityRowData[];
  calculatedAt: string;
}
