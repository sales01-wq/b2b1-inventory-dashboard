// 점검 (계정 정보 · 데이터 없음, 업로드 안 함): 수집기가 쓰는 브라우저 프로필 · 채널 · 로그인 감지 결과를 보여 줌.
//   npm run check           → 수집기와 같은 프로필로 ERP 를 열고 화면 상태 출력
//   npm run check -- --login → 같은 프로필로 창을 열어 둠 (직접 로그인해 볼 때 사용, 창을 닫으면 끝)
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadConfig} from './run.js';
import {diagnose} from './recipe.js';

const config = loadConfig();
const profile = path.join(config.workDir, 'browser-profile');
const login = process.argv.includes('--login');
console.log('설정 폴더      :', config.workDir);
console.log('브라우저 프로필:', profile, fs.existsSync(profile) ? '(있음)' : '(아직 없음)');
console.log('브라우저       :', config.browserChannel ? `설치된 ${config.browserChannel}` : 'Playwright Chromium');
console.log('ERP 주소 설정  :', config.erpUrl ? '있음' : '없음 → config.json 에 erpUrl 필요');
console.log('저장된 계정    :', fs.existsSync(path.join(config.workDir, 'erp-cred.xml')) ? '있음' : '없음 → npm run set-credentials 필요');
if (!config.erpUrl) process.exit(1);
const pw = createRequire(import.meta.url)('playwright');
const ctx = await pw.chromium.launchPersistentContext(profile, {headless: false, ...(config.browserChannel ? {channel: config.browserChannel} : {})});
try {
  const page = ctx.pages()[0] || await ctx.newPage();
  const d = await diagnose(page, config);
  const meaning = {in: '로그인됨 (프로그램조회 버튼 보임)', form: '로그인 입력 화면 (세션 없음 → 자동 로그인 대상)', captcha: 'CAPTCHA 있음 (자동 로그인 불가)', unknown: '알 수 없는 화면'}[d.state];
  console.log('화면 상태      :', d.state, '-', meaning);
  console.log('현재 주소      :', d.url);
  console.log('페이지 제목    :', d.title);
  if (login) { console.log('\n창에서 직접 로그인한 뒤 창을 닫으세요.'); await new Promise(r => ctx.on('close', r)); }
} finally { await ctx.close().catch(() => {}); }
