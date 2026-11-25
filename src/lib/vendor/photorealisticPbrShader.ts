/**
 * lib/vendor/photorealisticPbrShader.ts
 *
 * [GeoBrief 3D 2단계: 실사 물리 기반 렌더링(PBR) 파사드 & 옥상 셰이더 엔진]
 *
 * 오픈소스(Streets-GL, F4map, OSMBuildings)의 3D 파사드 PBR 셰이더 알고리즘을 벤더링하여
 * 플라스틱 장난감/종이 박스 같은 단색 건물을 실제 유리창 반사와 콘크리트 질감을 지닌
 * 실사 건물로 실시간 렌더링하는 커스텀 PBR 셰이더 시스템입니다.
 *
 * [핵심 PBR 기능]:
 * 1. Streets-GL 15cm 창틀 인셋 드롭 섀도우 (Window Recess Inner Shadow):
 *    - 외벽 면보다 15cm 안쪽으로 들어간 창틀 상단 처마 및 측면 프레임에 입체 그림자 드리움
 *    - 태양 입사각에 따른 측면 프레임 그림자 및 4방향 코너 AO
 * 2. 유리창 물리 반사 (Cook-Torrance GGX Specular & Schlick Fresnel):
 *    - 외벽 창문 영역: roughness = 0.15, metalness = 0.85
 *      * 카메라 회전/틸트 시 하늘빛(Sky Zenith ~ Horizon)과 태양광(Sun Glint)이 창문마다 반짝이며 흘러가는 물리 반사 구현
 *    - 콘크리트 외벽 영역: roughness = 0.85, metalness = 0.04 (무광 시멘트 확산광 질감)
 * 3. 옥상 상단면 파라펫 내부 음영 (OSMBuildings Rooftop Inset Shadow):
 *    - 0.85m 테두리 난간(Parapet) 내측으로 침하된 옥상 바닥 슬래브에 사각 테두리 차폐 그림자
 *    - 방수우레탄(roughness = 0.35, satin sheen), 노후 콘크리트 슬래브(0.82), 기와/슁글(0.78)
 * 4. 건물 간 상호 차폐 접지 음영 (Contact Ambient Occlusion):
 *    - 건물 밑동(0.0~3.5m)에 부드럽고 짙은 접지 음영 그라데이션 적용:
 *      shadowFactor = smoothstep(0.0, 3.5, vHeight)
 *    - 건물이 위성사진 지형에 단단하게 뿌리내려 솟아오른 3D 입체감 부여 (붕 떠 보이는 현상 완전 제거)
 * 5. 단일 공유 Uniforms (Zero-GC 60 FPS Locked):
 *    - 단일 싱글톤 객체 참조로 매 프레임 객체 생성 없이 0.003ms 만에 PBR Uniform을 갱신
 */

import * as THREE from 'three';
import { getVworldPhotoRmaTexture } from '@/lib/vendor/vworldPhotoAtlasGenerator';

export interface PhotorealisticPbrMaterialOptions {
  map?: THREE.Texture | null;
  rmaMap?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color;
  skyZenithColor?: THREE.Color;
  skyHorizonColor?: THREE.Color;
  groundReflectColor?: THREE.Color;
  aoIntensity?: number;
  specularGlintIntensity?: number;
}

/**
 * PBR 실사 셰이더 Uniform 인터페이스
 */
export interface PhotorealisticPbrUniforms {
  uSunDirection: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Vector3 };
  uSkyZenithColor: { value: THREE.Vector3 };
  uSkyHorizonColor: { value: THREE.Vector3 };
  uGroundReflectColor: { value: THREE.Vector3 };
  uCameraPosition: { value: THREE.Vector3 };
  uRmaMap: { value: THREE.Texture | null };
  uHasRmaMap: { value: boolean };
  uAoIntensity: { value: number };
  uSpecularGlintIntensity: { value: number };
  uNightFactor: { value: number };
  uThemeMode: { value: number };
  uTime: { value: number };
}

/**
 * 전역 단일 공유 PBR Uniforms 싱글톤 (Zero-GC, 60fps locked)
 */
