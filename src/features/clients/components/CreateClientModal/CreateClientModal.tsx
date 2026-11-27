import type { FormEvent, SyntheticEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ApiError, createClient, fetchResponsibleUsers } from '../../api/clientsApi';
import type { Client, LoadStatus, ResponsibleUser } from '../../types';
import {
  EMPTY_CLIENT_FORM,
  FIELD_ORDER,
  mapServerFieldErrors,
  toCreateClientInput,
  validateClientForm,
} from '../../utils/validateClientForm';
import { ClientFormFields } from '../ClientForm/ClientFormFields';
import { DUPLICATE_PHONE_MESSAGE, useClientForm } from '../ClientForm/useClientForm';

/** Ключ идемпотентности: повтор одного запроса не создаёт вторую запись. */
function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


interface CreateClientModalProps {
  open: boolean;
  /** Закрытие окна без создания записи. */
  onClose: () => void;
  /** Успешное создание: окно закрывается, список обновляется. */
  onCreated: (client: Client) => void;
  /** Переход в карточку клиента, у которого уже есть такой телефон. */
  onOpenDuplicate: (clientId: string) => void;
}

/**
 * Модальное окно «Создание клиента» (раздел 6 ТЗ).
 * Нативный `<dialog>`: фокус остаётся внутри окна, Escape перехватывается
 * и подчиняется правилам закрытия из раздела 10.
 */
export function CreateClientModal({
  open,
  onClose,
  onCreated,
  onOpenDuplicate,
}: CreateClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const form = useClientForm(EMPTY_CLIENT_FORM);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [usersStatus, setUsersStatus] = useState<LoadStatus>('loading');
  /** У несохранённой карточки просроченных взаимодействий быть не может. */
  const handleOverdueChange = useCallback(() => undefined, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /** Пользовательские изменения: ответственный по умолчанию изменением не считается. */
  const hasChanges = useMemo(
    () =>
      // Телефон хранится цифрами национальной части, поэтому один префикс +375
      // (пустая строка) изменением не считается.
      [
        form.values.lastName,
        form.values.firstName,
        form.values.middleName,
        form.values.phone,
        form.values.email,
      ].some((value) => value.trim() !== ''),
    [form.values],
  );

  const { setValues, setErrors, setPhoneDuplicate } = form;

  const loadUsers = useCallback(
    async (signal?: AbortSignal) => {
      setUsersStatus('loading');
      try {
        const list = await fetchResponsibleUsers(signal);
        if (signal?.aborted) return;
        setUsers(list);
        setUsersStatus('ready');
        setValues((previous) =>
          previous.responsibleUserId === ''
            ? { ...previous, responsibleUserId: list[0]?.id ?? '' }
            : previous,
        );
      } catch {
        if (signal?.aborted) return;
        setUsers([]);
        setUsersStatus('error');
      }
    },
    [setValues],
  );

  // Повторное открытие: пустые поля, ответственный по умолчанию, без старых ошибок.
  // Сброс выполняется до отрисовки окна, поэтому прежние значения не мелькают
  // в полях при повторном открытии.
  useLayoutEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    form.loadValues(EMPTY_CLIENT_FORM);
    setErrors({});
    setPhoneDuplicate(null);
    setFormError(null);
    setSubmitting(false);
    idempotencyKeyRef.current = createIdempotencyKey();
    void loadUsers(controller.signal);
    const timer = window.setTimeout(() => form.refs.lastName.current?.focus(), 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, loadUsers, setErrors, setPhoneDuplicate, form.refs, form.loadValues]);

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

  /** Переход в карточку клиента с таким же телефоном. */
  const handleOpenDuplicate = useCallback(
    (clientId: string) => {
      if (hasChanges && !window.confirm('Закрыть окно без сохранения?')) return;
      onOpenDuplicate(clientId);
    },
    [hasChanges, onOpenDuplicate],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (usersStatus === 'error') {
      setFormError('Не удалось создать клиента. Попробуйте ещё раз');
      return;
    }

    const allowed = (id: string) => users.some((user) => user.id === id);
    const nextErrors = validateClientForm(form.values, allowed);
    setErrors(nextErrors);
    setFormError(null);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      form.focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createClient(
        toCreateClientInput(form.values),
        idempotencyKeyRef.current,
      );
      setSubmitting(false);
      onCreated(created);
    } catch (error) {
      setSubmitting(false);
      if (
        error instanceof ApiError &&
        error.code === 'duplicate_phone' &&
        error.duplicateClient
      ) {
        // Номер занят: сообщение под полем с переходом в карточку найденного клиента.
        setPhoneDuplicate(error.duplicateClient);
        setErrors({ phone: DUPLICATE_PHONE_MESSAGE });
        form.focusField('phone');
        return;
      }
      if (error instanceof ApiError && error.fieldErrors) {
        const mapped = mapServerFieldErrors(error.fieldErrors);
        setErrors(mapped);
        const firstField = FIELD_ORDER.find((field) => mapped[field]);
        if (firstField) form.focusField(firstField);
        return;
      }
      // Значения формы сохраняются, кнопка снова доступна.
      setFormError('Не удалось создать клиента. Попробуйте ещё раз');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="client-modal"
      aria-labelledby="create-client-title"
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

      <h2 className="client-modal__title" id="create-client-title">
        Создание клиента
      </h2>

      <form className="client-form" onSubmit={handleSubmit} noValidate>
        <ClientFormFields
          idPrefix="create-client"
          form={form}
          users={users}
          usersStatus={usersStatus}
          disabled={submitting}
          onRetryUsers={() => void loadUsers()}
          onOpenDuplicate={handleOpenDuplicate}
          interactions={{
            owner: 'client',
            ownerId: null,
            overdue: 0,
            onOverdueChange: handleOverdueChange,
            entry: null,
          }}
        />

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
          <button type="submit" className="client-button client-button--primary" disabled={submitting}>
            {submitting ? 'Сохранение…' : 'Создать'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
