/**
 * realisticCityShader.ts
 *
 * [2단계: 단일 드로우콜 기반 커스텀 GLSL 파사드 & 인테리어 매핑 셰이더 엔진]
 *
 * 1) 칼같은 픽셀 해상도 (fwidth() 안티앨리어싱):
 *    - smoothstep과 fwidth() 편미분을 통해 초근접 줌 확대 시에도 절대 흐려지지 않는 선명한 창틀/슬래브 라인
 * 2) 의사 인테리어 매핑 (Pseudo-Interior Parallax Room Window):
 *    - 시선각(View Vector) 기반 내부 3D 방 깊이감, 천장 조명, 가로 블라인드 섀도우 연산
 *    - 창문 표면 하늘빛 프레넬 반사(Fresnel Reflection)
 * 3) 건물 유형별 정밀 스타일:
 *    - 아파트(2.0): 크림 아이보리 외벽 + 발코니 난간 격자 + 측벽 무창 코어 콘크리트 및 브랜드 라인
 *    - 상업 빌딩(1.0): 유리 커튼월 + 1층 상가 쇼윈도 및 간판 영역 분리
 *    - 일반 주택(0.0): 웜 베이지 벽체 + 창호
 *    - 옥상 슬래브: 테두리 난간 그림자(Parapet AO) + 한국형 초록 우레탄(#15803d) / 다크 슬레이트(#334155)
 * 4) 정점 셰이더(Vertex Shader) 기반 실시간 지면 안착 (GPU Terrain Clamping)
 */

import * as THREE from 'three';

export interface RealisticCityMaterialOptions {
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color;
  sunIntensity?: number;
  ambientSky?: THREE.Color;
  ambientGround?: THREE.Color;
  ambientIntensity?: number;
  demTexture?: THREE.Texture | null;
  demBounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  originElevation?: number;
}

