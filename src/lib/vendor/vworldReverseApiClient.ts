/**
 * src/lib/vendor/vworldReverseApiClient.ts
 *
 * [GeoBrief 3D 2단계: kalil0321/reverse-api-engineer 기반 V-World 3D WebGL API 역공학 클라이언트]
 *
 * GitHub 오픈소스 `kalil0321/reverse-api-engineer`의 네트워크 트래픽 캡처 및 프로토콜 리버스
 * 엔지니어링 방법론을 바탕으로 국토교통부 브이월드(V-World / XDWorld) 백엔드 3D API를 전수 타입화하여
 * 제공하는 고성능 비동기 API 클라이언트 모듈입니다.
 *
 * [역공학 발굴 및 연동 엔드포인트]:
 * 1. 세션 키 획득: GET https://map.vworld.kr/dtkmap/selectApiKeyJson.do?output=json
 * 2. 3D 타일셋 메타데이터:
 *    - 원주: https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Wonju-si/tileset.json
 *    - 춘천: https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Chuncheon-si/tileset.json
 *    - 강릉: https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Gangneung-si/tileset.json
 *    - 속초: https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Sokcho-si/tileset.json
 *    - 전국 통합: https://cdn.vworld.kr/TDServer/services/map4/LoDALL.json
 * 3. 3D 타일 바이너리 (.b3dm):
 *    - https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/.../*.b3dm
 * 4. 건물 통합 공간정보 (WFS lt_c_spbd):
 *    - https://2d.vworld.kr/2DCache/gis/map/WFS?Key={key}&layers=lt_c_spbd
 * 5. DEM 표고 타일:
 *    - https://xdworld.vworld.kr/XDServer/3DData?Version=2.0.0.0&Request=GetLayer&Layer=dem&Level={z}&IDX={x}&IDY={y}
 */

export interface VWorld3DTilesetAsset {
  version: string;
  tileType: 'b3dm' | 'vctr' | 'pnts';
  uuid?: string;
  hasExternal?: boolean;
}

export interface VWorld3DTilesetRoot {
  boundingVolume: {
    region?: number[];
    box?: number[];
    sphere?: number[];
  };
  geometricError: number;
  refine: 'ADD' | 'REPLACE';
  content?: {
    uri: string;
    boundingVolume?: any;
  } | null;
  children?: VWorld3DTilesetRoot[];
}

export interface VWorld3DTileset {
  asset: VWorld3DTilesetAsset;
  properties?: Record<string, any>;
  geometricError: number;
  root: VWorld3DTilesetRoot;
}

export interface VWorldBuildingAttribute {
  id: string;
  buildingName?: string;
  groundFloors: number;
  undergroundFloors: number;
  structureType?: string;
  useType?: string;
  measuredHeightMeters?: number;
  realMeasured: boolean;
}

