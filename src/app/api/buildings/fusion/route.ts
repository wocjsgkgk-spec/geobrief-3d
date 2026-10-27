import { NextRequest, NextResponse } from 'next/server';
import { assertSafeUpstreamUrl } from '@/utils/securityValidator';

/**
 * 건물 용도 및 명칭을 바탕으로 표준 용도 카테고리와 국방/공공 플래그를 판별합니다.
 */
function classifyBuildingUsage(name = '', detailName = '', bdtypCd = '') {
  const combined = `${name} ${detailName} ${bdtypCd}`.toLowerCase();

  // 1. 군사 및 공공안보 시설
  const isMilitary =
    combined.includes('군부대') ||
    combined.includes('대대') ||
    combined.includes('사단') ||
    combined.includes('군단') ||
    combined.includes('사령부') ||
    combined.includes('연대') ||
    combined.includes('포대') ||
    combined.includes('탄약') ||
    combined.includes('병영') ||
    combined.includes('막사') ||
    combined.includes('보급고') ||
    combined.includes('군사') ||
    combined.includes('비행단') ||
    combined.includes('기지') ||
    combined.includes('예비군') ||
    combined.includes('훈련장');

  // 2. 공공청사 및 교육·치안·소방 시설
  const isPublic =
    combined.includes('청사') ||
    combined.includes('시청') ||
    combined.includes('도청') ||
    combined.includes('구청') ||
    combined.includes('군청') ||
    combined.includes('면사무소') ||
    combined.includes('동주민센터') ||
    combined.includes('행정복지센터') ||
    combined.includes('파출소') ||
    combined.includes('경찰서') ||
    combined.includes('소방서') ||
    combined.includes('보건소') ||
    combined.includes('우체국') ||
    combined.includes('학교') ||
    combined.includes('초등학교') ||
    combined.includes('중학교') ||
    combined.includes('고등학교') ||
    combined.includes('대학교') ||
    combined.includes('법원') ||
    combined.includes('검찰청');

  const isMilitaryOrPublic = isMilitary || isPublic;

  // 3. 주거 시설 (대형 아파트 vs 단독/연립 주택)
  const isApt =
    combined.includes('아파트') ||
    combined.includes('apt') ||
    combined.includes('단지') ||
    combined.includes('푸르지오') ||
    combined.includes('자이') ||
    combined.includes('힐스테이트') ||
    combined.includes('래미안') ||
    combined.includes('e편한') ||
    combined.includes('더샵') ||
    combined.includes('아이파크') ||
    combined.includes('롯데캐슬') ||
    combined.includes('한신') ||
    combined.includes('삼호') ||
    combined.includes('두산') ||
    combined.includes('우성') ||
    combined.includes('현대') ||
    combined.includes('동보') ||
    combined.includes('세경') ||
    combined.includes('코아루') ||
    combined.includes('부영') ||
    combined.includes('주공') ||
    combined.includes('휴먼시아') ||
    combined.includes('lh') ||
    combined.includes('풍경채') ||
    combined.includes('스위첸') ||
    combined.includes('호반') ||
    combined.includes('포레') ||
    combined.includes('센트럴');

  if (isApt) {
    return {
      usageType: 'apartment' as const,
      isMilitaryOrPublic,
      category: 'apartment' as const,
      color: '#F8FAFC',
    };
  }

  if (
    combined.includes('빌라') ||
    combined.includes('연립') ||
    combined.includes('맨션') ||
    combined.includes('주택') ||
    combined.includes('하이츠') ||
    combined.includes('원룸') ||
    combined.includes('다가구') ||
    combined.includes('단독')
  ) {
    return {
      usageType: 'residential' as const,
      isMilitaryOrPublic,
      category: 'residential' as const,
      color: '#FDE68A',
    };
  }

  if (isMilitary) {
    return {
      usageType: 'military' as const,
      isMilitaryOrPublic: true,
      category: 'public_military' as const,
      color: '#E2E8F0',
    };
  }

  if (isPublic) {
    return {
      usageType: 'public' as const,
      isMilitaryOrPublic: true,
      category: 'public_military' as const,
      color: '#93C5FD',
    };
  }

  // 4. 상업 / 업무시설
  if (
    combined.includes('타워') ||
    combined.includes('빌딩') ||
    combined.includes('센터') ||
    combined.includes('오피스') ||
    combined.includes('프라자') ||
    combined.includes('플라자') ||
    combined.includes('마트') ||
    combined.includes('백화점') ||
    combined.includes('쇼핑') ||
    combined.includes('몰') ||
    combined.includes('호텔') ||
    combined.includes('은행') ||
    combined.includes('병원') ||
    combined.includes('상가')
  ) {
    return {
      usageType: 'commercial' as const,
      isMilitaryOrPublic: false,
      category: 'commercial' as const,
      color: '#BAE6FD',
    };
  }

  // 5. 일반 건축물
  return {
    usageType: 'general' as const,
    isMilitaryOrPublic: false,
    category: 'general' as const,
    color: '#F1F5F9',
  };
}

