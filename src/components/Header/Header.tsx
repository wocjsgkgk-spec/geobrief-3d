'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Mountain,
  Menu,
  Box,
  Camera,
  Printer,
  ChevronDown,
  Layers,
  MapPin,
  FileDown,
  Presentation,
  Check,
  Building2,
  ShieldAlert,
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
import { GangwonUnifiedSearch } from '@/components/Search/GangwonUnifiedSearch';
import { ProjectManagerModal } from '@/components/Modal/ProjectManagerModal';

export const Header: React.FC = () => {
  const {
    selectedIdleSiteId,
    selectIdleSite,
    selectedRegionId,
    selectRegion,
    viewMode,
    toggleViewMode,
    triggerSlidePackExport,
    toggleMobilePanel,
  } = useMapStore();

  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [siteTab, setSiteTab] = useState<'hubs' | 'regions'>('hubs');

  const siteDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // 현재 선택된 거점 명칭
  const currentMilitarySite = getGangwon18MilitarySiteById(selectedIdleSiteId || '');
  const currentRegion = getGangwonRegionByIdOrName(selectedRegionId || '');
  const currentDisplayName = currentMilitarySite?.shortName || currentRegion?.name || '원주 1군지사';

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(e.target as Node)) {
        setIsSiteDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-12 bg-[#0c120e]/95 backdrop-blur-md border-b border-[#1e2a22] px-3 sm:px-4 flex items-center justify-between z-30 select-none">
      {/* 1. 좌측: 브랜드 로고 & 모바일 메뉴 버튼 */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        <button
          onClick={toggleMobilePanel}
          className="md:hidden p-1.5 rounded-lg bg-[#152019] border border-[#233529] text-emerald-400 hover:text-white transition-colors"
          title="제어 패널 열기"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 shadow-sm flex-shrink-0">
            <Mountain className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm tracking-wide text-slate-100 whitespace-nowrap">
            GeoBrief <span className="text-emerald-400 font-black">3D</span>
          </span>
        </div>
      </div>

      {/* 2. 중앙 [핵심 메뉴 1]: 🔍 통합 검색창 & 🛡️ 강원 18개 시·군 군 유휴부지 거점 선택 */}
      <div className="flex items-center space-x-2 flex-1 max-w-2xl mx-3 sm:mx-6">
        {/* [🔍 주소·지번·건물명 검색] */}
        <div className="flex-1 min-w-[160px] max-w-md">
          <GangwonUnifiedSearch />
        </div>

        {/* [🛡️ 강원 18개 시·군 군 유휴부지 & 거점 선택] 드롭다운 */}
        <div ref={siteDropdownRef} className="relative flex-shrink-0">
          <button
            onClick={() => {
              setIsSiteDropdownOpen(!isSiteDropdownOpen);
              setIsExportDropdownOpen(false);
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm ${
              isSiteDropdownOpen
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50'
                : 'bg-[#152019] border-[#25392c] text-emerald-300 hover:text-white hover:bg-[#1c2c22]'
            }`}
            title="강원 18개 시·군 군 유휴부지 & 거점 원클릭 이동"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="max-w-[110px] sm:max-w-[150px] truncate text-slate-100">
              {currentDisplayName}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-emerald-400 transition-transform duration-150 ${
                isSiteDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isSiteDropdownOpen && (
            <div className="absolute top-10 left-0 w-80 sm:w-96 bg-[#0c1410]/98 backdrop-blur-2xl border border-emerald-500/40 rounded-xl shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* 탭 헤더: 군 유휴부지 거점 vs 18개 시·군 행정구역 */}
              <div className="flex rounded-lg bg-[#070c09] p-1 mb-2 border border-[#1b2b20]">
                <button
                  type="button"
                  onClick={() => setSiteTab('hubs')}
                  className={`flex-1 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                    siteTab === 'hubs'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  <span>군 유휴부지 거점 (18대)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSiteTab('regions')}
                  className={`flex-1 py-1 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                    siteTab === 'regions'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>18개 시·군 행정구역</span>
                </button>
              </div>

              {/* 거점 목록 */}
              <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {siteTab === 'hubs' ? (
                  (['영서 중·남부권', '북부 접경권', '동해안 및 태백권'] as GangwonSubregionType[]).map((subreg) => {
                    const sitesInSub = GANGWON_18_MILITARY_SITES.filter((s) => s.subregion === subreg);
                    return (
                      <div key={subreg} className="bg-[#101913] rounded-lg p-1.5 border border-[#1b2b20]">
                        <div className="px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-400 flex items-center justify-between mb-1">
                          <span>• {subreg}</span>
                          <span className="text-[9.5px] font-mono text-slate-400">{sitesInSub.length}개소</span>
                        </div>
                        <div className="space-y-1">
                          {sitesInSub.map((site) => {
                            const isSelected = selectedIdleSiteId === site.id;
                            return (
                              <button
                                key={site.id}
                                type="button"
                                onClick={() => {
                                  selectIdleSite(site.id);
                                  setIsSiteDropdownOpen(false);
                                }}
                                className={`w-full px-2 py-1.5 text-xs rounded-lg text-left transition-all flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 shadow-inner'
                                    : 'hover:bg-[#18271e] text-slate-200 border border-transparent'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-[#142318] text-emerald-300 border border-[#223a29]">
                                      {site.regionName}
                                    </span>
                                    <span className="font-bold text-slate-100 truncate text-[11px]">
                                      {site.shortName}
                                    </span>
                                  </div>
                                  <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                                    {site.targetUse}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end flex-shrink-0 text-[9.5px] font-mono">
                                  <span className="text-emerald-400 font-bold">
                                    {site.areaPyeong.toLocaleString()}평
                                  </span>
                                  <span className="text-slate-400">
                                    {site.recommendedCamera.pitch}° 3D
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {GANGWON_18_REGIONS.map((reg) => {
                      const isSelected = selectedRegionId === reg.id;
                      return (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => {
                            selectRegion(reg.id);
                            setIsSiteDropdownOpen(false);
                          }}
                          className={`px-2.5 py-2 text-xs rounded-lg text-left transition-all border ${
                            isSelected
                              ? 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold'
                              : 'bg-[#101913] hover:bg-[#18271e] text-slate-200 border-[#1b2b20]'
                          }`}
                        >
                          <div className="font-bold text-slate-100">{reg.name}</div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{reg.subregion}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. 우측 [핵심 메뉴]: 2D/3D 전환 버튼 & 📸 보고서 도면 저장 */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
        {/* [2D 평면 / 3D 입체] 원클릭 전환 버튼 */}
        <button
          onClick={toggleViewMode}
          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm border ${
            viewMode === '2D'
              ? 'bg-blue-600/90 border-blue-400 text-white shadow-blue-900/50'
              : 'bg-[#152019] border-[#25392c] text-emerald-300 hover:text-white hover:bg-[#1c2c22]'
          }`}
          title="2D 정사 뷰(Top-Down)와 3D 조감 뷰 원클릭 전환"
        >
          <Box className="w-3.5 h-3.5" />
          <span>{viewMode === '2D' ? '2D 평면' : '3D 입체'}</span>
        </button>

        {/* [📸 보고서 도면 저장(PNG/PDF/PPTX)] */}
        <div ref={exportDropdownRef} className="relative">
          <button
            onClick={() => {
              setIsExportDropdownOpen(!isExportDropdownOpen);
              setIsSiteDropdownOpen(false);
            }}
            className="px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/60 shadow-md flex items-center space-x-1.5 transition-all whitespace-nowrap"
            title="고해상도 도면 캡처(PNG), 인쇄(PDF), 브리핑 슬라이드(PPTX) 내보내기"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-100" />
            <span className="hidden sm:inline">도면 저장</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-emerald-200 transition-transform ${
                isExportDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isExportDropdownOpen && (
            <div className="absolute top-10 right-0 w-56 bg-[#0c1410]/98 backdrop-blur-2xl border border-emerald-500/40 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              {/* 고해상도 PNG 캡처 */}
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('geobrief-export-png'));
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-teal-400" />
                  <span className="font-semibold">고해상도 도면 (PNG)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                  PNG
                </span>
              </button>

              {/* PDF 문서 출력 */}
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('geobrief-export-pdf'));
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold">브리핑 보고서 (PDF)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  PDF
                </span>
              </button>

              {/* PPTX 슬라이드 */}
              <button
                onClick={() => {
                  triggerSlidePackExport();
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Presentation className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold">발표 슬라이드 (.pptx)</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  PPTX
                </span>
              </button>

              <div className="h-px bg-[#1e2a22] my-1" />

              {/* 프로젝트 저장/불러오기 모달 */}
              <button
                onClick={() => {
                  setIsProjectModalOpen(true);
                  setIsExportDropdownOpen(false);
                }}
                className="w-full px-2.5 py-2 text-xs rounded-lg hover:bg-[#18271e] text-slate-200 flex items-center gap-2 transition-colors"
              >
                <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold">프로젝트 파일 백업/복원</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 프로젝트 관리 모달 */}
      <ProjectManagerModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />
    </header>
  );
};
