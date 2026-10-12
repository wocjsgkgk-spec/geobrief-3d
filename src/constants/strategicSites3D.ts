/**
 * strategicSites3D.ts
 *
 * 강원권 주요 핵심 군 유휴지 3D 거점 모델 배치 및 지형 밀착(Terrain Clamping) 매핑 규격
 * - 원주 캠프 롱 반환부지: R&D 연구동 및 복합 지원단지 모델 자동 로드
 * - 춘천 102보충대 유휴지: 표준 행정동 및 다목적 물류/문화시설 모델 자동 로드
 * - 철원 접경지 거점: 전방 지휘소 및 감시 타워 모델 자동 로드
 */

import { PlacedFacility3D } from '@/types/map';

export interface StrategicFacilityTemplate {
  presetId: 'defense_rd_tower' | 'barracks_hq' | 'logistics_depot' | 'watch_tower' | 'helipad_base';
  name: string;
  lngOffsetMeters: number; // 부지 중심 기준 동서 오프셋 (m)
  latOffsetMeters: number; // 부지 중심 기준 남북 오프셋 (m)
  rotationY: number; // Y축 방위각 회전 (도)
  scale: number; // 크기 배율
  heightMeters: number; // 실측 건축 높이 (m)
  customGltfUrl?: string;
}

export interface StrategicSite3DConfig {
  siteId: string;
  name: string;
  region: string;
  district: string;
  center: [number, number]; // [lng, lat]
  recommendedCamera: {
    zoom: number;
    pitch: number;
    bearing: number;
  };
  description: string;
  facilities: StrategicFacilityTemplate[];
}

/**
 * 미터 오프셋을 경위도 좌표로 변환하는 지오메트리 헬퍼
 */
function offsetToLngLat(
  center: [number, number],
  dxMeters: number,
  dyMeters: number
): [number, number] {
  const cosLat = Math.cos((center[1] * Math.PI) / 180);
  const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
  const metersPerLat = (Math.PI / 180) * 6378137;

  const lng = center[0] + dxMeters / metersPerLng;
  const lat = center[1] + dyMeters / metersPerLat;
  return [Number(lng.toFixed(7)), Number(lat.toFixed(7))];
}

/**
 * 강원권 3대 핵심 군 유휴지 3D 건축물 자동 배치 카탈로그
 */
