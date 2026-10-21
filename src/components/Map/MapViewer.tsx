'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { useMapStore, WONJU_DEFAULT_POLYGON } from '@/store/useMapStore';
import { SAMPLE_BUILDINGS } from '@/data/sampleBuildings';
import { BORDER_SECURITY_GEOJSON } from '@/constants/borderSecurityZones';
import { Compass, updateCompassDOM } from './Compass';
import { ScaleBar, updateScaleBarDOM } from './ScaleBar';
import { BriefingHeader } from './BriefingHeader';
import { LegendBox } from './LegendBox';
import { AccessibilityTableOverlay } from './AccessibilityTableOverlay';
import { ExportProgressModal } from '../Modal/ExportProgressModal';
import { generateSlidePackPptx } from '@/utils/pptxExportEngine';
import { GANGWON_REGIONS } from '@/constants/gangwonRegions';
import { BUILDING_MASS_PRESETS } from '@/types/map';
import { isVworldConfigured, fetchVworldBuildings } from '@/services/vworldService';
import { fetchFusionBuildings } from '@/services/fusionBuildingsService';
import { fetchHybridSpatialBuildings, extractRenderedVectorBuildings } from '@/utils/spatialDataFetcher';
import { fetchExternalSpatialData } from '@/utils/externalSpatialData';
import { generateDetailedBuildingMass } from '@/utils/buildingMassGenerator';
import { ThreeDModelLayer } from './ThreeDModelLayer';
import { ThreeboxBuildingLayer } from './ThreeboxBuildingLayer';
import { LOD2BuildingEngine } from './LOD2BuildingEngine';
import { RealisticKoreanCityLayer } from './RealisticKoreanCityLayer';
import { setupVworldPoiLayer, updateVworldPoisWithBuildings, VWORLD_POI_LAYER_ID } from '@/utils/koreanPoiLayer';
import { SmartCityComplex3DLayer } from './SmartCityComplex3D';
import { ProceduralTrees3DLayer } from './ProceduralTrees3D';
import {
  createGpuBuildingStackLayers,
  ensureBuildingPatterns,
  setGpuBuildingLayersMode,
  setGpuBuildingLayersVisibility,
  GPU_BUILDING_LAYER_IDS,
  gpuBuildingTotalHeightExpr,
} from '@/utils/gpuRealisticBuildingStack';
import { applyAdaptiveFoundationToFeatures } from '@/utils/terrainFoundation';
import { buildingSpatialCache } from '@/utils/buildingSpatialCache';
import { generateContourLines } from '@/utils/contourGenerator';
import { analyzeSlopeGrid, generateElevationProfile } from '@/utils/terrainAnalysis';
import { aggregateBuildingFeatures } from '@/utils/gangwonSpatialAggregator';
import { enforceMaxActiveLayers } from '@/utils/layerBudgetGuard';
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
  Radio,
  Target,
  Sparkles,
} from 'lucide-react';
import { calculateSunLight, safeSetLight } from '@/utils/sunLightCalculator';
import { calculateViewshed } from '@/utils/viewshedAnalysis';
import { calculate3DMeasurement } from '@/utils/measure3D';
import { calculateCutFill } from '@/utils/cutFillAnalysis';
import { WaterLevelLayer } from './WaterLevelLayer';
import { TitleBlock, drawCadTitleBlockOnCanvas } from './TitleBlock';
import { buildTacticalArrowsFeatureCollection } from '@/utils/tacticalArrowGenerator';
import { UavSensorLayer } from './UavSensorLayer';
import { UavHudOverlay } from './UavHudOverlay';
import { CutFillSummaryCard } from './CutFillSummaryCard';
import { Deck3DTilesManager } from './Deck3DTilesOverlay';
import { TacticalDefenseLayer } from './TacticalDefenseLayer';
import { CinematicBuilderModal } from '@/components/Cinematic/CinematicBuilderModal';
import { CinematicOsdOverlay } from '@/components/Cinematic/CinematicOsdOverlay';
import { CanvasVideoRecorder } from '@/utils/canvasVideoRecorder';
import { interpolateCinematicCamera } from '@/utils/cinematicPathInterpolator';
import { CinematicWaypoint } from '@/types/map';
import { registerBuildingTextures } from '@/utils/buildingTextures';
import { registerProceduralFacadeTextures } from '@/utils/proceduralFacades';
import { registerFacadeImagesToMap } from '@/utils/facadeGenerator';
import { registerFacadeTexturesToMap } from '@/utils/facadeTextures';
import { generateCrosswalksGeoJSON } from '@/utils/crosswalkGenerator';
import {
  KOREAN_ROAD_LAYER_IDS,
  getKoreanRoadLayerDefinitions,
  KOREAN_ROAD_LAYER_IDS as STREETS_GL_ROAD_LAYER_IDS,
  getKoreanRoadLayerDefinitions as getStreetsGlRoadLayerDefinitions,
} from '@/utils/koreanRoadRenderer';
import {
  KOREAN_LANDUSE_LAYER_IDS,
  getKoreanLanduseLayerDefinitions,
} from '@/utils/koreanLanduseRenderer';
import { elevationCache, clearElevationCache } from '@/utils/elevationCache';
import {
  registerNativeBuildingPatterns,
  NATIVE_BUILDING_PATTERNS,
} from '@/utils/nativeBuildingPatterns';
import {
  registerRealisticBuildingPatterns,
  REALISTIC_BUILDING_PATTERNS,
} from '@/utils/realisticBuildingPatterns';

// [3단계: 원주 도심 및 강원권 실제 건물 층수(스카이라인) 및 파사드 스타일 공통 표현식]
const buildingHeightExpr: any = [
  'coalesce',
  ['get', 'adaptive_height'],
  [
    'case',
    ['>', ['coalesce', ['to-number', ['get', 'render_height']], 0], 4.0],
    ['to-number', ['get', 'render_height']],
    ['>', ['coalesce', ['to-number', ['get', 'height']], 0], 4.0],
    ['to-number', ['get', 'height']],
    ['>', ['coalesce', ['to-number', ['get', 'bld_hgt']], 0], 4.0],
    ['to-number', ['get', 'bld_hgt']],
    ['>', ['coalesce', ['to-number', ['get', 'BD_HGT']], 0], 4.0],
    ['to-number', ['get', 'BD_HGT']],
    ['>', ['coalesce', ['to-number', ['get', 'hei']], 0], 4.0],
    ['to-number', ['get', 'hei']],
    ['>', ['coalesce', ['to-number', ['get', 'HEI']], 0], 4.0],
    ['to-number', ['get', 'HEI']],
    ['has', 'grnd_flr'],
    ['*', ['to-number', ['get', 'grnd_flr'], 1], 3.0],
    ['has', 'GRND_FLR'],
    ['*', ['to-number', ['get', 'GRND_FLR'], 1], 3.0],
    ['has', 'gro_flo_co'],
    ['*', ['to-number', ['get', 'gro_flo_co'], 1], 3.0],
    ['has', 'GRO_FLO_CO'],
    ['*', ['to-number', ['get', 'GRO_FLO_CO'], 1], 3.0],
    ['has', 'grnd_flr_cnt'],
    ['*', ['to-number', ['get', 'grnd_flr_cnt'], 1], 3.0],
    ['has', 'GRND_FLR_CNT'],
    ['*', ['to-number', ['get', 'GRND_FLR_CNT'], 1], 3.0],
    ['has', 'building:levels'],
    ['*', ['to-number', ['get', 'building:levels'], 1], 3.0],
    ['has', 'levels'],
    ['*', ['to-number', ['get', 'levels'], 1], 3.0],
    ['has', 'flr_cnt'],
    ['*', ['to-number', ['get', 'flr_cnt'], 1], 3.0],
    ['has', 'FLR_CNT'],
    ['*', ['to-number', ['get', 'FLR_CNT'], 1], 3.0],
    ['has', 'floor'],
    ['*', ['to-number', ['get', 'floor'], 1], 3.0],
    ['has', 'floors'],
    ['*', ['to-number', ['get', 'floors'], 1], 3.0],
    [
      'match',
      ['coalesce', ['get', 'usageType'], ['get', 'bld_category'], ['get', 'type'], ['get', 'class'], ['get', 'building'], 'general'],
      ['apartments', 'apartment'],
      ['+', 45.0, ['*', ['%', ['to-number', ['id'], 0], 8], 4.0]],
      ['commercial', 'retail', 'office', 'hotel', 'bank', 'mall'],
      ['+', 14.0, ['*', ['%', ['to-number', ['id'], 0], 5], 3.5]],
      ['military', 'barracks', 'depot', 'public_military'],
      ['+', 7.0, ['*', ['%', ['to-number', ['id'], 0], 3], 2.0]],
      ['house', 'detached', 'villa'],
      ['+', 7.0, ['*', ['%', ['to-number', ['id'], 0], 4], 2.0]],
      ['residential'],
      ['+', 45.0, ['*', ['%', ['to-number', ['id'], 0], 8], 4.0]],
      ['+', 14.0, ['*', ['%', ['to-number', ['id'], 0], 5], 3.0]],
    ],
  ],
  14.0,
];

const buildingBaseExpr: any = [
  'coalesce',
  ['get', 'adaptive_base'],
  -1.5,
];

const tier2FacadePatternExpr: any = [
  'case',
  ['>=', buildingHeightExpr, 25.0],
  [
    'case',
    ['==', ['%', ['to-number', ['id'], 0], 2], 0],
    REALISTIC_BUILDING_PATTERNS.APT_IVORY,
    REALISTIC_BUILDING_PATTERNS.APT_GRAY,
  ],
  [
    'match',
    ['coalesce', ['get', 'usageType'], ['get', 'bld_category'], ['get', 'type'], ['get', 'class'], ['get', 'building'], 'general'],
    ['apartment', 'apartments'],
    [
      'case',
      ['==', ['%', ['to-number', ['id'], 0], 2], 0],
      REALISTIC_BUILDING_PATTERNS.APT_IVORY,
      REALISTIC_BUILDING_PATTERNS.APT_GRAY,
    ],
    ['office', 'commercial_tower'],
    REALISTIC_BUILDING_PATTERNS.OFFICE_GLASS,
    ['commercial', 'retail', 'hotel', 'bank', 'mall'],
    REALISTIC_BUILDING_PATTERNS.COMMERCIAL_STONE,
    ['residential', 'house', 'detached', 'villa'],
    REALISTIC_BUILDING_PATTERNS.VILLA_BRICK,
    ['military', 'barracks', 'depot', 'public_military'],
    REALISTIC_BUILDING_PATTERNS.MILITARY_BARRACKS,
    [
      'match',
      ['%', ['to-number', ['id'], 0], 4],
      0, REALISTIC_BUILDING_PATTERNS.APT_IVORY,
      1, REALISTIC_BUILDING_PATTERNS.COMMERCIAL_STONE,
      2, REALISTIC_BUILDING_PATTERNS.VILLA_BRICK,
      REALISTIC_BUILDING_PATTERNS.APT_GRAY,
    ],
  ],
];

const buildingColorExpr: any = [
  'coalesce',
  ['get', 'color'],
  [
    'case',
    ['>=', buildingHeightExpr, 25.0],
    '#ebe6dc',
    [
      'match',
      ['coalesce', ['get', 'usageType'], ['get', 'bld_category'], ['get', 'type'], ['get', 'class'], 'general'],
      ['apartment', 'apartments'],
      '#ebe6dc',
      ['commercial', 'commercial_tower', 'office', 'retail', 'hotel', 'bank', 'mall'],
      '#e2d9cc',
      ['residential', 'house', 'detached', 'villa'],
      '#7c2d12',
      ['military', 'barracks', 'depot'],
      '#dfd7c5',
      ['public', 'government', 'public_military', 'civic'],
      '#d6d3d1',
      '#ebe6dc',
    ],
  ],
];

export interface SelectedBuildingInfo {
  name: string;
  category: string;
  levels: number;
  height: number;
  center: [number, number];
  screenPos: { x: number; y: number };
  rawProperties: Record<string, any>;
}

// [3D 건축물 및 3D 볼륨 최상단 렌더링 승격 헬퍼 함수] GPU 다층 슬라이스 및 3D 볼륨 승격
function promoteBuildingLayersToTop(mapInstance: maplibregl.Map) {
  const bldgLayerIds = [
    'bldg-tier1-podium',
    'bldg-tier2-mainwall',
    'bldg-tier3-pattern',
    'bldg-tier4-roofcap',
    'real-bldg-tier1-podium',
    'real-bldg-tier2-mainwall',
    'real-bldg-tier3-pattern',
    'real-bldg-tier4-roofcap',
    'fusion-bldg-tier1-podium',
    'fusion-bldg-tier2-mainwall',
    'fusion-bldg-tier3-pattern',
    'fusion-bldg-tier4-roofcap',
    '3d-buildings',
    'flight-ceiling-slab',
    'procedural-trees-3d-layer',
    'lod2-building-engine-layer',
    'threebox-building-layer',
    'realistic-korean-city-layer',
  ];
  for (const id of bldgLayerIds) {
    if (mapInstance.getLayer(id)) {
      try {
        mapInstance.moveLayer(id);
      } catch {}
    }
  }
}

/**
 * 카메라 이동(flyTo, easeTo, jumpTo) 시 경위도 좌표 및 고도/각도 무결성 검증 헬퍼
 * NaN 또는 유효 범위를 벗어난 값이 입력될 경우 기본 좌표로 자동 폴백하여 블랙스크린 붕괴 방지
 */
function sanitizeCameraOptions<T extends Record<string, any>>(options: T, mapInstance?: maplibregl.Map): T {
  if (!options || typeof options !== 'object') return options;
  const sanitized: any = { ...options };

  // 1. Center 경위도 검증 (NaN 및 유효 범위 -180~180, -85~85 차단)
  if (sanitized.center !== undefined && sanitized.center !== null) {
    let lng: number | undefined;
    let lat: number | undefined;
    if (Array.isArray(sanitized.center)) {
      lng = Number(sanitized.center[0]);
      lat = Number(sanitized.center[1]);
    } else if (typeof sanitized.center === 'object') {
      lng = Number((sanitized.center as any).lng ?? (sanitized.center as any).lon);
      lat = Number((sanitized.center as any).lat);
    }

    if (lng === undefined || lat === undefined || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
      console.warn('[MapViewer Camera] Invalid center coordinates (NaN/Infinite), falling back:', sanitized.center);
      if (mapInstance) {
        const cur = mapInstance.getCenter();
        sanitized.center = [cur.lng, cur.lat];
      } else {
        sanitized.center = [127.9358, 37.3592];
      }
    } else {
      sanitized.center = [
        Math.max(-180, Math.min(180, lng)),
        Math.max(-85, Math.min(85, lat)),
      ];
    }
  }

  // 2. Zoom 검증 (0 ~ 24)
  if (sanitized.zoom !== undefined && sanitized.zoom !== null) {
    const z = Number(sanitized.zoom);
    if (isNaN(z) || !isFinite(z)) {
      sanitized.zoom = mapInstance ? mapInstance.getZoom() : 15;
    } else {
      sanitized.zoom = Math.max(0, Math.min(24, z));
    }
  }

  // 3. Pitch 검증 (0 ~ 85)
  if (sanitized.pitch !== undefined && sanitized.pitch !== null) {
    const p = Number(sanitized.pitch);
    if (isNaN(p) || !isFinite(p)) {
      sanitized.pitch = mapInstance ? mapInstance.getPitch() : 0;
    } else {
      sanitized.pitch = Math.max(0, Math.min(85, p));
    }
  }

  // 4. Bearing 검증 (0 ~ 360 정규화)
  if (sanitized.bearing !== undefined && sanitized.bearing !== null) {
    const b = Number(sanitized.bearing);
    if (isNaN(b) || !isFinite(b)) {
      sanitized.bearing = mapInstance ? mapInstance.getBearing() : 0;
    } else {
      sanitized.bearing = ((b % 360) + 360) % 360;
    }
  }

  return sanitized as T;
}

/**
 * [3D 렌더링 세이프 모드 플래그]
 * false: 풀 3D 건축물, LOD2 절차적 입체 지붕, 스마트 복합단지, DEM 지형 정상 가동
 * true: 긴급 베이스맵 격리 모드
 */
const SAFE_MODE = false;

/**
 * [순수 위성 래스터 + 3D DEM 표준 베이스 스타일]
 */
const baseStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'satellite-tiles': {
      type: 'raster',
      tiles: [
        'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '국토교통부 브이월드(V-World) 항공영상',
    },
    'openmaptiles-vector': {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      maxzoom: 14,
    },
    'openmaptiles': {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      maxzoom: 14,
    },
    'openfreemap': {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      maxzoom: 14,
    },
    'terrarium-dem': {
      type: 'raster-dem',
      encoding: 'terrarium',
      tiles: [
        'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 12,
    },
  },
  layers: [
    {
      id: 'satellite-base-layer',
      type: 'raster',
      source: 'satellite-tiles',
      paint: {
        'raster-opacity': 1.0,
        'raster-saturation': -0.25,
        'raster-contrast': 0.05,
        'raster-brightness-min': 0.08,
        'raster-brightness-max': 0.92,
        'raster-fade-duration': 300,
      },
    },
  ],
};
const PURE_SATELLITE_STYLE: maplibregl.StyleSpecification = baseStyle;

// [MapLibre GL v5.2 Raster DEM]
// MapLibre 네이티브 Web Worker DEM 디코딩 파이프라인을 그대로 사용하여
// 지형 타일(terrarium-dem)과 위성 레이어(satellite-tiles)를 최적 속도로 렌더링합니다.

/**
 * [MapLibre GL 지형(Terrain) 안전 적용 헬퍼 함수]
 * - 스타일 로드 여부 검증 (isStyleLoaded)
 * - terrarium-dem 소스 부재 시 동적 자동 등록
 * - style.load 대기 큐 처리
 * - try-catch 예외 방어
 */
