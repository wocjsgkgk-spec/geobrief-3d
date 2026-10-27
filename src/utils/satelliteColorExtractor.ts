/**
 * utils/satelliteColorExtractor.ts
 *
 * [GeoBrief 3D 1단계: 위성 영상(Satellite Imagery) 기반 건물 지붕 & 지형 색감 추출기]
 *
 * 1. 현재 화면의 위성 타일(Esri World Imagery / V-World Satellite, Zoom 15~16) 이미지를
 *    crossOrigin = 'anonymous'로 256x256 오프스크린 Canvas에 렌더링 후 getImageData() 픽셀 버퍼 캐싱
 * 2. 각 건물 폴리곤 내부 중심점(centroid) 및 내측 인셋 정점들의 위경도 좌표를 타일 픽셀 좌표 (px, py)로 정밀 변환
 * 3. 그림자 픽셀 밝기 보정 (luminance < 0.15 시 가시성 확보 부스팅)
 * 4. 한국 도심 5대 실사 옥상 재질 및 색감 1:1 매칭:
 *    - 초록색 우레탄 방수 옥상 (Urethane Sage Green, #15803d, slot 17)
 *    - 회색 콘크리트 슬래브 (Concrete Slab Warm Gray, #64748b, slot 14)
 *    - 파란색 공장/물류/징크 지붕 (Industrial Zinc Blue, #1e3a8a, slot 18)
 *    - 적갈색 점토기와/아스팔트 슁글 (Terracotta Tile Red, #991b1b, slot 16)
 *    - 다크 차콜 아스팔트/슬레이트 (Dark Slate Asphalt, #334155, slot 15)
 * 5. 무한 재귀 및 메인 스레드 렉 방지 안전 가드 (Non-blocking, iteration limits, timeouts, CORS fallback)
 */

export type RoofMaterialType =
  | 'urethane' // 초록색 우레탄 방수 (#15803d)
  | 'concrete' // 회색 콘크리트 슬래브 (#64748b, #94a3b8)
  | 'zinc_blue' // 파란색 공장/징크 지붕 (#1e3a8a, #2563eb)
  | 'terracotta' // 적갈색 점토기와/슁글 (#991b1b, #b91c1c)
  | 'asphalt'; // 다크 차콜 아스팔트 (#334155)

export interface ExtractedRoofColor {
  r: number; // 0..1 normalized
  g: number; // 0..1 normalized
  b: number; // 0..1 normalized
  hex: string;
  roofType: RoofMaterialType;
  luminance: number;
  isShadowBoosted: boolean;
  isSampled: boolean;
  slotId: number; // photorealisticCityAtlas UV slot: 14: concrete, 15: asphalt, 16: terracotta, 17: urethane, 18: zinc_blue
  matchedSlotId: number; // alias for compatibility
}

// -----------------------------------------------------------------------------
// [1. 메모리 누수 방지 LRU 타일 픽셀 캐시 및 오프스크린 캔버스]
// -----------------------------------------------------------------------------
const MAX_CACHED_TILES = 128;
const tileImageDataCache = new Map<string, ImageData | null>();
const pendingTilePromises = new Map<string, Promise<ImageData | null>>();

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getSharedContext(): CanvasRenderingContext2D | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = 256;
    sharedCanvas.height = 256;
    sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
  }
  return sharedCtx;
}

/**
 * WGS84 좌표 [lng, lat]를 Web Mercator Zoom z 타일 좌표 및 픽셀 좌표 (0..255)로 변환
 */
