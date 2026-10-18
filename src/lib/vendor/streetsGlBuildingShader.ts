/**
 * lib/vendor/streetsGlBuildingShader.ts
 *
 * GitHub StrandedKitty/streets-gl 저장소의 3D 건축물 셰이더 아키텍처 벤더링 모듈
 * [2단계: Streets-GL 스타일 PBR 빌딩 파사드 셰이더 및 실측 폭 도로망 업데이트]
 *
 * 1) 칼같은 픽셀 해상도 (fwidth() 도함수 기반 안티앨리어싱):
 *    - smoothstep과 fwidth() 편미분을 통해 원거리 모아레(물결 깨짐) 현상 완전 제거
 *    - 초근접 확대 시에도 칼같이 선명한 창문 섀시 프레임(#334155), 층간 슬래브 가로 홈, 콘크리트 패널 줄눈
 * 2) 한국 실제 건축물 유형별 컬러 및 파사드 분기:
 *    - 아파트(apartments, 10층 이상): 따뜻한 크림 아이보리(#f4f1ea) 외벽 + 층간 슬래브(#e2e8f0) +
 *      세대별 다크 그레이 발코니 창호(#334155) 및 난간살 + 창문 없는 좁은 측벽(Side Wall) 무창 콘크리트 및
 *      한국 아파트 브랜드 도색 밴드(네이비 #1e3a8a, 브라운 #78350f, 다크 슬레이트 #334155)
 *    - 상업/오피스 빌딩: 하늘과 구름이 반사되는 스카이 블루/슬레이트 유리 커튼월(Fresnel 반사) +
 *      1층 상가 쇼윈도 대형 유리 및 온백색 조명 기단부 분리
 *    - 중·저층 상가 및 빌라: 화강석 베이지(#e7e5e4) 및 적벽돌(#9a3412) 질감 표현
 * 3) 실제 항공사진과 어우러지는 저채도 옥상 마감:
 *    - 상단 수평면(abs(vNormal.y) > 0.8 또는 partType == 1.0):
 *      가장자리 0.8m 난간(Parapet) 내측 드롭 섀도우 & 앰비언트 오클루전(AO)
 *      중·저층 상가/빌라: 실제 우레탄 방수 톤인 세이지 그린(#2e5a44) 및 다크 올리브 그린(#365314)
 *      대단지 아파트/고층 오피스: 웨더링된 콘크리트 웜 그레이(#64748b) 및 다크 차콜(#475569)
 *      단독주택/저층 주택: 차분한 테라코타 브라운(#7c2d12) 및 다크 네이비 슬레이트(#1e3a8a)
 * 4) 물리 기반 셰이딩(PBR Lighting):
 *    - 반사광(Specular) + 하늘빛 프레넬(Fresnel) + 반구 앰비언트(Hemisphere Sky/Ground)
 *    - GPU 지형 밀착(Terrain Clamping, uUseDemTexture)
 */

import * as THREE from 'three';
import { realisticRoofGlslChunk } from '@/utils/realisticRoofShader';

export interface StreetsGlBuildingMaterialOptions {
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color;
  sunIntensity?: number;
  ambientSky?: THREE.Color;
  ambientGround?: THREE.Color;
  ambientIntensity?: number;
  demTexture?: THREE.Texture | null;
  demBounds?: [number, number, number, number];
  atlasTexture?: THREE.Texture | null;
  useAtlasTexture?: boolean;
  opacity?: number;
}

