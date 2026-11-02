/**
 * lib/vendor/precisionBuildingBuilder.ts
 *
 * [GeoBrief 3D 1단계: V-World급 5단 분리형 초정밀 3D 건축 지오메트리 생성기]
 *
 * 단순 박스 압출 방식을 전면 폐기하고, 건물 한 채를 물리적으로 결합된 5단 서브 구조물로 생성합니다:
 * 1단: 1층 기단부 (0m ~ 3.8m) - 0.2m 돌출 화강석 프레임, 통유리 쇼윈도, 1층 상단 가로 간판 박스 / 아파트 현관 포치
 * 2단: 기준층 본동 외벽 (3.8m ~ H) - 3.2m 베이 × 3.0m 층고 정밀 UV 타일링, 아파트 측벽 브랜드 줄눈 전용 재질 분리
 * 3단: 옥상 테두리 입체 난간 (H ~ H + 1.0m) - 0.35m 두께, 1.0m 높이 콘크리트 난간(Parapet)
 * 4단: 용도별 실제 옥상 바닥 (Roof Deck, 높이 H) - 우레탄 녹색(45%), 콘크리트 슬래브(35%), ㅅ자 박공기와(15%), 징크(5%)
 * 5단: 옥상 설비 및 엘리베이터 권상기실 (H ~ H + 3.2m) - 4.5m × 4.5m × 3.0m 엘리베이터 코어 박스 + 냉각탑/실외기
 */

import * as THREE from 'three';
import earcut from 'earcut';
import {
  BuildingStyleAssignment,
  classifyBuildingStyle,
} from '@/utils/precisionBuildingMaterials';

const Earcut = (earcut as any).default || earcut;

export interface Point2D {
  x: number;
  z: number;
}

export type AddSlotQuadFn = (
  slotIndex: number,
  pBL: [number, number, number],
  pBR: [number, number, number],
  pTR: [number, number, number],
  pTL: [number, number, number],
  norm: [number, number, number],
  uvBL: [number, number],
  uvBR: [number, number],
  uvTR: [number, number],
  uvTL: [number, number],
  color?: [number, number, number]
) => void;

export type AddSlotTriangleFn = (
  slotIndex: number,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  norm: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  color?: [number, number, number]
) => void;

export type AddRooftopQuadFn = (
  pBL: [number, number, number],
  pBR: [number, number, number],
  pTR: [number, number, number],
  pTL: [number, number, number],
  norm: [number, number, number],
  uvBL: [number, number],
  uvBR: [number, number],
  uvTR: [number, number],
  uvTL: [number, number],
  color?: [number, number, number]
) => void;

export type AddRooftopTriangleFn = (
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  norm: [number, number, number],
  uv0: [number, number],
  uv1: [number, number],
  uv2: [number, number],
  color?: [number, number, number]
) => void;

export interface PrecisionBuildingOptions {
  pts2D: Point2D[];
  baseElev: number;
  height: number;
  seed: number;
  edgeLens: number[];
  maxEdgeLen: number;
  minEdgeLen: number;
  featProps?: Record<string, any>;
  centerLngLat?: [number, number];
  holeIndices?: number[];
  innerRings2D?: Point2D[][];
  addSlotQuad: AddSlotQuadFn;
  addSlotTriangle: AddSlotTriangleFn;
  addRooftopQuad: AddRooftopQuadFn;
  addRooftopTriangle: AddRooftopTriangleFn;
}

export class PrecisionBuildingBuilder {
  /**
   * 5단 분리형 초정밀 3D 건물 지오메트리 생성
   */
  public static buildBuilding(options: PrecisionBuildingOptions): void {
    const {
      pts2D,
      baseElev,
      height: rawHeight,
      seed,
      edgeLens,
      maxEdgeLen,
      featProps = {},
      centerLngLat,
      holeIndices = [],
      addSlotQuad,
      addSlotTriangle,
      addRooftopQuad,
      addRooftopTriangle,
    } = options;

    const N = pts2D.length;
    if (N < 3) return;

    // 면적 및 중심 계산
    let sumX = 0;
    let sumZ = 0;
    let signedArea = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      sumX += pts2D[i].x;
      sumZ += pts2D[i].z;
      signedArea += pts2D[i].x * (-pts2D[j].z) - pts2D[j].x * (-pts2D[i].z);
    }
    const areaSqm = Math.max(10, Math.abs(signedArea) * 0.5);
    const cx = sumX / N;
    const cz = sumZ / N;

