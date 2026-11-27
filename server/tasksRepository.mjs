/**
 * Запросы к таблице «Задачи» (tasks) и общий список раздела «Задачи».
 *
 * Статус и колонка канбана считаются сервером по времени: «В работе» до срока,
 * «Просрочена» после срока, «Выполнена» после закрытия. Раздел показывает
 * задачи вместе с плановыми взаимодействиями — они только для чтения.
 */

import { randomUUID } from 'node:crypto';

import { getDb } from './db.mjs';
import {
  getCurrentUserId,
  interactionViewStatus,
  listAllInteractions,
} from './interactionsRepository.mjs';
import { paginate } from './search.mjs';

/** За сколько до срока предупреждать о задаче. */
export const TASK_SOON_MS = 60 * 60 * 1000;

/** Размер страницы списка и порции карточек колонки канбана. */
export const AGENDA_PAGE_SIZE = 15;

const TASK_SELECT = `
  SELECT t.*,
         u.last_name AS responsible_last_name,
         u.first_name AS responsible_first_name,
         u.middle_name AS responsible_middle_name,
         cl.last_name AS client_last_name,
         cl.first_name AS client_first_name,
         cl.middle_name AS client_middle_name,
         s.name AS supplier_name
    FROM tasks t
    JOIN users u ON u.id = t.responsible_user_id
    LEFT JOIN clients cl ON cl.id = t.client_id
    LEFT JOIN suppliers s ON s.id = t.supplier_id`;

/** ФИО из частей: незаполненные части пропускаются. */
function fullName(lastName, firstName, middleName) {
  return [lastName, firstName, middleName]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' ');
}

/** Статус задачи по времени: «В работе», «Просрочена», «Выполнена». */
export function taskStatus(row, now = Date.now()) {
  if (row.status === 'done') return 'done';
  const due = Date.parse(row.due_at);
  if (!Number.isFinite(due)) return 'open';
  return due <= now ? 'overdue' : 'open';
}

