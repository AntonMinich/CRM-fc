import { getSection } from '../app/navigation';
import { AppShell } from '../components/AppShell/AppShell';

/** Раздел Service Desk. Рабочая область пустая — списков и форм обращений нет. */
export default function ServiceDeskPage() {
  return <AppShell title={getSection('service-desk').title} />;
}
