/**
 * utils/vworldLocalLoader.ts
 *
 * [GeoBrief 3D 2단계: 브이월드 다운로드 데이터(SHP/GeoJSON) 로컬 로더 및 1순위 하이브리드 병합 엔진]
 *
 * 1. 로컬 변환 데이터(public/data/vworld/converted) 자동 감지:
 *    - manifest.json 및 {region}.geojson, {region}_core.geojson 색인
 *    - 브라우저 클라이언트 및 Next.js 서버 사이드(Node.js fs) 양방향 지원
 *
 * 2. 1순위(최우선) 로컬 데이터 주입:
 *    - 사용자 다운로드 실측 데이터(GIS건물통합정보)가 존재하면 실시간 WFS보다 1순위로 즉시 채택
 *    - 지상층수(grnd_flr), 실측높이(hei), 용도(bdtyp_cd), 한글 건물명(buld_nm) 100% 보존
 *
 * 3. 미보유 지역 무중단 실시간 API 폴백:
 *    - 로컬 파일이 없는 시·군은 브이월드 실시간 WFS(LT_C_SPBD) + Overpass API로 자동 전환
 */

import type { ExternalSpatialBuildingFeature } from '@/utils/externalSpatialData';
import { resolveFullUrl } from '@/utils/urlHelper';

export interface VworldRegionManifest {
  admCode: string;
  name: string;
  file: string;
  coreFile?: string;
  totalCount: number;
  coreCount?: number;
  fileSizeMb?: number;
  updatedAt?: string;
  bbox: [number, number, number, number];
}

export interface VworldManifest {
  generatedAt: string;
  regions: Record<string, VworldRegionManifest>;
}

export interface LocalVworldFetchResult {
  success: boolean;
  hasLocalData: boolean;
  regionId?: string;
  featureCount: number;
  message: string;
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
}

// -----------------------------------------------------------------------------
// [1. 클라이언트 사이드 인메모리 캐시 (0ms 무지연 반환)]
// -----------------------------------------------------------------------------
const localBuildingsMemoryCache = new Map<string, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]>();
let cachedManifest: VworldManifest | null = null;
let manifestFetchPromise: Promise<VworldManifest | null> | null = null;

/**
 * public/data/vworld/converted/manifest.json 매니페스트 조회
 */
export async function getVworldManifest(): Promise<VworldManifest | null> {
  if (cachedManifest) return cachedManifest;

  if (manifestFetchPromise) return manifestFetchPromise;

  manifestFetchPromise = (async () => {
    // 1) 서버 사이드 (Node.js) 환경일 경우 직접 fs 읽기
    if (typeof window === 'undefined') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const manifestPath = path.join(process.cwd(), 'public/data/vworld/converted/manifest.json');
        if (fs.existsSync(manifestPath)) {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          cachedManifest = JSON.parse(raw);
          return cachedManifest;
        }
      } catch {
        // ignore
      }
    }

    // 2) 브라우저 클라이언트 환경일 경우 fetch
    try {
      const url = resolveFullUrl('/data/vworld/converted/manifest.json');
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        cachedManifest = await res.json();
        return cachedManifest;
      }
    } catch {
      // ignore
    }

    return null;
  })();

  return manifestFetchPromise;
}

/**
 * BBOX 또는 지역 ID가 로컬 V-World 변환 데이터 보유 영역인지 확인
 */
export async function hasLocalVworldData(
  bbox?: [number, number, number, number],
  regionId?: string
): Promise<{ hasData: boolean; matchedRegionId?: string; manifestInfo?: VworldRegionManifest }> {
  const manifest = await getVworldManifest();
  if (!manifest || !manifest.regions) {
    return { hasData: false };
  }

  // 1) regionId 직결 매칭
  if (regionId && manifest.regions[regionId.toLowerCase()]) {
    return {
      hasData: true,
      matchedRegionId: regionId.toLowerCase(),
      manifestInfo: manifest.regions[regionId.toLowerCase()],
    };
  }

  // 2) BBOX 공간 겹침 매칭
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    for (const [rId, info] of Object.entries(manifest.regions)) {
      const [rMinLng, rMinLat, rMaxLng, rMaxLat] = info.bbox;
      const overlaps = !(
        maxLng < rMinLng ||
        minLng > rMaxLng ||
        maxLat < rMinLat ||
        minLat > rMaxLat
      );
      if (overlaps) {
        return {
          hasData: true,
          matchedRegionId: rId,
          manifestInfo: info,
        };
      }
    }
  }

  return { hasData: false };
}

/**
 * 로컬 V-World 변환 건물 GeoJSON 조회 (1순위 최우선 로드)
 */
