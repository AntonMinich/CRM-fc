import { NavLink } from 'react-router-dom';

import { CRM_TABS } from '../../config/tabs';
import './CrmTabs.css';

/**
 * Верхнее меню CRM под общей верхней панелью приложения.
 * Активная вкладка помечается aria-current="page" и бирюзовой линией.
 */
export function CrmTabs() {
  return (
    <nav className="crm-tabs" aria-label="Разделы CRM">
      {CRM_TABS.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.path}
          className={({ isActive }) => (isActive ? 'crm-tab crm-tab--active' : 'crm-tab')}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
