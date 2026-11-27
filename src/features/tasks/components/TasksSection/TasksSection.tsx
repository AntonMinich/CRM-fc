/**
 * Раздел «Задачи»: список и канбан задач вместе с плановыми взаимодействиями.
 *
 * Раскладка, контейнер и таблица повторяют вкладку «Взаимодействия»: те же
 * классы панели, фильтров и таблицы. Вид раздела запоминается в браузере.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Toast } from '../../../../components/Toast/Toast';
import { fetchResponsibleUsers } from '../../../clients/api/clientsApi';
import { useDebouncedValue } from '../../../clients/hooks/useDebouncedValue';
import type { ResponsibleUser } from '../../../clients/types';
import { formatDateTime } from '../../../interactions/utils/interactionDisplay';
import { fetchAgenda, fetchAgendaColumn, AGENDA_PAGE_SIZE, type AgendaFilters } from '../../api/tasksApi';
import {
  AGENDA_STATUS_LABELS,
  KANBAN_COLUMNS,
  TASK_FILTERS,
  readTasksView,
  storeTasksView,
  type TasksView,
} from '../../config/taskFields';
import type { AgendaItem, AgendaKind, TaskColumn } from '../../types';
import { InteractionOverlay, TaskCardModal } from '../TaskCardModal/TaskCardModal';
import { TaskModal } from '../TaskModal/TaskModal';
import '../../../interactions/components/InteractionsPanel/InteractionsPanel.css';
import '../../../interactions/components/InteractionsBoard/InteractionsBoard.css';
import './TasksSection.css';

/** Задержка поиска по мере ввода, как в остальных списках. */
const SEARCH_DELAY_MS = 300;

/** Пустые наборы колонок канбана. */
const EMPTY_COLUMNS: Record<TaskColumn, AgendaItem[]> = {
  today: [],
  tomorrow: [],
  week: [],
  later: [],
  done: [],
};

const EMPTY_FLAGS: Record<TaskColumn, boolean> = {
  today: false,
  tomorrow: false,
  week: false,
  later: false,
  done: false,
};

const EMPTY_COUNTS: Record<TaskColumn, number> = {
  today: 0,
  tomorrow: 0,
  week: 0,
  later: 0,
  done: 0,
};

type LoadStatus = 'loading' | 'ready' | 'error';

/** Класс бейджа статуса: цвета как у статусов взаимодействий. */
function statusClass(status: string): string {
  if (status === 'overdue') return 'overdue';
  if (status === 'done') return 'done';
  if (status === 'in_progress') return 'in_progress';
  return 'planned';
}

/** Тег типа элемента: общий для списка и карточек канбана. */
function AgendaTypeTag({ kind }: { kind: AgendaKind }) {
  return (
    <span className={`task-card__type task-card__type--${kind}`}>
      {kind === 'task' ? 'Задача' : 'Взаимодействие'}
    </span>
  );
}

