/**
 * proceduralRoofs.ts
 *
 * Three.js 기반 LOD2 경사 지붕(Gabled / Hipped Roof) 및 옥상 구조물(Parapet & Elevator Core) 생성기
 * - GeoJSON 건축물 외곽선 좌표([lng, lat])를 입력받아 실측 1m 스케일의 입체 지붕 메쉬 생성
 * - 주거 및 군사 시설: 스켈레톤 인셋 및 중심 융기선(Ridge Line) 기반 15~25도 경사 지붕 (테라코타 / 슬레이트 / 국방 카키)
 * - 업무 및 대형 빌딩: 1.2m 옥상 난간(Parapet) 둘레벽, 방수 우레탄 바닥 슬래브, 중앙 엘리베이터 권상기실(3D 큐브) & HVAC 설비
 * - Directional Light 그림자 및 실시간 명암(PBR MeshStandardMaterial, flatShading, cast/receive shadow) 완벽 적용
 */

import * as THREE from 'three';

export type RoofStyle = 'hipped' | 'gabled' | 'parapet_flat';

export interface RoofBuildingOptions {
  polygon: [number, number][]; // GeoJSON 외곽선 좌푯값 배열 [[lng, lat], ...]
  height: number;              // 건축물 실측 높이 (m)
  groundElev?: number;         // 건물 위치 지형 표고 (m, 기본값 0)
  type?: string;               // 건물 용도 ('residential', 'military_facility', 'commercial' 등)
  originLngLat: [number, number]; // Threebox 씬 원점 경위도 [lng, lat]
  pitchDeg?: number;           // 경사 지붕 각도 (15 ~ 25도, 기본 20도)
  colorPreset?: 'terracotta' | 'slate_dark' | 'military_green' | 'modern_gray';
}

// [PBR 물리 기반 지붕 재질 캐시]
const ROOF_MATERIALS = {
  // 1. 주거용 테라코타 브라운 기와 (#B45309 ~ #9A3412)
  terracotta: new THREE.MeshStandardMaterial({
    color: 0x9a3412,
    roughness: 0.65,
    metalness: 0.15,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  // 2. 도심/공공 다크 슬레이트 그레이 기와/징크 (#1E293B ~ #334155)
  slateDark: new THREE.MeshStandardMaterial({
    color: 0x272e3b,
    roughness: 0.55,
    metalness: 0.25,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  // 3. 군사/전술 병영 짙은 카키 올리브 (#1E3A29)
  militaryGreen: new THREE.MeshStandardMaterial({
    color: 0x1e3a29,
    roughness: 0.75,
    metalness: 0.15,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  // 4. 지붕 용마루 캡 (Ridge Capping Tile)
  ridgeTile: new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.3,
  }),
  // 5. 옥상 난간 (Parapet Coping Wall)
  parapetConcrete: new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.6,
    metalness: 0.2,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  // 6. 옥상 방수 우레탄 코트 바닥 (한국 도심 특유의 그린 우레탄)
  urethaneFloor: new THREE.MeshStandardMaterial({
    color: 0x14532d,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  }),
  // 7. 엘리베이터 권상기실 / 코어 펜트하우스 외벽
  elevatorCore: new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.35,
    flatShading: true,
  }),
  // 8. 옥상 공조기/HVAC 아연도금 강판
  hvacMetal: new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.35,
    metalness: 0.75,
  }),
  // 9. 항공장애 표시등 (Aviation Obstruction Red Beacon)
  beaconLight: new THREE.MeshBasicMaterial({
    color: 0xef4444,
  }),
};

/**
 * 건물 용도 및 높이를 판별하여 적합한 지붕 형태 분류
 */
