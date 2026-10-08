'use client';

import React, { useState } from 'react';
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
  } = useMapStore();

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

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
