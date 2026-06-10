import { describe, it, expect } from 'vitest';
import {
  generateDocId,
  deriveStockStatus,
  resolveUnitCost,
  movingAverageCost,
  computeSaleTotals,
  computeProfit,
  DEFAULT_COST_PERCENT,
} from './finance';

describe('generateDocId', () => {
  it('يبدأ بالبادئة المطلوبة', () => {
    expect(generateDocId('INV')).toMatch(/^INV-/);
    expect(generateDocId('EXP')).toMatch(/^EXP-/);
  });

  it('لا يتصادم عبر 10000 توليد متتالٍ', () => {
    const ids = new Set(Array.from({ length: 10000 }, () => generateDocId('INV')));
    expect(ids.size).toBe(10000);
  });
});

describe('deriveStockStatus', () => {
  it('صفر أو أقل = غير متوفر', () => {
    expect(deriveStockStatus(0)).toBe('unavailable');
    expect(deriveStockStatus(-3)).toBe('unavailable');
  });

  it('أقل من 15 = منخفض', () => {
    expect(deriveStockStatus(1)).toBe('low');
    expect(deriveStockStatus(14)).toBe('low');
  });

  it('15 فأكثر = متوفر', () => {
    expect(deriveStockStatus(15)).toBe('available');
    expect(deriveStockStatus(1000)).toBe('available');
  });
});

describe('resolveUnitCost', () => {
  it('يستخدم التكلفة المسجلة إن وُجدت', () => {
    expect(resolveUnitCost(3200, 5000)).toBe(3200);
  });

  it('يقرّب التكلفة المسجلة الكسرية', () => {
    expect(resolveUnitCost(3200.6, 5000)).toBe(3201);
  });

  it('يقدّر من سعر البيع عند غياب التكلفة', () => {
    expect(resolveUnitCost(null, 1000)).toBe(Math.round(1000 * (DEFAULT_COST_PERCENT / 100)));
    expect(resolveUnitCost(undefined, 1000, 60)).toBe(600);
  });

  it('تكلفة صفرية أو سالبة تُعامل كغير مسجلة', () => {
    expect(resolveUnitCost(0, 1000, 50)).toBe(500);
    expect(resolveUnitCost(-5, 1000, 50)).toBe(500);
  });

  it('سعر بيع غير صالح يعطي صفراً بدل NaN', () => {
    expect(resolveUnitCost(null, NaN, 50)).toBe(0);
  });
});

describe('movingAverageCost', () => {
  it('متوسط مرجّح صحيح', () => {
    // 10 وحدات بتكلفة 1000 + 10 وحدات بتكلفة 2000 = متوسط 1500
    expect(movingAverageCost(10, 1000, 10, 2000)).toBe(1500);
  });

  it('مخزون قائم صفر = تكلفة الشراء الجديدة', () => {
    expect(movingAverageCost(0, 0, 5, 1200)).toBe(1200);
  });

  it('كميات صفرية بالكامل = تكلفة الشراء (لا قسمة على صفر)', () => {
    expect(movingAverageCost(0, 1000, 0, 1700)).toBe(1700);
  });

  it('يقرّب الناتج لأقرب دينار صحيح', () => {
    // (1*1000 + 2*1001) / 3 = 1000.666... → 1001
    expect(movingAverageCost(1, 1000, 2, 1001)).toBe(1001);
  });
});

describe('computeSaleTotals', () => {
  const lines = [
    { price: 1000, quantity: 2 },
    { price: 250, quantity: 4 },
  ];

  it('مجموع بلا خصم', () => {
    expect(computeSaleTotals(lines, 0)).toEqual({ subtotal: 3000, discountAmount: 0, total: 3000 });
  });

  it('خصم 10% يُقرَّب ويُطرح', () => {
    expect(computeSaleTotals(lines, 10)).toEqual({ subtotal: 3000, discountAmount: 300, total: 2700 });
  });

  it('خصم كسري يُقرَّب لأقرب دينار', () => {
    // 3000 * 7.5% = 225
    expect(computeSaleTotals(lines, 7.5).discountAmount).toBe(225);
    // 999 * 5% = 49.95 → 50
    expect(computeSaleTotals([{ price: 999, quantity: 1 }], 5).discountAmount).toBe(50);
  });

  it('الخصم لا يتجاوز 100% ولا ينزل تحت 0%', () => {
    expect(computeSaleTotals(lines, 150).total).toBe(0);
    expect(computeSaleTotals(lines, -20)).toEqual({ subtotal: 3000, discountAmount: 0, total: 3000 });
  });

  it('سلة فارغة = أصفار', () => {
    expect(computeSaleTotals([], 25)).toEqual({ subtotal: 0, discountAmount: 0, total: 0 });
  });

  it('قيم غير صالحة تُعامل كصفر بدل NaN', () => {
    expect(computeSaleTotals([{ price: NaN, quantity: 2 }], 0).total).toBe(0);
  });
});

describe('computeProfit', () => {
  it('ربح وهامش صحيحان', () => {
    expect(computeProfit(10000, 7000)).toEqual({ grossProfit: 3000, profitMargin: 30 });
  });

  it('بيع بخسارة يعطي ربحاً وهامشاً سالبين', () => {
    const r = computeProfit(1000, 1500);
    expect(r.grossProfit).toBe(-500);
    expect(r.profitMargin).toBe(-50);
  });

  it('إجمالي صفر = هامش صفر (لا قسمة على صفر)', () => {
    expect(computeProfit(0, 500)).toEqual({ grossProfit: -500, profitMargin: 0 });
  });
});
