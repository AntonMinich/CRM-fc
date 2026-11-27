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
 *   GET   /api/suppliers?search=...&page=1&pageSize=50
 *   POST  /api/suppliers
 *   GET   /api/suppliers/unp-check?unp=...&excludeId=...
 *   GET   /api/suppliers/phone-check?phone=...&excludeId=...
 *   GET   /api/suppliers/{id}
 *   PATCH /api/suppliers/{id}
 *   GET   /api/suppliers/{id}/contacts
 *   POST  /api/suppliers/{id}/contacts
 *   PATCH /api/supplier-contacts/{id}
 *   GET   /api/clients/{id}/interactions?status=all|planned|overdue|done
 *   GET   /api/suppliers/{id}/interactions?status=...
 *   POST  /api/interactions
 *   GET   /api/interactions/{id}
 *   PATCH /api/interactions/{id}
 *   POST  /api/interactions/{id}/reschedule
 *   POST  /api/interactions/{id}/result
 *   POST  /api/interactions/{id}/cancel
 *   GET   /api/interactions/reminders
 *   POST  /api/interactions/{id}/reminder
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
import {
  createSupplier,
  findCreationRequest as findSupplierCreationRequest,
  findSupplierByUnp,
  findSuppliersByPhone,
  findUpdateRequest as findSupplierUpdateRequest,
  getSupplierById,
  listAllSuppliers,
  updateSupplier,
} from './suppliersRepository.mjs';
import { filterSuppliers, parseSupplierQuery } from './suppliersSearch.mjs';
import { validateSupplierPayload } from './suppliersValidation.mjs';
import {
  cancelInteraction,
  completeInteraction,
  completeWithoutPlan,
  createPlannedInteraction,
  dismissReminder,
  getCurrentUserId,
  getInteractionById,
  listAllInteractions,
  listDueReminders,
  listInteractions,
  listReschedules,
  markReminderShown,
  rescheduleInteraction,
  updatePlan,
  updateResult,
} from './interactionsRepository.mjs';
import {
  validateCancelPayload,
  validatePlanPayload,
  validateReschedulePayload,
  validateResultPayload,
} from './interactionsValidation.mjs';
import {
  createSupplierContact,
  listSupplierContacts,
  updateSupplierContact,
} from './supplierContactsRepository.mjs';
import { validateContactPayload } from './supplierContactsValidation.mjs';
import { validateClientPayload } from './validation.mjs';

/** Ограничение размера тела запроса. */
const MAX_BODY_BYTES = 64 * 1024;

/** Путь карточки клиента: /api/clients/{id}. */
const CLIENT_ITEM_PATTERN = /^\/api\/clients\/([^/]+)$/;

/** Путь карточки поставщика: /api/suppliers/{id}. */
const SUPPLIER_ITEM_PATTERN = /^\/api\/suppliers\/([^/]+)$/;

/** Путь контактов поставщика: /api/suppliers/{id}/contacts. */
const SUPPLIER_CONTACTS_PATTERN = /^\/api\/suppliers\/([^/]+)\/contacts$/;

/** Путь карточки контакта: /api/supplier-contacts/{id}. */
const SUPPLIER_CONTACT_ITEM_PATTERN = /^\/api\/supplier-contacts\/([^/]+)$/;

/** Взаимодействия владельца: /api/clients/{id}/interactions или поставщика. */
const CLIENT_INTERACTIONS_PATTERN = /^\/api\/clients\/([^/]+)\/interactions$/;
const SUPPLIER_INTERACTIONS_PATTERN = /^\/api\/suppliers\/([^/]+)\/interactions$/;

/** Запись взаимодействия: /api/interactions/{id}. */
const INTERACTION_ITEM_PATTERN = /^\/api\/interactions\/([^/]+)$/;

/** Действие над взаимодействием: перенос, результат, отмена, напоминание. */
const INTERACTION_ACTION_PATTERN = /^\/api\/interactions\/([^/]+)\/(reschedule|result|cancel|reminder)$/;


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
 * Дубль УНП у поставщика: 409 с кодом `duplicate_unp` и наименованием найденной
 * записи. Возвращаются только идентификатор и наименование.
 */
function duplicateSupplierUnpError(duplicate) {
  return new HttpError(409, 'Поставщик с таким УНП уже создан', null, {
    code: 'duplicate_unp',
    supplier: { id: duplicate.id, name: duplicate.name },
  });
}

/**
 * Успешный ответ по поставщику: если найдены другие поставщики с таким же
 * телефоном, к объекту добавляется поле `duplicate_phone_with`
 * (до трёх наименований и общее количество). Сохранение при этом не блокируется.
 */
