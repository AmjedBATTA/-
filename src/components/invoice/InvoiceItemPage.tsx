import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Barcode, CheckCircle2, ChevronDown, Search, Trash2 } from 'lucide-react';
import type { Medicine, ExtractedInvoiceItem } from '../../types';
import { fmtNum } from '../../utils/format';
import { cleanEnName, medDisplayName } from '../../utils/medName';
import {
  PRICE_DEVIATION_LIMIT, cleanEnglishName, effectiveCostPerStrip, factorChips,
  isSellingAtLoss, isZeroPriceLine, itemCostView, matchBadge,
} from './reviewHelpers';

interface Props {
  item: ExtractedInvoiceItem;
  barcodeOwner: (barcode: string) => Medicine | null;
  onUpdate: (id: string, patch: Partial<ExtractedInvoiceItem>) => void;
  onRemove: (id: string) => void;
  onOpenSearch: (id: string) => void;
  onOpenExpiry: (id: string) => void;
  onApplyBarcode: (id: string, barcode: string) => void;
  onScanBarcode: (id: string) => void;
}

type Tone = 'default' | 'bonus' | 'retail' | 'official' | 'loss';
const TONES: Record<Tone, { cell: string; label: string; value: string }> = {
  default: { cell: 'bg-white border-slate-200', label: 'text-slate-500', value: 'text-slate-900' },
  bonus: { cell: 'bg-primary-50 border-primary-300', label: 'text-primary-700', value: 'text-primary-800' },
  retail: { cell: 'bg-info-50 border-info-100', label: 'text-info-700', value: 'text-info-800' },
  official: { cell: 'bg-special-50 border-special-100', label: 'text-special-700', value: 'text-special-800' },
  loss: { cell: 'bg-danger-50 border-danger-400', label: 'text-danger-700', value: 'text-danger-800' },
};
// خلية حقل: التسمية داخل الإطار فوق القيمة الكبيرة — ارتفاع 52px أعلى من حد اللمس المريح (44)
const CELL = 'block h-[3.25rem] rounded-xl border px-3 pt-1 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500';
const CELL_LABEL = 'block text-xs font-bold leading-4';
const CELL_VALUE = 'w-full h-7 bg-transparent text-xl font-bold tabular-nums text-center focus:outline-none';

function NumCell({ label, value, min, tone = 'default', onChange }: {
  label: string; value: number; min: number; tone?: Tone; onChange: (n: number) => void;
}) {
  const t = TONES[tone];
  return (
    <label className={`${CELL} ${t.cell}`}>
      <span className={`${CELL_LABEL} ${t.label}`}>{label}</span>
      <input type="number" inputMode="numeric" min={min} value={value}
        onFocus={e => e.target.select()}
        onChange={e => onChange(Math.max(min, Number(e.target.value)))}
        className={`${CELL_VALUE} ${t.value}`} />
    </label>
  );
}

/**
 * صفحة مراجعة دواء واحد في فاتورة الاستيراد (تُعرض داخل حاوية أفقية، صفحة لكل دواء).
 * بلا منطق أعمال: كل التعديلات تعود للأب عبر onUpdate وأخواتها، فلا يتغيّر الاعتماد ولا المسودة ولا التعلّم.
 */
