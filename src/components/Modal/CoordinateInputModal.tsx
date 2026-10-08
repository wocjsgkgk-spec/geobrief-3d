'use client';

import React, { useState, useMemo } from 'react';
import { X, Check, FileText, AlertCircle, Sparkles, MapPin } from 'lucide-react';
import * as turf from '@turf/turf';
import { useMapStore } from '@/store/useMapStore';

interface CoordinateInputModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedCoordResult {
  coordinates: [number, number][]; // [lng, lat]
  error: string | null;
  sqm: number;
  pyeong: number;
}

export const CoordinateInputModal: React.FC<CoordinateInputModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { setPolygonFromCoords } = useMapStore();
  const [inputText, setInputText] = useState<string>('');

  // 샘플 데이터
  const handleLoadSample = () => {
    const sample = `38.1485, 127.3115
38.1512, 127.3168
38.1470, 127.3205
38.1435, 127.3150`;
    setInputText(sample);
  };

  // 실시간 텍스트 파싱
  const parsedResult = useMemo<ParsedCoordResult>(() => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      return { coordinates: [], error: null, sqm: 0, pyeong: 0 };
    }

    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    const coords: [number, number][] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 쉼표, 탭, 공백, 세미콜론 등으로 분리
      const parts = line
        .replace(/\[|\]|\(|\)/g, '')
        .split(/[\s,;\t]+/)
        .map((p) => parseFloat(p))
        .filter((n) => !isNaN(n));

      if (parts.length < 2) {
        return {
          coordinates: [],
          error: `${i + 1}번째 줄의 좌표 형식이 올바르지 않습니다. (위도, 경도 필요)`,
          sqm: 0,
          pyeong: 0,
        };
      }

      const val1 = parts[0];
      const val2 = parts[1];

      let lat = 0;
      let lng = 0;

      // 스마트 판별: 한국 기준 경도는 124~132, 위도는 33~43
      if (val1 >= 120 && val1 <= 135) {
        lng = val1;
        lat = val2;
      } else if (val2 >= 120 && val2 <= 135) {
        lat = val1;
        lng = val2;
      } else if (val1 >= 30 && val1 <= 45) {
        lat = val1;
        lng = val2;
      } else {
        // 기본 가정: 첫 번째가 위도, 두 번째가 경도
        lat = val1;
        lng = val2;
      }

      if (lat < 30 || lat > 45 || lng < 120 || lng > 135) {
        return {
          coordinates: [],
          error: `${i + 1}번째 줄: 위경도 범위가 한반도 좌표계(위도 33~43°, 경도 124~132°)를 벗어났습니다.`,
          sqm: 0,
          pyeong: 0,
        };
      }

      coords.push([lng, lat]);
    }

    if (coords.length < 3) {
      return {
        coordinates: coords,
        error: `다각형(Polygon)을 구성하려면 최소 3개 이상의 좌표점이 필요합니다. (현재 ${coords.length}개)`,
        sqm: 0,
        pyeong: 0,
      };
    }

    try {
      const closed = [...coords];
      if (
        closed[0][0] !== closed[closed.length - 1][0] ||
        closed[0][1] !== closed[closed.length - 1][1]
      ) {
        closed.push(closed[0]);
      }
      const poly = turf.polygon([closed]);
      const sqm = Math.round(turf.area(poly));
      const pyeong = Math.round(sqm / 3.305785);

      return {
        coordinates: coords,
        error: null,
        sqm,
        pyeong,
      };
    } catch {
      return {
        coordinates: coords,
        error: '입력된 좌표가 꼬이거나 유효하지 않은 다각형입니다.',
        sqm: 0,
        pyeong: 0,
      };
    }
  }, [inputText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedResult.error || parsedResult.coordinates.length < 3) return;

    setPolygonFromCoords(parsedResult.coordinates);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#141c16] border border-[#2c3d30] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#243328] flex items-center justify-between bg-[#111712]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-600/60 flex items-center justify-center text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                정밀 좌표(위경도) 직접 입력
              </h3>
              <p className="text-[11px] text-slate-400">
                위경도 텍스트를 붙여넣어 오차 없이 정밀 부지를 지정합니다
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* 가이드 & 퀵 샘플 */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              좌표 형식: <code className="text-emerald-300 font-mono">위도, 경도</code> (줄바꿈 구분)
            </span>
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded transition-all"
            >
              <Sparkles className="w-3 h-3" />
              예시 좌표 채우기
            </button>
          </div>

          {/* 텍스트 입력창 */}
          <div className="space-y-1">
            <textarea
              rows={7}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`예시:\n38.1485, 127.3115\n38.1512, 127.3168\n38.1470, 127.3205\n38.1435, 127.3150`}
              className="w-full bg-[#0d130f] border border-[#26372b] focus:border-emerald-500 rounded-xl p-3 text-xs font-mono text-slate-100 focus:outline-none transition-all placeholder:text-slate-600 resize-none shadow-inner leading-relaxed"
            />
          </div>

          {/* 실시간 파싱 결과 및 검증 카드 */}
          <div className="p-3 rounded-xl bg-[#101712] border border-[#233327] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">파싱 상태:</span>
              {parsedResult.error ? (
                <span className="text-rose-400 font-semibold flex items-center gap-1 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" />
                  오류 감지
                </span>
              ) : parsedResult.coordinates.length >= 3 ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                  <Check className="w-3.5 h-3.5" />
                  정상 다각형 ({parsedResult.coordinates.length}개 정점)
                </span>
              ) : (
                <span className="text-slate-500 text-[11px]">좌표 입력 대기 중</span>
              )}
            </div>

            {parsedResult.error ? (
              <p className="text-[11px] text-rose-300 bg-rose-950/40 p-2 rounded-lg border border-rose-900/60 leading-relaxed">
                {parsedResult.error}
              </p>
            ) : parsedResult.coordinates.length >= 3 ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-[#17221a] p-2 rounded-lg border border-[#283b2e]">
                  <div className="text-[10px] text-slate-400">계산 면적 (㎡)</div>
                  <div className="text-xs font-bold font-mono text-blue-400 mt-0.5">
                    {parsedResult.sqm.toLocaleString()} ㎡
                  </div>
                </div>
                <div className="bg-[#17221a] p-2 rounded-lg border border-[#283b2e]">
                  <div className="text-[10px] text-slate-400">환산 면적 (평)</div>
                  <div className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
                    약 {parsedResult.pyeong.toLocaleString()} 평
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#233327]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-[#1a241d] text-slate-300 hover:bg-[#253329] transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={Boolean(parsedResult.error) || parsedResult.coordinates.length < 3}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed shadow-md transition-all flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>부지 생성 및 3D 뷰 이동</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
