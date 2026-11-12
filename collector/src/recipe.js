// 영림원 ERP 화면 조작 (playwright codegen 녹화본을 그대로 옮김). 주소는 config.erpUrl, 로그인은 이 PC 의 브라우저 프로필 세션 — 코드에 자격증명이 없음.
// 기록 중 잘못 선택한 "1월 + 조회" 동작은 뺐고, 판매실적은 시작일을 1월 1일로 고른 뒤 조회함 (고른 값이 올해 1월 1일이 아니면 중단).
import {ymd} from './files.js';

const SCREEN = {
  inventory: {name: '가용재고조회', frame: '111530061_iframe'},
  wms: {name: 'WMS창고재고관리(EMP)', frame: '111520091_iframe'},
  sales: {name: '일자별판매실적분석', frame: '525239_iframe'},
  schedule: {name: '제품일정표', frame: '111530039_iframe'},
};
const GRID = 'You need a browser which full'; // ERP 그리드의 대체 문구: 녹화에서 여기를 오른쪽 클릭해서 내보내기 메뉴를 엶
const btn = (ctx, name, opts) => ctx.getByRole('button', {name, ...opts});
const frameOf = (page, s) => page.frameLocator(`[id="${s.frame}"]`);
const settle = (page, config) => page.waitForTimeout(config.settleMs ?? 4000); // 조회 결과가 그려질 때까지 (검사 단계가 빈 결과도 막음)

export async function login(page, _cred, config) {
  if (!config.erpUrl) throw new Error('config.json 에 erpUrl 이 없습니다');
  await page.goto(config.erpUrl);
  await btn(page, '즐겨찾기 레이어 닫기').click({timeout: 5000}).catch(() => {}); // 레이어가 없으면 그대로 진행
  try { await btn(page, '프로그램조회').waitFor({timeout: 20000}); }
  catch { throw new Error('ERP 로그인이 필요합니다 (이 PC 브라우저 프로필에 로그인 세션이 없음). 로그인 화면 녹화(rec-login)를 보내 주시면 자동 로그인을 추가합니다'); }
}

async function openScreen(page, s) {
  await btn(page, '프로그램조회').click();
  const box = page.getByRole('textbox', {name: '화면명을 입력해주세요'});
  await box.fill(s.name);
  await box.press('Enter');
}

async function exportExcel(page, grid, position, f) {
  await grid.click({button: 'right', position});
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(f, '엑셀로 내보내기').click()]);
  return dl;
}

// 판매실적: 화면을 열고 결과분류 선택 + 시작일(올해 1월 1일) 선택. 한 번만 하고 B2B1 · B2B2 가 이어서 씀 (녹화와 같은 순서)
const salesReady = new WeakSet();
async function prepareSales(page) {
  const s = SCREEN.sales, f = frameOf(page, s);
  await openScreen(page, s);
  await f.getByRole('textbox', {name: '부서'}).click();
  await f.locator('#txtResultClassName_ul').selectOption('8057003');
}
async function pickStartDate(page, f, now) {
  const start = f.getByRole('textbox', {name: '필수 기간 시작일'});
  await start.dblclick();
  await btn(page, '월').click();
  await btn(page, '1월', {exact: true}).click();
  await page.getByRole('link', {name: '선택됨'}).click(); // 달력에서 고른 날짜 확정
  const v = await start.inputValue();
  if (v.replace(/\D/g, '') !== ymd(now).slice(0, 4) + '0101') throw new Error(`판매실적 시작일이 '${v}' 입니다 (기대: 올해 1월 1일). 달력 선택 방식 확인 필요`);
}
async function salesDept(page, f, row) { // row 0: 첫 줄(B2B1팀), 1: 둘째 줄(B2B2팀) — 녹화한 위치 그대로
  const dept = f.getByRole('textbox', {name: '부서'});
  await dept.click();
  await dept.fill('b2b');
  await dept.press('Enter');
  if (row === 1) await page.getByRole('textbox').nth(3).click({position: {x: 132, y: 62}, timeout: 3000}).catch(() => {}); // 녹화에 있던 동작 (실패해도 진행)
  await page.getByText(GRID).dblclick({position: row === 0 ? {x: 133, y: 38} : {x: 132, y: 62}});
}

/** def.id: inventory · wms · sales1 · sales2 · schedule → Download */
export async function download(page, def, now, config = {}) {
  if (def.id === 'inventory') {
    const s = SCREEN.inventory, f = frameOf(page, s);
    await openScreen(page, s);
    await btn(f, '조회').click(); await settle(page, config);
    return exportExcel(page, f.getByText(GRID), {x: 337, y: 54}, f);
  }
  if (def.id === 'wms') {
    const s = SCREEN.wms, f = frameOf(page, s);
    await openScreen(page, s);
    for (const name of ['WMS창고', 'ERP창고']) { const t = f.getByRole('textbox', {name}); await t.click(); await t.fill('emp 정상'); await t.press('Enter'); }
    await f.getByLabel('물류센터', {exact: true}).selectOption('1101480001');
    await f.getByRole('tab', {name: '재고현황'}).click();
    await btn(f, '조회').click(); await settle(page, config);
    return exportExcel(page, f.locator('#SS4_cvp_vp'), {x: 352, y: 14}, f);
  }
  if (def.id === 'sales1' || def.id === 'sales2') {
    const f = frameOf(page, SCREEN.sales);
    if (!salesReady.has(page)) { await prepareSales(page); await pickStartDate(page, f, now); salesReady.add(page); } // 같은 화면에서 B2B2 가 이어서 쓰므로 한 번만
    await salesDept(page, f, def.id === 'sales1' ? 0 : 1);
    await btn(f, '조회').click(); await settle(page, config);
    return exportExcel(page, f.getByText(GRID), def.id === 'sales1' ? {x: 497, y: 20} : {x: 476, y: 11}, f);
  }
  if (def.id === 'schedule') {
    const s = SCREEN.schedule, f = frameOf(page, s);
    await openScreen(page, s);
    await btn(f, '조회').click(); await settle(page, config);
    return exportExcel(page, f.getByText(GRID), {x: 415, y: 28}, f);
  }
  throw new Error('알 수 없는 파일: ' + def.id);
}
