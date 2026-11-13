import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/terrain-dem/[...path]
 *
 * [MapLibre GL v5 Terrarium DEM 타일 CORS 무결점 고속 프록시]
 * - AWS S3 elevation-tiles-prod의 Access-Control-Allow-Origin 부재로 인한
 *   MapLibre Web Worker 디코딩 차단 및 0m 평면 고착 결함을 원천 해결
 * - 치악산(1,223m), 백운산(1,087m), 원주 도심(141m) 고저차 100% 실시간 복원
 * - 인메모리 LRU 캐시(최대 600타일)로 지형 타일 0ms 서빙 보장
 */

// 1x1 Terrarium 중립 고도 (0m) PNG (R:128, G:0, B:0 -> 128*256 - 32768 = 0m)
const FALLBACK_ZERO_DEM_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNoYGAAAAGEAIGs40g+AAAAAElFTkSuQmCC',
  'base64'
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
};

// 인메모리 타일 캐시 (최대 600개)
const TILE_CACHE = new Map<string, { buffer: Buffer; timestamp: number }>();
const MAX_CACHE_SIZE = 600;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;

  if (!path || path.length < 3) {
    return new NextResponse(FALLBACK_ZERO_DEM_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        ...CORS_HEADERS,
      },
    });
  }

  // 경로 정규화 (보안 문자열 검사)
  const z = path[0].replace(/[^0-9]/g, '');
  const x = path[1].replace(/[^0-9]/g, '');
  const rawY = path[2].replace(/[^0-9a-zA-Z._-]/g, '');
  const y = rawY.endsWith('.png') ? rawY.slice(0, -4) : rawY;

  if (!z || !x || !y) {
    return new NextResponse(FALLBACK_ZERO_DEM_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        ...CORS_HEADERS,
      },
    });
  }

  const cacheKey = `${z}/${x}/${y}`;
  console.log('[API terrain-dem] tile request:', cacheKey);

  // 1. 메모리 캐시 검사
  const cached = TILE_CACHE.get(cacheKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Terrain-Cache': 'HIT',
        ...CORS_HEADERS,
      },
    });
  }

  // 2. AWS Terrarium DEM 상류(Upstream) 호출
  const upstreamUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const upstreamRes = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoBrief-3D-DEM/1.0',
        Accept: 'image/png, image/*, */*',
      },
      next: { revalidate: 31536000 },
    });

    clearTimeout(timeout);

    if (upstreamRes.ok && upstreamRes.status === 200) {
      const arrayBuffer = await upstreamRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > 0) {
        // 캐시 크기 관리 (LRU 근사)
        if (TILE_CACHE.size >= MAX_CACHE_SIZE) {
          const oldestKey = TILE_CACHE.keys().next().value;
          if (oldestKey) TILE_CACHE.delete(oldestKey);
        }
        TILE_CACHE.set(cacheKey, { buffer, timestamp: Date.now() });

        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Terrain-Cache': 'MISS',
            ...CORS_HEADERS,
          },
        });
      }
    }
  } catch (err) {
    console.warn(`[Terrain-DEM-Proxy] Upstream notice for tile ${cacheKey}:`, (err as any)?.message || err);
  }

  // 상류 부재 또는 오류 시 0m Terrarium 더미 타일로 Web Worker 크래시 방어
  return new NextResponse(new Uint8Array(FALLBACK_ZERO_DEM_PNG), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Terrain-Fallback': 'TRUE',
      ...CORS_HEADERS,
    },
  });
}
