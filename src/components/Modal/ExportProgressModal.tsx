'use client';

import React from 'react';
import { useMapStore } from '@/store/useMapStore';
import { CheckCircle2, Loader2, Sparkles, Presentation, Camera, FileText } from 'lucide-react';

export const ExportProgressModal: React.FC = () => {
  const { slidePackProgress } = useMapStore();
  const { isExporting, step, totalSteps, percent, statusText } = slidePackProgress;

  if (!isExporting) return null;

  const isComplete = percent >= 100;

  const stepsList = [
    { num: 1, label: '광역 입지', sub: 'Zoom 10.5 수직 뷰' },
    { num: 2, label: '지적 현황', sub: 'Zoom 15.8 필지선' },
    { num: 3, label: '3D 미래조감', sub: 'Zoom 13.5 경사 뷰' },
    { num: 4, label: 'PPTX 조립', sub: '16:9 와이드 완성' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-all select-none p-4">
      <div className="relative w-full max-w-md bg-[#0d141d] border border-[#233548] rounded-2xl p-6 shadow-2xl shadow-black/80 flex flex-col items-center text-center overflow-hidden">
        {/* 상단 장식 네온 그라데이션 라인 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-400 to-indigo-500 animate-pulse" />

        {/* 상단 아이콘 */}
        <div className="w-14 h-14 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
          {isComplete ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
          ) : (
            <Presentation className="w-8 h-8 text-emerald-400" />
          )}
        </div>

        {/* 제목 및 부제 */}
        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <span>3단 보고서 슬라이드 팩 생성</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/60 text-emerald-300">
            .pptx
          </span>
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          카메라 3단 순차 비행 캡처 및 파워포인트 완성형 브리핑 덱 자동 조립 엔진
        </p>

        {/* 4단계 스텝 인디케이터 */}
        <div className="grid grid-cols-4 gap-2 w-full my-5">
          {stepsList.map((s) => {
            const isActive = step === s.num && !isComplete;
            const isDone = step > s.num || isComplete;

            return (
              <div
                key={s.num}
                className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all ${
                  isActive
                    ? 'bg-blue-950/70 border-blue-500 text-blue-200 shadow-lg ring-1 ring-blue-400/50 scale-[1.03]'
                    : isDone
                    ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                    : 'bg-[#131b26] border-[#223144] text-slate-500'
                }`}
              >
                <div className="text-[10px] font-bold font-mono mb-0.5">
                  {isDone ? '✓' : `0${s.num}`}
                </div>
                <div className="text-xs font-semibold leading-tight">{s.label}</div>
                <div className="text-[9px] text-slate-400 scale-90 leading-tight mt-0.5">
                  {s.sub}
                </div>
              </div>
            );
          })}
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full bg-[#182332] rounded-full h-2.5 overflow-hidden mb-3 border border-[#2a3c54]">
          <div
            className="bg-gradient-to-r from-blue-500 via-emerald-400 to-teal-300 h-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>

        {/* 진행률 & 상태 메시지 */}
        <div className="flex items-center justify-between w-full text-xs text-slate-400 mb-2">
          <div className="flex items-center space-x-1.5 truncate max-w-[80%]">
            {!isComplete ? (
              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            )}
            <span className="text-slate-200 font-medium truncate">
              {statusText || '보고서 생성 준비 중...'}
            </span>
          </div>
          <span className="font-mono font-bold text-emerald-400 flex-shrink-0">
            {percent}%
          </span>
        </div>

        {/* 하단 보조 안내 */}
        <div className="mt-3 pt-3 border-t border-[#1d2b3c] w-full flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Camera className="w-3 h-3 text-slate-400" />
            안정화 딜레이 1.5초 적용
          </span>
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-emerald-400" />
            16:9 와이드 규격
          </span>
        </div>
      </div>
    </div>
  );
};
