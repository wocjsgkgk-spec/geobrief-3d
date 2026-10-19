/**
 * buildingFacadeShader.ts
 *
 * [2단계: GLSL 절차적 창문·베란다 셰이더 및 한국형 입체 지붕(LOD2) 빌딩 엔진]
 * OSMBuildings & Streets-GL 오픈소스 아키텍처 벤더링:
 * 1) 텍스처 이미지 파손/검은 화면 원천 차단: 순수 수학적 GPU GLSL 절차적 연산
 * 2) 층고 3.0m 비례 층간 콘크리트 슬래브 선 & 발코니 난간 칼같은 렌더링 (fract(vWorldPosition.z / 3.0))
 * 3) 2.8m 간격 세대별 창문 프레임 및 반사 유리 그라데이션 (#1e293b ~ #38bdf8)
 * 4) 3점 조명(Three-Point Lighting) 탑재: 반구 환경광 + 앰비언트 + 남동향 태양광으로 그늘진 벽면 흑화 완전 제거
 */

import * as THREE from 'three';

export interface FacadeShaderOptions {
  buildingType: 'apartment' | 'commercial' | 'neighborhood' | 'landmark';
  baseColor?: string | number;
  coreColor?: string | number;
  windowBottomColor?: string | number;
  windowTopColor?: string | number;
  slabColor?: string | number;
  frameColor?: string | number;
  floorHeight?: number;
  windowWidth?: number;
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    // Three.js 로컬 지오메트리 좌표 (Y가 고도/층고 미터)
    // 수학적 가독성과 GIS Z-up 표준 일치를 위해 vWorldPosition.z에 고도(position.y)를 매핑
    vWorldPosition = vec3(position.x, position.z, position.y);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform int uBuildingType; // 0: 아파트, 1: 상업/오피스, 2: 주택/군사, 3: 랜드마크
  uniform vec3 uBaseColor;
  uniform vec3 uCoreColor;
  uniform vec3 uWindowBottomColor;
  uniform vec3 uWindowTopColor;
  uniform vec3 uSlabColor;
  uniform vec3 uFrameColor;
  uniform float uFloorHeight;
  uniform float uWindowWidth;

  // 3점 조명 Uniforms
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientSky;
  uniform vec3 uAmbientGround;
  uniform float uAmbientIntensity;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    // -------------------------------------------------------------
    // 1. 수직 층고(3.0m) 분할: 층간 슬래브, 발코니, 창문
    // -------------------------------------------------------------
    // vWorldPosition.z는 바닥 기준 미터 단위 높이
    float floorCoord = vWorldPosition.z / uFloorHeight;
    float vInFloor = fract(floorCoord);

    // 층간 콘크리트 슬래브 가로줄 (상하단 경계 약 0.36m 폭)
    bool isSlab = (vInFloor < 0.12) || (vInFloor > 0.96);

    // -------------------------------------------------------------
    // 2. 수평 세대별(2.8m) 분할: 창문 프레임 및 반사 유리
    // -------------------------------------------------------------
    // vUv.x는 벽면 수평 거리 (3.0m 단위 환산 좌표)
    float horizMeters = vUv.x * 3.0;
    float hInCell = fract(horizMeters / uWindowWidth);

    // 창문 수직 프레임(Mullion) 두께 (좌우 8% = 약 22cm)
    bool isVerticalFrame = (hInCell < 0.08) || (hInCell > 0.92);

    // -------------------------------------------------------------
    // 3. 건물 외벽 입면 요철 및 층간 슬래브 하단 드롭 섀도우 연산
    // -------------------------------------------------------------
    // 층간 슬래브(3.0m 간격) 하단 0.25m 폭의 미세한 드롭 섀도우 (실제 요철 음영)
    float shadowSpan = 0.25 / uFloorHeight; // 0.25m / 3.0m = 0.0833
    float slabShadow = 1.0;
    if (vInFloor >= (0.96 - shadowSpan) && vInFloor <= 0.96) {
      float t = (0.96 - vInFloor) / shadowSpan;
      slabShadow = mix(0.55, 1.0, smoothstep(0.0, 1.0, t));
    }
    // 하단 발코니 슬래브 밑면 미세 음영
    if (vInFloor >= 0.12 && vInFloor <= (0.12 + shadowSpan * 0.7)) {
      float t = (vInFloor - 0.12) / (shadowSpan * 0.7);
      slabShadow = min(slabShadow, mix(0.68, 1.0, t));
    }