export function classifyRoofStyle(type = '', height = 15): RoofStyle {
  const t = type.toLowerCase();

  // 업무, 상업, 대형 오피스, 고층 타워 -> 평지붕 난간 & 옥탑층
  if (
    t.includes('commercial') ||
    t.includes('office') ||
    t.includes('tower') ||
    t.includes('business') ||
    t.includes('innovation') ||
    t.includes('convention') ||
    t.includes('transport') ||
    t.includes('hub') ||
    t.includes('hotel') ||
    height >= 26
  ) {
    return 'parapet_flat';
  }

  // 주거, 막사, 창고, 군사시설, 저층 공공시설 -> 경사 지붕 (Hipped / Gabled)
  return 'hipped';
}

/**
 * WGS84 [lng, lat] 배열을 Three.js 씬 원점 기준 상대 미터([x, z]) 좌표로 투영 변환
 */
export function projectCoordsToLocalMeters(
  coords: [number, number][],
  origin: [number, number]
): THREE.Vector2[] {
  if (!coords || coords.length < 3) return [];

  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  const metersPerLng = (Math.PI / 180) * 6378137 * cosLat;
  const metersPerLat = (Math.PI / 180) * 6378137;

  const pts: THREE.Vector2[] = [];
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    // 닫힌 링의 마지막 중복 정점 제외
    if (i === len - 1 && len > 3) {
      const d0 = Math.abs(coords[i][0] - coords[0][0]);
      const d1 = Math.abs(coords[i][1] - coords[0][1]);
      if (d0 < 1e-7 && d1 < 1e-7) break;
    }
    const x = (coords[i][0] - origin[0]) * metersPerLng;
    const z = -(coords[i][1] - origin[1]) * metersPerLat;
    pts.push(new THREE.Vector2(x, z));
  }

  // 반시계 방향(CCW) 와인딩 오더 보장 (법선 벡터 상향 보정)
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  if (area < 0) {
    pts.reverse();
  }

  return pts;
}

/**
 * 1) 주거 및 군사 시설: 경사 지붕 (Hipped / Gabled Roof) 생성
 * - 건물 외곽선을 내부로 축소(Skeleton Inset)하며 중심 융기선(Ridge Line) 계산
 * - 15~25도 경사각의 입체 지붕 지오메트리 및 용마루 마감
 */
