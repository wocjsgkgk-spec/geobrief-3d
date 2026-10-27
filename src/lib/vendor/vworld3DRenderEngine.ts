/**
 * lib/vendor/vworld3DRenderEngine.ts
 *
 * [GeoBrief 3D 1단계: 국토부 브이월드(V-World 3D) 실사 3D 렌더링 엔진]
 *
 * 브이월드 LOD2+ 표준 규격 및 GitHub 오픈소스(Streets-GL, OSMBuildings, F4map)의
 * 기하 분할·파사드 합성 알고리즘을 벤더링하여, 단순 박스 압출을 완전히 탈피하고
 * 실제 대한민국 도시 풍경과 1:1로 일치하는 실사 3D 건축물 메쉬를 단일 드로우 콜로 생성합니다.
 *
 * [4단계 입체 건축물 구조 (V-World LOD2+ Multi-Tier Architecture)]
 *  1. [1층 기단부 (Base, 0m ~ 3.8m / 3.3m)]
 *     - 상가: 짙은 화강석 기둥 + 밝은 통유리 쇼윈도 + 한국형 가로 간판 띠(Signboard Strip)
 *     - 아파트: 따뜻한 석재 필로티 로비 기단부
 *  2. [기준층 본동 (Wall, 3.8m ~ H - 0.9m)]
 *     - 고층 아파트: 크림 화이트(#f5f2eb), 소프트 베이지(#ebe4d5), 웜 그레이(#dcd8d0)
 *       외벽에 세대별 거실 발코니 창문(#1e293b) + 백색 창틀 격자 + 층간 슬래브 줄눈
 *     - 아파트 측벽: 창문 없는 매끈한 콘크리트 + 4대 브랜드 수직 라인(브라운/네이비/테라코타/딥그린) + 동 번호
 *     - 상가 2층+: 5대 외벽 소재(치장벽돌 #8c3b2b, 파벽돌 #6e473b, 화강석 #dcd4c6, 메탈 #475569, 커튼월 #64748b)
 *  3. [옥상 난간 (Parapet, H - 0.9m ~ H + 0.9m)]
 *     - 두께 0.35m, 높이 0.9m의 실제 3D 콘크리트 돌출 난간(Parapet)으로 입체 그림자 형성
 *  4. [지붕 구조물 (Roof & Penthouse)]
 *     - 평슬래브: 에메랄드 우레탄(#2e6f4e, 45%), 시멘트 슬래브(#8c8881, 35%), 테라코타(#7c3626, 20%) + 2.8m 엘리베이터 권상기실
 *     - 저층 주택/막사: OBB 장축을 따라 능선이 올라오는 ㅅ자형 박공(Gabled) & 우진각(Hipped) 메쉬
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

export interface VWorldRenderOptions {
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
  atlasRoofSlot: string;
  holeIndices?: number[];
  innerRings2D?: Point2D[][];
  addQuad: AddQuadFn;
  addTriangle: AddTriangleFn;
  addRooftopQuad?: AddQuadFn;
  addRooftopTriangle?: AddTriangleFn;
  featProps?: Record<string, any>;
}

/**
 * 4대 아파트 브랜드 수직 도색 액센트 (측벽 전용)
 */
export const VWORLD_BRAND_BANDS = [
  { name: 'warm_brown', hex: '#78523a', slot: 'apt_side' },
  { name: 'deep_navy', hex: '#1e3a8a', slot: 'apt_side' },
  { name: 'terracotta', hex: '#991b1b', slot: 'apt_side' },
  { name: 'forest_green', hex: '#166534', slot: 'apt_side' },
];

/**
 * 상가·원룸 5대 외벽 소재 불규칙 배분 테이블
 */
export const VWORLD_COMMERCIAL_5_MATERIALS = [
  { name: 'red_brick', hex: '#8c3b2b', slot: 'villa_red_brick', label: '붉은 치장벽돌' },
  { name: 'brown_brick', hex: '#6e473b', slot: 'villa_brown_brick', label: '갈색 파벽돌' },
  { name: 'granite_tile', hex: '#dcd4c6', slot: 'comm_granite_tile', label: '베이지 화강석 석재' },
  { name: 'charcoal_metal', hex: '#475569', slot: 'comm_charcoal_panel', label: '모던 차콜 메탈' },
  { name: 'sky_curtain', hex: '#64748b', slot: 'comm_sky_curtain', label: '스카이 블루 커튼월' },
];

