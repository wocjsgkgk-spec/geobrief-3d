export interface ViewportState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export type BaseMapType = 'satellite' | 'clean' | 'topo';

export interface LocationPreset {
  id: string;
  name: string;
  region: string;
  description: string;
  viewport: ViewportState;
}

export interface GangwonDistrict {
  id: string;
  name: string;
  fullName: string;
  type: '시' | '군';
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export interface Bookmark {
  id: string;
  name: string;
  createdAt: string;
  viewport: ViewportState;
}

export interface SearchResultItem {
  place_id: number | string;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
}

export interface BriefingMetadata {
  title: string;
  subtitle: string;
  department: string;
  author: string;
  date: string;
  securityLevel: '대외비' | '공개' | '군사대외비';
}

export interface PolygonArea {
  sqm: number;
  pyeong: number;
}

export type ViewMode = '2D' | '3D';

export type PolygonStyle = 'blue' | 'orange' | 'hatch' | 'emerald';

export type StampShape = 'square' | 'rectangle' | 'circle';

export type BuildingMassPresetId = 'defense_rd' | 'smart_logistics' | 'civil_military';

export interface BuildingMassPreset {
  id: BuildingMassPresetId;
  name: string;
  height: number;
  color: string;
  glowColor: string;
  edgeColor: string;
  description: string;
}

export const BUILDING_MASS_PRESETS: Record<BuildingMassPresetId, BuildingMassPreset> = {
  defense_rd: {
    id: 'defense_rd',
    name: '국방 R&D 센터',
    height: 22,
    color: '#0EA5E9',
    glowColor: '#38BDF8',
    edgeColor: '#7DD3FC',
    description: '가로 60m x 세로 35m x 높이 22m · 커튼월 창문 패턴 · 지붕 난간 · 옥상 헬리패드(H)',
  },
  smart_logistics: {
    id: 'smart_logistics',
    name: '군수 물류센터',
    height: 16,
    color: '#64748B',
    glowColor: '#94A3B8',
    edgeColor: '#E2E8F0',
    description: '가로 65m x 세로 38m x 높이 16m · 트러스 박공지붕 · 6베이 하역 독 · 옥상 태양광 그리드',
  },
  civil_military: {
    id: 'civil_military',
    name: '복합 커뮤니티',
    height: 14,
    color: '#059669',
    glowColor: '#34D399',
    edgeColor: '#A7F3D0',
    description: '가로 55m x 세로 32m x 높이 14m · 3단 계단식 테라스 주거/복지 · 중정 수변공원 & 수목',
  },
};

export * from './defense';
export * from './infrastructure';

// [V-World API 연결 상태 실시간 진단 타입]
export type VworldStatus = 'connected' | 'unconfigured' | 'error';

export interface VworldDiagnosticState {
  status: VworldStatus;
  message: string;
  lastChecked: number | null;
  featureCount: number;
  errorCode?: string | number;
  errorDetail?: string;
  maskedKey?: string;
}

