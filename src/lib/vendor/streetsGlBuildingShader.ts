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

export interface StreetsGlBuildingMaterialOptions {
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color;
  sunIntensity?: number;
  ambientSky?: THREE.Color;
  ambientGround?: THREE.Color;
  ambientIntensity?: number;
  demTexture?: THREE.Texture | null;
  demBounds?: [number, number, number, number];
}

export const streetsGlBuildingVertexShader = /* glsl */ `
  // aBuildingData: x: bldType(0=주택/빌라, 1=상업/오피스, 2=아파트), y: floors(층수), z: partType(0=외벽, 1=옥상, 2=난간, 3=측벽코어, 4=기단부), w: wallLength
  attribute vec4 aBuildingData;
  attribute vec2 aDemCoord;

  uniform sampler2D uDemTexture;
  uniform bool uUseDemTexture;
  uniform float uDemExaggeration;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
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

  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientSky;
  uniform vec3 uAmbientGround;
  uniform float uAmbientIntensity;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
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

  void main() {
    float bldType = vBuildingData.x;  // 0: 주택/빌라, 1: 상업/오피스, 2: 아파트
    float floors = vBuildingData.y;   // 층수
    float partType = vBuildingData.z; // 0: 외벽, 1: 옥상, 2: 난간, 3: 측벽코어, 4: 기단부
    float wallLength = max(1.0, vBuildingData.w);

    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uSunDirection);
    vec3 R = reflect(-V, N);

    // -------------------------------------------------------------------------
    // [1. 실제 항공사진과 어우러지는 저채도 옥상 마감]
    // 상단 수평면 (abs(N.y) > 0.85) 또는 partType == 1.0 (옥상 슬래브)
    // -------------------------------------------------------------------------
    if (partType == 1.0 || partType == 2.0 || abs(N.y) > 0.85) {
      // 1) 기본 옥상 색상 분기
      vec3 roofColor;

      if (bldType > 1.5 || floors >= 10.0) {
        // [대단지 아파트 및 대형 오피스 옥상]: 웨더링된 콘크리트 웜 그레이 (#64748b) ~ 다크 차콜 (#475569)
        float weathering = fract(sin(dot(vUv.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 warmGray = vec3(0.392, 0.455, 0.545);    // #64748b
        vec3 darkCharcoal = vec3(0.278, 0.333, 0.412); // #475569
        roofColor = mix(warmGray, darkCharcoal, weathering * 0.35);
      } else if (bldType > 0.5) {
        // [중·저층 상가/빌라 옥상]: 한국 특유의 차분한 우레탄 세이지 그린 (#2e5a44) 및 다크 올리브 그린 (#365314)
        vec3 sageGreen = vec3(0.180, 0.353, 0.267);  // #2e5a44
        vec3 darkOlive = vec3(0.212, 0.325, 0.078);  // #365314
        float urethaneTone = fract(vUv.x * 0.08 + vUv.y * 0.08);
        roofColor = mix(sageGreen, darkOlive, smoothstep(0.3, 0.7, urethaneTone));
      } else {
        // [단독주택/저층 주택]: 차분한 테라코타 브라운 (#7c2d12) 및 다크 네이비 슬레이트 (#1e3a8a)
        float isNavy = step(0.5, fract(wallLength * 0.37));
        vec3 terracotta = vec3(0.486, 0.176, 0.071); // #7c2d12
        vec3 navySlate = vec3(0.118, 0.227, 0.541);  // #1e3a8a
        roofColor = mix(terracotta, navySlate, isNavy);
      }

      // 난간 상단 코핑 수평면(#334155 다크 스톤)
      if (partType == 2.0 && abs(N.y) > 0.85) {
        roofColor = vec3(0.200, 0.255, 0.333); // #334155
      }

      // 2) 가장자리 0.8m 난간(Parapet) 내측 드롭 섀도우 & 앰비언트 오클루전(AO)
      float edgeDistX = min(vUv.x, max(0.0, wallLength - vUv.x));
      float edgeAO = smoothstep(0.0, 0.85, edgeDistX);
      roofColor *= mix(0.55, 1.0, edgeAO);

      // 3) 슬래브 미세 콘크리트 패널 줄눈 및 방수 코팅 결 (fwidth 안티앨리어싱)
      vec2 tileUv = fract(vUv * 0.25);
      float seam = aastep(0.02, tileUv.x) * aastep(0.02, tileUv.y);
      roofColor *= mix(0.88, 1.0, seam);

      // 4) PBR 조명 합성
      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, N.y * 0.5 + 0.5) * uAmbientIntensity;
      vec3 finalColor = roofColor * (diffuse + ambient);

      gl_FragColor = vec4(finalColor, 1.0);
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
    // [3. 1층 상가 쇼윈도 기단부 분리 (0m ~ 3.5m 또는 partType == 4.0)]
    // -------------------------------------------------------------------------
    if (heightMeters < 3.5 || partType == 4.0) {
      // 다크 화강석 그레이 (#64748b)
      vec3 graniteColor = vec3(0.392, 0.455, 0.545);

      // 석재 패널 줄눈 (1.5m x 1.0m 그리드)
      vec2 panelUv = fract(vec2(lengthMeters / 1.5, heightMeters / 1.0));
      float panelSeam = aastep(0.03, panelUv.x) * aastep(0.03, panelUv.y);
      graniteColor *= mix(0.78, 1.0, panelSeam);

      // 1층 상가 쇼윈도 구분선 및 대형 통유리창
      float winH = step(0.65, heightMeters) * (1.0 - step(3.0, heightMeters));
      float winBay = fract(lengthMeters / 3.8);
      float isShopWindow = winH * aabox(vec2(0.10, 0.12), vec2(0.90, 0.94), vec2(winBay, inFloor));

      if (isShopWindow > 0.5) {
        vec3 shopGlass = vec3(0.10, 0.16, 0.25);
        // 쇼윈도 온백색 조명 (진열대 포인트 조명)
        shopGlass += vec3(0.55, 0.50, 0.38) * smoothstep(0.60, 0.95, inFloor);

        // 쇼윈도 프레넬 하늘빛 반사
        float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
        shopGlass = mix(shopGlass, getSkyReflection(R), fresnel * 0.65);

        graniteColor = mix(graniteColor, shopGlass, 0.90);
      }

      // 하단 지면 밀착 접지 앰비언트 오클루전
      float groundAO = mix(0.42, 1.0, smoothstep(0.0, 0.85, heightMeters));
      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = mix(uAmbientGround, uAmbientSky, 0.5) * uAmbientIntensity;
      vec3 finalColor = graniteColor * (diffuse + ambient) * groundAO;

      gl_FragColor = vec4(finalColor, 1.0);
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

      gl_FragColor = vec4(finalColor, 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // [5. 한국 실제 건축물 유형별 정밀 입면(Facade)]
    // -------------------------------------------------------------------------
    vec3 wallBaseColor = vec3(0.957, 0.945, 0.918); // 아파트 외벽: 크림 아이보리 (#f4f1ea)
    vec3 slabColor = vec3(0.886, 0.910, 0.941);     // 층간 슬래브: 라이트 웜 그레이 (#e2e8f0)
    vec3 frameColor = vec3(0.200, 0.255, 0.333);    // 섀시 프레임: 다크 그레이 (#334155)

    if (bldType > 1.5) {
      // (1) 대단지 아파트 (apartments, 10층 이상):
      // - 따뜻한 크림 아이보리(#f4f1ea) 외벽 + 층간 슬래브(#e2e8f0) 투톤 도색
      // - 3.0m 층고마다 선명한 다크 그레이 베란다 섀시 프레임(#334155)
      float twoToneFactor = mod(floorIdx, 3.0) < 1.0 ? 1.0 : 0.0;
      wallBaseColor = mix(vec3(0.957, 0.945, 0.918), vec3(0.886, 0.910, 0.941), twoToneFactor * 0.75);
      slabColor = vec3(0.886, 0.910, 0.941);
      frameColor = vec3(0.200, 0.255, 0.333);
    } else if (bldType > 0.5) {
      // (2) 상업/오피스 빌딩:
      // - 화강석 베이지(#d6d3d1) 프레임 + 유리 커튼월
      wallBaseColor = vec3(0.839, 0.827, 0.820);
      slabColor = vec3(0.420, 0.460, 0.520);
      frameColor = vec3(0.180, 0.220, 0.280);
    } else {
      // (3) 중·저층 상가 및 주택/빌라:
      // - 화강석 베이지(#e7e5e4) 및 적벽돌(#9a3412) 질감 표현
      wallBaseColor = vec3(0.604, 0.204, 0.071); // #9a3412 적벽돌
      slabColor = vec3(0.906, 0.898, 0.894);     // #e7e5e4 화강석 베이지
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

      // 하늘빛 프레넬 반사 (Fresnel Reflection)
      float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.5);
      vec3 skyReflection = getSkyReflection(R);

      if (bldType > 0.5 && bldType <= 1.5) {
        // [상업/오피스]: 스카이 블루/슬레이트 유리 커튼월 반사 극대화
        vec3 curtainGlass = vec3(0.08, 0.22, 0.38);
        vec3 glassFinal = mix(curtainGlass, skyReflection, clamp(fresnel + 0.45, 0.0, 0.95));
        surfaceColor = mix(surfaceColor, glassFinal, isWindow);
      } else {
        // [아파트/주택]: 실내 방 조명 + 표면 프레넬 하늘 반사
        vec3 glassFinal = mix(interiorColor, skyReflection, clamp(fresnel + 0.28, 0.0, 0.88));
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
    float NdotL = max(0.0, dot(N, L));
    vec3 diffuse = uSunColor * NdotL * uSunIntensity;
    vec3 ambient = mix(uAmbientGround, uAmbientSky, N.y * 0.4 + 0.6) * uAmbientIntensity;

    // 유리창 및 금속 섀시 스페큘러 하이라이트
    vec3 H = normalize(L + V);
    float NdotH = max(0.0, dot(N, H));
    float specPower = (isWindow > 0.5) ? 64.0 : 16.0;
    float specIntensity = (isWindow > 0.5) ? 0.65 : (isFrame > 0.5 ? 0.25 : 0.05);
    vec3 specular = uSunColor * pow(NdotH, specPower) * specIntensity;

    vec3 finalColor = surfaceColor * (diffuse + ambient) + specular;
    gl_FragColor = vec4(finalColor, 1.0);
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
    },
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
}
