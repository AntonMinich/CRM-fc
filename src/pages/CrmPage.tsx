import { getSection } from '../app/navigation';
import { AppShell } from '../components/AppShell/AppShell';

/** Раздел CRM. Рабочая область пустая — карточек, показателей и демоданных нет. */
export default function CrmPage() {
  return <AppShell title={getSection('crm').title} />;
}
