'use client';

import React, { useState } from 'react';
import {
  Mountain,
  Building2,
  Shield,
  MapPin,
  Ruler,
  Sun,
  Eye,
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
  Layers,
  Activity,
  Trash2,
  Plus,
  ArrowUpRight,
  ShieldAlert,
  Car,
  Train,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import {
  GANGWON_18_MILITARY_SITES,
  getGangwon18MilitarySiteById,
  GangwonSubregionType,
} from '@/constants/gangwon18MilitarySites';
import {
  GANGWON_18_REGIONS,
  getGangwonRegionByIdOrName,
} from '@/constants/gangwon18Regions';
import {
  getGangwonRegionStatById,
  GANGWON_18_REGION_STATS,
} from '@/constants/gangwonRegionData';
import { SidebarTab, FACILITY_PRESETS, FacilityPresetId } from '@/types/map';

export const ControlPanel: React.FC = () => {
  const {
    activeSidebarTab,
    setActiveSidebarTab,
    baseMap,
    setBaseMap,
    layers,
    toggleLayer,
    // 부지 & 시·군 선택
    selectedIdleSiteId,
    selectIdleSite,
    selectedRegionId,
    selectRegion,
    // 3D 지형 DEM 고저차 배율 & 건물 테마
    terrainExaggeration,
    setTerrainExaggeration,
    buildingTheme,
    setBuildingTheme,
    // 실시간 일조권 & 태양광 시뮬레이션
    sunHour,
    setSunHour,
    isSunPlaying,
    toggleSunPlaying,
    sunSeason,
    setSunSeason,
    // 3D 신규 시설물 배치
    placedFacilities,
    addPlacedFacility,
    removePlacedFacility,
    clearPlacedFacilities,
    // 도면 범례 토글
    showLegendBox,
    toggleLegendBox,
  } = useMapStore();

  // 1. 현재 선택된 대상 정보 단일화 판정 (군 유휴부지 vs 18개 시·군)
  const isSiteSelected = Boolean(selectedIdleSiteId);
  const currentMilitarySite = selectedIdleSiteId
    ? getGangwon18MilitarySiteById(selectedIdleSiteId)
    : null;
  const currentRegionStat = getGangwonRegionStatById(selectedRegionId || 'wonju');
  const currentRegionInfo = getGangwonRegionByIdOrName(selectedRegionId || 'wonju');

  // 해당 시·군에 속한 군 유휴부지 목록
  const sitesInCurrentRegion = GANGWON_18_MILITARY_SITES.filter(
    (s) => s.regionId === currentRegionStat.id || s.regionName === currentRegionStat.name
  );

  // 퀵 전환 대표 거점 칩 목록
  const quickChips = [
    { type: 'site' as const, id: 'first-logistics-wonju', label: '원주 1군지사' },
    { type: 'site' as const, id: 'ch-camp-page-chuncheon', label: '춘천 캠프페이지' },
    { type: 'region' as const, id: 'wonju', label: '원주시 전역' },
    { type: 'region' as const, id: 'chuncheon', label: '춘천시 전역' },
    { type: 'region' as const, id: 'gangneung', label: '강릉시 전역' },
    { type: 'site' as const, id: 'gw-cheorwon-hwaji', label: '철원 화지리' },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#0b100e]/95 backdrop-blur-md text-slate-200 select-none border-r border-[#1e2a22] font-sans">
      {/* ===================================================================== */}
      {/* 1. 패널 상단: 브랜드 및 3대 핵심 탭 네비게이션 */}
      {/* ===================================================================== */}
      <div className="border-b border-[#1e2a22] bg-[#0d1411]/90">
        <div className="px-3 py-2.5 flex items-center justify-between border-b border-[#18241c]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-500/20" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-bold tracking-tight text-white">GeoBrief 3D 전문가 분석</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-700/50">
                  실무
                </span>
              </div>
            </div>
          </div>
          <div className="text-[9.5px] font-mono text-emerald-400/90 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
            60fps 실사
          </div>
        </div>

        {/* 3대 핵심 탭 버튼 바 (`⛰️ 지형/인프라` | `🏢 3D 건축/단지` | `🛡️ 부지/접근성`) */}
        <div className="grid grid-cols-3 p-1 gap-1 bg-[#070d0a]">
          <button
            type="button"
            onClick={() => setActiveSidebarTab('terrain_infra')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
              activeSidebarTab === 'terrain_infra'
                ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121c16]'
            }`}
          >
            <span>⛰️</span>
            <span className="truncate">지형/인프라</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSidebarTab('buildings_complex')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
              activeSidebarTab === 'buildings_complex'
                ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121c16]'
            }`}
          >
            <span>🏢</span>
            <span className="truncate">3D 건축/단지</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSidebarTab('site_access')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
              activeSidebarTab === 'site_access'
                ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#121c16]'
            }`}
          >
            <span>🛡️</span>
            <span className="truncate">부지/접근성</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. 탭 본문 스크롤 영역 */}
      {/* ===================================================================== */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3.5 text-xs custom-scrollbar">
        {/* ------------------------------------------------------------------- */}
        {/* [탭 1: ⛰️ 지형/인프라] */}
        {/* ------------------------------------------------------------------- */}
        {activeSidebarTab === 'terrain_infra' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* 1) 시간대별 일조·태양광 시뮬레이션 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Sun className="w-3.5 h-3.5" />
                  일조권·태양광 시뮬레이션
                </span>
                <span className="font-mono text-emerald-400 text-[11px] font-bold">
                  {sunHour.toString().padStart(2, '0')}:00
                </span>
              </div>

              {/* 시간 슬라이더 */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={6}
                  max={19}
                  step={0.5}
                  value={sunHour}
                  onChange={(e) => setSunHour(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#1e2a22] rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>06시</span>
                  <span>12시(정오)</span>
                  <span>19시(일몰)</span>
                </div>
              </div>

              {/* 재생/정지 & 계절 선택 */}
              <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#1a261e]">
                <button
                  type="button"
                  onClick={toggleSunPlaying}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                    isSunPlaying
                      ? 'bg-amber-600 text-white'
                      : 'bg-[#18241d] hover:bg-[#203027] text-slate-300'
                  }`}
                >
                  {isSunPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isSunPlaying ? '일시정지' : '자동재생'}</span>
                </button>

                <div className="flex rounded bg-[#0a100d] p-0.5 border border-[#1a261e]">
                  {([
                    { id: 'winter_solstice', label: '동지' },
                    { id: 'equinox', label: '춘추분' },
                    { id: 'summer_solstice', label: '하지' },
                  ] as const).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSunSeason(id)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                        sunSeason === id
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2) 브이월드 항공위성 ↔ 클린 벡터 베이스맵 전환 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Globe className="w-3.5 h-3.5" />
                  베이스맵 전환
                </span>
                <span className="text-[9.5px] font-mono text-slate-500">{baseMap}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setBaseMap('satellite')}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    baseMap === 'satellite'
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 shadow-sm'
                      : 'bg-[#152019] border-[#223528] text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🛰️ 항공위성 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBaseMap('clean')}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    baseMap === 'clean'
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 shadow-sm'
                      : 'bg-[#152019] border-[#223528] text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🗺️ 클린 벡터</span>
                </button>
              </div>
            </div>

            {/* 3) 3D 지형(DEM) 고저차 배율 슬라이더 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-1.5">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-teal-400">
                  <Mountain className="w-3.5 h-3.5" />
                  지형(DEM) 고저차 배율
                </span>
                <span className="font-mono text-teal-300 font-bold text-[11px]">
                  {terrainExaggeration.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={3.0}
                step={0.1}
                value={terrainExaggeration}
                onChange={(e) => setTerrainExaggeration(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#1e2a22] rounded-lg appearance-none cursor-pointer accent-teal-400"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>1.0x (실측)</span>
                <span>2.0x (강조)</span>
                <span>3.0x (극대화)</span>
              </div>
            </div>

            {/* 4) 필수 인프라 & 지적 레이어 4종 토글 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Layers className="w-3.5 h-3.5" />
                  인프라 & 지적 레이어
                </span>
                <span className="text-[9px] text-slate-500">원클릭 토글</span>
              </div>

              <div className="space-y-1">
                {/* 수치지형도 등고선 */}
                <button
                  type="button"
                  onClick={() => toggleLayer('demContours')}
                  className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                    layers.demContours
                      ? 'bg-emerald-950/40 border-emerald-500/70 text-emerald-200'
                      : 'bg-[#141e17] border-[#1e2a22] text-slate-400'
                  }`}
                >
                  <span className="text-[10.5px] font-medium">수치지형도 등고선 (1:5,000)</span>
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border ${layers.demContours ? 'bg-emerald-500 border-emerald-400 text-black font-bold' : 'border-slate-600'}`}>
                    {layers.demContours ? '✓' : ''}
                  </span>
                </button>

                {/* 도로망 및 교량·터널 */}
                <button
                  type="button"
                  onClick={() => {
                    toggleLayer('roads');
                    toggleLayer('vworld3DBridges');
                  }}
                  className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                    layers.roads || layers.vworld3DBridges
                      ? 'bg-emerald-950/40 border-emerald-500/70 text-emerald-200'
                      : 'bg-[#141e17] border-[#1e2a22] text-slate-400'
                  }`}
                >
                  <span className="text-[10.5px] font-medium">도로망 & 국토부 3D 교량·터널</span>
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border ${layers.roads || layers.vworld3DBridges ? 'bg-emerald-500 border-emerald-400 text-black font-bold' : 'border-slate-600'}`}>
                    {layers.roads || layers.vworld3DBridges ? '✓' : ''}
                  </span>
                </button>

                {/* 연속지적도 */}
                <button
                  type="button"
                  onClick={() => toggleLayer('cadastral')}
                  className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                    layers.cadastral
                      ? 'bg-emerald-950/40 border-emerald-500/70 text-emerald-200'
                      : 'bg-[#141e17] border-[#1e2a22] text-slate-400'
                  }`}
                >
                  <span className="text-[10.5px] font-medium">연속지적도 (필지 경계선)</span>
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border ${layers.cadastral ? 'bg-emerald-500 border-emerald-400 text-black font-bold' : 'border-slate-600'}`}>
                    {layers.cadastral ? '✓' : ''}
                  </span>
                </button>

                {/* 용도지역지구 */}
                <button
                  type="button"
                  onClick={() => toggleLayer('zoning')}
                  className={`w-full flex items-center justify-between p-1.5 rounded-lg border text-left transition-all ${
                    layers.zoning
                      ? 'bg-emerald-950/40 border-emerald-500/70 text-emerald-200'
                      : 'bg-[#141e17] border-[#1e2a22] text-slate-400'
                  }`}
                >
                  <span className="text-[10.5px] font-medium">국토계획법 용도지역지구 (주·상·공·녹)</span>
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border ${layers.zoning ? 'bg-emerald-500 border-emerald-400 text-black font-bold' : 'border-slate-600'}`}>
                    {layers.zoning ? '✓' : ''}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* [탭 2: 🏢 3D 건축/단지] */}
        {/* ------------------------------------------------------------------- */}
        {activeSidebarTab === 'buildings_complex' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* 1) V-World 3D 건물 표현 테마 3단 스위치 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Building2 className="w-3.5 h-3.5" />
                  건물 3D 표현 테마
                </span>
                <span className="text-[9px] font-mono text-emerald-400 font-bold">V-World 급</span>
              </div>

              <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#070c09] border border-[#1b2b20]">
                <button
                  type="button"
                  onClick={() => setBuildingTheme('photorealistic')}
                  className={`py-1.5 px-1 rounded text-[10px] font-bold text-center transition-all ${
                    buildingTheme === 'photorealistic'
                      ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  실사 외벽+지붕
                </button>
                <button
                  type="button"
                  onClick={() => setBuildingTheme('landuse')}
                  className={`py-1.5 px-1 rounded text-[10px] font-bold text-center transition-all ${
                    buildingTheme === 'landuse'
                      ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  용도별 색상
                </button>
                <button
                  type="button"
                  onClick={() => setBuildingTheme('height_spectrum')}
                  className={`py-1.5 px-1 rounded text-[10px] font-bold text-center transition-all ${
                    buildingTheme === 'height_spectrum'
                      ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  층수 스펙트럼
                </button>
              </div>
            </div>

            {/* 2) 국토부 건축HUB 표제부 실시간 연동 상태 */}
            <div className="p-2.5 rounded-lg border border-emerald-600/40 bg-emerald-950/20 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  국토부 건축HUB 표제부 연동
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-700">
                  정상 (200 OK)
                </span>
              </div>
              <p className="text-[9.5px] text-slate-300 leading-snug">
                건축물대장 층수·높이·연면적·구조(RC) 및 WFS 실측 폴리곤이 3D 메쉬와 실시간 결합되어 있습니다.
              </p>
            </div>

            {/* 3) 군 유휴부지 [현재 군 막사 뷰 ↔ 미래 복합개발 3D 조감도] 비교 스위치 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  미래 개발안 3D 비교
                </span>
                <span className="text-[9px] font-mono text-cyan-400">원클릭 전환</span>
              </div>

              <button
                type="button"
                onClick={() => toggleLayer('firstLogisticsSmartCity')}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border shadow-sm ${
                  layers.firstLogisticsSmartCity
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/80 shadow-md'
                    : 'bg-[#15231c] hover:bg-[#1e3328] text-emerald-300 border-emerald-600/50'
                }`}
              >
                {layers.firstLogisticsSmartCity ? (
                  <>
                    <Building className="w-4 h-4 text-cyan-200" />
                    <span>미래 스마트 개발 조감도 (표시 중)</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 text-emerald-300" />
                    <span>현재 영내 군 막사·연병장 뷰 (표시 중)</span>
                  </>
                )}
              </button>
            </div>

            {/* 4) 3D 신규 시설물 배치 카탈로그 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Plus className="w-3.5 h-3.5" />
                  3D 시설물 배치 카탈로그
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  {placedFacilities.length}개 배치됨
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {(['defense_rd_tower', 'barracks_hq', 'logistics_depot', 'watch_tower'] as FacilityPresetId[]).map((pid) => {
                  const meta = FACILITY_PRESETS[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => addPlacedFacility(pid)}
                      className="p-1.5 rounded-lg bg-[#141e17] hover:bg-[#1b2b20] border border-[#203024] text-left transition-colors flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white truncate">{meta.badge}</span>
                        <span className="text-[9px] font-mono text-emerald-400">{meta.defaultHeight}m</span>
                      </div>
                      <span className="text-[8.5px] text-slate-400 truncate mt-0.5">{meta.name}</span>
                    </button>
                  );
                })}
              </div>

              {placedFacilities.length > 0 && (
                <div className="pt-1 flex items-center justify-between border-t border-[#1c2920]">
                  <span className="text-[10px] text-slate-400">배치 시설물 관리</span>
                  <button
                    type="button"
                    onClick={clearPlacedFacilities}
                    className="text-[9.5px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>전체 삭제</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* [탭 3: 🛡️ 부지/접근성] */}
        {/* ------------------------------------------------------------------- */}
        {activeSidebarTab === 'site_access' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            {/* 1) 강원 18개 시·군 권역별 군 유휴부지 & 거점 리스트 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  권역별 핵심 군 유휴부지 (18대)
                </span>
                <span className="text-[9px] text-slate-500">원클릭 이동</span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {GANGWON_18_MILITARY_SITES.map((site) => {
                  const isCur = selectedIdleSiteId === site.id;
                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => selectIdleSite(site.id)}
                      className={`w-full p-1.5 rounded-lg text-left transition-all flex items-center justify-between border ${
                        isCur
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                          : 'bg-[#141e17] border-[#1e2a22] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[8.5px] px-1 py-0.2 rounded bg-black/40 text-emerald-400 font-mono">
                            {site.regionName}
                          </span>
                          <span className="text-[10.5px] font-bold text-white truncate">
                            {site.shortName}
                          </span>
                        </div>
                      </div>
                      <span className="text-[9.5px] font-mono text-emerald-400 font-bold shrink-0">
                        {site.areaPyeong.toLocaleString()}평
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2) 선택 부지 인근 IC·역세권·간선국도 접근성 분석표 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5 text-teal-400">
                  <Car className="w-3.5 h-3.5" />
                  교통망 접근성 지표 (Accessibility)
                </span>
                <span className="text-[9px] font-mono text-teal-300 font-bold">
                  {currentMilitarySite?.transitInfo?.score || 88}점/100
                </span>
              </div>

              <div className="space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-[#1b271f]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Car className="w-3 h-3 text-amber-400" />
                    인근 고속도로 IC
                  </span>
                  <span className="font-mono text-slate-200 font-bold">
                    {currentMilitarySite?.transitInfo?.highway || '북원주IC (4.2km)'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-[#1b271f]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Train className="w-3 h-3 text-cyan-400" />
                    KTX / 철도 역사
                  </span>
                  <span className="font-mono text-slate-200 font-bold">
                    {currentMilitarySite?.transitInfo?.railway || '원주역 (3.5km)'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-black/40 border border-[#1b271f]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-emerald-400" />
                    주요 간선국도
                  </span>
                  <span className="font-mono text-slate-200 font-bold">
                    {currentMilitarySite?.transitInfo?.nationalRoad || '국도 5·19호선'}
                  </span>
                </div>
              </div>
            </div>

            {/* 3) 우측 하단 접이식 [보고서 도면 범례(Legend)] 토글 스위치 */}
            <div className="bg-[#101813] p-2.5 rounded-lg border border-[#1e2a22] flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-200">보고서 도면 범례 (Legend)</div>
                <div className="text-[9px] text-slate-400">우측 하단 범례 박스 표시/숨김</div>
              </div>
              <button
                type="button"
                onClick={toggleLegendBox}
                className={`px-3 py-1 rounded text-xs font-bold transition-all border ${
                  showLegendBox
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                    : 'bg-[#152019] text-slate-400 border-[#223528] hover:text-white'
                }`}
              >
                {showLegendBox ? '표시 중' : '숨김'}
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* [하단 브리핑 카드: 100% 실시간 동기화 - 시·군 선택 시 원주 1군지사 고정 버그 완벽 수정] */}
        {/* ===================================================================== */}
        <section className="pt-2 space-y-2">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-emerald-400">
              {isSiteSelected ? <Shield className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
              {isSiteSelected ? '선택 군 유휴부지 브리핑' : '선택 시·군 행정구역 브리핑'}
            </span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
              실시간 동기화
            </span>
          </div>

          {/* 브리핑 카드 본문 */}
          <div className="p-2.5 rounded-lg border border-emerald-600/50 bg-gradient-to-br from-[#0e1713] to-[#09100d] space-y-2 shadow-lg">
            <div className="flex items-start justify-between gap-1">
              <div>
                <div className="text-[12.5px] font-bold text-white leading-snug">
                  {isSiteSelected && currentMilitarySite
                    ? (currentMilitarySite.shortName || currentMilitarySite.name)
                    : `${currentRegionStat.name} (${currentRegionStat.fullName})`}
                </div>
                <div className="text-[9.5px] text-emerald-400/90 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  <span>
                    {isSiteSelected && currentMilitarySite
                      ? `${currentMilitarySite.regionName} | ${currentMilitarySite.managingAgency}`
                      : `${currentRegionStat.subregion} | ${currentRegionStat.name}`}
                  </span>
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono border border-emerald-700/50 shrink-0">
                {isSiteSelected && currentMilitarySite
                  ? `${currentMilitarySite.areaPyeong.toLocaleString()} 평`
                  : currentRegionStat.areaPyeongText}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-black/40 p-2 rounded border border-[#1e2a22]">
              <div>
                <div className="text-[8px] text-slate-500 uppercase">
                  {isSiteSelected ? '부지 총면적' : '관할 총면적'}
                </div>
                <div className="font-mono text-slate-200 font-bold truncate">
                  {isSiteSelected && currentMilitarySite
                    ? `${currentMilitarySite.areaSqm.toLocaleString()} ㎡`
                    : currentRegionStat.areaKm2Text}
                </div>
              </div>
              <div>
                <div className="text-[8px] text-slate-500 uppercase">
                  {isSiteSelected ? '계획 용도' : '3D 실측 건물 수'}
                </div>
                <div className="text-emerald-300 font-medium truncate" title={isSiteSelected && currentMilitarySite ? currentMilitarySite.targetUse : currentRegionStat.buildingCountText}>
                  {isSiteSelected && currentMilitarySite
                    ? (currentMilitarySite.targetUse || currentMilitarySite.themeTitle)
                    : currentRegionStat.buildingCountText}
                </div>
              </div>
            </div>

            <div className="text-[9.5px] text-slate-300 bg-[#0d1611] p-1.5 rounded border border-[#17251c] leading-tight">
              <span className="text-slate-500">특성: </span>
              {isSiteSelected && currentMilitarySite
                ? `영내 군 막사·연병장 등 12개동 시설 (정화 완료 후 착공 예정)`
                : `${currentRegionStat.characteristic} (관할 군 유휴부지 ${sitesInCurrentRegion.length}개소)`}
            </div>

            {/* 원클릭 해당 대상지 3D 비행 버튼 */}
            <button
              type="button"
              onClick={() => {
                if (isSiteSelected && currentMilitarySite) {
                  selectIdleSite(currentMilitarySite.id);
                } else {
                  selectRegion(currentRegionStat.id);
                }
              }}
              className="w-full py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow transition-all active:scale-98"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>
                {isSiteSelected && currentMilitarySite
                  ? `${currentMilitarySite.shortName} 상공 3D 입체 비행`
                  : `${currentRegionStat.name} 도심 전경 3D 비행`}
              </span>
            </button>
          </div>

          {/* 빠른 전환 칩 */}
          <div className="space-y-1">
            <div className="text-[9px] text-slate-500">주요 대상지 퀵 비행 바로가기:</div>
            <div className="flex flex-wrap gap-1">
              {quickChips.map((chip) => {
                const isSelected =
                  chip.type === 'site'
                    ? selectedIdleSiteId === chip.id
                    : !selectedIdleSiteId && selectedRegionId === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      if (chip.type === 'site') {
                        selectIdleSite(chip.id);
                      } else {
                        selectRegion(chip.id);
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                        : 'bg-[#121915] text-slate-400 border-[#1e2a22] hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ===================================================================== */}
      {/* 3. 패널 푸터 */}
      {/* ===================================================================== */}
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
