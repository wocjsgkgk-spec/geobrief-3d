/**
 * roofGeometryBuilder.ts
 *
 * Three.js 기반 속성 연동 LOD2 입체 지붕(박공/모임/평지붕) 절차적 3D 렌더러
 * - 융합 데이터의 roofShape 속성('gabled' | 'hipped' | 'flat')에 따른 맞춤형 3D 지붕 메쉬 생성
 * - 국토교통부 용도코드(BDTYP_CD) 및 usageType 기반 외장재 분리 PBR 셰이딩:
 *   * 단독/다세대 주택: 테라코타 적갈색 지붕 + 밝은 베이지 벽면
 *   * 아파트 단지: 현대적인 화이트/그레이 외벽 + 짙은 차콜 슬래브 라인
 *   * 공공/국방 청사: 화강석 석재 패널 질감 + 커튼월 글래스 톤
 * - 창문 유리면: 태양광 고광택 반사 (metalness: 0.7, roughness: 0.25)
 */

import * as THREE from 'three';

export type RoofShapeType = 'gabled' | 'hipped' | 'flat' | 'skillion' | 'mansard' | 'dome';

export interface RoofMaterialSet {
  roofMaterial: THREE.MeshStandardMaterial;
  wallMaterial: THREE.MeshStandardMaterial;
  windowGlassMaterial: THREE.MeshStandardMaterial;
  parapetMaterial: THREE.MeshStandardMaterial;
  floorMaterial: THREE.MeshStandardMaterial;
  ridgeMaterial: THREE.MeshStandardMaterial;
  penthouseMaterial: THREE.MeshStandardMaterial;
}

// -----------------------------------------------------------------------------
// 1. 국토교통부 용도코드(BDTYP_CD) 및 건물 분류별 PBR 머티리얼 캐시
// -----------------------------------------------------------------------------
const PBR_MATERIALS_CACHE: Record<string, RoofMaterialSet> = {};

export function getRoofMaterialsForBuilding(
  usageType = 'general',
  bdtypCd = '',
  roofColour = '',
  isMilitaryOrPublic = false
): RoofMaterialSet {
  const code = (bdtypCd || '').trim();
  const usage = (usageType || '').toLowerCase().trim();

  let categoryKey = 'general';

  if (isMilitaryOrPublic || usage === 'military' || usage === 'public' || code.startsWith('19') || code.startsWith('20') || code.startsWith('23')) {
    categoryKey = 'military_public';
  } else if (code.startsWith('01') || (usage === 'residential' && !code.startsWith('02'))) {
    categoryKey = 'residential_house'; // 단독/다세대
  } else if (code.startsWith('02') || usage.includes('apartment')) {
    categoryKey = 'apartment'; // 아파트 단지
  } else if (code.startsWith('03') || code.startsWith('04') || code.startsWith('14') || usage === 'commercial') {
    categoryKey = 'commercial'; // 상업/업무
  }

  // 캐시 키
  const cacheKey = `${categoryKey}_${roofColour || 'default'}`;
  if (PBR_MATERIALS_CACHE[cacheKey]) {
    return PBR_MATERIALS_CACHE[cacheKey];
  }

  // 공통 창문 고광택 반사 유리 (metalness: 0.7, roughness: 0.25)
  const windowGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.7,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });

  let roofColorHex = 0x334155;
  let wallColorHex = 0xe2e8f0;
  let parapetColorHex = 0x94a3b8;
  let floorColorHex = 0x1e293b;

  if (categoryKey === 'residential_house') {
    // 1) 단독/다세대 주택: 테라코타 적갈색 지붕 + 밝은 베이지 벽면
    roofColorHex = roofColour ? parseInt(roofColour.replace('#', '0x'), 16) || 0x9a3412 : 0x9a3412; // 테라코타 적갈색
    wallColorHex = 0xf5f5dc; // 밝은 베이지
    parapetColorHex = 0xd7ccc8;
    floorColorHex = 0x4e342e;
  } else if (categoryKey === 'apartment') {
    // 2) 아파트 단지: 현대적인 화이트/그레이 외벽 + 짙은 차콜 슬래브 라인
    roofColorHex = 0x1e293b; // 짙은 차콜 슬래브
    wallColorHex = 0xf8fafc; // 현대적인 오프화이트
    parapetColorHex = 0x334155; // 짙은 차콜 난간
    floorColorHex = 0x14532d; // 한국 아파트 옥상 방수 우레탄 녹색 바닥
  } else if (categoryKey === 'military_public') {
    // 3) 공공/국방 청사: 화강석 석재 패널 질감 + 커튼월 글래스 / 다크 슬레이트 지붕
    roofColorHex = roofColour ? parseInt(roofColour.replace('#', '0x'), 16) || 0x272e3b : 0x272e3b;
    wallColorHex = 0x94a3b8; // 화강석 슬레이트 그레이
    parapetColorHex = 0x475569;
    floorColorHex = 0x1e293b;
  } else if (categoryKey === 'commercial') {
    // 4) 상업/업무: 세련된 다크 그레이 & 블루 틴트
    roofColorHex = 0x1e293b;
    wallColorHex = 0x94a3b8;
    parapetColorHex = 0x475569;
    floorColorHex = 0x0f172a;
  }

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: roofColorHex,
    roughness: 0.55,
    metalness: 0.2,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: wallColorHex,
    roughness: 0.65,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const parapetMaterial = new THREE.MeshStandardMaterial({
    color: parapetColorHex,
    roughness: 0.6,
    metalness: 0.2,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: floorColorHex,
    roughness: 0.8,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const ridgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.35,
  });

  const penthouseMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.35,
    flatShading: true,
  });

  const set: RoofMaterialSet = {
    roofMaterial,
    wallMaterial,
    windowGlassMaterial,
    parapetMaterial,
    floorMaterial,
    ridgeMaterial,
    penthouseMaterial,
  };

  PBR_MATERIALS_CACHE[cacheKey] = set;
  return set;
}

