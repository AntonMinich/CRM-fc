/** Типы раздела «Взаимодействия» (вкладка карточек клиента и поставщика). */

/** Тип взаимодействия. */
export type InteractionType = 'call' | 'meeting' | 'letter' | 'other';

/** Статус взаимодействия. Просрочено — отображение плана, не статус. */
export type InteractionStatus = 'planned' | 'done' | 'cancelled';

/** Быстрый фильтр списка. */
export type InteractionFilter = 'all' | 'planned' | 'overdue' | 'done';

/** Вариант напоминания. */
export type ReminderOption = 'none' | 'at_start' | 'before_15' | 'custom';

/** Владелец взаимодействия: карточка клиента или поставщика. */
export type InteractionOwner = 'client' | 'supplier';

/** Тип контрагента для фильтра общего раздела. */
export type InteractionOwnerFilter = 'all' | 'client' | 'supplier';

/** Фильтры общего раздела CRM «Взаимодействия». */
export interface AllInteractionsFilters {
  status: InteractionFilter;
  /** Идентификатор ответственного или `all`. */
  responsible: string;
  /** Только мои: ответственный — текущий пользователь. */
  mine: boolean;
  ownerType: InteractionOwnerFilter;
  /** Дата с (YYYY-MM-DD) по плановой дате, для записей без плана — по дате факта. */
  dateFrom: string;
  dateTo: string;
  search: string;
  page: number;
  pageSize: number;
}

/** Ответ общего списка: страница, общее число и просроченные текущего пользователя. */
export interface AllInteractionsPage {
  items: Interaction[];
  total: number;
  overdue: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Ответ сервера: взаимодействие в формате контракта API (snake_case). */
export interface InteractionDto {
  id: string;
  client_id: string | null;
  supplier_id: string | null;
  type: InteractionType;
  title: string;
  planned_at: string | null;
  status: InteractionStatus;
  responsible_user_id: string;
  responsible_full_name: string;
  plan_comment: string | null;
  remind_at: string | null;
  reminder_shown_at: string | null;
  reminder_dismissed: boolean;
  supplier_contact_id: string | null;
  supplier_contact_name: string | null;
  result_text: string | null;
  occurred_at: string | null;
  next_step: string | null;
  cancel_reason: string | null;
  completed_by_user_id: string | null;
  completed_by_full_name: string | null;
  completed_at: string | null;
  edited_by_user_id: string | null;
  edited_by_full_name: string | null;
  edited_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
  can_edit_result: boolean;
  /** Сколько раз переносили: нужен значок «Перенесено» в списке. */
  reschedule_count?: number;
  client_name: string | null;
  supplier_name: string | null;
  reschedules?: InteractionRescheduleDto[];
}

/** Ответ сервера: запись истории переносов. */
export interface InteractionRescheduleDto {
  id: string;
  old_planned_at: string;
  new_planned_at: string;
  reason: string | null;
  changed_by_user_id: string;
  changed_by_full_name: string;
  changed_at: string;
}

/** Ответ сервера: список взаимодействий с числом просроченных. */
export interface InteractionsPageDto {
  items: InteractionDto[];
  total: number;
  overdue: number;
}

/** Запись истории переносов для интерфейса. */
export interface InteractionReschedule {
  id: string;
  oldPlannedAt: string;
  newPlannedAt: string;
  reason: string | null;
  changedByUserId: string;
  changedByFullName: string;
  changedAt: string;
}

/** Взаимодействие для интерфейса. */
export interface Interaction {
  id: string;
  clientId: string | null;
  supplierId: string | null;
  type: InteractionType;
  title: string;
  plannedAt: string | null;
  status: InteractionStatus;
  responsibleUserId: string;
  responsibleFullName: string;
  planComment: string | null;
  remindAt: string | null;
  reminderDismissed: boolean;
  supplierContactId: string | null;
  supplierContactName: string | null;
  resultText: string | null;
  occurredAt: string | null;
  nextStep: string | null;
  cancelReason: string | null;
  completedByUserId: string | null;
  completedByFullName: string | null;
  completedAt: string | null;
  editedByUserId: string | null;
  editedByFullName: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  canEditResult: boolean;
  /** Сколько раз переносили: значок «Перенесено» в списке. */
  rescheduleCount: number;
  clientName: string | null;
  supplierName: string | null;
  reschedules: InteractionReschedule[];
}

/** Список взаимодействий для интерфейса. */
export interface InteractionsPage {
  items: Interaction[];
  total: number;
  overdue: number;
}

/** Значения формы: план, перенос и результат используют один набор полей. */
export interface InteractionFormValues {
  type: InteractionType;
  plannedAt: string;
  title: string;
  responsibleUserId: string;
  contactId: string;
  planComment: string;
  reminderOption: ReminderOption;
  remindAt: string;
  occurredAt: string;
  resultText: string;
  nextStep: string;
  reason: string;
  cancelReason: string;
}

/** Ошибки полей формы взаимодействия. */
export type InteractionFormErrors = Partial<Record<keyof InteractionFormValues, string>>;

/** Режим окна взаимодействия. */
export type InteractionModalMode = 'plan' | 'reschedule' | 'result' | 'view';

/** Переход из напоминания: какую запись открыть и в каком режиме. */
export interface InteractionEntry {
  interactionId: string;
  mode: InteractionModalMode;
}
