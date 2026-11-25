import './Header.css';

interface HeaderProps {
  /** Название активного раздела. */
  title: string;
}

/** Верхняя панель: название раздела, подпись рабочего пространства и аватар-заглушка. */
export function Header({ title }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__heading">
        <h1 className="header__title">{title}</h1>
        <span className="header__divider" aria-hidden="true" />
        <span className="header__subtitle">Рабочее пространство</span>
      </div>

      <div className="header__avatar" aria-hidden="true">
        АМ
      </div>
    </header>
  );
}
