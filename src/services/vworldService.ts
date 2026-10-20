/**
 * 국토교통부 브이월드 (V-World) 공간정보 서비스 연동 모듈
 * - Next.js 내부 API 프록시(/api/vworld/buildings)를 통해 CORS/도메인 불일치 에러 원천 차단
 * - .env.local 환경변수 및 UI 직접 입력기(LocalStorage) 다중 우선순위 지원
 * - 키 앞뒤 따옴표/공백 자동 trim() 및 마스킹 보안 처리
 * - API 키 미등록 또는 호출 실패 시 기존 오픈 벡터 타일로의 자동 폴백(Fallback) 보장
 */

import { VworldStatus } from '@/types/map';

export const VWORLD_CUSTOM_KEY_STORAGE = 'vworld_custom_key';

export interface VworldBuildingProperties {
  name: string;
  levels: number;
  height: number;
  min_height: number;
  bld_category: 'apartment' | 'residential' | 'public_military' | 'commercial' | 'general';
  bld_category_label?: string;
  color: string;
  source: 'vworld';
  [key: string]: unknown;
}

export type VworldBuildingFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  VworldBuildingProperties
>;

export interface VworldBuildingCollection extends GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  VworldBuildingProperties
> {}

export interface VworldFetchResult {
  success: boolean;
  status: VworldStatus;
  features?: VworldBuildingCollection;
  featureCount: number;
  message: string;
  maskedKey?: string;
  errorCode?: string | number;
  errorDetail?: string;
  httpStatus?: number;
  url?: string;
}

/**
 * 환경변수 및 LocalStorage를 종합하여 실제 사용할 유효한 V-World API 키를 정제해 반환합니다.
 * - 우선순위: LocalStorage 직접 설정 키 > process.env.NEXT_PUBLIC_VWORLD_API_KEY
 * - 앞뒤 따옴표('", `), 공백 자동 trim()
 */
