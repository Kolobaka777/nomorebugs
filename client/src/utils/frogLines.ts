import { frogLinesApi } from '../api';

// Everything the mascot says now lives in the frog_lines table and is edited
// by a lead (Багодельня → «Лягух»). This module is the client's single copy
// of that list.
//
// It's a module-level cache rather than React state because FrogLoader — the
// biggest consumer — renders *during* loading, often several times on one
// page, and has no useful way to wait for a fetch before showing something.
// So reads are synchronous against whatever is cached, the fetch happens
// once for the whole session, and until it lands (or if it fails outright)
// the small fallback lists below stand in. A mascot that goes silent because
// a request failed would be a worse bug than a slightly stale phrase.

export interface FrogLine {
  id: number;
  kind: 'tip' | 'loader' | 'tour';
  text: string;
  title: string | null;
  target: string | null;
  role: string | null;
  order_num: number;
}

// Deliberately short. The real lists are in the database — these exist only
// so the very first render and a failed request still have something to say,
// which is why they aren't kept in sync with the seed in db/schema.js.
const FALLBACK: Record<'tip' | 'loader', string[]> = {
  tip: [
    'Если что-то непонятно — жми на меня, там ответы на частые вопросы.',
    'Тест можно пересдать сколько угодно раз — сохранится лучший результат.',
  ],
  loader: ['квак-квак, гружусь...', 'скоро... наверное...', 'прыжок за прыжком'],
};

let cache: FrogLine[] | null = null;
let inflight: Promise<FrogLine[]> | null = null;

/** Fetches once per session; concurrent callers share the same request. */
export function loadFrogLines(): Promise<FrogLine[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = frogLinesApi.getAll()
      .then(r => {
        cache = r.data as FrogLine[];
        return cache;
      })
      .catch(() => {
        // Leave the cache empty so a later caller can retry, and let the
        // callers fall back rather than surfacing an error — nothing here is
        // important enough to interrupt anyone with.
        inflight = null;
        return [];
      });
  }
  return inflight;
}

/** Call after editing, so the next reader picks the new copy up. */
export function invalidateFrogLines() {
  cache = null;
  inflight = null;
}

/** Synchronous read — falls back while the fetch is still in the air. */
export function frogLinesOf(kind: 'tip' | 'loader'): string[] {
  const loaded = cache?.filter(l => l.kind === kind).map(l => l.text) ?? [];
  return loaded.length ? loaded : FALLBACK[kind];
}

export function randomFrogLine(kind: 'tip' | 'loader'): string {
  const list = frogLinesOf(kind);
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Tour steps for one role, in order. A row with no role is for everyone;
 * an admin also gets the lead's steps, matching the server's requireRole
 * ('lead' lets admin through) and Navigation.tsx building adminLinks from
 * leadLinks.
 */
export function tourStepsFor(role: string): FrogLine[] {
  return (cache ?? [])
    .filter(l => l.kind === 'tour')
    .filter(l => !l.role || l.role === role || (l.role === 'lead' && role === 'admin'))
    .sort((a, b) => a.order_num - b.order_num);
}
