import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import {Capacitor} from '@capacitor/core';
import App from './App.tsx';
// الخط مضمَّن محلياً (woff2 داخل الحزمة) ليعمل في APK بلا إنترنت من أول تشغيل
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
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
