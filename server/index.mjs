/**
 * Сервер приложения: API клиентов и пользователей, раздача собранного SPA.
 *
 * Запуск: node server/index.mjs
 * Переменные окружения:
 *   PORT        — порт (по умолчанию 4173)
 *   HOST        — интерфейс (по умолчанию 127.0.0.1)
 *   FINCODE_DB  — путь к файлу базы (по умолчанию data/fincode.db)
 *   STATIC_DIR  — каталог сборки для раздачи (по умолчанию dist)
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleApiRequest } from './api.mjs';
import { closeDb, getDbPath, runMigrations } from './db.mjs';
import { createStaticHandler } from './static.mjs';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SERVER_DIR, '..');

/**
 * Создаёт HTTP-сервер приложения.
 * @param {{ staticDir?: string | null }} options
 */
export async function createAppServer({ staticDir = join(PROJECT_ROOT, 'dist') } = {}) {
  const applied = runMigrations();
  const serveStatic =
    staticDir && existsSync(join(staticDir, 'index.html')) ? createStaticHandler(staticDir) : null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      const parsed = new URL(url.href);
      void handleApiRequest(req, res, parsed).catch((error) => {
        console.error('[server] необработанная ошибка API:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        res.end(JSON.stringify({ error: { message: 'Внутренняя ошибка сервера' } }));
      });
      return;
    }

    if (serveStatic && (req.method === 'GET' || req.method === 'HEAD')) {
      if (serveStatic(url.pathname, res)) return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Не найдено');
  });

  server.appliedMigrations = applied;
  return server;
}

/**
 * Запускает сервер и возвращает объект с адресом и функцией остановки.
 * @param {{ port?: number, host?: string, staticDir?: string | null }} options
 */
export async function startAppServer(options = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 4173);
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const staticDir =
    options.staticDir ?? process.env.STATIC_DIR ?? join(PROJECT_ROOT, 'dist');

  const server = await createAppServer({ staticDir });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, resolveListen);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    appliedMigrations: server.appliedMigrations ?? [],
    async close() {
      await new Promise((resolveClose) => server.close(resolveClose));
      closeDb();
    },
  };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const { url, appliedMigrations } = await startAppServer();
  console.log(`Fincode: сервер запущен на ${url}`);
  console.log(`База данных: ${getDbPath()}`);
  console.log(
    appliedMigrations.length > 0
      ? `Применены миграции: ${appliedMigrations.join(', ')}`
      : 'Миграции уже применены.',
  );
}
