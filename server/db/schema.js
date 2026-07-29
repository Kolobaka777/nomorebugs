import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DB_PATH lets tests (and other environments) point at an isolated database,
// e.g. ":memory:" or a temp file, instead of the real dev/prod database.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'learning_hub.db');

if (process.env.NODE_ENV !== 'test') console.log('DB path:', dbPath);

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    -- role is deliberately NOT constrained to a fixed CHECK(...) list here —
    -- the valid-roles list lives in src/roles.js instead, so adding a role
    -- (e.g. a future 'layout_designer') never requires a schema migration.
    -- Validity is enforced at the application layer (registration, admin
    -- role-change endpoint) instead of the DB layer.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar_initials TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lectures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      order_num INTEGER NOT NULL UNIQUE,
      skill_area TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lecture_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL CHECK(correct_answer IN ('a', 'b', 'c', 'd')),
      explanation TEXT,
      order_num INTEGER NOT NULL,
      FOREIGN KEY (lecture_id) REFERENCES lectures(id)
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lecture_id INTEGER NOT NULL,
      score REAL NOT NULL,
      answers TEXT NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lecture_id) REFERENCES lectures(id),
      UNIQUE(user_id, lecture_id)
    );

    CREATE TABLE IF NOT EXISTS baseline_survey (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      html_structure INTEGER NOT NULL CHECK(html_structure >= 1 AND html_structure <= 5),
      css_reading INTEGER NOT NULL CHECK(css_reading >= 1 AND css_reading <= 5),
      devtools INTEGER NOT NULL CHECK(devtools >= 1 AND devtools <= 5),
      console_errors INTEGER NOT NULL CHECK(console_errors >= 1 AND console_errors <= 5),
      bug_report_quality INTEGER NOT NULL CHECK(bug_report_quality >= 1 AND bug_report_quality <= 5),
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS final_survey (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      html_structure INTEGER NOT NULL CHECK(html_structure >= 1 AND html_structure <= 5),
      css_reading INTEGER NOT NULL CHECK(css_reading >= 1 AND css_reading <= 5),
      devtools INTEGER NOT NULL CHECK(devtools >= 1 AND devtools <= 5),
      console_errors INTEGER NOT NULL CHECK(console_errors >= 1 AND console_errors <= 5),
      bug_report_quality INTEGER NOT NULL CHECK(bug_report_quality >= 1 AND bug_report_quality <= 5),
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      lecture_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lecture_id) REFERENCES lectures(id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      nickname TEXT,
      status_quote TEXT DEFAULT '',
      specialization TEXT DEFAULT '',
      info_box TEXT DEFAULT '',
      snail_joke TEXT DEFAULT '',
      avatar_id TEXT DEFAULT 'bug1',
      avatar_frame TEXT DEFAULT 'default',
      profile_bg TEXT DEFAULT 'default',
      showcase_badges TEXT DEFAULT '[]',
      favorite_lecture_id INTEGER,
      is_public INTEGER DEFAULT 1,
      custom_avatar TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lecture_id INTEGER NOT NULL,
      skill_area TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'common',
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lecture_id) REFERENCES lectures(id),
      UNIQUE(user_id, lecture_id)
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS checklist_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      task_type TEXT NOT NULL,
      color TEXT DEFAULT '#1D9E75',
      order_num INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
    );

    CREATE TABLE IF NOT EXISTS checklist_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      task_name TEXT NOT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
    );

    CREATE TABLE IF NOT EXISTS checklist_item_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ok', 'fail', 'skip')),
      FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id),
      FOREIGN KEY (item_id) REFERENCES checklist_items(id)
    );

    CREATE TABLE IF NOT EXISTS course_time_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      seconds_spent INTEGER NOT NULL DEFAULT 0,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS custom_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      tag TEXT DEFAULT 'Custom',
      color TEXT DEFAULT '#1D9E75',
      requirements TEXT DEFAULT 'Подходит для всех уровней',
      is_published INTEGER DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS custom_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES custom_courses(id)
    );

    CREATE TABLE IF NOT EXISTS custom_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'lesson' CHECK(type IN ('lesson', 'quiz')),
      content TEXT DEFAULT '',
      order_num INTEGER DEFAULT 0,
      -- Prerequisite tri-state: 'none' (always accessible), 'optional' (a
      -- non-blocking recommendation — usually external material we can't
      -- verify was read, so it can't gate access), 'mandatory' (blocks
      -- access until prerequisite_lesson_id is completed by this user).
      prerequisite_type TEXT DEFAULT 'none' CHECK(prerequisite_type IN ('none', 'optional', 'mandatory')),
      prerequisite_lesson_id INTEGER,
      prerequisite_note TEXT DEFAULT '',
      FOREIGN KEY (module_id) REFERENCES custom_modules(id),
      FOREIGN KEY (prerequisite_lesson_id) REFERENCES custom_lessons(id)
    );

    -- Server-side record of lesson completion — previously tracked only in
    -- localStorage (client-only, spoofable, didn't sync across devices).
    -- This is also what mandatory-prerequisite enforcement checks against.
    CREATE TABLE IF NOT EXISTS custom_lesson_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lesson_id) REFERENCES custom_lessons(id),
      UNIQUE(user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS custom_quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_idx INTEGER NOT NULL DEFAULT 0,
      explanation TEXT DEFAULT '',
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (lesson_id) REFERENCES custom_lessons(id)
    );

    -- Revocable refresh tokens. Only a hash is stored (never the raw token),
    -- mirroring how passwords are handled — the DB itself shouldn't be a
    -- usable credential store if it leaks.
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- One-time-use tokens bridging a browser tab and a Telegram chat: the
    -- browser creates a row and shows a deep link (t.me/bot?start=<token>),
    -- the bot's /start handler fills in the result once the user taps it,
    -- and the browser (polling) picks the result up exactly once. Two
    -- distinct flows share this table: link_user_id set = "attach Telegram
    -- to my already-logged-in account" (no session issued, just linked);
    -- unset = "log in/register via Telegram" (issues a real session,
    -- auto-registering a tester account on first contact). access_token/
    -- refresh_token/user_json are only ever populated transiently, for the
    -- single poll that consumes them — see telegram.js.
    CREATE TABLE IF NOT EXISTS telegram_login_tokens (
      token TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'error')),
      link_user_id INTEGER,
      user_id INTEGER,
      access_token TEXT,
      refresh_token TEXT,
      user_json TEXT,
      needs_baseline_survey INTEGER DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (link_user_id) REFERENCES users(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // The in-app notification system (added, then removed per product
  // decision) is gone from the app — drop the table so local dev DBs from
  // that period don't carry an orphaned table around.
  try { db.exec('DROP TABLE IF EXISTS notifications'); } catch {}

  // One-time: drop the old CHECK(role IN ('tester','lead')) constraint from
  // any DB created before the role model became app-validated instead of
  // DB-validated (see the users table comment above). SQLite has no ALTER
  // TABLE ... DROP CONSTRAINT, so this rebuilds the table — safe here only
  // because the app is pre-launch (no real user data to risk). Detected by
  // inspecting the table's actual CREATE SQL rather than a version flag, so
  // it's naturally idempotent: once rebuilt, the CHECK text is gone and
  // this block never runs again.
  //
  // Wrapped in a transaction and drops any stray `users_new` up front —
  // caught in the wild during development: `node --watch` restarted mid
  // migration (multi-statement exec isn't atomic on its own) and left a
  // `users_new` with the copied rows but the old `users` table still live.
  // Both properties below are what make this recoverable rather than a
  // permanent stuck state: the transaction means a future interrupted run
  // can't leave a *partial* rebuild, and the DROP IF EXISTS means an
  // interrupted run's leftover table doesn't block the next attempt.
  //
  // Also caught in the wild: this better-sqlite3 build defaults
  // `PRAGMA foreign_keys` to ON (not SQLite's usual off-by-default), so
  // dropping `users` while activity_log/test_results/etc. still hold rows
  // referencing it fails with SQLITE_CONSTRAINT_FOREIGNKEY. FK checks are
  // off for the duration of the rebuild (SQLite's own documented pattern
  // for this exact "change a parent table's DDL, keep the same rows and
  // ids so every child FK stays valid" case) and always restored
  // afterwards, success or failure, via try/finally — a thrown error here
  // must never leave FK enforcement silently disabled for the rest of the
  // process.
  const usersTableSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).get();
  if (usersTableSql?.sql?.includes('CHECK(role IN')) {
    const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
    if (fkWasOn) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
          DROP TABLE IF EXISTS users_new;
          CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar_initials TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO users_new SELECT * FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
        `);
      })();
    } finally {
      if (fkWasOn) db.pragma('foreign_keys = ON');
    }
  }

  // Migrations: add columns to existing tables safely
  try { db.exec('ALTER TABLE user_profiles ADD COLUMN bug_coins INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE user_profiles ADD COLUMN purchased_items TEXT DEFAULT \'[]\''); } catch {}

  // Telegram linkage. SQLite's ALTER TABLE ADD COLUMN can't declare UNIQUE
  // inline, so uniqueness is enforced via a separate partial index instead
  // (partial so any number of NULLs — i.e. accounts with no Telegram linked
  // — coexist fine; only real, non-null telegram_id values must be unique).
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('telegram_id')) {
    db.exec(`
      ALTER TABLE users ADD COLUMN telegram_id TEXT;
      ALTER TABLE users ADD COLUMN telegram_username TEXT;
    `);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL');

  // custom_lessons prerequisite columns: one-time add + backfill. Backfill
  // only runs the first time these columns are added (gated on the column
  // not existing yet) so it never overwrites a lead's later manual edits.
  const customLessonCols = db.prepare("PRAGMA table_info(custom_lessons)").all().map(c => c.name);
  if (!customLessonCols.includes('prerequisite_type')) {
    db.exec(`
      ALTER TABLE custom_lessons ADD COLUMN prerequisite_type TEXT DEFAULT 'none';
      ALTER TABLE custom_lessons ADD COLUMN prerequisite_lesson_id INTEGER;
      ALTER TABLE custom_lessons ADD COLUMN prerequisite_note TEXT DEFAULT '';
    `);
    backfillSequentialPrerequisites();
  }

  // Checklist schema migration: check if new columns exist
  const checklistItemCols = db.prepare("PRAGMA table_info(checklist_items)").all().map(c => c.name);
  if (!checklistItemCols.includes('category')) {
    // Drop old checklist tables and recreate with v2 schema
    db.exec(`
      DROP TABLE IF EXISTS checklist_item_results;
      DROP TABLE IF EXISTS checklist_submissions;
      DROP TABLE IF EXISTS checklist_items;
      DROP TABLE IF EXISTS checklist_templates;

      CREATE TABLE checklist_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        task_type TEXT NOT NULL,
        color TEXT DEFAULT '#1D9E75',
        order_num INTEGER DEFAULT 0
      );

      CREATE TABLE checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL,
        category TEXT DEFAULT '',
        text TEXT NOT NULL,
        order_num INTEGER DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
      );

      CREATE TABLE checklist_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        task_name TEXT NOT NULL,
        content_author TEXT DEFAULT '',
        verska_author TEXT DEFAULT '',
        task_type TEXT DEFAULT '',
        check_date TEXT DEFAULT '',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
      );

      CREATE TABLE checklist_item_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ok', 'fail', 'na')),
        FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id),
        FOREIGN KEY (item_id) REFERENCES checklist_items(id)
      );
    `);
    seedChecklistTemplates();
  } else {
    // Ensure submissions has new columns (safe migration)
    const subCols = db.prepare("PRAGMA table_info(checklist_submissions)").all().map(c => c.name);
    try { if (!subCols.includes('content_author')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN content_author TEXT DEFAULT ''"); } catch {}
    try { if (!subCols.includes('verska_author')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN verska_author TEXT DEFAULT ''"); } catch {}
    try { if (!subCols.includes('task_type')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN task_type TEXT DEFAULT ''"); } catch {}
    try { if (!subCols.includes('check_date')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN check_date TEXT DEFAULT ''"); } catch {}

    // Migration: add in_mvt column (1 = included in MVT mode, 0 = full only)
    try { if (!checklistItemCols.includes('in_mvt')) db.exec('ALTER TABLE checklist_items ADD COLUMN in_mvt INTEGER DEFAULT 1'); } catch {}

    // Check if preland template has full items (75 items) — if still old (9 items), reseed
    const prelandTpl = db.prepare("SELECT id FROM checklist_templates WHERE task_type = 'prelending'").get();
    if (prelandTpl) {
      const itemCount = db.prepare('SELECT COUNT(*) as c FROM checklist_items WHERE template_id = ?').get(prelandTpl.id);
      if (itemCount.c < 20) {
        db.prepare('DELETE FROM checklist_items WHERE template_id = ?').run(prelandTpl.id);
        seedPrelandItems(prelandTpl.id);
      }
    }
  }

  // Indexes on every foreign-key / lookup column that gets JOINed or
  // filtered on. None of these existed before — fine at seed-data scale,
  // but every one of these queries was a full table scan waiting to
  // happen as activity_log, checklist_submissions, etc. grow. Placed last
  // so every column referenced here is guaranteed to already exist,
  // including ones added by the migrations above.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_questions_lecture_id ON questions(lecture_id);
    CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
    CREATE INDEX IF NOT EXISTS idx_test_results_lecture_id ON test_results(lecture_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_items_template_id ON checklist_items(template_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_submissions_user_id ON checklist_submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_submissions_template_id ON checklist_submissions(template_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_submissions_submitted_at ON checklist_submissions(submitted_at);
    CREATE INDEX IF NOT EXISTS idx_checklist_item_results_submission_id ON checklist_item_results(submission_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_item_results_item_id ON checklist_item_results(item_id);
    CREATE INDEX IF NOT EXISTS idx_course_time_tracking_user_id ON course_time_tracking(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_modules_course_id ON custom_modules(course_id);
    CREATE INDEX IF NOT EXISTS idx_custom_lessons_module_id ON custom_lessons(module_id);
    CREATE INDEX IF NOT EXISTS idx_custom_lessons_prerequisite_lesson_id ON custom_lessons(prerequisite_lesson_id);
    CREATE INDEX IF NOT EXISTS idx_custom_lesson_progress_user_id ON custom_lesson_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_lesson_progress_lesson_id ON custom_lesson_progress(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_custom_quiz_questions_lesson_id ON custom_quiz_questions(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_custom_courses_created_by ON custom_courses(created_by);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_telegram_login_tokens_expires_at ON telegram_login_tokens(expires_at);
  `);
}

