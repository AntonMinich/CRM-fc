/**
 * Проверка оболочки в реальном браузере и скриншоты для приёмки.
 *
 * Запуск: npm run screenshots
 * Результат: docs/screenshots/*.png и отчёт по проверкам в консоли.
 */

import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'vite';

const OUT_DIR = 'docs/screenshots';
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

const THEMES = ['light', 'dark'];
const ROUTES = [
  { name: 'crm', path: '/crm', title: 'CRM' },
  { name: 'service-desk', path: '/service-desk', title: 'Service Desk' },
];
const KANBAN_TITLES = Array.from({ length: 7 }, (_, index) => `Столбец ${index + 1}`);
const KANBAN_IDS = Array.from({ length: 7 }, (_, index) => `column-${index + 1}`);
const CREATE_NOTICE_TEXT = 'Форма создания будет добавлена на следующем этапе';
const VIEWPORTS = [
  { name: '1800x1000', width: 1800, height: 1000, shot: false },
  { name: '1440x900', width: 1440, height: 900, shot: true },
  { name: '1280x800', width: 1280, height: 800, shot: false },
  { name: '1024x768', width: 1024, height: 768, shot: false },
  { name: '768x1024', width: 768, height: 1024, shot: false },
  { name: '390x844', width: 390, height: 844, shot: true },
];
// Chromium — все размеры, остальные движки — ключевые (настольный и узкий).
const ENGINES = [
  { name: 'chromium', type: chromium, viewports: VIEWPORTS },
  {
    name: 'firefox',
    type: firefox,
    viewports: VIEWPORTS.filter((v) => v.name === '1440x900' || v.name === '390x844'),
  },
  {
    name: 'webkit',
    type: webkit,
    viewports: VIEWPORTS.filter((v) => v.name === '1440x900' || v.name === '390x844'),
  },
];

const problems = [];
const notes = [];

function check(condition, message) {
  if (!condition) {
    problems.push(message);
  }
}