export function lngLatToTilePixel(
  lng: number,
  lat: number,
  zoom = 16
): { tileX: number; tileY: number; pixelX: number; pixelY: number } {
  const clampedLng = Math.max(-180, Math.min(180, lng));
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));

  const n = Math.pow(2, zoom);
  const xExact = ((clampedLng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const yExact = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;

  const tileX = Math.floor(xExact);
  const tileY = Math.floor(yExact);

  const pixelX = Math.min(255, Math.max(0, Math.floor((xExact - tileX) * 256)));
  const pixelY = Math.min(255, Math.max(0, Math.floor((yExact - tileY) * 256)));

  return { tileX, tileY, pixelX, pixelY };
}

/**
 * 단일 위성 타일 ImageData 비동기 로드
 * - crossOrigin = 'anonymous' 적용
 * - 2500ms 타임아웃 가드
 * - 다중 URL 폴백 (ArcGIS World Imagery -> V-World WMTS -> Google Satellite)
 */
export async function fetchSatelliteTileData(
  tileX: number,
  tileY: number,
  zoom = 16
): Promise<ImageData | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;

  const cacheKey = `${zoom}/${tileX}/${tileY}`;
  if (tileImageDataCache.has(cacheKey)) {
    return tileImageDataCache.get(cacheKey) || null;
  }

  // 동일 타일 중복 요청 방지 (In-Flight Promise 재사용)
  if (pendingTilePromises.has(cacheKey)) {
    return pendingTilePromises.get(cacheKey)!;
  }

  const vworldKey =
    (typeof window !== 'undefined' ? localStorage.getItem('vworld_api_key') : null) ||
    process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
    '';

  const tileUrls = [
    // 1순위: 국토부 브이월드(V-World) 공식 균일 항공위성 (CORS 지원)
    `https://xdworld.vworld.kr/2d/Satellite/service/${zoom}/${tileX}/${tileY}.jpeg`,
    // 2순위: Esri World Imagery (보조 폴백)
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`,
    // 3순위: V-World WMTS 고해상도 항공위성 (API 키가 제공된 경우에만 활성화)
    ...(vworldKey && vworldKey.length >= 16
      ? [`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Satellite/${zoom}/${tileY}/${tileX}.jpeg`]
      : []),
    // 4순위: Google Satellite 래스터 타일
    `https://mt1.google.com/vt/lyrs=s&x=${tileX}&y=${tileY}&z=${zoom}`,
  ];

  const fetchPromise = (async () => {
    // 안전 루프: URL 후보군 순차 시도 (재귀 없음)
    for (let uIdx = 0; uIdx < tileUrls.length; uIdx++) {
      const url = tileUrls[uIdx];
      try {
        const imgData = await new Promise<ImageData | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';

          const timer = setTimeout(() => {
            img.src = '';
            resolve(null);
          }, 2500);

          img.onload = () => {
            clearTimeout(timer);
            try {
              const ctx = getSharedContext();
              if (!ctx) {
                resolve(null);
                return;
              }
              ctx.clearRect(0, 0, 256, 256);
              ctx.drawImage(img, 0, 0, 256, 256);
              const data = ctx.getImageData(0, 0, 256, 256);
              resolve(data);
            } catch {
              // Tainted Canvas (CORS 제한) 발생 시 안전하게 null 반환
              resolve(null);
            }
          };

          img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };

          img.src = url;
        });

        if (imgData) {
          // LRU 메모리 제한 유지
          if (tileImageDataCache.size >= MAX_CACHED_TILES) {
            const oldestKey = tileImageDataCache.keys().next().value;
            if (oldestKey) tileImageDataCache.delete(oldestKey);
          }
          tileImageDataCache.set(cacheKey, imgData);
          pendingTilePromises.delete(cacheKey);
          return imgData;
        }
      } catch {
        // 다음 URL 시도
      }
    }

    // 모든 시도 실패 시 null 캐싱 (무한 재요청 차단)
    tileImageDataCache.set(cacheKey, null);
    pendingTilePromises.delete(cacheKey);
    return null;
  })();

  pendingTilePromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * RGB(0..1) -> Hex 색상 코드 변환
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n * 255)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 기본 안전 폴백 색상 생성 (타일 미로드 또는 오류 시)
 */
export function getDefaultFallbackColor(hintCategory = 'general'): ExtractedRoofColor {
  switch (hintCategory) {
    case 'apartment':
    case 'apartments':
      return {
        r: 0.43,
        g: 0.42,
        b: 0.39,
        hex: '#6e6a64', // 웨더링된 콘크리트 웜 그레이 (초록색 절대 금지)
        roofType: 'concrete',
        luminance: 0.42,
        isShadowBoosted: false,
        isSampled: false,
        slotId: 14.0,
        matchedSlotId: 14.0,
      };
    case 'commercial':
      return {
        r: 0.23,
        g: 0.32,
        b: 0.29,
        hex: '#3b5249', // 저채도 딥 세이지 그린 (35% 비중)
        roofType: 'urethane',
        luminance: 0.30,
        isShadowBoosted: false,
        isSampled: false,
        slotId: 17.0,
        matchedSlotId: 17.0,
      };
    case 'industrial':
      return {
        r: 0.20,
        g: 0.31,
        b: 0.41,
        hex: '#334e68', // 청회색 징크 강판
        roofType: 'zinc_blue',
        luminance: 0.28,
        isShadowBoosted: false,
        isSampled: false,
        slotId: 18.0,
        matchedSlotId: 18.0,
      };
    default:
      return {
        r: 0.42,
        g: 0.20,
        b: 0.15,
        hex: '#6b3426', // 적갈색 기와 / 테라코타 브라운
        roofType: 'terracotta',
        luminance: 0.28,
        isShadowBoosted: false,
        isSampled: false,
        slotId: 16.0,
        matchedSlotId: 16.0,
      };
  }
}

/**
 * 단일 건물 폴리곤 좌표들로부터 중심점 및 내측 정점 3곳의 위성 픽셀 색상 추출 및 보정
 */
