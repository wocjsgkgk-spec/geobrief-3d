/**
 * scripts/verify-hybrid-vworld-renderer.mjs
 *
 * [GeoBrief 3D 2단계] 브이월드 실사 메쉬 + 고해상도 절차적 아키텍처 하이브리드 렌더러 검증 스크립트
 */

import assert from 'node:assert';
import {
  HybridVworldRenderer,
  HYBRID_APT_BRAND_BANDS,
  HYBRID_COMMERCIAL_5_MATERIALS,
  HYBRID_AERIAL_ROOF_DISTRIBUTION,
} from '../src/lib/vendor/hybridVworldRenderer.ts';

console.log('=== [1. 하이브리드 렌더러 상수 및 테이블 무결성 검증] ===');
assert.strictEqual(HYBRID_APT_BRAND_BANDS.length, 4, '4대 아파트 브랜드 수직 도색 밴드 정의 확인');
assert.strictEqual(HYBRID_COMMERCIAL_5_MATERIALS.length, 5, '상가 5대 외벽 소재 정의 확인');
assert.strictEqual(HYBRID_AERIAL_ROOF_DISTRIBUTION.length, 3, '항공뷰 지붕 3대 색상 비율 정의 확인');
console.log('✅ 1단계 테이블 검증 성공');

console.log('=== [2. Tier 1: 국토부 건축물대장 및 브이월드 실측 속성 정밀 추출 검증] ===');
const mockFeatureProps = {
  bd_mgt_sn: '4213010100100010001',
  grndFlrCnt: 22,
  strctCdNm: '철근콘크리트구조',
  roofCdNm: '철근콘크리트 평슬래브',
  mainPurpsCdNm: '공동주택(아파트)',
  buld_nm: '원주혁신도시 푸르지오 101동',
  isRealMeasured: true,
};

const extracted = HybridVworldRenderer.extractMasterData(mockFeatureProps);
assert.strictEqual(extracted.grndFlrCnt, 22, '지상 22층 정밀 추출');
assert.strictEqual(extracted.height, 22 * 3.3, '22층 * 3.3m = 72.6m 실측 높이 계산');
assert.strictEqual(extracted.strctCdNm, '철근콘크리트구조');
assert.strictEqual(extracted.roofCdNm, '철근콘크리트 평슬래브');
assert.strictEqual(extracted.mainPurpsCdNm, '공동주택(아파트)');
assert.strictEqual(extracted.isRegistered, true);
console.log('✅ 2단계 Tier 1 속성 추출 검증 성공:', extracted);

console.log('=== [3. 3중 레이어 하이브리드 스펙 결정기 (Hybrid Tier Resolver) 검증] ===');
// 아파트 폴리곤 (50m x 15m 판상형)
const aptPts = [
  { x: 0, z: 0 },
  { x: 50, z: 0 },
  { x: 50, z: 15 },
  { x: 0, z: 15 },
];
const aptEdges = [50, 15, 50, 15];

const aptSpec = HybridVworldRenderer.resolveHybridSpec(mockFeatureProps, aptPts, aptEdges, 42);
assert.strictEqual(aptSpec.isHighRiseApt, true, '고층 아파트 판정');
assert.strictEqual(aptSpec.roofStyle, 'flat_parapet', '평슬래브 파라펫 지붕');
assert.strictEqual(aptSpec.sideWallEdgeIndices.size, 2, '양 끝단 2개 단변 측벽 추출');
assert.ok(aptSpec.sideWallEdgeIndices.has(1) && aptSpec.sideWallEdgeIndices.has(3), '15m 변 2개가 측벽으로 지정됨');
console.log('✅ 3-A단계 고층 아파트 스펙 판정 성공:', {
  tier: aptSpec.tier,
  isHighRiseApt: aptSpec.isHighRiseApt,
  sideWalls: Array.from(aptSpec.sideWallEdgeIndices),
  roofStyle: aptSpec.roofStyle,
});

