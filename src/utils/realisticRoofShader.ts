/**
 * utils/realisticRoofShader.ts
 *
 * [GeoBrief 3D 1단계: 위성 영상 기반 지붕 색감 동기화 및 실사 건축 디테일 심화 엔진]
 *
 * 1) 옥상 표면 다층 레이어링 (Multi-layered Rooftop Weathering):
 *    - 중앙부: 미세 콘크리트 얼룩(Perlin Noise Grime) 및 방수 코팅 톤 변화(우레탄/콘크리트 노후화 패치)
 *    - 테두리(0.8m 구간): 빗물 배수로 라인(Gutter Trench) 및 짙은 구석 그림자(Corner Ambient Occlusion)
 * 2) 한국형 옥상 부속물 셰이딩 및 텍스처 아틀라스 보조:
 *    - 엘리베이터 권상기실(옥탑방) 철제 출입문 및 환기 루버 갤러리창
 *    - STS 원통형/사각 물탱크 금속 반사 및 태양광 패널 모듈 텍스처
 * 3) 기준층 창호 스페큘러 하이라이트(Specular Highlight) 동적 반사:
 *    - 창문별 반사율(Roughness / Specular Power 32~128) 무작위 분산으로 카메라 회전 시 유기적 반사광
 * 4) 1층 기단부(0m ~ 3.8m) 쇼윈도·간판 밴드 및 필로티/공동현관 화강석 마감
 * 5) 최상층 처마/두겁석(0.4m Cornice) 선명한 마감선
 */

import * as THREE from 'three';

/**
 * GLSL 청크: 옥상 실사 웨더링, 빗물 배수로(Gutter), 코너 AO 및 창호 스페큘러 계산
 */
export const realisticRoofGlslChunk = /* glsl */ `
  // ---------------------------------------------------------------------------
  // [1. 절차적 2D 노이즈 및 FBM 웨더링 얼룩 (Perlin Grime)]
  // ---------------------------------------------------------------------------
  float roofHash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float roofNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(roofHash21(i + vec2(0.0, 0.0)), roofHash21(i + vec2(1.0, 0.0)), u.x),
      mix(roofHash21(i + vec2(0.0, 1.0)), roofHash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float roofFbmGrime(vec2 p) {
    float v = 0.0;
    v += 0.5000 * roofNoise2D(p * 0.18);
    v += 0.2500 * roofNoise2D(p * 0.42);
    v += 0.1250 * roofNoise2D(p * 1.10);
    return v;
  }

  // ---------------------------------------------------------------------------
  // [2. 옥상 중앙부 방수 코팅 톤 변화 및 세월 흔적 콘크리트 얼룩]
  // ---------------------------------------------------------------------------
  vec3 applyRealisticRoofAging(vec3 baseColor, vec2 worldXz, float seed) {
    // 미세 콘크리트 얼룩 및 풍화 자국
    float grime = roofFbmGrime(worldXz + vec2(seed * 23.1, seed * 47.9));
    
    // 방수 코팅 보수 패치 (대형 얼룩 톤 분할)
    float patch = roofNoise2D(worldXz * 0.06 + vec2(seed * 11.5, seed * 19.3));
    float isPatched = smoothstep(0.40, 0.65, patch);

    // 톤 변화: 노후화된 곳은 채도 감쇄 및 명암 대비 부여
    vec3 weatheredColor = mix(baseColor * 0.84, baseColor * 1.08, grime);
    weatheredColor = mix(weatheredColor, baseColor * 0.92, isPatched * 0.25);

    // 미세한 빗물 물때 흔적 (Water Leakage / Streaks)
    float rainStreak = sin((worldXz.x + worldXz.y) * 1.8 + grime * 4.0) * 0.5 + 0.5;
    weatheredColor *= mix(0.94, 1.0, rainStreak);

    return weatheredColor;
  }

  // ---------------------------------------------------------------------------
  // [3. 옥상 테두리(0.8m 구간) 빗물 배수로 라인 & 구석 그림자(Corner AO)]
  // ---------------------------------------------------------------------------
  float getRoofCornerAO(float distToEdge, float borderMeters) {
    // 0.8m 난간 바로 안쪽 구간
    float t = clamp(distToEdge / borderMeters, 0.0, 1.0);
    // 구석으로 갈수록 급격히 어두워지는 AO 곡선 (0.35 ~ 1.0)
    float cornerAO = mix(0.38, 1.0, pow(t, 0.65));

    // 배수로 홈 라인 (난간 안쪽 0.45m ~ 0.65m 지점의 짙은 음영)
    float gutterCenter = 0.55;
    float gutterWidth = 0.12;
    float inGutter = 1.0 - smoothstep(0.0, gutterWidth, abs(distToEdge - gutterCenter));
    cornerAO *= mix(1.0, 0.62, inGutter);

    return cornerAO;
  }

  // ---------------------------------------------------------------------------
  // [4. 기준층 유리창 가변 스페큘러 하이라이트 (Dynamic Specular Reflection)]
  // ---------------------------------------------------------------------------
  vec3 getWindowDynamicSpecular(
    vec3 sunColor,
    vec3 N,
    vec3 L,
    vec3 V,
    vec3 worldPos,
    float floorIdx,
    float bayIdx
  ) {
    vec3 H = normalize(L + V);
    float NdotH = max(0.0, dot(N, H));

    // 세대/층/창문별 고유 난수 시드
    float winSeed = fract(sin(dot(floor(vec2(worldPos.x * 0.4 + worldPos.z * 0.4, floorIdx)), vec2(12.9898, 78.233)) + bayIdx * 17.13) * 43758.5453);

    // 복층유리 제작 공차 및 커튼 블라인드에 의한 반사율(Roughness) 분산
    float specPower = mix(28.0, 140.0, winSeed);
    float specIntensity = mix(0.60, 1.45, fract(winSeed * 9.21));

    // 반짝이는 스페큘러 하이라이트
    return sunColor * pow(NdotH, specPower) * specIntensity;
  }
`;

