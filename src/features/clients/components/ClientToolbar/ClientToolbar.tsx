import type { RefObject } from 'react';

import { CreateButton } from '../../../crm/components/CreateButton/CreateButton';
import './ClientToolbar.css';

interface ClientToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateClick: () => void;
  createButtonRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * Панель действий вкладки «Клиенты»: кнопка «Создать» слева и поиск справа.
 * Поиск выполняется по мере ввода, без отдельной кнопки.
 */
export function ClientToolbar({
  search,
  onSearchChange,
  onCreateClick,
  createButtonRef,
}: ClientToolbarProps) {
  return (
    <div className="client-toolbar">
      <CreateButton onClick={onCreateClick} buttonRef={createButtonRef} />
      <input
        className="client-search"
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Поиск по наименованию клиента…"
        aria-label="Поиск по ФИО клиента"
        autoComplete="off"
      />
    </div>
  );
}
