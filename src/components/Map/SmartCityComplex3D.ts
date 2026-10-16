/**
 * SmartCityComplex3D.ts
 *
 * 강원권 전역 주요 군 유휴부지 다중 거점 3D 스마트 복합단지 (LOD2) 자동 안착 엔진
 * - 강원 6대+ 전략 거점별 맞춤형 절차적 3D 건축물(LOD2) 파이프라인
 *   1) 국방·첨단 모빌리티 R&D 타워 (15층, 55m, 블루 커튼월 유리 + 옥탑 헬리패드 마킹)
 *   2) 스마트 지식산업센터 (6층, 24m, 테라스형 옥상 조경 + 태양광 패널 그리드)
 *   3) 스마트 군수/물류 데포 (아치 트러스 지붕 + 5개 하역 도크 롤러셔터 도어)
 *   4) 전술 경계/감시 타워 (18m 철골 트러스 기둥 + 상부 360도 관측 큐브 + 레이더/안테나)
 *   5) 표준 주거/지원시설 (4층, 박공 경사 지붕 + 테라스 발코니 파사드)
 *   6) 민·군 상생 복합 문화컨벤션 (곡선 아치형 지붕 + 개방형 캐노피 로비)
 *   7) 부지 진입 4차선 스마트 도로망 및 중앙 녹지 광장
 * - MapLibre GL 3D Terrarium DEM 표고 실시간 쿼리 및 지표면 밀착 (Terrain Clamping)
 * - 거점 전환 시 WebGL 리소스 완벽 해제(dispose) 및 부드러운 솟아오름(Rise-Up) 애니메이션
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  GANGWON_MILITARY_SITES,
  getGangwonMilitarySiteById,
  GangwonMilitarySite,
} from '@/constants/gangwonMilitarySites';
import { elevationCache } from '@/utils/elevationCache';

export const FIRST_LOGISTICS_WONJU_CENTER: [number, number] = [127.9358, 37.3592];

// =============================================================================
// 1. 공통 건축 PBR 머티리얼 팔레트
// =============================================================================
export function createSmartCityMaterials() {
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
    wallBrickWarm: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.75,
      metalness: 0.1,
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
    glassObservation: new THREE.MeshStandardMaterial({
      color: 0xa5f3fc,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.75,
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
    railingMetal: new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.4,
      metalness: 0.8,
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
    // 7) 컨벤션 곡선 아치 지붕 및 물류 데포 마감
    roofArchedTitanium: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
      metalness: 0.75,
    }),
    roofCorrugatedMetal: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.45,
      metalness: 0.7,
    }),
    roofGabledSlate: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.2,
    }),
    canopyWhite: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.3,
    }),
    // 8) 화물 하역 도크 롤러 셔터 도어
    shutterDoor: new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.75,
    }),
    dockBumperYellow: new THREE.MeshBasicMaterial({
      color: 0xeab308,
    }),
    // 9) 철골 트러스 구조체 (감시 타워 및 지붕)
    trussSteel: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.85,
    }),
    radarDomeWhite: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
      metalness: 0.2,
    }),
    // 10) 도로 & 스마트 인프라
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
    // 11) 중앙 녹지 광장 & 분수
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
    // 12) 랜드마크 고도화: 스카이블루 커튼월, 수직 알루미늄 핀, 발광 포인트 및 주차 구획선
    glassCurtainSkyBlue: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      metalness: 0.92,
      transparent: true,
      opacity: 0.88,
    }),
    finAluminum: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.18,
      metalness: 0.95,
    }),
    glowCyan: new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    }),
    glowGold: new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
    }),
    pedestrianDeck: new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.55,
      metalness: 0.35,
    }),
    parkingAsphalt: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.92,
      metalness: 0.1,
    }),
    parkingLineWhite: new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
    }),
    parkingEvGreen: new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.5,
      metalness: 0.2,
    }),
  };
}

export type SmartCityMaterials = ReturnType<typeof createSmartCityMaterials>;

// =============================================================================
// 2. 컴포넌트 1: 첨단 국방·모빌리티 R&D 타워 (15층, 높이 55m, 유리 커튼월 + 옥탑 헬리패드)
// =============================================================================
export function buildDefenseRDTower(mats: SmartCityMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'defense_rd_tower_55m_landmark';

  // 1) 기단부 포디움 (1~2층, 높이 8m, 42m x 32m)
  const podiumGeo = new THREE.BoxGeometry(42, 8, 32);
  const podium = new THREE.Mesh(podiumGeo, mats.wallPodium);
  podium.position.y = 4;
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  // 포디움 1층 대형 투명 글래스 로비 (전면)
  const lobbyGeo = new THREE.BoxGeometry(36, 4.5, 1);
  const lobby = new THREE.Mesh(lobbyGeo, mats.glassCurtainSkyBlue);
  lobby.position.set(0, 2.5, 16.1);
  group.add(lobby);

  // 로비 캐노피
  const lobbyCanopyGeo = new THREE.BoxGeometry(20, 0.5, 6);
  const lobbyCanopy = new THREE.Mesh(lobbyCanopyGeo, mats.frameDark);
  lobbyCanopy.position.set(0, 5.2, 18.5);
  group.add(lobbyCanopy);

  // 2) 메인 타워 본동 (3~15층, 13개 층, 높이 43m, 30m x 22m)
  // [요구사항 2] 반사율이 높은 스카이 블루 유리 커튼월
  const towerHeight = 43;
  const towerGeo = new THREE.BoxGeometry(30, towerHeight, 22);
  const tower = new THREE.Mesh(towerGeo, mats.glassCurtainSkyBlue);
  tower.position.y = 8 + towerHeight / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // [요구사항 2] 외벽 수직 알루미늄 핀 (Vertical Aluminum Fins, 3.0m 간격)
  // 전면(+Z) 및 후면(-Z) 수직 알루미늄 루버 핀
  const finFrontBackGeo = new THREE.BoxGeometry(0.18, towerHeight, 0.45);
  for (let x = -13.5; x <= 13.5; x += 3.0) {
    if (Math.abs(x) < 0.5) continue;
    // 전면 (+Z)
    const finFront = new THREE.Mesh(finFrontBackGeo, mats.finAluminum);
    finFront.position.set(x, 8 + towerHeight / 2, 11.23);
    finFront.castShadow = true;
    group.add(finFront);

    // 후면 (-Z)
    const finBack = new THREE.Mesh(finFrontBackGeo, mats.finAluminum);
    finBack.position.set(x, 8 + towerHeight / 2, -11.23);
    finBack.castShadow = true;
    group.add(finBack);
  }

  // 측면(+X, -X) 수직 알루미늄 루버 핀
  const finSideGeo = new THREE.BoxGeometry(0.45, towerHeight, 0.18);
  for (let z = -9.0; z <= 9.0; z += 3.0) {
    if (Math.abs(z) < 0.5) continue;
    // 좌측 (-X)
    const finLeft = new THREE.Mesh(finSideGeo, mats.finAluminum);
    finLeft.position.set(-15.23, 8 + towerHeight / 2, z);
    finLeft.castShadow = true;
    group.add(finLeft);

    // 우측 (+X)
    const finRight = new THREE.Mesh(finSideGeo, mats.finAluminum);
    finRight.position.set(15.23, 8 + towerHeight / 2, z);
    finRight.castShadow = true;
    group.add(finRight);
  }

  // 13개 층별 슬래브 밴드 및 멀리언 라인 (3.3m 층고 시각화)
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

  // [요구사항 2] 야간/주간 발광 포인트: 옥상 크라운 및 코너 엣지 발광 스트립
  const crownGlowGeoX = new THREE.BoxGeometry(30.6, 0.35, 0.35);
  const crownGlowGeoZ = new THREE.BoxGeometry(0.35, 0.35, 22.6);

  const crownGlowFront = new THREE.Mesh(crownGlowGeoX, mats.glowCyan);
  crownGlowFront.position.set(0, 51.2, 11.1);
  group.add(crownGlowFront);

  const crownGlowBack = new THREE.Mesh(crownGlowGeoX, mats.glowCyan);
  crownGlowBack.position.set(0, 51.2, -11.1);
  group.add(crownGlowBack);

  const crownGlowLeft = new THREE.Mesh(crownGlowGeoZ, mats.glowCyan);
  crownGlowLeft.position.set(-15.1, 51.2, 0);
  group.add(crownGlowLeft);

  const crownGlowRight = new THREE.Mesh(crownGlowGeoZ, mats.glowCyan);
  crownGlowRight.position.set(15.1, 51.2, 0);
  group.add(crownGlowRight);

  // 수직 코너 모서리 네온 발광 라인 (4개 코너)
  const edgeGlowGeo = new THREE.BoxGeometry(0.2, towerHeight, 0.2);
  corners.forEach(([cx, cz]) => {
    const edgeGlow = new THREE.Mesh(edgeGlowGeo, mats.glowCyan);
    const ox = cx > 0 ? cx + 0.42 : cx - 0.42;
    const oz = cz > 0 ? cz + 0.42 : cz - 0.42;
    edgeGlow.position.set(ox, 8 + towerHeight / 2, oz);
    group.add(edgeGlow);
  });

  // 3) 옥탑 기계실 코어 (높이 3.5m)
  const penthouseGeo = new THREE.BoxGeometry(14, 3.5, 10);
  const penthouse = new THREE.Mesh(penthouseGeo, mats.wallConcrete);
  penthouse.position.set(0, 52.75, 0);
  penthouse.castShadow = true;
  group.add(penthouse);

  // 4) 옥탑 헬리패드 플랫폼 (총 높이 55m)
  // [요구사항 2] 옥상 헬리패드 ('H' 마킹 및 정밀 테두리)
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

  // 헬리패드 중앙 대형 'H' 마킹
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

  // 헬리패드 둘레 야간 유도등 (8개 골드 LED 포인트)
  const padLightGeo = new THREE.SphereGeometry(0.24, 6, 6);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const lx = Math.cos(angle) * 8.4;
    const lz = Math.sin(angle) * 8.4;
    const padLight = new THREE.Mesh(padLightGeo, mats.glowGold);
    padLight.position.set(lx, 55.36, lz);
    group.add(padLight);
  }

  // 4방향 야간 적색 항공 유도 비콘등
  const beaconGeo = new THREE.SphereGeometry(0.38, 8, 8);
  const beaconAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
  beaconAngles.forEach((angle) => {
    const bx = Math.cos(angle) * 9.2;
    const bz = Math.sin(angle) * 9.2;
    const beacon = new THREE.Mesh(beaconGeo, mats.beaconRed);
    beacon.position.set(bx, 55.55, bz);
    group.add(beacon);
  });

  return group;
}

// =============================================================================
// 3. 컴포넌트 2: 스마트 지식산업센터 (6층, 높이 24m, 테라스형 옥상 조경 + 태양광)
// =============================================================================
export function buildKnowledgeIndustryCenter(mats: SmartCityMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'knowledge_industry_center_24m';

  // 1단: 1~2층 (높이 8m, 62m x 36m)
  const tier1Geo = new THREE.BoxGeometry(62, 8, 36);
  const tier1 = new THREE.Mesh(tier1Geo, mats.wallConcrete);
  tier1.position.y = 4;
  tier1.castShadow = true;
  tier1.receiveShadow = true;
  group.add(tier1);

  for (let floor = 1; floor <= 2; floor++) {
    const winGeo = new THREE.BoxGeometry(58, 1.8, 36.4);
    const win = new THREE.Mesh(winGeo, mats.glassCurtainCyan);
    win.position.y = (floor - 0.5) * 4;
    group.add(win);
  }

  // 1단 옥상 테라스 조경
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

  // 2단 옥상 테라스 조경
  const terrace2GrassGeo = new THREE.BoxGeometry(44, 0.3, 8);
  const terrace2Grass = new THREE.Mesh(terrace2GrassGeo, mats.terraceGrass);
  terrace2Grass.position.set(0, 16.15, 3);
  group.add(terrace2Grass);

  // 3단: 5~6층 (높이 8m, 32m x 16m)
  const tier3Geo = new THREE.BoxGeometry(32, 8, 16);
  const tier3 = new THREE.Mesh(tier3Geo, mats.wallConcrete);
  tier3.position.set(0, 20, -9);
  tier3.castShadow = true;
  tier3.receiveShadow = true;
  group.add(tier3);

  // 6층 최상단 옥상 태양광 패널 그리드
  const pvWidth = 4.2;
  const pvLength = 2.2;
  const pvCols = 4;
  const pvRows = 2;
  const pvTilt = (18 * Math.PI) / 180;

  for (let c = 0; c < pvCols; c++) {
    for (let r = 0; r < pvRows; r++) {
      const px = (c - (pvCols - 1) / 2) * 5.4;
      const pz = -9 + (r - (pvRows - 1) / 2) * 3.8;

      const frameGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
      const frame = new THREE.Mesh(frameGeo, mats.solarFrame);
      frame.position.set(px, 24.35, pz);
      group.add(frame);

      const panelGeo = new THREE.BoxGeometry(pvWidth, 0.08, pvLength);
      const panel = new THREE.Mesh(panelGeo, mats.solarPV);
      panel.position.set(px, 24.7, pz);
      panel.rotation.x = -pvTilt;
      panel.castShadow = true;
      group.add(panel);
    }
  }

  // 옥상 테라스 수목 화단 큐브
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
// 4. 컴포넌트 3: 스마트 군수/물류 데포 (대형 아치 트러스 지붕 + 화물 하역 도크 도어)
// =============================================================================
export function buildLogisticsDepot(mats: SmartCityMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smart_logistics_depot';

  // 1) 바닥 및 하역 에이프런 콘크리트 베이스 (폭 68m x 깊이 42m x 높이 1.2m)
  const baseGeo = new THREE.BoxGeometry(68, 1.2, 42);
  const base = new THREE.Mesh(baseGeo, mats.wallPodium);
  base.position.y = 0.6;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2) 주 창고 매스 벽체 (폭 64m x 깊이 38m x 높이 11m)
  const hallGeo = new THREE.BoxGeometry(64, 11, 38);
  const hall = new THREE.Mesh(hallGeo, mats.roofCorrugatedMetal);
  hall.position.y = 1.2 + 5.5;
  hall.castShadow = true;
  hall.receiveShadow = true;
  group.add(hall);

  // 3) 대형 아치 트러스 지붕 (Barrel Arch Vault, 곡률 반경 22m, 길이 64.5m)
  const archRadius = 22;
  const archLength = 64.4;
  const archGeo = new THREE.CylinderGeometry(
    archRadius,
    archRadius,
    archLength,
    28,
    1,
    false,
    0,
    Math.PI
  );
  const archRoof = new THREE.Mesh(archGeo, mats.roofArchedTitanium);
  archRoof.rotation.z = Math.PI / 2;
  archRoof.position.set(0, 12.2, 0);
  archRoof.castShadow = true;
  archRoof.receiveShadow = true;
  group.add(archRoof);

  // 지붕 트러스 측면 스틸 립 리브 (Truss Ribs)
  const ribCount = 7;
  for (let i = 0; i < ribCount; i++) {
    const rx = (i - (ribCount - 1) / 2) * (archLength / (ribCount - 1));
    const ribGeo = new THREE.TorusGeometry(archRadius + 0.15, 0.35, 8, 24, Math.PI);
    const rib = new THREE.Mesh(ribGeo, mats.trussSteel);
    rib.rotation.y = Math.PI / 2;
    rib.position.set(rx, 12.2, 0);
    group.add(rib);
  }

  // 4) 전면 5개 화물 하역 도크 롤러 셔터 도어 (Cargo Loading Dock Bays)
  const dockCount = 5;
  const dockSpacing = 10.5;
  for (let i = 0; i < dockCount; i++) {
    const dx = (i - (dockCount - 1) / 2) * dockSpacing;

    // 도크 프레임
    const dockFrameGeo = new THREE.BoxGeometry(5.4, 4.2, 0.4);
    const dockFrame = new THREE.Mesh(dockFrameGeo, mats.frameDark);
    dockFrame.position.set(dx, 3.3, 19.2);
    group.add(dockFrame);

    // 롤러 셔터 도어
    const shutterGeo = new THREE.BoxGeometry(4.6, 3.6, 0.3);
    const shutter = new THREE.Mesh(shutterGeo, mats.shutterDoor);
    shutter.position.set(dx, 3.1, 19.3);
    group.add(shutter);

    // 하역 도크 하단 범퍼 & 노란 안전 패드
    const padGeo = new THREE.BoxGeometry(4.8, 0.4, 0.6);
    const pad = new THREE.Mesh(padGeo, mats.dockBumperYellow);
    pad.position.set(dx, 1.2, 19.4);
    group.add(pad);

    // 도크 상단 야간 투광 조명 캐노피
    const dockLightGeo = new THREE.BoxGeometry(3.0, 0.25, 1.2);
    const dockLight = new THREE.Mesh(dockLightGeo, mats.canopyWhite);
    dockLight.position.set(dx, 5.6, 19.8);
    group.add(dockLight);
  }

  // 5) 전면 트럭 진입 및 선회 아스팔트 에이프런 (폭 68m x 깊이 18m)
  const apronGeo = new THREE.PlaneGeometry(68, 18);
  const apron = new THREE.Mesh(apronGeo, mats.asphaltRoad);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.05, 30);
  apron.receiveShadow = true;
  group.add(apron);

  // 도크 유도 차선 (Yellow Bay Markings)
  for (let i = 0; i < dockCount; i++) {
    const dx = (i - (dockCount - 1) / 2) * dockSpacing;
    const laneGuideGeo = new THREE.PlaneGeometry(0.25, 16);
    const guide1 = new THREE.Mesh(laneGuideGeo, mats.roadMarkYellow);
    guide1.rotation.x = -Math.PI / 2;
    guide1.position.set(dx - 2.4, 0.08, 30);
    group.add(guide1);

    const guide2 = new THREE.Mesh(laneGuideGeo, mats.roadMarkYellow);
    guide2.rotation.x = -Math.PI / 2;
    guide2.position.set(dx + 2.4, 0.08, 30);
    group.add(guide2);
  }

  return group;
}

// =============================================================================
// 5. 컴포넌트 4: 전술 경계/감시 타워 (18m 철골 트러스 기둥 + 상부 360도 관측 큐브)
// =============================================================================
export function buildTacticalWatchTower(mats: SmartCityMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tactical_watch_tower_18m';

  // 1) 지상 콘크리트 패드 기초 (8m x 8m x 1m)
  const basePadGeo = new THREE.BoxGeometry(8, 1, 8);
  const basePad = new THREE.Mesh(basePadGeo, mats.wallPodium);
  basePad.position.y = 0.5;
  basePad.castShadow = true;
  basePad.receiveShadow = true;
  group.add(basePad);

  // 2) 4개 철골 트러스 메인 기둥 (하부 5m 간격 -> 상부 3.8m 간격 경사 테이퍼)
  const towerH = 14.5;
  const legGeo = new THREE.CylinderGeometry(0.22, 0.32, towerH, 8);
  const legPositions = [
    [-2.2, -2.2, -1.8, -1.8],
    [2.2, -2.2, 1.8, -1.8],
    [-2.2, 2.2, -1.8, 1.8],
    [2.2, 2.2, 1.8, 1.8],
  ];

  legPositions.forEach(([bx, bz, tx, tz]) => {
    const leg = new THREE.Mesh(legGeo, mats.trussSteel);
    leg.position.set((bx + tx) / 2, 1 + towerH / 2, (bz + tz) / 2);
    leg.castShadow = true;
    group.add(leg);
  });

  // 3) 수평 & X자 가새 트러스 (3단 브레이싱)
  const braceLevels = [4.5, 9.0, 13.5];
  braceLevels.forEach((by) => {
    // 수평 사각 링
    const ringW = 4.2 - (by / 15) * 0.8;
    const ringGeo = new THREE.BoxGeometry(ringW, 0.25, ringW);
    const ring = new THREE.Mesh(ringGeo, mats.trussSteel);
    ring.position.y = by;
    group.add(ring);
  });

  // 4) 상부 360도 전술 관측 큐브 (높이 14.5m ~ 18m)
  // 바닥 캣워크 데크 (5.5m x 5.5m x 0.4m)
  const deckGeo = new THREE.BoxGeometry(5.5, 0.4, 5.5);
  const deck = new THREE.Mesh(deckGeo, mats.floorSlab);
  deck.position.y = 15.2;
  deck.castShadow = true;
  group.add(deck);

  // 안전 난간
  const railGeo = new THREE.BoxGeometry(5.4, 0.9, 5.4);
  const rail = new THREE.Mesh(railGeo, mats.railingMetal);
  rail.position.y = 15.8;
  group.add(rail);

  // 360도 파노라마 유리 관측실 본체 (4.2m x 2.8m x 4.2m)
  const obsCubeGeo = new THREE.BoxGeometry(4.2, 2.8, 4.2);
  const obsCube = new THREE.Mesh(obsCubeGeo, mats.glassObservation);
  obsCube.position.y = 16.8;
  obsCube.castShadow = true;
  group.add(obsCube);

  // 관측실 다크 스틸 루프 캡 (4.6m x 0.5m x 4.6m)
  const roofCapGeo = new THREE.BoxGeometry(4.6, 0.5, 4.6);
  const roofCap = new THREE.Mesh(roofCapGeo, mats.frameDark);
  roofCap.position.y = 18.45;
  roofCap.castShadow = true;
  group.add(roofCap);

  // 5) 최상단 전술 통신 안테나 마스트 & 회전 탐색 레이더 돔
  const mastGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.5, 8);
  const mast = new THREE.Mesh(mastGeo, mats.trussSteel);
  mast.position.set(1.2, 20.7, 1.2);
  group.add(mast);

  const radarGeo = new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const radar = new THREE.Mesh(radarGeo, mats.radarDomeWhite);
  radar.position.set(-1.0, 18.7, -1.0);
  group.add(radar);

  // 야간 고광도 탐조등 (Searchlight)
  const lightGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12);
  const searchlight = new THREE.Mesh(lightGeo, mats.helipadYellow);
  searchlight.rotation.x = Math.PI / 4;
  searchlight.position.set(0, 18.9, 1.8);
  group.add(searchlight);

  return group;
}

// =============================================================================
// 6. 컴포넌트 5: 표준 주거/지원시설 (4층, 박공 경사 지붕 + 발코니 파사드)
// =============================================================================
export function buildStandardResidentialSupport(mats: SmartCityMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'standard_residential_support_4f';

  // 1) 건물 주 매스 (지상 4층, 폭 42m x 깊이 18m x 높이 13.5m)
  const bodyH = 13.5;
  const bodyGeo = new THREE.BoxGeometry(42, bodyH, 18);
  const body = new THREE.Mesh(bodyGeo, mats.wallBrickWarm);
  body.position.y = bodyH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 2) 박공(Gabled) 경사 지붕 (Prism Roof, 높이 4m, 43m x 19m)
  // Triangular Prism via ExtrudeGeometry
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-9.5, 0);
  roofShape.lineTo(0, 4.0);
  roofShape.lineTo(9.5, 0);
  roofShape.closePath();

  const extrudeSettings = {
    steps: 1,
    depth: 43,
    bevelEnabled: false,
  };
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
  const roof = new THREE.Mesh(roofGeo, mats.roofGabledSlate);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(21.5, bodyH, 0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // 3) 전면 및 후면 세대별 발코니 & 창문 프레임 (2~4층, 각 층 5개 세대)
  const unitCount = 5;
  const unitSpacing = 7.6;
  for (let floor = 2; floor <= 4; floor++) {
    const fy = (floor - 0.5) * 3.3;

    for (let u = 0; u < unitCount; u++) {
      const ux = (u - (unitCount - 1) / 2) * unitSpacing;

      // 발코니 돌출 슬래브 (3.8m x 0.3m x 1.4m)
      const balcSlabGeo = new THREE.BoxGeometry(3.8, 0.3, 1.4);
      const balcSlab = new THREE.Mesh(balcSlabGeo, mats.floorSlab);
      balcSlab.position.set(ux, fy - 1.2, 9.7);
      group.add(balcSlab);

      // 발코니 안전 난간
      const balcRailGeo = new THREE.BoxGeometry(3.8, 1.0, 1.4);
      const balcRail = new THREE.Mesh(balcRailGeo, mats.railingMetal);
      balcRail.position.set(ux, fy - 0.6, 9.7);
      group.add(balcRail);

      // 세대 이중창 새시 창문
      const winGeo = new THREE.BoxGeometry(3.2, 1.8, 0.3);
      const win = new THREE.Mesh(winGeo, mats.glassCurtainBlue);
      win.position.set(ux, fy, 9.1);
      group.add(win);
    }
  }

  // 4) 1층 주 출입구 로비 캐노피
  const entryCanopyGeo = new THREE.BoxGeometry(6, 0.4, 3.5);
  const entryCanopy = new THREE.Mesh(entryCanopyGeo, mats.frameDark);
  entryCanopy.position.set(0, 3.4, 10.5);
  group.add(entryCanopy);

  return group;
}

// =============================================================================
// 7. 컴포넌트 6: 민·군 상생 복합 문화컨벤션 (곡선 아치형 지붕 + 개방형 캐노피 로비)
// =============================================================================
export function buildCivicConventionHall(mats: SmartCityMaterials): THREE.Group {
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

  // 2) 곡선 아치형 볼트 지붕
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
  archRoof.rotation.z = Math.PI / 2;
  archRoof.position.set(0, 10, 0);
  archRoof.castShadow = true;
  archRoof.receiveShadow = true;
  group.add(archRoof);

  // 아치 중앙 천창
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

  // 3) 개방형 캔틸레버 캐노피 로비
  const canopyWidth = 32;
  const canopyDepth = 12;
  const canopyGeo = new THREE.BoxGeometry(canopyWidth, 0.55, canopyDepth);
  const canopy = new THREE.Mesh(canopyGeo, mats.canopyWhite);
  canopy.position.set(0, 8.5, 25);
  canopy.castShadow = true;
  group.add(canopy);

  // 필로티 기둥 열주
  const colGeo = new THREE.CylinderGeometry(0.35, 0.35, 8.5, 16);
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
// 8. 컴포넌트 7: 부지 스마트 도로망 및 중앙 녹지 광장
// =============================================================================
export function buildSmartRoadAndGreenPlaza(mats: SmartCityMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smart_roads_and_plaza';

  // 1) 4차선 주 진입 도로 (16m 폭, 길이 240m)
  const mainRoadWidth = 16;
  const mainRoadLength = 240;
  const mainRoadGeo = new THREE.PlaneGeometry(mainRoadWidth, mainRoadLength);
  const mainRoad = new THREE.Mesh(mainRoadGeo, mats.asphaltRoad);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(-20, 0.05, 30);
  mainRoad.receiveShadow = true;
  group.add(mainRoad);

  // 중앙 노란색 복선 차선
  const yellowLineGeo = new THREE.PlaneGeometry(0.3, mainRoadLength);
  const yellowLine1 = new THREE.Mesh(yellowLineGeo, mats.roadMarkYellow);
  yellowLine1.rotation.x = -Math.PI / 2;
  yellowLine1.position.set(-20.25, 0.08, 30);
  group.add(yellowLine1);

  const yellowLine2 = new THREE.Mesh(yellowLineGeo, mats.roadMarkYellow);
  yellowLine2.rotation.x = -Math.PI / 2;
  yellowLine2.position.set(-19.75, 0.08, 30);
  group.add(yellowLine2);

  // 좌우 화이트 차선
  const whiteLane1 = new THREE.Mesh(yellowLineGeo, mats.roadMarkWhite);
  whiteLane1.rotation.x = -Math.PI / 2;
  whiteLane1.position.set(-24, 0.08, 30);
  group.add(whiteLane1);

  const whiteLane2 = new THREE.Mesh(yellowLineGeo, mats.roadMarkWhite);
  whiteLane2.rotation.x = -Math.PI / 2;
  whiteLane2.position.set(-16, 0.08, 30);
  group.add(whiteLane2);

  // 동서 연결 지선 도로
  const subRoadGeo = new THREE.PlaneGeometry(210, 12);
  const subRoad = new THREE.Mesh(subRoadGeo, mats.asphaltRoad);
  subRoad.rotation.x = -Math.PI / 2;
  subRoad.position.set(0, 0.06, 0);
  subRoad.receiveShadow = true;
  group.add(subRoad);

  // 2) 중앙 녹지 광장 (80m x 65m)
  const plazaGeo = new THREE.PlaneGeometry(80, 65);
  const plaza = new THREE.Mesh(plazaGeo, mats.plazaPavement);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.08, -10);
  plaza.receiveShadow = true;
  group.add(plaza);

  // 타원형 중앙 잔디 광장
  const grassGeo = new THREE.CylinderGeometry(26, 26, 0.2, 32);
  grassGeo.scale(1, 1, 0.72);
  const grass = new THREE.Mesh(grassGeo, mats.plazaGrass);
  grass.position.set(0, 0.2, -10);
  grass.receiveShadow = true;
  group.add(grass);

  // 중앙 원형 분수대
  const fountainRimGeo = new THREE.CylinderGeometry(7, 7.3, 0.8, 24);
  const fountainRim = new THREE.Mesh(fountainRimGeo, mats.wallPodium);
  fountainRim.position.set(0, 0.5, -10);
  group.add(fountainRim);

  const waterGeo = new THREE.CylinderGeometry(6.6, 6.6, 0.2, 24);
  const water = new THREE.Mesh(waterGeo, mats.waterSurface);
  water.position.set(0, 0.8, -10);
  group.add(water);

  // 3) [요구사항 2] 단지 입체 보행자 데크 (Pedestrian Skybridge & Deck, 2층 레벨 y = 5.2m)
  // - 메인 R&D 타워와 지식산업센터, 컨벤션을 연결하는 현대적 스카이워크
  const bridgeEastWestGeo = new THREE.BoxGeometry(110, 0.45, 3.8);
  const bridgeEW = new THREE.Mesh(bridgeEastWestGeo, mats.pedestrianDeck);
  bridgeEW.position.set(-5, 5.2, -45);
  bridgeEW.castShadow = true;
  group.add(bridgeEW);

  // 남북 연결 지선 브릿지 (컨벤션/광장 방향)
  const bridgeNorthSouthGeo = new THREE.BoxGeometry(3.8, 0.45, 60);
  const bridgeNS = new THREE.Mesh(bridgeNorthSouthGeo, mats.pedestrianDeck);
  bridgeNS.position.set(25, 5.2, -15);
  bridgeNS.castShadow = true;
  group.add(bridgeNS);

  // 보행 데크 투명 유리 난간 (양측)
  const glassRailingGeoEW = new THREE.BoxGeometry(110, 1.1, 0.1);
  const glassRailingEW1 = new THREE.Mesh(glassRailingGeoEW, mats.railingGlass);
  glassRailingEW1.position.set(-5, 5.95, -46.8);
  group.add(glassRailingEW1);

  const glassRailingEW2 = new THREE.Mesh(glassRailingGeoEW, mats.railingGlass);
  glassRailingEW2.position.set(-5, 5.95, -43.2);
  group.add(glassRailingEW2);

  // 보행 데크 하부 콘크리트 원형 교각 (20m 간격)
  const pierGeo = new THREE.CylinderGeometry(0.4, 0.5, 5.2, 12);
  const pierXs = [-50, -30, -10, 10, 30, 50];
  pierXs.forEach((px) => {
    const pier = new THREE.Mesh(pierGeo, mats.wallPodium);
    pier.position.set(px, 2.6, -45);
    pier.castShadow = true;
    group.add(pier);
  });

  // 4) [요구사항 2] 단지 전용 주차장 및 정밀 주차 구획선 (Parking Bays)
  const parkingWidth = 46;
  const parkingLength = 26;
  const parkingLotGeo = new THREE.PlaneGeometry(parkingWidth, parkingLength);
  const parkingLot = new THREE.Mesh(parkingLotGeo, mats.parkingAsphalt);
  parkingLot.rotation.x = -Math.PI / 2;
  parkingLot.position.set(45, 0.07, 24);
  parkingLot.receiveShadow = true;
  group.add(parkingLot);

  // 백색 주차 구획선 (2.5m x 5.0m 규격 스톨 라인 16개)
  const pLineGeo = new THREE.PlaneGeometry(0.15, 5.0);
  for (let s = -18; s <= 18; s += 2.6) {
    // 북측 스톨 라인
    const pLineNorth = new THREE.Mesh(pLineGeo, mats.parkingLineWhite);
    pLineNorth.rotation.x = -Math.PI / 2;
    pLineNorth.position.set(45 + s, 0.09, 15.5);
    group.add(pLineNorth);

    // 남측 스톨 라인
    const pLineSouth = new THREE.Mesh(pLineGeo, mats.parkingLineWhite);
    pLineSouth.rotation.x = -Math.PI / 2;
    pLineSouth.position.set(45 + s, 0.09, 32.5);
    group.add(pLineSouth);
  }

  // 친환경 전기차(EV) 전용 초록색 주차면 4개소
  const evBayGeo = new THREE.PlaneGeometry(2.3, 4.8);
  for (let ev = 0; ev < 4; ev++) {
    const evBay = new THREE.Mesh(evBayGeo, mats.parkingEvGreen);
    evBay.rotation.x = -Math.PI / 2;
    evBay.position.set(45 - 15.6 + ev * 2.6, 0.085, 15.5);
    group.add(evBay);

    // EV 급속 충전기 키오스크 (큐브)
    const chargerGeo = new THREE.BoxGeometry(0.5, 1.4, 0.4);
    const charger = new THREE.Mesh(chargerGeo, mats.wallConcrete);
    charger.position.set(45 - 15.6 + ev * 2.6, 0.7, 12.8);
    group.add(charger);

    const chargerScreenGeo = new THREE.BoxGeometry(0.3, 0.3, 0.05);
    const chargerScreen = new THREE.Mesh(chargerScreenGeo, mats.glowCyan);
    chargerScreen.position.set(45 - 15.6 + ev * 2.6, 1.0, 13.02);
    group.add(chargerScreen);
  }

  // 5) [요구사항 2] 단지 내부 가로수 및 조경수 (28그루 식재)
  const treeCount = 28;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2;
    const tx = Math.cos(angle) * 36;
    const tz = -10 + Math.sin(angle) * 28;

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.38, 2.6, 6);
    const trunk = new THREE.Mesh(trunkGeo, mats.treeTrunk);
    trunk.position.set(tx, 1.3, tz);
    trunk.castShadow = true;
    group.add(trunk);

    const foliageGeo = i % 2 === 0
      ? new THREE.DodecahedronGeometry(2.1, 1) // 활엽수
      : new THREE.ConeGeometry(2.0, 4.2, 6);    // 침엽수/소나무
    const foliage = new THREE.Mesh(foliageGeo, mats.treeFoliage);
    foliage.position.set(tx, 3.8, tz);
    foliage.castShadow = true;
    group.add(foliage);
  }

  return group;
}

// =============================================================================
// 9. 강원 6대 거점별 맞춤형 3D 스마트 복합단지(LOD2) 절차적 생성 라우터
// =============================================================================
export function buildComplexForSite(siteId: string, _mats: SmartCityMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = `complex_root_${siteId}`;
  // [1단계: 비정상적인 거대 가상 박스(더미 메쉬) 전면 삭제]
  // 실제 GIS 데이터(건물 외곽선 폴리곤)에 기반하지 않은 임의의 3D 박스 생성을 전면 중단
  return root;
}

function _disabled_buildComplexForSite(siteId: string, mats: SmartCityMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = `complex_root_${siteId}`;

  // 사이트 식별
  const targetSite = getGangwonMilitarySiteById(siteId);
  const canonicalId = targetSite ? targetSite.id : siteId;

  switch (canonicalId) {
    // 1) 원주 1군지사 이전부지 (첨단 국방·반도체 R&D 밸리 & 스마트 모빌리티 복합단지)
    case 'first-logistics-wonju':
    case 'wonju-1st-logistics': {
      // 1) 첨단 국방·반도체 R&D 메인 타워 (15층, 55m, 커튼월 + 옥탑 헬리패드)
      const rdTower = buildDefenseRDTower(mats);
      rdTower.position.set(-75, 0, -45);
      rdTower.rotation.y = (-12 * Math.PI) / 180;
      root.add(rdTower);

      // 2) 스마트 지식산업센터 (6층, 24m, 테라스 정원 + 태양광)
      const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
      knowledgeCenter.position.set(65, 0, -50);
      knowledgeCenter.rotation.y = (15 * Math.PI) / 180;
      root.add(knowledgeCenter);

      // 3) 스마트 군수·모빌리티 물류 데포 (아치 지붕 + 하역 셔터 도어)
      const depot = buildLogisticsDepot(mats);
      depot.position.set(-60, 0, 65);
      depot.rotation.y = (10 * Math.PI) / 180;
      root.add(depot);

      // 4) 민·군 상생 복합 문화컨벤션 (곡선 아치 루프 + 캐노피)
      const convention = buildCivicConventionHall(mats);
      convention.position.set(70, 0, 60);
      convention.rotation.y = (-8 * Math.PI) / 180;
      root.add(convention);

      // 5) 청년 창업 & 연구인력 지원 주거단지 (4층 박공형)
      const residential = buildStandardResidentialSupport(mats);
      residential.position.set(130, 0, 5);
      residential.rotation.y = (8 * Math.PI) / 180;
      root.add(residential);

      // 6) 스마트 부지 관제/통신 감시 타워 (18m 철골 트러스 + 레이더)
      const watchTower = buildTacticalWatchTower(mats);
      watchTower.position.set(-140, 0, 0);
      watchTower.rotation.y = (-15 * Math.PI) / 180;
      root.add(watchTower);
      break;
    }

    // 2) 원주 캠프 롱 반환부지 (의료·모빌리티 스마트 복합단지 & 바이오 R&D 밸리)
    case 'camp-long-wonju':
    case 'wonju-camp-long': {
      const rdTower = buildDefenseRDTower(mats);
      rdTower.position.set(-80, 0, -40);
      rdTower.rotation.y = (18 * Math.PI) / 180;
      root.add(rdTower);

      const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
      knowledgeCenter.position.set(75, 0, -45);
      knowledgeCenter.rotation.y = (-15 * Math.PI) / 180;
      root.add(knowledgeCenter);

      const depot = buildLogisticsDepot(mats);
      depot.position.set(-70, 0, 65);
      depot.rotation.y = (10 * Math.PI) / 180;
      root.add(depot);

      const residential = buildStandardResidentialSupport(mats);
      residential.position.set(75, 0, 60);
      residential.rotation.y = (-10 * Math.PI) / 180;
      root.add(residential);
      break;
    }

    // 3) 춘천 캠프 페이지 반환부지 (도심 첨단 문화·관광 복합타운 & 메가 랜드마크)
    case 'chuncheon-camp-page':
    case 'camp-page-chuncheon': {
      const convention = buildCivicConventionHall(mats);
      convention.position.set(0, 0, -45);
      convention.rotation.y = (24 * Math.PI) / 180;
      root.add(convention);

      const rdTower = buildDefenseRDTower(mats);
      rdTower.position.set(-85, 0, 35);
      rdTower.rotation.y = (20 * Math.PI) / 180;
      root.add(rdTower);

      const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
      knowledgeCenter.position.set(80, 0, 35);
      knowledgeCenter.rotation.y = (-20 * Math.PI) / 180;
      root.add(knowledgeCenter);
      break;
    }

    // 4) 춘천 102보충대 유휴부지 (바이오 테크노파크 & 평화·보훈 연수 힐링파크)
    case 'ch-102-chuncheon':
    case 'chuncheon-102-depot': {
      const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
      knowledgeCenter.position.set(-60, 0, -35);
      knowledgeCenter.rotation.y = (35 * Math.PI) / 180;
      root.add(knowledgeCenter);

      const depot = buildLogisticsDepot(mats);
      depot.position.set(65, 0, -35);
      depot.rotation.y = (-30 * Math.PI) / 180;
      root.add(depot);

      const residential = buildStandardResidentialSupport(mats);
      residential.position.set(-50, 0, 55);
      residential.rotation.y = (15 * Math.PI) / 180;
      root.add(residential);

      const watchTower = buildTacticalWatchTower(mats);
      watchTower.position.set(75, 0, 60);
      watchTower.rotation.y = (30 * Math.PI) / 180;
      root.add(watchTower);
      break;
    }

    // 5) 철원 접경 거점 (구 보병연대 - 민·군 상생 평화 스마트팜 & 전방 작전 클러스터)
    case 'cheorwon-infantry':
    case 'cheorwon-border-hub': {
      const watchTower1 = buildTacticalWatchTower(mats);
      watchTower1.position.set(75, 0, -45);
      watchTower1.rotation.y = (45 * Math.PI) / 180;
      root.add(watchTower1);

      const depot = buildLogisticsDepot(mats);
      depot.position.set(-65, 0, -30);
      depot.rotation.y = (50 * Math.PI) / 180;
      root.add(depot);

      const residential = buildStandardResidentialSupport(mats);
      residential.position.set(-55, 0, 50);
      residential.rotation.y = (40 * Math.PI) / 180;
      root.add(residential);

      const watchTower2 = buildTacticalWatchTower(mats);
      watchTower2.position.set(-85, 0, 80);
      watchTower2.rotation.y = (20 * Math.PI) / 180;
      root.add(watchTower2);
      break;
    }

    // 6) 인제 스마트물류 (기린면 - 전방 스마트 군수보급 물류 데포 & 산림 바이오 에코빌리지)
    case 'inje-girin':
    case 'inje-smart-logistics': {
      const depot = buildLogisticsDepot(mats);
      depot.position.set(-65, 0, -25);
      depot.rotation.y = (12 * Math.PI) / 180;
      root.add(depot);

      const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
      knowledgeCenter.position.set(65, 0, -35);
      knowledgeCenter.rotation.y = (-15 * Math.PI) / 180;
      root.add(knowledgeCenter);

      const residential = buildStandardResidentialSupport(mats);
      residential.position.set(55, 0, 50);
      residential.rotation.y = (-10 * Math.PI) / 180;
      root.add(residential);

      const watchTower = buildTacticalWatchTower(mats);
      watchTower.position.set(-75, 0, 60);
      watchTower.rotation.y = (20 * Math.PI) / 180;
      root.add(watchTower);
      break;
    }

    // 7) 동해·강릉 해양방산 스마트 클러스터 (기본 프리셋 폴백)
    default: {
      const rdTower = buildDefenseRDTower(mats);
      rdTower.position.set(-75, 0, -35);
      rdTower.rotation.y = (-15 * Math.PI) / 180;
      root.add(rdTower);

      const depot = buildLogisticsDepot(mats);
      depot.position.set(65, 0, -30);
      depot.rotation.y = (15 * Math.PI) / 180;
      root.add(depot);

      const knowledgeCenter = buildKnowledgeIndustryCenter(mats);
      knowledgeCenter.position.set(0, 0, 50);
      knowledgeCenter.rotation.y = 0;
      root.add(knowledgeCenter);
      break;
    }
  }

  return mergeSmartCityGroup(root, mats);
}

/**
 * [3단계: 다중 건물 단일 지오메트리 일괄 병합 (BufferGeometryUtils.mergeGeometries)]
 * - 수백 개로 분산된 개별 건물/도로/광장 메쉬를 5개 통합 메쉬로 압축
 * - GPU Draw Call을 수백 회에서 5회 이하로 98% 이상 감축
 */
