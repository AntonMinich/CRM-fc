/** Подбор цветов шапок канбана с контрастом белого текста не ниже 4.5:1.
 *  Запуск: node tools/tune-column-colors.mjs */

const TARGET = 4.6;
const COLORS = [
  ['#3459BD', 'Столбец 1'],
  ['#317FA3', 'Столбец 2'],
  ['#258E88', 'Столбец 3'],
  ['#498C57', 'Столбец 4'],
  ['#A17C29', 'Столбец 5'],
  ['#B56943', 'Столбец 6'],
  ['#8E5FA6', 'Столбец 7'],
];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance([r, g, b]) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrastWithWhite = (rgb) => 1.05 / (luminance(rgb) + 0.05);

const toHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('');

for (const [hex, title] of COLORS) {
  const rgb = toRgb(hex);
  const base = contrastWithWhite(rgb);
  if (base >= TARGET) {
    console.log(`${title} ${hex} контраст ${base.toFixed(2)} — оставить`);
    continue;
  }
  let factor = 1;
  while (factor > 0.2) {
    const scaled = rgb.map((v) => v * factor);
    if (contrastWithWhite(scaled) >= TARGET) break;
    factor -= 0.005;
  }
  const scaled = rgb.map((v) => v * factor);
  console.log(
    `${title} ${hex} контраст ${base.toFixed(2)} -> ${toHex(scaled)} ` +
      `контраст ${contrastWithWhite(scaled).toFixed(2)} (множитель ${factor.toFixed(3)})`,
  );
}
