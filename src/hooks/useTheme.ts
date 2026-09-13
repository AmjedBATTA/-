import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'anwar-theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* localStorage غير متاح (وضع خاص) */ }
  return 'system';
}

export function applyThemeClass(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#0B1523' : '#0F766E');
}

// يُستخدم داخل React ولمرة واحدة أثناء الإقلاع في index.html (نسخة مطابقة هناك لمنع وميض اللون الخاطئ)
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [isDark, setIsDark] = useState<boolean>(() => mode === 'dark' || (mode === 'system' && systemPrefersDark()));

  useEffect(() => {
    applyThemeClass(mode);
    setIsDark(mode === 'dark' || (mode === 'system' && systemPrefersDark()));
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { applyThemeClass('system'); setIsDark(systemPrefersDark()); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* تجاهل */ }
  }, []);

  const toggle = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  return { mode, isDark, setMode, toggle };
}
