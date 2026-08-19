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
