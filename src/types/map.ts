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

// [3D 가시권(Viewshed) 분석 결과]
export interface ViewshedResult {
  origin: [number, number];
  elevation: number;
  observerHeight: number;
  radiusMeters: number;
  visibleAreaSqm: number;
  hiddenAreaSqm: number;
  coverageRatio: number;
  visibleGeojson: GeoJSON.FeatureCollection;
  hiddenGeojson: GeoJSON.FeatureCollection;
  timestamp: number;
}

// [3D 실측 줄자 측정 결과]
export interface Measure3DResult {
  points: [number, number][];
  elevations: [number, number];
  horizontalDistanceMeters: number;
  surfaceDistanceMeters: number;
  directDistanceMeters: number;
  elevationDeltaMeters: number;
  slopePercent: number;
  slopeDegrees: number;
}

// [3D 공간 주석 핀 (Billboard Pin)]
export type SpatialPinCategory = 'access' | 'elevation' | 'demolish' | 'facility' | 'custom';

export interface SpatialPin {
  id: string;
  coords: [number, number]; // [lng, lat]
  elevation: number; // 지표면 표고 (EL. m)
  title: string;
  category: SpatialPinCategory;
  color?: string;
  stemHeightMeters?: number; // 지면에서 올라오는 기둥 높이 (m, 기본 15m)
}

// [3D 계획·접근 축선 화살표 (Tactical Arrow)]
export interface TacticalArrow {
  id: string;
  points: [number, number][]; // [start, end]
  label?: string;
  color?: string; // 기본: #06B6D4 (네온 시안) 또는 #F59E0B (네온 앰버)
  widthMeters?: number; // 시작 너비 (기본 8m)
  headWidthMeters?: number; // 화살촉 너비 (기본 16m)
}

// [강원 지형 특화 저류·침수 수위(Water Level) 시뮬레이션 상태]
export interface WaterLevelState {
  enabled: boolean;
  elevation: number; // EL. 50m ~ 300m
}

// [.geobrief 브리핑 프로젝트 파일 규격]
export interface GeoBriefProjectFile {
  version: '1.0';
  format: 'geobrief';
  exportedAt: string;
  metadata: BriefingMetadata;
  viewport: ViewportState;
  completedPolygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  polygonCenter: [number, number] | null;
  polygonArea: PolygonArea | null;
  selectedRegionId: string;
  selectedIdleSiteId: string | null;
  buildingMassPreset: BuildingMassPresetId;
  showBuildingMass3D: boolean;
  spatialPins: SpatialPin[];
  tacticalArrows: TacticalArrow[];
  waterLevel: WaterLevelState;
  sunHour: number;
}