    // 외벽 수직 루버(Louver) 및 창문 멀리언 측면 미세 요철 음영
    float louverShadow = 1.0;
    if (hInCell >= 0.08 && hInCell <= 0.14) {
      float lt = (hInCell - 0.08) / 0.06;
      louverShadow = mix(0.72, 1.0, lt);
    }

    // -------------------------------------------------------------
    // 4. 건물 유형별 외벽 및 창문 기하 알베도 합성
    // -------------------------------------------------------------
    vec3 albedo = uBaseColor;

    if (uBuildingType == 0) {
      // [유형 0: 한국형 고층 아파트 단지 (10층 이상)]
      // - 베이스: 밝은 아이보리/화이트 외벽 (#f8fafc)
      // - 포인트 측벽/기둥: (#cbd5e1)
      // - 발코니 난간 & 층간 슬래브 선명 분할
      bool isPillar = (hInCell < 0.12) || (hInCell > 0.88);
      if (isPillar) {
        albedo = uCoreColor;
      }

      if (isSlab) {
        albedo = uSlabColor;
      } else {
        // 발코니 하단 난간벽 (0.12 ~ 0.40)
        bool isBalconyRail = (vInFloor >= 0.12 && vInFloor < 0.40);
        // 창문 유리 영역 (0.40 ~ 0.94)
        bool isWindowZone = (vInFloor >= 0.40 && vInFloor <= 0.94);

        if (isBalconyRail) {
          // 발코니 난간 살 디테일 (미세 수직 슬릿)
          float baluster = fract(horizMeters / 0.35);
          if (baluster < 0.25) {
            albedo = uFrameColor;
          } else {
            albedo = mix(uBaseColor, uCoreColor, 0.5);
          }
        } else if (isWindowZone) {
          if (isVerticalFrame || vInFloor < 0.44 || vInFloor > 0.90) {
            // 화이트/실버 섀시 프레임
            albedo = uFrameColor;
          } else {
            // 이중창 반사 유리: 하단 어두운 블루/그레이(#1e293b) -> 상단 하늘 반사(#38bdf8)
            float winGrad = clamp((vInFloor - 0.44) / 0.46, 0.0, 1.0);
            albedo = mix(uWindowBottomColor, uWindowTopColor, winGrad);
          }
        }
      }
    } else if (uBuildingType == 1) {
      // [유형 1: 상업 / 오피스 빌딩]
      // - 모던 글래스 커튼월 (#bae6fd) + 메탈 루버 프레임
      if (isSlab) {
        albedo = uFrameColor;
      } else {
        if (isVerticalFrame || vInFloor < 0.16 || vInFloor > 0.92) {
          albedo = uFrameColor;
        } else {
          float curtainGrad = clamp((vInFloor - 0.16) / 0.76, 0.0, 1.0);
          vec3 glassSky = mix(uWindowBottomColor, uBaseColor, curtainGrad * 0.9 + 0.1);
          albedo = glassSky;
        }
      }
    } else if (uBuildingType == 3) {
      // [유형 3: 초고층 랜드마크 타워]
      // - 딥 스카이 블루 전면 반사 커튼월
      float winH = fract(vWorldPosition.z / 3.8);
      float winW = fract(horizMeters / 2.0);
      bool isMullion = (winW < 0.06) || (winW > 0.94) || (winH < 0.08) || (winH > 0.96);
      if (isMullion) {
        albedo = uFrameColor;
      } else {
        float skyReflect = clamp((winH - 0.08) / 0.88, 0.0, 1.0);
        albedo = mix(vec3(0.06, 0.18, 0.35), vec3(0.22, 0.74, 0.97), skyReflect);
      }
    } else {
      // [유형 2: 저층 주택 / 군사 시설 / 막사]
      // - 따뜻한 샌드 베이지(#f1f5f9) 및 벽돌/콘크리트 톤
      if (isSlab) {
        albedo = uSlabColor;
      } else {
        bool isWin = (vInFloor >= 0.35 && vInFloor <= 0.82) && (hInCell >= 0.22 && hInCell <= 0.78);
        if (isWin) {
          if (hInCell < 0.26 || hInCell > 0.74 || vInFloor < 0.38 || vInFloor > 0.79) {
            albedo = uFrameColor;
          } else {
            float g = (vInFloor - 0.38) / 0.41;
            albedo = mix(uWindowBottomColor, uWindowTopColor, g);
          }
        } else {
          // 벽돌/베이지 몰딩 텍스처 라인
          float brickLine = fract(vWorldPosition.z / 0.6);
          if (brickLine < 0.08) {
            albedo = mix(uBaseColor, uSlabColor, 0.6);
          } else {
            albedo = uBaseColor;
          }
        }
      }
    // 입면 요철 음영 (슬래브 드롭 섀도우 & 루버 음영) 알베도 반영
    albedo *= (slabShadow * louverShadow);

    // -------------------------------------------------------------
    // 5. [검은색 벽면 원천 차단] 3점 조명 (Three-Point Lighting) 연산
    // -------------------------------------------------------------
    // 1) 반구 하늘/지표면 환경광 (Hemisphere Light)
    // 수평 법선(벽면)도 하늘빛(0.85)과 지면 반사(0.55)의 산란광을 균등하게 받음
    float hemiFactor = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 hemiLight = mix(uAmbientGround, uAmbientSky, hemiFactor) * uAmbientIntensity;

    // 2) 전역 앰비언트 라이트 (기본 바닥 밝기 0.65 보장 -> 그늘진 면도 화이트/콘크리트 톤 유지)
    vec3 baseAmbient = vec3(0.65);

    // 3) 태양 직사광 (Directional Light - 남동쪽 상공)
    vec3 lightDir = normalize(uSunDirection);
    float NdotL = max(dot(vNormal, lightDir), 0.0);
    vec3 sunLight = uSunColor * (NdotL * uSunIntensity);

    // 4) 보조 채움광 (Fill Light - 반대편 서북쪽에서 그늘 완화)
    vec3 fillDir = normalize(vec3(-lightDir.x, lightDir.y * 0.8, -lightDir.z));
    float NdotFill = max(dot(vNormal, fillDir), 0.0);
    vec3 fillLight = vec3(0.58, 0.77, 0.99) * (NdotFill * 0.35);

    // 총 조명 합산 (최소 조명 강도 0.75 이상 보장으로 칠흑 암흑 완전 방지)
    vec3 totalLighting = baseAmbient + hemiLight + sunLight + fillLight;
    vec3 rawColor = albedo * totalLighting * 1.05;

    // [3단계: 실사 항공사진 톤 매핑 (ACES Filmic Tone Mapping)]
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    vec3 toneMapped = clamp((rawColor * (a * rawColor + b)) / (rawColor * (c * rawColor + d) + e), 0.0, 1.0);

    gl_FragColor = vec4(toneMapped, 1.0);
  }
`;

/**
 * 용도별 맞춤형 ShaderMaterial 생성 팩토리
 */
export function createBuildingFacadeShaderMaterial(options: FacadeShaderOptions): THREE.ShaderMaterial {
  let typeInt = 0;
  if (options.buildingType === 'commercial') typeInt = 1;
  else if (options.buildingType === 'neighborhood') typeInt = 2;
  else if (options.buildingType === 'landmark') typeInt = 3;

  const toColor = (val: string | number | undefined, defaultHex: number) => {
    if (val === undefined) return new THREE.Color(defaultHex);
    return new THREE.Color(val as any);
  };

  const uniforms = {
    uBuildingType: { value: typeInt },
    uBaseColor: { value: toColor(options.baseColor, 0xf8fafc) },
    uCoreColor: { value: toColor(options.coreColor, 0xcbd5e1) },
    uWindowBottomColor: { value: toColor(options.windowBottomColor, 0x1e293b) },
    uWindowTopColor: { value: toColor(options.windowTopColor, 0x38bdf8) },
    uSlabColor: { value: toColor(options.slabColor, 0xe2e8f0) },
    uFrameColor: { value: toColor(options.frameColor, 0x475569) },
    uFloorHeight: { value: options.floorHeight || 3.0 },
    uWindowWidth: { value: options.windowWidth || 2.8 },

    // 3점 조명 기본값 (남동쪽 상공 120, 180, 100)
    uSunDirection: { value: new THREE.Vector3(120, 180, 100).normalize() },
    uSunColor: { value: new THREE.Color(0xfffbeb) },
    uSunIntensity: { value: 1.1 },
    uAmbientSky: { value: new THREE.Color(0xffffff) },
    uAmbientGround: { value: new THREE.Color(0x64748b) },
    uAmbientIntensity: { value: 0.85 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
  });

  return material;
}

/**
 * 1) 고층 아파트 단지 전용 (10층 이상): 아이보리/화이트 외벽 + 발코니 난간
 */
export function createApartmentFacadeShaderMaterial(): THREE.ShaderMaterial {
  return createBuildingFacadeShaderMaterial({
    buildingType: 'apartment',
    baseColor: '#f8fafc',
    coreColor: '#cbd5e1',
    windowBottomColor: '#1e293b',
    windowTopColor: '#38bdf8',
    slabColor: '#e2e8f0',
    frameColor: '#64748b',
    floorHeight: 3.0,
    windowWidth: 2.8,
  });
}

/**
 * 2) 상업/오피스 빌딩 전용: 모던 글래스 커튼월 (#bae6fd) + 메탈 루버
 */
export function createCommercialFacadeShaderMaterial(): THREE.ShaderMaterial {
  return createBuildingFacadeShaderMaterial({
    buildingType: 'commercial',
    baseColor: '#bae6fd',
    coreColor: '#334155',
    windowBottomColor: '#0f172a',
    windowTopColor: '#38bdf8',
    slabColor: '#334155',
    frameColor: '#475569',
    floorHeight: 3.2,
    windowWidth: 2.4,
  });
}

/**
 * 3) 저층 주택 / 군사 시설 전용: 따뜻한 샌드 베이지 (#f1f5f9) 및 벽돌 톤
 */
export function createNeighborhoodFacadeShaderMaterial(): THREE.ShaderMaterial {
  return createBuildingFacadeShaderMaterial({
    buildingType: 'neighborhood',
    baseColor: '#f1f5f9',
    coreColor: '#e2e8f0',
    windowBottomColor: '#1e293b',
    windowTopColor: '#60a5fa',
    slabColor: '#cbd5e1',
    frameColor: '#475569',
    floorHeight: 2.9,
    windowWidth: 2.6,
  });
}

/**
 * 4) 초고층 랜드마크 타워 전용: 딥블루 고반사 글래스
 */
export function createLandmarkFacadeShaderMaterial(): THREE.ShaderMaterial {
  return createBuildingFacadeShaderMaterial({
    buildingType: 'landmark',
    baseColor: '#0284c7',
    coreColor: '#0369a1',
    windowBottomColor: '#0c4a6e',
    windowTopColor: '#38bdf8',
    slabColor: '#0284c7',
    frameColor: '#0369a1',
    floorHeight: 3.6,
    windowWidth: 2.0,
  });
}

/**
 * 태양광 각도 및 조명 파라미터 일괄 업데이트 유틸리티
 */
export function updateFacadeShaderLights(
  materials: THREE.ShaderMaterial[],
  vector: [number, number, number],
  colorHex: string,
  intensity: number
): void {
  const sunDir = new THREE.Vector3(vector[0], vector[1], vector[2]).normalize();
  const sunCol = new THREE.Color(colorHex);

  for (const mat of materials) {
    if (!mat || !mat.uniforms) continue;
    if (mat.uniforms.uSunDirection) mat.uniforms.uSunDirection.value.copy(sunDir);
    if (mat.uniforms.uSunColor) mat.uniforms.uSunColor.value.copy(sunCol);
    if (mat.uniforms.uSunIntensity) mat.uniforms.uSunIntensity.value = Math.max(0.9, intensity * 1.1);
  }
}
