/**
 * Серверная валидация и подготовка данных клиента (разделы 7 и 8.3 ТЗ).
 * Правила совпадают с клиентской валидацией src/features/clients/utils/validateClient.ts.
 */

/** Лимиты длины совпадают с формой, API и CHECK-ограничениями в базе. */
export const LIMITS = {
  namePart: 100,
  phone: 50,
  email: 254,
};

/** Формат проверки E-mail. Совпадает с клиентской проверкой. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об ошибках полей — из раздела 7 ТЗ. */
export const FIELD_ERROR_MESSAGES = {
  first_name: 'Укажите имя',
  phone: 'Укажите телефон',
  responsible_user_id: 'Выберите ответственного',
  email: 'Укажите корректный E-mail',
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

  const phone = requiredText(body.phone, LIMITS.phone);
  if (phone.error || phone.empty || phone.tooLong) {
    fieldErrors.phone = FIELD_ERROR_MESSAGES.phone;
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
    },
  };
}
