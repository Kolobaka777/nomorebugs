import { describe, it, expect } from 'vitest';
import { resultText, DEFAULT_SUCCESS_TEXT, DEFAULT_FAIL_TEXT } from './courseResult';

describe('resultText', () => {
  it('uses the course\'s own line when it has one', () => {
    const course = { success_text: 'Ну всё, ты свой.', fail_text: 'Тебе бы перечитать.' };
    expect(resultText(course, true)).toBe('Ну всё, ты свой.');
    expect(resultText(course, false)).toBe('Тебе бы перечитать.');
  });

  // The point of the fallback: a course whose author skipped these still
  // signs off, rather than showing an empty pair of quotation marks.
  it('falls back to the default when the line is missing, empty or blank', () => {
    for (const course of [
      {},
      { success_text: '', fail_text: '' },
      { success_text: '   ', fail_text: '\n' },
      { success_text: null, fail_text: null },
    ]) {
      expect(resultText(course as any, true)).toBe(DEFAULT_SUCCESS_TEXT);
      expect(resultText(course as any, false)).toBe(DEFAULT_FAIL_TEXT);
    }
    expect(resultText(null, true)).toBe(DEFAULT_SUCCESS_TEXT);
  });

  it('falls back for one half without dragging the other down with it', () => {
    const course = { success_text: 'Своя фраза', fail_text: '' };
    expect(resultText(course, true)).toBe('Своя фраза');
    expect(resultText(course, false)).toBe(DEFAULT_FAIL_TEXT);
  });

  it('never returns an empty string, whatever it is handed', () => {
    for (const passed of [true, false]) {
      expect(resultText({ success_text: '', fail_text: '' }, passed).length).toBeGreaterThan(0);
    }
  });
});
