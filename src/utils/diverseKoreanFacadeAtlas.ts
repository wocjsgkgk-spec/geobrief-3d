/**
 * utils/diverseKoreanFacadeAtlas.ts
 *
 * [GeoBrief 3D 2단계: 4096px PBR 포토 아틀라스 & 한국형 실사 파사드 아틀라스 엔진]
 *
 * vworldPhotoAtlasGenerator(4096x4096 Canvas PBR 엔진)와 100% 직결하여,
 * 브이월드 4대 레퍼런스(image_7c6d3f, image_7c1ba4, image_7c1b86, image_7c1b61)
 * 실제 도시 뷰의 8종 아파트(민트그린 발코니), 한국형 상가 간판 패치, 학교 교사동, 저층 주택 텍스처를 공급합니다.
 */

import * as THREE from 'three';
import {
  VWORLD_ATLAS_SIZE,
  VWORLD_ATLAS_COLS,
  VWORLD_ATLAS_ROWS,
  VWORLD_CELL_SIZE,
  VWORLD_PHOTO_SLOT_MAP,
  getVworldPhotoSlotUV,
  createVworldPhotoAtlasCanvas,
  getVworldPhotoAtlasTexture,
  createVworldPhotoRmaCanvas,
  getVworldPhotoRmaTexture,
  disposeVworldPhotoAtlas,
  VworldPhotoUVRect,
} from '@/lib/vendor/vworldPhotoAtlasGenerator';

export const DIVERSE_ATLAS_SIZE = VWORLD_ATLAS_SIZE;
export const DIVERSE_ATLAS_COLS = VWORLD_ATLAS_COLS;
export const DIVERSE_ATLAS_ROWS = VWORLD_ATLAS_ROWS;
export const DIVERSE_CELL_W = VWORLD_CELL_SIZE;
export const DIVERSE_CELL_H = VWORLD_CELL_SIZE;

export type DiverseUVRect = VworldPhotoUVRect;
export type UVRect = DiverseUVRect;

export const DIVERSE_SLOT_NAME_TO_ID: Record<string, number> = VWORLD_PHOTO_SLOT_MAP;

/**
 * 64 슬롯 UV 좌표 반환 (Three.js flipY = true)
 */
export function getDiverseFacadeSlotUV(slot: number | string): DiverseUVRect {
  return getVworldPhotoSlotUV(slot);
}

export const getPhotorealisticSlotUV = getDiverseFacadeSlotUV;

/**
 * 4096x4096 실사 포토 아틀라스 Canvas 생성
 */
export function createDiverseKoreanFacadeAtlasCanvas(): HTMLCanvasElement {
  return createVworldPhotoAtlasCanvas();
}

/**
 * 고해상도 CanvasTexture 인스턴스 반환 및 캐싱
 */
export function getDiverseKoreanFacadeAtlasTexture(): THREE.CanvasTexture {
  return getVworldPhotoAtlasTexture();
}

/**
 * PBR RMA (Roughness - Metalness - AO) 텍스처 인스턴스 반환
 */
export function getDiverseFacadeRmaTexture(): THREE.CanvasTexture {
  return getVworldPhotoRmaTexture();
}

/**
 * 아틀라스 텍스처 메모리 해제
 */
export function disposeDiverseKoreanFacadeAtlas(): void {
  disposeVworldPhotoAtlas();
}