function createHippedRoofMesh(
  pts: THREE.Vector2[],
  baseY: number,
  pitchDeg: number,
  material: THREE.Material
): THREE.Group {
  const roofGroup = new THREE.Group();
  if (pts.length < 3) return roofGroup;

  // 1. 폴리곤 중심점(Centroid) 계산
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.y;
  }
  cx /= pts.length;
  cz /= pts.length;
  const centroid = new THREE.Vector2(cx, cz);

  // 2. 주축(Principal Axis) 방향 벡터 산출 (공분산 행렬 기반 주 방향 각도)
  let covXX = 0;
  let covZZ = 0;
  let covXZ = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dz = p.y - cz;
    covXX += dx * dx;
    covZZ += dz * dz;
    covXZ += dx * dz;
  }
  const phi = 0.5 * Math.atan2(2 * covXZ, covXX - covZZ);
  let dirU = new THREE.Vector2(Math.cos(phi), Math.sin(phi)); // 주축 (길이 방향)
  let dirV = new THREE.Vector2(-Math.sin(phi), Math.cos(phi)); // 보조축 (폭 방향)

  // 3. 지향 바운딩 박스(OBB) 투영 범위 계산
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of pts) {
    const du = (p.x - cx) * dirU.x + (p.y - cz) * dirU.y;
    const dv = (p.x - cx) * dirV.x + (p.y - cz) * dirV.y;
    minU = Math.min(minU, du);
    maxU = Math.max(maxU, du);
    minV = Math.min(minV, dv);
    maxV = Math.max(maxV, dv);
  }

  let lenU = maxU - minU;
  let lenV = maxV - minV;
  if (lenU < lenV) {
    // V축이 더 길면 축 교환
    const tmpDir = dirU;
    dirU = dirV;
    dirV = tmpDir;
    const tmpLen = lenU;
    lenU = lenV;
    lenV = tmpLen;
    const tmpMin = minU;
    minU = minV;
    minV = tmpMin;
    const tmpMax = maxU;
    maxU = maxV;
    maxV = tmpMax;
  }

  const midU = (minU + maxU) * 0.5;
  const midV = (minV + maxV) * 0.5;
  const obbCenter = new THREE.Vector2(
    centroid.x + dirU.x * midU + dirV.x * midV,
    centroid.y + dirU.y * midU + dirV.y * midV
  );

  // 4. 지붕 경사각 및 융기선(Ridge Line) 계산
  const halfSpan = Math.max(1.5, lenV * 0.5);
  const tanPitch = Math.tan((pitchDeg * Math.PI) / 180);
  const ridgeHeight = Math.min(6.5, Math.max(1.8, halfSpan * tanPitch));
  const ridgeInset = Math.max(0, lenU * 0.5 - halfSpan * 0.75);

  const ridgeY = baseY + ridgeHeight;
  const r0 = new THREE.Vector3(
    obbCenter.x - dirU.x * ridgeInset,
    ridgeY,
    obbCenter.y - dirU.y * ridgeInset
  );
  const r1 = new THREE.Vector3(
    obbCenter.x + dirU.x * ridgeInset,
    ridgeY,
    obbCenter.y + dirU.y * ridgeInset
  );

  // 5. 입체 지붕 면(Facets) 지오메트리 버퍼 생성 (0.3m 처마 오버행 반영)
  const eavesOffset = 0.25;
  const positions: number[] = [];
  const ridgeDir = new THREE.Vector3().subVectors(r1, r0);
  const ridgeLenSq = ridgeDir.lengthSq();

  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];

    // 처마(Eaves)를 바깥으로 미세 확장
    const outward0 = new THREE.Vector2(p0.x - obbCenter.x, p0.y - obbCenter.y).normalize();
    const outward1 = new THREE.Vector2(p1.x - obbCenter.x, p1.y - obbCenter.y).normalize();

    const v0 = new THREE.Vector3(
      p0.x + outward0.x * eavesOffset,
      baseY - 0.1,
      p0.y + outward0.y * eavesOffset
    );
    const v1 = new THREE.Vector3(
      p1.x + outward1.x * eavesOffset,
      baseY - 0.1,
      p1.y + outward1.y * eavesOffset
    );

    // 각 밑변 정점의 융기선 투영점 산출
    let q0: THREE.Vector3;
    let q1: THREE.Vector3;

    if (ridgeLenSq < 0.05) {
      q0 = r0.clone();
      q1 = r0.clone();
    } else {
      const v0Rel = new THREE.Vector3(v0.x - r0.x, 0, v0.z - r0.z);
      const v1Rel = new THREE.Vector3(v1.x - r0.x, 0, v1.z - r0.z);
      const t0 = Math.max(0, Math.min(1, v0Rel.dot(ridgeDir) / ridgeLenSq));
      const t1 = Math.max(0, Math.min(1, v1Rel.dot(ridgeDir) / ridgeLenSq));
      q0 = new THREE.Vector3().copy(r0).addScaledVector(ridgeDir, t0);
      q1 = new THREE.Vector3().copy(r0).addScaledVector(ridgeDir, t1);
    }

    // 상향 법선 와인딩 오더: (v0, q1, v1) 및 (v0, q0, q1)
    if (q0.distanceTo(q1) < 0.1) {
      positions.push(v0.x, v0.y, v0.z, q1.x, q1.y, q1.z, v1.x, v1.y, v1.z);
    } else {
      positions.push(v0.x, v0.y, v0.z, q1.x, q1.y, q1.z, v1.x, v1.y, v1.z);
      positions.push(v0.x, v0.y, v0.z, q0.x, q0.y, q0.z, q1.x, q1.y, q1.z);
    }
  }

  const roofGeom = new THREE.BufferGeometry();
  roofGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roofGeom.computeVertexNormals();

  const roofMesh = new THREE.Mesh(roofGeom, material);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);

  // 6. 용마루 마루대(Ridge Cap Tile) 보강
  if (r0.distanceTo(r1) > 0.5) {
    const ridgeDist = r0.distanceTo(r1);
    const capGeom = new THREE.BoxGeometry(0.35, 0.22, ridgeDist + 0.4);
    const capMesh = new THREE.Mesh(capGeom, ROOF_MATERIALS.ridgeTile);
    capMesh.position.set((r0.x + r1.x) * 0.5, ridgeY + 0.08, (r0.z + r1.z) * 0.5);
    const angle = Math.atan2(r1.x - r0.x, r1.z - r0.z);
    capMesh.rotation.y = angle;
    capMesh.castShadow = true;
    roofGroup.add(capMesh);
  }

  return roofGroup;
}

