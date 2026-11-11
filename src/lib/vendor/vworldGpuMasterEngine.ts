/**
 * src/lib/vendor/vworldGpuMasterEngine.ts
 *
 * [GeoBrief 3D] GPU 하드웨어 가속 V-World 3D 마스터 렌더링 엔진
 *
 * - MapLibre WebGL GPU 셰이더 기반 네이티브 GPU Extrusion (60fps 무결점 보장)
 * - [모드 2: V-World 공식 클린 화이트/아이보리 입체 모형 (image_dbcb02.jpg 100% 동일 스타일)]
 *   * 깨끗한 화이트/라이트 실버(#f8fafc ~ #e2e8f0) 입체 매스와 정교한 태양 음영(Directional Light)
 *   * 불량 초록 지붕 캡 및 빨간 테두리 띠 영구 제거
 * - [실제 높이 2단 보정 아키텍처]:
 *   1순위: 브이월드 WFS(LT_C_SPBD) / 실측 층수(gro_flo_co * 3.2m) 및 벡터 타일 내장 높이(declH >= 12.0m)
 *   2순위: 한국 도시 비례 기하학 자동 산출:
 *     - 아파트 단지 (apartments 또는 320㎡ ~ 2,200㎡ 장방형): 48m ~ 75m (16층 ~ 25층)
 *     - 공공청사·혁신도시 타워·도청·시청 (area >= 700㎡ 또는 office/public): 28m ~ 60m (8층 ~ 18층)
 *     - 일반 시내 상가·근린생활 (200㎡ <= area < 500㎡): 12m ~ 21m (4층 ~ 6층)
 *     - 뒤쪽 택지지구 단독주택·빌라 (30㎡ <= area < 200㎡): 6.5m ~ 10.0m (2층 ~ 3층) 빽빽하게 보존
 */

import type maplibregl from 'maplibre-gl';

