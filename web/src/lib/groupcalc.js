// 상품 그룹 계산 (수동 확정 그룹 + 자동 그룹). 후보 · 거절 · 그룹 없는 SKU 는 개별 SKU 계산 그대로입니다.
//  - 판매: 그룹 멤버 전체의 판매 줄을 합쳐서(월별 합계) 목표 재고 · 마지막 판매일 · 미판매 규칙을 계산 (거래처 필터는 합친 줄에 적용)
//  - 재고 · 입고예정: 대표 SKU + 호환 확인한 멤버만, SKU 마다 한 번씩 (자동 그룹은 호환 설정이 없어 대표만)
//  - 대표 SKU(고객별): 수동 지정이 있으면 그것. 없으면 고객마다 그 고객의 '최근 판매실적일'이 가장 늦은 SKU.
//      고객 1곳 선택 → 그 고객의 SKU (판매 이력이 없으면 다른 고객 SKU 를 쓰지 않고 '선택 필요').
//      여러 곳 · 전체 → 해당 고객들의 SKU 가 모두 같을 때만 대표, 다르면 '선택 필요'(임시로 전체 최근 판매 SKU 의 재고를 보여 주되 발주 목록에는 선택 전까지 못 담음)
//  - 한 SKU 는 한 그룹에만: 둘 이상의 확정 그룹에 속한 SKU 가 있으면 관련된 모든 그룹을 적용하지 않고(개별 SKU 계산 유지) 충돌로 알림
import {settings, state} from './store.js';
import {salesProfile, gradeFor, lastSaleInfo, safeNum} from './forecast.js';
import {suggestRep, validateMembers, autoGroupDefs} from './skugroups.js';

const heroOf = pn => (settings.hero[pn] && settings.hero[pn].minQty>0) ? settings.hero[pn] : null;
const NOCUST = '(거래처 없음)';
const validSale = r => { const d=r&&r.실적일자, q=Number(r&&r.수량); return d instanceof Date && !isNaN(d) && q>0 && Number.isFinite(q); };

/** 고객별 대표 SKU 판정 재료: 고객 → {pn(없으면 null=동률), tie, last, bySku:[{pn,last}]} (그 고객의 판매 줄만 사용) */
export function repsByCustomer(present, rowsBySku){
  const c3 = new Date(); c3.setMonth(c3.getMonth()-3);
  const per = new Map(); // cust -> Map(pn -> {last, qty3})
  present.forEach(pn=>(rowsBySku.get(pn)||[]).forEach(r=>{
    if(!validSale(r)) return; const c = r.거래처 || NOCUST;
    if(!per.has(c)) per.set(c, new Map());
    const m = per.get(c); const e = m.get(pn) || {last:null, qty3:0};
    if(!e.last || r.실적일자>e.last) e.last = r.실적일자;
    if(r.실적일자>=c3) e.qty3 += Number(r.수량);
    m.set(pn, e);
  }));
  const out = new Map();
  per.forEach((m,c)=>{
    const list = [...m.entries()].map(([pn,e])=>({pn, ...e}));
    const t = Math.max(...list.map(e=>e.last.getTime()));
    let top = list.filter(e=>e.last.getTime()===t);
    if(top.length>1){ const q = Math.max(...top.map(e=>e.qty3)); top = top.filter(e=>e.qty3===q); } // 같은 날짜면 그 고객의 직전 3개월 판매량
    out.set(c, {pn: top.length===1 ? top[0].pn : null, tie: top.length>1 ? top.map(e=>e.pn) : null, last:new Date(t), bySku:list});
  });
  return out;
}