/**
 * 2) 업무 및 대형 빌딩: 평지붕 난간(Parapet & Coping) 및 옥탑층(Elevator Core & HVAC) 생성
 * - 높이 1.2m 외곽 둘레 난간 벽체 (Parapet Wall & Top Coping)
 * - 방수 우레탄 바닥 슬래브 (Urethane Floor Coat)
 * - 중앙 엘리베이터 권상기실(Elevator Machine Room Cube) & 공조기/항공표시등
 */
function createParapetFlatRoofMesh(
  pts: THREE.Vector2[],
  baseY: number
): THREE.Group {
  const group = new THREE.Group();
  if (pts.length < 3) return group;

  const parapetHeight = 1.2;
  const parapetThickness = 0.35;

  // 1. 폴리곤 중심점 계산
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.y;
  }
  cx /= pts.length;
  cz /= pts.length;
  const centroid = new THREE.Vector2(cx, cz);

  // 2. 내부 인셋 정점(Inner Parapet Coping Ring) 계산
  const innerPts: THREE.Vector2[] = [];
  const N = pts.length;

  for (let i = 0; i < N; i++) {
    const prev = pts[(i - 1 + N) % N];
    const curr = pts[i];
    const next = pts[(i + 1) % N];

    const dIn = new THREE.Vector2(curr.x - prev.x, curr.y - prev.y).normalize();
    const dOut = new THREE.Vector2(next.x - curr.x, next.y - curr.y).normalize();

    // 반시계방향 내향 법선
    const nIn = new THREE.Vector2(-dIn.y, dIn.x);
    const nOut = new THREE.Vector2(-dOut.y, dOut.x);
    const bisector = new THREE.Vector2(nIn.x + nOut.x, nIn.y + nOut.y).normalize();

    const dot = bisector.dot(nIn);
    const scale = 1 / Math.max(0.3, dot);
    const offsetDist = Math.min(2.0, parapetThickness * scale);

    innerPts.push(
      new THREE.Vector2(
        curr.x + bisector.x * offsetDist,
        curr.y + bisector.y * offsetDist
      )
    );
  }

  // 3. 옥상 둘레 난간 벽체(외벽, 내벽, 상단 코핑 캡) 버퍼 생성
  const parapetPositions: number[] = [];
  const topY = baseY + parapetHeight;

  for (let i = 0; i < N; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % N];
    const ip0 = innerPts[i];
    const ip1 = innerPts[(i + 1) % N];

    // (1) 외측 수직면 (Outer Wall)
    parapetPositions.push(p0.x, baseY, p0.y, p1.x, topY, p1.y, p1.x, baseY, p1.y);
    parapetPositions.push(p0.x, baseY, p0.y, p0.x, topY, p0.y, p1.x, topY, p1.y);

    // (2) 내측 수직면 (Inner Wall)
    parapetPositions.push(ip0.x, baseY, ip0.y, ip1.x, baseY, ip1.y, ip1.x, topY, ip1.y);
    parapetPositions.push(ip0.x, baseY, ip0.y, ip1.x, topY, ip1.y, ip0.x, topY, ip0.y);

    // (3) 상단 수평 코핑 캡 (Top Coping Cap)
    parapetPositions.push(p0.x, topY, p0.y, ip1.x, topY, ip1.y, p1.x, topY, p1.y);
    parapetPositions.push(p0.x, topY, p0.y, ip0.x, topY, ip0.y, ip1.x, topY, ip1.y);
  }

  const parapetGeom = new THREE.BufferGeometry();
  parapetGeom.setAttribute('position', new THREE.Float32BufferAttribute(parapetPositions, 3));
  parapetGeom.computeVertexNormals();

  const parapetMesh = new THREE.Mesh(parapetGeom, ROOF_MATERIALS.parapetConcrete);
  parapetMesh.castShadow = true;
  parapetMesh.receiveShadow = true;
  group.add(parapetMesh);

  // 4. 옥상 방수 우레탄 바닥 슬래브 (Inner Floor Slab)
  try {
    const floorFaces = THREE.ShapeUtils.triangulateShape(innerPts, []);
    const floorPositions: number[] = [];
    const floorY = baseY + 0.08;

    for (const [i0, i1, i2] of floorFaces) {
      floorPositions.push(
        innerPts[i0].x, floorY, innerPts[i0].y,
        innerPts[i2].x, floorY, innerPts[i2].y,
        innerPts[i1].x, floorY, innerPts[i1].y
      );
    }

    const floorGeom = new THREE.BufferGeometry();
    floorGeom.setAttribute('position', new THREE.Float32BufferAttribute(floorPositions, 3));
    floorGeom.computeVertexNormals();

    const floorMesh = new THREE.Mesh(floorGeom, ROOF_MATERIALS.urethaneFloor);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);
  } catch (floorErr) {
    console.warn('[proceduralRoofs] floor slab triangulation warning:', floorErr);
  }

  // 5. 중앙 엘리베이터 권상기실 (Elevator Machine Room Cube & HVAC)
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;

  if (width >= 8 && depth >= 8) {
    const coreW = Math.min(14, Math.max(4.5, width * 0.28));
    const coreD = Math.min(14, Math.max(4.5, depth * 0.28));
    const coreH = Math.min(4.5, Math.max(3.2, coreW * 0.5));

    // 권상기실 본체 큐브
    const coreGeom = new THREE.BoxGeometry(coreW, coreH, coreD);
    const coreMesh = new THREE.Mesh(coreGeom, ROOF_MATERIALS.elevatorCore);
    coreMesh.position.set(centroid.x, baseY + coreH * 0.5 + 0.05, centroid.y);
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    group.add(coreMesh);

    // 권상기실 상단 공조기 / 실외기 유닛
    const hvacW = coreW * 0.45;
    const hvacD = coreD * 0.45;
    const hvacH = 1.0;
    const hvacGeom = new THREE.BoxGeometry(hvacW, hvacH, hvacD);
    const hvacMesh = new THREE.Mesh(hvacGeom, ROOF_MATERIALS.hvacMetal);
    hvacMesh.position.set(
      centroid.x - coreW * 0.15,
      baseY + coreH + hvacH * 0.5 + 0.05,
      centroid.y - coreD * 0.15
    );
    hvacMesh.castShadow = true;
    group.add(hvacMesh);

    // 상단 안테나 / 항공장애등 (Red Obstruction Beacon)
    const poleH = 2.0;
    const poleGeom = new THREE.CylinderGeometry(0.06, 0.06, poleH, 8);
    const poleMesh = new THREE.Mesh(poleGeom, ROOF_MATERIALS.hvacMetal);
    poleMesh.position.set(
      centroid.x + coreW * 0.25,
      baseY + coreH + poleH * 0.5 + 0.05,
      centroid.y + coreD * 0.25
    );
    group.add(poleMesh);

    const beaconGeom = new THREE.SphereGeometry(0.22, 8, 8);
    const beaconMesh = new THREE.Mesh(beaconGeom, ROOF_MATERIALS.beaconLight);
    beaconMesh.position.set(
      centroid.x + coreW * 0.25,
      baseY + coreH + poleH + 0.15,
      centroid.y + coreD * 0.25
    );
    group.add(beaconMesh);
  }

  return group;
}

