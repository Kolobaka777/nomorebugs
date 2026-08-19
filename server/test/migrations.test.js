// The migration ledger. Migrations here are individually-guarded statements
// re-run from the top on every boot — robust, but until this table existed
// nobody could say what state a given database was in, when a change
// landed, or which step failed when one did.
import { describe, it, expect, vi } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

await import('../src/app.js');
const { db, appliedMigrations, migrationStep } = await import('../db/schema.js');

describe('schema_migrations', () => {
  it('records every named step a boot applied', () => {
    const applied = appliedMigrations();
    expect(applied.length).toBeGreaterThan(10);
    for (const row of applied) {
      expect(row.name).toBeTruthy();
      expect(row.applied_at).toBeTruthy();
    }
    // Named after what they change, so the list reads as an answer to
    // "what shape is this database in".
    expect(applied.map(r => r.name)).toContain('activity_log.course_id');
  });

  it('runs a step once and never again', () => {
    let runs = 0;
    const name = 'test.counted_step';

    expect(migrationStep(name, () => { runs++; })).toBe(true);
    expect(migrationStep(name, () => { runs++; })).toBe(false);
    expect(migrationStep(name, () => { runs++; })).toBe(false);
    expect(runs).toBe(1);
  });

  // The part the guards never gave us: a failing ALTER used to surface as a
  // bare stack trace out of a 1500-line file.
  it('names the step that failed, and does not record it as done', () => {
    const name = 'test.failing_step';
    expect(() => migrationStep(name, () => { throw new Error('колонка занята'); }))
      .toThrow(/Миграция "test\.failing_step" не выполнена: колонка занята/);

    expect(db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)).toBeUndefined();

    // ...so a fixed deployment retries it rather than skipping it forever.
    let retried = false;
    expect(migrationStep(name, () => { retried = true; })).toBe(true);
    expect(retried).toBe(true);
  });

  it('leaves the schema itself correct — the ledger describes, it does not replace', () => {
    const activity = db.prepare('PRAGMA table_info(activity_log)').all().map(c => c.name);
    expect(activity).toContain('course_id');
    const courses = db.prepare('PRAGMA table_info(custom_courses)').all().map(c => c.name);
    expect(courses).toEqual(expect.arrayContaining(['success_text', 'fail_text', 'proposal_status']));
  });
});
