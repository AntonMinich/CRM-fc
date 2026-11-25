import { formatMoney } from '../../utils/formatMoney';
import type { ColumnTotals } from '../../types';
import './ContractValueTotal.css';

interface ContractValueTotalProps {
  totals: ColumnTotals;
}

/**
 * Денежный показатель столбца: сумма контрактной стоимости сделок в работе.
 * Это не количество карточек. Отсутствие значения не показывается как ноль.
 */
export function ContractValueTotal({ totals }: ContractValueTotalProps) {
  if (totals.state === 'loading') {
    return <span className="contract-value contract-value--pending">Загрузка…</span>;
  }

  if (totals.state === 'error') {
    return (
      <span className="contract-value contract-value--pending">Не удалось загрузить</span>
    );
  }

  if (totals.totalContractValueBYN === null) {
    return <span className="contract-value contract-value--pending">—</span>;
  }

  return <span className="contract-value">{formatMoney(totals.totalContractValueBYN)}</span>;
}
