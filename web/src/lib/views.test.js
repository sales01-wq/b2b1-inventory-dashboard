// 화면 계산 비교 테스트: 운영 index.html 이 실제로 그린 값(숫자 · 목록 · 문구)과
// src/lib/views.js · upload.js 가 만든 값이 같은지 확인합니다. 새 화면은 이 함수들의 결과만 그립니다.
import Papa from 'papaparse';
import {JSDOM} from 'jsdom';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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
const setSet = (s, xs) => { s.clear(); xs.forEach(x => s.add(x)); };

// 발주 현황 화면 조건 조합
const FORECAST_CASES = []; // 발주 현황은 목표 재고 방식으로 바뀌어 운영 화면과 비교하지 않음 (forecast.target.test.js 가 검증)

function setForecast(a, c) {
  if (c.team) { a.ui.team = c.team; load(a); }
  a.ui.forecastGrade = c.grade; a.ui.forecastCustomer = c.cust; a.ui.forecastBrand = c.brand || ''; a.ui.forecastSearch = c.search || '';
  a.ui.forecastShowNoSales = !!c.showNoSales; a.ui.forecastOverstockScope = c.scope || 'all'; a.ui.forecastPage = c.page || 50;
  setSet(a.ui.forecastPnChips, c.chips || []); setSet(a.ui.brandSelected, c.brands || []);
  setSet(a.ui.forecastExpanded, a.state.forecast.map(x => x.품번)); // 모든 행을 펼쳐서 상세(발주 패턴 · 창고 · 입고예정)까지 비교
}

// 비율이 정수로 안 떨어지는 조합 포함 (반올림 확인)
const OVERVIEW_CASES = [['B2B1팀', []], ['B2B1팀', ['마미케어', '밀크터치']], ['B2B1팀', ['성분에디터']], ['B2B2팀', []], ['전체', []], ['전체', ['마미케어']], ['B2B1팀', ['밀크터치', '마미케어'], {MT002: {minQty: 200}}]]; // 마지막: 위험 1 · 여유 2 → 33% / 67%

// 히어로 알람: 없음 / 1개 / 12개 넘음 (가짜 품번까지 13개를 기준 이상으로 설정 — 데이터에 없는 품번은 알람에 안 들어감)
const ALL_PNS = ['SB001', 'SB002', 'SB003', 'SB004', 'SB005', 'SB006', 'MT001', 'MT002', 'MT003', 'MC001', 'MC002'];
const HERO_ALERT_CASES = [
  ['B2B1팀', {}], ['B2B1팀', {MT002: {minQty: 200}}], ['전체', {MT002: {minQty: 200, warnQty: 500}, MC002: {minQty: 10}}],
  ['B2B1팀', Object.fromEntries(ALL_PNS.map(pn => [pn, {minQty: 1e9}]))],
  ['B2B1팀', Object.fromEntries(ALL_PNS.map(pn => [pn, {minQty: 1e9}])), 13], // 알람 13개 → '외 1개'
];
const withAlerts = (a, n) => { if (n) a.state.heroAlerts = Array.from({length: n}, (_, k) => a.state.heroAlerts[k % a.state.heroAlerts.length]); };

const CUSTOMER_CASES = [[[], ''], [['A상사'], ''], [['A상사', 'B유통'], ''], [['A상사', 'B유통', 'C마트'], '크림'], [[], '세럼'], [['B유통'], 'mc']];

