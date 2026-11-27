/**
 * Окно поставщика: одно для создания и редактирования (разделы 1 и 2 ТЗ).
 * Ширина, кнопки, вкладки, подтверждения и переходы — как в окне клиента.
 */

import { Fragment } from 'react';
import type { FormEvent, SyntheticEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  SupplierApiError,
  createSupplier,
  fetchSupplier,
  fetchSupplierContacts,
  updateSupplier,
} from '../../api/suppliersApi';
import type {
  DuplicatePhoneWarning,
  LoadStatus,
  Supplier,
  SupplierContact,
  SupplierTab,
} from '../../types';
import {
  DUPLICATE_UNP_MESSAGE,
  EMPTY_SUPPLIER_FORM,
  FIELD_ORDER,
  mapServerFieldErrors,
  toCreateSupplierInput,
  toSupplierFormValues,
  toUpdateSupplierInput,
  validateSupplierForm,
} from '../../utils/validateSupplierForm';
import { SupplierFormFields } from '../SupplierForm/SupplierFormFields';
import { useSupplierForm } from '../SupplierForm/useSupplierForm';
import { SupplierContactModal } from '../SupplierContactModal/SupplierContactModal';
import type { InteractionEntry } from '../../../interactions/types';
import '../../../clients/components/ClientForm/ClientForm.css';
import './SupplierModal.css';

/** Сообщение о конфликте одновременного редактирования. */
const CONFLICT_MESSAGE = 'Карточка была изменена другим пользователем. Обновите данные.';

/** Ошибка получения карточки. */
const LOAD_ERROR_MESSAGE = 'Не удалось загрузить поставщика';

/** Общая ошибка сохранения и создания. */
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить изменения. Попробуйте ещё раз';
const CREATE_ERROR_MESSAGE = 'Не удалось создать поставщика. Попробуйте ещё раз';

