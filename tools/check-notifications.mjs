/**
 * Проверка серверной части уведомлений колокольчика.
 * Запуск: npm run check:notifications
 *
 * Сервер поднимается на временной базе, уведомления создаются существующими
 * действиями (создание и сохранение клиента и поставщика, план с напоминанием).
 * Проверяются фильтры, порции, счётчик, отметки прочтения и недоступность
 * чужих уведомлений. Плюс проверка подписи бейджа.
 */

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { formatUnreadBadge } from '../src/components/Header/notificationsApi.ts';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(PROJECT_ROOT, 'data', `_check-notifications-${process.pid}.db`);
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

function withDb(run) {
  const db = new DatabaseSync(DB_FILE);
  try {
    return run(db);
  } finally {
    db.close();
  }
}

const hours = (count) => count * 60 * 60 * 1000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const OTHER_USER_ID = 'usr-check-notifications-other';

try {
  // --- Уведомления появляются из существующих действий ---------------------
  const users = await api('GET', '/api/users?selectableAsResponsible=true');
  const responsibleId = users.payload?.items?.[0]?.id ?? '';

  const client = await api('POST', '/api/clients', {
    last_name: 'Иванов',
    first_name: 'Пётр',
    phone: '+375291113311',
    responsible_user_id: responsibleId,
  });
  const clientSaved = await api('PATCH', `/api/clients/${client.payload.id}`, {
    last_name: 'Иванов',
    first_name: 'Пётр',
    phone: '+375291113311',
    responsible_user_id: responsibleId,
    expected_updated_at: client.payload.updated_at,
  });
  const supplier = await api('POST', '/api/suppliers', {
    name: 'ООО Ромашка',
    unp: '100000002',
    phone: '+375291113322',
  });
  const planned = await api('POST', '/api/interactions', {
    client_id: client.payload.id,
    type: 'call',
    title: 'Звонок по договору',
    planned_at: iso(hours(24)),
    remind_at: iso(hours(23)),
    responsible_user_id: responsibleId,
  });
  check(
    client.status === 201 && clientSaved.status === 200 && supplier.status === 201 && planned.status === 201,
    'Действия, создающие уведомления, выполнены',
    `${client.status}/${clientSaved.status}/${supplier.status}/${planned.status}`,
  );

  const count = await api('GET', '/api/notifications/unread-count');
  check(count.status === 200 && count.payload?.unread === 4, 'Счётчик непрочитанных', `непрочитано ${count.payload?.unread}`);

  const all = await api('GET', '/api/notifications?filter=all&limit=20&offset=0');
  const items = all.payload?.items ?? [];
  check(
    all.status === 200 && items.length === 4 && all.payload?.hasMore === false,
    'Список отдаёт все уведомления и признак «есть ещё»',
    `элементов ${items.length}, есть ещё ${all.payload?.hasMore}`,
  );
  check(
    items[0]?.type === 'reminder' && items.some((item) => item.type === 'client') && items.some((item) => item.type === 'supplier'),
    'В списке есть напоминание и уведомления контрагентов',
    items.map((item) => item.type).join(', '),
  );
  check(
    items.every((item) => item.is_read === false && item.read_at === null),
    'Новые уведомления непрочитанные',
  );

  const unreadOnly = await api('GET', '/api/notifications?filter=unread&limit=20&offset=0');
  check(
    (unreadOnly.payload?.items ?? []).length === 4,
    'Фильтр «Непрочитанные»',
    `элементов ${(unreadOnly.payload?.items ?? []).length}`,
  );

  // --- Порции списка -------------------------------------------------------
  const firstPortion = await api('GET', '/api/notifications?filter=all&limit=2&offset=0');
  const secondPortion = await api('GET', '/api/notifications?filter=all&limit=2&offset=2');
  const firstIds = (firstPortion.payload?.items ?? []).map((item) => item.id);
  const secondIds = (secondPortion.payload?.items ?? []).map((item) => item.id);
  check(
    firstIds.length === 2 && firstPortion.payload?.hasMore === true,
    'Первая порция списка',
    `элементов ${firstIds.length}, есть ещё ${firstPortion.payload?.hasMore}`,
  );
  check(
    secondIds.length === 2 && secondPortion.payload?.hasMore === false,
    'Вторая порция закрывает список',
    `элементов ${secondIds.length}, есть ещё ${secondPortion.payload?.hasMore}`,
  );
  check(new Set([...firstIds, ...secondIds]).size === 4, 'Порции не повторяют друг друга');

  // --- Чужие уведомления недоступны ---------------------------------------
  const foreignId = 'notif-check-foreign';
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
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, created_at, read_at, source_key)
       VALUES (?, ?, 'reminder', 'Чужое уведомление', ?, NULL, NULL)`,
    ).run(foreignId, OTHER_USER_ID, iso(0));
  });

  const afterForeign = await api('GET', '/api/notifications?filter=all&limit=20&offset=0');
  check(
    (afterForeign.payload?.items ?? []).every((item) => item.id !== foreignId) &&
      afterForeign.payload?.unread === 4,
    'Чужое уведомление не попадает в список и счётчик',
    `непрочитано ${afterForeign.payload?.unread}`,
  );
  const foreignRead = await api('POST', `/api/notifications/${foreignId}/read`);
  check(
    foreignRead.status === 404,
    'Чужое уведомление нельзя отметить прочитанным',
    `статус ${foreignRead.status}`,
  );

  // --- Отметка одного и всех ----------------------------------------------
  const target = items[0];
  const marked = await api('POST', `/api/notifications/${target.id}/read`);
  check(
    marked.status === 200 && marked.payload?.is_read === true,
    'Отметка одного уведомления прочитанным',
    `статус ${marked.status}, прочитано ${marked.payload?.is_read}`,
  );

  const repeated = await api('POST', `/api/notifications/${target.id}/read`);
  const afterOne = await api('GET', '/api/notifications/unread-count');
  check(
    repeated.status === 200 && afterOne.payload?.unread === 3,
    'Повторная отметка идемпотентна',
    `статус ${repeated.status}, непрочитано ${afterOne.payload?.unread}`,
  );

  const unreadAfterOne = await api('GET', '/api/notifications?filter=unread&limit=20&offset=0');
  check(
    (unreadAfterOne.payload?.items ?? []).length === 3,
    'Прочитанное уведомление исчезает из фильтра «Непрочитанные»',
    `элементов ${(unreadAfterOne.payload?.items ?? []).length}`,
  );

  const readAll = await api('POST', '/api/notifications/read-all');
  const afterAll = await api('GET', '/api/notifications/unread-count');
  const unreadEmpty = await api('GET', '/api/notifications?filter=unread&limit=20&offset=0');
  const allAfter = await api('GET', '/api/notifications?filter=all&limit=20&offset=0');
  check(
    readAll.status === 200 &&
      afterAll.payload?.unread === 0 &&
      (unreadEmpty.payload?.items ?? []).length === 0,
    '«Прочитать все» обнуляет счётчик и фильтр непрочитанных',
    `непрочитано ${afterAll.payload?.unread}`,
  );
  check(
    (allAfter.payload?.items ?? []).length === 4 &&
      (allAfter.payload?.items ?? []).every((item) => item.is_read === true),
    'Прочитанные уведомления остаются в списке «Все»',
    `элементов ${(allAfter.payload?.items ?? []).length}`,
  );

  // --- Бейдж ---------------------------------------------------------------
  check(
    formatUnreadBadge(0) === null && formatUnreadBadge(-2) === null,
    'При нуле непрочитанных бейджа нет',
    String(formatUnreadBadge(0)),
  );
  check(
    formatUnreadBadge(3) === '3' && formatUnreadBadge(9) === '9' && formatUnreadBadge(10) === '9+',
    'Бейдж показывает число и «9+»',
    `${formatUnreadBadge(3)}/${formatUnreadBadge(9)}/${formatUnreadBadge(10)}`,
  );
} finally {
  await app.close().catch(() => {});
}

for (const { ok, title, detail } of results) {
  console.log(`${ok ? 'ок  ' : 'ОШИБКА'} ${title}${detail ? ` — ${detail}` : ''}`);
}

console.log(
  failed === 0
    ? `\nВсе проверки уведомлений пройдены (${results.length}).`
    : `\nОшибок: ${failed} из ${results.length}`,
);

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

process.exitCode = failed === 0 ? 0 : 1;
