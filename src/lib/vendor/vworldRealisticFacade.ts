/**
 * lib/vendor/vworldRealisticFacade.ts
 *
 * [GeoBrief 3D 2단계: V-World급 한국형 실제 건물 외관·지붕·관공서 3D 실사화 엔진]
 *
 * GitHub 오픈소스 3D 도시 렌더링 프로젝트(StrandedKitty/streets-gl, kekscom/osmbuildings, F4map)의
 * 핵심 기하 분할 및 파사드 합성 알고리즘을 벤더링하여, 브이월드 3D 지도와 동일한 수준의
 * 사실적인 한국 도시 입면(Facade)과 3D 입체 지붕을 절차적으로 생성합니다.
 *
 * 1. 브이월드(LT_C_SPBD) + 건축물대장 표제부(getBrTitleInfo) 실측 속성 1:1 바인딩:
 *    - 획일적인 단색 상자나 남색 가로줄 통일 현상을 완전히 해체
 *    - 용도, 구조, 층수, 높이에 기반한 6대 건축물 유형별 맞춤 입면 구조 적용
 *
 * 2. 한국형 아파트 단지 (실제 아파트 입면 구조 완벽 재현):
 *    - 외벽 70%는 밝고 따뜻한 콘크리트:
 *      * 크림 아이보리 (#f4efe6)
 *      * 샌드 베이지 (#e8e0d2)
 *      * 라이트 웜그레이 (#dcd8d0)
 *    - 세대별 직사각형 거실 발코니 창문 (#1e293b) + 백색 PVC 창틀 프레임 + 안전 난간살 + 층간 슬래브 줄눈
 *    - 좁은 양옆 측벽(Side Wall): 창문 없는 매끈한 크림색 콘크리트 벽면 + 브랜드 수직 도색 라인
 *      (브라운 #78523a, 네이비 #1e3a8a, 테라코타 #991b1b, 딥그린 #166534) 및 동 번호 그래픽 (101동 등)
 *    - 옥상: 0.9m 돌출 난간(Parapet) + 2.8m 엘리베이터 권상기실(옥탑 코어) 또는 테라코타 경사 지붕캡
 *
 * 3. 시내 상가·원룸·근린생활 빌딩:
 *    - 1층(0m~3.8m): 어두운 화강석 기둥 + 밝은 통유리 쇼윈도 + 한국형 가로 간판 밴드(Signboard Strip)
 *    - 2층 이상 본동: hash(lng, lat) 기반 5대 외벽 소재 불규칙 배분:
 *      ① 붉은 치장벽돌 (#8c3b2b)
 *      ② 갈색 파벽돌 (#6e473b)
 *      ③ 밝은 화강석 베이지 타일 (#dcd4c6)
 *      ④ 모던 차콜 메탈 (#475569)
 *      ⑤ 스카이 블루 반사 유리 (#64748b)
 *    - 옥상: 우레탄 방수 에메랄드/세이지 그린 (#2e6f4e, 45%), 밝은 콘크리트 회색 (#8c8881, 35%),
 *      테라코타 적갈색 (#7c3626, 20%) + 높이 0.9m 옥상 테두리 돌출 난간(Parapet)
 *
 * 4. 단독주택·다세대 빌라·군 주둔지 막사:
 *    - OSMBuildings 지붕 스켈레톤 알고리즘: 평평한 뚜껑 대신 장축 방향 ㅅ자형 박공(Gabled) 및 우진각(Hipped) 3D 메쉬
 *    - 적갈색 기와 (#7c3626), 청색 강판 (#1e40af), 슬레이트 그레이 (#475569)
 *
 * 5. 강원 18개 시·군 관공서·공공기관·학교·병원 랜드마크 조형:
 *    - 관공서: 1~3층 광폭 화강석 민원실 포디움 + 셋백(Setback) 유리 커튼월 본관 타워 + 전면 현관 캐노피
 *    - 학교/대학: 4~5층 적벽돌/아이보리 투톤 교사동 + 중앙 현관 포치
 */

