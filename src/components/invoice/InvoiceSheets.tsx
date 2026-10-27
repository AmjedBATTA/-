import { useMemo, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Search, X } from 'lucide-react';
import type { Medicine, ExtractedInvoiceItem } from '../../types';
import { matchToInventory } from '../../utils/invoiceExtractor';
import type { InvoiceAliasMap } from '../../utils/invoiceExtractor';
import { medDisplayName } from '../../utils/medName';

// ورقة سفلية داخل لوحة الاستيراد: بدل القوائم المنسدلة التي تقصّها حاوية الصفحات الأفقية،
// وأنسب للمس. تُرسم فوق كل شيء داخل اللوحة نفسها (الأب position: relative).
function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end rounded-l-3xl overflow-hidden" dir="rtl">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40" onClick={onClose}
      />
      {/* الدخول أطول من الخروج: يُرى الوصول ويُسرَّع الانصراف */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0, transition: { duration: 0.28, ease: 'easeOut' } }}
        exit={{ y: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
        className="relative bg-white rounded-t-3xl shadow-2xl max-h-[88%] flex flex-col pb-[max(.75rem,var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 shrink-0" />
        <div className="flex items-center justify-between px-5 pt-2 pb-2 shrink-0">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="h-11 w-11 -me-3 grid place-items-center hover:bg-slate-100 rounded-xl transition cursor-pointer">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

interface SearchSheetProps {
  item: ExtractedInvoiceItem;
  inventory: Medicine[];
  aliases: InvoiceAliasMap;
  query: string;
  onQuery: (q: string) => void;
  onPick: (med: Medicine) => void;
  onClose: () => void;
}

// ربط صنف جديد بدواء موجود في المخزون: مقترحات قريبة من اسم الفاتورة، أو بحث حر بالاسم
export function MedicineSearchSheet({ item, inventory, aliases, query, onQuery, onPick, onClose }: SearchSheetProps) {
  const suggestions = useMemo(() => {
    const { medicine } = matchToInventory(item.arabicName || item.rawName, inventory, item.rawName, aliases);
    const nb = (item.arabicName || item.rawName).toLowerCase();
    const top = inventory
      .map(m => ({ m, score: [m.nameAr, m.nameEn, m.scientificName].map(n => {
        const na = (n || '').toLowerCase();
        return na.includes(nb.slice(0, 4)) || nb.includes(na.slice(0, 4)) ? 0.6 : 0;
      }).reduce((a: number, b) => Math.max(a, b), 0) }))
      .filter(x => x.score > 0 || x.m.id === medicine?.id)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(x => x.m);
    return top.length ? top : inventory.slice(0, 6);
  }, [item.arabicName, item.rawName, inventory, aliases]);

  const q = query.trim().toLowerCase();
  const results = q
    ? inventory.filter(m => m.nameAr.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q)).slice(0, 20)
    : suggestions;

  return (
    <SheetShell title="ربط بدواء من المخزون" onClose={onClose}>
      <div className="px-5 pb-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="ابحث بالاسم…"
            className="w-full text-base bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 h-12 focus:outline-primary-400"
          />
        </div>
        <p className="text-xs font-bold text-slate-500 mt-2">{q ? 'نتائج' : 'اقتراحات'}</p>
      </div>
      <div className="overflow-y-auto px-3 pb-4">
        {results.length === 0 && (
          <p className="text-sm font-bold text-slate-500 text-center py-6">لا نتائج</p>
        )}
        {results.map(med => (
          <button key={med.id} type="button" onClick={() => onPick(med)}
            className="w-full min-h-12 px-3 py-2 border-b border-slate-100 active:bg-primary-50 text-right transition cursor-pointer flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span dir="ltr" className="block text-right text-sm font-semibold text-slate-900 truncate">{medDisplayName(med)}</span>
              {med.nameAr && med.nameAr !== medDisplayName(med) && (
                <span dir="auto" className="block text-xs text-slate-500 truncate">{med.nameAr}</span>
              )}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{med.availableQuantity} شريط</span>
          </button>
        ))}
      </div>
    </SheetShell>
  );
}

interface ExpirySheetProps {
  expiry?: string; // YYYY-MM
  onChange: (expiry: string) => void;
  onClose: () => void;
}

// شهر/سنة الانتهاء بأرقام صريحة دائماً — لا أسماء أشهر مثل Sep/Oct التي يفرضها منتقي month على أندرويد.
// اختيار السنة يُغلق الورقة (الشهر ثم السنة هو التسلسل الطبيعي).
export function ExpirySheet({ expiry, onChange, onClose }: ExpirySheetProps) {
  const curM = expiry ? Number(expiry.split('-')[1]) : 0;
  const curY = expiry ? Number(expiry.split('-')[0]) : 0;
  const baseYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => baseYear + i);
  if (curY && !years.includes(curY)) years.unshift(curY);
  const set = (m: number, y: number) => onChange(`${y}-${String(m).padStart(2, '0')}`);

  return (
    <SheetShell title="تاريخ الانتهاء" onClose={onClose}>
      <div className="overflow-y-auto px-5 pb-3 space-y-4" dir="ltr">
        <p className="text-3xl font-bold tabular-nums text-center text-slate-900">
          {curM ? String(curM).padStart(2, '0') : '--'} / {curY || '----'}
        </p>
        <div>
          <p className="text-sm font-bold text-slate-500 mb-2 text-right" dir="rtl">الشهر</p>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <button key={m} type="button" onClick={() => set(m, curY || baseYear)}
                className={`h-12 rounded-xl text-base font-semibold text-center cursor-pointer transition ${
                  m === curM ? 'bg-primary-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-primary-50'
                }`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-500 mb-2 text-right" dir="rtl">السنة</p>
          <div className="grid grid-cols-4 gap-2">
            {years.map(y => (
              <button key={y} type="button" onClick={() => { set(curM || 12, y); onClose(); }}
                className={`h-12 rounded-xl text-base font-semibold text-center cursor-pointer transition tabular-nums ${
                  y === curY ? 'bg-primary-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-primary-50'
                }`}>
                {y}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose}
          className="w-full h-12 rounded-xl bg-primary-600 text-white text-sm font-bold active:bg-primary-700 transition cursor-pointer" dir="rtl">
          تم
        </button>
      </div>
    </SheetShell>
  );
}