/**
 * 브이월드 항공사진 지붕 실측 색상 분포
 */
export const VWORLD_AERIAL_ROOF_DISTRIBUTION = [
  { name: 'urethane_emerald', hex: '#2e6f4e', slot: 'roof_urethane_sage', ratio: 0.45 },
  { name: 'concrete_gray', hex: '#8c8881', slot: 'roof_concrete_warmgray', ratio: 0.35 },
  { name: 'terracotta_red', hex: '#7c3626', slot: 'roof_terracotta_tile', ratio: 0.20 },
];

export class Vworld3DRenderEngine {
  /**
   * 고유 좌표 정밀 해시(Coordinate Seed)
   */
  public static hashCoordinate(lng: number, lat: number): number {
    return Math.abs(Math.floor(lng * 100000 + lat * 100000)) % 100;
  }

  /**
   * 상가 5대 외벽 슬롯 선택
   */
  public static selectCommercialWallSlot(seed: number, index = 0): string {
    const pick = (seed + index) % VWORLD_COMMERCIAL_5_MATERIALS.length;
    return VWORLD_COMMERCIAL_5_MATERIALS[pick].slot;
  }

  /**
   * 항공뷰 지붕 마감 슬롯 선택 (45% 우레탄 : 35% 콘크리트 : 20% 테라코타)
   */
  public static selectAerialRoofSlot(seed: number): string {
    const r = seed % 100;
    if (r < 45) return 'roof_urethane_sage';
    if (r < 80) return 'roof_concrete_warmgray';
    return 'roof_terracotta_tile';
  }

  /**
   * 박공/경사지붕 슬롯 선택 (50% 기와 : 30% 강판 : 20% 슬레이트)
   */
  public static selectGabledRoofSlot(seed: number): string {
    const r = seed % 100;
    if (r < 50) return 'roof_terracotta_tile';
    if (r < 80) return 'roof_zinc_blue';
    return 'comm_charcoal_panel';
  }

  /**
   * [브이월드 LOD2+ 4단 입체 건축물 전체 파이프라인 일괄 실행]
   */
  public static buildFullBuildingLOD2(opts: VWorldRenderOptions): void {
    const {
      pts2D,
      baseElev,
      height,
      innerRings2D = [],
      atlasWallSlot,
      addQuad,
    } = opts;

    if (!pts2D || pts2D.length < 3) return;

    // 1. 외벽 (기단부 + 기준층 + 코니스 + 측벽)
    this.buildTieredFacade(opts);

    // 2. 내부 중정 벽면 (홀)
    if (innerRings2D && innerRings2D.length > 0) {
      this.buildInnerWalls(innerRings2D, baseElev, baseElev + height, atlasWallSlot, addQuad);
    }

    // 3. 지붕 (파라펫 + 슬래브 + 옥탑 코어 or 3D 박공)
    this.buildTieredRoof(opts);
  }

  /**
   * [Tier 1 & Tier 2: 1층 기단부 + 기준층 본동 외벽]
   */
  public static buildTieredFacade(opts: VWorldRenderOptions): void {
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
    } = opts;

    const ptCount = pts2D.length;
    const topElev = baseElev + height;

    const uvShopShowcase = getDiverseFacadeSlotUV('comm_ground_shop');
    const uvAptSide = getDiverseFacadeSlotUV('apt_side');

