import {
  clientOpenLabel,
  formatClientComment,
  formatClientEmail,
  formatClientName,
  formatClientPhone,
} from '../../utils/clientDisplay';
import type { Client, LoadStatus } from '../../types';
import './ClientTable.css';

interface ClientTableProps {
  status: LoadStatus;
  items: Client[];
  /** Активен ли поиск: отличает пустой список от отсутствия совпадений. */
  hasSearch: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  /**
   * Открытие карточки клиента. Второй аргумент — кнопка строки: на неё
   * возвращается фокус после закрытия окна.
   */
  onOpenClient: (client: Client, trigger: HTMLButtonElement) => void;
}

/** Таблица клиентов и её состояния: загрузка, пусто, нет совпадений, ошибка. */
export function ClientTable({
  status,
  items,
  hasSearch,
  hasMore,
  loadingMore,
  onRetry,
  onLoadMore,
  onOpenClient,
}: ClientTableProps) {
  if (status === 'loading') {
    return (
      <div className="client-table-wrap">
        <p className="client-table-state">
          <span className="client-spinner" aria-hidden="true" />
          Загрузка…
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="client-table-wrap">
        <div className="client-table-state client-table-state--error">
          <p className="client-table-state__text">Не удалось загрузить клиентов</p>
          <button type="button" className="client-retry" onClick={onRetry}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="client-table-wrap">
        <p className="client-table-state">
          {hasSearch ? 'Клиенты не найдены' : 'Клиенты пока не созданы'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="client-table-wrap">
        <table className="client-table">
          <colgroup>
            <col className="client-table__col client-table__col--client" />
            <col className="client-table__col client-table__col--phone" />
            <col className="client-table__col client-table__col--email" />
            <col className="client-table__col client-table__col--responsible" />
            <col className="client-table__col client-table__col--comment" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Клиент</th>
              <th scope="col">Телефон</th>
              <th scope="col">E-mail</th>
              <th scope="col">Ответственный</th>
              <th scope="col">Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {items.map((client) => (
              <tr
                key={client.id}
                className="client-table__row"
                onClick={(event) => {
                  // Клик по любой ячейке строки открывает карточку.
                  const trigger = event.currentTarget.querySelector<HTMLButtonElement>(
                    '.client-row-open',
                  );
                  if (trigger) onOpenClient(client, trigger);
                }}
              >
                <td>
                  {/* ФИО — кнопка: строка открывается с клавиатуры по Enter и Space. */}
                  <button
                    type="button"
                    className="client-row-open"
                    aria-label={clientOpenLabel(client)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenClient(client, event.currentTarget);
                    }}
                  >
                    {formatClientName(client)}
                  </button>
                </td>
                <td>{formatClientPhone(client)}</td>
                <td>{formatClientEmail(client)}</td>
                <td>{client.responsibleFullName}</td>
                <td>{formatClientComment(client)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div className="client-table-more">
          <button
            type="button"
            className="client-more"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      ) : null}
    </>
  );
}
