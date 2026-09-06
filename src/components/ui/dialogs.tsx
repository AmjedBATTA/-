import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/**
 * نوافذ التطبيق الداخلية بدل نوافذ المتصفح الأصلية (alert / confirm / prompt).
 *
 * لماذا؟ نافذة المتصفح تجمّد الواجهة، لا يمكن تنسيقها، تظهر بعنوان «localhost يقول»،
 * وفي WebView أندرويد تبدو مختلفة وتقطع مسح الباركود.
 *
 * الاستخدام من أي مكان (حتى خارج المكوّنات):
 *   toast('تم الحفظ', 'success');
 *   if (!(await confirmDialog({ title: 'حذف المورد؟', danger: true }))) return;
 *   const pin = await promptDialog({ title: 'كلمة مرور الحسابات', password: true });
 * ويُركَّب <DialogHost /> مرة واحدة في App.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export interface ToastItem { id: number; message: string; kind: ToastKind }

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** فعل مدمِّر (حذف/استبدال) → زر أحمر */
  danger?: boolean;
  /** نافذة معلومات فقط: بلا زر إلغاء */
  hideCancel?: boolean;
}
export interface PromptOptions extends Omit<ConfirmOptions, 'danger'> {
  password?: boolean;
  placeholder?: string;
}

type Modal =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (value: string | null) => void };

interface DialogState { toasts: ToastItem[]; modal: Modal | null }

let state: DialogState = { toasts: [], modal: null };
const listeners = new Set<() => void>();
let nextId = 1;

function setState(patch: Partial<DialogState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
function getSnapshot() { return state; }

/** إشعار خفيف أسفل الشاشة يختفي وحده (الأخطاء تبقى أطول). */
export function toast(message: string, kind: ToastKind = 'info', durationMs?: number) {
  const id = nextId++;
  setState({ toasts: [...state.toasts, { id, message, kind }] });
  const ttl = durationMs ?? (kind === 'error' ? 6500 : kind === 'warning' ? 5000 : 3500);
  window.setTimeout(() => dismissToast(id), ttl);
  return id;
}
export function dismissToast(id: number) {
  if (!state.toasts.some((t) => t.id === id)) return;
  setState({ toasts: state.toasts.filter((t) => t.id !== id) });
}

/** نافذة تأكيد داخل التطبيق — تُرجع true عند الموافقة. */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { title: opts } : opts;
  return new Promise((resolve) => {
    // إن كانت نافذة أخرى مفتوحة نُغلقها بالرفض حتى لا تتراكم
    if (state.modal) closeModal(null);
    setState({ modal: { kind: 'confirm', opts: o, resolve } });
  });
}

/** نافذة إدخال (نص أو كلمة مرور) — تُرجع null عند الإلغاء. */
export function promptDialog(opts: PromptOptions | string): Promise<string | null> {
  const o = typeof opts === 'string' ? { title: opts } : opts;
  return new Promise((resolve) => {
    if (state.modal) closeModal(null);
    setState({ modal: { kind: 'prompt', opts: o, resolve } });
  });
}

/** نافذة معلومات (بديل alert للرسائل الطويلة) — تُغلق بزر «حسناً». */
export function alertDialog(title: string, message?: string): Promise<void> {
  return confirmDialog({ title, message, confirmText: 'حسناً', hideCancel: true }).then(() => undefined);
}

/** هل توجد نافذة حوار مفتوحة الآن؟ (لمنع اختصارات لوحة المفاتيح من التداخل) */
export function isDialogOpen() { return !!state.modal; }

function closeModal(result: boolean | string | null) {
  const m = state.modal;
  if (!m) return;
  setState({ modal: null });
  if (m.kind === 'confirm') m.resolve(result === true);
  else m.resolve(typeof result === 'string' ? result : null);
}

const TOAST_STYLE: Record<ToastKind, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'bg-money-600 text-white', Icon: CheckCircle2 },
  error:   { cls: 'bg-danger text-white', Icon: XCircle },
  warning: { cls: 'bg-warn text-white', Icon: AlertTriangle },
  info:    { cls: 'bg-ink text-white', Icon: Info },
};

export default function DialogHost() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <>
      {/* الإشعارات */}
      <div className="fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {snap.toasts.map((t) => {
          const { cls, Icon } = TOAST_STYLE[t.kind];
          return (
            <div key={t.id} role="status"
              className={`pointer-events-auto max-w-md w-full sm:w-auto sm:min-w-72 flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-semibold leading-relaxed whitespace-pre-line ${cls}`}>
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="flex-1">{t.message}</span>
              <button type="button" onClick={() => dismissToast(t.id)} aria-label="إغلاق"
                className="shrink-0 -m-1 p-1 rounded-md opacity-80 hover:opacity-100 hover:bg-white/15 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {snap.modal && <ModalView modal={snap.modal} />}
    </>
  );
}

function ModalView({ modal }: { modal: Modal }) {
  const [value, setValue] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPrompt = modal.kind === 'prompt';
  const opts = modal.opts;
  const danger = modal.kind === 'confirm' && modal.opts.danger;

  useEffect(() => {
    (isPrompt ? inputRef.current : confirmRef.current)?.focus();
    // في طور الالتقاط: نمنع وصول أي مفتاح إلى اختصارات التطبيق (F9 إتمام البيع، Esc مسح السلة…)
    // ما دامت النافذة مفتوحة، مع إبقاء السلوك الافتراضي (الكتابة، Tab، Enter لإرسال النموذج).
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); closeModal(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isPrompt]);

  const submit = () => closeModal(isPrompt ? value : true);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-ink/50" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(null); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="dlg-title"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-line p-5 space-y-4 text-right">
        <div className="flex items-start gap-3">
          {danger ? <AlertTriangle className="w-6 h-6 text-danger shrink-0" /> : <Info className="w-6 h-6 text-primary-600 shrink-0" />}
          <div className="flex-1 min-w-0 space-y-1">
            <h2 id="dlg-title" className="text-base font-bold text-ink leading-snug">{opts.title}</h2>
            {opts.message && <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-line">{opts.message}</p>}
          </div>
        </div>
        {isPrompt && (
          <input ref={inputRef} type={modal.opts.password ? 'password' : 'text'} value={value}
            onChange={(e) => setValue(e.target.value)} placeholder={modal.opts.placeholder}
            inputMode={modal.opts.password ? 'numeric' : undefined} autoComplete="off"
            className={`w-full h-11 px-3 rounded-lg border border-line bg-white text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 ${modal.opts.password ? 'text-center tracking-[0.4em]' : ''}`} />
        )}
        <div className="flex gap-2 justify-start flex-row-reverse">
          <button ref={confirmRef} type="submit"
            className={`flex-1 h-11 rounded-lg font-bold text-sm text-white transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 ${danger ? 'bg-danger hover:bg-red-800 focus:ring-danger-line' : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-200'}`}>
            {opts.confirmText ?? 'موافق'}
          </button>
          {!opts.hideCancel && (
            <button type="button" onClick={() => closeModal(null)}
              className="flex-1 h-11 rounded-lg font-semibold text-sm text-ink-2 bg-slate-100 hover:bg-slate-200 border border-line transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-200">
              {opts.cancelText ?? 'إلغاء'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
