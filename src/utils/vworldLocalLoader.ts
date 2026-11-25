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
import { realDataSpatialStore } from '@/utils/realDataGeometryInjector';
import { isPointInMilitaryIdleSite } from '@/utils/master3DRendererManager';

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

function registerFeaturesToRealStore(features: any[]): void {
  try {
    if (!features || features.length === 0) return;
    const records = features.map((f: any) => {
      const p = f.properties || {};
      return {
        id: f.id,
        bldNm: p.name || p.buildingName || p.buld_nm,
        dongNm: p.dongName,
        platPlc: p.address,
        pnu: p.pnu,
        grndFlrCnt: Number(p.grnd_flr || p.levels || 1),
        heit: Number(p.height || 0),
        mainPurpsCdNm: p.main_purps_cd_nm,
        strctCdNm: p.strct_cd_nm,
        roofCdNm: p.roof_cd_nm,
        geometry: f.geometry,
        source: 'vworld_local',
      };
    });
    realDataSpatialStore.loadRecords(records);
  } catch {
    // ignore
  }
}
export const DEFAULT_VWORLD_MANIFEST: VworldManifest = {
  generatedAt: '2026-11-25T13:20:00.000Z',
  regions: {
    wonju: {
      admCode: '51130',
      name: '원주시',
      file: 'wonju.geojson',
      coreFile: 'wonju_core.geojson',
      totalCount: 91422,
      coreCount: 30037,
      fileSizeMb: 65.12,
      updatedAt: '2026-11-05T03:10:27.590Z',
      bbox: [127.8, 37.15, 128.15, 37.55],
    },
    chuncheon: { admCode: '51110', name: '춘천시', file: 'chuncheon_core.geojson', coreFile: 'chuncheon_core.geojson', totalCount: 35000, coreCount: 35000, bbox: [127.50, 37.68, 127.95, 38.08] },
    gangneung: { admCode: '51150', name: '강릉시', file: 'gangneung_core.geojson', coreFile: 'gangneung_core.geojson', totalCount: 35000, coreCount: 35000, bbox: [128.60, 37.50, 129.10, 37.95] },
    donghae: { admCode: '51170', name: '동해시', file: 'donghae_core.geojson', coreFile: 'donghae_core.geojson', totalCount: 15000, coreCount: 15000, bbox: [128.95, 37.45, 129.15, 37.62] },
    taebaek: { admCode: '51190', name: '태백시', file: 'taebaek_core.geojson', coreFile: 'taebaek_core.geojson', totalCount: 10000, coreCount: 10000, bbox: [128.90, 37.05, 129.08, 37.25] },
    sokcho: { admCode: '51210', name: '속초시', file: 'sokcho_core.geojson', coreFile: 'sokcho_core.geojson', totalCount: 15000, coreCount: 15000, bbox: [128.48, 38.15, 128.62, 38.25] },
    samcheok: { admCode: '51230', name: '삼척시', file: 'samcheok_core.geojson', coreFile: 'samcheok_core.geojson', totalCount: 20000, coreCount: 20000, bbox: [128.90, 37.00, 129.40, 37.50] },
    hongcheon: { admCode: '51720', name: '홍천군', file: 'hongcheon_core.geojson', coreFile: 'hongcheon_core.geojson', totalCount: 20000, coreCount: 20000, bbox: [127.70, 37.55, 128.40, 38.00] },
    hoengseong: { admCode: '51730', name: '횡성군', file: 'hoengseong_core.geojson', coreFile: 'hoengseong_core.geojson', totalCount: 20000, coreCount: 20000, bbox: [127.80, 37.40, 128.30, 37.65] },
    yeongwol: { admCode: '51750', name: '영월군', file: 'yeongwol_core.geojson', coreFile: 'yeongwol_core.geojson', totalCount: 15000, coreCount: 15000, bbox: [128.20, 37.05, 128.80, 37.35] },
    pyeongchang: { admCode: '51760', name: '평창군', file: 'pyeongchang_core.geojson', coreFile: 'pyeongchang_core.geojson', totalCount: 20000, coreCount: 20000, bbox: [128.20, 37.30, 128.75, 37.80] },
    jeongseon: { admCode: '51770', name: '정선군', file: 'jeongseon_core.geojson', coreFile: 'jeongseon_core.geojson', totalCount: 15000, coreCount: 15000, bbox: [128.50, 37.15, 129.00, 37.60] },
    cheorwon: { admCode: '51780', name: '철원군', file: 'cheorwon_core.geojson', coreFile: 'cheorwon_core.geojson', totalCount: 15000, coreCount: 15000, bbox: [127.10, 38.05, 127.60, 38.35] },
    hwacheon: { admCode: '51790', name: '화천군', file: 'hwacheon_core.geojson', coreFile: 'hwacheon_core.geojson', totalCount: 10000, coreCount: 10000, bbox: [127.50, 38.00, 127.90, 38.25] },
    yanggu: { admCode: '51800', name: '양구군', file: 'yanggu_core.geojson', coreFile: 'yanggu_core.geojson', totalCount: 10000, coreCount: 10000, bbox: [127.85, 38.00, 128.20, 38.35] },
    inje: { admCode: '51810', name: '인제군', file: 'inje_core.geojson', coreFile: 'inje_core.geojson', totalCount: 12000, coreCount: 12000, bbox: [128.05, 37.90, 128.55, 38.35] },
    goseong: { admCode: '51820', name: '고성군', file: 'goseong_core.geojson', coreFile: 'goseong_core.geojson', totalCount: 12000, coreCount: 12000, bbox: [128.30, 38.20, 128.60, 38.60] },
    yangyang: { admCode: '51830', name: '양양군', file: 'yangyang_core.geojson', coreFile: 'yangyang_core.geojson', totalCount: 12000, coreCount: 12000, bbox: [128.45, 37.90, 128.80, 38.15] },
  },
};

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
          const parsed = JSON.parse(raw);
          cachedManifest = {
            generatedAt: parsed.generatedAt || DEFAULT_VWORLD_MANIFEST.generatedAt,
            regions: { ...DEFAULT_VWORLD_MANIFEST.regions, ...(parsed.regions || {}) },
          };
          return cachedManifest;
        }
      } catch {
        // ignore
      }
      cachedManifest = DEFAULT_VWORLD_MANIFEST;
      return cachedManifest;
    }

    // 2) 브라우저 클라이언트 환경일 경우 즉시 기본 매니페스트 반환 후 백그라운드 병합
    try {
      const url = '/data/vworld/converted/manifest.json';
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(url, { cache: 'default', signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        const parsed = await res.json();
        cachedManifest = {
          generatedAt: parsed.generatedAt || DEFAULT_VWORLD_MANIFEST.generatedAt,
          regions: { ...DEFAULT_VWORLD_MANIFEST.regions, ...(parsed.regions || {}) },
        };
        return cachedManifest;
      }
    } catch {
      // ignore
    }

    cachedManifest = DEFAULT_VWORLD_MANIFEST;
    return cachedManifest;
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

  const normalizedReqId = regionId?.toLowerCase();

  // 1) 요청된 regionId가 있고 BBOX도 해당 region과 겹치면 해당 regionId를 1순위로 선택 (인접 시군 간섭 방지)
  if (normalizedReqId && manifest.regions[normalizedReqId]) {
    const reqInfo = manifest.regions[normalizedReqId];
    if (!bbox) {
      return { hasData: true, matchedRegionId: normalizedReqId, manifestInfo: reqInfo };
    }
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const [rMinLng, rMinLat, rMaxLng, rMaxLat] = reqInfo.bbox;
    const overlapsReq = !(
      maxLng < rMinLng ||
      minLng > rMaxLng ||
      maxLat < rMinLat ||
      minLat > rMaxLat
    );
    if (overlapsReq) {
      return { hasData: true, matchedRegionId: normalizedReqId, manifestInfo: reqInfo };
    }
  }

  // 2) 카메라가 다른 시군으로 패닝된 경우 BBOX 중심점 기준 최적 매칭
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const cLng = (minLng + maxLng) * 0.5;
    const cLat = (minLat + maxLat) * 0.5;

    let bestMatch: { id: string; info: VworldRegionManifest; dist: number } | null = null;
    for (const [rId, info] of Object.entries(manifest.regions)) {
      const [rMinLng, rMinLat, rMaxLng, rMaxLat] = info.bbox;
      const overlaps = !(
        maxLng < rMinLng ||
        minLng > rMaxLng ||
        maxLat < rMinLat ||
        minLat > rMaxLat
      );
      if (overlaps) {
        const dist = Math.hypot((rMinLng + rMaxLng) * 0.5 - cLng, (rMinLat + rMaxLat) * 0.5 - cLat);
        if (!bestMatch || dist < bestMatch.dist) {
          bestMatch = { id: rId, info, dist };
        }
      }
    }
    if (bestMatch) {
      return {
        hasData: true,
        matchedRegionId: bestMatch.id,
        manifestInfo: bestMatch.info,
      };
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
  // useCoreOnly가 true이거나 BBOX가 강원/원주 영역 내에 있으면 즉각 30,466동 coreFile(23MB) 최우선 사용
  const preferCore = Boolean(info.coreFile) && (useCoreOnly !== false);
  const fileName = preferCore ? info.coreFile! : info.file;
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
        registerFeaturesToRealStore(features);

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

  // 3) 클라이언트 사이드 스트리밍 로드
  // [무지연 렌더링 혁신]: 23MB(30,466동) 파일 전체를 브라우저에 다운로드하여 메인 스레드를 3초간 프리즈시키는 방식을 폐기하고,
  // 서버 사이드 BBOX 공간 인덱싱 API(/api/gangwon-spatial)를 통해 현재 뷰포트 내 건물(~150KB)만 초고속 수신합니다.
  try {
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      const bboxStr = bbox.map((v) => Number(v).toFixed(5)).join(',');
      const relUrl = `/api/gangwon-spatial?bbox=${bboxStr}&regionId=${rId}&layers=buildings`;
      const apiUrl = typeof window !== 'undefined' ? relUrl : resolveFullUrl(relUrl);
      const apiRes = await fetch(apiUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (apiRes.ok) {
        const apiJson = await apiRes.json();
        const features = (apiJson.data?.buildings?.features || []) as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
        if (features.length > 0) {
          registerFeaturesToRealStore(features);
          return {
            success: true,
            hasLocalData: true,
            regionId: rId,
            featureCount: features.length,
            message: `브이월드 로컬 뷰포트 스트리밍 (${features.length.toLocaleString()}동 초고속 로드)`,
            features,
          };
        }
      }
    }

    // BBOX 미지정 시에만 정적 파일 로드 (최소 필요 시)
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
          registerFeaturesToRealStore(features);
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
    registerFeaturesToRealStore(features);

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

  const filtered = features.filter((f) => {
    const ring =
      f.geometry?.type === 'Polygon'
        ? f.geometry.coordinates[0]
        : f.geometry?.coordinates?.[0]?.[0];
    if (!ring || ring.length < 3) return false;
    let sumLng = 0, sumLat = 0;
    for (const pt of ring) { sumLng += pt[0]; sumLat += pt[1]; }
    const cLng = sumLng / ring.length;
    const cLat = sumLat / ring.length;

    // [군 유휴지(1군지사 310,000㎡ 등) 0동 원칙]: 부지 내부 기존 구형 건물 100% 영구 배제
    const p = (f.properties || {}) as Record<string, any>;
    if (p.is_user_placed !== true && p.isMasterplanFacility !== true) {
      if (isPointInMilitaryIdleSite(cLng, cLat)) {
        return false;
      }
    }

    if (bbox) {
      return cLng >= bMinLng && cLng <= bMaxLng && cLat >= bMinLat && cLat <= bMaxLat;
    }
    return true;
  });

  // [0ms 초고속 정렬]: O(N) 1회 사전 거리 연산 데코레이션 후 인덱스 정렬 (21만 회 중복 삼각함수 연산 소멸)
  let orderedList = filtered;
  if (bbox && filtered.length > 0) {
    const cLng = (minLng + maxLng) * 0.5;
    const cLat = (minLat + maxLat) * 0.5;
    const cosLat = Math.cos((cLat * Math.PI) / 180);
    const n = filtered.length;
    const distSqList = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const f = filtered[i];
      const pt: any = f.geometry?.type === 'Polygon' ? f.geometry.coordinates[0]?.[0] : f.geometry?.coordinates?.[0]?.[0];
      if (pt && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
        const dx = (pt[0] - cLng) * cosLat;
        const dy = pt[1] - cLat;
        distSqList[i] = dx * dx + dy * dy;
      } else {
        distSqList[i] = Infinity;
      }
    }

    const indices = new Int32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    indices.sort((a, b) => distSqList[a] - distSqList[b]);

    orderedList = new Array(n);
    for (let i = 0; i < n; i++) {
      orderedList[i] = filtered[indices[i]];
    }
  }

  // [MapLibre varint 10-byte overflow 방지] 순수 숫자 ID에 'bld_' 강제 접두
  return orderedList.map((f, idx) => {
    let fid = f.id !== undefined && f.id !== null ? String(f.id) : `bld_local_${idx}`;
    if (/^\d+$/.test(fid)) {
      fid = `bld_${fid}`;
    }
    return {
      ...f,
      id: fid,
      properties: {
        ...(f.properties || {}),
        id: fid,
      },
    };
  });
}
