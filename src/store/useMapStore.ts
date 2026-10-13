import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as turf from '@turf/turf';
import {
  BaseMapType,
  Bookmark,
  BriefingMetadata,
  PolygonArea,
  ViewportState,
  ViewMode,
  PolygonStyle,
  StampShape,
  DefenseAnalysisResult,
  AccessibilityAnalysisResult,
  AccessibilityRowData,
  BuildingMassPresetId,
  VworldDiagnosticState,
  ViewshedResult,
  Measure3DResult,
  SpatialPin,
  TacticalArrow,
  WaterLevelState,
  GeoBriefProjectFile,
  SurveillanceSensor,
  UavFlightState,
  CutFillResult,
  CutFillState,
  Tile3DStreamState,
  Tile3DPresetId,
  FacilityPresetId,
  FACILITY_PRESETS,
  PlacedFacility3D,
  TransformGizmoMode,
  ThreatDomeState,
  SecurityWallState,
  LosPoint,
  LosAnalysisResult,
  LosAnalysisState,
  CinematicWaypoint,
  CinematicFlightState,
  Detail3DMode,
  RenderMode3D,
  SidebarTab,
} from '@/types/map';
import { analyzeDefenseRegulations } from '@/utils/defenseAnalysis';
import { analyzeAccessibility } from '@/utils/infrastructureAnalysis';
import { GANGWON_REGIONS, RegionPreset } from '@/constants/gangwonRegions';
import { BORDER_DISTRICT_IDS } from '@/constants/borderSecurityZones';
import { MILITARY_IDLE_SITES, MilitaryIdleSite } from '@/constants/militaryIdleSites';
import { generateStrategicFacilities, STRATEGIC_SITES_3D } from '@/constants/strategicSites3D';
import { generateSpiralPreset, generateApproachPreset } from '@/utils/cinematicPathInterpolator';
import type { CloudProject } from '@/lib/supabase';

export const SAMPLE_3D_TILES_PRESETS: Record<
  Tile3DPresetId,
  { name: string; url: string; type: 'b3dm' | 'pnts' | 'custom'; description: string }
> = {
  vworld_3d_buildings: {
    name: '브이월드 실사 3D (OGC 타일셋)',
    url: '/api/vworld/3dtiles/tileset.json',
    type: 'b3dm',
    description: '국토교통부 브이월드 디지털 트윈 실사 항공사진 텍스처 3D 건물 메쉬 (OGC 3D Tiles 1.0)',
  },
  sample_city: {
    name: 'Cesium 도시 건축물 (b3dm)',
    url: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/tileset.json',
    type: 'b3dm',
    description: '오픈 3D 건물 모델 타일셋 (텍스처 및 정밀 메쉬 포함)',
  },
  sample_pointcloud: {
    name: '라이다 포인트 클라우드 (LiDAR pnts)',
    url: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/PointCloud/PointCloudRGB/tileset.json',
    type: 'pnts',
    description: '항공 라이다 RGB 3D 정밀 점군 데이터셋',
  },
  custom: {
    name: '사용자 지정 URL',
    url: '',
    type: 'custom',
    description: '직접 입력한 3D Tiles (tileset.json) 스트리밍 엔드포인트',
  },
};

export interface BufferRingsState {
  r500m: boolean;
  r1km: boolean;
  r2km: boolean;
}

export interface SlidePackProgress {
  isExporting: boolean;
  step: number;
  totalSteps: number;
  percent: number;
  statusText: string;
}

const DEFAULT_SLIDE_PACK_PROGRESS: SlidePackProgress = {
  isExporting: false,
  step: 0,
  totalSteps: 4,
  percent: 0,
  statusText: '',
};

const DEFAULT_VWORLD_DIAGNOSTIC: VworldDiagnosticState = {
  status: 'unconfigured',
  message: 'API 키 미등록 (오픈 무료 벡터 건물로 자동 대체 중)',
  lastChecked: null,
  featureCount: 0,
};

const DEFAULT_METADATA: BriefingMetadata = {
  title: '원주 1군지사 이전부지 공간분석도',
  subtitle: '원주시·강원 거점 지형고저 및 입지 인프라 브리핑',
  department: '강원특별자치도 기획조정실',
  author: '공간정책분석관',
  date: '2026. 10. 13',
  securityLevel: '일반 (대외비 해제)',
  sheetNo: 'GB-2026-002',
  scale: '1:5,000',
};

export interface FlyToSignal extends ViewportState {
  timestamp: number;
  duration?: number;
}

export function createStampPolygon(
  center: [number, number],
  areaSqm: number,
  shape: StampShape,
  rotation = 0
): GeoJSON.Feature<GeoJSON.Polygon> {
  let poly: GeoJSON.Feature<GeoJSON.Polygon>;
  if (shape === 'circle') {
    const rMeters = Math.sqrt(areaSqm / Math.PI);
    poly = turf.circle(center, rMeters / 1000, { steps: 64, units: 'kilometers' });
  } else if (shape === 'rectangle') {
    // 2:1 직사각형 (가로 = 2 * 세로, 면적 = 2 * h^2)
    const hMeters = Math.sqrt(areaSqm / 2);
    const wMeters = hMeters * 2;
    const halfWKm = wMeters / 2 / 1000;
    const halfHKm = hMeters / 2 / 1000;
    const pt = turf.point(center);
    const north = turf.destination(pt, halfHKm, 0, { units: 'kilometers' }).geometry.coordinates[1];
    const south = turf.destination(pt, halfHKm, 180, { units: 'kilometers' }).geometry.coordinates[1];
    const east = turf.destination(pt, halfWKm, 90, { units: 'kilometers' }).geometry.coordinates[0];
    const west = turf.destination(pt, halfWKm, 270, { units: 'kilometers' }).geometry.coordinates[0];
    poly = turf.polygon([
      [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ],
    ]);
  } else {
    // 정사각형
    const sideMeters = Math.sqrt(areaSqm);
    const halfSideKm = sideMeters / 2 / 1000;
    const pt = turf.point(center);
    const north = turf.destination(pt, halfSideKm, 0, { units: 'kilometers' }).geometry.coordinates[1];
    const south = turf.destination(pt, halfSideKm, 180, { units: 'kilometers' }).geometry.coordinates[1];
    const east = turf.destination(pt, halfSideKm, 90, { units: 'kilometers' }).geometry.coordinates[0];
    const west = turf.destination(pt, halfSideKm, 270, { units: 'kilometers' }).geometry.coordinates[0];
    poly = turf.polygon([
      [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ],
    ]);
  }

  if (rotation !== 0) {
    poly = turf.transformRotate(poly, rotation, { pivot: center });
  }

  return poly;
}

export const WONJU_DEFAULT_CENTER: [number, number] = [127.925, 37.342];
export const WONJU_DEFAULT_POLYGON = createStampPolygon(WONJU_DEFAULT_CENTER, 16529, 'rectangle');
export const WONJU_DEFAULT_AREA: PolygonArea = { sqm: 16529, pyeong: 5000 };

export const INITIAL_CINEMATIC_FLIGHT: CinematicFlightState = {
  waypoints: [],
  durationSec: 30,
  isPlaying: false,
  isRecording: false,
  progress: 0,
  currentTimeSec: 0,
  loop: false,
  showOsd: true,
  isBuilderOpen: false,
};

interface MapStoreState {
  // 뷰포트 상태
  viewport: ViewportState;
  setViewport: (viewport: Partial<ViewportState>) => void;

  // 동적 카메라 비행 신호
  flyToSignal: FlyToSignal | null;
  flyToLocation: (target: ViewportState, duration?: number) => void;

  // 지형 및 베이스맵
  terrainEnabled: boolean;
  terrainExaggeration: number;
  baseMap: BaseMapType;
  setTerrainEnabled: (enabled: boolean) => void;
  setTerrainExaggeration: (val: number) => void;
  setBaseMap: (type: BaseMapType) => void;

  // 2D 평면 / 3D 입체 뷰 모드
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;

  // 레이어 토글 상태
  layers: {
    buildings3D: boolean;
    roads: boolean;
    demContours: boolean;
    cadastral: boolean; // 브이월드 연속지적도(필지선)
    ssaoPostProcessing: boolean; // 디지털 트윈 SSAO & Bloom 후처리
    firstLogisticsSmartCity: boolean; // [2단계 신규: 1군지사 미래 개발 구상안(3D 입체)]
  };
  toggleLayer: (key: keyof MapStoreState['layers']) => void;

  // 반경 분석 버퍼 링 토글 (500m, 1km, 2km)
  bufferRings: BufferRingsState;
  toggleBufferRing: (ring: keyof BufferRingsState) => void;

  // 브리핑 메타데이터
  metadata: BriefingMetadata;
  updateMetadata: (data: Partial<BriefingMetadata>) => void;

  // [GANGWON_REGIONS 연동] 18개 시·군 선택
  selectedRegionId: string;
  selectRegion: (regionId: string) => void;

  // 군사분계선(MDL) / 민통선(CCL) / DMZ 보안 레이어 상태
  borderSecurityVisible: boolean;
  setBorderSecurityVisible: (val: boolean) => void;
  toggleBorderSecurity: () => void;
  isBorderDistrict: boolean;

  // [신규] 사용자 정의 관심 부지(북마크)
  bookmarks: Bookmark[];
  addBookmark: (name: string) => void;
  removeBookmark: (id: string) => void;
  flyToBookmark: (bookmark: Bookmark) => void;

