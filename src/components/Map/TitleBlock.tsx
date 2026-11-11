'use client';

import React, { useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { FileCheck, ArrowUpDown, Layers, ChevronDown, ChevronUp, X } from 'lucide-react';
import { LegendBoxContent } from './LegendBox';

interface TitleBlockProps {
  siteName?: string;
}

export const TitleBlock: React.FC<TitleBlockProps> = ({ siteName }) => {
  const { metadata, showTitleBlock, toggleTitleBlock, showLegendBox, toggleLegendBox } = useMapStore();
  const [position, setPosition] = useState<'bottom-right' | 'top-right'>('bottom-right');
  const [activeTab, setActiveTab] = useState<'title' | 'legend'>('title');
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const isVisible = showTitleBlock || showLegendBox;

  if (!isVisible) {
    return (
      <div className="absolute bottom-4 right-4 z-20">
        <button
          onClick={toggleTitleBlock}
          className="bg-[#0b1310]/95 backdrop-blur-md border border-emerald-500/60 hover:border-emerald-400 px-3 py-2 rounded-xl shadow-xl text-xs font-bold text-emerald-300 hover:text-white flex items-center gap-1.5 transition-all group whitespace-nowrap ring-1 ring-emerald-500/30"
          title="도정·국방 표준 도면 표제란(Title Block) 및 범례 열기"
        >
          <FileCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
          <span>도면 표제란 & 범례</span>
        </button>
      </div>
    );
  }

  const drawingTitle = siteName
    ? `${siteName} 공간분석도`
    : metadata.title || '원주 1군지사 이전부지 공간분석도';

  const sheetNo = metadata.sheetNo || 'GB-2026-002';
  const scale = metadata.scale || '1:5,000';
  const department = metadata.department || '강원특별자치도 기획조정실';
  const securityLevel = metadata.securityLevel || '일반 (대외비 해제)';

  const isClassified =
    metadata.securityLevel === '군사대외비' || metadata.securityLevel === '대외비';

  const positionClasses =
    position === 'top-right'
      ? 'top-16 right-6'
      : 'bottom-4 right-4';

  return (
    <div className={`absolute ${positionClasses} z-20 select-none animate-fade-in pointer-events-auto transition-all duration-200`}>
      <div className="w-[320px] sm:w-[350px] bg-[#070d0a]/95 backdrop-blur-md border border-emerald-500/80 rounded-xl shadow-2xl overflow-hidden ring-1 ring-emerald-500/40 text-[11px] font-sans">
        {/* 상단 탭 및 툴바 */}
        <div className="bg-[#0f1d16] border-b border-emerald-700/60 px-2.5 py-1.5 flex items-center justify-between gap-1">
          {/* 탭 전환 (표제란 vs 범례) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setActiveTab('title');
                setCollapsed(false);
              }}
              className={`px-2 py-1 rounded text-[10.5px] font-bold flex items-center gap-1 transition-colors ${
                activeTab === 'title'
                  ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-500/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCheck className="w-3 h-3 text-emerald-400" />
              <span>도면 표제란</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('legend');
                setCollapsed(false);
              }}
              className={`px-2 py-1 rounded text-[10.5px] font-bold flex items-center gap-1 transition-colors ${
                activeTab === 'legend'
                  ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-500/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3 text-emerald-400" />
              <span>도면 범례</span>
            </button>
          </div>

          {/* 우측 보조 컨트롤 버튼 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPosition((p) => (p === 'bottom-right' ? 'top-right' : 'bottom-right'))}
              className="p-1 text-slate-400 hover:text-emerald-300 rounded hover:bg-slate-800 transition-colors"
              title={position === 'bottom-right' ? '우측 상단으로 이동' : '우측 하단으로 이동'}
            >
              <ArrowUpDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 text-slate-400 hover:text-emerald-300 rounded hover:bg-slate-800 transition-colors"
              title={collapsed ? '펼치기' : '접기'}
            >
              {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={toggleTitleBlock}
              className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
              title="닫기"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 본문 콘텐츠: activeTab 에 따라 표제란 또는 범례 표출 (절대 겹침 없음) */}
        {!collapsed && activeTab === 'title' && (
          <>
            {/* 도면명 본문 */}
            <div className="p-2.5 bg-[#09130e] border-b border-emerald-900/60">
              <span className="text-[9.5px] text-slate-400 block font-semibold mb-0.5">
                문서명 / 도면명 (DRAWING TITLE)
              </span>
              <h4 className="font-bold text-white text-xs sm:text-sm truncate leading-snug">
                {drawingTitle}
              </h4>
            </div>

            {/* 표제란 정보 그리드 */}
            <div className="grid grid-cols-2 divide-x divide-y divide-emerald-900/60 bg-[#060b08] text-[10.5px]">
              <div className="p-2 space-y-0.5">
                <span className="text-[9px] text-slate-400 block font-mono">도면번호 (SHEET NO.)</span>
                <span className="font-bold text-slate-200 font-mono">{sheetNo}</span>
              </div>
              <div className="p-2 space-y-0.5">
                <span className="text-[9px] text-slate-400 block font-mono">기준축척 (SCALE)</span>
                <span className="font-semibold text-emerald-400 font-mono">{scale} (3D 입체)</span>
              </div>
              <div className="p-2 space-y-0.5">
                <span className="text-[9px] text-slate-400 block font-mono">기안처 (DEPARTMENT)</span>
                <span className="font-semibold text-slate-200 truncate block">
                  {department}
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
                <span className="text-[9px] text-slate-400 block font-mono">보안등급 (SECURITY)</span>
                <span className="font-mono text-emerald-300 font-semibold">{securityLevel}</span>
              </div>
            </div>

            {/* 하단 각주 바 */}
            <div className="px-3 py-1 bg-[#0a140f] border-t border-emerald-800/40 flex items-center justify-between text-[9px] text-slate-400 font-mono">
              <span>GeoBrief 3D Geospatial Engine</span>
              <span className="text-emerald-400 font-semibold">정부공공표준양식 (CAD BLOCK)</span>
            </div>
          </>
        )}

        {!collapsed && activeTab === 'legend' && (
          <LegendBoxContent />
        )}
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
    sheetNo?: string;
    scale?: string;
  }
) {
  const blockW = 390;
  const blockH = 180;
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
  ctx.fillText('표준 도면 표제관 (CAD TITLE BLOCK)', x + 10, y + 17);

  const sec = meta.securityLevel || '일반 (대외비 해제)';
  ctx.fillStyle = '#6EE7B7';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(sec, x + blockW - 120, y + 17);

  // 도면명
  ctx.fillStyle = '#94A3B8';
  ctx.font = '9px sans-serif';
  ctx.fillText('문서명 / 도면명 (DRAWING TITLE)', x + 10, y + 42);

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
  const sheetNo = meta.sheetNo || 'GB-2026-002';
  const scale = meta.scale || '1:5,000';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '9px sans-serif';
  ctx.fillText(`도면번호: ${sheetNo}`, x + 10, y + 88);
  ctx.fillText(`기준축척: ${scale} (3D 입체)`, x + 10, y + 104);

  // 셀 2: 기안처 & 작성자
  ctx.fillText(`기안처: ${meta.department || '강원특별자치도 기획조정실'}`, x + blockW / 2 + 10, y + 88);
  ctx.fillText(`작성자: ${meta.author || '공간정책분석관'}`, x + blockW / 2 + 10, y + 104);

  // 셀 3: 작성일자 & 보안등급
  ctx.fillText(`작성일자: ${meta.date || '2026. 10. 13'}`, x + 10, y + 132);
  ctx.fillText(`보안등급: ${sec}`, x + blockW / 2 + 10, y + 132);

  // 하단 각주 바
  ctx.fillStyle = '#0a140f';
  ctx.fillRect(x, y + blockH - 22, blockW, 22);
  ctx.fillStyle = '#64748B';
  ctx.font = '9px monospace';
  ctx.fillText('GeoBrief 3D Geospatial Engine | 정부공공표준양식', x + 10, y + blockH - 8);

  ctx.restore();
}
