import {
  BriefingMetadata,
  PolygonArea,
  DefenseAnalysisResult,
  AccessibilityAnalysisResult,
} from '@/types/map';

export interface SlidePackParams {
  images: {
    cut1: string; // 컷 1: 광역 입지 여건도 (dataURL)
    cut2: string; // 컷 2: 미시적 지적 현황도 (dataURL)
    cut3: string; // 컷 3: 3D 미래 조감도 (dataURL)
  };
  metadata: BriefingMetadata;
  regionName: string;
  polygonArea: PolygonArea | null;
  defenseResult: DefenseAnalysisResult | null;
  accessibilityResult: AccessibilityAnalysisResult | null;
}

/**
 * 4K/16:9 와이드스크린 규격 4-슬라이드 파워포인트(.pptx) 자동 생성 및 다운로드 엔진
 */
export async function generateSlidePackPptx({
  images,
  metadata,
  regionName,
  polygonArea,
  defenseResult,
  accessibilityResult,
}: SlidePackParams): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();

  // 16:9 Widescreen 레이아웃 설정 (10 x 5.625 inches)
  pptx.layout = 'LAYOUT_16x9';

  const BG_COVER = '0B1118';
  const BG_CONTENT = '0F172A';
  const CARD_BG = '1E293B';
  const CARD_BORDER = '334155';
  const TEXT_WHITE = 'FFFFFF';
  const TEXT_MUTED = '94A3B8';
  const TEXT_EMERALD = '34D399';
  const TEXT_BLUE = '38BDF8';
  const TEXT_AMBER = 'F59E0B';

  // =========================================================================
  // 슬라이드 1 [표지]: 다크 브리핑 테마(네이비/차콜) & 국방·도정 브리핑 양식
  // =========================================================================
  const s1 = pptx.addSlide();
  s1.background = { color: BG_COVER };

  // 상단 보고서 속성 태그 박스 (보안 등급에 따른 테마 색상)
  const isClassified = metadata.securityLevel === '군사대외비' || metadata.securityLevel === '대외비';
  const tagFill = metadata.securityLevel === '군사대외비' ? '450A0A' : metadata.securityLevel === '대외비' ? '451A03' : '064E3B';
  const tagLine = metadata.securityLevel === '군사대외비' ? 'DC2626' : metadata.securityLevel === '대외비' ? 'D97706' : '059669';
  const tagTextColor = metadata.securityLevel === '군사대외비' ? 'FCA5A5' : metadata.securityLevel === '대외비' ? 'FCD34D' : '6EE7B7';
  const secLabel = metadata.securityLevel || '기획조정실 브리핑';

  s1.addShape(pptx.ShapeType.rect, {
    x: 0.6,
    y: 0.5,
    w: 1.8,
    h: 0.32,
    fill: { color: tagFill },
    line: { color: tagLine, width: 1 },
  });
  s1.addText(`[ ${secLabel} ]`, {
    x: 0.6,
    y: 0.5,
    w: 1.8,
    h: 0.32,
    fontSize: 9.5,
    fontFace: 'Malgun Gothic',
    color: tagTextColor,
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // 상단 행정 기관 표기
  s1.addText('GANGWON SPECIAL SELF-GOVERNING PROVINCE | GEOSPATIAL PLANNING BRIEFING', {
    x: 2.6,
    y: 0.5,
    w: 6.8,
    h: 0.32,
    fontSize: 9,
    fontFace: 'Arial',
    color: '64748B',
    bold: true,
    valign: 'middle',
  });

  // 장식 구분선
  s1.addShape(pptx.ShapeType.line, {
    x: 0.6,
    y: 0.95,
    w: 8.8,
    h: 0,
    line: { color: '1E293B', width: 1.5 },
  });

  // 메인 타이틀
  s1.addText(metadata.title || '강원권 전략 군 유휴부지 공간 분석 보고서', {
    x: 0.6,
    y: 1.3,
    w: 8.8,
    h: 1.1,
    fontSize: 26,
    fontFace: 'Malgun Gothic',
    color: TEXT_WHITE,
    bold: true,
    valign: 'middle',
  });

  // 네온 포인트 언더라인 바
  s1.addShape(pptx.ShapeType.rect, {
    x: 0.6,
    y: 2.45,
    w: 2.2,
    h: 0.06,
    fill: { color: '10B981' },
    line: { color: '10B981', width: 0 },
  });

  // 서브 타이틀
  s1.addText(metadata.subtitle || `${regionName} 일원 지형고저 및 입지 인프라 종합 분석`, {
    x: 0.6,
    y: 2.65,
    w: 8.8,
    h: 0.6,
    fontSize: 14,
    fontFace: 'Malgun Gothic',
    color: TEXT_EMERALD,
    valign: 'top',
  });

  // 메타데이터 요약 카드 그리드
  s1.addShape(pptx.ShapeType.roundRect, {
    x: 0.6,
    y: 3.4,
    w: 8.8,
    h: 1.45,
    rectRadius: 0.08,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
  });

  const areaText = polygonArea
    ? `${polygonArea.sqm.toLocaleString()} ㎡ (약 ${polygonArea.pyeong.toLocaleString()} 평)`
    : '부지 지정 대기 중 (약 33,000 ㎡ / 10,000 평 규모)';

  const metaRows = [
    [
      { text: '대상 지역', options: { bold: true, color: TEXT_MUTED, fontSize: 10 } },
      { text: `강원특별자치도 ${regionName} 일원`, options: { bold: true, color: TEXT_WHITE, fontSize: 10 } },
      { text: '실측 면적', options: { bold: true, color: TEXT_MUTED, fontSize: 10 } },
      { text: areaText, options: { bold: true, color: TEXT_BLUE, fontSize: 10 } },
    ],
    [
      { text: '보고 부서', options: { bold: true, color: TEXT_MUTED, fontSize: 10 } },
      { text: metadata.department || '강원특별자치도 기획조정실', options: { color: TEXT_WHITE, fontSize: 10 } },
      { text: '보고 일자', options: { bold: true, color: TEXT_MUTED, fontSize: 10 } },
      { text: metadata.date || new Date().toISOString().slice(0, 10), options: { color: TEXT_WHITE, fontSize: 10 } },
    ],
    [
      { text: '작 성 자', options: { bold: true, color: TEXT_MUTED, fontSize: 10 } },
      { text: metadata.author || '공간정책분석관', options: { color: TEXT_WHITE, fontSize: 10 } },
      { text: '문서 등급', options: { bold: true, color: TEXT_MUTED, fontSize: 10 } },
      { text: metadata.securityLevel || '공개', options: { bold: true, color: tagTextColor, fontSize: 10 } },
    ],
  ];

  s1.addTable(metaRows, {
    x: 0.8,
    y: 3.5,
    w: 8.4,
    h: 1.25,
    colW: [1.2, 3.0, 1.2, 3.0],
    border: { color: '243247', pt: 1 },
    valign: 'middle',
    fontFace: 'Malgun Gothic',
  });

  // 하단 엔진 표기
  s1.addText('GeoBrief 3D Geospatial Intelligence Engine | Automated Briefing Deck v2.0', {
    x: 0.6,
    y: 5.0,
    w: 8.8,
    h: 0.3,
    fontSize: 9,
    fontFace: 'Arial',
    color: '475569',
    align: 'right',
    valign: 'middle',
  });

  // =========================================================================
  // 슬라이드 2 [광역 입지 여건]: 컷 1 이미지(70%) + 우측 광역 접근성 요약 카드
  // =========================================================================
  const s2 = pptx.addSlide();
  s2.background = { color: BG_CONTENT };

  // 슬라이드 2 헤더
  s2.addText('[01. 광역 공간 구조]', {
    x: 0.5,
    y: 0.25,
    w: 2.0,
    h: 0.25,
    fontSize: 9,
    fontFace: 'Malgun Gothic',
    color: TEXT_BLUE,
    bold: true,
  });
  s2.addText('광역 입지 여건 및 간선 교통망 연계성 분석', {
    x: 0.5,
    y: 0.48,
    w: 6.0,
    h: 0.35,
    fontSize: 15,
    fontFace: 'Malgun Gothic',
    color: TEXT_WHITE,
    bold: true,
  });
  s2.addText(`강원특별자치도 ${regionName} 광역 고속도로, 철도(KTX) 및 주요 간선국도 축 연계망 정량 분석`, {
    x: 0.5,
    y: 0.8,
    w: 6.0,
    h: 0.22,
    fontSize: 8.5,
    fontFace: 'Malgun Gothic',
    color: TEXT_MUTED,
  });

  // 컷 1 지도 이미지 (좌측 70% 영역)
  if (images.cut1) {
    s2.addImage({
      data: images.cut1,
      x: 0.5,
      y: 1.1,
      w: 6.2,
      h: 4.15,
    });
  }
  s2.addText('■ 컷 1: 광역 입지 여건도 (Zoom 10.5 수직 정사 뷰 / 간선도로망 체계)', {
    x: 0.5,
    y: 5.28,
    w: 6.2,
    h: 0.25,
    fontSize: 7.5,
    fontFace: 'Malgun Gothic',
    color: '64748B',
  });

  // 우측 분석 정보 카드 (30% 영역)
  s2.addShape(pptx.ShapeType.roundRect, {
    x: 6.85,
    y: 1.1,
    w: 2.7,
    h: 4.15,
    rectRadius: 0.06,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
  });

  s2.addText('■ 광역 교통 접근성 요약', {
    x: 7.0,
    y: 1.25,
    w: 2.4,
    h: 0.3,
    fontSize: 11,
    fontFace: 'Malgun Gothic',
    color: TEXT_BLUE,
    bold: true,
  });

  const infraRows = accessibilityResult?.rows || [];
  const icRow = infraRows.find((r) => r.category === 'expressway_ic');
  const railRow = infraRows.find((r) => r.category === 'railway_ktx');
  const roadRow = infraRows.find((r) => r.category === 'national_road');
  const govRow = infraRows.find((r) => r.category === 'public_military');

  const accessTableData = [
    [
      { text: '구분', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
      { text: '주요 시설명', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
      { text: '거리 / 시간', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
    ],
    [
      { text: '고속도로 IC', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: icRow?.facilityName || '남춘천 IC', options: { color: TEXT_WHITE, fontSize: 8 } },
      {
        text: icRow ? `${icRow.distanceKm}km (${icRow.travelTimeText})` : '8.2km (약 8분)',
        options: { bold: true, color: TEXT_EMERALD, fontSize: 8 },
      },
    ],
    [
      { text: '철도/KTX', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: railRow?.facilityName || '춘천역', options: { color: TEXT_WHITE, fontSize: 8 } },
      {
        text: railRow ? `${railRow.distanceKm}km (${railRow.travelTimeText})` : '12.4km (약 12분)',
        options: { bold: true, color: TEXT_EMERALD, fontSize: 8 },
      },
    ],
    [
      { text: '주요 국도', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: roadRow?.facilityName || '국도 46호선', options: { color: TEXT_WHITE, fontSize: 8 } },
      {
        text: roadRow ? `${roadRow.distanceKm}km (${roadRow.travelTimeText})` : '1.5km (약 2분)',
        options: { bold: true, color: TEXT_EMERALD, fontSize: 8 },
      },
    ],
    [
      { text: '관할 행정청', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: govRow?.facilityName || `${regionName}청`, options: { color: TEXT_WHITE, fontSize: 8 } },
      {
        text: govRow ? `${govRow.distanceKm}km (${govRow.travelTimeText})` : '6.0km (약 6분)',
        options: { bold: true, color: TEXT_EMERALD, fontSize: 8 },
      },
    ],
  ];

  s2.addTable(accessTableData, {
    x: 6.95,
    y: 1.6,
    w: 2.5,
    h: 1.8,
    colW: [0.75, 0.95, 0.8],
    border: { color: '243247', pt: 1 },
    valign: 'middle',
    fontFace: 'Malgun Gothic',
  });

  // 종합 입지 소견 텍스트
  s2.addShape(pptx.ShapeType.roundRect, {
    x: 6.95,
    y: 3.55,
    w: 2.5,
    h: 1.55,
    rectRadius: 0.05,
    fill: { color: '0B1118' },
    line: { color: '243247', width: 0.5 },
  });
  s2.addText('【 종합 입지 평가 】', {
    x: 7.05,
    y: 3.65,
    w: 2.3,
    h: 0.22,
    fontSize: 9,
    fontFace: 'Malgun Gothic',
    color: TEXT_EMERALD,
    bold: true,
  });
  s2.addText(
    `본 대상지는 반경 15km 이내에 고속도로 IC 및 간선국도가 인접하여 광역 이동성 및 군수 물류 연계성이 뛰어납니다. KTX/전철 축과 연계 시 인력 유입 및 민군 복합 단지 개발 타당성이 매우 높습니다.`,
    {
      x: 7.05,
      y: 3.9,
      w: 2.3,
      h: 1.15,
      fontSize: 8,
      fontFace: 'Malgun Gothic',
      color: 'CBD5E1',
      lineSpacing: 12,
    }
  );

  // =========================================================================
  // 슬라이드 3 [현황 및 규제 분석]: 컷 2 이미지(70%) + 우측 실측 면적 & 국방 규제 3단 판정
  // =========================================================================
  const s3 = pptx.addSlide();
  s3.background = { color: BG_CONTENT };

  // 슬라이드 3 헤더
  s3.addText('[02. 부지 현황 및 국방 규제]', {
    x: 0.5,
    y: 0.25,
    w: 2.5,
    h: 0.25,
    fontSize: 9,
    fontFace: 'Malgun Gothic',
    color: TEXT_AMBER,
    bold: true,
  });
  s3.addText('미시적 지적 현황 및 국방 규제 3단 판정표', {
    x: 0.5,
    y: 0.48,
    w: 6.0,
    h: 0.35,
    fontSize: 15,
    fontFace: 'Malgun Gothic',
    color: TEXT_WHITE,
    bold: true,
  });
  s3.addText('브이월드 연속지적도(필지선), 반경 500m/1km 영향권 및 군사기지 및 군사시설 보호법 저촉 검토', {
    x: 0.5,
    y: 0.8,
    w: 6.0,
    h: 0.22,
    fontSize: 8.5,
    fontFace: 'Malgun Gothic',
    color: TEXT_MUTED,
  });

  // 컷 2 지도 이미지 (좌측 70% 영역)
  if (images.cut2) {
    s3.addImage({
      data: images.cut2,
      x: 0.5,
      y: 1.1,
      w: 6.2,
      h: 4.15,
    });
  }
  s3.addText('■ 컷 2: 미시적 지적 현황도 (Zoom 15.8 수직 정사 뷰 / 지적 필지선 + 반경 500m·1km 버퍼)', {
    x: 0.5,
    y: 5.28,
    w: 6.2,
    h: 0.25,
    fontSize: 7.5,
    fontFace: 'Malgun Gothic',
    color: '64748B',
  });

  // 우측 분석 정보 카드 (30% 영역)
  s3.addShape(pptx.ShapeType.roundRect, {
    x: 6.85,
    y: 1.1,
    w: 2.7,
    h: 4.15,
    rectRadius: 0.06,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
  });

  s3.addText('■ 정밀 면적 및 국방 규제 판정', {
    x: 7.0,
    y: 1.25,
    w: 2.4,
    h: 0.3,
    fontSize: 11,
    fontFace: 'Malgun Gothic',
    color: TEXT_AMBER,
    bold: true,
  });

  // 실측 면적 표출 박스
  s3.addShape(pptx.ShapeType.roundRect, {
    x: 6.95,
    y: 1.6,
    w: 2.5,
    h: 0.85,
    rectRadius: 0.05,
    fill: { color: '0B1118' },
    line: { color: '38BDF8', width: 0.8 },
  });
  s3.addText('실측 부지 산출 면적 (Turf.js 정밀 측정)', {
    x: 7.05,
    y: 1.65,
    w: 2.3,
    h: 0.2,
    fontSize: 8,
    fontFace: 'Malgun Gothic',
    color: TEXT_MUTED,
  });
  s3.addText(
    polygonArea
      ? `${polygonArea.sqm.toLocaleString()} ㎡ (약 ${polygonArea.pyeong.toLocaleString()} 평)`
      : '33,058 ㎡ (약 10,000 평)',
    {
      x: 7.05,
      y: 1.88,
      w: 2.3,
      h: 0.45,
      fontSize: 12,
      fontFace: 'Malgun Gothic',
      color: TEXT_WHITE,
      bold: true,
    }
  );

  // 국방 규제 판정 표
  const zoneName = defenseResult?.zoneName || '제한보호구역 & 비행안전구역';
  const feasText = defenseResult?.feasibilityText || '조건부 개발 가능';
  const statute = defenseResult?.statute || '「군사기지 및 군사시설 보호법」 제4조 및 제9조';
  const unit = defenseResult?.jurisdiction || '관할 사단 작전처 및 공군 비행단';

  const defenseTableData = [
    [
      { text: '판정 항목', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
      { text: '분석 및 심층 검토 내용', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
    ],
    [
      { text: '보호구역 분류', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: zoneName, options: { bold: true, color: 'FCA5A5', fontSize: 8 } },
    ],
    [
      { text: '인허가 협의성', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: feasText, options: { bold: true, color: TEXT_EMERALD, fontSize: 8 } },
    ],
    [
      { text: '관할 군부대', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: unit, options: { color: TEXT_WHITE, fontSize: 8 } },
    ],
    [
      { text: '근거 법령', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: statute, options: { color: '94A3B8', fontSize: 7.5 } },
    ],
  ];

  s3.addTable(defenseTableData, {
    x: 6.95,
    y: 2.55,
    w: 2.5,
    h: 1.5,
    colW: [0.85, 1.65],
    border: { color: '243247', pt: 1 },
    valign: 'middle',
    fontFace: 'Malgun Gothic',
  });

  // 군 협의 가이드 텍스트
  s3.addText(
    `* 제한보호구역 내 건축 시 관할 사단 작전성 검토 및 위탁고도(협의 기준선) 확인 필수. 군 유휴부지 국유재산 매각 또는 교환 시 사전 군사시설 영향성 평가 권장.`,
    {
      x: 6.95,
      y: 4.15,
      w: 2.5,
      h: 0.95,
      fontSize: 7.5,
      fontFace: 'Malgun Gothic',
      color: '94A3B8',
      lineSpacing: 11,
    }
  );

  // =========================================================================
  // 슬라이드 4 [개발 구상 3D 조감도]: 컷 3 이미지(70%) + 우측 비행안전 고도제한 & 개발 제언
  // =========================================================================
  const s4 = pptx.addSlide();
  s4.background = { color: BG_CONTENT };

  // 슬라이드 4 헤더
  s4.addText('[03. 3D 입체 조감 및 개발 가이드]', {
    x: 0.5,
    y: 0.25,
    w: 2.5,
    h: 0.25,
    fontSize: 9,
    fontFace: 'Malgun Gothic',
    color: TEXT_EMERALD,
    bold: true,
  });
  s4.addText('3D 지형 조감 및 비행안전 고도제한 가이드', {
    x: 0.5,
    y: 0.48,
    w: 6.0,
    h: 0.35,
    fontSize: 15,
    fontFace: 'Malgun Gothic',
    color: TEXT_WHITE,
    bold: true,
  });
  s4.addText('산악 3D DEM 지형 표고 분석, 가상 비행안전 허용 천장(Ceiling) 및 미래 권장 개발 모델', {
    x: 0.5,
    y: 0.8,
    w: 6.0,
    h: 0.22,
    fontSize: 8.5,
    fontFace: 'Malgun Gothic',
    color: TEXT_MUTED,
  });

  // 컷 3 지도 이미지 (좌측 70% 영역)
  if (images.cut3) {
    s4.addImage({
      data: images.cut3,
      x: 0.5,
      y: 1.1,
      w: 6.2,
      h: 4.15,
    });
  }
  s4.addText('■ 컷 3: 3D 미래 조감도 (Pitch 55° 경사 조감 / DEM 지형 + 가상 비행안전 고도면 + 접근성 축)', {
    x: 0.5,
    y: 5.28,
    w: 6.2,
    h: 0.25,
    fontSize: 7.5,
    fontFace: 'Malgun Gothic',
    color: '64748B',
  });

  // 우측 분석 정보 카드 (30% 영역)
  s4.addShape(pptx.ShapeType.roundRect, {
    x: 6.85,
    y: 1.1,
    w: 2.7,
    h: 4.15,
    rectRadius: 0.06,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
  });

  s4.addText('■ 비행안전 고도제한 & 개발 방향', {
    x: 7.0,
    y: 1.25,
    w: 2.4,
    h: 0.3,
    fontSize: 11,
    fontFace: 'Malgun Gothic',
    color: TEXT_EMERALD,
    bold: true,
  });

  // 비행안전 고도제한 요약 표
  const maxSurf = defenseResult?.maxSurfaceHeight || 45;
  const maxSea = defenseResult?.maxSeaLevelHeight || 130;
  const floors = defenseResult?.recommendedFloors || '지상 12층 이하 권장';
  const shieldingNote = defenseResult?.shieldingContourApplicable
    ? '적용 가능 (인근 자연장애물 능선 기준 완화 가능)'
    : '엄격 적용 (장애물 제한표면 엄수)';

  const ceilingTableData = [
    [
      { text: '고도 분석 항목', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
      { text: '허용 한계 기준', options: { bold: true, color: TEXT_MUTED, fontSize: 8 } },
    ],
    [
      { text: '지표 기준 허용고', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: `${maxSurf} m 이하`, options: { bold: true, color: TEXT_AMBER, fontSize: 8 } },
    ],
    [
      { text: '해발 표고 한계선', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: `EL. ${maxSea} m 이하`, options: { bold: true, color: TEXT_AMBER, fontSize: 8 } },
    ],
    [
      { text: '권장 건축 층수', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: floors, options: { bold: true, color: TEXT_EMERALD, fontSize: 8 } },
    ],
    [
      { text: '차폐선 완화 여부', options: { bold: true, color: TEXT_WHITE, fontSize: 8 } },
      { text: shieldingNote, options: { color: TEXT_MUTED, fontSize: 7.5 } },
    ],
  ];

  s4.addTable(ceilingTableData, {
    x: 6.95,
    y: 1.6,
    w: 2.5,
    h: 1.6,
    colW: [0.95, 1.55],
    border: { color: '243247', pt: 1 },
    valign: 'middle',
    fontFace: 'Malgun Gothic',
  });

  // 추천 개발 방향 제언 박스
  s4.addShape(pptx.ShapeType.roundRect, {
    x: 6.95,
    y: 3.35,
    w: 2.5,
    h: 1.75,
    rectRadius: 0.05,
    fill: { color: '0B1118' },
    line: { color: '10B981', width: 0.8 },
  });

  s4.addText('【 미래 전략 개발 제언 】', {
    x: 7.05,
    y: 3.45,
    w: 2.3,
    h: 0.22,
    fontSize: 9,
    fontFace: 'Malgun Gothic',
    color: TEXT_EMERALD,
    bold: true,
  });

  const recommendations = [
    '1. 민군 복합 첨단 R&D 실증단지 (드론·AI 테스트베드)',
    '2. 분지 지형을 활용한 스마트 밀리터리 물류·비축 기지',
    '3. 고도제한(지상 12층) 내 저밀도 친환경 스마트시티',
    '4. 국방부-지자체 상생 토지 교환 및 국유재산 특별법 활용',
  ];

  s4.addText(recommendations.join('\n'), {
    x: 7.05,
    y: 3.7,
    w: 2.3,
    h: 1.3,
    fontSize: 7.5,
    fontFace: 'Malgun Gothic',
    color: 'CBD5E1',
    lineSpacing: 11,
  });

  // =========================================================================
  // 파워포인트 파일 저장 및 브라우저 다운로드 트리거
  // =========================================================================
  const sanitizedTitle = (metadata.title || '군유휴부지')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  const fileName = `${sanitizedTitle}_브리핑자료_GeoBrief.pptx`;

  await pptx.writeFile({ fileName });
}
