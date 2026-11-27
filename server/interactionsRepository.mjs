/**
 * Запросы к таблицам «Взаимодействия» (interactions) и «История переносов»
 * (interaction_reschedules).
 *
 * Владелец записи — клиент или поставщик (ровно один). Просрочено не хранится в
 * базе: это запланированное взаимодействие с прошедшим временем. Правило 24 часов
 * на правку результата проверяется и здесь, и на уровне API.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';
import { paginate } from './search.mjs';

/** Срок, в течение которого автор может править результат. */
export const RESULT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Интервал повторного напоминания о просроченном взаимодействии. */
export const REMINDER_REPEAT_MS = 24 * 60 * 60 * 1000;

const INTERACTION_SELECT = `
  SELECT i.*,
         u.last_name AS responsible_last_name,
         u.first_name AS responsible_first_name,
         u.middle_name AS responsible_middle_name,
         cb.last_name AS completed_last_name,
         cb.first_name AS completed_first_name,
         cb.middle_name AS completed_middle_name,
         ed.last_name AS edited_last_name,
         ed.first_name AS edited_first_name,
         ed.middle_name AS edited_middle_name,
         cl.last_name AS client_last_name,
         cl.first_name AS client_first_name,
         cl.middle_name AS client_middle_name,
         s.name AS supplier_name
    FROM interactions i
    JOIN users u ON u.id = i.responsible_user_id
    LEFT JOIN users cb ON cb.id = i.completed_by_user_id
    LEFT JOIN users ed ON ed.id = i.edited_by_user_id
    LEFT JOIN clients cl ON cl.id = i.client_id
    LEFT JOIN suppliers s ON s.id = i.supplier_id`;

/** ФИО из частей: незаполненные части пропускаются. */
function fullName(lastName, firstName, middleName) {
  return [lastName, firstName, middleName]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' ');
}

/** Текущий пользователь приложения: первый доступный как ответственный. */
export function getCurrentUserId() {
  const row = getDb()
    .prepare(
      `SELECT id FROM users
        WHERE selectable_as_responsible = 1
        ORDER BY last_name, first_name, id
        LIMIT 1`,
    )
    .get();
  return row?.id ?? null;
}

/** Метка времени строго позже предыдущей. */
function nextTimestamp(previousIso) {
  const now = Date.now();
  const previous = Date.parse(previousIso ?? '');
  const value = Number.isFinite(previous) && previous >= now ? previous + 1 : now;
  return new Date(value).toISOString();
}

/** Запланированное взаимодействие с прошедшим временем считается просроченным. */
function isOverdue(row, now) {
  if (row.status !== 'planned' || !row.planned_at) return false;
  const planned = Date.parse(row.planned_at);
  return Number.isFinite(planned) && planned < now;
}

/** Правку результата может выполнять автор в течение 24 часов после внесения. */
export function canEditResult(row, currentUserId, now) {
  if (row.status !== 'done' || !row.completed_at) return false;
  if (!currentUserId || row.completed_by_user_id !== currentUserId) return false;
  const completed = Date.parse(row.completed_at);
  return Number.isFinite(completed) && now - completed <= RESULT_EDIT_WINDOW_MS;
}

/** Строка базы -> объект для API. */
export function toInteractionResponse(
  row,
  { now = Date.now(), currentUserId = null, rescheduleCount = 0 } = {},
) {
  return {
    id: row.id,
    client_id: row.client_id ?? null,
    supplier_id: row.supplier_id ?? null,
    type: row.type,
    title: row.title,
    planned_at: row.planned_at ?? null,
    status: row.status,
    responsible_user_id: row.responsible_user_id,
    responsible_full_name: fullName(
      row.responsible_last_name,
      row.responsible_first_name,
      row.responsible_middle_name,
    ),
    plan_comment: row.plan_comment ?? null,
    remind_at: row.remind_at ?? null,
    reminder_shown_at: row.reminder_shown_at ?? null,
    reminder_dismissed: row.reminder_dismissed === 1,
    supplier_contact_id: row.supplier_contact_id ?? null,
    supplier_contact_name: row.supplier_contact_name ?? null,
    result_text: row.result_text ?? null,
    occurred_at: row.occurred_at ?? null,
    next_step: row.next_step ?? null,
    cancel_reason: row.cancel_reason ?? null,
    completed_by_user_id: row.completed_by_user_id ?? null,
    completed_by_full_name: row.completed_by_user_id
      ? fullName(row.completed_last_name, row.completed_first_name, row.completed_middle_name)
      : null,
    completed_at: row.completed_at ?? null,
    edited_by_user_id: row.edited_by_user_id ?? null,
    edited_by_full_name: row.edited_by_user_id
      ? fullName(row.edited_last_name, row.edited_first_name, row.edited_middle_name)
      : null,
    edited_at: row.edited_at ?? null,
    created_by_user_id: row.created_by_user_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_overdue: isOverdue(row, now),
    can_edit_result: canEditResult(row, currentUserId, now),
    /** Сколько раз взаимодействие переносили: нужен значок «Перенесено» в списке. */
    reschedule_count: rescheduleCount,
    client_name: row.client_id
      ? fullName(row.client_last_name, row.client_first_name, row.client_middle_name)
      : null,
    supplier_name: row.supplier_name ?? null,
  };
}

