// Seed script — creates a fresh DB with the original core tables (users,
// lectures, questions, results, surveys, activity log, profiles/cards/
// badges) + demo data for them. Does NOT import schema.js (avoids ESM
// module-cache / open-handle conflicts — schema.js's own `db` would still
// hold an open handle on the old file when this script tries to delete it
// above, which fails hard on Windows' stricter file locking).
//
// Deliberately incomplete on its own: every table added since this file
// was last touched (checklists v2, custom courses, guides, granted
// permissions, presence/leave, suggestions, team news, bonus awards, ...)
// is intentionally NOT recreated here. That's not a bug — `initDb()` in
// schema.js runs automatically on every server start (see src/index.js)
// and creates/migrates all of those via its own guarded `CREATE TABLE IF
// NOT EXISTS`/`ALTER TABLE` statements, so `npm run seed && npm run dev`
// still ends up with a fully-migrated database. What's genuinely missing
// is DEMO DATA for those newer features — a fresh seed gives you working
// core lectures/quizzes/profiles, but empty checklists/courses/guides/
// suggestions until you create some through the UI.
import Database from 'better-sqlite3';
import bcryptjs from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'learning_hub.db');

// ── Clean old DB + WAL files ─────────────────────────────────────────────────
for (const suffix of ['', '-shm', '-wal']) {
  const f = dbPath + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// ── Create fresh connection ──────────────────────────────────────────────────
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
console.log('DB path:', dbPath);

// ── Create schema ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar_initials TEXT,
    telegram_id TEXT,
    telegram_username TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL;

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
    html_structure INTEGER NOT NULL,
    css_reading INTEGER NOT NULL,
    devtools INTEGER NOT NULL,
    console_errors INTEGER NOT NULL,
    bug_report_quality INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS final_survey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    html_structure INTEGER NOT NULL,
    css_reading INTEGER NOT NULL,
    devtools INTEGER NOT NULL,
    console_errors INTEGER NOT NULL,
    bug_report_quality INTEGER NOT NULL,
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
    avatar_id TEXT DEFAULT 'frog2',   -- must be a free avatar: see src/entitlements.js
    avatar_frame TEXT DEFAULT 'default',
    profile_bg TEXT DEFAULT 'default',
    showcase_badges TEXT DEFAULT '[]',
    favorite_lecture_id INTEGER,
    is_public INTEGER DEFAULT 1,
    custom_avatar TEXT,
    bug_coins INTEGER DEFAULT 0,
    purchased_items TEXT DEFAULT '[]',
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
`);

// ── Users ────────────────────────────────────────────────────────────────────
const adminHash  = bcryptjs.hashSync('admin123', 10);
const leadHash   = bcryptjs.hashSync('lead123', 10);
const testerHash = bcryptjs.hashSync('test123', 10);

const userIns = db.prepare(`INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)`);
// Bootstrap admin — the only account that can grant roles to anyone else.
// Self-registration always starts at 'tester'; every other role (including
// this one, for any *further* admins) is granted from here on out via
// PATCH /api/admin/users/:id/role, never by signing up as one.
const adminId = userIns.run('admin@qa.com', adminHash,  'System Admin',    'admin',  'SA').lastInsertRowid;
const leadId  = userIns.run('lead@qa.com',  leadHash,   'Alex Lead',       'lead',   'AL').lastInsertRowid;
const nazarId = userIns.run('nazar@qa.com', testerHash, 'Nazariy Tester',  'tester', 'NT').lastInsertRowid;
const glebId  = userIns.run('gleb@qa.com',  testerHash, 'Gleb Glebov',     'tester', 'GG').lastInsertRowid;
const alenaId = userIns.run('alena@qa.com', testerHash, 'Alena Expert',    'tester', 'AE').lastInsertRowid;
const vasyaId = userIns.run('vasya@qa.com', testerHash, 'Vasya Novice',    'tester', 'VN').lastInsertRowid;

// ── Lectures ─────────────────────────────────────────────────────────────────
const lecIns = db.prepare(`INSERT INTO lectures (title, order_num, skill_area) VALUES (?, ?, ?)`);
const lectures = [
  { title: 'Основы HTML',                   skill: 'HTML structure'     },
  { title: 'Основы CSS',                    skill: 'CSS reading'        },
  { title: 'Основы DevTools',               skill: 'DevTools'           },
  { title: 'Консоль и ошибки',              skill: 'Console errors'     },
  { title: 'Адаптивная верстка',            skill: 'HTML structure'     },
  { title: 'Отладка CSS',                   skill: 'CSS reading'        },
  { title: 'Вкладка Network',               skill: 'DevTools'           },
  { title: 'JavaScript для QA',             skill: 'Console errors'     },
  { title: 'Описание дефектов',             skill: 'Bug report quality' },
  { title: 'Продвинутое тестирование',      skill: 'Bug report quality' },
];
const lectureIds = lectures.map((l, i) => lecIns.run(l.title, i + 1, l.skill).lastInsertRowid);

// ── Questions (5 per lecture) ─────────────────────────────────────────────────
const qIns = db.prepare(`
  INSERT INTO questions (lecture_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, order_num)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const questionsData = [
  // Lec 0: HTML
  [0,'What does <meta charset="UTF-8"> do?','Sets page language','Defines character encoding','Creates metadata','Links external resources','b','The charset meta tag specifies the character encoding for the HTML document.'],
  [0,'Which HTML5 element is best for a navigation bar?','<div>','<section>','<nav>','<header>','c','<nav> is semantically correct for navigation, improving accessibility and SEO.'],
  [0,'Purpose of the alt attribute in images?','Provides animation','Describes image for screen readers','Sets image size','Enables caching','b','alt provides alternative text for images, crucial for accessibility and SEO.'],
  [0,'How many heading levels does HTML support?','3','5','6','8','c','HTML supports 6 heading levels from <h1> to <h6>.'],
  [0,'What element should wrap form controls?','<section>','<form>','<fieldset>','<div>','b','<form> wraps form controls and is essential for form functionality.'],
  // Lec 1: CSS
  [1,'What does box-sizing control?','Box shadow','Width/height calculation','Element spacing','Border color','b','box-sizing determines whether padding/border are included in width/height calculations.'],
  [1,'Which selector has highest specificity?','Element selector','Class selector','ID selector','Universal selector','c','ID selectors have specificity 100, higher than class (10) or element (1).'],
  [1,'What does justify-content control?','Vertical alignment','Horizontal alignment','Width distribution','Cross-axis alignment','b','justify-content aligns flex items along the main (usually horizontal) axis.'],
  [1,'How do you center a block element?','text-align: center','margin: 0 auto','align-items: center','position: center','b','margin: 0 auto centers a block element with equal left/right margins.'],
  [1,'What is the CSS cascade?','Waterfall effect','Rules application order','Browser rendering','Animation timing','b','The cascade describes the order/priority in which CSS rules are applied.'],
  // Lec 2: DevTools
  [2,'Where do you inspect page elements?','Sources tab','Elements/Inspector tab','Console tab','Network tab','b','The Elements tab lets you inspect and modify page elements in real-time.'],
  [2,'What does the Network tab show?','JavaScript code','HTTP requests/responses','Memory usage','CSS errors','b','Network tab displays all HTTP requests, responses, headers, and timing.'],
  [2,'How to screenshot the viewport in DevTools?','F12','Cmd/Ctrl+Shift+P then screenshot','Right-click save','DevTools menu','b','Use command palette (Cmd/Ctrl+Shift+P) and search for "screenshot".'],
  [2,'What is the Sources tab used for?','View page sources','Debugging JavaScript','Testing performance','Checking security','b','Sources tab lets you set breakpoints and debug JavaScript line-by-line.'],
  [2,'What does Lighthouse audit?','HTML structure','Performance, accessibility, SEO','CSS validity','JavaScript errors','b','Lighthouse provides audits for performance, accessibility, SEO, best practices.'],
  // Lec 3: Console
  [3,'What does console.error() display?','Warning message','Error message in red','Debug info','Success message','b','console.error() displays error messages in red.'],
  [3,'How to access the global window object?','Type "window"','Type "global"','Type "this"','All of the above','d','All three access the global scope depending on context.'],
  [3,'What does console.table() do?','Prints date','Formats output as table','Clears console','Tests database','b','console.table() formats arrays/objects as a table for easier inspection.'],
  [3,'How to monitor variable changes?','console.watch()','monitorVariable()','Set breakpoint or use getters','Use console.log()','c','Set breakpoints in Sources or use object getters to monitor changes.'],
  [3,'What does "Uncaught" mean in console errors?','Warning only','Exception not handled by try-catch','Deprecated syntax','Browser incompatibility','b','"Uncaught" errors are unhandled exceptions, often causing page malfunction.'],
  // Lec 4: Responsive
  [4,'What meta tag is essential for responsive design?','<meta charset>','<meta viewport>','<meta author>','<meta expires>','b','<meta name="viewport"> enables responsive design.'],
  [4,'Typical CSS breakpoint for mobile?','max-width: 1200px','max-width: 768px','max-width: 480px','max-width: 600px','c','Mobile breakpoint is typically max-width: 480px for smartphones.'],
  [4,'What does "mobile-first" mean?','Design desktop first','Design mobile first then enhance','Only design for mobile','Use mobile frameworks','b','Mobile-first: design for small screens first, then add media queries for larger.'],
  [4,'How to test responsive design in DevTools?','Use Device Toolbar toggle','Change browser zoom','Resize window manually','Use Chrome plugin','a','Toggle Device Toolbar (Cmd/Ctrl+Shift+M) to simulate devices.'],
  [4,'Best unit for responsive typography?','px','em or rem','cm','pt','b','em/rem units scale relative to base size, making typography responsive.'],
  // Lec 5: CSS Debug
  [5,'How to find which CSS rule applies?','Search CSS files','Use DevTools Inspector','Check browser console','View page source','b','DevTools Inspector shows all CSS rules and their cascade order.'],
  [5,'What does strikethrough mean in DevTools styles?','Text is deleted','Rule is overridden','Rule has errors','Rule is deprecated','b','Strikethrough CSS means the rule is overridden by a more specific one.'],
  [5,'How to test CSS hover states in DevTools?','Actually hover','Right-click and toggle :hover','Edit CSS manually','Cannot test in DevTools','b','DevTools Elements panel shows a :hover toggle for testing pseudo-classes.'],
  [5,'What causes layout shift?','Slow CSS','Unspecified dimensions for images/ads','Too many divs','Complex selectors','b','Layout shifts occur when images/ads load without specified height/width.'],
  [5,'How to measure element dimensions in DevTools?','Right-click properties','Use Inspect Element','Use Measure tool','Check CSS','b','DevTools Inspector displays computed width, height, padding, margin, border.'],
  // Lec 6: Network
  [6,'What do HTTP 2xx codes indicate?','Error','Success','Redirect','Client error','b','2xx codes (200, 201, 204) indicate successful requests.'],
  [6,'What does 404 mean?','Server error','Not Found','Unauthorized','Too Many Requests','b','404 means the requested resource was not found on the server.'],
  [6,'How to throttle network in DevTools?','Network tab settings','Advanced options','DevTools throttling dropdown','All of above','d','Network throttling is available via DevTools Network/Performance settings.'],
  [6,'What does TTFB measure?','Time to fully bind','Time to first byte','Total transfer bytes','Time to finish bind','b','TTFB (Time to First Byte) measures latency before server starts responding.'],
  [6,'How to filter requests in Network tab?','Right-click filter','Use filter input field','Enable resource type icons','Search tab','b','Use the filter input to filter by resource type (xhr, img, doc, etc).'],
  // Lec 7: JS
  [7,'Difference between let and var?','No difference','let is block-scoped','var is faster','let is global','b','let is block-scoped; var is function-scoped. let is preferred in modern JS.'],
  [7,'What does Array.map() return?','undefined','New array with transformed elements','Modified original array','Single value','b','map() returns a new array with elements transformed by the callback.'],
  [7,'What is a Promise in JavaScript?','String','Variable','Object representing async operation','Loop statement','c','A Promise represents an asynchronous operation that may resolve or reject.'],
  [7,'What does async/await do?','Similar to promises','Makes async code look synchronous','Speeds up code','Handles errors','b','async/await is syntactic sugar over promises, making async code easier to read.'],
  [7,'What is event delegation?','Creating events','Using parent listener for child events','Removing events','Event loop','b','Event delegation uses a parent listener to handle events from child elements.'],
  // Lec 8: Bug Reports
  [8,'Most important part of a bug report?','Your opinion','Steps to reproduce','Complaining','Copy-paste from chat','b','Steps to reproduce are critical so developers can verify and fix the bug.'],
  [8,'What should a bug title be?','Vague','Specific and descriptive','Funny','Very long','b','Bug titles should clearly describe the issue.'],
  [8,'What info is needed in a bug report?','OS and browser','Steps to reproduce','Actual vs expected behavior','All of above','d','Complete reports include environment, reproduction steps, and behavior.'],
  [8,'Should you take screenshots in bug reports?','Never','Only for critical bugs','Yes, always for visual issues','Only QA should add them','c','Screenshots help developers understand visual/layout issues quickly.'],
  [8,'Benefit of adding console errors to bug report?','Shows you\'re technical','Helps developers debug faster','Makes report longer','Is not necessary','b','Including console errors/stack traces accelerates debugging significantly.'],
  // Lec 9: Advanced
  [9,'What is cross-browser testing?','Testing one browser','Testing app on multiple browsers','Comparing browsers','Using browser tools','b','Cross-browser testing ensures the app works across different browsers.'],
  [9,'What is regression testing?','Finding new bugs','Testing fixes didn\'t break existing features','Performance testing','Security testing','b','Regression testing verifies new changes didn\'t break existing functionality.'],
  [9,'What does smoke testing check?','Performance','Basic functionality after build','Security','UI elements','b','Smoke testing verifies critical functionality works after new builds.'],
  [9,'Purpose of edge case testing?','Testing borders','Testing boundary values and unusual inputs','Testing edges','Testing CSS','b','Edge case testing checks how the app handles boundary values and unusual inputs.'],
  [9,'What is accessibility testing?','Testing access controls','Ensuring app is usable by people with disabilities','Testing logins','Testing security','b','Accessibility testing ensures the app is usable by everyone.'],
];
for (const [li, q, a, b, c, d, correct, explain] of questionsData) {
  const orderNum = questionsData.filter(x => x[0] === li).indexOf(questionsData.find(x => x[0] === li && x[1] === q)) + 1;
  qIns.run(lectureIds[li], q, a, b, c, d, correct, explain, orderNum);
}

