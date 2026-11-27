/**
 * Вкладка «Реквизиты» поставщика: адреса и банковские реквизиты.
 *
 * Лимиты длины совпадают с серверной проверкой (`server/suppliersValidation.mjs`)
 * и CHECK-ограничениями колонок таблицы `suppliers`. Обязательных полей нет.
 */

import type { SupplierFormValues } from '../types';

/** Поля вкладки «Реквизиты»: адреса и банковские реквизиты. */
export type DetailField =
  | 'regPostalCode'
  | 'regCountry'
  | 'regCity'
  | 'regStreet'
  | 'regHouse'
  | 'regBuilding'
  | 'regApartment'
  | 'postPostalCode'
  | 'postCountry'
  | 'postCity'
  | 'postStreet'
  | 'postHouse'
  | 'postBuilding'
  | 'postApartment'
  | 'bankAccount'
  | 'bankName'
  | 'bicSwift'
  | 'directorName';

/** Поле одного блока вкладки «Реквизиты». */
export interface SupplierFieldConfig {
  field: DetailField;
  label: string;
  /** Сколько столбцов сетки занимает поле: 6 — строка, 3 — половина, 2 — треть. */
  span: 2 | 3 | 6;
  /** Значение приводится к верхнему регистру при вводе. */
  upper?: boolean;
}

export interface SupplierBlockConfig {
  title: string;
  fields: readonly SupplierFieldConfig[];
  /** Блок связан с адресом регистрации: показывает чекбокс «Совпадает с адресом регистрации». */
  linked?: boolean;
}

/** Лимиты длины полей вкладки «Реквизиты». */
export const DETAIL_LIMITS: Record<string, number> = {
  regPostalCode: 20,
  regCountry: 100,
  regCity: 100,
  regStreet: 150,
  regHouse: 20,
  regBuilding: 20,
  regApartment: 20,
  postPostalCode: 20,
  postCountry: 100,
  postCity: 100,
  postStreet: 150,
  postHouse: 20,
  postBuilding: 20,
  postApartment: 20,
  bankAccount: 34,
  bankName: 150,
  bicSwift: 11,
  directorName: 150,
};

/** Блоки вкладки «Реквизиты» в порядке вывода. */
export const DETAIL_BLOCKS: readonly SupplierBlockConfig[] = [
  {
    title: 'Адрес регистрации',
    fields: [
      { field: 'regPostalCode', label: 'Индекс', span: 3 },
      { field: 'regCountry', label: 'Страна', span: 3 },
      { field: 'regCity', label: 'Населённый пункт', span: 3 },
      { field: 'regStreet', label: 'Улица', span: 3 },
      { field: 'regHouse', label: 'Дом', span: 2 },
      { field: 'regBuilding', label: 'Корпус', span: 2 },
      { field: 'regApartment', label: 'Квартира', span: 2 },
    ],
  },
  {
    title: 'Почтовый адрес',
    linked: true,
    fields: [
      { field: 'postPostalCode', label: 'Индекс', span: 3 },
      { field: 'postCountry', label: 'Страна', span: 3 },
      { field: 'postCity', label: 'Населённый пункт', span: 3 },
      { field: 'postStreet', label: 'Улица', span: 3 },
      { field: 'postHouse', label: 'Дом', span: 2 },
      { field: 'postBuilding', label: 'Корпус', span: 2 },
      { field: 'postApartment', label: 'Квартира', span: 2 },
    ],
  },
  {
    title: 'Банковские реквизиты и руководитель',
    fields: [
      // Порядок подобран под раскладку: Расчётный счёт + BIC/SWIFT в одной
      // строке, Банк + Директор — в следующей.
      { field: 'bankAccount', label: 'Расчётный счёт', span: 3, upper: true },
      { field: 'bicSwift', label: 'BIC/SWIFT', span: 3, upper: true },
      { field: 'bankName', label: 'Банк', span: 3 },
      { field: 'directorName', label: 'Директор', span: 3 },
    ],
  },
];

/** Поля вкладки «Реквизиты» в порядке вывода. */
export const DETAIL_FIELDS: readonly DetailField[] = DETAIL_BLOCKS.flatMap((block) =>
  block.fields.map((item) => item.field),
);

const DETAIL_FIELD_SET = new Set<string>(DETAIL_FIELDS);

/** Поле относится к вкладке «Реквизиты». */
export function isDetailField(field: keyof SupplierFormValues): field is DetailField {
  return DETAIL_FIELD_SET.has(field);
}

/** Пары «почтовый адрес — адрес регистрации» для чекбокса совпадения. */
export const POSTAL_PAIRS = [
  { postal: 'postPostalCode', registration: 'regPostalCode' },
  { postal: 'postCountry', registration: 'regCountry' },
  { postal: 'postCity', registration: 'regCity' },
  { postal: 'postStreet', registration: 'regStreet' },
  { postal: 'postHouse', registration: 'regHouse' },
  { postal: 'postBuilding', registration: 'regBuilding' },
  { postal: 'postApartment', registration: 'regApartment' },
] as const;

/** Поля почтового адреса в порядке пар. */
export const POSTAL_FIELDS: readonly (keyof SupplierFormValues)[] = POSTAL_PAIRS.map(
  (pair) => pair.postal,
);

/**
 * Почтовый адрес уже совпадает с адресом регистрации: так открывается карточка,
 * у которой адреса одинаковые. Пустой адрес регистрации совпадением не считается.
 */
export function isPostalSameAsRegistration(values: SupplierFormValues): boolean {
  const hasRegistration = POSTAL_PAIRS.some((pair) => values[pair.registration].trim() !== '');
  if (!hasRegistration) return false;
  return POSTAL_PAIRS.every((pair) => values[pair.postal] === values[pair.registration]);
}

/** Сообщение об ошибке длины поля реквизитов. */
export function detailLengthMessage(limit: number): string {
  return `Не более ${limit} символов`;
}
