/**
 * HTTP-обработчики API приложения.
 *
 * Контракт (раздел 11 ТЗ):
 *   GET  /api/health
 *   GET  /api/users?selectableAsResponsible=true
 *   GET  /api/clients?search=...&page=1&pageSize=50
 *   POST /api/clients
 *
 * Значения `id`, `created_at`, `updated_at` задаёт сервер; клиент их не передаёт.
 * Внутренние ошибки базы наружу не выводятся.
 */

import { getDb } from './db.mjs';
import {
  createClient,
  findCreationRequest,
  isResponsibleSelectable,
  listAllClients,
  listUsers,
} from './repository.mjs';
import { filterClients, normalizeQuery, paginate } from './search.mjs';
import { validateClientPayload } from './validation.mjs';

/** Ограничение размера тела запроса. */
const MAX_BODY_BYTES = 64 * 1024;

/** Ошибка с HTTP-статусом и, при необходимости, ошибками полей. */
export class HttpError extends Error {
  constructor(status, message, fieldErrors = null) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(res, error) {
  if (error instanceof HttpError) {
    const payload = { error: { message: error.message } };
    if (error.fieldErrors) {
      payload.error.code = 'VALIDATION';
      payload.error.fieldErrors = error.fieldErrors;
    }
    sendJson(res, error.status, payload);
    return;
  }
  // Технические детали остаются на сервере.
  console.error('[api] внутренняя ошибка:', error);
  sendJson(res, 500, { error: { message: 'Внутренняя ошибка сервера' } });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Слишком большой запрос');
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'Некорректный JSON в запросе');
  }
}

function handleListUsers(url, res) {
  const onlySelectable = url.searchParams.get('selectableAsResponsible') !== 'false';
  sendJson(res, 200, { items: listUsers({ onlySelectable }) });
}

function handleListClients(url, res) {
  const { tokens } = normalizeQuery(url.searchParams.get('search') ?? '');
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '50', 10);

  // Поиск применяется ко всему набору клиентов, затем выполняется пагинация.
  const matched = filterClients(listAllClients(), tokens);
  sendJson(res, 200, paginate(matched, page, pageSize));
}

async function handleCreateClient(req, res) {
  const body = await readJsonBody(req);

  const headerKey = req.headers['idempotency-key'];
  const idempotencyKey =
    (typeof headerKey === 'string' && headerKey.trim() !== '' ? headerKey.trim() : null) ??
    (typeof body.idempotency_key === 'string' && body.idempotency_key.trim() !== ''
      ? body.idempotency_key.trim()
      : null);

  // Повтор того же запроса возвращает ранее созданную запись без новой вставки.
  if (idempotencyKey) {
    const existing = findCreationRequest(idempotencyKey);
    if (existing) {
      sendJson(res, 201, JSON.parse(existing.response_json), { 'Idempotent-Replay': 'true' });
      return;
    }
  }

  const validation = validateClientPayload(body, { isResponsibleSelectable });
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  const client = createClient(validation.data, idempotencyKey);
  sendJson(res, 201, client);
}

/**
 * Обрабатывает запрос к API.
 * @returns {Promise<boolean>} true, если запрос относится к API
 */
export async function handleApiRequest(req, res, url) {
  const { pathname } = url;
  if (!pathname.startsWith('/api/')) return false;

  try {
    if (pathname === '/api/health') {
      getDb();
      sendJson(res, 200, { status: 'ok' });
      return true;
    }
    if (pathname === '/api/users' && req.method === 'GET') {
      handleListUsers(url, res);
      return true;
    }
    if (pathname === '/api/clients' && req.method === 'GET') {
      handleListClients(url, res);
      return true;
    }
    if (pathname === '/api/clients' && req.method === 'POST') {
      await handleCreateClient(req, res);
      return true;
    }
    throw new HttpError(404, 'Метод API не найден');
  } catch (error) {
    sendError(res, error);
    return true;
  }
}
