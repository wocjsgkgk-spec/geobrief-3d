// [1단계: 가상 더미 박스 삭제 및 전역 실제 건물 폴리곤 동기화]
// 실제 GIS 데이터(OpenFreeMap 벡터 타일 및 V-World WFS)에 기반하지 않은 임의의 가상 박스 생성을 전면 중단합니다.
// 모든 건물 지오메트리는 OpenFreeMap 및 국토교통부/브이월드 실측 폴리곤과 1:1로 일치하여 렌더링됩니다.

export const SAMPLE_BUILDINGS: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: 'FeatureCollection',
  features: [],
};
