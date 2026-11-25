import { KanbanColumn } from '../KanbanColumn/KanbanColumn';
import type { KanbanColumn as KanbanColumnModel } from '../../types';
import './KanbanBoard.css';

interface KanbanBoardProps {
  columns: readonly KanbanColumnModel[];
}

/**
 * Доска канбана: семь столбцов в одном горизонтальном ряду.
 * При недостатке ширины прокручивается только доска. Область доски
 * фокусируема, поэтому прокрутка доступна и с клавиатуры.
 */
export function KanbanBoard({ columns }: KanbanBoardProps) {
  return (
    <div className="kanban-board" role="region" aria-label="Канбан сделок" tabIndex={0}>
      {columns.map((column) => (
        <KanbanColumn key={column.id} column={column} />
      ))}
    </div>
  );
}
