// The palette's contrast helpers. Everything in the app that paints a label
// over a colour it did not choose — a role badge, a course author's button, a
// tag chip — goes through these, so this is where the "can anyone read that"
// question is actually settled.
import { describe, it, expect } from 'vitest';
import { readableTextOn, blendOver, relativeLuminance, contrastRatio, PAGE_BG, TEXT_PRIMARY, ACCENT, CARD_BG } from './theme';
import { ROLE_META } from './roles';

// A second implementation on purpose: a test that borrows the helper's own
// arithmetic cannot catch the helper getting the arithmetic wrong.
function rgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}
function lum(hex: string): number {
  const f = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('readableTextOn', () => {
  it('picks near-black on a light ground and light text on a dark one', () => {
    expect(lum(readableTextOn('#FFFFFF'))).toBeLessThan(0.2);
    expect(lum(readableTextOn(ACCENT))).toBeLessThan(0.2);
    expect(lum(readableTextOn(PAGE_BG))).toBeGreaterThan(0.3);
  });

  it('prefers the palette grey wherever it genuinely reads', () => {
    // Escalating to pure white on every dark surface would make a row of
    // chips shout; the ramp only reaches for it when the grey falls short.
    expect(readableTextOn(PAGE_BG)).toBe(TEXT_PRIMARY);
    expect(readableTextOn(CARD_BG)).toBe(TEXT_PRIMARY);
  });

  it('clears the floor for every grey between black and white', () => {
    for (let v = 0; v <= 255; v += 5) {
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      expect(ratio(readableTextOn(hex), hex)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('blendOver', () => {
  it('composites the way the browser does', () => {
    expect(blendOver('#FFFFFF', 0, PAGE_BG)).toBe(PAGE_BG.toLowerCase());
    expect(blendOver('#FFFFFF', 1, PAGE_BG)).toBe('#ffffff');
    expect(blendOver('#FFFFFF', 0.5, '#000000')).toBe('#808080');
  });

  it('returns the backdrop untouched for a colour it cannot parse', () => {
    expect(blendOver('rgba(1,2,3,0.5)', 0.4, PAGE_BG)).toBe(PAGE_BG);
  });
});

describe('the surfaces the app actually tints', () => {
  // Every colour a course author can put behind a button label: the builder's
  // five presets, plus what the demo seed saved.
  const AUTHOR_COLOURS = ['#66FCF1', '#7F77DD', '#EF9F27', '#e05252', '#4A90D9', '#1D9E75', '#F05454'];

  it('keeps the role badge readable for every role', () => {
    // The badge is the role colour at 60% over the page. Admin's dark red
    // composites to #8B3638, where the near-black this used to hardcode is
    // 2.4:1, and lead's amber lands in the middle where neither the page
    // colour nor the body grey clears on its own.
    for (const role of Object.keys(ROLE_META)) {
      const fill = blendOver(ROLE_META[role].color, 0.6);
      expect(ratio(readableTextOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps a course author\'s buttons readable, tinted or solid', () => {
    // Solid on the course-builder header, 40% on the module editor's own
    // "add a lesson".
    for (const color of AUTHOR_COLOURS) {
      for (const fill of [color, blendOver(color, 0.4)]) {
        expect(ratio(readableTextOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('leaves a bright solid fill with the near-black label it already had', () => {
    // The ramp is ordered so that fixing the dark cases does not repaint the
    // dozens of accent-on-page buttons that were always fine.
    expect(readableTextOn(ACCENT)).toBe(PAGE_BG);
    expect(readableTextOn('#4ADE80')).toBe(PAGE_BG);
    expect(readableTextOn('#EF9F27')).toBe(PAGE_BG);
  });
});

describe('contrastRatio', () => {
  it('is symmetric and spans 1:1 to 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio(ACCENT, ACCENT)).toBeCloseTo(1, 5);
  });
});

describe('relativeLuminance', () => {
  it('scores black, white and the palette the way WCAG does', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance(TEXT_PRIMARY)).toBeCloseTo(lum(TEXT_PRIMARY), 5);
    expect(relativeLuminance(CARD_BG)).toBeCloseTo(lum(CARD_BG), 5);
  });

  it('scores an unparseable colour as black rather than throwing', () => {
    // Course colours arrive from the database as free text.
    expect(relativeLuminance('rgba(1,2,3,0.5)')).toBe(0);
    expect(relativeLuminance('')).toBe(0);
  });
});
