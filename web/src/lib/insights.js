// 새 화면(상품 상세 · 거래처 분석 · 재고 점검 · 발주 목록 · 검색)용 계산. 이미 올라온 데이터(판매실적 · 재고 · 제품일정표 · 유통기한)만 사용합니다.
// 없는 데이터(재고 이력, 원가 · 재고금액, 품목별 리드타임)는 만들어 내지 않습니다.
import {state, ui} from './store.js';
import {brandPasses, brandOf, QUARTER_DAYS} from './forecast.js';
import {emit} from './store.js';
import {num} from './parse.js';

const DAY = 86400000;
const ym = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

/** 최근 n개월(이번 달 포함)의 월별 판매 수량 — 판매가 없는 달은 0 */
export function monthlySales(pn, n=12){
  const now = new Date(), months = [];
  for(let i=n-1;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({key:ym(d), 월:d.getMonth()+1, qty:0}); }
  const idx = new Map(months.map((m,i)=>[m.key,i]));
  state.sales.forEach(s=>{ if(s.품번!==pn) return; const i = idx.get(ym(s.실적일자)); if(i!==undefined) months[i].qty += s.수량; });
  return months;
}

/** 소진 예상일 = 가용재고 ÷ 하루 평균 판매. 판매가 없으면 null */
export function depletionDays(available, avgQuarterly){
  return avgQuarterly>0 ? Math.round(available/(avgQuarterly/QUARTER_DAYS)) : null;
}

export function findForecast(pn){ return state.forecast.find(x=>x.품번===pn) || null; }

