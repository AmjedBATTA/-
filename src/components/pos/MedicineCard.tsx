import React from 'react';
import type { Medicine } from '../../types';
import { fmtNum } from '../../utils/format';

// =========================================================
// MEDICINE CARD — مكوّن معزول بـ React.memo لرف POS
// السبب: كل إضافة لسلة كانت تُعيد تصيير كلّ بطاقة دواء لأنها
// داخل Dashboard. باستخراجها، تتجمّد البطاقات ما دامت props ثابتة
// (filteredPOSMeds + addToCart مستقران عند تغيّر السلة فقط).
// =========================================================
interface MedicineCardProps {
  med: Medicine;
  showVirtualPrice: boolean;
  showCost: boolean; // إخفاء الكلفة ونسبة الربح عن دور الكاشير — الكاشير لا يحتاج قرار الشراء
  daysUntilExpiry: number;   // محسوب مسبقاً في الأب — لا استدعاء دالة داخل المكوّن
  onAdd: (med: Medicine) => void;
}

export const MedicineCard = React.memo(({ med, showVirtualPrice, showCost, daysUntilExpiry, onAdd }: MedicineCardProps) => {
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
          ? 'bg-danger-50/70 border-danger-200 hover:border-danger-400 hover:shadow-md shadow-sm'
          : 'bg-white border-slate-200 hover:border-primary-400 hover:shadow-md shadow-sm'
      }`}
    >
      {/* Status badge */}
      <div className="flex justify-between items-start gap-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          isOut ? 'bg-danger-100 text-danger-700'
            : isLow ? 'bg-warn-100 text-warn-700'
            : 'bg-primary-50 text-primary-700'
        }`}>
          {isOut ? 'نفذ' : isLow ? 'حرج' : '✓'}
        </span>
        {isExpiringSoon && (
          <span className="text-xs bg-danger-600 text-white px-1.5 py-0.5 rounded-full font-bold">منتهٍ قريباً</span>
        )}
        <span className="text-xs tabular-nums font-bold text-slate-500 mr-auto">{med.availableQuantity}</span>
      </div>

      {/* Name */}
      <div>
        <h4 className="font-semibold text-slate-900 text-xs leading-snug line-clamp-2">{med.nameAr}</h4>
        <p className="text-xs text-slate-500 tabular-nums truncate mt-0.5">{med.nameEn}</p>
      </div>

      {/* Prices — وضع «الرسمي»: الرسمي وحده بخط واضح، وتُخفى «بيع» و«شراء» ونسبة الربح
          (شاشة تواجه الزبون — لا تكشف السعر الداخلي ولا الكلفة، كما في السلة) */}
      <div className="border-t border-slate-100 pt-2 flex justify-between items-end">
        {showVirtualPrice ? (
          <span className="text-base font-bold tabular-nums block text-special-700">
            {fmtNum(officialPrice)}
            <span className="text-xs font-bold text-special-400 mr-0.5">د.ع</span>
          </span>
        ) : (
          <>
            <div className="space-y-0.5">
              <span className="text-sm font-bold tabular-nums block text-primary-700">
                {fmtNum(med.price)}
                <span className="text-xs font-bold text-slate-500 mr-0.5">د.ع</span>
              </span>
              {showCost && med.costPrice && med.costPrice > 0 && (
                <span className="text-xs text-slate-500 tabular-nums block">
                  شراء: <span className="text-slate-500 font-bold">{fmtNum(med.costPrice)}</span>
                </span>
              )}
            </div>
            {showCost && margin !== null && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                margin >= 20 ? 'bg-primary-50 text-primary-700'
                  : margin >= 10 ? 'bg-warn-50 text-warn-700'
                  : 'bg-danger-50 text-danger-700'
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
