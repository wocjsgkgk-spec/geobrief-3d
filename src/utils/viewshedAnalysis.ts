import * as turf from '@turf/turf';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { ViewshedResult } from '@/types/map';

export interface ViewshedOptions {
  observerHeightMeters?: number; // 관측소 설치 높이 (기본: 10m)
  targetHeightMeters?: number; // 관측 대상 표적 높이 (기본: 2m)
  radiusMeters?: number; // 가시권 탐색 반경 (기본: 1500m)
  azimuthStepDegrees?: number; // 방위각 샘플링 각도 (기본: 4도 -> 90개 레이)
  distanceStepMeters?: number; // 거리 샘플링 스텝 (기본: 45m)
}

/**
 * 3D DEM 지형 표고를 실시간 샘플링하여 360도 가시권(Viewshed) 및 차폐 사각지대 영역을 계산합니다.
 */
export function calculateViewshed(
  map: MapLibreMap,
  origin: [number, number],
  options: ViewshedOptions = {}
): ViewshedResult | null {
  const {
    observerHeightMeters = 10,
    targetHeightMeters = 2,
    radiusMeters = 1500,
    azimuthStepDegrees = 4,
    distanceStepMeters = 45,
  } = options;

  if (!map || !origin) return null;

  // 1. 관측점 지표면 표고 및 3D 건물 차폐체 조회
  const rawOriginElev = map.queryTerrainElevation ? map.queryTerrainElevation(origin) : 100;
  const originGroundElevation = rawOriginElev !== null && rawOriginElev !== undefined ? rawOriginElev : 100;

  // 1-B. 3D 건물 차폐체(Building Obstacles) 공간 인덱스 추출
  interface BldgObstacle {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
    height: number;
  }
  const obstacles: BldgObstacle[] = [];
  try {
    const bldgLayers = [
      'real-bldg-tier2-mainwall',
      'fusion-bldg-tier2-mainwall',
      'bldg-tier2-mainwall',
      '3d-buildings',
    ].filter((l) => Boolean(map.getLayer(l)));

    if (bldgLayers.length > 0) {
      const rendered = map.queryRenderedFeatures({ layers: bldgLayers });
      for (const b of rendered) {
        if (b.geometry && (b.geometry.type === 'Polygon' || b.geometry.type === 'MultiPolygon')) {
          const bbox = turf.bbox(b);
          const p = (b.properties || {}) as Record<string, any>;
          const h =
            parseFloat(p.height || p.hei || p.HEI) ||
            (parseFloat(p.levels || p.grnd_flr || p.GRND_FLR || 3) * 3.3);
          if (h > 2.5) {
            obstacles.push({
              minLng: bbox[0],
              minLat: bbox[1],
              maxLng: bbox[2],
              maxLat: bbox[3],
              height: h,
            });
          }
        }
      }
    }
  } catch {
    // query fallback
  }

  // 관측점 자체에 건물이 있는지 확인 (예: 아파트 옥상, 고층 빌딩, 군 관측소 클릭 시 자동 고도 반영)
  const originBldg = obstacles.find(
    (b) => origin[0] >= b.minLng && origin[0] <= b.maxLng && origin[1] >= b.minLat && origin[1] <= b.maxLat
  );
  const observerBaseElevation = originGroundElevation + (originBldg ? originBldg.height : 0);
  const observerEyeElevation = observerBaseElevation + observerHeightMeters;

  const visiblePolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const hiddenPolygons: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  const originPoint = turf.point(origin);
  const stepsCount = Math.floor(radiusMeters / distanceStepMeters);

  let visibleCount = 0;
  let totalCells = 0;

  // 2. 360도 방위각 레이 마칭 (Ray Marching) - DEM 지형 + 3D 건물 복합 가시성 연산
  for (let az = 0; az < 360; az += azimuthStepDegrees) {
    const nextAz = az + azimuthStepDegrees;
    let maxSightAngle = -Infinity; // 현재까지의 최대 시선각 (Horizon angle)

    for (let s = 1; s <= stepsCount; s++) {
      const distStart = (s - 1) * distanceStepMeters;
      const distEnd = s * distanceStepMeters;
      const distMid = (distStart + distEnd) / 2;

      // 셀 중심점의 위경도 및 표고 조회
      const midPoint = turf.destination(originPoint, distMid / 1000, az + azimuthStepDegrees / 2, {
        units: 'kilometers',
      });
      const midCoords: [number, number] = [
        midPoint.geometry.coordinates[0],
        midPoint.geometry.coordinates[1],
      ];

      const rawMidElev = map.queryTerrainElevation ? map.queryTerrainElevation(midCoords) : null;
      const targetGroundElev = rawMidElev !== null && rawMidElev !== undefined ? rawMidElev : originGroundElevation;

      // 해당 지점의 3D 건물 유무 및 차폐 높이 판정
      const bldgHit = obstacles.find(
        (b) => midCoords[0] >= b.minLng && midCoords[0] <= b.maxLng && midCoords[1] >= b.minLat && midCoords[1] <= b.maxLat
      );
      const bldgHeight = bldgHit ? bldgHit.height : 0;
      const obstacleTopElev = targetGroundElev + bldgHeight;
      const targetObjectElev = targetGroundElev + targetHeightMeters;

      // 시선 각도 계산 (라디안)
      const deltaElev = targetObjectElev - observerEyeElevation;
      const currentSightAngle = Math.atan2(deltaElev, distMid);

      const isVisible = currentSightAngle >= maxSightAngle;

      if (isVisible) {
        visibleCount++;
      }
      totalCells++;

      // 건물 또는 능선에 의해 다음 원거리 셀이 가려지도록 최대 시선각 갱신
      const obstacleAngle = Math.atan2(obstacleTopElev - observerEyeElevation, distMid);
      maxSightAngle = Math.max(maxSightAngle, obstacleAngle);

      // 부채꼴 섹터 쿼드 폴리곤 셀 좌표 생성
      const p1 = turf.destination(originPoint, distStart / 1000, az, { units: 'kilometers' }).geometry.coordinates;
      const p2 = turf.destination(originPoint, distEnd / 1000, az, { units: 'kilometers' }).geometry.coordinates;
      const p3 = turf.destination(originPoint, distEnd / 1000, nextAz, { units: 'kilometers' }).geometry.coordinates;
      const p4 = turf.destination(originPoint, distStart / 1000, nextAz, { units: 'kilometers' }).geometry.coordinates;

      const cellPolygon = turf.polygon([[p1, p2, p3, p4, p1]], {
        azimuth: az,
        distance: Math.round(distMid),
        elevation: Math.round(targetGroundElev),
        isVisible,
      });

      if (isVisible) {
        visiblePolygons.push(cellPolygon);
      } else {
        hiddenPolygons.push(cellPolygon);
      }
    }
  }

  const coverageRatio = totalCells > 0 ? Math.round((visibleCount / totalCells) * 1000) / 10 : 0;
  const totalAreaSqm = Math.PI * radiusMeters * radiusMeters;
  const visibleAreaSqm = Math.round((totalAreaSqm * coverageRatio) / 100);
  const hiddenAreaSqm = Math.round(totalAreaSqm - visibleAreaSqm);

  return {
    origin,
    elevation: Math.round(originGroundElevation * 10) / 10,
    observerHeight: observerHeightMeters,
    radiusMeters,
    visibleAreaSqm,
    hiddenAreaSqm,
    coverageRatio,
    visibleGeojson: turf.featureCollection(visiblePolygons),
    hiddenGeojson: turf.featureCollection(hiddenPolygons),
    timestamp: Date.now(),
  };
}
