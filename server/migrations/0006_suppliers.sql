-- 0006_suppliers.sql
-- Справочник поставщиков: список и карточка по образцу раздела «Клиенты».
-- Миграция только создаёт новые таблицы: существующие данные не изменяются.
-- Все колонки, кроме name, unp и phone, необязательные и допускают NULL.

CREATE TABLE IF NOT EXISTS suppliers (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL
                        CHECK (length(trim(name)) > 0 AND length(name) <= 200),
  unp                 TEXT NOT NULL CHECK (length(unp) = 9),
  phone               TEXT NOT NULL
                        CHECK (length(trim(phone)) > 0 AND length(phone) <= 50),
  email               TEXT CHECK (email IS NULL OR length(email) <= 254),

  -- Адрес регистрации
  reg_postal_code     TEXT CHECK (reg_postal_code IS NULL OR length(reg_postal_code) <= 20),
  reg_country         TEXT CHECK (reg_country IS NULL OR length(reg_country) <= 100),
  reg_city            TEXT CHECK (reg_city IS NULL OR length(reg_city) <= 100),
  reg_street          TEXT CHECK (reg_street IS NULL OR length(reg_street) <= 150),
  reg_house           TEXT CHECK (reg_house IS NULL OR length(reg_house) <= 20),
  reg_building        TEXT CHECK (reg_building IS NULL OR length(reg_building) <= 20),
  reg_apartment       TEXT CHECK (reg_apartment IS NULL OR length(reg_apartment) <= 20),

  -- Почтовый адрес
  post_postal_code    TEXT CHECK (post_postal_code IS NULL OR length(post_postal_code) <= 20),
  post_country        TEXT CHECK (post_country IS NULL OR length(post_country) <= 100),
  post_city           TEXT CHECK (post_city IS NULL OR length(post_city) <= 100),
  post_street         TEXT CHECK (post_street IS NULL OR length(post_street) <= 150),
  post_house          TEXT CHECK (post_house IS NULL OR length(post_house) <= 20),
  post_building       TEXT CHECK (post_building IS NULL OR length(post_building) <= 20),
  post_apartment      TEXT CHECK (post_apartment IS NULL OR length(post_apartment) <= 20),

  -- Банковские реквизиты и руководитель
  bank_account        TEXT CHECK (bank_account IS NULL OR length(bank_account) <= 34),
  bank_name           TEXT CHECK (bank_name IS NULL OR length(bank_name) <= 150),
  bic_swift           TEXT CHECK (bic_swift IS NULL OR length(bic_swift) <= 11),
  director_name       TEXT CHECK (director_name IS NULL OR length(director_name) <= 150),

  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- Порядок по умолчанию: новые записи сверху, при равном времени — по идентификатору.
CREATE INDEX IF NOT EXISTS idx_suppliers_created_at
  ON suppliers (created_at DESC, id DESC);

-- Защита от повторного создания при повторе сетевого запроса (как у клиентов).
CREATE TABLE IF NOT EXISTS supplier_creation_requests (
  idempotency_key TEXT PRIMARY KEY,
  supplier_id     TEXT NOT NULL REFERENCES suppliers (id),
  response_json   TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

-- Защита от повторного обновления карточки.
CREATE TABLE IF NOT EXISTS supplier_update_requests (
  idempotency_key TEXT PRIMARY KEY,
  supplier_id     TEXT NOT NULL REFERENCES suppliers (id),
  response_json   TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
