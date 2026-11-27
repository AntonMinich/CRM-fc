-- 0012_tasks.sql
-- Задачи: название, описание, срок, ответственный, статус и связь с
-- взаимодействием и контрагентом. Создаётся только новая таблица.

CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description          TEXT CHECK (description IS NULL OR length(description) <= 1000),
  due_at               TEXT NOT NULL,
  responsible_user_id  TEXT NOT NULL REFERENCES users (id),
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_at         TEXT,
  interaction_id       TEXT REFERENCES interactions (id) ON DELETE SET NULL,
  client_id            TEXT REFERENCES clients (id) ON DELETE SET NULL,
  supplier_id          TEXT REFERENCES suppliers (id) ON DELETE SET NULL,
  created_by_user_id   TEXT REFERENCES users (id),
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_responsible
  ON tasks (responsible_user_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_tasks_due
  ON tasks (due_at);