// ---------- 운영 화면에서 읽기 ----------
function fromOracle(o) {
  const {api: a, w} = o, d = w.document;
  const t = s => [...d.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  const cells = tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim());
  const out = {};
  load(a); w.renderAll();

  for (const [team, brands, hero] of OVERVIEW_CASES) {
    a.ui.team = team; a.settings.hero = hero || {}; load(a); setSet(a.ui.brandSelected, brands); w.renderOverview();
    out['overview:' + team + brands] = {cards: t('#overviewCards .v'), circles: t('#signalCircles > div'), total: t('#signalTotal')[0]};
  }
  for (const [i, [team, hero, n]] of HERO_ALERT_CASES.entries()) {
    a.ui.team = team; a.settings.hero = hero; load(a); withAlerts(a, n); w.renderHeroAlerts();
    const box = id => ({title: t(`#${id} strong`)[0] || null, items: t(`#${id} li`), more: t(`#${id} ul + div`)[0] || null});
    out['hero:' + i] = [box('heroAlertOverview'), box('heroAlertForecast')];
  }
  a.ui.team = 'B2B1팀'; a.settings.hero = {}; load(a); a.ui.brandSelected.clear();

  FORECAST_CASES.forEach((c, i) => {
    setForecast(a, c); w.renderForecast();
    const bar = t('#forecastTable > div:first-child')[0] || '';
    const m = bar.match(/지금 발주 필요 ([\d,]+)개 품목 \/ 총 ([\d,]+)개/);
    const rows = [...d.querySelectorAll('#forecastTable tr.forecast-row')].map(cells);
    out['forecast:' + i] = {
      list: canon(a.ui._forecastCsvRows), visible: [...a.ui.forecastVisiblePns],
      chips: t('#forecastFilterChips [data-fc-grade]'), brandChips: t('#forecastFilterChips [data-fc-brand]'),
      need: m ? [m[1], m[2]] : bar.includes('지금 발주할 품목 없음') || rows.length === 0 && !bar ? null : 'unexpected:' + bar,
      cs: [...d.querySelectorAll('[data-cs-pick]')].map(e => e.dataset.csPick).filter(Boolean),
      rows: rows.map(r => [r[1].replace(/^[▶▼] /, '').replace('★', ''), ...r.slice(3)]),
      more: t('#forecastMoreWrap button')[0] || '',
      // 펼친 행의 표 중 발주 패턴(거래처) · 최근 판매(실적일자) · 입고예정(월)만 비교 (창고표는 기존 warehouseTableHtml 그대로 옮길 예정)
      details: [...d.querySelectorAll('#forecastTable tr.detail-row')].map(tr => [...tr.querySelectorAll('table')]
        .filter(tb => ['거래처', '실적일자', '월'].includes(tb.querySelector('th').textContent.trim()) && tb.querySelectorAll('th').length !== 4 || tb.querySelector('th').textContent.trim() === '월')
        .map(tb => [...tb.tBodies[0].rows].map(cells))),
      wh: [...d.querySelectorAll('#forecastTable tr.detail-row')].map(tr => [...tr.querySelectorAll('table')]
        .filter(tb => tb.querySelector('th').textContent.trim() === '창고').map(tb => [...tb.tBodies[0].rows].map(cells))),
    };
    if (c.team) { a.ui.team = 'B2B1팀'; load(a); }
  });

  CUSTOMER_CASES.forEach(([cust, search], i) => {
    setSet(a.ui.custSelected, cust); a.ui.customerPnSearch = search; a.ui.customerPage = i === 2 ? 3 : 50;
    w.renderCustomerTable();
    out['customer:' + i] = {head: t('#customerTable thead th'), rows: [...d.querySelectorAll('#customerTable tbody tr')].map(cells), more: t('#customerMoreWrap button')[0] || ''};
  });
  a.ui.custSelected.clear(); a.ui.customerPnSearch = ''; a.ui.customerPage = 50;

  for (const q of ['세럼, mc', 'sb00\n없는', '  ']) {
    a.ui.skuStatusSearch = q; w.renderSkuStatusSearchResults();
    out['skuSearch:' + q] = [...a.ui.skuStatusLastMatches];
  }
  setSet(a.ui.skuStatusSelected, ['SB001', 'MC002']); w.renderSkuStatusTable();
  out.skuTable = {head: t('#skuStatusTableWrap thead th'), rows: [...d.querySelectorAll('#skuStatusTableWrap tbody tr')].map(cells)};

  for (const [cs, ps] of [['', ''], ['상', 'sb'], ['없음', 'zz']]) {
    a.ui.custMselSearch = cs; a.ui.pnMselSearch = ps; w.renderMselList('cust'); w.renderMselList('pn');
    out['msel:' + cs] = [t('#custMselList label span'), t('#pnMselList .msel-row > span:first-child')];
  }
  return out;
}

