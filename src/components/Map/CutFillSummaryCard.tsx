'use client';

import React from 'react';
import { useMapStore } from '@/store/useMapStore';
import { Boxes, Truck, ArrowDown, ArrowUp, Scale, X, Sparkles } from 'lucide-react';

export const CutFillSummaryCard: React.FC = () => {
  const {
    cutFill,
    setCutFillTargetElevation,
    setCutFillGridSize,
    toggleCutFill,
    showTitleBlock,
  } = useMapStore();

  const result = cutFill.result;
  if (!cutFill.enabled || !result) return null;

  const netPositive = result.netVolumeM3 >= 0;

  // 도면 표제란(TitleBlock) 표시 여부에 따라 우측 위치 유동 조정
  const positionClass = showTitleBlock
    ? 'bottom-8 right-6 md:right-[390px]'
    : 'bottom-8 right-6';

  return (
    <div
      className={`absolute ${positionClass} z-25 select-none pointer-events-auto animate-fade-in transition-all duration-300`}
    >
      <div className="w-[330px] sm:w-[360px] bg-[#07110d]/95 backdrop-blur-md border border-emerald-500/80 rounded-xl shadow-2xl overflow-hidden ring-1 ring-emerald-500/40 text-xs">
        {/* 상단 헤더 */}
        <div className="bg-[#0e2117] border-b border-emerald-700/60 px-3.5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-emerald-950 border border-emerald-600/70 text-emerald-400">
              <Boxes className="w-3.5 h-3.5" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-slate-100 text-[11.5px] tracking-tight">
                  3D 토공량(Cut & Fill) 산출서
                </span>
                <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                  {result.gridSizeMeters}m 격자
                </span>
              </div>
              <p className="text-[9.5px] text-emerald-300/80 font-mono">
                총 {result.totalCellCount}개 격자 ({(result.sampledAreaSqm).toLocaleString()}㎡)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleCutFill}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
            title="토공량 계산기 닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 바디 콘텐츠 */}
        <div className="p-3 space-y-2.5">
          {/* 1. 계획 정지 표고 & 원지반 통계 */}
          <div className="bg-[#0b1711] p-2.5 rounded-lg border border-[#1b3325] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] text-slate-300 font-semibold flex items-center gap-1">
                <span>목표 계획 표고 (Base EL.)</span>
              </span>
              <span className="text-sm font-extrabold font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60">
                EL. {result.targetElevation} m
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-[#162a1e]">
              <span>원지반: 평균 {result.avgElevation}m</span>
              <span>(최저 {result.minElevation}m ~ 최고 {result.maxElevation}m)</span>
            </div>
          </div>

          {/* 2. 절토 / 성토 / 순토공량 3단 매트릭스 */}
          <div className="grid grid-cols-2 gap-2">
            {/* 절토량 (Cut) */}
            <div className="bg-[#241013]/90 border border-rose-500/60 rounded-lg p-2 space-y-1">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-rose-300 font-bold flex items-center gap-1">
                  <ArrowDown className="w-3 h-3 text-rose-400" />
                  절토 (Cut)
                </span>
                <span className="text-[9px] px-1 rounded bg-rose-950 text-rose-300 border border-rose-800/60">
                  깎아낼 토사
                </span>
              </div>
              <div className="text-base font-extrabold text-rose-400 font-mono">
                {result.totalCutVolumeM3.toLocaleString()} <span className="text-[10px] font-normal">㎥</span>
              </div>
              <div className="text-[9.5px] text-rose-200/90 font-mono flex items-center gap-1">
                <Truck className="w-3 h-3 text-rose-400" />
                <span>15t 덤프 <strong>{result.dumpTruck15tCutCount.toLocaleString()}</strong>대 반출</span>
              </div>
            </div>

            {/* 성토량 (Fill) */}
            <div className="bg-[#0e1a2b]/90 border border-blue-500/60 rounded-lg p-2 space-y-1">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-blue-300 font-bold flex items-center gap-1">
                  <ArrowUp className="w-3 h-3 text-blue-400" />
                  성토 (Fill)
                </span>
                <span className="text-[9px] px-1 rounded bg-blue-950 text-blue-300 border border-blue-800/60">
                  메워야할 토사
                </span>
              </div>
              <div className="text-base font-extrabold text-blue-400 font-mono">
                {result.totalFillVolumeM3.toLocaleString()} <span className="text-[10px] font-normal">㎥</span>
              </div>
              <div className="text-[9.5px] text-blue-200/90 font-mono flex items-center gap-1">
                <Truck className="w-3 h-3 text-blue-400" />
                <span>15t 덤프 <strong>{result.dumpTruck15tFillCount.toLocaleString()}</strong>대 반입</span>
              </div>
            </div>
          </div>

          {/* 3. 순 토공량 (Net Volume) 및 수급 분석 */}
          <div className="p-2 rounded-lg bg-[#0e1813] border border-[#233c2c] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <div>
                <span className="font-bold text-slate-200">
                  순 토공량 (Net Volume)
                </span>
                <span className="text-[9.5px] text-slate-400 block font-mono">
                  {netPositive ? '토사 잔여 → 외부 반출 필요' : '토사 부족 → 외부 반입 필요'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-sm font-extrabold font-mono ${
                  netPositive ? 'text-rose-400' : 'text-blue-400'
                }`}
              >
                {Math.abs(result.netVolumeM3).toLocaleString()} ㎥
              </span>
              <span className="text-[9px] text-slate-300 block font-mono">
                (환산 {result.dumpTruck15tNetCount.toLocaleString()}대분)
              </span>
            </div>
          </div>

          {/* 4. 절토/균형/성토 면적 비례 프로그레스 바 & 범례 */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex border border-slate-700/60">
              <div
                className="bg-[#EF4444] h-full transition-all duration-300"
                style={{ width: `${result.cutAreaPercent}%` }}
                title={`절토: ${result.cutAreaPercent}% (${result.cutCellCount}셀)`}
              />
              <div
                className="bg-[#10B981] h-full transition-all duration-300"
                style={{ width: `${result.balancedAreaPercent}%` }}
                title={`균형(±0.5m): ${result.balancedAreaPercent}% (${result.balancedCellCount}셀)`}
              />
              <div
                className="bg-[#3B82F6] h-full transition-all duration-300"
                style={{ width: `${result.fillAreaPercent}%` }}
                title={`성토: ${result.fillAreaPercent}% (${result.fillCellCount}셀)`}
              />
            </div>

            <div className="flex justify-between text-[9px] font-mono px-0.5">
              <span className="text-rose-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                절토 {result.cutAreaPercent}% ({result.cutCellCount}셀)
              </span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                균형 {result.balancedAreaPercent}%
              </span>
              <span className="text-blue-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                성토 {result.fillAreaPercent}% ({result.fillCellCount}셀)
              </span>
            </div>
          </div>

          {/* 5. 인터랙티브 계획고 조절 슬라이더 & 평형고 원클릭 맞춤 */}
          <div className="space-y-1.5 pt-1.5 border-t border-[#182c20]">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300">계획 표고 실시간 튜닝</span>
              <button
                type="button"
                onClick={() => setCutFillTargetElevation(Math.round(result.zeroBalanceElevation))}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-300 text-[9.5px] font-bold transition-all shadow-sm group"
                title="절토량과 성토량이 같아져 반출입 비용이 최소화되는 토량 평형고로 자동 설정"
              >
                <Sparkles className="w-2.5 h-2.5 text-emerald-400 group-hover:rotate-12 transition-transform" />
                <span>토량 평형고(EL. {Math.round(result.zeroBalanceElevation)}m) 맞춤</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-400">
                {Math.floor(result.minElevation - 5)}m
              </span>
              <input
                type="range"
                min={Math.floor(result.minElevation - 10)}
                max={Math.ceil(result.maxElevation + 10)}
                step={1}
                value={result.targetElevation}
                onChange={(e) => setCutFillTargetElevation(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <span className="text-[9px] font-mono text-slate-400">
                {Math.ceil(result.maxElevation + 5)}m
              </span>
            </div>

            {/* 격자 해상도 전환 버튼 */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[9.5px] text-slate-400">격자 정밀도:</span>
              <div className="flex items-center gap-1">
                {([10, 5] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setCutFillGridSize(size)}
                    className={`px-2 py-0.5 rounded text-[9.5px] font-semibold transition-all border ${
                      result.gridSizeMeters === size
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-sm'
                        : 'bg-[#122218] border-emerald-800/40 text-emerald-300 hover:bg-[#1a3324]'
                    }`}
                  >
                    {size}m x {size}m {size === 5 ? '(초정밀)' : '(표준)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
