/** Проверка формата денежных сумм по примерам из ТЗ.
 *  Запуск: node tools/check-money.mjs */

import { formatMoney } from '../src/features/crm/utils/formatMoney.ts';

const NBSP = '\u00A0';
const cases = [
  [0, `0${NBSP}BYN`],
  [1500, `1${NBSP}500${NBSP}BYN`],
  [1250000, `1${NBSP}250${NBSP}000${NBSP}BYN`],
  [1500.5, `1${NBSP}500,50${NBSP}BYN`],
  [1500.25, `1${NBSP}500,25${NBSP}BYN`],
  [0.1 + 0.2, `0,30${NBSP}BYN`],
  [999999999.99, `999${NBSP}999${NBSP}999,99${NBSP}BYN`],
  [100, `100${NBSP}BYN`],
  [1000, `1${NBSP}000${NBSP}BYN`],
  [-2500.75, `-2${NBSP}500,75${NBSP}BYN`],
];

let failed = 0;
for (const [value, expected] of cases) {
  const actual = formatMoney(value);
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'ок  ' : 'ОШИБКА'} ${String(value).padEnd(14)} -> ${JSON.stringify(actual)}` +
      (ok ? '' : ` ожидалось ${JSON.stringify(expected)}`),
  );
}

console.log(failed === 0 ? '\nФормат сумм соответствует ТЗ.' : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
