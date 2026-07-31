/**
 * SQLite's CURRENT_TIMESTAMP (used for every created_at/submitted_at/
 * archived_at/etc. column) returns UTC time as "YYYY-MM-DD HH:MM:SS" —
 * no "Z", no offset. That space-separated format isn't valid ISO 8601, so
 * browsers fall back to parsing it as LOCAL time instead of UTC. The
 * result: every timestamp from the API silently shifts by the viewer's own
 * UTC offset — a teammate in Krasnoyarsk (UTC+7) who just logged in saw
 * their own login timestamped "7 hours ago". Any timestamp coming from the
 * server needs to go through this before becoming a Date.
 */
export function parseServerDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(NaN);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  return new Date(hasZone ? raw : `${raw.replace(' ', 'T')}Z`);
}

/** Converts a "YYYY-MM-DD" date picked in the viewer's own local timezone
 *  (native `<input type="date">`) into the UTC instant that covers the
 *  start/end of that local day. Used for date_from/date_to report filters —
 *  without this, "today" meant UTC's today on the server, which is a
 *  different calendar day than the viewer's today for part of every day,
 *  silently dropping or misplacing submissions near local midnight. */
export function localDayStartUTC(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
export function localDayEndUTC(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

/** Today's date as "YYYY-MM-DD" in the viewer's own local timezone.
 *  `new Date().toISOString().slice(0,10)` gives UTC's calendar date, which
 *  is the wrong day for part of every 24h for anyone not in UTC — e.g. a
 *  tester in Krasnoyarsk filling out a checklist just after local midnight
 *  would get yesterday's date pre-filled as "Дата проверки". */
export function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Relative "N мин/ч/дн назад" — always computed against the viewer's own
 *  local clock, so it's automatically correct in any timezone once the
 *  underlying timestamp is parsed as UTC (see parseServerDate above). */
export function timeAgo(raw: string | null | undefined): string {
  if (!raw) return '';
  const diffMs = Date.now() - parseServerDate(raw).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}