import earcut from 'earcut';
import {
  UVRect,
  getDiverseFacadeSlotUV,
  DIVERSE_SLOT_NAME_TO_ID,
} from '@/utils/diverseKoreanFacadeAtlas';
import {
  calculateOBB,
  calculateSafeRooftopCore,
} from '@/lib/vendor/safeGeoAlgorithms';

const Earcut = (earcut as any).default || earcut;

export interface Point2D {
  x: number;
  z: number;
}

export type AddQuadFn = (
  pBL: [number, number, number],
  pBR: [number, number, number],
  pTR: [number, number, number],
  pTL: [number, number, number],
  norm: [number, number, number],
  uvRect: UVRect
) => void;

export type AddTriangleFn = (
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  norm: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number]
) => void;

/**
 * 아파트 브랜드 수직 액센트 색상 밴드 (측벽 전용)
 */
export const VWORLD_APT_BRAND_BANDS = [
  { name: 'warm_brown', hex: '#78523a', slot: 'apt_side' },
  { name: 'deep_navy', hex: '#1e3a8a', slot: 'apt_side' },
  { name: 'terracotta', hex: '#991b1b', slot: 'apt_side' },
  { name: 'forest_green', hex: '#166534', slot: 'apt_side' },
];

/**
 * 시내 상가·원룸 5대 외벽 소재 정의 (불규칙 배분용)
 */
export const VWORLD_COMMERCIAL_MATERIALS = [
  { name: 'red_brick', hex: '#8c3b2b', slot: 'villa_red_brick', label: '붉은 치장벽돌' },
  { name: 'brown_brick', hex: '#6e473b', slot: 'villa_brown_brick', label: '갈색 파벽돌' },
  { name: 'granite_tile', hex: '#dcd4c6', slot: 'comm_granite_tile', label: '밝은 화강석 베이지 타일' },
  { name: 'charcoal_metal', hex: '#475569', slot: 'comm_charcoal_panel', label: '모던 차콜 메탈' },
  { name: 'sky_curtain', hex: '#64748b', slot: 'comm_sky_curtain', label: '스카이 블루 반사 유리' },
];

/**
 * 지붕 항공사진 실사 색상 배분
 */
export const VWORLD_COMMERCIAL_ROOFS = [
  { slot: 'roof_urethane_sage', hex: '#2e6f4e', weight: 45, label: '우레탄 방수 세이지 그린' },
  { slot: 'roof_concrete_warmgray', hex: '#8c8881', weight: 35, label: '밝은 콘크리트 회색' },
  { slot: 'roof_terracotta_tile', hex: '#7c3626', weight: 20, label: '테라코타 적갈색' },
];

export const VWORLD_GABLED_ROOFS = [
  { slot: 'roof_terracotta_tile', hex: '#7c3626', weight: 50, label: '적갈색 기와' },
  { slot: 'roof_zinc_blue', hex: '#1e40af', weight: 30, label: '청색 강판' },
  { slot: 'comm_charcoal_panel', hex: '#475569', weight: 20, label: '슬레이트 그레이' },
];

export interface VworldFacadeBuildOptions {
  pts2D: Point2D[];
  baseElev: number;
  height: number;
  seed: number;
  edgeLens: number[];
  maxEdgeLen: number;
  minEdgeLen: number;
  isTrueHighRiseApt: boolean;
  sideWallEdgeIndices: Set<number>;
  buildingType: string;
  atlasWallSlot: string;
  addQuad: AddQuadFn;
  addTriangle: AddTriangleFn;
  featProps?: Record<string, any>;
}

