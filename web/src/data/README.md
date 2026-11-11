# src/data — 서버 · 저장소 연결 (4단계)

기존 index.html 의 아래 코드가 이곳으로 옮겨집니다. **API 계약(/api/*)은 바꾸지 않습니다.**

| 기존 함수 (index.html 행) | 새 위치 (예정) | 역할 |
|---|---|---|
| `jwtExp` · `storeToken` · `loadStoredToken` (3752~) | `auth.ts` | 구글 ID 토큰 보관 (localStorage 키 동일 유지) |
| `waitForGsi` · `tryPrompt` · `onGoogleCredential` (3781~) | `auth.ts` | 구글 로그인 · `/api/me` 확인 · 회사 계정 제한 |
| `sApi` (3769) | `api.ts` | 인증 헤더 + 401 시 재로그인 |
| `idbOpen/idbGet/idbSet` (3833~) | `cache.ts` | IndexedDB 저장본 캐시 (DB 이름 동일 유지) |
| `fetchSnapshot` · `fetchBundle` · `loadSharedData` (3836~) | `snapshot.ts` | gzip 저장본, 204 최신 확인, 1,000행 분할 대체 경로 |
| `sharedRefresh` · `checkForNewSharedData` (3954~) | `snapshot.ts` | 업데이트 시작 · 새 데이터 알림 |
| `persistSetting` · `loadRemoteSettings` (885~) | `settings.ts` | 공유 설정(box / hero / rules) |
