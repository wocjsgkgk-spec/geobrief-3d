export interface ViewportState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export type BaseMapType = 'satellite' | 'clean' | 'topo';

export type BuildingThemeType = 'photorealistic' | 'landuse' | 'height_spectrum';

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
  securityLevel: '대외비' | '공개' | '군사대외비' | '일반 (대외비 해제)';
  sheetNo?: string;
  scale?: string;
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

// [2단계 신규: 3D 인터랙티브 배치 시설물 카탈로그 프리셋]
export type FacilityPresetId =
  | 'defense_rd_tower' // 1) 복합 국방 R&D 타워 (유리 커튼월)
  | 'barracks_hq' // 2) 표준 병영 막사/행정동 (지붕 디테일)
  | 'logistics_depot' // 3) 군수 물류 데포 (트러스 지붕 구조)
  | 'watch_tower' // 4) 경계·관측 철골 타워 (높이 15m)
  | 'helipad_base'; // 5) 옥상/지상 표준 헬리패드(H) 베이스

export interface FacilityPresetMeta {
  id: FacilityPresetId;
  name: string;
  category: '국방연구' | '병영행정' | '군수보급' | '경계관측' | '작전항공';
  defaultHeight: number; // m
  defaultWidth: number; // m
  defaultDepth: number; // m
  color: string;
  badge: string;
  description: string;
  iconName: string;
}

export const FACILITY_PRESETS: Record<FacilityPresetId, FacilityPresetMeta> = {
  defense_rd_tower: {
    id: 'defense_rd_tower',
    name: '복합 국방 R&D 타워',
    category: '국방연구',
    defaultHeight: 32,
    defaultWidth: 26,
    defaultDepth: 20,
    color: '#0EA5E9',
    badge: 'R&D 타워',
    description: '8층 규모 첨단 국방 연구 타워 · 블루 미러 유리 커튼월 · 옥상 통신 안테나 & 루프',
    iconName: 'Building2',
  },
  barracks_hq: {
    id: 'barracks_hq',
    name: '표준 병영 막사/행정동',
    category: '병영행정',
    defaultHeight: 9.5,
    defaultWidth: 38,
    defaultDepth: 16,
    color: '#10B981',
    badge: '병영 막사',
    description: '대대급 표준 병영 행정동 · 2층 콘크리트 외벽 · 박공 경사 지붕 및 진입 캐노피',
    iconName: 'Home',
  },
  logistics_depot: {
    id: 'logistics_depot',
    name: '군수 물류 데포',
    category: '군수보급',
    defaultHeight: 13,
    defaultWidth: 48,
    defaultDepth: 28,
    color: '#F59E0B',
    badge: '물류 데포',
    description: '전략 군수 물자 비축 창고 · 트러스 철골 구조 · 4연속 화물 하역 도크 롤러셔터',
    iconName: 'Warehouse',
  },
  watch_tower: {
    id: 'watch_tower',
    name: '경계·관측 철골 타워',
    category: '경계관측',
    defaultHeight: 15,
    defaultWidth: 7,
    defaultDepth: 7,
    color: '#EC4899',
    badge: '철골 타워',
    description: '15m 4각 트러스 철골 감시탑 · 상부 360도 유리 관측소 캡슐 & 서치라이트',
    iconName: 'Radio',
  },
  helipad_base: {
    id: 'helipad_base',
    name: '표준 헬리패드(H) 베이스',
    category: '작전항공',
    defaultHeight: 1.2,
    defaultWidth: 22,
    defaultDepth: 22,
    color: '#8B5CF6',
    badge: '헬리패드',
    description: 'UH-60/수리온 대응 헬기 이착륙장 · 고휘도 H 마킹 · 야간 유도등 & 안전 펜스',
    iconName: 'Plane',
  },
};

// 배치된 3D 시설물 오브젝트 인터페이스
export interface PlacedFacility3D {
  id: string;
  presetId: FacilityPresetId;
  name: string;
  coords: [number, number]; // [lng, lat]
  elevation: number; // EL. m (지형 해발고도)
  rotationY: number; // Y축 방위각 회전 (도, 0~360)
  scale: number; // 크기 배율 (0.5 ~ 3.0)
  heightMeters: number; // 실측 높이 (m)
  customGltfUrl?: string;
  createdAt: number;
}

// 3D 변환 기즈모 조작 모드
export type TransformGizmoMode = 'translate' | 'rotate' | 'scale';

// [3D 디테일 LOD 모드: 일반(LOD1) / 실감(LOD2+)]
export type Detail3DMode = 'lod1' | 'lod2';

// [신규] 3D 건축물 상호 배타적 렌더러 모드 (Mutual Exclusion)
// - native: MapLibre 기본 3D 각기둥 + 음영
// - facade: Three.js 절차적 LOD2 한국형 실감 파사드/지붕
// - tiles3d: Deck.gl Tile3DLayer 브이월드 OGC 실사 3D 메쉬 스트리밍
export type RenderMode3D = 'native' | 'facade' | 'tiles3d';

