import { SECTIONS } from '../../app/navigation';
import { NavigationItem } from '../NavigationItem/NavigationItem';
import { ThemeSwitch } from '../ThemeSwitch/ThemeSwitch';
import './Sidebar.css';

const LOGO_LIGHT = '/assets/brand/fincode-logo-light.png';
const LOGO_DARK = '/assets/brand/fincode-logo-dark.png';
const LOGO_ALT = 'Fincode — лизинг, который всегда рядом';

/**
 * Боковая панель: логотип, два пункта меню и переключатель темы.
 * Оба варианта логотипа присутствуют в разметке и переключаются вместе с темой,
 * поэтому при смене темы не показывается неверный вариант и не прыгает макет.
 */
export function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar__scroll">
        <div className="sidebar__logo">
          <img
            className="sidebar__logo-image sidebar__logo-image--light"
            src={LOGO_LIGHT}
            alt={LOGO_ALT}
            width={190}
            height={76}
            decoding="async"
          />
          <img
            className="sidebar__logo-image sidebar__logo-image--dark"
            src={LOGO_DARK}
            alt=""
            aria-hidden="true"
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

      <ThemeSwitch />
    </div>
  );
}
