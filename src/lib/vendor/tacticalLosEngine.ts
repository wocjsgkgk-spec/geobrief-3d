/**
 * lib/vendor/tacticalLosEngine.ts
 *
 * [GeoBrief 3D 3단계: 군사 전장 지형 3D 가시선(LOS) 및 360° 관측/차폐 분석 엔진]
 *
 * 강원특별자치도 18개 시·군 산악 지형(DEM 표고)과 3D 건물 메쉬를 결합하여
 * 3차원 광선 추적(Raycasting)으로 관측점(OP/감시초소/레이다)과 표적점 간의
 * 실시간 가시선(LOS) 및 360° 전방위 관측권(Viewshed) 차폐를 정밀 시뮬레이션합니다.
 */

import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { LosPoint, LosAnalysisResult } from '@/types/map';

export interface TacticalObstacle {
  type: 'terrain' | 'building';
  coords: [number, number];
  elevation: number;        // 장애물 상단 표고 EL. m
  rayElevation: number;     // 해당 지점 광선 표고 EL. m
  penetrationDepth: number; // 차폐 돌출량 m
  distanceFromA: number;    // 관측점으로부터의 거리 m
  name: string;             // 산악 능선 또는 건물명
  height?: number;          // 건물인 경우 건물 높이 m
}

export interface TacticalViewshedSector {
  angleDeg: number;
  maxRadiusMeters: number;
  visibleRadiusMeters: number;
  visibleCoords: [number, number, number]; // [lng, lat, alt]
  maxCoords: [number, number, number];
}

export interface TacticalViewshedResult {
  origin: LosPoint;
  radiusMeters: number;
  overallVisibilityRate: number;
  sectors: TacticalViewshedSector[];
  calculatedAt: number;
}

export class TacticalLosEngine {
  /**
   * 1. 지형(DEM) + 3D 건물 통합 단일 광선(LOS) 추적 분석
   */
  public static analyzeRay(
    map: maplibregl.Map,
    pointA: LosPoint,
    pointB: LosPoint,
    options: {
      observerHeight?: number;
      targetHeight?: number;
    } = {}
  ): LosAnalysisResult {
    const obsH = options.observerHeight ?? pointA.heightOffset ?? 10.0;
    const tgtH = options.targetHeight ?? pointB.heightOffset ?? 2.0;

    const startAlt = pointA.elevation + obsH;
    const endAlt = pointB.elevation + tgtH;

    // 2D/3D 거리 계산 (WGS84 평면 근사)
    const midLat = (pointA.coords[1] + pointB.coords[1]) * 0.5;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const dx = (pointB.coords[0] - pointA.coords[0]) * 111320 * cosLat;
    const dy = (pointB.coords[1] - pointA.coords[1]) * 111000;
    const horizDist = Math.hypot(dx, dy);
    const elevDiff = endAlt - startAlt;
    const directDist = Math.hypot(horizDist, elevDiff);

    // 샘플링 간격 5m (최소 20, 최대 800)
    const samples = Math.max(20, Math.min(800, Math.ceil(directDist / 5.0)));

    let isBlocked = false;
    let blockedT = 1.0;
    let blockedCoord: [number, number] = [0, 0];
    let blockedTerrainAlt = 0;
    let blockedRayAlt = 0;
    let maxObstacleElev = Math.max(startAlt, endAlt);
    let maxPenetration = 0;
    let firstObstacle: TacticalObstacle | null = null;

    // 3D 건물 캐시 확인 및 광선 2D BBOX 사전 필터링 (800회 루프 병목 0% 박멸)
    const cityLayer = (window as any).__realisticKoreanCityLayer;
    const buildingMap = cityLayer?.persistentBuildingMap;
    const candidateBuildings: {
      cLng: number;
      cLat: number;
      radius: number;
      height: number;
      name: string;
    }[] = [];

    if (buildingMap && buildingMap.size > 0) {
      const rayMinLng = Math.min(pointA.coords[0], pointB.coords[0]) - 0.001;
      const rayMaxLng = Math.max(pointA.coords[0], pointB.coords[0]) + 0.001;
      const rayMinLat = Math.min(pointA.coords[1], pointB.coords[1]) - 0.001;
      const rayMaxLat = Math.max(pointA.coords[1], pointB.coords[1]) + 0.001;

      for (const feat of buildingMap.values()) {
        const geom = feat.geometry;
        if (!geom) continue;
        const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0]?.[0];
        if (!ring || ring.length === 0) continue;

        const p0 = ring[0];
        if (p0[0] < rayMinLng || p0[0] > rayMaxLng || p0[1] < rayMinLat || p0[1] > rayMaxLat) {
          continue;
        }

        let cLng = 0;
        let cLat = 0;
        for (let k = 0; k < ring.length; k++) {
          cLng += ring[k][0];
          cLat += ring[k][1];
        }
        cLng /= ring.length;
        cLat /= ring.length;

        const props = feat.properties || {};
        const bH = Number(props.realHeight || props.height || 18.0);
        const name = String(props.name || props.buld_nm || props.building || '3D 고층 건물');

        candidateBuildings.push({
          cLng,
          cLat,
          radius: 35.0,
          height: bH,
          name,
        });
      }
    }

    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const curLng = pointA.coords[0] + t * (pointB.coords[0] - pointA.coords[0]);
      const curLat = pointA.coords[1] + t * (pointB.coords[1] - pointA.coords[1]);
      const curRayAlt = startAlt + t * (endAlt - startAlt);
      const curDistFromA = directDist * t;

