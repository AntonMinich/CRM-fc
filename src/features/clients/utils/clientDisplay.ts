/** Отображение значений клиента в таблице. */

import type { Client } from '../types';

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
