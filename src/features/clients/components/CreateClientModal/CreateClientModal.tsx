import type { FormEvent, SyntheticEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, createClient, fetchResponsibleUsers } from '../../api/clientsApi';
import type {
  Client,
  ClientFormErrors,
  ClientFormValues,
  LoadStatus,
  ResponsibleUser,
} from '../../types';
import {
  EMPTY_CLIENT_FORM,
  toCreateClientInput,
  validateClientForm,
} from '../../utils/validateClientForm';
import './CreateClientModal.css';

/** Порядок полей: используется для перевода фокуса к первому некорректному. */
const FIELD_ORDER: readonly (keyof ClientFormValues)[] = [
  'lastName',
  'firstName',
  'middleName',
  'phone',
  'email',
  'responsibleUserId',
];

/** Соответствие полей формы и полей запроса. */
const API_FIELD_NAMES: Record<keyof ClientFormValues, string> = {
  lastName: 'last_name',
  firstName: 'first_name',
  middleName: 'middle_name',
  phone: 'phone',
  email: 'email',
  responsibleUserId: 'responsible_user_id',
};

/** Ключ идемпотентности: повтор одного запроса не создаёт вторую запись. */
function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapServerErrors(fieldErrors: Record<string, string>): ClientFormErrors {
  const mapped: ClientFormErrors = {};
  for (const field of FIELD_ORDER) {
    const message = fieldErrors[API_FIELD_NAMES[field]];
    if (message) mapped[field] = message;
  }
  return mapped;
}

interface CreateClientModalProps {
  open: boolean;
  /** Закрытие окна без создания записи. */
  onClose: () => void;
  /** Успешное создание: окно закрывается, список обновляется. */
  onCreated: (client: Client) => void;
}

/**
 * Модальное окно «Создание клиента» (раздел 6 ТЗ).
 * Нативный `<dialog>`: фокус остаётся внутри окна, Escape перехватывается
 * и подчиняется правилам закрытия из раздела 10.
 */
