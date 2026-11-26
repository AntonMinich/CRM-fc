/**
 * Поля формы поставщика: вкладки «Установочные данные» и «Реквизиты».
 *
 * Разметка, идентификаторы и стили повторяют окно клиента, поэтому оформление
 * берётся из клиентских классов (`clients/components/ClientForm/ClientForm.css`).
 */

import { Fragment } from 'react';
import type { KeyboardEvent } from 'react';

import { DETAIL_BLOCKS, DETAIL_LIMITS } from '../../config/supplierFields';
import { SUPPLIER_LIMITS } from '../../utils/validateSupplierForm';
import type { SupplierFormValues, SupplierTab } from '../../types';
import {
  PHONE_PLACEHOLDER,
  formatPhoneFieldValue,
  formatPhoneGhostTail,
  movePhoneCaretAfterPrefix,
} from '../../../clients/utils/phone';
import type { SupplierFormApi } from './useSupplierForm';
import '../../../clients/components/ClientForm/ClientForm.css';

/** Часть идентификатора поля (kebab-case, как в макете). */
const FIELD_SLUGS: Record<keyof SupplierFormValues, string> = {
  name: 'name',
  unp: 'unp',
  phone: 'phone',
  email: 'email',
  comment: 'comment',
  regPostalCode: 'reg-postal-code',
  regCountry: 'reg-country',
  regCity: 'reg-city',
  regStreet: 'reg-street',
  regHouse: 'reg-house',
  regBuilding: 'reg-building',
  regApartment: 'reg-apartment',
  postPostalCode: 'post-postal-code',
  postCountry: 'post-country',
  postCity: 'post-city',
  postStreet: 'post-street',
  postHouse: 'post-house',
  postBuilding: 'post-building',
  postApartment: 'post-apartment',
  bankAccount: 'bank-account',
  bankName: 'bank-name',
  bicSwift: 'bic-swift',
  directorName: 'director-name',
};

/** Вкладки окна: «Установочные данные» открывается по умолчанию. */
const TABS: readonly { id: SupplierTab; label: string }[] = [
  { id: 'main', label: 'Установочные данные' },
  { id: 'details', label: 'Реквизиты' },
];

interface SupplierFormFieldsProps {
  /** Префикс идентификаторов: `create-supplier` или `edit-supplier`. */
  idPrefix: string;
  form: SupplierFormApi;
  /** Поля отключаются на время отправки запроса. */
  disabled?: boolean;
  /** Переход в карточку поставщика с таким же телефоном (дубль номера). */
  onOpenDuplicate?: (supplierId: string) => void;
}

export function SupplierFormFields({
  idPrefix,
  form,
  disabled = false,
  onOpenDuplicate,
}: SupplierFormFieldsProps) {
  const fieldId = (field: keyof SupplierFormValues) => `${idPrefix}-${FIELD_SLUGS[field]}`;
  const errorId = (field: keyof SupplierFormValues) => `${idPrefix}-${field}-error`;
  const fieldError = (field: keyof SupplierFormValues) => form.errors[field];
  /** Найденный поставщик с таким же УНП: наименование показывается ссылкой. */
  const unpDuplicate = form.unpDuplicate;

  const tabId = (tab: SupplierTab) => `${idPrefix}-tab-${tab}`;
  const panelId = (tab: SupplierTab) => `${idPrefix}-panel-${tab}`;

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
      <div className="client-tabs" role="tablist" aria-label="Разделы карточки поставщика">
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
            {tab.label}
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
        <label className="client-field" htmlFor={fieldId('name')}>
          <span className="client-field__label">
            Наименование компании <span className="client-field__required">*</span>
          </span>
          <input
            id={fieldId('name')}
            className="client-field__input"
            ref={form.refs.name}
            value={form.values.name}
            onChange={(event) => form.updateField('name', event.target.value)}
            maxLength={SUPPLIER_LIMITS.name}
            required
            aria-required="true"
            aria-invalid={Boolean(fieldError('name'))}
            aria-describedby={fieldError('name') ? errorId('name') : undefined}
            disabled={disabled}
          />
          {fieldError('name') ? (
            <span className="client-field__error" id={errorId('name')}>
              {fieldError('name')}
            </span>
          ) : null}
        </label>

        <label className="client-field" htmlFor={fieldId('unp')}>
          <span className="client-field__label">
            УНП <span className="client-field__required">*</span>
          </span>
          <input
            id={fieldId('unp')}
            className="client-field__input"
            ref={form.refs.unp}
            value={form.values.unp}
            inputMode="numeric"
            autoComplete="off"
            // В поле допускаются только цифры, длина ограничена девятью знаками.
            onChange={(event) =>
              form.updateField(
                'unp',
                event.target.value.replace(/\D/g, '').slice(0, SUPPLIER_LIMITS.unp),
              )
            }
            maxLength={SUPPLIER_LIMITS.unp}
            required
            aria-required="true"
            aria-invalid={Boolean(fieldError('unp'))}
            aria-describedby={fieldError('unp') ? errorId('unp') : undefined}
            disabled={disabled}
          />
          {fieldError('unp') ? (
            <span className="client-field__error" id={errorId('unp')}>
              {unpDuplicate ? (
                <>
                  {fieldError('unp')}
                  <button
                    type="button"
                    className="client-field__link"
                    onClick={() => onOpenDuplicate?.(unpDuplicate.id)}
                  >
                    {unpDuplicate.name}
                  </button>
                </>
              ) : (
                fieldError('unp')
              )}
            </span>
          ) : null}
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
              {fieldError('phone')}
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
            maxLength={SUPPLIER_LIMITS.email}
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

        {/* Комментарий: необязательное многострочное поле, как в карточке клиента. */}
        <label className="client-field" htmlFor={fieldId('comment')}>
          <span className="client-field__label">Комментарий</span>
          <textarea
            id={fieldId('comment')}
            className="client-field__input client-field__textarea"
            ref={form.refs.comment}
            value={form.values.comment}
            onChange={(event) => form.updateField('comment', event.target.value)}
            rows={4}
            maxLength={SUPPLIER_LIMITS.comment}
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
            {form.values.comment.length} / {SUPPLIER_LIMITS.comment}
          </span>
        </label>
      </div>

      <div
        className="client-form__fields"
        role="tabpanel"
        id={panelId('details')}
        aria-labelledby={tabId('details')}
        hidden={form.activeTab !== 'details'}
      >
        {DETAIL_BLOCKS.map((block, index) => (
          <Fragment key={block.title}>
            {/* Линия — отдельный элемент над заголовком следующего блока. */}
            {index > 0 ? <div className="client-address__divider" aria-hidden="true" /> : null}
            <fieldset className="client-address">
              <legend className="client-address__title">{block.title}</legend>
              {block.linked ? (
                <label className="client-address__same" htmlFor={`${idPrefix}-post-same`}>
                  <input
                    id={`${idPrefix}-post-same`}
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
                {block.fields.map(({ field, label, span, upper }) => {
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
                        onChange={(event) =>
                          form.updateField(
                            field,
                            upper ? event.target.value.toUpperCase() : event.target.value,
                          )
                        }
                        maxLength={DETAIL_LIMITS[field]}
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
    </div>
  );
}
