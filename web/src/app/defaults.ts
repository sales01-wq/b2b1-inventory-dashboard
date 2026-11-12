/** 기존 대시보드의 Apps Script 웹앱 URL 기본값 (index.html 의 googleSheetIdInput value 와 같음). 미리보기에서는 VITE_WEBAPP_URL 로 바꿀 수 있음 (빈 값 = 기본값 없음) */
export const DEFAULT_WEBAPP_URL = import.meta.env.VITE_WEBAPP_URL ?? 'https://script.google.com/macros/s/AKfycbxmJubs9jojbYbmq9Xt5-Y3jRB9Yd8TKlKCnjQyKhSPwb-celdCZ5AKqhyzjMj1dv8lIQ/exec';

/**
 * 읽기 전용 미리보기 (VITE_READ_ONLY=1 로 빌드할 때만): 운영 데이터를 바꿀 수 있는 요청을 보내지 않음.
 * - 공유 설정 저장(POST /api/settings: 박스 정보 · 기준 · 히어로) → 이 브라우저에만 저장
 * - 업데이트 권한자의 새로고침(/api/data?action=update) · 저장본 만들기(action=ensure) → 새 데이터 다시 받기만
 * - 업로드 모드의 Apps Script 웹앱 호출(파일 처리) → 막음
 * 읽기(/api/config · me · snapshot · data meta/rows/progress · settings GET)는 그대로.
 */
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === '1';
