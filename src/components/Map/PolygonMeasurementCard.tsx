'use client';

import React, { useState } from 'react';
import {
  Ruler,
  Maximize2,
  Building,
  Mountain,
  Boxes,
  Copy,
  Check,
  X,
  FileCheck,
  TrendingUp,
} from 'lucide-react';

export interface PolygonMeasurementCardProps {
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  areaSqm: number;
  areaPyeong: number;
  perimeterM: number;
  buildingCount: number;
  meanElevation: number;
  averageSlopeDeg: number;
  cutFillM3: {
    cut: number;
    fill: number;
    net: number;
  };
  onClose: () => void;
  onOpenCutFillModal?: () => void;
}

export const PolygonMeasurementCard: React.FC<PolygonMeasurementCardProps> = ({
  polygon,
  areaSqm,
  areaPyeong,
  perimeterM,
  buildingCount,
  meanElevation,
  averageSlopeDeg,
  cutFillM3,
  onClose,
  onOpenCutFillModal,
}) => {
  const [copied, setCopied] = useState(false);

  if (!polygon || areaSqm <= 0) return null;

  const handleCopy = () => {
    const text = `[GeoBrief 3D 다각형 구역 실측 측정서]
- 총 실측 면적: ${areaSqm.toLocaleString()} ㎡ (약 ${areaPyeong.toLocaleString()} 평)
- 외곽 둘레: ${perimeterM.toLocaleString()} m
- 구역 내 건물 수: ${buildingCount} 동
- 지형 평균 표고: EL. ${meanElevation} m
- 지형 평균 경사도: ${averageSlopeDeg}°
- 추정 토공량: 절토 ${cutFillM3.cut.toLocaleString()} ㎥ / 성토 ${cutFillM3.fill.toLocaleString()} ㎥ (순토공량: ${cutFillM3.net >= 0 ? '+' : ''}${cutFillM3.net.toLocaleString()} ㎥)`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="polygon-measurement-card"
      className="absolute top-20 left-4 md:left-72 z-30 w-80 md:w-88 bg-[#091410]/95 backdrop-blur-xl border border-emerald-400/80 rounded-2xl shadow-2xl overflow-hidden ring-2 ring-emerald-500/30 text-xs text-slate-200 select-none animate-in fade-in zoom-in-95 duration-150"
    >
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-[#0d261b] via-[#113324] to-[#0d261b] p-3 border-b border-[#234232] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-lg bg-emerald-950 border border-emerald-600/70 text-emerald-400">
            <Ruler className="w-4 h-4" />
          </span>
          <div>
            <h4 className="font-extrabold text-white text-xs tracking-tight">
              다각형 부지 정밀 측정 HUD
            </h4>
            <span className="text-[10px] text-emerald-400 font-mono">
              Turf.js 2D/3D 공간연산
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          title="측정 HUD 닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 실시간 정량 메트릭 그리드 */}
      <div className="p-3 space-y-2.5">
        {/* 총면적 & 평수 카드 */}
        <div className="grid grid-cols-2 gap-2 text-center bg-[#0d1c14] p-2.5 rounded-xl border border-[#1b3425]">
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">총 실측 면적</span>
            <span className="font-mono font-black text-sm text-emerald-300">
              {areaSqm.toLocaleString()} <span className="text-xs font-normal">㎡</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-medium">평수 환산</span>
            <span className="font-mono font-black text-sm text-amber-300">
              {areaPyeong.toLocaleString()} <span className="text-xs font-normal">평</span>
            </span>
          </div>
        </div>

        {/* 둘레, 건물 수, 표고, 경사도 4대 그리드 */}
        <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#0c1611] p-2 rounded-xl border border-[#1a2e21]">
          <div className="flex items-center justify-between p-1 bg-[#122218] rounded-lg">
            <span className="text-slate-400">외곽 둘레</span>
            <span className="font-mono font-bold text-slate-200">{perimeterM.toLocaleString()} m</span>
          </div>
          <div className="flex items-center justify-between p-1 bg-[#122218] rounded-lg">
            <span className="text-slate-400 flex items-center gap-1">
              <Building className="w-3 h-3 text-cyan-400" />
              구역 내 건물
            </span>
            <span className="font-mono font-bold text-cyan-300">{buildingCount} 동</span>
          </div>
          <div className="flex items-center justify-between p-1 bg-[#122218] rounded-lg">
            <span className="text-slate-400 flex items-center gap-1">
              <Mountain className="w-3 h-3 text-amber-400" />
              평균 표고
            </span>
            <span className="font-mono font-bold text-slate-200">EL. {meanElevation} m</span>
          </div>
          <div className="flex items-center justify-between p-1 bg-[#122218] rounded-lg">
            <span className="text-slate-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              평균 경사도
            </span>
            <span className="font-mono font-bold text-emerald-300">{averageSlopeDeg}°</span>
          </div>
        </div>

        {/* 추정 토공량 (절토/성토) 요약 */}
        <div className="bg-[#0c1611] p-2 rounded-xl border border-[#1a2e21] text-[10.5px]">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-300 mb-1">
            <span className="flex items-center gap-1 text-emerald-400">
              <Boxes className="w-3 h-3 text-emerald-400" />
              추정 토공량 (Cut & Fill)
            </span>
            <span className="font-mono text-slate-400">기준고 EL.{meanElevation}m</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center font-mono">
            <div className="bg-[#142319] p-1 rounded">
              <span className="text-[9px] text-amber-400 block">절토(Cut)</span>
              <span className="font-bold text-amber-300 text-[11px]">{cutFillM3.cut.toLocaleString()} ㎥</span>
            </div>
            <div className="bg-[#142319] p-1 rounded">
              <span className="text-[9px] text-blue-400 block">성토(Fill)</span>
              <span className="font-bold text-blue-300 text-[11px]">{cutFillM3.fill.toLocaleString()} ㎥</span>
            </div>
            <div className="bg-[#142319] p-1 rounded">
              <span className="text-[9px] text-emerald-400 block">순토공</span>
              <span className="font-bold text-emerald-300 text-[11px]">
                {cutFillM3.net >= 0 ? '+' : ''}{cutFillM3.net.toLocaleString()} ㎥
              </span>
            </div>
          </div>
        </div>

        {/* 액션 버튼 그룹 */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {onOpenCutFillModal && (
            <button
              type="button"
              onClick={onOpenCutFillModal}
              className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition-all shadow-md shadow-emerald-950/60"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>3D 토공량 정밀 분석</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="py-1.5 px-2.5 rounded-xl bg-[#17271e] hover:bg-[#203629] border border-[#2d4b38] text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
            title="측정 결과 클립보드에 복사"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
            <span>{copied ? '복사됨' : '복사'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
