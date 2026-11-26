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

/** Найденный клиент с таким же телефоном: только идентификатор и части ФИО. */
export interface DuplicateClient {
  id: string;
  lastName: string | null;
  firstName: string;
  middleName: string | null;
}

/** Ответ сервера с данными дубля (snake_case). */
interface DuplicateClientDto {
  id: string;
  last_name: string | null;
  first_name: string;
  middle_name: string | null;
}

/** Ошибка запроса: статус, код сервера, ошибки полей и данные дубля телефона. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string> | null;
  /** Код ошибки сервера, например `duplicate_phone`. */
  readonly code: string | null;
  /** Клиент с таким же телефоном, если сервер вернул `duplicate_phone`. */
  readonly duplicateClient: DuplicateClient | null;

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string> | null = null,
    code: string | null = null,
    duplicateClient: DuplicateClient | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
    this.duplicateClient = duplicateClient;
  }
}

interface ApiErrorBody {
  error?: {
    message?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
    client?: DuplicateClientDto;
  };
}

/** Данные дубля из ответа сервера в модель интерфейса. */
function toDuplicateClient(dto: DuplicateClientDto | undefined): DuplicateClient | null {
  if (!dto || typeof dto.id !== 'string') return null;
  return {
    id: dto.id,
    lastName: dto.last_name ?? null,
    firstName: dto.first_name,
    middleName: dto.middle_name ?? null,
  };
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
      body.error?.code ?? null,
      toDuplicateClient(body.error?.client),
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
    comment: dto.comment ?? null,
    regPostalCode: dto.reg_postal_code ?? null,
    regCountry: dto.reg_country ?? null,
    regCity: dto.reg_city ?? null,
    regStreet: dto.reg_street ?? null,
    regHouse: dto.reg_house ?? null,
    regBuilding: dto.reg_building ?? null,
    regApartment: dto.reg_apartment ?? null,
    resPostalCode: dto.res_postal_code ?? null,
    resCountry: dto.res_country ?? null,
    resCity: dto.res_city ?? null,
    resStreet: dto.res_street ?? null,
    resHouse: dto.res_house ?? null,
    resBuilding: dto.res_building ?? null,
    resApartment: dto.res_apartment ?? null,
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
  comment: string | null;
  reg_postal_code: string | null;
  reg_country: string | null;
  reg_city: string | null;
  reg_street: string | null;
  reg_house: string | null;
  reg_building: string | null;
  reg_apartment: string | null;
  res_postal_code: string | null;
  res_country: string | null;
  res_city: string | null;
  res_street: string | null;
  res_house: string | null;
  res_building: string | null;
  res_apartment: string | null;
}

/** Тело запроса обновления: те же поля и значение `updated_at` при открытии карточки. */
export interface UpdateClientInput extends CreateClientInput {
  expected_updated_at: string;
}

/** Карточка одного клиента. */
export async function fetchClient(id: string, signal?: AbortSignal): Promise<Client> {
  const dto = await request<ClientDto>(`/clients/${encodeURIComponent(id)}`, { signal });
  return toClient(dto);
}

/**
 * Живая проверка телефона: есть ли другой клиент с таким номером.
 * Используется для подсказки при вводе номера, до нажатия «Создать»/«Сохранить».
 * Возвращает только идентификатор и части ФИО найденного клиента.
 */
export async function fetchPhoneDuplicate(
  phone: string,
  excludeClientId?: string | null,
  signal?: AbortSignal,
): Promise<DuplicateClient | null> {
  const params = new URLSearchParams({ phone });
  if (excludeClientId) params.set('excludeId', excludeClientId);
  const dto = await request<{ duplicate: DuplicateClientDto | null }>(
    `/clients/phone-check?${params.toString()}`,
    { signal },
  );
  return toDuplicateClient(dto.duplicate ?? undefined);
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

/**
 * Сохраняет изменения существующего клиента.
 * Ключ идемпотентности защищает от повторного применения одного запроса,
 * `expected_updated_at` — от затирания чужих правок (конфликт возвращает 409).
 */
export async function updateClient(
  id: string,
  input: UpdateClientInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Client> {
  const dto = await request<ClientDto>(`/clients/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    signal,
  });
  return toClient(dto);
}
