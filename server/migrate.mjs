/**
 * Применение миграций базы данных.
 * Запуск: npm run migrate
 */

import { closeDb, getDbPath, runMigrations } from './db.mjs';

const applied = runMigrations();

console.log(`Файл базы: ${getDbPath()}`);
console.log(
  applied.length > 0
    ? `Применены миграции: ${applied.join(', ')}`
    : 'Все миграции уже применены, изменения не требуются.',
);

closeDb();