function sendSupplier(res, status, result) {
  const payload = result.duplicatePhoneWith
    ? { ...result.supplier, duplicate_phone_with: result.duplicatePhoneWith }
    : result.supplier;
  sendJson(res, status, payload);
}

function handleListSuppliers(url, res) {
  const query = parseSupplierQuery(url.searchParams.get('search') ?? '');
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '50', 10);

  // Поиск по наименованию применяется ко всему набору, затем пагинация.
  const matched = filterSuppliers(listAllSuppliers(), query);
  sendJson(res, 200, paginate(matched, page, pageSize));
}

async function handleCreateSupplier(req, res) {
  const body = await readJsonBody(req);
  const idempotencyKey = readIdempotencyKey(req, body);

  // Повтор того же запроса возвращает ранее созданную запись без новой вставки.
  if (idempotencyKey) {
    const existing = findSupplierCreationRequest(idempotencyKey);
    if (existing) {
      sendJson(res, 201, JSON.parse(existing.response_json), { 'Idempotent-Replay': 'true' });
      return;
    }
  }

  const validation = validateSupplierPayload(body);
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  const result = createSupplier(validation.data, idempotencyKey);
  if (result.status === 'duplicate_unp') {
    throw duplicateSupplierUnpError(result.duplicate);
  }
  sendSupplier(res, 201, result);
}

/** Карточка поставщика для формы редактирования. */
function handleGetSupplier(id, res) {
  const supplier = getSupplierById(id);
  if (!supplier) {
    throw new HttpError(404, 'Поставщик не найден');
  }
  sendJson(res, 200, supplier);
}

async function handleUpdateSupplier(req, res, id) {
  const body = await readJsonBody(req);
  const idempotencyKey = readIdempotencyKey(req, body);

  // Повтор того же запроса не выполняет обновление второй раз.
  if (idempotencyKey) {
    const existing = findSupplierUpdateRequest(idempotencyKey);
    if (existing) {
      sendJson(res, 200, JSON.parse(existing.response_json), { 'Idempotent-Replay': 'true' });
      return;
    }
  }

  const validation = validateSupplierPayload(body);
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  // Без значения updated_at нельзя отличить актуальную карточку от устаревшей.
  const expectedRaw = body.expected_updated_at;
  const expectedUpdatedAt = typeof expectedRaw === 'string' ? expectedRaw.trim() : '';
  if (expectedUpdatedAt === '') {
    throw new HttpError(422, 'Не передано значение updated_at');
  }

  const result = updateSupplier(id, validation.data, { idempotencyKey, expectedUpdatedAt });

  if (result.status === 'not_found') {
    throw new HttpError(404, 'Поставщик не найден');
  }
  if (result.status === 'conflict') {
    throw new HttpError(409, 'Карточка была изменена другим пользователем. Обновите данные.');
  }
  if (result.status === 'duplicate_unp') {
    throw duplicateSupplierUnpError(result.duplicate);
  }

  sendSupplier(res, 200, result);
}

/** Идентификатор записи, которую исключают из проверки дубля. */
function readExcludeId(url) {
  const raw = url.searchParams.get('excludeId') ?? '';
  return raw.trim() === '' ? null : raw.trim();
}

/** Живая проверка УНП: есть ли другой поставщик с таким же УНП. */
function handleSupplierUnpCheck(url, res) {
  const unp = url.searchParams.get('unp') ?? '';
  sendJson(res, 200, { duplicate: findSupplierByUnp(unp, readExcludeId(url)) });
}

/**
 * Живая проверка телефона: другие поставщики с таким же номером.
 * Сохранение они не блокируют, о них сообщают в форме и в ответе сохранения.
 */
function handleSupplierPhoneCheck(url, res) {
  const phone = url.searchParams.get('phone') ?? '';
  sendJson(res, 200, { duplicates: findSuppliersByPhone(phone, readExcludeId(url)) });
}

/**
 * Контакт с таким телефоном занят: 409 с кодом и только теми данными, которые
 * нужны форме (части имени контакта и/или идентификатор и наименование поставщика).
 */
function duplicateContactPhoneError(contact) {
  return new HttpError(409, 'Контакт с таким телефоном уже есть в списке', null, {
    code: 'duplicate_contact_phone',
    contact: contactNamePayload(contact),
  });
}

function contactWorksElsewhereError(contact, supplier) {
  return new HttpError(409, 'Контакт с таким телефоном уже работает у другого поставщика', null, {
    code: 'contact_works_elsewhere',
    contact: contactNamePayload(contact),
    supplier: supplier ?? null,
  });
}

