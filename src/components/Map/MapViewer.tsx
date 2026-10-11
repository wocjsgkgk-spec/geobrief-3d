'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { useMapStore } from '@/store/useMapStore';
import { SAMPLE_BUILDINGS } from '@/data/sampleBuildings';
import { BORDER_SECURITY_GEOJSON } from '@/constants/borderSecurityZones';
import { Compass } from './Compass';
import { ScaleBar } from './ScaleBar';
import { BriefingHeader } from './BriefingHeader';
import { LegendBox } from './LegendBox';
import { AccessibilityTableOverlay } from './AccessibilityTableOverlay';
import { ExportProgressModal } from '../Modal/ExportProgressModal';
import { generateSlidePackPptx } from '@/utils/pptxExportEngine';
import { GANGWON_REGIONS } from '@/constants/gangwonRegions';
import { BUILDING_MASS_PRESETS } from '@/types/map';
import { isVworldConfigured, fetchVworldBuildings } from '@/services/vworldService';
import { generateDetailedBuildingMass } from '@/utils/buildingMassGenerator';
import { ThreeDModelLayer } from './ThreeDModelLayer';
import { ThreeboxBuildingLayer } from './ThreeboxBuildingLayer';
import { analyzeSlopeGrid, generateElevationProfile } from '@/utils/terrainAnalysis';
import { TerrainProfileModal } from '@/components/Analysis/TerrainProfileModal';
import {
  Ruler,
  ShieldAlert,
  X,
  Eye,
  EyeOff,
  Sun,
  Sunrise,
  Sunset,
  Clock,
  Navigation2,
  Check,
  RotateCcw,
  AlertTriangle,
  Pin,
  MoveUpRight,
  Waves,
  FileCheck,
  Edit3,
  Truck,
  Boxes,
  Layers,
} from 'lucide-react';
import { calculateSunLight } from '@/utils/sunLightCalculator';
import { calculateViewshed } from '@/utils/viewshedAnalysis';
import { calculate3DMeasurement } from '@/utils/measure3D';
import { calculateCutFill } from '@/utils/cutFillAnalysis';
import { WaterLevelLayer } from './WaterLevelLayer';
import { TitleBlock, drawCadTitleBlockOnCanvas } from './TitleBlock';
import { buildTacticalArrowsFeatureCollection } from '@/utils/tacticalArrowGenerator';
import { UavSensorLayer } from './UavSensorLayer';
import { UavHudOverlay } from './UavHudOverlay';
import { CutFillSummaryCard } from './CutFillSummaryCard';

export interface SelectedBuildingInfo {
  name: string;
  category: string;
  levels: number;
  height: number;
  center: [number, number];
  screenPos: { x: number; y: number };
  rawProperties: Record<string, any>;
}

