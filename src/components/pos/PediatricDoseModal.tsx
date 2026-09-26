import { useEffect, useMemo, useState } from 'react';
import { Baby, X, AlertTriangle, ExternalLink, Search } from 'lucide-react';
import type { Medicine } from '../../types';
import { SYRUP_DRUGS, computeDose, detectConcentration, findSyrupDrug, type SyrupDrug } from '../../utils/pediatricDoses';

// =========================================================
// نافذة «جرعات شرابات الأطفال» — تُفتح من رأس سلة البيع أو من زر الطفل
// على صف شراب معروف في السلة (فتُختار المادة والتركيز تلقائياً).
// الوزن والعمر يبقيان محفوظين أثناء الجلسة كي يتنقّل الصيدلي بين أكثر من شراب
// لنفس الطفل دون إعادة إدخالهما.
// =========================================================

interface Props {
  open: boolean;
  medicine?: Medicine | null; // الصنف الذي فُتحت منه النافذة (اختياري)
  onClose: () => void;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const range = (r: [number, number], unit: string) => (r[0] === r[1] ? `${fmt(r[0])} ${unit}` : `${fmt(r[0])}–${fmt(r[1])} ${unit}`);

export function PediatricDoseModal({ open, medicine, onClose }: Props) {
  const [weight, setWeight] = useState('');
  const [years, setYears] = useState('');
  const [months, setMonths] = useState('');
  const [query, setQuery] = useState('');
  const [drugId, setDrugId] = useState<string>(SYRUP_DRUGS[0].id);
  const [conc, setConc] = useState<number>(SYRUP_DRUGS[0].concentrations[0].mgPer5ml);
  const [regId, setRegId] = useState<string>(SYRUP_DRUGS[0].regimens[0].id);

  const drug = SYRUP_DRUGS.find(d => d.id === drugId)!;

  const selectDrug = (d: SyrupDrug, preferConc?: number | null) => {
    setDrugId(d.id);
    setConc(preferConc ?? d.concentrations[0].mgPer5ml);
    setRegId(d.regimens[0].id);
  };

  // عند الفتح من صف في السلة: اختيار المادة والتركيز من اسم الصنف
  useEffect(() => {
    if (!open || !medicine) return;
    const d = findSyrupDrug(medicine);
    if (d) { selectDrug(d, detectConcentration(d, `${medicine.nameEn} ${medicine.nameAr}`)); setQuery(''); }
  }, [open, medicine]);

  // Escape يغلق النافذة (مستمع في طور الالتقاط كي لا يصل لاختصار «مسح السلة»)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SYRUP_DRUGS;
    return SYRUP_DRUGS.filter(d => d.nameAr.includes(q) || d.nameEn.toLowerCase().includes(q) || d.match.test(q));
  }, [query]);

  if (!open) return null;

  const w = weight.trim() ? Number(weight) : null;
  const ageMonths = years.trim() || months.trim() ? (Number(years) || 0) * 12 + (Number(months) || 0) : null;
  const regimen = drug.regimens.find(r => r.id === regId) ?? drug.regimens[0];
  const result = computeDose(regimen, conc, w && w > 0 ? w : null, ageMonths);

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-sm font-bold text-white tabular-nums placeholder:text-slate-500 focus:outline-none focus:border-primary-500';
  const chip = (active: boolean) => `px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition ${active ? 'bg-primary-600 border-primary-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" dir="rtl">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="جرعات شرابات الأطفال"
        className="relative z-10 w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-4 sm:p-5 space-y-4 text-right">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Baby className="w-5 h-5 text-primary-400" />
            <h3 className="font-semibold text-white text-base">جرعات شرابات الأطفال</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="p-1.5 text-slate-500 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* الوزن والعمر */}
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-400">الوزن (كغ)</span>
            <input type="number" inputMode="decimal" min={0} step={0.1} autoFocus value={weight} onChange={e => setWeight(e.target.value)} className={inputCls} placeholder="مثلاً 12" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-400">العمر: سنوات</span>
            <input type="number" inputMode="numeric" min={0} value={years} onChange={e => setYears(e.target.value)} className={inputCls} placeholder="0" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-400">و أشهر</span>
            <input type="number" inputMode="numeric" min={0} max={11} value={months} onChange={e => setMonths(e.target.value)} className={inputCls} placeholder="0" />
          </label>
        </div>

        <div className="grid md:grid-cols-5 gap-4">
          {/* قائمة المواد */}
          <div className="md:col-span-2 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن المادة الفعالة"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 pr-9 pl-3 text-xs font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-primary-500" />
            </div>
            <div className="max-h-56 md:max-h-[340px] overflow-y-auto space-y-1 pl-1">
              {filtered.map(d => (
                <button key={d.id} type="button" onClick={() => selectDrug(d)}
                  className={`w-full text-right px-3 py-2 rounded-xl border cursor-pointer transition ${d.id === drugId ? 'bg-primary-900/50 border-primary-600' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                  <div className="text-xs font-bold text-white">{d.nameAr}</div>
                  <div className="text-xs text-slate-400" dir="ltr">{d.nameEn}</div>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">لا توجد مادة مطابقة</p>}
            </div>
          </div>

          {/* التركيز + الاستطباب + النتيجة */}
          <div className="md:col-span-3 space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400">التركيز (ملغ / 5 مل)</span>
              <div className="flex flex-wrap gap-1.5">
                {drug.concentrations.map(c => (
                  <button key={c.mgPer5ml} type="button" onClick={() => setConc(c.mgPer5ml)} className={chip(conc === c.mgPer5ml)}>
                    <span dir="ltr">{c.label ?? c.mgPer5ml}</span>
                  </button>
                ))}
              </div>
              {drug.component && <p className="text-xs text-slate-500">{drug.component}</p>}
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400">الاستطباب</span>
              <div className="flex flex-col gap-1">
                {drug.regimens.map(r => (
                  <button key={r.id} type="button" onClick={() => setRegId(r.id)} className={`${chip(r.id === regimen.id)} text-right`}>{r.label}</button>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 space-y-2">
              {'error' in result ? (
                <p className="text-sm font-bold text-warn-300 py-3 text-center">{result.error}</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-400">الجرعة الواحدة</span>
                    <span className="text-2xl font-bold text-primary-300 tabular-nums">{range(result.doseMl, 'مل')}</span>
                  </div>
                  <div className="text-sm text-slate-300 font-semibold flex flex-wrap gap-x-3 gap-y-1">
                    <span className="tabular-nums">= {range(result.doseMg, 'ملغ')}</span>
                    <span className="text-white">{regimen.interval}</span>
                  </div>
                  {result.label && <p className="text-xs text-slate-300">{result.label}</p>}
                  {result.dayMg && regimen.kind !== 'perKgDose' && (
                    <p className="text-xs text-slate-400 tabular-nums">المجموع اليومي: {range(result.dayMg, 'ملغ')}</p>
                  )}
                  {result.maxDayMg !== undefined && (
                    <p className="text-xs text-slate-400 tabular-nums">لا يتجاوز يومياً: {fmt(result.maxDayMg)} ملغ ({fmt(result.maxDayMg * 5 / conc)} مل)</p>
                  )}
                  {regimen.duration && <p className="text-xs text-slate-400">المدة: {regimen.duration}</p>}
                  {result.capped.length > 0 && <p className="text-xs text-custom-300">طُبِّق السقف: {result.capped.join('، ')}</p>}
                </>
              )}
              {regimen.note && <p className="text-xs text-slate-300 border-t border-slate-700 pt-2">{regimen.note}</p>}
              {[...('error' in result ? [] : result.warnings), ...(drug.warnings ?? [])].map((wn, i) => (
                <p key={i} className="text-xs text-warn-300 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{wn}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">للاسترشاد فقط — الوصفة الطبية وتعليمات العبوة تتقدّمان دائماً.</p>
          <a href={drug.source} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary-400 hover:text-primary-300 flex items-center gap-1">
            المصدر: Medscape <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
