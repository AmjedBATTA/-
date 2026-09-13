import { describe, it, expect } from 'vitest';
import { fmtNum, fmtDate, fmtDateTime } from './format';

const ARABIC_INDIC = /[٠-٩]/;

describe('fmtNum', () => {
  it('يضع فواصل الآلاف بأرقام لاتينية', () => {
    expect(fmtNum(14000)).toBe('14,000');
    expect(fmtNum(1250000)).toBe('1,250,000');
  });
  it('يحافظ على حتى 3 منازل عشرية افتراضياً كما كان toLocaleString', () => {
    expect(fmtNum(2633.3333)).toBe('2,633.333');
    expect(fmtNum(12.5)).toBe('12.5');
  });
  it('يقبل عدد منازل مخصصاً', () => {
    expect(fmtNum(2633.3333, 0)).toBe('2,633');
    expect(fmtNum(0.1234567, 6)).toBe('0.123457');
  });
  it('يقبل النصوص الرقمية ويعيد صفراً لغير الأرقام', () => {
    expect(fmtNum('9800')).toBe('9,800');
    expect(fmtNum(NaN)).toBe('0');
    expect(fmtNum(undefined)).toBe('0');
    expect(fmtNum(null)).toBe('0');
  });
});

describe('fmtDate / fmtDateTime', () => {
  const d = new Date(2026, 8, 6, 17, 26, 38);
  it('لا يستخدم الأرقام الهندية أبداً', () => {
    expect(fmtDate(d)).not.toMatch(ARABIC_INDIC);
    expect(fmtDateTime(d)).not.toMatch(ARABIC_INDIC);
  });
  it('يحوي السنة والوقت بأرقام لاتينية', () => {
    expect(fmtDate(d)).toContain('2026');
    expect(fmtDateTime(d)).toContain('2026');
    expect(fmtDateTime(d)).toMatch(/5:26/);
  });
});
