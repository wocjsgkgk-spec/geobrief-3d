import { NextRequest, NextResponse } from 'next/server';
import { GET as getTileset } from '../route';

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
  const rawFileName = path[path.length - 1] || '';
  // 경로 순회(Path Traversal) 공격 방어: 알파벳, 숫자, 점, 대시, 언더스코어, 달러 외 문자 제거
  const fileName = rawFileName.replace(/[^a-zA-Z0-9._$-]/g, '');

  // 1. 루트 tileset.json 단독 요청인 경우 기본 타일셋 엔드포인트 호출
  if (path.length === 1 && fileName === 'tileset.json') {
    return getTileset(request);
  }

  // 2. 경로 정규화 및 지역 기반 상류 원천 URL 동적 매핑
  const cleanSegments = path.map((seg) => seg.replace(/[^a-zA-Z0-9._$-]/g, ''));
  const joinedPath = cleanSegments.join('/');
  const regionParam = (new URL(request.url).searchParams.get('region') || 'wonju').toLowerCase();
  const REGION_BASE_DIR: Record<string, string> = {
    wonju: 'Gangwon-do/Wonju-si',
    'wonju-bridge': 'Gangwon-do/Wonju-si-bridge',
    chuncheon: 'Gangwon-do/Chuncheon-si',
    gangneung: 'Gangwon-do/Gangneung-si',
    donghae: 'Gangwon-do/Donghae-si',
    taebaek: 'Gangwon-do/Taebaek-si',
    sokcho: 'Gangwon-do/Sokcho-si',
    samcheok: 'Gangwon-do/Samcheok-si',
    hongcheon: 'Gangwon-do/Hongcheon-gun',
    hoengseong: 'Gangwon-do/Hoengseong-gun',
    yeongwol: 'Gangwon-do/Yeongwol-gun',
    pyeongchang: 'Gangwon-do/Pyeongchang-gun',
    jeongseon: 'Gangwon-do/Jeongseon-gun',
    cheorwon: 'Gangwon-do/Cheorwon-gun',
    hwacheon: 'Gangwon-do/Hwacheon-gun',
    yanggu: 'Gangwon-do/Yanggu-gun',
    inje: 'Gangwon-do/Inje-gun',
    goseong: 'Gangwon-do/Goseong-gun',
    yangyang: 'Gangwon-do/Yangyang-gun',
  };

  let remoteTileUrl = '';
  if (joinedPath.startsWith('TG9ENA/')) {
    remoteTileUrl = `https://cdn.vworld.kr/TDServer/services/map4/${joinedPath}`;
  } else if (joinedPath.startsWith('Gangwon-do/')) {
    remoteTileUrl = `https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/${joinedPath}`;
  } else {
    const baseDir = REGION_BASE_DIR[regionParam] || 'Gangwon-do/Wonju-si';
    remoteTileUrl = `https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/${baseDir}/${joinedPath}`;
  }

  try {
    const response = await fetch(remoteTileUrl, {
      headers: {
        'User-Agent': 'GeoBrief-3D/1.0',
        Accept: 'application/octet-stream, model/gltf-binary, application/json, */*',
      },
      next: { revalidate: 86400 }, // 24시간 캐시
    });

    if (!response.ok) {
      return new NextResponse(`Tile not found on upstream: ${remoteTileUrl}`, { status: response.status });
    }

    const data = await response.arrayBuffer();

    const contentType = fileName.endsWith('.glb')
      ? 'model/gltf-binary'
      : fileName.endsWith('.json')
      ? 'application/json;charset=utf-8'
      : 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
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
