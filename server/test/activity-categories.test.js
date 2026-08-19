// The category map is the thing standing between a lead and a log they
// can't filter. Its one real failure mode is silent: an action that matches
// two categories lands in whichever CASE arm comes first, and an action
// that matches none disappears from every filtered view while still being
// counted in the unfiltered one.
//
// So this file does not test the patterns against themselves. It lists
// every action string the server can actually write — the list is
// maintainable by grepping `logActivity(` — and asserts each one is
// claimed exactly once.
import { describe, it, expect } from 'vitest';
import { ACTIVITY_CATEGORIES, categoryFilter, categoryCaseSql } from '../src/activityCategories.js';

// SQLite LIKE, in JS: % is any run of characters, _ is any one character,
// and the match is anchored at both ends. No pattern here uses _, but
// escaping it costs nothing and keeps this honest if one ever does.
function likeMatches(pattern, value) {
  const rx = new RegExp(
    '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$'
  );
  return rx.test(value);
}

// Every action string reachable from a logActivity() call, with the dynamic
// parts filled in. Keep in step with the codebase — a new action missing
// from here isn't caught by anything else.
const EVERY_ACTION = [
  // learning
  'passed_lecture',
  'failed_lecture',
  'course_completed',
  'completed_baseline',
  'checklist_submitted:template=3',
  'earned_achievement:achievement_otlichnik',
  'crafted_badge:Skill A',
  // content
  'course_created:Основы багрепорта',
  'course_published:Основы багрепорта',
  'course_unpublished:Основы багрепорта',
  'course_deleted:Основы багрепорта',
  'guide_created:Как заводить баги',
  'guide_approved:Как заводить баги',
  'guide_deleted:Как заводить баги',
  'bug_example_created:Кнопка не нажимается',
  'bug_example_approved:Кнопка не нажимается',
  'bug_example_deleted:Кнопка не нажимается',
  'glossary_created:Регрессия',
  'glossary_approved:Регрессия',
  'glossary_deleted:Регрессия',
  'news_posted:Завтра релиз',
  'news_deleted:Завтра релиз',
  // admin
  'user_archived:target=4',
  'user_restored:target=4',
  'admin_role_change:target=4:new_role=lead',
  'permission_granted:target=4:permission=manage_guides',
  'permission_revoked:target=4:permission=manage_guides',
  'password_reset:target=4',
  'bonus_awarded:target=4:amount=100',
  // account
  'login',
  'login_telegram',
  'login_failed',
  'account_locked',
  'register',
  'register_telegram',
  'password_changed',
  'password_reset_self_service',
  'email_changed',
  'phone_changed',
];

function categoriesClaiming(action) {
  return Object.entries(ACTIVITY_CATEGORIES)
    .filter(([, patterns]) => patterns.some(p => likeMatches(p, action)))
    .map(([name]) => name);
}

describe('activity categories', () => {
  it.each(EVERY_ACTION)('claims %s exactly once', action => {
    expect(categoriesClaiming(action)).toHaveLength(1);
  });

  // The two that made the overlap risk concrete: an admin resetting
  // someone else's password is an admin action, a person recovering their
  // own is an account one, and the obvious `password_reset%` pattern
  // swallows both.
  it('keeps an admin password reset apart from a self-service one', () => {
    expect(categoriesClaiming('password_reset:target=4')).toEqual(['admin']);
    expect(categoriesClaiming('password_reset_self_service')).toEqual(['account']);
  });

  it('files an unknown action under "other" rather than dropping it', () => {
    expect(categoriesClaiming('something_nobody_wrote_yet:1')).toEqual([]);
    expect(categoryCaseSql('a')).toContain("ELSE 'other'");
  });

  it('ignores an unknown category instead of failing the request', () => {
    expect(categoryFilter('nonsense')).toBeNull();
    expect(categoryFilter(undefined)).toBeNull();
  });

  it('builds one LIKE placeholder per pattern', () => {
    for (const [name, patterns] of Object.entries(ACTIVITY_CATEGORIES)) {
      const f = categoryFilter(name);
      expect(f.params).toEqual(patterns);
      expect(f.sql.match(/LIKE \?/g)).toHaveLength(patterns.length);
    }
  });
});
