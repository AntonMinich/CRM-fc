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

/** Разбирает `rgb(...)`, `rgba(...)` и `#hex` в компоненты для сравнения цветов. */
function rgba(value) {
  const text = String(value ?? '').trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((char) => char + char)
        .join('');
    }
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = /rgba?\(([^)]+)\)/.exec(text);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** Сравнивает цвета с допуском по альфе. */
function sameColor(value, expected) {
  const actual = rgba(value);
  const target = rgba(expected);
  if (!actual || !target) return false;
  return (
    actual.r === target.r &&
    actual.g === target.g &&
    actual.b === target.b &&
    Math.abs(actual.a - target.a) < 0.02
  );
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
      clientSearchLabel: document.querySelector('.client-search')?.getAttribute('aria-label') ?? null,
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
      // Мягкое оформление таблицы клиентов.
      clientTableStyles: (() => {
        const wrap = document.querySelector('.client-table-wrap');
        const table = document.querySelector('.client-table');
        const head = document.querySelector('.client-table thead th');
        const rows = Array.from(document.querySelectorAll('.client-table tbody tr'));
        const firstRow = rows[0] ?? null;
        const firstCell = firstRow?.querySelector('td') ?? null;
        const lastRow = rows[rows.length - 1] ?? null;
        const lastCell = lastRow?.lastElementChild ?? null;
        if (!wrap || !table || !head || !firstCell) return null;
        const wrapStyle = getComputedStyle(wrap);
        const tableStyle = getComputedStyle(table);
        const headStyle = getComputedStyle(head);
        const cellStyle = getComputedStyle(firstCell);
        const dividerStyle = getComputedStyle(firstCell, '::after');
        const lastDividerStyle = lastCell ? getComputedStyle(lastCell, '::after') : null;
        return {
          wrapBackground: wrapStyle.backgroundColor,
          wrapBorderColor: wrapStyle.borderTopColor,
          wrapRadius: wrapStyle.borderTopLeftRadius,
          borderCollapse: tableStyle.borderCollapse,
          tableLayout: tableStyle.tableLayout,
          minWidth: tableStyle.minWidth,
          colCount: table.querySelectorAll('colgroup col').length,
          headBackground: headStyle.backgroundColor,
          headPosition: headStyle.position,
          headFontSize: headStyle.fontSize,
          headFontWeight: headStyle.fontWeight,
          cellBorderLeftWidth: cellStyle.borderLeftWidth,
          cellBorderRightWidth: cellStyle.borderRightWidth,
          cellBorderTopWidth: cellStyle.borderTopWidth,
          cellPaddingTop: cellStyle.paddingTop,
          cellPaddingLeft: cellStyle.paddingLeft,
          cellFontSize: cellStyle.fontSize,
          cellLineHeight: cellStyle.lineHeight,
          cellBackground: cellStyle.backgroundColor,
          firstNameColor: cellStyle.color,
          firstNameWeight: cellStyle.fontWeight,
          otherCellColor: firstRow.children[1]
            ? getComputedStyle(firstRow.children[1]).color
            : null,
          dividerContent: dividerStyle.content,
          dividerColor: dividerStyle.backgroundColor,
          dividerHeight: dividerStyle.height,
          dividerLeft: dividerStyle.left,
          lastDividerColor: lastDividerStyle ? lastDividerStyle.backgroundColor : null,
          rowRadius: cellStyle.borderTopLeftRadius,
          rowHeights: rows.map((row) => Math.round(row.getBoundingClientRect().height)),
          rowBackgrounds: rows.map((row) => {
            const cell = row.querySelector('td');
            return cell ? getComputedStyle(cell).backgroundColor : null;
          }),
        };
      })(),
      // Уведомление об успешном создании клиента.
      toastStyles: (() => {
        const message = document.querySelector('.toast__message');
        if (!message) return null;
        const style = getComputedStyle(message);
        const rect = message.getBoundingClientRect();
        const icon = message.querySelector('.toast__icon');
        const text = message.querySelector('.toast__text');
        const textStyle = text ? getComputedStyle(text) : null;
        return {
          text: (text?.textContent ?? '').trim(),
          background: style.backgroundColor,
          borderTopColor: style.borderTopColor,
          borderTopWidth: style.borderTopWidth,
          borderLeftColor: style.borderLeftColor,
          borderLeftWidth: style.borderLeftWidth,
          radius: style.borderTopLeftRadius,
          shadow: style.boxShadow,
          width: Math.round(rect.width),
          offsetRight: Math.round(window.innerWidth - rect.right),
          offsetBottom: Math.round(window.innerHeight - rect.bottom),
          fontSize: textStyle ? textStyle.fontSize : null,
          fontWeight: textStyle ? textStyle.fontWeight : null,
          hasIcon: Boolean(message.querySelector('.toast__icon svg')),
          iconBackground: icon ? getComputedStyle(icon).backgroundColor : null,
          closeLabel: message.querySelector('.toast__close')?.getAttribute('aria-label') ?? null,
        };
      })(),
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
      data.clientSearchPlaceholder === 'Поиск по ФИО или телефону…',
      `${label} подсказка поиска: ${data.clientSearchPlaceholder}`,
    );
    check(
      data.clientSearchLabel === 'Поиск по ФИО или телефону клиента',
      `${label} доступное имя поиска: ${data.clientSearchLabel}`,
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

/** Проверяет оформление уведомления об успешном создании (раздел 6 ТЗ). */
function checkToastStyles(styles, theme, engine) {
  const label = `[${engine} клиенты ${theme}]`;
  if (!styles) {
    check(false, `${label} уведомление об успешном создании не показано`);
    return;
  }
  const palette =
    theme === 'dark'
      ? { background: '#1b3040', border: '#47b99a', accent: '#71e6bd', icon: '#234c48' }
      : { background: '#ffffff', border: '#8cc9b8', accent: '#087f65', icon: '#dff5ec' };

  check(styles.text === CLIENT_CREATED_TEXT, `${label} текст уведомления: "${styles.text}"`);
  check(
    sameColor(styles.background, palette.background),
    `${label} подложка уведомления: ${styles.background}`,
  );
  check(
    rgba(styles.background)?.a === 1,
    `${label} подложка уведомления не непрозрачная: ${styles.background}`,
  );
  check(
    sameColor(styles.borderTopColor, palette.border) && styles.borderTopWidth === '1px',
    `${label} рамка уведомления: ${styles.borderTopColor} ${styles.borderTopWidth}`,
  );
  check(
    sameColor(styles.borderLeftColor, palette.accent) && styles.borderLeftWidth === '4px',
    `${label} акцент уведомления: ${styles.borderLeftColor} ${styles.borderLeftWidth}`,
  );
  check(
    sameColor(styles.iconBackground, palette.icon),
    `${label} фон значка: ${styles.iconBackground}`,
  );
  check(styles.radius === '12px', `${label} скругление уведомления: ${styles.radius}`);
  check(styles.shadow !== 'none', `${label} у уведомления нет тени`);
  check(styles.hasIcon, `${label} в уведомлении нет галочки`);
  check(
    styles.closeLabel === 'Закрыть уведомление',
    `${label} доступное имя крестика: ${styles.closeLabel}`,
  );
  check(styles.width === 360, `${label} ширина уведомления: ${styles.width}`);
  check(
    styles.offsetRight === 26 && styles.offsetBottom === 26,
    `${label} отступы уведомления: ${styles.offsetRight}/${styles.offsetBottom}`,
  );
  check(styles.fontSize === '14px', `${label} размер текста: ${styles.fontSize}`);
  check(styles.fontWeight === '600', `${label} начертание текста: ${styles.fontWeight}`);
}

/** Проверяет мягкое оформление таблицы клиентов (раздел 5 ТЗ). */
function checkTableStyles(styles, theme, engine) {
  const label = `[${engine} клиенты ${theme}]`;
  if (!styles) {
    check(false, `${label} таблица клиентов не найдена`);
    return;
  }
  const surface = theme === 'dark' ? 'rgba(15, 25, 48, 0.76)' : 'rgba(255, 255, 255, 0.72)';
  const head = theme === 'dark' ? 'rgba(26, 40, 71, 0.84)' : 'rgba(232, 238, 248, 0.8)';
  const border = theme === 'dark' ? 'rgba(155, 181, 224, 0.17)' : 'rgba(80, 102, 144, 0.18)';
  const line = theme === 'dark' ? 'rgba(155, 181, 224, 0.08)' : 'rgba(80, 102, 144, 0.08)';
  const primary = theme === 'dark' ? '#f2f4ff' : '#101954';
  const secondary = theme === 'dark' ? '#a5b2cc' : '#65718b';

  check(
    sameColor(styles.wrapBackground, surface),
    `${label} поверхность таблицы: ${styles.wrapBackground}`,
  );
  check(
    rgba(styles.wrapBackground)?.a < 1,
    `${label} поверхность таблицы не полупрозрачная: ${styles.wrapBackground}`,
  );
  check(
    sameColor(styles.wrapBorderColor, border),
    `${label} граница таблицы: ${styles.wrapBorderColor}`,
  );
  check(styles.wrapRadius === '12px', `${label} скругление таблицы: ${styles.wrapRadius}`);
  check(sameColor(styles.headBackground, head), `${label} фон шапки: ${styles.headBackground}`);
  check(styles.headPosition === 'sticky', `${label} шапка не закреплена: ${styles.headPosition}`);
  check(
    styles.headFontSize === '12px' && styles.headFontWeight === '500',
    `${label} шрифт шапки: ${styles.headFontSize}/${styles.headFontWeight}`,
  );
  check(styles.borderCollapse === 'separate', `${label} border-collapse: ${styles.borderCollapse}`);
  check(styles.tableLayout === 'fixed', `${label} table-layout: ${styles.tableLayout}`);
  check(styles.colCount === 5, `${label} колонок в colgroup: ${styles.colCount}`);
  check(styles.minWidth === '960px', `${label} минимальная ширина таблицы: ${styles.minWidth}`);
  check(
    styles.cellBorderLeftWidth === '0px' &&
      styles.cellBorderRightWidth === '0px' &&
      styles.cellBorderTopWidth === '0px',
    `${label} у ячеек есть сетка: ${styles.cellBorderLeftWidth}/${styles.cellBorderRightWidth}/${styles.cellBorderTopWidth}`,
  );
  check(
    sameColor(styles.cellBackground, 'rgba(0, 0, 0, 0)'),
    `${label} у ячейки своя заливка: ${styles.cellBackground}`,
  );
  check(
    styles.cellPaddingTop === '26px',
    `${label} вертикальный отступ ячейки: ${styles.cellPaddingTop}`,
  );
  check(
    styles.cellPaddingLeft === '24px',
    `${label} горизонтальный отступ ячейки: ${styles.cellPaddingLeft}`,
  );
  check(styles.cellFontSize === '13px', `${label} размер данных: ${styles.cellFontSize}`);
  check(styles.cellLineHeight === '19.5px', `${label} межстрочный интервал: ${styles.cellLineHeight}`);
  check(
    styles.rowHeights.every((height) => height >= 72 && height <= 92),
    `${label} высота строк: ${styles.rowHeights.join('|')}`,
  );
  check(
    styles.rowBackgrounds.every((background) => rgba(background)?.a === 0),
    `${label} в таблице есть зебра: ${styles.rowBackgrounds.join('|')}`,
  );
  check(styles.dividerContent !== 'none', `${label} между строками нет разделителя`);
  check(styles.dividerHeight === '1px', `${label} толщина разделителя: ${styles.dividerHeight}`);
  check(sameColor(styles.dividerColor, line), `${label} цвет разделителя: ${styles.dividerColor}`);
  check(styles.dividerLeft === '24px', `${label} отступ разделителя: ${styles.dividerLeft}`);
  check(
    sameColor(styles.lastDividerColor, 'rgba(0, 0, 0, 0)'),
    `${label} линия после последней строки нарисована: ${styles.lastDividerColor}`,
  );
  check(styles.rowRadius === '10px', `${label} скругление подсветки: ${styles.rowRadius}`);
  check(
    styles.firstNameWeight === '600' && sameColor(styles.firstNameColor, primary),
    `${label} ФИО не выделено: ${styles.firstNameWeight}/${styles.firstNameColor}`,
  );
  check(
    sameColor(styles.otherCellColor, secondary),
    `${label} вторичный цвет данных: ${styles.otherCellColor}`,
  );
}

/** Сценарии раздела «Клиенты»: форма, проверки, создание, поиск, постоянное хранение. */
async function checkClientsFlow(browser) {
  const engine = 'chromium';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const posts = [];
  const patches = [];
  // На время сценария с недоступным сервером ожидаемая сетевая ошибка в консоли
  // не считается дефектом.
  let abortingRequests = false;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/clients')) {
      posts.push(request.headers()['idempotency-key'] ?? null);
    }
    if (request.method() === 'PATCH' && request.url().includes('/api/clients')) {
      patches.push(request.headers()['idempotency-key'] ?? null);
    }
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (abortingRequests && message.text().includes('ERR_FAILED')) return;
    if (isExpectedHttpError(message.text())) return;
    problems.push(`[${engine} клиенты] console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`[${engine} клиенты] pageerror: ${error.message}`));
  let confirmCount = 0;
  page.on('dialog', (dialog) => {
    confirmCount += 1;
    void dialog.accept();
  });
  // Сценарии конфликта и удалённого клиента ожидают ответы 409 и 404: ошибки
  // этих запросов в консоли не считаются дефектами.
  let expectingHttpError = false;
  const isExpectedHttpError = (text) =>
    expectingHttpError &&
    (text.includes('409 (Conflict)') ||
      text.includes('404 (Not Found)') ||
      text.includes('422 (Unprocessable'));

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
    Array.from(
      document.querySelectorAll(
        'dialog.client-modal [role="tabpanel"]:not([hidden]) .client-field__input',
      ),
    ).map((element) => element.id),
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
        'create-client-comment',
      ].join('|'),
    `[${engine} клиенты] порядок полей: ${fieldIds.join('|')}`,
  );
  const windowTabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('dialog.client-modal [role="tab"]')).map((tab) => ({
      label: tab.textContent.trim(),
      selected: tab.getAttribute('aria-selected'),
    })),
  );
  check(
    windowTabs.map((tab) => tab.label).join('|') === 'Установочные данные|Реквизиты' &&
      windowTabs[0]?.selected === 'true' &&
      windowTabs[1]?.selected === 'false',
    `[${engine} клиенты] вкладки окна: ${JSON.stringify(windowTabs)}`,
  );
  const addressFieldIds = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('dialog.client-modal [role="tabpanel"][hidden] .client-field__input'),
    ).map((element) => element.id),
  );
  check(
    addressFieldIds.join('|') ===
      [
        'create-client-reg-postal-code',
        'create-client-reg-country',
        'create-client-reg-city',
        'create-client-reg-street',
        'create-client-reg-house',
        'create-client-reg-building',
        'create-client-reg-apartment',
        'create-client-res-postal-code',
        'create-client-res-country',
        'create-client-res-city',
        'create-client-res-street',
        'create-client-res-house',
        'create-client-res-building',
        'create-client-res-apartment',
      ].join('|'),
    `[${engine} клиенты] поля вкладки «Реквизиты»: ${addressFieldIds.join('|')}`,
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

  // --- Телефон: маска и правила (дополнение к ТЗ) -------------------------
  const phoneState = () =>
    page.evaluate(() => {
      const input = document.querySelector('#create-client-phone');
      return {
        type: input.getAttribute('type'),
        inputMode: input.getAttribute('inputmode'),
        autoComplete: input.getAttribute('autocomplete'),
        placeholder: input.getAttribute('placeholder'),
        value: input.value,
        error: document.querySelector('#create-client-phone-error')?.textContent?.trim() ?? null,
      };
    });

  let phone = await phoneState();
  check(
    phone.type === 'tel' && phone.inputMode === 'tel' && phone.autoComplete === 'tel',
    `[${engine} клиенты] атрибуты телефона: ${phone.type}/${phone.inputMode}/${phone.autoComplete}`,
  );
  check(
    phone.placeholder === '+375 (__) ___-__-__',
    `[${engine} клиенты] подсказка телефона: ${phone.placeholder}`,
  );
  check(phone.value === '', `[${engine} клиенты] поле телефона не пустое: "${phone.value}"`);

  // Ошибка не появляется на первой цифре, но появляется после потери фокуса.
  await page.click('#create-client-phone');
  await page.keyboard.type('4');
  phone = await phoneState();
  check(phone.error === null, `[${engine} клиенты] ошибка при вводе: "${phone.error}"`);
  check(phone.value === '+375 (4', `[${engine} клиенты] маска после одной цифры: "${phone.value}"`);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  phone = await phoneState();
  check(
    phone.error === 'Введите номер полностью: +375 (XX) XXX-XX-XX',
    `[${engine} клиенты] неполный номер: "${phone.error}"`,
  );

  // Полный ввод девятью цифрами.
  await page.fill('#create-client-phone', '');
  await page.click('#create-client-phone');
  await page.keyboard.type('447574055');
  phone = await phoneState();
  check(
    phone.value === '+375 (44) 757-40-55',
    `[${engine} клиенты] маска полного номера: "${phone.value}"`,
  );

  // Буквы игнорируются, сверх девяти цифр ввод не принимается.
  await page.fill('#create-client-phone', '');
  await page.click('#create-client-phone');
  await page.keyboard.type('a4b4c757405599');
  phone = await phoneState();
  check(
    phone.value === '+375 (44) 757-40-55',
    `[${engine} клиенты] маска при вводе с буквами: "${phone.value}"`,
  );

  // Backspace убирает цифру вместе со знаками оформления рядом с ней.
  await page.keyboard.press('Backspace');
  phone = await phoneState();
  check(phone.value === '+375 (44) 757-40-5', `[${engine} клиенты] backspace: "${phone.value}"`);

  await page.keyboard.press('Backspace');
  phone = await phoneState();
  check(
    phone.value === '+375 (44) 757-40',
    `[${engine} клиенты] backspace со знаком оформления: "${phone.value}"`,
  );

  // Вставка из буфера: распознаются +375, 375, 80 и «8 0».
  const pasteCases = [
    ['447574055', '+375 (44) 757-40-55'],
    ['+375447574055', '+375 (44) 757-40-55'],
    ['375447574055', '+375 (44) 757-40-55'],
    ['8 044 757-40-55', '+375 (44) 757-40-55'],
    ['+375 (44) 757-40-55', '+375 (44) 757-40-55'],
    ['80447574055', '+375 (44) 757-40-55'],
  ];
  for (const [input, expected] of pasteCases) {
    await page.fill('#create-client-phone', input);
    phone = await phoneState();
    check(phone.value === expected, `[${engine} клиенты] вставка «${input}»: "${phone.value}"`);
  }

  // Недопустимый код и пустое поле.
  await page.fill('#create-client-phone', '161234567');
  await page.locator('#create-client-phone').blur();
  await page.waitForTimeout(120);
  phone = await phoneState();
  check(
    phone.error === 'Укажите номер с кодом 17, 25, 29, 33 или 44',
    `[${engine} клиенты] сообщение о коде: "${phone.error}"`,
  );

  await page.fill('#create-client-phone', '');
  await page.locator('#create-client-phone').blur();
  await page.waitForTimeout(120);
  phone = await phoneState();
  check(phone.error === 'Укажите телефон', `[${engine} клиенты] пустой телефон: "${phone.error}"`);

  // Только префикс +375 изменением не считается: «Отмена» закрывает без вопроса.
  confirmCount = 0;
  await page.click('.client-form .client-button--secondary');
  await waitModalClosed();
  await page.waitForTimeout(150);
  check(confirmCount === 0, `[${engine} клиенты] подтверждение закрытия из-за префикса +375`);

  await openModal();

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
  // Ждём завершения анимации появления, чтобы измерить итоговое положение.
  await page.waitForTimeout(300);
  data = await collect(page);
  checkToastStyles(data.toastStyles, 'light', engine);
  check(
    (await page.inputValue('.client-search')) === '',
    `[${engine} клиенты] строка поиска не очищена после создания`,
  );

  const toastShotLight = `${OUT_DIR}/crm-clients-toast-light-1440x900.png`;
  await page.screenshot({ path: toastShotLight });
  notes.push(`скриншот: ${toastShotLight}`);

  // Пока указатель над уведомлением, срок показа приостановлен.
  await page.hover('.toast__message');
  await page.waitForTimeout(7000);
  check(
    (await page.locator('.toast__message').count()) === 1,
    `[${engine} клиенты] уведомление скрылось при наведении`,
  );
  await page.mouse.move(5, 5);
  await page.waitForTimeout(3600);
  check(
    (await page.locator('.toast__message').count()) === 0,
    `[${engine} клиенты] уведомление не скрылось после ухода указателя`,
  );
  await page.waitForFunction(() => document.querySelectorAll('.client-table tbody tr').length === 1);
  data = await collect(page);
  check(data.clientRows.length === 1, `[${engine} клиенты] строк в таблице: ${data.clientRows.length}`);
  check(
    data.clientRows[0]?.join('|') ===
      [
        'Иванов Иван Иванович',
        '+375 (29) 111-22-33',
        'client@example.com',
        RESPONSIBLE_NAME,
        '—',
      ].join('|'),
    `[${engine} клиенты] первая строка: ${data.clientRows[0]?.join(' | ')}`,
  );
  check(
    data.clientTableHeaders.join('|') ===
      ['Клиент', 'Телефон', 'E-mail', 'Ответственный', 'Комментарий'].join('|'),
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

  // --- Живая проверка дубля телефона (сообщение при вводе) ------------------
  posts.length = 0;
  await openModal();
  await page.fill('#create-client-first-name', 'Дубль');
  await page.fill('#create-client-phone', '+375291112233');
  await page.waitForSelector('#create-client-phone-error');
  const liveDuplicate = await page.evaluate(() => {
    const error = document.querySelector('#create-client-phone-error');
    const link = error?.querySelector('.client-field__link');
    return {
      text: error?.textContent?.trim() ?? null,
      invalid: document.querySelector('#create-client-phone')?.getAttribute('aria-invalid'),
      linkLabel: link?.textContent?.trim() ?? null,
    };
  });
  check(
    liveDuplicate.text === 'Клиент с таким номером уже создан: Иванов Иван Иванович',
    `[${engine} клиенты] живая подсказка о дубле: "${liveDuplicate.text}"`,
  );
  check(
    liveDuplicate.invalid === 'true' && liveDuplicate.linkLabel === 'Иванов Иван Иванович',
    `[${engine} клиенты] поле телефона не помечено ошибкой или нет ссылки на ФИО`,
  );
  check(posts.length === 0, `[${engine} клиенты] живая проверка отправила запрос на создание`);

  // Сообщение исчезает, когда номер меняют.
  await page.fill('#create-client-phone', '+375291112299');
  await page.waitForTimeout(800);
  check(
    (await page.locator('#create-client-phone-error').count()) === 0,
    `[${engine} клиенты] сообщение о дубле не исчезло после смены номера`,
  );
  await page.click('.client-form .client-button--secondary');
  await waitModalClosed();
  await page.waitForTimeout(200);
  check(posts.length === 0, `[${engine} клиенты] закрытие после живой проверки отправило запрос`);

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

  // --- Поиск по телефону ---------------------------------------------------
  await page.fill('.client-search', '+375 (29) 111-22-33');
  await page.waitForTimeout(700);
  data = await collect(page);
  check(
    data.clientRows.length === 1 && data.clientRows[0]?.[0] === 'Иванов Иван Иванович',
    `[${engine} клиенты] поиск по номеру в формате маски: строк ${data.clientRows.length}`,
  );

  await page.fill('.client-search', '1112233');
  await page.waitForTimeout(700);
  data = await collect(page);
  check(
    data.clientRows.length === 1,
    `[${engine} клиенты] поиск по части номера: строк ${data.clientRows.length}`,
  );

  await page.fill('.client-search', '8 029 1112233');
  await page.waitForTimeout(700);
  data = await collect(page);
  check(
    data.clientRows.length === 1,
    `[${engine} клиенты] поиск по номеру с началом «8 0»: строк ${data.clientRows.length}`,
  );

  await page.fill('.client-search', '4444444');
  await page.waitForTimeout(700);
  const phoneNotFound = (await page.locator('.client-table-state').textContent())?.trim();
  check(
    phoneNotFound === CLIENTS_NOT_FOUND_TEXT,
    `[${engine} клиенты] поиск по отсутствующему номеру: "${phoneNotFound}"`,
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

  // Крестик закрывает уведомление сразу.
  await page.click('.toast__close');
  await page.waitForTimeout(250);
  check(
    (await page.locator('.toast__message').count()) === 0,
    `[${engine} клиенты] крестик не закрыл уведомление`,
  );

  // --- Мягкое оформление таблицы и подсветка строки (светлая тема) --------
  data = await collect(page);
  checkTableStyles(data.clientTableStyles, 'light', engine);

  const rowHeightBefore = await page.evaluate(() => {
    const row = document.querySelector('.client-table tbody tr');
    return row ? Math.round(row.getBoundingClientRect().height) : 0;
  });
  await page.hover('.client-table tbody tr');
  // Ждём перехода подсветки (150 мс) перед измерением.
  await page.waitForTimeout(300);
  const hovered = await page.evaluate(() => {
    const row = document.querySelector('.client-table tbody tr');
    const cell = row?.querySelector('td');
    return {
      background: cell ? getComputedStyle(cell).backgroundColor : null,
      height: row ? Math.round(row.getBoundingClientRect().height) : 0,
      cursor: cell ? getComputedStyle(cell).cursor : null,
    };
  });
  check(
    sameColor(hovered.background, 'rgba(52, 89, 189, 0.055)'),
    `[${engine} клиенты] подсветка строки: ${hovered.background}`,
  );
  check(
    hovered.height === rowHeightBefore,
    `[${engine} клиенты] подсветка меняет высоту строки: ${rowHeightBefore} -> ${hovered.height}`,
  );
  check(
    hovered.cursor === 'pointer',
    `[${engine} клиенты] у строки нет курсора-указателя: ${hovered.cursor}`,
  );

  const hoverShotLight = `${OUT_DIR}/crm-clients-hover-light-1440x900.png`;
  await page.screenshot({ path: hoverShotLight });
  notes.push(`скриншот: ${hoverShotLight}`);
  await page.mouse.move(5, 5);

  const listShotLight = `${OUT_DIR}/crm-clients-list-light-1440x900.png`;
  await page.screenshot({ path: listShotLight });
  notes.push(`скриншот: ${listShotLight}`);

  // --- Тёмная тема: данные и оформление сохраняются -----------------------
  await page.click('[role="switch"]');
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );
  await page.waitForTimeout(250);
  data = await collect(page);
  check(data.theme === 'dark', `[${engine} клиенты] тема не переключилась: ${data.theme}`);
  check(
    data.clientRows.length === 2,
    `[${engine} клиенты] при смене темы потеряны строки: ${data.clientRows.length}`,
  );
  checkTableStyles(data.clientTableStyles, 'dark', engine);

  // --- Уведомление и подсветка строки в тёмной теме -----------------------
  await openModal();
  await page.fill('#create-client-first-name', 'Мария');
  await page.fill('#create-client-phone', '+375293334455');
  await submit();
  await waitModalClosed();
  await page.waitForSelector('.toast__message');
  await page.waitForTimeout(300);
  await page.waitForFunction(() => document.querySelectorAll('.client-table tbody tr').length === 3);
  data = await collect(page);
  checkToastStyles(data.toastStyles, 'dark', engine);

  const toastShotDark = `${OUT_DIR}/crm-clients-toast-dark-1440x900.png`;
  await page.screenshot({ path: toastShotDark });
  notes.push(`скриншот: ${toastShotDark}`);

  await page.click('.toast__close');
  await page.waitForTimeout(250);
  check(
    (await page.locator('.toast__message').count()) === 0,
    `[${engine} клиенты] крестик не закрыл уведомление в тёмной теме`,
  );

  await page.hover('.client-table tbody tr:nth-child(2)');
  await page.waitForTimeout(300);
  const hoveredDark = await page.evaluate(() => {
    const row = document.querySelectorAll('.client-table tbody tr')[1];
    const cell = row?.querySelector('td');
    return {
      background: cell ? getComputedStyle(cell).backgroundColor : null,
      height: row ? Math.round(row.getBoundingClientRect().height) : 0,
    };
  });
  check(
    sameColor(hoveredDark.background, 'rgba(105, 148, 231, 0.085)'),
    `[${engine} клиенты] подсветка строки в тёмной теме: ${hoveredDark.background}`,
  );
  check(
    hoveredDark.height === rowHeightBefore,
    `[${engine} клиенты] подсветка в тёмной теме меняет высоту: ${rowHeightBefore} -> ${hoveredDark.height}`,
  );

  const hoverShotDark = `${OUT_DIR}/crm-clients-hover-dark-1440x900.png`;
  await page.screenshot({ path: hoverShotDark });
  notes.push(`скриншот: ${hoverShotDark}`);
  await page.mouse.move(5, 5);

  const listShotDark = `${OUT_DIR}/crm-clients-list-dark-1440x900.png`;
  await page.screenshot({ path: listShotDark });
  notes.push(`скриншот: ${listShotDark}`);

  // --- Узкий экран: таблица прокручивается, уведомление с отступами 16 px ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const narrowTable = await page.evaluate(() => {
    const wrap = document.querySelector('.client-table-wrap');
    return {
      scrolls: wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  check(narrowTable.scrolls, `[${engine} клиенты] таблица не прокручивается на узком экране`);
  check(narrowTable.pageFits, `[${engine} клиенты] таблица расширяет страницу на узком экране`);

  await openModal();
  await page.fill('#create-client-first-name', 'Ольга');
  await page.fill('#create-client-phone', '+375294445566');
  await submit();
  await waitModalClosed();
  await page.waitForSelector('.toast__message');
  await page.waitForTimeout(300);
  const narrowToast = await page.evaluate(() => {
    const element = document.querySelector('.toast__message');
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      left: Math.round(rect.left),
      right: Math.round(window.innerWidth - rect.right),
    };
  });
  check(
    narrowToast.left === 16 && narrowToast.right === 16,
    `[${engine} клиенты] отступы уведомления на узком экране: ${narrowToast.left}/${narrowToast.right}`,
  );
  check(
    narrowToast.width <= 390 - 32,
    `[${engine} клиенты] ширина уведомления на узком экране: ${narrowToast.width}`,
  );
  const narrowToastShot = `${OUT_DIR}/crm-clients-toast-390x844.png`;
  await page.screenshot({ path: narrowToastShot });
  notes.push(`скриншот: ${narrowToastShot}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);

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

  check(clientCount === 4, `[${engine} клиенты] записей в таблице «Клиенты»: ${clientCount}`);
  check(requestCount === 4, `[${engine} клиенты] ключей идемпотентности: ${requestCount}`);
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
    storedRows.every((row) => /^\+375\d{9}$/.test(row.phone)),
    `[${engine} клиенты] телефон в базе не в формате +375XXXXXXXXX: ${storedRows
      .map((row) => row.phone)
      .join(', ')}`,
  );
  check(
    storedRows.some((row) => row.first_name === 'Пётр' && row.phone === '+375299998877'),
    `[${engine} клиенты] вторая запись не найдена в базе`,
  );
  check(
    storedRows.some((row) => row.first_name === 'Мария' && row.phone === '+375293334455'),
    `[${engine} клиенты] запись из тёмной темы не найдена в базе`,
  );
  check(
    !storedRows.some((row) => row.first_name === 'Сергей'),
    `[${engine} клиенты] неуспешная попытка создала запись`,
  );

  // --- Старые номера в другом формате показываются как есть ----------------
  const legacyDb = new DatabaseSync(DB_FILE);
  legacyDb
    .prepare(
      `INSERT INTO clients
         (id, last_name, first_name, middle_name, phone, email,
          responsible_user_id, created_at, updated_at)
       VALUES ('legacy-format-1', 'Старый', 'Номер', NULL, '=375441203343', NULL,
               'usr-minich-anton-andreevich', '2020-01-01T00:00:00.000Z',
               '2020-01-01T00:00:00.000Z')`,
    )
    .run();
  legacyDb.close();

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelectorAll('.client-table tbody tr').length === 5,
  );
  const legacyPhone = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.client-table tbody tr'));
    const row = rows.find((item) => item.children[0]?.textContent?.includes('Номер'));
    return row ? row.children[1]?.textContent?.trim() : null;
  });
  check(
    legacyPhone === '=375441203343',
    `[${engine} клиенты] старый формат телефона не показан как есть: ${legacyPhone}`,
  );

  // --- Карточка клиента: открытие, правка, конфликт (ТЗ на редактирование) ---
  const cardDialog = 'dialog.client-modal--edit';
  const cardTitle = async () =>
    (await page.locator('#edit-client-title').textContent())?.trim() ?? null;
  const waitCardOpen = async () => {
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.open === true,
      cardDialog,
    );
    // Фокус переводится отдельным таймером после открытия окна.
    await page.waitForTimeout(120);
  };
  const waitCardClosed = () => page.waitForSelector(cardDialog, { state: 'detached' });
  const submitCard = () => page.click(`${cardDialog} .client-form button[type="submit"]`);
  /** Уведомление предыдущего шага не должно мешать проверкам карточки. */
  const closeToastIfVisible = async () => {
    if ((await page.locator('.toast__close').count()) > 0) {
      await page.click('.toast__close');
      await page.waitForTimeout(200);
    }
  };
  const cardValue = (id) => page.inputValue(id);
  const cardError = async (id) => {
    const locator = page.locator(`#${id}`);
    return (await locator.count()) > 0 ? (await locator.first().textContent()).trim() : null;
  };
  const rowNames = () =>
    page.$$eval('.client-table tbody tr', (rows) =>
      rows.map((row) => (row.querySelector('.client-row-open')?.textContent ?? '').trim()),
    );
  const openCardByName = async (name) => {
    await page.click(`.client-row-open[aria-label="Открыть карточку клиента ${name}"]`);
    await waitCardOpen();
  };

  /** Чтение и правка базы из скрипта: имитируют второго пользователя. */
  const queryDb = (sql, ...params) => {
    const conn = new DatabaseSync(DB_FILE);
    const rows = conn.prepare(sql).all(...params);
    conn.close();
    return rows;
  };
  const clientIdByPhone = (phone) => queryDb('SELECT id FROM clients WHERE phone = ?', phone)[0]?.id;
  const clientRowById = (id) => queryDb('SELECT * FROM clients WHERE id = ?', id)[0] ?? null;
  const mutateClientRow = (id, fields) => {
    const conn = new DatabaseSync(DB_FILE);
    const names = Object.keys(fields);
    conn
      .prepare(`UPDATE clients SET ${names.map((name) => `${name} = ?`).join(', ')} WHERE id = ?`)
      .run(...names.map((name) => fields[name]), id);
    conn.close();
  };
  const deleteClientRow = (id) => {
    const conn = new DatabaseSync(DB_FILE);
    // Дочерние таблицы ссылаются на клиента внешним ключом.
    conn.prepare('DELETE FROM client_creation_requests WHERE client_id = ?').run(id);
    conn.prepare('DELETE FROM client_update_requests WHERE client_id = ?').run(id);
    conn.prepare('DELETE FROM clients WHERE id = ?').run(id);
    conn.close();
  };

  // Снимки карточки делаются в светлой теме, как и остальные снимки списка.
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'light') {
    await page.click('[role="switch"]');
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light',
    );
    await page.waitForTimeout(200);
  }

  // Уведомление от предыдущего шага сценария не должно мешать проверкам карточки.
  await closeToastIfVisible();

  patches.length = 0;
  confirmCount = 0;

  // Клик по ячейке «Телефон» открывает карточку: кликабельна вся строка.
  const ivanovName = 'Иванов Иван Иванович';
  const ivanovIndex = (await rowNames()).indexOf(ivanovName);
  await page.click(`.client-table tbody tr:nth-child(${ivanovIndex + 1}) td:nth-child(2)`);
  await waitCardOpen();
  check(
    (await cardTitle()) === 'Карточка клиента',
    `[${engine} карточка] заголовок окна: ${await cardTitle()}`,
  );
  check(
    (await page.evaluate(() => document.activeElement?.id)) === 'edit-client-first-name',
    `[${engine} карточка] фокус не переведён на поле «Имя»`,
  );
  check(
    (await cardValue('#edit-client-last-name')) === 'Иванов' &&
      (await cardValue('#edit-client-first-name')) === 'Иван' &&
      (await cardValue('#edit-client-middle-name')) === 'Иванович',
    `[${engine} карточка] ФИО не заполнено сохранёнными значениями`,
  );
  check(
    (await cardValue('#edit-client-phone')) === '+375 (29) 111-22-33',
    `[${engine} карточка] телефон не по маске: ${await cardValue('#edit-client-phone')}`,
  );
  check(
    (await cardValue('#edit-client-email')) === 'client@example.com',
    `[${engine} карточка] E-mail не заполнен: ${await cardValue('#edit-client-email')}`,
  );
  check(
    (await page.locator('#edit-client-responsible option:checked').textContent())?.trim() ===
      RESPONSIBLE_NAME,
    `[${engine} карточка] ответственный не выбран сохранённым значением`,
  );
  const cardFieldOrder = await page.evaluate(
    (selector) =>
      Array.from(
        document.querySelectorAll(`${selector} [role="tabpanel"]:not([hidden]) .client-field__input`),
      ).map((element) => element.id),
    cardDialog,
  );
  check(
    cardFieldOrder.join('|') ===
      [
        'edit-client-last-name',
        'edit-client-first-name',
        'edit-client-middle-name',
        'edit-client-phone',
        'edit-client-email',
        'edit-client-responsible',
        'edit-client-comment',
      ].join('|'),
    `[${engine} карточка] порядок полей: ${cardFieldOrder.join('|')}`,
  );

  const cardShotLight = `${OUT_DIR}/crm-clients-card-light-1440x900.png`;
  await page.screenshot({ path: cardShotLight });
  notes.push(`скриншот: ${cardShotLight}`);

  // Escape без правок закрывает окно без подтверждения и без запроса.
  await page.keyboard.press('Escape');
  await waitCardClosed();
  await page.waitForTimeout(250);
  check(confirmCount === 0, `[${engine} карточка] подтверждение при закрытии без правок`);
  check(patches.length === 0, `[${engine} карточка] закрытие отправило запрос обновления`);
  check(
    String(await page.evaluate(() => document.activeElement?.className)).includes('client-row-open'),
    `[${engine} карточка] фокус не вернулся на кнопку строки`,
  );

  // Строка открывается с клавиатуры по Enter.
  await page.locator(`.client-row-open[aria-label="Открыть карточку клиента ${ivanovName}"]`).focus();
  await page.keyboard.press('Enter');
  await waitCardOpen();
  await page.keyboard.press('Escape');
  await waitCardClosed();
  await page.waitForTimeout(150);

  // Сохранение без изменений закрывает окно без запроса и без уведомления.
  patches.length = 0;
  await openCardByName(ivanovName);
  await submitCard();
  await waitCardClosed();
  await page.waitForTimeout(300);
  check(patches.length === 0, `[${engine} карточка] сохранение без изменений отправило запрос`);
  check(
    (await page.locator('.toast__message').count()) === 0,
    `[${engine} карточка] сохранение без изменений показало уведомление`,
  );

  // Ошибки полей: запрос не отправляется, окно остаётся открытым.
  patches.length = 0;
  await openCardByName(ivanovName);
  await page.fill('#edit-client-first-name', '   ');
  await submitCard();
  await page.waitForTimeout(150);
  check(
    (await cardError('edit-client-firstName-error')) === 'Укажите имя',
    `[${engine} карточка] сообщение по имени: ${await cardError('edit-client-firstName-error')}`,
  );
  check(patches.length === 0, `[${engine} карточка] при ошибке имени отправлен запрос`);

  await page.fill('#edit-client-first-name', 'Иван');
  await page.fill('#edit-client-phone', '');
  await page.locator('#edit-client-phone').blur();
  await submitCard();
  await page.waitForTimeout(150);
  check(
    (await cardError('edit-client-phone-error')) === 'Укажите телефон',
    `[${engine} карточка] пустой телефон: ${await cardError('edit-client-phone-error')}`,
  );

  await page.fill('#edit-client-phone', '+3754475');
  await page.locator('#edit-client-phone').blur();
  await page.waitForTimeout(120);
  check(
    (await cardError('edit-client-phone-error')) ===
      'Введите номер полностью: +375 (XX) XXX-XX-XX',
    `[${engine} карточка] неполный телефон: ${await cardError('edit-client-phone-error')}`,
  );

  await page.fill('#edit-client-phone', '+375291112233');
  await page.fill('#edit-client-email', 'client@example');
  await submitCard();
  await page.waitForTimeout(150);
  check(
    (await cardError('edit-client-email-error')) === 'Укажите корректный E-mail',
    `[${engine} карточка] некорректный E-mail: ${await cardError('edit-client-email-error')}`,
  );
  check(patches.length === 0, `[${engine} карточка] при ошибке E-mail отправлен запрос`);

  // «Отмена» при несохранённых правках спрашивает подтверждение.
  const cancelConfirmBefore = confirmCount;
  await page.click(`${cardDialog} .client-button--secondary`);
  await waitCardClosed();
  await page.waitForTimeout(150);
  check(
    confirmCount === cancelConfirmBefore + 1,
    `[${engine} карточка] «Отмена» без подтверждения: ${confirmCount}`,
  );
  check(patches.length === 0, `[${engine} карточка] «Отмена» отправила запрос`);

  // Успешное сохранение: очистка необязательных полей становится NULL.
  const ivanovId = clientIdByPhone('+375291112233');
  const ivanovBefore = clientRowById(ivanovId);
  const idsBefore = queryDb('SELECT id FROM clients ORDER BY created_at DESC, id DESC').map(
    (row) => row.id,
  );
  patches.length = 0;
  await openCardByName(ivanovName);
  await page.fill('#edit-client-last-name', '');
  await page.fill('#edit-client-middle-name', '');
  await page.fill('#edit-client-email', '');
  await submitCard();
  await waitCardClosed();
  await page.waitForSelector('.toast__message');
  await page.waitForTimeout(300);
  check(patches.length === 1, `[${engine} карточка] запросов обновления: ${patches.length}`);
  check(Boolean(patches[0]), `[${engine} карточка] обновление без ключа идемпотентности`);
  check(
    (await page.locator('.toast__message .toast__text').textContent())?.trim() ===
      'Изменения сохранены',
    `[${engine} карточка] текст уведомления: ${(
      await page.locator('.toast__message .toast__text').textContent()
    )?.trim()}`,
  );

  const ivanovAfter = clientRowById(ivanovId);
  check(
    ivanovAfter?.last_name === null &&
      ivanovAfter?.middle_name === null &&
      ivanovAfter?.email === null,
    `[${engine} карточка] очищенные поля не стали NULL: ${JSON.stringify([
      ivanovAfter?.last_name,
      ivanovAfter?.middle_name,
      ivanovAfter?.email,
    ])}`,
  );
  check(
    ivanovAfter?.created_at === ivanovBefore?.created_at,
    `[${engine} карточка] created_at изменился: ${ivanovBefore?.created_at}`,
  );
  check(
    ivanovAfter?.updated_at !== ivanovBefore?.updated_at,
    `[${engine} карточка] updated_at не обновился: ${ivanovAfter?.updated_at}`,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('.client-table tbody tr').length === 5,
  );
  check(
    queryDb('SELECT id FROM clients ORDER BY created_at DESC, id DESC')
      .map((row) => row.id)
      .join('|') === idsBefore.join('|'),
    `[${engine} карточка] порядок записей изменился`,
  );
  // Конфликт одновременного редактирования (раздел 8 ТЗ).
  await closeToastIfVisible();
  const ivanovIdAfter = clientIdByPhone('+375291112233');
  await openCardByName('Иван');
  await page.fill('#edit-client-middle-name', 'Петрович');
  // Пока карточка открыта, запись меняет «другой пользователь».
  mutateClientRow(ivanovIdAfter, { first_name: 'Иной', updated_at: '2099-01-01T00:00:00.000Z' });
  patches.length = 0;
  expectingHttpError = true;
  await submitCard();
  await page.waitForSelector(`${cardDialog} .client-form__conflict`);
  const conflictText = (
    await page.locator(`${cardDialog} .client-form__conflict span`).textContent()
  )?.trim();
  check(
    conflictText === 'Карточка была изменена другим пользователем. Обновите данные.',
    `[${engine} карточка] сообщение о конфликте: ${conflictText}`,
  );
  check(
    (await page.locator(cardDialog).evaluate((element) => element.open)) === true,
    `[${engine} карточка] окно закрылось при конфликте`,
  );
  check(
    (await cardValue('#edit-client-middle-name')) === 'Петрович',
    `[${engine} карточка] введённые правки потеряны при конфликте`,
  );
  check(
    clientRowById(ivanovIdAfter)?.first_name === 'Иной',
    `[${engine} карточка] конфликт затёр чужие правки`,
  );

  // «Обновить» подгружает актуальные значения и снимает сообщение о конфликте.
  await page.click(`${cardDialog} .client-form__conflict .client-field__retry`);
  await page.waitForFunction(
    (selector) =>
      document.querySelector('#edit-client-first-name')?.value === 'Иной' &&
      document.querySelector(`${selector} .client-form__conflict`) === null,
    cardDialog,
  );
  check(
    (await cardValue('#edit-client-first-name')) === 'Иной',
    `[${engine} карточка] «Обновить» не подгрузило значения: ${await cardValue('#edit-client-first-name')}`,
  );
  check(
    (await page.locator('.toast__message').count()) === 0,
    `[${engine} карточка] конфликт показал уведомление об успехе`,
  );
  expectingHttpError = false;

  // После обновления сохранение проходит.
  await page.fill('#edit-client-first-name', 'Иван');
  patches.length = 0;
  await submitCard();
  await waitCardClosed();
  await page.waitForTimeout(200);
  check(
    patches.length === 1,
    `[${engine} карточка] сохранение после «Обновить»: запросов ${patches.length}`,
  );
  check(
    clientRowById(ivanovIdAfter)?.first_name === 'Иван',
    `[${engine} карточка] значение не сохранено после конфликта`,
  );

  // Запись со старым форматом телефона: в поле только префикс +375.
  await closeToastIfVisible();
  await openCardByName('Старый Номер');
  check(
    (await cardValue('#edit-client-phone')) === '+375',
    `[${engine} карточка] старый формат телефона: ${await cardValue('#edit-client-phone')}`,
  );
  patches.length = 0;
  await submitCard();
  await waitCardClosed();
  await page.waitForTimeout(200);
  check(
    patches.length === 0,
    `[${engine} карточка] закрытие карточки со старым номером отправило запрос`,
  );
  check(
    clientRowById(clientIdByPhone('=375441203343'))?.phone === '=375441203343',
    `[${engine} карточка] старое значение телефона изменилось без сохранения`,
  );

  // Клиент удалён: окно закрывается, список обновляется, показывается сообщение.
  await openCardByName('Мария');
  deleteClientRow(clientIdByPhone('+375293334455'));
  await page.fill('#edit-client-middle-name', 'Сергеевна');
  expectingHttpError = true;
  await submitCard();
  await waitCardClosed();
  await page.waitForFunction(
    () => document.querySelectorAll('.client-table tbody tr').length === 4,
  );
  expectingHttpError = false;
  check(
    (await page.locator('.toast__message .toast__text').textContent())?.trim() ===
      'Клиент не найден',
    `[${engine} карточка] сообщение при удалённом клиенте: ${(
      await page.locator('.toast__message .toast__text').textContent()
    )?.trim()}`,
  );
  check(
    (await page.locator('.toast__message--error').count()) === 1,
    `[${engine} карточка] сообщение об ошибке не отличается оформлением`,
  );
  check(
    !(await rowNames()).includes('Мария'),
    `[${engine} карточка] удалённый клиент остался в списке`,
  );

  // Карточка в тёмной теме.
  await closeToastIfVisible();
  await page.click('[role="switch"]');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
  await page.waitForTimeout(200);
  await openCardByName('Иван');
  const cardShotDark = `${OUT_DIR}/crm-clients-card-dark-1440x900.png`;
  await page.screenshot({ path: cardShotDark });
  notes.push(`скриншот: ${cardShotDark}`);
  await page.keyboard.press('Escape');
  await waitCardClosed();
  await page.click('[role="switch"]');
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-theme') === 'light',
  );
  await page.waitForTimeout(150);

  // --- Вкладки карточки: «Реквизиты» ---------------------------------------
  await closeToastIfVisible();
  await openCardByName('Иван');

  const tabState = () =>
    page.evaluate(
      (selector) =>
        Array.from(document.querySelectorAll(`${selector} [role="tab"]`)).map((tab) => ({
          selected: tab.getAttribute('aria-selected'),
          focused: document.activeElement === tab,
        })),
      cardDialog,
    );

  check(
    (await tabState()).map((tab) => tab.selected).join('|') === 'true|false',
    `[${engine} карточка] при открытии активна не первая вкладка: ${JSON.stringify(await tabState())}`,
  );
  check(
    await page.locator(`${cardDialog} #edit-client-panel-addresses`).isHidden(),
    `[${engine} карточка] панель реквизитов видна на первой вкладке`,
  );

  // Стрелка вправо переключает вкладку и переводит на неё фокус.
  await page.locator(`${cardDialog} #edit-client-tab-main`).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const afterArrow = await tabState();
  check(
    afterArrow.map((tab) => tab.selected).join('|') === 'false|true' && afterArrow[1]?.focused,
    `[${engine} карточка] стрелка не переключила вкладку: ${JSON.stringify(afterArrow)}`,
  );
  check(
    await page.locator(`${cardDialog} #edit-client-panel-addresses`).isVisible(),
    `[${engine} карточка] панель реквизитов скрыта на второй вкладке`,
  );

  // Значения не теряются при переключении вкладок.
  await page.fill('#edit-client-reg-city', 'Минск');
  await page.fill('#edit-client-reg-street', 'пр. Независимости');
  await page.click(`${cardDialog} #edit-client-tab-main`);
  await page.waitForTimeout(200);
  check(
    (await cardValue('#edit-client-first-name')) === 'Иван',
    `[${engine} карточка] значения первой вкладки потеряны`,
  );
  await page.click(`${cardDialog} #edit-client-tab-addresses`);
  await page.waitForTimeout(200);
  check(
    (await cardValue('#edit-client-reg-city')) === 'Минск' &&
      (await cardValue('#edit-client-reg-street')) === 'пр. Независимости',
    `[${engine} карточка] значения реквизитов потеряны при переключении вкладок`,
  );

  // Ошибка обязательного поля возвращает на первую вкладку и ставит фокус.
  await page.click(`${cardDialog} #edit-client-tab-main`);
  await page.waitForTimeout(200);
  await page.fill('#edit-client-first-name', '   ');
  await page.click(`${cardDialog} #edit-client-tab-addresses`);
  await page.waitForTimeout(200);
  patches.length = 0;
  await submitCard();
  await page.waitForTimeout(300);
  check(
    (await cardError('edit-client-firstName-error')) === 'Укажите имя',
    `[${engine} карточка] сообщение по имени: ${await cardError('edit-client-firstName-error')}`,
  );
  check(
    (await tabState()).map((tab) => tab.selected).join('|') === 'true|false',
    `[${engine} карточка] окно осталось на вкладке «Реквизиты»`,
  );
  check(
    (await page.evaluate(() => document.activeElement?.id)) === 'edit-client-first-name',
    `[${engine} карточка] фокус не переведён на поле с ошибкой`,
  );
  check(patches.length === 0, `[${engine} карточка] при ошибке отправлен запрос`);

  // Сохранение реквизитов: заполняем второй адрес, первый остаётся.
  await page.fill('#edit-client-first-name', 'Иван');
  await page.click(`${cardDialog} #edit-client-tab-addresses`);
  await page.waitForTimeout(200);
  await page.fill('#edit-client-res-city', 'Гомель');
  patches.length = 0;
  await submitCard();
  await waitCardClosed();
  await page.waitForSelector('.toast__message');
  await page.waitForTimeout(300);
  check(
    patches.length === 1,
    `[${engine} карточка] запросов сохранения реквизитов: ${patches.length}`,
  );
  const ivanovRow = clientRowById(clientIdByPhone('+375291112233'));
  check(
    ivanovRow?.reg_city === 'Минск' && ivanovRow?.res_city === 'Гомель',
    `[${engine} карточка] реквизиты не записаны в базу: ${ivanovRow?.reg_city} / ${ivanovRow?.res_city}`,
  );
  check(
    ivanovRow?.reg_postal_code === null,
    `[${engine} карточка] незаполненное поле реквизитов не NULL: ${ivanovRow?.reg_postal_code}`,
  );

  // Повторное открытие: реквизиты на месте, незаполненное поле пустое.
  await closeToastIfVisible();
  await openCardByName('Иван');
  await page.click(`${cardDialog} #edit-client-tab-addresses`);
  await page.waitForTimeout(200);
  check(
    (await cardValue('#edit-client-reg-city')) === 'Минск' &&
      (await cardValue('#edit-client-res-city')) === 'Гомель' &&
      (await cardValue('#edit-client-reg-postal-code')) === '',
    `[${engine} карточка] реквизиты не читаются из базы`,
  );

  // Чекбокс «Совпадает с адресом регистрации»: копирует адрес и блокирует поля.
  const sameBox = page.locator(`${cardDialog} #edit-client-res-same`);
  check(
    (await sameBox.count()) === 1 &&
      (await page.locator(`${cardDialog} .client-address__same`).first().textContent())?.trim() ===
        'Совпадает с адресом регистрации',
    `[${engine} карточка] чекбокс совпадения адресов не найден`,
  );
  check(
    !(await sameBox.isChecked()),
    `[${engine} карточка] чекбокс совпадения включён при разных адресах`,
  );

  await sameBox.check();
  await page.waitForTimeout(250);
  check(
    (await cardValue('#edit-client-res-city')) === 'Минск' &&
      (await cardValue('#edit-client-res-street')) === 'пр. Независимости',
    `[${engine} карточка] адрес проживания не скопирован: ${await cardValue('#edit-client-res-city')}`,
  );
  check(
    await page.locator('#edit-client-res-city').isDisabled(),
    `[${engine} карточка] поля адреса проживания остались доступны для правки`,
  );

  // Правка адреса регистрации переносится в адрес проживания.
  await page.fill('#edit-client-reg-city', 'Витебск');
  await page.waitForTimeout(250);
  check(
    (await cardValue('#edit-client-res-city')) === 'Витебск',
    `[${engine} карточка] адрес проживания не обновился за адресом регистрации`,
  );

  // Снятие чекбокса очищает адрес проживания и разблокирует поля.
  await sameBox.uncheck();
  await page.waitForTimeout(250);
  check(
    (await cardValue('#edit-client-res-city')) === '' &&
      (await cardValue('#edit-client-res-street')) === '',
    `[${engine} карточка] адрес проживания не очищен после снятия чекбокса`,
  );
  check(
    await page.locator('#edit-client-res-city').isEnabled(),
    `[${engine} карточка] поля адреса проживания остались заблокированы`,
  );

  // Линия — отдельный элемент над заголовком блока «Адрес проживания»,
  // чекбокс — отдельной строкой под заголовком.
  const addressLayout = await page.evaluate((selector) => {
    const panel = document.querySelector(`${selector} #edit-client-panel-addresses`);
    const blocks = panel ? Array.from(panel.querySelectorAll('.client-address')) : [];
    const divider = panel?.querySelector('.client-address__divider') ?? null;
    if (!panel || blocks.length < 2 || !divider) return null;

    const registrationFields = blocks[0].querySelectorAll('.client-field__input');
    const lastRegistrationField = registrationFields[registrationFields.length - 1];
    const grid = blocks[1].querySelector('.client-address__grid');
    const title = blocks[1].querySelector('.client-address__title');
    const checkbox = blocks[1].querySelector('.client-address__same');
    const firstField = blocks[1].querySelector('.client-field__input');
    const rect = (element) => element.getBoundingClientRect();

    return {
      dividerWidth: Math.round(rect(divider).width),
      panelWidth: Math.round(rect(panel).width),
      dividerIsSeparate: divider.parentElement === panel,
      titleBorderTop: getComputedStyle(title).borderTopWidth,
      aboveGap: Math.round(rect(divider).top - rect(lastRegistrationField).bottom),
      belowGap: Math.round(rect(title).top - rect(divider).bottom),
      titleToCheckbox: Math.round(rect(checkbox).top - rect(title).bottom),
      checkboxToField: Math.round(rect(grid).top - rect(checkbox).bottom),
      leftAligned:
        Math.abs(rect(checkbox).left - rect(title).left) <= 1 &&
        Math.abs(rect(checkbox).left - rect(firstField).left) <= 1,
    };
  }, cardDialog);

  check(addressLayout !== null, `[${engine} карточка] разделитель адресов не найден`);
  check(
    addressLayout?.dividerIsSeparate === true && addressLayout?.titleBorderTop === '0px',
    `[${engine} карточка] линия не отдельным элементом над заголовком: ${JSON.stringify(addressLayout)}`,
  );
  check(
    Boolean(addressLayout) &&
      Math.abs(addressLayout.dividerWidth - addressLayout.panelWidth) <= 2,
    `[${engine} карточка] линия не на всю ширину блока: ${JSON.stringify(addressLayout)}`,
  );
  check(
    Boolean(addressLayout) &&
      addressLayout.aboveGap >= 16 &&
      addressLayout.aboveGap <= 20 &&
      addressLayout.belowGap >= 16 &&
      addressLayout.belowGap <= 20,
    `[${engine} карточка] отступы линии: сверху ${addressLayout?.aboveGap}, снизу ${addressLayout?.belowGap}`,
  );
  check(
    Boolean(addressLayout) &&
      addressLayout.titleToCheckbox >= 8 &&
      addressLayout.titleToCheckbox <= 12 &&
      addressLayout.checkboxToField >= 8 &&
      addressLayout.checkboxToField <= 12,
    `[${engine} карточка] отступы чекбокса: от заголовка ${addressLayout?.titleToCheckbox}, до поля ${addressLayout?.checkboxToField}`,
  );
  check(
    addressLayout?.leftAligned === true,
    `[${engine} карточка] чекбокс не выровнен по левому краю: ${JSON.stringify(addressLayout)}`,
  );

  const addressesShot = `${OUT_DIR}/crm-clients-addresses-light-1440x900.png`;
  await page.screenshot({ path: addressesShot });
  notes.push(`скриншот: ${addressesShot}`);

  // Правка только реквизитов: закрытие запрашивает подтверждение.
  await page.fill('#edit-client-reg-city', 'Брест');
  const confirmBeforeAddress = confirmCount;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(
    confirmCount === confirmBeforeAddress + 1,
    `[${engine} карточка] правка реквизитов не запросила подтверждение`,
  );
  await waitCardClosed();
  await page.waitForTimeout(150);
  check(
    clientRowById(clientIdByPhone('+375291112233'))?.reg_city === 'Минск',
    `[${engine} карточка] отказ от сохранения изменил реквизиты`,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
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
