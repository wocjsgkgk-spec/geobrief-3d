/**
 * lib/vendor/vworldReverseSpec.ts
 *
 * [GeoBrief 3D 1단계: 국토부 브이월드(V-World 3D WebGL) 역공학 사양 및 실사 모델 파서]
 *
 * 브이월드 3D 웹 지도(map.vworld.kr / xdworld.vworld.kr)의 클라이언트 WebGL 스크립트와
 * XDServer 통신 프로토콜을 역공학(Reverse Engineering)하여 추출한 3대 핵심 엔진 사양:
 *
 *  1. [브이월드 3D 쿼드트리 타일 주소 변환 공식 (V-World Quadtree Tile Addressing)]
 *     - 36도 기준 쿼드트리 인덱싱: unit = 36 / 2^level, idx = floor((lon + 180)/unit), idy = floor((lat + 90)/unit)
 *  2. [브이월드 실사 3D 건물(.xdo) & 지형(dem) 바이너리 파서]
 *     - S3DVertex, BBox3dd, Indexed Triangles, UV, Texture ImageName -> Three.js BufferGeometry + MeshStandardMaterial
 *  3. [브이월드 WebGL 셰이더 조명·대기 안개·위성영상 컬러 그레이딩 파라미터 복원]
 *     - 주간 태양광(Directional + Hemisphere), 거리 안개(FogExp2), 정사영상 대비/채도 밸런스 공식
 */

import * as THREE from 'three';

// ============================================================================
// 1. 브이월드 3D 쿼드트리 타일 인덱싱 엔진 (VWorldQuadtreeIndexer)
// ============================================================================

export interface VWorldTileCoord {
  level: number;
  idx: number;
  idy: number;
  unit: number;
}

export interface VWorldTileBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centerLon: number;
  centerLat: number;
}

export class VWorldQuadtreeIndexer {
  // 브이월드 쿼드트리 최상위 0레벨 단위 각도: 36.0도
  public static readonly ROOT_EXTENT_DEG = 36.0;
  public static readonly LON_OFFSET = 180.0;
  public static readonly LAT_OFFSET = 90.0;

  // 주요 줌 레벨 정의
  public static readonly LEVEL_TERRAIN_OVERVIEW = 8;
  public static readonly LEVEL_TERRAIN_DETAILED = 12;
  public static readonly LEVEL_BUILDING_LOD1 = 13;
  public static readonly LEVEL_BUILDING_LOD2 = 14;
  public static readonly LEVEL_BUILDING_LOD3_REALISTIC = 15;

  /**
   * 해당 줌 레벨에서의 단일 타일 각도 폭 (degrees)
   * unit = 36 / 2^level
   */
  public static getUnitDegrees(level: number): number {
    const clampedLevel = Math.max(0, Math.min(20, Math.floor(level)));
    return this.ROOT_EXTENT_DEG / Math.pow(2, clampedLevel);
  }

  /**
   * WGS84 경위도 (lon, lat) 및 줌 레벨 -> 브이월드 타일 인덱스 (idx, idy) 변환
   * 공식:
   *  unit = 36 / Math.pow(2, level)
   *  idx = Math.floor((lon + 180) / unit)
   *  idy = Math.floor((lat + 90) / unit)
   */
  public static getTileIndex(lon: number, lat: number, level: number): VWorldTileCoord {
    const unit = this.getUnitDegrees(level);
    const clampedLon = Math.max(-180.0, Math.min(180.0, lon));
    const clampedLat = Math.max(-90.0, Math.min(90.0, lat));

    const idx = Math.floor((clampedLon + this.LON_OFFSET) / unit);
    const idy = Math.floor((clampedLat + this.LAT_OFFSET) / unit);

    return {
      level,
      idx,
      idy,
      unit,
    };
  }

  /**
   * 브이월드 타일 인덱스 (idx, idy, level) -> WGS84 Bounding Box 및 중심 좌표 역산
   */
  public static getTileBounds(idx: number, idy: number, level: number): VWorldTileBounds {
    const unit = this.getUnitDegrees(level);
    const minLon = idx * unit - this.LON_OFFSET;
    const maxLon = (idx + 1) * unit - this.LON_OFFSET;
    const minLat = idy * unit - this.LAT_OFFSET;
    const maxLat = (idy + 1) * unit - this.LAT_OFFSET;

    return {
      minLon,
      minLat,
      maxLon,
      maxLat,
      centerLon: (minLon + maxLon) / 2.0,
      centerLat: (minLat + maxLat) / 2.0,
    };
  }

