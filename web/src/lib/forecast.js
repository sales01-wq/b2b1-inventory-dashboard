// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
import {fmt} from './format';
import {state, ui, settings} from './store.js';

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
  return inv.rows.filter(r=>isUsableWarehouse(r.창고)).reduce((s,r)=>s+r.가용재고, 0);
}

export const OVERSTOCK_MULTIPLIER = 2;

export function scopedAvailable(pn, scope){
  const inv = state.invByProduct.get(pn);
  if(!inv) return 0;
  if(scope==='b2b1') return inv.rows.filter(r=>teamOwnTokens().some(t=>String(r.창고||'').includes(t))).reduce((s,r)=>s+r.가용재고,0);
  if(scope==='emp') return inv.rows.filter(r=>String(r.창고||'').includes('EMP')).reduce((s,r)=>s+r.가용재고,0);
  return usableAvailable(inv);
}

export function salesDetailFor(pn){
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth()-6);
  return state.sales.filter(s=>s.품번===pn && s.실적일자>=cutoff).sort((a,b)=>b.실적일자-a.실적일자);
}

export const QUARTER_DAYS = 91.25;

/* ---------------- 등급 기준 / 히어로 기준 / 직접 입력 정보 (설정) ---------------- */
// 리드타임(생산~입고) 기준: 위험하면 leadDays 뒤에 들어온다고 보고, 입고예정까지 더한 재고가 며칠치인지로 판정
export const RULE_DEFAULTS = {leadDays:60, urgentDays:30, cautionExtra:30, safeExtra:60, minOrders:2, dormantMonths:6};

export function ruleThresholds(R){ return {urgent:R.urgentDays, risk:R.leadDays, caution:R.leadDays+R.cautionExtra, watch:R.leadDays+R.safeExtra}; }

export function getRules(){ return Object.assign({}, RULE_DEFAULTS, settings.rules); }

/* 등급 판정: 소진예상일 = (현재 가용재고 + 입고예정) ÷ 일평균 수요(예상 분기수요 ÷ 91.25) */
export function gradeFor(p){
  const R = getRules(), T = ruleThresholds(R);
  const hero = settings.hero[p.pn];
  if(hero && hero.minQty>0){
    // 히어로 품목: 일수 기준 대신 '수량 기준'만 사용
    let grade = '안전';
    if(p.available <= hero.minQty) grade = '위험';
    else if(hero.warnQty>0 && p.available <= hero.warnQty) grade = '주의';
    const daily = p.avgQuarterly>0 ? p.avgQuarterly/QUARTER_DAYS : 0;
    return {grade, ratio: p.avgQuarterly>0 ? (p.available/p.avgQuarterly)*100 : null,
            coverNow: daily>0 ? p.available/daily : null, coverAll: daily>0 ? (p.available+p.incoming)/daily : null, orderGap:null,
            hero:true, heroMin:hero.minQty, heroWarn:hero.warnQty||0};
  }
  if(!(p.avgQuarterly>0)) return {grade:'데이터부족', ratio:null, coverNow:null, coverAll:null, orderGap:null};
  const ratio = (p.available/p.avgQuarterly)*100;
  const daily = p.avgQuarterly/QUARTER_DAYS;
  const coverNow = p.available/daily, coverAll = (p.available+p.incoming)/daily;
  let grade;
  if(coverNow >= T.watch) grade = '안전';
  else if(coverAll >= T.watch) grade = '안전(입고예정)';
  else if(coverAll < T.urgent) grade = '긴급';
  else if(coverAll < T.risk) grade = '위험';
  else if(coverAll < T.caution) grade = '주의';
  else grade = '관찰';
  const alertGrade = (grade==='긴급'||grade==='위험'||grade==='주의'||grade==='관찰');
  if(alertGrade && R.dormantMonths>0 && p.lastSale){
    // 최근 N개월 출고가 없는 품목(단종·옛 품번 등)은 위험 알림에서 제외
    const cut = new Date(); cut.setMonth(cut.getMonth()-R.dormantMonths);
    if(p.lastSale < cut) return {grade:'휴면', ratio, coverNow, coverAll, orderGap:null};
  }
  if(alertGrade && p.orderCount < R.minOrders) grade = '단발성';
  // 발주여유일: 며칠 안에 발주해야 결품을 피하는지 (음수면 이미 늦음)
  return {grade, ratio, coverNow, coverAll, orderGap: coverAll - R.leadDays};
}

export function orderEntry(cust, datesIn, totalQty){
  const dates = datesIn.slice().sort((a,b)=>a-b);
  const n = dates.length;
  const avgQtyPerOrder = totalQty / n;
  let avgCycleDays = null, q;
  if(n>=2){
    const spanDays = (dates[n-1]-dates[0]) / (1000*60*60*24);
    if(spanDays>0){ avgCycleDays = spanDays/(n-1); q = avgQtyPerOrder * (QUARTER_DAYS/avgCycleDays); }
    else q = totalQty * (QUARTER_DAYS/365); // 같은 날 여러 건: 관측 기간(최대 365일) 대비로 환산
  } else q = totalQty * (QUARTER_DAYS/365); // 주문 1건뿐: 과대추정 방지
  return {거래처:cust, 주문횟수:n, 총수량:totalQty, 평균발주수량:avgQtyPerOrder, 평균발주주기:avgCycleDays, 최근발주일:dates[n-1], 분기환산수량:q};
}

