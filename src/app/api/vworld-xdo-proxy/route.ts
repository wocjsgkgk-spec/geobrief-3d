import { NextRequest, NextResponse } from 'next/server';
import { VWorldXDOParser, VWorldQuadtreeIndexer } from '@/lib/vendor/vworldReverseSpec';

// 허용 레이어 화이트리스트 (SSRF 및 임의 주입 방지)
const ALLOWED_LAYERS = new Set([
  'facility_build',
  'facility_bridge',
  'facility_land',
  'dem',
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawLayer = searchParams.get('layer') || 'facility_build';
  const layer = rawLayer.toLowerCase().trim();

  if (!ALLOWED_LAYERS.has(layer)) {
    return NextResponse.json(
      { error: 'Invalid layer. Allowed: ' + Array.from(ALLOWED_LAYERS).join(', ') },
      { status: 400 }
    );
  }

  const levelStr = searchParams.get('level') || '15';
  const idxStr = searchParams.get('idx') || '0';
  const idyStr = searchParams.get('idy') || '0';
  const rawDataFile = searchParams.get('dataFile') || '';

  const level = parseInt(levelStr, 10);
  const idx = parseInt(idxStr, 10);
  const idy = parseInt(idyStr, 10);

  if (isNaN(level) || isNaN(idx) || isNaN(idy)) {
    return NextResponse.json(
      { error: 'Invalid coordinates: level, idx, idy must be integers' },
      { status: 400 }
    );
  }

  // 경로 순회(Path Traversal) 방어: 안전한 파일명만 허용
  const dataFile = rawDataFile.replace(/[^a-zA-Z0-9._-]/g, '');

  const apiKey =
    process.env.VWORLD_API_KEY ||
    process.env.DATA_GO_KR_API_KEY ||
    '';

  const upstreamUrl = VWorldQuadtreeIndexer.getUpstreamTileUrl({
    layer,
    level,
    idx,
    idy,
    dataFile: dataFile || undefined,
    apiKey,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const upstreamRes = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoBrief-3D/1.0',
        Accept: '*/*',
      },
    });

    clearTimeout(timeout);

    if (upstreamRes.ok && upstreamRes.status === 200) {
      const buffer = await upstreamRes.arrayBuffer();
      if (buffer.byteLength > 0) {
        // 브이월드 XDServer 특유의 200 OK XML 에러(<Error code="...">) 응답 탐지
        const checkSlice = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 120)));
        const checkStr = new TextDecoder('utf-8').decode(checkSlice);
        const isXmlError = checkStr.includes('<?xml') || checkStr.includes('<Error');

        if (!isXmlError) {
          const contentType = dataFile.endsWith('.png')
            ? 'image/png'
            : dataFile.endsWith('.jpg') || dataFile.endsWith('.jpeg')
            ? 'image/jpeg'
            : 'application/octet-stream';

          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
              'X-VWorld-Source': 'upstream',
            },
          });
        } else {
          console.warn('[VWorld-XDO-Proxy] Upstream returned 200 with XML Error, engaging synthetic fallback:', checkStr.slice(0, 80));
        }
      }
    }
  } catch (err) {
    // Upstream 타임아웃 또는 네트워크 실패 시 폴백으로 이행
    console.warn('[VWorld-XDO-Proxy] Upstream request failed or timed out, generating synthetic fallback:', err);
  }

  // ============================================================================
  // 결측/오프라인 시 고품질 실사 한국형 3D XDO 메쉬 무중단 폴백 제공
  // ============================================================================
  if (layer === 'dem') {
    // 65x65 격자 DEM 바이너리 생성 (표고 약 110m ~ 135m 자연 구릉지)
    const gridSize = 65;
    const totalPoints = gridSize * gridSize;
    const buffer = new ArrayBuffer(totalPoints * 4);
    const view = new DataView(buffer);

    for (let i = 0; i < totalPoints; i++) {
      const gx = i % gridSize;
      const gy = Math.floor(i / gridSize);
      const elevation =
        110 +
        Math.sin(gx * 0.15) * 8.0 +
        Math.cos(gy * 0.12) * 6.5 +
        ((idx + idy) % 10) * 1.5;
      view.setFloat32(i * 4, elevation, true);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'X-VWorld-Source': 'synthetic-dem',
      },
    });
  }

  // 3D 건물(.xdo) 폴백 바이너리 생성
  const syntheticBuffer = VWorldXDOParser.createSyntheticXDO({
    objectID: Math.abs((idx * 1000 + idy) % 999999) + 10000,
    width: 24,
    depth: 32,
    height: 48,
    altitude: 125,
    imageName: dataFile || 'apt_realistic_facade.png',
  });

  return new NextResponse(syntheticBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
      'X-VWorld-Source': 'synthetic-xdo',
    },
  });
}
