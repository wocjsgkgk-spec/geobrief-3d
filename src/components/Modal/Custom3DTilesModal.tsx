'use client';

import React, { useState } from 'react';
import {
  X,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Sliders,
  Globe,
  Radio,
} from 'lucide-react';
import { useMapStore, SAMPLE_3D_TILES_PRESETS } from '@/store/useMapStore';
import { Tile3DPresetId } from '@/types/map';

interface Custom3DTilesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Custom3DTilesModal: React.FC<Custom3DTilesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    tile3DStream,
    setTile3DStreamUrl,
    setTile3DStreamPreset,
    setTile3DStreamSse,
    setTile3DStreamOpacity,
    setTile3DStreamPointSize,
    setRenderMode3D,
  } = useMapStore();

  const [inputUrl, setInputUrl] = useState<string>(tile3DStream.url || '');
  const [selectedPreset, setSelectedPreset] = useState<Tile3DPresetId>(tile3DStream.presetId);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    status?: number;
    latencyMs?: number;
  } | null>(null);

  if (!isOpen) return null;

  // 5초 연결 타임아웃 AbortController 기반 사전 연결 테스트
  const handleTestConnection = async () => {
    const targetUrl = inputUrl.trim();
    if (!targetUrl) {
      setTestResult({
        success: false,
        message: '3D Tiles 엔드포인트 URL을 입력해주세요.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const controller = new AbortController();
    const startTime = performance.now();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 5000);

    try {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json, text/plain, */*' },
        cache: 'no-cache',
      });
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        setTestResult({
          success: true,
          message: `정상 연결 확인 (HTTP ${res.status} OK · 응답속도: ${latencyMs}ms)`,
          status: res.status,
          latencyMs,
        });
      } else {
        setTestResult({
          success: false,
          message: `HTTP ${res.status} ${res.statusText} - 타일셋 파일이 존재하지 않거나 접근이 제한되었습니다.`,
          status: res.status,
          latencyMs,
        });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === 'AbortError' || controller.signal.aborted;
      setTestResult({
        success: false,
        message: isTimeout
          ? '⚠️ 5초 연결 타임아웃: 서버 응답이 없거나 네트워크가 지연되었습니다.'
          : `⚠️ 연결 실패: ${err?.message || 'CORS 또는 네트워크 오류'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSelectPreset = (presetId: Tile3DPresetId) => {
    setSelectedPreset(presetId);
    const preset = SAMPLE_3D_TILES_PRESETS[presetId];
    if (preset && preset.url) {
      setInputUrl(preset.url);
      setTestResult(null);
    }
  };

  const handleApplyAndStream = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      alert('3D Tiles 엔드포인트 URL을 입력해주세요.');
      return;
    }

    setTile3DStreamUrl(trimmed);
    setTile3DStreamPreset(selectedPreset);
    // 모드 C: 고정밀 3D 타일셋 스트리밍으로 즉시 전환
    setRenderMode3D('tiles3d');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#0f1713] border border-[#233527] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-[#233527] flex items-center justify-between bg-[#131d17]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/60 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                3D Tiles OGC 스트리밍 엔드포인트 설정
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  모드 C 전용
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                국토부 브이월드 또는 자체 Cesium/b3dm 3D 타일셋을 직접 연결하고 검증합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f2e24] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-200">
          {/* 1. 샘플 테스트 슬롯 프리셋 */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                검증된 3D 타일셋 샘플 슬롯
              </span>
              <span className="text-[10px] text-slate-400 font-normal">원클릭 선택</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  {
                    id: 'vworld_3d_buildings',
                    name: '브이월드 OGC 실사 3D (서울 도심)',
                    desc: '국토부 공식 항공 텍스처 b3dm 메쉬',
                    tag: '공식 타일셋',
                  },
                  {
                    id: 'sample_city',
                    name: 'Cesium Ion 도시 메쉬 (b3dm)',
                    desc: '정밀 텍스처 오픈 3D 빌딩 모델',
                    tag: '글로벌 b3dm',
                  },
                  {
                    id: 'sample_pointcloud',
                    name: '라이다 RGB 3D 점군 (LiDAR pnts)',
                    desc: '항공 정밀 RGB 라이다 점군 데이터',
                    tag: 'LiDAR 점군',
                  },
                  {
                    id: 'custom',
                    name: '사용자 지정 커스텀 URL',
                    desc: '자체 Cesium Ion 토큰 또는 로컬 타일셋',
                    tag: '사용자 정의',
                  },
                ] as const
              ).map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => handleSelectPreset(slot.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selectedPreset === slot.id
                      ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-sm ring-1 ring-cyan-500/30'
                      : 'bg-[#141e18] border-[#223326] text-slate-300 hover:bg-[#1a2820]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[11px] text-slate-100 truncate">
                      {slot.name}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-800">
                      {slot.tag}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate leading-tight">
                    {slot.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* 2. 사용자 지정 URL 입력창 */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>3D Tiles 메타데이터 엔드포인트 URL (tileset.json)</span>
              <span className="text-[10px] font-mono text-cyan-400">b3dm / pnts 지원</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://your-domain.com/path/tileset.json"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  setSelectedPreset('custom');
                  setTestResult(null);
                }}
                className="flex-1 bg-[#121a15] border border-[#293d2f] focus:border-cyan-400 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !inputUrl.trim()}
                className="px-3.5 py-2 rounded-xl bg-[#18261e] border border-cyan-600/50 hover:bg-cyan-950/80 text-cyan-300 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? '진단 중' : '5초 연결 테스트'}</span>
              </button>
            </div>

            {/* 테스트 결과 인라인 안내 */}
            {testResult && (
              <div
                className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 animate-in fade-in duration-150 ${
                  testResult.success
                    ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-200'
                    : 'bg-rose-950/70 border-rose-600/70 text-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="leading-tight">{testResult.message}</span>
              </div>
            )}
          </div>

          {/* 3. LOD 품질 및 렌더링 파라미터 제어 */}
          <div className="p-3 rounded-xl bg-[#121c16] border border-[#243528] space-y-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                LOD 프러스텀 컬링 세밀도 (SSE)
              </span>
              <span className="text-[10px] font-mono text-cyan-300">
                {tile3DStream.maximumScreenSpaceError === 8
                  ? '8 (초정밀)'
                  : tile3DStream.maximumScreenSpaceError === 16
                  ? '16 (균형 권장)'
                  : '24 (고성능 GC)'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { sse: 8, label: '8 (초정밀)', desc: '근거리 고해상도 메쉬' },
                { sse: 16, label: '16 (균형)', desc: '표준 스트리밍 품질' },
                { sse: 24, label: '24 (고성능)', desc: '화면 밖 즉각 GC 해제' },
              ].map((opt) => (
                <button
                  key={opt.sse}
                  type="button"
                  onClick={() => setTile3DStreamSse(opt.sse)}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    tile3DStream.maximumScreenSpaceError === opt.sse
                      ? 'bg-cyan-600 border-cyan-400 text-white shadow-sm font-bold'
                      : 'bg-[#16221a] border-[#293d2f] text-slate-300 hover:bg-[#1d2d22]'
                  }`}
                >
                  <div className="text-[10px]">{opt.label}</div>
                  <div className="text-[8.5px] opacity-75 font-normal">{opt.desc}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#223527]">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>불투명도</span>
                  <span className="font-mono text-cyan-300">
                    {Math.round(tile3DStream.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={tile3DStream.opacity}
                  onChange={(e) => setTile3DStreamOpacity(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>점군 크기</span>
                  <span className="font-mono text-cyan-300">
                    {tile3DStream.pointSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={tile3DStream.pointSize}
                  onChange={(e) => setTile3DStreamPointSize(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* 지능형 안전 폴백 안내 */}
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-600/40 text-[10.5px] text-amber-200/90 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300">지능형 5초 타임아웃 & 안전 폴백 가동 중:</span>
              <p className="text-amber-200/80 mt-0.5">
                원주 1군지사 등 타일 미지원 지역이거나 네트워크 에러 시 무한 대기를 차단하고 즉시{' '}
                <strong className="text-amber-300">한국형 실감 파사드 모드(LOD2)</strong>로 자동 복구됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* 푸터 액션 버튼 */}
        <div className="px-5 py-3.5 border-t border-[#233527] bg-[#121c16] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium rounded-xl text-slate-300 hover:text-white hover:bg-[#1f2e24] transition-colors"
          >
            취소
          </button>

          <button
            type="button"
            onClick={handleApplyAndStream}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-lg shadow-cyan-950/60 ring-1 ring-cyan-400/50 flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>적용 및 3D 타일셋 스트리밍 시작</span>
          </button>
        </div>
      </div>
    </div>
  );
};
