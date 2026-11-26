/** Отображение значений клиента в таблице. */

import type { Client } from '../types';
import { formatPhoneForDisplay } from './phone';

/**
 * ФИО клиента одной строкой: незаполненные части пропускаются,
 * лишних пробелов и прочерков вместо фамилии и отчества нет.
 */
export function formatClientName(client: Pick<Client, 'lastName' | 'firstName' | 'middleName'>): string {
  return [client.lastName, client.firstName, client.middleName]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' ');
}

/** Пустой необязательный E-mail показывается прочерком. */
export function formatClientEmail(client: Pick<Client, 'email'>): string {
  const email = (client.email ?? '').trim();
  return email === '' ? '—' : email;
}

/** Сколько символов комментария показывается в списке. */
export const COMMENT_PREVIEW_LENGTH = 50;

/**
 * Комментарий для списка: переводы строк и повторные пробелы заменяются одним
 * пробелом, показываются первые 50 символов, остальное — многоточием.
 * Полный текст читается в карточке клиента.
 */
export function formatClientComment(client: Pick<Client, 'comment'>): string {
  const text = (client.comment ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return '—';
  return text.length > COMMENT_PREVIEW_LENGTH
    ? `${text.slice(0, COMMENT_PREVIEW_LENGTH)}…`
    : text;
}

/**
 * Доступное имя кнопки открытия карточки: «Открыть карточку клиента Иванов …».
 * Скринридер объявляет, кого именно открывает кнопка в строке списка.
 */
export function clientOpenLabel(
  client: Pick<Client, 'lastName' | 'firstName' | 'middleName'>,
): string {
  const name = formatClientName(client);
  return name === '' ? 'Открыть карточку клиента' : `Открыть карточку клиента ${name}`;
}

/**
 * Телефон в читаемом формате +375 (XX) XXX-XX-XX.
 * Номера, сохранённые в другом формате, показываются как есть.
 */
export function formatClientPhone(client: Pick<Client, 'phone'>): string {
  return formatPhoneForDisplay(client.phone);
}