// ---------- 옮긴 계산으로 같은 값 만들기 ----------
function fromPort(p) {
  const a = p.api, out = {};
  load(a);
  for (const [i, [team, hero, n]] of HERO_ALERT_CASES.entries()) {
    a.ui.team = team; a.settings.hero = hero; load(a); withAlerts(a, n);
    const m = a.heroAlertModel();
    const box = !m ? {title: null, items: [], more: null} : {
      title: `🚨 히어로 품목 위험 알람 (${fmt(m.count)}개) — ${m.team}`,
      items: m.items.map(x => `${x.품명} ${x.품번} — 가용재고 ${fmt(x.available)} ≤ 기준 ${fmt(x.heroMin)}`),
      more: m.more ? `외 ${m.more}개` : null,
    };
    out['hero:' + i] = [box, box];
  }
  for (const [team, brands, hero] of OVERVIEW_CASES) {
    a.ui.team = team; a.settings.hero = hero || {}; load(a); setSet(a.ui.brandSelected, brands);
    const m = a.overviewModel();
    out['overview:' + team + brands] = {
      cards: [m.nNow, m.nSoon, m.nOk, m.nRef, m.totalCustomers, m.sold6moTotal].map(fmt),
      circles: m.circles.map(c => `${fmt(c.count)} ${c.label} ${c.pct}%`),
      total: `품목 ${fmt(m.total)}개${m.brands.length ? ' · ' + m.brands.join(', ') : ''}`,
    };
  }
  a.ui.team = 'B2B1팀'; a.settings.hero = {}; load(a); a.ui.brandSelected.clear();

  FORECAST_CASES.forEach((c, i) => {
    setForecast(a, c);
    const m = a.forecastModel();
    const shown = m.list.slice(0, a.ui.forecastPage);
    out['forecast:' + i] = {
      list: canon(m.list), visible: [...a.ui.forecastVisiblePns],
      chips: m.gradeChips.map(([, l, n]) => `${l} ${n}`), brandChips: ['전체', ...m.brands],
      need: m.needItems > 0 ? [fmt(m.needItems), fmt(m.needQty)] : null,
      cs: m.topShort.map(s => s.cust),
      rows: shown.map(x => [x.품번, a.groupOf(x.grade), x.orderQty > 0 ? fmt(x.orderQty) : '-', fmt(x.horizon) + a.forecastNextText(x), fmt(x.available),
        x.incoming ? fmt(x.incoming) : '-', fmt(x.avgQuarterly / 3), ...m.monthly(x).map(v => (v ? fmt(v) : '-'))]),
      more: m.list.length > shown.length ? `더 보기 (${fmt(m.list.length - shown.length)}개 더)` : '',
      details: shown.filter(x => a.ui.forecastExpanded.has(x.품번)).map(x => {
        const dd = a.forecastDetail(x);
        const pat = dd.pattern.map(q => {
          const sel = a.ui.forecastCustomer && q.거래처 === a.ui.forecastCustomer;
          return [q.거래처 + (sel ? ' 선택됨' : ''), fmt(q.주문횟수), fmt(Math.round(q.평균발주수량)), q.평균발주주기 ? Math.round(q.평균발주주기) + '일' : '-', a.patternNextText(q.next), fmt(Math.round(q.분기환산수량))];
        });
        const det = dd.details.map(s => [s.실적일자.toLocaleDateString('ko-KR'), s.거래처, fmt(s.수량)]);
        return [...(pat.length ? [pat, det] : []), ...(dd.incomingRows.length ? [dd.incomingRows.map(r => [r.m, r.d || '날짜 미정', fmt(r.q)])] : [])];
      }),
      wh: shown.filter(x => a.ui.forecastExpanded.has(x.품번)).map(x => {
        const w = a.warehouseRows(x.품번);
        return [[...w.rows.map(r => [r.창고 + (r.picked ? ' 추가됨' : ''), fmt(r.가용재고)]), ...(w.total !== null ? [['합계', fmt(w.total)]] : [])]];
      }),
    };
    if (c.team) { a.ui.team = 'B2B1팀'; load(a); }
  });

  CUSTOMER_CASES.forEach(([cust, search], i) => {
    setSet(a.ui.custSelected, cust); a.ui.customerPnSearch = search; a.ui.customerPage = i === 2 ? 3 : 50;
    const m = a.customerTableModel();
    const shown = m.rows.slice(0, a.ui.customerPage);
    const q = r => m.quarterCols.map(c => (r.quarters.get(c) ? fmt(r.quarters.get(c)) : '-'));
    const rows = shown.map((r, k) => {
      const first = !m.groupByCust || k === 0 || shown[k - 1].품번 !== r.품번;
      const head = first ? [r.품번, r.brand || '', r.품명, fmt(r.available)] : [];
      return [...head, ...(m.groupByCust ? [r.거래처] : []), ...q(r), fmt(r.total)];
    });
    out['customer:' + i] = {
      head: !m.rows.length ? [] : ['품번', '브랜드', '품명', ...(m.groupByCust ? ['거래처'] : []), '가용재고', ...m.quarterCols.map(a.shortQuarter), '합계'],
      rows: m.rows.length ? rows : [], more: m.rows.length > shown.length ? `더 보기 (${fmt(m.rows.length - shown.length)}개 더)` : '',
    };
  });
  a.ui.custSelected.clear(); a.ui.customerPnSearch = ''; a.ui.customerPage = 50;

  for (const q of ['세럼, mc', 'sb00\n없는', '  ']) {
    a.ui.skuStatusSearch = q;
    a.skuSearchMatches();
    out['skuSearch:' + q] = [...a.ui.skuStatusLastMatches];
  }
  setSet(a.ui.skuStatusSelected, ['SB001', 'MC002']);
  const s = a.skuStatusModel();
  out.skuTable = {
    head: ['거래처', ...s.months.map(mk => a.skuMonthLabel(mk, s.singleYear)), '합계'],
    rows: [...s.rows.map(r => [r.cust, ...r.values.map(fmt), fmt(r.total)]), ['합계', ...s.monthTotals.map(fmt), fmt(s.grandTotal)]],
  };

  for (const [cs, ps] of [['', ''], ['상', 'sb'], ['없음', 'zz']]) {
    a.ui.custMselSearch = cs; a.ui.pnMselSearch = ps;
    out['msel:' + cs] = [a.mselItems('cust').items.map(x => x.label), a.mselItems('pn').items.map(x => x.label)];
  }
  return out;
}