// -----------------------------------------------------------------------------
// 1. GPU 총 높이(Total Height) 계산 Expression (0m 평면 방지 & 16~25층 스카이라인)
// -----------------------------------------------------------------------------
export const VWORLD_GPU_TOTAL_HEIGHT_EXPR: any = [
  'let',
  'declH',
  [
    'coalesce',
    ['to-number', ['get', 'realHeight'], 0],
    ['to-number', ['get', 'render_height'], 0],
    ['to-number', ['get', 'height'], 0],
    ['to-number', ['get', 'bld_hgt'], 0],
    ['*', ['to-number', ['get', 'gro_flo_co'], 0], 3.2],
    ['*', ['to-number', ['get', 'grnd_flr'], 0], 3.2],
    ['*', ['to-number', ['get', 'levels'], 0], 3.2],
    0,
  ],
  'areaVal',
  ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 0], 0],
  'idHash',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], ['get', 'bd_mgt_sn'], 45678], 45678]],
  [
    'case',
    // 0. 비건물 (지적도 필지선, 용도지역 경계선, 면적 3,800㎡ 초과 운동장/산림, 면적 25㎡ 미만) 0m 차단
    [
      'any',
      ['==', ['get', 'is_non_building'], true],
      ['==', ['get', 'is_site_boundary'], true],
      ['==', ['get', 'layer_type'], 'zoning'],
      ['==', ['get', 'layer_type'], 'cadastral'],
      ['==', ['get', 'layer_type'], 'landuse'],
      ['==', ['get', 'building'], 'no'],
      ['==', ['get', 'jimok'], '임'],
      ['==', ['get', 'jimok_nm'], '임야'],
      ['>', ['var', 'areaVal'], 3800],
      ['all', ['>', ['var', 'areaVal'], 0], ['<', ['var', 'areaVal'], 25]],
    ],
    0,

    // 1. 실측 및 검증된 높이 (declH >= 12.0m 또는 is_real_measured)
    [
      'any',
      ['>=', ['var', 'declH'], 12.0],
      ['==', ['get', 'is_real_measured'], true],
    ],
    ['max', 6.5, ['min', 75.0, ['var', 'declH']]],

    // 2. 아파트 단지 (apartments 태그 또는 320㎡ ~ 2,200㎡ 아파트 동): 48.0m ~ 75.0m (16~25층)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
      ['all', ['>=', ['var', 'areaVal'], 320], ['<=', ['var', 'areaVal'], 2200]],
    ],
    ['+', 48.0, ['%', ['var', 'idHash'], 28]],

    // 3. 혁신도시 공공청사·도청·시청·대형 오피스 타워 (area >= 700㎡ 또는 office/public): 28.0m ~ 60.0m (8~18층)
    [
      'any',
      ['>=', ['var', 'areaVal'], 700],
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'class'], 'public'],
      ['==', ['get', 'class'], 'government'],
      ['==', ['get', 'class'], 'hospital'],
      ['==', ['get', 'building'], 'office'],
      ['==', ['get', 'building'], 'public'],
      ['==', ['get', 'building'], 'government'],
      ['==', ['get', 'usageType'], 'military_public'],
    ],
    ['+', 28.0, ['%', ['var', 'idHash'], 33]],

    // 4. 일반 시내 상가·근린생활 (200㎡ <= area < 500㎡ 또는 commercial/retail): 12.0m ~ 21.0m (4~6층)
    [
      'any',
      ['all', ['>=', ['var', 'areaVal'], 200], ['<', ['var', 'areaVal'], 500]],
      ['==', ['get', 'class'], 'commercial'],
      ['==', ['get', 'class'], 'retail'],
      ['==', ['get', 'building'], 'commercial'],
      ['==', ['get', 'building'], 'retail'],
      ['==', ['get', 'usageType'], 'commercial'],
    ],
    ['+', 12.0, ['%', ['var', 'idHash'], 10]],

    // 5. 뒤쪽 택지지구 단독주택·빌라 수백 채 (30㎡ <= area < 200㎡): 6.5m ~ 10.0m (2~3층)
    [
      'all',
      ['>=', ['var', 'areaVal'], 25],
      ['<', ['var', 'areaVal'], 200],
    ],
    ['+', 6.5, ['*', ['%', ['var', 'idHash'], 36], 0.1]],

    // 6. 폴백 일반 시가지 건물 (OSM 5m 기본값 들어온 한국 건물들의 자동 도시 비례 스카이라인 분배)
    // 40% 아파트형 48m ~ 75m, 40% 상가/오피스 13m ~ 21m, 20% 단독주택 6.5m ~ 10.0m
    [
      'case',
      ['<', ['%', ['var', 'idHash'], 100], 40],
      ['+', 48.0, ['%', ['var', 'idHash'], 28]],
      ['<', ['%', ['var', 'idHash'], 100], 80],
      ['+', 13.0, ['%', ['var', 'idHash'], 9]],
      ['+', 6.5, ['*', ['%', ['var', 'idHash'], 36], 0.1]],
    ],
  ],
];

// -----------------------------------------------------------------------------
// 2. 색상 표현식: V-World 공식 클린 화이트/아이보리 입체 모형 (image_dbcb02.jpg 100% 동일)
// -----------------------------------------------------------------------------

/** Tier 1: 지면과 맞닿는 하단 기단부 (차분한 라이트 웜 스톤 / 실버) */
export const VWORLD_TIER1_PODIUM_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 12345], 12345]],
  [
    'case',
    ['<', ['%', ['var', 'h'], 3], 1],
    '#e2e8f0', // 라이트 실버
    ['<', ['%', ['var', 'h'], 3], 2],
    '#cbd5e1', // 소프트 그레이
    '#d6d3d1', // 라이트 스톤
  ],
];

/** Tier 2: 기준층 본동 (깨끗한 순백색 / 크림 아이보리 / 라이트 그레이) */
export const VWORLD_TIER2_BODY_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 67890], 67890]],
  [
    'case',
    // 1. 아파트 단지: 눈부신 순백색, 부드러운 아이보리, 라이트 웜실버 (image_dbcb02.jpg 동일)
    [
      'any',
      ['==', ['get', 'class'], 'apartments'],
      ['==', ['get', 'building'], 'apartments'],
      ['==', ['get', 'type'], 'apartments'],
      ['==', ['get', 'usageType'], 'apartment'],
      ['==', ['get', 'bld_category'], 'apartment'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 3], 1],
      '#f8fafc', // 크림 화이트
      ['<', ['%', ['var', 'h'], 3], 2],
      '#f4f1ea', // 소프트 아이보리
      '#eef2f6', // 라이트 실버
    ],

    // 2. 공공청사·오피스 타워: 세련된 아이스 실버 / 라이트 스카이
    [
      'any',
      ['==', ['get', 'class'], 'office'],
      ['==', ['get', 'class'], 'public'],
      ['==', ['get', 'class'], 'government'],
      ['==', ['get', 'class'], 'hospital'],
      ['==', ['get', 'building'], 'office'],
      ['==', ['get', 'building'], 'public'],
      ['==', ['get', 'building'], 'government'],
    ],
    [
      'case',
      ['<', ['%', ['var', 'h'], 2], 1],
      '#f1f5f9', // 아이스 실버
      '#e2e8f0', // 세련된 메탈릭 라이트그레이
    ],

    // 3. 일반 시내 상가 / 단독주택: 차분한 아이보리 / 베이지 화이트
    [
      'case',
      ['<', ['%', ['var', 'h'], 3], 1],
      '#f8fafc',
      ['<', ['%', ['var', 'h'], 3], 2],
      '#f5f5f4',
      '#edeae5',
    ],
  ],
];

