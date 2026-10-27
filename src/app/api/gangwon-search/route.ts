/**
 * app/api/gangwon-search/route.ts
 *
 * [GeoBrief 3D: 강원특별자치도 18개 시·군 전역 통합 주소·지번·부지 검색 API]
 *
 * 1. 0ms 즉시 검색 (프리셋 & 로컬 지적 색인):
 *    - 강원 18개 시·군 행정구역 거점 및 4대 권역
 *    - 국방개혁 2.0 해체 사단·군단 군 유휴부지 및 핵심 전략 거점
 *    - 로컬 연속지적도(JIBUN, PNU, 토지명) 빠른 검색
 *
 * 2. V-World Search 2.0 실시간 연동:
 *    - 장소/명칭/아파트 검색 (type=PLACE)
 *    - 도로명 주소 검색 (type=ADDRESS&category=ROAD)
 *    - 지번 주소 검색 (type=ADDRESS&category=PARCEL)
 *
 * 3. 스마트 폴백 (OSM Nominatim Geocoder kr 한정)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GANGWON_18_REGIONS,
  getAllGangwonMilitarySites,
  findGangwonRegionByCoords,
} from '@/constants/gangwon18Regions';
import fs from 'fs';
import path from 'path';
import { assertSafeUpstreamUrl } from '@/utils/securityValidator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getVworldKey(): string {
  const key = process.env.VWORLD_API_KEY || process.env.NEXT_PUBLIC_VWORLD_API_KEY || '';
  return key.trim().replace(/^["']|["']$/g, '');
}

export interface UnifiedSearchResult {
  id: string;
  title: string;
  category: 'region' | 'military_site' | 'address' | 'parcel' | 'place';
  categoryLabel: string;
  badge?: string;
  address?: string;
  coords: [number, number]; // [lng, lat]
  regionId?: string;
  regionName?: string;
  pnu?: string;
  jibun?: string;
  source: 'preset' | 'vworld_place' | 'vworld_address' | 'cadastral_local' | 'osm';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';

  if (!q || q.length < 1) {
    return NextResponse.json({ success: true, query: '', results: [] });
  }

  const results: UnifiedSearchResult[] = [];
  const qLower = q.toLowerCase();

  // ---------------------------------------------------------------------------
  // [1단계: 강원 18개 시·군 프리셋 0ms 즉시 검색]
  // ---------------------------------------------------------------------------
  for (const r of GANGWON_18_REGIONS) {
    if (
      r.name.includes(q) ||
      r.fullName.includes(q) ||
      r.id.toLowerCase().includes(qLower) ||
      q.includes(r.name) ||
      r.subregion.includes(q)
    ) {
      results.push({
        id: `region-${r.id}`,
        title: `${r.name} (${r.subregion})`,
        category: 'region',
        categoryLabel: `${r.type}청 소재지`,
        badge: r.subregion,
        address: r.fullName,
        coords: r.center,
        regionId: r.id,
        regionName: r.name,
        source: 'preset',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // [2단계: 강원 전역 국방개혁 군 유휴부지 & 핵심 개발 거점 0ms 즉시 검색]
  // ---------------------------------------------------------------------------
  const allMilitary = getAllGangwonMilitarySites();
  for (const s of allMilitary) {
    if (
      s.name.includes(q) ||
      s.description.includes(q) ||
      (s.targetUse && s.targetUse.includes(q)) ||
      s.regionName.includes(q)
    ) {
      results.push({
        id: `site-${s.siteId}`,
        title: s.name,
        category: 'military_site',
        categoryLabel: '군 유휴부지·전략거점',
        badge: `${s.regionName} · 약 ${(s.areaSqm * 0.3025).toLocaleString(undefined, { maximumFractionDigits: 0 })}평`,
        address: s.description,
        coords: s.coords,
        regionId: s.regionId,
        regionName: s.regionName,
        source: 'preset',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // [3단계: 로컬 연속지적도 지번/PNU 매칭 (원주 등 인제스트 데이터)]
  // ---------------------------------------------------------------------------
  try {
    const isJibunSearch = /\d+/.test(q);
    if (isJibunSearch) {
      const corePath = path.join(process.cwd(), 'public/data/cadastral/wonju_core.geojson');
      if (fs.existsSync(corePath)) {
        const raw = fs.readFileSync(corePath, 'utf8');
        const json = JSON.parse(raw);
        const features = json.features || [];
        let matchedCount = 0;

        for (const f of features) {
          if (matchedCount >= 3) break;
          const p = f.properties || {};
          const jibun = String(p.jibun || p.JIBUN || '');
          const pnu = String(p.pnu || p.PNU || '');
          if (jibun.includes(q) || pnu.includes(q)) {
            const coords =
              f.geometry?.type === 'Polygon'
                ? f.geometry.coordinates[0]?.[0]
                : f.geometry?.coordinates[0]?.[0]?.[0];
            if (coords) {
              results.push({
                id: `cadastral-${pnu || matchedCount}`,
                title: `원주시 지번 ${jibun}`,
                category: 'parcel',
                categoryLabel: `연속지적도 (${p.jimok || '대'})`,
                badge: '실측 지적도',
                address: `강원특별자치도 원주시 ${p.bjdName || ''} ${jibun}`,
                coords: [coords[0], coords[1]],
                regionId: 'wonju',
                regionName: '원주시',
                pnu,
                jibun,
                source: 'cadastral_local',
              });
              matchedCount++;
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // ---------------------------------------------------------------------------
  // [4단계: 브이월드 Search 2.0 API 실시간 질의 (장소 + 도로명 + 지번)]
  // ---------------------------------------------------------------------------
  const vKey = getVworldKey();
  if (vKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2800);

      const vSearchTypes = ['PLACE', 'ADDRESS'];
      const vPromises = vSearchTypes.map(async (stype) => {
        const cat = stype === 'ADDRESS' ? '&category=ROAD' : '';
        const url = assertSafeUpstreamUrl(
          `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=8&page=1&query=${encodeURIComponent(
            q
          )}&type=${stype}${cat}&format=json&key=${encodeURIComponent(vKey)}&domain=localhost`
        );

        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data?.response?.result?.items;
        return Array.isArray(items) ? items : [];
      });

      const searchOutputs = await Promise.allSettled(vPromises);
      clearTimeout(timeoutId);

      for (const out of searchOutputs) {
        if (out.status === 'fulfilled' && Array.isArray(out.value)) {
          for (const it of out.value) {
            const point = it.point;
            if (!point || !point.x || !point.y) continue;
            const lng = parseFloat(point.x);
            const lat = parseFloat(point.y);
            if (isNaN(lng) || isNaN(lat)) continue;

            // 강원권 및 한반도 유효 좌표 필터
            if (lng < 126.5 || lng > 129.6 || lat < 36.8 || lat > 38.8) {
              continue;
            }

            const region = findGangwonRegionByCoords(lng, lat);
            const title = it.title || it.address?.parcel || it.address?.road || q;
            const roadAddr = it.address?.road || it.address?.parcel || '';

            results.push({
              id: `vworld-${it.id || results.length}`,
              title,
              category: it.category ? 'place' : 'address',
              categoryLabel: it.category || 'V-World 공공데이터',
              badge: region?.name || '강원특별자치도',
              address: roadAddr,
              coords: [lng, lat],
              regionId: region?.id,
              regionName: region?.name,
              source: 'vworld_place',
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------------------
  // [5단계: OSM Nominatim Geocoder 최종 보완 (결과가 부족할 때)]
  // ---------------------------------------------------------------------------
  if (results.length < 3) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&countrycodes=kr&limit=5&addressdetails=1`;

      const osmRes = await fetch(osmUrl, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'ko,en', 'User-Agent': 'GeoBrief3D-Gangwon/1.0' },
      });
      clearTimeout(timeoutId);

      if (osmRes.ok) {
        const osmData = await osmRes.json();
        if (Array.isArray(osmData)) {
          for (const item of osmData) {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            if (isNaN(lat) || isNaN(lng)) continue;
            const region = findGangwonRegionByCoords(lng, lat);

            results.push({
              id: `osm-${item.place_id || results.length}`,
              title: item.display_name.split(',')[0] || item.display_name,
              category: 'place',
              categoryLabel: '위치 검색',
              badge: region?.name || '대한민국',
              address: item.display_name,
              coords: [lng, lat],
              regionId: region?.id,
              regionName: region?.name,
              source: 'osm',
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 중복 좌표/명칭 제거 및 상위 12개 정렬 반환
  const seen = new Set<string>();
  const uniqueResults: UnifiedSearchResult[] = [];

  for (const r of results) {
    const key = `${r.title}_${r.coords[0].toFixed(4)}_${r.coords[1].toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(r);
    }
    if (uniqueResults.length >= 12) break;
  }

  return NextResponse.json({
    success: true,
    query: q,
    count: uniqueResults.length,
    results: uniqueResults,
  });
}
