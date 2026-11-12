// 접속 원인 점검 (계정 · 데이터 없음, 업로드 안 함, 보안 설정은 건드리지 않음). 같은 ERP 주소를 여러 방식으로 열어 어디서 막히는지 비교:
//   npm run netcheck
//   A: 수집기 전용 프로필 (지금 쓰는 설정)   B: 새 임시 프로필 (프로필 문제인지 구분)
// 출력: 접속 결과, 막힌 요청의 종류 · 오류 이름, Chrome 버전 · 실행 옵션 · 프로필 경로. (페이지 내용 · 쿠키 · 계정은 출력하지 않음)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadConfig} from './run.js';
import {attachTrace, readPolicies} from './nettrace.js';

const config = loadConfig();
const safe = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return String(u).slice(0, 80); } };
const first = e => String(e?.message ?? e).split('\n')[0].slice(0, 200);
console.log('ERP 주소(설정)  :', safe(config.erpUrl));
console.log('브라우저        :', config.browserChannel ? `설치된 ${config.browserChannel}` : 'Playwright Chromium');
console.log('프록시 환경변수 :', ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some(k => process.env[k]) ? '설정됨' : '없음');
try { const r = await fetch(config.erpUrl, {redirect: 'manual', signal: AbortSignal.timeout(15000)}); console.log('Node 직접 접속  :', 'HTTP', r.status, '(브라우저 정책과 무관하게 네트워크는 닿음)'); }
catch (e) { console.log('Node 직접 접속  :', '실패 -', first(e.cause || e), '(네트워크 자체 문제 가능)'); }

const pw = createRequire(import.meta.url)('playwright');
async function tryOpen(label, dir) {
  const failed = [];
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(dir, {headless: process.env.NETCHECK_HEADLESS === '1', ...(config.browserChannel ? {channel: config.browserChannel} : {})});
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('requestfailed', r => failed.push(`${r.resourceType()} ${safe(r.url())} → ${r.failure()?.errorText}`));
    const trace = await attachTrace(ctx, page).catch(() => null);
    let nav; let ua = '';
    try { const r = await page.goto(config.erpUrl, {waitUntil: 'domcontentloaded', timeout: 30000}); nav = `성공 (HTTP ${r?.status()})`; } catch (e) { nav = '실패 - ' + first(e); }
    await page.waitForTimeout(2000);
    console.log(`\n[${label}] 접속: ${nav}\n  최종 주소: ${safe(page.url())}  제목: ${await page.title().catch(() => '')}`);
    console.log('  막힌 요청  :', failed.length ? '\n    ' + failed.slice(0, 8).join('\n    ') : '없음');
    if (trace) console.log('  이동 경로  :\n    ' + (trace.lines().join('\n    ') || '(기록 없음)'));
    ua = await page.evaluate(() => navigator.userAgent).catch(() => '');
    if (label.startsWith('A')) {
      const pol = await readPolicies(page);
      console.log('  브라우저 정책(접속 관련, 값이 있는 것만):', pol.length ? '\n    ' + pol.join('\n    ') : '없음 또는 읽지 못함');
      await page.goto('chrome://version').catch(() => {});
      const t = await page.evaluate(() => document.body.innerText).catch(() => '');
      for (const k of ['Google Chrome', 'Command Line', 'Profile Path']) { const m = t.split('\n').find(l => l.startsWith(k)); if (m) console.log('  ' + m.slice(0, 400).replace(/\s+/g, ' ')); }
    }
    return ua;
  } catch (e) { console.log(`\n[${label}] 브라우저 실행 실패 - ${first(e)}`); }
  finally { await ctx?.close().catch(() => {}); }
}
const uaA = await tryOpen('A 수집기 전용 프로필', path.join(config.workDir, 'browser-profile'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'netcheck-'));
await tryOpen('B 새 임시 프로필', tmp);
fs.rmSync(tmp, {recursive: true, force: true});
// 서버가 브라우저 요청(Chrome 의 UA · Upgrade-Insecure-Requests)에만 https 로 넘기는지: 같은 헤더로 읽기 전용 GET (자동으로 따라가지 않음)
if (uaA) {
  try { const r = await fetch(config.erpUrl, {redirect: 'manual', headers: {'User-Agent': uaA, 'Upgrade-Insecure-Requests': '1', Accept: 'text/html,application/xhtml+xml'}, signal: AbortSignal.timeout(15000)}); console.log('\n서버 응답(Chrome 과 같은 헤더):', 'HTTP', r.status, r.headers.get('location') ? '→ Location ' + safe(r.headers.get('location')) : '(Location 없음)'); }
  catch (e) { console.log('\n서버 응답(Chrome 과 같은 헤더): 실패 -', first(e.cause || e)); }
}
console.log('\nA 와 B 가 모두 같은 오류면 프로필이 아니라 브라우저 실행 방식 · 회사 정책 · 보안 프로그램 쪽입니다.');