export function getEffectiveVworldKey(): string | null {
  let customKey: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      customKey = localStorage.getItem(VWORLD_CUSTOM_KEY_STORAGE);
    } catch {
      // LocalStorage 접근 불가 환경 예외 무시
    }
  }

  const rawKey = customKey || process.env.NEXT_PUBLIC_VWORLD_API_KEY || '';
  const clean = rawKey.replace(/['"`]/g, '').trim();

  // 더미 또는 플레이스홀더 키 제외
  if (
    !clean ||
    clean === 'your_vworld_api_key_here' ||
    clean === 'CEB52025-E065-364C-9DBA-44D8863B9B62'
  ) {
    return null;
  }

  return clean;
}

/**
 * 보안을 위해 API 키의 앞뒤 4자리만 노출하고 중간을 마스킹합니다.
 * 예: 98979EFF-96BA-3F53-865D-50AC0BC0CBF2 -> 9897****CBF2
 */
export function getMaskedVworldKey(): string | null {
  const key = getEffectiveVworldKey();
  if (!key) return null;
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/**
 * UI 모달에서 사용자가 직접 입력한 키를 LocalStorage에 저장합니다.
 */
export function saveCustomVworldKey(key: string): void {
  if (typeof window === 'undefined') return;
  const clean = key.replace(/['"`]/g, '').trim();
  if (clean) {
    localStorage.setItem(VWORLD_CUSTOM_KEY_STORAGE, clean);
  } else {
    localStorage.removeItem(VWORLD_CUSTOM_KEY_STORAGE);
  }
}

/**
 * 사용자가 등록한 커스텀 키를 삭제하고 환경변수 기본값으로 복원합니다.
 */
export function clearCustomVworldKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(VWORLD_CUSTOM_KEY_STORAGE);
}

/**
 * 브이월드 API 키가 유효하게 등록되어 있는지 사전 검사합니다.
 */
export function isVworldConfigured(): boolean {
  return Boolean(getEffectiveVworldKey());
}

/**
 * 건물 용도 및 명칭을 바탕으로 브이월드 스타일 3D 색상과 카테고리를 판별합니다.
 */
export function classifyVworldBuilding(
  name = '',
  categoryCode = ''
): {
  bld_category: 'apartment' | 'residential' | 'public_military' | 'commercial' | 'general';
  bld_category_label: string;
  color: string;
} {
  const lower = name.toLowerCase();

  // 1. 대형 아파트 단지 (#F8FAFC)
  if (
    lower.includes('아파트') ||
    lower.includes('apt') ||
    lower.includes('단지') ||
    categoryCode === '01000'
  ) {
    return {
      bld_category: 'apartment',
      bld_category_label: '공동주택·아파트',
      color: '#F8FAFC',
    };
  }

  // 2. 단독/연립 주택가 (#FDE68A)
  if (
    lower.includes('빌라') ||
    lower.includes('연립') ||
    lower.includes('맨션') ||
    lower.includes('주택') ||
    lower.includes('하이츠') ||
    lower.includes('원룸') ||
    lower.includes('다가구') ||
    lower.includes('단독')
  ) {
    return {
      bld_category: 'residential',
      bld_category_label: '단독·연립주택',
      color: '#FDE68A',
    };
  }

  // 3. 공공청사 / 군사시설 (#93C5FD)
  if (
    lower.includes('청사') ||
    lower.includes('시청') ||
    lower.includes('구청') ||
    lower.includes('군청') ||
    lower.includes('면사무소') ||
    lower.includes('동주민센터') ||
    lower.includes('행정복지센터') ||
    lower.includes('파출소') ||
    lower.includes('경찰서') ||
    lower.includes('소방서') ||
    lower.includes('군부대') ||
    lower.includes('대대') ||
    lower.includes('사단') ||
    lower.includes('사령부') ||
    lower.includes('보건소') ||
    categoryCode === '02000'
  ) {
    return {
      bld_category: 'public_military',
      bld_category_label: '공공청사·군사시설',
      color: '#93C5FD',
    };
  }

  // 4. 상업 / 업무시설 (#BAE6FD)
  if (
    lower.includes('타워') ||
    lower.includes('빌딩') ||
    lower.includes('센터') ||
    lower.includes('오피스') ||
    lower.includes('프라자') ||
    lower.includes('플라자') ||
    lower.includes('마트') ||
    lower.includes('백화점') ||
    lower.includes('쇼핑') ||
    lower.includes('몰') ||
    lower.includes('호텔') ||
    lower.includes('은행') ||
    categoryCode === '03000'
  ) {
    return {
      bld_category: 'commercial',
      bld_category_label: '상업·업무시설',
      color: '#BAE6FD',
    };
  }

  // 5. 일반 건물 (#F1F5F9)
  return {
    bld_category: 'general',
    bld_category_label: '일반 건축물',
    color: '#F1F5F9',
  };
}

/**
 * 현재 지도 뷰포트의 BBOX 영역 내 실제 건물 공간정보를 Next.js 프록시 라우트를 통해 페칭합니다.
 * @param bbox [minLng, minLat, maxLng, maxLat]
 * @returns VworldFetchResult 객체
 */
export async function fetchVworldBuildings(
  bbox: [number, number, number, number]
): Promise<VworldFetchResult> {
  const activeKey = getEffectiveVworldKey();

  // 1) API 키 사전 체크 (미등록 시 즉시 미설정 상태 반환)
  if (!activeKey) {
    return {
      success: false,
      status: 'unconfigured',
      featureCount: 0,
      message: 'API 키 미등록 (UI 직접 설정 또는 .env.local 등록 가능)',
    };
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  const proxyUrl = `/api/vworld/buildings?bbox=${minLng},${minLat},${maxLng},${maxLat}&maxFeatures=5000&customKey=${encodeURIComponent(
    activeKey
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8초 타임아웃

  try {
    const res = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errDetail = `HTTP ${res.status} (${res.statusText || 'Proxy Error'})`;
      return {
        success: false,
        status: 'error',
        featureCount: 0,
        httpStatus: res.status,
        errorCode: res.status,
        errorDetail: errDetail,
        message: `프록시 통신 오류 (HTTP ${res.status})`,
      };
    }

    const data = await res.json();

    // 프록시 내부 응답 상태 반환
    return {
      success: data.success,
      status: data.status,
      featureCount: data.featureCount || 0,
      message: data.message || (data.success ? '정상 연동' : '연동 실패'),
      features: data.features,
      errorCode: data.errorCode,
      errorDetail: data.errorDetail,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const errText = isTimeout
      ? '요청 시간 초과 (8초 타임아웃)'
      : err?.message || '네트워크 통신 오류';

    return {
      success: false,
      status: 'error',
      featureCount: 0,
      errorCode: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      errorDetail: errText,
      message: `${errText} (오픈 무료 벡터로 자동 대체)`,
    };
  }
}
