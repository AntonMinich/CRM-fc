/**
 * Колокольчик уведомлений в шапке: счётчик непрочитанных и панель со списком.
 *
 * Источник данных — серверная часть уведомлений (таблица notifications):
 * счётчик опрашивается раз в 30 секунд, только пока вкладка браузера активна;
 * список перезапрашивается при открытии панели и смене вкладки-фильтра.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  InteractionOverlay,
  TaskCardModal,
} from '../../features/tasks/components/TaskCardModal/TaskCardModal';
import {
  NOTIFICATIONS_POLL_MS,
  bellLabel,
  fetchNotifications,
  fetchUnreadCount,
  formatRelativeTime,
  formatUnreadBadge,
  groupOf,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from './notificationsApi';
import './NotificationsBell.css';

type Filter = 'all' | 'unread';
type Status = 'loading' | 'ready' | 'error';

/** Значок типа уведомления; для неизвестного типа — нейтральный колокольчик. */
function typeIcon(type: string) {
  if (type === 'client' || type === 'supplier') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (type === 'call') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h4l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />
      </svg>
    );
  }
  if (type === 'meeting') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M4 10h16M9 4v4M15 4v4" />
      </svg>
    );
  }
  if (type === 'letter') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="m4 8 8 5 8-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unread, setUnread] = useState(0);
  /** Карточки, открытые из уведомления поверх текущей страницы. */
  const [taskCardId, setTaskCardId] = useState<string | null>(null);
  const [interactionCardId, setInteractionCardId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Номер последнего запроса: ответы устаревших запросов игнорируются. */
  const requestRef = useRef(0);

  /** Счётчик непрочитанных: опрос, открытие панели и отметки прочтения. */
  const refreshUnread = useCallback(async (signal?: AbortSignal) => {
    try {
      setUnread(await fetchUnreadCount(signal));
    } catch {
      // Счётчик не критичен: следующая попытка — через интервал опроса.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshUnread(controller.signal);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshUnread();
    }, NOTIFICATIONS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshUnread();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshUnread]);

  /** Порция списка: с нулевого смещения список заменяется целиком. */
  const load = useCallback(async (nextFilter: Filter, offset: number) => {
    const token = ++requestRef.current;
    if (offset === 0) setStatus('loading');
    else setLoadingMore(true);
    try {
      const page = await fetchNotifications(nextFilter, offset);
      if (token !== requestRef.current) return;
      setItems((previous) => (offset === 0 ? page.items : [...previous, ...page.items]));
      setHasMore(page.hasMore);
      setUnread(page.unread);
      setStatus('ready');
    } catch {
      if (token === requestRef.current) setStatus('error');
    } finally {
      if (token === requestRef.current) setLoadingMore(false);
    }
  }, []);

  // Список перезапрашивается при открытии панели и смене вкладки-фильтра.
  useEffect(() => {
    if (!open) return;
    void load(filter, 0);
  }, [open, filter, load]);

  // Закрытие по Esc и клику вне панели.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  /** Отметка одного уведомления: список и счётчик обновляются сразу. */
  const markRead = useCallback((id: string) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item,
      ),
    );
    setUnread((value) => Math.max(0, value - 1));
    void markNotificationRead(id).catch(() => undefined);
  }, []);

  /** «Прочитать все»: отметка на сервере и мгновенный счётчик. */
  const readAll = useCallback(() => {
    setItems((previous) =>
      previous.map((item) => ({ ...item, isRead: true, readAt: new Date().toISOString() })),
    );
    setUnread(0);
    void markAllNotificationsRead().catch(() => undefined);
  }, []);

  /**
   * Клик по строке: отметка прочитанным и открытие связанного объекта поверх
   * текущей страницы — карточки задачи или взаимодействия.
   */
  const handleOpen = (item: AppNotification) => {
    if (!item.isRead) markRead(item.id);
    setOpen(false);
    if (item.entityType === 'task' && item.entityId) {
      setTaskCardId(item.entityId);
      return;
    }
    if (item.entityType === 'interaction' && item.entityId) {
      setInteractionCardId(item.entityId);
      return;
    }
    // Уведомления других типов открывают свой раздел, как и раньше.
    if (item.link) navigate(item.link);
  };

  /** Догрузка следующей порции при прокрутке списка до конца. */
  const handleScroll = () => {
    const list = listRef.current;
    if (!list || !hasMore || loadingMore || status !== 'ready') return;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 24) {
      void load(filter, items.length);
    }
  };

  const groups = useMemo(() => {
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const item of items) {
      (groupOf(item.createdAt) === 'today' ? today : earlier).push(item);
    }
    return [
      { id: 'today', title: 'Сегодня', items: today },
      { id: 'earlier', title: 'Ранее', items: earlier },
    ] as const;
  }, [items]);

  const badge = formatUnreadBadge(unread);

  return (
    <div className="header__bell" ref={wrapRef}>
      <button
        type="button"
        className="header__bell-button"
        aria-label={bellLabel(unread)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {badge ? <span className="header__bell-badge">{badge}</span> : null}
      </button>

      {open ? (
        <section className="notifications" role="dialog" aria-label="Уведомления">
          <header className="notifications__head">
            <h2 className="notifications__title">Уведомления</h2>
            <button
              type="button"
              className="notifications__read-all"
              onClick={readAll}
              disabled={unread === 0}
            >
              Прочитать все
            </button>
          </header>

          <div className="notifications__tabs" role="tablist" aria-label="Фильтр уведомлений">
            {(
              [
                { id: 'all', label: 'Все' },
                { id: 'unread', label: 'Непрочитанные' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={`notifications__tab${
                  filter === tab.id ? ' notifications__tab--active' : ''
                }`}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="notifications__list" ref={listRef} onScroll={handleScroll}>
            {status === 'loading' ? <p className="notifications__state">Загрузка…</p> : null}

            {status === 'error' ? (
              <div className="notifications__state notifications__state--error">
                <p className="notifications__state-text">Не удалось загрузить уведомления</p>
                <button
                  type="button"
                  className="notifications__retry"
                  onClick={() => void load(filter, 0)}
                >
                  Повторить
                </button>
              </div>
            ) : null}

            {status === 'ready' && items.length === 0 ? (
              <p className="notifications__state">
                {filter === 'unread'
                  ? 'Нет непрочитанных'
                  : 'Здесь появятся напоминания, назначения и новые заявки'}
              </p>
            ) : null}

            {status === 'ready'
              ? groups.map((group) =>
                  group.items.length === 0 ? null : (
                    <div className="notifications__group" key={group.id}>
                      <p className="notifications__group-title">{group.title}</p>
                      <ul className="notifications__items">
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`notifications__item${
                                item.isRead ? '' : ' notifications__item--unread'
                              }`}
                              onClick={() => handleOpen(item)}
                            >
                              <span className="notifications__icon">{typeIcon(item.type)}</span>
                              <span className="notifications__item-body">
                                <span className="notifications__item-title">{item.title}</span>
                                {item.body ? (
                                  <span className="notifications__text">{item.body}</span>
                                ) : null}
                                <span className="notifications__time">
                                  {formatRelativeTime(item.createdAt)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
                )
              : null}

            {loadingMore ? <p className="notifications__state">Загрузка…</p> : null}
          </div>
        </section>
      ) : null}

      {/* Карточки открываются поверх страницы; закрытие оставляет пользователя здесь. */}
      <TaskCardModal
        taskId={taskCardId}
        onClose={() => setTaskCardId(null)}
        onChanged={() => void refreshUnread()}
      />

      <InteractionOverlay
        interactionId={interactionCardId}
        onClose={() => setInteractionCardId(null)}
      />
    </div>
  );
}