async function collect(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector('nav');
    const main = document.querySelector('main');
    const switchEl = document.querySelector('[role="switch"]');
    const decor = document.querySelectorAll('.workspace-background__decor');
    const sidebar = document.querySelector('.sidebar');
    const logo = document.querySelector('.sidebar__logo-image--light');
    const subtitle = document.querySelector('.header__subtitle');
    const avatar = document.querySelector('.header__avatar');
    const track = switchEl?.querySelector('.theme-switch__track');
    const createButton = document.querySelector('.create-button');
    const board = document.querySelector('.kanban-board');
    const columns = Array.from(document.querySelectorAll('.kanban-column'));
    const headers = columns.map((column) => column.querySelector('.column-header'));
    const trim = (value) => (value ?? '').replace(/\u00A0/g, ' ').trim();
    return {
      theme: root.getAttribute('data-theme'),
      colorScheme: root.style.colorScheme,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      title: document.querySelector('h1')?.textContent ?? null,
      subtitleDisplay: subtitle ? getComputedStyle(subtitle).display : 'absent',
      navLinks: nav ? nav.querySelectorAll('a').length : 0,
      navLabels: nav
        ? Array.from(nav.querySelectorAll('a')).map((a) => a.textContent.trim())
        : [],
      navLabelsTruncated: Array.from(document.querySelectorAll('.nav-item__label')).some(
        (element) => element.scrollWidth > element.clientWidth + 1,
      ),
      switchLabelTruncated: (() => {
        const element = document.querySelector('.theme-switch__label');
        return element ? element.scrollWidth > element.clientWidth + 1 : false;
      })(),
      activeLabel: document.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null,
      activeCount: document.querySelectorAll('[aria-current="page"]').length,
      workspaceNodes: main ? main.children.length : 0,
      workspaceText: main ? main.textContent.trim() : '',
      switchChecked: switchEl?.getAttribute('aria-checked') ?? null,
      switchName: switchEl?.textContent?.trim() ?? null,
      decorCount: decor.length,
      decorPointerEvents: decor[0] ? getComputedStyle(decor[0]).pointerEvents : null,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      headerHeight: Math.round(
        document.querySelector('.header')?.getBoundingClientRect().height ?? 0,
      ),
      logoBox: logo
        ? [
            Math.round(logo.getBoundingClientRect().width),
            Math.round(logo.getBoundingClientRect().height),
          ]
        : null,
      navItemHeight: Math.round(
        document.querySelector('.nav-item')?.getBoundingClientRect().height ?? 0,
      ),
      switchSize: track
        ? [Math.round(track.getBoundingClientRect().width),
           Math.round(track.getBoundingClientRect().height)]
        : null,
      avatarVisible: avatar ? getComputedStyle(avatar).display !== 'none' : false,
      // Канбан и кнопка «Создать» (только в разделе CRM).
      hasCreateButton: createButton !== null,
      createButtonText: createButton ? trim(createButton.textContent) : null,
      createButtonHeight: createButton
        ? Math.round(createButton.getBoundingClientRect().height)
        : 0,
      createButtonRadius: createButton ? getComputedStyle(createButton).borderRadius : null,
      createButtonRight: createButton ? Math.round(createButton.getBoundingClientRect().right) : 0,
      columnCount: columns.length,
      columnIds: columns.map((column) => column.getAttribute('data-column-id')),
      columnTitles: columns.map((column) => trim(column.querySelector('.column-title')?.textContent)),
      columnTotals: columns.map((column) => trim(column.querySelector('.contract-value')?.textContent)),
      columnBadges: document.querySelectorAll('.kanban-column .badge, .kanban-column .count').length,
      columnHeaderColors: headers.map((header) =>
        header ? getComputedStyle(header).backgroundColor : null,
      ),
      columnHeaderHeights: headers.map((header) =>
        header ? Math.round(header.getBoundingClientRect().height) : 0,
      ),
      columnRows: new Set(
        columns.map((column) => Math.round(column.getBoundingClientRect().top)),
      ).size,
      columnBodyText: Array.from(document.querySelectorAll('.column-body'))
        .map((body) => trim(body.textContent))
        .join(''),
      boardPresent: board !== null,
      boardScrolls: board ? board.scrollWidth > board.clientWidth + 1 : false,
      boardPaddingX: board ? getComputedStyle(board).paddingLeft : null,
      boardGap: board ? getComputedStyle(board).columnGap : null,
      noticeText: trim(document.querySelector('.create-notice__message')?.textContent),
      noticeCount: document.querySelectorAll('.create-notice__message').length,
      totalWhiteSpace: (() => {
        const element = document.querySelector('.contract-value');
        return element ? getComputedStyle(element).whiteSpace : null;
      })(),
      totalTextOverflow: (() => {
        const element = document.querySelector('.contract-value');
        return element ? getComputedStyle(element).textOverflow : null;
      })(),
    };
  });
}

