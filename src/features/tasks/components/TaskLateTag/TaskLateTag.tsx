/**
 * Тег «С просрочкой»: задача закрыта позже срока. Один вид в списке, канбане
 * и окне задачи; базовые стили бейджа — из общего компонента статусов.
 */

import { TASK_LATE_LABEL, formatLateDuration } from '../../config/taskFields';

interface TaskLateTagProps {
  /** Длительность просрочки в минутах: показывается в подсказке. */
  minutes: number;
}

export function TaskLateTag({ minutes }: TaskLateTagProps) {
  return (
    <span
      className="interaction-status interaction-status--late"
      title={`+${formatLateDuration(minutes)}`}
    >
      {TASK_LATE_LABEL}
    </span>
  );
}