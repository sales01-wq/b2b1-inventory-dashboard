// 녹화한 ERP 동작(src/recipe.js)을 실제 Chromium 으로 "ERP 와 같은 구조의 가짜 사이트"에서 실행: iframe 화면 4개, 프로그램조회 검색, 달력(월 → 1월 → 선택됨),
// 부서 팝업(좌표로 첫 줄 · 둘째 줄 선택), 오른쪽 클릭 → 엑셀로 내보내기. 실제 ERP 접속 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import erp from '../src/adapters/erp.js';
import mock from '../src/adapters/mock.js';
import {runOnce} from '../src/run.js';
import {FILES} from '../src/files.js';

const NOW = new Date('2026-11-12T01:00:00Z');
const pw = createRequire(import.meta.url)('playwright');
const PROG = {'가용재고조회': '111530061', 'WMS창고재고관리(EMP)': '111520091', '일자별판매실적분석': '525239', '제품일정표': '111530039'};
const GRIDTXT = 'You need a browser which full';

const MAIN = `<!doctype html><meta charset=utf-8><body>
<button onclick="this.remove()">즐겨찾기 레이어 닫기</button>
<button onclick="q.hidden=false">프로그램조회</button>
<input id=q aria-label="화면명을 입력해주세요" hidden>
<input aria-label=a style="width:300px;height:100px"><input aria-label=b style="width:300px;height:100px"><input aria-label=c style="width:300px;height:100px">
<div id=fr></div>
<div id=popup hidden style="width:300px;height:120px;background:#ddd"><div id=pgrid style="width:300px;height:120px">${GRIDTXT}</div></div>
<div id=picker hidden><button onclick="ms.hidden=false">월</button><span id=ms hidden>${[...Array(12)].map((_, i) => `<button onclick="m=${i + 1};sel.hidden=false">${i + 1}월</button>`).join('')}</span><a href="#" id=sel hidden onclick="pick();return false">선택됨</a></div>
<script>
const P=${JSON.stringify(PROG)}; let m=0;
q.addEventListener('keydown',e=>{ if(e.key==='Enter'){ const id=P[q.value]; fr.innerHTML='<iframe id="'+id+'_iframe" name="'+id+'_iframe" src="/screen/'+id+'" width=800 height=500></iframe>'; }});
const win=()=>fr.querySelector('iframe').contentWindow;
function showPopup(){ popup.hidden=false; }
pgrid.addEventListener('dblclick',e=>{ win().setDept(e.offsetY<50?'B2B1팀':'B2B2팀'); popup.hidden=true; });
function showPicker(){ picker.hidden=false; ms.hidden=true; sel.hidden=true; }
function pick(){ win().setStart(new Date().getFullYear()+'-'+String(m).padStart(2,'0')+'-'+(window.BADDAY?'15':'01')); picker.hidden=true; }
</script>`;
const grid = w => `<div style="width:${w}px;height:60px">${GRIDTXT}</div>`;
const XL = '<button onclick="go()">엑셀로 내보내기</button>';
const SCREENS = {
  '111530061': `<button onclick="s=1">조회</button>${grid(600)}${XL}<script>let s=0;const go=()=>{location='/export/inventory?q='+s}</script>`,
  '111520091': `<input aria-label="WMS창고" id=w><input aria-label="ERP창고" id=e><label for=c>물류센터</label><select id=c><option value="">-</option><option value="1101480001">1101480001</option></select>
    <div role=tab onclick="t=1">재고현황</div><button onclick="s=1">조회</button><div id=SS4_cvp_vp style="width:600px;height:40px">x</div>${XL}
    <script>let s=0,t=0;const go=()=>{location='/export/wms?w='+encodeURIComponent(w.value)+'&e='+encodeURIComponent(e.value)+'&c='+c.value+'&t='+t+'&s='+s}</script>`,
  '525239': `<input aria-label="필수 기간 시작일" id=st ondblclick="parent.showPicker()"><input aria-label="부서" id=d onkeydown="if(event.key==='Enter')parent.showPopup()">
    <select id=txtResultClassName_ul><option value="">-</option><option value="8057003">x</option></select><button onclick="s=1">조회</button>${grid(800)}${XL}
    <script>let s=0;window.setStart=v=>st.value=v;window.setDept=v=>d.value=v;const go=()=>{location='/export/sales?dept='+encodeURIComponent(d.value)+'&start='+st.value+'&c='+txtResultClassName_ul.value+'&s='+s}</script>`,
  '111530039': `<button onclick="s=1">조회</button>${grid(600)}${XL}<script>let s=0;const go=()=>{location='/export/schedule?q='+s}</script>`,
};