function contactTransferRequiredError(contact, supplier, contactStatus = null) {
  return new HttpError(409, 'Контакт числится у другого поставщика', null, {
    code: 'contact_transfer_required',
    contact: contactNamePayload(contact),
    supplier: supplier ?? null,
    contact_status: contactStatus ?? null,
  });
}

/** Части имени контакта для сообщений формы. */
function contactNamePayload(contact) {
  return {
    id: contact.id,
    last_name: contact.last_name ?? null,
    first_name: contact.first_name,
    middle_name: contact.middle_name ?? null,
  };
}

/** Список контактов поставщика вместе с их количеством для заголовка вкладки. */
function handleListSupplierContacts(supplierId, res) {
  if (!getSupplierById(supplierId)) {
    throw new HttpError(404, 'Поставщик не найден');
  }
  sendJson(res, 200, listSupplierContacts(supplierId));
}

/** Создание контакта: дубль у своего поставщика блокирует запись, чужой переносится. */
async function handleCreateSupplierContact(req, res, supplierId) {
  const body = await readJsonBody(req);
  if (!getSupplierById(supplierId)) {
    throw new HttpError(404, 'Поставщик не найден');
  }

  const validation = validateContactPayload(body);
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  const confirmTransfer = body.confirm_transfer === true || body.confirm_transfer === 'true';
  const result = createSupplierContact(supplierId, validation.data, { confirmTransfer });

  if (result.status === 'supplier_not_found') {
    throw new HttpError(404, 'Поставщик не найден');
  }
  if (result.status === 'duplicate_contact_phone') {
    throw duplicateContactPhoneError(result.contact);
  }
  if (result.status === 'contact_works_elsewhere') {
    throw contactWorksElsewhereError(result.contact, result.supplier);
  }
  if (result.status === 'contact_transfer_required') {
    throw contactTransferRequiredError(result.contact, result.supplier, result.contactStatus);
  }

  sendJson(res, 201, result.contact);
}

/** Обновление контакта; перенос к другому поставщику здесь не выполняется. */
async function handleUpdateSupplierContact(req, res, contactId) {
  const body = await readJsonBody(req);
  const validation = validateContactPayload(body);
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  const result = updateSupplierContact(contactId, validation.data);

  if (result.status === 'not_found') {
    throw new HttpError(404, 'Контакт не найден');
  }
  if (result.status === 'duplicate_contact_phone') {
    throw duplicateContactPhoneError(result.contact);
  }
  if (result.status === 'contact_works_elsewhere') {
    throw contactWorksElsewhereError(result.contact, result.supplier);
  }
  if (result.status === 'contact_transfer_required') {
    throw contactTransferRequiredError(result.contact, result.supplier);
  }

  sendJson(res, 200, result.contact);
}

/** Владелец взаимодействия: ровно один из client_id или supplier_id. */
function readInteractionOwner(body) {
  const raw = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
  const clientId = raw(body.client_id);
  const supplierId = raw(body.supplier_id);
  if (Boolean(clientId) === Boolean(supplierId)) return null;
  return { clientId, supplierId };
}

/** Владелец записи должен существовать. */
function assertInteractionOwner(owner) {
  if (owner.clientId && !getClientById(owner.clientId)) {
    throw new HttpError(404, 'Клиент не найден');
  }
  if (owner.supplierId && !getSupplierById(owner.supplierId)) {
    throw new HttpError(404, 'Поставщик не найден');
  }
}

/** Ошибки полей серверной проверки. */
function assertValidation(validation) {
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }
}

/** Ответ на действие над взаимодействием: одинаковые коды для всех операций. */
function sendInteractionResult(res, result, statusCode = 200) {
  if (result.status === 'not_found') throw new HttpError(404, 'Взаимодействие не найдено');
  if (result.status === 'invalid_status') {
    throw new HttpError(409, 'Действие доступно только для запланированного взаимодействия');
  }
  if (result.status === 'forbidden') {
    throw new HttpError(
      403,
      'Изменить результат может только автор в течение 24 часов после внесения',
    );
  }
  if (result.status === 'contact_required' || result.status === 'contact_not_found') {
    throw new HttpError(422, 'Проверьте заполнение полей', {
      supplier_contact_id: 'Выберите контактное лицо',
    });
  }
  sendJson(res, statusCode, result.interaction);
}

