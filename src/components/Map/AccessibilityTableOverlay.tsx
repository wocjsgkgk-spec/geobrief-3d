'use client';

import React, { useState, useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import {
  Car,
  ChevronDown,
  ChevronUp,
  Edit2,
  Check,
  EyeOff,
  Navigation,
  Sparkles,
  MapPin,
  Train,
  Milestone,
  RotateCcw,
} from 'lucide-react';

export const AccessibilityTableOverlay: React.FC = () => {
  const {
    completedPolygon,
    polygonArea,
    accessibilityResult,
    showAccessibilityTable,
    toggleAccessibilityTable,
    hoveredInfrastructureRow,
    setHoveredInfrastructureRow,
    updateAccessibilityRow,
  } = useMapStore();

  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // 실무자 수동 수정 텍스트 저장 상태
  const [customTexts, setCustomTexts] = useState<{
    area?: string;
    ic?: string;
    rail?: string;
    road?: string;
  }>({});

  // 행 비고 인라인 수정 상태 (상세 표)
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRowValue, setEditRowValue] = useState<string>('');

  if (!showAccessibilityTable) return null;
  if (!completedPolygon) return null;

  // Turf.js 연산 기반 데이터 선별
  const infraRows = accessibilityResult?.rows || [];
  const icRow = infraRows.find((r) => r.category === 'expressway_ic');
  const railRow = infraRows.find((r) => r.category === 'railway_ktx');
  const roadRow = infraRows.find((r) => r.category === 'national_road');

  // 기본 계산된 텍스트
  const defaultAreaText = polygonArea
    ? `${polygonArea.sqm.toLocaleString()} ㎡ (약 ${polygonArea.pyeong.toLocaleString()} 평)`
    : '부지 면적 산출 중';

  const defaultIcText = icRow
    ? `${icRow.facilityName} (직선 ${icRow.distanceKm} km / 차량 ${icRow.travelTimeText})`
    : '인근 고속도로 IC 분석 중';

  const defaultRailText = railRow
    ? `${railRow.facilityName} (직선 ${railRow.distanceKm} km)`
    : '인근 철도망 분석 중';

  const defaultRoadText = roadRow
    ? `${roadRow.facilityName} (직선 ${roadRow.distanceKm} km / 차량 ${roadRow.travelTimeText})`
    : '인근 간선국도 분석 중';

  const handleStartEdit = (key: string, currentVal: string) => {
    setEditingKey(key);
    setEditValue(customTexts[key as keyof typeof customTexts] || currentVal);
  };

  const handleSaveEdit = (key: string) => {
    if (editValue.trim()) {
      setCustomTexts((prev) => ({ ...prev, [key]: editValue.trim() }));
    }
    setEditingKey(null);
  };

  const handleResetField = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomTexts((prev) => {
      const next = { ...prev };
      delete next[key as keyof typeof next];
      return next;
    });
  };

  const handleSummaryKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(key);
    } else if (e.key === 'Escape') {
      setEditingKey(null);
    }
  };

  // 상세 표 행 수정 핸들러
  const handleStartRowEdit = (rowId: string, currentNote = '') => {
    setEditingRowId(rowId);
    setEditRowValue(currentNote);
  };

  const handleSaveRowEdit = (rowId: string) => {
    updateAccessibilityRow(rowId, editRowValue.trim());
    setEditingRowId(null);
  };

  return (
    <div className="absolute bottom-14 left-4 z-20 select-none max-w-[370px] w-full transition-all duration-150">
      <div className="bg-[#0b1218]/95 backdrop-blur-md border border-[#233549] rounded-xl shadow-2xl overflow-hidden ring-1 ring-white/10">
        {/* 헤더 바 */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#101923] border-b border-[#1f2f42]">
          <div className="flex items-center space-x-1.5">
            <span className="text-emerald-400 font-black text-xs">■</span>
            <span className="text-xs font-bold text-slate-100 tracking-tight">
              대상지 입지 및 교통 접근성 요약
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-950/80 border border-blue-600/50 text-blue-300 font-mono">
              클릭 시 수정
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={toggleAccessibilityTable}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
              title="요약 카드 닫기"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 1. 핵심 3대 지표 + 실측 면적 요약 카드 본문 */}
        <div className="p-3 space-y-2 text-xs">
          {/* 항목 1: 대상지 면적 */}
          <div
            onClick={() => handleStartEdit('area', defaultAreaText)}
            className="group p-2 rounded-lg bg-[#0e1620] hover:bg-[#14202d] border border-[#1b2b3b] hover:border-blue-500/50 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10.5px] text-slate-400 mb-0.5">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <MapPin className="w-3 h-3 text-blue-400" />
                대상지 면적
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {customTexts.area && (
                  <button
                    type="button"
                    onClick={(e) => handleResetField('area', e)}
                    className="text-[9px] text-slate-400 hover:text-amber-300"
                    title="기본값으로 복원"
                  >
                    초기화
                  </button>
                )}
                <Edit2 className="w-2.5 h-2.5 text-blue-400" />
              </div>
            </div>

            {editingKey === 'area' ? (
              <div
                className="flex items-center space-x-1 mt-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleSummaryKeyDown(e, 'area')}
                  className="w-full bg-[#162332] border border-blue-400 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit('area')}
                  className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="font-mono font-bold text-white text-xs truncate">
                {customTexts.area || defaultAreaText}
              </div>
            )}
          </div>

          {/* 항목 2: 인근 고속도로 IC */}
          <div
            onClick={() => handleStartEdit('ic', defaultIcText)}
            className="group p-2 rounded-lg bg-[#0e1620] hover:bg-[#14202d] border border-[#1b2b3b] hover:border-emerald-500/50 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10.5px] text-slate-400 mb-0.5">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <Car className="w-3 h-3 text-emerald-400" />
                인근 고속도로 IC
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {customTexts.ic && (
                  <button
                    type="button"
                    onClick={(e) => handleResetField('ic', e)}
                    className="text-[9px] text-slate-400 hover:text-amber-300"
                    title="기본값으로 복원"
                  >
                    초기화
                  </button>
                )}
                <Edit2 className="w-2.5 h-2.5 text-emerald-400" />
              </div>
            </div>

            {editingKey === 'ic' ? (
              <div
                className="flex items-center space-x-1 mt-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleSummaryKeyDown(e, 'ic')}
                  className="w-full bg-[#162332] border border-emerald-400 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit('ic')}
                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="font-mono font-bold text-emerald-300 text-xs truncate">
                {customTexts.ic || defaultIcText}
              </div>
            )}
          </div>

          {/* 항목 3: 인근 철도/간선망 */}
          <div
            onClick={() => handleStartEdit('rail', defaultRailText)}
            className="group p-2 rounded-lg bg-[#0e1620] hover:bg-[#14202d] border border-[#1b2b3b] hover:border-amber-500/50 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10.5px] text-slate-400 mb-0.5">
              <span className="flex items-center gap-1 font-semibold text-slate-300">
                <Train className="w-3 h-3 text-amber-400" />
                인근 철도/간선망
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {customTexts.rail && (
                  <button
                    type="button"
                    onClick={(e) => handleResetField('rail', e)}
                    className="text-[9px] text-slate-400 hover:text-amber-300"
                    title="기본값으로 복원"
                  >
                    초기화
                  </button>
                )}
                <Edit2 className="w-2.5 h-2.5 text-amber-400" />
              </div>
            </div>

            {editingKey === 'rail' ? (
              <div
                className="flex items-center space-x-1 mt-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleSummaryKeyDown(e, 'rail')}
                  className="w-full bg-[#162332] border border-amber-400 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit('rail')}
                  className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-white"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="font-mono font-bold text-amber-300 text-xs truncate">
                {customTexts.rail || defaultRailText}
              </div>
            )}
          </div>

          {/* 보조 항목: 주요 간선국도 */}
          {roadRow && (
            <div
              onClick={() => handleStartEdit('road', defaultRoadText)}
              className="group p-2 rounded-lg bg-[#0e1620] hover:bg-[#14202d] border border-[#1b2b3b] hover:border-teal-500/50 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-[10.5px] text-slate-400 mb-0.5">
                <span className="flex items-center gap-1 font-semibold text-slate-300">
                  <Milestone className="w-3 h-3 text-teal-400" />
                  주요 간선국도
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {customTexts.road && (
                    <button
                      type="button"
                      onClick={(e) => handleResetField('road', e)}
                      className="text-[9px] text-slate-400 hover:text-amber-300"
                      title="기본값으로 복원"
                    >
                      초기화
                    </button>
                  )}
                  <Edit2 className="w-2.5 h-2.5 text-teal-400" />
                </div>
              </div>

              {editingKey === 'road' ? (
                <div
                  className="flex items-center space-x-1 mt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleSummaryKeyDown(e, 'road')}
                    className="w-full bg-[#162332] border border-teal-400 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit('road')}
                    className="p-1 rounded bg-teal-600 hover:bg-teal-500 text-white"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="font-mono font-bold text-teal-300 text-xs truncate">
                  {customTexts.road || defaultRoadText}
                </div>
              )}
            </div>
          )}

          {/* 2. 상세 인프라 목록 (접기/펼치기) 토글 */}
          <div className="pt-1 border-t border-[#1a2838] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsDetailExpanded(!isDetailExpanded)}
              className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors font-medium"
            >
              {isDetailExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3 text-blue-400" />
                  <span>상세 분석표 접기</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 text-blue-400" />
                  <span>전체 인프라 거리표 보기 ({infraRows.length}개소)</span>
                </>
              )}
            </button>

            <span className="text-[9px] font-mono text-slate-500 flex items-center gap-1">
              <Navigation className="w-2.5 h-2.5 text-amber-400" />
              Turf.js 지오메트리 연산
            </span>
          </div>

          {/* 3. 상세 테이블 (펼침 상태일 때만 표출) */}
          {isDetailExpanded && (
            <div className="mt-1.5 pt-1.5 border-t border-[#172332] space-y-1.5">
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1c2a38] text-[9.5px] text-slate-400">
                      <th className="py-1 px-1 font-bold w-[70px]">구분</th>
                      <th className="py-1 px-1 font-bold">시설명</th>
                      <th className="py-1 px-1 font-bold text-right w-[55px]">직선</th>
                      <th className="py-1 px-1 font-bold text-right w-[65px]">시간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141f2b] text-[10.5px]">
                    {infraRows.map((row) => {
                      const isHovered = hoveredInfrastructureRow?.id === row.id;
                      const isRowEditing = editingRowId === row.id;

                      return (
                        <React.Fragment key={row.id}>
                          <tr
                            onMouseEnter={() => setHoveredInfrastructureRow(row)}
                            onMouseLeave={() => setHoveredInfrastructureRow(null)}
                            className={`cursor-pointer transition-colors group ${
                              isHovered
                                ? 'bg-amber-950/50 text-amber-200'
                                : 'hover:bg-[#121c27] text-slate-200'
                            }`}
                          >
                            <td className="py-1 px-1 font-medium text-[9.5px] text-emerald-400/90 whitespace-nowrap">
                              {row.categoryLabel}
                            </td>
                            <td className="py-1 px-1 font-semibold text-slate-100 flex items-center justify-between group-hover:text-amber-300">
                              <span className="truncate max-w-[110px]" title={row.facilityName}>
                                {row.facilityName}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartRowEdit(row.id, row.customNote);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400 text-slate-500 transition-opacity ml-1"
                                title="비고 수정"
                              >
                                <Edit2 className="w-2 h-2" />
                              </button>
                            </td>
                            <td className="py-1 px-1 font-mono text-right text-blue-300 font-bold whitespace-nowrap">
                              {row.distanceKm}km
                            </td>
                            <td className="py-1 px-1 font-mono text-right text-amber-300 font-semibold whitespace-nowrap">
                              {row.travelTimeText}
                            </td>
                          </tr>

                          {(isRowEditing || row.customNote) && (
                            <tr className="bg-[#0e1620]">
                              <td colSpan={4} className="py-1 px-1.5">
                                {isRowEditing ? (
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="text"
                                      value={editRowValue}
                                      onChange={(e) => setEditRowValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRowEdit(row.id);
                                        else if (e.key === 'Escape') setEditingRowId(null);
                                      }}
                                      placeholder="특이사항 (예: 신규 IC 개통 예정)"
                                      className="w-full bg-[#162332] border border-emerald-500/60 rounded px-1.5 py-0.5 text-[9.5px] text-white focus:outline-none"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveRowEdit(row.id)}
                                      className="p-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                                    >
                                      <Check className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => handleStartRowEdit(row.id, row.customNote)}
                                    className="text-[9.5px] text-emerald-300/90 flex items-center justify-between cursor-pointer hover:underline"
                                  >
                                    <span className="flex items-center gap-1 truncate">
                                      <Sparkles className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                                      <span>비고: {row.customNote}</span>
                                    </span>
                                    <span className="text-[8.5px] text-slate-500 font-mono ml-1">수정</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
