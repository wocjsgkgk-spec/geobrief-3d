/**
 * utils/koreanPoiLayer.ts
 *
 * 브이월드(V-World) 실사 3D 스타일 한국형 POI 라벨 & 노란 핀 시스템
 * - 행정동 명칭(단구동, 우산동, 학성동, 단계동, 태장동 등)
 * - 주요 아파트 단지(현진에버빌, 청솔아파트, 단구한신, 구곡주공 등)
 * - 학교(단관초, 남원주중, 단구초 등), 공원(단관공원), 행정복지센터, 공공기관
 * - 시인성 극대화: 노란 핀(#facc15) 아이콘 + 순백색 텍스트(#ffffff) + 두꺼운 검은색 Halo(#000000, 2.2px)
 */

import maplibregl from 'maplibre-gl';

export const VWORLD_POI_SOURCE_ID = 'vworld-poi-source';
export const VWORLD_POI_LAYER_ID = 'vworld-poi-symbols';
export const VWORLD_PIN_IMAGE_ID = 'vworld-yellow-pin';

export interface VWorldPoiItem {
  id: string;
  name: string;
  category: 'dong' | 'apt' | 'school' | 'park' | 'public';
  coordinates: [number, number]; // [lng, lat]
  elevationOffset?: number; // m
}

// 강원도 원주시 주요 동, 아파트 단지, 학교, 공원, 행정복지센터 프리셋
export const WONJU_CORE_POIS: VWorldPoiItem[] = [
  // 1. 주요 행정동 (Dong)
  { id: 'dong-dangu', name: '단구동', category: 'dong', coordinates: [127.9545, 37.3285], elevationOffset: 45 },
  { id: 'dong-usan', name: '우산동', category: 'dong', coordinates: [127.9355, 37.3650], elevationOffset: 40 },
  { id: 'dong-hakseong', name: '학성동', category: 'dong', coordinates: [127.9470, 37.3570], elevationOffset: 40 },
  { id: 'dong-dangye', name: '단계동', category: 'dong', coordinates: [127.9280, 37.3480], elevationOffset: 45 },
  { id: 'dong-taejang', name: '태장동', category: 'dong', coordinates: [127.9580, 37.3750], elevationOffset: 40 },
  { id: 'dong-ilsan', name: '일산동', category: 'dong', coordinates: [127.9420, 37.3510], elevationOffset: 40 },
  { id: 'dong-myeongnyun', name: '명륜동', category: 'dong', coordinates: [127.9480, 37.3400], elevationOffset: 40 },
  { id: 'dong-gaeun', name: '개운동', category: 'dong', coordinates: [127.9570, 37.3380], elevationOffset: 40 },
  { id: 'dong-musil', name: '무실동', category: 'dong', coordinates: [127.9250, 37.3350], elevationOffset: 45 },
  { id: 'dong-bangok', name: '반곡동', category: 'dong', coordinates: [127.9800, 37.3250], elevationOffset: 45 },

  // 2. 단구동/단관공원 및 원주 주요 아파트 단지 (V-World 사진 속 랜드마크)
  { id: 'apt-hyunjin', name: '현진에버빌', category: 'apt', coordinates: [127.9555, 37.3275], elevationOffset: 65 },
  { id: 'apt-cheongsol', name: '청솔아파트', category: 'apt', coordinates: [127.9585, 37.3250], elevationOffset: 60 },
  { id: 'apt-hanshin', name: '단구한신휴플러스', category: 'apt', coordinates: [127.9520, 37.3300], elevationOffset: 65 },
  { id: 'apt-gugok', name: '구곡주공아파트', category: 'apt', coordinates: [127.9570, 37.3220], elevationOffset: 55 },
  { id: 'apt-segyeong', name: '세경아파트', category: 'apt', coordinates: [127.9490, 37.3330], elevationOffset: 50 },
  { id: 'apt-dongbo', name: '동보렉스', category: 'apt', coordinates: [127.9535, 37.3245], elevationOffset: 55 },
  { id: 'apt-heights', name: '중앙하이츠', category: 'apt', coordinates: [127.9505, 37.3265], elevationOffset: 55 },
  { id: 'apt-epyeonhan', name: '대림e편한세상', category: 'apt', coordinates: [127.9475, 37.3325], elevationOffset: 60 },
  { id: 'apt-ipark', name: '단구아이파크', category: 'apt', coordinates: [127.9515, 37.3355], elevationOffset: 65 },
  { id: 'apt-samho', name: '삼호아파트', category: 'apt', coordinates: [127.9360, 37.3620], elevationOffset: 55 },
  { id: 'apt-usan-hyundai', name: '우산현대아파트', category: 'apt', coordinates: [127.9320, 37.3660], elevationOffset: 55 },

  // 3. 학교 (School)
  { id: 'sch-dangwan-el', name: '단관초등학교', category: 'school', coordinates: [127.9560, 37.3240], elevationOffset: 25 },
  { id: 'sch-dangu-el', name: '단구초등학교', category: 'school', coordinates: [127.9500, 37.3310], elevationOffset: 25 },
  { id: 'sch-namwonju-mid', name: '남원주중학교', category: 'school', coordinates: [127.9530, 37.3210], elevationOffset: 25 },
  { id: 'sch-sangji-univ', name: '상지대학교', category: 'school', coordinates: [127.9290, 37.3710], elevationOffset: 35 },
  { id: 'sch-wonju-high', name: '원주고등학교', category: 'school', coordinates: [127.9460, 37.3350], elevationOffset: 25 },

  // 4. 공원 & 행정복지센터 & 주요 관공서 (Park & Public)
  { id: 'park-dangwan', name: '단관공원', category: 'park', coordinates: [127.9575, 37.3270], elevationOffset: 15 },
  { id: 'pub-dangu-center', name: '단구동행정복지센터', category: 'public', coordinates: [127.9530, 37.3315], elevationOffset: 25 },
  { id: 'pub-usan-center', name: '우산동행정복지센터', category: 'public', coordinates: [127.9365, 37.3625], elevationOffset: 25 },
  { id: 'pub-wonju-cityhall', name: '원주시청', category: 'public', coordinates: [127.9280, 37.3430], elevationOffset: 35 },
  { id: 'pub-wonju-medical', name: '원주의료원', category: 'public', coordinates: [127.9450, 37.3380], elevationOffset: 30 },
];

