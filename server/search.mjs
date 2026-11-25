/**
 * Поиск клиентов по ФИО (раздел 5 ТЗ).
 *
 * Поиск выполняется на сервере по всему набору клиентов, а не по загруженной
 * странице: сначала отбираются все подходящие записи, затем применяется
 * пагинация.
 *
 * Регистронезависимость обеспечивается `toLocaleLowerCase('ru')`: встроенные
 * функции SQLite `lower()`/`LIKE` не понижают регистр кириллицы без ICU.
 */

/** Нормализует строку: убирает внешние пробелы, схлопывает повторные, понижает регистр. */
export function normalizeQuery(value) {
  if (typeof value !== 'string') return { text: '', tokens: [] };
  const text = value.trim().replace(/\s+/g, ' ');
  const tokens = text === '' ? [] : text.toLocaleLowerCase('ru').split(' ');
  return { text, tokens };
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

/** Отбор подходящих клиентов с сохранением порядка по умолчанию. */
export function filterClients(clients, tokens) {
  return clients.filter((client) => matchesClient(client, tokens));
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