      // (A) DEM 지형 고도 검사
      let terrainAlt = 0;
      if (map.queryTerrainElevation) {
        const q = map.queryTerrainElevation([curLng, curLat]);
        if (typeof q === 'number' && Number.isFinite(q)) {
          terrainAlt = q;
        }
      }

      // (B) 3D 건물 충돌 검사 (사전 필터링된 후보군만 0ms 검사)
      let bldgAlt = 0;
      let bldgName = '';
      let bldgHeight = 0;

      for (let cIdx = 0; cIdx < candidateBuildings.length; cIdx++) {
        const cb = candidateBuildings[cIdx];
        const distToBldg = Math.hypot(
          (curLng - cb.cLng) * 111320 * cosLat,
          (curLat - cb.cLat) * 111000
        );

        if (distToBldg < cb.radius) {
          const bTop = terrainAlt + cb.height;
          if (bTop > bldgAlt) {
            bldgAlt = bTop;
            bldgHeight = cb.height;
            bldgName = cb.name;
          }
        }
      }

      // 장애물 최고 높이 (지형 또는 건물)
      const obstacleElev = Math.max(terrainAlt, bldgAlt);
      if (obstacleElev > maxObstacleElev) {
        maxObstacleElev = obstacleElev;
      }

      const pen = obstacleElev - curRayAlt;
      if (pen > 0.5) {
        if (!isBlocked) {
          isBlocked = true;
          blockedT = t;
          blockedCoord = [curLng, curLat];
          blockedTerrainAlt = obstacleElev;
          blockedRayAlt = curRayAlt;

          if (bldgAlt > terrainAlt + 1.0) {
            firstObstacle = {
              type: 'building',
              coords: [curLng, curLat],
              elevation: Math.round(bldgAlt),
              rayElevation: Math.round(curRayAlt),
              penetrationDepth: Math.round(pen * 10) / 10,
              distanceFromA: Math.round(curDistFromA),
              name: `${bldgName} (${Math.round(bldgHeight)}m)`,
              height: Math.round(bldgHeight),
            };
          } else {
            firstObstacle = {
              type: 'terrain',
              coords: [curLng, curLat],
              elevation: Math.round(terrainAlt),
              rayElevation: Math.round(curRayAlt),
              penetrationDepth: Math.round(pen * 10) / 10,
              distanceFromA: Math.round(curDistFromA),
              name: `산악 능선 (EL. ${Math.round(terrainAlt)}m)`,
            };
          }
        }

        if (pen > maxPenetration) {
          maxPenetration = pen;
        }
      }
    }

    const visibilityRate = isBlocked
      ? Math.max(0, Math.min(99, Math.round(blockedT * 100)))
      : 100;

    const statusText = !isBlocked
      ? '🟢 관측 확보'
      : `🔴 ${firstObstacle?.type === 'building' ? '건물' : '지형'} 차폐`;

    return {
      pointA: { ...pointA, heightOffset: obsH },
      pointB: { ...pointB, heightOffset: tgtH },
      isClear: !isBlocked,
      distanceMeters: Math.round(directDist),
      horizontalDistanceMeters: Math.round(horizDist),
      elevationDiffMeters: Math.round(elevDiff),
      maxObstacleElevation: Math.round(maxObstacleElev),
      maxPenetrationDepth: Math.round(maxPenetration * 10) / 10,
      samplingIntervalMeters: 5,
      samplingCount: samples,
      calculatedAt: Date.now(),
      blockedPoint: isBlocked
        ? {
            coords: blockedCoord,
            elevation: Math.round(blockedTerrainAlt),
            rayElevation: Math.round(blockedRayAlt),
            distanceFromA: Math.round(directDist * blockedT),
            t: blockedT,
            maxObstacleElevation: Math.round(maxObstacleElev),
            maxPenetration: Math.round(maxPenetration * 10) / 10,
          }
        : undefined,
      visibilityRate,
      statusText,
      firstObstacleName: firstObstacle?.name || (isBlocked ? '지형 능선' : undefined),
      firstObstacleHeight: firstObstacle?.height,
      obstacleType: firstObstacle?.type,
    } as any;
  }

  /**
   * 2. 360° 전방위 관측권(Viewshed) 분석
   * 관측점을 중심으로 36개 방향(10도 간격)으로 광선을 주사하여 지형/건물 차폐 분석
   */
  public static analyzeViewshed360(
    map: maplibregl.Map,
    origin: LosPoint,
    radiusMeters = 1500,
    numRays = 36
  ): TacticalViewshedResult {
    const obsH = origin.heightOffset || 15.0;
    const startAlt = origin.elevation + obsH;
    const cosLat = Math.cos((origin.coords[1] * Math.PI) / 180);
    const sectors: TacticalViewshedSector[] = [];
    let visibleSum = 0;

    for (let i = 0; i < numRays; i++) {
      const angleDeg = (i * 360) / numRays;
      const rad = (angleDeg * Math.PI) / 180;
      const sinA = Math.sin(rad);
      const cosA = Math.cos(rad);

      // 목표 끝점 (반경 radiusMeters)
      const endLng = origin.coords[0] + (radiusMeters * sinA) / (111320 * cosLat);
      const endLat = origin.coords[1] + (radiusMeters * cosA) / 111000;
      let endTerrain = 0;
      if (map.queryTerrainElevation) {
        const q = map.queryTerrainElevation([endLng, endLat]);
        if (typeof q === 'number') endTerrain = q;
      }

      // 끝점 표적점 가상 생성
      const endPt: LosPoint = {
        coords: [endLng, endLat],
        elevation: endTerrain,
        heightOffset: 2.0,
      };

      const result = this.analyzeRay(map, origin, endPt, {
        observerHeight: obsH,
        targetHeight: 2.0,
      });

      let visRadius = radiusMeters;
      if (!result.isClear && result.blockedPoint) {
        visRadius = Math.max(50, result.blockedPoint.distanceFromA);
      }

      visibleSum += visRadius;

      const visLng = origin.coords[0] + (visRadius * sinA) / (111320 * cosLat);
      const visLat = origin.coords[1] + (visRadius * cosA) / 111000;
      let visElev = endTerrain;
      if (map.queryTerrainElevation) {
        const q = map.queryTerrainElevation([visLng, visLat]);
        if (typeof q === 'number') visElev = q;
      }

      sectors.push({
        angleDeg,
        maxRadiusMeters: radiusMeters,
        visibleRadiusMeters: visRadius,
        visibleCoords: [visLng, visLat, visElev + 1.0],
        maxCoords: [endLng, endLat, endTerrain + 1.0],
      });
    }

    const overallVisibilityRate = Math.round((visibleSum / (radiusMeters * numRays)) * 100);

    return {
      origin,
      radiusMeters,
      overallVisibilityRate,
      sectors,
      calculatedAt: Date.now(),
    };
  }

  /**
   * 3. 360° 가시권(Viewshed) Three.js 부채꼴 메쉬 빌더
   * - 가시 구역: 에메랄드 그린(#10b981) 반투명 부채꼴
   * - 차폐 구역: 적색(#ef4444) 반투명 음영 부채꼴
   */
  public static buildViewshed3DMesh(
    viewshed: TacticalViewshedResult,
    map: maplibregl.Map
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = 'tactical_viewshed_3d_group';

    const originMerc = maplibregl.MercatorCoordinate.fromLngLat(
      viewshed.origin.coords,
      viewshed.origin.elevation + (viewshed.origin.heightOffset || 10.0)
    );

    const sectors = viewshed.sectors;
    const n = sectors.length;

    // (A) 가시 구역 (에메랄드 그린 반투명)
    const visPositions: number[] = [];
    // (B) 차폐 음영 구역 (적색 반투명)
    const occPositions: number[] = [];

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const s0 = sectors[i];
      const s1 = sectors[j];

      const mVis0 = maplibregl.MercatorCoordinate.fromLngLat(
        [s0.visibleCoords[0], s0.visibleCoords[1]],
        s0.visibleCoords[2]
      );
      const mVis1 = maplibregl.MercatorCoordinate.fromLngLat(
        [s1.visibleCoords[0], s1.visibleCoords[1]],
        s1.visibleCoords[2]
      );
      const mMax0 = maplibregl.MercatorCoordinate.fromLngLat(
        [s0.maxCoords[0], s0.maxCoords[1]],
        s0.maxCoords[2]
      );
      const mMax1 = maplibregl.MercatorCoordinate.fromLngLat(
        [s1.maxCoords[0], s1.maxCoords[1]],
        s1.maxCoords[2]
      );

      // 가시 삼각형 (중심 -> Vis0 -> Vis1)
      visPositions.push(
        originMerc.x, originMerc.y, originMerc.z,
        mVis0.x, mVis0.y, mVis0.z,
        mVis1.x, mVis1.y, mVis1.z
      );

      // 차폐 사각면 (Vis0 -> Max0 -> Max1 / Vis0 -> Max1 -> Vis1)
      if (s0.visibleRadiusMeters < s0.maxRadiusMeters || s1.visibleRadiusMeters < s1.maxRadiusMeters) {
        occPositions.push(
          mVis0.x, mVis0.y, mVis0.z,
          mMax0.x, mMax0.y, mMax0.z,
          mMax1.x, mMax1.y, mMax1.z,
          mVis0.x, mVis0.y, mVis0.z,
          mMax1.x, mMax1.y, mMax1.z,
          mVis1.x, mVis1.y, mVis1.z
        );
      }
    }

    if (visPositions.length > 0) {
      const visGeo = new THREE.BufferGeometry();
      visGeo.setAttribute('position', new THREE.Float32BufferAttribute(visPositions, 3));
      visGeo.computeVertexNormals();

      const visMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(visGeo, visMat));
    }

    if (occPositions.length > 0) {
      const occGeo = new THREE.BufferGeometry();
      occGeo.setAttribute('position', new THREE.Float32BufferAttribute(occPositions, 3));
      occGeo.computeVertexNormals();

      const occMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(occGeo, occMat));
    }

    return group;
  }
}

if (typeof window !== 'undefined') {
  (window as any).__tacticalLosEngine = TacticalLosEngine;
}
