/**
 * Серверная валидация взаимодействий: план, перенос, результат, отмена.
 * Правила и сообщения совпадают с клиентской формой
 * (src/features/interactions/utils/validateInteractionForm.ts).
 */

/** Лимиты длины: те же значения в форме, API и базе. */
export const INTERACTION_LIMITS = {
  title: 200,
  planComment: 500,
  resultText: 1000,
  nextStep: 500,
  reason: 300,
};

/** Типы взаимодействий. */
export const INTERACTION_TYPES = ['call', 'meeting', 'letter', 'other'];

/** Статусы взаимодействий. Просрочено — не статус, а отображение плана. */
export const INTERACTION_STATUSES = ['planned', 'done', 'cancelled'];

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
};

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** Необязательный текст: пробелы по краям убираются, пустое значение -> null. */
function optionalText(value, maxLength) {
  const text = asText(value);
  if (text === null) return { error: true };
  const trimmed = text.trim();
  if (trimmed === '') return { value: null };
  if (trimmed.length > maxLength) return { tooLong: true };
  return { value: trimmed };
}

/** Обязательный текст: не пустой после удаления пробелов. */
function requiredText(value, maxLength) {
  const text = asText(value);
  if (text === null) return { error: true };
  const trimmed = text.trim();
  if (trimmed === '') return { empty: true };
  if (trimmed.length > maxLength) return { tooLong: true };
  return { value: trimmed };
}

/** Метка времени из строки ISO: значение для базы и число для сравнений. */
export function asTimestamp(value) {
  const text = asText(value);
  if (text === null) return { error: true };
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, time: null };
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) return { invalid: true };
  return { value: new Date(time).toISOString(), time };
}

/** Тип взаимодействия или null, если значение недопустимо. */
function asType(value) {
  const text = asText(value);
  if (text === null) return null;
  const trimmed = text.trim();
  return INTERACTION_TYPES.includes(trimmed) ? trimmed : null;
}

/** Идентификатор или null: пустая строка считается отсутствием значения. */
function asId(value) {
  const text = asText(value);
  if (text === null) return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}


/**
 * Проверяет напоминание: необязательное, не позже планового времени и не в прошлом.
 * @returns {{ error?: string, value: string|null }}
 */
function validateReminder(body, plannedTime, now, requireFuture) {
  const remind = asTimestamp(body.remind_at);
  if (remind.error || remind.invalid) {
    return { error: INTERACTION_FIELD_MESSAGES.remindAt };
  }
  if (remind.value === null) return { value: null };
  if (plannedTime && remind.time > plannedTime) {
    return { error: INTERACTION_FIELD_MESSAGES.remindAtBeforePlan };
  }
  if (requireFuture && remind.time <= now) {
    return { error: INTERACTION_FIELD_MESSAGES.remindAtFuture };
  }
  return { value: remind.value };
}

/**
 * Проверяет план: создание и редактирование.
 * @param {unknown} payload тело запроса
 * @param {{ now?: number, requireFuture?: boolean }} options
 */
export function validatePlanPayload(payload, { now = Date.now(), requireFuture = true } = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const fieldErrors = {};

  const type = asType(body.type);
  if (!type) fieldErrors.type = INTERACTION_FIELD_MESSAGES.type;

  const title = requiredText(body.title, INTERACTION_LIMITS.title);
  if (title.error || title.empty) fieldErrors.title = INTERACTION_FIELD_MESSAGES.title;
  else if (title.tooLong) fieldErrors.title = `Не более ${INTERACTION_LIMITS.title} символов`;

  const plannedAt = asTimestamp(body.planned_at);
  if (plannedAt.error || plannedAt.invalid || plannedAt.value === null) {
    fieldErrors.planned_at = INTERACTION_FIELD_MESSAGES.plannedAt;
  } else if (requireFuture && plannedAt.time <= now) {
    fieldErrors.planned_at = INTERACTION_FIELD_MESSAGES.plannedAtFuture;
  }

  const responsibleUserId = asId(body.responsible_user_id);
  if (!responsibleUserId) {
    fieldErrors.responsible_user_id = INTERACTION_FIELD_MESSAGES.responsible;
  }

  const comment = optionalText(body.plan_comment, INTERACTION_LIMITS.planComment);
  if (comment.error || comment.tooLong) {
    fieldErrors.plan_comment = `Не более ${INTERACTION_LIMITS.planComment} символов`;
  }

  const reminder = validateReminder(body, plannedAt.time, now, requireFuture);
  if (reminder.error) fieldErrors.remind_at = reminder.error;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      type,
      title: title.value,
      planned_at: plannedAt.value,
      responsible_user_id: responsibleUserId,
      plan_comment: comment.value,
      remind_at: reminder.value,
      supplier_contact_id: asId(body.supplier_contact_id),
    },
  };
}

