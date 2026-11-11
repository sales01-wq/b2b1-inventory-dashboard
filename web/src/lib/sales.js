// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
import {fmt} from './format';
import {state, ui, settings} from './store.js';
import {QUARTER_DAYS, brandOf, brandPasses, getRules, gradeFor, nextOrderOf, orderEntry, quarterLabel, windowDemand} from './forecast.js';

export function productList(){
  if(state._productListCache) return state._productListCache;
  const map = new Map();
  state.salesByProduct.forEach((v,pn)=>{ if(brandOf(pn)) map.set(pn, v.품명||''); });
  state.schByProduct.forEach((v,pn)=>{ if(brandOf(pn) && !map.has(pn)) map.set(pn, v.품명||''); });
  const list = Array.from(map.entries()).map(([pn,name])=>({pn,name})).sort((a,b)=>a.pn.localeCompare(b.pn));
  state._productListCache = list;
  return list;
}

/* ---------------- SKU 판매현황 ---------------- */
export function getAllSalesMonths(){
  const set = new Set();
  state.sales.forEach(r=>{
    const d = r.실적일자;
    set.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  });
  return Array.from(set).sort();
}

export function skuMonthLabel(mkey, singleYear){
  const [y,m] = mkey.split('-');
  return singleYear ? `${parseInt(m,10)}월` : `${y.slice(2)}.${parseInt(m,10)}월`;
}

export function buildSkuStatusData(pns){
  const pnSet = pns instanceof Set ? pns : new Set(pns);
  const months = getAllSalesMonths();
  const years = new Set(months.map(m=>m.split('-')[0]));
  const singleYear = years.size<=1;
  const rows = state.sales.filter(r=>pnSet.has(r.품번));
  const byCust = new Map(); // 거래처 -> Map(month->qty)
  rows.forEach(r=>{
    const d = r.실적일자;
    const mkey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if(!byCust.has(r.거래처)) byCust.set(r.거래처, new Map());
    const m = byCust.get(r.거래처);
    m.set(mkey, (m.get(mkey)||0) + r.수량);
  });
  const custList = Array.from(byCust.keys()).sort((a,b)=>{
    const totalA = Array.from(byCust.get(a).values()).reduce((s,v)=>s+v,0);
    const totalB = Array.from(byCust.get(b).values()).reduce((s,v)=>s+v,0);
    return totalB-totalA; // 많이 산 거래처부터
  });
  return {months, singleYear, byCust, custList};
}

