# GeoBrief 3D Models Directory

이 디렉터리(`public/models/`)는 'GeoBrief 3D'의 대상 부지에 배치할 3D 건축물(glTF/GLB) 에셋 저장 공간입니다.

## 파일 명명 규칙
- **국방 R&D 센터**: `defense_rd.glb` (또는 `defense_rd.gltf`)
- **군수 물류센터**: `smart_logistics.glb` (또는 `smart_logistics.gltf`)
- **복합 커뮤니티**: `civil_military.glb` (또는 `civil_military.gltf`)

## 작동 방식
1. 사용자가 좌측 패널에서 개발 구상안(Massing)을 활성화하면, 시스템은 우선 이 디렉터리의 GLB 모델을 확인합니다.
2. GLB 파일이 아직 배치되지 않았거나 다운로드 중일 경우, **Three.js 기반의 정밀 절차적 3D 건축물(커튼월 창문 패턴, 지붕 난간, 옥상 헬리패드가 포함된 복합 빌딩 Group)**이 자동 폴백(Fallback)으로 렌더링됩니다.
3. 실측 스케일 기준: 가로 60m, 세로 35m, 높이 22m (약 5,000평 규모 유휴부지 표준 규격).
