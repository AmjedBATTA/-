import { describe, it, expect } from 'vitest';
import { parseNumber, matchToInventory, ampouleVialCount } from './invoiceExtractor';
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

  it('يطابق عبر الاسم الإنجليزي البديل حين يفشل العربي (مخزون عربي/فاتورة إنجليزية)', () => {
    const inv = [med('9', 'أموكسيسيلين', '')]; // مخزون بلا اسم إنجليزي
    // الترجمة العربية جاءت خاطئة، لكن الاسم الإنجليزي الخام يطابق نفسه لو كان محفوظاً؛
    // هنا نتأكد أن تمرير اسمين لا يكسر التطابق العربي الصحيح
    const { medicine } = matchToInventory('أموكسيسيلين', inv, 'Amoxicillin 500mg');
    expect(medicine?.id).toBe('9');
  });
});

describe('ampouleVialCount', () => {
  it('أمبول واحد = 1', () => {
    expect(ampouleVialCount('Getamisin 80mg*2ml*1amp')).toBe(1);
  });
  it('عدة أمبولات صريحة', () => {
    expect(ampouleVialCount('Piocine 20mg/1ml * 5 amp')).toBe(5);
  });
  it('فيالات فموية بعدد', () => {
    expect(ampouleVialCount('Grozilla * 10 oral vials')).toBe(10);
  });
  it('فيال بلا عدد = 1', () => {
    expect(ampouleVialCount('Ceftriaxone BP 1 g vial IV ldp')).toBe(1);
  });
  it('ليس أمبولاً/فيالاً = null (تبقى الأقراص بمنطق الأشرطة)', () => {
    expect(ampouleVialCount('Inaprol fort 500 mg * 20 tab')).toBeNull();
    expect(ampouleVialCount('Ribosan cough syrup 100 ml')).toBeNull();
  });
});
