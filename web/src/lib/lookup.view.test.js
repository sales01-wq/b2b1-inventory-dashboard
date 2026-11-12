// 바코드 · 거래처 조회 화면 비교 테스트: 운영 index.html 의 조회 화면을 jsdom 에서 실제로 누르고 입력한 결과(그려진 표 · 칩 · 문구와
// 선택 목록)와, 새 화면이 쓰는 actions.js 의 조회 동작 + views.js 의 표 데이터로 만든 결과가 단계마다 같은지 확인합니다.
import {describe, expect, it} from 'vitest';
import {makeSheets} from './__fixtures__/sheets.js';
import {NOW, loadOracle, loadPort, canon} from './__fixtures__/harness.js';

const fmt = n => new Intl.NumberFormat('ko-KR').format(Math.round(n || 0));
const sh = makeSheets(NOW);
function load(a) {
  a.state.inventory = a.parseInventory(sh.inventory);
  a.state.schedule = a.parseSchedule(sh.schedule);
  a.state.scheduleMonthLabels = a.state.schedule.monthLabels;
  a.state.salesByTeam = {B2B1팀: a.parseSales(sh.sales1), B2B2팀: a.parseSales(sh.sales2)};
  a.state.sales = a.salesForTeam();
  a.state.expiry = a.parseExpiry(sh.expiry);
  a.state.productMaster = a.parseProductMaster(sh.productMaster);
  a.computeDerived();
  a.state.loaded = true;
}

/*
 * 같은 순서로 실행할 단계. 대상은 품번 · 창고 · LOT · 월로 지정하고, 운영 쪽은 그 data-* 를 가진 첫 요소를,
 * 새 쪽은 조회 결과(대체 품번 포함)에서 그 품번의 첫 행을 씁니다.
 */
const STEPS = [
  ['search', '8800000000011\t1,500\n8800000000097 30\nMT002, MC002 5\nUNKNOWN\n8800000000011\nMT003', '세트, 크림\n없는품명', ''],
  ['wh', 'SB001', 'EMP 물류'],
  ['wh', 'SB001', 'EMP 물류'], // 담긴 창고를 다시 눌러도 빠지지 않음
  ['wh', 'SB001', 'B2B1팀 창고'],
  ['wh', 'MT003', '재고없음'],
  ['lot', 'SB001', 'L-LONG'],
  ['lot', 'SB001', 'L-LONG2'],
  ['lot', 'SB001', 'L-LONG'], // 다시 누르면 빠짐
  ['inc', 'SB001', 0],
  ['inc', 'SB001', 1],
  ['inc', 'SB001', 1], // 다시 누르면 빠짐
  ['wh', 'SB006', 'EMP 물류'], // 대체 품번 칸에서 담기
  ['lot', 'SB006', 'S6'],
  ['inc', 'SB005', 0],
  ['need', 'SB004', '50'],
  ['need', 'SB001', '2,000'],
  ['need', 'SB004', '0'], // 0 → 지움
  ['auto', 'SB004'],
  ['alt', true],
  ['auto', 'MT002'],
  ['autoAll'],
  ['master', 'SB001'],
  ['master', 'SB004'],
  ['collapse', 0],
  ['active', 1],
  ['active', 1],
  ['active', 2],
  ['collapse', 0],
  ['search', '8800000000097', '', 'B유통'], // 거래처 우선 매칭
  ['search', 'mt002', '', ''], // 품번(대소문자 무시)
  ['search', '', '', ''], // 둘 다 비었으면 그대로
  ['clear'],
];

