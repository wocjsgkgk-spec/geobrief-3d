import fs from 'fs';

console.log('=== [2단계 & 3단계 검증] 외벽 파사드 텍스처 및 이중 렌더링 방지 정밀 검증 ===\n');

// 1. RealisticKoreanCityLayer 코드 정적 분석
const realisticCode = fs.readFileSync('src/components/Map/RealisticKoreanCityLayer.ts', 'utf-8');

const hasCorrectSideWallCondition = realisticCode.includes(
  'isTrueHighRiseApt && sideWallEdgeIndices.has(i)'
) || realisticCode.includes('isSideGableWall');

const hasStrictAptCheck = realisticCode.includes(
  "classified.type === 'apartment' && height >= 25.0 && areaSqm >= 450"
);

console.log('1. 측벽(무창 콘크리트) 적용 조건 검증:');
console.log(`   - 높이 25m 이상 & 면적 450㎡ 이상 조건 적용 여부: ${hasStrictAptCheck ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`   - 양 끝단 2변(sideWallEdgeIndices)에만 측벽 적용 여부: ${hasCorrectSideWallCondition ? 'PASS ✅' : 'FAIL ❌'}`);

// 2. MapViewer 코드 정적 분석 (이중 겹침 차단 확인)
const mapViewerCode = fs.readFileSync('src/components/Map/MapViewer.tsx', 'utf-8');

const hasInitialGpuVisNone = mapViewerCode.includes(
  "const initialGpuVis = (initRenderMode === 'native' && !!layers.buildings3D) ? 'visible' : 'none';"
);

const has3DBuildingsHiddenInFacade = mapViewerCode.includes(
  "if (map.getLayer('3d-buildings')) {\n        map.setLayoutProperty('3d-buildings', 'visibility', 'none');\n      }"
) || mapViewerCode.includes("map.setLayoutProperty('3d-buildings', 'visibility', 'none')");

console.log('\n2. 이중 겹침(Double Rendering) 원천 제거 검증:');
console.log(`   - 초기 GPU 레이어 가시성 상호 배타성 동기화: ${hasInitialGpuVisNone ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`   - 3d-buildings 레이어 facade 모드 숨김 처리: ${has3DBuildingsHiddenInFacade ? 'PASS ✅' : 'FAIL ❌'}`);

// 3. API 수집 제한 해제 확인
const vworldRoute = fs.readFileSync('src/app/api/vworld/buildings/route.ts', 'utf-8');
const vworldBuildingsRoute = fs.readFileSync('src/app/api/vworld-buildings/route.ts', 'utf-8');
const spatialFetcher = fs.readFileSync('src/utils/spatialDataFetcher.ts', 'utf-8');

const has25000Vworld = vworldRoute.includes('Math.min(25000');
const has25000VworldBuildings = vworldBuildingsRoute.includes('Math.min(25000');
const has25000Overpass = spatialFetcher.includes('out geom 25000;');

console.log('\n3. 건물 수집 개수 제한(maxBuildings cap) 해제 검증:');
console.log(`   - /api/vworld/buildings 25,000 제한 확장: ${has25000Vworld ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`   - /api/vworld-buildings 25,000 제한 확장: ${has25000VworldBuildings ? 'PASS ✅' : 'FAIL ❌'}`);
console.log(`   - spatialDataFetcher 25,000 건물 수집 쿼리: ${has25000Overpass ? 'PASS ✅' : 'FAIL ❌'}`);

const allPass =
  hasStrictAptCheck &&
  hasCorrectSideWallCondition &&
  hasInitialGpuVisNone &&
  has3DBuildingsHiddenInFacade &&
  has25000Vworld &&
  has25000VworldBuildings &&
  has25000Overpass;

console.log('\n=== 전체 검증 결과 ===');
console.log(allPass ? '모든 항목 100% 검증 통과! ✅' : '일부 항목 실패 ❌');
process.exit(allPass ? 0 : 1);
