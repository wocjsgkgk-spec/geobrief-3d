/**
 * utils/koreanRoadSignBuilder.ts
 *
 * [GeoBrief 3D: 국토교통부·한국도로공사 표준 문형식 3D 도로 안내 이정표 엔진]
 *
 * 1. 문형식(Overhead Gantry) 철골 구조체:
 *    - 좌/우 원형 강관 기둥 (아연도금 강판 #64748b, 방청 도장)
 *    - 상단 수평 트러스 빔 (높이 6.5m 클리어런스로 도로 상공 횡단)
 *
 * 2. 한국 도로표지 규칙(국토교통부령) 표준 규격 표지판:
 *    - 녹색 고속도로 표지판 (#15803d): 고속국도 노선번호 쉴드 + 나들목 명칭 + 영문 병기
 *    - 청색 일반국도 표지판 (#1d4ed8): 국도 타원 마크(5, 42) + 도로명(북원로, 서원대로) + 방향 유도 화살표
 *    - 캔버스 2D 텍스처 -> Three.js MeshStandardMaterial (야간 발광 Emissive 지원)
 */

import * as THREE from 'three';

export interface RoadSignGantrySpec {
  id: string;
  coords: [number, number]; // [lng, lat]
  headingDeg: number;       // 도로 횡단 방향 (각도)
  widthM: number;           // 문형식 폭 (차선 폭 14m~20m)
  heightM: number;          // 기둥 높이 (7.2m)
  signType: 'highway' | 'national' | 'urban';
  routeNumber?: number;     // 국도 번호(5, 42) 또는 고속도로 번호(50)
  titleKor: string;
  subTitleKor: string;
  destKmText?: string;
}

export const GANGWON_CORE_ROAD_SIGNS: RoadSignGantrySpec[] = [
  // 1. 원주 1군지사 부지 정문 북원로 (국도 5호선) 관문 이정표
  {
    id: 'gantry-wonju-bukwon-1',
    coords: [127.9358, 37.3606],
    headingDeg: 78,
    widthM: 16.0,
    heightM: 7.2,
    signType: 'national',
    routeNumber: 5,
    titleKor: '북원로 (국도 5호선)',
    subTitleKor: '우산동 · 학성동 ↑  |  원주IC 3.1km',
    destKmText: '우산철교사거리',
  },
  // 2. 우산로 상지대학교 방면 이정표
  {
    id: 'gantry-wonju-usan-1',
    coords: [127.9342, 37.3618],
    headingDeg: 125,
    widthM: 14.0,
    heightM: 7.0,
    signType: 'urban',
    titleKor: '우산로',
    subTitleKor: '상지대학교 ↑  |  원주역 5.1km',
    destKmText: '1군지사 개발지구 입구',
  },
  // 3. 영동고속도로 원주IC 진출입로 고속도로 이정표
  {
    id: 'gantry-wonju-ic-1',
    coords: [127.9610, 37.3775],
    headingDeg: 45,
    widthM: 18.0,
    heightM: 7.5,
    signType: 'highway',
    routeNumber: 50,
    titleKor: '영동고속도로 원주IC',
    subTitleKor: '강릉 ↑  |  서울 · 춘천 (중앙선 JCT)',
    destKmText: '고속도로 진입 300m 앞',
  },
  // 4. 서원대로 시외버스터미널 사거리 (국도 42호선) 이정표
  {
    id: 'gantry-wonju-terminal-1',
    coords: [127.9385, 37.3512],
    headingDeg: 92,
    widthM: 18.0,
    heightM: 7.2,
    signType: 'national',
    routeNumber: 42,
    titleKor: '서원대로 (국도 42호선)',
    subTitleKor: '종합버스터미널 ↑  |  원주시청 2.0km',
    destKmText: '단계택지지구 관문',
  },
];

/**
 * 한국 도로표지 규칙 표준 고화질 캔버스 텍스처 생성
 */
