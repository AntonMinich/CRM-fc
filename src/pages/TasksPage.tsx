import { getSection } from '../app/navigation';
import { AppShell } from '../components/AppShell/AppShell';
import { TasksSection } from '../features/tasks/components/TasksSection/TasksSection';

/** Раздел «Мои задачи»: список и канбан задач вместе с взаимодействиями. */
export default function TasksPage() {
  return (
    <AppShell title={getSection('tasks').title}>
      <TasksSection />
    </AppShell>
  );
}
