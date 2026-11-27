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
 *   GET   /api/notifications?filter=all|unread&limit=20&offset=0
 *   GET   /api/notifications/unread-count
 *   POST  /api/notifications/{id}/read
 *   POST  /api/notifications/read-all
 *   GET   /api/tasks?search=&status=&responsible=&mine=&page=&pageSize=
 *   POST  /api/tasks
 *   GET   /api/tasks/{id}
 *   PATCH /api/tasks/{id}
 *   POST  /api/tasks/{id}/close
 *   GET   /api/agenda?view=list|kanban&column=&offset=&limit=&kind=all|task|interaction&dateFrom=&dateTo=
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
import { clientFullName, filterClients, paginate, parseQuery } from './search.mjs';
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
import {
  countUnreadNotifications,
  createNotification,
  deleteNotificationsBySourcePrefix,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notificationsRepository.mjs';
import {
  AGENDA_PAGE_SIZE,
  TASK_SOON_MS,
  closeTask,
  createTask,
  dueTaskNotifications,
  getTaskById,
  listAgenda,
  listAgendaColumn,
  listAgendaKanban,
  listTasks,
  updateTask,
} from './tasksRepository.mjs';
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

/** Отметка уведомления прочитанным: /api/notifications/{id}/read. */
const NOTIFICATION_READ_PATTERN = /^\/api\/notifications\/([^/]+)\/read$/;

/** Задачи: /api/tasks/{id} и /api/tasks/{id}/close. */
const TASK_ITEM_PATTERN = /^\/api\/tasks\/([^/]+)$/;
const TASK_CLOSE_PATTERN = /^\/api\/tasks\/([^/]+)\/close$/;


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
  notifyClientEvent(result.client, 'Клиент создан');
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

  notifyClientEvent(result.client, 'Изменения сохранены');
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
  notifySupplierEvent(result.supplier, 'Поставщик создан');
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

  notifySupplierEvent(result.supplier, 'Изменения сохранены');
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
  notifyInteractionReminder(result.interaction);
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

/** Наступившие напоминания текущего пользователя и сроки задач. */
function handleListReminders(res) {
  const userId = getCurrentUserId();
  // Планировщик напоминаний: вместе с взаимодействиями проверяются сроки задач.
  if (userId) {
    for (const { task, kind } of dueTaskNotifications(userId)) notifyTaskDue(task, kind);
  }
  sendJson(res, 200, { items: userId ? listDueReminders(userId) : [] });
}

/** Отметка о показе или закрытии напоминания. */
async function handleInteractionReminder(req, res, id) {
  const body = await readJsonBody(req);
  const dismissed = body.dismissed === true || body.dismissed === 'true';
  sendInteractionResult(res, dismissed ? dismissReminder(id) : markReminderShown(id));
}

/** Обрабатывает запрос к API. `true`, если запрос относится к API. */
/**
 * Уведомление колокольчика: то же сообщение, что и всплывающее, но сохраняется
 * в хранилище, чтобы попасть в панель колокольчика.
 */
function notifyUser({ userId, type, title, body, entityType, entityId, link, sourceKey = null }) {
  if (!userId) return;
  createNotification({ userId, type, title, body, entityType, entityId, link, sourceKey });
}

/** Ссылка на карточку контрагента: с вкладкой и записью взаимодействия. */
function counterpartyLink(section, id, tab = null, interactionId = null) {
  const params = new URLSearchParams({ open: id });
  if (tab) params.set('tab', tab);
  if (interactionId) params.set('interaction', interactionId);
  return `/crm/${section}?${params.toString()}`;
}

/** Создание и сохранение клиента попадают в колокольчик. */
function notifyClientEvent(client, title) {
  if (!client) return;
  notifyUser({
    userId: getCurrentUserId(),
    type: 'client',
    title,
    body: clientFullName(client),
    entityType: 'client',
    entityId: client.id,
    link: counterpartyLink('clients', client.id),
  });
}

/** Создание и сохранение поставщика попадают в колокольчик. */
function notifySupplierEvent(supplier, title) {
  if (!supplier) return;
  notifyUser({
    userId: getCurrentUserId(),
    type: 'supplier',
    title,
    body: supplier.name ?? null,
    entityType: 'supplier',
    entityId: supplier.id,
    link: counterpartyLink('suppliers', supplier.id),
  });
}

/** Напоминание о взаимодействии: одна запись на время напоминания. */
function notifyInteractionReminder(interaction) {
  if (!interaction || !interaction.remind_at || interaction.status !== 'planned') return;
  const userId = interaction.responsible_user_id ?? getCurrentUserId();
  if (!userId) return;
  const section = interaction.client_id ? 'clients' : 'suppliers';
  const ownerId = interaction.client_id ?? interaction.supplier_id;
  const ownerName = interaction.client_name ?? interaction.supplier_name ?? '';
  notifyUser({
    userId,
    type: 'reminder',
    title: interaction.title,
    body: ownerName ? `Напоминание: ${ownerName}` : 'Напоминание о взаимодействии',
    entityType: 'interaction',
    entityId: interaction.id,
    link: counterpartyLink(section, ownerId, 'interactions', interaction.id),
    sourceKey: `interaction-reminder:${interaction.id}:${interaction.remind_at}`,
  });
}

/** Список уведомлений текущего пользователя: «все» или «непрочитанные». */
function handleListNotifications(url, res) {
  const params = url.searchParams;
  sendJson(
    res,
    200,
    listNotifications({
      filter: params.get('filter') === 'unread' ? 'unread' : 'all',
      limit: Number.parseInt(params.get('limit') ?? '20', 10),
      offset: Number.parseInt(params.get('offset') ?? '0', 10),
    }),
  );
}

/** Счётчик непрочитанных уведомлений. */
function handleNotificationsUnread(res) {
  sendJson(res, 200, { unread: countUnreadNotifications() });
}

/** Отметка одного уведомления прочитанным (идемпотентно). */
function handleNotificationRead(res, id) {
  const result = markNotificationRead(id);
  if (result.status === 'not_found') throw new HttpError(404, 'Уведомление не найдено');
  sendJson(res, 200, result.notification);
}

/** Отметка всех уведомлений прочитанными. */
function handleNotificationsReadAll(res) {
  sendJson(res, 200, markAllNotificationsRead());
}

/** Срок задачи для текста уведомления: дд.мм.гггг чч:мм. */
function formatTaskDue(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Уведомление по сроку задачи: за час до срока и при просрочке.
 * Ключ источника гарантирует одну запись на задачу для каждого вида.
 */
function notifyTaskDue(task, kind) {
  const overdue = kind === 'overdue';
  createNotification({
    userId: task.responsible_user_id,
    type: 'task',
    title: overdue ? 'Задача просрочена' : 'Срок задачи скоро истекает',
    body: overdue ? task.title : `${task.title} · срок ${formatTaskDue(task.due_at)}`,
    // Колокольчик открывает карточку задачи поверх текущей страницы.
    entityType: 'task',
    entityId: task.id,
    link: '/tasks',
    sourceKey: `${overdue ? 'task-overdue' : 'task-soon'}:${task.id}`,
  });
}

/** Уведомления при создании задачи: если срок уже близко, пишем сразу. */
function notifyTaskOnCreate(task) {
  if (!task || task.status === 'done') return;
  const due = Date.parse(task.due_at);
  if (!Number.isFinite(due)) return;
  const left = due - Date.now();
  if (left <= 0) notifyTaskDue(task, 'overdue');
  else if (left <= TASK_SOON_MS) notifyTaskDue(task, 'soon');
}

/** Пересчёт уведомлений задачи после смены срока: старые удаляются. */
function resetTaskNotifications(taskId) {
  deleteNotificationsBySourcePrefix(`task-soon:${taskId}`);
  deleteNotificationsBySourcePrefix(`task-overdue:${taskId}`);
}

/** Тип элемента раздела: «Все», только задачи или только взаимодействия. */
function readAgendaKind(value) {
  return value === 'task' || value === 'interaction' ? value : 'all';
}

/** Фильтры раздела «Задачи» из строки запроса. */
function readTaskFilters(params) {
  const size = Number.parseInt(params.get('pageSize') ?? '', 10);
  const limit = Number.parseInt(params.get('limit') ?? '', 10);
  return {
    search: params.get('search') ?? '',
    status: params.get('status') ?? 'all',
    responsible: params.get('responsible') ?? 'all',
    mine: params.get('mine') === 'true',
    kind: readAgendaKind(params.get('kind')),
    dateFrom: params.get('dateFrom') ?? '',
    dateTo: params.get('dateTo') ?? '',
    page: Number.parseInt(params.get('page') ?? '1', 10),
    pageSize: Number.isInteger(size) && size > 0 ? size : AGENDA_PAGE_SIZE,
    offset: Number.parseInt(params.get('offset') ?? '0', 10),
    limit: Number.isInteger(limit) && limit > 0 ? limit : AGENDA_PAGE_SIZE,
  };
}

/** Список задач: поиск, фильтры и пагинация. */
function handleListTasks(url, res) {
  const filters = readTaskFilters(url.searchParams);
  sendJson(res, 200, paginate(listTasks(filters), filters.page, filters.pageSize));
}

/** Список раздела: задачи и плановые взаимодействия вместе. */
function handleListAgenda(url, res) {
  const params = url.searchParams;
  const filters = readTaskFilters(params);
  const column = params.get('column');
  if (column) {
    // Канбан: порция карточек одной колонки с общим числом элементов.
    sendJson(res, 200, listAgendaColumn(filters, { column, offset: filters.offset, limit: filters.limit }));
    return;
  }
  sendJson(res, 200, params.get('view') === 'kanban' ? listAgendaKanban(filters) : listAgenda(filters));
}

/** Карточка задачи. */
function handleGetTask(id, res) {
  const found = getTaskById(id);
  if (!found) throw new HttpError(404, 'Задача не найдена');
  sendJson(res, 200, found.task);
}

/** Проверка полей задачи: название и срок обязательны, срок не в прошлом. */
function validateTaskPayload(body) {
  const asText = (value) =>
    typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  const fieldErrors = {};

  const title = asText(body.title).trim();
  if (title === '') fieldErrors.title = 'Введите название';
  else if (title.length > 200) fieldErrors.title = 'Не более 200 символов';

  const dueRaw = asText(body.due_at).trim();
  const dueTime = dueRaw === '' ? Number.NaN : Date.parse(dueRaw);
  if (!Number.isFinite(dueTime)) fieldErrors.due_at = 'Укажите срок выполнения';
  else if (dueTime < Date.now() - 60_000) fieldErrors.due_at = 'Срок не может быть в прошлом';

  const description = asText(body.description).trim();
  if (description.length > 1000) fieldErrors.description = 'Не более 1000 символов';

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const responsibleUserId = asText(body.responsible_user_id).trim() || getCurrentUserId();
  if (!isResponsibleSelectable(responsibleUserId)) {
    return { ok: false, fieldErrors: { responsible_user_id: 'Выберите ответственного' } };
  }

  return {
    ok: true,
    data: {
      title,
      description: description === '' ? null : description,
      due_at: new Date(dueTime).toISOString(),
      responsible_user_id: responsibleUserId,
      interaction_id: asText(body.interaction_id).trim() || null,
      client_id: asText(body.client_id).trim() || null,
      supplier_id: asText(body.supplier_id).trim() || null,
    },
  };
}

/** Создание задачи: контрагент и ответственный берутся из взаимодействия. */
async function handleCreateTask(req, res) {
  const body = await readJsonBody(req);
  const validation = validateTaskPayload(body);
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  const data = { ...validation.data };
  if (data.interaction_id) {
    const found = getInteractionById(data.interaction_id);
    if (!found) {
      throw new HttpError(422, 'Проверьте заполнение полей', {
        interaction_id: 'Взаимодействие не найдено',
      });
    }
    data.client_id = found.interaction.client_id ?? null;
    data.supplier_id = found.interaction.supplier_id ?? null;
    if (!body.responsible_user_id) {
      data.responsible_user_id = found.interaction.responsible_user_id;
    }
  }

  const result = createTask(data, getCurrentUserId());
  notifyTaskOnCreate(result.task);
  sendJson(res, 201, result.task);
}

/** Закрытие задачи: повторный вызов ничего не меняет. */
function handleCloseTask(res, id) {
  const result = closeTask(id);
  if (result.status === 'not_found') throw new HttpError(404, 'Задача не найдена');
  sendJson(res, 200, result.task);
}

/** Правка задачи: те же проверки, что при создании; выполненную менять нельзя. */
async function handleUpdateTask(req, res, id) {
  const found = getTaskById(id);
  if (!found) throw new HttpError(404, 'Задача не найдена');
  if (found.row.status === 'done') {
    throw new HttpError(409, 'Выполненную задачу нельзя изменить');
  }

  const body = await readJsonBody(req);
  // Ответственный не редактируется: проверка идёт по текущему значению.
  const validation = validateTaskPayload({
    ...body,
    responsible_user_id: found.task.responsible_user_id,
  });
  if (!validation.ok) {
    throw new HttpError(422, 'Проверьте заполнение полей', validation.fieldErrors);
  }

  const result = updateTask(id, {
    title: validation.data.title,
    description: validation.data.description,
    due_at: validation.data.due_at,
  });
  if (result.status === 'not_found') throw new HttpError(404, 'Задача не найдена');
  if (result.status === 'invalid_status') {
    throw new HttpError(409, 'Выполненную задачу нельзя изменить');
  }

  // Новый срок — уведомления «скоро истекает» и «просрочена» пересчитываются.
  if (result.dueChanged) {
    resetTaskNotifications(id);
    notifyTaskOnCreate(result.task);
  }
  sendJson(res, 200, result.task);
}

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

    // Задачи: список, раздел «Задачи» и карточка.
    if (pathname === '/api/tasks' && req.method === 'GET') {
      handleListTasks(url, res);
      return true;
    }

    if (pathname === '/api/tasks' && req.method === 'POST') {
      await handleCreateTask(req, res);
      return true;
    }

    if (pathname === '/api/agenda' && req.method === 'GET') {
      handleListAgenda(url, res);
      return true;
    }

    const taskCloseMatch = TASK_CLOSE_PATTERN.exec(pathname);
    if (taskCloseMatch && req.method === 'POST') {
      handleCloseTask(res, decodeURIComponent(taskCloseMatch[1]));
      return true;
    }

    const taskMatch = TASK_ITEM_PATTERN.exec(pathname);
    if (taskMatch && req.method === 'GET') {
      handleGetTask(decodeURIComponent(taskMatch[1]), res);
      return true;
    }

    if (taskMatch && req.method === 'PATCH') {
      await handleUpdateTask(req, res, decodeURIComponent(taskMatch[1]));
      return true;
    }

    // Уведомления колокольчика в шапке: только текущий пользователь.
    if (pathname === '/api/notifications' && req.method === 'GET') {
      handleListNotifications(url, res);
      return true;
    }

    if (pathname === '/api/notifications/unread-count' && req.method === 'GET') {
      handleNotificationsUnread(res);
      return true;
    }

    if (pathname === '/api/notifications/read-all' && req.method === 'POST') {
      handleNotificationsReadAll(res);
      return true;
    }

    const notificationReadMatch = NOTIFICATION_READ_PATTERN.exec(pathname);
    if (notificationReadMatch && req.method === 'POST') {
      handleNotificationRead(res, decodeURIComponent(notificationReadMatch[1]));
      return true;
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
