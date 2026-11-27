import { NavLink } from 'react-router-dom';

import { CRM_TABS } from '../../config/tabs';
import { useInteractionsOverdue } from '../../../interactions/store/interactionsBadge';
import './CrmTabs.css';

/**
 * Верхнее меню CRM под общей верхней панелью приложения.
 * Активная вкладка помечается aria-current="page" и бирюзовой линией.
 * У вкладки «Взаимодействия» показывается число просроченных текущего
 * пользователя, если оно больше нуля.
 */
export function CrmTabs() {
  const overdue = useInteractionsOverdue();

  return (
    <nav className="crm-tabs" aria-label="Разделы CRM">
      {CRM_TABS.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.path}
          className={({ isActive }) => (isActive ? 'crm-tab crm-tab--active' : 'crm-tab')}
        >
          {tab.id === 'interactions' ? (
            <>
              {tab.label}
              {overdue > 0 ? <span className="crm-tab__count"> ({overdue})</span> : null}
            </>
          ) : (
            tab.label
          )}
        </NavLink>
      ))}
    </nav>
  );
}
