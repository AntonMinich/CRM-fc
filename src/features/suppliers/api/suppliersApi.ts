/**
 * Клиентская часть обращения к API поставщиков.
 * Контракт повторяет клиентский: сервер принимает и возвращает snake_case,
 * интерфейс работает с camelCase-моделями из ../types.
 */

import type {
  DuplicatePhoneWarning,
  DuplicateSupplier,
  Supplier,
  SupplierDto,
  SuppliersPage,
  SuppliersPageDto,
} from '../types';

const API_BASE = '/api';
const DEFAULT_PAGE_SIZE = 50;

/** Ответ сервера с данными дубля (snake_case). */
interface DuplicateSupplierDto {
  id: string;
  name: string;
}

/** Предупреждение о дубле телефона в ответе сервера (snake_case). */
interface DuplicatePhoneWarningDto {
  items: DuplicateSupplierDto[];
  total: number;
}

/** Ошибка запроса: статус, код сервера, ошибки полей и данные дубля телефона. */
export class SupplierApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string> | null;
  /** Код ошибки сервера, например `duplicate_phone`. */
  readonly code: string | null;
  /** Поставщик с таким же телефоном, если сервер вернул `duplicate_phone`. */
  readonly duplicateSupplier: DuplicateSupplier | null;

  constructor(
    status: number,
    message: string,
    fieldErrors: Record<string, string> | null = null,
    code: string | null = null,
    duplicateSupplier: DuplicateSupplier | null = null,
  ) {
    super(message);
    this.name = 'SupplierApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
    this.duplicateSupplier = duplicateSupplier;
  }
}

interface ApiErrorBody {
  error?: {
    message?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
    supplier?: DuplicateSupplierDto;
  };
}

/** Данные дубля из ответа сервера в модель интерфейса. */
function toDuplicateSupplier(dto: DuplicateSupplierDto | undefined): DuplicateSupplier | null {
  if (!dto || typeof dto.id !== 'string') return null;
  return { id: dto.id, name: dto.name };
}

/** Предупреждение о дубле телефона в модель интерфейса. */
function toDuplicatePhoneWarning(
  dto: DuplicatePhoneWarningDto | null | undefined,
): DuplicatePhoneWarning | null {
  if (!dto || !Array.isArray(dto.items) || dto.items.length === 0) return null;
  return {
    items: dto.items
      .map((item) => toDuplicateSupplier(item))
      .filter((item): item is DuplicateSupplier => item !== null),
    total: typeof dto.total === 'number' ? dto.total : dto.items.length,
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
    throw new SupplierApiError(0, 'Нет связи с сервером');
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
    throw new SupplierApiError(
      response.status,
      body.error?.message ?? 'Ошибка сервера',
      body.error?.fieldErrors ?? null,
      body.error?.code ?? null,
      toDuplicateSupplier(body.error?.supplier),
    );
  }

  return payload as T;
}

