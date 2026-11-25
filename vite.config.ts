import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Оболочка Fincode: SPA с маршрутами /crm и /service-desk.
// И vite dev, и vite preview отдают index.html для любого пути (appType: 'spa'),
// поэтому прямые ссылки и обновление страницы работают без дополнительной настройки.
export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    port: 5173,
    open: true,
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