function createRoadSignboardTexture(spec: RoadSignGantrySpec): THREE.CanvasTexture {
  const w = 1024;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const isHwy = spec.signType === 'highway';
  const bgColor = isHwy ? '#166534' : '#1d4ed8'; // 고속도로 녹색 / 일반국도 청색
  const borderColor = '#ffffff';

  // 1. 배경
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // 2. 2중 외곽선 (한국 표준 도로표지 규격)
  ctx.lineWidth = 14;
  ctx.strokeStyle = borderColor;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.strokeRect(26, 26, w - 52, h - 52);

  // 3. 노선 번호 뱃지 (국도 타원 마크 또는 고속도로 쉴드)
  if (spec.routeNumber) {
    const rx = 110;
    const ry = 110;
    const rw = 120;
    const rh = 65;

    ctx.save();
    if (isHwy) {
      // 고속도로 쉴드 형상
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(rx - rw / 2, ry - rh / 2, rw, rh, 18);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else {
      // 일반국도 타원 마크 (파란색 바탕 위 백색 타원 + 청색 숫자)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = 'bold 46px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = isHwy ? '#ffffff' : '#1d4ed8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(spec.routeNumber), rx, ry + 2);
    ctx.restore();
  }

  // 4. 주 도로명 타이틀
  ctx.font = 'bold 56px "Noto Sans KR", "Malgun Gothic", ui-sans-serif, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleX = spec.routeNumber ? 200 : 70;
  ctx.fillText(spec.titleKor, titleX, 75);

  // 구분선
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.moveTo(50, 190);
  ctx.lineTo(w - 50, 190);
  ctx.stroke();

  // 5. 방향 안내 및 거리 텍스트
  ctx.font = 'bold 44px "Noto Sans KR", "Malgun Gothic", ui-sans-serif, sans-serif';
  ctx.fillStyle = '#fef08a'; // 선명한 옐로우 하이라이트
  ctx.fillText(spec.subTitleKor, 65, 220);

  // 6. 하단 결절점/지점명
  if (spec.destKmText) {
    ctx.font = '32px ui-monospace, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'right';
    ctx.fillText(spec.destKmText, w - 65, 305);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * 단일 문형식 3D 도로 이정표 메쉬 그룹 생성
 */
export function buildRoadSignGantryMesh(
  spec: RoadSignGantrySpec,
  metersCoords: [number, number], // Three.js 로컬 평면 좌표 [x, z]
  baseElev: number
): THREE.Group {
  const gantryGroup = new THREE.Group();
  gantryGroup.name = `gantry-${spec.id}`;

  const halfW = spec.widthM / 2;
  const colHeight = spec.heightM;
  const clearanceY = colHeight - 0.7;

  // 공통 금속 재질 (아연도금 강재)
  const steelMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.75,
    roughness: 0.35,
  });

  // 1. 좌/우 수직 강관 기둥 (지름 0.45m)
  const colGeo = new THREE.CylinderGeometry(0.22, 0.24, colHeight, 16);
  const leftCol = new THREE.Mesh(colGeo, steelMaterial);
  leftCol.position.set(-halfW, colHeight / 2, 0);

  const rightCol = new THREE.Mesh(colGeo, steelMaterial);
  rightCol.position.set(halfW, colHeight / 2, 0);

  gantryGroup.add(leftCol);
  gantryGroup.add(rightCol);

  // 2. 상단 수평 트러스 빔 (단면 0.5m x 0.5m)
  const beamGeo = new THREE.BoxGeometry(spec.widthM + 0.8, 0.45, 0.45);
  const beam = new THREE.Mesh(beamGeo, steelMaterial);
  beam.position.set(0, colHeight, 0);
  gantryGroup.add(beam);

  // 보조 하부 연결 빔
  const subBeamGeo = new THREE.BoxGeometry(spec.widthM, 0.25, 0.25);
  const subBeam = new THREE.Mesh(subBeamGeo, steelMaterial);
  subBeam.position.set(0, clearanceY, 0);
  gantryGroup.add(subBeam);

  // 3. 도로 표지판 패널 (가로 7.2m, 세로 2.7m, 두께 0.12m)
  const panelW = Math.min(spec.widthM * 0.65, 8.2);
  const panelH = 2.8;
  const panelGeo = new THREE.BoxGeometry(panelW, panelH, 0.12);

  // 텍스처 생성
  const signTexture = createRoadSignboardTexture(spec);
  const frontMat = new THREE.MeshStandardMaterial({
    map: signTexture,
    emissive: new THREE.Color(spec.signType === 'highway' ? 0x052e16 : 0x1e3a8a),
    emissiveMap: signTexture,
    emissiveIntensity: 0.35, // 주/야간 모두 시인성 보장
    roughness: 0.4,
    metalness: 0.1,
  });

  const backMat = new THREE.MeshStandardMaterial({
    color: 0x64748b, // 표지판 후면 섀시 그레이
    roughness: 0.6,
  });

  const panelMaterials = [
    backMat, // right
    backMat, // left
    backMat, // top
    backMat, // bottom
    frontMat, // front (+z)
    backMat, // back (-z)
  ];

  const panel = new THREE.Mesh(panelGeo, panelMaterials);
  panel.position.set(0, clearanceY + panelH / 2 - 0.2, 0.3); // 트러스 빔 전면에 부착
  gantryGroup.add(panel);

  // 회전 및 위치 정합
  const rad = (spec.headingDeg * Math.PI) / 180;
  gantryGroup.rotation.y = rad;
  gantryGroup.position.set(metersCoords[0], baseElev, metersCoords[1]);

  return gantryGroup;
}
