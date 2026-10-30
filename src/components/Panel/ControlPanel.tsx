'use client';

import React, { useState } from 'react';
import {
  Layers,
  Building2,
  Shield,
  MapPin,
  Ruler,
  Sun,
  Eye,
  Mountain,
  Play,
  Pause,
  RotateCcw,
  Check,
  Navigation,
  Sparkles,
  Clock,
  Globe,
  Building,
  CheckCircle2,
  Compass,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  Crosshair,
  TrendingUp,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import {
  GANGWON_18_MILITARY_SITES,
  getGangwon18MilitarySiteById,
} from '@/constants/gangwon18MilitarySites';

export const ControlPanel: React.FC = () => {
  const {
    baseMap,
    setBaseMap,
    layers,
    toggleLayer,
    // 부지 선택 & 비행
    selectedIdleSiteId,
    selectIdleSite,
    // 3D 측정기
    isMeasureMode,
    measureSubtype,
    measureResult,
    toggleMeasureMode,
    setMeasureSubtype,
    clearMeasure,
    // 실시간 일조권 & 태양광 시뮬레이션
    sunHour,
    setSunHour,
    isSunPlaying,
    toggleSunPlaying,
    sunSeason,
    setSunSeason,
    // 3D 가시권(Viewshed) & 지형 단면도
    isViewshedMode,
    viewshedResult,
    toggleViewshedMode,
    clearViewshed,
    showTerrainProfile,
    setShowTerrainProfile,
    toggleSlopeAnalysis,
    showSlopeAnalysis,
  } = useMapStore();

  // 인터랙티브 아코디언 상태
  const [isSunExpanded, setIsSunExpanded] = useState(false);
  const [isMeasureExpanded, setIsMeasureExpanded] = useState(false);
  const [isViewshedExpanded, setIsViewshedExpanded] = useState(false);

  // 현재 선택된 군 유휴부지 (기본값: 원주 1군지사)
  const currentSite =
    getGangwon18MilitarySiteById(selectedIdleSiteId || 'first-logistics-wonju') ||
    GANGWON_18_MILITARY_SITES[0];

  // 주요 대표 부지 퀵 칩 리스트
  const topSites = [
    { id: 'first-logistics-wonju', label: '원주 1군지사' },
    { id: 'ch-camp-page-chuncheon', label: '춘천 캠프페이지' },
    { id: 'gw-cheorwon-hwaji', label: '철원 화지리' },
    { id: 'gw-yanggu-south', label: '양구 남면' },
    { id: 'gw-goseong-gateway', label: '고성 관문' },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#0b100e]/95 backdrop-blur-md text-slate-200 select-none border-r border-[#1e2a22] font-sans">
      {/* 1. 패널 헤더 (슬림 & 글래스모피즘) */}
      <div className="px-3.5 py-3 border-b border-[#1e2a22] bg-[#0d1411]/90 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-500/20" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold tracking-tight text-white">GeoBrief 3D 공간제어</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-700/50">
                실무
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">강원 18개 시·군 실무 공간분석</p>
          </div>
        </div>
        <div className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
          60fps 실사
        </div>
      </div>

      {/* 2. 메인 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3.5 text-xs divide-y divide-[#1e2a22]/60">
        {/* ========================================================================= */}
        {/* [핵심 메뉴 2: 🗺️ 필수 레이어 ON/OFF (5대 스위치)] */}
        {/* ========================================================================= */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Layers className="w-3.5 h-3.5" />
              필수 레이어 (5종)
            </span>
            <span className="text-[10px] text-slate-500 font-normal">원클릭 토글</span>
          </div>

          <div className="space-y-1.5">
            {/* 1) 3D 실사 건축물 표시 */}
            <div
              onClick={() => toggleLayer('buildings3D')}
              role="button"
              tabIndex={0}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all ${
                layers.buildings3D
                  ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-200 shadow-sm'
                  : 'bg-[#121915]/60 border-[#1e2a22] text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2
                  className={`w-3.5 h-3.5 ${layers.buildings3D ? 'text-emerald-400' : 'text-slate-500'}`}
                />
                <div>
                  <div className="text-[11px] font-medium leading-tight">3D 실사 건축물</div>
                  <div className="text-[9px] text-slate-400">V-World 실사 텍스처 & 층수 매핑</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center border text-[9px] ${
                  layers.buildings3D
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {layers.buildings3D && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            {/* 2) 군 유휴부지 경계 & 면적 배지 표시 */}
            <div
              onClick={() => toggleLayer('militarySites')}
              role="button"
              tabIndex={0}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all ${
                layers.militarySites !== false
                  ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-200 shadow-sm'
                  : 'bg-[#121915]/60 border-[#1e2a22] text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield
                  className={`w-3.5 h-3.5 ${
                    layers.militarySites !== false ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="text-[11px] font-medium leading-tight">군 유휴부지 경계 & 배지</div>
                  <div className="text-[9px] text-slate-400">에메랄드 경계선 + 면적(㎡/평) 홀로그램</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center border text-[9px] ${
                  layers.militarySites !== false
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {layers.militarySites !== false && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            {/* 3) 연속지적도(필지 경계선) */}
            <div
              onClick={() => toggleLayer('cadastral')}
              role="button"
              tabIndex={0}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all ${
                layers.cadastral
                  ? 'bg-amber-950/40 border-amber-600/60 text-amber-200 shadow-sm'
                  : 'bg-[#121915]/60 border-[#1e2a22] text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapIcon
                  className={`w-3.5 h-3.5 ${layers.cadastral ? 'text-amber-400' : 'text-slate-500'}`}
                />
                <div>
                  <div className="text-[11px] font-medium leading-tight">연속지적도 (필지 경계선)</div>
                  <div className="text-[9px] text-slate-400">지번·지목 구획 노란색 오버레이</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center border text-[9px] ${
                  layers.cadastral
                    ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {layers.cadastral && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            {/* 4) 용도지역지구 (주거·상업·공업·녹지) */}
            <div
              onClick={() => toggleLayer('zoning')}
              role="button"
              tabIndex={0}
              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all ${
                layers.zoning
                  ? 'bg-indigo-950/40 border-indigo-600/60 text-indigo-200 shadow-sm'
                  : 'bg-[#121915]/60 border-[#1e2a22] text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building
                  className={`w-3.5 h-3.5 ${layers.zoning ? 'text-indigo-400' : 'text-slate-500'}`}
                />
                <div>
                  <div className="text-[11px] font-medium leading-tight">용도지역지구 (국토계획법)</div>
                  <div className="text-[9px] text-slate-400">주거·상업·공업·녹지 4색 투명도 매핑</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded flex items-center justify-center border text-[9px] ${
                  layers.zoning
                    ? 'bg-indigo-500 border-indigo-400 text-slate-950 font-bold'
                    : 'border-slate-600 bg-transparent'
                }`}
              >
                {layers.zoning && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </div>

            {/* 5) 베이스맵 전환 (브이월드 항공위성 ↔ 클린 일반지도) */}
            <div className="pt-0.5">
              <div className="flex items-center justify-between bg-[#121915]/80 p-1.5 rounded-lg border border-[#1e2a22]">
                <div className="flex items-center gap-1.5 pl-1">
                  <Globe className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-[10px] font-medium text-slate-300">베이스맵</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setBaseMap('satellite')}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      baseMap === 'satellite'
                        ? 'bg-teal-600 text-white font-bold shadow'
                        : 'bg-black/30 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    항공위성
                  </button>
                  <button
                    onClick={() => setBaseMap('clean')}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                      baseMap === 'clean'
                        ? 'bg-teal-600 text-white font-bold shadow'
                        : 'bg-black/30 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    클린일반
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* [핵심 메뉴 3: 📐 실무 공간분석 도구 (원클릭 버튼 4개)] */}
        {/* ========================================================================= */}
        <section className="pt-3 space-y-2">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" />
              실무 공간분석 도구 (4종)
            </span>
            <span className="text-[10px] text-slate-500 font-normal">전문 도구</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {/* 도구 1: [📏 면적·거리 측정] */}
            <div className="rounded-lg border border-[#1e2a22] overflow-hidden bg-[#111814]/70">
              <button
                onClick={() => {
                  toggleMeasureMode();
                  setIsMeasureExpanded(!isMeasureMode);
                }}
                className={`w-full flex items-center justify-between p-2 text-left transition-all ${
                  isMeasureMode
                    ? 'bg-cyan-950/60 text-cyan-200 border-b border-cyan-800/40'
                    : 'text-slate-300 hover:bg-[#16221c]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Ruler
                    className={`w-3.5 h-3.5 ${isMeasureMode ? 'text-cyan-400' : 'text-slate-400'}`}
                  />
                  <div>
                    <div className="text-[11px] font-medium leading-tight">면적·거리 측정 도구</div>
                    <div className="text-[9px] text-slate-400">지도 클릭으로 부지 면적 & 직선거리 산출</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isMeasureMode && (
                    <span className="text-[9px] px-1 py-0.2 bg-cyan-500 text-slate-950 font-bold rounded">
                      ON
                    </span>
                  )}
                  {isMeasureExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* 측정 도구 세부 옵션 및 실측 결과 배지 */}
              {(isMeasureMode || isMeasureExpanded) && (
                <div className="p-2.5 bg-black/40 space-y-2 border-t border-[#1e2a22]/60">
                  <div className="flex items-center justify-between gap-1">
                    <div className="grid grid-cols-2 gap-1 flex-1">
                      <button
                        onClick={() => setMeasureSubtype('distance')}
                        className={`py-1 text-[10px] rounded font-medium border text-center transition-all ${
                          measureSubtype === 'distance'
                            ? 'bg-cyan-600/90 text-white border-cyan-400 font-bold'
                            : 'bg-[#152119] text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                      >
                        직선 거리 (m)
                      </button>
                      <button
                        onClick={() => setMeasureSubtype('area')}
                        className={`py-1 text-[10px] rounded font-medium border text-center transition-all ${
                          measureSubtype === 'area'
                            ? 'bg-cyan-600/90 text-white border-cyan-400 font-bold'
                            : 'bg-[#152119] text-slate-400 border-transparent hover:text-slate-200'
                        }`}
                      >
                        다각형 면적 (㎡/평)
                      </button>
                    </div>
                    <button
                      onClick={clearMeasure}
                      className="px-2 py-1 text-[10px] rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 hover:bg-rose-900"
                      title="측정 초기화"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 측정 결과 표시 */}
                  {measureResult ? (
                    <div className="p-2 rounded bg-cyan-950/80 border border-cyan-700/60 space-y-1">
                      {measureResult.directDistanceMeters !== undefined && (
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400">직선 거리:</span>
                          <span className="font-mono font-bold text-cyan-300">
                            {measureResult.directDistanceMeters.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}{' '}
                            m
                            {measureResult.directDistanceMeters >= 1000 &&
                              ` (${(measureResult.directDistanceMeters / 1000).toFixed(2)} km)`}
                          </span>
                        </div>
                      )}
                      {measureResult.areaSqm !== undefined && (
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400">부지 면적:</span>
                          <span className="font-mono font-bold text-cyan-300">
                            {Math.round(measureResult.areaSqm).toLocaleString()} ㎡
                            {measureResult.areaPyeong !== undefined && (
                              <span className="text-emerald-400 ml-1">
                                ({Math.round(measureResult.areaPyeong).toLocaleString()} 평)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-cyan-400/80 bg-cyan-950/30 p-1.5 rounded border border-cyan-900/40 text-center">
                      💡 지도 위를 클릭하여 포인트를 지정하세요
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 도구 2: [☀️ 일조권·그림자 시간 조절] */}
            <div className="rounded-lg border border-[#1e2a22] overflow-hidden bg-[#111814]/70">
              <button
                onClick={() => setIsSunExpanded(!isSunExpanded)}
                className={`w-full flex items-center justify-between p-2 text-left transition-all ${
                  isSunExpanded
                    ? 'bg-amber-950/60 text-amber-200 border-b border-amber-800/40'
                    : 'text-slate-300 hover:bg-[#16221c]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sun
                    className={`w-3.5 h-3.5 ${
                      isSunExpanded ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-[11px] font-medium leading-tight">일조권·그림자 시간 조절</div>
                    <div className="text-[9px] text-slate-400">
                      태양 고도 궤적 및 건축물 그림자 시뮬레이션
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/50">
                    {sunHour}:00
                  </span>
                  {isSunExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </button>

              {isSunExpanded && (
                <div className="p-2.5 bg-black/40 space-y-2 border-t border-[#1e2a22]/60">
                  {/* 시간 슬라이더 (08:00 ~ 18:00) */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">일조 시각:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {sunHour < 12
                          ? `오전 ${sunHour}시`
                          : sunHour === 12
                          ? '정오 12시'
                          : `오후 ${sunHour - 12}시`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={18}
                      step={1}
                      value={sunHour}
                      onChange={(e) => setSunHour(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="flex justify-between text-[8px] text-slate-500 font-mono">
                      <span>08:00 (일출)</span>
                      <span>12:00</span>
                      <span>18:00 (일몰)</span>
                    </div>
                  </div>

                  {/* 재생 버튼 & 절기(동지/하지) 토글 */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={toggleSunPlaying}
                      className={`flex-1 py-1 px-2 rounded text-[10px] font-medium flex items-center justify-center gap-1 border transition-all ${
                        isSunPlaying
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold animate-pulse'
                          : 'bg-[#18231c] text-amber-300 border-amber-800/60 hover:bg-[#203126]'
                      }`}
                    >
                      {isSunPlaying ? (
                        <>
                          <Pause className="w-3 h-3" />
                          <span>정지</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" />
                          <span>시간 흐름 재생</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() =>
                        setSunSeason(
                          sunSeason === 'winter_solstice' ? 'summer_solstice' : 'winter_solstice'
                        )
                      }
                      className="px-2 py-1 rounded text-[10px] bg-[#18231c] text-slate-300 border border-slate-700 hover:text-white"
                      title="건축법상 동지/하지 기준 전환"
                    >
                      {sunSeason === 'winter_solstice' ? '동지(겨울)' : '하지(여름)'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 도구 3: [👁️ 조망권(가시권) & 지형 단면도] */}
            <div className="rounded-lg border border-[#1e2a22] overflow-hidden bg-[#111814]/70">
              <button
                onClick={() => setIsViewshedExpanded(!isViewshedExpanded)}
                className={`w-full flex items-center justify-between p-2 text-left transition-all ${
                  isViewshedExpanded
                    ? 'bg-emerald-950/60 text-emerald-200 border-b border-emerald-800/40'
                    : 'text-slate-300 hover:bg-[#16221c]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye
                    className={`w-3.5 h-3.5 ${
                      isViewshedExpanded ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-[11px] font-medium leading-tight">조망권(가시권) & 지형 단면도</div>
                    <div className="text-[9px] text-slate-400">360° 사계 가시화 및 지형 고도·토공량 분석</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isViewshedMode && (
                    <span className="text-[9px] px-1 py-0.2 bg-emerald-500 text-slate-950 font-bold rounded">
                      가시권 ON
                    </span>
                  )}
                  {isViewshedExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </button>

              {isViewshedExpanded && (
                <div className="p-2.5 bg-black/40 space-y-2 border-t border-[#1e2a22]/60">
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* 가시권 사계 토글 */}
                    <button
                      onClick={toggleViewshedMode}
                      className={`p-1.5 rounded text-[10px] font-medium border flex items-center justify-center gap-1 transition-all ${
                        isViewshedMode
                          ? 'bg-emerald-600 text-slate-950 border-emerald-400 font-bold'
                          : 'bg-[#152119] text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>{isViewshedMode ? '가시권 모드 해제' : '360° 가시권 분석'}</span>
                    </button>

                    {/* 지형 단면도 팝업 열기 */}
                    <button
                      onClick={() => setShowTerrainProfile(true)}
                      className="p-1.5 rounded text-[10px] font-medium bg-[#152119] text-emerald-300 border border-emerald-800/60 hover:bg-[#1d2d22] flex items-center justify-center gap-1"
                    >
                      <Mountain className="w-3 h-3 text-emerald-400" />
                      <span>지형 단면도 분석</span>
                    </button>
                  </div>

                  {/* 경사도 3D 레이어 토글 */}
                  <div
                    onClick={toggleSlopeAnalysis}
                    className="flex items-center justify-between p-1.5 rounded bg-[#101713] border border-[#1e2a22] cursor-pointer hover:border-slate-600"
                  >
                    <span className="text-[10px] text-slate-300">토목 지형 3단 경사도 색상 표시</span>
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[8px] ${
                        showSlopeAnalysis
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                          : 'border-slate-600'
                      }`}
                    >
                      {showSlopeAnalysis && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>

                  {isViewshedMode && (
                    <div className="flex justify-between items-center text-[10px] text-emerald-400/90 bg-emerald-950/40 p-1.5 rounded border border-emerald-800/40">
                      <span>💡 지도 클릭 지점 사계 가시화</span>
                      <button
                        onClick={clearViewshed}
                        className="text-[9px] text-rose-300 underline hover:text-rose-200"
                      >
                        결과 지우기
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 도구 4: [🏗️ 군 유휴부지 미래 개발안 비교] */}
            <div className="rounded-lg border border-[#1e2a22] overflow-hidden bg-[#111814]/70 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp
                    className={`w-3.5 h-3.5 ${
                      layers.firstLogisticsSmartCity ? 'text-blue-400' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-[11px] font-medium leading-tight">미래 개발안 3D 비교</div>
                    <div className="text-[9px] text-slate-400">군 막사 vs 미래 마스터플랜 원클릭 전환</div>
                  </div>
                </div>
              </div>

              {/* 전환 버튼 토글 */}
              <button
                onClick={() => toggleLayer('firstLogisticsSmartCity')}
                className={`w-full py-1.5 px-2 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-all ${
                  layers.firstLogisticsSmartCity
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                    : 'bg-[#18231c] text-emerald-300 border-emerald-700/60 hover:bg-[#203126]'
                }`}
              >
                {layers.firstLogisticsSmartCity ? (
                  <>
                    <Building className="w-3.5 h-3.5" />
                    <span>미래 스마트 개발 조감도 (표시 중)</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5" />
                    <span>현재 군 막사·연병장 시설 (표시 중)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* [섹션 3: 🛡️ 선택 군 유휴부지 요약 브리핑 카드] */}
        {/* ========================================================================= */}
        <section className="pt-3 space-y-2">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Shield className="w-3.5 h-3.5" />
              선택 군 유휴부지 브리핑
            </span>
            <span className="text-[10px] text-slate-500 font-normal">실측 데이터</span>
          </div>

          {/* 군 유휴부지 상세 카드 */}
          <div className="p-2.5 rounded-lg border border-emerald-800/40 bg-gradient-to-br from-[#0e1713] to-[#09100d] space-y-2 shadow-sm">
            <div className="flex items-start justify-between gap-1">
              <div>
                <div className="text-[12px] font-bold text-white leading-snug">
                  {currentSite.shortName || currentSite.name}
                </div>
                <div className="text-[9px] text-emerald-400/90 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  <span>{currentSite.regionName} | {currentSite.managingAgency}</span>
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono border border-emerald-700/50 shrink-0">
                {currentSite.areaPyeong.toLocaleString()} 평
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-black/30 p-2 rounded border border-[#1e2a22]">
              <div>
                <div className="text-[8px] text-slate-500 uppercase">부지 총면적</div>
                <div className="font-mono text-slate-200 font-semibold">
                  {currentSite.areaSqm.toLocaleString()} ㎡
                </div>
              </div>
              <div>
                <div className="text-[8px] text-slate-500 uppercase">계획 용도</div>
                <div className="text-emerald-300 font-medium truncate" title={currentSite.targetUse}>
                  {currentSite.targetUse || currentSite.themeTitle}
                </div>
              </div>
            </div>

            {/* 원클릭 해당 부지 비행 버튼 */}
            <button
              onClick={() => selectIdleSite(currentSite.id)}
              className="w-full py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-[11px] flex items-center justify-center gap-1.5 shadow transition-all"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>부지 상공 3D 입체 비행</span>
            </button>
          </div>

          {/* 빠른 부지 전환 칩 */}
          <div className="space-y-1">
            <div className="text-[9px] text-slate-500">주요 전략 군 유휴부지 바로가기:</div>
            <div className="flex flex-wrap gap-1">
              {topSites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => selectIdleSite(site.id)}
                  className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-all ${
                    currentSite.id === site.id
                      ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                      : 'bg-[#121915] text-slate-400 border-[#1e2a22] hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {site.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* 3. 패널 푸터 (실측 팝업 가이드 안내) */}
      <div className="p-2.5 bg-[#0d1411] border-t border-[#1e2a22] text-[10px] text-slate-400 flex items-start gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <span className="leading-tight">
          지도에서 <strong className="text-white">건물</strong>이나{' '}
          <strong className="text-white">필지</strong>를 클릭하면 우측에 실측 건축물대장·지적도 상세 카드가 열립니다.
        </span>
      </div>
    </div>
  );
};
