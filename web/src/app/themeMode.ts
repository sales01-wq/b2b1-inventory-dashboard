import {useSyncExternalStore} from 'react';

export type Mode = 'light' | 'dark' | 'system';
const KEY = 'inv_theme_mode';
const read = (): Mode => { try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'system') return v; } catch { /* 저장소 없음 */ } return 'light'; }; // 승인된 밝은 화면이 기본
let mode: Mode = read();
const subs = new Set<() => void>();
export function setMode(m: Mode) { mode = m; try { localStorage.setItem(KEY, m); } catch { /* 저장소 없음 */ } subs.forEach(f => f()); }
export function useMode(): Mode { return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => mode); }