/**
 * 입체 지붕 PBR 재질 캐시 GPU 리소스를 즉각 해제합니다.
 */
export function disposeRoofMaterialsCache(): void {
  for (const key of Object.keys(PBR_MATERIALS_CACHE)) {
    const set = PBR_MATERIALS_CACHE[key];
    if (set) {
      set.roofMaterial.dispose();
      set.wallMaterial.dispose();
      set.windowGlassMaterial.dispose();
      set.parapetMaterial.dispose();
      set.floorMaterial.dispose();
      set.ridgeMaterial.dispose();
      set.penthouseMaterial.dispose();
      delete PBR_MATERIALS_CACHE[key];
    }
  }
}

// -----------------------------------------------------------------------------
// 2. 좌표 투영 변환 (WGS84 LngLat -> Three.js 미터 좌표)
// -----------------------------------------------------------------------------
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
    if (i === len - 1 && len > 3) {
      const d0 = Math.abs(coords[i][0] - coords[0][0]);
      const d1 = Math.abs(coords[i][1] - coords[0][1]);
      if (d0 < 1e-7 && d1 < 1e-7) break;
    }
    const x = (coords[i][0] - origin[0]) * metersPerLng;
    const z = -(coords[i][1] - origin[1]) * metersPerLat;
    pts.push(new THREE.Vector2(x, z));
  }

  // CCW (반시계방향) 와인딩 오더 보장
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

// -----------------------------------------------------------------------------
// 3. OBB(지향 바운딩 박스) 주축 및 파라미터 계산
// -----------------------------------------------------------------------------
interface OBBResult {
  centroid: THREE.Vector2;
  dirU: THREE.Vector2; // 긴 축
  dirV: THREE.Vector2; // 짧은 축
  lenU: number;
  lenV: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  obbCenter: THREE.Vector2;
}

function computeOBB(pts: THREE.Vector2[]): OBBResult {
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.y;
  }
  cx /= pts.length;
  cz /= pts.length;
  const centroid = new THREE.Vector2(cx, cz);

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
  let dirU = new THREE.Vector2(Math.cos(phi), Math.sin(phi));
  let dirV = new THREE.Vector2(-Math.sin(phi), Math.cos(phi));

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

  return { centroid, dirU, dirV, lenU, lenV, minU, maxU, minV, maxV, obbCenter };
}

