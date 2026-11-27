/**
 * Проверка серверной части общей вкладки CRM «Взаимодействия».
 * Запуск: npm run check:interactions-board
 *
 * Сервер поднимается на временной базе, взаимодействия создаются реальными
 * HTTP-запросами. Проверяются фильтры, поиск, пагинация, счётчик просроченных
 * текущего пользователя и отказы при создании из общего раздела.
 */

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(PROJECT_ROOT, 'data', `_check-board-${process.pid}.db`);
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

const app = await startAppServer({ port: 0, staticDir: null });
const base = app.url;

async function api(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

/** Правки напрямую в базе: просроченное время и второй ответственный. */
function withDb(run) {
  const db = new DatabaseSync(DB_FILE);
  try {
    return run(db);
  } finally {
    db.close();
  }
}

/** Список общего раздела: строка фильтров передаётся как есть. */
async function board(query) {
  const response = await api('GET', `/api/interactions?${query}`);
  return { status: response.status, ...(response.payload ?? {}) };
}

const hours = (count) => count * 60 * 60 * 1000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const OTHER_USER_ID = 'usr-check-board-other';

try {
  // --- Данные для проверки ------------------------------------------------
  const users = await api('GET', '/api/users?selectableAsResponsible=true');
  const responsibleId = users.payload?.items?.[0]?.id ?? '';
  check(responsibleId !== '', 'Справочник ответственных доступен', responsibleId);

  const clientA = await api('POST', '/api/clients', {
    last_name: 'Иванов',
    first_name: 'Пётр',
    phone: '+375291112233',
    responsible_user_id: responsibleId,
  });
  const clientB = await api('POST', '/api/clients', {
    last_name: 'Сидорова',
    first_name: 'Анна',
    phone: '+375291112244',
    responsible_user_id: responsibleId,
  });
  const supplier = await api('POST', '/api/suppliers', {
    name: 'ООО Ромашка',
    unp: '100000001',
    phone: '+375291112255',
  });
  check(
    clientA.status === 201 && clientB.status === 201 && supplier.status === 201,
    'Клиенты и поставщик созданы для проверки',
    `${clientA.status}/${clientB.status}/${supplier.status}`,
  );

  // Второй ответственный: его просроченные не должны попадать в счётчик.
  withDb((db) => {
    const columns = db.prepare("PRAGMA table_info('users')").all().map((column) => column.name);
    const source = db.prepare('SELECT * FROM users LIMIT 1').get();
    const row = {
      ...source,
      id: OTHER_USER_ID,
      last_name: 'Яковлев',
      first_name: 'Игорь',
      middle_name: null,
    };
    db.prepare(
      `INSERT INTO users (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ).run(...columns.map((name) => row[name] ?? null));
  });

  const plus72 = new Date(Date.now() + hours(72));
  const plus72Date = plus72.toISOString().slice(0, 10);

  const plannedClient = await api('POST', '/api/interactions', {
    client_id: clientA.payload.id,
    type: 'call',
    title: 'Звонок по договору',
    planned_at: plus72.toISOString(),
    responsible_user_id: responsibleId,
  });
  const overdueClient = await api('POST', '/api/interactions', {
    client_id: clientB.payload.id,
    type: 'letter',
    title: 'Письмо о задолженности',
    planned_at: iso(hours(96)),
    responsible_user_id: responsibleId,
  });
  const doneClient = await api('POST', '/api/interactions', {
    client_id: clientA.payload.id,
    type: 'meeting',
    title: 'Встреча в офисе',
    occurred_at: iso(-hours(2)),
    result_text: 'Обсудили условия поставки',
    responsible_user_id: responsibleId,
  });
  const plannedSupplier = await api('POST', '/api/interactions', {
    supplier_id: supplier.payload.id,
    type: 'call',
    title: 'Звонок поставщику',
    planned_at: iso(hours(48)),
    responsible_user_id: responsibleId,
  });
  const foreignOverdue = await api('POST', '/api/interactions', {
    supplier_id: supplier.payload.id,
    type: 'other',
    title: 'Просроченное другого сотрудника',
    planned_at: iso(hours(120)),
    responsible_user_id: OTHER_USER_ID,
  });
  const created = [plannedClient, overdueClient, doneClient, plannedSupplier, foreignOverdue];
  check(
    created.every((item) => item.status === 201),
    'Взаимодействия созданы через общий раздел',
    created.map((item) => item.status).join('/'),
  );

  // Просроченные: плановое время переносится в прошлое напрямую в базе.
  withDb((db) => {
    const update = db.prepare('UPDATE interactions SET planned_at = ? WHERE id = ?');
    update.run(iso(-hours(26)), overdueClient.payload.id);
    update.run(iso(-hours(50)), foreignOverdue.payload.id);
  });

  // --- Список, фильтры, поиск и пагинация ---------------------------------
  const all = await board('status=all&responsible=all&mine=false&ownerType=all&page=1&pageSize=50');
  check(
    all.status === 200 && all.total === 5,
    'Список объединяет взаимодействия клиентов и поставщиков',
    `всего ${all.total}`,
  );
  check(
    (all.items ?? []).some((item) => item.client_id) &&
      (all.items ?? []).some((item) => item.supplier_id),
    'В выдаче есть записи и клиентов, и поставщиков',
  );

  const planned = await board('status=planned&responsible=all&mine=false&ownerType=all');
  check(
    planned.total === 4 && planned.items.every((item) => item.status === 'planned'),
    'Фильтр «Запланировано»',
    `всего ${planned.total}`,
  );

  const overdue = await board('status=overdue&responsible=all&mine=false&ownerType=all');
  check(
    overdue.total === 2 && overdue.items.every((item) => item.is_overdue),
    'Фильтр «Просрочено»',
    `всего ${overdue.total}`,
  );

  const done = await board('status=done&responsible=all&mine=false&ownerType=all');
  check(
    done.total === 1 && done.items[0]?.status === 'done',
    'Фильтр «Выполнено»',
    `всего ${done.total}`,
  );

  const clientsOnly = await board('status=all&responsible=all&mine=false&ownerType=client');
  check(
    clientsOnly.total === 3 && clientsOnly.items.every((item) => item.client_id),
    'Фильтр «Контрагент: клиенты»',
    `всего ${clientsOnly.total}`,
  );

  const suppliersOnly = await board('status=all&responsible=all&mine=false&ownerType=supplier');
  check(
    suppliersOnly.total === 2 && suppliersOnly.items.every((item) => item.supplier_id),
    'Фильтр «Контрагент: поставщики»',
    `всего ${suppliersOnly.total}`,
  );

  const byResponsible = await board(
    `status=all&responsible=${responsibleId}&mine=false&ownerType=all`,
  );
  check(byResponsible.total === 4, 'Фильтр по ответственному', `всего ${byResponsible.total}`);

  const otherResponsible = await board(
    `status=all&responsible=${OTHER_USER_ID}&mine=false&ownerType=all`,
  );
  check(
    otherResponsible.total === 1,
    'Фильтр по второму ответственному',
    `всего ${otherResponsible.total}`,
  );

  const mine = await board('status=all&responsible=all&mine=true&ownerType=all');
  check(
    mine.total === 4 && mine.items.every((item) => item.responsible_user_id === responsibleId),
    '«Только мои» оставляет записи текущего пользователя',
    `всего ${mine.total}`,
  );
  check(
    mine.overdue === 1,
    'Счётчик просроченных — только текущего пользователя',
    `просрочено ${mine.overdue}`,
  );

  const byPeriod = await board(
    `status=all&responsible=all&mine=false&ownerType=all&dateFrom=${plus72Date}&dateTo=${plus72Date}`,
  );
  check(
    byPeriod.total === 1 && byPeriod.items[0]?.title === 'Звонок по договору',
    'Фильтр по периоду',
    `всего ${byPeriod.total}`,
  );

  const farDate = new Date(Date.now() + hours(24 * 100)).toISOString().slice(0, 10);
  const emptyPeriod = await board(
    `status=all&responsible=all&mine=false&ownerType=all&dateFrom=${farDate}`,
  );
  check(
    emptyPeriod.total === 0,
    'Период вне данных ничего не находит',
    `всего ${emptyPeriod.total}`,
  );

  const searchTitle = await board(
    'status=all&responsible=all&mine=false&ownerType=all&search=договору',
  );
  check(
    searchTitle.total === 1 && searchTitle.items[0]?.title === 'Звонок по договору',
    'Поиск по теме',
    `всего ${searchTitle.total}`,
  );

  const searchSupplier = await board(
    'status=all&responsible=all&mine=false&ownerType=all&search=Ромашка',
  );
  check(
    searchSupplier.total === 2,
    'Поиск по наименованию контрагента',
    `всего ${searchSupplier.total}`,
  );

  const searchClient = await board(
    'status=all&responsible=all&mine=false&ownerType=all&search=Иванов',
  );
  check(searchClient.total === 2, 'Поиск по ФИО клиента', `всего ${searchClient.total}`);

  const firstPage = await board(
    'status=all&responsible=all&mine=false&ownerType=all&page=1&pageSize=2',
  );
  check(
    firstPage.items.length === 2 && firstPage.total === 5 && firstPage.hasMore === true,
    'Первая страница по два элемента',
    `элементов ${firstPage.items.length}, есть ещё ${firstPage.hasMore}`,
  );

  const lastPage = await board(
    'status=all&responsible=all&mine=false&ownerType=all&page=3&pageSize=2',
  );
  check(
    lastPage.items.length === 1 && lastPage.hasMore === false,
    'Последняя страница закрывает выдачу',
    `элементов ${lastPage.items.length}, есть ещё ${lastPage.hasMore}`,
  );

  // --- Отказы при создании из общего раздела ------------------------------
  const withoutOwner = await api('POST', '/api/interactions', {
    type: 'call',
    title: 'Без контрагента',
    planned_at: iso(hours(10)),
    responsible_user_id: responsibleId,
  });
  check(
    withoutOwner.status === 422 &&
      withoutOwner.payload?.error?.message === 'Укажите клиента или поставщика',
    'Создание без контрагента отклоняется',
    `${withoutOwner.status} ${withoutOwner.payload?.error?.message ?? ''}`,
  );

  const contactForClient = await api('POST', '/api/interactions', {
    client_id: clientA.payload.id,
    type: 'call',
    title: 'Контакт у клиента',
    occurred_at: iso(-hours(1)),
    result_text: 'Проверка контактного лица',
    supplier_contact_id: 'contact-not-allowed',
    responsible_user_id: responsibleId,
  });
  check(
    contactForClient.status === 422 &&
      Boolean(contactForClient.payload?.error?.fieldErrors?.supplier_contact_id),
    'Контактное лицо принимается только для поставщика',
    `${contactForClient.status} ${JSON.stringify(
      contactForClient.payload?.error?.fieldErrors ?? {},
    )}`,
  );
} finally {
  await app.close().catch(() => {});
}

for (const { ok, title, detail } of results) {
  console.log(`${ok ? 'ок  ' : 'ОШИБКА'} ${title}${detail ? ` — ${detail}` : ''}`);
}

console.log(
  failed === 0
    ? `\nВсе проверки общей вкладки «Взаимодействия» пройдены (${results.length}).`
    : `\nОшибок: ${failed} из ${results.length}`,
);

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

process.exitCode = failed === 0 ? 0 : 1;
