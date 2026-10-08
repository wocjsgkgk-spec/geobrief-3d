import * as turf from '@turf/turf';
import {
  AccessibilityAnalysisResult,
  AccessibilityRowData,
  InfrastructureCategory,
  InfrastructurePoint,
} from '@/types/infrastructure';
import { KEY_INFRASTRUCTURES } from '@/constants/keyInfrastructures';

// 차량 이동 소요시간 환산 (국도 및 진입로 평균 시속 55km/h 기준)
export function calculateTravelTimeText(distanceKm: number): { minutes: number; text: string } {
  // 최소 1분
  const minutes = Math.max(1, Math.round((distanceKm / 55) * 60));
  if (minutes < 60) {
    return { minutes, text: `약 ${minutes}분` };
  }
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return {
    minutes,
    text: remainMins > 0 ? `약 ${hours}시간 ${remainMins}분` : `약 ${hours}시간`,
  };
}

export function analyzeAccessibility(
  siteCenter: [number, number] | null,
  existingRows?: AccessibilityRowData[]
): AccessibilityAnalysisResult | null {
  if (!siteCenter) return null;

  const categories: {
    category: InfrastructureCategory;
    categoryLabel: string;
    defaultNote: string;
  }[] = [
    { category: 'expressway_ic', categoryLabel: '고속도로 IC', defaultNote: '' },
    { category: 'railway_ktx', categoryLabel: '철도역 / KTX', defaultNote: '' },
    { category: 'national_road', categoryLabel: '주 간선국도', defaultNote: '' },
    { category: 'public_military', categoryLabel: '행정·군 거점', defaultNote: '' },
  ];

  const rows: AccessibilityRowData[] = categories.map((catConfig) => {
    const candidates = KEY_INFRASTRUCTURES.filter((p) => p.category === catConfig.category);

    let nearest: InfrastructurePoint = candidates[0];
    let minDistance = Infinity;

    for (const item of candidates) {
      const dist = turf.distance(siteCenter, item.coords, { units: 'kilometers' });
      if (dist < minDistance) {
        minDistance = dist;
        nearest = item;
      }
    }

    const distKm = Math.round(minDistance * 10) / 10;
    const { minutes, text } = calculateTravelTimeText(distKm);

    // 기존 사용자 수정 메모 보존
    const prevRow = existingRows?.find((r) => r.category === catConfig.category);
    const customNote = prevRow?.customNote || '';

    return {
      id: `row-${catConfig.category}`,
      category: catConfig.category,
      categoryLabel: catConfig.categoryLabel,
      facilityName: nearest.name,
      coords: nearest.coords,
      distanceKm: distKm,
      travelMinutes: minutes,
      travelTimeText: text,
      customNote,
    };
  });

  return {
    siteCenter,
    rows,
    calculatedAt: new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}
