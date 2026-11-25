import { ColumnBody } from '../ColumnBody/ColumnBody';
import { ColumnHeader } from '../ColumnHeader/ColumnHeader';
import type { KanbanColumn as KanbanColumnModel } from '../../types';
import './KanbanColumn.css';

interface KanbanColumnProps {
  column: KanbanColumnModel;
}

/** Столбец канбана: цветная шапка и пустое тело. */
export function KanbanColumn({ column }: KanbanColumnProps) {
  return (
    <div className="kanban-column" data-column-id={column.id}>
      <ColumnHeader column={column} />
      <ColumnBody />
    </div>
  );
}
