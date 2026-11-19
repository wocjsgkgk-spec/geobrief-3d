/**
 * components/Map/UrbanChronicleTimeline.tsx
 *
 * [DeanChensj/jiangshan-map 벤더링: 인터랙티브 도시·군사 시계열 연혁 타임라인 HUD]
 *
 * 깃허브 스타 7.9k의 역사 GIS 지도 'jiangshan-map'의 시계열 슬라이더를 벤더링하여,
 * 강원특별자치도 원주 구 제1군수지원사령부(1군지사) 및 군 유휴지의 70년 변천사(1954~2030+)를
 * 3차원 디지털트윈과 실시간 연동하여 탐색하는 인터랙티브 타임라인 컴포넌트입니다.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  Shield,
  Building2,
  Clock,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface ChronicleEpoch {
  id: string;
  year: number;
  label: string;
  tag: string;
  badgeColor: string;
  title: string;
  summary: string;
  details: string;
  militaryStatus: string;
  urbanPhase: string;
}

export const CHRONICLE_EPOCHS: ChronicleEpoch[] = [
  {
    id: 'epoch-1954',
    year: 1954,
    label: '1954년',
    tag: '군사기지 창설기',
    badgeColor: 'bg-amber-600/80 border-amber-400 text-amber-200',
    title: '제1군수지원사령부 창설 및 군사보안 철책선 구축',
    summary: '6.25 전쟁 직후 중부전선 후방 군수지원의 중추로 부대 창설 및 단계·우산동 일대 주둔 기지화',
    details: '우산동 정비대대, 단계동 보급대대 및 사령부 청사 조성. 원주시 도심 외곽 군사시설보호구역 지정.',
    militaryStatus: '군사기지 주둔 및 통제',
    urbanPhase: '도심 외곽 군사시설 격리',
  },
  {
    id: 'epoch-1985',
    year: 1985,
    label: '1985년',
    tag: '영서 군수 중추 주둔기',
    badgeColor: 'bg-emerald-700/80 border-emerald-400 text-emerald-200',
    title: '1군지사 활성 주둔 및 원주 도심 팽창 공존기',
    summary: '영서·강원 전역 야전 군수지원 총괄 거점으로 확장. 도심 확장으로 인한 이전 요구 태동',
    details: '정비·보급·수송·의무 4대 주력 대대 집중 운용. 북원로·학성동 일대 민간 시가지 팽창으로 부대 포위.',
    militaryStatus: '야전 군수지원사령부 만개',
    urbanPhase: '도시 팽창에 따른 도심 단절 심화',
  },
  {
    id: 'epoch-2024',
    year: 2024,
    label: '2024년',
    tag: '부대 이전 및 유휴지 철거기',
    badgeColor: 'bg-cyan-700/80 border-cyan-400 text-cyan-200',
    title: '호저면·만종 신기지 이전 완료 및 구 도심 부지 철거·정화',
    summary: '70년 만의 도심 군사시설 완전 철수. 단계동·우산동·학성동 3개 지구 지상 건축물 철거 및 국공유지화',
    details: '국방부-원주시 기부대양여 사업 진행. 군사 보안 철책 철거, 토양오염 정밀 정화 착수 및 나대지 확보.',
    militaryStatus: '부대 이전 완료 (유휴 국유지 전환)',
    urbanPhase: '도시재생 및 복합개발 대기 나대지',
  },
  {
    id: 'epoch-2026',
    year: 2026,
    label: '2026년',
    tag: '실사 3D 마스터플랜 착공기 (현재)',
    badgeColor: 'bg-blue-600/90 border-blue-400 text-blue-100',
    title: 'V-World 실사 3D 디지털트윈 복원 및 민군상생 거점 착공',
    summary: '국토교통부 브이월드 실사 3D 시가지 완벽 복원 및 복합환승센터·청년창업타운 스마트 착공',
    details: '원주 구 1군지사 부지 혁신성장거점 조성사업 착공. 3D PBR 고정밀 도시 모델 기반 디지털트윈 마스터플랜 가동.',
    militaryStatus: '민·군 상생 혁신 거점',
    urbanPhase: '3D 스마트 콤플렉스 건축 착공',
  },
  {
    id: 'epoch-2030',
    year: 2030,
    label: '2030+년',
    tag: '첨단 스마트 복합도시 완성형',
    badgeColor: 'bg-purple-600/90 border-purple-400 text-purple-100',
    title: 'AI·바이오 디지털 헬스케어 메디컬 콤플렉스 완성',
    summary: '국방 유휴지의 첨단 스마트시티 완전 탈바꿈: 메디컬 R&D, 친환경 수변공원, 스마트 트램 연계',
    details: '강원 바이오헬스 특구 핵심 거점 완료. 친환경 주거·연구·상업 복합단지 및 탄소중립 스마트 생태계 완성.',
    militaryStatus: '평화·첨단 미래 혁신 밸리',
    urbanPhase: '초연결 스마트 도시 완성',
  },
];

interface UrbanChronicleTimelineProps {
  currentYear?: number;
  onEpochChange?: (epoch: ChronicleEpoch) => void;
}

export const UrbanChronicleTimeline: React.FC<UrbanChronicleTimelineProps> = ({
  currentYear = 2026,
  onEpochChange,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(3); // 2026년 기본 선택
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1); // 1x or 2x
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeEpoch = CHRONICLE_EPOCHS[selectedIndex] || CHRONICLE_EPOCHS[3];

  const handleSelectEpoch = (idx: number) => {
    setSelectedIndex(idx);
    if (onEpochChange) {
      onEpochChange(CHRONICLE_EPOCHS[idx]);
    }
  };

  // 자동 재생 루프 (jiangshan-map 스타일 시계열 재생)
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }

    const interval = 3500 / playSpeed;
    playTimerRef.current = setInterval(() => {
      setSelectedIndex((prev) => {
        const next = (prev + 1) % CHRONICLE_EPOCHS.length;
        if (onEpochChange) {
          onEpochChange(CHRONICLE_EPOCHS[next]);
        }
        return next;
      });
    }, interval);

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, onEpochChange]);

  return (
    <div
      id="urban-chronicle-timeline"
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 pointer-events-auto select-none transition-all duration-300 w-[94%] max-w-4xl"
    >
      <div className="bg-[#08131d]/95 backdrop-blur-md border border-cyan-500/40 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.65)] ring-1 ring-cyan-500/20 overflow-hidden text-slate-100">
        {/* 상단 헤더 & 컨트롤 바 */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-gradient-to-r from-cyan-950/80 via-slate-900/90 to-blue-950/80 border-b border-cyan-500/20 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-400">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            <span className="font-extrabold tracking-wider text-cyan-300 uppercase text-[11px]">
              원주 구 1군지사 70년 시계열 연혁 타임라인 (Jiangshan-Map)
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${activeEpoch.badgeColor}`}>
              {activeEpoch.year}년 · {activeEpoch.tag}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 재생 / 일시정지 */}
            <button
              id="btn-timeline-play-toggle"
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                isPlaying
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold animate-pulse'
                  : 'bg-cyan-900/60 text-cyan-200 hover:bg-cyan-800 border border-cyan-500/30'
              }`}
              title={isPlaying ? '자동 재생 일시 정지' : '시계열 연혁 자동 재생'}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlaying ? '일시정지' : '자동재생'}</span>
            </button>

            {/* 배속 토글 */}
            <button
              onClick={() => setPlaySpeed((s) => (s === 1 ? 2 : 1))}
              className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-cyan-300 hover:bg-slate-700 border border-white/10"
              title="재생 속도"
            >
              {playSpeed}x
            </button>

            {/* 접기/펼치기 */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60 transition-colors"
              title={isExpanded ? '접기' : '펼치기'}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 본체 컨텐츠 (접기 가능) */}
        {isExpanded && (
          <div className="p-3 space-y-2.5">
            {/* 1) 에포크 탭 버튼 그리드 */}
            <div className="grid grid-cols-5 gap-1.5">
              {CHRONICLE_EPOCHS.map((epoch, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={epoch.id}
                    onClick={() => handleSelectEpoch(idx)}
                    className={`relative flex flex-col items-center justify-center p-2 rounded-xl text-center transition-all ${
                      isSelected
                        ? 'bg-cyan-500/25 border-2 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)] scale-[1.02]'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold tracking-tight text-cyan-400/90">
                      {epoch.year}
                    </span>
                    <span className="text-[11px] font-bold truncate max-w-full">
                      {epoch.tag.replace(' (현재)', '')}
                    </span>
                    {isSelected && (
                      <span className="absolute -bottom-1 w-2 h-2 bg-cyan-400 rotate-45 rounded-[1px]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 2) 시계열 슬라이더 바 (Jiangshan Scrubber) */}
            <div className="relative pt-1 px-1">
              <input
                type="range"
                min={0}
                max={CHRONICLE_EPOCHS.length - 1}
                step={1}
                value={selectedIndex}
                onChange={(e) => handleSelectEpoch(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1 px-0.5">
                <span>1954 창설</span>
                <span>1985 주둔</span>
                <span>2024 이전</span>
                <span className="text-cyan-400 font-bold">2026 실사 3D</span>
                <span>2030+ 미래</span>
              </div>
            </div>

            {/* 3) 선택된 에포크 상세 해설 카드 */}
            <div className="bg-[#0b1b2a]/70 rounded-xl p-2.5 border border-cyan-500/20 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-cyan-200 text-xs truncate">
                    {activeEpoch.title}
                  </span>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-white/5">
                    {activeEpoch.militaryStatus}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed truncate">
                  {activeEpoch.summary}
                </p>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto shrink-0 text-[10px]">
                <div className="text-right">
                  <div className="text-slate-400 font-mono">도시 단계</div>
                  <div className="text-cyan-300 font-semibold">{activeEpoch.urbanPhase}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
