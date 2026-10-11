import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BuildingMassPresetId } from '@/types/map';

/**
 * 3D 모델 프리셋 생성기 및 glTF 파이프라인
 * - 방위산업 R&D 캠퍼스 (유리 커튼월, 헬리패드 H, 연결 스카이브릿지)
 * - 군수·스마트 물류센터 (박공지붕, 화물 독, 옥상 태양광 패널 그리드)
 * - 민·군 복합 타운 (3단 테라스 주거/복지, 조경 중정 녹지, 수변 분수)
 */

// -----------------------------------------------------------------------------
// 공통 머티리얼 캐시 (PBR 물리 기반 재질 튜닝)
// -----------------------------------------------------------------------------
const materials = {
  // [벽면(Wall)] 연회색 무광 콘크리트 질감 (roughness: 0.7, metalness: 0.1)
  wallConcrete: new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.7,
    metalness: 0.1,
  }),
  // [창문(Window)] 반사 하이라이트 글래스 재질 (roughness: 0.2, metalness: 0.8)
  windowGlass: new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.82,
  }),
  // [옥상(Roof)] 방수 우레탄 짙은 청회색 마감 (#1e293b, roughness: 0.9)
  roofWaterproof: new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.9,
    metalness: 0.15,
  }),
  // 옥탑 기계실 / 엘리베이터 코어 외벽
  penthouseCore: new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.65,
    metalness: 0.2,
  }),
  // 공조 설비 칠러 / 환기 루버 메탈릭
  hvacMetal: new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.35,
    metalness: 0.75,
  }),
  // 옥상 난간 (Parapet / Railing)
  railingParapet: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.4,
    roughness: 0.5,
  }),

  // R&D 캠퍼스 호환 머티리얼
  glassCurtain: new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 0.82,
  }),
  glassCyan: new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    metalness: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 0.78,
  }),
  frameMetal: new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.9,
    roughness: 0.25,
  }),
  floorSlab: new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.7,
    metalness: 0.2,
  }),
  helipadBase: new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.85,
  }),
  helipadMark: new THREE.MeshStandardMaterial({
    color: 0xfacc15, // Bright yellow
    roughness: 0.4,
  }),
  warningRed: new THREE.MeshBasicMaterial({
    color: 0xef4444,
  }),

  // 스마트 물류센터
  warehouseWall: new THREE.MeshStandardMaterial({
    color: 0x64748b, // Slate panel
    metalness: 0.4,
    roughness: 0.5,
  }),
  warehouseTrim: new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.7,
    roughness: 0.3,
  }),
  roofMetal: new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.6,
    roughness: 0.4,
  }),
  dockDoor: new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.5,
    roughness: 0.4,
  }),
  dockHazard: new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.5,
  }),
  solarCell: new THREE.MeshStandardMaterial({
    color: 0x0b1f3a, // Deep solar navy
    metalness: 0.9,
    roughness: 0.1,
  }),
  solarFrame: new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.8,
    roughness: 0.2,
  }),
  craneYellow: new THREE.MeshStandardMaterial({
    color: 0xeab308,
    metalness: 0.6,
    roughness: 0.4,
  }),

  // 민·군 복합 타운
  warmLimestone: new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.85,
  }),
  terraceWood: new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.7,
  }),
  treeTrunk: new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.9,
  }),
  treeFoliageA: new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.8,
  }),
  treeFoliageB: new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.75,
  }),
  waterPlaza: new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    metalness: 0.95,
    roughness: 0.05,
    transparent: true,
    opacity: 0.8,
  }),
  pavingWalkway: new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.9,
  }),
};

/**
 * 1. [방위산업 R&D 캠퍼스] 정밀 3D 모델
 * - 투명 유리 커튼월 타워 (층간 슬래브 노출)
 * - 옥상 헬리패드 (원형 플레이트 및 H 마크, 외곽 유도등)
 * - 본관-연구시험동 연결 공중 스카이브릿지
 * - 안테나 레이더 타워
 */
