import type { ColumnTotals, KanbanColumnConfig } from '../types';

/**
 * Конфигурация столбцов канбана: ровно семь, порядок фиксирован.
 *
 * `headerColor` — цвета последнего макета. Пять из них немного затемнены
 * (множитель 0.90–0.98, оттенок сохранён), чтобы белый текст шапки давал
 * контраст не ниже 4.6:1: #317FA3 -> #307CA0, #258E88 -> #22827C,
 * #498C57 -> #448250, #A17C29 -> #917025, #B56943 -> #AA633F.
 */
export const KANBAN_COLUMNS: readonly KanbanColumnConfig[] = [
  { id: 'column-1', title: 'Столбец 1', order: 1, headerColor: '#3459BD' },
  { id: 'column-2', title: 'Столбец 2', order: 2, headerColor: '#307CA0' },
  { id: 'column-3', title: 'Столбец 3', order: 3, headerColor: '#22827C' },
  { id: 'column-4', title: 'Столбец 4', order: 4, headerColor: '#448250' },
  { id: 'column-5', title: 'Столбец 5', order: 5, headerColor: '#917025' },
  { id: 'column-6', title: 'Столбец 6', order: 6, headerColor: '#AA633F' },
  { id: 'column-7', title: 'Столбец 7', order: 7, headerColor: '#8E5FA6' },
];

/**
 * Итоги пустого столбца: явный числовой ноль, а не отсутствие данных.
 * Серверный расчёт сумм на этом этапе не подключён.
 */
export const EMPTY_COLUMN_TOTALS: ColumnTotals = {
  totalContractValueBYN: 0,
  state: 'ready',
};
