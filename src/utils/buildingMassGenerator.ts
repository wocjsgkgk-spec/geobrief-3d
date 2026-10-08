import * as turf from '@turf/turf';
import { BuildingMassPreset } from '@/types/map';

/**
 * 부지 폴리곤과 중심점을 기반으로 브이월드 스타일의 정밀 2단 복합 3D 건축 매스
 * (기단부 포디움, 상층 타워, 옥탑 코어, 옥상 헬리패드(H), 태양광 패널 그리드)를 생성합니다.
 */
export function generateDetailedBuildingMass(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  center: [number, number],
  preset: BuildingMassPreset
): GeoJSON.FeatureCollection<GeoJSON.Geometry> {
  const features: GeoJSON.Feature<GeoJSON.Geometry>[] = [];

  const totalHeight = preset.height; // e.g. 20, 15, 12
  const podiumHeight = Math.max(5, Math.round(totalHeight * 0.45)); // e.g. 9m
  const towerHeight = totalHeight; // e.g. 20m
  const penthouseHeight = totalHeight + Math.max(3, Math.round(totalHeight * 0.15)); // e.g. 23m

  // ---------------------------------------------------------------------------
  // 1. [Tier 1: 기단부 포디움 (1~2층 복합 지원 공간)]
  // ---------------------------------------------------------------------------
  const podiumPoly = turf.transformScale(polygon, 0.78);
  features.push({
    type: 'Feature',
    properties: {
      part: 'podium',
      name: `${preset.name} (기단부 포디움 1~2F)`,
      height: podiumHeight,
      min_height: 0,
      color: preset.color,
      edgeColor: preset.edgeColor,
      opacity: 0.72,
    },
    geometry: podiumPoly.geometry,
  });

  // ---------------------------------------------------------------------------
  // 2. [Tier 2: 메인 타워 (주요 업무/연구/군수 지원동)]
  // ---------------------------------------------------------------------------
  const towerPoly = turf.transformScale(polygon, 0.50);
  features.push({
    type: 'Feature',
    properties: {
      part: 'tower',
      name: `${preset.name} (상층 타워동)`,
      height: towerHeight,
      min_height: podiumHeight,
      color: preset.glowColor || '#38BDF8',
      edgeColor: '#FFFFFF',
      opacity: 0.80,
    },
    geometry: towerPoly.geometry,
  });

  // ---------------------------------------------------------------------------
  // 3. [Tier 3: 계단식 옥탑층 / 엘리베이터 코어 / 스카이라운지]
  // ---------------------------------------------------------------------------
  const penthousePoly = turf.transformScale(polygon, 0.22);
  features.push({
    type: 'Feature',
    properties: {
      part: 'penthouse',
      name: `${preset.name} (옥탑 코어)`,
      height: penthouseHeight,
      min_height: towerHeight,
      color: '#E0F2FE',
      edgeColor: '#FFFFFF',
      opacity: 0.88,
    },
    geometry: penthousePoly.geometry,
  });

  // ---------------------------------------------------------------------------
  // 4. [기단부 옥상 테라스: 친환경 태양광 패널 (Solar Array) 투톤 그리드 타일]
  // ---------------------------------------------------------------------------
  // 기단부 옥상 좌우 테라스 영역에 태양광 모듈 타일 어레이 배치
  const ptCenter = turf.point(center);
  const solarOffsets = [
    { bearing: 45, distKm: 0.022 },
    { bearing: 55, distKm: 0.028 },
    { bearing: 135, distKm: 0.022 },
    { bearing: 145, distKm: 0.028 },
    { bearing: 225, distKm: 0.022 },
    { bearing: 235, distKm: 0.028 },
    { bearing: 315, distKm: 0.022 },
    { bearing: 325, distKm: 0.028 },
  ];

  solarOffsets.forEach((pos, idx) => {
    try {
      const tilePt = turf.destination(ptCenter, pos.distKm, pos.bearing, { units: 'kilometers' });
      const tileCoords = tilePt.geometry.coordinates as [number, number];
      // 작은 사각 태양광 모듈 (약 6m x 4m)
      const wKm = 0.003;
      const hKm = 0.002;
      const tilePoly = turf.polygon([
        [
          [tileCoords[0] - wKm, tileCoords[1] - hKm],
          [tileCoords[0] + wKm, tileCoords[1] - hKm],
          [tileCoords[0] + wKm, tileCoords[1] + hKm],
          [tileCoords[0] - wKm, tileCoords[1] + hKm],
          [tileCoords[0] - wKm, tileCoords[1] - hKm],
        ],
      ]);

      features.push({
        type: 'Feature',
        properties: {
          part: 'solar_panel',
          name: '친환경 태양광 모듈 어레이',
          height: podiumHeight + 0.35,
          min_height: podiumHeight,
          color: idx % 2 === 0 ? '#1E293B' : '#0F172A', // 슬레이트 투톤
          edgeColor: '#38BDF8',
          opacity: 0.90,
        },
        geometry: tilePoly.geometry,
      });
    } catch {
      // ignore
    }
  });

  // ---------------------------------------------------------------------------
  // 5. [타워 옥상: 긴급 이착륙 헬리패드 (Helipad 'H' & 원형 패드)]
  // ---------------------------------------------------------------------------
  try {
    // 5-1. 헬리패드 원형 베이스 플레이트 (반경 약 8m)
    const helipadCircle = turf.circle(center, 0.008, { steps: 36, units: 'kilometers' });
    features.push({
      type: 'Feature',
      properties: {
        part: 'helipad_base',
        name: '비상 헬리패드 이착륙 구역',
        height: towerHeight + 0.25,
        min_height: towerHeight,
        color: '#1E293B',
        edgeColor: '#F59E0B',
        opacity: 0.92,
      },
      geometry: helipadCircle.geometry,
    });

    // 5-2. 헬리패드 외곽 옐로우 서클 라인 (반경 약 6.5m)
    const innerRing = turf.polygonToLine(
      turf.circle(center, 0.0065, { steps: 36, units: 'kilometers' })
    );
    if (innerRing.type === 'Feature') {
      features.push({
        type: 'Feature',
        properties: {
          part: 'helipad_ring',
          edgeColor: '#F59E0B',
          lineWidth: 3.0,
          lineOpacity: 0.95,
        },
        geometry: innerRing.geometry,
      });
    }

    // 5-3. 헬리패드 'H' 마킹 라인 (가로 6m, 세로 7m 규격)
    const dLng = 0.000045; // 경도 오프셋 (약 3.5m)
    const dLat = 0.000035; // 위도 오프셋 (약 4m)
    const [cLng, cLat] = center;

    // 좌측 세로선
    features.push({
      type: 'Feature',
      properties: {
        part: 'helipad_h',
        edgeColor: '#FEF08A',
        lineWidth: 3.5,
        lineOpacity: 0.98,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [cLng - dLng, cLat - dLat],
          [cLng - dLng, cLat + dLat],
        ],
      },
    });

    // 우측 세로선
    features.push({
      type: 'Feature',
      properties: {
        part: 'helipad_h',
        edgeColor: '#FEF08A',
        lineWidth: 3.5,
        lineOpacity: 0.98,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [cLng + dLng, cLat - dLat],
          [cLng + dLng, cLat + dLat],
        ],
      },
    });

    // 중앙 가로선
    features.push({
      type: 'Feature',
      properties: {
        part: 'helipad_h',
        edgeColor: '#FEF08A',
        lineWidth: 3.5,
        lineOpacity: 0.98,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [cLng - dLng, cLat],
          [cLng + dLng, cLat],
        ],
      },
    });
  } catch (err) {
    console.error('Failed to generate helipad markings:', err);
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
