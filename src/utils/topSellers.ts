// تقرير «الأكثر مبيعاً» ضمن مدى زمني — دالة نقية قابلة للاختبار عبر vitest.

interface LedgerLine { medicineId?: string; name: string; quantity: number; price: number }
interface LedgerDoc { timestamp: string; items: LedgerLine[] }

export interface TopSellerRow {
  key: string;
  medicineId?: string;
  name: string;      // الاسم بلا الجزء بين قوسين
  qty: number;       // صافي الكمية المباعة (بعد طرح المرتجعات)
  revenue: number;   // صافي قيمة المبيعات (IQD)
  invoices: number;  // عدد الفواتير التي ظهرت فيها المادة
}

// توحيد الاسم: إزالة الجزء بين قوسين (الاسم الإنكليزي) لدمج السجلات القديمة والجديدة
const cleanName = (n: string) => String(n).split(' (')[0].trim();

/**
 * يجمّع مبيعات كل مادة ضمن [from, to] (YYYY-MM-DD، شاملة الطرفين؛ الفارغ = بلا حد)
 * ويطرح مرتجعات المدى نفسه، ثم يرتّب تنازلياً بالكمية.
 * nameToId يربط سطور الفواتير القديمة (بلا medicineId) بالمادة عبر اسمها العربي.
 */
export function computeTopSellers(
  sales: LedgerDoc[],
  returns: LedgerDoc[],
  from: string,
  to: string,
  nameToId?: Map<string, string>
): TopSellerRow[] {
  const inRange = (ts: string) => {
    const d = String(ts || '').substring(0, 10);
    return !(from && d < from) && !(to && d > to);
  };
  const rows = new Map<string, TopSellerRow>();
  const rowFor = (it: LedgerLine, create: boolean) => {
    const name = cleanName(it.name);
    const id = it.medicineId || nameToId?.get(name);
    const key = id || `n:${name}`;
    let row = rows.get(key);
    if (!row && create) {
      row = { key, medicineId: id, name, qty: 0, revenue: 0, invoices: 0 };
      rows.set(key, row);
    }
    return row;
  };

  sales.forEach(s => {
    if (!inRange(s.timestamp)) return;
    const seen = new Set<string>();
    s.items.forEach(it => {
      const row = rowFor(it, true)!;
      row.qty += it.quantity || 0;
      row.revenue += (it.price || 0) * (it.quantity || 0);
      if (!seen.has(row.key)) { seen.add(row.key); row.invoices++; }
    });
  });

  returns.forEach(r => {
    if (!inRange(r.timestamp)) return;
    r.items.forEach(it => {
      const row = rowFor(it, false);
      if (!row) return;
      row.qty -= it.quantity || 0;
      row.revenue -= (it.price || 0) * (it.quantity || 0);
    });
  });

  return [...rows.values()].filter(r => r.qty > 0).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);
}