// One-time backfill: preserves the exact lock behavior that existed before
// prerequisites were configurable (each lesson required the immediately
// preceding one, first lesson of a course always open), expressed now as
// explicit 'mandatory' prerequisite rows instead of implicit client-side
// index math.
function backfillSequentialPrerequisites() {
  const courses = db.prepare('SELECT id FROM custom_courses').all();
  const setPrereq = db.prepare(
    "UPDATE custom_lessons SET prerequisite_type = 'mandatory', prerequisite_lesson_id = ? WHERE id = ?"
  );
  for (const course of courses) {
    const lessons = db.prepare(`
      SELECT cl.id FROM custom_lessons cl
      JOIN custom_modules cm ON cm.id = cl.module_id
      WHERE cm.course_id = ?
      ORDER BY cm.order_num, cl.order_num
    `).all(course.id);
    for (let i = 1; i < lessons.length; i++) {
      setPrereq.run(lessons[i - 1].id, lessons[i].id);
    }
  }
}

function seedChecklistTemplates() {
  const insertTpl = db.prepare('INSERT INTO checklist_templates (name, task_type, color, order_num) VALUES (?, ?, ?, ?)');

  const r1 = insertTpl.run('Прелендинг', 'prelending', '#1D9E75', 1);
  seedPrelandItems(r1.lastInsertRowid);

  const r2 = insertTpl.run('Оффер', 'offer', '#7F77DD', 2);
  seedOfferItems(r2.lastInsertRowid);

  const r3 = insertTpl.run('Вайт', 'white', '#EF9F27', 3);
  seedWhiteItems(r3.lastInsertRowid);
}