/**
 * [공개 API] 단일 건축물 폴리곤 기반 입체 지붕 생성기
 */
export function createProceduralRoof(options: RoofBuildingOptions): THREE.Group | null {
  const {
    polygon,
    height,
    groundElev = 0,
    type = '',
    originLngLat,
    pitchDeg = 20,
    colorPreset,
  } = options;

  if (!polygon || polygon.length < 3) return null;

  // 1. WGS84 좌표를 Three.js 상대 미터 평면 좌표계로 투영
  const localPts = projectCoordsToLocalMeters(polygon, originLngLat);
  if (localPts.length < 3) return null;

  // 2. 지붕 형태 스타일 분류
  const style = classifyRoofStyle(type, height);
  const baseY = groundElev + height;

  if (style === 'parapet_flat') {
    return createParapetFlatRoofMesh(localPts, baseY);
  }

  // 3. 경사 지붕 재질 결정 (테라코타 / 다크 슬레이트 / 국방 카키)
  let material: THREE.Material = ROOF_MATERIALS.terracotta;
  const t = type.toLowerCase();

  if (colorPreset === 'slate_dark' || t.includes('public') || t.includes('office') || t.includes('hall')) {
    material = ROOF_MATERIALS.slateDark;
  } else if (colorPreset === 'military_green' || t.includes('military') || t.includes('barracks') || t.includes('depot')) {
    material = ROOF_MATERIALS.militaryGreen;
  } else if (colorPreset === 'terracotta') {
    material = ROOF_MATERIALS.terracotta;
  } else {
    // 주거 기본 테라코타, 일반 기타 다크 슬레이트
    material = t.includes('residential') || t.includes('house') || t.includes('villa')
      ? ROOF_MATERIALS.terracotta
      : ROOF_MATERIALS.slateDark;
  }

  return createHippedRoofMesh(localPts, baseY, pitchDeg, material);
}

