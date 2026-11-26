/**
 * Доступ к базе данных приложения (SQLite через встроенный модуль node:sqlite).
 * Внешних зависимостей нет, база — один файл на диске.
 *
 * Путь к файлу: переменная окружения FINCODE_DB или data/fincode.db.
 * Подключение открывается лениво, поэтому окружение можно задать до первого запроса.
 */

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(SERVER_DIR, 'migrations');

/**
 * Пометка в файле миграции: неудачу такой миграции не считаем критичной.
 * Нужна для миграций, которые нельзя применить из-за уже существующих данных
 * (например, уникальный индекс при наличии дублей): сервер продолжает работать,
 * данные не изменяются, миграция повторится при следующем запуске.
 */
const TOLERATE_MARKER = '-- fincode: tolerate-existing-data';

/** Путь к файлу базы по умолчанию. */
export const DEFAULT_DB_PATH = join(SERVER_DIR, '..', 'data', 'fincode.db');

/** Идентификатор пользователя, который предлагается ответственным по умолчанию. */
export const DEFAULT_RESPONSIBLE_USER_ID = 'usr-minich-anton-andreevich';

let connection = null;

/** Фактический путь к файлу базы (с учётом окружения). */
export function getDbPath() {
  return process.env.FINCODE_DB ?? DEFAULT_DB_PATH;
}

/** Открывает (при первом вызове) и возвращает соединение с базой. */
export function getDb() {
  if (!connection) {
    const file = getDbPath();
    if (file !== ':memory:') {
      mkdirSync(dirname(file), { recursive: true });
    }
    connection = new DatabaseSync(file, { enableForeignKeyConstraints: true });
    connection.exec('PRAGMA journal_mode = WAL');
  }
  return connection;
}

/**
 * Применяет ещё не применённые SQL-миграции из server/migrations по порядку имён.
 * Каждая миграция выполняется в транзакции и отмечается в schema_migrations.
 * @returns {string[]} список применённых файлов
 */
export function runMigrations() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const executed = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      executed.push(file);
    } catch (error) {
      db.exec('ROLLBACK');
      if (sql.includes(TOLERATE_MARKER)) {
        console.warn(
          `[db] миграция ${file} не применена (${error.message}); данные не изменены.`,
        );
        continue;
      }
      throw new Error(`Миграция ${file} не применена: ${error.message}`);
    }
  }
  return executed;
}

/** Закрывает соединение (используется скриптами и тестами). */
export function closeDb() {
  if (connection) {
    connection.close();
    connection = null;
  }
}
