'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Layers,
  Sliders,
  FileText,
  Mountain,
  Building,
  Route,
  Disc,
  PenTool,
  Check,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  BookmarkPlus,
  Bookmark,
  Trash2,
  Compass,
  Navigation2,
  Sparkles,
  Grid,
  Square,
  Circle,
  RotateCw,
  Palette,
  AlertTriangle,
  FileSpreadsheet,
  Copy,
  CheckCircle2,
  Plane,
  Car,
  Activity,
  TrendingUp,
  BarChart3,
  Crosshair,
  Settings,
  Sun,
  Sunrise,
  Sunset,
  Clock,
} from 'lucide-react';
import { calculateSunLight } from '@/utils/sunLightCalculator';
import { GANGWON_REGIONS } from '@/constants/gangwonRegions';
import { MILITARY_IDLE_SITES, MilitaryIdleSite } from '@/constants/militaryIdleSites';
import { AddressSearch } from '@/components/Search/AddressSearch';
import { CoordinateInputModal } from '@/components/Modal/CoordinateInputModal';
import { useMapStore } from '@/store/useMapStore';
import {
  Bookmark as BookmarkItem,
  PolygonStyle,
  StampShape,
  BUILDING_MASS_PRESETS,
  BuildingMassPresetId,
} from '@/types/map';

