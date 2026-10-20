/**
 * crosswalkGenerator.ts
 *
 * 정밀 도로 노면 표기: 주요 교차로 중심 반경 30m 구간 횡단보도(Crosswalk) 스트라이프 패턴 및 정지선 폴리곤 생성기
 * - MapLibre GL 3D 지형 표면에 완전 밀착(Drape) 렌더링되는 표준 GeoJSON FeatureCollection 생성
 * - 대한민국 도로교통공단 규격 횡단보도 (스트라이프 폭 0.55m, 길이 4.5m, 간격 0.65m)
 * - 교차로 전방 정지선 (Stop Line) 자동 동기화
 */

export interface IntersectionPoint {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  arms?: number[]; // 교차로 진입 도로 각도 (기본: [0, 90, 180, 270])
  isRoundabout?: boolean; // 회전교차로 여부
  roundaboutRadius?: number; // 회전교차로 반경 (m)
}

// 강원특별자치도 및 원주시 주요 교차로 레퍼런스 좌표계 (원주 1군지사 부지 인근 및 핵심 도심망)
export const MAJOR_INTERSECTIONS: IntersectionPoint[] = [
  // 1. 원주 1군지사 부지 주변 핵심 교차로
  { id: '1st-logistics-main-x', name: '1군지사 정문 진입로 교차로', coordinates: [127.9358, 37.3592], arms: [0, 90, 180, 270] },
  { id: '1st-logistics-north-x', name: '우산공단입구사거리', coordinates: [127.9405, 37.3630], arms: [15, 105, 195, 285] },
  { id: 'usan-bridge-x', name: '우산철교사거리', coordinates: [127.9485, 37.3685], arms: [15, 105, 195, 285] },
  { id: 'bukwon-x', name: '북원사거리 (1군지사 북측)', coordinates: [127.9520, 37.3820], arms: [0, 90, 180, 270] },
  { id: 'wonju-ic-x', name: '원주IC 진출입 교차로', coordinates: [127.9540, 37.3870], arms: [0, 90, 180, 270] },
  { id: 'sangji-univ-x', name: '상지대입구사거리', coordinates: [127.9390, 37.3710], arms: [30, 120, 210, 300] },
  { id: 'taejang-x', name: '태장삼거리', coordinates: [127.9580, 37.3740], arms: [45, 165, 285] },
  { id: 'dongbu-transit-x', name: '동부순환로 교차로', coordinates: [127.9650, 37.3790], arms: [10, 100, 190, 280] },

  // 2. 단계동 및 원주 도심 관문 교차로
  { id: 'dangye-x', name: '단계사거리 (버스터미널)', coordinates: [127.9315, 37.3540], arms: [20, 110, 200, 290] },
  { id: 'wonju-stn-x', name: '원주종합운동장삼거리', coordinates: [127.9380, 37.3420], arms: [0, 120, 240] },
  { id: 'cityhall-x', name: '원주시청앞사거리', coordinates: [127.9280, 37.3410], arms: [10, 100, 190, 280] },
  { id: 'musil-x', name: '무실사거리 (남원주IC 관문)', coordinates: [127.9260, 37.3320], arms: [0, 90, 180, 270] },
  { id: 'dangu-x', name: '단구사거리', coordinates: [127.9490, 37.3290], arms: [25, 115, 205, 295] },
  { id: 'jungang-x', name: '중앙로 문화의거리 교차로', coordinates: [127.9450, 37.3480], arms: [0, 90, 180, 270] },

  // 3. 혁신도시 및 주요 회전교차로 (Roundabouts)
  { id: 'hira-x', name: '심평원·건보공단 앞 교차로', coordinates: [127.9740, 37.3240], arms: [15, 105, 195, 285] },
  { id: 'innovation-center-x', name: '혁신대로 중앙사거리', coordinates: [127.9810, 37.3270], arms: [35, 125, 215, 305] },
  { id: 'roundabout-innovation', name: '원주 혁신도시 중앙 회전교차로', coordinates: [127.9780, 37.3250], arms: [0, 90, 180, 270], isRoundabout: true, roundaboutRadius: 18 },
  { id: 'roundabout-enterprise', name: '원주 기업도시 진입 로터리', coordinates: [127.8750, 37.3750], arms: [30, 120, 210, 300], isRoundabout: true, roundaboutRadius: 20 },

  // 4. 강원도청 및 춘천 관문 (중앙로터리)
  { id: 'gangwon-prov-x', name: '강원도청 중앙로터리 앞', coordinates: [127.7298, 37.8853], arms: [0, 90, 180, 270], isRoundabout: true, roundaboutRadius: 22 },
  { id: 'chuncheon-cityhall-x', name: '춘천시청앞 교차로', coordinates: [127.7315, 37.8812], arms: [45, 135, 225, 315] },
];

