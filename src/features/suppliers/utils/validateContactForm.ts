/**
 * Клиентская проверка формы контактного лица поставщика и преобразование
 * значений в тело запроса.
 * Правила и сообщения совпадают с серверной проверкой
 * server/supplierContactsValidation.mjs; маска и сообщения телефона — общие
 * с клиентами (clients/utils/phone.ts).
 */

import type { SupplierContactInput } from '../api/suppliersApi';
import type {
  SupplierContact,
  SupplierContactFormErrors,
  SupplierContactFormValues,
} from '../types';
import { toPhoneDigits, toPhoneValue, validatePhone } from '../../clients/utils/phone';

/** Лимиты длины: те же значения в форме, API и базе. */
export const CONTACT_LIMITS = {
  namePart: 100,
  position: 100,
  email: 254,
  comment: 500,
} as const;

/** Формат проверки E-mail. Совпадает с серверным. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об обязательных полях и остальных ошибках. */
export const CONTACT_FIELD_MESSAGES = {
  firstName: 'Введите имя',
  position: 'Введите должность',
  phone: 'Введите телефон',
  email: 'Укажите корректный E-mail',
  comment: 'Комментарий не должен превышать 500 символов',
} as const;

/** Сообщения о занятом телефоне (раздел 4 ТЗ). */
export const CONTACT_PHONE_MESSAGES = {
  duplicateInList: 'Контакт с таким телефоном уже есть в списке: ',
  worksElsewhere: 'Контакт с таким телефоном уже работает у поставщика: ',
  inactiveElsewhere: 'Контакт с таким телефоном числится у поставщика: ',
  inactiveSuffix: ' (не работает)',
} as const;

/** Порядок полей формы: перевод фокуса к первому некорректному. */
export const CONTACT_FIELD_ORDER: readonly (keyof SupplierContactFormValues)[] = [
  'lastName',
  'firstName',
  'middleName',
  'position',
  'phone',
  'email',
  'status',
  'comment',
];

/** Пустые значения формы: статус «Работает», флажок снят. */
export const EMPTY_CONTACT_FORM: SupplierContactFormValues = {
  lastName: '',
  firstName: '',
  middleName: '',
  position: '',
  phone: '',
  email: '',
  status: 'active',
  isPrimary: false,
  comment: '',
};

/** Соответствие полей запроса и полей формы. */
const API_TO_FORM: Record<string, keyof SupplierContactFormValues> = {
  last_name: 'lastName',
  first_name: 'firstName',
  middle_name: 'middleName',
  position: 'position',
  phone: 'phone',
  email: 'email',
  status: 'status',
  comment: 'comment',
};

/** Ошибки полей из ответа сервера в модель формы. */
export function mapContactServerErrors(
  fieldErrors: Record<string, string>,
): SupplierContactFormErrors {
  const errors: SupplierContactFormErrors = {};
  for (const [field, message] of Object.entries(fieldErrors)) {
    const key = API_TO_FORM[field];
    if (key) errors[key] = message;
  }
  return errors;
}

/** Значения формы из контакта. */
export function toSupplierContactFormValues(contact: SupplierContact): SupplierContactFormValues {
  return {
    lastName: contact.lastName ?? '',
    firstName: contact.firstName,
    middleName: contact.middleName ?? '',
    position: contact.position,
    phone: toPhoneDigits(contact.phone),
    email: contact.email ?? '',
    status: contact.status,
    isPrimary: contact.isPrimary,
    comment: contact.comment ?? '',
  };
}

/** Проверяет значения формы. */
export function validateContactForm(values: SupplierContactFormValues): SupplierContactFormErrors {
  const errors: SupplierContactFormErrors = {};

  if (values.firstName.trim() === '') {
    errors.firstName = CONTACT_FIELD_MESSAGES.firstName;
  } else if (values.firstName.trim().length > CONTACT_LIMITS.namePart) {
    errors.firstName = `Не более ${CONTACT_LIMITS.namePart} символов`;
  }

  if (values.lastName.trim().length > CONTACT_LIMITS.namePart) {
    errors.lastName = `Не более ${CONTACT_LIMITS.namePart} символов`;
  }

  if (values.middleName.trim().length > CONTACT_LIMITS.namePart) {
    errors.middleName = `Не более ${CONTACT_LIMITS.namePart} символов`;
  }

  if (values.position.trim() === '') {
    errors.position = CONTACT_FIELD_MESSAGES.position;
  } else if (values.position.trim().length > CONTACT_LIMITS.position) {
    errors.position = `Не более ${CONTACT_LIMITS.position} символов`;
  }

  const phone = values.phone.trim();
  if (phone === '') {
    errors.phone = CONTACT_FIELD_MESSAGES.phone;
  } else {
    const phoneError = validatePhone(phone);
    if (phoneError) errors.phone = phoneError;
  }

  const email = values.email.trim();
  if (email !== '' && (email.length > CONTACT_LIMITS.email || !EMAIL_PATTERN.test(email))) {
    errors.email = CONTACT_FIELD_MESSAGES.email;
  }

  if (values.comment.length > CONTACT_LIMITS.comment) {
    errors.comment = CONTACT_FIELD_MESSAGES.comment;
  }

  return errors;
}

/** Внешние пробелы убираются, пустое значение становится null. */
function optionalText(value: string): string | null {
  const text = value.trim();
  return text === '' ? null : text;
}

/** Значения формы -> тело запроса. Телефон — в формате хранения. */
export function toSupplierContactInput(
  values: SupplierContactFormValues,
): SupplierContactInput {
  return {
    last_name: optionalText(values.lastName),
    first_name: values.firstName.trim(),
    middle_name: optionalText(values.middleName),
    position: values.position.trim(),
    phone: toPhoneValue(values.phone.trim()),
    email: optionalText(values.email),
    status: values.status,
    // Основной контакт может быть только работающим.
    is_primary: values.status === 'active' && values.isPrimary,
    comment: optionalText(values.comment),
  };
}
