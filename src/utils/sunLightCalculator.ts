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
}

/**
 * 부지 좌표와 시간대(09:00 ~ 18:00)를 바탕으로 MapLibre GL 실시간 태양광 조명 파라미터를 계산합니다.
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

  // 시간대별 색상 및 감성 튜닝
  let color = '#FFFFFF';
  let intensity = 0.65;
  let fogColor = '#1e293b';
  let label = `${Math.floor(hour)}:00`;

  if (hour < 10) {
    // 09:00 ~ 10:00: 청명한 아침 햇살 (따뜻한 골드 톤)
    color = '#FED7AA'; // warm amber
    intensity = 0.52;
    fogColor = '#242b35';
    label = `오전 ${Math.floor(hour)}시 (아침 사광)`;
  } else if (hour < 11.5) {
    // 10:00 ~ 11:30: 오전 순광
    color = '#FEF3C7';
    intensity = 0.62;
    fogColor = '#1e293b';
    label = `오전 ${Math.floor(hour)}시 (맑은 일조)`;
  } else if (hour <= 13.5) {
    // 12:00 ~ 13:30: 정오 직사광선 (최대 조도, 백색광)
    color = '#FFFFFF';
    intensity = 0.72;
    fogColor = '#16202e';
    label = `정오 ${Math.floor(hour)}시 (정오 직사광)`;
  } else if (hour < 16) {
    // 14:00 ~ 16:00: 오후 온화한 태양광
    color = '#FEF08A';
    intensity = 0.64;
    fogColor = '#1e293b';
    label = `오후 ${Math.floor(hour)}시 (오후 일조)`;
  } else if (hour < 17.5) {
    // 16:00 ~ 17:30: 늦은 오후 황금빛 햇살 (Golden Hour)
    color = '#FDBA74';
    intensity = 0.54;
    fogColor = '#2d2426';
    label = `오후 ${Math.floor(hour)}시 (골든 아워)`;
  } else {
    // 17:30 ~ 18:00: 석양 노을 (드라마틱한 주황/적갈색 음영)
    color = '#FB923C';
    intensity = 0.46;
    fogColor = '#382225';
    label = `오후 ${Math.floor(hour)}시 (석양 노을)`;
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
  };
}
