'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Mountain,
  FolderPlus,
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
  ShieldAlert,
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
  Building2,
  User,
  Sun,
  Play,
  Pause,
  Printer,
  Camera,
  Waves,
  Scale,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { ProjectManagerModal } from '@/components/Modal/ProjectManagerModal';
import { FacilityPresetId, FACILITY_PRESETS } from '@/types/map';
import { GANGWON_MILITARY_SITES, getGangwonMilitarySiteById } from '@/constants/gangwonMilitarySites';
import {
  GANGWON_18_MILITARY_SITES,
  getGangwon18MilitarySiteById,
  GangwonSubregionType,
} from '@/constants/gangwon18MilitarySites';
import {
  GANGWON_18_REGIONS,
  GANGWON_SUBREGIONS,
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
    toggleMobilePanel,
    isViewshedMode,
    toggleViewshedMode,
    isMeasureMode,
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
    losAnalysis,
    startLosAnalysis,
    resetLosAnalysis,
    buildingTheme,
    setBuildingTheme,
    isStreetView,
    toggleStreetView,
    isSunPlaying,
    toggleSunPlaying,
    sunHour,
    showSlopeAnalysis,
    toggleSlopeAnalysis,
    waterLevel,
    toggleWaterLevel,
    bufferRings,
    toggleBufferRing,
    borderSecurityVisible,
    setBorderSecurityVisible,
    layers,
    toggleLayer,
    addPlacedFacility,
    placedFacilities,
    baseMap,
    setBaseMap,
    detail3DMode,
    toggleDetail3DMode,
    renderMode3D,
  } = useMapStore();

  const [activeDropdown, setActiveDropdown] = useState<DropdownCategory>(null);
  const [siteTab, setSiteTab] = useState<'regions' | 'hubs'>('regions');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const currentRegion = getGangwonRegionByIdOrName(selectedRegionId || '');
  const currentMilitarySite =
    getGangwon18MilitarySiteById(selectedIdleSiteId || '') ||
    getGangwonMilitarySiteById(selectedIdleSiteId || '');
  const currentDisplayName = currentMilitarySite?.shortName || currentRegion?.name || '원주시';

  // 외부 클릭 시 열린 드롭다운 자동 닫힘 (SVG 아이콘 언마운트 버블링 이슈 완벽 방어)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (toolbarRef.current) {
        if (toolbarRef.current.contains(e.target as Node) || (path.length > 0 && path.includes(toolbarRef.current))) {
          return;
        }
      }
      setActiveDropdown(null);
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

  // 주요 거점 시점 프리셋 이동
  const handleFlyToPreset = (coords: [number, number], zoom: number, pitch: number, bearing: number) => {
    flyToLocation({
      longitude: coords[0],
      latitude: coords[1],
      zoom,
      pitch,
      bearing,
    });
    setActiveDropdown(null);
  };

  return (
    <header className="h-14 bg-[#121714] border-b border-[#242f27] px-3 sm:px-4 flex items-center justify-between z-50 select-none relative overflow-visible">
      {/* 1. 좌측 브랜드 타이틀 & 프로젝트 정보 */}
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
            <span className="hidden 2xl:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-700/60 text-blue-300 whitespace-nowrap">
              3D Briefing Builder
            </span>
            <span className="hidden xl:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 items-center gap-1 whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              자동저장
            </span>
          </div>
          <p className="hidden md:block text-[10px] sm:text-[11px] text-slate-400 font-medium truncate max-w-[120px] lg:max-w-xs">
            {metadata.title}
          </p>
        </div>
      </div>

      {/* 2. 중앙: 통합 검색창 & 풀옵션 드롭다운 메뉴바 */}
      <div ref={toolbarRef} className="flex items-center space-x-1 sm:space-x-1.5 md:space-x-2 flex-shrink min-w-0 mx-1 sm:mx-2 relative">
        {/* [🔍 강원 전 지역 주소·지번·부지 검색] 입력창 */}
        <div className="w-28 sm:w-36 md:w-44 lg:w-56 xl:w-64 flex-shrink">
          <GangwonUnifiedSearch />
        </div>

        {/* [📍 분석 대상지 선택] 드롭다운 (18개 시·군 전역 & 스마트 복합단지) */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('site')}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeDropdown === 'site'
                ? 'bg-amber-600/35 border-amber-400/90 text-amber-200 shadow-md ring-1 ring-amber-500/50'
                : 'bg-[#18261c] border-[#2e4735] text-emerald-300 hover:text-white hover:bg-[#203325]'
            }`}
            title="강원도 18개 시·군 전역 4대 권역 및 군 유휴부지 거점 선택"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-300 hidden lg:inline">대상지:</span>
            <span className="font-bold text-emerald-300 truncate max-w-[80px] sm:max-w-[120px]">
              {currentDisplayName}
            </span>
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${activeDropdown === 'site' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'site' && (
            <div className="absolute top-11 left-0 w-96 bg-[#111a14]/98 backdrop-blur-xl border border-[#2a4030] rounded-xl shadow-2xl p-2.5 z-50 flex flex-col space-y-2 animate-in fade-in zoom-in-95 duration-100 max-h-[82vh] overflow-y-auto">
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

              {/* 1) 18개 시·군 4대 권역별 목록 */}
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
                                      <span className="text-[10px] text-slate-400">{region.fullName}</span>
                                    </div>
                                    <p className="text-[9.5px] text-emerald-400/90 font-mono mt-0.5 truncate max-w-[200px]">
                                      {region.terrainCharacteristic} · {region.type}
                                    </p>
                                  </div>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#142218] text-emerald-300 border border-[#223627]">
                                    {region.militarySites.length}개 거점
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2) 강원 군 유휴부지 & 핵심 거점 */}
              {siteTab === 'hubs' && (
                <div className="flex flex-col space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {(['영서 중·남부권', '북부 접경권', '동해안 및 태백권'] as GangwonSubregionType[]).map((subreg) => {
                    const sitesInSub = GANGWON_18_MILITARY_SITES.filter((s) => s.subregion === subreg);
                    return (
                      <div key={subreg} className="bg-[#131f17]/90 rounded-lg p-1.5 border border-[#233829]">
                        <div className="px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-300 flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {subreg}
                          </span>
                          <span className="text-[9.5px] font-mono text-slate-400">{sitesInSub.length}개 거점</span>
                        </div>
                        <div className="space-y-1">
                          {sitesInSub.map((site) => {
                            const isSelected = selectedIdleSiteId === site.id || site.aliasIds.includes(selectedIdleSiteId || '');
                            return (
                              <button
                                key={site.id}
                                type="button"
                                onClick={() => {
                                  selectIdleSite(site.id);
                                  setActiveDropdown(null);
                                }}
                                className={`w-full px-2 py-1.5 text-xs rounded-lg text-left transition-all flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 shadow-inner'
                                    : 'hover:bg-[#1c2c20] text-slate-200 border border-transparent'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] px-1 py-0.2 rounded font-mono font-semibold bg-[#17251c] text-emerald-300 border border-[#263c2c]">
                                      {site.regionName}
                                    </span>
                                    <span className="font-bold text-slate-100 truncate text-[11px]">
                                      {site.shortName}
                                    </span>
                                  </div>
                                  <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                                    {site.targetUse}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end flex-shrink-0 text-[9.5px] font-mono">
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
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* [🎥 뷰 & 시네마틱] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('view')}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeDropdown === 'view' || isOrbiting || cinematicFlight.isPlaying || cinematicFlight.isRecording
                ? 'bg-blue-600/30 border-blue-400/80 text-blue-200 shadow-md ring-1 ring-blue-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="3D 뷰 전환, 360도 투어, 시네마틱 경로 및 브리핑 녹화"
          >
            <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>뷰</span><span className="hidden xl:inline"> & 시네마틱</span>
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${activeDropdown === 'view' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'view' && (
            <div className="absolute top-11 left-0 w-64 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  toggleViewMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-blue-400" />
                  <span>2D 평면 / 3D 조감도 전환</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800">
                  {viewMode === '2D' ? '2D 평면' : '3D 조감'}
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
                  <span>드론 360° 궤도 선회 투어</span>
                </div>
                {isOrbiting && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 animate-pulse border border-emerald-700">
                    회전 중
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  toggleStreetView();
                  setActiveDropdown(null);
                }}
                className={`w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors ${
                  isStreetView ? 'bg-amber-600/25 border border-amber-400/60 text-amber-200' : ''
                }`}
                title="지상 눈높이(피치 80도) 1인칭 보행자 뷰 전환"
              >
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>1인칭 거리뷰 (스트리트 뷰)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {isStreetView ? '피치 80°' : '지상 눈높이'}
                </span>
              </button>

              {/* [3단계 신규] 🏙️ V-World 서울식 스카이라인 뷰 (Pitch 65° 저각 조감) */}
              <button
                onClick={() => {
                  const map = (window as any).__mapInstance;
                  if (map) {
                    const center = map.getCenter();
                    map.flyTo({
                      center: [center.lng, center.lat],
                      pitch: 65,
                      bearing: -35,
                      zoom: Math.max(16.0, map.getZoom()),
                      duration: 1500,
                      essential: true,
                    });
                  } else {
                    handleFlyToPreset([127.935, 37.359], 16.5, 65, -35);
                  }
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2.5 text-xs rounded-lg bg-gradient-to-r from-sky-900/70 to-emerald-900/70 hover:from-sky-800/90 hover:to-emerald-800/90 border border-sky-400/60 text-white font-bold flex items-center justify-between transition-all shadow-md group"
                title="V-World 서울 실사 사진처럼 낮은 각도(Pitch 65°)에서 도심 빌딩숲과 뒤쪽 강원도 산악 능선, 파란 하늘을 한 화면에 웅장하게 조감"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-sky-300 group-hover:scale-110 transition-transform" />
                  <span className="text-sky-100 font-semibold tracking-tight">🏙️ V-World 서울식 스카이라인 뷰</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-200 border border-sky-600/60">
                  Pitch 65°
                </span>
              </button>

              {/* [3단계 신규: 베이스맵 4종 즉시 전환] */}
              <div className="pt-1.5 pb-1 border-t border-[#24372a] space-y-1 px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  🗺️ 베이스맵 4종 전환
                </span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <button
                    onClick={() => {
                      setBaseMap('satellite');
                      setActiveDropdown(null);
                    }}
                    className={`p-1.5 rounded text-left transition-all font-semibold flex items-center gap-1.5 ${
                      baseMap === 'satellite'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500 font-bold'
                        : 'bg-[#101913] hover:bg-[#18281d] text-slate-300 border border-[#213526]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="truncate">V-World 항공실사</span>
                  </button>
                  <button
                    onClick={() => {
                      setBaseMap('google-satellite');
                      setActiveDropdown(null);
                    }}
                    className={`p-1.5 rounded text-left transition-all font-semibold flex items-center gap-1.5 ${
                      baseMap === 'google-satellite'
                        ? 'bg-cyan-950 text-cyan-200 border border-cyan-400 font-bold'
                        : 'bg-[#101913] hover:bg-[#18281d] text-slate-300 border border-[#213526]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    <span className="truncate">Google 위성</span>
                  </button>
                  <button
                    onClick={() => {
                      setBaseMap('clean');
                      setActiveDropdown(null);
                    }}
                    className={`p-1.5 rounded text-left transition-all font-semibold flex items-center gap-1.5 ${
                      baseMap === 'clean'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500 font-bold'
                        : 'bg-[#101913] hover:bg-[#18281d] text-slate-300 border border-[#213526]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="truncate">V-World 일반</span>
                  </button>
                  <button
                    onClick={() => {
                      setBaseMap('google-roadmap');
                      setActiveDropdown(null);
                    }}
                    className={`p-1.5 rounded text-left transition-all font-semibold flex items-center gap-1.5 ${
                      baseMap === 'google-roadmap'
                        ? 'bg-cyan-950 text-cyan-200 border border-cyan-400 font-bold'
                        : 'bg-[#101913] hover:bg-[#18281d] text-slate-300 border border-[#213526]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="truncate">Google 로드맵</span>
                  </button>
                </div>
              </div>

              {/* 시점 프리셋 */}
              <div className="pt-1 border-t border-[#24372a] space-y-1 px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  시점 프리셋 (주요 거점)
                </span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <button
                    onClick={() => handleFlyToPreset([127.925, 37.342], 16.5, 65, 35)}
                    className="p-1.5 rounded bg-[#101913] hover:bg-[#18281d] text-emerald-300 font-semibold border border-[#213526] text-left truncate"
                  >
                    📍 원주 1군지사
                  </button>
                  <button
                    onClick={() => handleFlyToPreset([127.728, 37.885], 16.0, 60, 45)}
                    className="p-1.5 rounded bg-[#101913] hover:bg-[#18281d] text-emerald-300 font-semibold border border-[#213526] text-left truncate"
                  >
                    📍 춘천 캠프페이지
                  </button>
                  <button
                    onClick={() => handleFlyToPreset([128.986, 37.732], 15.5, 55, 60)}
                    className="p-1.5 rounded bg-[#101913] hover:bg-[#18281d] text-cyan-300 font-semibold border border-[#213526] text-left truncate"
                  >
                    🌊 강릉 안인진
                  </button>
                  <button
                    onClick={() => handleFlyToPreset([127.313, 38.286], 15.0, 50, 0)}
                    className="p-1.5 rounded bg-[#101913] hover:bg-[#18281d] text-amber-300 font-semibold border border-[#213526] text-left truncate"
                  >
                    🛡️ 철원 접경 거점
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  toggleSunPlaying();
                  setActiveDropdown(null);
                }}
                className={`w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors ${
                  isSunPlaying ? 'bg-amber-600/30 border border-amber-400/80 text-amber-200 shadow-md ring-1 ring-amber-400/40' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sun className={`w-3.5 h-3.5 text-amber-400 ${isSunPlaying ? 'animate-spin' : ''}`} />
                  <span>주야간 일조 시뮬레이션</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                  {isSunPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                  {isSunPlaying ? '재생 중' : `${sunHour.toFixed(1)}시`}
                </span>
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

        {/* [📐 공간 & 토목분석] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('analysis')}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeDropdown === 'analysis' || isViewshedMode || isMeasureMode || cutFill.enabled || showSlopeAnalysis || waterLevel.enabled
                ? 'bg-emerald-600/30 border-emerald-400/80 text-emerald-200 shadow-md ring-1 ring-emerald-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="지형 횡단 고도 프로파일, 3단 경사도, 토공량, 수위 침수, 거리 측정"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>공간분석</span><span className="hidden xl:inline"> & 토목</span>
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${activeDropdown === 'analysis' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'analysis' && (
            <div className="absolute top-11 left-0 w-72 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setShowTerrainProfile(true);
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>지형 횡단 고도 프로파일</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">모달 분석</span>
              </button>

              <button
                onClick={() => {
                  toggleSlopeAnalysis();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>3단 경사도 분석 격자 (15°/25°)</span>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  showSlopeAnalysis ? 'bg-amber-950 text-amber-300 border border-amber-700' : 'bg-slate-800 text-slate-400'
                }`}>
                  {showSlopeAnalysis ? 'ON' : 'OFF'}
                </span>
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
                  <span>3D 토공량(Cut & Fill) 계산기</span>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  cutFill.enabled ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-slate-800 text-slate-400'
                }`}>
                  {cutFill.enabled ? `EL.${cutFill.targetElevation}m` : 'OFF'}
                </span>
              </button>

              <button
                onClick={() => {
                  toggleWaterLevel();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Waves className="w-3.5 h-3.5 text-blue-400" />
                  <span>가상 수위·침수 시뮬레이터</span>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  waterLevel.enabled ? 'bg-blue-950 text-blue-300 border border-blue-700' : 'bg-slate-800 text-slate-400'
                }`}>
                  {waterLevel.enabled ? `+${waterLevel.elevation}m` : 'OFF'}
                </span>
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
                  <span>다각형 면적·경사거리 측정 (줄자)</span>
                </div>
                {isMeasureMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">
                    측정 중
                  </span>
                )}
              </button>

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
                  <span>3D 가시선(LOS) 광선 추적</span>
                </div>
                {losAnalysis.isActive && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse">
                    {losAnalysis.step === 'pick_a' ? 'A점' : 'B점'}
                  </span>
                )}
                {losAnalysis.result && !losAnalysis.isActive && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-600">
                    완료
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  const map = (window as any).__geobrief_map || (window as any).map;
                  const center = map ? map.getCenter() : { lng: 127.9358, lat: 37.3592 };
                  window.dispatchEvent(
                    new CustomEvent('gangwon-search-select', {
                      detail: {
                        coords: [center.lng, center.lat],
                        title: '원주 1군지사 군 유휴부지 및 배후 필지',
                        category: '군사시설 유휴부지 및 공공복합개발 대상지',
                        levels: 15,
                        height: 48,
                        regionId: selectedRegionId || 'wonju',
                      },
                    })
                  );
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  <span>토지가격 & 맞춤형 보상방안 (3-Tier)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  원클릭 산정
                </span>
              </button>

              {/* V-World 3D 건물 테마 스타일러 */}
              <div className="pt-2 mt-1 border-t border-[#24372a] space-y-1.5 px-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    V-World 건물 스타일러
                  </span>
                  <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-mono">
                    {buildingTheme === 'photorealistic' ? '실사 포토' : buildingTheme === 'landuse' ? '용도별' : '층수·높이'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBuildingTheme('photorealistic');
                      setActiveDropdown(null);
                    }}
                    className={`px-1.5 py-1.5 text-[10.5px] rounded-lg font-medium flex flex-col items-center justify-center transition-all ${
                      buildingTheme === 'photorealistic'
                        ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950/80 ring-1 ring-emerald-400'
                        : 'bg-[#18231c] text-slate-300 hover:text-white hover:bg-[#203126]'
                    }`}
                  >
                    <span>실사 포토</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBuildingTheme('landuse');
                      setActiveDropdown(null);
                    }}
                    className={`px-1.5 py-1.5 text-[10.5px] rounded-lg font-medium flex flex-col items-center justify-center transition-all ${
                      buildingTheme === 'landuse'
                        ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-950/80 ring-1 ring-amber-400'
                        : 'bg-[#18231c] text-slate-300 hover:text-white hover:bg-[#203126]'
                    }`}
                  >
                    <span>용도별</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBuildingTheme('height_spectrum');
                      setActiveDropdown(null);
                    }}
                    className={`px-1.5 py-1.5 text-[10.5px] rounded-lg font-medium flex flex-col items-center justify-center transition-all ${
                      buildingTheme === 'height_spectrum'
                        ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-950/80 ring-1 ring-cyan-400'
                        : 'bg-[#18231c] text-slate-300 hover:text-white hover:bg-[#203126]'
                    }`}
                  >
                    <span>층수·높이</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* [🎯 전술 & 주석작도] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('tactical')}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeDropdown === 'tactical' || isViewshedMode || bufferRings.r500m || bufferRings.r1km || bufferRings.r2km || isPinMode || isArrowMode || uavFlight.isActive || isSensorPlacementMode
                ? 'bg-cyan-600/30 border-cyan-400/80 text-cyan-200 shadow-md ring-1 ring-cyan-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="360도 가시권, 반경 버퍼링, 군사분계선, 시설물 배치, 전술 주석"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>전술</span><span className="hidden xl:inline"> & 작도</span>
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${activeDropdown === 'tactical' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'tactical' && (
            <div className="absolute top-11 left-0 w-72 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  toggleViewshedMode();
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-teal-400" />
                  <span>360° 레이캐스팅 3D 가시권 시뮬레이션</span>
                </div>
                {isViewshedMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-700 animate-pulse">
                    클릭 측정
                  </span>
                )}
              </button>

              {/* 반경 버퍼 링 */}
              <div className="p-1.5 bg-[#101813] rounded-lg border border-[#233527] space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  반경 분석 버퍼 링
                </span>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => toggleBufferRing('r500m')}
                    className={`py-1 text-[10px] font-bold rounded border transition-all ${
                      bufferRings.r500m
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-[#18231c] border-[#29382c] text-slate-300 hover:text-white'
                    }`}
                  >
                    500m 링
                  </button>
                  <button
                    onClick={() => toggleBufferRing('r1km')}
                    className={`py-1 text-[10px] font-bold rounded border transition-all ${
                      bufferRings.r1km
                        ? 'bg-amber-600 border-amber-400 text-white'
                        : 'bg-[#18231c] border-[#29382c] text-slate-300 hover:text-white'
                    }`}
                  >
                    1km 링
                  </button>
                  <button
                    onClick={() => toggleBufferRing('r2km')}
                    className={`py-1 text-[10px] font-bold rounded border transition-all ${
                      bufferRings.r2km
                        ? 'bg-cyan-600 border-cyan-400 text-white'
                        : 'bg-[#18231c] border-[#29382c] text-slate-300 hover:text-white'
                    }`}
                  >
                    2km 링
                  </button>
                </div>
              </div>

              {/* 군사분계선/민통선 레이어 */}
              <button
                onClick={() => {
                  setBorderSecurityVisible(!borderSecurityVisible);
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  <span>군사분계선(MDL) / 민통선(CCL) 레이어</span>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  borderSecurityVisible ? 'bg-rose-950 text-rose-300 border border-rose-700' : 'bg-slate-800 text-slate-400'
                }`}>
                  {borderSecurityVisible ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* 3D 시설물 배치 기즈모 프리셋 */}
              <div className="p-1.5 bg-[#101813] rounded-lg border border-[#233527] space-y-1">
                <span className="text-[10px] font-bold text-cyan-300 flex items-center justify-between">
                  <span>3D 시설물 즉시 배치 ({placedFacilities.length}개소)</span>
                </span>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  {(Object.keys(FACILITY_PRESETS) as FacilityPresetId[]).slice(0, 4).map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        addPlacedFacility(id);
                        setActiveDropdown(null);
                      }}
                      className="p-1 rounded bg-[#18241c] hover:bg-[#223327] text-slate-200 border border-[#273a2c] text-left truncate flex items-center gap-1"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FACILITY_PRESETS[id].color }} />
                      <span className="truncate">{FACILITY_PRESETS[id].name}</span>
                    </button>
                  ))}
                </div>
              </div>

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
                {isSensorPlacementMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-900 text-teal-200 animate-pulse">
                    배치 중
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* [💾 도면 & 내보내기] 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => handleDropdownToggle('export')}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer ${
              activeDropdown === 'export' || showTitleBlock || slidePackProgress.isExporting
                ? 'bg-amber-600/30 border-amber-400/80 text-amber-200 shadow-md ring-1 ring-amber-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="도면 표제란, PPTX 슬라이드 팩 저장, .geobrief 프로젝트 백업"
          >
            <FileDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>내보내기</span><span className="hidden xl:inline"> & 도면</span>
            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${activeDropdown === 'export' ? 'rotate-180' : ''}`} />
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
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('geobrief-export-png'));
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
                title="3D 캔버스, 표제란, 범례가 포함된 고해상도 브리핑 보고서 PNG 즉시 저장"
              >
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-teal-400" />
                  <span>고해상도 브리핑 이미지 (PNG)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                  PNG 저장
                </span>
              </button>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('geobrief-export-pdf'));
                  setActiveDropdown(null);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#223326] text-slate-200 flex items-center justify-between transition-colors"
                title="도정·국방 브리핑 보고서 인쇄 및 PDF 문서 출력"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>브리핑 보고서 인쇄 및 PDF</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  PDF 인쇄
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

      {/* 3. 우측: [UI Astro-Checked v2.0] + [✨ 3D 디테일: 실사(LOD2+)] + [🖨️ 도면 저장] 버튼 */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0 ml-auto">
        {/* [UI Astro-Checked v2.0 배지] - 초광폭 화면에서만 표시 */}
        <span className="hidden 2xl:inline-flex items-center px-2 py-1 rounded-lg text-[10.5px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-400 shadow-sm whitespace-nowrap ring-1 ring-cyan-400/30">
          [UI Astro-Checked v2.0]
        </span>

        {/* [✨ 3D 디테일: 상시 토글 버튼] */}
        <button
          type="button"
          onClick={toggleDetail3DMode}
          className="px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500/80 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-200 shadow-emerald-950/40 ring-1 ring-emerald-500/50 flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap shadow-sm transition-all cursor-pointer group"
          title="클릭하여 3D 디테일 모드(경량 네이티브 / 실감 LOD2+)를 원클릭 전환합니다"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
          <span className="hidden md:inline text-slate-300 font-medium">3D:</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
            detail3DMode === 'lod2'
              ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50'
              : 'bg-blue-500/25 text-blue-300 border-blue-500/50'
          }`}>
            {renderMode3D === 'facade'
              ? '실사 트윈'
              : renderMode3D === 'tiles3d'
              ? '3D 타일셋'
              : '클린 화이트'}
          </span>
        </button>

        {/* [🖨️ 도면 저장]: 프로젝트 보관함 및 클라우드/로컬 저장 */}
        <button
          onClick={() => setIsProjectModalOpen(true)}
          className="px-2 sm:px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/60 shadow-md shadow-emerald-950/60 flex items-center space-x-1 sm:space-x-1.5 transition-all whitespace-nowrap ring-1 ring-emerald-400/30 cursor-pointer"
          title="클라우드 및 로컬 프로젝트 보관함 열기 및 도면 저장"
        >
          <Save className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
          <span className="hidden sm:inline">도면 </span><span>저장</span>
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