// [신규] 좌측 분석 패널 3단 탭
export type SidebarTab = 'terrain_infra' | 'buildings_complex' | 'site_access';

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
  relativeRiseMeters?: number; // 기준 하천수위 대비 상승 (+1m ~ +30m)
  floodedBuildingCount?: number; // 실시간 침수 위험 건물 수
  totalBuildingCount?: number; // 검토 건물 총수
  floodRatio?: number; // 침수 비율 (%)
  floodRiskLevel?: '안전' | '주의' | '경보' | '심각';
  criticalCount?: number; // 3m 이상 심각 침수
  alertCount?: number; // 1~3m 경보 침수
  warningCount?: number; // 1m 미만 주의 침수
  primaryBasin?: string; // 대상 하천 유역명 (원주천, 섬강, 소양강 등)
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

export interface CutFillOptions {
  gridSizeMeters?: 5 | 10;
  targetElevation?: number | null;
}

export interface CutFillState {
  enabled: boolean;
  gridSizeMeters: 5 | 10;
  targetElevation: number | null; // null이면 계산 시 avgElevation으로 초기화
  result: CutFillResult | null;
  isCalculating: boolean;
}

// [Deck.gl Tile3DLayer 기반 3D Tiles 스트리밍 상태]
export type Tile3DPresetId =
  | 'vworld_3d_buildings'
  | 'google_3d'
  | 'cesium_osm'
  | 'sample_city'
  | 'sample_pointcloud'
  | 'custom';

export interface Tile3DStreamState {
  enabled: boolean;
  url: string;
  presetId: Tile3DPresetId;
  opacity: number; // 0.1 ~ 1.0
  maximumScreenSpaceError: number; // 8 (정밀) ~ 32 (고속, 기본 16)
  maximumMemoryUsage?: number; // 최대 메모리 한도 (MB, 기본: 256)
  pointSize: number; // 1 ~ 5
  isLoading: boolean;
  statusText?: string;
  tilesLoadedCount?: number;
  verticesLoadedCount?: number;
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
  placedFacilities?: PlacedFacility3D[];
  threatDome?: ThreatDomeState;
  securityWall?: SecurityWallState;
  losAnalysis?: {
    pointA: LosPoint | null;
    pointB: LosPoint | null;
    result: LosAnalysisResult | null;
  };
  cinematicFlight?: {
    waypoints: CinematicWaypoint[];
    durationSec: number;
    loop: boolean;
    showOsd: boolean;
  };
  detail3DMode?: Detail3DMode;
  renderMode3D?: RenderMode3D;
  activeSidebarTab?: SidebarTab;
}

// [3단계 신규: 반구형 3D 레이더/방공 센서 탐지 돔]
export interface ThreatDomeState {
  enabled: boolean;
  coords: [number, number]; // [lng, lat]
  elevation: number; // EL. m
  radiusMeters: number; // 500m ~ 10000m (기본 3000m)
  color: string; // 기본: #06B6D4 (네온 시안)
  name?: string;
}

// [3단계 신규: 3D 수직 경계 울타리 / 보안벽]
export interface SecurityWallState {
  enabled: boolean;
  heightMeters: number; // 5m ~ 15m (기본 6m)
  color: string; // 기본: #F59E0B (네온 앰버)
  pulseSpeed: number; // 0.1 ~ 1.0 (기본 0.3)
}

// [3단계 신규: 정밀 3D 가시선 (Line of Sight, LOS) 광선 분석]
export interface LosPoint {
  coords: [number, number]; // [lng, lat]
  elevation: number; // 지면 해발고도 EL. m
  heightOffset: number; // 관측자/목표물 높이 m (관측점: 2.5m, 목표점: 1.8m)
  name?: string; // 관측점/목표점 명칭
}

export interface LosAnalysisResult {
  pointA: LosPoint;
  pointB: LosPoint;
  isClear: boolean; // 관측 성공 여부
  distanceMeters: number; // 3D 직선 거리 m
  horizontalDistanceMeters: number; // 2D 수평 거리 m
  elevationDiffMeters: number; // 두 지점 고도차 m
  maxObstacleElevation?: number; // 최대 차폐 장애물 고도 EL. m
  maxPenetrationDepth?: number; // 최대 지형 차폐 돌출량 m
  samplingIntervalMeters?: number; // 샘플링 간격 m (기본 5m)
  blockedPoint?: {
    coords: [number, number];
    elevation: number; // 차단 능선 고도 EL. m
    rayElevation: number; // 해당 지점 광선 고도 EL. m
    distanceFromA: number; // A로부터의 거리 m
    t: number; // 진행률 (0 ~ 1)
    maxObstacleElevation?: number;
    maxPenetration?: number;
  };
  samplingCount: number;
  calculatedAt: number;
}

export interface LosAnalysisState {
  isActive: boolean; // 작도/분석 모드 활성화 여부
  step: 'idle' | 'pick_a' | 'pick_b' | 'analyzed';
  pointA: LosPoint | null;
  pointB: LosPoint | null;
  result: LosAnalysisResult | null;
}

// =========================================================================
// [4단계 신규: 웨이포인트 기반 3D 시네마틱 카메라 패스 및 녹화 엔진]
// =========================================================================

export interface CinematicWaypoint {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface CinematicFlightState {
  waypoints: CinematicWaypoint[];
  durationSec: number; // 기본: 30초 (15, 30, 60 등)
  isPlaying: boolean;
  isRecording: boolean;
  progress: number; // 0.0 ~ 1.0
  currentTimeSec: number;
  loop: boolean;
  showOsd: boolean;
  isBuilderOpen: boolean;
}