/** Ответ сервера -> модель интерфейса. */
function toSupplier(dto: SupplierDto): Supplier {
  return {
    id: dto.id,
    name: dto.name,
    unp: dto.unp,
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
    postPostalCode: dto.post_postal_code ?? null,
    postCountry: dto.post_country ?? null,
    postCity: dto.post_city ?? null,
    postStreet: dto.post_street ?? null,
    postHouse: dto.post_house ?? null,
    postBuilding: dto.post_building ?? null,
    postApartment: dto.post_apartment ?? null,
    bankAccount: dto.bank_account ?? null,
    bankName: dto.bank_name ?? null,
    bicSwift: dto.bic_swift ?? null,
    directorName: dto.director_name ?? null,
    duplicatePhoneWith: toDuplicatePhoneWarning(dto.duplicate_phone_with),
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

/** Список поставщиков: поиск по наименованию выполняется на сервере. */
export async function fetchSuppliers(
  options: { search?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<SuppliersPage> {
  const params = new URLSearchParams();
  const search = (options.search ?? '').trim();
  if (search !== '') params.set('search', search);
  params.set('page', String(options.page ?? 1));
  params.set('pageSize', String(options.pageSize ?? DEFAULT_PAGE_SIZE));

  const dto = await request<SuppliersPageDto>(`/suppliers?${params.toString()}`, { signal });
  return {
    items: (dto.items ?? []).map(toSupplier),
    total: dto.total,
    page: dto.page,
    pageSize: dto.pageSize,
    hasMore: dto.hasMore,
  };
}

/** Карточка одного поставщика. */
export async function fetchSupplier(id: string, signal?: AbortSignal): Promise<Supplier> {
  const dto = await request<SupplierDto>(`/suppliers/${encodeURIComponent(id)}`, { signal });
  return toSupplier(dto);
}

/** Тело запроса создания поставщика. Значения уже нормализованы (trim). */
export interface SupplierInput {
  name: string;
  unp: string;
  phone: string;
  email: string | null;
  comment: string | null;
  reg_postal_code: string | null;
  reg_country: string | null;
  reg_city: string | null;
  reg_street: string | null;
  reg_house: string | null;
  reg_building: string | null;
  reg_apartment: string | null;
  post_postal_code: string | null;
  post_country: string | null;
  post_city: string | null;
  post_street: string | null;
  post_house: string | null;
  post_building: string | null;
  post_apartment: string | null;
  bank_account: string | null;
  bank_name: string | null;
  bic_swift: string | null;
  director_name: string | null;
}

/** Тело запроса обновления: те же поля и значение `updated_at` при открытии карточки. */
export interface UpdateSupplierInput extends SupplierInput {
  expected_updated_at: string;
}

/**
 * Создаёт поставщика. Запрос сопровождается ключом идемпотентности, поэтому
 * повторная отправка той же операции не создаёт вторую запись.
 */
export async function createSupplier(
  input: SupplierInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Supplier> {
  const dto = await request<SupplierDto>('/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    signal,
  });
  return toSupplier(dto);
}

/**
 * Сохраняет изменения существующего поставщика.
 * Ключ идемпотентности защищает от повторного применения одного запроса,
 * `expected_updated_at` — от затирания чужих правок (конфликт возвращает 409).
 */
export async function updateSupplier(
  id: string,
  input: UpdateSupplierInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Supplier> {
  const dto = await request<SupplierDto>(`/suppliers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    signal,
  });
  return toSupplier(dto);
}

/**
 * Живая проверка УНП: есть ли другой поставщик с таким же УНП.
 * Используется для подсказки при вводе, до нажатия «Создать»/«Сохранить».
 */
export async function fetchUnpDuplicate(
  unp: string,
  excludeSupplierId?: string | null,
  signal?: AbortSignal,
): Promise<DuplicateSupplier | null> {
  const params = new URLSearchParams({ unp });
  if (excludeSupplierId) params.set('excludeId', excludeSupplierId);
  const dto = await request<{ duplicate: DuplicateSupplierDto | null }>(
    `/suppliers/unp-check?${params.toString()}`,
    { signal },
  );
  return toDuplicateSupplier(dto.duplicate ?? undefined);
}

/**
 * Живая проверка телефона: другие поставщики с таким же номером.
 * Возвращает до трёх наименований и общее количество найденных записей.
 */
export async function fetchPhoneDuplicates(
  phone: string,
  excludeSupplierId?: string | null,
  signal?: AbortSignal,
): Promise<DuplicatePhoneWarning | null> {
  const params = new URLSearchParams({ phone });
  if (excludeSupplierId) params.set('excludeId', excludeSupplierId);
  const dto = await request<{ duplicates: DuplicatePhoneWarningDto }>(
    `/suppliers/phone-check?${params.toString()}`,
    { signal },
  );
  return toDuplicatePhoneWarning(dto.duplicates);
}
