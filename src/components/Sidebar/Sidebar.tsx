import { SECTIONS } from '../../app/navigation';
import { NavigationItem } from '../NavigationItem/NavigationItem';
import './Sidebar.css';

const LOGO = '/assets/brand/fincode-logo-dark.png';
const LOGO_ALT = 'Fincode — лизинг, который всегда рядом';

/**
 * Боковая панель: логотип и два пункта меню.
 * Интерфейс оформлен в единственной (тёмной) теме, поэтому используется
 * только тёмный вариант логотипа.
 */
export function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar__scroll">
        <div className="sidebar__logo">
          <img
            className="sidebar__logo-image"
            src={LOGO}
            alt={LOGO_ALT}
            width={190}
            height={76}
            decoding="async"
          />
        </div>

        <nav className="sidebar__nav" aria-label="Основные разделы">
          <ul className="sidebar__nav-list">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <NavigationItem section={section} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
