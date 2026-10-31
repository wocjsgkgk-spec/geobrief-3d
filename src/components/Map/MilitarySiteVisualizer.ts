/**
 * components/Map/MilitarySiteVisualizer.ts
 *
 * [GeoBrief 3D 3단계: 강원 18개 시·군 군 유휴부지 정밀 표시 & 렌더링 무결성 마감]
 *
 * 1. 4중 초고시인성 3D 경계 시각화:
 *    - 선택된 군 유휴부지 외곽 에메랄드 네온 이중 경계선 (#10b981, 두께 4px, 블러 2px)
 *    - 내부 백색 전술 점선 (#ffffff, dasharray: [3, 2])
 *    - 반투명 구역 에메랄드 하이라이트 (opacity: 0.28)
 *
 * 2. 부지 상공 고정형 3D 플로팅 배지:
 *    - [🛡️ 부지명 | 총면적 ㎡ (평) | 용도지역]
 *    - 원클릭 [현재 영내 군 막사·연병장 3D] ↔ [미래 복합개발 마스터플랜 3D] 전환 스위치
 */

import maplibregl from 'maplibre-gl';
import {
  GANGWON_18_MILITARY_SITES,
  Gangwon18MilitarySite,
  getGangwon18MilitarySiteById,
  generateAllMilitarySitesGeoJSON,
  MilitarySiteDisplayMode,
} from '@/constants/gangwon18MilitarySites';

export interface MilitarySiteVisualizerOptions {
  onSelectSite?: (siteId: string) => void;
  onModeChange?: (siteId: string, mode: MilitarySiteDisplayMode) => void;
  initialMode?: MilitarySiteDisplayMode;
}

export class MilitarySiteVisualizer {
  private map: maplibregl.Map | null = null;
  private markers: Map<string, maplibregl.Marker> = new Map();
  private currentMode: MilitarySiteDisplayMode = 'future_masterplan';
  private selectedSiteId: string = 'wj-1st-logistics';
  private options: MilitarySiteVisualizerOptions;
  private isVisible = true;

  constructor(options: MilitarySiteVisualizerOptions = {}) {
    this.options = options;
    this.currentMode = options.initialMode || 'future_masterplan';
  }

  /**
   * 지도에 3D 군 유휴부지 레이어 및 홀로그램 브리핑 배지 초기화
   */
  public attach(map: maplibregl.Map): void {
    this.map = map;
    this.setupMapLayers();
    this.updateLayersFilter();
    this.updateHologramBadges();
  }

  /**
   * 지도에서 레이어 및 마커 안전 해제
   */
  public detach(): void {
    this.clearMarkers();
    if (!this.map) return;

    const layerIds = [
      'selected-military-site-dash',
      'selected-military-site-neon',
      'selected-military-site-glow',
      'selected-military-site-fill',
      'military-site-glow-outer',
      'military-site-fill',
    ];

    for (const lid of layerIds) {
      if (this.map.getLayer(lid)) {
        this.map.removeLayer(lid);
      }
    }

    if (this.map.getSource('military-sites-source')) {
      this.map.removeSource('military-sites-source');
    }

    this.map = null;
  }

  /**
   * 가시성 설정
   */
  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (!this.map) return;

    const layerIds = [
      'selected-military-site-dash',
      'selected-military-site-neon',
      'selected-military-site-glow',
      'selected-military-site-fill',
      'military-site-glow-outer',
      'military-site-fill',
    ];

    const val = visible ? 'visible' : 'none';
    for (const lid of layerIds) {
      if (this.map.getLayer(lid)) {
        this.map.setLayoutProperty(lid, 'visibility', val);
      }
    }