async function checkLayout(page, engine, theme, viewport, route) {
  await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  const data = await collect(page);
  const label = `[${engine} ${theme} ${viewport.name} ${route.path}]`;

  check(data.theme === theme, `${label} тема в DOM: ${data.theme}`);
  check(data.colorScheme === theme, `${label} color-scheme: ${data.colorScheme}`);
  check(data.title === route.title, `${label} заголовок: ${data.title}`);
  check(data.navLinks === 2, `${label} пунктов меню: ${data.navLinks}`);
  check(
    data.navLabels.join('|') === 'CRM|Service Desk',
    `${label} подписи меню: ${data.navLabels.join('|')}`,
  );
  check(data.activeCount === 1, `${label} активных пунктов: ${data.activeCount}`);
  check(data.activeLabel === route.title, `${label} активный пункт: ${data.activeLabel}`);
  check(
    data.scrollWidth <= data.clientWidth,
    `${label} горизонтальная прокрутка: ${data.scrollWidth} > ${data.clientWidth}`,
  );
  check(data.decorCount === 1, `${label} элементов декора: ${data.decorCount}`);
  check(
    data.decorPointerEvents === 'none',
    `${label} pointer-events декора: ${data.decorPointerEvents}`,
  );

  // Раздел CRM: панель действий с кнопкой «Создать» и канбан из семи столбцов.
  if (route.name === 'crm') {
    check(data.workspaceNodes === 2, `${label} узлов в main: ${data.workspaceNodes}`);
    check(data.hasCreateButton, `${label} кнопка «Создать» отсутствует`);
    check(data.createButtonText === 'Создать', `${label} подпись кнопки: ${data.createButtonText}`);
    check(data.boardPresent, `${label} доска канбана отсутствует`);
    check(data.columnCount === 7, `${label} столбцов: ${data.columnCount}`);
    check(
      data.columnIds.join('|') === KANBAN_IDS.join('|'),
      `${label} идентификаторы столбцов: ${data.columnIds.join('|')}`,
    );
    check(
      data.columnTitles.join('|') === KANBAN_TITLES.join('|'),
      `${label} названия столбцов: ${data.columnTitles.join('|')}`,
    );
    check(
      data.columnTotals.every((total) => total === '0 BYN'),
      `${label} суммы столбцов: ${data.columnTotals.join('|')}`,
    );
    check(
      data.columnHeaderColors.every((color) => color && color !== 'rgba(0, 0, 0, 0)'),
      `${label} у шапки нет цвета: ${data.columnHeaderColors.join('|')}`,
    );
    check(
      new Set(data.columnHeaderColors).size === 7,
      `${label} цвета шапок повторяются: ${data.columnHeaderColors.join('|')}`,
    );
    check(data.columnRows === 1, `${label} столбцы не в один ряд: ${data.columnRows}`);
    check(data.columnBodyText === '', `${label} тело столбца не пустое: "${data.columnBodyText}"`);
    check(data.columnBadges === 0, `${label} найдены бейджи-счётчики: ${data.columnBadges}`);
    check(data.noticeCount === 0, `${label} уведомление видно без нажатия: ${data.noticeCount}`);
    check(data.totalWhiteSpace === 'nowrap', `${label} сумма переносится: ${data.totalWhiteSpace}`);
    check(
      data.totalTextOverflow !== 'ellipsis',
      `${label} сумма обрезается многоточием: ${data.totalTextOverflow}`,
    );
  }

  // Service Desk: без канбана и кнопки создания сделки.
  if (route.name === 'service-desk') {
    check(data.workspaceNodes === 1, `${label} узлов в main: ${data.workspaceNodes}`);
    check(data.workspaceText === '', `${label} рабочая область не пуста: "${data.workspaceText}"`);
    check(!data.hasCreateButton, `${label} в Service Desk есть кнопка «Создать»`);
    check(!data.boardPresent, `${label} в Service Desk есть канбан`);
    check(data.columnCount === 0, `${label} в Service Desk столбцов: ${data.columnCount}`);
  }

  check(data.switchChecked === String(theme === 'dark'), `${label} aria-checked`);
  check(data.switchName === 'Тёмная тема', `${label} имя переключателя: ${data.switchName}`);
  check(!data.navLabelsTruncated, `${label} подпись пункта меню обрезана`);
  check(!data.switchLabelTruncated, `${label} подпись переключателя обрезана`);

  if (viewport.name === '1440x900') {
    check(data.sidebarWidth === 248, `${label} ширина панели: ${data.sidebarWidth}`);
    check(data.headerHeight === 85, `${label} высота верхней панели: ${data.headerHeight}`);
    check(data.navItemHeight === 52, `${label} высота пункта: ${data.navItemHeight}`);
    check(
      data.logoBox && data.logoBox[0] === 190 && data.logoBox[1] === 76,
      `${label} контейнер логотипа: ${data.logoBox}`,
    );
    check(
      data.switchSize && data.switchSize[0] === 42 && data.switchSize[1] === 24,
      `${label} размер переключателя: ${data.switchSize}`,
    );

    if (route.name === 'crm') {
      check(data.createButtonHeight === 44, `${label} высота кнопки: ${data.createButtonHeight}`);
      check(
        data.createButtonRadius === '10px',
        `${label} скругление кнопки: ${data.createButtonRadius}`,
      );
      check(data.boardPaddingX === '32px', `${label} отступ доски: ${data.boardPaddingX}`);
      check(data.boardGap === '12px', `${label} расстояние столбцов: ${data.boardGap}`);
      check(
        data.columnHeaderHeights.every((height) => height >= 86),
        `${label} высота шапок: ${data.columnHeaderHeights.join('|')}`,
      );
    }
  }

  if (viewport.name === '390x844') {
    check(data.sidebarWidth === 185, `${label} ширина панели: ${data.sidebarWidth}`);
    check(
      data.subtitleDisplay === 'none',
      `${label} подпись «Рабочее пространство» видна: ${data.subtitleDisplay}`,
    );

    if (route.name === 'crm') {
      check(data.columnCount === 7, `${label} столбцов: ${data.columnCount}`);
      check(data.columnRows === 1, `${label} столбцы не в один ряд: ${data.columnRows}`);
      check(data.boardScrolls, `${label} доска не прокручивается на узком экране`);
      check(
        data.createButtonRight <= viewport.width,
        `${label} кнопка «Создать» за пределами экрана: ${data.createButtonRight}`,
      );
    }
  }

  if (viewport.shot && engine === 'chromium') {
    const file = `${OUT_DIR}/${route.name}-${theme}-${viewport.name}.png`;
    await page.screenshot({ path: file });
    notes.push(`скриншот: ${file}`);
  }
}

