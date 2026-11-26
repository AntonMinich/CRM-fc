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

/** Маска незаполненных позиций. Длина маски совпадает с длиной значения поля. */
const PHONE_MASK = '+375 (__) ___-__-__';

/** Подсказка в пустом поле. */
export const PHONE_PLACEHOLDER = PHONE_MASK;

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
  }

  // «+375+375291234567» (вставка при уже показанном префиксе) и «375291234567»
  // приводятся к одному виду: код страны не входит в национальную часть.
  if (digits.startsWith('375') && digits.length > NATIONAL_DIGITS) {
    digits = digits.slice(3);
  } else if (digits.startsWith('80') && digits.length > NATIONAL_DIGITS) {
    digits = digits.slice(2);
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

/**
 * Значение поля «Телефон»: префикс `+375` показывается всегда как обычный текст,
 * чтобы не приходилось вводить код страны. Дальше идут только введённые цифры в
 * маске, без серых незаполненных позиций.
 *
 * Цифры по-прежнему хранятся отдельно от префикса, поэтому один префикс
 * считается пустым значением.
 */
export function formatPhoneFieldValue(digits: string): string {
  return digits === '' ? PHONE_PREFIX : formatPhoneInput(digits);
}

/**
 * Недобранная часть маски для «призрачных» серых позиций: значение поля всегда
 * совпадает с началом маски, поэтому остаток отрезается по длине значения.
 * Рисуется серым поверх поля (см. ClientForm.css, `.client-field__phone-ghost`).
 */
export function formatPhoneGhostTail(digits: string): string {
  return PHONE_MASK.slice(formatPhoneFieldValue(digits).length);
}

/**
 * Ставит курсор в первую свободную позицию после префикса: при клике и фокусе
 * он не должен попадать в `+375`. Если курсор уже стоит после префикса,
 * положение не меняется — иначе нельзя было бы выделить и заменить номер.
 * Перемещение отложено на кадр, чтобы не мешать выделению текста.
 */
export function movePhoneCaretAfterPrefix(input: HTMLInputElement): void {
  const move = () => {
    if (document.activeElement !== input) return;
    // Выделение не трогаем: иначе нельзя выделить номер и заменить его целиком.
    if (input.selectionStart !== input.selectionEnd) return;
    const caret = input.selectionStart ?? 0;
    if (caret >= PHONE_PREFIX.length) return;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  };
  window.requestAnimationFrame(move);
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