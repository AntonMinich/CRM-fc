/** Справочники и лимиты раздела «Мои задачи». */

import type { TaskColumn, TaskStatusView } from '../types';

/** Лимиты длины: те же значения в форме и на сервере. */
export const TASK_LIMITS = {
  title: 200,
  description: 1000,
} as const;

/** За сколько до срока предупреждает колокольчик (час). */
export const TASK_SOON_MS = 60 * 60 * 1000;

/** Срок по умолчанию при создании задачи: текущее время плюс час. */
export const TASK_DEFAULT_LEAD_MS = 60 * 60 * 1000;

/** Подписи статусов задачи. */
export const TASK_STATUS_LABELS: Record<TaskStatusView, string> = {
  open: 'В работе',
  overdue: 'Просрочена',
  done: 'Выполнена',
};

/** Название тега задачи, закрытой позже срока. */
export const TASK_LATE_LABEL = 'С просрочкой';

/**
 * Длительность просрочки: «5 мин», «2 ч 15 мин», «1 д 3 ч».
 * Нулевые части не показываются: меньше часа — минуты, меньше суток — часы и минуты.
 */
export function formatLateDuration(minutes: number): string {
  const total = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  if (total < 60) return `${total} мин`;

  if (total < 24 * 60) {
    const hoursPart = Math.floor(total / 60);
    const minutesPart = total % 60;
    return minutesPart === 0 ? `${hoursPart} ч` : `${hoursPart} ч ${minutesPart} мин`;
  }

  const daysPart = Math.floor(total / (24 * 60));
  const hoursRest = Math.floor((total % (24 * 60)) / 60);
  return hoursRest === 0 ? `${daysPart} д` : `${daysPart} д ${hoursRest} ч`;
}

/** Быстрые фильтры статуса. */
export const TASK_FILTERS: readonly { value: TaskStatusView | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'open', label: 'В работе' },
  { value: 'overdue', label: 'Просрочены' },
  { value: 'done', label: 'Выполнено' },
];

/** Колонки канбана в порядке показа. */
export const KANBAN_COLUMNS: readonly { id: TaskColumn; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'tomorrow', label: 'Завтра' },
  { id: 'week', label: 'На этой неделе' },
  { id: 'later', label: 'Позже' },
  { id: 'done', label: 'Завершено' },
];

/** Подпись статуса элемента раздела: взаимодействия показываются своими статусами. */
export const AGENDA_STATUS_LABELS: Record<string, string> = {
  open: 'В работе',
  overdue: 'Просрочена',
  done: 'Завершено',
  planned: 'Запланировано',
  in_progress: 'Выполняется',
};

/** Вид раздела: список или канбан. Выбор запоминается в браузере. */
export type TasksView = 'list' | 'kanban';

export const TASKS_VIEW_STORAGE_KEY = 'fincode-tasks-view';

/** Сохранённый вид раздела или список по умолчанию. */
export function readTasksView(): TasksView {
  try {
    return window.localStorage.getItem(TASKS_VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
}

/** Сохранение вида раздела: ошибка хранилища не прерывает работу. */
export function storeTasksView(view: TasksView): void {
  try {
    window.localStorage.setItem(TASKS_VIEW_STORAGE_KEY, view);
  } catch {
    /* сохранение между сеансами в этом случае не гарантируется */
  }
}
