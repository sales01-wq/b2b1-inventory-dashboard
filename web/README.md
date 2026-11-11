# web/ — 재고 관리 대시보드 (React 19 + Astryx)

새 프론트엔드입니다. **운영 중인 대시보드(저장소 루트의 `index.html` + `api/`)는 건드리지 않습니다.**
이 폴더는 아직 배포되지 않으며, 루트의 `vercel.json` 도 변경하지 않았습니다.

## 구성

| 항목 | 내용 |
|---|---|
| 프레임워크 | React 19, TypeScript, Vite 6 |
| 디자인 시스템 | `@astryxdesign/core` 0.7.13 + `theme-neutral` (버전 고정) |
| 언어 | 한국어 — Astryx 기본 `ko-KR` 문구 + Pretendard 글꼴 |
| 아이콘 | Heroicons |
| 테스트 | Vitest (`src/**/*.test.ts`) |
| 라우팅 | 해시 방식 `#/overview` (서버 설정 없이 새로고침 · 북마크 가능) |
| 코딩 원칙 | Ponytail v5.3.3 (`.claude/settings.json` 에서 Claude Code 플러그인으로 활성화) — 가장 작은 완전한 변경, 새 의존성 최소화, 계산 로직은 테스트와 함께 |

```
web/
├─ src/app/      앱 틀: Provider(테마·한국어), 왼쪽 사이드바(AppShell + SideNav), 라우트
├─ src/views/    화면 5개 (전체 개요 · 발주 현황 · 판매 현황 · 바코드 조회 · 업로드)
├─ src/lib/      계산 로직 (index.html 에서 그대로 옮김, 테스트 대상)
├─ src/data/     로그인 · API · 저장본 캐시 (예정)
├─ src/state/    화면 상태 (예정)
└─ docs/CALC_LOGIC_INVENTORY.md   테스트해야 할 계산 로직 목록
```

## 실행

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # 계산 로직 테스트
npm run build      # 타입 검사 + 빌드 (dist/)
```

`/api/*` 는 개발 서버가 `http://localhost:3000` 으로 넘깁니다. 실제 데이터로 확인하려면
저장소 루트에서 `vercel dev` 를 먼저 실행하세요 (다른 주소는 `API_PROXY_TARGET` 으로 지정).
