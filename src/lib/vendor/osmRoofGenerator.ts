/**
 * lib/vendor/osmRoofGenerator.ts
 *
 * [GeoBrief 3D 2단계: OSMBuildings 입체 지붕 스켈레톤 & 옥탑 코어 생성기]
 *
 * GitHub 오픈소스 `kekscom/osmbuildings`의 입체 지붕 스켈레톤(Skeleton Roof Generation)
 * 및 파라펫(Parapet) 절차적 생성 알고리즘을 벤더링하여, 단순 평면 뚜껑 대신
 * 한국형 도심 및 주거지의 실제 3D 입체 지붕을 생성합니다:
 *
 * 1. 중층 상가·원룸·아파트 평슬래브 옥상 (Flat Slab with 3D Parapet):
 *    - 외곽 테두리를 따라 높이 0.9m, 두께 0.35m의 3D 콘크리트 난간(Parapet) 돌출
 *    - 난간 안쪽으로 0.9m 내려앉은 침하형 옥상 바닥 슬래브(그림자 및 사실적 깊이감)
 *    - 3대 표면 질감 배분:
 *      * 에메랄드/세이지 우레탄 방수 (#2e6b4e, 45%)
 *      * 노후 시멘트 슬래브 (#78716c, 35%)
 *      * 암회색 아스팔트 (#475569, 20%)
 *    - 옥상 중심에 높이 2.8m 엘리베이터 권상기실 / 옥탑방 큐브(Penthouse Core) 물리 메쉬 배치
 *
 * 2. 저층 단독주택·빌라·군부대 막사 입체 경사지붕 (Gabled & Hipped 3D Roof):
 *    - 평면 장축(Major Axis)을 따라 용마루(Ridge line)가 솟아오르는 ㅅ자형 박공(Gabled) 및 우진각(Hipped) 메쉬
 *    - 3대 지붕재:
 *      * 적갈색 점토 기와 (#7c3626, 50%)
 *      * 암적색 아스팔트 슁글 (#5c281b, 20%)
 *      * 코발트 블루 골강판 (#1e40af, 30%)
 */

import earcut from 'earcut';
import {
  UVRect,
  getDiverseFacadeSlotUV,
  getPhotorealisticSlotUV,
} from '@/utils/diverseKoreanFacadeAtlas';

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

export interface OsmRoofOptions {
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

export class OsmRoofGenerator {
  /**
   * 입체 지붕 조형 생성
   */
  public static generate3DRoof(opts: OsmRoofOptions): void {
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

    // Bounding metrics
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts2D) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);

    // -------------------------------------------------------------------------
    // [A] 저층 단독주택·빌라·막사: 장축 기반 3D 박공(Gabled) & 우진각(Hipped) 지붕
    // -------------------------------------------------------------------------
    if (isGabled && height <= 16.0) {
      OsmRoofGenerator.generateGabledOrHippedRoof({
        pts2D,
        topElev,
        seed,
        spanX,
        spanZ,
        roofSlot,
        wallSlot,
        addQuad,
        addTriangle,
      });
      return;
    }

    // -------------------------------------------------------------------------
    // [B] 중층 상가·원룸·아파트: 침하형 옥상 슬래브 + 0.35m 돌출 난간(Parapet) + 2.8m 옥탑 코어
    // -------------------------------------------------------------------------
    const roofUV = roofSlot
      ? getPhotorealisticSlotUV(roofSlot)
      : OsmRoofGenerator.selectRooftopUV(seed, isHighRiseApt, buildingType);

    // 1. 옥상 슬래브 바닥 earcut 분할 (Earcut Triangulation)
    const flatCoords: number[] = [];
    for (let i = 0; i < ptCount; i++) {
      flatCoords.push(pts2D[i].x, pts2D[i].z);
    }

