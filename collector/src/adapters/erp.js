// 실제 ERP 엑셀 다운로드 (Playwright). 화면 조작은 PC 의 erp-recipe.js (녹화한 동작) 가 맡고, 여기서는 브라우저 · 로그인 · 순서 · 오류 처리만 함.
// 규칙: 읽기 전용 계정, 자격증명은 Windows 암호화 저장소(set-credentials.ps1)에서만 읽음, 조회 · 내보내기만. 일부만 받으면 throw (검사 단계가 전부 아니면 전무로 막음).
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** 이 Windows 사용자 + 이 PC 에서만 복호화되는 계정 읽기 */
export function loadCredential(workDir) {
  const file = path.join(workDir, 'erp-cred.xml');
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    `$c = Import-Clixml -Path '${file}'; $n = $c.GetNetworkCredential(); @{user=$n.UserName; password=$n.Password} | ConvertTo-Json -Compress`], {encoding: 'utf8'});
  return JSON.parse(out);
}

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
      const recipe = deps.recipe || await import(pathToFileURL(config.recipe || path.join(config.workDir, 'erp-recipe.js')).href);
      const cred = deps.credential || loadCredential(config.workDir);
      const ctx = await playwright.chromium.launchPersistentContext(path.join(config.workDir, 'browser-profile'), {headless: config.headless !== false, acceptDownloads: true, ...(config.browserChannel ? {channel: config.browserChannel} : {})});
      try {
        const page = ctx.pages()[0] || await ctx.newPage();
        page.setDefaultTimeout(config.timeoutMs || 90000);
        await recipe.login(page, cred);
        const out = new Map();
        for (const d of defs) out.set(d.id, await toBuffer(await recipe.download(page, d, now)));
        return out;
      } finally { await ctx.close(); }
    },
  };
}
