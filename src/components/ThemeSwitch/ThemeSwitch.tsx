import { useTheme } from '../../theme/ThemeContext';
import './ThemeSwitch.css';

/**
 * Переключатель светлой и тёмной темы.
 * Выключен — светлая тема, включён — тёмная. Кликабельна вся строка.
 */
export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="theme-switch">
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        className="theme-switch__row"
        onClick={toggleTheme}
      >
        <span className="theme-switch__label">Тёмная тема</span>
        <span className="theme-switch__track" aria-hidden="true">
          <span className="theme-switch__thumb" />
        </span>
      </button>
    </div>
  );
}