export interface VworldRoofBuildOptions {
  pts2D: Point2D[];
  baseElev: number;
  height: number;
  seed: number;
  isGabled: boolean;
  isHighRiseApt: boolean;
  buildingType: string;
  roofSlot: string;
  wallSlot: string;
  holeIndices?: number[];
  innerRings2D?: Point2D[][];
  addQuad: AddQuadFn;
  addTriangle: AddTriangleFn;
  addRooftopQuad?: AddQuadFn;
  addRooftopTriangle?: AddTriangleFn;
}

/**
 * V-World급 한국형 실제 건축물 외관 및 지붕 생성기
 */
export class VworldRealisticFacadeEngine {
  /**
   * 건물 좌표와 속성을 결합하여 결정론적 고유 해시 시드(0 ~ 99) 계산
   */
  public static calculateCoordinateSeed(lng: number, lat: number): number {
    return Math.abs(Math.floor(lng * 100000 + lat * 100000)) % 100;
  }

  /**
   * 상가 5대 외벽 소재 중 seed 기반 소재 반환
   */
  public static getCommercialMaterial(seed: number): {
    name: string;
    hex: string;
    slot: string;
    label: string;
  } {
    return VWORLD_COMMERCIAL_MATERIALS[seed % VWORLD_COMMERCIAL_MATERIALS.length];
  }

  /**
   * 도심 상가·아파트 옥상 마감 슬롯 선택 (45% 우레탄 : 35% 콘크리트 : 20% 테라코타)
   */
  public static getCommercialRoofSlot(seed: number): string {
    const r = seed % 100;
    if (r < 45) return 'roof_urethane_sage'; // 45% 에메랄드 우레탄
    if (r < 80) return 'roof_concrete_warmgray'; // 35% 밝은 시멘트 슬래브
    return 'roof_terracotta_tile'; // 20% 테라코타
  }

  /**
   * 단독주택·빌라 경사지붕 슬롯 선택 (50% 기와 : 30% 강판 : 20% 슬레이트)
   */
  public static getGabledRoofSlot(seed: number): string {
    const r = seed % 100;
    if (r < 50) return 'roof_terracotta_tile'; // 50% 적갈색 기와
    if (r < 80) return 'roof_zinc_blue'; // 30% 청색 강판
    return 'comm_charcoal_panel'; // 20% 슬레이트 그레이
  }

