// 강원권 주요 분석 대상지 인근 3D 건축물 지오메트리 (GeoJSON)
// OpenFreeMap 벡터 타일과 함께 즉각적인 3D 돌출(Extrusion) 음영 렌더링을 보장합니다.

export const SAMPLE_BUILDINGS: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: 'FeatureCollection',
  features: [
    // 1. 양구 펀치볼(해안면) 통일관 및 공공·군사 배후시설
    {
      type: 'Feature',
      properties: {
        name: '을지전망대·안보지원센터',
        height: 22,
        min_height: 0,
        type: 'military_facility',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.1402, 38.2795],
            [128.1412, 38.2795],
            [128.1412, 38.2787],
            [128.1402, 38.2787],
            [128.1402, 38.2795],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '해안면 복합행정타운 본관',
        height: 18,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.1435, 38.2810],
            [128.1448, 38.2810],
            [128.1448, 38.2801],
            [128.1435, 38.2801],
            [128.1435, 38.2810],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '전략비축물류고 A동',
        height: 14,
        min_height: 0,
        type: 'warehouse',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.1422, 38.2765],
            [128.1436, 38.2765],
            [128.1436, 38.2755],
            [128.1422, 38.2755],
            [128.1422, 38.2765],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '전략비축물류고 B동',
        height: 15,
        min_height: 0,
        type: 'warehouse',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.1442, 38.2765],
            [128.1456, 38.2765],
            [128.1456, 38.2755],
            [128.1442, 38.2755],
            [128.1442, 38.2765],
          ],
        ],
      },
    },

    // 2. 춘천 캠프페이지 (반환부지 주변 복합 업무·문화 시설)
    {
      type: 'Feature',
      properties: {
        name: '춘천역 복합환승센터',
        height: 38,
        min_height: 0,
        type: 'transport_hub',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7170, 37.8845],
            [127.7188, 37.8845],
            [127.7188, 37.8832],
            [127.7170, 37.8832],
            [127.7170, 37.8845],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '강원ICT창업혁신관',
        height: 48,
        min_height: 0,
        type: 'innovation_center',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7210, 37.8872],
            [127.7226, 37.8872],
            [127.7226, 37.8858],
            [127.7210, 37.8858],
            [127.7210, 37.8872],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '국방컨벤션센터',
        height: 28,
        min_height: 0,
        type: 'convention',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7235, 37.8850],
            [127.7252, 37.8850],
            [127.7252, 37.8836],
            [127.7235, 37.8836],
            [127.7235, 37.8850],
          ],
        ],
      },
    },

    // 3. 인제 원통리 교차로 군수지원 거점
    {
      type: 'Feature',
      properties: {
        name: '원통 종합수송기지',
        height: 20,
        min_height: 0,
        type: 'logistics',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.2025, 38.1265],
            [128.2045, 38.1265],
            [128.2045, 38.1250],
            [128.2025, 38.1250],
            [128.2025, 38.1265],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '산악안전통제센터 타워',
        height: 35,
        min_height: 0,
        type: 'control_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.2055, 38.1278],
            [128.2068, 38.1278],
            [128.2068, 38.1268],
            [128.2055, 38.1268],
            [128.2055, 38.1278],
          ],
        ],
      },
    },

    // 4. 원주시 무실동·시청 일원 도심 랜드마크 3D 빌딩
    {
      type: 'Feature',
      properties: {
        name: '원주시청 행정타운 본청',
        height: 42,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9280, 37.3445],
            [127.9300, 37.3445],
            [127.9300, 37.3432],
            [127.9280, 37.3432],
            [127.9280, 37.3445],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 무실 혁신비즈니스타워',
        height: 48,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9215, 37.3440],
            [127.9232, 37.3440],
            [127.9232, 37.3428],
            [127.9215, 37.3428],
            [127.9215, 37.3440],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '무실 복합행정·의회센터',
        height: 28,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9220, 37.3408],
            [127.9235, 37.3408],
            [127.9235, 37.3396],
            [127.9220, 37.3396],
            [127.9220, 37.3408],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 첨단산업지원센터 A동',
        height: 35,
        min_height: 0,
        type: 'research_center',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9272, 37.3412],
            [127.9288, 37.3412],
            [127.9288, 37.3398],
            [127.9272, 37.3398],
            [127.9272, 37.3412],
          ],
        ],
      },
    },

    // 5. 원주시 무실·단계동 도심 대단지 아파트 및 상업 타워
    {
      type: 'Feature',
      properties: {
        name: '원주 무실 세영리첼 101동',
        height: 68,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9242, 37.3435],
            [127.9260, 37.3435],
            [127.9260, 37.3424],
            [127.9242, 37.3424],
            [127.9242, 37.3435],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 무실 세영리첼 102동',
        height: 78,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9245, 37.3452],
            [127.9263, 37.3452],
            [127.9263, 37.3441],
            [127.9245, 37.3441],
            [127.9245, 37.3452],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 단계 센트럴파크 103동',
        height: 62,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9295, 37.3465],
            [127.9312, 37.3465],
            [127.9312, 37.3454],
            [127.9295, 37.3454],
            [127.9295, 37.3465],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 혁신비즈니스센터 메인타워',
        height: 58,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9265, 37.3460],
            [127.9282, 37.3460],
            [127.9282, 37.3448],
            [127.9265, 37.3448],
            [127.9265, 37.3460],
          ],
        ],
      },
    },

    // 5-1. 원주시 우산동·학성동 (1군지사 이전부지 배후 도심 고층 아파트 & 비즈니스 센터)
    {
      type: 'Feature',
      properties: {
        name: '원주 우산 센트럴파크 101동',
        height: 72,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9372, 37.3615],
            [127.9390, 37.3615],
            [127.9390, 37.3604],
            [127.9372, 37.3604],
            [127.9372, 37.3615],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 우산 센트럴파크 102동',
        height: 68,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9375, 37.3630],
            [127.9393, 37.3630],
            [127.9393, 37.3619],
            [127.9375, 37.3619],
            [127.9375, 37.3630],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 학성 e편한세상 103동',
        height: 65,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9342, 37.3562],
            [127.9360, 37.3562],
            [127.9360, 37.3551],
            [127.9342, 37.3551],
            [127.9342, 37.3562],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '우산 첨단스마트물류 비즈니스타워',
        height: 46,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9395, 37.3595],
            [127.9412, 37.3595],
            [127.9412, 37.3582],
            [127.9395, 37.3582],
            [127.9395, 37.3595],
          ],
        ],
      },
    },

    // 5-2. 원주시 태장동 (캠프 롱 이전부지 배후 도심 대단지 아파트 & 문화센터)
    {
      type: 'Feature',
      properties: {
        name: '원주 태장 대원칸타빌 201동',
        height: 75,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9592, 37.3768],
            [127.9610, 37.3768],
            [127.9610, 37.3756],
            [127.9592, 37.3756],
            [127.9592, 37.3768],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '원주 태장 대원칸타빌 202동',
        height: 68,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9595, 37.3785],
            [127.9613, 37.3785],
            [127.9613, 37.3773],
            [127.9595, 37.3773],
            [127.9595, 37.3785],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '태장 복합문화체육행정타워',
        height: 38,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9635, 37.3772],
            [127.9652, 37.3772],
            [127.9652, 37.3760],
            [127.9635, 37.3760],
            [127.9635, 37.3772],
          ],
        ],
      },
    },

    // 6. 춘천시 온의·퇴계·약사·근화·석사동 도심 아파트 및 메디컬/비즈니스 타워
    {
      type: 'Feature',
      properties: {
        name: '춘천 근화 스마트에코시티 301동',
        height: 78,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7175, 37.8905],
            [127.7193, 37.8905],
            [127.7193, 37.8893],
            [127.7175, 37.8893],
            [127.7175, 37.8905],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '춘천 석사 현진에버빌 101동',
        height: 69,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7392, 37.8652],
            [127.7410, 37.8652],
            [127.7410, 37.8640],
            [127.7392, 37.8640],
            [127.7392, 37.8652],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '춘천 온의 센트럴 푸르지오 101동',
        height: 82,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7192, 37.8830],
            [127.7210, 37.8830],
            [127.7210, 37.8818],
            [127.7192, 37.8818],
            [127.7192, 37.8830],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '춘천 온의 센트럴 푸르지오 102동',
        height: 75,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7215, 37.8832],
            [127.7232, 37.8832],
            [127.7232, 37.8820],
            [127.7215, 37.8820],
            [127.7215, 37.8832],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '춘천 퇴계 하이테크 비즈니스타워',
        height: 52,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7240, 37.8868],
            [127.7258, 37.8868],
            [127.7258, 37.8855],
            [127.7240, 37.8855],
            [127.7240, 37.8868],
          ],
        ],
      },
    },

    // 7. 강릉시 도심 및 동해안 거점 랜드마크 3D 건축물
    {
      type: 'Feature',
      properties: {
        name: '강릉시청 행정복합타운',
        height: 52,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.8750, 37.7525],
            [128.8770, 37.7525],
            [128.8770, 37.7513],
            [128.8750, 37.7513],
            [128.8750, 37.7525],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '강릉역 KTX 광역복합환승센터',
        height: 45,
        min_height: 0,
        type: 'transport_hub',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.8975, 37.7652],
            [128.8995, 37.7652],
            [128.8995, 37.7638],
            [128.8975, 37.7638],
            [128.8975, 37.7652],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '강릉 올림픽파크 하키센터·아레나',
        height: 36,
        min_height: 0,
        type: 'convention',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.8960, 37.7745],
            [128.8980, 37.7745],
            [128.8980, 37.7725],
            [128.8960, 37.7725],
            [128.8960, 37.7745],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '강릉 교동 센트럴파크 101동',
        height: 65,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.8810, 37.7610],
            [128.8830, 37.7610],
            [128.8830, 37.7595],
            [128.8810, 37.7595],
            [128.8810, 37.7610],
          ],
        ],
      },
    },

    // 8. 동해시 항만물류 및 해안산업 랜드마크
    {
      type: 'Feature',
      properties: {
        name: '동해시청 행정종합청사',
        height: 42,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [129.1130, 37.5255],
            [129.1150, 37.5255],
            [129.1150, 37.5240],
            [129.1130, 37.5240],
            [129.1130, 37.5255],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '동해항 국제해양물류지원센터',
        height: 38,
        min_height: 0,
        type: 'logistics',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [129.1400, 37.4990],
            [129.1420, 37.4990],
            [129.1420, 37.4970],
            [129.1400, 37.4970],
            [129.1400, 37.4990],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '천곡 센트럴비즈니스타워',
        height: 52,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [129.1110, 37.5270],
            [129.1130, 37.5270],
            [129.1130, 37.5255],
            [129.1110, 37.5255],
            [129.1110, 37.5270],
          ],
        ],
      },
    },

    // 9. 태백시 고원 산악 분지 랜드마크
    {
      type: 'Feature',
      properties: {
        name: '태백시청 본청 및 의회복합타운',
        height: 38,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.9875, 37.1650],
            [128.9895, 37.1650],
            [128.9895, 37.1635],
            [128.9875, 37.1635],
            [128.9875, 37.1650],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '황지연못 고원비즈니스센터',
        height: 48,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.9860, 37.1730],
            [128.9880, 37.1730],
            [128.9880, 37.1710],
            [128.9860, 37.1710],
            [128.9860, 37.1730],
          ],
        ],
      },
    },

    // 10. 속초시 설악·동해안 거점 랜드마크
    {
      type: 'Feature',
      properties: {
        name: '속초시청 행정복합청사',
        height: 35,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.5905, 38.2078],
            [128.5925, 38.2078],
            [128.5925, 38.2062],
            [128.5905, 38.2062],
            [128.5905, 38.2078],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '청초호 엑스포타워 랜드마크',
        height: 74,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.5850, 38.1970],
            [128.5870, 38.1970],
            [128.5870, 38.1950],
            [128.5850, 38.1950],
            [128.5850, 38.1970],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '속초 디오션자이 주상복합 타워',
        height: 85,
        min_height: 0,
        type: 'residential',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.5920, 38.2060],
            [128.5940, 38.2060],
            [128.5940, 38.2040],
            [128.5920, 38.2040],
            [128.5920, 38.2060],
          ],
        ],
      },
    },

    // 11. 삼척시 에너지·해양복합 거점 랜드마크
    {
      type: 'Feature',
      properties: {
        name: '삼척시청 행정타운 본관',
        height: 36,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [129.1645, 37.4508],
            [129.1665, 37.4508],
            [129.1665, 37.4490],
            [129.1645, 37.4490],
            [129.1645, 37.4508],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '삼척 복합에너지그리드 혁신연구관',
        height: 45,
        min_height: 0,
        type: 'research_center',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [129.1670, 37.4480],
            [129.1690, 37.4480],
            [129.1690, 37.4460],
            [129.1670, 37.4460],
            [129.1670, 37.4480],
          ],
        ],
      },
    },

    // 12. 홍천군 광역교통 및 바이오·군수 거점
    {
      type: 'Feature',
      properties: {
        name: '홍천군청 행정종합청사',
        height: 32,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.8875, 37.6980],
            [127.8895, 37.6980],
            [127.8895, 37.6965],
            [127.8875, 37.6965],
            [127.8875, 37.6980],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '홍천 첨단바이오국가산단 R&D 타워',
        height: 48,
        min_height: 0,
        type: 'research_center',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.8910, 37.6950],
            [127.8930, 37.6950],
            [127.8930, 37.6930],
            [127.8910, 37.6930],
            [127.8910, 37.6950],
          ],
        ],
      },
    },

    // 13. 횡성군 이모빌리티·항공연계 거점
    {
      type: 'Feature',
      properties: {
        name: '횡성군청 본청 행정관',
        height: 30,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9840, 37.4928],
            [127.9860, 37.4928],
            [127.9860, 37.4910],
            [127.9840, 37.4910],
            [127.9840, 37.4928],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '횡성 이모빌리티(e-Mobility) 혁신연구센터',
        height: 42,
        min_height: 0,
        type: 'innovation_center',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.9870, 37.4900],
            [127.9890, 37.4900],
            [127.9890, 37.4880],
            [127.9870, 37.4880],
            [127.9870, 37.4900],
          ],
        ],
      },
    },

    // 14. 영월군 드론산업 및 문화 거점
    {
      type: 'Feature',
      properties: {
        name: '영월군청 행정타운',
        height: 28,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.4610, 37.1848],
            [128.4630, 37.1848],
            [128.4630, 37.1830],
            [128.4610, 37.1830],
            [128.4610, 37.1848],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '영월 드론전용비행시험 관제센터',
        height: 38,
        min_height: 0,
        type: 'control_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.4560, 37.1900],
            [128.4580, 37.1900],
            [128.4580, 37.1880],
            [128.4560, 37.1880],
            [128.4560, 37.1900],
          ],
        ],
      },
    },

    // 15. 평창군 올림픽 유산 및 고원 거점
    {
      type: 'Feature',
      properties: {
        name: '평창군청 본청',
        height: 30,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.3890, 37.3715],
            [128.3910, 37.3715],
            [128.3910, 37.3695],
            [128.3890, 37.3695],
            [128.3890, 37.3715],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '알펜시아 인터내셔널 컨벤션센터',
        height: 45,
        min_height: 0,
        type: 'convention',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.6710, 37.6550],
            [128.6730, 37.6550],
            [128.6730, 37.6530],
            [128.6710, 37.6530],
            [128.6710, 37.6550],
          ],
        ],
      },
    },

    // 16. 정선군 고원 산악 관광·재난 거점
    {
      type: 'Feature',
      properties: {
        name: '정선군청 행정종합타운',
        height: 32,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.6595, 37.3815],
            [128.6615, 37.3815],
            [128.6615, 37.3795],
            [128.6595, 37.3795],
            [128.6595, 37.3815],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '사북 고원복합행정지원관',
        height: 40,
        min_height: 0,
        type: 'commercial_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.8150, 37.2280],
            [128.8170, 37.2280],
            [128.8170, 37.2260],
            [128.8150, 37.2260],
            [128.8150, 37.2280],
          ],
        ],
      },
    },

    // 17. 철원군 [접경] 평화·안보 및 군사시설 거점
    {
      type: 'Feature',
      properties: {
        name: '철원군청 본청 행정타운',
        height: 30,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.3120, 38.1478],
            [127.3145, 38.1478],
            [127.3145, 38.1460],
            [127.3120, 38.1460],
            [127.3120, 38.1478],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '고석정 한탄강 관광안보센터',
        height: 32,
        min_height: 0,
        type: 'convention',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.2870, 38.1930],
            [127.2890, 38.1930],
            [127.2890, 38.1910],
            [127.2870, 38.1910],
            [127.2870, 38.1930],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '철원 DMZ 평화통일복합지원타운',
        height: 38,
        min_height: 0,
        type: 'military_facility',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.2020, 38.2580],
            [127.2040, 38.2580],
            [127.2040, 38.2560],
            [127.2020, 38.2560],
            [127.2020, 38.2580],
          ],
        ],
      },
    },

    // 18. 화천군 [접경] 북한강 수계 및 안보 거점
    {
      type: 'Feature',
      properties: {
        name: '화천군청 행정타운 본관',
        height: 32,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.7070, 38.1072],
            [127.7095, 38.1072],
            [127.7095, 38.1055],
            [127.7070, 38.1055],
            [127.7070, 38.1072],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '평화의댐 수계통제 및 안보관',
        height: 35,
        min_height: 0,
        type: 'control_tower',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [127.8470, 38.2120],
            [127.8490, 38.2120],
            [127.8490, 38.2100],
            [127.8470, 38.2100],
            [127.8470, 38.2120],
          ],
        ],
      },
    },

    // 19. 고성군 [접경] 동해안 최북단 안보 및 통일 거점
    {
      type: 'Feature',
      properties: {
        name: '고성군청 행정복합타운',
        height: 32,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.4665, 38.3818],
            [128.4690, 38.3818],
            [128.4690, 38.3798],
            [128.4665, 38.3798],
            [128.4665, 38.3818],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '통일전망대 평화타워 본관',
        height: 48,
        min_height: 0,
        type: 'military_facility',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.3960, 38.5840],
            [128.3980, 38.5840],
            [128.3980, 38.5820],
            [128.3960, 38.5820],
            [128.3960, 38.5840],
          ],
        ],
      },
    },

    // 20. 양양군 해양산업 및 항공물류 거점
    {
      type: 'Feature',
      properties: {
        name: '양양군청 본관 행정청사',
        height: 32,
        min_height: 0,
        type: 'public_office',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.6275, 38.0765],
            [128.6300, 38.0765],
            [128.6300, 38.0745],
            [128.6275, 38.0745],
            [128.6275, 38.0765],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '양양국제공항 화물물류지원센터',
        height: 26,
        min_height: 0,
        type: 'transport_hub',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [128.6640, 38.0620],
            [128.6660, 38.0620],
            [128.6660, 38.0600],
            [128.6640, 38.0600],
            [128.6640, 38.0620],
          ],
        ],
      },
    },
  ],
};
