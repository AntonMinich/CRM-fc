import { NotificationsBell } from './NotificationsBell';
import './Header.css';

interface HeaderProps {
  /** Название активного раздела. */
  title: string;
}

/** Верхняя панель: название раздела, колокольчик уведомлений и аватар-заглушка. */
export function Header({ title }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__heading">
        <h1 className="header__title">{title}</h1>
      </div>

      <div className="header__tools">
        <NotificationsBell />

        <div className="header__avatar" aria-hidden="true">
          АМ
        </div>
      </div>
    </header>
  );
}
