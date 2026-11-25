/**
 * Отдача собранного приложения (каталог dist) и fallback на index.html
 * для клиентских маршрутов SPA.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function contentType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function sendFile(res, filePath, status = 200) {
  const stats = statSync(filePath);
  res.writeHead(status, {
    'Content-Type': contentType(filePath),
    'Content-Length': stats.size,
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
}

/**
 * Создаёт обработчик статики.
 * @param {string} rootDir каталог сборки (обычно dist)
 * @returns {(pathname: string, res: import('node:http').ServerResponse) => boolean}
 */
export function createStaticHandler(rootDir) {
  const root = resolve(rootDir);
  const rootLower = root.toLowerCase() + sep;

  return function serveStatic(pathname, res) {
    let relative;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      return false;
    }

    const candidate = resolve(join(root, normalize(relative).replace(/^[\\/]+/, '')));
    // Защита от выхода за пределы каталога сборки.
    const insideRoot = candidate.toLowerCase().startsWith(rootLower);

    if (insideRoot && existsSync(candidate) && statSync(candidate).isFile()) {
      sendFile(res, candidate);
      return true;
    }

    // SPA: любой неизвестный путь отдаёт index.html.
    const fallback = join(root, 'index.html');
    if (existsSync(fallback)) {
      sendFile(res, fallback, 200);
      return true;
    }
    return false;
  };
}
