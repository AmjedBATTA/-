import { describe, it, expect } from 'vitest';
import { computeTopSellers } from './topSellers';

const sales = [
  { timestamp: '2026-09-01 10:00', items: [{ medicineId: 'a', name: 'باراسيتامول (Paracetamol)', quantity: 3, price: 1000 }] },
  { timestamp: '2026-09-10 12:30', items: [
    { medicineId: 'a', name: 'باراسيتامول (Paracetamol)', quantity: 2, price: 1000 },
    { medicineId: 'b', name: 'أموكسيسيلين (Amoxicillin)', quantity: 4, price: 2500 },
  ] },
  { timestamp: '2026-10-02 09:00', items: [{ medicineId: 'b', name: 'أموكسيسيلين (Amoxicillin)', quantity: 10, price: 2500 }] },
];

describe('computeTopSellers', () => {
  it('يجمّع الكمية والقيمة وعدد الفواتير ويرتّب بالكمية', () => {
    const rows = computeTopSellers(sales, [], '', '');
    expect(rows.map(r => [r.key, r.qty, r.revenue, r.invoices])).toEqual([
      ['b', 14, 35000, 2],
      ['a', 5, 5000, 2],
    ]);
    expect(rows[1].name).toBe('باراسيتامول');
  });

  it('يلتزم بالمدى الزمني شاملاً الطرفين', () => {
    const rows = computeTopSellers(sales, [], '2026-09-01', '2026-09-10');
    expect(rows.map(r => [r.key, r.qty])).toEqual([['a', 5], ['b', 4]]);
  });

  it('يطرح مرتجعات المدى ويُسقط المادة التي صار صافيها صفراً', () => {
    const returns = [
      { timestamp: '2026-09-11 08:00', items: [{ medicineId: 'b', name: 'أموكسيسيلين (Amoxicillin)', quantity: 4, price: 2500 }] },
      { timestamp: '2026-09-12 08:00', items: [{ medicineId: 'a', name: 'باراسيتامول (Paracetamol)', quantity: 1, price: 1000 }] },
    ];
    const rows = computeTopSellers(sales, returns, '2026-09-01', '2026-09-30');
    expect(rows.map(r => [r.key, r.qty, r.revenue])).toEqual([['a', 4, 4000]]);
  });

  it('يدمج سطور الفواتير القديمة (بلا معرّف) مع المادة عبر الاسم', () => {
    const legacy = [...sales, { timestamp: '2026-09-05 11:00', items: [{ name: 'باراسيتامول (Paracetamol)', quantity: 7, price: 1000 }] }];
    const rows = computeTopSellers(legacy, [], '2026-09-01', '2026-09-30', new Map([['باراسيتامول', 'a']]));
    expect(rows[0]).toMatchObject({ key: 'a', qty: 12, invoices: 3 });
  });
});