export const STRATEGIC_SITES_3D: Record<string, StrategicSite3DConfig> = {
  // 1. 원주 캠프 롱 반환부지 (첨단의료 R&D 및 에코아트 혁신거점)
  'camp-long-wonju': {
    siteId: 'camp-long-wonju',
    name: '원주 캠프 롱 반환부지',
    region: '원주시',
    district: '강원특별자치도 원주시 태장동',
    center: [127.9545, 37.3778],
    recommendedCamera: {
      zoom: 15.6,
      pitch: 58,
      bearing: 32,
    },
    description: 'R&D 첨단연구동, 복합 문화지원단지, 옥외 헬리패드가 결합된 미래 첨단의료 클러스터 배치안',
    facilities: [
      {
        presetId: 'defense_rd_tower',
        name: '미래의료 국방 R&D 연구동',
        lngOffsetMeters: 0,
        latOffsetMeters: 0,
        rotationY: 28,
        scale: 1.15,
        heightMeters: 36,
      },
      {
        presetId: 'barracks_hq',
        name: '민·군 복합 행정지원센터',
        lngOffsetMeters: 95,
        latOffsetMeters: -55,
        rotationY: 25,
        scale: 1.0,
        heightMeters: 10.5,
      },
      {
        presetId: 'logistics_depot',
        name: '첨단 스마트 물류·보급 센터',
        lngOffsetMeters: -110,
        latOffsetMeters: 65,
        rotationY: 28,
        scale: 1.0,
        heightMeters: 14,
      },
      {
        presetId: 'helipad_base',
        name: '긴급 항공후송(닥터헬기) 착륙장',
        lngOffsetMeters: 115,
        latOffsetMeters: 75,
        rotationY: 0,
        scale: 1.0,
        heightMeters: 1.2,
      },
    ],
  },

  // 2. 춘천 102보충대 유휴지 (보훈·웰니스 및 K-바이오 푸드 클러스터)
  'ch-102-chuncheon': {
    siteId: 'ch-102-chuncheon',
    name: '춘천 102보충대 유휴부지',
    region: '춘천시',
    district: '강원특별자치도 춘천시 신북읍 율문리',
    center: [127.7584, 37.9255],
    recommendedCamera: {
      zoom: 15.8,
      pitch: 54,
      bearing: 20,
    },
    description: '대대급 표준 행정동, 다목적 물류/문화시설, 경계 감시 타워가 배치된 평화 힐링 거점',
    facilities: [
      {
        presetId: 'barracks_hq',
        name: '제102 표준 행정·보훈 역사관',
        lngOffsetMeters: 0,
        latOffsetMeters: 0,
        rotationY: 35,
        scale: 1.05,
        heightMeters: 10,
      },
      {
        presetId: 'logistics_depot',
        name: '다목적 스마트 물류·문화 전시관',
        lngOffsetMeters: 105,
        latOffsetMeters: -45,
        rotationY: 35,
        scale: 1.0,
        heightMeters: 13,
      },
      {
        presetId: 'defense_rd_tower',
        name: 'K-바이오 스마트 실증 연구동',
        lngOffsetMeters: -90,
        latOffsetMeters: 55,
        rotationY: 35,
        scale: 0.95,
        heightMeters: 28,
      },
      {
        presetId: 'watch_tower',
        name: '평화전망 관측 타워',
        lngOffsetMeters: -135,
        latOffsetMeters: 110,
        rotationY: 15,
        scale: 1.1,
        heightMeters: 16,
      },
    ],
  },

  // 3. 철원 접경지 거점 (구 보병연대 - 전방 작전지휘 및 민군안보 클러스터)
  'cheorwon-infantry': {
    siteId: 'cheorwon-infantry',
    name: '철원 구 보병연대 주둔지',
    region: '철원군',
    district: '강원특별자치도 철원군 갈말읍 지경리',
    center: [127.3225, 38.1632],
    recommendedCamera: {
      zoom: 15.5,
      pitch: 59,
      bearing: 45,
    },
    description: '전방 지휘소 본관, 16m 경계 철골 감시탑, 전략 비축 데포 및 긴급 헬리패드 작전배치안',
    facilities: [
      {
        presetId: 'barracks_hq',
        name: '전방 통합 지휘소 본관',
        lngOffsetMeters: 0,
        latOffsetMeters: 0,
        rotationY: 50,
        scale: 1.1,
        heightMeters: 10.5,
      },
      {
        presetId: 'watch_tower',
        name: 'DMZ 전방 경계·감시 철골 타워',
        lngOffsetMeters: 105,
        latOffsetMeters: 80,
        rotationY: 45,
        scale: 1.15,
        heightMeters: 16.5,
      },
      {
        presetId: 'logistics_depot',
        name: '전방 군수 물자 비축 데포',
        lngOffsetMeters: -115,
        latOffsetMeters: -60,
        rotationY: 50,
        scale: 1.0,
        heightMeters: 13,
      },
      {
        presetId: 'helipad_base',
        name: '전술 헬기 비상 이착륙장',
        lngOffsetMeters: 120,
        latOffsetMeters: -50,
        rotationY: 0,
        scale: 1.0,
        heightMeters: 1.2,
      },
    ],
  },

  // 4. 원주 1군지사 이전부지 (스마트 미래 도심 3D 복합단지 거점)
  'first-logistics-wonju': {
    siteId: 'first-logistics-wonju',
    name: '원주 1군지사 이전부지',
    region: '원주시',
    district: '강원특별자치도 원주시 우산동·학성동',
    center: [127.9358, 37.3592],
    recommendedCamera: {
      zoom: 15.5,
      pitch: 58,
      bearing: 338,
    },
    description: '첨단 국방·모빌리티 R&D 타워, 스마트 지식산업센터, 복합 문화컨벤션이 집약된 스마트 미래 도심 복합단지',
    facilities: [],
  },
};

/**
 * 특정 부지 ID에 매핑된 기본 3D 시설물 목록 생성 헬퍼
 */
export function generateStrategicFacilities(
  siteId: string,
  baseElevation = 100
): PlacedFacility3D[] {
  const config = STRATEGIC_SITES_3D[siteId];
  if (!config) return [];

  const timestamp = Date.now();
  return config.facilities.map((f, idx) => {
    const coords = offsetToLngLat(config.center, f.lngOffsetMeters, f.latOffsetMeters);
    return {
      id: `strategic-${siteId}-${f.presetId}-${idx}`,
      presetId: f.presetId,
      name: f.name,
      coords,
      elevation: baseElevation,
      rotationY: f.rotationY,
      scale: f.scale,
      heightMeters: f.heightMeters,
      customGltfUrl: f.customGltfUrl,
      createdAt: timestamp + idx,
    };
  });
}
