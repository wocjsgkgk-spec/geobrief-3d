'use client';

import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { ProjectManagerModal } from '@/components/Modal/ProjectManagerModal';
import { RenderMode3D } from '@/types/map';

type DropdownCategory = 'view' | 'analysis' | 'tactical' | 'export' | null;

export const Header: React.FC = () => {
  const {
    metadata,
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
  } = useMapStore();

  const [activeDropdown, setActiveDropdown] = useState<DropdownCategory>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

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
    if (renderMode3D === 'facade') {
      setRenderMode3D('tiles3d');
    } else if (renderMode3D === 'tiles3d') {
      setRenderMode3D('native');
    } else {
      setRenderMode3D('facade');
    }
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

      {/* 중앙: 4대 카테고리 통합 드롭다운 툴바 */}
      <div ref={toolbarRef} className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 mx-2 relative">
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
              activeDropdown === 'analysis' || isViewshedMode || isMeasureMode || cutFill.enabled
                ? 'bg-emerald-600/30 border-emerald-400/80 text-emerald-200 shadow-md ring-1 ring-emerald-500/40'
                : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
            }`}
            title="3D 가시권(사계), 줄자 실측, 3D 토공량(Cut & Fill), 지형 횡단면"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>공간 & 토목분석</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'analysis' ? 'rotate-180' : ''}`} />
          </button>

          {activeDropdown === 'analysis' && (
            <div className="absolute top-11 left-0 w-64 bg-[#141d17]/95 backdrop-blur-xl border border-[#2a3e31] rounded-xl shadow-2xl p-1.5 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-100">
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
              ? '3D 타일셋'
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
