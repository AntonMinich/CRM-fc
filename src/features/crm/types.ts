/** Типы канбана сделок на странице CRM. */

/** Состояние получения итога по столбцу. */
export type ColumnTotalState = 'ready' | 'loading' | 'error';

/**
 * Итог по столбцу.
 * `totalContractValueBYN` — сумма контрактной стоимости сделок в работе, BYN.
 * `null` означает «значение неизвестно» и не равен нулю.
 */
export interface ColumnTotals {
  totalContractValueBYN: number | null;
  state: ColumnTotalState;
}

/** Конфигурация столбца. Логика не привязана к названию «Столбец N». */
export interface KanbanColumnConfig {
  /** Стабильный технический идентификатор. */
  id: string;
  /** Отображаемое название. */
  title: string;
  /** Порядок в доске. */
  order: number;
  /** Цвет шапки. */
  headerColor: string;
}

/** Столбец с итогами, готовый к отображению. */
export interface KanbanColumn extends KanbanColumnConfig {
  totals: ColumnTotals;
}
