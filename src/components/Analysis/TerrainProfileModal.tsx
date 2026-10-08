'use client';

import React, { useState } from 'react';
import {
  Mountain,
  TrendingUp,
  Layers,
  X,
  Minimize2,
  Maximize2,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { SlopeAnalysisResult, ElevationProfileResult } from '@/utils/terrainAnalysis';

interface TerrainProfileModalProps {
  slopeResult: SlopeAnalysisResult | null;
  profileResult: ElevationProfileResult | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TerrainProfileModal: React.FC<TerrainProfileModalProps> = ({
  slopeResult,
  profileResult,
  isOpen,
  onClose,
}) => {
  const { showSlopeAnalysis, toggleSlopeAnalysis } = useMapStore();
  const [isMinimized, setIsMinimized] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{
    distanceM: number;
    elevation: number;
    x: number;
    y: number;
  } | null>(null);

  if (!isOpen || !slopeResult || !profileResult) {
    return null;
  }

  // SVG 차트 좌표 변환 계산
  const svgWidth = 460;
  const svgHeight = 130;
  const padding = { top: 20, right: 25, bottom: 25, left: 45 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  const points = profileResult.points;
  const minE = Math.max(0, profileResult.minElev - 5);
  const maxE = profileResult.maxElev + 10;
  const rangeE = Math.max(1, maxE - minE);

  // SVG path 생성
  const coords = points.map((p, idx) => {
    const x = padding.left + (idx / (points.length - 1)) * chartW;
    const y = padding.top + chartH - ((p.elevation - minE) / rangeE) * chartH;
    return { x, y, p };
  });

  const pathD = coords.reduce(
    (acc, curr, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`,
    ''
  );

  const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${
    coords[0].x.toFixed(1)
  } ${padding.top + chartH} Z`;

  // 최저점, 최고점 찾기
  let maxPoint = coords[0];
  let minPoint = coords[0];
  coords.forEach((c) => {
    if (c.p.elevation > maxPoint.p.elevation) maxPoint = c;
    if (c.p.elevation < minPoint.p.elevation) minPoint = c;
  });

  return (
    <div
      className={`fixed bottom-12 left-4 z-30 transition-all duration-300 font-sans select-none ${
        isMinimized ? 'w-auto' : 'w-[500px]'
      }`}
    >
      <div className="bg-[#0e1611]/95 backdrop-blur-md border border-[#223828] rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* 헤더 */}
        <div className="px-3.5 py-2.5 bg-[#14231b] border-b border-[#223828] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-emerald-950/80 border border-emerald-600/50 text-emerald-400">
              <Mountain className="w-4 h-4" />
            </span>
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>토목·도시계획 지형 분석</span>
                <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-medium">
                  DEM 프로파일
                </span>
              </div>
              <p className="text-[10px] text-slate-400">경사도 3단 분석 및 해발고도 횡단면도</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded hover:bg-[#1f3627] text-slate-400 hover:text-slate-200 transition-colors"
              title={isMinimized ? '창 확대' : '창 축소'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition-colors"
              title="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 본문 (최소화 아닐 때) */}
        {!isMinimized && (
          <div className="p-3.5 space-y-3">
            {/* 정량 지표 4대 요약 카드 */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-[#111e16] border border-[#233b2a]">
                <div className="text-[9.5px] text-slate-400 font-medium">평균 경사도</div>
                <div
                  className={`text-sm font-bold font-mono mt-0.5 ${
                    slopeResult.avgSlope <= 15
                      ? 'text-emerald-400'
                      : slopeResult.avgSlope <= 25
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {slopeResult.avgSlope}°
                </div>
              </div>

              <div className="p-2 rounded-lg bg-[#111e16] border border-[#233b2a]">
                <div className="text-[9.5px] text-slate-400 font-medium">최대 표고차</div>
                <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
                  {slopeResult.deltaElev}m
                </div>
              </div>

              <div className="p-2 rounded-lg bg-[#111e16] border border-[#233b2a]">
                <div className="text-[9.5px] text-slate-400 font-medium">표고 범위 (EL.)</div>
                <div className="text-[11px] font-bold font-mono text-slate-200 mt-1">
                  {slopeResult.minElev} ~ {slopeResult.maxElev}m
                </div>
              </div>

              <div className="p-2 rounded-lg bg-[#111e16] border border-[#233b2a]">
                <div className="text-[9.5px] text-slate-400 font-medium">개발 용이율</div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                  {slopeResult.gentlePct}%
                </div>
              </div>
            </div>

            {/* 3단계 경사도 등급 분포 바 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  경사도 3단 분류 구성비
                </span>
                <span className="text-[9.5px] text-slate-400 font-mono">
                  총 {slopeResult.totalCells}개 샘플 셀
                </span>
              </div>

              {/* 멀티 컬러 프로그레스 바 */}
              <div className="h-2.5 w-full bg-[#16271c] rounded-full overflow-hidden flex shadow-inner border border-[#213827]">
                <div
                  style={{ width: `${slopeResult.gentlePct}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`개발 용이 (≤15°): ${slopeResult.gentlePct}%`}
                />
                <div
                  style={{ width: `${slopeResult.moderatePct}%` }}
                  className="bg-amber-500 h-full transition-all duration-500"
                  title={`조건부 개발 (15~25°): ${slopeResult.moderatePct}%`}
                />
                <div
                  style={{ width: `${slopeResult.steepPct}%` }}
                  className="bg-rose-500 h-full transition-all duration-500"
                  title={`급경사 보전 (>25°): ${slopeResult.steepPct}%`}
                />
              </div>

              {/* 등급별 레전드 */}
              <div className="grid grid-cols-3 text-[10px] gap-1 pt-0.5">
                <div className="flex items-center space-x-1 text-slate-300">
                  <span className="w-2 h-2 rounded-sm bg-emerald-500 flex-shrink-0" />
                  <span className="truncate">개발 용이(≤15°):</span>
                  <span className="font-bold text-emerald-400 font-mono ml-auto">
                    {slopeResult.gentlePct}%
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-slate-300">
                  <span className="w-2 h-2 rounded-sm bg-amber-500 flex-shrink-0" />
                  <span className="truncate">조건부(15~25°):</span>
                  <span className="font-bold text-amber-400 font-mono ml-auto">
                    {slopeResult.moderatePct}%
                  </span>
                </div>
                <div className="flex items-center space-x-1 text-slate-300">
                  <span className="w-2 h-2 rounded-sm bg-rose-500 flex-shrink-0" />
                  <span className="truncate">급경사(&gt;25°):</span>
                  <span className="font-bold text-rose-400 font-mono ml-auto">
                    {slopeResult.steepPct}%
                  </span>
                </div>
              </div>
            </div>

            {/* 고도 단면도 (Elevation Profile Cross-Section SVG 차트) */}
            <div className="space-y-1 pt-1 border-t border-[#1b2f21]">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <span>■ 부지 횡단 고도 단면도</span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    (서→동 {profileResult.totalLengthM}m)
                  </span>
                </span>
                <span className="text-[9.5px] font-mono text-cyan-300">
                  EL. {profileResult.minElev}m → {profileResult.maxElev}m
                </span>
              </div>

              {/* 인터랙티브 SVG 차트 */}
              <div className="relative bg-[#09110b] rounded-lg border border-[#1b2e20] p-1.5 overflow-hidden">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-28 overflow-visible"
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <defs>
                    <linearGradient id="profileGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#047857" stopOpacity="0.05" />
                    </linearGradient>
                    <pattern id="profileGrid" width="40" height="20" patternUnits="userSpaceOnUse">
                      <line x1="0" y1="20" x2="40" y2="20" stroke="#1c2f22" strokeWidth="0.8" />
                    </pattern>
                  </defs>

                  {/* 배경 그리드 라인 */}
                  <rect
                    x={padding.left}
                    y={padding.top}
                    width={chartW}
                    height={chartH}
                    fill="url(#profileGrid)"
                  />

                  {/* Y축 고도 라벨 */}
                  <text
                    x={padding.left - 6}
                    y={padding.top + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {maxE}m
                  </text>
                  <text
                    x={padding.left - 6}
                    y={padding.top + chartH / 2 + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {Math.round((maxE + minE) / 2)}m
                  </text>
                  <text
                    x={padding.left - 6}
                    y={padding.top + chartH}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {minE}m
                  </text>

                  {/* X축 거리 라벨 */}
                  <text
                    x={padding.left}
                    y={svgHeight - 6}
                    textAnchor="start"
                    fill="#64748b"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    0m (서)
                  </text>
                  <text
                    x={padding.left + chartW}
                    y={svgHeight - 6}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="8.5"
                    fontFamily="monospace"
                  >
                    {profileResult.totalLengthM}m (동)
                  </text>

                  {/* 단면도 면적 채우기 & 외곽선 */}
                  <path d={areaD} fill="url(#profileGradient)" />
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* 최고점 마커 */}
                  <circle cx={maxPoint.x} cy={maxPoint.y} r="3" fill="#EF4444" stroke="#FFF" strokeWidth="1" />
                  <text
                    x={maxPoint.x}
                    y={maxPoint.y - 6}
                    textAnchor="middle"
                    fill="#F87171"
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    최고 {maxPoint.p.elevation}m
                  </text>

                  {/* 최저점 마커 */}
                  <circle cx={minPoint.x} cy={minPoint.y} r="3" fill="#3B82F6" stroke="#FFF" strokeWidth="1" />
                  <text
                    x={minPoint.x}
                    y={minPoint.y + 12}
                    textAnchor="middle"
                    fill="#60A5FA"
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    최저 {minPoint.p.elevation}m
                  </text>

                  {/* 인터랙티브 마우스 호버 트래커 */}
                  {coords.map((c, idx) => (
                    <circle
                      key={idx}
                      cx={c.x}
                      cy={c.y}
                      r="6"
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() =>
                        setHoveredPoint({
                          distanceM: c.p.distanceM,
                          elevation: c.p.elevation,
                          x: c.x,
                          y: c.y,
                        })
                      }
                    />
                  ))}

                  {/* 호버 툴팁 */}
                  {hoveredPoint && (
                    <g>
                      <line
                        x1={hoveredPoint.x}
                        y1={padding.top}
                        x2={hoveredPoint.x}
                        y2={padding.top + chartH}
                        stroke="#F59E0B"
                        strokeWidth="1"
                        strokeDasharray="2,2"
                      />
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="3.5"
                        fill="#F59E0B"
                        stroke="#FFF"
                        strokeWidth="1.5"
                      />
                    </g>
                  )}
                </svg>

                {/* 호버 값 표시 */}
                {hoveredPoint && (
                  <div className="absolute top-2 right-3 px-2 py-0.5 rounded bg-[#132219]/90 border border-amber-500/50 text-[10px] font-mono text-amber-300">
                    거리 {hoveredPoint.distanceM}m | 표고 EL. +{hoveredPoint.elevation}m
                  </div>
                )}
              </div>
            </div>

            {/* 레이어 토글 스위치 바 */}
            <div className="pt-1 flex items-center justify-between bg-[#111e15] p-2 rounded-lg border border-[#203626]">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[10.5px] font-semibold text-slate-200">
                    지도 경사도 격자 오버레이
                  </div>
                  <div className="text-[9.5px] text-slate-400">
                    부지 내부 10x10 격자별 등급 색상 표출
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleSlopeAnalysis}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showSlopeAnalysis ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showSlopeAnalysis ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
