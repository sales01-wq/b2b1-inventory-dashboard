// 상품 그룹(포장 개정 · 고객 전용 SKU) — 1단계: 후보 검토 · 수동 그룹 관리 · 대표 SKU · 재고 호환 설정.
// 이 모듈은 이름 해석 · 자동 그룹 후보 · 묶기 검사(순수 계산)만 담당하고, 그룹을 계산에 반영하는 일은 groupcalc.js 가 합니다 (별도 관리 화면 없음).
// 이름이 비슷하다는 것만으로 그룹을 확정하지 않음: 후보만 만들고, 사람이 승인해야 settings.skuGroups 에 저장됩니다.
import {state, ui, settings} from './store.js';
import {baseBarcode} from './lookup.js';
import {lastSaleInfo, safeNum} from './forecast.js';

/* ---- 이름 해석: 괄호 표기에서 지역 · 고객 전용 표기를 읽고, 그것을 뺀 '핵심 이름' 만들기 ---- */
export const REGION_WORDS = ['북미', '유럽', '글로벌', '미국', '캐나다', '일본', '중국', '아시아', '국내', '내수', '수출', 'global', 'na', 'eu', 'usa', 'us'];
export const CUSTOMER_TAGS = [{key:'TARGET', re:/target|타겟/i}, {key:'TJX', re:/tjx|티제이엑스/i}]; // 고객 전용 SKU 표기 (서로 · 일반 SKU 와 합치지 않음)
const isRegionToken = t => REGION_WORDS.includes(t.trim().toLowerCase());

/** '세트 A (북미/유럽)' → {core:'세트 a', region:['북미','유럽'], customer:[], unknown:[], variant:'general'} */
export function parseSkuName(name){
  const raw = String(name||'');
  const region = [], customer = [], unknown = [];
  let rest = raw.replace(/[(（\[]([^)）\]]*)[)）\]]/g, (_m, inner)=>{
    inner.split(/[\/,·&+]|\s+and\s+/i).map(s=>s.trim()).filter(Boolean).forEach(tok=>{
      const c = CUSTOMER_TAGS.find(t=>t.re.test(tok));
      if(c) customer.push(c.key); else if(isRegionToken(tok)) region.push(tok); else unknown.push(tok);
    });
    return ' ';
  });
  CUSTOMER_TAGS.forEach(t=>{ if(t.re.test(rest)){ if(!customer.includes(t.key)) customer.push(t.key); rest = rest.replace(new RegExp(t.re.source,'ig'),' '); } }); // 괄호 밖 표기
  const title = rest.replace(/\s+/g,' ').trim(); // 표기를 뺀 원래 대소문자 이름 (그룹 이름 기본값)
  const core = title.toLowerCase();
  const cs = [...new Set(customer)];
  const variant = cs.length>1 ? '충돌' : cs.length===1 ? cs[0] : '일반';
  return {core, title, region, customer:cs, unknown:[...new Set(unknown)], variant};
}

const specOf = pn => {
  const m = state.masterByProduct && state.masterByProduct.get(pn); if(!m) return null;
  const v = [m.제품W, m.제품D, m.제품H, m.제품무게g, m.인입수, m.아웃입수].map(safeNum);
  return v.some(n=>n>0) ? v.join('|') : null;
};

/** 품목 하나의 식별 정보 (현재 데이터 기준) */
export function skuInfo(x){
  const p = parseSkuName(x.품명);
  const rows = (state.salesRowsBySku||state.salesRowsByProduct).get(x.품번)||[]; // 그룹 합산 전 개별 SKU 판매 줄
  const c3 = new Date(); c3.setMonth(c3.getMonth()-3);
  const qty3 = rows.reduce((s,r)=> (r.실적일자 instanceof Date && r.실적일자>=c3 && Number(r.수량)>0) ? s+Number(r.수량) : s, 0);
  return {pn:x.품번, name:x.품명, barcode:x.바코드||'', base:baseBarcode(x.바코드||''), brand:x.brand, ...p, spec:specOf(x.품번),
    lastSale:x.lastSale||null, qty3, available:x.available, incoming:x.incoming, hero:!!x.hero, mask:!!x.mask};
}

/** 대표 SKU 자동 제안: 전체 거래처 기준 '최근 판매실적일'이 가장 늦은 SKU. 품번 크기 · 가나다순은 쓰지 않음.
 *  판매 이력이 하나도 없으면 null (자동 지정 안 함), 같은 날짜가 여럿이면 직전 3개월 판매량이 큰 쪽, 그래도 같으면 null (수동 확인) */
export function suggestRep(infos){
  const dated = infos.filter(i=>i.lastSale instanceof Date && !isNaN(i.lastSale));
  if(dated.length===0) return {pn:null, reason:'판매 이력 없음 — 대표 SKU 를 직접 지정하세요'};
  const t = Math.max(...dated.map(i=>i.lastSale.getTime()));
  let top = dated.filter(i=>i.lastSale.getTime()===t);
  if(top.length>1){
    const q = Math.max(...top.map(i=>i.qty3)); const best = top.filter(i=>i.qty3===q);
    if(best.length>1) return {pn:null, tie:best.map(i=>i.pn), reason:'최근 판매실적일이 같고 직전 3개월 판매량도 같음 — 대표 SKU 를 직접 지정하세요'};
    return {pn:best[0].pn, reason:'최근 판매실적일 기준 (같은 날짜라 직전 3개월 판매량이 많은 SKU)'};
  }
  return {pn:top[0].pn, reason:'최근 판매실적일 기준'};
}