export function sampleRoofColorFromTiles(
  coords: [number, number][],
  tileDataMap: Map<string, ImageData>,
  zoom = 16,
  hintCategory = 'general'
): ExtractedRoofColor {
  if (!coords || coords.length < 3) {
    return getDefaultFallbackColor(hintCategory);
  }

  // 1) 중심점(Centroid) 계산
  let sumLng = 0;
  let sumLat = 0;
  const N = coords.length;
  for (let i = 0; i < N; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  const cLng = sumLng / N;
  const cLat = sumLat / N;

  // 2) 내측 정점 3곳 (테두리 그림자/물받이를 피해 중심점 방향으로 40% 인셋)
  const idx0 = 0;
  const idx1 = Math.floor(N / 3);
  const idx2 = Math.floor((2 * N) / 3);

  const samplePoints: [number, number][] = [
    [cLng, cLat], // 중심점
    [cLng * 0.6 + coords[idx0][0] * 0.4, cLat * 0.6 + coords[idx0][1] * 0.4],
    [cLng * 0.6 + coords[idx1][0] * 0.4, cLat * 0.6 + coords[idx1][1] * 0.4],
    [cLng * 0.6 + coords[idx2][0] * 0.4, cLat * 0.6 + coords[idx2][1] * 0.4],
  ];

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let validCount = 0;

  for (let sIdx = 0; sIdx < samplePoints.length; sIdx++) {
    const [pLng, pLat] = samplePoints[sIdx];
    const { tileX, tileY, pixelX, pixelY } = lngLatToTilePixel(pLng, pLat, zoom);
    const key = `${zoom}/${tileX}/${tileY}`;
    const imgData = tileDataMap.get(key);
    if (!imgData) continue;

    const pixelIdx = (pixelY * 256 + pixelX) * 4;
    const r = imgData.data[pixelIdx];
    const g = imgData.data[pixelIdx + 1];
    const b = imgData.data[pixelIdx + 2];

    rSum += r;
    gSum += g;
    bSum += b;
    validCount++;
  }

  // 유효 픽셀이 없는 경우 폴백
  if (validCount === 0) {
    return getDefaultFallbackColor(hintCategory);
  }

  let rNorm = rSum / validCount / 255.0;
  let gNorm = gSum / validCount / 255.0;
  let bNorm = bSum / validCount / 255.0;

  // 3) [그림자 명도 보정 (Requirement 1-3)]
  // 추출된 색상이 빌딩 그림자여서 너무 어두우면(luminance < 0.15) 밝기 부스팅
  let lum = 0.299 * rNorm + 0.587 * gNorm + 0.114 * bNorm;
  let isShadowBoosted = false;

  if (lum < 0.15) {
    const boost = Math.min(2.5, 0.22 / Math.max(0.04, lum));
    rNorm = Math.min(1.0, rNorm * boost);
    gNorm = Math.min(1.0, gNorm * boost);
    bNorm = Math.min(1.0, bNorm * boost);
    lum = 0.299 * rNorm + 0.587 * gNorm + 0.114 * bNorm;
    isShadowBoosted = true;
  }

  // 4) [한국 도심 5대 실사 지붕 재질 분류 (Requirement 1-3)]
  let roofType: RoofMaterialType = 'concrete';
  let slotId = 14.0; // 콘크리트 슬래브 웜그레이

  const maxC = Math.max(rNorm, gNorm, bNorm);
  const minC = Math.min(rNorm, gNorm, bNorm);
  const diffC = maxC - minC;

  // [요구사항 1] 고층 아파트 단지: 초록색 절대 금지!
  // 위성 사진에서 인접 조경 수목/잔디가 샘플링 박스에 침범해도 절대 우레탄으로 오분류하지 않고 콘크리트/아스팔트로 고정
  if (hintCategory === 'apartment' || hintCategory === 'apartments') {
    if (lum < 0.35) {
      roofType = 'asphalt';
      slotId = 15.0; // 다크 차콜 슬레이트 (#475569)
    } else {
      roofType = 'concrete';
      slotId = 14.0; // 웨더링된 콘크리트 웜그레이 (#6e6a64)
    }
  }
  // 1. 실제 우레탄 방수 딥 세이지 그린 (#3b5249, 쨍한 초록/연두색 절대 금지)
  else if (gNorm > rNorm * 1.10 && gNorm > bNorm * 1.05 && (gNorm - Math.max(rNorm, bNorm)) > 0.03) {
    roofType = 'urethane';
    slotId = 17.0;
  }
  // 2. 파란색 공장/물류/징크 지붕 (#334e68)
  else if (bNorm > rNorm * 1.10 && bNorm > gNorm * 1.05 && (bNorm - Math.max(rNorm, gNorm)) > 0.03) {
    roofType = 'zinc_blue';
    slotId = 18.0;
  }
  // 3. 적갈색 점토기와/테라코타 (#6b3426)
  else if (rNorm > gNorm * 1.18 && rNorm > bNorm * 1.18 && (rNorm - Math.max(gNorm, bNorm)) > 0.04) {
    roofType = 'terracotta';
    slotId = 16.0;
  }
  // 4. 다크 차콜 아스팔트/슬레이트 (#475569)
  else if (lum < 0.28 && diffC < 0.08) {
    roofType = 'asphalt';
    slotId = 15.0;
  }
  // 5. 회색 콘크리트 슬래브 (#6e6a64)
  else {
    roofType = 'concrete';
    slotId = 14.0;
  }

  return {
    r: Math.max(0.04, Math.min(0.98, rNorm)),
    g: Math.max(0.04, Math.min(0.98, gNorm)),
    b: Math.max(0.04, Math.min(0.98, bNorm)),
    hex: rgbToHex(rNorm, gNorm, bNorm),
    roofType,
    luminance: lum,
    isShadowBoosted,
    isSampled: true,
    slotId,
    matchedSlotId: slotId,
  };
}

/**
 * 대량의 빌딩 피처들에 대해 필요한 위성 타일을 일괄 수집하고 지붕 색상을 배치 샘플링합니다.
 * - 무한 재귀 차단
 * - 최대 16개 타일 병렬 수집
 * - 최대 maxBatchFeatures(기본 2000동) 상한 가드로 메인 스레드 60fps 보장
 */
export async function extractSatelliteColorsForFeatures(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  zoom = 16,
  maxBatchFeatures = 2000
): Promise<Map<string | number, ExtractedRoofColor>> {
  const result = new Map<string | number, ExtractedRoofColor>();

  if (typeof window === 'undefined' || !features || features.length === 0) {
    return result;
  }

  // 1. 필요한 고유 타일 목록 수집 (최대 16개로 캡)
  const neededTiles = new Set<string>();
  const scanLimit = Math.min(features.length, maxBatchFeatures);

  for (let i = 0; i < scanLimit; i++) {
    const feat = features[i];
    if (!feat.geometry) continue;

    let pt: [number, number] | undefined;
    if (feat.geometry.type === 'Polygon') {
      const coord = feat.geometry.coordinates[0]?.[0];
      if (coord && coord.length >= 2) pt = [coord[0], coord[1]];
    } else if (feat.geometry.type === 'MultiPolygon') {
      const coord = feat.geometry.coordinates[0]?.[0]?.[0];
      if (coord && coord.length >= 2) pt = [coord[0], coord[1]];
    }

    if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
      const { tileX, tileY } = lngLatToTilePixel(pt[0], pt[1], zoom);
      neededTiles.add(`${zoom}/${tileX}/${tileY}`);
      if (neededTiles.size >= 16) break; // 최대 16개 타일까지만 수집
    }
  }

  // 2. 타일 데이터 비동기 일괄 로드 (Promise.allSettled)
  const tileList = Array.from(neededTiles);
  const tileDataMap = new Map<string, ImageData>();

  await Promise.allSettled(
    tileList.map(async (key) => {
      const parts = key.split('/').map(Number);
      const z = parts[0];
      const x = parts[1];
      const y = parts[2];
      const imgData = await fetchSatelliteTileData(x, y, z);
      if (imgData) {
        tileDataMap.set(key, imgData);
      }
    })
  );

  // 3. 건물별 위성 지붕 색상 샘플링 (안전 루프)
  for (let i = 0; i < scanLimit; i++) {
    const feat = features[i];
    if (!feat.geometry) continue;

    const featId =
      feat.id ??
      feat.properties?.id ??
      feat.properties?.buld_id ??
      feat.properties?.BD_MGT_SN ??
      i;

    let coords: [number, number][] | null = null;
    if (feat.geometry.type === 'Polygon') {
      coords = feat.geometry.coordinates[0] as [number, number][];
    } else if (feat.geometry.type === 'MultiPolygon') {
      coords = feat.geometry.coordinates[0]?.[0] as [number, number][];
    }

    const hint = String(
      feat.properties?.bld_category || feat.properties?.usageType || feat.properties?.class || ''
    ).toLowerCase();

    if (coords && coords.length >= 3) {
      const sampled = sampleRoofColorFromTiles(coords, tileDataMap, zoom, hint);
      result.set(featId, sampled);
    }
  }

  return result;
}

/**
 * 기존 satelliteRoofSampler 인터페이스와의 100% 하위 호환성 브릿지 함수
 */
export async function sampleBuildingRoofColors(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  zoom = 16
): Promise<Record<string | number, ExtractedRoofColor>> {
  const mapResult = await extractSatelliteColorsForFeatures(features, zoom, 1500);
  const objResult: Record<string | number, ExtractedRoofColor> = {};
  for (const [k, v] of mapResult.entries()) {
    objResult[k] = v;
  }
  return objResult;
}
