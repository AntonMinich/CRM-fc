/**
 * Карточка клиента (раздел 4 ТЗ на редактирование).
 *
 * Открывается по клику на строку списка, повторяет вид окна создания: те же поля
 * в том же порядке. Отдельного режима «только просмотр» нет — поля сразу
 * доступны для правки. Изменения сохраняются в ту же запись таблицы «Клиенты».
 */

import type { FormEvent, SyntheticEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, fetchClient, fetchResponsibleUsers, updateClient } from '../../api/clientsApi';
import type { Client, LoadStatus, ResponsibleUser } from '../../types';
import {
  EMPTY_CLIENT_FORM,
  FIELD_ORDER,
  mapServerFieldErrors,
  toClientFormValues,
  toUpdateClientInput,
  validateClientForm,
} from '../../utils/validateClientForm';
import { ClientFormFields } from '../ClientForm/ClientFormFields';
import { DUPLICATE_PHONE_MESSAGE, useClientForm } from '../ClientForm/useClientForm';

/** Сообщение о конфликте одновременного редактирования. */
const CONFLICT_MESSAGE = 'Карточка была изменена другим пользователем. Обновите данные.';

/** Ошибка получения карточки (раздел 4 ТЗ). */
const LOAD_ERROR_MESSAGE = 'Не удалось загрузить клиента';

/** Общая ошибка сохранения (раздел 8 ТЗ). */
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить изменения. Попробуйте ещё раз';

/** Ключ идемпотентности: повтор того же запроса не применяет изменение дважды. */
function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-update-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface EditClientModalProps {
  clientId: string;
  /** Закрытие окна без сохранения (фокус возвращает список). */
  onClose: () => void;
  /** Успешное сохранение: окно закрывается, список обновляется. */
  onSaved: (client: Client) => void;
  /** Клиент удалён или недоступен: окно закрывается, список перезагружается. */
  onNotFound: () => void;
  /** Переход в карточку клиента, у которого уже есть такой телефон. */
  onOpenDuplicate: (clientId: string) => void;
}

export function EditClientModal({
  clientId,
  onClose,
  onSaved,
  onNotFound,
  onOpenDuplicate,
}: EditClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const form = useClientForm(EMPTY_CLIENT_FORM, { excludeClientId: clientId });
  const { refs, setErrors, setPhoneDuplicate } = form;
  /** Значения при открытии карточки: с ними сравниваются правки. */
  const originalRef = useRef(form.values);
  /** `updated_at` при открытии: сервер сравнивает его для защиты от чужих правок. */
  const expectedUpdatedAtRef = useRef('');

  const [phase, setPhase] = useState<LoadStatus>('loading');
  const [reloadToken, setReloadToken] = useState(0);
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [usersStatus, setUsersStatus] = useState<LoadStatus>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // Карточка открыта сразу при монтировании окна.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setUsersStatus('loading');
    try {
      const list = await fetchResponsibleUsers(signal);
      if (signal?.aborted) return;
      setUsers(list);
      setUsersStatus('ready');
    } catch {
      if (signal?.aborted) return;
      setUsers([]);
      setUsersStatus('error');
    }
  }, []);

  // Загрузка карточки; повтор — кнопкой «Повторить» (reloadToken).
  useEffect(() => {
    const controller = new AbortController();
    setPhase('loading');
    setFormError(null);
    setConflict(false);
    void loadUsers(controller.signal);

    void (async () => {
      try {
        const client = await fetchClient(clientId, controller.signal);
        if (controller.signal.aborted) return;
        const values = toClientFormValues(client);
        originalRef.current = values;
        expectedUpdatedAtRef.current = client.updatedAt;
        idempotencyKeyRef.current = createIdempotencyKey();
        form.loadValues(values);
        setErrors({});
        setPhoneDuplicate(null);
        setPhase('ready');
        window.setTimeout(() => refs.firstName.current?.focus(), 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          onNotFound();
          return;
        }
        setPhase('error');
      }
    })();

    return () => controller.abort();
  }, [clientId, loadUsers, onNotFound, refs, reloadToken, setErrors, setPhoneDuplicate, form.loadValues]);

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

  /** Переход в карточку клиента с таким же телефоном: окно остаётся тем же. */
  const handleOpenDuplicate = useCallback(
    (nextClientId: string) => {
      if (hasChanges && !window.confirm('Закрыть окно без сохранения?')) return;
      onOpenDuplicate(nextClientId);
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

    // Без изменений окно закрывается без запроса к серверу и без уведомления.
    if (!hasChanges) {
      onClose();
      return;
    }

    setFormError(null);
    setConflict(false);

    if (usersStatus === 'error') {
      setFormError(SAVE_ERROR_MESSAGE);
      return;
    }

    const allowed = (id: string) => users.some((user) => user.id === id);
    const nextErrors = validateClientForm(form.values, allowed);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      form.focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateClient(
        clientId,
        toUpdateClientInput(form.values, expectedUpdatedAtRef.current),
        idempotencyKeyRef.current,
      );
      setSubmitting(false);
      onSaved(updated);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError) {
        if (error.code === 'duplicate_phone' && error.duplicateClient) {
          // Номер занят: сообщение под полем с переходом в карточку найденного клиента.
          setPhoneDuplicate(error.duplicateClient);
          setErrors({ phone: DUPLICATE_PHONE_MESSAGE });
          form.focusField('phone');
          return;
        }
        if (error.status === 404) {
          onNotFound();
          return;
        }
        if (error.status === 409) {
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
      setFormError(SAVE_ERROR_MESSAGE);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="client-modal client-modal--edit"
      aria-labelledby="edit-client-title"
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

      <h2 className="client-modal__title" id="edit-client-title">
        Карточка клиента
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
        <form className="client-form client-form--edit" onSubmit={handleSubmit} noValidate>
          <ClientFormFields
            idPrefix="edit-client"
            form={form}
            users={users}
            usersStatus={usersStatus}
            disabled={submitting}
            phoneShowsPrefixWhenEmpty
            onRetryUsers={() => void loadUsers()}
            onOpenDuplicate={handleOpenDuplicate}
          />

          <p className="client-form__hint">* — обязательные поля</p>

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
              {submitting ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
