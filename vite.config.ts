import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
        manifest: {
          name: 'انوار الحسن - إدارة الصيدلية',
          short_name: 'انوار الحسن',
          description: 'نظام إدارة صيدلية انوار الحسن',
          theme_color: '#0F766E',
          background_color: '#F4F7FA',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          lang: 'ar',
          dir: 'rtl',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    build: {
      // رفع حد التحذير بعد تقسيم الحزم إلى chunks مستقلة
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // تقسيم مكتبات الطرف الثالث الثقيلة إلى chunks منفصلة قابلة للتخزين المؤقت
          // (تُحمَّل بالتوازي وتبقى في الكاش عند تحديث كود التطبيق)
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // كل ما يخص Firebase في حزمة واحدة: firebase و@firebase و@capacitor-firebase،
            // مع مكتبتَي tslib وidb اللتين تعتمد عليهما Firebase — يمنع الحلقة الدائرية بين الحزم
            if (id.includes('firebase') || id.includes('/tslib/') || id.includes('/idb/')) return 'firebase-vendor';
            if (id.includes('/@google/genai')) return 'genai-vendor';
            if (id.includes('/motion') || id.includes('framer-motion')) return 'motion-vendor';
            if (id.includes('/lucide-react/')) return 'icons-vendor';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react-vendor';
            return 'vendor';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