describe('화면 계산 = 운영 화면에 그려진 값', () => {
  let exp, act;
  beforeAll(async () => {
    const o = loadOracle();
    exp = fromOracle(o);
    o.close();
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(NOW);
    act = fromPort(await loadPort());
  });
  afterAll(() => vi.useRealTimers());

  it('비교 대상이 비어 있지 않음', () => {
    expect(exp['customer:2'].rows.length).toBeGreaterThan(0);
    expect(exp.skuTable.rows.length).toBeGreaterThan(2);
  });

  it('히어로 알람 케이스가 비어 있지 않음', () => {
    expect(exp['hero:0'][0].title).toBe(null);
    expect(exp['hero:1'][0].items.length).toBe(1);
    expect(exp['hero:4'][0].items.length).toBe(12);
    expect(exp['hero:4'][0].more).toBe('외 1개');
  });
  it.each(HERO_ALERT_CASES.map((c, i) => [i]))('히어로 알람 #%s', i => {
    const sortItems = v => v.map(b => ({...b, items: b.more ? b.items.length : [...b.items].sort()})); // 줄여서 보이는 경우는 개수만 // 알람 목록 순서는 새 정렬(부족 수량 순)이라 내용만 비교
    expect(sortItems(act['hero:' + i])).toEqual(sortItems(exp['hero:' + i]));
  });
  it('전체 개요', () => {
    // 위험 · 주의 · 여유 · 참고 개수와 신호등은 새 판정 방식이라 비교하지 않음 (forecast.target.test.js). 총 품목 · 거래처 · 6개월 판매는 그대로 같아야 함
    const keep = v => ({total: v.total, rest: v.cards.slice(4)});
    for (const k of Object.keys(exp).filter(k => k.startsWith('overview'))) expect(keep(act[k])).toEqual(keep(exp[k]));
  });
  it.each(CUSTOMER_CASES.map((c, i) => [i, JSON.stringify(c)]))('판매 현황(거래처별) #%s %s', i => {
    expect(act['customer:' + i]).toEqual(exp['customer:' + i]);
  });
  it('판매 현황(품목별) 검색 · 표', () => {
    for (const k of Object.keys(exp).filter(k => k.startsWith('skuSearch'))) expect(act[k]).toEqual(exp[k]);
    expect(act.skuTable).toEqual(exp.skuTable);
  });
  it('거래처 · 품번 다중 선택 목록', () => {
    for (const k of Object.keys(exp).filter(k => k.startsWith('msel'))) expect(act[k]).toEqual(exp[k]);
  });
});

