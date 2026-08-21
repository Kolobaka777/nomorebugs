// The kit has four kinds of button, and they live in index.css as
// .btn-primary / .btn-back / .btn-ghost / .btn-secondary. A button that
// re-declares one of them inline is a fifth copy that will drift.
//
// It cannot forbid inline styling outright: most of the app's buttons take
// their colour from the course being read, and a course's colour is data,
// not a class. What it can forbid is re-typing the *fixed accent* fills,
// which is what the classes exist for.
import { describe, it, expect } from 'vitest';

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// Vite hands a CSS import back as a processed module, not as text, unless
// the `raw` suffix is spelled on a glob that matches by extension.
// Whether the accent fill sits on a <button> or on something else. A round
// avatar chip filled with the accent is not a button and never was; a
// <button> filled with it is .btn-primary written out by hand.
function onAButton(src: string, at: number): boolean {
  const before = src.slice(Math.max(0, at - 400), at);
  const openedButton = before.lastIndexOf('<button');
  const openedOther = Math.max(before.lastIndexOf('<div'), before.lastIndexOf('<span'), before.lastIndexOf('<a '));
  return openedButton > openedOther;
}

describe('the kit button set', () => {
  it('has no <button> hand-rolling the accent fill that .btn-primary already is', () => {
    const offenders: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      if (file.includes('.test.')) continue;
      for (const m of src.matchAll(/background:\s*ACCENT\s*,\s*color:\s*PAGE_BG/g)) {
        if (onAButton(src, m.index!)) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('has nobody hand-rolling the ghost outline either', () => {
    const offenders: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      if (file.includes('.test.')) continue;
      // The literal accent, not a course colour held in a variable.
      for (const m of src.matchAll(/background:\s*`\$\{ACCENT\}1F`,\s*border:\s*`1px solid \$\{ACCENT\}`/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
