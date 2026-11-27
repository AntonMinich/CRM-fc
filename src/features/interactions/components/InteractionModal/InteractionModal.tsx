/**
 * Окно взаимодействия: планирование, внесение и правка результата, просмотр
 * с историей переносов. Оформление — как в остальных окнах карточек.
 */

import type { FormEvent, ReactNode, RefObject, SyntheticEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResponsibleUser } from '../../../clients/types';
import { SupplierContactModal } from '../../../suppliers/components/SupplierContactModal/SupplierContactModal';
import type { SupplierContact } from '../../../suppliers/types';
import {
  InteractionApiError,
  cancelInteraction,
  createInteraction,
  submitInteractionResult,
  updateInteraction,
} from '../../api/interactionsApi';
import {
  INTERACTION_LIMITS,
  INTERACTION_TYPES,
  REMINDER_OPTIONS,
  typeLabel,
} from '../../config/interactionFields';
import type {
  Interaction,
  InteractionFormErrors,
  InteractionFormValues,
  InteractionModalMode,
  InteractionOwner,
  InteractionType,
} from '../../types';
import {
  editMark,
  formatDateTime,
  interactionStatusKey,
  interactionStatusLabel,
  rescheduleText,
} from '../../utils/interactionDisplay';
import {
  EMPTY_INTERACTION_FORM,
  INTERACTION_FIELD_MESSAGES,
  PLAN_FIELD_ORDER,
  RESULT_FIELD_ORDER,
  interactionFormValues,
  mapInteractionServerErrors,
  toCreateResultPayload,
  toPlanPayload,
  toPlanUpdatePayload,
  toResultPayload,
  validatePlanForm,
  validateResultForm,
} from '../../utils/validateInteractionForm';
import '../../../clients/components/ClientForm/ClientForm.css';
import './InteractionModal.css';

/** Значение пункта «+ Создать контактное лицо» в выпадающем списке. */
const CREATE_CONTACT_VALUE = '__create_contact__';

/** Заголовок окна для каждого режима. */
function modalTitle(mode: InteractionModalMode, isCreate: boolean, status?: string): string {
  if (mode === 'view') return 'Взаимодействие';
  if (mode === 'result') {
    if (isCreate) return 'Фиксация результата';
    return status === 'done' ? 'Редактирование результата' : 'Результат взаимодействия';
  }
  return isCreate ? 'Планирование взаимодействия' : 'Редактирование плана';
}

interface InteractionModalProps {
  owner: InteractionOwner;
  ownerId: string;
  mode: InteractionModalMode;
  /** null — новая запись. */
  interaction: Interaction | null;
  users: ResponsibleUser[];
  /** Контакты поставщика: только у поставщика. */
  contacts: SupplierContact[] | null;
  currentUserId: string;
  /** Переключение режима внутри окна: перенос, результат, правка результата. */
  onModeChange: (mode: InteractionModalMode) => void;
  onClose: () => void;
  /** Сохранение: список обновляется, окно закрывается. */
  onSaved: () => void;
  /** Обновление списка и контактов без закрытия окна. */
  onRefresh: () => void;
  /** Общий раздел CRM: поле «Контрагент» показывается первым. */
  counterpartyField?: ReactNode;
  /** Общий раздел CRM: проверка выбора контрагента перед отправкой. */
  beforeSubmit?: () => boolean;
  /** Смена контрагента сбрасывает выбранное контактное лицо. */
  contactResetKey?: string;
}

interface FieldRefs {
  type: RefObject<HTMLSelectElement | null>;
  plannedAt: RefObject<HTMLInputElement | null>;
  title: RefObject<HTMLInputElement | null>;
  responsibleUserId: RefObject<HTMLSelectElement | null>;
  contactId: RefObject<HTMLSelectElement | null>;
  remindAt: RefObject<HTMLInputElement | null>;
  planComment: RefObject<HTMLTextAreaElement | null>;
  occurredAt: RefObject<HTMLInputElement | null>;
  resultText: RefObject<HTMLTextAreaElement | null>;
  nextStep: RefObject<HTMLTextAreaElement | null>;
  cancelReason: RefObject<HTMLTextAreaElement | null>;
}

