import {
  formatSupplierComment,
  formatSupplierEmail,
  formatSupplierPhone,
  formatSupplierUnp,
  supplierOpenLabel,
} from '../../utils/supplierDisplay';
import type { LoadStatus, Supplier } from '../../types';
import '../../../clients/components/ClientTable/ClientTable.css';
import './SupplierTable.css';

interface SupplierTableProps {
  status: LoadStatus;
  items: Supplier[];
  /** Активен ли поиск: отличает пустой список от отсутствия совпадений. */
  hasSearch: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  /**
   * Открытие карточки поставщика. Второй аргумент — кнопка строки: на неё
   * возвращается фокус после закрытия окна.
   */
  onOpenSupplier: (supplier: Supplier, trigger: HTMLButtonElement) => void;
}

/** Таблица поставщиков и её состояния: загрузка, пусто, нет совпадений, ошибка. */
export function SupplierTable({
  status,
  items,
  hasSearch,
  hasMore,
  loadingMore,
  onRetry,
  onLoadMore,
  onOpenSupplier,
}: SupplierTableProps) {
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
          <p className="client-table-state__text">Не удалось загрузить поставщиков</p>
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
          {hasSearch ? 'Поставщики не найдены' : 'Поставщики пока не созданы'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="client-table-wrap">
        <table className="client-table supplier-table">
          <colgroup>
            <col className="supplier-table__col supplier-table__col--name" />
            <col className="supplier-table__col supplier-table__col--unp" />
            <col className="supplier-table__col supplier-table__col--phone" />
            <col className="supplier-table__col supplier-table__col--email" />
            <col className="supplier-table__col supplier-table__col--comment" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Наименование компании</th>
              <th scope="col">УНП</th>
              <th scope="col">Телефон</th>
              <th scope="col">E-mail</th>
              <th scope="col">Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {items.map((supplier) => (
              <tr
                key={supplier.id}
                className="client-table__row"
                onClick={(event) => {
                  // Клик по любой ячейке строки открывает карточку.
                  const trigger = event.currentTarget.querySelector<HTMLButtonElement>(
                    '.client-row-open',
                  );
                  if (trigger) onOpenSupplier(supplier, trigger);
                }}
              >
                <td>
                  {/* Наименование — кнопка: строка открывается с клавиатуры. */}
                  <button
                    type="button"
                    className="client-row-open"
                    aria-label={supplierOpenLabel(supplier)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenSupplier(supplier, event.currentTarget);
                    }}
                  >
                    {supplier.name}
                  </button>
                </td>
                <td>{formatSupplierUnp(supplier)}</td>
                <td>{formatSupplierPhone(supplier)}</td>
                <td>{formatSupplierEmail(supplier)}</td>
                <td>{formatSupplierComment(supplier)}</td>
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
