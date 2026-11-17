// @ts-nocheck
/**
 * Vendored and adapted from gods-eye-view (weatherEffectsMath.js)
 * High-performance meteorological profile calculation & presets for Gangwon 3D GIS Digital Twin
 */

export interface WeatherObservation {
  weatherCode: number;
  cloudCoverPct: number;
  precipitationMm: number;
  windKph: number;
  visibilityM: number;
  windDirectionDeg: number;
  temperatureC?: number;
}

export interface WeatherEffectProfile {
  available: boolean;
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  haze: number;
  droplets: number;
  storm: number;
  wind: number;
  windDirectionDeg: number;
  temperatureC: number;
  label: string;
  summary: string;
}

export type WeatherPresetType = 'clear' | 'overcast' | 'rain' | 'fog' | 'snow';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function range01(value: number, min: number, max: number): number {
  if (!Number.isFinite(Number(value)) || max <= min) return 0;
  return clamp01((Number(value) - min) / (max - min));
}

export const WEATHER_PRESETS: Record<WeatherPresetType, WeatherObservation & { label: string; summary: string }> = {
  clear: {
    weatherCode: 0,
    cloudCoverPct: 10,
    precipitationMm: 0,
    windKph: 12,
    visibilityM: 20000,
    windDirectionDeg: 45,
    temperatureC: 18.5,
    label: '맑음 (쾌청)',
    summary: '시정 20km · 풍속 12km/h (NE) · 운량 10%',
  },
  overcast: {
    weatherCode: 3,
    cloudCoverPct: 88,
    precipitationMm: 0.1,
    windKph: 24,
    visibilityM: 10000,
    windDirectionDeg: 90,
    temperatureC: 14.2,
    label: '운무 (흐림)',
    summary: '운량 88% · 운고 800m · 풍속 24km/h',
  },
  rain: {
    weatherCode: 63,
    cloudCoverPct: 96,
    precipitationMm: 12.5,
    windKph: 38,
    visibilityM: 4200,
    windDirectionDeg: 135,
    temperatureC: 11.0,
    label: '강우 (우천)',
    summary: '강수량 12.5mm/h · 시정 4.2km · 강풍주의보',
  },
  fog: {
    weatherCode: 45,
    cloudCoverPct: 75,
    precipitationMm: 0,
    windKph: 6,
    visibilityM: 650,
    windDirectionDeg: 180,
    temperatureC: 9.8,
    label: '전술 안개 (해무)',
    summary: '저시정 650m · 안개주의보 · 시야 차폐율 85%',
  },
  snow: {
    weatherCode: 73,
    cloudCoverPct: 92,
    precipitationMm: 4.8,
    windKph: 28,
    visibilityM: 2500,
    windDirectionDeg: 315,
    temperatureC: -2.4,
    label: '강설 (적설)',
    summary: '영하 -2.4°C · 적설 강도 보통 · 노면 결빙주의',
  },
};

export function deriveWeatherEffectProfile(weather: WeatherObservation): WeatherEffectProfile {
  if (!weather || !Number.isFinite(Number(weather.weatherCode))) {
    return {
      available: false,
      cloud: 0,
      rain: 0,
      snow: 0,
      fog: 0,
      haze: 0,
      droplets: 0,
      storm: 0,
      wind: 0,
      windDirectionDeg: 0,
      temperatureC: 15,
      label: '관측값 없음',
      summary: '기상 레이더 대기 중',
    };
  }

  const code = Number(weather.weatherCode);
  const cover = range01(weather.cloudCoverPct, 8, 100);
  const precipitation = Math.max(0, Number(weather.precipitationMm) || 0);
  const wind = range01(weather.windKph, 4, 90);
  const visibilityM = Number(weather.visibilityM);
  const visibilityFog = Number.isFinite(visibilityM) ? range01(12000 - visibilityM, 0, 11500) : 0;

  const drizzle = code >= 51 && code <= 57;
  const rainCode = (code >= 61 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const snowCode = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const fogCode = code === 45 || code === 48;
  const stormCode = code >= 95;

  const observedPrecip = range01(precipitation, 0.05, 8);
  const rainFloor = drizzle ? 0.12 : rainCode ? (stormCode ? 0.68 : 0.28) : 0;
  const snowFloor = snowCode ? 0.3 : 0;
  const rain = drizzle || rainCode ? Math.max(rainFloor, observedPrecip) : 0;
  const snow = snowCode ? Math.max(snowFloor, observedPrecip) : 0;
  const fog = Math.max(fogCode ? 0.78 : 0, visibilityFog);
  const storm = stormCode ? Math.max(0.55, observedPrecip) : 0;
  const forcedCloud = stormCode ? 0.92 : rain || snow ? 0.7 : fogCode ? 0.55 : 0;
  const cloud = Math.max(cover, forcedCloud);

  let label = '맑음';
  if (storm) label = '뇌우 / 폭풍';
  else if (snow) label = '강설 (눈)';
  else if (rain) label = '강우 (비)';
  else if (fog > 0.5) label = '안개 / 박무';
  else if (cloud > 0.6) label = '구름많음 / 흐림';

  return {
    available: true,
    cloud: clamp01(cloud),
    rain: clamp01(rain),
    snow: clamp01(snow),
    fog: clamp01(fog),
    haze: clamp01(Math.max(fog * 0.78, cloud * 0.14 + (rain + snow) * 0.2)),
    droplets: clamp01(rain * (0.58 + storm * 0.42)),
    storm: clamp01(storm),
    wind,
    windDirectionDeg: Number.isFinite(Number(weather.windDirectionDeg))
      ? ((Number(weather.windDirectionDeg) % 360) + 360) % 360
      : 0,
    temperatureC: weather.temperatureC ?? 15,
    label,
    summary: `${label} · 풍속 ${weather.windKph}km/h · 시정 ${(weather.visibilityM / 1000).toFixed(1)}km`,
  };
}

export function weatherAltitudeFactors(altitudeM: number) {
  const altitude = Math.max(0, Number(altitudeM) || 0);
  return {
    precipitation: 1 - range01(altitude, 6000, 14000),
    cloud: 1 - range01(altitude, 14000, 24000),
    haze: 1 - range01(altitude, 9000, 20000),
  };
}
