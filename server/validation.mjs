/**
 * Серверная валидация и подготовка данных клиента (разделы 7 и 8.3 ТЗ).
 * Правила совпадают с клиентской валидацией src/features/clients/utils/validateClient.ts.
 */

import { normalizePhone } from './phone.mjs';

/** Лимиты длины совпадают с формой, API и CHECK-ограничениями в базе. */
export const LIMITS = {
  namePart: 100,
  phone: 50,
  email: 254,
  comment: 500,
};

/** Формат проверки E-mail. Совпадает с клиентской проверкой. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Реквизиты клиента: адресные поля и их лимиты длины. Ключи совпадают с колонками
 * таблицы «Клиенты», поэтому список используется и в запросах к базе.
 * Обязательных адресных полей нет — проверяется только длина.
 */
export const ADDRESS_LIMITS = {
  reg_postal_code: 20,
  reg_country: 100,
  reg_city: 100,
  reg_street: 150,
  reg_house: 20,
  reg_building: 20,
  reg_apartment: 20,
  res_postal_code: 20,
  res_country: 100,
  res_city: 100,
  res_street: 150,
  res_house: 20,
  res_building: 20,
  res_apartment: 20,
};

/** Имена адресных колонок в порядке объявления. */
export const ADDRESS_COLUMNS = Object.keys(ADDRESS_LIMITS);

/** Сообщения об ошибках полей — из раздела 7 ТЗ. */
export const FIELD_ERROR_MESSAGES = {
  first_name: 'Укажите имя',
  phone: 'Укажите телефон',
  responsible_user_id: 'Выберите ответственного',
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

/**
 * Проверяет тело запроса создания клиента.
 * @param {unknown} payload тело запроса
 * @param {{ isResponsibleSelectable: (id: string) => boolean }} deps
 * @returns {{ ok: true, data: object } | { ok: false, fieldErrors: Record<string, string> }}
 */
export function validateClientPayload(payload, deps) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const fieldErrors = {};

  const lastName = optionalText(body.last_name);
  if (lastName.error || (lastName.value && lastName.value.length > LIMITS.namePart)) {
    fieldErrors.last_name = `Фамилия не длиннее ${LIMITS.namePart} символов`;
  }

  const firstName = requiredText(body.first_name, LIMITS.namePart);
  if (firstName.error || firstName.empty || firstName.tooLong) {
    fieldErrors.first_name = FIELD_ERROR_MESSAGES.first_name;
  }

  const middleName = optionalText(body.middle_name);
  if (middleName.error || (middleName.value && middleName.value.length > LIMITS.namePart)) {
    fieldErrors.middle_name = `Отчество не длиннее ${LIMITS.namePart} символов`;
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

  const responsible = asText(body.responsible_user_id);
  const responsibleId = responsible === null ? '' : responsible.trim();
  if (responsibleId === '' || !deps.isResponsibleSelectable(responsibleId)) {
    fieldErrors.responsible_user_id = FIELD_ERROR_MESSAGES.responsible_user_id;
  }

  // Комментарий необязателен: внешние пробелы и переводы строк по краям убираются,
  // пустое значение сохраняется как NULL. Переводы строк внутри допустимы и
  // считаются по одному символу.
  const comment = optionalText(body.comment);
  if (comment.error || (comment.value && comment.value.length > LIMITS.comment)) {
    fieldErrors.comment = FIELD_ERROR_MESSAGES.comment;
  }

  // Реквизиты: необязательные адресные поля, проверяется только длина.
  const address = {};
  for (const [field, limit] of Object.entries(ADDRESS_LIMITS)) {
    const value = optionalText(body[field]);
    if (value.error || (value.value && value.value.length > limit)) {
      fieldErrors[field] = `Не более ${limit} символов`;
    } else {
      address[field] = value.value;
    }
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
      phone: phone.value,
      email: email.value,
      responsible_user_id: responsibleId,
      comment: comment.value,
      ...address,
    },
  };
}
