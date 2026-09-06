import React, { useState, useReducer, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, Calculator as CalculatorIcon } from 'lucide-react';
import { fmtNum } from '../../utils/format';

// =========================================================
// CALCULATOR — لوحة حساب سريعة بجانب سلة البيع، بنفس نمط عزل POSSearchBar
// (forwardRef + memo): حالتها الداخلية (الشاشة، العامل المعلَّق) لا تُعيد تصيير
// Dashboard مع كل ضغطة، وأزرار «أضف للحاسبة» في صفوف السلة تدفع قيماً إليها
// عبر الـ ref مباشرة (pushValue) دون أي اتصال ذهاباً وإياباً عبر حالة الأب.
// =========================================================
export type CalculatorHandle = { pushValue: (n: number) => void };

type CalcOp = '÷' | '×' | '−' | '+';

// تقريب النتائج لست خانات عشرية فتختفي ذيول الفاصلة العائمة
// (0.1 + 0.2 = 0.30000000000000004) دون المساس بمبالغ الدنانير الصحيحة.
const roundCalc = (n: number) => Math.round(n * 1e6) / 1e6;
const CALC_MAX_DIGITS = 15; // أقصى خانات يُقبل إدخالها — بعدها تُتجاهل الضغطات بدل قصّ الشاشة بصمت
const CALC_ERROR = 'خطأ';

// القسمة على صفر تُعيد NaN فيُعرض «خطأ» بدل صفر صامت مضلِّل
function calcApply(a: number, b: number, op: CalcOp): number {
  switch (op) {
    case '÷': return b === 0 ? NaN : roundCalc(a / b);
    case '×': return roundCalc(a * b);
    case '−': return roundCalc(a - b);
    case '+': return roundCalc(a + b);
  }
}

// يعرض الرقم بفواصل الآلاف وأرقام لاتينية (fmtNum الموحّد في كل مبالغ التطبيق)
// مع الحفاظ على نقطة عشرية قيد الكتابة كما هي بدل حذفها.
function formatCalcDisplay(s: string): string {
  if (s.endsWith('.')) return fmtNum(Number(s.slice(0, -1))) + '.';
  const n = Number(s);
  return Number.isFinite(n) ? fmtNum(n, 6) : s;
}

// حالة الحاسبة كاملةً في مُخفِّض واحد: كل ضغطة (زر، مفتاح، أو قيمة مدفوعة من السلة) تُطبَّق
// على أحدث حالة بالترتيب مهما تسارعت — لا اعتماد على إغلاقات (closures) قد تكون قديمة.
interface CalcState {
  display: string;
  prevValue: number | null;
  pendingOp: CalcOp | null;
  overwrite: boolean;
  // شريط التعبير الحي: كل الأرقام والعوامل المُدخَلة بالترتيب («1,000 + 2,000 ×») حتى «=» —
  // فتكون الحاسبة شاشة تُظهر تفاصيل الجمع والضرب لا رقماً وحيداً ميتاً.
  tokens: string[];
}
type CalcAction =
  | { type: 'digit'; d: string }
  | { type: 'dot' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'sign' }
  | { type: 'percent' }
  | { type: 'op'; op: CalcOp | null }
  | { type: 'round'; step: number }
  | { type: 'push'; n: number };

const CALC_INITIAL: CalcState = { display: '0', prevValue: null, pendingOp: null, overwrite: true, tokens: [] };

// ينهي السلسلة بنتيجة: يُثبّت التعبير («… =») ويعرض الناتج أو «خطأ» إن كانت القسمة على صفر
function calcFinish(nextTokens: string[], result: number): CalcState {
  return {
    tokens: [...nextTokens, '='],
    display: Number.isFinite(result) ? String(result) : CALC_ERROR,
    prevValue: null, pendingOp: null, overwrite: true,
  };
}