  // 3D 자동 회전(Orbit 투어) 모드
  isOrbiting: boolean;
  toggleOrbiting: () => void;

  // 부지 드로잉 및 Turf.js 정량 면적 상태
  isDrawingMode: boolean;
  drawingPoints: [number, number][];
  completedPolygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  polygonCenter: [number, number] | null;
  polygonArea: PolygonArea | null;

  toggleDrawingMode: () => void;
  addDrawingPoint: (point: [number, number]) => void;
  completePolygonDrawing: () => void;
  resetPolygonDrawing: () => void;

  // 부지 폴리곤 렌더링 스타일
  polygonStyle: PolygonStyle;
  setPolygonStyle: (style: PolygonStyle) => void;

  // 목표 면적(평/㎡) 기반 정형 템플릿(스탬프) 생성기
  stampMode: boolean;
  stampAreaPyeong: number;
  stampShape: StampShape;
  setStampMode: (active: boolean) => void;
  setStampAreaPyeong: (pyeong: number) => void;
  setStampShape: (shape: StampShape) => void;
  applyStampAt: (centerLngLat: [number, number]) => void;

  // 폴리곤 회전/이동 및 직접 지정
  rotatePolygon: (deltaDegrees: number) => void;
  movePolygon: (deltaLng: number, deltaLat: number) => void;
  setPolygonDirectly: (feature: GeoJSON.Feature<GeoJSON.Polygon>) => void;
  setPolygonFromCoords: (coords: [number, number][]) => void;

  // 국방 규제 및 비행안전 심층 분석
  defenseAnalysisResult: DefenseAnalysisResult | null;
  showFlightCeiling3D: boolean;
  setShowFlightCeiling3D: (show: boolean) => void;
  toggleFlightCeiling3D: () => void;
  runDefenseAnalysis: () => void;

  // 교통·인프라 접근성 정량 분석
  accessibilityResult: AccessibilityAnalysisResult | null;
  showAccessibilityTable: boolean;
  hoveredInfrastructureRow: AccessibilityRowData | null;
  setShowAccessibilityTable: (show: boolean) => void;
  toggleAccessibilityTable: () => void;
  setHoveredInfrastructureRow: (row: AccessibilityRowData | null) => void;
  updateAccessibilityRow: (rowId: string, customNote: string) => void;
  // 3단 보고서 슬라이드 팩 및 PPTX 내보내기
  slidePackSignal: number | null;
  slidePackProgress: SlidePackProgress;
  triggerSlidePackExport: () => void;
  setSlidePackProgress: (progress: Partial<SlidePackProgress>) => void;
  resetSlidePackProgress: () => void;
  // 가상 3D 건축 매스(Massing) 구상안
  showBuildingMass3D: boolean;
  buildingMassPreset: BuildingMassPresetId;
  customGltfUrl: string | null;
  setShowBuildingMass3D: (show: boolean) => void;
  toggleBuildingMass3D: () => void;
  setBuildingMassPreset: (preset: BuildingMassPresetId) => void;
  setCustomGltfUrl: (url: string | null) => void;

  // V-World API 연결 상태 실시간 진단
  vworldDiagnostic: VworldDiagnosticState;
  setVworldDiagnostic: (data: Partial<VworldDiagnosticState>) => void;

  // 전략 군 유휴지 실증 프리셋 (8개소+)
  selectedIdleSiteId: string | null;
  selectIdleSite: (siteId: string) => void;

  // 토목·지형 단면 및 3단 경사도 분석 도구
  showSlopeAnalysis: boolean;
  toggleSlopeAnalysis: () => void;
  showTerrainProfile: boolean;
  setShowTerrainProfile: (val: boolean) => void;
  toggleTerrainProfile: () => void;

  // 대형 스크린 브리핑 전용 프레젠테이션(전체화면) 모드
  isPresentationMode: boolean;
  togglePresentationMode: () => void;
  setIsPresentationMode: (val: boolean) => void;

  // 모바일 반응형 제어 패널 서랍 토글
  isMobilePanelOpen: boolean;
  toggleMobilePanel: () => void;
  setIsMobilePanelOpen: (val: boolean) => void;

  // 실시간 일조/태양광 셰이딩 엔진 (09:00 ~ 18:00)
  sunHour: number;
  setSunHour: (hour: number) => void;

  // 군사·입지 핵심 분석 도구: 3D 가시권(Viewshed/사계) 간이 분석기
  isViewshedMode: boolean;
  viewshedResult: ViewshedResult | null;
  toggleViewshedMode: () => void;
  setViewshedResult: (result: ViewshedResult | null) => void;
  clearViewshed: () => void;

  // 정밀 3D 거리 및 고저차 측정 도구 (3D Ruler)
  isMeasureMode: boolean;
  measurePoints: [number, number][];
  measureResult: Measure3DResult | null;
  toggleMeasureMode: () => void;
  setMeasurePoints: (points: [number, number][]) => void;
  addMeasurePoint: (point: [number, number]) => void;
  setMeasureResult: (result: Measure3DResult | null) => void;
  clearMeasure: () => void;

  // [3D 공간 주석 핀 (Billboard Pin)]
  spatialPins: SpatialPin[];
  isPinMode: boolean;
  togglePinMode: () => void;
  addSpatialPin: (pin: Omit<SpatialPin, 'id'>) => void;
  updateSpatialPin: (id: string, updates: Partial<SpatialPin>) => void;
  removeSpatialPin: (id: string) => void;
  clearSpatialPins: () => void;

  // [3D 계획·접근 축선 전술 화살표 (Tactical Arrow)]
  tacticalArrows: TacticalArrow[];
  isArrowMode: boolean;
  arrowDraftPoints: [number, number][];
  toggleArrowMode: () => void;
  addArrowDraftPoint: (point: [number, number]) => void;
  completeArrow: (label?: string, color?: string) => void;
  removeTacticalArrow: (id: string) => void;
  clearTacticalArrows: () => void;

  // [강원 지형 특화 저류·침수 수위 시뮬레이터]
  waterLevel: WaterLevelState;
  setWaterLevel: (val: number | Partial<WaterLevelState>) => void;
  toggleWaterLevel: () => void;

  // [도정·국방 표준 도면 타이틀 블록]
  showTitleBlock: boolean;
  toggleTitleBlock: () => void;

  // [국방·보안 브리핑] 3D 감시 센서 콘 (Sensor FOV Frustum)
  surveillanceSensors: SurveillanceSensor[];
  isSensorPlacementMode: boolean;
  selectedSensorFov: 60 | 90 | 120;
  selectedSensorRange: number;
  toggleSensorPlacementMode: () => void;
  setSelectedSensorFov: (fov: 60 | 90 | 120) => void;
  setSelectedSensorRange: (range: number) => void;
  addSurveillanceSensor: (sensor: Omit<SurveillanceSensor, 'id'>) => void;
  updateSurveillanceSensor: (id: string, updates: Partial<SurveillanceSensor>) => void;
  removeSurveillanceSensor: (id: string) => void;
  clearSurveillanceSensors: () => void;

  // [국방·보안 브리핑] 정찰 드론(UAV) 3D 경로 비행 시뮬레이터
  uavFlight: UavFlightState;
  toggleUavFlight: () => void;
  setUavCameraMode: (mode: 'orbit' | 'fpv') => void;
  setUavFlightSpeed: (speedKmh: number) => void;
  setUavFlightAltitude: (altitudeMeters: number) => void;
  updateUavTelemetry: (lngLat: [number, number], bearing: number, elevation: number) => void;

  // [3D 토공량(절토·성토 Cut & Fill) 산출 엔진]
  cutFill: CutFillState;
  toggleCutFill: () => void;
  setCutFillEnabled: (enabled: boolean) => void;
  setCutFillGridSize: (gridSizeMeters: 5 | 10) => void;
  setCutFillTargetElevation: (targetElevation: number) => void;
  setCutFillResult: (result: CutFillResult | null) => void;
  setCutFillCalculating: (isCalculating: boolean) => void;
  resetCutFill: () => void;

  // [Deck.gl Tile3DLayer 기반 3D Tiles 스트리밍]
  tile3DStream: Tile3DStreamState;
  toggleTile3DStream: () => void;
  setTile3DStreamEnabled: (enabled: boolean) => void;
  setTile3DStreamUrl: (url: string) => void;
  setTile3DStreamPreset: (presetId: Tile3DPresetId) => void;
  setTile3DStreamOpacity: (opacity: number) => void;
  setTile3DStreamSse: (maximumScreenSpaceError: number) => void;
  setTile3DStreamPointSize: (pointSize: number) => void;
  setTile3DStreamStatus: (statusText?: string, isLoading?: boolean, tilesLoadedCount?: number) => void;

  // [2단계 신규: 3D 인터랙티브 배치 시설물 & TransformControls 관리]
  placedFacilities: PlacedFacility3D[];
  selectedFacilityId: string | null;
  transformGizmoMode: TransformGizmoMode;

  addPlacedFacility: (presetId: FacilityPresetId, coords?: [number, number], elevation?: number) => string;
  removePlacedFacility: (id: string) => void;
  clearAllPlacedFacilities: () => void;
  selectFacility: (id: string | null) => void;
  updateFacilityTransform: (
    id: string,
    updates: Partial<Pick<PlacedFacility3D, 'coords' | 'elevation' | 'rotationY' | 'scale' | 'heightMeters' | 'name'>>
  ) => void;
  setTransformGizmoMode: (mode: TransformGizmoMode) => void;

