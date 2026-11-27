/**
 * Клиентская проверка формы взаимодействия и преобразование значений в запрос.
 * Правила и сообщения совпадают с серверной проверкой
 * server/interactionsValidation.mjs.
 */

import type { InteractionRequestPayload } from '../api/interactionsApi';
import { BEFORE_MINUTES, INTERACTION_LIMITS } from '../config/interactionFields';
import type {
  Interaction,
  InteractionFormErrors,
  InteractionFormValues,
  InteractionOwner,
  ReminderOption,
} from '../types';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from './interactionDisplay';

/** Сообщения об ошибках полей. */
export const INTERACTION_FIELD_MESSAGES = {
  type: 'Укажите тип',
  plannedAt: 'Укажите дату и время',
  plannedAtFuture: 'Время должно быть в будущем',
  title: 'Введите тему',
  responsible: 'Выберите ответственного',
  remindAt: 'Укажите время напоминания',
  remindAtFuture: 'Время напоминания должно быть в будущем',
  remindAtBeforePlan: 'Напоминание не может быть позже планового времени',
  occurredAt: 'Укажите дату и время',
  occurredAtPast: 'Дата факта не может быть в будущем',
  result: 'Укажите результат',
  contact: 'Выберите контактное лицо',
} as const;

/** Пустые значения формы. */
export const EMPTY_INTERACTION_FORM: InteractionFormValues = {
  type: 'call',
  plannedAt: '',
  title: '',
  responsibleUserId: '',
  contactId: '',
  planComment: '',
  reminderOption: 'at_start',
  remindAt: '',
  occurredAt: '',
  resultText: '',
  nextStep: '',
  reason: '',
  cancelReason: '',
};

/** Порядок полей: перевод фокуса к первому некорректному. */
export const PLAN_FIELD_ORDER: readonly (keyof InteractionFormValues)[] = [
  'type',
  'plannedAt',
  'title',
  'responsibleUserId',
  'contactId',
  'remindAt',
  'planComment',
];

export const RESULT_FIELD_ORDER: readonly (keyof InteractionFormValues)[] = [
  'occurredAt',
  'type',
  'title',
  'resultText',
  'contactId',
  'nextStep',
];

export const RESCHEDULE_FIELD_ORDER: readonly (keyof InteractionFormValues)[] = [
  'plannedAt',
  'remindAt',
  'reason',
];

/**
 * Момент напоминания по варианту: «Не напоминать» — null, «В момент начала» —
 * плановое время, «За 15 минут» — на 15 минут раньше, «Своё время» — из поля.
 */
export function computeRemindAt(values: InteractionFormValues): string | null {
  if (values.reminderOption === 'none') return null;
  const planned = fromDateTimeLocalValue(values.plannedAt);
  if (!planned) return null;
  if (values.reminderOption === 'at_start') return planned;
  if (values.reminderOption === 'before_15') {
    return new Date(Date.parse(planned) - BEFORE_MINUTES * 60_000).toISOString();
  }
  return fromDateTimeLocalValue(values.remindAt);
}

/** Вариант напоминания по сохранённым значениям. */
export function reminderOptionFrom(
  plannedAt: string | null,
  remindAt: string | null,
): ReminderOption {
  if (!remindAt) return 'none';
  if (!plannedAt) return 'custom';
  const planned = Date.parse(plannedAt);
  const remind = Date.parse(remindAt);
  if (remind === planned) return 'at_start';
  if (remind === planned - BEFORE_MINUTES * 60_000) return 'before_15';
  return 'custom';
}

/** Общая проверка напоминания для плана и переноса. */
function validateReminder(
  values: InteractionFormValues,
  planned: string | null,
  now: number,
): string | null {
  const remind = computeRemindAt(values);
  if (values.reminderOption === 'custom' && !remind) {
    return INTERACTION_FIELD_MESSAGES.remindAt;
  }
  if (!remind) return null;
  if (planned && Date.parse(remind) > Date.parse(planned)) {
    return INTERACTION_FIELD_MESSAGES.remindAtBeforePlan;
  }
  if (Date.parse(remind) <= now) {
    return INTERACTION_FIELD_MESSAGES.remindAtFuture;
  }
  return null;
}

