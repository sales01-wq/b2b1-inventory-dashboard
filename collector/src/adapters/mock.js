// 시험용: 실제 ERP 없이 테스트 시트(web/src/lib/__fixtures__)로 엑셀 5개를 만들어 줌
import XLSX from 'xlsx';
import {makeSheets} from '../../../web/src/lib/__fixtures__/sheets.js';

const toXlsx = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1'); return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'}); };

export default function mock({tweak} = {}) {
  return {
    async fetchAll(defs, now) {
      const sh = makeSheets(now.getTime());
      const rows = {inventory: sh.inventory, schedule: sh.schedule, sales1: sh.sales1, sales2: sh.sales2, expiry: sh.expiry};
      if (tweak) tweak(rows);
      return new Map(defs.filter(d => rows[d.id]).map(d => [d.id, toXlsx(rows[d.id])]));
    },
  };
}
