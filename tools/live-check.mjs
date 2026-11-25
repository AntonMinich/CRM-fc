/** Живая проверка запущенного dev-сервера. Запуск: node tools/live-check.mjs */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
});

for (const path of ['/crm', '/service-desk']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  const data = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    theme: document.documentElement.getAttribute('data-theme'),
    active: document.querySelector('[aria-current="page"]')?.textContent?.trim(),
    nav: Array.from(document.querySelectorAll('nav a')).map((a) => a.textContent.trim()),
    workspace: document.querySelector('main')?.textContent.trim(),
    scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  console.log(
    `${path}: заголовок=${data.title}, тема=${data.theme}, активный=${data.active}, ` +
      `меню=[${data.nav.join(', ')}], рабочая область="${data.workspace}", ` +
      `без прокрутки=${data.scroll}`,
  );
}

await page.goto(`${BASE}/crm`, { waitUntil: 'load' });
await page.click('[role="switch"]');
await page.waitForTimeout(200);
await page.screenshot({ path: 'docs/screenshots/live-dev-dark-1440x900.png' });
console.log('скриншот: docs/screenshots/live-dev-dark-1440x900.png');

await browser.close();
console.log(problems.length ? `Проблемы: ${problems.join(' | ')}` : 'Ошибок нет.');
