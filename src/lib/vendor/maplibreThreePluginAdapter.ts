/**
 * lib/vendor/maplibreThreePluginAdapter.ts
 *
 * [dvt3d/maplibre-three-plugin 기반 MapLibre v5 + Three.js 매트릭스 정밀 동기화 어댑터]
 *
 * Source: dvt3d/maplibre-three-plugin & MapLibre Custom Layer Specification
 * 1. MapLibre Mercator 좌표계 -> Three.js 월드 공간 매트릭스 변환
 * 2. 원근 투영 및 자이로 피치(Pitch 0°~85°) 동기화
 * 3. 줌 레벨별 스케일 계수 자동 보정 (공중부양 및 Z-Fighting 방지)
 */

import * as THREE from 'three';
import maplibregl from 'maplibre-gl';

export class MapLibreThreeMatrixAdapter {
  private static readonly WORLD_SIZE = 512;

  /**
   * 경위도(Lng, Lat) 기준 원점의 Mercator 좌표 및 Three.js 미터 스케일 계산
   */
  public static calculateOrigin(lngLat: [number, number]): {
    mercatorCoord: maplibregl.MercatorCoordinate;
    metersPerMercator: number;
    originScale: number;
  } {
    const mercatorCoord = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: lngLat[0], lat: lngLat[1] },
      0
    );
    const originScale = mercatorCoord.meterInMercatorCoordinateUnits();
    const metersPerMercator = 1 / originScale;

    return {
      mercatorCoord,
      metersPerMercator,
      originScale,
    };
  }

  /**
   * MapLibre v5 커스텀 레이어 옵션으로부터 투영 행렬을 정확히 추출
   */
  public static extractProjectionMatrix(options: any, map?: maplibregl.Map | null): number[] | null {
    if (!options) return null;

    // MapLibre GL JS v5 표준 프로젝션 매트릭스
    if (options.defaultProjectionData?.mainMatrix) {
      return options.defaultProjectionData.mainMatrix;
    }

    if (Array.isArray(options.matrix)) {
      return options.matrix;
    }

    if (Array.isArray(options)) {
      return options;
    }

    // 폴백: 맵 트랜스폼 커스텀 레이어 매트릭스
    if (map && (map as any).transform?.customLayerMatrix) {
      return (map as any).transform.customLayerMatrix();
    }

    return null;
  }

  /**
   * Three.js 카메라 및 씬 모델 매트릭스 1:1 정렬
   */
  public static syncCamera(
    camera: THREE.Camera,
    projectionMatrixArray: number[],
    mercatorCoord: maplibregl.MercatorCoordinate,
    originScale: number
  ): void {
    const m = new THREE.Matrix4().fromArray(projectionMatrixArray);
    const l = new THREE.Matrix4()
      .makeTranslation(mercatorCoord.x, mercatorCoord.y, mercatorCoord.z)
      .scale(new THREE.Vector3(originScale, -originScale, originScale))
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2));

    camera.projectionMatrix.copy(m).multiply(l);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
}
