/**
 * src/lib/vendor/vworldB3dmLoader.ts
 *
 * [GeoBrief 3D: V-World 공식 LOD4 b3dm (Batched 3D Model) 고속 파서 & PBR 변환기]
 *
 * 국토교통부 브이월드(V-World / XDWorld) 3D 타일셋의 바이너리 건물 파일(.b3dm)을
 * 초경량으로 언패킹하고, Three.js GLTFLoader, Google Draco 디코더, Basis Universal KTX2 트랜스코더를 통해
 * 실사 PBR 셰이더 및 실제 외형 모델링이 적용된 Three.js 메쉬 그룹으로 변환하는 핵심 벤더링 모듈입니다.
 *
 * [b3dm 바이너리 규격]:
 * - Header (28 bytes):
 *   * magic (4 bytes): 'b3dm'
 *   * version (4 bytes): 1
 *   * byteLength (4 bytes)
 *   * featureTableJSONByteLength (4 bytes)
 *   * featureTableBinaryByteLength (4 bytes)
 *   * batchTableJSONByteLength (4 bytes)
 *   * batchTableBinaryByteLength (4 bytes)
 * - Feature Table JSON & Binary (BATCH_LENGTH, RTC_CENTER)
 * - Batch Table JSON & Binary (TD_ID, MODEL_NAME, __OID__)
 * - Embedded GLB (glTF Binary with KHR_draco_mesh_compression, KHR_texture_basisu)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { attachSharedPbrShader } from '@/lib/vendor/photorealisticPbrShader';

export interface B3dmHeader {
  magic: string;
  version: number;
  byteLength: number;
  featureTableJSONByteLength: number;
  featureTableBinaryByteLength: number;
  batchTableJSONByteLength: number;
  batchTableBinaryByteLength: number;
  glbOffset: number;
  glbByteLength: number;
}

export interface ParsedB3dmResult {
  header: B3dmHeader;
  featureTable: {
    BATCH_LENGTH?: number;
    RTC_CENTER?: [number, number, number];
    [key: string]: any;
  };
  batchTable: {
    TD_ID?: string[];
    MODEL_NAME?: string[];
    __OID__?: number[];
    [key: string]: any;
  };
  rtcCenterWgs84: {
    lng: number;
    lat: number;
    alt: number;
  } | null;
  scene: THREE.Group;
  meshes: THREE.Mesh[];
  totalVertices: number;
}

let cachedDracoLoader: DRACOLoader | null = null;
let cachedKtx2Loader: KTX2Loader | null = null;
let cachedGltfLoader: GLTFLoader | null = null;

function getOrCreateKtx2Loader(renderer?: THREE.WebGLRenderer | null): KTX2Loader | null {
  if (typeof window === 'undefined') return null;
  if (cachedKtx2Loader) return cachedKtx2Loader;

  try {
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    if (renderer) {
      ktx2Loader.detectSupport(renderer);
    }
    cachedKtx2Loader = ktx2Loader;
    return cachedKtx2Loader;
  } catch (err) {
    console.warn('[VWorldB3dmLoader] Failed to init KTX2Loader:', err);
    return null;
  }
}

function getOrCreateGltfLoader(renderer?: THREE.WebGLRenderer | null): GLTFLoader {
  if (cachedGltfLoader) {
    if (renderer && cachedKtx2Loader) {
      try {
        cachedKtx2Loader.detectSupport(renderer);
      } catch {}
    }
    return cachedGltfLoader;
  }

  const gltfLoader = new GLTFLoader();

  if (typeof window !== 'undefined') {
    // 1. Google Draco WebAssembly 디코더
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    gltfLoader.setDRACOLoader(dracoLoader);
    cachedDracoLoader = dracoLoader;

    // 2. Basis Universal KTX2 실사 텍스처 트랜스코더
    const ktx2Loader = getOrCreateKtx2Loader(renderer);
    if (ktx2Loader) {
      gltfLoader.setKTX2Loader(ktx2Loader);
    }
  }

  cachedGltfLoader = gltfLoader;
  return cachedGltfLoader;
}

/**
 * WGS84 ECEF -> 경위도(도) 및 타원체고(m) Bowring 폐형(Closed-form) 변환 알고리즘
 */