/** 묶을 수 있는지 검사: 고객 전용(TARGET · TJX)은 서로 · 일반 SKU 와 섞지 않음, 표기가 충돌하는 SKU 는 거절 */
export function validateMembers(pns){
  const errors = [];
  const byPn = new Map((state.forecastSku||state.forecast).map(x=>[x.품번,x]));
  const infos = [];
  [...new Set(pns)].forEach(pn=>{ const x = byPn.get(pn); if(!x) errors.push(`${pn}: 현재 데이터에 없는 품번입니다.`); else infos.push(skuInfo(x)); });
  if(infos.length<2 && errors.length===0) errors.push('2개 이상의 품번이 필요합니다.');
  const vs = new Set(infos.map(i=>i.variant));
  if(infos.some(i=>i.variant==='충돌')) errors.push('TARGET · TJX 표기가 함께 있는 SKU 는 묶을 수 없습니다: '+infos.filter(i=>i.variant==='충돌').map(i=>i.pn).join(', '));
  if(vs.size>1) errors.push('고객 전용 SKU 는 서로 · 일반 SKU 와 묶을 수 없습니다 ('+[...vs].join(' / ')+'): '+infos.map(i=>`${i.pn}(${i.variant})`).join(', '));
  return {ok:errors.length===0, errors, infos};
}

export const candidateKey = pns => [...pns].sort().join('+');

/** 후보 생성: (핵심 이름, 고객 전용 종류)가 같은 SKU 묶음. 근거(바코드 · 규격)로 강도만 표시하고, 모두 사람이 승인해야 함 */
export function buildCandidates(){
  const taken = new Set(); Object.values(settings.skuGroups||{}).forEach(g=>(g.members||[]).forEach(pn=>taken.add(pn)));
  const rejected = new Set(settings.skuRejected||[]);
  const buckets = new Map(), baseOwners = new Map(); // baseOwners: 바코드(접미사 뺀) → 그 바코드를 쓰는 (종류+핵심 이름) 묶음들
  (state.forecastSku||state.forecast).forEach(x=>{
    const i = skuInfo(x);
    const k = i.variant+'\u0001'+i.core;
    if(i.base){ if(!baseOwners.has(i.base)) baseOwners.set(i.base, new Set()); baseOwners.get(i.base).add(k); }
    if(taken.has(x.품번) || !i.core || i.variant==='충돌') return; // 수동 그룹 멤버 · 이름이 비었거나 표기가 충돌하는 SKU 는 후보에 안 올림
    if(!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  });
  const out = [];
  buckets.forEach((infos,k)=>{
    if(infos.length<2) return;
    const key = candidateKey(infos.map(i=>i.pn)); if(rejected.has(key)) return;
    const bases = new Set(infos.map(i=>i.base).filter(Boolean)), specs = infos.map(i=>i.spec);
    const sameBarcode = bases.size===1 && infos.every(i=>i.base);
    const specKnown = specs.every(Boolean), sameSpec = specKnown && new Set(specs).size===1, specDiffers = specKnown && new Set(specs).size>1;
    const warnings = [];
    if(specDiffers) warnings.push('상품마스터 규격(치수 · 무게 · 입수)이 서로 다름');
    if(infos.some(i=>i.unknown.length)) warnings.push('알 수 없는 괄호 표기: '+[...new Set(infos.flatMap(i=>i.unknown))].join(', '));
    if(infos.some(i=>i.brand!==infos[0].brand)) warnings.push('브랜드가 서로 다름');
    const shared = [...bases].filter(b=>baseOwners.get(b).size>1);
    if(shared.length) warnings.push('같은 바코드('+shared.join(', ')+')를 이름이 다른 상품도 사용 — 상품 정보 충돌');
    const strength = specDiffers || warnings.length ? '확인 필요' : (sameBarcode || sameSpec) ? '근거 있음' : '이름만 일치';
    // 자동 그룹: 같은 핵심 이름 · 같은 고객 전용 종류 + 바코드(또는 마스터 규격)가 일치하고 경고가 전혀 없는 후보만. 그 밖(이름만 · 충돌 · 알 수 없는 표기)은 사람이 검토
    out.push({key, core:infos[0].core, variant:infos[0].variant, infos:infos.sort((a,b)=>a.pn.localeCompare(b.pn)), sameBarcode, sameSpec, specDiffers, warnings, strength, auto:strength==='근거 있음', rep:suggestRep(infos)});
  });
  const rank = {'근거 있음':0, '이름만 일치':1, '확인 필요':2};
  return out.sort((a,b)=>rank[a.strength]-rank[b.strength] || a.core.localeCompare(b.core,'ko'));
}

/** 자동 그룹 정의 {id: 'auto:'+후보키, name, members, auto:true}. 수동 그룹 · 거절한 후보는 이미 제외됨 */
export function autoGroupDefs(){
  return buildCandidates().filter(c=>c.auto).map(c=>({id:'auto:'+c.key, key:c.key, name:(c.infos[0].title||c.core)+(c.variant!=='일반'?` (${c.variant})`:''), members:c.infos.map(i=>i.pn), rep:null, compat:[], auto:true}));
}
