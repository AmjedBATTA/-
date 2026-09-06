/// <reference types="vite/client" />
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * حاجز أخطاء React — يمنع تحوّل الأخطاء غير المتوقعة إلى شاشة بيضاء كاملة.
 * يعرض رسالة عربية بسيطة بدلاً من تفريغ الشجرة بالكامل.
 */
export default class ErrorBoundary extends Component<Props, State> {
  // تهيئة الحالة كحقل صريح لتجنب مشكلات useDefineForClassFields: false
  override state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message ?? String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] خطأ غير متوقع في واجهة التطبيق:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 p-8 text-right"
        >
          {/* أيقونة تنبيه */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>

          {/* النص */}
          <div className="max-w-md space-y-2 text-center">
            <h1 className="text-xl font-bold text-slate-800">حدث خطأ غير متوقع</h1>
            <p className="text-slate-500 text-sm">
              تعذّر تحميل واجهة التطبيق. تحقق من اتصالك بالإنترنت أو إعدادات Firebase، ثم أعِد المحاولة.
            </p>
            {import.meta.env.DEV && (
              <pre className="mt-3 rounded bg-slate-100 p-3 text-right text-xs text-red-600 whitespace-pre-wrap break-all">
                {this.state.errorMessage}
              </pre>
            )}
          </div>

          {/* زر إعادة التحميل */}
          <button
            onClick={this.handleReload}
            className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
