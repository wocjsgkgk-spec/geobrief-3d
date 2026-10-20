/**
 * external3DTilesConnector.ts
 *
 * [3단계: 외부 실사 3D Tiles 및 WFS 자동 스트리밍 연동 모듈]
 *
 * 1. Google Map Tiles API (Photorealistic 3D Tiles):
 *    - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 또는 UI LocalStorage 입력 지원
 *    - 엔드포인트: https://tile.googleapis.com/v1/3dtiles/root.json?key=${key}
 *    - Deck.gl Tile3DLayer 및 Tiles3DLoader 호환 loadOptions/headers 주입
 *
 * 2. Cesium Ion (Cesium OSM Buildings / World Terrain / B3DM):
 *    - NEXT_PUBLIC_CESIUM_ION_TOKEN 또는 UI LocalStorage 입력 지원
 *    - Cesium Ion Asset (기본: 96188 OSM Buildings) 및 Authorization Bearer 헤더 주입
 *    - 엔드포인트: https://assets.ion.cesium.com/${assetId}/tileset.json
 *
 * 3. 국토교통부 브이월드 (V-World) 디지털 트윈 OGC 3D Tiles:
 *    - NEXT_PUBLIC_VWORLD_API_KEY 및 프록시 엔드포인트(/api/vworld/3dtiles/tileset.json) 직결
 *
 * 4. 범용 URL 및 프리셋 자동 감지/해석 파이프라인:
 *    - resolve3DTilesUrlAndOptions()을 통해 Deck.gl 및 3DTilesRendererJS에 최적화된 URL,
 *      인증 헤더, 동적 SSE, LRU 캐시 옵션을 단일 객체로 산출
 */

export type External3DProvider = 'google' | 'cesium' | 'vworld' | 'custom';

export const GOOGLE_MAPS_KEY_STORAGE = 'google_maps_api_key';
export const CESIUM_ION_TOKEN_STORAGE = 'cesium_ion_token';
export const VWORLD_CUSTOM_KEY_STORAGE = 'vworld_custom_key';

export interface External3DTilesConfig {
  provider: External3DProvider;
  url: string;
  headers: Record<string, string>;
  loadOptions: Record<string, any>;
  displayName: string;
  description: string;
  attribution?: string;
  isAvailable: boolean;
  requiresKeyOrToken: boolean;
  maskedAuth?: string;
}

/**
 * Google Maps API 키 획득 (LocalStorage > .env.local)
 */
