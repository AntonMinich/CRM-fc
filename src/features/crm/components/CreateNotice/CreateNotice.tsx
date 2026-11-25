import './CreateNotice.css';

interface CreateNoticeProps {
  visible: boolean;
}

/**
 * Уведомление-заглушка кнопки «Создать». Сделку не создаёт и суммы не меняет.
 * Контейнер с role="status" присутствует постоянно, поэтому скринридер
 * объявляет сообщение, когда оно появляется.
 */
export function CreateNotice({ visible }: CreateNoticeProps) {
  return (
    <div className="create-notice" role="status" aria-live="polite">
      {visible ? (
        <p className="create-notice__message">
          Форма создания будет добавлена на следующем этапе
        </p>
      ) : null}
    </div>
  );
}
