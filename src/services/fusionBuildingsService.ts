/**
 * fusionBuildingsService.ts
 *
 * 국토교통부 건물통합정보(공공데이터포털) x V-World x OpenStreetMap 융합 데이터 클라이언트 서비스
 */

export interface FusionBuildingProperties {
  height: number;
  levels: number;
  roofShape: string;
  roofColour: string;
  buildingName: string;
  usageType: 'residential' | 'commercial' | 'public' | 'military' | 'general' | 'apartment';
  isMilitaryOrPublic: boolean;
  name: string;
  color: string;
  bld_category: string;
  source: string;
  fusedSources?: {
    vworld: boolean;
    dataGoKr: boolean;
    osm: boolean;
  };
}

export interface FusionBuildingsFetchResult {
  success: boolean;
  status: 'connected' | 'unconfigured' | 'error';
  fusionSources?: {
    vworld: boolean;
    dataGoKr: boolean;
    osm: boolean;
  };
  featureCount: number;
  message: string;
  errorCode?: string;
  errorDetail?: string;
  features?: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

/**
 * 뷰포트 BBOX 영역에 대해 /api/buildings/fusion 엔드포인트를 호출하여
 * 국토교통부 x V-World x OSM 융합 GeoJSON을 비동기 조회합니다.
 */
export async function fetchFusionBuildings(
  bbox: [number, number, number, number],
  options?: { signal?: AbortSignal }
): Promise<FusionBuildingsFetchResult> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const url = `/api/buildings/fusion?bbox=${minLng},${minLat},${maxLng},${maxLat}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

  // 외부 signal이 이미 취소되었거나 도중에 취소되면 controller도 abort
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      return {
        success: false,
        status: 'error',
        featureCount: 0,
        message: '요청이 취소되었습니다',
        errorCode: 'ABORTED',
      };
    }
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        status: 'error',
        featureCount: 0,
        message: `융합 프록시 오류 (HTTP ${res.status})`,
        errorCode: `HTTP_${res.status}`,
        errorDetail: `서버 응답 오류 HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      success: !!data.success,
      status: data.status || 'connected',
      fusionSources: data.fusionSources,
      featureCount: data.featureCount || 0,
      message: data.message || '건물 데이터 융합 완료',
      errorCode: data.errorCode,
      errorDetail: data.errorDetail,
      features: data.features,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError';
    return {
      success: false,
      status: 'error',
      featureCount: 0,
      message: isTimeout
        ? '융합 API 요청 시간 초과 (10s)'
        : err?.message || '네트워크 통신 오류',
      errorCode: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      errorDetail: err?.message || String(err),
    };
  }
}
