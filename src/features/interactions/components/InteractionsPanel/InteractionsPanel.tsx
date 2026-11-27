/**
 * Вкладка «Взаимодействия» карточки клиента или поставщика: кнопки планирования
 * и фиксации результата, быстрые фильтры и таблица записей.
 *
 * Панель сама загружает данные: список взаимодействий, пользователей и контакты
 * поставщика. Число просроченных сообщается карточке для заголовка вкладки.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { fetchResponsibleUsers } from '../../../clients/api/clientsApi';
import type { ResponsibleUser } from '../../../clients/types';
import { fetchSupplierContacts } from '../../../suppliers/api/suppliersApi';
import type { SupplierContact } from '../../../suppliers/types';
import '../../../crm/components/CreateButton/CreateButton.css';
import { fetchInteraction, fetchInteractions } from '../../api/interactionsApi';
import { FILTERS, typeLabel } from '../../config/interactionFields';
import type {
  Interaction,
  InteractionFilter,
  InteractionModalMode,
  InteractionOwner,
} from '../../types';
import {
  formatDateTime,
  interactionStatusKey,
  interactionStatusLabel,
  sortInteractions,
} from '../../utils/interactionDisplay';
import { InteractionModal } from '../InteractionModal/InteractionModal';
import { refreshInteractionsOverdue } from '../../store/interactionsBadge';
import './InteractionsPanel.css';

/** Состояние загрузки списка. */
type PanelStatus = 'loading' | 'ready' | 'error';

/** Данные вкладки «Взаимодействия»: владелец, счётчик просроченных и переход. */
export interface InteractionsTabProps {
  owner: InteractionOwner;
  /** null — карточка ещё не сохранена. */
  ownerId: string | null;
  /** Количество просроченных для заголовка вкладки. */
  overdue: number;
  onOverdueChange: (count: number) => void;
  /** Переход из напоминания: открыть запись в нужном режиме. */
  entry?: { interactionId: string; mode: InteractionModalMode } | null;
}

interface InteractionsPanelProps extends InteractionsTabProps {
  /** Переход из напоминания: сразу открывается нужная запись. */
  initialInteractionId?: string | null;
}

interface ModalState {
  mode: InteractionModalMode;
  interaction: Interaction | null;
}

