'use client';

import React from 'react';
import {
  Compass,
  Play,
  Pause,
  Square,
  Video,
  Eye,
  EyeOff,
  Navigation2,
  Activity,
  Layers,
  Clock,
  Gauge,
  MapPin,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';

interface CinematicOsdOverlayProps {
  currentBearing: number;
  currentPitch: number;
  currentZoom: number;
  currentLng: number;
  currentLat: number;
  currentElevation?: number;
  onStopFlight?: () => void;
  onStopRecording?: () => void;
}

/**
 * 방위각(0 ~ 360)을 16방위 텍스트로 변환
 */
function getBearingDirection(bearing: number): string {
  const normalized = (bearing % 360 + 360) % 360;
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

/**
 * 초 단위를 MM:SS.S 포맷으로 변환
 */
function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

export const CinematicOsdOverlay: React.FC<CinematicOsdOverlayProps> = ({
  currentBearing,
  currentPitch,
  currentZoom,
  currentLng,
  currentLat,
  currentElevation = 180,
  onStopFlight,
  onStopRecording,
}) => {
  const { cinematicFlight, toggleCinematicOsd, metadata } = useMapStore();

  const {
    isPlaying,
    isRecording,
    progress,
    currentTimeSec,
    durationSec,
    waypoints,
    loop,
    showOsd,
  } = cinematicFlight;

  // 비행 중이거나 녹화 중이 아니면 렌더링하지 않음
  if (!isPlaying && !isRecording) {
    return null;
  }

  // 가상 비행 속도 (줌 레벨 및 피치에 따른 시뮬레이션 속도: 60 ~ 180 km/h)
  const virtualSpeedKnots = Math.round(40 + (22 - currentZoom) * 14 + (currentPitch / 90) * 20);
  const virtualSpeedKmh = Math.round(virtualSpeedKnots * 1.852);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between font-mono select-none">
      {/* 1. 상단 시네마틱 레터박스 (CinemaScope Top Bar) */}
      <div className="pointer-events-auto h-12 md:h-14 bg-black/92 backdrop-blur-md border-b border-cyan-500/20 px-4 md:px-8 flex items-center justify-between text-xs text-slate-200 shadow-2xl transition-all">
        {/* 좌측: REC / PLAY 인디케이터 & 타임코드 */}
        <div className="flex items-center gap-3">
          {isRecording ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/80 border border-rose-500/80 text-rose-300 font-bold shadow-lg shadow-rose-950/50">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="text-[11px] tracking-wider">REC ● 60FPS</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-500/80 text-cyan-300 font-bold">
              <Play className="w-3 h-3 fill-cyan-400" />
              <span className="text-[11px] tracking-wider">CINEMATIC PLAY</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-slate-200 text-xs">
            <span className="text-cyan-400 font-bold">{formatTimecode(currentTimeSec)}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{formatTimecode(durationSec)}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 border-l border-slate-700/80 pl-3">
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-semibold">1080P</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">CATMULL-ROM</span>
            {loop && (
              <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 font-semibold">
                LOOP
              </span>
            )}
          </div>
        </div>

        {/* 중앙: 브리핑 프로젝트 제목 */}
        <div className="hidden lg:flex items-center gap-2">
          <span className="text-cyan-400 font-bold tracking-widest text-[11px]">
            GEOBRIEF 3D
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-200 font-semibold truncate max-w-md text-xs">
            {metadata.title || '3D 시네마틱 정찰 비행'}
          </span>
        </div>

        {/* 우측: OSD 토글 & 정지 컨트롤러 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCinematicOsd}
            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] border border-slate-700 transition-colors flex items-center gap-1"
            title="OSD 계기판 토글"
          >
            {showOsd ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span className="hidden sm:inline">{showOsd ? 'OSD 숨김' : 'OSD 표시'}</span>
          </button>

          {isRecording && onStopRecording && (
            <button
              type="button"
              onClick={onStopRecording}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-colors flex items-center gap-1 shadow-md shadow-rose-950"
            >
              <Square className="w-3 h-3 fill-white" />
              <span>녹화 종료 & 저장</span>
            </button>
          )}

          {isPlaying && onStopFlight && (
            <button
              type="button"
              onClick={onStopFlight}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-600 transition-colors flex items-center gap-1"
            >
              <Square className="w-3 h-3" />
              <span>비행 정지</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. 중앙 뷰포트 크로스헤어 / 코너 프레임 (OSD 활성화 시) */}
      {showOsd && (
        <div className="relative flex-1 pointer-events-none">
          {/* 4개 코너 뷰파인더 브래킷 */}
          <div className="absolute top-4 left-6 w-6 h-6 border-t-2 border-l-2 border-cyan-400/60" />
          <div className="absolute top-4 right-6 w-6 h-6 border-t-2 border-r-2 border-cyan-400/60" />
          <div className="absolute bottom-4 left-6 w-6 h-6 border-b-2 border-l-2 border-cyan-400/60" />
          <div className="absolute bottom-4 right-6 w-6 h-6 border-b-2 border-r-2 border-cyan-400/60" />

          {/* 중앙 미니 조준선 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40">
            <div className="w-10 h-10 border border-cyan-300 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* 3. 하단 시네마틱 레터박스 & 밀리터리 HUD 계기판 (Bottom Bar) */}
      <div className="pointer-events-auto bg-black/95 backdrop-blur-md border-t border-cyan-500/20 transition-all shadow-2xl">
        {/* 상단 미세 네온 프로그레스 라인 */}
        <div className="h-0.5 w-full bg-slate-800/80 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 transition-all duration-75"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>

        {showOsd && (
          <div className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between text-xs">
            {/* 좌측: 나침반 방위각 & 카메라 각도 */}
            <div className="flex items-center gap-4 md:gap-6">
              {/* HDG / Bearing */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-cyan-950/80 border border-cyan-600/60 flex items-center justify-center text-cyan-300">
                  <Compass
                    className="w-4 h-4 transition-transform duration-100"
                    style={{ transform: `rotate(${-currentBearing}deg)` }}
                  />
                </div>
                <div>
                  <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                    HDG / BEARING
                  </div>
                  <div className="font-bold text-cyan-300 text-sm">
                    {Math.round(currentBearing)}° {getBearingDirection(currentBearing)}
                  </div>
                </div>
              </div>

              {/* PITCH */}
              <div>
                <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                  PITCH
                </div>
                <div className="font-bold text-slate-200 text-sm">
                  {Math.round(currentPitch)}°
                </div>
              </div>

              {/* ZOOM */}
              <div className="hidden sm:block">
                <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                  ZOOM
                </div>
                <div className="font-bold text-slate-200 text-sm">
                  {currentZoom.toFixed(1)}x
                </div>
              </div>
            </div>

            {/* 중앙: 표고 & 대지 속도 */}
            <div className="flex items-center gap-4 md:gap-6">
              {/* ALT (EL.) */}
              <div className="text-center">
                <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                  ELEVATION (EL.)
                </div>
                <div className="font-bold text-amber-300 text-sm md:text-base">
                  EL. {Math.round(currentElevation)} m
                </div>
              </div>

              {/* SPEED */}
              <div className="hidden md:block text-center">
                <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                  AIR SPEED
                </div>
                <div className="font-bold text-emerald-300 text-sm">
                  {virtualSpeedKnots} KT{' '}
                  <span className="text-[10px] text-slate-400">({virtualSpeedKmh}km/h)</span>
                </div>
              </div>
            </div>

            {/* 우측: GPS 좌표 & 웨이포인트 진행 */}
            <div className="flex items-center gap-4 md:gap-6 text-right">
              <div className="hidden sm:block">
                <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                  GPS COORD
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  {currentLat.toFixed(4)}°N, {currentLng.toFixed(4)}°E
                </div>
              </div>

              <div>
                <div className="text-[9.5px] text-slate-400 uppercase tracking-wider">
                  WAYPOINTS
                </div>
                <div className="text-cyan-300 font-bold text-sm">
                  {(progress * 100).toFixed(0)}%{' '}
                  <span className="text-[10px] text-slate-400">({waypoints.length} WPs)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
