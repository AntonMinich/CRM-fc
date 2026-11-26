/**
 * Телефон клиента: постоянный префикс +375 и 9 цифр национальной части.
 *
 * Единый источник данных — config/phone-national-codes.json: тот же файл читает
 * сервер (server/phone.mjs), поэтому список кодов в форме и на сервере совпадает.
 *
 * Форматы:
 *   ввод и список  — +375 (XX) XXX-XX-XX,
 *   API и база     — +375XXXXXXXXX (13 символов).
 */

import phoneConfig from '../../../../config/phone-national-codes.json';

/** Постоянный префикс номера. */
export const PHONE_PREFIX: string = phoneConfig.prefix;

/** Сколько цифр вводит пользователь после префикса. */
export const NATIONAL_DIGITS: number = phoneConfig.nationalDigits;

/** Длина кода оператора или Минска. */
export const PHONE_CODE_LENGTH: number = phoneConfig.codeLength;

/** Допустимые коды национальной части. */
export const PHONE_ALLOWED_CODES: readonly string[] = phoneConfig.allowedCodes;

/** Подсказка в пустом поле. */
export const PHONE_PLACEHOLDER = '+375 (__) ___-__-__';

/** Сообщение о недопустимом коде собирается из списка, чтобы не расходиться с ним. */
function allowedCodesMessage(): string {
  const codes = [...PHONE_ALLOWED_CODES];
  const last = codes.pop();
  return `Укажите номер с кодом ${codes.join(', ')} или ${last}`;
}

/** Сообщения об ошибках телефона (раздел 5 дополнения к ТЗ). */
export const PHONE_MESSAGES = {
  required: 'Укажите телефон',
  incomplete: 'Введите номер полностью: +375 (XX) XXX-XX-XX',
  code: allowedCodesMessage(),
} as const;

/**
 * Приводит введённый или вставленный текст к цифрам национальной части.
 *
 * Распознаются начала +375, 375, 80 и «8 0»; лишние цифры отбрасываются с конца.
 * Значение поля приходит уже с префиксом, поэтому он снимается текстом, а не по
 * количеству цифр: иначе ввод «80» превращался бы в «4».
 */
export function normalizePhoneInput(raw: string): string {
  const text = (raw ?? '').trim();

  let digits: string;
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

/** Отформатированное значение поля ввода; пустая строка, если цифр нет. */
export function formatPhoneInput(digits: string): string {
  if (digits === '') return '';

  const value = digits.slice(0, NATIONAL_DIGITS);
  let result = `${PHONE_PREFIX} (${value.slice(0, PHONE_CODE_LENGTH)}`;
  if (value.length >= PHONE_CODE_LENGTH) result += ')';
  if (value.length > 2) result += ` ${value.slice(2, 5)}`;
  if (value.length > 5) result += `-${value.slice(5, 7)}`;
  if (value.length > 7) result += `-${value.slice(7, 9)}`;
  return result;
}

/** Значение для API и базы: +375XXXXXXXXX. */
export function toPhoneValue(digits: string): string {
  return `${PHONE_PREFIX}${digits.slice(0, NATIONAL_DIGITS)}`;
}

/** Сообщение об ошибке телефона или null, если значение корректно. */
export function validatePhone(digits: string): string | null {
  if (digits === '') return PHONE_MESSAGES.required;
  if (digits.length < NATIONAL_DIGITS) return PHONE_MESSAGES.incomplete;
  if (!PHONE_ALLOWED_CODES.includes(digits.slice(0, PHONE_CODE_LENGTH))) {
    return PHONE_MESSAGES.code;
  }
  return null;
}

/**
 * Читаемый формат для списка. Номера в другом формате показываются как есть —
 * массовая миграция старых записей в задачу не входит.
 */
export function formatPhoneForDisplay(phone: string): string {
  const match = /^\+375(\d{9})$/.exec(phone);
  if (!match) return phone;
  return formatPhoneInput(match[1]);
}

/**
 * Цифры национальной части из сохранённого значения `+375XXXXXXXXX`.
 *
 * Записи в старом формате маске не соответствуют, поэтому в карточке клиента
 * от них остаётся только префикс `+375`: номер нужно ввести заново (раздел 5 ТЗ
 * на редактирование). Пока пользователь не сохранил карточку, значение в базе
 * не меняется.
 */
export function toPhoneDigits(phone: string | null | undefined): string {
  const match = /^\+375(\d{9})$/.exec((phone ?? '').trim());
  return match ? match[1] : '';
}