  // [3D 디테일 LOD 모드: 일반(LOD1) / 실감(LOD2+) 토글 스위치]
  detail3DMode: Detail3DMode;
  setDetail3DMode: (mode: Detail3DMode) => void;
  toggleDetail3DMode: () => void;

  // [신규] 3D 건축물 상호 배타적 렌더러 모드 (Mutual Exclusion)
  renderMode3D: RenderMode3D;
  setRenderMode3D: (mode: RenderMode3D) => void;

  // [신규] 좌측 분석 패널 3단 탭
  activeSidebarTab: SidebarTab;
  setActiveSidebarTab: (tab: SidebarTab) => void;

  // [신규] 3D 타일셋 커스텀 URL 직접 입력 및 테스트 모달 상태
  isCustom3DTilesModalOpen: boolean;
  setCustom3DTilesModalOpen: (open: boolean) => void;

  // [3단계 신규: 3D 전술 탐지 돔, 보안 펜스, 입체 가시선(LOS)]
  threatDome: ThreatDomeState;
  securityWall: SecurityWallState;
  losAnalysis: LosAnalysisState;

  setThreatDome: (updates: Partial<ThreatDomeState>) => void;
  toggleThreatDome: () => void;
  setSecurityWall: (updates: Partial<SecurityWallState>) => void;
  toggleSecurityWall: () => void;
  startLosAnalysis: () => void;
  setLosPointA: (point: LosPoint) => void;
  setLosPointB: (point: LosPoint) => void;
  setLosResult: (result: LosAnalysisResult | null) => void;
  resetLosAnalysis: () => void;

  // [4단계 신규: 웨이포인트 3D 시네마틱 카메라 패스 및 녹화 엔진]
  cinematicFlight: CinematicFlightState;
  setCinematicWaypoints: (waypoints: CinematicWaypoint[]) => void;
  addCinematicWaypoint: (wp: CinematicWaypoint) => void;
  removeCinematicWaypoint: (id: string) => void;
  updateCinematicWaypoint: (id: string, updates: Partial<CinematicWaypoint>) => void;
  setCinematicDuration: (durationSec: number) => void;
  setCinematicPlaying: (isPlaying: boolean) => void;
  setCinematicRecording: (isRecording: boolean) => void;
  setCinematicProgress: (progress: number, currentTimeSec: number) => void;
  toggleCinematicLoop: () => void;
  toggleCinematicOsd: () => void;
  setCinematicBuilderOpen: (isOpen: boolean) => void;
  loadCinematicPreset: (preset: 'spiral' | 'approach', center?: [number, number]) => void;
  resetCinematicFlight: () => void;

  // [.geobrief 브리핑 프로젝트 파일 입출력]
  exportProjectFile: () => string;
  importProjectFile: (fileContent: string) => boolean;

  // 프로젝트 전체 초기화 및 저장본 불러오기
  resetProject: () => void;
  loadSavedProject: (project: CloudProject) => void;
}

