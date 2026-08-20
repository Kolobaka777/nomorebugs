import { describe, it, expect } from 'vitest';
import { plural, counted } from './plural';

const LESSON: [string, string, string] = ['урок', 'урока', 'уроков'];

describe('plural', () => {
  it('picks the singular only for a real one', () => {
    expect(plural(1, LESSON)).toBe('урок');
    expect(plural(21, LESSON)).toBe('урок');
    expect(plural(101, LESSON)).toBe('урок');
  });

  it('picks the few-form for two through four', () => {
    expect(plural(2, LESSON)).toBe('урока');
    expect(plural(4, LESSON)).toBe('урока');
    expect(plural(22, LESSON)).toBe('урока');
  });

  it('picks the many-form for five and up', () => {
    expect(plural(5, LESSON)).toBe('уроков');
    expect(plural(0, LESSON)).toBe('уроков');
    expect(plural(100, LESSON)).toBe('уроков');
  });

  it('does not let the teens masquerade as one through four', () => {
    // 11 ends in 1 and 12 ends in 2, but neither takes the form their last
    // digit suggests. This is the whole reason the helper exists.
    expect(plural(11, LESSON)).toBe('уроков');
    expect(plural(12, LESSON)).toBe('уроков');
    expect(plural(14, LESSON)).toBe('уроков');
    expect(plural(111, LESSON)).toBe('уроков');
    expect(plural(112, LESSON)).toBe('уроков');
  });

  it('puts the number in front for the header', () => {
    expect(counted(8, LESSON)).toBe('8 уроков');
    expect(counted(1, LESSON)).toBe('1 урок');
  });
});
