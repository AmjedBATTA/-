import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import {Capacitor} from '@capacitor/core';
import App from './App.tsx';
import './index.css';

// داخل تطبيق أندرويد الأصيل الملفات محلية أصلاً، وservice worker قد يقدّم
// نسخة قديمة بعد تحديث التطبيق — لذا نسجّله في نسخة الويب/PWA فقط.
if (!Capacitor.isNativePlatform()) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('pwa:needsRefresh', { detail: () => updateSW(true) }));
    },
    onOfflineReady() {
      console.log('[PWA] جاهز للعمل بدون إنترنت');
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
