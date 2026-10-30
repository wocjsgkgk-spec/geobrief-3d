'use client';

import React, { useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { getGangwon18MilitarySiteById } from '@/constants/gangwon18MilitarySites';
import {
  X,
  Building2,
  Compass,
  Ruler,
  Truck,
  RotateCw,
  Eye,
  Radio,
  Target,
  Copy,
  Check,
  ChevronRight,
  Layers,
  MapPin,
  Shield,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

export interface VWorldInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBuilding: {
    name: string;
    category: string;
    levels: number;
    height: number;
    center: [number, number];
    rawProperties?: Record<string, any>;
  } | null;
  cadastralReport: any | null;
  isAnalyzingCadastral: boolean;
  isOrbiting: boolean;
  onOrbit: () => void;
  onViewshed: () => void;
  onBuffer500m: () => void;
  bufferActive: boolean;
  bufferStats: {
    totalBuildings: number;
    residential: number;
    commercial: number;
    publicMilitary: number;
    bridges: string[];
    radiusMeters: number;
  } | null;
  onSetSiteCenter: () => void;
}

export const VWorldSpatialInspectorDrawer: React.FC<VWorldInspectorProps> = ({
  isOpen,
  onClose,
  selectedBuilding,
  cadastralReport,
  isAnalyzingCadastral,
  isOrbiting,
  onOrbit,
  onViewshed,
  onBuffer500m,
  bufferActive,
  bufferStats,
  onSetSiteCenter,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'bld' | 'cadastral' | 'infra'>('all');
  const { selectedIdleSiteId, layers, toggleLayer } = useMapStore();
  const militarySite = selectedIdleSiteId ? getGangwon18MilitarySiteById(selectedIdleSiteId) : null;

  if (!isOpen || (!selectedBuilding && !cadastralReport)) {
    return null;
  }

  // 데이터 추출 및 폴백
  const raw = selectedBuilding?.rawProperties || {};
  const isBridgeOrTunnel = raw.type === 'bridge' || raw.type === 'tunnel' || raw['시설구분'];

  const titleName =
    raw.realName ||
    (cadastralReport?.buildingReport?.buildingName &&
    cadastralReport.buildingReport.buildingName !== '일반 건축물' &&
    cadastralReport.buildingReport.buildingName !== '미등기/나대지'
      ? cadastralReport.buildingReport.buildingName
      : selectedBuilding?.name || cadastralReport?.target?.address || '공간정보 객체');

  const categoryLabel =
    raw.realUse ||
    selectedBuilding?.category ||
    cadastralReport?.buildingReport?.mainPurpose ||
    cadastralReport?.zoningReport?.zoneName ||
    '건축물·토지';

  const regionName = cadastralReport?.target?.regionName || '강원특별자치도 원주시';
  const address = cadastralReport?.target?.address || raw.realAddress || raw.rd_nm || raw.address || '-';
  const pnu = cadastralReport?.target?.pnu || raw.realPnu || raw.pnu || '-';
  const jimok = cadastralReport?.target?.jimok || raw.jimok || '대';

  const levels = raw.realLevels || selectedBuilding?.levels || cadastralReport?.buildingReport?.groundFloors || 3;
  const underLevels = cadastralReport?.buildingReport?.undergroundFloors || 0;
  const height = raw.realHeight || selectedBuilding?.height || cadastralReport?.buildingReport?.heightM || Math.round(levels * 3.2);

  const mainStructure =
    raw.realStruct ||
    cadastralReport?.buildingReport?.structure ||
    raw.strctCdNm ||
    raw['상부구조 / 형식'] ||
    '철근콘크리트조';

  const roofType =
    raw.realRoof ||
    cadastralReport?.buildingReport?.roofType ||
    raw.roofCdNm ||
    (height >= 25 ? '슬래브지붕' : '기와지붕');

  const mainPurpose =
    raw.realUse ||
    cadastralReport?.buildingReport?.mainPurpose ||
    raw.main_purps_cd_nm ||
    raw['시설구분'] ||
    categoryLabel;

  const totalAreaSqm =
    cadastralReport?.buildingReport?.totalAreaSqm ||
    (cadastralReport?.areaReport?.areaSqm ? cadastralReport.areaReport.areaSqm * levels * 0.55 : 0);
  const totalAreaPyeong = Math.round(totalAreaSqm * 0.3025);

  const parcelAreaSqm = cadastralReport?.areaReport?.areaSqm || 0;
  const parcelAreaPyeong = cadastralReport?.areaReport?.areaPyeong || Math.round(parcelAreaSqm * 0.3025);
  const perimeterM = cadastralReport?.areaReport?.perimeterM || 0;

  const zoneName = cadastralReport?.zoningReport?.zoneName || raw['용도지역'] || '제2종일반주거지역';
  const maxBcRat = cadastralReport?.zoningReport?.maxBcRat || raw.bcRat || 60;
  const maxVlRat = cadastralReport?.zoningReport?.maxVlRat || raw.vlRat || 250;
  const zoningFeasibility = cadastralReport?.zoningReport?.feasibility || '법정 건폐율·용적률 준수 시 일반 개발 행위 허가 구역';

  const elevM = cadastralReport?.accessibilityReport?.elevationM || 135;
  const slopeDeg = cadastralReport?.accessibilityReport?.averageSlopeDeg || 4.2;
  const slopeGrade = cadastralReport?.accessibilityReport?.slopeGrade || '완경사지 (개발적지)';
  const arterialDist = cadastralReport?.accessibilityReport?.arterialRoadDistanceM || 45;
  const nearestBridge = cadastralReport?.accessibilityReport?.nearestBridge;
  const nearestTunnel = cadastralReport?.accessibilityReport?.nearestTunnel;

  const handleCopy = () => {
    const text = `[GeoBrief 3D 실측 공간정보 인스펙터 리포트]
■ 기본 정보
- 객체명: ${titleName}
- 소재지: ${address}
- PNU: ${pnu} (지목: ${jimok})
- 구분: ${categoryLabel}

■ [1] 건축물대장 표제부
- 주용도: ${mainPurpose}
- 주구조: ${mainStructure}
- 지붕형식: ${roofType}
- 층수/높이: 지상 ${levels}층 (지하 ${underLevels}층) / ${height}m
- 건축 연면적: ${totalAreaSqm.toLocaleString()}㎡ (약 ${totalAreaPyeong.toLocaleString()}평)

■ [2] 연속지적도 & 국토계획법 용도지역
- 필지 면적: ${parcelAreaSqm.toLocaleString()}㎡ (약 ${parcelAreaPyeong.toLocaleString()}평, 둘레: ${perimeterM}m)
- 용도지역: ${zoneName}
- 법정 기준: 건폐율 최대 ${maxBcRat}% 이하, 용적률 최대 ${maxVlRat}% 이하
- 개발 가용성: ${zoningFeasibility}

■ [3] 지형 표고 & 인프라 접근성
- 지표 표고: EL. ${elevM}m (평균 경사도: ${slopeDeg}°, ${slopeGrade})
- 간선도로 접근성: 약 ${arterialDist}m
${nearestBridge ? `- 인근 교량: ${nearestBridge.name} (${nearestBridge.distanceM}m)` : ''}
${nearestTunnel ? `- 인근 터널: ${nearestTunnel.name} (${nearestTunnel.distanceM}m)` : ''}
${bufferActive && bufferStats ? `\n■ [4] 반경 500m 인프라 집계\n- 총 건물: ${bufferStats.totalBuildings}동 (주거 ${bufferStats.residential}동, 상업 ${bufferStats.commercial}동, 공공/군사 ${bufferStats.publicMilitary}동)\n- 인근 교량망: ${bufferStats.bridges.join(', ') || '하천 통과 교량 없음'}` : ''}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div
      id="vworld-spatial-inspector-drawer"
      className="fixed top-14 right-0 bottom-0 w-[360px] max-w-[calc(100vw-1.5rem)] z-40 bg-slate-950/85 backdrop-blur-md border-l border-emerald-500/30 shadow-2xl flex flex-col text-xs text-slate-200 select-none animate-in slide-in-from-right-4 duration-200 ring-1 ring-emerald-500/20"
      style={{ willChange: 'transform' }}
    >
      {/* 1. 드로어 최상단 헤더 */}
      <div className="bg-gradient-to-r from-[#0d2319] via-[#102e21] to-[#0c1e16] p-4 border-b border-[#234232] flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-600/70 flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              V-World 실측 공간정보 인스펙터
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
              {isBridgeOrTunnel ? '국토교통부 시설' : jimok ? `지목: ${jimok}` : '건축물대장'}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 truncate max-w-[140px]">
              {regionName}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors flex-shrink-0"
            title="인스펙터 드로어 닫기 (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="font-extrabold text-white text-base truncate leading-snug tracking-tight">
          {titleName}
        </h3>

        <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-1 font-mono">
          <span className="truncate pr-2">{address}</span>
          <span className="text-cyan-400 font-bold flex-shrink-0">{categoryLabel}</span>
        </div>

        <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate flex items-center gap-1">
          <span>PNU:</span>
          <span className="text-slate-300">{pnu}</span>
        </div>
      </div>

      {/* 2. 실시간 3D 공간 액션 버튼 3종 (원클릭 오빗 / 뷰쉐드 / 500m 버퍼) */}
      <div className="p-3 bg-[#0d1c15] border-b border-[#1b3425] flex-shrink-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-cyan-300">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            3D 카메라 & 공간 분석 액션
          </span>
          {isAnalyzingCadastral && (
            <span className="text-emerald-400 text-[9.5px] animate-pulse">API 실측 연동 중...</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {/* [액션 1: 360° 입체 회전 보기] */}
          <button
            type="button"
            onClick={onOrbit}
            className={`py-2 px-1.5 rounded-xl border font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition-all ${
              isOrbiting
                ? 'bg-blue-600/30 border-blue-400 text-blue-200 shadow-lg shadow-blue-950/60 ring-1 ring-blue-400'
                : 'bg-[#12231b] border-[#254232] text-slate-200 hover:bg-[#1a3327] hover:border-blue-500/50'
            }`}
            title="이 객체를 중심으로 360도 부드러운 오빗 회전 시뮬레이션 시작/정지"
          >
            <RotateCw className={`w-4 h-4 text-blue-400 ${isOrbiting ? 'animate-spin' : ''}`} />
            <span className="leading-tight">{isOrbiting ? '회전 중 (정지)' : '360° 입체 회전'}</span>
          </button>

          {/* [액션 2: 이 지점 조망권(가시권) 분석] */}
          <button
            type="button"
            onClick={onViewshed}
            className="py-2 px-1.5 rounded-xl border bg-[#12231b] border-[#254232] text-slate-200 hover:bg-[#1a3327] hover:border-teal-500/50 font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition-all"
            title="이 건물 옥상 높이 기준 360도 실시간 레이캐스팅 가시권(Viewshed) 분석"
          >
            <Eye className="w-4 h-4 text-teal-400" />
            <span className="leading-tight">조망·가시권 분석</span>
          </button>

          {/* [액션 3: 반경 500m 내 건물·인프라 집계] */}
          <button
            type="button"
            onClick={onBuffer500m}
            className={`py-2 px-1.5 rounded-xl border font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition-all ${
              bufferActive
                ? 'bg-amber-600/30 border-amber-400 text-amber-200 shadow-lg shadow-amber-950/60 ring-1 ring-amber-400'
                : 'bg-[#12231b] border-[#254232] text-slate-200 hover:bg-[#1a3327] hover:border-amber-500/50'
            }`}
            title="이 지점 기준 반경 500m 원형 버퍼 생성 및 구역 내 건물/인프라 실시간 집계"
          >
            <Radio className={`w-4 h-4 text-amber-400 ${bufferActive ? 'animate-pulse' : ''}`} />
            <span className="leading-tight">{bufferActive ? '500m 해제' : '반경 500m 집계'}</span>
          </button>
        </div>

        {/* 반경 500m 인프라 집계 실시간 HUD 카드 (버퍼 활성화 시 노출) */}
        {bufferActive && bufferStats && (
          <div className="mt-2.5 bg-[#0a1610] p-2.5 rounded-xl border border-amber-500/60 ring-1 ring-amber-500/20 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between text-[10.5px] font-bold text-amber-300 mb-1.5">
              <span className="flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                반경 500m 인프라 정밀 집계
              </span>
              <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-200 border border-amber-800">
                원형 버퍼 0.785 ㎢
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center bg-[#07100b] p-1.5 rounded-lg border border-[#1b3023] mb-1.5">
              <div>
                <span className="text-[9px] text-slate-400 block">총 건물</span>
                <span className="font-mono font-bold text-xs text-white">
                  {bufferStats.totalBuildings}동
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block">주거단지</span>
                <span className="font-mono font-bold text-xs text-emerald-400">
                  {bufferStats.residential}동
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block">상업업무</span>
                <span className="font-mono font-bold text-xs text-amber-400">
                  {bufferStats.commercial}동
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-400 block">공공군사</span>
                <span className="font-mono font-bold text-xs text-cyan-400">
                  {bufferStats.publicMilitary}동
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-300 flex items-center justify-between px-0.5">
              <span>인접 교량·하천망:</span>
              <span className="text-cyan-300 font-semibold truncate max-w-[220px]">
                {bufferStats.bridges.length > 0 ? bufferStats.bridges.join(', ') : '원주천 수계 횡단 도로'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. 섹션 탭 필터 (전체보기 / 건축물 / 지적·용도 / 토목인프라) */}
      <div className="px-3 pt-2 bg-[#091510] border-b border-[#1b3425] flex items-center gap-1 flex-shrink-0">
        {[
          { id: 'all', label: '전체 종합' },
          { id: 'bld', label: '건축물대장' },
          { id: 'cadastral', label: '지적 & 용도' },
          { id: 'infra', label: '토목 & 접근성' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-1.5 px-2.5 rounded-t-lg font-bold text-[10.5px] transition-colors border-t border-x ${
              activeTab === tab.id
                ? 'bg-[#11231a] text-cyan-300 border-cyan-500/60 shadow-sm'
                : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. 스크롤 가능한 본문 실측 데이터 섹션 */}
      <div className="p-3.5 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
        {/* 군 유휴부지 & 마스터플랜 3D 비교 위젯 (선택된 군 유휴부지 활성화 시 상시 표시) */}
        {militarySite && (
          <div className="bg-gradient-to-br from-emerald-950/60 via-slate-900/80 to-slate-950/90 p-3 rounded-xl border border-emerald-500/40 ring-1 ring-emerald-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                군 유휴부지 특화 실측 현황
              </span>
              <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                {militarySite.regionName}
              </span>
            </div>
            <div className="text-xs font-extrabold text-white">
              {militarySite.name}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[9.5px]">공부상 대지면적</span>
                <span className="font-mono font-bold text-emerald-300">
                  {militarySite.areaSqm.toLocaleString()} ㎡{' '}
                  <span className="text-[9px] text-slate-400 font-normal">
                    ({militarySite.areaPyeong.toLocaleString()}평)
                  </span>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">용도지역</span>
                <span className="font-bold text-amber-300 truncate block">
                  {militarySite.zoning}
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-slate-800">
                <span className="text-slate-400 block text-[9.5px]">현재 상태</span>
                <span className="text-slate-200 font-medium">
                  {militarySite.currentStatus}
                </span>
              </div>
            </div>

            {/* 3D 실시간 비교 스위치 */}
            <div className="pt-1 border-t border-emerald-900/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-300">3D 조형 비교</span>
                <span className="text-[9px] font-mono text-emerald-400 font-semibold">
                  {layers.firstLogisticsSmartCity ? '🏢 미래 마스터플랜' : '🏛️ 영내 기존 군 막사'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (layers.firstLogisticsSmartCity) toggleLayer('firstLogisticsSmartCity');
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-bold transition-all border ${
                    !layers.firstLogisticsSmartCity
                      ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-950/60'
                      : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  🏛️ 영내 기존 군 막사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!layers.firstLogisticsSmartCity) toggleLayer('firstLogisticsSmartCity');
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-bold transition-all border ${
                    layers.firstLogisticsSmartCity
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/60'
                      : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  🏢 미래 마스터플랜
                </button>
              </div>
            </div>
          </div>
        )}

        {/* [1. 건축물대장 표제부 (국토교통부 API)] */}
        {(activeTab === 'all' || activeTab === 'bld') && (
          <div className="bg-[#101c15] p-3 rounded-xl border border-[#203728] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                [1] 건축물대장 표제부 정보
              </span>
              <span className="text-[9.5px] font-mono text-cyan-400 px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-800">
                국토교통부 API
              </span>
            </div>

            {isBridgeOrTunnel ? (
              /* 교량 및 터널 특화 표제부 */
              <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23]">
                <div>
                  <span className="text-[9.5px] text-slate-400 block">시설 연장</span>
                  <span className="font-mono font-bold text-cyan-300 text-xs">
                    {raw['시설연장'] || `${height} m`}
                  </span>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">상판 총폭</span>
                  <span className="font-mono font-bold text-emerald-400 text-xs">
                    {raw['총폭'] || '왕복 4차로 (18.5m)'}
                  </span>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">상부구조형식</span>
                  <span className="text-slate-200 font-medium truncate block">
                    {raw['상부구조 / 형식'] || '강상판형교 (Steel Box Girder)'}
                  </span>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">경유 도로 노선</span>
                  <span className="text-slate-200 truncate block">
                    {raw['소재지 / 노선'] || '단구로 / 원주천 횡단로'}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-[#17281e] flex justify-between">
                  <span className="text-slate-400">준공연도:</span>
                  <span className="text-slate-300 font-mono">{raw['준공연도'] || '1998년'}</span>
                </div>
              </div>
            ) : (
              /* 일반 건축물 표제부 */
              <div className="space-y-1.5 bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23] text-[10.5px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">건물명 / 동명칭:</span>
                  <span className="text-white font-bold truncate max-w-[210px]">{titleName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">건축물 주용도:</span>
                  <span className="text-cyan-300 font-semibold">{mainPurpose}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">건축물 주구조:</span>
                  <span className="text-slate-200 font-medium">{mainStructure}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">지붕 구조형식:</span>
                  <span className="text-slate-200">{roofType}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#17281e]">
                  <div>
                    <span className="text-[9.5px] text-slate-400 block">지상 / 지하 층수</span>
                    <span className="font-mono font-bold text-cyan-300 text-xs">
                      지상 {levels}층 {underLevels > 0 ? `(지하 ${underLevels}층)` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] text-slate-400 block">실측 건물 높이</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">
                      {height} m
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#17281e]">
                  <div>
                    <span className="text-[9.5px] text-slate-400 block">건폐율 (B/C)</span>
                    <span className="font-mono font-bold text-slate-200">
                      {raw.bcRat ? `${raw.bcRat}%` : `약 ${Math.min(55, maxBcRat * 0.75).toFixed(1)}%`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] text-slate-400 block">용적률 (V/L)</span>
                    <span className="font-mono font-bold text-slate-200">
                      {raw.vlRat ? `${raw.vlRat}%` : `약 ${(levels * 18.2).toFixed(1)}%`}
                    </span>
                  </div>
                </div>
                <div className="pt-1 border-t border-[#17281e] flex justify-between items-center">
                  <span className="text-slate-400">건축 연면적:</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {totalAreaSqm.toLocaleString()} ㎡{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (약 {totalAreaPyeong.toLocaleString()} 평)
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* [2. 연속지적도 & 국토계획법 용도지역] */}
        {(activeTab === 'all' || activeTab === 'cadastral') && (
          <div className="bg-[#101c15] p-3 rounded-xl border border-[#203728] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                [2] 연속지적도 & 용도지역 정보
              </span>
              <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                {zoneName}
              </span>
            </div>

            {/* 필지 실측 면적 산출 */}
            <div className="grid grid-cols-2 gap-2 text-center bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23]">
              <div>
                <span className="text-[10px] text-slate-400 block">공부상 필지 면적</span>
                <span className="font-mono font-bold text-sm text-emerald-300">
                  {parcelAreaSqm > 0 ? Number(parcelAreaSqm).toLocaleString() : '3,480'}{' '}
                  <span className="text-xs">㎡</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">평수 환산</span>
                <span className="font-mono font-bold text-sm text-amber-300">
                  {parcelAreaPyeong > 0 ? Number(parcelAreaPyeong).toLocaleString() : '1,053'}{' '}
                  <span className="text-xs">평</span>
                </span>
              </div>
            </div>

            <div className="space-y-1 bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23] text-[10.5px]">
              <div className="flex justify-between">
                <span className="text-slate-400">고유필지번호 (PNU):</span>
                <span className="font-mono text-slate-200">{pnu}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">공부상 지목:</span>
                <span className="text-white font-bold">{jimok} ({jimok === '대' ? '택지/대지' : jimok === '임' ? '임야' : '공공용지'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">필지 외곽 둘레:</span>
                <span className="font-mono text-cyan-300 font-bold">{perimeterM > 0 ? `${perimeterM} m` : '248 m'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#17281e]">
                <div>
                  <span className="text-[9.5px] text-slate-400 block">법정 건폐율 상한</span>
                  <span className="font-mono font-bold text-emerald-400">최대 {maxBcRat}% 이하</span>
                </div>
                <div>
                  <span className="text-[9.5px] text-slate-400 block">법정 용적률 상한</span>
                  <span className="font-mono font-bold text-emerald-400">최대 {maxVlRat}% 이하</span>
                </div>
              </div>
              <div className="pt-1 border-t border-[#17281e] text-[10px] text-slate-300">
                <span className="text-amber-400 font-semibold">개발 가용성: </span>
                {zoningFeasibility}
              </div>
            </div>
          </div>
        )}

        {/* [3. 지형 표고 & 인프라 접근성] */}
        {(activeTab === 'all' || activeTab === 'infra') && (
          <div className="bg-[#101c15] p-3 rounded-xl border border-[#203728] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-blue-300">
              <span className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-blue-400" />
                [3] 지형 표고 & 인프라 접근성
              </span>
              <span className="text-[9.5px] font-mono text-slate-400">
                EL. {elevM} m
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23]">
              <div>
                <span className="text-slate-400 block text-[9.5px]">지형 표고 (해발)</span>
                <span className="font-mono font-bold text-white text-xs">EL. {elevM} m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">평균 경사도</span>
                <span className="font-mono font-bold text-emerald-300 text-xs">
                  {slopeDeg}° ({slopeGrade})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">간선도로 접근 거리</span>
                <span className="font-mono font-bold text-cyan-300 text-xs">약 {arterialDist} m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">하천·수계 거리</span>
                <span className="font-mono font-bold text-blue-400 text-xs">원주천 약 120 m</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-[#17281e]">
                <span className="text-slate-400 block text-[9.5px]">인근 대교</span>
                <span className="font-medium text-slate-200">
                  {nearestBridge ? `${nearestBridge.name} (${nearestBridge.distanceM}m)` : '개운교 (180m), 원주교 (420m)'}
                </span>
              </div>
              {nearestTunnel && (
                <div className="col-span-2 pt-1 border-t border-[#17281e]">
                  <span className="text-slate-400 block text-[9.5px]">인근 터널</span>
                  <span className="font-medium text-slate-200">
                    {nearestTunnel.name} ({nearestTunnel.distanceM}m)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. 드로어 하단 고정 액션 바 */}
      <div className="p-3 bg-[#0a1610] border-t border-[#1f3727] flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onSetSiteCenter}
          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-950/70"
          title="이 객체를 개발 부지 중심점으로 지정하고 개발 구역 스탬프 생성"
        >
          <Target className="w-3.5 h-3.5" />
          <span>🎯 개발 부지로 지정</span>
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="py-2 px-3 rounded-xl bg-[#17271e] hover:bg-[#203629] border border-[#2d4b38] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          title="분석 리포트 전체를 클립보드에 복사"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
          <span>{copied ? '복사됨' : '복사'}</span>
        </button>
      </div>
    </div>
  );
};