export const DAY_MS = 86400000;

export function nextOrderOf(ent){
  if(!(ent.평균발주주기>0)) return null;
  const now = Date.now(), nxt = ent.최근발주일.getTime() + ent.평균발주주기*DAY_MS;
  const overdue = (now - nxt)/DAY_MS;
  if(overdue > Math.max(ent.평균발주주기, 45)) return null; // 거래 중단으로 판단
  return {date:new Date(Math.max(nxt, now)), qty:ent.평균발주수량, overdue:overdue>0, lateDays:Math.max(0, Math.round(overdue))};
}

export function windowDemand(ent, W){
  if(!(ent.평균발주주기>0)) return ent.총수량 * W / 365;
  const n = nextOrderOf(ent); if(!n) return 0;
  const end = Date.now() + W*DAY_MS, step = ent.평균발주주기*DAY_MS;
  let t = n.date.getTime(), cnt = 0;
  while(t <= end && cnt < 400){ cnt++; t += step; }
  return cnt * ent.평균발주수량;
}

export function computeOrderPattern(pn){
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear()-1); // 최근 12개월 기준
  const rows = (state.salesRowsByProduct.get(pn)||[]).filter(r=>r.실적일자>=cutoff);
  const byCust = new Map(); // 거래처 -> {dates:[], totalQty}
  rows.forEach(r=>{
    if(!byCust.has(r.거래처)) byCust.set(r.거래처, {dates:[], totalQty:0});
    const e = byCust.get(r.거래처);
    e.dates.push(r.실적일자);
    e.totalQty += r.수량;
  });
  let totalQuarterly = 0;
  const result = new Map();
  byCust.forEach((e, cust)=>{
    const ent = orderEntry(cust, e.dates, e.totalQty);
    totalQuarterly += ent.분기환산수량;
    result.set(cust, ent);
  });
  const R = getRules();
  let horizon = 0, lead = 0, next = null;
  result.forEach(e=>{
    horizon += windowDemand(e, QUARTER_DAYS); lead += windowDemand(e, R.leadDays);
    const n = nextOrderOf(e); if(n && (!next || n.date < next.date)) next = {...n, cust:e.거래처};
  });
  return {byCustomer:result, totalQuarterly, horizon, lead, next};
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
  state.sales.forEach(r=>{ r.거래처 = canonCust(r.거래처); });
  // port: 거래처 드롭다운 갱신(DOM) 제거 — React 화면이 state.customers 에서 바로 그림
  // inventory by product
  const invByProduct = new Map();
  state.inventory.forEach(r=>{
    if(!invByProduct.has(r.품번)) invByProduct.set(r.품번,{total:0, rows:[]});
    const e = invByProduct.get(r.품번);
    e.total += r.가용재고; e.rows.push(r);
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
    p.totalAll += r.수량;
    if(!p.품명 && r.품명) p.품명 = r.품명;
    if(r.실적일자 >= cutoff) p.sum6mo += r.수량;

    if(!salesRowsByProduct.has(r.품번)) salesRowsByProduct.set(r.품번, []);
    salesRowsByProduct.get(r.품번).push(r);

    if(!custQuarterProduct.has(r.거래처)) custQuarterProduct.set(r.거래처, new Map());
    const custMap = custQuarterProduct.get(r.거래처);
    if(!custMap.has(q)) custMap.set(q, new Map());
    const qMap = custMap.get(q);
    if(!qMap.has(r.품번)) qMap.set(r.품번, {품명:r.품명, qty:0});
    qMap.get(r.품번).qty += r.수량;
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
    const sched = schByProduct.get(code);
    const inv = invByProduct.get(code);
    const sinfo = salesByProduct.get(code);
    const 품명 = (sched && sched.품명) || (inv && inv.rows[0] && inv.rows[0].품명) || (sinfo && sinfo.품명) || '';
    const 바코드 = (sched && sched.바코드) || (inv && inv.rows[0] && inv.rows[0].바코드) || '';
    const available = usableAvailable(inv);
    const sold6 = sinfo ? sinfo.sum6mo : 0;
    const pattern = computeOrderPattern(code);
    const avgQuarterly = pattern.totalQuarterly;
    const incoming = sched ? (sched.aug_q + sched.sep_q + sched.oct_q) : 0;
    const orderQty = Math.max(0, Math.round(pattern.horizon - available - incoming));
    const orderCount = Array.from(pattern.byCustomer.values()).reduce((s,e)=>s+e.주문횟수,0);
    const lastSale = Array.from(pattern.byCustomer.values()).reduce((m,e)=>(!m||e.최근발주일>m)?e.최근발주일:m, null);
    const g = gradeFor({pn:code, available, incoming, avgQuarterly, orderCount, lastSale});
    let grade = g.grade, bumped = false;
    if(!g.hero && ['안전','안전(입고예정)','관찰','주의'].includes(grade)){
      const R = getRules(), have = available + incoming, cut = new Date(); cut.setMonth(cut.getMonth()-R.dormantMonths);
      if(orderCount >= R.minOrders && !(R.dormantMonths>0 && lastSale && lastSale<cut)){
        if(pattern.lead > have){ grade='위험'; bumped=true; }          // 리드타임 안에 올 주문을 못 받음
        else if(pattern.horizon > have && grade!=='주의'){ grade='주의'; bumped=true; } // 3개월 안 주문을 못 받음
      }
    }
    forecast.push({품번:code, 품명, 바코드, brand, available, sold6, avgQuarterly, incoming, orderQty, horizon:pattern.horizon, leadDemand:pattern.lead, nextOrder:pattern.next, bumped, ratio:g.ratio, grade,
      coverNow:g.coverNow, coverAll:g.coverAll, orderGap:g.orderGap, orderCount, lastSale, hero:!!g.hero, heroMin:g.heroMin||0, heroWarn:g.heroWarn||0, sched, orderPattern:pattern.byCustomer});
  });
  forecast.sort((a,b)=>{
    const order = {'긴급':0,'위험':1,'주의':2,'관찰':3,'안전(입고예정)':4,'안전':5,'단발성':6,'휴면':7,'데이터부족':8};
    if(order[a.grade]!==order[b.grade]) return order[a.grade]-order[b.grade];
    if(a.hero!==b.hero) return a.hero ? -1 : 1;
    if(order[a.grade]<=3){ // 위험/주의/관찰: 더 빨리 바닥나는 순
      const ca = a.coverAll===null ? 1e9 : a.coverAll, cb = b.coverAll===null ? 1e9 : b.coverAll;
      if(ca!==cb) return ca-cb;
    }
    return (b.sold6)-(a.sold6);
  });
  state.forecast = forecast;
  // 히어로 알람: 설정한 수량 이하로 떨어진 히어로 품목
  state.heroAlerts = forecast.filter(x=>x.hero && x.grade==='위험');
  const fcSet = new Set(forecast.map(x=>x.품번));
  state.heroMissing = Object.keys(settings.hero).filter(pn=>!fcSet.has(pn));
}

