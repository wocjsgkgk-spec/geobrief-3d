'use client';

import React, { useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { TacticalParticleCanvas } from '@/components/Cinematic/TacticalParticleCanvas';
import {
  X,
  Building2,
  Navigation,
  ShieldAlert,
  Coins,
  TrendingUp,
  MapPin,
  CheckCircle2,
  Award,
  ExternalLink,
} from 'lucide-react';

export type CandidateSiteInfo = {
  id: string;
  name: string;
  region: string;
  location: string;
  coords: [number, number]; // [lng, lat]
  areaSqm: number;
  areaPyeong: number;
  securityRegulation: string;
  heightLimit: string;
  nearestHwy: string;
  nearestRail: string;
  feasibilityScore: number;
  grade: 'A+' | 'A' | 'A-' | 'B+' | 'B';
  estimatedLandValue: string;
  slopeRisk: string;
  recommendedUse: string;
};

export const GANGWON_CANDIDATE_SITES: CandidateSiteInfo[] = [
  {
    id: 'first-logistics-wonju',
    name: '원주 제1군수지원사령부 부지',
    region: '원주시',
    location: '우산동·학성동·태장동 일원',
    coords: [127.9358, 37.3592],
    areaSqm: 310000,
    areaPyeong: 93775,
    securityRegulation: '제한보호구역 해제 추진 대상',
    heightLimit: '비행안전 제5구역 (45m 완화)',
    nearestHwy: '남원주IC 2.4km (영동/중앙고속 연결)',
    nearestRail: '원주역 KTX 3.1km',
    feasibilityScore: 96,
    grade: 'A+',
    estimatedLandValue: '약 4,820억 원 (155만 원/㎡)',
    slopeRisk: '경사도 3.2° (초평탄지, 침수 0.4%)',
    recommendedUse: '스마트 물류유통 · 미래 IT 신산업 첨단복합단지',
  },
  {
    id: 'camp-page-chuncheon',
    name: '춘천 캠프페이지 반환공여구역',
    region: '춘천시',
    location: '근화동 189-1 일원',
    coords: [127.7185, 37.8845],
    areaSqm: 540000,
    areaPyeong: 163350,
    securityRegulation: '주한미군 반환공여지 특별법 적용',
    heightLimit: '수변 경관 고도제한 (50m 이내)',
    nearestHwy: '춘천IC 7.5km (중앙고속도로)',
    nearestRail: '춘천역 ITX-청춘 0.3km (초역세권)',
    feasibilityScore: 92,
    grade: 'A',
    estimatedLandValue: '약 6,200억 원 (115만 원/㎡)',
    slopeRisk: '경사도 1.8° (의암호 인접 수위 관제)',
    recommendedUse: 'K-컬처 문화복합타운 · 시민친화 녹색생태공원',
  },
  {
    id: 'gangneung-airfield-rear',
    name: '강릉 공항 배후 유휴부지',
    region: '강릉시',
    location: '남항진동·월호평동 일원',
    coords: [128.9325, 37.7495],
    areaSqm: 185000,
    areaPyeong: 55960,
    securityRegulation: '군용비행장 안전보호구역 제2·3구역',
    heightLimit: '비행안전 표면 엄격제한 (30m 이내)',
    nearestHwy: '강릉IC 6.2km (동해고속도로)',
    nearestRail: '강릉역 KTX-이음 3.8km',
    feasibilityScore: 84,
    grade: 'B+',
    estimatedLandValue: '약 2,150억 원 (116만 원/㎡)',
    slopeRisk: '경사도 2.1° (해풍 및 염해 방지 설계)',
    recommendedUse: '항공우주 MRO 정비클러스터 · 해양레저 R&D',
  },
  {
    id: 'sokcho-yeongnang-site',
    name: '속초 영랑호 배후 군사시설 잔여지',
    region: '속초시',
    location: '영랑동·장사동 일원',
    coords: [128.5855, 38.2185],
    areaSqm: 142000,
    areaPyeong: 42950,
    securityRegulation: '해안경계 작전구역 협의대상',
    heightLimit: '호수 주변 자연경관지구 (21m 제한)',
    nearestHwy: '속초IC 4.8km (동해고속도로 북속초)',
    nearestRail: '동서고속화철도 속초역(예정) 2.2km',
    feasibilityScore: 88,
    grade: 'A-',
    estimatedLandValue: '약 2,680억 원 (188만 원/㎡)',
    slopeRisk: '경사도 4.5° (영랑호 조망 우수, 사면 견고)',
    recommendedUse: '체류형 웰니스 스마트 관광휴양단지',
  },
];

export const SpatialCompareMatrixModal: React.FC = () => {
  const { isCompareMatrixOpen, setCompareMatrixOpen, selectRegion } = useMapStore();
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([
    'first-logistics-wonju',
    'camp-page-chuncheon',
    'gangneung-airfield-rear',
  ]);

  if (!isCompareMatrixOpen) return null;

  const activeSites = GANGWON_CANDIDATE_SITES.filter((s) =>
    selectedSiteIds.includes(s.id)
  );

  const toggleSite = (id: string) => {
    if (selectedSiteIds.includes(id)) {
      if (selectedSiteIds.length <= 1) return; // 최소 1개 유지
      setSelectedSiteIds(selectedSiteIds.filter((s) => s !== id));
    } else {
      if (selectedSiteIds.length >= 4) return; // 최대 4개
      setSelectedSiteIds([...selectedSiteIds, id]);
    }
  };

  const handleFlyTo = (site: CandidateSiteInfo) => {
    setCompareMatrixOpen(false);
    const regId =
      site.region === '원주시'
        ? 'wonju'
        : site.region === '춘천시'
        ? 'chuncheon'
        : site.region === '강릉시'
        ? 'gangneung'
        : 'sokcho';
    selectRegion(regId);
  };

  // 최고 점수 사이트
  const topSite = [...activeSites].sort(
    (a, b) => b.feasibilityScore - a.feasibilityScore
  )[0];

  return (
    <div
      id="spatial-compare-matrix-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-[#0c1410] border border-emerald-500/50 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.8)] ring-1 ring-emerald-500/20 overflow-hidden flex flex-col">
        {/* 사이버네틱스 전술 파티클 배경 */}
        <TacticalParticleCanvas density="sparse" color="emerald" />

        {/* 1. 모달 헤더 */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1b2b20] bg-[#080e0b]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-wide flex items-center gap-2">
                <span>강원권 핵심 군 유휴지 1:1 다각적 비교 분석 매트릭스</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-200 border border-emerald-500/40 font-mono">
                  MCDA V2.5
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                국방 규제 · 교통 인프라 · 개발 타당성 · 추정 토지가치 6대 핵심 지표 종합 판정
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 후보지 선택 칩 */}
            <div className="flex items-center gap-1.5 bg-[#121c16] border border-[#233527] px-2 py-1 rounded-xl">
              {GANGWON_CANDIDATE_SITES.map((site) => {
                const isSelected = selectedSiteIds.includes(site.id);
                return (
                  <button
                    key={site.id}
                    onClick={() => toggleSite(site.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-emerald-950/50'
                    }`}
                  >
                    {site.region.slice(0, 2)}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCompareMatrixOpen(false)}
              className="p-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. 매트릭스 테이블 바디 */}
        <div className="relative z-10 flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeSites.map((site) => {
              const isTop = topSite && topSite.id === site.id;
              return (
                <div
                  key={site.id}
                  className={`relative flex flex-col justify-between rounded-xl p-5 border backdrop-blur-md transition-all ${
                    isTop
                      ? 'bg-[#102016]/90 border-emerald-500/70 shadow-[0_0_25px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/40'
                      : 'bg-[#0f1712]/80 border-[#233527] hover:border-emerald-500/40'
                  }`}
                >
                  {isTop && (
                    <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-md">
                      ★ 종합 1위 최고 타당성
                    </div>
                  )}

                  <div>
                    {/* 상단 타이틀 & 평점 배지 */}
                    <div className="flex items-start justify-between gap-2 border-b border-[#1b2b20] pb-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{site.region}</span>
                          <span className="text-slate-500">|</span>
                          <span className="text-slate-400 font-normal">{site.location}</span>
                        </div>
                        <h3 className="text-base font-extrabold text-white mt-1">
                          {site.name}
                        </h3>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-2xl font-black text-emerald-300 font-mono">
                          {site.grade}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {site.feasibilityScore} / 100점
                        </div>
                      </div>
                    </div>

                    {/* 세부 메트릭 6종 */}
                    <div className="mt-4 space-y-2.5 text-xs">
                      {/* 면적 */}
                      <div className="flex items-start justify-between bg-[#080d0a]/70 p-2 rounded-lg border border-[#1b2b20]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                          대지 면적
                        </span>
                        <span className="text-white font-mono font-bold text-right">
                          {site.areaSqm.toLocaleString()} ㎡
                          <span className="text-slate-400 text-[11px] block">
                            (약 {site.areaPyeong.toLocaleString()}평)
                          </span>
                        </span>
                      </div>

                      {/* 국방 안보 규제 */}
                      <div className="flex items-start justify-between bg-[#080d0a]/70 p-2 rounded-lg border border-[#1b2b20]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                          국방 보안규제
                        </span>
                        <span className="text-slate-200 text-right font-medium max-w-[55%]">
                          {site.securityRegulation}
                        </span>
                      </div>

                      {/* 비행고도 제한 */}
                      <div className="flex items-start justify-between bg-[#080d0a]/70 p-2 rounded-lg border border-[#1b2b20]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                          건축 높이제한
                        </span>
                        <span className="text-cyan-200 font-mono font-bold text-right">
                          {site.heightLimit}
                        </span>
                      </div>

                      {/* 교통 인프라 */}
                      <div className="flex items-start justify-between bg-[#080d0a]/70 p-2 rounded-lg border border-[#1b2b20]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-indigo-400" />
                          교통 접근성
                        </span>
                        <div className="text-right text-[11px] space-y-0.5">
                          <div className="text-white">{site.nearestHwy}</div>
                          <div className="text-indigo-300 font-mono">{site.nearestRail}</div>
                        </div>
                      </div>

                      {/* 추정 지가 */}
                      <div className="flex items-start justify-between bg-[#080d0a]/70 p-2 rounded-lg border border-[#1b2b20]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-yellow-400" />
                          추정 토지가치
                        </span>
                        <span className="text-yellow-300 font-mono font-bold text-right">
                          {site.estimatedLandValue}
                        </span>
                      </div>

                      {/* 추천 용도 */}
                      <div className="bg-[#0b1610] p-2.5 rounded-lg border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-400 font-bold block mb-1">
                          권장 개발 용도
                        </span>
                        <span className="text-slate-200 font-medium text-[11px]">
                          {site.recommendedUse}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 지도 즉시 이동 버튼 */}
                  <button
                    onClick={() => handleFlyTo(site)}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold hover:bg-emerald-600 hover:text-white hover:border-emerald-400 transition-all cursor-pointer shadow-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>3D 디지털 트윈 지도로 즉시 이동</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 모달 푸터 */}
        <div className="relative z-10 flex items-center justify-between px-6 py-3 border-t border-[#1b2b20] bg-[#080e0b]/90 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>국토교통부 브이월드 실측 토지이용계획원 및 국방부 공식 군사기지보호법 정합</span>
          </div>
          <div>단위: ㎡ / 평 / KTX·고속도로 최단 직선거리</div>
        </div>
      </div>
    </div>
  );
};
