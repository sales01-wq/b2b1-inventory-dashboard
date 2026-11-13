// index.html 에서 그대로 옮긴 계산 로직입니다. 바꾼 곳에는 "port:" 주석을 달았습니다. 결과는 src/lib/legacy.test.js 가 운영 index.html 과 비교합니다.
import {fmt} from './format';
import {state, ui, settings} from './store.js';
import {brandOf, brandPasses, quarterLabel} from './forecast.js';

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