export function mergeSmartCityGroup(root: THREE.Group, mats: SmartCityMaterials): THREE.Group {
  root.updateMatrixWorld(true);

  const wallGeoms: THREE.BufferGeometry[] = [];
  const glassGeoms: THREE.BufferGeometry[] = [];
  const groundGeoms: THREE.BufferGeometry[] = [];
  const greenGeoms: THREE.BufferGeometry[] = [];
  const accentGeoms: THREE.BufferGeometry[] = [];

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (!mesh.geometry) return;

      const nonIndexed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      nonIndexed.applyMatrix4(mesh.matrixWorld);

      // 속성 일치화 (position 및 normal만 유지하여 병합 무결성 확보)
      for (const attrName in nonIndexed.attributes) {
        if (attrName !== 'position' && attrName !== 'normal') {
          nonIndexed.deleteAttribute(attrName);
        }
      }
      if (!nonIndexed.attributes.normal) {
        nonIndexed.computeVertexNormals();
      }

      const mat = mesh.material;
      if (
        mat === mats.glassCurtainBlue ||
        mat === mats.glassCurtainCyan ||
        mat === mats.glassObservation ||
        mat === mats.glassCurtainSkyBlue ||
        mat === mats.waterSurface
      ) {
        glassGeoms.push(nonIndexed);
      } else if (
        mat === mats.plazaGrass ||
        mat === mats.terraceGrass ||
        mat === mats.treeFoliage
      ) {
        greenGeoms.push(nonIndexed);
      } else if (
        mat === mats.asphaltRoad ||
        mat === mats.plazaPavement ||
        mat === mats.pedestrianDeck ||
        mat === mats.parkingAsphalt ||
        mat === mats.parkingLineWhite ||
        mat === mats.roadMarkWhite ||
        mat === mats.roadMarkYellow
      ) {
        groundGeoms.push(nonIndexed);
      } else if (
        mat === mats.helipadYellow ||
        mat === mats.beaconRed ||
        mat === mats.parkingEvGreen
      ) {
        accentGeoms.push(nonIndexed);
      } else {
        wallGeoms.push(nonIndexed);
      }
    }
  });

  const mergedGroup = new THREE.Group();
  mergedGroup.name = 'merged-smart-city-complex';

  // 1) 구조체/외벽/슬래브 병합 메쉬
  if (wallGeoms.length > 0) {
    const geom = BufferGeometryUtils.mergeGeometries(wallGeoms, false);
    if (geom) {
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mats.wallConcrete);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mergedGroup.add(mesh);
    }
    wallGeoms.forEach((g) => g.dispose());
  }

  // 2) 블루 커튼월 반사 유리 병합 메쉬
  if (glassGeoms.length > 0) {
    const geom = BufferGeometryUtils.mergeGeometries(glassGeoms, false);
    if (geom) {
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mats.glassCurtainBlue);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mergedGroup.add(mesh);
    }
    glassGeoms.forEach((g) => g.dispose());
  }

  // 3) 스마트 도로/노면/보도블록 병합 메쉬
  if (groundGeoms.length > 0) {
    const geom = BufferGeometryUtils.mergeGeometries(groundGeoms, false);
    if (geom) {
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mats.asphaltRoad);
      mesh.receiveShadow = true;
      mergedGroup.add(mesh);
    }
    groundGeoms.forEach((g) => g.dispose());
  }

  // 4) 중앙 광장 & 테라스 조경 녹지 병합 메쉬
  if (greenGeoms.length > 0) {
    const geom = BufferGeometryUtils.mergeGeometries(greenGeoms, false);
    if (geom) {
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mats.terraceGrass);
      mesh.receiveShadow = true;
      mergedGroup.add(mesh);
    }
    greenGeoms.forEach((g) => g.dispose());
  }

  // 5) 헬리패드 마킹 & 항공 장애등 액센트 병합 메쉬
  if (accentGeoms.length > 0) {
    const geom = BufferGeometryUtils.mergeGeometries(accentGeoms, false);
    if (geom) {
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      const mesh = new THREE.Mesh(geom, mats.helipadYellow);
      mergedGroup.add(mesh);
    }
    accentGeoms.forEach((g) => g.dispose());
  }

  return mergedGroup;
}