// ---------- 운영 화면 ----------
function runOracle(o) {
  const {api: a, w} = o, d = w.document;
  load(a);
  const txt = e => e.textContent.replace(/\s+/g, ' ').trim();
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, {bubbles: true}));
  const first = sel => { const el = d.querySelector(sel); if (!el) throw new Error('없음: ' + sel); return el; };
  const q = s => w.CSS ? w.CSS.escape(s) : s.replace(/"/g, '\\"');
  const out = [];
  for (const s of STEPS) {
    if (s[0] === 'search') {
      first('#lookupBarcode').value = s[1]; first('#lookupNameQuery').value = s[2]; first('#lookupCustomer').value = s[3];
      first('#lookupForm').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
    }
    if (s[0] === 'wh') first(`[data-action="add-to-export"][data-pn="${q(s[1])}"][data-warehouse="${q(s[2])}"]`).click();
    if (s[0] === 'lot') first(`[data-action="toggle-expiry"][data-pn="${q(s[1])}"][data-lot="${q(s[2])}"]`).click();
    if (s[0] === 'inc') d.querySelectorAll(`[data-action="toggle-incoming"][data-pn="${q(s[1])}"]`)[s[2]].click();
    if (s[0] === 'need') { const el = first(`[data-action="set-needed-qty"][data-pn="${q(s[1])}"]`); el.value = s[2].replace(/,/g, ''); fire(el, 'change'); }
    if (s[0] === 'auto') first(`[data-action="auto-select-recommended"][data-batch-idx="${a.ui.lookupItems.findIndex(x => x.row && x.row.품번 === s[1])}"]`).click();
    if (s[0] === 'alt') { const el = first('#autoSelectAltToggle'); el.checked = s[1]; fire(el, 'change'); }
    if (s[0] === 'autoAll') first('[data-action="auto-select-recommended-all"]').click();
    if (s[0] === 'collapse') first(`[data-action="toggle-collapse"][data-batch-idx="${s[1]}"]`).click();
    if (s[0] === 'active') first(`[data-action="toggle-product"][data-batch-idx="${s[1]}"]`).click();
    if (s[0] === 'master') first(`[data-action="toggle-master-info"][data-pn="${q(s[1])}"]`).click();
    if (s[0] === 'clear') first('[data-action="clear-lookup-barcode"]').click();

    // 그려진 결과 읽기 (조회 결과 순서대로)
    const blocks = [...d.querySelectorAll('#lookupResults > .lookup-layout, #lookupResults > .panel, #lookupResults > .banner')].map(b => {
      if (b.classList.contains('banner')) return {msg: txt(b)};
      if (b.classList.contains('panel')) return {collapsed: txt(b.querySelector('div > div:last-child'))};
      const panels = [...b.querySelectorAll('.main-box > .panel')];
      const head = panels[0];
      const rows = tb => (tb ? [...tb.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(txt)) : null);
      const chips = el => [...el.querySelectorAll('.incoming-chip')].map(c => [txt(c.querySelector('.m')), txt(c.querySelector('.d')), txt(c.querySelector('.q'))]);
      const lines = [...head.querySelectorAll('.info-line')].map(l => [...l.children].map(txt).join(' '));
      const master = panels[4].querySelector('table') ? [...panels[4].querySelectorAll('table')].map(tb => [...tb.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => {
        const ins = [...c.querySelectorAll('input')];
        return ins.length ? ins.map(i => i.value) : txt(c);
      }))) : null;
      return {
        pn: txt(head.querySelector('div[style*="font-size:22px"]')), name: txt(head.querySelector('div[style*="margin-top:2px"]')),
        active: !!head.querySelector('.badge.safe'),
        vendor: lines[0], barcode: lines[1], diff: lines[3] || null,
        need: head.querySelector('[data-action="set-needed-qty"]').value,
        wh: rows(panels[1].querySelector('table')), lot: rows(panels[2].querySelector('table')), lotEmpty: !panels[2].querySelector('table'),
        inc: chips(panels[3]), master,
        alts: [...b.querySelectorAll('.alt-card')].filter(c => c.querySelector('code')).map(c => {
          const t = [...c.querySelectorAll('table')];
          const lotTb = c.querySelectorAll(':scope > table').length === 3 ? t[1] : null;
          return {
            pn: txt(c.querySelector('code')), wh: rows(t[0]), lot: lotTb ? rows(lotTb) : null, inc: chips(c),
            box: [...t[t.length - 1].querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(txt)),
          };
        }),
      };
    });
    const bar = d.querySelector('#lookupResults > div:first-child');
    out.push({
      step: s.join('|'), blocks,
      allBtn: d.querySelector('[data-action="auto-select-recommended-all"]') ? txt(d.querySelector('[data-action="auto-select-recommended-all"]')) : null,
      altToggle: bar && bar.querySelector('#autoSelectAltToggle') ? true : false,
      lists: canon([a.ui.exportList, a.ui.incomingList, a.ui.expiryList, a.ui.neededQty, a.ui.activeBatchIdx, a.ui.autoSelectIncludeAlternatives]),
    });
  }
  return out;
}

