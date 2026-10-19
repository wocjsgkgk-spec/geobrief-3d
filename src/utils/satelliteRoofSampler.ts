/**
 * utils/satelliteRoofSampler.ts
 *
 * [GeoBrief 3D 1단계: 위성 영상 기반 지붕 색상 실시간 샘플링 및 옥상 웨더링 정합 엔진]
 *
 * 1. 현재 뷰포트의 위성 래스터 타일(Zoom 16 기준, ArcGIS/V-World CORS 지원 타일)을 오프스크린 Canvas에 비동기 로드
 * 2. 각 건물 폴리곤 중심점(centroid)과 내측 정점 3곳의 RGB 픽셀 평균값 추출
 * 3. 위성 픽셀 색상의 명도/채도 보정:
 *    - 그림자 픽셀(Luminance < 0.22)은 밝기 +20% 보정
 *    - 과포화 방지 댐핑
 *    - 녹색(우레탄), 청색(징크), 적갈색(기와), 차콜(아스팔트), 회색(콘크리트) 슬롯 매칭
 * 4. CORS 제한이나 네트워크 오류 시 기존 5종 실사 지붕 팔레트로 안전 폴백
 */

export interface SatelliteRoofColor {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  matchedSlotId: number; // 14: concrete, 15: asphalt, 16: terracotta, 17: urethane, 18: zinc
  slotId?: number; // alias of matchedSlotId
  isSampled: boolean;
}

// 256x256 타일 이미지 데이터 인메모리 LRU 캐시
const MAX_TILE_CACHE = 64;
const tileImageDataCache = new Map<string, ImageData | null>();

// 재사용 오프스크린 캔버스
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getSharedCanvasContext(): CanvasRenderingContext2D | null {
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
 * WGS84 좌표 [lng, lat]를 Web Mercator Zoom z 타일 좌표 및 픽셀 좌표로 변환
 */
export function lngLatToTilePixel(
  lng: number,
  lat: number,
  zoom = 16
): { tileX: number; tileY: number; pixelX: number; pixelY: number } {
  const n = Math.pow(2, zoom);
  const xExact = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yExact = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;

  const tileX = Math.floor(xExact);
  const tileY = Math.floor(yExact);

  const pixelX = Math.min(255, Math.max(0, Math.floor((xExact - tileX) * 256)));
  const pixelY = Math.min(255, Math.max(0, Math.floor((yExact - tileY) * 256)));

  return { tileX, tileY, pixelX, pixelY };
}

/**
 * 단일 위성 타일 ImageData 비동기 로드 (CORS 'anonymous' 적용, 타임아웃 2.5초)
 */
async function fetchTileImageData(tileX: number, tileY: number, zoom = 16): Promise<ImageData | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;

  const key = `${zoom}/${tileX}/${tileY}`;
  if (tileImageDataCache.has(key)) {
    return tileImageDataCache.get(key) || null;
  }

  // 타일 URL 후보 (ArcGIS는 Access-Control-Allow-Origin: * 지원)
  const tileUrls = [
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`,
    `https://api.vworld.kr/req/wmts/1.0.0/98979EFF-96BA-3F53-865D-50AC0BC0CBF2/Satellite/${zoom}/${tileY}/${tileX}.jpeg`,
  ];

  for (const url of tileUrls) {
    try {
      const data = await new Promise<ImageData | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timer = setTimeout(() => {
          img.src = '';
          resolve(null);
        }, 2500);

        img.onload = () => {
          clearTimeout(timer);
          try {
            const ctx = getSharedCanvasContext();
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.clearRect(0, 0, 256, 256);
            ctx.drawImage(img, 0, 0, 256, 256);
            const imgData = ctx.getImageData(0, 0, 256, 256);
            resolve(imgData);
          } catch {
            // Tainted canvas (CORS 제한) 발생 시 안전하게 null 반환
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };

        img.src = url;
      });

      if (data) {
        if (tileImageDataCache.size >= MAX_TILE_CACHE) {
          const firstKey = tileImageDataCache.keys().next().value;
          if (firstKey) tileImageDataCache.delete(firstKey);
        }
        tileImageDataCache.set(key, data);
        return data;
      }
    } catch {
      // 다음 URL 후보 시도
    }
  }

  // 로드 실패 시 재시도 방지를 위해 null 캐싱
  tileImageDataCache.set(key, null);
  return null;
}

/**
 * 건물 폴리곤 좌표들로부터 중심점 및 내측 정점 3곳의 위성 픽셀 색상 추출 및 보정
 */