/* ---------------- Rendering ---------------- */
/* 화면에는 4단계만 보여줌 (내부 계산 등급은 그대로 유지): 위험 / 주의 / 여유 / 참고 */
export function groupOf(g){
  if(g==='긴급'||g==='위험') return '위험';
  if(g==='주의') return '주의';
  if(g==='관찰'||g==='안전'||g==='안전(입고예정)') return '여유';
  return '참고';
}

// port: 다운로드 대신 {csv, filename} 반환 — 실제 저장은 saveCsv()
export function forecastListCsv(){
  const rows = ui._forecastCsvRows || []; if(!rows.length) return;
  const esc = v => { const t=(v===null||v===undefined)?'':String(v); return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t; };
  const lines=[['구분','품번','품명','월평균 판매','3개월 예상수요','가용재고','입고예정','발주할 수량','상태'].join(',')];
  rows.forEach(x=>lines.push([x.brand,x.품번,x.품명,Math.round(x.avgQuarterly/3),Math.round(x.horizon),x.available,x.incoming,x.orderQty,groupOf(x.grade)].map(esc).join(',')));
  return {csv:'\uFEFF'+lines.join('\r\n'), filename:`발주현황_${ui.forecastCustomer||'전체'}_${new Date().toISOString().slice(0,10)}.csv`};
}

// port: 다운로드 대신 {csv, filename} 반환
export function forecastCsv(){
  const selected = state.forecast.filter(x=>ui.forecastSelected.has(x.품번));
  if(selected.length===0) return;
  const headers = ['품번','브랜드','품명','최근6개월 판매','예상 분기수요','현재 가용재고','입고예정(3개월)','추가발주 필요','소진예상일','발주여유일(음수=지연)','등급'];
  const escape = v => {
    const s = (v===null||v===undefined)?'':String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const lines = [headers.join(',')];
  selected.forEach(x=>{
    lines.push([x.품번,x.brand,x.품명,fmt(x.sold6),fmt(x.avgQuarterly),fmt(x.available),fmt(x.incoming),fmt(x.orderQty),x.coverAll===null||x.coverAll===undefined?'':Math.round(x.coverAll),x.orderGap===null||x.orderGap===undefined?'':Math.round(x.orderGap),x.grade].map(escape).join(','));
  });
  const csv = '\uFEFF' + lines.join('\r\n');
  const ts = new Date().toISOString().slice(0,10);
  return {csv, filename:`발주예측_선택품목_${ts}.csv`};
}
