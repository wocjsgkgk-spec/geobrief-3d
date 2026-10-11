import { CinematicWaypoint } from '@/types/map';

/**
 * Catmull-Rom 3차 스플라인 1D 보간
 * P(t) = 0.5 * ( (2*P1) + (-P0 + P2)*t + (2*P0 - 5*P1 + 4*P2 - P3)*t^2 + (-P0 + 3*P1 - 3*P2 + P3)*t^3 )
 */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;

  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * 두 각도(degrees) 사이의 최단 회전 차이 (-180 ~ +180)
 */
export function shortestAngleDiff(fromAngle: number, toAngle: number): number {
  const diff = ((toAngle - fromAngle + 540) % 360) - 180;
  return diff;
}

/**
 * 웨이포인트 목록과 진행률(0 ~ 1)을 기반으로 현재 카메라 위치/자세 보간 산출
 */
export function interpolateCinematicCamera(
  waypoints: CinematicWaypoint[],
  progress: number,
  loop: boolean = false
): {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
} {
  if (!waypoints || waypoints.length === 0) {
    return { longitude: 127.925, latitude: 37.342, zoom: 15.5, pitch: 60, bearing: 0 };
  }

  if (waypoints.length === 1) {
    const wp = waypoints[0];
    return {
      longitude: wp.longitude,
      latitude: wp.latitude,
      zoom: wp.zoom,
      pitch: wp.pitch,
      bearing: wp.bearing,
    };
  }

  // 2개 웨이포인트일 경우 선형 보간 (부드러운 ease-in-out)
  if (waypoints.length === 2) {
    const p = Math.max(0, Math.min(1, progress));
    // smoothstep easing
    const t = p * p * (3 - 2 * p);
    const w0 = waypoints[0];
    const w1 = waypoints[1];

    const bearingDiff = shortestAngleDiff(w0.bearing, w1.bearing);
    const bearing = (w0.bearing + bearingDiff * t + 360) % 360;

    return {
      longitude: w0.longitude + (w1.longitude - w0.longitude) * t,
      latitude: w0.latitude + (w1.latitude - w0.latitude) * t,
      zoom: w0.zoom + (w1.zoom - w0.zoom) * t,
      pitch: w0.pitch + (w1.pitch - w0.pitch) * t,
      bearing,
    };
  }

  // 3개 이상 웨이포인트 Catmull-Rom 스플라인 보간
  const clampedProgress = loop ? (progress % 1 + 1) % 1 : Math.max(0, Math.min(1, progress));
  const numSegments = loop ? waypoints.length : waypoints.length - 1;
  const globalT = clampedProgress * numSegments;
  const segmentIdx = Math.min(Math.floor(globalT), numSegments - 1);
  const localT = globalT - segmentIdx;

  let p0: CinematicWaypoint;
  let p1: CinematicWaypoint;
  let p2: CinematicWaypoint;
  let p3: CinematicWaypoint;

  const N = waypoints.length;

  if (loop) {
    p0 = waypoints[(segmentIdx - 1 + N) % N];
    p1 = waypoints[segmentIdx % N];
    p2 = waypoints[(segmentIdx + 1) % N];
    p3 = waypoints[(segmentIdx + 2) % N];
  } else {
    p1 = waypoints[segmentIdx];
    p2 = waypoints[segmentIdx + 1];

    if (segmentIdx === 0) {
      // 가상 제어점 P0 = P1 + (P1 - P2)
      p0 = {
        id: 'virtual-start',
        name: 'virtual',
        longitude: p1.longitude + (p1.longitude - p2.longitude),
        latitude: p1.latitude + (p1.latitude - p2.latitude),
        zoom: Math.max(2, p1.zoom + (p1.zoom - p2.zoom)),
        pitch: Math.max(0, Math.min(85, p1.pitch + (p1.pitch - p2.pitch))),
        bearing: p1.bearing - shortestAngleDiff(p1.bearing, p2.bearing),
      };
    } else {
      p0 = waypoints[segmentIdx - 1];
    }

    if (segmentIdx + 2 < N) {
      p3 = waypoints[segmentIdx + 2];
    } else {
      // 가상 제어점 P3 = P2 + (P2 - P1)
      p3 = {
        id: 'virtual-end',
        name: 'virtual',
        longitude: p2.longitude + (p2.longitude - p1.longitude),
        latitude: p2.latitude + (p2.latitude - p1.latitude),
        zoom: Math.max(2, p2.zoom + (p2.zoom - p1.zoom)),
        pitch: Math.max(0, Math.min(85, p2.pitch + (p2.pitch - p1.pitch))),
        bearing: p2.bearing + shortestAngleDiff(p1.bearing, p2.bearing),
      };
    }
  }

  // Bearing 연속 회전(Unrolled Angle) 계산
  const b1 = p1.bearing;
  const b0 = b1 - shortestAngleDiff(p0.bearing, b1);
  const b2 = b1 + shortestAngleDiff(b1, p2.bearing);
  const b3 = b2 + shortestAngleDiff(p2.bearing, p3.bearing);

  const rawBearing = catmullRom(b0, b1, b2, b3, localT);
  const bearing = (rawBearing % 360 + 360) % 360;

  const longitude = catmullRom(p0.longitude, p1.longitude, p2.longitude, p3.longitude, localT);
  const latitude = catmullRom(p0.latitude, p1.latitude, p2.latitude, p3.latitude, localT);
  const zoom = Math.max(3, Math.min(22, catmullRom(p0.zoom, p1.zoom, p2.zoom, p3.zoom, localT)));
  const pitch = Math.max(0, Math.min(85, catmullRom(p0.pitch, p1.pitch, p2.pitch, p3.pitch, localT)));

  return {
    longitude,
    latitude,
    zoom,
    pitch,
    bearing,
  };
}

