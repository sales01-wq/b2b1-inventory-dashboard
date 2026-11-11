import {describe, expect, it} from 'vitest';
import {fmt, fmtDays, fmtDec} from './format';

describe('format (기존 index.html 과 동일 동작)', () => {
  it('fmt: 반올림 후 천 단위 구분', () => {
    expect(fmt(1234567.6)).toBe('1,234,568');
    expect(fmt(null)).toBe('0');
    expect(fmt(undefined)).toBe('0');
  });
  it('fmtDec: 지정 자릿수 반올림', () => {
    expect(fmtDec(1.255, 1)).toBe('1.3');
    expect(fmtDec(1000.04, 1)).toBe('1,000');
  });
  it('fmtDays: null 은 —, 999 이상은 999일+', () => {
    expect(fmtDays(null)).toBe('—');
    expect(fmtDays(999)).toBe('999일+');
    expect(fmtDays(12.4)).toBe('12일');
  });
});
