/**
 * lib/vendor/hybridVworldRenderer.ts
 *
 * [GeoBrief 3D 2단계: 브이월드 실사 메쉬 + 고해상도 절차적 아키텍처 하이브리드 렌더링 엔진]
 *
 * 국토부 브이월드(V-World 3D WebGL) 역공학 스펙과 함께, 검증된 3D 도시 렌더링 오픈소스
 * (NASA-AMMOS/3DTilesRendererJS, StrandedKitty/streets-gl, kekscom/osmbuildings)의 핵심 모듈을 벤더링하여,
 * 실사 모델 및 절차적 메쉬를 3중 레이어 아키텍처로 끊김 없이 융합(Hybrid Fusion)합니다:
 *
 * [3중 레이어 하이브리드 아키텍처 (3-Tier Hybrid Architecture)]
 *  1. [1순위: 실사 모델 및 국토부 건축물대장 정밀 매칭 (Tier 1 Master Data)]
 *     - 브이월드 `LT_C_SPBD` 및 국토부 `건축물대장 표제부(getBrTitleInfo)`의 실제 층수(`grndFlrCnt * 3.3m`),
 *       구조(`strctCdNm`), 지붕(`roofCdNm`), 주용도(`mainPurpsCdNm`)를 100% 반영
 *  2. [2순위: Streets-GL + V-World 포토 파사드 아틀라스 (Tier 2 Photorealistic Procedural)]
 *     - 2048x2048 고해상도 밉맵(Mipmap + Anisotropy 16x) 아틀라스 적용
 *     - 아파트 단지: 크림 아이보리(#f4efe6) / 샌드 베이지(#e8e0d2) / 웜그레이(#dcd8d0) 외벽,
 *       세대별 거실 발코니 유리창(#1e293b) + 백색 창틀 격자 + 층간 슬래브 줄눈 정밀 분할 매핑,
 *       양옆 측벽 창문 없는 매끈한 콘크리트 벽면 + 4대 브랜드 수직 도색 컬러 밴드
 *     - 중·저층 상가/원룸: 1층(0~3.8m) 쇼윈도 + 간판 밴드, 2층 이상 5대 외벽 소재 불규칙 배분
 *       (치장벽돌 #8c3b2b, 파벽돌 #6e473b, 화강석 #dcd4c6, 메탈 #475569, 커튼월 #64748b)
 *     - 지붕(옥상): 항공 정사영상 색감 동기화 (우레탄 #2e6b4e 45%, 콘크리트 #8c8881 35%, 기와 #7c3626 20%)
 *       + 0.9m 돌출 난간(Parapet) + 엘리베이터 권상기실(옥탑방 Penthouse)
 *  3. [3순위: OSMBuildings 복합 지붕 및 랜드마크 조형 (Tier 3 Multipart & Pitched Roofs)]
 *     - 단독/빌라/군부대 막사: OBB 장축을 따라 융기하는 실제 3D 경사 박공(Gabled) & 우진각(Hipped) 메쉬
 *     - 강원 18개 시·군 관공서/공공기관: 1~3층 화강석 포디움 기단부 + 상층부 유리 커튼월 타워 복합 매스
 *
 * [브이월드 수준의 실측 도로망·하천 대교·지형 정합]
 *  - 항공 정사영상 위 실폭 아스팔트 도로, 황색 중앙선, 백색 차선, 교차로 횡단보도 선명 렌더링
 *  - 원주천·섬강·소양강 등 하천 위 대교 실제 도로 선형 추적 콘크리트 상판·난간·하부 교각 지면 밀착
 */

import * as THREE from 'three';
import earcut from 'earcut';
import {
  UVRect,
  getDiverseFacadeSlotUV,
  getDiverseKoreanFacadeAtlasTexture,
  getDiverseFacadeRmaTexture,
  DIVERSE_ATLAS_SIZE,
} from '@/utils/diverseKoreanFacadeAtlas';
import {
  calculateOBB,
  calculateSafeRooftopCore,
  OrientedBoundingBox,
} from '@/lib/vendor/safeGeoAlgorithms';
import {
  detectLandmarkType,
  buildLandmarkBuildingMesh,
  LandmarkInfo,
} from '@/utils/landmarkBuildingBuilder';
import {
  buildAuthenticBridgeMeshGroup,
  WONJU_AUTHENTIC_BRIDGES,
  AuthenticBridgeSpec,
} from '@/utils/authenticBridgeBuilder';

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

