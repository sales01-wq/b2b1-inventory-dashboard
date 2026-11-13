// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
import {fmt} from './format';
import {state, ui, settings} from './store.js';
import {parseDateStr} from './parse.js';

/* ---------------- Derived computations ---------------- */
export function quarterLabel(d){ return `${d.getFullYear()} Q${Math.ceil((d.getMonth()+1)/3)}`; }

export const BRAND_MAP = { SB:'성분에디터', MT:'밀크터치', MC:'마미케어' };

export const BRAND_COLORS = { '성분에디터':'#C15B72', '밀크터치':'#6E88A6', '마미케어':'#6F8F5E' };

export function brandOf(pn){
  const p = String(pn||'').trim().toUpperCase();
  if(p.startsWith('SB')) return BRAND_MAP.SB;
  if(p.startsWith('MT')) return BRAND_MAP.MT;
  if(p.startsWith('MC')) return BRAND_MAP.MC;
  return null;
}

export function brandPasses(brand){
  return ui.brandSelected.size===0 || ui.brandSelected.has(brand);
}

export function teamWarehouseTokens(){ return ui.team==='전체' ? ['B2B1팀','B2B2팀','EMP'] : [ui.team,'EMP']; }

export function teamOwnTokens(){ return ui.team==='전체' ? ['B2B1팀','B2B2팀'] : [ui.team]; }

export function teamLabel(){ return ui.team==='전체' ? 'B2B1팀+B2B2팀+EMP' : ui.team+' + EMP'; }

export function isUsableWarehouse(name){
  const n = String(name||'');
  return teamWarehouseTokens().some(t=>n.includes(t));
}

export function salesForTeam(){
  const m = state.salesByTeam || {};
  if(ui.team==='전체') return [].concat(m['B2B1팀']||[], m['B2B2팀']||[]);
  return m[ui.team]||[];
}

export function usableAvailable(inv){
  if(!inv) return 0;
  return inv.rows.filter(r=>isUsableWarehouse(r.창고)).reduce((s,r)=>s+safeNum(r.가용재고), 0);
}

export const OVERSTOCK_MULTIPLIER = 2;

export function scopedAvailable(pn, scope){
  const inv = state.invByProduct.get(pn);
  if(!inv) return 0;
  if(scope==='b2b1') return inv.rows.filter(r=>teamOwnTokens().some(t=>String(r.창고||'').includes(t))).reduce((s,r)=>s+safeNum(r.가용재고),0);
  if(scope==='emp') return inv.rows.filter(r=>String(r.창고||'').includes('EMP')).reduce((s,r)=>s+safeNum(r.가용재고),0);
  return usableAvailable(inv);
}

export function salesDetailFor(pn){
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-6);
  return state.sales.filter(s=>s.품번===pn && s.실적일자>=cutoff).sort((a,b)=>b.실적일자-a.실적일자);
}

export const QUARTER_DAYS = 91.25;

/** 숫자가 아닌 값(빈 칸 · NaN · 문자)은 0 으로 — 운영 데이터 이상값이 합계를 NaN 으로 만들어 화면이 멈추는 것을 막음 */
export const safeNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* ---------------- 부족 수량 · 위험 판정 (목표 재고 방식) ----------------
   목표 재고 = 최근 12개월(이번 달 제외, 달력 기준) 중 '모든 거래처 합계 월 판매량'이 가장 컸던 달의 판매량.
   부족 수량 = max(0, 목표 재고 − 가용재고 − 유효 입고예정).   위험 판정도 같은 숫자(목표 대비 재고 비율)로 함 → 부족이 0 일 때만 '여유'.
   주문 주기 예측은 쓰지 않음. 반품 · 마이너스 조정은 판매와 따로 모으고 목표에 반영하지 않음. */
export const RULE_DEFAULTS = {riskPct:50}; // 위험: (가용+입고예정)이 목표의 riskPct% 미만. 주의: 그 이상 ~ 100% 미만. 여유: 100% 이상
export const SPIKE_RATIO = 2; // 가장 많이 팔린 달이 두 번째로 많이 팔린 달의 2배 이상이면 '대량 판매 확인' 표시 (제외하지 않고 목표에 그대로 반영)

export function getRules(){ return Object.assign({}, RULE_DEFAULTS, settings.rules); }

