// index.html 에서 그대로 옮긴 공유 설정(등급 기준 · 히어로 · 직접 입력한 박스 정보) 저장 처리입니다. 바꾼 곳은 "port:".
import {state, ui, settings, emit} from '../lib/store.js';
import {num} from '../lib/parse.js';
import {computeDerived} from '../lib/forecast.js';
import {shared, setSharedBar} from './shared.js';
import {READ_ONLY} from '../app/defaults';
import {rulesValid, RULES_INVALID_MSG, heroInput} from '../lib/views.js';

export function canEditSettings(){ return typeof shared==='undefined' || !shared.active || !!(shared.user && shared.user.isUpdater); }

export function localSettingsSave(){ try{ localStorage.setItem('inv_settings_v1', JSON.stringify({rules:settings.rules, hero:settings.hero, box:settings.box})); }catch(_e){} }

export function applyBoxSettings(){
  ui.manualBoxInfo.clear();
  Object.keys(settings.box).forEach(pn=>{ if(settings.box[pn]) ui.manualBoxInfo.set(pn, Object.assign({}, settings.box[pn])); });
}

export function settingsLoadLocal(){
  try{
    const o = JSON.parse(localStorage.getItem('inv_settings_v1')||'null');
    if(o){ settings.rules = o.rules||{}; settings.hero = o.hero||{}; settings.box = o.box||{}; }
  }catch(_e){}
  applyBoxSettings();
}

export function showSettingsError(msg){
  setSharedBar('err', `설정 저장 실패: ${msg}`); // port
}

export async function persistSetting(kind, key, value){
  localSettingsSave();
  if(typeof shared==='undefined' || !shared.active || !shared.token || READ_ONLY) return {ok:true, local:true};
  try{
    const r = await fetch('/api/settings', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+shared.token}, body:JSON.stringify({kind, key, value})});
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || ('서버 오류 '+r.status));
    return {ok:true};
  }catch(e){ showSettingsError(e.message); return {ok:false}; }
}

export async function loadRemoteSettings(){
  if(typeof shared==='undefined' || !shared.active || !shared.token) return;
  try{
    const r = await fetch('/api/settings', {headers:{Authorization:'Bearer '+shared.token}});
    if(!r.ok) return;
    const j = await r.json();
    const rules = {}, hero = {}, box = {};
    (j.items||[]).forEach(it=>{
      if(it.kind==='rules' && it.key==='main') Object.assign(rules, it.value||{});
      else if(it.kind==='hero' && it.value) hero[it.key] = it.value;
      else if(it.kind==='box' && it.value) box[it.key] = it.value;
    });
    const before = JSON.stringify({r:settings.rules, h:settings.hero});
    settings.rules = rules; settings.hero = hero; settings.box = box;
    localSettingsSave(); applyBoxSettings();
    if(state.loaded && before !== JSON.stringify({r:rules, h:hero})){ computeDerived(); emit(); }
    else if(state.loaded){ emit(); } // port: renderAll / renderForecastRules 대신 emit
  }catch(_e){}
}

export const boxSaveTimers = {};

export function setBoxDim(pn, field, value){
  // 입력할 때마다 화면 전체를 다시 그리면 입력칸이 사라졌다 새로 생겨서
  // 스크롤이 튀고 Tab으로 다음 칸 이동도 끊깁니다. 그래서 여기서는 값만 조용히 저장하고
  // 화면은 다시 그리지 않습니다. (PLT 계산, 다운로드 등 다른 동작을 누르는 순간 최신 값이 반영됩니다)
  if(!ui.manualBoxInfo.has(pn)) ui.manualBoxInfo.set(pn, {});
  const v = num(value);
  if(v>0) ui.manualBoxInfo.get(pn)[field] = v; else delete ui.manualBoxInfo.get(pn)[field];
  persistBox(pn);
}

export function persistBox(pn){
  clearTimeout(boxSaveTimers[pn]);
  boxSaveTimers[pn] = setTimeout(()=>{
    const o = ui.manualBoxInfo.get(pn) || {};
    const has = Object.keys(o).length>0;
    if(has) settings.box[pn] = Object.assign({}, o); else delete settings.box[pn];
    persistSetting('box', pn, has ? settings.box[pn] : null);
  }, 700);
}

/* ---------- 기준 설정 · 히어로 품목 버튼 (index.html 4080~4120행, forecastRules 클릭 처리) ----------
   port: 입력칸 값은 인자로 받고, 안내 문구는 반환값으로 돌려줌. 화면 다시 그리기는 emit() */
const RULE_KEYS = ['leadDays','urgentDays','cautionExtra','safeExtra','minOrders','dormantMonths'];
/** inputs: 입력칸 글자 그대로 {leadDays, urgentDays, ...} */
export async function saveRules(inputs){
  if(!canEditSettings()) return {error:null};
  const g = k=>Math.round(Number(inputs[k]));
  const r = Object.fromEntries(RULE_KEYS.map(k=>[k, g(k)]));
  if(!rulesValid(r)) return {error:RULES_INVALID_MSG};
  settings.rules = r;
  await persistSetting('rules','main',r);
  computeDerived(); emit();
  return {ok:'저장되었습니다.'};
}
export async function resetRules(){
  if(!canEditSettings()) return;
  settings.rules = {};
  await persistSetting('rules','main',null);
  computeDerived(); emit();
}
/** 입력칸 글자 그대로 (pnIn, minIn, warnIn) */
export async function addHero(pnIn, minIn, warnIn){
  if(!canEditSettings()) return {error:null};
  const minQty = Math.round(Number(minIn));
  const warnQty = Math.round(Number(warnIn)) || 0;
  const h = heroInput(pnIn.trim(), minQty, warnQty);
  if(h.error) return h;
  settings.hero[h.pn] = h.val;
  await persistSetting('hero', h.pn, h.val);
  ui.rulesOpen = true; computeDerived(); emit();
  return {ok:''};
}
export async function deleteHero(pn){
  if(!canEditSettings()) return;
  delete settings.hero[pn];
  await persistSetting('hero', pn, null);
  ui.rulesOpen = true; computeDerived(); emit();
}