// -----------------------------------------------------------------------------
// 4. [1) roofShape === 'gabled'] 박공/경사 지붕 빌더
// - 건물 긴 축을 기준으로 중심 용마루 선을 융기시키고 양방향 25도 경사 지붕 메쉬 생성
// - 양단 삼각 박공벽(Gable Wall) 및 용마루 마루대 장착
// -----------------------------------------------------------------------------
export function buildGabledRoof(
  pts: THREE.Vector2[],
  baseY: number,
  pitchDeg: number,
  materials: RoofMaterialSet
): THREE.Group {
  const group = new THREE.Group();
  if (pts.length < 3) return group;

  const obb = computeOBB(pts);
  const halfSpan = Math.max(1.5, obb.lenV * 0.5);
  const tanPitch = Math.tan(((pitchDeg || 25) * Math.PI) / 180);
  const ridgeHeight = Math.min(7.5, Math.max(2.0, halfSpan * tanPitch));
  const ridgeY = baseY + ridgeHeight;

  // 박공지붕: 용마루선이 긴 축의 양 끝단까지 확장됨
  const halfLenU = obb.lenU * 0.5;
  const r0 = new THREE.Vector3(
    obb.obbCenter.x - obb.dirU.x * (halfLenU + 0.3),
    ridgeY,
    obb.obbCenter.y - obb.dirU.y * (halfLenU + 0.3)
  );
  const r1 = new THREE.Vector3(
    obb.obbCenter.x + obb.dirU.x * (halfLenU + 0.3),
    ridgeY,
    obb.obbCenter.y + obb.dirU.y * (halfLenU + 0.3)
  );

  const ridgeDir = new THREE.Vector3().subVectors(r1, r0);
  const ridgeLenSq = ridgeDir.lengthSq();
  const positions: number[] = [];
  const eavesOffset = 0.3; // 0.3m 처마 오버행

  // 1) 지붕 경사면(Slope Facets) 생성
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];

    const outward0 = new THREE.Vector2(p0.x - obb.obbCenter.x, p0.y - obb.obbCenter.y).normalize();
    const outward1 = new THREE.Vector2(p1.x - obb.obbCenter.x, p1.y - obb.obbCenter.y).normalize();

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

  const roofMesh = new THREE.Mesh(roofGeom, materials.roofMaterial);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // 2) 박공지붕 양단 수직 삼각형 박공벽(Gable Walls) 생성
  const gablePos: number[] = [];
  const g0_baseL = new THREE.Vector3(
    obb.obbCenter.x - obb.dirU.x * halfLenU - obb.dirV.x * halfSpan,
    baseY,
    obb.obbCenter.y - obb.dirU.y * halfLenU - obb.dirV.y * halfSpan
  );
  const g0_baseR = new THREE.Vector3(
    obb.obbCenter.x - obb.dirU.x * halfLenU + obb.dirV.x * halfSpan,
    baseY,
    obb.obbCenter.y - obb.dirU.y * halfLenU + obb.dirV.y * halfSpan
  );
  const g0_apex = new THREE.Vector3(
    obb.obbCenter.x - obb.dirU.x * halfLenU,
    ridgeY,
    obb.obbCenter.y - obb.dirU.y * halfLenU
  );

  gablePos.push(g0_baseL.x, g0_baseL.y, g0_baseL.z, g0_apex.x, g0_apex.y, g0_apex.z, g0_baseR.x, g0_baseR.y, g0_baseR.z);

  const g1_baseL = new THREE.Vector3(
    obb.obbCenter.x + obb.dirU.x * halfLenU - obb.dirV.x * halfSpan,
    baseY,
    obb.obbCenter.y + obb.dirU.y * halfLenU - obb.dirV.y * halfSpan
  );
  const g1_baseR = new THREE.Vector3(
    obb.obbCenter.x + obb.dirU.x * halfLenU + obb.dirV.x * halfSpan,
    baseY,
    obb.obbCenter.y + obb.dirU.y * halfLenU + obb.dirV.y * halfSpan
  );
  const g1_apex = new THREE.Vector3(
    obb.obbCenter.x + obb.dirU.x * halfLenU,
    ridgeY,
    obb.obbCenter.y + obb.dirU.y * halfLenU
  );

  gablePos.push(g1_baseL.x, g1_baseL.y, g1_baseL.z, g1_baseR.x, g1_baseR.y, g1_baseR.z, g1_apex.x, g1_apex.y, g1_apex.z);

  const gableGeom = new THREE.BufferGeometry();
  gableGeom.setAttribute('position', new THREE.Float32BufferAttribute(gablePos, 3));
  gableGeom.computeVertexNormals();

  const gableMesh = new THREE.Mesh(gableGeom, materials.wallMaterial);
  gableMesh.castShadow = true;
  group.add(gableMesh);

  // 3) 용마루 마루대 캡(Ridge Capping Tile)
  const ridgeDist = r0.distanceTo(r1);
  if (ridgeDist > 0.5) {
    const capGeom = new THREE.BoxGeometry(0.38, 0.22, ridgeDist + 0.4);
    const capMesh = new THREE.Mesh(capGeom, materials.ridgeMaterial);
    capMesh.position.set((r0.x + r1.x) * 0.5, ridgeY + 0.1, (r0.z + r1.z) * 0.5);
    const angle = Math.atan2(r1.x - r0.x, r1.z - r0.z);
    capMesh.rotation.y = angle;
    capMesh.castShadow = true;
    group.add(capMesh);
  }

  return group;
}

