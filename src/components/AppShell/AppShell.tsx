import type { ReactNode } from 'react';

import { Header } from '../Header/Header';
import { Sidebar } from '../Sidebar/Sidebar';
import { WorkspaceBackground } from '../WorkspaceBackground/WorkspaceBackground';
import './AppShell.css';

interface AppShellProps {
  /** Название активного раздела для верхней панели. */
  title: string;
  /** Содержимое рабочей области. На текущем этапе пустое. */
  children?: ReactNode;
}

/** Общая оболочка приложения: боковая панель, верхняя панель и рабочая область. */
export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-shell__column">
        <Header title={title} />

        <main className="workspace">
          <WorkspaceBackground />
          {children}
        </main>
      </div>
    </div>
  );
}
