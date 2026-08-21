// The kit gives one ladder — H1, H2, H3, SMALL, BODY, LINK — and the app had
// been climbing a different one on every page: a page heading was 32px on
// Курсы, 24px on eight other screens, 26px on one and 22px on two more.
//
// So this does not assert what any one heading looks like. It asserts that a
// page-level heading takes its size from the shared token rather than typing
// its own numbers, which is the thing that drifted.
import { describe, it, expect } from 'vitest';
import { H1, H2, H3, H4, SMALL, BODY, LINK } from '../utils/theme';

const sources = import.meta.glob('../pages/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// A page whose top-level heading is not a page title in the usual sense.
const EXEMPT: Record<string, string> = {
  '../pages/LoginPage.tsx': 'the wordmark, not a heading',
  '../pages/RegisterPage.tsx': 'same wordmark',
  '../pages/MoyaNora.tsx': 'the cabinet leads with the person, not a page name',
  '../pages/UleyPage.tsx': 'leads with the team summary',
  '../pages/PublicProfilePage.tsx': 'leads with the person',
  '../pages/QuizPage.tsx': 'leads with the lecture being taken',
  '../pages/ForgotPasswordPage.tsx': 'single-purpose form',
  '../pages/PasswordRecovery.test.tsx': 'test file',
};

// `<h1 … style={{ …H1 }}` or `style={{ …H2 }}`, in whatever order attributes
// were typed, on the same line or the next.
const H1_TAG = /<h1\b[\s\S]{0,400}?>/g;

describe('the kit type scale', () => {
  it('is a real ladder, each rung smaller than the one above', () => {
    const sizes = [H1, H2, H3, H4].map(s => s.fontSize as number);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1]);
  });

  it('tracks headings wide and leaves body text alone', () => {
    for (const h of [H1, H2, H3, H4]) expect(h.letterSpacing).toBeTruthy();
    expect(BODY.letterSpacing).toBeUndefined();
    expect(LINK.letterSpacing).toBeUndefined();
  });

  it('sets headings in Montserrat and running text in Geist, per the kit', () => {
    for (const h of [H1, H2, H3, H4]) expect(String(h.fontFamily)).toContain('Montserrat');
    for (const t of [SMALL, BODY, LINK]) expect(String(t.fontFamily)).toContain('Geist');
  });

  it('has every page heading read the scale instead of typing its own numbers', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      if (file.includes('.test.') || EXEMPT[file]) continue;
      for (const m of source.matchAll(H1_TAG)) {
        if (!/\.\.\.H[1-4]\b/.test(m[0])) offenders.push(`${file}: ${m[0].slice(0, 90).replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders, `page headings not on the scale:\n${offenders.join('\n')}`).toEqual([]);
  });
});
