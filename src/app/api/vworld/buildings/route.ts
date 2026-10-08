import { NextRequest, NextResponse } from 'next/server';

/**
 * 건물 용도 및 명칭을 바탕으로 브이월드 스타일 3D 색상과 카테고리를 판별합니다.
 */
function classifyBuilding(name = '', detailName = '') {
  const combined = `${name} ${detailName}`.toLowerCase();

  // 1. 아파트 / 공동주택 (#E2E8F0)
  if (
    combined.includes('아파트') ||
    combined.includes('apt') ||
    combined.includes('빌라') ||
    combined.includes('연립') ||
    combined.includes('맨션') ||
    combined.includes('주택') ||
    combined.includes('단지') ||
    combined.includes('하이츠')
  ) {
    return {
      bld_category: 'apartment' as const,
      bld_category_label: '공동주택·주거시설',
      color: '#E2E8F0',
    };
  }

  // 2. 공공청사 / 군사시설 (#94A3B8)
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
      color: '#94A3B8',
    };
  }

  // 3. 상업 / 업무시설 (#BAE6FD)
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

  // 4. 일반 건축물 (#CBD5E1)
  return {
    bld_category: 'general' as const,
    bld_category_label: '일반 건축물',
    color: '#CBD5E1',
  };
}

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

  const [minLng, minLat, maxLng, maxLat] = coords;

  // 3. V-World Data 2.0 API 호출 (서버 사이드)
  // LT_C_SPBD: 건축물일반공간정보 (V-World Data 2.0 규격: geomFilter=BOX(minX,minY,maxX,maxY))
  // 발급된 인증키의 도메인(localhost 기본값)을 최우선으로 사용하여 Vercel 클라우드에서도 도메인 불일치 에러 방지
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

    // 피처 정규화 및 3D 속성 매핑
    const features = rawFeatures
      .map((item: any) => {
        if (!item.geometry || !item.properties) return null;

        const props = item.properties;
        const buldNm = (props.buld_nm || '').trim();
        const buldNmDc = (props.buld_nm_dc || '').trim();
        const rdNm = (props.rd_nm || '').trim();
        const buldNo = (props.buld_no || '').trim();
        const gu = (props.gu || '').trim();

        // 가장 식별력 높은 명칭 조합
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

        // 지상 층수 파싱
        const rawLevels = parseInt(props.gro_flo_co || props.grnd_flr_cnt || '2', 10);
        const levels = Math.max(1, isNaN(rawLevels) ? 2 : rawLevels);
        const height = levels * 3.3; // 층당 3.3m 산정

        const { bld_category, bld_category_label, color } = classifyBuilding(
          bldName,
          buldNmDc
        );

        return {
          type: 'Feature',
          properties: {
            ...props,
            name: bldName,
            levels,
            height,
            min_height: 0,
            bld_category,
            bld_category_label,
            color,
            source: 'vworld',
          },
          geometry: item.geometry,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      status: 'connected',
      featureCount: features.length,
      message: `정상 연동 (실시간 건물 ${features.length}건 수신)`,
      features: {
        type: 'FeatureCollection',
        features,
      },
    });
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
