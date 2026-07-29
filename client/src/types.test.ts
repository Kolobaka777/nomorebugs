import { describe, it, expect } from 'vitest';
import { getLevel, getLevelXpPercent } from './types';

describe('getLevel', () => {
  it('a lead always gets the lead-specific level regardless of completed count', () => {
    expect(getLevel(0, true).name).toBe('Королева улья');
    expect(getLevel(10, true).name).toBe('Королева улья');
  });

  it.each([
    [0, 'Яйцо'],
    [1, 'Личинка'],
    [2, 'Личинка'],
    [3, 'Куколка'],
    [5, 'Куколка'],
    [6, 'Жук'],
    [9, 'Жук'],
    [10, 'Матёрый жук'],
    [15, 'Матёрый жук'], // above the max — should still resolve to the top tier, not throw or fall through
  ])('completed=%i maps to level %s', (completed, expectedName) => {
    expect(getLevel(completed).name).toBe(expectedName);
  });
});

describe('getLevelXpPercent', () => {
  it('is 0% at the very start', () => {
    expect(getLevelXpPercent(0)).toBe(0);
  });

  it('is 100% once the top tier is reached, and stays there beyond it', () => {
    expect(getLevelXpPercent(10)).toBe(100);
    expect(getLevelXpPercent(20)).toBe(100);
  });

  it('is a valid 0-100 percentage at every tier boundary (regression guard against a boundary math bug)', () => {
    for (let completed = 0; completed <= 12; completed++) {
      const pct = getLevelXpPercent(completed);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
      expect(Number.isNaN(pct)).toBe(false);
    }
  });

  it('resets to a fresh 0-100% bar at the start of each tier, rather than accumulating globally', () => {
    // completed=2 finishes tier 1 (Личинка) at 100%, then completed=3 starts
    // tier 2 (Куколка) back near 0% — this is intentional (each level's XP
    // bar shows progress within that level), not a bug, but it's easy to
    // accidentally "fix" into a monotonic global percentage later, so it's
    // worth pinning down explicitly.
    expect(getLevelXpPercent(2)).toBe(100);
    expect(getLevelXpPercent(3)).toBeCloseTo(33.33, 1);
  });
});
