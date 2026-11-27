/**
 * Запросы к таблице «Контактные лица поставщиков» (supplier_contacts).
 *
 * Контакт — отдельная сущность, не клиент. Телефон уникален среди контактов и
 * сравнивается по цифрам национальной части, поэтому запись в другом формате
 * тоже находится. Пометка «Основной» — не более одного работающего контакта на
 * поставщика; перенос контакта к другому поставщику выполняется в транзакции.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';
import { extractNationalDigits } from './phone.mjs';

const CONTACT_SELECT = `
  SELECT c.id,
         c.supplier_id,
         c.last_name,
         c.first_name,
         c.middle_name,
         c.position,
         c.phone,
         c.email,
         c.status,
         c.is_primary,
         c.comment,
         c.created_at,
         c.updated_at
    FROM supplier_contacts c`;

/** Строка базы -> объект для API. */
function toContactResponse(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    last_name: row.last_name ?? null,
    first_name: row.first_name,
    middle_name: row.middle_name ?? null,
    position: row.position,
    phone: row.phone,
    email: row.email ?? null,
    status: row.status,
    is_primary: row.is_primary === 1,
    comment: row.comment ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** В ошибках по телефону раскрываются только идентификатор и части имени. */
function contactNameRef(row) {
  return {
    id: row.id,
    last_name: row.last_name ?? null,
    first_name: row.first_name,
    middle_name: row.middle_name ?? null,
  };
}

/** Идентификатор и наименование поставщика: больше ничего не раскрывается. */
function supplierRef(supplierId) {
  const row = getDb().prepare('SELECT id, name FROM suppliers WHERE id = ?').get(supplierId);
  return row ? { id: row.id, name: row.name } : null;
}

/** Метка времени строго позже предыдущей. */
function nextTimestamp(previousIso) {
  const now = Date.now();
  const previous = Date.parse(previousIso ?? '');
  const value = Number.isFinite(previous) && previous >= now ? previous + 1 : now;
  return new Date(value).toISOString();
}

/** Контакты поставщика: основной сверху, дальше — по дате создания. */
export function listSupplierContacts(supplierId) {
  const items = getDb()
    .prepare(
      `${CONTACT_SELECT}
        WHERE c.supplier_id = ?
        ORDER BY c.is_primary DESC, c.created_at ASC, c.id ASC`,
    )
    .all(supplierId)
    .map(toContactResponse);
  return { items, total: items.length };
}

/** Карточка контакта. */
export function getSupplierContactById(id) {
  const row = getDb().prepare(`${CONTACT_SELECT} WHERE c.id = ?`).get(id);
  return row ? toContactResponse(row) : null;
}

/**
 * Контакт с таким же нормализованным телефоном.
 * @returns {object|null} строка базы с id, supplier_id, частями имени и статусом
 */
export function findContactByPhone(phone, excludeId = null) {
  const digits = extractNationalDigits(phone);
  if (digits === '') return null;

  return (
    getDb()
      .prepare(
        `SELECT id, supplier_id, last_name, first_name, middle_name, phone, status, updated_at
           FROM supplier_contacts`,
      )
      .all()
      .find((row) => row.id !== excludeId && extractNationalDigits(row.phone) === digits) ?? null
  );
}

/** Есть ли у поставщика основной контакт (кроме указанного). */
function hasPrimaryContact(supplierId, exceptId = null) {
  const row = getDb()
    .prepare(
      'SELECT id FROM supplier_contacts WHERE supplier_id = ? AND is_primary = 1 AND id <> ?',
    )
    .get(supplierId, exceptId ?? '');
  return Boolean(row);
}

/** Прежний основной контакт теряет пометку. */
function clearPrimaryContacts(supplierId, exceptId = null) {
  getDb()
    .prepare('UPDATE supplier_contacts SET is_primary = 0 WHERE supplier_id = ? AND id <> ?')
    .run(supplierId, exceptId ?? '');
}

/**
 * Нарушение уникального индекса по телефону: гонка одновременных запросов.
 */
function isPhoneUniqueViolation(error) {
  const message = String(error?.message ?? '');
  return (
    error?.errcode === 2067 ||
    (message.includes('UNIQUE constraint failed') && message.includes('supplier_contacts.phone'))
  );
}

/** Ответ на найденный дубль: код зависит от поставщика и статуса найденного контакта. */
function duplicateResult(row, supplierId) {
  if (row.supplier_id === supplierId) {
    return { status: 'duplicate_contact_phone', contact: contactNameRef(row) };
  }
  const supplier = supplierRef(row.supplier_id);
  if (row.status === 'active') {
    return { status: 'contact_works_elsewhere', contact: contactNameRef(row), supplier };
  }
  return { status: 'contact_transfer_required', contact: contactNameRef(row), supplier };
}

/**
 * Дубль при создании: контакт другого поставщика с любым статусом переносится
 * после подтверждения, поэтому вместо запрета возвращается запрос переноса.
 */
function duplicateResultForCreate(row, supplierId) {
  if (row.supplier_id === supplierId) {
    return { status: 'duplicate_contact_phone', contact: contactNameRef(row) };
  }
  return {
    status: 'contact_transfer_required',
    contact: contactNameRef(row),
    supplier: supplierRef(row.supplier_id),
    contactStatus: row.status,
  };
}

/** Основной контакт назначается по правилам: флажок или первый работающий. */
function shouldBePrimary(supplierId, data) {
  if (data.status !== 'active') return false;
  return Boolean(data.is_primary) || !hasPrimaryContact(supplierId);
}

/**
 * Переносит существующую запись контакта текущему поставщику (случай г).
 * Вызывается внутри транзакции; состояние проверяется повторно.
 */
function transferContact(db, contact, supplierId, data) {
  const fresh = db
    .prepare('SELECT id, supplier_id, status, updated_at FROM supplier_contacts WHERE id = ?')
    .get(contact.id);
  if (!fresh) {
    db.exec('ROLLBACK');
    return { status: 'contact_not_found' };
  }
  if (fresh.supplier_id === supplierId) {
    db.exec('ROLLBACK');
    return { status: 'duplicate_contact_phone', contact: contactNameRef(fresh) };
  }

  const isPrimary = shouldBePrimary(supplierId, data);
  if (isPrimary) clearPrimaryContacts(supplierId);

  db.prepare(
    `UPDATE supplier_contacts
        SET supplier_id = ?,
            last_name = ?,
            first_name = ?,
            middle_name = ?,
            position = ?,
            phone = ?,
            email = ?,
            status = ?,
            is_primary = ?,
            comment = ?,
            updated_at = ?
      WHERE id = ?`,
  ).run(
    supplierId,
    data.last_name,
    data.first_name,
    data.middle_name,
    data.position,
    data.phone,
    data.email,
    data.status,
    isPrimary ? 1 : 0,
    data.comment,
    nextTimestamp(fresh.updated_at),
    contact.id,
  );

  const saved = getSupplierContactById(contact.id);
  db.exec('COMMIT');
  return { status: 'ok', contact: saved, transferred: true };
}
/**
 * Создаёт контакт поставщика.
 *
 * @param {string} supplierId поставщик
 * @param {object} data результат серверной валидации
 * @param {{ confirmTransfer?: boolean }} options подтверждение переноса (случай г)
 * @returns {{ status: 'ok', contact: object, transferred?: boolean }
 *   | { status: 'supplier_not_found' }
 *   | { status: 'duplicate_contact_phone', contact: object }
 *   | { status: 'contact_works_elsewhere', contact: object, supplier: object|null }
 *   | { status: 'contact_transfer_required', contact: object, supplier: object|null }}
 */
export function createSupplierContact(supplierId, data, { confirmTransfer = false } = {}) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    if (!supplierRef(supplierId)) {
      db.exec('ROLLBACK');
      return { status: 'supplier_not_found' };
    }

    const existing = findContactByPhone(data.phone);
    if (existing) {
      // Перенос возможен для контакта другого поставщика с любым статусом.
      const canTransfer = confirmTransfer && existing.supplier_id !== supplierId;
      if (!canTransfer) {
        const result = duplicateResultForCreate(existing, supplierId);
        db.exec('ROLLBACK');
        return result;
      }
      return transferContact(db, existing, supplierId, data);
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const isPrimary = shouldBePrimary(supplierId, data);
    if (isPrimary) clearPrimaryContacts(supplierId);

    db.prepare(
      `INSERT INTO supplier_contacts
         (id, supplier_id, last_name, first_name, middle_name, position, phone, email,
          status, is_primary, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      supplierId,
      data.last_name,
      data.first_name,
      data.middle_name,
      data.position,
      data.phone,
      data.email,
      data.status,
      isPrimary ? 1 : 0,
      data.comment,
      now,
      now,
    );

    const contact = getSupplierContactById(id);
    db.exec('COMMIT');
    return { status: 'ok', contact };
  } catch (error) {
    db.exec('ROLLBACK');
    if (isPhoneUniqueViolation(error)) {
      const duplicate = findContactByPhone(data.phone);
      if (duplicate) return duplicateResultForCreate(duplicate, supplierId);
    }
    throw error;
  }
}

/**
 * Обновляет поля контакта. `id` и `created_at` не меняются, `updated_at` задаёт
 * сервер. Перенос к другому поставщику при редактировании не выполняется:
 * телефон занятого контакта возвращает тот же код, что и при создании.
 *
 * @returns {{ status: 'ok', contact: object }
 *   | { status: 'not_found' }
 *   | { status: 'duplicate_contact_phone', contact: object }
 *   | { status: 'contact_works_elsewhere', contact: object, supplier: object|null }
 *   | { status: 'contact_transfer_required', contact: object, supplier: object|null }}
 */
export function updateSupplierContact(contactId, data) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const existing = db
      .prepare(
        'SELECT id, supplier_id, phone, status, updated_at FROM supplier_contacts WHERE id = ?',
      )
      .get(contactId);
    if (!existing) {
      db.exec('ROLLBACK');
      return { status: 'not_found' };
    }

    // Дубли ищем только при смене телефона; своя запись не считается.
    if (extractNationalDigits(data.phone) !== extractNationalDigits(existing.phone)) {
      const duplicate = findContactByPhone(data.phone, contactId);
      if (duplicate) {
        const result = duplicateResult(duplicate, existing.supplier_id);
        db.exec('ROLLBACK');
        return result;
      }
    }

    // Статус «Не работает» снимает пометку основного; другой контакт не назначается.
    const isPrimary = data.status === 'active' && Boolean(data.is_primary);
    if (isPrimary) clearPrimaryContacts(existing.supplier_id, contactId);

    db.prepare(
      `UPDATE supplier_contacts
          SET last_name = ?,
              first_name = ?,
              middle_name = ?,
              position = ?,
              phone = ?,
              email = ?,
              status = ?,
              is_primary = ?,
              comment = ?,
              updated_at = ?
        WHERE id = ?`,
    ).run(
      data.last_name,
      data.first_name,
      data.middle_name,
      data.position,
      data.phone,
      data.email,
      data.status,
      isPrimary ? 1 : 0,
      data.comment,
      nextTimestamp(existing.updated_at),
      contactId,
    );

    const contact = getSupplierContactById(contactId);
    db.exec('COMMIT');
    return { status: 'ok', contact };
  } catch (error) {
    db.exec('ROLLBACK');
    if (isPhoneUniqueViolation(error)) {
      const duplicate = findContactByPhone(data.phone, contactId);
      if (duplicate) return duplicateResult(duplicate, existingSupplierOf(contactId));
    }
    throw error;
  }
}

/** Поставщик контакта: нужен для кода ошибки при гонке одновременных запросов. */
function existingSupplierOf(contactId) {
  const row = getDb()
    .prepare('SELECT supplier_id FROM supplier_contacts WHERE id = ?')
    .get(contactId);
  return row?.supplier_id ?? null;
}

