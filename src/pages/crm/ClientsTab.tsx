import { useCallback, useEffect, useRef, useState } from 'react';

import { Toast } from '../../components/Toast/Toast';
import { ClientTable } from '../../features/clients/components/ClientTable/ClientTable';
import { ClientToolbar } from '../../features/clients/components/ClientToolbar/ClientToolbar';
import { CreateClientModal } from '../../features/clients/components/CreateClientModal/CreateClientModal';
import { EditClientModal } from '../../features/clients/components/EditClientModal/EditClientModal';
import { useClients } from '../../features/clients/hooks/useClients';
import { useDebouncedValue } from '../../features/clients/hooks/useDebouncedValue';
import type { Client } from '../../features/clients/types';

/** Задержка поиска по мере ввода (раздел 5 ТЗ). */
const SEARCH_DELAY_MS = 300;

interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

/**
 * Вкладка «Клиенты»: панель действий с кнопкой и поиском, таблица из базы,
 * окно создания и карточка клиента.
 */
export function ClientsTab() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);
  const { status, items, hasMore, loadingMore, reload, loadMore } = useClients(debouncedSearch);

  const [modalOpen, setModalOpen] = useState(false);
  /** Идентификатор клиента, карточка которого открыта; null — окно закрыто. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVersion, setToastVersion] = useState(0);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  /** Кнопка строки, из которой открыли карточку: на неё возвращается фокус. */
  const rowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasModalOpen = useRef(false);
  const wasEditing = useRef(false);

  // Фокус возвращается на кнопку открытия после закрытия окна создания.
  useEffect(() => {
    if (wasModalOpen.current && !modalOpen) {
      createButtonRef.current?.focus();
    }
    wasModalOpen.current = modalOpen;
  }, [modalOpen]);

  // После закрытия карточки фокус возвращается на кнопку строки клиента.
  useEffect(() => {
    if (wasEditing.current && editingId === null) {
      const trigger = rowTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
      rowTriggerRef.current = null;
    }
    wasEditing.current = editingId !== null;
  }, [editingId]);

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'success') => {
    // Новая версия перезапускает срок показа, не создавая второе уведомление.
    setToast({ message, tone });
    setToastVersion((version) => version + 1);
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  /** Уведомление показывается только после подтверждённого сохранения в базе. */
  const handleCreated = useCallback(() => {
    setModalOpen(false);
    setSearch('');
    showToast('Клиент создан');
    // Поиск очищен, список перезагружается с первой страницы: новый клиент сверху.
    reload('');
  }, [reload, showToast]);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  /** Клик по строке: открывает карточку и запоминает кнопку для возврата фокуса. */
  const handleOpenClient = useCallback((client: Client, trigger: HTMLButtonElement) => {
    rowTriggerRef.current = trigger;
    setEditingId(client.id);
  }, []);

  const handleCloseClient = useCallback(() => {
    setEditingId(null);
  }, []);

  /**
   * Переход в карточку клиента с таким же телефоном: окно создания закрывается,
   * открывается карточка найденного клиента.
   */
  const handleOpenDuplicateFromCreate = useCallback((clientId: string) => {
    setModalOpen(false);
    setEditingId(clientId);
  }, []);

  /** Переключение открытой карточки на найденного клиента: окно остаётся тем же. */
  const handleSwitchClient = useCallback((clientId: string) => {
    setEditingId(clientId);
  }, []);

  /**
   * Сохранение карточки: поиск не сбрасывается, строка остаётся на своём месте.
   * Если клиент перестал подходить под запрос, он исчезает из выдачи.
   */
  const handleClientSaved = useCallback(() => {
    setEditingId(null);
    showToast('Изменения сохранены');
    reload();
  }, [reload, showToast]);

  /** Клиент удалён или недоступен: окно закрывается, список перезагружается. */
  const handleClientNotFound = useCallback(() => {
    setEditingId(null);
    showToast('Клиент не найден', 'error');
    reload();
  }, [reload, showToast]);

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
        onOpenClient={handleOpenClient}
      />

      <CreateClientModal
        open={modalOpen}
        onClose={handleCloseModal}
        onCreated={handleCreated}
        onOpenDuplicate={handleOpenDuplicateFromCreate}
      />

      {editingId !== null ? (
        <EditClientModal
          clientId={editingId}
          onClose={handleCloseClient}
          onSaved={handleClientSaved}
          onNotFound={handleClientNotFound}
          onOpenDuplicate={handleSwitchClient}
        />
      ) : null}

      <Toast
        visible={toast !== null}
        version={toastVersion}
        tone={toast?.tone ?? 'success'}
        onClose={hideToast}
      >
        {toast?.message ?? ''}
      </Toast>
    </div>
  );
}
