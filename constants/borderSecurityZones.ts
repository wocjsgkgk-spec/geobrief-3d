// 강원특별자치도 접경 5개 군(철원·화천·양구·인제·고성) 안보 관제 데이터셋
// 1) DMZ 완충구역 (Polygon): MDL 기준 남북 약 2km 완충지대
// 2) 군사분계선 (MDL, LineString): 철원 서부 ~ 고성 동해안까지의 정전협정 기준선
// 3) 민간인출입통제선 (CCL, LineString): 접경 5개 군 남방 한계선 인근 좌표열

export const BORDER_DISTRICT_IDS = [
  'cheorwon',
  'hwacheon',
  'yanggu',
  'inje',
  'goseong',
] as const;

export type BorderDistrictId = (typeof BORDER_DISTRICT_IDS)[number];

export const BORDER_SECURITY_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // 1) DMZ 완충구역 (Polygon: MDL 기준 남북 2km 완충지대)
    {
      type: 'Feature',
      id: 'dmz-buffer',
      properties: {
        type: 'dmz-buffer',
        name: '비무장지대 완충구역 (DMZ Buffer Zone)',
        description: '정전협정에 따른 군사분계선 기준 남북 각 2km 완충지대',
        code: 'DMZ-01',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            // 북방한계선 라인 (서 -> 동)
            [127.08, 38.30],
            [127.22, 38.31],
            [127.35, 38.32],
            [127.58, 38.34],
            [127.78, 38.35],
            [128.00, 38.35],
            [128.15, 38.34],
            [128.30, 38.35],
            [128.42, 38.37],
            [128.52, 38.40],
            [128.62, 38.45],
            // 남방한계선 라인 (동 -> 서)
            [128.61, 38.41],
            [128.50, 38.36],
            [128.38, 38.33],
            [128.28, 38.31],
            [128.13, 38.30],
            [127.98, 38.31],
            [127.76, 38.31],
            [127.56, 38.30],
            [127.33, 38.28],
            [127.20, 38.27],
            [127.08, 38.26],
            // 폐합
            [127.08, 38.30],
          ],
        ],
      },
    },

    // 2) 군사분계선 (MDL, LineString: 철원 서부 ~ 고성 동해안 정전협정 기준선)
    {
      type: 'Feature',
      id: 'mdl-line',
      properties: {
        type: 'mdl',
        name: '군사분계선 (Military Demarcation Line, MDL)',
        description: '1953년 7월 27일 정전협정 기준 군사분계선 본선',
        code: 'MDL-LINE',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.08, 38.28],
          [127.15, 38.285],
          [127.22, 38.29],
          [127.35, 38.30],
          [127.48, 38.31],
          [127.60, 38.32],
          [127.78, 38.33],
          [127.90, 38.332],
          [128.00, 38.33],
          [128.15, 38.32],
          [128.28, 38.33],
          [128.40, 38.35],
          [128.52, 38.38],
          [128.58, 38.41],
          [128.62, 38.43],
        ],
      },
    },

    // 3) 민간인출입통제선 (CCL, LineString: 접경 5개 군 남방 한계선 인근 좌표열)
    {
      type: 'Feature',
      id: 'ccl-line',
      properties: {
        type: 'ccl',
        name: '민간인출입통제선 (Civilian Control Line, CCL)',
        description: '군사작전상 민간인의 출입을 제한하는 남방 통제선',
        code: 'CCL-LINE',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.10, 38.21],
          [127.20, 38.22],
          [127.32, 38.23],
          [127.45, 38.24],
          [127.58, 38.25],
          [127.72, 38.255],
          [127.85, 38.25],
          [127.98, 38.24],
          [128.10, 38.23],
          [128.22, 38.25],
          [128.35, 38.265],
          [128.45, 38.29],
          [128.54, 38.33],
          [128.61, 38.36],
        ],
      },
    },
  ],
};