// -----------------------------------------------------------------------------
// 5. [2) roofShape === 'hipped'] 모임 지붕 빌더
// - 4면 경사로 모여드는 피라미드/사다리꼴 모임지붕 메쉬 생성
// -----------------------------------------------------------------------------
export function buildHippedRoof(
  pts: THREE.Vector2[],
  baseY: number,
  pitchDeg: number,
  materials: RoofMaterialSet
): THREE.Group {
  const group = new THREE.Group();
  if (pts.length < 3) return group;

  const obb = computeOBB(pts);
  const halfSpan = Math.max(1.5, obb.lenV * 0.5);
  const tanPitch = Math.tan(((pitchDeg || 22) * Math.PI) / 180);
  const ridgeHeight = Math.min(6.5, Math.max(1.8, halfSpan * tanPitch));
  const ridgeInset = Math.max(0, obb.lenU * 0.5 - halfSpan * 0.75);
  const ridgeY = baseY + ridgeHeight;

  // 모임지붕: 용마루선이 양단에서 안쪽으로 수축(Inset)됨
  const r0 = new THREE.Vector3(
    obb.obbCenter.x - obb.dirU.x * ridgeInset,
    ridgeY,
    obb.obbCenter.y - obb.dirU.y * ridgeInset
  );
  const r1 = new THREE.Vector3(
    obb.obbCenter.x + obb.dirU.x * ridgeInset,
    ridgeY,
    obb.obbCenter.y + obb.dirU.y * ridgeInset
  );

  const ridgeDir = new THREE.Vector3().subVectors(r1, r0);
  const ridgeLenSq = ridgeDir.lengthSq();
  const positions: number[] = [];
  const eavesOffset = 0.25;

  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];

    const outward0 = new THREE.Vector2(p0.x - obb.obbCenter.x, p0.y - obb.obbCenter.y).normalize();
    const outward1 = new THREE.Vector2(p1.x - obb.obbCenter.x, p1.y - obb.obbCenter.y).normalize();

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

  const roofMesh = new THREE.Mesh(roofGeom, materials.roofMaterial);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // 용마루 마루대
  if (r0.distanceTo(r1) > 0.5) {
    const ridgeDist = r0.distanceTo(r1);
    const capGeom = new THREE.BoxGeometry(0.35, 0.22, ridgeDist + 0.4);
    const capMesh = new THREE.Mesh(capGeom, materials.ridgeMaterial);
    capMesh.position.set((r0.x + r1.x) * 0.5, ridgeY + 0.08, (r0.z + r1.z) * 0.5);
    const angle = Math.atan2(r1.x - r0.x, r1.z - r0.z);
    capMesh.rotation.y = angle;
    capMesh.castShadow = true;
    group.add(capMesh);
  }

  return group;
}