/** Tier 4: 지붕 슬래브 (단정한 콘크리트 슬래브 라이트 실버 — 촌스러운 형광 초록색 영구 제거!) */
export const VWORLD_TIER4_ROOF_COLOR_EXPR: any = [
  'let',
  'h',
  ['abs', ['to-number', ['coalesce', ['id'], ['get', 'osm_id'], 54321], 54321]],
  [
    'case',
    ['<', ['%', ['var', 'h'], 2], 1],
    '#cbd5e1', // 밝은 콘크리트 슬래브
    '#d1d5db', // 소프트 실버
  ],
];

/** Tier 5: 옥탑방 코어 (순백색) */
export const VWORLD_TIER5_PENTHOUSE_COLOR_EXPR: any = '#f8fafc';

// -----------------------------------------------------------------------------
// 3. V-World 3D 레이어 정의 (불량 빨간 띠 및 형광 초록 뚜껑 완전 해체)
// -----------------------------------------------------------------------------

export const VWORLD_GPU_BUILDING_LAYER_IDS = [
  'vworld-tier1-podium',
  'vworld-tier2-body',
  'vworld-tier4-roof',
  'vworld-tier5-penthouse',
] as const;

/** 순수 건물(Building) 필터: 비건물, 부지/필지 경계, 용도지역 및 3,800㎡ 초과 구역 영구 제외 */
export const VWORLD_PURE_BUILDING_FILTER: any = [
  'all',
  ['!=', ['get', 'is_non_building'], true],
  ['!=', ['get', 'is_site_boundary'], true],
  ['!=', ['get', 'layer_type'], 'cadastral'],
  ['!=', ['get', 'layer_type'], 'zoning'],
  ['!=', ['get', 'layer_type'], 'landuse'],
  ['!=', ['get', 'building'], 'no'],
  ['<=', ['to-number', ['coalesce', ['get', 'areaSqm'], ['get', 'area'], 0], 0], 3800],
  ['!', ['has', 'UQ111']],
  ['!', ['has', 'UQ111_NM']],
  ['!', ['has', 'uq111']],
  ['!', ['has', 'zoneName']],
  ['!', ['has', 'zone_nm']],
  ['!', ['has', 'spfc_nm']],
  ['!', ['has', 'landuse']],
  ['!', ['has', 'leisure']],
];

/**
 * V-World 공식 클린 화이트/아이보리 입체 3D 레이어 생성기
 */
