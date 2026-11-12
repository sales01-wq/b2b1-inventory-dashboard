// ERP 읽기 전용 계정을 DPAPI 로 암호화해서 저장 (한 번만): npm run set-credentials
import readline from 'node:readline/promises';
import {loadConfig} from './run.js';
import {readHidden, setCredentials} from './credentials.js';

const config = loadConfig();
const rl = readline.createInterface({input: process.stdin, output: process.stdout});
const ask = q => rl.question(q);
const askSecret = async q => { rl.pause(); try { return await readHidden(q); } finally { rl.resume(); } };
try { await setCredentials({workDir: config.workDir, ask, askSecret}); }
catch (e) { console.error(e.message); process.exitCode = 1; }
finally { rl.close(); }
