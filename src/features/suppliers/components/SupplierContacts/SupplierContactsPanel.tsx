/**
 * Вкладка «Контактные лица» карточки поставщика: кнопка добавления и таблица.
 * Оформление берётся из клиентских классов, поэтому стили совпадают с списками.
 */

import { formatClientName } from '../../../clients/utils/clientDisplay';
import { formatPhoneForDisplay } from '../../../clients/utils/phone';
import type { LoadStatus, SupplierContact } from '../../types';
import '../../../clients/components/ClientTable/ClientTable.css';
import '../../../crm/components/CreateButton/CreateButton.css';
import './SupplierContactsPanel.css';

interface SupplierContactsPanelProps {
  /** null — поставщик ещё не создан: контакты добавить нельзя. */
  supplierId: string | null;
  status: LoadStatus;
  items: SupplierContact[];
  onAdd: () => void;
  /** Клик по строке открывает окно контакта. */
  onOpen: (contact: SupplierContact) => void;
  onRetry: () => void;
}

/** Порядок строк: основной, затем работающие, затем неработающие. */
function contactRank(contact: SupplierContact): number {
  if (contact.isPrimary) return 0;
  return contact.status === 'active' ? 1 : 2;
}

/** Сортировка внутри группы — по значению колонки «Клиент». */
function sortContacts(items: SupplierContact[]): SupplierContact[] {
  return [...items].sort((left, right) => {
    const byRank = contactRank(left) - contactRank(right);
    if (byRank !== 0) return byRank;
    return formatClientName(left).localeCompare(formatClientName(right), 'ru');
  });
}

/** Доступное имя кнопки строки: «Открыть контактное лицо Иванов Иван». */
function contactOpenLabel(contact: SupplierContact): string {
  const name = formatClientName(contact);
  return name === '' ? 'Открыть контактное лицо' : `Открыть контактное лицо ${name}`;
}

export function SupplierContactsPanel({
  supplierId,
  status,
  items,
  onAdd,
  onOpen,
  onRetry,
}: SupplierContactsPanelProps) {
  // У несохранённого поставщика контактов быть не может.
  if (supplierId === null) {
    return (
      <p className="supplier-contacts__hint">
        Сохраните поставщика, чтобы добавлять контактных лиц
      </p>
    );
  }

  return (
    <div className="supplier-contacts">
      <div className="supplier-contacts__top">
        <button type="button" className="create-button" onClick={onAdd}>
          Добавить
        </button>
      </div>

      {status === 'loading' ? (
        <div className="client-table-wrap supplier-contacts__wrap">
          <p className="client-table-state">
            <span className="client-spinner" aria-hidden="true" />
            Загрузка…
          </p>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="client-table-wrap supplier-contacts__wrap">
          <div className="client-table-state client-table-state--error">
            <p className="client-table-state__text">Не удалось загрузить контактных лиц</p>
            <button type="button" className="client-retry" onClick={onRetry}>
              Повторить
            </button>
          </div>
        </div>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <div className="client-table-wrap supplier-contacts__wrap">
          <p className="client-table-state">Контактных лиц пока нет</p>
        </div>
      ) : null}

      {status === 'ready' && items.length > 0 ? (
        <div className="client-table-wrap supplier-contacts__wrap">
          <table className="client-table supplier-contacts-table">
            <colgroup>
              <col className="supplier-contacts-table__col supplier-contacts-table__col--position" />
              <col className="supplier-contacts-table__col supplier-contacts-table__col--name" />
              <col className="supplier-contacts-table__col supplier-contacts-table__col--phone" />
              <col className="supplier-contacts-table__col supplier-contacts-table__col--status" />
              <col className="supplier-contacts-table__col supplier-contacts-table__col--primary" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Должность</th>
                <th scope="col">Клиент</th>
                <th scope="col">Телефон</th>
                <th scope="col">Статус</th>
                <th scope="col">Основной</th>
              </tr>
            </thead>
            <tbody>
              {sortContacts(items).map((contact) => (
                <tr
                  key={contact.id}
                  className={`client-table__row${
                    contact.status === 'inactive' ? ' supplier-contact-row--inactive' : ''
                  }`}
                  onClick={() => onOpen(contact)}
                >
                  <td>
                    {/* Должность — кнопка: строка открывается и с клавиатуры. */}
                    <button
                      type="button"
                      className="client-row-open"
                      aria-label={contactOpenLabel(contact)}
                      onClick={() => onOpen(contact)}
                    >
                      {contact.position}
                    </button>
                  </td>
                  <td>{formatClientName(contact)}</td>
                  <td>{formatPhoneForDisplay(contact.phone)}</td>
                  <td>
                    <span
                      className={`supplier-contact-status supplier-contact-status--${contact.status}`}
                    >
                      {contact.status === 'active' ? 'Работает' : 'Не работает'}
                    </span>
                  </td>
                  <td>{contact.isPrimary ? 'Да' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
