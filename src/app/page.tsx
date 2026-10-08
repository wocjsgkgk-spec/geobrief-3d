'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/Header/Header';
import { ControlPanel } from '@/components/Panel/ControlPanel';
import { useMapStore } from '@/store/useMapStore';
import { Minimize2 } from 'lucide-react';

// WebGL MapLibre GL은 클라이언트 전용으로 dynamic import
const MapViewer = dynamic(
  () => import('@/components/Map/MapViewer').then((mod) => mod.MapViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#090c0a] text-emerald-400 space-y-3">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
        <p className="text-xs font-mono tracking-widest uppercase">
          Terrarium 3D DEM Engine 로딩 중...
        </p>
      </div>
    ),
  }
);

export default function Home() {
  const {
    isPresentationMode,
    togglePresentationMode,
    setIsPresentationMode,
    isMobilePanelOpen,
    toggleMobilePanel,
    setIsMobilePanelOpen,
  } = useMapStore();

  // 브라우저 전체화면(Fullscreen) API 동기화 및 ESC 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (!isCurrentlyFullscreen && isPresentationMode) {
        setIsPresentationMode(false);
      }
      // 뷰포트 크기 변경에 따른 MapLibre 리사이즈 트리거
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isPresentationMode, setIsPresentationMode]);

  // 프레젠테이션 모드 변경 시 Fullscreen 진입/해제 및 맵 리사이즈
  useEffect(() => {
    if (isPresentationMode) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // 브라우저 정책(유저 제스처 누락 등)으로 실패해도 UI 프레젠테이션 모드는 유지
        });
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }

    // 사이드바 트랜지션 애니메이션 완료 후 맵 리사이즈 통지
    const timer1 = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
    const timer2 = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isPresentationMode]);

  // ESC 키 입력 시 프레젠테이션 모드 또는 모바일 패널 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPresentationMode) togglePresentationMode();
        if (isMobilePanelOpen) setIsMobilePanelOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresentationMode, togglePresentationMode, isMobilePanelOpen, setIsMobilePanelOpen]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0e0c]">
      {/* 상단 통합 헤더 */}
      <Header />

      {/* 메인 작업 영역: 좌측 패널 + 우측 메인 맵 뷰포트 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* [데스크톱] 좌측 컨트롤 패널 */}
        <div
          className={`hidden md:block transition-all duration-300 ease-in-out h-full overflow-hidden ${
            isPresentationMode ? 'w-0 opacity-0 pointer-events-none' : 'w-[360px] opacity-100'
          }`}
        >
          <ControlPanel />
        </div>

        {/* [모바일 전용] 슬라이드 오버레이 서랍 (Drawer) */}
        {isMobilePanelOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* 배경 어두운 백드롭 */}
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobilePanelOpen(false)}
            />
            {/* 모바일 서랍 본문 */}
            <div className="relative z-50 w-[88vw] max-w-sm h-full bg-[#141a16] shadow-2xl flex flex-col border-r border-[#242f27] animate-slide-in-left">
              <div className="flex items-center justify-between p-3 border-b border-[#242f27] bg-[#101712]">
                <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                  GeoBrief 3D 분석 제어
                </span>
                <button
                  onClick={() => setIsMobilePanelOpen(false)}
                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-800 text-slate-300 hover:text-white"
                >
                  닫기 ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ControlPanel />
              </div>
            </div>
          </div>
        )}

        {/* 우측 메인 맵 뷰포트 (모바일에서는 전체 화면 100%) */}
        <main className="flex-1 h-full w-full overflow-hidden relative">
          <MapViewer />

          {/* 모바일 전용 플로팅 토글 퀵 버튼 */}
          <div className="md:hidden absolute bottom-5 right-4 z-30">
            <button
              onClick={toggleMobilePanel}
              className="px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-2xl flex items-center gap-1.5 border border-emerald-400/50 ring-2 ring-black/60 transition-all active:scale-95"
            >
              <span>{isMobilePanelOpen ? '🗺️ 지도 전체화면' : '📋 제어 패널 열기'}</span>
            </button>
          </div>

          {/* 프레젠테이션 모드 오버레이 안내 뱃지 */}
          {isPresentationMode && (
            <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs shadow-xl animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span className="font-semibold">대형 스크린 브리핑 모드 가동 중</span>
              <span className="text-[10px] text-slate-300 border border-slate-600 bg-slate-800/80 px-1.5 py-0.5 rounded ml-1 font-mono">
                ESC로 복귀
              </span>
              <button
                onClick={togglePresentationMode}
                className="ml-2 hover:text-white p-0.5 rounded transition-colors"
                title="브리핑 모드 종료"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
