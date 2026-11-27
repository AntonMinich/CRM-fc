/** Справочники и лимиты вкладки «Взаимодействия». */

import type {
  InteractionFilter,
  InteractionStatus,
  InteractionType,
  ReminderOption,
} from '../types';

/** Лимиты длины: те же значения в форме, API и базе. */
export const INTERACTION_LIMITS = {
  title: 200,
  planComment: 500,
  resultText: 1000,
  nextStep: 500,
  reason: 300,
} as const;

/** Типы взаимодействий для выпадающего списка. */
export const INTERACTION_TYPES: readonly { value: InteractionType; label: string }[] = [
  { value: 'call', label: 'Звонок' },
  { value: 'meeting', label: 'Встреча' },
  { value: 'letter', label: 'Письмо' },
  { value: 'other', label: 'Другое' },
];

/** Подписи статусов и меток. */
export const STATUS_LABELS: Record<InteractionStatus | 'overdue', string> = {
  planned: 'Запланировано',
  overdue: 'Просрочено',
  done: 'Выполнено',
  cancelled: 'Отменено',
};

/** Быстрые фильтры над таблицей. */
export const FILTERS: readonly { value: InteractionFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'planned', label: 'Запланировано' },
  { value: 'overdue', label: 'Просрочено' },
  { value: 'done', label: 'Выполнено' },
];

/** Варианты напоминания. */
export const REMINDER_OPTIONS: readonly { value: ReminderOption; label: string }[] = [
  { value: 'none', label: 'Не напоминать' },
  { value: 'at_start', label: 'В момент начала' },
  { value: 'before_15', label: 'За 15 минут' },
  { value: 'custom', label: 'Своё время' },
];

/** За сколько минут до планового времени напоминать при быстром выборе. */
export const BEFORE_MINUTES = 15;

/** Интервал опроса сервера на новые напоминания. */
export const REMINDER_POLL_MS = 60 * 1000;

/** Подпись типа взаимодействия. */
export function typeLabel(type: InteractionType): string {
  return INTERACTION_TYPES.find((item) => item.value === type)?.label ?? 'Другое';
}
