import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, RefreshCw, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => void) | null>(null);

  // Listen for install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Listen for SW update events from main.tsx
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<() => void>).detail;
      setUpdateSW(() => detail);
      setShowUpdate(true);
    };
    window.addEventListener('pwa:needsRefresh', handler);
    return () => window.removeEventListener('pwa:needsRefresh', handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstallEvent(null);
    setShowInstall(false);
  };

  const handleUpdate = () => {
    updateSW?.();
    setShowUpdate(false);
  };

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          key="update"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="bg-white border border-emerald-200 rounded-2xl shadow-2xl shadow-emerald-100 p-4 flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <RefreshCw size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 text-right">تحديث جديد متاح</p>
              <p className="text-xs text-slate-500 text-right">أعِد التحميل لتفعيل التحديث</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleUpdate}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                تحديث
              </button>
              <button
                onClick={() => setShowUpdate(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {showInstall && !showUpdate && (
        <motion.div
          key="install"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-100 p-4">
            <button
              onClick={() => setShowInstall(false)}
              className="absolute top-3 left-3 p-1 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Smartphone size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 text-right">ثبِّت التطبيق</p>
                <p className="text-xs text-slate-500 text-right">انوار الحسن — إدارة الصيدلية</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-right mb-3 leading-relaxed">
              ثبِّت التطبيق على جهازك للوصول السريع والعمل بدون اتصال بالإنترنت
            </p>
            <button
              onClick={handleInstall}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Download size={16} />
              تثبيت التطبيق
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