/**
 * 2. 선명한 브이월드 스타일 노란 핀(Yellow Pin) 캔버스 이미지 등록
 */
export function ensureVworldPoiPin(map: maplibregl.Map): void {
  if (!map || typeof document === 'undefined') return;
  if (map.hasImage(VWORLD_PIN_IMAGE_ID)) return;

  try {
    const w = 36;
    const h = 44;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = 16;
    const r = 13;

    // 하단 드롭 섀도우
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    // 노란 핀 외곽 실루엣 (원형 헤드 + 뾰족한 하단 팁)
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.lineTo(cx + 4, cy + r - 2);
    ctx.lineTo(cx, h - 3); // 핀 바닥 팁
    ctx.lineTo(cx - 4, cy + r - 2);
    ctx.closePath();

    // 핀 바디: 브이월드 특유의 선명한 골드 옐로우 그라디언트 (#facc15 -> #eab308)
    const pinGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    pinGrad.addColorStop(0, '#fef08a');
    pinGrad.addColorStop(0.35, '#facc15');
    pinGrad.addColorStop(1, '#ca8a04');
    ctx.fillStyle = pinGrad;
    ctx.fill();

    // 진한 차콜 외곽선 (선명한 테두리)
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();

    // 핀 중앙 화이트 포인트 도트
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // 상단 림 하이라이트 글레어
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.stroke();

    const imgData = ctx.getImageData(0, 0, w, h);
    map.addImage(VWORLD_PIN_IMAGE_ID, imgData);
  } catch (err) {
    console.warn('[koreanPoiLayer] Failed to register pin image:', err);
  }
}

/**
 * 3. POI GeoJSON FeatureCollection 빌더
 */
