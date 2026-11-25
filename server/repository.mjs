/**
 * Запросы к таблицам «Клиенты» (clients) и справочнику пользователей (users).
 * Все параметры передаются через подготовленные выражения — пользовательский
 * ввод не подставляется в SQL-строку.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';

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
         c.responsible_user_id,
         c.created_at,
         c.updated_at,
         u.last_name  AS responsible_last_name,
         u.first_name AS responsible_first_name,
         u.middle_name AS responsible_middle_name
    FROM clients c
    JOIN users u ON u.id = c.responsible_user_id`;

/** Строка базы -> объект для API. */
function toClientResponse(row) {
  return {
    id: row.id,
    last_name: row.last_name ?? null,
    first_name: row.first_name,
    middle_name: row.middle_name ?? null,
    phone: row.phone,
    email: row.email ?? null,
    responsible_user_id: row.responsible_user_id,
    responsible_full_name: buildFullName({
      last_name: row.responsible_last_name,
      first_name: row.responsible_first_name,
      middle_name: row.responsible_middle_name,
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Все клиенты в порядке по умолчанию: новые сверху. */
export function listAllClients() {
  return getDb()
    .prepare(`${CLIENT_SELECT} ORDER BY c.created_at DESC, c.id DESC`)
    .all()
    .map(toClientResponse);
}

export function getClientById(id) {
  const row = getDb().prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id);
  return row ? toClientResponse(row) : null;
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
 * Создаёт ровно одну запись в таблице «Клиенты».
 * @param {object} data результат серверной валидации
 * @param {string|null} idempotencyKey ключ идемпотентности
 */
export function createClient(data, idempotencyKey) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO clients
         (id, last_name, first_name, middle_name, phone, email,
          responsible_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.last_name,
      data.first_name,
      data.middle_name,
      data.phone,
      data.email,
      data.responsible_user_id,
      now,
      now,
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
    return client;
  } catch (error) {
    db.exec('ROLLBACK');
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
