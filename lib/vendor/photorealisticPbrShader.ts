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
 * 1. 유리창 물리 반사 (Specular & Roughness):
 *    - 외벽 창문 영역: roughness = 0.15, metalness = 0.85
 *      * 카메라 회전/틸트 시 하늘빛(Sky Zenith ~ Horizon)과 태양광(Sun Glint)이 창문마다 반짝이며 흘러가는 물리 반사 구현
 *    - 콘크리트 외벽 영역: roughness = 0.85, metalness = 0.04 (무광 시멘트 확산광 질감)
 *    - 옥상 상단면: 방수우레탄(roughness = 0.35, satin sheen), 노후 콘크리트 슬래브(0.82), 기와/슁글(0.78)
 *
 * 2. 건물 간 상호 차폐 음영 (Contact Ambient Occlusion):
 *    - 건물 밑동 및 인접 골목길에 부드럽고 짙은 접지 음영 그라데이션 적용:
 *      shadowFactor = smoothstep(0.0, 4.0, vBuildingHeight)
 *    - 건물이 위성사진 지형에 단단하게 뿌리내려 솟아오른 3D 입체감 부여 (붕 떠 보이는 현상 완전 제거)
 *
 * 3. 24종 고해상도 포토 텍스처 아틀라스 & RMA(Roughness-Metalness-AO) 맵 완전 연동:
 *    - 한국형 아파트(아이보리 크림 #f6f3eb, 베란다 창호, 실외기 그릴, 옥상 파라펫)
 *    - 시내 상가(1층 화강석 쇼윈도, 2~5층 석재 타일, 가로형 간판 밴드)
 *    - 옥상 3대 색상비(우레탄 방수 딥그린 #32694f 40%, 노후 콘크리트 #736f68 35%, 적갈색 기와 #7c3829 25%)
 */

import * as THREE from 'three';

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
  uTime: { value: number };
}

/**
 * 24종 아틀라스 기반 PBR Roughness-Metalness-AO (RMA) 맵 생성기
 * - R: 거칠기 (유리창 = 0.15, 콘크리트 = 0.85, 화강석 = 0.60, 우레탄 = 0.35)
 * - G: 금속성 (유리창 = 0.85, 콘크리트 = 0.04, 실외기/섀시 = 0.80, 징크 = 0.70)
 * - B: 차폐율 (창틀 내부 드롭섀도우 = 0.35, 옥상 테두리 = 0.40, 평면 = 1.0)
 */
let cachedRmaTexture: THREE.CanvasTexture | null = null;

export function getOrCreatePbrRmaTexture(diffuseCanvas?: HTMLCanvasElement): THREE.CanvasTexture {
  if (cachedRmaTexture) return cachedRmaTexture;

  if (typeof document === 'undefined') {
    // SSR 환경 fallback
    const dummyCanvas = { width: 16, height: 16 } as any;
    return new THREE.CanvasTexture(dummyCanvas);
  }

  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // 1. 기본 배경 (벽체: Roughness 0.85 = 217, Metalness 0.04 = 10, AO 1.0 = 255)
  ctx.fillStyle = 'rgb(217, 10, 255)';
  ctx.fillRect(0, 0, size, size);

  // 6열 x 4행 슬롯 크기 (341 x 512)
  const cellW = Math.floor(size / 6);
  const cellH = Math.floor(size / 4);

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const slotId = row * 6 + col;
      const x = col * cellW;
      const y = row * cellH;

      if (slotId >= 0 && slotId <= 3) {
        // [아파트 전·배면 파사드]: 대형 발코니 창문 영역 RMA
        // 창문: Roughness 0.15 = 38, Metalness 0.85 = 217, AO 0.85 = 217
        const winY = y + 36;
        const winH = Math.round(cellH * 0.50);
        const winW = cellW - 40;
        const winX = x + 20;

        ctx.fillStyle = 'rgb(38, 217, 220)';
        ctx.fillRect(winX, winY, winW, winH);

        // 창틀 드롭 섀도우 AO
        ctx.fillStyle = 'rgb(180, 100, 120)';
        ctx.fillRect(winX, winY, winW, 8);
        ctx.fillRect(winX, winY, 6, winH);

        // 에어컨 실외기 루버 (금속성 0.80 = 204, 거칠기 0.35 = 89)
        const louverW = Math.round(winW * 0.30);
        const louverH = 32;
        const louverX = winX + winW - louverW - 4;
        const louverY = winY + winH - louverH - 4;
        ctx.fillStyle = 'rgb(89, 204, 180)';
        ctx.fillRect(louverX, louverY, louverW, louverH);
      } else if (slotId === 8 || slotId === 9) {
        // [상가 커튼월 & 1층 쇼윈도]: 전면 통유리 RMA
        // 커튼월/쇼윈도: Roughness 0.12 = 30, Metalness 0.90 = 230, AO 0.95 = 242
        const shopY = y + 20;
        const shopH = cellH - 40;
        const shopW = cellW - 24;
        const shopX = x + 12;

        ctx.fillStyle = 'rgb(30, 230, 242)';
        ctx.fillRect(shopX, shopY, shopW, shopH);
      } else if (slotId === 5 || slotId === 6 || slotId === 7) {
        // [중층 상업 빌딩]: 2~5층 창문 격자 RMA
        for (let fy = y + 40; fy < y + cellH - 40; fy += 90) {
          for (let fx = x + 24; fx < x + cellW - 50; fx += 80) {
            ctx.fillStyle = 'rgb(38, 217, 220)';
            ctx.fillRect(fx, fy, 55, 60);
            ctx.fillStyle = 'rgb(180, 100, 120)';
            ctx.fillRect(fx, fy, 55, 6);
          }
        }
      } else if (slotId === 10 || slotId === 11 || slotId === 12) {
        // [빌라 & 단독주택]: 아담한 주택 창문 RMA
        const wX = x + 35;
        const wY = y + 45;
        const wW = cellW - 70;
        const wH = Math.round(cellH * 0.48);
        ctx.fillStyle = 'rgb(45, 200, 220)';
        ctx.fillRect(wX, wY, wW, wH);
      } else if (slotId === 17) {
        // [옥상: 우레탄 방수 세이지/딥그린]: 약간의 광택 Satin Sheen (Roughness 0.35 = 89, Metalness 0.08 = 20)
        ctx.fillStyle = 'rgb(89, 20, 230)';
        ctx.fillRect(x, y, cellW, cellH);
        // 난간 내측 그림자 Corner AO
        ctx.fillStyle = 'rgb(120, 20, 100)';
        ctx.fillRect(x, y, cellW, 30);
        ctx.fillRect(x, y + cellH - 30, cellW, 30);
        ctx.fillRect(x, y, 30, cellH);
        ctx.fillRect(x + cellW - 30, y, 30, cellH);
      } else if (slotId === 14 || slotId === 15) {
        // [옥상: 노후 콘크리트 슬래브 & 차콜 아스팔트]: 무광 웨더링 (Roughness 0.82 = 209, Metalness 0.02 = 5)
        ctx.fillStyle = 'rgb(209, 5, 230)';
        ctx.fillRect(x, y, cellW, cellH);
        // 테두리 난간 AO
        ctx.fillStyle = 'rgb(209, 5, 95)';
        ctx.fillRect(x, y, cellW, 26);
        ctx.fillRect(x, y + cellH - 26, cellW, 26);
        ctx.fillRect(x, y, 26, cellH);
        ctx.fillRect(x + cellW - 26, y, 26, cellH);
      } else if (slotId === 16) {
        // [옥상: 적갈색 기와/슁글]: 거친 테라코타 (Roughness 0.78 = 199, Metalness 0.03 = 8)
        ctx.fillStyle = 'rgb(199, 8, 220)';
        ctx.fillRect(x, y, cellW, cellH);
      } else if (slotId === 18) {
        // [옥상: 청색 징크 강판]: 금속성 (Roughness 0.38 = 97, Metalness 0.70 = 178)
        ctx.fillStyle = 'rgb(97, 178, 240)';
        ctx.fillRect(x, y, cellW, cellH);
      } else if (slotId === 20) {
        // [옥상 옥탑/냉각탑 메탈 루버]: 금속성 0.80, 거칠기 0.35
        ctx.fillStyle = 'rgb(89, 204, 230)';
        ctx.fillRect(x, y, cellW, cellH);
      } else if (slotId === 22) {
        // [아파트 1층 필로티 현관 로비 유리창]: 거칠기 0.15, 금속성 0.85
        const winY = y + 40;
        const winH = cellH - 80;
        const winW = cellW - 50;
        const winX = x + 25;
        ctx.fillStyle = 'rgb(38, 217, 220)';
        ctx.fillRect(winX, winY, winW, winH);
      } else if (slotId === 23) {
        // [공공청사 / 군부대 막사 규격 사각 창호]: 거칠기 0.15, 금속성 0.85
        const winX = x + 24;
        const winW = cellW - 48;
        const winY = y + 36;
        const winH = Math.round(cellH * 0.50);
        ctx.fillStyle = 'rgb(38, 217, 220)';
        ctx.fillRect(winX, winY, winW, winH);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if ('colorSpace' in texture) {
    (texture as any).colorSpace = THREE.NoColorSpace; // Linear Data Texture
  }

  cachedRmaTexture = texture;
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
  uniform float uTime;
`;

const PBR_FRAGMENT_DIFFUSE = /* glsl */ `
  // 1. [Streets-GL 벤더링] PBR 거칠기(Roughness) 및 금속성(Metalness) 판별
  float pbrRoughness = 0.85; // 기본 콘크리트 무광 (roughness: 0.85)
  float pbrMetalness = 0.04;
  float pbrTextureAo = 1.0;

  // RMA 맵이 바인딩되어 있는 경우 텍스처에서 직접 추출
  if (uHasRmaMap) {
    vec4 rma = texture2D(uRmaMap, vPbrUv);
    pbrRoughness = rma.r;
    pbrMetalness = rma.g;
    pbrTextureAo = rma.b;
  } else {
    // 폴백: 색상 및 법선 기반 절차적 창문 유리(Window Glass) 식별
    // 한국 도심 건물 텍스처에서 창문은 다크 슬레이트 틴티드(#1e293b, L < 0.32)이며 벽체는 밝은 아이보리/베이지(L > 0.45)
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    bool isVerticalWall = abs(vWorldNormalVec.y) < 0.65;
    bool isWindowPixel = isVerticalWall && (lum < 0.32 && diffuseColor.b >= diffuseColor.r * 0.88);

    if (isWindowPixel) {
      // 유리창 영역: 거칠기 0.15, 금속성 0.85 (물리 반사 극대화)
      pbrRoughness = 0.15;
      pbrMetalness = 0.85;
      pbrTextureAo = 0.90;
    } else if (!isVerticalWall) {
      // 옥상 상단면: 초록색 우레탄 방수재 판별
      bool isGreenUrethane = diffuseColor.g > diffuseColor.r * 1.15 && diffuseColor.g > diffuseColor.b * 1.05;
      if (isGreenUrethane) {
        pbrRoughness = 0.35; // 우레탄 광택
        pbrMetalness = 0.08;
      } else {
        pbrRoughness = 0.82; // 노후 콘크리트 슬래브
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
  if (glassFactor > 0.1) {
    // 유리창: 하늘빛 은은한 반사 + 태양광 스페큘러 글린트
    vec3 windowSurface = mix(diffuseColor.rgb, skyReflectionColor, glassFactor * (0.35 + fresnel * 0.55));
    diffuseColor.rgb = windowSurface + sunSpecularGlint * glassFactor;
  } else {
    // 콘크리트 무광 외벽: 부드러운 람베르트 확산광 질감
    diffuseColor.rgb = diffuseColor.rgb * (0.88 + 0.12 * NdotL);
  }

  // 4. [F4map & OSMBuildings 벤더링] 건물 간 상호 차폐 접지 음영 (Contact Ambient Occlusion)
  // 건물이 지형에 견고하게 맞닿도록 0.0m ~ 4.0m 구간 짙은 그라데이션 섀도우 적용
  float shadowFactor = smoothstep(0.0, 4.0, max(0.0, vHeight));
  float finalGroundingAo = mix(0.40, 1.0, shadowFactor);

  // 차폐 음영 및 텍스처 미세 AO 결합 적용
  diffuseColor.rgb *= (finalGroundingAo * mix(1.0, pbrTextureAo, uAoIntensity));
`;

/**
 * 실사 PBR 파사드 & 옥상 셰이더 메터리얼 생성기
 */
export function createPhotorealisticPbrMaterial(
  options: PhotorealisticPbrMaterialOptions = {}
): THREE.MeshStandardMaterial {
  const rmaTex = options.rmaMap !== undefined ? options.rmaMap : getOrCreatePbrRmaTexture();

  const sunDir = options.sunDirection || new THREE.Vector3(120, 160, 90).normalize();
  const sunCol = options.sunColor || new THREE.Color(0xfffbeb);
  const skyZenith = options.skyZenithColor || new THREE.Color(0x1e3a8a);
  const skyHorizon = options.skyHorizonColor || new THREE.Color(0x93c5fd);
  const groundRefl = options.groundReflectColor || new THREE.Color(0x475569);

  const material = new THREE.MeshStandardMaterial({
    map: options.map || undefined,
    roughness: options.roughness !== undefined ? options.roughness : 0.45,
    metalness: options.metalness !== undefined ? options.metalness : 0.08,
    transparent: options.transparent || false,
    opacity: options.opacity !== undefined ? options.opacity : 1.0,
    side: options.side || THREE.DoubleSide,
  });

  // 커스텀 PBR Uniforms 바인딩
  const pbrUniforms: PhotorealisticPbrUniforms = {
    uSunDirection: { value: sunDir },
    uSunColor: { value: new THREE.Vector3(sunCol.r, sunCol.g, sunCol.b) },
    uSkyZenithColor: { value: new THREE.Vector3(skyZenith.r, skyZenith.g, skyZenith.b) },
    uSkyHorizonColor: { value: new THREE.Vector3(skyHorizon.r, skyHorizon.g, skyHorizon.b) },
    uGroundReflectColor: { value: new THREE.Vector3(groundRefl.r, groundRefl.g, groundRefl.b) },
    uCameraPosition: { value: new THREE.Vector3(0, 500, 500) },
    uRmaMap: { value: rmaTex },
    uHasRmaMap: { value: Boolean(rmaTex) },
    uAoIntensity: { value: options.aoIntensity !== undefined ? options.aoIntensity : 1.0 },
    uSpecularGlintIntensity: { value: options.specularGlintIntensity !== undefined ? options.specularGlintIntensity : 2.8 },
    uTime: { value: 0 },
  };

  (material as any).pbrUniforms = pbrUniforms;

  material.onBeforeCompile = (shader) => {
    // 1. Uniforms 병합
    Object.assign(shader.uniforms, pbrUniforms);

    // 2. 버텍스 셰이더 인젝션 (aHeight, vBuildingHeight, vWorldPositionVec, vPbrUv)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${PBR_VERTEX_PARS}`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${PBR_VERTEX_MAIN}`
    );

    // 3. 프래그먼트 셰이더 인젝션 (PBR Specular, Sky Reflection, Contact AO)
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

  return material;
}

/**
 * 매 프레임 카메라 회전, 태양광 및 시점 각도 동기화 헬퍼
 */
export function updatePhotorealisticPbrUniforms(
  material: THREE.Material,
  camera: THREE.Camera,
  sunLight?: THREE.DirectionalLight | null,
  timeSec = 0
): void {
  const pbr = (material as any)?.pbrUniforms as PhotorealisticPbrUniforms | undefined;
  if (!pbr) return;

  // 1. 카메라 위치 추출 (projectionMatrixInverse 기반 로컬 시점 계산)
  try {
    const inv = camera.projectionMatrixInverse;
    const v4 = new THREE.Vector4(0, 0, -1, 0).applyMatrix4(inv);
    if (Math.abs(v4.w) > 1e-9) {
      pbr.uCameraPosition.value.set(v4.x / v4.w, v4.y / v4.w, v4.z / v4.w);
    } else {
      const v4Alt = new THREE.Vector4(0, 0, -1, 1).applyMatrix4(inv);
      if (Math.abs(v4Alt.w) > 1e-9) {
        pbr.uCameraPosition.value.set(v4Alt.x / v4Alt.w, v4Alt.y / v4Alt.w, v4Alt.z / v4Alt.w);
      } else {
        pbr.uCameraPosition.value.set(0, 500, 500);
      }
    }
  } catch {
    pbr.uCameraPosition.value.copy(camera.position);
  }

  // 2. 태양광 방향 및 광색
  if (sunLight) {
    pbr.uSunDirection.value.copy(sunLight.position).normalize();
    pbr.uSunColor.value.set(sunLight.color.r, sunLight.color.g, sunLight.color.b);
  }

  pbr.uTime.value = timeSec;
}
