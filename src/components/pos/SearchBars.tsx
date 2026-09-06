import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Search, Barcode, X } from 'lucide-react';

// =========================================================
// POS SEARCH BAR — مكوّن معزول بحالة محلية
// السبب: حقل بحث POS كان داخل مكوّن Dashboard العملاق (آلاف الأسطر)، فكل ضغطة
// مفتاح كانت تُعيد تصيير الشجرة كاملةً = بطء محسوس. بعزله، الكتابة تُحدّث هذا
// المكوّن الصغير فقط، ويُبلّغ الأب بالقيمة المُلتزَمة بعد debounce (150ms) فقط.
// =========================================================
export type POSSearchHandle = { setValue: (v: string) => void; focus: () => void };

interface POSSearchBarProps {
  onQueryChange: (q: string) => void;   // تُستدعى بالقيمة المؤجّلة (debounced) لفلترة الرف
  onEnter: (value: string) => boolean;  // عند Enter/الباركود — ترجع true إذا طوبقت مادة (لتفريغ الحقل)
  onScanClick: () => void;              // فتح قارئ الباركود بالكاميرا
}

export const POSSearchBar = forwardRef<POSSearchHandle, POSSearchBarProps>(
  ({ onQueryChange, onEnter, onScanClick }, ref) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // debounce: تأخير الفلترة 150ms بعد آخر ضغطة — يمنع إعادة تصيير الأب لكل حرف
    useEffect(() => {
      const t = setTimeout(() => onQueryChange(input), 150);
      return () => clearTimeout(t);
    }, [input, onQueryChange]);

    // يسمح لقارئ الباركود (في الأب) بدفع قيمة ممسوحة إلى الحقل مباشرةً
    useImperativeHandle(ref, () => ({
      setValue: (v: string) => { setInput(v); onQueryChange(v); },
      focus: () => inputRef.current?.focus(),
    }), [onQueryChange]);

    return (
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="relative flex-1 sm:flex-initial">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => { setInput(''); onQueryChange(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (onEnter(input)) { setInput(''); onQueryChange(''); }
              }
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-[11px] text-xs text-slate-800 placeholder:text-slate-500 focus:outline-primary-500 w-full sm:w-[27rem]"
            placeholder="امسح الباركود أو اكتب الاسم ثم Enter..."
          />
        </div>
        <button
          type="button"
          onClick={onScanClick}
          className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          title="قراءة الباركود بالكاميرا (Scan Barcode)"
        >
          <Barcode className="w-3.5 h-3.5" />
          <span className="hidden md:inline">قارئ باركود</span>
        </button>
      </div>
    );
  }
);

// =========================================================
// INVENTORY SEARCH BAR — معزول بنفس نمط POSSearchBar
// السبب: كتابة البحث في المخزون كانت تُعيد تصيير كامل شجرة Dashboard
// (7500 سطر) مع كل ضغطة. بعزله محلياً + debounce، لا يتأثر الأب إلا
// بالقيمة المُلتزَمة كل 150ms فقط.
// =========================================================
interface InventorySearchBarProps {
  onQueryChange: (q: string) => void;
}
export const InventorySearchBar = forwardRef<POSSearchHandle, InventorySearchBarProps>(
  ({ onQueryChange }, ref) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      const t = setTimeout(() => onQueryChange(input), 150);
      return () => clearTimeout(t);
    }, [input, onQueryChange]);
    useImperativeHandle(ref, () => ({
      setValue: (v: string) => { setInput(v); onQueryChange(v); },
      focus: () => inputRef.current?.focus(),
    }), [onQueryChange]);
    return (
      <div className="relative flex-1 min-w-[180px]">
        <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { setInput(''); onQueryChange(''); }}
          className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-8 py-2 text-xs text-slate-800 placeholder:text-slate-500 focus:outline-primary-500 font-medium"
          placeholder="بحث بالاسم أو الباركود أو الفئة..."
        />
        {input && (
          <button
            type="button"
            onClick={() => { setInput(''); onQueryChange(''); }}
            className="absolute left-2.5 top-2 text-slate-500 hover:text-rose-600 transition cursor-pointer"
            title="مسح البحث"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }
);