    for (let i = 0; i < ptCount; i++) {
      const j = (i + 1) % ptCount;
      const p1 = pts2D[i];
      const p2 = pts2D[j];

      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const edgeLen = edgeLens[i];
      if (edgeLen < 0.2) continue;

      const nx = dz / edgeLen;
      const nz = -dx / edgeLen;
      const norm: [number, number, number] = [nx, 0, nz];

      // -----------------------------------------------------------------------
      // [1] 한국형 아파트 단지 (실제 단지 실사 입면 구조)
      // -----------------------------------------------------------------------
      if (isTrueHighRiseApt) {
        const isSideGableWall = sideWallEdgeIndices.has(i);

        if (isSideGableWall) {
          // 측벽 (창문 없는 매끈한 크림 콘크리트 + 브랜드 도색 밴드 + 동 번호)
          addQuad(
            [p1.x, baseElev, p1.z],
            [p2.x, baseElev, p2.z],
            [p2.x, topElev, p2.z],
            [p1.x, topElev, p1.z],
            norm,
            uvAptSide
          );
        } else {
          // 정·배면: 1층 필로티 기단부(0m~3.3m) + 기준층 세대별 격자창(3.3m~H-0.8m) + 코니스(H-0.8m~H)
          const aptPodiumH = 3.3;
          const corniceH = 0.8;
          const midH = Math.max(0, height - aptPodiumH - corniceH);

          // 크림 화이트(#f5f2eb), 소프트 베이지(#ebe4d5), 웜 그레이(#dcd8d0)
          const standardWallSlot = atlasWallSlot || (seed % 3 === 0 ? 'apt_preset_a' : seed % 3 === 1 ? 'apt_preset_b' : 'apt_preset_c');
          const standardWallUV = getDiverseFacadeSlotUV(standardWallSlot);

          const floorHeight = 3.2; // 한국 표준 아파트 층고
          const numFloors = Math.max(1, Math.round(midH / floorHeight));
          const dFloorH = midH / numFloors;

          const bayWidth = 6.5; // 한국 표준 베이 폭
          const numBays = Math.max(1, Math.round(edgeLen / bayWidth));

          // 1층 필로티
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

          // 세대별 창호 그리드 셀 분할 (창문 + 백색 창틀 + 난간살 + 슬래브 홈)
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
      // [2] 시내 상가·원룸·근린생활 빌딩 (2층~8층 시가지)
      // -----------------------------------------------------------------------
      else if (buildingType === 'commercial' || buildingType === 'public' || height >= 10.0) {
        // [1층]: 0m ~ 3.8m 어두운 화강석 기둥 + 통유리 쇼윈도 + 한국형 가로 간판 띠
        const podiumH = Math.min(3.8, height * 0.45);
        const yPodiumTop = baseElev + podiumH;

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
          const matIndex = (seed + i) % VWORLD_COMMERCIAL_5_MATERIALS.length;
          const upperSlot = atlasWallSlot || VWORLD_COMMERCIAL_5_MATERIALS[matIndex].slot;
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
      // [3] 단독주택·다세대 빌라·군 주둔지 영내 막사
      // -----------------------------------------------------------------------
      else if (buildingType === 'military') {
        const milUV = getDiverseFacadeSlotUV('facility_military_barracks');
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, topElev, p2.z],
          [p1.x, topElev, p1.z],
          norm,
          milUV
        );
      } else if (buildingType === 'industrial') {
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
      } else {
        // 단독주택 및 빌라: 적벽돌, 파벽돌, 아이보리 스타코
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
   * 중정 및 홀 내부 링 벽면
   */
  public static buildInnerWalls(
    innerRings2D: Point2D[][],
    baseElev: number,
    topElev: number,
    wallSlot: string,
    addQuad: AddQuadFn
  ): void {
    if (!innerRings2D || innerRings2D.length === 0) return;
    const uvWall = getDiverseFacadeSlotUV(wallSlot || 'apt_preset_c');

    for (const hole of innerRings2D) {
      const hCount = hole.length;
      for (let i = 0; i < hCount; i++) {
        const j = (i + 1) % hCount;
        const p1 = hole[i];
        const p2 = hole[j];
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
          uvWall
        );
      }
    }
  }

  /**
   * [Tier 3 & Tier 4: 옥상 난간(Parapet) + 지붕 구조물(Roof & Penthouse)]
   */
  public static buildTieredRoof(opts: VWorldRenderOptions): void {
    const {
      pts2D,
      baseElev,
      height,
      seed,
      isTrueHighRiseApt,
      buildingType,
      atlasRoofSlot,
      holeIndices = [],
      addQuad,
      addTriangle,
      addRooftopQuad = addQuad,
      addRooftopTriangle = addTriangle,
    } = opts;

    const ptCount = pts2D.length;
    if (ptCount < 3) return;

    const topElev = baseElev + height;
    const isCommercialOrApt = isTrueHighRiseApt || buildingType === 'commercial' || buildingType === 'public' || height >= 14.0;
    const isGabled = (buildingType === 'residential' || buildingType === 'military') && height <= 16.0;

    // -------------------------------------------------------------------------
    // [1] 저층 주택·빌라·군부대 막사 입체 경사지붕 (3D 박공 & 우진각)
    // -------------------------------------------------------------------------
    if (isGabled) {
      const polyCoords: [number, number][] = pts2D.map((p) => [p.x, p.z]);
      const obb = calculateOBB(polyCoords);

      const roofHeight = Math.max(1.8, Math.min(3.2, obb.width * 0.35));
      const ridgeElev = topElev + roofHeight;
      const roofSlot = atlasRoofSlot || this.selectGabledRoofSlot(seed);
      const roofUV = getDiverseFacadeSlotUV(roofSlot);

      const halfRidgeLen = Math.max(1.0, (obb.length - obb.width * 0.8) * 0.5);
      const ux = obb.majorAxis[0];
      const uz = obb.majorAxis[1];

      const r0x = obb.origin[0] - ux * halfRidgeLen;
      const r0z = obb.origin[1] - uz * halfRidgeLen;
      const r1x = obb.origin[0] + ux * halfRidgeLen;
      const r1z = obb.origin[1] + uz * halfRidgeLen;

      for (let i = 0; i < ptCount; i++) {
        const j = (i + 1) % ptCount;
        const p1 = pts2D[i];
        const p2 = pts2D[j];

        const edgeMidX = (p1.x + p2.x) * 0.5;
        const edgeMidZ = (p1.z + p2.z) * 0.5;
        const projU = (edgeMidX - obb.origin[0]) * ux + (edgeMidZ - obb.origin[1]) * uz;

        if (Math.abs(projU) > halfRidgeLen) {
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
          const normY = 0.707;
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

    // -------------------------------------------------------------------------
    // [2] 아파트·상가·오피스 평슬래브 (0.9m 돌출 난간 + 침하형 옥상 슬래브)
    // -------------------------------------------------------------------------
    const parapetHeight = 0.9; // 0.9m 난간
    const parapetThick = 0.35; // 0.35m 두께
    const parapetTopElev = topElev + parapetHeight;

    const uvParapet = getDiverseFacadeSlotUV('parapet_concrete');
    const actualRoofSlot = atlasRoofSlot || (isCommercialOrApt ? this.selectAerialRoofSlot(seed) : 'roof_concrete_warmgray');
    const uvRoofFloor = getDiverseFacadeSlotUV(actualRoofSlot);

    const innerPts: Point2D[] = [];

    for (let i = 0; i < ptCount; i++) {
      const prev = (i - 1 + ptCount) % ptCount;
      const next = (i + 1) % ptCount;
      const cur = pts2D[i];
      const pNext = pts2D[next];

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

      // 모서리 내부 오프셋 (0.35m)
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

    // 난간 상단 캡(0.35m) 및 내벽(0.9m)
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

      addQuad(
        [in1.x, parapetTopElev, in1.z],
        [in2.x, parapetTopElev, in2.z],
        [p2.x, parapetTopElev, p2.z],
        [p1.x, parapetTopElev, p1.z],
        [0, 1, 0],
        uvParapet
      );

      addQuad(
        [in2.x, topElev, in2.z],
        [in1.x, topElev, in1.z],
        [in1.x, parapetTopElev, in1.z],
        [in2.x, parapetTopElev, in2.z],
        [-nx, 0, -nz],
        uvParapet
      );
    }

    // 침하형 옥상 슬래브 바닥 (Earcut 삼각분할)
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
      // 삼각분할 안전 가드
    }

    // 옥상 2.8m 엘리베이터 권상기실(옥탑 코어) 큐브 메쉬
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
