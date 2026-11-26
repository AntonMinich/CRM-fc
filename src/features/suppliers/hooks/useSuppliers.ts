import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchSuppliers } from '../api/suppliersApi';
import type { LoadStatus, Supplier } from '../types';

/** Объём страницы по умолчанию. */
export const SUPPLIERS_PAGE_SIZE = 50;

interface SuppliersState {
  status: LoadStatus;
  items: Supplier[];
  total: number;
  hasMore: boolean;
  page: number;
  loadingMore: boolean;
}

const INITIAL_STATE: SuppliersState = {
  status: 'loading',
  items: [],
  total: 0,
  hasMore: false,
  page: 1,
  loadingMore: false,
};

/** Загрузка списка поставщиков с поиском по наименованию и догрузкой страниц. */
export function useSuppliers(search: string) {
  const [state, setState] = useState<SuppliersState>(INITIAL_STATE);
  const searchRef = useRef(search);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const load = useCallback(
    async (page: number, options: { search: string; append: boolean }) => {
      // Предыдущий запрос отменяется: запоздавший ответ не заменит новый результат.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((previous) =>
        options.append
          ? { ...previous, loadingMore: true }
          : { ...INITIAL_STATE, status: 'loading' },
      );

      try {
        const result = await fetchSuppliers(
          { search: options.search, page, pageSize: SUPPLIERS_PAGE_SIZE },
          controller.signal,
        );
        pageRef.current = result.page;
        hasMoreRef.current = result.hasMore;
        setState((previous) => ({
          status: 'ready',
          items: options.append ? [...previous.items, ...result.items] : result.items,
          total: result.total,
          hasMore: result.hasMore,
          page: result.page,
          loadingMore: false,
        }));
      } catch {
        if (controller.signal.aborted) return;
        setState((previous) =>
          options.append ? { ...previous, loadingMore: false } : { ...INITIAL_STATE, status: 'error' },
        );
      }
    },
    [],
  );

  useEffect(() => {
    void load(1, { search, append: false });
    return () => abortRef.current?.abort();
  }, [load, search]);

  /** Повторная загрузка с первой страницы; поиск можно задать явно. */
  const reload = useCallback(
    (searchOverride?: string) => {
      void load(1, { search: searchOverride ?? searchRef.current, append: false });
    },
    [load],
  );

  /** Догрузка следующей страницы с сохранением поиска. */
  const loadMore = useCallback(() => {
    if (!hasMoreRef.current) return;
    void load(pageRef.current + 1, { search: searchRef.current, append: true });
  }, [load]);

  return {
    status: state.status,
    items: state.items,
    total: state.total,
    hasMore: state.hasMore,
    loadingMore: state.loadingMore,
    reload,
    loadMore,
  };
}
