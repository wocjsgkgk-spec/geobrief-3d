'use client';

import React, { useState, useEffect } from 'react';
import { Key, Check, X, Shield, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import {
  getEffectiveVworldKey,
  saveCustomVworldKey,
  clearCustomVworldKey,
  VWORLD_CUSTOM_KEY_STORAGE,
  getMaskedVworldKey,
} from '@/services/vworldService';
import { useMapStore } from '@/store/useMapStore';

interface VworldKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: () => void;
}

export const VworldKeyModal: React.FC<VworldKeyModalProps> = ({
  isOpen,
  onClose,
  onKeySaved,
}) => {
  const { setVworldDiagnostic } = useMapStore();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem(VWORLD_CUSTOM_KEY_STORAGE) || ''
          : '';
      const envKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY || '';
      const initialKey = stored || envKey;
      setApiKeyInput(initialKey);
      setHasStoredKey(Boolean(stored));
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const cleanKey = apiKeyInput.replace(/['"`]/g, '').trim();
    if (!cleanKey) {
      alert('API 키를 입력해주세요.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 프록시 API를 호출하여 키 유효성 즉시 검증
      // 춘천/원주 일원 샘플 BBOX
      const testBbox = '127.94,37.36,127.96,37.38';
      const res = await fetch(
        `/api/vworld/buildings?bbox=${testBbox}&customKey=${encodeURIComponent(cleanKey)}`
      );
      const data = await res.json();

      if (data.status === 'connected') {
        saveCustomVworldKey(cleanKey);
        setHasStoredKey(true);
        setTestResult({
          success: true,
          message: 'V-World API 연결 성공! 키가 안전하게 저장되었습니다.',
        });

        const masked =
          cleanKey.length >= 8
            ? `${cleanKey.slice(0, 4)}****${cleanKey.slice(-4)}`
            : '****';

        setVworldDiagnostic({
          status: 'connected',
          message: '🟢 V-World 정밀 공간정보 연동 완료',
          maskedKey: masked,
          featureCount: data.featureCount || 0,
          lastChecked: Date.now(),
        });

        if (onKeySaved) onKeySaved();
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        // 에러인 경우에도 사용자가 저장하길 원할 수 있으므로 저장 허용 및 경고 표출
        saveCustomVworldKey(cleanKey);
        setHasStoredKey(true);
        setTestResult({
          success: false,
          message: `키가 저장되었으나 테스트 응답: ${data.message || '인증 오류'}`,
        });

        const masked =
          cleanKey.length >= 8
            ? `${cleanKey.slice(0, 4)}****${cleanKey.slice(-4)}`
            : '****';

        setVworldDiagnostic({
          status: 'error',
          message: data.message || '인증키 확인 필요',
          maskedKey: masked,
          errorDetail: data.errorDetail,
        });

        if (onKeySaved) onKeySaved();
      }
    } catch (err: any) {
      saveCustomVworldKey(cleanKey);
      setTestResult({
        success: false,
        message: `통신 중 오류 발생: ${err.message}`,
      });
      if (onKeySaved) onKeySaved();
    } finally {
      setIsTesting(false);
    }
  };

  const handleReset = () => {
    clearCustomVworldKey();
    setHasStoredKey(false);
    const envKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY || '';
    setApiKeyInput(envKey);
    setTestResult(null);

    const effective = getEffectiveVworldKey();
    if (effective) {
      const masked = getMaskedVworldKey() || '****';
      setVworldDiagnostic({
        status: 'connected',
        message: '환경 변수(.env.local) 키로 복원됨',
        maskedKey: masked,
      });
    } else {
      setVworldDiagnostic({
        status: 'unconfigured',
        message: 'API 키 미설정 (오픈 벡터로 대체 중)',
        maskedKey: undefined,
      });
    }

    if (onKeySaved) onKeySaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-md bg-[#131a15] border border-[#2b3d30] rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* 모달 헤더 */}
        <div className="p-4 border-b border-[#243328] bg-[#0e1510] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                V-World API 인증키 직접 설정
              </h3>
              <p className="text-[10px] text-slate-400">
                국토교통부 브이월드 디지털트윈 오픈플랫폼 인증키 등록
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 모달 바디 */}
        <div className="p-4 space-y-3.5 text-xs">
          {/* 보안 및 저장 안내 */}
          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300/90 leading-relaxed flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-emerald-300">로컬 브라우저 안전 보관:</span>
              <p className="text-[10.5px] text-emerald-200/80 mt-0.5">
                입력하신 API 키는 브라우저 LocalStorage에 안전하게 저장되며 외부 서버로 전송되지
                않습니다. 따옴표나 앞뒤 공백은 자동으로 정제됩니다.
              </p>
            </div>
          </div>

          {/* 키 입력 폼 */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>V-World API 인증키 (Auth Key)</span>
              {hasStoredKey && (
                <span className="text-[10px] text-emerald-400 font-mono">
                  [사용자 커스텀 키 활성화됨]
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="예: 98979EFF-96BA-3F53-865D-50AC0BC0CBF2"
                className="w-full bg-[#0c120e] border border-[#2b3e2f] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none placeholder-slate-600 transition-colors"
              />
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              ※ .env.local에 설정하셨더라도 브라우저 번들 캐시 문제로 미인식되는 경우 본 입력기에
              붙여넣으시면 즉시 반영됩니다.
            </p>
          </div>

          {/* 테스트 결과 피드백 */}
          {testResult && (
            <div
              className={`p-2.5 rounded-lg border text-[11px] leading-snug flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-600 text-rose-200'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* 발급처 바로가기 링크 */}
          <div className="pt-1 flex items-center justify-between text-[10.5px] text-slate-400">
            <span>키가 없으신가요?</span>
            <a
              href="https://www.vworld.kr/dtmk/dtmk_ntads_s001.do"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>브이월드 인증키 무료 발급</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="p-3 border-t border-[#243328] bg-[#0e1510] flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-all"
            title="직접 등록한 키를 삭제하고 .env.local 기본값으로 복원"
          >
            초기화
          </button>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isTesting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/60 disabled:opacity-60"
            >
              {isTesting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{isTesting ? '연결 테스트 중...' : '연결 확인 및 저장'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
