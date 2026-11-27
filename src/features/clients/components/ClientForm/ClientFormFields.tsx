/**
 * Поля формы клиента: Фамилия, Имя, Отчество, Телефон, E-mail, Ответственный.
 *
 * Разметка общая для окна создания и карточки редактирования, поэтому состав,
 * порядок и доступность полей совпадают. Идентификаторы полей строятся от
 * `idPrefix`, чтобы оба окна могли находиться в разметке одновременно.
 */

import { Fragment } from 'react';
import type { KeyboardEvent } from 'react';

import { ADDRESS_BLOCKS, ADDRESS_LIMITS } from '../../config/addressFields';
import type { ClientFormValues, ClientTab, LoadStatus, ResponsibleUser } from '../../types';
import { formatClientName } from '../../utils/clientDisplay';
import { CLIENT_LIMITS } from '../../utils/validateClientForm';
import {
  PHONE_PLACEHOLDER,
  formatPhoneFieldValue,
  formatPhoneGhostTail,
  movePhoneCaretAfterPrefix,
} from '../../utils/phone';
import type { ClientFormApi } from './useClientForm';
import {
  InteractionsPanel,
  type InteractionsTabProps,
} from '../../../interactions/components/InteractionsPanel/InteractionsPanel';
import './ClientForm.css';

/** Часть идентификатора поля (kebab-case, как в макете). */
const FIELD_SLUGS: Record<keyof ClientFormValues, string> = {
  lastName: 'last-name',
  firstName: 'first-name',
  middleName: 'middle-name',
  phone: 'phone',
  email: 'email',
  responsibleUserId: 'responsible',
  comment: 'comment',
  regPostalCode: 'reg-postal-code',
  regCountry: 'reg-country',
  regCity: 'reg-city',
  regStreet: 'reg-street',
  regHouse: 'reg-house',
  regBuilding: 'reg-building',
  regApartment: 'reg-apartment',
  resPostalCode: 'res-postal-code',
  resCountry: 'res-country',
  resCity: 'res-city',
  resStreet: 'res-street',
  resHouse: 'res-house',
  resBuilding: 'res-building',
  resApartment: 'res-apartment',
};

/** Вкладки окна: «Установочные данные» открывается по умолчанию. */
const TABS: readonly { id: ClientTab; label: string }[] = [
  { id: 'main', label: 'Установочные данные' },
  { id: 'addresses', label: 'Реквизиты' },
  { id: 'interactions', label: 'Взаимодействия' },
];

interface ClientFormFieldsProps {
  /** Префикс идентификаторов: `create-client` или `edit-client`. */
  idPrefix: string;
  form: ClientFormApi;
  users: ResponsibleUser[];
  usersStatus: LoadStatus;
  /** Поля отключаются на время отправки запроса. */
  disabled?: boolean;
  onRetryUsers: () => void;
  /** Переход в карточку клиента с таким же телефоном (дубль номера). */
  onOpenDuplicate?: (clientId: string) => void;
  /** Вкладка «Взаимодействия»: список, счётчик просроченных и окна. */
  interactions: InteractionsTabProps;
}