/** Начало суток в часовом поясе приложения. */
function dayStart(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Конец текущей недели: неделя считается с понедельника по воскресенье. */
function weekEnd(time) {
  const weekday = (new Date(dayStart(time)).getDay() + 6) % 7;
  return dayStart(time) + (7 - weekday) * 24 * 60 * 60 * 1000;
}

/** Дата элемента для отбора по периоду: у выполненных — дата выполнения. */
export function agendaDate(item) {
  return item.status_view === 'done' ? (item.completed_at ?? item.due_at) : item.due_at;
}

/** Отбор по периоду: границы включительно, сравнение по дню. */
export function inPeriod(value, from, to) {
  if (!from && !to) return true;
  const time = Date.parse(value ?? '');
  if (!Number.isFinite(time)) return false;
  const day = dayStart(time);
  if (from && day < dayStart(Date.parse(from))) return false;
  if (to && day > dayStart(Date.parse(to))) return false;
  return true;
}

/** Колонка канбана по сроку: сегодня, завтра, эта неделя, позже или завершено. */
export function kanbanColumn(dueAt, status, now = Date.now()) {
  if (status === 'done') return 'done';
  const due = Date.parse(dueAt ?? '');
  if (!Number.isFinite(due)) return 'later';
  const todayEnd = dayStart(now) + 24 * 60 * 60 * 1000;
  if (due < todayEnd) return 'today';
  if (due < todayEnd + 24 * 60 * 60 * 1000) return 'tomorrow';
  if (due < weekEnd(now)) return 'week';
  return 'later';
}

/** Строка базы -> объект для API. */
export function toTaskResponse(row, now = Date.now()) {
  const status = taskStatus(row, now);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    due_at: row.due_at,
    status: row.status,
    status_view: status,
    column: kanbanColumn(row.due_at, status, now),
    responsible_user_id: row.responsible_user_id,
    responsible_full_name: fullName(
      row.responsible_last_name,
      row.responsible_first_name,
      row.responsible_middle_name,
    ),
    completed_at: row.completed_at ?? null,
    interaction_id: row.interaction_id ?? null,
    client_id: row.client_id ?? null,
    supplier_id: row.supplier_id ?? null,
    counterparty_type: row.client_id ? 'client' : row.supplier_id ? 'supplier' : null,
    counterparty_id: row.client_id ?? row.supplier_id ?? null,
    counterparty_name: row.client_id
      ? fullName(row.client_last_name, row.client_first_name, row.client_middle_name)
      : (row.supplier_name ?? null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Задача по идентификатору: строка базы и объект API. */
export function getTaskById(id) {
  const row = getDb().prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
  return row ? { row, task: toTaskResponse(row) } : null;
}

/** Создание задачи. Поля проверяются на уровне API. */
export function createTask(data, currentUserId) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tasks
       (id, title, description, due_at, responsible_user_id, status, interaction_id,
        client_id, supplier_id, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.title,
    data.description,
    data.due_at,
    data.responsible_user_id,
    data.interaction_id ?? null,
    data.client_id ?? null,
    data.supplier_id ?? null,
    currentUserId,
    now,
    now,
  );
  return { status: 'ok', task: getTaskById(id).task };
}

/** Закрытие задачи: повторный вызов ничего не меняет. */
export function closeTask(id) {
  const found = getTaskById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status !== 'done') {
    const now = new Date().toISOString();
    getDb()
      .prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
  }
  return { status: 'ok', task: getTaskById(id).task };
}

/** Правка задачи: название, срок и описание. Выполненная задача не меняется. */
export function updateTask(id, data) {
  const found = getTaskById(id);
  if (!found) return { status: 'not_found' };
  if (found.row.status === 'done') return { status: 'invalid_status' };

  getDb()
    .prepare('UPDATE tasks SET title = ?, description = ?, due_at = ?, updated_at = ? WHERE id = ?')
    .run(data.title, data.description, data.due_at, new Date().toISOString(), id);

  return {
    status: 'ok',
    task: getTaskById(id).task,
    /** Срок изменился: уведомления задачи нужно пересчитать. */
    dueChanged: found.row.due_at !== data.due_at,
  };
}

/** Задачи по фильтрам раздела: поиск по названию и контрагенту, период. */
export function listTasks(
  {
    search = '',
    status = 'all',
    responsible = 'all',
    mine = false,
    dateFrom = '',
    dateTo = '',
  } = {},
  { currentUserId = getCurrentUserId(), now = Date.now() } = {},
) {
  const rows = getDb()
    .prepare(TASK_SELECT)
    .all()
    .map((row) => toTaskResponse(row, now));
  const query = search.trim().toLocaleLowerCase('ru');

  return rows.filter((task) => {
    if (status !== 'all' && task.status_view !== status) return false;
    if (mine) {
      if (task.responsible_user_id !== currentUserId) return false;
    } else if (responsible !== 'all' && task.responsible_user_id !== responsible) {
      return false;
    }
    if (query !== '') {
      const haystack = [task.title, task.counterparty_name ?? '']
        .join(' ')
        .toLocaleLowerCase('ru');
      if (!haystack.includes(query)) return false;
    }
    return inPeriod(agendaDate(task), dateFrom, dateTo);
  });
}

/** Плановые и завершённые взаимодействия для раздела «Задачи». */
function listAgendaInteractions(filters, currentUserId, now) {
  const page = listAllInteractions(
    {
      status: 'all',
      responsible: filters.responsible ?? 'all',
      mine: filters.mine === true,
      ownerType: 'all',
      search: filters.search ?? '',
      page: 1,
      pageSize: 200,
    },
    { currentUserId },
  );

  return page.items
    .filter((item) => item.status !== 'cancelled')
    .map((item) => {
      const view = interactionViewStatus(item);
      const dueAt = item.planned_at ?? item.occurred_at;
      return {
        id: item.id,
        kind: 'interaction',
        title: item.title,
        description: item.plan_comment ?? null,
        due_at: dueAt,
        status: item.status,
        status_view: view,
        column: kanbanColumn(dueAt, view === 'done' ? 'done' : 'open', now),
        responsible_user_id: item.responsible_user_id,
        responsible_full_name: item.responsible_full_name,
        completed_at: item.completed_at ?? null,
        interaction_id: item.id,
        client_id: item.client_id ?? null,
        supplier_id: item.supplier_id ?? null,
        counterparty_type: item.client_id ? 'client' : 'supplier',
        counterparty_id: item.client_id ?? item.supplier_id ?? null,
        counterparty_name: item.client_name ?? item.supplier_name ?? '',
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    })
    .filter((item) => {
      const status = filters.status ?? 'all';
      if (status === 'all') return true;
      // «В работе» в разделе — задачи в работе и взаимодействия без результата.
      if (status === 'open') {
        return item.status_view === 'planned' || item.status_view === 'in_progress';
      }
      return item.status_view === status;
    });
}

/** Общий набор раздела: задачи и взаимодействия, отфильтрованные и отсортированные. */
function collectAgenda(filters, currentUserId, now) {
  const tasks = listTasks(filters, { currentUserId, now }).map((task) => ({ ...task, kind: 'task' }));
  const interactions = listAgendaInteractions(filters, currentUserId, now);
  const from = filters.dateFrom ?? '';
  const to = filters.dateTo ?? '';

  return [...tasks, ...interactions]
    .filter((item) => inPeriod(agendaDate(item), from, to))
    .sort((left, right) => {
      const leftDone = left.status_view === 'done' ? 1 : 0;
      const rightDone = right.status_view === 'done' ? 1 : 0;
      if (leftDone !== rightDone) return leftDone - rightDone;
      // Активные — по ближайшему сроку, завершённые — по дате выполнения (свежие выше).
      const leftTime = Date.parse(agendaDate(left) ?? '') || 0;
      const rightTime = Date.parse(agendaDate(right) ?? '') || 0;
      return leftDone === 1 ? rightTime - leftTime : leftTime - rightTime;
    });
}

/** Число элементов по колонкам канбана. */
function columnCounts(items) {
  const counts = { today: 0, tomorrow: 0, week: 0, later: 0, done: 0 };
  for (const item of items) {
    if (item.column in counts) counts[item.column] += 1;
  }
  return counts;
}

/** Список раздела: серверная пагинация и числа по колонкам. */
export function listAgenda(
  filters = {},
  { currentUserId = getCurrentUserId(), now = Date.now() } = {},
) {
  const items = collectAgenda(filters, currentUserId, now);
  const page = paginate(items, filters.page, filters.pageSize ?? AGENDA_PAGE_SIZE);
  return { ...page, counts: columnCounts(items) };
}

/** Канбан раздела: все элементы колонок без пагинации. */
export function listAgendaKanban(
  filters = {},
  { currentUserId = getCurrentUserId(), now = Date.now() } = {},
) {
  const items = collectAgenda(filters, currentUserId, now);
  return { items, counts: columnCounts(items), total: items.length };
}

/**
 * Порция карточек одной колонки канбана: поиск и фильтры применяются ко всем
 * элементам, «Завершено» отдаёт все выполненные без ограничения по периоду.
 */
export function listAgendaColumn(
  filters = {},
  { column, offset = 0, limit = AGENDA_PAGE_SIZE } = {},
  { currentUserId = getCurrentUserId(), now = Date.now() } = {},
) {
  const items = collectAgenda(filters, currentUserId, now);
  const inColumn = items.filter((item) => item.column === column);

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : AGENDA_PAGE_SIZE;
  const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;
  return {
    items: inColumn.slice(safeOffset, safeOffset + safeLimit),
    total: inColumn.length,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + safeLimit < inColumn.length,
    counts: columnCounts(items),
  };
}

/**
 * Открытые задачи получателя, по которым пора создать уведомления: за час до
 * срока и при наступлении срока. Повтор исключает ключ источника уведомления.
 */
export function dueTaskNotifications(userId, now = Date.now()) {
  if (!userId) return [];
  const rows = getDb()
    .prepare(`${TASK_SELECT} WHERE t.responsible_user_id = ? AND t.status = 'open'`)
    .all(userId);

  const result = [];
  for (const row of rows) {
    const due = Date.parse(row.due_at);
    if (!Number.isFinite(due)) continue;
    if (due <= now) result.push({ task: toTaskResponse(row, now), kind: 'overdue' });
    else if (due - now <= TASK_SOON_MS) result.push({ task: toTaskResponse(row, now), kind: 'soon' });
  }
  return result;
}
