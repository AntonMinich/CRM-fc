import './WorkspaceBackground.css';

const DECOR = '/assets/brand/fincode-fingerprint.webp';

/**
 * Фирменный отпечаток справа внизу рабочей области.
 * Используется чистый отпечаток из логотипа: непрозрачность 0.55, прижат
 * к правому нижнему углу.
 * Декор не участвует в потоке документа, не перехватывает нажатия и не
 * читается скринридером.
 */
export function WorkspaceBackground() {
  return (
    <div className="workspace-background" aria-hidden="true">
      <img className="workspace-background__decor" src={DECOR} alt="" decoding="async" />
    </div>
  );
}