export function TasksSection() {
  const [view, setView] = useState<TasksView>(readTasksView);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);
  const [status, setStatus] = useState('all');
  const [responsible, setResponsible] = useState('all');
  const [mine, setMine] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<TaskColumn, number>>(EMPTY_COUNTS);
  const [columns, setColumns] = useState<Record<TaskColumn, AgendaItem[]>>(EMPTY_COLUMNS);
  const [columnHasMore, setColumnHasMore] = useState<Record<TaskColumn, boolean>>(EMPTY_FLAGS);
  const [loadingColumn, setLoadingColumn] = useState<TaskColumn | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  /** Идентификатор задачи, открытой в карточке. */
  const [cardId, setCardId] = useState<string | null>(null);
  /** Идентификатор взаимодействия, открытого окном поверх раздела. */
  const [interactionId, setInteractionId] = useState<string | null>(null);
  /** Краткое подтверждение после создания или закрытия задачи. */
  const [toast, setToast] = useState<{ message: string; version: number } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestRef = useRef(0);

  const filters = useMemo<AgendaFilters>(
    () => ({
      search: debouncedSearch.trim(),
      status,
      responsible,
      mine,
      // Период относится к списку: в канбане поля дат не показываются.
      dateFrom: view === 'list' ? dateFrom : '',
      dateTo: view === 'list' ? dateTo : '',
      page,
      pageSize: AGENDA_PAGE_SIZE,
    }),
    [dateFrom, dateTo, debouncedSearch, mine, page, responsible, status, view],
  );

  // Поиск и фильтры возвращают список на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, debouncedSearch, mine, responsible, status]);

  // Список раздела: страница по 15 записей, поиск работает по всем записям.
  useEffect(() => {
    if (view !== 'list') return;
    const token = ++requestRef.current;
    setLoadStatus('loading');
    void fetchAgenda(filters)
      .then((result) => {
        if (token !== requestRef.current) return;
        setItems(result.items);
        setCounts(result.counts);
        setTotal(result.total);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (token === requestRef.current) setLoadStatus('error');
      });
  }, [filters, reloadToken, view]);

  // Канбан: первая порция карточек каждой колонки.
  useEffect(() => {
    if (view !== 'kanban') return;
    const controller = new AbortController();
    setLoadStatus('loading');
    void Promise.all(
      KANBAN_COLUMNS.map((column) => fetchAgendaColumn(column.id, filters, 0, controller.signal)),
    )
      .then((pages) => {
        if (controller.signal.aborted) return;
        const nextColumns = { ...EMPTY_COLUMNS };
        const nextFlags = { ...EMPTY_FLAGS };
        pages.forEach((result, index) => {
          const column = KANBAN_COLUMNS[index].id;
          nextColumns[column] = result.items;
          nextFlags[column] = result.hasMore;
        });
        setColumns(nextColumns);
        setColumnHasMore(nextFlags);
        setCounts(pages[0]?.counts ?? EMPTY_COUNTS);
        setLoadStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus('error');
      });
    return () => controller.abort();
  }, [filters, reloadToken, view]);

  /** Подгрузка следующей порции карточек колонки при прокрутке до конца. */
  const loadColumn = useCallback(
    (column: TaskColumn) => {
      if (!columnHasMore[column] || loadingColumn !== null) return;
      setLoadingColumn(column);
      void fetchAgendaColumn(column, filters, columns[column].length)
        .then((result) => {
          setColumns((previous) => ({
            ...previous,
            [column]: [...previous[column], ...result.items],
          }));
          setColumnHasMore((previous) => ({ ...previous, [column]: result.hasMore }));
          setCounts(result.counts);
        })
        .catch(() => undefined)
        .finally(() => setLoadingColumn(null));
    },
    [columnHasMore, columns, filters, loadingColumn],
  );

  // Справочник ответственных для фильтра и окна создания.
  useEffect(() => {
    const controller = new AbortController();
    void fetchResponsibleUsers(controller.signal)
      .then((list) => setUsers(list))
      .catch(() => setUsers([]));
    return () => controller.abort();
  }, []);

  /** Переключение вида: выбор запоминается в браузере. */
  const changeView = useCallback((next: TasksView) => {
    setView(next);
    storeTasksView(next);
  }, []);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /** Краткое подтверждение: новая версия перезапускает срок показа. */
  const showToast = useCallback((message: string) => {
    setToast({ message, version: Date.now() });
  }, []);

  /** Открытие элемента: задача — карточка, взаимодействие — окно поверх раздела. */
  const openItem = useCallback((item: AgendaItem) => {
    if (item.kind === 'task') {
      setCardId(item.id);
      return;
    }
    // Маршрут не меняется: после закрытия пользователь остаётся в «Задачах».
    setInteractionId(item.interactionId ?? item.id);
  }, []);

  const handleReset = useCallback(() => {
    setSearch('');
    setStatus('all');
    setResponsible('all');
    setMine(true);
    setDateFrom('');
    setDateTo('');
  }, []);

  const hasActiveFilters =
    search.trim() !== '' || status !== 'all' || responsible !== 'all' || !mine;

  /** Сколько страниц в списке: по 15 записей. */
  const pageCount = Math.max(1, Math.ceil(total / AGENDA_PAGE_SIZE));

  return (
    <div className="crm-view interactions-board tasks-section">
      <div className="interactions-board__top">
        <div className="interactions__actions">
          <button type="button" className="create-button" onClick={() => setModalOpen(true)}>
            Создать задачу
          </button>

          <div className="tasks-view" role="group" aria-label="Вид раздела">
            {(
              [
                { id: 'list', label: 'Список' },
                { id: 'kanban', label: 'Канбан' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={`tasks-view__button${
                  view === option.id ? ' tasks-view__button--active' : ''
                }`}
                aria-pressed={view === option.id}
                onClick={() => changeView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <input
          className="client-search interactions-board__search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по названию или контрагенту…"
          aria-label="Поиск по названию или контрагенту"
          autoComplete="off"
        />
      </div>

      <div className="interactions-board__filters">
        <div className="interactions__filters" role="group" aria-label="Фильтр по статусу">
          {TASK_FILTERS.map((item) => (
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

        <label className="interactions-board__field" htmlFor="tasks-responsible">
          <span className="interactions-board__label">Ответственный</span>
          <select
            id="tasks-responsible"
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

        <label className="interactions-board__check" htmlFor="tasks-mine">
          <input
            id="tasks-mine"
            type="checkbox"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />
          Только мои
        </label>

        <button
          type="button"
          className="interactions__filter interactions-board__reset"
          onClick={handleReset}
        >
          Сбросить
        </button>

        {/* Период списка: по сроку задачи и времени начала взаимодействия. */}
        {view === 'list' ? (
          <>
            <label className="interactions-board__field" htmlFor="tasks-date-from">
              <span className="interactions-board__label">Дата с</span>
              <input
                id="tasks-date-from"
                className="interactions-board__control"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>

            <label className="interactions-board__field" htmlFor="tasks-date-to">
              <span className="interactions-board__label">Дата по</span>
              <input
                id="tasks-date-to"
                className="interactions-board__control"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
          </>
        ) : null}
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
            <p className="client-table-state__text">Не удалось загрузить задачи</p>
            <button type="button" className="client-retry" onClick={reload}>
              Повторить
            </button>
          </div>
        </div>
      ) : null}

      {/* Пустое состояние только в списке: в канбане колонки показываются всегда. */}
      {view === 'list' && loadStatus === 'ready' && items.length === 0 ? (
        <div className="client-table-wrap interactions-board__wrap">
          <p className="client-table-state">
            {hasActiveFilters ? 'Задачи не найдены' : 'Задач пока нет'}
          </p>
        </div>
      ) : null}

      {loadStatus === 'ready' && items.length > 0 && view === 'list' ? (
        <div className="client-table-wrap interactions-board__wrap">
          <table className="client-table interactions-table tasks-table">
            <colgroup>
              <col className="tasks-table__col tasks-table__col--due" />
              <col className="tasks-table__col tasks-table__col--title" />
              <col className="tasks-table__col tasks-table__col--kind" />
              <col className="tasks-table__col tasks-table__col--counterparty" />
              <col className="tasks-table__col tasks-table__col--status" />
              <col className="tasks-table__col tasks-table__col--responsible" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Срок</th>
                <th scope="col">Название</th>
                <th scope="col">Тип</th>
                <th scope="col">Контрагент</th>
                <th scope="col">Статус</th>
                <th scope="col">Ответственный</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.kind}-${item.id}`} onClick={() => openItem(item)}>
                  <td>
                    {/* Кнопка нужна для открытия строки с клавиатуры. */}
                    <button type="button" className="client-row-open" onClick={() => openItem(item)}>
                      {formatDateTime(item.dueAt)}
                    </button>
                  </td>
                  <td>
                    <span className="interaction-title">{item.title}</span>
                  </td>
                  <td>
                    <AgendaTypeTag kind={item.kind} />
                  </td>
                  <td>{item.counterpartyName ?? '—'}</td>
                  <td>
                    <span
                      className={`interaction-status interaction-status--${statusClass(
                        item.statusView,
                      )}`}
                    >
                      {AGENDA_STATUS_LABELS[item.statusView] ?? ''}
                    </span>
                  </td>
                  <td>{item.responsibleFullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Панель пагинации всегда видна под таблицей списка. */}
      {view === 'list' ? (
        <div className="tasks-pagination" role="group" aria-label="Переход по страницам">
          <button
            type="button"
            className="client-more"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
          >
            Назад
          </button>
          <span className="tasks-pagination__state">
            Страница {page} из {pageCount}
          </span>
          <button
            type="button"
            className="client-more"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={page >= pageCount}
          >
            Вперёд
          </button>
        </div>
      ) : null}

      {loadStatus === 'ready' && view === 'kanban' ? (
        <div className="tasks-kanban">
          {KANBAN_COLUMNS.map((column) => (
            <section className="tasks-kanban__column" key={column.id}>
              <header className={`tasks-kanban__head tasks-kanban__head--${column.id}`}>
                <span className="tasks-kanban__title">{column.label}</span>
                {/* В шапке показывается общее число элементов колонки. */}
                <span className="tasks-kanban__count">{counts[column.id] ?? 0}</span>
              </header>

              <div
                className="tasks-kanban__body"
                onScroll={(event) => {
                  const body = event.currentTarget;
                  // Прокрутка до конца колонки подгружает следующую порцию.
                  if (body.scrollTop + body.clientHeight >= body.scrollHeight - 24) {
                    loadColumn(column.id);
                  }
                }}
              >
                {columns[column.id].length === 0 ? (
                  <p className="tasks-kanban__empty">Нет элементов</p>
                ) : (
                  columns[column.id].map((item) => (
                    /* Карточка открывается по клику и с клавиатуры: перетаскивания нет. */
                    <button
                      type="button"
                      className="task-card"
                      key={`${item.kind}-${item.id}`}
                      onClick={() => openItem(item)}
                    >
                      <AgendaTypeTag kind={item.kind} />
                      <span className="task-card__title">{item.title}</span>
                      <span className="task-card__due">{formatDateTime(item.dueAt)}</span>
                      {item.counterpartyName ? (
                        <span className="task-card__counterparty">{item.counterpartyName}</span>
                      ) : null}

                      <span className="task-card__meta">
                        <span
                          className={`interaction-status interaction-status--${statusClass(
                            item.statusView,
                          )}`}
                        >
                          {AGENDA_STATUS_LABELS[item.statusView] ?? ''}
                        </span>
                      </span>
                    </button>
                  ))
                )}

                {loadingColumn === column.id ? (
                  <p className="tasks-kanban__empty">Загрузка…</p>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          showToast('Задача создана');
          reload();
        }}
      />

      <TaskCardModal taskId={cardId} onClose={() => setCardId(null)} onChanged={reload} />

      {/* Взаимодействие открывается окном поверх раздела: без перехода на страницу. */}
      <InteractionOverlay
        interactionId={interactionId}
        onClose={() => setInteractionId(null)}
        onRefresh={reload}
        onSaved={() => {
          setInteractionId(null);
          reload();
        }}
      />

      <Toast
        visible={toast !== null}
        version={toast?.version ?? 0}
        onClose={() => setToast(null)}
      >
        {toast?.message ?? ''}
      </Toast>
    </div>
  );
}
