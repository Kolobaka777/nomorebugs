// The bottom-right corner has three tenants: the frog mascot, the toast
// stack and the course page's notes button. Each was added on its own and
// pinned to `bottom-6 right-6`, and each in turn was found sitting on top
// of the frog — the toasts covered it completely, and the notes pill was
// drawn underneath it.
//
// So this does not assert where any one of them sits. It asserts the rule:
// anything fixed to that corner has to step aside from `sm` up, which is
// where the frog appears. A fourth tenant fails this the day it is added,
// instead of the day someone notices the overlap in a screenshot.
import { describe, it, expect } from 'vitest';

// Read through Vite rather than node:fs — the client tsconfig has no node
// types, so an fs import here typechecks as an error even though it runs.
const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// FrogCompanion positions itself with inline styles (bottom: 54, right: 24)
// rather than classes, so it never matches the pattern below — it is the
// thing being avoided, not one of the avoiders.
const EXEMPT: Record<string, string> = {
  '../pages/LoginPage.tsx': 'decorative watermark on a page shown before login, where the mascot is not mounted',
  '../pages/RegisterPage.tsx': 'same watermark, same reason',
};

// `fixed` … `bottom-<n>` … `right-<n>`, in whatever order they were typed.
const CORNER = /className="([^"]*\bfixed\b[^"]*)"/g;
const pinnedBottomRight = (cls: string) =>
  /\bbottom-\d/.test(cls) && /\bright-\d/.test(cls);
const stepsAsideOnSm = (cls: string) =>
  /\bsm:bottom-\d/.test(cls) || /\bsm:right-\d/.test(cls);

describe('the bottom-right corner', () => {
  const occupants: { file: string; cls: string }[] = [];
  for (const [file, source] of Object.entries(sources)) {
    if (file.includes('.test.')) continue;
    for (const m of source.matchAll(CORNER)) {
      if (pinnedBottomRight(m[1])) occupants.push({ file, cls: m[1] });
    }
  }

  it('has tenants worth checking, so a broken pattern cannot pass by matching nothing', () => {
    expect(occupants.length).toBeGreaterThan(0);
  });

  it('makes every one of them clear the mascot on wide screens', () => {
    const offenders = occupants
      .filter(o => !(o.file in EXEMPT))
      .filter(o => !stepsAsideOnSm(o.cls))
      .map(o => `${o.file}: ${o.cls}`);
    expect(offenders, 'pin these away from the frog with an sm: offset, or add them to EXEMPT with a reason').toEqual([]);
  });

  it('keeps the exemptions honest', () => {
    // An exemption for a file that no longer has anything in the corner is
    // a licence nobody asked for; it should be removed with the element.
    for (const file of Object.keys(EXEMPT)) {
      expect(occupants.some(o => o.file === file), `${file} is exempt but no longer pins anything to the corner`).toBe(true);
    }
  });
});