function calcReducer(s: CalcState, a: CalcAction): CalcState {
  const finished = s.tokens[s.tokens.length - 1] === '=';
  const isError = s.display === CALC_ERROR;
  // بعد «=» أو «خطأ» أي رقم جديد يبدأ عملية جديدة نظيفة
  const fresh: CalcState = (finished || isError) ? { ...s, tokens: [], prevValue: null, pendingOp: null, overwrite: true } : s;

  switch (a.type) {
    case 'clear':
      return CALC_INITIAL;
    case 'digit': {
      const startNew = fresh !== s || s.overwrite || s.display === '0';
      if (!startNew && s.display.replace(/[^0-9]/g, '').length >= CALC_MAX_DIGITS) return s;
      return { ...fresh, display: startNew ? a.d : s.display + a.d, overwrite: false };
    }
    case 'dot': {
      const startNew = fresh !== s || s.overwrite;
      return { ...fresh, display: startNew ? '0.' : (s.display.includes('.') ? s.display : s.display + '.'), overwrite: false };
    }
    case 'backspace': {
      if (isError) return CALC_INITIAL;
      if (s.overwrite) return s; // النتيجة أو الرقم المؤكَّد لا يُقصّ خانةً خانة — AC لمسحه
      const d = s.display;
      return { ...s, display: (d.length <= 1 || (d.length === 2 && d.startsWith('-'))) ? '0' : d.slice(0, -1) };
    }
    case 'sign':
      if (isError || Number(s.display) === 0) return s;
      return { ...s, display: String(-Number(s.display)) };
    case 'percent':
      if (isError) return s;
      return { ...s, display: String(roundCalc(Number(s.display) / 100)) };
    case 'op': {
      // زر عامل (÷ × − +) أو = (op=null): يُتمّ أي عملية معلَّقة أولاً، ثم يبدأ عاملاً جديداً أو ينهي بلا عامل
      if (isError) return CALC_INITIAL;
      const current = Number(s.display);
      const cur = formatCalcDisplay(s.display);
      if (s.pendingOp && !s.overwrite) {
        const result = calcApply(s.prevValue ?? current, current, s.pendingOp);
        if (!a.op || !Number.isFinite(result)) return calcFinish([...s.tokens, cur], result);
        return { tokens: [...s.tokens, cur, a.op], display: String(result), prevValue: result, pendingOp: a.op, overwrite: true };
      }
      if (s.pendingOp && s.overwrite) {
        // تغيير العامل قبل إدخال الرقم الثاني: يُستبدل آخر عامل في الشريط
        if (!a.op) return s;
        return { ...s, tokens: [...s.tokens.slice(0, -1), a.op], pendingOp: a.op };
      }
      // لا عملية معلَّقة: الرقم الحالي (أو ناتج سابق) يبدأ سلسلة جديدة
      if (!a.op) return calcFinish([cur], current);
      return { tokens: [cur, a.op], display: s.display, prevValue: current, pendingOp: a.op, overwrite: true };
    }
    case 'round': {
      // تقريب الناتج لأقرب مضاعف للعملة (250 / 500 د.ع) — يظهر في الشريط كخطوة موثَّقة
      if (isError) return s;
      const n = Number(s.display);
      return calcFinish([formatCalcDisplay(s.display), `≈${a.step}`], Math.round(n / a.step) * a.step);
    }
    case 'push': {
      // قيمة مدفوعة من صف السلة: الأولى تُعرض مباشرة؛ أي لاحقة تُتمّ عاملاً معلَّقاً إن وُجد،
      // وإلا تُجمَع تلقائياً مع الناتج الحالي — فتظهر النتيجة فوراً كما طلب المستخدم.
      const fmtN = formatCalcDisplay(String(a.n));
      if (isError) return { ...CALC_INITIAL, display: String(a.n) };
      if (s.pendingOp && s.overwrite) {
        return calcFinish([...s.tokens, fmtN], calcApply(s.prevValue ?? Number(s.display), a.n, s.pendingOp));
      }
      if (s.display === '0' && s.prevValue === null) return { ...CALC_INITIAL, display: String(a.n) };
      const cur = formatCalcDisplay(s.display);
      const base = finished ? [cur] : [...(s.pendingOp ? s.tokens : []), cur];
      return calcFinish([...base, '+', fmtN], roundCalc(Number(s.display) + a.n));
    }
  }
}

interface CalculatorProps {
  onClose: () => void;
  // مقبض السحب: يُلصق بصف العنوان فقط (لا بالأزرار) — يُمرَّر من الغلاف المتحرّك DraggableCalculator
  dragHandleProps?: { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void };
}

