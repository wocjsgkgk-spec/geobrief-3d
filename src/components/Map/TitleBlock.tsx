'use client';

import React from 'react';
import { useMapStore } from '@/store/useMapStore';
import { ShieldCheck, FileCheck, Building2, Calendar, Scale, Layers } from 'lucide-react';

interface TitleBlockProps {
  siteName?: string;
}

export const TitleBlock: React.FC<TitleBlockProps> = ({ siteName }) => {
  const { metadata, showTitleBlock, toggleTitleBlock } = useMapStore();

  if (!showTitleBlock) {
    return (
      <div className="absolute bottom-16 right-6 z-20">
        <button
          onClick={toggleTitleBlock}
          className="bg-[#0b1310]/90 backdrop-blur-md border border-emerald-500/60 hover:border-emerald-400 px-2.5 py-1.5 rounded-lg shadow-xl text-xs font-bold text-emerald-300 hover:text-white flex items-center gap-1.5 transition-all group"
          title="도정·국방 표준 도면 표제란(Title Block) 열기"
        >
          <FileCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span>도면 표제란 표시</span>
        </button>
      </div>
    );
  }

  const drawingTitle = siteName
    ? `${siteName} 공간분석도`
    : metadata.title || '강원권 전략 유휴부지 3D 공간분석도';

  const isClassified =
    metadata.securityLevel === '군사대외비' || metadata.securityLevel === '대외비';

  return (
    <div className="absolute bottom-8 right-6 z-20 select-none animate-fade-in pointer-events-auto">
      <div className="w-[320px] sm:w-[360px] bg-[#070d0a]/95 backdrop-blur-md border border-emerald-500/80 rounded-lg shadow-2xl overflow-hidden ring-1 ring-emerald-500/40 text-[11px] font-sans">
        {/* 상단 헤더 바 */}
        <div className="bg-[#0f1d16] border-b border-emerald-700/60 px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono font-extrabold text-[10px] text-emerald-300 tracking-wider">
              표준 도면 표제란 (CAD TITLE BLOCK)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold border ${
                isClassified
                  ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                  : 'bg-emerald-950/80 border-emerald-600/80 text-emerald-300'
              }`}
            >
              {metadata.securityLevel || '일반 (대외비 해제)'}
            </span>
            <button
              onClick={toggleTitleBlock}
              className="text-slate-400 hover:text-white text-xs px-1 rounded hover:bg-slate-800 transition-colors"
              title="도면 표제란 숨기기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 도면명 본문 */}
        <div className="p-2.5 bg-[#09130e] border-b border-emerald-900/60">
          <span className="text-[9.5px] text-slate-400 block font-semibold mb-0.5">
            도면명 (DRAWING TITLE)
          </span>
          <h4 className="font-bold text-white text-xs sm:text-sm truncate leading-snug">
            {drawingTitle}
          </h4>
        </div>

        {/* 표제란 정보 그리드 */}
        <div className="grid grid-cols-2 divide-x divide-y divide-emerald-900/60 bg-[#060b08] text-[10.5px]">
          <div className="p-2 space-y-0.5">
            <span className="text-[9px] text-slate-400 block font-mono">도면번호 (SHEET NO.)</span>
            <span className="font-bold text-slate-200 font-mono">GB-2026-001</span>
          </div>
          <div className="p-2 space-y-0.5">
            <span className="text-[9px] text-slate-400 block font-mono">기준축척 (SCALE)</span>
            <span className="font-semibold text-emerald-400 font-mono">1:5,000 / 3D 경사 조감</span>
          </div>
          <div className="p-2 space-y-0.5">
            <span className="text-[9px] text-slate-400 block font-mono">기안부서 (DEPARTMENT)</span>
            <span className="font-semibold text-slate-200 truncate block">
              {metadata.department || '강원특별자치도 기획조정실'}
            </span>
          </div>
          <div className="p-2 space-y-0.5">
            <span className="text-[9px] text-slate-400 block font-mono">작성자 (ANALYST)</span>
            <span className="font-semibold text-slate-300 truncate block">
              {metadata.author || '공간정책분석관'}
            </span>
          </div>
          <div className="p-2 space-y-0.5">
            <span className="text-[9px] text-slate-400 block font-mono">작성일자 (DATE)</span>
            <span className="font-mono text-slate-300">
              {metadata.date || new Date().toLocaleDateString('ko-KR')}
            </span>
          </div>
          <div className="p-2 space-y-0.5">
            <span className="text-[9px] text-slate-400 block font-mono">좌표계 (CRS)</span>
            <span className="font-mono text-slate-300">EPSG:5179 (GRS80)</span>
          </div>
        </div>

        {/* 하단 각주 바 */}
        <div className="px-3 py-1 bg-[#0a140f] border-t border-emerald-800/40 flex items-center justify-between text-[9px] text-slate-400 font-mono">
          <span>GeoBrief 3D Geospatial Engine</span>
          <span className="text-emerald-400 font-semibold">정부공공표준양식</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 4K 슬라이드 및 캡처 캔버스 상에 CAD 타이틀 블록을 직접 합성하는 드로잉 헬퍼
 */
export function drawCadTitleBlockOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  meta: {
    title: string;
    department?: string;
    author?: string;
    date?: string;
    securityLevel?: string;
  }
) {
  const blockW = 380;
  const blockH = 175;
  const margin = 32;

  const x = width - blockW - margin;
  const y = height - blockH - margin;

  // 배경 다크 패널
  ctx.save();
  ctx.fillStyle = 'rgba(7, 13, 10, 0.94)';
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, blockW, blockH);
  ctx.strokeRect(x, y, blockW, blockH);

  // 상단 헤더 바
  ctx.fillStyle = '#0f1d16';
  ctx.fillRect(x, y, blockW, 26);
  ctx.strokeStyle = '#047857';
  ctx.strokeRect(x, y, blockW, 26);

  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('표준 도면 표제란 (CAD TITLE BLOCK)', x + 10, y + 17);

  const sec = meta.securityLevel || '일반 (대외비 해제)';
  ctx.fillStyle = '#6EE7B7';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(sec, x + blockW - 100, y + 17);

  // 도면명
  ctx.fillStyle = '#94A3B8';
  ctx.font = '9px sans-serif';
  ctx.fillText('도면명 (DRAWING TITLE)', x + 10, y + 42);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 13px sans-serif';
  const drawTitle = meta.title.length > 25 ? meta.title.slice(0, 25) + '...' : meta.title;
  ctx.fillText(drawTitle, x + 10, y + 60);

  // 그리드 분할선
  ctx.strokeStyle = '#064E3B';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 72);
  ctx.lineTo(x + blockW, y + 72);
  ctx.moveTo(x + blockW / 2, y + 72);
  ctx.lineTo(x + blockW / 2, y + blockH - 22);
  ctx.moveTo(x, y + 115);
  ctx.lineTo(x + blockW, y + 115);
  ctx.stroke();

  // 셀 1: 도면번호 & 축척
  ctx.fillStyle = '#94A3B8';
  ctx.font = '9px sans-serif';
  ctx.fillText('도면번호: GB-2026-001', x + 10, y + 88);
  ctx.fillText('기준축척: 1:5,000 (3D 입체)', x + 10, y + 104);

  // 셀 2: 기안부서 & 작성자
  ctx.fillText(`기안부서: ${meta.department || '강원특별자치도 기획조정실'}`, x + blockW / 2 + 10, y + 88);
  ctx.fillText(`작성자: ${meta.author || '공간정책분석관'}`, x + blockW / 2 + 10, y + 104);

  // 셀 3: 작성일자 & 좌표계
  ctx.fillText(`작성일자: ${meta.date || '2026. 10. 11'}`, x + 10, y + 132);
  ctx.fillText('좌표계: EPSG:5179 (GRS80)', x + blockW / 2 + 10, y + 132);

  // 하단 각주 바
  ctx.fillStyle = '#0a140f';
  ctx.fillRect(x, y + blockH - 22, blockW, 22);
  ctx.fillStyle = '#64748B';
  ctx.font = '9px monospace';
  ctx.fillText('GeoBrief 3D Geospatial Engine | 정부공공표준양식', x + 10, y + blockH - 8);

  ctx.restore();
}