export const realisticCityVertexShader = /* glsl */ `
  // aBuildingData: x: bldType(0=주택, 1=상업, 2=아파트), y: floors(층수), z: partType(0=외벽, 1=옥상, 2=기단부, 3=측벽코어), w: wallLength
  attribute vec4 aBuildingData;
  attribute vec2 aDemCoord;

  uniform sampler2D uDemTexture;
  uniform bool uUseDemTexture;
  uniform float uDemExaggeration;
  uniform float uOriginElevation;

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

    // [3단계: GPU Terrain Clamping] DEM 텍스처를 읽어 정점 높이를 지표면에 안착
    // Camera matrix는 이미 origin elevation(clampedAltitude)만큼 이동되어 있으므로,
    // 정점에는 원점 대비 로컬 지형 고도 차이(terrainElev - uOriginElevation)만 반영합니다.
    if (uUseDemTexture) {
      vec4 demTex = texture2D(uDemTexture, aDemCoord);
      float terrainElev = decodeTerrarium(demTex) * uDemExaggeration;
      float relElev = terrainElev - uOriginElevation;
      pos.y += clamp(relElev, -50.0, 50.0);
    }

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vViewDir = normalize(cameraPosition - vWorldPos);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const realisticCityFragmentShader = /* glsl */ `
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
  // 안티앨리어싱 필터링 헬퍼 (fwidth 기반 무결점 나이프 엣지)
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
  // [3단계: 실사 항공사진 톤 매핑 (ACES Filmic Tone Mapping, exposure: 1.05)]
  // ---------------------------------------------------------------------------
  vec3 acesFilmic(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // ---------------------------------------------------------------------------
  // 의사 인테리어 시차 매핑 (Pseudo-Interior Parallax Room Window)
  // ---------------------------------------------------------------------------
  vec3 getInteriorRoom(vec2 roomUv, vec3 viewDir, float seed) {
    // 시선 방향에 따른 3D 방 시차 변위
    vec2 parallaxOffset = viewDir.xy * 0.22;
    vec2 innerUv = clamp(roomUv + parallaxOffset, 0.02, 0.98);

    // 방 천장 LED 조명 / 전등
    float ceilingLight = smoothstep(0.85, 0.98, innerUv.y) * 
                         smoothstep(0.15, 0.85, innerUv.x);
    vec3 warmLight = vec3(1.0, 0.96, 0.85) * ceilingLight * 1.6;

    // 가로 블라인드 (랜덤 세대별 블라인드 차양)
    float hasBlind = step(0.45, fract(seed * 17.31));
    float blindLines = sin(innerUv.y * 80.0) * 0.5 + 0.5;
    float blindMask = hasBlind * step(0.35, innerUv.y) * (0.6 + 0.4 * blindLines);

    // 안쪽 벽면 음영 (후면 깊이감)
    vec3 backWallColor = mix(vec3(0.18, 0.22, 0.28), vec3(0.32, 0.35, 0.40), innerUv.y);
    vec3 interior = mix(backWallColor, vec3(0.85, 0.88, 0.92), blindMask * 0.45);
    interior += warmLight;

    return interior;
  }

  void main() {
    float bldType = vBuildingData.x;  // 0: 주택/군사, 1: 상업, 2: 아파트
    float floors = vBuildingData.y;   // 층수
    float partType = vBuildingData.z; // 0: 외벽, 1: 옥상, 2: 기단부, 3: 측벽코어
    float wallLength = max(1.0, vBuildingData.w);

    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uSunDirection);

    // -------------------------------------------------------------------------
    // 1. [실제 한국 도심 옥상 슬래브 마감: 원색 제거, 채도 정돈된 실사 색감]
    // -------------------------------------------------------------------------
    if (partType == 1.0 || abs(N.y) > 0.85) {
      vec3 roofColor = vec3(0.176, 0.353, 0.263); // 기본: 초록 우레탄 (#2d5a43)

      if (bldType > 1.5 || floors >= 10.0) {
        // [대단지 아파트 및 대형 오피스 옥상]: 노후 시멘트 그레이 (#57534e) ~ 웨더링 콘크리트 (#78716c) ~ 다크 방수재 (#334155)
        float weathering = fract(sin(dot(vUv.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 cementGray = vec3(0.341, 0.325, 0.306); // #57534e
        vec3 darkWaterproofing = vec3(0.200, 0.255, 0.333); // #334155
        roofColor = mix(cementGray, darkWaterproofing, weathering * 0.45);
      } else if (bldType > 0.5) {
        // [중·저층 상가/빌라 옥상]: 실제 초록 우레탄 방수 (#2d5a43)
        vec3 greenUrethane = vec3(0.176, 0.353, 0.263);  // #2d5a43
        vec3 darkUrethane = vec3(0.110, 0.220, 0.165);   // 짙은 우레탄 그늘
        float urethaneTone = fract(vUv.x * 0.08 + vUv.y * 0.08);
        roofColor = mix(greenUrethane, darkUrethane, smoothstep(0.3, 0.7, urethaneTone));
      } else {
        // [저층 주택 및 군 막사 지붕]: 적벽돌/적갈색 기와 (#6b2d1f) 및 청색 강판 (#1e3a8a)
        float isNavy = step(0.5, fract(wallLength * 0.37));
        vec3 terracotta = vec3(0.420, 0.176, 0.122); // #6b2d1f
        vec3 navySlate = vec3(0.118, 0.227, 0.541);  // #1e3a8a
        roofColor = mix(terracotta, navySlate, isNavy);
      }

      // 가장자리 0.8m 난간(Parapet) 내측 드롭 섀도우 & 앰비언트 오클루전
      float edgeDistX = min(vUv.x, max(0.0, wallLength - vUv.x));
      float edgeAO = smoothstep(0.0, 0.85, edgeDistX);
      roofColor *= mix(0.55, 1.0, edgeAO);

      // 슬래브 미세 콘크리트 패널 줄눈 및 방수 코팅 롤러 결
      vec2 tileUv = fract(vUv * 0.25);
      float seam = aastep(0.02, tileUv.x) * aastep(0.02, tileUv.y);
      roofColor *= mix(0.88, 1.0, seam);

      // 3점 조명 합성
      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = uAmbientSky * uAmbientIntensity;
      vec3 finalColor = roofColor * (diffuse + ambient);

      gl_FragColor = vec4(acesFilmic(finalColor * 1.05), 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // 2. [수직/수평 파사드 좌표 및 층간 분할]
    // -------------------------------------------------------------------------
    float heightMeters = vUv.y;
    float lengthMeters = vUv.x;

    float floorH = 3.0; // 실측 층고 3.0m 엄격 준수
    float floorCoord = heightMeters / floorH;
    float inFloor = fract(floorCoord);
    float floorIdx = floor(floorCoord);

    // -------------------------------------------------------------------------
    // 3. [1층 기단부 상가/로비 구간 (0m ~ 3.5m)]
    // -------------------------------------------------------------------------
    if (heightMeters < 3.5 || partType == 2.0) {
      // 다크 화강석 그레이 (#64748b)
      vec3 graniteColor = vec3(0.392, 0.455, 0.545);
      
      // 석재 패널 줄눈 (1.5m x 1.0m 그리드)
      vec2 panelUv = fract(vec2(lengthMeters / 1.5, heightMeters / 1.0));
      float panelSeam = aastep(0.03, panelUv.x) * aastep(0.03, panelUv.y);
      graniteColor *= mix(0.78, 1.0, panelSeam);

      // 1층 상가 쇼윈도 구분선 및 대형 유리창
      float winH = step(0.65, heightMeters) * (1.0 - step(3.0, heightMeters));
      float winBay = fract(lengthMeters / 3.8);
      float isShopWindow = winH * aabox(vec2(0.10, 0.12), vec2(0.90, 0.94), vec2(winBay, inFloor));

      if (isShopWindow > 0.5) {
        vec3 shopGlass = vec3(0.12, 0.18, 0.28);
        // 쇼윈도 온백색 조명
        shopGlass += vec3(0.50, 0.45, 0.35) * smoothstep(0.65, 0.95, inFloor);
        graniteColor = mix(graniteColor, shopGlass, 0.88);
      }

      // [3. 건물 하단 지면 밀착(Ambient Occlusion)]
      float groundAO = mix(0.42, 1.0, smoothstep(0.0, 0.85, heightMeters));
      float NdotL = max(0.0, dot(N, L));
      vec3 finalColor = graniteColor * (uSunColor * NdotL * uSunIntensity + uAmbientSky * uAmbientIntensity) * groundAO;
      gl_FragColor = vec4(acesFilmic(finalColor * 1.05), 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // 4. [측벽 코어 벽면: 엘리베이터/계단실 무창 콘크리트 및 브랜드 도색 밴드]
    // -------------------------------------------------------------------------
    if (partType == 3.0) {
      // 매끈한 크림 아이보리 콘크리트 외벽 (#f4f1ea)
      vec3 coreWall = vec3(0.957, 0.945, 0.918);

      // 한국 대단지 아파트 특유의 브랜드 포인트 도색 밴드:
      // 네이비 블루 (#1e3a8a) 및 웜 브라운 (#78350f), 다크 슬레이트 (#334155)
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
      vec3 finalColor = coreWall * (uSunColor * NdotL * uSunIntensity + uAmbientSky * uAmbientIntensity);
      gl_FragColor = vec4(acesFilmic(finalColor * 1.05), 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // 5. [본동 외벽: 한국 실제 건축물 유형별 정밀 입면(Facade)]
    // -------------------------------------------------------------------------
    vec3 wallBaseColor = vec3(0.957, 0.945, 0.918); // #f4f1ea 크림 아이보리
    vec3 slabColor = vec3(0.886, 0.910, 0.941);     // #e2e8f0 라이트 웜 그레이
    vec3 frameColor = vec3(0.200, 0.255, 0.333);    // #334155 다크 그레이 섀시

    if (bldType > 1.5) {
      // -----------------------------------------------------------------------
      // [1) 한국형 대단지 아파트 (높이 25m 이상 / apartments)]
      // - 외벽 베이스: 크림 아이보리(#f4f1ea) + 라이트 웜 그레이(#e2e8f0) 투톤 도색
      // - 3.0m 층고마다 선명한 베란다 섀시 프레임(#334155)과 세대간 수직 날개벽(Fin)
      // -----------------------------------------------------------------------
      float twoToneFactor = mod(floorIdx, 3.0) < 1.0 ? 1.0 : 0.0;
      wallBaseColor = mix(vec3(0.957, 0.945, 0.918), vec3(0.886, 0.910, 0.941), twoToneFactor * 0.75);
      slabColor = vec3(0.886, 0.910, 0.941);
      frameColor = vec3(0.200, 0.255, 0.333); // #334155 다크 그레이 섀시
    } else if (bldType > 0.5) {
      // -----------------------------------------------------------------------
      // [2) 시내 대로변 상가/근린생활시설 (높이 9m ~ 24m)]
      // - 화강석/타일 줄눈이 살아있는 베이지·그레이 스톤 외벽 (#d6d3d1)
      // - 넓은 가로형 상가 통유리창 (리본 윈도우)
      // -----------------------------------------------------------------------
      wallBaseColor = vec3(0.839, 0.827, 0.820); // #d6d3d1 스톤 외벽
      slabColor = vec3(0.420, 0.460, 0.520);     // 층간 띠
      frameColor = vec3(0.200, 0.255, 0.333);    // 다크 프레임
    } else {
      // -----------------------------------------------------------------------
      // [3) 저층 주택가 및 군부대 영외/영내 시설 (높이 9m 미만)]
      // - 적벽돌(#9a3412) 및 밝은 회벽(#f1f5f9) 외벽
      // - 정돈된 직사각형 창호 + 얇은 옥상 테두리 두겁석(Parapet)
      // -----------------------------------------------------------------------
      wallBaseColor = vec3(0.604, 0.204, 0.071); // #9a3412 적벽돌
      slabColor = vec3(0.945, 0.961, 0.976);     // 밝은 회벽
      frameColor = vec3(0.980, 0.980, 0.980);    // 화이트 PVC 창호
    }

    // 1) 층간 슬래브 가로 홈 (두께 0.18m)
    float slabBorder = 0.18 / floorH;
    float isSlab = (1.0 - aastep(slabBorder, inFloor)) + aastep(1.0 - slabBorder * 0.5, inFloor);

    // 2) 세대별 수평 베이(Bay) 분할 및 수직 날개벽 (Fin Pillar)
    float bayWidth = (bldType > 1.5) ? 3.4 : (bldType > 0.5 ? 2.5 : 2.8);
    float inBay = fract(lengthMeters / bayWidth);
    float bayIdx = floor(lengthMeters / bayWidth);

    // 세대 사이 수직 콘크리트 날개벽 (Fin: 양쪽 8% 구간)
    float isFinPillar = step(inBay, 0.08) + step(0.92, inBay);

    // 3) 창문 영역 판정 (aabox 안티앨리어싱)
    float winLeft = 0.12;
    float winRight = 0.88;
    float winBottom = (bldType > 1.5) ? 0.38 : (bldType > 0.5 ? 0.20 : 0.25);
    float winTop = (bldType > 0.5 && bldType <= 1.5) ? 0.95 : 0.92; // 상가는 와이드 통유리

    float isWindow = aabox(vec2(winLeft, winBottom), vec2(winRight, winTop), vec2(inBay, inFloor));
    float isFrame = aabox(vec2(winLeft - 0.035, winBottom - 0.035), vec2(winRight + 0.035, winTop + 0.035), vec2(inBay, inFloor)) - isWindow;

    vec3 surfaceColor = wallBaseColor;

    // 상가 화강석/타일 줄눈 질감
    if (bldType > 0.5 && bldType <= 1.5) {
      vec2 tileUv = fract(vec2(lengthMeters / 1.0, heightMeters / 0.6));
      float tileGrout = aastep(0.04, tileUv.x) * aastep(0.05, tileUv.y);
      surfaceColor *= mix(0.82, 1.0, tileGrout);
    }

    // 주택 적벽돌 줄눈
    if (bldType <= 0.5) {
      vec2 brickUv = fract(vec2(lengthMeters / 0.25, heightMeters / 0.12));
      float brickGrout = aastep(0.08, brickUv.x) * aastep(0.12, brickUv.y);
      surfaceColor *= mix(0.75, 1.0, brickGrout);
    }

    if (isSlab > 0.5) {
      surfaceColor = slabColor;
    } else if (isFinPillar > 0.5 && bldType > 1.5) {
      // 아파트 세대 간 수직 콘크리트 날개벽 (라이트 웜그레이 돌출 림)
      surfaceColor = vec3(0.886, 0.910, 0.941);
    } else if (isFrame > 0.5) {
      surfaceColor = frameColor;
    } else if (isWindow > 0.5) {
      // -----------------------------------------------------------------------
      // [의사 인테리어 시차 매핑 및 유리 프레넬 반사 합성]
      // -----------------------------------------------------------------------
      vec2 roomUv = vec2(
        (inBay - winLeft) / (winRight - winLeft),
        (inFloor - winBottom) / (winTop - winBottom)
      );

      float roomSeed = floorIdx * 37.17 + bayIdx * 19.43;
      vec3 interiorColor = getInteriorRoom(roomUv, V, roomSeed);

      // 하늘빛 프레넬 반사광 (Fresnel Reflection)
      float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.5);
      vec3 skyReflection = mix(vec3(0.18, 0.40, 0.78), vec3(0.60, 0.80, 0.98), V.y * 0.5 + 0.5);

      // 유리 표면 합성: 내부 방 조명 + 표면 프레넬 하늘 반사
      vec3 glassFinal = mix(interiorColor, skyReflection, clamp(fresnel + 0.28, 0.0, 0.88));

      surfaceColor = mix(surfaceColor, glassFinal, isWindow);
    } else if (bldType > 1.5 && inFloor < 0.38 && inFloor >= slabBorder) {
      // -----------------------------------------------------------------------
      // [아파트 세대별 발코니 난간살 디테일]
      // -----------------------------------------------------------------------
      float baluster = fract(lengthMeters / 0.30);
      float isBalusterBar = aastep(0.30, baluster);
      surfaceColor = mix(frameColor, wallBaseColor, isBalusterBar * 0.65);
    }

    // -------------------------------------------------------------------------
    // 6. 3점 조명(Three-Point Lighting) 및 디퓨즈/앰비언트 연산
    // -------------------------------------------------------------------------
    float NdotL = max(0.0, dot(N, L));
    vec3 directLight = uSunColor * NdotL * uSunIntensity;

    // 반구 환경광 (하늘빛 블루 + 지면 반사광)
    float hemiFactor = N.y * 0.5 + 0.5;
    vec3 ambientLight = mix(uAmbientGround, uAmbientSky, hemiFactor) * uAmbientIntensity;

    // 층간 슬래브 밑면 미세 요철 음영
    float slabShadow = mix(0.78, 1.0, smoothstep(0.0, slabBorder * 2.5, inFloor));

    // [3. 건물 하단 지면 밀착(Ambient Occlusion)]
    float groundAO = mix(0.48, 1.0, smoothstep(0.0, 1.2, heightMeters));

    vec3 finalColor = surfaceColor * (directLight + ambientLight) * slabShadow * groundAO;

    gl_FragColor = vec4(acesFilmic(finalColor * 1.05), 1.0);
  }
`;

/**
 * 초고해상도 GLSL 파사드 & 인테리어 매핑 ShaderMaterial 팩토리
 */
export function createRealisticCityMaterial(
  options: RealisticCityMaterialOptions = {}
): THREE.ShaderMaterial {
  const sunDir = options.sunDirection || new THREE.Vector3(0.65, 0.75, 0.45).normalize();
  const sunCol = options.sunColor || new THREE.Color(1.0, 0.98, 0.95);
  const skyCol = options.ambientSky || new THREE.Color(0.75, 0.85, 1.0);
  const gndCol = options.ambientGround || new THREE.Color(0.25, 0.28, 0.32);

  const uniforms = {
    uSunDirection: { value: sunDir },
    uSunColor: { value: new THREE.Vector3(sunCol.r, sunCol.g, sunCol.b) },
    uSunIntensity: { value: options.sunIntensity ?? 1.15 },
    uAmbientSky: { value: new THREE.Vector3(skyCol.r, skyCol.g, skyCol.b) },
    uAmbientGround: { value: new THREE.Vector3(gndCol.r, gndCol.g, gndCol.b) },
    uAmbientIntensity: { value: options.ambientIntensity ?? 0.65 },
    uDemTexture: { value: options.demTexture || null },
    uUseDemTexture: { value: Boolean(options.demTexture) },
    uDemExaggeration: { value: 1.0 },
    uOriginElevation: { value: options.originElevation ?? 0.0 },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: realisticCityVertexShader,
    fragmentShader: realisticCityFragmentShader,
    uniforms,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  return mat;
}
