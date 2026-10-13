'use client';

import React, { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[GeoBrief 3D Critical Root Layout Exception Caught by global-error.tsx]:', error);
  }, [error]);

  const handleHardRefresh = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <html lang="ko">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#070b09', fontFamily: 'monospace', color: '#e2e8f0' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '640px', width: '100%', backgroundColor: '#0e1612', border: '2px solid #ef4444', borderRadius: '16px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '28px' }}>🚨</div>
              <div>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                  GeoBrief 3D 루트 렌더링 예외
                </h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  최상위 루트 레이아웃에서 치명적 예외가 감지되었습니다.
                </p>
              </div>
            </div>

            <div style={{ backgroundColor: '#050806', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', fontSize: '12px', color: '#fca5a5', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.6', marginBottom: '24px' }}>
              <strong>{error.name ? `${error.name}: ` : ''}{error.message || '알 수 없는 클라이언트 예외가 발생했습니다.'}</strong>
              {error.stack && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                  {error.stack}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => reset()}
                style={{ flex: 1, minWidth: '140px', padding: '12px 20px', backgroundColor: '#059669', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                다시 시도 (Reset)
              </button>
              <button
                onClick={handleHardRefresh}
                style={{ flex: 1, minWidth: '180px', padding: '12px 20px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                전체 캐시 삭제 후 새로고침
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
