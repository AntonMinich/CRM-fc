/**
 * Состояние полей формы клиента: значения, ошибки и обработчик телефона.
 *
 * Один слой для окна создания и карточки редактирования: правила маски телефона,
 * снятие ошибки поля при исправлении и перевод фокуса не могут разойтись.
 */

import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPhoneDuplicate } from '../../api/clientsApi';
import type { DuplicateClient } from '../../api/clientsApi';
import { ADDRESS_PAIRS, isResidenceSameAsRegistration } from '../../config/addressFields';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { ClientFormErrors, ClientFormValues, ClientTab } from '../../types';
import { PHONE_PREFIX, normalizePhoneInput, toPhoneValue, validatePhone } from '../../utils/phone';
import { EMPTY_CLIENT_FORM, tabForField } from '../../utils/validateClientForm';

/** Сообщение под полем телефона, если номер уже занят другим клиентом. */
export const DUPLICATE_PHONE_MESSAGE = 'Клиент с таким номером уже создан: ';

/** Задержка живой проверки телефона при вводе. */
const PHONE_CHECK_DELAY_MS = 300;

/** Ссылки на поля формы: нужны для перевода фокуса к первому некорректному. */
export interface ClientFormRefs {
  lastName: RefObject<HTMLInputElement | null>;
  firstName: RefObject<HTMLInputElement | null>;
  middleName: RefObject<HTMLInputElement | null>;
  phone: RefObject<HTMLInputElement | null>;
  email: RefObject<HTMLInputElement | null>;
  responsibleUserId: RefObject<HTMLSelectElement | null>;
  comment: RefObject<HTMLTextAreaElement | null>;
  regPostalCode: RefObject<HTMLInputElement | null>;
  regCountry: RefObject<HTMLInputElement | null>;
  regCity: RefObject<HTMLInputElement | null>;
  regStreet: RefObject<HTMLInputElement | null>;
  regHouse: RefObject<HTMLInputElement | null>;
  regBuilding: RefObject<HTMLInputElement | null>;
  regApartment: RefObject<HTMLInputElement | null>;
  resPostalCode: RefObject<HTMLInputElement | null>;
  resCountry: RefObject<HTMLInputElement | null>;
  resCity: RefObject<HTMLInputElement | null>;
  resStreet: RefObject<HTMLInputElement | null>;
  resHouse: RefObject<HTMLInputElement | null>;
  resBuilding: RefObject<HTMLInputElement | null>;
  resApartment: RefObject<HTMLInputElement | null>;
}

export interface ClientFormApi {
  values: ClientFormValues;
  errors: ClientFormErrors;
  refs: ClientFormRefs;
  setValues: Dispatch<SetStateAction<ClientFormValues>>;
  setErrors: Dispatch<SetStateAction<ClientFormErrors>>;
  /** Клиент с таким же телефоном: сервер вернул `duplicate_phone`. */
  phoneDuplicate: DuplicateClient | null;
  setPhoneDuplicate: Dispatch<SetStateAction<DuplicateClient | null>>;
  /** Активная вкладка окна: «Установочные данные» или «Реквизиты». */
  activeTab: ClientTab;
  setActiveTab: Dispatch<SetStateAction<ClientTab>>;
  /** «Совпадает с адресом регистрации»: поля проживания заполнены и заблокированы. */
  sameAddress: boolean;
  /** Переключение чекбокса: включить — скопировать адрес, выключить — очистить. */
  toggleSameAddress: (next: boolean) => void;
  /** Значения из базы или пустая форма: пересчитывает вкладку и совпадение адресов. */
  loadValues: (next: ClientFormValues) => void;
  /** Переводит фокус на поле. */
  focusField: (field: keyof ClientFormValues) => void;
  /** Текстовое поле или select: значение и снятие старой ошибки поля. */
  updateField: (field: keyof ClientFormValues, value: string) => void;
  /** Телефон: из ввода берутся только цифры национальной части. */
  updatePhone: (raw: string) => void;
  /** Проверка телефона после потери фокуса. */
  handlePhoneBlur: () => void;
  /** Backspace удаляет цифру вместе со знаками оформления рядом с ней. */
  handlePhoneKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  setPhoneError: (message: string | null) => void;
}

export interface ClientFormOptions {
  /** Идентификатор открытого клиента: своя запись дублем не считается. */
  excludeClientId?: string | null;
}

