/**
 * Вкладка CRM «Взаимодействия»: общая таблица клиентов и поставщиков.
 *
 * Фильтры, поиск и пагинация выполняются на сервере. Окна планирования,
 * переноса и результата — те же, что в карточке контрагента: в режиме создания
 * первым полем добавляется «Контрагент».
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchClients, fetchResponsibleUsers } from '../../../clients/api/clientsApi';
import { useDebouncedValue } from '../../../clients/hooks/useDebouncedValue';
import type { ResponsibleUser } from '../../../clients/types';
import { fetchSupplierContacts, fetchSuppliers } from '../../../suppliers/api/suppliersApi';
import type { SupplierContact } from '../../../suppliers/types';
import { fetchAllInteractions } from '../../api/interactionsApi';
import { FILTERS, typeLabel } from '../../config/interactionFields';
import { setInteractionsOverdue } from '../../store/interactionsBadge';
import type {
  Interaction,
  InteractionFilter,
  InteractionModalMode,
  InteractionOwner,
  InteractionOwnerFilter,
} from '../../types';
import {
  counterpartyCardHref,
  counterpartyOf,
  counterpartyTypeLabel,
  formatDateTime,
  interactionStatusKey,
  interactionStatusLabel,
} from '../../utils/interactionDisplay';
import { InteractionModal } from '../InteractionModal/InteractionModal';
import '../InteractionsPanel/InteractionsPanel.css';
import './InteractionsBoard.css';

/** Задержка поиска по мере ввода, как в списке клиентов. */
const SEARCH_DELAY_MS = 300;

/** Объём страницы: как в списке клиентов. */
const PAGE_SIZE = 50;

/** Сколько вариантов контрагента показывать в выпадающем списке. */
const PICKER_LIMIT = 8;

type BoardStatus = 'loading' | 'ready' | 'error';

interface Counterparty {
  type: InteractionOwner;
  id: string;
  name: string;
}

interface ModalState {
  mode: InteractionModalMode;
  interaction: Interaction | null;
}