  /**
   * 임의 BBOX [minLon, minLat, maxLon, maxLat] 내에 포함되는 브이월드 타일 목록 추출
   */
  public static getTilesForBbox(
    bbox: [number, number, number, number],
    level: number
  ): VWorldTileCoord[] {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const minCoord = this.getTileIndex(minLon, minLat, level);
    const maxCoord = this.getTileIndex(maxLon, maxLat, level);

    const tiles: VWorldTileCoord[] = [];
    const minX = Math.min(minCoord.idx, maxCoord.idx);
    const maxX = Math.max(minCoord.idx, maxCoord.idx);
    const minY = Math.min(minCoord.idy, maxCoord.idy);
    const maxY = Math.max(minCoord.idy, maxCoord.idy);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({
          level,
          idx: x,
          idy: y,
          unit: minCoord.unit,
        });
      }
    }
    return tiles;
  }

  /**
   * 브이월드 XDServer 직접 요청 원본 URL 생성
   */
  public static getUpstreamTileUrl(params: {
    layer: 'facility_build' | 'facility_bridge' | 'dem' | string;
    level: number;
    idx: number;
    idy: number;
    dataFile?: string;
    apiKey?: string;
  }): string {
    const { layer, level, idx, idy, dataFile, apiKey = '' } = params;
    const base = 'http://xdworld.vworld.kr:8080/XDServer/3DData';
    let url = `${base}?Version=2.0.0.0&Request=GetLayer&Key=${encodeURIComponent(
      apiKey
    )}&Layer=${encodeURIComponent(layer)}&Level=${level}&IDX=${idx}&IDY=${idy}`;
    if (dataFile) {
      url += `&DataFile=${encodeURIComponent(dataFile)}`;
    }
    return url;
  }

  /**
   * GeoBrief 3D 내부 CORS 우회 및 SSRF 방지 프록시 URL 생성
   */
  public static getProxyTileUrl(params: {
    layer: string;
    level: number;
    idx: number;
    idy: number;
    dataFile?: string;
  }): string {
    const { layer, level, idx, idy, dataFile } = params;
    let url = `/api/vworld-xdo-proxy?layer=${encodeURIComponent(
      layer
    )}&level=${level}&idx=${idx}&idy=${idy}`;
    if (dataFile) {
      url += `&dataFile=${encodeURIComponent(dataFile)}`;
    }
    return url;
  }
}

// ============================================================================
// 2. 브이월드 .xdo 바이너리 파서 및 Three.js 메쉬 변환기 (VWorldXDOParser)
// ============================================================================

export interface XDOVertexData {
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
}

export interface XDOMeshRecord {
  version: number;
  type: number;
  objectID: number;
  key: string;
  bbox: [number, number, number, number, number, number]; // minX, minY, minZ, maxX, maxY, maxZ
  altitude: number;
  faceNum: number;
  vertexCount: number;
  vertices: XDOVertexData[];
  indexedCount: number;
  indices: Uint16Array | Uint32Array;
  color: number;
  imageLevel: number;
  imageName: string;
}

export interface VWorldParsedXDO {
  records: XDOMeshRecord[];
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  group: THREE.Group;
  totalVertices: number;
  totalTriangles: number;
}

