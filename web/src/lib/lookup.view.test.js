// 바코드 · 거래처 조회 화면 비교 테스트: 운영 index.html 의 조회 화면을 jsdom 에서 실제로 누르고 입력한 결과(그려진 표 · 칩 · 문구와
// 선택 목록)와, 새 화면이 쓰는 actions.js 의 조회 동작 + views.js 의 표 데이터로 만든 결과가 단계마다 같은지 확인합니다.
import {afterAll, describe, expect, it, vi} from 'vitest';
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
  // 다운로드 목록: 우선순위(빈 값 · 0 → 1) 로 할당 순서 변경, 목록의 필요수량 · 박스 입력, 행 · 입고예정 · LOT 빼기
  ['prio', 'SB001||EMP 물류', '1'],
  ['prio', 'SB001||B2B1팀 창고', '3'],
  ['prio', 'SB006||EMP 물류', '0'],
  ['xneed', 'SB001', '1,700'],
  ['xbox', 'MT003', '아웃W', '400'],
  ['xbox', 'MT003', '아웃입수', '12'],
  ['xbox', 'MT003', '아웃W', '0'],
  ['xrm', 'SB001||EMP 물류'],
  ['xrmInc', 0],
  ['xrmExp', 0],
  ['wh', 'SB001', 'EMP 물류'], // 뺀 창고를 다시 담으면 우선순위 = 그 품번의 행 수 + 1
  ['lotOn', 'SB001', 'L-LONG'],
  ['lotOn', 'SB001', 'L-LONG2'], // LOT 2개 → 행이 늘어남
  ['xrmExpRow', 1], // 늘어난 행의 '삭제' = 그 LOT 빼기
  ['search', '8800000000097', '', 'B유통'], // 거래처 우선 매칭
  ['search', 'mt002', '', ''], // 품번(대소문자 무시)
  ['search', '', '', ''], // 둘 다 비었으면 그대로
  // PLT 계산 (3단계): 품목별 → 혼적(+상세) → 빈 칸 · 0 은 기본값. 계산 후 표의 PLT 칸 · 결과 · 혼적 구성 · CSV 비교
  ['xneed', 'SB006', '300'],
  ['plt', {L: '110', W: '110', H: '150', baseHeight: '15', tare: '20', mixMode: 'X'}],
  ['csv'],
  ['plt', {L: '120', W: '100', H: '1600', baseHeight: '', tare: '25', mixMode: 'O'}],
  ['pltDetail'],
  ['csv'],
  ['xbox', 'MT003', '아웃W', '300'], // 계산 뒤 박스 값을 바꿔도 다시 계산하기 전까지 결과는 그대로
  ['pltDetail'],
  ['plt', {L: '', W: '0', H: '', baseHeight: '', tare: '', mixMode: 'X'}],
  ['csv'],
  ['xclear'], // 전체 지우기: 담은 것 · PLT 결과만 (필요 수량 · 박스 입력값은 그대로)
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
    if (s[0] === 'lotOn' && !a.ui.expiryList.some(x => x.품번 === s[1] && x.LOT === s[2])) first(`[data-action="toggle-expiry"][data-pn="${q(s[1])}"][data-lot="${q(s[2])}"]`).click();
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
    const xp = '#exportPanel ';
    if (s[0] === 'prio') { const el = first(`${xp}[data-action="set-priority"][data-key="${q(s[1])}"]`); el.value = s[2]; fire(el, 'change'); }
    if (s[0] === 'xneed') { const el = first(`${xp}[data-action="set-needed-qty"][data-pn="${q(s[1])}"]`); el.value = s[2].replace(/,/g, ''); fire(el, 'change'); }
    if (s[0] === 'xbox') { const el = first(`${xp}[data-action="set-box-dim"][data-pn="${q(s[1])}"][data-field="${q(s[2])}"]`); el.value = s[3]; fire(el, 'change'); w.renderLookupBatch(); } // 기존은 입력만 저장하고 다른 동작 때 다시 그림
    if (s[0] === 'xrm') first(`${xp}[data-action="remove-export"][data-key="${q(s[1])}"]`).click();
    if (s[0] === 'xrmInc') d.querySelectorAll(`${xp}[data-action="remove-incoming"]`)[s[1]].click();
    if (s[0] === 'xrmExp') d.querySelectorAll(`${xp}td[data-col="lot"] [data-action="remove-expiry"]`)[s[1]].click();
    if (s[0] === 'xrmExpRow') d.querySelectorAll(`${xp}td[data-col="del"] [data-action="remove-expiry"]`)[s[1] - 1].click();
    if (s[0] === 'xclear') first(`${xp}[data-action="clear-export"]`).click();
    if (s[0] === 'plt') o.calcExportPlt(s[1]); // 입력칸에 값을 넣고 PLT 계산 (단추와 같은 함수)
    if (s[0] === 'pltDetail') first(`${xp}[data-action="toggle-plt-detail"]`).click();
    let csvOut = null;
    if (s[0] === 'csv') csvOut = o.csv('downloadExportCsv');

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
    // 다운로드 목록: 열 이름(data-col) → 칸 내용. 입력칸은 값, 삭제 단추는 (동작, 대상), ×(빼기) 표시는 뺌
    const exportRows = [...d.querySelectorAll('#exportPanel tbody tr')].map(tr => Object.fromEntries([...tr.cells].map(c => {
      const k = c.dataset.col;
      if (k === 'del') { const b = c.querySelector('button'); return [k, b ? [b.dataset.action, b.dataset.key] : null]; }
      const ins = [...c.querySelectorAll('input')];
      if (ins.length) return [k, ins.map(i => i.value)];
      const cc = c.cloneNode(true); cc.querySelectorAll('[data-action^="remove"]').forEach(x => x.remove());
      return [k, txt(cc)];
    })));
    const exportCols = [...d.querySelectorAll('#exportPanel thead th')].map(th => th.dataset.col);
    const banner = d.querySelector('#exportPanel .banner.info');
    const summary = banner ? {stats: [...banner.querySelectorAll(':scope > div:first-child > div')].map(x => [...x.children].map(txt)), note: txt(banner.querySelector(':scope > div:last-child'))} : null;
    const words = el => { const tw = d.createTreeWalker(el, 4), o2 = []; for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.textContent.trim()) o2.push(n.textContent.trim()); return o2.join(' '); };
    const packing = [...d.querySelectorAll('#exportPanel div[style*="min-width:190px"]')].map(words);
    const detailBtn = d.querySelector('[data-action="toggle-plt-detail"]') ? txt(d.querySelector('[data-action="toggle-plt-detail"]')).replace(/ [▲▾]$/, '') : null;
    out.push({
      summary, packing, detailBtn, csv: csvOut,
      exportRows, exportCols, exportTitle: d.querySelector('#exportPanel .section-title') ? txt(d.querySelector('#exportPanel .section-title')) : null,
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
  vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(NOW); // CSV 파일명의 날짜 · 유통기한 2년 기준을 운영 쪽과 같은 날로
  const p = await loadPort();
  const a = p.api;
  const act = await import('./actions.js'); // loadPort 와 같은 모듈 묶음
  const {setBoxDim} = await import('../data/settings.js');
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
    if (s[0] === 'lotOn' && !a.ui.expiryList.some(x => x.품번 === s[1] && x.LOT === s[2])) act.pickExpiry(rowOf(s[1]), a.expiryRows(s[1]).rows.find(l => l.lot === s[2]));
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
    if (s[0] === 'prio') act.setPriority(s[1], s[2]);
    if (s[0] === 'xneed') act.setNeededQty(s[1], s[2]);
    if (s[0] === 'xbox') setBoxDim(s[1], s[2], s[3]);
    const xm = () => a.exportPanelModel();
    if (s[0] === 'xrm') act.removeExportRow(xm().rows.find(r => r.del && r.del.key === s[1]).del);
    if (s[0] === 'xrmInc') act.removeIncomingItem(xm().rows.flatMap(r => r.inc.map(i => i.key))[s[1]]);
    if (s[0] === 'xrmExp') act.removeExpiryItem(xm().rows.filter(r => r.lot).map(r => r.lot.key)[s[1]]);
    if (s[0] === 'xrmExpRow') act.removeExportRow(xm().rows.filter(r => r.del && r.del.kind === 'expiry')[s[1] - 1].del);
    if (s[0] === 'xclear') act.clearExport();
    if (s[0] === 'plt') { for (const [k, v] of Object.entries(s[1])) a.ui.pltForm[k] = k === 'mixMode' ? v : v === '' ? null : Number(v); act.runPlt(); }
    if (s[0] === 'pltDetail') act.togglePltDetail();
    const csvOut = s[0] === 'csv' ? a.exportCsv() : null;

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
    const em = a.exportPanelModel();
    const val = c => (c === null ? '-' : 'fixed' in c ? c.fixed : [c.value === null ? '' : String(c.value)]);
    const dims = c => ('fixed' in c ? c.fixed : c.fields.map(f => (f.value === null ? '' : String(f.value))));
    const exportRows = em.rows.map(r => Object.fromEntries(em.cols.map(([k]) => {
      const v = {
        del: r.del ? [r.del.kind === 'expiry' ? 'remove-expiry' : 'remove-export', r.del.key] : null,
        priority: r.priority ? [String(r.priority.value)] : '-', needed: [String(a.ui.neededQty.get(r.pn) || '')],
        diff: r.diff ? r.diff.text : '-', incDate: r.inc.length ? r.inc.map(i => i.date).join(', ') : '-', lot: r.lot ? r.lot.text : '-',
        outDims: dims(r.outDims), inDims: dims(r.inDims), prodDims: dims(r.prodDims),
        outWeight: val(r.outWeight), outCount: val(r.outCount), inWeight: val(r.inWeight), inCount: val(r.inCount), prodWeight: val(r.prodWeight),
        remainder: r.remainder.text,
      };
      return [k, k in v ? v[k] : r[k]];
    })));
    const sm = em.summary;
    out.push({
      summary: sm ? {
        stats: [[sm.pltLabel, fmt(sm.pltTotal) + ' PLT'], ['박스 중량 합계', fmt(sm.boxWeightTotal) + ' kg'], [`빈 PLT 무게 합계 (${fmt(sm.pltTotal)}개×${fmt(sm.tareKg)}kg)`, fmt(sm.pltTareTotal) + ' kg'], ['총 예상 중량', fmt(sm.grandTotal) + ' kg']],
        note: `(필요수량 입력된 품목은 필요수량 기준, 없으면 선택한 가용재고 합계 기준) (최대높이에서 밑판 두께 ${fmt(sm.baseHeightCm)}cm를 뺀 값으로 적재층수 계산)`,
      } : null,
      packing: em.mixed && em.packing && a.ui.showPltPackingDetail ? em.packing.map(p => `PLT ${p.index} ${p.items.map(it => `${it.pn} ${it.pct}%`).join(' ')} 사용률 ${p.used}% 예상 중량 ${p.weight} kg`) : [],
      detailBtn: em.mixed && em.packing ? (a.ui.showPltPackingDetail ? 'PLT 상세 숨기기' : 'PLT 상세보기') : null,
      csv: csvOut,
      exportRows, exportCols: em.rows.length ? em.cols.map(([k]) => k) : [], exportTitle: em.rows.length ? `다운로드 목록 (${fmt(em.rows.length)})` : null,
      step: s.join('|'), blocks,
      allBtn: resolved > 1 ? `✨ 전체 추천 선택 (${fmt(resolved)}개 품목)` : null,
      altToggle: resolved > 0,
      lists: canon([a.ui.exportList, a.ui.incomingList, a.ui.expiryList, a.ui.neededQty, a.ui.activeBatchIdx, a.ui.autoSelectIncludeAlternatives]),
    });
  }
  return out;
}

