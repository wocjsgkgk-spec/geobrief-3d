'use client';

import React, { useState, useRef, useEffect, startTransition } from 'react';
import {
  Mountain,
  FolderPlus,
  FolderOpen,
  CheckCircle2,
  Box,
  Presentation,
  Maximize2,
  Minimize2,
  Menu,
  Eye,
  Ruler,
  Pin,
  MoveUpRight,
  FileCheck,
  FileDown,
  FileUp,
  Radio,
  ShieldCheck,
  Boxes,
  Film,
  Video,
  Sparkles,
  ChevronDown,
  Activity,
  BarChart3,
  RefreshCw,
  Save,
  Layers,
  Target,
  MapPin,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { ProjectManagerModal } from '@/components/Modal/ProjectManagerModal';
import { RenderMode3D } from '@/types/map';
import { GANGWON_MILITARY_SITES, getGangwonMilitarySiteById } from '@/constants/gangwonMilitarySites';
import {
  GANGWON_18_REGIONS,
  GANGWON_SUBREGIONS,
  GangwonSubregion,
  getGangwonRegionByIdOrName,
} from '@/constants/gangwon18Regions';
import { GangwonUnifiedSearch } from '@/components/Search/GangwonUnifiedSearch';

type DropdownCategory = 'site' | 'view' | 'analysis' | 'tactical' | 'export' | null;

export const Header: React.FC = () => {
  const {
    metadata,
    selectedIdleSiteId,
    selectIdleSite,
    selectedRegionId,
    selectRegion,
    flyToLocation,
    isOrbiting,
    toggleOrbiting,
    resetProject,
    viewMode,
    toggleViewMode,
    triggerSlidePackExport,
    slidePackProgress,
    isPresentationMode,
    togglePresentationMode,
    isMobilePanelOpen,
    toggleMobilePanel,
    isViewshedMode,
    viewshedResult,
    toggleViewshedMode,
    isMeasureMode,
    measureResult,
    toggleMeasureMode,
    isPinMode,
    togglePinMode,
    spatialPins,
    isArrowMode,
    toggleArrowMode,
    tacticalArrows,
    showTitleBlock,
    toggleTitleBlock,
    exportProjectFile,
    importProjectFile,
    surveillanceSensors,
    isSensorPlacementMode,
    toggleSensorPlacementMode,
    uavFlight,
    toggleUavFlight,
    cutFill,
    toggleCutFill,
    cinematicFlight,
    setCinematicBuilderOpen,
    setShowTerrainProfile,
    renderMode3D,
    setRenderMode3D,
    tile3DStream,
    losAnalysis,
    startLosAnalysis,
    resetLosAnalysis,
  } = useMapStore();

  const [activeDropdown, setActiveDropdown] = useState<DropdownCategory>(null);
  const [siteTab, setSiteTab] = useState<'regions' | 'hubs'>('regions');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const currentRegion = getGangwonRegionByIdOrName(selectedRegionId || '');
  const currentMilitarySite = getGangwonMilitarySiteById(selectedIdleSiteId || '');
  const currentDisplayName = currentMilitarySite?.shortName || currentRegion?.name || '원주시';


  // 외부 클릭 시 열린 드롭다운 자동 닫힘
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDropdownToggle = (category: DropdownCategory) => {
    setActiveDropdown((prev) => (prev === category ? null : category));
  };

  const handleExportGeobrief = () => {
    try {
      exportProjectFile();
      setActiveDropdown(null);
    } catch (err) {
      alert('프로젝트 파일 내보내기 실패: ' + (err as Error).message);
    }
  };

  const handleImportGeobrief = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = importProjectFile(text);
      if (ok) {
        alert(`'${file.name}' 브리핑 프로젝트가 복원되었습니다.`);
      } else {
        alert('올바른 .geobrief 프로젝트 파일 형식이 아닙니다.');
      }
    } catch (err) {
      alert('파일 읽기 오류: ' + (err as Error).message);
    } finally {
      if (e.target) e.target.value = '';
      setActiveDropdown(null);
    }
  };

  const handleNewProject = () => {
    if (
      window.confirm(
        '작성 중이던 부지 구역, 버퍼 분석, 메타데이터를 초기화하고 새 프로젝트를 시작하시겠습니까?'
      )
    ) {
      resetProject();
      setActiveDropdown(null);
    }
  };

  // 3D 렌더 모드 3단계 원클릭 순환: 실감 파사드 -> 고정밀 3D 타일셋 -> 경량 네이티브
  const cycleRenderMode3D = () => {
    startTransition(() => {
      requestAnimationFrame(() => {
        if (renderMode3D === 'facade') {
          setRenderMode3D('tiles3d');
        } else if (renderMode3D === 'tiles3d') {
          setRenderMode3D('native');
        } else {
          setRenderMode3D('facade');
        }
      });
    });
  };

  return (
    <header className="h-14 bg-[#121714] border-b border-[#242f27] px-3 sm:px-4 flex items-center justify-between z-20 select-none overflow-x-auto no-scrollbar">
      {/* Brand & Project Info */}
      <div className="flex items-center space-x-2.5 sm:space-x-3 flex-shrink-0">
        <button
          onClick={toggleMobilePanel}
          className="md:hidden p-2 rounded-lg bg-[#1b221e] border border-[#2f3b33] text-emerald-400 hover:text-white hover:bg-emerald-950/60 transition-colors"
          title="공간 분석 및 제어 패널 열기"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1e3a2b] border border-[#2d5740] text-emerald-400 shadow-inner flex-shrink-0">
          <Mountain className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            <span className="font-bold text-sm sm:text-base tracking-wider text-slate-100 whitespace-nowrap">
              GeoBrief <span className="text-emerald-400">3D</span>
            </span>
            <span className="hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-700/60 text-blue-300 whitespace-nowrap">
              3D Briefing Builder
            </span>
            <span className="hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 items-center gap-1 whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              자동저장 활성
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate max-w-[140px] sm:max-w-xs md:max-w-md">
            {metadata.title}
          </p>
        </div>
      </div>

      {/* 중앙: 대상지 선택 & 통합 검색 & 기능 드롭다운 툴바 */}
      <div ref={toolbarRef} className="flex items-center space-x-1.5 sm:space-x-2.5 flex-shrink-0 mx-2 relative">
        {/* 0-A. [🔍 강원 전 지역 주소·지번·부지 통합 검색창] */}
        <div className="w-48 sm:w-64 md:w-80 lg:w-96 flex-shrink-0">
          <GangwonUnifiedSearch />
        </div>

        {/* 0-B. [📍 분석 대상지 선택] 드롭다운 (4대 권역 체계 완비) */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('site')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeDropdown === 'site'
                ? 'bg-amber-600/35 border-amber-400/90 text-amber-200 shadow-md ring-1 ring-amber-500/50'
                : 'bg-[#18261c] border-[#2e4735] text-emerald-300 hover:text-white hover:bg-[#203325]'
            }`}
            title="강원도 18개 시·군 전역 4대 권역 및 군 유휴부지 거점 선택"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 hidden lg:inline">대상지:</span>
            <span className="font-bold text-emerald-300">
              {currentDisplayName}
            </span>
            <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'site' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'site' && (
            <div className="absolute top-11 left-0 w-96 bg-[#111a14]/98 backdrop-blur-xl border border-[#2a4030] rounded-xl shadow-2xl p-2.5 z-50 flex flex-col space-y-2 animate-in fade-in zoom-in-95 duration-100 max-h-[82vh] overflow-y-auto">
              {/* 탭 헤더: 18개 시·군 4대 권역 vs 스마트 복합단지 */}
              <div className="grid grid-cols-2 gap-1 bg-[#0b130e] p-1 rounded-lg border border-[#203425]">
                <button
                  onClick={() => setSiteTab('regions')}
                  className={`py-1 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1 ${
                    siteTab === 'regions'
                      ? 'bg-emerald-600/40 text-emerald-200 border border-emerald-500/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  18개 시·군 전역 (18)
                </button>
                <button
                  onClick={() => setSiteTab('hubs')}
                  className={`py-1 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1 ${
                    siteTab === 'hubs'
                      ? 'bg-emerald-600/40 text-emerald-200 border border-emerald-500/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Box className="w-3 h-3 text-emerald-400" />
                  스마트 복합단지 ({GANGWON_MILITARY_SITES.length})
                </button>
              </div>

              {/* 1) 강원특별자치도 18개 시·군 4대 권역별 목록 */}
              {siteTab === 'regions' && (
                <div className="flex flex-col space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="px-1 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-[#24382a] pb-1">
                    <span className="text-emerald-300">강원특별자치도 18개 시·군 4대 권역</span>
                    <span className="text-emerald-400 font-mono text-[9px]">권역별 즉시 3D 이동</span>
                  </div>

                  {GANGWON_SUBREGIONS.map((subregion) => {
                    const regionsInSub = GANGWON_18_REGIONS.filter((r) => r.subregion === subregion);
                    return (
                      <div key={subregion} className="bg-[#142017]/80 rounded-lg p-1.5 border border-[#233829]">
                        <div className="px-1.5 py-0.5 text-[10.5px] font-bold text-amber-300/90 flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {subregion}
                          </span>
                          <span className="text-[9.5px] font-mono text-slate-400">{regionsInSub.length}개 시·군</span>
                        </div>

                        <div className="space-y-1">
                          {regionsInSub.map((region) => {
                            const isSelected = selectedRegionId === region.id;
                            return (
                              <div
                                key={region.id}
                                className={`rounded-lg transition-all border p-1.5 ${
                                  isSelected
                                    ? 'bg-emerald-950/90 border-emerald-500/80 shadow-inner'
                                    : 'bg-[#101912] hover:bg-[#18261c] border-transparent'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectRegion(region.id);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full text-left flex items-center justify-between"
                                >
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-xs text-slate-100">{region.name}</span>
                                      <span className="text-[9.5px] px-1 py-0.2 rounded font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/50">
                                        {region.admCode}
                                      </span>
                                    </div>
                                    <p className="text-[9.5px] text-slate-400 truncate mt-0.5 max-w-[240px]">
                                      {region.terrainCharacteristic}
                                    </p>
                                  </div>
                                  <div className="text-[10px] text-right font-mono flex-shrink-0">
                                    <span className="text-emerald-400 block font-semibold">{region.type}</span>
                                    <span className="text-slate-400">{region.pitch}° 3D</span>
                                  </div>
                                </button>

                                {/* 군 유휴부지 & 핵심 거점 퀵 배지 */}
                                {region.militarySites && region.militarySites.length > 0 && (
                                  <div className="mt-1.5 pt-1 border-t border-[#1d2f22] flex flex-wrap gap-1">
                                    {region.militarySites.map((site) => (
                                      <button
                                        key={site.siteId}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          selectRegion(region.id);
                                          flyToLocation({
                                            longitude: site.coords[0],
                                            latitude: site.coords[1],
                                            zoom: site.recommendedCamera?.zoom || 15.8,
                                            pitch: site.recommendedCamera?.pitch || 55,
                                            bearing: site.recommendedCamera?.bearing || 20,
                                          });
                                          // 4대 리포트 트리거
                                          window.dispatchEvent(
                                            new CustomEvent('gangwon-search-select', {
                                              detail: {
                                                id: `site-${site.siteId}`,
                                                title: site.name,
                                                category: 'military_site',
                                                categoryLabel: '군 유휴부지',
                                                coords: site.coords,
                                                regionId: region.id,
                                                regionName: region.name,
                                              },
                                            })
                                          );
                                          setActiveDropdown(null);
                                        }}
                                        className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#18271e] hover:bg-emerald-900/60 text-slate-300 hover:text-emerald-200 border border-[#273d2d] transition-colors flex items-center gap-1"
                                        title={`${site.name} (${site.description})`}
                                      >
                                        <span className="text-amber-400">📍</span>
                                        <span className="truncate max-w-[150px]">{site.name.split('(')[0]}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2) 강원권 3D 스마트 복합단지(LOD2) 5대 거점 */}
              {siteTab === 'hubs' && (
                <div className="flex flex-col space-y-1">
                  <div className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-[#243529] pb-1">
                    <span className="text-emerald-300">LOD2 실사 건물 스마트 복합단지</span>
                    <span className="text-emerald-400 font-mono text-[9.5px]">{GANGWON_MILITARY_SITES.length}개소</span>
                  </div>
                  <div className="flex flex-col space-y-1 max-h-[55vh] overflow-y-auto pr-1">
                    {GANGWON_MILITARY_SITES.map((site) => {
                      const isSelected =
                        selectedIdleSiteId === site.id || site.aliasIds.includes(selectedIdleSiteId || '');
                      return (
                        <button
                          key={site.id}
                          onClick={() => {
                            selectIdleSite(site.id);
                            setActiveDropdown(null);
                          }}
                          className={`w-full px-2.5 py-2 text-xs rounded-lg text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 shadow-inner'
                              : 'hover:bg-[#1e2e22] text-slate-200 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono font-semibold bg-[#17251c] text-emerald-300 border border-[#263c2c]">
                                {site.hubCategoryLabel}
                              </span>
                              <span className="font-bold text-slate-100 truncate">
                                {site.shortName}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">
                              {site.themeTitle}
                            </p>
                          </div>
                          <div className="flex flex-col items-end flex-shrink-0 text-[10px] font-mono">
                            <span className="text-emerald-400 font-semibold">
                              약 {site.areaPyeong.toLocaleString()}평
                            </span>
                            <span className="text-slate-400">
                              {site.recommendedCamera.pitch}° 3D
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 1. [뷰 & 시네마틱] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('view')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeDropdown === 'view' || isOrbiting || cinematicFlight.isPlaying || cinematicFlight.isRecording
                ? 'bg-blue-600/30 border-blue-400/80 text-blue-200 shadow-md ring-1 ring-blue-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="3D 뷰 전환, 360도 투어, 시네마틱 경로 및 브리핑 녹화"
          >
            <Video className="w-3.5 h-3.5 text-blue-400" />
            <span>뷰 & 시네마틱</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'view' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'view' && (
            <div className="absolute top-11 left-0 w-60 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  toggleViewMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-blue-400" />
                  <span>2D/3D 입체 뷰 전환</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800">
                  {viewMode === '2D' ? '현재 2D' : '현재 3D'}
                </span>
              </button>

              <button
                onClick={() => {
                  toggleOrbiting();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isOrbiting ? 'animate-spin' : ''}`} />
                  <span>360도 파노라마 3D 투어</span>
                </div>
                {isOrbiting && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 animate-pulse border border-emerald-700">
                    회전 중
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setCinematicBuilderOpen(true);
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-cyan-400" />
                  <span>시네마틱 비행 빌더</span>
                </div>
                {cinematicFlight.waypoints.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {cinematicFlight.waypoints.length} WP
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setCinematicBuilderOpen(true);
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-rose-950/50 text-rose-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Video className="w-3.5 h-3.5 text-rose-400" />
                  <span>1080p 브리핑 영상 녹화</span>
                </div>
                {cinematicFlight.isRecording && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-900 text-white animate-pulse border border-rose-600">
                    🔴 녹화 중
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  togglePresentationMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isPresentationMode ? (
                    <Minimize2 className="w-3.5 h-3.5 text-amber-300" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>대형 스크린 브리핑 뷰</span>
                </div>
                {isPresentationMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700">
                    활성 (ESC)
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 2. [공간 & 토목분석] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('analysis')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeDropdown === 'analysis' || isViewshedMode || isMeasureMode || cutFill.enabled || losAnalysis.isActive || !!losAnalysis.result
                ? 'bg-emerald-600/30 border-emerald-400/80 text-emerald-200 shadow-md ring-1 ring-emerald-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="3D 가시선(LOS), 3D 가시권(사계), 줄자 실측, 3D 토공량(Cut & Fill), 지형 횡단면"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>공간 & 토목분석</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'analysis' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'analysis' && (
            <div className="absolute top-11 left-0 w-64 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* [3D 가시선(LOS) 광선 추적] 도구 */}
              <button
                onClick={() => {
                  if (losAnalysis.isActive || losAnalysis.result) {
                    resetLosAnalysis();
                  } else {
                    startLosAnalysis();
                  }
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold text-emerald-200">3D 가시선(LOS) 광선 추적</span>
                </div>
                {losAnalysis.isActive && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse">
                    {losAnalysis.step === 'pick_a' ? 'A점 선택' : 'B점 선택'}
                  </span>
                )}
                {losAnalysis.result && !losAnalysis.isActive && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-600">
                    분석 완료
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  toggleViewshedMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-teal-400" />
                  <span>3D 시계(가시권) 분석</span>
                </div>
                {isViewshedMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-700 animate-pulse">
                    클릭 측정
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  toggleMeasureMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Ruler className="w-3.5 h-3.5 text-amber-400" />
                  <span>3D 실측 줄자 (경사거리)</span>
                </div>
                {isMeasureMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">
                    측정 중
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  toggleCutFill();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3D 토공량(Cut & Fill) 산출</span>
                </div>
                {cutFill.enabled && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
                    EL.{cutFill.targetElevation}m
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setShowTerrainProfile(true);
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>지형 횡단면 고도 프로파일</span>
                </div>
                <span className="text-[10px] text-slate-400">모달 분석</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. [전술 & 주석작도] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('tactical')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeDropdown === 'tactical' || isPinMode || isArrowMode || uavFlight.isActive || isSensorPlacementMode
                ? 'bg-cyan-600/30 border-cyan-400/80 text-cyan-200 shadow-md ring-1 ring-cyan-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="공간 주석 핀, 전술 접근 화살표, UAV 정찰 비행, 3D 센서 감시 콘"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>전술 & 주석작도</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'tactical' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'tactical' && (
            <div className="absolute top-11 left-0 w-64 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  togglePinMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Pin className="w-3.5 h-3.5 text-cyan-400" />
                  <span>3D 공간 주석 핀</span>
                </div>
                <div className="flex items-center gap-1">
                  {spatialPins.length > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {spatialPins.length}개
                    </span>
                  )}
                  {isPinMode && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-200 animate-pulse">
                      배치 중
                    </span>
                  )}
                </div>
              </button>

              <button
                onClick={() => {
                  toggleArrowMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MoveUpRight className="w-3.5 h-3.5 text-amber-400" />
                  <span>전술 접근 축선 화살표</span>
                </div>
                <div className="flex items-center gap-1">
                  {tacticalArrows.length > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      {tacticalArrows.length}개
                    </span>
                  )}
                  {isArrowMode && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900 text-amber-200 animate-pulse">
                      작도 중
                    </span>
                  )}
                </div>
              </button>

              <button
                onClick={() => {
                  toggleUavFlight();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Radio className={`w-3.5 h-3.5 text-emerald-400 ${uavFlight.isActive ? 'animate-spin' : ''}`} />
                  <span>UAV 3D 정찰 비행 시뮬레이터</span>
                </div>
                {uavFlight.isActive && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse">
                    순찰 중
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  toggleSensorPlacementMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>3D 감시 센서 콘 (FOV)</span>
                </div>
                <div className="flex items-center gap-1">
                  {surveillanceSensors.length > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                      {surveillanceSensors.length}개
                    </span>
                  )}
                  {isSensorPlacementMode && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-900 text-teal-200 animate-pulse">
                      배치 중
                    </span>
                  )}
                </div>
              </button>
            </div>
          )}
        </div>

        {/* 4. [도면 & 내보내기] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('export')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeDropdown === 'export' || showTitleBlock || slidePackProgress.isExporting
                ? 'bg-amber-600/30 border-amber-400/80 text-amber-200 shadow-md ring-1 ring-amber-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="도면 표제란, PPTX 슬라이드 팩 저장, .geobrief 프로젝트 백업"
          >
            <FileDown className="w-3.5 h-3.5 text-amber-400" />
            <span>도면 & 내보내기</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'export' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'export' && (
            <div className="absolute top-11 left-0 w-64 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  toggleTitleBlock();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>도정·국방 도면 표제란 토글</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {showTitleBlock ? '표시 중' : '숨김'}
                </span>
              </button>

              <button
                onClick={() => {
                  triggerSlidePackExport();
                  setActiveDropdown(null);
                }}
                disabled={slidePackProgress.isExporting}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-emerald-950/60 text-emerald-200 flex items-center justify-between transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Presentation className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3단 보고서 슬라이드 (.pptx)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-700">
                  {slidePackProgress.isExporting ? '생성 중' : 'PPTX'}
                </span>
              </button>

              <button
                onClick={handleExportGeobrief}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                  <span>.geobrief 프로젝트 파일 백업</span>
                </div>
                <span className="text-[10px] text-cyan-300 font-mono">저장</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span>.geobrief 프로젝트 복원</span>
                </div>
                <span className="text-[10px] text-cyan-300 font-mono">열기</span>
              </button>

              <div className="h-px bg-[#242f27] my-1" />

              <button
                onClick={handleNewProject}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-rose-950/60 text-rose-300 flex items-center gap-2 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5 text-rose-400" />
                <span>새 프로젝트 시작 (초기화)</span>
              </button>
            </div>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImportGeobrief}
          accept=".geobrief,.json"
          className="hidden"
        />
      </div>

      {/* 우측 전용 영역: [3D 디테일 모드] + [도면 저장] 직관적 배치 */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0 ml-auto">
        {/* [3D 디테일 모드: 실감 파사드 / 3D 타일셋 / 경량 네이티브 원클릭 전환] */}
        <button
          onClick={cycleRenderMode3D}
          className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap shadow-sm ${
            renderMode3D === 'facade'
              ? 'bg-amber-600/30 border-amber-400/80 text-amber-200 shadow-amber-950/40 ring-1 ring-amber-400/50'
              : renderMode3D === 'tiles3d'
              ? 'bg-cyan-600/30 border-cyan-400/80 text-cyan-200 shadow-cyan-950/40 ring-1 ring-cyan-400/50'
              : 'bg-blue-600/30 border-blue-400/80 text-blue-200 shadow-blue-950/40 ring-1 ring-blue-400/50'
          }`}
          title="3D 디테일 모드 전환: 실감 파사드(LOD2) ⇄ 고정밀 3D 타일셋 ⇄ 경량 네이티브(클릭 시 순환)"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="hidden sm:inline text-slate-300 font-medium">3D 디테일:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              renderMode3D === 'facade'
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                : renderMode3D === 'tiles3d'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50'
                : 'bg-blue-500/25 text-blue-300 border border-blue-500/50'
            }`}
          >
            {renderMode3D === 'facade'
              ? '실감(LOD2)'
              : renderMode3D === 'tiles3d'
              ? tile3DStream.presetId === 'sample_pointcloud'
                ? 'LiDAR 점군'
                : tile3DStream.presetId === 'sample_city'
                ? '도시 모델(b3dm)'
                : tile3DStream.presetId === 'custom'
                ? '3D Tiles(URL)'
                : '3D 타일셋'
              : '경량 네이티브'}
          </span>
        </button>

        {/* [도면 저장]: 프로젝트 보관함 및 클라우드/로컬 저장 */}
        <button
          onClick={() => setIsProjectModalOpen(true)}
          className="px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/60 shadow-md shadow-emerald-950/60 flex items-center space-x-1.5 transition-all whitespace-nowrap ring-1 ring-emerald-400/30"
          title="클라우드 및 로컬 프로젝트 보관함 열기 및 도면 저장"
        >
          <Save className="w-3.5 h-3.5 text-emerald-200" />
          <span>도면 저장</span>
        </button>
      </div>

      {/* 프로젝트 저장 및 불러오기 모달 */}
      <ProjectManagerModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />
    </header>
  );
};
