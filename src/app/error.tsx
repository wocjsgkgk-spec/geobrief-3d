'use client';

import React, { useEffect } from 'react';
import { AlertOctagon, RotateCcw, Home, RefreshCw, Terminal } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // 콘솔에 상세 에러 추적 로그 기록
    console.error('[GeoBrief 3D Client Exception Caught by error.tsx]:', error);
  }, [error]);

  const handleHardRefresh = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('geobrief-3d-storage');
        sessionStorage.clear();
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#070b09] text-slate-200 flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#0e1612] border-2 border-red-500/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-red-950/50 space-y-6">
        {/* 상단 헤더 */}
        <div className="flex items-start justify-between border-b border-red-500/30 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-red-950/80 border border-red-500 rounded-xl text-red-400">
              <AlertOctagon className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
                GeoBrief 3D 런타임 예외 감지
                <span className="text-xs font-mono font-normal bg-red-950 text-red-400 px-2 py-0.5 rounded border border-red-800">
                  Client-side Exception
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                화면 렌더링 중 예기치 않은 클라이언트 오류가 발생하여 안전 격리 모드로 전환되었습니다.
              </p>
            </div>
          </div>
        </div>

        {/* 에러 상세 메시지 카드 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-red-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              오류 진단 정보 (Error Diagnostic)
            </span>
            {error.digest && (
              <span className="font-mono text-[10px] text-slate-500">
                Digest: {error.digest}
              </span>
            )}
          </div>
          <div className="bg-[#050806] border border-red-900/60 rounded-xl p-3.5 font-mono text-xs text-red-300 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed select-text">
            <div className="font-bold text-red-400 mb-1">
              {error.name ? `${error.name}: ` : ''}{error.message || '알 수 없는 클라이언트 예외가 발생했습니다.'}
            </div>
            {error.stack && (
              <div className="text-[11px] text-slate-500 mt-2 border-t border-red-950/80 pt-2">
                {error.stack}
              </div>
            )}
          </div>
        </div>

        {/* 권장 조치 가이드 */}
        <div className="bg-[#121c16] border border-[#23352a] rounded-xl p-3.5 text-xs text-slate-300 space-y-1.5">
          <div className="font-bold text-emerald-400 flex items-center gap-1.5">
            <span>💡 안전 복구 가이드</span>
          </div>
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            • <strong>[다시 시도]</strong>: 컴포넌트를 즉시 재마운트하여 정상 렌더링을 시도합니다.<br />
            • <strong>[스토리지 초기화 & 새로고침]</strong>: 손상되었을 수 있는 로컬 캐시를 삭제하고 깨끗한 기본 상태로 복원합니다.
          </p>
        </div>

        {/* 액션 버튼 그룹 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            다시 시도 (Reset)
          </button>
          <button
            onClick={handleHardRefresh}
            className="flex-1 min-w-[180px] flex items-center justify-center gap-2 px-5 py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-700/80 active:scale-95 text-red-200 font-bold text-xs rounded-xl shadow-lg transition-all"
          >
            <RefreshCw className="w-4 h-4 text-red-400" />
            스토리지 초기화 후 새로고침
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/';
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all"
          >
            <Home className="w-4 h-4" />
            홈으로
          </button>
        </div>
      </div>
    </div>
  );
}
