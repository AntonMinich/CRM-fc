/** Верхнее меню CRM: вкладки «Сделки», «Клиенты», «Поставщики». */

export type CrmTabId = 'deals' | 'clients' | 'suppliers';

export interface CrmTab {
  id: CrmTabId;
  /** Маршрут вкладки. */
  path: string;
  /** Подпись вкладки. */
  label: string;
}

export const CRM_TABS: readonly CrmTab[] = [
  { id: 'deals', path: '/crm/deals', label: 'Сделки' },
  { id: 'clients', path: '/crm/clients', label: 'Клиенты' },
  { id: 'suppliers', path: '/crm/suppliers', label: 'Поставщики' },
];

/** Вкладка, открытая при входе в CRM. */
export const DEFAULT_CRM_TAB_PATH = '/crm/deals';