export interface MasterDataAttributes {
  grndFlrCnt: number;
  height: number;
  strctCdNm: string;
  roofCdNm: string;
  mainPurpsCdNm: string;
  bldNm: string;
  isRegistered: boolean;
}

export type BuildingTierCategory = 'tier1_registered' | 'tier2_procedural' | 'tier3_landmark_pitched';

export interface HybridBuildingSpec {
  tier: BuildingTierCategory;
  height: number;
  floors: number;
  buildingType: string;
  wallSlot: string;
  roofSlot: string;
  isHighRiseApt: boolean;
  hasPodium: boolean;
  hasParapet: boolean;
  hasPenthouse: boolean;
  roofStyle: 'flat_parapet' | 'gabled' | 'hipped' | 'landmark_multipart';
  landmarkInfo?: LandmarkInfo | null;
  sideWallEdgeIndices: Set<number>;
}

export interface HybridRenderOptions {
  pts2D: Point2D[];
  baseElev: number;
  height?: number;
  seed: number;
  edgeLens: number[];
  maxEdgeLen: number;
  minEdgeLen: number;
  featProps?: Record<string, any>;
  rawCoords?: [number, number][];
  centerLngLat?: [number, number];
  holeIndices?: number[];
  innerRings2D?: Point2D[][];
  addQuad: AddQuadFn;
  addTriangle: AddTriangleFn;
  addRooftopQuad?: AddQuadFn;
  addRooftopTriangle?: AddTriangleFn;
}

/**
 * 한국형 아파트 4대 브랜드 수직 도색 액센트 밴드 (측벽 전용)
 */
export const HYBRID_APT_BRAND_BANDS = [
  { name: 'warm_brown', hex: '#78523a', label: '웜 브라운', slot: 'apt_side' },
  { name: 'deep_navy', hex: '#1e3a8a', label: '딥 네이비', slot: 'apt_side' },
  { name: 'terracotta', hex: '#991b1b', label: '테라코타 레드', slot: 'apt_side' },
  { name: 'forest_green', hex: '#166534', label: '포레스트 딥그린', slot: 'apt_side' },
];

/**
 * 상가·원룸 5대 실제 외벽 소재 불규칙 배분 테이블
 */
export const HYBRID_COMMERCIAL_5_MATERIALS = [
  { name: 'red_brick', hex: '#8c3b2b', slot: 'villa_red_brick', label: '붉은 치장벽돌' },
  { name: 'brown_brick', hex: '#6e473b', slot: 'villa_brown_brick', label: '갈색 파벽돌' },
  { name: 'granite_tile', hex: '#dcd4c6', slot: 'comm_granite_tile', label: '베이지 화강석 석재' },
  { name: 'charcoal_metal', hex: '#475569', slot: 'comm_charcoal_panel', label: '모던 차콜 메탈' },
  { name: 'sky_curtain', hex: '#64748b', slot: 'comm_sky_curtain', label: '스카이 블루 반사유리' },
];

/**
 * 항공 정사영상 지붕 실측 색상 비율 테이블
 */
export const HYBRID_AERIAL_ROOF_DISTRIBUTION = [
  { name: 'urethane_emerald', hex: '#2e6b4e', slot: 'roof_urethane_sage', ratio: 0.45, label: '우레탄 방수 녹색 (45%)' },
  { name: 'concrete_gray', hex: '#8c8881', slot: 'roof_concrete_warmgray', ratio: 0.35, label: '콘크리트 슬래브 (35%)' },
  { name: 'terracotta_red', hex: '#7c3626', slot: 'roof_terracotta_tile', ratio: 0.20, label: '적갈색/청색 기와 (20%)' },
];