/**
 * 미터 오프셋(dx, dy)을 WGS84 경위도 오프셋으로 변환
 */
function offsetMetersToLngLat(
  lng: number,
  lat: number,
  dxMeters: number,
  dyMeters: number
): [number, number] {
  const earthRadius = 6378137.0;
  const radLat = (lat * Math.PI) / 180.0;
  const dLat = (dyMeters / earthRadius) * (180.0 / Math.PI);
  const dLng = (dxMeters / (earthRadius * Math.cos(radLat))) * (180.0 / Math.PI);
  return [lng + dLng, lat + dLat];
}

/**
 * 단일 교차로의 횡단보도 스트라이프 폴리곤 및 정지선 GeoJSON 생성
 * - 교차로 중심 반경 15m ~ 22m (반경 30m 이내) 진입부에 설치
 */
function buildCrosswalkForArm(
  centerLng: number,
  centerLat: number,
  armAngleDeg: number
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const armRad = (armAngleDeg * Math.PI) / 180.0;

  // 진입로 주 진행 방향 단위 벡터 (방사 방향)
  const dirX = Math.sin(armRad);
  const dirY = Math.cos(armRad);

  // 진행 방향의 수직 벡터 (횡단보도 횡단 방향)
  const perpX = -dirY;
  const perpY = dirX;

  // 교차로 중심으로부터 횡단보도 중심까지의 거리 (~18.0m, 반경 30m 이내)
  const distFromCenter = 18.0;
  const crossCenterX = dirX * distFromCenter;
  const crossCenterY = dirY * distFromCenter;

  // 횡단보도 규격
  // - 스트라이프 개수: 10개
  // - 스트라이프 폭: 0.55m
  // - 스트라이프 간격: 0.65m (중심 간격 1.20m)
  // - 스트라이프 길이: 4.5m
  const stripeCount = 10;
  const stripeWidth = 0.55;
  const stripeLength = 4.5;
  const stripeSpacing = 1.20;
  const halfSpan = ((stripeCount - 1) * stripeSpacing) / 2.0;

  for (let i = 0; i < stripeCount; i++) {
    const lateralOffset = -halfSpan + i * stripeSpacing;

    // 스트라이프 중심 미터 좌표
    const scX = crossCenterX + perpX * lateralOffset;
    const scY = crossCenterY + perpY * lateralOffset;

    // 스트라이프의 4개 정점 (직사각형)
    const p1 = offsetMetersToLngLat(
      centerLng,
      centerLat,
      scX + dirX * (stripeLength / 2) + perpX * (stripeWidth / 2),
      scY + dirY * (stripeLength / 2) + perpY * (stripeWidth / 2)
    );
    const p2 = offsetMetersToLngLat(
      centerLng,
      centerLat,
      scX + dirX * (stripeLength / 2) - perpX * (stripeWidth / 2),
      scY + dirY * (stripeLength / 2) - perpY * (stripeWidth / 2)
    );
    const p3 = offsetMetersToLngLat(
      centerLng,
      centerLat,
      scX - dirX * (stripeLength / 2) - perpX * (stripeWidth / 2),
      scY - dirY * (stripeLength / 2) - perpY * (stripeWidth / 2)
    );
    const p4 = offsetMetersToLngLat(
      centerLng,
      centerLat,
      scX - dirX * (stripeLength / 2) + perpX * (stripeWidth / 2),
      scY - dirY * (stripeLength / 2) + perpY * (stripeWidth / 2)
    );

    features.push({
      type: 'Feature',
      properties: {
        type: 'crosswalk-stripe',
        armAngle: armAngleDeg,
        stripeIndex: i,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[p1, p2, p3, p4, p1]],
      },
    });
  }

  // 전방 정지선 (Stop Line) 생성 (횡단보도 외곽 3.2m 전방)
  const stopLineDist = distFromCenter + (stripeLength / 2) + 3.2;
  const slCenterX = dirX * stopLineDist;
  const slCenterY = dirY * stopLineDist;
  const slHalfWidth = halfSpan + 1.2; // 횡단보도보다 약간 넓은 폭

  const stopP1 = offsetMetersToLngLat(
    centerLng,
    centerLat,
    slCenterX - perpX * slHalfWidth,
    slCenterY - perpY * slHalfWidth
  );
  const stopP2 = offsetMetersToLngLat(
    centerLng,
    centerLat,
    slCenterX + perpX * slHalfWidth,
    slCenterY + perpY * slHalfWidth
  );

  features.push({
    type: 'Feature',
    properties: {
      type: 'stop-line',
      armAngle: armAngleDeg,
    },
    geometry: {
      type: 'LineString',
      coordinates: [stopP1, stopP2],
    },
  });

  return features;
}