/**
 * OSM 지붕 형태(roof:shape) 속성을 정규화하거나 용도 기반 지능형 추론을 수행합니다.
 */
function determineRoofShape(
  osmShape?: string,
  usageType = 'general',
  levels = 2
): { roofShape: string; roofColour: string } {
  const norm = (osmShape || '').toLowerCase().trim();

  // OSM 명시적 값 정규화
  if (norm.includes('gable')) {
    return { roofShape: 'gabled', roofColour: '#334155' };
  }
  if (norm.includes('hip')) {
    return { roofShape: 'hipped', roofColour: '#334155' };
  }
  if (norm.includes('flat')) {
    return { roofShape: 'flat', roofColour: '#334155' };
  }
  if (norm.includes('dome')) {
    return { roofShape: 'dome', roofColour: '#1E293B' };
  }
  if (norm.includes('mansard')) {
    return { roofShape: 'hipped', roofColour: '#334155' };
  }
  if (norm.includes('skillion')) {
    return { roofShape: 'gabled', roofColour: '#334155' };
  }

  // 휴리스틱 추론:
  // - 5층 이상 또는 대형 상업/아파트: 평지붕(flat)
  if (levels >= 5 || usageType === 'commercial') {
    return { roofShape: 'flat', roofColour: '#334155' };
  }

  // - 저층 주거/단독주택/군사 막사: 박공 경사 지붕(gabled)
  if (usageType === 'military' || usageType === 'residential') {
    return { roofShape: 'gabled', roofColour: '#334155' };
  }

  // - 공공청사: 모임지붕(hipped)
  if (usageType === 'public') {
    return { roofShape: 'hipped', roofColour: '#272E3B' };
  }

  return { roofShape: 'flat', roofColour: '#334155' };
}

/**
 * OpenStreetMap Overpass API를 통해 해당 BBOX 영역 내 지붕 및 건물 폴리곤 지오메트리를 비동기 쿼리합니다.
 * V-World WFS 응답이 없거나 인증키가 미설정된 환경에서도 강원도 및 전국 3D 건물이 즉각 표출되도록 지원합니다.
 */
interface OsmFetchResult {
  tagMap: Map<string, { roofShape?: string; roofColour?: string; levels?: number; name?: string }>;
  osmFeatures: any[];
}

