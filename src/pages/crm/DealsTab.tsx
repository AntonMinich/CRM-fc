import { useCallback, useEffect, useRef, useState } from 'react';

import { CreateNotice } from '../../features/crm/components/CreateNotice/CreateNotice';
import { CRMToolbar } from '../../features/crm/components/CRMToolbar/CRMToolbar';
import { KanbanBoard } from '../../features/crm/components/KanbanBoard/KanbanBoard';
import { EMPTY_COLUMN_TOTALS, KANBAN_COLUMNS } from '../../features/crm/config/columns';
import type { KanbanColumn } from '../../features/crm/types';

/** Сколько показывается уведомление-заглушка (раздел 6 ТЗ на канбан). */
const NOTICE_TIMEOUT_MS = 3500;

/**
 * Столбцы доски: конфигурация из `config/columns.ts` плюс итоги.
 * Расчёт сумм не подключён, всем столбцам явно передаётся числовой ноль.
 */
const COLUMNS: readonly KanbanColumn[] = [...KANBAN_COLUMNS]
  .sort((a, b) => a.order - b.order)
  .map((column) => ({ ...column, totals: EMPTY_COLUMN_TOTALS }));

/**
 * Вкладка «Сделки»: прежняя панель действий с кнопкой «Создать» и канбан
 * без изменения согласованного поведения.
 */
export function DealsTab() {
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
    <div className="crm-view">
      <CRMToolbar onCreate={handleCreate} />
      <KanbanBoard columns={COLUMNS} />
      <CreateNotice visible={noticeVisible} />
    </div>
  );
}
