import { NavLink } from 'react-router-dom';

import type { Section } from '../../app/navigation';
import { CrmIcon } from '../icons/CrmIcon';
import { ServiceDeskIcon } from '../icons/ServiceDeskIcon';
import './NavigationItem.css';

const ICONS = {
  crm: CrmIcon,
  'service-desk': ServiceDeskIcon,
} as const;

interface NavigationItemProps {
  section: Section;
}

/** Пункт основного меню. NavLink сам проставляет aria-current="page" активному. */
export function NavigationItem({ section }: NavigationItemProps) {
  const Icon = ICONS[section.id];

  return (
    <NavLink
      to={section.path}
      className={({ isActive }) =>
        isActive ? 'nav-item nav-item--active' : 'nav-item'
      }
    >
      <span className="nav-item__icon">
        <Icon />
      </span>
      <span className="nav-item__label">{section.label}</span>
    </NavLink>
  );
}
