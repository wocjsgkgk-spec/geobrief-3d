import * as SunCalc from 'suncalc';

export interface SunLightConfig {
  hour: number; // 9 ~ 18
  position: [number, number, number]; // [radial, azimuthal, polar]
  color: string;
  intensity: number;
  fogColor: string;
  azimuthDeg: number;
  altitudeDeg: number;
  label: string;

  // [신규] 물리 기반 대기 산란 (Sky Shader & Atmosphere)
  skyAtmosphereColor: string;
  skyHaloColor: string;
  skySunIntensity: number;
  skyHorizonColor: string;

  // [신규] Three.js Directional Light 3D 광원 위치 (X, Y, Z)
  directionalVector: [number, number, number];
}

/**
 * 부지 좌표와 시간대(09:00 ~ 18:00)를 바탕으로 MapLibre GL 실시간 태양광 조명 파라미터와
 * 대기 산란(Sky Shader), Three.js PBR Directional Light 벡터를 계산합니다.
 */
export function calculateSunLight(
  hour: number,
  lat = 37.342, // 기본값: 원주
  lng = 127.925
): SunLightConfig {
  // 오늘 날짜 기준 특정 시간(hour) 생성
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(hour),
    Math.round((hour % 1) * 60)
  );

  const sunPos = SunCalc.getPosition(date, lat, lng);

  // SunCalc: azimuth is in radians, south is 0, west is positive, east is negative.
  // MapLibre: 0 is north, 90 is east, 180 is south, 270 is west.
  let azimuthDeg = (sunPos.azimuth * 180) / Math.PI + 180;
  azimuthDeg = (azimuthDeg + 360) % 360;

  // SunCalc: altitude is in radians above horizon (0 at horizon, PI/2 at zenith).
  const altitudeDeg = Math.max(2, (sunPos.altitude * 180) / Math.PI);

  // MapLibre polar angle: 0 is zenith (directly above), 90 is at horizon.
  const polarDeg = Math.max(5, Math.min(88, 90 - altitudeDeg));

  // Three.js 좌표계 상의 광원 단위 벡터 (Z-Up 기준)
  const azRad = (azimuthDeg * Math.PI) / 180;
  const altRad = (altitudeDeg * Math.PI) / 180;
  // 태양 방향 벡터 (빛이 비춰 들어오는 위치)
  const lightDist = 200;
  const dirX = Math.sin(azRad) * Math.cos(altRad) * lightDist;
  const dirY = -Math.cos(azRad) * Math.cos(altRad) * lightDist;
  const dirZ = Math.sin(altRad) * lightDist;

  // 시간대별 색상 및 대기 산란(Sky Shader) 그라데이션 튜닝
  let color = '#FFFFFF';
  let intensity = 0.65;
  let fogColor = '#1e293b';
  let label = `${Math.floor(hour)}:00`;

  let skyAtmosphereColor = 'rgba(135, 206, 235, 1)'; // 청명한 하늘
  let skyHaloColor = 'rgba(255, 245, 210, 0.9)'; // 백색/골드 헤일로
  let skySunIntensity = 15;
  let skyHorizonColor = '#94a3b8';

  if (hour < 10) {
    // 09:00 ~ 10:00: 청명한 아침 햇살 (따뜻한 골드 톤 & 청아한 아침 하늘)
    color = '#FED7AA'; // warm amber
    intensity = 0.55;
    fogColor = '#242b35';
    label = `오전 ${Math.floor(hour)}시 (아침 사광)`;
    skyAtmosphereColor = 'rgba(176, 212, 245, 1)';
    skyHaloColor = 'rgba(254, 215, 170, 0.95)';
    skySunIntensity = 18;
    skyHorizonColor = '#cbd5e1';
  } else if (hour < 11.5) {
    // 10:00 ~ 11:30: 오전 순광
    color = '#FEF3C7';
    intensity = 0.65;
    fogColor = '#1e293b';
    label = `오전 ${Math.floor(hour)}시 (맑은 일조)`;
    skyAtmosphereColor = 'rgba(147, 197, 253, 1)';
    skyHaloColor = 'rgba(255, 250, 230, 0.9)';
    skySunIntensity = 16;
    skyHorizonColor = '#94a3b8';
  } else if (hour <= 13.5) {
    // 12:00 ~ 13:30: 정오 직사광선 (최대 조도, 백색광, 청명한 딥 블루)
    color = '#FFFFFF';
    intensity = 0.75;
    fogColor = '#16202e';
    label = `정오 ${Math.floor(hour)}시 (정오 직사광)`;
    skyAtmosphereColor = 'rgba(96, 165, 250, 1)';
    skyHaloColor = 'rgba(255, 255, 255, 0.95)';
    skySunIntensity = 14;
    skyHorizonColor = '#64748b';
  } else if (hour < 16) {
    // 14:00 ~ 16:00: 오후 온화한 태양광
    color = '#FEF08A';
    intensity = 0.66;
    fogColor = '#1e293b';
    label = `오후 ${Math.floor(hour)}시 (오후 일조)`;
    skyAtmosphereColor = 'rgba(125, 185, 245, 1)';
    skyHaloColor = 'rgba(254, 240, 138, 0.9)';
    skySunIntensity = 16;
    skyHorizonColor = '#94a3b8';
  } else if (hour < 17.5) {
    // 16:00 ~ 17:30: 늦은 오후 황금빛 햇살 (Golden Hour & 주황빛 산란)
    color = '#FDBA74';
    intensity = 0.58;
    fogColor = '#2d2426';
    label = `오후 ${Math.floor(hour)}시 (골든 아워)`;
    skyAtmosphereColor = 'rgba(249, 168, 117, 1)';
    skyHaloColor = 'rgba(253, 186, 116, 0.95)';
    skySunIntensity = 22;
    skyHorizonColor = '#b45309';
  } else {
    // 17:30 ~ 18:00: 석양 노을 (드라마틱한 주황/선홍색 대기 산란)
    color = '#FB923C';
    intensity = 0.48;
    fogColor = '#382225';
    label = `오후 ${Math.floor(hour)}시 (석양 노을)`;
    skyAtmosphereColor = 'rgba(239, 100, 80, 1)';
    skyHaloColor = 'rgba(251, 146, 60, 0.98)';
    skySunIntensity = 26;
    skyHorizonColor = '#7c2d12';
  }

  return {
    hour,
    position: [1.5, Math.round(azimuthDeg), Math.round(polarDeg)],
    color,
    intensity,
    fogColor,
    azimuthDeg: Math.round(azimuthDeg),
    altitudeDeg: Math.round(altitudeDeg),
    label,
    skyAtmosphereColor,
    skyHaloColor,
    skySunIntensity,
    skyHorizonColor,
    directionalVector: [Math.round(dirX), Math.round(dirY), Math.round(dirZ)],
  };
}