export function ecefToWgs84(X: number, Y: number, Z: number): { lng: number; lat: number; alt: number } {
  const a = 6378137.0; // 장반경
  const f = 1.0 / 298.257223563;
  const b = a * (1.0 - f); // 단반경
  const e2 = (a * a - b * b) / (a * a);
  const ep2 = (a * a - b * b) / (b * b);

  const p = Math.hypot(X, Y);
  const theta = Math.atan2(Z * a, p * b);
  const latRad = Math.atan2(
    Z + ep2 * b * Math.pow(Math.sin(theta), 3),
    p - e2 * a * Math.pow(Math.cos(theta), 3)
  );
  const lngRad = Math.atan2(Y, X);

  const sinLat = Math.sin(latRad);
  const N = a / Math.sqrt(1.0 - e2 * sinLat * sinLat);
  const alt = p / Math.cos(latRad) - N;

  return {
    lng: (lngRad * 180.0) / Math.PI,
    lat: (latRad * 180.0) / Math.PI,
    alt,
  };
}

/**
 * ECEF -> Three.js MapLibre 좌표계 (X: East, Y: Up, Z: South) 변환 행렬 생성
 */
export function createEcefToThreeMatrix(lngDeg: number, latDeg: number): THREE.Matrix4 {
  const lngRad = (lngDeg * Math.PI) / 180.0;
  const latRad = (latDeg * Math.PI) / 180.0;

  const sinLng = Math.sin(lngRad);
  const cosLng = Math.cos(lngRad);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);

  const mat = new THREE.Matrix4();
  // Row 0: East = [-sinLng, cosLng, 0]
  // Row 1: Up   = [cosLat * cosLng, cosLat * sinLng, sinLat]
  // Row 2: South = [-sinLat * cosLng, -sinLat * sinLng, -cosLat]
  mat.set(
    -sinLng,            cosLng,            0,       0,
    cosLat * cosLng,   cosLat * sinLng,   sinLat,   0,
    -sinLat * cosLng,  -sinLat * sinLng,  -cosLat,  0,
    0,                 0,                 0,       1
  );
  return mat;
}

export class VWorldB3dmLoader {
  /**
   * b3dm 28바이트 바이너리 헤더 파싱
   */
  public static parseHeader(buffer: ArrayBuffer): B3dmHeader {
    const view = new DataView(buffer);
    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );

    if (magic !== 'b3dm') {
      throw new Error(`[VWorldB3dmLoader] Invalid magic: expected 'b3dm', got '${magic}'`);
    }

    const version = view.getUint32(4, true);
    const byteLength = view.getUint32(8, true);
    const featureTableJSONByteLength = view.getUint32(12, true);
    const featureTableBinaryByteLength = view.getUint32(16, true);
    const batchTableJSONByteLength = view.getUint32(20, true);
    const batchTableBinaryByteLength = view.getUint32(24, true);

    const glbOffset =
      28 +
      featureTableJSONByteLength +
      featureTableBinaryByteLength +
      batchTableJSONByteLength +
      batchTableBinaryByteLength;

    const glbByteLength = buffer.byteLength - glbOffset;