// ── Baseline surveys ──────────────────────────────────────────────────────────
const bIns = db.prepare(`INSERT INTO baseline_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality) VALUES (?, ?, ?, ?, ?, ?)`);
bIns.run(nazarId, 2, 2, 1, 1, 2);
bIns.run(glebId,  3, 3, 2, 2, 3);
bIns.run(alenaId, 4, 4, 4, 3, 4);
bIns.run(vasyaId, 1, 1, 1, 1, 1);

// ── Test results ──────────────────────────────────────────────────────────────
const trIns = db.prepare(`INSERT INTO test_results (user_id, lecture_id, score, answers, completed_at) VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' days'))`);
// Nazariy: 3 done
trIns.run(nazarId, lectureIds[0], 60, '{}', 5);
trIns.run(nazarId, lectureIds[1], 75, '{}', 4);
trIns.run(nazarId, lectureIds[2], 85, '{}', 3);
// Gleb: 5 done
trIns.run(glebId, lectureIds[0], 70, '{}', 7);
trIns.run(glebId, lectureIds[1], 80, '{}', 6);
trIns.run(glebId, lectureIds[2], 90, '{}', 5);
trIns.run(glebId, lectureIds[3], 75, '{}', 4);
trIns.run(glebId, lectureIds[4], 95, '{}', 3);
// Alena: 8 done (high scores)
trIns.run(alenaId, lectureIds[0], 95,  '{}', 10);
trIns.run(alenaId, lectureIds[1], 100, '{}', 9);
trIns.run(alenaId, lectureIds[2], 95,  '{}', 8);
trIns.run(alenaId, lectureIds[3], 90,  '{}', 7);
trIns.run(alenaId, lectureIds[4], 100, '{}', 6);
trIns.run(alenaId, lectureIds[5], 95,  '{}', 5);
trIns.run(alenaId, lectureIds[6], 90,  '{}', 4);
trIns.run(alenaId, lectureIds[7], 100, '{}', 3);
// Vasya: 1 barely passed
trIns.run(vasyaId, lectureIds[0], 60, '{}', 2);

