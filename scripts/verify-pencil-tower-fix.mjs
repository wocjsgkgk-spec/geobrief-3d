import { classifyBuildingWithVendor, calculatePolygonMetrics } from '../src/lib/vendor/buildingClassifier.ts';

console.log('=== [1단계 검증] 세장비 제한 및 연필 기둥 해체 테스트 ===\n');

// 1. 소형 주택 (area < 220㎡), 아파트 POI 근처 좌표
const smallHouseCoords = [
  [127.9580, 37.3250],
  [127.9581, 37.3250],
  [127.9581, 37.3251],
  [127.9580, 37.3251],
  [127.9580, 37.3250],
];
const smallHouseMetrics = calculatePolygonMetrics(smallHouseCoords);
const smallHouseClassified = classifyBuildingWithVendor(smallHouseCoords, {
  name: '단구동 주택',
  building: 'house',
});

console.log('1. 소형 필지 건물 (area < 220㎡):');
console.log(`   - 면적: ${smallHouseClassified.areaSqm.toFixed(1)}㎡ (기대값: < 220㎡)`);
console.log(`   - 높이: ${smallHouseClassified.height.toFixed(1)}m (기대값: 6.5m ~ 11.5m)`);
console.log(`   - 유형: ${smallHouseClassified.typeName} (${smallHouseClassified.type})`);
console.log(`   - 외벽 슬롯: ${smallHouseClassified.atlasWallSlot}`);
console.log(`   - 검증: ${smallHouseClassified.height >= 6.5 && smallHouseClassified.height <= 11.5 && smallHouseClassified.type === 'residential' ? 'PASS ✅' : 'FAIL ❌'}\n`);

// 2. 좁고 긴 소형 건물 (세장비 3.5배 초과 위험군, 면적 150㎡, minWidth 6m)
const slenderHouseCoords = [
  [127.9500, 37.3300],
  [127.95006, 37.3300], // 약 5.3m
  [127.95006, 37.33025], // 약 27.6m
  [127.9500, 37.33025],
  [127.9500, 37.3300],
];
const slenderMetrics = calculatePolygonMetrics(slenderHouseCoords);
const slenderClassified = classifyBuildingWithVendor(slenderHouseCoords, {
  name: '원룸 빌라',
  // 대장에 비정상적으로 50m가 적혀있거나 오분류된 상황 시뮬레이션
  height: 55.0,
});

console.log('2. 세장비 초과 위험 소형 건물:');
console.log(`   - 면적: ${slenderClassified.areaSqm.toFixed(1)}㎡, 단축 폭: ${slenderMetrics.minWidth.toFixed(1)}m`);
console.log(`   - 보정 전 입력 높이: 55.0m -> 보정 후 높이: ${slenderClassified.height.toFixed(1)}m (기대값: <= 15.0m)`);
console.log(`   - 검증: ${slenderClassified.height <= 15.0 ? 'PASS ✅' : 'FAIL ❌'}\n`);

// 3. 중형 시가지 건물 (220㎡ <= area < 550㎡, 상가/원룸)
const mediumShopCoords = [
  [127.9520, 37.3320],
  [127.95215, 37.3320], // ~13m
  [127.95215, 37.33225], // ~27m
  [127.9520, 37.33225],
  [127.9520, 37.3320],
];
const medClassified = classifyBuildingWithVendor(mediumShopCoords, {
  name: '단구동 상가빌딩',
  usageType: 'commercial',
});

console.log('3. 중형 시가지 건물 (220㎡ <= area < 550㎡):');
console.log(`   - 면적: ${medClassified.areaSqm.toFixed(1)}㎡`);
console.log(`   - 높이: ${medClassified.height.toFixed(1)}m (기대값: 11.0m ~ 18.0m)`);
console.log(`   - 층수: ${medClassified.floors}층 (기대값: 3층 ~ 5층)`);
console.log(`   - 검증: ${medClassified.height >= 11.0 && medClassified.height <= 18.0 ? 'PASS ✅' : 'FAIL ❌'}\n`);

// 4. 진짜 판상형 아파트 동 (area >= 450㎡, aspectRatio >= 2.2)
const trueAptCoords = [
  [127.9510, 37.3350],
  [127.95115, 37.3350], // ~13m
  [127.95115, 37.33560], // ~66m (aspectRatio ~ 5.0)
  [127.9510, 37.33560],
  [127.9510, 37.3350],
];
const aptClassified = classifyBuildingWithVendor(trueAptCoords, {
  name: '단구아이파크 101동',
  mainPurpsCdNm: '공동주택(아파트)',
});

console.log('4. 진짜 고층 아파트 동 (area >= 450㎡, 판상형):');
console.log(`   - 면적: ${aptClassified.areaSqm.toFixed(1)}㎡, 종횡비: ${aptClassified.aspectRatio.toFixed(1)}`);
console.log(`   - 높이: ${aptClassified.height.toFixed(1)}m (기대값: 42m ~ 72m)`);
console.log(`   - 층수: ${aptClassified.floors}층 (기대값: 14층 ~ 24층)`);
console.log(`   - 유형: ${aptClassified.typeName}`);
console.log(`   - 검증: ${aptClassified.height >= 42.0 && aptClassified.height <= 72.0 && aptClassified.type === 'apartment' ? 'PASS ✅' : 'FAIL ❌'}\n`);

// 5. 단지 내부 부속 소형 건물 (area < 400㎡)
const auxBuildingCoords = [
  [127.9512, 37.3351],
  [127.9513, 37.3351], // ~8.8m
  [127.9513, 37.3352], // ~11m (area ~ 95㎡)
  [127.9512, 37.3352],
  [127.9512, 37.3351],
];
const auxClassified = classifyBuildingWithVendor(auxBuildingCoords, {
  name: '단지 상가동/관리실',
  mainPurpsCdNm: '제1종근린생활시설',
});

console.log('5. 아파트 단지 내 부속 소형 건물 (area < 400㎡):');
console.log(`   - 면적: ${auxClassified.areaSqm.toFixed(1)}㎡`);
console.log(`   - 높이: ${auxClassified.height.toFixed(1)}m (기대값: 4.0m ~ 9.0m)`);
console.log(`   - 검증: ${auxClassified.height >= 4.0 && auxClassified.height <= 9.0 ? 'PASS ✅' : 'FAIL ❌'}\n`);

const allPass =
  smallHouseClassified.height <= 11.5 &&
  slenderClassified.height <= 15.0 &&
  medClassified.height >= 11.0 && medClassified.height <= 18.0 &&
  aptClassified.height >= 42.0 && aptClassified.height <= 72.0 &&
  auxClassified.height <= 9.0;

console.log('=== 전체 검증 결과 ===');
console.log(allPass ? '모든 규칙 검증 100% 통과! ✅' : '일부 검증 실패 ❌');
process.exit(allPass ? 0 : 1);
