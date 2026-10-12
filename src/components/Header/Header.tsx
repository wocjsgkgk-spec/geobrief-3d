'use client';

import React, { useState, useRef } from 'react';
import {
  Download,
  Save,
  RefreshCw,
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
  Plane,
  Boxes,
  Film,
  Video,
  Sparkles,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { ProjectManagerModal } from '@/components/Modal/ProjectManagerModal';

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
    // [신규] 국방·보안 감시 센서 콘 & 정찰 드론(UAV)
    surveillanceSensors,
    isSensorPlacementMode,
    toggleSensorPlacementMode,
    uavFlight,
    toggleUavFlight,
    // [3D 토공량(절토·성토 Cut & Fill) 산출 엔진]
    cutFill,
    toggleCutFill,
    // [4단계 신규: 3D 시네마틱 카메라 패스 및 녹화 엔진]
    cinematicFlight,
    setCinematicBuilderOpen,
    // [3D 디테일 LOD 토글 스위치: 일반(LOD1) / 실감(LOD2+)]
    detail3DMode,
    toggleDetail3DMode,
  } = useMapStore();

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportGeobrief = () => {
    try {
      exportProjectFile();
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
    }
  };

  const handleNewProject = () => {
    if (
      window.confirm(
        '작성 중이던 부지 구역, 버퍼 분석, 메타데이터를 초기화하고 새 프로젝트를 시작하시겠습니까?'
      )
    ) {
      resetProject();
    }
  };

  return (
    <header className="h-14 bg-[#121714] border-b border-[#242f27] px-3 sm:px-4 flex items-center justify-between z-20 select-none overflow-x-auto no-scrollbar">
      {/* Brand & Project Info */}
      <div className="flex items-center space-x-2.5 sm:space-x-3 flex-shrink-0">
        {/* 모바일 전용 분석 패널 서랍 토글 버튼 */}
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
            <span className="hidden lg:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800/90 border border-slate-600/70 text-slate-200 whitespace-nowrap">
              기획조정실 브리핑 모드
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate max-w-[140px] sm:max-w-xs md:max-w-md">
            {metadata.title}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 ml-2">
        {/* 새 프로젝트 버튼 */}
        <button
          onClick={handleNewProject}
          className="px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1b221e] border border-[#2f3b33] text-slate-300 hover:text-white hover:bg-rose-950/60 hover:border-rose-700/60 flex items-center space-x-1 sm:space-x-1.5 transition-all whitespace-nowrap"
          title="작업 내용을 초기화하고 새 프로젝트 시작"
        >
          <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">새 프로젝트</span>
        </button>

        {/* 2D 평면 / 3D 입체 수동 토글 버튼 */}
        <button
          onClick={toggleViewMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            viewMode === '2D'
              ? 'bg-blue-600/40 border-blue-400 text-blue-200 shadow-md ring-1 ring-blue-500/50'
              : 'bg-[#1b221e] border-[#2f3b33] text-emerald-300 hover:bg-[#253029]'
          }`}
          title="2D 수직 정사 뷰(Top-Down)와 3D 경사 조감 뷰 원클릭 전환"
        >
          <Box className="w-3.5 h-3.5" />
          <span>{viewMode === '2D' ? '2D 뷰' : '3D 뷰'}</span>
        </button>

        {/* 3D Orbit Tour Button */}
        <button
          onClick={toggleOrbiting}
          className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isOrbiting
              ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:bg-[#253029]'
          }`}
          title="3D 파노라마 자동 회전 모드 토글 (ESC 또는 마우스 조작 시 정지)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isOrbiting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isOrbiting ? '회전 중' : '3D 투어'}</span>
        </button>

        {/* 3D 가시권(Viewshed/사계) 분석 모드 버튼 */}
        <button
          onClick={toggleViewshedMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isViewshedMode || viewshedResult
              ? 'bg-teal-600/40 border-teal-400 text-teal-200 ring-1 ring-teal-400/60 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 가시권(사계) 분석: 지도 클릭 지점 기준 반경 1.5km 360° 가시/차폐 영역 3D 계산"
        >
          <Eye className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden sm:inline">사계 분석</span>
        </button>

        {/* 3D 실측 줄자 (3D Ruler) 버튼 */}
        <button
          onClick={toggleMeasureMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isMeasureMode || measureResult
              ? 'bg-amber-600/40 border-amber-400 text-amber-200 ring-1 ring-amber-400/60 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 실측 줄자: 두 점 클릭 시 지형 굴곡을 따라가는 실제 지표 거리 및 고저차·경사도 정밀 측정"
        >
          <Ruler className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">3D 줄자</span>
        </button>

        {/* [신규] 3D 공간 주석 핀 (Billboard Pin) 버튼 */}
        <button
          onClick={togglePinMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isPinMode
              ? 'bg-cyan-600/40 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/60 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 공간 주석 핀: 클릭 지점 지표 표고 안착 콜아웃 핀 추가 (더블클릭 수정)"
        >
          <Pin className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">주석 핀</span>
          {spatialPins.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-900 border border-cyan-600 text-cyan-200 text-[9.5px] font-mono">
              {spatialPins.length}
            </span>
          )}
        </button>

        {/* [신규] 3D 계획·접근 축선 화살표 버튼 */}
        <button
          onClick={toggleArrowMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isArrowMode
              ? 'bg-amber-600/40 border-amber-400 text-amber-200 ring-1 ring-amber-400/60 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 계획·접근 축선 화살표 작도 (시작점/끝점 클릭으로 지형 표면 밀착 화살표 생성)"
        >
          <MoveUpRight className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">전술 화살표</span>
          {tacticalArrows.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-900 border border-amber-600 text-amber-200 text-[9.5px] font-mono">
              {tacticalArrows.length}
            </span>
          )}
        </button>

        {/* [신규] UAV 정찰 비행 시뮬레이터 버튼 */}
        <button
          onClick={toggleUavFlight}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            uavFlight.isActive
              ? 'bg-emerald-600/50 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/70 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="UAV 3D 정찰 비행 시뮬레이터: 부지 외곽 순찰 비행 및 FPV 1인칭 HUD 관측 뷰 전환"
        >
          <Radio
            className={`w-3.5 h-3.5 ${
              uavFlight.isActive ? 'text-emerald-300 animate-spin' : 'text-emerald-400'
            }`}
          />
          <span className="hidden sm:inline">
            {uavFlight.isActive ? 'UAV 정찰 중' : 'UAV 정찰'}
          </span>
        </button>

        {/* [신규] 3D 감시 센서 콘 (Sensor FOV) 버튼 */}
        <button
          onClick={toggleSensorPlacementMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isSensorPlacementMode
              ? 'bg-teal-600/40 border-teal-400 text-teal-200 ring-1 ring-teal-400/60 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 감시 센서 콘(Sensor FOV): 초소/카메라 위치 클릭 시 반투명 3D 레이더 스캔 콘 배치"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden sm:inline">센서 콘</span>
          {surveillanceSensors.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-teal-900 border border-teal-600 text-teal-200 text-[9.5px] font-mono">
              {surveillanceSensors.length}
            </span>
          )}
        </button>

        {/* [신규] 3D 토공량(절토·성토 Cut & Fill) 계산기 버튼 */}
        <button
          onClick={toggleCutFill}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            cutFill.enabled
              ? 'bg-emerald-600/50 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/70 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 토공량(Cut & Fill) 계산기: 부지 내부 정밀 DEM 격자 표고 샘플링 및 절토/성토 체적·덤프트럭 환산"
        >
          <Boxes className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">토공량</span>
          {cutFill.result && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-300 text-[9.5px] font-mono">
              EL.{cutFill.result.targetElevation}m
            </span>
          )}
        </button>

        {/* [신규] 도정·국방 표준 도면 표제란 (Title Block) 토글 버튼 */}
        <button
          onClick={toggleTitleBlock}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            showTitleBlock
              ? 'bg-emerald-600/40 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/60 shadow-md'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="도정·국방 표준 도면 표제란(Title Block) 16:9 슬라이드 및 캡처 합성 토글"
        >
          <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">도면 표제란</span>
        </button>

        {/* [3D 디테일: 일반 / 실감(LOD2)] 토글 스위치 */}
        <button
          onClick={toggleDetail3DMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            detail3DMode === 'lod2'
              ? 'bg-amber-600/35 border-amber-400 text-amber-200 ring-1 ring-amber-400/60 shadow-md'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="3D 그래픽 디테일 전환: 일반(LOD1) ⇄ 실감(LOD2 - 박공 경사 지붕, 옥상 헬리패드, 트러스 지붕, 균일 창문 격자 외벽)"
        >
          <Sparkles className={`w-3.5 h-3.5 ${detail3DMode === 'lod2' ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="hidden sm:inline">3D 디테일:</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              detail3DMode === 'lod2'
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {detail3DMode === 'lod2' ? '실감(LOD2)' : '일반'}
          </span>
        </button>

        {/* [신규] 4단계: 3D 시네마틱 카메라 경로 빌더 버튼 */}
        <button
          onClick={() => setCinematicBuilderOpen(true)}
          className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            cinematicFlight.isPlaying || cinematicFlight.isBuilderOpen
              ? 'bg-cyan-600/50 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/70 shadow-md animate-pulse'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:text-white hover:bg-[#253029]'
          }`}
          title="웨이포인트 기반 3D 시네마틱 카메라 비행 경로 빌더 & 1080p 동영상 녹화기"
        >
          <Film className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">시네마틱 경로</span>
          {cinematicFlight.waypoints.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 border border-cyan-600 text-cyan-300 text-[9.5px] font-mono">
              {cinematicFlight.waypoints.length} WP
            </span>
          )}
        </button>

        {/* [신규] 4단계: 🔴 브리핑 영상 녹화 버튼 */}
        <button
          onClick={() => setCinematicBuilderOpen(true)}
          className={`px-2 sm:px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            cinematicFlight.isRecording
              ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-950 ring-1 ring-rose-400 animate-pulse'
              : 'bg-[#1b221e] border-[#3d2729] text-rose-300 hover:text-white hover:bg-rose-950/60'
          }`}
          title="Canvas Stream 기반 1080p 60fps 고해상도 브리핑 영상 실시간 녹화 & 자동 다운로드"
        >
          <Video className="w-3.5 h-3.5 text-rose-400" />
          <span className="hidden sm:inline">
            {cinematicFlight.isRecording ? '🔴 녹화 중' : '영상 녹화'}
          </span>
        </button>
        <div className="flex items-center space-x-1 border-l border-r border-[#242f27] px-1 sm:px-1.5">
          <button
            onClick={handleExportGeobrief}
            className="px-2 py-1.5 text-xs font-medium rounded-lg bg-[#1b221e] border border-[#2f3b33] text-cyan-300 hover:bg-[#253029] hover:border-cyan-500/60 flex items-center space-x-1 transition-all whitespace-nowrap"
            title="현재 프로젝트 전체 상태를 .geobrief 단일 파일로 내보내기"
          >
            <FileDown className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">.geobrief 내보내기</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1.5 text-xs font-medium rounded-lg bg-[#1b221e] border border-[#2f3b33] text-cyan-300 hover:bg-[#253029] hover:border-cyan-500/60 flex items-center space-x-1 transition-all whitespace-nowrap"
            title=".geobrief 단일 프로젝트 파일 가져오기"
          >
            <FileUp className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">가져오기</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportGeobrief}
            accept=".geobrief,.json"
            className="hidden"
          />
        </div>

        {/* 대형 스크린 브리핑 전용 프레젠테이션 모드 */}
        <button
          onClick={togglePresentationMode}
          className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center space-x-1 sm:space-x-1.5 whitespace-nowrap ${
            isPresentationMode
              ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/50 shadow-md'
              : 'bg-[#1b221e] border-[#2f3b33] text-slate-300 hover:bg-[#253029]'
          }`}
          title="대형 스크린 브리핑 모드 (사이드바 접힘, ESC 키로 복귀)"
        >
          {isPresentationMode ? (
            <Minimize2 className="w-3.5 h-3.5 text-amber-300" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span className="hidden sm:inline">{isPresentationMode ? '해제' : '브리핑 뷰'}</span>
        </button>

        {/* 프로젝트 저장/불러오기 보관함 버튼 */}
        <button
          onClick={() => setIsProjectModalOpen(true)}
          className="px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1b221e] border border-[#2f3b33] text-emerald-300 hover:bg-[#253029] hover:border-emerald-600/60 flex items-center space-x-1 sm:space-x-1.5 transition-all shadow-sm whitespace-nowrap"
          title="클라우드/로컬 프로젝트 저장 및 불러오기"
        >
          <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
          <span>보관함</span>
        </button>

        {/* 3단 보고서 슬라이드 팩 (.pptx) 내보내기 버튼 */}
        <button
          onClick={triggerSlidePackExport}
          disabled={slidePackProgress.isExporting}
          className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg shadow-md flex items-center space-x-1 sm:space-x-1.5 transition-all whitespace-nowrap ${
            slidePackProgress.isExporting
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/60 ring-1 ring-emerald-400/40'
          }`}
          title="카메라 3단 순차 비행(광역·지적·3D) 캡처 후 완성형 PPTX 프레젠테이션 자동 생성"
        >
          <Presentation className="w-3.5 h-3.5" />
          <span className="hidden md:inline">3단 보고서 슬라이드 팩</span>
          <span className="md:hidden">PPTX</span>
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
