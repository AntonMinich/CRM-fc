/** Тема оболочки: значения, ключ хранилища и работа с DOM. */

export type Theme = 'light' | 'dark';

/** Ключ и значения совпадают с инлайн-скриптом в index.html. */
export const THEME_STORAGE_KEY = 'fincode-theme';

/** Пока пользователь не выбирал тему, открывается светлая. */
export const DEFAULT_THEME: Theme = 'light';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Чтение выбранной темы. При недоступном localStorage возвращается светлая. */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Сохранение выбора. Ошибка хранилища не прерывает работу интерфейса. */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* сохранение между сеансами в этом случае не гарантируется */
  }
}

/** Общий атрибут темы на <html>: все компоненты читают единые CSS-переменные. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}
