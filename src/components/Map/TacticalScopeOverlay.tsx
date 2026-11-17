'use client';

import React, { useMemo } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { formatMGRS } from '@/lib/vendor/mgrs';
import { Eye, Shield, Radio, Crosshair, Flame, Moon, Monitor } from 'lucide-react';

export const TacticalScopeOverlay: React.FC = () => {
  const { reconOpticsMode, viewport, selectedRegionId } = useMapStore();

  const mgrsCoords = useMemo(() => {
    return formatMGRS(viewport.longitude, viewport.latitude, 5);
  }, [viewport.longitude, viewport.latitude]);

  if (reconOpticsMode === 'optical') {
    // 주간 실사 모드: 방해 없는 극미세 비네팅
    return (
      <div
        id="tactical-scope-overlay"
        className="pointer-events-none absolute inset-0 z-10 transition-all duration-500 shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]"
      />
    );
  }

  return (
    <div
      id="tactical-scope-overlay"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none transition-all duration-500"
    >
      {/* 1. 광학 모드별 전용 셰이더/필터 레이어 */}
      {reconOpticsMode === 'nvg' && (
        <>
          {/* 야간 투시경 (NVG): 초록색 형광 증폭 + 듀얼 튜브 비네팅 + CRT 주사선 */}
          <div
            className="absolute inset-0 mix-blend-color backdrop-brightness-125 backdrop-contrast-150 backdrop-saturate-200"
            style={{ backgroundColor: 'rgba(0, 255, 100, 0.42)' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 42%, rgba(0, 20, 5, 0.65) 75%, rgba(0, 10, 2, 0.96) 100%)',
            }}
          />
          {/* 미세 스캔라인 격자 */}
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(0,255,100,0.15) 0px, rgba(0,255,100,0.15) 1px, transparent 1px, transparent 3px)',
            }}
          />
        </>
      )}

      {reconOpticsMode === 'flir' && (
        <>
          {/* 열화상 적외선 (FLIR): 화이트-핫 / 열 방출 컬러 인버전 + 열 감지 마스크 */}
          <div
            className="absolute inset-0 mix-blend-difference backdrop-contrast-200 backdrop-brightness-110"
            style={{ backgroundColor: 'rgba(255, 160, 40, 0.28)' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 48%, rgba(20, 5, 30, 0.70) 80%, rgba(5, 0, 15, 0.95) 100%)',
            }}
          />
          {/* 열화상 컬러 바 레전드 (Cold -> Warm -> Hot) */}
          <div className="absolute right-6 top-32 flex flex-col items-center gap-1 bg-black/80 border border-orange-500/50 p-1.5 rounded text-[9px] font-mono font-bold text-orange-300">
            <span>+45°C</span>
            <div className="w-2.5 h-24 rounded bg-gradient-to-b from-white via-red-500 via-amber-400 to-indigo-900 border border-white/40" />
            <span>-10°C</span>
            <span className="text-[8px] text-orange-400 mt-0.5">FLIR IR</span>
          </div>
        </>
      )}

      {reconOpticsMode === 'crt' && (
        <>
          {/* 레트로 전술 CRT: 앰버 모니터 + 고밀도 주사선 + 지휘소 텍스처 */}
          <div
            className="absolute inset-0 mix-blend-color backdrop-contrast-125 backdrop-brightness-110"
            style={{ backgroundColor: 'rgba(255, 170, 0, 0.38)' }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 55%, rgba(40, 20, 0, 0.60) 85%, rgba(20, 10, 0, 0.95) 100%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,170,0,0.2) 0px, rgba(255,170,0,0.2) 1px, transparent 1px, transparent 4px)',
            }}
          />
        </>
      )}

      {/* 2. 중앙 전술 타겟팅 레티클 (Crosshair & Range Rings) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-64 h-64 pointer-events-none opacity-85">
          {/* 중심 십자선 */}
          <div
            className={`absolute top-0 bottom-0 left-1/2 w-[1px] -translate-x-1/2 ${
              reconOpticsMode === 'nvg'
                ? 'bg-emerald-400/80'
                : reconOpticsMode === 'flir'
                ? 'bg-orange-400/80'
                : 'bg-amber-400/80'
            }`}
          />
          <div
            className={`absolute left-0 right-0 top-1/2 h-[1px] -translate-y-1/2 ${
              reconOpticsMode === 'nvg'
                ? 'bg-emerald-400/80'
                : reconOpticsMode === 'flir'
                ? 'bg-orange-400/80'
                : 'bg-amber-400/80'
            }`}
          />

          {/* 중앙 원형 조준 링 */}
          <div
            className={`absolute inset-10 rounded-full border border-dashed ${
              reconOpticsMode === 'nvg'
                ? 'border-emerald-400/60'
                : reconOpticsMode === 'flir'
                ? 'border-orange-400/60'
                : 'border-amber-400/60'
            }`}
          />
          <div
            className={`absolute inset-20 rounded-full border ${
              reconOpticsMode === 'nvg'
                ? 'border-emerald-400/80'
                : reconOpticsMode === 'flir'
                ? 'border-orange-400/80'
                : 'border-amber-400/80'
            }`}
          />

          {/* 모서리 브래킷 */}
          <div
            className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${
              reconOpticsMode === 'nvg'
                ? 'border-emerald-300'
                : reconOpticsMode === 'flir'
                ? 'border-orange-300'
                : 'border-amber-300'
            }`}
          />
          <div
            className={`absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 ${
              reconOpticsMode === 'nvg'
                ? 'border-emerald-300'
                : reconOpticsMode === 'flir'
                ? 'border-orange-300'
                : 'border-amber-300'
            }`}
          />
          <div
            className={`absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 ${
              reconOpticsMode === 'nvg'
                ? 'border-emerald-300'
                : reconOpticsMode === 'flir'
                ? 'border-orange-300'
                : 'border-amber-300'
            }`}
          />
          <div
            className={`absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 ${
              reconOpticsMode === 'nvg'
                ? 'border-emerald-300'
                : reconOpticsMode === 'flir'
                ? 'border-orange-300'
                : 'border-amber-300'
            }`}
          />
        </div>
      </div>

      {/* 3. 상단 및 하단 전술 텔레메트리 오버레이 바 */}
      <div className="absolute top-28 left-6 flex items-center gap-2 font-mono text-[11px] font-bold">
        <span
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border backdrop-blur-md ${
            reconOpticsMode === 'nvg'
              ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
              : reconOpticsMode === 'flir'
              ? 'bg-orange-950/80 border-orange-500/70 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
              : 'bg-amber-950/80 border-amber-500/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
          }`}
        >
          {reconOpticsMode === 'nvg' && <Moon className="w-3 h-3 text-emerald-400" />}
          {reconOpticsMode === 'flir' && <Flame className="w-3 h-3 text-orange-400" />}
          {reconOpticsMode === 'crt' && <Monitor className="w-3 h-3 text-amber-400" />}
          <span className="uppercase tracking-widest">
            {reconOpticsMode === 'nvg'
              ? 'NVG GEN3 녹색형광'
              : reconOpticsMode === 'flir'
              ? 'FLIR 열화상 IR'
              : '전술 CRT 앰버'}
          </span>
        </span>

        <span
          className={`px-2 py-0.5 rounded border backdrop-blur-md ${
            reconOpticsMode === 'nvg'
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
              : reconOpticsMode === 'flir'
              ? 'bg-orange-950/70 border-orange-500/50 text-orange-200'
              : 'bg-amber-950/70 border-amber-500/50 text-amber-200'
          }`}
        >
          MGRS: {mgrsCoords}
        </span>
      </div>

      {/* 4. 우측 상단 정찰 센서 제원 (Sensor Specifications) */}
      <div
        className={`absolute top-28 right-6 font-mono text-[10px] text-right p-2 rounded border backdrop-blur-md ${
          reconOpticsMode === 'nvg'
            ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
            : reconOpticsMode === 'flir'
            ? 'bg-orange-950/70 border-orange-500/50 text-orange-300'
            : 'bg-amber-950/70 border-amber-500/50 text-amber-300'
        }`}
      >
        <div>SENSOR: EO/IR RECON MK-IV</div>
        <div>FOV: 45.2° | GSD: 0.25m</div>
        <div>GAIN: AGC AUTO (+18dB)</div>
        <div className="flex items-center justify-end gap-1 mt-0.5 text-[9px] font-bold text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
          <span>LIVE TELEMETRY</span>
        </div>
      </div>
    </div>
  );
};