// 단독주택/막사 (12m x 8m, 1층)
const houseProps = {
  grndFlrCnt: 1,
  roofCdNm: '기와지붕',
  mainPurpsCdNm: '단독주택',
};
const housePts = [
  { x: 0, z: 0 },
  { x: 12, z: 0 },
  { x: 12, z: 8 },
  { x: 0, z: 8 },
];
const houseEdges = [12, 8, 12, 8];
const houseSpec = HybridVworldRenderer.resolveHybridSpec(houseProps, housePts, houseEdges, 7);
assert.strictEqual(houseSpec.tier, 'tier3_landmark_pitched', 'Tier 3 경사 지붕 판정');
assert.ok(houseSpec.roofStyle === 'gabled' || houseSpec.roofStyle === 'hipped', '박공 또는 우진각 지붕');
console.log('✅ 3-B단계 저층 주택/막사 경사지붕 판정 성공:', {
  tier: houseSpec.tier,
  roofStyle: houseSpec.roofStyle,
  roofSlot: houseSpec.roofSlot,
});

console.log('=== [4. 단일 버퍼 지오메트리 렌더링 파이프라인 무결성 검증] ===');
let quadCount = 0;
let triCount = 0;
let rooftopQuadCount = 0;
let rooftopTriCount = 0;

const addQuad = () => { quadCount++; };
const addTriangle = () => { triCount++; };
const addRooftopQuad = () => { rooftopQuadCount++; };
const addRooftopTriangle = () => { rooftopTriCount++; };

// 아파트 메쉬 빌드
HybridVworldRenderer.buildHybridBuilding({
  pts2D: aptPts,
  baseElev: 100,
  seed: 42,
  edgeLens: aptEdges,
  maxEdgeLen: 50,
  minEdgeLen: 15,
  featProps: mockFeatureProps,
  addQuad,
  addTriangle,
  addRooftopQuad,
  addRooftopTriangle,
});

assert.ok(quadCount > 0, `아파트 외벽 쿼드 생성 확인 (${quadCount}개)`);
assert.ok(rooftopQuadCount > 0, `아파트 옥상 난간/옥탑 쿼드 생성 확인 (${rooftopQuadCount}개)`);
assert.ok(rooftopTriCount > 0, `아파트 옥상 슬래브 삼각 메쉬 생성 확인 (${rooftopTriCount}개)`);
console.log(`✅ 4-A단계 아파트 메쉬 생성 성공: 외벽 Quads=${quadCount}, 지붕 Quads=${rooftopQuadCount}, 지붕 Tris=${rooftopTriCount}`);

// 저층 박공지붕 메쉬 빌드
let gabledTriCount = 0;
let gabledQuadCount = 0;
HybridVworldRenderer.buildHybridBuilding({
  pts2D: housePts,
  baseElev: 100,
  seed: 7,
  edgeLens: houseEdges,
  maxEdgeLen: 12,
  minEdgeLen: 8,
  featProps: houseProps,
  addQuad: () => {},
  addTriangle: () => {},
  addRooftopQuad: () => { gabledQuadCount++; },
  addRooftopTriangle: () => { gabledTriCount++; },
});
assert.ok(gabledTriCount > 0 || gabledQuadCount > 0, '박공/우진각 지붕 메쉬 생성 확인');
console.log(`✅ 4-B단계 3D 경사 박공지붕 메쉬 생성 성공: Slopes Quads=${gabledQuadCount}, Gable Tris=${gabledTriCount}`);

console.log('=== [5. NASA-AMMOS / 3DTilesRendererJS SSE 계산기 검증] ===');
const sseNear = HybridVworldRenderer.evaluateScreenSpaceError(50, 20, 1080, (60 * Math.PI) / 180);
const sseFar = HybridVworldRenderer.evaluateScreenSpaceError(1500, 20, 1080, (60 * Math.PI) / 180);
assert.ok(sseNear > sseFar, '근거리 SSE가 원거리 SSE보다 큼');
console.log(`✅ 5단계 SSE 계산 검증 성공: SSE(50m)=${sseNear.toFixed(1)}px, SSE(1500m)=${sseFar.toFixed(1)}px`);

console.log('\n🎉 ALL HYBRID VWORLD RENDERER TESTS PASSED WITH 100% SUCCESS!');
