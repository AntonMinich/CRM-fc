/**
 * Запросы к таблице «Поставщики» (suppliers).
 * Все параметры передаются через подготовленные выражения.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';
import { extractNationalDigits } from './phone.mjs';
import { ADDRESS_COLUMNS, BANK_COLUMNS } from './suppliersValidation.mjs';

/** Реквизиты возвращаются только в карточке, в списке их нет. */
const DETAIL_COLUMNS = [...ADDRESS_COLUMNS, ...BANK_COLUMNS];

const SUPPLIER_SELECT = `
  SELECT s.id,
         s.name,
         s.unp,
         s.phone,
         s.email,
         s.comment,
         ${DETAIL_COLUMNS.map((field) => `s.${field}`).join(',\n         ')},
         s.created_at,
         s.updated_at
    FROM suppliers s`;

/**
 * Строка базы -> объект для API.
 * `withDetails` включается только для карточки: адреса и банковские реквизиты
 * в ответе списка не возвращаются.
 */
function toSupplierResponse(row, withDetails = false) {
  const supplier = {
    id: row.id,
    name: row.name,
    unp: row.unp,
    phone: row.phone,
    email: row.email ?? null,
    comment: row.comment ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (withDetails) {
    for (const field of DETAIL_COLUMNS) {
      supplier[field] = row[field] ?? null;
    }
  }

  return supplier;
}

/** Все поставщики в порядке по умолчанию: новые сверху. */
export function listAllSuppliers() {
  return getDb()
    .prepare(`${SUPPLIER_SELECT} ORDER BY s.created_at DESC, s.id DESC`)
    .all()
    .map((row) => toSupplierResponse(row));
}

/** Карточка поставщика с реквизитами. */
export function getSupplierById(id) {
  const row = getDb().prepare(`${SUPPLIER_SELECT} WHERE s.id = ?`).get(id);
  return row ? toSupplierResponse(row, true) : null;
}

/**
 * Другие поставщики с таким же телефоном.
 *
 * Телефон не уникален: дубль не блокирует сохранение, о найденных записях
 * сообщают в успешном ответе. Сравниваются цифры национальной части, поэтому
 * запись в старом формате тоже находится; запись `excludeId` не учитывается.
 *
 * @returns {{ items: { id: string, name: string }[], total: number }}
 */
export function findSuppliersByPhone(phone, excludeId = null, limit = 3) {
  const digits = extractNationalDigits(phone);
  if (digits === '') return { items: [], total: 0 };

  const matched = getDb()
    .prepare('SELECT id, phone, name FROM suppliers')
    .all()
    .filter((item) => item.id !== excludeId && extractNationalDigits(item.phone) === digits);

  return {
    items: matched.slice(0, limit).map((item) => ({ id: item.id, name: item.name })),
    total: matched.length,
  };
}

/**
 * Другой поставщик с таким же УНП: сохранение блокируется.
 * @returns {{ id: string, name: string }|null}
 */
export function findSupplierByUnp(unp, excludeId = null) {
  const value = typeof unp === 'string' ? unp.trim() : '';
  if (value === '') return null;

  const db = getDb();
  const row = excludeId
    ? db.prepare('SELECT id, name FROM suppliers WHERE unp = ? AND id <> ?').get(value, excludeId)
    : db.prepare('SELECT id, name FROM suppliers WHERE unp = ?').get(value);
  return row ? { id: row.id, name: row.name } : null;
}

/**
 * Нарушение уникального индекса по УНП: так выглядит гонка одновременных
 * запросов, когда проверка дубля уже пройдена. SQLite: errcode 2067.
 */
function isUnpUniqueViolation(error) {
  const message = String(error?.message ?? '');
  return (
    error?.errcode === 2067 ||
    (message.includes('UNIQUE constraint failed') && message.includes('suppliers.unp'))
  );
}

/**
 * Метка времени строго позже предыдущей.
 * Обновление всегда сдвигает `updated_at`, даже если две правки попали в одну
 * миллисекунду.
 */
function nextTimestamp(previousIso) {
  const now = Date.now();
  const previous = Date.parse(previousIso ?? '');
  const value = Number.isFinite(previous) && previous >= now ? previous + 1 : now;
  return new Date(value).toISOString();
}
/**
 * Создаёт ровно одну запись в таблице «Поставщики».
 * УНП должен быть свободен; совпадения по телефону не блокируют сохранение,
 * а возвращаются в результате как предупреждение.
 *
 * @param {object} data результат серверной валидации
 * @param {string|null} idempotencyKey ключ идемпотентности
 * @returns {{ status: 'ok', supplier: object, duplicatePhoneWith: object|null }
 *   | { status: 'duplicate_unp', duplicate: object }}
 */
export function createSupplier(data, idempotencyKey) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  db.exec('BEGIN');
  try {
    const duplicateUnp = findSupplierByUnp(data.unp);
    if (duplicateUnp) {
      db.exec('ROLLBACK');
      return { status: 'duplicate_unp', duplicate: duplicateUnp };
    }

    db.prepare(
      `INSERT INTO suppliers
         (id, name, unp, phone, email, comment, created_at, updated_at, ${DETAIL_COLUMNS.join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${DETAIL_COLUMNS.map(() => '?').join(', ')})`,
    ).run(
      id,
      data.name,
      data.unp,
      data.phone,
      data.email,
      data.comment,
      now,
      now,
      ...DETAIL_COLUMNS.map((field) => data[field]),
    );

    const supplier = getSupplierById(id);
    const duplicatePhone = findSuppliersByPhone(data.phone, id);

    if (idempotencyKey) {
      db.prepare(
        `INSERT INTO supplier_creation_requests
           (idempotency_key, supplier_id, response_json, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(idempotencyKey, id, JSON.stringify(supplier), now);
    }

    db.exec('COMMIT');
    return {
      status: 'ok',
      supplier,
      duplicatePhoneWith: duplicatePhone.total > 0 ? duplicatePhone : null,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    if (isUnpUniqueViolation(error)) {
      const duplicate = findSupplierByUnp(data.unp);
      if (duplicate) return { status: 'duplicate_unp', duplicate };
    }
    throw error;
  }
}

/**
 * Обновляет поля существующей записи «Поставщики».
 * `id` и `created_at` не меняются, `updated_at` задаёт сервер.
 *
 * @param {string} id идентификатор записи
 * @param {object} data результат серверной валидации
 * @param {{ idempotencyKey?: string|null, expectedUpdatedAt?: string|null }} options
 * @returns {{ status: 'ok', supplier: object, duplicatePhoneWith: object|null }
 *   | { status: 'not_found' }
 *   | { status: 'conflict', supplier: object }
 *   | { status: 'duplicate_unp', duplicate: object }}
 */
export function updateSupplier(id, data, { idempotencyKey = null, expectedUpdatedAt = null } = {}) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    // Телефон нужен, чтобы искать дубли только при его изменении.
    const existing = db.prepare('SELECT updated_at, phone FROM suppliers WHERE id = ?').get(id);
    if (!existing) {
      db.exec('ROLLBACK');
      return { status: 'not_found' };
    }

    // Защита от одновременной правки: значение updated_at, известное клиенту.
    if (expectedUpdatedAt !== null && existing.updated_at !== expectedUpdatedAt) {
      const actual = getSupplierById(id);
      db.exec('ROLLBACK');
      return { status: 'conflict', supplier: actual };
    }

    // УНП должен быть свободен у других поставщиков; своя запись не считается.
    const duplicateUnp = findSupplierByUnp(data.unp, id);
    if (duplicateUnp) {
      db.exec('ROLLBACK');
      return { status: 'duplicate_unp', duplicate: duplicateUnp };
    }

    const updatedAt = nextTimestamp(existing.updated_at);
    db.prepare(
      `UPDATE suppliers
          SET name = ?,
              unp = ?,
              phone = ?,
              email = ?,
              comment = ?,
              updated_at = ?,
              ${DETAIL_COLUMNS.map((field) => `${field} = ?`).join(',\n              ')}
        WHERE id = ?`,
    ).run(
      data.name,
      data.unp,
      data.phone,
      data.email,
      data.comment,
      updatedAt,
      ...DETAIL_COLUMNS.map((field) => data[field]),
      id,
    );

    const supplier = getSupplierById(id);

    // Дубли телефона ищем только при его изменении.
    const phoneChanged =
      extractNationalDigits(data.phone) !== extractNationalDigits(existing.phone);
    const duplicatePhoneWith = phoneChanged ? findSuppliersByPhone(data.phone, id) : null;

    if (idempotencyKey) {
      db.prepare(
        `INSERT OR REPLACE INTO supplier_update_requests
           (idempotency_key, supplier_id, response_json, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(idempotencyKey, id, JSON.stringify(supplier), updatedAt);
    }

    db.exec('COMMIT');
    return {
      status: 'ok',
      supplier,
      duplicatePhoneWith:
        duplicatePhoneWith && duplicatePhoneWith.total > 0 ? duplicatePhoneWith : null,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    if (isUnpUniqueViolation(error)) {
      const duplicate = findSupplierByUnp(data.unp, id);
      if (duplicate) return { status: 'duplicate_unp', duplicate };
    }
    throw error;
  }
}

/** Ранее сохранённый ответ для того же ключа идемпотентности (создание). */
export function findCreationRequest(idempotencyKey) {
  return (
    getDb()
      .prepare('SELECT response_json FROM supplier_creation_requests WHERE idempotency_key = ?')
      .get(idempotencyKey) ?? null
  );
}

/** Ранее сохранённый ответ для того же ключа идемпотентности (обновление). */
export function findUpdateRequest(idempotencyKey) {
  return (
    getDb()
      .prepare('SELECT response_json FROM supplier_update_requests WHERE idempotency_key = ?')
      .get(idempotencyKey) ?? null
  );
}

