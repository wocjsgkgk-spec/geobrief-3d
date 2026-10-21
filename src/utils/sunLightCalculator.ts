import { calculateSunPosition } from '../lib/vendor/safeGeoAlgorithms';

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
  // 1. 입력 파라미터 무결성 검증 (NaN, undefined, 비정상 타입 방어)
  const safeLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : 37.342;
  const safeLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : 127.925;
  const safeHour =
    typeof hour === 'number' && Number.isFinite(hour)
      ? Math.max(0, Math.min(24, hour))
      : 12;

  // 2. 오늘 날짜 기준 특정 시간(hour) 생성
  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(safeHour),
    Math.round((safeHour % 1) * 60)
  );

  let rawAzimuth = 0;
  let rawAltitude = 0.52; // 기본값 약 30도 (라디안)

  try {
    const sunPos = calculateSunPosition(date, safeLat, safeLng);
    if (sunPos && typeof sunPos.altitude === 'number' && Number.isFinite(sunPos.altitude)) {
      rawAltitude = sunPos.altitude;
    }
    if (sunPos && typeof sunPos.azimuth === 'number' && Number.isFinite(sunPos.azimuth)) {
      rawAzimuth = sunPos.azimuth;
    }
  } catch (err) {
    console.warn('[sunLightCalculator] calculateSunPosition fallback:', err);
  }

  // 3. 고도각(altitude) 연산 및 라디안/도 변환 교정:
  // SunCalc.getPosition()은 라디안 단위 (-PI/2 ~ PI/2)를 반환합니다.
  // 만약 rawAltitude 절댓값이 PI/2(약 1.571)를 초과하거나 이미 degree 단위인 경우 (예: 30.6° 등),
  // 다시 (180 / Math.PI)를 곱하면 1754° 등 기형적 각도가 산출되는 버그를 방지합니다.
  let calculatedAltDeg: number;
  if (Math.abs(rawAltitude) > Math.PI / 2) {
    // 이미 도(Degree) 단위이거나 비정상 스케일인 경우 그대로 채택
    calculatedAltDeg = rawAltitude;
  } else {
    // 정상 라디안 -> 도(Degree) 변환
    calculatedAltDeg = (rawAltitude * 180) / Math.PI;
  }

  if (!Number.isFinite(calculatedAltDeg)) {
    calculatedAltDeg = 45; // 안전 기본값
  }

  // 태양 고도각을 유효 범위(-90° ~ 90°)로 엄격히 제한(Clamping)
  const altitudeDeg = Math.max(-90, Math.min(90, calculatedAltDeg));

  // 4. 방위각(azimuth) 연산:
  // SunCalc: azimuth is in radians, south is 0, west is positive, east is negative.
  // MapLibre: 0 is north, 90 is east, 180 is south, 270 is west.
  let rawAzimuthDeg: number;
  if (Math.abs(rawAzimuth) > 2 * Math.PI) {
    rawAzimuthDeg = rawAzimuth;
  } else {
    rawAzimuthDeg = (rawAzimuth * 180) / Math.PI + 180;
  }

  if (!Number.isFinite(rawAzimuthDeg)) {
    rawAzimuthDeg = 180;
  }
  const azimuthDeg = ((rawAzimuthDeg % 360) + 360) % 360;

  // 5. MapLibre polar angle: 0 is zenith (directly above), 90 is at horizon.
  // 조명 셰이더 NaN 방지를 위해 5° ~ 88° 범위로 안전 제한
  const polarDeg = Math.max(5, Math.min(88, 90 - altitudeDeg));

  // 6. Three.js 좌표계 상의 광원 단위 벡터 (Z-Up 기준)
  const azRad = (azimuthDeg * Math.PI) / 180;
  const safeAltFor3D = Math.max(2, altitudeDeg);
  const altRad = (safeAltFor3D * Math.PI) / 180;
  const lightDist = 200;
  const rawDirX = Math.sin(azRad) * Math.cos(altRad) * lightDist;
  const rawDirY = -Math.cos(azRad) * Math.cos(altRad) * lightDist;
  const rawDirZ = Math.sin(altRad) * lightDist;

  const dirX = Number.isFinite(rawDirX) ? Math.round(rawDirX) : 100;
  const dirY = Number.isFinite(rawDirY) ? Math.round(rawDirY) : -100;
  const dirZ = Number.isFinite(rawDirZ) ? Math.round(rawDirZ) : 150;

  // 시간대별 색상 및 대기 산란(Sky Shader) 그라데이션 튜닝
  let color = '#FFFFFF';
  let intensity = 0.65;
  let fogColor = '#bae6fd';
  let label = `${Math.floor(safeHour)}:00`;

  let skyAtmosphereColor = 'rgba(135, 206, 235, 1)'; // 청명한 하늘
  let skyHaloColor = 'rgba(255, 245, 210, 0.9)'; // 백색/골드 헤일로
  let skySunIntensity = 15;
  let skyHorizonColor = '#94a3b8';

  if (safeHour < 10) {
    // 09:00 ~ 10:00: 청명한 아침 햇살 (따뜻한 골드 톤 & 청아한 아침 하늘)
    color = '#FED7AA'; // warm amber
    intensity = 0.55;
    fogColor = '#e0f2fe';
    label = `오전 ${Math.floor(safeHour)}시 (아침 사광)`;
    skyAtmosphereColor = 'rgba(176, 212, 245, 1)';
    skyHaloColor = 'rgba(254, 215, 170, 0.95)';
    skySunIntensity = 18;
    skyHorizonColor = '#cbd5e1';
  } else if (safeHour < 11.5) {
    // 10:00 ~ 11:30: 오전 순광
    color = '#FEF3C7';
    intensity = 0.65;
    fogColor = '#bae6fd';
    label = `오전 ${Math.floor(safeHour)}시 (맑은 일조)`;
    skyAtmosphereColor = 'rgba(147, 197, 253, 1)';
    skyHaloColor = 'rgba(255, 250, 230, 0.9)';
    skySunIntensity = 16;
    skyHorizonColor = '#94a3b8';
  } else if (safeHour <= 13.5) {
    // 12:00 ~ 13:30: 정오 직사광선 (최대 조도, 백색광, 청명한 딥 블루)
    color = '#FFFFFF';
    intensity = 0.75;
    fogColor = '#93c5fd';
    label = `정오 ${Math.floor(safeHour)}시 (정오 직사광)`;
    skyAtmosphereColor = 'rgba(96, 165, 250, 1)';
    skyHaloColor = 'rgba(255, 255, 255, 0.95)';
    skySunIntensity = 14;
    skyHorizonColor = '#64748b';
  } else if (safeHour < 16) {
    // 14:00 ~ 16:00: 오후 온화하고 또렷한 고대비 태양광
    color = '#FFFFFF';
    intensity = 0.85;
    fogColor = '#bae6fd';
    label = `오후 ${Math.floor(safeHour)}시 (오후 일조)`;
    skyAtmosphereColor = 'rgba(125, 185, 245, 1)';
    skyHaloColor = 'rgba(255, 255, 255, 0.95)';
    skySunIntensity = 16;
    skyHorizonColor = '#94a3b8';
  } else if (safeHour < 17.5) {
    // 16:00 ~ 17:30: 늦은 오후 황금빛 햇살 (Golden Hour & 주황빛 산란)
    color = '#FDBA74';
    intensity = 0.58;
    fogColor = '#fed7aa';
    label = `오후 ${Math.floor(safeHour)}시 (골든 아워)`;
    skyAtmosphereColor = 'rgba(249, 168, 117, 1)';
    skyHaloColor = 'rgba(253, 186, 116, 0.95)';
    skySunIntensity = 22;
    skyHorizonColor = '#b45309';
  } else {
    // 17:30 ~ 18:00: 석양 노을 (드라마틱한 주황/선홍색 대기 산란)
    color = '#FB923C';
    intensity = 0.48;
    fogColor = '#fecdd3';
    label = `오후 ${Math.floor(safeHour)}시 (석양 노을)`;
    skyAtmosphereColor = 'rgba(239, 100, 80, 1)';
    skyHaloColor = 'rgba(251, 146, 60, 0.98)';
    skySunIntensity = 26;
    skyHorizonColor = '#7c2d12';
  }

  const safeIntensity = Number.isFinite(intensity) ? intensity : 0.65;
  const safePosition: [number, number, number] = [
    1.5,
    Math.round(azimuthDeg),
    Math.round(polarDeg),
  ];

  return {
    hour: safeHour,
    position: safePosition,
    color,
    intensity: safeIntensity,
    fogColor,
    azimuthDeg: Math.round(azimuthDeg),
    altitudeDeg: Math.round(altitudeDeg),
    label,
    skyAtmosphereColor,
    skyHaloColor,
    skySunIntensity: Number.isFinite(skySunIntensity) ? skySunIntensity : 15,
    skyHorizonColor,
    directionalVector: [dirX, dirY, dirZ],
  };
}