// ── Activity log ──────────────────────────────────────────────────────────────
const aIns = db.prepare(`INSERT INTO activity_log (user_id, action, lecture_id, created_at) VALUES (?, ?, ?, datetime('now', '-' || ? || ' hours'))`);
aIns.run(nazarId, 'passed_lecture', lectureIds[2], 3);
aIns.run(glebId,  'passed_lecture', lectureIds[4], 5);
aIns.run(alenaId, 'passed_lecture', lectureIds[7], 6);
aIns.run(vasyaId, 'passed_lecture', lectureIds[0], 10);
aIns.run(alenaId, 'login', null, 1);
aIns.run(nazarId, 'login', null, 2);

// ── Seed coins for demo accounts ─────────────────────────────────────────────
const profIns = db.prepare(`INSERT INTO user_profiles (user_id, bug_coins, nickname) VALUES (?, ?, ?)`);
profIns.run(alenaId, 150, 'Alena Expert');
profIns.run(glebId,  80,  'Gleb Glebov');
profIns.run(nazarId, 35,  'Nazariy Tester');
profIns.run(vasyaId, 10,  'Vasya Novice');

db.close();
console.log('Database seeded successfully!');
console.log('Note: only the original tables (lectures/quizzes/profiles) have demo data.');
console.log('Run the server once (npm run dev) to finish migrating newer tables (checklists, courses, guides, permissions, presence, suggestions, ...) — they start empty.');
