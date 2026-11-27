/**
 * Окно контактного лица поставщика: одно для создания и редактирования.
 * Открывается поверх карточки поставщика. Поля, маска телефона, счётчик
 * комментария и подтверждение закрытия — как в окне клиента.
 */

import type { FormEvent, KeyboardEvent, RefObject, SyntheticEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  SupplierApiError,
  createSupplierContact,
  updateSupplierContact,
} from '../../api/suppliersApi';
import type {
  ContactName,
  DuplicateSupplier,
  SupplierContact,
  SupplierContactFormErrors,
  SupplierContactFormValues,
  SupplierContactStatus,
} from '../../types';
import { formatClientName } from '../../../clients/utils/clientDisplay';
import {
  PHONE_PLACEHOLDER,
  PHONE_PREFIX,
  formatPhoneFieldValue,
  formatPhoneGhostTail,
  movePhoneCaretAfterPrefix,
  normalizePhoneInput,
  validatePhone,
} from '../../../clients/utils/phone';
import {
  CONTACT_FIELD_ORDER,
  CONTACT_LIMITS,
  CONTACT_PHONE_MESSAGES,
  EMPTY_CONTACT_FORM,
  mapContactServerErrors,
  toSupplierContactFormValues,
  toSupplierContactInput,
  validateContactForm,
} from '../../utils/validateContactForm';
import '../../../clients/components/ClientForm/ClientForm.css';
import './SupplierContactModal.css';

/** Общая ошибка сохранения. */
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить контакт. Попробуйте ещё раз';

/** Ошибка, когда поставщик или контакт уже недоступны. */
const NOT_FOUND_MESSAGE = 'Поставщик или контакт не найден. Обновите данные';

/** Занятый телефон: данные из ответа сервера для сообщения под полем. */
type PhoneIssue =
  | { code: 'duplicate_contact_phone'; contact: ContactName }
  | { code: 'contact_works_elsewhere'; supplier: DuplicateSupplier }
  | { code: 'contact_transfer_required'; supplier: DuplicateSupplier | null };

/** Данные для окна подтверждения переноса контакта. */
interface TransferRequest {
  contact: ContactName;
  supplier: DuplicateSupplier;
  status: SupplierContactStatus;
}

interface ContactFieldRefs {
  lastName: RefObject<HTMLInputElement | null>;
  firstName: RefObject<HTMLInputElement | null>;
  middleName: RefObject<HTMLInputElement | null>;
  position: RefObject<HTMLInputElement | null>;
  phone: RefObject<HTMLInputElement | null>;
  email: RefObject<HTMLInputElement | null>;
  comment: RefObject<HTMLTextAreaElement | null>;
}

interface SupplierContactModalProps {
  supplierId: string;
  /** null — создание нового контакта. */
  contact: SupplierContact | null;
  /** Телефон занят контактом этого же поставщика: открыть его карточку. */
  onOpenContact: (contactId: string) => void;
  /** Телефон занят у другого поставщика: открыть его карточку на вкладке контактов. */
  onOpenSupplierContacts: (supplierId: string) => void;
  onClose: () => void;
  onSaved: (contact: SupplierContact) => void;
}


