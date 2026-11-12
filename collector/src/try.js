// 한 파일씩 시험 다운로드 (업로드 안 함): node src/try.js sales1 [--show]   (id: inventory wms sales1 sales2 schedule, 생략하면 전부)
// 받은 파일은 workDir\try 에 저장하고 검사 결과만 출력합니다. 업로드 폴더에는 아무것도 쓰지 않습니다.
import fs from 'node:fs';
import path from 'node:path';
import {FILES, fileName} from './files.js';
import {validateFile} from './validate.js';
import {loadConfig} from './run.js';
import erp from './adapters/erp.js';

const args = process.argv.slice(2);
const show = args.includes('--show');
const ids = args.filter(a => !a.startsWith('--'));
const config = loadConfig();
if (show) config.headless = false;
const defs = (config.files || FILES).filter(d => !ids.length || ids.includes(d.id));
if (!defs.length) { console.log('알 수 없는 id. 사용: inventory wms sales1 sales2 schedule'); process.exit(1); }
const now = new Date();
const dir = path.join(config.workDir, 'try'); fs.mkdirSync(dir, {recursive: true});
let bad = 0;
for (const d of defs) {
  try {
    const buf = (await erp(config).fetchAll([d], now)).get(d.id);
    fs.writeFileSync(path.join(dir, fileName(d, now)), buf);
    const r = await validateFile(d, buf);
    console.log(`OK   ${d.id}: ${r.rows}행, 종류 ${d.type} 확인 → ${path.join(dir, fileName(d, now))}`);
  } catch (e) { bad++; console.log(`실패 ${d.id}: ${e.message}`); }
}
process.exitCode = bad ? 1 : 0;
