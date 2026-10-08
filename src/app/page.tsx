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
  const { isPresentationMode, togglePresentationMode, setIsPresentationMode } = useMapStore();

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

  // ESC 키 입력 시 프레젠테이션 모드 해제
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPresentationMode) {
        togglePresentationMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresentationMode, togglePresentationMode]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0e0c]">
      {/* 상단 통합 헤더 */}
      <Header />

      {/* 메인 작업 영역: 좌측 패널 + 우측 메인 맵 뷰포트 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 좌측 컨트롤 패널 (프레젠테이션 모드 시 부드럽게 숨김) */}
        <div
          className={`transition-all duration-300 ease-in-out h-full overflow-hidden ${
            isPresentationMode ? 'w-0 opacity-0 pointer-events-none' : 'w-[360px] opacity-100'
          }`}
        >
          <ControlPanel />
        </div>

        {/* 우측 16:9 슬라이드 프레임 뷰어 */}
        <main className="flex-1 h-full overflow-hidden relative">
          <MapViewer />

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
