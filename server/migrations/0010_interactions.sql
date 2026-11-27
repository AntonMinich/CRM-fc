-- 0010_interactions.sql
-- Взаимодействия с клиентами и поставщиками: план, перенос, результат, отмена и
-- напоминания внутри приложения.
-- Создаются только новые таблицы; существующие данные не пересоздаются.
-- `deal_id` добавлен без внешнего ключа: сделок в системе пока нет.

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients (id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers (id) ON DELETE CASCADE,
  deal_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('call', 'meeting', 'letter', 'other')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  planned_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'cancelled')),
  responsible_user_id TEXT NOT NULL REFERENCES users (id),
  plan_comment TEXT CHECK (plan_comment IS NULL OR length(plan_comment) <= 500),
  remind_at TEXT,
  reminder_shown_at TEXT,
  reminder_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (reminder_dismissed IN (0, 1)),
  supplier_contact_id TEXT REFERENCES supplier_contacts (id) ON DELETE SET NULL,
  supplier_contact_name TEXT CHECK (supplier_contact_name IS NULL OR length(supplier_contact_name) <= 300),
  result_text TEXT CHECK (result_text IS NULL OR length(result_text) <= 1000),
  occurred_at TEXT,
  next_step TEXT CHECK (next_step IS NULL OR length(next_step) <= 500),
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  completed_by_user_id TEXT REFERENCES users (id),
  completed_at TEXT,
  edited_by_user_id TEXT REFERENCES users (id),
  edited_at TEXT,
  created_by_user_id TEXT REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Владелец ровно один: либо клиент, либо поставщик.
  CHECK ((client_id IS NULL) <> (supplier_id IS NULL)),
  -- Контактное лицо бывает только у поставщика.
  CHECK (supplier_contact_id IS NULL OR supplier_id IS NOT NULL),
  -- Выполненное взаимодействие всегда с результатом и датой факта.
  CHECK (status <> 'done' OR (result_text IS NOT NULL AND occurred_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_interactions_client
  ON interactions (client_id);

CREATE INDEX IF NOT EXISTS idx_interactions_supplier
  ON interactions (supplier_id);

CREATE INDEX IF NOT EXISTS idx_interactions_responsible
  ON interactions (responsible_user_id, status);

CREATE TABLE IF NOT EXISTS interaction_reschedules (
  id TEXT PRIMARY KEY,
  interaction_id TEXT NOT NULL REFERENCES interactions (id) ON DELETE CASCADE,
  old_planned_at TEXT NOT NULL,
  new_planned_at TEXT NOT NULL,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 300),
  changed_by_user_id TEXT NOT NULL REFERENCES users (id),
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interaction_reschedules
  ON interaction_reschedules (interaction_id, changed_at);
