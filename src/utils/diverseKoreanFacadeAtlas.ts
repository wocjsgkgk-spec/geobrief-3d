/**
 * utils/diverseKoreanFacadeAtlas.ts
 *
 * [GeoBrief 3D 2단계: 4096px 16종 실사 PBR 포토 아틀라스 & 한국형 파사드 엔진]
 *
 * vworld16AtlasBuilder(4096x4096 Canvas PBR 16슬롯 엔진)와 100% 직결하여,
 * 브이월드 4대 레퍼런스 실제 도시 뷰의 4종 아파트(화이트/샌드/쿨그레이/아이보리),
 * 4종 상가(화강석간판/적벽돌/다크루버/클리닉), 3종 혁신도시 공공청사, 3종 저층 빌라/주택,
 * 학교 교사동, 물류 시설 텍스처를 전역 공급합니다.
 */

import * as THREE from 'three';
import {
  VWORLD16_ATLAS_SIZE,
  VWORLD16_SLOT_SIZE,
  VWORLD16_GRID_COUNT,
  Vworld16UVRect,
  getVworld16SlotUV,
  createVworld16MasterAtlasCanvas,
  createVworld16RmaAtlasCanvas,
  getVworld16MasterAtlasTexture,
  getVworld16RmaAtlasTexture,
  disposeVworld16Atlas,
  VWORLD16_ROOF_COLORS,
  getVworld16BuildingStyle,
} from '@/utils/vworld16AtlasBuilder';

export const DIVERSE_ATLAS_SIZE = VWORLD16_ATLAS_SIZE;
export const DIVERSE_ATLAS_COLS = VWORLD16_GRID_COUNT;
export const DIVERSE_ATLAS_ROWS = VWORLD16_GRID_COUNT;
export const DIVERSE_CELL_W = VWORLD16_SLOT_SIZE;
export const DIVERSE_CELL_H = VWORLD16_SLOT_SIZE;

export type DiverseUVRect = Vworld16UVRect;
export type UVRect = DiverseUVRect;

/**
 * 16슬롯 명칭 -> ID 매핑 테이블 (하위 호환 100% 지원)
 */
export const DIVERSE_SLOT_NAME_TO_ID: Record<string, number> = {
  // 아파트 4종
  apt_style_1_cream: 0,
  apt_preset_a: 0,
  apt_cream_white: 0,
  apt_warm_cream: 0,
  apt_side_brown: 0,

  apt_style_2_sand: 1,
  apt_preset_b: 1,
  apt_sand_beige: 1,
  apt_ground_brown: 1,
  apt_side_terracotta: 1,

  apt_style_4_warmgray: 2,
  apt_modern_gray: 2,
  apt_style_5_modern: 2,
  apt_side_navy: 2,
  apt_side_warmgray: 2,

  apt_style_3_ivory: 3,
  apt_style_6_terracotta: 3,
  apt_terracotta_two: 3,
  apt_modern_twotone: 3,

  // 상가 4종
  comm_ground_shop: 4,
  comm_granite_office: 4,
  comm_granite_tile: 4,
  comm_sign_clinic: 4,
  comm_sign_academy: 4,
  comm_sign_cafe: 4,
  comm_sign_fitness: 4,

  school_red_brick: 5,
  villa_red_brick: 5,

  comm_charcoal_panel: 6,
  crown_frame: 6,

  hospital_facade: 7,
  comm_retail_office: 7,

  // 혁신도시 공공기관 3종
  gov_tower: 8,
  comm_sky_curtain: 8,

  comm_emerald_glass: 9,

  gov_podium: 10,

  // 저층 빌라 및 단독주택 3종
  villa_granite: 11,
  villa_stucco_ivory: 11,

  pilotis_studio: 12,
  villa_brown_brick: 12,

  detached_house: 13,
  lowrise_granite: 13,
  military_barracks: 13,

  // 학교 교사동
  school_terracotta_brick: 14,
  school_brick_facade: 14,

  // 물류 및 체육시설
  facility_blue: 15,
  facility_white: 15,
  facility_gray: 15,

  // 옥상 및 파라펫 호환
  parapet_concrete: 2,
  roof_concrete_warmgray: 2,
  roof_urethane_sage: 2,
  roof_terracotta_tile: 2,
  roof_zinc_blue: 15,
  roof_school_green: 2,
};

/**
 * 16슬롯 UV 좌표 반환 (Three.js flipY = true)
 */
export function getDiverseFacadeSlotUV(slot: number | string): DiverseUVRect {
  if (typeof slot === 'number') {
    return getVworld16SlotUV(slot);
  }
  const mapped = DIVERSE_SLOT_NAME_TO_ID[slot];
  if (mapped !== undefined) {
    return getVworld16SlotUV(mapped);
  }
  return getVworld16SlotUV(0);
}

export const getPhotorealisticSlotUV = getDiverseFacadeSlotUV;

/**
 * 4096x4096 실사 포토 아틀라스 Canvas 생성
 */
export function createDiverseKoreanFacadeAtlasCanvas(): HTMLCanvasElement {
  return createVworld16MasterAtlasCanvas();
}

/**
 * 고해상도 CanvasTexture 인스턴스 반환 및 캐싱
 */
export function getDiverseKoreanFacadeAtlasTexture(): THREE.CanvasTexture {
  return getVworld16MasterAtlasTexture();
}

/**
 * PBR RMA (Roughness - Metalness - AO) 텍스처 인스턴스 반환
 */
export function getDiverseFacadeRmaTexture(): THREE.CanvasTexture {
  return getVworld16RmaAtlasTexture();
}

/**
 * 아틀라스 텍스처 메모리 해제
 */
export function disposeDiverseKoreanFacadeAtlas(): void {
  disposeVworld16Atlas();
}

export {
  VWORLD16_ROOF_COLORS,
  getVworld16BuildingStyle,
};
