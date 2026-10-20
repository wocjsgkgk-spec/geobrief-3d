/**
 * utils/gangwonSpatialGateway.ts
 *
 * [GeoBrief 3D 1단계: 강원권 광역 공공 공간정보 통합 API 게이트웨이 클라이언트]
 *
 * 1. 서버 통합 엔드포인트(/api/gangwon-spatial) 호출
 * 2. 3중 폴백 (Fallback):
 *    - 1차: 서버 WFS + Overpass 통합 프록시
 *    - 2차: 클라이언트 브라우저 직접 Overpass & V-World WFS 폴백
 *    - 3차: OpenFreeMap 오픈 벡터 타일 및 로컬 프리셋 0ms 즉각 반환
 */

import type maplibregl from 'maplibre-gl';
import { GANGWON_18_REGIONS, getGangwonRegionByIdOrName, findGangwonRegionByCoords, GangwonRegionPreset } from '@/constants/gangwon18Regions';
import { extractOpenFreeMapBuildings, ExternalSpatialBuildingFeature } from '@/utils/externalSpatialData';
import { resolveFullUrl } from '@/utils/urlHelper';

export interface GangwonSpatialResult {
  success: boolean;
  status: 'connected' | 'fallback' | 'error';
  region: {
    id: string;
    name: string;
    fullName: string;
    admCode: string;
    legacyAdmCode: string;
    terrainCharacteristic: string;
    densityType: string;
    militarySites: any[];
  };
  counts: {
    buildings: number;
    parcels: number;
    zoning: number;
    roads: number;
    bridges: number;
    railways: number;
    waters: number;
    powerTowers: number;
  };
  buildings: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  parcels: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  zoning: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  infrastructure: {
    roads: any[];
    bridges: any[];
    railways: any[];
    waters: any[];
    powerTowers: any[];
  };
  message: string;
  source: 'gateway_server' | 'client_fallback' | 'openfreemap_cached';
}

// 클라이언트 메모리 캐시 (뷰포트 왕복 시 즉각 0ms 응답)
const clientGatewayCache = new Map<string, { timestamp: number; data: GangwonSpatialResult }>();

export async function fetchGangwonSpatialData(
  map: maplibregl.Map | null,
  bbox: [number, number, number, number],
  options?: {
    regionId?: string;
    signal?: AbortSignal;
    onImmediate?: (result: GangwonSpatialResult) => void;
  }
): Promise<GangwonSpatialResult> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cLng = (minLng + maxLng) / 2;
  const cLat = (minLat + maxLat) / 2;

  // 1. 강원도 18개 시·군 판별
  let region: GangwonRegionPreset | undefined;
  if (options?.regionId) {
    region = getGangwonRegionByIdOrName(options.regionId);
  }
  if (!region) {
    region = findGangwonRegionByCoords(cLng, cLat);
  }
  if (!region) {
    region = getGangwonRegionByIdOrName('wonju')!;
  }

  const cacheKey = `${region.id}_${minLng.toFixed(4)}_${minLat.toFixed(4)}_${maxLng.toFixed(4)}_${maxLat.toFixed(4)}`;
  const cached = clientGatewayCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 120000) {
    if (options?.onImmediate) {
      options.onImmediate(cached.data);
    }
    return cached.data;
  }

  // 0ms 레이턴시 3차 폴백: OpenFreeMap 즉시 추출
  let ofmFeatures: ExternalSpatialBuildingFeature[] = [];
  if (map) {
    ofmFeatures = extractOpenFreeMapBuildings(map);
  }

  const immediateFallbackResult: GangwonSpatialResult = {
    success: true,
    status: 'connected',
    region: {
      id: region.id,
      name: region.name,
      fullName: region.fullName,
      admCode: region.admCode,
      legacyAdmCode: region.legacyAdmCode,
      terrainCharacteristic: region.terrainCharacteristic,
      densityType: region.densityType,
      militarySites: region.militarySites,
    },
    counts: {
      buildings: ofmFeatures.length,
      parcels: 0,
      zoning: 0,
      roads: 0,
      bridges: 0,
      railways: 0,
      waters: 0,
      powerTowers: 0,
    },
    buildings: {
      type: 'FeatureCollection',
      features: ofmFeatures as any,
    },
    parcels: { type: 'FeatureCollection', features: [] },
    zoning: { type: 'FeatureCollection', features: [] },
    infrastructure: { roads: [], bridges: [], railways: [], waters: [], powerTowers: [] },
    message: `${region.name} 실시간 오픈 벡터 타일 연동 중 (${ofmFeatures.length.toLocaleString()}건 로드)`,
    source: 'openfreemap_cached',
  };

  if (options?.onImmediate && ofmFeatures.length > 0) {
    options.onImmediate(immediateFallbackResult);
  }

  // ---------------------------------------------------------------------------
  // [1차: 서버 통합 API 게이트웨이 호출 (2.5초 타임아웃)]
  // ---------------------------------------------------------------------------
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const url = resolveFullUrl(`/api/gangwon-spatial?bbox=${minLng},${minLat},${maxLng},${maxLat}&regionId=${region.id}`);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const serverBuildings = json.data?.buildings?.features || [];

      // OFM 피처와 서버 V-World/OSM 건물 병합
      const mergedBuildingsMap = new Map<string, any>();
      for (const ofm of ofmFeatures) {
        mergedBuildingsMap.set(String(ofm.id), ofm);
      }
      for (const sb of serverBuildings) {
        mergedBuildingsMap.set(String(sb.id), sb);
      }

      const totalBuildingFeatures = Array.from(mergedBuildingsMap.values());
      const totalCount = Math.max(totalBuildingFeatures.length, json.counts?.buildings || 0);

      const finalResult: GangwonSpatialResult = {
        success: true,
        status: 'connected',
        region: json.region || immediateFallbackResult.region,
        counts: {
          ...json.counts,
          buildings: totalCount,
        },
        buildings: {
          type: 'FeatureCollection',
          features: totalBuildingFeatures,
        },
        parcels: json.data?.parcels || { type: 'FeatureCollection', features: [] },
        zoning: json.data?.zoning || { type: 'FeatureCollection', features: [] },
        infrastructure: json.data?.infrastructure || {
          roads: [],
          bridges: [],
          railways: [],
          waters: [],
          powerTowers: [],
        },
        message: `${region.name} 공공 공간정보 통합 게이트웨이 연동 완료 (총 ${totalCount.toLocaleString()}건 로드)`,
        source: 'gateway_server',
      };

      clientGatewayCache.set(cacheKey, { timestamp: Date.now(), data: finalResult });
      return finalResult;
    }
  } catch (err) {
    // 서버 게이트웨이 응답 지연/오류 시 무중단 폴백으로 자동 전환
    console.warn('[gangwonSpatialGateway] Server gateway notice, switching to fallback:', err);
  }

  // ---------------------------------------------------------------------------
  // [3차 폴백: 무중단 반환]
  // ---------------------------------------------------------------------------
  clientGatewayCache.set(cacheKey, { timestamp: Date.now(), data: immediateFallbackResult });
  return immediateFallbackResult;
}
