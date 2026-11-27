-- 0009_supplier_contacts.sql
-- Контактные лица поставщиков: отдельная сущность, не клиенты.
-- Создаётся только новая таблица; существующие данные не пересоздаются и не
-- изменяются. Телефон хранится в формате клиентов (+375XXXXXXXXX) и уникален
-- среди контактов; основной контакт может быть только работающим.

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  last_name TEXT CHECK (last_name IS NULL OR length(last_name) <= 100),
  first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  middle_name TEXT CHECK (middle_name IS NULL OR length(middle_name) <= 100),
  position TEXT NOT NULL CHECK (length(position) BETWEEN 1 AND 100),
  phone TEXT NOT NULL CHECK (length(phone) BETWEEN 1 AND 50),
  email TEXT CHECK (email IS NULL OR length(email) <= 254),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (is_primary = 0 OR status = 'active')
);

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier
  ON supplier_contacts (supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_contacts_phone_unique
  ON supplier_contacts (phone);