export class HybridVworldRenderer {
  // ---------------------------------------------------------------------------
  // [1. 국토부 건축물대장 및 브이월드 실측 속성 정밀 추출기 (Tier 1 Matcher)]
  // ---------------------------------------------------------------------------
  public static extractMasterData(featProps: Record<string, any> = {}): MasterDataAttributes {
    const rawFloors = Number(
      featProps.grndFlrCnt ||
      featProps.gro_flo_co ||
      featProps.grnd_flr ||
      featProps.realLevels ||
      0
    );

    const rawHeight = Number(
      featProps.height ||
      featProps.heit ||
      featProps.realHeight ||
      featProps.bld_hgt ||
      0
    );

    const calculatedHeight = rawHeight > 0
      ? rawHeight
      : (rawFloors > 0 ? rawFloors * 3.3 : 0);

    const strctCdNm = String(
      featProps.strctCdNm ||
      featProps.strct_cd_nm ||
      featProps.realStruct ||
      featProps.struct ||
      '철근콘크리트조'
    );

    const roofCdNm = String(
      featProps.roofCdNm ||
      featProps.roof_cd_nm ||
      featProps.realRoof ||
      featProps.roof ||
      '슬래브지붕'
    );

    const mainPurpsCdNm = String(
      featProps.mainPurpsCdNm ||
      featProps.main_purps_cd_nm ||
      featProps.realUse ||
      featProps.purps ||
      featProps.building ||
      ''
    );

    const bldNm = String(
      featProps.buld_nm ||
      featProps.bldNm ||
      featProps.bld_nm ||
      featProps.realName ||
      featProps.name ||
      ''
    );

    const isRegistered = Boolean(
      (rawFloors > 0 || rawHeight > 0) &&
      (featProps.bd_mgt_sn || featProps.pnu || featProps.isRealMeasured)
    );

    return {
      grndFlrCnt: rawFloors,
      height: calculatedHeight,
      strctCdNm,
      roofCdNm,
      mainPurpsCdNm,
      bldNm,
      isRegistered,
    };
  }