    this.markers.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.display = visible ? 'block' : 'none';
    });
  }

  /**
   * 특정 군 유휴부지 선택 및 포커싱
   */
  public selectSite(siteId: string): void {
    const site = getGangwon18MilitarySiteById(siteId);
    if (!site) return;
    this.selectedSiteId = site.id;

    if (this.map) {
      // 카메라 추천 위치로 부드러운 3D 플라이투
      this.map.flyTo({
        center: site.center,
        zoom: site.recommendedCamera.zoom,
        pitch: site.recommendedCamera.pitch,
        bearing: site.recommendedCamera.bearing,
        essential: true,
        duration: 1500,
      });

      this.updateLayersFilter();
      this.updateHologramBadges();
    }
  }

  /**
   * [현재 영내 군 막사·연병장 3D 뷰] vs [미래 복합개발 마스터플랜 3D 조감도] 모드 전환
   */
  public setDisplayMode(mode: MilitarySiteDisplayMode): void {
    this.currentMode = mode;
    this.updateHologramBadges();
    if (this.options.onModeChange) {
      this.options.onModeChange(this.selectedSiteId, mode);
    }
  }

  public getDisplayMode(): MilitarySiteDisplayMode {
    return this.currentMode;
  }

  /**
   * 선택된 부지 필터 업데이트 (선명한 네온 이중 경계선 동기화)
   */
  private updateLayersFilter(): void {
    if (!this.map) return;
    const site = getGangwon18MilitarySiteById(this.selectedSiteId);
    const targetId = site ? site.id : this.selectedSiteId;

    const selectedFilter: any = ['==', ['get', 'id'], targetId];

    if (this.map.getLayer('selected-military-site-fill')) {
      this.map.setFilter('selected-military-site-fill', selectedFilter);
    }
    if (this.map.getLayer('selected-military-site-glow')) {
      this.map.setFilter('selected-military-site-glow', selectedFilter);
    }
    if (this.map.getLayer('selected-military-site-neon')) {
      this.map.setFilter('selected-military-site-neon', selectedFilter);
    }
    if (this.map.getLayer('selected-military-site-dash')) {
      this.map.setFilter('selected-military-site-dash', selectedFilter);
    }
  }

  /**
   * 4중 3D 경계 시각화 레이어 등록
   */
  private setupMapLayers(): void {
    if (!this.map) return;

    const geojsonData = generateAllMilitarySitesGeoJSON();

    if (!this.map.getSource('military-sites-source')) {
      this.map.addSource('military-sites-source', {
        type: 'geojson',
        data: geojsonData,
      });
    }

    // 1. 전역 군 유휴부지 기본 반투명 바닥 (opacity: 0.12)
    if (!this.map.getLayer('military-site-fill')) {
      this.map.addLayer({
        id: 'military-site-fill',
        type: 'fill',
        source: 'military-sites-source',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.12,
        },
      });
    }

    // 2. 전역 군 유휴부지 기본 외곽선
    if (!this.map.getLayer('military-site-glow-outer')) {
      this.map.addLayer({
        id: 'military-site-glow-outer',
        type: 'line',
        source: 'military-sites-source',
        paint: {
          'line-color': '#10b981',
          'line-width': 2.0,
          'line-opacity': 0.5,
        },
      });
    }

    // 3. [선택된 부지 전용] 반투명 구역 하이라이트 (opacity: 0.28)
    if (!this.map.getLayer('selected-military-site-fill')) {
      this.map.addLayer({
        id: 'selected-military-site-fill',
        type: 'fill',
        source: 'military-sites-source',
        filter: ['==', ['get', 'id'], this.selectedSiteId],
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.28,
        },
      });
    }

    // 4. [선택된 부지 전용] 선명한 에메랄드 네온 외곽 글로우 (#10b981, 두께 4px, 블러 2px)
    if (!this.map.getLayer('selected-military-site-glow')) {
      this.map.addLayer({
        id: 'selected-military-site-glow',
        type: 'line',
        source: 'military-sites-source',
        filter: ['==', ['get', 'id'], this.selectedSiteId],
        paint: {
          'line-color': '#10b981',
          'line-width': 4.0,
          'line-blur': 2.0,
          'line-opacity': 1.0,
        },
      });
    }

    // 5. [선택된 부지 전용] 중앙 선명한 네온 라인 (#34d399, 두께 2px)
    if (!this.map.getLayer('selected-military-site-neon')) {
      this.map.addLayer({
        id: 'selected-military-site-neon',
        type: 'line',
        source: 'military-sites-source',
        filter: ['==', ['get', 'id'], this.selectedSiteId],
        paint: {
          'line-color': '#34d399',
          'line-width': 2.0,
          'line-opacity': 1.0,
        },
      });
    }

    // 6. [선택된 부지 전용] 내부 백색 전술 점선 (#ffffff, dasharray: [3, 2])
    if (!this.map.getLayer('selected-military-site-dash')) {
      this.map.addLayer({
        id: 'selected-military-site-dash',
        type: 'line',
        source: 'military-sites-source',
        filter: ['==', ['get', 'id'], this.selectedSiteId],
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.8,
          'line-dasharray': [3, 2],
          'line-opacity': 0.95,
        },
      });
    }

    // 클릭 시 해당 부지 자동 선택
    const clickHandler = (e: any) => {
      if (e.features && e.features[0]) {
        const sid = e.features[0].properties?.id;
        if (sid) {
          this.selectSite(sid);
          this.options.onSelectSite?.(sid);
        }
      }
    };

    this.map.on('click', 'military-site-fill', clickHandler);
    this.map.on('click', 'selected-military-site-fill', clickHandler);

    this.map.on('mouseenter', 'military-site-fill', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'military-site-fill', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
    });
  }

  /**
   * 부지 중앙 상공 고정형 [🛡️ 부지명 | 총면적 ㎡ (평) | 용도지역] 플로팅 배지
   */
  private updateHologramBadges(): void {
    if (!this.map) return;
    this.clearMarkers();

    for (const site of GANGWON_18_MILITARY_SITES) {
      const isSelected = this.selectedSiteId === site.id || site.aliasIds.includes(this.selectedSiteId);

      const el = document.createElement('div');
      el.className = `military-hologram-badge-container ${isSelected ? 'active-badge' : ''}`;
      el.style.cursor = 'pointer';
      el.style.zIndex = isSelected ? '120' : '50';

      const modeTitle =
        this.currentMode === 'future_masterplan'
          ? '🏢 미래 복합개발 마스터플랜 3D'
          : '🏛️ 현재 영내 군 막사·연병장 3D';

      const zoningShort = site.zoning.split('/')[0].trim();

      el.innerHTML = `
        <div style="
          position: relative;
          background: rgba(10, 20, 15, 0.93);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1.5px solid ${isSelected ? '#10b981' : '#10b98150'};
          border-radius: 12px;
          padding: 8px 12px;
          box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.85), 0 0 16px ${isSelected ? 'rgba(16, 185, 129, 0.55)' : 'transparent'};
          color: #f8fafc;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          min-width: 290px;
          max-width: 360px;
          transition: all 0.25s ease;
          pointer-events: auto;
        ">
          <!-- 1. 플로팅 배지 헤더: [🛡️ 부지명 | 총면적 ㎡ (평) | 용도지역] -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 5px;
            font-size: 12.5px;
            font-weight: 800;
            color: #10b981;
            border-bottom: 1.5px solid rgba(16, 185, 129, 0.35);
            padding-bottom: 5px;
            margin-bottom: 5px;
          ">
            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
              <span style="font-size: 14px;">🛡️</span>
              <strong style="color: #34d399; font-size: 12.5px;">${site.shortName}</strong>
              <span style="color: #64748b; font-weight: 400; font-size: 11px;">|</span>
              <span style="color: #f8fafc; font-size: 11.5px; font-weight: 700;">${site.areaSqm.toLocaleString()}㎡ (${site.areaPyeong.toLocaleString()}평)</span>
              <span style="color: #64748b; font-weight: 400; font-size: 11px;">|</span>
              <span style="color: #38bdf8; font-size: 11px; font-weight: 600;">${zoningShort}</span>
            </div>
            <span style="
              font-size: 9px;
              font-family: monospace;
              background: #064e3b;
              color: #6ee7b7;
              padding: 2px 5px;
              border-radius: 4px;
              border: 1px solid #059669;
              flex-shrink: 0;
            ">
              ${site.regionName}
            </span>
          </div>

          <!-- 2. 현황 및 계획 세부 정보 -->
          <div style="font-size: 10px; line-height: 1.35; margin-bottom: 6px; color: #cbd5e1;">
            <div style="margin-bottom: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              <span style="color: #38bdf8; font-weight: 600;">• 현황:</span> ${site.currentStatus.split('/')[0]}
            </div>
            <div style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              <span style="color: #f59e0b; font-weight: 600;">• 구상:</span> ${site.targetUse.split('&')[0]}
            </div>
          </div>

          <!-- 3. 원클릭 [현재 막사 3D] vs [미래 마스터플랜 3D] 토글 스위치 -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #08150d;
            border: 1px solid rgba(16, 185, 129, 0.4);
            border-radius: 7px;
            padding: 4px 8px;
          ">
            <span style="font-size: 10px; font-weight: 700; color: ${this.currentMode === 'future_masterplan' ? '#38bdf8' : '#fbbf24'};">
              ${modeTitle}
            </span>
            <button
              type="button"
              id="btn-toggle-${site.id}"
              style="
                background: ${this.currentMode === 'future_masterplan' ? '#059669' : '#d97706'};
                color: #ffffff;
                font-size: 9.5px;
                font-weight: 700;
                padding: 3px 8px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                transition: background 0.15s;
              "
            >
              전환 ⇄
            </button>
          </div>
        </div>
      `;

      // 클릭 시 해당 부지 선택 및 모드 전환
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target && target.id === `btn-toggle-${site.id}`) {
          e.stopPropagation();
          const nextMode: MilitarySiteDisplayMode =
            this.currentMode === 'future_masterplan' ? 'current_military' : 'future_masterplan';
          this.setDisplayMode(nextMode);
          return;
        }

        this.selectSite(site.id);
        this.options.onSelectSite?.(site.id);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat(site.center)
        .addTo(this.map);

      this.markers.set(site.id, marker);
    }
  }

  private clearMarkers(): void {
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
  }
}