export function useClientForm(
  initialValues: ClientFormValues,
  options: ClientFormOptions = {},
): ClientFormApi {
  const { excludeClientId = null } = options;
  const [values, setValues] = useState<ClientFormValues>(initialValues);
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [phoneDuplicate, setPhoneDuplicate] = useState<DuplicateClient | null>(null);
  const [activeTab, setActiveTab] = useState<ClientTab>('main');
  const [sameAddress, setSameAddress] = useState(false);
  /** Живую проверку запускаем только после того, как номер правил пользователь. */
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Обработчики читают актуальные значения через ссылки и не пересоздаются при вводе.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const errorsRef = useRef(errors);
  errorsRef.current = errors;

  /**
   * Ссылки на поля создаются по списку полей формы, поэтому новое поле не нужно
   * прописывать отдельно. React сам заполняет `current` элементами, поэтому
   * приведение к типу ссылок безопасно: ключи совпадают с `EMPTY_CLIENT_FORM`.
   */
  const refs = useRef(
    Object.fromEntries(
      Object.keys(EMPTY_CLIENT_FORM).map((field) => [field, { current: null }]),
    ) as unknown as ClientFormRefs,
  ).current;

  const focusField = useCallback(
    (field: keyof ClientFormValues) => {
      // Сначала открываем вкладку с полем, иначе фокус ушёл бы в скрытую панель.
      setActiveTab(tabForField(field));
      window.setTimeout(() => refs[field]?.current?.focus(), 0);
    },
    [refs],
  );

  const updateField = useCallback((field: keyof ClientFormValues, value: string) => {
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
   * собирается при выводе. Ошибка показывается после потери фокуса или отправки,
   * а не на первой введённой цифре.
   */
  const updatePhone = useCallback(
    (raw: string) => {
      const digits = normalizePhoneInput(raw);
      // Сообщение о дубле исчезает, как только значение телефона меняют.
      setPhoneTouched(true);
      setPhoneDuplicate(null);
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

  /** Значения из базы или пустая форма: вкладка и совпадение адресов пересчитываются. */
  const loadValues = useCallback((next: ClientFormValues) => {
    setValues(next);
    setSameAddress(isResidenceSameAsRegistration(next));
    setActiveTab('main');
    setPhoneTouched(false);
  }, []);

  /** Чекбокс «Совпадает с адресом регистрации»: копируем адрес или очищаем его. */
  const toggleSameAddress = useCallback((next: boolean) => {
    setSameAddress(next);
    setValues((previous) => {
      const updated = { ...previous };
      for (const pair of ADDRESS_PAIRS) {
        updated[pair.residence] = next ? previous[pair.registration] : '';
      }
      return updated;
    });
    // Ошибки длины адреса проживания снимаем: значения заменили целиком.
    setErrors((previous) => {
      const updated = { ...previous };
      for (const pair of ADDRESS_PAIRS) delete updated[pair.residence];
      return updated;
    });
  }, []);

  // Пока чекбокс включён, правки адреса регистрации переносятся в адрес проживания.
  useEffect(() => {
    if (!sameAddress) return;
    setValues((previous) => {
      const updated = { ...previous };
      let changed = false;
      for (const pair of ADDRESS_PAIRS) {
        if (updated[pair.residence] !== updated[pair.registration]) {
          updated[pair.residence] = updated[pair.registration];
          changed = true;
        }
      }
      return changed ? updated : previous;
    });
  }, [sameAddress, values]);

  /**
   * Живая проверка дубля: сообщение появляется, как только сервер подтвердил
   * совпадение по введённому номеру, а не по нажатию «Создать»/«Сохранить».
   * Проверяются только полный и корректный номер; запоздавший ответ не
   * применяется, если значение уже изменили.
   */
  const debouncedPhone = useDebouncedValue(values.phone, PHONE_CHECK_DELAY_MS);
  useEffect(() => {
    if (!phoneTouched) return;
    const digits = debouncedPhone;
    if (digits === '' || validatePhone(digits) !== null) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const duplicate = await fetchPhoneDuplicate(
          toPhoneValue(digits),
          excludeClientId,
          controller.signal,
        );
        if (controller.signal.aborted || valuesRef.current.phone !== digits) return;

        if (duplicate) {
          setPhoneDuplicate(duplicate);
          setPhoneError(DUPLICATE_PHONE_MESSAGE);
          return;
        }

        setPhoneDuplicate(null);
        // Снимаем только сообщение о дубле, не трогая ошибки длины и кода.
        setErrors((previous) => {
          if (previous.phone !== DUPLICATE_PHONE_MESSAGE) return previous;
          const next = { ...previous };
          delete next.phone;
          return next;
        });
      } catch {
        // Подсказка не влияет на сохранение: сервер проверит номер ещё раз.
      }
    })();

    return () => controller.abort();
  }, [debouncedPhone, excludeClientId, phoneTouched, setPhoneError]);

  return {
    values,
    errors,
    refs,
    setValues,
    setErrors,
    phoneDuplicate,
    setPhoneDuplicate,
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