export class VWorldXDOParser {
  /**
   * 브이월드 .xdo 바이너리 바이트 스트림 파싱
   * Little-Endian 기반 바이트 해체:
   *  - Version (u8)
   *  - Type (u8)
   *  - ObjectID (u32)
   *  - KeyLen (u8) + Key (char*)
   *  - ObjBox (6 * Float64 = 48 bytes)
   *  - Altitude (Float32 = 4 bytes)
   *  - FaceNum (u8)
   *  - VertexCount (u32)
   *  - Vertices (VertexCount * S3DVertex: pos 12B, normal 12B, uv 8B = 32B)
   *  - IndexedCount (u32)
   *  - Indices (IndexedCount * u16 or u32)
   *  - Color (u32)
   *  - ImageLevel (u8)
   *  - ImageNameLen (u8) + ImageName (char*)
   */
  public static parse(
    data: ArrayBuffer | Uint8Array,
    options: {
      originCenter?: [number, number, number];
      scale?: number;
      defaultTexturePathPrefix?: string;
    } = {}
  ): VWorldParsedXDO {
    const buffer = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    const view = new DataView(buffer);
    let offset = 0;
    const byteLength = buffer.byteLength;

    const records: XDOMeshRecord[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const group = new THREE.Group();
    group.name = 'VWorld_XDO_TileGroup';

    let totalVertices = 0;
    let totalTriangles = 0;

    const texturePrefix = options.defaultTexturePathPrefix || '/api/vworld-xdo-proxy?layer=facility_build&dataFile=';

    while (offset < byteLength - 8) {
      try {
        const recordStartOffset = offset;
        const version = view.getUint8(offset++);
        const type = view.getUint8(offset++);
        const objectID = view.getUint32(offset, true);
        offset += 4;

        // Key 문자열 파싱
        const keyLen = view.getUint8(offset++);
        let key = '';
        for (let i = 0; i < keyLen; i++) {
          key += String.fromCharCode(view.getUint8(offset++));
        }

        // BBox3dd: minX, minY, minZ, maxX, maxY, maxZ (각 8바이트 = 48바이트)
        const minX = view.getFloat64(offset, true);
        offset += 8;
        const minY = view.getFloat64(offset, true);
        offset += 8;
        const minZ = view.getFloat64(offset, true);
        offset += 8;
        const maxX = view.getFloat64(offset, true);
        offset += 8;
        const maxY = view.getFloat64(offset, true);
        offset += 8;
        const maxZ = view.getFloat64(offset, true);
        offset += 8;

        const altitude = view.getFloat32(offset, true);
        offset += 4;

        const faceNum = view.getUint8(offset++);
        const vertexCount = view.getUint32(offset, true);
        offset += 4;

        if (vertexCount > 500000 || vertexCount <= 0) {
          // 비정상 오프셋 방어
          break;
        }

        const vertices: XDOVertexData[] = [];
        const posArray = new Float32Array(vertexCount * 3);
        const normArray = new Float32Array(vertexCount * 3);
        const uvArray = new Float32Array(vertexCount * 2);

        const centerOffsetX = options.originCenter ? options.originCenter[0] : (minX + maxX) / 2.0;
        const centerOffsetY = options.originCenter ? options.originCenter[1] : (minY + maxY) / 2.0;
        const centerOffsetZ = options.originCenter ? options.originCenter[2] : altitude;
        const scale = options.scale || 1.0;

        for (let i = 0; i < vertexCount; i++) {
          const px = view.getFloat32(offset, true);
          offset += 4;
          const py = view.getFloat32(offset, true);
          offset += 4;
          const pz = view.getFloat32(offset, true);
          offset += 4;

          const nx = view.getFloat32(offset, true);
          offset += 4;
          const ny = view.getFloat32(offset, true);
          offset += 4;
          const nz = view.getFloat32(offset, true);
          offset += 4;

          const u = view.getFloat32(offset, true);
          offset += 4;
          const v = view.getFloat32(offset, true);
          offset += 4;

          vertices.push({ px, py, pz, nx, ny, nz, u, v });

          // 좌표계 변환: XDO (X:동, Y:북, Z:고도) -> Three.js (X:동, Y:고도, Z:-북)
          posArray[i * 3 + 0] = (px - centerOffsetX) * scale;
          posArray[i * 3 + 1] = (pz - centerOffsetZ) * scale;
          posArray[i * 3 + 2] = -(py - centerOffsetY) * scale;

          normArray[i * 3 + 0] = nx;
          normArray[i * 3 + 1] = nz;
          normArray[i * 3 + 2] = -ny;

          uvArray[i * 2 + 0] = u;
          uvArray[i * 2 + 1] = 1.0 - v; // WebGL V-좌표 반전 보정
        }

        const indexedCount = view.getUint32(offset, true);
        offset += 4;

        let indices: Uint16Array | Uint32Array;
        if (vertexCount > 65535) {
          indices = new Uint32Array(indexedCount);
          for (let i = 0; i < indexedCount; i++) {
            indices[i] = view.getUint32(offset, true);
            offset += 4;
          }
        } else {
          indices = new Uint16Array(indexedCount);
          for (let i = 0; i < indexedCount; i++) {
            indices[i] = view.getUint16(offset, true);
            offset += 2;
          }
        }

        const color = view.getUint32(offset, true);
        offset += 4;

        const imageLevel = view.getUint8(offset++);
        const imageNameLen = view.getUint8(offset++);
        let imageName = '';
        for (let i = 0; i < imageNameLen; i++) {
          imageName += String.fromCharCode(view.getUint8(offset++));
        }

        const record: XDOMeshRecord = {
          version,
          type,
          objectID,
          key,
          bbox: [minX, minY, minZ, maxX, maxY, maxZ],
          altitude,
          faceNum,
          vertexCount,
          vertices,
          indexedCount,
          indices,
          color,
          imageLevel,
          imageName,
        };
        records.push(record);

        // Three.js BufferGeometry 빌드
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        geom.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
        geom.setIndex(new THREE.BufferAttribute(indices, 1));
        geom.computeBoundingBox();
        geom.computeBoundingSphere();

        // Three.js Material 빌드 (브이월드 한국형 실사 셰이딩 규격)
        let mat: THREE.MeshStandardMaterial;
        let loadedTexture: THREE.Texture | null = null;

        if (imageName && imageName.trim().length > 0 && typeof document !== 'undefined') {
          try {
            const textureUrl = `${texturePrefix}${encodeURIComponent(imageName)}`;
            loadedTexture = new THREE.TextureLoader().load(textureUrl);
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            loadedTexture.wrapS = THREE.RepeatWrapping;
            loadedTexture.wrapT = THREE.RepeatWrapping;
          } catch {
            loadedTexture = null;
          }
        }

        if (loadedTexture) {
          mat = new THREE.MeshStandardMaterial({
            map: loadedTexture,
            roughness: 0.68,
            metalness: 0.12,
            envMapIntensity: 0.9,
          });
        } else {
          // 텍스처 부재 또는 SSR/헤드리스 환경 시 브이월드 기본 웜 아이보리/베이지 콘크리트 외벽
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xf4efe6),
            roughness: 0.72,
            metalness: 0.1,
          });
        }

        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = `XDO_Building_${objectID}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        geometries.push(geom);
        materials.push(mat);

        totalVertices += vertexCount;
        totalTriangles += indexedCount / 3;
      } catch (err) {
        console.warn('[VWorldXDOParser] Record parse terminated at byte offset:', offset, err);
        break;
      }
    }

    return {
      records,
      geometries,
      materials,
      group,
      totalVertices,
      totalTriangles,
    };
  }

  /**
   * 단위 테스트 및 오프라인 폴백용: 유효한 .xdo 바이너리 패킷 생성기
   */
  public static createSyntheticXDO(options: {
    objectID?: number;
    width?: number;
    depth?: number;
    height?: number;
    altitude?: number;
    imageName?: string;
  } = {}): ArrayBuffer {
    const objectID = options.objectID || 1001;
    const w = options.width || 20;
    const d = options.depth || 30;
    const h = options.height || 45;
    const alt = options.altitude || 120;
    const img = options.imageName || 'facade_sample.png';

    // 큐브 24개 정점 (각 면 4개)
    const vertexCount = 24;
    const indexCount = 36;
    const key = `OBJ_${objectID}`;

    const totalSize =
      1 + // version
      1 + // type
      4 + // objectID
      1 + key.length + // keyLen + key
      48 + // bbox
      4 + // altitude
      1 + // faceNum
      4 + // vertexCount
      vertexCount * (4 * 3 + 4 * 3 + 4 * 2) + // vertices (32B each = 768B)
      4 + // indexCount
      indexCount * 2 + // indices (72B)
      4 + // color
      1 + // imageLevel
      1 + img.length; // imageNameLen + imageName

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let o = 0;

    view.setUint8(o++, 1); // version
    view.setUint8(o++, 1); // type
    view.setUint32(o, objectID, true);
    o += 4;

    view.setUint8(o++, key.length);
    for (let i = 0; i < key.length; i++) view.setUint8(o++, key.charCodeAt(i));

    // BBox
    view.setFloat64(o, -w / 2, true); o += 8;
    view.setFloat64(o, -d / 2, true); o += 8;
    view.setFloat64(o, 0, true); o += 8;
    view.setFloat64(o, w / 2, true); o += 8;
    view.setFloat64(o, d / 2, true); o += 8;
    view.setFloat64(o, h, true); o += 8;

    view.setFloat32(o, alt, true); o += 4;
    view.setUint8(o++, 6); // faceNum

    view.setUint32(o, vertexCount, true); o += 4;

    // 24개 정점 쓰기
    for (let i = 0; i < vertexCount; i++) {
      view.setFloat32(o, ((i % 4 === 1 || i % 4 === 2) ? w / 2 : -w / 2), true); o += 4;
      view.setFloat32(o, ((i % 4 < 2) ? -d / 2 : d / 2), true); o += 4;
      view.setFloat32(o, (i >= 12 ? h : 0), true); o += 4;
      // normal
      view.setFloat32(o, 0, true); o += 4;
      view.setFloat32(o, 0, true); o += 4;
      view.setFloat32(o, 1, true); o += 4;
      // uv
      view.setFloat32(o, (i % 2 === 0 ? 0 : 1), true); o += 4;
      view.setFloat32(o, (i % 4 < 2 ? 0 : 1), true); o += 4;
    }

    view.setUint32(o, indexCount, true); o += 4;
    for (let f = 0; f < 6; f++) {
      const b = f * 4;
      const idxs = [b, b + 1, b + 2, b, b + 2, b + 3];
      for (const idx of idxs) {
        view.setUint16(o, idx % vertexCount, true);
        o += 2;
      }
    }

    view.setUint32(o, 0xffffffff, true); o += 4; // color
    view.setUint8(o++, 1); // imageLevel
    view.setUint8(o++, img.length);
    for (let i = 0; i < img.length; i++) view.setUint8(o++, img.charCodeAt(i));

    return buffer;
  }
}

// ============================================================================
// 3. 브이월드 DEM 지형 바이너리 파서 (VWorldDEMParser)
// ============================================================================

export interface VWorldParsedDEM {
  gridSize: number;
  elevations: Float32Array;
  minElevation: number;
  maxElevation: number;
  meanElevation: number;
  geometry: THREE.PlaneGeometry;
}

export class VWorldDEMParser {
  /**
   * 브이월드 DEM 타일(65x65 격자 Float32 바이너리) 파싱
   */
  public static parse(
    data: ArrayBuffer | Uint8Array,
    gridSize = 65,
    bounds?: VWorldTileBounds
  ): VWorldParsedDEM {
    const buffer = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    const view = new DataView(buffer);
    const totalPoints = gridSize * gridSize;
    const elevations = new Float32Array(totalPoints);

    let minElevation = Infinity;
    let maxElevation = -Infinity;
    let sum = 0;

    let offset = 0;
    const canReadFloat32 = buffer.byteLength >= totalPoints * 4;

    for (let i = 0; i < totalPoints; i++) {
      let elev = 0;
      if (canReadFloat32 && offset + 4 <= buffer.byteLength) {
        elev = view.getFloat32(offset, true);
        offset += 4;
      } else if (offset + 2 <= buffer.byteLength) {
        elev = view.getInt16(offset, true) * 0.1;
        offset += 2;
      } else {
        elev = 100.0;
      }

      // 비정상 결측치(-9999 등) 보정
      if (elev < -500 || elev > 9000 || isNaN(elev)) {
        elev = 100.0;
      }

      elevations[i] = elev;
      if (elev < minElevation) minElevation = elev;
      if (elev > maxElevation) maxElevation = elev;
      sum += elev;
    }

    const meanElevation = sum / totalPoints;

    // Three.js PlaneGeometry 생성
    const widthMeters = 1000;
    const heightMeters = 1000;
    const geom = new THREE.PlaneGeometry(widthMeters, heightMeters, gridSize - 1, gridSize - 1);
    geom.rotateX(-Math.PI / 2);

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < totalPoints; i++) {
      posAttr.setY(i, elevations[i] - meanElevation);
    }
    posAttr.needsUpdate = true;
    geom.computeVertexNormals();

    return {
      gridSize,
      elevations,
      minElevation: isFinite(minElevation) ? minElevation : 0,
      maxElevation: isFinite(maxElevation) ? maxElevation : 0,
      meanElevation,
      geometry: geom,
    };
  }
}

// ============================================================================
// 4. 브이월드 WebGL 셰이더 조명·대기 안개·위성영상 그레이딩 스펙 (VWorldWebGLShaderSpec)
// ============================================================================

export interface VWorldLightingParams {
  directional: {
    color: number;
    intensity: number;
    position: [number, number, number];
  };
  hemisphere: {
    skyColor: number;
    groundColor: number;
    intensity: number;
  };
  ambient: {
    color: number;
    intensity: number;
  };
  fill: {
    color: number;
    intensity: number;
    position: [number, number, number];
  };
  exposure: number;
  toneMapping: THREE.ToneMapping;
}

export interface VWorldFogParams {
  color: number;
  density: number;
  near: number;
  far: number;
}

export interface VWorldSatelliteGradingParams {
  contrast: number;
  brightness: number;
  saturation: number;
  gamma: number;
}

export class VWorldWebGLShaderSpec {
  /**
   * 브이월드 3D 클라이언트 셰이더 역공학 기반 황금비 조명 파라미터
   *  - 주간 태양광: 웜 화이트(0xfff9e6, 1.25배)
   *  - 대기 산란광(Hemisphere): 청명 하늘(0xd9ebff) + 대지 반사(0x8c8273, 0.85배)
   *  - 환경광(Ambient): 0xe8eff5, 0.35배
   *  - 보조광(Fill): 서쪽 반사광(0xe2e8f0, 0.45배)
   */
  public static readonly LIGHTING: VWorldLightingParams = {
    directional: {
      color: 0xfff9e6,
      intensity: 1.25,
      position: [140, 220, 110],
    },
    hemisphere: {
      skyColor: 0xd9ebff,
      groundColor: 0x8c8273,
      intensity: 0.85,
    },
    ambient: {
      color: 0xe8eff5,
      intensity: 0.35,
    },
    fill: {
      color: 0xe2e8f0,
      intensity: 0.45,
      position: [-100, 120, -90],
    },
    exposure: 1.08,
    toneMapping: THREE.ACESFilmicToneMapping,
  };

  /**
   * 브이월드 대기 안개(Distance Fog) 파라미터
   *  - 지평선 근처의 아늑한 대기 원근감 부여 (#dbeafe, density: 0.00018)
   */
  public static readonly FOG: VWorldFogParams = {
    color: 0xdbeafe,
    density: 0.00018,
    near: 600,
    far: 4500,
  };

  /**
   * 항공 정사영상(Satellite)과 3D 건물 간의 시각적 명도·채도 밸런스 공식
   */
  public static readonly SATELLITE_GRADING: VWorldSatelliteGradingParams = {
    contrast: 1.06,
    brightness: 1.02,
    saturation: 0.95,
    gamma: 1.0,
  };

  /**
   * Three.js Scene 및 WebGLRenderer에 브이월드 표준 조명/안개/톤매핑 일괄 적용
   */
  public static applyToScene(
    scene: THREE.Scene,
    renderer?: THREE.WebGLRenderer
  ): {
    dirLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    ambLight: THREE.AmbientLight;
    fillLight: THREE.DirectionalLight;
  } {
    // 1. 태양광
    const dirLight = new THREE.DirectionalLight(
      this.LIGHTING.directional.color,
      this.LIGHTING.directional.intensity
    );
    dirLight.position.set(...this.LIGHTING.directional.position).normalize();
    dirLight.castShadow = false; // 성능을 위해 캐스케이드 섀도우 분리 제어
    scene.add(dirLight);

    // 2. 대기 반사광
    const hemiLight = new THREE.HemisphereLight(
      this.LIGHTING.hemisphere.skyColor,
      this.LIGHTING.hemisphere.groundColor,
      this.LIGHTING.hemisphere.intensity
    );
    scene.add(hemiLight);

    // 3. 환경 기본광
    const ambLight = new THREE.AmbientLight(
      this.LIGHTING.ambient.color,
      this.LIGHTING.ambient.intensity
    );
    scene.add(ambLight);

    // 4. 역광 음영 완화 보조광
    const fillLight = new THREE.DirectionalLight(
      this.LIGHTING.fill.color,
      this.LIGHTING.fill.intensity
    );
    fillLight.position.set(...this.LIGHTING.fill.position).normalize();
    scene.add(fillLight);

    // 5. 대기 안개 적용
    scene.fog = new THREE.FogExp2(this.FOG.color, this.FOG.density);

    // 6. 렌더러 컬러 그레이딩 및 톤매핑 보정
    if (renderer) {
      renderer.toneMapping = this.LIGHTING.toneMapping;
      renderer.toneMappingExposure = this.LIGHTING.exposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    return { dirLight, hemiLight, ambLight, fillLight };
  }
}
