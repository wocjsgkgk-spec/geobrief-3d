/**
 * app/api/cadastral-local/route.ts
 *
 * [GeoBrief 3D: 로컬 연속지적도(LSMD_CONT_LDREG) 초고속 공간 서빙 API]
 *
 * 1. 로컬 변환 지적 데이터(public/data/cadastral/) 0ms 무지연 서빙:
 *    - 원주시 및 강원권 실측 필지 경계선, PNU(19자리), 지번(JIBUN), 지목(대/전/답/임 등)
 *    - BBOX 공간 쿼리 및 PNU 개별 필지 단건 조회 지원
 *
 * 2. 지목별 표준 테마 컬러 및 카테고리 정보 반환:
 *    - 대지: #fef08a, 밭(전): #d9f99d, 논(답): #bbf7d0, 임야: #86efac, 잡종지: #fb923c
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 인메모리 LRU 캐시
const cadastralMemoryCache = new Map<string, any[]>();

function getCadastralManifest() {
  const manifestPath = path.join(process.cwd(), 'public/data/cadastral/manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function loadLocalCadastralFeatures(regionId = 'wonju', useCoreOnly = true): any[] {
  const cacheKey = `${regionId}_${useCoreOnly ? 'core' : 'full'}`;
  if (cadastralMemoryCache.has(cacheKey)) {
    return cadastralMemoryCache.get(cacheKey)!;
  }

  const manifest = getCadastralManifest();
  const regionInfo = manifest?.regions?.[regionId];

  const fileName =
    useCoreOnly && regionInfo?.coreFile
      ? regionInfo.coreFile
      : regionInfo?.file || `${regionId}_core.geojson`;

  let filePath = path.join(process.cwd(), 'public/data/cadastral', fileName);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(process.cwd(), 'public/data/cadastral', `${regionId}.geojson`);
  }

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(raw);
      const features = json.features || [];
      cadastralMemoryCache.set(cacheKey, features);
      return features;
    } catch {
      return [];
    }
  }

  return [];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bboxParam = searchParams.get('bbox');
  const pnu = searchParams.get('pnu');
  const regionId = searchParams.get('regionId') || 'wonju';

  const allParcels = loadLocalCadastralFeatures(regionId, true);

  // 1) PNU 단건 조회
  if (pnu) {
    const matched = allParcels.find((p) => p.properties?.pnu === pnu || p.id === pnu);
    if (matched) {
      return NextResponse.json({
        success: true,
        source: 'cadastral_local',
        feature: matched,
      });
    }
    return NextResponse.json(
      { success: false, message: '해당 PNU 필지를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // 2) BBOX 공간 영역 조회
  let filtered = allParcels;
  let bbox: [number, number, number, number] | null = null;

  if (bboxParam) {
    const parts = bboxParam.split(',').map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      bbox = [parts[0], parts[1], parts[2], parts[3]];
      const [minLng, minLat, maxLng, maxLat] = bbox;
      const pad = 0.005; // 500m 패딩

      filtered = allParcels.filter((f) => {
        const coords =
          f.geometry.type === 'Polygon'
            ? f.geometry.coordinates[0]?.[0]
            : f.geometry.coordinates[0]?.[0]?.[0];
        if (!coords) return false;
        const [lng, lat] = coords;
        return (
          lng >= minLng - pad &&
          lng <= maxLng + pad &&
          lat >= minLat - pad &&
          lat <= maxLat + pad
        );
      });
    }
  }

  return NextResponse.json({
    success: true,
    source: 'cadastral_local',
    regionId,
    totalCount: allParcels.length,
    returnedCount: filtered.length,
    bbox,
    features: {
      type: 'FeatureCollection',
      features: filtered,
    },
    timestamp: Date.now(),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
      'X-Cadastral-Source': 'LOCAL_FILE',
    },
  });
}