    const triangles = Earcut(flatCoords, holeIndices.length > 0 ? holeIndices : null, 2);
    for (let t = 0; t < triangles.length; t += 3) {
      const i0 = triangles[t];
      const i1 = triangles[t + 1];
      const i2 = triangles[t + 2];

      const pt0 = pts2D[i0];
      const pt1 = pts2D[i1];
      const pt2 = pts2D[i2];
      if (!pt0 || !pt1 || !pt2) continue;

      const d01 = Math.hypot(pt1.x - pt0.x, pt1.z - pt0.z);
      const d12 = Math.hypot(pt2.x - pt1.x, pt2.z - pt1.z);
      const d20 = Math.hypot(pt0.x - pt2.x, pt0.z - pt2.z);
      if (d01 > 180 || d12 > 180 || d20 > 180) continue;

      const uv0: [number, number] = [
        roofUV.u0 + ((pt0.x - minX) / spanX) * (roofUV.u1 - roofUV.u0),
        roofUV.v0 + ((pt0.z - minZ) / spanZ) * (roofUV.v1 - roofUV.v0),
      ];
      const uv1: [number, number] = [
        roofUV.u0 + ((pt1.x - minX) / spanX) * (roofUV.u1 - roofUV.u0),
        roofUV.v0 + ((pt1.z - minZ) / spanZ) * (roofUV.v1 - roofUV.v0),
      ];
      const uv2: [number, number] = [
        roofUV.u0 + ((pt2.x - minX) / spanX) * (roofUV.u1 - roofUV.u0),
        roofUV.v0 + ((pt2.z - minZ) / spanZ) * (roofUV.v1 - roofUV.v0),
      ];

      addTriangle(
        [pt0.x, topElev, pt0.z],
        [pt1.x, topElev, pt1.z],
        [pt2.x, topElev, pt2.z],
        [0, 1, 0],
        uv0,
        uv1,
        uv2
      );
    }

    // 2. 옥상 테두리 3D 돌출 콘크리트 난간(Parapet)
    const hasParapet = isHighRiseApt || buildingType === 'commercial' || height >= 10.0;
    if (hasParapet) {
      const parapetH = 0.9;  // 0.9m 돌출 높이
      const parapetW = 0.35; // 0.35m 실측 두께
      const topCapY = topElev + parapetH;
      const uvParapet = getDiverseFacadeSlotUV('parapet_concrete');

      for (let i = 0; i < ptCount; i++) {
        const j = (i + 1) % ptCount;
        const p1 = pts2D[i];
        const p2 = pts2D[j];

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const edgeLen = Math.hypot(dx, dz);
        if (edgeLen < 0.3) continue;

        const nx = dz / edgeLen;
        const nz = -dx / edgeLen;

        const p1In = { x: p1.x - nx * parapetW, z: p1.z - nz * parapetW };
        const p2In = { x: p2.x - nx * parapetW, z: p2.z - nz * parapetW };

        // 1) 외측 수직면 (높이 0.9m)
        addRooftopQuad(
          [p1.x, topElev, p1.z],
          [p2.x, topElev, p2.z],
          [p2.x, topCapY, p2.z],
          [p1.x, topCapY, p1.z],
          [nx, 0, nz],
          uvParapet
        );

        // 2) 상단 수평면 (두께 0.35m 캡)
        addRooftopQuad(
          [p1.x, topCapY, p1.z],
          [p2.x, topCapY, p2.z],
          [p2In.x, topCapY, p2In.z],
          [p1In.x, topCapY, p1In.z],
          [0, 1, 0],
          uvParapet
        );

        // 3) 내측 수직면 (난간 안쪽 드롭섀도우 면)
        addRooftopQuad(
          [p2In.x, topElev, p2In.z],
          [p1In.x, topElev, p1In.z],
          [p1In.x, topCapY, p1In.z],
          [p2In.x, topCapY, p2In.z],
          [-nx, 0, -nz],
          uvParapet
        );
      }
    }

