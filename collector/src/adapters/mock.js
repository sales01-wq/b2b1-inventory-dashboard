// 시험용: 실제 ERP 없이 테스트 시트(web/src/lib/__fixtures__)로 엑셀 5개를 만들어 줌
import {writeXlsx} from '../xlsx.js';
import {makeSheets} from '../../../web/src/lib/__fixtures__/sheets.js';

export default function mock({tweak} = {}) {
  return {
    async fetchAll(defs, now) {
      const sh = makeSheets(now.getTime());
      const rows = {inventory: sh.inventory, schedule: sh.schedule, sales1: sh.sales1, sales2: sh.sales2, wms: sh.expiry};
      if (tweak) tweak(rows);
      return new Map(await Promise.all(defs.filter(d => rows[d.id]).map(async d => [d.id, await writeXlsx(rows[d.id])])));
    },
  };
}
