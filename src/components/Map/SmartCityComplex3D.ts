/**
 * SmartCityComplex3D.ts
 *
 * [완전 소거: 산속/공중 가짜 절차적 건물·군 막사 생성기 영구 제거]
 * - 오직 2가지 진실된 데이터 소스만 3D 렌더링에 사용:
 *   1) 베이스맵 벡터 타일 (openmaptiles-vector / openfreemap 'building')
 *   2) 브이월드 WFS (LT_C_SPBD, SRSNAME=EPSG:4326)
 * - 임의 좌표 기반 가짜 복합단지·군 막사 3D 메쉬 생성 코드 완전 삭제
 */

import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import {
  getGangwonMilitarySiteById,
} from '@/constants/gangwonMilitarySites';
import {
  getGangwon18MilitarySiteById,
} from '@/constants/gangwon18MilitarySites';
import { extractCustomLayerMatrix } from '@/utils/customLayerMatrix';

export const FIRST_LOGISTICS_WONJU_CENTER: [number, number] = [127.9358, 37.3592];

export type SmartCityMaterials = Record<string, THREE.Material>;

export function createSmartCityMaterials(): SmartCityMaterials {
  return {};
}

export function buildComplexForSite(
  _siteId: string,
  _mats?: SmartCityMaterials,
  _mode: 'current_military' | 'future_masterplan' = 'future_masterplan'
): THREE.Group {
  return new THREE.Group();
}

export function createSmartCityComplexMesh(): THREE.Group {
  return new THREE.Group();
}

/**
 * SmartCityComplex3DLayer
 * - 인터페이스 호환성을 유지하되 절차적 가짜 건물 메쉬 생성을 영구 차단
 */
export class SmartCityComplex3DLayer implements maplibregl.CustomLayerInterface {
  id = 'smart-city-complex-3d-layer';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map: maplibregl.Map | null = null;
  private camera: THREE.Camera = new THREE.Camera();
  private scene: THREE.Scene = new THREE.Scene();
  private isVisible = false;
  private currentMode: 'current_military' | 'future_masterplan' = 'future_masterplan';
  private currentSiteId = 'first-logistics-wonju';
  private centerLngLat: [number, number] = FIRST_LOGISTICS_WONJU_CENTER;

  constructor(initialSiteId = 'first-logistics-wonju') {
    this.currentSiteId = initialSiteId;
    const site = getGangwon18MilitarySiteById(initialSiteId) || getGangwonMilitarySiteById(initialSiteId);
    if (site) {
      this.centerLngLat = site.center;
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public setMode(mode: 'current_military' | 'future_masterplan'): void {
    this.currentMode = mode;
  }

  public getMode(): 'current_military' | 'future_masterplan' {
    return this.currentMode;
  }

  public setSite(siteId: string): void {
    this.currentSiteId = siteId;
    const site = getGangwon18MilitarySiteById(siteId) || getGangwonMilitarySiteById(siteId);
    if (site) {
      this.centerLngLat = site.center;
    }
  }

  public updateSunLight(
    _altDegOrVec: [number, number, number] | THREE.Vector3 | number,
    _azDegOrColor?: string | number,
    _intensity = 1.0,
    _color?: string
  ): void {}

  public onAdd(map: maplibregl.Map, _gl: WebGLRenderingContext): void {
    this.map = map;
  }

  public render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: any): void {
    if (!this.isVisible || !this.map) return;
    const m = extractCustomLayerMatrix(options);
    if (m) {
      this.camera.projectionMatrix.fromArray(m);
    }
    gl.enable(gl.DEPTH_TEST);
  }

  public onRemove(): void {
    this.map = null;
  }
}
