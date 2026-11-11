'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { getGangwon18MilitarySiteById } from '@/constants/gangwon18MilitarySites';
import {
  SpatialOntologyEngine,
  LegalOntologyAssessmentReport,
} from '@/lib/vendor/spatialOntologyEngine';
import {
  LandCompensationEngine,
  CompensationFeasibilityAnalysis,
  formatKoreanWon,
} from '@/lib/vendor/landCompensationEngine';
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
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  GitBranch,
  ArrowRight,
  ChevronDown,
  Coins,
  TrendingUp,
  Sliders,
  Maximize2,
  Minimize2,
  Printer,
  Percent,
  ArrowUpRight,
  Calculator,
  Briefcase,
  Calendar,
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
  const [activeTab, setActiveTab] = useState<'all' | 'compensation' | 'ontology' | 'bld' | 'cadastral' | 'infra'>('compensation');
  const [selectedFaq, setSelectedFaq] = useState<string | null>(null);

  // [토지보상 & 기부대양여 시뮬레이션 인터랙티브 상태]
  const [realizationMultiplier, setRealizationMultiplier] = useState(1.55); // 1.0x ~ 2.5x
  const [daetoRatio, setDaetoRatio] = useState(0.20);                      // 0% ~ 50%
  const [bondRatio, setBondRatio] = useState(0.15);                       // 0% ~ 40%
  const [targetFAR, setTargetFAR] = useState(250);                        // 150% ~ 400%
  const [selectedStrategyTab, setSelectedStrategyTab] = useState<'strategy_a' | 'strategy_b' | 'strategy_c' | 'strategy_d'>('strategy_a');
  const [isWideModalOpen, setIsWideModalOpen] = useState(false);
  const [landPriceApiData, setLandPriceApiData] = useState<any | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const { selectedIdleSiteId, layers, toggleLayer } = useMapStore();
  const militarySite = selectedIdleSiteId ? getGangwon18MilitarySiteById(selectedIdleSiteId) : null;

  // 데이터 추출 및 폴백 (안전한 옵셔널 체이닝)
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

  // [실시간 V-World 개별공시지가 API 백그라운드 호출]
  useEffect(() => {
    if (!isOpen) return;
    const center = selectedBuilding?.center || cadastralReport?.target?.coords;
    if (!center || !center[0] || !center[1]) return;
    const [lng, lat] = center;

    let isMounted = true;
    setIsPriceLoading(true);

    const targetPnu = cadastralReport?.target?.pnu || selectedBuilding?.rawProperties?.pnu || '';
    const targetArea = cadastralReport?.areaReport?.areaSqm || selectedBuilding?.rawProperties?.areaSqm || '';
    const targetRegion = cadastralReport?.target?.regionId || 'wonju';

    const params = new URLSearchParams();
    params.set('lng', String(lng));
    params.set('lat', String(lat));
    params.set('regionId', targetRegion);
    if (targetPnu) params.set('pnu', targetPnu);
    if (targetArea) params.set('areaSqm', String(targetArea));
    if (militarySite?.id) params.set('siteId', militarySite.id);

    fetch(`/api/land-valuation?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.success) {
          setLandPriceApiData(data);
          if (data.militarySiteInfo) {
            setSelectedStrategyTab('strategy_a');
          }
        }
      })
      .catch((err) => console.warn('[Inspector] Land valuation fetch notice:', err))
      .finally(() => {
        if (isMounted) setIsPriceLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    selectedBuilding?.center?.[0],
    selectedBuilding?.center?.[1],
    cadastralReport?.target?.pnu,
    cadastralReport?.areaReport?.areaSqm,
    militarySite?.id,
  ]);

  // [토지보상 & 기부대양여 시뮬레이터 0ms 리액티브 연산]
  const compensationAnalysis: CompensationFeasibilityAnalysis = useMemo(() => {
    const basePrice =
      landPriceApiData?.landPrice?.pricePerSqm ||
      (zoneName.includes('상업') ? 3450000 : zoneName.includes('공업') ? 880000 : 1420000);

    const effArea =
      militarySite?.areaSqm ||
      parcelAreaSqm ||
      (cadastralReport?.areaReport?.areaSqm ? Number(cadastralReport.areaReport.areaSqm) : 1250);

    const effBldArea =
      totalAreaSqm ||
      (cadastralReport?.buildingReport?.totalAreaSqm ? Number(cadastralReport.buildingReport.totalAreaSqm) : effArea * 0.55);

    return LandCompensationEngine.calculate({
      basePricePerSqm: basePrice,
      areaSqm: effArea,
      buildingAreaSqm: effBldArea,
      floors: levels,
      zoningName: zoneName,
      jimok: jimok,
      isMilitarySite: Boolean(militarySite || jimok?.includes('군') || jimok?.includes('국')),
      regionName: regionName,
      subregion: cadastralReport?.target?.subregion,
      realizationMultiplier,
      daetoRatio,
      bondRatio,
      targetFAR,
    });
  }, [
    landPriceApiData,
    zoneName,
    militarySite?.areaSqm,
    militarySite?.id,
    parcelAreaSqm,
    cadastralReport?.areaReport?.areaSqm,
    totalAreaSqm,
    cadastralReport?.buildingReport?.totalAreaSqm,
    levels,
    jimok,
    regionName,
    cadastralReport?.target?.subregion,
    realizationMultiplier,
    daetoRatio,
    bondRatio,
    targetFAR,
  ]);

  // NVIDIA Auto-Ontology 복합 인허가 & 규제 지식 그래프 리포트
  const ontologyReport = useMemo(() => {
    if (!isOpen || (!selectedBuilding && !cadastralReport)) {
      return null;
    }
    return SpatialOntologyEngine.assessLegalFeasibility({
      siteId: militarySite?.id || selectedIdleSiteId || undefined,
      pnu: pnu !== '-' ? pnu : undefined,
      address: address !== '-' ? address : titleName,
      areaSqm: militarySite?.areaSqm || parcelAreaSqm || totalAreaSqm || 33000,
      averageSlopeDeg: slopeDeg,
      currentZoning: zoneName,
      groundElevationM: elevM,
    });
  }, [
    isOpen,
    Boolean(selectedBuilding),
    Boolean(cadastralReport),
    militarySite?.id,
    selectedIdleSiteId,
    pnu,
    address,
    titleName,
    militarySite?.areaSqm,
    parcelAreaSqm,
    totalAreaSqm,
    slopeDeg,
    zoneName,
    elevM,
  ]);

  const handleCopy = () => {
    const text = `[GeoBrief 3D 실측 공간정보 & 토지보상 검토 리포트]
■ 기본 정보
- 객체명: ${titleName}
- 소재지: ${address}
- PNU: ${pnu} (지목: ${jimok})
- 공부상 면적: ${compensationAnalysis.input.areaSqm.toLocaleString()}㎡ (${Math.round(compensationAnalysis.input.areaSqm * 0.3025).toLocaleString()}평)
- 용도지역: ${zoneName}

■ [💰 토지가격 & 토지보상법 산정액]
- ㎡당 개별공시지가: ${compensationAnalysis.valuation3Tier.tier1.pricePerSqm.toLocaleString()}원 (평당 ${compensationAnalysis.valuation3Tier.tier1.pricePerPyeong.toLocaleString()}원)
- 총 개별공시지가: ${compensationAnalysis.valuation3Tier.tier1.totalAmountFormatted}
- 현실화율 반영 추정 시세: ${compensationAnalysis.valuation3Tier.tier2.totalAmountFormatted} (${realizationMultiplier}배율)
- 토지보상법 제70조 추정 보상금: ${compensationAnalysis.valuation3Tier.tier3.totalAmountFormatted}
- 추천 취득방식: ${compensationAnalysis.recommendedStrategyLabel}
- B/C 편익비용비: ${compensationAnalysis.financialSummary.bcRatio} (${compensationAnalysis.financialSummary.feasibilityVerdict})

■ [⚖️ 복합 인허가 & 규제 온톨로지]
- 판정: ${ontologyReport?.verdictLabel || '-'} (${ontologyReport?.militaryRestrictionLevel || '-'})
- 종상향 용적률: 최대 ${ontologyReport?.developmentSpec.targetFarPct || 0}%`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handlePrint = () => {
    window.print();
  };

  // [렌더링 가드] 모든 훅 호출 완료 후 안전한 null 반환
  if (!isOpen || (!selectedBuilding && !cadastralReport) || !ontologyReport) {
    return null;
  }

  return (
    <>
      {/* =====================================================================
          [우측 슬라이드인 인스펙터 메인 드로어]
          ===================================================================== */}
      <div
        id="vworld-spatial-inspector-drawer"
        className="fixed top-14 right-0 bottom-0 w-[380px] max-w-[calc(100vw-1.5rem)] z-40 bg-slate-950/85 backdrop-blur-md border-l border-emerald-500/30 shadow-2xl flex flex-col text-xs text-slate-200 select-none animate-in slide-in-from-right-4 duration-200 ring-1 ring-emerald-500/20"
        style={{ willChange: 'transform' }}
      >
        {/* 1. 드로어 최상단 헤더 */}
        <div className="bg-gradient-to-r from-[#0d2319] via-[#102e21] to-[#0c1e16] p-3.5 border-b border-[#234232] flex-shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-600/70 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                V-World 공간분석 & 토지보상
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
                {isBridgeOrTunnel ? '국토교통부 시설' : jimok ? `지목: ${jimok}` : '건축물대장'}
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 truncate max-w-[130px]">
                {regionName}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* [중앙 와이드 모달 확장 버튼] */}
              <button
                type="button"
                onClick={() => setIsWideModalOpen(true)}
                className="p-1.5 text-cyan-300 hover:text-white rounded-lg bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/60 transition-colors flex items-center gap-1 text-[10px] font-bold"
                title="화면 중앙 와이드 팝업 모달로 크게 보기"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">와이드</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors flex-shrink-0"
                title="인스펙터 드로어 닫기 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <h3 className="font-extrabold text-white text-base truncate leading-snug tracking-tight">
            {titleName}
          </h3>

          <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-1 font-mono">
            <span className="truncate pr-2">{address}</span>
            <span className="text-cyan-400 font-bold flex-shrink-0">{categoryLabel}</span>
          </div>

          <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate flex items-center justify-between">
            <span>PNU: <span className="text-slate-300">{pnu}</span></span>
            {isPriceLoading && (
              <span className="text-emerald-400 text-[9.5px] animate-pulse flex items-center gap-1">
                <Coins className="w-3 h-3 animate-spin" /> 공시지가 API 조회 중...
              </span>
            )}
          </div>
        </div>

        {/* 2. 실시간 3D 공간 액션 버튼 3종 */}
        <div className="p-2.5 bg-[#0d1c15] border-b border-[#1b3425] flex-shrink-0">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={onOrbit}
              className={`py-1.5 px-1 rounded-xl border font-bold text-[10.5px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                isOrbiting
                  ? 'bg-blue-600/30 border-blue-400 text-blue-200 shadow-lg shadow-blue-950/60 ring-1 ring-blue-400'
                  : 'bg-[#12231b] border-[#254232] text-slate-200 hover:bg-[#1a3327]'
              }`}
              title="이 객체를 중심으로 360도 오빗 회전"
            >
              <RotateCw className={`w-3.5 h-3.5 text-blue-400 ${isOrbiting ? 'animate-spin' : ''}`} />
              <span>{isOrbiting ? '회전 중' : '360° 회전'}</span>
            </button>

            <button
              type="button"
              onClick={onViewshed}
              className="py-1.5 px-1 rounded-xl border bg-[#12231b] border-[#254232] text-slate-200 hover:bg-[#1a3327] font-bold text-[10.5px] flex flex-col items-center justify-center gap-0.5 transition-all"
              title="옥상 높이 기준 가시권 분석"
            >
              <Eye className="w-3.5 h-3.5 text-teal-400" />
              <span>조망·가시권</span>
            </button>

            <button
              type="button"
              onClick={onBuffer500m}
              className={`py-1.5 px-1 rounded-xl border font-bold text-[10.5px] flex flex-col items-center justify-center gap-0.5 transition-all ${
                bufferActive
                  ? 'bg-amber-600/30 border-amber-400 text-amber-200 ring-1 ring-amber-400'
                  : 'bg-[#12231b] border-[#254232] text-slate-200 hover:bg-[#1a3327]'
              }`}
              title="반경 500m 원형 버퍼 집계"
            >
              <Radio className={`w-3.5 h-3.5 text-amber-400 ${bufferActive ? 'animate-pulse' : ''}`} />
              <span>{bufferActive ? '버퍼 해제' : '500m 집계'}</span>
            </button>
          </div>
        </div>

        {/* 3. 섹션 탭 필터 (전체 / 토지가격 & 보상방안 / 복합 인허가 / 건축물 / 지적 / 토목) */}
        <div className="px-2 pt-2 bg-[#091510] border-b border-[#1b3425] flex items-center gap-1 overflow-x-auto flex-shrink-0 no-scrollbar">
          {[
            { id: 'compensation', label: '💰 토지가격 & 보상방안' },
            { id: 'all', label: '전체' },
            { id: 'ontology', label: '⚖️ 복합 인허가' },
            { id: 'bld', label: '건축물대장' },
            { id: 'cadastral', label: '지적 & 용도' },
            { id: 'infra', label: '토목 & 접근성' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-1.5 px-2.5 rounded-t-lg font-bold text-[10.5px] whitespace-nowrap transition-colors border-t border-x ${
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
          {/* ===================================================================
              [💰 토지가격 & 토지보상·기부대양여 분석 섹션]
              =================================================================== */}
          {(activeTab === 'all' || activeTab === 'compensation') && (
            <div className="bg-[#0e2218] p-3 rounded-xl border border-emerald-500/40 ring-1 ring-emerald-500/20 space-y-3">
              {/* 상단 4대 핵심 요약 배지 */}
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  토지가격 & 4대 보상방안 브리핑
                </span>
                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                  {landPriceApiData?.sourceMeta?.priceSource === 'vworld_indvd_land_price_api'
                    ? 'V-World 실시간'
                    : '강원18 벤치마크'}
                </span>
              </div>

              {/* 4대 주요 지표 카드 */}
              <div className="grid grid-cols-2 gap-1.5 text-center">
                <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                  <span className="text-[9px] text-slate-400 block">㎡당 공시지가</span>
                  <span className="font-mono font-bold text-xs text-white">
                    {compensationAnalysis.valuation3Tier.tier1.pricePerSqm.toLocaleString()}원
                  </span>
                  <span className="text-[8.5px] text-slate-400 block">
                    (평당 {Math.round(compensationAnalysis.valuation3Tier.tier1.pricePerPyeong / 10000).toLocaleString()}만원)
                  </span>
                </div>
                <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                  <span className="text-[9px] text-slate-400 block">평당 추정시세 ({realizationMultiplier}x)</span>
                  <span className="font-mono font-bold text-xs text-amber-300">
                    {Math.round(compensationAnalysis.valuation3Tier.tier2.pricePerPyeong / 10000).toLocaleString()}만원
                  </span>
                  <span className="text-[8.5px] text-slate-400 block">
                    (총 {compensationAnalysis.valuation3Tier.tier2.totalAmountFormatted})
                  </span>
                </div>
                <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                  <span className="text-[9px] text-slate-400 block">총 추정 보상금 (제70조)</span>
                  <span className="font-mono font-bold text-xs text-cyan-300">
                    약 {compensationAnalysis.financialSummary.totalCompensationCost.toLocaleString()}억원
                  </span>
                  <span className="text-[8.5px] text-cyan-400/80 block">토지+지장물+간접</span>
                </div>
                <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                  <span className="text-[9px] text-slate-400 block">B/C 분석 편익비</span>
                  <span className="font-mono font-extrabold text-xs text-emerald-400">
                    {compensationAnalysis.financialSummary.bcRatio}{' '}
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                      {compensationAnalysis.financialSummary.feasibilityVerdict}
                    </span>
                  </span>
                  <span className="text-[8.5px] text-slate-400 block">
                    순익 {compensationAnalysis.financialSummary.netProfit.toLocaleString()}억원
                  </span>
                </div>
              </div>

              {/* 3-Tier 가격 비교 카드 */}
              <div className="bg-[#07130e] p-2.5 rounded-lg border border-[#1b3425] space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                  <span className="flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-emerald-400" />
                    3-Tier 토지가격 정밀 비교
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    공부면적: {compensationAnalysis.input.areaSqm.toLocaleString()}㎡
                  </span>
                </div>

                <div className="space-y-1.5 text-[10px]">
                  {/* Tier 1 */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#0b1b13] border border-slate-800">
                    <div>
                      <span className="font-bold text-slate-300 block">① 총 개별공시지가</span>
                      <span className="text-[8.5px] text-slate-500">조세·과세 표준 기준</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-200">
                        {compensationAnalysis.valuation3Tier.tier1.totalAmountFormatted}
                      </span>
                      <span className="text-[8.5px] text-slate-400 block">1.0x</span>
                    </div>
                  </div>

                  {/* Tier 2 */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#0b1b13] border border-amber-900/40">
                    <div>
                      <span className="font-bold text-amber-300 block">② 현실화율 반영 시세</span>
                      <span className="text-[8.5px] text-slate-400">탁상감정 추정 시세</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-amber-300">
                        {compensationAnalysis.valuation3Tier.tier2.totalAmountFormatted}
                      </span>
                      <span className="text-[8.5px] text-amber-400 block font-mono">
                        {realizationMultiplier.toFixed(2)}배 적용
                      </span>
                    </div>
                  </div>

                  {/* Tier 3 */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#0d2217] border border-cyan-500/50">
                    <div>
                      <span className="font-bold text-cyan-300 block">③ 토지보상법 추정 보상금</span>
                      <span className="text-[8.5px] text-cyan-400/80">제70조 정당보상 합계</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-extrabold text-cyan-300 text-xs">
                        {compensationAnalysis.valuation3Tier.tier3.totalAmountFormatted}
                      </span>
                      <span className="text-[8.5px] text-cyan-400/80 block">
                        토지 {formatKoreanWon(compensationAnalysis.valuation3Tier.tier3.breakdown.landCompensation)} + 지장물 {formatKoreanWon(compensationAnalysis.valuation3Tier.tier3.breakdown.structureCompensation)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 최근 3개년 공시지가 실측 변동 추이 */}
                {landPriceApiData?.landPrice?.history && (
                  <div className="pt-1.5 border-t border-[#172c20]">
                    <span className="text-[9px] font-bold text-slate-400 block mb-1">
                      최근 3개년 공시지가 변동 추이 (2024~2026)
                    </span>
                    <div className="grid grid-cols-3 gap-1 text-center font-mono text-[9px]">
                      {landPriceApiData.landPrice.history.map((h: any) => (
                        <div key={h.year} className="bg-[#0b1812] p-1 rounded border border-[#1b3023]">
                          <span className="text-slate-400 block">{h.year}년</span>
                          <span className="font-bold text-white block">
                            {Math.round(h.pricePerSqm / 10000).toLocaleString()}만원
                          </span>
                          <span className="text-emerald-400 text-[8px]">
                            {h.changeRatePct > 0 ? `+${h.changeRatePct}%` : `${h.changeRatePct}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 인터랙티브 동적 시뮬레이션 슬라이더 */}
              <div className="bg-[#091510] p-2.5 rounded-lg border border-[#1b3425] space-y-2">
                <span className="text-[10px] font-bold text-cyan-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    실시간 보상가·사업성 시뮬레이터
                  </span>
                  <span className="text-[8.5px] text-slate-400 font-mono">실시간 리액티브 연산</span>
                </span>

                <div className="space-y-1.5 text-[9.5px]">
                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>보상 현실화율 배수:</span>
                      <span className="font-mono font-bold text-amber-400">{realizationMultiplier.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="2.5"
                      step="0.05"
                      value={realizationMultiplier}
                      onChange={(e) => setRealizationMultiplier(parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>대토보상(제63조) 비율:</span>
                      <span className="font-mono font-bold text-emerald-400">{(daetoRatio * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="0.5"
                      step="0.05"
                      value={daetoRatio}
                      onChange={(e) => setDaetoRatio(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>보상채권 발행 비율:</span>
                      <span className="font-mono font-bold text-blue-400">{(bondRatio * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="0.4"
                      step="0.05"
                      value={bondRatio}
                      onChange={(e) => setBondRatio(parseFloat(e.target.value))}
                      className="w-full accent-blue-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300 mb-0.5">
                      <span>종상향 목표 용적률:</span>
                      <span className="font-mono font-bold text-purple-400">{targetFAR}%</span>
                    </div>
                    <input
                      type="range"
                      min="150"
                      max="400"
                      step="10"
                      value={targetFAR}
                      onChange={(e) => setTargetFAR(parseInt(e.target.value, 10))}
                      className="w-full accent-purple-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* 대토/채권 현금 절감 효과 HUD */}
                <div className="p-1.5 rounded bg-[#0d1e16] border border-emerald-500/40 text-[9.5px] flex items-center justify-between">
                  <span className="text-slate-300">초기 현금 투입 절감액:</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {compensationAnalysis.financialSummary.cashSavings.toLocaleString()}억원 절감
                  </span>
                </div>
              </div>

              {/* 4대 맞춤형 취득·보상 전략 탭 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                    4대 맞춤형 취득·보상방안
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 truncate max-w-[170px]">
                    추천: {compensationAnalysis.recommendedStrategyLabel}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1 text-[9px] font-bold">
                  {[
                    { id: 'strategy_a', label: '방안 A (기부대양여)' },
                    { id: 'strategy_b', label: '방안 B (협의/수용)' },
                    { id: 'strategy_c', label: '방안 C (대토/채권)' },
                    { id: 'strategy_d', label: '방안 D (군사규제)' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStrategyTab(s.id as any)}
                      className={`py-1 px-0.5 rounded text-center transition-all border ${
                        selectedStrategyTab === s.id
                          ? 'bg-amber-600/30 border-amber-400 text-amber-200 ring-1 ring-amber-400'
                          : 'bg-[#091510] border-[#1b3425] text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* 선택된 전략별 세부 상세 카드 */}
                {selectedStrategyTab === 'strategy_a' && (
                  <div className="p-2.5 rounded-lg bg-[#07130e] border border-emerald-500/30 text-[9.5px] space-y-1.5">
                    <div className="flex justify-between items-center text-emerald-300 font-bold">
                      <span>{compensationAnalysis.strategies.strategyA.title}</span>
                      <span className="font-mono text-[8.5px] text-slate-400">국유재산법 제55조</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-center font-mono">
                      <div className="bg-[#0b1b13] p-1.5 rounded">
                        <span className="text-[8.5px] text-slate-400 block">종전부지 양여가액</span>
                        <span className="font-bold text-white">
                          약 {compensationAnalysis.strategies.strategyA.transferAssetValue.toLocaleString()}억원
                        </span>
                      </div>
                      <div className="bg-[#0b1b13] p-1.5 rounded">
                        <span className="text-[8.5px] text-slate-400 block">대체시설 기부비용</span>
                        <span className="font-bold text-amber-300">
                          약 {compensationAnalysis.strategies.strategyA.donationCost.toLocaleString()}억원
                        </span>
                      </div>
                    </div>
                    <div className="p-1 rounded bg-[#0b1b13] text-[9px] text-slate-300">
                      <span className="text-amber-400 font-semibold">수지타산 정산: </span>
                      {compensationAnalysis.strategies.strategyA.settlementMethod}
                    </div>
                  </div>
                )}

                {selectedStrategyTab === 'strategy_b' && (
                  <div className="p-2.5 rounded-lg bg-[#07130e] border border-cyan-500/30 text-[9.5px] space-y-1.5">
                    <div className="flex justify-between items-center text-cyan-300 font-bold">
                      <span>{compensationAnalysis.strategies.strategyB.title}</span>
                      <span className="font-mono text-[8.5px] text-slate-400">토지보상법 제19조~제34조</span>
                    </div>
                    <div className="space-y-1">
                      {compensationAnalysis.strategies.strategyB.roadmap.map((step) => (
                        <div key={step.stepNumber} className="flex items-center justify-between bg-[#0b1b13] p-1 rounded">
                          <span className="font-semibold text-slate-200">
                            {step.stepNumber}. {step.stepName}
                          </span>
                          <span className="font-mono text-[8.5px] text-cyan-400">{step.duration}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[9px] pt-1 border-t border-slate-800 text-slate-400">
                      <span>예상 소요기간: 협의 7개월 / 수용재결 14개월</span>
                      <span className="text-amber-300 font-semibold">
                        재결 시 증액추정 +{compensationAnalysis.strategies.strategyB.projectedAdjudicationIncrease}억원
                      </span>
                    </div>
                  </div>
                )}

                {selectedStrategyTab === 'strategy_c' && (
                  <div className="p-2.5 rounded-lg bg-[#07130e] border border-blue-500/30 text-[9.5px] space-y-1.5">
                    <div className="flex justify-between items-center text-blue-300 font-bold">
                      <span>{compensationAnalysis.strategies.strategyC.title}</span>
                      <span className="font-mono text-[8.5px] text-slate-400">토지보상법 제63조</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center font-mono">
                      <div className="bg-[#0b1b13] p-1 rounded">
                        <span className="text-[8px] text-slate-400 block">현금 지급</span>
                        <span className="font-bold text-white">
                          {compensationAnalysis.strategies.strategyC.cashPaymentAmount.toLocaleString()}억
                        </span>
                      </div>
                      <div className="bg-[#0b1b13] p-1 rounded">
                        <span className="text-[8px] text-slate-400 block">대토 보상</span>
                        <span className="font-bold text-emerald-400">
                          {compensationAnalysis.strategies.strategyC.daetoPaymentAmount.toLocaleString()}억
                        </span>
                      </div>
                      <div className="bg-[#0b1b13] p-1 rounded">
                        <span className="text-[8px] text-slate-400 block">보상 채권</span>
                        <span className="font-bold text-blue-400">
                          {compensationAnalysis.strategies.strategyC.bondPaymentAmount.toLocaleString()}억
                        </span>
                      </div>
                    </div>
                    <div className="p-1 rounded bg-[#0b1b13] text-[9px] text-slate-300">
                      <span className="text-emerald-400 font-semibold">PF 금융비용 절감: </span>
                      3개년 약 {compensationAnalysis.strategies.strategyC.financialInterestSavings}억원 이자 절감 효과
                    </div>
                  </div>
                )}

                {selectedStrategyTab === 'strategy_d' && (
                  <div className="p-2.5 rounded-lg bg-[#07130e] border border-purple-500/30 text-[9.5px] space-y-1.5">
                    <div className="flex justify-between items-center text-purple-300 font-bold">
                      <span>{compensationAnalysis.strategies.strategyD.title}</span>
                      <span className="font-mono text-[8.5px] text-slate-400">군사기지법 제13조~제16조</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-center font-mono">
                      <div className="bg-[#0b1b13] p-1 rounded">
                        <span className="text-[8.5px] text-slate-400 block">군사규제 감가율</span>
                        <span className="font-bold text-rose-400">
                          -{compensationAnalysis.strategies.strategyD.discountRatePercent}%
                        </span>
                      </div>
                      <div className="bg-[#0b1b13] p-1 rounded">
                        <span className="text-[8.5px] text-slate-400 block">해제 시 개발이익</span>
                        <span className="font-bold text-emerald-400">
                          +{compensationAnalysis.strategies.strategyD.deregulationUpsideValue.toLocaleString()}억원
                        </span>
                      </div>
                    </div>
                    <div className="p-1 rounded bg-[#0b1b13] text-[9px] text-slate-300">
                      <span className="text-amber-400 font-semibold">매수청구권: </span>
                      {compensationAnalysis.strategies.strategyD.buyoutClaimEligible
                        ? '요건 충족 (국방부 대상 매수청구 가능)'
                        : '통상 제한보호구역 (작전성 협의 필요)'}
                    </div>
                  </div>
                )}
              </div>

              {/* 보고서 출력 및 와이드 팝업 버튼 */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#1b3425]">
                <button
                  type="button"
                  onClick={() => setIsWideModalOpen(true)}
                  className="py-1.5 px-2 rounded-lg bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-600/70 text-cyan-200 font-bold text-[10px] flex items-center justify-center gap-1 transition-all"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>중앙 와이드 분석</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-1.5 px-2 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-600/70 text-emerald-200 font-bold text-[10px] flex items-center justify-center gap-1 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>보고서 출력 / PDF</span>
                </button>
              </div>
            </div>
          )}

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

          {/* [⚖️ NVIDIA Auto-Ontology 복합 인허가 & 규제 온톨로지 판정 섹션] */}
          {(activeTab === 'all' || activeTab === 'ontology') && (
            <div className="bg-[#0f2118] p-3 rounded-xl border border-emerald-500/40 ring-1 ring-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-emerald-400" />
                  복합 인허가 & 규제 온톨로지 판정
                </span>
                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-emerald-400" />
                  Auto-Ontology
                </span>
              </div>

              {/* 신호등 판정 배너 */}
              <div
                className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
                  ontologyReport.verdict === 'GREEN'
                    ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-200'
                    : ontologyReport.verdict === 'YELLOW'
                    ? 'bg-amber-950/80 border-amber-500/70 text-amber-200'
                    : 'bg-rose-950/80 border-rose-500/70 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs flex items-center gap-1.5">
                    {ontologyReport.verdict === 'GREEN' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : ontologyReport.verdict === 'YELLOW' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    {ontologyReport.verdictLabel}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/50 border border-white/20">
                    {ontologyReport.militaryRestrictionLevel}
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed opacity-90">
                  {ontologyReport.verdictDetail}
                </p>
                <div className="text-[9.5px] font-mono pt-1 border-t border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">관할 부대/기관:</span>
                  <span className="font-semibold text-white truncate max-w-[200px]">
                    {ontologyReport.competentMilitaryAgency}
                  </span>
                </div>
              </div>

              {/* NVIDIA Auto-Ontology 관계 체인 */}
              <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828] space-y-1.5">
                <span className="text-[9.5px] font-bold text-slate-400 flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-cyan-400" />
                  온톨로지 관계 체인 (Entity-Relation Flow)
                </span>
                <div className="flex items-center gap-1 overflow-x-auto py-1 text-[9.5px] font-mono no-scrollbar">
                  <div className="px-2 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 whitespace-nowrap">
                    부지 ({ontologyReport.areaPyeong.toLocaleString()}평)
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <div className="px-2 py-1 rounded bg-amber-950 text-amber-300 border border-amber-700/60 whitespace-nowrap">
                    {ontologyReport.militaryRestrictionLevel}
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <div className="px-2 py-1 rounded bg-blue-950 text-blue-300 border border-blue-700/60 whitespace-nowrap">
                    군사기지법 협의
                  </div>
                  <ArrowRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  <div className="px-2 py-1 rounded bg-purple-950 text-purple-300 border border-purple-700/60 whitespace-nowrap">
                    용적률 {ontologyReport.developmentSpec.targetFarPct}%
                  </div>
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

              <div className="space-y-1.5 bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23] text-[10.5px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">건물명:</span>
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
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#17281e]">
                  <div>
                    <span className="text-[9.5px] text-slate-400 block">지상 / 지하 층수</span>
                    <span className="font-mono font-bold text-cyan-300 text-xs">
                      지상 {levels}층 {underLevels > 0 ? `(지하 ${underLevels}층)` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9.5px] text-slate-400 block">실측 건물 높이</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">{height} m</span>
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

              <div className="grid grid-cols-2 gap-2 text-center bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23]">
                <div>
                  <span className="text-[10px] text-slate-400 block">공부상 필지 면적</span>
                  <span className="font-mono font-bold text-sm text-emerald-300">
                    {parcelAreaSqm > 0 ? Number(parcelAreaSqm).toLocaleString() : '3,480'} ㎡
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">평수 환산</span>
                  <span className="font-mono font-bold text-sm text-amber-300">
                    {parcelAreaPyeong > 0 ? Number(parcelAreaPyeong).toLocaleString() : '1,053'} 평
                  </span>
                </div>
              </div>

              <div className="space-y-1 bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23] text-[10.5px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">PNU:</span>
                  <span className="font-mono text-slate-200">{pnu}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">공부상 지목:</span>
                  <span className="text-white font-bold">{jimok}</span>
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
                <span className="text-[9.5px] font-mono text-slate-400">EL. {elevM} m</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10.5px] bg-[#0c1611] p-2.5 rounded-lg border border-[#1b2f23]">
                <div>
                  <span className="text-slate-400 block text-[9.5px]">해발 표고</span>
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
                  <span className="text-slate-400 block text-[9.5px]">인근 대교</span>
                  <span className="font-medium text-slate-200">
                    {nearestBridge ? `${nearestBridge.name} (${nearestBridge.distanceM}m)` : '원주천교'}
                  </span>
                </div>
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
            title="이 객체를 개발 부지 중심점으로 지정"
          >
            <Target className="w-3.5 h-3.5" />
            <span>🎯 개발 부지 지정</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="py-2 px-3 rounded-xl bg-[#17271e] hover:bg-[#203629] border border-[#2d4b38] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="분석 리포트 전체 복사"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
            <span>{copied ? '복사됨' : '복사'}</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          [중앙 와이드 팝업 모달: 폭 760px~820px 정밀 토지보상 및 타당성 검토서]
          ===================================================================== */}
      {isWideModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-emerald-500/50 rounded-2xl shadow-2xl max-w-[820px] w-full max-h-[92vh] flex flex-col text-slate-100 overflow-hidden ring-1 ring-emerald-500/30">
            {/* 모달 헤더 */}
            <div className="p-4 bg-gradient-to-r from-[#0d2319] via-[#102e21] to-[#0c1e16] border-b border-[#234232] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                    <span>[대한민국 표준] V-World 실측 토지가격 및 토지보상·기부대양여 타당성 검토서</span>
                  </h2>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {address} (PNU: {pnu}) | 지목: {jimok} | 용도: {zoneName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-1 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shadow-md transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>인쇄 / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsWideModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 모달 본문 (스크롤) */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-xs">
              {/* 상단 4대 핵심 지표 요약 바 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-[#0e2218] p-2.5 rounded-xl border border-emerald-500/40">
                  <span className="text-[10px] text-slate-400 block">㎡당 공시지가</span>
                  <span className="font-mono font-extrabold text-sm text-white">
                    {compensationAnalysis.valuation3Tier.tier1.pricePerSqm.toLocaleString()}원
                  </span>
                  <span className="text-[9px] text-emerald-400 block">
                    평당 {Math.round(compensationAnalysis.valuation3Tier.tier1.pricePerPyeong / 10000).toLocaleString()}만원
                  </span>
                </div>
                <div className="bg-[#0e2218] p-2.5 rounded-xl border border-amber-500/40">
                  <span className="text-[10px] text-slate-400 block">추정 시세 ({realizationMultiplier}x)</span>
                  <span className="font-mono font-extrabold text-sm text-amber-300">
                    {Math.round(compensationAnalysis.valuation3Tier.tier2.pricePerPyeong / 10000).toLocaleString()}만원/평
                  </span>
                  <span className="text-[9px] text-amber-400/80 block">
                    총 {compensationAnalysis.valuation3Tier.tier2.totalAmountFormatted}
                  </span>
                </div>
                <div className="bg-[#0e2218] p-2.5 rounded-xl border border-cyan-500/40">
                  <span className="text-[10px] text-slate-400 block">총 추정 보상금 (제70조)</span>
                  <span className="font-mono font-extrabold text-sm text-cyan-300">
                    약 {compensationAnalysis.financialSummary.totalCompensationCost.toLocaleString()}억원
                  </span>
                  <span className="text-[9px] text-cyan-400/80 block">
                    토지+지장물+간접손실
                  </span>
                </div>
                <div className="bg-[#0e2218] p-2.5 rounded-xl border border-purple-500/40">
                  <span className="text-[10px] text-slate-400 block">B/C 분석 편익비</span>
                  <span className="font-mono font-extrabold text-sm text-purple-300">
                    {compensationAnalysis.financialSummary.bcRatio} ({compensationAnalysis.financialSummary.feasibilityVerdict})
                  </span>
                  <span className="text-[9px] text-purple-400/80 block">
                    순익 {compensationAnalysis.financialSummary.netProfit.toLocaleString()}억원
                  </span>
                </div>
              </div>

              {/* 3-Tier 가격 상세 비교 표 */}
              <div className="bg-[#0a1610] p-3.5 rounded-xl border border-[#1d3828] space-y-2">
                <h4 className="font-bold text-white text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-emerald-400" />
                    3단계 토지 가격 및 법적 평가액 정밀 분석표
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    부지 면적: {compensationAnalysis.input.areaSqm.toLocaleString()}㎡ (약 {Math.round(compensationAnalysis.input.areaSqm * 0.3025).toLocaleString()}평)
                  </span>
                </h4>

                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-2">구분 (평가 계층)</th>
                      <th className="py-2">총 평가액 (억원)</th>
                      <th className="py-2">㎡당 단가</th>
                      <th className="py-2">평당 단가</th>
                      <th className="py-2">산출 근거 및 법령</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    <tr>
                      <td className="py-2 font-bold text-slate-300">① 총 개별공시지가</td>
                      <td className="py-2 text-white font-extrabold">
                        {compensationAnalysis.valuation3Tier.tier1.totalAmountFormatted}
                      </td>
                      <td className="py-2">{compensationAnalysis.valuation3Tier.tier1.pricePerSqm.toLocaleString()}원</td>
                      <td className="py-2">{compensationAnalysis.valuation3Tier.tier1.pricePerPyeong.toLocaleString()}원</td>
                      <td className="py-2 text-[10px] font-sans text-slate-400">부동산공시법 제10조 (과세표준)</td>
                    </tr>
                    <tr className="bg-amber-950/20">
                      <td className="py-2 font-bold text-amber-300">② 추정 시세 (탁상감정)</td>
                      <td className="py-2 text-amber-300 font-extrabold">
                        {compensationAnalysis.valuation3Tier.tier2.totalAmountFormatted}
                      </td>
                      <td className="py-2">{compensationAnalysis.valuation3Tier.tier2.pricePerSqm.toLocaleString()}원</td>
                      <td className="py-2">{compensationAnalysis.valuation3Tier.tier2.pricePerPyeong.toLocaleString()}원</td>
                      <td className="py-2 text-[10px] font-sans text-amber-400/80">공시지가 대비 {realizationMultiplier}배 현실화율</td>
                    </tr>
                    <tr className="bg-cyan-950/30">
                      <td className="py-2 font-bold text-cyan-300">③ 토지보상법 추정 보상금</td>
                      <td className="py-2 text-cyan-300 font-extrabold">
                        {compensationAnalysis.valuation3Tier.tier3.totalAmountFormatted}
                      </td>
                      <td className="py-2">{compensationAnalysis.valuation3Tier.tier3.pricePerSqm.toLocaleString()}원</td>
                      <td className="py-2">{compensationAnalysis.valuation3Tier.tier3.pricePerPyeong.toLocaleString()}원</td>
                      <td className="py-2 text-[10px] font-sans text-cyan-400/80">
                        토지보상법 제70조 (토지+지장물+간접)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4대 맞춤형 취득·보상방안 종합 대조표 */}
              <div className="bg-[#0a1610] p-3.5 rounded-xl border border-[#1d3828] space-y-3">
                <h4 className="font-bold text-white text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-amber-400" />
                    4대 맞춤형 취득·보상방안 및 로드맵
                  </span>
                  <span className="font-semibold text-emerald-400 text-[10.5px]">
                    ★ 최적 추천: {compensationAnalysis.recommendedStrategyLabel}
                  </span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                  {/* 방안 A */}
                  <div className="p-3 rounded-xl bg-[#07130e] border border-emerald-500/40 space-y-2">
                    <div className="flex justify-between items-center text-emerald-300 font-bold">
                      <span>방안 A: 국방부 기부대양여 사업</span>
                      <span className="text-[9.5px] font-mono text-slate-400">군사기지법/국유재산법</span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      대체 군사시설을 신축 기부하고 종전 군부대 부지를 양여받는 방식으로 초기 토지매입 현금 지출 0원 달성.
                    </p>
                    <div className="bg-[#0b1b13] p-2 rounded-lg font-mono text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">종전부지 양여평가액:</span>
                        <span className="font-bold text-white">약 {compensationAnalysis.strategies.strategyA.transferAssetValue}억원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">대체시설 기부예정액:</span>
                        <span className="font-bold text-amber-300">약 {compensationAnalysis.strategies.strategyA.donationCost}억원</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">수지타산 정산차액:</span>
                        <span className="font-bold text-emerald-400">약 {compensationAnalysis.strategies.strategyA.netSettlementBalance}억원</span>
                      </div>
                    </div>
                  </div>

                  {/* 방안 B */}
                  <div className="p-3 rounded-xl bg-[#07130e] border border-cyan-500/40 space-y-2">
                    <div className="flex justify-between items-center text-cyan-300 font-bold">
                      <span>방안 B: 토지보상법 6단계 협의취득 & 수용재결</span>
                      <span className="text-[9.5px] font-mono text-slate-400">토지보상법 제19조~제34조</span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      사업인정고시 ➔ 조서작성 ➔ 3인 감정평가 ➔ 협의보상 ➔ 수용재결의 공익사업 표준 강제수용 로드맵.
                    </p>
                    <div className="bg-[#0b1b13] p-2 rounded-lg font-mono text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">총 예상 보상비:</span>
                        <span className="font-bold text-white">약 {compensationAnalysis.financialSummary.totalCompensationCost}억원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">협의완료 시 소요기간:</span>
                        <span className="font-bold text-cyan-300">약 7개월 (수용재결 시 14개월)</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">수용재결 시 증액추정:</span>
                        <span className="font-bold text-amber-400">+{compensationAnalysis.strategies.strategyB.projectedAdjudicationIncrease}억원 (+4.5%)</span>
                      </div>
                    </div>
                  </div>

                  {/* 방안 C */}
                  <div className="p-3 rounded-xl bg-[#07130e] border border-blue-500/40 space-y-2">
                    <div className="flex justify-between items-center text-blue-300 font-bold">
                      <span>방안 C: 대토보상 & 채권보상 혼합</span>
                      <span className="text-[9.5px] font-mono text-slate-400">토지보상법 제63조</span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      현금 지급을 줄이고 조성토지(대토) 및 3년 만기 보상채권을 결합하여 시행사 PF 금융비용 최소화.
                    </p>
                    <div className="bg-[#0b1b13] p-2 rounded-lg font-mono text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">초기 현금 소요액:</span>
                        <span className="font-bold text-white">약 {compensationAnalysis.financialSummary.initialCashRequired}억원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">초기 현금 절감액:</span>
                        <span className="font-bold text-emerald-400">약 {compensationAnalysis.financialSummary.cashSavings}억원 절감</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">3개년 PF 금융이자 절감:</span>
                        <span className="font-bold text-blue-400">약 {compensationAnalysis.strategies.strategyC.financialInterestSavings}억원</span>
                      </div>
                    </div>
                  </div>

                  {/* 방안 D */}
                  <div className="p-3 rounded-xl bg-[#07130e] border border-purple-500/40 space-y-2">
                    <div className="flex justify-between items-center text-purple-300 font-bold">
                      <span>방안 D: 군사기지법 규제 감가 및 매수청구권</span>
                      <span className="text-[9.5px] font-mono text-slate-400">군사기지법 제13조~제16조</span>
                    </div>
                    <p className="text-[10px] text-slate-300">
                      군사시설 보호구역 규제 감가로 저렴하게 취득 후 완화/해제(종상향)를 통해 시세차익 극대화.
                    </p>
                    <div className="bg-[#0b1b13] p-2 rounded-lg font-mono text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400">군사규제 감가율:</span>
                        <span className="font-bold text-rose-400">-{compensationAnalysis.strategies.strategyD.discountRatePercent}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">규제상태 취득가액:</span>
                        <span className="font-bold text-white">약 {compensationAnalysis.strategies.strategyD.discountedValue}억원</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800">
                        <span className="text-slate-400">규제 해제 시 개발이익:</span>
                        <span className="font-bold text-emerald-400">+{compensationAnalysis.strategies.strategyD.deregulationUpsideValue}억원</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 종합 사업 타당성 및 경제적 이익 (B/C 분석) */}
              <div className="bg-[#0e2218] p-3.5 rounded-xl border border-emerald-500/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-300 text-xs flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-emerald-400" />
                    종합 개발 사업성 및 경제적 타당성 (B/C Feasibility Sheet)
                  </span>
                  <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                    B/C {compensationAnalysis.financialSummary.bcRatio} [{compensationAnalysis.financialSummary.feasibilityVerdict}]
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-[10.5px]">
                  <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                    <span className="text-[9px] text-slate-400 block font-sans">총 사업비 (Cost)</span>
                    <span className="font-bold text-white text-xs">
                      {compensationAnalysis.financialSummary.totalProjectCost.toLocaleString()}억원
                    </span>
                    <span className="text-[8px] text-slate-500 block">보상+조성+부대비</span>
                  </div>
                  <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                    <span className="text-[9px] text-slate-400 block font-sans">분양/매각 매출 (Benefit)</span>
                    <span className="font-bold text-cyan-300 text-xs">
                      {compensationAnalysis.financialSummary.projectedRevenue.toLocaleString()}억원
                    </span>
                    <span className="text-[8px] text-cyan-400/80 block">{compensationAnalysis.financialSummary.totalFloorAreaPyeong.toLocaleString()}평 개발</span>
                  </div>
                  <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                    <span className="text-[9px] text-slate-400 block font-sans">개발 순이익 (Profit)</span>
                    <span className="font-bold text-amber-300 text-xs">
                      {compensationAnalysis.financialSummary.netProfit.toLocaleString()}억원
                    </span>
                    <span className="text-[8px] text-amber-400/80 block">매출 - 총사업비</span>
                  </div>
                  <div className="bg-[#091510] p-2 rounded-lg border border-[#1d3828]">
                    <span className="text-[9px] text-slate-400 block font-sans">투자 수익률 (ROI)</span>
                    <span className="font-bold text-emerald-400 text-xs">
                      {Math.round((compensationAnalysis.financialSummary.netProfit / compensationAnalysis.financialSummary.totalProjectCost) * 100)}%
                    </span>
                    <span className="text-[8px] text-emerald-400/80 block">사업성 양호</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-[#07130e] text-[10px] text-slate-300 leading-relaxed">
                  <span className="font-bold text-emerald-400">종합 검토의견: </span>
                  {compensationAnalysis.recommendationReason}
                </div>
              </div>
            </div>

            {/* 모달 하단 닫기 */}
            <div className="p-3 bg-[#0a1610] border-t border-[#1f3727] flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] text-slate-500 font-mono">
                기준 법령: 국토계획법 / 토지보상법 제70조 / 군사기지 및 군사시설 이전 특별법 제5조
              </span>
              <button
                type="button"
                onClick={() => setIsWideModalOpen(false)}
                className="py-1.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                닫기 (ESC)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