/**
 * Canvas 아틀라스 옥상 타일에 0.8m 배수로 및 풍화 얼룩을 그리는 고해상도 렌더러
 */
export function drawRealisticRoofCanvasTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  type: 'concrete' | 'asphalt' | 'terracotta' | 'urethane' | 'zinc'
): void {
  ctx.save();

  // 1. 기본 색상 그라데이션
  let baseColor1 = '#78716c';
  let baseColor2 = '#57534e';
  let isUrethane = false;

  if (type === 'concrete') {
    baseColor1 = '#78716c';
    baseColor2 = '#57534e';
  } else if (type === 'asphalt') {
    baseColor1 = '#334155';
    baseColor2 = '#1e293b';
  } else if (type === 'terracotta') {
    baseColor1 = '#853726';
    baseColor2 = '#6b2d1f';
  } else if (type === 'urethane') {
    baseColor1 = '#4a6b5e';
    baseColor2 = '#2d3f38';
    isUrethane = true;
  } else if (type === 'zinc') {
    baseColor1 = '#3d566e';
    baseColor2 = '#223344';
  }

  const grad = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.1, x + w * 0.5, y + h * 0.5, w * 0.7);
  grad.addColorStop(0, baseColor1);
  grad.addColorStop(1, baseColor2);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 2. 세월의 흔적: 불규칙한 콘크리트 얼룩 및 방수 도막 보수 패치
  const numPatches = isUrethane ? 6 : 4;
  for (let i = 0; i < numPatches; i++) {
    const px = x + ((i * 73 + 19) % Math.round(w * 0.7)) + w * 0.1;
    const py = y + ((i * 59 + 31) % Math.round(h * 0.7)) + h * 0.1;
    const pr = 24 + (i * 17) % 36;
    const patchGrad = ctx.createRadialGradient(px, py, 4, px, py, pr);
    patchGrad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
    patchGrad.addColorStop(0.7, 'rgba(30, 41, 59, 0.10)');
    patchGrad.addColorStop(1, 'rgba(30, 41, 59, 0.0)');
    ctx.fillStyle = patchGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. 팽창 줄눈 (Expansion Joint Grid)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
  const step = 42;
  for (let px = x; px < x + w; px += step) {
    ctx.fillRect(px, y, 2, h);
  }
  for (let py = y; py < y + h; py += step) {
    ctx.fillRect(x, py, w, 2);
  }

  // 4. [테두리 0.8m 구간]: 빗물 배수로 라인 & 짙은 구석 그림자 (Corner AO)
  const gutterBand = 24; // 픽셀 단위 0.8m 스케일
  // 코너 드롭 섀도우
  const topShadow = ctx.createLinearGradient(x, y, x, y + gutterBand);
  topShadow.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  topShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = topShadow;
  ctx.fillRect(x, y, w, gutterBand);

  const bottomShadow = ctx.createLinearGradient(x, y + h, x, y + h - gutterBand);
  bottomShadow.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  bottomShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = bottomShadow;
  ctx.fillRect(x, y + h - gutterBand, w, gutterBand);

  const leftShadow = ctx.createLinearGradient(x, y, x + gutterBand, y);
  leftShadow.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  leftShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = leftShadow;
  ctx.fillRect(x, y, gutterBand, h);

  const rightShadow = ctx.createLinearGradient(x + w, y, x + w - gutterBand, y);
  rightShadow.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  rightShadow.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = rightShadow;
  ctx.fillRect(x + w - gutterBand, y, gutterBand, h);

  // 빗물 배수로 트렌치 홈 (Dark Gutter Line)
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);

  // 5. 모서리 우수 배수구 (Drain Strainer)
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.arc(x + 22, y + 22, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 6. 노이즈 그레인 (Weathering Grime)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
  for (let py = y; py < y + h; py += 10) {
    for (let px = x; px < x + w; px += 14) {
      if ((px * 3 + py * 7) % 11 === 0) {
        ctx.fillRect(px, py, 3, 2);
      }
    }
  }

  ctx.restore();
}
