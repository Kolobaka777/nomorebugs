import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseServerDate, timeAgo } from './date';

describe('parseServerDate', () => {
  it('treats a zone-less SQLite timestamp as UTC, not local time', () => {
    // "2026-07-31 10:00:00" is what better-sqlite3 hands back for
    // CURRENT_TIMESTAMP — it IS UTC, just without a marker saying so.
    const d = parseServerDate('2026-07-31 10:00:00');
    expect(d.toISOString()).toBe('2026-07-31T10:00:00.000Z');
  });

  it('leaves an already-zoned ISO timestamp alone', () => {
    const d = parseServerDate('2026-07-31T10:00:00.000Z');
    expect(d.toISOString()).toBe('2026-07-31T10:00:00.000Z');
  });

  it('returns an invalid date for empty/missing input rather than throwing', () => {
    expect(Number.isNaN(parseServerDate('').getTime())).toBe(true);
    expect(Number.isNaN(parseServerDate(undefined).getTime())).toBe(true);
  });
});

describe('timeAgo', () => {
  afterEach(() => vi.useRealTimers());

  it('reports "just now" for a timestamp seconds old, regardless of the viewer\'s timezone', () => {
    // Regression: before parseServerDate, a zone-less UTC timestamp read
    // as local time made a just-issued timestamp look hours old/in the
    // future depending on the viewer's UTC offset.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T10:00:10.000Z'));
    expect(timeAgo('2026-07-31 10:00:00')).toBe('только что');
  });

  it('a timestamp from exactly one hour ago reads "1 ч назад" no matter the browser offset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T11:00:00.000Z'));
    expect(timeAgo('2026-07-31 10:00:00')).toBe('1 ч назад');
  });
});
