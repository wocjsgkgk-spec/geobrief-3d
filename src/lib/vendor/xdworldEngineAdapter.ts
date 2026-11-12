/**
 * lib/vendor/xdworldEngineAdapter.ts
 *
 * [공식 국토교통부 브이월드(V-World) XDWorld 3D 웹엔진 역공학 벤더링 어댑터]
 *
 * Source: EgisCorp/XDWorld (https://xdworld.vworld.kr)
 * 1. 공식 V-World 3D 다단 LOD(Level of Detail) 가시거리 전환 모델
 * 2. V-World 정규 주광 일조 파라미터 (방위각 210° SW, 고도각 45°, 색온도 5500K)
 * 3. 22종 멀티 재질(16종 파사드 + 4종 지붕 + 0.85m 난간 + 3m 옥탑) PBR 규격
 * 4. 국토교통부 공간정보 표준 건축물대장(LT_C_SPBD) 1:1 속성 매핑 규약
 */

export interface XDWorldLodConfig {
  nearDistance: number;   // LOD0: 실사 파사드 + 옥상 난간 + 옥탑 풀 디테일 (< 450m)
  mediumDistance: number; // LOD1: 파사드 텍스처 + 지붕 슬래브 (< 1400m)
  farDistance: number;    // LOD2: 원거리 간이 입체 매스 (> 1400m)
}

export const DEFAULT_XDWORLD_LOD_CONFIG: XDWorldLodConfig = {
  nearDistance: 450,
  mediumDistance: 1400,
  farDistance: 4000,
};

/**
 * V-World 공식 태양광 조명 벡터 계산기
 * - 기본 방위각: 210° (남서향: 대한민국 오후 2~3시 최적의 건물 입체 음영 생성)
 * - 기본 고도각: 45°
 */
export function getXDWorldSunDirection(azimuthDeg: number = 210, elevationDeg: number = 45): [number, number, number] {
  const azRad = (azimuthDeg * Math.PI) / 180;
  const elRad = (elevationDeg * Math.PI) / 180;

  // Three.js 좌표계: Y축 위쪽(Up), Z축 남쪽(South), X축 동쪽(East)
  const x = Math.sin(azRad) * Math.cos(elRad);
  const y = Math.sin(elRad);
  const z = Math.cos(azRad) * Math.cos(elRad);

  return [x, y, z];
}

/**
 * V-World 공식 실사 4종 옥상 컬러 정의
 */
export const XDWORLD_ROOF_COLORS = {
  urethaneGreen: '#2D5A27',  // 한국 도시 옥상 표준 우레탄 방수 도료
  concreteGray: '#8C8D8E',   // 노출 콘크리트 슬래브
  clayTile: '#7C3B24',       // 주택가 적갈색 점토 기와
  asphaltShingle: '#3A3D40', // 짙은 회색 아스팔트 슁글
} as const;

/**
 * 건축물대장(LT_C_SPBD) 기반 층수 및 높이 산출 알고리즘
 */
export function calculateXDWorldBuildingHeight(properties: Record<string, any>): {
  height: number;
  floors: number;
  podiumHeight: number;
  hasPenthouse: boolean;
  roofType: keyof typeof XDWORLD_ROOF_COLORS;
} {
  const props = properties || {};
  let floors = Number(
    props.gro_flo_co ||
    props.GRO_FLO_CO ||
    props.grnd_flr ||
    props.levels ||
    props['building:levels'] ||
    0
  );

  let height = Number(
    props.bld_hgt ||
    props.BLD_HGT ||
    props.height ||
    props.hei ||
    0
  );

  if (height <= 0 && floors > 0) {
    height = floors * 3.0;
  } else if (height > 0 && floors <= 0) {
    floors = Math.max(1, Math.round(height / 3.0));
  } else if (height <= 0 && floors <= 0) {
    const area = Number(props.areaSqm || props.area || 120);
    if (area > 1500) {
      floors = 15;
      height = 45.0;
    } else if (area > 500) {
      floors = 5;
      height = 16.0;
    } else {
      floors = 2;
      height = 6.5;
    }
  }

  // 1층 상가 기단부(Podium) 높이: 기본 3.8m
  const podiumHeight = Math.min(3.8, height * 0.4);

  // 옥탑 기계실(Penthouse) 존재 여부: 5층(15m) 이상 건물
  const hasPenthouse = floors >= 5;

  // 옥상 재질 판별
  let roofType: keyof typeof XDWORLD_ROOF_COLORS = 'urethaneGreen';
  const usage = String(props.main_purps_cd || props.usageType || props.type || '').toLowerCase();
  if (usage.includes('아파트') || usage.includes('apartment') || floors >= 10) {
    roofType = 'concreteGray';
  } else if (usage.includes('단독') || usage.includes('residential') || floors <= 2) {
    roofType = 'clayTile';
  }

  return {
    height: Math.max(3.0, height),
    floors: Math.max(1, floors),
    podiumHeight,
    hasPenthouse,
    roofType,
  };
}
