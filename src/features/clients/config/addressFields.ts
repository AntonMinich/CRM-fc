/**
 * Реквизиты клиента: адресные поля вкладки «Реквизиты».
 *
 * Лимиты длины совпадают с серверной проверкой (`server/validation.mjs`) и
 * CHECK-ограничениями колонок таблицы «Клиенты». Обязательных полей нет.
 */

import type { ClientFormValues } from '../types';

/** Поля одного адреса в форме. */
export type AddressField =
  | 'regPostalCode'
  | 'regCountry'
  | 'regCity'
  | 'regStreet'
  | 'regHouse'
  | 'regBuilding'
  | 'regApartment'
  | 'resPostalCode'
  | 'resCountry'
  | 'resCity'
  | 'resStreet'
  | 'resHouse'
  | 'resBuilding'
  | 'resApartment';

/** Лимиты длины адресных полей. */
export const ADDRESS_LIMITS: Record<AddressField, number> = {
  regPostalCode: 20,
  regCountry: 100,
  regCity: 100,
  regStreet: 150,
  regHouse: 20,
  regBuilding: 20,
  regApartment: 20,
  resPostalCode: 20,
  resCountry: 100,
  resCity: 100,
  resStreet: 150,
  resHouse: 20,
  resBuilding: 20,
  resApartment: 20,
};

/** Сколько столбцов сетки занимает поле: 3 — половина строки, 2 — треть, 6 — строка. */
type AddressSpan = 2 | 3 | 6;

interface AddressFieldConfig {
  field: AddressField;
  label: string;
  span: AddressSpan;
}

/** Блоки адресов в порядке вывода: адрес регистрации, затем адрес проживания. */
export const ADDRESS_BLOCKS: readonly {
  title: string;
  fields: readonly AddressFieldConfig[];
  /** Блок связан с предыдущим: показывает чекбокс «Совпадает с адресом регистрации». */
  linked?: boolean;
}[] = [
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
    title: 'Адрес проживания',
    linked: true,
    fields: [
      { field: 'resPostalCode', label: 'Индекс', span: 3 },
      { field: 'resCountry', label: 'Страна', span: 3 },
      { field: 'resCity', label: 'Населённый пункт', span: 3 },
      { field: 'resStreet', label: 'Улица', span: 3 },
      { field: 'resHouse', label: 'Дом', span: 2 },
      { field: 'resBuilding', label: 'Корпус', span: 2 },
      { field: 'resApartment', label: 'Квартира', span: 2 },
    ],
  },
];

/** Пары «адрес проживания — адрес регистрации» для чекбокса совпадения. */
export const ADDRESS_PAIRS: readonly { residence: AddressField; registration: AddressField }[] = [
  { residence: 'resPostalCode', registration: 'regPostalCode' },
  { residence: 'resCountry', registration: 'regCountry' },
  { residence: 'resCity', registration: 'regCity' },
  { residence: 'resStreet', registration: 'regStreet' },
  { residence: 'resHouse', registration: 'regHouse' },
  { residence: 'resBuilding', registration: 'regBuilding' },
  { residence: 'resApartment', registration: 'regApartment' },
];

/** Поля адреса проживания в порядке пар. */
export const RESIDENCE_FIELDS: readonly AddressField[] = ADDRESS_PAIRS.map((pair) => pair.residence);

/**
 * Адрес проживания уже совпадает с адресом регистрации: так открывается карточка,
 * у которой адреса одинаковые. Пустой адрес регистрации совпадением не считается,
 * иначе чекбокс включался бы у клиентов без реквизитов.
 */
export function isResidenceSameAsRegistration(values: ClientFormValues): boolean {
  const hasRegistration = ADDRESS_PAIRS.some((pair) => values[pair.registration].trim() !== '');
  if (!hasRegistration) return false;
  return ADDRESS_PAIRS.every((pair) => values[pair.residence] === values[pair.registration]);
}

/** Все адресные поля в порядке вывода. */
export const ADDRESS_FIELDS: readonly AddressField[] = ADDRESS_BLOCKS.flatMap((block) =>
  block.fields.map((item) => item.field),
);

const ADDRESS_FIELD_SET = new Set<string>(ADDRESS_FIELDS);

/** Сообщение об ошибке длины адресного поля. */
export function addressLengthMessage(limit: number): string {
  return `Не более ${limit} символов`;
}

/** Поле относится к вкладке «Реквизиты». */
export function isAddressField(field: keyof ClientFormValues): field is AddressField {
  return ADDRESS_FIELD_SET.has(field);
}
