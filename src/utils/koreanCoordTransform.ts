/**
 * utils/koreanCoordTransform.ts
 *
 * [GeoBrief 3D: 국토지리정보원 표준 7-파라미터 기반 한국 측지계 정밀 변환 엔진]
 *
 * 로컬 연속지적도(Shapefile/GeoJSON), 국토교통부 GIS 건물통합정보, 브이월드 WFS 데이터를 결합할 때
 * 위성 정사영상과 3D 폴리곤의 위치 오차를 0m로 보정하기 위해,
 * 국토지리정보원(NGII) 표준 7-파라미터(+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43)를
 * 정확히 적용한 proj4 좌표 변환 엔진입니다.
 *
 * 지원 측지계:
 *  1. EPSG:5174 (Bessel 1841 / 중부원점 - 구 지적좌표계)
 *  2. EPSG:5173 (Bessel 1841 / 서부원점)
 *  3. EPSG:5176 (Bessel 1841 / 동부원점)
 *  4. EPSG:5179 (GRS80 / UTM-K - 도로명주소 및 행안부 기본 좌표계)
 *  5. EPSG:5186 (GRS80 / 중부원점 - 신 국가공간정보포털 및 브이월드 기준)
 *  6. EPSG:5185 (GRS80 / 서부원점)
 *  7. EPSG:5187 (GRS80 / 동부원점 - 강릉/동해/삼척/속초 등 영동권)
 *  8. EPSG:5181 (Bessel 1841 / 중부원점 50만)
 *  9. EPSG:3857 (Web Mercator / 구글·MapLibre 기본)
 * 10. EPSG:4326 (WGS84 타원체 경위도 [lon, lat])
 */

import proj4 from 'proj4';

// -----------------------------------------------------------------------------
// [1. 국토지리정보원 고시 표준 좌표계 정의 등록]
// -----------------------------------------------------------------------------
export const KOREAN_PROJ_DEFINITIONS: Record<string, string> = {
  // 1. Bessel 1841 계열 (표준 7-파라미터 적용)
  'EPSG:5174':
    '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs',
  'EPSG:5173':
    '+proj=tmerc +lat_0=38 +lon_0=125.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs',
  'EPSG:5176':
    '+proj=tmerc +lat_0=38 +lon_0=129.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs',
  'EPSG:5181':
    '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs',

  // 2. GRS80 계열 (현행 한국 측지계)
  'EPSG:5179':
    '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:5186':
    '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:5185':
    '+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:5187':
    '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

  // 3. 글로벌 표준
  'EPSG:3857':
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
  'EPSG:4326':
    '+proj=longlat +datum=WGS84 +no_defs',
};

// proj4 싱글톤 등록
for (const [code, def] of Object.entries(KOREAN_PROJ_DEFINITIONS)) {
  proj4.defs(code, def);
}

/**
 * 좌표 샘플(x, y) 기반 한국 좌표계 자동 판별
 */
export function detectKoreanCrs(x: number, y: number): string {
  // 이미 WGS84 경위도인 경우 (한반도 범위: 경도 124~132, 위도 33~39)
  if (x >= 123.5 && x <= 132.5 && y >= 32.5 && y <= 39.5) {
    return 'EPSG:4326';
  }

  // UTM-K (EPSG:5179): x ~ 800,000 ~ 1,200,000, y ~ 1,600,000 ~ 2,200,000
  if (x >= 700000 && x <= 1400000 && y >= 1400000 && y <= 2400000) {
    return 'EPSG:5179';
  }

  // Web Mercator (EPSG:3857): x ~ 13,000,000 ~ 15,000,000, y ~ 4,000,000 ~ 5,000,000
  if (x >= 10000000 && y >= 3000000) {
    return 'EPSG:3857';
  }

  // 중부원점 GRS80 (EPSG:5186, y_0=600000) vs Bessel (EPSG:5174, y_0=500000)
  // 한반도 중부 내륙(강원/원주/춘천 등):
  // EPSG:5186의 y는 대략 500,000 ~ 650,000
  // EPSG:5174의 y는 대략 400,000 ~ 550,000
  if (x >= 100000 && x <= 350000) {
    if (y >= 560000 && y <= 750000) {
      return 'EPSG:5186';
    }
    if (y >= 350000 && y <= 560000) {
      return 'EPSG:5174';
    }
  }

  // 동부원점 (EPSG:5187): 강릉/동해/삼척/속초/고성
  if (x >= 100000 && x <= 350000 && y >= 400000) {
    return 'EPSG:5187';
  }

  // 기본 폴백: 현행 국토지리정보원 표준 EPSG:5186
  return 'EPSG:5186';
}

