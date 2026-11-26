/** Отображение значений поставщика в таблице. */

import { formatPhoneForDisplay } from '../../clients/utils/phone';
import type { Supplier } from '../types';

/** УНП в списке; пустое значение показывается прочерком. */
export function formatSupplierUnp(supplier: Pick<Supplier, 'unp'>): string {
  const unp = (supplier.unp ?? '').trim();
  return unp === '' ? '—' : unp;
}

/** Пустой необязательный E-mail показывается прочерком. */
export function formatSupplierEmail(supplier: Pick<Supplier, 'email'>): string {
  const email = (supplier.email ?? '').trim();
  return email === '' ? '—' : email;
}

/** Сколько символов комментария показывается в списке. */
export const COMMENT_PREVIEW_LENGTH = 50;

/**
 * Комментарий для списка: переводы строк и повторные пробелы заменяются одним
 * пробелом, показываются первые 50 символов, остальное — многоточием.
 * Полный текст читается в карточке поставщика.
 */
export function formatSupplierComment(supplier: Pick<Supplier, 'comment'>): string {
  const text = (supplier.comment ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return '—';
  return text.length > COMMENT_PREVIEW_LENGTH
    ? `${text.slice(0, COMMENT_PREVIEW_LENGTH)}…`
    : text;
}

/**
 * Телефон в читаемом формате +375 (XX) XXX-XX-XX.
 * Номера, сохранённые в другом формате, показываются как есть.
 */
export function formatSupplierPhone(supplier: Pick<Supplier, 'phone'>): string {
  return formatPhoneForDisplay(supplier.phone);
}

/** Доступное имя кнопки открытия карточки: «Открыть карточку поставщика …». */
export function supplierOpenLabel(supplier: Pick<Supplier, 'name'>): string {
  const name = (supplier.name ?? '').trim();
  return name === '' ? 'Открыть карточку поставщика' : `Открыть карточку поставщика ${name}`;
}
