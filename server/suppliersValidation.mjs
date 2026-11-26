/**
 * Серверная валидация и подготовка данных поставщика.
 * Правила совпадают с клиентскими: обязательные поля, длина, формат УНП,
 * телефон (server/phone.mjs) и E-mail.
 */

import { normalizePhone } from './phone.mjs';

/** Лимиты длины совпадают с формой, API и CHECK-ограничениями в базе. */
export const LIMITS = {
  name: 200,
  unp: 9,
  phone: 50,
  email: 254,
  comment: 500,
};

/** Формат УНП: ровно девять цифр. */
export const UNP_PATTERN = /^\d{9}$/;

/** Формат проверки E-mail. Совпадает с клиентской проверкой. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об ошибках полей. */
export const FIELD_ERROR_MESSAGES = {
  name: 'Укажите наименование компании',
  unp: 'Введите УНП',
  unpFormat: 'УНП должен содержать 9 цифр',
  phone: 'Укажите телефон',
  email: 'Укажите корректный E-mail',
  comment: 'Комментарий не должен превышать 500 символов',
};

/** Адресные поля: те же лимиты, что у клиентов. */
export const ADDRESS_LIMITS = {
  reg_postal_code: 20,
  reg_country: 100,
  reg_city: 100,
  reg_street: 150,
  reg_house: 20,
  reg_building: 20,
  reg_apartment: 20,
  post_postal_code: 20,
  post_country: 100,
  post_city: 100,
  post_street: 150,
  post_house: 20,
  post_building: 20,
  post_apartment: 20,
};

/** Банковские поля и руководитель: только длина, часть с верхним регистром. */
export const BANK_LIMITS = {
  bank_account: { limit: 34, upper: true },
  bank_name: { limit: 150, upper: false },
  bic_swift: { limit: 11, upper: true },
  director_name: { limit: 150, upper: false },
};

/** Имена адресных колонок в порядке объявления. */
export const ADDRESS_COLUMNS = Object.keys(ADDRESS_LIMITS);

/** Имена банковских колонок в порядке объявления. */
export const BANK_COLUMNS = Object.keys(BANK_LIMITS);

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

/**
 * Проверяет тело запроса создания и обновления поставщика.
 * @param {unknown} payload тело запроса
 * @returns {{ ok: true, data: object } | { ok: false, fieldErrors: Record<string, string> }}
 */
export function validateSupplierPayload(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const fieldErrors = {};

  const name = requiredText(body.name, LIMITS.name);
  if (name.error || name.empty) {
    fieldErrors.name = FIELD_ERROR_MESSAGES.name;
  } else if (name.tooLong) {
    fieldErrors.name = `Не более ${LIMITS.name} символов`;
  }

  // УНП: обязательное поле, только цифры, ровно девять знаков.
  const unpText = asText(body.unp);
  const unp = unpText === null ? '' : unpText.trim();
  if (unp === '') {
    fieldErrors.unp = FIELD_ERROR_MESSAGES.unp;
  } else if (!UNP_PATTERN.test(unp)) {
    fieldErrors.unp = FIELD_ERROR_MESSAGES.unpFormat;
  }

  const phone = normalizePhone(body.phone);
  if (phone.error) {
    fieldErrors.phone = phone.error;
  }

  const email = optionalText(body.email);
  if (email.error || (email.value && email.value.length > LIMITS.email)) {
    fieldErrors.email = FIELD_ERROR_MESSAGES.email;
  } else if (email.value && !EMAIL_PATTERN.test(email.value)) {
    fieldErrors.email = FIELD_ERROR_MESSAGES.email;
  }

  // Комментарий необязателен: внешние пробелы убираются, пустое значение — NULL.
  const comment = optionalText(body.comment);
  if (comment.error || (comment.value && comment.value.length > LIMITS.comment)) {
    fieldErrors.comment = FIELD_ERROR_MESSAGES.comment;
  }

  // Реквизиты: необязательные поля, проверяется только длина.
  const details = {};
  for (const [field, limit] of Object.entries(ADDRESS_LIMITS)) {
    const value = optionalText(body[field]);
    if (value.error || (value.value && value.value.length > limit)) {
      fieldErrors[field] = `Не более ${limit} символов`;
    } else {
      details[field] = value.value;
    }
  }

  for (const [field, rule] of Object.entries(BANK_LIMITS)) {
    const value = optionalText(body[field]);
    const text = value.value && rule.upper ? value.value.toUpperCase() : value.value;
    if (value.error || (text && text.length > rule.limit)) {
      fieldErrors[field] = `Не более ${rule.limit} символов`;
    } else {
      details[field] = text ?? null;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      name: name.value,
      unp,
      phone: phone.value,
      email: email.value,
      comment: comment.value,
      ...details,
    },
  };
}
