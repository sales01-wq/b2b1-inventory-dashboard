# ERP 수집기 (회사 Windows PC 전용)

ERP 엑셀 5개(가용재고조회_olive · WMS창고재고관리(EMP)_olive(유통기한 · LOT) · 일자별판매실적분석 B2B1팀/B2B2팀 · 제품일정표_olive)를 받아 **전부 검사한 뒤**, 바뀐 게 있을 때만 `ERP_BUNDLE_*.zip` **1개**를
기존 Drive 업로드 폴더에 올립니다. 이후는 기존 흐름 그대로입니다 (Apps Script 5분 감시 → 시트 → 저장본 → 대시보드).
상품마스터는 수집하지 않으며 기존 방식 그대로입니다. 수동 엑셀 업로드도 그대로 동작합니다.

## 안전장치
겹침 방지(잠금) · 5개 모두 있고 시트 종류 · 팀 · 행 수가 맞아야만 올림 · 변경 없으면 올리지 않음 · 묶음 1개라 일부만 반영되지 않음 ·
앞 묶음이 처리 전이면 쌓지 않음 · 실패하면 마지막 성공 데이터 유지 · Apps Script 가 거부한 묶음은 보관하고 다시 올림.

## 내 PC 에서 할 일 (한 번만)
1. Node.js 20 이상 설치. 이 저장소를 받고 `collector` 폴더에서 `npm install`.
2. `config.example.json` 을 `config.json` 으로 복사하고 `uploadFolder` 에 Drive 업로드 폴더 경로를 입력 (config.json 은 git 에 올라가지 않음).
3. **먼저 시험 환경에서**: 운영 Apps Script 대신 복사본(스크립트 · 시트 · 폴더)에 `apps-script/ErpBundle.gs` 를 추가하고 `uploadFolder` 를 복사본 폴더로 지정.
4. ERP 연결: `config.json` 에 `erpUrl`(ERP 주소)과 `"browserChannel": "chrome"` 을 넣습니다. 로그인은 이 PC 브라우저 프로필(`%LOCALAPPDATA%\erp-collector\browser-profile`)의 세션을 쓰고, **세션이 끊기면 자동으로 다시 로그인**합니다(아래).
   화면 동작은 `src/recipe.js` (녹화본을 옮긴 것, 주소 · 자격증명 없음). 한 파일씩 시험: `npm run try -- inventory --show` (받은 파일은 `workDir\try` 에 저장하고 검사만 하며, 업로드 폴더에는 아무것도 쓰지 않음).
   id: `inventory` `wms` `sales1` `sales2` `schedule`.
5. `powershell -File scripts\install-task.ps1` — 로그인 때 즉시 + 30분마다 실행 등록.
수동 실행: `npm start` · 시험: `npm test`.

## Apps Script 변경 (ErpBundle.gs 맨 아래 설명 참고)
새 파일 추가 + `checkForNewFilesInner_` 3줄. `BUNDLE_PROTECTED_TABS` 를 실제 상품마스터 탭 이름으로 확인하세요.

## 자동 재로그인 (무인 실행)
- 계정은 `npm run set-credentials` 로 **이 PC · 이 Windows 사용자만** 풀 수 있게 암호화(DPAPI)해 저장합니다. 비밀번호는 화면에 보이지 않게 입력받고, 명령줄 · 파일 · 로그에 평문으로 남지 않습니다 (PowerShell `-Command` 를 쓰므로 `.ps1` 실행 정책에 걸리지 않으며 정책은 건드리지 않음). 세션이 살아 있으면 열지도 않습니다.
- ERP 계정은 **읽기 전용 전용 계정**을 쓰고, **ERP 관리자 · 회사 보안 승인**을 받은 뒤 사용하세요. 이 PC의 ERP 주소가 `http://` 이면 계정과 세션이 사내망에서 암호화되지 않고 오갑니다 (HTTPS · VPN 여부 IT 확인 권장).
- 안전하게 멈추는 경우 (우회하지 않음): 로그인 화면에 CAPTCHA, 로그인 뒤 추가 인증(OTP 등), 알 수 없는 로그인 화면 · 입력칸이 모호함(`config.json` 의 `login.userSelector` 로 아이디 칸 지정 가능), 비밀번호가 틀려 **연속 2회 실패**(계정 잠금 방지).
- 연속 실패로 멈추면 비밀번호 · ERP 상태를 확인한 뒤 `npm run reset-login` 으로 다시 켭니다.
- 마지막 성공 데이터는 어떤 경우에도 유지되며, 멈춘 이유는 `%LOCALAPPDATA%\erp-collector\state.json` 의 `lastError` 와 `run.log` 에 남습니다 (계정 정보는 가려서 기록).

## 점검
`npm run netcheck` — ERP 접속이 막힐 때(`ERR_BLOCKED_BY_CLIENT` 등) 전용 프로필과 새 임시 프로필로 각각 열어 비교하고, 막힌 요청 · 문서 이동 경로(서버 3xx / 브라우저 내부 전환 / 페이지 스크립트 구분, `blockedReason` 포함) · 접속 관련 Chrome 정책 · Chrome 과 같은 헤더로 본 서버 응답 · Chrome 버전 · 실행 옵션을 보여 줌 (계정 · 내용 없음, 보안 설정은 바꾸지 않음).
`npm run check` — 수집기가 쓰는 브라우저 프로필 · 채널 · 로그인 감지 결과를 보여 줌 (계정 정보 · 데이터 없음). `npm run check -- --login` 은 같은 프로필로 창을 열어 둠.
평소 쓰는 Chrome 의 로그인은 **다른 프로필**이라 수집기가 쓸 수 없습니다. 또 ERP 가 "브라우저를 닫으면 사라지는 세션 쿠키"를 쓰면 수동 로그인도 다음 실행에 남지 않으므로, 무인 실행은 자동 재로그인(암호화된 계정)에 의존합니다.

## 문제 해결: `ERR_BLOCKED_BY_CLIENT` (http → https 자동 전환)
`npm run netcheck` 에서 `non-authoritative-reason: HttpsUpgrades` 의 내부 307 뒤에 https 요청이 `ERR_BLOCKED_BY_CLIENT` 로 실패하면, ERP 주소가 `http://` 인데 Chrome 이 스스로 https 로 바꾸고 그 요청이 막힌 것입니다. HTTPS 자동 전환을 끄거나 보안 옵션으로 우회하지 말고 `IT-요청서.md` 로 IT 승인(HTTPS 주소, 또는 이 호스트의 `HttpAllowlist`)을 받으세요.
