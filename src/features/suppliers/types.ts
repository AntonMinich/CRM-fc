/** Типы раздела «Поставщики». */

/** Ответ сервера: поставщик в формате контракта API (snake_case). */
export interface SupplierDto {
  id: string;
  name: string;
  unp: string;
  phone: string;
  email: string | null;
  comment: string | null;
  // Реквизиты приходят только в ответе карточки, в списке их нет.
  reg_postal_code?: string | null;
  reg_country?: string | null;
  reg_city?: string | null;
  reg_street?: string | null;
  reg_house?: string | null;
  reg_building?: string | null;
  reg_apartment?: string | null;
  post_postal_code?: string | null;
  post_country?: string | null;
  post_city?: string | null;
  post_street?: string | null;
  post_house?: string | null;
  post_building?: string | null;
  post_apartment?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  bic_swift?: string | null;
  director_name?: string | null;
  /** Предупреждение о дубле телефона: приходит только в успешном ответе. */
  duplicate_phone_with?: { items: { id: string; name: string }[]; total: number } | null;
  created_at: string;
  updated_at: string;
}

/** Ответ списка поставщиков с данными пагинации. */
export interface SuppliersPageDto {
  items: SupplierDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Найденный поставщик: только идентификатор и наименование. */
export interface DuplicateSupplier {
  id: string;
  name: string;
}

/** Другие поставщики с таким же телефоном: до трёх наименований и общее количество. */
export interface DuplicatePhoneWarning {
  items: DuplicateSupplier[];
  total: number;
}

/** Поставщик для интерфейса. */
export interface Supplier {
  id: string;
  name: string;
  unp: string;
  phone: string;
  email: string | null;
  comment: string | null;
  regPostalCode?: string | null;
  regCountry?: string | null;
  regCity?: string | null;
  regStreet?: string | null;
  regHouse?: string | null;
  regBuilding?: string | null;
  regApartment?: string | null;
  postPostalCode?: string | null;
  postCountry?: string | null;
  postCity?: string | null;
  postStreet?: string | null;
  postHouse?: string | null;
  postBuilding?: string | null;
  postApartment?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  bicSwift?: string | null;
  directorName?: string | null;
  /** Предупреждение о дубле телефона: приходит только в ответе сохранения. */
  duplicatePhoneWith?: DuplicatePhoneWarning | null;
  createdAt: string;
  updatedAt: string;
}

/** Страница списка поставщиков для интерфейса. */
export interface SuppliersPage {
  items: Supplier[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Поля формы поставщика. */
export interface SupplierFormValues {
  name: string;
  unp: string;
  phone: string;
  email: string;
  comment: string;
  regPostalCode: string;
  regCountry: string;
  regCity: string;
  regStreet: string;
  regHouse: string;
  regBuilding: string;
  regApartment: string;
  postPostalCode: string;
  postCountry: string;
  postCity: string;
  postStreet: string;
  postHouse: string;
  postBuilding: string;
  postApartment: string;
  bankAccount: string;
  bankName: string;
  bicSwift: string;
  directorName: string;
}

/** Ошибки полей формы. */
export type SupplierFormErrors = Partial<Record<keyof SupplierFormValues, string>>;

/** Вкладка окна поставщика. */
export type SupplierTab = 'main' | 'details';

/** Состояние загрузки данных из API. */
export type LoadStatus = 'loading' | 'ready' | 'error';