export function createDefenseRDCampus(scaleRatio = 1): THREE.Group {
  const root = new THREE.Group();

  // 1-1. 메인 R&D 타워 본관 (가로 32m x 세로 22m x 높이 24m)
  const towerW = 32 * scaleRatio;
  const towerD = 22 * scaleRatio;
  const towerH = 24 * scaleRatio;
  const towerX = -10 * scaleRatio;
  const towerZ = 0;

  // 커튼월 유리 외벽
  const glassGeo = new THREE.BoxGeometry(towerW, towerH, towerD);
  const glassMesh = new THREE.Mesh(glassGeo, materials.glassCurtain);
  glassMesh.position.set(towerX, towerH / 2, towerZ);
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;
  root.add(glassMesh);

  // 내부 층간 슬래브 (3.5m 간격 층 슬래브 6개)
  const floorCount = 6;
  const slabH = 0.4 * scaleRatio;
  const slabGeo = new THREE.BoxGeometry(towerW * 0.96, slabH, towerD * 0.96);
  for (let i = 1; i <= floorCount; i++) {
    const slabMesh = new THREE.Mesh(slabGeo, materials.floorSlab);
    slabMesh.position.set(towerX, (i * (towerH / (floorCount + 1))), towerZ);
    root.add(slabMesh);
  }

  // 코너 수직 알루미늄 멀리언 기둥
  const mullionGeo = new THREE.BoxGeometry(0.6 * scaleRatio, towerH, 0.6 * scaleRatio);
  const cornerOffsets = [
    [-towerW / 2, -towerD / 2],
    [towerW / 2, -towerD / 2],
    [-towerW / 2, towerD / 2],
    [towerW / 2, towerD / 2],
  ];
  cornerOffsets.forEach(([dx, dz]) => {
    const mMesh = new THREE.Mesh(mullionGeo, materials.frameMetal);
    mMesh.position.set(towerX + dx, towerH / 2, towerZ + dz);
    root.add(mMesh);
  });

  // 옥탑 기계실 (Penthouse)
  const phW = 14 * scaleRatio;
  const phD = 12 * scaleRatio;
  const phH = 3.5 * scaleRatio;
  const phGeo = new THREE.BoxGeometry(phW, phH, phD);
  const phMesh = new THREE.Mesh(phGeo, materials.frameMetal);
  phMesh.position.set(towerX - 4 * scaleRatio, towerH + phH / 2, towerZ);
  root.add(phMesh);

  // 1-2. 옥상 헬리패드 (반경 7m 원형 데크 및 H 마크)
  const helipadRadius = 7 * scaleRatio;
  const helipadDeckH = 0.3 * scaleRatio;
  const helipadPos = new THREE.Vector3(towerX + 5 * scaleRatio, towerH + helipadDeckH / 2, towerZ);

  // 원형 베이스
  const padGeo = new THREE.CylinderGeometry(helipadRadius, helipadRadius, helipadDeckH, 32);
  const padMesh = new THREE.Mesh(padGeo, materials.helipadBase);
  padMesh.position.copy(helipadPos);
  root.add(padMesh);

  // 노란색 외곽 링
  const ringGeo = new THREE.RingGeometry(helipadRadius * 0.82, helipadRadius * 0.92, 32);
  const ringMesh = new THREE.Mesh(ringGeo, materials.helipadMark);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.set(helipadPos.x, helipadPos.y + 0.16 * scaleRatio, helipadPos.z);
  root.add(ringMesh);

  // 헬리패드 'H' 마크
  const hBarW = 0.7 * scaleRatio;
  const hBarL = 4.2 * scaleRatio;
  const hBarThick = 0.05 * scaleRatio;
  const barGeo = new THREE.BoxGeometry(hBarW, hBarThick, hBarL);
  const crossGeo = new THREE.BoxGeometry(2.4 * scaleRatio, hBarThick, hBarW);

  const leftBar = new THREE.Mesh(barGeo, materials.helipadMark);
  leftBar.position.set(helipadPos.x - 1.2 * scaleRatio, helipadPos.y + 0.17 * scaleRatio, helipadPos.z);
  root.add(leftBar);

  const rightBar = new THREE.Mesh(barGeo, materials.helipadMark);
  rightBar.position.set(helipadPos.x + 1.2 * scaleRatio, helipadPos.y + 0.17 * scaleRatio, helipadPos.z);
  root.add(rightBar);

  const centerBar = new THREE.Mesh(crossGeo, materials.helipadMark);
  centerBar.position.set(helipadPos.x, helipadPos.y + 0.17 * scaleRatio, helipadPos.z);
  root.add(centerBar);

  // 항공 장애 경고등 (적색 LED)
  const lightOffsets = [
    [-towerW / 2 + 0.5, towerH + 0.5, -towerD / 2 + 0.5],
    [towerW / 2 - 0.5, towerH + 0.5, -towerD / 2 + 0.5],
    [-towerW / 2 + 0.5, towerH + 0.5, towerD / 2 - 0.5],
    [towerW / 2 - 0.5, towerH + 0.5, towerD / 2 - 0.5],
  ];
  const beaconGeo = new THREE.SphereGeometry(0.4 * scaleRatio, 8, 8);
  lightOffsets.forEach(([lx, ly, lz]) => {
    const beacon = new THREE.Mesh(beaconGeo, materials.warningRed);
    beacon.position.set(towerX + lx * scaleRatio, ly * scaleRatio, towerZ + lz * scaleRatio);
    root.add(beacon);
  });

  // 1-3. 첨단 시험분석동 (동측 별관: 20m x 18m x 11m)
  const wingW = 20 * scaleRatio;
  const wingD = 18 * scaleRatio;
  const wingH = 11 * scaleRatio;
  const wingX = 22 * scaleRatio;
  const wingZ = 0;

  const wingGeo = new THREE.BoxGeometry(wingW, wingH, wingD);
  const wingMesh = new THREE.Mesh(wingGeo, materials.glassCyan);
  wingMesh.position.set(wingX, wingH / 2, wingZ);
  wingMesh.castShadow = true;
  root.add(wingMesh);

  // 1-4. 본관과 시험동을 잇는 공중 스카이브릿지 (Skybridge: 길이 12m x 폭 4m x 높이 3.5m, 지상 8m 공중)
  const bridgeL = (wingX - wingW / 2) - (towerX + towerW / 2); // 거리
  const bridgeW = 4 * scaleRatio;
  const bridgeH = 3.6 * scaleRatio;
  const bridgeY = 9 * scaleRatio;
  const bridgeCenterX = (towerX + towerW / 2 + wingX - wingW / 2) / 2;

  const bridgeGeo = new THREE.BoxGeometry(bridgeL, bridgeH, bridgeW);
  const bridgeMesh = new THREE.Mesh(bridgeGeo, materials.glassCurtain);
  bridgeMesh.position.set(bridgeCenterX, bridgeY, towerZ);
  root.add(bridgeMesh);

  // 브릿지 하부 지지 트러스 기둥
  const bridgeColGeo = new THREE.CylinderGeometry(0.35 * scaleRatio, 0.35 * scaleRatio, bridgeY - bridgeH / 2, 8);
  const bridgeCol = new THREE.Mesh(bridgeColGeo, materials.frameMetal);
  bridgeCol.position.set(bridgeCenterX, (bridgeY - bridgeH / 2) / 2, towerZ);
  root.add(bridgeCol);

  // 1-5. 옥상 레이더 / 안테나 마스트 (Penthouse 상단)
  const mastGeo = new THREE.CylinderGeometry(0.15 * scaleRatio, 0.25 * scaleRatio, 7 * scaleRatio, 8);
  const mastMesh = new THREE.Mesh(mastGeo, materials.frameMetal);
  mastMesh.position.set(towerX - 4 * scaleRatio, towerH + phH + 3.5 * scaleRatio, towerZ);
  root.add(mastMesh);

  const radomeGeo = new THREE.SphereGeometry(1.2 * scaleRatio, 16, 16);
  const radomeMesh = new THREE.Mesh(radomeGeo, materials.warmLimestone);
  radomeMesh.position.set(towerX - 4 * scaleRatio, towerH + phH + 7.5 * scaleRatio, towerZ);
  root.add(radomeMesh);

  return root;
}