// ---------- 새 화면 (actions.js 동작 + views.js 데이터, 화면 글자는 LookupPage 와 같은 규칙) ----------
async function runPort() {
  const p = await loadPort();
  const a = p.api;
  const act = await import('./actions.js'); // loadPort 와 같은 모듈 묶음
  load(a);
  const rowOf = pn => {
    for (const it of a.ui.lookupItems) {
      if (it.row && it.row.품번 === pn) return it.row;
      const alt = (it.alternatives || []).find(x => x.품번 === pn);
      if (alt) return alt;
    }
    throw new Error('없음: ' + pn);
  };
  const whCells = (pn, compact) => {
    const w = a.warehouseRows(pn);
    const rows = w.rows.map(r => [r.창고 + (r.picked ? ' 추가됨' : ''), fmt(r.가용재고), ...(compact ? [] : [fmt(r.현재고), fmt(r.입고예정), fmt(r.출고예정)])]);
    if (w.total !== null) rows.push(['합계', fmt(w.total), ...(compact ? [] : [''])]);
    return rows;
  };
  const lotCells = (pn, compact) => {
    const e = a.expiryRows(pn);
    return e ? e.rows.map(l => [l.lot + (l.picked ? ' 추가됨' : ''), l.date, fmt(l.avail), ...(compact ? [] : [e.warn ? '2년 미만-주의' : ''])]) : null;
  };
  const chips = row => a.incomingChips(row).map(c => [`${c.m} 입고예정${c.picked ? ' 추가됨' : ''}`, c.d || '날짜 미정', fmt(c.q) + '개']);
  const out = [];
  for (const s of STEPS) {
    if (s[0] === 'search') { act.setLookupText('lookupBarcodeText', s[1]); act.setLookupText('lookupNameText', s[2]); act.setLookupText('lookupCustomerText', s[3]); act.lookupSearch(); }
    if (s[0] === 'wh') { const r = rowOf(s[1]); const w = a.warehouseRows(s[1]).rows.find(x => x.창고 === s[2]); act.pickWarehouse(r, w.창고, w.가용재고); }
    if (s[0] === 'lot') act.pickExpiry(rowOf(s[1]), a.expiryRows(s[1]).rows.find(l => l.lot === s[2]));
    if (s[0] === 'inc') { const r = rowOf(s[1]); act.pickIncoming(r, a.incomingChips(r)[s[2]]); }
    if (s[0] === 'need') act.setNeededQty(s[1], s[2]);
    if (s[0] === 'auto') act.autoSelectOne(a.ui.lookupItems.findIndex(x => x.row && x.row.품번 === s[1]));
    if (s[0] === 'alt') act.setAutoSelectAlternatives(s[1]);
    if (s[0] === 'autoAll') act.autoSelectAll();
    if (s[0] === 'collapse') act.toggleCollapse(s[1]);
    if (s[0] === 'active') act.toggleActiveProduct(s[1]);
    if (s[0] === 'master') act.toggleMasterInfo(s[1]);
    if (s[0] === 'clear') act.clearLookupBarcode();

    const blocks = [];
    a.ui.lookupItems.forEach((it, i) => {
      if (it.status === 'truncated') return blocks.push({msg: `'${it.nameQuery}' 검색 결과가 더 있습니다 (${fmt(it.extra)}개 더). 검색어를 조금 더 구체적으로 입력하면 좁혀집니다.`});
      if (it.status === 'notfound') return blocks.push({msg: it.nameQuery !== undefined ? `'${it.nameQuery}'가 포함된 품명을 제품일정표에서 찾지 못했습니다.` : '해당 바코드/품번으로 제품일정표에서 일치하는 품목을 찾지 못했습니다. 다시 확인해주세요.'});
      const r = it.row;
      if (a.ui.collapsedItems.has(i)) return blocks.push({collapsed: a.selectionSummaryFor(r.품번)});
      const nd = a.productNeedDiff(r.품번);
      const bm = a.ui.masterInfoExpanded.has(r.품번) ? a.boxModel(r.품번) : null;
      const val = c => (c === null ? '-' : 'fixed' in c ? c.fixed : [c.value === null ? '' : String(c.value)]);
      blocks.push({
        pn: r.품번, name: r.품명, active: a.ui.activeBatchIdx === i,
        vendor: `거래처 ${r.거래처 || '-'}`, barcode: `바코드 ${r.바코드}`,
        diff: nd.needed ? `선택 창고 재고 대비 ${nd.diff < 0 ? '' : '+'}${fmt(nd.diff)}개` : null,
        need: String(a.ui.neededQty.get(r.품번) || ''),
        wh: whCells(r.품번), lot: lotCells(r.품번), lotEmpty: !a.expiryRows(r.품번), inc: chips(r),
        master: bm ? [
          bm.rows.map(x => [x.label, 'fixed' in x.dims ? x.dims.fixed : x.dims.fields.map(f => (f.value === null ? '' : String(f.value))), val(x.weight), val(x.count)]),
          ...(bm.plt ? [[[bm.plt.cells[0][0], bm.plt.cells[0][1], bm.plt.cells[1][0], bm.plt.cells[1][1]], [bm.plt.cells[2][0], bm.plt.cells[2][1], bm.plt.cells[3][0], bm.plt.cells[3][1]], [bm.plt.cells[4][0], bm.plt.cells[4][1], bm.plt.cells[5][0], bm.plt.cells[5][1]]]] : []),
        ] : null,
        alts: (it.alternatives || []).map(x => ({
          pn: x.품번, wh: whCells(x.품번, true), lot: lotCells(x.품번, true), inc: chips(x),
          box: a.boxCompactRows(x.품번).map(b => (b.dim ? [b.label, b.dim, b.weight] : [b.label, '정보 없음'])),
        })),
      });
    });
    const resolved = a.ui.lookupItems.filter(x => x.status === 'resolved').length;
    out.push({
      step: s.join('|'), blocks,
      allBtn: resolved > 1 ? `✨ 전체 추천 선택 (${fmt(resolved)}개 품목)` : null,
      altToggle: resolved > 0,
      lists: canon([a.ui.exportList, a.ui.incomingList, a.ui.expiryList, a.ui.neededQty, a.ui.activeBatchIdx, a.ui.autoSelectIncludeAlternatives]),
    });
  }
  return out;
}

describe('바코드 · 거래처 조회 = 운영 조회 화면을 직접 누른 결과', () => {
  it('단계마다 그려진 표 · 칩 · 문구와 선택 목록이 같음', async () => {
    const o = loadOracle();
    const exp = runOracle(o);
    o.close();
    const act = await runPort();
    // 시나리오가 실제로 여러 상태를 거침 (빈 결과끼리 비교 방지)
    expect(exp[0].blocks.length).toBeGreaterThan(8);
    expect(exp.some(x => x.blocks.some(b => b.alts && b.alts.length))).toBe(true);
    expect(exp.some(x => x.blocks.some(b => b.master))).toBe(true);
    expect(exp.some(x => x.blocks.some(b => b.collapsed))).toBe(true);
    expect(exp.at(-1).blocks).toEqual([]);
    for (let i = 0; i < STEPS.length; i++) expect(act[i], STEPS[i].join('|')).toEqual(exp[i]);
  });
});
