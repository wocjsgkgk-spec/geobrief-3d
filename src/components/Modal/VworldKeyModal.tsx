'use client';

import React, { useState, useEffect } from 'react';
import {
  Key,
  Check,
  X,
  Shield,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';
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
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [maskedKeyDisplay, setMaskedKeyDisplay] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      // 보안을 위해 기존 키 평문을 절대 input에 채우지 않음!
      setApiKeyInput('');
      setShowKey(false);
      setTestResult(null);

      const effective = getEffectiveVworldKey();
      const masked = getMaskedVworldKey();
      setHasStoredKey(Boolean(effective));
      setMaskedKeyDisplay(masked);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const cleanKey = apiKeyInput.replace(/['"`]/g, '').trim();

    // 입력값이 없는 경우: 이미 키가 등록되어 있다면 안내 후 종료
    if (!cleanKey) {
      if (hasStoredKey) {
        setTestResult({
          success: true,
          message: '기존에 안전하게 등록된 V-World 인증키를 유지합니다.',
        });
        setTimeout(onClose, 1000);
        return;
      }
      alert('등록할 V-World API 키를 입력해주세요.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 프록시 API를 호출하여 키 유효성 검증
      const testBbox = '127.94,37.36,127.96,37.38';
      const res = await fetch(
        `/api/vworld/buildings?bbox=${testBbox}&customKey=${encodeURIComponent(cleanKey)}`
      );
      const data = await res.json();

      if (data.status === 'connected') {
        saveCustomVworldKey(cleanKey);
        setHasStoredKey(true);
        const newMasked =
          cleanKey.length >= 8
            ? `${cleanKey.slice(0, 4)}****${cleanKey.slice(-4)}`
            : '****';
        setMaskedKeyDisplay(newMasked);

        setTestResult({
          success: true,
          message: 'V-World API 정상 연동 완료! 키가 브라우저에 안전하게 암호화 보관되었습니다.',
        });

        setVworldDiagnostic({
          status: 'connected',
          message: '🟢 V-World 정밀 공간정보 연동 완료',
          maskedKey: newMasked,
          featureCount: data.featureCount || 0,
          lastChecked: Date.now(),
        });

        // 보안을 위해 입력 필드 즉시 초기화
        setApiKeyInput('');

        if (onKeySaved) onKeySaved();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // 에러인 경우에도 사용자가 수동 저장할 수 있도록 옵션 제공
        saveCustomVworldKey(cleanKey);
        setHasStoredKey(true);
        const newMasked =
          cleanKey.length >= 8
            ? `${cleanKey.slice(0, 4)}****${cleanKey.slice(-4)}`
            : '****';
        setMaskedKeyDisplay(newMasked);

        setTestResult({
          success: false,
          message: `키가 저장되었으나 응답 상태: ${data.message || '인증키 확인 필요'}`,
        });

        setVworldDiagnostic({
          status: 'error',
          message: data.message || '인증키 확인 필요',
          maskedKey: newMasked,
          errorDetail: data.errorDetail,
        });

        setApiKeyInput('');
        if (onKeySaved) onKeySaved();
      }
    } catch (err: any) {
      saveCustomVworldKey(cleanKey);
      setTestResult({
        success: false,
        message: `통신 중 오류 발생: ${err.message}`,
      });
      setApiKeyInput('');
      if (onKeySaved) onKeySaved();
    } finally {
      setIsTesting(false);
    }
  };

  const handleReset = () => {
    if (
      !window.confirm(
        '직접 등록하신 브이월드 API 키를 삭제하고 초기화하시겠습니까?'
      )
    ) {
      return;
    }

    clearCustomVworldKey();
    setHasStoredKey(false);
    setMaskedKeyDisplay(null);
    setApiKeyInput('');
    setTestResult({
      success: true,
      message: '커스텀 인증키가 완전히 삭제되었습니다. (오픈 무료 벡터로 자동 대체)',
    });

    const envKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY || '';
    if (envKey && envKey !== 'your_vworld_api_key_here') {
      const masked = getMaskedVworldKey() || '****';
      setVworldDiagnostic({
        status: 'connected',
        message: '기본 시스템 환경 변수 키로 복원됨',
        maskedKey: masked,
      });
    } else {
      setVworldDiagnostic({
        status: 'unconfigured',
        message: 'API 키 미설정 (오픈 무료 벡터 타일로 대체 가동 중)',
        maskedKey: undefined,
      });
    }

    if (onKeySaved) onKeySaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-md bg-[#111913] border border-[#26382b] rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* 모달 헤더 */}
        <div className="p-4 border-b border-[#1f2d23] bg-[#0c140e] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                V-World API 인증키 보안 설정
              </h3>
              <p className="text-[10px] text-slate-400">
                국토교통부 디지털트윈 공간정보 연동 (보안 마스킹 보호)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 모달 바디 */}
        <div className="p-4 space-y-3.5 text-xs">
          {/* 현재 등록 상태 카드 (평문 노출 방지: 앞뒤 4자리만 마스킹) */}
          {hasStoredKey && (
            <div className="p-3 rounded-lg bg-[#0e1711] border border-emerald-800/60 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">
                  현재 활성 인증키 (보안 마스킹)
                </span>
                <span className="font-mono text-sm font-bold text-slate-100 tracking-wider">
                  {maskedKeyDisplay || '••••••••••••••••'}
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-300 flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-400" />
                보안 보관 중
              </span>
            </div>
          )}

          {/* 보안 안내 배너 */}
          <div className="p-2.5 rounded-lg bg-[#142318] border border-emerald-900/60 text-[11px] text-emerald-300/90 leading-relaxed flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-emerald-200">인증키 보안 마스킹 정책:</span>
              <p className="text-[10.5px] text-emerald-300/80 mt-0.5">
                API 키는 브라우저 내부 스토리지에 암호화 보관되며, 화면에 절대 평문으로 노출되지
                않습니다. 변경을 원하실 때만 새 키를 아래 입력란에 입력해 주세요.
              </p>
            </div>
          </div>

          {/* 키 입력 폼 (기본 password 타입으로 마스킹) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-300">
                {hasStoredKey ? '새 인증키로 변경 입력' : 'V-World API 인증키 입력'}
              </label>
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
              >
                {showKey ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>가리기</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>입력값 확인</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  hasStoredKey
                    ? '새로운 인증키 입력 (기존 키 유지 시 비워두세요)'
                    : '발급받으신 V-World API 인증키를 붙여넣으세요'
                }
                className="w-full bg-[#0a0f0b] border border-[#243628] focus:border-emerald-500 rounded-lg px-3 py-2.5 text-xs font-mono text-white focus:outline-none placeholder-slate-600 transition-colors pr-10"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <Key className="w-4 h-4" />
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-tight">
              ※ 국토교통부 브이월드(Data 2.0) API 키 형식: 36자리 UUID 형식
            </p>
          </div>

          {/* 테스트 결과 피드백 */}
          {testResult && (
            <div
              className={`p-2.5 rounded-lg border text-[11px] leading-snug flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-600 text-rose-200'
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

          {/* 무료 발급 바로가기 */}
          <div className="pt-1 flex items-center justify-between text-[10.5px] text-slate-400">
            <span>인증키가 필요하신가요?</span>
            <a
              href="https://www.vworld.kr/dtmk/dtmk_ntads_s001.do"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>브이월드 인증키 무료 발급</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="p-3 border-t border-[#1f2d23] bg-[#0c140e] flex items-center justify-between">
          {hasStoredKey ? (
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-all font-medium"
              title="저장된 인증키를 완전히 삭제하고 초기화"
            >
              인증키 삭제 / 초기화
            </button>
          ) : (
            <div />
          )}

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
              <span>{isTesting ? '연결 확인 중...' : '확인 및 저장'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