/** Проверяет план: тип, будущее время, тема, ответственный, напоминание. */
export function validatePlanForm(
  values: InteractionFormValues,
  now = Date.now(),
): InteractionFormErrors {
  const errors: InteractionFormErrors = {};

  if (!values.type) errors.type = INTERACTION_FIELD_MESSAGES.type;

  const planned = fromDateTimeLocalValue(values.plannedAt);
  if (!planned) {
    errors.plannedAt = INTERACTION_FIELD_MESSAGES.plannedAt;
  } else if (Date.parse(planned) <= now) {
    errors.plannedAt = INTERACTION_FIELD_MESSAGES.plannedAtFuture;
  }

  const title = values.title.trim();
  if (title === '') errors.title = INTERACTION_FIELD_MESSAGES.title;
  else if (title.length > INTERACTION_LIMITS.title) {
    errors.title = `Не более ${INTERACTION_LIMITS.title} символов`;
  }

  if (values.responsibleUserId.trim() === '') {
    errors.responsibleUserId = INTERACTION_FIELD_MESSAGES.responsible;
  }

  const remindError = validateReminder(values, planned, now);
  if (remindError) errors.remindAt = remindError;

  if (values.planComment.length > INTERACTION_LIMITS.planComment) {
    errors.planComment = `Не более ${INTERACTION_LIMITS.planComment} символов`;
  }

  return errors;
}

/** Проверяет перенос: новая дата в будущем, напоминание не позже неё. */
export function validateRescheduleForm(
  values: InteractionFormValues,
  now = Date.now(),
): InteractionFormErrors {
  const errors: InteractionFormErrors = {};

  const planned = fromDateTimeLocalValue(values.plannedAt);
  if (!planned) {
    errors.plannedAt = INTERACTION_FIELD_MESSAGES.plannedAt;
  } else if (Date.parse(planned) <= now) {
    errors.plannedAt = INTERACTION_FIELD_MESSAGES.plannedAtFuture;
  }

  const remindError = validateReminder(values, planned, now);
  if (remindError) errors.remindAt = remindError;

  if (values.reason.trim().length > INTERACTION_LIMITS.reason) {
    errors.reason = `Не более ${INTERACTION_LIMITS.reason} символов`;
  }

  return errors;
}

/** Проверяет результат: дата факта не в будущем, результат обязателен. */
export function validateResultForm(
  values: InteractionFormValues,
  now = Date.now(),
): InteractionFormErrors {
  const errors: InteractionFormErrors = {};

  if (!values.type) errors.type = INTERACTION_FIELD_MESSAGES.type;

  const title = values.title.trim();
  if (title === '') errors.title = INTERACTION_FIELD_MESSAGES.title;
  else if (title.length > INTERACTION_LIMITS.title) {
    errors.title = `Не более ${INTERACTION_LIMITS.title} символов`;
  }

  const occurred = fromDateTimeLocalValue(values.occurredAt);
  if (!occurred) {
    errors.occurredAt = INTERACTION_FIELD_MESSAGES.occurredAt;
  } else if (Date.parse(occurred) > now + 60_000) {
    errors.occurredAt = INTERACTION_FIELD_MESSAGES.occurredAtPast;
  }

  if (values.resultText.trim() === '') errors.resultText = INTERACTION_FIELD_MESSAGES.result;
  else if (values.resultText.length > INTERACTION_LIMITS.resultText) {
    errors.resultText = `Не более ${INTERACTION_LIMITS.resultText} символов`;
  }

  if (values.nextStep.length > INTERACTION_LIMITS.nextStep) {
    errors.nextStep = `Не более ${INTERACTION_LIMITS.nextStep} символов`;
  }

  return errors;
}


/** Текст или null: внешние пробелы убираются. */
function optionalText(value: string): string | null {
  const text = value.trim();
  return text === '' ? null : text;
}