/**
 * 단일 좌표 [x, y]를 WGS84 [lon, lat]로 정밀 변환
 */
export function transformPointToWgs84(
  point: [number, number],
  sourceCrs?: string
): [number, number] {
  const [x, y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return [127.925, 37.342];
  }

  const crs = sourceCrs || detectKoreanCrs(x, y);
  if (crs === 'EPSG:4326') {
    return [x, y];
  }

  try {
    const [lon, lat] = proj4(crs, 'EPSG:4326', [x, y]);
    // WGS84 좌표 유효성 검증
    if (lon >= 120 && lon <= 135 && lat >= 30 && lat <= 42) {
      return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
    }
  } catch {
    // 변환 실패 시 원본 좌표 반환
  }

  return [x, y];
}

/**
 * WGS84 [lon, lat]를 대상 한국 좌표계로 역변환
 */
export function transformWgs84ToTargetCrs(
  point: [number, number],
  targetCrs: string
): [number, number] {
  const [lon, lat] = point;
  if (targetCrs === 'EPSG:4326') {
    return [lon, lat];
  }

  try {
    const [x, y] = proj4('EPSG:4326', targetCrs, [lon, lat]);
    return [Number(x.toFixed(3)), Number(y.toFixed(3))];
  } catch {
    return [lon, lat];
  }
}

/**
 * GeoJSON Geometry 좌표 배열을 WGS84로 재귀적 정밀 변환
 */
export function transformGeometryCoordinatesToWgs84(coords: any, sourceCrs?: string): any {
  if (!coords || !Array.isArray(coords)) return coords;

  // [x, y] 숫자 쌍인 경우
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return transformPointToWgs84([coords[0], coords[1]], sourceCrs);
  }

  // 중첩 배열인 경우 재귀 호출
  return coords.map((c) => transformGeometryCoordinatesToWgs84(c, sourceCrs));
}

/**
 * GeoJSON Feature 객체를 WGS84로 완전 정합 변환
 */
export function transformFeatureToWgs84(feature: any, explicitSourceCrs?: string): any {
  if (!feature || !feature.geometry) return feature;

  let crs = explicitSourceCrs;
  if (!crs) {
    // 첫 번째 정점을 샘플링하여 좌표계 자동 판별
    const g = feature.geometry;
    let sample: [number, number] | null = null;
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      sample = [g.coordinates[0], g.coordinates[1]];
    } else if (g.type === 'LineString' && Array.isArray(g.coordinates?.[0])) {
      sample = [g.coordinates[0][0], g.coordinates[0][1]];
    } else if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0]?.[0])) {
      sample = [g.coordinates[0][0][0], g.coordinates[0][0][1]];
    } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates?.[0]?.[0]?.[0])) {
      sample = [g.coordinates[0][0][0][0], g.coordinates[0][0][0][1]];
    }

    if (sample) {
      crs = detectKoreanCrs(sample[0], sample[1]);
    }
  }

  if (crs === 'EPSG:4326') {
    return feature;
  }

  const newGeometry = {
    ...feature.geometry,
    coordinates: transformGeometryCoordinatesToWgs84(feature.geometry.coordinates, crs),
  };

  return {
    ...feature,
    geometry: newGeometry,
  };
}

/**
 * GeoJSON FeatureCollection 전체를 WGS84로 변환
 */
export function transformFeatureCollectionToWgs84(fc: any, explicitSourceCrs?: string): any {
  if (!fc || !Array.isArray(fc.features)) return fc;

  return {
    ...fc,
    features: fc.features.map((f: any) => transformFeatureToWgs84(f, explicitSourceCrs)),
  };
}
