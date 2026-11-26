-- 0002_client_update_requests.sql
-- Защита от повторной отправки одного и того же запроса обновления карточки
-- клиента (разделы 7 и 8 ТЗ на редактирование). Ключ идемпотентности приходит
-- от клиента, хранится ответ первого успешного запроса.
--
-- Миграция идемпотентна: повторный запуск не пересоздаёт таблицу и не удаляет
-- уже сохранённые ответы.

CREATE TABLE IF NOT EXISTS client_update_requests (
  idempotency_key TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES clients (id),
  response_json   TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
