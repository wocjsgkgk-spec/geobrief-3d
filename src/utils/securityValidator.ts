/**
 * Security Validator & SSRF Guard Module
 * ----------------------------------------------------------------------------
 * Enforces strict URL validation, domain whitelisting, and SSRF prevention
 * for all server-side proxy routes and external data loaders.
 * Complies with NVIDIA SkillSpector and OWASP Top 10 API Security standards.
 */

// 허용된 외부 업스트림 도메인 화이트리스트
export const ALLOWED_UPSTREAM_DOMAINS: readonly string[] = Object.freeze([
  'api.vworld.kr',
  'xdworld.vworld.kr',
  'map.vworld.kr',
  'apis.data.go.kr',
  'overpass-api.de',
  'kumi.systems',
  'server.arcgisonline.com',
  'tile.openstreetmap.org',
  'tile.googleapis.com',
  'api.cesium.com',
]);

// 차단 대상 사설망 IP 및 로컬호스트 패턴 (SSRF 차단)
const BLOCKED_IP_PATTERNS = [
  /^127\./,                         // Loopback
  /^10\./,                          // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,                    // Private Class C
  /^169\.254\./,                    // Link-local / Cloud Metadata (AWS/GCP/Azure)
  /^0\./,                           // Current network
  /^::1$/,                          // IPv6 loopback
  /^fc00:/i,                        // IPv6 Unique Local
  /^fe80:/i,                        // IPv6 Link-local
  /^localhost$/i,                   // Localhost
];

export interface ValidationResult {
  valid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Validate that a URL belongs strictly to the allowed upstream domain whitelist
 * and does not point to internal networks, private IPs, or cloud metadata services.
 */
export function validateUpstreamUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Empty or invalid URL provided.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Malformed URL format.' };
  }

  // 1. 프로토콜 검증: 반드시 http 또는 https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `Forbidden protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`,
    };
  }

  // 2. 인증 정보(Username/Password) 임베딩 차단
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'Embedded userinfo/credentials in URL are strictly prohibited.',
    };
  }

  // 3. 비정상 포트 차단 (기본 80, 443 또는 빈 포트만 허용)
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    return {
      valid: false,
      error: `Disallowed port "${parsed.port}". Only default ports (80/443) are allowed.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 4. 사설망 IP 및 로컬호스트 차단 (SSRF 공격 차단)
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: `SSRF Violation: Target host "${hostname}" is a private or restricted network address.`,
      };
    }
  }

  // 5. 화이트리스트 도메인 매칭 검증
  const isAllowed = ALLOWED_UPSTREAM_DOMAINS.some((allowedDomain) => {
    return hostname === allowedDomain || hostname.endsWith('.' + allowedDomain);
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `Domain "${hostname}" is not in the approved upstream domain whitelist.`,
    };
  }

  return {
    valid: true,
    sanitizedUrl: parsed.toString(),
  };
}

/**
 * Ensure an input URL is safe; throws an error if it fails validation.
 */
export function assertSafeUpstreamUrl(rawUrl: string): string {
  const result = validateUpstreamUrl(rawUrl);
  if (!result.valid || !result.sanitizedUrl) {
    throw new Error(result.error || 'URL validation failed.');
  }
  return result.sanitizedUrl;
}