export const monthKey = d => d.getFullYear()*12 + d.getMonth();
/** 최근 완료된 달력 월 n개 (이번 달 제외), 오래된 달부터 */
export function completedMonths(n=12){
  const now = new Date(), out = [];
  for(let k=n;k>=1;k--){ const d = new Date(now.getFullYear(), now.getMonth()-k, 1); out.push({y:d.getFullYear(), m:d.getMonth(), key:monthKey(d)}); }
  return out;
}

/** 품목의 판매 프로필: 월별 합계 · 거래처별 월 판매 · 목표 재고 · 반품 · 대량 판매 표시 */
export function salesProfile(rows){
  const months = completedMonths(12), idx = new Map(months.map((m,i)=>[m.key,i]));
  const totals = months.map(()=>0), byCust = new Map();
  let returns = 0;
  (rows||[]).forEach(r=>{
    const i = idx.get(monthKey(r.실적일자)); if(i===undefined) return;
    const q = Number(r.수량); if(!Number.isFinite(q)) return; // 숫자가 아닌 수량은 건너뜀
    if(q<0){ returns += -q; return; } // 반품 · 마이너스 조정: 판매와 분리
    if(!(q>0)) return;
    totals[i] += q;
    const cust = r.거래처 || '(거래처 없음)';
    if(!byCust.has(cust)) byCust.set(cust, months.map(()=>0));
    byCust.get(cust)[i] += q;
  });
  const target = Math.max(0, ...totals), peak = totals.indexOf(target);
  const sorted = totals.slice().sort((a,b)=>b-a), second = sorted[1]||0;
  let spike = null, peakInfo = null;
  if(target>0){
    const top = Array.from(byCust.entries()).map(([cust,a])=>({cust, qty:a[peak]})).filter(c=>c.qty>0).sort((a,b)=>b.qty-a.qty).slice(0,5);
    peakInfo = {month:months[peak], qty:target, customers:top}; // 목표 재고가 된 달 (화면에 근거로 표시)
    if(target >= SPIKE_RATIO*second) spike = {month:months[peak], qty:target, second, customers:top.slice(0,3), oneMonth: second===0};
  }
  return {months, totals, byCust, target, returns, spike, peak:peakInfo, total12: totals.reduce((a,b)=>a+b,0)};
}

/** 실제 마지막 판매일(이번 달 포함, 반품 · 마이너스 · 날짜 없음/잘못됨 · 숫자 아닌 수량은 판매로 안 침)과 미판매 사유.
 *  최근 6개월 = 이번 달 + 앞선 5개월 달력 기준. 사유: 판매 이력 없음 / 12개월 이상 미판매 / 6개월 이상 미판매 / 없음(null = 정상 계산) */
export function lastSaleInfo(rows){
  let last = null;
  (rows||[]).forEach(r=>{ const d=r&&r.실적일자, q=Number(r&&r.수량); if(!(d instanceof Date) || isNaN(d) || !(q>0) || !Number.isFinite(q)) return; if(!last || d>last) last = d; });
  const now = new Date(), c6 = new Date(now.getFullYear(), now.getMonth()-5, 1), c12 = new Date(now.getFullYear(), now.getMonth()-11, 1);
  const reason = !last ? '판매 이력 없음' : last<c12 ? '12개월 이상 미판매' : last<c6 ? '6개월 이상 미판매' : null;
  return {last, reason};
}

/** 선택 거래처 기준 재계산 (분석용 추정치): 고른 거래처들의 판매만으로 월별 합계 → 목표 → 부족 · 상태를 다시 계산.
 *  가용재고 · 입고예정은 품목당 한 번 그대로 (거래처에 배분하지 않고, 거래처별 부족을 따로 구해 더하지도 않음). 선택이 없으면 전체 거래처 기준 항목 그대로 */
