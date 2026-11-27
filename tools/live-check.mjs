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

for (const path of ['/crm/deals', '/crm/clients', '/crm/suppliers', '/service-desk']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  const data = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    active: document.querySelector('.sidebar__nav [aria-current="page"]')?.textContent?.trim(),
    nav: Array.from(document.querySelectorAll('.sidebar__nav a')).map((a) =>
      a.textContent.trim(),
    ),
    tabs: Array.from(document.querySelectorAll('.crm-tab')).map((a) => a.textContent.trim()),
    activeTab: document.querySelector('.crm-tab--active')?.textContent?.trim() ?? null,
    columns: document.querySelectorAll('.kanban-column').length,
    totals: Array.from(document.querySelectorAll('.contract-value')).map((el) =>
      el.textContent.replace(/\u00A0/g, ' ').trim(),
    ),
    createButton: document.querySelector('.create-button')?.textContent?.trim() ?? null,
    clientRows: document.querySelectorAll('.client-table tbody tr').length,
    clientState: document.querySelector('.client-table-state')?.textContent.trim() ?? null,
    boardScrolls: (() => {
      const board = document.querySelector('.kanban-board');
      return board ? board.scrollWidth > board.clientWidth + 1 : false;
    })(),
    scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  console.log(
    `${path}: заголовок=${data.title}, меню=[${data.nav.join(', ')}], ` +
      `пункт=${data.active}, вкладки=[${data.tabs.join(', ')}], активная=${data.activeTab}, ` +
      `столбцов=${data.columns}, суммы=[${data.totals.join(', ')}], кнопка=${data.createButton}, ` +
      `строк клиентов=${data.clientRows}, состояние=${data.clientState}, ` +
      `прокрутка доски=${data.boardScrolls}, без прокрутки страницы=${data.scroll}`,
  );
}

await page.goto(`${BASE}/crm/clients`, { waitUntil: 'load' });
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'docs/screenshots/live-dev-dark-1440x900.png' });
console.log('скриншот: docs/screenshots/live-dev-dark-1440x900.png');

await browser.close();
console.log(problems.length ? `Проблемы: ${problems.join(' | ')}` : 'Ошибок нет.');