/**
 * [프리셋 1] 부지 360° 나선형 하강 조감 (Spiral Recon Flight)
 */
export function generateSpiralPreset(center: [number, number]): CinematicWaypoint[] {
  const [lng, lat] = center;

  return [
    {
      id: 'wp-spiral-1',
      name: 'WP 1: 광역 진입 조감 (원거리 1.8km)',
      longitude: lng + 0.016,
      latitude: lat + 0.012,
      zoom: 14.5,
      pitch: 42,
      bearing: 215,
    },
    {
      id: 'wp-spiral-2',
      name: 'WP 2: 동남측 능선 선회 (중거리 1.1km)',
      longitude: lng + 0.011,
      latitude: lat - 0.008,
      zoom: 15.6,
      pitch: 58,
      bearing: 310,
    },
    {
      id: 'wp-spiral-3',
      name: 'WP 3: 서남측 저고도 접근 (근거리 600m)',
      longitude: lng - 0.006,
      latitude: lat - 0.006,
      zoom: 16.8,
      pitch: 68,
      bearing: 40,
    },
    {
      id: 'wp-spiral-4',
      name: 'WP 4: 북서측 시설물 밀착 (근거리 300m)',
      longitude: lng - 0.004,
      latitude: lat + 0.005,
      zoom: 17.5,
      pitch: 64,
      bearing: 135,
    },
    {
      id: 'wp-spiral-5',
      name: 'WP 5: 부지 중앙 입체 피날레 조감',
      longitude: lng,
      latitude: lat,
      zoom: 16.2,
      pitch: 52,
      bearing: 220,
    },
  ];
}

/**
 * [프리셋 2] 저고도 진입 축선 및 핵심 시설 타깃 비행 (Low Altitude Approach)
 */
export function generateApproachPreset(center: [number, number]): CinematicWaypoint[] {
  const [lng, lat] = center;

  return [
    {
      id: 'wp-app-1',
      name: 'WP 1: 도로 진입축선 원거리 (2.2km 전방)',
      longitude: lng - 0.022,
      latitude: lat - 0.016,
      zoom: 14.0,
      pitch: 38,
      bearing: 52,
    },
    {
      id: 'wp-app-2',
      name: 'WP 2: 검문소 & 경계 울타리 상공 통과',
      longitude: lng - 0.010,
      latitude: lat - 0.007,
      zoom: 15.8,
      pitch: 56,
      bearing: 55,
    },
    {
      id: 'wp-app-3',
      name: 'WP 3: 메인 행정동 및 활주로 활강 통과',
      longitude: lng - 0.002,
      latitude: lat - 0.001,
      zoom: 17.2,
      pitch: 72,
      bearing: 60,
    },
    {
      id: 'wp-app-4',
      name: 'WP 4: 핵심 연구타워 & 헬리패드 회전 조감',
      longitude: lng + 0.004,
      latitude: lat + 0.003,
      zoom: 17.8,
      pitch: 62,
      bearing: 105,
    },
  ];
}
