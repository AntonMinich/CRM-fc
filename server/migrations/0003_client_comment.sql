-- 0003_client_comment.sql
-- Комментарий клиента: необязательное текстовое поле до 500 символов.
-- Колонка добавляется к существующей таблице «Клиенты»: данные не пересоздаются
-- и не изменяются. Миграция выполняется один раз (отметка в schema_migrations).

ALTER TABLE clients ADD COLUMN comment TEXT
  CHECK (comment IS NULL OR length(comment) <= 500);