/**
 * [MapLibre GL 네이티브 조명 안전 제어 함수]
 * position, intensity의 NaN 및 비정상 값을 원천 차단하고 셰이더 블랙 스크린 붕괴를 방지합니다.
 */
export function safeSetLight(
  map: any,
  options: {
    anchor?: 'map' | 'viewport';
    color?: string;
    intensity?: number;
    position?: [number, number, number];
  }
): void {
  if (!map || typeof map.setLight !== 'function') return;

  const color =
    typeof options.color === 'string' && options.color.trim().length > 0
      ? options.color
      : '#ffffff';

  const intensity =
    typeof options.intensity === 'number' && Number.isFinite(options.intensity)
      ? Math.max(0, Math.min(2.0, options.intensity))
      : 0.85;

  let safePosition: [number, number, number] = [1.3, 115, 40];
  const pos = options.position;
  if (
    Array.isArray(pos) &&
    pos.length === 3 &&
    Number.isFinite(pos[0]) &&
    Number.isFinite(pos[1]) &&
    Number.isFinite(pos[2])
  ) {
    safePosition = [
      Math.max(0.1, Math.min(10, pos[0])),
      ((Math.round(pos[1]) % 360) + 360) % 360,
      Math.max(0, Math.min(180, Math.round(pos[2]))),
    ];
  }

  try {
    map.setLight({
      anchor: options.anchor || 'viewport',
      color,
      intensity,
      position: safePosition,
    });
  } catch (err) {
    console.warn('[MapLibre] safeSetLight skipped:', err);
  }
}
