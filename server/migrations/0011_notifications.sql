-- 0011_notifications.sql
-- Уведомления колокольчика в шапке: получатель, тип, заголовок, короткий текст,
-- ссылка на объект и состояние прочтения для каждого пользователя.
-- Создаётся только новая таблица; существующие данные не перезаписываются.

CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 40),
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body         TEXT CHECK (body IS NULL OR length(body) <= 500),
  entity_type  TEXT CHECK (entity_type IS NULL OR entity_type IN ('client', 'supplier', 'interaction')),
  entity_id    TEXT,
  link         TEXT CHECK (link IS NULL OR length(link) <= 500),
  created_at   TEXT NOT NULL,
  read_at      TEXT,
  -- Ключ источника: повтор того же события не создаёт вторую запись.
  source_key   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source
  ON notifications (source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id, read_at);
