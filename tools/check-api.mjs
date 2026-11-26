/**
 * Проверка серверной части: сценарии из раздела 15 ТЗ на клиентов.
 * Запуск: npm run check:api
 *
 * Скрипт поднимает сервер приложения на временной базе, прогоняет сценарии
 * через реальные HTTP-запросы и проверяет содержимое таблицы «Клиенты»
 * напрямую в файле базы. Отчёт печатается в консоль.
 */

import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(PROJECT_ROOT, 'data', `_check-api-${process.pid}.db`);
process.env.FINCODE_DB = DB_FILE;

const { startAppServer } = await import('../server/index.mjs');

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

const results = [];
let failed = 0;

function check(condition, title, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failed += 1;
  results.push({ ok, title, detail });
}

function readClients() {
  const db = new DatabaseSync(DB_FILE);
  const rows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC, id DESC').all();
  db.close();
  return rows;
}

function describeClient(client) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(' ');
}

const app = await startAppServer({ port: 0, staticDir: null });
let base = app.url;

async function api(method, path, { body, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, headers: response.headers, payload };
}

try {
  // --- Справочник пользователей -------------------------------------------
  const users = await api('GET', '/api/users?selectableAsResponsible=true');
  const responsible = users.payload?.items?.[0];
  check(users.status === 200, 'GET /api/users отвечает 200', `статус ${users.status}`);
  check(
    users.payload?.items?.length === 1,
    'В справочнике один доступный ответственный',
    `получено ${users.payload?.items?.length}`,
  );
  check(
    responsible?.full_name === 'Минич Антон Андреевич',
    'Ответственный по умолчанию — Минич Антон Андреевич',
    String(responsible?.full_name),
  );
  check(
    responsible?.id === 'usr-minich-anton-andreevich',
    'Идентификатор ответственного устойчив',
    String(responsible?.id),
  );

  // --- Пустой список -------------------------------------------------------
  const emptyList = await api('GET', '/api/clients');
  check(emptyList.status === 200, 'GET /api/clients отвечает 200', `статус ${emptyList.status}`);
  check(
    emptyList.payload?.total === 0,
    'До создания список пуст',
    `total ${emptyList.payload?.total}`,
  );
  check(
    readClients().length === 0,
    'Таблица «Клиенты» пуста до создания',
    `строк ${readClients().length}`,
  );

  // --- Сценарий 1: только обязательные поля -------------------------------
  const minimalBody = {
    first_name: '  Пётр  ',
    phone: '  +375291112233  ',
    responsible_user_id: responsible.id,
  };
  const minimal = await api('POST', '/api/clients', {
    body: minimalBody,
    headers: { 'Idempotency-Key': 'check-minimal' },
  });
  check(minimal.status === 201, 'Создание с обязательными полями: 201', `статус ${minimal.status}`);
  check(
    typeof minimal.payload?.id === 'string' && minimal.payload.id.length > 0,
    'Сервер вернул идентификатор клиента',
    String(minimal.payload?.id),
  );
  check(
    minimal.payload?.first_name === 'Пётр' && minimal.payload?.phone === '+375291112233',
    'Значения сохранены после trim',
    `${minimal.payload?.first_name} / ${minimal.payload?.phone}`,
  );
  check(
    minimal.payload?.last_name === null &&
      minimal.payload?.middle_name === null &&
      minimal.payload?.email === null,
    'Пустые необязательные поля — NULL',
    JSON.stringify([
      minimal.payload?.last_name,
      minimal.payload?.middle_name,
      minimal.payload?.email,
    ]),
  );
  check(
    minimal.payload?.responsible_user_id === responsible.id,
    'Ответственный сохранён идентификатором',
    String(minimal.payload?.responsible_user_id),
  );
  check(
    typeof minimal.payload?.created_at === 'string' &&
      typeof minimal.payload?.updated_at === 'string',
    'Сервер задал системные даты',
    String(minimal.payload?.created_at),
  );

  const afterMinimal = readClients();
  check(afterMinimal.length === 1, 'В таблице ровно одна запись', `строк ${afterMinimal.length}`);
  check(
    afterMinimal[0]?.first_name === 'Пётр' &&
      afterMinimal[0]?.responsible_user_id === responsible.id,
    'Строка в базе соответствует запросу',
    `first_name=${afterMinimal[0]?.first_name}, resp=${afterMinimal[0]?.responsible_user_id}`,
  );

  // --- Идемпотентность: повтор того же запроса ----------------------------
  const replay = await api('POST', '/api/clients', {
    body: minimalBody,
    headers: { 'Idempotency-Key': 'check-minimal' },
  });
  check(replay.status === 201, 'Повтор запроса с тем же ключом: 201', `статус ${replay.status}`);
  check(
    replay.payload?.id === minimal.payload?.id,
    'Повтор вернул ту же запись',
    String(replay.payload?.id),
  );
  check(
    replay.headers.get('idempotent-replay') === 'true',
    'Ответ помечен как повторный',
    String(replay.headers.get('idempotent-replay')),
  );
  check(
    readClients().length === 1,
    'Повторный запрос не создал дубликат',
    `строк ${readClients().length}`,
  );

  // --- Сценарий 2: все поля ------------------------------------------------
  const full = await api('POST', '/api/clients', {
    body: {
      last_name: 'Иванов',
      first_name: 'Иван',
      middle_name: 'Иванович',
      phone: '+375291234567',
      email: 'client@example.com',
      responsible_user_id: responsible.id,
      comment: 'Создан из теста: все поля',
      reg_city: 'Минск',
    },
    headers: { 'Idempotency-Key': 'check-full' },
  });
  check(full.status === 201, 'Создание со всеми полями: 201', `статус ${full.status}`);
  const fullRow = readClients().find((row) => row.id === full.payload?.id);
  check(
    fullRow?.last_name === 'Иванов' &&
      fullRow?.first_name === 'Иван' &&
      fullRow?.middle_name === 'Иванович' &&
      fullRow?.email === 'client@example.com',
    'Все значения сохранены в таблицу «Клиенты»',
    JSON.stringify(fullRow ?? {}),
  );
  check(
    fullRow?.comment === 'Создан из теста: все поля' && full.payload?.comment === fullRow.comment,
    'Комментарий сохранён при создании и вернулся в ответе',
    String(fullRow?.comment),
  );
  check(
    fullRow?.reg_city === 'Минск' && full.payload?.reg_city === 'Минск',
    'Реквизиты сохраняются при создании клиента',
    String(fullRow?.reg_city),
  );

  // --- Валидация -----------------------------------------------------------
  const emptyName = await api('POST', '/api/clients', {
    body: { first_name: '   ', phone: '+375291112233', responsible_user_id: responsible.id },
  });
  check(
    emptyName.status === 422 && emptyName.payload?.error?.fieldErrors?.first_name === 'Укажите имя',
    'Имя из пробелов отклонено: «Укажите имя»',
    `${emptyName.status} ${JSON.stringify(emptyName.payload?.error?.fieldErrors)}`,
  );

  const noPhone = await api('POST', '/api/clients', {
    body: { first_name: 'Иван', responsible_user_id: responsible.id },
  });
  check(
    noPhone.status === 422 && noPhone.payload?.error?.fieldErrors?.phone === 'Укажите телефон',
    'Пустой телефон отклонён: «Укажите телефон»',
    `${noPhone.status} ${JSON.stringify(noPhone.payload?.error?.fieldErrors)}`,
  );

  const badEmail = await api('POST', '/api/clients', {
    body: {
      first_name: 'Иван',
      phone: '+375291112233',
      email: 'client@example',
      responsible_user_id: responsible.id,
    },
  });
  check(
    badEmail.status === 422 &&
      badEmail.payload?.error?.fieldErrors?.email === 'Укажите корректный E-mail',
    'Некорректный E-mail отклонён',
    `${badEmail.status} ${JSON.stringify(badEmail.payload?.error?.fieldErrors)}`,
  );

  const badResponsible = await api('POST', '/api/clients', {
    body: { first_name: 'Иван', phone: '+375291112233', responsible_user_id: 'usr-unknown' },
  });
  check(
    badResponsible.status === 422 &&
      badResponsible.payload?.error?.fieldErrors?.responsible_user_id ===
        'Выберите ответственного',
    'Несуществующий ответственный отклонён',
    `${badResponsible.status} ${JSON.stringify(badResponsible.payload?.error?.fieldErrors)}`,
  );

  const noResponsible = await api('POST', '/api/clients', {
    body: { first_name: 'Иван', phone: '+375291112233' },
  });
  check(
    noResponsible.status === 422,
    'Клиент без ответственного не сохраняется',
    `статус ${noResponsible.status}`,
  );

  const malformed = await api('POST', '/api/clients', {
    body: undefined,
    headers: { 'Content-Type': 'application/json' },
  });
  check(malformed.status === 422, 'Пустое тело запроса отклонено', `статус ${malformed.status}`);

  check(
    readClients().length === 2,
    'Неуспешные попытки не создали записей',
    `строк ${readClients().length}`,
  );

  // --- Список и поиск ------------------------------------------------------
  const list = await api('GET', '/api/clients');
  check(
    list.payload?.items?.[0]?.id === full.payload?.id,
    'Новые клиенты показываются сверху',
    `первый: ${describeClient(list.payload?.items?.[0] ?? {})}`,
  );

  const ru = await api('GET', `/api/clients?search=${encodeURIComponent('  ива  ')}`);
  check(
    ru.payload?.total === 1 && ru.payload?.items?.[0]?.last_name === 'Иванов',
    'Поиск «ива» находит «Иванов» без учёта регистра',
    `total ${ru.payload?.total}`,
  );

  const multiWord = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('иван   иванович')}`,
  );
  check(
    multiWord.payload?.total === 1,
    'Многословный запрос ищет по всем словам ФИО',
    `total ${multiWord.payload?.total}`,
  );

  const wrongOrder = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('иванович иван')}`,
  );
  check(
    wrongOrder.payload?.total === 1,
    'Порядок слов в запросе не важен',
    `total ${wrongOrder.payload?.total}`,
  );

  const nothing = await api('GET', `/api/clients?search=${encodeURIComponent('Сидоров')}`);
  check(
    nothing.payload?.total === 0,
    'Поиск без совпадений даёт пустой результат',
    `total ${nothing.payload?.total}`,
  );

  // Телефон: запрос из цифр и знаков оформления ищет по номеру, а не по ФИО.
  const phoneMask = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('+375 (29) 111-22-33')}`,
  );
  check(
    phoneMask.payload?.total === 1 && phoneMask.payload?.items?.[0]?.id === minimal.payload?.id,
    'Поиск по номеру в формате маски находит клиента',
    `total ${phoneMask.payload?.total}`,
  );

  const phonePart = await api('GET', '/api/clients?search=1112233');
  check(
    phonePart.payload?.total === 1 && phonePart.payload?.items?.[0]?.id === minimal.payload?.id,
    'Поиск по части номера находит клиента',
    `total ${phonePart.payload?.total}`,
  );

  const phoneOther = await api('GET', '/api/clients?search=291234567');
  check(
    phoneOther.payload?.total === 1 && phoneOther.payload?.items?.[0]?.id === full.payload?.id,
    'Поиск по номеру находит нужного клиента, а не первого в списке',
    `total ${phoneOther.payload?.total}`,
  );

  const phoneWith80 = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('8 029 111-22-33')}`,
  );
  check(
    phoneWith80.payload?.total === 1,
    'Начало «8 0» в номере не мешает поиску',
    `total ${phoneWith80.payload?.total}`,
  );

  const phoneWithCountryCode = await api(
    'GET',
    `/api/clients?search=${encodeURIComponent('375 29 1112233')}`,
  );
  check(
    phoneWithCountryCode.payload?.total === 1,
    'Код страны в запросе не мешает поиску',
    `total ${phoneWithCountryCode.payload?.total}`,
  );

  const phoneMissing = await api('GET', '/api/clients?search=99999');
  check(
    phoneMissing.payload?.total === 0,
    'Поиск по отсутствующему номеру ничего не находит',
    `total ${phoneMissing.payload?.total}`,
  );

  const mixedQuery = await api('GET', `/api/clients?search=${encodeURIComponent('иван 291')}`);
  check(
    mixedQuery.payload?.total === 0,
    'Запрос со словами ищет по ФИО: цифры не превращают его в поиск по номеру',
    `total ${mixedQuery.payload?.total}`,
  );

  const paged = await api('GET', '/api/clients?page=1&pageSize=1');
  check(
    paged.payload?.items?.length === 1 &&
      paged.payload?.total === 2 &&
      paged.payload?.hasMore === true,
    'Пагинация сообщает общее число записей',
    `items ${paged.payload?.items?.length}, total ${paged.payload?.total}, hasMore ${paged.payload?.hasMore}`,
  );

  const searchOnFirstPage = await api(
    'GET',
    `/api/clients?page=1&pageSize=1&search=${encodeURIComponent('пётр')}`,
  );
  check(
    searchOnFirstPage.payload?.total === 1 &&
      searchOnFirstPage.payload?.items?.[0]?.first_name === 'Пётр',
    'Поиск находит клиента вне первой страницы полного списка',
    `total ${searchOnFirstPage.payload?.total}, первый ${describeClient(searchOnFirstPage.payload?.items?.[0] ?? {})}`,
  );

  // --- Постоянное хранение -------------------------------------------------
  await app.close();

  const restarted = await startAppServer({ port: 0, staticDir: null });
  const afterRestart = await fetch(`${restarted.url}/api/clients`).then((response) =>
    response.json(),
  );
  check(
    afterRestart.total === 2,
    'После перезапуска сервера клиенты остаются в списке',
    `total ${afterRestart.total}`,
  );
  check(
    afterRestart.items.some((item) => item.id === minimal.payload?.id),
    'Созданный клиент сохранился в базе после перезапуска',
    `id ${minimal.payload?.id}`,
  );
  await restarted.close();

  // --- Телефон: единый формат и правила (дополнение к ТЗ) ------------------
  // Предыдущий сервер уже остановлен, для сценариев телефона поднимаем новый.
  const phoneServer = await startAppServer({ port: 0, staticDir: null });
  base = phoneServer.url;

  const phoneConfig = JSON.parse(
    readFileSync(new URL('../config/phone-national-codes.json', import.meta.url), 'utf8'),
  );
  const { PHONE_ALLOWED_CODES } = await import('../server/phone.mjs');
  check(
    phoneConfig.allowedCodes.join(',') === PHONE_ALLOWED_CODES.join(','),
    'Список кодов берётся сервером из конфигурации',
    PHONE_ALLOWED_CODES.join(', '),
  );
  const clientPhoneSource = readFileSync(
    new URL('../src/features/clients/utils/phone.ts', import.meta.url),
    'utf8',
  );
  check(
    clientPhoneSource.includes('config/phone-national-codes.json'),
    'Форма и сервер используют один файл конфигурации кодов',
  );

  const phoneAccepted = [
    ['+375 (44) 757-40-55', '+375447574055'],
    ['+375447574056', '+375447574056'],
    ['375447574057', '+375447574057'],
    ['8 044 757-40-58', '+375447574058'],
    ['80447574059', '+375447574059'],
    ['447574060', '+375447574060'],
  ];
  let phoneIndex = 0;
  for (const [input, expected] of phoneAccepted) {
    phoneIndex += 1;
    const createdPhone = await api('POST', '/api/clients', {
      body: {
        first_name: `Телефон ${phoneIndex}`,
        phone: input,
        responsible_user_id: responsible.id,
      },
      headers: { 'Idempotency-Key': `check-phone-${phoneIndex}` },
    });
    check(
      createdPhone.status === 201 && createdPhone.payload?.phone === expected,
      `Телефон «${input}» сохранён как ${createdPhone.payload?.phone}`,
      `статус ${createdPhone.status}`,
    );
  }

  const storedPhone = readClients().find((row) => row.first_name === 'Телефон 1');
  check(
    storedPhone?.phone === '+375447574055' && storedPhone.phone.length === 13,
    'В базе телефон хранится как +375XXXXXXXXX (13 символов)',
    `${storedPhone?.phone} (${storedPhone?.phone?.length} символов)`,
  );

  const phoneRejected = [
    ['', 'Укажите телефон'],
    ['+375', 'Укажите телефон'],
    ['+3754475', 'Введите номер полностью: +375 (XX) XXX-XX-XX'],
    ['+375161234567', 'Укажите номер с кодом 17, 25, 29, 33 или 44'],
  ];
  for (const [input, message] of phoneRejected) {
    const rejectedPhone = await api('POST', '/api/clients', {
      body: { first_name: 'Телефон', phone: input, responsible_user_id: responsible.id },
    });
    check(
      rejectedPhone.status === 422 &&
        rejectedPhone.payload?.error?.fieldErrors?.phone === message,
      `Телефон «${input || '(пусто)'}» отклонён: «${rejectedPhone.payload?.error?.fieldErrors?.phone}»`,
      `статус ${rejectedPhone.status}`,
    );
  }

  // --- Уникальность телефона -----------------------------------------------
  const rowsBeforeDuplicates = readClients().length;
  const duplicateCreate = await api('POST', '/api/clients', {
    body: {
      first_name: 'Дубль',
      phone: '+375 (44) 757-40-55',
      responsible_user_id: responsible.id,
    },
    headers: { 'Idempotency-Key': 'check-phone-duplicate' },
  });
  check(
    duplicateCreate.status === 409 && duplicateCreate.payload?.error?.code === 'duplicate_phone',
    'Создание с занятым номером отклонено: 409 duplicate_phone',
    `${duplicateCreate.status} ${duplicateCreate.payload?.error?.code}`,
  );
  const duplicateClient = duplicateCreate.payload?.error?.client;
  check(
    duplicateClient?.id === storedPhone?.id && duplicateClient?.first_name === 'Телефон 1',
    'В ответе указан найденный клиент',
    JSON.stringify(duplicateClient ?? {}),
  );
  check(
    Object.keys(duplicateClient ?? {}).sort().join(',') ===
      ['first_name', 'id', 'last_name', 'middle_name'].sort().join(','),
    'В ответе только id и части ФИО, без лишних данных',
    Object.keys(duplicateClient ?? {}).join(', '),
  );
  check(
    readClients().length === rowsBeforeDuplicates,
    'Дубль не создал запись',
    `строк ${readClients().length}`,
  );

  // Правка карточки без смены телефона дублем не считается.
  const ownCard = await api('GET', `/api/clients/${storedPhone.id}`);
  const samePhone = await api('PATCH', `/api/clients/${storedPhone.id}`, {
    body: {
      first_name: 'Телефон 1',
      phone: storedPhone.phone,
      responsible_user_id: responsible.id,
      expected_updated_at: ownCard.payload?.updated_at,
    },
  });
  check(
    samePhone.status === 200,
    'Сохранение карточки без смены телефона проходит',
    `статус ${samePhone.status}`,
  );

  // Смена телефона на номер другого клиента отклоняется.
  const ownCardAgain = await api('GET', `/api/clients/${storedPhone.id}`);
  const foreignPhone = await api('PATCH', `/api/clients/${storedPhone.id}`, {
    body: {
      first_name: 'Телефон 1',
      phone: '+375447574056',
      responsible_user_id: responsible.id,
      expected_updated_at: ownCardAgain.payload?.updated_at,
    },
  });
  check(
    foreignPhone.status === 409 && foreignPhone.payload?.error?.code === 'duplicate_phone',
    'Смена телефона на номер другого клиента отклонена',
    `${foreignPhone.status} ${foreignPhone.payload?.error?.code}`,
  );
  check(
    readClients().find((row) => row.id === storedPhone.id)?.phone === '+375447574055',
    'Телефон не изменён после отказа',
    String(readClients().find((row) => row.id === storedPhone.id)?.phone),
  );

  // Живая проверка телефона для подсказки при вводе номера.
  const liveFound = await api(
    'GET',
    `/api/clients/phone-check?phone=${encodeURIComponent('+375 (44) 757-40-55')}`,
  );
  check(
    liveFound.status === 200 && liveFound.payload?.duplicate?.id === storedPhone?.id,
    'Проверка телефона находит дубль',
    `${liveFound.status} ${JSON.stringify(liveFound.payload?.duplicate ?? {})}`,
  );
  check(
    Object.keys(liveFound.payload?.duplicate ?? {}).sort().join(',') ===
      ['first_name', 'id', 'last_name', 'middle_name'].sort().join(','),
    'Проверка телефона возвращает только id и части ФИО',
    Object.keys(liveFound.payload?.duplicate ?? {}).join(', '),
  );
  const liveFree = await api('GET', '/api/clients/phone-check?phone=999000111');
  check(
    liveFree.status === 200 && liveFree.payload?.duplicate === null,
    'Свободный номер дублем не считается',
    JSON.stringify(liveFree.payload ?? {}),
  );
  const liveSelf = await api(
    'GET',
    `/api/clients/phone-check?phone=${encodeURIComponent('+375447574055')}&excludeId=${storedPhone.id}`,
  );
  check(
    liveSelf.payload?.duplicate === null,
    'Собственная запись в живой проверке не учитывается',
    JSON.stringify(liveSelf.payload ?? {}),
  );

  await phoneServer.close();

  // --- Карточка клиента: чтение и сохранение (ТЗ на редактирование) --------
  const editServer = await startAppServer({ port: 0, staticDir: null });
  base = editServer.url;

  /** Актуальное значение updated_at: сервер сравнивает его для защиты от конфликта. */
  const readUpdatedAt = async (id) => (await api('GET', `/api/clients/${id}`)).payload.updated_at;
  const storedById = (id) => readClients().find((row) => row.id === id);

  const targetId = full.payload.id;
  const card = await api('GET', `/api/clients/${targetId}`);
  check(
    card.status === 200 && card.payload?.id === targetId,
    'GET /api/clients/{id} возвращает карточку',
    `статус ${card.status}`,
  );
  check(
    card.payload?.responsible_full_name === 'Минич Антон Андреевич',
    'Карточка содержит ФИО ответственного',
    String(card.payload?.responsible_full_name),
  );
  check(
    card.payload?.phone === '+375291234567' && card.payload?.last_name === 'Иванов',
    'Карточка содержит сохранённые значения полей',
    `${card.payload?.phone} / ${card.payload?.last_name}`,
  );

  const missingCard = await api('GET', '/api/clients/нет-такого-клиента');
  check(
    missingCard.status === 404 && missingCard.payload?.error?.message === 'Клиент не найден',
    'Несуществующий клиент: 404 «Клиент не найден»',
    `${missingCard.status} ${missingCard.payload?.error?.message}`,
  );

  // Очистка необязательных полей и правка телефона.
  const cleanupBody = {
    last_name: null,
    first_name: 'Иван',
    middle_name: null,
    phone: '+375 (29) 111-22-99',
    email: null,
    responsible_user_id: responsible.id,
    expected_updated_at: card.payload.updated_at,
  };
  const patched = await api('PATCH', `/api/clients/${targetId}`, {
    body: cleanupBody,
    headers: { 'Idempotency-Key': 'check-update-cleanup' },
  });
  check(patched.status === 200, 'PATCH /api/clients/{id} отвечает 200', `статус ${patched.status}`);
  check(
    patched.payload?.last_name === null &&
      patched.payload?.middle_name === null &&
      patched.payload?.email === null,
    'Очищенные необязательные поля возвращаются как null',
    JSON.stringify([
      patched.payload?.last_name,
      patched.payload?.middle_name,
      patched.payload?.email,
    ]),
  );
  check(
    patched.payload?.phone === '+375291112299',
    'Телефон при обновлении нормализован в +375XXXXXXXXX',
    String(patched.payload?.phone),
  );
  check(
    patched.payload?.id === targetId && patched.payload?.created_at === full.payload.created_at,
    'id и created_at при обновлении не меняются',
    `${patched.payload?.id} / ${patched.payload?.created_at}`,
  );
  check(
    patched.payload?.updated_at !== card.payload.updated_at,
    'updated_at при обновлении изменился',
    `${card.payload.updated_at} -> ${patched.payload?.updated_at}`,
  );

  const storedTarget = storedById(targetId);
  check(
    storedTarget?.last_name === null &&
      storedTarget?.middle_name === null &&
      storedTarget?.email === null,
    'В базе очищенные поля хранятся как NULL, а не как пустая строка',
    JSON.stringify([storedTarget?.last_name, storedTarget?.middle_name, storedTarget?.email]),
  );
  check(
    storedTarget?.created_at === full.payload.created_at &&
      storedTarget?.phone === '+375291112299',
    'Строка в базе обновлена, created_at не изменён',
    `${storedTarget?.created_at} / ${storedTarget?.phone}`,
  );
  check(
    readClients().length === 8,
    'Обновление не создало новую запись',
    `строк ${readClients().length}`,
  );

  // Повтор той же операции: ответ возвращается из сохранённого, запись не меняется.
  const replayUpdate = await api('PATCH', `/api/clients/${targetId}`, {
    body: { ...cleanupBody, first_name: 'Другое', expected_updated_at: patched.payload.updated_at },
    headers: { 'Idempotency-Key': 'check-update-cleanup' },
  });
  check(
    replayUpdate.status === 200 && replayUpdate.headers.get('idempotent-replay') === 'true',
    'Повтор запроса обновления помечен как повторный',
    `статус ${replayUpdate.status}, заголовок ${replayUpdate.headers.get('idempotent-replay')}`,
  );
  check(
    replayUpdate.payload?.first_name === 'Иван' &&
      storedById(targetId)?.first_name === 'Иван',
    'Повторная отправка не изменила запись второй раз',
    String(storedById(targetId)?.first_name),
  );

  // id, created_at и updated_at нельзя передать произвольно: сервер их игнорирует.
  const hijack = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...cleanupBody,
      id: 'podmena-id',
      created_at: '1999-01-01T00:00:00.000Z',
      updated_at: '1999-01-01T00:00:00.000Z',
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    hijack.payload?.id === targetId && hijack.payload?.created_at === full.payload.created_at,
    'Подменить id и created_at через API нельзя',
    `${hijack.payload?.id} / ${hijack.payload?.created_at}`,
  );

  // Конфликт: карточку уже изменили, клиент присылает устаревший updated_at.
  const conflict = await api('PATCH', `/api/clients/${targetId}`, {
    body: { ...cleanupBody, first_name: 'Затёртый', expected_updated_at: card.payload.updated_at },
  });
  check(
    conflict.status === 409 &&
      conflict.payload?.error?.message ===
        'Карточка была изменена другим пользователем. Обновите данные.',
    'Устаревший updated_at отклонён: 409 с сообщением о конфликте',
    `${conflict.status} ${conflict.payload?.error?.message}`,
  );
  check(
    storedById(targetId)?.first_name === 'Иван',
    'Конфликт не затёр чужие правки',
    String(storedById(targetId)?.first_name),
  );

  const noExpected = await api('PATCH', `/api/clients/${targetId}`, {
    body: { first_name: 'Иван', phone: '+375291112299', responsible_user_id: responsible.id },
  });
  check(
    noExpected.status === 422,
    'Запрос без expected_updated_at отклонён',
    `статус ${noExpected.status}`,
  );

  // Проверки полей при обновлении совпадают с проверками при создании.
  const patchCases = [
    [{ first_name: '   ' }, 'first_name', 'Укажите имя'],
    [{ phone: '+375' }, 'phone', 'Укажите телефон'],
    [{ phone: '+3754475' }, 'phone', 'Введите номер полностью: +375 (XX) XXX-XX-XX'],
    [{ email: 'client@example' }, 'email', 'Укажите корректный E-mail'],
    [{ responsible_user_id: 'usr-unknown' }, 'responsible_user_id', 'Выберите ответственного'],
  ];
  for (const [override, field, message] of patchCases) {
    const rejected = await api('PATCH', `/api/clients/${targetId}`, {
      body: {
        first_name: 'Иван',
        phone: '+375291112299',
        responsible_user_id: responsible.id,
        expected_updated_at: await readUpdatedAt(targetId),
        ...override,
      },
    });
    check(
      rejected.status === 422 && rejected.payload?.error?.fieldErrors?.[field] === message,
      `Обновление с неверным полем ${field} отклонено: «${message}»`,
      `${rejected.status} ${JSON.stringify(rejected.payload?.error?.fieldErrors)}`,
    );
  }
  check(
    storedById(targetId)?.first_name === 'Иван' &&
      storedById(targetId)?.phone === '+375291112299',
    'Неуспешные обновления не изменили запись',
    `${storedById(targetId)?.first_name} / ${storedById(targetId)?.phone}`,
  );

  const patchMissing = await api('PATCH', '/api/clients/нет-такого-клиента', {
    body: { ...cleanupBody, expected_updated_at: await readUpdatedAt(targetId) },
  });
  check(
    patchMissing.status === 404,
    'Обновление несуществующего клиента: 404',
    `статус ${patchMissing.status}`,
  );

  // Комментарий: лимит 500 символов, переводы строк и очистка до NULL.
  const comment500 = 'к'.repeat(500);
  const saved500 = await api('PATCH', `/api/clients/${targetId}`, {
    body: { ...cleanupBody, comment: comment500, expected_updated_at: await readUpdatedAt(targetId) },
  });
  check(
    saved500.status === 200 && saved500.payload?.comment === comment500,
    'Комментарий из 500 символов сохранён',
    `статус ${saved500.status}, длина ${saved500.payload?.comment?.length}`,
  );
  check(
    storedById(targetId)?.comment === comment500,
    'Комментарий записан в таблицу «Клиенты»',
    `длина ${storedById(targetId)?.comment?.length}`,
  );

  const comment501 = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...cleanupBody,
      comment: 'к'.repeat(501),
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    comment501.status === 422 &&
      comment501.payload?.error?.fieldErrors?.comment ===
        'Комментарий не должен превышать 500 символов',
    'Комментарий из 501 символа отклонён с сообщением',
    `${comment501.status} ${JSON.stringify(comment501.payload?.error?.fieldErrors)}`,
  );

  const multiline = 'Первая строка\nВторая строка';
  const savedMultiline = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...cleanupBody,
      comment: `  ${multiline}  `,
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    savedMultiline.payload?.comment === multiline,
    'Переводы строк сохранены, пробелы по краям убраны',
    JSON.stringify(savedMultiline.payload?.comment),
  );
  const cardWithComment = await api('GET', `/api/clients/${targetId}`);
  check(
    cardWithComment.payload?.comment === multiline,
    'Карточка возвращает комментарий',
    JSON.stringify(cardWithComment.payload?.comment),
  );

  const cleared = await api('PATCH', `/api/clients/${targetId}`, {
    body: { ...cleanupBody, comment: '   ', expected_updated_at: await readUpdatedAt(targetId) },
  });
  check(
    cleared.payload?.comment === null && storedById(targetId)?.comment === null,
    'Пустой комментарий сохраняется как NULL, а не как пустая строка',
    String(cleared.payload?.comment),
  );

  // --- Реквизиты: два адреса (вкладка «Реквизиты») -------------------------
  const addressesBody = {
    ...cleanupBody,
    reg_postal_code: ' 220030 ',
    reg_country: 'Беларусь',
    reg_city: 'Минск',
    reg_street: 'пр. Независимости',
    reg_house: '1',
    reg_building: '2',
    reg_apartment: '3',
    expected_updated_at: await readUpdatedAt(targetId),
  };
  const savedAddresses = await api('PATCH', `/api/clients/${targetId}`, { body: addressesBody });
  check(
    savedAddresses.status === 200 &&
      savedAddresses.payload?.reg_postal_code === '220030' &&
      savedAddresses.payload?.reg_city === 'Минск' &&
      savedAddresses.payload?.reg_building === '2',
    'Адрес регистрации сохранён, пробелы по краям убраны',
    `${savedAddresses.status} ${savedAddresses.payload?.reg_postal_code}`,
  );
  check(
    savedAddresses.payload?.res_city === null && savedAddresses.payload?.res_street === null,
    'Незаполненный адрес проживания остаётся NULL',
    `${savedAddresses.payload?.res_city} / ${savedAddresses.payload?.res_street}`,
  );
  const storedAddress = storedById(targetId);
  check(
    storedAddress?.reg_street === 'пр. Независимости' && storedAddress?.reg_apartment === '3',
    'Адрес регистрации записан в таблицу «Клиенты»',
    `${storedAddress?.reg_street} / ${storedAddress?.reg_apartment}`,
  );

  const bothAddresses = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...addressesBody,
      res_postal_code: '220000',
      res_country: 'Беларусь',
      res_city: 'Гомель',
      res_street: 'ул. Ленина',
      res_house: '5',
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    bothAddresses.payload?.res_city === 'Гомель' && bothAddresses.payload?.reg_city === 'Минск',
    'Оба адреса сохраняются вместе',
    `${bothAddresses.payload?.reg_city} / ${bothAddresses.payload?.res_city}`,
  );

  const clearedAddress = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...addressesBody,
      res_city: '   ',
      res_street: null,
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    clearedAddress.payload?.res_city === null && clearedAddress.payload?.res_street === null,
    'Очищенные поля адреса сохраняются как NULL',
    `${clearedAddress.payload?.res_city} / ${clearedAddress.payload?.res_street}`,
  );

  const longStreet = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...addressesBody,
      reg_street: 'у'.repeat(151),
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    longStreet.status === 422 &&
      longStreet.payload?.error?.fieldErrors?.reg_street === 'Не более 150 символов',
    'Улица длиннее 150 символов отклонена',
    `${longStreet.status} ${JSON.stringify(longStreet.payload?.error?.fieldErrors)}`,
  );

  const longPostalCode = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...addressesBody,
      reg_postal_code: '1'.repeat(21),
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    longPostalCode.status === 422 &&
      longPostalCode.payload?.error?.fieldErrors?.reg_postal_code === 'Не более 20 символов',
    'Индекс длиннее 20 символов отклонён',
    `${longPostalCode.status} ${JSON.stringify(longPostalCode.payload?.error?.fieldErrors)}`,
  );

  const longCountry = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      ...addressesBody,
      reg_country: 'с'.repeat(101),
      expected_updated_at: await readUpdatedAt(targetId),
    },
  });
  check(
    longCountry.status === 422 &&
      longCountry.payload?.error?.fieldErrors?.reg_country === 'Не более 100 символов',
    'Страна длиннее 100 символов отклонена',
    `${longCountry.status} ${JSON.stringify(longCountry.payload?.error?.fieldErrors)}`,
  );
  check(
    storedById(targetId)?.reg_street === 'пр. Независимости' &&
      storedById(targetId)?.reg_postal_code === '220030',
    'Отклонённые значения не записались',
    String(storedById(targetId)?.reg_postal_code),
  );

  const cardWithAddresses = await api('GET', `/api/clients/${targetId}`);
  check(
    cardWithAddresses.payload?.reg_city === 'Минск' &&
      cardWithAddresses.payload?.reg_postal_code === '220030',
    'Карточка клиента возвращает реквизиты',
    `${cardWithAddresses.payload?.reg_postal_code} / ${cardWithAddresses.payload?.reg_city}`,
  );
  const listWithoutAddresses = await api('GET', '/api/clients');
  check(
    listWithoutAddresses.payload?.items?.every(
      (item) => !('reg_city' in item) && !('res_city' in item) && !('reg_postal_code' in item),
    ),
    'В ответе списка реквизитов нет',
    Object.keys(listWithoutAddresses.payload?.items?.[0] ?? {}).join(', '),
  );

  // Порядок списка определяется created_at: изменённая запись остаётся на месте.
  const orderBefore = (await api('GET', '/api/clients')).payload.items.map((item) => item.id);
  const finalUpdate = await api('PATCH', `/api/clients/${targetId}`, {
    body: {
      last_name: 'Сидоров',
      first_name: 'Семён',
      middle_name: 'Петрович',
      phone: '+375291112299',
      email: 'semen@example.com',
      responsible_user_id: responsible.id,
      expected_updated_at: await readUpdatedAt(targetId),
    },
    headers: { 'Idempotency-Key': 'check-update-final' },
  });
  check(
    finalUpdate.status === 200,
    'Сохранение всех полей карточки: 200',
    `статус ${finalUpdate.status}`,
  );
  const orderAfter = (await api('GET', '/api/clients')).payload.items.map((item) => item.id);
  check(
    orderAfter.join('|') === orderBefore.join('|'),
    'Обновление не изменило порядок списка',
    orderAfter.join(', '),
  );
  check(
    storedById(targetId)?.last_name === 'Сидоров' &&
      storedById(targetId)?.middle_name === 'Петрович' &&
      storedById(targetId)?.email === 'semen@example.com',
    'Новые значения сохранены в таблицу «Клиенты»',
    `${storedById(targetId)?.last_name} / ${storedById(targetId)?.email}`,
  );

  await editServer.close();

  const dbCheck = new DatabaseSync(DB_FILE);
  const table = dbCheck
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clients'")
    .get();
  const rowCount = dbCheck.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
  const fkList = dbCheck.prepare('PRAGMA foreign_key_list(clients)').all();
  const updateTable = dbCheck
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'client_update_requests'",
    )
    .get();
  dbCheck.close();
  check(table?.name === 'clients', 'В базе есть таблица «Клиенты» (clients)', String(table?.name));
  check(rowCount === 8, 'В таблице «Клиенты» восемь подтверждённых записей', `строк ${rowCount}`);
  check(
    updateTable?.name === 'client_update_requests',
    'В базе есть таблица защиты повторных обновлений',
    String(updateTable?.name),
  );
  check(
    fkList.some((fk) => fk.table === 'users' && fk.from === 'responsible_user_id'),
    'responsible_user_id — внешний ключ на справочник пользователей',
    JSON.stringify(fkList),
  );
} finally {
  await app.close().catch(() => {});
}

for (const { ok, title, detail } of results) {
  console.log(`${ok ? 'ок  ' : 'ОШИБКА'} ${title}${detail ? ` — ${detail}` : ''}`);
}

console.log(
  failed === 0
    ? `\nВсе сценарии пройдены (${results.length}).`
    : `\nОшибок: ${failed} из ${results.length}`,
);

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${DB_FILE}${suffix}`, { force: true });
}

process.exitCode = failed === 0 ? 0 : 1;