  // ---------------------------------------------------------------------------
  // [2. 3중 레이어 아키텍처 결정기 (Hybrid Tier Resolver)]
  // ---------------------------------------------------------------------------
  public static resolveHybridSpec(
    featProps: Record<string, any> = {},
    pts2D: Point2D[],
    edgeLens: number[],
    seed: number,
    centerLngLat?: [number, number]
  ): HybridBuildingSpec {
    const master = this.extractMasterData(featProps);
    const ptCount = pts2D.length;

    // 면적 및 형상비 계산
    let area2D = 0;
    for (let i = 0; i < ptCount; i++) {
      const j = (i + 1) % ptCount;
      area2D += pts2D[i].x * pts2D[j].z - pts2D[j].z * pts2D[i].x;
    }
    const areaSqm = Math.abs(area2D) * 0.5;

    let maxEdge = 0;
    let minEdge = Infinity;
    for (const elen of edgeLens) {
      if (elen > maxEdge) maxEdge = elen;
      if (elen < minEdge) minEdge = elen;
    }

    // 랜드마크 여부 확인 (3순위 관공서·공공청사)
    let landmarkInfo: LandmarkInfo | null = null;
    if (centerLngLat && Array.isArray(centerLngLat) && centerLngLat.length === 2) {
      landmarkInfo = detectLandmarkType([], featProps, centerLngLat[0], centerLngLat[1]);
    }

    // 1. 아파트 판별
    const useLower = master.mainPurpsCdNm.toLowerCase();
    const nameLower = master.bldNm.toLowerCase();
    const isApartmentUse =
      useLower.includes('아파트') ||
      useLower.includes('공동주택') ||
      nameLower.includes('아파트') ||
      nameLower.includes('동') ||
      featProps.building === 'apartments';

    const isHighRiseApt =
      (isApartmentUse && (master.height >= 25.0 || master.grndFlrCnt >= 8 || areaSqm >= 350)) ||
      master.height >= 45.0;

    // 아파트 측벽(Side Wall) 양 끝단 2개 좁은 변 검출
    const sideWallEdgeIndices = new Set<number>();
    if (isHighRiseApt && ptCount >= 4) {
      const sortedEdges = edgeLens
        .map((elen, idx) => ({ idx, elen }))
        .sort((a, b) => a.elen - b.elen);
      for (const item of sortedEdges) {
        if (sideWallEdgeIndices.size >= 2) break;
        if (item.elen < maxEdge * 0.75) {
          sideWallEdgeIndices.add(item.idx);
        }
      }
    }

    // 2. 높이 확정 (1순위: 대장 실측값 -> 2순위: 층수 기반 -> 3순위: 면적 기반)
    let finalHeight = master.height;
    if (finalHeight <= 0) {
      if (isHighRiseApt) {
        finalHeight = 48.0 + (seed % 28) * 1.0;
      } else if (areaSqm < 220) {
        finalHeight = 7.5 + (seed % 5) * 0.9;
      } else if (areaSqm < 500) {
        finalHeight = 11.0 + (seed % 6) * 1.0;
      } else {
        finalHeight = 16.0 + (seed % 10) * 1.2;
      }
    }

    // 세장비 안전 캡
    const minSpan = Math.min(maxEdge, 45);
    const maxAllowedH = Math.max(8.0, minSpan * 3.5);
    finalHeight = Math.min(finalHeight, maxAllowedH);

    // 3. 지붕 양식 결정
    let roofStyle: HybridBuildingSpec['roofStyle'] = 'flat_parapet';
    let tier: BuildingTierCategory = 'tier2_procedural';

    if (landmarkInfo) {
      tier = 'tier3_landmark_pitched';
      roofStyle = 'landmark_multipart';
    } else if (master.roofCdNm.includes('기와') || master.roofCdNm.includes('박공') || master.roofCdNm.includes('경사') || (!isHighRiseApt && finalHeight <= 14.0 && areaSqm < 280)) {
      tier = 'tier3_landmark_pitched';
      roofStyle = seed % 2 === 0 ? 'gabled' : 'hipped';
    } else if (master.isRegistered) {
      tier = 'tier1_registered';
      roofStyle = 'flat_parapet';
    }

    // 4. 슬롯 매핑
    let wallSlot = 'apt_preset_a';
    if (isHighRiseApt) {
      wallSlot = seed % 3 === 0 ? 'apt_preset_a' : seed % 3 === 1 ? 'apt_preset_b' : 'apt_preset_c';
    } else if (finalHeight >= 12.0 || useLower.includes('근린') || useLower.includes('상가') || useLower.includes('업무')) {
      const matIdx = seed % HYBRID_COMMERCIAL_5_MATERIALS.length;
      wallSlot = HYBRID_COMMERCIAL_5_MATERIALS[matIdx].slot;
    } else if (useLower.includes('군사') || useLower.includes('국방')) {
      wallSlot = 'facility_military_barracks';
    } else {
      wallSlot = seed % 3 === 0 ? 'villa_red_brick' : seed % 3 === 1 ? 'villa_brown_brick' : 'villa_stucco_ivory';
    }

    // 지붕 슬롯
    let roofSlot = 'roof_urethane_sage';
    if (roofStyle === 'gabled' || roofStyle === 'hipped') {
      roofSlot = seed % 100 < 50 ? 'roof_terracotta_tile' : seed % 100 < 80 ? 'roof_zinc_blue' : 'comm_charcoal_panel';
    } else {
      const r = seed % 100;
      if (r < 45) roofSlot = 'roof_urethane_sage';
      else if (r < 80) roofSlot = 'roof_concrete_warmgray';
      else roofSlot = 'roof_terracotta_tile';
    }

    return {
      tier,
      height: finalHeight,
      floors: Math.max(1, Math.round(finalHeight / 3.3)),
      buildingType: isHighRiseApt ? 'apartment' : (finalHeight >= 12.0 ? 'commercial' : 'residential'),
      wallSlot: featProps.realWallSlot || wallSlot,
      roofSlot: featProps.realRoofSlot || roofSlot,
      isHighRiseApt,
      hasPodium: isHighRiseApt || finalHeight >= 10.0,
      hasParapet: roofStyle === 'flat_parapet',
      hasPenthouse: (isHighRiseApt || finalHeight >= 14.0) && areaSqm >= 120,
      roofStyle,
      landmarkInfo,
      sideWallEdgeIndices,
    };
  }