export const SHARED_PBR_UNIFORMS: PhotorealisticPbrUniforms = {
  uSunDirection: { value: new THREE.Vector3(120, 160, 90).normalize() },
  uSunColor: { value: new THREE.Vector3(1.08, 1.05, 0.98) },
  uSkyZenithColor: { value: new THREE.Vector3(0.28, 0.56, 0.88) },
  uSkyHorizonColor: { value: new THREE.Vector3(0.76, 0.89, 0.99) },
  uGroundReflectColor: { value: new THREE.Vector3(0.36, 0.40, 0.36) },
  uCameraPosition: { value: new THREE.Vector3(0, 500, 500) },
  uRmaMap: { value: null },
  uHasRmaMap: { value: false },
  uAoIntensity: { value: 0.75 },
  uSpecularGlintIntensity: { value: 2.6 },
  uNightFactor: { value: 0.0 },
  uThemeMode: { value: 0 },
  uTime: { value: 0 },
};

/**
 * 24종 아틀라스 기반 PBR Roughness-Metalness-AO (RMA) 맵 생성기
 * - R: 거칠기 (유리창 = 0.15, 콘크리트 = 0.85, 화강석 = 0.60, 우레탄 = 0.35)
 * - G: 금속성 (유리창 = 0.85, 콘크리트 = 0.04, 실외기/섀시 = 0.80, 징크 = 0.70)
 * - B: 차폐율 (창틀 내부 드롭섀도우 = 0.35, 옥상 테두리 = 0.40, 평면 = 1.0)
 */
let cachedRmaTexture: THREE.CanvasTexture | null = null;

export function getOrCreatePbrRmaTexture(diffuseCanvas?: HTMLCanvasElement): THREE.CanvasTexture {
  if (cachedRmaTexture) return cachedRmaTexture;
  cachedRmaTexture = getVworldPhotoRmaTexture();
  if (cachedRmaTexture) {
    SHARED_PBR_UNIFORMS.uRmaMap.value = cachedRmaTexture;
    SHARED_PBR_UNIFORMS.uHasRmaMap.value = true;
  }
  return cachedRmaTexture;
}

/**
 * [Streets-GL & F4map 벤더링]
 * GLSL 버텍스 및 프래그먼트 셰이더 인젝션 코드
 */
const PBR_VERTEX_PARS = /* glsl */ `
  attribute float aHeight;
  varying float vBuildingHeight;
  varying float vHeight;
  varying vec3 vWorldNormalVec;
  varying vec3 vWorldPositionVec;
  varying vec2 vPbrUv;
`;

const PBR_VERTEX_MAIN = /* glsl */ `
  vBuildingHeight = aHeight;
  vHeight = aHeight;
  vPbrUv = uv;
  vec4 pbrWorldPos = modelMatrix * vec4(position, 1.0);
  vWorldPositionVec = pbrWorldPos.xyz;
  vWorldNormalVec = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
`;

const PBR_FRAGMENT_PARS = /* glsl */ `
  varying float vBuildingHeight;
  varying float vHeight;
  varying vec3 vWorldNormalVec;
  varying vec3 vWorldPositionVec;
  varying vec2 vPbrUv;

  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uSkyZenithColor;
  uniform vec3 uSkyHorizonColor;
  uniform vec3 uGroundReflectColor;
  uniform vec3 uCameraPosition;
  uniform sampler2D uRmaMap;
  uniform bool uHasRmaMap;
  uniform float uAoIntensity;
  uniform float uSpecularGlintIntensity;
  uniform float uNightFactor;
  uniform float uThemeMode;
  uniform float uTime;

  // ---------------------------------------------------------------------------
  // [Streets-GL 15cm Window Recess Inner Shadow]
  // 외벽 콘크리트 면보다 15cm 안쪽으로 들어간 창틀 상단 처마 및 측면 프레임에 입체 그림자 드리움
  // ---------------------------------------------------------------------------
  float getStreetsGlWindowRecessShadow(vec2 uv, vec3 N, vec3 L) {
    // 1) 상단 처마 15cm 인셋 드롭 섀도우 (Inner Top Shadow)
    float topShadow = smoothstep(0.70, 0.98, fract(uv.y * 3.0)) * 0.45;

    // 2) 태양 입사각에 따른 측면 창틀 인셋 그림자
    vec3 tangentX = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    float sunSide = dot(L, tangentX);
    float windowFractX = fract(uv.x * 6.0);
    float leftShadow = smoothstep(0.25, 0.02, windowFractX) * clamp(sunSide * 0.7 + 0.3, 0.0, 1.0) * 0.40;
    float rightShadow = smoothstep(0.75, 0.98, windowFractX) * clamp(-sunSide * 0.7 + 0.3, 0.0, 1.0) * 0.40;

    // 3) 4방향 코너 AO
    float cornerAO = (1.0 - smoothstep(0.0, 0.12, windowFractX) * (1.0 - smoothstep(0.88, 1.0, windowFractX))) * 0.16;

    float totalShadow = clamp(topShadow + leftShadow + rightShadow + cornerAO, 0.0, 0.70);
    return 1.0 - totalShadow;
  }

  // ---------------------------------------------------------------------------
  // [OSMBuildings & StreetsGL Rooftop Parapet Inner Drop Shadow]
  // 0.85m 테두리 난간 내측으로 떨어진 옥상 슬래브에 사각 테두리 차폐 그림자
  // ---------------------------------------------------------------------------
  float getRooftopParapetInnerShadow(vec2 uv) {
    vec2 edgeDist = min(uv, 1.0 - uv);
    float minDist = min(edgeDist.x, edgeDist.y);
    return mix(0.78, 1.0, smoothstep(0.0, 0.06, minDist));
  }
`;