export const Calculator = React.memo(forwardRef<CalculatorHandle, CalculatorProps>(({ onClose, dragHandleProps }, ref) => {
  const [st, dispatch] = useReducer(calcReducer, CALC_INITIAL);
  const [copied, setCopied] = useState(false);
  const isError = st.display === CALC_ERROR;

  useImperativeHandle(ref, () => ({ pushValue: (n: number) => dispatch({ type: 'push', n }) }), []);

  const copyResult = () => {
    if (isError) return;
    navigator.clipboard?.writeText(String(Number(st.display))).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  // لوحة المفاتيح: أرقام وعوامل و Enter و Backspace و Escape — تُتجاهل حين يكون التركيز داخل أي
  // حقل إدخال (بحث نقطة البيع، الباركود…) كي لا تسرق الحاسبة الكتابة.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) dispatch({ type: 'digit', d: k });
      else if (k === '.' || k === ',') dispatch({ type: 'dot' });
      else if (k === '+') dispatch({ type: 'op', op: '+' });
      else if (k === '-') dispatch({ type: 'op', op: '−' });
      else if (k === '*' || k === '×') dispatch({ type: 'op', op: '×' });
      else if (k === '/' || k === '÷') dispatch({ type: 'op', op: '÷' });
      else if (k === 'Enter' || k === '=') dispatch({ type: 'op', op: null });
      else if (k === 'Backspace') dispatch({ type: 'backspace' });
      else if (k === 'Escape' || k === 'Delete') dispatch({ type: 'clear' });
      else if (k === '%') dispatch({ type: 'percent' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shown = formatCalcDisplay(st.display);
  // الخط يصغر تلقائياً مع طول الرقم بدل قصّ الخانات بصمت
  const displaySize = shown.length > 18 ? 'text-sm' : shown.length > 12 ? 'text-base' : 'text-xl';
  const expr = st.tokens.join(' ');

  const base = 'h-11 sm:h-9 rounded-xl text-sm font-bold flex items-center justify-center transition cursor-pointer select-none';
  const digitCls = `${base} bg-slate-800 text-white hover:bg-slate-700`;
  const funcCls = `${base} bg-slate-700 text-white hover:bg-slate-600`;
  const utilCls = `${base} h-8 sm:h-7 text-sm bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white`;
  // زر العامل المعلَّق يُضاء ليعرف المستخدم ما الذي ينتظره
  const opCls = (op: CalcOp) => `${base} ${st.pendingOp === op && st.overwrite
    ? 'bg-white text-primary-700 ring-2 ring-primary-400'
    : 'bg-primary-600 text-white hover:bg-primary-500'}`;
  const digit = (d: string) => () => dispatch({ type: 'digit', d });
  const op = (o: CalcOp | null) => () => dispatch({ type: 'op', op: o });

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 space-y-2" role="application" aria-label="حاسبة سريعة">
      {/* صف العنوان هو مقبض السحب: اسحبه لتحريك اللوحة، أزرار الأرقام نفسها لا تتأثّر */}
      <div className="flex items-center justify-between px-1 -m-1 p-1 rounded-lg touch-none"
        style={{ cursor: dragHandleProps ? 'grab' : undefined }}
        {...(dragHandleProps || {})}>
        <span className="text-sm font-bold text-slate-500 select-none">⠿ حاسبة سريعة</span>
        <button type="button" onClick={onClose} title="إغلاق الحاسبة" aria-label="إغلاق الحاسبة"
          className="text-slate-500 hover:text-rose-400 transition cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* شاشة العرض: شريط التعبير الحي فوق الناتج */}
      <div className="text-left px-1 pb-1 overflow-hidden" dir="ltr">
        <div className="tabular-nums text-sm text-slate-500 min-h-[16px] truncate" title={expr} aria-live="polite">
          {expr || ' '}
        </div>
        <span className={`tabular-nums font-bold ${isError ? 'text-rose-400' : 'text-white'} ${displaySize} truncate block`} aria-live="polite">{shown}</span>
      </div>
      {/* صف الأدوات: مسح خانة، تقريب للعملة، نسخ */}
      <div className="grid grid-cols-4 gap-1.5" dir="ltr">
        <button type="button" onClick={() => dispatch({ type: 'backspace' })} className={utilCls} aria-label="مسح آخر خانة" title="مسح آخر خانة (Backspace)">⌫</button>
        <button type="button" onClick={() => dispatch({ type: 'round', step: 250 })} className={utilCls} aria-label="تقريب لأقرب 250 دينار" title="تقريب لأقرب 250 د.ع">≈250</button>
        <button type="button" onClick={() => dispatch({ type: 'round', step: 500 })} className={utilCls} aria-label="تقريب لأقرب 500 دينار" title="تقريب لأقرب 500 د.ع">≈500</button>
        <button type="button" onClick={copyResult} className={`${utilCls} ${copied ? 'text-primary-400' : ''}`} aria-label="نسخ الناتج" title="نسخ الناتج">{copied ? '✓' : 'نسخ'}</button>
      </div>
      <div className="grid grid-cols-4 gap-1.5" dir="ltr">
        <button type="button" onClick={() => dispatch({ type: 'clear' })} className={`${funcCls} bg-rose-900/60 hover:bg-rose-800/70 text-rose-200`} aria-label="مسح الكل" title="مسح الكل (Escape)">AC</button>
        <button type="button" onClick={() => dispatch({ type: 'sign' })} className={funcCls} aria-label="عكس الإشارة">+/−</button>
        <button type="button" onClick={() => dispatch({ type: 'percent' })} className={funcCls} aria-label="نسبة مئوية">%</button>
        <button type="button" onClick={op('÷')} className={opCls('÷')} aria-label="قسمة">÷</button>

        {['7', '8', '9'].map(d => <button key={d} type="button" onClick={digit(d)} className={digitCls}>{d}</button>)}
        <button type="button" onClick={op('×')} className={opCls('×')} aria-label="ضرب">×</button>

        {['4', '5', '6'].map(d => <button key={d} type="button" onClick={digit(d)} className={digitCls}>{d}</button>)}
        <button type="button" onClick={op('−')} className={opCls('−')} aria-label="طرح">−</button>

        {['1', '2', '3'].map(d => <button key={d} type="button" onClick={digit(d)} className={digitCls}>{d}</button>)}
        <button type="button" onClick={op('+')} className={opCls('+')} aria-label="جمع">+</button>

        <button type="button" onClick={digit('0')} className={`${digitCls} col-span-2`}>0</button>
        <button type="button" onClick={() => dispatch({ type: 'dot' })} className={digitCls} aria-label="فاصلة عشرية">.</button>
        <button type="button" onClick={op(null)} className={`${base} bg-primary-700 text-white hover:bg-primary-600`} aria-label="يساوي" title="يساوي (Enter)">=</button>
      </div>
    </div>
  );
}));

// =========================================================

// DRAGGABLE CALCULATOR WRAPPER — يحافظ على مكانها الثابت الافتراضي (أعلى يمين الشاشة، حيث
// كانت مثبَّتة سابقاً بـ top-24 right-3/6) لكن يسمح بسحبها بالماوس أو اللمس لأي مكان، ويتذكّر
// آخر موضع محلياً (localStorage) بمعزل عن Dashboard — السحب المتكرر (setState لكل حركة فأرة) لا
// يُعيد تصيير الشجرة العملاقة كلها، بل هذا المكوّن الصغير فقط (مثل عزل POSSearchBar/Calculator).
// =========================================================
const CALC_POS_KEY = 'anwar_calc_pos';
type CalcPos = { top: number; right: number };

function loadCalcPos(): CalcPos {
  try {
    const raw = localStorage.getItem(CALC_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.top === 'number' && typeof p?.right === 'number') return p;
    }
  } catch {}
  // الموضع الافتراضي الثابت — نفس مكانها القديم (top-24 right-3 على الجوال، right-6 على الشاشات الأوسع)
  return { top: 96, right: typeof window !== 'undefined' && window.innerWidth >= 640 ? 24 : 12 };
}

function clampCalcPos(p: CalcPos): CalcPos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    top: Math.min(Math.max(8, p.top), h - 48),
    right: Math.min(Math.max(8, p.right), w - 48),
  };
}

