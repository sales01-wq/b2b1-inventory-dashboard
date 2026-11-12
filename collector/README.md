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
4. ERP 연결: `config.json` 에 `erpUrl`(ERP 주소)과 `"browserChannel": "chrome"` 을 넣습니다. 로그인은 이 PC 브라우저 프로필(`%LOCALAPPDATA%\erp-collector\browser-profile`)의 세션을 씁니다.
   화면 동작은 `src/recipe.js` (녹화본을 옮긴 것, 주소 · 자격증명 없음). 한 파일씩 시험: `npm run try -- inventory --show` (받은 파일은 `workDir\try` 에 저장하고 검사만 하며, 업로드 폴더에는 아무것도 쓰지 않음).
   id: `inventory` `wms` `sales1` `sales2` `schedule`.
5. `powershell -File scripts\install-task.ps1` — 로그인 때 즉시 + 30분마다 실행 등록.
수동 실행: `npm start` · 시험: `npm test`.

## Apps Script 변경 (ErpBundle.gs 맨 아래 설명 참고)
새 파일 추가 + `checkForNewFilesInner_` 3줄. `BUNDLE_PROTECTED_TABS` 를 실제 상품마스터 탭 이름으로 확인하세요.