function seedPrelandItems(tplId) {
  const insertItem = db.prepare('INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)');
  let n = 1;
  const add = (cat, text) => insertItem.run(tplId, cat, text, n++);

  add('Визуал', 'Футер соответствует стандарту (лого + строка копирайта, год)');
  add('Визуал', 'Сайд-блок скрыт в мобильной версии');
  add('Визуал', 'Нет указания погоды или иной привязки ко времени');
  add('Визуал', 'Прокрутка в верхнем меню (хедере) работает корректно');
  add('Визуал', 'Новостной блок корректен: без старых новостей, ровная верстка');
  add('Визуал', 'Инструкция оформлена по стандарту - отцентровка');
  add('Визуал', '203885 ID');
  add('Визуал', 'Верстка корректна');
  add('Визуал', 'Интервалы соблюдены во всех частях страницы');
  add('Визуал', 'Имена в интервью выделены жирным');
  add('Визуал', 'Слово "Важно" выделено красным, только одно');
  add('Визуал', 'Оформление постов соцсетей, блока с отзывами');
  add('Визуал', 'Визуальная и функциональная проверка через фб-браузер');

  add('Функционал', 'Ховер-эффект отсутствует');
  add('Функционал', 'Серые поля у чеков в слайдере и документа, лупа в слайдере');
  add('Функционал', 'Неразрывный пробел');
  add('Функционал', 'Кнопка не исчезает при наведении курсора');
  add('Функционал', 'Плеер работает корректно');
  add('Функционал', 'Интерактив работает корректно: слайдер, ползунки и проч');
  add('Функционал', 'Горизонтальный скролл отсутствует');
  add('Функционал', 'Форма в лендофферах');
  add('Функционал', 'Скорость загрузки (время и ошибки) – обновление новостника');
  add('Функционал', 'Наличие {{split.lp_header}} // {{split.lp_content_var_header_image}}');

  add('Ссылки', 'В одном абзаце только один вид ссылки');
  add('Ссылки', 'Одинаковый дизайн ссылок по всему преленду');
  add('Ссылки', 'Оффернейм подставлен корректно');
  add('Ссылки', 'Выделены все фразы «слово+link», оба слова');
  add('Ссылки', 'Ссылка осуществляет корректный переход');
  add('Ссылки', 'Все элементы, кроме ссылок, некликабельны');

  add('Картинки', 'Все картинки корректно отображаются');
  add('Картинки', 'Содержание картинок корректно (гео, погода, даты и др)');

  add('Пунктуация', 'Опечатка/орфографические ошибки');
  add('Пунктуация', 'Тысячные значения оформлены единообразно');
  add('Пунктуация', 'Отсутствует точка в конце заголовка и подзаголовка');
  add('Пунктуация', 'Род, падежи в тексте');
  add('Пунктуация', 'Валюта по тексту соответствует гео');

  add('Смысловая нагрузка', 'В 1м дне экспа в последнем абзаце стоит 2 транзакции, не 4');
  add('Смысловая нагрузка', 'Отсутствует упоминание других гео/национальностей/селеб');
  add('Смысловая нагрузка', 'Смысловые ошибки');
  add('Смысловая нагрузка', 'Язык соответствует гео во всех частях текста');
  add('Смысловая нагрузка', 'Имена написанны корректно/единообразно');
  add('Смысловая нагрузка', 'Дата: публикации, регистрации, даты в тексте');
  add('Смысловая нагрузка', 'Имя "М с компами/редактора" одинаковое в 3х местах: подпись под фото, справка 2го дня, чек 7го дня');
  add('Смысловая нагрузка', 'Варселеб: все плейсхолдеры используются корректно');

  add('Квитанция', 'Квитанция нового формата - фото физического чека');
  add('Квитанция', 'Данные в квитанции заблюрены достаточно');
  add('Квитанция', 'Сумма дохода соответствует заявленной в тексте');
  add('Квитанция', 'Имя соответствует заявленному в тексте');
  add('Квитанция', 'Данные чека соответствует гео (телефон, адрес, перевод)');
  add('Квитанция', 'Ссылка в комментарии соответствует стандарту');
  add('Квитанция', 'Содержание комментариев корректно (смысл шаблона, селеба, м/ж)');
  add('Квитанция', 'Скрин банка использован уместно (имя, куда прекреплен по смыслу)');

  add('Комментарии', 'Авы/никнеймы/кнопки/поле ввода, слово "комментарии" соответствуют гео и полу: гость на языке гео');
  add('Комментарии', 'Авы/никнеймы/лайки не дублируются');
  add('Комментарии', 'Гость без аватарки');
  add('Комментарии', 'Аватарка соответствует имени и гео');
  add('Комментарии', 'Верстка комментариев корректна (наслоение, длина, кнопки, язык кнопок)');
  add('Комментарии', 'Хронология в комментариях корректна');
  add('Комментарии', 'Поле ввода комм некликабельно, стоит верная заглушка');
  add('Комментарии', 'Слово "Комментарии" во множетсвенном числе, актуальное количество комментариев');

  add('Новые проверки', 'Нет читерства с тегами <header>, <footer>, <aside>');
  add('Новые проверки', 'Количество запросов страницы — до 50, либо оптимизировано максимально близко к этому значению');
  add('Новые проверки', 'Макрос {{aio:macros:currency_nowrap}} подключен, сумма и валюта отображаются на одной строке');
  add('Новые проверки', 'Во всех <a> отсутствует target="_blank"');
  add('Новые проверки', 'Каждый абзац находится в отдельном теге <p>, без двойных <br>');
  add('Новые проверки', 'iframe и noscript удалены из разметки');
  add('Новые проверки', 'Серые поля у документа, и у чеков в слайдере, лупа в слайдере и скринах в комментариях, лупа отцентрована');
  add('Новые проверки', 'Язык соответствует гео во всех частях текста, интерфейс комментариев на языке гео');
  add('Новые проверки', 'Стрелка в слайдере не выделяется после отжатия, нет синих полос');
  add('Новые проверки', 'Корректное отображение при увеличении, картинки не находящиеся в одном слайдере не пролистываются');

  add('Критически важно!', 'Макрос {{aio:macros:new_instruction_to_reg}} подключен корректно');
  add('Критически важно!', 'Кастомизация макроса {{aio:macros:new_instruction_to_reg}} выполнена корректно');
  add('Критически важно!', 'Используется сплит-кей lp_content_var_custom_1, отсутствует lp_mvt_content_var');
  add('Критически важно!', 'Использован новый формат динамических комментариев');
  add('Критически важно!', 'В коде присутствует атрибут data-time-function');
}

