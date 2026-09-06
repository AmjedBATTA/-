import React from 'react';
import type { Medicine } from '../../types';

// =========================================================
// MEDICINE CARD — مكوّن معزول بـ React.memo لرف POS
// السبب: كل إضافة لسلة كانت تُعيد تصيير كلّ بطاقة دواء لأنها
// داخل Dashboard. باستخراجها، تتجمّد البطاقات ما دامت props ثابتة
// (filteredPOSMeds + addToCart مستقران عند تغيّر السلة فقط).
// =========================================================
interface MedicineCardProps {
  med: Medicine;
  showVirtualPrice: boolean;
  daysUntilExpiry: number;   // محسوب مسبقاً في الأب — لا استدعاء دالة داخل المكوّن
  onAdd: (med: Medicine) => void;
}

export const MedicineCard = React.memo(({ med, showVirtualPrice, daysUntilExpiry, onAdd }: MedicineCardProps) => {
  const isLow = med.availableQuantity < 15;
  const isOut = med.availableQuantity <= 0;
  const isExpiringSoon = daysUntilExpiry <= 30;
  // السعر المُحاسَب دائماً هو الجمهوري (med.price) — «الرسمي» يظهر كمعلومة مرجعية فقط
  // ولا يدخل في سعر السطر أو الإجمالي (كان يحلّ محلّ السعر فتناقض الشاشةُ الفاتورة)
  const officialPrice = med.secondaryPrice || (med.price + 500);
  const margin = med.costPrice && med.costPrice > 0 && med.price > 0
    ? Math.round(((med.price - med.costPrice) / med.price) * 100)
    : null;

  return (
    <div
      onClick={() => onAdd(med)}
      className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-2 relative cursor-pointer active:scale-[0.98] ${
        isOut
          ? 'bg-rose-50/70 border-rose-200 hover:border-rose-400 hover:shadow-md shadow-sm'
          : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md shadow-sm'
      }`}
    >
      {/* Status badge */}
      <div className="flex justify-between items-start gap-1">
        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${
          isOut ? 'bg-rose-100 text-rose-700'
            : isLow ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-50 text-emerald-700'
        }`}>
          {isOut ? 'نفذ' : isLow ? 'حرج' : '✓'}
        </span>
        {isExpiringSoon && (
          <span className="text-[7px] bg-rose-600 text-white px-1.5 py-0.5 rounded-full font-bold">منتهٍ قريباً</span>
        )}
        <span className="text-[9px] font-mono font-bold text-slate-400 mr-auto">{med.availableQuantity}</span>
      </div>

      {/* Name */}
      <div>
        <h4 className="font-extrabold text-slate-900 text-xs leading-snug line-clamp-2">{med.nameAr}</h4>
        <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{med.nameEn}</p>
      </div>

      {/* Prices — وضع «الرسمي»: الرسمي وحده بخط واضح، وتُخفى «بيع» و«شراء» ونسبة الربح
          (شاشة تواجه الزبون — لا تكشف السعر الداخلي ولا الكلفة، كما في السلة) */}
      <div className="border-t border-slate-100 pt-2 flex justify-between items-end">
        {showVirtualPrice ? (
          <span className="text-base font-black font-mono block text-purple-700">
            {officialPrice.toLocaleString()}
            <span className="text-[9px] font-bold text-purple-400 mr-0.5">د.ع</span>
          </span>
        ) : (
          <>
            <div className="space-y-0.5">
              <span className="text-sm font-black font-mono block text-emerald-700">
                {med.price.toLocaleString()}
                <span className="text-[9px] font-bold text-slate-400 mr-0.5">د.ع</span>
              </span>
              {med.costPrice && med.costPrice > 0 && (
                <span className="text-[9px] text-slate-400 font-mono block">
                  شراء: <span className="text-slate-500 font-bold">{med.costPrice.toLocaleString()}</span>
                </span>
              )}
            </div>
            {margin !== null && (
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                margin >= 20 ? 'bg-emerald-50 text-emerald-700'
                  : margin >= 10 ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
              }`}>
                {margin}%
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
});
