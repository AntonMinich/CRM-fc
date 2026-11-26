import { useCallback, useEffect, useRef, useState } from 'react';

import { Toast } from '../../components/Toast/Toast';
import { useDebouncedValue } from '../../features/clients/hooks/useDebouncedValue';
import { SupplierModal } from '../../features/suppliers/components/SupplierModal/SupplierModal';
import { SupplierTable } from '../../features/suppliers/components/SupplierTable/SupplierTable';
import { SupplierToolbar } from '../../features/suppliers/components/SupplierToolbar/SupplierToolbar';
import { useSuppliers } from '../../features/suppliers/hooks/useSuppliers';
import type { DuplicatePhoneWarning, Supplier } from '../../features/suppliers/types';

/** Задержка поиска по мере ввода. */
const SEARCH_DELAY_MS = 300;

interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

/**
 * Вкладка «Поставщики»: панель действий с кнопкой и поиском, таблица из базы
 * и окно создания и редактирования поставщика.
 */
export function SuppliersTab() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);
  const { status, items, hasMore, loadingMore, reload, loadMore } = useSuppliers(debouncedSearch);

  /** Создание: окно открыто без выбранного поставщика. */
  const [createOpen, setCreateOpen] = useState(false);
  /** Идентификатор поставщика, карточка которого открыта; null — окно закрыто. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVersion, setToastVersion] = useState(0);
  /** Предупреждение о дубле телефона: показывается в окне поставщика. */
  const [warning, setWarning] = useState<DuplicatePhoneWarning | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  /** Кнопка строки, из которой открыли карточку: на неё возвращается фокус. */
  const rowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasCreateOpen = useRef(false);
  const wasEditing = useRef(false);

  // Фокус возвращается на кнопку открытия после закрытия окна создания.
  useEffect(() => {
    if (wasCreateOpen.current && !createOpen) {
      createButtonRef.current?.focus();
    }
    wasCreateOpen.current = createOpen;
  }, [createOpen]);

  // После закрытия карточки фокус возвращается на кнопку строки поставщика.
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
    setCreateOpen(false);
    setSearch('');
    showToast('Поставщик создан');
    // Поиск очищен, список перезагружается с первой страницы: новая запись сверху.
    reload('');
  }, [reload, showToast]);

  const handleCloseModal = useCallback(() => {
    setCreateOpen(false);
    setEditingId(null);
    setWarning(null);
  }, []);

  /** Клик по строке: открывает карточку и запоминает кнопку для возврата фокуса. */
  const handleOpenSupplier = useCallback((supplier: Supplier, trigger: HTMLButtonElement) => {
    rowTriggerRef.current = trigger;
    setCreateOpen(false);
    setEditingId(supplier.id);
  }, []);

  /**
   * Сохранение карточки: поиск не сбрасывается, строка остаётся на своём месте.
   * Если поставщик перестал подходить под запрос, он исчезает из выдачи.
   */
  const handleSaved = useCallback(() => {
    setEditingId(null);
    setWarning(null);
    showToast('Изменения сохранены');
    reload();
  }, [reload, showToast]);

  /**
   * Сохранение с предупреждением о дубле телефона: запись сохранена, список
   * обновляется, окно остаётся открытым. В режиме создания окно переключается на
   * сохранённую карточку, чтобы повторное сохранение не создавало вторую запись.
   */
  const handleSavedWithWarning = useCallback(
    (supplier: Supplier) => {
      setWarning(supplier.duplicatePhoneWith ?? null);
      setCreateOpen(false);
      setEditingId(supplier.id);
      reload();
    },
    [reload],
  );

  /** Крестик в предупреждении о дубле телефона. */
  const dismissWarning = useCallback(() => {
    setWarning(null);
  }, []);

  /** Поставщик удалён или недоступен: окно закрывается, список перезагружается. */
  const handleNotFound = useCallback(() => {
    setEditingId(null);
    setWarning(null);
    showToast('Поставщик не найден', 'error');
    reload();
  }, [reload, showToast]);

  /** Переход в карточку поставщика с таким же УНП: окно остаётся тем же. */
  const handleOpenDuplicate = useCallback((supplierId: string) => {
    setCreateOpen(false);
    setWarning(null);
    setEditingId(supplierId);
  }, []);

  return (
    <div className="crm-view">
      <SupplierToolbar
        search={search}
        onSearchChange={setSearch}
        onCreateClick={() => {
          setEditingId(null);
          setCreateOpen(true);
        }}
        createButtonRef={createButtonRef}
      />

      <SupplierTable
        status={status}
        items={items}
        hasSearch={debouncedSearch.trim() !== ''}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onRetry={() => reload(debouncedSearch)}
        onLoadMore={loadMore}
        onOpenSupplier={handleOpenSupplier}
      />

      {createOpen || editingId !== null ? (
        <SupplierModal
          key={editingId ?? 'create'}
          supplierId={editingId}
          initialWarning={warning}
          onDismissWarning={dismissWarning}
          onClose={handleCloseModal}
          onCreated={handleCreated}
          onSaved={handleSaved}
          onSavedWithWarning={handleSavedWithWarning}
          onNotFound={handleNotFound}
          onOpenDuplicate={handleOpenDuplicate}
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
