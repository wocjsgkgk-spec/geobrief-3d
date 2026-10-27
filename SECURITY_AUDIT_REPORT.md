# SkillSpector Security Report

**Skill:** unknown  
**Source:** `/mnt/d/maps/src`  
**Scanned:** 2026-10-27 01:11:13 UTC  

## Risk Assessment

| Metric | Value |
|--------|-------|
| Score | 32/100 |
| Severity | MEDIUM |
| Recommendation | CAUTION |

## Components (143)

| File | Type | Lines | Executable |
|------|------|-------|------------|
| `app/api/buildings/fusion/route.ts` | typescript | 690 | Yes |
| `app/api/cadastral-analysis/route.ts` | typescript | 450 | Yes |
| `app/api/cadastral-local/route.ts` | typescript | 140 | Yes |
| `app/api/external-3d/verify/route.ts` | typescript | 255 | Yes |
| `app/api/gangwon-search/route.ts` | typescript | 295 | Yes |
| `app/api/gangwon-spatial/route.ts` | typescript | 683 | Yes |
| `app/api/molit-hub/route.ts` | typescript | 992 | Yes |
| `app/api/vworld-buildings/route.ts` | typescript | 442 | Yes |
| `app/api/vworld-zoning/route.ts` | typescript | 574 | Yes |
| `app/api/vworld/3dtiles/[...path]/route.ts` | typescript | 84 | Yes |
| `app/api/vworld/3dtiles/route.ts` | typescript | 211 | Yes |
| `app/api/vworld/buildings/route.ts` | typescript | 443 | Yes |
| `app/api/vworld/wms/route.ts` | typescript | 78 | Yes |
| `app/error.tsx` | other | 117 | Yes |
| `app/global-error.tsx` | other | 72 | Yes |
| `app/globals.css` | other | 64 | Yes |
| `app/layout.tsx` | other | 21 | Yes |
| `app/page.tsx` | other | 172 | Yes |
| `components/Analysis/TerrainProfileModal.tsx` | other | 440 | Yes |
| `components/Cinematic/CinematicBuilderModal.tsx` | other | 395 | Yes |
| `components/Cinematic/CinematicOsdOverlay.tsx` | other | 292 | Yes |
| `components/Header/Header.tsx` | other | 1081 | Yes |
| `components/Map/AccessibilityTableOverlay.tsx` | other | 491 | Yes |
| `components/Map/BriefingHeader.tsx` | other | 95 | Yes |
| `components/Map/Compass.tsx` | other | 120 | Yes |
| `components/Map/CutFillSummaryCard.tsx` | other | 244 | Yes |
| `components/Map/Deck3DTilesOverlay.ts` | typescript | 21 | Yes |
| `components/Map/LOD2BuildingEngine.ts` | typescript | 2491 | Yes |
| `components/Map/LegendBox.tsx` | other | 177 | Yes |
| `components/Map/MapViewer.tsx` | other | 7780 | Yes |
| `components/Map/PolygonMeasurementCard.tsx` | other | 193 | Yes |
| `components/Map/ProceduralTrees3D.ts` | typescript | 1067 | Yes |
| `components/Map/RealisticKoreanCityLayer.ts` | typescript | 1583 | Yes |
| `components/Map/ScaleBar.tsx` | other | 107 | Yes |
| `components/Map/SmartCityComplex3D.ts` | typescript | 1749 | Yes |
| `components/Map/TacticalDefenseLayer.ts` | typescript | 955 | Yes |
| `components/Map/ThreeDModelLayer.ts` | typescript | 248 | Yes |
| `components/Map/ThreeboxBuildingLayer.ts` | typescript | 1761 | Yes |
| `components/Map/TitleBlock.tsx` | other | 233 | Yes |
| `components/Map/UavHudOverlay.tsx` | other | 209 | Yes |
| `components/Map/UavSensorLayer.ts` | typescript | 562 | Yes |
| `components/Map/Universal3DTilesLayer.ts` | typescript | 634 | Yes |
| `components/Map/VWorldSpatialInspectorDrawer.tsx` | other | 594 | Yes |
| `components/Map/WaterLevelLayer.ts` | typescript | 273 | Yes |
| `components/Modal/CoordinateInputModal.tsx` | other | 263 | Yes |
| `components/Modal/Custom3DTilesModal.tsx` | other | 582 | Yes |
| `components/Modal/ExportProgressModal.tsx` | other | 116 | Yes |
| `components/Modal/ProjectManagerModal.tsx` | other | 516 | Yes |
| `components/Modal/VworldKeyModal.tsx` | other | 376 | Yes |
| `components/Panel/ControlPanel.tsx` | other | 4111 | Yes |
| `components/Search/AddressSearch.tsx` | other | 162 | Yes |
| `components/Search/GangwonUnifiedSearch.tsx` | other | 237 | Yes |
| `constants/borderSecurityZones.ts` | typescript | 127 | Yes |
| `constants/gangwon18Regions.ts` | typescript | 903 | Yes |
| `constants/gangwonMilitarySites.ts` | typescript | 453 | Yes |
| `constants/gangwonRegions.ts` | typescript | 7 | Yes |
| `constants/keyInfrastructures.ts` | typescript | 435 | Yes |
| `constants/militaryAirfields.ts` | typescript | 96 | Yes |
| `constants/militaryIdleSites.ts` | typescript | 273 | Yes |
| `constants/strategicSites3D.ts` | typescript | 261 | Yes |
| `data/gangwonDistricts.ts` | typescript | 202 | Yes |
| `data/sampleBuildings.ts` | typescript | 8 | Yes |
| `lib/supabase.ts` | typescript | 241 | Yes |
| `lib/vendor/buildingClassifier.ts` | typescript | 877 | Yes |
| `lib/vendor/osmGeometryBuilder.ts` | typescript | 2320 | Yes |
| `lib/vendor/osmRoofGenerator.ts` | typescript | 379 | Yes |
| `lib/vendor/photorealisticPbrShader.ts` | typescript | 462 | Yes |
| `lib/vendor/safeGeoAlgorithms.ts` | typescript | 644 | Yes |
| `lib/vendor/spatialAnalysisEngine.ts` | typescript | 795 | Yes |
| `lib/vendor/streetsGlBuildingShader.ts` | typescript | 734 | Yes |
| `lib/vendor/streetsGlFacadeEngine.ts` | typescript | 349 | Yes |
| `lib/vendor/streetsGlRoadLayers.ts` | typescript | 19 | Yes |
| `lib/vendor/tilesetController.ts` | typescript | 366 | Yes |
| `services/fusionBuildingsService.ts` | typescript | 141 | Yes |
| `services/vworldService.ts` | typescript | 303 | Yes |
| `shaders/buildingFacadeShader.ts` | typescript | 374 | Yes |
| `shaders/realisticCityShader.ts` | typescript | 442 | Yes |
| `store/useMapStore.ts` | typescript | 2282 | Yes |
| `types/defense.ts` | typescript | 62 | Yes |
| `types/infrastructure.ts` | typescript | 35 | Yes |
| `types/map.ts` | typescript | 539 | Yes |
| `utils/authenticBridgeBuilder.ts` | typescript | 605 | Yes |
| `utils/buildingMassGenerator.ts` | typescript | 228 | Yes |
| `utils/buildingModels3D.ts` | typescript | 650 | Yes |
| `utils/buildingSpatialCache.ts` | typescript | 275 | Yes |
| `utils/buildingTextures.ts` | typescript | 323 | Yes |
| `utils/canvasVideoRecorder.ts` | typescript | 180 | Yes |
| `utils/cinematicPathInterpolator.ts` | typescript | 252 | Yes |
| `utils/contourGenerator.ts` | typescript | 251 | Yes |
| `utils/crosswalkGenerator.ts` | typescript | 308 | Yes |
| `utils/customLayerMatrix.ts` | typescript | 69 | Yes |
| `utils/cutFillAnalysis.ts` | typescript | 210 | Yes |
| `utils/defenseAnalysis.ts` | typescript | 232 | Yes |
| `utils/diverseKoreanFacadeAtlas.ts` | typescript | 1578 | Yes |
| `utils/elevationCache.ts` | typescript | 170 | Yes |
| `utils/external3DTilesConnector.ts` | typescript | 346 | Yes |
| `utils/externalSpatialData.ts` | typescript | 853 | Yes |
| `utils/facadeGenerator.ts` | typescript | 411 | Yes |
| `utils/facadeTextures.ts` | typescript | 458 | Yes |
| `utils/gangwonRealDataLoader.ts` | typescript | 585 | Yes |
| `utils/gangwonSpatialAggregator.ts` | typescript | 627 | Yes |
| `utils/gangwonSpatialGateway.ts` | typescript | 210 | Yes |
| `utils/gpuRealisticBuildingStack.ts` | typescript | 740 | Yes |
| `utils/infrastructureAnalysis.ts` | typescript | 84 | Yes |
| `utils/koreanAptDetailer.ts` | typescript | 570 | Yes |
| `utils/koreanBuildingTextures.ts` | typescript | 708 | Yes |
| `utils/koreanCityAtlas.ts` | typescript | 1090 | Yes |
| `utils/koreanLanduseRenderer.ts` | typescript | 67 | Yes |
| `utils/koreanPoiLayer.ts` | typescript | 346 | Yes |
| `utils/koreanRoadRenderer.ts` | typescript | 646 | Yes |
| `utils/landmarkBuildingBuilder.ts` | typescript | 1132 | Yes |
| `utils/layerBudgetGuard.ts` | typescript | 80 | Yes |
| `utils/masterDataSynchronizer.ts` | typescript | 805 | Yes |
| `utils/measure3D.ts` | typescript | 95 | Yes |
| `utils/nativeBuildingPatterns.ts` | typescript | 269 | Yes |
| `utils/photorealisticCityAtlas.ts` | typescript | 1208 | Yes |
| `utils/pptxExportEngine.ts` | typescript | 708 | Yes |
| `utils/proceduralFacades.ts` | typescript | 692 | Yes |
| `utils/proceduralRoofs.ts` | typescript | 671 | Yes |
| `utils/realDataGeometryInjector.ts` | typescript | 714 | Yes |
| `utils/realisticBuildingPatterns.ts` | typescript | 542 | Yes |
| `utils/realisticRoofShader.ts` | typescript | 234 | Yes |
| `utils/regionalBuildingStyler.ts` | typescript | 828 | Yes |
| `utils/roadNetworkLayers.ts` | typescript | 23 | Yes |
| `utils/roofGeometryBuilder.ts` | typescript | 943 | Yes |
| `utils/satelliteColorExtractor.ts` | typescript | 507 | Yes |
| `utils/satelliteRoofSampler.ts` | typescript | 21 | Yes |
| `utils/securityValidator.ts` | typescript | 122 | Yes |
| `utils/spatialDataFetcher.ts` | typescript | 558 | Yes |
| `utils/spatialTileCache.ts` | typescript | 520 | Yes |
| `utils/sunLightCalculator.ts` | typescript | 265 | Yes |
| `utils/tacticalArrowGenerator.ts` | typescript | 112 | Yes |
| `utils/terrainAnalysis.ts` | typescript | 257 | Yes |
| `utils/terrainFoundation.ts` | typescript | 129 | Yes |
| `utils/urlHelper.ts` | typescript | 41 | Yes |
| `utils/viewshedAnalysis.ts` | typescript | 176 | Yes |
| `utils/vworldAuthenticStyler.ts` | typescript | 675 | Yes |
| `utils/vworldLocalLoader.ts` | typescript | 339 | Yes |
| `utils/vworldStyleAtlas.ts` | typescript | 966 | Yes |
| `workers/buildingMeshWorker.ts` | typescript | 72 | Yes |
| `workers/buildingMeshWorkerClient.ts` | typescript | 86 | Yes |
| `workers/geometryWorker.ts` | typescript | 866 | Yes |
| `workers/geometryWorkerClient.ts` | typescript | 103 | Yes |

