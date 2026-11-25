/**
 * Проверка оболочки в реальном браузере и скриншоты для приёмки.
 *
 * Запуск: npm run screenshots
 * Результат: docs/screenshots/*.png и отчёт по проверкам в консоли.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { chromium, firefox, webkit } from 'playwright';

/**
 * Проверки поднимают сервер приложения (API + собранный SPA) на отдельной
 * временной базе, чтобы не затрагивать рабочие данные.
 */
const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_FILE = join(PROJECT_ROOT, 'data', `_screenshots-${process.pid}.db`);
process.env.FINCODE_DB = DB_FILE;

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

const { startAppServer } = await import('../server/index.mjs');

const OUT_DIR = 'docs/screenshots';
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const DIST_DIR = join(PROJECT_ROOT, 'dist');

const THEMES = ['light', 'dark'];
const CRM_TAB_LABELS = ['Сделки', 'Клиенты', 'Поставщики'];
const ROUTES = [
  { name: 'crm-deals', path: '/crm/deals', title: 'CRM', tab: 'Сделки', shot: 'crm' },
  { name: 'crm-clients', path: '/crm/clients', title: 'CRM', tab: 'Клиенты', shot: 'crm-clients' },
  { name: 'crm-suppliers', path: '/crm/suppliers', title: 'CRM', tab: 'Поставщики' },
  { name: 'service-desk', path: '/service-desk', title: 'Service Desk' },
];
const KANBAN_TITLES = Array.from({ length: 7 }, (_, index) => `Столбец ${index + 1}`);
const KANBAN_IDS = Array.from({ length: 7 }, (_, index) => `column-${index + 1}`);
const CREATE_NOTICE_TEXT = 'Форма создания будет добавлена на следующем этапе';
const CLIENTS_EMPTY_TEXT = 'Клиенты пока не созданы';
const CLIENTS_NOT_FOUND_TEXT = 'Клиенты не найдены';
const CLIENTS_ERROR_TEXT = 'Не удалось загрузить клиентов';
const CLIENT_CREATED_TEXT = 'Клиент создан';
const RESPONSIBLE_NAME = 'Минич Антон Андреевич';
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
    const nav = document.querySelector('.sidebar__nav');
    const crmTabs = document.querySelector('.crm-tabs');
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
      activeLabel: nav?.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null,
      activeCount: nav ? nav.querySelectorAll('[aria-current="page"]').length : 0,
      tabLabels: crmTabs
        ? Array.from(crmTabs.querySelectorAll('a')).map((link) => link.textContent.trim())
        : [],
      tabActiveLabel:
        crmTabs?.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null,
      tabActiveCount: crmTabs ? crmTabs.querySelectorAll('[aria-current="page"]').length : 0,
      tabUnderlineColor: (() => {
        const active = crmTabs?.querySelector('.crm-tab--active');
        return active ? getComputedStyle(active).borderBottomColor : null;
      })(),
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
      // Вкладка «Клиенты».
      clientSearchPresent: document.querySelector('.client-search') !== null,
      clientSearchPlaceholder:
        document.querySelector('.client-search')?.getAttribute('placeholder') ?? null,
      clientTablePresent: document.querySelector('.client-table') !== null,
      clientTableHeaders: Array.from(document.querySelectorAll('.client-table thead th')).map(
        (cell) => trim(cell.textContent),
      ),
      clientRows: Array.from(document.querySelectorAll('.client-table tbody tr')).map((row) =>
        Array.from(row.children).map((cell) => trim(cell.textContent)),
      ),
      clientStateText: trim(document.querySelector('.client-table-state')?.textContent),
      clientToolbarPresent: document.querySelector('.client-toolbar') !== null,
      clientModalPresent: document.querySelector('dialog.client-modal') !== null,
      crmViewText: trim(document.querySelector('.crm-view')?.textContent),
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
  check(data.activeCount === 1, `${label} активных пунктов меню: ${data.activeCount}`);
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

  // Верхнее меню CRM: три вкладки в согласованном порядке, активна одна.
  if (route.tab) {
    check(
      data.tabLabels.join('|') === CRM_TAB_LABELS.join('|'),
      `${label} вкладки CRM: ${data.tabLabels.join('|')}`,
    );
    check(data.tabActiveCount === 1, `${label} активных вкладок: ${data.tabActiveCount}`);
    check(data.tabActiveLabel === route.tab, `${label} активная вкладка: ${data.tabActiveLabel}`);
    check(
      data.tabUnderlineColor === 'rgb(37, 173, 162)',
      `${label} подчёркивание вкладки: ${data.tabUnderlineColor}`,
    );
  } else {
    check(data.tabLabels.length === 0, `${label} вкладки CRM вне раздела: ${data.tabLabels.join('|')}`);
  }

  // Вкладка «Сделки»: прежний канбан без изменений.
  if (route.name === 'crm-deals') {
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

  // Вкладка «Клиенты»: панель действий, поиск и таблица из базы.
  if (route.name === 'crm-clients') {
    check(data.workspaceNodes === 2, `${label} узлов в main: ${data.workspaceNodes}`);
    check(!data.boardPresent, `${label} на вкладке клиентов найден канбан`);
    check(data.columnCount === 0, `${label} на вкладке клиентов столбцов: ${data.columnCount}`);
    check(data.clientToolbarPresent, `${label} панель действий клиентов отсутствует`);
    check(data.hasCreateButton, `${label} кнопка «Создать» отсутствует`);
    check(data.createButtonText === 'Создать', `${label} подпись кнопки: ${data.createButtonText}`);
    check(data.clientSearchPresent, `${label} поле поиска отсутствует`);
    check(
      data.clientSearchPlaceholder === 'Поиск по наименованию клиента…',
      `${label} подсказка поиска: ${data.clientSearchPlaceholder}`,
    );
    check(data.clientModalPresent, `${label} модальное окно отсутствует в разметке`);
    // Прогон макетов идёт до сценариев создания, база на этом этапе пуста.
    check(
      data.clientStateText === CLIENTS_EMPTY_TEXT,
      `${label} состояние пустого списка: "${data.clientStateText}"`,
    );
  }

  // Вкладка «Поставщики»: рабочая область пуста, функциональности клиентов нет.
  if (route.name === 'crm-suppliers') {
    check(!data.hasCreateButton, `${label} на вкладке поставщиков есть кнопка «Создать»`);
    check(!data.clientTablePresent, `${label} на вкладке поставщиков есть таблица клиентов`);
    check(!data.clientSearchPresent, `${label} на вкладке поставщиков есть поиск клиентов`);
    check(data.columnCount === 0, `${label} на вкладке поставщиков столбцов: ${data.columnCount}`);
    check(
      data.crmViewText === '',
      `${label} рабочая область поставщиков не пуста: "${data.crmViewText}"`,
    );
  }

  // Service Desk: без канбана, вкладок и кнопки создания сделки.
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

    if (route.name === 'crm-deals') {
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

    if (route.name === 'crm-deals') {
      check(data.columnCount === 7, `${label} столбцов: ${data.columnCount}`);
      check(data.columnRows === 1, `${label} столбцы не в один ряд: ${data.columnRows}`);
      check(data.boardScrolls, `${label} доска не прокручивается на узком экране`);
      check(
        data.createButtonRight <= viewport.width,
        `${label} кнопка «Создать» за пределами экрана: ${data.createButtonRight}`,
      );
    }

    if (route.name === 'crm-clients') {
      check(data.clientToolbarPresent, `${label} панель действий клиентов отсутствует`);
      check(
        data.createButtonRight <= viewport.width,
        `${label} кнопка «Создать» за пределами экрана: ${data.createButtonRight}`,
      );
    }
  }

  if (viewport.shot && engine === 'chromium' && route.shot) {
    const file = `${OUT_DIR}/${route.shot}-${theme}-${viewport.name}.png`;
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
  await page.waitForURL((url) => url.pathname.startsWith('/crm'));
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
  for (const path of ['/service-desk', '/crm', '/crm/clients', '/crm/suppliers', '/']) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
    if (path === '/crm') {
      await page.waitForURL((url) => url.pathname === '/crm/deals');
    } else if (path === '/') {
      await page.waitForURL((url) => url.pathname.startsWith('/crm'));
    }
    await page.waitForFunction(() => document.querySelector('h1') !== null);
    if (path.startsWith('/crm')) {
      await page.waitForFunction(() => document.querySelector('.crm-tab--active') !== null);
    }
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
        new URL(page.url()).pathname.startsWith('/crm'),
        `[${engine}] корень приложения ведёт на ${new URL(page.url()).pathname}`,
      );
    }
    if (path === '/crm') {
      check(
        new URL(page.url()).pathname === '/crm/deals',
        `[${engine}] /crm открывает вкладку ${new URL(page.url()).pathname}`,
      );
      check(
        data.tabActiveLabel === 'Сделки',
        `[${engine}] /crm активная вкладка: ${data.tabActiveLabel}`,
      );
    }
    if (path === '/crm/clients') {
      check(
        data.tabActiveLabel === 'Клиенты',
        `[${engine}] /crm/clients активная вкладка: ${data.tabActiveLabel}`,
      );
    }
    if (path === '/crm/suppliers') {
      check(
        data.tabActiveLabel === 'Поставщики',
        `[${engine}] /crm/suppliers активная вкладка: ${data.tabActiveLabel}`,
      );
    }
  }

  // Фокус с клавиатуры.
  await page.goto(`${BASE_URL}/crm`, { waitUntil: 'load' });
  await page.waitForURL((url) => url.pathname === '/crm/deals');
  await page.waitForFunction(() => document.querySelector('.kanban-board') !== null);

  if (engine === 'webkit') {
    // Safari по умолчанию не включает ссылки в обход по Tab (это настройка
    // «Full Keyboard Access»), поэтому фокусируемость проверяем программно
    // и отдельно проверяем активацию ссылки с клавиатуры.
    const focusable = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          'a.nav-item, [role="switch"], a.crm-tab, .create-button, .kanban-board',
        ),
      ).map((element) => {
        element.focus();
        return document.activeElement === element;
      }),
    );
    check(
      focusable.length === 8 && focusable.every(Boolean),
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
    for (let index = 0; index < 8; index += 1) {
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
      order.join('|') ===
        ['CRM', 'Service Desk', 'переключатель', 'Сделки', 'Клиенты', 'Поставщики', 'Создать', 'доска'].join(
          '|',
        ),
      `[${engine}] порядок Tab: ${order.join(' → ')}`,
    );
  }

  await context.close();
}

