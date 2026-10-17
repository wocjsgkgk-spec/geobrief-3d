'use client';

import React from 'react';
import { Compass as CompassIcon, Navigation, Eye } from 'lucide-react';

interface CompassProps {
  bearing?: number;
  pitch?: number;
  zoom?: number;
  onResetNorth: () => void;
  onAdjustPitch: (delta: number) => void;
}

export function updateCompassDOM(bearing: number, pitch: number, zoom: number): void {
  if (typeof document === 'undefined') return;
  const needle = document.getElementById('compass-needle');
  if (needle) {
    needle.style.transform = `rotate(${-bearing}deg)`;
  }
  const bearingEl = document.getElementById('compass-bearing-text');
  if (bearingEl) {
    const norm = ((bearing % 360) + 360) % 360;
    bearingEl.textContent = `${norm.toFixed(0).padStart(3, '0')}°`;
  }
  const pitchEl = document.getElementById('compass-pitch-text');
  if (pitchEl) {
    pitchEl.textContent = `${pitch.toFixed(0)}°`;
  }
  const zoomEl = document.getElementById('compass-zoom-text');
  if (zoomEl) {
    zoomEl.textContent = `Lv ${zoom.toFixed(1)}`;
  }
}

export const Compass: React.FC<CompassProps> = React.memo(({
  bearing = 0,
  pitch = 0,
  zoom = 15,
  onResetNorth,
  onAdjustPitch,
}) => {
  const normalizedBearing = ((bearing % 360) + 360) % 360;

  return (
    <div className="absolute top-20 left-4 z-10 flex flex-col space-y-2 select-none pointer-events-auto">
      {/* 3D Dynamic North Arrow Dial */}
      <div
        className="bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] p-2.5 rounded-xl shadow-2xl flex items-center space-x-3 text-slate-200 cursor-pointer hover:border-emerald-500/70 transition-all group"
        onClick={onResetNorth}
        title="클릭하여 진북(North) 및 기본 각도로 정렬"
      >
        {/* Dynamic Compass Rose Needle */}
        <div className="relative w-11 h-11 flex items-center justify-center bg-[#0a0e0c] rounded-full border border-[#29362c] shadow-inner group-hover:border-emerald-500/50 transition-colors">
          {/* Compass Ring markings */}
          <div className="absolute inset-0.5 rounded-full border border-dashed border-slate-700/60 pointer-events-none" />

          {/* Rotating True North Needle (Zero transition lag for instant 60fps tracking) */}
          <div
            id="compass-needle"
            className="w-9 h-9 flex items-center justify-center will-change-transform"
            style={{ transform: `rotate(${-bearing}deg)` }}
          >
            <div className="relative flex flex-col items-center">
              {/* North Triangle (Red) */}
              <span className="text-[9px] font-black text-rose-500 mb-[1px] leading-none">
                N
              </span>
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[11px] border-b-rose-500 filter drop-shadow" />
              {/* South Triangle (Silver) */}
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[11px] border-t-slate-400 filter drop-shadow" />
              <span className="text-[8px] font-bold text-slate-400 mt-[1px] leading-none">
                S
              </span>
            </div>
          </div>
        </div>

        {/* Viewport Telemetry Info */}
        <div className="flex flex-col text-[11px] leading-tight space-y-0.5">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">진북방위:</span>
            <span id="compass-bearing-text" className="font-mono font-bold text-emerald-400">
              {normalizedBearing.toFixed(0).padStart(3, '0')}°
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">시점경사:</span>
            <span id="compass-pitch-text" className="font-mono font-bold text-emerald-400">
              {pitch.toFixed(0)}°
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">상세축척:</span>
            <span id="compass-zoom-text" className="font-mono text-slate-300">
              Lv {zoom.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Quick 2D/3D Pitch Mode Switches */}
      <div className="flex space-x-1.5">
        <button
          onClick={() => onAdjustPitch(-15)}
          className="bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] hover:border-emerald-500/60 text-slate-300 hover:text-emerald-300 px-2.5 py-1 text-[10px] font-semibold rounded-lg shadow-md transition-all flex items-center gap-1"
          title="피치 낮추기 (평면 지도 시점)"
        >
          2D 평면
        </button>
        <button
          onClick={() => onAdjustPitch(15)}
          className="bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] hover:border-emerald-500/60 text-slate-300 hover:text-emerald-300 px-2.5 py-1 text-[10px] font-semibold rounded-lg shadow-md transition-all flex items-center gap-1"
          title="피치 높이기 (3D 산악 조감 시점)"
        >
          3D 조감
        </button>
      </div>
    </div>
  );
});
