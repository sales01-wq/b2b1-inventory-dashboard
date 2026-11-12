import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {credFile, saveCredential, loadCredential, readHidden, setCredentials, runPowerShell} from '../src/credentials.js';

const WD = "C:\\Users\\a'b\\AppData\\Local\\erp-collector";
const PW = 'S3cret-비밀번호!';
function tty() { const i = new PassThrough(); i.isTTY = true; i.modes = []; i.setRawMode = m => { i.modes.push(m); }; const o = []; return {i, o, out: {write: s => o.push(s)}}; }
const type = (i, s) => i.write(s);
/** DPAPI 대신 메모리에 보관하는 가짜 PowerShell (시험용) */
function fakeRun() {
  const calls = []; let stored = null;
  const run = (script, input = '') => {
    calls.push({script, input});
    if (/Export-Clixml/.test(script)) { stored = JSON.parse(Buffer.from(input.trim(), 'base64').toString('utf8')); return ''; }
    if (/Import-Clixml/.test(script)) return Buffer.from(JSON.stringify(stored)).toString('base64') + '\r\n';
    throw new Error('예상 밖 명령');
  };
  return {run, calls, get stored() { return stored; }};
}

test('비밀번호 입력: 화면에 아무것도 안 보이고(글자 · 길이 모두) 백스페이스 · 붙여넣기 · 한글 처리, 끝나면 원래 모드로', async () => {
  const t = tty();
  const p = readHidden('비밀번호: ', {stdin: t.i, stdout: t.out});
  type(t.i, 'abx'); type(t.i, '\x7f'); type(t.i, 'c한\u0001'); type(t.i, '\r');
  assert.equal(await p, 'abc한');
  assert.equal(t.o.join(''), '비밀번호: \n'); // 질문과 줄바꿈뿐 (입력한 글자 · * 표시 없음)
  assert.deepEqual(t.i.modes, [true, false]);
});

test('비밀번호 입력: Ctrl+C 는 취소, 터미널이 아니면(파이프 등) 거부', async () => {
  const t = tty();
  const p = readHidden('x: ', {stdin: t.i, stdout: t.out}); type(t.i, 'ab\u0003');
  await assert.rejects(p, /취소/); assert.deepEqual(t.i.modes, [true, false]);
  const piped = new PassThrough();
  await assert.rejects(readHidden('x: ', {stdin: piped, stdout: {write() {}}}), /직접 입력해야/);
});

test('저장: 비밀번호는 명령줄(스크립트)에 없고 stdin(base64)으로만 전달, 경로의 따옴표는 이스케이프, 정책 우회 옵션 없음', () => {
  const f = fakeRun();
  saveCredential(WD, {user: 'svc', password: PW}, f.run);
  const {script, input} = f.calls[0];
  assert.ok(!script.includes(PW) && !script.includes('svc') && !input.includes(PW)); // 평문은 어디에도 없음 (stdin 도 base64)
  assert.deepEqual(JSON.parse(Buffer.from(input, 'base64').toString('utf8')), {user: 'svc', password: PW});
  assert.match(script, /Export-Clixml -Path 'C:\\Users\\a''b\\AppData\\Local\\erp-collector[\\/]erp-cred\.xml'/);
  assert.ok(!/ExecutionPolicy|Bypass/i.test(script));
  assert.throws(() => saveCredential(WD, {user: '', password: 'x'}, f.run), /필요/);
});

test('읽기: 한글이 섞인 계정도 그대로 복원', () => {
  const f = fakeRun(); saveCredential(WD, {user: '김팀장', password: PW}, f.run);
  assert.deepEqual(loadCredential(WD, f.run), {user: '김팀장', password: PW});
});

test('설정 흐름: 확인 입력이 다르면 저장 안 함, 성공하면 한 번 저장하고 출력에 비밀번호 없음', async () => {
  const f = fakeRun(), out = [];
  const answers = (u, ...pws) => ({ask: async () => u, askSecret: async () => pws.shift()});
  await assert.rejects(setCredentials({workDir: WD, ...answers('svc', PW, PW + 'x'), run: f.run, log: m => out.push(m)}), /서로 다릅니다/);
  assert.equal(f.calls.length, 0);
  await setCredentials({workDir: WD, ...answers(' svc ', PW, PW), run: f.run, log: m => out.push(m)});
  assert.equal(f.calls.filter(c => /Export-Clixml/.test(c.script)).length, 1);
  assert.deepEqual(f.stored, {user: 'svc', password: PW});
  assert.ok(!out.join('\n').includes(PW));
  assert.match(out.join('\n'), /저장 완료/);
  await assert.rejects(setCredentials({workDir: WD, ...answers('', PW, PW), run: f.run, log() {}}), /모두 입력/);
});

test('실제 Windows DPAPI 왕복 (Windows 에서만)', {skip: process.platform !== 'win32'}, async () => {
  const os = await import('node:os'), fs = await import('node:fs'), path = await import('node:path');
  const wd = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-'));
  saveCredential(wd, {user: 'svc 한글', password: PW});
  assert.ok(!fs.readFileSync(credFile(wd), 'utf8').includes(PW)); // 파일에 평문 없음
  assert.deepEqual(loadCredential(wd), {user: 'svc 한글', password: PW});
  assert.ok(runPowerShell);
});
