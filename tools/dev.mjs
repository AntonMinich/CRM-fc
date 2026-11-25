/**
 * Режим разработки: API-сервер и dev-сервер Vite в одном процессе.
 * Запуск: npm run dev
 *
 * Vite отдаёт приложение на http://localhost:5173 и проксирует /api
 * на API-сервер (server.proxy в vite.config.ts).
 */

import { createServer as createViteServer } from 'vite';

import { startAppServer } from '../server/index.mjs';

const API_PORT = Number(process.env.API_PORT ?? 3001);

const api = await startAppServer({ port: API_PORT, staticDir: null });
console.log(`API доступен на ${api.url}/api`);

const vite = await createViteServer({});
await vite.listen();
vite.printUrls();

async function shutdown() {
  await vite.close();
  await api.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