/** Список взаимодействий клиента или поставщика вместе с числом просроченных. */
function handleListInteractions(ownerType, ownerId, url, res) {
  const exists = ownerType === 'client' ? getClientById(ownerId) : getSupplierById(ownerId);
  if (!exists) {
    throw new HttpError(404, ownerType === 'client' ? 'Клиент не найден' : 'Поставщик не найден');
  }
  const status = url.searchParams.get('status') ?? 'all';
  sendJson(
    res,
    200,
    listInteractions(
      ownerType === 'client' ? { clientId: ownerId, status } : { supplierId: ownerId, status },
    ),
  );
}

/** Запись взаимодействия вместе с историей переносов. */
function handleGetInteraction(id, res) {
  const found = getInteractionById(id);
  if (!found) throw new HttpError(404, 'Взаимодействие не найдено');
  sendJson(res, 200, { ...found.interaction, reschedules: listReschedules(id) });
}

/** Создание: с плановым временем — план, без него — фиксация результата без плана. */
async function handleCreateInteraction(req, res) {
  const body = await readJsonBody(req);
  const owner = readInteractionOwner(body);
  if (!owner) throw new HttpError(422, 'Укажите клиента или поставщика');
  assertInteractionOwner(owner);

  const currentUserId = getCurrentUserId();
  const plannedRaw = body.planned_at;
  const withPlan = typeof plannedRaw === 'string' && plannedRaw.trim() !== '';

  if (withPlan) {
    const validation = validatePlanPayload(body);
    assertValidation(validation);
    if (!isResponsibleSelectable(validation.data.responsible_user_id)) {
      throw new HttpError(422, 'Проверьте заполнение полей', {
        responsible_user_id: 'Выберите ответственного',
      });
    }
    sendInteractionResult(res, createPlannedInteraction(owner, validation.data, currentUserId), 201);
    return;
  }

  const validation = validateResultPayload(body);
  assertValidation(validation);
  sendInteractionResult(res, completeWithoutPlan(owner, validation.data, currentUserId), 201);
}

/** Редактирование: у плана — поля плана, у выполненного — результат. */
async function handleUpdateInteraction(req, res, id) {
  const body = await readJsonBody(req);
  const found = getInteractionById(id);
  if (!found) throw new HttpError(404, 'Взаимодействие не найдено');
  const currentUserId = getCurrentUserId();

  if (found.row.status === 'planned') {
    const validation = validatePlanPayload(body);
    assertValidation(validation);
    if (!isResponsibleSelectable(validation.data.responsible_user_id)) {
      throw new HttpError(422, 'Проверьте заполнение полей', {
        responsible_user_id: 'Выберите ответственного',
      });
    }
    sendInteractionResult(res, updatePlan(id, validation.data, currentUserId));
    return;
  }

  if (found.row.status === 'done') {
    const validation = validateResultPayload(body);
    assertValidation(validation);
    sendInteractionResult(res, updateResult(id, validation.data, currentUserId));
    return;
  }

  // Из «Отменено» назад не возвращаем: запись только для просмотра.
  throw new HttpError(409, 'Отменённое взаимодействие нельзя изменить');
}

/** Перенос: новая дата, причина, напоминание пересчитывается от новой даты. */
async function handleRescheduleInteraction(req, res, id) {
  const body = await readJsonBody(req);
  const validation = validateReschedulePayload(body);
  assertValidation(validation);
  sendInteractionResult(res, rescheduleInteraction(id, validation.data, getCurrentUserId()));
}

/** Внесение результата в запланированное взаимодействие. */
async function handleInteractionResult(req, res, id) {
  const body = await readJsonBody(req);
  const validation = validateResultPayload(body);
  assertValidation(validation);
  sendInteractionResult(res, completeInteraction(id, validation.data, getCurrentUserId()));
}

/** Отмена запланированного взаимодействия. */
async function handleCancelInteraction(req, res, id) {
  const body = await readJsonBody(req);
  const validation = validateCancelPayload(body);
  assertValidation(validation);
  sendInteractionResult(res, cancelInteraction(id, validation.data));
}

/** Общий список взаимодействий клиентов и поставщиков: фильтры, поиск, страницы. */
function handleListAllInteractions(url, res) {
  const params = url.searchParams;
  sendJson(
    res,
    200,
    listAllInteractions({
      status: params.get('status') ?? 'all',
      responsible: params.get('responsible') ?? 'all',
      mine: params.get('mine') === 'true',
      ownerType: params.get('ownerType') ?? 'all',
      dateFrom: params.get('dateFrom'),
      dateTo: params.get('dateTo'),
      search: params.get('search') ?? '',
      page: Number.parseInt(params.get('page') ?? '1', 10),
      pageSize: Number.parseInt(params.get('pageSize') ?? '50', 10),
    }),
  );
}

