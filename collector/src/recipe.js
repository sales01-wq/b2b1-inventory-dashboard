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

const CAPTCHA = /captcha|캡차|자동\s*입력\s*방지|보안\s*문자/i;
const MFA = /otp|인증\s*번호|인증\s*코드|2\s*단계|추가\s*인증|문자\s*인증|본인\s*확인/i;
const loggedIn = (page, ms) => btn(page, '프로그램조회').waitFor({timeout: ms}).then(() => true, () => false);
/** 화면이 'in'(로그인됨) · 'form'(로그인 입력칸) · 'captcha' · 'mfa'(추가 인증) · 'unknown'(시간 초과) 중 무엇이 될 때까지 기다림 */
async function screenState(page, ms, afterSubmit) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await btn(page, '프로그램조회').isVisible().catch(() => false)) return 'in';
    const html = await page.content().catch(() => '');
    if (CAPTCHA.test(html)) return 'captcha';
    if (afterSubmit && MFA.test(html)) return 'mfa';
    if (await page.locator('input[type=password]:visible').count().catch(() => 0)) return 'form';
    await page.waitForTimeout(250);
  }
  return 'unknown';
}

/** 진단용 (계정 정보 없음): 주소를 열고 화면 상태를 알려 줌 */
export async function diagnose(page, config) {
  await page.goto(config.erpUrl);
  await btn(page, '즐겨찾기 레이어 닫기').click({timeout: 3000}).catch(() => {});
  const state = await screenState(page, 15000, false);
  return {state, url: page.url(), title: await page.title().catch(() => '')};
}

/** 세션이 살아 있는지 (주소를 새로 열어 확인). 화면 상태가 사라지므로 판매실적 준비 기록도 지움 */
export async function isLoggedIn(page, config) {
  salesReady.delete(page);
  await page.goto(config.erpUrl);
  return loggedIn(page, 8000);
}

/**
 * 로그인 상태 확보. 세션이 살아 있으면 그대로, 아니면 이 PC 암호화 저장소의 계정으로 자동 로그인.
 * CAPTCHA · 추가 인증(OTP 등) · 알 수 없는 로그인 화면이면 우회하지 않고 안전하게 중단. 연속 실패 시 계정 잠금 방지로 중단(auth).
 */
export async function login(page, cred, config, auth) {
  if (!config.erpUrl) throw new Error('config.json 에 erpUrl 이 없습니다');
  salesReady.delete(page);
  await page.goto(config.erpUrl);
  await btn(page, '즐겨찾기 레이어 닫기').click({timeout: 3000}).catch(() => {}); // 레이어가 없으면 그대로 진행
  const st = await screenState(page, 15000, false);
  if (st === 'in') { auth?.success(); return; }
  // 로그인 화면: 자동으로 처리해도 되는 모양인지 먼저 확인 (제출 전)
  if (st === 'captcha') throw new Error('로그인 화면에 CAPTCHA(자동입력 방지)가 있어 자동 로그인할 수 없습니다 — 우회하지 않고 중단 (수동 로그인 필요)');
  if (st !== 'form') throw new Error(`ERP 로그인 화면을 알아볼 수 없어 자동 로그인하지 않습니다 (로그인 상태도 입력칸도 보이지 않음). 현재 주소: ${page.url()} / 제목: ${await page.title().catch(() => '')} — npm run check 로 확인해 주세요`);
  const pw = page.locator('input[type=password]:visible');
  if (await pw.count() !== 1) throw new Error('ERP 로그인 화면을 알아볼 수 없어 자동 로그인하지 않습니다 (비밀번호 입력칸이 1개가 아님). 수동 로그인 후 확인해 주세요');
  const user = config.login?.userSelector
    ? page.locator(config.login.userSelector)
    : page.locator('input:visible:not([type=password],[type=hidden],[type=checkbox],[type=radio],[type=submit],[type=button],[type=image])');
  if (await user.count() !== 1) throw new Error(`로그인 입력칸이 ${await user.count()}개라 어느 칸이 아이디인지 알 수 없어 자동 로그인하지 않습니다 (config.json 의 login.userSelector 지정 필요)`);

  auth?.beforeAttempt();
  await user.fill(cred.user);
  await pw.fill(cred.password);
  await pw.press('Enter');
  const after = await screenState(page, 30000, true);
  if (after === 'in') { auth?.success(); return; }
  if (after === 'captcha') throw new Error('로그인 후 CAPTCHA 가 나타났습니다 — 자동 로그인을 중단합니다');
  if (after === 'mfa') throw new Error('로그인 후 추가 인증(OTP 등) 화면이 나타났습니다 — 무인 로그인이 불가능하므로 중단합니다');
  throw new Error('ERP 로그인에 실패했습니다 (아이디 · 비밀번호 확인 필요)');
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
