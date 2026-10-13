/**
 * SmartCityComplex3D.ts
 *
 * 원주 1군지사 이전부지 (first-logistics-wonju) 스마트 미래 도심 3D 복합단지 (LOD2) 자동 안착 엔진
 * - Three.js PBR 건축 메쉬 파이프라인
 *   1) 첨단 국방·모빌리티 R&D 타워 (지상 18층, 65m, 블루 커튼월 유리 + 옥탑 헬리패드)
 *   2) 스마트 지식산업센터 (지상 7층, 28m, 테라스형 옥상 조경 + 태양광 패널 그리드)
 *   3) 민·군 상생 복합 문화컨벤션 (곡선 아치형 지붕 + 개방형 캐노피 로비)
 *   4) 부지 진입 4차선 스마트 도로 선형 및 중앙 녹지 광장 메쉬
 * - MapLibre GL 3D DEM 표고 실시간 쿼리 및 지표면 밀착 (Terrain Clamping)
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';

export const FIRST_LOGISTICS_WONJU_CENTER: [number, number] = [127.9358, 37.3592];

// =============================================================================
// 1. 공통 건축 PBR 머티리얼 팔레트
// =============================================================================
function createSmartCityMaterials() {
  return {
    // 1) 외벽 콘크리트 및 프리캐스트 패널
    wallConcrete: new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.65,
      metalness: 0.15,
    }),
    wallPodium: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.7,
      metalness: 0.2,
    }),
    // 2) 블루 커튼월 반사 유리
    glassCurtainBlue: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.15,
      metalness: 0.85,
      transparent: true,
      opacity: 0.85,
    }),
    glassCurtainCyan: new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.8,
    }),
    // 3) 층간 슬래브 & 섀시 프레임
    floorSlab: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.4,
    }),
    frameDark: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.85,
    }),
    // 4) 옥탑 헬리패드
    helipadDeck: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.2,
    }),
    helipadYellow: new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
      emissive: 0xca8a04,
      emissiveIntensity: 0.25,
    }),
    beaconRed: new THREE.MeshBasicMaterial({
      color: 0xef4444,
    }),
    // 5) 테라스 조경 녹지 & 목재 데크
    terraceGrass: new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.9,
      metalness: 0.05,
    }),
    terraceWood: new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.6,
      metalness: 0.1,
    }),
    railingGlass: new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.65,
    }),
    // 6) 태양광 PV 패널 그리드
    solarPV: new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.15,
      metalness: 0.9,
    }),
    solarFrame: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.3,
      metalness: 0.8,
    }),
    // 7) 컨벤션 곡선 아치 지붕 (티타늄 징크 실버)
    roofArchedTitanium: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
      metalness: 0.75,
    }),
    canopyWhite: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.3,
    }),
    // 8) 4차선 도로 & 스마트 인프라
    asphaltRoad: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.92,
      metalness: 0.08,
    }),
    roadMarkWhite: new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
    }),
    roadMarkYellow: new THREE.MeshBasicMaterial({
      color: 0xfacc15,
    }),
    // 9) 중앙 녹지 광장 & 분수
    plazaPavement: new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.75,
      metalness: 0.15,
    }),
    plazaGrass: new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.95,
      metalness: 0.05,
    }),
    waterSurface: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.95,
      transparent: true,
      opacity: 0.85,
    }),
    treeFoliage: new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.9,
      metalness: 0.1,
    }),
    treeTrunk: new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.9,
    }),
  };
}

// =============================================================================
// 2. 컴포넌트 1: 첨단 국방·모빌리티 R&D 타워 (지상 18층, 높이 65m)
// =============================================================================
// =============================================================================
// 2. 컴포넌트 1: 국방·첨단 모빌리티 R&D 타워 (15층, 높이 55m, 유리 커튼월 + 옥탑 헬리패드)
// =============================================================================
function buildDefenseRDTower(mats: ReturnType<typeof createSmartCityMaterials>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'defense_rd_tower_55m';

  // 1) 기단부 포디움 (1~2층, 높이 8m, 42m x 32m)
  const podiumGeo = new THREE.BoxGeometry(42, 8, 32);
  const podium = new THREE.Mesh(podiumGeo, mats.wallPodium);
  podium.position.y = 4;
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  // 포디움 1층 대형 투명 글래스 로비 (전면)
  const lobbyGeo = new THREE.BoxGeometry(36, 4.5, 1);
  const lobby = new THREE.Mesh(lobbyGeo, mats.glassCurtainBlue);
  lobby.position.set(0, 2.5, 16.1);
  group.add(lobby);

  // 로비 캐노피
  const lobbyCanopyGeo = new THREE.BoxGeometry(20, 0.5, 6);
  const lobbyCanopy = new THREE.Mesh(lobbyCanopyGeo, mats.frameDark);
  lobbyCanopy.position.set(0, 5.2, 18.5);
  group.add(lobbyCanopy);

  // 2) 메인 타워 본동 (3~15층, 13개 층, 높이 43m, 30m x 22m)
  // 기단 8m + 타워 43m = 51m
  const towerHeight = 43;
  const towerGeo = new THREE.BoxGeometry(30, towerHeight, 22);
  const tower = new THREE.Mesh(towerGeo, mats.glassCurtainBlue);
  tower.position.y = 8 + towerHeight / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // 13개 층별 슬래브 밴드 및 멀리언 라인 (3.3m 층고 정밀 시각화, 총 15층)
  const floorCount = 13;
  const floorHeight = towerHeight / floorCount;
  for (let i = 0; i <= floorCount; i++) {
    const yPos = 8 + i * floorHeight;
    const slabGeo = new THREE.BoxGeometry(30.6, 0.4, 22.6);
    const slab = new THREE.Mesh(slabGeo, mats.floorSlab);
    slab.position.y = yPos;
    group.add(slab);
  }

  // 코너 수직 구조 기둥 프레임 (4각 모서리 엑센트)
  const cornerGeo = new THREE.BoxGeometry(0.8, towerHeight, 0.8);
  const corners = [
    [-15, -11],
    [15, -11],
    [-15, 11],
    [15, 11],
  ];
  corners.forEach(([cx, cz]) => {
    const col = new THREE.Mesh(cornerGeo, mats.frameDark);
    col.position.set(cx, 8 + towerHeight / 2, cz);
    group.add(col);
  });

  // 3) 옥탑 기계실 / 엘리베이터 권상기실 코어 (높이 3.5m)
  const penthouseGeo = new THREE.BoxGeometry(14, 3.5, 10);
  const penthouse = new THREE.Mesh(penthouseGeo, mats.wallConcrete);
  penthouse.position.set(0, 52.75, 0);
  penthouse.castShadow = true;
  group.add(penthouse);

  // 4) 옥탑 헬리패드 플랫폼 (총 높이 55m)
  const helipadBaseGeo = new THREE.CylinderGeometry(9.5, 9.5, 0.5, 24);
  const helipadBase = new THREE.Mesh(helipadBaseGeo, mats.helipadDeck);
  helipadBase.position.set(0, 55, 0);
  group.add(helipadBase);

  // 헬리패드 노란색 원형 안전 경계선
  const ringGeo = new THREE.RingGeometry(8.0, 8.8, 32);
  const ring = new THREE.Mesh(ringGeo, mats.helipadYellow);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 55.3, 0);
  group.add(ring);

  // 헬리패드 중앙 대형 'H' 마킹 (3개 직사각형 조합)
  const hBar1Geo = new THREE.PlaneGeometry(0.9, 4.8);
  const hBar1 = new THREE.Mesh(hBar1Geo, mats.helipadYellow);
  hBar1.rotation.x = -Math.PI / 2;
  hBar1.position.set(-1.6, 55.32, 0);
  group.add(hBar1);

  const hBar2Geo = new THREE.PlaneGeometry(0.9, 4.8);
  const hBar2 = new THREE.Mesh(hBar2Geo, mats.helipadYellow);
  hBar2.rotation.x = -Math.PI / 2;
  hBar2.position.set(1.6, 55.32, 0);
  group.add(hBar2);

  const hBarCrossGeo = new THREE.PlaneGeometry(2.4, 0.9);
  const hBarCross = new THREE.Mesh(hBarCrossGeo, mats.helipadYellow);
  hBarCross.rotation.x = -Math.PI / 2;
  hBarCross.position.set(0, 55.32, 0);
  group.add(hBarCross);

  // 4방향 야간 적색 항공 유도 비콘등
  const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const beaconAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
  beaconAngles.forEach((angle) => {
    const bx = Math.cos(angle) * 9.2;
    const bz = Math.sin(angle) * 9.2;
    const beacon = new THREE.Mesh(beaconGeo, mats.beaconRed);
    beacon.position.set(bx, 55.5, bz);
    group.add(beacon);
  });

  return group;
}

// =============================================================================
// 2. 컴포넌트 2: 스마트 지식산업센터 (6층, 높이 24m, 테라스형 옥상 조경)
// =============================================================================
function buildKnowledgeIndustryCenter(mats: ReturnType<typeof createSmartCityMaterials>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'knowledge_industry_center_24m';

  // 1단: 1~2층 (높이 8m, 62m x 36m)
  const tier1Geo = new THREE.BoxGeometry(62, 8, 36);
  const tier1 = new THREE.Mesh(tier1Geo, mats.wallConcrete);
  tier1.position.y = 4;
  tier1.castShadow = true;
  tier1.receiveShadow = true;
  group.add(tier1);

  // 1단 수평 띠창 (Ribbon Glass)
  for (let floor = 1; floor <= 2; floor++) {
    const winGeo = new THREE.BoxGeometry(58, 1.8, 36.4);
    const win = new THREE.Mesh(winGeo, mats.glassCurtainCyan);
    win.position.y = (floor - 0.5) * 4;
    group.add(win);
  }

  // 1단 옥상 테라스 조경 (앞쪽 12m 노출 구간)
  const terrace1GrassGeo = new THREE.BoxGeometry(60, 0.3, 12);
  const terrace1Grass = new THREE.Mesh(terrace1GrassGeo, mats.terraceGrass);
  terrace1Grass.position.set(0, 8.15, 10);
  group.add(terrace1Grass);

  const terrace1WoodGeo = new THREE.BoxGeometry(58, 0.35, 3.5);
  const terrace1Wood = new THREE.Mesh(terrace1WoodGeo, mats.terraceWood);
  terrace1Wood.position.set(0, 8.2, 15);
  group.add(terrace1Wood);

  // 2단: 3~4층 (높이 8m, 46m x 24m)
  const tier2Geo = new THREE.BoxGeometry(46, 8, 24);
  const tier2 = new THREE.Mesh(tier2Geo, mats.wallConcrete);
  tier2.position.set(0, 12, -5);
  tier2.castShadow = true;
  tier2.receiveShadow = true;
  group.add(tier2);

  for (let floor = 1; floor <= 2; floor++) {
    const winGeo = new THREE.BoxGeometry(44, 1.8, 24.4);
    const win = new THREE.Mesh(winGeo, mats.glassCurtainCyan);
    win.position.set(0, 8 + (floor - 0.5) * 4, -5);
    group.add(win);
  }

  // 2단 옥상 테라스 조경 (앞쪽 8m 노출 구간)
  const terrace2GrassGeo = new THREE.BoxGeometry(44, 0.3, 8);
  const terrace2Grass = new THREE.Mesh(terrace2GrassGeo, mats.terraceGrass);
  terrace2Grass.position.set(0, 16.15, 3);
  group.add(terrace2Grass);

  // 3단: 5~6층 (높이 8m, 32m x 16m) -> 총 6층, 총 높이 24m!
  const tier3Geo = new THREE.BoxGeometry(32, 8, 16);
  const tier3 = new THREE.Mesh(tier3Geo, mats.wallConcrete);
  tier3.position.set(0, 20, -9);
  tier3.castShadow = true;
  tier3.receiveShadow = true;
  group.add(tier3);

  // 6층 최상단 옥상 태양광 패널 그리드 (Solar PV Array, 15도 남향 경사)
  const pvWidth = 4.2;
  const pvLength = 2.2;
  const pvCols = 4;
  const pvRows = 2;
  const pvTilt = (18 * Math.PI) / 180;

  for (let c = 0; c < pvCols; c++) {
    for (let r = 0; r < pvRows; r++) {
      const px = (c - (pvCols - 1) / 2) * 5.4;
      const pz = -9 + (r - (pvRows - 1) / 2) * 3.8;

      // 패널 지지대
      const frameGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
      const frame = new THREE.Mesh(frameGeo, mats.solarFrame);
      frame.position.set(px, 24.35, pz);
      group.add(frame);

      // PV 모듈
      const panelGeo = new THREE.BoxGeometry(pvWidth, 0.08, pvLength);
      const panel = new THREE.Mesh(panelGeo, mats.solarPV);
      panel.position.set(px, 24.7, pz);
      panel.rotation.x = -pvTilt;
      panel.castShadow = true;
      group.add(panel);
    }
  }

  // 옥상 테라스 수목 화단 큐브 (Low-poly)
  const treeOffsets = [
    [-22, 8.5, 12],
    [0, 8.5, 12],
    [22, 8.5, 12],
    [-14, 16.5, 4],
    [14, 16.5, 4],
  ];
  treeOffsets.forEach(([tx, ty, tz]) => {
    const planterGeo = new THREE.BoxGeometry(2.2, 0.6, 2.2);
    const planter = new THREE.Mesh(planterGeo, mats.floorSlab);
    planter.position.set(tx, ty + 0.3, tz);
    group.add(planter);

    const bushGeo = new THREE.DodecahedronGeometry(1.1);
    const bush = new THREE.Mesh(bushGeo, mats.treeFoliage);
    bush.position.set(tx, ty + 1.5, tz);
    group.add(bush);
  });

  return group;
}


// =============================================================================
// 3. 컴포넌트 3: 민·군 상생 복합 문화컨벤션 (곡선 아치형 지붕 + 개방형 캐노피 로비)
// =============================================================================
function buildCivicConventionHall(mats: ReturnType<typeof createSmartCityMaterials>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'civic_convention_hall';

  // 1) 본관 하부 매스 (폭 54m x 깊이 38m x 높이 10m)
  const hallBaseGeo = new THREE.BoxGeometry(54, 10, 38);
  const hallBase = new THREE.Mesh(hallBaseGeo, mats.wallConcrete);
  hallBase.position.y = 5;
  hallBase.castShadow = true;
  hallBase.receiveShadow = true;
  group.add(hallBase);

  // 전면 대형 글래스 파사드
  const glassFrontGeo = new THREE.BoxGeometry(48, 8, 1);
  const glassFront = new THREE.Mesh(glassFrontGeo, mats.glassCurtainBlue);
  glassFront.position.set(0, 5, 19.1);
  group.add(glassFront);

  // 2) 유려한 곡선 아치형 지붕 (Barrel Vault Curved Roof)
  // Cylinder 반원(thetaLength: PI)을 눕혀서 폭 54m 길이의 아치 볼트 지붕 형성
  const archRadius = 20;
  const archLength = 54.4;
  const archGeo = new THREE.CylinderGeometry(
    archRadius,
    archRadius,
    archLength,
    32,
    1,
    false,
    0,
    Math.PI
  );
  const archRoof = new THREE.Mesh(archGeo, mats.roofArchedTitanium);
  // Z축이 가로(길이방향), Y축이 위로 향하도록 회전
  archRoof.rotation.z = Math.PI / 2;
  archRoof.position.set(0, 10, 0);
  archRoof.castShadow = true;
  archRoof.receiveShadow = true;
  group.add(archRoof);

  // 아치 중앙 천창 (Sky-lighting Strip)
  const skylightGeo = new THREE.CylinderGeometry(
    archRadius + 0.1,
    archRadius + 0.1,
    archLength * 0.7,
    16,
    1,
    false,
    (Math.PI * 3) / 8,
    Math.PI / 4
  );
  const skylight = new THREE.Mesh(skylightGeo, mats.glassCurtainBlue);
  skylight.rotation.z = Math.PI / 2;
  skylight.position.set(0, 10, 0);
  group.add(skylight);

  // 3) 개방형 캔틸레버 캐노피 로비 (Open Cantilevered Canopy Lobby)
  // 전면으로 12m 돌출된 얇고 미래지향적인 화이트 캐노피
  const canopyWidth = 32;
  const canopyDepth = 12;
  const canopyThickness = 0.55;
  const canopyGeo = new THREE.BoxGeometry(canopyWidth, canopyThickness, canopyDepth);
  const canopy = new THREE.Mesh(canopyGeo, mats.canopyWhite);
  canopy.position.set(0, 8.5, 25);
  canopy.castShadow = true;
  group.add(canopy);

  // 캐노피 상단 은은한 에메랄드 엣지 라인
  const canopyTrimGeo = new THREE.BoxGeometry(canopyWidth + 0.2, 0.2, canopyDepth + 0.2);
  const canopyTrim = new THREE.Mesh(canopyTrimGeo, mats.frameDark);
  canopyTrim.position.set(0, 8.85, 25);
  group.add(canopyTrim);

  // 개방형 필로티 독립 기둥 (6개 기둥 열주)
  const columnRadius = 0.35;
  const columnHeight = 8.5;
  const colGeo = new THREE.CylinderGeometry(columnRadius, columnRadius, columnHeight, 16);
  const colXs = [-12, -4, 4, 12];
  colXs.forEach((cx) => {
    const col = new THREE.Mesh(colGeo, mats.frameDark);
    col.position.set(cx, 4.25, 29.5);
    col.castShadow = true;
    group.add(col);
  });

  return group;
}

// =============================================================================
// 4. 컴포넌트 4: 부지 진입 4차선 스마트 도로 선형 및 중앙 녹지 광장 메쉬
// =============================================================================
function buildSmartRoadAndGreenPlaza(mats: ReturnType<typeof createSmartCityMaterials>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smart_roads_and_plaza';

  // 1) 4차선 주 진입 도로 (남북 관통 16m 폭, 길이 240m)
  const mainRoadWidth = 16;
  const mainRoadLength = 240;
  const mainRoadGeo = new THREE.PlaneGeometry(mainRoadWidth, mainRoadLength);
  const mainRoad = new THREE.Mesh(mainRoadGeo, mats.asphaltRoad);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(-20, 0.05, 30);
  mainRoad.receiveShadow = true;
  group.add(mainRoad);

  // 중앙 노란색 복선 차선 (Double Yellow Center Lines)
  const yellowLineGeo = new THREE.PlaneGeometry(0.3, mainRoadLength);
  const yellowLine1 = new THREE.Mesh(yellowLineGeo, mats.roadMarkYellow);
  yellowLine1.rotation.x = -Math.PI / 2;
  yellowLine1.position.set(-20.25, 0.08, 30);
  group.add(yellowLine1);

  const yellowLine2 = new THREE.Mesh(yellowLineGeo, mats.roadMarkYellow);
  yellowLine2.rotation.x = -Math.PI / 2;
  yellowLine2.position.set(-19.75, 0.08, 30);
  group.add(yellowLine2);

  // 좌우 화이트 차선 (차로 구분선)
  const whiteLane1 = new THREE.Mesh(yellowLineGeo, mats.roadMarkWhite);
  whiteLane1.rotation.x = -Math.PI / 2;
  whiteLane1.position.set(-24, 0.08, 30);
  group.add(whiteLane1);

  const whiteLane2 = new THREE.Mesh(yellowLineGeo, mats.roadMarkWhite);
  whiteLane2.rotation.x = -Math.PI / 2;
  whiteLane2.position.set(-16, 0.08, 30);
  group.add(whiteLane2);

  // 동서 연결 지선 도로 (폭 12m, 길이 210m)
  const subRoadGeo = new THREE.PlaneGeometry(210, 12);
  const subRoad = new THREE.Mesh(subRoadGeo, mats.asphaltRoad);
  subRoad.rotation.x = -Math.PI / 2;
  subRoad.position.set(0, 0.06, 0);
  subRoad.receiveShadow = true;
  group.add(subRoad);

  // 2) 중앙 녹지 광장 (Central Green Plaza, 80m x 65m)
  const plazaGeo = new THREE.PlaneGeometry(80, 65);
  const plaza = new THREE.Mesh(plazaGeo, mats.plazaPavement);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.08, -10);
  plaza.receiveShadow = true;
  group.add(plaza);

  // 타원형 중앙 잔디 광장 (52m x 38m)
  const grassGeo = new THREE.CylinderGeometry(26, 26, 0.2, 32);
  grassGeo.scale(1, 1, 0.72);
  const grass = new THREE.Mesh(grassGeo, mats.plazaGrass);
  grass.position.set(0, 0.2, -10);
  grass.receiveShadow = true;
  group.add(grass);

  // 중앙 원형 분수대 (직경 14m)
  const fountainRimGeo = new THREE.CylinderGeometry(7, 7.3, 0.8, 24);
  const fountainRim = new THREE.Mesh(fountainRimGeo, mats.wallPodium);
  fountainRim.position.set(0, 0.5, -10);
  group.add(fountainRim);

  const waterGeo = new THREE.CylinderGeometry(6.6, 6.6, 0.2, 24);
  const water = new THREE.Mesh(waterGeo, mats.waterSurface);
  water.position.set(0, 0.8, -10);
  group.add(water);

  // 광장 주변 가로수 식재 (Low-poly Trees)
  const treeCount = 20;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2;
    const tx = Math.cos(angle) * 34;
    const tz = -10 + Math.sin(angle) * 26;

    // 나무 기둥
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 6);
    const trunk = new THREE.Mesh(trunkGeo, mats.treeTrunk);
    trunk.position.set(tx, 1.25, tz);
    trunk.castShadow = true;
    group.add(trunk);

    // 수관 (잎)
    const foliageGeo = new THREE.ConeGeometry(2.2, 4.5, 7);
    const foliage = new THREE.Mesh(foliageGeo, mats.treeFoliage);
    foliage.position.set(tx, 4.2, tz);
    foliage.castShadow = true;
    group.add(foliage);
  }

  return group;
}

// =============================================================================
// 5. 전체 스마트 복합단지 (Smart City Complex) 통합 메쉬 빌더
// =============================================================================
export function createSmartCityComplexMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'smart_city_complex_root';

  const mats = createSmartCityMaterials();

  // 1) 부지 스마트 도로망 및 중앙 녹지 광장
  const roadsAndPlaza = buildSmartRoadAndGreenPlaza(mats);
  root.add(roadsAndPlaza);

  // 2) 첨단 국방·모빌리티 R&D 타워 (북서쪽 블록 배치)
  const rdTower = buildDefenseRDTower(mats);
  rdTower.position.set(-85, 0, -45);
  rdTower.rotation.y = (-12 * Math.PI) / 180;
  root.add(rdTower);

  // 3) 스마트 지식산업센터 (북동쪽 블록 배치)
  const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
  knowledgeCenter.position.set(80, 0, -55);
  knowledgeCenter.rotation.y = (15 * Math.PI) / 180;
  root.add(knowledgeCenter);

  // 4) 민·군 상생 복합 문화컨벤션 (남동쪽 블록 배치)
  const convention = buildCivicConventionHall(mats);
  convention.position.set(75, 0, 70);
  convention.rotation.y = (-8 * Math.PI) / 180;
  root.add(convention);

  return root;
}

// =============================================================================
// 6. MapLibre 3D 커스텀 레이어 (SmartCityComplex3DLayer)
// =============================================================================
export class SmartCityComplex3DLayer implements maplibregl.CustomLayerInterface {
  id = 'smart-city-complex-3d-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private complexMesh: THREE.Group | null = null;

  private directionalLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  private isVisible = false;
  private centerLngLat: [number, number] = FIRST_LOGISTICS_WONJU_CENTER;
  private clampedAltitude = 0;
  private rotationDeg = -12; // 부지 주축 각도
  private scaleY = 0; // 솟아오르는(Rise-Up) 보간 진행률 (0 -> 1)
  private targetScaleY = 0;

  constructor(center = FIRST_LOGISTICS_WONJU_CENTER) {
    this.centerLngLat = center;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.targetScaleY = visible ? 1 : 0;
    if (visible && this.scaleY < 0.05) {
      this.scaleY = 0.05;
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public updateSunLight(
    vector: [number, number, number],
    color: string,
    intensity: number
  ): void {
    if (this.directionalLight) {
      this.directionalLight.position.set(vector[0], vector[1], vector[2]).normalize();
      this.directionalLight.color.set(color);
      this.directionalLight.intensity = intensity * 1.5;
    }
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    try {
      this.map = map;

      // 1. [조명 설정 - 섀도우맵 바이패스로 WebGL FBO 보존]
      this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
      this.directionalLight.position.set(116, 141, 81).normalize();
      this.directionalLight.castShadow = false;
      this.scene.add(this.directionalLight);

      this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
      this.fillLight.position.set(-80, 100, 80).normalize();
      this.scene.add(this.fillLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
      this.scene.add(this.ambientLight);

      // 2. 스마트 복합단지 Three.js 메쉬 구축
      this.complexMesh = createSmartCityComplexMesh();
      this.scene.add(this.complexMesh);

      // 3. WebGLRenderer 연동 (섀도우맵 비활성화)
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
          alpha: true,
        });
        this.renderer.autoClear = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = false;
      } catch (err) {
        console.warn('[SmartCityComplex3DLayer] WebGLRenderer setup notice:', err);
      }
    } catch (onAddErr) {
      console.warn('[SmartCityComplex3DLayer] onAdd exception caught:', onAddErr);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if ((!this.isVisible && this.scaleY <= 0.001) || !this.renderer) {
      return;
    }

    try {
      const rawMatrix = options?.modelViewProjectionMatrix || options;
      if (!rawMatrix) return;

      // 0. 부드러운 솟아오름(Rise-Up) 보간 애니메이션
      if (Math.abs(this.scaleY - this.targetScaleY) > 0.005) {
        this.scaleY += (this.targetScaleY - this.scaleY) * 0.14;
        if (this.map) {
          this.map.triggerRepaint();
        }
      } else {
        this.scaleY = this.targetScaleY;
      }

      if (this.scaleY <= 0.001) {
        return;
      }

      if (this.complexMesh) {
        this.complexMesh.scale.set(1, this.scaleY, 1);
      }

      // 1. [3D 지형 DEM 표고 밀착 (Terrain Clamping)]
      if (this.map && typeof (this.map as any).queryTerrainElevation === 'function') {
        const queried = (this.map as any).queryTerrainElevation(this.centerLngLat);
        if (queried !== null && queried !== undefined) {
          this.clampedAltitude = Math.max(0, queried);
        }
      }

      // 2. Mercator 좌표계 투영 (부지 표고에 스냅)
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(
        this.centerLngLat,
        this.clampedAltitude
      );

      // 3. 실측 미터 단위(meterScale) 스케일링
      const meterScale = mercator.meterInMercatorCoordinateUnits();

      // 4. 좌표계 변환 행렬 (Three.js Y-Up -> MapLibre Z-Up & 부지 방위각 회전)
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        (this.rotationDeg * Math.PI) / 180
      );

      const m = new THREE.Matrix4().fromArray(rawMatrix);
      const l = new THREE.Matrix4()
        .makeTranslation(mercator.x, mercator.y, mercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);

      // 5. 렌더링 및 WebGL 상태 완전 복원
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    } catch (renderErr) {
      console.warn('[SmartCityComplex3DLayer] render error suppressed:', renderErr);
    }
  }

  onRemove(): void {
    if (this.complexMesh) {
      this.scene.remove(this.complexMesh);
      this.disposeObject(this.complexMesh);
      this.complexMesh = null;
    }

    // Directional/Fill/Ambient Light 및 섀도우맵 버퍼 해제
    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      if (this.directionalLight.shadow?.map) {
        this.directionalLight.shadow.map.dispose();
      }
      this.directionalLight.dispose();
      this.directionalLight = null;
    }
    if (this.fillLight) {
      this.scene.remove(this.fillLight);
      this.fillLight.dispose();
      this.fillLight = null;
    }
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }

    this.scene.clear();
    this.renderer = null;
    this.map = null;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    });
  }
}