export function productDetail(pn){
  const x = findForecast(pn);
  const sched = state.schByProduct.get(pn), inv = state.invByProduct.get(pn);
  const name = (x&&x.품명) || (sched&&sched.품명) || (inv&&inv.rows[0]&&inv.rows[0].품명) || '';
  const months = monthlySales(pn);
  return {
    pn, name, item:x, months, monthTotal: months.reduce((a,m)=>a+m.qty,0),
    depletion: x ? depletionDays(x.available, x.avgQuarterly) : null,
    customers: x ? Array.from(x.byCustomer.entries()).map(([거래처,m])=>({거래처, total:m.reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total).slice(0,8) : [],
  };
}

/** 거래처 분석 (과거 판매 기준): 마지막 주문 · 경과일 · 주문일 수 · 최근 6개월 판매 · 주요 품목. 앞으로의 주문 예측은 하지 않음 */
export function customerAnalysis(){
  const now = new Date(), cut = new Date(now); cut.setMonth(cut.getMonth()-6);
  const by = new Map();
  state.sales.forEach(s=>{
    if(!brandOf(s.품번) || !brandPasses(brandOf(s.품번)) || s.수량<=0) return; // 반품 · 마이너스 조정은 판매 분석에서 제외
    let c = by.get(s.거래처); if(!c){ c = {거래처:s.거래처, days:new Set(), qty6:0, amt6:0, prod:new Map()}; by.set(s.거래처, c); }
    c.days.add(s.실적일자.getTime());
    if(s.실적일자>=cut){ c.qty6 += s.수량; c.amt6 += num(s.금액); c.prod.set(s.품번, (c.prod.get(s.품번)||0)+s.수량); }
  });
  return Array.from(by.values()).map(c=>{
    const last = Math.max(...c.days);
    const top = Array.from(c.prod.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([pn,qty])=>({pn, qty, name:(findForecast(pn)||{}).품명||''}));
    return {거래처:c.거래처, orderDays:c.days.size, lastOrder:new Date(last), daysSince:Math.max(0, Math.round((now.getTime()-last)/DAY)), qty6:c.qty6, amt6:c.amt6, top};
  }).sort((a,b)=>b.qty6-a.qty6 || a.daysSince-b.daysSince);
}

/** 재고 점검: 6개월 무판매 재고, 소진까지 오래 걸리는 재고, 유통기한 임박 LOT */
export function inventoryHealth(expiryDays=180, slowDays=365){
  const f = state.forecast.filter(x=>brandPasses(x.brand));
  const idle = f.filter(x=>x.sold6===0 && x.available>0).sort((a,b)=>b.available-a.available);
  const slow = f.filter(x=>x.sold6>0 && x.avgQuarterly>0 && x.available>0)
    .map(x=>({...x, days:depletionDays(x.available, x.avgQuarterly)})).filter(x=>x.days>slowDays).sort((a,b)=>b.days-a.days);
  const now = Date.now(), limit = now + expiryDays*DAY, names = new Map(f.map(x=>[x.품번,x.품명]));
  const expiring = [];
  state.expiryByProduct.forEach((rows,pn)=>{
    if(!brandOf(pn) || !brandPasses(brandOf(pn))) return;
    rows.forEach(e=>{ if(e.가용재고수량>0 && e.유통기한 && e.유통기한.getTime()<=limit) expiring.push({pn, 품명:names.get(pn)||e.품명||'', LOT:e.LOT, 창고:e.창고명, 유통기한:e.유통기한, daysLeft:Math.round((e.유통기한.getTime()-now)/DAY), qty:e.가용재고수량}); });
  });
  expiring.sort((a,b)=>a.daysLeft-b.daysLeft);
  return {idle, slow, expiring, idleQty:idle.reduce((a,x)=>a+x.available,0), slowQty:slow.reduce((a,x)=>a+x.available,0), expiringQty:expiring.reduce((a,x)=>a+x.qty,0)};
}

/** 개요용: 합계 월별 판매 (최근 12개월) */
export function totalMonthlySales(n=12){
  const now = new Date(), months = [];
  for(let i=n-1;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({key:ym(d), 월:d.getMonth()+1, qty:0}); }
  const idx = new Map(months.map((m,i)=>[m.key,i]));
  state.sales.forEach(s=>{ if(!brandOf(s.품번)||!brandPasses(brandOf(s.품번))) return; const i = idx.get(ym(s.실적일자)); if(i!==undefined) months[i].qty += s.수량; });
  return months;
}

/** 전체 검색: 품번 · 품명 · 바코드 (제품일정표 · 재고 기준 품목) */
export function searchProducts(q, limit=30){
  const s = q.trim().toLowerCase(); if(!s) return [];
  return state.forecast.filter(x=>x.품번.toLowerCase().includes(s) || x.품명.toLowerCase().includes(s) || (x.바코드||'').toLowerCase().includes(s)).slice(0,limit);
}

/* ---------------- 상세 패널 · 발주 목록 (저장: 이 브라우저) ---------------- */
ui.detailPn = '';
export function openDetail(pn){ ui.detailPn = pn; emit(); }
export function closeDetail(){ ui.detailPn = ''; emit(); }

const KEY = 'inv_order_list';
function loadCart(){ try{ return new Map(JSON.parse(localStorage.getItem(KEY)||'[]')); }catch(_e){ return new Map(); } }
ui.cart = loadCart(); // 품번 -> 발주 수량
function saveCart(){ try{ localStorage.setItem(KEY, JSON.stringify(Array.from(ui.cart.entries()))); }catch(_e){} emit(); }
export function addToCart(pn, qty){ const x = findForecast(pn); ui.cart.set(pn, Math.max(1, Math.round(qty!==undefined ? qty : (x&&x.orderQty)||1))); saveCart(); }
/** 이미 담긴 품목은 수량을 그대로 두고 건너뜀. {added, existing} 반환 */
export function addManyToCart(pns){ let added=0, existing=0; new Set(pns).forEach(pn=>{ if(ui.cart.has(pn)){ existing++; return; } const x = findForecast(pn); ui.cart.set(pn, Math.max(1, Math.round((x&&x.orderQty)||1))); added++; }); saveCart(); return {added, existing}; }
export function setCartQty(pn, qty){ const v = Math.round(num(qty)); if(v>0) ui.cart.set(pn, v); else ui.cart.delete(pn); saveCart(); }
export function removeFromCart(pn){ ui.cart.delete(pn); saveCart(); }
export function clearCart(){ ui.cart.clear(); saveCart(); }
export function cartRows(){
  return Array.from(ui.cart.entries()).map(([pn,qty])=>{ const x = findForecast(pn); return {pn, qty, name:x?x.품명:'', barcode:x?x.바코드:'', brand:x?x.brand:'', available:x?x.available:0, incoming:x?x.incoming:0, suggested:x?x.orderQty:0}; });
}
export function cartCsv(){
  const esc = v => { const t = v==null?'':String(v); return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t; };
  const rows = cartRows();
  const lines = [['품번','품명','바코드','구분','가용재고','입고예정','추천 발주수량','발주수량'].join(',')];
  rows.forEach(r=>lines.push([r.pn,r.name,r.barcode,r.brand,r.available,r.incoming,r.suggested,r.qty].map(esc).join(',')));
  return {csv:'﻿'+lines.join('\r\n'), filename:`발주목록_${new Date().toISOString().slice(0,10)}.csv`};
}
/** 조회 화면으로: 이 품번 + 발주 수량으로 바코드 조회를 실행 */
export function lookupFor(pn, qty){
  ui.lookupBarcodeText = qty>0 ? `${pn} ${qty}` : pn; ui.lookupNameText = '';
  return ui.lookupBarcodeText;
}

/* ---------------- 저장된 보기 (발주 현황 필터) ---------------- */
const VKEY = 'inv_saved_views';
export function savedViews(){ try{ return JSON.parse(localStorage.getItem(VKEY)||'[]'); }catch(_e){ return []; } }
function putViews(v){ try{ localStorage.setItem(VKEY, JSON.stringify(v)); }catch(_e){} emit(); }
export function saveView(name){
  const n = name.trim(); if(!n) return;
  const v = savedViews().filter(x=>x.name!==n);
  v.push({name:n, grade:ui.forecastGrade, brand:ui.forecastBrand, customers:[...ui.forecastCustomers], search:ui.forecastSearch, noSales:ui.forecastShowNoSales});
  putViews(v);
}
export function deleteView(name){ putViews(savedViews().filter(x=>x.name!==name)); }
export function applyView(name){
  const v = savedViews().find(x=>x.name===name); if(!v) return;
  Object.assign(ui, {forecastGrade:v.grade, forecastBrand:v.brand, forecastCustomers:new Set(v.customers||(v.customer?[v.customer]:[])), forecastSearch:v.search, forecastShowNoSales:v.noSales, forecastPage:50}); ui.forecastPnChips.clear(); emit();
}