/**
 * [공개 API] 다중 GeoJSON 건축물 피처 컬렉션 일괄 지붕 생성 유틸리티
 */
export function generateBuildingRoofsGroup(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  originLngLat: [number, number],
  queryElevationFn?: (lngLat: [number, number]) => number | null
): THREE.Group {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'procedural-building-roofs-group';

  for (const feat of features) {
    if (!feat.geometry) continue;

    const props = feat.properties || {};
    const height = Number(props.height || props.render_height || (props['building:levels'] ? props['building:levels'] * 3.5 : 16));
    const bldType = String(props.type || props.bld_category || props.class || '');

    // Polygon 처리
    if (feat.geometry.type === 'Polygon') {
      const ring = feat.geometry.coordinates[0] as [number, number][];
      if (!ring || ring.length < 3) continue;

      const firstCoord = ring[0];
      const groundElev = queryElevationFn ? (queryElevationFn(firstCoord) ?? 0) : 0;

      const roofMesh = createProceduralRoof({
        polygon: ring,
        height,
        groundElev,
        type: bldType,
        originLngLat,
      });

      if (roofMesh) {
        roofMesh.userData = { featureId: feat.id || props.name };
        rootGroup.add(roofMesh);
      }
    } else if (feat.geometry.type === 'MultiPolygon') {
      for (const poly of feat.geometry.coordinates) {
        const ring = poly[0] as [number, number][];
        if (!ring || ring.length < 3) continue;

        const firstCoord = ring[0];
        const groundElev = queryElevationFn ? (queryElevationFn(firstCoord) ?? 0) : 0;

        const roofMesh = createProceduralRoof({
          polygon: ring,
          height,
          groundElev,
          type: bldType,
          originLngLat,
        });

        if (roofMesh) {
          roofMesh.userData = { featureId: feat.id || props.name };
          rootGroup.add(roofMesh);
        }
      }
    }
  }

  return rootGroup;
}