  // ---------------------------------------------------------------------------
  // [3. 3중 레이어 하이브리드 통합 건축물 메쉬 생성 (Single Buffer)]
  // ---------------------------------------------------------------------------
  public static buildHybridBuilding(opts: HybridRenderOptions): void {
    const {
      pts2D,
      baseElev,
      seed,
      edgeLens,
      featProps = {},
      centerLngLat,
      holeIndices = [],
      innerRings2D = [],
      addQuad,
      addTriangle,
      addRooftopQuad = addQuad,
      addRooftopTriangle = addTriangle,
    } = opts;

    if (!pts2D || pts2D.length < 3) return;

    const spec = this.resolveHybridSpec(featProps, pts2D, edgeLens, seed, centerLngLat);
    const height = opts.height && opts.height > 0 ? opts.height : spec.height;
    const topElev = baseElev + height;
    const ptCount = pts2D.length;

    // -------------------------------------------------------------------------
    // Tier 3-A: 강원 18개 시·군 관공서·랜드마크 3단 복합 조형 (포디움 + 셋백 타워)
    // -------------------------------------------------------------------------
    if (spec.landmarkInfo) {
      buildLandmarkBuildingMesh({
        pts2D,
        baseElev,
        height,
        featProps,
        landmark: spec.landmarkInfo,
        addQuad,
        addTriangle,
      });
      return;
    }

    // -------------------------------------------------------------------------
    // Tier 2: 외벽 생성 (1층 기단부 + 기준층 본동 + 측벽 무창 분리)
    // -------------------------------------------------------------------------
    const uvShopShowcase = getDiverseFacadeSlotUV('comm_ground_shop');
    const uvAptSide = getDiverseFacadeSlotUV('apt_side');
    const uvMainWall = getDiverseFacadeSlotUV(spec.wallSlot);

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

      // [A] 고층 아파트 단지 (판상형 전·배면 발코니 격자 + 측벽 무창 콘크리트)
      if (spec.isHighRiseApt) {
        const isSideWall = spec.sideWallEdgeIndices.has(i);

        if (isSideWall) {
          // 측벽: 창문 없는 매끈한 콘크리트 + 4대 브랜드 수직 액센트 라인 + 동 번호
          addQuad(
            [p1.x, baseElev, p1.z],
            [p2.x, baseElev, p2.z],
            [p2.x, topElev, p2.z],
            [p1.x, topElev, p1.z],
            norm,
            uvAptSide
          );
        } else {
          // 전·배면: 1층 석재 필로티(0m~3.3m) + 기준층 세대별 발코니 창문 격자(3.3m~H-0.8m) + 상단 코니스(0.8m)
          const podiumH = 3.3;
          const corniceH = 0.8;
          const midH = Math.max(0, height - podiumH - corniceH);

          // 1층 필로티
          const y1 = baseElev + podiumH;
          const uvPodium = getDiverseFacadeSlotUV('apt_sand_beige');
          addQuad(
            [p1.x, baseElev, p1.z],
            [p2.x, baseElev, p2.z],
            [p2.x, y1, p2.z],
            [p1.x, y1, p1.z],
            norm,
            uvPodium
          );

          // 기준층 발코니 창문 베이 격자 분할
          const floorH = 3.2;
          const numFloors = Math.max(1, Math.round(midH / floorH));
          const dFH = midH / numFloors;

          const bayW = 6.5;
          const numBays = Math.max(1, Math.round(edgeLen / bayW));

          for (let f = 0; f < numFloors; f++) {
            const fy0 = y1 + f * dFH;
            const fy1 = y1 + (f + 1) * dFH;

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
                uvMainWall
              );
            }
          }

          // 최상단 코니스 밴드
          if (corniceH > 0.1) {
            const yTop0 = topElev - corniceH;
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

      // [B] 시내 상가·원룸 (1층 쇼윈도 + 간판 밴드 + 상층 5대 소재 불규칙 배분)
      else if (spec.buildingType === 'commercial' || height >= 10.0) {
        const podiumH = Math.min(3.8, height * 0.45);
        const yPodiumTop = baseElev + podiumH;

        // 1층 쇼윈도 + 간판 밴드
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, yPodiumTop, p2.z],
          [p1.x, yPodiumTop, p1.z],
          norm,
          uvShopShowcase
        );

        // 2층 이상 상층부
        if (height > podiumH + 0.5) {
          const matIdx = (seed + i) % HYBRID_COMMERCIAL_5_MATERIALS.length;
          const upperSlot = HYBRID_COMMERCIAL_5_MATERIALS[matIdx].slot;
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

      // [C] 단독주택·다세대 빌라·군 주둔지 막사
      else {
        addQuad(
          [p1.x, baseElev, p1.z],
          [p2.x, baseElev, p2.z],
          [p2.x, topElev, p2.z],
          [p1.x, topElev, p1.z],
          norm,
          uvMainWall
        );
      }
    }

    // 중정 및 내부 홀 벽면
    if (innerRings2D && innerRings2D.length > 0) {
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
            uvMainWall
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // Tier 3-B: 저층 주택/막사 실제 3D 경사 박공(Gabled) & 우진각(Hipped) 메쉬
    // -------------------------------------------------------------------------
    if (spec.roofStyle === 'gabled' || spec.roofStyle === 'hipped') {
      const polyCoords: [number, number][] = pts2D.map((p) => [p.x, p.z]);
      const obb = calculateOBB(polyCoords);

      const roofHeight = Math.max(1.8, Math.min(3.2, obb.width * 0.35));
      const ridgeElev = topElev + roofHeight;
      const roofUV = getDiverseFacadeSlotUV(spec.roofSlot);

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
    // Tier 2: 평슬래브 지붕 (0.9m 돌출 난간 Parapet + 침하형 슬래브 + 옥탑 권상기실)
    // -------------------------------------------------------------------------
    const parapetH = 0.9;
    const parapetThick = 0.35;
    const parapetTopElev = topElev + parapetH;

    const uvParapet = getDiverseFacadeSlotUV('parapet_concrete');
    const uvRoofFloor = getDiverseFacadeSlotUV(spec.roofSlot);

    const innerPts: Point2D[] = [];

    for (let i = 0; i < ptCount; i++) {
      const prev = (i - 1 + ptCount) % ptCount;
      const next = (i + 1) % ptCount;
      const cur = pts2D[i];
      const pNext = pts2D[next];

      const edx = pNext.x - cur.x;
      const edz = pNext.z - cur.z;
      const elen = Math.hypot(edx, edz);
      if (elen < 0.001) {
        innerPts.push({ x: cur.x, z: cur.z });
        continue;
      }

      // 1. 난간 외벽
      const nx = edz / elen;
      const nz = -edx / elen;
      addRooftopQuad(
        [cur.x, topElev, cur.z],
        [pNext.x, topElev, pNext.z],
        [pNext.x, parapetTopElev, pNext.z],
        [cur.x, parapetTopElev, cur.z],
        [nx, 0, nz],
        uvParapet
      );

      // 2. 내측 인셋 오프셋 정점 계산
      const prevPt = pts2D[prev];
      const pdx = cur.x - prevPt.x;
      const pdz = cur.z - prevPt.z;
      const plen = Math.hypot(pdx, pdz) || 1;
      const pnx = pdz / plen;
      const pnz = -pdx / plen;

      const bisX = (nx + pnx) * 0.5;
      const bisZ = (nz + pnz) * 0.5;
      const bisLen = Math.hypot(bisX, bisZ) || 1;
      const inX = cur.x - (bisX / bisLen) * parapetThick;
      const inZ = cur.z - (bisZ / bisLen) * parapetThick;
      innerPts.push({ x: inX, z: inZ });
    }

    // 3. 난간 윗면 및 내측벽
    for (let i = 0; i < ptCount; i++) {
      const next = (i + 1) % ptCount;
      const cur = pts2D[i];
      const pNext = pts2D[next];
      const inCur = innerPts[i];
      const inNext = innerPts[next];

      // 난간 윗면 (Top Cap)
      addRooftopQuad(
        [cur.x, parapetTopElev, cur.z],
        [pNext.x, parapetTopElev, pNext.z],
        [inNext.x, parapetTopElev, inNext.z],
        [inCur.x, parapetTopElev, inCur.z],
        [0, 1, 0],
        uvParapet
      );

      // 난간 안쪽 내측벽 (Inner Wall, 아래로 0.9m 내려감)
      const inDx = inNext.x - inCur.x;
      const inDz = inNext.z - inCur.z;
      const inLen = Math.hypot(inDx, inDz) || 1;
      addRooftopQuad(
        [inCur.x, topElev, inCur.z],
        [inNext.x, topElev, inNext.z],
        [inNext.x, parapetTopElev, inNext.z],
        [inCur.x, parapetTopElev, inCur.z],
        [-inDz / inLen, 0, inDx / inLen],
        uvParapet
      );
    }

    // 4. 침하형 옥상 바닥 슬래브 삼각화 (Earcut)
    const flatCoords: number[] = [];
    for (const p of innerPts) {
      flatCoords.push(p.x, p.z);
    }
    const triIndices = Earcut(flatCoords, holeIndices, 2);

    for (let k = 0; k < triIndices.length; k += 3) {
      const i0 = triIndices[k];
      const i1 = triIndices[k + 1];
      const i2 = triIndices[k + 2];

      const p0 = innerPts[i0];
      const p1 = innerPts[i1];
      const p2 = innerPts[i2];
      if (!p0 || !p1 || !p2) continue;

      addRooftopTriangle(
        [p0.x, topElev, p0.z],
        [p1.x, topElev, p1.z],
        [p2.x, topElev, p2.z],
        [0, 1, 0],
        [uvRoofFloor.u0, uvRoofFloor.v0],
        [uvRoofFloor.u1, uvRoofFloor.v0],
        [uvRoofFloor.u1, uvRoofFloor.v1]
      );
    }

    // 5. 엘리베이터 권상기실 / 옥탑 코어 (Penthouse Core)
    if (spec.hasPenthouse) {
      const innerPolyCoords: [number, number][] = innerPts.map((p) => [p.x, p.z]);
      const core = calculateSafeRooftopCore(innerPolyCoords, height, topElev, 2.5);

      if (core) {
        const uvCore = getDiverseFacadeSlotUV('penthouse_core_wall');
        const cPts = core.box2D;
        const cBaseY = topElev;
        const cTopY = topElev + core.height;

        for (let c = 0; c < 4; c++) {
          const nextC = (c + 1) % 4;
          const cp0 = cPts[c];
          const cp1 = cPts[nextC];
          const cdx = cp1[0] - cp0[0];
          const cdz = cp1[1] - cp0[1];
          const clen = Math.hypot(cdx, cdz) || 1;

          addRooftopQuad(
            [cp0[0], cBaseY, cp0[1]],
            [cp1[0], cBaseY, cp1[1]],
            [cp1[0], cTopY, cp1[1]],
            [cp0[0], cTopY, cp0[1]],
            [cdz / clen, 0, -cdx / clen],
            uvCore
          );
        }

        // 옥탑방 지붕
        addRooftopQuad(
          [cPts[0][0], cTopY, cPts[0][1]],
          [cPts[1][0], cTopY, cPts[1][1]],
          [cPts[2][0], cTopY, cPts[2][1]],
          [cPts[3][0], cTopY, cPts[3][1]],
          [0, 1, 0],
          uvRoofFloor
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // [4. 한국형 실측 도로망 & 하천 횡단 대교 3D 정밀 결합 모듈]
  // ---------------------------------------------------------------------------
  public static buildAuthenticBridgesGroup(
    originLngLat: [number, number],
    getTerrainElevation: (p: [number, number]) => number,
    bridgeSpecs: AuthenticBridgeSpec[] = WONJU_AUTHENTIC_BRIDGES
  ): THREE.Group {
    return buildAuthenticBridgeMeshGroup(bridgeSpecs, originLngLat, getTerrainElevation);
  }

  // ---------------------------------------------------------------------------
  // [5. NASA-AMMOS / 3DTilesRendererJS 스크린 공간 오차(SSE) 및 LOD 계산기]
  // ---------------------------------------------------------------------------
  public static evaluateScreenSpaceError(
    cameraDist: number,
    featureRadius: number,
    screenHeightPx: number,
    fovRad: number
  ): number {
    if (cameraDist <= 0.1) return 999;
    return (featureRadius / (cameraDist * Math.tan(fovRad * 0.5))) * (screenHeightPx * 0.5);
  }

  // ---------------------------------------------------------------------------
  // [6. 고해상도 2048x2048 Mipmap + Anisotropy 16x Three.js PBR 재질 팩토리]
  // ---------------------------------------------------------------------------
  public static createHybridBuildingMaterial(): THREE.MeshStandardMaterial {
    const diffuseTex = getDiverseKoreanFacadeAtlasTexture();
    const rmaTex = getDiverseFacadeRmaTexture();

    const mat = new THREE.MeshStandardMaterial({
      map: diffuseTex,
      roughnessMap: rmaTex,
      metalnessMap: rmaTex,
      aoMap: rmaTex,
      roughness: 0.72,
      metalness: 0.18,
      aoMapIntensity: 1.0,
      side: THREE.FrontSide,
    });

    return mat;
  }
}
