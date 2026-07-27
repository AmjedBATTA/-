// قواعد قائمة نواقص الأدوية — منطق خالص في ملف مستقل حتى يمكن اختباره
// دون تحميل لوحة التحكم كاملة.

/** عدد الأيام التي بعدها يُعد الناقص «قديماً» فيهبط لأسفل القائمة خلف الخط الفاصل. */
export const SHORTAGE_STALE_DAYS = 5;

/** الأحدث إضافةً أولاً. النواقص بلا تاريخ (سجلات ما قبل حقل التاريخ) تنزل لآخر القائمة. */
export function compareShortagesNewestFirst(
  a: { addedAt: string },
  b: { addedAt: string },
): number {
  return b.addedAt.localeCompare(a.addedAt);
}

/**
 * يقسم النواقص لجزأين: `fresh` ما أُضيف خلال آخر 5 أيام، و`stale` ما تجاوزها
 * دون أن يُشترى (الشراء واعتماد الفاتورة يشطب الصنف من القائمة أصلاً).
 * ترتيب العناصر داخل كل جزء يبقى كما ورد — أي الأحدث أولاً.
 */
export function splitShortagesByAge<T extends { addedAt: string }>(
  items: T[],
  now: number = Date.now(),
  staleDays: number = SHORTAGE_STALE_DAYS,
): { fresh: T[]; stale: T[] } {
  const cutoff = now - staleDays * 24 * 60 * 60 * 1000;
  const fresh: T[] = [];
  const stale: T[] = [];
  items.forEach(s => {
    const t = s.addedAt ? Date.parse(s.addedAt) : NaN;
    (Number.isFinite(t) && t >= cutoff ? fresh : stale).push(s);
  });
  return { fresh, stale };
}
