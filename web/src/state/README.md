# src/state — 화면 상태 (4~5단계)

기존 전역 객체 `state`(데이터 · 계산 결과)와 `ui`(필터 · 선택 · 출고목록 등 약 50개 필드)가
React Context + reducer 로 옮겨집니다. 무거운 계산(computeDerived)은 React 밖의 순수 함수(src/lib)로 두고
결과만 상태에 넣습니다. localStorage 키(`inv_team`, `inv_settings_v1`)는 그대로 유지해 기존 사용자 설정을 이어받습니다.
