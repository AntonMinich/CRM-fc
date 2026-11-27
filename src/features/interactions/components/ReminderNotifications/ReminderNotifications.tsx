/**
 * Напоминания внутри приложения: опрос сервера раз в минуту и сразу при входе.
 *
 * Уведомление не исчезает само, содержит действия и открывает нужную запись в
 * карточке клиента или поставщика на вкладке «Взаимодействия».
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { dismissReminder, fetchReminders, markReminderShown } from '../../api/interactionsApi';
import { REMINDER_POLL_MS } from '../../config/interactionFields';
import { refreshInteractionsOverdue } from '../../store/interactionsBadge';
import type { Interaction, InteractionModalMode } from '../../types';
import { formatDateTime } from '../../utils/interactionDisplay';
import './ReminderNotifications.css';

/** Кому принадлежит взаимодействие: для ссылки в уведомлении. */
function ownerTitle(interaction: Interaction): string {
  if (interaction.clientId) return `Клиент: ${interaction.clientName ?? ''}`.trim();
  return `Поставщик: ${interaction.supplierName ?? ''}`.trim();
}

export function ReminderNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Interaction[]>([]);
  /** Идентификаторы, о которых уже сообщили: повторно не показываем. */
  const shownRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async (signal?: AbortSignal) => {
    try {
      // Счётчик просроченных для заголовка вкладки CRM обновляется вместе с опросом.
      try {
        await refreshInteractionsOverdue(signal);
      } catch {
        // Счётчик не критичен: напоминания показываем и при ошибке запроса.
      }

      const list = await fetchReminders(signal);
      const fresh = list.filter((item) => !shownRef.current.has(item.id));
      if (fresh.length === 0) return;
      for (const item of fresh) {
        shownRef.current.add(item.id);
        // Отметка о показе: повторно то же напоминание не приходит.
        void markReminderShown(item.id).catch(() => undefined);
      }
      setItems((previous) => [
        ...previous.filter((item) => !fresh.some((next) => next.id === item.id)),
        ...fresh,
      ]);
    } catch {
      // Нет связи: повторим в следующий опрос.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void poll(controller.signal);
    const timer = window.setInterval(() => void poll(), REMINDER_POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [poll]);

  const close = (id: string) => setItems((previous) => previous.filter((item) => item.id !== id));

  /** Закрытие напоминания: скрывается только текущее уведомление. */
  const handleDismiss = (id: string) => {
    void dismissReminder(id).catch(() => undefined);
    close(id);
  };

  /** Открытие записи в карточке владельца на вкладке «Взаимодействия». */
  const openInteraction = (interaction: Interaction, mode: InteractionModalMode = 'view') => {
    const section = interaction.clientId ? 'clients' : 'suppliers';
    const ownerId = interaction.clientId ?? interaction.supplierId ?? '';
    const params = new URLSearchParams({
      open: ownerId,
      tab: 'interactions',
      interaction: interaction.id,
    });
    if (mode !== 'view') params.set('mode', mode);
    navigate(`/crm/${section}?${params.toString()}`);
  };

  if (items.length === 0) return null;

  return (
    <div className="reminders" role="status" aria-live="polite">
      {items.map((item) => (
        <div className="reminders__item" key={item.id}>
          <span className="reminders__icon" aria-hidden="true">
            !
          </span>
          <span className="reminders__text">
            <button
              type="button"
              className="reminders__link"
              onClick={() => openInteraction(item)}
            >
              {ownerTitle(item)}: {item.title}
            </button>
            <span className="reminders__time">
              {item.isOverdue ? 'Просрочено: ' : 'План: '}
              {formatDateTime(item.plannedAt)}
            </span>
          </span>
          <span className="reminders__actions">
            <button
              type="button"
              className="client-button client-button--secondary reminders__button"
              onClick={() => openInteraction(item, 'result')}
            >
              Внести результат
            </button>
            <button
              type="button"
              className="client-button client-button--secondary reminders__button"
              onClick={() => openInteraction(item, 'reschedule')}
            >
              Перенести
            </button>
            <button
              type="button"
              className="client-button client-button--secondary reminders__button"
              onClick={() => handleDismiss(item.id)}
            >
              Закрыть
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
