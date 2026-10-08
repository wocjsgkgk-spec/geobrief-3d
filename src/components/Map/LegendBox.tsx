'use client';

import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';

export const LegendBox: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const {
    baseMap,
    terrainEnabled,
    terrainExaggeration,
    layers,
    completedPolygon,
    bufferRings,
    borderSecurityVisible,
  } = useMapStore();

  return (
    <div className="absolute bottom-4 right-4 z-10 select-none">
      <div className="bg-[#121814]/92 backdrop-blur-md border border-[#2b3a2e] rounded-xl shadow-2xl overflow-hidden w-64 transition-all">
        {/* Header */}
        <div
          className="px-3.5 py-2.5 bg-[#17211b] border-b border-[#2b3a2e] flex items-center justify-between cursor-pointer text-slate-200 hover:bg-[#1c2921] transition-colors"
          onClick={() => setCollapsed(!collapsed)}
          title="클릭하여 범례 접기/펼치기"
        >
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-300">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>보고서 도면 범례 (Legend)</span>
          </div>
          <button className="text-slate-400 hover:text-slate-200">
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Content */}
        {!collapsed && (
          <div className="p-3 text-[11px] space-y-2.5 text-slate-300">
            {/* 1. 대상지 경계 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3.5 h-3.5 rounded-sm bg-blue-500/40 border-2 border-blue-500 inline-block" />
                <span className="font-medium">군 유휴부지 경계</span>
              </div>
              <span className="text-[10px] font-mono text-blue-400">
                {completedPolygon ? '지정' : '미지정'}
              </span>
            </div>

            {/* 2. 정량 거리 분석 버퍼 링 */}
            <div className="pt-1.5 border-t border-[#232f26] space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                정량 반경 분석 (Buffer)
              </div>
              {/* 500m */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full border border-emerald-400 bg-emerald-500/25 inline-block" />
                  <span>500m 권역 (도보권)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">
                  {bufferRings.r500m ? 'ON' : 'OFF'}
                </span>
              </div>
              {/* 1km */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full border border-amber-400 bg-amber-500/25 inline-block" />
                  <span>1km 권역 (생활권)</span>
                </div>
                <span className="text-[10px] font-mono text-amber-400">
                  {bufferRings.r1km ? 'ON' : 'OFF'}
                </span>
              </div>
              {/* 2km */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full border border-indigo-400 bg-indigo-500/25 inline-block" />
                  <span>2km 권역 (차량 접근권)</span>
                </div>
                <span className="text-[10px] font-mono text-indigo-400">
                  {bufferRings.r2km ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>

            {/* 3. 도로망 위계화 */}
            <div className="pt-1.5 border-t border-[#232f26] space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                교통 및 인프라
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-4 h-1 bg-amber-500 rounded-full inline-block" />
                  <span>주간선·국도 축선</span>
                </div>
                <span className="text-[10px] text-slate-400">주황</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-4 h-0.5 bg-slate-400 rounded-full inline-block" />
                  <span>보조도로·진입로</span>
                </div>
                <span className="text-[10px] text-slate-400">회색</span>
              </div>
            </div>

            {/* 4. 3D 지형 및 건축물 */}
            <div className="pt-1.5 border-t border-[#232f26] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded bg-blue-600/80 border border-blue-400 inline-block" />
                  <span>건축물 3D 돌출</span>
                </div>
                <span className="text-[10px] font-mono text-blue-400">
                  {layers.buildings3D ? '입체 음영' : '숨김'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded bg-emerald-700/80 border border-emerald-400 inline-block" />
                  <span>3D 지형 (DEM)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">
                  {terrainEnabled ? `${terrainExaggeration.toFixed(1)}x` : 'OFF'}
                </span>
              </div>
            </div>

            {/* 5. [접경 안보 관제] 군사분계선 및 민통선 범례 (보안 레이어 ON일 때만 동적 렌더링) */}
            {borderSecurityVisible && (
              <div className="pt-2 border-t border-rose-900/50 space-y-1.5 bg-rose-950/25 -mx-3 px-3 py-2 rounded-b">
                <div className="flex items-center justify-between text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                  <span>안보 및 군사 통제선</span>
                  <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-rose-900/60 text-rose-200">
                    관제 활성
                  </span>
                </div>
                {/* 군사분계선 (MDL) - 적색 파선 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-4 h-0 border-t-2 border-dashed border-[#DC2626] inline-block shadow-[0_0_4px_#EF4444]"
                      style={{ borderTopWidth: '2.5px' }}
                    />
                    <span className="text-rose-200 font-medium">군사분계선 (MDL)</span>
                  </div>
                  <span className="text-[10px] text-rose-400 font-mono">적색 파선</span>
                </div>
                {/* 민간인출입통제선 (CCL) - 황색 파선 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-4 h-0 border-t-2 border-dashed border-[#F59E0B] inline-block"
                      style={{ borderTopWidth: '2px' }}
                    />
                    <span className="text-amber-200 font-medium">민통선 (CCL)</span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-mono">황색 파선</span>
                </div>
                {/* DMZ 완충구역 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 rounded-sm bg-rose-600/25 border border-rose-500/80 inline-block" />
                    <span className="text-slate-300">비무장지대 (DMZ)</span>
                  </div>
                  <span className="text-[10px] text-rose-400/80 font-mono">2km 완충</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
