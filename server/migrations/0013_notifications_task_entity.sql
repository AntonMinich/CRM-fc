-- 0013_notifications_task_entity.sql
-- Уведомления задач получают тип объекта «task», чтобы колокольчик мог открыть
-- карточку задачи поверх текущей страницы. CHECK-ограничение SQLite изменить
-- на месте нельзя, поэтому таблица пересоздаётся: данные переносятся без потерь.

CREATE TABLE IF NOT EXISTS notifications_new (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 40),
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body         TEXT CHECK (body IS NULL OR length(body) <= 500),
  entity_type  TEXT CHECK (entity_type IS NULL OR entity_type IN ('client', 'supplier', 'interaction', 'task')),
  entity_id    TEXT,
  link         TEXT CHECK (link IS NULL OR length(link) <= 500),
  created_at   TEXT NOT NULL,
  read_at      TEXT,
  source_key   TEXT
);

INSERT OR IGNORE INTO notifications_new
  (id, user_id, type, title, body, entity_type, entity_id, link, created_at, read_at, source_key)
SELECT id, user_id, type, title, body, entity_type, entity_id, link, created_at, read_at, source_key
  FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new RENAME TO notifications;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source
  ON notifications (source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id, read_at);
