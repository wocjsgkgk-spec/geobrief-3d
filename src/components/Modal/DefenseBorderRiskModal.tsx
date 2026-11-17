'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Plane,
  Crosshair,
  ExternalLink,
  X,
  MapPin,
  CheckCircle2,
  FileText,
  Activity,
  Layers,
  Building,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import {
  GANGWON_BORDER_DEFENSE_PROFILES,
  BorderFacilityProfile,
  RiskLevel,
} from '@/lib/vendor/borderIntelligence';

export const DefenseBorderRiskModal: React.FC = () => {
  const isBorderRiskModalOpen = useMapStore((state: any) => state.isBorderRiskModalOpen);
  const setBorderRiskModalOpen = useMapStore((state: any) => state.setBorderRiskModalOpen);
  const mapInstance = useMapStore((state: any) => state.mapInstance);

  const [selectedSiteId, setSelectedSiteId] = useState<string>('wonju-1st-logistics');

  if (!isBorderRiskModalOpen) return null;

  const currentProfile =
    GANGWON_BORDER_DEFENSE_PROFILES.find((p) => p.id === selectedSiteId) ||
    GANGWON_BORDER_DEFENSE_PROFILES[0];

  const handleFlyTo = (lat: number, lng: number) => {
    if (!mapInstance) return;
    mapInstance.flyTo({
      center: [lng, lat],
      zoom: 16.5,
      pitch: 60,
      bearing: -20,
      duration: 2500,
      essential: true,
    });
  };

  const getRiskBadge = (level: RiskLevel, label: string) => {
    switch (level) {
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-950/80 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" /> {label}
          </span>
        );
      case 'REVIEW':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-950/80 px-2 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
            <AlertTriangle className="h-3 w-3" /> {label}
          </span>
        );
      case 'HIGH_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-red-950/80 px-2 py-0.5 text-xs font-semibold text-red-400 border border-red-500/40 animate-pulse">
            <ShieldAlert className="h-3 w-3" /> {label}
          </span>
        );
    }
  };

  return (
    <div
      id="defense-border-risk-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-cyan-500/40 bg-slate-950/95 text-slate-100 shadow-2xl shadow-cyan-950/50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  접경·군사시설보호구역 3D 위험도 및 비행안전 분석 매트릭스
                </h2>
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-300 border border-cyan-500/30">
                  DEFENSE AI MATRIX
                </span>
              </div>
              <p className="text-xs text-slate-400">
                군사기지 및 군사시설보호법·공항시설법 연계 6대 개발 위험 벡터 & 비행안전 심의 평가
              </p>
            </div>
          </div>
          <button
            onClick={() => setBorderRiskModalOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Site Selector Pills */}
        <div className="flex items-center gap-2 border-b border-slate-800/60 bg-slate-900/60 px-6 py-2.5 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">검토 대상지:</span>
          {GANGWON_BORDER_DEFENSE_PROFILES.map((site) => (
            <button
              key={site.id}
              onClick={() => setSelectedSiteId(site.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                selectedSiteId === site.id
                  ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-900/50 border border-cyan-400/50'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/50'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              {site.siteName}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-12">
          {/* Left Column: Site Info & Flight Safety */}
          <div className="flex flex-col gap-5 lg:col-span-5">
            {/* Site Summary Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-mono text-cyan-400">{currentProfile.region}</span>
                  <h3 className="text-base font-bold text-white mt-0.5">{currentProfile.siteName}</h3>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">종합 추진 적합도</div>
                  <div className="text-2xl font-black text-cyan-400 font-mono">
                    {currentProfile.overallFeasibilityScore}
                    <span className="text-xs text-slate-400 font-normal ml-0.5">/100</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs border-t border-slate-800/80 pt-3 font-mono">
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">보호구역 분류</span>
                  <span className="font-bold text-amber-300">{currentProfile.zoneType}</span>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">군사분계선(MDL) 이격</span>
                  <span className="font-bold text-white">{currentProfile.distanceToDemarcationKm} km</span>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">지자체 재정자립도</span>
                  <span className="font-bold text-white">{currentProfile.fiscalSelfReliancePct} %</span>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/50">
                  <span className="text-slate-400 block text-[10px]">간선도로 포장률</span>
                  <span className="font-bold text-white">{currentProfile.roadPavingPct} %</span>
                </div>
              </div>

              <button
                onClick={() => handleFlyTo(currentProfile.lat, currentProfile.lng)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600/90 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 transition shadow-lg shadow-cyan-950/50"
              >
                <Crosshair className="h-4 w-4" /> 3D 위치 즉각 비행 (FlyTo)
              </button>
            </div>

            {/* Flight Safety Box */}
            <div className="rounded-xl border border-sky-900/60 bg-sky-950/30 p-5">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <Plane className="h-4 w-4" /> 비행안전구역 고도 제한 진단
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">
                  {currentProfile.flightSafety.zoneName}
                </span>
                <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-bold text-sky-300 border border-sky-500/30">
                  {currentProfile.flightSafety.decisionLabel}
                </span>
              </div>
              <div className="mt-3 rounded-lg bg-slate-950/70 p-3 text-xs text-slate-300 border border-slate-800">
                <p>{currentProfile.flightSafety.detail}</p>
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  근거: {currentProfile.flightSafety.legalBasis}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: 6-Vector Development Risk Matrix */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" />
                <h4 className="text-sm font-bold text-white">6대 개발 위험 벡터 정량 진단 (Risk Matrix)</h4>
              </div>
              <span className="text-[11px] text-slate-400">국방부·행안부 표준 심의체계</span>
            </div>

            <div className="space-y-3">
              {currentProfile.riskMatrix.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-3.5 transition hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                        {item.categoryLabel}
                      </span>
                      {getRiskBadge(item.level, item.levelLabel)}
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-400">
                      위험지수: <span className="text-white">{item.score}</span>/100
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all duration-500 ${
                        item.level === 'HIGH_REVIEW'
                          ? 'bg-red-500'
                          : item.level === 'REVIEW'
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>

                  <div className="mt-2 text-xs text-slate-300">
                    <span className="font-semibold text-slate-400">근거: </span>
                    {item.evidence}
                  </div>
                  <div className="mt-1 text-xs text-cyan-300 font-medium">
                    <span className="font-semibold text-cyan-500">대응 조치: </span>
                    {item.nextAction}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-900/40 px-6 py-3 text-xs text-slate-400">
          <span>* 본 진단 자료는 국방부 군사기지법 및 공개 지자체 공간정보를 기반으로 한 사전 의사결정 참고용입니다.</span>
          <button
            onClick={() => setBorderRiskModalOpen(false)}
            className="rounded-lg bg-slate-800 px-4 py-1.5 font-bold text-white hover:bg-slate-700 transition"
          >
            닫기 (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