    // 건물 높이 보정 (최소 3.5m)
    const height = Math.max(3.5, rawHeight);

    // 16종 독립 스타일 배분
    const style: BuildingStyleAssignment = classifyBuildingStyle(
      featProps,
      seed,
      areaSqm,
      height,
      centerLngLat
    );

    const isApartment = style.category === 'apartment';
    const isCommercial = style.category === 'commercial';
    const isPublic = style.category === 'public';

    // 1층 기단부 높이 결정
    const podiumH = Math.min(height, 3.8);
    const mainH = height - podiumH;
    const topElev = baseElev + height;
    const podiumElev = baseElev + podiumH;

    // 아파트 측벽 판별 (높이 24m 이상 고층 아파트에서 가장 짧은 2개 변)
    const sideWallEdgeIndices = new Set<number>();
    if (isApartment && height >= 24.0 && N >= 4) {
      const sortedEdges = edgeLens
        .map((elen, idx) => ({ idx, elen }))
        .sort((a, b) => a.elen - b.elen);
      for (const item of sortedEdges) {
        if (sideWallEdgeIndices.size >= 2) break;
        if (item.elen < maxEdgeLen * 0.75) {
          sideWallEdgeIndices.add(item.idx);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 1단: 1층 기단부 (Ground Podium, 0m ~ 3.8m)
    // -------------------------------------------------------------------------
    const outsetM = isApartment ? 0.0 : 0.20; // 상가·오피스는 0.2m 돌출 화강석 프레임

    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const elen = edgeLens[i];
      if (elen < 0.1) continue;

      const p0 = pts2D[i];
      const p1 = pts2D[j];

      // 법선 벡터 (Outward Normal: CCW 기준 (dz, -dx))
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const normLen = Math.hypot(dx, dz) || 1;
      const nx = dz / normLen;
      const nz = -dx / normLen;

      if (!isApartment && podiumH >= 2.5) {
        // 상가·오피스·관공서 0.2m 돌출 화강석 기단부 외벽
        const pBL: [number, number, number] = [p0.x + nx * outsetM, baseElev, p0.z + nz * outsetM];
        const pBR: [number, number, number] = [p1.x + nx * outsetM, baseElev, p1.z + nz * outsetM];
        const pTR: [number, number, number] = [p1.x + nx * outsetM, podiumElev, p1.z + nz * outsetM];
        const pTL: [number, number, number] = [p0.x + nx * outsetM, podiumElev, p0.z + nz * outsetM];

        // 1층 쇼윈도 통유리 + 화강석 프레임 (Slot 17)
        const u = elen / 3.2;
        addSlotQuad(
          style.podiumSlot,
          pBL,
          pBR,
          pTR,
          pTL,
          [nx, 0, nz],
          [0, 0],
          [u, 0],
          [u, 1],
          [0, 1]
        );

        // 0.2m 수평 상단 턱 (Podium Cap)
        addSlotQuad(
          style.podiumSlot,
          pTL,
          pTR,
          [p1.x, podiumElev, p1.z],
          [p0.x, podiumElev, p0.z],
          [0, 1, 0],
          [0, 0],
          [u, 0],
          [u, 0.2],
          [0, 0.2]
        );

        // 1층 상단 돌출 가로 간판 박스 (3.0m ~ 3.7m 지점, 0.35m 돌출)
        if ((isCommercial || isPublic) && elen >= 4.5 && podiumH >= 3.6) {
          const signOutset = 0.35;
          const signBot = baseElev + 3.0;
          const signTop = baseElev + 3.7;

          // 간판 전면
          const sBL: [number, number, number] = [p0.x + nx * signOutset, signBot, p0.z + nz * signOutset];
          const sBR: [number, number, number] = [p1.x + nx * signOutset, signBot, p1.z + nz * signOutset];
          const sTR: [number, number, number] = [p1.x + nx * signOutset, signTop, p1.z + nz * signOutset];
          const sTL: [number, number, number] = [p0.x + nx * signOutset, signTop, p0.z + nz * signOutset];

          const su = Math.max(1.0, elen / 3.0);
          addSlotQuad(
            style.signboardSlot,
            sBL,
            sBR,
            sTR,
            sTL,
            [nx, 0, nz],
            [0, 0],
            [su, 0],
            [su, 1],
            [0, 1]
          );

          // 간판 상부 덮개
          addSlotQuad(
            style.signboardSlot,
            sTL,
            sTR,
            [p1.x + nx * outsetM, signTop, p1.z + nz * outsetM],
            [p0.x + nx * outsetM, signTop, p0.z + nz * outsetM],
            [0, 1, 0],
            [0, 0],
            [su, 0],
            [su, 0.2],
            [0, 0.2]
          );

          // 간판 하부 덮개
          addSlotQuad(
            style.signboardSlot,
            [p0.x + nx * outsetM, signBot, p0.z + nz * outsetM],
            [p1.x + nx * outsetM, signBot, p1.z + nz * outsetM],
            sBR,
            sBL,
            [0, -1, 0],
            [0, 0],
            [su, 0],
            [su, 0.2],
            [0, 0.2]
          );
        }
      } else {
        // 아파트 및 일반 저층: 1층 기단부 기본 외벽
        const pBL: [number, number, number] = [p0.x, baseElev, p0.z];
        const pBR: [number, number, number] = [p1.x, baseElev, p1.z];
        const pTR: [number, number, number] = [p1.x, podiumElev, p1.z];
        const pTL: [number, number, number] = [p0.x, podiumElev, p0.z];

        const isSide = sideWallEdgeIndices.has(i);
        const slot = isSide ? style.sideWallSlot : isApartment ? style.facadeSlot : style.podiumSlot;
        const u = isSide ? 1.0 : elen / 3.2;

        addSlotQuad(
          slot,
          pBL,
          pBR,
          pTR,
          pTL,
          [nx, 0, nz],
          [0, 0],
          [u, 0],
          [u, 1],
          [0, 1]
        );
      }
    }

    // 아파트 1층 현관 포치 (입구 캐노피 돌출 박스 및 캐노피 지붕)
    if (isApartment && height >= 15.0 && N >= 4) {
      let longestEdgeIdx = 0;
      let maxLen = 0;
      for (let i = 0; i < N; i++) {
        if (!sideWallEdgeIndices.has(i) && edgeLens[i] > maxLen) {
          maxLen = edgeLens[i];
          longestEdgeIdx = i;
        }
      }

      if (maxLen >= 10.0) {
        const j = (longestEdgeIdx + 1) % N;
        const p0 = pts2D[longestEdgeIdx];
        const p1 = pts2D[j];

        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const normLen = Math.hypot(dx, dz) || 1;
        const nx = dz / normLen;
        const nz = -dx / normLen;
        const ux = dx / normLen;
        const uz = dz / normLen;

        // 중앙점 기준 폭 3.6m, 돌출 1.8m, 높이 3.2m
        const mx = (p0.x + p1.x) * 0.5;
        const mz = (p0.z + p1.z) * 0.5;
        const halfW = 1.8;
        const depth = 1.8;
        const porchTop = baseElev + 3.2;

        const cL: [number, number, number] = [mx - ux * halfW + nx * depth, baseElev, mz - uz * halfW + nz * depth];
        const cR: [number, number, number] = [mx + ux * halfW + nx * depth, baseElev, mz + uz * halfW + nz * depth];
        const cTR: [number, number, number] = [mx + ux * halfW + nx * depth, porchTop, mz + uz * halfW + nz * depth];
        const cTL: [number, number, number] = [mx - ux * halfW + nx * depth, porchTop, mz - uz * halfW + nz * depth];

        const wL: [number, number, number] = [mx - ux * halfW, porchTop, mz - uz * halfW];
        const wR: [number, number, number] = [mx + ux * halfW, porchTop, mz + uz * halfW];

        // 포치 정면
        addSlotQuad(
          style.porchSlot,
          cL,
          cR,
          cTR,
          cTL,
          [nx, 0, nz],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        );

        // 포치 상판 캐노피 슬래브
        addSlotQuad(
          style.porchSlot,
          cTL,
          cTR,
          wR,
          wL,
          [0, 1, 0],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        );
      }
    }

    // -------------------------------------------------------------------------
    // 2단: 기준층 본동 외벽 (Main Facade, 3.8m ~ H)
    // -------------------------------------------------------------------------
    if (mainH > 0.5) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const elen = edgeLens[i];
        if (elen < 0.1) continue;

        const p0 = pts2D[i];
        const p1 = pts2D[j];

        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const normLen = Math.hypot(dx, dz) || 1;
        const nx = dz / normLen;
        const nz = -dx / normLen;

        const pBL: [number, number, number] = [p0.x, podiumElev, p0.z];
        const pBR: [number, number, number] = [p1.x, podiumElev, p1.z];
        const pTR: [number, number, number] = [p1.x, topElev, p1.z];
        const pTL: [number, number, number] = [p0.x, topElev, p0.z];

        const isSide = sideWallEdgeIndices.has(i);

        if (isSide) {
          // 아파트 측벽: 매끈한 콘크리트 + 단지 브랜드 수직 컬러 줄눈 전용 재질 (Slot 16)
          addSlotQuad(
            style.sideWallSlot,
            pBL,
            pBR,
            pTR,
            pTL,
            [nx, 0, nz],
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1]
          );
        } else {
          // 기준층 본동 외벽: 3.2m 베이 × 3.0m 층고 정밀 타일링
          const u = elen / 3.2;
          const v = mainH / 3.0;

          addSlotQuad(
            style.facadeSlot,
            pBL,
            pBR,
            pTR,
            pTL,
            [nx, 0, nz],
            [0, 0],
            [u, 0],
            [u, v],
            [0, v]
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3단: 옥상 테두리 입체 난간 (3D Parapet Wall, H ~ H + 1.0m)
    // -------------------------------------------------------------------------
    const parapetThick = 0.35; // 난간 두께 0.35m
    const parapetH = 1.0;      // 난간 높이 1.0m
    const parapetTopElev = topElev + parapetH;

    // 인셋 폴리곤 계산 (옥상 안쪽 0.35m)
    const innerPts2D: Point2D[] = [];
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;

      const dPrevX = pts2D[i].x - pts2D[prev].x;
      const dPrevZ = pts2D[i].z - pts2D[prev].z;
      const lenPrev = Math.hypot(dPrevX, dPrevZ) || 1;
      const nPrevX = -dPrevZ / lenPrev; // CCW inward normal
      const nPrevZ = dPrevX / lenPrev;

      const dNextX = pts2D[next].x - pts2D[i].x;
      const dNextZ = pts2D[next].z - pts2D[i].z;
      const lenNext = Math.hypot(dNextX, dNextZ) || 1;
      const nNextX = -dNextZ / lenNext;
      const nNextZ = dNextX / lenNext;

      let avgNx = (nPrevX + nNextX) * 0.5;
      let avgNz = (nPrevZ + nNextZ) * 0.5;
      const avgLen = Math.hypot(avgNx, avgNz) || 1;
      avgNx /= avgLen;
      avgNz /= avgLen;

      // 중심점 거리 대비 인셋 안전 보정
      const distToCenter = Math.hypot(pts2D[i].x - cx, pts2D[i].z - cz);
      const shift = distToCenter > parapetThick * 2 ? parapetThick : distToCenter * 0.4;

      innerPts2D.push({
        x: pts2D[i].x + avgNx * shift,
        z: pts2D[i].z + avgNz * shift,
      });
    }

    if (style.roofType !== 'gabled') {
      // 평지붕 건물에만 3D 입체 난간 생성 (위에서 볼 때 안쪽 홈과 그림자 형성)
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const p0 = pts2D[i];
        const p1 = pts2D[j];
        const ip0 = innerPts2D[i];
        const ip1 = innerPts2D[j];

        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const normLen = Math.hypot(dx, dz) || 1;
        const nx = dz / normLen;
        const nz = -dx / normLen;

        // 1) 난간 외측 벽체 (H ~ H + 1.0m)
        addRooftopQuad(
          [p0.x, topElev, p0.z],
          [p1.x, topElev, p1.z],
          [p1.x, parapetTopElev, p1.z],
          [p0.x, parapetTopElev, p0.z],
          [nx, 0, nz],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          style.parapetColorRgb
        );

        // 2) 난간 상단 수평 턱 (Top Cap, 두께 0.35m)
        addRooftopQuad(
          [p0.x, parapetTopElev, p0.z],
          [p1.x, parapetTopElev, p1.z],
          [ip1.x, parapetTopElev, ip1.z],
          [ip0.x, parapetTopElev, ip0.z],
          [0, 1, 0],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [style.parapetColorRgb[0] * 1.08, style.parapetColorRgb[1] * 1.08, style.parapetColorRgb[2] * 1.08]
        );

        // 3) 난간 내측 벽체 (H + 1.0m ~ H, 안쪽 옥상 바닥으로 하강)
        addRooftopQuad(
          [ip0.x, parapetTopElev, ip0.z],
          [ip1.x, parapetTopElev, ip1.z],
          [ip1.x, topElev, ip1.z],
          [ip0.x, topElev, ip0.z],
          [-nx, 0, -nz],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [style.parapetColorRgb[0] * 0.85, style.parapetColorRgb[1] * 0.85, style.parapetColorRgb[2] * 0.85]
        );
      }
    }

    // -------------------------------------------------------------------------
    // 4단: 용도별 실제 옥상 바닥 (Roof Deck, 높이 H)
    // -------------------------------------------------------------------------
    const deckPolygon = style.roofType === 'gabled' ? pts2D : innerPts2D;

    if (style.roofType === 'gabled') {
      // 실제 ㅅ자형 경사 박공지붕(Gabled Roof) 메쉬 (단독주택·빌라 15%)
      let maxEdgeIdx = 0;
      let maxDist = 0;
      for (let i = 0; i < N; i++) {
        if (edgeLens[i] > maxDist) {
          maxDist = edgeLens[i];
          maxEdgeIdx = i;
        }
      }

      const pA = pts2D[maxEdgeIdx];
      const pB = pts2D[(maxEdgeIdx + 1) % N];
      const ridgeElev = topElev + 2.4; // 용마루 높이 +2.4m

      // 중심 용마루 능선 (Ridge Line)
      const rA: [number, number, number] = [pA.x * 0.5 + cx * 0.5, ridgeElev, pA.z * 0.5 + cz * 0.5];
      const rB: [number, number, number] = [pB.x * 0.5 + cx * 0.5, ridgeElev, pB.z * 0.5 + cz * 0.5];

      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const e0 = pts2D[i];
        const e1 = pts2D[j];

        // 처마에서 용마루 능선으로 올라가는 2면 경사 메쉬
        addRooftopTriangle(
          [e0.x, topElev, e0.z],
          [e1.x, topElev, e1.z],
          rA,
          [0, 1, 0],
          [0, 0],
          [1, 0],
          [0.5, 1],
          style.roofColorRgb
        );
        addRooftopTriangle(
          [e1.x, topElev, e1.z],
          rB,
          rA,
          [0, 1, 0],
          [1, 0],
          [0.5, 1],
          [0, 1],
          style.roofColorRgb
        );
      }
    } else {
      // 평면 옥상 바닥 슬래브 삼각화 (초록 우레탄 45%, 콘크리트 슬래브 35%, 징크 5%)
      const flatCoords: number[] = [];
      for (const p of deckPolygon) {
        flatCoords.push(p.x, p.z);
      }

      const triIndices = Earcut(flatCoords, holeIndices, 2);
      for (let k = 0; k < triIndices.length; k += 3) {
        const i0 = triIndices[k];
        const i1 = triIndices[k + 1];
        const i2 = triIndices[k + 2];

        const p0 = deckPolygon[i0];
        const p1 = deckPolygon[i1];
        const p2 = deckPolygon[i2];
        if (!p0 || !p1 || !p2) continue;

        let pA = p0;
        let pB = p1;
        let pC = p2;
        const crossY = (pB.z - pA.z) * (pC.x - pA.x) - (pB.x - pA.x) * (pC.z - pA.z);
        if (crossY < 0) {
          const tmp = pB;
          pB = pC;
          pC = tmp;
        }

        addRooftopTriangle(
          [pA.x, topElev, pA.z],
          [pB.x, topElev, pB.z],
          [pC.x, topElev, pC.z],
          [0, 1, 0],
          [0, 0],
          [1, 0],
          [1, 1],
          style.roofColorRgb
        );
      }
    }

