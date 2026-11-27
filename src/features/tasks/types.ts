/**
 * Задачи: модели интерфейса и ответы сервера.
 * Контракт повторяет остальные разделы: сервер — snake_case, интерфейс — camelCase.
 */

/** Статус задачи для показа: «В работе», «Просрочена», «Выполнена». */
export type TaskStatusView = 'open' | 'overdue' | 'done';

/** Колонка канбана по сроку задачи. */
export type TaskColumn = 'today' | 'tomorrow' | 'week' | 'later' | 'done';

/** Тип элемента раздела «Мои задачи». */
export type AgendaKind = 'task' | 'interaction';

/** Статус элемента раздела: задачи и взаимодействия вместе. */
export type AgendaStatusView = TaskStatusView | 'planned' | 'in_progress';

/** Ответ сервера: задача. */
export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  status: 'open' | 'done';
  status_view: TaskStatusView;
  column: TaskColumn;
  responsible_user_id: string;
  responsible_full_name: string;
  completed_at: string | null;
  interaction_id: string | null;
  client_id: string | null;
  supplier_id: string | null;
  counterparty_type: 'client' | 'supplier' | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Ответ сервера: элемент раздела. */
export interface AgendaItemDto extends Omit<TaskDto, 'status_view'> {
  kind: AgendaKind;
  status_view: AgendaStatusView;
}

/** Ответ сервера: страница раздела. */
export interface AgendaPageDto {
  items: AgendaItemDto[];
  total: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  counts?: Partial<Record<TaskColumn, number>>;
}

/** Задача для интерфейса. */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  status: 'open' | 'done';
  statusView: TaskStatusView;
  column: TaskColumn;
  responsibleUserId: string;
  responsibleFullName: string;
  completedAt: string | null;
  interactionId: string | null;
  counterpartyType: 'client' | 'supplier' | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Элемент раздела «Мои задачи»: задача или взаимодействие (только для чтения). */
export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  description: string | null;
  dueAt: string | null;
  statusView: AgendaStatusView;
  column: TaskColumn;
  responsibleUserId: string;
  responsibleFullName: string;
  counterpartyName: string | null;
  counterpartyType: 'client' | 'supplier' | null;
  counterpartyId: string | null;
  interactionId: string | null;
  isDone: boolean;
}

/** Страница раздела «Мои задачи» с числами по колонкам. */
export interface AgendaPage {
  items: AgendaItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  counts: Record<TaskColumn, number>;
}
