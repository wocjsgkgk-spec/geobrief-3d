import * as turf from '@turf/turf';
import { TacticalArrow } from '@/types/map';

export interface TacticalArrowOptions {
  widthMeters?: number; // 몸체 너비 (기본 8m)
  headWidthMeters?: number; // 화살촉 너비 (기본 16m)
  label?: string;
  color?: string;
}

/**
 * 시작점과 끝점을 바탕으로 3D 지형에 밀착되는 볼드한 전술 접근 축선 화살표(Tactical Arrow) 폴리곤을 생성합니다.
 * - 시작 너비 8m -> 화살촉 16m
 * - 3D DEM 지형 표면에 부드럽게 안착되도록 정밀 좌표열 구성
 */
export function generateTacticalArrowPolygon(
  start: [number, number],
  end: [number, number],
  options: TacticalArrowOptions = {}
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const {
    widthMeters = 8,
    headWidthMeters = 16,
    label = '계획 접근축선',
    color = '#06B6D4',
  } = options;

  const p1 = turf.point(start);
  const p2 = turf.point(end);

  const totalDistKm = turf.distance(p1, p2, { units: 'kilometers' });
  const totalDistM = totalDistKm * 1000;

  if (totalDistM < 10) {
    return null;
  }

  const bearing = turf.bearing(p1, p2);

  // 화살촉 길이 (총 거리의 최대 35%, 최소 화살촉 너비의 1.2배)
  const headLengthM = Math.min(headWidthMeters * 1.5, Math.max(12, totalDistM * 0.35));
  const shaftLengthM = Math.max(5, totalDistM - headLengthM);

  const neckPt = turf.destination(p1, shaftLengthM / 1000, bearing, { units: 'kilometers' });

  const halfShaftKm = widthMeters / 2 / 1000;
  const halfHeadKm = headWidthMeters / 2 / 1000;

  const leftAngle = (bearing - 90 + 360) % 360;
  const rightAngle = (bearing + 90) % 360;

  // 화살표 외곽선 구성 7개 꼭짓점
  const startLeft = turf.destination(p1, halfShaftKm, leftAngle, { units: 'kilometers' }).geometry.coordinates;
  const neckLeft = turf.destination(neckPt, halfShaftKm, leftAngle, { units: 'kilometers' }).geometry.coordinates;
  const headLeft = turf.destination(neckPt, halfHeadKm, leftAngle, { units: 'kilometers' }).geometry.coordinates;
  const tip = end;
  const headRight = turf.destination(neckPt, halfHeadKm, rightAngle, { units: 'kilometers' }).geometry.coordinates;
  const neckRight = turf.destination(neckPt, halfShaftKm, rightAngle, { units: 'kilometers' }).geometry.coordinates;
  const startRight = turf.destination(p1, halfShaftKm, rightAngle, { units: 'kilometers' }).geometry.coordinates;

  const coordinates = [
    [
      startLeft,
      neckLeft,
      headLeft,
      tip,
      headRight,
      neckRight,
      startRight,
      startLeft,
    ],
  ];

  return turf.polygon(coordinates, {
    label,
    color,
    widthMeters,
    headWidthMeters,
    distanceMeters: Math.round(totalDistM),
  });
}

/**
 * 여러 전술 화살표 목록을 하나의 FeatureCollection으로 변환합니다.
 */
export function buildTacticalArrowsFeatureCollection(
  arrows: TacticalArrow[]
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (const arrow of arrows) {
    if (arrow.points.length >= 2) {
      const start = arrow.points[0];
      const end = arrow.points[arrow.points.length - 1];
      const poly = generateTacticalArrowPolygon(start, end, {
        widthMeters: arrow.widthMeters,
        headWidthMeters: arrow.headWidthMeters,
        label: arrow.label,
        color: arrow.color,
      });
      if (poly) {
        poly.properties = {
          ...poly.properties,
          id: arrow.id,
        };
        features.push(poly);
      }
    }
  }

  return turf.featureCollection(features);
}
