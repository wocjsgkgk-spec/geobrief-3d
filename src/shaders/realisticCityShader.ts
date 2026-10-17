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
}

export const realisticCityVertexShader = /* glsl */ `
  // aBuildingData: x: bldType(0=주택, 1=상업, 2=아파트), y: floors(층수), z: partType(0=외벽, 1=옥상, 2=기단부, 3=측벽코어), w: wallLength
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

    // [3단계: GPU Terrain Clamping] DEM 텍스처를 읽어 정점 높이를 지표면에 즉시 안착
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
    float bldType = vBuildingData.x;  // 0: 주택, 1: 상업, 2: 아파트
    float floors = vBuildingData.y;   // 층수
    float partType = vBuildingData.z; // 0: 외벽, 1: 옥상, 2: 기단부, 3: 측벽코어
    float wallLength = max(1.0, vBuildingData.w);

    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(uSunDirection);

    // -------------------------------------------------------------------------
    // 1. [옥상 슬래브 마감] (partType == 1.0 또는 수직 법선 N.y > 0.85 / N.z > 0.85)
    // -------------------------------------------------------------------------
    if (partType > 0.5 || abs(N.y) > 0.85 || abs(N.z) > 0.85) {
      // 한국형 초록 우레탄 (#15803d) 또는 고층 콘크리트 슬래브 (#334155)
      vec3 roofColor = (floors >= 10.0 || bldType > 1.5) 
                       ? vec3(0.20, 0.25, 0.33)  // 고층 다크 슬레이트
                       : vec3(0.08, 0.50, 0.24); // 중저층 초록 우레탄 방수

      // 가장자리 0.8m 난간 내측 앰비언트 오클루전(Parapet AO)
      float edgeDistX = min(vUv.x, max(0.0, wallLength - vUv.x));
      float edgeAO = smoothstep(0.0, 1.2, edgeDistX);
      roofColor *= mix(0.55, 1.0, edgeAO);

      // 슬래브 미세 콘크리트 패널 줄눈
      vec2 tileUv = fract(vUv * 0.25);
      float seam = aastep(0.02, tileUv.x) * aastep(0.02, tileUv.y);
      roofColor *= mix(0.85, 1.0, seam);

      // 3점 조명 합성
      float NdotL = max(0.0, dot(N, L));
      vec3 diffuse = uSunColor * NdotL * uSunIntensity;
      vec3 ambient = uAmbientSky * uAmbientIntensity;
      vec3 finalColor = roofColor * (diffuse + ambient);

      gl_FragColor = vec4(finalColor, 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // 2. [수직/수평 파사드 좌표 계산]
    // -------------------------------------------------------------------------
    float heightMeters = vUv.y;
    float lengthMeters = vUv.x;

    float floorH = 3.0; // 층고 3.0m 기준
    float floorCoord = heightMeters / floorH;
    float inFloor = fract(floorCoord);
    float floorIdx = floor(floorCoord);

    // -------------------------------------------------------------------------
    // 3. [1층 기단부 상가/로비 구간 (0m ~ 3.5m)]
    // -------------------------------------------------------------------------
    if (heightMeters < 3.5 || partType == 2.0) {
      // 다크 화강석 그레이 (#64748b)
      vec3 graniteColor = vec3(0.39, 0.45, 0.55);
      
      // 석재 패널 줄눈 (1.5m x 1.0m 그리드)
      vec2 panelUv = fract(vec2(lengthMeters / 1.5, heightMeters / 1.0));
      float panelSeam = aastep(0.03, panelUv.x) * aastep(0.03, panelUv.y);
      graniteColor *= mix(0.75, 1.0, panelSeam);

      // 1층 상가 출입문/쇼윈도 글래스 영역
      float winH = step(0.6, heightMeters) * (1.0 - step(3.0, heightMeters));
      float winBay = fract(lengthMeters / 4.0);
      float isShopWindow = winH * aabox(vec2(0.12, 0.15), vec2(0.88, 0.95), vec2(winBay, inFloor));

      if (isShopWindow > 0.5) {
        vec3 shopGlass = vec3(0.15, 0.22, 0.32);
        // 쇼윈도 조명 하이라이트
        shopGlass += vec3(0.45, 0.40, 0.30) * smoothstep(0.7, 0.95, inFloor);
        graniteColor = mix(graniteColor, shopGlass, 0.85);
      }

      float NdotL = max(0.0, dot(N, L));
      vec3 finalColor = graniteColor * (uSunColor * NdotL * uSunIntensity + uAmbientSky * uAmbientIntensity);
      gl_FragColor = vec4(finalColor, 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // 4. [측벽 코어 벽면: 엘리베이터/계단실 무창 콘크리트 및 브랜드 라인]
    // -------------------------------------------------------------------------
    if (partType == 3.0) {
      vec3 coreWall = vec3(0.88, 0.91, 0.94);
      // 수직 브랜드 액센트 라인 (너비 0.6m 스트라이프)
      float stripe = aabox(vec2(0.35, 0.0), vec2(0.55, 1.0), vec2(fract(lengthMeters / wallLength), 0.5));
      coreWall = mix(coreWall, vec3(0.15, 0.35, 0.65), stripe);

      float NdotL = max(0.0, dot(N, L));
      vec3 finalColor = coreWall * (uSunColor * NdotL * uSunIntensity + uAmbientSky * uAmbientIntensity);
      gl_FragColor = vec4(finalColor, 1.0);
      return;
    }

    // -------------------------------------------------------------------------
    // 5. [본동 외벽: 건물 유형별 고밀도 GLSL 파사드 렌더링]
    // -------------------------------------------------------------------------
    vec3 wallBaseColor = vec3(0.97, 0.98, 0.99); // 아파트 화이트 콘크리트
    vec3 slabColor = vec3(0.80, 0.84, 0.88);     // 층간 슬래브 분할선
    vec3 frameColor = vec3(0.88, 0.90, 0.92);    // 알루미늄/하이섀시 프레임

    if (bldType < 0.5) {
      // 일반 주택: 웜 베이지
      wallBaseColor = vec3(0.95, 0.93, 0.89);
    } else if (bldType < 1.5) {
      // 상업 빌딩: 쿨 그레이/블루
      wallBaseColor = vec3(0.82, 0.86, 0.92);
      slabColor = vec3(0.35, 0.40, 0.48);
      frameColor = vec3(0.25, 0.28, 0.35);
    }

    // 1) 층간 슬래브 가로 홈 (두께 0.18m)
    float slabBorder = 0.18 / floorH;
    float isSlab = (1.0 - aastep(slabBorder, inFloor)) + aastep(1.0 - slabBorder * 0.5, inFloor);

    // 2) 세대별 수평 베이(Bay) 분할
    float bayWidth = (bldType > 1.5) ? 3.4 : (bldType > 0.5 ? 2.4 : 3.0);
    float inBay = fract(lengthMeters / bayWidth);
    float bayIdx = floor(lengthMeters / bayWidth);

    // 3) 창문 영역 판정 (aabox 안티앨리어싱)
    float winLeft = 0.12;
    float winRight = 0.88;
    float winBottom = (bldType > 1.5) ? 0.38 : 0.22; // 아파트는 발코니 난간 높이 위부터 창문
    float winTop = 0.92;

    float isWindow = aabox(vec2(winLeft, winBottom), vec2(winRight, winTop), vec2(inBay, inFloor));
    float isFrame = aabox(vec2(winLeft - 0.04, winBottom - 0.04), vec2(winRight + 0.04, winTop + 0.04), vec2(inBay, inFloor)) - isWindow;

    vec3 surfaceColor = wallBaseColor;

    if (isSlab > 0.5) {
      surfaceColor = slabColor;
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
      vec3 skyReflection = mix(vec3(0.20, 0.45, 0.85), vec3(0.65, 0.85, 1.0), V.y * 0.5 + 0.5);

      // 유리 표면 합성: 내부 방 조명 + 표면 프레넬 하늘 반사
      vec3 glassFinal = mix(interiorColor, skyReflection, clamp(fresnel + 0.25, 0.0, 0.85));

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

    vec3 finalColor = surfaceColor * (directLight + ambientLight) * slabShadow;

    gl_FragColor = vec4(finalColor, 1.0);
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
