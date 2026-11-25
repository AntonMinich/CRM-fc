import { ColumnTitle } from '../ColumnTitle/ColumnTitle';
import { ContractValueTotal } from '../ContractValueTotal/ContractValueTotal';
import type { KanbanColumn as KanbanColumnModel } from '../../types';
import './ColumnHeader.css';

interface ColumnHeaderProps {
  column: KanbanColumnModel;
}

/**
 * Шапка столбца: название и сумма контрактной стоимости сделок в работе —
 * двумя строками, обе выровнены по левому краю.
 */
export function ColumnHeader({ column }: ColumnHeaderProps) {
  return (
    <div className="column-header" style={{ backgroundColor: column.headerColor }}>
      <ColumnTitle>{column.title}</ColumnTitle>
      <ContractValueTotal totals={column.totals} />
    </div>
  );
}
