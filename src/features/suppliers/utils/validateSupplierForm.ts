/**
 * Клиентская проверка формы поставщика и преобразование значений в тело запроса.
 * Правила совпадают с серверной проверкой server/suppliersValidation.mjs.
 * Маска, формат и сообщения телефона — общие с клиентами (clients/utils/phone.ts).
 */

import {
  DETAIL_FIELDS,
  DETAIL_LIMITS,
  detailLengthMessage,
  isDetailField,
} from '../config/supplierFields';
import type { Supplier, SupplierFormErrors, SupplierFormValues, SupplierTab } from '../types';
import { toPhoneDigits, toPhoneValue, validatePhone } from '../../clients/utils/phone';

/** Лимиты длины: те же значения в форме, API и базе. */
export const SUPPLIER_LIMITS = {
  name: 200,
  unp: 9,
  email: 254,
  comment: 500,
} as const;

/** Формат УНП: ровно девять цифр. */
export const UNP_PATTERN = /^\d{9}$/;

/** Формат проверки E-mail. Совпадает с серверным. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Сообщения об ошибках полей. Телефон — в clients/utils/phone.ts. */
export const SUPPLIER_FIELD_MESSAGES = {
  name: 'Укажите наименование компании',
  unp: 'Введите УНП',
  unpFormat: 'УНП должен содержать 9 цифр',
  email: 'Укажите корректный E-mail',
  comment: 'Комментарий не должен превышать 500 символов',
} as const;

/** Сообщение под полем УНП, если такой УНП уже занят другим поставщиком. */
export const DUPLICATE_UNP_MESSAGE = 'Поставщик с таким УНП уже создан: ';

/** Порядок полей формы: перевод фокуса к первому некорректному. */
export const FIELD_ORDER: readonly (keyof SupplierFormValues)[] = [
  'name',
  'unp',
  'phone',
  'email',
  'comment',
  ...DETAIL_FIELDS,
];

/** Соответствие полей формы и полей запроса. */
export const API_FIELD_NAMES: Record<keyof SupplierFormValues, string> = {
  name: 'name',
  unp: 'unp',
  phone: 'phone',
  email: 'email',
  comment: 'comment',
  regPostalCode: 'reg_postal_code',
  regCountry: 'reg_country',
  regCity: 'reg_city',
  regStreet: 'reg_street',
  regHouse: 'reg_house',
  regBuilding: 'reg_building',
  regApartment: 'reg_apartment',
  postPostalCode: 'post_postal_code',
  postCountry: 'post_country',
  postCity: 'post_city',
  postStreet: 'post_street',
  postHouse: 'post_house',
  postBuilding: 'post_building',
  postApartment: 'post_apartment',
  bankAccount: 'bank_account',
  bankName: 'bank_name',
  bicSwift: 'bic_swift',
  directorName: 'director_name',
};

/** Пустые значения формы. */
export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  name: '',
  unp: '',
  phone: '',
  email: '',
  comment: '',
  regPostalCode: '',
  regCountry: '',
  regCity: '',
  regStreet: '',
  regHouse: '',
  regBuilding: '',
  regApartment: '',
  postPostalCode: '',
  postCountry: '',
  postCity: '',
  postStreet: '',
  postHouse: '',
  postBuilding: '',
  postApartment: '',
  bankAccount: '',
  bankName: '',
  bicSwift: '',
  directorName: '',
};

/** Вкладка, на которой находится поле формы. */
export function tabForField(field: keyof SupplierFormValues): SupplierTab {
  return isDetailField(field) ? 'details' : 'main';
}