/** Порядок строк: сначала запланированные по ближайшей дате, затем остальные. */
function sortInteractions(items) {
  const rank = (item) => (item.status === 'planned' ? 0 : 1);
  return [...items].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    const leftTime = Date.parse(left.planned_at ?? '') || Date.parse(left.occurred_at ?? '') || 0;
    const rightTime = Date.parse(right.planned_at ?? '') || Date.parse(right.occurred_at ?? '') || 0;
    // Запланированные — ближайшие выше; выполненные и отменённые — свежие выше.
    return left.status === 'planned' ? leftTime - rightTime : rightTime - leftTime;
  });
}

/**
 * Взаимодействия клиента или поставщика.
 * Отменённые попадают только в фильтр «Все».
 *
 * @returns {{ items: object[], total: number, overdue: number }}
 */
export function listInteractions({ clientId = null, supplierId = null, status = 'all' } = {}) {
  const now = Date.now();
  const currentUserId = getCurrentUserId();
  const ownerWhere = clientId ? 'i.client_id = ?' : 'i.supplier_id = ?';
  const ownerId = clientId ?? supplierId;

  const rows = getDb().prepare(`${INTERACTION_SELECT} WHERE ${ownerWhere}`).all(ownerId);

  // Количество переносов нужно значку «Перенесено» в списке.
  const counts = new Map(
    getDb()
      .prepare(
        'SELECT interaction_id, COUNT(*) AS total FROM interaction_reschedules GROUP BY interaction_id',
      )
      .all()
      .map((row) => [row.interaction_id, row.total]),
  );

  const all = rows.map((row) =>
    toInteractionResponse(row, {
      now,
      currentUserId,
      rescheduleCount: counts.get(row.id) ?? 0,
    }),
  );
  const overdue = all.filter((item) => item.is_overdue).length;

  const filtered =
    status === 'overdue'
      ? all.filter((item) => item.is_overdue)
      : status === 'planned'
        ? all.filter((item) => item.status === 'planned')
        : status === 'done'
          ? all.filter((item) => item.status === 'done')
          : all;

  const items = sortInteractions(filtered);
  return { items, total: items.length, overdue };
}

/** Взаимодействие по идентификатору: строка базы и объект API. */
export function getInteractionById(id) {
  const row = getDb().prepare(`${INTERACTION_SELECT} WHERE i.id = ?`).get(id);
  if (!row) return null;
  const reschedules = listReschedules(id);
  return {
    row,
    interaction: toInteractionResponse(row, {
      now: Date.now(),
      currentUserId: getCurrentUserId(),
      rescheduleCount: reschedules.length,
    }),
  };
}

/** История переносов: от новых к старым. */
export function listReschedules(interactionId) {
  return getDb()
    .prepare(
      `SELECT r.id, r.old_planned_at, r.new_planned_at, r.reason, r.changed_by_user_id,
              r.changed_at, u.last_name, u.first_name, u.middle_name
         FROM interaction_reschedules r
         LEFT JOIN users u ON u.id = r.changed_by_user_id
        WHERE r.interaction_id = ?
        ORDER BY r.changed_at DESC, r.id DESC`,
    )
    .all(interactionId)
    .map((row) => ({
      id: row.id,
      old_planned_at: row.old_planned_at,
      new_planned_at: row.new_planned_at,
      reason: row.reason ?? null,
      changed_by_user_id: row.changed_by_user_id,
      changed_by_full_name: fullName(row.last_name, row.first_name, row.middle_name),
      changed_at: row.changed_at,
    }));
}

