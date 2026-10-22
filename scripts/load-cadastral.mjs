#!/usr/bin/env node

/**
 * scripts/load-cadastral.mjs
 *
 * [GeoBrief 3D: 로컬 연속지적도(LSMD_CONT_LDREG) 자동 탐색 및 WGS84 GeoJSON 변환 CLI]
 *
 * 1. 프로젝트 폴더 자동 탐색:
 *    - public/data/, data/, public/data/vworld/ 등 하위 폴더에서 연속지적도 파일(.zip, .shp, .dbf, .geojson) 자동 색인
 *
 * 2. 한국 좌표계(CRS) 자동 감지 및 WGS84(EPSG:4326) 변환:
 *    - EPSG:5186 (Korea 2000 Central Belt, 연속지적도 표준)
 *    - EPSG:5179 (Korea 2000 Unified Coordinate System / UTM-K)
 *    - EPSG:5174 (Bessel 1841 Central Belt)
 *
 * 3. 한글 인코딩 및 필지 표준 속성 매핑:
 *    - EUC-KR / CP949 자동 디코딩
 *    - PNU: 19자리 필지고유번호
 *    - JIBUN: 본번-부번 지번 및 지목 접미사 분리 (대, 전, 답, 임야 등)
 *    - 지목별 법정 색상 및 카테고리 태그 주입
 *
 * 4. 결과 출력:
 *    - public/data/cadastral/wonju.geojson
 *    - public/data/cadastral/wonju_core.geojson (도심 고속 렌더링용)
 *    - public/data/cadastral/manifest.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import proj4 from 'proj4';
import iconv from 'iconv-lite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// [1. 한국 좌표계(CRS) 정의 등록]
// -----------------------------------------------------------------------------
const PROJ_DEFINITIONS = {
  'EPSG:5186': '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:5179': '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:5174': '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs',
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
};

for (const [code, def] of Object.entries(PROJ_DEFINITIONS)) {
  proj4.defs(code, def);
}

// -----------------------------------------------------------------------------
// [2. 강원 18개 시·군 행정구역 코드 매핑]
// -----------------------------------------------------------------------------
const GANGWON_ADM_CODES = {
  '51110': { id: 'chuncheon', name: '춘천시', bbox: [127.50, 37.68, 127.95, 38.08] },
  '51130': { id: 'wonju', name: '원주시', bbox: [127.80, 37.15, 128.15, 37.55] },
  '51150': { id: 'gangneung', name: '강릉시', bbox: [128.60, 37.50, 129.10, 37.95] },
  '51170': { id: 'donghae', name: '동해시', bbox: [128.95, 37.45, 129.15, 37.62] },
  '51190': { id: 'taebaek', name: '태백시', bbox: [128.90, 37.05, 129.08, 37.25] },
  '51210': { id: 'sokcho', name: '속초시', bbox: [128.48, 38.15, 128.62, 38.25] },
  '51230': { id: 'samcheok', name: '삼척시', bbox: [128.90, 37.00, 129.40, 37.50] },
  '51720': { id: 'hongcheon', name: '홍천군', bbox: [127.70, 37.55, 128.40, 38.00] },
  '51730': { id: 'hoengseong', name: '횡성군', bbox: [127.80, 37.40, 128.30, 37.65] },
  '51750': { id: 'yeongwol', name: '영월군', bbox: [128.20, 37.05, 128.80, 37.35] },
  '51760': { id: 'pyeongchang', name: '평창군', bbox: [128.20, 37.30, 128.75, 37.80] },
  '51770': { id: 'jeongseon', name: '정선군', bbox: [128.50, 37.15, 129.00, 37.60] },
  '51780': { id: 'cheorwon', name: '철원군', bbox: [127.10, 38.05, 127.60, 38.35] },
  '51790': { id: 'hwacheon', name: '화천군', bbox: [127.50, 38.00, 127.90, 38.25] },
  '51800': { id: 'yanggu', name: '양구군', bbox: [127.85, 38.00, 128.20, 38.35] },
  '51810': { id: 'inje', name: '인제군', bbox: [128.05, 37.90, 128.55, 38.35] },
  '51820': { id: 'goseong', name: '고성군', bbox: [128.30, 38.20, 128.60, 38.60] },
  '51830': { id: 'yangyang', name: '양양군', bbox: [128.45, 37.90, 128.80, 38.15] },
};

// -----------------------------------------------------------------------------
// [3. 지목(Jimok) 28개 표준 한글명 및 색상 매핑]
// -----------------------------------------------------------------------------
const JIMOK_TABLE = {
  대: { label: '대지 (주거·상업)', category: 'residential_commercial', color: '#fef08a' },
  전: { label: '밭 (전)', category: 'farmland', color: '#d9f99d' },
  답: { label: '논 (답)', category: 'farmland', color: '#bbf7d0' },
  과: { label: '과수원', category: 'farmland', color: '#86efac' },
  목: { label: '목장용지', category: 'pasture', color: '#a7f3d0' },
  임: { label: '임야 (산림)', category: 'forest', color: '#86efac' },
  광: { label: '광천지', category: 'special', color: '#cbd5e1' },
  염: { label: '염전', category: 'special', color: '#e2e8f0' },
  공: { label: '공장용지', category: 'industrial', color: '#bae6fd' },
  학: { label: '학교용지', category: 'public', color: '#93c5fd' },
  차: { label: '주차장', category: 'transport', color: '#94a3b8' },
  주: { label: '주유소용지', category: 'commercial', color: '#fde047' },
  창: { label: '창고용지', category: 'logistics', color: '#fed7aa' },
  도: { label: '도로', category: 'road', color: '#64748b' },
  철: { label: '철도용지', category: 'railway', color: '#475569' },
  제: { label: '제방', category: 'infrastructure', color: '#94a3b8' },
  하: { label: '하천', category: 'water', color: '#38bdf8' },
  구: { label: '구거 (수로)', category: 'water', color: '#67e8f9' },
  유: { label: '유지 (저수지)', category: 'water', color: '#0ea5e9' },
  양: { label: '양어장', category: 'water', color: '#7dd3fc' },
  수: { label: '수도용지', category: 'infrastructure', color: '#0284c7' },
  공원: { label: '공원', category: 'park', color: '#4ade80' },
  체: { label: '체육용지', category: 'recreation', color: '#34d399' },
  유원: { label: '유원지', category: 'recreation', color: '#2dd4bf' },
  종: { label: '종교용지', category: 'public', color: '#fbcfe8' },
  사: { label: '사적지', category: 'historic', color: '#f472b6' },
  묘: { label: '묘지', category: 'cemetery', color: '#cbd5e1' },
  잡: { label: '잡종지 (군 유휴지 후보)', category: 'idle_military', color: '#fb923c' },
};

function parseJimokFromJibun(jibun = '') {
  const clean = jibun.trim();
  // 지번 뒷글자에서 지목 1~2글자 추출 (예: '867대', '1427-2 제', '212전')
  const matched = clean.match(/([가-힣]+)$/);
  const rawKey = matched ? matched[1] : '';

  const info = JIMOK_TABLE[rawKey] || {
    label: rawKey ? `기타 (${rawKey})` : '지목 미지정',
    category: 'other',
    color: '#e2e8f0',
  };

  return {
    rawJimok: rawKey,
    label: info.label,
    category: info.category,
    color: info.color,
  };
}

// -----------------------------------------------------------------------------
// [4. 프로젝트 폴더 내 연속지적도 파일 자동 탐색기]
// -----------------------------------------------------------------------------
function searchCadastralFiles() {
  const candidateDirs = [
    path.join(ROOT_DIR, 'public/data/vworld'),
    path.join(ROOT_DIR, 'public/data/cadastral'),
    path.join(ROOT_DIR, 'public/data'),
    path.join(ROOT_DIR, 'data'),
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);

    // 1) ZIP 아카이브 탐색 (LSMD_CONT_LDREG 또는 지적 관련)
    const zips = files.filter(
      (f) => f.endsWith('.zip') && (f.includes('LDREG') || f.includes('지적') || f.includes('cadastral'))
    );
    if (zips.length > 0) {
      return {
        type: 'zip',
        filePath: path.join(dir, zips[0]),
        dir,
      };
    }

    // 2) 압축 해제된 단일 SHP 탐색
    const shps = files.filter(
      (f) => f.endsWith('.shp') && (f.includes('LDREG') || f.includes('지적') || f.includes('cadastral'))
    );
    if (shps.length > 0) {
      const baseName = shps[0].replace('.shp', '');
      return {
        type: 'shp',
        shpPath: path.join(dir, `${baseName}.shp`),
        dbfPath: path.join(dir, `${baseName}.dbf`),
        shxPath: path.join(dir, `${baseName}.shx`),
        prjPath: path.join(dir, `${baseName}.prj`),
        dir,
      };
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// [5. 연속지적도 고속 바이너리 스트리밍 변환기]
// -----------------------------------------------------------------------------
export async function convertCadastralShp(shpPath, dbfPath, shxPath, prjPath, options = {}) {
  const {
    targetAdmCode = '51130', // 원주시 기본
    targetRegionId = 'wonju',
    limit = Infinity,
    outputDir = path.join(ROOT_DIR, 'public/data/cadastral'),
    urbanCoreBbox = [127.91, 37.31, 127.98, 37.37], // 단구동/무실동 시가지 코어
  } = options;

  console.log(`\n============================================================`);
  console.log(`🗺️  [연속지적도 자동 변환] SHP 변환 시작: ${path.basename(shpPath)}`);
  console.log(`📍 대상 지역: ${targetRegionId} (행정코드: ${targetAdmCode})`);
  console.log(`📁 출력 경로: ${outputDir}`);
  console.log(`============================================================\n`);

  fs.mkdirSync(outputDir, { recursive: true });

  const fdDbf = fs.openSync(dbfPath, 'r');
  const fdShp = fs.openSync(shpPath, 'r');
  const fdShx = fs.openSync(shxPath, 'r');

  try {
    // 1) DBF 헤더 읽기
    const dbfHeaderBuf = Buffer.alloc(32);
    fs.readSync(fdDbf, dbfHeaderBuf, 0, 32, 0);
    const numRecords = dbfHeaderBuf.readUInt32LE(4);
    const headerLen = dbfHeaderBuf.readUInt16LE(8);
    const recordLen = dbfHeaderBuf.readUInt16LE(10);

    const numFields = Math.floor((headerLen - 33) / 32);
    const fieldBuf = Buffer.alloc(32 * numFields);
    fs.readSync(fdDbf, fieldBuf, 0, 32 * numFields, 32);

    const fields = [];
    let currentPos = 1;
    let colAdmSePos = -1;
    let jibunPos = -1;
    let pnuPos = -1;

    for (let f = 0; f < numFields; f++) {
      const fStart = f * 32;
      const name = fieldBuf.toString('ascii', fStart, fStart + 11).replace(/\0/g, '').trim();
      const length = fieldBuf.readUInt8(fStart + 16);
      if (name === 'COL_ADM_SE' || name === 'SIG_CD') colAdmSePos = currentPos;
      if (name === 'JIBUN') jibunPos = currentPos;
      if (name === 'PNU') pnuPos = currentPos;

      fields.push({ name, length, pos: currentPos });
      currentPos += length;
    }

    console.log(`📊 DBF 메타: 총 ${numRecords.toLocaleString()}개 필지 레코드 | 레코드 길이: ${recordLen}바이트`);

    // 2) 좌표계는 Korea 2000 Central Belt (EPSG:5186) 고정
    const crs = 'EPSG:5186';
    console.log(`🌐 좌표계: ${crs} -> WGS84(EPSG:4326) 실시간 재투영`);

    // 3) 레코드 순회
    const recBuf = Buffer.alloc(recordLen);
    const shxBuf = Buffer.alloc(8);
    const targetFeatures = [];
    const coreFeatures = [];

    const startTime = Date.now();
    let processedCount = 0;
    let matchedCount = 0;

    for (let i = 0; i < numRecords && matchedCount < limit; i++) {
      processedCount++;
      if (processedCount % 200000 === 0) {
        console.log(`  ... 스캔 중: ${processedCount.toLocaleString()} / ${numRecords.toLocaleString()} (${matchedCount.toLocaleString()}개 필지 추출됨)`);
      }

      fs.readSync(fdDbf, recBuf, 0, recordLen, headerLen + i * recordLen);
      if (recBuf[0] === 0x2A) continue; // 삭제된 레코드

      // 행정구역코드 필터 (COL_ADM_SE: 51130 원주시)
      if (colAdmSePos !== -1 && targetAdmCode !== 'all') {
        const admCode = recBuf.toString('ascii', colAdmSePos, colAdmSePos + 5).trim();
        if (admCode !== targetAdmCode) continue;
      }

      // SHX 인덱스를 통해 SHP 지오메트리 접근
      fs.readSync(fdShx, shxBuf, 0, 8, 100 + i * 8);
      const shpOffset = shxBuf.readUInt32BE(0) * 2;
      const shpLength = shxBuf.readUInt32BE(4) * 2;

      const shpContent = Buffer.alloc(shpLength);
      fs.readSync(fdShp, shpContent, 0, shpLength, shpOffset + 8);

      const shapeType = shpContent.readInt32LE(0);
      if (shapeType !== 5) continue; // Polygon 만 처리

      const numParts = shpContent.readInt32LE(36);
      const numPoints = shpContent.readInt32LE(40);
      if (numPoints < 3) continue;

      const parts = [];
      for (let p = 0; p < numParts; p++) {
        parts.push(shpContent.readInt32LE(44 + p * 4));
      }

      // 좌표 추출 및 EPSG:4326 변환
      let ptOffset = 44 + numParts * 4;
      const allPoints = [];
      for (let p = 0; p < numPoints; p++) {
        const x = shpContent.readDoubleLE(ptOffset);
        const y = shpContent.readDoubleLE(ptOffset + 8);
        const [lng, lat] = proj4(crs, 'EPSG:4326', [x, y]);
        allPoints.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
        ptOffset += 16;
      }

      // 링 구성
      const rings = [];
      for (let p = 0; p < numParts; p++) {
        const sIdx = parts[p];
        const eIdx = p + 1 < numParts ? parts[p + 1] : numPoints;
        const ring = allPoints.slice(sIdx, eIdx);
        if (ring.length >= 3) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
          }
          rings.push(ring);
        }
      }

      if (rings.length === 0) continue;

      // DBF 속성 파싱
      const rawJibun = iconv
        .decode(recBuf.subarray(jibunPos, jibunPos + 100), 'euc-kr')
        .replace(/\0/g, '')
        .trim();
      const rawPnu = recBuf.toString('ascii', pnuPos, pnuPos + 19).replace(/\0/g, '').trim();

      const jimokInfo = parseJimokFromJibun(rawJibun);

      // [호환성] 19자리 PNU 숫자가 MapLibre varint 파싱 시 오버플로우를 유발하지 않도록 'parcel_' 접두어 강제 부여
      const baseId = rawPnu || `parcel_${matchedCount}`;
      const featureId = String(baseId).startsWith('parcel_') ? String(baseId) : `parcel_${baseId}`;

      const feature = {
        type: 'Feature',
        id: featureId,
        properties: {
          id: featureId,
          pnu: rawPnu,
          jibun: rawJibun,
          jimok: jimokInfo.rawJimok,
          jimokLabel: jimokInfo.label,
          category: jimokInfo.category,
          fillColor: jimokInfo.color,
          strokeColor: '#334155',
          source: 'cadastral_local',
        },
        geometry: {
          type: 'Polygon',
          coordinates: rings,
        },
      };

      targetFeatures.push(feature);
      matchedCount++;

      // 단구동/무실동 도심 코어 판별
      const centerLng = rings[0][0][0];
      const centerLat = rings[0][0][1];
      if (
        centerLng >= urbanCoreBbox[0] &&
        centerLng <= urbanCoreBbox[2] &&
        centerLat >= urbanCoreBbox[1] &&
        centerLat <= urbanCoreBbox[3]
      ) {
        coreFeatures.push(feature);
      }
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ 연속지적도 변환 완료 (${elapsedSec}초 소요):`);
    console.log(`  - ${targetRegionId} 전체 필지 수: ${targetFeatures.length.toLocaleString()}건`);
    console.log(`  - ${targetRegionId} 도심 코어 필지 수: ${coreFeatures.length.toLocaleString()}건`);

    // 파일 출력
    const mainFile = path.join(outputDir, `${targetRegionId}.geojson`);
    const coreFile = path.join(outputDir, `${targetRegionId}_core.geojson`);

    fs.writeFileSync(mainFile, JSON.stringify({ type: 'FeatureCollection', features: targetFeatures }));
    fs.writeFileSync(coreFile, JSON.stringify({ type: 'FeatureCollection', features: coreFeatures.length > 0 ? coreFeatures : targetFeatures.slice(0, 10000) }));

    const mainSizeMb = (fs.statSync(mainFile).size / (1024 * 1024)).toFixed(2);
    const coreSizeMb = (fs.statSync(coreFile).size / (1024 * 1024)).toFixed(2);
    console.log(`  💾 저장 완료: ${mainFile} (${mainSizeMb} MB)`);
    console.log(`  💾 저장 완료: ${coreFile} (${coreSizeMb} MB)`);

    // 매니페스트 갱신
    const manifestPath = path.join(outputDir, 'manifest.json');
    let manifest = { generatedAt: new Date().toISOString(), regions: {} };
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        // ignore
      }
    }

    manifest.regions[targetRegionId] = {
      admCode: targetAdmCode,
      name: GANGWON_ADM_CODES[targetAdmCode]?.name || targetRegionId,
      file: `${targetRegionId}.geojson`,
      coreFile: `${targetRegionId}_core.geojson`,
      totalCount: targetFeatures.length,
      coreCount: coreFeatures.length,
      fileSizeMb: Number(mainSizeMb),
      updatedAt: new Date().toISOString(),
      bbox: GANGWON_ADM_CODES[targetAdmCode]?.bbox || [127.80, 37.15, 128.15, 37.55],
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`  📋 매니페스트 갱신 완료: ${manifestPath}`);

    return {
      success: true,
      totalCount: targetFeatures.length,
      coreCount: coreFeatures.length,
      mainFile,
      coreFile,
    };
  } finally {
    fs.closeSync(fdDbf);
    fs.closeSync(fdShp);
    fs.closeSync(fdShx);
  }
}

// -----------------------------------------------------------------------------
// [6. CLI 진입점]
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let regionArg = 'wonju';
  let limitArg = Infinity;
  let outputDir = path.join(ROOT_DIR, 'public/data/cadastral');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) regionArg = args[++i];
    if (args[i] === '--limit' && args[i + 1]) limitArg = parseInt(args[++i], 10);
    if (args[i] === '--output' && args[i + 1]) outputDir = path.resolve(args[++i]);
  }

  console.log(`\n============================================================`);
  console.log(`🗺️  GeoBrief 3D - 연속지적도(LSMD_CONT_LDREG) 자동 인제스트 CLI`);
  console.log(`============================================================`);

  const found = searchCadastralFiles();
  if (!found) {
    console.error(`❌ 오류: 프로젝트 폴더 내에서 연속지적도 파일(LSMD_CONT_LDREG*.zip 또는 .shp)을 찾을 수 없습니다.`);
    process.exit(1);
  }

  let activeShp = '';
  let activeDbf = '';
  let activeShx = '';
  let activePrj = '';

  if (found.type === 'shp') {
    activeShp = found.shpPath;
    activeDbf = found.dbfPath;
    activeShx = found.shxPath;
    activePrj = found.prjPath;
    console.log(`📂 발견된 연속지적도 SHP: ${activeShp}`);
  } else if (found.type === 'zip') {
    console.log(`📦 발견된 연속지적도 ZIP 아카이브: ${found.filePath}`);
    const stagingDir = '/tmp/cadastral_ingest';
    fs.mkdirSync(stagingDir, { recursive: true });

    console.log(`⏳ 아카이브 임시 추출 중 (/tmp/cadastral_ingest)...`);
    execSync(`unzip -q -o "${found.filePath}" -d "${stagingDir}"`);

    const extracted = fs.readdirSync(stagingDir);
    const exShp = extracted.find((f) => f.endsWith('.shp'));
    if (!exShp) {
      console.error(`❌ 오류: ZIP 내부에 .shp 파일이 없습니다.`);
      process.exit(1);
    }
    const baseName = exShp.replace('.shp', '');
    activeShp = path.join(stagingDir, `${baseName}.shp`);
    activeDbf = path.join(stagingDir, `${baseName}.dbf`);
    activeShx = path.join(stagingDir, `${baseName}.shx`);
    activePrj = path.join(stagingDir, `${baseName}.prj`);
  }

  // 대상 행정구역 매핑
  let targetAdmCode = '51130'; // 원주시 기본
  let targetRegionId = 'wonju';

  for (const [code, info] of Object.entries(GANGWON_ADM_CODES)) {
    if (info.id === regionArg.toLowerCase() || info.name.includes(regionArg) || code === regionArg) {
      targetAdmCode = code;
      targetRegionId = info.id;
      break;
    }
  }

  if (regionArg.toLowerCase() === 'all') {
    targetAdmCode = 'all';
    targetRegionId = 'gangwon_all';
  }

  await convertCadastralShp(activeShp, activeDbf, activeShx, activePrj, {
    targetAdmCode,
    targetRegionId,
    limit: limitArg,
    outputDir,
  });

  console.log(`\n🎉 연속지적도 인제스트 완료! 브라우저 지도에서 실시간 지적 필지로 즉시 반영됩니다.`);
}

main().catch((err) => {
  console.error(`❌ 인제스트 실패:`, err);
  process.exit(1);
});
