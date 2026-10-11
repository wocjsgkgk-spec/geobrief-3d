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

// [감시 초소/CCTV 3D 레이더 센서 콘 (Sensor FOV)]
export interface SurveillanceSensor {
  id: string;
  coords: [number, number]; // [lng, lat]
  elevation: number; // 지표면 표고 (EL. m)
  mastHeightMeters: number; // 초소/감시탑 기둥 높이 (기본 15m)
  rangeMeters: number; // 감시 유효 반경 (기본 300m)
  fovDegrees: 60 | 90 | 120; // 수평 화각
  pitchDeg: number; // 아래로 조준하는 틸트각 (기본 30도)
  yawDeg: number; // 감시 방위각 (기본 0도)
  name?: string;
}

// [정찰 드론(UAV) 3D 경로 비행 시뮬레이터 상태]
export interface UavFlightState {
  isActive: boolean;
  cameraMode: 'orbit' | 'fpv'; // 3인칭 궤도 뷰 vs 1인칭 관측 뷰 (HUD)
  speedKmh: number; // 비행 속도 (기본 40km/h)
  altitudeMeters: number; // 대지 비행 고도 (기본 80m AGL)
  currentLngLat?: [number, number];
  currentBearing?: number;
  currentElevation?: number;
}

// [3D 토공량(절토·성토 Cut & Fill) 산출 엔진 타입]
export interface CutFillCell {
  id: number;
  coords: [number, number]; // [lng, lat]
  elevation: number; // 원지반 해발고도 (EL. m)
  diff: number; // 지형고도 - 계획표고 (+: 절토(Cut), -: 성토(Fill))
  type: 'cut' | 'fill' | 'balanced'; // cut: diff > 0.5, fill: diff < -0.5, balanced: |diff| <= 0.5
  volumeM3: number; // |diff| * 셀면적
  color: string;
  borderColor: string;
}

export interface CutFillResult {
  gridSizeMeters: 5 | 10;
  cellAreaSqm: number;
  totalCellCount: number;
  sampledAreaSqm: number;
  minElevation: number;
  maxElevation: number;
  avgElevation: number;
  targetElevation: number;
  totalCutVolumeM3: number;
  totalFillVolumeM3: number;
  netVolumeM3: number; // cut - fill (+: 토사 잉여/반출, -: 토사 부족/반입)
  dumpTruck15tCutCount: number; // 15톤 덤프트럭(약 10m3) 기준 절토 반출 대수
  dumpTruck15tFillCount: number; // 성토 반입 대수
  dumpTruck15tNetCount: number; // 순 토공 환산 대수
  cutCellCount: number;
  fillCellCount: number;
  balancedCellCount: number;
  cutAreaPercent: number;
  fillAreaPercent: number;
  balancedAreaPercent: number;
  zeroBalanceElevation: number; // 절토와 성토가 균형을 이루는 최적 계획고
  geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
}

export interface CutFillState {
  enabled: boolean;
  gridSizeMeters: 5 | 10;
  targetElevation: number | null; // null이면 계산 시 avgElevation으로 초기화
  result: CutFillResult | null;
  isCalculating: boolean;
}

// [Deck.gl Tile3DLayer 기반 3D Tiles 스트리밍 상태]
export type Tile3DPresetId = 'custom' | 'sample_city' | 'sample_pointcloud';

export interface Tile3DStreamState {
  enabled: boolean;
  url: string;
  presetId: Tile3DPresetId;
  opacity: number; // 0.1 ~ 1.0
  maximumScreenSpaceError: number; // 8 (정밀) ~ 32 (고속)
  pointSize: number; // 1 ~ 5
  isLoading: boolean;
  statusText?: string;
  tilesLoadedCount?: number;
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
  sensors?: SurveillanceSensor[];
  uavFlight?: UavFlightState;
  cutFill?: {
    enabled: boolean;
    gridSizeMeters: 5 | 10;
    targetElevation: number | null;
  };
  tile3DStream?: {
    enabled: boolean;
    url: string;
    presetId: Tile3DPresetId;
    opacity: number;
    maximumScreenSpaceError: number;
    pointSize: number;
  };
}