## Issues (16)

### 🟡 MEDIUM: E1

**Location:** `app/api/buildings/fusion/route.ts:462`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/cadastral-analysis/route.ts:146`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/cadastral-analysis/route.ts:175`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/cadastral-analysis/route.ts:259`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/gangwon-search/route.ts:176`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/gangwon-spatial/route.ts:146`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/vworld-buildings/route.ts:242`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/vworld-buildings/route.ts:269`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/vworld-zoning/route.ts:352`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/vworld/buildings/route.ts:239`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/vworld/buildings/route.ts:266`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/vworld/wms/route.ts:37`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `utils/satelliteColorExtractor.ts:120`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: E1

**Location:** `app/api/external-3d/verify/route.ts:115`  
**Confidence:** 50%  

**Message:** External Transmission

**Remediation:** Verify the destination URL is trusted and necessary\. Remove or replace with documented APIs\. Ensure no secrets, tokens, or PII are transmitted\.

---

### 🟡 MEDIUM: AE4

**Location:** `components/Map/MapViewer.tsx:1`  
**Confidence:** 80%  

**Message:** Suspicious Unicode normalization or mixed\-script content

**Remediation:** Review the flagged content for security risks\. Ensure no credentials, secrets, or sensitive data are exposed\.

---

### 🟡 MEDIUM: TM3

**Location:** `components/Map/MapViewer.tsx:385`  
**Confidence:** 80%  

**Message:** Unsafe Defaults

**Remediation:** Override unsafe defaults with secure settings \(verify=True, auth required, restrictive permissions\)\. Review and harden all tool configurations\.

---

## Inspection Completeness

| Metric | Value |
|--------|-------|
| Execution | successful |
| Status | partial |
| Coverage | 51\.0% |
| Fully inspected | 73 |
| Partially inspected | 70 |
| Entirely uninspected | 0 |

### Ledger Exceptions

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| static\_parse\_limit | `app/api/buildings/fusion/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/cadastral-analysis/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/cadastral-local/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/external-3d/verify/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/gangwon-search/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/gangwon-spatial/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/molit-hub/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/vworld-buildings/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/vworld/3dtiles/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/vworld/buildings/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/api/vworld/wms/route.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/error.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `app/global-error.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Analysis/TerrainProfileModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Cinematic/CinematicBuilderModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Cinematic/CinematicOsdOverlay.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Header/Header.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/AccessibilityTableOverlay.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/Compass.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/CutFillSummaryCard.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/LOD2BuildingEngine.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/LegendBox.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| obfuscated\_instruction\_text | `components/Map/MapViewer.tsx` | Obfuscated instruction text could not be fully evaluated by the deterministic layer\. |
| static\_parse\_limit | `components/Map/MapViewer.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/PolygonMeasurementCard.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/RealisticKoreanCityLayer.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/ScaleBar.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/ThreeboxBuildingLayer.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/UavHudOverlay.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/Universal3DTilesLayer.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Map/VWorldSpatialInspectorDrawer.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Modal/CoordinateInputModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Modal/Custom3DTilesModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Modal/ExportProgressModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Modal/ProjectManagerModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Modal/VworldKeyModal.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| obfuscated\_instruction\_text | `components/Panel/ControlPanel.tsx` | Obfuscated instruction text could not be fully evaluated by the deterministic layer\. |
| static\_parse\_limit | `components/Panel/ControlPanel.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `components/Search/GangwonUnifiedSearch.tsx` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `constants/strategicSites3D.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `services/fusionBuildingsService.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `services/vworldService.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `store/useMapStore.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| obfuscated\_instruction\_text | `utils/authenticBridgeBuilder.ts` | Obfuscated instruction text could not be fully evaluated by the deterministic layer\. |
| static\_parse\_limit | `utils/authenticBridgeBuilder.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/buildingMassGenerator.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/buildingSpatialCache.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/defenseAnalysis.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/diverseKoreanFacadeAtlas.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/elevationCache.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/external3DTilesConnector.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/externalSpatialData.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/gangwonRealDataLoader.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/gangwonSpatialAggregator.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/gangwonSpatialGateway.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/gpuRealisticBuildingStack.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/infrastructureAnalysis.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/koreanAptDetailer.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/koreanCityAtlas.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/koreanRoadRenderer.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/landmarkBuildingBuilder.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/masterDataSynchronizer.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/photorealisticCityAtlas.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/pptxExportEngine.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/realDataGeometryInjector.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/roofGeometryBuilder.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/satelliteColorExtractor.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/spatialDataFetcher.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/spatialTileCache.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/sunLightCalculator.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/urlHelper.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/vworldLocalLoader.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |
| static\_parse\_limit | `utils/vworldStyleAtlas.ts` | A security\-relevant expression exceeded a bounded static parser's span limit\. |