export function getEffectiveGoogleMapsKey(): string | null {
  let customKey: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      customKey = localStorage.getItem(GOOGLE_MAPS_KEY_STORAGE);
    } catch {
      // LocalStorage access fallback
    }
  }

  const rawKey = customKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const clean = rawKey.replace(/['"`]/g, '').trim();

  if (!clean || clean === 'your_google_maps_api_key_here') {
    return null;
  }
  return clean;
}

/**
 * Google Maps API 키 저장
 */
export function saveGoogleMapsKey(key: string): void {
  if (typeof window === 'undefined') return;
  const clean = key.replace(/['"`]/g, '').trim();
  if (clean) {
    localStorage.setItem(GOOGLE_MAPS_KEY_STORAGE, clean);
  } else {
    localStorage.removeItem(GOOGLE_MAPS_KEY_STORAGE);
  }
}

/**
 * Cesium Ion Token 획득 (LocalStorage > .env.local)
 */
export function getEffectiveCesiumIonToken(): string | null {
  let customToken: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      customToken = localStorage.getItem(CESIUM_ION_TOKEN_STORAGE);
    } catch {
      // LocalStorage access fallback
    }
  }

  const rawToken = customToken || process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || '';
  const clean = rawToken.replace(/['"`]/g, '').trim();

  if (!clean || clean === 'your_cesium_ion_token_here') {
    return null;
  }
  return clean;
}

/**
 * Cesium Ion Token 저장
 */
export function saveCesiumIonToken(token: string): void {
  if (typeof window === 'undefined') return;
  const clean = token.replace(/['"`]/g, '').trim();
  if (clean) {
    localStorage.setItem(CESIUM_ION_TOKEN_STORAGE, clean);
  } else {
    localStorage.removeItem(CESIUM_ION_TOKEN_STORAGE);
  }
}

/**
 * 국토교통부 브이월드 API 키 획득
 */
export function getEffectiveVworldKey(): string | null {
  let customKey: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      customKey = localStorage.getItem(VWORLD_CUSTOM_KEY_STORAGE);
    } catch {
      // fallback
    }
  }

  const rawKey = customKey || process.env.NEXT_PUBLIC_VWORLD_API_KEY || '';
  const clean = rawKey.replace(/['"`]/g, '').trim();

  if (!clean || clean === 'your_vworld_api_key_here') {
    return null;
  }
  return clean;
}

/**
 * 키/토큰 마스킹 (앞 4자리, 뒤 4자리 노출)
 */
export function maskToken(token: string | null): string {
  if (!token) return '미등록';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

/**
 * 1. Google Photorealistic 3D Tiles 스트리밍 설정 생성
 */
export function getGooglePhotorealistic3DTilesConfig(customKey?: string): External3DTilesConfig {
  const key = customKey || getEffectiveGoogleMapsKey();
  const isAvailable = Boolean(key);

  const url = key
    ? `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(key)}`
    : 'https://tile.googleapis.com/v1/3dtiles/root.json';

  return {
    provider: 'google',
    url,
    headers: {},
    loadOptions: {
      '3d-tiles': {
        isTileset: true,
        loadGLTF: true,
      },
      fetch: {
        headers: {},
      },
    },
    displayName: 'Google Photorealistic 3D Tiles',
    description: '구글 전 세계 및 한국 도심 3D 실사 항공 메쉬 (Google Map Tiles API)',
    attribution: 'Google © 2026',
    isAvailable,
    requiresKeyOrToken: true,
    maskedAuth: maskToken(key),
  };
}

/**
 * 2. Cesium Ion OSM Buildings (Asset ID: 96188) 스트리밍 설정 생성
 */
export function getCesiumIon3DTilesConfig(
  assetId: number | string = 96188,
  customToken?: string
): External3DTilesConfig {
  const token = customToken || getEffectiveCesiumIonToken();
  const isAvailable = Boolean(token);

  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const url = `https://assets.ion.cesium.com/${assetId}/tileset.json`;

  return {
    provider: 'cesium',
    url,
    headers,
    loadOptions: {
      '3d-tiles': {
        isTileset: true,
      },
      fetch: {
        headers,
      },
    },
    displayName: 'Cesium Ion OSM Buildings (3D Tiles)',
    description: '글로벌 OSM 3D 건물 메쉬 (Cesium Ion Asset 96188)',
    attribution: 'Cesium Ion / OpenStreetMap contributors',
    isAvailable,
    requiresKeyOrToken: true,
    maskedAuth: maskToken(token),
  };
}

/**
 * 3. 국토교통부 브이월드 디지털 트윈 3D Tiles 설정 생성
 */
export function getVworld3DTilesConfig(customKey?: string): External3DTilesConfig {
  const key = customKey || getEffectiveVworldKey();
  const isAvailable = Boolean(key);

  return {
    provider: 'vworld',
    url: '/api/vworld/3dtiles/tileset.json',
    headers: {},
    loadOptions: {
      '3d-tiles': {
        isTileset: true,
      },
    },
    displayName: '브이월드 OGC 실사 3D (국토교통부)',
    description: '국토부 공식 디지털 트윈 항공사진 텍스처 b3dm 메쉬',
    attribution: '국토교통부 브이월드 (V-World)',
    isAvailable,
    requiresKeyOrToken: false,
    maskedAuth: maskToken(key),
  };
}

/**
 * 4. 프리셋 ID 또는 임의의 URL을 분석하여 적절한 3D Tiles 스트리밍 설정 반환
 */
export function resolve3DTilesUrlAndOptions(
  rawUrlOrPreset: string,
  customAuth?: string
): External3DTilesConfig {
  const input = (rawUrlOrPreset || '').trim();

  // 1) Google 프리셋 또는 Google 도메인 감지
  if (
    input === 'google_3d' ||
    input.includes('tile.googleapis.com') ||
    input.toLowerCase().startsWith('google:')
  ) {
    const key = customAuth || (input.startsWith('google:') ? input.slice(7) : undefined);
    return getGooglePhotorealistic3DTilesConfig(key);
  }

  // 2) Cesium Ion 프리셋 또는 Cesium Ion 도메인 감지
  if (
    input === 'cesium_osm' ||
    input.includes('assets.ion.cesium.com') ||
    input.includes('api.cesium.com') ||
    input.toLowerCase().startsWith('cesium:')
  ) {
    const token = customAuth || (input.startsWith('cesium:') ? input.slice(7) : undefined);
    return getCesiumIon3DTilesConfig(96188, token);
  }

  // 3) 브이월드 프리셋 또는 브이월드 도메인 감지
  if (
    input === 'vworld_3d_buildings' ||
    input.includes('/api/vworld/3dtiles') ||
    input.includes('vworld.kr')
  ) {
    return getVworld3DTilesConfig(customAuth);
  }

  // 4) 오픈 샘플 프리셋
  if (input === 'sample_city') {
    return {
      provider: 'custom',
      url: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/Tilesets/Tileset/tileset.json',
      headers: {},
      loadOptions: { '3d-tiles': { isTileset: true } },
      displayName: 'Cesium 샘플 도시 건축물 (b3dm)',
      description: '오픈 3D 건물 모델 타일셋',
      isAvailable: true,
      requiresKeyOrToken: false,
    };
  }

  if (input === 'sample_pointcloud') {
    return {
      provider: 'custom',
      url: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/Cesium3DTiles/PointCloud/PointCloudRGB/tileset.json',
      headers: {},
      loadOptions: { '3d-tiles': { isTileset: true } },
      displayName: '라이다 포인트 클라우드 (LiDAR pnts)',
      description: '항공 라이다 RGB 3D 정밀 점군 데이터셋',
      isAvailable: true,
      requiresKeyOrToken: false,
    };
  }

  // 5) 사용자 정의 커스텀 URL
  const headers: Record<string, string> = {};
  if (customAuth) {
    headers['Authorization'] = `Bearer ${customAuth}`;
  }

  return {
    provider: 'custom',
    url: input,
    headers,
    loadOptions: {
      '3d-tiles': {
        isTileset: true,
      },
      fetch: {
        headers,
      },
    },
    displayName: '사용자 지정 3D 타일셋',
    description: input ? `사용자 엔드포인트: ${input}` : '직접 입력한 URL',
    isAvailable: Boolean(input && input.startsWith('http')),
    requiresKeyOrToken: false,
  };
}