interface DraggableCalculatorProps { show: boolean; onShowChange: (v: boolean) => void }

export const DraggableCalculator = React.memo(forwardRef<CalculatorHandle, DraggableCalculatorProps>(({ show, onShowChange }, ref) => {
  const [pos, setPos] = useState<CalcPos>(loadCalcPos);
  const [dragging, setDragging] = useState(false);
  // إحداثيات بداية السحب — في ref لا حالة، فتتبّع الحركة لا يُعيد التصيير إلا عند فعلاً تغيّر الموضع
  const dragRef = useRef<{ startX: number; startY: number; origin: CalcPos; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    // dx موجب (سحب يميناً) يُقرِّب العنصر من الحافة اليمنى فيُنقص right، والعكس بالعكس
    setPos(clampCalcPos({ top: d.origin.top + dy, right: d.origin.right - dx }));
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    setDragging(false);
    dragRef.current = null;
    if (d?.moved) {
      setPos(p => { try { localStorage.setItem(CALC_POS_KEY, JSON.stringify(p)); } catch {} return p; });
    } else if (!show) {
      // نقرة بلا سحب على الأيقونة المصغَّرة = فتح الحاسبة
      onShowChange(true);
    }
  };
  const dragHandlers = { onPointerDown, onPointerMove, onPointerUp };

  return (
    <div className="fixed z-40" style={{ top: pos.top, right: pos.right }}>
      {show ? (
        <div className="w-60">
          <Calculator ref={ref} onClose={() => onShowChange(false)} dragHandleProps={dragHandlers} />
        </div>
      ) : (
        <button type="button" title="حاسبة سريعة — اسحبها لتغيير مكانها" aria-label="حاسبة سريعة"
          className={`w-11 h-11 bg-slate-900 border border-slate-700 rounded-2xl shadow-lg flex items-center justify-center text-slate-300 hover:text-primary-400 hover:border-primary-500 transition touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          {...dragHandlers}>
          <CalculatorIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}));
