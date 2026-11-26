import type { RefObject } from 'react';

import { CreateButton } from '../../../crm/components/CreateButton/CreateButton';
import '../../../clients/components/ClientToolbar/ClientToolbar.css';

interface SupplierToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateClick: () => void;
  createButtonRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * Панель действий вкладки «Поставщики»: кнопка «Создать» слева и поиск справа.
 * Поиск выполняется по мере ввода, без отдельной кнопки.
 */
export function SupplierToolbar({
  search,
  onSearchChange,
  onCreateClick,
  createButtonRef,
}: SupplierToolbarProps) {
  return (
    <div className="client-toolbar">
      <CreateButton onClick={onCreateClick} buttonRef={createButtonRef} />
      <input
        className="client-search"
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Поиск по наименованию, УНП или телефону"
        aria-label="Поиск по наименованию, УНП или телефону"
        autoComplete="off"
      />
    </div>
  );
}
