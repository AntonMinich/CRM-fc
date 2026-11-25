/**
 * Клиентская часть обращения к API клиентов и пользователей.
 *
 * Контракт описан в разделе 11 ТЗ: сервер принимает и возвращает snake_case,
 * интерфейс работает с camelCase-моделями из ../types.
 */

import type {
  Client,
  ClientDto,
  ClientsPage,
  ClientsPageDto,
  ResponsibleUser,
  ResponsibleUserDto,
} from '../types';

const API_BASE = '/api';
const DEFAULT_PAGE_SIZE = 50;

/** Ошибка запроса: содержит статус и, для проверок сервера, ошибки полей. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string> | null;

  constructor(status: number, message: string, fieldErrors: Record<string, string> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

interface ApiErrorBody {
  error?: { message?: string; fieldErrors?: Record<string, string> };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');
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
    const body = (payload ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      body.error?.message ?? 'Ошибка сервера',
      body.error?.fieldErrors ?? null,
    );
  }

  return payload as T;
}

function toClient(dto: ClientDto): Client {
  return {
    id: dto.id,
    lastName: dto.last_name ?? null,
    firstName: dto.first_name,
    middleName: dto.middle_name ?? null,
    phone: dto.phone,
    email: dto.email ?? null,
    responsibleUserId: dto.responsible_user_id,
    responsibleFullName: dto.responsible_full_name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function toResponsibleUser(dto: ResponsibleUserDto): ResponsibleUser {
  return { id: dto.id, fullName: dto.full_name };
}

/** Справочник пользователей, доступных как ответственный. */
export async function fetchResponsibleUsers(signal?: AbortSignal): Promise<ResponsibleUser[]> {
  const dto = await request<{ items: ResponsibleUserDto[] }>(
    '/users?selectableAsResponsible=true',
    { signal },
  );
  return (dto.items ?? []).map(toResponsibleUser);
}

/** Список клиентов: поиск по ФИО выполняется на сервере по всему набору записей. */
export async function fetchClients(
  options: { search?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<ClientsPage> {
  const params = new URLSearchParams();
  const search = (options.search ?? '').trim();
  if (search !== '') params.set('search', search);
  params.set('page', String(options.page ?? 1));
  params.set('pageSize', String(options.pageSize ?? DEFAULT_PAGE_SIZE));

  const dto = await request<ClientsPageDto>(`/clients?${params.toString()}`, { signal });
  return {
    items: (dto.items ?? []).map(toClient),
    total: dto.total,
    page: dto.page,
    pageSize: dto.pageSize,
    hasMore: dto.hasMore,
  };
}

/** Тело запроса создания клиента. Значения уже нормализованы (trim). */
export interface CreateClientInput {
  last_name: string | null;
  first_name: string;
  middle_name: string | null;
  phone: string;
  email: string | null;
  responsible_user_id: string;
}

/**
 * Создаёт клиента. Запрос сопровождается ключом идемпотентности, поэтому
 * повторная отправка той же операции не создаёт вторую запись.
 */
export async function createClient(
  input: CreateClientInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Client> {
  const dto = await request<ClientDto>('/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    signal,
  });
  return toClient(dto);
}
