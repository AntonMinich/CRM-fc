/**
 * Телефон клиента на сервере: те же правила, что в форме
 * (src/features/clients/utils/phone.ts).
 *
 * Список кодов читается из общего config/phone-national-codes.json, поэтому
 * форма и сервер не могут разойтись.
 */

import { readFileSync } from 'node:fs';

const config = JSON.parse(
  readFileSync(new URL('../config/phone-national-codes.json', import.meta.url), 'utf8'),
);

/** Постоянный префикс номера. */
export const PHONE_PREFIX = config.prefix;

/** Сколько цифр в национальной части. */
export const NATIONAL_DIGITS = config.nationalDigits;

/** Длина кода оператора или Минска. */
export const PHONE_CODE_LENGTH = config.codeLength;

/** Допустимые коды национальной части. */
export const PHONE_ALLOWED_CODES = config.allowedCodes;

function allowedCodesMessage() {
  const codes = [...PHONE_ALLOWED_CODES];
  const last = codes.pop();
  return `Укажите номер с кодом ${codes.join(', ')} или ${last}`;
}

/** Сообщения об ошибках телефона — совпадают с клиентскими. */
export const PHONE_MESSAGES = {
  required: 'Укажите телефон',
  incomplete: 'Введите номер полностью: +375 (XX) XXX-XX-XX',
  code: allowedCodesMessage(),
};

/**
 * Цифры национальной части из произвольной строки.
 * Распознаются начала +375, 375, 80; лишние цифры отбрасываются с конца.
 */
export function extractNationalDigits(value) {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

  let digits;
  if (text.startsWith(PHONE_PREFIX)) {
    digits = text.slice(PHONE_PREFIX.length).replace(/\D/g, '');
  } else {
    digits = text.replace(/\D/g, '');
    if (digits.startsWith('375') && digits.length > NATIONAL_DIGITS) {
      digits = digits.slice(3);
    } else if (digits.startsWith('80') && digits.length > NATIONAL_DIGITS) {
      digits = digits.slice(2);
    }
  }

  return digits.slice(0, NATIONAL_DIGITS);
}

/** Значение для базы и API: +375XXXXXXXXX. */
export function toPhoneValue(digits) {
  return `${PHONE_PREFIX}${digits.slice(0, NATIONAL_DIGITS)}`;
}

/**
 * Нормализует телефон из тела запроса.
 * Неверный номер отклоняется даже в обход формы.
 * @returns {{ value: string } | { error: string }}
 */
export function normalizePhone(value) {
  const digits = extractNationalDigits(value);

  if (digits === '') return { error: PHONE_MESSAGES.required };
  if (digits.length < NATIONAL_DIGITS) return { error: PHONE_MESSAGES.incomplete };
  if (!PHONE_ALLOWED_CODES.includes(digits.slice(0, PHONE_CODE_LENGTH))) {
    return { error: PHONE_MESSAGES.code };
  }

  return { value: toPhoneValue(digits) };
}