    // -------------------------------------------------------------------------
    // 5단: 옥상 설비 및 엘리베이터 권상기실 (Rooftop Penthouse, H ~ H + 3.2m)
    // -------------------------------------------------------------------------
    if (height >= 12.0 && style.roofType !== 'gabled' && areaSqm >= 120) {
      // 옥상 일측에 가로 4.5m × 세로 4.5m × 높이 3.0m 엘리베이터 코어 박스 생성
      const coreSize = 4.5;
      const coreH = 3.0;
      const coreTop = topElev + coreH;

      // 중심에서 살짝 오프셋된 위치
      const offsetM = Math.min(3.0, Math.sqrt(areaSqm) * 0.15);
      const ox = cx + offsetM * 0.5;
      const oz = cz + offsetM * 0.5;
      const half = coreSize * 0.5;

      const c0: [number, number] = [ox - half, oz - half];
      const c1: [number, number] = [ox + half, oz - half];
      const c2: [number, number] = [ox + half, oz + half];
      const c3: [number, number] = [ox - half, oz + half];
      const corePts = [c0, c1, c2, c3];

      // 코어 박스 4면 수직 벽체
      for (let k = 0; k < 4; k++) {
        const nextK = (k + 1) % 4;
        const b0 = corePts[k];
        const b1 = corePts[nextK];

        addRooftopQuad(
          [b0[0], topElev, b0[1]],
          [b1[0], topElev, b1[1]],
          [b1[0], coreTop, b1[1]],
          [b0[0], coreTop, b0[1]],
          [0, 0, 1],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          style.penthouseColorRgb
        );
      }

      // 코어 박스 옥탑 윗면 슬래브
      addRooftopQuad(
        [c0[0], coreTop, c0[1]],
        [c1[0], coreTop, c1[1]],
        [c2[0], coreTop, c2[1]],
        [c3[0], coreTop, c3[1]],
        [0, 1, 0],
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [style.penthouseColorRgb[0] * 1.1, style.penthouseColorRgb[1] * 1.1, style.penthouseColorRgb[2] * 1.1]
      );

      // 코어 박스 옆 냉각탑/실외기 박스 (2.2m × 2.2m × 1.4m)
      const hvacSize = 2.2;
      const hvacH = 1.4;
      const hvacTop = topElev + hvacH;
      const hx = ox - coreSize * 0.8;
      const hz = oz;
      const hHalf = hvacSize * 0.5;
      const hColor: [number, number, number] = [0.75, 0.77, 0.80]; // 실버 그레이

      const h0: [number, number] = [hx - hHalf, hz - hHalf];
      const h1: [number, number] = [hx + hHalf, hz - hHalf];
      const h2: [number, number] = [hx + hHalf, hz + hHalf];
      const h3: [number, number] = [hx - hHalf, hz + hHalf];
      const hPts = [h0, h1, h2, h3];

      for (let k = 0; k < 4; k++) {
        const nextK = (k + 1) % 4;
        addRooftopQuad(
          [hPts[k][0], topElev, hPts[k][1]],
          [hPts[nextK][0], topElev, hPts[nextK][1]],
          [hPts[nextK][0], hvacTop, hPts[nextK][1]],
          [hPts[k][0], hvacTop, hPts[k][1]],
          [0, 0, 1],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          hColor
        );
      }

      addRooftopQuad(
        [h0[0], hvacTop, h0[1]],
        [h1[0], hvacTop, h1[1]],
        [h2[0], hvacTop, h2[1]],
        [h3[0], hvacTop, h3[1]],
        [0, 1, 0],
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        hColor
      );
    }
  }
}