/**
 * 2. [군수·스마트 물류센터] 정밀 3D 모델
 * - 대형 물류 창고 트러스 박공지붕 (Gabled Truss Roof)
 * - 6베이 화물 하역 도크 (Loading Dock Roll-up Doors & Hazard Stripes)
 * - 옥상 태양광 패널 그리드 (Solar Array 24모듈 경사각 배치)
 * - 군수 지원 갠트리 크레인 구조물
 */
export function createSmartLogisticsHub(scaleRatio = 1): THREE.Group {
  const root = new THREE.Group();

  // 2-1. 대형 물류 창고 메인 허브 (가로 48m x 세로 28m x 벽높이 12m)
  const hubW = 48 * scaleRatio;
  const hubD = 28 * scaleRatio;
  const wallH = 11 * scaleRatio;
  const roofApexH = 4.5 * scaleRatio; // 박공 높이 (총고 15.5m)

  // 메인 벽체
  const wallGeo = new THREE.BoxGeometry(hubW, wallH, hubD);
  const wallMesh = new THREE.Mesh(wallGeo, materials.warehouseWall);
  wallMesh.position.set(0, wallH / 2, 0);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  root.add(wallMesh);

  // 박공지붕 (Prism 형태)
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-hubD / 2, 0);
  roofShape.lineTo(0, roofApexH);
  roofShape.lineTo(hubD / 2, 0);
  roofShape.closePath();

  const extrudeSettings = {
    steps: 1,
    depth: hubW + 1 * scaleRatio, // 양쪽 처마
    bevelEnabled: false,
  };
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
  const roofMesh = new THREE.Mesh(roofGeo, materials.roofMetal);
  roofMesh.rotation.y = Math.PI / 2;
  roofMesh.position.set(-hubW / 2 - 0.5 * scaleRatio, wallH, 0);
  roofMesh.castShadow = true;
  root.add(roofMesh);

  // 2-2. 전면 화물 하역 도크 (Loading Dock: 6개 베이 도어)
  const dockCount = 6;
  const dockW = 3.6 * scaleRatio;
  const dockH = 4.2 * scaleRatio;
  const dockSpacing = 5.8 * scaleRatio;
  const startX = -((dockCount - 1) * dockSpacing) / 2;

  const doorGeo = new THREE.BoxGeometry(dockW, dockH, 0.2 * scaleRatio);
  const bumperGeo = new THREE.BoxGeometry(dockW + 0.4 * scaleRatio, 0.4 * scaleRatio, 0.4 * scaleRatio);

  for (let i = 0; i < dockCount; i++) {
    const dx = startX + i * dockSpacing;
    const dz = hubD / 2 + 0.1 * scaleRatio;

    // 롤업 셔터 도어
    const doorMesh = new THREE.Mesh(doorGeo, materials.dockDoor);
    doorMesh.position.set(dx, dockH / 2 + 0.3 * scaleRatio, dz);
    root.add(doorMesh);

    // 하역 범퍼 / 안전 발판
    const bMesh = new THREE.Mesh(bumperGeo, materials.dockHazard);
    bMesh.position.set(dx, 0.2 * scaleRatio, dz + 0.2 * scaleRatio);
    root.add(bMesh);

    // 도크 상부 비가림 캐노피
    const canopyGeo = new THREE.BoxGeometry(dockW + 0.8 * scaleRatio, 0.25 * scaleRatio, 1.5 * scaleRatio);
    const canopy = new THREE.Mesh(canopyGeo, materials.warehouseTrim);
    canopy.position.set(dx, dockH + 0.5 * scaleRatio, dz + 0.7 * scaleRatio);
    root.add(canopy);
  }

  // 2-3. 옥상 친환경 태양광 패널 어레이 (Solar Grid: 남향 25도 경사각, 4행 x 6열 = 24모듈)
  const solarRows = 3;
  const solarCols = 7;
  const panelW = 4.5 * scaleRatio;
  const panelD = 2.2 * scaleRatio;
  const panelThick = 0.1 * scaleRatio;

  const solarPanelGeo = new THREE.BoxGeometry(panelW, panelThick, panelD);
  const solarTilt = THREE.MathUtils.degToRad(-22); // 남향 경사

  const colSpacing = 5.5 * scaleRatio;
  const rowSpacing = 3.8 * scaleRatio;
  const solarStartX = -((solarCols - 1) * colSpacing) / 2;
  const solarStartZ = -6 * scaleRatio;

  for (let r = 0; r < solarRows; r++) {
    for (let c = 0; c < solarCols; c++) {
      const px = solarStartX + c * colSpacing;
      const pz = solarStartZ + r * rowSpacing;
      // 지붕 경사면 표고 계산
      const localRoofY = wallH + roofApexH * (1 - Math.abs(pz) / (hubD / 2)) + 0.35 * scaleRatio;

      const pMesh = new THREE.Mesh(solarPanelGeo, materials.solarCell);
      pMesh.rotation.x = solarTilt;
      pMesh.position.set(px, localRoofY, pz);
      root.add(pMesh);
    }
  }

  // 2-4. 측면 군수 컨테이너 갠트리 크레인 (서측 야적장)
  const craneX = -hubW / 2 - 8 * scaleRatio;
  const craneH = 14 * scaleRatio;
  const craneSpan = 12 * scaleRatio;

  // 크레인 수직 포털 다리 2개
  const legGeo = new THREE.BoxGeometry(0.8 * scaleRatio, craneH, 0.8 * scaleRatio);
  const leg1 = new THREE.Mesh(legGeo, materials.craneYellow);
  leg1.position.set(craneX, craneH / 2, -craneSpan / 2);
  root.add(leg1);

  const leg2 = new THREE.Mesh(legGeo, materials.craneYellow);
  leg2.position.set(craneX, craneH / 2, craneSpan / 2);
  root.add(leg2);

  // 상단 거더 빔
  const beamGeo = new THREE.BoxGeometry(1.2 * scaleRatio, 1.2 * scaleRatio, craneSpan + 2 * scaleRatio);
  const beam = new THREE.Mesh(beamGeo, materials.craneYellow);
  beam.position.set(craneX, craneH - 0.6 * scaleRatio, 0);
  root.add(beam);

  // 2-5. 옥상 환기 벤트 (Ventilation Hoods 4기)
  const ventGeo = new THREE.CylinderGeometry(0.8 * scaleRatio, 0.8 * scaleRatio, 1.2 * scaleRatio, 12);
  const ventOffsets = [-15, -5, 5, 15];
  ventOffsets.forEach((vx) => {
    const vMesh = new THREE.Mesh(ventGeo, materials.warehouseTrim);
    vMesh.position.set(vx * scaleRatio, wallH + roofApexH + 0.6 * scaleRatio, 0);
    root.add(vMesh);
  });

  return root;
}