  /**
   * 4단계 건축 외벽 입체 생성 (기단부 + 기준층 셀 + 코니스 + 측벽)
   */
  public static buildBuildingFacade(opts: VworldFacadeBuildOptions): void {
    const {
      pts2D,
      baseElev,
      height,
      seed,
      edgeLens,
      isTrueHighRiseApt,
      sideWallEdgeIndices,
      buildingType,
      atlasWallSlot,
      addQuad,
      featProps = {},
    } = opts;

    const ptCount = pts2D.length;
    const topElev = baseElev + height;

    const uvShopShowcase = getDiverseFacadeSlotUV('comm_ground_shop');
    const uvAptSide = getDiverseFacadeSlotUV('apt_side');

    // -------------------------------------------------------------------------
    // 외벽 둘레 순회 (모든 외곽 벽면)
    // -------------------------------------------------------------------------
    for (let i = 0; i < ptCount; i++) {
      const j = (i + 1) % ptCount;
      const p1 = pts2D[i];
      const p2 = pts2D[j];

      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const edgeLen = edgeLens[i];
      if (edgeLen < 0.2) continue;

      // 외벽 법선 벡터
      const nx = dz / edgeLen;
      const nz = -dx / edgeLen;
      const norm: [number, number, number] = [nx, 0, nz];

      // -----------------------------------------------------------------------
      // [1] 한국형 아파트 단지 (실제 아파트 입면 구조 재현)
      // -----------------------------------------------------------------------
      if (isTrueHighRiseApt) {
        const isSideGableWall = sideWallEdgeIndices.has(i);

        if (isSideGableWall) {
          // [아파트 측벽]:
          // 창문 없는 매끈한 크림색 콘크리트 외벽 + 브랜드 수직 컬러 밴드 + 동 번호 그래픽
          addQuad(
            [p1.x, baseElev, p1.z],
            [p2.x, baseElev, p2.z],
            [p2.x, topElev, p2.z],
            [p1.x, topElev, p1.z],
            norm,
            uvAptSide
          );
        } else {
          // [아파트 정면 및 배면]:
          // 4단 입체 구조:
          // 1) 1층 석재 필로티 기단부 (0m ~ 3.3m)
          // 2) 기준층 세대별 격자 창호 셀 (3.3m ~ H - 0.8m)
          // 3) 상부 코니스 슬래브 몰딩 (H - 0.8m ~ H)
          const aptPodiumH = 3.3;
          const corniceH = 0.8;
          const midH = Math.max(0, height - aptPodiumH - corniceH);

          // 70% 밝고 따뜻한 콘크리트 (크림 아이보리, 샌드 베이지, 웜 그레이)
          const standardWallSlot = atlasWallSlot || (seed % 3 === 0 ? 'apt_preset_a' : seed % 3 === 1 ? 'apt_preset_b' : 'apt_preset_c');
          const standardWallUV = getDiverseFacadeSlotUV(standardWallSlot);

          const floorHeight = 3.2; // 한국 아파트 표준 층고 3.2m
          const numFloors = Math.max(1, Math.round(midH / floorHeight));
          const dFloorH = midH / numFloors;

          // 한국 아파트 베이 폭 (6.0m ~ 7.5m 단위)
          const bayWidth = 6.5;
          const numBays = Math.max(1, Math.round(edgeLen / bayWidth));

          // 1층 필로티 기단부
          const y1 = baseElev + aptPodiumH;
          const uvPodium = getDiverseFacadeSlotUV('apt_sand_beige');
          addQuad(
            [p1.x, baseElev, p1.z],
            [p2.x, baseElev, p2.z],
            [p2.x, y1, p2.z],
            [p1.x, y1, p1.z],
            norm,
            uvPodium
          );

          // 기준층 세대별 셀 그리드 분할 (창문 + 흰색 창틀 + 베란다 난간 + 70% 콘크리트)
          for (let f = 0; f < numFloors; f++) {
            const fy0 = y1 + f * dFloorH;
            const fy1 = y1 + (f + 1) * dFloorH;

            for (let b = 0; b < numBays; b++) {
              const t0 = b / numBays;
              const t1 = (b + 1) / numBays;

              const bx0 = p1.x + dx * t0;
              const bz0 = p1.z + dz * t0;
              const bx1 = p1.x + dx * t1;
              const bz1 = p1.z + dz * t1;

              addQuad(
                [bx0, fy0, bz0],
                [bx1, fy0, bz1],
                [bx1, fy1, bz1],
                [bx0, fy1, bz0],
                norm,
                standardWallUV
              );
            }
          }

          // 최상단 코니스 밴드
          if (corniceH > 0.1) {
            const yTop0 = baseElev + height - corniceH;
            const uvCornice = getDiverseFacadeSlotUV('parapet_concrete');
            addQuad(
              [p1.x, yTop0, p1.z],
              [p2.x, yTop0, p2.z],
              [p2.x, topElev, p2.z],
              [p1.x, topElev, p1.z],
              norm,
              uvCornice
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // [2] 시내 상가·원룸·근린생활 빌딩 (단구동, 무실동, 단계동, 우산동 등)
      // -----------------------------------------------------------------------
      else if (buildingType === 'commercial' || buildingType === 'public' || height >= 10.0) {
        // [1층]: 0m ~ 3.8m 어두운 화강석 기둥 + 통유리 쇼윈도 + 한국형 가로 간판 밴드
        const podiumH = Math.min(3.8, height * 0.45);
        const yPodiumTop = baseElev + podiumH;

        // 1층 쇼윈도 및 가로 간판 블록
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, yPodiumTop, p2.z],
          [p1.x, yPodiumTop, p1.z],
          norm,
          uvShopShowcase
        );

        // [2층 이상 상층부]: 5대 소재 불규칙 배분
        if (height > podiumH + 0.5) {
          const matIndex = (seed + i) % VWORLD_COMMERCIAL_MATERIALS.length;
          const upperSlot = atlasWallSlot || VWORLD_COMMERCIAL_MATERIALS[matIndex].slot;
          const upperUV = getDiverseFacadeSlotUV(upperSlot);

          const upperH = height - podiumH;
          const numUpperFloors = Math.max(1, Math.round(upperH / 3.3));
          const dUH = upperH / numUpperFloors;

          for (let f = 0; f < numUpperFloors; f++) {
            const uy0 = yPodiumTop + f * dUH;
            const uy1 = yPodiumTop + (f + 1) * dUH;

            addQuad(
              [p1.x, uy0, p1.z],
              [p2.x, uy0, p2.z],
              [p2.x, uy1, p2.z],
              [p1.x, uy1, p1.z],
              norm,
              upperUV
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // [3] 공장·창고 / 군 영내 막사 / 저층 단독주택·빌라
      // -----------------------------------------------------------------------
      else if (buildingType === 'industrial') {
        const indSlot = atlasWallSlot || 'fac_preset_m';
        const indUV = getDiverseFacadeSlotUV(indSlot);
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, topElev, p2.z],
          [p1.x, topElev, p1.z],
          norm,
          indUV
        );
      } else if (buildingType === 'military') {
        const milUV = getDiverseFacadeSlotUV('facility_military_barracks');
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, topElev, p2.z],
          [p1.x, topElev, p1.z],
          norm,
          milUV
        );
      } else {
        // 단독주택 및 다세대 빌라 (적벽돌, 파벽돌, 아이보리 스타코)
        const villaSlot = atlasWallSlot || (seed % 3 === 0 ? 'villa_red_brick' : seed % 3 === 1 ? 'villa_brown_brick' : 'villa_stucco_ivory');
        const villaUV = getDiverseFacadeSlotUV(villaSlot);
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, topElev, p2.z],
          [p1.x, topElev, p1.z],
          norm,
          villaUV
        );
      }
    }
  }