/** Ключ идемпотентности: повтор того же запроса не применяет изменение дважды. */
function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `supplier-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface SupplierModalProps {
  /** null — создание нового поставщика, иначе карточка существующего. */
  supplierId: string | null;
  /** Предупреждение из ответа сохранения: восстанавливается при переоткрытии окна. */
  initialWarning: DuplicatePhoneWarning | null;
  /** Закрытие предупреждения крестиком. */
  onDismissWarning: () => void;
  /** Закрытие окна без сохранения (фокус возвращает список). */
  onClose: () => void;
  /** Успешное создание: окно закрывается, список обновляется. */
  onCreated: (supplier: Supplier) => void;
  /** Успешное сохранение: окно закрывается, список обновляется. */
  onSaved: (supplier: Supplier) => void;
  /** Сохранение с предупреждением: список обновляется, окно остаётся открытым. */
  onSavedWithWarning: (supplier: Supplier) => void;
  /** Поставщик удалён или недоступен: окно закрывается, список перезагружается. */
  onNotFound: () => void;
  /** Переход в карточку поставщика с таким же УНП. */
  onOpenDuplicate: (supplierId: string) => void;
  /** Вкладка, которая открывается после загрузки карточки. */
  initialTab?: SupplierTab;
  /** Переход в карточку другого поставщика на вкладке «Контактные лица». */
  onOpenSupplierContacts: (supplierId: string) => void;
  /** Переход из напоминания: открыть взаимодействие в нужном режиме. */
  entry?: InteractionEntry | null;
}

export function SupplierModal({
  supplierId,
  initialWarning,
  onDismissWarning,
  onClose,
  onCreated,
  onSaved,
  onSavedWithWarning,
  onNotFound,
  onOpenDuplicate,
  initialTab = 'main',
  onOpenSupplierContacts,
  entry = null,
}: SupplierModalProps) {
  const isCreate = supplierId === null;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const form = useSupplierForm(EMPTY_SUPPLIER_FORM, {
    excludeSupplierId: supplierId,
    initialPhoneWarning: initialWarning,
  });
  const { setValues, setErrors, setUnpDuplicate } = form;
  /** Предупреждение о дубле телефона: живая проверка при вводе и ответ сохранения. */
  const warning = form.phoneWarning;
  /** Значения при открытии карточки: с ними сравниваются правки. */
  const originalRef = useRef(form.values);
  /** `updated_at` при открытии: сервер сравнивает его для защиты от чужих правок. */
  const expectedUpdatedAtRef = useRef('');

  const [phase, setPhase] = useState<LoadStatus>(isCreate ? 'ready' : 'loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  /** Контакты поставщика: количество показывается в заголовке вкладки. */
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  /** Число просроченных взаимодействий: показывается в заголовке вкладки. */
  const [overdue, setOverdue] = useState(0);
  const [contactsStatus, setContactsStatus] = useState<LoadStatus>(isCreate ? 'ready' : 'loading');
  const [contactsToken, setContactsToken] = useState(0);
  /** Открытое окно контакта: null — закрыто, contact: null — создание. */
  const [contactModal, setContactModal] = useState<{ contact: SupplierContact | null } | null>(
    null,
  );

  // Окно открыто сразу при монтировании.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Создание: пустая форма, фокус на наименовании компании.
  useLayoutEffect(() => {
    if (!isCreate) return;
    form.loadValues(EMPTY_SUPPLIER_FORM);
    setErrors({});
    setUnpDuplicate(null);
    setFormError(null);
    setSubmitting(false);
    idempotencyKeyRef.current = createIdempotencyKey();
    const timer = window.setTimeout(() => form.refs.name.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isCreate, setErrors, setUnpDuplicate, form.refs, form.loadValues]);

  // Карточка: загрузка значений; повтор — кнопкой «Повторить» (reloadToken).
  useEffect(() => {
    if (isCreate) return;
    const controller = new AbortController();
    setPhase('loading');
    setFormError(null);
    setConflict(false);

    void (async () => {
      try {
        const supplier = await fetchSupplier(supplierId, controller.signal);
        if (controller.signal.aborted) return;
        const values = toSupplierFormValues(supplier);
        originalRef.current = values;
        expectedUpdatedAtRef.current = supplier.updatedAt;
        idempotencyKeyRef.current = createIdempotencyKey();
        form.loadValues(values);
        if (initialTab !== 'main') form.setActiveTab(initialTab);
        setErrors({});
        setUnpDuplicate(null);
        setPhase('ready');
        window.setTimeout(() => form.refs.name.current?.focus(), 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof SupplierApiError && error.status === 404) {
          onNotFound();
          return;
        }
        setPhase('error');
      }
    })();

    return () => controller.abort();
  }, [
    isCreate,
    supplierId,
    onNotFound,
    reloadToken,
    initialTab,
    setErrors,
    setUnpDuplicate,
    form.refs,
    form.loadValues,
    form.setActiveTab,
  ]);

  // Контакты загружаются для сохранённого поставщика; повтор — после сохранения контакта.
  useEffect(() => {
    if (isCreate) {
      setContacts([]);
      setContactsStatus('ready');
      return;
    }

    const controller = new AbortController();
    setContactsStatus('loading');
    void (async () => {
      try {
        const list = await fetchSupplierContacts(supplierId, controller.signal);
        if (controller.signal.aborted) return;
        setContacts(list.items);
        setContactsStatus('ready');
      } catch {
        if (controller.signal.aborted) return;
        setContacts([]);
        setContactsStatus('error');
      }
    })();

    return () => controller.abort();
  }, [isCreate, supplierId, contactsToken]);

  const reloadContacts = useCallback(() => {
    setContactsToken((token) => token + 1);
  }, []);

  /** Контакт сохранён: список и количество обновляются, окно закрывается. */
  const handleContactSaved = useCallback(() => {
    setContactModal(null);
    reloadContacts();
  }, [reloadContacts]);

  /** Ссылка на контакт с таким же телефоном: открывается его карточка. */
  const handleOpenContactById = useCallback(
    (contactId: string) => {
      const found = contacts.find((item) => item.id === contactId);
      if (!found) {
        reloadContacts();
        return;
      }
      setContactModal({ contact: found });
    },
    [contacts, reloadContacts],
  );

  /** Ссылка на поставщика: окно контакта закрывается, карточка переключается. */
  const handleOpenSupplierContacts = useCallback(
    (nextSupplierId: string) => {
      setContactModal(null);
      onOpenSupplierContacts(nextSupplierId);
    },
    [onOpenSupplierContacts],
  );

  const hasChanges = useMemo(
    () => FIELD_ORDER.some((field) => form.values[field] !== originalRef.current[field]),
    [form.values],
  );

  const requestClose = useCallback(() => {
    // Во время отправки закрытие заблокировано, чтобы не создавать неоднозначное состояние.
    if (submitting) return;
    if (hasChanges && !window.confirm('Закрыть окно без сохранения?')) return;
    onClose();
  }, [hasChanges, onClose, submitting]);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    requestClose();
  };

  /** Переход в карточку поставщика с таким же телефоном: окно остаётся тем же. */
  const handleOpenDuplicate = useCallback(
    (nextSupplierId: string) => {
      if (hasChanges && !window.confirm('Закрыть окно без сохранения?')) return;
      onOpenDuplicate(nextSupplierId);
    },
    [hasChanges, onOpenDuplicate],
  );

  /** «Обновить» при конфликте и «Повторить» при ошибке загрузки. */
  const reloadFromServer = useCallback(() => {
    if (submitting) return;
    setReloadToken((token) => token + 1);
  }, [submitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    // В карточке без изменений окно закрывается без запроса к серверу.
    if (!isCreate && !hasChanges) {
      onClose();
      return;
    }

    setFormError(null);
    setConflict(false);

    const nextErrors = validateSupplierForm(form.values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      form.focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    try {
      if (isCreate) {
        const created = await createSupplier(
          toCreateSupplierInput(form.values),
          idempotencyKeyRef.current,
        );
        setSubmitting(false);
        // Дубль телефона не блокирует создание: окно остаётся открытым с предупреждением.
        if (created.duplicatePhoneWith) {
          form.setPhoneWarning(created.duplicatePhoneWith);
          onSavedWithWarning(created);
          return;
        }
        onCreated(created);
        return;
      }

      const updated = await updateSupplier(
        supplierId,
        toUpdateSupplierInput(form.values, expectedUpdatedAtRef.current),
        idempotencyKeyRef.current,
      );
      setSubmitting(false);
      if (updated.duplicatePhoneWith) {
        // Запись сохранена: значения становятся исходными, окно остаётся открытым.
        const savedValues = toSupplierFormValues(updated);
        originalRef.current = savedValues;
        expectedUpdatedAtRef.current = updated.updatedAt;
        setValues(savedValues);
        setUnpDuplicate(null);
        form.setPhoneWarning(updated.duplicatePhoneWith);
        idempotencyKeyRef.current = createIdempotencyKey();
        onSavedWithWarning(updated);
        return;
      }
      onSaved(updated);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof SupplierApiError) {
        if (error.code === 'duplicate_unp' && error.duplicateSupplier) {
          // УНП занят: сообщение под полем с переходом в карточку найденного поставщика.
          setUnpDuplicate(error.duplicateSupplier);
          setErrors({ unp: DUPLICATE_UNP_MESSAGE });
          form.focusField('unp');
          return;
        }
        if (error.status === 404) {
          onNotFound();
          return;
        }
        if (!isCreate && error.status === 409) {
          // Запись изменил другой пользователь: подгружаем актуальные значения.
          setConflict(true);
          return;
        }
        if (error.fieldErrors) {
          const mapped = mapServerFieldErrors(error.fieldErrors);
          setErrors(mapped);
          const firstField = FIELD_ORDER.find((field) => mapped[field]);
          if (firstField) form.focusField(firstField);
          return;
        }
      }
      // Значения формы сохраняются, кнопка снова доступна.
      setFormError(isCreate ? CREATE_ERROR_MESSAGE : SAVE_ERROR_MESSAGE);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="client-modal client-modal--supplier"
      aria-labelledby="supplier-modal-title"
      onCancel={handleCancel}
    >
      <button
        type="button"
        className="client-modal__close"
        aria-label="Закрыть"
        onClick={requestClose}
        disabled={submitting}
      >
        ×
      </button>

      <h2 className="client-modal__title" id="supplier-modal-title">
        {isCreate ? 'Создание поставщика' : 'Карточка поставщика'}
      </h2>

      {phase === 'loading' ? (
        <p className="client-modal__state">
          <span className="client-spinner" aria-hidden="true" />
          Загрузка…
        </p>
      ) : null}

      {phase === 'error' ? (
        <div className="client-modal__state client-modal__state--error">
          <p className="client-modal__state-text" role="alert">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button type="button" className="client-retry" onClick={reloadFromServer}>
            Повторить
          </button>
        </div>
      ) : null}

      {phase === 'ready' ? (
        <form className="client-form client-form--supplier" onSubmit={handleSubmit} noValidate>
          <SupplierFormFields
            idPrefix={isCreate ? 'create-supplier' : 'edit-supplier'}
            form={form}
            disabled={submitting}
            onOpenDuplicate={handleOpenDuplicate}
            contacts={{
              supplierId: isCreate ? null : supplierId,
              status: contactsStatus,
              items: contacts,
              onAdd: () => setContactModal({ contact: null }),
              onOpen: (contact: SupplierContact) => setContactModal({ contact }),
              onRetry: reloadContacts,
            }}
            interactions={{
              owner: 'supplier',
              ownerId: isCreate ? null : supplierId,
              overdue,
              onOverdueChange: setOverdue,
              entry: entry ?? null,
            }}
          />

          <p className="client-form__hint">* — обязательные поля</p>

          {warning ? (
            <div className="supplier-warning" role="status">
              <span className="supplier-warning__icon" aria-hidden="true">
                !
              </span>
              <span className="supplier-warning__text">
                {warning.total > 1
                  ? 'Поставщики с таким телефоном уже есть: '
                  : 'Поставщик с таким телефоном уже есть: '}
                {warning.items.map((item, index) => (
                  <Fragment key={item.id}>
                    {index > 0 ? ', ' : ''}
                    <button
                      type="button"
                      className="client-field__link"
                      onClick={() => handleOpenDuplicate(item.id)}
                    >
                      {item.name}
                    </button>
                  </Fragment>
                ))}
                {warning.total > warning.items.length
                  ? ` и ещё ${warning.total - warning.items.length}`
                  : null}
              </span>
              <button
                type="button"
                className="supplier-warning__close"
                aria-label="Закрыть предупреждение"
                onClick={() => {
                  form.dismissPhoneWarning();
                  onDismissWarning();
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          {conflict ? (
            <div className="client-form__conflict" role="alert">
              <span>{CONFLICT_MESSAGE}</span>
              <button
                type="button"
                className="client-field__retry"
                onClick={reloadFromServer}
                disabled={submitting}
              >
                Обновить
              </button>
            </div>
          ) : null}

          {formError ? (
            <p className="client-form__error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="client-form__actions">
            <button
              type="button"
              className="client-button client-button--secondary"
              onClick={requestClose}
              disabled={submitting}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="client-button client-button--primary"
              disabled={submitting}
            >
              {submitting ? 'Сохранение…' : isCreate ? 'Создать' : 'Сохранить'}
            </button>
          </div>
        </form>
      ) : null}

      {/* Окно контакта — сосед формы: вложенные формы недопустимы. */}
      {phase === 'ready' && !isCreate && contactModal ? (
        <SupplierContactModal
          key={contactModal.contact?.id ?? 'new'}
          supplierId={supplierId ?? ''}
          contact={contactModal.contact}
          onOpenContact={handleOpenContactById}
          onOpenSupplierContacts={handleOpenSupplierContacts}
          onClose={() => setContactModal(null)}
          onSaved={handleContactSaved}
        />
      ) : null}
    </dialog>
  );
}