export const streetsGlBuildingVertexShader = /* glsl */ `
  // aBuildingData: x: bldType, y: floors, z: partType, w: slotId
  attribute vec4 aBuildingData;
  attribute vec2 aDemCoord;

  uniform sampler2D uDemTexture;
  uniform bool uUseDemTexture;
  uniform float uDemExaggeration;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocalNormal;
  varying vec2 vUv;
  varying vec4 vBuildingData;
  varying vec3 vViewDir;

  // Terrarium DEM 해발고도 디코딩 (R * 256 + G + B / 256 - 32768)
  float decodeTerrarium(vec4 color) {
    return (color.r * 255.0 * 256.0 + color.g * 255.0 + color.b * 255.0 / 256.0) - 32768.0;
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vLocalNormal = normalize(normal);
    vBuildingData = aBuildingData;

    vec3 pos = position;

    // GPU Terrain Clamping: DEM 텍스처를 읽어 정점 높이를 지표면에 즉시 안착
    if (uUseDemTexture) {
      vec4 demTex = texture2D(uDemTexture, aDemCoord);
      float terrainElev = decodeTerrarium(demTex) * uDemExaggeration;
      pos.y += terrainElev;
    }

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vViewDir = normalize(cameraPosition - vWorldPos);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const streetsGlBuildingFragmentShader = /* glsl */ `
  precision highp float;
  ${realisticRoofGlslChunk}

  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientSky;
  uniform vec3 uAmbientGround;
  uniform float uAmbientIntensity;

  uniform sampler2D uAtlasTexture;
  uniform bool uUseAtlasTexture;
  uniform float uOpacity;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocalNormal;
  varying vec2 vUv;
  varying vec4 vBuildingData;
  varying vec3 vViewDir;

  // ---------------------------------------------------------------------------
  // [Streets-GL 코어] fwidth() 도함수 기반 안티앨리어싱 필터링
  // ---------------------------------------------------------------------------
  float aastep(float threshold, float value) {
    float afwidth = length(vec2(dFdx(value), dFdy(value))) * 0.70710678;
    return smoothstep(threshold - afwidth, threshold + afwidth, value);
  }

  float aabox(vec2 minCorner, vec2 maxCorner, vec2 uv) {
    vec2 f = fwidth(uv) * 0.7;
    vec2 lower = smoothstep(minCorner - f, minCorner + f, uv);
    vec2 upper = 1.0 - smoothstep(maxCorner - f, maxCorner + f, uv);
    return lower.x * lower.y * upper.x * upper.y;
  }

  // ---------------------------------------------------------------------------
  // 의사 인테리어 시차 매핑 (Pseudo-Interior Parallax Room Window)
  // ---------------------------------------------------------------------------
  vec3 getInteriorRoom(vec2 roomUv, vec3 viewDir, float seed) {
    // 시선 방향에 따른 3D 방 시차 변위
    vec2 parallaxOffset = viewDir.xy * 0.22;
    vec2 innerUv = clamp(roomUv + parallaxOffset, 0.02, 0.98);

    // 천장 따뜻한 LED 조명
    float ceilingLight = smoothstep(0.85, 0.98, innerUv.y) * 
                         smoothstep(0.15, 0.85, innerUv.x);
    vec3 warmLight = vec3(1.0, 0.96, 0.85) * ceilingLight * 1.6;

    // 세대별 가로 블라인드 (차양)
    float hasBlind = step(0.45, fract(seed * 17.31));
    float blindLines = sin(innerUv.y * 80.0) * 0.5 + 0.5;
    float blindMask = hasBlind * step(0.35, innerUv.y) * (0.6 + 0.4 * blindLines);

    // 안쪽 벽면 깊이감
    vec3 backWallColor = mix(vec3(0.18, 0.22, 0.28), vec3(0.32, 0.35, 0.40), innerUv.y);
    vec3 interior = mix(backWallColor, vec3(0.85, 0.88, 0.92), blindMask * 0.45);
    interior += warmLight;

    return interior;
  }

  // 절차적 대기 하늘 및 구름 반사
  vec3 getSkyReflection(vec3 reflDir) {
    float horizon = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zenithColor = vec3(0.14, 0.35, 0.65); // 딥 스카이 블루
    vec3 horizonColor = vec3(0.72, 0.82, 0.95); // 지평선 밝은 연무
    vec3 sky = mix(horizonColor, zenithColor, pow(horizon, 0.8));

    // 미세한 부드러운 절차적 구름 광택
    float cloudNoise = sin(reflDir.x * 6.0) * sin(reflDir.z * 6.0);
    sky += vec3(0.12, 0.14, 0.16) * max(0.0, cloudNoise * horizon);
    return sky;
  }

  // ---------------------------------------------------------------------------
  // [창호 15cm 깊이감] 창틀 내부 그림자 (Window Recess Inner Shadow)
  // 외벽 콘크리트 면보다 15cm 안쪽으로 들어간 창틀 상단과 측면에 짙은 내부 그림자 드리움
  // ---------------------------------------------------------------------------
  float getWindowRecessShadow(vec2 roomUv, vec3 N, vec3 L) {
    // 1) 상단 처마 15cm 인셋으로 인한 짙은 드롭 섀도우 (Inner Top Shadow)
    float topShadow = smoothstep(0.72, 0.98, roomUv.y) * 0.58;

    // 2) 태양 입사각에 따른 측면 창틀 인셋 그림자 (빛의 반대 방향 측면에 그림자)
    vec3 tangentX = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    float sunSide = dot(L, tangentX);
    float leftShadow = smoothstep(0.25, 0.02, roomUv.x) * clamp(sunSide * 0.7 + 0.3, 0.0, 1.0) * 0.48;
    float rightShadow = smoothstep(0.75, 0.98, roomUv.x) * clamp(-sunSide * 0.7 + 0.3, 0.0, 1.0) * 0.48;

    // 3) 4방향 코너 앰비언트 오클루전 (Corner AO)
    float cornerAO = (1.0 - smoothstep(0.0, 0.10, roomUv.x) * (1.0 - smoothstep(0.90, 1.0, roomUv.x))) * 0.18;

    float totalShadow = clamp(topShadow + leftShadow + rightShadow + cornerAO, 0.0, 0.75);
    return 1.0 - totalShadow;
  }

  // ---------------------------------------------------------------------------
  // [외벽 마이크로 범프] 콘크리트 및 벽돌/타일 줄눈 법선 교란 (Normal Perturbation)
  // 태양 각도에 따라 실제 벽면 요철 질감 및 줄눈 그림자 형성
  // ---------------------------------------------------------------------------
  vec3 getPerturbedNormal(vec3 N, vec2 worldXz, float heightMeters, float bldType) {
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 B = vec3(0.0, 1.0, 0.0);

    float microNoise = sin(worldXz.x * 14.0 + heightMeters * 11.0) * cos(worldXz.y * 14.0);
    float fineGrain = sin(worldXz.x * 48.0) * sin(heightMeters * 42.0) * 0.5;

    float groutBump = 0.0;
    if (bldType <= 0.5) {
      vec2 bUv = fract(vec2(length(worldXz) / 0.25, heightMeters / 0.12));
      groutBump = (sin(bUv.x * 6.283) + sin(bUv.y * 6.283)) * 0.22;
    } else if (bldType > 0.5 && bldType <= 1.5) {
      vec2 tUv = fract(vec2(length(worldXz) / 1.0, heightMeters / 0.6));
      groutBump = (sin(tUv.x * 6.283) + sin(tUv.y * 6.283)) * 0.16;
    } else {
      vec2 aUv = fract(vec2(length(worldXz) / 3.4, heightMeters / 3.0));
      groutBump = sin(aUv.x * 6.283) * 0.12;
    }

    float strength = 0.045;
    vec3 perturbed = N + (T * (microNoise * 0.5 + groutBump) + B * (fineGrain + groutBump * 0.5)) * strength;
    return normalize(perturbed);
  }

  void main() {
    float bldType = vBuildingData.x;  // 0: 주택/빌라, 1: 상업/오피스, 2: 아파트, 3: 군부대/공공
    float floors = vBuildingData.y;   // 층수
    float partType = vBuildingData.z; // 0: 외벽, 1: 옥상, 2: 난간, 3: 측벽코어, 4: 기단부, 5: 옥탑박스, 6: 박공지붕
    float slotId = vBuildingData.w;   // V-World 아틀라스 슬롯 ID (0..11)
    float wallLength = max(1.0, vUv.x * 3.2);

    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uSunDirection);
    vec3 R = reflect(-V, N);

    // -------------------------------------------------------------------------
    // [1단계: V-World 스타일 고해상도(2048x2048) 24종 건축 텍스처 아틀라스 매핑]
    // -------------------------------------------------------------------------
    if (uUseAtlasTexture) {
      float col = mod(slotId, 6.0);
      float row = floor(slotId / 6.0);
      vec2 slotOffset = vec2(col * (1.0 / 6.0), (3.0 - row) * 0.25);
      vec2 slotSize = vec2(1.0 / 6.0, 0.25);

      vec2 innerUv;
      if (partType == 3.0 || slotId == 4.0) {
        // [한국형 아파트 측벽 타일]: 가로 0..1 전폭 매핑, 세로 층별 반복
        innerUv = vec2(clamp(vUv.x, 0.002, 0.998), fract(vUv.y));
      } else if (partType == 1.0 || (slotId >= 14.0 && slotId <= 18.0)) {
        // [옥상 슬래브]: 미터 단위 자연스러운 반복 (12m x 12m)
        innerUv = clamp(fract(vUv * 0.08), 0.002, 0.998);
      } else {
        // [외벽 / 난간 / 옥탑 / 박공]: 3.2m(가로) x 3.0m(세로) 단위 반복
        innerUv = clamp(fract(vUv), 0.002, 0.998);
      }

      vec2 atlasUv = slotOffset + innerUv * slotSize;
      vec4 atlasTex = texture2D(uAtlasTexture, atlasUv);
      vec3 surfaceColor = atlasTex.rgb;

      // [옥상 슬래브]: 다층 웨더링 얼룩 및 방수 코팅 톤 변화
      if (partType == 1.0 || (slotId >= 14.0 && slotId <= 18.0)) {
        surfaceColor = applyRealisticRoofAging(surfaceColor, vWorldPos.xz, slotId);
      }

      // 유리창 영역 감지 (어두운 복층유리 창문 픽셀) 및 창문별 가변 스페큘러 하이라이트
      float lum = dot(surfaceColor, vec3(0.299, 0.587, 0.114));
      float isGlass = step(lum, 0.38) * (1.0 - step(1.5, partType));

      // 외벽 마이크로 범프 적용 (유리창 제외 콘크리트 외벽 요철)
      vec3 effN = N;
      if (isGlass < 0.5 && partType != 1.0) {
        effN = getPerturbedNormal(N, vWorldPos.xz, vWorldPos.y, bldType);
      }

      // PBR 조명 합성
      float NdotL = max(0.0, dot(effN, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, effN.y * 0.4 + 0.6) * uAmbientIntensity;

      // [창호 깊이감] 창틀 내부 15cm 인셋 그림자 (상단 드롭 섀도우 + 측면 창틀 그림자)
      if (isGlass > 0.5) {
        float recessShadow = getWindowRecessShadow(fract(innerUv * vec2(2.0, 3.0)), effN, L);
        surfaceColor *= recessShadow;
      }

      vec3 specular;
      if (isGlass > 0.5) {
        specular = getWindowDynamicSpecular(uSunColor, effN, L, V, vWorldPos, floor(vUv.y), floor(vUv.x));
      } else {
        vec3 H = normalize(L + V);
        float NdotH = max(0.0, dot(effN, H));
        specular = uSunColor * pow(NdotH, 16.0) * 0.08;
      }

      // 프레넬 하늘 반사 (유리창 영역)
      if (isGlass > 0.5) {
        vec3 effR = reflect(-V, effN);
        float fresnel = pow(1.0 - max(0.0, dot(effN, V)), 3.5);
        vec3 skyReflection = getSkyReflection(effR);
        surfaceColor = mix(surfaceColor, skyReflection, clamp(fresnel * 0.55, 0.0, 0.85));
      }

      vec3 finalColor = surfaceColor * (diffuse + ambient) + specular;
      gl_FragColor = vec4(finalColor, uOpacity);
      return;
    }

    // -------------------------------------------------------------------------
    // [Three.js 법선 기반 물리적 분리: 윗면(옥상) vs 난간(Parapet) vs 옆면(외벽)]
    // -------------------------------------------------------------------------
    bool isRoof = (partType == 1.0) || (vLocalNormal.y >= 0.5) || (vLocalNormal.z >= 0.5);
    bool isParapet = (partType == 2.0);

    if (isRoof) {
      vec3 roofColor;
      float roofHash = fract(sin(dot(floor(vWorldPos.xz * 0.05), vec2(12.9898, 78.233))) * 43758.5453);

      if (bldType > 1.5 || floors >= 10.0) {
        // [대단지 아파트 및 대형 오피스 옥상]: 콘크리트 그레이 & 차콜 슁글
        if (roofHash < 0.60) {
          roofColor = vec3(0.47, 0.44, 0.42); // 웜 그레이 #78716c
        } else if (roofHash < 0.85) {
          roofColor = vec3(0.20, 0.25, 0.33); // 차콜 그레이 #334155
        } else {
          roofColor = vec3(0.23, 0.32, 0.29); // 차분한 세이지 그린 #3b5249
        }
      } else {
        // [실제 항공사진 지붕 비율]: 콘크리트(30%), 아스팔트(25%), 적갈색 기와(20%), 세이지 그린(15%), 징크(10%)
        if (roofHash < 0.30) {
          roofColor = vec3(0.47, 0.44, 0.42); // 노후 콘크리트 #78716c
        } else if (roofHash < 0.55) {
          roofColor = vec3(0.20, 0.25, 0.33); // 차콜 슁글 #334155
        } else if (roofHash < 0.75) {
          roofColor = vec3(0.42, 0.18, 0.12); // 적갈색 기와 #6b2d1f
        } else if (roofHash < 0.90) {
          roofColor = vec3(0.23, 0.32, 0.29); // 저채도 세이지 그린 #3b5249
        } else {
          roofColor = vec3(0.17, 0.26, 0.34); // 청회색 징크 #2c4257
        }
      }

      // 슬래브 미세 콘크리트 패널 줄눈 및 방수 코팅 결
      vec2 tileUv = fract(vUv * 0.25);
      float seam = aastep(0.02, tileUv.x) * aastep(0.02, tileUv.y);
      roofColor *= mix(0.90, 1.0, seam);

      // 실제 위성 영상 기반 다층 웨더링 및 풍화 얼룩 적용
      roofColor = applyRealisticRoofAging(roofColor, vWorldPos.xz, roofHash);

      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, 0.5) * uAmbientIntensity;
      vec3 finalColor = roofColor * (diffuse + ambient);

      gl_FragColor = vec4(finalColor, uOpacity);
      return;
    }

    if (isParapet) {
      // [옥상 난간 (Parapet)]: 두께 0.35m, 높이 0.9m 회백색 콘크리트 난간 (#cbd5e1 ~ #e2e8f0)
      vec3 parapetColor = vec3(0.85, 0.88, 0.92); // 회백색 콘크리트 #cbd5e1
      if (vLocalNormal.y >= 0.5 || vLocalNormal.z >= 0.5) {
        parapetColor = vec3(0.80, 0.83, 0.88); // 난간 상단 코핑
      }

      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, 0.5) * uAmbientIntensity;
      vec3 finalColor = parapetColor * (diffuse + ambient);

      gl_FragColor = vec4(finalColor, uOpacity);
      return;
    }

    // [옥탑 권상기실 외벽 (partType == 5.0)]: 출입문 및 환기 루버 표현
    if (partType == 5.0) {
      vec3 pentColor = vec3(0.86, 0.89, 0.92);
      float doorU = step(0.12, fract(vUv.x)) * (1.0 - step(0.42, fract(vUv.x)));
      float doorV = step(0.05, fract(vUv.y)) * (1.0 - step(0.85, fract(vUv.y)));
      if (doorU * doorV > 0.5) {
        pentColor = vec3(0.20, 0.25, 0.33); // 철제 방화문 #334155
      }
      float luvU = step(0.58, fract(vUv.x)) * (1.0 - step(0.90, fract(vUv.x)));
      float luvV = step(0.30, fract(vUv.y)) * (1.0 - step(0.75, fract(vUv.y)));
      if (luvU * luvV > 0.5) {
        float luvLines = aastep(0.4, fract(vUv.y * 10.0));
        pentColor = mix(vec3(0.18, 0.22, 0.28), vec3(0.58, 0.64, 0.72), luvLines);
      }
      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, 0.5) * uAmbientIntensity;
      gl_FragColor = vec4(pentColor * (diffuse + ambient), uOpacity);
      return;
    }

    // -------------------------------------------------------------------------
    // [2. 수직 파사드 입면 좌표 및 층간 분할]
    // -------------------------------------------------------------------------
    float heightMeters = vUv.y;
    float lengthMeters = vUv.x;

    float floorH = 3.0; // 실측 표준 층고 3.0m
    float floorCoord = heightMeters / floorH;
    float inFloor = fract(floorCoord);
    float floorIdx = floor(floorCoord);

    // -------------------------------------------------------------------------
    // [3. 1층 기단부 분리 (0m ~ 3.8m 또는 partType == 4.0)]
    // -------------------------------------------------------------------------
    if (heightMeters < 3.8 || partType == 4.0) {
      vec3 graniteColor;
      if (bldType > 1.5 || bldType <= 0.5) {
        // [아파트 및 다세대 빌라]: 1층 현관 출입구(필로티 기둥 및 공동현관 포치) 어두운 화강석(#1e293b ~ #334155) 마감
        graniteColor = vec3(0.18, 0.22, 0.28);
        vec2 panelUv = fract(vec2(lengthMeters / 1.2, heightMeters / 0.8));
        float panelSeam = aastep(0.03, panelUv.x) * aastep(0.03, panelUv.y);
        graniteColor *= mix(0.72, 1.0, panelSeam);

        float inBay = fract(lengthMeters / 4.5);
        float isLobbyDoor = step(0.35, inBay) * (1.0 - step(0.65, inBay)) * step(0.5, heightMeters) * (1.0 - step(3.4, heightMeters));
        if (isLobbyDoor > 0.5) {
          vec3 doorGlass = vec3(0.08, 0.12, 0.18);
          doorGlass += vec3(0.60, 0.55, 0.40) * smoothstep(0.65, 0.95, inFloor);
          float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
          doorGlass = mix(doorGlass, getSkyReflection(R), fresnel * 0.70);
          graniteColor = mix(graniteColor, doorGlass, 0.92);
        }
      } else {
        // [상업/근린생활 건물]: 1층 어두운 통유리 쇼윈도 + 상가 간판 밴드(화이트/네이비/차콜 톤)
        graniteColor = vec3(0.14, 0.18, 0.24);
        float isSignBand = step(2.8, heightMeters) * (1.0 - step(3.6, heightMeters));
        if (isSignBand > 0.5) {
          float signHash = fract(sin(floor(lengthMeters / 5.5) * 19.31) * 43758.5453);
          vec3 signColor = (signHash < 0.35) ? vec3(0.92, 0.94, 0.96)
                         : (signHash < 0.70) ? vec3(0.12, 0.22, 0.48)
                         : vec3(0.18, 0.20, 0.24);
          graniteColor = signColor;
        } else {
          float isShopWindow = step(0.5, heightMeters) * (1.0 - step(2.7, heightMeters));
          if (isShopWindow > 0.5) {
            vec3 shopGlass = vec3(0.06, 0.10, 0.16);
            shopGlass += vec3(0.55, 0.48, 0.35) * smoothstep(0.55, 0.95, inFloor);
            float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
            shopGlass = mix(shopGlass, getSkyReflection(R), fresnel * 0.65);
            graniteColor = mix(graniteColor, shopGlass, 0.90);
          }
        }
      }

      float groundAO = mix(0.42, 1.0, smoothstep(0.0, 0.85, heightMeters));
      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, 0.5) * uAmbientIntensity;
      vec3 finalColor = graniteColor * (diffuse + ambient) * groundAO;

      gl_FragColor = vec4(finalColor, uOpacity);
      return;
    }

    // -------------------------------------------------------------------------
    // [4. 아파트 창문 없는 좁은 측벽(Side Wall) 자동 감지 및 브랜드 도색 라인]
    // (partType == 3.0)
    // -------------------------------------------------------------------------
    if (partType == 3.0) {
      // 따뜻한 크림 아이보리 외벽 (#f4f1ea)
      vec3 coreWall = vec3(0.957, 0.945, 0.918);

      // 한국 대단지 아파트 특유의 브랜드 포인트 수직 라인 도색:
      // 네이비 블루 (#1e3a8a), 웜 브라운 (#78350f), 다크 슬레이트 (#334155)
      float normX = fract(lengthMeters / wallLength);
      float bandNavy = aabox(vec2(0.20, 0.0), vec2(0.42, 1.0), vec2(normX, 0.5));
      float bandBrown = aabox(vec2(0.42, 0.0), vec2(0.52, 1.0), vec2(normX, 0.5));
      float bandSlate = aabox(vec2(0.16, 0.0), vec2(0.20, 1.0), vec2(normX, 0.5));

      coreWall = mix(coreWall, vec3(0.118, 0.227, 0.541), bandNavy);  // 네이비 #1e3a8a
      coreWall = mix(coreWall, vec3(0.471, 0.208, 0.059), bandBrown); // 브라운 #78350f
      coreWall = mix(coreWall, vec3(0.200, 0.255, 0.333), bandSlate); // 다크 슬레이트 #334155

      // 수직 패널 이음매
      float vSeam = aastep(0.02, fract(lengthMeters / 3.0));
      coreWall *= mix(0.90, 1.0, vSeam);

      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, 0.6) * uAmbientIntensity;
      vec3 finalColor = coreWall * (diffuse + ambient);

      gl_FragColor = vec4(finalColor, uOpacity);
      return;
    }

    // -------------------------------------------------------------------------
    // [5. 한국 실제 건축물 유형별 정밀 입면(Facade) - 초록색 엄격히 배제]
    // -------------------------------------------------------------------------
    vec3 wallBaseColor = vec3(0.961, 0.961, 0.941); // 아파트 외벽: 밝은 크림 아이보리 (#f5f5f0)
    vec3 slabColor = vec3(0.886, 0.910, 0.941);     // 층간 슬래브: 라이트 웜 그레이 (#e2e8f0)
    vec3 frameColor = vec3(0.200, 0.255, 0.333);    // 섀시 프레임: 다크 그레이 (#334155)

    if (bldType > 1.5) {
      // (1) 대단지 아파트 (apartments, 10층 이상):
      // - 따뜻한 밝은 크림 아이보리(#f5f5f0) 외벽 + 층간 슬래브(#e2e8f0) 투톤 도색
      // - 3.0m 층고마다 선명한 다크 그레이 베란다 섀시 프레임(#334155)
      float twoToneFactor = mod(floorIdx, 3.0) < 1.0 ? 1.0 : 0.0;
      wallBaseColor = mix(vec3(0.961, 0.961, 0.941), vec3(0.910, 0.910, 0.890), twoToneFactor * 0.35);
      slabColor = vec3(0.886, 0.910, 0.941);
      frameColor = vec3(0.200, 0.255, 0.333);
    } else if (bldType > 0.5) {
      // (2) 상업/오피스 빌딩:
      // - 오피스 유리(#cbd5e1) 프레임 + 반사 글래스
      wallBaseColor = vec3(0.796, 0.835, 0.882); // #cbd5e1 오피스 유리
      slabColor = vec3(0.420, 0.460, 0.520);
      frameColor = vec3(0.180, 0.220, 0.280);
    } else {
      // (3) 중·저층 상가 및 주택/빌라:
      // - 화강석 베이지(#e7e5e4) 질감 표현 (초록색 엄격히 배제)
      wallBaseColor = vec3(0.906, 0.898, 0.894); // #e7e5e4 화강석 베이지
      slabColor = vec3(0.850, 0.840, 0.830);
      frameColor = vec3(0.950, 0.950, 0.950);    // 화이트 PVC 창호
    }

    // 층간 슬래브 가로 홈 (두께 0.18m) - fwidth 안티앨리어싱
    float slabBorder = 0.18 / floorH;
    float isSlab = (1.0 - aastep(slabBorder, inFloor)) + aastep(1.0 - slabBorder * 0.5, inFloor);

    // 세대별 수평 베이(Bay) 분할 및 수직 날개벽 (Fin Pillar)
    float bayWidth = (bldType > 1.5) ? 3.4 : (bldType > 0.5 ? 2.5 : 2.8);
    float inBay = fract(lengthMeters / bayWidth);
    float bayIdx = floor(lengthMeters / bayWidth);

    // 세대 사이 수직 콘크리트 날개벽 (Fin: 양쪽 8% 구간)
    float isFinPillar = step(inBay, 0.08) + step(0.92, inBay);

    // 창문 영역 판정 (aabox 나이프 엣지)
    float winLeft = 0.12;
    float winRight = 0.88;
    float winBottom = (bldType > 1.5) ? 0.38 : (bldType > 0.5 ? 0.18 : 0.25);
    float winTop = (bldType > 0.5 && bldType <= 1.5) ? 0.95 : 0.92;

    float isWindow = aabox(vec2(winLeft, winBottom), vec2(winRight, winTop), vec2(inBay, inFloor));
    float isFrame = aabox(vec2(winLeft - 0.035, winBottom - 0.035), vec2(winRight + 0.035, winTop + 0.035), vec2(inBay, inFloor)) - isWindow;

    vec3 surfaceColor = wallBaseColor;

    // 상가 화강석 베이지(#e7e5e4) 줄눈 질감
    if (bldType > 0.5 && bldType <= 1.5) {
      vec2 tileUv = fract(vec2(lengthMeters / 1.0, heightMeters / 0.6));
      float tileGrout = aastep(0.04, tileUv.x) * aastep(0.05, tileUv.y);
      surfaceColor = mix(vec3(0.906, 0.898, 0.894), surfaceColor, tileGrout);
    }

    // 주택 적벽돌(#9a3412) 줄눈 질감
    if (bldType <= 0.5) {
      vec2 brickUv = fract(vec2(lengthMeters / 0.25, heightMeters / 0.12));
      float brickGrout = aastep(0.08, brickUv.x) * aastep(0.12, brickUv.y);
      surfaceColor *= mix(0.75, 1.0, brickGrout);
    }

    if (isSlab > 0.5) {
      surfaceColor = slabColor;
    } else if (isFinPillar > 0.5 && bldType > 1.5) {
      // 아파트 세대 간 수직 콘크리트 날개벽 (돌출 림)
      surfaceColor = vec3(0.886, 0.910, 0.941);
    } else if (isFrame > 0.5) {
      surfaceColor = frameColor;
    } else if (isWindow > 0.5) {
      // -----------------------------------------------------------------------
      // [창문: 인테리어 시차 매핑 & 프레넬 하늘 반사]
      // -----------------------------------------------------------------------
      vec2 roomUv = vec2(
        (inBay - winLeft) / (winRight - winLeft),
        (inFloor - winBottom) / (winTop - winBottom)
      );

      float roomSeed = floorIdx * 37.17 + bayIdx * 19.43;
      vec3 interiorColor = getInteriorRoom(roomUv, V, roomSeed);

      // [창호 15cm 깊이감] 창틀 내부 그림자 (상단 처마 인셋 + 측면 태양광 차폐 음영)
      float recessShadow = getWindowRecessShadow(roomUv, N, L);

      // 하늘빛 프레넬 반사 (Fresnel Reflection)
      float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.5);
      vec3 skyReflection = getSkyReflection(R);

      if (bldType > 0.5 && bldType <= 1.5) {
        // [상업/오피스]: 스카이 블루/슬레이트 유리 커튼월 반사 극대화
        vec3 curtainGlass = vec3(0.08, 0.22, 0.38);
        vec3 glassFinal = mix(curtainGlass, skyReflection, clamp(fresnel + 0.45, 0.0, 0.95)) * recessShadow;
        surfaceColor = mix(surfaceColor, glassFinal, isWindow);
      } else {
        // [아파트/주택]: 실내 방 조명 + 표면 프레넬 하늘 반사 + 15cm 인셋 그림자
        vec3 glassFinal = mix(interiorColor, skyReflection, clamp(fresnel + 0.28, 0.0, 0.88)) * recessShadow;
        surfaceColor = mix(surfaceColor, glassFinal, isWindow);
      }
    } else if (bldType > 1.5 && inFloor < 0.38 && inFloor >= slabBorder) {
      // -----------------------------------------------------------------------
      // [아파트 세대별 다크 그레이 발코니 난간살]
      // -----------------------------------------------------------------------
      float baluster = fract(lengthMeters / 0.30);
      float isBalusterBar = aastep(0.30, baluster);
      surfaceColor = mix(frameColor, wallBaseColor, isBalusterBar * 0.65);
    }

    // -------------------------------------------------------------------------
    // [6. 물리 기반 셰이딩(PBR Lighting) 및 스페큘러 반사]
    // -------------------------------------------------------------------------
    // 외벽 마이크로 범프(Normal Perturbation) 적용
    vec3 effN = (isWindow > 0.5) ? N : getPerturbedNormal(N, vWorldPos.xz, heightMeters, bldType);
    float NdotL = max(0.0, dot(effN, L));
    vec3 diffuse = uSunColor * NdotL * uSunIntensity;
    vec3 ambient = mix(uAmbientGround, uAmbientSky, effN.y * 0.4 + 0.6) * uAmbientIntensity;

    // 유리창 및 금속 섀시 스페큘러 하이라이트 (창문별 가변 Roughness / 스페큘러)
    vec3 specular;
    if (isWindow > 0.5) {
      specular = getWindowDynamicSpecular(uSunColor, effN, L, V, vWorldPos, floorIdx, bayIdx);
    } else {
      vec3 H = normalize(L + V);
      float NdotH = max(0.0, dot(N, H));
      float specPower = (isFrame > 0.5 ? 24.0 : 12.0);
      float specIntensity = (isFrame > 0.5 ? 0.25 : 0.04);
      specular = uSunColor * pow(NdotH, specPower) * specIntensity;
    }

    vec3 finalColor = surfaceColor * (diffuse + ambient) + specular;
    gl_FragColor = vec4(finalColor, uOpacity);
  }
