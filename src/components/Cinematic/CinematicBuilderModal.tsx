'use client';

import React, { useState } from 'react';
import {
  Film,
  X,
  Plus,
  Play,
  Pause,
  Square,
  Video,
  Trash2,
  Compass,
  Navigation2,
  Sparkles,
  RotateCcw,
  Check,
  Eye,
  Sliders,
  Clock,
  Repeat,
  Download,
  AlertCircle,
} from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';
import { CinematicWaypoint } from '@/types/map';

interface CinematicBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentViewport: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
  };
  onFlyToWaypoint: (wp: CinematicWaypoint) => void;
  onStartFlight: () => void;
  onPauseFlight: () => void;
  onStopFlight: () => void;
  onStartRecordingWithFlight: () => void;
}

export const CinematicBuilderModal: React.FC<CinematicBuilderModalProps> = ({
  isOpen,
  onClose,
  currentViewport,
  onFlyToWaypoint,
  onStartFlight,
  onPauseFlight,
  onStopFlight,
  onStartRecordingWithFlight,
}) => {
  const {
    cinematicFlight,
    addCinematicWaypoint,
    removeCinematicWaypoint,
    updateCinematicWaypoint,
    setCinematicDuration,
    toggleCinematicLoop,
    toggleCinematicOsd,
    loadCinematicPreset,
    setCinematicWaypoints,
    polygonCenter,
  } = useMapStore();

  const {
    waypoints,
    durationSec,
    isPlaying,
    isRecording,
    loop,
    showOsd,
  } = cinematicFlight;

  const [editingId, setEditingId] = useState<string | null>(null);

  if (!isOpen) return null;

  // 현재 시점을 새 키프레임으로 추가
  const handleAddCurrentKeyframe = () => {
    const nextIdx = waypoints.length + 1;
    const newWp: CinematicWaypoint = {
      id: 'wp-' + Date.now(),
      name: `WP ${nextIdx}: 시점 (Z${currentViewport.zoom.toFixed(1)}, P${Math.round(currentViewport.pitch)}°)`,
      longitude: parseFloat(currentViewport.longitude.toFixed(6)),
      latitude: parseFloat(currentViewport.latitude.toFixed(6)),
      zoom: parseFloat(currentViewport.zoom.toFixed(2)),
      pitch: Math.round(currentViewport.pitch),
      bearing: Math.round(currentViewport.bearing),
    };
    addCinematicWaypoint(newWp);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-2xl bg-[#0e1613] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-200 ring-1 ring-cyan-500/20">
        {/* 1. 모달 헤더 */}
        <div className="p-4 px-5 border-b border-[#1f3027] bg-[#121c17] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-400 shadow-inner">
              <Film className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-slate-100">
                  3D 시네마틱 카메라 경로 빌더
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60">
                  Catmull-Rom 스플라인
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                웨이포인트를 부드러운 스플라인 곡선으로 활강 비행하고 1080p 60fps 동영상으로 실시간 녹화합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. 프리셋 툴바 & 키프레임 추가 */}
        <div className="p-3.5 px-5 border-b border-[#1a2821] bg-[#101914] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              프리셋:
            </span>
            <button
              type="button"
              onClick={() => loadCinematicPreset('spiral')}
              className="px-2.5 py-1 rounded-lg bg-[#18261f] hover:bg-cyan-950 hover:text-cyan-300 text-slate-300 text-[11px] font-medium border border-[#2b4236] transition-colors"
            >
              부지 360° 나선 조감 (5 WP)
            </button>
            <button
              type="button"
              onClick={() => loadCinematicPreset('approach')}
              className="px-2.5 py-1 rounded-lg bg-[#18261f] hover:bg-cyan-950 hover:text-cyan-300 text-slate-300 text-[11px] font-medium border border-[#2b4236] transition-colors"
            >
              저고도 진입 축선 (4 WP)
            </button>
            <button
              type="button"
              onClick={() => setCinematicWaypoints([])}
              className="px-2 py-1 rounded-lg hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 text-[11px] transition-colors"
              title="웨이포인트 전체 비우기"
            >
              초기화
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddCurrentKeyframe}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-950"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>현재 시점 키프레임 추가</span>
          </button>
        </div>

        {/* 3. 웨이포인트 목록 (스크롤 영역) */}
        <div className="flex-1 overflow-y-auto p-4 px-5 space-y-2.5 min-h-[220px]">
          {waypoints.length === 0 ? (
            <div className="h-44 rounded-xl border-2 border-dashed border-[#23352b] bg-[#111a15] flex flex-col items-center justify-center text-center p-4 space-y-2">
              <Film className="w-8 h-8 text-slate-500" />
              <div className="text-xs font-semibold text-slate-300">
                등록된 웨이포인트가 없습니다
              </div>
              <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
                지도에서 원하는 카메라 각도를 조절한 후 상단의{' '}
                <span className="text-cyan-400 font-semibold">[+ 현재 시점 키프레임 추가]</span>를
                누르거나 상단 추천 프리셋을 로드하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px] text-slate-400 px-1 font-mono">
                <span>등록된 웨이포인트 ({waypoints.length}개 지점)</span>
                <span>Catmull-Rom 곡선 연결됨</span>
              </div>

              {waypoints.map((wp, idx) => (
                <div
                  key={wp.id}
                  className="p-2.5 px-3.5 rounded-xl bg-[#14211a] border border-[#23382c] hover:border-cyan-500/50 transition-all flex items-center justify-between gap-3 text-xs"
                >
                  {/* 순번 & 명칭 */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-cyan-950 border border-cyan-700/60 text-cyan-300 font-mono font-bold flex items-center justify-center text-[11px] flex-shrink-0">
                      {idx + 1}
                    </span>

                    {editingId === wp.id ? (
                      <input
                        type="text"
                        defaultValue={wp.name}
                        autoFocus
                        onBlur={(e) => {
                          updateCinematicWaypoint(wp.id, { name: e.target.value.trim() || wp.name });
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateCinematicWaypoint(wp.id, { name: (e.target as HTMLInputElement).value.trim() || wp.name });
                            setEditingId(null);
                          }
                        }}
                        className="bg-black/60 border border-cyan-500/60 rounded px-2 py-0.5 text-xs text-white focus:outline-none w-full"
                      />
                    ) : (
                      <div
                        onDoubleClick={() => setEditingId(wp.id)}
                        className="font-semibold text-slate-200 truncate cursor-pointer hover:text-cyan-300 transition-colors"
                        title="더블클릭하여 명칭 수정"
                      >
                        {wp.name}
                      </div>
                    )}
                  </div>

                  {/* 카메라 파라미터 (줌, 피치, 베어링) */}
                  <div className="hidden sm:flex items-center gap-2 font-mono text-[10.5px] text-slate-400 flex-shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-[#0d1612] border border-[#1d2d24]">
                      Z {wp.zoom.toFixed(1)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#0d1612] border border-[#1d2d24]">
                      P {wp.pitch}°
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#0d1612] border border-[#1d2d24]">
                      B {wp.bearing}°
                    </span>
                  </div>

                  {/* 액션 (시점 이동, 삭제) */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onFlyToWaypoint(wp)}
                      className="px-2 py-1 rounded-md bg-[#192b22] hover:bg-cyan-900 text-cyan-300 text-[10.5px] font-medium border border-cyan-800/40 transition-colors"
                      title="해당 웨이포인트 카메라 시점으로 즉시 이동"
                    >
                      시점 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCinematicWaypoint(wp.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                      title="키프레임 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. 비행 옵션 (시간, 루프, OSD) */}
        <div className="p-3.5 px-5 border-t border-[#1a2821] bg-[#101914] flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* 비행 소요 시간 */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              비행 소요 시간:
            </span>
            <div className="flex gap-1">
              {[15, 30, 60].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setCinematicDuration(sec)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border transition-colors ${
                    durationSec === sec
                      ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                      : 'bg-[#18261f] text-slate-300 border-[#283d31] hover:bg-[#20332a]'
                  }`}
                >
                  {sec}초
                </button>
              ))}
            </div>
          </div>

          {/* 루프 & OSD 토글 */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={loop}
                onChange={toggleCinematicLoop}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5 text-amber-400" />
                루프 반복
              </span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={showOsd}
                onChange={toggleCinematicOsd}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>방송용 계기판 OSD</span>
            </label>
          </div>
        </div>

        {/* 5. 모달 하단 재생 & 녹화 컨트롤러 */}
        <div className="p-4 px-5 border-t border-[#1f3027] bg-[#121c17] flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {waypoints.length < 2 ? (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                최소 2개 이상의 웨이포인트가 필요합니다
              </span>
            ) : (
              <span className="text-emerald-300">
                ✅ 준비 완료: {waypoints.length}개 지점 부드러운 스플라인 비행
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 비행 재생 / 일시정지 */}
            {isPlaying ? (
              <button
                type="button"
                onClick={onPauseFlight}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-amber-950"
              >
                <Pause className="w-4 h-4 fill-white" />
                <span>일시정지</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartFlight}
                disabled={waypoints.length < 2}
                className={`px-3.5 py-2 rounded-xl text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-md ${
                  waypoints.length < 2
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                    : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-950'
                }`}
              >
                <Play className="w-4 h-4 fill-white" />
                <span>시네마틱 비행 시작</span>
              </button>
            )}

            {/* 정지 */}
            {isPlaying && (
              <button
                type="button"
                onClick={onStopFlight}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="비행 정지"
              >
                <Square className="w-4 h-4" />
              </button>
            )}

            {/* 🔴 브리핑 영상 녹화 시작 버튼 */}
            <button
              type="button"
              onClick={onStartRecordingWithFlight}
              disabled={waypoints.length < 2 || isRecording}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-lg ${
                waypoints.length < 2 || isRecording
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950 ring-1 ring-rose-400/50 animate-pulse'
              }`}
              title="시네마틱 비행을 실행하면서 1080p 60fps로 캔버스를 녹화하고 자동 다운로드합니다."
            >
              <Video className="w-4 h-4" />
              <span>{isRecording ? '🔴 녹화 중...' : '🔴 브리핑 영상 녹화 시작'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
