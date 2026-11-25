/** Форматирование денежных сумм. Одна общая функция для всех показателей. */

/** Код валюты показателя. */
export const CURRENCY_CODE = 'BYN';

/** Неразрывный пробел: разделяет разряды и число с кодом валюты. */
const NBSP = '\u00A0';

/** Группировка тысяч неразрывными пробелами: 1250000 -> «1 250 000». */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/**
 * Формат: `0 BYN`, `1 500 BYN`, `1 250 000 BYN`, `1 500,50 BYN`.
 * Дробная часть показывается двумя цифрами и только у нецелых сумм.
 * Сокращения (`тыс.`, `млн`, `K`, `M`) не применяются.
 *
 * Значение приходит в BYN, внутри переводится в целые копейки, чтобы
 * форматирование не зависело от двоичной погрешности: 0.1 + 0.2 -> «0,30 BYN».
 * Для самих расчётов суммы должны приходить уже посчитанными в десятичной
 * арифметике или целых копейках.
 */
export function formatMoney(value: number, currency: string = CURRENCY_CODE): string {
  const minorUnits = Math.round(value * 100);
  const sign = minorUnits < 0 ? '-' : '';
  const absolute = Math.abs(minorUnits);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  const fractionText = fraction === 0 ? '' : `,${String(fraction).padStart(2, '0')}`;
  return `${sign}${groupThousands(whole)}${fractionText}${NBSP}${currency}`;
}
