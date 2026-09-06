import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Medicine } from '../../types';
import type { POSItem } from '../dashboard/shared';

// =========================================================
// CART ITEM ROW — مكوّن معزول بـ React.memo لصفوف السلة
// السبب: إضافة عنصر N كانت تُعيد تصيير الصفوف 1..N-1 لأن
// updateCartQty / removeFromCart لم تكن مستقرّة (closure على
// currentCart). بعد تحويلهما إلى useCallback مع functional update،
// هويتهما ثابتة → React.memo يُوقف إعادة التصيير غير الضرورية.
// =========================================================
interface CartItemRowProps {
  item: POSItem;
  showVirtualPrice: boolean;
  onInc: (medId: string) => void;
  onDec: (medId: string) => void;
  onRemove: (medId: string) => void;
  onAddShortage: (med: Medicine) => void; // نقر مزدوج على اسم العنصر = إضافته لقائمة نواقص الأدوية
  onAddToCalculator?: (amount: number) => void; // موجودة فقط والحاسبة مفتوحة — زر إجمالي السطر أعلى يسار الصف
  soldToday: number; // ما بيع من هذه المادة اليوم في سجل المبيعات (يُعرض على صفوف النافذة/بلا رصيد)
  onSetPrice: (medId: string, price: number | null) => void; // سعر مخصّص للسطر (null = العودة لسعر المخزون)
}