export async function fetchLocalVworldBuildings(options: {
  bbox?: [number, number, number, number];
  regionId?: string;
  useCoreOnly?: boolean;
}): Promise<LocalVworldFetchResult> {
  const { bbox, regionId = 'wonju', useCoreOnly = true } = options;

  const match = await hasLocalVworldData(bbox, regionId);
  if (!match.hasData || !match.matchedRegionId || !match.manifestInfo) {
    return {
      success: false,
      hasLocalData: false,
      featureCount: 0,
      message: '로컬 브이월드 다운로드 데이터 없음 (실시간 WFS로 자동 전환)',
      features: [],
    };
  }

  const rId = match.matchedRegionId;
  const info = match.manifestInfo;
  const fileName = useCoreOnly && info.coreFile ? info.coreFile : info.file;
  const cacheKey = `${rId}_${fileName}`;

  // 1) 인메모리 캐시 선확인
  if (localBuildingsMemoryCache.has(cacheKey)) {
    const cached = localBuildingsMemoryCache.get(cacheKey)!;
    return {
      success: true,
      hasLocalData: true,
      regionId: rId,
      featureCount: cached.length,
      message: `브이월드 로컬 정밀 건물 캐시 로드 (${cached.length.toLocaleString()}동 / 1순위 최우선 적용)`,
      features: filterFeaturesByBbox(cached, bbox),
    };
  }

  // 2) 서버 사이드 파일 로드 (Node.js)
  if (typeof window === 'undefined') {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'public/data/vworld/converted', fileName);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        const features = json.features || [];
        localBuildingsMemoryCache.set(cacheKey, features);

        return {
          success: true,
          hasLocalData: true,
          regionId: rId,
          featureCount: features.length,
          message: `브이월드 로컬 다운로드 데이터 로드 (${features.length.toLocaleString()}동 / 1순위 최우선 적용)`,
          features: filterFeaturesByBbox(features, bbox),
        };
      }
    } catch {
      // ignore
    }
  }

  // 3) 클라이언트 사이드 fetch 로드
  try {
    const fileUrl = resolveFullUrl(`/data/vworld/converted/${fileName}`);
    const res = await fetch(fileUrl);
    if (!res.ok) {
      // coreFile 실패 시 메인 파일로 폴백
      if (fileName !== info.file) {
        const fallbackUrl = resolveFullUrl(`/data/vworld/converted/${info.file}`);
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          const features = json.features || [];
          localBuildingsMemoryCache.set(cacheKey, features);
          return {
            success: true,
            hasLocalData: true,
            regionId: rId,
            featureCount: features.length,
            message: `브이월드 로컬 다운로드 데이터 로드 (${features.length.toLocaleString()}동 / 1순위 최우선 적용)`,
            features: filterFeaturesByBbox(features, bbox),
          };
        }
      }
      return {
        success: false,
        hasLocalData: false,
        featureCount: 0,
        message: '로컬 데이터 파일 로드 실패',
        features: [],
      };
    }

    const json = await res.json();
    const features = json.features || [];
    localBuildingsMemoryCache.set(cacheKey, features);

    return {
      success: true,
      hasLocalData: true,
      regionId: rId,
      featureCount: features.length,
      message: `브이월드 로컬 다운로드 정밀 데이터 로드 (${features.length.toLocaleString()}동 / 1순위 최우선 적용)`,
      features: filterFeaturesByBbox(features, bbox),
    };
  } catch (err: any) {
    return {
      success: false,
      hasLocalData: false,
      featureCount: 0,
      message: `로컬 데이터 fetch 오류: ${err.message}`,
      features: [],
    };
  }
}

/**
 * BBOX 공간 필터링 도우미 (요청 뷰포트 내 건물만 선택)
 */
function filterFeaturesByBbox(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  bbox?: [number, number, number, number]
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] {
  if (!bbox) return features;

  const [minLng, minLat, maxLng, maxLat] = bbox;
  // BBOX에 여유 마진 (0.01도, 약 1km) 부여하여 카메라 회전 시 경계 깜빡임 방지
  const padLng = 0.01;
  const padLat = 0.01;
  const bMinLng = minLng - padLng;
  const bMaxLng = maxLng + padLng;
  const bMinLat = minLat - padLat;
  const bMaxLat = maxLat + padLat;

  return features.filter((f) => {
    const coords =
      f.geometry.type === 'Polygon'
        ? f.geometry.coordinates[0]?.[0]
        : f.geometry.coordinates[0]?.[0]?.[0];
    if (!coords) return false;
    const [lng, lat] = coords;
    return lng >= bMinLng && lng <= bMaxLng && lat >= bMinLat && lat <= bMaxLat;
  });
}
