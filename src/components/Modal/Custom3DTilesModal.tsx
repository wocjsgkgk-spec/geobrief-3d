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
  MapPin,
  Compass,
} from 'lucide-react';
import { useMapStore, SAMPLE_3D_TILES_PRESETS } from '@/store/useMapStore';
import { Tile3DPresetId } from '@/types/map';
import {
  getEffectiveGoogleMapsKey,
  saveGoogleMapsKey,
  getEffectiveCesiumIonToken,
  saveCesiumIonToken,
  resolve3DTilesUrlAndOptions,
  resolveFullUrl,
} from '@/utils/external3DTilesConnector';

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
    flyToLocation,
  } = useMapStore();

  const [inputUrl, setInputUrl] = useState<string>(tile3DStream.url || '');
  const [selectedPreset, setSelectedPreset] = useState<Tile3DPresetId>(tile3DStream.presetId);
  const [googleApiKey, setGoogleApiKey] = useState<string>(getEffectiveGoogleMapsKey() || '');
  const [cesiumToken, setCesiumToken] = useState<string>(getEffectiveCesiumIonToken() || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    status?: number;
    latencyMs?: number;
  } | null>(null);

  if (!isOpen) return null;

  // 서버사이드 프록시 기반 정밀 연결 테스트 (Google, Cesium, Custom 지원)
  const handleTestConnection = async () => {
    const targetUrl = inputUrl.trim();
    if (!targetUrl && selectedPreset !== 'google_3d' && selectedPreset !== 'cesium_osm') {
      setTestResult({
        success: false,
        message: '3D Tiles 엔드포인트 URL을 입력해주세요.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let verifyUrl = `/api/external-3d/verify?`;
      if (selectedPreset === 'google_3d') {
        const key = googleApiKey.trim() || getEffectiveGoogleMapsKey() || '';
        if (!key) {
          setTestResult({
            success: false,
            message: '⚠️ Google Map Tiles API Key를 먼저 입력해주세요.',
          });
          setIsTesting(false);
          return;
        }
        verifyUrl += `provider=google&key=${encodeURIComponent(key)}`;
      } else if (selectedPreset === 'cesium_osm') {
        const token = cesiumToken.trim() || getEffectiveCesiumIonToken() || '';
        if (!token) {
          setTestResult({
            success: false,
            message: '⚠️ Cesium Ion API 토큰을 먼저 입력해주세요.',
          });
          setIsTesting(false);
          return;
        }
        verifyUrl += `provider=cesium&token=${encodeURIComponent(token)}`;
      } else {
        const fullTargetUrl = resolveFullUrl(targetUrl);
        verifyUrl += `provider=custom&url=${encodeURIComponent(fullTargetUrl)}`;
        if (cesiumToken.trim()) {
          verifyUrl += `&token=${encodeURIComponent(cesiumToken.trim())}`;
        }
      }

      const res = await fetch(verifyUrl, { cache: 'no-cache' });
      const data = await res.json();

      setTestResult({
        success: Boolean(data.success),
        message: `${data.message}${data.detail ? ` (${data.detail})` : ''}`,
        status: data.status,
        latencyMs: data.latencyMs,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `⚠️ 진단 요청 실패: ${err?.message || '네트워크 오류'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSelectPreset = (presetId: Tile3DPresetId) => {
    setSelectedPreset(presetId);
    setTestResult(null);

    if (presetId === 'google_3d') {
      const key = googleApiKey.trim() || getEffectiveGoogleMapsKey() || '';
      setInputUrl(
        key
          ? `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(key)}`
          : 'https://tile.googleapis.com/v1/3dtiles/root.json'
      );
    } else if (presetId === 'cesium_osm') {
      setInputUrl('https://assets.ion.cesium.com/96188/tileset.json');
    } else {
      const preset = SAMPLE_3D_TILES_PRESETS[presetId];
      if (preset && preset.url) {
        setInputUrl(preset.url);
      }
    }
  };

  const handleApplyAndStream = (targetLocation?: 'wonju' | 'chuncheon' | 'gangneung' | 'cheorwon') => {
    let finalUrl = inputUrl.trim();
    if (selectedPreset === 'google_3d') {
      const key = googleApiKey.trim() || getEffectiveGoogleMapsKey() || '';
      if (key) {
        saveGoogleMapsKey(key);
        finalUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(key)}`;
      }
    }
    if (selectedPreset === 'cesium_osm') {
      const token = cesiumToken.trim() || getEffectiveCesiumIonToken() || '';
      if (token) {
        saveCesiumIonToken(token);
        finalUrl = 'https://assets.ion.cesium.com/96188/tileset.json';
      }
    }

    if (!finalUrl && selectedPreset !== 'google_3d' && selectedPreset !== 'cesium_osm') {
      alert('3D Tiles 엔드포인트 URL을 입력해주세요.');
      return;
    }

    setTile3DStreamUrl(finalUrl);
    setTile3DStreamPreset(selectedPreset, finalUrl);
    // 모드 C: 강원 특화 초정밀 실측 디지털 트윈(LOD2+)으로 즉시 전환
    setRenderMode3D('tiles3d');

    if (targetLocation === 'wonju') {
      flyToLocation({ longitude: 127.9358, latitude: 37.3592, zoom: 16.2, pitch: 58, bearing: 15 }, 2000);
    } else if (targetLocation === 'chuncheon') {
      flyToLocation({ longitude: 127.7214, latitude: 37.8865, zoom: 16.0, pitch: 58, bearing: 20 }, 2000);
    } else if (targetLocation === 'gangneung') {
      flyToLocation({ longitude: 128.8961, latitude: 37.7915, zoom: 15.8, pitch: 55, bearing: -15 }, 2000);
    } else if (targetLocation === 'cheorwon') {
      flyToLocation({ longitude: 127.3135, latitude: 38.2070, zoom: 15.5, pitch: 55, bearing: 0 }, 2000);
    }

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
                    id: 'google_3d',
                    name: 'Google Photorealistic 3D',
                    desc: '구글 전 세계 및 한국 도심 3D 실사 항공 메쉬',
                    tag: 'Google 3D',
                  },
                  {
                    id: 'vworld_3d_buildings',
                    name: '브이월드 OGC 실사 3D (국토부)',
                    desc: '국토부 공식 항공 텍스처 b3dm 메쉬',
                    tag: '공식 타일셋',
                  },
                  {
                    id: 'cesium_osm',
                    name: 'Cesium Ion OSM Buildings',
                    desc: 'Cesium Ion 글로벌 3D 건축물 메쉬',
                    tag: 'Cesium Ion',
                  },
                  {
                    id: 'sample_pointcloud',
                    name: '라이다 RGB 3D 점군 (LiDAR pnts)',
                    desc: '항공 정밀 RGB 라이다 점군 데이터',
                    tag: 'LiDAR 점군',
                  },
                  {
                    id: 'sample_city',
                    name: 'Cesium 샘플 도시 (b3dm)',
                    desc: '정밀 텍스처 오픈 3D 빌딩 모델',
                    tag: '글로벌 b3dm',
                  },
                  {
                    id: 'custom',
                    name: '사용자 지정 커스텀 URL',
                    desc: '자체 3D Tiles 또는 로컬 타일셋 엔드포인트',
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

          {/* 1-2. Google Maps API Key 또는 Cesium Token 직접 입력 (프리셋별 연동) */}
          {selectedPreset === 'google_3d' && (
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-700/50 space-y-1.5 animate-in fade-in duration-150">
              <label className="text-[11px] font-bold text-cyan-200 flex items-center justify-between">
                <span>Google Map Tiles API Key</span>
                <span className="text-[10px] font-mono text-cyan-400">환경변수 또는 UI 즉시 저장</span>
              </label>
              <input
                type="password"
                placeholder="Google Maps API Key 입력"
                value={googleApiKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setGoogleApiKey(val);
                  saveGoogleMapsKey(val);
                  if (val.trim()) {
                    setInputUrl(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(val.trim())}`);
                  }
                }}
                className="w-full bg-[#121a15] border border-[#293d2f] focus:border-cyan-400 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-cyan-400/80">
                입력 시 Deck.gl Tile3DLayer로 구글 3D 실사 메쉬(Photorealistic 3D Tiles)를 즉시 스트리밍합니다.
              </p>
            </div>
          )}

          {selectedPreset === 'cesium_osm' && (
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-700/50 space-y-1.5 animate-in fade-in duration-150">
              <label className="text-[11px] font-bold text-cyan-200 flex items-center justify-between">
                <span>Cesium Ion API Token</span>
                <span className="text-[10px] font-mono text-cyan-400">환경변수 또는 UI 즉시 저장</span>
              </label>
              <input
                type="password"
                placeholder="Cesium Ion Token 입력"
                value={cesiumToken}
                onChange={(e) => {
                  const val = e.target.value;
                  setCesiumToken(val);
                  saveCesiumIonToken(val);
                }}
                className="w-full bg-[#121a15] border border-[#293d2f] focus:border-cyan-400 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-cyan-400/80">
                입력 시 Cesium Ion OSM Buildings (Asset 96188) 메쉬를 Authorization 헤더와 함께 로드합니다.
              </p>
            </div>
          )}

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
                disabled={isTesting || (!inputUrl.trim() && !googleApiKey.trim() && !cesiumToken.trim())}
                className="px-3.5 py-2 rounded-xl bg-[#18261e] border border-cyan-600/50 hover:bg-cyan-950/80 text-cyan-300 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? '진단 중' : '연결 진단 & 테스트'}</span>
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

          {/* 4. [강원도 4대 핵심 권역 원클릭 카메라 비행 및 LOD2+ 실사화] */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#12221b] to-[#0d1712] border border-cyan-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-cyan-200 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                강원 전 지역 실측 3D 디지털 트윈 (원클릭 카메라 비행)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                강원 18개 시·군 100% 실사 커버리지
              </span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              🌲 <strong className="text-cyan-300">강원권 특화 공간정보 파이프라인</strong>: 국토교통부 브이월드(V-World) 실측 건축물 대장 층수·높이 데이터와 24종 PBR 실사 파사드·항공사진 옥상 컬러 엔진이 결합되어 강원도 전역을 100% 입체화합니다.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleApplyAndStream('wonju')}
                className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 hover:bg-emerald-900/80 hover:border-emerald-400 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-emerald-200 font-bold text-[11px] group-hover:text-emerald-100 flex items-center gap-1">
                    📍 원주 1군지사
                  </span>
                  <span className="text-xs">🛡️</span>
                </div>
                <div className="text-[9.5px] text-emerald-300/80 mt-1">실측 4,811동 LOD2+</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplyAndStream('chuncheon')}
                className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/60 hover:bg-cyan-900/80 hover:border-cyan-400 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-cyan-200 font-bold text-[11px] group-hover:text-cyan-100 flex items-center gap-1">
                    📍 춘천 캠프페이지
                  </span>
                  <span className="text-xs">🏢</span>
                </div>
                <div className="text-[9.5px] text-cyan-300/80 mt-1">도심 상업/주거 복합</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplyAndStream('gangneung')}
                className="p-2.5 rounded-xl bg-teal-950/80 border border-teal-500/60 hover:bg-teal-900/80 hover:border-teal-400 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-teal-200 font-bold text-[11px] group-hover:text-teal-100 flex items-center gap-1">
                    📍 강릉 경포 도심
                  </span>
                  <span className="text-xs">🌊</span>
                </div>
                <div className="text-[9.5px] text-teal-300/80 mt-1">영동 해안 스카이라인</div>
              </button>

              <button
                type="button"
                onClick={() => handleApplyAndStream('cheorwon')}
                className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/60 hover:bg-amber-900/80 hover:border-amber-400 text-left transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-amber-200 font-bold text-[11px] group-hover:text-amber-100 flex items-center gap-1">
                    📍 철원 군사거점
                  </span>
                  <span className="text-xs">🎖️</span>
                </div>
                <div className="text-[9.5px] text-amber-300/80 mt-1">통합막사·물류창고</div>
              </button>
            </div>
          </div>

          {/* 범용 하이브리드 3D 타일 파이프라인 안내 */}
          <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-600/40 text-[10.5px] text-cyan-200/90 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-cyan-300">🟢 범용 하이브리드 3D 타일 엔진 (전 지역 100% 활성화):</span>
              <p className="text-cyan-200/80 mt-0.5">
                외부 b3dm 타일셋이 없는 지역(원주 1군지사, 캠프 롱, 춘천, 철원 등)에서도 Deck.gl 고밀도 건축 메쉬(기단부·타워·옥상 난간/코어) 합성 엔진이 100% 커버리지를 제공합니다.
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
            onClick={() => handleApplyAndStream()}
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
