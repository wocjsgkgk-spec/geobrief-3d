import { NextRequest, NextResponse } from 'next/server';
import { assertSafeUpstreamUrl } from '@/utils/securityValidator';
import { transformGeometryCoordinatesToWgs84 } from '@/utils/koreanCoordTransform';

/**
 * 건물 용도 및 명칭을 바탕으로 브이월드 스타일 3D 색상과 카테고리를 판별합니다.
 */
function classifyBuilding(name = '', detailName = '', groFlo = 0) {
  const combined = `${name} ${detailName}`.toLowerCase();

  // 1. 대형 아파트 단지 (#F8FAFC)
  if (
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
    groFlo >= 10
  ) {
    return {
      bld_category: 'apartment' as const,
      bld_category_label: '공동주택·아파트',
      color: '#F8FAFC',
    };
  }

  // 2. 단독/연립 주택가 (#FDE68A)
  if (
    combined.includes('빌라') ||
    combined.includes('연립') ||
    combined.includes('맨션') ||
    combined.includes('주택') ||
    combined.includes('하이츠') ||
    combined.includes('원룸') ||
    combined.includes('다가구') ||
    combined.includes('단독') ||
    (groFlo > 0 && groFlo <= 3 && !combined.includes('타워') && !combined.includes('빌딩') && !combined.includes('상가'))
  ) {
    return {
      bld_category: 'residential' as const,
      bld_category_label: '단독·연립주택',
      color: '#FDE68A',
    };
  }

  // 3. 공공청사 / 군사시설 (#93C5FD)
  if (
    combined.includes('청사') ||
    combined.includes('시청') ||
    combined.includes('구청') ||
    combined.includes('군청') ||
    combined.includes('면사무소') ||
    combined.includes('동주민센터') ||
    combined.includes('행정복지센터') ||
    combined.includes('파출소') ||
    combined.includes('경찰서') ||
    combined.includes('소방서') ||
    combined.includes('군부대') ||
    combined.includes('대대') ||
    combined.includes('사단') ||
    combined.includes('사령부') ||
    combined.includes('보건소') ||
    combined.includes('우체국') ||
    combined.includes('학교') ||
    combined.includes('초등학교') ||
    combined.includes('중학교') ||
    combined.includes('고등학교')
  ) {
    return {
      bld_category: 'public_military' as const,
      bld_category_label: '공공청사·군사·교육시설',
      color: '#93C5FD',
    };
  }

  // 4. 상업 / 업무시설 (#BAE6FD)
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
    combined.includes('클리닉') ||
    combined.includes('상가') ||
    groFlo >= 4
  ) {
    return {
      bld_category: 'commercial' as const,
      bld_category_label: '상업·업무시설',
      color: '#BAE6FD',
    };
  }

  // 5. 일반 건축물 (#F1F5F9)
  return {
    bld_category: 'general' as const,
    bld_category_label: '일반 건축물',
    color: '#F1F5F9',
  };
}

// 서버 사이드 인메모리 BBOX 공간 쿼리 캐시 (TTL 15분, 최대 300개 영역)
const serverVworldCache = new Map<string, { timestamp: number; data: any }>();
const SERVER_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SERVER_CACHE_ENTRIES = 300;