// 24시간 메모리 캐시 엔트리
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class VWorldReverseApiClient {
  private static instance: VWorldReverseApiClient;
  private currentApiKey: string | null = null;
  private apiKeyFetchedTime: number = 0;
  private readonly API_KEY_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

  private tilesetCache = new Map<string, CacheEntry<VWorld3DTileset>>();
  private buildingAttrCache = new Map<string, CacheEntry<VWorldBuildingAttribute>>();

  // 강원 18개 시·군 및 전국 주요 거점 3D 타일셋 매핑
  public static readonly REGION_3DTILES_MAP: Record<string, string> = {
    wonju: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Wonju-si/tileset.json',
    'wonju-bridge': 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Wonju-si-bridge/tileset.json',
    chuncheon: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Chuncheon-si/tileset.json',
    gangneung: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Gangneung-si/tileset.json',
    donghae: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Donghae-si/tileset.json',
    taebaek: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Taebaek-si/tileset.json',
    sokcho: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Sokcho-si/tileset.json',
    samcheok: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Samcheok-si/tileset.json',
    hongcheon: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Hongcheon-gun/tileset.json',
    hoengseong: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Hoengseong-gun/tileset.json',
    yeongwol: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Yeongwol-gun/tileset.json',
    pyeongchang: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Pyeongchang-gun/tileset.json',
    jeongseon: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Jeongseon-gun/tileset.json',
    cheorwon: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Cheorwon-gun/tileset.json',
    hwacheon: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Hwacheon-gun/tileset.json',
    yanggu: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Yanggu-gun/tileset.json',
    inje: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Inje-gun/tileset.json',
    goseong: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Goseong-gun/tileset.json',
    yangyang: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA/Gangwon-do/Yangyang-gun/tileset.json',
    all: 'https://cdn.vworld.kr/TDServer/services/map4/LoDALL.json',
    root: 'https://cdn.vworld.kr/TDServer/services/map4/TG9ENA.json',
  };

  private constructor() {}

  public static getInstance(): VWorldReverseApiClient {
    if (!VWorldReverseApiClient.instance) {
      VWorldReverseApiClient.instance = new VWorldReverseApiClient();
    }
    return VWorldReverseApiClient.instance;
  }

  /**
   * [1단계: 동적 세션 키 자동 획득 및 갱신]
   * 브이월드 메인 3D 지도 세션에서 사용하는 유효한 API Key를 동적으로 취득
   */
  public async getOrRefreshApiKey(): Promise<string> {
    const now = Date.now();
    if (this.currentApiKey && now - this.apiKeyFetchedTime < this.API_KEY_TTL_MS) {
      return this.currentApiKey;
    }

    try {
      const res = await fetch('https://map.vworld.kr/dtkmap/selectApiKeyJson.do?output=json', {
        headers: {
          'User-Agent': 'GeoBrief-3D/1.0',
          Accept: 'application/json, */*',
        },
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.apiKey) {
          this.currentApiKey = json.apiKey;
          this.apiKeyFetchedTime = now;
          return this.currentApiKey!;
        }
      }
    } catch (err) {
      console.warn('[VWorldReverseApiClient] Dynamic key fetch fallback:', err);
    }

    // 환경 변수 폴백
    if (typeof process !== 'undefined' && process.env) {
      const fallbackKey =
        process.env.VWORLD_API_KEY ||
        process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
        '$$hGPiLA6_8iTDt4BYfnbKJDTJ0DSudov0DF2XBxb0PppA5mZ3-SVzBCeS8d3OS8SA';
      this.currentApiKey = fallbackKey;
      this.apiKeyFetchedTime = now;
      return fallbackKey;
    }

    return '$$hGPiLA6_8iTDt4BYfnbKJDTJ0DSudov0DF2XBxb0PppA5mZ3-SVzBCeS8d3OS8SA';
  }

  /**
   * [2단계: OGC 3D Tiles 1.0 타일셋 메타데이터 취득]
   */
  public async fetchRegional3DTileset(region: string = 'wonju'): Promise<VWorld3DTileset | null> {
    const normalized = region.toLowerCase();
    const targetUrl = VWorldReverseApiClient.REGION_3DTILES_MAP[normalized] || VWorldReverseApiClient.REGION_3DTILES_MAP.wonju;

    const cached = this.tilesetCache.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < 3600 * 1000) {
      return cached.data;
    }

    try {
      // 자체 Next.js 프록시 라우트 우선 활용 (CORS 완벽 해소)
      const proxyUrl = `/api/vworld/3dtiles?region=${encodeURIComponent(normalized)}`;
      let res = await fetch(proxyUrl);
      if (!res.ok) {
        // 직접 원격 서버 시도 (Access-Control-Allow-Origin: * 지원됨)
        res = await fetch(targetUrl);
      }

      if (res.ok) {
        let text = await res.text();
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }
        const data = JSON.parse(text) as VWorld3DTileset;
        this.tilesetCache.set(targetUrl, { data, timestamp: Date.now() });
        return data;
      }
    } catch (err) {
      console.warn(`[VWorldReverseApiClient] fetchRegional3DTileset (${region}) failed:`, err);
    }
    return null;
  }

  /**
   * [3단계: 실측 층수 및 건물명 WFS (lt_c_spbd) 역공학 속성 매핑]
   */
  public parseBuildingAttributesFromProperties(
    properties: Record<string, any> = {}
  ): VWorldBuildingAttribute {
    const rawFloors = Number(
      properties.gro_flo_co ||
      properties.grnd_flr ||
      properties.levels ||
      properties.FLR_CNT ||
      properties['building:levels'] ||
      0
    );

    const underFloors = Number(
      properties.und_flo_co ||
      properties.und_flr ||
      0
    );

    const buildingName = properties.buld_nm || properties.name || properties['name:ko'] || undefined;
    const structureType = properties.bd_mgt_sn || properties.strct_cd_nm || undefined;
    const useType = properties.main_purps_cd_nm || properties.realUse || undefined;

    let measuredH = Number(properties.realHeight || properties.height || properties.heit || 0);
    const realMeasured = rawFloors > 0 || measuredH > 0 || properties.is_real_measured === true;

    if (measuredH <= 0 && rawFloors > 0) {
      measuredH = rawFloors * 3.2;
    }

    return {
      id: String(properties.id || properties.bd_mgt_sn || Math.random()),
      buildingName,
      groundFloors: rawFloors,
      undergroundFloors: underFloors,
      structureType,
      useType,
      measuredHeightMeters: measuredH > 0 ? measuredH : undefined,
      realMeasured,
    };
  }

  /**
   * [4단계: 원주/춘천 등 중심 좌표 기반 적합 3D Tileset 키 판정]
   */
  public getBest3DTilesRegion(lng: number, lat: number): string {
    // 원주권: 127.85 ~ 128.05, 37.28 ~ 37.42
    if (lng >= 127.85 && lng <= 128.05 && lat >= 37.28 && lat <= 37.42) {
      return 'wonju';
    }
    // 춘천권: 127.65 ~ 127.80, 37.82 ~ 37.93
    if (lng >= 127.65 && lng <= 127.80 && lat >= 37.82 && lat <= 37.93) {
      return 'chuncheon';
    }
    // 강릉권: 128.80 ~ 128.98, 37.70 ~ 37.82
    if (lng >= 128.80 && lng <= 128.98 && lat >= 37.70 && lat <= 37.82) {
      return 'gangneung';
    }
    // 속초권: 128.53 ~ 128.63, 38.16 ~ 38.23
    if (lng >= 128.53 && lng <= 128.63 && lat >= 38.16 && lat <= 38.23) {
      return 'sokcho';
    }
    return 'wonju';
  }
}

export const vworldReverseApiClient = VWorldReverseApiClient.getInstance();