export const MapViewer: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const orbitAnimRef = useRef<number | null>(null);
  const threeDLayerRef = useRef<ThreeDModelLayer | null>(null);
  const threeboxLayerRef = useRef<ThreeboxBuildingLayer | null>(null);
  const waterLevelLayerRef = useRef<WaterLevelLayer | null>(null);
  const uavSensorLayerRef = useRef<UavSensorLayer | null>(null);

  const {
    viewport,
    setViewport,
    terrainEnabled,
    terrainExaggeration,
    baseMap,
    layers,
    isOrbiting,
    toggleOrbiting,
    // [Phase 2] 부지 드로잉 상태 & 액션
    isDrawingMode,
    drawingPoints,
    completedPolygon,
    polygonCenter,
    polygonArea,
    addDrawingPoint,
    completePolygonDrawing,
    // [Phase 3] 버퍼 링 상태
    bufferRings,
    // [접경 안보 관제] 보안 레이어 가시성
    borderSecurityVisible,
    // [Phase 2 고도화] 스타일, 스탬프, 2D/3D
    polygonStyle,
    stampMode,
    applyStampAt,
    rotatePolygon,
    movePolygon,
    viewMode,
    // [동적 내비게이션 & 검색] 카메라 비행 신호
    flyToSignal,
    // [국방 규제 및 비행안전] 심층 분석 결과 & 3D 고도면 토글
    defenseAnalysisResult,
    showFlightCeiling3D,
    // [3D 개발 구상안(Massing)]
    showBuildingMass3D,
    buildingMassPreset,
    customGltfUrl,
    // [교통·인프라 접근성] 호버링 연결선
    hoveredInfrastructureRow,
    // [3단 보고서 슬라이드 팩 (.pptx) 자동 생성]
    slidePackSignal,
    setSlidePackProgress,
    resetSlidePackProgress,
    metadata,
    selectedRegionId,
    accessibilityResult,
    setVworldDiagnostic,
    // [신규] 토목·지형 단면 및 경사도 분석 상태
    showSlopeAnalysis,
    toggleSlopeAnalysis,
    showTerrainProfile,
    setShowTerrainProfile,
    // [신규] 실시간 일조/태양광 시뮬레이션
    sunHour,
    setSunHour,
    // [신규] 3D 가시권(Viewshed) 분석
    isViewshedMode,
    viewshedResult,
    toggleViewshedMode,
    setViewshedResult,
    clearViewshed,
    // [신규] 3D 실측 줄자
    isMeasureMode,
    measurePoints,
    measureResult,
    toggleMeasureMode,
    setMeasurePoints,
    addMeasurePoint,
    setMeasureResult,
    clearMeasure,
    // [신규] 3D 공간 주석 핀
    spatialPins,
    isPinMode,
    togglePinMode,
    addSpatialPin,
    updateSpatialPin,
    removeSpatialPin,
    clearSpatialPins,
    // [신규] 3D 계획·접근 축선 전술 화살표
    tacticalArrows,
    isArrowMode,
    arrowDraftPoints,
    toggleArrowMode,
    addArrowDraftPoint,
    removeTacticalArrow,
    clearTacticalArrows,
    // [신규] 강원 지형 특화 저류·침수 수위 시뮬레이터
    waterLevel,
    setWaterLevel,
    // [신규] 도정·국방 표준 도면 타이틀 블록
    showTitleBlock,
    toggleTitleBlock,
    // [신규] .geobrief 프로젝트 입출력
    exportProjectFile,
    importProjectFile,
    // [신규] 국방·보안 브리핑 3D 감시 센서 콘 & 정찰 드론(UAV)
    surveillanceSensors,
    isSensorPlacementMode,
    selectedSensorFov,
    selectedSensorRange,
    toggleSensorPlacementMode,
    setSelectedSensorFov,
    setSelectedSensorRange,
    addSurveillanceSensor,
    removeSurveillanceSensor,
    clearSurveillanceSensors,
    uavFlight,
    toggleUavFlight,
    setUavCameraMode,
    updateUavTelemetry,
    // [3D 토공량(Cut & Fill) 산출 엔진]
    cutFill,
    toggleCutFill,
    setCutFillEnabled,
    setCutFillGridSize,
    setCutFillTargetElevation,
    setCutFillResult,
    resetCutFill,
  } = useMapStore();

  // 토공량 격자 셀 호버 툴팁 상태
  const [hoveredCutFillCell, setHoveredCutFillCell] = useState<{
    x: number;
    y: number;
    elevation: number;
    targetElevation: number;
    diff: number;
    type: 'cut' | 'fill' | 'balanced';
    volumeM3: number;
    cellAreaSqm: number;
  } | null>(null);

  // 3D 주석 핀 인라인 편집 및 화면 투영 좌표 상태
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [pinScreenPositions, setPinScreenPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // 오버레이 실시간 렌더링용 로컬 상태
  const [currentBearing, setCurrentBearing] = useState<number>(viewport.bearing);
  const [currentPitch, setCurrentPitch] = useState<number>(viewport.pitch);
  const [currentZoom, setCurrentZoom] = useState<number>(viewport.zoom);
  const [currentLat, setCurrentLat] = useState<number>(viewport.latitude);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

  // 면적 라벨의 화면 좌표
  const [labelScreenPos, setLabelScreenPos] = useState<{ x: number; y: number } | null>(null);

  // [신규] 클릭된 3D 건물 정보 및 화면 좌표
  const [selectedBuilding, setSelectedBuilding] = useState<SelectedBuildingInfo | null>(null);

  // [교통·인프라 접근성] 3D 타깃 인프라 화면 좌표
  const [tieLineMarkerScreenPos, setTieLineMarkerScreenPos] = useState<{
    x: number;
    y: number;
    name: string;
    category: string;
    dist: number;
    time: string;
  } | null>(null);

  // 1. 지도 초기화
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'satellite-tiles': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Esri World Imagery',
            maxzoom: 19,
          },
          'clean-tiles': {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: 'OpenStreetMap, CartoDB',
            maxzoom: 19,
          },
          'terrarium-dem': {
            type: 'raster-dem',
            tiles: [
              'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            ],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 15,
          },
          // 3D 건물 및 도로망 오픈 벡터 타일
          'openmaptiles-vector': {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
            tiles: ['https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf'],
            maxzoom: 14,
          },
          // 전략 대상지 인근 주요 거점 3D 건물 GeoJSON 소스
          'sample-buildings-source': {
            type: 'geojson',
            data: SAMPLE_BUILDINGS,
          },
          // 임시 드로잉 피처 소스
          'drawing-temp-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // 완성된 부지 폴리곤 소스
          'drawing-polygon-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [Phase 3] 버퍼 링 GeoJSON 소스 (500m, 1km, 2km)
          'buffer-500m-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          'buffer-1km-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          'buffer-2km-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [접경 안보 관제] 군사분계선/민통선/DMZ GeoJSON 소스
          'border-security-source': {
            type: 'geojson',
            data: BORDER_SECURITY_GEOJSON,
          },
          // [Phase 2 고도화] 브이월드 연속지적도(필지선) WMS 소스
          'vworld-cadastral-wms': {
            type: 'raster',
            tiles: [
              `https://api.vworld.kr/req/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=LP_PA_CBND_BUBUN,LP_PA_CBND_BONBUN&STYLES=LP_PA_CBND_BUBUN,LP_PA_CBND_BONBUN&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xFFFFFF&EXCEPTIONS=text/xml&KEY=${
                process.env.NEXT_PUBLIC_VWORLD_API_KEY || 'CEB52025-E065-364C-9DBA-44D8863B9B62'
              }`,
            ],
            tileSize: 256,
            maxzoom: 20,
          },
          // 부지 중심 이동 및 회전 조작 핸들러 소스
          'transform-handlers-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [국방 규제 및 비행안전] 3D 가상 비행안전 제한고도면(Ceiling) 소스
          'flight-ceiling-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [교통·인프라 접근성] 3D 시각 연결선 (Tie-Line) 소스
          'tie-line-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [3D 개발 구상안(Massing)] 가상 건축 매스 소스
          'building-mass-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [브이월드 건축물 공간정보 LT_C_SPBD WFS 소스]
          'vworld-buildings-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [토목·지형 단면 및 3단 경사도 분석 격자 소스]
          'slope-analysis-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [클릭된 3D 건물 하이라이트 소스]
          'building-highlight-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [3D 가시권(Viewshed/사계) 분석 소스]
          'viewshed-visible-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          'viewshed-hidden-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          'viewshed-origin-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [정밀 3D 거리 및 고저차 측정 도구 (3D Ruler) 소스]
          'measure-line-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          'measure-points-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [3D 계획·접근 축선 전술 화살표 (Tactical Arrow) 소스]
          'tactical-arrows-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [3D 토공량(절토·성토 Cut & Fill) 격자 소스]
          'cut-fill-grid-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
        },
        layers: [
          // 베이스맵 레이어
          {
            id: 'clean-layer',
            type: 'raster',
            source: 'clean-tiles',
            layout: { visibility: 'none' },
          },
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite-tiles',
            layout: { visibility: 'visible' },
          },
          // [지형 힐셰이드(Hillshade) 입체 음영 합성 레이어 - 산맥 능선과 계곡의 그림자 굴곡을 입체적으로 블렌딩]
          {
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: 'terrarium-dem',
            paint: {
              'hillshade-exaggeration': 0.45,
              'hillshade-shadow-color': '#0f172a',
              'hillshade-highlight-color': '#f8fafc',
              'hillshade-accent-color': '#1e293b',
              'hillshade-illumination-direction': 315,
            },
            layout: { visibility: 'visible' },
          },

          // [Phase 2 고도화] 브이월드 연속지적도(필지선) WMS 레이어
          {
            id: 'vworld-cadastral-layer',
            type: 'raster',
            source: 'vworld-cadastral-wms',
            minzoom: 12,
            paint: {
              'raster-opacity': 0.85,
            },
            layout: { visibility: 'none' },
          },
          // [지적 필지선 오버레이 (얇은 오렌지/옐로우 #F59E0B, 1px)]
          {
            id: 'cadastral-parcels-line',
            type: 'line',
            source: 'openmaptiles-vector',
            'source-layer': 'landuse',
            minzoom: 12,
            paint: {
              'line-color': '#F59E0B',
              'line-width': 1.0,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'none' },
          },

          // [Phase 3] 도로망 위계화 레이어
          {
            id: 'roads-local',
            type: 'line',
            source: 'openmaptiles-vector',
            'source-layer': 'transportation',
            minzoom: 12,
            filter: ['in', 'class', 'minor', 'service', 'track'],
            paint: {
              'line-color': '#94A3B8',
              'line-width': 1.2,
              'line-opacity': 0.7,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'roads-secondary',
            type: 'line',
            source: 'openmaptiles-vector',
            'source-layer': 'transportation',
            minzoom: 10,
            filter: ['in', 'class', 'secondary', 'tertiary'],
            paint: {
              'line-color': '#FBBF24',
              'line-width': 2.2,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'roads-highways',
            type: 'line',
            source: 'openmaptiles-vector',
            'source-layer': 'transportation',
            minzoom: 8,
            filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
            paint: {
              'line-color': '#F97316',
              'line-width': 3.5,
              'line-opacity': 0.95,
            },
            layout: { visibility: 'visible' },
          },

          // [Phase 3] 반경 분석 버퍼 링 레이어 (지형에 밀착된 채우기 & 테두리)
          // 2km 버퍼
          {
            id: 'buffer-2km-fill',
            type: 'fill',
            source: 'buffer-2km-source',
            paint: {
              'fill-color': '#6366F1',
              'fill-opacity': 0.1,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'buffer-2km-line',
            type: 'line',
            source: 'buffer-2km-source',
            paint: {
              'line-color': '#818CF8',
              'line-width': 2.5,
              'line-dasharray': [4, 2],
            },
            layout: { visibility: 'none' },
          },

          // 1km 버퍼
          {
            id: 'buffer-1km-fill',
            type: 'fill',
            source: 'buffer-1km-source',
            paint: {
              'fill-color': '#F59E0B',
              'fill-opacity': 0.15,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'buffer-1km-line',
            type: 'line',
            source: 'buffer-1km-source',
            paint: {
              'line-color': '#FBBF24',
              'line-width': 2.5,
              'line-dasharray': [3, 2],
            },
            layout: { visibility: 'visible' },
          },

          // 500m 버퍼
          {
            id: 'buffer-500m-fill',
            type: 'fill',
            source: 'buffer-500m-source',
            paint: {
              'fill-color': '#10B981',
              'fill-opacity': 0.2,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'buffer-500m-line',
            type: 'line',
            source: 'buffer-500m-source',
            paint: {
              'line-color': '#34D399',
              'line-width': 2.8,
              'line-dasharray': [2, 1.5],
            },
            layout: { visibility: 'visible' },
          },

          // [접경 안보 관제] 1) DMZ 완충구역 반투명 적색 면 채우기
          {
            id: 'dmz-buffer-fill',
            type: 'fill',
            source: 'border-security-source',
            filter: ['==', ['get', 'type'], 'dmz-buffer'],
            paint: {
              'fill-color': '#DC2626',
              'fill-opacity': 0.08,
            },
            layout: { visibility: 'visible' },
          },
          // [접경 안보 관제] 2) 민간인출입통제선 (CCL) 황색 대시 라인
          {
            id: 'ccl-line-layer',
            type: 'line',
            source: 'border-security-source',
            filter: ['==', ['get', 'type'], 'ccl'],
            paint: {
              'line-color': '#F59E0B',
              'line-width': 2.5,
              'line-dasharray': [3, 2],
            },
            layout: { visibility: 'visible' },
          },
          // [접경 안보 관제] 3) 군사분계선 (MDL) 하단 붉은색 네온 글로우 라인
          {
            id: 'mdl-line-glow',
            type: 'line',
            source: 'border-security-source',
            filter: ['==', ['get', 'type'], 'mdl'],
            paint: {
              'line-color': '#EF4444',
              'line-width': 6,
              'line-blur': 3,
              'line-opacity': 0.35,
            },
            layout: { visibility: 'visible' },
          },
          // [접경 안보 관제] 4) 군사분계선 (MDL) 상단 적색 굵은 볼드 점선
          {
            id: 'mdl-line-layer',
            type: 'line',
            source: 'border-security-source',
            filter: ['==', ['get', 'type'], 'mdl'],
            paint: {
              'line-color': '#DC2626',
              'line-width': 3.5,
              'line-dasharray': [4, 2],
            },
            layout: { visibility: 'visible' },
          },

          // [3D 건축물 입체 돌출(3D Extrusion) 레이어 - 절차적 건축 셰이딩 및 실전 도시 톤 LOD 1.5+]
          {
            id: '3d-buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles-vector',
            'source-layer': 'building',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': [
                'case',
                // 일반 주거/아파트: 모던 베이지 / 라이트 그레이 (#E2E8F0, #CBD5E1)
                [
                  'in',
                  ['get', 'type'],
                  ['literal', ['apartments', 'residential', 'house', 'terrace', 'dormitory']]
                ],
                '#E2E8F0',
                // 공공/군사 시설: 차분한 슬레이트 블루 / 무광 메탈 (#64748B, #475569)
                [
                  'in',
                  ['get', 'type'],
                  ['literal', ['government', 'public', 'military', 'civic', 'police', 'fire_station', 'post_office']]
                ],
                '#64748B',
                // 상업/업무: 글래스 커튼월 블루/에메랄드 틴트 (#93C5FD, #6EE7B7)
                [
                  'in',
                  ['get', 'type'],
                  ['literal', ['commercial', 'office', 'hotel', 'bank']]
                ],
                '#93C5FD',
                [
                  'in',
                  ['get', 'type'],
                  ['literal', ['retail', 'supermarket']]
                ],
                '#6EE7B7',
                // 기본 연회색
                '#CBD5E1',
              ],
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['*', ['coalesce', ['get', 'building:levels'], ['get', 'levels'], 3], 3.5],
                ['get', 'height'],
                12,
              ],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.88,
              'fill-extrusion-vertical-gradient': true,
            },
            layout: { visibility: 'visible' },
          },
          // [3D 건축물 옥상 슬래브(Roof Cap) 레이어 - 우레탄 방수 녹색 / 모던 다크 그레이 분리]
          {
            id: '3d-buildings-roof',
            type: 'fill-extrusion',
            source: 'openmaptiles-vector',
            'source-layer': 'building',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': [
                'case',
                // 아파트/주거: 한국 도시의 상징 옥상 우레탄 방수 녹색 (#15803D)
                [
                  'in',
                  ['get', 'type'],
                  ['literal', ['apartments', 'residential', 'house', 'terrace', 'dormitory']]
                ],
                '#15803D',
                // 상업/업무: 모던 다크 그레이 옥상 마감 (#334155)
                [
                  'in',
                  ['get', 'type'],
                  ['literal', ['commercial', 'office', 'retail', 'hotel', 'bank', 'supermarket']]
                ],
                '#334155',
                // 공공/군사/기타: 무광 슬레이트 (#475569)
                '#475569',
              ],
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['*', ['coalesce', ['get', 'building:levels'], ['get', 'levels'], 3], 3.5],
                ['get', 'height'],
                12,
              ],
              'fill-extrusion-base': [
                'max',
                0,
                [
                  '-',
                  [
                    'coalesce',
                    ['get', 'render_height'],
                    ['*', ['coalesce', ['get', 'building:levels'], ['get', 'levels'], 3], 3.5],
                    ['get', 'height'],
                    12,
                  ],
                  0.4,
                ],
              ],
              'fill-extrusion-opacity': 0.95,
            },
            layout: { visibility: 'visible' },
          },
          // [모서리 엣지(Edge Wireframe) 라인 레이어 - 건축 도면 및 CAD 조감도 특유의 선명한 엣지]
          {
            id: '3d-buildings-edge',
            type: 'line',
            source: 'openmaptiles-vector',
            'source-layer': 'building',
            minzoom: 12,
            paint: {
              'line-color': '#1E293B',
              'line-width': 0.8,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },

          // [브이월드 건축물 공간정보 LT_C_SPBD WFS 연동 3D 레이어 - 현실적 외벽 셰이딩]
          {
            id: 'vworld-buildings-3d',
            type: 'fill-extrusion',
            source: 'vworld-buildings-source',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'bld_category'], 'apartment'], '#F1F5F9',
                ['==', ['get', 'bld_category'], 'public_military'], '#64748B',
                ['==', ['get', 'bld_category'], 'commercial'], '#BAE6FD',
                ['coalesce', ['get', 'color'], '#E2E8F0'],
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.92,
              'fill-extrusion-vertical-gradient': true,
            },
            layout: { visibility: 'visible' },
          },
          // [브이월드 건축물 옥상(Roof) 분리 레이어 - 우레탄 방수/설비 다크 슬래브]
          {
            id: 'vworld-buildings-roof',
            type: 'fill-extrusion',
            source: 'vworld-buildings-source',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'bld_category'], 'apartment'], '#14532D',
                ['==', ['get', 'bld_category'], 'commercial'], '#0F172A',
                ['==', ['get', 'bld_category'], 'public_military'], '#334155',
                '#1E293B',
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 12],
              'fill-extrusion-base': [
                'max',
                0,
                ['-', ['coalesce', ['get', 'height'], 12], 0.45],
              ],
              'fill-extrusion-opacity': 0.98,
            },
            layout: { visibility: 'visible' },
          },
          // [브이월드 건축물 외곽 모서리 와이어프레임 엣지 - 0.8px 선명도 강화]
          {
            id: 'vworld-buildings-edge',
            type: 'line',
            source: 'vworld-buildings-source',
            minzoom: 12,
            paint: {
              'line-color': '#1E293B',
              'line-width': 0.8,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },

          {
            id: 'sample-buildings-3d',
            type: 'fill-extrusion',
            source: 'sample-buildings-source',
            minzoom: 11,
            paint: {
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'type'], 'residential'], '#E2E8F0',
                ['==', ['get', 'type'], 'public_office'], '#64748B',
                ['==', ['get', 'type'], 'military_facility'], '#475569',
                ['==', ['get', 'type'], 'commercial_tower'], '#93C5FD',
                ['==', ['get', 'type'], 'research_center'], '#6EE7B7',
                '#CBD5E1',
              ],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.88,
              'fill-extrusion-vertical-gradient': true,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'sample-buildings-roof',
            type: 'fill-extrusion',
            source: 'sample-buildings-source',
            minzoom: 11,
            paint: {
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'type'], 'residential'], '#15803D',
                ['==', ['get', 'type'], 'commercial_tower'], '#334155',
                ['==', ['get', 'type'], 'research_center'], '#1E293B',
                ['==', ['get', 'type'], 'military_facility'], '#475569',
                '#334155',
              ],
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['max', 0, ['-', ['get', 'height'], 0.4]],
              'fill-extrusion-opacity': 0.95,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'sample-buildings-edge',
            type: 'line',
            source: 'sample-buildings-source',
            minzoom: 11,
            paint: {
              'line-color': '#1E293B',
              'line-width': 0.8,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },

          // 부지 드로잉 완성 폴리곤 반투명 채우기 (#3B82F6, opacity 0.4)
          {
            id: 'drawing-polygon-fill',
            type: 'fill',
            source: 'drawing-polygon-source',
            paint: {
              'fill-color': '#3B82F6',
              'fill-opacity': 0.4,
            },
          },
          // 부지 드로잉 완성 폴리곤 외곽선
          {
            id: 'drawing-polygon-line',
            type: 'line',
            source: 'drawing-polygon-source',
            paint: {
              'line-color': '#2563EB',
              'line-width': 3,
            },
          },
          // 부지 드로잉 완성 꼭짓점
          {
            id: 'drawing-polygon-points',
            type: 'circle',
            source: 'drawing-polygon-source',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 5,
              'circle-color': '#FFFFFF',
              'circle-stroke-color': '#2563EB',
              'circle-stroke-width': 2,
            },
          },

          // [토목·지형 단면 및 3단 경사도 분석 격자 오버레이 레이어]
          {
            id: 'slope-analysis-fill',
            type: 'fill',
            source: 'slope-analysis-source',
            paint: {
              'fill-color': ['coalesce', ['get', 'fillColor'], '#10B981'],
              'fill-opacity': 0.65,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'slope-analysis-line',
            type: 'line',
            source: 'slope-analysis-source',
            paint: {
              'line-color': ['coalesce', ['get', 'strokeColor'], '#059669'],
              'line-width': 1.2,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },

          // [3D 가시권(Viewshed/사계) 분석 레이어 - 에메랄드 가시 구역 & 적색 차폐 사각지대]
          {
            id: 'viewshed-visible-fill',
            type: 'fill',
            source: 'viewshed-visible-source',
            paint: {
              'fill-color': '#10B981',
              'fill-opacity': 0.38,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'viewshed-visible-line',
            type: 'line',
            source: 'viewshed-visible-source',
            paint: {
              'line-color': '#34D399',
              'line-width': 1.0,
              'line-opacity': 0.6,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'viewshed-hidden-fill',
            type: 'fill',
            source: 'viewshed-hidden-source',
            paint: {
              'fill-color': '#EF4444',
              'fill-opacity': 0.28,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'viewshed-hidden-line',
            type: 'line',
            source: 'viewshed-hidden-source',
            paint: {
              'line-color': '#F87171',
              'line-width': 1.0,
              'line-opacity': 0.5,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'viewshed-origin-circle',
            type: 'circle',
            source: 'viewshed-origin-source',
            paint: {
              'circle-radius': 8,
              'circle-color': '#10B981',
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
            layout: { visibility: 'visible' },
          },

          // [정밀 3D 거리 및 고저차 측정 도구 (3D Ruler) 레이어]
          {
            id: 'measure-line-glow',
            type: 'line',
            source: 'measure-line-source',
            paint: {
              'line-color': '#F59E0B',
              'line-width': 8,
              'line-blur': 4,
              'line-opacity': 0.45,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'measure-line-main',
            type: 'line',
            source: 'measure-line-source',
            paint: {
              'line-color': '#FBBF24',
              'line-width': 3.5,
              'line-dasharray': [3, 2],
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'measure-points-circle',
            type: 'circle',
            source: 'measure-points-source',
            paint: {
              'circle-radius': 6,
              'circle-color': '#F59E0B',
              'circle-stroke-width': 2.5,
              'circle-stroke-color': '#ffffff',
            },
            layout: { visibility: 'visible' },
          },

          // [3D 계획·접근 축선 전술 화살표 (Tactical Arrow) 3D 지형 표면 밀착 레이어]
          {
            id: 'tactical-arrows-fill',
            type: 'fill',
            source: 'tactical-arrows-source',
            paint: {
              'fill-color': ['coalesce', ['get', 'color'], '#06B6D4'],
              'fill-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'tactical-arrows-line',
            type: 'line',
            source: 'tactical-arrows-source',
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 1.8,
              'line-opacity': 0.95,
            },
            layout: { visibility: 'visible' },
          },

          // [3D 토공량(절토·성토 Cut & Fill) 지형 표면 히트맵 레이어]
          {
            id: 'cut-fill-grid-fill',
            type: 'fill',
            source: 'cut-fill-grid-source',
            paint: {
              'fill-color': ['coalesce', ['get', 'color'], '#10B981'],
              'fill-opacity': 0.62,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'cut-fill-grid-line',
            type: 'line',
            source: 'cut-fill-grid-source',
            paint: {
              'line-color': ['coalesce', ['get', 'borderColor'], '#059669'],
              'line-width': 0.8,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },

          // [국방 규제 및 비행안전] 3D 비행안전 허용 개발 볼륨 (Envelope)
          {
            id: 'flight-envelope-volume',
            type: 'fill-extrusion',
            source: 'flight-ceiling-source',
            filter: ['==', ['get', 'type'], 'envelope'],
            paint: {
              'fill-extrusion-color': '#3B82F6',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.08,
            },
            layout: { visibility: 'visible' },
          },
          // [국방 규제 및 비행안전] 3D 가상 비행안전 제한고도면 (Ceiling 경고 슬래브)
          {
            id: 'flight-ceiling-slab',
            type: 'fill-extrusion',
            source: 'flight-ceiling-source',
            filter: ['==', ['get', 'type'], 'ceiling'],
            paint: {
              'fill-extrusion-color': '#EF4444',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.28,
            },
            layout: { visibility: 'visible' },
          },
          // [국방 규제 및 비행안전] 제한고도면 외곽 테두리 라인
          {
            id: 'flight-ceiling-border',
            type: 'line',
            source: 'flight-ceiling-source',
            filter: ['==', ['get', 'type'], 'ceiling'],
            paint: {
              'line-color': '#EF4444',
              'line-width': 2,
              'line-opacity': 0.85,
            },
            layout: { visibility: 'visible' },
          },
          // [3D 개발 구상안(Massing)] 가상 건축 매스 Extrusion 입체 레이어 - 2단 복합 매스 & 옥상 특화
          {
            id: 'building-mass-extrusion',
            type: 'fill-extrusion',
            source: 'building-mass-source',
            paint: {
              'fill-extrusion-color': ['coalesce', ['get', 'color'], '#0EA5E9'],
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 20],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.78,
              'fill-extrusion-vertical-gradient': true,
            },
            layout: { visibility: 'visible' },
          },
          // [3D 개발 구상안(Massing)] 건물 모서리 및 옥상 헬리패드 마킹 라인
          {
            id: 'building-mass-edges',
            type: 'line',
            source: 'building-mass-source',
            paint: {
              'line-color': ['coalesce', ['get', 'edgeColor'], '#7DD3FC'],
              'line-width': ['coalesce', ['get', 'lineWidth'], 2.0],
              'line-opacity': ['coalesce', ['get', 'lineOpacity'], 0.95],
            },
            layout: { visibility: 'visible' },
          },

          // [클릭된 3D 건물 하이라이트 3D 돌출 및 네온 청록색 엣지 레이어]
          {
            id: 'building-highlight-fill',
            type: 'fill-extrusion',
            source: 'building-highlight-source',
            paint: {
              'fill-extrusion-color': '#06B6D4',
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 20],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.35,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'building-highlight-edge',
            type: 'line',
            source: 'building-highlight-source',
            paint: {
              'line-color': '#22D3EE',
              'line-width': 3,
              'line-opacity': 1.0,
            },
            layout: { visibility: 'visible' },
          },

          // [Phase 2 고도화] 부지 회전축 연결선
          {
            id: 'handler-stem-line',
            type: 'line',
            source: 'transform-handlers-source',
            filter: ['==', 'type', 'stem'],
            paint: {
              'line-color': '#F59E0B',
              'line-width': 2,
              'line-dasharray': [2, 2],
            },
          },
          // [Phase 2 고도화] 부지 중심 이동 핸들러
          {
            id: 'handler-center-point',
            type: 'circle',
            source: 'transform-handlers-source',
            filter: ['==', 'type', 'center'],
            paint: {
              'circle-radius': 8,
              'circle-color': '#10B981',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2.5,
            },
          },
          // [Phase 2 고도화] 부지 회전 핸들러
          {
            id: 'handler-rotate-point',
            type: 'circle',
            source: 'transform-handlers-source',
            filter: ['==', 'type', 'rotate'],
            paint: {
              'circle-radius': 7.5,
              'circle-color': '#F59E0B',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          },

          // [교통·인프라 접근성] 3D 시각 연결선 (Tie-Line) 하단 네온 글로우
          {
            id: 'tie-line-glow',
            type: 'line',
            source: 'tie-line-source',
            filter: ['==', '$type', 'LineString'],
            paint: {
              'line-color': '#F59E0B',
              'line-width': 6,
              'line-blur': 3,
              'line-opacity': 0.5,
            },
            layout: { visibility: 'visible' },
          },
          // [교통·인프라 접근성] 3D 시각 연결선 (Tie-Line) 상단 대시 라인
          {
            id: 'tie-line-dash',
            type: 'line',
            source: 'tie-line-source',
            filter: ['==', '$type', 'LineString'],
            paint: {
              'line-color': '#FBBF24',
              'line-width': 2.8,
              'line-dasharray': [3, 2],
            },
            layout: { visibility: 'visible' },
          },
          // [교통·인프라 접근성] 3D 연결 대상 인프라 위치 펄스 포인트
          {
            id: 'tie-line-point-glow',
            type: 'circle',
            source: 'tie-line-source',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 12,
              'circle-color': '#F59E0B',
              'circle-opacity': 0.35,
            },
            layout: { visibility: 'visible' },
          },
          {
            id: 'tie-line-point-core',
            type: 'circle',
            source: 'tie-line-source',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 6,
              'circle-color': '#FBBF24',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
            layout: { visibility: 'visible' },
          },

          // 임시 드로잉 라인 (점선)
          {
            id: 'drawing-temp-line',
            type: 'line',
            source: 'drawing-temp-source',
            filter: ['==', '$type', 'LineString'],
            paint: {
              'line-color': '#60A5FA',
              'line-width': 2.5,
              'line-dasharray': [2, 1],
            },
          },
          // 임시 드로잉 정점
          {
            id: 'drawing-temp-points',
            type: 'circle',
            source: 'drawing-temp-source',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 6,
              'circle-color': '#3B82F6',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          },
        ],
        terrain: {
          source: 'terrarium-dem',
          exaggeration: 1.5,
        },
        sky: {
          'sky-color': '#0d151c',
          'sky-horizon-blend': 0.6,
          'horizon-color': '#1f2937',
          'horizon-fog-blend': 0.8,
          'fog-color': '#111827',
          'fog-ground-blend': 0.75,
        },
      },
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom,
      pitch: viewport.pitch,
      bearing: viewport.bearing,
      minZoom: 3,
      maxZoom: 20,
      maxPitch: 85,
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
      },
      attributionControl: false,
      doubleClickZoom: false,
      // 한반도 및 전국 전역 자유 팬/줌 및 모바일 터치 제스처 보장
      dragPan: true,
      dragRotate: true,
      scrollZoom: true,
      touchZoomRotate: true,
      touchPitch: true,
    });

    const handleMove = () => {
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      const zoom = map.getZoom();
      const center = map.getCenter();

      setCurrentBearing(bearing);
      setCurrentPitch(pitch);
      setCurrentZoom(zoom);
      setCurrentLat(center.lat);

      // 폴리곤 중심 라벨 위치 추적
      const storeCenter = useMapStore.getState().polygonCenter;
      if (storeCenter) {
        const p = map.project(storeCenter);
        setLabelScreenPos({ x: p.x, y: p.y });
      }

      // [교통·인프라 접근성] 타깃 인프라 핀 위치 추적
      const hoveredRow = useMapStore.getState().hoveredInfrastructureRow;
      if (hoveredRow) {
        const pt = map.project(hoveredRow.coords);
        setTieLineMarkerScreenPos((prev) =>
          prev ? { ...prev, x: pt.x, y: pt.y } : null
        );
      }
    };

    map.on('move', handleMove);

    map.on('load', () => {
      setIsMapLoaded(true);

      // [대기 환경 (Atmospheric Fog)] 원경 산악 지형과 지평선의 입체 공간감 극대화
      try {
        if (typeof (map as any).setFog === 'function') {
          (map as any).setFog({
            range: [0.8, 8],
            color: '#1e293b',
            'horizon-blend': 0.15,
            'high-color': '#0f172a',
            'space-color': '#020617',
          });
        }
      } catch (fogErr) {
        console.warn('[MapLibre] map.setFog skipped:', fogErr);
      }

      // [브이월드 스타일 3D 셰이딩] 남동향 입사각 태양광 조명 설정 (명암 대비 극대화)
      try {
        map.setLight({
          anchor: 'viewport',
          color: '#ffffff',
          intensity: 0.62,
          position: [1.5, 90, 60],
        });
      } catch (lightErr) {
        console.warn('[MapLibre] map.setLight skipped or not supported:', lightErr);
      }

      // [물리 기반 대기 산란 (Sky Shader & Atmosphere)] 실시간 하늘 레이어 등록
      try {
        const initSun = calculateSunLight(13, viewport.latitude, viewport.longitude);
        if (!map.getLayer('sky-atmosphere')) {
          map.addLayer({
            id: 'sky-atmosphere',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [initSun.azimuthDeg, initSun.altitudeDeg],
              'sky-atmosphere-sun-intensity': initSun.skySunIntensity,
              'sky-atmosphere-halo-color': initSun.skyHaloColor,
              'sky-atmosphere-color': initSun.skyAtmosphereColor,
              'sky-opacity': 1,
            },
          } as any);
        }
      } catch (skyErr) {
        console.warn('[MapLibre] sky layer setup note:', skyErr);
      }

      // [절차적 외벽 텍스처 (Procedural Facade) 캔버스 패턴 등록]
      try {
        const createFacadePattern = (
          id: string,
          theme: 'commercial' | 'residential' | 'general'
        ) => {
          const pSize = 64;
          const pCvs = document.createElement('canvas');
          pCvs.width = pSize;
          pCvs.height = pSize;
          const pCtx = pCvs.getContext('2d');
          if (!pCtx) return;

          // 배경 외벽 컬러
          pCtx.fillStyle =
            theme === 'commercial'
              ? '#0F172A'
              : theme === 'residential'
              ? '#F1F5F9'
              : '#CBD5E1';
          pCtx.fillRect(0, 0, pSize, pSize);

          // 4개 층 층간 슬래브 및 창문 라인
          const floors = 4;
          const fH = pSize / floors;
          for (let f = 0; f < floors; f++) {
            const y = f * fH;
            // 층간 슬래브 짙은 음영
            pCtx.fillStyle = theme === 'commercial' ? '#020617' : '#94A3B8';
            pCtx.fillRect(0, y, pSize, 3.5);

            // 창문 구역 (고대비 틴트 글래스)
            pCtx.fillStyle =
              theme === 'commercial'
                ? '#38BDF8'
                : theme === 'residential'
                ? '#64748B'
                : '#475569';
            pCtx.globalAlpha = theme === 'commercial' ? 0.75 : 0.55;
            pCtx.fillRect(3, y + 4.5, pSize - 6, fH - 6);
            pCtx.globalAlpha = 1.0;

            // 창틀 프레임 멀리언 (수직 분할)
            pCtx.strokeStyle =
              theme === 'commercial'
                ? '#0284C7'
                : theme === 'residential'
                ? '#E2E8F0'
                : '#94A3B8';
            pCtx.lineWidth = 1;
            for (let m = 10; m < pSize; m += 12) {
              pCtx.beginPath();
              pCtx.moveTo(m, y + 4);
              pCtx.lineTo(m, y + fH - 1.5);
              pCtx.stroke();
            }
          }

          const imgData = pCtx.getImageData(0, 0, pSize, pSize);
          if (!map.hasImage(id)) {
            map.addImage(id, imgData);
          }
        };

        createFacadePattern('facade-commercial-pattern', 'commercial');
        createFacadePattern('facade-residential-pattern', 'residential');
        createFacadePattern('facade-general-pattern', 'general');
      } catch (patternErr) {
        console.warn('[MapLibre] Failed to create facade patterns:', patternErr);
      }

      // 사선 빗금(Hatch Pattern) 캔버스 이미지 등록
      const size = 32;
      const cvs = document.createElement('canvas');
      cvs.width = size;
      cvs.height = size;
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, size);
        ctx.lineTo(size, 0);
        ctx.moveTo(-size / 2, size / 2);
        ctx.lineTo(size / 2, -size / 2);
        ctx.moveTo(size / 2, size * 1.5);
        ctx.lineTo(size * 1.5, size / 2);
        ctx.stroke();
        const imgData = ctx.getImageData(0, 0, size, size);
        if (!map.hasImage('hatch-pattern')) {
          map.addImage('hatch-pattern', imgData);
        }
      }

      // [Threebox-MapLibre 연동 정밀 3D 건축물 레이어 등록]
      try {
        const tbLayer = new ThreeboxBuildingLayer();
        map.addLayer(tbLayer);
        threeboxLayerRef.current = tbLayer;
      } catch (tbErr) {
        console.warn('[MapViewer] ThreeboxBuildingLayer registration warning:', tbErr);
      }

      // [강원 지형 특화 저류·침수 수위(Water Level) 시뮬레이션 커스텀 레이어 등록]
      try {
        const wlLayer = new WaterLevelLayer();
        map.addLayer(wlLayer);
        waterLevelLayerRef.current = wlLayer;
      } catch (wlErr) {
        console.warn('[MapViewer] WaterLevelLayer registration warning:', wlErr);
      }

      // [국방·보안 브리핑] 3D 감시 센서 콘 & UAV 정찰 드론 커스텀 레이어 등록
      try {
        const uavLayer = new UavSensorLayer();
        uavLayer.onTelemetryUpdate = (telemetry) => {
          updateUavTelemetry(telemetry.coords, telemetry.bearing, telemetry.elevation);
        };
        map.addLayer(uavLayer);
        uavSensorLayerRef.current = uavLayer;
      } catch (uavErr) {
        console.warn('[MapViewer] UavSensorLayer registration warning:', uavErr);
      }

      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showCompass: true,
          showZoom: true,
        }),
        'top-right'
      );
    });

    // WebGL 컨텍스트 손실(webglcontextlost) 자동 감지 및 복구 리스너
    const canvas = map.getCanvas();
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[WebGL] WebGL context lost event detected. Attempting auto recovery...');
    };
    const handleContextRestored = () => {
      console.log('[WebGL] WebGL context restored successfully. Re-rendering map canvas...');
      map.triggerRepaint();
    };
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost, false);
      canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    }

    map.on('error', (e) => {
      // 외부 리소스나 네트워크 401/403/CORS가 전체 맵 렌더링을 중단시키지 않도록 방어 로깅
      console.warn('[MapLibre Handled Event/Warning]:', e.error?.message || e);
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      if (orbitAnimRef.current) {
        cancelAnimationFrame(orbitAnimRef.current);
      }
      if (threeboxLayerRef.current && map.getLayer('threebox-building-layer')) {
        try {
          map.removeLayer('threebox-building-layer');
        } catch {
          // ignore
        }
        threeboxLayerRef.current = null;
      }
      if (threeDLayerRef.current && map.getLayer('custom-three-model-layer')) {
        try {
          map.removeLayer('custom-three-model-layer');
        } catch {
          // ignore
        }
        threeDLayerRef.current = null;
      }
      if (waterLevelLayerRef.current && map.getLayer('custom-water-level-layer')) {
        try {
          map.removeLayer('custom-water-level-layer');
        } catch {
          // ignore
        }
        waterLevelLayerRef.current = null;
      }
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      }
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. 드로잉 모드 핸들러
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isDrawingMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleClick = (e: maplibregl.MapMouseEvent) => {
        const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        addDrawingPoint(pt);
      };

      const handleDblClick = (e: maplibregl.MapMouseEvent) => {
        e.preventDefault();
        completePolygonDrawing();
      };

      map.on('click', handleClick);
      map.on('dblclick', handleDblClick);

      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleClick);
        map.off('dblclick', handleDblClick);
      };
    } else {
      map.getCanvas().style.cursor = '';
    }
  }, [isDrawingMode, isMapLoaded, addDrawingPoint, completePolygonDrawing]);

  // 3. 임시 드로잉 피처(LineString & Points) 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const tempSource = map.getSource('drawing-temp-source') as maplibregl.GeoJSONSource;
    if (!tempSource) return;

    if (drawingPoints.length > 0) {
      const features: GeoJSON.Feature[] = [];

      if (drawingPoints.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: drawingPoints,
          },
        });
      }

      drawingPoints.forEach((coord, idx) => {
        features.push({
          type: 'Feature',
          properties: { index: idx },
          geometry: {
            type: 'Point',
            coordinates: coord,
          },
        });
      });

      tempSource.setData({
        type: 'FeatureCollection',
        features,
      });
    } else {
      tempSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [drawingPoints, isMapLoaded]);

  // 4. 완성된 부지 폴리곤 렌더링 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const polySource = map.getSource('drawing-polygon-source') as maplibregl.GeoJSONSource;
    if (!polySource) return;

    if (completedPolygon) {
      const features: GeoJSON.Feature[] = [completedPolygon];

      const coords = completedPolygon.geometry.coordinates[0];
      coords.forEach((coord, i) => {
        features.push({
          type: 'Feature',
          properties: { index: i },
          geometry: {
            type: 'Point',
            coordinates: coord,
          },
        });
      });

      polySource.setData({
        type: 'FeatureCollection',
        features,
      });

      if (polygonCenter) {
        const p = map.project(polygonCenter);
        setLabelScreenPos({ x: p.x, y: p.y });
      }
    } else {
      polySource.setData({
        type: 'FeatureCollection',
        features: [],
      });
      setLabelScreenPos(null);
    }
  }, [completedPolygon, polygonCenter, isMapLoaded]);

  // 4-1. [국방 규제 및 비행안전] 3D 가상 비행안전 제한고도면(Ceiling) 피처 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const ceilingSource = map.getSource('flight-ceiling-source') as maplibregl.GeoJSONSource;
    if (!ceilingSource) return;

    if (
      completedPolygon &&
      showFlightCeiling3D &&
      defenseAnalysisResult &&
      defenseAnalysisResult.hasFlightSafetyZone
    ) {
      const height = defenseAnalysisResult.maxSurfaceHeight;
      const slabMinHeight = Math.max(0, height - 2);

      const ceilingFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: 'Feature',
        properties: {
          type: 'ceiling',
          height: height,
          min_height: slabMinHeight,
        },
        geometry: completedPolygon.geometry,
      };

      const envelopeFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: 'Feature',
        properties: {
          type: 'envelope',
          height: slabMinHeight,
          min_height: 0,
        },
        geometry: completedPolygon.geometry,
      };

      ceilingSource.setData({
        type: 'FeatureCollection',
        features: [envelopeFeature, ceilingFeature],
      });
    } else {
      ceilingSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [completedPolygon, showFlightCeiling3D, defenseAnalysisResult, isMapLoaded]);

  // 4-2. [가상 3D 건축 매스(Massing)] 부지 경계 안쪽 영역 입체 건물 블록 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const massSource = map.getSource('building-mass-source') as maplibregl.GeoJSONSource;
    if (!massSource) return;

    if (completedPolygon && showBuildingMass3D) {
      try {
        const preset =
          BUILDING_MASS_PRESETS[buildingMassPreset] || BUILDING_MASS_PRESETS.defense_rd;
        const targetCenter: [number, number] =
          polygonCenter || (turf.center(completedPolygon).geometry.coordinates as [number, number]);

        // 1. [Three.js 정밀 3D 모델 엔진 동적 연동]
        // 지형 표고 자동 감지 (Terrain Clamping)
        const terrainElev = map.queryTerrainElevation ? map.queryTerrainElevation(targetCenter) : 0;
        const altitude = Math.max(0, terrainElev || 0);

        // 부지 바운딩 박스 크기 기준 자동 스케일링
        const bbox = turf.bbox(completedPolygon);
        const widthM = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: 'kilometers' }) * 1000;
        const heightM = turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: 'kilometers' }) * 1000;
        const minDim = Math.max(25, Math.min(widthM, heightM));
        const scaleRatio = Math.min(2.5, Math.max(0.65, (minDim * 0.72) / 40));

        // 진입 각도 또는 부지 주축 방향 자동 회전
        const coords = completedPolygon.geometry.coordinates[0];
        let rotationDeg = 0;
        if (coords && coords.length >= 2) {
          rotationDeg = turf.bearing(coords[0], coords[1]);
        }

        // 1. [Threebox-MapLibre 연동 정밀 3D 건축물 파이프라인 동적 갱신]
        if (threeboxLayerRef.current) {
          threeboxLayerRef.current.updateBuilding(
            buildingMassPreset,
            targetCenter,
            scaleRatio,
            rotationDeg,
            customGltfUrl
          );
          threeboxLayerRef.current.setVisible(true);
        }

        // 2. 부지 대지 베이스플레이트 및 기단부 패드 생성
        const basePad = turf.transformScale(completedPolygon, 0.96);
        massSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                part: 'site_podium',
                name: `${preset.name} 대지 기단`,
                height: 0.5,
                min_height: 0,
                color: preset.color,
                edgeColor: preset.edgeColor,
                opacity: 0.85,
              },
              geometry: basePad.geometry,
            },
          ],
        });
      } catch (err) {
        console.error('Failed to update 3D building models:', err);
      }
    } else {
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setVisible(false);
      }
      massSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [completedPolygon, showBuildingMass3D, buildingMassPreset, customGltfUrl, isMapLoaded]);

  // 4-2. [교통·인프라 접근성] 3D 시각 연결선 (Tie-Line) 및 타깃 핀 피처 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const tieSource = map.getSource('tie-line-source') as maplibregl.GeoJSONSource;
    if (!tieSource) return;

    if (hoveredInfrastructureRow && polygonCenter) {
      const lineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: { type: 'tieline' },
        geometry: {
          type: 'LineString',
          coordinates: [polygonCenter, hoveredInfrastructureRow.coords],
        },
      };

      const pointFeature: GeoJSON.Feature<GeoJSON.Point> = {
        type: 'Feature',
        properties: {
          type: 'endpoint',
          name: hoveredInfrastructureRow.facilityName,
          category: hoveredInfrastructureRow.categoryLabel,
          distance: hoveredInfrastructureRow.distanceKm,
          time: hoveredInfrastructureRow.travelTimeText,
        },
        geometry: {
          type: 'Point',
          coordinates: hoveredInfrastructureRow.coords,
        },
      };

      tieSource.setData({
        type: 'FeatureCollection',
        features: [lineFeature, pointFeature],
      });

      const p = map.project(hoveredInfrastructureRow.coords);
      setTieLineMarkerScreenPos({
        x: p.x,
        y: p.y,
        name: hoveredInfrastructureRow.facilityName,
        category: hoveredInfrastructureRow.categoryLabel,
        dist: hoveredInfrastructureRow.distanceKm,
        time: hoveredInfrastructureRow.travelTimeText,
      });
    } else {
      tieSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
      setTieLineMarkerScreenPos(null);
    }
  }, [hoveredInfrastructureRow, polygonCenter, isMapLoaded]);

  // 5. [Phase 3] 정량 거리 분석 버퍼 링 Turf.js 동적 계산 및 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // 기준점: 부지 중심 또는 현재 뷰포트 중심
    const centerLngLat = polygonCenter || [viewport.longitude, viewport.latitude];
    const centerPt = turf.point(centerLngLat);

    try {
      // 500m 버퍼
      const b500 = turf.buffer(centerPt, 0.5, { units: 'kilometers', steps: 64 });
      const src500 = map.getSource('buffer-500m-source') as maplibregl.GeoJSONSource;
      if (src500 && b500) {
        src500.setData(b500);
      }

      // 1km 버퍼
      const b1k = turf.buffer(centerPt, 1.0, { units: 'kilometers', steps: 64 });
      const src1k = map.getSource('buffer-1km-source') as maplibregl.GeoJSONSource;
      if (src1k && b1k) {
        src1k.setData(b1k);
      }

      // 2km 버퍼
      const b2k = turf.buffer(centerPt, 2.0, { units: 'kilometers', steps: 64 });
      const src2k = map.getSource('buffer-2km-source') as maplibregl.GeoJSONSource;
      if (src2k && b2k) {
        src2k.setData(b2k);
      }
    } catch (err) {
      console.error('Failed to compute buffer rings:', err);
    }
  }, [polygonCenter, viewport.longitude, viewport.latitude, isMapLoaded]);

  // 6. [Phase 3] 버퍼 링 가시성(Visibility) 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const vis500 = bufferRings.r500m ? 'visible' : 'none';
    const vis1k = bufferRings.r1km ? 'visible' : 'none';
    const vis2k = bufferRings.r2km ? 'visible' : 'none';

    if (map.getLayer('buffer-500m-fill')) map.setLayoutProperty('buffer-500m-fill', 'visibility', vis500);
    if (map.getLayer('buffer-500m-line')) map.setLayoutProperty('buffer-500m-line', 'visibility', vis500);

    if (map.getLayer('buffer-1km-fill')) map.setLayoutProperty('buffer-1km-fill', 'visibility', vis1k);
    if (map.getLayer('buffer-1km-line')) map.setLayoutProperty('buffer-1km-line', 'visibility', vis1k);

    if (map.getLayer('buffer-2km-fill')) map.setLayoutProperty('buffer-2km-fill', 'visibility', vis2k);
    if (map.getLayer('buffer-2km-line')) map.setLayoutProperty('buffer-2km-line', 'visibility', vis2k);
  }, [bufferRings, isMapLoaded]);

  // [접경 안보 관제] 군사분계선/민통선/DMZ 보안 레이어 가시성 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const secVis = borderSecurityVisible ? 'visible' : 'none';
    const secLayers = ['dmz-buffer-fill', 'ccl-line-layer', 'mdl-line-glow', 'mdl-line-layer'];

    secLayers.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', secVis);
      }
    });
  }, [borderSecurityVisible, isMapLoaded]);

  // 7. [Phase 3] 도로망 위계화 레이어 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const roadVis = layers.roads ? 'visible' : 'none';

    if (map.getLayer('roads-highways')) map.setLayoutProperty('roads-highways', 'visibility', roadVis);
    if (map.getLayer('roads-secondary')) map.setLayoutProperty('roads-secondary', 'visibility', roadVis);
    if (map.getLayer('roads-local')) map.setLayoutProperty('roads-local', 'visibility', roadVis);
  }, [layers.roads, isMapLoaded]);

  // 8. 3D 건축물 Extrusion & Wireframe 엣지 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const visibility = layers.buildings3D ? 'visible' : 'none';

    if (map.getLayer('3d-buildings')) {
      map.setLayoutProperty('3d-buildings', 'visibility', visibility);
    }
    if (map.getLayer('3d-buildings-roof')) {
      map.setLayoutProperty('3d-buildings-roof', 'visibility', visibility);
    }
    if (map.getLayer('3d-buildings-edge')) {
      map.setLayoutProperty('3d-buildings-edge', 'visibility', visibility);
    }
    if (map.getLayer('vworld-buildings-3d')) {
      map.setLayoutProperty('vworld-buildings-3d', 'visibility', visibility);
    }
    if (map.getLayer('vworld-buildings-roof')) {
      map.setLayoutProperty('vworld-buildings-roof', 'visibility', visibility);
    }
    if (map.getLayer('vworld-buildings-edge')) {
      map.setLayoutProperty('vworld-buildings-edge', 'visibility', visibility);
    }
    if (map.getLayer('sample-buildings-3d')) {
      map.setLayoutProperty('sample-buildings-3d', 'visibility', visibility);
    }
    if (map.getLayer('sample-buildings-roof')) {
      map.setLayoutProperty('sample-buildings-roof', 'visibility', visibility);
    }
    if (map.getLayer('sample-buildings-edge')) {
      map.setLayoutProperty('sample-buildings-edge', 'visibility', visibility);
    }
    if (map.getLayer('vector-buildings-3d')) {
      map.setLayoutProperty('vector-buildings-3d', 'visibility', visibility);
    }
  }, [layers.buildings3D, isMapLoaded]);

  // 8-1. [브이월드 건축물 공간정보 LT_C_SPBD 비동기 연동 및 실시간 상태 진단]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (!isVworldConfigured()) {
      setVworldDiagnostic({
        status: 'unconfigured',
        message: 'API 키 미등록 (.env.local 미등록) -> 오픈 무료 벡터 건물로 자동 대체',
        lastChecked: Date.now(),
        featureCount: 0,
      });
      return;
    }

    if (!layers.buildings3D) return;

    let isCancelled = false;
    const fetchBoundsBuildings = async () => {
      try {
        const zoom = map.getZoom();
        if (zoom < 13) return; // 13 레벨 이상에서만 건물 상세 페칭
        const bounds = map.getBounds();
        const bbox: [number, number, number, number] = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];
        const result = await fetchVworldBuildings(bbox);
        if (isCancelled) return;

        setVworldDiagnostic({
          status: result.status,
          message: result.message,
          lastChecked: Date.now(),
          featureCount: result.featureCount,
          errorCode: result.errorCode,
          errorDetail: result.errorDetail,
        });

        try {
          const vworldSource = map.getSource('vworld-buildings-source') as maplibregl.GeoJSONSource;
          if (vworldSource && typeof vworldSource.setData === 'function') {
            if (result.success && result.features && result.features.features.length > 0) {
              vworldSource.setData(result.features);
            } else {
              vworldSource.setData({ type: 'FeatureCollection', features: [] });
            }
          }
        } catch (sourceErr) {
          console.warn('[MapViewer] Failed to update vworld-buildings-source:', sourceErr);
        }
      } catch (err: any) {
        console.warn('[V-World API] Unexpected exception in fetchBoundsBuildings:', err);
        if (!isCancelled) {
          setVworldDiagnostic({
            status: 'error',
            message: '네트워크 또는 호출 예외 발생 (오픈 벡터 대체 가동)',
            lastChecked: Date.now(),
            featureCount: 0,
            errorDetail: err?.message || String(err),
          });
        }
      }
    };

    const timer = setTimeout(fetchBoundsBuildings, 800);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isMapLoaded, viewport.latitude, viewport.longitude, viewport.zoom, layers.buildings3D, setVworldDiagnostic]);

  // 9. 베이스맵 전환
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (map.getLayer('satellite-layer') && map.getLayer('clean-layer')) {
      map.setLayoutProperty(
        'satellite-layer',
        'visibility',
        baseMap === 'satellite' ? 'visible' : 'none'
      );
      map.setLayoutProperty(
        'clean-layer',
        'visibility',
        baseMap === 'clean' ? 'visible' : 'none'
      );
    }
  }, [baseMap, isMapLoaded]);

  // 10. 3D 지형 On/Off 및 고저차 배율 반영
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (terrainEnabled) {
      map.setTerrain({
        source: 'terrarium-dem',
        exaggeration: terrainExaggeration,
      });
    } else {
      map.setTerrain(null);
    }
  }, [terrainEnabled, terrainExaggeration, isMapLoaded]);

  // 11. 동적 주소 검색, 18개 시·군, 북마크 flyTo 카메라 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !flyToSignal) return;

    map.flyTo({
      center: [flyToSignal.longitude, flyToSignal.latitude],
      zoom: flyToSignal.zoom,
      pitch: flyToSignal.pitch,
      bearing: flyToSignal.bearing,
      essential: true,
      duration: flyToSignal.duration || 2000,
    });
  }, [flyToSignal, isMapLoaded]);

  // [Phase 2 고도화] 12. 목표 면적 스탬프 클릭 배치 모드
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (stampMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleStampClick = (e: maplibregl.MapMouseEvent) => {
        applyStampAt([e.lngLat.lng, e.lngLat.lat]);
      };

      map.on('click', handleStampClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleStampClick);
      };
    }
  }, [stampMode, isMapLoaded, applyStampAt]);

  // [Phase 2 고도화] 13. 부지 중심 이동 & 회전 핸들러 GeoJSON 동기화
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const handlerSource = map.getSource('transform-handlers-source') as maplibregl.GeoJSONSource;
    if (!handlerSource) return;

    if (completedPolygon && polygonCenter) {
      const [cLng, cLat] = polygonCenter;
      const bbox = turf.bbox(completedPolygon);
      const northLat = bbox[3];
      const latSpan = Math.max(northLat - bbox[1], 0.001);
      const rotateLat = northLat + latSpan * 0.25;
      const rotateLng = cLng;

      handlerSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { type: 'stem' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [cLng, cLat],
                [rotateLng, rotateLat],
              ],
            },
          },
          {
            type: 'Feature',
            properties: { type: 'center' },
            geometry: {
              type: 'Point',
              coordinates: [cLng, cLat],
            },
          },
          {
            type: 'Feature',
            properties: { type: 'rotate' },
            geometry: {
              type: 'Point',
              coordinates: [rotateLng, rotateLat],
            },
          },
        ],
      });
    } else {
      handlerSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [completedPolygon, polygonCenter, isMapLoaded]);

  // [Phase 2 고도화] 14. 부지 중심 드래그 이동 & 모서리 드래그 회전 인터랙션
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    let activeDrag: 'center' | 'rotate' | null = null;
    let lastPos: [number, number] | null = null;

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!completedPolygon) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['handler-center-point', 'handler-rotate-point'],
      });
      if (features.length > 0) {
        const type = features[0].properties?.type;
        if (type === 'center' || type === 'rotate') {
          activeDrag = type;
          lastPos = [e.lngLat.lng, e.lngLat.lat];
          map.dragPan.disable();
          map.getCanvas().style.cursor = 'grabbing';
          e.preventDefault();
        }
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!activeDrag || !lastPos) {
        if (completedPolygon) {
          const hovered = map.queryRenderedFeatures(e.point, {
            layers: ['handler-center-point', 'handler-rotate-point'],
          });
          if (hovered.length > 0) {
            map.getCanvas().style.cursor = 'grab';
            return;
          }
        }
        return;
      }

      const curLng = e.lngLat.lng;
      const curLat = e.lngLat.lat;

      if (activeDrag === 'center') {
        const deltaLng = curLng - lastPos[0];
        const deltaLat = curLat - lastPos[1];
        movePolygon(deltaLng, deltaLat);
        lastPos = [curLng, curLat];
      } else if (activeDrag === 'rotate') {
        const center = useMapStore.getState().polygonCenter;
        if (center) {
          const prevBearing = turf.bearing(turf.point(center), turf.point(lastPos));
          const curBearing = turf.bearing(turf.point(center), turf.point([curLng, curLat]));
          const deltaAngle = curBearing - prevBearing;
          if (Math.abs(deltaAngle) >= 0.5) {
            rotatePolygon(deltaAngle);
            lastPos = [curLng, curLat];
          }
        }
      }
    };

    const onMouseUp = () => {
      if (activeDrag) {
        activeDrag = null;
        lastPos = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
    };
  }, [completedPolygon, isMapLoaded, movePolygon, rotatePolygon]);

  // [Phase 2 고도화] 15. 브이월드 연속지적도(필지선) 레이어 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const vis = layers.cadastral ? 'visible' : 'none';
    if (map.getLayer('vworld-cadastral-layer')) {
      map.setLayoutProperty('vworld-cadastral-layer', 'visibility', vis);
    }
    if (map.getLayer('cadastral-parcels-line')) {
      map.setLayoutProperty('cadastral-parcels-line', 'visibility', vis);
    }
  }, [layers.cadastral, isMapLoaded]);

  // [Phase 2 고도화] 16. 부지 폴리곤 렌더링 스타일(사선 빗금 / 컬러) 동적 전환
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (!map.getLayer('drawing-polygon-fill') || !map.getLayer('drawing-polygon-line')) return;

    if (polygonStyle === 'hatch') {
      map.setPaintProperty('drawing-polygon-fill', 'fill-pattern', 'hatch-pattern');
      map.setPaintProperty('drawing-polygon-fill', 'fill-opacity', 0.7);
      map.setPaintProperty('drawing-polygon-line', 'line-color', '#F59E0B');
      map.setPaintProperty('drawing-polygon-line', 'line-width', 3.5);
    } else {
      map.setPaintProperty('drawing-polygon-fill', 'fill-pattern', '');
      const colors = {
        blue: { fill: '#3B82F6', line: '#2563EB' },
        orange: { fill: '#F97316', line: '#EA580C' },
        emerald: { fill: '#10B981', line: '#059669' },
      }[polygonStyle] || { fill: '#3B82F6', line: '#2563EB' };

      map.setPaintProperty('drawing-polygon-fill', 'fill-color', colors.fill);
      map.setPaintProperty('drawing-polygon-fill', 'fill-opacity', 0.4);
      map.setPaintProperty('drawing-polygon-line', 'line-color', colors.line);
      map.setPaintProperty('drawing-polygon-line', 'line-width', 3);
    }
  }, [polygonStyle, isMapLoaded]);

  // [신규] 17. 토목·지형 3단 경사도 분석 격자 및 고도 단면 데이터 실시간 연산
  const slopeAnalysisResult = React.useMemo(() => {
    if (!completedPolygon) return null;
    try {
      return analyzeSlopeGrid(completedPolygon, (coord: [number, number]) => {
        if (!mapRef.current) return 150;
        return mapRef.current.queryTerrainElevation(coord) ?? 150;
      });
    } catch (err) {
      console.error('Failed to analyze slope grid:', err);
      return null;
    }
  }, [completedPolygon, isMapLoaded]);

  const elevationProfileResult = React.useMemo(() => {
    if (!completedPolygon) return null;
    try {
      return generateElevationProfile(
        completedPolygon,
        (coord: [number, number]) => {
          if (!mapRef.current) return 150;
          return mapRef.current.queryTerrainElevation(coord) ?? 150;
        },
        25
      );
    } catch (err) {
      console.error('Failed to generate elevation profile:', err);
      return null;
    }
  }, [completedPolygon, isMapLoaded]);

  // 17-1. 경사도 격자 레이어 GeoJSON 소스 동기화
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource('slope-analysis-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    const vis = showSlopeAnalysis ? 'visible' : 'none';
    if (map.getLayer('slope-analysis-fill')) {
      map.setLayoutProperty('slope-analysis-fill', 'visibility', vis);
    }
    if (map.getLayer('slope-analysis-line')) {
      map.setLayoutProperty('slope-analysis-line', 'visibility', vis);
    }

    if (showSlopeAnalysis && slopeAnalysisResult) {
      source.setData(slopeAnalysisResult.geoJson);
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [showSlopeAnalysis, slopeAnalysisResult, isMapLoaded]);

  // 12. 3D Orbit 투어 루프 및 마우스/ESC 즉각 정지 안전장치
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isOrbiting) {
      const step = () => {
        if (!mapRef.current) return;
        const nextBearing = (mapRef.current.getBearing() + 0.2) % 360;
        mapRef.current.setBearing(nextBearing);
        orbitAnimRef.current = requestAnimationFrame(step);
      };
      orbitAnimRef.current = requestAnimationFrame(step);

      // ESC 키 입력 시 3D 회전 즉시 안전 정지
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          toggleOrbiting();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      // 마우스 인터랙션(드래그, 휠, 터치) 시 즉시 정지
      const handleStopOrbit = () => {
        toggleOrbiting();
      };
      map.on('dragstart', handleStopOrbit);
      map.on('wheel', handleStopOrbit);
      map.on('touchstart', handleStopOrbit);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        map.off('dragstart', handleStopOrbit);
        map.off('wheel', handleStopOrbit);
        map.off('touchstart', handleStopOrbit);
        if (orbitAnimRef.current) {
          cancelAnimationFrame(orbitAnimRef.current);
          orbitAnimRef.current = null;
        }
      };
    } else {
      if (orbitAnimRef.current) {
        cancelAnimationFrame(orbitAnimRef.current);
        orbitAnimRef.current = null;
      }
    }

    return () => {
      if (orbitAnimRef.current) {
        cancelAnimationFrame(orbitAnimRef.current);
        orbitAnimRef.current = null;
      }
    };
  }, [isOrbiting, isMapLoaded, toggleOrbiting]);

  // 진북 리셋
  const handleResetNorth = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      bearing: 0,
      pitch: 55,
      duration: 1000,
    });
  }, []);

  // 피치 미세 조정
  const handleAdjustPitch = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getPitch();
    const target = Math.min(85, Math.max(0, current + delta));
    map.easeTo({
      pitch: target,
      duration: 600,
    });
  }, []);

  // [신규] 18. 3D 건물 클릭 인터랙션 (하이라이트 및 부동산·건축물 정보 팝업)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const buildingLayers = [
      'vworld-buildings-3d',
      'vworld-buildings-roof',
      'sample-buildings',
      'sample-buildings-roof',
      '3d-buildings',
    ].filter((layerId) => Boolean(map.getLayer(layerId)));

    if (buildingLayers.length === 0) return;

    // 마우스 호버 커서 처리
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (isDrawingMode || stampMode || isViewshedMode || isMeasureMode || isPinMode || isArrowMode || isSensorPlacementMode) return;
      const features = map.queryRenderedFeatures(e.point, { layers: buildingLayers });
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
    };

    // 건물 클릭 처리
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      if (isDrawingMode || stampMode || isViewshedMode || isMeasureMode || isPinMode || isArrowMode || isSensorPlacementMode) return;

      const features = map.queryRenderedFeatures(e.point, { layers: buildingLayers });
      if (features.length === 0) {
        return;
      }

      const feature = features[0];
      const props = (feature.properties || {}) as Record<string, any>;

      const bldName =
        props.name ||
        props.bld_nm ||
        props.pos_bul_nm ||
        props.bul_man_no ||
        props.bld_nm_dc ||
        '일반 건축물';

      const rawLevels = parseInt(props.levels || props.gro_flo_co || props.grnd_flr_cnt || '3', 10);
      const levels = Math.max(1, isNaN(rawLevels) ? 3 : rawLevels);
      const height = parseFloat(props.height) || levels * 3.3;

      const category =
        props.bld_category_label ||
        (props.bld_category === 'apartment'
          ? '공동주택·아파트'
          : props.bld_category === 'public_military'
          ? '공공청사·군사시설'
          : props.bld_category === 'commercial'
          ? '상업·업무시설'
          : '일반 건축물');

      const clickCoords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      let centerCoords = clickCoords;
      try {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const centroid = turf.centroid(feature as any);
          centerCoords = centroid.geometry.coordinates as [number, number];
        }
      } catch {
        centerCoords = clickCoords;
      }

      // 하이라이트 소스 업데이트
      const highlightSource = map.getSource('building-highlight-source') as maplibregl.GeoJSONSource;
      if (highlightSource && feature.geometry) {
        highlightSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { height },
              geometry: feature.geometry,
            },
          ],
        });
      }

      // 화면 좌표 투영
      const projected = map.project(centerCoords);
      setSelectedBuilding({
        name: bldName,
        category,
        levels,
        height: Math.round(height * 10) / 10,
        center: centerCoords,
        screenPos: { x: projected.x, y: projected.y },
        rawProperties: props,
      });
    };

    map.on('mousemove', onMouseMove);
    map.on('click', onMapClick);

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('click', onMapClick);
    };
  }, [
    isMapLoaded,
    isDrawingMode,
    stampMode,
    isViewshedMode,
    isMeasureMode,
    isPinMode,
    isArrowMode,
  ]);

  // 지도 이동 시 건물 팝업 화면 좌표 동기화 (원시 좌표 기반 안정화)
  const selectedBuildingCenterLng = selectedBuilding?.center[0];
  const selectedBuildingCenterLat = selectedBuilding?.center[1];

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !isMapLoaded ||
      selectedBuildingCenterLng === undefined ||
      selectedBuildingCenterLat === undefined
    ) {
      return;
    }

    const targetCoords: [number, number] = [
      selectedBuildingCenterLng,
      selectedBuildingCenterLat,
    ];

    const updateScreenPos = () => {
      try {
        const p = map.project(targetCoords);
        setSelectedBuilding((prev) =>
          prev ? { ...prev, screenPos: { x: p.x, y: p.y } } : null
        );
      } catch {
        // ignore during map disposal
      }
    };

    map.on('move', updateScreenPos);
    return () => {
      map.off('move', updateScreenPos);
    };
  }, [selectedBuildingCenterLng, selectedBuildingCenterLat, isMapLoaded]);

  // 건물 팝업 닫기 및 하이라이트 해제
  const handleCloseBuildingPopup = useCallback(() => {
    setSelectedBuilding(null);
    const map = mapRef.current;
    if (map) {
      const highlightSource = map.getSource('building-highlight-source') as maplibregl.GeoJSONSource;
      if (highlightSource) {
        highlightSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, []);

  // 이 건물을 부지 중심점으로 지정 핸들러
  const handleSetBuildingAsSiteCenter = useCallback(() => {
    if (!selectedBuilding) return;
    const center = selectedBuilding.center;
    applyStampAt(center);

    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center,
        zoom: Math.max(map.getZoom(), 15.5),
        pitch: 55,
        bearing: map.getBearing(),
        duration: 1200,
      });
    }
    handleCloseBuildingPopup();
  }, [selectedBuilding, applyStampAt, handleCloseBuildingPopup]);

  // 19. [실시간 일조/태양광 셰이딩 엔진 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const lat = polygonCenter ? polygonCenter[1] : viewport.latitude;
    const lng = polygonCenter ? polygonCenter[0] : viewport.longitude;
    const sunConfig = calculateSunLight(sunHour, lat, lng);

    try {
      map.setLight({
        anchor: 'viewport',
        color: sunConfig.color,
        intensity: sunConfig.intensity,
        position: sunConfig.position,
      });
    } catch (e) {
      console.warn('[MapLibre] Failed to update light:', e);
    }

    try {
      if (typeof (map as any).setFog === 'function') {
        (map as any).setFog({
          range: [0.8, 8],
          color: sunConfig.fogColor,
          'horizon-blend': 0.15,
          'high-color': '#0f172a',
          'space-color': '#020617',
        });
      }
    } catch (e) {
      console.warn('[MapLibre] Failed to update fog:', e);
    }

    // 3. 물리 기반 대기 산란 (Sky Shader & Atmosphere) 실시간 바인딩
    try {
      if (map.getLayer('sky-atmosphere')) {
        map.setPaintProperty(
          'sky-atmosphere',
          'sky-atmosphere-sun',
          [sunConfig.azimuthDeg, sunConfig.altitudeDeg]
        );
        map.setPaintProperty(
          'sky-atmosphere',
          'sky-atmosphere-sun-intensity',
          sunConfig.skySunIntensity
        );
        map.setPaintProperty(
          'sky-atmosphere',
          'sky-atmosphere-halo-color',
          sunConfig.skyHaloColor
        );
        map.setPaintProperty(
          'sky-atmosphere',
          'sky-atmosphere-color',
          sunConfig.skyAtmosphereColor
        );
      }
    } catch (e) {
      console.warn('[MapLibre] Failed to update sky-atmosphere paint properties:', e);
    }

    // 4. 지형 힐셰이드 광원 방향 갱신
    try {
      if (map.getLayer('terrain-hillshade')) {
        map.setPaintProperty(
          'terrain-hillshade',
          'hillshade-illumination-direction',
          sunConfig.azimuthDeg
        );
      }
    } catch (e) {
      console.warn('[MapLibre] Failed to update hillshade illumination direction:', e);
    }

    // 5. [PBR 3D 건축물] Threebox 및 Three.js Directional Light 위치 및 그림자 각도 실시간 회전
    try {
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.updateSunLight(
          sunConfig.directionalVector,
          sunConfig.color,
          sunConfig.intensity
        );
      }
      if (threeDLayerRef.current) {
        threeDLayerRef.current.updateSunLight(
          sunConfig.directionalVector,
          sunConfig.color,
          sunConfig.intensity
        );
      }
    } catch (e) {
      console.warn('[3D Building] Failed to update sun light and shadows:', e);
    }
  }, [sunHour, isMapLoaded, polygonCenter, viewport.latitude, viewport.longitude]);

  // 20. [3D 가시권(Viewshed/사계) 분석 인터랙션 & GeoJSON 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isViewshedMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleViewshedClick = (e: maplibregl.MapMouseEvent) => {
        const origin: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const res = calculateViewshed(map, origin, {
          observerHeightMeters: 10,
          targetHeightMeters: 2,
          radiusMeters: 1500,
        });
        if (res) {
          setViewshedResult(res);
        }
      };

      map.on('click', handleViewshedClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleViewshedClick);
      };
    }
  }, [isViewshedMode, isMapLoaded, setViewshedResult]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const visSource = map.getSource('viewshed-visible-source') as maplibregl.GeoJSONSource;
    const hidSource = map.getSource('viewshed-hidden-source') as maplibregl.GeoJSONSource;
    const originSource = map.getSource('viewshed-origin-source') as maplibregl.GeoJSONSource;

    if (viewshedResult) {
      visSource?.setData(viewshedResult.visibleGeojson);
      hidSource?.setData(viewshedResult.hiddenGeojson);
      originSource?.setData({
        type: 'FeatureCollection',
        features: [
          turf.point(viewshedResult.origin, {
            elevation: viewshedResult.elevation,
            observerHeight: viewshedResult.observerHeight,
          }),
        ],
      });
    } else {
      visSource?.setData({ type: 'FeatureCollection', features: [] });
      hidSource?.setData({ type: 'FeatureCollection', features: [] });
      originSource?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [viewshedResult, isMapLoaded]);

  // 21. [3D 실측 줄자 (3D Ruler) 인터랙션 & GeoJSON 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isMeasureMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleMeasureClick = (e: maplibregl.MapMouseEvent) => {
        const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const currentPts = useMapStore.getState().measurePoints;

        if (currentPts.length === 0) {
          addMeasurePoint(pt);
        } else if (currentPts.length === 1) {
          const pt1 = currentPts[0];
          addMeasurePoint(pt);
          const res = calculate3DMeasurement(map, pt1, pt);
          setMeasureResult(res);
        } else {
          addMeasurePoint(pt);
        }
      };

      map.on('click', handleMeasureClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleMeasureClick);
      };
    }
  }, [isMeasureMode, isMapLoaded, addMeasurePoint, setMeasureResult]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const lineSource = map.getSource('measure-line-source') as maplibregl.GeoJSONSource;
    const pointsSource = map.getSource('measure-points-source') as maplibregl.GeoJSONSource;

    if (measurePoints.length >= 2) {
      lineSource?.setData({
        type: 'FeatureCollection',
        features: [turf.lineString(measurePoints)],
      });
      pointsSource?.setData({
        type: 'FeatureCollection',
        features: measurePoints.map((pt, idx) =>
          turf.point(pt, { label: idx === 0 ? 'A' : 'B' })
        ),
      });
    } else if (measurePoints.length === 1) {
      lineSource?.setData({ type: 'FeatureCollection', features: [] });
      pointsSource?.setData({
        type: 'FeatureCollection',
        features: [turf.point(measurePoints[0], { label: 'A' })],
      });
    } else {
      lineSource?.setData({ type: 'FeatureCollection', features: [] });
      pointsSource?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [measurePoints, isMapLoaded]);

  // 22. [ESC 키 단축키로 사계 분석 또는 3D 줄자 해제]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isViewshedMode || viewshedResult) {
          clearViewshed();
        }
        if (isMeasureMode || measureResult || measurePoints.length > 0) {
          clearMeasure();
        }
        if (isPinMode) {
          togglePinMode();
        }
        if (isArrowMode || arrowDraftPoints.length > 0) {
          clearTacticalArrows();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isViewshedMode,
    viewshedResult,
    isMeasureMode,
    measureResult,
    measurePoints.length,
    isPinMode,
    isArrowMode,
    arrowDraftPoints.length,
    clearViewshed,
    clearMeasure,
    togglePinMode,
    clearTacticalArrows,
  ]);

  // 23. [강원 지형 저류·침수 수위(Water Level) 시뮬레이션 동기화]
  useEffect(() => {
    if (!waterLevelLayerRef.current) return;
    const center = polygonCenter || [viewport.longitude, viewport.latitude];
    waterLevelLayerRef.current.setVisible(waterLevel.enabled);
    waterLevelLayerRef.current.setElevation(waterLevel.elevation);
    waterLevelLayerRef.current.setCenter(center);
  }, [
    waterLevel.enabled,
    waterLevel.elevation,
    polygonCenter,
    viewport.longitude,
    viewport.latitude,
  ]);

  // 24. [3D 계획·접근 축선 전술 화살표 (Tactical Arrow) 인터랙션 & GeoJSON 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isArrowMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleArrowClick = (e: maplibregl.MapMouseEvent) => {
        addArrowDraftPoint([e.lngLat.lng, e.lngLat.lat]);
      };

      map.on('click', handleArrowClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleArrowClick);
      };
    }
  }, [isArrowMode, isMapLoaded, addArrowDraftPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource('tactical-arrows-source') as maplibregl.GeoJSONSource;
    if (source) {
      const fc = buildTacticalArrowsFeatureCollection(tacticalArrows);
      source.setData(fc);
    }
  }, [tacticalArrows, isMapLoaded]);

  // 25. [3D 공간 주석 핀 (Billboard Pin) 인터랙션 & 화면 투영 좌표 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isPinMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handlePinClick = (e: maplibregl.MapMouseEvent) => {
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const rawElev = map.queryTerrainElevation ? map.queryTerrainElevation(coords) : null;
        const elevation = rawElev !== null && rawElev !== undefined ? Math.round(rawElev * 10) / 10 : 120;
        addSpatialPin({
          coords,
          elevation,
          title: '주 진입로 (기동로)',
          category: 'access',
          stemHeightMeters: 15,
        });
      };

      map.on('click', handlePinClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handlePinClick);
      };
    }
  }, [isPinMode, isMapLoaded, addSpatialPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const updatePinPositions = () => {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const pin of spatialPins) {
        try {
          const pt = map.project(pin.coords);
          positions[pin.id] = { x: pt.x, y: pt.y };
        } catch {
          // ignore
        }
      }
      setPinScreenPositions(positions);
    };

    updatePinPositions();
    map.on('move', updatePinPositions);
    map.on('render', updatePinPositions);

    return () => {
      map.off('move', updatePinPositions);
      map.off('render', updatePinPositions);
    };
  }, [spatialPins, isMapLoaded]);

  // 26. [3D 토공량(절토·성토 Cut & Fill) 산출 엔진 & 지형 히트맵 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const source = map.getSource('cut-fill-grid-source') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!cutFill.enabled) {
      source.setData({ type: 'FeatureCollection', features: [] });
      setHoveredCutFillCell(null);
      return;
    }

    const poly = completedPolygon;
    if (!poly) {
      source.setData({ type: 'FeatureCollection', features: [] });
      setCutFillResult(null);
      return;
    }

    // 연산 수행
    const res = calculateCutFill(map, poly, {
      gridSizeMeters: cutFill.gridSizeMeters,
      targetElevation: cutFill.targetElevation,
    });

    if (res) {
      source.setData(res.geojson);
      setCutFillResult(res);
      if (cutFill.targetElevation === null || cutFill.targetElevation === undefined) {
        setCutFillTargetElevation(res.targetElevation);
      }
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
      setCutFillResult(null);
    }
  }, [
    cutFill.enabled,
    cutFill.gridSizeMeters,
    cutFill.targetElevation,
    completedPolygon,
    isMapLoaded,
    setCutFillResult,
    setCutFillTargetElevation,
  ]);

  // 27. [토공량 격자 셀 마우스 호버 툴팁]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (!cutFill.enabled) {
      setHoveredCutFillCell(null);
      return;
    }

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['cut-fill-grid-fill'] });
      if (features && features.length > 0) {
        const feat = features[0];
        const props = feat.properties as any;
        if (props && props.elevation !== undefined) {
          map.getCanvas().style.cursor = 'pointer';
          setHoveredCutFillCell({
            x: e.point.x,
            y: e.point.y,
            elevation: Number(props.elevation),
            targetElevation: Number(props.targetElevation),
            diff: Number(props.diff),
            type: props.type,
            volumeM3: Number(props.volumeM3),
            cellAreaSqm: Number(props.cellAreaSqm || 100),
          });
          return;
        }
      }
      map.getCanvas().style.cursor = '';
      setHoveredCutFillCell(null);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setHoveredCutFillCell(null);
    };

    map.on('mousemove', 'cut-fill-grid-fill', handleMouseMove);
    map.on('mouseleave', 'cut-fill-grid-fill', handleMouseLeave);

    return () => {
      map.off('mousemove', 'cut-fill-grid-fill', handleMouseMove);
      map.off('mouseleave', 'cut-fill-grid-fill', handleMouseLeave);
    };
  }, [cutFill.enabled, isMapLoaded]);

  // 28. [국방·보안 브리핑] 3D 감시 센서 콘 & 정찰 드론(UAV) 상태 동기화
  useEffect(() => {
    if (!uavSensorLayerRef.current) return;
    uavSensorLayerRef.current.updateSensors(surveillanceSensors);
  }, [surveillanceSensors]);

  useEffect(() => {
    if (!uavSensorLayerRef.current) return;
    uavSensorLayerRef.current.updateUavState(uavFlight);
  }, [uavFlight]);

  useEffect(() => {
    if (!uavSensorLayerRef.current) return;
    const center = polygonCenter || [viewport.longitude, viewport.latitude];
    uavSensorLayerRef.current.updateSitePolygon(completedPolygon, center);
  }, [completedPolygon, polygonCenter, viewport.longitude, viewport.latitude]);

  // 27. [3D 감시 센서 콘 배치 모드] 인터랙션 리스너
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (isSensorPlacementMode) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleSensorClick = (e: maplibregl.MapMouseEvent) => {
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const rawElev = map.queryTerrainElevation ? map.queryTerrainElevation(coords) : null;
        const elevation = rawElev !== null && rawElev !== undefined ? Math.round(rawElev) : 120;

        addSurveillanceSensor({
          coords,
          elevation,
          mastHeightMeters: 15,
          rangeMeters: selectedSensorRange || 300,
          fovDegrees: selectedSensorFov || 90,
          pitchDeg: 30,
          yawDeg: Math.round(map.getBearing()),
          name: `감시 초소 ${surveillanceSensors.length + 1}호기`,
        });
      };

      map.on('click', handleSensorClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleSensorClick);
      };
    }
  }, [
    isSensorPlacementMode,
    isMapLoaded,
    selectedSensorFov,
    selectedSensorRange,
    surveillanceSensors.length,
    addSurveillanceSensor,
  ]);

  // 28. [.geobrief 파일 드래그 앤 드롭 복원 핸들러]
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.geobrief') || file.name.endsWith('.json')) {
        try {
          const text = await file.text();
          const ok = importProjectFile(text);
          if (ok) {
            alert(`'${file.name}' 브리핑 프로젝트가 성공적으로 복원되었습니다.`);
          } else {
            alert('프로젝트 파일 형식을 복원하지 못했습니다.');
          }
        } catch {
          alert('파일을 읽는 중 오류가 발생했습니다.');
        }
      }
    }
  };

  // [3단 보고서 슬라이드 팩 및 PPTX 자동 생성 엔진]
  const isExportingRef = useRef(false);

  useEffect(() => {
    if (!slidePackSignal || !mapRef.current) return;
    if (isExportingRef.current) return;

    const runSlidePackExport = async () => {
      isExportingRef.current = true;
      const map = mapRef.current;
      if (!map) {
        isExportingRef.current = false;
        return;
      }

      try {
        setSlidePackProgress({
          isExporting: true,
          step: 1,
          totalSteps: 4,
          percent: 5,
          statusText: '3단 보고서 슬라이드 팩 캡처 준비 중...',
        });

        // 1. 기존 카메라 및 레이어 상태 백업
        const originalCenter: [number, number] = [map.getCenter().lng, map.getCenter().lat];
        const originalZoom = map.getZoom();
        const originalPitch = map.getPitch();
        const originalBearing = map.getBearing();

        // 타깃 대상지 중심 좌표 결정
        const currentRegion = GANGWON_REGIONS.find((r) => r.id === selectedRegionId);
        const targetCenter: [number, number] = polygonCenter
          ? [polygonCenter[0], polygonCenter[1]]
          : currentRegion
          ? [currentRegion.center[0], currentRegion.center[1]]
          : originalCenter;

        const regionName = currentRegion?.name || '강원권';

        // =====================================================================
        // 컷 1 [광역 입지 여건도]: 줌 10.5, 수직 뷰(pitch 0, bearing 0), 도로망 활성화
        // =====================================================================
        setSlidePackProgress({
          step: 1,
          percent: 15,
          statusText: '컷 1/3 이동 중 (광역 입지 여건도 - Zoom 10.5 수직 정사 뷰)...',
        });

        // 지적도 숨김, 도로망 표출
        if (map.getLayer('vworld-cadastral-layer')) {
          map.setLayoutProperty('vworld-cadastral-layer', 'visibility', 'none');
        }
        if (map.getLayer('cadastral-parcels-line')) {
          map.setLayoutProperty('cadastral-parcels-line', 'visibility', 'none');
        }
        if (map.getLayer('buffer-500m-fill')) {
          map.setLayoutProperty('buffer-500m-fill', 'visibility', 'none');
          map.setLayoutProperty('buffer-500m-line', 'visibility', 'none');
        }
        if (map.getLayer('buffer-1km-fill')) {
          map.setLayoutProperty('buffer-1km-fill', 'visibility', 'none');
          map.setLayoutProperty('buffer-1km-line', 'visibility', 'none');
        }
        if (map.getLayer('roads-highways')) {
          map.setLayoutProperty('roads-highways', 'visibility', 'visible');
        }
        if (map.getLayer('roads-secondary')) {
          map.setLayoutProperty('roads-secondary', 'visibility', 'visible');
        }

        map.flyTo({
          center: targetCenter,
          zoom: 10.5,
          pitch: 0,
          bearing: 0,
          essential: true,
          duration: 900,
        });

        setSlidePackProgress({
          step: 1,
          percent: 25,
          statusText: '컷 1/3 고해상도 렌더링 안정화 중 (1.5초 대기)...',
        });

        // 캔버스 Tainted/CORS 안전 방어 캡처 헬퍼 (CAD Title Block 합성 탑재)
        const safelyCaptureCanvas = (mapInstance: maplibregl.Map, label: string): string => {
          try {
            const canvas = mapInstance.getCanvas();
            const outCanvas = document.createElement('canvas');
            outCanvas.width = canvas.width;
            outCanvas.height = canvas.height;
            const outCtx = outCanvas.getContext('2d');
            if (outCtx) {
              outCtx.drawImage(canvas, 0, 0);
              if (showTitleBlock) {
                drawCadTitleBlockOnCanvas(outCtx, outCanvas.width, outCanvas.height, {
                  title: metadata.title || `${label} 공간분석도`,
                  department: metadata.department,
                  author: metadata.author,
                  date: metadata.date,
                  securityLevel: metadata.securityLevel,
                });
              }
              const compUrl = outCanvas.toDataURL('image/png');
              if (compUrl && compUrl.length > 100) {
                return compUrl;
              }
            }
            const dataUrl = canvas.toDataURL('image/png');
            if (!dataUrl || dataUrl.length < 100) {
              throw new Error('Empty canvas dataUrl');
            }
            return dataUrl;
          } catch (err) {
            console.warn(`[SlidePack] Canvas capture fallback for ${label}:`, err);
            const fallbackCanvas = document.createElement('canvas');
            fallbackCanvas.width = 1920;
            fallbackCanvas.height = 1080;
            const ctx = fallbackCanvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#0F172A';
              ctx.fillRect(0, 0, 1920, 1080);
              ctx.fillStyle = '#10B981';
              ctx.font = 'bold 36px "Malgun Gothic", sans-serif';
              ctx.fillText('GeoBrief 3D Geospatial Snapshot', 80, 500);
              ctx.fillStyle = '#94A3B8';
              ctx.font = '22px "Malgun Gothic", sans-serif';
              ctx.fillText(`${label} - 고해상도 브리핑 캡처 동기화`, 80, 560);
              if (showTitleBlock) {
                drawCadTitleBlockOnCanvas(ctx, 1920, 1080, {
                  title: metadata.title || `${label} 공간분석도`,
                  department: metadata.department,
                  author: metadata.author,
                  date: metadata.date,
                  securityLevel: metadata.securityLevel,
                });
              }
            }
            return fallbackCanvas.toDataURL('image/png');
          }
        };

        // 1.5초 안정화 딜레이
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const cut1 = safelyCaptureCanvas(map, '광역 입지 여건도 (Zoom 10.5)');

        // =====================================================================
        // 컷 2 [미시적 지적 현황도]: 줌 15.8, 수직 뷰(pitch 0, bearing 0), 지적도 필지선 + 반경 500m/1km 버퍼
        // =====================================================================
        setSlidePackProgress({
          step: 2,
          percent: 40,
          statusText: '컷 2/3 이동 중 (미시적 지적 현황도 - Zoom 15.8 지적선 & 버퍼)...',
        });

        // 지적도 표시
        if (map.getLayer('vworld-cadastral-layer')) {
          map.setLayoutProperty('vworld-cadastral-layer', 'visibility', 'visible');
        }
        if (map.getLayer('cadastral-parcels-line')) {
          map.setLayoutProperty('cadastral-parcels-line', 'visibility', 'visible');
        }
        // 버퍼링 500m & 1km 표시
        if (map.getLayer('buffer-500m-fill')) {
          map.setLayoutProperty('buffer-500m-fill', 'visibility', 'visible');
          map.setLayoutProperty('buffer-500m-line', 'visibility', 'visible');
        }
        if (map.getLayer('buffer-1km-fill')) {
          map.setLayoutProperty('buffer-1km-fill', 'visibility', 'visible');
          map.setLayoutProperty('buffer-1km-line', 'visibility', 'visible');
        }

        map.flyTo({
          center: targetCenter,
          zoom: 15.8,
          pitch: 0,
          bearing: 0,
          essential: true,
          duration: 900,
        });

        setSlidePackProgress({
          step: 2,
          percent: 50,
          statusText: '컷 2/3 지적도 필지선 및 버퍼 안정화 중 (1.5초 대기)...',
        });

        await new Promise((resolve) => setTimeout(resolve, 1500));
        const cut2 = safelyCaptureCanvas(map, '미시적 지적 현황도 (Zoom 15.8)');

        // =====================================================================
        // 컷 3 [3D 미래 조감도]: 줌 13.5, 3D 조감 뷰(pitch 55, bearing 20), 3D 산악 지형 + 개발 구상 매스 + 비행안전 Ceiling
        // =====================================================================
        setSlidePackProgress({
          step: 3,
          percent: 65,
          statusText: '컷 3/3 이동 중 (3D 미래 조감도 - Zoom 13.5 DEM 산악 지형 & 비행안전 고도면)...',
        });

        // 지적도 숨김
        if (map.getLayer('vworld-cadastral-layer')) {
          map.setLayoutProperty('vworld-cadastral-layer', 'visibility', 'none');
        }
        if (map.getLayer('cadastral-parcels-line')) {
          map.setLayoutProperty('cadastral-parcels-line', 'visibility', 'none');
        }
        // 3D 건축물 및 비행안전 천장 표시
        if (map.getLayer('3d-buildings')) {
          map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
        }
        if (map.getLayer('3d-buildings-roof')) {
          map.setLayoutProperty('3d-buildings-roof', 'visibility', 'visible');
        }
        if (map.getLayer('3d-buildings-edge')) {
          map.setLayoutProperty('3d-buildings-edge', 'visibility', 'visible');
        }
        if (map.getLayer('vworld-buildings-3d')) {
          map.setLayoutProperty('vworld-buildings-3d', 'visibility', 'visible');
        }
        if (map.getLayer('vworld-buildings-roof')) {
          map.setLayoutProperty('vworld-buildings-roof', 'visibility', 'visible');
        }
        if (map.getLayer('vworld-buildings-edge')) {
          map.setLayoutProperty('vworld-buildings-edge', 'visibility', 'visible');
        }
        if (map.getLayer('sample-buildings-3d')) {
          map.setLayoutProperty('sample-buildings-3d', 'visibility', 'visible');
        }
        if (map.getLayer('sample-buildings-roof')) {
          map.setLayoutProperty('sample-buildings-roof', 'visibility', 'visible');
        }
        if (map.getLayer('sample-buildings-edge')) {
          map.setLayoutProperty('sample-buildings-edge', 'visibility', 'visible');
        }
        if (map.getLayer('vector-buildings-3d')) {
          map.setLayoutProperty('vector-buildings-3d', 'visibility', 'visible');
        }
        if (map.getLayer('flight-ceiling-slab')) {
          map.setLayoutProperty('flight-ceiling-slab', 'visibility', 'visible');
          map.setLayoutProperty('flight-envelope-volume', 'visibility', 'visible');
          map.setLayoutProperty('flight-ceiling-border', 'visibility', 'visible');
        }
        if (map.getLayer('building-mass-extrusion')) {
          map.setLayoutProperty('building-mass-extrusion', 'visibility', 'visible');
          map.setLayoutProperty('building-mass-edges', 'visibility', 'visible');
        }

        map.flyTo({
          center: targetCenter,
          zoom: 13.5,
          pitch: 55,
          bearing: 20,
          essential: true,
          duration: 900,
        });

        setSlidePackProgress({
          step: 3,
          percent: 75,
          statusText: '컷 3/3 3D DEM 입체 지형 및 조감도 안정화 중 (1.5초 대기)...',
        });

        await new Promise((resolve) => setTimeout(resolve, 1500));
        const cut3 = safelyCaptureCanvas(map, '3D 미래 조감도 (Zoom 13.5)');

        // =====================================================================
        // 4단계: 파워포인트 (.pptx) 조립 및 자동 다운로드
        // =====================================================================
        setSlidePackProgress({
          step: 4,
          percent: 88,
          statusText: 'PptxGenJS 완성형 파워포인트 4-슬라이드 브리핑 덱 조립 중...',
        });

        await generateSlidePackPptx({
          images: { cut1, cut2, cut3 },
          metadata,
          regionName,
          polygonArea,
          defenseResult: defenseAnalysisResult,
          accessibilityResult,
        });

        setSlidePackProgress({
          step: 4,
          percent: 100,
          statusText: `[${metadata.title || '브리핑자료'}.pptx] 생성 및 다운로드 완료!`,
        });

        // 원래 카메라 위치 및 레이어 상태 복구
        map.flyTo({
          center: originalCenter,
          zoom: originalZoom,
          pitch: originalPitch,
          bearing: originalBearing,
          duration: 1000,
        });

        // 레이어 원복
        if (map.getLayer('vworld-cadastral-layer')) {
          map.setLayoutProperty(
            'vworld-cadastral-layer',
            'visibility',
            layers.cadastral ? 'visible' : 'none'
          );
        }
        if (map.getLayer('cadastral-parcels-line')) {
          map.setLayoutProperty(
            'cadastral-parcels-line',
            'visibility',
            layers.cadastral ? 'visible' : 'none'
          );
        }
        if (map.getLayer('buffer-500m-fill')) {
          map.setLayoutProperty(
            'buffer-500m-fill',
            'visibility',
            bufferRings.r500m ? 'visible' : 'none'
          );
          map.setLayoutProperty(
            'buffer-500m-line',
            'visibility',
            bufferRings.r500m ? 'visible' : 'none'
          );
        }
        if (map.getLayer('buffer-1km-fill')) {
          map.setLayoutProperty(
            'buffer-1km-fill',
            'visibility',
            bufferRings.r1km ? 'visible' : 'none'
          );
          map.setLayoutProperty(
            'buffer-1km-line',
            'visibility',
            bufferRings.r1km ? 'visible' : 'none'
          );
        }
        if (map.getLayer('flight-ceiling-slab')) {
          const ceilingVis = showFlightCeiling3D ? 'visible' : 'none';
          map.setLayoutProperty('flight-ceiling-slab', 'visibility', ceilingVis);
          map.setLayoutProperty('flight-envelope-volume', 'visibility', ceilingVis);
          map.setLayoutProperty('flight-ceiling-border', 'visibility', ceilingVis);
        }
        if (map.getLayer('building-mass-extrusion')) {
          const massVis = showBuildingMass3D ? 'visible' : 'none';
          map.setLayoutProperty('building-mass-extrusion', 'visibility', massVis);
          map.setLayoutProperty('building-mass-edges', 'visibility', massVis);
        }
        const bldgVis = layers.buildings3D ? 'visible' : 'none';
        if (map.getLayer('3d-buildings')) {
          map.setLayoutProperty('3d-buildings', 'visibility', bldgVis);
        }
        if (map.getLayer('3d-buildings-roof')) {
          map.setLayoutProperty('3d-buildings-roof', 'visibility', bldgVis);
        }
        if (map.getLayer('3d-buildings-edge')) {
          map.setLayoutProperty('3d-buildings-edge', 'visibility', bldgVis);
        }
        if (map.getLayer('vworld-buildings-3d')) {
          map.setLayoutProperty('vworld-buildings-3d', 'visibility', bldgVis);
        }
        if (map.getLayer('vworld-buildings-roof')) {
          map.setLayoutProperty('vworld-buildings-roof', 'visibility', bldgVis);
        }
        if (map.getLayer('vworld-buildings-edge')) {
          map.setLayoutProperty('vworld-buildings-edge', 'visibility', bldgVis);
        }
        if (map.getLayer('sample-buildings-3d')) {
          map.setLayoutProperty('sample-buildings-3d', 'visibility', bldgVis);
        }
        if (map.getLayer('sample-buildings-roof')) {
          map.setLayoutProperty('sample-buildings-roof', 'visibility', bldgVis);
        }
        if (map.getLayer('sample-buildings-edge')) {
          map.setLayoutProperty('sample-buildings-edge', 'visibility', bldgVis);
        }
        if (map.getLayer('vector-buildings-3d')) {
          map.setLayoutProperty('vector-buildings-3d', 'visibility', bldgVis);
        }

        // 1.8초 후 모달 닫기
        setTimeout(() => {
          resetSlidePackProgress();
        }, 1800);
      } catch (err) {
        console.error('Slide pack export failed:', err);
        alert('슬라이드 팩 내보내기 실패: ' + (err as Error).message);
        resetSlidePackProgress();
      } finally {
        isExportingRef.current = false;
      }
    };

    runSlidePackExport();
  }, [slidePackSignal]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full h-full flex items-center justify-center bg-[#090c0a] p-4 overflow-hidden"
    >
      {/* 16:9 슬라이드 프레임 가이드 박스 */}
      <div className="relative w-full max-w-full aspect-[16/9] max-h-[calc(100vh-5.5rem)] rounded-xl overflow-hidden border-2 border-[#2b3a2f] shadow-2xl shadow-black/80 bg-black">
        {/* MapLibre WebGL Canvas Container */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* 16:9 브리핑 오버레이 프레임워크 */}
        {/* 상단 인라인 편집 가능 보고서 헤더 바 */}
        <BriefingHeader />

        {/* 좌측 상단 카메라 연동 동적 방위표 (North Arrow) */}
        <Compass
          bearing={currentBearing}
          pitch={currentPitch}
          zoom={currentZoom}
          onResetNorth={handleResetNorth}
          onAdjustPitch={handleAdjustPitch}
        />

        {/* 좌측 하단 인쇄 규격 동적 축척 바 (Scale Bar) */}
        <ScaleBar latitude={currentLat} zoom={currentZoom} />

        {/* [교통·인프라 접근성] 16:9 슬라이드 삽입용 정량 분석 표(Table) 오버레이 */}
        <AccessibilityTableOverlay />

        {/* 우측 하단 반투명 범례 카드 (Legend) */}
        <LegendBox />

        {/* [교통·인프라 접근성] 3D 타깃 인프라 플로팅 핀 배지 */}
        {tieLineMarkerScreenPos && (
          <div
            className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 z-30 transition-transform duration-75 select-none"
            style={{
              left: `${tieLineMarkerScreenPos.x}px`,
              top: `${tieLineMarkerScreenPos.y}px`,
            }}
          >
            <div className="bg-[#121914]/95 backdrop-blur-md border border-amber-400 px-3.5 py-1.5 rounded-lg shadow-2xl flex items-center space-x-2 text-xs ring-1 ring-amber-400/40">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-amber-300 font-bold leading-tight">
                  {tieLineMarkerScreenPos.category}
                </span>
                <span className="text-white font-extrabold text-xs">
                  {tieLineMarkerScreenPos.name}
                </span>
                <span className="text-[10px] text-emerald-300 font-mono">
                  직선 {tieLineMarkerScreenPos.dist} km (차량 {tieLineMarkerScreenPos.time})
                </span>
              </div>
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-amber-400 absolute -bottom-[5px] left-1/2 -translate-x-1/2" />
            </div>
          </div>
        )}

        {/* [국방 규제 및 비행안전] 3D 가상 비행안전 제한고도면(Ceiling) 라벨 콜아웃 */}
        {completedPolygon &&
          showFlightCeiling3D &&
          defenseAnalysisResult &&
          defenseAnalysisResult.hasFlightSafetyZone &&
          labelScreenPos && (
            <div
              className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-28 z-20 transition-transform duration-75 select-none"
              style={{
                left: `${labelScreenPos.x}px`,
                top: `${labelScreenPos.y}px`,
              }}
            >
              <div className="bg-[#240c11]/95 backdrop-blur-md border border-rose-500/80 px-3.5 py-2 rounded-lg shadow-2xl text-center flex flex-col items-center min-w-[200px] ring-1 ring-rose-500/40">
                <div className="flex items-center space-x-1.5 text-[10px] text-rose-300 font-bold mb-0.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  <span>3D 비행안전 고도제한면 (Ceiling)</span>
                </div>
                <div className="text-sm font-mono font-extrabold text-white">
                  최대 허용: +{defenseAnalysisResult.maxSurfaceHeight}m{' '}
                  <span className="text-[11px] text-rose-300 font-normal">
                    (EL. {defenseAnalysisResult.maxSeaLevelHeight}m)
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-amber-300 mt-0.5">
                  {defenseAnalysisResult.recommendedFloors}
                </div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-rose-500/80 absolute -bottom-[6px] left-1/2 -translate-x-1/2" />
              </div>
            </div>
          )}

        {/* 폴리곤 중심 실시간 3D 정량 면적 라벨 콜아웃 */}
        {completedPolygon && polygonArea && labelScreenPos && (
          <div
            className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 z-10 transition-transform duration-75 select-none"
            style={{
              left: `${labelScreenPos.x}px`,
              top: `${labelScreenPos.y}px`,
            }}
          >
            <div className="bg-[#101b2b]/95 backdrop-blur-md border border-blue-400/80 px-3 py-2 rounded-lg shadow-2xl text-center flex flex-col items-center min-w-[130px]">
              <div className="flex items-center space-x-1 text-[10px] text-blue-300 font-semibold mb-0.5">
                <Ruler className="w-3 h-3 text-blue-400" />
                <span>군 유휴부지 산출구역</span>
              </div>
              <div className="text-sm font-mono font-extrabold text-white">
                {polygonArea.sqm.toLocaleString()} ㎡
              </div>
              <div className="text-[11px] font-mono font-bold text-emerald-400">
                약 {polygonArea.pyeong.toLocaleString()} 평
              </div>
              <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-blue-400/80 absolute -bottom-[6px] left-1/2 -translate-x-1/2" />
            </div>
          </div>
        )}

        {/* 드로잉 활성화 상태 알림 배너 */}
        {isDrawingMode && (
          <div className="absolute top-20 right-16 z-10 pointer-events-none animate-bounce">
            <div className="bg-blue-600/90 backdrop-blur-md border border-blue-300 text-white px-3 py-1.5 rounded-full shadow-lg text-xs font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>[2D 평면 정밀 모드] 클릭: 꼭짓점 추가 / 더블클릭: 3D 조감도 복귀</span>
            </div>
          </div>
        )}

        {/* 스탬프 모드 활성화 알림 배너 */}
        {stampMode && (
          <div className="absolute top-20 right-16 z-10 pointer-events-none animate-bounce">
            <div className="bg-amber-600/90 backdrop-blur-md border border-amber-300 text-white px-3.5 py-1.5 rounded-full shadow-lg text-xs font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>지도 위 클릭 지점에 정확한 규격 부지 스탬프가 배치됩니다</span>
            </div>
          </div>
        )}

        {/* [신규] 3D 건물 상세 정보 인터랙티브 팝업 */}
        {selectedBuilding && (
          <div
            className="absolute z-40 transform -translate-x-1/2 -translate-y-full mb-6 select-none animate-fade-in"
            style={{
              left: `${selectedBuilding.screenPos.x}px`,
              top: `${selectedBuilding.screenPos.y}px`,
            }}
          >
            <div className="w-72 bg-[#0c1411]/95 backdrop-blur-md border border-cyan-400/80 rounded-xl shadow-2xl overflow-hidden ring-2 ring-cyan-400/30 text-xs">
              {/* 팝업 헤더 */}
              <div className="bg-gradient-to-r from-cyan-950/90 to-[#12231b] p-3 border-b border-cyan-800/40 flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 inline-block mb-1">
                    {selectedBuilding.category}
                  </span>
                  <h4 className="font-bold text-white text-sm truncate leading-snug">
                    {selectedBuilding.name}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleCloseBuildingPopup}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800/60 transition-colors flex-shrink-0"
                  title="닫기"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 팝업 바디 */}
              <div className="p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#101b16] p-2 rounded-lg border border-[#203328]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">지상 층수</span>
                    <span className="font-bold text-cyan-300 font-mono text-xs">
                      지상 {selectedBuilding.levels}층
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">건물 높이</span>
                    <span className="font-bold text-emerald-400 font-mono text-xs">
                      {selectedBuilding.height} m
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between font-mono px-1">
                  <span>
                    좌표: {selectedBuilding.center[0].toFixed(4)}, {selectedBuilding.center[1].toFixed(4)}
                  </span>
                  <span className="text-cyan-400">V-World SPBD</span>
                </div>

                {/* 액션 버튼 */}
                <div className="pt-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSetBuildingAsSiteCenter}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition-all shadow-md shadow-cyan-950/60"
                    title="이 건물을 부지 중심점으로 지정하고 개발 구역 스탬프 생성"
                  >
                    <span>🎯 부지 중심점으로 지정</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseBuildingPopup}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
                  >
                    닫기
                  </button>
                </div>
              </div>

              {/* 하단 툴팁 화살표 */}
              <div className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[7px] border-t-cyan-400 absolute -bottom-[7px] left-1/2 -translate-x-1/2" />
            </div>
          </div>
        )}

        {/* 지형 단면 분석 플로팅 퀵 버튼 */}
        {completedPolygon && (
          <div className="absolute bottom-16 left-6 z-20">
            <button
              onClick={() => setShowTerrainProfile(true)}
              className="bg-[#121914]/90 backdrop-blur-md border border-emerald-500/50 hover:border-emerald-400 px-3 py-1.5 rounded-lg shadow-xl text-xs font-bold text-emerald-300 hover:text-white flex items-center gap-1.5 transition-all group"
              title="부지 횡단 해발고도(EL.) 단면도 및 경사도 분석 열기"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 group-hover:animate-ping"></span>
              <span>지형 고도단면 & 경사도 분석</span>
            </button>
          </div>
        )}

        {/* [군사·입지 분석] 3D 가시권(Viewshed/사계) 분석 플로팅 컨트롤 & 결과 카드 */}
        {(isViewshedMode || viewshedResult) && (
          <div className="absolute top-16 right-6 z-30 w-84 max-w-[calc(100vw-3rem)] bg-[#0d1612]/95 backdrop-blur-md border border-teal-500/80 rounded-xl shadow-2xl p-3.5 text-xs space-y-3 ring-1 ring-teal-500/30 animate-fade-in">
            {/* 헤더 */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1.5">
                <span className="p-1 rounded bg-teal-950/80 border border-teal-700/60 text-teal-400">
                  <Eye className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-100 text-xs">
                    3D 가시권(사계) 정밀 분석
                  </h3>
                  <p className="text-[10px] text-teal-300/80">
                    반경 1.5km 360° 시선 차폐 시뮬레이션
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearViewshed}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                title="가시권 분석 종료 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 상태 안내 및 수치 */}
            {!viewshedResult ? (
              <div className="p-2.5 rounded-lg bg-teal-950/40 border border-teal-800/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-teal-300 font-semibold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                  <span>지도 위 관측 지점(부지/고지대)을 클릭하세요</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  지표면 +10m 관측소 높이 기준 360도 전방위 4도 간격 Ray Marching으로 능선과 지형 표고 차폐를 실시간 분석합니다.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* 관측소 고도 및 좌표 */}
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#121f19] p-2 rounded-lg border border-[#23382d]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">관측 지표 표고</span>
                    <span className="font-bold text-slate-200 font-mono">
                      EL. {viewshedResult.elevation} m
                    </span>
                    <span className="text-[9.5px] text-teal-300/80 block">
                      (+관측탑 {viewshedResult.observerHeight}m)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">가시율 (Coverage)</span>
                    <span className="font-extrabold text-teal-300 font-mono text-sm">
                      {viewshedResult.coverageRatio}%
                    </span>
                  </div>
                </div>

                {/* 가시 / 차폐 프로그레스 바 */}
                <div className="space-y-1">
                  <div className="h-2 w-full bg-rose-950/80 rounded-full overflow-hidden flex border border-slate-700/50">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${viewshedResult.coverageRatio}%` }}
                    />
                    <div
                      className="bg-rose-500 h-full transition-all duration-500"
                      style={{ width: `${100 - viewshedResult.coverageRatio}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono px-0.5">
                    <span className="text-emerald-400 font-semibold">
                      가시: {(viewshedResult.visibleAreaSqm / 10000).toFixed(1)}만㎡
                    </span>
                    <span className="text-rose-400 font-semibold">
                      차폐 사각: {(viewshedResult.hiddenAreaSqm / 10000).toFixed(1)}만㎡
                    </span>
                  </div>
                </div>

                {/* 범례 */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-[#1f3026]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80 border border-emerald-400" />
                    가시 구역
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/80 border border-rose-400" />
                    능선 차폐 사각
                  </span>
                  <span className="text-[9.5px] font-mono text-slate-500">
                    반경 1.5km
                  </span>
                </div>

                {/* 재측정 가이드 */}
                <p className="text-[9.5px] text-teal-300/80 text-center">
                  💡 지도의 다른 지점을 클릭하면 즉시 재계산됩니다
                </p>
              </div>
            )}
          </div>
        )}

        {/* [토목·실무 도구] 정밀 3D 거리 및 고저차 측정 도구 (3D Ruler) 플로팅 카드 */}
        {(isMeasureMode || measureResult || measurePoints.length > 0) && (
          <div className="absolute top-16 left-6 z-30 w-84 max-w-[calc(100vw-3rem)] bg-[#121722]/95 backdrop-blur-md border border-amber-500/80 rounded-xl shadow-2xl p-3.5 text-xs space-y-3 ring-1 ring-amber-500/30 animate-fade-in">
            {/* 헤더 */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1.5">
                <span className="p-1 rounded bg-amber-950/80 border border-amber-700/60 text-amber-400">
                  <Ruler className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-100 text-xs">
                    3D 실측 줄자 (3D Ruler)
                  </h3>
                  <p className="text-[10px] text-amber-300/80">
                    지형 표고 굴곡 반영 3D 실측 거리 & 고저차
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearMeasure}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                title="줄자 측정 종료 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 진행 단계 안내 */}
            {measurePoints.length === 0 && (
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200">
                <span className="font-bold block mb-0.5">📍 1단계: 측정 시작점 (A) 클릭</span>
                지도 상의 측정 출발 지점을 클릭해 주세요.
              </div>
            )}

            {measurePoints.length === 1 && (
              <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200">
                <span className="font-bold block mb-0.5">🏁 2단계: 측정 끝점 (B) 클릭</span>
                시작점: [{measurePoints[0][0].toFixed(4)}, {measurePoints[0][1].toFixed(4)}] 지정됨. 목표 지점을 클릭해 주세요.
              </div>
            )}

            {/* 실측 완료 결과 수치 */}
            {measureResult && (
              <div className="space-y-2.5">
                {/* 메인 하이라이트: 3D 실제 지표 거리 */}
                <div className="p-2.5 rounded-lg bg-gradient-to-r from-amber-950/70 to-[#1f2333] border border-amber-500/50">
                  <span className="text-[10px] text-amber-300 font-semibold block uppercase tracking-wider">
                    3D 실제 지표 거리 (Surface Distance)
                  </span>
                  <div className="text-xl font-extrabold text-white font-mono mt-0.5 flex items-baseline gap-1">
                    <span>{measureResult.surfaceDistanceMeters.toLocaleString()}</span>
                    <span className="text-xs text-amber-300 font-sans font-bold">m</span>
                  </div>
                  <span className="text-[9.5px] text-slate-400 block mt-0.5">
                    * 24개 세부 지표면 표고 굴곡 실시간 적분 반영
                  </span>
                </div>

                {/* 상세 수치 그리드 */}
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#0d131f] p-2 rounded-lg border border-[#1e293b]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">2D 수평 거리</span>
                    <span className="font-bold text-slate-200 font-mono">
                      {measureResult.horizontalDistanceMeters.toLocaleString()} m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">표고차 (ΔH)</span>
                    <span
                      className={`font-bold font-mono ${
                        measureResult.elevationDeltaMeters >= 0
                          ? 'text-rose-400'
                          : 'text-blue-400'
                      }`}
                    >
                      {measureResult.elevationDeltaMeters > 0 ? '+' : ''}
                      {measureResult.elevationDeltaMeters} m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">평균 경사도</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {measureResult.slopePercent}% ({measureResult.slopeDegrees}°)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">공간 직선 거리</span>
                    <span className="font-bold text-slate-300 font-mono">
                      {measureResult.directDistanceMeters.toLocaleString()} m
                    </span>
                  </div>
                </div>

                {/* 지점 표고 비교 */}
                <div className="text-[10px] text-slate-400 bg-[#0d131f] px-2 py-1.5 rounded border border-[#1e293b] flex justify-between font-mono">
                  <span>시점 (A): EL. {measureResult.elevations[0]}m</span>
                  <span>→</span>
                  <span>종점 (B): EL. {measureResult.elevations[1]}m</span>
                </div>

                {/* 액션 버튼 */}
                <div className="pt-0.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMeasurePoints([]);
                      setMeasureResult(null);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-all shadow-md shadow-amber-950/60"
                  >
                    <span>새로운 구간 측정</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearMeasure}
                    className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition-colors"
                  >
                    종료
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* [신규] 3D 공간 주석 핀 (Billboard Pin) 렌더링 */}
        {spatialPins.map((pin) => {
          const pos = pinScreenPositions[pin.id];
          if (!pos) return null;
          const isEditing = editingPinId === pin.id;

          return (
            <div
              key={pin.id}
              className="absolute pointer-events-auto z-30 transition-transform duration-75 select-none"
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="flex flex-col items-center group">
                {/* 콜아웃 다크 글래스 카드 */}
                <div className="bg-[#0b1219]/95 backdrop-blur-md border border-cyan-400/80 rounded-lg shadow-2xl p-2 min-w-[130px] max-w-[210px] ring-1 ring-cyan-400/30 transition-all hover:scale-105">
                  {/* 상단 메타 바 */}
                  <div className="flex items-center justify-between gap-1 mb-1 border-b border-cyan-900/50 pb-1">
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {pin.category === 'access'
                        ? '기동로/진입축'
                        : pin.category === 'elevation'
                        ? '관측고지'
                        : pin.category === 'demolish'
                        ? '철거대상 막사'
                        : '군 유휴시설'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono text-cyan-200">
                        EL.{pin.elevation}m
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSpatialPin(pin.id);
                        }}
                        className="text-slate-400 hover:text-rose-400 p-0.5 rounded transition-colors"
                        title="주석 핀 삭제"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 텍스트 내용 (인라인 더블클릭 수정) */}
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      defaultValue={pin.title}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val) updateSpatialPin(pin.id, { title: val });
                        setEditingPinId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) updateSpatialPin(pin.id, { title: val });
                          setEditingPinId(null);
                        } else if (e.key === 'Escape') {
                          setEditingPinId(null);
                        }
                      }}
                      className="w-full bg-[#162230] text-white text-xs font-bold px-1.5 py-0.5 rounded border border-cyan-400 focus:outline-none"
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingPinId(pin.id);
                      }}
                      className="text-xs font-bold text-white cursor-pointer hover:text-cyan-300 flex items-center justify-between gap-1"
                      title="더블클릭하여 명칭 수정"
                    >
                      <span className="truncate">{pin.title}</span>
                      <Edit3 className="w-2.5 h-2.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  )}

                  <div className="text-[8.5px] text-slate-400/80 mt-0.5">
                    더블클릭으로 명칭 수정
                  </div>
                </div>

                {/* 지면으로 뻗어 내려가는 수직 기둥 (Stem Line) */}
                <div className="w-0.5 h-7 bg-gradient-to-b from-cyan-400 to-cyan-500/30" />
                {/* 지표면 안착 앵커 점 */}
                <div className="w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-cyan-400/50 shadow-md shadow-cyan-400/80" />
              </div>
            </div>
          );
        })}

        {/* [3D 공간 주석 핀 모드] 상단 안내 배너 */}
        {isPinMode && (
          <div className="absolute top-20 right-16 z-30 pointer-events-auto">
            <div className="bg-cyan-900/90 backdrop-blur-md border border-cyan-400 text-white px-3.5 py-1.5 rounded-full shadow-lg text-xs font-bold flex items-center space-x-2 animate-bounce">
              <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
              <span>[3D 공간 주석 핀] 지도 위 원하는 위치를 클릭하여 핀을 꽂으세요</span>
              <button
                onClick={togglePinMode}
                className="ml-2 px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-800 text-cyan-200 text-[10px] border border-cyan-700 transition-colors"
              >
                종료
              </button>
            </div>
          </div>
        )}

        {/* [3D 계획·접근 축선 화살표 모드] 상단 안내 배너 */}
        {isArrowMode && (
          <div className="absolute top-20 right-16 z-30 pointer-events-auto">
            <div className="bg-amber-900/90 backdrop-blur-md border border-amber-400 text-white px-3.5 py-1.5 rounded-full shadow-lg text-xs font-bold flex items-center space-x-2 animate-bounce">
              <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
              <span>
                {arrowDraftPoints.length === 0
                  ? '[전술 화살표 1단계] 시작점(기동 출발지)을 클릭하세요'
                  : '[전술 화살표 2단계] 목표점(도착지)을 클릭하여 축선을 완성하세요'}
              </span>
              <button
                onClick={toggleArrowMode}
                className="ml-2 px-2 py-0.5 rounded bg-amber-950 hover:bg-amber-800 text-amber-200 text-[10px] border border-amber-700 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* [3D 감시 센서 콘 배치 모드] 상단 인터랙티브 컨트롤 배너 */}
        {isSensorPlacementMode && (
          <div className="absolute top-20 right-16 z-30 pointer-events-auto animate-fade-in">
            <div className="bg-[#06180f]/95 backdrop-blur-md border border-emerald-400 text-white px-4 py-2 rounded-2xl shadow-2xl text-xs flex items-center gap-3 ring-1 ring-emerald-500/50">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-extrabold text-emerald-300">
                  [감시 센서 배치] 지도 위 설치 지점 클릭
                </span>
              </div>

              {/* 수평 화각(FOV) 선택 칩 */}
              <div className="flex items-center gap-1 bg-[#0f2d1e] px-2 py-1 rounded-lg border border-emerald-600/50">
                <span className="text-[10px] text-slate-300 font-semibold">화각:</span>
                {[60, 90, 120].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => setSelectedSensorFov(deg as 60 | 90 | 120)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      selectedSensorFov === deg
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-300 hover:text-white'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>

              {/* 유효 반경 선택 칩 */}
              <div className="flex items-center gap-1 bg-[#0f2d1e] px-2 py-1 rounded-lg border border-emerald-600/50">
                <span className="text-[10px] text-slate-300 font-semibold">반경:</span>
                {[200, 300, 500].map((rng) => (
                  <button
                    key={rng}
                    type="button"
                    onClick={() => setSelectedSensorRange(rng)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      selectedSensorRange === rng
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-300 hover:text-white'
                    }`}
                  >
                    {rng}m
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={toggleSensorPlacementMode}
                className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600 text-rose-200 text-[10px] font-bold transition-colors"
              >
                배치 종료
              </button>
            </div>
          </div>
        )}

        {/* [국방·보안] UAV 정찰 드론 비행 HUD 오버레이 */}
        <UavHudOverlay />

        {/* [3D 토공량(절토·성토 Cut & Fill) 산출 종합 결과 카드] */}
        <CutFillSummaryCard />

        {/* 토공량 격자 셀 마우스 호버 인터랙티브 툴팁 */}
        {hoveredCutFillCell && (
          <div
            className="absolute z-40 pointer-events-none select-none -translate-x-1/2 -translate-y-full mb-3 animate-fade-in"
            style={{
              left: hoveredCutFillCell.x,
              top: hoveredCutFillCell.y,
            }}
          >
            <div className="bg-[#08150f]/95 backdrop-blur-md border border-emerald-500/80 px-2.5 py-1.5 rounded-lg shadow-2xl text-[10px] font-mono text-slate-100 ring-1 ring-emerald-500/40 space-y-0.5">
              <div className="flex items-center gap-1.5 font-bold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hoveredCutFillCell.type === 'cut'
                      ? 'bg-rose-500'
                      : hoveredCutFillCell.type === 'fill'
                      ? 'bg-blue-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <span
                  className={
                    hoveredCutFillCell.type === 'cut'
                      ? 'text-rose-400'
                      : hoveredCutFillCell.type === 'fill'
                      ? 'text-blue-400'
                      : 'text-emerald-400'
                  }
                >
                  {hoveredCutFillCell.type === 'cut'
                    ? `[절토 Cut] +${hoveredCutFillCell.diff}m`
                    : hoveredCutFillCell.type === 'fill'
                    ? `[성토 Fill] ${hoveredCutFillCell.diff}m`
                    : `[균형 지반] ±0.5m 이내`}
                </span>
              </div>
              <div className="text-slate-300">
                원지반 EL. {hoveredCutFillCell.elevation}m → 계획 EL. {hoveredCutFillCell.targetElevation}m
              </div>
              {hoveredCutFillCell.type !== 'balanced' && (
                <div className="text-emerald-300/90 font-bold">
                  체적: {hoveredCutFillCell.volumeM3} ㎥ ({hoveredCutFillCell.cellAreaSqm}㎡ 기준)
                </div>
              )}
            </div>
          </div>
        )}

        {/* 도정·국방 표준 도면 표제란 (CAD Title Block) */}
        <TitleBlock siteName={metadata?.title || '강원 전략 군 유휴지'} />

        {/* .geobrief 드래그 앤 드롭 오버레이 */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-[#051119]/85 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-cyan-400 pointer-events-none transition-all">
            <div className="p-6 rounded-2xl bg-[#091824] border border-cyan-400/80 shadow-2xl flex flex-col items-center text-center space-y-3 max-w-md">
              <div className="w-14 h-14 rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center text-cyan-300">
                <Pin className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-extrabold text-white">
                .geobrief 프로젝트 파일 불러오기
              </h3>
              <p className="text-xs text-cyan-200 leading-relaxed">
                파일을 여기에 드롭하면 카메라 뷰포트, 부지 경계, 3D 매스, 공간 주석 핀, 전술 화살표, 수위 설정이 즉시 복원됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 16:9 규격 워터마크 태그 */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <span className="text-[10px] tracking-wider text-slate-400/60 font-mono uppercase bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm border border-white/5">
            16:9 Widescreen Briefing Viewport (3840×2160 Target)
          </span>
        </div>
      </div>

      {/* 3단 보고서 슬라이드 팩 (.pptx) 순차 캡처 및 빌드 진행 상태 모달 */}
      <ExportProgressModal />

      {/* 토목·도시계획 지형 단면 및 3단 경사도 분석 모달 */}
      <TerrainProfileModal
        isOpen={showTerrainProfile}
        onClose={() => setShowTerrainProfile(false)}
        slopeResult={slopeAnalysisResult}
        profileResult={elevationProfileResult}
      />
    </div>
  );
};
