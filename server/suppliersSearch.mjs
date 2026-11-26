/**
 * Поиск поставщиков по наименованию, УНП и телефону (раздел 1 ТЗ).
 *
 * Поиск выполняется на сервере по всему набору поставщиков; пагинация
 * применяется после отбора. Наименование и УНП сравниваются по вхождению без
 * учёта регистра, телефон — по цифрам: из запроса убираются все нецифровые
 * символы, и при трёх и более цифрах ищется их вхождение в сохранённый номер.
 */

/** Минимум цифр, с которого работает поиск по телефону. */
const PHONE_MIN_DIGITS = 3;

/** Только цифры: скобки, пробелы, дефисы и «+» не важны. */
function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Разбирает поисковый запрос.
 * @returns {{ text: string, digits: string }}
 */
export function parseSupplierQuery(value) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return { text, digits: digitsOnly(text) };
}

/**
 * Запись подходит, если запрос найден в наименовании или УНП либо (при трёх и
 * более цифрах) в цифрах телефона. Пустой запрос подходит всем записям.
 */
export function filterSuppliers(suppliers, query) {
  if (query.text === '') return suppliers;

  const needle = query.text.toLocaleLowerCase('ru');
  const byPhone = query.digits.length >= PHONE_MIN_DIGITS ? query.digits : null;

  return suppliers.filter((supplier) => {
    const name = String(supplier.name ?? '').toLocaleLowerCase('ru');
    if (name.includes(needle)) return true;

    const unp = String(supplier.unp ?? '').toLocaleLowerCase('ru');
    if (unp.includes(needle)) return true;

    return Boolean(byPhone) && digitsOnly(supplier.phone).includes(byPhone);
  });
}