/**
 * 3. [민·군 복합 타운] 정밀 3D 모델
 * - 3단 계단식 테라스 주거/복지시설 (Stepped Terrace Blocks)
 * - 옥상 조경 우든 데크 테라스 & 녹지 플랜터
 * - 중정(Courtyard) 녹지 공간, 3D 수목(나무) 배치
 * - 중앙 수변 분수 광장 (Water Plaza) 및 산책로 파고라
 */
export function createCivilMilitaryTown(scaleRatio = 1): THREE.Group {
  const root = new THREE.Group();

  // 3-1. 3단 계단식 테라스 본동 (Tier 1: 4m, Tier 2: 8.5m, Tier 3: 13.5m)
  // 기단부 (Tier 1: 복합 공공/커뮤니티)
  const t1W = 42 * scaleRatio;
  const t1D = 32 * scaleRatio;
  const t1H = 4.2 * scaleRatio;
  const t1Geo = new THREE.BoxGeometry(t1W, t1H, t1D);
  const t1Mesh = new THREE.Mesh(t1Geo, materials.warmLimestone);
  t1Mesh.position.set(0, t1H / 2, 0);
  t1Mesh.castShadow = true;
  root.add(t1Mesh);

  // 중층부 (Tier 2: 복지/의료/창업 지원동)
  const t2W = 32 * scaleRatio;
  const t2D = 22 * scaleRatio;
  const t2H = 4.2 * scaleRatio;
  const t2Geo = new THREE.BoxGeometry(t2W, t2H, t2D);
  const t2Mesh = new THREE.Mesh(t2Geo, materials.warmLimestone);
  t2Mesh.position.set(-2 * scaleRatio, t1H + t2H / 2, -2 * scaleRatio);
  t2Mesh.castShadow = true;
  root.add(t2Mesh);

  // 상층부 (Tier 3: 테라스 주거동)
  const t3W = 20 * scaleRatio;
  const t3D = 14 * scaleRatio;
  const t3H = 4.5 * scaleRatio;
  const t3Geo = new THREE.BoxGeometry(t3W, t3H, t3D);
  const t3Mesh = new THREE.Mesh(t3Geo, materials.warmLimestone);
  t3Mesh.position.set(-5 * scaleRatio, t1H + t2H + t3H / 2, -4 * scaleRatio);
  t3Mesh.castShadow = true;
  root.add(t3Mesh);

  // 3-2. 테라스 우든 데크 및 난간 (Tier 1 & Tier 2 상단 오픈 스페이스)
  const deck1Geo = new THREE.BoxGeometry(10 * scaleRatio, 0.2 * scaleRatio, 18 * scaleRatio);
  const deck1 = new THREE.Mesh(deck1Geo, materials.terraceWood);
  deck1.position.set(13 * scaleRatio, t1H + 0.1 * scaleRatio, 0);
  root.add(deck1);

  const deck2Geo = new THREE.BoxGeometry(9 * scaleRatio, 0.2 * scaleRatio, 10 * scaleRatio);
  const deck2 = new THREE.Mesh(deck2Geo, materials.terraceWood);
  deck2.position.set(8 * scaleRatio, t1H + t2H + 0.1 * scaleRatio, 2 * scaleRatio);
  root.add(deck2);

  // 3-3. 중앙 중정(Courtyard) 녹지 & 원형 수변 분수 광장
  const plazaRadius = 5.5 * scaleRatio;
  const plazaGeo = new THREE.CylinderGeometry(plazaRadius, plazaRadius, 0.2 * scaleRatio, 32);
  const plazaMesh = new THREE.Mesh(plazaGeo, materials.waterPlaza);
  plazaMesh.position.set(7 * scaleRatio, 0.15 * scaleRatio, 10 * scaleRatio);
  root.add(plazaMesh);

  // 분수 림 테두리
  const rimGeo = new THREE.TorusGeometry(plazaRadius, 0.3 * scaleRatio, 8, 32);
  const rimMesh = new THREE.Mesh(rimGeo, materials.warmLimestone);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.set(7 * scaleRatio, 0.3 * scaleRatio, 10 * scaleRatio);
  root.add(rimMesh);

  // 3-4. 중정 수목 (Procedural 3D Trees 6그루)
  const treePositions = [
    [16, 8],
    [14, 16],
    [-8, 14],
    [-15, 12],
    [-16, 2],
    [3, 18],
  ];

  const trunkGeo = new THREE.CylinderGeometry(0.25 * scaleRatio, 0.35 * scaleRatio, 2.5 * scaleRatio, 6);
  const foliageGeoA = new THREE.ConeGeometry(1.8 * scaleRatio, 3.8 * scaleRatio, 7);
  const foliageGeoB = new THREE.SphereGeometry(1.6 * scaleRatio, 7, 6);

  treePositions.forEach(([tx, tz], idx) => {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(tx * scaleRatio, 0, tz * scaleRatio);

    // 줄기
    const trunk = new THREE.Mesh(trunkGeo, materials.treeTrunk);
    trunk.position.y = 1.25 * scaleRatio;
    treeGroup.add(trunk);

    // 잎 (교목/침엽수 혼합)
    const foliageMat = idx % 2 === 0 ? materials.treeFoliageA : materials.treeFoliageB;
    const foliageMesh =
      idx % 2 === 0
        ? new THREE.Mesh(foliageGeoA, foliageMat)
        : new THREE.Mesh(foliageGeoB, foliageMat);
    foliageMesh.position.y = 3.4 * scaleRatio;
    treeGroup.add(foliageMesh);

    root.add(treeGroup);
  });

  // 3-5. 보행자 산책로 파고라 (Pergola Shade Canopy)
  const pergolaL = 14 * scaleRatio;
  const pergolaW = 2.8 * scaleRatio;
  const pergolaH = 3.2 * scaleRatio;
  const pRoofGeo = new THREE.BoxGeometry(pergolaL, 0.15 * scaleRatio, pergolaW);
  const pRoof = new THREE.Mesh(pRoofGeo, materials.warehouseTrim);
  pRoof.position.set(-6 * scaleRatio, pergolaH, 12 * scaleRatio);
  root.add(pRoof);

  // 파고라 기둥들
  const pColGeo = new THREE.CylinderGeometry(0.12 * scaleRatio, 0.12 * scaleRatio, pergolaH, 6);
  [-5, 0, 5].forEach((px) => {
    [-pergolaW / 2 + 0.2, pergolaW / 2 - 0.2].forEach((pz) => {
      const col = new THREE.Mesh(pColGeo, materials.warehouseTrim);
      col.position.set(-6 * scaleRatio + px * scaleRatio, pergolaH / 2, 12 * scaleRatio + pz);
      root.add(col);
    });
  });

  return root;
}