export function InteractionsBoard() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<InteractionFilter>('all');
  const [responsible, setResponsible] = useState('all');
  const [ownerType, setOwnerType] = useState<InteractionOwnerFilter>('all');
  /** «Только мои» включён по умолчанию; выбор не сохраняется между сеансами. */
  const [mine, setMine] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);

  const [loadStatus, setLoadStatus] = useState<BoardStatus>('loading');
  const [items, setItems] = useState<Interaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Поле «Контрагент» в окне создания.
  const [counterpartyType, setCounterpartyType] = useState<InteractionOwner>('client');
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);
  const [counterpartyError, setCounterpartyError] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const debouncedPickerQuery = useDebouncedValue(pickerQuery, SEARCH_DELAY_MS);
  const [pickerOptions, setPickerOptions] = useState<{ id: string; name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);

  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const currentUserId = users[0]?.id ?? '';
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /** Загрузка страницы: append — догрузка по кнопке «Показать ещё». */
  const load = useCallback(
    async (page: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoadStatus('loading');

      try {
        const result = await fetchAllInteractions(
          {
            status,
            responsible,
            mine,
            ownerType,
            dateFrom,
            dateTo,
            search: debouncedSearch,
            page,
            pageSize: PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        pageRef.current = result.page;
        hasMoreRef.current = result.hasMore;
        setItems((previous) => (append ? [...previous, ...result.items] : result.items));
        setHasMore(result.hasMore);
        setLoadStatus('ready');
        setLoadingMore(false);
        // Счётчик просроченных для заголовка вкладки CRM.
        setInteractionsOverdue(result.overdue);
      } catch {
        if (controller.signal.aborted) return;
        setLoadingMore(false);
        if (append) return;
        setItems([]);
        setLoadStatus('error');
      }
    },
    [dateFrom, dateTo, debouncedSearch, mine, ownerType, responsible, status],
  );

  // Список перезагружается при смене фильтров, поиска и после действий в окне.
  useEffect(() => {
    void load(1, false);
    return () => abortRef.current?.abort();
  }, [load, reloadToken]);


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

  // Поиск контрагента: используются существующие списки клиентов и поставщиков.
  useEffect(() => {
    if (!modal || modal.interaction !== null || !pickerOpen || debouncedPickerQuery.trim() === '') {
      setPickerOptions([]);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        if (counterpartyType === 'client') {
          const page = await fetchClients(
            { search: debouncedPickerQuery, page: 1, pageSize: PICKER_LIMIT },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setPickerOptions(
            page.items.map((client) => ({
              id: client.id,
              name: [client.lastName, client.firstName, client.middleName]
                .filter(Boolean)
                .join(' '),
            })),
          );
          return;
        }
        const page = await fetchSuppliers(
          { search: debouncedPickerQuery, page: 1, pageSize: PICKER_LIMIT },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setPickerOptions(page.items.map((supplier) => ({ id: supplier.id, name: supplier.name })));
      } catch {
        if (!controller.signal.aborted) setPickerOptions([]);
      }
    })();
    return () => controller.abort();
  }, [counterpartyType, debouncedPickerQuery, modal, pickerOpen]);

  // Контакты выбранного поставщика: нужны полю «Контактное лицо».
  useEffect(() => {
    if (!modal || counterparty?.type !== 'supplier') {
      setContacts([]);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const page = await fetchSupplierContacts(counterparty.id, controller.signal);
        if (!controller.signal.aborted) setContacts(page.items);
      } catch {
        if (!controller.signal.aborted) setContacts([]);
      }
    })();
    return () => controller.abort();
  }, [counterparty, modal, reloadToken]);

  const hasActiveFilters = useMemo(
    () =>
      status !== 'all' ||
      responsible !== 'all' ||
      ownerType !== 'all' ||
      !mine ||
      dateFrom !== '' ||
      dateTo !== '' ||
      search.trim() !== '',
    [dateFrom, dateTo, mine, ownerType, responsible, search, status],
  );

  /** Сброс фильтров к значениям по умолчанию. */
  const handleReset = () => {
    setStatus('all');
    setResponsible('all');
    setOwnerType('all');
    setMine(true);
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

  const openCreate = (mode: InteractionModalMode) => {
    setCounterparty(null);
    setCounterpartyType('client');
    setPickerQuery('');
    setPickerOptions([]);
    setPickerOpen(false);
    setCounterpartyError(null);
    setModal({ mode, interaction: null });
  };

  const openView = (interaction: Interaction) => setModal({ mode: 'view', interaction });

  /** После действий в окне список и счётчик обновляются. */
  const handleSaved = () => {
    setModal(null);
    reload();
  };

  const selectCounterparty = (option: { id: string; name: string }) => {
    setCounterparty({ type: counterpartyType, id: option.id, name: option.name });
    setPickerQuery(option.name);
    setPickerOpen(false);
    setCounterpartyError(null);
  };

  /** Смена контрагента сбрасывает выбранное контактное лицо. */
  const handleCounterpartyTypeChange = (value: InteractionOwner) => {
    setCounterpartyType(value);
    setCounterparty(null);
    setPickerQuery('');
    setPickerOptions([]);
    setCounterpartyError(null);
  };

  /** Проверка перед отправкой: в общем разделе контрагент обязателен. */
  const beforeSubmit = () => {
    if (modal?.interaction) return true;
    if (!counterparty) {
      setCounterpartyError('Выберите контрагента');
      return false;
    }
    return true;
  };

  /** Владелец записи: у существующей — из записи, у новой — выбранный. */
  const owner: InteractionOwner = modal?.interaction
    ? counterpartyOf(modal.interaction).type
    : (counterparty?.type ?? counterpartyType);
  const ownerId = modal?.interaction
    ? counterpartyOf(modal.interaction).id
    : (counterparty?.id ?? '');
  const contactResetKey = counterparty ? `${counterparty.type}:${counterparty.id}` : 'none';


  /** Поле «Контрагент»: у существующей записи только для просмотра. */
  const counterpartyField = modal ? (
    <div className="interaction-counterparty">
      {modal.interaction ? (
        <div className="client-field">
          <span className="client-field__label">Контрагент</span>
          <span className="interaction-counterparty__value">
            {counterpartyOf(modal.interaction).name}
            <span className="interaction-counterparty__tag">
              {counterpartyTypeLabel(counterpartyOf(modal.interaction).type)}
            </span>
          </span>
          <button
            type="button"
            className="interaction-link"
            onClick={() => navigate(counterpartyCardHref(modal.interaction as Interaction))}
          >
            Открыть карточку
          </button>
        </div>
      ) : (
        <>
          <label
            className="client-field interaction-field--span-4"
            htmlFor="interaction-counterparty-type"
          >
            <span className="client-field__label">
              Контрагент <span className="client-field__required">*</span>
            </span>
            <select
              id="interaction-counterparty-type"
              className="client-field__input"
              value={counterpartyType}
              onChange={(event) =>
                handleCounterpartyTypeChange(event.target.value as InteractionOwner)
              }
            >
              <option value="client">Клиент</option>
              <option value="supplier">Поставщик</option>
            </select>
          </label>

          <label
            className="client-field interaction-field--span-8"
            htmlFor="interaction-counterparty-search"
          >
            <span className="client-field__label">
              {counterpartyType === 'client' ? 'ФИО клиента' : 'Наименование поставщика'}
            </span>
            <input
              id="interaction-counterparty-search"
              className="client-field__input"
              value={pickerQuery}
              onChange={(event) => {
                setPickerQuery(event.target.value);
                setCounterparty(null);
                setPickerOpen(true);
              }}
              placeholder="Начните вводить для поиска"
              autoComplete="off"
              aria-invalid={Boolean(counterpartyError)}
            />
          </label>

          {pickerOpen && pickerOptions.length > 0 ? (
            <ul className="interaction-counterparty__options" role="listbox">
              {pickerOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={counterparty?.id === option.id}
                    className="interaction-counterparty__option"
                    onClick={() => selectCounterparty(option)}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {counterpartyError ? (
            <span className="client-field__error">{counterpartyError}</span>
          ) : null}
        </>
      )}
    </div>
  ) : null;


  return (
    <div className="crm-view interactions-board">
      <div className="interactions-board__top">
        <div className="interactions__actions">
          <button type="button" className="create-button" onClick={() => openCreate('plan')}>
            Запланировать
          </button>
          <button type="button" className="create-button" onClick={() => openCreate('result')}>
            Зафиксировать результат
          </button>
        </div>
        <input
          className="client-search interactions-board__search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по теме или контрагенту…"
          aria-label="Поиск по теме или контрагенту"
          autoComplete="off"
        />
      </div>

      <div className="interactions-board__filters">
        <div className="interactions__filters" role="group" aria-label="Фильтр по статусу">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`interactions__filter${
                status === item.value ? ' interactions__filter--active' : ''
              }`}
              aria-pressed={status === item.value}
              onClick={() => setStatus(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="interactions-board__field" htmlFor="board-responsible">
          <span className="interactions-board__label">Ответственный</span>
          <select
            id="board-responsible"
            className="interactions-board__control"
            value={responsible}
            onChange={(event) => setResponsible(event.target.value)}
            disabled={mine}
          >
            <option value="all">Все</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="interactions-board__field" htmlFor="board-owner-type">
          <span className="interactions-board__label">Контрагент</span>
          <select
            id="board-owner-type"
            className="interactions-board__control"
            value={ownerType}
            onChange={(event) => setOwnerType(event.target.value as InteractionOwnerFilter)}
          >
            <option value="all">Все</option>
            <option value="client">Клиенты</option>
            <option value="supplier">Поставщики</option>
          </select>
        </label>

        <label className="interactions-board__check" htmlFor="board-mine">
          <input
            id="board-mine"
            type="checkbox"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />
          Только мои
        </label>

        <label className="interactions-board__field" htmlFor="board-date-from">
          <span className="interactions-board__label">Дата с</span>
          <input
            id="board-date-from"
            className="interactions-board__control"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>

        <label className="interactions-board__field" htmlFor="board-date-to">
          <span className="interactions-board__label">Дата по</span>
          <input
            id="board-date-to"
            className="interactions-board__control"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="interactions__filter interactions-board__reset"
          onClick={handleReset}
        >
          Сбросить
        </button>
      </div>


      {loadStatus === 'loading' ? (
        <div className="client-table-wrap interactions-board__wrap">
          <p className="client-table-state">
            <span className="client-spinner" aria-hidden="true" />
            Загрузка…
          </p>
        </div>
      ) : null}

      {loadStatus === 'error' ? (
        <div className="client-table-wrap interactions-board__wrap">
          <div className="client-table-state client-table-state--error">
            <p className="client-table-state__text">Не удалось загрузить взаимодействия</p>
            <button type="button" className="client-retry" onClick={reload}>
              Повторить
            </button>
          </div>
        </div>
      ) : null}

      {loadStatus === 'ready' && items.length === 0 ? (
        <div className="client-table-wrap interactions-board__wrap">
          <p className="client-table-state">
            {hasActiveFilters ? 'Взаимодействия не найдены' : 'Взаимодействий пока нет'}
          </p>
        </div>
      ) : null}

      {loadStatus === 'ready' && items.length > 0 ? (
        <>
          <div className="client-table-wrap interactions-board__wrap">
            <table className="client-table interactions-table interactions-table--board">
              <colgroup>
                <col className="interactions-table__col interactions-table__col--date" />
                <col className="interactions-table__col interactions-table__col--type" />
                <col className="interactions-table__col interactions-table__col--title" />
                <col className="interactions-table__col interactions-table__col--counterparty" />
                <col className="interactions-table__col interactions-table__col--contact" />
                <col className="interactions-table__col interactions-table__col--status" />
                <col className="interactions-table__col interactions-table__col--responsible" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Дата и время</th>
                  <th scope="col">Тип</th>
                  <th scope="col">Тема</th>
                  <th scope="col">Контрагент</th>
                  <th scope="col">Контактное лицо</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Ответственный</th>
                </tr>
              </thead>
              <tbody>
                {items.map((interaction) => {
                  const statusKey = interactionStatusKey(interaction);
                  const counterpartyInfo = counterpartyOf(interaction);
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
                          <span className="interaction-mark interaction-mark--moved">
                            Перенесено
                          </span>
                        ) : null}
                      </td>
                      <td>{typeLabel(interaction.type)}</td>
                      <td>
                        <span className="interaction-title">{interaction.title}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="interaction-counterparty__link"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(counterpartyCardHref(interaction));
                          }}
                        >
                          {counterpartyInfo.name}
                        </button>
                        <span className="interaction-counterparty__tag">
                          {counterpartyTypeLabel(counterpartyInfo.type)}
                        </span>
                      </td>
                      <td>{interaction.supplierContactName ?? '—'}</td>
                      <td>
                        <span className={`interaction-status interaction-status--${statusKey}`}>
                          {interactionStatusLabel(interaction)}
                        </span>
                        {interaction.editedAt ? (
                          <span className="interaction-mark">Изменено</span>
                        ) : null}
                      </td>
                      <td>{interaction.responsibleFullName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className="client-table-more">
              <button
                type="button"
                className="client-more"
                onClick={() => void load(pageRef.current + 1, true)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Загрузка…' : 'Показать ещё'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}


      {modal ? (
        <InteractionModal
          key={modal.interaction?.id ?? 'new'}
          owner={owner}
          ownerId={ownerId}
          mode={modal.mode}
          interaction={modal.interaction}
          users={users}
          contacts={owner === 'supplier' ? contacts : null}
          currentUserId={currentUserId}
          counterpartyField={counterpartyField}
          beforeSubmit={beforeSubmit}
          contactResetKey={contactResetKey}
          onModeChange={(mode) =>
            setModal((previous) => (previous ? { ...previous, mode } : previous))
          }
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onRefresh={() => reload()}
        />
      ) : null}
    </div>
  );
}