export function InteractionsPanel({
  owner,
  ownerId,
  onOverdueChange,
  entry = null,
}: InteractionsPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [items, setItems] = useState<Interaction[]>([]);
  const [filter, setFilter] = useState<InteractionFilter>('all');
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /** Записи, открытые переходом из напоминания, повторно не открываем. */
  const openedFromReminderRef = useRef<string | null>(null);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Список взаимодействий: перезагружается при смене владельца и фильтра.
  useEffect(() => {
    if (ownerId === null) {
      setItems([]);
      setStatus('ready');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    void (async () => {
      try {
        const page = await fetchInteractions(owner, ownerId, filter, controller.signal);
        if (controller.signal.aborted) return;
        setItems(page.items);
        onOverdueChange(page.overdue);
        setStatus('ready');
      } catch {
        if (controller.signal.aborted) return;
        setItems([]);
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [filter, onOverdueChange, owner, ownerId, reloadToken]);

  // Пользователи: нужны выпадающему списку ответственного.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const list = await fetchResponsibleUsers(controller.signal);
        if (!controller.signal.aborted) setUsers(list);
      } catch {
        if (!controller.signal.aborted) setUsers([]);
      }
    })();
    return () => controller.abort();
  }, []);

  // Контакты поставщика: выбор в плане и обязательный выбор в результате.
  useEffect(() => {
    if (owner !== 'supplier' || ownerId === null) {
      setContacts([]);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const page = await fetchSupplierContacts(ownerId, controller.signal);
        if (!controller.signal.aborted) setContacts(page.items);
      } catch {
        if (!controller.signal.aborted) setContacts([]);
      }
    })();
    return () => controller.abort();
  }, [owner, ownerId, reloadToken]);

  // Переход из напоминания: открываем нужную запись поверх вкладки.
  useEffect(() => {
    if (!entry || ownerId === null) return;
    if (openedFromReminderRef.current === entry.interactionId) return;
    openedFromReminderRef.current = entry.interactionId;

    const controller = new AbortController();
    void (async () => {
      try {
        const interaction = await fetchInteraction(entry.interactionId, controller.signal);
        if (controller.signal.aborted) return;
        setModal({ mode: entry.mode, interaction });
      } catch {
        // Запись могла быть недоступна: вкладка остаётся списком.
      }
    })();
    return () => controller.abort();
  }, [entry, ownerId]);

  /** Текущий пользователь: первый из списка ответственных. */
  const currentUserId = users[0]?.id ?? '';
  const sorted = useMemo(() => sortInteractions(items), [items]);

  const openPlan = () => setModal({ mode: 'plan', interaction: null });
  const openResult = () => setModal({ mode: 'result', interaction: null });
  const openView = (interaction: Interaction) => setModal({ mode: 'view', interaction });

  /** Сохранение: список и число просроченных обновляются, окно закрывается. */
  const handleSaved = () => {
    setModal(null);
    reload();
    // Заголовок вкладки CRM обновляется и при работе из карточки контрагента.
    void refreshInteractionsOverdue().catch(() => undefined);
  };

  if (ownerId === null) {
    return <p className="interactions__hint">Сохраните карточку, чтобы добавлять взаимодействия</p>;
  }

  return (
    <div className="interactions">
      <div className="interactions__top">
        <div className="interactions__actions">
          <button type="button" className="create-button" onClick={openPlan}>
            Запланировать
          </button>
          <button type="button" className="create-button" onClick={openResult}>
            Зафиксировать результат
          </button>
        </div>
        <div className="interactions__filters" role="group" aria-label="Фильтр взаимодействий">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`interactions__filter${
                filter === item.value ? ' interactions__filter--active' : ''
              }`}
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' ? (
        <div className="client-table-wrap interactions__wrap">
          <p className="client-table-state">
            <span className="client-spinner" aria-hidden="true" />
            Загрузка…
          </p>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="client-table-wrap interactions__wrap">
          <div className="client-table-state client-table-state--error">
            <p className="client-table-state__text">Не удалось загрузить взаимодействия</p>
            <button type="button" className="client-retry" onClick={reload}>
              Повторить
            </button>
          </div>
        </div>
      ) : null}

      {status === 'ready' && sorted.length === 0 ? (
        <div className="client-table-wrap interactions__wrap">
          <p className="client-table-state">Взаимодействий пока нет</p>
        </div>
      ) : null}

      {status === 'ready' && sorted.length > 0 ? (
        <div className="client-table-wrap interactions__wrap">
          <table
            className={`client-table interactions-table${
              owner === 'client' ? ' interactions-table--client' : ''
            }`}
          >
            <colgroup>
              <col className="interactions-table__col interactions-table__col--date" />
              <col className="interactions-table__col interactions-table__col--type" />
              <col className="interactions-table__col interactions-table__col--title" />
              {owner === 'supplier' ? (
                <col className="interactions-table__col interactions-table__col--contact" />
              ) : null}
              <col className="interactions-table__col interactions-table__col--status" />
              <col className="interactions-table__col interactions-table__col--responsible" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Дата и время</th>
                <th scope="col">Тип</th>
                <th scope="col">Тема</th>
                {owner === 'supplier' ? <th scope="col">Контактное лицо</th> : null}
                <th scope="col">Статус</th>
                <th scope="col">Ответственный</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((interaction) => {
                const statusKey = interactionStatusKey(interaction);
                return (
                  <tr
                    key={interaction.id}
                    className={`client-table__row${
                      interaction.status === 'cancelled' ? ' interaction-row--muted' : ''
                    }`}
                    onClick={() => openView(interaction)}
                  >
                    <td>
                      <button
                        type="button"
                        className="client-row-open"
                        aria-label={`Открыть взаимодействие «${interaction.title}»`}
                        onClick={() => openView(interaction)}
                      >
                        {formatDateTime(interaction.plannedAt ?? interaction.occurredAt)}
                      </button>
                      {interaction.rescheduleCount > 0 ? (
                        <span className="interaction-mark interaction-mark--moved">Перенесено</span>
                      ) : null}
                    </td>
                    <td>{typeLabel(interaction.type)}</td>
                    <td>
                      <span className="interaction-title">{interaction.title}</span>
                    </td>
                    {owner === 'supplier' ? <td>{interaction.supplierContactName ?? '—'}</td> : null}
                    <td>
                      <span className={`interaction-status interaction-status--${statusKey}`}>
                        {interactionStatusLabel(interaction)}
                      </span>
                      {interaction.editedAt ? <span className="interaction-mark">Изменено</span> : null}
                    </td>
                    <td>{interaction.responsibleFullName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {modal
        ? createPortal(
            <InteractionModal
              key={modal.interaction?.id ?? 'new'}
              owner={owner}
              ownerId={ownerId}
              mode={modal.mode}
              interaction={modal.interaction}
              users={users}
              contacts={owner === 'supplier' ? contacts : null}
              currentUserId={currentUserId}
              onModeChange={(mode) =>
                setModal((previous) => (previous ? { ...previous, mode } : previous))
              }
              onClose={() => setModal(null)}
              onSaved={handleSaved}
              onRefresh={reload}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