/** Проверяет перенос: новая дата в будущем, причина необязательна. */
export function validateReschedulePayload(payload, { now = Date.now() } = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const fieldErrors = {};

  const plannedAt = asTimestamp(body.planned_at);
  if (plannedAt.error || plannedAt.invalid || plannedAt.value === null) {
    fieldErrors.planned_at = INTERACTION_FIELD_MESSAGES.plannedAt;
  } else if (plannedAt.time <= now) {
    fieldErrors.planned_at = INTERACTION_FIELD_MESSAGES.plannedAtFuture;
  }

  const reason = optionalText(body.reason, INTERACTION_LIMITS.reason);
  if (reason.error || reason.tooLong) {
    fieldErrors.reason = `Не более ${INTERACTION_LIMITS.reason} символов`;
  }

  const reminder = validateReminder(body, plannedAt.time, now, true);
  if (reminder.error) fieldErrors.remind_at = reminder.error;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: { planned_at: plannedAt.value, reason: reason.value, remind_at: reminder.value },
  };
}

/** Проверяет результат: дата факта не в будущем, результат обязателен. */
export function validateResultPayload(payload, { now = Date.now() } = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const fieldErrors = {};

  const type = asType(body.type);
  if (!type) fieldErrors.type = INTERACTION_FIELD_MESSAGES.type;

  const title = requiredText(body.title, INTERACTION_LIMITS.title);
  if (title.error || title.empty) fieldErrors.title = INTERACTION_FIELD_MESSAGES.title;
  else if (title.tooLong) fieldErrors.title = `Не более ${INTERACTION_LIMITS.title} символов`;

  const occurredAt = asTimestamp(body.occurred_at);
  if (occurredAt.error || occurredAt.invalid || occurredAt.value === null) {
    fieldErrors.occurred_at = INTERACTION_FIELD_MESSAGES.occurredAt;
  } else if (occurredAt.time > now + 60_000) {
    fieldErrors.occurred_at = INTERACTION_FIELD_MESSAGES.occurredAtPast;
  }

  const result = requiredText(body.result_text, INTERACTION_LIMITS.resultText);
  if (result.error || result.empty) fieldErrors.result_text = INTERACTION_FIELD_MESSAGES.result;
  else if (result.tooLong) {
    fieldErrors.result_text = `Не более ${INTERACTION_LIMITS.resultText} символов`;
  }

  const nextStep = optionalText(body.next_step, INTERACTION_LIMITS.nextStep);
  if (nextStep.error || nextStep.tooLong) {
    fieldErrors.next_step = `Не более ${INTERACTION_LIMITS.nextStep} символов`;
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      type,
      title: title.value,
      occurred_at: occurredAt.value,
      result_text: result.value,
      next_step: nextStep.value,
      supplier_contact_id: asId(body.supplier_contact_id),
    },
  };
}

/** Проверяет причину отмены: необязательна, до 300 символов. */
export function validateCancelPayload(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const reason = optionalText(body.cancel_reason, INTERACTION_LIMITS.reason);
  if (reason.error || reason.tooLong) {
    return {
      ok: false,
      fieldErrors: { cancel_reason: `Не более ${INTERACTION_LIMITS.reason} символов` },
    };
  }
  return { ok: true, data: { cancel_reason: reason.value } };
}