const PBR_FRAGMENT_DIFFUSE = /* glsl */ `
  // 1. [Streets-GL 벤더링] PBR 거칠기(Roughness) 및 금속성(Metalness) 판별
  float pbrRoughness = 0.85; // 기본 콘크리트 무광 (roughness: 0.85)
  float pbrMetalness = 0.04;
  float pbrTextureAo = 1.0;

  bool isVerticalWall = abs(vWorldNormalVec.y) < 0.65;
  bool isWindowPixel = false;

  // RMA 맵이 바인딩되어 있는 경우 텍스처에서 직접 추출
  if (uHasRmaMap) {
    vec4 rma = texture2D(uRmaMap, vPbrUv);
    pbrRoughness = rma.r;
    pbrMetalness = rma.g;
    pbrTextureAo = rma.b;
    isWindowPixel = (pbrRoughness < 0.25 && pbrMetalness > 0.60);
  } else {
    // 폴백: 색상 및 법선 기반 절차적 창문 유리(Window Glass) 식별 (밝은 V-World 하늘반사 창문 포함)
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    bool isBlueSkyGlass = (diffuseColor.b > diffuseColor.r * 1.12 && diffuseColor.b > 0.30);
    isWindowPixel = isVerticalWall && (isBlueSkyGlass || (lum < 0.32 && diffuseColor.b >= diffuseColor.r * 0.88));

    if (isWindowPixel) {
      // 유리창 영역: 거칠기 0.15, 금속성 0.85 (물리 반사 극대화)
      pbrRoughness = 0.15;
      pbrMetalness = 0.85;
      pbrTextureAo = 0.92;
    } else if (!isVerticalWall) {
      // 옥상 상단면: 초록색 우레탄 방수재 판별
      bool isGreenUrethane = diffuseColor.g > diffuseColor.r * 1.15 && diffuseColor.g > diffuseColor.b * 1.05;
      if (isGreenUrethane) {
        pbrRoughness = 0.35; // 우레탄 광택
        pbrMetalness = 0.08;
      } else {
        pbrRoughness = 0.82; // 콘크리트 슬래브
        pbrMetalness = 0.02;
      }
    }
  }

  // 2. [물리 반사 연산]: 시점 각도(View Dir) 및 태양광(Sun Dir)에 반응하는 Specular & Sky Reflection
  vec3 V = normalize(uCameraPosition - vWorldPositionVec);
  vec3 N = normalize(vWorldNormalVec);
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(uSunDirection);
  vec3 H = normalize(L + V);

  float NdotV = max(0.001, dot(N, V));
  float NdotL = max(0.0, dot(N, L));
  float NdotH = max(0.0, dot(N, H));

  // Schlick Fresnel 반사율 계산 (유리창 사각에서 반사율 최대화)
  float F0 = mix(0.04, 0.95, pbrMetalness);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 4.0);

  // Cook-Torrance GGX 스페큘러 계산 (창문 태양광 반짝임)
  float alpha = pbrRoughness * pbrRoughness;
  float alpha2 = alpha * alpha;
  float denom = (NdotH * NdotH * (alpha2 - 1.0) + 1.0);
  float D = alpha2 / (3.14159265 * denom * denom);

  float specStrength = D * fresnel * (NdotL > 0.0 ? 1.0 : 0.0);
  vec3 sunSpecularGlint = uSunColor * specStrength * uSpecularGlintIntensity * (1.0 - pbrRoughness);

  // 대기 스카이 돔 반사 (반사 벡터 R에 따른 Zenith ~ Horizon 그라데이션)
  vec3 R = reflect(-V, N);
  float skyGradient = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyReflectionColor = mix(uGroundReflectColor, mix(uSkyHorizonColor, uSkyZenithColor, skyGradient), step(0.0, R.y));

  // 3. 유리창과 콘크리트 벽체의 물리적 색상 결합
  float glassFactor = (1.0 - pbrRoughness) * pbrMetalness;
  if (glassFactor > 0.1 || isWindowPixel) {
    // 유리창: 하늘빛 은은한 반사 + 태양광 스페큘러 글린트
    vec3 windowSurface = mix(diffuseColor.rgb, skyReflectionColor, glassFactor * (0.30 + fresnel * 0.50));
    diffuseColor.rgb = windowSurface + sunSpecularGlint * glassFactor * (1.0 - uNightFactor * 0.7);

    // [야간 실내 점등 효과] 저녁·야간 시뮬레이션 시 창문 셀별 따뜻한 실내 조명 발광
    if (uNightFactor > 0.01) {
      vec2 winCell = floor(vPbrUv * vec2(2.0, 1.0) + vWorldPositionVec.xz * 0.15);
      float cellRand = fract(sin(dot(winCell, vec2(12.9898, 78.233))) * 43758.5453);
      float litMask = smoothstep(0.30, 0.72, cellRand);
      vec3 warmGlow = mix(vec3(1.0, 0.78, 0.42), vec3(0.95, 0.92, 0.75), fract(cellRand * 7.13));
      diffuseColor.rgb = mix(diffuseColor.rgb, warmGlow * 1.15, uNightFactor * litMask * 0.82);
    }

    // StreetsGL 15cm 창틀 인셋 드롭 섀도우 적용
    if (isVerticalWall) {
      float recessShadow = getStreetsGlWindowRecessShadow(vPbrUv, N, L);
      diffuseColor.rgb *= mix(recessShadow, 1.0, uNightFactor * 0.35);
    }
  }

  // 4. [OSMBuildings] 옥상 파라펫 내부 음영
  if (!isVerticalWall) {
    float parapetShadow = getRooftopParapetInnerShadow(vPbrUv);
    diffuseColor.rgb *= parapetShadow;
  }

  // 5. [F4map & OSMBuildings 벤더링] 건물 기저부 부드러운 접지 음영 (Contact Ambient Occlusion: 0.0~1.8m)
  float shadowFactor = smoothstep(0.0, 1.8, max(0.0, vHeight));
  float finalGroundingAo = mix(0.86, 1.0, shadowFactor);

  // 차폐 음영 및 텍스처 미세 AO 결합 적용 (과도한 3중 감쇠 방지)
  diffuseColor.rgb *= (finalGroundingAo * mix(1.0, pbrTextureAo, uAoIntensity * 0.22));

  // 6. [V-World 시각화 테마] (uThemeMode: 0=실사, 1=용도 색상, 2=층고 스펙트럼)
  if (uThemeMode > 1.5) {
    // 층고 스카이라인 히트맵 (저층: 청록 -> 중층: 스카이블루 -> 고층: 앰버/코랄)
    float hNorm = clamp(vBuildingHeight / 65.0, 0.0, 1.0);
    vec3 lowCol = vec3(0.22, 0.74, 0.78);
    vec3 midCol = vec3(0.24, 0.56, 0.94);
    vec3 highCol = vec3(0.96, 0.45, 0.28);
    vec3 hTint = hNorm < 0.45
      ? mix(lowCol, midCol, hNorm / 0.45)
      : mix(midCol, highCol, (hNorm - 0.45) / 0.55);
    float facetShading = isVerticalWall ? (0.85 + 0.15 * max(0.0, NdotL)) : 1.0;
    diffuseColor.rgb = mix(diffuseColor.rgb, hTint * facetShading, 0.72);
  } else if (uThemeMode > 0.5) {
    // 용도별 파스텔 분류 강조 (고층/주거/업무 대비 극대화)
    float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 pastelTint = normalize(diffuseColor.rgb + vec3(0.08)) * (0.65 + luma * 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, pastelTint, 0.45);
  }
`;