export function scopeForecastItem(x, custs){
  if(!x || !custs || custs.size===0) return x;
  const rows = (state.salesRowsByProduct.get(x.품번)||[]).filter(r=>custs.has(r.거래처));
  const prof = salesProfile(rows);
  const cut6 = new Date(); cut6.setMonth(cut6.getMonth()-6);
  const sold6 = rows.reduce((s,r)=> r.실적일자>=cut6 ? s+safeNum(r.수량) : s, 0);
  const act = lastSaleInfo(rows); // 선택 거래처 범위의 마지막 판매일
  const g = x.discontinued || act.reason ? {grade:'데이터부족', ratio:null} : gradeFor({pn:x.품번, available:x.available, incoming:x.incoming, target:prof.target});
  return {...x, scoped:true, lastSale:act.last, inactiveReason:act.reason, sold6, target:prof.target, orderQty: x.discontinued ? 0 : Math.max(0, prof.target - x.available - x.incoming),
    ratio:g.ratio, grade:g.grade, avgQuarterly:prof.total12/4, monthTotals:prof.totals, profileMonths:prof.months, returns:prof.returns, spike:prof.spike, peak:prof.peak, byCustomer:prof.byCust};
}

/** 유효 입고예정: 날짜가 이미 지난 입고는 이미 재고에 들어왔거나 불확실하므로 제외 (제외한 수량은 따로 보여 줌) */
export function validIncoming(sched){
  if(!sched) return {valid:0, excluded:0};
  const today = new Date(); today.setHours(0,0,0,0);
  let valid = 0, excluded = 0;
  [['aug_d','aug_q'],['sep_d','sep_q'],['oct_d','oct_q']].forEach(([d,q])=>{
    const qty = safeNum(sched[q]); if(!(qty>0)) return;
    const dt = parseDateStr(sched[d]);
    if(dt && dt<today) excluded += qty; else valid += qty;
  });
  return {valid, excluded};
}

/* 위험 판정: 비율 = (가용 + 유효 입고예정) ÷ 목표 재고. 히어로 품목은 설정한 수량 기준을 그대로 사용 */
export function gradeFor(p){
  const R = getRules();
  const hero = settings.hero[p.pn];
  const ratio = p.target>0 ? ((p.available+p.incoming)/p.target)*100 : null;
  if(hero && hero.minQty>0){
    let grade = '안전';
    if(p.available <= hero.minQty) grade = '위험';
    else if(hero.warnQty>0 && p.available <= hero.warnQty) grade = '주의';
    return {grade, ratio, hero:true, heroMin:hero.minQty, heroWarn:hero.warnQty||0};
  }
  if(!(p.target>0)) return {grade:'데이터부족', ratio:null}; // 최근 12개월 판매 없음 → 참고
  if(ratio>=100) return {grade:'안전', ratio};
  return {grade: ratio < R.riskPct ? '위험' : '주의', ratio};
}

/* 같은 회사의 다른 표기(한글/영문 법인명)를 하나의 거래처로 합침 */
export const CUSTOMER_ALIASES = [
  {name:'UNLOCKT BRANDS INC (언락드브랜드)', match:/UNLOCKT|언락드/i},
];

export function canonCust(n){
  const s = String(n||'');
  for(const a of CUSTOMER_ALIASES){ if(a.match.test(s)) return a.name; }
  return n;
}

