/**
 * Проверка нового функционала: статус «Выполняется», задачи и уведомления по ним.
 * Запуск: npm run check:tasks
 *
 * Чистые расчёты (статус взаимодействия, колонка канбана) проверяются напрямую,
 * остальное — реальными запросами к серверу на временной базе.
 */

import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  INTERACTION_IN_PROGRESS_MS,
  interactionStatus,
} from '../server/interactionsRepository.mjs';
import { kanbanColumn, taskLate, taskStatus } from '../server/tasksRepository.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(PROJECT_ROOT, 'data', `_check-tasks-${process.pid}.db`);
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

try {
  // --- Расчёт статуса взаимодействия --------------------------------------
  const now = Date.now();
  const planned = (plannedAt, status = 'planned') => ({ status, planned_at: plannedAt });

  check(
    INTERACTION_IN_PROGRESS_MS === 60 * 60 * 1000,
    'Длительность «Выполняется» — один час в конфигурации',
    String(INTERACTION_IN_PROGRESS_MS),
  );
  check(
    interactionStatus(planned(iso(hours(1))), now) === 'planned',
    'До начала взаимодействие «Запланировано»',
  );
  check(
    interactionStatus(planned(new Date(now).toISOString()), now) === 'in_progress',
    'С момента начала взаимодействие «Выполняется»',
  );
  check(
    interactionStatus(planned(new Date(now - hours(1) + 1000).toISOString()), now) === 'in_progress',
    'Через час без минуты взаимодействие ещё «Выполняется»',
  );
  check(
    interactionStatus(planned(new Date(now - INTERACTION_IN_PROGRESS_MS).toISOString()), now) ===
      'in_progress',
    'Граница ровно час — ещё «Выполняется»',
  );
  check(
    interactionStatus(planned(new Date(now - INTERACTION_IN_PROGRESS_MS - 1).toISOString()), now) ===
      'overdue',
    'Через час и миллисекунду взаимодействие «Просрочено»',
  );
  check(interactionStatus(planned(iso(hours(1)), 'done'), now) === 'done', 'С результатом — «Выполнено»');

  // --- Колонка канбана по сроку -------------------------------------------
  const monday = new Date(2026, 0, 5, 10, 0, 0);
  const mondayTime = monday.getTime();
  const at = (dayOffset, hour) =>
    new Date(2026, 0, 5 + dayOffset, hour, 0, 0).toISOString();

  check(
    kanbanColumn(new Date(mondayTime - hours(3)).toISOString(), 'overdue', mondayTime) === 'today',
    'Просроченная задача попадает в «Сегодня»',
  );
  check(kanbanColumn(at(0, 23), 'open', mondayTime) === 'today', 'Срок сегодня — «Сегодня»');
  check(kanbanColumn(at(1, 12), 'open', mondayTime) === 'tomorrow', 'Срок завтра — «Завтра»');
  check(kanbanColumn(at(2, 12), 'open', mondayTime) === 'week', 'Срок в среду — «На этой неделе»');
  check(kanbanColumn(at(6, 23), 'open', mondayTime) === 'week', 'Воскресенье — конец недели');
  check(kanbanColumn(at(7, 9), 'open', mondayTime) === 'later', 'Следующая неделя — «Позже»');
  check(kanbanColumn(at(1, 12), 'done', mondayTime) === 'done', 'Выполненная — «Завершено»');
  check(taskStatus({ status: 'done', due_at: at(0, 9) }, mondayTime) === 'done', 'Статус выполненной задачи');
  check(taskStatus({ status: 'open', due_at: at(0, 11) }, mondayTime) === 'open', 'Статус задачи в работе');
  check(taskStatus({ status: 'open', due_at: at(0, 9) }, mondayTime) === 'overdue', 'Статус просроченной задачи');

  // --- Создание задачи: обязательны название и срок -----------------------
  const empty = await api('POST', '/api/tasks', {});
  check(
    empty.status === 422 &&
      Boolean(empty.payload?.error?.fieldErrors?.title) &&
      Boolean(empty.payload?.error?.fieldErrors?.due_at),
    'Без названия и срока задача не создаётся',
    `${empty.status} ${JSON.stringify(empty.payload?.error?.fieldErrors ?? {})}`,
  );

  const noDue = await api('POST', '/api/tasks', { title: 'Позвонить клиенту' });
  check(
    noDue.status === 422 &&
      Boolean(noDue.payload?.error?.fieldErrors?.due_at) &&
      !noDue.payload?.error?.fieldErrors?.title,
    'Пустой срок отклоняется',
    `${noDue.status} ${JSON.stringify(noDue.payload?.error?.fieldErrors ?? {})}`,
  );

  const pastDue = await api('POST', '/api/tasks', {
    title: 'Прошлый срок',
    due_at: iso(-hours(2)),
  });
  check(
    pastDue.status === 422 && Boolean(pastDue.payload?.error?.fieldErrors?.due_at),
    'Срок в прошлом отклоняется',
    `${pastDue.status} ${JSON.stringify(pastDue.payload?.error?.fieldErrors ?? {})}`,
  );

  const farTask = await api('POST', '/api/tasks', {
    title: 'Задача без описания',
    due_at: iso(hours(5)),
  });
  check(
    farTask.status === 201 &&
      farTask.payload?.description === null &&
      farTask.payload?.status_view === 'open',
    'Описание необязательно, задача создаётся',
    `${farTask.status}, описание ${farTask.payload?.description}`,
  );

  // --- Уведомления по задаче ----------------------------------------------
  const soonTask = await api('POST', '/api/tasks', {
    title: 'Задача со скорым сроком',
    due_at: iso(hours(0.5)),
    description: 'Проверка уведомления',
  });
  const unreadAfterCreate = await api('GET', '/api/notifications/unread-count');
  check(
    soonTask.status === 201 && unreadAfterCreate.payload?.unread === 1,
    'За час до срока уведомление создаётся сразу при создании задачи',
    `непрочитано ${unreadAfterCreate.payload?.unread}`,
  );

  const notifications = await api('GET', '/api/notifications?filter=all&limit=20&offset=0');
  const soonNotification = (notifications.payload?.items ?? []).find((item) => item.type === 'task');
  check(
    soonNotification?.title === 'Срок задачи скоро истекает' &&
      (soonNotification?.body ?? '').includes('Задача со скорым сроком'),
    'Текст уведомления о скором сроке',
    `${soonNotification?.title} — ${soonNotification?.body}`,
  );
  check(
    soonNotification?.link === '/tasks',
    'Уведомление открывает раздел «Задачи»',
    String(soonNotification?.link),
  );

  await api('GET', '/api/interactions/reminders');
  await api('GET', '/api/interactions/reminders');
  const afterPolls = await api('GET', '/api/notifications/unread-count');
  check(
    afterPolls.payload?.unread === 1,
    'Повторный опрос не дублирует уведомление о скором сроке',
    `непрочитано ${afterPolls.payload?.unread}`,
  );

  withDb((db) => {
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(iso(-hours(1)), soonTask.payload.id);
  });
  await api('GET', '/api/interactions/reminders');
  const overdueItems = (
    (await api('GET', '/api/notifications?filter=all&limit=20&offset=0')).payload?.items ?? []
  ).filter((item) => item.title === 'Задача просрочена');
  check(
    overdueItems.length === 1 && overdueItems[0]?.body === 'Задача со скорым сроком',
    'При наступлении срока создаётся уведомление о просрочке',
    `уведомлений ${overdueItems.length}`,
  );
  await api('GET', '/api/interactions/reminders');
  const overdueAgain = (
    (await api('GET', '/api/notifications?filter=all&limit=20&offset=0')).payload?.items ?? []
  ).filter((item) => item.title === 'Задача просрочена');
  check(overdueAgain.length === 1, 'Уведомление о просрочке создаётся один раз');

  // --- Закрытие задачи -----------------------------------------------------
  const closed = await api('POST', `/api/tasks/${farTask.payload.id}/close`);
  const closedAgain = await api('POST', `/api/tasks/${farTask.payload.id}/close`);
  check(
    closed.status === 200 &&
      closed.payload?.status_view === 'done' &&
      closedAgain.status === 200 &&
      closedAgain.payload?.status === 'done' &&
      Boolean(closed.payload?.completed_at),
    'Задача закрывается, повтор идемпотентен',
    `${closed.status}/${closedAgain.status}, статус ${closedAgain.payload?.status}`,
  );
  const closeMissing = await api('POST', '/api/tasks/no-such-task/close');
  check(closeMissing.status === 404, 'Закрытие неизвестной задачи — 404', `статус ${closeMissing.status}`);

  // У выполненной задачи уведомления не создаются даже после наступления срока.
  withDb((db) => {
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(iso(-hours(2)), farTask.payload.id);
  });
  await api('GET', '/api/interactions/reminders');
  const afterDone = await api('GET', '/api/notifications?filter=all&limit=20&offset=0');
  check(
    (afterDone.payload?.items ?? []).every(
      (item) => !(item.body ?? '').includes('Задача без описания'),
    ),
    'Для выполненной задачи уведомления не создаются',
  );

  // --- Список и карточка задачи -------------------------------------------
  const tasksList = await api('GET', '/api/tasks?search=Задача&mine=true&page=1&pageSize=50');
  check(
    tasksList.status === 200 && (tasksList.payload?.items ?? []).length >= 2,
    'Список задач: поиск и «Только мои»',
    `элементов ${(tasksList.payload?.items ?? []).length}`,
  );
  const single = await api('GET', `/api/tasks/${soonTask.payload.id}`);
  check(
    single.status === 200 && single.payload?.title === 'Задача со скорым сроком',
    'Карточка задачи по идентификатору',
    `${single.status} ${single.payload?.title}`,
  );

  // --- Редактирование задачи ----------------------------------------------
  const unreadBeforeEdit = (await api('GET', '/api/notifications/unread-count')).payload?.unread ?? 0;
  const editable = await api('POST', '/api/tasks', {
    title: 'Задача для правки',
    due_at: iso(hours(5)),
  });
  const edited = await api('PATCH', `/api/tasks/${editable.payload.id}`, {
    title: 'Задача после правки',
    due_at: iso(hours(6)),
    description: 'Новое описание',
  });
  check(
    edited.status === 200 &&
      edited.payload?.title === 'Задача после правки' &&
      edited.payload?.description === 'Новое описание' &&
      edited.payload?.due_at !== editable.payload.due_at,
    'Задача редактируется: название, срок и описание',
    `${edited.status} ${edited.payload?.title}`,
  );

  const withoutTitle = await api('PATCH', `/api/tasks/${editable.payload.id}`, {
    due_at: iso(hours(6)),
  });
  check(
    withoutTitle.status === 422 && Boolean(withoutTitle.payload?.error?.fieldErrors?.title),
    'Правка без названия отклоняется',
    `${withoutTitle.status} ${JSON.stringify(withoutTitle.payload?.error?.fieldErrors ?? {})}`,
  );

  const withoutDue = await api('PATCH', `/api/tasks/${editable.payload.id}`, {
    title: 'Задача после правки',
  });
  check(
    withoutDue.status === 422 && Boolean(withoutDue.payload?.error?.fieldErrors?.due_at),
    'Правка без срока отклоняется',
    `${withoutDue.status} ${JSON.stringify(withoutDue.payload?.error?.fieldErrors ?? {})}`,
  );

  const doneEdit = await api('PATCH', `/api/tasks/${farTask.payload.id}`, {
    title: 'Правка выполненной',
    due_at: iso(hours(8)),
  });
  check(doneEdit.status === 409, 'Выполненную задачу нельзя редактировать', `статус ${doneEdit.status}`);

  // --- Пересчёт уведомлений при смене срока -------------------------------
  await api('PATCH', `/api/tasks/${editable.payload.id}`, {
    title: 'Задача после правки',
    due_at: iso(hours(0.5)),
  });
  const unreadSoon = (await api('GET', '/api/notifications/unread-count')).payload?.unread ?? 0;
  check(
    unreadSoon === unreadBeforeEdit + 1,
    'Новый срок в пределах часа — уведомление о скором сроке создано',
    `непрочитано ${unreadSoon}`,
  );

  await api('PATCH', `/api/tasks/${editable.payload.id}`, {
    title: 'Задача после правки',
    due_at: iso(hours(9)),
  });
  const unreadFar = (await api('GET', '/api/notifications/unread-count')).payload?.unread ?? 0;
  check(
    unreadFar === unreadBeforeEdit,
    'Срок отодвинут — уведомление по старому сроку снято',
    `непрочитано ${unreadFar}`,
  );

  await api('PATCH', `/api/tasks/${editable.payload.id}`, {
    title: 'Задача после правки',
    due_at: iso(hours(0.5)),
  });
  await api('GET', '/api/interactions/reminders');
  const unreadBack = (await api('GET', '/api/notifications/unread-count')).payload?.unread ?? 0;
  check(
    unreadBack === unreadBeforeEdit + 1,
    'Уведомление по новому сроку создаётся один раз',
    `непрочитано ${unreadBack}`,
  );

  // --- Задачи и взаимодействия вместе -------------------------------------
  const users = await api('GET', '/api/users?selectableAsResponsible=true');
  const responsibleId = users.payload?.items?.[0]?.id ?? '';
  const client = await api('POST', '/api/clients', {
    last_name: 'Иванов',
    first_name: 'Пётр',
    phone: '+375291115566',
    responsible_user_id: responsibleId,
  });
  const interaction = await api('POST', '/api/interactions', {
    client_id: client.payload.id,
    type: 'meeting',
    title: 'Встреча в офисе',
    planned_at: iso(hours(2)),
    responsible_user_id: responsibleId,
  });
  const kanban = await api('GET', '/api/agenda?view=kanban&mine=false&pageSize=200');
  const kinds = (kanban.payload?.items ?? []).map((item) => item.kind);
  check(
    kinds.includes('task') && kinds.includes('interaction'),
    'Раздел «Задачи» показывает задачи и взаимодействия',
    kinds.join(', '),
  );
  check(
    (kanban.payload?.counts?.done ?? 0) >= 1 && typeof kanban.payload?.counts?.today === 'number',
    'Числа по колонкам канбана',
    JSON.stringify(kanban.payload?.counts ?? {}),
  );
  const interactionItem = (kanban.payload?.items ?? []).find((item) => item.kind === 'interaction');
  check(
    interactionItem?.status_view === 'planned' &&
      interactionItem?.due_at === interaction.payload.planned_at,
    'Взаимодействие в разделе — по времени начала',
    `${interactionItem?.status_view} ${interactionItem?.due_at}`,
  );

  // Задача, созданная из взаимодействия, наследует контрагента и ответственного.
  const linked = await api('POST', '/api/tasks', {
    title: 'Отразить результат встречи',
    due_at: iso(hours(3)),
    interaction_id: interaction.payload.id,
  });
  check(
    linked.status === 201 &&
      linked.payload?.client_id === client.payload.id &&
      linked.payload?.responsible_user_id === responsibleId &&
      linked.payload?.interaction_id === interaction.payload.id,
    'Задача из карточки связана с взаимодействием и контрагентом',
    `${linked.status}, клиент ${linked.payload?.client_id}`,
  );

  // --- Статус «Выполняется» в API -----------------------------------------
  withDb((db) => {
    db.prepare('UPDATE interactions SET planned_at = ? WHERE id = ?').run(
      iso(-hours(0.5)),
      interaction.payload.id,
    );
  });
  const started = await api('GET', `/api/interactions/${interaction.payload.id}`);
  check(
    started.payload?.is_in_progress === true && started.payload?.is_overdue === false,
    'Начавшееся взаимодействие помечено «Выполняется»',
    `в процессе ${started.payload?.is_in_progress}, просрочено ${started.payload?.is_overdue}`,
  );
  const inProgressFilter = await api(
    'GET',
    '/api/interactions?status=in_progress&mine=false&pageSize=50',
  );
  check(
    (inProgressFilter.payload?.items ?? []).some((item) => item.id === interaction.payload.id),
    'Серверный фильтр «Выполняется»',
    `элементов ${(inProgressFilter.payload?.items ?? []).length}`,
  );

  // --- Быстрые фильтры статусов в «Задачах» -------------------------------
  const openAgenda = await api('GET', '/api/agenda?status=open&mine=false&pageSize=200');
  const openViews = (openAgenda.payload?.items ?? []).map(
    (item) => `${item.kind}:${item.status_view}`,
  );
  check(
    openViews.length > 0 &&
      openViews.every((value) =>
        ['task:open', 'interaction:planned', 'interaction:in_progress'].includes(value),
      ) &&
      openViews.includes('task:open') &&
      openViews.includes('interaction:in_progress'),
    'Фильтр «В работе»: задачи в работе и взаимодействия без результата',
    openViews.join(', '),
  );

  const overdueAgenda = await api('GET', '/api/agenda?status=overdue&mine=false&pageSize=200');
  const overdueViews = (overdueAgenda.payload?.items ?? []).map((item) => item.status_view);
  check(
    overdueViews.length > 0 && overdueViews.every((value) => value === 'overdue'),
    'Фильтр «Просрочены»',
    `элементов ${overdueViews.length}`,
  );

  const doneAgenda = await api('GET', '/api/agenda?status=done&mine=false&pageSize=200');
  const doneViews = (doneAgenda.payload?.items ?? []).map((item) => item.status_view);
  check(
    doneViews.length > 0 && doneViews.every((value) => value === 'done'),
    'Фильтр «Выполнено»',
    `элементов ${doneViews.length}`,
  );

  // --- Страницы списка по 15 записей и поиск по всем записям --------------
  for (let index = 1; index <= 17; index += 1) {
    await api('POST', '/api/tasks', {
      title: `Порционная задача ${index}`,
      due_at: iso(hours(3) + index * 60 * 1000),
    });
  }

  const firstPage = await api('GET', '/api/agenda?mine=false&page=1&pageSize=15&search=Порционная');
  check(
    firstPage.payload?.items?.length === 15 &&
      firstPage.payload?.total === 17 &&
      firstPage.payload?.hasMore === true,
    'Страница списка — 15 записей',
    `элементов ${firstPage.payload?.items?.length}, всего ${firstPage.payload?.total}`,
  );

  const secondPage = await api('GET', '/api/agenda?mine=false&page=2&pageSize=15&search=Порционная');
  check(
    secondPage.payload?.items?.length === 2 && secondPage.payload?.hasMore === false,
    'Вторая страница списка',
    `элементов ${secondPage.payload?.items?.length}`,
  );

  const deepSearch = await api(
    'GET',
    '/api/agenda?mine=false&page=1&pageSize=15&search=Порционная задача 17',
  );
  check(
    deepSearch.payload?.total === 1 &&
      deepSearch.payload?.items?.[0]?.title === 'Порционная задача 17',
    'Поиск работает по всем записям, а не по открытой странице',
    `всего ${deepSearch.payload?.total}`,
  );

  // --- Порции карточек колонки канбана ------------------------------------
  const column = firstPage.payload?.items?.[0]?.column ?? 'later';
  const firstPortion = await api(
    'GET',
    `/api/agenda?mine=false&column=${column}&offset=0&limit=15`,
  );
  check(
    firstPortion.payload?.items?.length === 15 &&
      (firstPortion.payload?.total ?? 0) >= 15 &&
      firstPortion.payload?.hasMore === true,
    'Первая порция карточек колонки',
    `элементов ${firstPortion.payload?.items?.length}, всего ${firstPortion.payload?.total}`,
  );

  const secondPortion = await api(
    'GET',
    `/api/agenda?mine=false&column=${column}&offset=15&limit=15`,
  );
  check(
    secondPortion.payload?.items?.length === (secondPortion.payload?.total ?? 0) - 15 &&
      secondPortion.payload?.hasMore === false,
    'Вторая порция закрывает колонку',
    `элементов ${secondPortion.payload?.items?.length}, всего ${secondPortion.payload?.total}`,
  );
  check(
    (firstPortion.payload?.counts?.[column] ?? 0) === (firstPortion.payload?.total ?? -1),
    'Число в шапке колонки — общее, а не загруженное',
    `в шапке ${firstPortion.payload?.counts?.[column]}, всего ${firstPortion.payload?.total}`,
  );

  // --- Фильтр завершённых по дате -----------------------------------------
  const recentDone = await api('POST', '/api/tasks', {
    title: 'Завершена сегодня',
    due_at: iso(hours(4)),
  });
  await api('POST', `/api/tasks/${recentDone.payload.id}/close`);

  const oldDone = await api('POST', '/api/tasks', {
    title: 'Завершена давно',
    due_at: iso(hours(5)),
  });
  await api('POST', `/api/tasks/${oldDone.payload.id}/close`);
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  withDb((db) => {
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(oldDate, oldDone.payload.id);
  });

  // Колонка «Завершено»: все выполненные, по убыванию даты выполнения, порциями.
  const doneFirst = await api('GET', '/api/agenda?mine=false&column=done&offset=0&limit=15');
  const doneTitles = (doneFirst.payload?.items ?? []).map((item) => item.title);
  check(
    doneTitles.includes('Завершена сегодня') && doneTitles.includes('Завершена давно'),
    'Колонка «Завершено» не ограничена периодом',
    doneTitles.join(', '),
  );
  check(
    doneTitles.indexOf('Завершена сегодня') < doneTitles.indexOf('Завершена давно') &&
      doneTitles[doneTitles.length - 1] === 'Завершена давно',
    'Выполненные идут по убыванию даты выполнения',
    doneTitles.join(', '),
  );
  check(
    (doneFirst.payload?.items?.length ?? 0) <= 15 &&
      (doneFirst.payload?.counts?.done ?? 0) === (doneFirst.payload?.total ?? -1),
    'Порция колонки «Завершено» — 15 записей, в шапке общее число',
    `элементов ${doneFirst.payload?.items?.length}, всего ${doneFirst.payload?.total}`,
  );

  // --- Отбор по типу элемента (задача или взаимодействие) ------------------
  const allAgenda = await api('GET', '/api/agenda?mine=false&pageSize=200&kind=all');
  const onlyTasks = await api('GET', '/api/agenda?mine=false&pageSize=200&kind=task');
  const onlyInteractions = await api('GET', '/api/agenda?mine=false&pageSize=200&kind=interaction');
  const taskKinds = (onlyTasks.payload?.items ?? []).map((item) => item.kind);
  const interactionKinds = (onlyInteractions.payload?.items ?? []).map((item) => item.kind);
  const allKinds = (allAgenda.payload?.items ?? []).map((item) => item.kind);

  check(
    taskKinds.length > 0 && taskKinds.every((value) => value === 'task'),
    'Отбор «Задачи» возвращает только задачи',
    `элементов ${taskKinds.length}`,
  );
  check(
    interactionKinds.length > 0 && interactionKinds.every((value) => value === 'interaction'),
    'Отбор «Взаимодействия» возвращает только взаимодействия',
    `элементов ${interactionKinds.length}`,
  );
  check(
    allKinds.includes('task') &&
      allKinds.includes('interaction') &&
      (onlyTasks.payload?.total ?? 0) + (onlyInteractions.payload?.total ?? 0) ===
        (allAgenda.payload?.total ?? -1),
    'Отбор «Все» возвращает оба типа',
    `задачи ${onlyTasks.payload?.total}, взаимодействия ${onlyInteractions.payload?.total}, всего ${allAgenda.payload?.total}`,
  );

  const typedPage = await api(
    'GET',
    '/api/agenda?mine=true&kind=task&status=open&search=Порционная&page=2&pageSize=15',
  );
  check(
    typedPage.payload?.items?.length === 2 &&
      typedPage.payload?.total === 17 &&
      typedPage.payload?.items?.every(
        (item) => item.kind === 'task' && item.title.includes('Порционная'),
      ),
    'Отбор по типу работает с поиском, статусом, «Только мои» и пагинацией',
    `элементов ${typedPage.payload?.items?.length}, всего ${typedPage.payload?.total}`,
  );

  const kindColumn = await api(
    'GET',
    '/api/agenda?mine=false&column=today&offset=0&limit=15&kind=interaction',
  );
  const kindColumnItems = kindColumn.payload?.items ?? [];
  const columnsMatch = ['today', 'tomorrow', 'week', 'later', 'done'].every(
    (name) =>
      (onlyTasks.payload?.counts?.[name] ?? 0) + (onlyInteractions.payload?.counts?.[name] ?? 0) ===
      (allAgenda.payload?.counts?.[name] ?? -1),
  );
  check(
    kindColumnItems.length > 0 &&
      kindColumnItems.every((item) => item.kind === 'interaction') &&
      columnsMatch,
    'В канбане отбор влияет на содержимое колонок и числа в шапках',
    `в колонке ${kindColumnItems.length}, числа по типам сходятся: ${columnsMatch}`,
  );

  withDb((db) => {
    db.prepare('UPDATE interactions SET planned_at = ? WHERE id = ?').run(
      iso(-hours(2)),
      interaction.payload.id,
    );
  });
  const overdueInteraction = await api('GET', `/api/interactions/${interaction.payload.id}`);
  check(
    overdueInteraction.payload?.is_overdue === true &&
      overdueInteraction.payload?.is_in_progress === false,
    'Через час после начала взаимодействие «Просрочено»',
    `просрочено ${overdueInteraction.payload?.is_overdue}`,
  );
  const overdueFilter = await api('GET', '/api/interactions?status=overdue&mine=false&pageSize=50');
  check(
    (overdueFilter.payload?.items ?? []).some((item) => item.id === interaction.payload.id),
    'Серверный фильтр «Просрочено» учитывает час после начала',
  );

  // --- Просрочка выполнения задачи ----------------------------------------
  const fixedDue = '2026-01-05T10:00:00.000Z';
  const lateRow = taskLate({
    status: 'done',
    due_at: fixedDue,
    completed_at: '2026-01-05T12:15:00.000Z',
  });
  check(
    lateRow.late === true && lateRow.late_minutes === 135,
    'Закрытая позже срока задача получает признак просрочки и длительность',
    `просрочка ${lateRow.late}, минут ${lateRow.late_minutes}`,
  );
  check(
    taskLate({ status: 'done', due_at: fixedDue, completed_at: fixedDue }).late === false,
    'Закрытая ровно в срок задача просрочку не получает',
  );
  check(
    taskLate({ status: 'done', due_at: fixedDue, completed_at: '2026-01-05T09:30:00.000Z' })
      .late === false,
    'Закрытая раньше срока задача просрочку не получает',
  );
  const openRow = taskStatus({ status: 'open', due_at: fixedDue }, Date.parse(fixedDue) + hours(1));
  check(
    taskLate({ status: 'open', due_at: fixedDue, completed_at: null }).late === false &&
      openRow === 'overdue',
    'У открытой задачи просрочки выполнения нет, остаётся статус «Просрочена»',
  );

  const lateTask = await api('POST', '/api/tasks', {
    title: 'Закрыта с просрочкой',
    due_at: iso(hours(6)),
  });
  const onTimeTask = await api('POST', '/api/tasks', {
    title: 'Закрыта в срок',
    due_at: iso(hours(6)),
  });
  const openTask = await api('POST', '/api/tasks', { title: 'Открыта после срока', due_at: iso(hours(6)) });
  await api('POST', `/api/tasks/${lateTask.payload.id}/close`);
  await api('POST', `/api/tasks/${onTimeTask.payload.id}/close`);

  withDb((db) => {
    const update = db.prepare('UPDATE tasks SET due_at = ?, completed_at = ? WHERE id = ?');
    // Выполнена через 2 ч 15 мин после срока.
    update.run(iso(-hours(3)), iso(-hours(0.75)), lateTask.payload.id);
    update.run(iso(-hours(3)), iso(-hours(3)), onTimeTask.payload.id);
    db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(iso(-hours(3)), openTask.payload.id);
  });

  const lateSingle = await api('GET', `/api/tasks/${lateTask.payload.id}`);
  const onTimeSingle = await api('GET', `/api/tasks/${onTimeTask.payload.id}`);
  const openSingle = await api('GET', `/api/tasks/${openTask.payload.id}`);
  check(
    lateSingle.payload?.late === true &&
      lateSingle.payload?.late_minutes === 135 &&
      onTimeSingle.payload?.late === false &&
      onTimeSingle.payload?.late_minutes === 0 &&
      openSingle.payload?.late === false &&
      openSingle.payload?.status_view === 'overdue',
    'Карточка задачи отдаёт признак и длительность просрочки',
    `просрочка ${lateSingle.payload?.late_minutes} мин, в срок ${onTimeSingle.payload?.late}`,
  );

  const lateList = await api('GET', '/api/tasks?search=Закрыта&mine=true&page=1&pageSize=50');
  const listLate = (lateList.payload?.items ?? []).find((item) => item.id === lateTask.payload.id);
  const listOnTime = (lateList.payload?.items ?? []).find((item) => item.id === onTimeTask.payload.id);
  check(
    listLate?.late === true &&
      listLate?.late_minutes === 135 &&
      listOnTime?.late === false &&
      listOnTime?.late_minutes === 0,
    'Список задач отдаёт признак и длительность просрочки',
    `просрочка ${listLate?.late_minutes} мин, в срок ${listOnTime?.late}`,
  );

  const doneColumn = await api('GET', '/api/agenda?mine=false&column=done&offset=0&limit=100');
  const columnLate = (doneColumn.payload?.items ?? []).find((item) => item.id === lateTask.payload.id);
  const columnOnTime = (doneColumn.payload?.items ?? []).find(
    (item) => item.id === onTimeTask.payload.id,
  );
  const interactionItemLate = (doneColumn.payload?.items ?? []).find(
    (item) => item.kind === 'interaction',
  );
  check(
    columnLate?.late === true &&
      columnLate?.late_minutes === 135 &&
      columnOnTime?.late === false &&
      !('late' in (interactionItemLate ?? {})),
    'Колонка канбана отдаёт просрочку только у задач',
    `просрочка ${columnLate?.late_minutes} мин, у взаимодействия ${interactionItemLate?.late}`,
  );

  const agendaLate = await api('GET', '/api/agenda?mine=false&pageSize=200');
  const agendaItems = agendaLate.payload?.items ?? [];
  const agendaItem = agendaItems.find((item) => item.id === lateTask.payload.id);
  const agendaInteraction = agendaItems.find((item) => item.kind === 'interaction');
  check(
    agendaItem?.late === true &&
      agendaItem?.late_minutes === 135 &&
      !('late' in (agendaInteraction ?? {})),
    'Список раздела «Мои задачи» отдаёт просрочку только у задач',
    `просрочка ${agendaItem?.late_minutes} мин, у взаимодействия ${agendaInteraction?.late}`,
  );
} finally {
  await app.close().catch(() => {});
}

for (const { ok, title, detail } of results) {
  console.log(`${ok ? 'ок  ' : 'ОШИБКА'} ${title}${detail ? ` — ${detail}` : ''}`);
}

console.log(
  failed === 0
    ? `\nВсе проверки задач и статуса «Выполняется» пройдены (${results.length}).`
    : `\nОшибок: ${failed} из ${results.length}`,
);

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

process.exitCode = failed === 0 ? 0 : 1;
