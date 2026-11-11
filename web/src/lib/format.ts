/**
 * 숫자 표시 도우미 — 기존 index.html 523~526행(nf / fmt / fmtDec)을 그대로 옮긴 것.
 * 계산 결과가 기존과 1원 · 1개 단위까지 같아야 하므로 동작을 바꾸지 않습니다.
 */
const nf = new Intl.NumberFormat('ko-KR');

export const fmt = (n: number | null | undefined): string => nf.format(Math.round(n || 0));

export const fmtDec = (n: number | null | undefined, digits: number): string =>
  nf.format(Math.round((n || 0) * Math.pow(10, digits)) / Math.pow(10, digits));

/** 기존 fmtDays (949행) */
export function fmtDays(d: number | null | undefined): string {
  return d === null || d === undefined ? '—' : d >= 999 ? '999일+' : Math.round(d) + '일';
}