export function ClientFormFields({
  idPrefix,
  form,
  users,
  usersStatus,
  disabled = false,
  onRetryUsers,
  onOpenDuplicate,
  interactions,
}: ClientFormFieldsProps) {
  const fieldId = (field: keyof ClientFormValues) => `${idPrefix}-${FIELD_SLUGS[field]}`;
  const errorId = (field: keyof ClientFormValues) => `${idPrefix}-${field}-error`;
  const fieldError = (field: keyof ClientFormValues) => form.errors[field];
  /** Найденный дубль телефона: ФИО показывается ссылкой на его карточку. */
  const duplicate = form.phoneDuplicate;

  const tabId = (tab: ClientTab) => `${idPrefix}-tab-${tab}`;
  const panelId = (tab: ClientTab) => `${idPrefix}-panel-${tab}`;

  /** Стрелки, Home и End переключают вкладки, как принято в tablist. */
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((tab) => tab.id === form.activeTab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;

    event.preventDefault();
    const nextTab = TABS[next].id;
    form.setActiveTab(nextTab);
    window.setTimeout(() => document.getElementById(tabId(nextTab))?.focus(), 0);
  };

  // Префикс +375 показывается всегда обычным текстом, дальше — введённые цифры.
  const phoneValue = formatPhoneFieldValue(form.values.phone);
  // Серые позиции маски: показываются «призрачным» текстом поверх поля.
  const phoneGhostTail = formatPhoneGhostTail(form.values.phone);

  return (
    <div className="client-form__body">
      <div className="client-tabs" role="tablist" aria-label="Разделы карточки клиента">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            className={`client-tab${form.activeTab === tab.id ? ' client-tab--active' : ''}`}
            aria-selected={form.activeTab === tab.id}
            aria-controls={panelId(tab.id)}
            tabIndex={form.activeTab === tab.id ? 0 : -1}
            onClick={() => form.setActiveTab(tab.id)}
            onKeyDown={handleTabKeyDown}
          >
            {tab.id === 'interactions' ? (
              <>
                Взаимодействия
                {interactions.overdue > 0 ? (
                  <span className="client-tab__count"> ({interactions.overdue})</span>
                ) : null}
              </>
            ) : (
              tab.label
            )}
          </button>
        ))}
      </div>

      <div
        className="client-form__fields"
        role="tabpanel"
        id={panelId('main')}
        aria-labelledby={tabId('main')}
        hidden={form.activeTab !== 'main'}
      >
      <label className="client-field" htmlFor={fieldId('lastName')}>
        <span className="client-field__label">Фамилия</span>
        <input
          id={fieldId('lastName')}
          className="client-field__input"
          ref={form.refs.lastName}
          value={form.values.lastName}
          onChange={(event) => form.updateField('lastName', event.target.value)}
          autoComplete="family-name"
          maxLength={100}
          disabled={disabled}
        />
      </label>

      <label className="client-field" htmlFor={fieldId('firstName')}>
        <span className="client-field__label">
          Имя <span className="client-field__required">*</span>
        </span>
        <input
          id={fieldId('firstName')}
          className="client-field__input"
          ref={form.refs.firstName}
          value={form.values.firstName}
          onChange={(event) => form.updateField('firstName', event.target.value)}
          autoComplete="given-name"
          maxLength={100}
          required
          aria-required="true"
          aria-invalid={Boolean(fieldError('firstName'))}
          aria-describedby={fieldError('firstName') ? errorId('firstName') : undefined}
          disabled={disabled}
        />
        {fieldError('firstName') ? (
          <span className="client-field__error" id={errorId('firstName')}>
            {fieldError('firstName')}
          </span>
        ) : null}
      </label>

      <label className="client-field" htmlFor={fieldId('middleName')}>
        <span className="client-field__label">Отчество</span>
        <input
          id={fieldId('middleName')}
          className="client-field__input"
          ref={form.refs.middleName}
          value={form.values.middleName}
          onChange={(event) => form.updateField('middleName', event.target.value)}
          autoComplete="additional-name"
          maxLength={100}
          disabled={disabled}
        />
      </label>

      <label className="client-field" htmlFor={fieldId('phone')}>
        <span className="client-field__label">
          Телефон <span className="client-field__required">*</span>
        </span>
        <span className="client-field__phone">
          <input
            id={fieldId('phone')}
            className="client-field__input"
            ref={form.refs.phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={PHONE_PLACEHOLDER}
            value={phoneValue}
            onChange={(event) => form.updatePhone(event.target.value)}
            onBlur={form.handlePhoneBlur}
            onKeyDown={form.handlePhoneKeyDown}
            onFocus={(event) => movePhoneCaretAfterPrefix(event.currentTarget)}
            onClick={(event) => movePhoneCaretAfterPrefix(event.currentTarget)}
            disabled={disabled}
            required
            aria-required="true"
            aria-invalid={Boolean(fieldError('phone'))}
            aria-describedby={fieldError('phone') ? errorId('phone') : undefined}
          />
          {/* Серые позиции маски: часть, совпадающая с введённым, прозрачна. */}
          <span className="client-field__phone-ghost" aria-hidden="true">
            <span className="client-field__phone-ghost-typed">{phoneValue}</span>
            {phoneGhostTail}
          </span>
        </span>
        {fieldError('phone') ? (
          <span className="client-field__error" id={errorId('phone')}>
            {duplicate ? (
              <>
                {fieldError('phone')}
                <button
                  type="button"
                  className="client-field__link"
                  onClick={() => onOpenDuplicate?.(duplicate.id)}
                >
                  {formatClientName(duplicate)}
                </button>
              </>
            ) : (
              fieldError('phone')
            )}
          </span>
        ) : null}
      </label>

      <label className="client-field" htmlFor={fieldId('email')}>
        <span className="client-field__label">E-mail</span>
        <input
          id={fieldId('email')}
          className="client-field__input"
          ref={form.refs.email}
          type="email"
          value={form.values.email}
          onChange={(event) => form.updateField('email', event.target.value)}
          autoComplete="email"
          maxLength={254}
          aria-invalid={Boolean(fieldError('email'))}
          aria-describedby={fieldError('email') ? errorId('email') : undefined}
          disabled={disabled}
        />
        {fieldError('email') ? (
          <span className="client-field__error" id={errorId('email')}>
            {fieldError('email')}
          </span>
        ) : null}
      </label>

      <label className="client-field" htmlFor={fieldId('responsibleUserId')}>
        <span className="client-field__label">
          Ответственный <span className="client-field__required">*</span>
        </span>
        <select
          id={fieldId('responsibleUserId')}
          className="client-field__input"
          ref={form.refs.responsibleUserId}
          value={form.values.responsibleUserId}
          onChange={(event) => form.updateField('responsibleUserId', event.target.value)}
          disabled={disabled || usersStatus !== 'ready'}
          required
          aria-required="true"
          aria-invalid={Boolean(fieldError('responsibleUserId'))}
          aria-describedby={
            fieldError('responsibleUserId') ? errorId('responsibleUserId') : undefined
          }
        >
          {usersStatus === 'loading' ? <option value="">Загрузка…</option> : null}
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </select>
        {usersStatus === 'error' ? (
          <span className="client-field__error" role="alert">
            Не удалось загрузить список ответственных
            <button type="button" className="client-field__retry" onClick={onRetryUsers}>
              Повторить
            </button>
          </span>
        ) : null}
        {fieldError('responsibleUserId') ? (
          <span className="client-field__error" id={errorId('responsibleUserId')}>
            {fieldError('responsibleUserId')}
          </span>
        ) : null}
      </label>

      {/* Комментарий: необязательное многострочное поле после ответственного. */}
      <label className="client-field" htmlFor={fieldId('comment')}>
        <span className="client-field__label">Комментарий</span>
        <textarea
          id={fieldId('comment')}
          className="client-field__input client-field__textarea"
          ref={form.refs.comment}
          value={form.values.comment}
          onChange={(event) => form.updateField('comment', event.target.value)}
          rows={4}
          maxLength={CLIENT_LIMITS.comment}
          aria-invalid={Boolean(fieldError('comment'))}
          aria-describedby={fieldError('comment') ? errorId('comment') : undefined}
          disabled={disabled}
        />
        {fieldError('comment') ? (
          <span className="client-field__error" id={errorId('comment')}>
            {fieldError('comment')}
          </span>
        ) : null}
        <span className="client-field__counter">
          {form.values.comment.length} / {CLIENT_LIMITS.comment}
        </span>
      </label>

      </div>

      <div
        className="client-form__fields"
        role="tabpanel"
        id={panelId('addresses')}
        aria-labelledby={tabId('addresses')}
        hidden={form.activeTab !== 'addresses'}
      >
        {ADDRESS_BLOCKS.map((block, index) => (
          <Fragment key={block.title}>
            {/* Линия — отдельный элемент над заголовком следующего блока. */}
            {index > 0 ? <div className="client-address__divider" aria-hidden="true" /> : null}
            <fieldset className="client-address">
              <legend className="client-address__title">{block.title}</legend>
              {block.linked ? (
                <label className="client-address__same" htmlFor={`${idPrefix}-res-same`}>
                  <input
                    id={`${idPrefix}-res-same`}
                    type="checkbox"
                    className="client-address__same-input"
                    checked={form.sameAddress}
                    onChange={(event) => form.toggleSameAddress(event.target.checked)}
                    disabled={disabled}
                  />
                  Совпадает с адресом регистрации
                </label>
              ) : null}
              <div className="client-address__grid">
              {block.fields.map(({ field, label, span }) => {
                // Поля скопированного адреса недоступны для правки.
                const locked = Boolean(block.linked) && form.sameAddress;
                return (
                  <label
                    className={`client-field client-address__field client-address__field--span-${span}${
                      locked ? ' client-address__field--locked' : ''
                    }`}
                    htmlFor={fieldId(field)}
                    key={field}
                  >
                    <span className="client-field__label">{label}</span>
                    <input
                      id={fieldId(field)}
                      className="client-field__input"
                      ref={form.refs[field]}
                      value={form.values[field]}
                      onChange={(event) => form.updateField(field, event.target.value)}
                      maxLength={ADDRESS_LIMITS[field]}
                      aria-invalid={Boolean(fieldError(field))}
                      aria-describedby={fieldError(field) ? errorId(field) : undefined}
                      disabled={disabled || locked}
                    />
                    {fieldError(field) ? (
                      <span className="client-field__error" id={errorId(field)}>
                        {fieldError(field)}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
          </Fragment>
        ))}
      </div>
      <div
        className="client-form__fields client-form__fields--interactions"
        role="tabpanel"
        id={panelId('interactions')}
        aria-labelledby={tabId('interactions')}
        hidden={form.activeTab !== 'interactions'}
      >
        <InteractionsPanel
          owner={interactions.owner}
          ownerId={interactions.ownerId}
          overdue={interactions.overdue}
          onOverdueChange={interactions.onOverdueChange}
          entry={interactions.entry ?? null}
        />
      </div>



    </div>
  );
}