export const ControlPanel: React.FC = () => {
  const {
    terrainEnabled,
    setTerrainEnabled,
    terrainExaggeration,
    setTerrainExaggeration,
    baseMap,
    setBaseMap,
    layers,
    toggleLayer,
    metadata,
    updateMetadata,
    // 부지 드로잉 상태 & 액션
    isDrawingMode,
    drawingPoints,
    completedPolygon,
    polygonArea,
    toggleDrawingMode,
    completePolygonDrawing,
    resetPolygonDrawing,
    // [Phase 2 고도화] 스타일, 스탬프, 회전
    polygonStyle,
    setPolygonStyle,
    stampMode,
    stampAreaPyeong,
    stampShape,
    setStampMode,
    setStampAreaPyeong,
    setStampShape,
    rotatePolygon,
    // 버퍼 링 토글
    bufferRings,
    toggleBufferRing,
    // GANGWON_REGIONS 18개 시·군 선택
    selectedRegionId,
    selectRegion,
    // [접경 안보 관제] 군사분계선/민통선 상태
    borderSecurityVisible,
    setBorderSecurityVisible,
    isBorderDistrict,
    // [국방 규제 및 비행안전 심층 분석]
    defenseAnalysisResult,
    showFlightCeiling3D,
    toggleFlightCeiling3D,
    // [교통·인프라 접근성]
    showAccessibilityTable,
    toggleAccessibilityTable,
    // [가상 3D 건축 매스 구상안]
    showBuildingMass3D,
    buildingMassPreset,
    customGltfUrl,
    toggleBuildingMass3D,
    setBuildingMassPreset,
    setCustomGltfUrl,
    // 북마크
    bookmarks,
    addBookmark,
    removeBookmark,
    flyToBookmark,
    viewport,
    vworldDiagnostic,
    setVworldDiagnostic,
    // [신규] 전략 군 유휴지 실증 프리셋
    selectedIdleSiteId,
    selectIdleSite,
    // [신규] 토목·지형 경사도 & 고도 단면 프로파일 분석
    showSlopeAnalysis,
    toggleSlopeAnalysis,
    showTerrainProfile,
    setShowTerrainProfile,
    toggleTerrainProfile,
    polygonCenter,
    sunHour,
    setSunHour,
  } = useMapStore();

  const [bookmarkInput, setBookmarkInput] = useState('');
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [isCoordModalOpen, setIsCoordModalOpen] = useState(false);
  const [boundaryTab, setBoundaryTab] = useState<'draw' | 'stamp' | 'coord'>('draw');
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [gltfInput, setGltfInput] = useState('');
  const [showGltfDrawer, setShowGltfDrawer] = useState(false);

  const handleCopyOpinionDraft = async () => {
    if (!defenseAnalysisResult?.officialOpinionDraft) return;
    try {
      await navigator.clipboard.writeText(defenseAnalysisResult.officialOpinionDraft);
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2000);
    } catch (err) {
      console.error('Failed to copy draft:', err);
    }
  };

  const handleCreateBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (bookmarkInput.trim()) {
      addBookmark(bookmarkInput.trim());
      setBookmarkInput('');
      setIsAddingBookmark(false);
    }
  };

  return (
    <aside className="w-full md:w-[360px] md:min-w-[360px] h-full md:h-[calc(100vh-3.5rem)] bg-[#141a16] border-r border-[#242f27] flex flex-col text-slate-200 overflow-y-auto">
      {/* 1. [신규] 동적 주소/지번 검색창 */}
      <section className="p-4 border-b border-[#242f27] space-y-2 bg-[#101712]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Navigation2 className="w-4 h-4" />
            전국·강원 공간 주소 검색
          </h2>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                vworldDiagnostic.status === 'connected'
                  ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300'
              }`}
            >
              <span>
                {vworldDiagnostic.status === 'connected'
                  ? '🟢 실시간 공간정보'
                  : '⚪ 3D 지형 모드'}
              </span>
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">GIS</span>
          </div>
        </div>
        <AddressSearch />
      </section>

      {/* 2. [시간대별 일조·태양광 시뮬레이션 (09:00 ~ 18:00)] */}
      {(() => {
        const centerLat = polygonCenter ? polygonCenter[1] : viewport.latitude;
        const centerLng = polygonCenter ? polygonCenter[0] : viewport.longitude;
        const sunInfo = calculateSunLight(sunHour, centerLat, centerLng);

        return (
          <section className="p-4 border-b border-[#242f27] space-y-3 bg-[#111913]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Sun className="w-4 h-4 text-amber-400" />
                시간대별 일조·태양광 시뮬레이션
              </h2>
              <span className="text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-700/60 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                {sunInfo.label}
              </span>
            </div>

            {/* 태양광 시간 슬라이더 */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-300">
                <span className="font-semibold flex items-center gap-1 text-[10.5px]">
                  <Sunrise className="w-3 h-3 text-orange-400" /> 09:00
                </span>
                <span className="font-bold text-amber-300 font-mono text-xs">
                  {Math.floor(sunHour).toString().padStart(2, '0')}:
                  {Math.round((sunHour % 1) * 60).toString().padStart(2, '0')}
                </span>
                <span className="font-semibold flex items-center gap-1 text-[10.5px]">
                  18:00 <Sunset className="w-3 h-3 text-rose-400" />
                </span>
              </div>
              <input
                type="range"
                min="9"
                max="18"
                step="0.25"
                value={sunHour}
                onChange={(e) => setSunHour(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#1b261e] rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </div>

            {/* 원클릭 시간대 프리셋 버튼 */}
            <div className="grid grid-cols-4 gap-1.5 pt-0.5">
              {[
                { h: 9.5, label: '아침 사광', icon: '🌅' },
                { h: 12.5, label: '정오 직사', icon: '☀️' },
                { h: 15.0, label: '오후 일조', icon: '🌤️' },
                { h: 17.5, label: '석양 노을', icon: '🌆' },
              ].map((preset) => {
                const isActive = Math.abs(sunHour - preset.h) < 0.8;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSunHour(preset.h)}
                    className={`py-1.5 px-1 rounded text-[10.5px] font-medium border flex flex-col items-center gap-0.5 transition-all ${
                      isActive
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold ring-1 ring-amber-400/50'
                        : 'bg-[#162019] border-[#293b2d] text-slate-300 hover:bg-[#1f2e23]'
                    }`}
                  >
                    <span className="text-xs">{preset.icon}</span>
                    <span className="whitespace-nowrap">{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 실시간 태양 천문 궤적 지표 카드 */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px] bg-[#0c130e] p-2 rounded-lg border border-[#1f2f22]">
              <div>
                <span className="text-slate-400 block">태양 방위각</span>
                <span className="font-bold text-slate-200 font-mono">
                  {sunInfo.azimuthDeg}°
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">태양 고도각</span>
                <span className="font-bold text-amber-300 font-mono">
                  {sunInfo.altitudeDeg}°
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">조도 강도</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {Math.round(sunInfo.intensity * 100)}%
                </span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* 3. [신규] 전략 군 유휴지 실증 데이터셋 카탈로그 (8개소+) */}
      {(() => {
        const currentSite =
          MILITARY_IDLE_SITES.find((s) => s.id === selectedIdleSiteId) || MILITARY_IDLE_SITES[0];

        return (
          <section className="p-4 border-b border-[#242f27] space-y-2.5 bg-[#121c15]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-emerald-400" />
                전략 군 유휴지 실증 프리셋
              </h2>
              <span className="text-[10px] text-emerald-300 font-mono font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60">
                실증 DB {MILITARY_IDLE_SITES.length}개소
              </span>
            </div>

            {/* 유휴지 선택 셀렉터 */}
            <div>
              <select
                value={selectedIdleSiteId || currentSite.id}
                onChange={(e) => selectIdleSite(e.target.value)}
                className="w-full bg-[#18261c] border border-[#2d4232] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none transition-colors cursor-pointer shadow-inner"
              >
                {MILITARY_IDLE_SITES.map((site) => (
                  <option key={site.id} value={site.id} className="bg-[#18261c] text-slate-100">
                    {site.name} ({site.district.split(' ').slice(1, 3).join(' ')} · {site.areaPyeong.toLocaleString()}평)
                  </option>
                ))}
              </select>
            </div>

            {/* 선택된 유휴지 브리핑 카드 */}
            {currentSite && (
              <div className="p-3 bg-[#152219] border border-[#2a3e2f] rounded-lg space-y-2 text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-100 flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      {currentSite.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                      {currentSite.district}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-bold">
                    약 {currentSite.areaPyeong.toLocaleString()}평
                  </span>
                </div>

                {/* 면적 & 관리기관 */}
                <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#0f1712] p-2 rounded border border-[#213024]">
                  <div>
                    <span className="text-slate-400 block">대지 면적</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {currentSite.areaSqm.toLocaleString()} ㎡
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">관리 기관</span>
                    <span className="font-semibold text-slate-300 truncate block">
                      {currentSite.managingAgency}
                    </span>
                  </div>
                </div>

                {/* 개발 비전 */}
                <div className="p-2 rounded bg-emerald-950/30 border border-emerald-800/40 text-[10.5px] text-emerald-200/90 leading-relaxed">
                  <span className="font-bold text-emerald-400 block text-[9.5px] uppercase tracking-wider mb-0.5">
                    💡 미래 개발 비전
                  </span>
                  {currentSite.devVision}
                </div>

                {/* 부지 특성 뱃지 */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {currentSite.keyFeatures.map((feat, idx) => (
                    <span
                      key={idx}
                      className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#101913] text-slate-300 border border-[#26372b]"
                    >
                      • {feat}
                    </span>
                  ))}
                </div>

                {/* 원클릭 카메라 비행 버튼 */}
                <button
                  type="button"
                  onClick={() => selectIdleSite(currentSite.id)}
                  className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950/50"
                >
                  <Navigation2 className="w-3.5 h-3.5" />
                  <span>이 부지로 3D 입체 비행 및 폴리곤 로드</span>
                </button>
              </div>
            )}
          </section>
        );
      })()}

      {/* 3. 강원특별자치도 18개 시·군 전역 퀵 셀렉터 (GANGWON_REGIONS) */}
      {(() => {
        const currentRegion =
          GANGWON_REGIONS.find((r) => r.id === selectedRegionId) || GANGWON_REGIONS[0];
        const cities = GANGWON_REGIONS.filter((r) => r.type === '시');
        const counties = GANGWON_REGIONS.filter((r) => r.type === '군');

        return (
          <section className="p-4 border-b border-[#242f27] space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                강원 18개 시·군 지역 탐색
              </h2>
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                {currentRegion.subregion}
              </span>
            </div>

            {/* 시·군 드롭다운 (시/군 optgroup 시각적 분리) */}
            <div>
              <select
                value={selectedRegionId}
                onChange={(e) => selectRegion(e.target.value)}
                className="w-full bg-[#18221b] border border-[#2b3a2f] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none transition-colors cursor-pointer shadow-inner"
              >
                <optgroup label="── 시 (City) ──" className="bg-[#121814] text-emerald-300 font-bold">
                  {cities.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#18221b] text-slate-100 font-normal">
                      {r.name} ({r.subregion})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="── 군 (County) ──" className="bg-[#121814] text-amber-300 font-bold">
                  {counties.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#18221b] text-slate-100 font-normal">
                      {r.name} ({r.subregion})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* 선택된 시·군 상세 지형 정보 배지 & 설명 카드 */}
            <div className="p-2.5 bg-[#18221b] border border-[#2b3a2f] rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-slate-100">
                    {currentRegion.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    ({currentRegion.type === '시' ? '시 지역' : '군 지역'})
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-semibold">
                  {currentRegion.subregion}
                </span>
              </div>

              {/* 지형 및 부지 특성 설명 텍스트 (Description) */}
              <p className="text-[11px] text-slate-300 leading-relaxed bg-[#121914] p-2 rounded border border-[#202c23]">
                {currentRegion.description}
              </p>

              {/* 카메라 파라미터 정보 */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                <span>3D 피치 {currentRegion.pitch}° · 베어링 {currentRegion.bearing}°</span>
                <span className="text-emerald-400 font-semibold">Lv {currentRegion.zoom}</span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* 3. [신규] 사용자 정의 관심 부지(북마크) 로컬 저장 & 복원 */}
      <section className="p-4 border-b border-[#242f27] space-y-2.5 bg-[#121914]">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Bookmark className="w-4 h-4" />
            내 관심 부지 (북마크)
          </h2>
          <button
            onClick={() => setIsAddingBookmark(!isAddingBookmark)}
            className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 flex items-center gap-1 bg-emerald-950/70 border border-emerald-700/60 px-2 py-0.5 rounded transition-all"
            title="현재 카메라 뷰를 관심 부지로 저장"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>현재 위치 저장</span>
          </button>
        </div>

        {/* 북마크 입력 폼 */}
        {isAddingBookmark && (
          <form onSubmit={handleCreateBookmark} className="p-2.5 bg-[#18221b] border border-emerald-500/50 rounded-lg space-y-2">
            <label className="text-[11px] text-slate-300 block font-medium">
              관심 부지 명칭 입력 (현재 시점: 피치 {viewport.pitch.toFixed(0)}°, 베어링 {viewport.bearing.toFixed(0)}°)
            </label>
            <div className="flex space-x-1.5">
              <input
                type="text"
                autoFocus
                value={bookmarkInput}
                onChange={(e) => setBookmarkInput(e.target.value)}
                placeholder="예: 00사단 유휴부지, 00비행장 인근"
                className="flex-1 bg-[#121814] border border-[#2b3a2f] rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow transition-colors"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setIsAddingBookmark(false)}
                className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded hover:bg-slate-700"
              >
                취소
              </button>
            </div>
          </form>
        )}

        {/* 북마크 리스트 */}
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {bookmarks.length === 0 ? (
            <p className="text-[11px] text-slate-400 py-1.5 text-center">
              저장된 관심 부지가 없습니다.
            </p>
          ) : (
            bookmarks.map((bm: BookmarkItem) => (
              <div
                key={bm.id}
                className="group p-2 rounded-lg bg-[#18201b] border border-[#29352c] hover:border-emerald-500/60 flex items-center justify-between transition-all"
              >
                <button
                  onClick={() => flyToBookmark(bm)}
                  className="flex-1 text-left min-w-0"
                  title="클릭 시 1초 만에 해당 시점으로 카메라 복원"
                >
                  <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 truncate">
                    {bm.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Lv {bm.viewport.zoom.toFixed(1)} · 피치 {bm.viewport.pitch.toFixed(0)}° · {bm.createdAt}
                  </div>
                </button>
                <button
                  onClick={() => removeBookmark(bm.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors ml-1"
                  title="북마크 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 4. 군 유휴부지 정밀 구역 지정 및 Turf.js 정량 분석 */}
      <section className="p-4 border-b border-[#242f27] space-y-3 bg-[#131d17]/50">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <PenTool className="w-4 h-4" />
            군 유휴부지 구역 지정
          </h2>
          <span className="text-[10px] text-blue-400 font-mono font-medium">
            정밀 편집 2D/3D
          </span>
        </div>

        {/* 서브 모드 탭 (직접 그리기 / 면적 스탬프 / 좌표 입력) */}
        <div className="grid grid-cols-3 gap-1 bg-[#101712] p-1 rounded-lg border border-[#243328] text-[11px]">
          <button
            onClick={() => setBoundaryTab('draw')}
            className={`py-1.5 rounded-md font-medium transition-all ${
              boundaryTab === 'draw'
                ? 'bg-emerald-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            직접 그리기
          </button>
          <button
            onClick={() => setBoundaryTab('stamp')}
            className={`py-1.5 rounded-md font-medium transition-all ${
              boundaryTab === 'stamp'
                ? 'bg-amber-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            면적 스탬프
          </button>
          <button
            onClick={() => {
              setBoundaryTab('coord');
              setIsCoordModalOpen(true);
            }}
            className={`py-1.5 rounded-md font-medium transition-all ${
              boundaryTab === 'coord'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            좌표 입력
          </button>
        </div>

        {/* 탭 1: 직접 그리기 모드 */}
        {boundaryTab === 'draw' && (
          <div className="space-y-2">
            <button
              onClick={toggleDrawingMode}
              className={`w-full py-2.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                isDrawingMode
                  ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40 animate-pulse'
                  : completedPolygon
                  ? 'bg-[#1b2b21] border-emerald-500/60 text-emerald-300 hover:bg-[#23382c]'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>
                {isDrawingMode
                  ? '2D 평면 정밀 드로잉 중 (지도 클릭)'
                  : completedPolygon
                  ? '부지 구역 다시 그리기 (2D 전환)'
                  : '구역 그리기 시작 (2D 수직 뷰 자동전환)'}
              </span>
            </button>

            {isDrawingMode && (
              <div className="p-2.5 bg-blue-950/40 border border-blue-800/60 rounded-lg text-xs space-y-2">
                <div className="text-[11px] text-blue-200 leading-snug flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 flex-shrink-0 animate-ping" />
                  <span>
                    수직 Top-Down 뷰로 전환되었습니다. 지도 위를 클릭해 꼭짓점을 추가하세요. (더블클릭 시 3D 조감도 자동 복귀)
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-300 font-mono">
                    정점: <strong className="text-blue-400">{drawingPoints.length}</strong>개
                  </span>
                  <div className="flex space-x-1.5">
                    <button
                      disabled={drawingPoints.length < 3}
                      onClick={completePolygonDrawing}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded flex items-center space-x-1 transition-all ${
                        drawingPoints.length >= 3
                          ? 'bg-blue-600 hover:bg-blue-500 text-white shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      <span>작성 완료 (3D 복귀)</span>
                    </button>
                    <button
                      onClick={resetPolygonDrawing}
                      className="px-2 py-1 text-[11px] font-medium rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 hover:bg-rose-900/60 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 2: 목표 면적(평/㎡) 기반 정형 템플릿(스탬프) 생성기 */}
        {boundaryTab === 'stamp' && (
          <div className="p-3 bg-[#18221b] border border-[#2b3a2f] rounded-lg space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                목표 면적 규격 스탬프
              </span>
              <span className="text-[10px] text-amber-400 font-mono">
                약 {(stampAreaPyeong * 3.305785).toLocaleString(undefined, { maximumFractionDigits: 0 })} ㎡
              </span>
            </div>

            {/* 퀵 평수 프리셋 버튼 */}
            <div className="grid grid-cols-4 gap-1.5">
              {[3000, 5000, 10000, 20000].map((py) => (
                <button
                  key={py}
                  type="button"
                  onClick={() => setStampAreaPyeong(py)}
                  className={`py-1 text-[11px] rounded font-mono font-semibold transition-all ${
                    stampAreaPyeong === py
                      ? 'bg-amber-600 text-white shadow'
                      : 'bg-[#121814] text-slate-300 hover:bg-[#1f2c22] border border-[#233327]'
                  }`}
                >
                  {py.toLocaleString()}평
                </button>
              ))}
            </div>

            {/* 직접 평수 입력 */}
            <div className="flex items-center space-x-2 bg-[#121814] p-1.5 rounded border border-[#233327]">
              <span className="text-[11px] text-slate-400 pl-1">직접 입력:</span>
              <input
                type="number"
                min={100}
                max={500000}
                step={500}
                value={stampAreaPyeong}
                onChange={(e) => setStampAreaPyeong(Math.max(100, parseInt(e.target.value) || 100))}
                className="w-24 bg-transparent text-xs font-mono font-bold text-amber-400 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400">평</span>
            </div>

            {/* 형태 선택 (정사각형 / 2:1 직사각형 / 원형) */}
            <div className="space-y-1">
              <span className="text-[10.5px] text-slate-400 block">스탬프 형상:</span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setStampShape('square')}
                  className={`py-1 text-[10.5px] rounded flex items-center justify-center gap-1 border transition-all ${
                    stampShape === 'square'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold'
                      : 'bg-[#121814] border-[#233327] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Square className="w-3 h-3" />
                  정사각형
                </button>
                <button
                  type="button"
                  onClick={() => setStampShape('rectangle')}
                  className={`py-1 text-[10.5px] rounded flex items-center justify-center gap-1 border transition-all ${
                    stampShape === 'rectangle'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold'
                      : 'bg-[#121814] border-[#233327] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Square className="w-3.5 h-2.5" />
                  2:1 직사각
                </button>
                <button
                  type="button"
                  onClick={() => setStampShape('circle')}
                  className={`py-1 text-[10.5px] rounded flex items-center justify-center gap-1 border transition-all ${
                    stampShape === 'circle'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold'
                      : 'bg-[#121814] border-[#233327] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Circle className="w-3 h-3" />
                  원형
                </button>
              </div>
            </div>

            {/* 지도에 배치 토글 버튼 */}
            <button
              onClick={() => setStampMode(!stampMode)}
              className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                stampMode
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/50 animate-pulse'
                  : 'bg-[#1b2b21] border border-amber-600/70 text-amber-300 hover:bg-[#253d2e]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {stampMode ? '지도 위 원하는 위치를 클릭하세요' : '지도에 배치 (스탬프 모드 활성화)'}
              </span>
            </button>
          </div>
        )}

        {/* 탭 3: 정밀 좌표(위경도) 입력 모달 트리거 */}
        {boundaryTab === 'coord' && (
          <div className="p-3 bg-[#18221b] border border-[#2b3a2f] rounded-lg space-y-2 text-xs">
            <div className="text-[11px] text-slate-300 leading-snug">
              정밀 측량 성과표 또는 군용 좌표 리스트를 줄바꿈으로 붙여넣어 부지를 생성할 수 있습니다.
            </div>
            <button
              onClick={() => setIsCoordModalOpen(true)}
              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors shadow"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>정밀 위경도 텍스트 입력창 열기</span>
            </button>
          </div>
        )}

        {/* 부지 렌더링 스타일 피커 (블루, 오렌지, 사선 빗금, 에메랄드) */}
        <div className="p-2.5 rounded-lg bg-[#18201b] border border-[#29352c] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-slate-400" />
              부지 렌더링 스타일
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {polygonStyle === 'hatch'
                ? '사선 빗금'
                : polygonStyle === 'orange'
                ? '보호구역 해제'
                : polygonStyle === 'emerald'
                ? '민군 복합'
                : '군 유휴지'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => setPolygonStyle('blue')}
              className={`p-1.5 rounded text-[10px] font-medium border flex flex-col items-center gap-1 transition-all ${
                polygonStyle === 'blue'
                  ? 'bg-blue-950/80 border-blue-400 text-blue-200 ring-1 ring-blue-500/50'
                  : 'bg-[#121713] border-[#212b23] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-3 h-3 rounded bg-blue-500/60 border border-blue-400" />
              <span>블루</span>
            </button>
            <button
              onClick={() => setPolygonStyle('orange')}
              className={`p-1.5 rounded text-[10px] font-medium border flex flex-col items-center gap-1 transition-all ${
                polygonStyle === 'orange'
                  ? 'bg-orange-950/80 border-orange-400 text-orange-200 ring-1 ring-orange-500/50'
                  : 'bg-[#121713] border-[#212b23] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-3 h-3 rounded bg-orange-500/60 border border-orange-400" />
              <span>오렌지</span>
            </button>
            <button
              onClick={() => setPolygonStyle('hatch')}
              className={`p-1.5 rounded text-[10px] font-medium border flex flex-col items-center gap-1 transition-all ${
                polygonStyle === 'hatch'
                  ? 'bg-amber-950/80 border-amber-400 text-amber-200 ring-1 ring-amber-500/50'
                  : 'bg-[#121713] border-[#212b23] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-3 h-3 rounded border border-amber-400 bg-[linear-gradient(45deg,#F59E0B_25%,transparent_25%,transparent_50%,#F59E0B_50%,#F59E0B_75%,transparent_75%,transparent)] bg-[length:6px_6px]" />
              <span>사선빗금</span>
            </button>
            <button
              onClick={() => setPolygonStyle('emerald')}
              className={`p-1.5 rounded text-[10px] font-medium border flex flex-col items-center gap-1 transition-all ${
                polygonStyle === 'emerald'
                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 ring-1 ring-emerald-500/50'
                  : 'bg-[#121713] border-[#212b23] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-3 h-3 rounded bg-emerald-500/60 border border-emerald-400" />
              <span>에메랄드</span>
            </button>
          </div>
        </div>

        {/* 폴리곤 미세 조작 도구 (회전 / 이동 안내) */}
        {completedPolygon && (
          <div className="p-2.5 rounded-lg bg-[#18201b] border border-[#29352c] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                <RotateCw className="w-3 h-3 text-amber-400" />
                부지 각도 미세 회전
              </span>
              <span className="text-[10px] text-slate-400">모서리 핸들러 드래그 가능</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => rotatePolygon(-15)}
                className="py-1 px-2 rounded bg-[#121713] hover:bg-[#202d23] border border-[#212b23] text-[11px] text-slate-200 font-mono transition-colors"
                title="반시계 방향 15도 회전"
              >
                ↺ -15°
              </button>
              <button
                type="button"
                onClick={() => rotatePolygon(15)}
                className="py-1 px-2 rounded bg-[#121713] hover:bg-[#202d23] border border-[#212b23] text-[11px] text-slate-200 font-mono transition-colors"
                title="시계 방향 15도 회전"
              >
                ↻ +15°
              </button>
              <button
                type="button"
                onClick={() => rotatePolygon(45)}
                className="py-1 px-2 rounded bg-[#121713] hover:bg-[#202d23] border border-[#212b23] text-[11px] text-slate-200 font-mono transition-colors"
                title="시계 방향 45도 회전"
              >
                ↻ +45°
              </button>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 bg-[#121713] p-1.5 rounded">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>초록 점: 중심 드래그 이동 /</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 ml-1" />
              <span>황색 점: 모서리 회전</span>
            </div>
          </div>
        )}

        {/* 정량 면적 카드 (가이드 및 거대 면적 경고 배지 포함) */}
        <div className="p-3 rounded-lg bg-[#18201b] border border-[#29352c] text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300">
              부지 면적 정량 분석
            </span>
            {polygonArea && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded font-mono">
                연산 완료
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-[#121713] rounded border border-[#212b23]">
              <div className="text-[10px] text-slate-400">기준 면적 (㎡)</div>
              <div className="text-sm font-mono font-bold text-blue-400 mt-1 truncate">
                {polygonArea ? `${polygonArea.sqm.toLocaleString()} ㎡` : '측정 대기'}
              </div>
            </div>
            <div className="p-2.5 bg-[#121713] rounded border border-[#212b23]">
              <div className="text-[10px] text-slate-400">환산 면적 (평)</div>
              <div className="text-sm font-mono font-bold text-emerald-400 mt-1 truncate">
                {polygonArea ? `약 ${polygonArea.pyeong.toLocaleString()} 평` : '측정 대기'}
              </div>
            </div>
          </div>

          {/* 권장 면적 및 대규모 면적 경고 안내 */}
          <div className="pt-0.5 text-[10px] space-y-1">
            <p className="text-slate-400">
              💡 권장 부지 규모: 1,000평 ~ 50,000평 (축구장 0.5 ~ 25개 규모)
            </p>
            {polygonArea && polygonArea.pyeong > 1000000 && (
              <div className="p-2 rounded bg-amber-950/60 border border-amber-600/70 text-amber-200 flex items-start gap-1.5 leading-snug">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <span>
                  광역 규모(100만평 초과)가 감지되었습니다. 지도를 확대(Zoom In)하여 정밀 구역을 지정하세요.
                </span>
              </div>
            )}
          </div>

          {completedPolygon && (
            <div className="flex items-center justify-between pt-1 border-t border-[#212b23]">
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                용도: 군사시설보호구역 해제 검토지
              </span>
              <button
                onClick={resetPolygonDrawing}
                className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                구역 초기화
              </button>
            </div>
          )}
        </div>

        {/* [3D 개발 구상안(Massing) 올리기] 간이 생성 카드 */}
        {completedPolygon && (
          <div className="p-3 rounded-lg bg-[#142018] border border-emerald-600/60 text-xs space-y-2.5 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-slate-100 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-emerald-400" />
                3D 개발 구상안(Massing) 올리기
              </span>
              <button
                type="button"
                onClick={toggleBuildingMass3D}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showBuildingMass3D ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                title="부지 내 3D 입체 건축 매스 표출 토글"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showBuildingMass3D ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {showBuildingMass3D && (
              <div className="space-y-2.5 pt-1.5 border-t border-[#203326]">
                {/* Threebox 3D 엔진 구동 상태 인디케이터 */}
                <div className="flex items-center justify-between text-[10px] bg-[#0c1610] px-2.5 py-1.5 rounded border border-[#1b2f21]">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Threebox-MapLibre 3D 엔진 가동
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    Terrain Clamped
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10.5px] text-slate-300">
                  <span className="font-semibold text-slate-200">건축 구상안 3D 프리셋 (라디오 선택):</span>
                  <span className="font-mono text-emerald-300 font-bold">
                    {BUILDING_MASS_PRESETS[buildingMassPreset].height}m 정밀 모델
                  </span>
                </div>

                {/* 라디오 버튼 형태의 프리셋 선택기 */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(BUILDING_MASS_PRESETS) as BuildingMassPresetId[]).map((key) => {
                    const preset = BUILDING_MASS_PRESETS[key];
                    const isSelected = buildingMassPreset === key && !customGltfUrl;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setBuildingMassPreset(key);
                          setCustomGltfUrl(null);
                        }}
                        className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all relative ${
                          isSelected
                            ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-md ring-1 ring-emerald-400/50'
                            : 'bg-[#101712] border-[#223326] text-slate-400 hover:text-slate-200 hover:bg-[#18241c]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          {/* 라디오 버튼 원형 불릿 */}
                          <div
                            className={`w-3 h-3 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'border-emerald-400 bg-emerald-500/20'
                                : 'border-slate-600 bg-transparent'
                            }`}
                          >
                            {isSelected && (
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-slate-400 font-bold">
                            {preset.height}m
                          </span>
                        </div>
                        <div className="text-[10px] font-bold leading-tight line-clamp-2">
                          {preset.name}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 선택된 프리셋 건축 사양 요약 */}
                <div className="p-2 rounded bg-[#0d140f] border border-[#1e2e22] text-[10px] text-slate-300 leading-snug">
                  <div className="flex items-center justify-between text-slate-400 text-[9px] mb-1">
                    <span className="font-semibold text-emerald-400">■ 건축 세부 특화 요소</span>
                    <span className="font-mono text-slate-400">
                      {customGltfUrl ? '외부 glTF 모델' : BUILDING_MASS_PRESETS[buildingMassPreset].name}
                    </span>
                  </div>
                  <div className="text-slate-200 font-medium">
                    {customGltfUrl
                      ? `외부 3D 모델 로드 중: ${customGltfUrl.split('/').pop() || customGltfUrl}`
                      : BUILDING_MASS_PRESETS[buildingMassPreset].description}
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-[#1b2b1f] text-[9px] text-slate-400 flex items-center justify-between">
                    <span>지형 표고 자동 밀착</span>
                    <span className="text-emerald-400 font-mono">BBox Scale & Heading Sync</span>
                  </div>
                </div>

                {/* 외부 glTF 3D 모델 로더 확장 드로어 */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowGltfDrawer(!showGltfDrawer)}
                    className="w-full py-1 px-2 rounded bg-[#101913] hover:bg-[#16231a] border border-[#233527] text-[9.5px] text-slate-300 flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-1 text-slate-300">
                      <span>📁 외부 glTF/GLB 모델 로드</span>
                      {customGltfUrl && (
                        <span className="px-1 py-0.2 text-[8px] bg-cyan-950 text-cyan-300 border border-cyan-800 rounded">
                          커스텀 적용 중
                        </span>
                      )}
                    </span>
                    <span className="text-slate-500 font-mono text-[9px]">
                      {showGltfDrawer ? '▲ 닫기' : '▼ 열기'}
                    </span>
                  </button>

                  {showGltfDrawer && (
                    <div className="mt-1.5 p-2 rounded bg-[#0c130e] border border-[#1d2d20] space-y-1.5">
                      <div className="text-[9px] text-slate-400">
                        외부 3D 모델 파일 URL (.gltf / .glb):
                      </div>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={gltfInput}
                          onChange={(e) => setGltfInput(e.target.value)}
                          placeholder="https://.../model.glb"
                          className="flex-1 bg-[#142017] border border-[#243527] rounded px-2 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (gltfInput.trim()) {
                              setCustomGltfUrl(gltfInput.trim());
                            }
                          }}
                          className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[9.5px] font-bold"
                        >
                          적용
                        </button>
                      </div>
                      {customGltfUrl && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[8.5px] text-slate-400 truncate max-w-[180px]">
                            {customGltfUrl}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomGltfUrl(null);
                              setGltfInput('');
                            }}
                            className="text-[8.5px] text-rose-400 hover:underline"
                          >
                            기본 프리셋 복원
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. 국방 규제 및 비행안전 심층 분석 모듈 */}
      <section className="p-4 border-b border-[#242f27] space-y-3 bg-[#111914]/70">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            국방 규제 & 비행안전 심층 분석
          </h2>
          <span className="text-[10px] text-slate-400 font-mono">
            {completedPolygon ? '분석 완료' : '부지 대기'}
          </span>
        </div>

        {!completedPolygon ? (
          <div className="p-3 rounded-lg bg-[#18201b] border border-[#29352c] text-center space-y-1.5">
            <ShieldAlert className="w-5 h-5 text-slate-500 mx-auto" />
            <div className="text-[11px] font-medium text-slate-300">
              부지 구역을 지정하면 규제 판정이 실행됩니다
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              상단 드로잉, 면적 스탬프 또는 좌표 입력으로 부지를 생성하면 군사시설보호구역 3단 분류, 3D 비행안전 고도제한면 및 군 협의 소견서가 자동 산출됩니다.
            </p>
          </div>
        ) : !defenseAnalysisResult ? (
          <div className="p-3 rounded-lg bg-[#18201b] border border-[#29352c] text-center text-xs text-slate-400">
            분석 엔진 계산 중...
          </div>
        ) : (
          <div className="space-y-3">
            {/* 1) 군사시설보호구역 3단 분류 판정 요약 카드 */}
            <div className="p-3 rounded-lg bg-[#18201b] border border-[#29352c] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  보호구역 3단 분류 판정
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    defenseAnalysisResult.badgeVariant === 'rose'
                      ? 'bg-rose-950/80 border-rose-600/80 text-rose-300'
                      : defenseAnalysisResult.badgeVariant === 'amber'
                      ? 'bg-amber-950/80 border-amber-600/80 text-amber-300'
                      : defenseAnalysisResult.badgeVariant === 'blue'
                      ? 'bg-blue-950/80 border-blue-600/80 text-blue-300'
                      : 'bg-emerald-950/80 border-emerald-600/80 text-emerald-300'
                  }`}
                >
                  {defenseAnalysisResult.feasibilityText}
                </span>
              </div>

              <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    defenseAnalysisResult.classification === 'controlled'
                      ? 'bg-rose-500'
                      : defenseAnalysisResult.classification === 'flight_safety'
                      ? 'bg-amber-400'
                      : defenseAnalysisResult.classification === 'restricted'
                      ? 'bg-amber-500'
                      : 'bg-emerald-400'
                  }`}
                />
                <span>{defenseAnalysisResult.zoneName}</span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-300 bg-[#121713] p-2 rounded border border-[#212b23]">
                <div className="flex justify-between">
                  <span className="text-slate-400">근거 법령:</span>
                  <span className="text-slate-200 font-medium truncate max-w-[190px] text-right">
                    {defenseAnalysisResult.statute}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">관할 부대:</span>
                  <span className="text-slate-200 font-medium truncate max-w-[190px] text-right">
                    {defenseAnalysisResult.jurisdiction}
                  </span>
                </div>
                <div className="pt-1 text-[10px] text-slate-400 leading-tight border-t border-[#1e2720]">
                  💡 {defenseAnalysisResult.feasibilityDescription}
                </div>
              </div>

              {/* 4개 세부 체크포인트 뱃지 리스트 */}
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                {defenseAnalysisResult.keyCheckpoints.map((cp, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded bg-[#131a15] border border-[#202c22] text-[10px] flex flex-col"
                  >
                    <span className="text-slate-400">{cp.label}</span>
                    <span
                      className={`font-semibold truncate ${
                        cp.status === 'block'
                          ? 'text-rose-400'
                          : cp.status === 'warn'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {cp.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2) 3D 가상 비행안전 제한고도면(Ceiling) 제어 카드 */}
            <div className="p-3 rounded-lg bg-[#18201b] border border-[#29352c] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Plane className="w-3.5 h-3.5 text-amber-400" />
                  <span>3D 비행안전 고도제한면 (Ceiling)</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFlightCeiling3D}
                    onChange={toggleFlightCeiling3D}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
              </div>

              {defenseAnalysisResult.hasFlightSafetyZone ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-[#121713] rounded border border-[#212b23]">
                      <span className="text-[10px] text-slate-400 block">지표면 기준 허용고도</span>
                      <span className="text-sm font-mono font-bold text-rose-400">
                        +{defenseAnalysisResult.maxSurfaceHeight} m
                      </span>
                    </div>
                    <div className="p-2 bg-[#121713] rounded border border-[#212b23]">
                      <span className="text-[10px] text-slate-400 block">해발 표고 (EL.)</span>
                      <span className="text-sm font-mono font-bold text-amber-400">
                        EL. {defenseAnalysisResult.maxSeaLevelHeight} m
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-[#121713] rounded border border-[#212b23] flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">권장 건축 규모:</span>
                    <span className="font-bold text-emerald-400">
                      {defenseAnalysisResult.recommendedFloors}
                    </span>
                  </div>

                  {defenseAnalysisResult.airfield && (
                    <div className="text-[10px] text-slate-400 bg-black/30 p-2 rounded space-y-0.5">
                      <div className="text-slate-300 font-semibold">
                        📍 {defenseAnalysisResult.airfield.name} (이격 {defenseAnalysisResult.distanceToAirfieldKm}km)
                      </div>
                      <div className="text-slate-400 font-sans">
                        {defenseAnalysisResult.airfield.shieldingNotes}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2 rounded bg-[#121713] border border-[#212b23] text-[11px] text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>반경 12km 이내 군 비행장 직간접 장애물 제한 표면 비저촉</span>
                </div>
              )}
            </div>

            {/* 3) 군 협의 소견서 텍스트 자동 생성 & 클립보드 복사 */}
            <div className="p-3 rounded-lg bg-[#18201b] border border-[#29352c] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  관할 부대 작전성 검토 의견 초안
                </span>
                <button
                  type="button"
                  onClick={handleCopyOpinionDraft}
                  className="px-2 py-1 rounded bg-[#202b23] hover:bg-[#2a3a2e] border border-[#2d3d31] text-[10px] font-semibold text-emerald-300 flex items-center gap-1 transition-all shadow-sm active:scale-95"
                >
                  {copiedDraft ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>복사 완료!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>텍스트 복사</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <textarea
                  readOnly
                  value={defenseAnalysisResult.officialOpinionDraft}
                  rows={6}
                  className="w-full bg-[#101512] border border-[#212b23] rounded p-2 text-[10px] font-mono text-slate-300 leading-relaxed resize-none focus:outline-none focus:border-emerald-500/50 selection:bg-emerald-800 selection:text-white"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                도정·국방 협력관실 브리핑 보고서 및 군 협의 사전신청 서식에 바로 인용 가능합니다.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 6. 정량 거리 분석 버퍼 링 */}
      <section className="p-4 border-b border-[#242f27] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Disc className="w-4 h-4" />
            정량 반경 분석 (Buffer Rings)
          </h2>
          <span className="text-[10px] text-emerald-400 font-mono">Turf.js</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full border border-emerald-400 bg-emerald-500/30 inline-block flex-shrink-0" />
              <div>
                <span className="text-slate-200 font-medium">500m 반경</span>
                <span className="text-[10px] text-slate-400 ml-1.5">(도보권)</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={bufferRings.r500m}
                onChange={() => toggleBufferRing('r500m')}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full border border-amber-400 bg-amber-500/30 inline-block flex-shrink-0" />
              <div>
                <span className="text-slate-200 font-medium">1.0km 반경</span>
                <span className="text-[10px] text-slate-400 ml-1.5">(기본 생활권)</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={bufferRings.r1km}
                onChange={() => toggleBufferRing('r1km')}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full border border-indigo-400 bg-indigo-500/30 inline-block flex-shrink-0" />
              <div>
                <span className="text-slate-200 font-medium">2.0km 반경</span>
                <span className="text-[10px] text-slate-400 ml-1.5">(차량 접근권)</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={bufferRings.r2km}
                onChange={() => toggleBufferRing('r2km')}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>
        </div>
      </section>

      {/* 7. 3D 지형(DEM) 및 베이스맵 스타일 원클릭 전환 */}
      <section className="p-4 border-b border-[#242f27] space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <Mountain className="w-4 h-4" />
          3D 지형 (DEM) 및 베이스맵
        </h2>

        <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
          <div className="flex items-center space-x-2">
            <Mountain className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-200">
              Terrarium 3D 지형 활성화
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={terrainEnabled}
              onChange={(e) => setTerrainEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        <div className="p-2.5 rounded bg-[#18201b] border border-[#29352c] space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              지형 고저차 배율 (Exaggeration)
            </span>
            <span className="font-mono text-emerald-400 font-bold">
              {terrainExaggeration.toFixed(1)}x
            </span>
          </div>
          <input
            type="range"
            min="1.0"
            max="2.5"
            step="0.1"
            value={terrainExaggeration}
            onChange={(e) => setTerrainExaggeration(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 h-1.5 bg-[#253128] rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* 베이스맵 모드 원클릭 전환 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-300">
              베이스맵 스타일 원클릭 전환
            </label>
            <span className="text-[10px] text-emerald-400 font-mono">레이어 100% 보존</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setBaseMap('satellite')}
              className={`p-2.5 text-xs rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                baseMap === 'satellite'
                  ? 'bg-[#1b3425] border-emerald-400 text-emerald-300 font-bold shadow-md ring-1 ring-emerald-500/40'
                  : 'bg-[#18201b] border-[#29352c] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>위성 영상 모드</span>
              </div>
              <span className="text-[9.5px] opacity-75 font-normal">Esri 실사 고해상도</span>
            </button>
            <button
              onClick={() => setBaseMap('clean')}
              className={`p-2.5 text-xs rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                baseMap === 'clean'
                  ? 'bg-[#1b3425] border-emerald-400 text-emerald-300 font-bold shadow-md ring-1 ring-emerald-500/40'
                  : 'bg-[#18201b] border-[#29352c] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span>클린 벡터 모드</span>
              </div>
              <span className="text-[9.5px] opacity-75 font-normal">보고서 브리핑 전용</span>
            </button>
          </div>
        </div>
      </section>

      {/* 8. [신규] 토목·도시계획 지형 분석 도구 (3단 경사도 격자 & 지형 단면 프로파일) */}
      <section className="p-4 border-b border-[#242f27] space-y-3 bg-[#111a14]/60">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            토목·지형 경사도 & 고도 분석
          </h2>
          <span className="text-[10px] text-emerald-300 font-mono font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60">
            DEM 지형 쿼리
          </span>
        </div>

        {/* 3단 경사도 분석 격자 오버레이 토글 */}
        <div className="flex items-center justify-between p-2.5 rounded bg-[#18221b] border border-[#29382e]">
          <div>
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>3단 경사도 분석 격자</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              10x10 격자별 지형 경사각 실시간 연산
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showSlopeAnalysis}
              onChange={toggleSlopeAnalysis}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* 3단 경사도 판정 기준 범례 */}
        <div className="grid grid-cols-3 gap-1.5 text-[9.5px] font-medium text-center">
          <div className="p-1.5 rounded bg-emerald-950/50 border border-emerald-700/50 text-emerald-300">
            <div className="font-bold">15° 이하</div>
            <div className="text-[8.5px] opacity-80">개발 용이 (녹색)</div>
          </div>
          <div className="p-1.5 rounded bg-amber-950/50 border border-amber-700/50 text-amber-300">
            <div className="font-bold">15° ~ 25°</div>
            <div className="text-[8.5px] opacity-80">완경사지 (황색)</div>
          </div>
          <div className="p-1.5 rounded bg-rose-950/50 border border-rose-700/50 text-rose-300">
            <div className="font-bold">25° 초과</div>
            <div className="text-[8.5px] opacity-80">급경사 보전 (적색)</div>
          </div>
        </div>

        {/* 지형 고도 단면 프로파일 모달 열기 버튼 */}
        <button
          type="button"
          onClick={() => setShowTerrainProfile(true)}
          className="w-full py-2 px-3 rounded-lg bg-[#1a291f] hover:bg-[#223629] border border-emerald-600/50 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>지형 횡단 고도 프로파일 & 통계 모달 열기</span>
        </button>
      </section>

      {/* 9. 공간 데이터 레이어 스위치 */}
      <section className="p-4 border-b border-[#242f27] space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <Layers className="w-4 h-4" />
          공간 인프라 레이어
        </h2>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <span className="flex items-center gap-2 text-slate-300 font-medium">
              <Building className="w-3.5 h-3.5 text-blue-400" />
              건축물 3D 돌출 (Extrusion)
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.buildings3D}
                onChange={() => toggleLayer('buildings3D')}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* [V-World API 연결 상태 실시간 진단 카드] */}
          <div className="p-2.5 rounded-lg bg-[#111713] border border-[#243328] space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block animate-pulse"
                  style={{
                    backgroundColor:
                      vworldDiagnostic.status === 'connected'
                        ? '#10B981'
                        : vworldDiagnostic.status === 'error'
                        ? '#EF4444'
                        : '#F59E0B',
                  }}
                />
                3D 건축물 공간정보 소스
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  vworldDiagnostic.status === 'connected'
                    ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                {vworldDiagnostic.status === 'connected' ? '정밀 공간정보' : '오픈 벡터 타일'}
              </span>
            </div>

            <p className="text-[10px] text-slate-400 leading-tight">
              {vworldDiagnostic.status === 'connected'
                ? `실시간 정밀 건축물 데이터 연동 가동 중 (${vworldDiagnostic.featureCount}건 로드)`
                : '국토부 브이월드 또는 오픈 벡터 타일을 통해 3D 건물이 렌더링됩니다.'}
            </p>
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <span className="flex items-center gap-2 text-slate-300 font-medium">
              <Route className="w-3.5 h-3.5 text-amber-400" />
              도로망 위계화 (주간선/보조)
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.roads}
                onChange={() => toggleLayer('roads')}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* [Phase 2 고도화] 브이월드 연속지적도(필지선) 토글 */}
          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <div className="flex items-center space-x-2">
              <Grid className="w-3.5 h-3.5 text-amber-400" />
              <div>
                <span className="text-slate-200 font-medium">지적도 (필지선) 표시</span>
                <span className="text-[10px] text-amber-400/90 ml-1.5 font-mono">
                  (브이월드 WMS)
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={layers.cadastral}
                onChange={() => toggleLayer('cadastral')}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* [접경 안보 관제] 군사분계선/민통선 표시 수동 토글 */}
          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <div>
                <span className="text-slate-200 font-medium">군사분계선 / 민통선 표시</span>
                <span className="text-[10px] text-rose-400/90 ml-1.5 font-mono">
                  {isBorderDistrict ? '(접경 권역 자동 On)' : '(수동 제어)'}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={borderSecurityVisible}
                onChange={(e) => setBorderSecurityVisible(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-rose-600"></div>
            </label>
          </div>

          {/* [교통 접근성 분석] 16:9 정량 분석표 표시 토글 */}
          <div className="flex items-center justify-between p-2 rounded bg-[#18201b] border border-[#29352c]">
            <div className="flex items-center space-x-2">
              <Car className="w-3.5 h-3.5 text-emerald-400" />
              <div>
                <span className="text-slate-200 font-medium">교통·인프라 접근성 분석표</span>
                <span className="text-[10px] text-emerald-400/90 ml-1.5 font-mono">
                  (16:9 슬라이드)
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showAccessibilityTable}
                onChange={toggleAccessibilityTable}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      </section>

      {/* 9. 보고서 메타데이터 인라인 편집 */}
      <section className="p-4 space-y-3 pb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          보고서 메타데이터 설정
        </h2>

        <div className="space-y-2 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              보고서 제목
            </label>
            <input
              type="text"
              value={metadata.title}
              onChange={(e) => updateMetadata({ title: e.target.value })}
              className="w-full bg-[#18201b] border border-[#29352c] rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              부제 / 세부 대상지
            </label>
            <input
              type="text"
              value={metadata.subtitle}
              onChange={(e) => updateMetadata({ subtitle: e.target.value })}
              className="w-full bg-[#18201b] border border-[#29352c] rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                작성 부서
              </label>
              <input
                type="text"
                value={metadata.department}
                onChange={(e) => updateMetadata({ department: e.target.value })}
                className="w-full bg-[#18201b] border border-[#29352c] rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                기준 일자
              </label>
              <input
                type="text"
                value={metadata.date}
                onChange={(e) => updateMetadata({ date: e.target.value })}
                className="w-full bg-[#18201b] border border-[#29352c] rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 정밀 좌표 텍스트 입력 모달 */}
      <CoordinateInputModal
        isOpen={isCoordModalOpen}
        onClose={() => setIsCoordModalOpen(false)}
      />
    </aside>
  );
};
