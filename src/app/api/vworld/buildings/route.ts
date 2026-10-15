import { NextRequest, NextResponse } from 'next/server';

/**
 * 건물 용도 및 명칭을 바탕으로 브이월드 스타일 3D 색상과 카테고리를 판별합니다.
 */
function classifyBuilding(name = '', detailName = '') {
  const combined = `${name} ${detailName}`.toLowerCase();

  // 1. 아파트 / 공동주택 (#E2E8F0)
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
    combined.includes('롯데캐슬')
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
    combined.includes('단독')
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
    combined.includes('상가')
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
 * 브라우저 CORS 회피 및 안정적 통신을 위한 서버 사이드 V-World Data API 프록시
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bboxParam = searchParams.get('bbox');
  const customKey = searchParams.get('customKey');

  // 1. API 키 판별 (Custom Key > .env VWORLD_API_KEY > .env NEXT_PUBLIC_VWORLD_API_KEY)
  const rawKey =
    customKey ||
    process.env.VWORLD_API_KEY ||
    process.env.NEXT_PUBLIC_VWORLD_API_KEY ||
    '';

  const cleanKey = rawKey.replace(/['"`]/g, '').trim();

  if (!cleanKey || cleanKey === 'your_vworld_api_key_here') {
    return NextResponse.json(
      {
        success: false,
        status: 'unconfigured',
        featureCount: 0,
        message: 'V-World API 키가 등록되지 않았습니다 (.env.local 또는 UI 설정)',
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

  // 뷰포트가 넓을 경우 중심 좌표 기준 0.12도 서브 영역으로 자동 클램핑하여 400 에러 차단
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  const MAX_SPAN = 0.12;
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
  const cacheKey = `${cleanKey.slice(0, 6)}_${minLng.toFixed(3)}_${minLat.toFixed(3)}_${maxLng.toFixed(3)}_${maxLat.toFixed(3)}`;
  const cached = serverVworldCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // 3. V-World Data 2.0 API 호출 (서버 사이드)
  // LT_C_SPBD: 건축물일반공간정보 (V-World Data 2.0 규격: geomFilter=BOX(minX,minY,maxX,maxY))
  const preferredDomain = process.env.VWORLD_DOMAIN || 'localhost';

  const geomFilter = `BOX(${minLng},${minLat},${maxLng},${maxLat})`;
  const vworldUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${encodeURIComponent(
    cleanKey
  )}&domain=${encodeURIComponent(preferredDomain)}&geomFilter=${encodeURIComponent(
    geomFilter
  )}&crs=EPSG:4326&size=1000&geometry=true&attribute=true`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8초 타임아웃

  try {
    const res = await fetch(vworldUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          httpStatus: res.status,
          message: `V-World 서버 응답 오류 (HTTP ${res.status})`,
        },
        { status: 200 }
      );
    }

    const data = await res.json();

    // V-World 응답 상태 확인
    if (data.response?.status !== 'OK') {
      const errCode = data.response?.error?.code || 'UNKNOWN_ERROR';
      const errText = data.response?.error?.text || '인증키 또는 파라미터 오류';

      return NextResponse.json(
        {
          success: false,
          status: 'error',
          errorCode: errCode,
          errorDetail: `${errCode}: ${errText}`,
          message: `${errText} (코드: ${errCode})`,
        },
        { status: 200 }
      );
    }

    const rawFeatures = data.response?.result?.featureCollection?.features || [];

    // 피처 정규화 및 3D 속성 매핑 (지상층수 grnd_flr, 건물높이 hei, 건물용도명 추출)
    const features = rawFeatures
      .map((item: any, idx: number) => {
        if (!item.geometry || !item.properties) return null;

        const props = item.properties;
        const buldNm = (props.buld_nm || '').trim();
        const buldNmDc = (props.buld_nm_dc || '').trim();
        const rdNm = (props.rd_nm || '').trim();
        const buldNo = (props.buld_no || '').trim();
        const gu = (props.gu || '').trim();

        // 식별 명칭 조합
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

        const { bld_category, bld_category_label, color } = classifyBuilding(
          bldName,
          buldNmDc
        );

        // 건물용도명 추출
        const usageName = String(
          props.main_purps_cd_nm || props.bdtyp_cd_nm || props.usage_nm || bld_category_label || ''
        ).trim();

        // 1. 실측 지상층수(grnd_flr / gro_flo_co) 및 건물높이(hei) 정밀 추출
        const rawGrndFlr = parseInt(
          String(props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || props.levels || ''),
          10
        );
        const hasGrndFlr = !isNaN(rawGrndFlr) && rawGrndFlr > 0;

        const rawHei = parseFloat(
          String(props.hei || props.HEI || props.bld_hgt || props.height || '')
        );
        const hasHei = !isNaN(rawHei) && rawHei > 0;

        let levels = 0;
        let height = 0;

        if (hasHei) {
          height = Math.round(rawHei * 10) / 10;
          levels = hasGrndFlr ? rawGrndFlr : Math.max(1, Math.round(rawHei / 3.2));
        } else if (hasGrndFlr) {
          // 지상층수가 존재하면 층수 * 3.2m 적용
          levels = rawGrndFlr;
          height = Math.round(rawGrndFlr * 3.2 * 10) / 10;
        } else {
          // 지상층수 미제공 시: 실제 아파트(15~25층), 상가(3~5층), 단층/2층 막사(1~2층)
          if (bld_category === 'apartment') {
            levels = 15 + ((idx * 7) % 11); // 15 ~ 25층 (48 ~ 80m)
          } else if (bld_category === 'commercial') {
            levels = 3 + ((idx * 2) % 3); // 3 ~ 5층 (9.6 ~ 16m)
          } else if (bld_category === 'public_military') {
            levels = 1 + (idx % 2); // 1 ~ 2층 막사 (3.2 ~ 6.4m)
          } else if (bld_category === 'residential') {
            levels = 1 + (idx % 2); // 1 ~ 2층 주택 (3.2 ~ 6.4m)
          } else {
            levels = 2 + (idx % 2);
          }
          height = Math.round(levels * 3.2 * 10) / 10;
        }

        return {
          type: 'Feature',
          id: `vworld-bld-${idx}-${props.bd_mgt_sn || idx}`,
          properties: {
            ...props,
            name: bldName,
            buildingName: bldName,
            grnd_flr: levels,
            gro_flo_co: String(levels),
            hei: height,
            height,
            levels,
            min_height: 0,
            main_purps_cd_nm: usageName,
            usage_nm: usageName,
            bld_category,
            bld_category_label,
            color,
            source: 'vworld',
          },
          geometry: item.geometry,
        };
      })
      .filter(Boolean);

    const responsePayload = {
      success: true,
      status: 'connected',
      featureCount: features.length,
      message: `정상 연동 (실시간 건물 ${features.length}건 수신 / V-World LT_C_SPBD)`,
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
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const errText = isTimeout
      ? 'V-World 요청 시간 초과 (8초 타임아웃)'
      : err?.message || '네트워크 통신 오류';

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