    return {
      magic,
      version,
      byteLength,
      featureTableJSONByteLength,
      featureTableBinaryByteLength,
      batchTableJSONByteLength,
      batchTableBinaryByteLength,
      glbOffset,
      glbByteLength,
    };
  }

  /**
   * b3dm 바이너리 버퍼에서 내장 GLB를 추출하고 Three.js PBR 씬으로 변환
   */
  public static async loadFromBuffer(
    buffer: ArrayBuffer,
    renderer?: THREE.WebGLRenderer | null
  ): Promise<ParsedB3dmResult> {
    const header = this.parseHeader(buffer);

    // 1. Feature Table JSON 파싱 (RTC_CENTER 추출)
    let featureTable: any = {};
    if (header.featureTableJSONByteLength > 0) {
      try {
        const ftBytes = new Uint8Array(buffer, 28, header.featureTableJSONByteLength);
        const ftStr = new TextDecoder().decode(ftBytes);
        featureTable = JSON.parse(ftStr.trim() || '{}');
      } catch (e) {
        console.warn('[VWorldB3dmLoader] Failed to parse feature table JSON:', e);
      }
    }

    // 2. Batch Table JSON 파싱 (건물 모델명 MODEL_NAME, TD_ID 등)
    let batchTable: any = {};
    if (header.batchTableJSONByteLength > 0) {
      try {
        const btOffset = 28 + header.featureTableJSONByteLength + header.featureTableBinaryByteLength;
        const btBytes = new Uint8Array(buffer, btOffset, header.batchTableJSONByteLength);
        const btStr = new TextDecoder().decode(btBytes);
        batchTable = JSON.parse(btStr.trim() || '{}');
      } catch (e) {
        console.warn('[VWorldB3dmLoader] Failed to parse batch table JSON:', e);
      }
    }

    // 3. RTC_CENTER 기반 WGS84 좌표 및 변환 행렬 도출
    let rtcCenterWgs84: { lng: number; lat: number; alt: number } | null = null;
    let ecefToThreeMat: THREE.Matrix4 | null = null;
    if (Array.isArray(featureTable.RTC_CENTER) && featureTable.RTC_CENTER.length >= 3) {
      const [X, Y, Z] = featureTable.RTC_CENTER;
      rtcCenterWgs84 = ecefToWgs84(X, Y, Z);
      ecefToThreeMat = createEcefToThreeMatrix(rtcCenterWgs84.lng, rtcCenterWgs84.lat);
    }

    const glbBuffer = buffer.slice(header.glbOffset);
    const gltfLoader = getOrCreateGltfLoader(renderer);

    return new Promise((resolve, reject) => {
      gltfLoader.parse(
        glbBuffer,
        '',
        (gltf) => {
          const scene = gltf.scene;
          const meshes: THREE.Mesh[] = [];
          let totalVertices = 0;

          // ECEF -> Three.js 로컬 ENU 회전 행렬 적용
          if (ecefToThreeMat) {
            scene.applyMatrix4(ecefToThreeMat);
            scene.updateMatrixWorld(true);
          }

          scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              meshes.push(mesh);

              if (mesh.geometry && mesh.geometry.attributes.position) {
                totalVertices += mesh.geometry.attributes.position.count;
              }

              // StreetsGL + V-World PBR 셰이더 및 전역 0-GC Uniform 바인딩
              if (Array.isArray(mesh.material)) {
                for (let i = 0; i < mesh.material.length; i++) {
                  attachSharedPbrShader(mesh.material[i]);
                  mesh.material[i].side = THREE.DoubleSide;
                }
              } else if (mesh.material) {
                attachSharedPbrShader(mesh.material);
                mesh.material.side = THREE.DoubleSide;
              }

              mesh.castShadow = false;
              mesh.receiveShadow = false;
            }
          });

          resolve({
            header,
            featureTable,
            batchTable,
            rtcCenterWgs84,
            scene,
            meshes,
            totalVertices,
          });
        },
        (error) => {
          reject(new Error(`[VWorldB3dmLoader] Failed to parse GLTF: ${error}`));
        }
      );
    });
  }

  /**
   * 원격 URL 또는 프록시 라우트로부터 b3dm 파일 다운로드 후 즉시 파싱
   */
  public static async loadFromUrl(
    url: string,
    renderer?: THREE.WebGLRenderer | null
  ): Promise<ParsedB3dmResult> {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/octet-stream, model/gltf-binary, */*',
        'User-Agent': 'GeoBrief-3D/1.0',
      },
    });

    if (!res.ok) {
      throw new Error(`[VWorldB3dmLoader] HTTP ${res.status} fetching ${url}`);
    }

    const buffer = await res.arrayBuffer();
    return this.loadFromBuffer(buffer, renderer);
  }
}
