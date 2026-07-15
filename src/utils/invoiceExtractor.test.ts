import { describe, it, expect } from 'vitest';
import { parseNumber, matchToInventory, ampouleVialCount, sanitizeApiKey, normalizeName } from './invoiceExtractor';
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

describe('matchToInventory — دقة الجرعات (عيارات متعددة لنفس الدواء)', () => {
  const inv: Medicine[] = [
    med('a', 'أوجمنتين 625', 'Augmentin 625mg'),
    med('b', 'أوجمنتين 1000', 'Augmentin 1g'),
  ];

  it('يختار العيار الصحيح لا الأول المشابه', () => {
    const { medicine } = matchToInventory('أوجمنتين 1000', inv);
    expect(medicine?.id).toBe('b');
  });

  it('يحوّل 1g إلى 1000 فيتطابق مع عيار 1000', () => {
    const { medicine } = matchToInventory('', inv, 'Augmentin 1g * 14 tab');
    expect(medicine?.id).toBe('b');
  });

  it('عيار غير موجود في المخزون لا يُطابَق بصمت (يظهر كمادة جديدة للمراجعة)', () => {
    const { medicine } = matchToInventory('أوجمنتين 312', inv);
    expect(medicine).toBeNull();
  });
});

describe('matchToInventory — ذاكرة المطابقات المُتعلَّمة', () => {
  const inventory: Medicine[] = [
    med('1', 'بندول', 'Panadol'),
    med('2', 'أوجمنتين', 'Augmentin'),
  ];

  it('اسم سبقت مطابقته يدوياً يُطابَق فوراً من الذاكرة بدرجة 1', () => {
    // «ريفانين» لا يشبه «بندول» نصياً إطلاقاً — الذاكرة وحدها تعرف الربط
    const aliases = { [normalizeName('Revanin 500mg * 20 tab')]: '1' };
    const { medicine, score, byAlias } = matchToInventory('ريفانين', inventory, 'Revanin 500mg * 20 tab', aliases);
    expect(medicine?.id).toBe('1');
    expect(score).toBe(1);
    expect(byAlias).toBe(true);
  });

  it('ذاكرة تشير لدواء محذوف تُتجاهَل ويُعاد للمطابقة النصية', () => {
    const aliases = { [normalizeName('بندول')]: 'deleted-id' };
    const { medicine, byAlias } = matchToInventory('بندول', inventory, undefined, aliases);
    expect(medicine?.id).toBe('1');
    expect(byAlias).toBeUndefined();
  });
});

describe('sanitizeApiKey', () => {
  const K = 'AIzaSyABCDEFGHIJKLMNOPqrstuvwxyz0123456';
  it('يبقي المفتاح السليم كما هو', () => {
    expect(sanitizeApiKey(K)).toBe(K);
  });
  it('يزيل المسافات الطرفية', () => {
    expect(sanitizeApiKey('   ' + K + '  \n')).toBe(K);
  });
  it('يزيل المحارف الخفية (علامة اتجاه/مسافة غير فاصلة/صفري العرض)', () => {
    expect(sanitizeApiKey('‏' + K + ' ​')).toBe(K);
  });
  it('يستخرج التوكن من نص محيط', () => {
    expect(sanitizeApiKey('key: ' + K + ' (copied)')).toBe(K);
  });
  it('يقبل الصيغة الأحدث AQ. (لا يفترض بادئة AIza)', () => {
    const aq = 'AQ.FAKE_test_key_for_unit_tests_only_000000000';
    expect(sanitizeApiKey(aq)).toBe(aq);
    expect(sanitizeApiKey('  ‏' + aq + ' ')).toBe(aq);
  });
  it('نص لا يحوي مفتاحاً = يعيده منظّفاً (يفشل التحقق لاحقاً)', () => {
    expect(sanitizeApiKey('   ')).toBe('');
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