/** Запись переноса внутри уже открытой транзакции. */
function insertReschedule(db, interactionId, oldPlannedAt, newPlannedAt, reason, userId, now) {
  db.prepare(
    `INSERT INTO interaction_reschedules
       (id, interaction_id, old_planned_at, new_planned_at, reason, changed_by_user_id, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), interactionId, oldPlannedAt, newPlannedAt, reason, userId, now);
}

/** Работающий контакт этого поставщика или null. */
export function findSupplierContact(supplierId, contactId) {
  if (!supplierId || !contactId) return null;
  const row = getDb()
    .prepare(
      `SELECT id, last_name, first_name, middle_name, status
         FROM supplier_contacts
        WHERE id = ? AND supplier_id = ?`,
    )
    .get(contactId, supplierId);
  if (!row || row.status !== 'active') return null;
  return { id: row.id, name: fullName(row.last_name, row.first_name, row.middle_name) };
}

/** Количество переносов по всем записям: значок «Перенесено» в списках. */
function rescheduleCounts() {
  return new Map(
    getDb()
      .prepare(
        'SELECT interaction_id, COUNT(*) AS total FROM interaction_reschedules GROUP BY interaction_id',
      )
      .all()
      .map((row) => [row.interaction_id, row.total]),
  );
}

/**
 * Общий список взаимодействий клиентов и поставщиков (раздел CRM
 * «Взаимодействия»). Фильтры, поиск и пагинация выполняются на сервере.
 *
 * `overdue` — просроченные текущего пользователя: число для заголовка вкладки
 * считается по всему набору, а не по отфильтрованной странице.
 */
export function listAllInteractions(filters = {}, { currentUserId = getCurrentUserId() } = {}) {
  const now = Date.now();
  const counts = rescheduleCounts();

  const all = getDb()
    .prepare(INTERACTION_SELECT)
    .all()
    .map((row) =>
      toInteractionResponse(row, {
        now,
        currentUserId,
        rescheduleCount: counts.get(row.id) ?? 0,
      }),
    );

  const overdue = all.filter(
    (item) => item.is_overdue && item.responsible_user_id === currentUserId,
  ).length;

  const search = typeof filters.search === 'string' ? filters.search.trim().toLocaleLowerCase('ru') : '';
  const dateFrom = filters.dateFrom ?? null;
  const dateTo = filters.dateTo ?? null;

  const filtered = all.filter((item) => {
    if (filters.status === 'overdue' && !item.is_overdue) return false;
    if (filters.status === 'planned' && item.status !== 'planned') return false;
    if (filters.status === 'done' && item.status !== 'done') return false;

    if (filters.mine) {
      if (item.responsible_user_id !== currentUserId) return false;
    } else if (filters.responsible && filters.responsible !== 'all') {
      if (item.responsible_user_id !== filters.responsible) return false;
    }

    if (filters.ownerType === 'client' && !item.client_id) return false;
    if (filters.ownerType === 'supplier' && !item.supplier_id) return false;

    if (dateFrom || dateTo) {
      // Записи без плана сравниваются по дате факта.
      const dateValue = (item.planned_at ?? item.occurred_at ?? '').slice(0, 10);
      if (dateValue === '') return false;
      if (dateFrom && dateValue < dateFrom) return false;
      if (dateTo && dateValue > dateTo) return false;
    }

    if (search !== '') {
      const haystack = [item.title, item.supplier_name ?? '', item.client_name ?? '']
        .join(' ')
        .toLocaleLowerCase('ru');
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  const sorted = sortInteractions(filtered);
  const page = paginate(sorted, filters.page, filters.pageSize);
  return { ...page, overdue };
}

/** Контакт принадлежит поставщику (для плана статус не важен). */
function contactExists(supplierId, contactId) {
  if (!supplierId || !contactId) return false;
  const row = getDb()
    .prepare('SELECT 1 AS ok FROM supplier_contacts WHERE id = ? AND supplier_id = ?')
    .get(contactId, supplierId);
  return Boolean(row);
}

/**
 * Создаёт план взаимодействия.
 * @param {{ clientId: string|null, supplierId: string|null }} owner
 * @param {object} data результат серверной валидации
 * @param {string|null} currentUserId текущий пользователь
 */
export function createPlannedInteraction(owner, data, currentUserId) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  // Контактное лицо в плане необязательно, но должно принадлежать поставщику.
  if (data.supplier_contact_id && !contactExists(owner.supplierId, data.supplier_contact_id)) {
    return { status: 'contact_not_found' };
  }

  db.prepare(
    `INSERT INTO interactions
       (id, client_id, supplier_id, type, title, planned_at, status, responsible_user_id,
        plan_comment, remind_at, reminder_shown_at, reminder_dismissed, supplier_contact_id,
        created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, NULL, 0, ?, ?, ?, ?)`,
  ).run(
    id,
    owner.clientId ?? null,
    owner.supplierId ?? null,
    data.type,
    data.title,
    data.planned_at,
    data.responsible_user_id,
    data.plan_comment,
    data.remind_at,
    data.supplier_contact_id ?? null,
    currentUserId,
    now,
    now,
  );

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/**
 * Фиксация результата без плана: запись сразу в статусе «Выполнено».
 * У поставщика контактное лицо обязательно и должно быть работающим.
 */
export function completeWithoutPlan(owner, data, currentUserId) {
  let contactName = null;
  if (owner.supplierId) {
    const contact = findSupplierContact(owner.supplierId, data.supplier_contact_id);
    if (!contact) return { status: 'contact_required' };
    contactName = contact.name;
  } else if (data.supplier_contact_id) {
    return { status: 'contact_not_found' };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO interactions
       (id, client_id, supplier_id, type, title, planned_at, status, responsible_user_id,
        remind_at, reminder_shown_at, reminder_dismissed, supplier_contact_id,
        supplier_contact_name, result_text, occurred_at, next_step, completed_by_user_id,
        completed_at, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'done', ?, NULL, NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    owner.clientId ?? null,
    owner.supplierId ?? null,
    data.type,
    data.title,
    currentUserId,
    data.supplier_contact_id ?? null,
    contactName,
    data.result_text,
    data.occurred_at,
    data.next_step,
    currentUserId,
    now,
    currentUserId,
    now,
    now,
  );

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/**
 * Редактирование плана. Если плановое время изменилось, перенос попадает
 * в историю с пустой причиной.
 */
export function updatePlan(id, data, currentUserId) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status !== 'planned') return { status: 'invalid_status' };
  if (data.supplier_contact_id && !contactExists(found.row.supplier_id, data.supplier_contact_id)) {
    return { status: 'contact_not_found' };
  }

  const db = getDb();
  const oldPlannedAt = found.row.planned_at;
  const updatedAt = nextTimestamp(found.row.updated_at);
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE interactions
          SET type = ?,
              title = ?,
              planned_at = ?,
              responsible_user_id = ?,
              plan_comment = ?,
              remind_at = ?,
              reminder_shown_at = NULL,
              reminder_dismissed = 0,
              supplier_contact_id = ?,
              updated_at = ?
        WHERE id = ?`,
    ).run(
      data.type,
      data.title,
      data.planned_at,
      data.responsible_user_id,
      data.plan_comment,
      data.remind_at,
      data.supplier_contact_id ?? null,
      updatedAt,
      id,
    );

    if (oldPlannedAt && oldPlannedAt !== data.planned_at) {
      insertReschedule(db, id, oldPlannedAt, data.planned_at, null, currentUserId, updatedAt);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/** Перенос: новая дата, причина в истории, напоминание пересчитывается. */
export function rescheduleInteraction(id, data, currentUserId) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status !== 'planned') return { status: 'invalid_status' };
  if (!found.row.planned_at) return { status: 'invalid_status' };

  const db = getDb();
  const changedAt = nextTimestamp(found.row.updated_at);
  db.exec('BEGIN');
  try {
    insertReschedule(
      db,
      id,
      found.row.planned_at,
      data.planned_at,
      data.reason,
      currentUserId,
      changedAt,
    );
    db.prepare(
      `UPDATE interactions
          SET planned_at = ?,
              remind_at = ?,
              reminder_shown_at = NULL,
              reminder_dismissed = 0,
              updated_at = ?
        WHERE id = ?`,
    ).run(data.planned_at, data.remind_at, changedAt, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}


/**
 * Внесение результата в запланированное взаимодействие: статус «Выполнено»,
 * напоминание гасится, контактное лицо поставщика фиксируется копией ФИО.
 */
export function completeInteraction(id, data, currentUserId) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status !== 'planned') return { status: 'invalid_status' };

  let contactName = null;
  if (found.row.supplier_id) {
    const contact = findSupplierContact(found.row.supplier_id, data.supplier_contact_id);
    if (!contact) return { status: 'contact_required' };
    contactName = contact.name;
  } else if (data.supplier_contact_id) {
    return { status: 'contact_not_found' };
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE interactions
        SET type = ?,
            title = ?,
            status = 'done',
            result_text = ?,
            occurred_at = ?,
            next_step = ?,
            supplier_contact_id = ?,
            supplier_contact_name = ?,
            completed_by_user_id = ?,
            completed_at = ?,
            reminder_dismissed = 1,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    data.type,
    data.title,
    data.result_text,
    data.occurred_at,
    data.next_step,
    data.supplier_contact_id ?? null,
    contactName,
    currentUserId,
    now,
    nextOffset(found.row.updated_at),
    id,
  );

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/**
 * Правка результата выполненного взаимодействия.
 * Доступна только автору и только в течение 24 часов после внесения результата.
 */
export function updateResult(id, data, currentUserId, now = Date.now()) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status !== 'done') return { status: 'invalid_status' };
  if (!canEditResult(found.row, currentUserId, now)) return { status: 'forbidden' };

  let contactName = found.row.supplier_contact_name ?? null;
  if (found.row.supplier_id) {
    const contact = findSupplierContact(found.row.supplier_id, data.supplier_contact_id);
    if (!contact) return { status: 'contact_required' };
    contactName = contact.name;
  }

  const db = getDb();
  db.prepare(
    `UPDATE interactions
        SET type = ?,
            title = ?,
            result_text = ?,
            occurred_at = ?,
            next_step = ?,
            supplier_contact_id = ?,
            supplier_contact_name = ?,
            edited_by_user_id = ?,
            edited_at = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    data.type,
    data.title,
    data.result_text,
    data.occurred_at,
    data.next_step,
    data.supplier_contact_id ?? null,
    contactName,
    currentUserId,
    new Date(now).toISOString(),
    nextOffset(found.row.updated_at, now),
    id,
  );

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/** Отмена запланированного взаимодействия: назад из «Отменено» не возвращаем. */
export function cancelInteraction(id, data) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status !== 'planned') return { status: 'invalid_status' };

  const db = getDb();
  db.prepare(
    `UPDATE interactions
        SET status = 'cancelled',
            cancel_reason = ?,
            reminder_dismissed = 1,
            updated_at = ?
      WHERE id = ?`,
  ).run(data.cancel_reason, nextTimestamp(found.row.updated_at), id);

  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/** Метка времени позже предыдущей, но не раньше указанного момента. */
function nextOffset(previousIso, now = Date.now()) {
  const previous = Date.parse(previousIso ?? '');
  const base = Number.isFinite(previous) && previous >= now ? previous + 1 : now;
  return new Date(base).toISOString();
}

/**
 * Наступившие напоминания ответственного: напоминание по плану и повторные
 * напоминания о просроченных — не чаще одного раза в сутки на запись.
 */
export function listDueReminders(userId, now = Date.now()) {
  const rows = getDb()
    .prepare(
      `${INTERACTION_SELECT}
        WHERE i.responsible_user_id = ?
          AND i.status = 'planned'
          AND i.reminder_dismissed = 0`,
    )
    .all(userId);

  return rows
    .filter((row) => {
      const remindAt = row.remind_at ? Date.parse(row.remind_at) : null;
      const plannedAt = row.planned_at ? Date.parse(row.planned_at) : null;
      const shownAt = row.reminder_shown_at ? Date.parse(row.reminder_shown_at) : null;
      // Без напоминания запись становится напоминанием, когда просрочена.
      const dueAt = remindAt ?? plannedAt;
      if (dueAt === null || !Number.isFinite(dueAt) || dueAt > now) return false;
      if (shownAt === null) return true;
      const overdue = plannedAt !== null && Number.isFinite(plannedAt) && plannedAt <= now;
      return overdue && now - shownAt >= REMINDER_REPEAT_MS;
    })
    .map((row) => toInteractionResponse(row, { now, currentUserId: userId }));
}

/** Отметка о показе напоминания. */
export function markReminderShown(id) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  getDb()
    .prepare('UPDATE interactions SET reminder_shown_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

/** Закрытие напоминания: скрывается только текущее напоминание. */
export function dismissReminder(id) {
  const found = getInteractionById(id);
  if (!found) return { status: 'not_found' };
  getDb()
    .prepare('UPDATE interactions SET reminder_dismissed = 1, reminder_shown_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  return { status: 'ok', interaction: getInteractionById(id).interaction };
}