/** 선택 범위(custs 비어 있으면 전체 고객)의 대표 SKU. {pn|null, basis, manual, pending:{reason, candidates, perCustomer}|null} */
export function resolveRep(def, present, custs, by){
  if(def.rep && present.includes(def.rep)) return {pn:def.rep, basis:'수동 지정 (고객과 무관하게 우선)', manual:true, pending:null};
  const all = !custs || custs.size===0;
  let entries;
  if(!all && custs.size===1){
    const c = [...custs][0]; const e = by.get(c);
    if(!e) return {pn:null, basis:'', manual:false, pending:{reason:`${c} 의 이 그룹 판매 이력이 없어 대표 SKU 를 정할 수 없습니다 — 다른 고객의 SKU 를 대신 쓰지 않으니 직접 선택하세요`, candidates:present, perCustomer:[]}};
    if(!e.pn) return {pn:null, basis:'', manual:false, pending:{reason:`${c} 의 최근 판매실적일이 같고 직전 3개월 판매량도 같은 SKU 가 여럿입니다 — 직접 선택하세요`, candidates:e.tie, perCustomer:[{cust:c, pn:null, last:e.last}]}};
    return {pn:e.pn, basis:`${c} 의 최근 판매실적일 기준`, manual:false, pending:null};
  }
  const scope = all ? [...by.entries()] : [...custs].map(c=>[c, by.get(c)]).filter(([,e])=>e);
  let list = scope;
  if(all){ const a = new Date(); const start = new Date(a.getFullYear(), a.getMonth()-11, 1); const act = scope.filter(([,e])=>e.last>=start); if(act.length) list = act; } // 전체: 최근 12개월에 산 고객만 (옛 고객이 모호함을 만들지 않게)
  const per = list.map(([cust,e])=>({cust, pn:e.pn, last:e.last})).sort((a,b)=>b.last-a.last);
  if(per.length===0) return {pn:null, basis:'', manual:false, pending:{reason:'이 범위에 판매 이력이 없어 대표 SKU 를 정할 수 없습니다 — 직접 선택하세요', candidates:present, perCustomer:[]}};
  const ties = per.filter(p=>!p.pn);
  const distinct = [...new Set(per.filter(p=>p.pn).map(p=>p.pn))];
  if(ties.length || distinct.length!==1) return {pn:null, basis:'', manual:false, pending:{reason:`고객마다 최근에 판 SKU 가 달라 하나로 정할 수 없습니다 — 발주 목록에 담기 전에 SKU 를 선택하세요`, candidates:distinct.length?distinct:present, perCustomer:per.slice(0,8)}};
  return {pn:distinct[0], basis: all ? '전체 고객이 모두 같은 SKU 를 가장 최근에 판매' : '선택한 고객 모두 같은 SKU 를 가장 최근에 판매', manual:false, pending:null};
}

/** 그룹 항목 한 개를 만든다. custs: 선택 거래처(비어 있으면 전체), forceRep: 사용자가 발주 SKU 를 직접 고른 경우 */
export function buildGroupItem(def, id, present, byPn, rowsBySku, custs, forceRep){
  const scoped = !!(custs && custs.size);
  const allRows = present.flatMap(pn=>rowsBySku.get(pn)||[]); // 판매 줄은 한 SKU 에만 속하므로 겹치지 않음
  const rows = scoped ? allRows.filter(r=>custs.has(r.거래처)) : allRows;
  const by = repsByCustomer(present, rowsBySku);
  const res = forceRep && present.includes(forceRep) ? {pn:forceRep, basis:'발주 SKU 를 직접 선택', manual:true, pending:null} : resolveRep(def, present, custs, by);
  const tentative = res.pn || suggestRep(present.map(pn=>({pn, lastSale:byPn.get(pn).lastSale, qty3:0}))).pn || present[0]; // 임시: 전체 기준 최근 판매 SKU (선택 필요 상태에서 재고 계산용)
  const rep = tentative, R = byPn.get(rep);
  const compat = new Set((def.compat||[]).filter(pn=>present.includes(pn) && pn!==rep));
  const stockPns = [rep, ...compat]; // 재고 · 입고예정에 넣는 SKU (각각 한 번)
  const prof = salesProfile(rows), act = lastSaleInfo(rows);
  const sum = k => stockPns.reduce((s,pn)=>s+safeNum(byPn.get(pn)[k]), 0);
  const available = sum('available'), incoming = sum('incoming'), incomingExcluded = sum('incomingExcluded');
  const heroCfg = heroOf(rep) || present.map(heroOf).filter(Boolean).sort((a,b)=>b.minQty-a.minQty)[0] || null; // 히어로는 그룹 단위
  const discontinued = !!(R.discontinued && !heroCfg);
  const gr = discontinued || act.reason ? {grade:'데이터부족', ratio:null} : gradeFor({pn:rep, heroCfg, available, incoming, target:prof.target});
  const cut6 = new Date(); cut6.setMonth(cut6.getMonth()-6);
  const sold6 = rows.reduce((s,r)=> r.실적일자>=cut6 ? s+safeNum(r.수량) : s, 0);
  const members = present.map(pn=>{ const x = byPn.get(pn); return {pn, name:x.품명, lastSale:x.lastSale||null, available:x.available, incoming:x.incoming, compat:compat.has(pn), isRep:pn===rep}; });
  return {...R, key:'group:'+id, scoped, group:{id, name:def.name||'', auto:!!def.auto, rep, repManual:!!res.manual, repBasis:res.basis, pending:res.pending, compat:[...compat], members, missing:(def.members||[]).filter(pn=>!present.includes(pn))},
    memberPns:present, available, incoming, incomingExcluded, sold6, discontinued, lastSale:act.last, inactiveReason:act.reason, target:prof.target,
    orderQty: discontinued ? 0 : Math.max(0, prof.target - available - incoming), ratio:gr.ratio, grade:gr.grade,
    avgQuarterly:prof.total12/4, monthTotals:prof.totals, profileMonths:prof.months, returns:prof.returns, spike:prof.spike, peak:prof.peak, byCustomer:prof.byCust,
    hero:present.some(pn=>byPn.get(pn).hero), mask:present.some(pn=>byPn.get(pn).mask), heroCfg, heroMin:heroCfg?heroCfg.minQty:0, heroWarn:heroCfg?(heroCfg.warnQty||0):0};
}

