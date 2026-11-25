import type { ReactNode } from 'react';

import './Toast.css';

interface ToastProps {
  visible: boolean;
  children: ReactNode;
}

/**
 * Всплывающее уведомление в правом нижнем углу.
 * Контейнер с role="status" присутствует постоянно, поэтому скринридер
 * объявляет сообщение, когда оно появляется.
 */
export function Toast({ visible, children }: ToastProps) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {visible ? <p className="toast__message">{children}</p> : null}
    </div>
  );
}
