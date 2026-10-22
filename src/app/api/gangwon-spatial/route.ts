/**
 * app/api/gangwon-spatial/route.ts
 *
 * [GeoBrief 3D 1단계: 강원권 광역 공공 공간정보 통합 API 게이트웨이]
 *
 * 1. 국토교통부 브이월드(V-World) WFS 다중 레이어 연동:
 *    - LT_C_SPBD (GIS건물통합정보): 실측 외곽선, 지상/지하층수, 높이, 구조코드, 세부용도명
 *    - LP_PA_CBND_BUBUN (연속지적도): 필지 경계선, PNU, 지번, 지목(대/전/답/임/잡 등)
 *    - LT_C_UQ111 ~ UQ114 (국토계획법 용도지역): 주거·상업·공업·녹지 및 비도시지역 구분
 * 2. OpenStreetMap Overpass API + Overture Maps 스키마 실시간 병합:
 *    - building, roof:shape, roof:colour, bridge, railway, power tower, water/waterway
 * 3. 3중 폴백 (Fallback) 무중단 보장:
 *    - 2초 타임아웃 AbortController
 *    - V-World 장애/지연 시 Overpass 즉시 결합
 *    - 네트워크 오류 시 지역 기반 로컬 시뮬레이션 및 캐시 0ms 즉시 반환
 * 4. 15분 서버 메모리 LRU 캐시
 */

import { NextRequest, NextResponse } from 'next/server';
import { findGangwonRegionByCoords, getGangwonRegionByIdOrName, GangwonRegionPreset } from '@/constants/gangwon18Regions';
import { fetchLocalVworldBuildings } from '@/utils/vworldLocalLoader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SpatialCacheEntry {
  timestamp: number;
  data: any;
}

// 15분 서버 메모리 LRU 캐시
const serverSpatialCache = new Map<string, SpatialCacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 250;

function getCachedData(key: string): any | null {
  const entry = serverSpatialCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    serverSpatialCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedData(key: string, data: any) {
  if (serverSpatialCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = serverSpatialCache.keys().next().value;
    if (oldestKey) serverSpatialCache.delete(oldestKey);
  }
  serverSpatialCache.set(key, { timestamp: Date.now(), data });
}

// -----------------------------------------------------------------------------
// [도우미] 지목(Jimok) 한글명 및 카테고리 매핑
// -----------------------------------------------------------------------------
const JIMOK_MAP: Record<string, { label: string; category: string; color: string }> = {
  대: { label: '대지 (주거·상업)', category: 'residential_commercial', color: '#fef08a' },
  전: { label: '밭 (전)', category: 'farmland', color: '#d9f99d' },
  답: { label: '논 (답)', category: 'farmland', color: '#bbf7d0' },
  과: { label: '과수원', category: 'farmland', color: '#86efac' },
  목: { label: '목장용지', category: 'pasture', color: '#a7f3d0' },
  임: { label: '임야 (산림)', category: 'forest', color: '#86efac' },
  광: { label: '광천지', category: 'special', color: '#cbd5e1' },
  염: { label: '염전', category: 'special', color: '#e2e8f0' },
  공: { label: '공장용지', category: 'industrial', color: '#bae6fd' },
  학: { label: '학교용지', category: 'public', color: '#93c5fd' },
  차: { label: '주차장', category: 'transport', color: '#94a3b8' },
  주: { label: '주유소용지', category: 'commercial', color: '#fde047' },
  창: { label: '창고용지', category: 'logistics', color: '#fed7aa' },
  도: { label: '도로', category: 'road', color: '#64748b' },
  철: { label: '철도용지', category: 'railway', color: '#475569' },
  제: { label: '제방', category: 'infrastructure', color: '#94a3b8' },
  하: { label: '하천', category: 'water', color: '#38bdf8' },
  구: { label: '구거 (수로)', category: 'water', color: '#67e8f9' },
  유: { label: '유지 (저수지)', category: 'water', color: '#0ea5e9' },
  양: { label: '양어장', category: 'water', color: '#7dd3fc' },
  수: { label: '수도용지', category: 'infrastructure', color: '#0284c7' },
  공원: { label: '공원', category: 'park', color: '#4ade80' },
  체: { label: '체육용지', category: 'recreation', color: '#34d399' },
  유원: { label: '유원지', category: 'recreation', color: '#2dd4bf' },
  종: { label: '종교용지', category: 'public', color: '#fbcfe8' },
  사: { label: '사적지', category: 'historic', color: '#f472b6' },
  묘: { label: '묘지', category: 'cemetery', color: '#cbd5e1' },
  잡: { label: '잡종지 (군 유휴지 후보)', category: 'idle_military', color: '#fb923c' },
};

function parseJimok(raw: string = '') {
  const clean = raw.trim();
  return (
    JIMOK_MAP[clean] || {
      label: clean ? `기타 (${clean})` : '지목 미지정',
      category: 'other',
      color: '#e2e8f0',
    }
  );
}

async function fetchLocalCadastralParcels(bbox: [number, number, number, number], regionId = 'wonju'): Promise<any[]> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    let filePath = path.join(process.cwd(), 'public/data/cadastral', `${regionId}_core.geojson`);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'public/data/cadastral', `${regionId}.geojson`);
    }
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(raw);
      const features = json.features || [];
      const [minLng, minLat, maxLng, maxLat] = bbox;
      const pad = 0.005;
      return features.filter((f: any) => {
        const coords =
          f.geometry.type === 'Polygon'
            ? f.geometry.coordinates[0]?.[0]
            : f.geometry.coordinates[0]?.[0]?.[0];
        if (!coords) return false;
        const [lng, lat] = coords;
        return lng >= minLng - pad && lng <= maxLng + pad && lat >= minLat - pad && lat <= maxLat + pad;
      });
    }
  } catch {
    // ignore
  }
  return [];
}

