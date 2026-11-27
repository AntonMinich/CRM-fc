/**
 * Счётчик просроченных взаимодействий для заголовка вкладки CRM.
 *
 * Значение обновляют раздел «Взаимодействия» (после создания, переноса,
 * результата и отмены) и опрос напоминаний. Подписчики — верхние вкладки CRM.
 */

import { useEffect, useState } from 'react';

import { fetchAllInteractions } from '../api/interactionsApi';

let overdueCount = 0;
const listeners = new Set<(value: number) => void>();

/** Записывает новое значение счётчика и уведомляет подписчиков. */
export function setInteractionsOverdue(value: number): void {
  const next = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  if (next === overdueCount) return;
  overdueCount = next;
  for (const listener of listeners) listener(next);
}

/** Текущее значение счётчика. */
export function getInteractionsOverdue(): number {
  return overdueCount;
}

/** Подписка на изменения счётчика. */
export function subscribeInteractionsOverdue(listener: (value: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Счётчик просроченных для заголовка вкладки. */
export function useInteractionsOverdue(): number {
  const [value, setValue] = useState(overdueCount);
  useEffect(() => subscribeInteractionsOverdue(setValue), []);
  return value;
}

/**
 * Обновляет счётчик запросом к общему списку: используется после действий в
 * карточке контрагента и при плановом опросе напоминаний.
 */
export async function refreshInteractionsOverdue(signal?: AbortSignal): Promise<void> {
  const page = await fetchAllInteractions(
    {
      status: 'all',
      responsible: 'all',
      mine: true,
      ownerType: 'all',
      dateFrom: '',
      dateTo: '',
      search: '',
      page: 1,
      pageSize: 1,
    },
    signal,
  );
  setInteractionsOverdue(page.overdue);
}
