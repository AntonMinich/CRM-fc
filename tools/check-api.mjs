/**
 * Проверка серверной части: сценарии из раздела 15 ТЗ на клиентов.
 * Запуск: npm run check:api
 *
 * Скрипт поднимает сервер приложения на временной базе, прогоняет сценарии
 * через реальные HTTP-запросы и проверяет содержимое таблицы «Клиенты»
 * напрямую в файле базы. Отчёт печатается в консоль.
 */

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(PROJECT_ROOT, 'data', `_check-api-${process.pid}.db`);
process.env.FINCODE_DB = DB_FILE;

const { startAppServer } = await import('../server/index.mjs');

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

const results = [];
let failed = 0;

function check(condition, title, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failed += 1;
  results.push({ ok, title, detail });
}

function readClients() {
  const db = new DatabaseSync(DB_FILE);
  const rows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC, id DESC').all();
  db.close();
  return rows;
}

function describeClient(client) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(' ');
}

const app = await startAppServer({ port: 0, staticDir: null });
const base = app.url;

async function api(method, path, { body, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, headers: response.headers, payload };
}

try {
  // --- Справочник пользователей -------------------------------------------
  const users = await api('GET', '/api/users?selectableAsResponsible=true');
  const responsible = users.payload?.items?.[0];
  check(users.status === 200, 'GET /api/users отвечает 200', `статус ${users.status}`);
  check(
    users.payload?.items?.length === 1,
    'В справочнике один доступный ответственный',
    `получено ${users.payload?.items?.length}`,
  );
  check(
    responsible?.full_name === 'Минич Антон Андреевич',
    'Ответственный по умолчанию — Минич Антон Андреевич',
    String(responsible?.full_name),
  );
  check(
    responsible?.id === 'usr-minich-anton-andreevich',
    'Идентификатор ответственного устойчив',
    String(responsible?.id),
  );

  // --- Пустой список -------------------------------------------------------
  const emptyList = await api('GET', '/api/clients');
  check(emptyList.status === 200, 'GET /api/clients отвечает 200', `статус ${emptyList.status}`);
  check(
    emptyList.payload?.total === 0,
    'До создания список пуст',
    `total ${emptyList.payload?.total}`,
  );
  check(
    readClients().length === 0,
    'Таблица «Клиенты» пуста до создания',
    `строк ${readClients().length}`,
  );

  // --- Сценарий 1: только обязательные поля -------------------------------
  const minimalBody = {
    first_name: '  Пётр  ',
    phone: '  +375291112233  ',
    responsible_user_id: responsible.id,
  };
  const minimal = await api('POST', '/api/clients', {
    body: minimalBody,
    headers: { 'Idempotency-Key': 'check-minimal' },
  });
  check(minimal.status === 201, 'Создание с обязательными полями: 201', `статус ${minimal.status}`);
  check(
    typeof minimal.payload?.id === 'string' && minimal.payload.id.length > 0,
    'Сервер вернул идентификатор клиента',
    String(minimal.payload?.id),
  );
  check(
    minimal.payload?.first_name === 'Пётр' && minimal.payload?.phone === '+375291112233',
    'Значения сохранены после trim',
    `${minimal.payload?.first_name} / ${minimal.payload?.phone}`,
  );
  check(
    minimal.payload?.last_name === null &&
      minimal.payload?.middle_name === null &&
      minimal.payload?.email === null,
    'Пустые необязательные поля — NULL',
    JSON.stringify([
      minimal.payload?.last_name,
      minimal.payload?.middle_name,
      minimal.payload?.email,
    ]),
  );
  check(
    minimal.payload?.responsible_user_id === responsible.id,
    'Ответственный сохранён идентификатором',
    String(minimal.payload?.responsible_user_id),
  );
  check(
    typeof minimal.payload?.created_at === 'string' &&
      typeof minimal.payload?.updated_at === 'string',
    'Сервер задал системные даты',
    String(minimal.payload?.created_at),
  );

  const afterMinimal = readClients();
  check(afterMinimal.length === 1, 'В таблице ровно одна запись', `строк ${afterMinimal.length}`);
  check(
    afterMinimal[0]?.first_name === 'Пётр' &&
      afterMinimal[0]?.responsible_user_id === responsible.id,
    'Строка в базе соответствует запросу',
    `first_name=${afterMinimal[0]?.first_name}, resp=${afterMinimal[0]?.responsible_user_id}`,
  );

  // --- Идемпотентность: повтор того же запроса ----------------------------
  const replay = await api('POST', '/api/clients', {
    body: minimalBody,
    headers: { 'Idempotency-Key': 'check-minimal' },
  });
  check(replay.status === 201, 'Повтор запроса с тем же ключом: 201', `статус ${replay.status}`);
  check(
    replay.payload?.id === minimal.payload?.id,
    'Повтор вернул ту же запись',
    String(replay.payload?.id),
  );
  check(
    replay.headers.get('idempotent-replay') === 'true',
    'Ответ помечен как повторный',
    String(replay.headers.get('idempotent-replay')),
  );
  check(
    readClients().length === 1,
    'Повторный запрос не создал дубликат',
    `строк ${readClients().length}`,
  );

  // --- Сценарий 2: все поля ------------------------------------------------
  const full = await api('POST', '/api/clients', {
    body: {
      last_name: 'Иванов',
      first_name: 'Иван',
      middle_name: 'Иванович',
      phone: '+375291234567',
      email: 'client@example.com',
      responsible_user_id: responsible.id,
    },
    headers: { 'Idempotency-Key': 'check-full' },
  });
  check(full.status === 201, 'Создание со всеми полями: 201', `статус ${full.status}`);
  const fullRow = readClients().find((row) => row.id === full.payload?.id);
  check(
    fullRow?.last_name === 'Иванов' &&
      fullRow?.first_name === 'Иван' &&
      fullRow?.middle_name === 'Иванович' &&
      fullRow?.email === 'client@example.com',
    'Все значения сохранены в таблицу «Клиенты»',
    JSON.stringify(fullRow ?? {}),
  );

  // --- Валидация -----------------------------------------------------------
  const emptyName = await api('POST', '/api/clients', {
    body: { first_name: '   ', phone: '+375291112233', responsible_user_id: responsible.id },
  });
  check(
    emptyName.status === 422 && emptyName.payload?.error?.fieldErrors?.first_name === 'Укажите имя',
    'Имя из пробелов отклонено: «Укажите имя»',
    `${emptyName.status} ${JSON.stringify(emptyName.payload?.error?.fieldErrors)}`,
  );

  const noPhone = await api('POST', '/api/clients', {
    body: { first_name: 'Иван', responsible_user_id: responsible.id },
  });
  check(
    noPhone.status === 422 && noPhone.payload?.error?.fieldErrors?.phone === 'Укажите телефон',
    'Пустой телефон отклонён: «Укажите телефон»',
    `${noPhone.status} ${JSON.stringify(noPhone.payload?.error?.fieldErrors)}`,
  );

  const badEmail = await api('POST', '/api/clients', {
    body: {
      first_name: 'Иван',
      phone: '+375291112233',
      email: 'client@example',
      responsible_user_id: responsible.id,
    },
  });
  check(
    badEmail.status === 422 &&
      badEmail.payload?.error?.fieldErrors?.email === 'Укажите корректный E-mail',
    'Некорректный E-mail отклонён',
    `${badEmail.status} ${JSON.stringify(badEmail.payload?.error?.fieldErrors)}`,
  );

  const badResponsible = await api('POST', '/api/clients', {
    body: { first_name: 'Иван', phone: '+375291112233', responsible_user_id: 'usr-unknown' },
  });
  check(
    badResponsible.status === 422 &&
      badResponsible.payload?.error?.fieldErrors?.responsible_user_id ===
        'Выберите ответственного',
    'Несуществующий ответственный отклонён',
    `${badResponsible.status} ${JSON.stringify(badResponsible.payload?.error?.fieldErrors)}`,
  );

  const noResponsible = await api('POST', '/api/clients', {
    body: { first_name: 'Иван', phone: '+375291112233' },
  });
  check(
    noResponsible.status === 422,
    'Клиент без ответственного не сохраняется',
    `статус ${noResponsible.status}`,
  );

  const malformed = await api('POST', '/api/clients', {
    body: undefined,
    headers: { 'Content-Type': 'application/json' },
  });
  check(malformed.status === 422, 'Пустое тело запроса отклонено', `статус ${malformed.status}`);

  check(
    readClients().length === 2,
    'Неуспешные попытки не создали записей',
    `строк ${readClients().length}`,
  );

  // --- Список и поиск ------------------------------------------------------
  const list = await api('GET', '/api/clients');
  check(
    list.payload?.items?.[0]?.id === full.payload?.id,
    'Новые клиенты показываются сверху',
    `первый: ${describeClient(list.payload?.items?.[0] ?? {})}`,
  );

  const ru = await api('GET', `/api/clients?search=${encodeURIComponent('  ива  ')}`);
  check(
    ru.payload?.total === 1 && ru.payload?.items?.[0]?.last_name === 'Иванов',
    'Поиск «ива» находит «Иванов» без учёта регистра',
    `total ${ru.payload?.total}`,
  );

  const multiWord = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('иван   иванович')}`,
  );
  check(
    multiWord.payload?.total === 1,
    'Многословный запрос ищет по всем словам ФИО',
    `total ${multiWord.payload?.total}`,
  );

  const wrongOrder = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('иванович иван')}`,
  );
  check(
    wrongOrder.payload?.total === 1,
    'Порядок слов в запросе не важен',
    `total ${wrongOrder.payload?.total}`,
  );

  const nothing = await api('GET', `/api/clients?search=${encodeURIComponent('Сидоров')}`);
  check(
    nothing.payload?.total === 0,
    'Поиск без совпадений даёт пустой результат',
    `total ${nothing.payload?.total}`,
  );

  const paged = await api('GET', '/api/clients?page=1&pageSize=1');
  check(
    paged.payload?.items?.length === 1 &&
      paged.payload?.total === 2 &&
      paged.payload?.hasMore === true,
    'Пагинация сообщает общее число записей',
    `items ${paged.payload?.items?.length}, total ${paged.payload?.total}, hasMore ${paged.payload?.hasMore}`,
  );

  const searchOnFirstPage = await api(
    'GET',
    `/api/clients?page=1&pageSize=1&search=${encodeURIComponent('пётр')}`,
  );
  check(
    searchOnFirstPage.payload?.total === 1 &&
      searchOnFirstPage.payload?.items?.[0]?.first_name === 'Пётр',
    'Поиск находит клиента вне первой страницы полного списка',
    `total ${searchOnFirstPage.payload?.total}, первый ${describeClient(searchOnFirstPage.payload?.items?.[0] ?? {})}`,
  );

  // --- Постоянное хранение -------------------------------------------------
  await app.close();

  const restarted = await startAppServer({ port: 0, staticDir: null });
  const afterRestart = await fetch(`${restarted.url}/api/clients`).then((response) =>
    response.json(),
  );
  check(
    afterRestart.total === 2,
    'После перезапуска сервера клиенты остаются в списке',
    `total ${afterRestart.total}`,
  );
  check(
    afterRestart.items.some((item) => item.id === minimal.payload?.id),
    'Созданный клиент сохранился в базе после перезапуска',
    `id ${minimal.payload?.id}`,
  );
  await restarted.close();

  const dbCheck = new DatabaseSync(DB_FILE);
  const table = dbCheck
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clients'")
    .get();
  const rowCount = dbCheck.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
  const fkList = dbCheck.prepare('PRAGMA foreign_key_list(clients)').all();
  dbCheck.close();
  check(table?.name === 'clients', 'В базе есть таблица «Клиенты» (clients)', String(table?.name));
  check(rowCount === 2, 'В таблице «Клиенты» две подтверждённые записи', `строк ${rowCount}`);
  check(
    fkList.some((fk) => fk.table === 'users' && fk.from === 'responsible_user_id'),
    'responsible_user_id — внешний ключ на справочник пользователей',
    JSON.stringify(fkList),
  );
} finally {
  await app.close().catch(() => {});
}

for (const { ok, title, detail } of results) {
  console.log(`${ok ? 'ок  ' : 'ОШИБКА'} ${title}${detail ? ` — ${detail}` : ''}`);
}

console.log(
  failed === 0
    ? `\nВсе сценарии пройдены (${results.length}).`
    : `\nОшибок: ${failed} из ${results.length}`,
);

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

process.exitCode = failed === 0 ? 0 : 1;
