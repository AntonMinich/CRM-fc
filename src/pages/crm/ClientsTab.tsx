import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Toast } from '../../components/Toast/Toast';
import { ClientTable } from '../../features/clients/components/ClientTable/ClientTable';
import { ClientToolbar } from '../../features/clients/components/ClientToolbar/ClientToolbar';
import { CreateClientModal } from '../../features/clients/components/CreateClientModal/CreateClientModal';
import { EditClientModal } from '../../features/clients/components/EditClientModal/EditClientModal';
import { useClients } from '../../features/clients/hooks/useClients';
import { useDebouncedValue } from '../../features/clients/hooks/useDebouncedValue';
import type { Client, ClientTab } from '../../features/clients/types';
import type { InteractionEntry, InteractionModalMode } from '../../features/interactions/types';

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
  /** Вкладка, которая открывается в карточке. */
  const [openTab, setOpenTab] = useState<ClientTab>('main');
  /** Переход из напоминания: карточка владельца и запись взаимодействия. */
  const [searchParams] = useSearchParams();
  const entryOwnerId = searchParams.get('open');
  const entryInteractionId = searchParams.get('interaction');
  const entryMode = searchParams.get('mode');
  const entry = useMemo<InteractionEntry | null>(() => {
    if (!entryOwnerId || !entryInteractionId) return null;
    const mode: InteractionModalMode =
      entryMode === 'plan' || entryMode === 'reschedule' || entryMode === 'result'
        ? entryMode
        : 'view';
    return { interactionId: entryInteractionId, mode };
  }, [entryInteractionId, entryMode, entryOwnerId]);
  const handledEntryRef = useRef<string | null>(null);

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
    setOpenTab('main');
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

  /** Переход из напоминания: карточка владельца открывается на вкладке «Взаимодействия». */
  useEffect(() => {
    if (!entry || !entryOwnerId) return;
    if (handledEntryRef.current === entry.interactionId) return;
    handledEntryRef.current = entry.interactionId;
    rowTriggerRef.current = null;
    setModalOpen(false);
    setOpenTab('interactions');
    setEditingId(entryOwnerId);
  }, [entry, entryOwnerId]);

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
    <div className="crm-view crm-view--table">
      <ClientToolbar
        search={search}
        onSearchChange={setSearch}
        onCreateClick={() => {
          setOpenTab('main');
          setModalOpen(true);
        }}
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
          key={editingId}
          clientId={editingId}
          onClose={handleCloseClient}
          onSaved={handleClientSaved}
          onNotFound={handleClientNotFound}
          onOpenDuplicate={handleSwitchClient}
          initialTab={openTab}
          entry={entry}
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
