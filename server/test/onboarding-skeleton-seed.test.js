// seedOnboardingCourseSkeleton (schema.js) — the one-time draft skeleton
// created for a lead to fill in via Course Builder. Isolated in its own
// file/DB: it must run before anything else ever creates an is_onboarding
// course, since the seed is gated on none existing yet.
import { describe, it, expect } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { db, initDb } = await import('../db/schema.js');
const { seedTestData } = await import('./helpers.js');
// Importing app.js runs initDb() once, at a point with no users yet — the
// skeleton seed's lead/admin guard is expected to no-op that first time.
await import('../src/app.js');

describe('seedOnboardingCourseSkeleton', () => {
  it('creates nothing on first boot, before this test file adds any more users (app.js\'s own dev auto-seed already ran on import, per its own guard)', () => {
    expect(db.prepare('SELECT COUNT(*) as c FROM custom_courses WHERE is_onboarding = 1').get().c).toBe(0);
  });

  it('creates a draft, unpublished skeleton once a lead/admin exists and the server "restarts" (initDb re-run)', () => {
    seedTestData(db);

    // initDb() is idempotent — every migration inside is guarded — so
    // calling it again now, with a lead already seeded, is exactly what a
    // real server restart after this deploy does against the owner's
    // existing DB.
    initDb();

    const course = db.prepare("SELECT * FROM custom_courses WHERE is_onboarding = 1 AND title = 'Вводный курс'").get();
    expect(course).toBeTruthy();
    expect(course.is_published).toBe(0);
    // Attributed to *a* real lead/admin — deliberately not asserting which
    // exact one: app.js's own dev-convenience auto-seed (see its "Users
    // auto-seeded" log) may have already created one before this test
    // file's own seedTestData fixtures did, and the implementation picks
    // whichever has the lowest id. What matters is that it's a genuine
    // lead/admin account, not the specific id.
    const author = db.prepare('SELECT role FROM users WHERE id = ?').get(course.created_by);
    expect(['lead', 'admin']).toContain(author?.role);

    const modules = db.prepare('SELECT * FROM custom_modules WHERE course_id = ? ORDER BY order_num').all(course.id);
    expect(modules.map(m => m.title)).toEqual([
      'Добро пожаловать', 'Инструменты и сервисы', 'Кто за что отвечает', 'Какие задачи мы выполняем',
    ]);

    const lessons = db.prepare(`
      SELECT cl.* FROM custom_lessons cl JOIN custom_modules cm ON cm.id = cl.module_id
      WHERE cm.course_id = ? ORDER BY cm.order_num, cl.order_num
    `).all(course.id);
    // 1 + 1 + 1 + however many checklist_templates got seeded (≥1)
    expect(lessons.length).toBeGreaterThanOrEqual(4);
    expect(lessons[0].prerequisite_type).toBe('none');
    for (let i = 1; i < lessons.length; i++) {
      expect(lessons[i].prerequisite_type).toBe('mandatory');
      expect(lessons[i].prerequisite_lesson_id).toBe(lessons[i - 1].id);
    }
  });

  it('does not duplicate it on a subsequent restart', () => {
    initDb();
    const count = db.prepare("SELECT COUNT(*) as c FROM custom_courses WHERE is_onboarding = 1 AND title = 'Вводный курс'").get().c;
    expect(count).toBe(1);
  });

  it('leaves a lead\'s later rename/edit alone on the next restart', () => {
    db.prepare("UPDATE custom_courses SET title = 'Введение для новых тестировщиков' WHERE is_onboarding = 1").run();
    initDb();
    const renamed = db.prepare("SELECT * FROM custom_courses WHERE is_onboarding = 1").get();
    expect(renamed.title).toBe('Введение для новых тестировщиков');
    const count = db.prepare('SELECT COUNT(*) as c FROM custom_courses WHERE is_onboarding = 1').get().c;
    expect(count).toBe(1); // still didn't create a second one under the original title
  });
});
