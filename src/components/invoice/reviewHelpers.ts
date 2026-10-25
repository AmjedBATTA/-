import type { Medicine, ExtractedInvoiceItem } from '../../types';

// انحراف سعر الجملة المقروء عن آخر تكلفة محفوظة للمادة — يكشف أخطاء قراءة الأرقام (14'765 مقابل 1'4765)
export const PRICE_DEVIATION_LIMIT = 0.3;
export function priceDeviation(pricePerStrip: number, med: Medicine | null): number | null {
  const ref = med ? (med.lastCostPrice || med.costPrice || 0) : 0;
  if (!ref || !pricePerStrip) return null;
  return (pricePerStrip - ref) / ref;
}

// التكلفة الفعلية للشريط (بعد البونص) — نفس معادلة الاعتماد
export const effectiveCostPerStrip = (it: ExtractedInvoiceItem): number => {
  const total = (it.quantityBoxes + (it.bonusBoxes || 0)) * it.stripsPerBox;
  return total > 0 ? Math.round((it.pricePerBox * it.quantityBoxes) / total) : 0;
};

// بيع بخسارة: سعر البيع للجمهور (شريط) أقل من التكلفة الفعلية للشريط
export const isSellingAtLoss = (it: ExtractedInvoiceItem): boolean => {
  const cost = effectiveCostPerStrip(it);
  return cost > 0 && it.retailPrice > 0 && it.retailPrice < cost;
};

// سعر الشريط المعروض في المراجعة (بعد البونص إن وُجد) ونسبة انحرافه عن آخر شراء
export function itemCostView(it: ExtractedInvoiceItem) {
  const pricePerStrip = it.stripsPerBox > 0 ? Math.round(it.pricePerBox / it.stripsPerBox) : 0;
  const bonus = it.bonusBoxes || 0;
  const shownPerStrip = bonus > 0 ? effectiveCostPerStrip(it) : pricePerStrip;
  const deviation = priceDeviation(shownPerStrip, it.matchedMedicine);
  const deviates = deviation !== null && Math.abs(deviation) > PRICE_DEVIATION_LIMIT;
  return { pricePerStrip, bonus, shownPerStrip, deviation, deviates };
}

// سطر بسعر صفر بلا توأم مدفوع: غالباً بونص لمادة أخرى أو عرض — لن يُعتمد بلا سعر
export const isZeroPriceLine = (it: ExtractedInvoiceItem): boolean => it.pricePerBox === 0 && it.quantityBoxes > 0;

// هل يحتاج الصنف انتباه المراجع؟ (غير واضح، انحراف سعري، بيع بخسارة، سعر صفر)
export const itemNeedsAttention = (it: ExtractedInvoiceItem): boolean =>
  !!it.uncertain || itemCostView(it).deviates || isSellingAtLoss(it) || isZeroPriceLine(it);

// شارات الاعتبارات الثلاثة للمطابقة: ✓ متطابق · ✗ مختلف · ؟ غير مذكور في أحد الطرفين
export type FactorView = 'match' | 'mismatch' | 'unknown';
export function factorChips(f: NonNullable<ExtractedInvoiceItem['matchFactors']>): Array<{ label: string; state: FactorView; title: string }> {
  const dose: FactorView = f.strength === 'mismatch' || f.form === 'mismatch' ? 'mismatch'
    : f.strength === 'match' || f.form === 'match' ? 'match' : 'unknown';
  return [
    { label: 'الاسم', state: f.name >= 0.8 ? 'match' : 'unknown', title: f.name >= 0.8 ? 'الاسم متطابق' : 'الاسم متشابه جزئياً فقط' },
    { label: 'الجرعة', state: dose, title: dose === 'match' ? 'العيار/الشكل متطابق' : 'العيار غير مذكور في أحد الطرفين' },
    { label: 'الشركة', state: f.company, title: f.company === 'match' ? 'الشركة متطابقة' : f.company === 'mismatch' ? 'الشركة مختلفة — تأكد أنه نفس المنتج' : 'الشركة غير مسجّلة في أحد الطرفين' },
  ];
}
export const FACTOR_CLS: Record<FactorView, string> = {
  match: 'bg-primary-50 text-primary-700 border-primary-200',
  mismatch: 'bg-danger-50 text-danger-700 border-danger-300',
  unknown: 'bg-slate-100 text-slate-500 border-slate-200',
};
export const FACTOR_MARK: Record<FactorView, string> = { match: '✓', mismatch: '✗', unknown: '؟' };

export function matchBadge(score: number, isMatched: boolean, byAlias?: boolean, byAI?: boolean) {
  if (!isMatched) return { label: 'جديد', cls: 'bg-warn-100 text-warn-700 border-warn-200' };
  if (byAlias) return { label: 'محفوظ ✓', cls: 'bg-special-100 text-special-700 border-special-200' };
  if (byAI) return { label: 'حُسم ذكياً', cls: 'bg-custom-100 text-custom-700 border-custom-200' };
  if (score >= 0.8) return { label: 'تطابق', cls: 'bg-primary-100 text-primary-700 border-primary-200' };
  return { label: 'تقريبي', cls: 'bg-info-100 text-info-700 border-info-200' };
}

// في فواتير «ساوة» تُدمج الشركة بنهاية الاسم — نزيلها من الاسم الإنكليزي المخزَّن
// مع بقائها في حقلها المستقل، فيبقى اسم الدواء نظيفاً.
export const cleanEnglishName = (raw: string, company: string): string => {
  let n = (raw || '').trim();
  const c = (company || '').trim();
  if (c && n.toLowerCase().endsWith(c.toLowerCase())) {
    n = n.slice(0, n.length - c.length).replace(/[\s*·\-–—]+$/, '').trim();
  }
  return n;
};

// حدّ صفحة الصنف يحمل حالته: أحمر = يحتاج انتباهاً، أخضر = مطابق، كهرماني = جديد
export const itemFrameClass = (it: ExtractedInvoiceItem): string =>
  itemNeedsAttention(it) ? 'border-2 border-danger-400'
    : it.matchedMedicine ? 'border border-primary-200' : 'border border-warn-200';