export const groupDef = id => (settings.skuGroups||{})[id] || (state.autoGroupDefs||{})[id] || null;

/** 화면용 항목(그룹)을 현재 선택 거래처 범위로 다시 만든다 (scopeForecastItem 에서 호출). forceRep: 발주 SKU 직접 선택 */
export function rebuildGroupItem(x, custs, forceRep){
  const def = groupDef(x.group.id); if(!def) return x;
  const byPn = new Map((state.forecastSku||[]).map(i=>[i.품번,i]));
  const present = x.memberPns.filter(pn=>byPn.has(pn));
  if(present.length<2) return x;
  return buildGroupItem(def, x.group.id, present, byPn, state.salesRowsBySku, custs, forceRep);
}

/** items: 개별 SKU 항목, rowsBySku: 개별 판매 줄. → {items: 화면용 항목(그룹 = 한 줄), status, conflicts, autoDefs} */
export function applyConfirmedGroups(items, rowsBySku){
  const manual = settings.skuGroups || {}, status = {};
  const autoDefs = Object.fromEntries(autoGroupDefs().map(d=>[d.id, d])); // 근거가 확실한 후보는 승인 없이 자동 그룹 (수동 그룹에 속한 SKU · 거절한 후보는 제외)
  const groups = {...autoDefs, ...manual};
  const byPn = new Map(items.map(x=>[x.품번, x]));
  const replace = new Map(), drop = new Set();
  // 충돌 감지(수동 그룹): SKU → 속한 그룹들. 2개 이상이면 충돌 — 그룹 순서로 해결하지 않음
  const owners = new Map();
  Object.keys(groups).forEach(id=>new Set((groups[id]&&groups[id].members)||[]).forEach(pn=>{ if(!owners.has(pn)) owners.set(pn, []); owners.get(pn).push(id); }));
  const conflicts = [...owners.entries()].filter(([,ids])=>ids.length>1).map(([pn,ids])=>({pn, groups:ids.map(id=>({id, name:(groups[id]&&groups[id].name)||id}))})).sort((a,b)=>a.pn.localeCompare(b.pn));
  const conflicted = new Map();
  conflicts.forEach(c=>c.groups.forEach(g=>{ if(!conflicted.has(g.id)) conflicted.set(g.id, []); conflicted.get(g.id).push(c.pn); }));
  Object.keys(groups).sort().forEach(id=>{
    const g = groups[id] || {};
    if(conflicted.has(id)){ status[id] = {applied:false, conflict:true, reason:`SKU 충돌 — ${conflicted.get(id).join(', ')} 가 여러 그룹에 속해 있어 이 그룹은 적용하지 않고 개별 SKU 로 계산합니다 (그룹 구성을 고쳐 해결하세요)`}; return; }
    const present = (g.members||[]).filter(pn=>byPn.has(pn));
    if(present.length<2){ status[id] = {applied:false, reason:'현재 데이터에 있는 멤버가 2개 미만 — 개별 SKU 로 계산'}; return; }
    const v = validateMembers(present);
    if(!v.ok){ status[id] = {applied:false, reason:'묶을 수 없는 구성 — 개별 SKU 로 계산: '+v.errors[0]}; return; }
    const it = buildGroupItem(g, id, present, byPn, rowsBySku, null);
    replace.set(it.group.rep, it);
    present.forEach(pn=>{ if(pn!==it.group.rep) drop.add(pn); });
    status[id] = {applied:true, rep:it.group.rep, auto:!!g.auto, pending:!!it.group.pending};
  });
  return {items: items.filter(x=>!drop.has(x.품번)).map(x=>replace.get(x.품번)||x), status, conflicts, autoDefs};
}
