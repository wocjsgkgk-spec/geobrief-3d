import { NextRequest, NextResponse } from 'next/server';
import { validateUpstreamUrl } from '@/utils/securityValidator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side V-World WMS Proxy Route
 * ----------------------------------------------------------------------------
 * Eliminates client-side V-World API key exposure by securely attaching
 * the server environment key and validating target URL against SSRF rules.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const apiKey =
      process.env.VWORLD_API_KEY ||
      process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
      '';

    const forwardParams = new URLSearchParams();
    searchParams.forEach((val, key) => {
      // Do not allow client to override API key with untrusted key
      if (key.toUpperCase() !== 'KEY') {
        forwardParams.set(key, val);
      }
    });

    if (apiKey) {
      forwardParams.set('KEY', apiKey.trim());
    }
    if (!forwardParams.has('DOMAIN')) {
      forwardParams.set('DOMAIN', 'localhost');
    }

    const upstreamUrl = `https://api.vworld.kr/req/wms?${forwardParams.toString()}`;

    // SSRF 검증
    const validation = validateUpstreamUrl(upstreamUrl);
    if (!validation.valid || !validation.sanitizedUrl) {
      return NextResponse.json(
        { error: validation.error || 'SSRF verification failed' },
        { status: 403 }
      );
    }

    const upstreamRes = await fetch(validation.sanitizedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'GeoBrief3D/SecurityGateway',
        Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
      },
      next: { revalidate: 86400 }, // 24-hour cache
    });

    if (!upstreamRes.ok) {
      return new NextResponse(null, { status: upstreamRes.status });
    }

    const buffer = await upstreamRes.arrayBuffer();
    const contentType = upstreamRes.headers.get('content-type') || 'image/png';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal proxy error' },
      { status: 500 }
    );
  }
}