`;

/**
 * Streets-GL 스타일 커스텀 ShaderMaterial 싱글톤/인스턴스 생성 헬퍼
 */
export function createStreetsGlBuildingMaterial(
  options: StreetsGlBuildingMaterialOptions = {}
): THREE.ShaderMaterial {
  const sunDir = options.sunDirection || new THREE.Vector3(0.65, 0.75, 0.45).normalize();
  const sunCol = options.sunColor || new THREE.Color(0xfffbeb);
  const sunInt = options.sunIntensity !== undefined ? options.sunIntensity : 1.25;

  const ambSky = options.ambientSky || new THREE.Color(0xdbeafe);
  const ambGnd = options.ambientGround || new THREE.Color(0x334155);
  const ambInt = options.ambientIntensity !== undefined ? options.ambientIntensity : 0.85;

  const opacity = options.opacity !== undefined ? Math.max(0.0, Math.min(1.0, options.opacity)) : 1.0;

  return new THREE.ShaderMaterial({
    vertexShader: streetsGlBuildingVertexShader,
    fragmentShader: streetsGlBuildingFragmentShader,
    uniforms: {
      uSunDirection: { value: sunDir },
      uSunColor: { value: new THREE.Vector3(sunCol.r, sunCol.g, sunCol.b) },
      uSunIntensity: { value: sunInt },
      uAmbientSky: { value: new THREE.Vector3(ambSky.r, ambSky.g, ambSky.b) },
      uAmbientGround: { value: new THREE.Vector3(ambGnd.r, ambGnd.g, ambGnd.b) },
      uAmbientIntensity: { value: ambInt },
      uDemTexture: { value: options.demTexture || null },
      uUseDemTexture: { value: !!options.demTexture },
      uDemExaggeration: { value: 1.0 },
      uAtlasTexture: { value: options.atlasTexture || null },
      uUseAtlasTexture: { value: options.useAtlasTexture !== undefined ? options.useAtlasTexture : !!options.atlasTexture },
      uOpacity: { value: opacity },
    },
    side: THREE.DoubleSide,
    transparent: opacity < 0.99,
    depthWrite: true,
  });
}