// -----------------------------------------------------------------------------
// 6. [3) roofShape === 'flat' 또는 기본값] 평지붕 난간 & 옥탑층 빌더
// - 옥상 테두리를 따라 높이 1.2m의 옥상 난간(Parapet)을 두르고
// - 중앙에 엘리베이터 권상기실(옥탑 큐브) & 공조기/항공표시등 배치
// -----------------------------------------------------------------------------
export function buildFlatRoof(
  pts: THREE.Vector2[],
  baseY: number,
  materials: RoofMaterialSet
): THREE.Group {
  const group = new THREE.Group();
  if (pts.length < 3) return group;

  const parapetHeight = 1.2;
  const parapetThickness = 0.35;
  const N = pts.length;

  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.y;
  }
  cx /= pts.length;
  cz /= pts.length;

  // 1) 옥상 난간 둘레벽(Parapet Wall) 생성
  const innerPts: THREE.Vector2[] = [];
  for (let i = 0; i < N; i++) {
    const prev = pts[(i - 1 + N) % N];
    const curr = pts[i];
    const next = pts[(i + 1) % N];

    const dIn = new THREE.Vector2(curr.x - prev.x, curr.y - prev.y).normalize();
    const dOut = new THREE.Vector2(next.x - curr.x, next.y - curr.y).normalize();
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

  const parapetPositions: number[] = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const o0 = pts[i];
    const o1 = pts[j];
    const in0 = innerPts[i];
    const in1 = innerPts[j];

    const yB = baseY;
    const yT = baseY + parapetHeight;

    // 외벽
    parapetPositions.push(o0.x, yB, o0.y, o1.x, yT, o1.y, o0.x, yT, o0.y);
    parapetPositions.push(o0.x, yB, o0.y, o1.x, yB, o1.y, o1.x, yT, o1.y);

    // 상단 캡 (Coping)
    parapetPositions.push(o0.x, yT, o0.y, in1.x, yT, in1.y, in0.x, yT, in0.y);
    parapetPositions.push(o0.x, yT, o0.y, o1.x, yT, o1.y, in1.x, yT, in1.y);

    // 내벽
    parapetPositions.push(in0.x, yB, in0.y, in0.x, yT, in0.y, in1.x, yT, in1.y);
    parapetPositions.push(in0.x, yB, in0.y, in1.x, yT, in1.y, in1.x, yB, in1.y);
  }

  const parapetGeom = new THREE.BufferGeometry();
  parapetGeom.setAttribute('position', new THREE.Float32BufferAttribute(parapetPositions, 3));
  parapetGeom.computeVertexNormals();

  const parapetMesh = new THREE.Mesh(parapetGeom, materials.parapetMaterial);
  parapetMesh.castShadow = true;
  parapetMesh.receiveShadow = true;
  group.add(parapetMesh);

  // 2) 옥상 방수 바닥 슬래브 (Floor Coat)
  const floorShape = new THREE.Shape();
  floorShape.moveTo(innerPts[0].x, -innerPts[0].y);
  for (let i = 1; i < innerPts.length; i++) {
    floorShape.lineTo(innerPts[i].x, -innerPts[i].y);
  }
  floorShape.closePath();

  const floorGeom = new THREE.ShapeGeometry(floorShape);
  floorGeom.rotateX(Math.PI / 2);
  const floorMesh = new THREE.Mesh(floorGeom, materials.floorMaterial);
  floorMesh.position.y = baseY + 0.05;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // 3) 중앙 엘리베이터 권상기실 / 코어 펜트하우스 큐브
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of innerPts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  if (spanX > 6.0 && spanZ > 6.0) {
    const coreW = Math.max(3.5, Math.min(6.5, spanX * 0.28));
    const coreD = Math.max(4.0, Math.min(7.5, spanZ * 0.28));
    const coreH = 3.2;

    const coreGeom = new THREE.BoxGeometry(coreW, coreH, coreD);
    const coreMesh = new THREE.Mesh(coreGeom, materials.penthouseMaterial);
    coreMesh.position.set(cx, baseY + coreH * 0.5, cz);
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    group.add(coreMesh);

    // 옥탑 상단 공조기(HVAC) 메탈 박스
    const hvacGeom = new THREE.BoxGeometry(1.8, 1.2, 1.4);
    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.75 });
    const hvacMesh = new THREE.Mesh(hvacGeom, hvacMat);
    hvacMesh.position.set(cx + coreW * 0.2, baseY + coreH + 0.6, cz);
    hvacMesh.castShadow = true;
    group.add(hvacMesh);

    // 옥탑 상단 항공장애 표시등(Red Beacon)
    const beaconGeom = new THREE.SphereGeometry(0.2, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
    beaconMesh.position.set(cx, baseY + coreH + 0.25, cz);
    group.add(beaconMesh);
  }

  return group;
}

