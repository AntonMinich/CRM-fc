/**
 * Запросы к таблицам «Клиенты» (clients) и справочнику пользователей (users).
 * Все параметры передаются через подготовленные выражения — пользовательский
 * ввод не подставляется в SQL-строку.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';
import { extractNationalDigits } from './phone.mjs';
import { ADDRESS_COLUMNS } from './validation.mjs';

/** ФИО пользователя из частей, пустые части пропускаются. */
export function buildFullName({ last_name, first_name, middle_name }) {
  return [last_name, first_name, middle_name].filter(Boolean).join(' ');
}

const CLIENT_SELECT = `
  SELECT c.id,
         c.last_name,
         c.first_name,
         c.middle_name,
         c.phone,
         c.email,
         c.comment,
         ${ADDRESS_COLUMNS.map((field) => `c.${field}`).join(',\n         ')},
         c.responsible_user_id,
         c.created_at,
         c.updated_at,
         u.last_name  AS responsible_last_name,
         u.first_name AS responsible_first_name,
         u.middle_name AS responsible_middle_name
    FROM clients c
    JOIN users u ON u.id = c.responsible_user_id`;

/**
 * Строка базы -> объект для API.
 * `withAddresses` включается только для карточки клиента: в ответе списка
 * реквизиты не возвращаются.
 */
function toClientResponse(row, withAddresses = false) {
  const client = {
    id: row.id,
    last_name: row.last_name ?? null,
    first_name: row.first_name,
    middle_name: row.middle_name ?? null,
    phone: row.phone,
    email: row.email ?? null,
    comment: row.comment ?? null,
    responsible_user_id: row.responsible_user_id,
    responsible_full_name: buildFullName({
      last_name: row.responsible_last_name,
      first_name: row.responsible_first_name,
      middle_name: row.responsible_middle_name,
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (withAddresses) {
    for (const field of ADDRESS_COLUMNS) {
      client[field] = row[field] ?? null;
    }
  }

  return client;
}

/** Все клиенты в порядке по умолчанию: новые сверху. */
export function listAllClients() {
  return getDb()
    .prepare(`${CLIENT_SELECT} ORDER BY c.created_at DESC, c.id DESC`)
    .all()
    .map((row) => toClientResponse(row));
}

export function getClientById(id) {
  const row = getDb().prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id);
  return row ? toClientResponse(row, true) : null;
}

/** Пользователи справочника. `onlySelectable` — только доступные как ответственный. */
export function listUsers({ onlySelectable = true } = {}) {
  const where = onlySelectable ? 'WHERE selectable_as_responsible = 1' : '';
  return getDb()
    .prepare(
      `SELECT id, last_name, first_name, middle_name
         FROM users
         ${where}
        ORDER BY last_name, first_name, id`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      last_name: row.last_name,
      first_name: row.first_name,
      middle_name: row.middle_name ?? null,
      full_name: buildFullName(row),
    }));
}

/** Пользователи, доступные для выбора ответственным. */
export function listResponsibleUsers() {
  return listUsers({ onlySelectable: true });
}

export function isResponsibleSelectable(id) {
  if (!id) return false;
  const row = getDb()
    .prepare('SELECT 1 AS ok FROM users WHERE id = ? AND selectable_as_responsible = 1')
    .get(id);
  return Boolean(row);
}

/**
 * Другой клиент с таким же телефоном.
 *
 * Сравниваются цифры национальной части, а не текст с маской: телефон хранится
 * нормализованным (`+375XXXXXXXXX`), но записи в старом формате тоже находятся.
 * Запись с идентификатором `excludeId` не учитывается, поэтому сохранение
 * карточки без смены номера дублем не считается.
 *
 * @returns {{ id: string, last_name: string|null, first_name: string, middle_name: string|null }|null}
 */
export function findClientByPhone(phone, excludeId = null) {
  const digits = extractNationalDigits(phone);
  if (digits === '') return null;

  const row = getDb()
    .prepare('SELECT id, phone, last_name, first_name, middle_name FROM clients')
    .all()
    .find((item) => item.id !== excludeId && extractNationalDigits(item.phone) === digits);

  if (!row) return null;
  return {
    id: row.id,
    last_name: row.last_name ?? null,
    first_name: row.first_name,
    middle_name: row.middle_name ?? null,
  };
}

/**
 * Нарушение уникального индекса по телефону: так выглядит гонка одновременных
 * запросов, когда проверка дубля уже пройдена. SQLite: errcode 2067
 * (SQLITE_CONSTRAINT_UNIQUE).
 */
function isPhoneUniqueViolation(error) {
  const message = String(error?.message ?? '');
  return (
    error?.errcode === 2067 ||
    (message.includes('UNIQUE constraint failed') && message.includes('clients.phone'))
  );
}

/**
 * Создаёт ровно одну запись в таблице «Клиенты».
 * @param {object} data результат серверной валидации
 * @param {string|null} idempotencyKey ключ идемпотентности
 * @returns {{ status: 'ok', client: object } | { status: 'duplicate', duplicate: object }}
 */
