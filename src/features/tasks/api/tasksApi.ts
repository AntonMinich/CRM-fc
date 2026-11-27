/**
 * Клиентская часть обращений к API задач и раздела «Мои задачи».
 * Контракт повторяет остальные разделы: сервер — snake_case, интерфейс — camelCase.
 */

import type {
  AgendaItem,
  AgendaItemDto,
  AgendaPage,
  AgendaPageDto,
  Task,
  TaskColumn,
  TaskDto,
} from '../types';

const API_BASE = '/api';

/** Размер страницы списка и порции карточек колонки. */
export const AGENDA_PAGE_SIZE = 15;

/** Ошибка запроса: статус и ошибки полей. */
export class TaskApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string> | null;

  constructor(status: number, message: string, fieldErrors: Record<string, string> | null = null) {
    super(message);
    this.name = 'TaskApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new TaskApiError(0, 'Нет связи с сервером');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as {
      error?: { message?: string; fieldErrors?: Record<string, string> };
    };
    throw new TaskApiError(
      response.status,
      body.error?.message ?? 'Ошибка сервера',
      body.error?.fieldErrors ?? null,
    );
  }

  return payload as T;
}

/** Ответ сервера -> модель интерфейса. */
function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? null,
    dueAt: dto.due_at,
    status: dto.status,
    statusView: dto.status_view,
    column: dto.column,
    responsibleUserId: dto.responsible_user_id,
    responsibleFullName: dto.responsible_full_name,
    completedAt: dto.completed_at ?? null,
    interactionId: dto.interaction_id ?? null,
    counterpartyType: dto.counterparty_type ?? null,
    counterpartyId: dto.counterparty_id ?? null,
    counterpartyName: dto.counterparty_name ?? null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

/** Элемент раздела: задача или взаимодействие (только для чтения). */
function toAgendaItem(dto: AgendaItemDto): AgendaItem {
  return {
    id: dto.id,
    kind: dto.kind,
    title: dto.title,
    description: dto.description ?? null,
    dueAt: dto.due_at ?? null,
    statusView: dto.status_view,
    column: dto.column,
    responsibleUserId: dto.responsible_user_id,
    responsibleFullName: dto.responsible_full_name,
    counterpartyName: dto.counterparty_name ?? null,
    counterpartyType: dto.counterparty_type ?? null,
    counterpartyId: dto.counterparty_id ?? null,
    interactionId: dto.interaction_id ?? null,
    isDone: dto.status_view === 'done',
  };
}

const EMPTY_COUNTS: Record<TaskColumn, number> = {
  today: 0,
  tomorrow: 0,
  week: 0,
  later: 0,
  done: 0,
};

/** Фильтры раздела. */
export interface AgendaFilters {
  search: string;
  status: string;
  responsible: string;
  mine: boolean;
  /** Период списка: по сроку задачи и времени начала взаимодействия. */
  dateFrom: string;
  dateTo: string;
  /** Тип элемента: all, task или interaction. */
  kind: string;
  page: number;
  pageSize: number;
}

/** Порция карточек колонки канбана. */
export interface AgendaColumnPage {
  items: AgendaItem[];
  total: number;
  hasMore: boolean;
  counts: Record<TaskColumn, number>;
}

/** Общие параметры отбора: поиск, статус, ответственный, период. */
function agendaParams(filters: AgendaFilters): URLSearchParams {
  const params = new URLSearchParams({
    search: filters.search,
    status: filters.status,
    responsible: filters.responsible,
    mine: filters.mine ? 'true' : 'false',
    kind: filters.kind,
  });
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params;
}

/** Список раздела: задачи и взаимодействия вместе, страницами. */
export async function fetchAgenda(
  filters: AgendaFilters,
  signal?: AbortSignal,
): Promise<AgendaPage> {
  const params = agendaParams(filters);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));

  const dto = await request<AgendaPageDto>(`/agenda?${params.toString()}`, { signal });
  const items = (dto.items ?? []).map(toAgendaItem);
  return {
    items,
    total: typeof dto.total === 'number' ? dto.total : items.length,
    page: typeof dto.page === 'number' ? dto.page : filters.page,
    pageSize: typeof dto.pageSize === 'number' ? dto.pageSize : filters.pageSize,
    hasMore: dto.hasMore === true,
    counts: { ...EMPTY_COUNTS, ...(dto.counts ?? {}) },
  };
}

/** Порция карточек одной колонки канбана: общее число приходит в `total`. */
export async function fetchAgendaColumn(
  column: TaskColumn,
  filters: AgendaFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<AgendaColumnPage> {
  const params = agendaParams(filters);
  params.set('column', column);
  params.set('offset', String(offset));
  params.set('limit', String(filters.pageSize));

  const dto = await request<AgendaPageDto>(`/agenda?${params.toString()}`, { signal });
  const items = (dto.items ?? []).map(toAgendaItem);
  return {
    items,
    total: typeof dto.total === 'number' ? dto.total : items.length,
    hasMore: dto.hasMore === true,
    counts: { ...EMPTY_COUNTS, ...(dto.counts ?? {}) },
  };
}

/** Тело запроса на создание задачи. */
export interface TaskRequestPayload {
  title: string;
  due_at: string;
  description?: string | null;
  responsible_user_id?: string;
  interaction_id?: string | null;
}

/** Создание задачи. */
export async function createTask(payload: TaskRequestPayload, signal?: AbortSignal): Promise<Task> {
  const dto = await request<TaskDto>('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return toTask(dto);
}

/** Закрытие задачи: повторный вызов безопасен. */
export async function closeTask(id: string, signal?: AbortSignal): Promise<Task> {
  const dto = await request<TaskDto>(`/tasks/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    signal,
  });
  return toTask(dto);
}

/** Карточка задачи. */
export async function fetchTask(id: string, signal?: AbortSignal): Promise<Task> {
  const dto = await request<TaskDto>(`/tasks/${encodeURIComponent(id)}`, { signal });
  return toTask(dto);
}

/** Правка задачи: название, срок и описание. Выполненная задача не меняется. */
export async function updateTask(
  id: string,
  payload: Pick<TaskRequestPayload, 'title' | 'due_at' | 'description'>,
  signal?: AbortSignal,
): Promise<Task> {
  const dto = await request<TaskDto>(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return toTask(dto);
}