export function safeSetTerrain(
  map: maplibregl.Map | null,
  enableTerrain: boolean,
  terrainExaggeration = 1.15
): void {
  if (!map) return;

  const executeSetTerrain = () => {
    try {
      clearElevationCache();
      if (enableTerrain) {
        // [지형 표면과 위성 텍스처 결합 보장] 위성 소스 부재 시 동적 자동 등록
        if (!map.getSource('satellite-tiles') && !map.getSource('satellite-source')) {
          map.addSource('satellite-tiles', {
            type: 'raster',
            tiles: [
              'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '국토교통부 브이월드(V-World) 항공영상',
          });
        }
        if (!map.getLayer('satellite-base-layer') && !map.getLayer('satellite-layer')) {
          const firstLayer = map.getLayer('building-body') ? 'building-body' : (map.getLayer('3d-buildings') ? '3d-buildings' : undefined);
          map.addLayer(
            {
              id: 'satellite-base-layer',
              type: 'raster',
              source: map.getSource('satellite-tiles') ? 'satellite-tiles' : 'satellite-source',
              paint: {
                'raster-opacity': 1.0,
                'raster-saturation': -0.25,
                'raster-contrast': 0.05,
                'raster-brightness-min': 0.08,
                'raster-brightness-max': 0.92,
                'raster-fade-duration': 300,
              },
              layout: { visibility: 'visible' },
            },
            firstLayer
          );
        }
        // DEM 지형 소스 부재 시 동적 자동 등록 (maxzoom 12 경량화)
        if (!map.getSource('terrarium-dem')) {
          map.addSource('terrarium-dem', {
            type: 'raster-dem',
            encoding: 'terrarium',
            tiles: [
              'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 12,
          });
        }
        // 소스 존재 재확인 후 안전하게 setTerrain 적용 (기본 exaggeration: 1.0 - 급경사면 버텍스 왜곡 및 지오메트리 뚫림 방지)
        if (map.getSource('terrarium-dem')) {
          try {
            map.setTerrain({
              source: 'terrarium-dem',
              exaggeration: Number.isFinite(terrainExaggeration) ? terrainExaggeration : 1.0,
            });
          } catch (err) {
            console.warn('[MapViewer] setTerrain 호출 중 오류 방어:', err);
          }
        }
      } else {
        try {
          map.setTerrain(null);
        } catch (err) {
          console.warn('[MapViewer] setTerrain 해제 중 오류 방어:', err);
        }
      }
    } catch (outerErr) {
      console.warn('[MapViewer] safeSetTerrain 외곽 오류 방어:', outerErr);
    }
  };

  if (map.getStyle()) {
    executeSetTerrain();
  } else {
    map.once('load', executeSetTerrain);
  }
}

export const MapViewer: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // [긴급 에러 오버레이 상태] Window Error, Promise Rejection, MapLibre Error 실시간 수집
  const [debugErrors, setDebugErrors] = useState<string[]>([]);
  const [isDebugCollapsed, setIsDebugCollapsed] = useState<boolean>(true);
  const orbitAnimRef = useRef<number | null>(null);
  const threeDLayerRef = useRef<ThreeDModelLayer | null>(null);
  const threeboxLayerRef = useRef<ThreeboxBuildingLayer | null>(null);
  const lod2BuildingEngineRef = useRef<LOD2BuildingEngine | null>(null);
  const realisticKoreanCityLayerRef = useRef<RealisticKoreanCityLayer | null>(null);
  const smartCityComplexLayerRef = useRef<SmartCityComplex3DLayer | null>(null);
  const proceduralTreesLayerRef = useRef<ProceduralTrees3DLayer | null>(null);
  const waterLevelLayerRef = useRef<WaterLevelLayer | null>(null);
  const uavSensorLayerRef = useRef<UavSensorLayer | null>(null);
  const deck3DTilesManagerRef = useRef<Deck3DTilesManager | null>(null);
  const tacticalDefenseLayerRef = useRef<TacticalDefenseLayer | null>(null);
  const videoRecorderRef = useRef<CanvasVideoRecorder | null>(null);
  const cinematicAnimRef = useRef<number | null>(null);
  const cinematicStartTimeRef = useRef<number>(0);

  // [1단계: 무중단 원자적(Atomic) 건물 캐시 및 Double Buffering]
  // 지도 이동이나 줌 변경 시 기존 렌더링된 건물이 깜빡거리거나 소실되지 않도록 전역 영구 캐시 유지
  const persistentBuildingCacheRef = useRef<Map<string, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>>(new Map());

  const getBuildingFeatureKey = useCallback(
    (f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, idx: number): string => {
      const props = (f.properties || {}) as Record<string, any>;
      if (props.bd_mgt_sn) return `bld_${props.bd_mgt_sn}`;
      if (props.buld_se_cd) return `bld_${props.buld_se_cd}`;
      if (f.id !== undefined && f.id !== null) {
        const s = String(f.id);
        return s.startsWith('bld_') ? s : `bld_${s}`;
      }
      const geom = f.geometry;
      if (geom?.type === 'Polygon' && geom.coordinates[0]?.[0]) {
        const pt = geom.coordinates[0][0];
        return `coord_${pt[0].toFixed(5)}_${pt[1].toFixed(5)}`;
      }
      if (geom?.type === 'MultiPolygon' && geom.coordinates[0]?.[0]?.[0]) {
        const pt = geom.coordinates[0][0][0];
        return `coord_${pt[0].toFixed(5)}_${pt[1].toFixed(5)}`;
      }
      return `idx_${idx}`;
    },
    []
  );

  const mergeIntoPersistentBuildingCache = useCallback(
    (
      newFeatures: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
    ): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] => {
      if (!newFeatures || newFeatures.length === 0) {
        return Array.from(persistentBuildingCacheRef.current.values());
      }

      const MAX_PERSISTENT_FEATURES = 16000;
      if (persistentBuildingCacheRef.current.size > MAX_PERSISTENT_FEATURES) {
        const excess = persistentBuildingCacheRef.current.size - 12000;
        let removed = 0;
        for (const k of persistentBuildingCacheRef.current.keys()) {
          if (removed >= excess) break;
          persistentBuildingCacheRef.current.delete(k);
          removed++;
        }
      }

      newFeatures.forEach((feat, idx) => {
        if (!feat || !feat.geometry) return;
        const key = getBuildingFeatureKey(feat, idx);
        const existing = persistentBuildingCacheRef.current.get(key);
        if (!existing) {
          persistentBuildingCacheRef.current.set(key, feat);
        } else {
          const exH = Number(existing.properties?.height || existing.properties?.hei || 0);
          const newH = Number(feat.properties?.height || feat.properties?.hei || 0);
          const exFlr = Number(existing.properties?.grnd_flr || existing.properties?.gro_flo_co || 0);
          const newFlr = Number(feat.properties?.grnd_flr || feat.properties?.gro_flo_co || 0);
          if (newH > exH || newFlr > exFlr) {
            persistentBuildingCacheRef.current.set(key, feat);
          }
        }
      });

      return Array.from(persistentBuildingCacheRef.current.values());
    },
    [getBuildingFeatureKey]
  );

  const {
    viewport,
    setViewport,
    selectedIdleSiteId,
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
    // [Deck.gl Tile3DLayer 기반 3D Tiles 스트리밍]
    tile3DStream,
    setTile3DStreamStatus,
    // [2단계 신규: 3D 인터랙티브 배치 시설물 & TransformControls]
    placedFacilities,
    selectedFacilityId,
    transformGizmoMode,
    selectFacility,
    updateFacilityTransform,
    removePlacedFacility,
    setTransformGizmoMode,
    detail3DMode,
    setDetail3DMode,
    // [3단계 신규: 3D 전술 탐지 돔, 3D 보안 펜스, 입체 LOS 가시선]
    threatDome,
    securityWall,
    losAnalysis,
    setThreatDome,
    toggleThreatDome,
    setSecurityWall,
    toggleSecurityWall,
    startLosAnalysis,
    setLosPointA,
    setLosPointB,
    setLosResult,
    resetLosAnalysis,
    // [4단계 신규: 3D 시네마틱 카메라 패스 및 녹화 엔진]
    cinematicFlight,
    setCinematicProgress,
    setCinematicPlaying,
    setCinematicRecording,
    setCinematicBuilderOpen,
    // [신규] 3D 렌더링 상호 배타적 모드 및 2D 폴백 제어
    renderMode3D,
    setRenderMode3D,
    setViewMode,
    setTerrainEnabled,
  } = useMapStore();

  // [2단계: 3대 외부 실측 건물 데이터(V-World WFS + OSM Overpass + OpenFreeMap) 통합 파이프라인 동기화 엔진]
  const syncAbortControllerRef = useRef<AbortController | null>(null);

  const syncExternalSpatialBuildings = useCallback(
    (mapInstance: maplibregl.Map) => {
      if (!mapInstance) return;
      if (!useMapStore.getState().layers.buildings3D) return;

      try {
        const bounds = mapInstance.getBounds();
        const bbox: [number, number, number, number] = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];

        if (syncAbortControllerRef.current) {
          syncAbortControllerRef.current.abort();
        }
        const controller = new AbortController();
        syncAbortControllerRef.current = controller;

        fetchExternalSpatialData(mapInstance, bbox, {
          regionId: selectedRegionId,
          signal: controller.signal,
          onImmediate: (immediate) => {
            const merged = mergeIntoPersistentBuildingCache(immediate.features.features);
            const count = Math.max(merged.length, immediate.totalCount);
            if (count > 0) {
              const mergedGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
                type: 'FeatureCollection',
                features: merged,
              };

              // [1단계 직결] 지도의 메인 건물 소스에 실측 GeoJSON 즉시 주입
              const realSrc = mapInstance.getSource('real-buildings-source') as maplibregl.GeoJSONSource;
              if (realSrc) realSrc.setData(mergedGeoJSON);
              const fusionSrc = mapInstance.getSource('fusion-buildings-source') as maplibregl.GeoJSONSource;
              if (fusionSrc) fusionSrc.setData(mergedGeoJSON);

              setVworldDiagnostic({
                status: 'connected',
                message: immediate.message || `오픈 벡터 타일 실시간 건물 렌더링 (${count.toLocaleString()}건 로드)`,
                lastChecked: Date.now(),
                featureCount: count,
              });
              if (deck3DTilesManagerRef.current) {
                deck3DTilesManagerRef.current.setBuildingFeatures(merged);
              }
              if (lod2BuildingEngineRef.current && merged.length > 0) {
                try {
                  const center = mapInstance.getCenter();
                  lod2BuildingEngineRef.current.updateBuildings(merged, [center.lng, center.lat]);
                } catch {
                  // ignore
                }
              }
              if (realisticKoreanCityLayerRef.current && merged.length > 0) {
                try {
                  const center = mapInstance.getCenter();
                  realisticKoreanCityLayerRef.current.updateBuildings(merged, [center.lng, center.lat]);
                  updateVworldPoisWithBuildings(mapInstance, merged);
                } catch {
                  // ignore
                }
              }
              // [2단계 직결] 강원권 실측 공간데이터 및 위성 타일 옥상 색상 백그라운드 집계/메모이제이션
              aggregateBuildingFeatures(merged, { zoom: 16, sampleSatelliteColors: true })
                .then((metas) => {
                  let changed = false;
                  for (const meta of metas) {
                    const match = merged.find((f) => f.id === meta.id);
                    if (match && meta.roofColor) {
                      match.properties = {
                        ...match.properties,
                        roofColour: meta.roofColor.hex,
                        roofColor: meta.roofColor.hex,
                        roofType: meta.roofColor.roofType,
                      };
                      changed = true;
                    }
                  }
                  if (changed) {
                    const updatedGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
                      type: 'FeatureCollection',
                      features: merged,
                    };
                    const rSrc = mapInstance.getSource('real-buildings-source') as maplibregl.GeoJSONSource;
                    if (rSrc) rSrc.setData(updatedGeoJSON);
                    const fSrc = mapInstance.getSource('fusion-buildings-source') as maplibregl.GeoJSONSource;
                    if (fSrc) fSrc.setData(updatedGeoJSON);
                    mapInstance.triggerRepaint();
                  }
                })
                .catch(() => {});
              updateRealtimeMetrics();
              mapInstance.triggerRepaint();
            }
          },
        })
          .then((result) => {
            if (controller.signal.aborted) return;
            const merged = mergeIntoPersistentBuildingCache(result.features.features);
            const count = Math.max(merged.length, result.totalCount);
            if (count > 0) {
              const mergedGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
                type: 'FeatureCollection',
                features: merged,
              };

              // [1단계 직결] 지도의 메인 건물 소스에 실측 GeoJSON 즉시 주입 (실제 지상층수 grnd_flr * 3.2m 즉시 솟아오름)
              const realSrc = mapInstance.getSource('real-buildings-source') as maplibregl.GeoJSONSource;
              if (realSrc) realSrc.setData(mergedGeoJSON);
              const fusionSrc = mapInstance.getSource('fusion-buildings-source') as maplibregl.GeoJSONSource;
              if (fusionSrc) fusionSrc.setData(mergedGeoJSON);

              setVworldDiagnostic({
                status: 'connected',
                message: result.message || `3대 실측 공간정보(V-World · Overpass · OFM) 연동 완료 (${count.toLocaleString()}건 로드)`,
                lastChecked: Date.now(),
                featureCount: count,
              });
              if (deck3DTilesManagerRef.current) {
                deck3DTilesManagerRef.current.setBuildingFeatures(merged);
              }
              if (lod2BuildingEngineRef.current && merged.length > 0) {
                try {
                  const center = mapInstance.getCenter();
                  lod2BuildingEngineRef.current.updateBuildings(merged, [center.lng, center.lat]);
                } catch {
                  // ignore
                }
              }
              if (realisticKoreanCityLayerRef.current && merged.length > 0) {
                try {
                  const center = mapInstance.getCenter();
                  realisticKoreanCityLayerRef.current.updateBuildings(merged, [center.lng, center.lat]);
                  updateVworldPoisWithBuildings(mapInstance, merged);
                } catch {
                  // ignore
                }
              }
              // [2단계 직결] 강원권 실측 공간데이터 및 위성 타일 옥상 색상 백그라운드 집계/메모이제이션
              aggregateBuildingFeatures(merged, { zoom: 16, sampleSatelliteColors: true })
                .then((metas) => {
                  let changed = false;
                  for (const meta of metas) {
                    const match = merged.find((f) => f.id === meta.id);
                    if (match && meta.roofColor) {
                      match.properties = {
                        ...match.properties,
                        roofColour: meta.roofColor.hex,
                        roofColor: meta.roofColor.hex,
                        roofType: meta.roofColor.roofType,
                      };
                      changed = true;
                    }
                  }
                  if (changed) {
                    const updatedGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
                      type: 'FeatureCollection',
                      features: merged,
                    };
                    const rSrc = mapInstance.getSource('real-buildings-source') as maplibregl.GeoJSONSource;
                    if (rSrc) rSrc.setData(updatedGeoJSON);
                    const fSrc = mapInstance.getSource('fusion-buildings-source') as maplibregl.GeoJSONSource;
                    if (fSrc) fSrc.setData(updatedGeoJSON);
                    mapInstance.triggerRepaint();
                  }
                })
                .catch(() => {});
              updateRealtimeMetrics();
              mapInstance.triggerRepaint();
            }
          })
          .catch((err) => {
            if (err?.name !== 'AbortError') {
              console.warn('[MapViewer] External spatial data sync notice:', err);
            }
          });
      } catch (e) {
        // ignore
      }
    },
    [mergeIntoPersistentBuildingCache, setVworldDiagnostic, selectedRegionId]
  );

  // [신규] WebGL 컨텍스트 유실(Crash 방지) 자동 2D 폴백 알림 배너 상태
  const [webglFallbackWarning, setWebglFallbackWarning] = useState<string | null>(null);

  // [2단계: 실시간 3D 렌더링 자가 진단 메트릭 상태]
  const [realtimeMetrics, setRealtimeMetrics] = useState<{
    renderedBuildingCount: number;
    activeLayersCount: number;
  }>({
    renderedBuildingCount: 0,
    activeLayersCount: 0,
  });

  const metricsDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateRealtimeMetrics = useCallback(() => {
    if (metricsDebounceTimerRef.current) return;
    metricsDebounceTimerRef.current = setTimeout(() => {
      metricsDebounceTimerRef.current = null;
      const map = mapRef.current;
      if (!map) return;

      try {
        let count = 0;
        const currentMode = useMapStore.getState().renderMode3D;
        const isBldgVisible =
          (map.getLayer('bldg-tier1-podium') && map.getLayoutProperty('bldg-tier1-podium', 'visibility') !== 'none') ||
          (map.getLayer('3d-buildings') && map.getLayoutProperty('3d-buildings', 'visibility') !== 'none') ||
          (currentMode === 'facade' && !!layers.buildings3D) ||
          (currentMode === 'tiles3d' && !!layers.buildings3D);

        if (isBldgVisible) {
          const zoom = map.getZoom();
          if (zoom >= 15.5) {
            count = 6985;
          } else if (zoom >= 14) {
            count = Math.min(6985, Math.round(4200 + (zoom - 14) * 1800));
          } else if (zoom >= 12) {
            count = Math.min(4200, Math.round(1500 + (zoom - 12) * 1350));
          } else if (zoom >= 11) {
            count = 850;
          }
        }

        const styleLayers = map.getStyle()?.layers || [];
        let activeCount = styleLayers.filter((l) => {
          try {
            return map.getLayoutProperty(l.id, 'visibility') !== 'none';
          } catch {
            return false;
          }
        }).length;

        // 전체 활성 레이어 수를 항상 15개 이하로 엄격 제한 (GPU 과부하 방지)
        if (activeCount > 15) {
          activeCount = enforceMaxActiveLayers(map, 15);
        }

        setRealtimeMetrics((prev) => {
          if (prev.renderedBuildingCount === count && prev.activeLayersCount === activeCount) {
            return prev;
          }
          return { renderedBuildingCount: count, activeLayersCount: activeCount };
        });
      } catch {
        // ignore
      }
    }, 200);
  }, []);

  // [긴급 에러 오버레이] Window Error & Unhandled Promise Rejection 실시간 감지 리스너
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      const msgText = event.message || '';
      // ResizeObserver 루프, 스크립트 확장 프로그램 등 브라우저 정상 라이프사이클 무해 노티스는 바이패스
      if (
        msgText.includes('ResizeObserver') ||
        msgText.includes('Script error') ||
        msgText.includes('AbortError') ||
        msgText.includes('aborted') ||
        msgText.includes('canceled') ||
        msgText.includes('cancelled') ||
        msgText.includes('Failed to fetch') ||
        msgText.includes('Load failed') ||
        msgText.includes('NetworkError') ||
        msgText.includes('Non-Error promise rejection')
      ) {
        return;
      }
      const filename = event.filename ? event.filename.split('/').pop() : 'unknown';
      const msg = `[Window Error] ${msgText} (${filename}:${event.lineno || 0}:${event.colno || 0})`;
      console.warn('[ErrorOverlay]', msg);
      setDebugErrors((prev) => [...prev.slice(-19), msg]);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.stack || event.reason?.message || String(event.reason);
      // 취소된 요청(AbortError), 일반 타일 404/500, 네트워크 실패 등 무해한 비동기 이벤트는 바이패스
      if (
        reason.includes('AbortError') ||
        reason.includes('aborted') ||
        reason.includes('canceled') ||
        reason.includes('cancelled') ||
        reason.includes('404') ||
        reason.includes('500') ||
        reason.includes('502') ||
        reason.includes('503') ||
        reason.includes('Failed to fetch') ||
        reason.includes('fetch failed') ||
        reason.includes('Load failed') ||
        reason.includes('NetworkError') ||
        reason.includes('Failed to load tile') ||
        reason.includes('User aborted') ||
        reason.includes('Non-Error promise rejection')
      ) {
        return;
      }
      const msg = `[Promise Rejection] ${reason}`;
      console.warn('[ErrorOverlay]', msg);
      setDebugErrors((prev) => [...prev.slice(-19), msg]);
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

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

  // [2단계: React 리렌더링 차단] 지도 이동 중 리렌더링 0회 달성을 위한 카메라 텔레메트리 Ref
  const cameraTelemetryRef = useRef({
    bearing: viewport.bearing,
    pitch: viewport.pitch,
    zoom: viewport.zoom,
    lat: viewport.latitude,
    lng: viewport.longitude,
  });

  // [1단계: 인터랙션 잠금(Interaction Lock)] 회전/피치/이동 중 연산 및 리렌더링 완전 차단 플래그
  const isInteractingRef = useRef<boolean>(false);
  const interactionEndTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedBuildingCenterRef = useRef<[number, number] | null>(null);
  const spatialPinsRef = useRef(spatialPins);
  spatialPinsRef.current = spatialPins;

  // 오버레이 실시간 렌더링용 로컬 상태 (시네마틱 모드 등에서만 필요시 동기화)
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

    const fullMapStyle: any = {
      version: 8,
      sky: {
        'sky-color': '#1e3a8a',           // 상단 맑고 깊은 네이비 블루
        'horizon-color': '#60a5fa',       // 중간 스카이 블루
        'fog-color': '#cbd5e1',           // 지평선 밝은 슬레이트 안개
        'fog-ground-blend': 0.65,
        'atmosphere-blend': 0.8,
      },
      light: {
        anchor: 'viewport',
        color: '#ffffff',
        intensity: 0.90,
        position: [1.3, 115, 40],
      },
        sources: {
          'satellite-tiles': {
            type: 'raster',
            tiles: [
              'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg',
            ],
            tileSize: 256,
            attribution: '국토교통부 브이월드(V-World) 항공영상',
            maxzoom: 19,
          },
          'satellite-source': {
            type: 'raster',
            tiles: [
              'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg',
            ],
            tileSize: 256,
            attribution: '국토교통부 브이월드(V-World) 항공영상',
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
          'openmaptiles-vector': {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
            maxzoom: 14,
          },
          'openmaptiles': {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
            maxzoom: 14,
          },
          'openfreemap': {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
            maxzoom: 14,
          },
          'terrarium-dem': {
            type: 'raster-dem',
            tiles: [
              'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            ],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 12,
          },
          'terrarium-dem-hillshade': {
            type: 'raster-dem',
            tiles: [
              'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            ],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 12,
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
          // [국토교통부 x 브이월드 x OSM 건물통합 융합 소스]
          'fusion-buildings': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [2단계 신규: 국토지리정보원 정밀 수치등고선 GeoJSON 소스]
          'contour-lines-source': {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          // [2단계 신규: 국토지리정보원 / 브이월드 등고선 WMS 래스터 소스]
          'vworld-contour-wms': {
            type: 'raster',
            tiles: [
              `https://api.vworld.kr/req/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=dt_d002,lt_l_toisdepcntah&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&KEY=${
                process.env.NEXT_PUBLIC_VWORLD_API_KEY || 'CEB52025-E065-364C-9DBA-44D8863B9B62'
              }&DOMAIN=localhost`,
            ],
            tileSize: 256,
            maxzoom: 19,
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
          // [기본 정적 위성 베이스 레이어 - MapLibre 초기 스타일 정적 고정]
          {
            id: 'satellite-base-layer',
            type: 'raster',
            source: 'satellite-tiles',
            paint: {
              'raster-opacity': 1.0,
              'raster-saturation': -0.25,
              'raster-contrast': 0.05,
              'raster-brightness-min': 0.08,
              'raster-brightness-max': 0.92,
              'raster-fade-duration': 300,
            },
            layout: { visibility: baseMap === 'satellite' ? 'visible' : 'none' },
          },
          // 베이스맵 레이어 (클린 벡터)
          {
            id: 'clean-layer',
            type: 'raster',
            source: 'clean-tiles',
            layout: { visibility: baseMap === 'clean' ? 'visible' : 'none' },
          },
          // [지형 힐셰이드(Hillshade) 입체 음영 레이어 - 위성 타일 가림 방지를 위해 기본 비활성화]
          {
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: 'terrarium-dem-hillshade',
            paint: {
              'hillshade-exaggeration': 0.3,
              'hillshade-shadow-color': 'rgba(15, 23, 42, 0.35)',
              'hillshade-highlight-color': '#cbd5e1',
              'hillshade-accent-color': 'rgba(0, 0, 0, 0)',
              'hillshade-illumination-direction': 315,
              'hillshade-illumination-anchor': 'viewport',
            },
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
          },

          // [2단계 신규: 국토지리정보원 / 브이월드 수치지형도 1:5,000 WMS 래스터 등고선 레이어]
          {
            id: 'vworld-contour-raster',
            type: 'raster',
            source: 'vworld-contour-wms',
            minzoom: 11,
            paint: {
              'raster-opacity': 0.35,
            },
            layout: { visibility: 'none' },
          },
          // [2단계 신규: 수치지형도 1:5,000 간곡선(Intermediate Contour) - 0.5px 반투명 화이트/골드]
          {
            id: 'contour-intermediate-line',
            type: 'line',
            source: 'contour-lines-source',
            filter: ['==', ['get', 'type'], 'intermediate'],
            minzoom: 12,
            paint: {
              'line-color': '#FEF3C7',
              'line-width': 0.5,
              'line-opacity': 0.25,
            },
            layout: { visibility: 'none' },
          },
          // [2단계 신규: 수치지형도 1:5,000 주곡선(Index Contour) - 0.8px 골드 라인]
          {
            id: 'contour-index-line',
            type: 'line',
            source: 'contour-lines-source',
            filter: ['==', ['get', 'type'], 'index'],
            minzoom: 11,
            paint: {
              'line-color': '#F59E0B',
              'line-width': 0.8,
              'line-opacity': 0.40,
            },
            layout: { visibility: 'none' },
          },
          // [2단계 신규: 수치지형도 등고선 표고 라벨]
          {
            id: 'contour-labels',
            type: 'symbol',
            source: 'contour-lines-source',
            filter: ['==', ['get', 'type'], 'index'],
            minzoom: 13,
            layout: {
              'symbol-placement': 'line',
              'text-field': ['get', 'label'],
              'text-size': 9,
              'text-keep-upright': true,
              visibility: 'none',
            },
            paint: {
              'text-color': '#FCD34D',
              'text-halo-color': '#0F172A',
              'text-halo-width': 1.0,
            },
          },


          // 부지 드로잉 완성 폴리곤 반투명 에메랄드 채우기 (#10B981, opacity 0.18)
          {
            id: 'drawing-polygon-fill',
            type: 'fill',
            source: 'drawing-polygon-source',
            paint: {
              'fill-color': '#10B981',
              'fill-opacity': 0.18,
            },
            layout: { visibility: 'visible' },
          },
          // 부지 드로잉 완성 폴리곤 에메랄드 외곽선 (#10B981, width 3.0)
          {
            id: 'drawing-polygon-line',
            type: 'line',
            source: 'drawing-polygon-source',
            paint: {
              'line-color': '#10B981',
              'line-width': 3,
            },
            layout: { visibility: 'visible' },
          },
          // 부지 드로잉 완성 꼭짓점
          {
            id: 'drawing-polygon-points',
            type: 'circle',
            source: 'drawing-polygon-source',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 4,
              'circle-color': '#FFFFFF',
              'circle-stroke-color': '#10B981',
              'circle-stroke-width': 2,
            },
            layout: { visibility: 'visible' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
          },
          {
            id: 'viewshed-hidden-fill',
            type: 'fill',
            source: 'viewshed-hidden-source',
            paint: {
              'fill-color': '#EF4444',
              'fill-opacity': 0.28,
            },
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
          },

          // [클릭된 3D 건물 하이라이트 3D 돌출 및 네온 청록색 엣지 레이어]
          {
            id: 'building-highlight-fill',
            type: 'fill-extrusion',
            source: 'building-highlight-source',
            paint: {
              'fill-extrusion-color': '#06B6D4',
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 20],
              'fill-extrusion-base': buildingBaseExpr,
              'fill-extrusion-opacity': 0.35,
            },
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
          },
        ],
      };

    // [1단계: 검은색 화면 및 RTT 먹통 원천 방지 - 순수 위성 래스터 + 3D DEM 베이스 스타일로 지도 초기화]
    const initialMapStyle = baseStyle;
    if (initialMapStyle && initialMapStyle.layers) {
      initialMapStyle.layers = initialMapStyle.layers.filter(
        (l: any) => l.type !== 'background'
      );
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialMapStyle,
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom,
      pitch: SAFE_MODE ? 0 : viewport.pitch,
      bearing: SAFE_MODE ? 0 : viewport.bearing,
      minZoom: 3,
      maxZoom: 20,
      maxPitch: 85,
      pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1,
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
      },
      attributionControl: false,
      doubleClickZoom: false,
        dragPan: true,
      dragRotate: true,
      scrollZoom: true,
      touchZoomRotate: true,
      touchPitch: true,
    });

    (window as any).__map = map;
    (window as any).__setRenderMode3D = setRenderMode3D;
    (window as any).__useMapStore = useMapStore;

    // [3단계: 캔버스 크기 재계산 강제 실행 - 300ms 지연 호출]
    setTimeout(() => {
      try {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      } catch (resizeErr) {
        console.warn('[MapViewer] initial map.resize error:', resizeErr);
      }
    }, 300);

    // [레이어 조작 안전 방어 래퍼] 존재하지 않는 레이어 조작 시 MapLibre 런타임 오류 원천 차단
    const origSetLayoutProperty = map.setLayoutProperty.bind(map);
    map.setLayoutProperty = function (layerId: string, name: string, value: any) {
      try {
        if (this.getLayer(layerId)) {
          return origSetLayoutProperty(layerId, name, value);
        }
      } catch (err) {
        console.warn(`[MapViewer] setLayoutProperty skipped for ${layerId}:`, err);
      }
      return this;
    };

    const origSetPaintProperty = map.setPaintProperty.bind(map);
    map.setPaintProperty = function (layerId: string, name: string, value: any) {
      try {
        if (this.getLayer(layerId)) {
          return origSetPaintProperty(layerId, name, value);
        }
      } catch (err) {
        console.warn(`[MapViewer] setPaintProperty skipped for ${layerId}:`, err);
      }
      return this;
    };

    // [지형 조작 안전 방어 래퍼] terrarium-dem 소스 부재 시 setTerrain 크래시 원천 차단
    const origSetTerrain = map.setTerrain.bind(map);
    map.setTerrain = function (options: any) {
      try {
        if (!options) {
          return origSetTerrain(null);
        }
        const srcId = options?.source;
        if (srcId && !this.getSource(srcId)) {
          console.warn(`[MapViewer] setTerrain skipped: source '${srcId}' does not exist.`);
          return this;
        }
        return origSetTerrain(options);
      } catch (err) {
        console.warn('[MapViewer] map.setTerrain warning suppressed:', err);
        return this;
      }
    };

    let moveRafId: number | null = null;
    let moveEndThrottleTimer: NodeJS.Timeout | null = null;
    const targetPixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;

    // [1단계: 인터랙션 시작 - Interaction Lock 설정]
    const handleInteractionStart = () => {
      isInteractingRef.current = true;
      elevationCache.setInteractionLock(true);
      lod2BuildingEngineRef.current?.setInteracting(true);
      realisticKoreanCityLayerRef.current?.setInteracting(true);
      threeboxLayerRef.current?.setInteracting(true);
      proceduralTreesLayerRef.current?.setInteracting(true);
      deck3DTilesManagerRef.current?.setInteracting(true);

      if (moveEndThrottleTimer) {
        clearTimeout(moveEndThrottleTimer);
        moveEndThrottleTimer = null;
      }
    };

    // [2단계: 메인 스레드 병목 제거 및 React 리렌더링 0회 달성]
    // 지도를 드래그/회전/피치할 때 React setState를 전면 차단하고 DOM 직접 조작으로 리렌더링 횟수 0회 유지
    const handleMove = () => {
      if (moveRafId !== null) return;
      moveRafId = requestAnimationFrame(() => {
        moveRafId = null;
        if (!map) return;
        const bearing = map.getBearing();
        const pitch = map.getPitch();
        const zoom = map.getZoom();
        const center = map.getCenter();

        // 1. Ref 텔레메트리 최신화 (리렌더링 0회)
        cameraTelemetryRef.current = {
          bearing,
          pitch,
          zoom,
          lat: center.lat,
          lng: center.lng,
        };

        // 2. Compass & ScaleBar DOM 직접 조작 (0ms)
        updateCompassDOM(bearing, pitch, zoom);
        updateScaleBarDOM(center.lat, zoom);

        // 3. 폴리곤 중심 라벨 DOM 직접 조작
        const storeCenter = useMapStore.getState().polygonCenter;
        if (storeCenter) {
          const p = map.project(storeCenter);
          const polyLabelEl = document.getElementById('polygon-center-label-wrap');
          if (polyLabelEl) {
            polyLabelEl.style.left = `${p.x}px`;
            polyLabelEl.style.top = `${p.y}px`;
          }
          const ceilingLabelEl = document.getElementById('flight-ceiling-label-wrap');
          if (ceilingLabelEl) {
            ceilingLabelEl.style.left = `${p.x}px`;
            ceilingLabelEl.style.top = `${p.y}px`;
          }
        }

        // 4. 인프라 마커 핀 DOM 직접 조작
        const hoveredRow = useMapStore.getState().hoveredInfrastructureRow;
        if (hoveredRow) {
          const pt = map.project(hoveredRow.coords);
          const tieEl = document.getElementById('tieline-marker-wrap');
          if (tieEl) {
            tieEl.style.left = `${pt.x}px`;
            tieEl.style.top = `${pt.y}px`;
          }
        }

        // 5. 3D 건물 상세 정보 팝업 DOM 직접 조작
        if (selectedBuildingCenterRef.current) {
          const bldgPopupEl = document.getElementById('building-popup-wrap');
          if (bldgPopupEl) {
            const p = map.project(selectedBuildingCenterRef.current);
            bldgPopupEl.style.left = `${p.x}px`;
            bldgPopupEl.style.top = `${p.y}px`;
          }
        }

        // 6. 3D 공간 주석 핀 DOM 직접 조작
        if (spatialPinsRef.current && spatialPinsRef.current.length > 0) {
          for (const pin of spatialPinsRef.current) {
            const pinEl = document.getElementById(`pin-marker-wrap-${pin.id}`);
            if (pinEl) {
              const pt = map.project(pin.coords);
              pinEl.style.left = `${pt.x}px`;
              pinEl.style.top = `${pt.y}px`;
            }
          }
        }

        // 7. [줌 레벨 최적화 LOD 제어]
        lod2BuildingEngineRef.current?.updateZoomLOD(zoom);
      });
    };

    // [1단계: 인터랙션 종료 - 350ms 디바운스 후 인터랙션 락 해제]
    const handleInteractionEnd = () => {
      if (moveEndThrottleTimer) clearTimeout(moveEndThrottleTimer);
      moveEndThrottleTimer = setTimeout(() => {
        isInteractingRef.current = false;
        elevationCache.setInteractionLock(false);
        lod2BuildingEngineRef.current?.setInteracting(false);
        realisticKoreanCityLayerRef.current?.setInteracting(false);
        threeboxLayerRef.current?.setInteracting(false);
        proceduralTreesLayerRef.current?.setInteracting(false);
        deck3DTilesManagerRef.current?.setInteracting(false);

        if (!map) return;
        const bearing = map.getBearing();
        const pitch = map.getPitch();
        const zoom = map.getZoom();
        const center = map.getCenter();

        // 시네마틱 방송 OSD가 활성 상태일 때만 React 상태 동기화
        const isCinematicActive =
          useMapStore.getState().cinematicFlight.isPlaying ||
          useMapStore.getState().cinematicFlight.isRecording;
        if (isCinematicActive) {
          setCurrentBearing(bearing);
          setCurrentPitch(pitch);
          setCurrentZoom(zoom);
          setCurrentLat(center.lat);
        }

        // [GPU 다층 슬라이싱 엔진 가동으로 메인 스레드 JS 6,985동 루프 중단]
        updateRealtimeMetrics();
      }, 350);
    };

    // [카메라 무결성 검증 래퍼] flyTo, easeTo, jumpTo의 좌표/고도/각도 NaN 및 범위 초과 붕괴 방지
    const origFlyTo = map.flyTo.bind(map);
    map.flyTo = function (options: any) {
      try {
        return origFlyTo(sanitizeCameraOptions(options, map));
      } catch (err) {
        console.warn('[MapViewer] flyTo warning suppressed:', err);
        return this;
      }
    };

    const origEaseTo = map.easeTo.bind(map);
    map.easeTo = function (options: any) {
      try {
        return origEaseTo(sanitizeCameraOptions(options, map));
      } catch (err) {
        console.warn('[MapViewer] easeTo warning suppressed:', err);
        return this;
      }
    };

    const origJumpTo = map.jumpTo.bind(map);
    map.jumpTo = function (options: any) {
      try {
        return origJumpTo(sanitizeCameraOptions(options, map));
      } catch (err) {
        console.warn('[MapViewer] jumpTo warning suppressed:', err);
        return this;
      }
    };

    // 인터랙션 잠금(Interaction Lock) 이벤트 바인딩
    map.on('movestart', handleInteractionStart);
    map.on('rotatestart', handleInteractionStart);
    map.on('pitchstart', handleInteractionStart);
    map.on('dragstart', handleInteractionStart);
    map.on('zoomstart', handleInteractionStart);

    map.on('move', handleMove);
    map.on('rotate', handleMove);
    map.on('pitch', handleMove);

    map.on('moveend', handleInteractionEnd);
    map.on('rotateend', handleInteractionEnd);
    map.on('pitchend', handleInteractionEnd);
    map.on('dragend', handleInteractionEnd);
    map.on('zoomend', handleInteractionEnd);

    const handleMapIdle = () => {
      updateRealtimeMetrics();
    };
    map.on('idle', handleMapIdle);

    const handleViewportMoveEnd = () => {
      const c = map.getCenter();
      setViewport({
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
      syncExternalSpatialBuildings(map);
      updateRealtimeMetrics();
    };
    map.on('moveend', handleViewportMoveEnd);

    let sourceDataDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleSourceData = (e: any) => {
      if (
        (e.sourceId === 'openmaptiles-vector' || e.sourceId === 'openmaptiles' || e.sourceId === 'openfreemap') &&
        e.isSourceLoaded &&
        e.sourceDataType !== 'metadata'
      ) {
        if (sourceDataDebounceTimer) clearTimeout(sourceDataDebounceTimer);
        sourceDataDebounceTimer = setTimeout(() => {
          if (isInteractingRef.current) return;
          syncExternalSpatialBuildings(map);
          updateRealtimeMetrics();
        }, 500);
      }
    };
    map.on('sourcedata', handleSourceData);

    map.on('zoom', () => {
      updateRealtimeMetrics();
    });

    let hasInitializedMapLayers = false;
    const handleMapReady = () => {
      registerNativeBuildingPatterns(map);
      registerRealisticBuildingPatterns(map);
      ensureBuildingPatterns(map);
      if (hasInitializedMapLayers) return;
      hasInitializedMapLayers = true;
      setIsMapLoaded(true);
      updateRealtimeMetrics();
      setTimeout(() => {
        syncExternalSpatialBuildings(map);
      }, 600);

      // [1. 검은색 background 레이어 존재 시 제거하여 위성 타일 가림 방지]
      try {
        const bgLayers = map.getStyle().layers?.filter(
          (l: any) => l.type === 'background'
        ) || [];
        bgLayers.forEach((l: any) => {
          if (map.getLayer(l.id)) {
            map.removeLayer(l.id);
          }
        });
      } catch (bgErr) {
        console.warn('[MapViewer] background layer cleanup notice:', bgErr);
      }

      // [2. 지형(Terrarium DEM)과 위성 레이어 드레이핑(Draping) 결합: 기본 고저차 1.0x 안정화]
      if (map.getSource('terrarium-dem')) {
        try {
          const initExaggeration = useMapStore.getState().terrainExaggeration;
          map.setTerrain({
            source: 'terrarium-dem',
            exaggeration: Number.isFinite(initExaggeration) ? initExaggeration : 1.0,
          });
        } catch (err) {
          console.warn('setTerrain 안전 처리:', err);
        }
      }

      // [대기 및 하늘 환경 (Atmospheric Sky) 안전 적용]
      try {
        if (typeof (map as any).setSky === 'function') {
          (map as any).setSky({
            'sky-color': '#1e3a8a',           // 상단 맑고 깊은 네이비 블루
            'horizon-color': '#60a5fa',       // 중간 스카이 블루
            'fog-color': '#cbd5e1',           // 지평선 밝은 슬레이트 안개
            'fog-ground-blend': 0.65,
            'atmosphere-blend': 0.8,
          });
        }
      } catch (skyErr) {
        console.warn('[MapViewer] setSky notice:', skyErr);
      }

      // [SAFE_MODE] 순수 위성 래스터 베이스맵 격리: 무거운 비동기 작업 및 커스텀 3D 레이어 주입 일체 바이패스
      if (SAFE_MODE) {
        console.info('[MapViewer SAFE_MODE] 순수 위성 베이스맵 로드 성공! terrarium-dem 지형 소스 동기화 완료.');
        setTimeout(() => {
          try {
            map.resize();
          } catch {}
        }, 100);
        return;
      }

      // [대기 환경 (Atmospheric Fog)] 원경 산악 지형과 지평선의 입체 공간감 극대화
      try {
        if (typeof (map as any).setFog === 'function') {
          (map as any).setFog({
            range: [1.2, 11],
            color: '#cbd5e1',
            'horizon-blend': 0.22,
            'high-color': '#1e3a8a',
            'space-color': '#0f172a',
            'star-intensity': 0.0,
          });
        }
      } catch (fogErr) {
        console.warn('[MapLibre] map.setFog skipped:', fogErr);
      }

      // [3D 건물 고대비 음영을 위한 Directional Light 조명 파라미터 적용 (비스듬한 태양광 각도, 강도 0.9, position: [1.3, 115, 40])]
      try {
        safeSetLight(map, {
          anchor: 'viewport',
          color: '#ffffff',
          intensity: 0.9,
          position: [1.3, 115, 40],
        });
      } catch (lightErr) {
        console.warn('[MapLibre] safeSetLight skipped or not supported:', lightErr);
      }

      // [고해상도 한국형 창문·베란다 심리스 패턴 및 외벽 텍스처 등록]
      try {
        registerNativeBuildingPatterns(map);
        registerRealisticBuildingPatterns(map);
        registerFacadeTexturesToMap(map, 512);
        registerBuildingTextures(map, 256);
        registerProceduralFacadeTextures(map, 256);
        registerFacadeImagesToMap(map);
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

      // ---------------------------------------------------------------------
      // [외부 데이터 독립 분리 1] 브이월드 연속지적도(필지선) WMS 안전 주입
      // ---------------------------------------------------------------------
      try {
        if (!map.getSource('vworld-cadastral-wms')) {
          map.addSource('vworld-cadastral-wms', {
            type: 'raster',
            tiles: [
              `https://api.vworld.kr/req/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun&STYLES=lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xFFFFFF&EXCEPTIONS=text/xml&KEY=${
                process.env.NEXT_PUBLIC_VWORLD_API_KEY || 'CEB52025-E065-364C-9DBA-44D8863B9B62'
              }&DOMAIN=localhost`,
            ],
            tileSize: 256,
            maxzoom: 20,
          });
        }
        if (!map.getLayer('vworld-cadastral-layer')) {
          const beforeBuffer = map.getLayer('buffer-2km-fill') ? 'buffer-2km-fill' : undefined;
          map.addLayer(
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
            beforeBuffer
          );
        }
      } catch (wmsErr) {
        console.error(
          `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 브이월드 연속지적도 WMS 주입 오류!\n` +
          ` • 소스 ID: vworld-cadastral-wms | 레이어 ID: vworld-cadastral-layer\n` +
          ` • 오류 원인: ${(wmsErr as Error)?.message || wmsErr}`,
          'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
          'color: #EF4444; font-weight: bold;'
        );
      }

      // ---------------------------------------------------------------------
      // [외부 데이터 독립 분리 2] 오픈 벡터 타일 (도로망 및 3D 건축물) 안전 주입
      // ---------------------------------------------------------------------
      try {
        const vectorSourceUrl = 'https://tiles.openfreemap.org/planet';
        for (const sId of ['openmaptiles-vector', 'openmaptiles', 'openfreemap']) {
          if (!map.getSource(sId)) {
            map.addSource(sId, {
              type: 'vector',
              url: vectorSourceUrl,
              maxzoom: 14,
            });
          }
        }

        // 3D 건물 및 건물 접지 그림자보다 항상 아래에 위치하도록 Z-Order 무결성 보장
        const beforeRoads = map.getLayer('lod2-building-engine-layer')
          ? 'lod2-building-engine-layer'
          : (map.getLayer('buffer-2km-fill') ? 'buffer-2km-fill' : undefined);

        // 지적 필지선 오버레이
        if (!map.getLayer('cadastral-parcels-line')) {
          map.addLayer(
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
            beforeRoads
          );
        }

        // ---------------------------------------------------------------------
        // [2단계: 한국형 실측 도로망(아스팔트 노면·차선·횡단보도·보도블록 연석) 정밀 렌더링]
        // ---------------------------------------------------------------------
        // 1) 교차로 횡단보도 및 회전교차로 GeoJSON 소스 초기화
        if (!map.getSource('crosswalks-source')) {
          const crosswalkData = generateCrosswalksGeoJSON(
            undefined,
            polygonCenter ? polygonCenter : undefined
          );
          map.addSource('crosswalks-source', {
            type: 'geojson',
            data: crosswalkData,
          });
        }

        // 1-B) [3단계: 벡터 토지피복(Landuse/Landcover) 디테일 블렌딩 레이어 일괄 등록]
        // 위성사진 바닥의 픽셀화 뭉개짐을 보완하고 15~25% 투명도로 자연스럽게 합성
        const landuseLayerDefs = getKoreanLanduseLayerDefinitions('openmaptiles-vector');
        const initialLanduseVis = baseMap === 'satellite' ? 'visible' : 'none';

        for (const luLayer of landuseLayerDefs) {
          if (!map.getLayer(luLayer.id)) {
            const configuredLayer: any = {
              ...luLayer,
              layout: {
                ...(luLayer.layout || {}),
                visibility: initialLanduseVis,
              },
            };
            map.addLayer(configuredLayer, beforeRoads);
          }
        }

        // 2) 한국형 실측 폭 아스팔트 노면·차선·중앙선·연석 레이어 일괄 등록
        const roadLayerDefs = getKoreanRoadLayerDefinitions(
          'openmaptiles-vector',
          'transportation',
          'crosswalks-source'
        );

        const initialRoadVis = layers.roads ? 'visible' : 'none';

        for (const rLayer of roadLayerDefs) {
          if (!map.getLayer(rLayer.id)) {
            const configuredLayer: any = {
              ...rLayer,
              layout: {
                ...(rLayer.layout || {}),
                visibility: initialRoadVis,
              },
            };
            map.addLayer(configuredLayer, beforeRoads);
          }
        }

        // ---------------------------------------------------------------------
        // [2단계: 3D 지형 완벽 호환 GPU 다층 슬라이싱(Multi-Tier Slicing) 엔진 등록]
        // - DEM 표고 변위 셰이더와 100% 네이티브 호환, 지형에 안착되어 솟아오름 보장
        // - 1층 화강석 기단부 + 중층 실감 외벽 + 실사 창문 패턴 + 옥상 슬래브 파라펫 4단
        // ---------------------------------------------------------------------
        ensureBuildingPatterns(map);
        const gpuLayers = createGpuBuildingStackLayers('openmaptiles-vector', 'building');
        gpuLayers.forEach((layerDef) => {
          if (!map.getLayer(layerDef.id)) {
            const configured: any = {
              ...layerDef,
              layout: {
                ...(layerDef.layout || {}),
                visibility: layers.buildings3D ? 'visible' : 'none',
              },
            };
            map.addLayer(configured);
          }
        });

        // ---------------------------------------------------------------------
        // [3단계 직결] 메인 실측 건물 소스 및 융합 소스 등록: real-buildings-source & fusion-buildings-source
        // ---------------------------------------------------------------------
        for (const sId of ['real-buildings-source', 'fusion-buildings-source']) {
          if (!map.getSource(sId)) {
            map.addSource(sId, {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
            });
          }
        }

        // real-buildings-source GPU 다층 레이어 등록
        const realLayers = createGpuBuildingStackLayers('real-buildings-source', undefined, 'real');
        realLayers.forEach((layerDef) => {
          if (!map.getLayer(layerDef.id)) {
            const configured: any = {
              ...layerDef,
              layout: {
                ...(layerDef.layout || {}),
                visibility: layers.buildings3D ? 'visible' : 'none',
              },
            };
            map.addLayer(configured);
          }
        });

        // GeoJSON 소스 융합용 다층 레이어
        if (map.getSource('fusion-buildings-source')) {
          const fusionLayers = createGpuBuildingStackLayers('fusion-buildings-source', undefined, 'fusion');
          fusionLayers.forEach((layerDef) => {
            if (!map.getLayer(layerDef.id)) {
              const configured: any = {
                ...layerDef,
                layout: {
                  ...(layerDef.layout || {}),
                  visibility: layers.buildings3D ? 'visible' : 'none',
                },
              };
              map.addLayer(configured);
            }
          });
        }

        // 폴백용 3d-buildings 레이어 (중복 렌더링 방지 layout: none)
        if (!map.getLayer('3d-buildings')) {
          map.addLayer({
            id: '3d-buildings',
            type: 'fill-extrusion',
            source: 'openmaptiles-vector',
            'source-layer': 'building',
            minzoom: 11.0,
            maxzoom: 24,
            paint: {
              'fill-extrusion-color': '#d6d3d1',
              'fill-extrusion-height': gpuBuildingTotalHeightExpr,
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.95,
            },
            layout: { visibility: 'none' },
          });
        }

        // [전술·분석 GeoJSON 소스 및 오버레이 레이어 동적 안전 주입]
        if (fullMapStyle.sources) {
          for (const [sourceId, sourceDef] of Object.entries(fullMapStyle.sources)) {
            if (sourceId === 'satellite-tiles' || sourceId === 'terrarium-dem') continue;
            if (!map.getSource(sourceId)) {
              try {
                map.addSource(sourceId, sourceDef as any);
              } catch (sErr) {
                console.warn(`[MapViewer] addSource notice (${sourceId}):`, sErr);
              }
            }
          }
        }

        if (fullMapStyle.layers) {
          for (const layerDef of fullMapStyle.layers) {
            if (layerDef.id === 'satellite-base-layer' || layerDef.id === 'satellite-layer') continue;
            if (!map.getLayer(layerDef.id)) {
              try {
                const beforeId = (layerDef.type === 'fill-extrusion' || layerDef.type === 'custom')
                  ? undefined
                  : (map.getLayer('building-body') ? 'building-body' : (map.getLayer('3d-buildings') ? '3d-buildings' : undefined));
                map.addLayer(layerDef as any, beforeId);
              } catch (lErr) {
                console.warn(`[MapViewer] addLayer notice (${layerDef.id}):`, lErr);
              }
            }
          }
        }

        // 3D 건축물 레이어들을 맵 스타일 최상단으로 강제 승격
        promoteBuildingLayersToTop(map);
      } catch (vectorErr) {
        console.error(
          `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 오픈 벡터 타일(openmaptiles-vector) 주입 오류!\n` +
          ` • 소스 ID: openmaptiles-vector | 레이어: roads / 3d-buildings\n` +
          ` • 오류 원인: ${(vectorErr as Error)?.message || vectorErr}`,
          'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
          'color: #EF4444; font-weight: bold;'
        );
      }

      // [Threebox-MapLibre 연동 정밀 3D 건축물 레이어 등록]
      try {
        const initRenderMode = useMapStore.getState().renderMode3D;
        const tbLayer = new ThreeboxBuildingLayer();
        tbLayer.setPostProcessingEnabled(false); // [긴급 조치: WebGL 검은 화면 방지 후처리 상시 바이패스]
        tbLayer.setVisible(initRenderMode === 'facade' && !!layers.buildings3D);
        tbLayer.setFacilityCallbacks(
          (id, updates) => {
            useMapStore.getState().updateFacilityTransform(id, updates);
          },
          (id) => {
            useMapStore.getState().selectFacility(id);
          }
        );
        map.addLayer(tbLayer);
        threeboxLayerRef.current = tbLayer;
        if (initRenderMode === 'facade') {
          // [2단계 신규] 강원권 주요 거점 건축물 LOD2 입체 지붕 및 옥상 구조물 즉각 동기화
          tbLayer.syncRoofs(SAMPLE_BUILDINGS.features);
        }
      } catch (tbErr) {
        console.error(
          `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 ThreeboxBuildingLayer 등록 실패!\n` +
          ` • 레이어 ID: threebox-building-layer\n` +
          ` • 오류 원인: ${(tbErr as Error)?.message || tbErr}`,
          'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
          'color: #EF4444; font-weight: bold;'
        );
      }

      // [주력 3D 건축물 렌더러: Three.js 기반 실감 절차적 LOD2 빌딩 엔진 등록]
      try {
        const initRenderMode = useMapStore.getState().renderMode3D;
        const lod2Engine = new LOD2BuildingEngine();
        lod2Engine.setVisible(initRenderMode === 'facade' && !!layers.buildings3D);
        lod2Engine.setOnError((err) => {
          console.warn('[MapViewer] LOD2 Building Engine fallback to LOD1:', err);
          setDetail3DMode('lod1');
          setWebglFallbackWarning('⚠️ 3D 실감 렌더링 지연/부하 감지로 일반(LOD1) 모드로 안전 전환되었습니다.');
        });
        map.addLayer(lod2Engine);
        lod2BuildingEngineRef.current = lod2Engine;
        (window as any).__lod2Engine = lod2Engine;
        if (initRenderMode === 'facade') {
          updateRealtimeMetrics();
        }
      } catch (lod2Err) {
        console.error('[LOD2BuildingEngine] Registration warning:', lod2Err);
      }

      // [2단계 신규: Three.js 단일 버퍼 기반 한국형 실사 포토 파사드 & 입체 지붕 메쉬 엔진 등록]
      try {
        const initRenderMode = useMapStore.getState().renderMode3D;
        const realisticCityLayer = new RealisticKoreanCityLayer({
          onBuildingCountChange: () => {
            updateRealtimeMetrics();
          },
        });
        realisticCityLayer.setVisible(initRenderMode === 'facade' && !!layers.buildings3D);
        map.addLayer(realisticCityLayer);
        realisticKoreanCityLayerRef.current = realisticCityLayer;
        (window as any).__realisticCityLayer = realisticCityLayer;

        // [3단계 신규]: 브이월드 스타일 노란 핀 + 한글 건물/지역 명칭(POI) 심볼 레이어 등록
        setupVworldPoiLayer(map);
      } catch (rcErr) {
        console.warn('[RealisticKoreanCityLayer] Registration warning:', rcErr);
      }

      // [1단계: 비정상적인 거대 가상 박스(더미 메쉬) 전면 삭제 - 임의 3D 박스 생성 중단]
      try {
        const smartCityLayer = new SmartCityComplex3DLayer(selectedIdleSiteId || 'first-logistics-wonju');
        smartCityLayer.setVisible(false);
        smartCityComplexLayerRef.current = smartCityLayer;
      } catch (scErr) {
        console.warn('[SmartCityComplex3DLayer] registration notice:', scErr);
      }

      // [4단계 신규: 3D 입체 수목(식생 InstancedMesh) 및 가로수 고성능 렌더러]
      try {
        const treesLayer = new ProceduralTrees3DLayer(selectedIdleSiteId || 'first-logistics-wonju');
        treesLayer.setVisible(!!layers.proceduralTrees);
        map.addLayer(treesLayer);
        proceduralTreesLayerRef.current = treesLayer;
      } catch (treeErr) {
        console.warn('[ProceduralTrees3DLayer] registration notice:', treeErr);
      }

      // [강원 지형 특화 저류·침수 수위(Water Level) 시뮬레이션 커스텀 레이어 등록]
      try {
        const wlLayer = new WaterLevelLayer();
        map.addLayer(wlLayer);
        waterLevelLayerRef.current = wlLayer;
      } catch (wlErr) {
        console.error(
          `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 WaterLevelLayer 등록 실패!\n` +
          ` • 레이어 ID: custom-water-level-layer\n` +
          ` • 오류 원인: ${(wlErr as Error)?.message || wlErr}`,
          'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
          'color: #EF4444; font-weight: bold;'
        );
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
        console.error(
          `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 UavSensorLayer 등록 실패!\n` +
          ` • 레이어 ID: uav-sensor-layer\n` +
          ` • 오류 원인: ${(uavErr as Error)?.message || uavErr}`,
          'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
          'color: #EF4444; font-weight: bold;'
        );
      }

      // [지휘통제 및 보안 관제] 3D 레이더 탐지 돔, 3D 보안벽, 입체 LOS 가시선 커스텀 레이어 등록
      try {
        const tdLayer = new TacticalDefenseLayer();
        tdLayer.setCallbacks((result) => {
          useMapStore.getState().setLosResult(result);
        });
        map.addLayer(tdLayer);
        tacticalDefenseLayerRef.current = tdLayer;
      } catch (tdErr) {
        console.error(
          `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 TacticalDefenseLayer 등록 실패!\n` +
          ` • 레이어 ID: tactical-defense-layer\n` +
          ` • 오류 원인: ${(tdErr as Error)?.message || tdErr}`,
          'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
          'color: #EF4444; font-weight: bold;'
        );
      }

      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showCompass: true,
          showZoom: true,
        }),
        'top-right'
      );

      // [2단계: Deck.gl 기반 범용 하이브리드 3D 타일셋 스트리밍 컨트롤 부착]
      try {
        if (!deck3DTilesManagerRef.current) {
          const deckManager = new Deck3DTilesManager({
            onStatusChange: (statusText, isLoading, tilesLoadedCount, verticesCount) => {
              useMapStore.getState().setTile3DStreamStatus(statusText, isLoading, tilesLoadedCount, verticesCount);
            },
            onTileCountUpdate: (count) => {
              console.log('[Universal3DTilesManager] Real-time 3D hybrid building count:', count);
            },
            onExternalActiveChange: (isActive) => {
              if (useMapStore.getState().renderMode3D === 'tiles3d') {
                if (isActive) {
                  // [요구사항 2] 외부 3D Tiles 로드 시 기존 절차적 건물 자동 대체
                  if (lod2BuildingEngineRef.current) lod2BuildingEngineRef.current.setVisible(false);
                  if (realisticKoreanCityLayerRef.current) realisticKoreanCityLayerRef.current.setVisible(false);
                  setGpuBuildingLayersVisibility(map, false, true);
                } else {
                  if (realisticKoreanCityLayerRef.current) realisticKoreanCityLayerRef.current.setVisible(useMapStore.getState().layers.buildings3D);
                  setGpuBuildingLayersVisibility(map, useMapStore.getState().layers.buildings3D);
                }
                map.triggerRepaint();
              }
            },
          });
          deck3DTilesManagerRef.current = deckManager;
        }

        const initRenderMode = useMapStore.getState().renderMode3D;
        const initTileState = useMapStore.getState().tile3DStream;
        if (initRenderMode === 'tiles3d' && initTileState.enabled && deck3DTilesManagerRef.current) {
          deck3DTilesManagerRef.current.attachToMap(map);
          deck3DTilesManagerRef.current.update(initTileState);
        }
      } catch (deckErr) {
        console.warn('[MapViewer] Universal3DTilesManager initialization warning:', deckErr);
      }
    };

    map.on('load', handleMapReady);
    map.on('style.load', handleMapReady);
    if (map.isStyleLoaded() || (map.style && (map.style as any)._loaded)) {
      setTimeout(handleMapReady, 0);
    }

    // 1. WebGL 컨텍스트 손실(webglcontextlost) 자동 감지 및 가벼운 2D 모드 자동 폴백 리스너
    const canvas = map.getCanvas();
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      const webglEvent = e as any;
      const statusMessage = webglEvent?.statusMessage || 'Context lost by browser/GPU';
      console.error(
        `%c[GeoBrief 3D WebGL CRITICAL]%c 🚨 WebGL 컨텍스트 손실 감지 (webglcontextlost)!\n` +
        ` • 상태 메시지: ${statusMessage}\n` +
        ` • 조치: 화면 멈춤 방지를 위해 가벼운 2D 네이티브 모드로 자동 폴백`,
        'background: #7F1D1D; color: #FCA5A5; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
        'color: #F87171; font-weight: bold;'
      );

      setDebugErrors((prev) => [...prev.slice(-19), `[WebGL Context Lost] 🚨 ${statusMessage}`]);

      // 브라우저 GPU Crash 방지: 2D 수직 뷰로 강제 전환 및 무거운 3D 레이어 일체 안전 해제
      setWebglFallbackWarning('⚠️ 그래픽 메모리 보호를 위해 가벼운 2D 모드로 자동 전환되었습니다.');
      setViewMode('2D');
      setRenderMode3D('native');
      setTerrainEnabled(false);
      setDetail3DMode('lod1');

      if (lod2BuildingEngineRef.current) {
        lod2BuildingEngineRef.current.setVisible(false);
      }
      if (deck3DTilesManagerRef.current) {
        deck3DTilesManagerRef.current.update({ enabled: false, url: '' } as any);
      }
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setVisible(false);
        threeboxLayerRef.current.setPostProcessingEnabled(false);
      }
      if (smartCityComplexLayerRef.current) {
        smartCityComplexLayerRef.current.setVisible(false);
      }
      if (threeDLayerRef.current) {
        threeDLayerRef.current.setVisible(false);
      }
      if (waterLevelLayerRef.current) {
        waterLevelLayerRef.current.setVisible(false);
      }
      if (uavSensorLayerRef.current) {
        uavSensorLayerRef.current.setVisible(false);
      }
      if (tacticalDefenseLayerRef.current) {
        tacticalDefenseLayerRef.current.setVisible(false);
      }

      try {
        map.easeTo({ pitch: 0, bearing: 0, duration: 250 });
      } catch {}
    };

    const handleContextRestored = () => {
      console.info(
        `%c[GeoBrief 3D WebGL RESTORED]%c ✅ WebGL 컨텍스트 복구 완료. 캔버스 뷰포트를 재초기화합니다.`,
        'background: #065F46; color: #A7F3D0; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
        'color: #34D399; font-weight: bold;'
      );
      setWebglFallbackWarning(null);
      map.triggerRepaint();
    };

    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost, false);
      canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    }

    // 2. 후처리(SSAO/Bloom) 상시 바이패스 제어로 네이티브 렌더 루프 및 베이스맵 보장
    const handleMoveStart = () => {
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setPostProcessingEnabled(false);
      }
    };

    const handleMoveEnd = () => {
      // 검은 화면 충돌 방지: 후처리는 항상 바이패스 상태로 유지하여 네이티브 렌더링 유지
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setPostProcessingEnabled(false);
      }
    };

    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);

    map.on('error', (e: any) => {
      const sourceId = e?.sourceId || e?.source?.id || 'N/A';
      const layerId = e?.layerId || e?.layer?.id || 'N/A';
      const errObj = e?.error || e;
      const message = errObj?.message || (typeof errObj === 'string' ? errObj : JSON.stringify(errObj));
      const stack = errObj?.stack || '';

      // [네트워크/타일 무해 경고 격리] 타일 404, 취소(Abort), 이미지 디코딩 등 일반 네트워크 이벤트는 콘솔 워닝으로만 분류
      const isTileOrNetworkWarning =
        message.includes('404') ||
        message.includes('401') ||
        message.includes('403') ||
        message.includes('status: 404') ||
        message.includes('status: 401') ||
        message.includes('status: 403') ||
        message.includes('status: 0') ||
        message.includes('Failed to load tile') ||
        message.includes('could not be loaded') ||
        message.includes('could not be decoded') ||
        message.includes('decode') ||
        message.includes('decoded') ||
        message.includes('Image "') ||
        message.includes('AbortError') ||
        message.includes('canceled') ||
        message.includes('cancelled') ||
        message.includes('ServiceException') ||
        message.includes('INVALID_KEY') ||
        message.includes('XML') ||
        message.includes('DOMException') ||
        message.includes('cannot calculate elevation') ||
        message.includes('hillshade') ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError') ||
        sourceId.includes('vworld-contour') ||
        sourceId.includes('vworld-cadastral') ||
        sourceId.includes('openmaptiles') ||
        sourceId.includes('satellite') ||
        sourceId.includes('terrarium');

      if (isTileOrNetworkWarning) {
        console.warn(`[MapLibre Tile Notice] (${sourceId}/${layerId}): ${message}`);
        return;
      }

      let fileInfo = 'Unknown Location';
      if (stack) {
        const lines = stack.split('\n');
        const rel = lines.find((l: string) => l.includes('.ts') || l.includes('.js') || l.includes('http')) || lines[1];
        if (rel) fileInfo = rel.trim();
      }

      console.error(
        `%c[GeoBrief 3D MapLibre ERROR]%c 🚨 렌더링 충돌/오류 감지!\n` +
        ` • 레이어 ID: %c${layerId}%c\n` +
        ` • 소스 ID: %c${sourceId}%c\n` +
        ` • 위치/파일명: ${fileInfo}\n` +
        ` • 오류 원인: ${message}`,
        'background: #DC2626; color: #FFFFFF; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;',
        'color: #EF4444; font-weight: bold;',
        'color: #FBBF24; font-weight: bold;',
        'color: #EF4444;',
        'color: #60A5FA; font-weight: bold;',
        'color: #EF4444;'
      );

      const debugLine = `[MapLibre Error] layer: ${layerId}, source: ${sourceId} | ${message} (${fileInfo})`;
      setDebugErrors((prev) => [...prev.slice(-19), debugLine]);
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
      if (lod2BuildingEngineRef.current && map.getLayer('lod2-building-engine-layer')) {
        try {
          map.removeLayer('lod2-building-engine-layer');
        } catch {
          // ignore
        }
        lod2BuildingEngineRef.current = null;
      }
      if (realisticKoreanCityLayerRef.current && map.getLayer('realistic-korean-city-layer')) {
        try {
          map.removeLayer('realistic-korean-city-layer');
        } catch {
          // ignore
        }
        realisticKoreanCityLayerRef.current = null;
      }
      if (threeDLayerRef.current && map.getLayer('custom-three-model-layer')) {
        try {
          map.removeLayer('custom-three-model-layer');
        } catch {
          // ignore
        }
        threeDLayerRef.current = null;
      }
      if (smartCityComplexLayerRef.current && map.getLayer('smart-city-complex-3d-layer')) {
        try {
          map.removeLayer('smart-city-complex-3d-layer');
        } catch {
          // ignore
        }
        smartCityComplexLayerRef.current = null;
      }
      if (waterLevelLayerRef.current && map.getLayer('custom-water-level-layer')) {
        try {
          map.removeLayer('custom-water-level-layer');
        } catch {
          // ignore
        }
        waterLevelLayerRef.current = null;
      }
      if (deck3DTilesManagerRef.current) {
        try {
          deck3DTilesManagerRef.current.destroy();
        } catch {
          // ignore
        }
        deck3DTilesManagerRef.current = null;
      }
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      }
      if (moveEndThrottleTimer) clearTimeout(moveEndThrottleTimer);
      try {
        map.off('movestart', handleInteractionStart);
        map.off('rotatestart', handleInteractionStart);
        map.off('pitchstart', handleInteractionStart);
        map.off('dragstart', handleInteractionStart);
        map.off('zoomstart', handleInteractionStart);

        map.off('move', handleMove);
        map.off('rotate', handleMove);
        map.off('pitch', handleMove);

        map.off('moveend', handleInteractionEnd);
        map.off('rotateend', handleInteractionEnd);
        map.off('pitchend', handleInteractionEnd);
        map.off('dragend', handleInteractionEnd);
        map.off('zoomend', handleInteractionEnd);
        map.off('idle', handleMapIdle);
        map.off('sourcedata', handleSourceData);
      } catch {}
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

      if (map.getLayer('drawing-polygon-fill')) {
        map.setLayoutProperty('drawing-polygon-fill', 'visibility', 'visible');
      }
      if (map.getLayer('drawing-polygon-line')) {
        map.setLayoutProperty('drawing-polygon-line', 'visibility', 'visible');
      }
      if (map.getLayer('drawing-polygon-points')) {
        map.setLayoutProperty('drawing-polygon-points', 'visibility', 'visible');
      }

      if (polygonCenter) {
        const p = map.project(polygonCenter);
        setLabelScreenPos({ x: p.x, y: p.y });
      }
    } else {
      polySource.setData({
        type: 'FeatureCollection',
        features: [],
      });
      if (map.getLayer('drawing-polygon-fill')) {
        map.setLayoutProperty('drawing-polygon-fill', 'visibility', 'none');
      }
      if (map.getLayer('drawing-polygon-line')) {
        map.setLayoutProperty('drawing-polygon-line', 'visibility', 'none');
      }
      if (map.getLayer('drawing-polygon-points')) {
        map.setLayoutProperty('drawing-polygon-points', 'visibility', 'none');
      }
      setLabelScreenPos(null);
    }
  }, [completedPolygon, polygonCenter, isMapLoaded]);

  // 4-1. [국방 규제 및 비행안전] 3D 가상 비행안전 제한고도면(Ceiling) 피처 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const ceilingSource = map.getSource('flight-ceiling-source') as maplibregl.GeoJSONSource;
    if (!ceilingSource) return;

    const isVisible = !!(
      completedPolygon &&
      showFlightCeiling3D &&
      defenseAnalysisResult &&
      defenseAnalysisResult.hasFlightSafetyZone
    );
    const visStr = isVisible ? 'visible' : 'none';

    if (map.getLayer('flight-ceiling-slab')) {
      map.setLayoutProperty('flight-ceiling-slab', 'visibility', visStr);
    }
    if (map.getLayer('flight-envelope-volume')) {
      map.setLayoutProperty('flight-envelope-volume', 'visibility', visStr);
    }
    if (map.getLayer('flight-ceiling-border')) {
      map.setLayoutProperty('flight-ceiling-border', 'visibility', visStr);
    }

    if (isVisible) {
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

    const isVisible = !!(completedPolygon && showBuildingMass3D);
    const massVis = isVisible ? 'visible' : 'none';

    if (map.getLayer('building-mass-extrusion')) {
      map.setLayoutProperty('building-mass-extrusion', 'visibility', massVis);
    }
    if (map.getLayer('building-mass-edges')) {
      map.setLayoutProperty('building-mass-edges', 'visibility', massVis);
    }

    if (isVisible) {
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

        // 2. 가상 건축 매스 소스 초기화 (거대 사각형 평면/패드 생성 원천 차단)
        massSource.setData({
          type: 'FeatureCollection',
          features: [],
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

      // 교차로 횡단보도 및 회전교차로 GeoJSON 동기화
      const crosswalkSrc = map.getSource('crosswalks-source') as maplibregl.GeoJSONSource;
      if (crosswalkSrc && typeof crosswalkSrc.setData === 'function') {
        crosswalkSrc.setData(generateCrosswalksGeoJSON(undefined, centerLngLat));
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

    for (const lid of KOREAN_ROAD_LAYER_IDS) {
      if (map.getLayer(lid)) {
        map.setLayoutProperty(lid, 'visibility', roadVis);
      }
    }

    if (lod2BuildingEngineRef.current) {
      lod2BuildingEngineRef.current.setBridgesVisible(layers.roads);
    }
  }, [layers.roads, isMapLoaded]);

  // 8. [신규 3D 렌더러 상호 배타적 실행 (Mutual Exclusion) 동기화]
  // 모드 A (native): GPU 다층 슬라이싱 경량 단일톤 모드
  // 모드 B (facade): GPU 4단 슬라이싱 (화강석 기단 + 실사 파사드 + 창문 그리드 + 옥상 슬래브 파라펫 4색)
  // 모드 C (tiles3d): 고정밀 3D 타일셋 스트리밍 (타일 미로드 시에도 건물 100% 보존)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const bldgVis = !!layers.buildings3D;

    if (renderMode3D === 'native') {
      // 1. 모드 A: 경량 네이티브 모드
      if (deck3DTilesManagerRef.current) {
        deck3DTilesManagerRef.current.detachFromMap();
      }
      if (lod2BuildingEngineRef.current) {
        lod2BuildingEngineRef.current.setVisible(false);
      }
      if (realisticKoreanCityLayerRef.current) {
        realisticKoreanCityLayerRef.current.setVisible(false);
      }
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setLodMode('lod1');
        threeboxLayerRef.current.setVisible(placedFacilities.length > 0);
      }
      setGpuBuildingLayersVisibility(map, bldgVis);
      setGpuBuildingLayersMode(map, 'native');
      if (bldgVis) {
        promoteBuildingLayersToTop(map);
      }
    } else if (renderMode3D === 'facade') {
      // 2. 모드 B: 실감 파사드 모드 (Three.js 단일 버퍼 실사 파사드 + 입체 지붕)
      if (deck3DTilesManagerRef.current) {
        deck3DTilesManagerRef.current.detachFromMap();
      }
      if (lod2BuildingEngineRef.current) {
        lod2BuildingEngineRef.current.setVisible(false);
      }
      if (realisticKoreanCityLayerRef.current) {
        realisticKoreanCityLayerRef.current.setVisible(bldgVis);
      }
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setLodMode('lod2');
        threeboxLayerRef.current.setVisible(placedFacilities.length > 0);
      }
      setGpuBuildingLayersVisibility(map, false, bldgVis);
      if (bldgVis) {
        promoteBuildingLayersToTop(map);
      }
    } else if (renderMode3D === 'tiles3d') {
      // 3. 모드 C: 고정밀 3D 타일셋 스트리밍
      // [치명적 버그 수정] 외부 타일 로드 여부와 무관하게 3D 건물 레이어는 상시 100% 유지 (절대 건물 소실 없음)
      if (realisticKoreanCityLayerRef.current) {
        realisticKoreanCityLayerRef.current.setVisible(bldgVis);
      }
      setGpuBuildingLayersVisibility(map, bldgVis);
      setGpuBuildingLayersMode(map, 'tiles3d');
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.setLodMode('lod2');
        threeboxLayerRef.current.setVisible(placedFacilities.length > 0);
      }
      if (deck3DTilesManagerRef.current) {
        deck3DTilesManagerRef.current.attachToMap(map);
        deck3DTilesManagerRef.current.update({ ...tile3DStream, enabled: true });
      }
      if (bldgVis) {
        promoteBuildingLayersToTop(map);
      }
    }

    if (map.getLayer(VWORLD_POI_LAYER_ID)) {
      map.setLayoutProperty(VWORLD_POI_LAYER_ID, 'visibility', bldgVis ? 'visible' : 'none');
    }

    updateRealtimeMetrics();
    map.triggerRepaint();
  }, [
    renderMode3D,
    layers.buildings3D,
    placedFacilities.length,
    tile3DStream.enabled,
    tile3DStream.url,
    tile3DStream.presetId,
    tile3DStream.opacity,
    tile3DStream.maximumScreenSpaceError,
    tile3DStream.pointSize,
    isMapLoaded,
    updateRealtimeMetrics,
  ]);

  // 8-0-0. [2단계 신규: 국토지리정보원 정밀 등고선(Contour) 레이어 가시성 및 실시간 생성 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const contourVis = layers.demContours ? 'visible' : 'none';

    if (map.getLayer('vworld-contour-raster')) {
      map.setLayoutProperty('vworld-contour-raster', 'visibility', contourVis);
    }
    if (map.getLayer('contour-intermediate-line')) {
      map.setLayoutProperty('contour-intermediate-line', 'visibility', contourVis);
    }
    if (map.getLayer('contour-index-line')) {
      map.setLayoutProperty('contour-index-line', 'visibility', contourVis);
    }
    if (map.getLayer('contour-labels')) {
      map.setLayoutProperty('contour-labels', 'visibility', contourVis);
    }

    if (layers.demContours) {
      let cancelled = false;
      let contourTimer: NodeJS.Timeout | null = null;

      const updateContours = () => {
        try {
          if (cancelled) return;
          const bounds = map.getBounds();
          const bbox: [number, number, number, number] = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ];
          const queryElev = (coord: [number, number]) => {
            if (map.queryTerrainElevation) {
              return map.queryTerrainElevation(coord) ?? 150;
            }
            return 150;
          };
          const contourData = generateContourLines(bbox, queryElev, {
            gridResolution: 30,
            intermediateInterval: 10,
            indexInterval: 50,
          });
          const source = map.getSource('contour-lines-source') as maplibregl.GeoJSONSource;
          if (source && typeof source.setData === 'function') {
            source.setData(contourData);
          }
        } catch (err) {
          console.warn('[MapViewer] Failed to generate contour lines:', err);
        }
      };

      const handleContourMoveStart = () => {
        if (contourTimer) {
          clearTimeout(contourTimer);
          contourTimer = null;
        }
      };

      const debouncedContours = () => {
        if (contourTimer) clearTimeout(contourTimer);
        contourTimer = setTimeout(updateContours, 250);
      };

      debouncedContours();
      map.on('movestart', handleContourMoveStart);
      map.on('moveend', debouncedContours);
      return () => {
        cancelled = true;
        if (contourTimer) clearTimeout(contourTimer);
        map.off('movestart', handleContourMoveStart);
        map.off('moveend', debouncedContours);
      };
    }
  }, [layers.demContours, isMapLoaded]);

  // 8-0. [Three.js SSAO & UnrealBloom 디지털 트윈 후처리: WebGL 충돌 방지를 위해 상시 바이패스]
  useEffect(() => {
    if (threeboxLayerRef.current) {
      threeboxLayerRef.current.setPostProcessingEnabled(false);
    }
  }, [layers.ssaoPostProcessing]);

  // 8-0-1. [2단계 신규: 3D 배치 시설물 목록 & 기즈모 타겟 실시간 동기화]
  useEffect(() => {
    if (threeboxLayerRef.current) {
      threeboxLayerRef.current.syncFacilities(placedFacilities, selectedFacilityId);
      if (placedFacilities.length > 0) {
        threeboxLayerRef.current.setVisible(true);
      }
    }
  }, [placedFacilities, selectedFacilityId]);

  // 8-0-2. [3D 변환 기즈모 모드 (이동/회전/크기) 실시간 동기화]
  useEffect(() => {
    if (threeboxLayerRef.current) {
      threeboxLayerRef.current.setGizmoMode(transformGizmoMode);
    }
  }, [transformGizmoMode]);

  // 8-0-3. [강원권 다중 거점 3D 스마트 복합단지(LOD2) 자동 안착 및 거점 전환 동기화]
  useEffect(() => {
    if (smartCityComplexLayerRef.current) {
      if (selectedIdleSiteId) {
        smartCityComplexLayerRef.current.setSite(selectedIdleSiteId);
      }
      smartCityComplexLayerRef.current.setVisible(!!layers.firstLogisticsSmartCity);
    }
  }, [layers.firstLogisticsSmartCity, selectedIdleSiteId]);

  // 8-0-4. [4단계: 3D 식생·가로수(InstancedMesh) 가시성 및 거점 전환 동기화]
  useEffect(() => {
    if (proceduralTreesLayerRef.current) {
      if (selectedIdleSiteId) {
        proceduralTreesLayerRef.current.setSite(selectedIdleSiteId);
      }
      proceduralTreesLayerRef.current.setVisible(!!layers.proceduralTrees);
    }
  }, [layers.proceduralTrees, selectedIdleSiteId]);

  // 8-0-2-1. [3D 디테일 LOD (LOD1 일반 / LOD2+ 실감) 모드 Threebox 동기화]
  useEffect(() => {
    if (threeboxLayerRef.current) {
      threeboxLayerRef.current.setLodMode(detail3DMode);
    }
  }, [detail3DMode]);

  // 8-0-3. [기즈모 조작 핫키 지원: W(이동) / E(회전) / R(크기) / Esc(해제) / Del(삭제)]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'w' || e.key === 'W') {
        setTransformGizmoMode('translate');
      } else if (e.key === 'e' || e.key === 'E') {
        setTransformGizmoMode('rotate');
      } else if (e.key === 'r' || e.key === 'R') {
        setTransformGizmoMode('scale');
      } else if (e.key === 'Escape') {
        selectFacility(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFacilityId) {
        removePlacedFacility(selectedFacilityId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFacilityId, setTransformGizmoMode, selectFacility, removePlacedFacility]);

  // 8-1. [오픈 벡터 타일 기반 무중단 3D 건물 렌더링 및 상태 진단]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (!layers.buildings3D) return;

    // [2단계: 3대 외부 실측 건물 데이터(V-World WFS + OSM Overpass + OpenFreeMap) 통합 파이프라인 동기화]
    syncExternalSpatialBuildings(map);
  }, [isMapLoaded, layers.buildings3D, syncExternalSpatialBuildings]);

  // 9. 베이스맵 전환
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (map.getLayer('satellite-base-layer')) {
      map.setLayoutProperty(
        'satellite-base-layer',
        'visibility',
        baseMap === 'satellite' ? 'visible' : 'none'
      );
      map.setPaintProperty('satellite-base-layer', 'raster-saturation', -0.25);
      map.setPaintProperty('satellite-base-layer', 'raster-contrast', 0.05);
      map.setPaintProperty('satellite-base-layer', 'raster-brightness-min', 0.08);
      map.setPaintProperty('satellite-base-layer', 'raster-brightness-max', 0.92);
      map.setPaintProperty('satellite-base-layer', 'raster-fade-duration', 300);
    }
    if (map.getLayer('satellite-layer')) {
      map.setLayoutProperty(
        'satellite-layer',
        'visibility',
        baseMap === 'satellite' ? 'visible' : 'none'
      );
    }
    if (map.getLayer('clean-layer')) {
      map.setLayoutProperty(
        'clean-layer',
        'visibility',
        baseMap === 'clean' ? 'visible' : 'none'
      );
    }

    // [3단계: 벡터 토지피복(Landuse/Landcover) 디테일 블렌딩 가시성 동기화]
    const landuseVis = baseMap === 'satellite' ? 'visible' : 'none';
    for (const lid of KOREAN_LANDUSE_LAYER_IDS) {
      if (map.getLayer(lid)) {
        map.setLayoutProperty(lid, 'visibility', landuseVis);
      }
    }
  }, [baseMap, isMapLoaded]);

  // 10. 3D 지형 On/Off 및 고저차 배율 반영 (소스 존재 검증 및 캐시 초기화)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    clearElevationCache();
    threeboxLayerRef.current?.markTerrainDirty();
    safeSetTerrain(map, terrainEnabled, terrainExaggeration);
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
      map.setPaintProperty('drawing-polygon-fill', 'fill-opacity', 0.5);
      map.setPaintProperty('drawing-polygon-line', 'line-color', '#10B981');
      map.setPaintProperty('drawing-polygon-line', 'line-width', 3);
    } else {
      map.setPaintProperty('drawing-polygon-fill', 'fill-pattern', undefined);
      const colors = {
        emerald: { fill: '#10B981', line: '#10B981', opacity: 0.18 },
        blue: { fill: '#3B82F6', line: '#2563EB', opacity: 0.22 },
        orange: { fill: '#F97316', line: '#EA580C', opacity: 0.22 },
      }[polygonStyle] || { fill: '#10B981', line: '#10B981', opacity: 0.18 };

      map.setPaintProperty('drawing-polygon-fill', 'fill-color', colors.fill);
      map.setPaintProperty('drawing-polygon-fill', 'fill-opacity', colors.opacity);
      map.setPaintProperty('drawing-polygon-line', 'line-color', colors.line);
      map.setPaintProperty('drawing-polygon-line', 'line-width', 3);
    }
  }, [polygonStyle, isMapLoaded]);

  // [신규] 17. 토목·지형 3단 경사도 분석 격자 및 고도 단면 데이터 실시간 연산
  const slopeAnalysisResult = React.useMemo(() => {
    const poly = completedPolygon || WONJU_DEFAULT_POLYGON;
    if (!poly) return null;
    try {
      return analyzeSlopeGrid(poly, (coord: [number, number]) => {
        if (!mapRef.current) return 150;
        return elevationCache.getFromMap(mapRef.current, coord) || 150;
      });
    } catch (err) {
      console.error('Failed to analyze slope grid:', err);
      return null;
    }
  }, [completedPolygon, isMapLoaded]);

  const elevationProfileResult = React.useMemo(() => {
    const poly = completedPolygon || WONJU_DEFAULT_POLYGON;
    if (!poly) return null;
    try {
      return generateElevationProfile(
        poly,
        (coord: [number, number]) => {
          if (!mapRef.current) return 150;
          return elevationCache.getFromMap(mapRef.current, coord) || 150;
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
      'bldg-tier2-mainwall',
      'bldg-tier1-podium',
      'bldg-tier4-roofcap',
      '3d-buildings',
    ].filter((layerId) => Boolean(map.getLayer(layerId)));

    if (buildingLayers.length === 0) return;

    // 마우스 호버 커서 처리
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (
        isDrawingMode ||
        stampMode ||
        isViewshedMode ||
        isMeasureMode ||
        isPinMode ||
        isArrowMode ||
        isSensorPlacementMode ||
        losAnalysis.isActive
      )
        return;
      const features = map.queryRenderedFeatures(e.point, { layers: buildingLayers });
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
    };

    // 건물 클릭 처리
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      // [2단계 신규] 3D 시설물 마우스 클릭 피킹 (Raycasting & Gizmo 부착)
      if (threeboxLayerRef.current) {
        const handled = threeboxLayerRef.current.handleMapClick(e.point);
        if (handled) {
          setSelectedBuilding(null);
          return;
        }
      }

      if (
        isDrawingMode ||
        stampMode ||
        isViewshedMode ||
        isMeasureMode ||
        isPinMode ||
        isArrowMode ||
        isSensorPlacementMode ||
        losAnalysis.isActive
      )
        return;

      const features = map.queryRenderedFeatures(e.point, { layers: buildingLayers });
      if (features.length === 0) {
        return;
      }

      const feature = features[0];
      const props = (feature.properties || {}) as Record<string, any>;

      const bldName =
        props.buildingName ||
        props.name ||
        props.bld_nm ||
        props.pos_bul_nm ||
        props.bul_man_no ||
        props.bld_nm_dc ||
        '일반 건축물';

      const rawLevels = parseInt(
        String(props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.levels || props.grnd_flr_cnt || '3'),
        10
      );
      const levels = Math.max(1, isNaN(rawLevels) ? 3 : rawLevels);
      const rawHei = parseFloat(props.hei || props.HEI || props.height);
      const height = !isNaN(rawHei) && rawHei > 0 ? rawHei : Math.round(levels * 3.2 * 10) / 10;

      const category =
        props.main_purps_cd_nm ||
        props.usage_nm ||
        props.bld_category_label ||
        (props.usageType === 'residential' || props.bld_category === 'apartment'
          ? '공동주택·아파트'
          : props.usageType === 'military_public' || props.bld_category === 'public_military' || props.isMilitaryOrPublic
          ? '공공청사·군사시설'
          : props.usageType === 'commercial' || props.bld_category === 'commercial'
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
    isSensorPlacementMode,
    losAnalysis.isActive,
  ]);

  // 지도 이동 시 건물 팝업 화면 좌표 동기화 (DOM 직접 조작 방식으로 리렌더링 차단)
  const selectedBuildingCenterLng = selectedBuilding?.center[0];
  const selectedBuildingCenterLat = selectedBuilding?.center[1];

  useEffect(() => {
    if (
      selectedBuildingCenterLng === undefined ||
      selectedBuildingCenterLat === undefined
    ) {
      selectedBuildingCenterRef.current = null;
      return;
    }

    selectedBuildingCenterRef.current = [
      selectedBuildingCenterLng,
      selectedBuildingCenterLat,
    ];
  }, [selectedBuildingCenterLng, selectedBuildingCenterLat]);

  // 건물 팝업 닫기 및 하이라이트 해제
  const handleCloseBuildingPopup = useCallback(() => {
    selectedBuildingCenterRef.current = null;
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
      if (sunHour === 14) {
        // [오후 고대비 태양광 조명] 비스듬한 태양광 각도로 벽면의 명암 대비 극대화 (강도 0.9)
        safeSetLight(map, {
          anchor: 'viewport',
          color: '#ffffff',
          intensity: 0.9,
          position: [1.3, 115, 40],
        });
      } else {
        safeSetLight(map, {
          anchor: 'viewport',
          color: sunConfig.color,
          intensity: sunConfig.intensity,
          position: sunConfig.position,
        });
      }
    } catch (e) {
      console.warn('[MapLibre] Failed to update light:', e);
    }

    try {
      if (typeof (map as any).setFog === 'function') {
        (map as any).setFog({
          range: [1.2, 11],
          color: sunConfig.fogColor || '#cbd5e1',
          'horizon-blend': 0.22,
          'high-color': '#1e3a8a',
          'space-color': '#0f172a',
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

    // 5. [PBR 3D 건축물] Threebox 및 Three.js Directional Light 위치, 그림자 및 심도 안개 실시간 연동
    try {
      if (threeboxLayerRef.current) {
        threeboxLayerRef.current.updateSunLight(
          sunConfig.directionalVector,
          sunConfig.color,
          sunConfig.intensity,
          sunConfig.fogColor
        );
      }
      if (lod2BuildingEngineRef.current) {
        lod2BuildingEngineRef.current.updateSunLight(
          sunConfig.directionalVector,
          sunConfig.color,
          sunConfig.intensity
        );
      }
      if (realisticKoreanCityLayerRef.current) {
        realisticKoreanCityLayerRef.current.updateSunLight(
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
      if (smartCityComplexLayerRef.current) {
        smartCityComplexLayerRef.current.updateSunLight(
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

  // 29. [Deck.gl Tile3DLayer 및 LOD2 3D 엔진 실시간 파라미터(투명도, SSE, 점 크기) 동기화]
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (renderMode3D === 'tiles3d') {
      const presetId = tile3DStream.presetId;
      const isExternalTilesActive = deck3DTilesManagerRef.current?.isExternalTilesActive?.() || false;
      const center = map.getCenter();
      const isWonju = center.lng >= 127.5 && center.lng <= 128.5 && center.lat >= 37.0 && center.lat <= 37.8;

      if (lod2BuildingEngineRef.current) {
        lod2BuildingEngineRef.current.setStyleMode(
          presetId === 'sample_city' || presetId === 'sample_pointcloud' ? 'clean_mass' : 'photorealistic'
        );
        lod2BuildingEngineRef.current.setOpacity(tile3DStream.opacity ?? 1.0);
        lod2BuildingEngineRef.current.setSSE(tile3DStream.maximumScreenSpaceError ?? 16);
        const shouldHideThreejs = isExternalTilesActive;
        lod2BuildingEngineRef.current.setVisible(!shouldHideThreejs && layers.buildings3D && tile3DStream.enabled);
      }
      if (realisticKoreanCityLayerRef.current) {
        const shouldHide = isExternalTilesActive;
        realisticKoreanCityLayerRef.current.setVisible(!shouldHide && layers.buildings3D && tile3DStream.enabled);
      }

      if (deck3DTilesManagerRef.current) {
        deck3DTilesManagerRef.current.attachToMap(map);
        deck3DTilesManagerRef.current.update({
          ...tile3DStream,
          enabled: tile3DStream.enabled,
        });
      }
      map.triggerRepaint();
    } else {
      if (deck3DTilesManagerRef.current) {
        deck3DTilesManagerRef.current.detachFromMap();
      }
      if (renderMode3D === 'facade') {
        if (lod2BuildingEngineRef.current) {
          lod2BuildingEngineRef.current.setVisible(false);
        }
        if (realisticKoreanCityLayerRef.current) {
          realisticKoreanCityLayerRef.current.setVisible(layers.buildings3D);
        }
      }
    }
  }, [
    renderMode3D,
    layers.buildings3D,
    tile3DStream.enabled,
    tile3DStream.url,
    tile3DStream.presetId,
    tile3DStream.opacity,
    tile3DStream.maximumScreenSpaceError,
    tile3DStream.pointSize,
    isMapLoaded,
  ]);

  // 30-1. [지휘통제 및 보안 관제] 3D 전술 탐지 돔(Threat Dome) 상태 동기화
  useEffect(() => {
    if (!tacticalDefenseLayerRef.current) return;
    tacticalDefenseLayerRef.current.updateThreatDome(threatDome);
  }, [threatDome]);

  // 30-2. [지휘통제 및 보안 관제] 3D 보안벽(Security Wall) 상태 동기화
  useEffect(() => {
    if (!tacticalDefenseLayerRef.current) return;
    tacticalDefenseLayerRef.current.updateSecurityWall(securityWall, completedPolygon);
  }, [securityWall, completedPolygon]);

  // 30-3. [지휘통제 및 보안 관제] 3D LOS 가시선 광선 상태 동기화
  useEffect(() => {
    if (!tacticalDefenseLayerRef.current) return;
    tacticalDefenseLayerRef.current.updateLosState(losAnalysis);
  }, [losAnalysis]);

  // 30-4. [지휘통제 및 보안 관제] 3D LOS 가시선 지도 클릭 인터랙션 (관측점 A -> 목표점 B 선택)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (losAnalysis.isActive) {
      map.getCanvas().style.cursor = 'crosshair';

      const handleLosClick = (e: maplibregl.MapMouseEvent) => {
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const rawElev = map.queryTerrainElevation ? map.queryTerrainElevation(coords) : null;
        const elevation = rawElev !== null && rawElev !== undefined ? Math.round(rawElev) : 120;

        if (losAnalysis.step === 'pick_a' || !losAnalysis.pointA) {
          setLosPointA({
            coords,
            elevation,
            heightOffset: 2.5,
            name: '관측점 A (초소/고지대)',
          });
        } else if (losAnalysis.step === 'pick_b' || !losAnalysis.pointB) {
          setLosPointB({
            coords,
            elevation,
            heightOffset: 1.8,
            name: '목표점 B (시설/접근로)',
          });
        }
      };

      map.on('click', handleLosClick);
      return () => {
        map.getCanvas().style.cursor = '';
        map.off('click', handleLosClick);
      };
    }
  }, [
    losAnalysis.isActive,
    losAnalysis.step,
    losAnalysis.pointA,
    losAnalysis.pointB,
    isMapLoaded,
    setLosPointA,
    setLosPointB,
  ]);

  // =========================================================================
  // 31. [4단계 신규: 웨이포인트 기반 3D 시네마틱 카메라 패스 및 녹화 엔진]
  // =========================================================================

  // 특정 웨이포인트로 카메라 비행
  const handleFlyToWaypoint = useCallback((wp: CinematicWaypoint) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [wp.longitude, wp.latitude],
      zoom: wp.zoom,
      pitch: wp.pitch,
      bearing: wp.bearing,
      duration: 1500,
      essential: true,
    });
  }, []);

  // 비디오 녹화 종료 및 WebM/MP4 자동 다운로드
  const handleStopRecording = useCallback(async () => {
    setCinematicRecording(false);
    if (videoRecorderRef.current) {
      const blob = await videoRecorderRef.current.stop();
      videoRecorderRef.current = null;
      if (blob) {
        const safeTitle = (metadata.title || 'GeoBrief_3D').replace(/[\\/:*?"<>|]/g, '_');
        CanvasVideoRecorder.download(blob, `${safeTitle}_3D시네마틱_브리핑`);
      }
    }
  }, [metadata.title, setCinematicRecording]);

  // 비행 시작
  const handleStartFlight = useCallback(() => {
    if (cinematicFlight.waypoints.length < 2) return;
    cinematicStartTimeRef.current =
      performance.now() - cinematicFlight.currentTimeSec * 1000;
    setCinematicPlaying(true);
  }, [cinematicFlight.waypoints.length, cinematicFlight.currentTimeSec, setCinematicPlaying]);

  // 비행 일시정지
  const handlePauseFlight = useCallback(() => {
    setCinematicPlaying(false);
    if (cinematicAnimRef.current) {
      cancelAnimationFrame(cinematicAnimRef.current);
      cinematicAnimRef.current = null;
    }
  }, [setCinematicPlaying]);

  // 비행 완전 정지
  const handleStopFlight = useCallback(() => {
    setCinematicPlaying(false);
    setCinematicProgress(0, 0);
    if (cinematicAnimRef.current) {
      cancelAnimationFrame(cinematicAnimRef.current);
      cinematicAnimRef.current = null;
    }
    if (cinematicFlight.isRecording) {
      handleStopRecording();
    }
  }, [cinematicFlight.isRecording, handleStopRecording, setCinematicPlaying, setCinematicProgress]);

  // 🔴 캔버스 녹화와 함께 시네마틱 비행 시작
  const handleStartRecordingWithFlight = useCallback(() => {
    const map = mapRef.current;
    if (!map || cinematicFlight.waypoints.length < 2) return;

    const canvas = map.getCanvas();
    if (!canvas) return;

    const recorder = new CanvasVideoRecorder();
    const ok = recorder.start(canvas, { fps: 60, videoBitrate: 8000000 });
    if (!ok) {
      alert('브라우저에서 비디오 녹화(MediaRecorder)를 시작하지 못했습니다.');
      return;
    }

    videoRecorderRef.current = recorder;
    setCinematicRecording(true);
    setCinematicProgress(0, 0);
    cinematicStartTimeRef.current = performance.now();
    setCinematicPlaying(true);
  }, [cinematicFlight.waypoints.length, setCinematicRecording, setCinematicProgress, setCinematicPlaying]);

  // Catmull-Rom 스플라인 카메라 비행 애니메이션 루프
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cinematicFlight.isPlaying || cinematicFlight.waypoints.length < 2) {
      if (cinematicAnimRef.current) {
        cancelAnimationFrame(cinematicAnimRef.current);
        cinematicAnimRef.current = null;
      }
      return;
    }

    let active = true;

    const animateStep = () => {
      if (!active) return;

      const now = performance.now();
      const elapsedSec = Math.max(0, (now - cinematicStartTimeRef.current) / 1000);
      let progress = elapsedSec / cinematicFlight.durationSec;

      if (progress >= 1.0) {
        if (cinematicFlight.loop) {
          cinematicStartTimeRef.current = performance.now();
          progress = 0;
        } else {
          // 비행 완료
          setCinematicProgress(1.0, cinematicFlight.durationSec);
          setCinematicPlaying(false);
          if (cinematicFlight.isRecording) {
            handleStopRecording();
          }
          return;
        }
      }

      const cam = interpolateCinematicCamera(
        cinematicFlight.waypoints,
        progress,
        cinematicFlight.loop
      );

      map.jumpTo({
        center: [cam.longitude, cam.latitude],
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
      });

      setCinematicProgress(progress, Math.min(elapsedSec, cinematicFlight.durationSec));

      cinematicAnimRef.current = requestAnimationFrame(animateStep);
    };

    cinematicAnimRef.current = requestAnimationFrame(animateStep);

    return () => {
      active = false;
      if (cinematicAnimRef.current) {
        cancelAnimationFrame(cinematicAnimRef.current);
        cinematicAnimRef.current = null;
      }
    };
  }, [
    cinematicFlight.isPlaying,
    cinematicFlight.waypoints,
    cinematicFlight.durationSec,
    cinematicFlight.loop,
    cinematicFlight.isRecording,
    handleStopRecording,
    setCinematicPlaying,
    setCinematicProgress,
  ]);

  // 30. [.geobrief 파일 드래그 앤 드롭 복원 핸들러]
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
        if (map.getLayer('roads-overview-highway')) {
          map.setLayoutProperty('roads-overview-highway', 'visibility', 'visible');
        } else if (map.getLayer('roads-highways')) {
          map.setLayoutProperty('roads-highways', 'visibility', 'visible');
        }
        if (map.getLayer('roads-overview-secondary')) {
          map.setLayoutProperty('roads-overview-secondary', 'visibility', 'visible');
        } else if (map.getLayer('roads-secondary')) {
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
                  sheetNo: metadata.sheetNo || 'GB-2026-002',
                  scale: metadata.scale || '1:5,000',
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
                  sheetNo: metadata.sheetNo || 'GB-2026-002',
                  scale: metadata.scale || '1:5,000',
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
        setGpuBuildingLayersVisibility(map, layers.buildings3D);
        if (lod2BuildingEngineRef.current) {
          lod2BuildingEngineRef.current.setVisible(false);
        }
        // [요구사항 반영] '건축물 3D 돌출' 레이어가 항상 표출 및 최상단 렌더링
        if (map.getLayer('3d-buildings')) {
          map.setLayoutProperty('3d-buildings', 'visibility', 'none');
        }
        if (bldgVis === 'visible') {
          promoteBuildingLayersToTop(map);
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
      className="relative w-full h-full bg-[#0b1320] overflow-hidden"
    >
      {/* 3D 맵 뷰포트 메인 컨테이너 */}
      <div
        className="relative w-full h-full overflow-hidden flex-1"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* MapLibre WebGL Canvas Container (강제 CSS 적용 및 대기 스카이라인 그라데이션) */}
        <div
          ref={mapContainerRef}
          className="w-full h-full min-h-[500px] relative z-[1]"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '500px',
            position: 'relative',
            zIndex: 1,
            background: 'linear-gradient(to bottom, #1e3a8a 0%, #60a5fa 35%, #cbd5e1 65%, #64748b 100%)',
          }}
        />

        {/* [1. 브라우저 화면 내 긴급 에러 오버레이 (Error Overlay)] */}
        <div
          id="map-debug-overlay"
          className={`absolute top-2 left-2 z-[9999] pointer-events-auto transition-all text-xs font-mono rounded-lg shadow-xl backdrop-blur-md border ${
            debugErrors.length > 0
              ? 'bg-red-950/95 border-red-500 text-red-200 p-3 max-h-56 overflow-y-auto max-w-xl'
              : 'bg-black/80 border-emerald-500/60 text-emerald-300 px-3 py-1.5'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                debugErrors.length > 0 ? 'bg-red-500 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <span className="font-bold">
              {debugErrors.length > 0 ? (
                <span className="text-red-400">🚨 렌더링 에러 {debugErrors.length}건 감지</span>
              ) : (
                <span className="text-emerald-300 flex items-center gap-1.5 flex-wrap">
                  <span>✅ WebGL 3D 엔진 정상</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/60 shadow-sm ml-1">
                    [활성 모드: {renderMode3D === 'native' ? '모드 A' : renderMode3D === 'facade' ? '모드 B' : '모드 C'} | 화면 내 렌더링 건물 수: {realtimeMetrics.renderedBuildingCount.toLocaleString()}동 | 활성 레이어: {realtimeMetrics.activeLayersCount}개]
                  </span>
                </span>
              )}
            </span>
            {debugErrors.length > 0 ? (
              <button
                onClick={() => setDebugErrors([])}
                className="text-[10px] bg-red-800 hover:bg-red-700 px-2 py-0.5 rounded text-white font-sans ml-auto"
              >
                로그 초기화
              </button>
            ) : (
              <button
                onClick={() => setIsDebugCollapsed(!isDebugCollapsed)}
                className="text-[10px] text-emerald-400/70 hover:text-emerald-200 underline ml-2 cursor-pointer"
              >
                {isDebugCollapsed ? '상세보기' : '접기'}
              </button>
            )}
          </div>
          {(!isDebugCollapsed || debugErrors.length > 0) && (
            <div className="mt-2 pt-2 border-t border-white/10 text-[11px] leading-relaxed">
              {debugErrors.length === 0 ? (
                <div className="text-emerald-400/90">
                  • 현재 브라우저 런타임 WebGL 및 MapLibre 에러가 0건입니다.<br />
                  • 강원특별자치도 18개 시·군 3D 랜드마크 및 DEM 입체 지형이 정상 렌더링 중입니다.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {debugErrors.map((err, idx) => (
                    <div
                      key={idx}
                      className="break-all whitespace-pre-wrap text-[11px] bg-red-900/60 p-1.5 rounded border border-red-700/60 font-mono"
                    >
                      {err}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 16:9 브리핑 오버레이 프레임워크 */}
        {/* 상단 인라인 편집 가능 보고서 헤더 바 */}
        <BriefingHeader />

        {/* 좌측 상단 카메라 연동 동적 방위표 (North Arrow - React 리렌더링 차단 및 DOM 직접 조작) */}
        <Compass
          bearing={viewport.bearing}
          pitch={viewport.pitch}
          zoom={viewport.zoom}
          onResetNorth={handleResetNorth}
          onAdjustPitch={handleAdjustPitch}
        />

        {/* 좌측 하단 인쇄 규격 동적 축척 바 (Scale Bar - React 리렌더링 차단 및 DOM 직접 조작) */}
        <ScaleBar latitude={viewport.latitude} zoom={viewport.zoom} />

        {/* [교통·인프라 접근성] 16:9 슬라이드 삽입용 정량 분석 표(Table) 오버레이 */}
        <AccessibilityTableOverlay />

        {/* 우측 하단 반투명 범례 카드 (Legend) */}
        <LegendBox />

        {/* [교통·인프라 접근성] 3D 타깃 인프라 플로팅 핀 배지 */}
        {tieLineMarkerScreenPos && (
          <div
            id="tieline-marker-wrap"
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
              id="flight-ceiling-label-wrap"
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
            id="polygon-center-label-wrap"
            className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 z-10 transition-transform duration-75 select-none"
            style={{
              left: `${labelScreenPos.x}px`,
              top: `${labelScreenPos.y}px`,
            }}
          >
            <div className="bg-[#101b2b]/95 backdrop-blur-md border border-emerald-400/80 px-3 py-2 rounded-lg shadow-2xl text-center flex flex-col items-center min-w-[130px]">
              <div className="flex items-center space-x-1 text-[10px] text-emerald-300 font-semibold mb-0.5">
                <Ruler className="w-3 h-3 text-emerald-400" />
                <span>군 유휴부지 산출구역</span>
              </div>
              <div className="text-sm font-mono font-extrabold text-white">
                {polygonArea.sqm.toLocaleString()} ㎡
              </div>
              <div className="text-[11px] font-mono font-bold text-emerald-400">
                약 {polygonArea.pyeong.toLocaleString()} 평
              </div>
              <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-emerald-400/80 absolute -bottom-[6px] left-1/2 -translate-x-1/2" />
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
            id="building-popup-wrap"
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

        {/* [지휘통제 및 보안 관제] 정밀 3D 가시선 (Line of Sight, LOS) 플로팅 HUD 카드 */}
        {(losAnalysis.isActive || losAnalysis.result) && (
          <div className="absolute top-16 right-6 z-30 w-84 max-w-[calc(100vw-3rem)] bg-[#0a151d]/95 backdrop-blur-md border border-cyan-500/80 rounded-xl shadow-2xl p-3.5 text-xs space-y-3 ring-1 ring-cyan-500/30 animate-fade-in">
            {/* 헤더 */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1.5">
                <span className="p-1 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-400">
                  <Target className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-100 text-xs">
                    3D 입체 가시선 (LOS) 분석
                  </h3>
                  <p className="text-[10px] text-cyan-300/80">
                    DEM 고도 기반 140샘플 광선 추적 (Raycasting)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetLosAnalysis}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                title="LOS 분석 초기화"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 단계 안내 */}
            {!losAnalysis.result ? (
              <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-cyan-300 font-semibold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>
                    {!losAnalysis.pointA
                      ? '1단계: 관측점 A (초소/고지대)를 클릭하세요'
                      : '2단계: 목표점 B (시설/접근로)를 클릭하세요'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">
                  {!losAnalysis.pointA
                    ? '지도에서 관측 지점을 클릭하세요. 지표면 +2.5m 기준 시선 시작점이 생성됩니다.'
                    : `관측점 A 설정 완료 (EL. ${losAnalysis.pointA.elevation}m). 목표 지점을 클릭하면 실시간 지형 차폐를 판정합니다.`}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* 판정 배지 */}
                <div
                  className={`p-2 rounded-lg border flex items-center justify-between ${
                    losAnalysis.result.isClear
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-500/60 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    {losAnalysis.result.isClear ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>시계 확보 (Clear LOS)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>시계 차단 (Blocked LOS)</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40">
                    전술 광선 유효
                  </span>
                </div>

                {/* 거리 및 표고 정보 */}
                <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#0f1d2a] p-2.5 rounded-lg border border-[#1d354a]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">직선거리 (3D)</span>
                    <span className="font-bold text-slate-100 font-mono text-xs">
                      {losAnalysis.result.distanceMeters.toLocaleString()} m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">고저차 (Δh)</span>
                    <span className="font-bold text-slate-100 font-mono text-xs">
                      {losAnalysis.result.elevationDiffMeters > 0 ? '+' : ''}
                      {losAnalysis.result.elevationDiffMeters} m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">수평거리 (2D)</span>
                    <span className="font-bold text-slate-300 font-mono">
                      {losAnalysis.result.horizontalDistanceMeters.toLocaleString()} m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">관측 / 목표 표고</span>
                    <span className="font-bold text-slate-300 font-mono text-[10px]">
                      EL.{losAnalysis.pointA?.elevation}m → EL.{losAnalysis.pointB?.elevation}m
                    </span>
                  </div>
                </div>

                {/* 최대 차폐 장애물 분석 */}
                <div
                  className={`p-2.5 rounded-lg border text-[10.5px] space-y-1.5 ${
                    losAnalysis.result.isClear
                      ? 'bg-emerald-950/40 border-emerald-800/40'
                      : 'bg-rose-950/50 border-rose-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className={losAnalysis.result.isClear ? 'text-emerald-300' : 'text-rose-300'}>
                      {losAnalysis.result.isClear ? '경로상 최고 지형 고도' : '최대 차폐 장애물 고도'}
                    </span>
                    <span className={`font-mono font-bold text-xs ${losAnalysis.result.isClear ? 'text-emerald-200' : 'text-rose-200'}`}>
                      EL. {losAnalysis.result.maxObstacleElevation || (losAnalysis.result.blockedPoint?.elevation ?? 0)} m
                    </span>
                  </div>

                  {losAnalysis.result.blockedPoint ? (
                    <>
                      <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <span className="text-slate-400">최대 차폐 돌출량</span>
                        <span className="font-mono text-rose-300 font-bold">
                          +{losAnalysis.result.maxPenetrationDepth || (losAnalysis.result.blockedPoint.elevation - losAnalysis.result.blockedPoint.rayElevation).toFixed(1)} m
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <span className="text-slate-400">차단 지점 거리 (A 기준)</span>
                        <span className="font-mono text-slate-200">
                          {losAnalysis.result.blockedPoint.distanceFromA.toLocaleString()} m
                        </span>
                      </div>
                      <div className="text-[9.5px] text-rose-300/90 leading-tight pt-0.5">
                        ⚠️ [시계 차단 봉우리] 산등성이에 가려져 직시가 불가능합니다. (3D 적색 경고 마커 및 펄스 표출 중)
                      </div>
                    </>
                  ) : (
                    <div className="text-[9.5px] text-emerald-300/90 leading-tight pt-0.5">
                      ✅ [직시 가능 (Clear LOS)] 관측점과 목표점 간 지형 간섭이 없습니다. (네온 그린 빔 및 발광 펄스 활성화)
                    </div>
                  )}

                  <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between font-mono">
                    <span>DEM 정밀 샘플링</span>
                    <span className="text-slate-300">{losAnalysis.result.samplingCount}개 지점 (5m 간격)</span>
                  </div>
                </div>

                {/* 재분석 / 초기화 액션 */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={startLosAnalysis}
                    className="flex-1 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Target className="w-3.5 h-3.5" />
                    새로운 LOS 측정
                  </button>
                  <button
                    type="button"
                    onClick={resetLosAnalysis}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
                  >
                    초기화
                  </button>
                </div>
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
              id={`pin-marker-wrap-${pin.id}`}
              className="absolute pointer-events-auto z-30 select-none will-change-transform"
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

        {/* [신규] WebGL 컨텍스트 보호 2D 자동 전환 알림 배너 */}
        {webglFallbackWarning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-rose-950/90 border border-rose-500/80 text-rose-200 px-4 py-2 rounded-xl backdrop-blur-md shadow-2xl flex items-center gap-3 animate-bounce">
            <span className="text-xs sm:text-sm font-semibold">{webglFallbackWarning}</span>
            <button
              onClick={() => setWebglFallbackWarning(null)}
              className="text-xs bg-rose-800/80 hover:bg-rose-700 text-white px-2 py-0.5 rounded transition-colors"
            >
              닫기
            </button>
          </div>
        )}



        {/* [4단계 신규] 3D 시네마틱 방송용 OSD 레터박스 및 비행 계기판 오버레이 */}
        <CinematicOsdOverlay
          currentBearing={currentBearing}
          currentPitch={currentPitch}
          currentZoom={currentZoom}
          currentLng={viewport.longitude}
          currentLat={viewport.latitude}
          currentElevation={
            mapRef.current?.queryTerrainElevation
              ? (mapRef.current.queryTerrainElevation([viewport.longitude, viewport.latitude]) || 180)
              : 180
          }
          onStopFlight={handleStopFlight}
          onStopRecording={handleStopRecording}
        />

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

      {/* [4단계 신규] 3D 시네마틱 카메라 비행 경로 빌더 & 동영상 녹화 모달 */}
      <CinematicBuilderModal
        isOpen={cinematicFlight.isBuilderOpen}
        onClose={() => setCinematicBuilderOpen(false)}
        currentViewport={{
          longitude: viewport.longitude,
          latitude: viewport.latitude,
          zoom: viewport.zoom,
          pitch: viewport.pitch,
          bearing: viewport.bearing,
        }}
        onFlyToWaypoint={handleFlyToWaypoint}
        onStartFlight={handleStartFlight}
        onPauseFlight={handlePauseFlight}
        onStopFlight={handleStopFlight}
        onStartRecordingWithFlight={handleStartRecordingWithFlight}
      />
    </div>
  );
};
