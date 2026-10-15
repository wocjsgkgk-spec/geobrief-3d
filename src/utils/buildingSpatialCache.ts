/**
 * buildingSpatialCache.ts
 *
 * [2단계: 브이월드(V-World) 실측 GIS 건물통합정보 WFS 실시간 바인딩 & 무중단 타일 캐싱 엔진]
 * - 한 번 불러온 지역의 건물 폴리곤 및 실측 속성(지상층수, 건물높이, 용도)을 메모리에 보관
 * - 지도를 회전(Bearing), 피치(Pitch) 조작, 또는 3D 지형을 토글할 때 버벅거림 및 중복 네트워크 요청 완전 제거
 * - 공간 격자(Spatial Grid Cell: ~0.005° 단위) 기반 로드 완료 구역 추적 및 빠른 BBOX 교차 조회
 */

export interface CachedBuildingFeature extends GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  properties: {
    grnd_flr?: number;
    gro_flo_co?: string;
    hei?: number;
    height?: number;
    levels?: number;
    main_purps_cd_nm?: string;
    usage_nm?: string;
    name?: string;
    buildingName?: string;
    bld_category?: string;
    bld_category_label?: string;
    color?: string;
    usageType?: string;
    source?: string;
    [key: string]: any;
  };
}

export class BuildingSpatialCache {
  // 1. 고유 건물 피처 저장소 (ID -> Feature)
  private featureMap = new Map<string, CachedBuildingFeature>();

  // 2. 공간 격자 셀별 로드된 피처 ID 인덱스 (GridCellKey -> Set<FeatureID>)
  private gridIndex = new Map<string, Set<string>>();

  // 3. 이미 완전히 로드 완료된 격자 셀 집합
  private loadedCells = new Set<string>();

  // 격자 해상도 (약 0.005도 ~= 500m x 550m)
  private readonly GRID_SIZE = 0.005;

  // 최대 보관 피처 수 (메모리 누수 방지 및 고성능 보장)
  private readonly MAX_FEATURES = 25000;

  /**
   * 경위도 좌표를 공간 격자 셀 키로 변환
   */
  private getCellKey(lng: number, lat: number): string {
    const col = Math.floor(lng / this.GRID_SIZE);
    const row = Math.floor(lat / this.GRID_SIZE);
    return `${col}:${row}`;
  }

