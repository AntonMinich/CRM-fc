/**
 * Клиентская часть обращения к API взаимодействий.
 * Контракт повторяет остальные разделы: сервер принимает и возвращает
 * snake_case, интерфейс работает с camelCase-моделями из ../types.
 */

import type {
  AllInteractionsFilters,
  AllInteractionsPage,
  Interaction,
  InteractionDto,
  InteractionOwner,
  InteractionReschedule,
  InteractionRescheduleDto,
  InteractionsPage,
  InteractionsPageDto,
} from '../types';

/** Ответ общего списка (snake_case) вместе со страницами. */
interface AllInteractionsPageDto extends InteractionsPageDto {
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

const API_BASE = '/api';

/** Ошибка запроса: статус и ошибки полей. */
export class InteractionApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string> | null;

  constructor(status: number, message: string, fieldErrors: Record<string, string> | null = null) {
    super(message);
    this.name = 'InteractionApiError';
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
    throw new InteractionApiError(0, 'Нет связи с сервером');
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
    throw new InteractionApiError(
      response.status,
      body.error?.message ?? 'Ошибка сервера',
      body.error?.fieldErrors ?? null,
    );
  }

  return payload as T;
}

/** Ответ сервера -> модель интерфейса. */
function toReschedule(dto: InteractionRescheduleDto): InteractionReschedule {
  return {
    id: dto.id,
    oldPlannedAt: dto.old_planned_at,
    newPlannedAt: dto.new_planned_at,
    reason: dto.reason ?? null,
    changedByUserId: dto.changed_by_user_id,
    changedByFullName: dto.changed_by_full_name,
    changedAt: dto.changed_at,
  };
}

function toInteraction(dto: InteractionDto): Interaction {
  return {
    id: dto.id,
    clientId: dto.client_id ?? null,
    supplierId: dto.supplier_id ?? null,
    type: dto.type,
    title: dto.title,
    plannedAt: dto.planned_at ?? null,
    status: dto.status,
    responsibleUserId: dto.responsible_user_id,
    responsibleFullName: dto.responsible_full_name,
    planComment: dto.plan_comment ?? null,
    remindAt: dto.remind_at ?? null,
    reminderDismissed: dto.reminder_dismissed === true,
    supplierContactId: dto.supplier_contact_id ?? null,
    supplierContactName: dto.supplier_contact_name ?? null,
    resultText: dto.result_text ?? null,
    occurredAt: dto.occurred_at ?? null,
    nextStep: dto.next_step ?? null,
    cancelReason: dto.cancel_reason ?? null,
    completedByUserId: dto.completed_by_user_id ?? null,
    completedByFullName: dto.completed_by_full_name ?? null,
    completedAt: dto.completed_at ?? null,
    editedByUserId: dto.edited_by_user_id ?? null,
    editedByFullName: dto.edited_by_full_name ?? null,
    editedAt: dto.edited_at ?? null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    isOverdue: dto.is_overdue === true,
    canEditResult: dto.can_edit_result === true,
    rescheduleCount:
      typeof dto.reschedule_count === 'number'
        ? dto.reschedule_count
        : (dto.reschedules ?? []).length,
    clientName: dto.client_name ?? null,
    supplierName: dto.supplier_name ?? null,
    reschedules: (dto.reschedules ?? []).map(toReschedule),
  };
}

/** Тело запроса: набор полей зависит от операции. */
export interface InteractionRequestPayload {
  client_id?: string | null;
  supplier_id?: string | null;
  type?: string;
  title?: string;
  planned_at?: string | null;
  responsible_user_id?: string;
  plan_comment?: string | null;
  remind_at?: string | null;
  supplier_contact_id?: string | null;
  occurred_at?: string;
  result_text?: string;
  next_step?: string | null;
  reason?: string | null;
  cancel_reason?: string | null;
}