/** Значения формы -> тело запроса для создания плана. */
export function toPlanPayload(
  owner: InteractionOwner,
  ownerId: string,
  values: InteractionFormValues,
): InteractionRequestPayload {
  return {
    ...(owner === 'client' ? { client_id: ownerId } : { supplier_id: ownerId }),
    type: values.type,
    title: values.title.trim(),
    planned_at: fromDateTimeLocalValue(values.plannedAt),
    responsible_user_id: values.responsibleUserId,
    plan_comment: optionalText(values.planComment),
    remind_at: computeRemindAt(values),
    supplier_contact_id: values.contactId ? values.contactId : null,
  };
}

/** Значения формы -> тело запроса для правки плана. */
export function toPlanUpdatePayload(values: InteractionFormValues): InteractionRequestPayload {
  return {
    type: values.type,
    title: values.title.trim(),
    planned_at: fromDateTimeLocalValue(values.plannedAt),
    responsible_user_id: values.responsibleUserId,
    plan_comment: optionalText(values.planComment),
    remind_at: computeRemindAt(values),
    supplier_contact_id: values.contactId ? values.contactId : null,
  };
}

/** Значения формы -> тело запроса для переноса. */
export function toReschedulePayload(values: InteractionFormValues): InteractionRequestPayload {
  return {
    planned_at: fromDateTimeLocalValue(values.plannedAt),
    reason: optionalText(values.reason),
    remind_at: computeRemindAt(values),
  };
}

/** Значения формы -> тело запроса для результата. */
export function toResultPayload(values: InteractionFormValues): InteractionRequestPayload {
  return {
    type: values.type,
    title: values.title.trim(),
    occurred_at: fromDateTimeLocalValue(values.occurredAt) ?? '',
    result_text: values.resultText.trim(),
    next_step: optionalText(values.nextStep),
    supplier_contact_id: values.contactId ? values.contactId : null,
  };
}

/** Значения формы -> тело запроса для фиксации результата без плана. */
export function toCreateResultPayload(
  owner: InteractionOwner,
  ownerId: string,
  values: InteractionFormValues,
): InteractionRequestPayload {
  return {
    ...(owner === 'client' ? { client_id: ownerId } : { supplier_id: ownerId }),
    ...toResultPayload(values),
  };
}

/** Значения формы из записи: план, перенос и результат используют одни поля. */
export function interactionFormValues(
  interaction: Interaction | null,
  responsibleUserId: string,
): InteractionFormValues {
  if (!interaction) {
    return { ...EMPTY_INTERACTION_FORM, responsibleUserId };
  }
  const reminderOption = reminderOptionFrom(interaction.plannedAt, interaction.remindAt);
  return {
    ...EMPTY_INTERACTION_FORM,
    type: interaction.type,
    plannedAt: toDateTimeLocalValue(interaction.plannedAt),
    title: interaction.title,
    responsibleUserId: interaction.responsibleUserId || responsibleUserId,
    contactId: interaction.supplierContactId ?? '',
    planComment: interaction.planComment ?? '',
    reminderOption,
    remindAt: reminderOption === 'custom' ? toDateTimeLocalValue(interaction.remindAt) : '',
    occurredAt: toDateTimeLocalValue(interaction.occurredAt ?? interaction.plannedAt),
    resultText: interaction.resultText ?? '',
    nextStep: interaction.nextStep ?? '',
    cancelReason: interaction.cancelReason ?? '',
  };
}

/** Ошибки полей из ответа сервера в модель формы. */
export function mapInteractionServerErrors(
  fieldErrors: Record<string, string>,
): InteractionFormErrors {
  const mapping: Record<string, keyof InteractionFormValues> = {
    type: 'type',
    title: 'title',
    planned_at: 'plannedAt',
    responsible_user_id: 'responsibleUserId',
    plan_comment: 'planComment',
    remind_at: 'remindAt',
    occurred_at: 'occurredAt',
    result_text: 'resultText',
    next_step: 'nextStep',
    supplier_contact_id: 'contactId',
    reason: 'reason',
    cancel_reason: 'cancelReason',
  };
  const errors: InteractionFormErrors = {};
  for (const [field, message] of Object.entries(fieldErrors)) {
    const key = mapping[field];
    if (key) errors[key] = message;
  }
  return errors;
}