    // 3. 엘리베이터 권상기실 / 옥탑방 코어 큐브 (높이 2.8m)
    if (height >= 12.0 && spanX >= 12.0 && spanZ >= 12.0) {
      const coreH = 2.8;
      const coreW = Math.max(4.0, Math.min(8.0, spanX * 0.28));
      const coreD = Math.max(4.0, Math.min(8.0, spanZ * 0.28));
      const cX = (minX + maxX) * 0.5;
      const cZ = (minZ + maxZ) * 0.5;
      const coreTopY = topElev + coreH;

      const uvCoreWall = getDiverseFacadeSlotUV('penthouse_wall');
      const uvCoreRoof = getDiverseFacadeSlotUV('parapet_concrete');

      const cX0 = cX - coreW * 0.5;
      const cX1 = cX + coreW * 0.5;
      const cZ0 = cZ - coreD * 0.5;
      const cZ1 = cZ + coreD * 0.5;

      // 남/북/동/서 4개 벽체
      addRooftopQuad([cX0, topElev, cZ1], [cX1, topElev, cZ1], [cX1, coreTopY, cZ1], [cX0, coreTopY, cZ1], [0, 0, 1], uvCoreWall);
      addRooftopQuad([cX1, topElev, cZ0], [cX0, topElev, cZ0], [cX0, coreTopY, cZ0], [cX1, coreTopY, cZ0], [0, 0, -1], uvCoreWall);
      addRooftopQuad([cX1, topElev, cZ1], [cX1, topElev, cZ0], [cX1, coreTopY, cZ0], [cX1, coreTopY, cZ1], [1, 0, 0], uvCoreWall);
      addRooftopQuad([cX0, topElev, cZ0], [cX0, topElev, cZ1], [cX0, coreTopY, cZ1], [cX0, coreTopY, cZ0], [-1, 0, 0], uvCoreWall);

      // 옥탑 지붕면
      addRooftopQuad([cX0, coreTopY, cZ1], [cX1, coreTopY, cZ1], [cX1, coreTopY, cZ0], [cX0, coreTopY, cZ0], [0, 1, 0], uvCoreRoof);
    }
  }

  /**
   * 장축 기반 박공/우진각 지붕 정밀 지오메트리
   */
  private static generateGabledOrHippedRoof(opts: {
    pts2D: Point2D[];
    topElev: number;
    seed: number;
    spanX: number;
    spanZ: number;
    roofSlot: string;
    wallSlot: string;
    addQuad: AddQuadFn;
    addTriangle: AddTriangleFn;
  }): void {
    const { pts2D, topElev, seed, spanX, spanZ, roofSlot, wallSlot, addQuad, addTriangle } = opts;

    let cX = 0, cZ = 0;
    for (const p of pts2D) {
      cX += p.x;
      cZ += p.z;
    }
    cX /= pts2D.length;
    cZ /= pts2D.length;

    const isLongX = spanX >= spanZ;
    const majorLen = isLongX ? spanX : spanZ;
    const minorWid = isLongX ? spanZ : spanX;

    const ridgeH = Math.max(1.8, Math.min(3.2, minorWid * 0.42));
    const ridgeY = topElev + ridgeH;

    // 지붕 텍스처 (적갈색 기와 50% / 코발트 블루 강판 30% / 슬레이트 그레이 20%)
    const gPick = seed % 10;
    let gabledRoofUV = getDiverseFacadeSlotUV(roofSlot || (gPick < 5 ? 'roof_terracotta_tile' : gPick < 8 ? 'roof_zinc_blue' : 'roof_concrete_warmgray'));
    const bldWallUV = getDiverseFacadeSlotUV(wallSlot || 'villa_red_brick');

    const halfL = majorLen * 0.5;
    const halfW = minorWid * 0.5;

    if (isLongX) {
      // X축 방향 능선
      const r0: [number, number, number] = [cX - halfL, ridgeY, cZ];
      const r1: [number, number, number] = [cX + halfL, ridgeY, cZ];

      const e00: [number, number, number] = [cX - halfL, topElev, cZ - halfW];
      const e10: [number, number, number] = [cX + halfL, topElev, cZ - halfW];
      const e11: [number, number, number] = [cX + halfL, topElev, cZ + halfW];
      const e01: [number, number, number] = [cX - halfL, topElev, cZ + halfW];

      const hyp = Math.hypot(ridgeH, halfW);
      const sinA = ridgeH / hyp;
      const cosA = halfW / hyp;

      // 북측 경사면
      addQuad(e00, e10, r1, r0, [0, cosA, -sinA], gabledRoofUV);
      // 남측 경사면
      addQuad(r0, r1, e11, e01, [0, cosA, sinA], gabledRoofUV);

      // 서측 박공 삼각형 벽체
      addTriangle(e01, e00, r0, [-1, 0, 0], [bldWallUV.u0, bldWallUV.v0], [bldWallUV.u1, bldWallUV.v0], [(bldWallUV.u0 + bldWallUV.u1) * 0.5, bldWallUV.v1]);
      // 동측 박공 삼각형 벽체
      addTriangle(e10, e11, r1, [1, 0, 0], [bldWallUV.u0, bldWallUV.v0], [bldWallUV.u1, bldWallUV.v0], [(bldWallUV.u0 + bldWallUV.u1) * 0.5, bldWallUV.v1]);
    } else {
      // Z축 방향 능선
      const r0: [number, number, number] = [cX, ridgeY, cZ - halfL];
      const r1: [number, number, number] = [cX, ridgeY, cZ + halfL];

      const e00: [number, number, number] = [cX - halfW, topElev, cZ - halfL];
      const e10: [number, number, number] = [cX + halfW, topElev, cZ - halfL];
      const e11: [number, number, number] = [cX + halfW, topElev, cZ + halfL];
      const e01: [number, number, number] = [cX - halfW, topElev, cZ + halfL];

      const hyp = Math.hypot(ridgeH, halfW);
      const sinA = ridgeH / hyp;
      const cosA = halfW / hyp;

      // 서측 경사면
      addQuad(e00, r0, r1, e01, [-sinA, cosA, 0], gabledRoofUV);
      // 동측 경사면
      addQuad(r0, e10, e11, r1, [sinA, cosA, 0], gabledRoofUV);

      // 북측 박공 삼각형 벽체
      addTriangle(e00, e10, r0, [0, 0, -1], [bldWallUV.u0, bldWallUV.v0], [bldWallUV.u1, bldWallUV.v0], [(bldWallUV.u0 + bldWallUV.u1) * 0.5, bldWallUV.v1]);
      // 남측 박공 삼각형 벽체
      addTriangle(e11, e01, r1, [0, 0, 1], [bldWallUV.u0, bldWallUV.v0], [bldWallUV.u1, bldWallUV.v0], [(bldWallUV.u0 + bldWallUV.u1) * 0.5, bldWallUV.v1]);
    }
  }

  /**
   * 옥상 텍스처 확률적 선택 (우레탄 45%, 시멘트 35%, 아스팔트/기와 20%)
   */
  private static selectRooftopUV(seed: number, isApt: boolean, buildingType: string): UVRect {
    if (isApt) {
      const aptSeed = seed % 10;
      if (aptSeed < 4) return getDiverseFacadeSlotUV('roof_concrete_warmgray'); // 40% 시멘트
      if (aptSeed < 7) return getDiverseFacadeSlotUV('roof_terracotta_tile');    // 30% 테라코타
      return getDiverseFacadeSlotUV('roof_urethane_sage');                       // 30% 우레탄
    }

    if (buildingType === 'commercial') {
      const commSeed = seed % 100;
      if (commSeed < 45) return getDiverseFacadeSlotUV('roof_urethane_sage');    // 45% 우레탄 방수
      if (commSeed < 80) return getDiverseFacadeSlotUV('roof_concrete_warmgray');// 35% 시멘트 슬래브
      return getDiverseFacadeSlotUV('roof_terracotta_tile');                     // 20% 암회색/테라코타
    }

    return getDiverseFacadeSlotUV('roof_concrete_warmgray');
  }
}
