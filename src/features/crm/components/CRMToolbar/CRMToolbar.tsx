import { CreateButton } from '../CreateButton/CreateButton';
import './CRMToolbar.css';

interface CRMToolbarProps {
  onCreate: () => void;
}

/**
 * Панель действий CRM: кнопка «Создать» слева и неброская подпись «Канбан»
 * справа. Подпись не является переключателем представлений.
 */
export function CRMToolbar({ onCreate }: CRMToolbarProps) {
  return (
    <div className="crm-toolbar">
      <CreateButton onClick={onCreate} />
      <span className="crm-toolbar__caption">Канбан</span>
    </div>
  );
}