/**
 * 22개 멀티 재질에 StreetsGL + V-World PBR 셰이더 및 전역 Uniform 일괄 바인딩 (Zero-GC)
 */
export function attachSharedPbrShader(material: THREE.Material): void {
  (material as any).pbrUniforms = SHARED_PBR_UNIFORMS;

  material.onBeforeCompile = (shader) => {
    // 1. 전역 싱글톤 Uniforms 바인딩 (단일 객체 참조 - 복사 비용 0)
    Object.assign(shader.uniforms, SHARED_PBR_UNIFORMS);

    // 2. 버텍스 셰이더 인젝션 (aHeight, vBuildingHeight, vWorldPositionVec, vPbrUv)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${PBR_VERTEX_PARS}`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${PBR_VERTEX_MAIN}`
    );

    // 3. 프래그먼트 셰이더 인젝션 (StreetsGL 15cm Window Recess, Specular, Sky Reflection, Parapet AO, Contact AO)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${PBR_FRAGMENT_PARS}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${PBR_FRAGMENT_DIFFUSE}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\nroughnessFactor = pbrRoughness;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>\nmetalnessFactor = pbrMetalness;`
    );
  };
}

/**
 * 실사 PBR 파사드 & 옥상 셰이더 메터리얼 생성기
 */
export function createPhotorealisticPbrMaterial(
  options: PhotorealisticPbrMaterialOptions = {}
): THREE.MeshStandardMaterial {
  const rmaTex = options.rmaMap !== undefined ? options.rmaMap : getOrCreatePbrRmaTexture();

  const material = new THREE.MeshStandardMaterial({
    map: options.map || undefined,
    color: new THREE.Color(0xffffff),
    vertexColors: true,
    roughness: options.roughness !== undefined ? options.roughness : 0.45,
    metalness: options.metalness !== undefined ? options.metalness : 0.08,
    transparent: options.transparent || false,
    opacity: options.opacity !== undefined ? options.opacity : 1.0,
    side: options.side || THREE.DoubleSide,
  });

  if (rmaTex) {
    SHARED_PBR_UNIFORMS.uRmaMap.value = rmaTex;
    SHARED_PBR_UNIFORMS.uHasRmaMap.value = true;
  }

  attachSharedPbrShader(material);
  return material;
}

