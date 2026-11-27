/**
 * Запросы к таблице «Уведомления» (notifications) для колокольчика в шапке.
 *
 * Получатель — пользователь приложения: список, счётчик и отметки прочтения
 * всегда ограничены текущим пользователем, поэтому чужие уведомления
 * недоступны. Текущий пользователь берётся из общего правила приложения.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';
import { getCurrentUserId } from './interactionsRepository.mjs';

const NOTIFICATION_SELECT = 'SELECT n.* FROM notifications n';

/** Строка базы -> объект для API. */
export function toNotificationResponse(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    link: row.link ?? null,
    created_at: row.created_at,
    read_at: row.read_at ?? null,
    is_read: row.read_at !== null,
  };
}

function findNotification(id) {
  const row = getDb().prepare(`${NOTIFICATION_SELECT} WHERE n.id = ?`).get(id);
  return row ? toNotificationResponse(row) : null;
}

/**
 * Создаёт уведомление получателю. Повтор с тем же `sourceKey` ничего не делает.
 * @returns {object|null} созданное уведомление или null, если запись уже была
 */
export function createNotification({
  userId,
  type,
  title,
  body = null,
  entityType = null,
  entityId = null,
  link = null,
  sourceKey = null,
}) {
  if (!userId || !type || !title) return null;
  const id = randomUUID();
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO notifications
         (id, user_id, type, title, body, entity_type, entity_id, link, created_at, read_at, source_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(
      id,
      userId,
      type,
      title,
      body,
      entityType,
      entityId,
      link,
      new Date().toISOString(),
      sourceKey,
    );
  return result.changes === 0 ? null : findNotification(id);
}

/** Счётчик непрочитанных уведомлений получателя. */
export function countUnreadNotifications(userId = getCurrentUserId()) {
  if (!userId) return 0;
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(userId);
  return row?.n ?? 0;
}

/**
 * Список уведомлений получателя: от новых к старым, порциями.
 * @param {{ userId?: string, filter?: 'all'|'unread', limit?: number, offset?: number }} options
 */
export function listNotifications({
  userId = getCurrentUserId(),
  filter = 'all',
  limit = 20,
  offset = 0,
} = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;
  if (!userId) {
    return { items: [], total: 0, hasMore: false, unread: 0, limit: safeLimit, offset: safeOffset };
  }

  const where = filter === 'unread' ? 'user_id = ? AND read_at IS NULL' : 'user_id = ?';
  const db = getDb();
  const total =
    db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${where}`).get(userId)?.n ?? 0;
  // На одну запись больше лимита — чтобы понять, есть ли следующая порция.
  const rows = db
    .prepare(
      `${NOTIFICATION_SELECT} WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(userId, safeLimit + 1, safeOffset);

  return {
    items: rows.slice(0, safeLimit).map(toNotificationResponse),
    total,
    hasMore: rows.length > safeLimit,
    unread: countUnreadNotifications(userId),
    limit: safeLimit,
    offset: safeOffset,
  };
}

/** Отметка «прочитано»: идемпотентно, чужое уведомление недоступно. */
export function markNotificationRead(id, userId = getCurrentUserId()) {
  if (!userId) return { status: 'not_found' };
  const db = getDb();
  const row = db.prepare('SELECT read_at FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return { status: 'not_found' };
  if (row.read_at === null) {
    db.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      id,
    );
  }
  return { status: 'ok', notification: findNotification(id) };
}

/** Отметка «прочитано» для всех уведомлений получателя. */
export function markAllNotificationsRead(userId = getCurrentUserId()) {
  if (!userId) return { status: 'ok', updated: 0, unread: 0 };
  const result = getDb()
    .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(new Date().toISOString(), userId);
  return { status: 'ok', updated: result.changes ?? 0, unread: 0 };
}

/**
 * Удаление уведомлений по началу ключа источника.
 * Нужно для пересчёта уведомлений задачи после смены срока.
 */
export function deleteNotificationsBySourcePrefix(prefix) {
  const result = getDb()
    .prepare('DELETE FROM notifications WHERE source_key LIKE ?')
    .run(`${prefix}%`);
  return result.changes ?? 0;
}
