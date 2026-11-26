-- 0008_suppliers_comment.sql
-- Комментарий поставщика: необязательное текстовое поле до 500 символов.
-- Колонка добавляется к существующей таблице «Поставщики»: данные не
-- пересоздаются и не изменяются, значение по умолчанию — NULL.

ALTER TABLE suppliers ADD COLUMN comment TEXT
  CHECK (comment IS NULL OR length(comment) <= 500);