export function createClient(data, idempotencyKey) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  db.exec('BEGIN');
  try {
    const duplicate = findClientByPhone(data.phone);
    if (duplicate) {
      db.exec('ROLLBACK');
      return { status: 'duplicate', duplicate };
    }

    db.prepare(
      `INSERT INTO clients
         (id, last_name, first_name, middle_name, phone, email, comment,
          responsible_user_id, created_at, updated_at, ${ADDRESS_COLUMNS.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${ADDRESS_COLUMNS.map(() => '?').join(', ')})`,
    ).run(
      id,
      data.last_name,
      data.first_name,
      data.middle_name,
      data.phone,
      data.email,
      data.comment,
      data.responsible_user_id,
      now,
      now,
      ...ADDRESS_COLUMNS.map((field) => data[field]),
    );

    const client = getClientById(id);

    if (idempotencyKey) {
      db.prepare(
        `INSERT INTO client_creation_requests
           (idempotency_key, client_id, response_json, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(idempotencyKey, id, JSON.stringify(client), now);
    }

    db.exec('COMMIT');
    return { status: 'ok', client };
  } catch (error) {
    db.exec('ROLLBACK');
    if (isPhoneUniqueViolation(error)) {
      const duplicate = findClientByPhone(data.phone);
      if (duplicate) return { status: 'duplicate', duplicate };
    }
    throw error;
  }
}

/** Ранее сохранённый ответ для того же ключа идемпотентности. */
export function findCreationRequest(idempotencyKey) {
  return (
    getDb()
      .prepare('SELECT response_json FROM client_creation_requests WHERE idempotency_key = ?')
      .get(idempotencyKey) ?? null
  );
}

/** Ранее сохранённый ответ обновления для того же ключа идемпотентности. */
export function findUpdateRequest(idempotencyKey) {
  return (
    getDb()
      .prepare('SELECT response_json FROM client_update_requests WHERE idempotency_key = ?')
      .get(idempotencyKey) ?? null
  );
}

/**
 * Метка времени строго позже предыдущей.
 * Обновление всегда сдвигает `updated_at`, даже если две правки попали в одну
 * миллисекунду: иначе повторное сохранение выглядело бы как отсутствие изменений.
 */
function nextTimestamp(previousIso) {
  const now = Date.now();
  const previous = Date.parse(previousIso ?? '');
  const value = Number.isFinite(previous) && previous >= now ? previous + 1 : now;
  return new Date(value).toISOString();
}

/**
 * Обновляет поля существующей записи «Клиенты».
 * `id` и `created_at` не меняются, `updated_at` задаёт сервер.
 *
 * @param {string} id идентификатор записи
 * @param {object} data результат серверной валидации
 * @param {{ idempotencyKey?: string|null, expectedUpdatedAt?: string|null }} options
 * @returns {{ status: 'ok', client: object }
 *   | { status: 'not_found' }
 *   | { status: 'conflict', client: object }
 *   | { status: 'duplicate', duplicate: object }}
 */
export function updateClient(id, data, { idempotencyKey = null, expectedUpdatedAt = null } = {}) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const existing = db.prepare('SELECT updated_at FROM clients WHERE id = ?').get(id);
    if (!existing) {
      db.exec('ROLLBACK');
      return { status: 'not_found' };
    }

    // Защита от одновременной правки: значение updated_at, известное клиенту.
    if (expectedUpdatedAt !== null && existing.updated_at !== expectedUpdatedAt) {
      const actual = getClientById(id);
      db.exec('ROLLBACK');
      return { status: 'conflict', client: actual };
    }

    // Телефон должен быть свободен у других клиентов; своя запись не считается.
    const duplicate = findClientByPhone(data.phone, id);
    if (duplicate) {
      db.exec('ROLLBACK');
      return { status: 'duplicate', duplicate };
    }

    const updatedAt = nextTimestamp(existing.updated_at);
    db.prepare(
      `UPDATE clients
          SET last_name = ?,
              first_name = ?,
              middle_name = ?,
              phone = ?,
              email = ?,
              comment = ?,
              responsible_user_id = ?,
              updated_at = ?,
              ${ADDRESS_COLUMNS.map((field) => `${field} = ?`).join(',\n              ')}
        WHERE id = ?`,
    ).run(
      data.last_name,
      data.first_name,
      data.middle_name,
      data.phone,
      data.email,
      data.comment,
      data.responsible_user_id,
      updatedAt,
      ...ADDRESS_COLUMNS.map((field) => data[field]),
      id,
    );

    const client = getClientById(id);

    if (idempotencyKey) {
      db.prepare(
        `INSERT OR REPLACE INTO client_update_requests
           (idempotency_key, client_id, response_json, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(idempotencyKey, id, JSON.stringify(client), updatedAt);
    }

    db.exec('COMMIT');
    return { status: 'ok', client };
  } catch (error) {
    db.exec('ROLLBACK');
    if (isPhoneUniqueViolation(error)) {
      const duplicate = findClientByPhone(data.phone, id);
      if (duplicate) return { status: 'duplicate', duplicate };
    }
    throw error;
  }
}