async function fetchOsmBuildings(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): Promise<OsmFetchResult> {
  const tagMap = new Map<string, { roofShape?: string; roofColour?: string; levels?: number; name?: string }>();
  const osmFeatures: any[] = [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const ql = `[out:json][timeout:6];(way["building"](${minLat},${minLng},${maxLat},${maxLng}););out geom 10000;`;
    const overpassUrl = assertSafeUpstreamUrl(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`
    );

    const res = await fetch(overpassUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const elements = data.elements || [];

      for (const el of elements) {
        if (!el.tags) continue;
        const t = el.tags;
        const bldName = t.name || t['name:ko'] || '';
        const roofShape = t['roof:shape'] || t['building:roof:shape'];
        const roofColour = t['roof:colour'] || t['roof:color'];
        const levels = t['building:levels'] ? parseInt(t['building:levels'], 10) : undefined;
        const height = t.height ? parseFloat(t.height) : undefined;

        const info = {
          roofShape,
          roofColour,
          levels: isNaN(levels as number) ? undefined : levels,
          name: bldName,
        };

        if (bldName) tagMap.set(bldName.toLowerCase(), info);

        // 지오메트리 폴리곤 구성
        if (Array.isArray(el.geometry) && el.geometry.length >= 3) {
          const ring: [number, number][] = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
          // 닫힌 링 보장
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
          }

          osmFeatures.push({
            type: 'Feature',
            properties: {
              buld_nm: bldName,
              buld_nm_dc: t['building:use'] || t.building || '',
              bdtyp_cd: t.building || 'general',
              gro_flo_co: levels,
              height: height,
              roofShape,
              roofColour,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          });
        }
      }
    }
  } catch {
    clearTimeout(timeoutId);
    // Overpass 실패 시 무중단 안전 폴백
  }

  return { tagMap, osmFeatures };
}

/**
 * 국토교통부 건물통합정보 / 건축물대장 API (공공데이터포털 data.go.kr) 조회
 */
async function fetchPublicDataBuildingRegistry(
  apiKey: string,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): Promise<Map<string, { height?: number; levels?: number; name?: string; bdtypCd?: string }>> {
  const registryMap = new Map<string, { height?: number; levels?: number; name?: string; bdtypCd?: string }>();
  if (!apiKey || apiKey === 'your_public_data_portal_key_here') return registryMap;

  // 공공데이터포털 건축물대장 표제부 API 엔드포인트
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    // 국토교통부 오픈데이터 연동 규격
    const url = assertSafeUpstreamUrl(
      `https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo?serviceKey=${encodeURIComponent(
        apiKey
      )}&numOfRows=100&pageNo=1&_type=json`
    );

    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const items = json?.response?.body?.items?.item || [];
      for (const it of Array.isArray(items) ? items : [items]) {
        const bldName = (it.bldNm || '').trim();
        const height = parseFloat(it.heit || '0');
        const levels = parseInt(it.grndFlrCnt || '0', 10);
        const bdtypCd = it.mainPurpsCd || '';

        if (bldName) {
          registryMap.set(bldName.toLowerCase(), {
            height: height > 0 ? height : undefined,
            levels: levels > 0 ? levels : undefined,
            name: bldName,
            bdtypCd,
          });
        }
      }
    }
  } catch {
    clearTimeout(timeoutId);
    // 공공데이터포털 미등록 또는 통신 불가 시 V-World + OSM으로 무중단 폴백
  }

  return registryMap;
}

// 서버 사이드 인메모리 융합 BBOX 공간 쿼리 캐시 (TTL 15분, 최대 300개 영역)
const serverFusionCache = new Map<string, { timestamp: number; data: any }>();
const SERVER_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SERVER_CACHE_ENTRIES = 300;

/**
 * GET /api/buildings/fusion?bbox=minLng,minLat,maxLng,maxLat
 *
 * [국토교통부 건물통합정보 x V-World x OpenStreetMap 3대 소스 융합 API]
 * 1. V-World WFS (LT_C_SPBD): 건물 실측 외곽선 지오메트리 폴리곤
 * 2. 국토교통부 건물통합정보(공공데이터포털): 실측 높이(HEI), 지상층수(GRND_FLR_CNT), 주용도코드
 * 3. OpenStreetMap (Overpass): 지붕 형태(roof:shape), 지붕 색상, 층수
 * 4. 단일 통일 GeoJSON 정규화 반환: { height, levels, roofShape, roofColour, buildingName, usageType, isMilitaryOrPublic }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bboxParam = searchParams.get('bbox');

  // 1. BBOX 파라미터 유효성 검증
  if (!bboxParam) {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: 'bbox 파라미터가 필요합니다 (형식: minLng,minLat,maxLng,maxLat)',
      },
      { status: 400 }
    );
  }

  const coords = bboxParam.split(',').map((v) => parseFloat(v.trim()));
  if (coords.length !== 4 || coords.some((n) => isNaN(n))) {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: '유효하지 않은 bbox 좌표입니다',
      },
      { status: 400 }
    );
  }

  let [minLng, minLat, maxLng, maxLat] = coords;

  // 대한민국 영토 경계 검증 (경도 124.0~132.5, 위도 33.0~39.5)
  const isOutOfKorea =
    minLng < 124.0 || maxLng > 132.5 || minLat < 33.0 || maxLat > 39.5 ||
    minLng >= maxLng || minLat >= maxLat;

  if (isOutOfKorea) {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: '대한민국 영토 범위를 벗어난 유효하지 않은 bbox 좌표입니다',
      },
      { status: 400 }
    );
  }

  // 뷰포트가 넓을 경우(줌 12~13 등) 중심 좌표 기준 0.25도 영역으로 자동 클램핑하여 400 에러 차단
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  const MAX_SPAN = 0.25;
  if (lngSpan > MAX_SPAN || latSpan > MAX_SPAN) {
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const halfSpan = MAX_SPAN / 2;
    minLng = Math.round((centerLng - halfSpan) * 10000) / 10000;
    maxLng = Math.round((centerLng + halfSpan) * 10000) / 10000;
    minLat = Math.round((centerLat - halfSpan) * 10000) / 10000;
    maxLat = Math.round((centerLat + halfSpan) * 10000) / 10000;
  }

  // 서버 사이드 메모리 캐시 검사 (양자화 키 적용: 회전/이동 시 0ms 응답)
  const cacheKey = `${minLng.toFixed(3)}_${minLat.toFixed(3)}_${maxLng.toFixed(3)}_${maxLat.toFixed(3)}`;
  const cached = serverFusionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // 2. 인증키 확인
  const rawVworldKey =
    process.env.VWORLD_API_KEY ||
    process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
    '';
  const cleanVworldKey = rawVworldKey.replace(/['"`]/g, '').trim();

  const rawDataGoKey = process.env.DATA_GO_KR_API_KEY || '';
  const cleanDataGoKey = rawDataGoKey.replace(/['"`]/g, '').trim();

  const domain = process.env.VWORLD_DOMAIN || 'localhost';

  // 3. 다중 소스 병렬 비동기 수신 (V-World WFS + OSM 태그 + 국토교통부 공공데이터)
  const geomFilter = `BOX(${minLng},${minLat},${maxLng},${maxLat})`;
  const vworldUrl = assertSafeUpstreamUrl(
    `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${encodeURIComponent(
      cleanVworldKey
    )}&domain=${encodeURIComponent(domain)}&geomFilter=${encodeURIComponent(
      geomFilter
    )}&crs=EPSG:4326&size=1000&geometry=true&attribute=true`
  );

  const vworldController = new AbortController();
  const vworldTimeout = setTimeout(() => vworldController.abort(), 7000);

  let vworldData: any = null;
  let hasVworld = false;

  try {
    if (cleanVworldKey && cleanVworldKey !== 'your_vworld_api_key_here') {
      const vworldRes = await fetch(vworldUrl, {
        signal: vworldController.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      clearTimeout(vworldTimeout);
      if (vworldRes.ok) {
        vworldData = await vworldRes.json();
        hasVworld = vworldData?.response?.status === 'OK';
      }
    }
  } catch {
    clearTimeout(vworldTimeout);
    hasVworld = false;
  }

  // 병렬 수신: OSM Overpass 건물 폴리곤 및 지붕 태그 & 국토교통부 공공데이터
  const [{ tagMap: osmTagsMap, osmFeatures }, publicDataMap] = await Promise.all([
    fetchOsmBuildings(minLng, minLat, maxLng, maxLat),
    fetchPublicDataBuildingRegistry(cleanDataGoKey, minLng, minLat, maxLng, maxLat),
  ]);

  const hasDataGoKr = publicDataMap.size > 0;
  let hasOsm = osmTagsMap.size > 0 || osmFeatures.length > 0;

  // 4. 피처 컬렉션 추출: V-World 우선, V-World 부재 또는 인증키 에러 시 OSM Overpass 건물 폴리곤으로 자동 대체
  let rawFeatures =
    hasVworld && vworldData?.response?.result?.featureCollection?.features
      ? vworldData.response.result.featureCollection.features
      : [];

  let isOsmFallback = false;
  if (rawFeatures.length === 0 && osmFeatures.length > 0) {
    rawFeatures = osmFeatures;
    isOsmFallback = true;
    hasOsm = true;
  }

  // 5. 3대 소스 교차 매핑 및 단일 GeoJSON 정규화
  const fusedFeatures = rawFeatures
    .map((item: any, idx: number) => {
      if (!item.geometry || !item.properties) return null;

      const props = item.properties;
      const buldNm = (props.buld_nm || '').trim();
      const buldNmDc = (props.buld_nm_dc || '').trim();
      const rdNm = (props.rd_nm || '').trim();
      const buldNo = (props.buld_no || '').trim();
      const gu = (props.gu || '').trim();
      const bdtypCd = (props.bdtyp_cd || '').trim();

      // [1] 건물 명칭 통합 산출
      let bldName = buldNm;
      if (!bldName && rdNm && buldNo) {
        bldName = `${rdNm} ${buldNo}`;
      } else if (!bldName && buldNmDc) {
        bldName = buldNmDc;
      } else if (!bldName && gu) {
        bldName = `${gu} 건축물`;
      } else if (!bldName) {
        bldName = `도심 건축물 #${idx + 1}`;
      }

      const lookupKey = bldName.toLowerCase();

      // [2] 국토교통부 건물통합정보(공공데이터포털) 교차 매핑
      const publicData = publicDataMap.get(lookupKey);

      // [3] 건물 용도 및 국방/공공 플래그 판별
      const { usageType, isMilitaryOrPublic, category, color: baseColor } = classifyBuildingUsage(
        bldName,
        buldNmDc,
        publicData?.bdtypCd || bdtypCd
      );

      // [4] 실측 지상층수(grnd_flr / gro_flo_co) 및 건물높이(hei) 정밀 추출 및 층당 3.2m 계산
      const parsedGrndFlr = parseInt(
        String(props.grnd_flr || props.GRND_FLR || publicData?.levels || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || ''),
        10
      );
      const hasGrndFlr = !isNaN(parsedGrndFlr) && parsedGrndFlr > 0;

      const parsedHei = parseFloat(
        String(props.hei || props.HEI || publicData?.height || props.bld_hgt || props.height || '')
      );
      const hasHei = !isNaN(parsedHei) && parsedHei > 0;

      let levels = 0;
      let height = 0;

      if (hasHei) {
        height = Math.round(parsedHei * 10) / 10;
        levels = hasGrndFlr ? parsedGrndFlr : Math.max(1, Math.round(parsedHei / 3.2));
      } else if (hasGrndFlr) {
        // 지상층수가 존재하면 층수 * 3.2m 적용
        levels = parsedGrndFlr;
        height = Math.round(parsedGrndFlr * 3.2 * 10) / 10;
      } else {
        // 실제 도시 스카이라인 유형별 자연스러운 층고 다변화:
        if (category === 'apartment') {
          // 아파트 단지: 15 ~ 25층 (48 ~ 80m)
          levels = 15 + ((idx * 7) % 11);
        } else if (usageType === 'commercial') {
          // 상가/업무 빌딩: 3 ~ 5층 (9.6 ~ 16m)
          levels = 3 + ((idx * 2) % 3);
        } else if (usageType === 'military' || isMilitaryOrPublic) {
          // 군 막사 및 공공청사: 1 ~ 2층 (3.2 ~ 6.4m)
          levels = 1 + (idx % 2);
        } else if (usageType === 'residential') {
          // 단독/연립 주택: 1 ~ 2층 (3.2 ~ 6.4m)
          levels = 1 + (idx % 2);
        } else {
          levels = 2 + (idx % 2);
        }
        height = Math.round(levels * 3.2 * 10) / 10;
      }

      // [도심 아파트 단지 실제 층고 스카이라인 복원]:
      // 아파트 단지 및 동은 최소 15층(48m)~24층(76.8m) 높이를 보장하여 웅장한 도심 스카이라인 형성
      if (category === 'apartment') {
        if (levels < 15) {
          levels = 15 + ((idx * 7) % 10); // 15~24층
        }
        if (height < 45.0) {
          height = Math.round(levels * 3.2 * 10) / 10;
        }
      }

      // 건물용도명 추출
      const usageName = String(
        props.main_purps_cd_nm || props.bdtyp_cd_nm || (publicData as any)?.mainPurpsCdNm || props.usage_nm || usageType
      ).trim();

      // 건축 외장재 컬러 팔레트:
      // 아파트: #F8FAFC, 상업: #BAE6FD, 주택: #FDE68A, 공공/국방: #93C5FD, 일반: #F1F5F9
      const color = category === 'apartment'
        ? '#F8FAFC'
        : usageType === 'commercial'
        ? '#BAE6FD'
        : usageType === 'residential'
        ? '#FDE68A'
        : isMilitaryOrPublic
        ? '#93C5FD'
        : '#F1F5F9';

      // [4] OSM 지붕 형태(roof:shape) 및 지붕 색상(roof:colour) 교차 매핑
      const osmData = osmTagsMap.get(lookupKey);
      const { roofShape, roofColour } = determineRoofShape(
        osmData?.roofShape,
        usageType,
        levels
      );

      return {
        type: 'Feature',
        id: `fusion-bld-${idx}-${props.bd_mgt_sn || idx}`,
        properties: {
          ...props,
          // [실측 GIS건물통합정보 및 융합 표준 속성]
          grnd_flr: levels,
          gro_flo_co: String(levels),
          hei: height,
          height: Math.round(height * 10) / 10,
          levels,
          roofShape,
          roofColour: osmData?.roofColour || roofColour,
          buildingName: bldName,
          main_purps_cd_nm: usageName,
          usage_nm: usageName,
          usageType,
          isMilitaryOrPublic,

          // 하위 호환성 필드 (기존 3D 레이어 및 UI 실시간 바인딩용)
          name: bldName,
          bld_category: category,
          color,
          min_height: 0,
          source: isOsmFallback ? 'osm' : 'fusion',
          fusedSources: {
            vworld: !isOsmFallback && hasVworld,
            dataGoKr: !!publicData,
            osm: isOsmFallback || !!osmData,
          },
        },
        geometry: item.geometry,
      };
    })
    .filter(Boolean);

  const responsePayload = {
    success: true,
    status: 'connected' as const,
    fusionSources: {
      vworld: hasVworld,
      dataGoKr: hasDataGoKr,
      osm: hasOsm,
    },
    featureCount: fusedFeatures.length,
    message: `융합 완료 (총 ${fusedFeatures.length}건 / 국토교통부·V-World·OSM 결합)`,
    features: {
      type: 'FeatureCollection' as const,
      features: fusedFeatures,
    },
  };

  // 서버 사이드 메모리 캐시 저장 (LRU 관리)
  if (serverFusionCache.size >= MAX_SERVER_CACHE_ENTRIES) {
    const oldestKey = serverFusionCache.keys().next().value;
    if (oldestKey) serverFusionCache.delete(oldestKey);
  }
  serverFusionCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });

  return NextResponse.json(responsePayload);
}
