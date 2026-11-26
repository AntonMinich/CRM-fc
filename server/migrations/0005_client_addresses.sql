-- 0005_client_addresses.sql
-- Реквизиты клиента: два адреса (регистрации и проживания) по семь необязательных
-- текстовых полей. Колонки добавляются к существующей таблице «Клиенты»:
-- данные не пересоздаются и не изменяются, все колонки допускают NULL.

ALTER TABLE clients ADD COLUMN reg_postal_code TEXT
  CHECK (reg_postal_code IS NULL OR length(reg_postal_code) <= 20);
ALTER TABLE clients ADD COLUMN reg_country TEXT
  CHECK (reg_country IS NULL OR length(reg_country) <= 100);
ALTER TABLE clients ADD COLUMN reg_city TEXT
  CHECK (reg_city IS NULL OR length(reg_city) <= 100);
ALTER TABLE clients ADD COLUMN reg_street TEXT
  CHECK (reg_street IS NULL OR length(reg_street) <= 150);
ALTER TABLE clients ADD COLUMN reg_house TEXT
  CHECK (reg_house IS NULL OR length(reg_house) <= 20);
ALTER TABLE clients ADD COLUMN reg_building TEXT
  CHECK (reg_building IS NULL OR length(reg_building) <= 20);
ALTER TABLE clients ADD COLUMN reg_apartment TEXT
  CHECK (reg_apartment IS NULL OR length(reg_apartment) <= 20);

ALTER TABLE clients ADD COLUMN res_postal_code TEXT
  CHECK (res_postal_code IS NULL OR length(res_postal_code) <= 20);
ALTER TABLE clients ADD COLUMN res_country TEXT
  CHECK (res_country IS NULL OR length(res_country) <= 100);
ALTER TABLE clients ADD COLUMN res_city TEXT
  CHECK (res_city IS NULL OR length(res_city) <= 100);
ALTER TABLE clients ADD COLUMN res_street TEXT
  CHECK (res_street IS NULL OR length(res_street) <= 150);
ALTER TABLE clients ADD COLUMN res_house TEXT
  CHECK (res_house IS NULL OR length(res_house) <= 20);
ALTER TABLE clients ADD COLUMN res_building TEXT
  CHECK (res_building IS NULL OR length(res_building) <= 20);
ALTER TABLE clients ADD COLUMN res_apartment TEXT
  CHECK (res_apartment IS NULL OR length(res_apartment) <= 20);
