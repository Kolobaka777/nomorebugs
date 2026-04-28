import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'learning_hub.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('tester', 'lead')),
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
  `);
}
