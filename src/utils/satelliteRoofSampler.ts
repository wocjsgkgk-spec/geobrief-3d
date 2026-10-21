/**
 * utils/satelliteRoofSampler.ts
 *
 * [GeoBrief 3D: satelliteColorExtractor 위임 및 하위 호환성 래퍼]
 */

export type {
  ExtractedRoofColor,
  ExtractedRoofColor as SatelliteRoofColor,
  RoofMaterialType,
} from '@/utils/satelliteColorExtractor';

export {
  lngLatToTilePixel,
  fetchSatelliteTileData,
  sampleRoofColorFromTiles,
  extractSatelliteColorsForFeatures,
  sampleBuildingRoofColors,
  getDefaultFallbackColor,
  rgbToHex,
} from '@/utils/satelliteColorExtractor';
