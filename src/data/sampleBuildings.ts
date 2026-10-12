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

    // 6. 춘천시 온의·퇴계·약사동 도심 아파트 및 메디컬/비즈니스 타워
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
  ],
};
