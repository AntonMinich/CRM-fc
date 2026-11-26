/**
 * Состояние полей формы поставщика: значения, ошибки, маска телефона, живая
 * проверка дубля, вкладки и чекбокс «Совпадает с адресом регистрации».
 *
 * Слой повторяет клиентский (clients/components/ClientForm/useClientForm.ts).
 */

import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPhoneDuplicates, fetchUnpDuplicate } from '../../api/suppliersApi';
import { POSTAL_PAIRS, isPostalSameAsRegistration } from '../../config/supplierFields';
import { useDebouncedValue } from '../../../clients/hooks/useDebouncedValue';
import { PHONE_PREFIX, normalizePhoneInput, toPhoneValue, validatePhone } from '../../../clients/utils/phone';
import {
  DUPLICATE_UNP_MESSAGE,
  EMPTY_SUPPLIER_FORM,
  tabForField,
} from '../../utils/validateSupplierForm';
import type {
  DuplicatePhoneWarning,
  DuplicateSupplier,
  SupplierFormErrors,
  SupplierFormValues,
  SupplierTab,
} from '../../types';

/** Задержка живой проверки дублей при вводе. */
const DUPLICATE_CHECK_DELAY_MS = 300;

/** Ссылки на поля формы: нужны для перевода фокуса к первому некорректному. */
export interface SupplierFormRefs {
  name: RefObject<HTMLInputElement | null>;
  unp: RefObject<HTMLInputElement | null>;
  phone: RefObject<HTMLInputElement | null>;
  email: RefObject<HTMLInputElement | null>;
  comment: RefObject<HTMLTextAreaElement | null>;
  regPostalCode: RefObject<HTMLInputElement | null>;
  regCountry: RefObject<HTMLInputElement | null>;
  regCity: RefObject<HTMLInputElement | null>;
  regStreet: RefObject<HTMLInputElement | null>;
  regHouse: RefObject<HTMLInputElement | null>;
  regBuilding: RefObject<HTMLInputElement | null>;
  regApartment: RefObject<HTMLInputElement | null>;
  postPostalCode: RefObject<HTMLInputElement | null>;
  postCountry: RefObject<HTMLInputElement | null>;
  postCity: RefObject<HTMLInputElement | null>;
  postStreet: RefObject<HTMLInputElement | null>;
  postHouse: RefObject<HTMLInputElement | null>;
  postBuilding: RefObject<HTMLInputElement | null>;
  postApartment: RefObject<HTMLInputElement | null>;
  bankAccount: RefObject<HTMLInputElement | null>;
  bankName: RefObject<HTMLInputElement | null>;
  bicSwift: RefObject<HTMLInputElement | null>;
  directorName: RefObject<HTMLInputElement | null>;
}

export interface SupplierFormApi {
  values: SupplierFormValues;
  errors: SupplierFormErrors;
  refs: SupplierFormRefs;
  setValues: Dispatch<SetStateAction<SupplierFormValues>>;
  setErrors: Dispatch<SetStateAction<SupplierFormErrors>>;
  /** Поставщик с таким же УНП: сервер вернул `duplicate_unp`. */
  unpDuplicate: DuplicateSupplier | null;
  setUnpDuplicate: Dispatch<SetStateAction<DuplicateSupplier | null>>;
  /** Другие поставщики с таким же телефоном: предупреждение при вводе. */
  phoneWarning: DuplicatePhoneWarning | null;
  setPhoneWarning: Dispatch<SetStateAction<DuplicatePhoneWarning | null>>;
  /** Крестик в предупреждении: для введённого номера оно больше не показывается. */
  dismissPhoneWarning: () => void;
  /** Активная вкладка окна: «Установочные данные» или «Реквизиты». */
  activeTab: SupplierTab;
  setActiveTab: Dispatch<SetStateAction<SupplierTab>>;
  /** «Совпадает с адресом регистрации»: почтовый адрес заполнен и заблокирован. */
  sameAddress: boolean;
  /** Переключение чекбокса: включить — скопировать адрес, выключить — очистить. */
  toggleSameAddress: (next: boolean) => void;
  /** Значения из базы или пустая форма: пересчитывает вкладку и совпадение адресов. */
  loadValues: (next: SupplierFormValues) => void;
  /** Переводит фокус на поле, открывая его вкладку. */
  focusField: (field: keyof SupplierFormValues) => void;
  /** Текстовое поле: значение и снятие старой ошибки поля. */
  updateField: (field: keyof SupplierFormValues, value: string) => void;
  /** Телефон: из ввода берутся только цифры национальной части. */
  updatePhone: (raw: string) => void;
  /** Проверка телефона после потери фокуса. */
  handlePhoneBlur: () => void;
  /** Backspace удаляет цифру вместе со знаками оформления рядом с ней. */
  handlePhoneKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  setPhoneError: (message: string | null) => void;
}

