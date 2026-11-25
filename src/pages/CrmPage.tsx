import { Outlet } from 'react-router-dom';

import { getSection } from '../app/navigation';
import { AppShell } from '../components/AppShell/AppShell';
import { CrmTabs } from '../features/crm/components/CrmTabs/CrmTabs';
import './CrmPage.css';

/**
 * Раздел CRM: общая оболочка, верхнее меню «Сделки / Клиенты / Поставщики»
 * и содержимое активной вкладки.
 */
export default function CrmPage() {
  return (
    <AppShell title={getSection('crm').title}>
      <div className="crm">
        <CrmTabs />
        <Outlet />
      </div>
    </AppShell>
  );
}

