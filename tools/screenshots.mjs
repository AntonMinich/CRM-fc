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
const VIEWPORTS = [
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
  check(data.workspaceText === '', `${label} рабочая область не пуста: "${data.workspaceText}"`);
  check(data.workspaceNodes === 1, `${label} узлов в main: ${data.workspaceNodes}`);
  check(
    data.scrollWidth <= data.clientWidth,
    `${label} горизонтальная прокрутка: ${data.scrollWidth} > ${data.clientWidth}`,
  );
  check(data.decorCount === 1, `${label} элементов декора: ${data.decorCount}`);
  check(
    data.decorPointerEvents === 'none',
    `${label} pointer-events декора: ${data.decorPointerEvents}`,
  );
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
  }

  if (viewport.name === '390x844') {
    check(data.sidebarWidth === 185, `${label} ширина панели: ${data.sidebarWidth}`);
    check(
      data.subtitleDisplay === 'none',
      `${label} подпись «Рабочее пространство» видна: ${data.subtitleDisplay}`,
    );
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
      Array.from(document.querySelectorAll('a.nav-item, [role="switch"]')).map((element) => {
        element.focus();
        return document.activeElement === element;
      }),
    );
    check(
      focusable.length === 3 && focusable.every(Boolean),
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
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const element = document.activeElement;
          if (!element) return 'нет';
          if (element.matches('[role="switch"]')) return 'переключатель';
          return element.textContent?.trim() || element.tagName;
        }),
      );
    }
    check(
      order[0] === 'CRM' && order[1] === 'Service Desk' && order[2] === 'переключатель',
      `[${engine}] порядок Tab: ${order.join(' → ')}`,
    );
  }

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
