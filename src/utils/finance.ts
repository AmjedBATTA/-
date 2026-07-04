// أدوات الحسابات المالية النقية لصيدلية انوار الحسن.
// لا تعتمد على React أو Firebase — قابلة للاختبار الآلي عبر vitest.

/** النسبة الافتراضية لتقدير التكلفة من سعر البيع عندما لا تتوفر تكلفة شراء حقيقية */
export const DEFAULT_COST_PERCENT = 72;

const COST_PERCENT_KEY = 'anwar_default_cost_percent';

/** تحميل نسبة التكلفة الافتراضية المحفوظة (1–99)، أو القيمة الافتراضية */
export function loadDefaultCostPercent(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_COST_PERCENT;
  const raw = Number(localStorage.getItem(COST_PERCENT_KEY));
  return Number.isFinite(raw) && raw >= 1 && raw <= 99 ? raw : DEFAULT_COST_PERCENT;
}

export function saveDefaultCostPercent(percent: number): void {
  if (typeof localStorage === 'undefined') return;
  const p = Math.min(99, Math.max(1, Math.round(percent)));
  localStorage.setItem(COST_PERCENT_KEY, String(p));
}

/**
 * توليد معرّف مستند فريد آمن من التصادم:
 * بادئة + طابع زمني Base36 + عدّاد تسلسلي (يمنع تصادم نفس الميلي ثانية) + 4 أحرف عشوائية.
 * يستبدل الأرقام العشوائية القديمة (1000–9999) التي كانت قابلة للتصادم بين فاتورتين.
 */
let idCounter = 0;
export function generateDocId(prefix: string): string {
  const t = Date.now().toString(36).toUpperCase();
  idCounter = (idCounter + 1) % 1296; // 36^2 — خانتان
  const c = idCounter.toString(36).toUpperCase().padStart(2, '0');
  const r = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `${prefix}-${t}${c}${r}`;
}

/** اشتقاق حالة توفر الدواء من الكمية المتاحة — المصدر الوحيد لعتبة "منخفض" (15) */
export function deriveStockStatus(qty: number): 'available' | 'low' | 'unavailable' {
  return qty <= 0 ? 'unavailable' : qty < 15 ? 'low' : 'available';
}

/**
 * تاريخ اليوم المحلي بصيغة YYYY-MM-DD — المصدر الوحيد لتواريخ القيود.
 * toISOString() يعيد يوم UTC، والعراق يسبقه بثلاث ساعات: قيدٌ بين منتصف الليل
 * والثالثة فجراً كان يُسجَّل بتاريخ الأمس فيختلط يومان في تقرير الإغلاق.
 * (صيغة en-CA تعطي YYYY-MM-DD بالتوقيت المحلي مباشرة.)
 */
export function todayLocalISO(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA');
}

/**
 * التكلفة الفعلية للوحدة: التكلفة المسجلة إن وُجدت وكانت موجبة،
 * وإلا تقدير بنسبة مئوية قابلة للضبط من سعر البيع.
 */
export function resolveUnitCost(
  costPrice: number | null | undefined,
  salePrice: number,
  costPercent: number = DEFAULT_COST_PERCENT
): number {
  if (typeof costPrice === 'number' && Number.isFinite(costPrice) && costPrice > 0) {
    return Math.round(costPrice);
  }
  return Math.round((Number(salePrice) || 0) * (costPercent / 100));
}

/** متوسط التكلفة المتحرك: متوسط مرجّح بين تكلفة المخزون القائم وتكلفة الشراء الجديد */
export function movingAverageCost(
  existingQty: number,
  existingCost: number,
  purchaseQty: number,
  purchaseCost: number
): number {
  const newQty = existingQty + purchaseQty;
  if (newQty <= 0) return Math.round(purchaseCost);
  return Math.round(((existingQty * existingCost) + (purchaseQty * purchaseCost)) / newQty);
}

export interface SaleTotals {
  subtotal: number;
  discountAmount: number;
  total: number;
}

/** مجاميع فاتورة البيع: المجموع قبل الخصم، قيمة الخصم (مقرّبة)، والصافي */
export function computeSaleTotals(
  lines: { price: number; quantity: number }[],
  discountPercent: number
): SaleTotals {
  const subtotal = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.quantity) || 0), 0);
  const safePercent = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountAmount = Math.round(subtotal * (safePercent / 100));
  return { subtotal, discountAmount, total: subtotal - discountAmount };
}

/** ربح الفاتورة وهامشه المئوي (صفر إذا كان الإجمالي صفراً — لا قسمة على صفر) */
export function computeProfit(total: number, totalCost: number): { grossProfit: number; profitMargin: number } {
  const grossProfit = total - totalCost;
  return {
    grossProfit,
    profitMargin: total > 0 ? Math.round((grossProfit / total) * 100) : 0,
  };
}
