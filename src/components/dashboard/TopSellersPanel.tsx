import React, { useMemo, useState } from 'react';
import { ChevronDown, Plus, TrendingUp } from 'lucide-react';
import type { Medicine } from '../../types';
import type { SaleRecord, SalesReturn } from './shared';
import { fmtNum } from '../../utils/format';
import { todayLocalISO } from '../../utils/finance';
import { computeTopSellers } from '../../utils/topSellers';
import { toast } from '../ui/dialogs';

const TOP_SELLERS_LIMIT = 50;   // سقف العرض — البحث يُظهر ما بعده
const LOW_COVER_DAYS = 14;      // تغطية أقل من أسبوعين = يستحق إعادة الطلب

const daysAgoISO = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return todayLocalISO(d);
};

interface TopSellersPanelProps {
  inventory: Medicine[];
  salesLedger: SaleRecord[];
  salesReturns: SalesReturn[];
  addToPurchaseDraft: (med: Medicine, overrideQty?: number) => void;
}

// الأكثر مبيعاً ضمن مدى زمني يحدّده المستخدم، مع الرصيد الحالي وتقدير أيام التغطية
export default function TopSellersPanel({ inventory, salesLedger, salesReturns, addToPurchaseDraft }: TopSellersPanelProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => daysAgoISO(29)); // آخر 30 يوماً شاملة اليوم
  const [to, setTo] = useState(() => todayLocalISO());
  const [sortBy, setSortBy] = useState<'qty' | 'revenue'>('qty');
  const [query, setQuery] = useState('');

  const today = todayLocalISO();
  const presets = [
    { label: 'اليوم', from: today },
    { label: '7 أيام', from: daysAgoISO(6) },
    { label: '30 يوماً', from: daysAgoISO(29) },
    { label: '90 يوماً', from: daysAgoISO(89) },
    { label: 'هذا الشهر', from: today.slice(0, 8) + '01' },
  ];

  // لا يُحسب شيء والقائمة مطوية — سجل المبيعات قد يضم آلاف الفواتير
  const rows = useMemo(() => {
    if (!open) return [];
    const medById = new Map(inventory.map(m => [m.id, m]));
    const nameToId = new Map(inventory.map(m => [m.nameAr.trim(), m.id]));
    const list = computeTopSellers(salesLedger, salesReturns, from, to, nameToId)
      .map(r => ({ ...r, med: r.medicineId ? medById.get(r.medicineId) : undefined }));
    if (sortBy === 'revenue') list.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
    return list.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [open, inventory, salesLedger, salesReturns, from, to, sortBy]);

  // عدد أيام المدى (لتقدير معدل البيع اليومي) — يتعذّر حسابه إن لم يُحدَّد تاريخ البداية
  const periodDays = from
    ? Math.max(1, Math.round((new Date(to || today).getTime() - new Date(from).getTime()) / 86400000) + 1)
    : null;

  const q = query.trim().toLowerCase();
  const matched = q
    ? rows.filter(r => r.name.toLowerCase().includes(q) || (r.med?.nameEn || '').toLowerCase().includes(q))
    : rows;
  const visible = matched.slice(0, TOP_SELLERS_LIMIT);
  const maxValue = Math.max(1, ...rows.map(r => (sortBy === 'qty' ? r.qty : r.revenue)));
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-right hover:bg-slate-50/60 transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary-50 border border-primary-100">
            <TrendingUp className="w-4 h-4 text-primary-600" />
          </span>
          <div>
            <h4 className="font-semibold text-xs text-slate-900">المواد الأكثر مبيعاً</h4>
            <p className="text-xs text-slate-500 font-bold mt-0.5">ترتيب المواد حسب مبيعاتها ضمن مدة تحدّدها، مع الرصيد الحالي وكم يوماً يكفي</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
          {/* المدى الزمني: اختصارات + من/إلى */}
          <div className="flex flex-wrap items-center gap-2">
            {presets.map(p => (
              <button key={p.label} type="button" onClick={() => { setFrom(p.from); setTo(today); }}
                className={`text-sm font-semibold px-3 py-1 rounded-full border transition cursor-pointer ${from === p.from && to === today ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => { setFrom(''); setTo(''); }}
              className={`text-sm font-semibold px-3 py-1 rounded-full border transition cursor-pointer ${!from && !to ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              كل المدة
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3 space-y-1">
              <label className="block text-sm font-bold text-slate-500">من تاريخ</label>
              <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 tabular-nums focus:outline-primary-500" />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="block text-sm font-bold text-slate-500">إلى تاريخ</label>
              <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 tabular-nums focus:outline-primary-500" />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="block text-sm font-bold text-slate-500">الترتيب حسب</label>
              <div className="flex bg-slate-100 rounded-xl p-1">
                {([['qty', 'الكمية'], ['revenue', 'قيمة المبيعات']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setSortBy(k)}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition cursor-pointer border-none ${sortBy === k ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2 md:col-span-3 space-y-1">
              <label className="block text-sm font-bold text-slate-500">بحث</label>
              <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث باسم المادة…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-primary-500" />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-slate-500 font-bold text-center py-6">لا مبيعات مسجّلة ضمن هذه المدة</p>
          ) : (
            <>
              <p className="text-xs text-slate-500 font-bold tabular-nums">
                {fmtNum(rows.length)} مادة مباعة · {fmtNum(totalQty)} قطعة · {fmtNum(totalRevenue)} د.ع
                {matched.length > TOP_SELLERS_LIMIT && <> — يُعرض أعلى {TOP_SELLERS_LIMIT}؛ استخدم البحث للوصول لغيرها</>}
              </p>
              <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pl-1">
                {visible.map(r => {
                  const stock = r.med?.availableQuantity;
                  // أيام التغطية = الرصيد ÷ معدل البيع اليومي في المدى المحدَّد
                  const cover = stock != null && periodDays ? Math.floor(stock / (r.qty / periodDays)) : null;
                  const low = stock != null && (stock <= 0 || (cover != null && cover < LOW_COVER_DAYS));
                  return (
                    <div key={r.key} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                      <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums ${r.rank <= 3 ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                        {r.rank}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.med?.nameAr || r.name}</p>
                        <div className="h-1 bg-slate-200/70 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full" style={{ width: `${((sortBy === 'qty' ? r.qty : r.revenue) / maxValue) * 100}%` }} />
                        </div>
                        <p className="text-xs font-bold text-slate-500 tabular-nums">
                          {fmtNum(r.invoices)} فاتورة
                          {stock == null ? ' · غير موجودة بالمخزن حالياً' : (
                            <> · بالمخزن: <span className={low ? 'text-danger-600' : ''}>{stock <= 0 ? 'نافد' : fmtNum(stock)}</span>
                              {stock > 0 && cover != null && <> · <span className={low ? 'text-warn-700' : ''}>يكفي نحو {fmtNum(cover)} يوماً</span></>}
                            </>
                          )}
                        </p>
                      </div>
                      {low && r.med && (
                        <button
                          type="button"
                          onClick={() => { addToPurchaseDraft(r.med!); toast(`أُضيفت «${r.med!.nameAr}» إلى مسودة الشراء`); }}
                          className="shrink-0 text-xs bg-primary-50 hover:bg-primary-100 active:bg-primary-200 text-primary-800 font-bold px-2.5 py-1 rounded-lg transition border border-primary-100 cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>للطلب</span>
                        </button>
                      )}
                      <div className="shrink-0 text-left">
                        <strong className="block text-sm font-bold text-slate-900 tabular-nums">{fmtNum(r.qty)} <span className="text-xs text-slate-500">قطعة</span></strong>
                        <span className="block text-xs font-bold text-slate-500 tabular-nums">{fmtNum(r.revenue)} د.ع</span>
                      </div>
                    </div>
                  );
                })}
                {visible.length === 0 && (
                  <p className="text-xs text-slate-500 font-bold text-center py-6">لا نتائج مطابقة للبحث</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
