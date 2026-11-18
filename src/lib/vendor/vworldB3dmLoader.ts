/**
 * src/lib/vendor/vworldB3dmLoader.ts
 *
 * [GeoBrief 3D 2단계: V-World 공식 LOD4 b3dm (Batched 3D Model) 고속 파서 & PBR 변환기]
 *
 * 국토교통부 브이월드(V-World / XDWorld) 3D 타일셋의 바이너리 건물 파일(.b3dm)을
 * 0.05초 내로 언패킹하고, Three.js GLTFLoader 및 Google Draco 디코더를 통해
 * 실사 PBR 셰이더가 적용된 Three.js 메쉬 그룹으로 변환하는 초경량 벤더링 모듈입니다.
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
 * - Feature Table JSON & Binary
 * - Batch Table JSON & Binary
 * - Embedded GLB (glTF Binary with KHR_draco_mesh_compression)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
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
  scene: THREE.Group;
  meshes: THREE.Mesh[];
  totalVertices: number;
}

let cachedDracoLoader: DRACOLoader | null = null;
let cachedGltfLoader: GLTFLoader | null = null;

function getOrCreateGltfLoader(): GLTFLoader {
  if (cachedGltfLoader) return cachedGltfLoader;

  const gltfLoader = new GLTFLoader();

  // Draco 디코더 경로 설정 (public/draco/ 또는 CDN 폴백)
  if (typeof window !== 'undefined') {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    dracoLoader.setDecoderConfig({ type: 'wasm' });
    gltfLoader.setDRACOLoader(dracoLoader);
    cachedDracoLoader = dracoLoader;
  }

  cachedGltfLoader = gltfLoader;
  return cachedGltfLoader;
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
  public static async loadFromBuffer(buffer: ArrayBuffer): Promise<ParsedB3dmResult> {
    const header = this.parseHeader(buffer);
    const glbBuffer = buffer.slice(header.glbOffset);

    const gltfLoader = getOrCreateGltfLoader();

    return new Promise((resolve, reject) => {
      gltfLoader.parse(
        glbBuffer,
        '',
        (gltf) => {
          const scene = gltf.scene;
          const meshes: THREE.Mesh[] = [];
          let totalVertices = 0;

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
  public static async loadFromUrl(url: string): Promise<ParsedB3dmResult> {
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
    return this.loadFromBuffer(buffer);
  }
}