/** Наступившие напоминания текущего пользователя. */
function handleListReminders(res) {
  const userId = getCurrentUserId();
  sendJson(res, 200, { items: userId ? listDueReminders(userId) : [] });
}

/** Отметка о показе или закрытии напоминания. */
async function handleInteractionReminder(req, res, id) {
  const body = await readJsonBody(req);
  const dismissed = body.dismissed === true || body.dismissed === 'true';
  sendInteractionResult(res, dismissed ? dismissReminder(id) : markReminderShown(id));
}

/** Обрабатывает запрос к API. `true`, если запрос относится к API. */
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

    if (pathname === '/api/suppliers' && req.method === 'GET') {
      handleListSuppliers(url, res);
      return true;
    }
    if (pathname === '/api/suppliers' && req.method === 'POST') {
      await handleCreateSupplier(req, res);
      return true;
    }
    // Проверки дублей регистрируются до шаблона /api/suppliers/{id}.
    if (pathname === '/api/suppliers/unp-check' && req.method === 'GET') {
      handleSupplierUnpCheck(url, res);
      return true;
    }
    if (pathname === '/api/suppliers/phone-check' && req.method === 'GET') {
      handleSupplierPhoneCheck(url, res);
      return true;
    }

    // Контакты поставщика: список и создание. Шаблон со своим сегментом пути.
    const contactsMatch = SUPPLIER_CONTACTS_PATTERN.exec(pathname);
    if (contactsMatch) {
      const supplierId = decodeURIComponent(contactsMatch[1]);
      if (req.method === 'GET') {
        handleListSupplierContacts(supplierId, res);
        return true;
      }
      if (req.method === 'POST') {
        await handleCreateSupplierContact(req, res, supplierId);
        return true;
      }
    }

    const contactMatch = SUPPLIER_CONTACT_ITEM_PATTERN.exec(pathname);
    if (contactMatch && req.method === 'PATCH') {
      await handleUpdateSupplierContact(req, res, decodeURIComponent(contactMatch[1]));
      return true;
    }

    const supplierMatch = SUPPLIER_ITEM_PATTERN.exec(pathname);
    if (supplierMatch) {
      const id = decodeURIComponent(supplierMatch[1]);
      if (req.method === 'GET') {
        handleGetSupplier(id, res);
        return true;
      }
      if (req.method === 'PATCH') {
        await handleUpdateSupplier(req, res, id);
        return true;
      }
    }

    // Напоминания регистрируются до шаблона /api/interactions/{id}.
    if (pathname === '/api/interactions/reminders' && req.method === 'GET') {
      handleListReminders(res);
      return true;
    }

    const interactionActionMatch = INTERACTION_ACTION_PATTERN.exec(pathname);
    if (interactionActionMatch && req.method === 'POST') {
      const id = decodeURIComponent(interactionActionMatch[1]);
      const action = interactionActionMatch[2];
      if (action === 'reschedule') {
        await handleRescheduleInteraction(req, res, id);
        return true;
      }
      if (action === 'result') {
        await handleInteractionResult(req, res, id);
        return true;
      }
      if (action === 'cancel') {
        await handleCancelInteraction(req, res, id);
        return true;
      }
      if (action === 'reminder') {
        await handleInteractionReminder(req, res, id);
        return true;
      }
    }

    const interactionMatch = INTERACTION_ITEM_PATTERN.exec(pathname);
    if (interactionMatch) {
      const id = decodeURIComponent(interactionMatch[1]);
      if (req.method === 'GET') {
        handleGetInteraction(id, res);
        return true;
      }
      if (req.method === 'PATCH') {
        await handleUpdateInteraction(req, res, id);
        return true;
      }
    }

    if (pathname === '/api/interactions' && req.method === 'GET') {
      handleListAllInteractions(url, res);
      return true;
    }

    if (pathname === '/api/interactions' && req.method === 'POST') {
      await handleCreateInteraction(req, res);
      return true;
    }

    const clientInteractionsMatch = CLIENT_INTERACTIONS_PATTERN.exec(pathname);
    if (clientInteractionsMatch && req.method === 'GET') {
      handleListInteractions('client', decodeURIComponent(clientInteractionsMatch[1]), url, res);
      return true;
    }

    const supplierInteractionsMatch = SUPPLIER_INTERACTIONS_PATTERN.exec(pathname);
    if (supplierInteractionsMatch && req.method === 'GET') {
      handleListInteractions('supplier', decodeURIComponent(supplierInteractionsMatch[1]), url, res);
      return true;
    }

    throw new HttpError(404, 'Метод API не найден');
  } catch (error) {
    sendError(res, error);
    return true;
  }
}