// 하위 호환성을 위한 원주 1군지사 기본 복합단지 빌더 유지
export function createSmartCityComplexMesh(): THREE.Group {
  const mats = createSmartCityMaterials();
  return buildComplexForSite('first-logistics-wonju', mats);
}

// =============================================================================
// 10. MapLibre 3D 다중 거점 커스텀 레이어 (SmartCityComplex3DLayer)
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
  private materials: SmartCityMaterials | null = null;

  private directionalLight: THREE.DirectionalLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  private isVisible = true;
  private currentSiteId = 'first-logistics-wonju';
  private centerLngLat: [number, number] = FIRST_LOGISTICS_WONJU_CENTER;
  private clampedAltitude = 0;
  private rotationDeg = -12; // 부지 주축 각도
  private scaleY = 1; // 3D 건축물 즉각 100% 온전 렌더링
  private targetScaleY = 1;

  constructor(initialSiteId = 'first-logistics-wonju') {
    this.currentSiteId = initialSiteId;
    const site = getGangwonMilitarySiteById(initialSiteId);
    if (site) {
      this.centerLngLat = site.center;
      this.rotationDeg = site.rotationDeg;
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.targetScaleY = visible ? 1 : 0;
    if (visible) {
      this.scaleY = 1.0;
    }
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  /**
   * 실시간 거점 전환 (Site Switch): 기존 GPU 리소스 완벽 해제 후 새 부지 메쉬 구축
   */
  public setSite(siteId: string): void {
    if (!siteId) return;

    const site = getGangwonMilitarySiteById(siteId) || GANGWON_MILITARY_SITES[0];
    const targetId = site.id;

    // 이미 활성화된 동일 거점인 경우 리렌더링 바이패스
    if (this.currentSiteId === targetId && this.complexMesh) {
      this.setVisible(true);
      return;
    }

    this.currentSiteId = targetId;
    this.centerLngLat = site.center;
    this.rotationDeg = site.rotationDeg;

    // 기존 3D 복합단지 메쉬 완전 소멸 (GPU 버퍼 메모리 해제)
    if (this.complexMesh) {
      this.scene.remove(this.complexMesh);
      this.disposeObject(this.complexMesh);
      this.complexMesh = null;
    }

    // 신규 부지 전용 LOD2 복합단지 메쉬 절차적 생성
    if (this.materials) {
      this.complexMesh = buildComplexForSite(targetId, this.materials);
      this.complexMesh.traverse((child) => {
        child.frustumCulled = false;
      });
      this.scene.add(this.complexMesh);
    }

    // 솟아오름(Rise-Up) 보간 즉각 완료
    this.scaleY = 1.0;
    this.targetScaleY = 1.0;
    this.isVisible = true;

    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getCurrentSiteId(): string {
    return this.currentSiteId;
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
      this.camera.matrixAutoUpdate = false;

      // 1. 공통 머티리얼 팔레트 인스턴스화
      this.materials = createSmartCityMaterials();

      // 2. 3점 조명 설정 (Three-Point Lighting)
      this.directionalLight = new THREE.DirectionalLight(0xfffbeb, 1.1);
      this.directionalLight.position.set(120, 180, 100).normalize();
      this.directionalLight.castShadow = false;
      this.scene.add(this.directionalLight);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 0.85);
      this.scene.add(this.hemisphereLight);

      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      this.scene.add(this.ambientLight);

      this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.35);
      this.fillLight.position.set(-80, 100, 80).normalize();
      this.scene.add(this.fillLight);

      // 3. 현재 거점에 대응하는 스마트 복합단지 절차적 생성
      this.complexMesh = buildComplexForSite(this.currentSiteId, this.materials);
      this.complexMesh.traverse((child) => {
        child.frustumCulled = false;
      });
      this.scene.add(this.complexMesh);

      // 4. WebGLRenderer 연동
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
        const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
        this.renderer.setPixelRatio(pr);
      } catch (err) {
        console.warn('[SmartCityComplex3DLayer] WebGLRenderer setup notice:', err);
      }
    } catch (onAddErr) {
      console.warn('[SmartCityComplex3DLayer] onAdd exception caught:', onAddErr);
    }
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.renderer || !this.complexMesh || this.complexMesh.children.length === 0) {
      return;
    }

    try {
      const rawMatrix =
        options?.defaultProjectionData?.mainMatrix ||
        options?.modelViewProjectionMatrix ||
        options;
      if (!rawMatrix) return;

      // 0. 부드러운 솟아오름(Rise-Up) 보간 애니메이션 (0.05 -> 1.0)
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

      // 1. [3D 지형 DEM 표고 밀착 (Terrain Clamping)] - 캐시 기반 1회 계산
      if (this.map) {
        const queried = elevationCache.getFromMap(this.map, this.centerLngLat);
        if (queried !== null && queried !== undefined && !Number.isNaN(queried) && Number.isFinite(queried)) {
          this.clampedAltitude = queried;
        } else {
          this.clampedAltitude = 0;
        }
      } else {
        this.clampedAltitude = 0;
      }

      // 2. Mercator 좌표계 투영 (부지 표고에 정확히 스냅)
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
      const prevFbo = gl ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.renderer.resetState();

      if (gl && typeof (gl as any).bindFramebuffer === 'function') {
        (gl as any).bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
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

    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      this.directionalLight.dispose();
      this.directionalLight = null;
    }
    if (this.hemisphereLight) {
      this.scene.remove(this.hemisphereLight);
      this.hemisphereLight.dispose();
      this.hemisphereLight = null;
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

    if (this.materials) {
      Object.values(this.materials).forEach((mat) => {
        if (mat && typeof mat.dispose === 'function') mat.dispose();
      });
      this.materials = null;
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