function seedOfferItems(tplId) {
  const insertItem = db.prepare('INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)');
  let n = 1;
  const add = (cat, text) => insertItem.run(tplId, cat, text, n++);

  add('Общее', 'Страница открывается без ошибок');
  add('Общее', 'Нет ошибок в консоли браузера');
  add('Общее', 'Адаптивная верстка на мобильном');
  add('Форма', 'Форма заказа отображается корректно');
  add('Форма', 'Все поля формы работают');
  add('Форма', 'Валидация обязательных полей работает');
  add('Форма', 'Кнопка отправки формы активна');
  add('Форма', 'Страница «Спасибо» открывается после отправки');
  add('Контент', 'Номер телефона кликабельный на мобильном');
  add('Контент', 'Текст читаем, нет явных опечаток');
}

function seedWhiteItems(tplId) {
  const insertItem = db.prepare('INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)');
  let n = 1;
  const add = (cat, text) => insertItem.run(tplId, cat, text, n++);

  add('Контент', 'Страница имеет реальный тематический контент');
  add('Контент', 'Нет редиректа на оффер при прямом переходе');
  add('SEO', 'Meta title заполнен и релевантен теме');
  add('SEO', 'Meta description заполнен');
  add('Техническое', 'Нет ошибок в консоли');
  add('Техническое', 'Страница корректно отображается на мобильном');
  add('Техническое', 'Контент выглядит естественно, нет спам-текста');
}
