/**
 * src/lib/vendor/vworldWaterSkyEnv.ts
 *
 * [mrdoob/three.js Water + Sky + PMREMGenerator 어댑터]
 * - 기존 V-World 3D 건물 레이어를 건드리지 않고 독립적으로 수면 물결/반사 및 대기 하늘 IBL을 제공
 */

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

export interface WaterSkyEnvConfig {
  waterColor?: number;
  sunColor?: number;
  distortionScale?: number;
  sizeMeters?: number;
}

export class VWorldWaterSkyEnv {
  public sky: Sky;
  public water: Water | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private sunVec = new THREE.Vector3(0.4, 0.7, 0.5).normalize();

  constructor(config: WaterSkyEnvConfig = {}) {
    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    const skyUniforms = this.sky.material.uniforms;
    if (skyUniforms['turbidity']) skyUniforms['turbidity'].value = 4.0;
    if (skyUniforms['rayleigh']) skyUniforms['rayleigh'].value = 1.6;
    if (skyUniforms['mieCoefficient']) skyUniforms['mieCoefficient'].value = 0.005;
    if (skyUniforms['mieDirectionalG']) skyUniforms['mieDirectionalG'].value = 0.8;
    if (skyUniforms['sunPosition']) skyUniforms['sunPosition'].value.copy(this.sunVec);

    const size = config.sizeMeters ?? 2500;
    const waterGeo = new THREE.PlaneGeometry(size, size);
    const normalTex = this.createProceduralWaterNormals();

    this.water = new Water(waterGeo, {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals: normalTex,
      sunDirection: this.sunVec.clone(),
      sunColor: config.sunColor ?? 0xffffff,
      waterColor: config.waterColor ?? 0x0b3b5b,
      distortionScale: config.distortionScale ?? 2.4,
      fog: false,
    });
    this.water.rotation.x = -Math.PI / 2;
  }

  private createProceduralWaterNormals(): THREE.DataTexture {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = Math.sin((x / size) * Math.PI * 6) * 0.18;
        const ny = Math.cos((y / size) * Math.PI * 6) * 0.18;
        data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = 245;
        data[idx + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  public updateSun(elevationDeg: number, azimuthDeg: number, renderer?: THREE.WebGLRenderer, targetScene?: THREE.Scene): void {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunVec.setFromSphericalCoords(1, phi, theta).normalize();

    if (this.sky.material.uniforms['sunPosition']) {
      this.sky.material.uniforms['sunPosition'].value.copy(this.sunVec);
    }
    if (this.water?.material.uniforms['sunDirection']) {
      this.water.material.uniforms['sunDirection'].value.copy(this.sunVec);
    }

    if (renderer && targetScene) {
      if (!this.pmremGenerator) {
        this.pmremGenerator = new THREE.PMREMGenerator(renderer);
      }
      if (this.envTarget) {
        this.envTarget.dispose();
      }
      const envScene = new THREE.Scene();
      envScene.add(this.sky);
      this.envTarget = this.pmremGenerator.fromScene(envScene);
      targetScene.environment = this.envTarget.texture;
    }
  }

  public tick(deltaSec: number): void {
    if (this.water?.material.uniforms['time']) {
      this.water.material.uniforms['time'].value += deltaSec * 0.65;
    }
  }

  public dispose(): void {
    if (this.water) {
      this.water.geometry.dispose();
      this.water.material.dispose();
      this.water = null;
    }
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.envTarget?.dispose();
    this.pmremGenerator?.dispose();
  }
}
