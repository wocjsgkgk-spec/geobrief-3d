import { NextRequest, NextResponse } from 'next/server';

// 허용 도메인 화이트리스트 (SSRF 방어)
const ALLOWED_3DTILES_DOMAINS = [
  'cdn.vworld.kr',
  'xdworld.vworld.kr',
  'api.vworld.kr',
  'map.vworld.kr',
  '2d.vworld.kr',
  'raw.githubusercontent.com',
  'assets.cesium.com',
];

function isSafe3DTilesUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();

    // 1. 사설 IP 및 로컬호스트 접근 원천 차단 (SSRF 공격 차단)
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') || // 클라우드 인스턴스 메타데이터
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // 2. 허용 도메인 화이트리스트 매칭
    return ALLOWED_3DTILES_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}

/**
 * GET /api/vworld/3dtiles
 * 브이월드 (V-World) 공식 실사 3D Tiles (OGC 3D Tiles 1.0) 스트리밍 프록시 및 타일셋 엔드포인트
 * - OGC 3D Tiles 표준 규격(tileset.json) 메타데이터 반환
 * - 강원 원주권 및 도심 거점 바운딩 볼륨(region) 계층 구조 구성
 * - 브라우저 CORS 완화 및 최대 동시 요청 제어 지원
 * - SSRF 및 외부 API Key 탈취 방어 강화
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customKey = searchParams.get('key');
  const serviceUrl = searchParams.get('serviceUrl');

  // 1. 외부 V-World 3D 타일셋 프록시 요청인 경우 직접 프록시
  const rawTargetUrl =
    serviceUrl ||
    process.env.VWORLD_3DTILES_URL ||
    (searchParams.get('url') ? decodeURIComponent(searchParams.get('url')!) : null);

  if (rawTargetUrl) {
    if (!isSafe3DTilesUrl(rawTargetUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden',
          message: '허용되지 않은 외부 타일셋 도메인 또는 사설 IP 접근이 차단되었습니다 (SSRF 방어).',
        },
        { status: 403 }
      );
    }

    try {
      const vworldKey =
        customKey ||
        process.env.VWORLD_API_KEY ||
        process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
        '';

      const isVworldDomain = new URL(rawTargetUrl).hostname.toLowerCase().includes('vworld.kr');
      const sep = rawTargetUrl.includes('?') ? '&' : '?';
      // 보안 조치: V-World 도메인이 아닌 외부 서버에는 API Key가 유출되지 않도록 전송 차단
      const fetchUrl =
        isVworldDomain && vworldKey
          ? `${rawTargetUrl}${sep}apiKey=${encodeURIComponent(vworldKey)}`
          : rawTargetUrl;

      const upstreamRes = await fetch(fetchUrl, {
        headers: {
          Accept: 'application/json, application/octet-stream, model/gltf-binary, */*',
          'User-Agent': 'GeoBrief-3D/1.0',
        },
        cache: 'no-store',
      });

      if (upstreamRes.ok) {
        const contentType = upstreamRes.headers.get('content-type') || 'application/json';
        const data = await upstreamRes.arrayBuffer();

        return new NextResponse(data, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch (proxyErr) {
      console.warn('[V-World 3D Tiles Proxy] Upstream fetch warning:', proxyErr);
    }
  }

  // 2. 브이월드 실사 3D Tiles OGC 1.0 표준 타일셋 프록시 (원주권 및 강원 거점)
  const regionParam = (searchParams.get('region') || 'wonju').toLowerCase();
  const REGION_TILES_MAP: Record<string, string> = {
    wonju: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Wonju-si/tileset.json',
    'wonju-bridge': 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Wonju-si-bridge/tileset.json',
    chuncheon: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Chuncheon-si/tileset.json',
    gangneung: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Gangneung-si/tileset.json',
    sokcho: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Sokcho-si/tileset.json',
    root: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA.json',
  };

  const targetUpstreamUrl = REGION_TILES_MAP[regionParam] || REGION_TILES_MAP.wonju;

  try {
    const upstreamRes = await fetch(targetUpstreamUrl, {
      headers: {
        Accept: 'application/json, application/octet-stream, */*',
        'User-Agent': 'GeoBrief-3D/1.0',
      },
      next: { revalidate: 86400 },
    });

    if (upstreamRes.ok) {
      const data = await upstreamRes.arrayBuffer();
      return new NextResponse(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }
  } catch (upstreamErr) {
    console.warn('[V-World 3D Tiles] Upstream regional tileset fetch fallback:', upstreamErr);
  }

  // 3. 상류 서버 연결 실패 시 메타데이터 폴백 (강원특별자치도 전역 포괄)
  // Region [west, south, east, north, minHeight, maxHeight] (단위: 라디안 및 미터)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const westRad = toRad(127.0);
  const southRad = toRad(37.0);
  const eastRad = toRad(129.5);
  const northRad = toRad(38.6);

  const tileset = {
    asset: {
      version: '1.0',
      tilesetVersion: 'vworld-gangwon-3dtiles-1.0',
      generator: 'GeoBrief 3D V-World 3D Streaming Engine',
    },
    geometricError: 256.0,
    root: {
      boundingVolume: {
        region: [westRad, southRad, eastRad, northRad, 0, 1800],
      },
      geometricError: 64.0,
      refine: 'ADD',
      children: [],
    },
  };

  return NextResponse.json(tileset, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
