/** Отображение взаимодействий: даты, статусы, порядок строк. */

import { STATUS_LABELS } from '../config/interactionFields';
import type { Interaction } from '../types';

/** Статус для показа: просроченное запланированное показывается как «Просрочено». */
export function interactionStatusKey(
  interaction: Pick<Interaction, 'status' | 'isOverdue'>,
): 'planned' | 'overdue' | 'done' | 'cancelled' {
  if (interaction.status === 'planned') return interaction.isOverdue ? 'overdue' : 'planned';
  return interaction.status;
}

/** Подпись статуса. */
export function interactionStatusLabel(
  interaction: Pick<Interaction, 'status' | 'isOverdue'>,
): string {
  return STATUS_LABELS[interactionStatusKey(interaction)];
}

/** Дата и время в формате дд.мм.гггг чч:мм. */
export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Значение для поля datetime-local. */
export function toDateTimeLocalValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Значение поля datetime-local в ISO-формат или null. */
export function fromDateTimeLocalValue(value: string): string | null {
  const text = value.trim();
  if (text === '') return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Текущее время для поля datetime-local. */
export function nowDateTimeLocalValue(): string {
  return toDateTimeLocalValue(new Date().toISOString());
}

/** Контрагент взаимодействия: тип, идентификатор и наименование. */
export interface InteractionCounterparty {
  type: 'client' | 'supplier';
  id: string;
  name: string;
}

/** Контрагент для колонки «Контрагент» и ссылки на карточку. */
export function counterpartyOf(interaction: Interaction): InteractionCounterparty {
  if (interaction.clientId) {
    return { type: 'client', id: interaction.clientId, name: interaction.clientName ?? '' };
  }
  return { type: 'supplier', id: interaction.supplierId ?? '', name: interaction.supplierName ?? '' };
}

/** Подпись типа контрагента для метки в таблице. */
export function counterpartyTypeLabel(type: InteractionCounterparty['type']): string {
  return type === 'client' ? 'Клиент' : 'Поставщик';
}

/** Ссылка на карточку контрагента с открытой вкладкой «Взаимодействия». */
export function counterpartyCardHref(interaction: Interaction): string {
  const counterparty = counterpartyOf(interaction);
  const section = counterparty.type === 'client' ? 'clients' : 'suppliers';
  const params = new URLSearchParams({
    open: counterparty.id,
    tab: 'interactions',
    interaction: interaction.id,
  });
  return `/crm/${section}?${params.toString()}`;
}

/**
 * Порядок строк: сначала запланированные по ближайшей дате (просроченные выше),
 * затем выполненные и отменённые по убыванию даты.
 */
export function sortInteractions(items: Interaction[]): Interaction[] {
  const rank = (item: Interaction) => (item.status === 'planned' ? 0 : 1);
  return [...items].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    const leftTime = Date.parse(left.plannedAt ?? left.occurredAt ?? '') || 0;
    const rightTime = Date.parse(right.plannedAt ?? right.occurredAt ?? '') || 0;
    return left.status === 'planned' ? leftTime - rightTime : rightTime - leftTime;
  });
}

/** Строка истории переносов: «Пользователь, дата: с … на …. Причина: …». */
export function rescheduleText(
  reschedule: Pick<
    Interaction['reschedules'][number],
    'changedByFullName' | 'changedAt' | 'oldPlannedAt' | 'newPlannedAt' | 'reason'
  >,
): string {
  const base = `${reschedule.changedByFullName}, ${formatDateTime(reschedule.changedAt)}: с ${formatDateTime(
    reschedule.oldPlannedAt,
  )} на ${formatDateTime(reschedule.newPlannedAt)}`;
  return reschedule.reason ? `${base}. Причина: ${reschedule.reason}` : base;
}

/** Пометка о том, кто и когда изменил результат. */
export function editMark(interaction: Pick<Interaction, 'editedAt' | 'editedByFullName'>): string {
  return `Изменено: ${interaction.editedByFullName ?? ''}, ${formatDateTime(interaction.editedAt)}`;
}