export function computeDerived(){
  state._productListCache = null;
  state.sales = state.sales.filter(r=>r && r.실적일자 instanceof Date && !isNaN(r.실적일자)); // 날짜가 없거나 잘못된 판매 줄은 계산에서 제외 (파일 읽기 단계에서 이미 걸러지지만 운영 데이터 이상값 대비)
  state.sales.forEach(r=>{ r.거래처 = canonCust(r.거래처); });
  // port: 거래처 드롭다운 갱신(DOM) 제거 — React 화면이 state.customers 에서 바로 그림
  // inventory by product
  const invByProduct = new Map();
  state.inventory.forEach(r=>{
    if(!invByProduct.has(r.품번)) invByProduct.set(r.품번,{total:0, rows:[]});
    const e = invByProduct.get(r.품번);
    e.total += safeNum(r.가용재고); e.rows.push(r);
  });

  // expiry (LOT) by product
  const expiryByProduct = new Map();
  state.expiry.forEach(r=>{
    if(!expiryByProduct.has(r.품번)) expiryByProduct.set(r.품번, []);
    expiryByProduct.get(r.품번).push(r);
  });
  state.expiryByProduct = expiryByProduct;
  state.invByProduct = invByProduct;

  // product master (박스/중량 상세) by product
  const masterByProduct = new Map();
  state.productMaster.forEach(r=>{ masterByProduct.set(r.품번, r); });
  state.masterByProduct = masterByProduct;

  // schedule by product (also by barcode for lookup)
  const schByProduct = new Map();
  state.schedule.forEach(r=>{ if(!schByProduct.has(r.품번)) schByProduct.set(r.품번, r); });
  state.schByProduct = schByProduct;

  // sales aggregations
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-6);
  const salesByProduct = new Map();
  const salesRowsByProduct = new Map(); // 품번 -> raw sales rows (발주 패턴 분석용)
  const custQuarterProduct = new Map(); // 거래처 -> quarter -> Map(품번 -> {품명,qty})
  const customersSet = new Set();
  const quartersSet = new Set();

  state.sales.forEach(r=>{
    customersSet.add(r.거래처);
    const q = quarterLabel(r.실적일자);
    quartersSet.add(q);

    if(!salesByProduct.has(r.품번)) salesByProduct.set(r.품번,{sum6mo:0, totalAll:0, 품명:r.품명});
    const p = salesByProduct.get(r.품번);
    p.totalAll += safeNum(r.수량);
    if(!p.품명 && r.품명) p.품명 = r.품명;
    if(r.실적일자 >= cutoff) p.sum6mo += safeNum(r.수량);

    if(!salesRowsByProduct.has(r.품번)) salesRowsByProduct.set(r.품번, []);
    salesRowsByProduct.get(r.품번).push(r);

    if(!custQuarterProduct.has(r.거래처)) custQuarterProduct.set(r.거래처, new Map());
    const custMap = custQuarterProduct.get(r.거래처);
    if(!custMap.has(q)) custMap.set(q, new Map());
    const qMap = custMap.get(q);
    if(!qMap.has(r.품번)) qMap.set(r.품번, {품명:r.품명, qty:0});
    qMap.get(r.품번).qty += safeNum(r.수량);
  });
  state.salesByProduct = salesByProduct;
  state.salesRowsByProduct = salesRowsByProduct;
  state.custQuarterProduct = custQuarterProduct;
  state.customers = Array.from(customersSet).filter(Boolean).sort((a,b)=>a.localeCompare(b,'ko'));
  state.quarters = Array.from(quartersSet).sort().reverse();

  // forecast list (union of product codes across all 3 sheets)
  // 운영 종료: SB(성분에디터)/MT(밀크터치)/MC(마미케어) 이외 품번은 완전히 제외
  const codes = new Set([...schByProduct.keys(), ...invByProduct.keys(), ...salesByProduct.keys()]);
  const forecast = [];
  codes.forEach(code=>{
    if(!code) return;
    const brand = brandOf(code);
    if(!brand) return; // 나머지 품번 삭제
    const sched = schByProduct.get(code); // 제품일정표는 품번당 첫 줄만 사용 (거래처마다 줄이 있어도 입고예정을 중복해서 세지 않음)
    const inv = invByProduct.get(code);
    const sinfo = salesByProduct.get(code);
    const 품명 = (sched && sched.품명) || (inv && inv.rows[0] && inv.rows[0].품명) || (sinfo && sinfo.품명) || '';
    const 바코드 = (sched && sched.바코드) || (inv && inv.rows[0] && inv.rows[0].바코드) || '';
    const available = usableAvailable(inv); // 재고는 품목 하나당 한 번만 (거래처별로 나누거나 더하지 않음)
    const sold6 = sinfo ? sinfo.sum6mo : 0;
    const prof = salesProfile(salesRowsByProduct.get(code));
    const inc = validIncoming(sched);
    const target = prof.target, incoming = inc.valid;
    const discontinued = !!(sched && /단종/.test(sched.품목상태||'')) && !(settings.hero[code] && settings.hero[code].minQty>0); // 히어로로 직접 지정한 품목은 예외 // 제품일정표에서 단종 → 발주 대상 아님(참고). 화면에 이유를 표시하고 숨기지 않음
    const isMask = !!(settings.mask && settings.mask[code]); // 마스크 지정은 직접 관리하는 품번 목록 (히어로와 겹칠 수 있음)
    const isHero = !!(settings.hero[code] && settings.hero[code].minQty>0); // 히어로 지정은 미판매여도 유지 (알람 · 상태만 참고로)
    const act = lastSaleInfo(salesRowsByProduct.get(code)); // 실제 마지막 판매일 · 미판매 사유
    const g = discontinued || act.reason ? {grade:'데이터부족', ratio:null} : gradeFor({pn:code, available, incoming, target}); // 미판매 품목은 부족 수량이 있어도 참고 (부족 수량 계산은 그대로 보존)
    const orderQty = discontinued ? 0 : Math.max(0, target - available - incoming);
    forecast.push({품번:code, 품명, 바코드, brand, available, sold6, discontinued, lastSale:act.last, inactiveReason:act.reason, incoming, incomingExcluded:inc.excluded, target, orderQty, ratio:g.ratio, grade:g.grade,
      avgQuarterly:prof.total12/4, monthTotals:prof.totals, profileMonths:prof.months, returns:prof.returns, spike:prof.spike, peak:prof.peak, byCustomer:prof.byCust,
      hero:isHero, mask:isMask, heroMin:isHero?settings.hero[code].minQty:0, heroWarn:isHero?(settings.hero[code].warnQty||0):0, sched});
  });
  forecast.sort((a,b)=>{
    const order = {'위험':0,'주의':1,'안전':2,'데이터부족':3};
    if(order[a.grade]!==order[b.grade]) return order[a.grade]-order[b.grade];
    if(a.hero!==b.hero) return a.hero ? -1 : 1;
    if(a.orderQty!==b.orderQty) return b.orderQty-a.orderQty; // 부족 수량이 큰 순
    return b.sold6-a.sold6;
  });
  state.forecast = forecast;
  // 히어로 알람: 설정한 수량 이하로 떨어진 히어로 품목
  state.heroAlerts = forecast.filter(x=>x.hero && x.grade==='위험');
  const fcSet = new Set(forecast.map(x=>x.품번));
  state.heroMissing = Object.keys(settings.hero).filter(pn=>!fcSet.has(pn));
}

