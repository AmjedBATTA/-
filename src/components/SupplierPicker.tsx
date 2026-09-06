import { useState } from 'react';
import type { Supplier } from '../types';

// قيمة خاصة في القائمة المنسدلة تعني «اكتب اسم مورد جديد»
const NEW_SENTINEL = '__new__';

interface Props {
  suppliers: Supplier[];
  value: string;                       // اسم المورد المختار (فارغ = لم يُختر بعد)
  onChange: (name: string) => void;
  selectClassName?: string;
  inputClassName?: string;
}

/**
 * منتقي مورّد موحّد: قائمة منسدلة بالموردين المحفوظين في التطبيق،
 * وخيار «مورد جديد…» يفتح حقل كتابة. الاسم الجديد يُحفظ كمورد عند الاعتماد
 * (مسؤولية الأب) — هنا فقط نختار أو نكتب.
 */
export default function SupplierPicker({ suppliers, value, onChange, selectClassName, inputClassName }: Props) {
  const isSaved = value !== '' && suppliers.some(s => s.name === value);
  // وضع الكتابة يبقى مفتوحاً إن اختار المستخدم «جديد» أو كانت القيمة اسماً غير محفوظ
  const [newMode, setNewMode] = useState(value !== '' && !isSaved);
  const showInput = newMode || (value !== '' && !isSaved);

  return (
    <div className="space-y-1.5">
      <select
        value={showInput ? NEW_SENTINEL : value}
        onChange={(e) => {
          if (e.target.value === NEW_SENTINEL) { setNewMode(true); onChange(''); return; }
          setNewMode(false);
          onChange(e.target.value);
        }}
        className={selectClassName || 'w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700'}
      >
        <option value="">— اختر المورد —</option>
        {suppliers.map(s => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
        <option value={NEW_SENTINEL}>+ مورد جديد…</option>
      </select>
      {showInput && (
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName || 'w-full bg-white border border-primary-300 rounded-lg p-2 text-xs font-bold text-slate-700'}
          placeholder="اكتب اسم المورد الجديد — سيُحفظ في قائمة الموردين"
        />
      )}
    </div>
  );
}