export const CartItemRow = React.memo(({ item, showVirtualPrice, onInc, onDec, onRemove, onAddShortage, onAddToCalculator, soldToday, onSetPrice }: CartItemRowProps) => {
  // السعر المُحاسَب دائماً هو الجمهوري — «الرسمي» للعرض فقط ولا يدخل في المحاسبة.
  // وضع «السعر الرسمي» مفعّلاً: يُعرض الرسمي وحده (سعراً وإجمالياً) ويُخفى الجمهوري
  // و«الشراء» — شاشة تواجه الزبون، لا تكشف السعر الداخلي ولا الكلفة.
  const unitPrice = item.medicine.price;
  const officialPrice = item.medicine.secondaryPrice || (item.medicine.price + 500);
  // السعر المخصّص للسطر (إن حُدّد بنقرة على السعر) يتقدّم على الجمهوري والرسمي معاً — هو ما سيُباع به فعلاً
  const shownUnit = item.customPrice ?? (showVirtualPrice ? officialPrice : unitPrice);
  // سعر الشراء للعرض: التكلفة المتوسطة وإلا آخر سعر شراء (لا يُكشف في وضع «الرسمي»)
  const costUnit = item.medicine.costPrice || item.medicine.lastCostPrice || 0;
  // تعديل السعر داخل الصف: نقرة على السعر تفتح حقلاً صغيراً؛ Enter/الخروج يعتمد، Escape يلغي
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const commitPrice = () => {
    if (editingPrice === null) return;
    const v = Math.round(Number(editingPrice));
    onSetPrice(item.medicine.id, v > 0 && v !== item.medicine.price ? v : null);
    setEditingPrice(null);
  };

  // مادة نافذة (رصيد صفر): سطر تذكير أحمر باهت — اسم + سعر بلا شطب، بلا أزرار كمية،
  // غير محتسب في الإجمالي ولا يُخصم من المخزون. زر الحذف فقط. المسح الثاني يحوّله لبيع فعلي.
  // صف مضغوط: هدفه إظهار خمسة أصناف على الأقل دفعة واحدة داخل حاوية السلة بلا تمرير —
  // سطران فقط لكل صنف (اسم+شارات، ثم سعر×عدد+إجمالي)، أزرار أصغر، بلا فراغات زائدة.
  if (item.outOfStock) {
    return (
      <div className="bg-rose-950/40 border border-rose-900/50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 select-none cursor-pointer"
          onDoubleClick={() => onAddShortage(item.medicine)}
          title="نقرة مزدوجة: إضافة إلى نواقص الأدوية — مسح الباركود مرة ثانية: بيع برصيد صفر">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-extrabold text-rose-200 text-xs truncate">{item.medicine.nameAr}</span>
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-rose-900/60 text-rose-300 shrink-0">نفذ</span>
            {soldToday > 0 && (
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-900/50 text-amber-300 shrink-0">مبيع اليوم: {soldToday}</span>
            )}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] text-rose-300/80 font-mono font-bold">{shownUnit.toLocaleString()} د.ع</span>
            {!showVirtualPrice && costUnit > 0 && (
              <span className="text-[10px] text-rose-300/60 font-mono">شراء: {costUnit.toLocaleString()}</span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => onRemove(item.medicine.id)}
          className="w-7 h-7 text-rose-700 hover:text-rose-300 flex items-center justify-center cursor-pointer transition shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const shownTotal = shownUnit * item.quantity;

  return (
    <div className={`relative border rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${item.zeroStock ? 'bg-rose-950/50 border-rose-800/60' : 'bg-slate-800 border-slate-700'}`}>
      {/* إضافة إجمالي هذا السطر للحاسبة — تظهر فقط والحاسبة مفتوحة */}
      {onAddToCalculator && (
        <button type="button" onClick={() => onAddToCalculator(shownTotal)}
          title="أضف إجمالي هذه المادة للحاسبة"
          className="absolute top-1 left-1 w-4 h-4 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded flex items-center justify-center text-[10px] font-black leading-none cursor-pointer transition z-10">
          +
        </button>
      )}
      <div className="flex-1 min-w-0 select-none cursor-pointer"
        onDoubleClick={() => onAddShortage(item.medicine)}
        title="نقرة مزدوجة: إضافة إلى نواقص الأدوية">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className={`font-extrabold text-xs truncate ${item.zeroStock ? 'text-rose-100' : 'text-white'}`}>{item.medicine.nameAr}</span>
          {item.customPrice !== undefined && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-sky-900/60 text-sky-300 shrink-0" title={`سعر المخزون ${item.medicine.price.toLocaleString()} د.ع`}>سعر مخصّص</span>
          )}
          {/* بيع برصيد صفر: شارة تنبيه + مجموع ما بيع منها اليوم (السجل + هذه السلة) */}
          {item.zeroStock && (
            <>
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-rose-900/60 text-rose-300 shrink-0">بيع بلا رصيد</span>
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-900/50 text-amber-300 shrink-0">مبيع اليوم: {soldToday + item.quantity}</span>
            </>
          )}
        </div>
        {/* وضع «الرسمي»: الإجمالي الرسمي وحده بلا أي تفاصيل (سعر وحدة/عدد/شراء) — شاشة
            نظيفة تواجه الزبون. الوضع العادي: سعر الوحدة × العدد + الشراء على سطر واحد، والإجمالي بجانبها. */}
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <span className="text-[10px] text-slate-400 font-mono">
            {editingPrice !== null ? (
              // حقل السعر المخصّص — يوقف النقر المزدوج للنواقص كي لا يتداخل مع التحرير
              <input
                type="number" min={0} step={250} autoFocus value={editingPrice}
                onClick={e => e.stopPropagation()}
                onChange={e => setEditingPrice(e.target.value)}
                onBlur={commitPrice}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitPrice(); } else if (e.key === 'Escape') setEditingPrice(null); }}
                className="w-20 bg-white text-slate-900 font-mono font-bold text-xs rounded-md px-1.5 py-0.5 border border-sky-400 focus:outline-sky-500"
                title="سعر الوحدة لهذا السطر — Enter للاعتماد، Escape للإلغاء، صفر أو نفس سعر المخزون يعيد الأصل"
              />
            ) : !showVirtualPrice ? (
              <>
                <button type="button"
                  onClick={e => { e.stopPropagation(); setEditingPrice(String(shownUnit)); }}
                  title="انقر لبيع هذا السطر بسعر آخر"
                  className={`font-bold cursor-pointer border-b border-dashed hover:text-white transition ${item.customPrice !== undefined ? 'text-sky-300 border-sky-500' : 'text-emerald-400 border-emerald-700'}`}>
                  {shownUnit.toLocaleString()}
                </button>
                {item.customPrice !== undefined && <span className="line-through opacity-60 mr-1">{' '}{unitPrice.toLocaleString()}{' '}</span>}
                <span> × {item.quantity}</span>
                {item.medicine.costPrice ? <span> · شراء {(item.medicine.costPrice * item.quantity).toLocaleString()}</span> : null}
              </>
            ) : null}
          </span>
          {/* في وضع «الرسمي» لا يظهر سعر الوحدة — فالنقر على الإجمالي هو ما يفتح تعديل السعر */}
          <span
            onClick={showVirtualPrice ? (e => { e.stopPropagation(); setEditingPrice(String(shownUnit)); }) : undefined}
            title={showVirtualPrice ? 'انقر لبيع هذا السطر بسعر آخر' : undefined}
            className={`text-base font-mono font-black leading-none ${item.customPrice !== undefined ? 'text-sky-300' : showVirtualPrice ? 'text-purple-400' : 'text-amber-400'} ${showVirtualPrice ? 'cursor-pointer' : ''}`}>
            {shownTotal.toLocaleString()}<span className={`text-[10px] font-bold mr-1 ${item.customPrice !== undefined ? 'text-sky-400/80' : showVirtualPrice ? 'text-purple-400' : 'text-amber-500/80'}`}>د.ع</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={() => onDec(item.medicine.id)}
          className="w-7 h-7 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center justify-center font-bold text-sm cursor-pointer transition">−</button>
        <span className="font-black text-white font-mono w-6 text-center text-sm">{item.quantity}</span>
        <button type="button" onClick={() => onInc(item.medicine.id)}
          className="w-7 h-7 bg-slate-700 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center font-bold text-sm cursor-pointer transition">+</button>
        <button type="button" onClick={() => onRemove(item.medicine.id)}
          className="w-7 h-7 text-slate-600 hover:text-rose-400 flex items-center justify-center cursor-pointer transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});