async function checkBehaviour(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`[${engine} поведение] console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`[${engine} поведение] pageerror: ${error.message}`);
  });

  await page.goto(`${BASE_URL}/crm`, { waitUntil: 'load' });
  const beforeTheme = (await collect(page)).theme;
  await page.click('[role="switch"]');
  const afterToggle = (await collect(page)).theme;
  await page.reload({ waitUntil: 'load' });
  const afterReload = (await collect(page)).theme;

  await page.click('a[href="/service-desk"]');
  await page.waitForURL('**/service-desk');
  await page.waitForFunction(
    () => document.querySelector('h1')?.textContent === 'Service Desk',
  );
  const afterNavigation = await collect(page);
  await page.goBack();
  await page.waitForURL('**/crm');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'CRM');
  const afterBack = await collect(page);

  check(beforeTheme === 'light', `[${engine}] стартовая тема: ${beforeTheme}`);
  check(afterToggle === 'dark', `[${engine}] тема после переключения: ${afterToggle}`);
  check(afterReload === 'dark', `[${engine}] тема после перезагрузки: ${afterReload}`);
  check(
    afterNavigation.theme === 'dark' && afterNavigation.title === 'Service Desk',
    `[${engine}] раздел после перехода: ${afterNavigation.title}, тема ${afterNavigation.theme}`,
  );
  check(
    afterBack.title === 'CRM' && afterBack.activeLabel === 'CRM',
    `[${engine}] возврат назад: ${afterBack.title}, активный ${afterBack.activeLabel}`,
  );

  // Прямое открытие разделов и корня приложения.
  for (const path of ['/service-desk', '/crm', '/']) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('h1') !== null);
    const data = await collect(page);
    check(
      data.title === 'CRM' || data.title === 'Service Desk',
      `[${engine}] прямой маршрут ${path}: заголовок ${data.title}`,
    );
    check(
      data.scrollWidth <= data.clientWidth,
      `[${engine}] прямой маршрут ${path}: горизонтальная прокрутка`,
    );
    if (path === '/') {
      check(
        new URL(page.url()).pathname === '/crm',
        `[${engine}] корень приложения ведёт на ${new URL(page.url()).pathname}`,
      );
    }
  }

  // Фокус с клавиатуры.
  await page.goto(`${BASE_URL}/crm`, { waitUntil: 'load' });
  await page.waitForSelector('h1');

  if (engine === 'webkit') {
    // Safari по умолчанию не включает ссылки в обход по Tab (это настройка
    // «Full Keyboard Access»), поэтому фокусируемость проверяем программно
    // и отдельно проверяем активацию ссылки с клавиатуры.
    const focusable = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('a.nav-item, [role="switch"], .create-button, .kanban-board'),
      ).map((element) => {
        element.focus();
        return document.activeElement === element;
      }),
    );
    check(
      focusable.length === 5 && focusable.every(Boolean),
      `[${engine}] интерактивные элементы фокусируемы: ${focusable.join(', ')}`,
    );

    await page.evaluate(() => document.querySelector('a[href="/service-desk"]').focus());
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('h1')?.textContent === 'Service Desk',
    );
    check(
      new URL(page.url()).pathname === '/service-desk',
      `[${engine}] Enter по ссылке ведёт на ${new URL(page.url()).pathname}`,
    );
  } else {
    const order = [];
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const element = document.activeElement;
          if (!element) return 'нет';
          if (element.matches('[role="switch"]')) return 'переключатель';
          if (element.matches('.create-button')) return 'Создать';
          if (element.matches('.kanban-board')) return 'доска';
          return element.textContent?.trim() || element.tagName;
        }),
      );
    }
    check(
      order[0] === 'CRM' &&
        order[1] === 'Service Desk' &&
        order[2] === 'переключатель' &&
        order[3] === 'Создать' &&
        order[4] === 'доска',
      `[${engine}] порядок Tab: ${order.join(' → ')}`,
    );
  }

  await context.close();
}

/** Кнопка «Создать»: уведомление-заглушка, автозакрытие и доступность. */
async function checkCreateButton(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`[${engine} уведомление] console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`[${engine} уведомление] pageerror: ${error.message}`);
  });

  await page.goto(`${BASE_URL}/crm`, { waitUntil: 'load' });
  await page.waitForSelector('.create-button');
  check(
    (await collect(page)).noticeCount === 0,
    `[${engine}] уведомление видно до нажатия «Создать»`,
  );

  await page.click('.create-button');
  await page.waitForSelector('.create-notice__message');
  const afterClick = await collect(page);
  check(
    afterClick.noticeText === CREATE_NOTICE_TEXT,
    `[${engine}] текст уведомления: "${afterClick.noticeText}"`,
  );
  check(afterClick.noticeCount === 1, `[${engine}] уведомлений: ${afterClick.noticeCount}`);
  check(
    afterClick.columnTotals.every((total) => total === '0 BYN'),
    `[${engine}] суммы изменились после нажатия: ${afterClick.columnTotals.join('|')}`,
  );

  if (engine === 'chromium') {
    const file = `${OUT_DIR}/crm-light-notice-1440x900.png`;
    await page.screenshot({ path: file });
    notes.push(`скриншот: ${file}`);
  }

  // Повторное нажатие не создаёт второе уведомление.
  await page.click('.create-button');
  check(
    (await collect(page)).noticeCount === 1,
    `[${engine}] второе нажатие добавило уведомление`,
  );

  // Уведомление скрывается примерно через 3,5 секунды.
  await page.waitForSelector('.create-notice__message', { state: 'detached', timeout: 8000 });
  check(
    (await collect(page)).noticeCount === 0,
    `[${engine}] уведомление не скрылось автоматически`,
  );

  await context.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const server = await preview({ preview: { port: PORT, strictPort: true, open: false } });

  try {
    for (const engine of ENGINES) {
      const browser = await engine.type.launch();
      try {
        for (const theme of THEMES) {
          for (const viewport of engine.viewports) {
            const context = await browser.newContext({
              viewport: { width: viewport.width, height: viewport.height },
              deviceScaleFactor: 1,
            });
            await context.addInitScript((value) => {
              window.localStorage.setItem('fincode-theme', value);
            }, theme);

            const page = await context.newPage();
            page.on('console', (message) => {
              if (message.type() === 'error') {
                problems.push(
                  `[${engine.name} ${theme} ${viewport.name}] console: ${message.text()}`,
                );
              }
            });
            page.on('pageerror', (error) => {
              problems.push(
                `[${engine.name} ${theme} ${viewport.name}] pageerror: ${error.message}`,
              );
            });
            page.on('requestfailed', (request) => {
              problems.push(
                `[${engine.name} ${theme} ${viewport.name}] запрос не выполнен: ` +
                  `${request.url()} (${request.failure()?.errorText})`,
              );
            });
            page.on('response', (response) => {
              if (response.status() >= 400) {
                problems.push(
                  `[${engine.name} ${theme} ${viewport.name}] HTTP ${response.status()} ` +
                    response.url(),
                );
              }
            });

            for (const route of ROUTES) {
              await checkLayout(page, engine.name, theme, viewport, route);
            }

            await context.close();
          }
        }

        await checkBehaviour(browser, engine.name);
        await checkCreateButton(browser, engine.name);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }

  for (const note of notes) {
    console.log(note);
  }
  if (problems.length > 0) {
    console.error(`\nПроверки не пройдены (${problems.length}):`);
    for (const problem of problems) {
      console.error(` - ${problem}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nВсе проверки пройдены.');
  }
}

await main();