/* ---------------- Rendering ---------------- */
/* 화면에는 4단계만 보여줌 (내부 계산 등급은 그대로 유지): 위험 / 주의 / 여유 / 참고 */
/** 화면에 보이는 상태 이름 (내부 등급 키 '위험' · '주의' 는 계산용이라 그대로) */
export const STATUS_LABEL = {위험:'생산 필요', 주의:'생산 추천', 여유:'여유', 참고:'참고'};
export const statusLabel = g => STATUS_LABEL[groupOf(g)];
export function groupOf(g){
  if(g==='긴급'||g==='위험') return '위험';
  if(g==='주의') return '주의';
  if(g==='관찰'||g==='안전'||g==='안전(입고예정)') return '여유';
  return '참고';
}

const csvEsc = v => { const t=(v===null||v===undefined)?'':String(v); return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t; };
const scopeText = x => x.scoped ? '선택 거래처 기준' : '전체 거래처 기준';
const flagText = x => x.inactiveReason ? x.inactiveReason : x.spike ? (x.spike.oneMonth ? '판매가 한 달뿐' : '대량 판매 확인') : '';
function stockCsv(rows, filename){
  const lines=[['구분','품번','품명','상태','가용재고','입고예정(유효)','목표 재고','부족 수량','확인 필요','기준'].join(',')];
  rows.forEach(x=>lines.push([x.brand,x.품번,x.품명,statusLabel(x.grade),x.available,x.incoming,x.target,x.orderQty,flagText(x),scopeText(x)].map(csvEsc).join(',')));
  return {csv:'\uFEFF'+lines.join('\r\n'), filename};
}
// port: 다운로드 대신 {csv, filename} 반환 — 실제 저장은 saveCsv()
export function forecastListCsv(){
  const rows = ui._forecastCsvRows || []; if(!rows.length) return;
  return stockCsv(rows, `발주현황_${ui.forecastCustomers.size===1?[...ui.forecastCustomers][0]:ui.forecastCustomers.size>1?'거래처'+ui.forecastCustomers.size+'곳':'전체'}_${new Date().toISOString().slice(0,10)}.csv`);
}

// port: 다운로드 대신 {csv, filename} 반환
export function forecastCsv(){
  const selected = state.forecast.filter(x=>ui.forecastSelected.has(x.품번));
  if(selected.length===0) return;
  return stockCsv(selected, `발주현황_선택품목_${new Date().toISOString().slice(0,10)}.csv`);
}
