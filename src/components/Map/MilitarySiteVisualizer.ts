/**
 * components/Map/MilitarySiteVisualizer.ts
 *
 * [GeoBrief 3D 2단계: 군 유휴부지(Military Idle Land) 초고시인성 3D 시각화 & 마스터플랜 비교 엔진]
 *
 * 강원특별자치도 18개 시·군 전역 군 유휴부지의 명확한 위치 인식과
 * [기존 병영 군사시설 3D] vs [미래 스마트 마스터플랜 3D] 원클릭 비교를 지원하는 특화 시각화 엔진:
 *
 * 1. 4중 초고시인성 3D 경계 시각화:
 *    - 외곽 네온 에메랄드 글로우 라인 (#10b981, 두께 4px, 블러 2px)
 *    - 내부 백색 전술 점선 (#ffffff, dasharray: [2, 2])
 *    - 3D 수직 빛기둥 가드월 펜스 (높이 8m 반투명 fill-extrusion 펜스)
 *    - 부지 바닥 에메랄드 반투명 해칭 (opacity: 0.22)
 *
 * 2. 부지 상공 고정형 3D 홀로그램 브리핑 배지 (Floating Hologram Badge):
 *    - 부지 중심 상공 3D 팝업 배지:
 *      * [🛡️ 부지명], [총면적 (㎡ / 평)], [현재 상태], [계획 용도], [평균 경사도 / 용도지역]
 *      * 원클릭 [현재 군 막사 3D] ↔ [미래 마스터플랜 3D] 전환 토글 스위치
 *
 * 3. 영내 기존 군 막사 vs 미래 개발 구상안(3D 마스터플랜) 실시간 비교:
 *    - 현재 상태: 샌드베이지 군 막사, 연병장, 군수정비고, 보급창고
 *    - 미래 개발안: 블루 커튼월 R&D 타워, 헬리패드, 지식산업센터, 시민공원 조감도
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
  private selectedSiteId: string | null = null;
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
    this.updateHologramBadges();
  }

  /**
   * 지도에서 레이어 및 마커 안전 해제
   */
  public detach(): void {
    this.clearMarkers();
    if (!this.map) return;

    const layerIds = [
      'military-site-3d-fence',
      'military-site-glow-outer',
      'military-site-dash-inner',
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
      'military-site-3d-fence',
      'military-site-glow-outer',
      'military-site-dash-inner',
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
    this.selectedSiteId = siteId;
    const site = getGangwon18MilitarySiteById(siteId);
    if (!site || !this.map) return;

    // 카메라 추천 위치로 부드러운 3D 플라이투
    this.map.flyTo({
      center: site.center,
      zoom: site.recommendedCamera.zoom,
      pitch: site.recommendedCamera.pitch,
      bearing: site.recommendedCamera.bearing,
      essential: true,
      duration: 1500,
    });

    this.updateHologramBadges();
  }

  /**
   * [현재 군 막사 3D] vs [미래 스마트 마스터플랜 3D] 모드 전환
   */
  public setDisplayMode(mode: MilitarySiteDisplayMode): void {
    this.currentMode = mode;
    this.updateHologramBadges();
    if (this.selectedSiteId && this.options.onModeChange) {
      this.options.onModeChange(this.selectedSiteId, mode);
    }
  }

  public getDisplayMode(): MilitarySiteDisplayMode {
    return this.currentMode;
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

    // 1. 부지 바닥: 에메랄드 반투명 해칭 (opacity: 0.22)
    if (!this.map.getLayer('military-site-fill')) {
      this.map.addLayer({
        id: 'military-site-fill',
        type: 'fill',
        source: 'military-sites-source',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.22,
        },
      });
    }

    // 2. 3D 수직 빛기둥 가드월 펜스 (높이 8m 반투명 펜스)
    if (!this.map.getLayer('military-site-3d-fence')) {
      this.map.addLayer({
        id: 'military-site-3d-fence',
        type: 'fill-extrusion',
        source: 'military-sites-source',
        paint: {
          'fill-extrusion-color': '#10b981',
          'fill-extrusion-height': 8.0,
          'fill-extrusion-base': 0.0,
          'fill-extrusion-opacity': 0.40,
        },
      });
    }

    // 3. 외곽 네온 에메랄드 글로우 라인 (두께 4px, 블러 2px)
    if (!this.map.getLayer('military-site-glow-outer')) {
      this.map.addLayer({
        id: 'military-site-glow-outer',
        type: 'line',
        source: 'military-sites-source',
        paint: {
          'line-color': '#10b981',
          'line-width': 4.0,
          'line-blur': 2.0,
          'line-opacity': 0.95,
        },
      });
    }

    // 4. 내부 백색 전술 점선 (#ffffff, dasharray: [2, 2])
    if (!this.map.getLayer('military-site-dash-inner')) {
      this.map.addLayer({
        id: 'military-site-dash-inner',
        type: 'line',
        source: 'military-sites-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.8,
          'line-dasharray': [2, 2],
          'line-opacity': 0.95,
        },
      });
    }

    // 클릭 시 해당 부지 자동 선택
    this.map.on('click', 'military-site-fill', (e) => {
      if (e.features && e.features[0]) {
        const sid = e.features[0].properties?.id;
        if (sid) {
          this.selectSite(sid);
          this.options.onSelectSite?.(sid);
        }
      }
    });

    this.map.on('mouseenter', 'military-site-fill', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'military-site-fill', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
    });
  }

  /**
   * 상공 고정형 3D 홀로그램 브리핑 배지 렌더링
   */
  private updateHologramBadges(): void {
    if (!this.map) return;
    this.clearMarkers();

    for (const site of GANGWON_18_MILITARY_SITES) {
      const isSelected = this.selectedSiteId === site.id || (!this.selectedSiteId && site.id === 'wj-1st-logistics');

      const el = document.createElement('div');
      el.className = `military-hologram-badge-container ${isSelected ? 'active-badge' : ''}`;
      el.style.cursor = 'pointer';
      el.style.zIndex = isSelected ? '100' : '50';

      const modeTitle = this.currentMode === 'current_military' ? '🏛️ 기존 영내 병영막사 3D' : '🏢 미래 스마트 마스터플랜 3D';
      const modeColor = this.currentMode === 'current_military' ? 'text-amber-400 border-amber-500/60' : 'text-cyan-400 border-cyan-500/60';

      el.innerHTML = `
        <div style="
          position: relative;
          background: rgba(10, 20, 15, 0.90);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1.5px solid ${isSelected ? '#10b981' : '#22c55e60'};
          border-radius: 12px;
          padding: 8px 12px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 0 15px ${isSelected ? 'rgba(16, 185, 129, 0.5)' : 'transparent'};
          color: #f8fafc;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          min-width: 220px;
          max-width: 290px;
          transition: all 0.25s ease;
          pointer-events: auto;
        ">
          <!-- 상단 핀 및 비콘 -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="font-size: 13px;">🛡️</span>
              <strong style="font-size: 12px; color: #10b981; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
                ${site.shortName}
              </strong>
            </div>
            <span style="font-size: 9.5px; font-family: monospace; background: #064e3b; color: #6ee7b7; padding: 2px 5px; border-radius: 4px; border: 1px solid #059669;">
              ${site.regionName}
            </span>
          </div>

          <!-- 면적 & 현재 상태 -->
          <div style="font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 3px;">
            <span>총면적: <strong style="color: #f1f5f9;">${site.areaSqm.toLocaleString()}㎡</strong> (약 ${site.areaPyeong.toLocaleString()}평)</span>
          </div>

          <!-- 상태 및 계획 용도 -->
          <div style="font-size: 10px; line-height: 1.35; margin-bottom: 5px;">
            <div style="color: #cbd5e1; margin-bottom: 2px;">
              <span style="color: #38bdf8;">• 상태:</span> ${site.currentStatus.split('/')[0]}
            </div>
            <div style="color: #cbd5e1; margin-bottom: 2px;">
              <span style="color: #f59e0b;">• 용도:</span> ${site.targetUse.split('&')[0]}
            </div>
            <div style="color: #94a3b8; font-size: 9px;">
              • 경사도: ${site.averageSlope} | ${site.zoning.split('/')[0]}
            </div>
          </div>

          <!-- 원클릭 [현재 막사 3D] vs [미래 마스터플랜 3D] 토글 스위치 -->
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #09120c;
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 6px;
            padding: 3px 6px;
            margin-top: 5px;
          ">
            <span style="font-size: 9.5px; font-weight: 600;" class="${modeColor}">
              ${modeTitle}
            </span>
            <button
              type="button"
              id="btn-toggle-${site.id}"
              style="
                background: ${this.currentMode === 'future_masterplan' ? '#059669' : '#d97706'};
                color: #ffffff;
                font-size: 9px;
                font-weight: 700;
                padding: 2px 7px;
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

      // 클릭 시 해당 부지 선택
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target && target.id === `btn-toggle-${site.id}`) {
          e.stopPropagation();
          const nextMode: MilitarySiteDisplayMode = this.currentMode === 'future_masterplan' ? 'current_military' : 'future_masterplan';
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
