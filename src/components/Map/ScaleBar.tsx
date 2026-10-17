'use client';

import React from 'react';

interface ScaleBarProps {
  latitude?: number;
  zoom?: number;
}

export function updateScaleBarDOM(latitude: number, zoom: number): void {
  if (typeof document === 'undefined') return;
  const rad = (latitude * Math.PI) / 180;
  const metersPerPixel = (156543.03392 * Math.cos(rad)) / Math.pow(2, zoom);
  const targetWidthPx = 100;
  const targetMeters = targetWidthPx * metersPerPixel;
  const niceScales = [
    10, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000,
  ];

  let selectedMeters = niceScales[0];
  for (const scale of niceScales) {
    if (Math.abs(scale - targetMeters) < Math.abs(selectedMeters - targetMeters)) {
      selectedMeters = scale;
    }
  }

  const actualWidthPx = Math.max(40, Math.min(220, selectedMeters / metersPerPixel));
  const halfMeters = selectedMeters / 2;
  const formatDist = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString()}km` : `${m}m`);

  const labelsEl = document.getElementById('scalebar-labels');
  if (labelsEl) {
    labelsEl.style.width = `${actualWidthPx}px`;
    const spans = labelsEl.getElementsByTagName('span');
    if (spans.length >= 3) {
      spans[1].textContent = formatDist(halfMeters);
      spans[2].textContent = formatDist(selectedMeters);
    }
  }

  const barEl = document.getElementById('scalebar-bar');
  if (barEl) {
    barEl.style.width = `${actualWidthPx}px`;
  }
}

export const ScaleBar: React.FC<ScaleBarProps> = React.memo(({ latitude = 37.35, zoom = 15 }) => {
  // Web Mercator 기준 픽셀당 미터 계산:
  // metersPerPixel = 156543.03392 * cos(lat * pi / 180) / (2 ^ zoom)
  const rad = (latitude * Math.PI) / 180;
  const metersPerPixel = (156543.03392 * Math.cos(rad)) / Math.pow(2, zoom);

  // 80~150px 폭에 매칭되는 깔끔한 라운드 축척 단위 산정
  const targetWidthPx = 100;
  const targetMeters = targetWidthPx * metersPerPixel;

  const niceScales = [
    10, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000,
  ];

  let selectedMeters = niceScales[0];
  for (const scale of niceScales) {
    if (Math.abs(scale - targetMeters) < Math.abs(selectedMeters - targetMeters)) {
      selectedMeters = scale;
    }
  }

  const actualWidthPx = Math.max(40, Math.min(220, selectedMeters / metersPerPixel));
  const halfMeters = selectedMeters / 2;

  const formatDistance = (m: number) => {
    return m >= 1000 ? `${(m / 1000).toLocaleString()}km` : `${m}m`;
  };

  return (
    <div className="absolute bottom-4 left-4 z-10 select-none pointer-events-none">
      <div className="bg-[#121814]/90 backdrop-blur-md border border-[#2b3a2e] px-3.5 py-2 rounded-xl shadow-2xl flex flex-col items-start space-y-1">
        {/* Scale labels (0, 1/2, Total) */}
        <div
          id="scalebar-labels"
          className="flex justify-between text-[9px] text-slate-300 font-mono font-semibold"
          style={{ width: `${actualWidthPx}px` }}
        >
          <span>0</span>
          <span>{formatDistance(halfMeters)}</span>
          <span>{formatDistance(selectedMeters)}</span>
        </div>

        {/* Professional Segmented Scale Bar */}
        <div
          id="scalebar-bar"
          className="h-2 flex border border-emerald-400/80 rounded-sm overflow-hidden"
          style={{ width: `${actualWidthPx}px` }}
        >
          <div className="w-1/2 bg-emerald-500 border-r border-emerald-950" />
          <div className="w-1/2 bg-slate-100" />
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between w-full text-[8.5px] text-slate-400 font-mono tracking-tight pt-0.5">
          <span>인쇄 표준 축척</span>
          <span className="text-emerald-400 font-semibold">16:9 프레임</span>
        </div>
      </div>
    </div>
  );
});
