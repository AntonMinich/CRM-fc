/** Типы раздела «Клиенты». */

/** Ответ сервера: клиент в формате контракта API (snake_case). */
export interface ClientDto {
  id: string;
  last_name: string | null;
  first_name: string;
  middle_name: string | null;
  phone: string;
  email: string | null;
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
}

/** Ошибки полей формы. */
export type ClientFormErrors = Partial<Record<keyof ClientFormValues, string>>;

/** Состояние загрузки данных из API. */
export type LoadStatus = 'loading' | 'ready' | 'error';