export function SupplierContactModal({
  supplierId,
  contact,
  onOpenContact,
  onOpenSupplierContacts,
  onClose,
  onSaved,
}: SupplierContactModalProps) {
  const isEdit = contact !== null;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [values, setValues] = useState<SupplierContactFormValues>(() =>
    contact ? toSupplierContactFormValues(contact) : EMPTY_CONTACT_FORM,
  );
  const originalRef = useRef(values);
  const [errors, setErrors] = useState<SupplierContactFormErrors>({});
  const [phoneIssue, setPhoneIssue] = useState<PhoneIssue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Подтверждение переноса контакта от другого поставщика. */
  const [transfer, setTransfer] = useState<TransferRequest | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const transferDialogRef = useRef<HTMLDialogElement | null>(null);

  const refs: ContactFieldRefs = {
    lastName: useRef<HTMLInputElement | null>(null),
    firstName: useRef<HTMLInputElement | null>(null),
    middleName: useRef<HTMLInputElement | null>(null),
    position: useRef<HTMLInputElement | null>(null),
    phone: useRef<HTMLInputElement | null>(null),
    email: useRef<HTMLInputElement | null>(null),
    comment: useRef<HTMLTextAreaElement | null>(null),
  };

  // Окно открыто сразу при монтировании, фокус — на имени.
  useEffect(() => {
    dialogRef.current?.showModal();
    const timer = window.setTimeout(() => refs.firstName.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [refs.firstName]);

  // Окно подтверждения переноса показывается поверх окна контакта.
  useEffect(() => {
    if (!transfer) return;
    transferDialogRef.current?.showModal();
  }, [transfer]);

  const fieldId = (field: string) => `contact-${field}`;
  const errorId = (field: string) => `contact-${field}-error`;

  /** Черновик изменён: закрытие окна требует подтверждения. */
  const hasChanges = useMemo(() => {
    const fields = Object.keys(EMPTY_CONTACT_FORM) as (keyof SupplierContactFormValues)[];
    return fields.some((field) => values[field] !== originalRef.current[field]);
  }, [values]);

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (hasChanges && !window.confirm('Закрыть окно без сохранения?')) return;
    onClose();
  }, [hasChanges, onClose, submitting]);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    requestClose();
  };

  const clearFieldError = (field: keyof SupplierContactFormValues) => {
    setErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const updateField = (field: keyof SupplierContactFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
  };

  /** Телефон: сообщение о занятом номере исчезает при изменении значения. */
  const updatePhone = (raw: string) => {
    const digits = normalizePhoneInput(raw);
    setPhoneIssue(null);
    clearFieldError('phone');
    setValues((previous) => ({ ...previous, phone: digits }));
  };

  const handlePhoneKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? 0;

    // Префикс +375 не удаляется: Delete внутри него ничего не делает.
    if (event.key === 'Delete') {
      if (input.selectionStart === input.selectionEnd && caret < PHONE_PREFIX.length) {
        event.preventDefault();
      }
      return;
    }
    if (event.key !== 'Backspace') return;
    if (input.selectionStart !== input.selectionEnd) return;

    if (input.value === PHONE_PREFIX) {
      // В поле только префикс: стирать нечего, но и его удалять нельзя.
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setPhoneIssue(null);
    clearFieldError('phone');
    setValues((previous) => ({ ...previous, phone: previous.phone.slice(0, -1) }));
  };

  const handlePhoneBlur = () => {
    if (phoneIssue) return;
    const message = validatePhone(values.phone.trim());
    if (message) setErrors((previous) => ({ ...previous, phone: message }));
  };

  /** Статус «Не работает» снимает пометку основного контакта. */
  const updateStatus = (status: SupplierContactStatus) => {
    setValues((previous) => ({
      ...previous,
      status,
      isPrimary: status === 'active' ? previous.isPrimary : false,
    }));
  };

  const focusField = (field: keyof SupplierContactFormValues) => {
    if (field === 'lastName') refs.lastName.current?.focus();
    else if (field === 'firstName') refs.firstName.current?.focus();
    else if (field === 'middleName') refs.middleName.current?.focus();
    else if (field === 'position') refs.position.current?.focus();
    else if (field === 'phone') refs.phone.current?.focus();
    else if (field === 'email') refs.email.current?.focus();
    else if (field === 'comment') refs.comment.current?.focus();
  };


  /** Сообщение под полем телефона для занятого номера. */
  const applyPhoneIssue = useCallback(
    (error: SupplierApiError): boolean => {
      if (error.code === 'duplicate_contact_phone' && error.duplicateContact) {
        setPhoneIssue({ code: 'duplicate_contact_phone', contact: error.duplicateContact });
        setErrors({ phone: CONTACT_PHONE_MESSAGES.duplicateInList });
        refs.phone.current?.focus();
        return true;
      }
      if (error.code === 'contact_works_elsewhere' && error.duplicateSupplier) {
        setPhoneIssue({ code: 'contact_works_elsewhere', supplier: error.duplicateSupplier });
        setErrors({ phone: CONTACT_PHONE_MESSAGES.worksElsewhere });
        refs.phone.current?.focus();
        return true;
      }
      if (error.code === 'contact_transfer_required' && error.duplicateSupplier) {
        setPhoneIssue({ code: 'contact_transfer_required', supplier: error.duplicateSupplier });
        setErrors({ phone: CONTACT_PHONE_MESSAGES.inactiveElsewhere });
        refs.phone.current?.focus();
        return true;
      }
      return false;
    },
    [refs.phone],
  );

  /** Ответ с ошибкой: true, если сообщение уже показано под полем. */
  const handleApiError = useCallback(
    (error: unknown): boolean => {
      if (!(error instanceof SupplierApiError)) return false;
      if (error.status === 404) {
        setFormError(NOT_FOUND_MESSAGE);
        return true;
      }
      if (applyPhoneIssue(error)) return true;
      if (error.fieldErrors) {
        const mapped = mapContactServerErrors(error.fieldErrors);
        setErrors(mapped);
        const firstInvalid = CONTACT_FIELD_ORDER.find((field) => mapped[field]);
        if (firstInvalid) focusField(firstInvalid);
        return true;
      }
      return false;
    },
    [applyPhoneIssue],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    const nextErrors = validateContactForm(values);
    setErrors(nextErrors);

    const firstInvalid = CONTACT_FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    const input = toSupplierContactInput(values);
    try {
      if (isEdit) {
        const saved = await updateSupplierContact(contact.id, input);
        setSubmitting(false);
        onSaved(saved);
        return;
      }

      const saved = await createSupplierContact(supplierId, input);
      setSubmitting(false);
      onSaved(saved);
    } catch (error) {
      setSubmitting(false);

      // Телефон занят у другого поставщика: показываем окно подтверждения переноса.
      if (
        error instanceof SupplierApiError &&
        error.code === 'contact_transfer_required' &&
        !isEdit &&
        error.duplicateContact &&
        error.duplicateSupplier
      ) {
        setTransfer({
          contact: error.duplicateContact,
          supplier: error.duplicateSupplier,
          status: error.duplicateContactStatus ?? 'inactive',
        });
        return;
      }

      if (handleApiError(error)) return;
      setFormError(SAVE_ERROR_MESSAGE);
    }
  };

  /** Подтверждённый перенос: та же запись переходит к текущему поставщику. */
  const handleTransfer = async () => {
    if (transferBusy) return;
    setTransferBusy(true);
    try {
      const saved = await createSupplierContact(supplierId, {
        ...toSupplierContactInput(values),
        confirm_transfer: true,
      });
      setTransferBusy(false);
      setTransfer(null);
      onSaved(saved);
    } catch (error) {
      setTransferBusy(false);
      setTransfer(null);
      if (handleApiError(error)) return;
      setFormError(SAVE_ERROR_MESSAGE);
    }
  };

  /** Переход по ссылке в сообщении: сначала подтверждение несохранённых правок. */
  const confirmBeforeLeaving = (): boolean =>
    !hasChanges || window.confirm('Закрыть окно без сохранения?');

  const handleIssueLink = () => {
    if (!phoneIssue || !confirmBeforeLeaving()) return;
    if (phoneIssue.code === 'duplicate_contact_phone') {
      onOpenContact(phoneIssue.contact.id);
      return;
    }
    if (phoneIssue.supplier) onOpenSupplierContacts(phoneIssue.supplier.id);
  };

  const phoneValue = formatPhoneFieldValue(values.phone);
  const phoneGhostTail = formatPhoneGhostTail(values.phone);
  const phoneLinkLabel =
    phoneIssue?.code === 'duplicate_contact_phone'
      ? formatClientName(phoneIssue.contact)
      : (phoneIssue?.supplier?.name ?? '');
  const phoneSuffix =
    phoneIssue?.code === 'contact_transfer_required' ? CONTACT_PHONE_MESSAGES.inactiveSuffix : '';

  return (
    <dialog
      ref={dialogRef}
      className="client-modal client-modal--contact"
      aria-labelledby="contact-modal-title"
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

      <h2 className="client-modal__title" id="contact-modal-title">
        {isEdit ? 'Контактное лицо' : 'Новое контактное лицо'}
      </h2>

      <form className="client-form" onSubmit={handleSubmit} noValidate>
        <div className="client-form__fields">
          <label className="client-field" htmlFor={fieldId('last-name')}>
            <span className="client-field__label">Фамилия</span>
            <input
              id={fieldId('last-name')}
              className="client-field__input"
              ref={refs.lastName}
              value={values.lastName}
              onChange={(event) => updateField('lastName', event.target.value)}
              autoComplete="family-name"
              maxLength={CONTACT_LIMITS.namePart}
              disabled={submitting}
            />
          </label>

          <label className="client-field" htmlFor={fieldId('first-name')}>
            <span className="client-field__label">
              Имя <span className="client-field__required">*</span>
            </span>
            <input
              id={fieldId('first-name')}
              className="client-field__input"
              ref={refs.firstName}
              value={values.firstName}
              onChange={(event) => updateField('firstName', event.target.value)}
              autoComplete="given-name"
              maxLength={CONTACT_LIMITS.namePart}
              required
              aria-required="true"
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? errorId('first-name') : undefined}
              disabled={submitting}
            />
            {errors.firstName ? (
              <span className="client-field__error" id={errorId('first-name')}>
                {errors.firstName}
              </span>
            ) : null}
          </label>

          <label className="client-field" htmlFor={fieldId('middle-name')}>
            <span className="client-field__label">Отчество</span>
            <input
              id={fieldId('middle-name')}
              className="client-field__input"
              ref={refs.middleName}
              value={values.middleName}
              onChange={(event) => updateField('middleName', event.target.value)}
              autoComplete="additional-name"
              maxLength={CONTACT_LIMITS.namePart}
              disabled={submitting}
            />
          </label>

          <label className="client-field" htmlFor={fieldId('position')}>
            <span className="client-field__label">
              Должность <span className="client-field__required">*</span>
            </span>
            <input
              id={fieldId('position')}
              className="client-field__input"
              ref={refs.position}
              value={values.position}
              onChange={(event) => updateField('position', event.target.value)}
              maxLength={CONTACT_LIMITS.position}
              required
              aria-required="true"
              aria-invalid={Boolean(errors.position)}
              aria-describedby={errors.position ? errorId('position') : undefined}
              disabled={submitting}
            />
            {errors.position ? (
              <span className="client-field__error" id={errorId('position')}>
                {errors.position}
              </span>
            ) : null}
          </label>


          <label className="client-field" htmlFor={fieldId('phone')}>
            <span className="client-field__label">
              Телефон <span className="client-field__required">*</span>
            </span>
            <span className="client-field__phone">
              <input
                id={fieldId('phone')}
                className="client-field__input"
                ref={refs.phone}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={PHONE_PLACEHOLDER}
                value={phoneValue}
                onChange={(event) => updatePhone(event.target.value)}
                onBlur={handlePhoneBlur}
                onKeyDown={handlePhoneKeyDown}
                onFocus={(event) => movePhoneCaretAfterPrefix(event.currentTarget)}
                onClick={(event) => movePhoneCaretAfterPrefix(event.currentTarget)}
                required
                aria-required="true"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? errorId('phone') : undefined}
                disabled={submitting}
              />
              {/* Серые позиции маски: часть, совпадающая с введённым, прозрачна. */}
              <span className="client-field__phone-ghost" aria-hidden="true">
                <span className="client-field__phone-ghost-typed">{phoneValue}</span>
                {phoneGhostTail}
              </span>
            </span>
            {errors.phone ? (
              <span className="client-field__error" id={errorId('phone')}>
                {errors.phone}
                {phoneLinkLabel ? (
                  <button type="button" className="client-field__link" onClick={handleIssueLink}>
                    {phoneLinkLabel}
                  </button>
                ) : null}
                {phoneSuffix ? <span>{phoneSuffix}</span> : null}
              </span>
            ) : null}
          </label>

          <label className="client-field" htmlFor={fieldId('email')}>
            <span className="client-field__label">E-mail</span>
            <input
              id={fieldId('email')}
              className="client-field__input"
              ref={refs.email}
              type="email"
              value={values.email}
              onChange={(event) => updateField('email', event.target.value)}
              autoComplete="email"
              maxLength={CONTACT_LIMITS.email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? errorId('email') : undefined}
              disabled={submitting}
            />
            {errors.email ? (
              <span className="client-field__error" id={errorId('email')}>
                {errors.email}
              </span>
            ) : null}
          </label>

          <label className="client-field" htmlFor={fieldId('status')}>
            <span className="client-field__label">Статус</span>
            <select
              id={fieldId('status')}
              className="client-field__input"
              value={values.status}
              onChange={(event) => updateStatus(event.target.value as SupplierContactStatus)}
              disabled={submitting}
            >
              <option value="active">Работает</option>
              <option value="inactive">Не работает</option>
            </select>
          </label>

          <label className="supplier-contact-form__primary" htmlFor={fieldId('primary')}>
            <input
              id={fieldId('primary')}
              type="checkbox"
              checked={values.isPrimary}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, isPrimary: event.target.checked }))
              }
              disabled={submitting || values.status === 'inactive'}
            />
            Основной контакт
          </label>

          <label className="client-field" htmlFor={fieldId('comment')}>
            <span className="client-field__label">Комментарий</span>
            <textarea
              id={fieldId('comment')}
              className="client-field__input client-field__textarea"
              ref={refs.comment}
              value={values.comment}
              onChange={(event) => updateField('comment', event.target.value)}
              rows={4}
              maxLength={CONTACT_LIMITS.comment}
              aria-invalid={Boolean(errors.comment)}
              aria-describedby={errors.comment ? errorId('comment') : undefined}
              disabled={submitting}
            />
            {errors.comment ? (
              <span className="client-field__error" id={errorId('comment')}>
                {errors.comment}
              </span>
            ) : null}
            <span className="client-field__counter">
              {values.comment.length} / {CONTACT_LIMITS.comment}
            </span>
          </label>
        </div>

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
            {submitting ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>

      {/* Подтверждение переноса: показывается поверх окна контакта. */}
      {transfer ? (
        <dialog
          ref={transferDialogRef}
          className="client-modal client-modal--confirm"
          aria-labelledby="contact-transfer-title"
          onCancel={(event) => {
            event.preventDefault();
            setTransfer(null);
          }}
        >
          <h2 className="client-modal__title" id="contact-transfer-title">
            Перенос контакта
          </h2>
          <p className="supplier-transfer__text">
            Контакт {formatClientName(transfer.contact)} числится у поставщика{' '}
            {transfer.supplier.name} (статус:{' '}
            {transfer.status === 'active' ? 'Работает' : 'Не работает'}). Перенести его к текущему
            поставщику? У прежнего поставщика он пропадёт.
          </p>
          <div className="client-form__actions">
            <button
              type="button"
              className="client-button client-button--secondary"
              onClick={() => setTransfer(null)}
              disabled={transferBusy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="client-button client-button--primary"
              onClick={() => void handleTransfer()}
              disabled={transferBusy}
            >
              {transferBusy ? 'Переношу…' : 'Перенести'}
            </button>
          </div>
        </dialog>
      ) : null}
    </dialog>
  );
}

