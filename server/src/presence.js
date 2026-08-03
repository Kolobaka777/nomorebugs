// Powers the "работают сейчас" team block: whether a given user is
// currently inside their own configured working hours. Deliberately a pure
// computed function, not a stored boolean — a stored "is working" flag
// would need something to flip it at the start/end of every shift, and
// this codebase has no cron/scheduler to do that. Computed at request time
// instead, using each user's own IANA timezone (teammates are in different
// timezones — see client/src/utils/date.ts) via the built-in
// Intl.DateTimeFormat, so no new npm dependency is needed.

export const LEAVE_TYPES = ['vacation', 'sick', 'day_off', 'other'];
export const STATUS_VALUES = ['active', 'remote', 'other'];

const ISO_WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Whether Intl actually accepts this as an IANA zone — the app validates new
// writes against this too (see routes/presence.js), but this is the
// defense-in-depth copy: a single legacy/corrupt row must never be able to
// throw out of the loop that builds the WHOLE team's presence list.
export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Returns true/false once hours are configured, or null when they aren't —
// "not configured" is deliberately distinguishable from "off the clock
// right now" so the UI can render a neutral state instead of a false "away".
export function computeIsWorkingNow(profile, now = new Date()) {
  if (!profile.work_start || !profile.work_end) return null;
  const tz = profile.timezone || 'Europe/Moscow';
  if (!isValidTimezone(tz)) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const isoWeekday = ISO_WEEKDAY[parts.weekday];
  const days = (profile.work_days || '1,2,3,4,5').split(',').map(Number);
  if (!days.includes(isoWeekday)) return false;

  const nowMin = Number(parts.hour) * 60 + Number(parts.minute);
  const [sh, sm] = profile.work_start.split(':').map(Number);
  const [eh, em] = profile.work_end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // An overnight shift (e.g. 22:00-06:00) has start > end — the "working"
  // window wraps past midnight instead of being a same-day range.
  return startMin <= endMin
    ? nowMin >= startMin && nowMin <= endMin
    : nowMin >= startMin || nowMin <= endMin;
}

// 'YYYY-MM-DD' for today in the user's own timezone — leave_periods dates
// and the news feed's "starts/ends today" check both compare against this,
// not the server's own local date, so someone in a +7 timezone doesn't see
// their vacation flip a day early/late relative to their own calendar.
export function todayInTimezone(tz, now = new Date()) {
  const safeTz = tz && isValidTimezone(tz) ? tz : 'Europe/Moscow';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: safeTz });
  return fmt.format(now); // en-CA formats as YYYY-MM-DD
}

// 'MM-DD' for today in the user's own timezone — compared against
// user_profiles.birthday (which deliberately never stores a year).
export function todayMonthDayInTimezone(tz, now = new Date()) {
  return todayInTimezone(tz, now).slice(5);
}