describe('바코드 · 거래처 조회 = 운영 조회 화면을 직접 누른 결과', () => {
  afterAll(() => vi.useRealTimers());
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
    // 다운로드 목록도 여러 상태를 거침: 행 여러 개, LOT 로 늘어난 행, 우선순위 바뀐 행, 박스 입력칸, 혼적 X 의 33열
    expect(Math.max(...exp.map(x => x.exportRows.length))).toBeGreaterThan(6);
    expect(exp.some(x => x.exportRows.some(r => r.del && r.del[0] === 'remove-expiry'))).toBe(true);
    expect(exp.some(x => x.exportRows.some(r => Array.isArray(r.priority) && r.priority[0] === '3'))).toBe(true);
    expect(exp.some(x => x.exportRows.some(r => Array.isArray(r.outCount) && r.outCount[0] === '12'))).toBe(true);
    expect(exp.find(x => x.exportCols.length).exportCols.length).toBe(33);
    expect(exp.at(-2).exportRows).toEqual([]); // 전체 지우기
    // PLT: 품목별 · 혼적 결과, 혼적 구성, CSV 3번이 실제로 나옴
    expect(exp.filter(x => x.summary).map(x => x.summary.stats[0][0])).toContain('품목별 개별 계산 기준 총 예상 PLT');
    expect(exp.filter(x => x.summary).map(x => x.summary.stats[0][0])).toContain('혼적 기준 총 예상 PLT');
    expect(Math.max(...exp.map(x => x.packing.length))).toBeGreaterThan(1);
    expect(exp.filter(x => x.csv && x.csv.csv.includes('PLT')).length).toBe(3);
    expect(exp.some(x => x.exportRows.some(r => r.pltNumber && r.pltNumber.startsWith('PLT ')))).toBe(true);
    for (let i = 0; i < STEPS.length; i++) expect(act[i], STEPS[i].join('|')).toEqual(exp[i]);
  }, 30000); // 운영 화면을 60단계 직접 누르므로 기본 5초보다 김
});