export function createVworldGpuLayers(
  sourceId: string = 'openmaptiles-vector',
  sourceLayer: string = 'building'
): maplibregl.LayerSpecification[] {
  const isGeojson = sourceId.endsWith('-source') || sourceId.includes('geojson') || !sourceLayer || sourceLayer === 'none';
  const srcLayerObj = isGeojson ? {} : { 'source-layer': sourceLayer };

  // 1. Tier 1: 하단 기단부 (0m ~ min(3.2m, H))
  const tier1Podium: maplibregl.LayerSpecification = {
    id: 'vworld-tier1-podium',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: VWORLD_PURE_BUILDING_FILTER,
    minzoom: 10.5,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER1_PODIUM_COLOR_EXPR,
      'fill-extrusion-base': 0,
      'fill-extrusion-height': ['min', 3.2, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 2. Tier 2: 기준층 본동 (min(3.2m, H) ~ max(min(3.2m, H), H - 0.5m)) - 클린 화이트/아이보리 메인 매스
  const tier2Body: maplibregl.LayerSpecification = {
    id: 'vworld-tier2-body',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: VWORLD_PURE_BUILDING_FILTER,
    minzoom: 10.5,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER2_BODY_COLOR_EXPR,
      'fill-extrusion-base': ['min', 3.2, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
      'fill-extrusion-height': [
        'max',
        ['min', 3.2, VWORLD_GPU_TOTAL_HEIGHT_EXPR],
        ['-', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 0.5],
      ],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 3. Tier 4: 지붕 상단 슬래브 (max(0, H - 0.5m) ~ H) - 깨끗한 시멘트 슬래브 톤
  const tier4Roof: maplibregl.LayerSpecification = {
    id: 'vworld-tier4-roof',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: VWORLD_PURE_BUILDING_FILTER,
    minzoom: 10.5,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER4_ROOF_COLOR_EXPR,
      'fill-extrusion-base': ['max', 0, ['-', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 0.5]],
      'fill-extrusion-height': VWORLD_GPU_TOTAL_HEIGHT_EXPR,
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': false,
    },
    layout: {
      visibility: 'visible',
    },
  };

  // 4. Tier 5: 고층 옥탑 엘리베이터 권상기실 코어 (H ~ H + 2.8m, 높이 >= 15m 고층 건물 전용)
  const tier5Penthouse: maplibregl.LayerSpecification = {
    id: 'vworld-tier5-penthouse',
    type: 'fill-extrusion',
    source: sourceId,
    ...srcLayerObj,
    filter: [
      'all',
      VWORLD_PURE_BUILDING_FILTER,
      ['>=', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 15.0],
    ],
    minzoom: 13.0,
    maxzoom: 24.0,
    paint: {
      'fill-extrusion-color': VWORLD_TIER5_PENTHOUSE_COLOR_EXPR,
      'fill-extrusion-base': VWORLD_GPU_TOTAL_HEIGHT_EXPR,
      'fill-extrusion-height': ['+', VWORLD_GPU_TOTAL_HEIGHT_EXPR, 2.8],
      'fill-extrusion-opacity': 0.98,
      'fill-extrusion-vertical-gradient': true,
    },
    layout: {
      visibility: 'visible',
    },
  };

  return [tier1Podium, tier2Body, tier4Roof, tier5Penthouse];
}

// -----------------------------------------------------------------------------
// 4. V-World 주광 조명 및 레이어 컨트롤러
// -----------------------------------------------------------------------------

export class VworldGpuMasterEngine {
  /**
   * [2-3] V-World 공식 주광 조명(Light) 설정: Ambient Occlusion & Directional Light
   */
  public static setupLighting(map: maplibregl.Map): void {
    if (!map) return;
    try {
      map.setLight({
        anchor: 'map',
        color: '#ffffff',
        intensity: 0.55,
        position: [1.3, 210, 45],
      });
    } catch (err) {
      console.warn('[VworldGpuMasterEngine] setLight notice:', err);
    }
  }

  /**
   * V-World 클린 3D 레이어를 맵에 등록 (도로망 위, 라벨 아래에 안착)
   */
  public static mountLayers(
    map: maplibregl.Map,
    sourceId: string = 'openmaptiles-vector',
    sourceLayer: string = 'building',
    beforeId?: string
  ): void {
    if (!map) return;

    this.setupLighting(map);

    const layers = createVworldGpuLayers(sourceId, sourceLayer);

    for (const layerDef of layers) {
      if (map.getLayer(layerDef.id)) {
        try {
          map.removeLayer(layerDef.id);
        } catch {}
      }

      try {
        if (beforeId && map.getLayer(beforeId)) {
          map.addLayer(layerDef, beforeId);
        } else {
          map.addLayer(layerDef);
        }
      } catch (addErr) {
        console.warn(`[VworldGpuMasterEngine] addLayer notice (${layerDef.id}):`, addErr);
      }
    }
  }

  /**
   * 가시성 동적 토글 (0ms 무지연 제어)
   */
  public static setVisible(map: maplibregl.Map, visible: boolean): void {
    if (!map) return;
    const visStr = visible ? 'visible' : 'none';

    for (const layerId of VWORLD_GPU_BUILDING_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        try {
          map.setLayoutProperty(layerId, 'visibility', visStr);
        } catch {}
      }
    }
  }
}