// -----------------------------------------------------------------------------
// 7. [공개 API] 피처 속성 기반 지붕 지오메트리 빌더
// -----------------------------------------------------------------------------
export interface RoofFeatureOptions {
  polygon: [number, number][]; // [[lng, lat], ...]
  height: number;
  groundElev?: number;
  roofShape?: string;
  roofColour?: string;
  usageType?: string;
  bdtypCd?: string;
  isMilitaryOrPublic?: boolean;
  originLngLat: [number, number];
  pitchDeg?: number;
}

export function buildRoofMeshForFeature(options: RoofFeatureOptions): THREE.Group {
  const {
    polygon,
    height,
    groundElev = 0,
    roofShape = 'flat',
    roofColour,
    usageType = 'general',
    bdtypCd,
    isMilitaryOrPublic = false,
    originLngLat,
    pitchDeg = 25,
  } = options;

  const pts = projectCoordsToLocalMeters(polygon, originLngLat);
  if (pts.length < 3) return new THREE.Group();

  const baseY = groundElev + height;
  const materials = getRoofMaterialsForBuilding(
    usageType,
    bdtypCd,
    roofColour,
    isMilitaryOrPublic
  );

  const shape = (roofShape || 'flat').toLowerCase();

  if (shape === 'gabled') {
    return buildGabledRoof(pts, baseY, pitchDeg, materials);
  } else if (shape === 'hipped') {
    return buildHippedRoof(pts, baseY, pitchDeg, materials);
  } else {
    // flat 또는 기본값
    return buildFlatRoof(pts, baseY, materials);
  }
}

/**
 * 다중 GeoJSON 건물 피처 컬렉션으로부터 속성 기반 LOD2 입체 지붕 그룹 일괄 생성
 */
export function generateLOD2RoofsGroup(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  originLngLat: [number, number],
  queryElevationFn?: (lngLat: [number, number]) => number | null
): THREE.Group {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'lod2-property-roofs-group';

  for (const feat of features) {
    if (!feat.geometry) continue;

    const props = (feat.properties || {}) as Record<string, any>;
    const height = Number(
      props.height ||
      props.render_height ||
      (props.levels ? props.levels * 3.3 : 15)
    );

    const roofShape = props.roofShape || props['roof:shape'] || 'flat';
    const roofColour = props.roofColour || props['roof:colour'];
    const usageType = props.usageType || props.type || 'general';
    const bdtypCd = props.bdtypCd || props.bdtyp_cd;
    const isMilitaryOrPublic = !!props.isMilitaryOrPublic;

    const rings: [number, number][][] = [];
    if (feat.geometry.type === 'Polygon') {
      rings.push(feat.geometry.coordinates[0] as [number, number][]);
    } else if (feat.geometry.type === 'MultiPolygon') {
      for (const poly of feat.geometry.coordinates) {
        rings.push(poly[0] as [number, number][]);
      }
    }

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;

      let groundElev = typeof props.min_elev === 'number' ? props.min_elev : 0;
      if (groundElev === 0 && queryElevationFn) {
        let minE = Infinity;
        for (const coord of ring) {
          const e = queryElevationFn(coord);
          if (e !== null && !isNaN(e) && e < minE) minE = e;
        }
        groundElev = isFinite(minE) ? minE : (queryElevationFn(ring[0]) ?? 0);
      }

      const roofMesh = buildRoofMeshForFeature({
        polygon: ring,
        height,
        groundElev,
        roofShape,
        roofColour,
        usageType,
        bdtypCd,
        isMilitaryOrPublic,
        originLngLat,
        pitchDeg: 25,
      });

      if (roofMesh) {
        roofMesh.userData = { featureId: feat.id || props.name };
        rootGroup.add(roofMesh);
      }
    }
  }

  return rootGroup;
}