/** Проверяет значения формы. */
export function validateSupplierForm(values: SupplierFormValues): SupplierFormErrors {
  const errors: SupplierFormErrors = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = SUPPLIER_FIELD_MESSAGES.name;
  } else if (name.length > SUPPLIER_LIMITS.name) {
    errors.name = detailLengthMessage(SUPPLIER_LIMITS.name);
  }

  const unp = values.unp.trim();
  if (unp === '') {
    errors.unp = SUPPLIER_FIELD_MESSAGES.unp;
  } else if (!UNP_PATTERN.test(unp)) {
    errors.unp = SUPPLIER_FIELD_MESSAGES.unpFormat;
  }

  const phoneError = validatePhone(values.phone.trim());
  if (phoneError) {
    errors.phone = phoneError;
  }

  const email = values.email.trim();
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    errors.email = SUPPLIER_FIELD_MESSAGES.email;
  }

  // Комментарий необязателен: проверяется только длина после удаления пробелов.
  if (values.comment.trim().length > SUPPLIER_LIMITS.comment) {
    errors.comment = SUPPLIER_FIELD_MESSAGES.comment;
  }

  // Реквизиты: необязательные поля, проверяется только длина.
  for (const field of DETAIL_FIELDS) {
    const limit = DETAIL_LIMITS[field];
    if (values[field].trim().length > limit) {
      errors[field] = detailLengthMessage(limit);
    }
  }

  return errors;
}

/** Ошибки полей ответа сервера в формате формы. */
export function mapServerFieldErrors(fieldErrors: Record<string, string>): SupplierFormErrors {
  const mapped: SupplierFormErrors = {};
  for (const field of FIELD_ORDER) {
    const message = fieldErrors[API_FIELD_NAMES[field]];
    if (message) mapped[field] = message;
  }
  return mapped;
}

/** Значения формы из записи поставщика: телефон приводится к цифрам национальной части. */
export function toSupplierFormValues(supplier: Supplier): SupplierFormValues {
  const values: SupplierFormValues = {
    ...EMPTY_SUPPLIER_FORM,
    name: supplier.name,
    unp: supplier.unp,
    phone: toPhoneDigits(supplier.phone),
    email: supplier.email ?? '',
    comment: supplier.comment ?? '',
  };

  for (const field of DETAIL_FIELDS) {
    values[field] = supplier[field] ?? '';
  }

  return values;
}

/** Необязательное текстовое значение: пробелы по краям убраны, пустое — null. */
function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Необязательное значение в верхнем регистре (УНП, расчётный счёт, BIC/SWIFT). */
function upperValue(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return trimmed === '' ? null : trimmed;
}

/** Поля формы для тела запроса: внешние пробелы удаляются, пустое значение — null. */
function toSupplierInput(values: SupplierFormValues) {
  return {
    name: values.name.trim(),
    unp: values.unp.trim(),
    phone: toPhoneValue(values.phone.trim()),
    email: optionalValue(values.email),
    comment: optionalValue(values.comment),
    reg_postal_code: optionalValue(values.regPostalCode),
    reg_country: optionalValue(values.regCountry),
    reg_city: optionalValue(values.regCity),
    reg_street: optionalValue(values.regStreet),
    reg_house: optionalValue(values.regHouse),
    reg_building: optionalValue(values.regBuilding),
    reg_apartment: optionalValue(values.regApartment),
    post_postal_code: optionalValue(values.postPostalCode),
    post_country: optionalValue(values.postCountry),
    post_city: optionalValue(values.postCity),
    post_street: optionalValue(values.postStreet),
    post_house: optionalValue(values.postHouse),
    post_building: optionalValue(values.postBuilding),
    post_apartment: optionalValue(values.postApartment),
    bank_account: upperValue(values.bankAccount),
    bank_name: optionalValue(values.bankName),
    bic_swift: upperValue(values.bicSwift),
    director_name: optionalValue(values.directorName),
  };
}

/** Тело запроса создания. */
export function toCreateSupplierInput(values: SupplierFormValues) {
  return toSupplierInput(values);
}

/**
 * Тело запроса обновления: те же поля плюс значение `updated_at`, которое было
 * у карточки при открытии.
 */
export function toUpdateSupplierInput(values: SupplierFormValues, expectedUpdatedAt: string) {
  return { ...toSupplierInput(values), expected_updated_at: expectedUpdatedAt };
}