export default function InvoiceItemPage({
  item, barcodeOwner, onUpdate, onRemove, onOpenSearch, onOpenExpiry, onApplyBarcode, onScanBarcode,
}: Props) {
  const med = item.matchedMedicine;
  const { pricePerStrip, bonus, shownPerStrip, deviation, deviates } = itemCostView(item);
  const totalStrips = (item.quantityBoxes + bonus) * item.stripsPerBox;
  const zeroPriceLine = isZeroPriceLine(item);
  const sellLoss = isSellingAtLoss(item);
  const badge = matchBadge(item.matchScore, !!med, item.matchedByAlias, item.matchedByAI);
  const dupMed = !med ? barcodeOwner(item.barcode || '') : null;

  // الاسم الإنكليزي هو العنوان: يبدأ من المحفوظ في المخزون إن وُجد (فلا يضيع) أو من اسم الفاتورة،
  // وأي تعديل هنا هو ما يُعتمد في المخزون عند الاعتماد (انظر handleConfirm) بدل القديم المحفوظ صامتاً
  const englishName = item.nameEnOverride ?? (cleanEnName(med?.nameEn) || cleanEnName(cleanEnglishName(item.rawName, item.company)));
  const showRawName = !!item.rawName.trim() && cleanEnName(item.rawName) !== cleanEnName(englishName);

  // آخر شراء: نفس المرجع الذي يُحسب منه الانحراف (آخر سعر شراء فعلي ثم المتوسط)
  const lastCost = med ? (med.lastCostPrice || med.costPrice || 0) : 0;

  // تنبيهات هذا الدواء فقط، رقاقات تُلمس لقراءة الشرح (title لا يعمل باللمس)
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const alerts: Array<{ key: string; label: string; tone: 'danger' | 'warn'; text: string }> = [];
  if (item.uncertain) alerts.push({ key: 'uncertain', label: 'غير واضح ⚠', tone: 'danger', text: 'النموذج قرأ رقماً أو اسماً في هذا السطر بصعوبة — قارنه بالصورة.' });
  if (sellLoss) alerts.push({ key: 'loss', label: 'بيع بخسارة', tone: 'danger', text: `سعر البيع للجمهور أقل من تكلفة الشريط (${fmtNum(effectiveCostPerStrip(item))}) — راجع الأسعار.` });
  if (deviates && deviation !== null) {
    const pct = Math.round(Math.abs(deviation) * 100);
    alerts.push({ key: 'deviation', label: `انحراف السعر ${deviation > 0 ? '▲' : '▼'}${pct}%`, tone: 'warn', text: `يختلف عن آخر شراء بنسبة ${pct}% (الحد ${Math.round(PRICE_DEVIATION_LIMIT * 100)}%) — تحقّق من الرقم في الفاتورة.` });
  }
  if (zeroPriceLine) alerts.push({ key: 'zero', label: 'سعر صفر', tone: 'warn', text: 'سطر بسعر صفر — إن كان بونصاً لمادة أخرى فاحذفه وأدخل كميته في حقل «بونص» لتلك المادة، وإلا أدخل سعره؛ بلا سعر لن يُضاف للمسودة.' });
  if (med && !item.matchedByAlias && item.matchFactors) {
    factorChips(item.matchFactors).filter(c => c.state === 'mismatch')
      .forEach(c => alerts.push({ key: `f-${c.label}`, label: `${c.label} ✗`, tone: 'danger', text: c.title }));
  }
  const openedAlert = alerts.find(a => a.key === openAlert);

  // «المزيد» مطوي افتراضياً، ويُفتح تلقائياً حين يلزم الانتباه لباركود مكرّر (يمنع الاعتماد)
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || !!dupMed;
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (moreOpen) moreRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [moreOpen]);

  const [editingStock, setEditingStock] = useState(false);
  const currentStock = med ? (item.stockOverride ?? med.availableQuantity) : 0;
  const corrected = !!med && item.stockOverride !== undefined && item.stockOverride !== med.availableQuantity;

  return (
    <div className="p-3 space-y-2 text-right">

      {/* الشارة في طرف، والحذف (المدمّر) معزول في الطرف الآخر */}
      <div className="flex items-center justify-between h-6">
        <span className={`text-xs font-semibold px-2 h-6 inline-flex items-center rounded-full border ${badge.cls}`}>{badge.label}</span>
        <button type="button" onClick={() => onRemove(item.id)} aria-label="حذف هذا الصنف"
          className="h-11 w-11 -my-2.5 -me-2.5 grid place-items-center rounded-xl text-slate-400 hover:text-danger-600 active:bg-danger-50 transition cursor-pointer">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* العنوان: الاسم الإنكليزي (قابل للتعديل) وبجانبه الشركة، وتحته اسم الفاتورة إن اختلف */}
      <div>
        <div className="flex items-end gap-2 h-11">
          <input
            dir="ltr"
            value={englishName}
            onChange={e => onUpdate(item.id, { nameEnOverride: e.target.value })}
            placeholder="English name"
            className="flex-1 min-w-0 text-right text-lg font-bold text-slate-900 bg-transparent border-b border-dashed border-slate-200 focus:border-primary-500 focus:outline-none"
          />
          <input
            dir="auto"
            value={item.company}
            onChange={e => onUpdate(item.id, { company: e.target.value })}
            placeholder="الشركة"
            className="w-28 shrink-0 text-right text-sm font-bold text-slate-500 bg-transparent border-b border-dashed border-slate-200 focus:border-primary-500 focus:outline-none"
          />
        </div>
        {showRawName && <p dir="auto" className="text-xs text-slate-500 truncate mt-1">{item.rawName}</p>}
      </div>

      {/* المطابقة: بطاقة كلها زرّ تفتح ورقة الربط (وفيها «فكّ الربط»)، أو زر بحث بارز للجديد */}
      {med ? (
        <button type="button" onClick={() => onOpenSearch(item.id)}
          className="h-12 w-full flex items-center gap-2 rounded-xl px-3 bg-primary-50 border border-primary-100 text-right cursor-pointer">
          <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0" />
          <span dir="ltr" className="flex-1 min-w-0 truncate text-right text-sm font-semibold text-primary-800">{medDisplayName(med)}</span>
          <span className="shrink-0 text-sm font-bold text-primary-700">تغيير</span>
        </button>
      ) : (
        <div>
          <button type="button" onClick={() => onOpenSearch(item.id)}
            className="h-14 w-full rounded-xl bg-warn-50 border-2 border-dashed border-warn-300 px-3 flex items-center gap-2 text-right cursor-pointer">
            <Search className="w-5 h-5 text-warn-700 shrink-0" />
            <span className="flex-1 text-sm font-bold text-warn-800">ابحث لربطه بدواء في المخزون</span>
          </button>
          <p className="text-xs font-medium text-warn-700 mt-1">أو اتركه ليُضاف مادةً جديدة</p>
        </div>
      )}

      {/* تنبيهات هذا الدواء — تظهر فقط عند وجودها */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {alerts.map(a => (
              <button key={a.key} type="button" onClick={() => setOpenAlert(openAlert === a.key ? null : a.key)}
                className={`h-8 px-2.5 rounded-full border text-xs font-semibold cursor-pointer ${a.tone === 'danger'
                  ? 'bg-danger-50 text-danger-800 border-danger-300'
                  : 'bg-warn-50 text-warn-800 border-warn-300'}`}>
                {a.label}
              </button>
            ))}
          </div>
          {openedAlert && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 leading-relaxed">{openedAlert.text}</p>}
        </div>
      )}

      {/* المخزون الحالي — ظاهر دائماً للدواء المطابق؛ النقر المزدوج على البطاقة لتصحيحه
          (تصحيح جرد يُعتمد رصيداً فعلياً عند التأكيد). touch-manipulation يُبقي dblclick يعمل على أندرويد */}
      {med && (
        <div
          onDoubleClick={() => setEditingStock(true)}
          className={`min-h-14 flex items-center gap-3 rounded-xl border px-3 py-1.5 select-none touch-manipulation cursor-pointer ${corrected ? 'bg-warn-50 border-warn-200' : 'bg-slate-100 border-slate-200'}`}
        >
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${corrected ? 'text-warn-700' : 'text-slate-600'}`}>
              المخزون الحالي{item.soldQty ? ' (مُباع بالكامل ✓)' : corrected ? ' (مُصحَّح ✎)' : ''}
            </p>
            {!editingStock && <p className="text-xs text-slate-500">انقر مرتين للتصحيح</p>}
          </div>
          {editingStock ? (
            <input
              type="number" inputMode="numeric" min={0} autoFocus defaultValue={currentStock}
              onFocus={e => e.target.select()}
              onBlur={e => {
                const v = Math.max(0, Math.round(Number(e.target.value)));
                onUpdate(item.id, { stockOverride: Number.isFinite(v) ? v : currentStock, soldQty: undefined });
                setEditingStock(false);
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingStock(false); }}
              className="w-28 h-11 bg-white border border-slate-300 rounded-lg px-2 text-lg font-bold text-slate-900 text-center tabular-nums focus:outline-primary-400"
            />
          ) : (
            <p className={`shrink-0 tabular-nums ${corrected ? 'text-warn-800' : 'text-slate-900'}`}>
              {corrected && <span className="text-xs text-slate-500 line-through ml-1.5">{fmtNum(med.availableQuantity)}</span>}
              <span className="text-2xl font-bold">{fmtNum(currentStock)}</span>
              <span className="text-xs text-slate-500 mr-1">شريط</span>
            </p>
          )}
          {/* «مباع»: الرصيد الوهمي كله بيع فعلي لم يُسجَّل بالباركود — يُصفَّر ويُسجَّل فاتورة بيع عند الاعتماد */}
          {(med.availableQuantity > 0 || item.soldQty) && (
            <button type="button"
              onClick={e => {
                e.stopPropagation();
                if (item.soldQty) onUpdate(item.id, { soldQty: undefined, stockOverride: undefined });
                else onUpdate(item.id, { soldQty: med.availableQuantity, stockOverride: 0 });
              }}
              title={item.soldQty ? 'إلغاء اعتبار الرصيد مبيعاً' : 'اعتبار الرصيد الحالي كله مبيعاً (يُصفَّر المخزون وتُسجَّل فاتورة بيع عند الاعتماد)'}
              className={`shrink-0 h-11 min-w-16 px-3 rounded-xl border text-sm font-bold cursor-pointer ${item.soldQty
                ? 'bg-danger-500 border-danger-500 text-white'
                : 'bg-danger-50 border-danger-200 text-danger-700 active:bg-danger-100'}`}>
              {item.soldQty ? `مباع ${fmtNum(item.soldQty)} ✓` : 'مباع'}
            </button>
          )}
        </div>
      )}

      {/* الكمية والتكلفة: علب، بونص، شريط/علبة، سعر العلبة. البونص علب مجانية تدخل المخزون وتخفّض
          التكلفة الفعلية دون أن تدخل في المبلغ المدفوع */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <NumCell label="علب" value={item.quantityBoxes} min={1} onChange={n => onUpdate(item.id, { quantityBoxes: n })} />
        <NumCell label="بونص" value={bonus} min={0} tone={bonus > 0 ? 'bonus' : 'default'} onChange={n => onUpdate(item.id, { bonusBoxes: n })} />
        <NumCell label="شريط / علبة" value={item.stripsPerBox} min={1} onChange={n => onUpdate(item.id, { stripsPerBox: n })} />
        <NumCell label="سعر العلبة" value={item.pricePerBox} min={0} onChange={n => onUpdate(item.id, { pricePerBox: n })} />
      </div>

      {/* الناتج: تكلفة الشريط (مذوّبة بعد البونص) مع مقارنتها بآخر شراء */}
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 min-h-11 rounded-xl border px-3 py-1.5 ${deviates ? 'bg-warn-50 border-warn-300' : 'bg-primary-50 border-primary-100'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${deviates ? 'text-warn-700' : 'text-primary-700'}`}>تكلفة الشريط</span>
          <span className={`text-xl font-bold tabular-nums ${deviates ? 'text-warn-800' : 'text-primary-800'}`}>{fmtNum(shownPerStrip)}</span>
          {bonus > 0 && (
            <span title={`السعر الأصلي للشريط ${fmtNum(pricePerStrip)} — خُفّض باحتساب البونص المجاني`}
              className="h-5 px-1.5 inline-flex items-center rounded-full bg-primary-100 text-primary-700 text-xs font-semibold">مذوّب</span>
          )}
        </div>
        {lastCost > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 tabular-nums">آخر شراء {fmtNum(lastCost)}</span>
            {deviation !== null && (
              <span className={`h-6 px-2 inline-flex items-center rounded-full text-xs font-bold tabular-nums ${deviates
                ? 'bg-warn-100 text-warn-800 border border-warn-300'
                : deviation < 0 ? 'bg-money-50 text-money-700' : 'bg-slate-100 text-slate-600'}`}>
                {deviation < 0 ? '▼' : '▲'}{Math.round(Math.abs(deviation) * 100)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* أسعار البيع + تاريخ الانتهاء + إجمالي الأشرطة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <NumCell label="بيع الجمهور (شريط)" value={item.retailPrice} min={0} tone={sellLoss ? 'loss' : 'retail'} onChange={n => onUpdate(item.id, { retailPrice: n })} />
        <NumCell label="البيع الرسمي (شريط)" value={item.officialPrice} min={0} tone="official" onChange={n => onUpdate(item.id, { officialPrice: n })} />
        <button type="button" onClick={() => onOpenExpiry(item.id)} className={`${CELL} ${TONES.default.cell} text-center cursor-pointer`}>
          <span className={`${CELL_LABEL} ${TONES.default.label}`}>تاريخ الانتهاء</span>
          <span dir="ltr" className={`block text-xl font-bold leading-7 ${item.expiry ? 'text-slate-900' : 'text-slate-400'}`}>
            {item.expiry ? `${Number(item.expiry.split('-')[1])} / ${item.expiry.split('-')[0]}` : '— / —'}
          </span>
        </button>
        <div className={`${CELL} bg-slate-100 border-slate-200`}>
          <span className={`${CELL_LABEL} text-slate-500`}>إجمالي الأشرطة</span>
          <span className="block text-xl font-bold leading-7 tabular-nums text-center text-slate-800">
            {totalStrips}
            {bonus > 0 && <span className="text-xs text-primary-700 mr-1">({bonus * item.stripsPerBox} بونص)</span>}
          </span>
        </div>
      </div>

      {/* المزيد: الاسم العربي (للبحث) وباركود المادة الجديدة */}
      <div ref={moreRef} className="border-t border-slate-100 pt-1">
        <button type="button" onClick={() => setMoreOpen(v => !v)} disabled={!!dupMed}
          className="h-11 w-full flex items-center justify-between text-sm font-bold text-slate-500 cursor-pointer disabled:cursor-default">
          <span>المزيد</span>
          <ChevronDown className={`w-4 h-4 transition ${showMore ? 'rotate-180' : ''}`} />
        </button>
        {showMore && (
          <div className="space-y-3 pb-2">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">الاسم العربي</label>
              <input
                dir="auto"
                value={item.arabicName}
                onChange={e => onUpdate(item.id, { arabicName: e.target.value })}
                placeholder="الاسم العربي"
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3 text-sm font-semibold text-slate-900 focus:outline-primary-400"
              />
            </div>
            {/* باركود المادة الجديدة (لغير المطابقة فقط — يُولَّد تلقائياً إن تُرك فارغاً) */}
            {!med && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 block">باركود المادة الجديدة (اختياري)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text" inputMode="numeric" dir="ltr"
                    value={item.barcode || ''}
                    onChange={e => onApplyBarcode(item.id, e.target.value)}
                    placeholder="يُولَّد تلقائياً إن تُرك فارغاً"
                    className={`flex-1 min-w-0 h-11 border rounded-xl px-3 text-sm tabular-nums font-bold text-slate-900 text-center focus:outline-primary-400 ${dupMed ? 'border-danger-400 bg-danger-50' : 'border-slate-200 bg-white'}`}
                  />
                  <button type="button" onClick={() => onScanBarcode(item.id)} aria-label="قراءة الباركود بالكاميرا"
                    className="shrink-0 h-11 w-11 grid place-items-center bg-primary-600 text-white rounded-xl active:bg-primary-700 transition cursor-pointer">
                    <Barcode className="w-5 h-5" />
                  </button>
                </div>
                {/* تنبيه الباركود المكرّر — منع لا دمج */}
                {dupMed && (
                  <div className="flex items-start gap-1.5 bg-danger-50 border border-danger-100 rounded-lg px-2.5 py-1.5">
                    <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-px" />
                    <p className="text-sm font-semibold text-danger-700 leading-snug">
                      أقول لك المادة موجودة! هذا الباركود مُسجَّل مسبقاً للمادة «{medDisplayName(dupMed)}» — غيّره أو اتركه فارغاً ليُولَّد تلقائياً.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
