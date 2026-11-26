/**
 * Клиентская проверка формы клиента и преобразование значений в тело запроса.
 * Правила и сообщения совпадают с серверной проверкой server/validation.mjs.
 * Используется и окном создания, и карточкой редактирования.
 */

import type { Client, ClientFormErrors, ClientFormValues, ClientTab } from '../types';
import { ADDRESS_FIELDS, ADDRESS_LIMITS, addressLengthMessage, isAddressField } from '../config/addressFields';
import { toPhoneDigits, toPhoneValue, validatePhone } from './phone';

/** Лимиты длины: те же значения в форме, API и базе. */
export const CLIENT_LIMITS = {
  namePart: 100,
  phone: 50,
  email: 254,
  comment: 500,
} as const;

/** Формат проверки E-mail. Совпадает с серверным. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об ошибках полей. Сообщения телефона — в utils/phone.ts. */
export const CLIENT_FIELD_MESSAGES = {
  firstName: 'Укажите имя',
  responsibleUserId: 'Выберите ответственного',
  email: 'Укажите корректный E-mail',
  comment: 'Комментарий не должен превышать 500 символов',
} as const;

/** Порядок полей формы: перевод фокуса к первому некорректному. */
export const FIELD_ORDER: readonly (keyof ClientFormValues)[] = [
  'lastName',
  'firstName',
  'middleName',
  'phone',
  'email',
  'responsibleUserId',
  'comment',
  ...ADDRESS_FIELDS,
];

/** Соответствие полей формы и полей запроса. */
export const API_FIELD_NAMES: Record<keyof ClientFormValues, string> = {
  lastName: 'last_name',
  firstName: 'first_name',
  middleName: 'middle_name',
  phone: 'phone',
  email: 'email',
  responsibleUserId: 'responsible_user_id',
  comment: 'comment',
  regPostalCode: 'reg_postal_code',
  regCountry: 'reg_country',
  regCity: 'reg_city',
  regStreet: 'reg_street',
  regHouse: 'reg_house',
  regBuilding: 'reg_building',
  regApartment: 'reg_apartment',
  resPostalCode: 'res_postal_code',
  resCountry: 'res_country',
  resCity: 'res_city',
  resStreet: 'res_street',
  resHouse: 'res_house',
  resBuilding: 'res_building',
  resApartment: 'res_apartment',
};

/** Пустые значения формы. */
export const EMPTY_CLIENT_FORM: ClientFormValues = {
  lastName: '',
  firstName: '',
  middleName: '',
  phone: '',
  email: '',
  responsibleUserId: '',
  comment: '',
  regPostalCode: '',
  regCountry: '',
  regCity: '',
  regStreet: '',
  regHouse: '',
  regBuilding: '',
  regApartment: '',
  resPostalCode: '',
  resCountry: '',
  resCity: '',
  resStreet: '',
  resHouse: '',
  resBuilding: '',
  resApartment: '',
};

/** Вкладка, на которой находится поле формы. */
export function tabForField(field: keyof ClientFormValues): ClientTab {
  return isAddressField(field) ? 'addresses' : 'main';
}

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

  // Комментарий необязателен: проверяется только длина после удаления пробелов
  // по краям. Переводы строк внутри допустимы.
  if (values.comment.trim().length > CLIENT_LIMITS.comment) {
    errors.comment = CLIENT_FIELD_MESSAGES.comment;
  }

  // Реквизиты: необязательные адресные поля, проверяется только длина.
  for (const field of ADDRESS_FIELDS) {
    const limit = ADDRESS_LIMITS[field];
    if (values[field].trim().length > limit) {
      errors[field] = addressLengthMessage(limit);
    }
  }

  return errors;
}

/** Ошибки полей ответа сервера в формате формы. */
export function mapServerFieldErrors(fieldErrors: Record<string, string>): ClientFormErrors {
  const mapped: ClientFormErrors = {};
  for (const field of FIELD_ORDER) {
    const message = fieldErrors[API_FIELD_NAMES[field]];
    if (message) mapped[field] = message;
  }
  return mapped;
}

/** Значения формы из записи клиента: телефон приводится к цифрам национальной части. */
export function toClientFormValues(client: Client): ClientFormValues {
  const values: ClientFormValues = {
    ...EMPTY_CLIENT_FORM,
    lastName: client.lastName ?? '',
    firstName: client.firstName,
    middleName: client.middleName ?? '',
    phone: toPhoneDigits(client.phone),
    email: client.email ?? '',
    responsibleUserId: client.responsibleUserId,
    comment: client.comment ?? '',
  };

  for (const field of ADDRESS_FIELDS) {
    values[field] = client[field] ?? '';
  }

  return values;
}

/** Необязательное текстовое значение: пробелы по краям убраны, пустое — null. */
function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Поля формы для тела запроса: внешние пробелы удаляются, пустое значение — null. */
function toClientInput(values: ClientFormValues) {
  const lastName = values.lastName.trim();
  const middleName = values.middleName.trim();
  const email = values.email.trim();
  const comment = values.comment.trim();
  return {
    last_name: lastName === '' ? null : lastName,
    first_name: values.firstName.trim(),
    middle_name: middleName === '' ? null : middleName,
    phone: toPhoneValue(values.phone.trim()),
    email: email === '' ? null : email,
    responsible_user_id: values.responsibleUserId.trim(),
    comment: comment === '' ? null : comment,
    reg_postal_code: optionalValue(values.regPostalCode),
    reg_country: optionalValue(values.regCountry),
    reg_city: optionalValue(values.regCity),
    reg_street: optionalValue(values.regStreet),
    reg_house: optionalValue(values.regHouse),
    reg_building: optionalValue(values.regBuilding),
    reg_apartment: optionalValue(values.regApartment),
    res_postal_code: optionalValue(values.resPostalCode),
    res_country: optionalValue(values.resCountry),
    res_city: optionalValue(values.resCity),
    res_street: optionalValue(values.resStreet),
    res_house: optionalValue(values.resHouse),
    res_building: optionalValue(values.resBuilding),
    res_apartment: optionalValue(values.resApartment),
  };
}

/** Тело запроса создания. */
export function toCreateClientInput(values: ClientFormValues) {
  return toClientInput(values);
}

/**
 * Тело запроса обновления: те же поля плюс значение `updated_at`, которое было
 * у карточки при открытии. По нему сервер отличает актуальную запись от устаревшей.
 */
export function toUpdateClientInput(values: ClientFormValues, expectedUpdatedAt: string) {
  return { ...toClientInput(values), expected_updated_at: expectedUpdatedAt };
}
