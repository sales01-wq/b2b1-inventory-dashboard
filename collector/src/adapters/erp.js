// 실제 ERP 엑셀 다운로드 (Playwright). 화면 조작은 PC 의 erp-recipe.js (녹화한 동작) 가 맡고, 여기서는 브라우저 · 로그인 · 순서 · 오류 처리만 함.
// 규칙: 읽기 전용 계정, 자격증명은 Windows 암호화 저장소(set-credentials.ps1)에서만 읽음, 조회 · 내보내기만. 일부만 받으면 throw (검사 단계가 전부 아니면 전무로 막음).
import {loadCredential} from '../credentials.js';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {authGuard, AuthStop} from '../auth.js';

export {loadCredential}; // 계정 읽기 · 저장은 credentials.js (DPAPI)

const toBuffer = async r => {
  if (Buffer.isBuffer(r)) return r;
  if (r && typeof r.path === 'function') return fs.readFileSync(await r.path()); // Playwright Download
  throw new Error('레시피는 다운로드(Download) 또는 Buffer 를 돌려줘야 합니다');
};

// browserChannel: 'chrome' 이면 PC 에 이미 설치된 (회사가 허용한) Google Chrome 을 사용 — Playwright 가 내려받는 Chromium 은 회사 보안 정책이 막을 수 있음
/** deps: 시험용 주입 (playwright, credential, recipe). 실제 실행에서는 모두 자동 */
export default function erp(config, deps = {}) {
  return {
    async fetchAll(defs, now) {
      const playwright = deps.playwright || createRequire(import.meta.url)('playwright');
      const recipe = deps.recipe || await import(config.recipe ? pathToFileURL(config.recipe).href : '../recipe.js');
      // 자격증명은 로그인이 실제로 필요할 때만 읽음 (세션이 살아 있으면 암호화 저장소를 열지 않음)
      let c; const load = () => (c ||= deps.credential || loadCredential(config.workDir));
      const cred = {get user() { return load().user; }, get password() { return load().password; }};
      const auth = authGuard(config.workDir);
      // 오류 문구 · 로그에 계정 정보가 섞여 나가지 않게 가림
      const scrub = e => { let m = String(e?.message ?? e); for (const v of c ? [c.user, c.password] : []) if (v && v.length >= 3) m = m.split(v).join('***'); const n = new (e instanceof AuthStop ? AuthStop : Error)(m); n.stack = ''; return n; };
      const ctx = await playwright.chromium.launchPersistentContext(path.join(config.workDir, 'browser-profile'), {headless: config.headless !== false, acceptDownloads: true, ...(config.browserChannel ? {channel: config.browserChannel} : {})});
      try {
        const page = ctx.pages()[0] || await ctx.newPage();
        page.setDefaultTimeout(config.timeoutMs || 90000);
        await recipe.login(page, cred, config, auth);
        const out = new Map();
        for (const d of defs) {
          const get = async () => toBuffer(await recipe.download(page, d, now, config));
          try { out.set(d.id, await get()); }
          catch (e) {
            // 도중에 세션이 끊긴 경우만: 다시 로그인해서 이 파일을 한 번 더. 세션 문제가 아니면 원래 오류 그대로
            if (e instanceof AuthStop || !recipe.isLoggedIn || await recipe.isLoggedIn(page, config)) throw e;
            await recipe.login(page, cred, config, auth);
            out.set(d.id, await get());
          }
        }
        return out;
      } catch (e) { throw scrub(e); }
      finally { await ctx.close(); }
    },
  };
}