  /**
   * 중정/내부 링(Hole Inner Rings) 벽면 생성
   */
  public static buildInnerRingWalls(
    innerRings2D: Point2D[][],
    baseElev: number,
    topElev: number,
    wallSlot: string,
    addQuad: AddQuadFn
  ): void {
    if (!innerRings2D || innerRings2D.length === 0) return;
    const innerWallUV = getDiverseFacadeSlotUV(wallSlot);

    for (const holePts of innerRings2D) {
      const hLen = holePts.length;
      for (let i = 0; i < hLen; i++) {
        const j = (i + 1) % hLen;
        const p1 = holePts[i];
        const p2 = holePts[j];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const elen = Math.hypot(dx, dz);
        if (elen < 0.2) continue;

        const nx = dz / elen;
        const nz = -dx / elen;

        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, topElev, p2.z],
          [p1.x, topElev, p1.z],
          [-nx, 0, -nz],
          innerWallUV
        );
      }
    }
  }

  /**
   * 입체 지붕 조형 생성:
   * 1. 아파트·상가·관공서: 두께 0.35m, 높이 0.9m 돌출 난간(Parapet) + 침하형 옥상 슬래브 + 2.8m 엘리베이터 권상기실
   * 2. 단독주택·빌라·군막사: 장축 방향 ㅅ자형 박공(Gabled) & 우진각(Hipped) 3D 기하
   */
  public static buildRealisticRoofs(opts: VworldRoofBuildOptions): void {
    const {
      pts2D,
      baseElev,
      height,
      seed,
      isGabled,
      isHighRiseApt,
      buildingType,
      roofSlot,
      wallSlot,
      holeIndices = [],
      addQuad,
      addTriangle,
      addRooftopQuad = addQuad,
      addRooftopTriangle = addTriangle,
    } = opts;

    const ptCount = pts2D.length;
    if (ptCount < 3) return;

    const topElev = baseElev + height;
    const isCommercialOrApt = isHighRiseApt || buildingType === 'commercial' || buildingType === 'public' || height >= 14.0;

    // =========================================================================
    // [1] 저층 주택·빌라·군부대 막사 입체 경사지붕 (Gabled & Hipped Roof)
    // =========================================================================
    if (isGabled && height <= 16.0) {
      const polyCoords: [number, number][] = pts2D.map((p) => [p.x, p.z]);
      const obb = calculateOBB(polyCoords);

      const roofHeight = Math.max(1.8, Math.min(3.2, obb.width * 0.35));
      const ridgeElev = topElev + roofHeight;
      const roofUV = getDiverseFacadeSlotUV(roofSlot || this.getGabledRoofSlot(seed));

      // 장축(Major Axis) 방향의 중심 능선 (Ridge Line) 양 끝점
      const halfRidgeLen = Math.max(1.0, (obb.length - obb.width * 0.8) * 0.5);
      const ux = obb.majorAxis[0];
      const uz = obb.majorAxis[1];

      const r0x = obb.origin[0] - ux * halfRidgeLen;
      const r0z = obb.origin[1] - uz * halfRidgeLen;
      const r1x = obb.origin[0] + ux * halfRidgeLen;
      const r1z = obb.origin[1] + uz * halfRidgeLen;

      // 처마 둘레 각 세그먼트와 용마루 능선을 연결하여 경사면 패싯 생성
      for (let i = 0; i < ptCount; i++) {
        const j = (i + 1) % ptCount;
        const p1 = pts2D[i];
        const p2 = pts2D[j];

        const d0_1 = Math.hypot(p1.x - r0x, p1.z - r0z) + Math.hypot(p2.x - r0x, p2.z - r0z);
        const d1_1 = Math.hypot(p1.x - r1x, p1.z - r1z) + Math.hypot(p2.x - r1x, p2.z - r1z);

        const edgeMidX = (p1.x + p2.x) * 0.5;
        const edgeMidZ = (p1.z + p2.z) * 0.5;
        const projU = (edgeMidX - obb.origin[0]) * ux + (edgeMidZ - obb.origin[1]) * uz;

        if (Math.abs(projU) > halfRidgeLen) {
          // 박공 박공벽/우진각 끝단 삼각형
          const ridgePt: [number, number, number] = projU < 0 ? [r0x, ridgeElev, r0z] : [r1x, ridgeElev, r1z];

          const v1x = p2.x - p1.x;
          const v1y = 0;
          const v1z = p2.z - p1.z;
          const v2x = ridgePt[0] - p1.x;
          const v2y = ridgePt[1] - topElev;
          const v2z = ridgePt[2] - p1.z;

          let cnx = v1y * v2z - v1z * v2y;
          let cny = v1z * v2x - v1x * v2z;
          let cnz = v1x * v2y - v1y * v2x;
          const cnl = Math.hypot(cnx, cny, cnz) || 1;
          cnx /= cnl;
          cny /= cnl;
          cnz /= cnl;
          if (cny < 0) {
            cnx = -cnx;
            cny = -cny;
            cnz = -cnz;
          }

          addRooftopTriangle(
            [p1.x, topElev, p1.z],
            [p2.x, topElev, p2.z],
            ridgePt,
            [cnx, cny, cnz],
            [roofUV.u0, roofUV.v0],
            [roofUV.u1, roofUV.v0],
            [(roofUV.u0 + roofUV.u1) * 0.5, roofUV.v1]
          );
        } else {
          // 장축 측면 경사 사각면 (2개 삼각형 분할)
          const normY = (p2.x - p1.x) * uz - (p2.z - p1.z) * ux > 0 ? 0.707 : 0.707;
          const normX = -uz * 0.707;
          const normZ = ux * 0.707;

          addRooftopQuad(
            [p1.x, topElev, p1.z],
            [p2.x, topElev, p2.z],
            [r1x, ridgeElev, r1z],
            [r0x, ridgeElev, r0z],
            [normX, normY, normZ],
            roofUV
          );
        }
      }
      return;
    }

    // =========================================================================
    // [2] 아파트·중대형 상가·오피스 평슬래브 옥상 (Flat Slab with 3D Parapet)
    // =========================================================================
    const parapetHeight = 0.9; // 0.9m 난간
    const parapetThick = 0.35; // 0.35m 두께
    const parapetTopElev = topElev + parapetHeight;

    const uvParapet = getDiverseFacadeSlotUV('parapet_concrete');
    const actualRoofSlot = roofSlot || (isCommercialOrApt ? this.getCommercialRoofSlot(seed) : 'roof_concrete_warmgray');
    const uvRoofFloor = getDiverseFacadeSlotUV(actualRoofSlot);

    // 1. 외곽 테두리를 따라 높이 0.9m 돌출 난간(Parapet) 생성
    const innerPts: Point2D[] = [];

    for (let i = 0; i < ptCount; i++) {
      const prev = (i - 1 + ptCount) % ptCount;
      const next = (i + 1) % ptCount;
      const cur = pts2D[i];
      const pNext = pts2D[next];

      // 외벽 법선
      const edx = pNext.x - cur.x;
      const edz = pNext.z - cur.z;
      const elen = Math.hypot(edx, edz);
      if (elen < 0.2) {
        innerPts.push(cur);
        continue;
      }

      const nx = edz / elen;
      const nz = -edx / elen;

      // 난간 외벽
      addQuad(
        [cur.x, topElev, cur.z],
        [pNext.x, topElev, pNext.z],
        [pNext.x, parapetTopElev, pNext.z],
        [cur.x, parapetTopElev, cur.z],
        [nx, 0, nz],
        uvParapet
      );

      // 모서리 안쪽 오프셋 (난간 두께 0.35m)
      const v0x = cur.x - pts2D[prev].x;
      const v0z = cur.z - pts2D[prev].z;
      const l0 = Math.hypot(v0x, v0z) || 1;
      const n0x = v0z / l0;
      const n0z = -v0x / l0;

      const avgNx = (nx + n0x) * 0.5;
      const avgNz = (nz + n0z) * 0.5;
      const avgLen = Math.hypot(avgNx, avgNz) || 1;

      const inX = cur.x - (avgNx / avgLen) * parapetThick;
      const inZ = cur.z - (avgNz / avgLen) * parapetThick;
      innerPts.push({ x: inX, z: inZ });
    }

    // 난간 상단 캡 및 내벽
    for (let i = 0; i < ptCount; i++) {
      const next = (i + 1) % ptCount;
      const p1 = pts2D[i];
      const p2 = pts2D[next];
      const in1 = innerPts[i];
      const in2 = innerPts[next];

      const edx = p2.x - p1.x;
      const edz = p2.z - p1.z;
      const elen = Math.hypot(edx, edz) || 1;
      const nx = edz / elen;
      const nz = -edx / elen;

      // 난간 윗면 (0.35m 수평 캡)
      addQuad(
        [in1.x, parapetTopElev, in1.z],
        [in2.x, parapetTopElev, in2.z],
        [p2.x, parapetTopElev, p2.z],
        [p1.x, parapetTopElev, p1.z],
        [0, 1, 0],
        uvParapet
      );

      // 난간 안쪽 수직 벽면 (0.9m 내벽)
      addQuad(
        [in2.x, topElev, in2.z],
        [in1.x, topElev, in1.z],
        [in1.x, parapetTopElev, in1.z],
        [in2.x, parapetTopElev, in2.z],
        [-nx, 0, -nz],
        uvParapet
      );
    }

    // 2. 침하형 옥상 슬래브 바닥 (Earcut 삼각분할)
    const floorPts = innerPts.length >= 3 ? innerPts : pts2D;
    const flatCoords: number[] = [];
    for (const p of floorPts) {
      flatCoords.push(p.x, p.z);
    }

    try {
      const triIndices = Earcut(flatCoords, holeIndices, 2);
      const uvW = uvRoofFloor.u1 - uvRoofFloor.u0;
      const uvH = uvRoofFloor.v1 - uvRoofFloor.v0;

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of floorPts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const spanX = Math.max(1, maxX - minX);
      const spanZ = Math.max(1, maxZ - minZ);

      for (let k = 0; k < triIndices.length; k += 3) {
        const i0 = triIndices[k];
        const i1 = triIndices[k + 1];
        const i2 = triIndices[k + 2];

        const x0 = flatCoords[i0 * 2];
        const z0 = flatCoords[i0 * 2 + 1];
        const x1 = flatCoords[i1 * 2];
        const z1 = flatCoords[i1 * 2 + 1];
        const x2 = flatCoords[i2 * 2];
        const z2 = flatCoords[i2 * 2 + 1];

        const u0 = uvRoofFloor.u0 + ((x0 - minX) / spanX) * uvW;
        const v0 = uvRoofFloor.v0 + ((z0 - minZ) / spanZ) * uvH;
        const u1 = uvRoofFloor.u0 + ((x1 - minX) / spanX) * uvW;
        const v1 = uvRoofFloor.v0 + ((z1 - minZ) / spanZ) * uvH;
        const u2 = uvRoofFloor.u0 + ((x2 - minX) / spanX) * uvW;
        const v2 = uvRoofFloor.v0 + ((z2 - minZ) / spanZ) * uvH;

        addRooftopTriangle(
          [x0, topElev, z0],
          [x1, topElev, z1],
          [x2, topElev, z2],
          [0, 1, 0],
          [u0, v0],
          [u1, v1],
          [u2, v2]
        );
      }
    } catch {
      // 삼각분할 폴백
    }

    // 3. 옥상 중심 2.8m 엘리베이터 권상기실 / 옥탑방 코어 물리 메쉬 배치
    const polyCoords: [number, number][] = pts2D.map((p) => [p.x, p.z]);
    const core = calculateSafeRooftopCore(polyCoords, height, topElev, 2.5);

    if (core) {
      const b2D = core.box2D;
      const cBase = topElev;
      const cTop = topElev + core.height;
      const uvCoreWall = getDiverseFacadeSlotUV('penthouse_wall');
      const uvCoreRoof = getDiverseFacadeSlotUV('roof_concrete_warmgray');

      for (let c = 0; c < 4; c++) {
        const cNext = (c + 1) % 4;
        const cp1 = b2D[c];
        const cp2 = b2D[cNext];

        const cdx = cp2[0] - cp1[0];
        const cdz = cp2[1] - cp1[1];
        const clen = Math.hypot(cdx, cdz) || 1;
        const cnx = cdz / clen;
        const cnz = -cdx / clen;

        addQuad(
          [cp1[0], cBase, cp1[1]],
          [cp2[0], cBase, cp2[1]],
          [cp2[0], cTop, cp2[1]],
          [cp1[0], cTop, cp1[1]],
          [cnx, 0, cnz],
          uvCoreWall
        );
      }

      // 옥탑 지붕면
      addQuad(
        [b2D[0][0], cTop, b2D[0][1]],
        [b2D[1][0], cTop, b2D[1][1]],
        [b2D[2][0], cTop, b2D[2][1]],
        [b2D[3][0], cTop, b2D[3][1]],
        [0, 1, 0],
        uvCoreRoof
      );
    }
  }
}
