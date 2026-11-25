import './WorkspaceBackground.css';

const DECOR = '/assets/brand/fincode-fingerprint.webp';

/**
 * Фирменный отпечаток справа внизу рабочей области.
 * В обеих темах используется один и тот же чистый отпечаток из логотипа:
 * в светлой теме он показывается с непрозрачностью 0.30 и смещён за край
 * области, в тёмной — с 0.55 и прижат к правому нижнему углу.
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