/** Взаимодействия клиента или поставщика вместе с числом просроченных. */
export async function fetchInteractions(
  owner: InteractionOwner,
  ownerId: string,
  filter: string,
  signal?: AbortSignal,
): Promise<InteractionsPage> {
  const params = new URLSearchParams({ status: filter });
  const path =
    owner === 'client'
      ? `/clients/${encodeURIComponent(ownerId)}/interactions`
      : `/suppliers/${encodeURIComponent(ownerId)}/interactions`;
  const dto = await request<InteractionsPageDto>(`${path}?${params.toString()}`, { signal });
  return {
    items: (dto.items ?? []).map(toInteraction),
    total: typeof dto.total === 'number' ? dto.total : (dto.items ?? []).length,
    overdue: typeof dto.overdue === 'number' ? dto.overdue : 0,
  };
}

/** Общий список взаимодействий клиентов и поставщиков: фильтры на сервере. */
export async function fetchAllInteractions(
  filters: AllInteractionsFilters,
  signal?: AbortSignal,
): Promise<AllInteractionsPage> {
  const params = new URLSearchParams({
    status: filters.status,
    responsible: filters.responsible,
    mine: filters.mine ? 'true' : 'false',
    ownerType: filters.ownerType,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.search.trim() !== '') params.set('search', filters.search.trim());

  const dto = await request<AllInteractionsPageDto>(`/interactions?${params.toString()}`, { signal });
  const items = (dto.items ?? []).map(toInteraction);
  return {
    items,
    total: typeof dto.total === 'number' ? dto.total : items.length,
    overdue: typeof dto.overdue === 'number' ? dto.overdue : 0,
    page: typeof dto.page === 'number' ? dto.page : filters.page,
    pageSize: typeof dto.pageSize === 'number' ? dto.pageSize : filters.pageSize,
    hasMore: dto.hasMore === true,
  };
}

/** Одна запись вместе с историей переносов. */
export async function fetchInteraction(id: string, signal?: AbortSignal): Promise<Interaction> {
  const dto = await request<InteractionDto>(`/interactions/${encodeURIComponent(id)}`, { signal });
  return toInteraction(dto);
}

/** Создание плана или фиксация результата без плана. */
export async function createInteraction(
  payload: InteractionRequestPayload,
  signal?: AbortSignal,
): Promise<Interaction> {
  const dto = await request<InteractionDto>('/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return toInteraction(dto);
}

/** Правка плана или результата: маршрут один, правила зависят от статуса. */
export async function updateInteraction(
  id: string,
  payload: InteractionRequestPayload,
  signal?: AbortSignal,
): Promise<Interaction> {
  const dto = await request<InteractionDto>(`/interactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return toInteraction(dto);
}

/** Перенос: новая дата, причина и напоминание. */
export async function rescheduleInteraction(
  id: string,
  payload: InteractionRequestPayload,
  signal?: AbortSignal,
): Promise<Interaction> {
  const dto = await request<InteractionDto>(
    `/interactions/${encodeURIComponent(id)}/reschedule`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  );
  return toInteraction(dto);
}

/** Внесение результата в запланированное взаимодействие. */
export async function submitInteractionResult(
  id: string,
  payload: InteractionRequestPayload,
  signal?: AbortSignal,
): Promise<Interaction> {
  const dto = await request<InteractionDto>(`/interactions/${encodeURIComponent(id)}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return toInteraction(dto);
}

/** Отмена запланированного взаимодействия. */
export async function cancelInteraction(
  id: string,
  cancelReason: string | null,
  signal?: AbortSignal,
): Promise<Interaction> {
  const dto = await request<InteractionDto>(`/interactions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_reason: cancelReason }),
    signal,
  });
  return toInteraction(dto);
}

/** Наступившие напоминания текущего пользователя. */
export async function fetchReminders(signal?: AbortSignal): Promise<Interaction[]> {
  const dto = await request<{ items: InteractionDto[] }>('/interactions/reminders', { signal });
  return (dto.items ?? []).map(toInteraction);
}

/** Отметка о показе напоминания. */
export async function markReminderShown(id: string, signal?: AbortSignal): Promise<void> {
  await request<InteractionDto>(`/interactions/${encodeURIComponent(id)}/reminder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shown: true }),
    signal,
  });
}

/** Закрытие напоминания: скрывается только текущее напоминание. */
export async function dismissReminder(id: string, signal?: AbortSignal): Promise<void> {
  await request<InteractionDto>(`/interactions/${encodeURIComponent(id)}/reminder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dismissed: true }),
    signal,
  });
}