// port: 다운로드 대신 {csv, filename} 반환
export function skuStatusCsv(){
  if(ui.skuStatusSelected.size===0) return;
  const {months, singleYear, byCust, custList} = buildSkuStatusData(ui.skuStatusSelected);
  if(custList.length===0) return;
  const escape = v => {
    const s = (v===null||v===undefined)?'':String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const headers = ['거래처', ...months.map(mk=>skuMonthLabel(mk, singleYear)), '합계'];
  const lines = [`선택 품번: ${Array.from(ui.skuStatusSelected).join(', ')}`];
  lines.push(headers.join(','));
  const monthTotals = months.map(mk => custList.reduce((s,c)=> s + (byCust.get(c).get(mk)||0), 0));
  custList.forEach(c=>{
    const m = byCust.get(c);
    const rowTotal = months.reduce((s,mk)=>s+(m.get(mk)||0),0);
    lines.push([c, ...months.map(mk=>fmt(m.get(mk)||0)), fmt(rowTotal)].map(escape).join(','));
  });
  lines.push(['합계', ...monthTotals.map(v=>fmt(v)), fmt(monthTotals.reduce((s,v)=>s+v,0))].map(escape).join(','));
  const csv = '\uFEFF' + lines.join('\r\n');
  const ts = new Date().toISOString().slice(0,10);
  const first = Array.from(ui.skuStatusSelected)[0].replace(/[^\w\-]/g,'');
  const suffix = ui.skuStatusSelected.size>1 ? `외${ui.skuStatusSelected.size-1}건` : '';
  return {csv, filename:`품목별판매현황_${first}${suffix}_${ts}.csv`};
}

export function buildPivotRows(){
  const groupByCust = ui.custSelected.size > 1;
  const map = new Map(); // key -> {품번, 품명, 거래처?, quarters:Map, total}
  state.sales.forEach(s=>{
    const brand = brandOf(s.품번);
    if(!brand) return; // 운영 종료 품번 삭제
    if(!brandPasses(brand)) return;
    if(ui.custSelected.size>0 && !ui.custSelected.has(s.거래처)) return;
    if(ui.pnSelected.size>0 && !ui.pnSelected.has(s.품번)) return;
    const q = quarterLabel(s.실적일자);
    const key = groupByCust ? (s.품번+'||'+s.거래처) : s.품번;
    if(!map.has(key)) map.set(key, {품번:s.품번, 품명:s.품명, brand, 거래처: groupByCust ? s.거래처 : null, quarters:new Map(), total:0});
    const e = map.get(key);
    if(!e.품명 && s.품명) e.품명 = s.품명;
    e.quarters.set(q, (e.quarters.get(q)||0) + s.수량);
    e.total += s.수량;
  });
  return Array.from(map.values());
}

/* ---------------- 거래처별 부족 현황 ---------------- */
/* 판매처 그룹: 실제 거래처 이름과 다른 '최종 고객/채널'(TJX, 타겟 등)을 거래처명 또는 품명 태그로 묶는다 */
export const CUST_GROUPS = [];

/* 거래처 기준 판정: 그 거래처 수요로 등급 계산 + 평균 1회 주문도 못 받거나 자동 발주점 미만이면 등급 상향 */
export function custAdjust(x, cd){
  const custQ = cd.분기환산수량;
  const g = gradeFor({pn:'', available:x.available, incoming:x.incoming, avgQuarterly:custQ, orderCount:cd.주문횟수, lastSale:cd.최근발주일});
  const R = getRules(), have = x.available + x.incoming;
  const horizon = windowDemand(cd, QUARTER_DAYS), lead = windowDemand(cd, R.leadDays);
  let grade = g.grade, bumped = false;
  const cut = new Date(); cut.setMonth(cut.getMonth()-R.dormantMonths);
  const dormant = R.dormantMonths>0 && cd.최근발주일 < cut;
  if(cd.주문횟수 >= R.minOrders && !dormant && ['안전','안전(입고예정)','관찰','주의'].includes(grade)){
    if(lead > have){ grade='위험'; bumped=true; }
    else if(horizon > have && grade!=='주의'){ grade='주의'; bumped=true; }
  }
  return {grade, bumped, horizon, lead, short:Math.max(0, Math.round(horizon-have)), next:nextOrderOf(cd), coverAll:g.coverAll, orderGap:g.orderGap, ratio:g.ratio, coverNow:g.coverNow};
}

export function buildCustShort(){
  // 거래처(및 그룹) -> 품목 목록 (그 수요 기준으로 등급 재계산, 히어로 수량기준은 제외하고 수요 기준으로만 판정)
  const by = new Map();
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear()-1);
  const push = (key, x, cd)=>{
    const a = custAdjust(x, cd);
    if(!by.has(key)) by.set(key, []);
    by.get(key).push({품번:x.품번, 품명:x.품명, brand:x.brand, hero:x.hero, cd, custQ:cd.분기환산수량, available:x.available, incoming:x.incoming,
      short:a.short, shortTotal:x.orderQty, bumped:a.bumped, horizon:a.horizon, grade:a.grade, coverAll:a.coverAll, orderGap:a.orderGap});
  };
  (state.forecast||[]).forEach(x=>{
    if(!brandPasses(x.brand) || !x.orderPattern) return;
    x.orderPattern.forEach((cd, cust)=>{ if(cust) push(cust, x, cd); });
    // 그룹: 이 품번의 최근 12개월 판매행 중 그룹 조건에 맞는 것만 모아 하나의 수요로 계산
    const rows = (state.salesRowsByProduct.get(x.품번)||[]).filter(r=>r.실적일자>=cutoff);
    CUST_GROUPS.forEach(gp=>{
      const m = rows.filter(r=> (gp.cust && gp.cust.test(r.거래처||'')) || (gp.nameTag && gp.nameTag.test(r.품명||'')));
      if(m.length) push(gp.name, x, orderEntry(gp.name, m.map(r=>r.실적일자), m.reduce((s,r)=>s+r.수량,0)));
    });
  });
  const order = {'긴급':0,'위험':1,'주의':2,'관찰':3,'안전(입고예정)':4,'안전':5,'단발성':6,'휴면':7,'데이터부족':8};
  by.forEach(list=> list.sort((a,b)=>{
    if(order[a.grade]!==order[b.grade]) return order[a.grade]-order[b.grade];
    if(order[a.grade]<=3){ const ca=a.coverAll===null?1e9:a.coverAll, cb=b.coverAll===null?1e9:b.coverAll; if(ca!==cb) return ca-cb; }
    return b.custQ-a.custQ;
  }));
  return by;
}

export let _csMemo=null;

export function custShortSummaryCached(){
  const sig=[state.forecast,[...ui.brandSelected].join(),JSON.stringify(settings.rules),ui.team].map(v=>v&&typeof v==='object'&&!Array.isArray(v)?v:String(v));
  if(_csMemo && _csMemo.sig.length===sig.length && _csMemo.sig.every((v,i)=>v===sig[i])) return _csMemo.val;
  const val=custShortSummary(buildCustShort()); _csMemo={sig,val}; return val;
}

export function custShortSummary(by){
  const out = [];
  by.forEach((list, cust)=>{
    const live = list.filter(r=>r.grade!=='휴면' && r.grade!=='단발성' && r.grade!=='데이터부족');
    const s = {cust, items:live.length, shortItems:0, urgent:0, danger:0, caution:0, watch:0, shortQty:0, totalQty:0, last:null};
    list.forEach(r=>{ s.totalQty += r.cd.총수량; if(!s.last || r.cd.최근발주일>s.last) s.last = r.cd.최근발주일; });
    live.forEach(r=>{
      if(r.grade==='긴급') s.urgent++; else if(r.grade==='위험') s.danger++; else if(r.grade==='주의') s.caution++; else if(r.grade==='관찰') s.watch++;
      if(r.grade==='긴급'||r.grade==='위험'||r.grade==='주의'){ s.shortQty += r.short; if(r.short>0) s.shortItems++; }
    });
    out.push(s);
  });
  out.sort((a,b)=> b.shortQty-a.shortQty || b.totalQty-a.totalQty);
  return out;
}
