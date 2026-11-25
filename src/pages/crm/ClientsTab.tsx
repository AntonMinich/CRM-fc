import { useCallback, useEffect, useRef, useState } from 'react';

import { Toast } from '../../components/Toast/Toast';
import { ClientTable } from '../../features/clients/components/ClientTable/ClientTable';
import { ClientToolbar } from '../../features/clients/components/ClientToolbar/ClientToolbar';
import { CreateClientModal } from '../../features/clients/components/CreateClientModal/CreateClientModal';
import { useClients } from '../../features/clients/hooks/useClients';
import { useDebouncedValue } from '../../features/clients/hooks/useDebouncedValue';

/** Сколько показывается уведомление об успешном создании. */
const TOAST_TIMEOUT_MS = 3500;

/** Задержка поиска по мере ввода (раздел 5 ТЗ). */
const SEARCH_DELAY_MS = 300;

/**
 * Вкладка «Клиенты»: панель действий с кнопкой и поиском, таблица из базы,
 * модальное окно создания.
 */
export function ClientsTab() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);
  const { status, items, hasMore, loadingMore, reload, loadMore } = useClients(debouncedSearch);

  const [modalOpen, setModalOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const toastTimer = useRef<number | null>(null);
  const wasModalOpen = useRef(false);

  // Фокус возвращается на кнопку открытия после закрытия окна.
  useEffect(() => {
    if (wasModalOpen.current && !modalOpen) {
      createButtonRef.current?.focus();
    }
    wasModalOpen.current = modalOpen;
  }, [modalOpen]);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    },
    [],
  );

  const showCreatedToast = useCallback(() => {
    setToastVisible(true);
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToastVisible(false);
    }, TOAST_TIMEOUT_MS);
  }, []);

  /** Уведомление показывается только после подтверждённого сохранения в базе. */
  const handleCreated = useCallback(() => {
    setModalOpen(false);
    setSearch('');
    showCreatedToast();
    // Поиск очищен, список перезагружается с первой страницы: новый клиент сверху.
    reload('');
  }, [reload, showCreatedToast]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <div className="crm-view">
      <ClientToolbar
        search={search}
        onSearchChange={setSearch}
        onCreateClick={() => setModalOpen(true)}
        createButtonRef={createButtonRef}
      />

      <ClientTable
        status={status}
        items={items}
        hasSearch={debouncedSearch.trim() !== ''}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onRetry={() => reload(debouncedSearch)}
        onLoadMore={loadMore}
      />

      <CreateClientModal open={modalOpen} onClose={handleCloseModal} onCreated={handleCreated} />

      <Toast visible={toastVisible}>Клиент создан</Toast>
    </div>
  );
}