/**
 * 4. 프리셋 ID에 따른 Three.js 모델 생성
 */
export function buildPreset3DModel(
  presetId: BuildingMassPresetId,
  scaleRatio = 1
): THREE.Group {
  switch (presetId) {
    case 'smart_logistics':
      return createSmartLogisticsHub(scaleRatio);
    case 'civil_military':
      return createCivilMilitaryTown(scaleRatio);
    case 'defense_rd':
    default:
      return createDefenseRDCampus(scaleRatio);
  }
}

/**
 * 5. 외부 .gltf / .glb 파일 비동기 로더 파이프라인
 */
export async function loadExternalGLTFModel(
  url: string,
  targetBoundingSize = 40
): Promise<THREE.Group> {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;

        // 경계 박스 계산 및 중심점/스케일 자동 정규화
        const bbox = new THREE.Box3().setFromObject(scene);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        // 원점으로 중심 이동 (바닥은 y = 0에 밀착)
        scene.position.x = -center.x;
        scene.position.y = -bbox.min.y;
        scene.position.z = -center.z;

        const maxDim = Math.max(size.x, size.z, 1);
        const scale = targetBoundingSize / maxDim;

        const wrapper = new THREE.Group();
        wrapper.scale.set(scale, scale, scale);
        wrapper.add(scene);

        // 그림자 및 셰이더 활성화
        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        resolve(wrapper);
      },
      undefined,
      (error) => {
        console.error('[Three.js GLTFLoader] Failed to load glTF model:', error);
        reject(error);
      }
    );
  });
}
