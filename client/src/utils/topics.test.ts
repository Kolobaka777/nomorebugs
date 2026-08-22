// The kit's rule for a tag chip: fill and outline are the tag's own colour,
// and the text is picked for contrast against that fill. The trap is which
// fill — the chip is painted as the tag colour at 15-40% alpha over a
// near-black page, so the colour behind the label is the composite, not the
// hex. Scoring the hex is what put near-black text on the amber and teal
// chips and made every uncoloured tag (Мемы, Общее, Custom, Advanced, which
// all fall back to the body grey) render as black on near-black.
import { describe, it, expect } from 'vitest';
import { tagChipStyle, tagChipStyleMuted, getCourseTagColor } from './topics';
import { PAGE_BG, TEXT_PRIMARY, ACCENT, CARD_BG } from './theme';

// Deliberately a second implementation rather than an import: a test that
// borrows the helper's own arithmetic cannot catch the helper getting the
// arithmetic wrong.
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
// The chip's declared background is "#rrggbbAA" — split it back apart and
// composite it the way the browser will. Over the card, not the page: a chip
// sits on a card as often as not, and the card is the lighter ground of the
// two, so it is the one that decides whether a light label holds up.
function painted(background: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(background);
  if (!m) return CARD_BG; // the neutral chip's rgba() fill, close enough to score
  const a = parseInt(m[2], 16) / 255;
  const [fr, fg, fb] = rgb(`#${m[1]}`);
  const [br, bg, bb] = rgb(CARD_BG);
  const mix = (f: number, b: number) => Math.round(f * a + b * (1 - a));
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

const CATALOG_TAGS = ['HTML', 'CSS', 'DevTools', 'Console', 'Bug Reports', 'JS', 'Network', 'AIO'];
// Tags with no entry in the catalog palette. Custom courses invent their own
// ("Мемы", "Общее"), and the course builder offers three more; all of them
// fall through to the body grey, which is the case that was invisible.
const UNCOLOURED_TAGS = ['Мемы', 'Общее', 'Custom', 'Advanced', 'Responsive'];
// Colours a course author can actually save, from the builder presets and the
// demo seed — the chip has to hold up for a hex nobody reviewed.
const AUTHOR_COLOURS = ['#e05252', '#7F77DD', '#EF9F27', '#66FCF1', '#1D9E75', '#27A5E7', '#F05454', '#C5C6C7', '#FFFFFF', '#000000'];

describe('tagChipStyle', () => {
  it('keeps every catalog chip legible on the colour it is actually painted', () => {
    for (const tag of CATALOG_TAGS) {
      const color = getCourseTagColor(tag);
      for (const chip of [tagChipStyle(color, tag), tagChipStyleMuted(color, tag)]) {
        expect(ratio(chip.color, painted(chip.background))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps an uncoloured tag legible instead of black on near-black', () => {
    // The screenshot bug: these render through the body-grey fallback, which
    // scores as a light colour, so they used to take near-black text over a
    // 15% wash of near-black — about 1.3:1.
    for (const tag of UNCOLOURED_TAGS) {
      const color = getCourseTagColor(tag);
      const off = tagChipStyleMuted(color, tag);
      expect(off.color).not.toBe(PAGE_BG);
      expect(ratio(off.color, painted(off.background))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('holds up for any colour a course author can save', () => {
    for (const color of AUTHOR_COLOURS) {
      for (const chip of [tagChipStyle(color), tagChipStyleMuted(color)]) {
        expect(ratio(chip.color, painted(chip.background))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('never tints the label — white, black or a grey, and nothing else', () => {
    // The hue belongs to the fill and the outline. A tinted label is what
    // made a chip read as its own background.
    const labels = new Set<string>();
    for (const tag of [...CATALOG_TAGS, ...UNCOLOURED_TAGS]) {
      const color = getCourseTagColor(tag);
      labels.add(tagChipStyle(color, tag).color);
      labels.add(tagChipStyleMuted(color, tag).color);
    }
    for (const color of AUTHOR_COLOURS) labels.add(tagChipStyle(color).color);
    for (const label of labels) {
      const [r, g, b] = rgb(label);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    }
  });

  it('gives the neutral chip an outline and a label it can be seen by', () => {
    const chip = tagChipStyle(getCourseTagColor('Console'), 'Console');
    expect(chip.border).toContain(ACCENT);
    expect(ratio(chip.color, CARD_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('squares the corners to the kit\'s 4px, not the pill they used to be', () => {
    expect(tagChipStyle('#EF9F27').borderRadius).toBe(4);
  });

  it('dims the background of an unchosen filter without dimming its label', () => {
    const on = tagChipStyle('#27A5E7');
    const off = tagChipStyleMuted('#27A5E7');
    expect(off.background).not.toBe(on.background);
    expect(ratio(off.color, painted(off.background))).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back to a readable chip for a colour it cannot compose an alpha onto', () => {
    // Custom courses carry free-text tags and whatever colour their author
    // saved. Appending "4D" to an rgba() string yields a colour the browser
    // drops silently — a chip with no fill and no outline at all.
    for (const bad of ['rgba(1,2,3,0.5)', 'red', '#fff', '', 'linear-gradient(#000,#fff)']) {
      const chip = tagChipStyle(bad);
      expect(chip.color).toBe(TEXT_PRIMARY);
      expect(chip.background).not.toContain('rgba(1,2,3,0.5)');
      expect(chip.border).not.toContain('undefined');
    }
    const muted = tagChipStyleMuted('rgba(1,2,3,0.5)');
    expect(muted.background).toBe(tagChipStyle('rgba(1,2,3,0.5)').background);
  });
});