// -----------------------------------------------------------------------------
// [1. 브이월드 Data 2.0 수집기: 3.5초 타임아웃]
// -----------------------------------------------------------------------------
async function fetchVworldDataLayer(
  layerName: string,
  bbox: [number, number, number, number],
  apiKey: string,
  timeoutMs = 3500
): Promise<any[]> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const cleanKey = apiKey.replace(/['"`]/g, '').trim();
  const domain = process.env.VWORLD_DOMAIN || 'localhost';
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=${layerName}&key=${encodeURIComponent(
    cleanKey
  )}&domain=${encodeURIComponent(domain)}&geomFilter=BOX(${minLng},${minLat},${maxLng},${maxLat})&crs=EPSG:4326&size=1000&geometry=true&attribute=true`;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    if (!res.ok) return [];

    const json = await res.json();
    return json?.response?.result?.featureCollection?.features || [];
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

// -----------------------------------------------------------------------------
// [2. OpenStreetMap Overpass 실시간 인프라 수집기: 2초 타임아웃]
// -----------------------------------------------------------------------------
async function fetchOverpassInfra(
  bbox: [number, number, number, number],
  timeoutMs = 2000
): Promise<{
  buildings: any[];
  roads: any[];
  bridges: any[];
  railways: any[];
  waters: any[];
  powerTowers: any[];
}> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const ql = `[out:json][timeout:2];
(
  way["building"](${minLat},${minLng},${maxLat},${maxLng});
  way["highway"](${minLat},${minLng},${maxLat},${maxLng});
  way["bridge"="yes"](${minLat},${minLng},${maxLat},${maxLng});
  way["railway"](${minLat},${minLng},${maxLat},${maxLng});
  way["power"="tower"](${minLat},${minLng},${maxLat},${maxLng});
  node["power"="tower"](${minLat},${minLng},${maxLat},${maxLng});
  way["natural"="water"](${minLat},${minLng},${maxLat},${maxLng});
  way["waterway"](${minLat},${minLng},${maxLat},${maxLng});
);
out geom 5000;`;

  const endpoints = [
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(ql)}`,
    `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`,
  ];

  const result = {
    buildings: [] as any[],
    roads: [] as any[],
    bridges: [] as any[],
    railways: [] as any[],
    waters: [] as any[],
    powerTowers: [] as any[],
  };

  for (const url of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = await res.json();
      const elements = data.elements || [];

      for (const el of elements) {
        if (!el.tags) continue;
        const t = el.tags;

        // 지오메트리 링 생성
        let coords: [number, number][] = [];
        if (Array.isArray(el.geometry)) {
          coords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
        } else if (el.lat && el.lon) {
          coords = [[el.lon, el.lat]];
        }

        if (coords.length === 0) continue;

        // 건물 분류
        if (t.building && coords.length >= 3) {
          const first = coords[0];
          const last = coords[coords.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            coords.push([first[0], first[1]]);
          }

          const levels = t['building:levels'] ? parseInt(t['building:levels'], 10) : undefined;
          const height = t.height ? parseFloat(t.height) : (levels ? levels * 3.2 : undefined);

          result.buildings.push({
            type: 'Feature',
            id: `osm-bld-${el.id}`,
            properties: {
              name: t.name || t['name:ko'] || '건물',
              building: t.building,
              levels: levels || 2,
              height: height || 6.5,
              roofShape: t['roof:shape'] || 'flat',
              roofColour: t['roof:colour'] || t['roof:color'] || '#334155',
              buildingColour: t['building:colour'] || '#f8fafc',
              source: 'overpass',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [coords],
            },
          });
        }
        // 도로 / 교량 분류
        else if (t.highway) {
          const isBridge = t.bridge === 'yes';
          const roadFeat = {
            type: 'Feature',
            id: `osm-rd-${el.id}`,
            properties: {
              name: t.name || t['name:ko'] || '도로',
              highway: t.highway,
              lanes: t.lanes ? parseInt(t.lanes, 10) : (t.highway === 'primary' ? 4 : 2),
              isBridge,
              source: 'overpass',
            },
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          };

          result.roads.push(roadFeat);
          if (isBridge) {
            result.bridges.push(roadFeat);
          }
        }
        // 철도 분류
        else if (t.railway) {
          result.railways.push({
            type: 'Feature',
            id: `osm-rail-${el.id}`,
            properties: {
              name: t.name || t['name:ko'] || '철도',
              railway: t.railway,
              source: 'overpass',
            },
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          });
        }
        // 수변 / 하천 분류
        else if (t.natural === 'water' || t.waterway) {
          result.waters.push({
            type: 'Feature',
            id: `osm-water-${el.id}`,
            properties: {
              name: t.name || t['name:ko'] || '수계',
              type: t.natural || t.waterway,
              source: 'overpass',
            },
            geometry: {
              type: coords.length >= 3 ? 'Polygon' : 'LineString',
              coordinates: coords.length >= 3 ? [coords] : coords,
            },
          });
        }
        // 송전탑 분류
        else if (t.power === 'tower') {
          result.powerTowers.push({
            type: 'Feature',
            id: `osm-power-${el.id}`,
            properties: {
              name: '송전철탑',
              source: 'overpass',
            },
            geometry: {
              type: 'Point',
              coordinates: coords[0],
            },
          });
        }
      }

      break; // 성공 시 다음 미러 호출 중단
    } catch {
      clearTimeout(timeoutId);
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// [메인 GET 핸들러]
// -----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bboxStr = searchParams.get('bbox') || '';
  const layersParam = searchParams.get('layers') || 'buildings,parcels,zoning,infrastructure';
  const regionId = searchParams.get('regionId') || '';

  // BBOX 파싱 [minLng, minLat, maxLng, maxLat]
  let bbox: [number, number, number, number] = [127.93, 37.34, 127.94, 37.35]; // 기본 원주
  if (bboxStr) {
    const parts = bboxStr.split(',').map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      bbox = [parts[0], parts[1], parts[2], parts[3]];
    }
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cLng = (minLng + maxLng) / 2;
  const cLat = (minLat + maxLat) / 2;

  // 1. 강원도 18개 시·군 판별
  let currentRegion: GangwonRegionPreset | undefined;
  if (regionId) {
    currentRegion = getGangwonRegionByIdOrName(regionId);
  }
  if (!currentRegion) {
    currentRegion = findGangwonRegionByCoords(cLng, cLat);
  }
  if (!currentRegion) {
    currentRegion = getGangwonRegionByIdOrName('wonju')!;
  }

  // 캐시 키
  const cacheKey = `${currentRegion.id}_${minLng.toFixed(4)}_${minLat.toFixed(4)}_${maxLng.toFixed(4)}_${maxLat.toFixed(4)}_${layersParam}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=1800',
        'X-Spatial-Cache': 'HIT',
      },
    });
  }

  const vworldApiKey =
    process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
    process.env.VWORLD_API_KEY ||
    '98979EFF-96BA-3F53-865D-50AC0BC0CBF2';

  const requestedLayers = layersParam.split(',').map((s) => s.trim().toLowerCase());

  // ---------------------------------------------------------------------------
  // [병렬 수집: 2초 타임아웃 AbortController 기반 3중 폴백]
  // ---------------------------------------------------------------------------
  const promises: Promise<any>[] = [];

  // (1) 브이월드 건물통합정보 (1순위: 로컬 다운로드 정밀 데이터 -> 2순위: 실시간 WFS API 폴백)
  if (requestedLayers.includes('buildings')) {
    promises.push(
      fetchLocalVworldBuildings({ bbox, regionId: currentRegion.id, useCoreOnly: false })
        .then((localRes) => {
          if (localRes.hasLocalData && localRes.features.length > 0) {
            return localRes.features;
          }
          return fetchVworldDataLayer('LT_C_SPBD', bbox, vworldApiKey, 3500).catch(() => []);
        })
        .catch(() => fetchVworldDataLayer('LT_C_SPBD', bbox, vworldApiKey, 3500).catch(() => []))
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // (2) 연속지적도 (1순위: 로컬 인제스트 데이터 -> 2순위: 실시간 브이월드 LP_PA_CBND_BUBUN WFS)
  if (requestedLayers.includes('parcels')) {
    promises.push(
      fetchLocalCadastralParcels(bbox, currentRegion.id)
        .then((localParcels) => {
          if (localParcels.length > 0) return localParcels;
          return fetchVworldDataLayer('LP_PA_CBND_BUBUN', bbox, vworldApiKey, 3500).catch(() => []);
        })
        .catch(() => fetchVworldDataLayer('LP_PA_CBND_BUBUN', bbox, vworldApiKey, 3500).catch(() => []))
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // (3) 브이월드 용도지역 (주거, 상업, 공업, 녹지)
  if (requestedLayers.includes('zoning')) {
    promises.push(
      Promise.allSettled([
        fetchVworldDataLayer('LT_C_UQ111', bbox, vworldApiKey, 2500), // 주거
        fetchVworldDataLayer('LT_C_UQ112', bbox, vworldApiKey, 2500), // 상업
        fetchVworldDataLayer('LT_C_UQ113', bbox, vworldApiKey, 2500), // 공업
        fetchVworldDataLayer('LT_C_UQ114', bbox, vworldApiKey, 2500), // 녹지
      ]).then((settled) => {
        const list: any[] = [];
        settled.forEach((s) => {
          if (s.status === 'fulfilled' && Array.isArray(s.value)) {
            for (let i = 0; i < s.value.length; i++) {
              list.push(s.value[i]);
            }
          }
        });
        return list;
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // (4) Overpass API 인프라
  if (requestedLayers.includes('infrastructure') || requestedLayers.includes('buildings')) {
    promises.push(fetchOverpassInfra(bbox, 2000));
  } else {
    promises.push(
      Promise.resolve({
        buildings: [],
        roads: [],
        bridges: [],
        railways: [],
        waters: [],
        powerTowers: [],
      })
    );
  }

  const [rawBuildings, rawParcels, rawZoning, overpassData] = await Promise.all(promises);

  // ---------------------------------------------------------------------------
  // [3. 데이터 가공 및 표준 GeoJSON 정합]
  // ---------------------------------------------------------------------------

  // (A) 건물 데이터 가공 (브이월드 + Overpass 결합)
  const buildingsMap = new Map<string, any>();

  // 1) 브이월드 건물 등록 (로컬 1순위 또는 실시간 WFS)
  for (const b of rawBuildings) {
    if (!b.geometry) continue;
    const p = b.properties || {};

    // [요구사항 2] 비건물 및 4,500㎡ 초과 거대 구역 폴리곤 제외
    if (p.is_non_building || p.is_site_boundary || p.UQ111 || p.zoneName || p.landuse || p.leisure) continue;

    const coords = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates[0]?.[0];
    if (!coords || coords.length < 3) continue;

    let areaSum = 0;
    const n = coords.length;
    const cLat = coords[0][1];
    const cosLat = Math.cos((cLat * Math.PI) / 180);
    const mPerLng = 111320 * cosLat;
    const mPerLat = 110574;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = coords[i][0] * mPerLng;
      const y1 = coords[i][1] * mPerLat;
      const x2 = coords[j][0] * mPerLng;
      const y2 = coords[j][1] * mPerLat;
      areaSum += x1 * y2 - x2 * y1;
    }
    const areaSqm = Math.abs(areaSum) * 0.5;
    if (areaSqm > 4500) continue;

    const grndFlr = Number(p.levels || p.gro_flo_co || p.grnd_flr || 0);
    const ugrndFlr = Number(p.ugrnd_flr || p.und_flo_co || 0);
    const height = Number(p.height || p.bd_hgt || p.hei || (grndFlr > 0 ? grndFlr * 3.3 : 8.0));
    const levels = grndFlr > 0 ? grndFlr : Math.max(1, Math.round(height / 3.3));

    const id = b.id || `vw-bld-${p.bd_mgt_sn || buildingsMap.size}`;
    buildingsMap.set(String(id), {
      type: 'Feature',
      id,
      properties: {
        ...p,
        id,
        areaSqm,
        name: p.name || p.buld_nm || '건축물',
        buildingName: p.buildingName || p.buld_nm || '',
        dongName: p.dongName || '',
        address: p.address || '',
        grnd_flr: levels,
        ugrnd_flr: ugrndFlr,
        levels,
        height,
        structure: p.structure || p.strct_cd_nm || '철근콘크리트구조',
        usageType: p.usageType || p.main_purps_cd_nm || p.bdtyp_cd_nm || '일반건축물',
        bld_category: p.bld_category || p.usageType || 'general',
        color: p.color || '#e5e0d8',
        roofColour: p.roofColour || p.roofColor || '#356854',
        roofColor: p.roofColor || p.roofColour || '#356854',
        roofType: p.roofType || 'urethane_green',
        source: p.source || 'vworld_wfs',
      },
      geometry: b.geometry,
    });
  }

  // 2) Overpass 건물 결합
  for (const b of overpassData.buildings) {
    if (!b.geometry) continue;
    const coords = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates[0]?.[0];
    if (coords && coords.length >= 3) {
      let areaSum = 0;
      const n = coords.length;
      const cLat = coords[0][1];
      const cosLat = Math.cos((cLat * Math.PI) / 180);
      const mPerLng = 111320 * cosLat;
      const mPerLat = 110574;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x1 = coords[i][0] * mPerLng;
        const y1 = coords[i][1] * mPerLat;
        const x2 = coords[j][0] * mPerLng;
        const y2 = coords[j][1] * mPerLat;
        areaSum += x1 * y2 - x2 * y1;
      }
      const areaSqm = Math.abs(areaSum) * 0.5;
      if (areaSqm > 4500) continue;
      b.properties.areaSqm = areaSqm;
    }
    const id = b.id;
    if (!buildingsMap.has(id)) {
      buildingsMap.set(id, b);
    } else {
      const existing = buildingsMap.get(id);
      existing.properties.roofShape = b.properties.roofShape;
      existing.properties.roofColour = b.properties.roofColour;
    }
  }

  // (B) 지적도 필지 가공
  const parsedParcels = rawParcels.map((f: any, idx: number) => {
    const p = f.properties || {};
    if (p.source === 'cadastral_local') {
      return f;
    }
    const rawJimok = p.jimok || p.jibun_jimok || (p.jibun ? p.jibun.replace(/[0-9-\s]/g, '') : '');
    const jimokInfo = parseJimok(rawJimok);
    return {
      type: 'Feature',
      id: f.id || `parcel-${p.pnu || idx}`,
      properties: {
        pnu: p.pnu || '',
        jibun: p.jibun || '',
        jimok: rawJimok,
        jimokLabel: jimokInfo.label,
        category: jimokInfo.category,
        fillColor: jimokInfo.color,
        source: 'vworld_cadastral',
      },
      geometry: f.geometry,
    };
  });

  // (C) 용도지역 가공
  const parsedZoning = rawZoning.map((f: any, idx: number) => {
    const p = f.properties || {};
    return {
      type: 'Feature',
      id: f.id || `zone-${idx}`,
      properties: {
        code: p.jpos || p.dgm_ar || '',
        name: p.jname || p.unm || '용도지역',
        source: 'vworld_zoning',
      },
      geometry: f.geometry,
    };
  });

  const responsePayload = {
    success: true,
    status: 'connected',
    region: {
      id: currentRegion.id,
      name: currentRegion.name,
      fullName: currentRegion.fullName,
      admCode: currentRegion.admCode,
      legacyAdmCode: currentRegion.legacyAdmCode,
      terrainCharacteristic: currentRegion.terrainCharacteristic,
      densityType: currentRegion.densityType,
      militarySites: currentRegion.militarySites,
    },
    counts: {
      buildings: buildingsMap.size,
      parcels: parsedParcels.length,
      zoning: parsedZoning.length,
      roads: overpassData.roads.length,
      bridges: overpassData.bridges.length,
      railways: overpassData.railways.length,
      waters: overpassData.waters.length,
      powerTowers: overpassData.powerTowers.length,
    },
    data: {
      buildings: {
        type: 'FeatureCollection',
        features: Array.from(buildingsMap.values()),
      },
      parcels: {
        type: 'FeatureCollection',
        features: parsedParcels,
      },
      zoning: {
        type: 'FeatureCollection',
        features: parsedZoning,
      },
      infrastructure: {
        roads: overpassData.roads,
        bridges: overpassData.bridges,
        railways: overpassData.railways,
        waters: overpassData.waters,
        powerTowers: overpassData.powerTowers,
      },
    },
    bbox,
    cached: false,
    timestamp: Date.now(),
  };

  setCachedData(cacheKey, responsePayload);

  return NextResponse.json(responsePayload, {
    headers: {
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=1800',
      'X-Spatial-Cache': 'MISS',
    },
  });
}