  /**
   * BBOX 영역을 커버하는 모든 격자 셀 키 목록 산출
   */
  private getCellsForBbox(bbox: [number, number, number, number]): string[] {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const startCol = Math.floor(minLng / this.GRID_SIZE);
    const endCol = Math.floor(maxLng / this.GRID_SIZE);
    const startRow = Math.floor(minLat / this.GRID_SIZE);
    const endRow = Math.floor(maxLat / this.GRID_SIZE);

    const cells: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      for (let r = startRow; r <= endRow; r++) {
        cells.push(`${c}:${r}`);
      }
    }
    return cells;
  }

  /**
   * 건물의 중심점 좌표를 기반으로 대표 셀 키 계산
   */
  private getFeatureCellKey(f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): string {
    try {
      const geom = f.geometry;
      let lng = 0;
      let lat = 0;
      if (geom.type === 'Polygon' && geom.coordinates[0]?.[0]) {
        lng = geom.coordinates[0][0][0];
        lat = geom.coordinates[0][0][1];
      } else if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]?.[0]) {
        lng = geom.coordinates[0][0][0][0];
        lat = geom.coordinates[0][0][0][1];
      }
      return this.getCellKey(lng, lat);
    } catch {
      return '0:0';
    }
  }

  /**
   * 건물의 고유 식별자 추출 (bd_mgt_sn > buld_se_cd > id > 좌표 해시)
   */
  private getFeatureId(f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, idx: number): string {
    const props = (f.properties || {}) as Record<string, any>;
    if (props.bd_mgt_sn) return `bld_${props.bd_mgt_sn}`;
    if (props.buld_se_cd) return `bld_${props.buld_se_cd}`;
    if (f.id !== undefined && f.id !== null) {
      const s = String(f.id);
      return s.startsWith('bld_') ? s : `bld_${s}`;
    }

    try {
      const geom = f.geometry;
      if (geom.type === 'Polygon' && geom.coordinates[0]?.[0]) {
        const pt = geom.coordinates[0][0];
        return `coord_${pt[0].toFixed(6)}_${pt[1].toFixed(6)}`;
      }
      if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]?.[0]) {
        const pt = geom.coordinates[0][0][0];
        return `coord_${pt[0].toFixed(6)}_${pt[1].toFixed(6)}`;
      }
    } catch {
      // ignore
    }
    return `bld_idx_${idx}_${Date.now()}`;
  }

  /**
   * 현재 BBOX 영역 내의 모든 격자 셀이 이미 캐시에 로드되었는지 확인
   */
  public isAreaLoaded(bbox: [number, number, number, number]): boolean {
    const cells = this.getCellsForBbox(bbox);
    if (cells.length === 0) return false;
    return cells.every((cell) => this.loadedCells.has(cell));
  }

  /**
   * 현재 BBOX에 해당하는 캐시된 건물 피처 목록 반환 (무지연 즉시 반환)
   */
  public getFeaturesInBbox(bbox: [number, number, number, number]): CachedBuildingFeature[] {
    const cells = this.getCellsForBbox(bbox);
    const seenIds = new Set<string>();
    const results: CachedBuildingFeature[] = [];
    const [minLng, minLat, maxLng, maxLat] = bbox;

    // 약간의 여유 버퍼 (0.002도) 포함하여 화면 경계 건물 잘림 방지
    const bMinLng = minLng - 0.002;
    const bMaxLng = maxLng + 0.002;
    const bMinLat = minLat - 0.002;
    const bMaxLat = maxLat + 0.002;

    for (const cell of cells) {
      const idSet = this.gridIndex.get(cell);
      if (!idSet) continue;

      for (const id of idSet) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const feat = this.featureMap.get(id);
        if (!feat || !feat.geometry) continue;

        // BBOX 포함 여부 빠른 간이 검사
        try {
          const geom = feat.geometry;
          let pt: [number, number] | null = null;
          if (geom.type === 'Polygon' && geom.coordinates[0]?.[0]) {
            pt = geom.coordinates[0][0] as [number, number];
          } else if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]?.[0]) {
            pt = geom.coordinates[0][0][0] as [number, number];
          }

          if (pt) {
            if (pt[0] >= bMinLng && pt[0] <= bMaxLng && pt[1] >= bMinLat && pt[1] <= bMaxLat) {
              results.push(feat);
            }
          } else {
            results.push(feat);
          }
        } catch {
          results.push(feat);
        }
      }
    }

    return results;
  }

  /**
   * 새로운 건물 피처들을 캐시에 병합 및 격자 인덱싱
   */
  public putFeatures(
    features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
    bbox?: [number, number, number, number]
  ): void {
    if (!features || features.length === 0) {
      if (bbox) {
        // 데이터가 없는 구역도 로드 완료로 표시하여 불필요한 반복 호출 방지
        const cells = this.getCellsForBbox(bbox);
        cells.forEach((c) => this.loadedCells.add(c));
      }
      return;
    }

    // 캐시 용량 초과 시 오래된 피처 정리
    if (this.featureMap.size > this.MAX_FEATURES) {
      const excess = this.featureMap.size - (this.MAX_FEATURES - 5000);
      let removed = 0;
      for (const key of this.featureMap.keys()) {
        if (removed >= excess) break;
        this.featureMap.delete(key);
        removed++;
      }
    }

    features.forEach((f, idx) => {
      if (!f || !f.geometry) return;
      const id = this.getFeatureId(f, idx);
      const cell = this.getFeatureCellKey(f);

      // 피처 맵 저장
      this.featureMap.set(id, {
        ...f,
        id,
      } as CachedBuildingFeature);

      // 격자 인덱스 연결
      let idSet = this.gridIndex.get(cell);
      if (!idSet) {
        idSet = new Set<string>();
        this.gridIndex.set(cell, idSet);
      }
      idSet.add(id);
    });

    if (bbox) {
      const cells = this.getCellsForBbox(bbox);
      cells.forEach((c) => this.loadedCells.add(c));
    }
  }

  /**
   * FeatureCollection 형태의 캐시 조회
   */
  public getFeatureCollection(
    bbox: [number, number, number, number]
  ): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
    const features = this.getFeaturesInBbox(bbox);
    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * 모든 캐시 데이터 초기화
   */
  public clear(): void {
    this.featureMap.clear();
    this.gridIndex.clear();
    this.loadedCells.clear();
  }

  /**
   * 현재 캐시 항목 수 반환
   */
  public get size(): number {
    return this.featureMap.size;
  }

  /**
   * 현재 로드된 격자 수 반환
   */
  public get cellCount(): number {
    return this.loadedCells.size;
  }
}

// 전역 싱글톤 인스턴스
export const buildingSpatialCache = new BuildingSpatialCache();
