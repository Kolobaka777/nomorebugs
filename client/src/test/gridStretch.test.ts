// Cards standing side by side in a grid have to be the same height. Grid
// stretches its direct children by default, but a card *nested inside* a
// wrapper div does not inherit that height — so a longer label on one card
// left the row visibly ragged, which is what a screenshot caught.
//
// jsdom has no layout engine, so nothing here can measure a height. What it
// can do is hold the fix in place: the cards that were fixed still carry the
// classes that fix them, and a grid of cards still declares its stretch.
import { describe, it, expect } from 'vitest';

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const source = (file: string) => {
  const key = Object.keys(sources).find(k => k.endsWith(file));
  if (!key) throw new Error(`no such source: ${file}`);
  return sources[key];
};

// The block of JSX a component's root <div className="…"> opens.
const rootClasses = (src: string, after: string) => {
  const i = src.indexOf(after);
  expect(i, `anchor not found: ${after}`).toBeGreaterThan(-1);
  const m = /className="([^"]*)"/.exec(src.slice(i, i + 700));
  return m ? m[1] : '';
};

describe('cards standing side by side', () => {
  it('lets the home page stat pair fill its row instead of sizing to its own text', () => {
    const src = source('pages/HomePage.tsx');
    const cls = rootClasses(src, 'function StatCard(');
    expect(cls).toContain('h-full');
    // Bottom-aligned label: with a fixed gap under the number, a label that
    // wrapped to two lines sat lower on one card than on the other.
    expect(cls).toContain('justify-between');
  });

  it('lets the lead dashboard metric cards fill theirs', () => {
    const src = source('pages/UleyPage.tsx');
    expect(src).toContain('sm:grid-cols-3 gap-4 mb-8 items-stretch');
    // ...and the card inside the wrapper, which is the half that was missing.
    expect(rootClasses(src, 'sm:grid-cols-3 gap-4 mb-8 items-stretch')).toContain('h-full');
  });

  it('keeps the two halves of a bug example the same height', () => {
    // The pair is a comparison: one side taller than the other reads as one
    // side mattering more.
    const src = source('pages/BagodelnyaPage.tsx');
    expect(src).toContain('sm:grid-cols-2 gap-3 items-stretch');
    expect(src).toContain('flex items-start gap-3 h-full');
  });

  it('lets a catalog card fill its row, which is what made the cards uniform', () => {
    const src = source('pages/ZhukademiPage.tsx');
    // CourseCard opens with a positioning wrapper; the card itself is the
    // element carrying the border.
    expect(src).toContain('relative rounded-lg transition-all h-full flex flex-col');
  });
});