export const useMapStore = create<MapStoreState>()(
  persist(
    (set, get) => ({
      viewport: {
        longitude: 127.925,
        latitude: 37.342,
        zoom: 14.5,
        pitch: 55,
        bearing: 20,
      },
      setViewport: (newVp) =>
        set((state) => ({
          viewport: { ...state.viewport, ...newVp },
        })),

      flyToSignal: null,
      flyToLocation: (target, duration = 1800) => {
        set({
          viewport: { ...target },
          flyToSignal: { ...target, timestamp: Date.now(), duration },
        });
      },

      terrainEnabled: true,
      terrainExaggeration: 1.5,
      baseMap: 'satellite',
      setTerrainEnabled: (terrainEnabled) => set({ terrainEnabled }),
      setTerrainExaggeration: (terrainExaggeration) => set({ terrainExaggeration }),
      setBaseMap: (baseMap) => set({ baseMap }),

      viewMode: '3D',
      setViewMode: (mode) => {
        const vp = get().viewport;
        const targetPitch = mode === '2D' ? 0 : 55;
        const targetBearing = mode === '2D' ? 0 : 20;
        set({ viewMode: mode });
        get().flyToLocation({ ...vp, pitch: targetPitch, bearing: targetBearing }, 1000);
      },
      toggleViewMode: () => {
        const nextMode: ViewMode = get().viewMode === '2D' ? '3D' : '2D';
        get().setViewMode(nextMode);
      },

      layers: {
        buildings3D: true,
        roads: true,
        demContours: false,
        cadastral: false, // 브이월드 연속지적도(필지선)
        ssaoPostProcessing: false, // 디지털 트윈 SSAO & Bloom 후처리 (WebGL 검은 화면 방지를 위해 기본 바이패스)
        firstLogisticsSmartCity: false, // [2단계 신규: 1군지사 미래 개발 구상안(3D 입체)]
      },
      toggleLayer: (key) =>
        set((state) => ({
          layers: { ...state.layers, [key]: !state.layers[key] },
        })),

      bufferRings: {
        r500m: true,
        r1km: true,
        r2km: false,
      },
      toggleBufferRing: (ring) =>
        set((state) => ({
          bufferRings: {
            ...state.bufferRings,
            [ring]: !state.bufferRings[ring],
          },
        })),

      metadata: DEFAULT_METADATA,
      updateMetadata: (data) =>
        set((state) => ({
          metadata: { ...state.metadata, ...data },
        })),

      // GANGWON_REGIONS 연동 시·군 선택 (기본: 원주시)
      selectedRegionId: 'wonju',
      isBorderDistrict: false,
      borderSecurityVisible: false,
      setBorderSecurityVisible: (val: boolean) => set({ borderSecurityVisible: val }),
      toggleBorderSecurity: () => set((state) => ({ borderSecurityVisible: !state.borderSecurityVisible })),

      selectRegion: (regionId) => {
        const found = GANGWON_REGIONS.find((r) => r.id === regionId);
        if (found) {
          const isBorder = (BORDER_DISTRICT_IDS as readonly string[]).includes(regionId);

          // 접경 5개 군 선택 시: 정북(bearing: 0~10도, pitch: 55도) 전방 조망 카메라 세팅
          let pitch = found.pitch;
          let bearing = found.bearing;
          if (isBorder) {
            pitch = 55;
            bearing = found.bearing >= 0 && found.bearing <= 10 ? found.bearing : 5;
          }

          const targetVp: ViewportState = {
            longitude: found.center[0],
            latitude: found.center[1],
            zoom: found.zoom,
            pitch,
            bearing,
          };
          set({
            selectedRegionId: regionId,
            isBorderDistrict: isBorder,
            borderSecurityVisible: isBorder, // 접경지역 선택 시 즉시 visible, 비접경지는 none
            viewport: targetVp,
            flyToSignal: {
              ...targetVp,
              timestamp: Date.now(),
              duration: 1800, // 요구사항: duration 1800ms
            },
            metadata: {
              ...get().metadata,
              subtitle: `${found.name} (${found.subregion}) 일원 공간 분석 및 지형 브리핑`,
            },
          });
        }
      },

      // 북마크 (관심 부지)
      bookmarks: [
        {
          id: 'sample-1',
          name: '양구 해안분지(펀치볼) 전술거점',
          createdAt: '2026.10.07',
          viewport: {
            longitude: 127.9897,
            latitude: 38.1054,
            zoom: 12.6,
            pitch: 52,
            bearing: 15,
          },
        },
        {
          id: 'sample-2',
          name: '춘천 캠프페이지 반환부지',
          createdAt: '2026.10.07',
          viewport: {
            longitude: 127.7342,
            latitude: 37.8853,
            zoom: 12.8,
            pitch: 52,
            bearing: 15,
          },
        },
      ],
      addBookmark: (name) => {
        const vp = get().viewport;
        const newBm: Bookmark = {
          id: 'bm-' + Date.now(),
          name: name.trim() || `관심 부지 (${new Date().toLocaleDateString('ko-KR')})`,
          createdAt: new Date().toLocaleDateString('ko-KR'),
          viewport: { ...vp },
        };
        set({ bookmarks: [newBm, ...get().bookmarks] });
      },
      removeBookmark: (id) => {
        set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) });
      },
      flyToBookmark: (bookmark) => {
        const targetVp = { ...bookmark.viewport };
        set({
          viewport: targetVp,
          flyToSignal: { ...targetVp, timestamp: Date.now(), duration: 1800 },
          metadata: {
            ...get().metadata,
            subtitle: `${bookmark.name} 관측 시점 복원`,
          },
        });
      },

      isOrbiting: false,
      toggleOrbiting: () => set((state) => ({ isOrbiting: !state.isOrbiting })),

      isDrawingMode: false,
      drawingPoints: [],
      completedPolygon: WONJU_DEFAULT_POLYGON,
      polygonCenter: WONJU_DEFAULT_CENTER,
      polygonArea: WONJU_DEFAULT_AREA,
      defenseAnalysisResult: analyzeDefenseRegulations(WONJU_DEFAULT_POLYGON, WONJU_DEFAULT_CENTER),
      showFlightCeiling3D: false,
      showBuildingMass3D: true,
      buildingMassPreset: 'defense_rd',
      customGltfUrl: null,
      setShowFlightCeiling3D: (showFlightCeiling3D) => set({ showFlightCeiling3D }),
      toggleFlightCeiling3D: () =>
        set((state) => ({ showFlightCeiling3D: !state.showFlightCeiling3D })),
      runDefenseAnalysis: () => {
        const poly = get().completedPolygon;
        const center = get().polygonCenter;
        if (poly && center) {
          const result = analyzeDefenseRegulations(poly, center);
          set({ defenseAnalysisResult: result });
        }
      },

      // 교통·인프라 접근성 정량 분석
      accessibilityResult: analyzeAccessibility(WONJU_DEFAULT_CENTER),
      showAccessibilityTable: true,
      hoveredInfrastructureRow: null,
      setShowAccessibilityTable: (showAccessibilityTable) => set({ showAccessibilityTable }),
      toggleAccessibilityTable: () =>
        set((state) => ({ showAccessibilityTable: !state.showAccessibilityTable })),
      setHoveredInfrastructureRow: (row) => set({ hoveredInfrastructureRow: row }),
      updateAccessibilityRow: (rowId, customNote) => {
        const cur = get().accessibilityResult;
        if (!cur) return;
        const updatedRows = cur.rows.map((r) =>
          r.id === rowId ? { ...r, customNote } : r
        );
        set({
          accessibilityResult: {
            ...cur,
            rows: updatedRows,
          },
        });
      },
      runAccessibilityAnalysis: () => {
        const center = get().polygonCenter;
        if (center) {
          const res = analyzeAccessibility(center, get().accessibilityResult?.rows);
          set({ accessibilityResult: res });
        }
      },

      toggleDrawingMode: () => {
        const nextMode = !get().isDrawingMode;
        const vp = get().viewport;
        if (nextMode) {
          // [2D 수직 정사 뷰 전환] pitch 0, bearing 0으로 1초간 전환하여 오차 없이 정밀 편집
          set({
            isDrawingMode: true,
            viewMode: '2D',
            stampMode: false,
            drawingPoints: [],
            completedPolygon: null,
            polygonCenter: null,
            polygonArea: null,
            defenseAnalysisResult: null,
            accessibilityResult: null,
            hoveredInfrastructureRow: null,
          });
          get().flyToLocation({ ...vp, pitch: 0, bearing: 0 }, 1000);
        } else {
          // 드로잉 종료 시 3D 조감도 복귀
          set({
            isDrawingMode: false,
            viewMode: '3D',
          });
          get().flyToLocation({ ...vp, pitch: 55, bearing: 20 }, 1200);
        }
      },

      addDrawingPoint: (point) => {
        const current = get().drawingPoints;
        set({ drawingPoints: [...current, point] });
      },

      completePolygonDrawing: () => {
        const points = get().drawingPoints;
        if (points.length < 3) return;

        const closedRing = [...points];
        if (
          closedRing[0][0] !== closedRing[closedRing.length - 1][0] ||
          closedRing[0][1] !== closedRing[closedRing.length - 1][1]
        ) {
          closedRing.push(closedRing[0]);
        }

        try {
          const polygonFeature = turf.polygon([closedRing]);
          const sqm = Math.round(turf.area(polygonFeature));
          const pyeong = Math.round(sqm / 3.305785);
          const centerPt = turf.centroid(polygonFeature);
          const [centerLng, centerLat] = centerPt.geometry.coordinates;
          const vp = get().viewport;
          const defResult = analyzeDefenseRegulations(polygonFeature, [centerLng, centerLat]);
          const accessResult = analyzeAccessibility([centerLng, centerLat], get().accessibilityResult?.rows);

          set({
            isDrawingMode: false,
            viewMode: '3D',
            drawingPoints: [],
            completedPolygon: polygonFeature,
            polygonCenter: [centerLng, centerLat],
            polygonArea: { sqm, pyeong },
            defenseAnalysisResult: defResult,
            accessibilityResult: accessResult,
          });

          // [3D 조감도 자동 복귀] 드로잉 완료 후 pitch 55, bearing 20 복귀
          get().flyToLocation({ ...vp, pitch: 55, bearing: 20 }, 1200);
        } catch (e) {
          console.error('Failed to calculate polygon area:', e);
        }
      },

      resetPolygonDrawing: () => {
        const vp = get().viewport;
        set({
          isDrawingMode: false,
          stampMode: false,
          drawingPoints: [],
          completedPolygon: null,
          polygonCenter: null,
          polygonArea: null,
          defenseAnalysisResult: null,
          accessibilityResult: null,
          hoveredInfrastructureRow: null,
          viewMode: '3D',
        });
        get().flyToLocation({ ...vp, pitch: 55, bearing: 20 }, 1000);
      },

      // 부지 폴리곤 렌더링 스타일
      polygonStyle: 'blue',
      setPolygonStyle: (polygonStyle) => set({ polygonStyle }),

      // 목표 면적(평/㎡) 기반 정형 템플릿(스탬프) 생성기
      stampMode: false,
      stampAreaPyeong: 3000,
      stampShape: 'square',
      setStampMode: (stampMode) => {
        const vp = get().viewport;
        set({ stampMode, isDrawingMode: false });
        if (stampMode) {
          // 정밀 스탬프 배치를 위해 2D 수직 뷰로 전환
          set({ viewMode: '2D' });
          get().flyToLocation({ ...vp, pitch: 0, bearing: 0 }, 800);
        }
      },
      setStampAreaPyeong: (stampAreaPyeong) => set({ stampAreaPyeong }),
      setStampShape: (stampShape) => set({ stampShape }),

      applyStampAt: (centerLngLat: [number, number]) => {
        const pyeong = get().stampAreaPyeong;
        const sqm = Math.round(pyeong * 3.305785);
        const shape = get().stampShape;
        const poly = createStampPolygon(centerLngLat, sqm, shape);

        const centerPt = turf.centroid(poly);
        const [cLng, cLat] = centerPt.geometry.coordinates;
        const vp = get().viewport;
        const defResult = analyzeDefenseRegulations(poly, [cLng, cLat]);
        const accessResult = analyzeAccessibility([cLng, cLat], get().accessibilityResult?.rows);

        set({
          stampMode: false,
          isDrawingMode: false,
          completedPolygon: poly,
          polygonCenter: [cLng, cLat],
          polygonArea: { sqm, pyeong },
          defenseAnalysisResult: defResult,
          accessibilityResult: accessResult,
          viewMode: '3D',
        });

        // 3D 조감도로 비행 복귀
        get().flyToLocation({ ...vp, pitch: 55, bearing: 20 }, 1200);
      },

      // 폴리곤 회전
      rotatePolygon: (deltaDegrees: number) => {
        const poly = get().completedPolygon;
        const center = get().polygonCenter;
        if (!poly || !center) return;
        try {
          const rotated = turf.transformRotate(poly, deltaDegrees, { pivot: center });
          const defResult = analyzeDefenseRegulations(rotated, center);
          set({ completedPolygon: rotated, defenseAnalysisResult: defResult });
        } catch (e) {
          console.error('Failed to rotate polygon:', e);
        }
      },

      // 폴리곤 이동
      movePolygon: (deltaLng: number, deltaLat: number) => {
        const poly = get().completedPolygon;
        const center = get().polygonCenter;
        if (!poly || !center) return;
        try {
          const newCenter: [number, number] = [center[0] + deltaLng, center[1] + deltaLat];
          const coords = poly.geometry.coordinates[0].map(([lng, lat]) => [
            lng + deltaLng,
            lat + deltaLat,
          ]);
          const updated = turf.polygon([coords]);
          const defResult = analyzeDefenseRegulations(updated, newCenter);
          const accessResult = analyzeAccessibility(newCenter, get().accessibilityResult?.rows);
          set({
            completedPolygon: updated,
            polygonCenter: newCenter,
            defenseAnalysisResult: defResult,
            accessibilityResult: accessResult,
          });
        } catch (e) {
          console.error('Failed to move polygon:', e);
        }
      },

      // 폴리곤 직접 지정
      setPolygonDirectly: (feature: GeoJSON.Feature<GeoJSON.Polygon>) => {
        try {
          const sqm = Math.round(turf.area(feature));
          const pyeong = Math.round(sqm / 3.305785);
          const centerPt = turf.centroid(feature);
          const [cLng, cLat] = centerPt.geometry.coordinates;
          const vp = get().viewport;
          const defResult = analyzeDefenseRegulations(feature, [cLng, cLat]);
          const accessResult = analyzeAccessibility([cLng, cLat], get().accessibilityResult?.rows);

          set({
            isDrawingMode: false,
            stampMode: false,
            completedPolygon: feature,
            polygonCenter: [cLng, cLat],
            polygonArea: { sqm, pyeong },
            defenseAnalysisResult: defResult,
            accessibilityResult: accessResult,
            viewMode: '3D',
          });

          get().flyToLocation(
            {
              ...vp,
              longitude: cLng,
              latitude: cLat,
              zoom: Math.max(vp.zoom, 14.5),
              pitch: 55,
              bearing: 20,
            },
            1200
          );
        } catch (e) {
          console.error('Failed to set polygon directly:', e);
        }
      },

      // 좌표열 텍스트로부터 폴리곤 생성
      setPolygonFromCoords: (coords: [number, number][]) => {
        if (coords.length < 3) return;
        const closed = [...coords];
        if (
          closed[0][0] !== closed[closed.length - 1][0] ||
          closed[0][1] !== closed[closed.length - 1][1]
        ) {
          closed.push(closed[0]);
        }
        const poly = turf.polygon([closed]);
        get().setPolygonDirectly(poly);
      },

      // 3단 보고서 슬라이드 팩 및 PPTX 내보내기
      slidePackSignal: null,
      slidePackProgress: DEFAULT_SLIDE_PACK_PROGRESS,
      triggerSlidePackExport: () => set({ slidePackSignal: Date.now() }),
      setSlidePackProgress: (progress) =>
        set((state) => ({
          slidePackProgress: { ...state.slidePackProgress, ...progress },
        })),
      resetSlidePackProgress: () => set({ slidePackProgress: DEFAULT_SLIDE_PACK_PROGRESS }),
      // 가상 3D 건축 매스(Massing) 구상안 메서드
      setShowBuildingMass3D: (showBuildingMass3D) => set({ showBuildingMass3D }),
      toggleBuildingMass3D: () =>
        set((state) => ({ showBuildingMass3D: !state.showBuildingMass3D })),
      setBuildingMassPreset: (buildingMassPreset) => set({ buildingMassPreset }),
      setCustomGltfUrl: (customGltfUrl) => set({ customGltfUrl }),

      // V-World API 연결 상태 실시간 진단
      vworldDiagnostic: DEFAULT_VWORLD_DIAGNOSTIC,
      setVworldDiagnostic: (data) =>
        set((state) => ({
          vworldDiagnostic: { ...state.vworldDiagnostic, ...data },
        })),

      // 전략 군 유휴지 실증 프리셋 (8개소+)
      selectedIdleSiteId: 'camp-long-wonju',
      selectIdleSite: (siteId: string) => {
        const found = MILITARY_IDLE_SITES.find((s) => s.id === siteId);
        if (!found) return;

        const isBorder = (BORDER_DISTRICT_IDS as readonly string[]).includes(found.regionId);
        const center = found.center;
        const poly = found.polygon;
        const sqm = found.areaSqm;
        const pyeong = found.areaPyeong;
        const defResult = analyzeDefenseRegulations(poly, center);
        const accessResult = analyzeAccessibility(center, get().accessibilityResult?.rows);

        const strategicCfg = STRATEGIC_SITES_3D[siteId];
        const cam = strategicCfg?.recommendedCamera || found.recommendedCamera;
        const targetVp: ViewportState = {
          longitude: center[0],
          latitude: center[1],
          zoom: cam.zoom,
          pitch: cam.pitch,
          bearing: cam.bearing,
        };

        const strategicFacilities = generateStrategicFacilities(siteId, 100);

        set({
          selectedIdleSiteId: siteId,
          selectedRegionId: found.regionId,
          isBorderDistrict: isBorder,
          borderSecurityVisible: isBorder,
          isDrawingMode: false,
          stampMode: false,
          completedPolygon: poly,
          polygonCenter: center,
          polygonArea: { sqm, pyeong },
          defenseAnalysisResult: defResult,
          accessibilityResult: accessResult,
          viewMode: '3D',
          placedFacilities:
            strategicFacilities.length > 0 ? strategicFacilities : get().placedFacilities,
          selectedFacilityId:
            strategicFacilities.length > 0 ? strategicFacilities[0].id : null,
          metadata: {
            ...get().metadata,
            title: `${found.name} 공간 분석 보고서`,
            subtitle: `${found.district} | ${found.devVision}`,
          },
          viewport: targetVp,
          flyToSignal: {
            ...targetVp,
            timestamp: Date.now(),
            duration: 1800,
          },
        });
      },

      // 토목·지형 단면 및 3단 경사도 분석 도구
      showSlopeAnalysis: false,
      toggleSlopeAnalysis: () => set((state) => ({ showSlopeAnalysis: !state.showSlopeAnalysis })),
      showTerrainProfile: false,
      setShowTerrainProfile: (showTerrainProfile) => set({ showTerrainProfile }),
      toggleTerrainProfile: () => set((state) => ({ showTerrainProfile: !state.showTerrainProfile })),

      // 대형 스크린 브리핑 전용 프레젠테이션(전체화면) 모드
      isPresentationMode: false,
      togglePresentationMode: () => set((state) => ({ isPresentationMode: !state.isPresentationMode })),
      setIsPresentationMode: (isPresentationMode) => set({ isPresentationMode }),

      // 모바일 반응형 제어 패널 서랍 토글
      isMobilePanelOpen: false,
      toggleMobilePanel: () => set((state) => ({ isMobilePanelOpen: !state.isMobilePanelOpen })),
      setIsMobilePanelOpen: (isMobilePanelOpen) => set({ isMobilePanelOpen }),

      // 실시간 일조/태양광 셰이딩 (09:00 ~ 18:00)
      sunHour: 14,
      setSunHour: (sunHour) => set({ sunHour }),

      // 3D 가시권(Viewshed/사계) 간이 분석기
      isViewshedMode: false,
      viewshedResult: null,
      toggleViewshedMode: () =>
        set((state) => ({
          isViewshedMode: !state.isViewshedMode,
          isMeasureMode: false,
          isDrawingMode: false,
          stampMode: false,
        })),
      setViewshedResult: (viewshedResult) => set({ viewshedResult }),
      clearViewshed: () => set({ viewshedResult: null, isViewshedMode: false }),

      // 정밀 3D 거리 및 고저차 측정 도구 (3D Ruler)
      isMeasureMode: false,
      measurePoints: [],
      measureResult: null,
      toggleMeasureMode: () =>
        set((state) => ({
          isMeasureMode: !state.isMeasureMode,
          isViewshedMode: false,
          isDrawingMode: false,
          stampMode: false,
          measurePoints: [],
          measureResult: null,
        })),
      setMeasurePoints: (measurePoints) => set({ measurePoints }),
      addMeasurePoint: (point) => {
        const current = get().measurePoints;
        if (current.length >= 2) {
          set({ measurePoints: [point], measureResult: null });
        } else {
          set({ measurePoints: [...current, point] });
        }
      },
      setMeasureResult: (measureResult) => set({ measureResult }),
      clearMeasure: () => set({ measurePoints: [], measureResult: null, isMeasureMode: false }),

      // [3D 공간 주석 핀 (Billboard Pin)]
      spatialPins: [],
      isPinMode: false,
      togglePinMode: () =>
        set((state) => ({
          isPinMode: !state.isPinMode,
          isArrowMode: false,
          isDrawingMode: false,
          stampMode: false,
          isViewshedMode: false,
          isMeasureMode: false,
        })),
      addSpatialPin: (pin) => {
        const newPin: SpatialPin = {
          ...pin,
          id: 'pin-' + Date.now(),
        };
        set({ spatialPins: [...get().spatialPins, newPin] });
      },
      updateSpatialPin: (id, updates) => {
        set({
          spatialPins: get().spatialPins.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        });
      },
      removeSpatialPin: (id) => {
        set({ spatialPins: get().spatialPins.filter((p) => p.id !== id) });
      },
      clearSpatialPins: () => set({ spatialPins: [] }),

      // [3D 계획·접근 축선 전술 화살표 (Tactical Arrow)]
      tacticalArrows: [],
      isArrowMode: false,
      arrowDraftPoints: [],
      toggleArrowMode: () =>
        set((state) => ({
          isArrowMode: !state.isArrowMode,
          isPinMode: false,
          isDrawingMode: false,
          stampMode: false,
          isViewshedMode: false,
          isMeasureMode: false,
          arrowDraftPoints: [],
        })),
      addArrowDraftPoint: (point) => {
        const current = get().arrowDraftPoints;
        if (current.length === 0) {
          set({ arrowDraftPoints: [point] });
        } else {
          const start = current[0];
          const newArrow: TacticalArrow = {
            id: 'arrow-' + Date.now(),
            points: [start, point],
            label: '계획 접근축선',
            color: '#06B6D4',
            widthMeters: 8,
            headWidthMeters: 16,
          };
          set({
            tacticalArrows: [...get().tacticalArrows, newArrow],
            arrowDraftPoints: [],
          });
        }
      },
      completeArrow: (label = '계획 접근축선', color = '#06B6D4') => {
        const pts = get().arrowDraftPoints;
        if (pts.length >= 2) {
          const newArrow: TacticalArrow = {
            id: 'arrow-' + Date.now(),
            points: pts,
            label,
            color,
            widthMeters: 8,
            headWidthMeters: 16,
          };
          set({
            tacticalArrows: [...get().tacticalArrows, newArrow],
            arrowDraftPoints: [],
          });
        }
      },
      removeTacticalArrow: (id) => {
        set({ tacticalArrows: get().tacticalArrows.filter((a) => a.id !== id) });
      },
      clearTacticalArrows: () => set({ tacticalArrows: [], arrowDraftPoints: [] }),

      // [강원 지형 특화 저류·침수 수위 시뮬레이터]
      waterLevel: {
        enabled: false,
        elevation: 100,
      },
      setWaterLevel: (val) =>
        set((state) => ({
          waterLevel:
            typeof val === 'number'
              ? { ...state.waterLevel, elevation: val }
              : { ...state.waterLevel, ...val },
        })),
      toggleWaterLevel: () =>
        set((state) => ({
          waterLevel: { ...state.waterLevel, enabled: !state.waterLevel.enabled },
        })),

      // [도정·국방 표준 도면 타이틀 블록]
      showTitleBlock: true,
      toggleTitleBlock: () => set((state) => ({ showTitleBlock: !state.showTitleBlock })),

      // [국방·보안 브리핑] 3D 감시 센서 콘 (Sensor FOV Frustum)
      surveillanceSensors: [],
      isSensorPlacementMode: false,
      selectedSensorFov: 90,
      selectedSensorRange: 300,
      toggleSensorPlacementMode: () =>
        set((state) => ({ isSensorPlacementMode: !state.isSensorPlacementMode })),
      setSelectedSensorFov: (fov) => set({ selectedSensorFov: fov }),
      setSelectedSensorRange: (range) => set({ selectedSensorRange: range }),
      addSurveillanceSensor: (sensor) => {
        const id = `sensor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        set((state) => ({
          surveillanceSensors: [...state.surveillanceSensors, { ...sensor, id }],
          isSensorPlacementMode: false,
        }));
      },
      updateSurveillanceSensor: (id, updates) =>
        set((state) => ({
          surveillanceSensors: state.surveillanceSensors.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),
      removeSurveillanceSensor: (id) =>
        set((state) => ({
          surveillanceSensors: state.surveillanceSensors.filter((s) => s.id !== id),
        })),
      clearSurveillanceSensors: () => set({ surveillanceSensors: [] }),

      // [국방·보안 브리핑] 정찰 드론(UAV) 3D 경로 비행 시뮬레이터
      uavFlight: {
        isActive: false,
        cameraMode: 'orbit',
        speedKmh: 40,
        altitudeMeters: 80,
      },
      toggleUavFlight: () =>
        set((state) => ({
          uavFlight: {
            ...state.uavFlight,
            isActive: !state.uavFlight.isActive,
            cameraMode: state.uavFlight.isActive ? 'orbit' : state.uavFlight.cameraMode,
          },
        })),
      setUavCameraMode: (cameraMode) =>
        set((state) => ({
          uavFlight: { ...state.uavFlight, cameraMode },
        })),
      setUavFlightSpeed: (speedKmh) =>
        set((state) => ({
          uavFlight: { ...state.uavFlight, speedKmh },
        })),
      setUavFlightAltitude: (altitudeMeters) =>
        set((state) => ({
          uavFlight: { ...state.uavFlight, altitudeMeters },
        })),
      updateUavTelemetry: (currentLngLat, currentBearing, currentElevation) =>
        set((state) => ({
          uavFlight: {
            ...state.uavFlight,
            currentLngLat,
            currentBearing,
            currentElevation,
          },
        })),

      // [3D 토공량(절토·성토 Cut & Fill) 산출 엔진]
      cutFill: {
        enabled: false,
        gridSizeMeters: 10,
        targetElevation: null,
        result: null,
        isCalculating: false,
      },
      toggleCutFill: () =>
        set((state) => ({
          cutFill: {
            ...state.cutFill,
            enabled: !state.cutFill.enabled,
          },
        })),
      setCutFillEnabled: (enabled) =>
        set((state) => ({
          cutFill: {
            ...state.cutFill,
            enabled,
          },
        })),
      setCutFillGridSize: (gridSizeMeters) =>
        set((state) => ({
          cutFill: {
            ...state.cutFill,
            gridSizeMeters,
          },
        })),
      setCutFillTargetElevation: (targetElevation) =>
        set((state) => ({
          cutFill: {
            ...state.cutFill,
            targetElevation,
          },
        })),
      setCutFillResult: (result) =>
        set((state) => ({
          cutFill: {
            ...state.cutFill,
            result,
            isCalculating: false,
          },
        })),
      setCutFillCalculating: (isCalculating) =>
        set((state) => ({
          cutFill: {
            ...state.cutFill,
            isCalculating,
          },
        })),
      resetCutFill: () =>
        set((state) => ({
          cutFill: {
            enabled: false,
            gridSizeMeters: 10,
            targetElevation: null,
            result: null,
            isCalculating: false,
          },
        })),

      // [Deck.gl Tile3DLayer 기반 3D Tiles 스트리밍]
      tile3DStream: {
        enabled: false,
        url: SAMPLE_3D_TILES_PRESETS.vworld_3d_buildings.url,
        presetId: 'vworld_3d_buildings',
        opacity: 1.0,
        maximumScreenSpaceError: 16,
        maximumMemoryUsage: 256,
        pointSize: 2.0,
        isLoading: false,
        statusText: '대기 중 (브이월드 OGC 타일셋 준비 완료)',
        tilesLoadedCount: 0,
      },
      toggleTile3DStream: () =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            enabled: !state.tile3DStream.enabled,
          },
        })),
      setTile3DStreamEnabled: (enabled) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            enabled,
          },
        })),
      setTile3DStreamUrl: (url) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            url,
            presetId: 'custom',
          },
        })),
      setTile3DStreamPreset: (presetId) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            presetId,
            url: SAMPLE_3D_TILES_PRESETS[presetId].url || state.tile3DStream.url,
          },
        })),
      setTile3DStreamOpacity: (opacity) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            opacity,
          },
        })),
      setTile3DStreamSse: (maximumScreenSpaceError) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            maximumScreenSpaceError,
          },
        })),
      setTile3DStreamPointSize: (pointSize) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            pointSize,
          },
        })),
      setTile3DStreamStatus: (statusText, isLoading, tilesLoadedCount) =>
        set((state) => ({
          tile3DStream: {
            ...state.tile3DStream,
            ...(statusText !== undefined ? { statusText } : {}),
            ...(isLoading !== undefined ? { isLoading } : {}),
            ...(tilesLoadedCount !== undefined ? { tilesLoadedCount } : {}),
          },
        })),

      // [2단계 신규: 3D 인터랙티브 배치 시설물 & TransformControls 관리]
      placedFacilities: generateStrategicFacilities('camp-long-wonju', 100),
      selectedFacilityId: null,
      transformGizmoMode: 'translate',

      // [3D 디테일 LOD 모드: 일반(LOD1) / 실감(LOD2+) 토글 관리]
      detail3DMode: 'lod2',
      setDetail3DMode: (mode) => set({ detail3DMode: mode }),
      toggleDetail3DMode: () =>
        set((s) => {
          const next = s.detail3DMode === 'lod2' ? 'lod1' : 'lod2';
          return {
            detail3DMode: next,
            renderMode3D: next === 'lod2' ? 'facade' : 'native',
          };
        }),

      // [신규] 3D 건축물 상호 배타적 렌더러 모드 (Mutual Exclusion)
      renderMode3D: 'facade',
      setRenderMode3D: (mode) =>
        set((s) => {
          const isNative = mode === 'native';
          const isFacade = mode === 'facade';
          const isTiles3D = mode === 'tiles3d';

          return {
            renderMode3D: mode,
            detail3DMode: isNative ? 'lod1' : 'lod2',
            layers: {
              ...s.layers,
              buildings3D: isNative || isFacade,
            },
            tile3DStream: {
              ...s.tile3DStream,
              enabled: isTiles3D,
            },
          };
        }),

      // [신규] 좌측 분석 패널 3단 탭
      activeSidebarTab: 'terrain_infra',
      setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

      // [신규] 3D 타일셋 커스텀 URL 직접 입력 및 테스트 모달 상태
      isCustom3DTilesModalOpen: false,
      setCustom3DTilesModalOpen: (open) => set({ isCustom3DTilesModalOpen: open }),

      addPlacedFacility: (presetId, customCoords, customElevation) => {
        const state = get();
        const preset = FACILITY_PRESETS[presetId];
        const count = state.placedFacilities.filter((f) => f.presetId === presetId).length + 1;
        const name = `${preset.name} #${count}`;
        const coords: [number, number] =
          customCoords || state.polygonCenter || [state.viewport.longitude, state.viewport.latitude];
        const elevation = customElevation !== undefined ? customElevation : 100;
        const newFacility: PlacedFacility3D = {
          id: `facility-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          presetId,
          name,
          coords,
          elevation,
          rotationY: 0,
          scale: 1,
          heightMeters: preset.defaultHeight,
          createdAt: Date.now(),
        };

        set((s) => ({
          placedFacilities: [...s.placedFacilities, newFacility],
          selectedFacilityId: newFacility.id,
        }));
        return newFacility.id;
      },

      removePlacedFacility: (id) =>
        set((s) => ({
          placedFacilities: s.placedFacilities.filter((f) => f.id !== id),
          selectedFacilityId: s.selectedFacilityId === id ? null : s.selectedFacilityId,
        })),

      clearAllPlacedFacilities: () =>
        set({
          placedFacilities: [],
          selectedFacilityId: null,
        }),

      selectFacility: (id) =>
        set({
          selectedFacilityId: id,
        }),

      updateFacilityTransform: (id, updates) =>
        set((s) => ({
          placedFacilities: s.placedFacilities.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        })),

      setTransformGizmoMode: (mode) =>
        set({
          transformGizmoMode: mode,
        }),

      // [3단계 신규: 3D 전술 탐지 돔, 보안 펜스, 입체 가시선(LOS)]
      threatDome: {
        enabled: false,
        coords: WONJU_DEFAULT_CENTER,
        elevation: 100,
        radiusMeters: 3000,
        color: '#06B6D4',
        name: '국방 조기경보·방공 레이더 탐지 돔',
      },
      securityWall: {
        enabled: false,
        heightMeters: 6,
        color: '#F59E0B',
        pulseSpeed: 0.3,
      },
      losAnalysis: {
        isActive: false,
        step: 'idle',
        pointA: null,
        pointB: null,
        result: null,
      },

      setThreatDome: (updates) =>
        set((s) => ({
          threatDome: { ...s.threatDome, ...updates },
        })),

      toggleThreatDome: () =>
        set((s) => ({
          threatDome: { ...s.threatDome, enabled: !s.threatDome.enabled },
        })),

      setSecurityWall: (updates) =>
        set((s) => ({
          securityWall: { ...s.securityWall, ...updates },
        })),

      toggleSecurityWall: () =>
        set((s) => ({
          securityWall: { ...s.securityWall, enabled: !s.securityWall.enabled },
        })),

      startLosAnalysis: () =>
        set({
          losAnalysis: {
            isActive: true,
            step: 'pick_a',
            pointA: null,
            pointB: null,
            result: null,
          },
        }),

      setLosPointA: (point) =>
        set((s) => ({
          losAnalysis: {
            ...s.losAnalysis,
            step: 'pick_b',
            pointA: point,
          },
        })),

      setLosPointB: (point) =>
        set((s) => ({
          losAnalysis: {
            ...s.losAnalysis,
            step: 'analyzed',
            pointB: point,
          },
        })),

      setLosResult: (result) =>
        set((s) => ({
          losAnalysis: {
            ...s.losAnalysis,
            result,
          },
        })),

      resetLosAnalysis: () =>
        set({
          losAnalysis: {
            isActive: false,
            step: 'idle',
            pointA: null,
            pointB: null,
            result: null,
          },
        }),

      // [4단계 신규: 웨이포인트 3D 시네마틱 카메라 패스 및 녹화 엔진]
      cinematicFlight: INITIAL_CINEMATIC_FLIGHT,

      setCinematicWaypoints: (waypoints) =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, waypoints },
        })),

      addCinematicWaypoint: (wp) =>
        set((s) => ({
          cinematicFlight: {
            ...s.cinematicFlight,
            waypoints: [...s.cinematicFlight.waypoints, wp],
          },
        })),

      removeCinematicWaypoint: (id) =>
        set((s) => ({
          cinematicFlight: {
            ...s.cinematicFlight,
            waypoints: s.cinematicFlight.waypoints.filter((w) => w.id !== id),
          },
        })),

      updateCinematicWaypoint: (id, updates) =>
        set((s) => ({
          cinematicFlight: {
            ...s.cinematicFlight,
            waypoints: s.cinematicFlight.waypoints.map((w) =>
              w.id === id ? { ...w, ...updates } : w
            ),
          },
        })),

      setCinematicDuration: (durationSec) =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, durationSec },
        })),

      setCinematicPlaying: (isPlaying) =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, isPlaying },
        })),

      setCinematicRecording: (isRecording) =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, isRecording },
        })),

      setCinematicProgress: (progress, currentTimeSec) =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, progress, currentTimeSec },
        })),

      toggleCinematicLoop: () =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, loop: !s.cinematicFlight.loop },
        })),

      toggleCinematicOsd: () =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, showOsd: !s.cinematicFlight.showOsd },
        })),

      setCinematicBuilderOpen: (isBuilderOpen) =>
        set((s) => ({
          cinematicFlight: { ...s.cinematicFlight, isBuilderOpen },
        })),

      loadCinematicPreset: (preset, customCenter) => {
        const center =
          customCenter ||
          get().polygonCenter ||
          [get().viewport.longitude, get().viewport.latitude];
        const waypoints =
          preset === 'spiral'
            ? generateSpiralPreset(center)
            : generateApproachPreset(center);
        set((s) => ({
          cinematicFlight: {
            ...s.cinematicFlight,
            waypoints,
            progress: 0,
            currentTimeSec: 0,
            isPlaying: false,
          },
        }));
      },

      resetCinematicFlight: () =>
        set({ cinematicFlight: INITIAL_CINEMATIC_FLIGHT }),

      // [.geobrief 브리핑 프로젝트 파일 입출력]
      exportProjectFile: () => {
        const state = get();
        const projectData: GeoBriefProjectFile = {
          version: '1.0',
          format: 'geobrief',
          exportedAt: new Date().toISOString(),
          metadata: state.metadata,
          viewport: state.viewport,
          completedPolygon: state.completedPolygon,
          polygonCenter: state.polygonCenter,
          polygonArea: state.polygonArea,
          selectedRegionId: state.selectedRegionId,
          selectedIdleSiteId: state.selectedIdleSiteId,
          buildingMassPreset: state.buildingMassPreset,
          showBuildingMass3D: state.showBuildingMass3D,
          spatialPins: state.spatialPins,
          tacticalArrows: state.tacticalArrows,
          waterLevel: state.waterLevel,
          sunHour: state.sunHour,
          sensors: state.surveillanceSensors,
          uavFlight: state.uavFlight,
          cutFill: {
            enabled: state.cutFill.enabled,
            gridSizeMeters: state.cutFill.gridSizeMeters,
            targetElevation: state.cutFill.targetElevation,
          },
          tile3DStream: {
            enabled: state.tile3DStream.enabled,
            url: state.tile3DStream.url,
            presetId: state.tile3DStream.presetId,
            opacity: state.tile3DStream.opacity,
            maximumScreenSpaceError: state.tile3DStream.maximumScreenSpaceError,
            pointSize: state.tile3DStream.pointSize,
          },
          placedFacilities: state.placedFacilities,
          threatDome: state.threatDome,
          securityWall: state.securityWall,
          losAnalysis: {
            pointA: state.losAnalysis.pointA,
            pointB: state.losAnalysis.pointB,
            result: state.losAnalysis.result,
          },
          cinematicFlight: {
            waypoints: state.cinematicFlight.waypoints,
            durationSec: state.cinematicFlight.durationSec,
            loop: state.cinematicFlight.loop,
            showOsd: state.cinematicFlight.showOsd,
          },
          detail3DMode: state.detail3DMode,
          renderMode3D: state.renderMode3D,
          activeSidebarTab: state.activeSidebarTab,
        };
        const jsonStr = JSON.stringify(projectData, null, 2);
        try {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const safeTitle = (state.metadata.title || 'GeoBrief_3D_Project').replace(
            /[\\/:*?"<>|]/g,
            '_'
          );
          a.href = url;
          a.download = `${safeTitle}.geobrief`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error('[Store] Failed to export .geobrief project:', e);
        }
        return jsonStr;
      },

      importProjectFile: (fileContent: string) => {
        try {
          const data = JSON.parse(fileContent) as GeoBriefProjectFile;
          if (data.format !== 'geobrief' && !data.completedPolygon && !data.viewport) {
            throw new Error('유효한 .geobrief 프로젝트 파일이 아닙니다.');
          }
          const targetVp = data.viewport || get().viewport;
          set({
            metadata: data.metadata || get().metadata,
            completedPolygon: data.completedPolygon || null,
            polygonCenter: data.polygonCenter || null,
            polygonArea: data.polygonArea || null,
            selectedRegionId: data.selectedRegionId || get().selectedRegionId,
            selectedIdleSiteId: data.selectedIdleSiteId || null,
            buildingMassPreset: data.buildingMassPreset || get().buildingMassPreset,
            showBuildingMass3D: data.showBuildingMass3D ?? get().showBuildingMass3D,
            spatialPins: data.spatialPins || [],
            tacticalArrows: data.tacticalArrows || [],
            waterLevel: data.waterLevel || { enabled: false, elevation: 100 },
            sunHour: data.sunHour ?? 14,
            detail3DMode: data.detail3DMode || get().detail3DMode,
            renderMode3D: data.renderMode3D || get().renderMode3D,
            activeSidebarTab: data.activeSidebarTab || get().activeSidebarTab,
            surveillanceSensors: data.sensors || [],
            uavFlight: data.uavFlight || {
              isActive: false,
              cameraMode: 'orbit',
              speedKmh: 40,
              altitudeMeters: 80,
            },
            cutFill: data.cutFill
              ? {
                  enabled: data.cutFill.enabled,
                  gridSizeMeters: data.cutFill.gridSizeMeters,
                  targetElevation: data.cutFill.targetElevation,
                  result: null,
                  isCalculating: false,
                }
              : get().cutFill,
            tile3DStream: data.tile3DStream
              ? {
                  enabled: data.tile3DStream.enabled,
                  url: data.tile3DStream.url,
                  presetId: data.tile3DStream.presetId,
                  opacity: data.tile3DStream.opacity,
                  maximumScreenSpaceError: data.tile3DStream.maximumScreenSpaceError,
                  pointSize: data.tile3DStream.pointSize,
                  isLoading: false,
                  statusText: '대기 중',
                  tilesLoadedCount: 0,
                }
              : get().tile3DStream,
            viewport: targetVp,
            placedFacilities: data.placedFacilities || [],
            selectedFacilityId: null,
            threatDome: data.threatDome || get().threatDome,
            securityWall: data.securityWall || get().securityWall,
            losAnalysis: data.losAnalysis
              ? {
                  isActive: false,
                  step: data.losAnalysis.result ? 'analyzed' : 'idle',
                  pointA: data.losAnalysis.pointA,
                  pointB: data.losAnalysis.pointB,
                  result: data.losAnalysis.result,
                }
              : get().losAnalysis,
            cinematicFlight: data.cinematicFlight
              ? {
                  ...INITIAL_CINEMATIC_FLIGHT,
                  waypoints: data.cinematicFlight.waypoints || [],
                  durationSec: data.cinematicFlight.durationSec || 30,
                  loop: !!data.cinematicFlight.loop,
                  showOsd: data.cinematicFlight.showOsd ?? true,
                }
              : get().cinematicFlight,
            defenseAnalysisResult:
              data.completedPolygon && data.polygonCenter
                ? analyzeDefenseRegulations(data.completedPolygon, data.polygonCenter)
                : null,
            accessibilityResult: data.polygonCenter
              ? analyzeAccessibility(data.polygonCenter)
              : null,
          });
          get().flyToLocation(targetVp, 1500);
          return true;
        } catch (err) {
          console.error('[Store] Failed to import .geobrief project:', err);
          return false;
        }
      },

      resetProject: () => {
        const defaultRegion = GANGWON_REGIONS.find((r) => r.id === 'wonju') || GANGWON_REGIONS[0];
        set({
          isDrawingMode: false,
          drawingPoints: [],
          completedPolygon: WONJU_DEFAULT_POLYGON,
          polygonCenter: WONJU_DEFAULT_CENTER,
          polygonArea: WONJU_DEFAULT_AREA,
          defenseAnalysisResult: analyzeDefenseRegulations(WONJU_DEFAULT_POLYGON, WONJU_DEFAULT_CENTER),
          showFlightCeiling3D: false,
          showBuildingMass3D: true,
          buildingMassPreset: 'defense_rd',
          customGltfUrl: null,
          accessibilityResult: analyzeAccessibility(WONJU_DEFAULT_CENTER),
          hoveredInfrastructureRow: null,
          showAccessibilityTable: true,
          slidePackSignal: null,
          slidePackProgress: DEFAULT_SLIDE_PACK_PROGRESS,
          metadata: DEFAULT_METADATA,
          viewMode: '3D',
          polygonStyle: 'blue',
          stampMode: false,
          stampAreaPyeong: 5000,
          stampShape: 'square',
          bufferRings: {
            r500m: true,
            r1km: true,
            r2km: false,
          },
          baseMap: 'satellite',
          terrainEnabled: true,
          terrainExaggeration: 1.5,
          selectedRegionId: defaultRegion.id,
          selectedIdleSiteId: 'camp-long-wonju',
          showSlopeAnalysis: false,
          showTerrainProfile: false,
          isPresentationMode: false,
          isBorderDistrict: false,
          borderSecurityVisible: false,
          sunHour: 14,
          isViewshedMode: false,
          viewshedResult: null,
          isMeasureMode: false,
          measurePoints: [],
          measureResult: null,
          spatialPins: [],
          isPinMode: false,
          tacticalArrows: [],
          isArrowMode: false,
          arrowDraftPoints: [],
          waterLevel: { enabled: false, elevation: 100 },
          showTitleBlock: true,
          surveillanceSensors: [],
          isSensorPlacementMode: false,
          uavFlight: {
            isActive: false,
            cameraMode: 'orbit',
            speedKmh: 40,
            altitudeMeters: 80,
          },
          cutFill: {
            enabled: false,
            gridSizeMeters: 10,
            targetElevation: null,
            result: null,
            isCalculating: false,
          },
          tile3DStream: {
            enabled: false,
            url: SAMPLE_3D_TILES_PRESETS.sample_city.url,
            presetId: 'sample_city',
            opacity: 1.0,
            maximumScreenSpaceError: 16,
            pointSize: 2.0,
            isLoading: false,
            statusText: '대기 중',
            tilesLoadedCount: 0,
          },
          placedFacilities: [],
          selectedFacilityId: null,
          threatDome: {
            enabled: false,
            coords: WONJU_DEFAULT_CENTER,
            elevation: 100,
            radiusMeters: 3000,
            color: '#06B6D4',
            name: '국방 조기경보·방공 레이더 탐지 돔',
          },
          securityWall: {
            enabled: false,
            heightMeters: 6,
            color: '#F59E0B',
            pulseSpeed: 0.3,
          },
          losAnalysis: {
            isActive: false,
            step: 'idle',
            pointA: null,
            pointB: null,
            result: null,
          },
          cinematicFlight: INITIAL_CINEMATIC_FLIGHT,
          viewport: {
            longitude: defaultRegion.center[0],
            latitude: defaultRegion.center[1],
            zoom: defaultRegion.zoom,
            pitch: 55,
            bearing: 20,
          },
          flyToSignal: {
            longitude: defaultRegion.center[0],
            latitude: defaultRegion.center[1],
            zoom: defaultRegion.zoom,
            pitch: 55,
            bearing: 20,
            timestamp: Date.now(),
            duration: 1800,
          },
        });
      },

      loadSavedProject: (proj) => {
        const meta = proj.report_meta || {};
        const siteGeojson = proj.site_geojson;
        const regionId = proj.region || meta.selectedRegionId || 'wonju';

        let completedPoly = siteGeojson || get().completedPolygon;
        let polyCenter = meta.polygonCenter || get().polygonCenter;
        let polyArea = meta.polygonArea || get().polygonArea;

        // 폴리곤 중심/면적 보정
        if (completedPoly && completedPoly.geometry && (!polyCenter || !polyArea)) {
          try {
            const centroid = turf.centroid(completedPoly);
            polyCenter = [centroid.geometry.coordinates[0], centroid.geometry.coordinates[1]];
            const areaM2 = turf.area(completedPoly);
            polyArea = {
              sqm: Math.round(areaM2),
              pyeong: Math.round(areaM2 / 3.305785),
            };
          } catch (e) {
            console.warn('[Store] Recalculating polygon failed:', e);
          }
        }

        const defenseRes =
          polyCenter && completedPoly
            ? analyzeDefenseRegulations(completedPoly, polyCenter)
            : get().defenseAnalysisResult;
        const accessRes = polyCenter
          ? analyzeAccessibility(polyCenter)
          : get().accessibilityResult;

        set({
          metadata: {
            ...get().metadata,
            ...(meta.metadata || {}),
            title: proj.title || meta.metadata?.title || get().metadata.title,
          },
          completedPolygon: completedPoly,
          polygonCenter: polyCenter,
          polygonArea: polyArea,
          selectedRegionId: regionId,
          selectedIdleSiteId: meta.selectedIdleSiteId || null,
          bookmarks: meta.bookmarks || get().bookmarks,
          defenseAnalysisResult: defenseRes,
          accessibilityResult: accessRes,
          buildingMassPreset: meta.buildingMassPreset || get().buildingMassPreset,
          showBuildingMass3D: meta.showBuildingMass3D ?? get().showBuildingMass3D,
          showFlightCeiling3D: meta.showFlightCeiling3D ?? get().showFlightCeiling3D,
          viewport: meta.viewport || (polyCenter ? {
            longitude: polyCenter[0],
            latitude: polyCenter[1],
            zoom: 14.5,
            pitch: 55,
            bearing: 20,
          } : get().viewport),
          flyToSignal: polyCenter ? {
            longitude: polyCenter[0],
            latitude: polyCenter[1],
            zoom: 14.8,
            pitch: 55,
            bearing: 20,
            timestamp: Date.now(),
            duration: 1500,
          } : null,
        });
      },
    }),
    {
      name: 'geobrief-3d-storage',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          try {
            return window.localStorage;
          } catch {
            return sessionStorage;
          }
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      onRehydrateStorage: () => (state) => {
        try {
          if (state && state.completedPolygon && state.polygonCenter) {
            state.defenseAnalysisResult = analyzeDefenseRegulations(
              state.completedPolygon,
              state.polygonCenter
            );
            state.accessibilityResult = analyzeAccessibility(state.polygonCenter);
          }
        } catch (rehydrateErr) {
          console.warn('[useMapStore] onRehydrateStorage safe bypass:', rehydrateErr);
        }
      },
      partialize: (state) => ({
        metadata: state.metadata,
        completedPolygon: state.completedPolygon,
        polygonCenter: state.polygonCenter,
        polygonArea: state.polygonArea,
        polygonStyle: state.polygonStyle,
        showFlightCeiling3D: state.showFlightCeiling3D,
        showBuildingMass3D: state.showBuildingMass3D,
        buildingMassPreset: state.buildingMassPreset,
        showAccessibilityTable: state.showAccessibilityTable,
        bufferRings: state.bufferRings,
        baseMap: state.baseMap,
        terrainEnabled: state.terrainEnabled,
        terrainExaggeration: state.terrainExaggeration,
        selectedRegionId: state.selectedRegionId,
        selectedIdleSiteId: state.selectedIdleSiteId,
        isBorderDistrict: state.isBorderDistrict,
        borderSecurityVisible: state.borderSecurityVisible,
        bookmarks: state.bookmarks,
        viewport: state.viewport,
        sunHour: state.sunHour,
        spatialPins: state.spatialPins,
        tacticalArrows: state.tacticalArrows,
        waterLevel: state.waterLevel,
        showTitleBlock: state.showTitleBlock,
        surveillanceSensors: state.surveillanceSensors,
        cutFill: {
          enabled: state.cutFill.enabled,
          gridSizeMeters: state.cutFill.gridSizeMeters,
          targetElevation: state.cutFill.targetElevation,
        },
        tile3DStream: {
          enabled: state.tile3DStream.enabled,
          url: state.tile3DStream.url,
          presetId: state.tile3DStream.presetId,
          opacity: state.tile3DStream.opacity,
          maximumScreenSpaceError: state.tile3DStream.maximumScreenSpaceError,
          pointSize: state.tile3DStream.pointSize,
        },
        cinematicFlight: {
          waypoints: state.cinematicFlight.waypoints,
          durationSec: state.cinematicFlight.durationSec,
          loop: state.cinematicFlight.loop,
          showOsd: state.cinematicFlight.showOsd,
        },
      }),
    }
  )
);