async function fakeErp(files, {loggedOut, badDay} = {}) {
  const exports = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), q = u.searchParams;
    const html = b => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(b); };
    if (u.pathname === '/') return html(loggedOut ? '<body>로그인</body>' : MAIN + (badDay ? '<script>window.BADDAY=1</script>' : ''));
    const sc = u.pathname.match(/^\/screen\/(\d+)$/); if (sc) return html('<!doctype html><meta charset=utf-8><body>' + SCREENS[sc[1]]);
    const ex = u.pathname.match(/^\/export\/(\w+)$/);
    if (ex) {
      const k = ex[1]; exports.push(k + '?' + u.searchParams);
      let id = null;
      if (k === 'inventory' && q.get('q') === '1') id = 'inventory';
      if (k === 'schedule' && q.get('q') === '1') id = 'schedule';
      if (k === 'wms' && q.get('w') === 'emp 정상' && q.get('e') === 'emp 정상' && q.get('c') === '1101480001' && q.get('t') === '1' && q.get('s') === '1') id = 'wms';
      if (k === 'sales' && q.get('start') === '2026-01-01' && q.get('c') === '8057003' && q.get('s') === '1') id = q.get('dept') === 'B2B1팀' ? 'sales1' : q.get('dept') === 'B2B2팀' ? 'sales2' : null;
      if (!id) { res.writeHead(400); return res.end('bad'); }
      res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="export.xlsx"'});
      return res.end(files.get(id));
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return {base: `http://127.0.0.1:${srv.address().port}/`, exports, close: () => new Promise(r => srv.close(r))};
}
const setup = s => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-'));
  const config = {uploadFolder: path.join(root, 'up'), workDir: path.join(root, 'work'), erpUrl: s.base, settleMs: 0, timeoutMs: 8000}; fs.mkdirSync(config.uploadFolder);
  return config;
};

test('녹화한 흐름 그대로: 5개 다운로드 → 검사 통과 → 묶음 (판매실적은 시작일 1월 1일 · 부서 첫째/둘째 줄)', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW));
  const config = setup(s);
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw}), now: NOW}); // 자격증명 없이 (세션 있는 경우)
    assert.equal(r.result, 'published', String(r.error) + ' ' + s.exports.join(' | '));
    assert.deepEqual(s.exports.map(e => e.split('?')[0]), ['inventory', 'wms', 'sales', 'sales', 'schedule']);
    assert.ok(s.exports[2].includes('dept=B2B1') && s.exports[3].includes('dept=B2B2'));
    assert.ok(s.exports.slice(2, 4).every(e => e.includes('start=2026-01-01')));
    assert.deepEqual(fs.readdirSync(config.uploadFolder), [r.bundle]);
  } finally { await s.close(); }
});

test('시작일이 1월 1일이 아니면 중단하고 아무것도 올리지 않음', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW), {badDay: true});
  const config = setup(s);
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw}), now: NOW});
    assert.equal(r.result, 'error'); assert.match(r.error, /시작일이 '2026-01-15'/);
    assert.deepEqual(fs.readdirSync(config.uploadFolder), []);
  } finally { await s.close(); }
});

test('로그인 세션이 없으면 자격증명을 열지 않고 안내하며 중단', async () => {
  const s = await fakeErp(await mock().fetchAll(FILES, NOW), {loggedOut: true});
  const config = {...setup(s), timeoutMs: 8000};
  try {
    const r = await runOnce({config, adapter: erp(config, {playwright: pw, credential: null}), now: NOW});
    assert.equal(r.result, 'error'); assert.match(r.error, /로그인이 필요/);
    assert.deepEqual(fs.readdirSync(config.uploadFolder), []);
  } finally { await s.close(); }
});
