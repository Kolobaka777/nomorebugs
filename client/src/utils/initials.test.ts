import { describe, it, expect } from 'vitest';
import { computeInitials } from './initials';

describe('computeInitials', () => {
  it('takes the first letter of each of the first two words', () => {
    expect(computeInitials('Alex Lead')).toBe('AL');
    expect(computeInitials('Nazariy Tester')).toBe('NT');
  });

  it('uses the first two characters of a genuinely single-word name', () => {
    expect(computeInitials('BOSS')).toBe('BO');
  });

  it('still takes first-letter-of-first-two-words for a multi-word nickname', () => {
    // "I'm BOSS" (a real nickname seen in this app) is two words — same
    // rule as a real first/last name, not the single-word 2-char rule.
    expect(computeInitials("I'm BOSS")).toBe('IB');
  });

  it('ignores extra whitespace and only uses the first two words for a longer name', () => {
    expect(computeInitials('  Alex   Middle Lead  ')).toBe('AM');
  });

  it('falls back to a placeholder for empty input', () => {
    expect(computeInitials('')).toBe('??');
    expect(computeInitials('   ')).toBe('??');
  });
});
