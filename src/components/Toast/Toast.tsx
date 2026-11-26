import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import './Toast.css';

/** Сколько уведомление видно без взаимодействия (раздел 6.3 ТЗ). */
const AUTO_HIDE_MS = 6000;

/** Отсрочка после ухода указателя или снятия фокуса. */
const RESUME_HIDE_MS = 3000;

interface ToastProps {
  visible: boolean;
  /** Увеличивается при каждом новом уведомлении: перезапускает срок показа. */
  version?: number;
  /** Оформление: успешное действие или сообщение об ошибке. */
  tone?: 'success' | 'error';
  /** Закрытие по таймеру или крестику. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Уведомление о результате действия (раздел 6 ТЗ на обновление оформления):
 * непрозрачная подложка, цветной акцент, значок и крестик.
 * Тон `error` используется для сообщений вида «Клиент не найден».
 *
 * Контейнер с role="status" присутствует постоянно, поэтому скринридер
 * объявляет сообщение, когда оно появляется. Фокус уведомление не забирает.
 */
export function Toast({ visible, version = 0, tone = 'success', onClose, children }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const shownRef = useRef<string | null>(null);
  const resumedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      clearTimer();
      shownRef.current = null;
      resumedRef.current = false;
      setPaused(false);
      return;
    }

    const token = String(version);
    if (shownRef.current !== token) {
      // Новое уведомление: полный срок показа с начала.
      shownRef.current = token;
      resumedRef.current = false;
    }

    if (paused) {
      clearTimer();
      return;
    }

    const delay = resumedRef.current ? RESUME_HIDE_MS : AUTO_HIDE_MS;
    resumedRef.current = true;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onClose();
    }, delay);

    return clearTimer;
  }, [clearTimer, onClose, paused, version, visible]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {visible ? (
        <div
          className={`toast__message${tone === 'error' ? ' toast__message--error' : ''}`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="toast__icon" aria-hidden="true">
            {tone === 'error' ? (
              <svg
                viewBox="0 0 16 16"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                focusable="false"
              >
                <path d="M8 3.5v5.2" />
                <path d="M8 12.2v.3" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 16 16"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
              >
                <path d="M3.25 8.4l3.1 3.1 6.4-6.5" />
              </svg>
            )}
          </span>

          <span className="toast__text">{children}</span>

          <button
            type="button"
            className="toast__close"
            aria-label="Закрыть уведомление"
            onClick={onClose}
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              focusable="false"
              aria-hidden="true"
            >
              <path d="M4 4l8 8" />
              <path d="M12 4l-8 8" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
