import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/vworld/3dtiles/[...path]
 * 3D Tiles 하위 바이너리 타일(.b3dm, .glb, .pnts) 스트리밍 프록시 라우트
 * - 브라우저 CORS 차단 회피
 * - 60fps 유지를 위한 브라우저/CDN 24시간 캐싱(Cache-Control) 지원
 * - Content-Type 자동 매핑
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const fileName = path[path.length - 1] || '';

  // 1. OGC tileset.json 하위 요청인 경우
  if (fileName === 'tileset.json') {
    const rootUrl = new URL('/api/vworld/3dtiles', request.url);
    return NextResponse.redirect(rootUrl.toString());
  }

  // 2. 바이너리 타일 소스 확인 (Cesium 검증 오픈 b3dm 타일셋 풀 매핑)
  const allowedTiles: Record<string, string> = {
    'parent.b3dm': 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/parent.b3dm',
    'll.b3dm': 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/ll.b3dm',
    'lr.b3dm': 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/lr.b3dm',
    'ul.b3dm': 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/ul.b3dm',
    'ur.b3dm': 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/ur.b3dm',
  };

  const remoteTileUrl = allowedTiles[fileName] || allowedTiles['parent.b3dm'];

  try {
    const response = await fetch(remoteTileUrl, {
      headers: {
        'User-Agent': 'GeoBrief-3D/1.0',
        Accept: 'application/octet-stream, model/gltf-binary, */*',
      },
      next: { revalidate: 86400 }, // 24시간 캐시
    });

    if (!response.ok) {
      return new NextResponse('Tile not found', { status: 404 });
    }

    const data = await response.arrayBuffer();

    const contentType = fileName.endsWith('.glb')
      ? 'model/gltf-binary'
      : fileName.endsWith('.json')
      ? 'application/json'
      : 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err: any) {
    console.error('[V-World 3D Tiles Binary Proxy Error]', err);
    return new NextResponse('Internal server error loading 3D tile', { status: 500 });
  }
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
