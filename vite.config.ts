import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Оболочка Fincode: SPA с маршрутами /crm/* и /service-desk.
// И vite dev, и сервер приложения (server/index.mjs) отдают index.html для
// любого пути (appType: 'spa'), поэтому прямые ссылки и обновление страницы
// работают без дополнительной настройки.
export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    port: 5173,
    open: true,
    // Запросы к API уходят на сервер приложения (запускается вместе с dev).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});