### Analyzer Statuses

| Reason / Status | Location | Details |
|-----------------|----------|---------|
| completed | `artifact_integrity` |  |
| no\_applicable\_files | `behavioral_ast` | No files matched this analyzer's applicability contract\. |
| no\_applicable\_files | `behavioral_taint_tracking` | No files matched this analyzer's applicability contract\. |
| no\_applicable\_files | `bundled_execution_surface` | No files matched this analyzer's applicability contract\. |
| manifest\_absent | `mcp_least_privilege` | No compatible manifest was present for this analyzer\. |
| completed | `mcp_rug_pull` |  |
| manifest\_absent | `mcp_tool_poisoning` | No compatible manifest was present for this analyzer\. |
| disabled\_by\_configuration | `meta_analyzer` | Analyzer was disabled by the requested configuration\. |
| disabled\_by\_configuration | `semantic_developer_intent` | Analyzer was disabled by the requested configuration\. |
| disabled\_by\_configuration | `semantic_quality_policy` | Analyzer was disabled by the requested configuration\. |
| disabled\_by\_configuration | `semantic_security_discovery` | Analyzer was disabled by the requested configuration\. |
| degraded | `static_patterns_agent_snooping` |  |
| degraded | `static_patterns_anti_refusal` |  |
| completed | `static_patterns_data_exfiltration` |  |
| degraded | `static_patterns_deserialization` |  |
| degraded | `static_patterns_excessive_agency` |  |
| degraded | `static_patterns_harmful_content` |  |
| degraded | `static_patterns_memory_poisoning` |  |
| completed | `static_patterns_output_handling` |  |
| degraded | `static_patterns_privilege_escalation` |  |
| degraded | `static_patterns_prompt_injection` |  |
| degraded | `static_patterns_rogue_agent` |  |
| degraded | `static_patterns_ssrf` |  |
| degraded | `static_patterns_supply_chain` |  |
| degraded | `static_patterns_system_prompt_leakage` |  |
| degraded | `static_patterns_tool_misuse` |  |
| completed | `static_yara` |  |

### Limitations

- Analyzer static\_patterns\_agent\_snooping status: degraded\.
- Analyzer static\_patterns\_anti\_refusal status: degraded\.
- Analyzer static\_patterns\_deserialization status: degraded\.
- Analyzer static\_patterns\_excessive\_agency status: degraded\.
- Analyzer static\_patterns\_harmful\_content status: degraded\.
- Analyzer static\_patterns\_memory\_poisoning status: degraded\.
- Analyzer static\_patterns\_privilege\_escalation status: degraded\.
- Analyzer static\_patterns\_prompt\_injection status: degraded\.
- Analyzer static\_patterns\_rogue\_agent status: degraded\.
- Analyzer static\_patterns\_ssrf status: degraded\.
- Analyzer static\_patterns\_supply\_chain status: degraded\.
- Analyzer static\_patterns\_system\_prompt\_leakage status: degraded\.
- Analyzer static\_patterns\_tool\_misuse status: degraded\.

## Metadata

- **Executable Scripts:** Yes

*Generated by SkillSpector v2.12.0*