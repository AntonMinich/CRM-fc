/**
 * Поиск клиентов по ФИО и номеру телефона (разделы 4 и 5 ТЗ).
 *
 * Поиск выполняется на сервере по всему набору клиентов, а не по загруженной
 * странице: сначала отбираются все подходящие записи, затем применяется
 * пагинация.
 *
 * Регистронезависимость обеспечивается `toLocaleLowerCase('ru')`: встроенные
 * функции SQLite `lower()`/`LIKE` не понижают регистр кириллицы без ICU.
 *
 * Режим поиска определяется самим запросом: есть буквы — ищем по ФИО, только
 * цифры и знаки оформления — по телефону. Смешанный ввод вроде «иван 44» поиском
 * по номеру не становится, иначе цифры из слова находили бы случайные телефоны.
 */

import { extractNationalDigits } from './phone.mjs';

/** В запросе есть буквы: значит, это поиск по ФИО. */
const LETTERS = /[a-zа-яё]/i;

/**
 * Разбирает поисковый запрос.
 *
 * Цифры телефона приводятся той же функцией, что в форме и в проверке телефона:
 * `+375 (44) 757-40-55`, `375447574055`, `375 44 7574055`, `8 044 757-40-55` и
 * `80447574055` дают один и тот же набор цифр, поэтому формат ввода не важен.
 *
 * @param {unknown} value значение параметра `search`
 * @returns {{ text: string, tokens: string[], digits: string, byPhone: boolean }}
 */
export function parseQuery(value) {
  const text =
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return {
    text,
    tokens: text === '' ? [] : text.toLocaleLowerCase('ru').split(' '),
    digits: extractNationalDigits(text),
    byPhone: text !== '' && !LETTERS.test(text),
  };
}

/** ФИО клиента одной строкой: незаполненные части пропускаются. */
export function clientFullName(client) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(' ');
}

/**
 * Каждое слово запроса должно встречаться в ФИО; порядок слов не важен.
 * Пустой запрос подходит всем записям.
 */
export function matchesClient(client, tokens) {
  if (tokens.length === 0) return true;
  const haystack = clientFullName(client).toLocaleLowerCase('ru');
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Номер клиента содержит введённые цифры. Совпадение частичное, как и в поиске
 * по ФИО: «757» находит `+375447574055`. Записи в старом формате (`=375441203343`)
 * нормализуются той же функцией, что и запрос.
 */
export function matchesClientPhone(client, digits) {
  if (digits === '') return false;
  return extractNationalDigits(client.phone).includes(digits);
}

/** Отбор подходящих клиентов с сохранением порядка по умолчанию. */
export function filterClients(clients, query) {
  if (query.byPhone) {
    return clients.filter((client) => matchesClientPhone(client, query.digits));
  }
  if (query.tokens.length === 0) return clients;
  return clients.filter((client) => matchesClient(client, query.tokens));
}

/** Постраничная выдача. */
export function paginate(items, page, pageSize) {
  const total = items.length;
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 50;
  const offset = (safePage - 1) * safePageSize;
  return {
    items: items.slice(offset, offset + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
    hasMore: offset + safePageSize < total,
  };
}