/**
 * [신규] 회전교차로 (Roundabout) 중앙 교통섬 및 회전 차로 지오메트리 생성
 */
function buildRoundaboutFeatures(
  centerLng: number,
  centerLat: number,
  radiusMeters = 16.0
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const segments = 36;
  const islandCoords: [number, number][] = [];
  const circulatingCoords: [number, number][] = [];
  const islandR = radiusMeters * 0.55;
  const circR = radiusMeters * 0.85;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const dx = Math.cos(angle) * islandR;
    const dy = Math.sin(angle) * islandR;
    islandCoords.push(offsetMetersToLngLat(centerLng, centerLat, dx, dy));

    const cx = Math.cos(angle) * circR;
    const cy = Math.sin(angle) * circR;
    circulatingCoords.push(offsetMetersToLngLat(centerLng, centerLat, cx, cy));
  }

  // 1. 중앙 교통섬 (원형 녹지/화단 폴리곤)
  features.push({
    type: 'Feature',
    properties: {
      type: 'roundabout-island',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [islandCoords],
    },
  });

  // 2. 내부 회전차로 백색 분할 점선
  features.push({
    type: 'Feature',
    properties: {
      type: 'roundabout-circulating-lane',
    },
    geometry: {
      type: 'LineString',
      coordinates: circulatingCoords,
    },
  });

  return features;
}

/**
 * 뷰포트 또는 지정 교차로 리스트에 대한 전체 정밀 횡단보도/정지선 FeatureCollection 생성
 */
export function generateCrosswalksGeoJSON(
  intersections: IntersectionPoint[] = MAJOR_INTERSECTIONS,
  customCenter?: [number, number]
): GeoJSON.FeatureCollection {
  const allFeatures: GeoJSON.Feature[] = [];

  const targetList = [...intersections];

  // 만약 사용자 지정 중심점(예: 활성 대상지 부지 중심)이 제공되었고 기존 목록과 800m 이상 떨어져 있다면 추가
  if (customCenter && customCenter[0] && customCenter[1]) {
    const isNearby = targetList.some((pt) => {
      const dLng = pt.coordinates[0] - customCenter[0];
      const dLat = pt.coordinates[1] - customCenter[1];
      return Math.hypot(dLng, dLat) < 0.005;
    });

    if (!isNearby) {
      targetList.push({
        id: 'target-site-main-x',
        name: '대상 부지 주진입 교차로',
        coordinates: customCenter,
        arms: [0, 90, 180, 270],
      });

      // 대상 부지 주변 주요 도심 교차로망 (동·서·남·북 250m~380m) 자동 연동
      const offsets = [
        { id: 'site-north-x', name: '북측 연계 사거리', dx: 0, dy: 300, arms: [0, 90, 180, 270] },
        { id: 'site-south-x', name: '남측 연계 삼거리', dx: 0, dy: -280, arms: [0, 90, 270] },
        { id: 'site-east-x', name: '동측 간선 사거리', dx: 340, dy: 40, arms: [0, 90, 180, 270] },
        { id: 'site-west-x', name: '서측 진입 삼거리', dx: -320, dy: -30, arms: [90, 180, 270] },
      ];

      for (const off of offsets) {
        const coord = offsetMetersToLngLat(customCenter[0], customCenter[1], off.dx, off.dy);
        targetList.push({
          id: off.id,
          name: off.name,
          coordinates: coord,
          arms: off.arms,
        });
      }
    }
  }

  for (const item of targetList) {
    if (item.isRoundabout) {
      const rFeatures = buildRoundaboutFeatures(
        item.coordinates[0],
        item.coordinates[1],
        item.roundaboutRadius || 18.0
      );
      for (let i = 0; i < rFeatures.length; i++) {
        allFeatures.push(rFeatures[i]);
      }
    }

    const arms = item.arms && item.arms.length > 0 ? item.arms : [0, 90, 180, 270];
    for (const arm of arms) {
      const armFeatures = buildCrosswalkForArm(item.coordinates[0], item.coordinates[1], arm);
      for (let i = 0; i < armFeatures.length; i++) {
        allFeatures.push(armFeatures[i]);
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
}
