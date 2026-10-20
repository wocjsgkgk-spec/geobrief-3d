/**
 * utils/urlHelper.ts
 *
 * 상대 경로(/api/...)와 절대 경로(http://, https://)를 안전하게 정규화하여
 * Node.js fetch 및 URL 생성자에서 발생하는 'Failed to parse URL' 에러를 방지합니다.
 */

export function resolveFullUrl(inputUrl: string, baseOrigin?: string): string {
  if (!inputUrl || typeof inputUrl !== 'string') return '';
  const trimmed = inputUrl.trim();
  if (!trimmed) return '';

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  let base = baseOrigin;
  if (!base) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      base = window.location.origin;
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      base = process.env.NEXT_PUBLIC_APP_URL;
    } else if (process.env.VERCEL_URL) {
      base = `https://${process.env.VERCEL_URL}`;
    } else {
      base = 'http://localhost:3000';
    }
  }

  try {
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return new URL(path, base).toString();
  } catch {
    return trimmed;
  }
}
