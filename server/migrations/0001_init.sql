-- 0001_init.sql
-- Справочник пользователей и бизнес-таблица «Клиенты».
-- Миграция идемпотентна: существующие таблицы и данные не пересоздаются,
-- поэтому повторный запуск не приводит к потере записей.

-- Справочник пользователей. Ответственный клиента хранится как ссылка на него.
CREATE TABLE IF NOT EXISTS users (
  id                        TEXT PRIMARY KEY,
  last_name                 TEXT NOT NULL CHECK (length(last_name) <= 100),
  first_name                TEXT NOT NULL CHECK (length(first_name) <= 100),
  middle_name               TEXT CHECK (middle_name IS NULL OR length(middle_name) <= 100),
  selectable_as_responsible INTEGER NOT NULL DEFAULT 1
                              CHECK (selectable_as_responsible IN (0, 1)),
  created_at                TEXT NOT NULL
);

-- Бизнес-таблица «Клиенты» (физическое имя clients).
-- Пустые необязательные поля хранятся как NULL, а не как строка "null".
-- Лимиты длины соответствуют лимитам формы и API (раздел 7 ТЗ).
CREATE TABLE IF NOT EXISTS clients (
  id                  TEXT PRIMARY KEY,
  last_name           TEXT CHECK (last_name IS NULL OR length(last_name) <= 100),
  first_name          TEXT NOT NULL
                        CHECK (length(trim(first_name)) > 0 AND length(first_name) <= 100),
  middle_name         TEXT CHECK (middle_name IS NULL OR length(middle_name) <= 100),
  phone               TEXT NOT NULL
                        CHECK (length(trim(phone)) > 0 AND length(phone) <= 50),
  email               TEXT CHECK (email IS NULL OR length(email) <= 254),
  responsible_user_id TEXT NOT NULL REFERENCES users (id),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- Порядок по умолчанию: новые записи сверху, при равном времени — по идентификатору.
CREATE INDEX IF NOT EXISTS idx_clients_created_at
  ON clients (created_at DESC, id DESC);

-- Защита от повторного создания одной записи при повторе сетевого запроса.
-- Ключ идемпотентности приходит от клиента, хранится ответ первого успешного запроса.
CREATE TABLE IF NOT EXISTS client_creation_requests (
  idempotency_key TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES clients (id),
  response_json   TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- Ответственный по умолчанию: Минич Антон Андреевич.
-- Фиксированный устойчивый идентификатор, повторный запуск не создаёт дубль.
INSERT OR IGNORE INTO users
  (id, last_name, first_name, middle_name, selectable_as_responsible, created_at)
VALUES
  ('usr-minich-anton-andreevich', 'Минич', 'Антон', 'Андреевич', 1,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
