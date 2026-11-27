/**
 * Клиентская часть обращений к API уведомлений и чистые помощники панели.
 *
 * Контракт повторяет остальные разделы: сервер принимает и возвращает
 * snake_case, интерфейс работает с camelCase.
 */

/** Уведомление для панели колокольчика. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: 'client' | 'supplier' | 'interaction' | 'task' | null;
  entityId: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}

/** Ответ списка уведомлений. */
export interface NotificationsPage {
  items: AppNotification[];
  total: number;
  hasMore: boolean;
  unread: number;
}

interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  entity_type?: 'client' | 'supplier' | 'interaction' | 'task' | null;
  entity_id?: string | null;
  link?: string | null;
  created_at: string;
  read_at?: string | null;
  is_read?: boolean;
}

/** Сколько уведомлений запрашивается за один раз. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Интервал опроса счётчика непрочитанных: только при активной вкладке. */
export const NOTIFICATIONS_POLL_MS = 30 * 1000;

const API_BASE = '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new Error('Нет связи с сервером');
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
    const body = (payload ?? {}) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? 'Ошибка сервера');
  }

  return payload as T;
}

/** Ответ сервера -> модель интерфейса. */
function toNotification(dto: NotificationDto): AppNotification {
  return {
    id: dto.id,
    type: dto.type,
    title: dto.title,
    body: dto.body ?? null,
    entityType: dto.entity_type ?? null,
    entityId: dto.entity_id ?? null,
    link: dto.link ?? null,
    createdAt: dto.created_at,
    readAt: dto.read_at ?? null,
    isRead: dto.is_read === true || (dto.read_at ?? null) !== null,
  };
}

/** Список уведомлений текущего пользователя: фильтр и порция. */
export async function fetchNotifications(
  filter: 'all' | 'unread',
  offset: number,
  signal?: AbortSignal,
): Promise<NotificationsPage> {
  const params = new URLSearchParams({
    filter,
    limit: String(NOTIFICATIONS_PAGE_SIZE),
    offset: String(offset),
  });
  const dto = await request<{
    items?: NotificationDto[];
    total?: number;
    hasMore?: boolean;
    unread?: number;
  }>(`/notifications?${params.toString()}`, { signal });
  const items = (dto.items ?? []).map(toNotification);
  return {
    items,
    total: typeof dto.total === 'number' ? dto.total : items.length,
    hasMore: dto.hasMore === true,
    unread: typeof dto.unread === 'number' ? dto.unread : 0,
  };
}

/** Счётчик непрочитанных уведомлений. */
export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const dto = await request<{ unread?: number }>('/notifications/unread-count', { signal });
  return typeof dto.unread === 'number' ? dto.unread : 0;
}

/** Отметка одного уведомления прочитанным: повторный вызов безопасен. */
export async function markNotificationRead(id: string, signal?: AbortSignal): Promise<void> {
  await request<NotificationDto>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    signal,
  });
}

/** Отметка всех уведомлений прочитанными. */
export async function markAllNotificationsRead(signal?: AbortSignal): Promise<void> {
  await request<{ unread?: number }>('/notifications/read-all', { method: 'POST', signal });
}

/** Подпись бейджа: при нуле бейджа нет, больше девяти — «9+». */
export function formatUnreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? '9+' : String(Math.trunc(count));
}

/** Название кнопки колокольчика для скринридера. */
export function bellLabel(count: number): string {
  const value = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
  return value === 0 ? 'Уведомления' : `Уведомления, ${value} непрочитанных`;
}

/** Относительное время строки: «5 мин», «2 ч», «Вчера», затем дата. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Вчера';
  if (days < 7) return `${days} дн`;
  return new Date(time).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Группа списка: «Сегодня» для сегодняшних, «Ранее» для остальных. */
export function groupOf(iso: string, now = Date.now()): 'today' | 'earlier' {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 'earlier';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return time >= start.getTime() ? 'today' : 'earlier';
}
