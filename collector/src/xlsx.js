// 엑셀 읽기 · 쓰기 (SheetJS xlsx 는 보안 취약점이 있고 고쳐진 npm 판이 없어서 read-excel-file / write-excel-file 사용)
import readExcelFile from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';

const text = v => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

/** 엑셀 → [{name, rows}]  rows 는 글자로 바꾼 2차원 배열 (검사는 머리글 · 행 수 · 부서 열만 보므로 서식 글자는 필요 없음) */
export async function readSheets(buf) {
  const sheets = await readExcelFile(buf);
  return sheets.map(s => ({name: s.sheet, rows: s.data.map(r => r.map(text))}));
}

/** 2차원 배열 → 시트 1개짜리 엑셀 (모의 데이터 · 시험용) */
export function writeXlsx(rows) {
  const cell = v => (v === null || v === undefined || v === '' ? null : {value: String(v), type: String});
  return writeExcelFile(rows.map(r => r.map(cell)), {sheet: 'Sheet1'}).toBuffer();
}