/** Сценарии раздела «Клиенты»: форма, проверки, создание, поиск, постоянное хранение. */
async function checkClientsFlow(browser) {
  const engine = 'chromium';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const posts = [];
  // На время сценария с недоступным сервером ожидаемая сетевая ошибка в консоли
  // не считается дефектом.
  let abortingRequests = false;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/clients')) {
      posts.push(request.headers()['idempotency-key'] ?? null);
    }
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (abortingRequests && message.text().includes('ERR_FAILED')) return;
    problems.push(`[${engine} клиенты] console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`[${engine} клиенты] pageerror: ${error.message}`));
  page.on('dialog', (dialog) => void dialog.accept());

  const openModal = async () => {
    await page.click('.client-toolbar .create-button');
    await page.waitForFunction(() => document.querySelector('dialog.client-modal')?.open === true);
  };
  const waitModalClosed = () =>
    page.waitForFunction(() => document.querySelector('dialog.client-modal')?.open !== true);
  const submit = async () => {
    await page.click('.client-form button[type="submit"]');
  };
  const fieldErrorText = async (id) => {
    const locator = page.locator(`#${id}`);
    return (await locator.count()) > 0 ? (await locator.first().textContent()).trim() : null;
  };

  await page.goto(`${BASE_URL}/crm/clients`, { waitUntil: 'load' });
  await page.waitForSelector('.client-table-state');
  let data = await collect(page);
  check(
    data.clientStateText === CLIENTS_EMPTY_TEXT,
    `[${engine} клиенты] пустой список: "${data.clientStateText}"`,
  );

  // --- Форма: состав и значения по умолчанию -------------------------------
  await openModal();
  const dialogTitle = (await page.locator('#create-client-title').textContent())?.trim();
  check(
    dialogTitle === 'Создание клиента',
    `[${engine} клиенты] заголовок окна: "${dialogTitle}"`,
  );
  const fieldIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('dialog.client-modal .client-field__input')).map(
      (element) => element.id,
    ),
  );
  check(
    fieldIds.join('|') ===
      [
        'create-client-last-name',
        'create-client-first-name',
        'create-client-middle-name',
        'create-client-phone',
        'create-client-email',
        'create-client-responsible',
      ].join('|'),
    `[${engine} клиенты] порядок полей: ${fieldIds.join('|')}`,
  );
  check(
    (await page.inputValue('#create-client-responsible')) !== '' &&
      (await page.locator('#create-client-responsible option:checked').textContent())?.trim() ===
        RESPONSIBLE_NAME,
    `[${engine} клиенты] ответственный по умолчанию не выбран`,
  );
  const requiredCount = await page.locator('.client-field__required').count();
  check(requiredCount === 3, `[${engine} клиенты] обязательных отметок: ${requiredCount}`);
  check(
    (await page.locator('.client-form__hint').textContent())?.trim() === '* — обязательные поля',
    `[${engine} клиенты] нет пояснения об обязательных полях`,
  );

  // --- Клиентская валидация ------------------------------------------------
  posts.length = 0;
  await submit();
  await page.waitForTimeout(150);
  check(
    (await fieldErrorText('create-client-firstName-error')) === 'Укажите имя',
    `[${engine} клиенты] сообщение по имени: ${await fieldErrorText('create-client-firstName-error')}`,
  );
  check(posts.length === 0, `[${engine} клиенты] при ошибке отправлен запрос`);

  await page.fill('#create-client-first-name', '   ');
  await submit();
  await page.waitForTimeout(150);
  check(
    (await fieldErrorText('create-client-firstName-error')) === 'Укажите имя',
    `[${engine} клиенты] имя из пробелов принято`,
  );

  await page.fill('#create-client-first-name', 'Иван');
  await submit();
  await page.waitForTimeout(150);
  check(
    (await fieldErrorText('create-client-phone-error')) === 'Укажите телефон',
    `[${engine} клиенты] сообщение по телефону: ${await fieldErrorText('create-client-phone-error')}`,
  );

  await page.fill('#create-client-phone', '+375291112233');
  await page.fill('#create-client-email', 'client@example');
  await submit();
  await page.waitForTimeout(150);
  check(
    (await fieldErrorText('create-client-email-error')) === 'Укажите корректный E-mail',
    `[${engine} клиенты] сообщение по E-mail: ${await fieldErrorText('create-client-email-error')}`,
  );
  check(posts.length === 0, `[${engine} клиенты] при ошибке E-mail отправлен запрос`);
  check(
    (await page.inputValue('#create-client-first-name')) === 'Иван',
    `[${engine} клиенты] значения полей очищены после ошибки`,
  );

  // --- Успешное создание ---------------------------------------------------
  posts.length = 0;
  await page.fill('#create-client-last-name', '  Иванов  ');
  await page.fill('#create-client-middle-name', 'Иванович');
  await page.fill('#create-client-email', 'client@example.com');
  const modalShot = `${OUT_DIR}/crm-clients-modal-light-1440x900.png`;
  await page.screenshot({ path: modalShot });
  notes.push(`скриншот: ${modalShot}`);
  await submit();
  await waitModalClosed();
  check(posts.length === 1, `[${engine} клиенты] запросов на создание: ${posts.length}`);
  check(Boolean(posts[0]), `[${engine} клиенты] запрос без ключа идемпотентности`);
  await page.waitForSelector('.toast__message');
  const toastText = (await page.locator('.toast__message').textContent())?.trim();
  check(
    toastText === CLIENT_CREATED_TEXT,
    `[${engine} клиенты] уведомление после сохранения: "${toastText}"`,
  );
  check(
    (await page.inputValue('.client-search')) === '',
    `[${engine} клиенты] строка поиска не очищена после создания`,
  );
  await page.waitForFunction(() => document.querySelectorAll('.client-table tbody tr').length === 1);
  data = await collect(page);
  check(data.clientRows.length === 1, `[${engine} клиенты] строк в таблице: ${data.clientRows.length}`);
  check(
    data.clientRows[0]?.join('|') ===
      ['Иванов Иван Иванович', '+375291112233', 'client@example.com', RESPONSIBLE_NAME].join('|'),
    `[${engine} клиенты] первая строка: ${data.clientRows[0]?.join(' | ')}`,
  );
  check(
    data.clientTableHeaders.join('|') === ['Клиент', 'Телефон', 'E-mail', 'Ответственный'].join('|'),
    `[${engine} клиенты] заголовки таблицы: ${data.clientTableHeaders.join('|')}`,
  );

  // --- Постоянное хранение -------------------------------------------------
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.client-table tbody tr').length === 1);
  data = await collect(page);
  check(
    data.clientRows[0]?.[0] === 'Иванов Иван Иванович',
    `[${engine} клиенты] после обновления страницы: ${data.clientRows[0]?.[0]}`,
  );

  // --- Поиск ---------------------------------------------------------------
  await page.fill('.client-search', 'СИДОР');
  await page.waitForTimeout(700);
  const notFound = (await page.locator('.client-table-state').textContent())?.trim();
  check(
    notFound === CLIENTS_NOT_FOUND_TEXT,
    `[${engine} клиенты] поиск без совпадений: "${notFound}"`,
  );

  await page.fill('.client-search', 'ИВА');
  await page.waitForTimeout(700);
  data = await collect(page);
  check(
    data.clientRows.length === 1,
    `[${engine} клиенты] поиск без учёта регистра: строк ${data.clientRows.length}`,
  );

  await page.fill('.client-search', 'иванович  иванов');
  await page.waitForTimeout(700);
  data = await collect(page);
  check(
    data.clientRows.length === 1,
    `[${engine} клиенты] многословный поиск: строк ${data.clientRows.length}`,
  );

  await page.fill('.client-search', '');
  await page.waitForTimeout(700);
  data = await collect(page);
  check(
    data.clientRows.length === 1,
    `[${engine} клиенты] очистка поиска вернула список: строк ${data.clientRows.length}`,
  );

  // --- Отмена и Escape без создания ----------------------------------------
  posts.length = 0;
  await openModal();
  await page.fill('#create-client-first-name', 'Пётр');
  await page.click('.client-form .client-button--secondary');
  await waitModalClosed();
  await page.waitForTimeout(200);
  check(posts.length === 0, `[${engine} клиенты] «Отмена» отправила запрос`);

  await openModal();
  check(
    (await page.inputValue('#create-client-first-name')) === '',
    `[${engine} клиенты] повторное открытие сохранило прежние значения`,
  );
  await page.fill('#create-client-first-name', 'Пётр');
  await page.keyboard.press('Escape');
  await waitModalClosed();
  await page.waitForTimeout(200);
  check(posts.length === 0, `[${engine} клиенты] Escape отправил запрос`);

  // --- Создание при активном поиске и двойное нажатие ----------------------
  await page.fill('.client-search', 'Сидоров');
  await page.waitForTimeout(700);
  check(
    (await page.locator('.client-table-state').textContent())?.trim() === CLIENTS_NOT_FOUND_TEXT,
    `[${engine} клиенты] поиск перед созданием не применён`,
  );

  await openModal();
  await page.fill('#create-client-first-name', 'Пётр');
  await page.fill('#create-client-phone', '+375299998877');
  posts.length = 0;
  await page.click('.client-form button[type="submit"]');
  await page
    .click('.client-form button[type="submit"]', { force: true, timeout: 1500 })
    .catch(() => {});
  await waitModalClosed();
  await page.waitForTimeout(400);
  check(
    posts.length === 1,
    `[${engine} клиенты] двойное нажатие отправило запросов: ${posts.length}`,
  );
  check(
    (await page.inputValue('.client-search')) === '',
    `[${engine} клиенты] поиск не очищен после создания`,
  );
  await page.waitForFunction(() => document.querySelectorAll('.client-table tbody tr').length === 2);
  data = await collect(page);
  check(
    data.clientRows[0]?.[0] === 'Пётр',
    `[${engine} клиенты] новый клиент не первый в списке: ${data.clientRows[0]?.[0]}`,
  );

  // --- Сервер недоступен: окно открыто, значения сохранены ----------------
  await openModal();
  await page.fill('#create-client-first-name', 'Сергей');
  await page.fill('#create-client-phone', '+375291110000');
  await page.route('**/api/clients**', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  );
  abortingRequests = true;
  posts.length = 0;
  await submit();
  await page.waitForSelector('.client-form__error');
  const generalError = (await page.locator('.client-form__error').textContent())?.trim();
  check(
    generalError === 'Не удалось создать клиента. Попробуйте ещё раз',
    `[${engine} клиенты] общая ошибка: "${generalError}"`,
  );
  check(
    await page.locator('dialog.client-modal').evaluate((element) => element.open),
    `[${engine} клиенты] окно закрылось при ошибке сохранения`,
  );
  check(
    (await page.inputValue('#create-client-first-name')) === 'Сергей',
    `[${engine} клиенты] значения формы потеряны после ошибки`,
  );
  await page.unroute('**/api/clients**');
  abortingRequests = false;
  await page.click('.client-form .client-button--secondary');
  await waitModalClosed();

  const db = new DatabaseSync(DB_FILE);
  const storedRows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  const clientCount = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
  const requestCount = db.prepare('SELECT COUNT(*) AS n FROM client_creation_requests').get().n;
  db.close();

  check(clientCount === 2, `[${engine} клиенты] записей в таблице «Клиенты»: ${clientCount}`);
  check(requestCount === 2, `[${engine} клиенты] ключей идемпотентности: ${requestCount}`);
  check(
    storedRows.some(
      (row) =>
        row.last_name === 'Иванов' &&
        row.first_name === 'Иван' &&
        row.middle_name === 'Иванович' &&
        row.email === 'client@example.com' &&
        row.responsible_user_id === 'usr-minich-anton-andreevich',
    ),
    `[${engine} клиенты] значения первой записи в базе не совпадают с формой`,
  );
  check(
    storedRows.some((row) => row.first_name === 'Пётр' && row.phone === '+375299998877'),
    `[${engine} клиенты] вторая запись не найдена в базе`,
  );
  check(
    !storedRows.some((row) => row.first_name === 'Сергей'),
    `[${engine} клиенты] неуспешная попытка создала запись`,
  );

  const listShot = `${OUT_DIR}/crm-clients-list-light-1440x900.png`;
  await page.screenshot({ path: listShot });
  notes.push(`скриншот: ${listShot}`);

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
  mkdirSync(OUT_DIR, { recursive: true });

  const server = await startAppServer({ port: PORT, staticDir: DIST_DIR });

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

    // Сценарии создания клиента идут последними: они наполняют базу,
    // поэтому проверки макетов выполняются на пустом списке.
    const flowBrowser = await chromium.launch();
    try {
      await checkClientsFlow(flowBrowser);
    } finally {
      await flowBrowser.close();
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

  // Временная база проверок удаляется.
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
}

await main();