describe('기준 설정 · 히어로 입력 검사 = 운영 화면 버튼 동작', () => {
  const RULE_CASES = []; // 기준 설정이 '위험 기준(%)' 하나로 바뀌어 운영과 비교하지 않음
  const HERO_CASES = [['MT002', 100, 100], ['mt002', 100, 0], ['MT002', 100, 50], ['MT002', 0, 0], ['없는품번', 10, 20], ['SB001', 500, 900]];

  it('운영과 같은 값을 통과/거부', async () => {
    const o = loadOracle(), {api: a, w} = o, d = w.document;
    load(a); w.renderAll(); w.renderForecastRules(true);
    const p = await loadPort();
    load(p.api);
    const ids = {leadDays: 'ruleLead', urgentDays: 'ruleUrgent', cautionExtra: 'ruleCautionExtra', safeExtra: 'ruleSafeExtra', minOrders: 'ruleMinOrders', dormantMonths: 'ruleDormant'};
    for (const r of RULE_CASES) {
      a.settings.rules = {}; w.renderForecastRules(true);
      for (const [k, id] of Object.entries(ids)) d.getElementById(id).value = String(r[k]);
      d.querySelector('[data-action="rules-save"]').click();
      await new Promise(res => setTimeout(res, 0));
      const saved = JSON.stringify(a.settings.rules) === JSON.stringify(r);
      expect(p.api.rulesValid(r)).toBe(saved);
      if (!saved) expect(d.getElementById('rulesMsg').textContent).toBe(p.api.RULES_INVALID_MSG);
    }
    a.settings.rules = {};
    for (const [pn, min, warn] of HERO_CASES) {
      a.settings.hero = {}; w.renderForecastRules(true);
      d.getElementById('heroPn').value = pn; d.getElementById('heroMin').value = String(min); d.getElementById('heroWarn').value = String(warn);
      d.querySelector('[data-action="hero-add"]').click();
      await new Promise(res => setTimeout(res, 0));
      const got = p.api.heroInput(pn, min, warn);
      if (got.error) expect(d.getElementById('heroMsg').textContent).toBe(got.error);
      else expect(canon(a.settings.hero)).toEqual(canon({[got.pn]: got.val}));
    }
    o.close();
  });
});

describe('업로드 처리 = 운영 업로드 동작', () => {
  const csv = rows => Papa.unparse(rows);
  const FILES = [
    ['가용재고.csv', sh.inventory], ['제품일정표.csv', sh.schedule], ['판매실적.csv', sh.sales1], ['판매실적_B2B2팀.csv', sh.sales2],
    ['유통기한.csv', sh.expiry], ['상품마스터.csv', sh.productMaster], ['메모.csv', [['아무', '내용']]], ['그림.png', [['x']]],
  ];
  async function run(api, W, steps, msgOf) {
    const res = [];
    for (const names of steps) {
      api.unresolvedFiles.length = 0;
      await api.handleFiles(FILES.filter(([n]) => names.includes(n)).map(([n, rows]) => new W.File([csv(rows)], n, {type: 'text/csv'})));
      const listed = canon(api.unresolvedFiles.map(f => ({...f})));
      const r = api.applyUploadedData('upload');
      res.push({listed, msg: msgOf(r), error: api.state.error, forecast: canon(api.state.forecast), salesTeams: Object.keys(api.state.salesByTeam), loaded: api.state.loaded});
    }
    return res;
  }
  const STEPS = [['가용재고.csv'], ['가용재고.csv', '제품일정표.csv', '판매실적.csv', '판매실적_B2B2팀.csv', '유통기한.csv', '상품마스터.csv', '메모.csv', '그림.png'], ['유통기한.csv']];

  it('파일 읽기 · 시트 인식 · 적용 결과가 같음', async () => {
    const o = loadOracle();
    // 운영 화면은 성공 문구를 #uploadStatus 에, 실패는 state.error(배너)에 남김
    const exp = await run(o.api, o.w, STEPS, () => o.api.state.error || o.w.document.getElementById('uploadStatus').textContent.trim());
    o.close();

    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(NOW);
    const p = await loadPort();
    const W = new JSDOM('').window;
    globalThis.FileReader = W.FileReader; globalThis.Papa = Papa;
    const act = await run(p.api, W, STEPS, r => (r.error ? r.error : p.api.uploadDoneText(r)).replace('전체 개요를 확인하세요', 'Main을 확인하세요')); // 메뉴 이름만 의도적으로 다름 (views.js uploadDoneText)
    vi.useRealTimers();
    expect(act).toEqual(exp);
    expect(exp[1].loaded).toBe(true);
  });
});