export function InteractionModal({
  owner,
  ownerId,
  mode,
  interaction,
  users,
  contacts,
  currentUserId,
  onModeChange,
  onClose,
  onSaved,
  onRefresh,
  counterpartyField,
  beforeSubmit,
  contactResetKey,
}: InteractionModalProps) {
  const isCreate = interaction === null;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const initialValues = useMemo(
    () => interactionFormValues(interaction, currentUserId),
    [interaction, currentUserId],
  );
  const [values, setValues] = useState<InteractionFormValues>(initialValues);
  const originalRef = useRef(initialValues);
  const [errors, setErrors] = useState<InteractionFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);

  const refs: FieldRefs = {
    type: useRef<HTMLSelectElement | null>(null),
    plannedAt: useRef<HTMLInputElement | null>(null),
    title: useRef<HTMLInputElement | null>(null),
    responsibleUserId: useRef<HTMLSelectElement | null>(null),
    contactId: useRef<HTMLSelectElement | null>(null),
    remindAt: useRef<HTMLInputElement | null>(null),
    planComment: useRef<HTMLTextAreaElement | null>(null),
    occurredAt: useRef<HTMLInputElement | null>(null),
    resultText: useRef<HTMLTextAreaElement | null>(null),
    nextStep: useRef<HTMLTextAreaElement | null>(null),
    cancelReason: useRef<HTMLTextAreaElement | null>(null),
  };

  // Окно открыто сразу при монтировании, фокус — на первом поле режима.
  useEffect(() => {
    dialogRef.current?.showModal();
    const timer = window.setTimeout(() => {
      if (mode === 'plan') refs.plannedAt.current?.focus();
      else if (mode === 'result') refs.resultText.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, refs.plannedAt, refs.resultText]);

  /** Черновик изменён: закрытие окна требует подтверждения. */
  const hasChanges = useMemo(() => {
    const fields = Object.keys(EMPTY_INTERACTION_FORM) as (keyof InteractionFormValues)[];
    return fields.some((field) => values[field] !== originalRef.current[field]);
  }, [values]);

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (hasChanges && !window.confirm('Закрыть окно без сохранения?')) return;
    onClose();
  }, [hasChanges, onClose, submitting]);

  const handleDialogCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    requestClose();
  };

  const clearFieldError = (field: keyof InteractionFormValues) => {
    setErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const updateField = (field: keyof InteractionFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
  };

  /** Выбор в списке контактов: последний пункт открывает мини-форму контакта. */
  const handleContactChange = (value: string) => {
    if (value === CREATE_CONTACT_VALUE) {
      setContactFormOpen(true);
      return;
    }
    updateField('contactId', value);
  };

  const focusField = (field: keyof InteractionFormValues) => {
    const ref = refs[field as keyof FieldRefs];
    ref?.current?.focus();
  };

  const activeContacts = useMemo(
    () => (contacts ?? []).filter((contact) => contact.status === 'active'),
    [contacts],
  );

  // Смена контрагента в общем разделе сбрасывает выбранное контактное лицо.
  useEffect(() => {
    if (contactResetKey === undefined) return;
    setValues((previous) =>
      previous.contactId === '' ? previous : { ...previous, contactId: '' },
    );
  }, [contactResetKey]);

  /** Первичное плановое время: первый перенос хранит исходную дату. */
  const initialPlannedAt =
    interaction && interaction.reschedules.length > 0
      ? interaction.reschedules[interaction.reschedules.length - 1].oldPlannedAt
      : (interaction?.plannedAt ?? null);


  /** Порядок полей текущего режима. */
  const fieldOrder = mode === 'plan' ? PLAN_FIELD_ORDER : RESULT_FIELD_ORDER;

  /** Проверка формы выбранного режима. */
  const validate = (): InteractionFormErrors => {
    if (mode === 'plan') return validatePlanForm(values);
    if (mode === 'result') {
      const resultErrors = validateResultForm(values);
      // У поставщика при внесении результата контактное лицо обязательно.
      if (owner === 'supplier' && values.contactId === '') {
        resultErrors.contactId = INTERACTION_FIELD_MESSAGES.contact;
      }
      return resultErrors;
    }
    return {};
  };

  /** Ошибки сервера: сообщения под полями или общая ошибка окна. */
  const handleApiError = (error: unknown): boolean => {
    if (!(error instanceof InteractionApiError)) return false;
    if (error.fieldErrors) {
      const mapped = mapInteractionServerErrors(error.fieldErrors);
      setErrors(mapped);
      const firstInvalid = fieldOrder.find((field) => mapped[field]);
      if (firstInvalid) focusField(firstInvalid);
      return true;
    }
    if (error.status === 403 || error.status === 409) {
      setFormError(error.message);
      return true;
    }
    return false;
  };

  /** Отправка формы: проверка, запрос и обработка ответа. */
  const submitForm = async () => {
    if (submitting) return;

    setFormError(null);
    const nextErrors = validate();
    setErrors(nextErrors);

    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    // Общий раздел CRM: без выбранного контрагента запись создать нельзя.
    if (beforeSubmit && !beforeSubmit()) return;

    setSubmitting(true);
    try {
      if (mode === 'plan') {
        if (isCreate) await createInteraction(toPlanPayload(owner, ownerId, values));
        else await updateInteraction(interaction.id, toPlanUpdatePayload(values));
        setSubmitting(false);
        onSaved();
        return;
      }

      if (mode === 'result') {
        if (isCreate) await createInteraction(toCreateResultPayload(owner, ownerId, values));
        else if (interaction.status === 'planned') {
          await submitInteractionResult(interaction.id, toResultPayload(values));
        } else {
          await updateInteraction(interaction.id, toResultPayload(values));
        }
        setSubmitting(false);

        // Заполненный следующий шаг: предлагаем сразу запланировать новое взаимодействие.
        const nextStep = values.nextStep.trim();
        if (
          !isCreate &&
          nextStep !== '' &&
          window.confirm('Запланировать следующее взаимодействие?')
        ) {
          const seed: InteractionFormValues = {
            ...EMPTY_INTERACTION_FORM,
            responsibleUserId: values.responsibleUserId,
            title: nextStep,
          };
          onRefresh();
          originalRef.current = seed;
          setValues(seed);
          setErrors({});
          onModeChange('plan');
          return;
        }

        onSaved();
        return;
      }
    } catch (error) {
      setSubmitting(false);
      if (handleApiError(error)) return;
      setFormError('Не удалось сохранить изменения. Попробуйте ещё раз');
    }
  };

  /** Отправка по кнопке и по Enter: кнопка не зависит от нативной отправки формы. */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitForm();
  };

  /** Отмена взаимодействия: причина необязательна. */
  const handleCancelInteraction = async () => {
    if (!interaction || submitting) return;
    setSubmitting(true);
    try {
      const reason = values.cancelReason.trim();
      await cancelInteraction(interaction.id, reason === '' ? null : reason);
      setSubmitting(false);
      onSaved();
    } catch (error) {
      setSubmitting(false);
      if (handleApiError(error)) return;
      setFormError('Не удалось отменить взаимодействие. Попробуйте ещё раз');
    }
  };


  return (
    <dialog
      ref={dialogRef}
      className="client-modal client-modal--interaction"
      aria-labelledby="interaction-modal-title"
      onCancel={handleDialogCancel}
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

      <h2 className="client-modal__title" id="interaction-modal-title">
        {modalTitle(mode, isCreate, interaction?.status)}
      </h2>

      {mode !== 'view' ? (
        <form className="client-form" onSubmit={handleSubmit} noValidate>
          <div className="client-form__fields interaction-form__fields">
            {counterpartyField}

            {/* Дата: в «плане» и «переносе» — первая строка, в «результате» — вторая. */}
            {mode !== 'result' ? (
              <label
                className="client-field interaction-field--span-6"
                htmlFor="interaction-planned-at"
              >
                <span className="client-field__label">
                  Дата и время <span className="client-field__required">*</span>
                </span>
                <input
                  id="interaction-planned-at"
                  className="client-field__input"
                  type="datetime-local"
                  ref={refs.plannedAt}
                  value={values.plannedAt}
                  onChange={(event) => updateField('plannedAt', event.target.value)}
                  aria-invalid={Boolean(errors.plannedAt)}
                  aria-describedby={errors.plannedAt ? 'interaction-planned-at-error' : undefined}
                  disabled={submitting}
                />
                {errors.plannedAt ? (
                  <span className="client-field__error" id="interaction-planned-at-error">
                    {errors.plannedAt}
                  </span>
                ) : null}
              </label>
            ) : null}

            <label
              className={`client-field ${
                mode === 'result' ? 'interaction-field--span-4' : 'interaction-field--span-6'
              }`}
              htmlFor="interaction-type"
            >
              <span className="client-field__label">
                Тип <span className="client-field__required">*</span>
              </span>
              <select
                id="interaction-type"
                className="client-field__input"
                ref={refs.type}
                value={values.type}
                onChange={(event) => updateField('type', event.target.value as InteractionType)}
                aria-invalid={Boolean(errors.type)}
                aria-describedby={errors.type ? 'interaction-type-error' : undefined}
                disabled={submitting}
              >
                {INTERACTION_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {errors.type ? (
                <span className="client-field__error" id="interaction-type-error">
                  {errors.type}
                </span>
              ) : null}
            </label>

            <label
              className={`client-field ${
                mode === 'result' ? 'interaction-field--span-8' : 'interaction-field--span-7'
              }`}
              htmlFor="interaction-title"
            >
              <span className="client-field__label">
                Тема <span className="client-field__required">*</span>
              </span>
              <input
                id="interaction-title"
                className="client-field__input"
                ref={refs.title}
                value={values.title}
                onChange={(event) => updateField('title', event.target.value)}
                maxLength={INTERACTION_LIMITS.title}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? 'interaction-title-error' : undefined}
                disabled={submitting}
              />
              {errors.title ? (
                <span className="client-field__error" id="interaction-title-error">
                  {errors.title}
                </span>
              ) : null}
            </label>

            {/* В «результате» дата факта идёт второй строкой — рядом с контактным лицом. */}
            {mode === 'result' ? (
              <label
                className="client-field interaction-field--span-6"
                htmlFor="interaction-occurred-at"
              >
                <span className="client-field__label">
                  Дата и время факта <span className="client-field__required">*</span>
                </span>
                <input
                  id="interaction-occurred-at"
                  className="client-field__input"
                  type="datetime-local"
                  ref={refs.occurredAt}
                  value={values.occurredAt}
                  onChange={(event) => updateField('occurredAt', event.target.value)}
                  aria-invalid={Boolean(errors.occurredAt)}
                  aria-describedby={errors.occurredAt ? 'interaction-occurred-at-error' : undefined}
                  disabled={submitting}
                />
                {errors.occurredAt ? (
                  <span className="client-field__error" id="interaction-occurred-at-error">
                    {errors.occurredAt}
                  </span>
                ) : null}
              </label>
            ) : null}

            {mode === 'plan' ? (
              <label className="client-field interaction-field--span-5" htmlFor="interaction-responsible">
                <span className="client-field__label">
                  Ответственный <span className="client-field__required">*</span>
                </span>
                <select
                  id="interaction-responsible"
                  className="client-field__input"
                  ref={refs.responsibleUserId}
                  value={values.responsibleUserId}
                  onChange={(event) => updateField('responsibleUserId', event.target.value)}
                  aria-invalid={Boolean(errors.responsibleUserId)}
                  aria-describedby={
                    errors.responsibleUserId ? 'interaction-responsible-error' : undefined
                  }
                  disabled={submitting}
                >
                  <option value="">Не выбрано</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
                {errors.responsibleUserId ? (
                  <span className="client-field__error" id="interaction-responsible-error">
                    {errors.responsibleUserId}
                  </span>
                ) : null}
              </label>
            ) : null}

            {owner === 'supplier' ? (
              <label className="client-field" htmlFor="interaction-contact">
                <span className="client-field__label">
                  Контактное лицо
                  {mode === 'result' ? <span className="client-field__required"> *</span> : null}
                </span>
                <select
                  id="interaction-contact"
                  className="client-field__input"
                  ref={refs.contactId}
                  value={values.contactId}
                  onChange={(event) => handleContactChange(event.target.value)}
                  aria-invalid={Boolean(errors.contactId)}
                  aria-describedby={errors.contactId ? 'interaction-contact-error' : undefined}
                  disabled={submitting}
                >
                  <option value="">Не выбрано</option>
                  {activeContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {[contact.lastName, contact.firstName, contact.middleName]
                        .filter(Boolean)
                        .join(' ')}
                    </option>
                  ))}
                  {mode === 'result' ? (
                    <option value={CREATE_CONTACT_VALUE}>+ Создать контактное лицо</option>
                  ) : null}
                </select>
                {errors.contactId ? (
                  <span className="client-field__error" id="interaction-contact-error">
                    {errors.contactId}
                  </span>
                ) : null}
              </label>
            ) : null}

            {mode === 'plan' ? (
              /* «Напоминание» — отдельная строка сразу под «Контактным лицом». */
              <fieldset className="interaction-reminder">
                <legend className="client-address__title">Напоминание</legend>
                <label className="client-field" htmlFor="interaction-reminder-option">
                  <span className="client-field__label">Когда напомнить</span>
                  <select
                    id="interaction-reminder-option"
                    className="client-field__input"
                    value={values.reminderOption}
                    onChange={(event) => updateField('reminderOption', event.target.value)}
                    disabled={submitting}
                  >
                    {REMINDER_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {values.reminderOption === 'custom' ? (
                  <label className="client-field" htmlFor="interaction-remind-at">
                    <span className="client-field__label">Своё время напоминания</span>
                    <input
                      id="interaction-remind-at"
                      className="client-field__input"
                      type="datetime-local"
                      ref={refs.remindAt}
                      value={values.remindAt}
                      onChange={(event) => updateField('remindAt', event.target.value)}
                      aria-invalid={Boolean(errors.remindAt)}
                      aria-describedby={errors.remindAt ? 'interaction-remind-at-error' : undefined}
                      disabled={submitting}
                    />
                  </label>
                ) : null}
                {errors.remindAt ? (
                  <span className="client-field__error" id="interaction-remind-at-error">
                    {errors.remindAt}
                  </span>
                ) : null}
              </fieldset>
            ) : null}

            {mode === 'plan' ? (
              <label className="client-field" htmlFor="interaction-plan-comment">
                <span className="client-field__label">Комментарий к плану</span>
                <textarea
                  id="interaction-plan-comment"
                  className="client-field__input client-field__textarea interaction-form__textarea--short"
                  ref={refs.planComment}
                  value={values.planComment}
                  onChange={(event) => updateField('planComment', event.target.value)}
                  rows={2}
                  maxLength={INTERACTION_LIMITS.planComment}
                  disabled={submitting}
                />
                <span className="client-field__counter">
                  {values.planComment.length} / {INTERACTION_LIMITS.planComment}
                </span>
              </label>
            ) : null}

            {mode === 'result' ? (
              <>
                <label className="client-field" htmlFor="interaction-result-text">
                  <span className="client-field__label">
                    Результат <span className="client-field__required">*</span>
                  </span>
                  <textarea
                    id="interaction-result-text"
                    className="client-field__input client-field__textarea"
                    ref={refs.resultText}
                    value={values.resultText}
                    onChange={(event) => updateField('resultText', event.target.value)}
                    rows={4}
                    maxLength={INTERACTION_LIMITS.resultText}
                    aria-invalid={Boolean(errors.resultText)}
                    aria-describedby={errors.resultText ? 'interaction-result-error' : undefined}
                    disabled={submitting}
                  />
                  {errors.resultText ? (
                    <span className="client-field__error" id="interaction-result-error">
                      {errors.resultText}
                    </span>
                  ) : null}
                  <span className="client-field__counter">
                    {values.resultText.length} / {INTERACTION_LIMITS.resultText}
                  </span>
                </label>

                <label className="client-field" htmlFor="interaction-next-step">
                  <span className="client-field__label">Следующий шаг</span>
                  <textarea
                    id="interaction-next-step"
                    className="client-field__input client-field__textarea interaction-form__textarea--short"
                    ref={refs.nextStep}
                    value={values.nextStep}
                    onChange={(event) => updateField('nextStep', event.target.value)}
                    rows={2}
                    maxLength={INTERACTION_LIMITS.nextStep}
                    disabled={submitting}
                  />
                  <span className="client-field__counter">
                    {values.nextStep.length} / {INTERACTION_LIMITS.nextStep}
                  </span>
                </label>
              </>
            ) : null}

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
            <button
              type="button"
              className="client-button client-button--primary"
              onClick={() => void submitForm()}
              disabled={submitting}
            >
              {submitting
                ? 'Сохранение…'
                : mode === 'result'
                  ? 'Сохранить результат'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      ) : null}


      {mode === 'view' && interaction ? (
        <div className="interaction-view">
          <dl className="interaction-view__rows">
            <div className="interaction-view__row">
              <dt>Дата и время</dt>
              <dd>
                {formatDateTime(interaction.plannedAt ?? interaction.occurredAt)}
                {interaction.reschedules.length > 0 ? (
                  <span className="interaction-view__mark">Перенесено</span>
                ) : null}
              </dd>
            </div>
            <div className="interaction-view__row">
              <dt>Тип</dt>
              <dd>{typeLabel(interaction.type)}</dd>
            </div>
            <div className="interaction-view__row">
              <dt>Тема</dt>
              <dd>{interaction.title}</dd>
            </div>
            <div className="interaction-view__row">
              <dt>Статус</dt>
              <dd>
                <span
                  className={`interaction-status interaction-status--${interactionStatusKey(
                    interaction,
                  )}`}
                >
                  {interactionStatusLabel(interaction)}
                </span>
              </dd>
            </div>
            <div className="interaction-view__row">
              <dt>Ответственный</dt>
              <dd>{interaction.responsibleFullName}</dd>
            </div>
            {owner === 'supplier' ? (
              <div className="interaction-view__row">
                <dt>Контактное лицо</dt>
                <dd>{interaction.supplierContactName ?? '—'}</dd>
              </div>
            ) : null}
            {interaction.planComment ? (
              <div className="interaction-view__row">
                <dt>Комментарий к плану</dt>
                <dd>{interaction.planComment}</dd>
              </div>
            ) : null}
            {interaction.resultText ? (
              <div className="interaction-view__row">
                <dt>Результат</dt>
                <dd>{interaction.resultText}</dd>
              </div>
            ) : null}
            {interaction.nextStep ? (
              <div className="interaction-view__row">
                <dt>Следующий шаг</dt>
                <dd>{interaction.nextStep}</dd>
              </div>
            ) : null}
            {interaction.completedByFullName ? (
              <div className="interaction-view__row">
                <dt>Результат внёс</dt>
                <dd>
                  {interaction.completedByFullName}, {formatDateTime(interaction.completedAt)}
                </dd>
              </div>
            ) : null}
            {interaction.editedAt ? (
              <div className="interaction-view__row">
                <dt>Изменено</dt>
                <dd>{editMark(interaction).replace('Изменено: ', '')}</dd>
              </div>
            ) : null}
            {interaction.cancelReason ? (
              <div className="interaction-view__row">
                <dt>Причина отмены</dt>
                <dd>{interaction.cancelReason}</dd>
              </div>
            ) : null}
          </dl>

          <section className="interaction-history" aria-label="История переносов">
            <h3 className="interaction-history__title">История переносов</h3>
            {initialPlannedAt ? (
              <p className="interaction-history__item">
                Запланировано изначально на {formatDateTime(initialPlannedAt)}
              </p>
            ) : null}
            {interaction.reschedules.length === 0 ? (
              <p className="interaction-history__item">Переносов не было</p>
            ) : (
              <ul className="interaction-history__list">
                {interaction.reschedules.map((item) => (
                  <li key={item.id} className="interaction-history__item">
                    {rescheduleText(item)}
                  </li>
                ))}
              </ul>
            )}
          </section>



          {cancelOpen ? (
            <div className="interaction-cancel">
              <label className="client-field" htmlFor="interaction-cancel-reason">
                <span className="client-field__label">Причина отмены</span>
                <textarea
                  id="interaction-cancel-reason"
                  className="client-field__input client-field__textarea"
                  ref={refs.cancelReason}
                  value={values.cancelReason}
                  onChange={(event) => updateField('cancelReason', event.target.value)}
                  rows={3}
                  maxLength={INTERACTION_LIMITS.reason}
                  disabled={submitting}
                />
                <span className="client-field__counter">
                  {values.cancelReason.length} / {INTERACTION_LIMITS.reason}
                </span>
              </label>
              {formError ? (
                <p className="client-form__error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="client-form__actions">
                <button
                  type="button"
                  className="client-button client-button--secondary"
                  onClick={() => setCancelOpen(false)}
                  disabled={submitting}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="client-button client-button--primary"
                  onClick={() => void handleCancelInteraction()}
                  disabled={submitting}
                >
                  {submitting ? 'Отмена…' : 'Отменить взаимодействие'}
                </button>
              </div>
            </div>
          ) : (
            <div className="interaction-view__actions">
              {interaction.status === 'planned' ? (
                <>
                  <button
                    type="button"
                    className="client-button client-button--secondary"
                    onClick={() => onModeChange('plan')}
                  >
                    Изменить план
                  </button>
                  <button
                    type="button"
                    className="client-button client-button--secondary"
                    onClick={() => onModeChange('result')}
                  >
                    Внести результат
                  </button>
                  <button
                    type="button"
                    className="client-button client-button--secondary"
                    onClick={() => setCancelOpen(true)}
                  >
                    Отменить
                  </button>
                </>
              ) : null}
              {interaction.status === 'done' && interaction.canEditResult ? (
                <button
                  type="button"
                  className="client-button client-button--secondary"
                  onClick={() => onModeChange('result')}
                >
                  Редактировать результат
                </button>
              ) : null}
              <button
                type="button"
                className="client-button client-button--primary"
                onClick={requestClose}
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Мини-форма контакта: те же правила и обработка дублей, что в контактах. */}
      {contactFormOpen && owner === 'supplier' ? (
        <SupplierContactModal
          supplierId={ownerId}
          contact={null}
          onOpenContact={(contactId: string) => {
            setContactFormOpen(false);
            updateField('contactId', contactId);
          }}
          onOpenSupplierContacts={() => setContactFormOpen(false)}
          onClose={() => setContactFormOpen(false)}
          onSaved={(saved: SupplierContact) => {
            setContactFormOpen(false);
            updateField('contactId', saved.id);
            onRefresh();
          }}
        />
      ) : null}
    </dialog>
  );
}