function sampleColorForPolygon(
  coords: [number, number][],
  tileDataMap: Map<string, ImageData>,
  zoom = 16
): SatelliteRoofColor | null {
  if (!coords || coords.length < 3) return null;

  // 1) 중심점 계산
  let sumLng = 0;
  let sumLat = 0;
  const N = coords.length;
  for (let i = 0; i < N; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  const cLng = sumLng / N;
  const cLat = sumLat / N;

  // 2) 내측 정점 3곳 (중심점 방향으로 40% 안쪽으로 인셋한 안전한 내부 지점)
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

  for (const [lng, lat] of samplePoints) {
    const { tileX, tileY, pixelX, pixelY } = lngLatToTilePixel(lng, lat, zoom);
    const key = `${zoom}/${tileX}/${tileY}`;
    const imgData = tileDataMap.get(key);
    if (!imgData) continue;

    const idx = (pixelY * 256 + pixelX) * 4;
    const r = imgData.data[idx];
    const g = imgData.data[idx + 1];
    const b = imgData.data[idx + 2];

    rSum += r;
    gSum += g;
    bSum += b;
    validCount++;
  }

  if (validCount === 0) return null;

  let rNorm = rSum / validCount / 255.0;
  let gNorm = gSum / validCount / 255.0;
  let bNorm = bSum / validCount / 255.0;

  // 3) [명도 및 채도 보정 (Requirement 1-2)]
  // - 너무 어두운 그림자 픽셀은 밝기 +20% 보정
  const lum = 0.299 * rNorm + 0.587 * gNorm + 0.114 * bNorm;
  if (lum < 0.22) {
    const boost = 1.20;
    rNorm = Math.min(1.0, rNorm * boost);
    gNorm = Math.min(1.0, gNorm * boost);
    bNorm = Math.min(1.0, bNorm * boost);
  }

  // - 과포화 방지 댐핑
  const maxC = Math.max(rNorm, gNorm, bNorm);
  const minC = Math.min(rNorm, gNorm, bNorm);
  const chroma = maxC - minC;
  if (chroma > 0.45) {
    rNorm = rNorm * 0.85 + lum * 0.15;
    gNorm = gNorm * 0.85 + lum * 0.15;
    bNorm = bNorm * 0.85 + lum * 0.15;
  }

  // 4) 실제 위성 색상에 대응하는 최적 아틀라스 슬롯 매칭
  // - 녹색 우레탄(17), 청색 징크(18), 적갈색 기와(16), 다크 차콜(15), 콘크리트 웜그레이(14)
  let matchedSlotId = 14.0;
  if (gNorm > rNorm * 1.10 && gNorm > bNorm * 1.05) {
    matchedSlotId = 17.0; // 실사 우레탄 세이지 그린
  } else if (bNorm > rNorm * 1.10 && bNorm > gNorm * 1.05) {
    matchedSlotId = 18.0; // 징크 금속 네이비/블루
  } else if (rNorm > gNorm * 1.20 && rNorm > bNorm * 1.20) {
    matchedSlotId = 16.0; // 적갈색 기와/슁글
  } else if (lum < 0.32) {
    matchedSlotId = 15.0; // 다크 아스팔트 슁글
  } else {
    matchedSlotId = 14.0; // 노후 콘크리트 슬래브 웜그레이
  }

  return {
    r: Math.max(0.05, Math.min(0.98, rNorm)),
    g: Math.max(0.05, Math.min(0.98, gNorm)),
    b: Math.max(0.05, Math.min(0.98, bNorm)),
    matchedSlotId,
    slotId: matchedSlotId,
    isSampled: true,
  };
}

/**
 * 뷰포트 내 빌딩 피처 목록에 대해 위성 타일을 일괄 로드하고 옥상 색상을 샘플링합니다.
 */
export async function sampleBuildingRoofColors(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  zoom = 16
): Promise<Record<string | number, SatelliteRoofColor>> {
  const result: Record<string | number, SatelliteRoofColor> = {};

  if (typeof window === 'undefined' || !features || features.length === 0) {
    return result;
  }

  // 1. 필요한 고유 타일 (tileX, tileY) 목록 수집
  const neededTiles = new Set<string>();
  for (const feat of features) {
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
    }
  }

  // 한 번에 최대 16개 타일까지만 병렬 로드 (뷰포트 과부하 방지)
  const tileList = Array.from(neededTiles).slice(0, 16);
  const tileDataMap = new Map<string, ImageData>();

  await Promise.allSettled(
    tileList.map(async (key) => {
      const parts = key.split('/').map(Number);
      const z = parts[0];
      const x = parts[1];
      const y = parts[2];
      const imgData = await fetchTileImageData(x, y, z);
      if (imgData) {
        tileDataMap.set(key, imgData);
      }
    })
  );

  // 2. 각 건물별 위성 지붕 색상 샘플링
  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
    if (!feat.geometry) continue;

    const featId = feat.id ?? feat.properties?.id ?? feat.properties?.buld_id ?? i;

    let coords: [number, number][] | null = null;
    if (feat.geometry.type === 'Polygon') {
      coords = feat.geometry.coordinates[0] as [number, number][];
    } else if (feat.geometry.type === 'MultiPolygon') {
      coords = feat.geometry.coordinates[0]?.[0] as [number, number][];
    }

    if (coords && coords.length >= 3) {
      const sampled = sampleColorForPolygon(coords, tileDataMap, zoom);
      if (sampled) {
        result[featId] = sampled;
      }
    }
  }

  return result;
}
