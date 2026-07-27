import { describe, it, expect } from 'vitest';
import { compareShortagesNewestFirst, splitShortagesByAge } from './shortages';

// لحظة مرجعية ثابتة حتى لا يتغير الاختبار بتغير ساعة الجهاز
const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

const item = (name: string, addedAt: string) => ({ id: name, name, addedAt });

describe('compareShortagesNewestFirst', () => {
  it('يرتب بالأحدث إضافةً أولاً لا أبجدياً', () => {
    const list = [
      item('أموكسيسيلين', daysAgo(3)),
      item('باراسيتامول', daysAgo(0)),
      item('أزيثرومايسين', daysAgo(9)),
    ];
    expect([...list].sort(compareShortagesNewestFirst).map(s => s.name))
      .toEqual(['باراسيتامول', 'أموكسيسيلين', 'أزيثرومايسين']);
  });

  it('ينزل الناقص بلا تاريخ إلى آخر القائمة', () => {
    const list = [item('قديم بلا تاريخ', ''), item('جديد', daysAgo(1))];
    expect([...list].sort(compareShortagesNewestFirst).map(s => s.name))
      .toEqual(['جديد', 'قديم بلا تاريخ']);
  });
});

describe('splitShortagesByAge', () => {
  it('يضع نواقص آخر 5 أيام في الأعلى وما تجاوزها في الأسفل', () => {
    const list = [
      item('اليوم', daysAgo(0)),
      item('قبل يومين', daysAgo(2)),
      item('قبل ستة أيام', daysAgo(6)),
      item('قبل ثلاثين يوماً', daysAgo(30)),
    ];
    const { fresh, stale } = splitShortagesByAge(list, NOW);
    expect(fresh.map(s => s.name)).toEqual(['اليوم', 'قبل يومين']);
    expect(stale.map(s => s.name)).toEqual(['قبل ستة أيام', 'قبل ثلاثين يوماً']);
  });

  it('يُبقي ما عمره أقل من 5 أيام بقليل في الأعلى، وما تجاوزها بقليل في الأسفل', () => {
    const list = [item('٤٫٩ يوم', daysAgo(4.9)), item('٥٫١ يوم', daysAgo(5.1))];
    const { fresh, stale } = splitShortagesByAge(list, NOW);
    expect(fresh.map(s => s.name)).toEqual(['٤٫٩ يوم']);
    expect(stale.map(s => s.name)).toEqual(['٥٫١ يوم']);
  });

  it('يحافظ على ترتيب الأحدث أولاً داخل كل جزء', () => {
    const list = [
      item('أ', daysAgo(1)),
      item('ب', daysAgo(4)),
      item('ج', daysAgo(7)),
      item('د', daysAgo(20)),
    ].sort(compareShortagesNewestFirst);
    const { fresh, stale } = splitShortagesByAge(list, NOW);
    expect(fresh.map(s => s.name)).toEqual(['أ', 'ب']);
    expect(stale.map(s => s.name)).toEqual(['ج', 'د']);
  });

  it('يعد الناقص بلا تاريخ قديماً (سجلات ما قبل حقل التاريخ)', () => {
    const { fresh, stale } = splitShortagesByAge([item('بلا تاريخ', '')], NOW);
    expect(fresh).toEqual([]);
    expect(stale.map(s => s.name)).toEqual(['بلا تاريخ']);
  });

  it('لا ينشئ جزءاً سفلياً عندما تكون كل النواقص حديثة', () => {
    const { fresh, stale } = splitShortagesByAge([item('اليوم', daysAgo(0))], NOW);
    expect(fresh).toHaveLength(1);
    expect(stale).toHaveLength(0);
  });
});