/**
 * GET /api/vworld/buildings?bbox=minLng,minLat,maxLng,maxLat&customKey=...
 * 국토교통부 브이월드(V-World) OGC WFS 1.1.0 (LT_C_SPBD) 실측 건축물대장 프록시
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bboxParam = searchParams.get('bbox');
  const customKey = searchParams.get('customKey');

  // 1. API 키 판별 (Custom Key > 환경변수 VWORLD_API_KEY)
  const rawKey =
    customKey ||
    process.env.VWORLD_API_KEY ||
    process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
    '';

  const cleanKey = rawKey.replace(/['"`]/g, '').trim();

  if (!cleanKey || cleanKey === 'your_vworld_api_key_here') {
    console.warn('[V-World WFS] VWORLD_API_KEY가 등록되지 않았습니다 (환경변수 또는 UI 설정 필요)');
    return NextResponse.json(
      {
        success: false,
        status: 'unconfigured',
        featureCount: 0,
        message: 'V-World API 키가 등록되지 않았습니다 (환경변수 또는 UI 설정 필요)',
      },
      { status: 200 }
    );
  }

  // 2. BBOX 파라미터 검증
  if (!bboxParam) {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        message: 'bbox 파라미터가 누락되었습니다 (형식: minLng,minLat,maxLng,maxLat)',
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

  // 스마트 좌표축 판별 (경도 124~132 vs 위도 33~39 자동 감지 및 정규화)
  let [c0, c1, c2, c3] = coords;
  let minLng: number, minLat: number, maxLng: number, maxLat: number;

  if (c0 > 100 && c2 > 100) {
    // [minLng, minLat, maxLng, maxLat]
    minLng = Math.min(c0, c2);
    maxLng = Math.max(c0, c2);
    minLat = Math.min(c1, c3);
    maxLat = Math.max(c1, c3);
  } else {
    // [minLat, minLng, maxLat, maxLng]
    minLat = Math.min(c0, c2);
    maxLat = Math.max(c0, c2);
    minLng = Math.min(c1, c3);
    maxLng = Math.max(c1, c3);
  }

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

  // 뷰포트 분할: V-World WFS 1회 최대 1,000건 제한을 고려하여
  // 넓은 영역(면적 > 8.5km²)은 서브셀로 분할하여 병렬 수집
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  const areaKm2 = (lngSpan * 88.5) * (latSpan * 111.0);

  const subCells: [number, number, number, number][] = [];
  if (areaKm2 > 8.5) {
    const cols = Math.max(1, Math.min(3, Math.ceil(lngSpan / 0.028)));
    const rows = Math.max(1, Math.min(3, Math.ceil(latSpan / 0.024)));
    const stepLng = lngSpan / cols;
    const stepLat = latSpan / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        subCells.push([
          Math.round((minLng + c * stepLng) * 10000) / 10000,
          Math.round((minLat + r * stepLat) * 10000) / 10000,
          Math.round((c === cols - 1 ? maxLng : minLng + (c + 1) * stepLng) * 10000) / 10000,
          Math.round((r === rows - 1 ? maxLat : minLat + (r + 1) * stepLat) * 10000) / 10000,
        ]);
      }
    }
  } else {
    subCells.push([minLng, minLat, maxLng, maxLat]);
  }

  // 서버 사이드 메모리 캐시 검사
  const cacheKey = `${cleanKey.slice(0, 6)}_${minLng.toFixed(3)}_${minLat.toFixed(3)}_${maxLng.toFixed(3)}_${maxLat.toFixed(3)}`;
  const cached = serverVworldCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // 3. 국토교통부 브이월드 WFS 1.1.0 API 정밀 호출
  // 엔드포인트: https://api.vworld.kr/req/wfs
  // WFS 1.1.0 EPSG:4326 규격: BBOX는 반드시 (minLat, minLng, maxLat, maxLng, EPSG:4326) 축 순서 준수
  const preferredDomain = process.env.VWORLD_DOMAIN || 'localhost';
  const maxFeaturesParam = searchParams.get('maxFeatures');
  const maxFeatures = Math.min(25000, Math.max(100, parseInt(maxFeaturesParam || '25000', 10)));

  const rawFeatures: any[] = [];
  const seenFeatureIds = new Set<string>();
  let hasAuthOrQuotaError = false;
  let authErrorMessage = '';

  try {
    const cellFetches = subCells.map(async (cell) => {
      const [cMinLng, cMinLat, cMaxLng, cMaxLat] = cell;
      const wfsBbox = `${cMinLat},${cMinLng},${cMaxLat},${cMaxLng},EPSG:4326`;
      const wfsUrl = assertSafeUpstreamUrl(
        `https://api.vworld.kr/req/wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=lt_c_spbd&SRSNAME=EPSG:4326&BBOX=${wfsBbox}&OUTPUT=application/json&KEY=${encodeURIComponent(
          cleanKey
        )}&DOMAIN=${encodeURIComponent(preferredDomain)}&MAXFEATURES=1000`
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(wfsUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        clearTimeout(timeoutId);

        const text = await res.text();
        if (text.startsWith('<') || text.includes('ServiceException')) {
          console.error('[V-World WFS Auth/Quota Error]', text.slice(0, 300));
          hasAuthOrQuotaError = true;
          authErrorMessage = text.slice(0, 300);
          return [];
        }

        const data = JSON.parse(text);
        const items = data.features || [];
        return items;
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn('[V-World WFS] Cell fetch notice:', err?.message || err);
        return [];
      }
    });

    const settled = await Promise.allSettled(cellFetches);
    for (const s of settled) {
      if (s.status === 'fulfilled' && Array.isArray(s.value)) {
        for (const item of s.value) {
          const fid = item.id || item.properties?.bd_mgt_sn;
          if (fid && seenFeatureIds.has(fid)) continue;
          if (fid) seenFeatureIds.add(fid);
          rawFeatures.push(item);
          if (rawFeatures.length >= maxFeatures) break;
        }
      }
      if (rawFeatures.length >= maxFeatures) break;
    }

    if (rawFeatures.length === 0 && hasAuthOrQuotaError) {
      return NextResponse.json(
        {
          success: false,
          status: 'auth_error',
          featureCount: 0,
          errorDetail: authErrorMessage,
          message: 'V-World WFS 인증/도메인 또는 쿼터 오류 발생 (오픈 무료 벡터로 안전 자동 대체)',
        },
        { status: 200 }
      );
    }

    const clampedFeatures = rawFeatures.slice(0, maxFeatures);

    // 피처 정규화 및 [1단계: V-World WFS 실측 100% 우선 바인딩]
    // buld_nm(건물명), gro_flo_co(실측 지상층수), und_flo_co(지하층수), pnu, bd_mgt_sn
    const features = clampedFeatures
      .map((item: any, idx: number) => {
        if (!item.geometry || !item.properties) return null;

        const props = item.properties;
        const buldNm = (props.buld_nm || '').trim();
        const buldNmDc = (props.buld_nm_dc || '').trim();
        const rdNm = (props.rd_nm || '').trim();
        const buldNo = (props.buld_no || '').trim();
        const gu = (props.gu || '').trim();

        // 1. 실제 건축물명 조합
        let bldName = buldNm;
        if (!bldName && rdNm && buldNo) {
          bldName = `${rdNm} ${buldNo}`;
        } else if (!bldName && buldNmDc) {
          bldName = buldNmDc;
        } else if (!bldName && gu) {
          bldName = `${gu} 건축물`;
        } else if (!bldName) {
          bldName = '일반 건축물';
        }

        // 2. 실측 지상층수(gro_flo_co / grnd_flr) 정밀 파싱
        const rawGroFlo = parseInt(
          String(props.gro_flo_co ?? props.GRO_FLO_CO ?? props.grnd_flr ?? props.GRND_FLR ?? ''),
          10
        );
        const hasGroFlo = !isNaN(rawGroFlo) && rawGroFlo > 0;

        const rawUndFlo = parseInt(
          String(props.und_flo_co ?? props.UND_FLO_CO ?? props.ugrnd_flr ?? '0'),
          10
        );
        const undFlo = !isNaN(rawUndFlo) ? rawUndFlo : 0;

        const { bld_category, bld_category_label, color } = classifyBuilding(
          bldName,
          buldNmDc,
          hasGroFlo ? rawGroFlo : 0
        );

        // 건물용도명 추출
        const usageName = String(
          props.main_purps_cd_nm || props.bdtyp_cd_nm || props.usage_nm || bld_category_label || ''
        ).trim();

        // 3. 2단계 높이·층수 규칙 적용:
        // - 소형 단독주택·다세대·원룸: 절대 10.5m를 넘지 않음 (6.5m ~ 10m)
        // - 아파트 단지: 15~25층 (48m ~ 80m)
        // - 상업/업무: 3~6층 (10.5m ~ 21m)
        let levels = 2;
        let height = 6.4;

        if (bld_category === 'apartment') {
          levels = hasGroFlo ? Math.max(15, rawGroFlo) : 18;
          height = Math.max(45.0, Math.min(85.0, levels * 3.2));
        } else if (bld_category === 'residential' || (!hasGroFlo && bld_category === 'general')) {
          levels = hasGroFlo ? Math.min(rawGroFlo, 3) : 2;
          height = Math.min(levels * 3.2, 10.5);
        } else if (bld_category === 'commercial') {
          levels = hasGroFlo ? rawGroFlo : 4;
          height = levels * 3.5;
        } else if (bld_category === 'public_military') {
          levels = hasGroFlo ? rawGroFlo : 3;
          height = levels * 3.5;
        } else {
          levels = hasGroFlo ? Math.min(rawGroFlo, 3) : 2;
          height = Math.min(levels * 3.2, 10.5);
        }

        return {
          type: 'Feature',
          id: item.id || `vworld-bld-${idx}-${props.bd_mgt_sn || idx}`,
          properties: {
            ...props,
            name: bldName,
            buildingName: bldName,
            buld_nm: bldName,
            buld_nm_dc: buldNmDc,
            main_purps_nm: usageName,
            main_purps_cd_nm: usageName,
            usage_nm: usageName,
            grnd_flr: levels,
            gro_flo_co: levels,
            und_flo_co: undFlo,
            hei: height,
            height,
            levels,
            min_height: 0,
            bld_category,
            bld_category_label,
            color,
            source: 'vworld',
          },
          geometry: {
            ...item.geometry,
            coordinates: transformGeometryCoordinatesToWgs84(item.geometry.coordinates),
          },
        };
      })
      .filter(Boolean);

    const responsePayload = {
      success: true,
      status: 'connected',
      featureCount: features.length,
      message: `정상 연동 (실시간 건축물 ${features.length}동 수신 / V-World OGC WFS 1.1.0 LT_C_SPBD)`,
      features: {
        type: 'FeatureCollection',
        features,
      },
    };

    // 서버 메모리 캐시 저장 (LRU 관리)
    if (serverVworldCache.size >= MAX_SERVER_CACHE_ENTRIES) {
      const oldestKey = serverVworldCache.keys().next().value;
      if (oldestKey) serverVworldCache.delete(oldestKey);
    }
    serverVworldCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    const errText = isTimeout
      ? 'V-World 요청 시간 초과 (8초 타임아웃)'
      : err?.message || '네트워크 통신 오류';

    console.warn('[V-World WFS Exception]', errText);
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        errorCode: isTimeout ? 'TIMEOUT' : 'FETCH_ERROR',
        errorDetail: errText,
        message: `${errText} (오픈 무료 벡터로 자동 대체)`,
      },
      { status: 200 }
    );
  }
}
