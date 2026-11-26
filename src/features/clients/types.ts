/** Типы раздела «Клиенты». */

/** Ответ сервера: клиент в формате контракта API (snake_case). */
export interface ClientDto {
  id: string;
  last_name: string | null;
  first_name: string;
  middle_name: string | null;
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
  res_postal_code?: string | null;
  res_country?: string | null;
  res_city?: string | null;
  res_street?: string | null;
  res_house?: string | null;
  res_building?: string | null;
  res_apartment?: string | null;
  responsible_user_id: string;
  responsible_full_name: string;
  created_at: string;
  updated_at: string;
}

/** Ответ списка клиентов с данными пагинации. */
export interface ClientsPageDto {
  items: ClientDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Пользователь справочника, доступный как ответственный. */
export interface ResponsibleUserDto {
  id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  full_name: string;
}

/** Клиент для интерфейса. */
export interface Client {
  id: string;
  lastName: string | null;
  firstName: string;
  middleName: string | null;
  phone: string;
  email: string | null;
  comment: string | null;
  // Реквизиты: приходят только в карточке клиента.
  regPostalCode?: string | null;
  regCountry?: string | null;
  regCity?: string | null;
  regStreet?: string | null;
  regHouse?: string | null;
  regBuilding?: string | null;
  regApartment?: string | null;
  resPostalCode?: string | null;
  resCountry?: string | null;
  resCity?: string | null;
  resStreet?: string | null;
  resHouse?: string | null;
  resBuilding?: string | null;
  resApartment?: string | null;
  responsibleUserId: string;
  responsibleFullName: string;
  createdAt: string;
  updatedAt: string;
}

/** Страница списка клиентов для интерфейса. */
export interface ClientsPage {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Пользователь, доступный как ответственный. */
export interface ResponsibleUser {
  id: string;
  fullName: string;
}

/** Поля формы создания клиента. */
export interface ClientFormValues {
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
  responsibleUserId: string;
  comment: string;
  regPostalCode: string;
  regCountry: string;
  regCity: string;
  regStreet: string;
  regHouse: string;
  regBuilding: string;
  regApartment: string;
  resPostalCode: string;
  resCountry: string;
  resCity: string;
  resStreet: string;
  resHouse: string;
  resBuilding: string;
  resApartment: string;
}

/** Вкладка окна клиента. */
export type ClientTab = 'main' | 'addresses';

/** Ошибки полей формы. */
export type ClientFormErrors = Partial<Record<keyof ClientFormValues, string>>;

/** Состояние загрузки данных из API. */
export type LoadStatus = 'loading' | 'ready' | 'error';
