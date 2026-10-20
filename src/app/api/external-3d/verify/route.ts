import { NextRequest, NextResponse } from 'next/server';
import { resolveFullUrl } from '@/utils/urlHelper';

interface VerificationResult {
  success: boolean;
  provider: 'google' | 'cesium' | 'vworld' | 'custom';
  status: number;
  message: string;
  detail?: string;
  latencyMs?: number;
  endpointUrl?: string;
  source?: 'env' | 'custom';
}

/**
 * GET /api/external-3d/verify
 * Google Photorealistic 3D Tiles, Cesium Ion, V-World 3D 타일셋 연결 상태를 서버사이드에서 실시간 진단
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = (searchParams.get('provider') || 'all').toLowerCase();
  const customKey = searchParams.get('key')?.trim();
  const customToken = searchParams.get('token')?.trim();
  const customUrl = searchParams.get('url')?.trim();

  const results: Record<string, VerificationResult> = {};

  // 1. Google Map Tiles API (Photorealistic 3D Tiles) 진단
  if (provider === 'all' || provider === 'google') {
    const googleKey = customKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
    if (!googleKey) {
      results.google = {
        success: false,
        provider: 'google',
        status: 400,
        message: 'Google Maps API Key가 등록되지 않았습니다 (.env.local 또는 UI 입력 필요)',
        detail: 'Google Cloud Console에서 "Map Tiles API"가 활성화된 키를 입력해주세요.',
      };
    } else {
      const startTime = performance.now();
      const testUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(googleKey)}`;
      try {
        const res = await fetch(testUrl, {
          method: 'GET',
          headers: { Accept: 'application/json, text/plain, */*' },
          cache: 'no-cache',
          signal: AbortSignal.timeout(6000),
        });
        const latencyMs = Math.round(performance.now() - startTime);

        if (res.ok) {
          results.google = {
            success: true,
            provider: 'google',
            status: res.status,
            latencyMs,
            message: `🟢 Google 3D Tiles 정상 연결 확인 (${latencyMs}ms)`,
            detail: 'Photorealistic 3D Tiles (전 세계 및 한국 도심 실사 3D 메쉬) 스트리밍 준비 완료',
            endpointUrl: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleKey.slice(0, 4)}...`,
            source: customKey ? 'custom' : 'env',
          };
        } else {
          let errBody: any = null;
          try {
            errBody = await res.json();
          } catch {
            // non-json body
          }
          const errMsg = errBody?.error?.message || res.statusText || '인증 실패';
          let detail = `HTTP ${res.status}: ${errMsg}`;
          if (res.status === 403) {
            detail = '구글 클라우드 콘솔(GCP)에서 "Map Tiles API"가 사용 설정되어 있는지, 결제 계정(Billing)이 연결되어 있는지 확인해주세요.';
          } else if (res.status === 400) {
            detail = 'API Key 형식이 올바르지 않거나 유효하지 않습니다.';
          }
          results.google = {
            success: false,
            provider: 'google',
            status: res.status,
            latencyMs,
            message: `🔴 Google API 오류 (${res.status}): ${errMsg}`,
            detail,
            source: customKey ? 'custom' : 'env',
          };
        }
      } catch (err: any) {
        results.google = {
          success: false,
          provider: 'google',
          status: 0,
          message: `⚠️ Google 연결 실패: ${err.message || '네트워크 타임아웃'}`,
          detail: '인터넷 연결 또는 도메인 접근 권한을 확인해주세요.',
        };
      }
    }
  }

  // 2. Cesium Ion OSM Buildings (Asset 96188) 진단
  if (provider === 'all' || provider === 'cesium') {
    const cesiumToken = customToken || process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim() || '';
    if (!cesiumToken) {
      results.cesium = {
        success: false,
        provider: 'cesium',
        status: 400,
        message: 'Cesium Ion Access Token이 등록되지 않았습니다 (.env.local 또는 UI 입력 필요)',
        detail: 'cesium.com/ion 계정에서 발급받은 Access Token (assets:read 권한)을 입력해주세요.',
      };
    } else {
      const startTime = performance.now();
      const assetId = 96188; // Cesium OSM Buildings
      const testUrl = `https://api.cesium.com/v1/assets/${assetId}/endpoint`;
      try {
        const res = await fetch(testUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${cesiumToken}`,
            Accept: 'application/json',
          },
          cache: 'no-cache',
          signal: AbortSignal.timeout(6000),
        });
        const latencyMs = Math.round(performance.now() - startTime);

        if (res.ok) {
          const data = await res.json();
          results.cesium = {
            success: true,
            provider: 'cesium',
            status: res.status,
            latencyMs,
            message: `🟢 Cesium Ion 정상 연결 확인 (${latencyMs}ms)`,
            detail: `Asset 96188 (Cesium OSM Buildings) 타일셋 서명 승인 완료 (${data.type || '3DTILES'})`,
            endpointUrl: data.url ? `${data.url.slice(0, 45)}...` : testUrl,
            source: customToken ? 'custom' : 'env',
          };
        } else {
          let errBody: any = null;
          try {
            errBody = await res.json();
          } catch {}
          const errMsg = errBody?.message || res.statusText || '인증 실패';
          let detail = `HTTP ${res.status}: ${errMsg}`;
          if (res.status === 401) {
            detail = '유효하지 않은 토큰입니다. cesium.com/ion > Access Tokens 메뉴에서 토큰 값을 다시 복사해주세요.';
          } else if (res.status === 403 || res.status === 404) {
            detail = `Asset ID ${assetId}에 대한 접근 권한이 없거나 자산이 존재하지 않습니다.`;
          }
          results.cesium = {
            success: false,
            provider: 'cesium',
            status: res.status,
            latencyMs,
            message: `🔴 Cesium Ion 오류 (${res.status}): ${errMsg}`,
            detail,
            source: customToken ? 'custom' : 'env',
          };
        }
      } catch (err: any) {
        results.cesium = {
          success: false,
          provider: 'cesium',
          status: 0,
          message: `⚠️ Cesium 연결 실패: ${err.message || '네트워크 타임아웃'}`,
          detail: 'Cesium Ion API 서버(api.cesium.com) 응답을 확인해주세요.',
        };
      }
    }
  }

  // 3. 국토교통부 브이월드 (V-World) 3D 타일셋 진단
  if (provider === 'all' || provider === 'vworld') {
    const startTime = performance.now();
    const vworldUrl = resolveFullUrl(customUrl || '/api/vworld/3dtiles/tileset.json', request.url);
    try {
      const res = await fetch(vworldUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, */*' },
        cache: 'no-cache',
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Math.round(performance.now() - startTime);

      results.vworld = {
        success: res.ok,
        provider: 'vworld',
        status: res.status,
        latencyMs,
        message: res.ok
          ? `🟢 브이월드 3D 타일셋 정상 연결 (${latencyMs}ms)`
          : `🔴 HTTP ${res.status} ${res.statusText}`,
        detail: res.ok ? 'OGC 3D Tiles 스트리밍 가능' : '엔드포인트 URL 및 CORS 설정을 확인해주세요.',
        endpointUrl: vworldUrl,
      };
    } catch (err: any) {
      results.vworld = {
        success: false,
        provider: 'vworld',
        status: 0,
        message: `⚠️ 브이월드 연결 실패: ${err.message || '네트워크 오류'}`,
      };
    }
  }

  // 4. 사용자 지정 URL 진단
  if ((provider === 'custom' || provider === 'all') && customUrl) {
    const startTime = performance.now();
    const resolvedUrl = resolveFullUrl(customUrl, request.url);
    try {
      const headers: Record<string, string> = { Accept: 'application/json, */*' };
      if (customToken) {
        headers['Authorization'] = `Bearer ${customToken}`;
      }
      const res = await fetch(resolvedUrl, {
        method: 'GET',
        headers,
        cache: 'no-cache',
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Math.round(performance.now() - startTime);

      results.custom = {
        success: res.ok,
        provider: 'custom',
        status: res.status,
        latencyMs,
        message: res.ok
          ? `🟢 커스텀 3D 타일셋 정상 연결 (${latencyMs}ms)`
          : `🔴 HTTP ${res.status} ${res.statusText}`,
        detail: res.ok ? 'OGC 3D Tiles 스트리밍 가능' : '엔드포인트 URL 및 CORS 설정을 확인해주세요.',
        endpointUrl: resolvedUrl,
      };
    } catch (err: any) {
      results.custom = {
        success: false,
        provider: 'custom',
        status: 0,
        message: `⚠️ 커스텀 URL 연결 실패: ${err.message || '네트워크 오류'}`,
      };
    }
  }

  // 단일 프로바이더 요청 시 단일 객체 리턴, all인 경우 전체 결과 리턴
  if (provider !== 'all' && results[provider]) {
    return NextResponse.json(results[provider]);
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results,
  });
}