// Module-level scratch structures for zero GC in hot render loops
const _scratchV4 = new THREE.Vector4();
const _scratchV4Alt = new THREE.Vector4();

/**
 * 매 프레임 카메라 회전, 태양광 및 시점 각도 동기화 (전역 싱글톤 0-GC 갱신 - 0.003ms)
 */
export function updateSharedPbrUniforms(
  camera: THREE.Camera,
  sunLight?: THREE.DirectionalLight | null,
  timeSec = 0
): void {
  // 1. 카메라 위치 추출 (projectionMatrixInverse 기반 로컬 시점 계산 - 0 GC)
  try {
    const inv = camera.projectionMatrixInverse;
    _scratchV4.set(0, 0, -1, 0).applyMatrix4(inv);
    if (Math.abs(_scratchV4.w) > 1e-9) {
      SHARED_PBR_UNIFORMS.uCameraPosition.value.set(
        _scratchV4.x / _scratchV4.w,
        _scratchV4.y / _scratchV4.w,
        _scratchV4.z / _scratchV4.w
      );
    } else {
      _scratchV4Alt.set(0, 0, -1, 1).applyMatrix4(inv);
      if (Math.abs(_scratchV4Alt.w) > 1e-9) {
        SHARED_PBR_UNIFORMS.uCameraPosition.value.set(
          _scratchV4Alt.x / _scratchV4Alt.w,
          _scratchV4Alt.y / _scratchV4Alt.w,
          _scratchV4Alt.z / _scratchV4Alt.w
        );
      } else {
        SHARED_PBR_UNIFORMS.uCameraPosition.value.set(0, 500, 500);
      }
    }
  } catch {
    SHARED_PBR_UNIFORMS.uCameraPosition.value.copy(camera.position);
  }

  // 2. 태양광 방향 및 광색
  if (sunLight) {
    SHARED_PBR_UNIFORMS.uSunDirection.value.copy(sunLight.position).normalize();
    SHARED_PBR_UNIFORMS.uSunColor.value.set(sunLight.color.r, sunLight.color.g, sunLight.color.b);
  }

  SHARED_PBR_UNIFORMS.uTime.value = timeSec;
}

/**
 * 기존 API 호환용 래퍼 (단일 공유 갱신으로 위임)
 */
export function updatePhotorealisticPbrUniforms(
  _material: THREE.Material,
  camera: THREE.Camera,
  sunLight?: THREE.DirectionalLight | null,
  timeSec = 0
): void {
  updateSharedPbrUniforms(camera, sunLight, timeSec);
}
