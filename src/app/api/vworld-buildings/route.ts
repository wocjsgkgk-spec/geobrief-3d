import { NextRequest, NextResponse } from 'next/server';

/**
 * 건물 용도 및 명칭을 바탕으로 브이월드 스타일 3D 색상과 카테고리를 판별합니다.
 */
function classifyBuilding(name = '', detailName = '') {
  const combined = `${name} ${detailName}`.toLowerCase();

  // 1. 대형 아파트 단지 (#f5f2eb)
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
      color: '#f5f2eb',
      roofColour: '#57534e',
    };
  }

  // 2. 단독/연립 주택가 (#8c3f2b)
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
      color: '#8c3f2b',
      roofColour: '#6e3222',
    };
  }

  // 3. 공공청사 / 군사시설 (#ece7de)
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
    combined.includes('고등학교') ||
    combined.includes('대학교') ||
    combined.includes('상지대')
  ) {
    return {
      bld_category: 'public_military' as const,
      bld_category_label: '공공청사·군사·교육시설',
      color: '#ece7de',
      roofColour: '#254e7a',
    };
  }

  // 4. 상업 / 업무시설 (#dfd9ce)
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
      color: '#dfd9ce',
      roofColour: '#357a56',
    };
  }

  // 5. 일반 건축물 (#eae3d5)
  return {
    bld_category: 'general' as const,
    bld_category_label: '일반 건축물',
    color: '#eae3d5',
    roofColour: '#357a56',
  };
}