export function CreateClientModal({ open, onClose, onCreated }: CreateClientModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());

  const lastNameRef = useRef<HTMLInputElement | null>(null);
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const middleNameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const responsibleRef = useRef<HTMLSelectElement | null>(null);

  const [values, setValues] = useState<ClientFormValues>(EMPTY_CLIENT_FORM);
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<ResponsibleUser[]>([]);
  const [usersStatus, setUsersStatus] = useState<LoadStatus>('loading');

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
      [values.lastName, values.firstName, values.middleName, values.phone, values.email].some(
        (value) => value.trim() !== '',
      ),
    [values],
  );

  const focusField = useCallback((field: keyof ClientFormValues) => {
    const refs: Record<keyof ClientFormValues, { current: HTMLElement | null }> = {
      lastName: lastNameRef,
      firstName: firstNameRef,
      middleName: middleNameRef,
      phone: phoneRef,
      email: emailRef,
      responsibleUserId: responsibleRef,
    };
    refs[field].current?.focus();
  }, []);

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
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
  }, []);

  // Повторное открытие: пустые поля, ответственный по умолчанию, без старых ошибок.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setValues(EMPTY_CLIENT_FORM);
    setErrors({});
    setFormError(null);
    setSubmitting(false);
    idempotencyKeyRef.current = createIdempotencyKey();
    void loadUsers(controller.signal);
    const timer = window.setTimeout(() => lastNameRef.current?.focus(), 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, loadUsers]);

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

  const updateField = (field: keyof ClientFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    // Сообщение об ошибке поля снимается, как только значение исправляют.
    setErrors((previous) => {
      if (!(field in previous)) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (usersStatus === 'error') {
      setFormError('Не удалось создать клиента. Попробуйте ещё раз');
      return;
    }

    const allowed = (id: string) => users.some((user) => user.id === id);
    const nextErrors = validateClientForm(values, allowed);
    setErrors(nextErrors);
    setFormError(null);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createClient(toCreateClientInput(values), idempotencyKeyRef.current);
      setSubmitting(false);
      onCreated(created);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.fieldErrors) {
        const mapped = mapServerErrors(error.fieldErrors);
        setErrors(mapped);
        const firstField = FIELD_ORDER.find((field) => mapped[field]);
        if (firstField) focusField(firstField);
        return;
      }
      // Значения формы сохраняются, кнопка снова доступна.
      setFormError('Не удалось создать клиента. Попробуйте ещё раз');
    }
  };

  const fieldError = (field: keyof ClientFormValues) => errors[field];
  const errorId = (field: keyof ClientFormValues) => `create-client-${field}-error`;

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
        <div className="client-form__fields">
          <label className="client-field" htmlFor="create-client-last-name">
            <span className="client-field__label">Фамилия</span>
            <input
              id="create-client-last-name"
              className="client-field__input"
              ref={lastNameRef}
              value={values.lastName}
              onChange={(event) => updateField('lastName', event.target.value)}
              autoComplete="family-name"
              maxLength={100}
            />
          </label>

          <label className="client-field" htmlFor="create-client-first-name">
            <span className="client-field__label">
              Имя <span className="client-field__required">*</span>
            </span>
            <input
              id="create-client-first-name"
              className="client-field__input"
              ref={firstNameRef}
              value={values.firstName}
              onChange={(event) => updateField('firstName', event.target.value)}
              autoComplete="given-name"
              maxLength={100}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldError('firstName'))}
              aria-describedby={fieldError('firstName') ? errorId('firstName') : undefined}
            />
            {fieldError('firstName') ? (
              <span className="client-field__error" id={errorId('firstName')}>
                {fieldError('firstName')}
              </span>
            ) : null}
          </label>

          <label className="client-field" htmlFor="create-client-middle-name">
            <span className="client-field__label">Отчество</span>
            <input
              id="create-client-middle-name"
              className="client-field__input"
              ref={middleNameRef}
              value={values.middleName}
              onChange={(event) => updateField('middleName', event.target.value)}
              autoComplete="additional-name"
              maxLength={100}
            />
          </label>

          <label className="client-field" htmlFor="create-client-phone">
            <span className="client-field__label">
              Телефон <span className="client-field__required">*</span>
            </span>
            <input
              id="create-client-phone"
              className="client-field__input"
              ref={phoneRef}
              type="tel"
              value={values.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              autoComplete="tel"
              maxLength={50}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldError('phone'))}
              aria-describedby={fieldError('phone') ? errorId('phone') : undefined}
            />
            {fieldError('phone') ? (
              <span className="client-field__error" id={errorId('phone')}>
                {fieldError('phone')}
              </span>
            ) : null}
          </label>

          <label className="client-field" htmlFor="create-client-email">
            <span className="client-field__label">E-mail</span>
            <input
              id="create-client-email"
              className="client-field__input"
              ref={emailRef}
              type="email"
              value={values.email}
              onChange={(event) => updateField('email', event.target.value)}
              autoComplete="email"
              maxLength={254}
              aria-invalid={Boolean(fieldError('email'))}
              aria-describedby={fieldError('email') ? errorId('email') : undefined}
            />
            {fieldError('email') ? (
              <span className="client-field__error" id={errorId('email')}>
                {fieldError('email')}
              </span>
            ) : null}
          </label>

          <label className="client-field" htmlFor="create-client-responsible">
            <span className="client-field__label">
              Ответственный <span className="client-field__required">*</span>
            </span>
            <select
              id="create-client-responsible"
              className="client-field__input"
              ref={responsibleRef}
              value={values.responsibleUserId}
              onChange={(event) => updateField('responsibleUserId', event.target.value)}
              disabled={usersStatus !== 'ready'}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldError('responsibleUserId'))}
              aria-describedby={
                fieldError('responsibleUserId') ? errorId('responsibleUserId') : undefined
              }
            >
              {usersStatus === 'loading' ? <option value="">Загрузка…</option> : null}
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
            {usersStatus === 'error' ? (
              <span className="client-field__error" role="alert">
                Не удалось загрузить список ответственных
                <button type="button" className="client-field__retry" onClick={() => void loadUsers()}>
                  Повторить
                </button>
              </span>
            ) : null}
            {fieldError('responsibleUserId') ? (
              <span className="client-field__error" id={errorId('responsibleUserId')}>
                {fieldError('responsibleUserId')}
              </span>
            ) : null}
          </label>
        </div>

        <p className="client-form__hint">* — обязательные поля</p>

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
