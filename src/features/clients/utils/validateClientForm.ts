/**
 * Клиентская проверка формы создания клиента (раздел 7 ТЗ).
 * Правила и сообщения совпадают с серверной проверкой server/validation.mjs.
 */

import type { ClientFormErrors, ClientFormValues } from '../types';
import { toPhoneValue, validatePhone } from './phone';

/** Лимиты длины: те же значения в форме, API и базе. */
export const CLIENT_LIMITS = {
  namePart: 100,
  phone: 50,
  email: 254,
} as const;

/** Формат проверки E-mail. Совпадает с серверным. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об ошибках полей. Сообщения телефона — в utils/phone.ts. */
export const CLIENT_FIELD_MESSAGES = {
  firstName: 'Укажите имя',
  responsibleUserId: 'Выберите ответственного',
  email: 'Укажите корректный E-mail',
} as const;

/** Пустые значения формы. */
export const EMPTY_CLIENT_FORM: ClientFormValues = {
  lastName: '',
  firstName: '',
  middleName: '',
  phone: '',
  email: '',
  responsibleUserId: '',
};

/**
 * Проверяет значения формы.
 * @param values значения полей
 * @param isResponsibleAllowed проверка выбранного пользователя по справочнику
 */
export function validateClientForm(
  values: ClientFormValues,
  isResponsibleAllowed: (id: string) => boolean,
): ClientFormErrors {
  const errors: ClientFormErrors = {};

  if (values.firstName.trim() === '') {
    errors.firstName = CLIENT_FIELD_MESSAGES.firstName;
  }
  const phoneError = validatePhone(values.phone.trim());
  if (phoneError) {
    errors.phone = phoneError;
  }
  if (values.responsibleUserId.trim() === '' || !isResponsibleAllowed(values.responsibleUserId)) {
    errors.responsibleUserId = CLIENT_FIELD_MESSAGES.responsibleUserId;
  }

  const email = values.email.trim();
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    errors.email = CLIENT_FIELD_MESSAGES.email;
  }

  return errors;
}

/** Преобразует значения формы в тело запроса: внешние пробелы удаляются. */
export function toCreateClientInput(values: ClientFormValues) {
  const lastName = values.lastName.trim();
  const middleName = values.middleName.trim();
  const email = values.email.trim();
  return {
    last_name: lastName === '' ? null : lastName,
    first_name: values.firstName.trim(),
    middle_name: middleName === '' ? null : middleName,
    phone: toPhoneValue(values.phone.trim()),
    email: email === '' ? null : email,
    responsible_user_id: values.responsibleUserId.trim(),
  };
}