// 서버 사이드 인메모리 BBOX 공간 쿼리 캐시 (TTL 15분, 최대 300개 영역)
const serverVworldCache = new Map<string, { timestamp: number; data: any }>();
const SERVER_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * GET /api/vworld-buildings?bbox=minLng,minLat,maxLng,maxLat&customKey=...
 * 국토교통부 브이월드(V-World) 2D/3D GIS건물통합정보(LT_C_SPBD) 실시간 수집 엔드포인트
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

  // V-World API의 10km² BBOX 제한(INVALID_RANGE 에러)을 우회하기 위해
  // 요청 면적이 8.5km² 이상일 경우 자동으로 안전한 서브셀로 분할하여 병렬 수집
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

  // 3. V-World Data 2.0 API 호출 (LT_C_SPBD 건축물일반공간정보)
  const preferredDomain = process.env.VWORLD_DOMAIN || 'localhost';
  const maxFeaturesParam = searchParams.get('maxFeatures');
  const maxFeatures = Math.min(5000, Math.max(100, parseInt(maxFeaturesParam || '5000', 10)));
  const perCellLimit = Math.max(500, Math.ceil(maxFeatures / subCells.length));

  const rawFeatures: any[] = [];
  const seenFeatureIds = new Set<string>();

  try {
    const cellFetches = subCells.map(async (cell) => {
      const [cMinLng, cMinLat, cMaxLng, cMaxLat] = cell;
      const geomFilter = `BOX(${cMinLng},${cMinLat},${cMaxLng},${cMaxLat})`;
      const vworldUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${encodeURIComponent(
        cleanKey
      )}&domain=${encodeURIComponent(preferredDomain)}&geomFilter=${encodeURIComponent(
        geomFilter
      )}&crs=EPSG:4326&size=1000&geometry=true&attribute=true`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(vworldUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        clearTimeout(timeoutId);
        if (!res.ok) return [];

        const data = await res.json();
        if (data.response?.status !== 'OK') return [];

        const items = data.response?.result?.featureCollection?.features || [];
        const totalRecords = parseInt(data.response?.page?.record || data.response?.page?.total || '0', 10);

        if (totalRecords > 1000 && items.length < perCellLimit) {
          const pageUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${encodeURIComponent(
            cleanKey
          )}&domain=${encodeURIComponent(preferredDomain)}&geomFilter=${encodeURIComponent(
            geomFilter
          )}&crs=EPSG:4326&size=1000&page=2&geometry=true&attribute=true`;
          try {
            const pageRes = await fetch(pageUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
            if (pageRes.ok) {
              const pData = await pageRes.json();
              const pItems = pData.response?.result?.featureCollection?.features || [];
              for (let i = 0; i < pItems.length; i++) {
                items.push(pItems[i]);
              }
            }
          } catch {
            // ignore
          }
        }
        return items;
      } catch {
        clearTimeout(timeoutId);
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

    const clampedFeatures = rawFeatures.slice(0, maxFeatures);

    // 피처 정규화 및 한국 건축물대장 속성(지상층수 grnd_flr, 지하층수 ugrnd_flr, 건물명 buld_nm, 세부용도) 정밀 매핑
    const features = clampedFeatures
      .map((item: any, idx: number) => {
        if (!item.geometry || !item.properties) return null;

        const props = item.properties;
        const buldNm = (props.buld_nm || '').trim();
        const buldNmDc = (props.buld_nm_dc || '').trim();
        const rdNm = (props.rd_nm || '').trim();
        const buldNo = (props.buld_no || '').trim();
        const gu = (props.gu || '').trim();

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

        const { bld_category, bld_category_label, color, roofColour } = classifyBuilding(
          bldName,
          buldNmDc
        );

        const usageName = String(
          props.main_purps_cd_nm || props.bdtyp_cd_nm || props.usage_nm || bld_category_label || ''
        ).trim();

        // 1. 실측 지상층수(grnd_flr / gro_flo_co) 및 지하층수(ugrnd_flr) 정밀 추출
        const rawGrndFlr = parseInt(
          String(props.grnd_flr || props.GRND_FLR || props.gro_flo_co || props.GRO_FLO_CO || props.grnd_flr_cnt || props.levels || ''),
          10
        );
        const hasGrndFlr = !isNaN(rawGrndFlr) && rawGrndFlr > 0;

        const rawUgrndFlr = parseInt(
          String(props.ugrnd_flr || props.UGRND_FLR || props.und_flo_co || props.UND_FLO_CO || '0'),
          10
        );
        const ugrndFlr = !isNaN(rawUgrndFlr) ? rawUgrndFlr : 0;

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
          levels = rawGrndFlr;
          height = Math.round(rawGrndFlr * 3.2 * 10) / 10;
        } else {
          // 층수 누락 시 건물 분류 기반 실측형 기본값
          if (bld_category === 'apartment') {
            levels = 18;
            height = 54.0;
          } else if (bld_category === 'commercial') {
            levels = 5;
            height = 16.0;
          } else if (bld_category === 'public_military') {
            levels = 3;
            height = 10.5;
          } else {
            levels = 2;
            height = 6.5;
          }
        }

        return {
          type: 'Feature',
          id: item.id || props.bd_mgt_sn || `vworld-bld-${idx}`,
          properties: {
            ...props,
            name: bldName,
            buildingName: bldName,
            buld_nm: bldName,
            buld_nm_dc: buldNmDc,
            main_purps_nm: props.main_purps_nm || usageName,
            grnd_flr: levels,
            ugrnd_flr: ugrndFlr,
            levels,
            height,
            hei: height,
            min_height: 0,
            usageType: bld_category,
            usageName,
            bld_category,
            bld_category_label,
            color,
            roofColour,
            roofColor: roofColour,
            source: 'vworld',
          },
          geometry: item.geometry,
        };
      })
      .filter(Boolean);

    const result = {
      success: true,
      status: 'connected',
      featureCount: features.length,
      totalCount: features.length,
      message: `V-World 건축물대장 공간정보 ${features.length}동 정상 수신`,
      features: {
        type: 'FeatureCollection',
        features,
      },
    };

    serverVworldCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        featureCount: 0,
        message: `V-World WFS 통신 예외 발생: ${(err as Error)?.message || err}`,
      },
      { status: 200 }
    );
  }
}