export interface SupplierFormOptions {
  /** Идентификатор открытого поставщика: своя запись дублем не считается. */
  excludeSupplierId?: string | null;
  /** Предупреждение из ответа сохранения: восстанавливается при переоткрытии окна. */
  initialPhoneWarning?: DuplicatePhoneWarning | null;
}

export function useSupplierForm(
  initialValues: SupplierFormValues,
  options: SupplierFormOptions = {},
): SupplierFormApi {
  const { excludeSupplierId = null, initialPhoneWarning = null } = options;
  const [values, setValues] = useState<SupplierFormValues>(initialValues);
  const [errors, setErrors] = useState<SupplierFormErrors>({});
  const [unpDuplicate, setUnpDuplicate] = useState<DuplicateSupplier | null>(null);
  const [phoneWarning, setPhoneWarning] = useState<DuplicatePhoneWarning | null>(
    initialPhoneWarning,
  );
  const [activeTab, setActiveTab] = useState<SupplierTab>('main');
  const [sameAddress, setSameAddress] = useState(false);
  /** Живые проверки запускаем только после того, как поле правил пользователь. */
  const [unpTouched, setUnpTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  /** Номер, для которого предупреждение закрыли крестиком. */
  const dismissedPhoneRef = useRef<string | null>(null);

  // Обработчики читают актуальные значения через ссылки и не пересоздаются при вводе.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const errorsRef = useRef(errors);
  errorsRef.current = errors;

  /**
   * Ссылки на поля создаются по списку полей формы, поэтому новое поле не нужно
   * прописывать отдельно. React сам заполняет `current` элементами, поэтому
   * приведение к типу ссылок безопасно: ключи совпадают с `EMPTY_SUPPLIER_FORM`.
   */
  const refs = useRef(
    Object.fromEntries(
      Object.keys(EMPTY_SUPPLIER_FORM).map((field) => [field, { current: null }]),
    ) as unknown as SupplierFormRefs,
  ).current;

  const focusField = useCallback(
    (field: keyof SupplierFormValues) => {
      // Сначала открываем вкладку с полем, иначе фокус ушёл бы в скрытую панель.
      setActiveTab(tabForField(field));
      window.setTimeout(() => refs[field]?.current?.focus(), 0);
    },
    [refs],
  );

  const updateField = useCallback((field: keyof SupplierFormValues, value: string) => {
    // Сообщение о дубле УНП исчезает, как только значение поля меняют.
    if (field === 'unp') {
      setUnpTouched(true);
      setUnpDuplicate(null);
    }
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      if (!(field in previous)) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }, []);

  /** Обновляет сообщение телефона, не трогая остальные ошибки. */
  const setPhoneError = useCallback((message: string | null) => {
    setErrors((previous) => {
      const next = { ...previous };
      if (message) {
        next.phone = message;
      } else {
        delete next.phone;
      }
      return next;
    });
  }, []);

  /**
   * В поле хранятся только цифры национальной части: маска +375 (XX) XXX-XX-XX
   * собирается при выводе. Ошибка показывается после потери фокуса или отправки.
   */
  const updatePhone = useCallback(
    (raw: string) => {
      const digits = normalizePhoneInput(raw);
      // Предупреждение о дубле телефона пересчитывается для нового значения.
      setPhoneTouched(true);
      dismissedPhoneRef.current = null;
      setValues((previous) => ({ ...previous, phone: digits }));
      if (errorsRef.current.phone) {
        setPhoneError(validatePhone(digits));
      }
    },
    [setPhoneError],
  );

  const handlePhoneBlur = useCallback(() => {
    setPhoneError(validatePhone(valuesRef.current.phone.trim()));
  }, [setPhoneError]);

  const handlePhoneKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const caret = input.selectionStart ?? 0;

      // Префикс +375 не удаляется: Delete внутри него ничего не делает.
      // При выделении Delete удаляет выбранное, а префикс восстанавливает форма.
      if (event.key === 'Delete') {
        if (input.selectionStart === input.selectionEnd && caret < PHONE_PREFIX.length) {
          event.preventDefault();
        }
        return;
      }
      if (event.key !== 'Backspace') return;
      if (input.selectionStart !== input.selectionEnd) return;

      if (valuesRef.current.phone === '') {
        // В поле только префикс: стирать нечего, но и его удалять нельзя.
        if (caret <= PHONE_PREFIX.length) event.preventDefault();
        return;
      }

      event.preventDefault();
      const digits = valuesRef.current.phone.slice(0, -1);
      setValues((previous) => ({ ...previous, phone: digits }));
      if (errorsRef.current.phone) {
        setPhoneError(validatePhone(digits));
      }
    },
    [setPhoneError],
  );

  /** Значения из базы или пустая форма: вкладка, адреса и подсказки пересчитываются. */
  const loadValues = useCallback(
    (next: SupplierFormValues) => {
      setValues(next);
      setSameAddress(isPostalSameAsRegistration(next));
      setUnpDuplicate(null);
      setPhoneWarning(initialPhoneWarning);
      setUnpTouched(false);
      setPhoneTouched(false);
      dismissedPhoneRef.current = null;
      setActiveTab('main');
    },
    [initialPhoneWarning],
  );

  /** Чекбокс «Совпадает с адресом регистрации»: копируем адрес или очищаем его. */
  const toggleSameAddress = useCallback((next: boolean) => {
    setSameAddress(next);
    setValues((previous) => {
      const updated = { ...previous };
      for (const pair of POSTAL_PAIRS) {
        updated[pair.postal] = next ? previous[pair.registration] : '';
      }
      return updated;
    });
    // Ошибки длины почтового адреса снимаем: значения заменили целиком.
    setErrors((previous) => {
      const updated = { ...previous };
      for (const pair of POSTAL_PAIRS) delete updated[pair.postal];
      return updated;
    });
  }, []);

  // Пока чекбокс включён, правки адреса регистрации переносятся в почтовый адрес.
  useEffect(() => {
    if (!sameAddress) return;
    setValues((previous) => {
      const updated = { ...previous };
      let changed = false;
      for (const pair of POSTAL_PAIRS) {
        if (updated[pair.postal] !== updated[pair.registration]) {
          updated[pair.postal] = updated[pair.registration];
          changed = true;
        }
      }
      return changed ? updated : previous;
    });
  }, [sameAddress, values]);

  /**
   * Живая проверка УНП: сообщение под полем появляется сразу при вводе
   * существующего УНП, а не при отправке. Своя запись не учитывается.
   */
  const debouncedUnp = useDebouncedValue(values.unp, DUPLICATE_CHECK_DELAY_MS);
  useEffect(() => {
    if (!unpTouched) return;
    const unp = debouncedUnp;
    if (!/^\d{9}$/.test(unp)) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const duplicate = await fetchUnpDuplicate(unp, excludeSupplierId, controller.signal);
        if (controller.signal.aborted || valuesRef.current.unp !== unp) return;

        setUnpDuplicate(duplicate);
        // Сообщение под полем: показываем найденный дубль или снимаем его.
        setErrors((previous) => {
          if (duplicate) return { ...previous, unp: DUPLICATE_UNP_MESSAGE };
          if (previous.unp !== DUPLICATE_UNP_MESSAGE) return previous;
          const next = { ...previous };
          delete next.unp;
          return next;
        });
      } catch {
        // Подсказка не влияет на сохранение: сервер проверит УНП ещё раз.
      }
    })();

    return () => controller.abort();
  }, [debouncedUnp, excludeSupplierId, unpTouched]);

  /**
   * Живая проверка телефона: предупреждение о других поставщиках с таким же
   * номером появляется сразу при вводе. Сохранение оно не блокирует.
   */
  const debouncedPhone = useDebouncedValue(values.phone, DUPLICATE_CHECK_DELAY_MS);
  useEffect(() => {
    if (!phoneTouched) return;
    const digits = debouncedPhone;
    if (digits === '' || validatePhone(digits) !== null) return;
    // Закрытое крестиком предупреждение для этого номера не показываем снова.
    if (dismissedPhoneRef.current === digits) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const duplicates = await fetchPhoneDuplicates(
          toPhoneValue(digits),
          excludeSupplierId,
          controller.signal,
        );
        if (controller.signal.aborted || valuesRef.current.phone !== digits) return;
        setPhoneWarning(duplicates);
      } catch {
        // Подсказка не влияет на сохранение: сервер вернёт дубли в ответе.
      }
    })();

    return () => controller.abort();
  }, [debouncedPhone, excludeSupplierId, phoneTouched]);

  /** Крестик в предупреждении о дубле телефона. */
  const dismissPhoneWarning = useCallback(() => {
    dismissedPhoneRef.current = valuesRef.current.phone;
    setPhoneWarning(null);
  }, []);

  return {
    values,
    errors,
    refs,
    setValues,
    setErrors,
    unpDuplicate,
    setUnpDuplicate,
    phoneWarning,
    setPhoneWarning,
    dismissPhoneWarning,
    activeTab,
    setActiveTab,
    sameAddress,
    toggleSameAddress,
    loadValues,
    focusField,
    updateField,
    updatePhone,
    handlePhoneBlur,
    handlePhoneKeyDown,
    setPhoneError,
  };
}