export function buildPoiFeatureCollection(
  customPois: VWorldPoiItem[] = [],
  dynamicBuildings: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = []
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const seenNames = new Set<string>();

  // 1) 고정 프리셋 POI 주입
  const allCore = [...WONJU_CORE_POIS, ...customPois];
  for (const item of allCore) {
    if (seenNames.has(item.name)) continue;
    seenNames.add(item.name);

    features.push({
      type: 'Feature',
      id: item.id,
      properties: {
        id: item.id,
        name: item.name,
        category: item.category,
        elevationOffset: item.elevationOffset || 40,
      },
      geometry: {
        type: 'Point',
        coordinates: item.coordinates,
      },
    });
  }

  // 2) 뷰포트 내 명칭 있는 실제 건물(아파트, 학교 등) 동적 추출
  if (dynamicBuildings && dynamicBuildings.length > 0) {
    for (let i = 0; i < dynamicBuildings.length; i++) {
      const feat = dynamicBuildings[i];
      const props = feat.properties || {};
      const name = String(props.name || props.name_ko || props.buld_nm || props.buildingName || '').trim();
      if (!name || name.length < 2 || seenNames.has(name)) continue;

      const isApt = name.includes('아파트') || name.includes('apt') || name.includes('단지') ||
                    name.includes('에버빌') || name.includes('청솔') || name.includes('주공') ||
                    name.includes('휴플러스') || name.includes('아이파크') || name.includes('푸르지오');
      const isSchool = name.includes('초등') || name.includes('중학') || name.includes('고등') || name.includes('대학') || name.includes('학교');
      const isPublic = name.includes('센터') || name.includes('시청') || name.includes('병원') || name.includes('공원');

      if (!isApt && !isSchool && !isPublic) continue;

      // 중심점 계산
      let centerLng = 0, centerLat = 0, ptCount = 0;
      const geom = feat.geometry;
      if (geom.type === 'Polygon' && geom.coordinates[0]) {
        for (const pt of geom.coordinates[0]) {
          centerLng += pt[0];
          centerLat += pt[1];
          ptCount++;
        }
      } else if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]) {
        for (const pt of geom.coordinates[0][0]) {
          centerLng += pt[0];
          centerLat += pt[1];
          ptCount++;
        }
      }

      if (ptCount === 0) continue;
      centerLng /= ptCount;
      centerLat /= ptCount;

      seenNames.add(name);
      features.push({
        type: 'Feature',
        id: `dyn-poi-${i}`,
        properties: {
          id: `dyn-poi-${i}`,
          name,
          category: isApt ? 'apt' : isSchool ? 'school' : isPublic ? 'public' : 'dong',
          elevationOffset: isApt ? 55 : 30,
        },
        geometry: {
          type: 'Point',
          coordinates: [centerLng, centerLat],
        },
      });

      if (features.length >= 80) break; // 최대 80개로 시인성 유지
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * 4. MapLibre 실사 V-World 심볼 레이어 생성 및 등록
 */
export function setupVworldPoiLayer(
  map: maplibregl.Map,
  initialPois: VWorldPoiItem[] = []
): void {
  if (!map) return;

  ensureVworldPoiPin(map);

  const initialGeoJson = buildPoiFeatureCollection(initialPois);

  // 1) 소스 등록
  if (!map.getSource(VWORLD_POI_SOURCE_ID)) {
    map.addSource(VWORLD_POI_SOURCE_ID, {
      type: 'geojson',
      data: initialGeoJson,
    });
  } else {
    const src = map.getSource(VWORLD_POI_SOURCE_ID) as maplibregl.GeoJSONSource;
    src.setData(initialGeoJson);
  }

  // 2) 심볼 레이어 등록 (노란 핀 + 한글 명칭 라벨)
  if (!map.getLayer(VWORLD_POI_LAYER_ID)) {
    map.addLayer({
      id: VWORLD_POI_LAYER_ID,
      type: 'symbol',
      source: VWORLD_POI_SOURCE_ID,
      minzoom: 12.0,
      maxzoom: 24,
      layout: {
        'icon-image': VWORLD_PIN_IMAGE_ID,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12.0, 0.60,
          14.5, 0.75,
          16.5, 0.90,
          18.0, 1.0,
        ],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'icon-padding': 4,

        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold', 'Open Sans Bold'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12.0, 11,
          14.5, 12.5,
          16.5, 13.5,
          18.0, 14.5,
        ],
        'text-offset': [0, 0.35],
        'text-anchor': 'top',
        'text-max-width': 10,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 3,
        'symbol-spacing': 120,
        visibility: 'visible',
      },
      paint: {
        'text-color': '#ffffff',           // 순백색 고시인성 한글 텍스트
        'text-halo-color': '#000000',      // 선명한 검은색 외곽선 Halo
        'text-halo-width': 2.2,            // 2.2px 두께로 가독성 보장
        'text-halo-blur': 0.5,
        'text-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12.0, 0.0,
          12.8, 0.85,
          14.0, 1.0,
        ],
        'icon-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12.0, 0.0,
          12.8, 0.90,
          14.0, 1.0,
        ],
      },
    });
  }
}

/**
 * 5. 동적 뷰포트 건물 기반 POI 실시간 갱신 함수
 */
export function updateVworldPoisWithBuildings(
  map: maplibregl.Map,
  buildings: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = []
): void {
  if (!map) return;
  const src = map.getSource(VWORLD_POI_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  const updatedGeoJson = buildPoiFeatureCollection([], buildings);
  src.setData(updatedGeoJson);
}
