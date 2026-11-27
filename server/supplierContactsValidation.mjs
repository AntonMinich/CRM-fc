/**
 * Серверная валидация контактного лица поставщика.
 * Правила совпадают с клиентскими: обязательные поля, длины, телефон
 * (server/phone.mjs) и E-mail.
 */

import { normalizePhone } from './phone.mjs';

/** Лимиты длины совпадают с формой, API и CHECK-ограничениями в базе. */
export const CONTACT_LIMITS = {
  namePart: 100,
  position: 100,
  email: 254,
  comment: 500,
};

/** Статусы контакта: работает или не работает. */
export const CONTACT_STATUSES = ['active', 'inactive'];

/** Формат проверки E-mail. Совпадает с клиентской и серверной проверкой клиентов. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об ошибках полей. */
export const CONTACT_FIELD_MESSAGES = {
  firstName: 'Введите имя',
  position: 'Введите должность',
  phone: 'Введите телефон',
  email: 'Укажите корректный E-mail',
  comment: 'Комментарий не должен превышать 500 символов',
};

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** Необязательное текстовое поле: внешние пробелы убираются, пустое значение -> null. */
function optionalText(value) {
  const text = asText(value);
  if (text === null) return { error: true };
  const trimmed = text.trim();
  return { value: trimmed === '' ? null : trimmed };
}

/** Обязательное текстовое поле: должно быть не пустым после удаления пробелов. */
function requiredText(value, maxLength) {
  const text = asText(value);
  if (text === null) return { error: true };
  const trimmed = text.trim();
  if (trimmed === '') return { empty: true };
  if (trimmed.length > maxLength) return { tooLong: true };
  return { value: trimmed };
}

/** Флажок «Основной контакт» приходит как boolean, 1 или «true». */
function asFlag(value) {
  return value === true || value === 1 || value === 'true';
}

/**
 * Проверяет тело запроса создания и обновления контакта.
 * @param {unknown} payload тело запроса
 * @returns {{ ok: true, data: object } | { ok: false, fieldErrors: Record<string, string> }}
 */
export function validateContactPayload(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const fieldErrors = {};

  const lastName = optionalText(body.last_name);
  if (lastName.error || (lastName.value && lastName.value.length > CONTACT_LIMITS.namePart)) {
    fieldErrors.last_name = `Не более ${CONTACT_LIMITS.namePart} символов`;
  }

  const firstName = requiredText(body.first_name, CONTACT_LIMITS.namePart);
  if (firstName.error || firstName.empty) {
    fieldErrors.first_name = CONTACT_FIELD_MESSAGES.firstName;
  } else if (firstName.tooLong) {
    fieldErrors.first_name = `Не более ${CONTACT_LIMITS.namePart} символов`;
  }

  const middleName = optionalText(body.middle_name);
  if (middleName.error || (middleName.value && middleName.value.length > CONTACT_LIMITS.namePart)) {
    fieldErrors.middle_name = `Не более ${CONTACT_LIMITS.namePart} символов`;
  }

  const position = requiredText(body.position, CONTACT_LIMITS.position);
  if (position.error || position.empty) {
    fieldErrors.position = CONTACT_FIELD_MESSAGES.position;
  } else if (position.tooLong) {
    fieldErrors.position = `Не более ${CONTACT_LIMITS.position} символов`;
  }

  // Телефон обязателен: пустое поле даёт своё сообщение, остальное — как у клиентов.
  let phoneValue = null;
  const rawPhone = asText(body.phone);
  if (rawPhone === null || rawPhone.trim() === '') {
    fieldErrors.phone = CONTACT_FIELD_MESSAGES.phone;
  } else {
    const phone = normalizePhone(rawPhone);
    if (phone.error) {
      fieldErrors.phone = phone.error;
    } else {
      phoneValue = phone.value;
    }
  }

  const email = optionalText(body.email);
  if (
    email.error ||
    (email.value &&
      (email.value.length > CONTACT_LIMITS.email || !EMAIL_PATTERN.test(email.value)))
  ) {
    fieldErrors.email = CONTACT_FIELD_MESSAGES.email;
  }

  const comment = optionalText(body.comment);
  if (comment.error || (comment.value && comment.value.length > CONTACT_LIMITS.comment)) {
    fieldErrors.comment = CONTACT_FIELD_MESSAGES.comment;
  }

  const rawStatus = asText(body.status);
  const status = rawStatus === null || rawStatus.trim() === '' ? 'active' : rawStatus.trim();
  if (!CONTACT_STATUSES.includes(status)) {
    fieldErrors.status = 'Недопустимый статус';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      last_name: lastName.value,
      first_name: firstName.value,
      middle_name: middleName.value,
      position: position.value,
      phone: phoneValue,
      email: email.value,
      status,
      // Основной контакт может быть только работающим.
      is_primary: status === 'active' && asFlag(body.is_primary),
      comment: comment.value,
    },
  };
}
