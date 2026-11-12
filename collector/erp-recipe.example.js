// ERP 화면 조작 레시피. 이 파일을 %LOCALAPPDATA%\erp-collector\erp-recipe.js 로 복사해서 ERP 화면에 맞게 채우세요.
// 채우는 가장 쉬운 방법: `npx playwright codegen <ERP 주소>` 로 로그인 → 메뉴 이동 → 조회 → 엑셀 내보내기를 직접 한 번 하면
// 생성되는 코드(page.goto / page.click / page.fill ...)를 아래 함수 안에 붙여넣으면 됩니다. (비밀번호는 붙여넣지 말고 cred.password 를 쓰세요)
//
// login(page, cred)          : cred.user / cred.password 로 로그인
// download(page, def, now)   : def.id 에 해당하는 화면에서 조회 → 내보내기를 눌러 받은 Download 를 돌려줌
//   def.id: inventory(가용재고조회) · wms(WMS창고재고관리 EMP) · sales1(판매실적 B2B1팀) · sales2(B2B2팀) · schedule(제품일정표)
export async function login(page, cred) {
  await page.goto('https://ERP주소/로그인');          // TODO
  await page.fill('#id', cred.user);                  // TODO
  await page.fill('#pw', cred.password);              // TODO
  await page.click('button[type=submit]');            // TODO
}

export async function download(page, def, now) {
  const menu = {inventory: '가용재고조회', wms: 'WMS창고재고관리', sales1: '일자별판매실적분석', sales2: '일자별판매실적분석', schedule: '제품일정표'}[def.id];
  await page.goto('https://ERP주소/' + menu);         // TODO: 메뉴 이동 (판매실적은 def.team 으로 부서/팀 선택)
  await page.click('#조회');                           // TODO: 조회 조건(기간 등) 입력 후 조회
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#엑셀내보내기')]);   // TODO
  return dl;
}
