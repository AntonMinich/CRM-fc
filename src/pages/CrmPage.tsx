import { useCallback, useEffect, useRef, useState } from 'react';

import { getSection } from '../app/navigation';
import { AppShell } from '../components/AppShell/AppShell';
import { CreateNotice } from '../features/crm/components/CreateNotice/CreateNotice';
import { CRMToolbar } from '../features/crm/components/CRMToolbar/CRMToolbar';
import { KanbanBoard } from '../features/crm/components/KanbanBoard/KanbanBoard';
import { EMPTY_COLUMN_TOTALS, KANBAN_COLUMNS } from '../features/crm/config/columns';
import type { KanbanColumn } from '../features/crm/types';
import './CrmPage.css';

/** Сколько показывается уведомление-заглушка (раздел 6 ТЗ). */
const NOTICE_TIMEOUT_MS = 3500;

/**
 * Столбцы доски: конфигурация из `config/columns.ts` плюс итоги.
 * На этом этапе всем столбцам явно передаётся числовой ноль, серверный
 * расчёт сумм не подключён.
 */
const COLUMNS: readonly KanbanColumn[] = [...KANBAN_COLUMNS]
  .sort((a, b) => a.order - b.order)
  .map((column) => ({ ...column, totals: EMPTY_COLUMN_TOTALS }));

/**
 * Раздел CRM: панель действий с кнопкой «Создать» и канбан из семи пустых
 * столбцов. Форма создания, карточки и перетаскивание появятся на следующих
 * этапах — сейчас кнопка показывает только уведомление-заглушку.
 */
export default function CrmPage() {
  const [noticeVisible, setNoticeVisible] = useState(false);
  const noticeTimer = useRef<number | null>(null);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = null;
    }
  }, []);

  /** Повторное нажатие перезапускает таймер, а не добавляет второе уведомление. */
  const handleCreate = useCallback(() => {
    clearNoticeTimer();
    setNoticeVisible(true);
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null;
      setNoticeVisible(false);
    }, NOTICE_TIMEOUT_MS);
  }, [clearNoticeTimer]);

  useEffect(() => clearNoticeTimer, [clearNoticeTimer]);

  return (
    <AppShell title={getSection('crm').title}>
      <div className="crm-workspace">
        <CRMToolbar onCreate={handleCreate} />
        <KanbanBoard columns={COLUMNS} />
        <CreateNotice visible={noticeVisible} />
      </div>
    </AppShell>
  );
}
