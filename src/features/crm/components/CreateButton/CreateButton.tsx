import './CreateButton.css';

interface CreateButtonProps {
  onClick: () => void;
}

/** Кнопка «Создать» над доской. Форму создания на этом этапе не открывает. */
export function CreateButton({ onClick }: CreateButtonProps) {
  return (
    <button type="button" className="create-button" onClick={onClick}>
      <span className="create-button__icon" aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          focusable="false"
        >
          <path d="M8 3.25v9.5" />
          <path d="M3.25 8h9.5" />
        </svg>
      </span>
      Создать
    </button>
  );
}
