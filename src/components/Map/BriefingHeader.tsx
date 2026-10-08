'use client';

import React from 'react';
import { useMapStore } from '@/store/useMapStore';
import { Calendar, Building2, Edit3, ShieldAlert, Box } from 'lucide-react';

export const BriefingHeader: React.FC = () => {
  const {
    metadata,
    updateMetadata,
    borderSecurityVisible,
    isBorderDistrict,
    viewMode,
    toggleViewMode,
  } = useMapStore();

  return (
    <div className="absolute top-3 left-4 right-4 z-10 pointer-events-none flex justify-between items-start gap-4">
      {/* 1. 메인 타이틀 및 대상지 명칭 (인라인 직접 수정 가능) */}
      <div className="bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] px-4 py-2.5 rounded-xl shadow-2xl max-w-2xl pointer-events-auto transition-all hover:border-emerald-500/60 group">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <input
            type="text"
            value={metadata.title}
            onChange={(e) => updateMetadata({ title: e.target.value })}
            placeholder="보고서 타이틀 입력"
            className="w-full bg-transparent text-sm font-extrabold text-slate-100 tracking-wide focus:outline-none focus:bg-[#1a231d] px-1.5 py-0.5 rounded border border-transparent focus:border-emerald-500/70 transition-colors"
            title="클릭하여 보고서 제목을 직접 수정할 수 있습니다"
          />
          <Edit3 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
        <div className="flex items-center space-x-2 mt-0.5">
          <input
            type="text"
            value={metadata.subtitle}
            onChange={(e) => updateMetadata({ subtitle: e.target.value })}
            placeholder="대상지 및 세부 부제 입력"
            className="w-full bg-transparent text-[11px] font-semibold text-emerald-400 focus:outline-none focus:bg-[#1a231d] px-1.5 py-0.5 rounded border border-transparent focus:border-emerald-500/70 transition-colors"
            title="클릭하여 대상지 명칭을 직접 수정할 수 있습니다"
          />
        </div>
      </div>

      {/* 2. 우측 상태 배지 및 작성 부서 메타 바 */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* 2D 평면 / 3D 입체 원클릭 토글 버튼 */}
        <button
          onClick={toggleViewMode}
          className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xl ${
            viewMode === '2D'
              ? 'bg-blue-600/90 border border-blue-400 text-white shadow-blue-900/50 ring-1 ring-blue-400/50'
              : 'bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] text-slate-300 hover:text-emerald-300 hover:border-emerald-500/60'
          }`}
          title="2D 평면 수직 정사 뷰(Top-Down)와 3D 조감 뷰 원클릭 전환"
        >
          <Box className="w-3.5 h-3.5" />
          <span>{viewMode === '2D' ? '2D 평면 뷰' : '3D 입체 뷰'}</span>
        </button>

        {isBorderDistrict && borderSecurityVisible && (
          <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-950/90 border border-rose-500/80 text-rose-200 shadow-xl text-xs font-extrabold select-none animate-pulse">
            <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>접경·안보 관제 권역</span>
          </div>
        )}
        <div className="bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] px-3.5 py-2 rounded-xl shadow-2xl text-right text-[10px] space-y-1 transition-all hover:border-emerald-500/60 group">
        <div className="flex items-center justify-end space-x-1.5 text-slate-300">
          <Building2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <input
            type="text"
            value={metadata.department}
            onChange={(e) => updateMetadata({ department: e.target.value })}
            placeholder="작성 부서명"
            className="bg-transparent text-[10px] text-right font-medium text-slate-300 focus:outline-none focus:bg-[#1a231d] px-1 py-0.5 rounded border border-transparent focus:border-emerald-500/70 transition-colors w-40"
            title="클릭하여 작성 부서를 직접 수정할 수 있습니다"
          />
        </div>
        <div className="flex items-center justify-end space-x-1.5 text-slate-400">
          <Calendar className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <input
            type="text"
            value={metadata.date}
            onChange={(e) => updateMetadata({ date: e.target.value })}
            placeholder="기준 일자"
            className="bg-transparent text-[10px] text-right font-mono text-slate-400 focus:outline-none focus:bg-[#1a231d] px-1 py-0.5 rounded border border-transparent focus:border-emerald-500/70 transition-colors w-28"
            title="클릭하여 기준 일자를 직접 수정할 수 있습니다"
          />
          <span className="text-[9px] text-slate-500 font-mono">기준</span>
        </div>
      </div>
    </div>
  </div>
);
};
