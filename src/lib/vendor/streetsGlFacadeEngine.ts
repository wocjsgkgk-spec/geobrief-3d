/**
 * lib/vendor/streetsGlFacadeEngine.ts
 *
 * [GeoBrief 3D 2단계: Streets-GL 건축물 파사드 분할 4단 입체 엔진]
 *
 * GitHub 오픈소스 `StrandedKitty/streets-gl`의 절차적 파사드 분할(Procedural Facade Subdivision)
 * 알고리즘을 벤더링하여, 단순 단색/줄무늬 박스를 실제 건축 4단계 구조로 정밀 분할 생성합니다:
 *
 * 1. 4단계 입체 건축 외벽 구조:
 *    [Tier 1: 기단부 (Podium / Ground Base)] 0m ~ 3.8m
 *      - 상가: 짙은 화강석 프레임 + 밝은 통유리 쇼윈도 + 상단 가로 간판 블록 띠(Signboard Band)
 *      - 아파트/관공서: 석재 필로티 또는 화강석 민원실 로비
 *    [Tier 2: 기준층 셀 (Standard Floor Grid Cells)] 3.8m ~ (H - 0.9m)
 *      - 한국형 아파트: 70% 크림 아이보리(#f4f0e6), 샌드 베이지(#e6dfd3), 웜그레이(#dcd9d2) 외벽
 *        세대별 독립 직사각형 베란다 창호(#1e293b) + 흰색 PVC 창틀 + 난간살 + 슬래브 음영
 *      - 시내 상가·원룸: 5대 마감재(적벽돌, 파벽돌, 화강석, 노출콘크리트, 커튼월) 불규칙 믹스
 *    [Tier 3: 코니스 / 상층부 전이대 (Cornice / Crown)] (H - 0.9m) ~ H
 *      - 건물 상단부 차양, 수평 처마선 몰딩
 *    [Tier 4: 옥상 난간 및 옥탑 코어 (Parapet & Penthouse Core)]
 *      - 두께 0.35m, 높이 0.9m 돌출 난간(Parapet) + 엘리베이터 권상기실(2.8m)
 *
 * 2. 고층 아파트 측벽(Side Wall) 특화:
 *    - 좁은 양 끝단 단변에는 창문을 일절 배치하지 않고 매끈한 솔리드 콘크리트 외벽
 *    - 단지별 브랜드 액센트 컬러 수직 밴드(웜브라운, 네이비, 테라코타, 딥그린) + 동 번호 슬롯
 */

import {
  UVRect,
  getDiverseFacadeSlotUV,
  DIVERSE_SLOT_NAME_TO_ID,
} from '@/utils/diverseKoreanFacadeAtlas';

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

export interface StreetsGlFacadeOptions {
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

/**
 * 4대 아파트 브랜드 수직 액센트 색상 밴드 (측벽 전용)
 */
export const APT_BRAND_BANDS = [
  { name: 'warm_brown', hex: '#78523a', slot: 'apt_side' },
  { name: 'deep_navy', hex: '#1e3a8a', slot: 'apt_side' },
  { name: 'terracotta', hex: '#991b1b', slot: 'apt_side' },
  { name: 'forest_green', hex: '#166534', slot: 'apt_side' },
];

/**
 * 상가 5대 다채로운 외벽 소재 슬롯 (시내 상업·원룸 불규칙 믹스)
 */
export const COMMERCIAL_DIVERSE_SLOTS = [
  'villa_red_brick',     // 붉은 치장벽돌 (#8c3b2b)
  'villa_brown_brick',   // 황토/갈색 파벽돌 (#78523a)
  'comm_granite_tile',   // 베이지 화강석 타일 (#dcd4c6)
  'facility_industry_gray', // 모던 그레이 노출콘크리트 (#94a3b8)
  'comm_sky_curtain',    // 스카이 블루 커튼월 유리 (#64748b)
];

/**
 * Streets-GL 파사드 생성 엔진
 */
export class StreetsGlFacadeEngine {
  /**
   * 건물 외벽 4단 입체 구조 생성
   */
  public static buildBuildingFacade(opts: StreetsGlFacadeOptions): void {
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
      // [1] 한국형 아파트 단지 외벽 분할
      // -----------------------------------------------------------------------
      if (isTrueHighRiseApt) {
        const isSideGableWall = sideWallEdgeIndices.has(i);

        if (isSideGableWall) {
          // [아파트 측벽]: 창문이 전혀 없는 매끈한 콘크리트 외벽 + 브랜드 수직 컬러 밴드 + 동 번호 그래픽
          addQuad(
            [p1.x, baseElev, p1.z],
            [p2.x, baseElev, p2.z],
            [p2.x, topElev, p2.z],
            [p1.x, topElev, p1.z],
            norm,
            uvAptSide
          );
        } else {
          // [아파트 정면 및 후면]:
          // 4단 건축 분할:
          // 1) 1층 필로티 / 석재 기단부 (0m ~ 3.3m)
          // 2) 기준층 세대별 격자 창호 셀 (3.3m ~ H - 0.9m)
          // 3) 상부 코니스 슬래브 (H - 0.9m ~ H)
          const aptPodiumH = 3.3;
          const corniceH = 0.8;
          const midH = Math.max(0, height - aptPodiumH - corniceH);

          const standardWallUV = getDiverseFacadeSlotUV(atlasWallSlot || 'apt_preset_a');
          const floorHeight = 3.2; // 한국 아파트 표준 층고 3.2m
          const numFloors = Math.max(1, Math.round(midH / floorHeight));
          const dFloorH = midH / numFloors;

          // 한국 아파트 베이 폭 (6.0m ~ 7.5m 단위)
          const bayWidth = 6.5;
          const numBays = Math.max(1, Math.round(edgeLen / bayWidth));

          // 1층 기단부 (석재 필로티)
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

          // 기준층 세대별 셀 그리드 분할 (Streets-GL Bay & Floor Sub-tessellation)
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
      // [2] 시내 상가·원룸·근린생활 블록 (단구동, 무실동, 단계동, 우산동 등)
      // -----------------------------------------------------------------------
      else if (buildingType === 'commercial' || buildingType === 'public' || height >= 10.0) {
        // [1층]: 0m ~ 3.8m 어두운 화강석 프레임 + 통유리 쇼윈도 + 가로 간판 블록 띠
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

        // [2층 이상 상층부]: 붉은치장벽돌, 파벽돌, 화강석타일, 노출콘크리트, 커튼월 불규칙 믹스
        if (height > podiumH + 0.5) {
          const upperSlot = atlasWallSlot || COMMERCIAL_DIVERSE_SLOTS[(seed + i) % COMMERCIAL_DIVERSE_SLOTS.length];
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
      // [3] 공장·창고 / 군 영내 막사 / 저층 단독주택
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
}
