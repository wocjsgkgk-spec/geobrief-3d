'use client';

import React, { useState, useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { Crosshair, Eye, Video, Compass, Radio, Shield, X, Gauge, Zap } from 'lucide-react';

export const UavHudOverlay: React.FC = () => {
  const { uavFlight, setUavCameraMode, toggleUavFlight, setUavFlightSpeed } = useMapStore();
  const [recSeconds, setRecSeconds] = useState(0);
  const [flirMode, setFlirMode] = useState<'normal' | 'flir'>('normal');

  useEffect(() => {
    if (!uavFlight.isActive) {
      setRecSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [uavFlight.isActive]);

  if (!uavFlight.isActive) return null;

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
  };

  const isFpv = uavFlight.cameraMode === 'fpv';

  return (
    <div className={`absolute inset-0 pointer-events-none z-30 select-none ${isFpv ? 'overflow-hidden' : ''}`}>
      {/* 1인칭 FPV 모드 시 광학/열화상(FLIR) 필터 & 비네팅 */}
      {isFpv && (
        <div
          className={`absolute inset-0 pointer-events-none transition-colors duration-300 ${
            flirMode === 'flir'
              ? 'bg-emerald-950/20 mix-blend-color-dodge ring-1 ring-emerald-500/30'
              : 'shadow-[inset_0_0_120px_rgba(0,0,0,0.7)]'
          }`}
        >
          {/* 스캔라인 효과 */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black/80" />
        </div>
      )}

      {/* 중앙 타깃 조준 십자선 (FPV 모드 시 활성화) */}
      {isFpv && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-64 border border-emerald-400/30 rounded-full flex items-center justify-center animate-pulse">
            {/* 내부 십자선 */}
            <div className="absolute w-full h-[1px] bg-emerald-400/40" />
            <div className="absolute h-full w-[1px] bg-emerald-400/40" />

            {/* 정밀 타깃팅 박스 */}
            <div className="w-16 h-16 border-2 border-emerald-400/70 relative">
              <span className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-emerald-300" />
              <span className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-emerald-300" />
              <span className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-emerald-300" />
              <span className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-emerald-300" />
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-ping" />
            </div>

            {/* 거리/각도 텍스트 */}
            <div className="absolute -bottom-8 font-mono text-[10px] text-emerald-300 bg-black/60 px-2 py-0.5 rounded border border-emerald-500/40">
              TGT LOCK • LASER RNG 420m
            </div>
          </div>
        </div>
      )}

      {/* 상단 텔레메트리 바 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#07130d]/90 backdrop-blur-md border border-emerald-500/70 px-4 py-1.5 rounded-xl shadow-2xl text-[11px] font-mono pointer-events-auto">
        <div className="flex items-center gap-1.5 text-rose-400 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span>REC {formatRecTime(recSeconds)}</span>
        </div>

        <div className="h-3 w-[1px] bg-emerald-700/60" />

        <div className="flex items-center gap-1 text-emerald-300">
          <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span>UAV-01 RQ-4 RECON</span>
        </div>

        <div className="h-3 w-[1px] bg-emerald-700/60" />

        {/* 텔레메트리 수치 */}
        <div className="flex items-center gap-2.5 text-slate-200">
          <span>
            ALT <strong className="text-emerald-400 font-extrabold">{uavFlight.altitudeMeters}m</strong> AGL
          </span>
          <span>
            SPD <strong className="text-cyan-400 font-extrabold">{uavFlight.speedKmh}km/h</strong>
          </span>
          {uavFlight.currentBearing !== undefined && (
            <span>
              HDG <strong className="text-amber-400 font-extrabold">{uavFlight.currentBearing}°</strong>
            </span>
          )}
        </div>

        <div className="h-3 w-[1px] bg-emerald-700/60" />

        {/* 1인칭 FPV / 3인칭 Orbit 뷰 전환 버튼 */}
        <div className="flex items-center gap-1 bg-[#0f241a] p-0.5 rounded-lg border border-emerald-600/50">
          <button
            type="button"
            onClick={() => setUavCameraMode('orbit')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              !isFpv
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-300 hover:text-white'
            }`}
          >
            3인칭 궤도
          </button>
          <button
            type="button"
            onClick={() => setUavCameraMode('fpv')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              isFpv
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-300 hover:text-white'
            }`}
          >
            1인칭 FPV 관측
          </button>
        </div>

        {/* FLIR 모드 토글 (FPV 전용) */}
        {isFpv && (
          <button
            type="button"
            onClick={() => setFlirMode((prev) => (prev === 'normal' ? 'flir' : 'normal'))}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
              flirMode === 'flir'
                ? 'bg-teal-900 border-teal-400 text-teal-200'
                : 'bg-slate-800 border-slate-600 text-slate-300'
            }`}
          >
            {flirMode === 'flir' ? 'FLIR 열화상' : 'EO 광학'}
          </button>
        )}

        {/* 비행 중지 버튼 */}
        <button
          type="button"
          onClick={toggleUavFlight}
          className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors ml-1"
          title="UAV 순찰 비행 종료"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* FPV 모드 좌측 하단 텔레메트리 보드 */}
      {isFpv && (
        <div className="absolute bottom-6 left-6 bg-[#06110a]/90 backdrop-blur-md border border-emerald-500/60 p-3 rounded-xl shadow-2xl text-[10px] font-mono text-emerald-300 space-y-1.5 min-w-[210px] pointer-events-auto">
          <div className="flex items-center justify-between border-b border-emerald-800/40 pb-1">
            <span className="font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              UAV SENSOR TELEMETRY
            </span>
            <span className="text-[9px] px-1 bg-emerald-950 text-emerald-200 border border-emerald-700 rounded">
              ONLINE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[9.5px]">
            <div>
              <span className="text-slate-400 block">위치 좌표</span>
              <span className="text-white font-bold">
                {uavFlight.currentLngLat
                  ? `${uavFlight.currentLngLat[1].toFixed(4)}°N, ${uavFlight.currentLngLat[0].toFixed(4)}°E`
                  : '37.3421°N, 127.9254°E'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">해발 고도</span>
              <span className="text-white font-bold">
                EL. {uavFlight.currentElevation || 200}m MSL
              </span>
            </div>
          </div>

          {/* 속도 조절 슬라이더 */}
          <div className="pt-1 border-t border-emerald-900/50">
            <div className="flex justify-between text-[9px] text-slate-300 mb-0.5">
              <span>순항 속도 (Cruising Speed)</span>
              <span className="font-bold text-cyan-300">{uavFlight.speedKmh} km/h</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={uavFlight.speedKmh}
              onChange={(e) => setUavFlightSpeed(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>
      )}
    </div>
  );
};
