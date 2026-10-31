'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Mountain,
  Menu,
  Box,
  Camera,
  Printer,
  ChevronDown,
  Layers,
  MapPin,
  FileDown,
  Presentation,
  Check,
  Building2,
  ShieldAlert,
  Compass,
  Video,
  Ruler,
  Maximize2,
  Crosshair,
  TrendingUp,
  Activity,
  Waves,
  Eye,
  CircleDot,
  PlusCircle,
  Trash2,
  Sun,
  Shield,
  Navigation,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import {
  GANGWON_18_MILITARY_SITES,
  getGangwon18MilitarySiteById,
  GangwonSubregionType,
} from '@/constants/gangwon18MilitarySites';
import {
  GANGWON_18_REGIONS,
  getGangwonRegionByIdOrName,
} from '@/constants/gangwon18Regions';
import { GangwonUnifiedSearch } from '@/components/Search/GangwonUnifiedSearch';
import { ProjectManagerModal } from '@/components/Modal/ProjectManagerModal';

export const Header: React.FC = () => {
  const {
    selectedIdleSiteId,
    selectIdleSite,
    selectedRegionId,
    selectRegion,
    viewMode,
    toggleViewMode,
    triggerSlidePackExport,
    toggleMobilePanel,
    isOrbiting,
    toggleOrbiting,
    isStreetView,
    toggleStreetView,
    setSunHour,
    isMeasureMode,
    measureSubtype,
    toggleMeasureMode,
    setMeasureSubtype,
    setShowTerrainProfile,
    showSlopeAnalysis,
    toggleSlopeAnalysis,
    cutFill,
    toggleCutFill,
    waterLevel,
    toggleWaterLevel,
    isViewshedMode,
    toggleViewshedMode,
    bufferRings,
    toggleBufferRing,
    addPlacedFacility,
    clearPlacedFacilities,
  } = useMapStore();

  // 드롭다운 5종 상태 관리
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const [isMeasureDropdownOpen, setIsMeasureDropdownOpen] = useState(false);
  const [isTacticalDropdownOpen, setIsTacticalDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  // 대상지 선택 탭: 군 유휴부지 거점 vs 18개 시·군
  const [siteTab, setSiteTab] = useState<'hubs' | 'regions'>('hubs');

  const siteDropdownRef = useRef<HTMLDivElement>(null);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  const measureDropdownRef = useRef<HTMLDivElement>(null);
  const tacticalDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // 현재 선택된 대상 명칭 단일화 판정
  const currentMilitarySite = selectedIdleSiteId
    ? getGangwon18MilitarySiteById(selectedIdleSiteId)
    : null;
  const currentRegion = getGangwonRegionByIdOrName(selectedRegionId || 'wonju');

  const currentDisplayName = currentMilitarySite
    ? `🛡️ ${currentMilitarySite.shortName}`
    : `📍 ${currentRegion?.name || '원주시'}`;

  // 모든 드롭다운 닫기
  const closeAllDropdowns = () => {
    setIsSiteDropdownOpen(false);
    setIsViewDropdownOpen(false);
    setIsMeasureDropdownOpen(false);
    setIsTacticalDropdownOpen(false);
    setIsExportDropdownOpen(false);
  };

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(target)) {
        setIsSiteDropdownOpen(false);
      }
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(target)) {
        setIsViewDropdownOpen(false);
      }
      if (measureDropdownRef.current && !measureDropdownRef.current.contains(target)) {
        setIsMeasureDropdownOpen(false);
      }
      if (tacticalDropdownRef.current && !tacticalDropdownRef.current.contains(target)) {
        setIsTacticalDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(target)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-12 bg-[#0c120e]/95 backdrop-blur-md border-b border-[#1e2a22] px-3 sm:px-4 flex items-center justify-between z-30 select-none">
      {/* ===================================================================== */}
      {/* 1. 좌측: 브랜드 로고 & 모바일 메뉴 버튼 */}
      {/* ===================================================================== */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        <button
          onClick={toggleMobilePanel}
          className="md:hidden p-1.5 rounded-lg bg-[#152019] border border-[#233529] text-emerald-400 hover:text-white transition-colors"
          title="제어 패널 열기"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 shadow-sm flex-shrink-0">
            <Mountain className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm tracking-wide text-slate-100 whitespace-nowrap">
            GeoBrief <span className="text-emerald-400 font-black">3D</span>
          </span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. 중앙 [1] & [2]: 🔍 통합 검색창 & 📍 분석 대상지 선택 */}
      {/* ===================================================================== */}
      <div className="flex items-center space-x-2 flex-1 max-w-xl mx-2 sm:mx-4 min-w-0">
        {/* [1) 🔍 통합 검색] */}
        <div className="flex-1 min-w-[120px] max-w-xs">
          <GangwonUnifiedSearch />
        </div>

        {/* [2) 📍 분석 대상지 선택 (강원 18개 시·군 및 군 유휴부지 전체)] */}
        <div ref={siteDropdownRef} className="relative flex-shrink-0">
          <button
            onClick={() => {
              const next = !isSiteDropdownOpen;
              closeAllDropdowns();
              setIsSiteDropdownOpen(next);
            }}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm ${
              isSiteDropdownOpen
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50'
                : 'bg-[#152019] border-[#25392c] text-emerald-300 hover:text-white hover:bg-[#1c2c22]'
            }`}
            title="강원 18개 시·군 및 군 유휴부지 대상지 선택 (실시간 브리핑 카드 동기화)"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="max-w-[100px] sm:max-w-[130px] truncate text-slate-100">
              {currentDisplayName}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-emerald-400 transition-transform duration-150 ${
                isSiteDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isSiteDropdownOpen && (
            <div className="absolute top-10 left-0 w-80 sm:w-96 bg-[#0c1410]/98 backdrop-blur-2xl border border-emerald-500/40 rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* 탭 헤더: 군 유휴부지 거점 vs 18개 시·군 행정구역 */}
              <div className="flex rounded-lg bg-[#070c09] p-1 mb-2 border border-[#1b2b20]">
                <button
                  type="button"
                  onClick={() => setSiteTab('hubs')}
                  className={`flex-1 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                    siteTab === 'hubs'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  <span>군 유휴부지 (18대 거점)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSiteTab('regions')}
                  className={`flex-1 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                    siteTab === 'regions'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>18개 시·군 행정구역</span>
                </button>
              </div>

              {/* 거점 목록 */}
              <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {siteTab === 'hubs' ? (
                  (['영서 중·남부권', '북부 접경권', '동해안 및 태백권'] as GangwonSubregionType[]).map((subreg) => {
                    const sitesInSub = GANGWON_18_MILITARY_SITES.filter((s) => s.subregion === subreg);
                    return (
                      <div key={subreg} className="bg-[#101913] rounded-lg p-1.5 border border-[#1b2b20]">
                        <div className="px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-400 flex items-center justify-between mb-1">
                          <span>• {subreg}</span>
                          <span className="text-[9.5px] font-mono text-slate-400">{sitesInSub.length}개소</span>
                        </div>
                        <div className="space-y-1">
                          {sitesInSub.map((site) => {
                            const isSelected = selectedIdleSiteId === site.id;
                            return (
                              <button
                                key={site.id}
                                type="button"
                                onClick={() => {
                                  selectIdleSite(site.id);
                                  setIsSiteDropdownOpen(false);
                                }}
                                className={`w-full px-2 py-1.5 text-xs rounded-lg text-left transition-all flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 shadow-inner'
                                    : 'hover:bg-[#18271e] text-slate-200 border border-transparent'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-[#142318] text-emerald-300 border border-[#223a29]">
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
                                  <span className="text-emerald-400 font-bold">
                                    {site.areaPyeong.toLocaleString()}평
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
                  })
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {GANGWON_18_REGIONS.map((reg) => {
                      const isSelected = !selectedIdleSiteId && selectedRegionId === reg.id;
                      return (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => {
                            selectRegion(reg.id);
                            setIsSiteDropdownOpen(false);
                          }}
                          className={`px-2.5 py-2 text-xs rounded-lg text-left transition-all border ${
                            isSelected
                              ? 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold ring-1 ring-emerald-400/40'
                              : 'bg-[#101913] hover:bg-[#18271e] text-slate-200 border-[#1b2b20]'
                          }`}
                        >
                          <div className="font-bold text-slate-100 flex items-center justify-between">
                            <span>{reg.name}</span>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{reg.subregion}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. 우측: 3대 전문가용 분석 드롭다운 & 도면 내보내기 */}
      {/* ===================================================================== */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
        {/* [3) 🎥 뷰 & 시네마틱 드롭다운] */}
        <div ref={viewDropdownRef} className="relative">
          <button
            onClick={() => {
              const next = !isViewDropdownOpen;
              closeAllDropdowns();
              setIsViewDropdownOpen(next);
            }}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 shadow-sm ${
              isViewDropdownOpen || isOrbiting || isStreetView
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'bg-[#152019] border-[#25392c] text-slate-300 hover:text-white hover:bg-[#1c2c22]'
            }`}
            title="2D/3D 전환, 드론 궤도 선회, 거리 주행 뷰, 일조 시간 프리셋"
          >
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">뷰 & 시네마틱</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isViewDropdownOpen && (
            <div className="absolute top-10 right-0 w-56 bg-[#0c1410]/98 backdrop-blur-2xl border border-cyan-500/40 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                카메라 뷰 & 시뮬레이션
              </div>
              {/* 2D/3D 토글 */}
              <button
                onClick={() => {
                  toggleViewMode();
                  setIsViewDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{viewMode === '2D' ? '3D 입체 조감 뷰' : '2D 정사 평면 뷰'}</span>
                </div>
                <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {viewMode}
                </span>
              </button>

              {/* 드론 360 궤도 선회 */}
              <button
                onClick={() => {
                  toggleOrbiting();
                  setIsViewDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Compass className={`w-3.5 h-3.5 ${isOrbiting ? 'text-amber-400 animate-spin' : 'text-slate-400'}`} />
                  <span>드론 360° 궤도 선회</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${isOrbiting ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-400'}`}>
                  {isOrbiting ? '회전 중' : '선회 시작'}
                </span>
              </button>

              {/* 거리 주행 뷰 */}
              <button
                onClick={() => {
                  toggleStreetView();
                  setIsViewDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Navigation className={`w-3.5 h-3.5 ${isStreetView ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>1인칭 거리 보행 뷰</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${isStreetView ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {isStreetView ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="h-px bg-[#1e2a22] my-1" />
              <div className="px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                일조 시간 프리셋
              </div>
              <div className="grid grid-cols-2 gap-1 px-1">
                <button
                  onClick={() => {
                    setSunHour(8);
                    setIsViewDropdownOpen(false);
                  }}
                  className="px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 text-left flex items-center gap-1.5"
                >
                  <Sun className="w-3 h-3 text-amber-400" />
                  <span>아침 (08시)</span>
                </button>
                <button
                  onClick={() => {
                    setSunHour(12);
                    setIsViewDropdownOpen(false);
                  }}
                  className="px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 text-left flex items-center gap-1.5"
                >
                  <Sun className="w-3 h-3 text-amber-300" />
                  <span>정오 (12시)</span>
                </button>
                <button
                  onClick={() => {
                    setSunHour(15);
                    setIsViewDropdownOpen(false);
                  }}
                  className="px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 text-left flex items-center gap-1.5"
                >
                  <Sun className="w-3 h-3 text-orange-400" />
                  <span>오후 (15시)</span>
                </button>
                <button
                  onClick={() => {
                    setSunHour(18);
                    setIsViewDropdownOpen(false);
                  }}
                  className="px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 text-left flex items-center gap-1.5"
                >
                  <Sun className="w-3 h-3 text-rose-400" />
                  <span>석양 (18시)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* [4) 📐 공간 & 토목분석 드롭다운] */}
        <div ref={measureDropdownRef} className="relative">
          <button
            onClick={() => {
              const next = !isMeasureDropdownOpen;
              closeAllDropdowns();
              setIsMeasureDropdownOpen(next);
            }}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 shadow-sm ${
              isMeasureDropdownOpen || isMeasureMode || cutFill.enabled || waterLevel.enabled || showSlopeAnalysis
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'bg-[#152019] border-[#25392c] text-slate-300 hover:text-white hover:bg-[#1c2c22]'
            }`}
            title="다각형 면적/거리 측정, 지형 단면도, 3단 경사도, 토공량, 수위 시뮬레이션"
          >
            <Ruler className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">공간 & 토목분석</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isMeasureDropdownOpen && (
            <div className="absolute top-10 right-0 w-64 bg-[#0c1410]/98 backdrop-blur-2xl border border-emerald-500/40 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                정량 실측 & 토목 분석
              </div>

              {/* 다각형 면적 측정 */}
              <button
                onClick={() => {
                  if (!isMeasureMode || measureSubtype !== 'area') {
                    if (!isMeasureMode) toggleMeasureMode();
                    setMeasureSubtype('area');
                  } else {
                    toggleMeasureMode();
                  }
                  setIsMeasureDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>다각형 면적(㎡/평) 측정</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${isMeasureMode && measureSubtype === 'area' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {isMeasureMode && measureSubtype === 'area' ? '측정 중' : '시작'}
                </span>
              </button>

              {/* 거리 측정 */}
              <button
                onClick={() => {
                  if (!isMeasureMode || measureSubtype !== 'distance') {
                    if (!isMeasureMode) toggleMeasureMode();
                    setMeasureSubtype('distance');
                  } else {
                    toggleMeasureMode();
                  }
                  setIsMeasureDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Ruler className="w-3.5 h-3.5 text-emerald-400" />
                  <span>직선·구간 거리 측정</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${isMeasureMode && measureSubtype === 'distance' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {isMeasureMode && measureSubtype === 'distance' ? '측정 중' : '시작'}
                </span>
              </button>

              {/* 지형 횡단 고도 프로파일 단면도 */}
              <button
                onClick={() => {
                  setShowTerrainProfile(true);
                  setIsMeasureDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                  <span>지형 횡단 단면도 (Profile)</span>
                </div>
                <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                  모달
                </span>
              </button>

              {/* 3단 경사도 분석 */}
              <button
                onClick={() => {
                  toggleSlopeAnalysis();
                  setIsMeasureDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>3단 경사도 분석 (15°/25°)</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${showSlopeAnalysis ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-400'}`}>
                  {showSlopeAnalysis ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="h-px bg-[#1e2a22] my-1" />

              {/* 정밀 토공량 계산기 */}
              <button
                onClick={() => {
                  toggleCutFill();
                  setIsMeasureDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-yellow-400" />
                  <span>토공량 (절토·성토 ㎥) 계산기</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${cutFill.enabled ? 'bg-yellow-950 text-yellow-300 border border-yellow-800' : 'bg-slate-800 text-slate-400'}`}>
                  {cutFill.enabled ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* 가상 수위·침수 시뮬레이션 */}
              <button
                onClick={() => {
                  toggleWaterLevel();
                  setIsMeasureDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Waves className="w-3.5 h-3.5 text-blue-400" />
                  <span>가상 수위·침수 시뮬레이션</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${waterLevel.enabled ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-slate-800 text-slate-400'}`}>
                  {waterLevel.enabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* [5) 🎯 전술 & 개발작도 드롭다운] */}
        <div ref={tacticalDropdownRef} className="relative">
          <button
            onClick={() => {
              const next = !isTacticalDropdownOpen;
              closeAllDropdowns();
              setIsTacticalDropdownOpen(next);
            }}
            className={`px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 shadow-sm ${
              isTacticalDropdownOpen || isViewshedMode || bufferRings.r500m || bufferRings.r1km || bufferRings.r2km
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40'
                : 'bg-[#152019] border-[#25392c] text-slate-300 hover:text-white hover:bg-[#1c2c22]'
            }`}
            title="360° 가시권 분석, 반경 버퍼링, 3D 신규 시설물 배치"
          >
            <Crosshair className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">전술 & 개발작도</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isTacticalDropdownOpen && (
            <div className="absolute top-10 right-0 w-64 bg-[#0c1410]/98 backdrop-blur-2xl border border-amber-500/40 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                가시권 & 반경 분석
              </div>

              {/* 360 가시권 분석 */}
              <button
                onClick={() => {
                  toggleViewshedMode();
                  setIsTacticalDropdownOpen(false);
                }}
                className="w-full px-2 py-1.5 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>360° 레이캐스팅 조망권(가시권)</span>
                </div>
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${isViewshedMode ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-400'}`}>
                  {isViewshedMode ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* 반경 버퍼링 (500m/1km/2km) */}
              <div className="bg-[#121c15] p-1.5 rounded-lg border border-[#203024] space-y-1">
                <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between">
                  <span>반경 분석 버퍼 링:</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => toggleBufferRing('r500m')}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition-all border ${
                      bufferRings.r500m
                        ? 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-[#18261e] text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    500m
                  </button>
                  <button
                    onClick={() => toggleBufferRing('r1km')}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition-all border ${
                      bufferRings.r1km
                        ? 'bg-amber-600 text-white border-amber-400'
                        : 'bg-[#18261e] text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    1.0km
                  </button>
                  <button
                    onClick={() => toggleBufferRing('r2km')}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition-all border ${
                      bufferRings.r2km
                        ? 'bg-indigo-600 text-white border-indigo-400'
                        : 'bg-[#18261e] text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    2.0km
                  </button>
                </div>
              </div>

              <div className="h-px bg-[#1e2a22] my-1" />
              <div className="px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                3D 신규 시설물 배치 기즈모
              </div>
              <div className="space-y-1 px-1">
                <button
                  onClick={() => {
                    addPlacedFacility('defense_rd_tower');
                    setIsTacticalDropdownOpen(false);
                  }}
                  className="w-full px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 text-cyan-400" />
                    <span>복합 국방 R&D 타워</span>
                  </div>
                  <span className="text-[9.5px] font-mono text-cyan-300">8F</span>
                </button>
                <button
                  onClick={() => {
                    addPlacedFacility('barracks_hq');
                    setIsTacticalDropdownOpen(false);
                  }}
                  className="w-full px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-emerald-400" />
                    <span>표준 병영 막사/행정동</span>
                  </div>
                  <span className="text-[9.5px] font-mono text-emerald-300">2F</span>
                </button>
                <button
                  onClick={() => {
                    addPlacedFacility('logistics_depot');
                    setIsTacticalDropdownOpen(false);
                  }}
                  className="w-full px-2 py-1 text-[11px] rounded bg-[#131f17] hover:bg-[#1c2c21] text-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-amber-400" />
                    <span>전략 군수 물류 데포</span>
                  </div>
                  <span className="text-[9.5px] font-mono text-amber-300">창고</span>
                </button>
                <button
                  onClick={() => {
                    clearPlacedFacilities();
                    setIsTacticalDropdownOpen(false);
                  }}
                  className="w-full px-2 py-1 text-[10px] rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 flex items-center justify-center gap-1 border border-rose-800/40"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>배치 시설물 전체 삭제</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* [6) 💾 도면 & 내보내기 드롭다운] */}
        <div ref={exportDropdownRef} className="relative">
          <button
            onClick={() => {
              const next = !isExportDropdownOpen;
              closeAllDropdowns();
              setIsExportDropdownOpen(next);
            }}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/60 shadow-md flex items-center space-x-1.5 transition-all whitespace-nowrap"
            title="고해상도 도면 캡처(PNG), 인쇄(PDF), 브리핑 슬라이드(PPTX) 내보내기"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-100" />
            <span className="hidden sm:inline">도면 저장</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-emerald-200 transition-transform ${
                isExportDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isExportDropdownOpen && (
            <div className="absolute top-10 right-0 w-56 bg-[#0c1410]/98 backdrop-blur-2xl border border-emerald-500/40 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* 고해상도 PNG 캡처 */}
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('geobrief-export-png'));
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-teal-400" />
                  <span className="font-semibold">고해상도 도면 (PNG)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                  PNG
                </span>
              </button>

              {/* PDF 문서 출력 */}
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('geobrief-export-pdf'));
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold">브리핑 보고서 (PDF)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  PDF
                </span>
              </button>

              {/* PPTX 슬라이드 */}
              <button
                onClick={() => {
                  triggerSlidePackExport();
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Presentation className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold">발표 슬라이드 (.pptx)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  PPTX
                </span>
              </button>

              <div className="h-px bg-[#1e2a22] my-1" />

              {/* 프로젝트 저장/불러오기 모달 */}
              <button
                onClick={() => {
                  setIsProjectModalOpen(true);
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center gap-2 transition-colors"
              >
                <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold">프로젝트 파일 백업/복원</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 프로젝트 관리 모달 */}
      <ProjectManagerModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />
    </header>
  );
};