// 새 화면 기능: 운영 화면에는 없어서 운영과 비교하는 대신, 같은 데이터에서 직접 다시 센 값과 비교합니다.
describe('개요 → 발주 현황 연결 · 거래처별 합계 행', () => {
  let a, act;
  beforeAll(async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(NOW);
    a = (await loadPort()).api;
    act = await import('./actions.js'); // loadPort 와 같은 store 를 씀
  });
  afterAll(() => vi.useRealTimers());

  const setCase = ([team, brands, hero]) => {
    a.ui.team = team; a.settings.hero = hero || {}; load(a); setSet(a.ui.brandSelected, brands);
  };

  it.each(OVERVIEW_CASES.map((c, i) => [i, JSON.stringify(c)]))('신호 칸을 누르면 발주 현황에 개요 숫자와 같은 품목 #%s %s', i => {
    setCase(OVERVIEW_CASES[i]);
    const ov = a.overviewModel();
    const want = {위험: ov.nNow, 주의: ov.nSoon, 여유: ov.nOk, 참고: ov.nRef, 조치필요: ov.nNow + ov.nSoon};
    for (const [grade, n] of Object.entries(want)) {
      // 발주 현황에 다른 필터가 걸려 있어도 풀림
      a.ui.forecastShowNoSales = false; a.ui.forecastCustomer = 'A상사'; a.ui.forecastBrand = '마미케어'; a.ui.forecastSearch = 'zz'; setSet(a.ui.forecastPnChips, ['MC']);
      act.openForecastSignal(grade);
      const list = a.forecastModel().list;
      expect([grade, list.length]).toEqual([grade, n]);
      if (grade === '조치필요') expect(list.map(x => x.품번)).toEqual(a.urgentItems().map(x => x.품번)); // 개요 목록과 같은 순서
    }
  });

  it('판매 이력 없는 위험 품목이 있으면 그 품목도 보이게 함', () => {
    setCase(['B2B1팀', [], {SB006: {minQty: 1e9}}]); // SB006: 판매 없이 재고만 있는 품목 → 히어로 기준으로 위험
    const noSales = a.urgentItems().filter(x => x.sold6 === 0);
    expect(noSales.length).toBeGreaterThan(0); // 이 경우를 실제로 확인하는지
    a.ui.forecastShowNoSales = false;
    act.openForecastSignal('위험');
    expect(a.ui.forecastShowNoSales).toBe(true);
    expect(a.forecastModel().list.map(x => x.품번)).toEqual(expect.arrayContaining(noSales.map(x => x.품번)));
  });

  it('판매 수량이 한 달 밀리지 않음: 달마다 다른 수량, 월초 · 월말, 날짜 형식 3가지', () => {
    setCase(['B2B1팀', []]);
    // 2025년 1~12월 (3월은 판매 없음). 매달 1일과 말일에 그 달에만 나오는 수량 → 한 달이라도 밀리면 값이 달라짐
    const p2 = n => String(n).padStart(2, '0');
    const fmts = [(y, m, d) => `${y}-${p2(m)}-${p2(d)}`, (y, m, d) => `${y}.${p2(m)}.${p2(d)}`, (y, m, d) => `${p2(m)}-${p2(d)}-${y}`];
    const rows = [['구분', '실적번호', '실적일자', '부서', '거래처', '품명', '품번', '수량', '원화판매금액계']];
    const want = {}, wantQ = {};
    let n = 0;
    for (let m = 1; m <= 12; m++) {
      if (m === 3) continue;
      for (const [d, qty] of [[1, m * 100 + 1], [new Date(2025, m, 0).getDate(), m * 10]]) {
        rows.push(['판매', 'R' + n, fmts[n % 3](2025, m, d), 'B2B1팀', '시험상사', '시험 품목', 'SB001', String(qty), '0']);
        n++;
        want[`2025-${p2(m)}`] = (want[`2025-${p2(m)}`] || 0) + qty;
        wantQ[`2025 Q${Math.ceil(m / 3)}`] = (wantQ[`2025 Q${Math.ceil(m / 3)}`] || 0) + qty;
      }
    }
    a.state.sales = a.parseSales(rows);
    expect(a.state.sales.length).toBe(22);
    // 품목별 (월): 열 순서 · 머리글 · 값
    setSet(a.ui.skuStatusSelected, ['SB001']);
    const s = a.skuStatusModel();
    expect(Object.fromEntries(s.months.map((mk, i) => [mk, s.rows[0].values[i]]))).toEqual(want);
    expect(s.months.map(mk => a.skuMonthLabel(mk, s.singleYear))).toEqual(Object.keys(want).map(k => `${+k.slice(5)}월`));
    expect(a.periodGaps(s.months)).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]); // 3월 자리에 빠진 기간 1
    // 거래처별 (분기)
    setSet(a.ui.custSelected, []); setSet(a.ui.pnSelected, []); a.ui.customerPnSearch = '';
    expect(Object.fromEntries(a.customerTableModel().rows[0].quarters)).toEqual(wantQ);
  });

  it('빠진 기간 · 진행 중인 기간', () => {
    expect(a.periodGaps(['2025-10', '2026-01', '2026-02', '2026-04'])).toEqual([0, 2, 0, 1]);
    expect(a.periodGaps(['2025-12', '2026-01'])).toEqual([0, 0]); // 해가 바뀌어도 이어짐
    expect(a.periodGaps(['2025 Q3', '2026 Q1', '2026 Q2'])).toEqual([0, 1, 0]);
    expect(a.periodGaps(['2025 Q4', '2026 Q1'])).toEqual([0, 0]);
    // NOW = 테스트 기준 날짜
    const d = new Date(NOW), mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    expect([a.isCurrentPeriod(mk), a.isCurrentPeriod(a.quarterLabel(d)), a.isCurrentPeriod('2025-10'), a.isCurrentPeriod(`${d.getFullYear() - 1} Q${Math.ceil((d.getMonth() + 1) / 3)}`)]).toEqual([true, true, false, false]);
  });

  it.each(CUSTOMER_CASES.map((c, i) => [i, JSON.stringify(c)]))('거래처별 합계 = 판매실적을 직접 더한 값 (중복 없음) #%s %s', i => {
    setCase(['B2B1팀', []]);
    const [custs, search] = CUSTOMER_CASES[i];
    setSet(a.ui.custSelected, custs); a.ui.customerPnSearch = search;
    const m = a.customerTableModel(), t = a.customerTotals(m);
    // 표에 남은 (품번[, 거래처]) 의 판매실적을 처음부터 다시 더함
    const keys = new Set(m.rows.map(r => r.품번 + '|' + (m.groupByCust ? r.거래처 : '')));
    const q = new Map(); let total = 0;
    for (const s of a.state.sales) {
      if (custs.length && !custs.includes(s.거래처)) continue;
      if (!keys.has(s.품번 + '|' + (m.groupByCust ? s.거래처 : ''))) continue;
      const ql = a.quarterLabel(s.실적일자);
      q.set(ql, (q.get(ql) || 0) + s.수량); total += s.수량;
    }
    expect(Object.fromEntries(t.quarters)).toEqual(Object.fromEntries(q));
    expect(t.total).toBe(total);
    expect(t).not.toHaveProperty('available'); // 서로 다른 품목의 가용재고는 더하지 않음
  });
});
