// The kit's rule for a tag chip: fill and outline are the tag's own colour,
// and the *text* is picked for contrast against that fill. Every badge in the
// app used to paint the label in the tag colour as well, over a wash of the
// same colour — same hue three times over, which is why they read as faded.
import { describe, it, expect } from 'vitest';
import { tagChipStyle, tagChipStyleMuted, getCourseTagColor } from './topics';
import { PAGE_BG, TEXT_PRIMARY, ACCENT } from './theme';

describe('tagChipStyle', () => {
  it('puts near-black text on a light fill', () => {
    // Kit: HTML amber and CSS teal both carry #0B0C10.
    expect(tagChipStyle(getCourseTagColor('HTML')).color).toBe(PAGE_BG);
    expect(tagChipStyle(getCourseTagColor('CSS')).color).toBe(PAGE_BG);
  });

  it('puts the body colour on a dark fill', () => {
    // Kit: DevTools blue and BugReports red both carry #C5C6C7.
    expect(tagChipStyle(getCourseTagColor('DevTools')).color).toBe(TEXT_PRIMARY);
    expect(tagChipStyle(getCourseTagColor('Bug Reports')).color).toBe(TEXT_PRIMARY);
    expect(tagChipStyle(getCourseTagColor('JS')).color).toBe(TEXT_PRIMARY);
  });

  it('never paints the label in the same colour as its own fill', () => {
    // The whole failure mode in one assertion: a chip whose text is its
    // background is a chip nobody can read.
    for (const tag of ['HTML', 'CSS', 'DevTools', 'Console', 'Bug Reports', 'JS', 'Network', 'AIO']) {
      const color = getCourseTagColor(tag);
      const chip = tagChipStyle(color, tag);
      expect(chip.color.toLowerCase()).not.toBe(color.toLowerCase());
      expect(chip.background.toLowerCase()).not.toBe(chip.color.toLowerCase());
    }
  });

  it('gives the neutral chip an outline and a label it can be seen by', () => {
    // A fill the colour of the card cannot carry itself.
    const chip = tagChipStyle(getCourseTagColor('Console'), 'Console');
    expect(chip.color).toBe(ACCENT);
    expect(chip.border).toContain(ACCENT);
  });

  it('squares the corners to the kit\'s 4px, not the pill they used to be', () => {
    expect(tagChipStyle('#EF9F27').borderRadius).toBe(4);
  });

  it('dims only the background of an unchosen filter, never its label', () => {
    const on = tagChipStyle('#27A5E7');
    const off = tagChipStyleMuted('#27A5E7');
    expect(off.color).toBe(on.color);
    expect(off.background).not.toBe(on.background);
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
