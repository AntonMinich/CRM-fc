/** Разделы оболочки: CRM, Service Desk и «Задачи». */

export type SectionId = 'crm' | 'service-desk' | 'tasks';

export interface Section {
  id: SectionId;
  /** Маршрут раздела. */
  path: string;
  /** Подпись в меню. */
  label: string;
  /** Заголовок верхней панели. */
  title: string;
}

export const SECTIONS: readonly Section[] = [
  { id: 'crm', path: '/crm', label: 'CRM', title: 'CRM' },
  { id: 'service-desk', path: '/service-desk', label: 'Service Desk', title: 'Service Desk' },
  { id: 'tasks', path: '/tasks', label: 'Задачи', title: 'Задачи' },
];

/** Корень приложения ведёт в CRM. */
export const DEFAULT_SECTION_PATH = '/crm';

export function getSection(id: SectionId): Section {
  const section = SECTIONS.find((item) => item.id === id);
  if (!section) {
    throw new Error(`Неизвестный раздел: ${id}`);
  }
  return section;
}
