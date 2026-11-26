/**
 * HTTP-обработчики API приложения.
 *
 * Контракт (раздел 11 ТЗ на клиентов и раздел 9 ТЗ на редактирование):
 *   GET   /api/health
 *   GET   /api/users?selectableAsResponsible=true
 *   GET   /api/clients?search=...&page=1&pageSize=50
 *   POST  /api/clients
 *   GET   /api/clients/phone-check?phone=...&excludeId=...
 *   GET   /api/clients/{id}
 *   PATCH /api/clients/{id}
 *
 * Значения `id`, `created_at`, `updated_at` задаёт сервер; клиент их не передаёт.
 * Внутренние ошибки базы наружу не выводятся.
 */

import { getDb } from './db.mjs';
import {
  createClient,
  findClientByPhone,
  findCreationRequest,
  findUpdateRequest,
  getClientById,
  isResponsibleSelectable,
  listAllClients,
  listUsers,
  updateClient,
} from './repository.mjs';
import { filterClients, paginate, parseQuery } from './search.mjs';
import { validateClientPayload } from './validation.mjs';

/** Ограничение размера тела запроса. */
const MAX_BODY_BYTES = 64 * 1024;

/** Путь карточки клиента: /api/clients/{id}. */
const CLIENT_ITEM_PATTERN = /^\/api\/clients\/([^/]+)$/;


/** Ошибка с HTTP-статусом, ошибками полей и дополнительными данными ответа. */
export class HttpError extends Error {
  constructor(status, message, fieldErrors = null, extra = null) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.extra = extra;
  }
}

/**
 * Дубль телефона: 409 с кодом `duplicate_phone` и данными найденного клиента.
 * Возвращаются только идентификатор и части ФИО — остальные поля не раскрываются.
 */
function duplicatePhoneError(duplicate) {
  return new HttpError(409, 'Клиент с таким номером уже создан', null, {
    code: 'duplicate_phone',
    client: {
      id: duplicate.id,
      last_name: duplicate.last_name ?? null,
      first_name: duplicate.first_name,
      middle_name: duplicate.middle_name ?? null,
    },
  });
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
    const payload = { error: { message: error.message, ...(error.extra ?? {}) } };
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
  const query = parseQuery(url.searchParams.get('search') ?? '');
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '50', 10);

  // Поиск (ФИО или телефон) применяется ко всему набору клиентов, затем пагинация.
  const matched = filterClients(listAllClients(), query);
  sendJson(res, 200, paginate(matched, page, pageSize));
}

/** Ключ идемпотентности из заголовка или тела запроса. */
function readIdempotencyKey(req, body) {
  const headerKey = req.headers['idempotency-key'];
  if (typeof headerKey === 'string' && headerKey.trim() !== '') return headerKey.trim();
  if (typeof body.idempotency_key === 'string' && body.idempotency_key.trim() !== '') {
    return body.idempotency_key.trim();
  }
  return null;
}

async function handleCreateClient(req, res) {
  const body = await readJsonBody(req);
  const idempotencyKey = readIdempotencyKey(req, body);

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

  const result = createClient(validation.data, idempotencyKey);
  if (result.status === 'duplicate') {
    throw duplicatePhoneError(result.duplicate);
  }
  sendJson(res, 201, result.client);
}

/**
 * Проверка телефона на дубль для живой подсказки в форме.
 * Отдаёт только идентификатор и части ФИО найденного клиента.
 */
function handlePhoneCheck(url, res) {
  const phone = url.searchParams.get('phone') ?? '';
  const excludeRaw = url.searchParams.get('excludeId') ?? '';
  const excludeId = excludeRaw.trim() === '' ? null : excludeRaw.trim();
  sendJson(res, 200, { duplicate: findClientByPhone(phone, excludeId) });
}

/** Карточка клиента для формы редактирования. */
function handleGetClient(id, res) {
  const client = getClientById(id);
  if (!client) {
    throw new HttpError(404, 'Клиент не найден');
  }
  sendJson(res, 200, client);
}

async function handleUpdateClient(req, res, id) {
  const body = await readJsonBody(req);
  const idempotencyKey = readIdempotencyKey(req, body);

  // Повтор того же запроса не выполняет обновление второй раз.
  if (idempotencyKey) {
    const existing = findUpdateRequest(idempotencyKey);
    if (existing) {
      sendJson(res, 200, JSON.parse(existing.response_json), { 'Idempotent-Replay': 'true' });
      return;
    }
  }

  const validation = validateClientPayload(body, { isResponsibleSelectable });
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  // Без значения updated_at нельзя отличить актуальную карточку от устаревшей.
  const expectedRaw = body.expected_updated_at;
  const expectedUpdatedAt = typeof expectedRaw === 'string' ? expectedRaw.trim() : '';
  if (expectedUpdatedAt === '') {
    throw new HttpError(422, 'Не передано значение updated_at');
  }

  const result = updateClient(id, validation.data, { idempotencyKey, expectedUpdatedAt });

  if (result.status === 'not_found') {
    throw new HttpError(404, 'Клиент не найден');
  }
  if (result.status === 'conflict') {
    throw new HttpError(409, 'Карточка была изменена другим пользователем. Обновите данные.');
  }
  if (result.status === 'duplicate') {
    throw duplicatePhoneError(result.duplicate);
  }

  sendJson(res, 200, result.client);
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
    // Регистрируется до шаблона /api/clients/{id}, иначе путь приняли бы за id.
    if (pathname === '/api/clients/phone-check' && req.method === 'GET') {
      handlePhoneCheck(url, res);
      return true;
    }

    const clientMatch = CLIENT_ITEM_PATTERN.exec(pathname);
    if (clientMatch) {
      const id = decodeURIComponent(clientMatch[1]);
      if (req.method === 'GET') {
        handleGetClient(id, res);
        return true;
      }
      if (req.method === 'PATCH') {
        await handleUpdateClient(req, res, id);
        return true;
      }
    }

    throw new HttpError(404, 'Метод API не найден');
  } catch (error) {
    sendError(res, error);
    return true;
  }
}
