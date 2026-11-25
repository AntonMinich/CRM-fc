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

/**
 * Телефон в читаемом формате +375 (XX) XXX-XX-XX.
 * Номера, сохранённые в другом формате, показываются как есть.
 */
export function formatClientPhone(client: Pick<Client, 'phone'>): string {
  return formatPhoneForDisplay(client.phone);
}
