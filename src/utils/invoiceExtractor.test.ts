import { describe, it, expect } from 'vitest';
import { parseNumber, matchToInventory } from './invoiceExtractor';
import type { Medicine } from '../types';

describe('parseNumber', () => {
  it('أرقام عادية', () => {
    expect(parseNumber(14765)).toBe(14765);
    expect(parseNumber('14765')).toBe(14765);
  });

  it('يزيل الفاصلة العليا والفواصل', () => {
    expect(parseNumber("14'765")).toBe(14765);
    expect(parseNumber('14,765')).toBe(14765);
  });

  it('يزيل .00 العشرية', () => {
    expect(parseNumber("14'500.00")).toBe(14500);
  });

  it('null/undefined/نص فارغ = صفر', () => {
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
    expect(parseNumber('غير رقم')).toBe(0);
  });
});

const med = (id: string, nameAr: string, nameEn: string): Medicine => ({
  id,
  nameAr,
  nameEn,
  activeIngredient: '',
  category: '',
  warehouse: '',
  price: 1000,
  availableQuantity: 10,
  status: 'available',
} as Medicine);

describe('matchToInventory', () => {
  const inventory: Medicine[] = [
    med('1', 'بندول', 'Panadol'),
    med('2', 'أوجمنتين', 'Augmentin'),
    med('3', 'ميتفورمين', 'Metformin'),
  ];

  it('تطابق تام بالاسم العربي', () => {
    const { medicine, score } = matchToInventory('بندول', inventory);
    expect(medicine?.id).toBe('1');
    expect(score).toBe(1);
  });

  it('تطابق بالاسم الإنجليزي مع اختلاف حالة الأحرف', () => {
    const { medicine } = matchToInventory('PANADOL', inventory);
    expect(medicine?.id).toBe('1');
  });

  it('تطابق مع همزات مختلفة (أ/ا)', () => {
    const { medicine } = matchToInventory('اوجمنتين', inventory);
    expect(medicine?.id).toBe('2');
  });

  it('تطابق جزئي مع جرعة في الاسم', () => {
    const { medicine } = matchToInventory('Metformin 500mg', inventory);
    expect(medicine?.id).toBe('3');
  });

  it('اسم غير موجود = لا تطابق', () => {
    const { medicine, score } = matchToInventory('دواء غير موجود إطلاقاً', inventory);
    expect(medicine).toBeNull();
    expect(score).toBeLessThan(0.5);
  });

  it('مخزون فارغ = لا تطابق', () => {
    expect(matchToInventory('بندول', []).medicine).toBeNull();
  });
});
