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
// NORMAL is the documented-safe pairing with WAL (SQLite fsyncs at
// checkpoints instead of every commit) — durable against an app crash,
// only risking the last commit or two on an actual OS crash/power loss,
// which this app already has on-volume backups against. Default FULL
// fsyncs every single transaction, which just isn't necessary here.
db.pragma('synchronous = NORMAL');
// Explicit rather than relied-upon: this better-sqlite3 build already
// defaults PRAGMA foreign_keys to ON (see the users-table rebuild comment
// in initDb() below, and role-migration.test.js which asserts this), but
// that default is undocumented build behavior, not a guarantee — stating
// it explicitly here means FK enforcement no longer depends on that. Set
// before any table creation/migration runs, so every CREATE TABLE/ALTER/
// INSERT below always sees enforcement in its final, intended state.
db.pragma('foreign_keys = ON');

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

    -- Single-row scratch table /api/health writes to on every check — a
    -- read-only probe (SELECT 1) can't catch a read-only volume/disk-full
    -- condition the way a real write can; this is exactly the failure mode
    -- that once let a broken deploy look "healthy" while the app crash-
    -- looped on every actual write. Never grows: always the same row (id=1).
    CREATE TABLE IF NOT EXISTS _health_check (
      id INTEGER PRIMARY KEY,
      checked_at DATETIME
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
      avatar_id TEXT DEFAULT 'frog1',
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
      order_num INTEGER DEFAULT 0,
      mvt_updated_at TEXT DEFAULT NULL
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

    -- Powers the "NEW" badge on the courses page: a course only shows NEW
    -- while it's recently created AND this user hasn't opened it yet — as
    -- soon as they view it once, it drops off for them (but still shows
    -- NEW for teammates who haven't looked yet).
    CREATE TABLE IF NOT EXISTS custom_course_views (
      user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, course_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (course_id) REFERENCES custom_courses(id)
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

  // Migrations: add columns to existing tables safely. Guarded by an
  // explicit column check rather than a blanket try/catch — a bare catch{}
  // here would hide any real migration failure (not just "column already
  // exists"), letting the server boot on a silently broken schema instead
  // of failing loudly the way every other migration below does.
  const userProfileCols = db.prepare("PRAGMA table_info(user_profiles)").all().map(c => c.name);
  if (!userProfileCols.includes('bug_coins')) {
    db.exec('ALTER TABLE user_profiles ADD COLUMN bug_coins INTEGER DEFAULT 0');
  }
  if (!userProfileCols.includes('purchased_items')) {
    db.exec('ALTER TABLE user_profiles ADD COLUMN purchased_items TEXT DEFAULT \'[]\'');
  }
  // Optional, self-reported — purely so activity text and generated
  // messages can pick a grammatically correct Russian verb ending
  // ("сделал"/"сделала") instead of the "(-а)"-suffix hack used when this
  // is unset. NULL means "not specified"; nothing degrades if it stays
  // that way, text just falls back to the old slash-notation form.
  if (!userProfileCols.includes('gender')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN gender TEXT DEFAULT NULL");
  }

  // Presence: working hours, leave, and per-user calendar info. Powers the
  // "работают сейчас" team block and the news feed's birthday/vacation
  // items. All additive/nullable — accounts that never touch this see no
  // change in behavior.
  if (!userProfileCols.includes('birthday')) {
    db.exec(`
      ALTER TABLE user_profiles ADD COLUMN birthday TEXT DEFAULT NULL;
      ALTER TABLE user_profiles ADD COLUMN timezone TEXT DEFAULT 'Europe/Moscow';
      ALTER TABLE user_profiles ADD COLUMN work_start TEXT DEFAULT NULL;
      ALTER TABLE user_profiles ADD COLUMN work_end TEXT DEFAULT NULL;
      ALTER TABLE user_profiles ADD COLUMN work_days TEXT DEFAULT '1,2,3,4,5';
      ALTER TABLE user_profiles ADD COLUMN status TEXT DEFAULT 'active';
    `);
  }

  // A real table rather than a status flag: lets a lead schedule a
  // vacation ahead of time (not just flip a flag on the day it starts), and
  // lets the news feed detect "starts/ends today" by comparing dates
  // instead of relying on someone remembering to toggle a flag by hand.
  // user_profiles.status only ever holds 'active'/'remote'/'other' —
  // anything with a date range (vacation/sick/day off) lives here instead.
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'vacation',
      start_date TEXT NOT NULL,
      end_date TEXT,
      note TEXT DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // Team news feed — deliberately separate from activity_log. That table's
  // lecture_id target column and formatActivityAction parser are built
  // specifically around lecture actions (login/password/badge/etc) and
  // stay the private per-user audit trail; team_events is the public
  // "what's new" feed. Narrow on purpose (three actual event types) —
  // birthdays/leave starting-or-ending are computed live at read time from
  // user_profiles.birthday / leave_periods instead of stored here (see
  // GET /api/team/news), since there's no cron job in this codebase to
  // stamp them at the right moment.
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      ref_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Course deadlines (Жукадеми / custom_courses only — the older seeded
  // lecture track has no per-course structure to hang a deadline off).
  const customCourseColsForDeadline = db.prepare("PRAGMA table_info(custom_courses)").all().map(c => c.name);
  if (!customCourseColsForDeadline.includes('deadline_at')) {
    db.exec("ALTER TABLE custom_courses ADD COLUMN deadline_at DATETIME DEFAULT NULL");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_deadline_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      deadline_at DATETIME NOT NULL,
      reason TEXT DEFAULT '',
      set_by INTEGER NOT NULL,
      set_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES custom_courses(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (set_by) REFERENCES users(id),
      UNIQUE(course_id, user_id)
    );
  `);

  // Video links on lectures — a pasted URL (YouTube/Drive/VK/Яндекс.Диск),
  // never a raw file upload: Railway's disk is ephemeral and would lose an
  // uploaded video on the next deploy.
  const lectureColsForVideo = db.prepare("PRAGMA table_info(lectures)").all().map(c => c.name);
  if (!lectureColsForVideo.includes('video_url')) {
    db.exec("ALTER TABLE lectures ADD COLUMN video_url TEXT DEFAULT NULL");
  }

  // Suggestion / ideas board. The real author (user_id) is always stored —
  // is_anonymous only controls what OTHER testers see (GET /api/suggestions
  // nulls the author out for them); leads/admins always see the real name
  // plus the flag itself, so they know who to credit without accidentally
  // outing an anonymous poster to the rest of the team.
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'idea',
      text TEXT NOT NULL,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS suggestion_likes (
      suggestion_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (suggestion_id, user_id),
      FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Lead-only private organization for the suggestion board — e.g.
  // "Доработка сервисов", "По срочности". Deliberately never exposed to
  // testers (GET /api/suggestions only selects folder_id in the lead
  // branch of that query) — this is the lead's own sorting, not a public
  // taxonomy, which is why it's a separate lead-managed table rather than
  // author-settable tags.
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
  const suggestionCols = db.prepare("PRAGMA table_info(suggestions)").all().map(c => c.name);
  if (!suggestionCols.includes('folder_id')) {
    db.exec("ALTER TABLE suggestions ADD COLUMN folder_id INTEGER DEFAULT NULL REFERENCES suggestion_folders(id)");
  }

  // 'idea' and 'suggestion' were merged into one type (see suggestions.js) —
  // a plain data fix, not a schema change, so it's safe to just re-run
  // every boot rather than gate it behind a migration guard.
  db.exec("UPDATE suggestions SET type = 'idea' WHERE type = 'suggestion'");

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

  // Forces a change-password redirect on next login after an admin/lead
  // resets someone's password to a temporary one — set on reset, cleared
  // once the user picks their own.
  if (!userCols.includes('must_change_password')) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0");
  }

  // Deactivation is an archive, not a delete — every table with a user_id
  // FK (test_results, checklist_submissions, activity_log, ...) stays
  // completely intact; archiving only blocks login and hides the account
  // from active-team views. NULL = active (the common case, so existing
  // rows need no backfill).
  if (!userCols.includes('archived_at')) {
    db.exec("ALTER TABLE users ADD COLUMN archived_at DATETIME");
  }

  // Free-text characteristics a lead keeps about a tester — never shown to
  // the tester themselves (only returned from lead/admin-only routes), a
  // private working note rather than a profile field.
  if (!userCols.includes('lead_note')) {
    db.exec("ALTER TABLE users ADD COLUMN lead_note TEXT DEFAULT ''");
  }

  // Per-attempt quiz metadata: time spent per question and a soft
  // tab-switch count, both surfaced to leads/admins as review signals (not
  // auto-block — see the submit-test route for why). JSON blob rather than
  // separate columns since its shape is purely for display, never queried.
  const testResultCols = db.prepare("PRAGMA table_info(test_results)").all().map(c => c.name);
  if (!testResultCols.includes('meta')) {
    db.exec("ALTER TABLE test_results ADD COLUMN meta TEXT DEFAULT '{}'");
  }

  // Knowledge base (Багодельня) — bug-report examples and glossary terms,
  // previously hardcoded in the client with no way to add/edit/delete.
  // created_by is nullable so a system-seeded row (the original hardcoded
  // content, migrated in on first boot below) isn't tied to any one user.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_examples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL DEFAULT 'Общее',
      tag_color TEXT NOT NULL DEFAULT '#7F77DD',
      problem TEXT NOT NULL,
      bad_text TEXT NOT NULL,
      good_text TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS glossary_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Lets a lead hand a specific tester a narrow, named capability
    -- (e.g. editing the knowledge base) without promoting them to 'lead' —
    -- a full role change grants everything requireRole('lead') gates,
    -- which is far more than "can add a glossary term." expires_at is
    -- nullable — NULL means the grant doesn't expire on its own (still
    -- revocable any time by a lead).
    CREATE TABLE IF NOT EXISTS granted_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      permission TEXT NOT NULL,
      granted_by INTEGER NOT NULL,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (granted_by) REFERENCES users(id)
    );

    -- "Forgot password" flow for accounts with no session at all. Only a
    -- hash is stored, same rationale as refresh_tokens — single-use
    -- (deleted on redemption), short-lived.
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Lead/admin-editable articles replacing the Notion docs — a plain
    -- safe-markdown-subset body (see GuidesPage's renderer), not raw HTML,
    -- so there's no dangerouslySetInnerHTML/XSS surface to worry about.
    CREATE TABLE IF NOT EXISTS guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Общее',
      content TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Admin-curated canonical list of checklist task types — previously
    -- this was just "whatever distinct values happen to exist in
    -- checklist_submissions.task_type", with no way to define the set up
    -- front or clean up near-duplicate free-typed variants.
    CREATE TABLE IF NOT EXISTS task_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- A lead-awarded bonus/recognition log, separate from the generic
    -- activity_log so "who got a bonus, how much, why, when" can be
    -- reported on directly without parsing free-text action strings.
    -- Deliberately just bug_coins + a note, not real money — see
    -- app.js's award-bonus route comment for why.
    CREATE TABLE IF NOT EXISTS bonus_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      awarded_by INTEGER NOT NULL,
      awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (awarded_by) REFERENCES users(id)
    );

    -- Automatic, lead/admin-only-visible score — NEVER exposed to the
    -- tester it's about (see /api/me/premium-points, which deliberately
    -- only ever reads bonus_awards, not this table). Awarded by the server
    -- itself (submit-test / checklist submit routes) when a specific,
    -- anti-cheat-checked quality/speed bar is cleared — see those routes'
    -- comments for the exact rules. This is what powers a lead's "who's
    -- quietly excellent" leaderboard, independent of anything a tester
    -- could see and try to game directly.
    CREATE TABLE IF NOT EXISTS internal_score_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // premium_points: the visible, "redeemable later" bonus balance a lead
  // awards via /api/lead/award-bonus — deliberately separate from bug_coins
  // (the cosmetic shop currency test/quiz completion already earns), since
  // the two now mean different things: bug_coins buys profile cosmetics,
  // premium_points is the ledger meant to eventually convert to something
  // real-world (e.g. an отгул) — mixing them would make that conversion
  // ambiguous ("how many of my coins are real vs. just shop currency?").
  const profileCols = db.prepare("PRAGMA table_info(user_profiles)").all().map(c => c.name);
  if (!profileCols.includes('premium_points')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN premium_points INTEGER DEFAULT 0");
  }

  // Soft-delete (trash/recycle bin) for the content types most likely to
  // suffer an "oops, deleted the wrong one" — see /api/admin/trash. A NULL
  // deleted_at is the live row; every list/read route filters it out,
  // every DELETE route sets it instead of removing the row, and a purge
  // action (admin-only) does the real, permanent delete. Placed here,
  // after all four tables are guaranteed to exist (bug_examples/
  // glossary_terms/guides are created just above; custom_courses earlier).
  for (const table of ['bug_examples', 'glossary_terms', 'guides', 'custom_courses']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes('deleted_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at DATETIME`);
    }
  }

  // Seed the knowledge base once with the content that used to be
  // hardcoded, so existing users don't see it disappear when this becomes
  // DB-backed. Only runs while both tables are still empty.
  const bugExampleCount = db.prepare('SELECT COUNT(*) as c FROM bug_examples').get().c;
  if (bugExampleCount === 0) {
    db.prepare(`
      INSERT INTO bug_examples (tag, tag_color, problem, bad_text, good_text, created_by)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(
      'Визуал', '#7F77DD', 'Неверный отступ в секции',
      '"Отступ слишком большой" — нет конкретики: какой элемент, в какой секции, на каком устройстве, насколько большой. Разработчик не знает что исправлять.',
      'padding-top секции .features на 20px больше макета — десктоп 1920px.\n' +
      'Где: секция .features, десктоп (1920×1080, Chrome 124, Windows).\n' +
      'Воспроизведение: открыть страницу → DevTools → Elements → найти .features → проверить padding-top.\n' +
      'Что: padding-top: 80px, по макету Figma должно быть 60px — лишние 20px сверху.\n' +
      'Ожидалось: .features { padding-top: 60px } согласно Figma-макету.\n' +
      'Пункт: Визуал → Отступы соответствуют макету.'
    );
  }
  const glossaryCount = db.prepare('SELECT COUNT(*) as c FROM glossary_terms').get().c;
  if (glossaryCount === 0) {
    const seedGlossary = db.prepare('INSERT INTO glossary_terms (term, definition, created_by) VALUES (?, ?, NULL)');
    for (const [term, def] of [
      ['DevTools', 'Инструменты разработчика в браузере для отладки'],
      ['Bug', 'Дефект в программном обеспечении — отклонение от ожидаемого поведения'],
      ['Viewport', 'Видимая область экрана — размер окна браузера'],
      ['DOM', 'Document Object Model — структура HTML-документа в виде дерева'],
      ['Console', 'Консоль браузера — показывает ошибки JS и логи'],
    ]) {
      seedGlossary.run(term, def);
    }
  }

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
        order_num INTEGER DEFAULT 0,
        mvt_updated_at TEXT DEFAULT NULL
      );

      CREATE TABLE checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL,
        category TEXT DEFAULT '',
        text TEXT NOT NULL,
        order_num INTEGER DEFAULT 0,
        in_mvt INTEGER DEFAULT 1,
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
        note TEXT DEFAULT '',
        FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id),
        FOREIGN KEY (item_id) REFERENCES checklist_items(id)
      );
    `);
    // note: checklist_item_results.note was already listed above — this
    // CREATE TABLE block already has every column the migration path below
    // would otherwise backfill, so a genuinely fresh install (which always
    // takes this branch, never the else/ALTER migration path below, since
    // a brand-new checklist_items table never has a 'category' column yet)
    // doesn't end up missing columns that only "table already existed"
    // upgrades would get.
    seedChecklistTemplates();
  } else {
    // Ensure submissions has new columns (safe migration — the column-check
    // guard is what makes this safe to re-run, not a try/catch swallowing
    // whatever error comes back; a bare catch{} here would hide a genuine
    // migration failure instead of failing loudly, same reasoning as the
    // user_profiles migration above).
    const subCols = db.prepare("PRAGMA table_info(checklist_submissions)").all().map(c => c.name);
    if (!subCols.includes('content_author')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN content_author TEXT DEFAULT ''");
    if (!subCols.includes('verska_author')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN verska_author TEXT DEFAULT ''");
    if (!subCols.includes('task_type')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN task_type TEXT DEFAULT ''");
    if (!subCols.includes('check_date')) db.exec("ALTER TABLE checklist_submissions ADD COLUMN check_date TEXT DEFAULT ''");

    // Migration: add in_mvt column (1 = included in MVT mode, 0 = full only)
    if (!checklistItemCols.includes('in_mvt')) db.exec('ALTER TABLE checklist_items ADD COLUMN in_mvt INTEGER DEFAULT 1');

    // Migration: optimistic-locking stamp for the MVT editor — without it,
    // two leads opening the same template's MVT editor at once silently
    // lose whichever save happened first (last write wins on the whole
    // items array). The PATCH route now requires the caller to echo back
    // the stamp it loaded and 409s if it's stale.
    const checklistTemplateCols = db.prepare("PRAGMA table_info(checklist_templates)").all().map(c => c.name);
    if (!checklistTemplateCols.includes('mvt_updated_at')) db.exec('ALTER TABLE checklist_templates ADD COLUMN mvt_updated_at TEXT DEFAULT NULL');

    // Migration: optional free-text note per failed item — lets a tester
    // describe what actually went wrong instead of just a bare fail flag,
    // so reporting can show more than "this item failed N times".
    const resultCols = db.prepare("PRAGMA table_info(checklist_item_results)").all().map(c => c.name);
    if (!resultCols.includes('note')) db.exec("ALTER TABLE checklist_item_results ADD COLUMN note TEXT DEFAULT ''");

    // Check if preland template has full items (75 items) — if still old (9 items), reseed.
    // Deleting checklist_items outright used to be able to fail with a
    // FOREIGN KEY constraint error (foreign_keys is ON — see the users
    // rebuild comment above) if any real submission had already recorded a
    // checklist_item_results row against one of the old items, e.g. after
    // restoring an old backup that predates this reseed. Clearing those
    // results first (they belong to the stale 9-item version anyway — no
    // longer meaningful once the items they reference are replaced) makes
    // this safe regardless of what data exists.
    const prelandTpl = db.prepare("SELECT id FROM checklist_templates WHERE task_type = 'prelending'").get();
    if (prelandTpl) {
      const itemCount = db.prepare('SELECT COUNT(*) as c FROM checklist_items WHERE template_id = ?').get(prelandTpl.id);
      if (itemCount.c < 20) {
        db.transaction(() => {
          db.prepare(`
            DELETE FROM checklist_item_results WHERE item_id IN (
              SELECT id FROM checklist_items WHERE template_id = ?
            )
          `).run(prelandTpl.id);
          db.prepare('DELETE FROM checklist_items WHERE template_id = ?').run(prelandTpl.id);
          seedPrelandItems(prelandTpl.id);
        })();
      }
    }
  }

  // One-time: seed the curated task_types list from whatever distinct
  // values are already in use, so existing free-typed types don't vanish
  // from the dropdown the moment this becomes an admin-curated list
  // instead of "derived from history". Only runs while the table is empty.
  const taskTypeCount = db.prepare('SELECT COUNT(*) as c FROM task_types').get().c;
  if (taskTypeCount === 0) {
    const existingTypes = new Set([
      ...db.prepare("SELECT DISTINCT task_type FROM checklist_submissions WHERE task_type != ''").all().map(r => r.task_type),
      ...db.prepare("SELECT DISTINCT task_type FROM checklist_templates WHERE task_type != ''").all().map(r => r.task_type),
    ]);
    const insTaskType = db.prepare('INSERT OR IGNORE INTO task_types (name) VALUES (?)');
    for (const name of existingTypes) insTaskType.run(name);
  }

  // Migration: course/guide proposals — lets a plain tester submit a full
  // course or guide that only goes live once a lead approves it (see
  // routes/courses.js POST /api/custom-courses and routes/knowledge.js
  // POST /api/guides). NULL means "not a proposal" (the normal case for
  // everything created before this and for anything a lead/admin authors
  // directly); 'pending' while awaiting review; 'approved'/'rejected' are
  // kept as a permanent record even after is_published flips or the row
  // gets soft-deleted, so "how many courses has this person proposed" can
  // still be counted later regardless of outcome.
  const customCoursesCols = db.prepare("PRAGMA table_info(custom_courses)").all().map(c => c.name);
  if (!customCoursesCols.includes('proposal_status')) db.exec('ALTER TABLE custom_courses ADD COLUMN proposal_status TEXT DEFAULT NULL');

  // Marks a course as the (or one of the) new-hire onboarding track — a
  // permanent, always-in-the-catalog reference course rather than a
  // topic-of-the-week one. Settable only by a lead/admin (see courses.js);
  // a proposing tester's submission ignores it. Default 0 so every existing
  // course is unaffected.
  if (!customCoursesCols.includes('is_onboarding')) db.exec('ALTER TABLE custom_courses ADD COLUMN is_onboarding INTEGER DEFAULT 0');

  // Course sections — lead-managed groups for organizing the catalog
  // (e.g. "Основы", "Продвинутое"). Unlike suggestion_folders (private to
  // the lead), these ARE shown to every tester — the catalog itself is
  // grouped by section, not just a lead-side triage view. Deleting a
  // section un-files its courses (section_id -> NULL) rather than deleting
  // them, same semantics as suggestion_folders.
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
  if (!customCoursesCols.includes('section_id')) {
    db.exec('ALTER TABLE custom_courses ADD COLUMN section_id INTEGER DEFAULT NULL REFERENCES course_sections(id)');
  }

  // Guides never had a draft/publish concept before (creation = publishing,
  // always by a lead) — is_published defaults to 1 so every existing guide
  // stays visible exactly as before. A tester-submitted proposal is
  // inserted with is_published=0 instead.
  const guidesCols = db.prepare("PRAGMA table_info(guides)").all().map(c => c.name);
  if (!guidesCols.includes('is_published')) db.exec('ALTER TABLE guides ADD COLUMN is_published INTEGER DEFAULT 1');
  if (!guidesCols.includes('proposal_status')) db.exec('ALTER TABLE guides ADD COLUMN proposal_status TEXT DEFAULT NULL');

  // A single emoji character shown next to the guide's title in the list
  // (picked from a curated set or typed in freely) — purely decorative,
  // no validation on the string's shape/length beyond a generous cap.
  if (!guidesCols.includes('icon')) db.exec('ALTER TABLE guides ADD COLUMN icon TEXT DEFAULT NULL');

  // Migration: bug-example and glossary proposals — same shape as the
  // course/guide proposal flow above. A plain tester can submit a bug
  // example or a glossary term; it lands unpublished + pending until a
  // lead approves it via the new PATCH .../approve routes (see
  // routes/knowledge.js). Both tables predate this and were always
  // lead/admin-authored, so is_published defaults to 1 — every existing
  // row stays visible exactly as before.
  const bugExamplesCols = db.prepare("PRAGMA table_info(bug_examples)").all().map(c => c.name);
  if (!bugExamplesCols.includes('is_published')) db.exec('ALTER TABLE bug_examples ADD COLUMN is_published INTEGER DEFAULT 1');
  if (!bugExamplesCols.includes('proposal_status')) db.exec('ALTER TABLE bug_examples ADD COLUMN proposal_status TEXT DEFAULT NULL');

  const glossaryCols = db.prepare("PRAGMA table_info(glossary_terms)").all().map(c => c.name);
  if (!glossaryCols.includes('is_published')) db.exec('ALTER TABLE glossary_terms ADD COLUMN is_published INTEGER DEFAULT 1');
  if (!glossaryCols.includes('proposal_status')) db.exec('ALTER TABLE glossary_terms ADD COLUMN proposal_status TEXT DEFAULT NULL');

  // Migration: questions on the suggestions board. A tester can post a
  // 'question' suggestion (same table, new type — see suggestions.js);
  // answer/answered_at/answered_by capture the lead's reply so an asker
  // (and everyone else browsing, since the board is shared) can see it
  // without a separate Q&A table or thread model.
  const suggestionsCols = db.prepare("PRAGMA table_info(suggestions)").all().map(c => c.name);
  if (!suggestionsCols.includes('answer')) db.exec('ALTER TABLE suggestions ADD COLUMN answer TEXT DEFAULT NULL');
  if (!suggestionsCols.includes('answered_at')) db.exec('ALTER TABLE suggestions ADD COLUMN answered_at DATETIME DEFAULT NULL');
  if (!suggestionsCols.includes('answered_by')) db.exec('ALTER TABLE suggestions ADD COLUMN answered_by INTEGER DEFAULT NULL REFERENCES users(id)');

  // Self-service contact-info change (Аккаунт tab of the profile editor) —
  // no phone column existed anywhere before. Nullable, no format
  // enforcement at the DB layer (validated lightly in routes/auth.js).
  const usersColsForPhone = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!usersColsForPhone.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT NULL');

  // Personal profile accent color — a small self-expression touch alongside
  // avatar/frame/background, used to tint the cabinet hero card border and
  // a few accent details on the owner's own profile (and on their public
  // profile, so teammates see the same color). Free to change any time, no
  // shop/unlock gate — unlike frames/backgrounds this isn't a scarce
  // cosmetic, just a personal preference.
  if (!profileCols.includes('profile_accent_color')) {
    db.exec("ALTER TABLE user_profiles ADD COLUMN profile_accent_color TEXT DEFAULT '#66FCF1'");
  }

  // Favorites — a real multi-item bookmark list for both seeded lectures
  // and lead-authored custom courses, replacing the old single
  // favorite_lecture_id slot (kept as-is for backward compatibility with
  // PublicProfilePage's "любимая лекция" showcase, which is a separate,
  // narrower feature). course_type discriminates which table course_id
  // points into — no single FK can span both, so integrity there is
  // app-level (routes/profile.js checks the row exists before inserting).
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_favorite_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course_type TEXT NOT NULL CHECK(course_type IN ('lecture', 'custom')),
      course_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, course_type, course_id)
    );
  `);

  // Course notes, moved server-side from the old localStorage-only drawer
  // (client/src/pages/CustomCourseLearningPage.tsx) so the profile's
  // "Заметки" tab can show one aggregated, cross-course list with working
  // jump-to-lesson links — impossible from localStorage alone since it was
  // never keyed by lesson id, only by (userId, courseId) with a bare
  // lessonTitle string. lesson_id is nullable with ON DELETE SET NULL
  // rather than a hard requirement: the course builder actually deletes
  // custom_lessons rows outright when a lesson is removed from the editor
  // (see routes/courses.js's module/lesson sync), so a note must be able to
  // survive its lesson disappearing — lesson_title is kept redundantly so
  // the note still reads sensibly even once lesson_id has gone NULL.
  // course_id has no ON DELETE action because courses are soft-deleted
  // (custom_courses.deleted_at), never actually removed by the app itself.
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_lesson_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      lesson_id INTEGER,
      lesson_title TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (course_id) REFERENCES custom_courses(id),
      FOREIGN KEY (lesson_id) REFERENCES custom_lessons(id) ON DELETE SET NULL
    );
  `);

  // A user's uploaded avatar, kept separate from user_profiles.custom_avatar
  // (which stays exactly what it always was: a private upload only its
  // owner can be seen wearing). This table exists so a *public* upload has
  // a stable id other users can reference as their own avatar_id
  // ('gallery:<id>') without duplicating the base64 image into every row
  // that picks it — same base64-in-DB trade-off as custom_avatar/guide
  // images elsewhere, just shared instead of per-owner.
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_avatars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Everything the mascot says, in one lead-editable list. These used to
    -- be three hardcoded arrays in the client (FrogCompanion's TIPS,
    -- FrogLoader's FROG_PHRASES, OnboardingTour's steps), which meant
    -- changing a single line of copy was a deploy. "kind" keeps them in one
    -- table because they're the same shape and the same editing screen:
    --   'tip'    — the unprompted advice bubble in the corner
    --   'loader' — the one-liner under the loading frog
    --   'tour'   — a first-run step; "target" names the element it points at
    -- "target" is only meaningful for 'tour' rows and is a key from the
    -- client's TOUR_TARGETS map, not a raw CSS selector: a selector typed
    -- into a text field is a broken tour step nobody notices, so the editor
    -- offers the known list instead. "role" narrows a row to one audience
    -- ('tester'/'lead'), NULL means everyone.
    CREATE TABLE IF NOT EXISTS frog_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      title TEXT,
      target TEXT,
      role TEXT,
      order_num INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // One-time: seed frog_lines from the copy that used to be hardcoded in the
  // client, so making these editable doesn't start everyone off with a mute
  // mascot. Only runs while the table is empty — once a lead has edited the
  // list it is the source of truth and this never touches it again.
  //
  // The tour rows are a deliberate expansion of the five nav-link steps the
  // old OnboardingTour shipped with. Those covered Главная/Курсы/Багодельня/
  // Помощь/Аккаунт and nothing else, so a new tester finished onboarding
  // never having been told that Гайды, Идеи and Новости exist, that bug
  // coins are a thing, that the streak counts, or that the frog in the
  // corner is clickable. Each of those is a step now.
  if (db.prepare('SELECT COUNT(*) as c FROM frog_lines').get().c === 0) {
    const insLine = db.prepare(
      'INSERT INTO frog_lines (kind, text, title, target, role, order_num) VALUES (?, ?, ?, ?, ?, ?)'
    );
    let n = 0;
    const tip = text => insLine.run('tip', text, null, null, null, n++);
    const loader = text => insLine.run('loader', text, null, null, null, n++);
    // role: null = everyone, 'tester'/'lead'/'admin' = that audience only
    // (lead steps also show to admins, see routes/frogLines.js).
    const tour = (target, title, text, role = null) => insLine.run('tour', text, title, target, role, n++);

    tip('Совет: избранные курсы и лекции удобно смотреть на своей странице — там же и заметки к урокам.');
    tip('В Багодельне можно предложить свой пример бага — лид посмотрит и опубликует.');
    tip('Стрик считается по твоему дню, не по серверному времени — не переживай про полночь.');
    tip('Если что-то непонятно — нажми на меня, выберешь тему и я отвечу прямо тут.');
    tip('Можно загрузить свою аватарку и сделать её доступной всем в общей галерее.');
    tip('Идея или что-то бесит — пиши на доске предложений, лид правда читает.');
    tip('Пароль лучше сменить, если он временный — иначе будет всё время напоминать.');
    tip('Держишь стрик? Так и продолжай, я слежу 👀');
    tip('Пройденные курсы можно переслушать в любой момент — они никуда не денутся.');
    tip('За одобренный гайд или пример бага тоже капают баг-коины, не только за тесты.');
    tip('Тест можно пересдать сколько угодно раз — сохранится лучший результат.');

    loader('квак-квак, гружусь...');
    loader('разгоняюсь для прыжка...');
    loader('лягушка тоже не сразу допрыгала');
    loader('скоро... наверное...');
    loader('прыжок за прыжком');
    loader('главное — мягко приземлиться');
    loader('жизнь слишком коротка, чтобы не квакать');
    loader('ловлю последний баг языком...');
    loader('сижу на кувшинке, жду ответ сервера...');
    loader('надуваю щёки перед прыжком');
    loader('какой же я прыгучий...');
    loader('ща ща ща...');
    loader('быстреееееее');
    loader('не хочу чета прыгать');

    tour('nav-home', 'Главная', 'Отсюда всё начинается: сводка твоей активности и быстрые ссылки на то, чем занимаешься чаще всего.');
    tour('nav-courses', 'Курсы', 'Главное место. Лекции идут по порядку, следующая открывается после сданного теста. Завалил — пересдавай сколько угодно, сохранится лучший результат.', 'tester');
    tour('nav-courses', 'Курсы', 'Каталог курсов и кнопка «Создать курс». Сюда же падают курсы, которые предлагает команда, — их нужно одобрить, чтобы они опубликовались.', 'lead');
    tour('nav-team', 'Команда', 'Прогресс каждого по курсам, аналитика по лекциям, рейтинг и лента активности. Отсюда же начисляются премии и выдаются права на разделы.', 'lead');
    tour('nav-shop', 'Багодельня', 'Примеры багов «как плохо / как хорошо», словарь терминов и магазин. Баг-коины за тесты и курсы тратятся тут — на рамки, фоны и аватарки.');
    tour('nav-guides', 'Гайды', 'Материалы команды вместо документов в чужих папках. Свой гайд можно предложить — после проверки он опубликуется под твоим именем.');
    tour('nav-suggestions', 'Идеи', 'Доска предложений и жалоб. Можно завести своё, можно лайкнуть чужое. Это не ящик в никуда — лид читает.');
    tour('nav-news', 'Новости', 'Лента команды: кто что прошёл, опубликовал и получил. Удобно, чтобы не пропустить чужой новый гайд.');
    tour('nav-admin', 'Админка', 'Пользователи, роли и архив — только для администраторов.', 'admin');
    tour('nav-account', 'Твой профиль', 'Аватар (можно загрузить свой), рамка, фон, статус-цитата. Тут же карточки за сданные лекции, бейджи и стрик — дни подряд, в которые ты что-то делал.');
    tour('nav-help', 'Помощь', 'Если что-то забылось — здесь расписано, что тут вообще можно делать, и лежат ответы на частые вопросы. Открыто всегда.');
    tour('frog-companion', 'Ну и я', 'Живу в углу и иногда подсказываю сам. Наведись — покажу, зачем мне меч. Нажмёшь — откроется чат: выбираешь тему, я отвечаю. Не найдёшь свою — отправлю в «Помощь».');
  }

  // Backfill for databases seeded before the burger-menu step existed. On a
  // phone every nav-* step points at a link that is rendered but hidden, so
  // the client skips them all and onboarding was effectively desktop-only —
  // this is the one step a phone user can actually see. Guarded on the target
  // rather than on a version flag, so it inserts once and never again.
  const hasMenuStep = db.prepare(
    "SELECT 1 FROM frog_lines WHERE kind = 'tour' AND target = 'nav-menu'"
  ).get();
  if (!hasMenuStep) {
    // order_num 0 puts it first: on a phone it is the only step that
    // resolves, and on a desktop it skips instantly, so being first costs
    // nothing there.
    db.prepare(
      "INSERT INTO frog_lines (kind, text, title, target, role, order_num) VALUES ('tour', ?, ?, 'nav-menu', NULL, -1)"
    ).run(
      'Все разделы спрятаны сюда: курсы, Багодельня, гайды, идеи и помощь. Жми — и они откроются списком.',
      'Меню'
    );
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
    CREATE INDEX IF NOT EXISTS idx_checklist_submissions_task_type ON checklist_submissions(task_type);
    CREATE INDEX IF NOT EXISTS idx_checklist_item_results_submission_id ON checklist_item_results(submission_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_item_results_item_id ON checklist_item_results(item_id);
    -- Fail-rate reporting queries filter checklist_item_results by status
    -- (e.g. counting 'fail' rows per item/template) without joining on
    -- submission_id/item_id first, so those two indexes alone don't help.
    CREATE INDEX IF NOT EXISTS idx_checklist_item_results_status ON checklist_item_results(status);
    CREATE INDEX IF NOT EXISTS idx_course_time_tracking_user_id ON course_time_tracking(user_id);
    -- routes/courses.js queries course_time_tracking by course_id directly
    -- (completed-count aggregation, finished-users list, progress lookup) —
    -- no FK exists on this column to have implicitly indexed it.
    CREATE INDEX IF NOT EXISTS idx_course_time_tracking_course_id ON course_time_tracking(course_id);
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
    CREATE INDEX IF NOT EXISTS idx_granted_permissions_user_id ON granted_permissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_course_views_course_id ON custom_course_views(course_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_guides_category ON guides(category);
    CREATE INDEX IF NOT EXISTS idx_bonus_awards_user_id ON bonus_awards(user_id);
    CREATE INDEX IF NOT EXISTS idx_internal_score_events_user_id ON internal_score_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_leave_periods_user_id ON leave_periods(user_id);
    CREATE INDEX IF NOT EXISTS idx_leave_periods_start_date ON leave_periods(start_date);
    CREATE INDEX IF NOT EXISTS idx_team_events_created_at ON team_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_course_deadline_overrides_course_id ON course_deadline_overrides(course_id);
    CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at);
    CREATE INDEX IF NOT EXISTS idx_suggestion_likes_suggestion_id ON suggestion_likes(suggestion_id);
    CREATE INDEX IF NOT EXISTS idx_user_favorite_courses_user_id ON user_favorite_courses(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_lesson_notes_user_id ON custom_lesson_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_lesson_notes_course_id ON custom_lesson_notes(course_id);
    -- Covers the (role, archived_at) filter combination repeated across
    -- 8+ route call sites (e.g. "active testers", "active leads" listings)
    -- so those lookups don't fall back to a full table scan of users.
    CREATE INDEX IF NOT EXISTS idx_users_role_archived_at ON users(role, archived_at);
  `);

  seedOnboardingCourseSkeleton();
}

// One-time: creates an empty, unpublished draft "Вводный курс" (new-hire
// onboarding) the first time a lead/admin account exists and no onboarding
// course has been created yet — gives the lead a ready-made module/lesson
// skeleton (titles only, no content) to fill in via the normal Course
// Builder rather than starting from a blank page. Runs on every boot but is
// a no-op the moment either guard fails, so it never re-creates or touches
// a course a lead has since renamed/restructured/deleted.
function seedOnboardingCourseSkeleton() {
  const alreadyExists = db.prepare('SELECT 1 FROM custom_courses WHERE is_onboarding = 1').get();
  if (alreadyExists) return;
  // custom_courses.created_by is NOT NULL — on a completely fresh install
  // (or a test DB before its own fixtures run) there may be no lead/admin
  // yet to attribute this to. Skip for now; re-checked on every future boot.
  const author = db.prepare("SELECT id FROM users WHERE role IN ('lead','admin') ORDER BY id LIMIT 1").get();
  if (!author) return;

  // Module 4's lessons are seeded from today's real checklist templates
  // (Прелендинг/Оффер/Вайт) rather than hand-typed — accurate on day one,
  // but a one-time title seed, not a live join: a lead can freely
  // rename/add/remove lessons afterward with no ongoing coupling to
  // checklist_templates (see the plan's reasoning for not wiring this to
  // task_types as a live foreign key).
  const taskTypeLessons = db.prepare('SELECT name FROM checklist_templates ORDER BY id').all().map(t => t.name);

  db.transaction(() => {
    const courseId = db.prepare(`
      INSERT INTO custom_courses (title, description, tag, color, requirements, is_published, created_by, is_onboarding)
      VALUES (?, ?, ?, ?, ?, 0, ?, 1)
    `).run(
      'Вводный курс',
      'Что стоит знать новому человеку в команде: с какими сервисами работаем, к кому обращаться и какие бывают задачи.',
      'Custom', '#66FCF1', 'Для всех — можно проходить в любой момент',
      author.id
    ).lastInsertRowid;

    const insModule = db.prepare('INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, ?)');
    const insLesson = db.prepare("INSERT INTO custom_lessons (module_id, title, type, content, order_num) VALUES (?, ?, 'lesson', '', ?)");
    const setPrereq = db.prepare("UPDATE custom_lessons SET prerequisite_type = 'mandatory', prerequisite_lesson_id = ? WHERE id = ?");

    const outline = [
      { module: 'Добро пожаловать', lessons: ['Коротко о команде'] },
      { module: 'Инструменты и сервисы', lessons: ['Чем мы пользуемся'] },
      { module: 'Кто за что отвечает', lessons: ['Контакты и эскалация'] },
      { module: 'Какие задачи мы выполняем', lessons: taskTypeLessons.length ? taskTypeLessons : ['Виды задач'] },
    ];

    const lessonIds = [];
    outline.forEach((mod, mi) => {
      const moduleId = insModule.run(courseId, mod.module, mi).lastInsertRowid;
      mod.lessons.forEach((title, li) => {
        lessonIds.push(insLesson.run(moduleId, title, li).lastInsertRowid);
      });
    });

    // Strictly sequential across the whole course, same shape as
    // backfillSequentialPrerequisites below — first lesson open, every
    // later one gated on the immediately preceding one.
    for (let i = 1; i < lessonIds.length; i++) {
      setPrereq.run(lessonIds[i - 1], lessonIds[i]);
    }
  })();
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
