import { ACCENT, TEXT_PRIMARY, PAGE_BG } from './theme';

// Lecture skill_area strings are free-text ("HTML structure", "CSS reading",
// "Bug report quality", ...) rather than the canonical topic-tag keys used
// for badge coloring (TOPIC_TAGS in types.ts) — this maps one to the other
// via substring match. Shared here (rather than duplicated per page) so
// every skill_area-driven badge resolves to the same tag/color everywhere.
export function getTopicTag(area: string): string {
  if (area.includes('HTML')) return 'HTML';
  if (area.includes('CSS')) return 'CSS';
  if (area.includes('DevTools')) return 'DevTools';
  if (area.includes('Console')) return 'Console';
  if (area.includes('Bug')) return 'Bug Reports';
  if (area.includes('JavaScript')) return 'JS';
  if (area.includes('Network')) return 'Network';
  return 'AIO';
}

// Courses-catalog tag palette — its own map, deliberately separate from
// TOPIC_TAGS above (used for skill_area badges on HomePage's test history).
// Same tag *labels* carry different colors in each context per the source
// mockups; shared here so the catalog grid, course detail, and the quiz
// page header all agree on one color per tag instead of drifting.
const COURSE_TAG_COLORS: Record<string, string> = {
  HTML: '#EF9F27',
  CSS: ACCENT,
  DevTools: '#27A5E7',
  // A real hex rather than an alpha wash: tagBadgeStyle below reads the
  // colour's luminance to pick its text, and it cannot read one through an
  // alpha channel. Console is the kit's "neutral" chip, so this is the muted
  // text grey — see the exception in tagBadgeStyle.
  Console: '#8A8B8E',
  'Bug Reports': '#F05454',
  JS: '#7F77DD',
  Network: '#27A5E7',
  AIO: TEXT_PRIMARY,
};
export function getCourseTagColor(tag: string): string {
  return COURSE_TAG_COLORS[tag] || TEXT_PRIMARY;
}

// ── Tag chips ────────────────────────────────────────────────────────────
//
// Per the kit, a tag is a 4px chip whose fill and outline are its own colour
// and whose *text is chosen for contrast against that fill* — a light hue
// (amber, teal) takes near-black text, a dark one (blue, red, violet) takes
// the light body colour.
//
// Every badge in the app used to paint the text in the tag colour too, over a
// 13%-alpha wash of the same colour. Same hue three times over, so the label
// sat barely above its own background and read as faded rather than as a
// label — which is exactly the "никогда прозрачным не выглядеть" the kit is
// written against.

// Relative luminance, sRGB, per WCAG. Only the threshold matters here: it
// decides which of two text colours reads on the fill, not a contrast score.
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const v = m[1];
  const channel = (i: number) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

// Above this the fill is light enough that near-black text reads better on
// it than the body grey does. Sits between DevTools blue (0.33, light text)
// and kit amber (0.43, dark text), which is where the kit itself draws it.
const LIGHT_FILL = 0.38;

export interface TagChipStyle {
  background: string;
  border: string;
  color: string;
  borderRadius: number;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

// A chip for a colour this cannot compose an alpha onto. Custom courses carry
// whatever colour their author saved, and appending "4D" to an rgba() string
// yields a colour the browser drops silently — a chip with no fill and no
// outline at all, which is worse than the faded ones this replaced.
const NEUTRAL_CHIP: TagChipStyle = {
  background: 'rgba(31, 40, 51, 0.30)',
  border: '1px solid rgba(197, 198, 199, 0.35)',
  color: TEXT_PRIMARY,
  borderRadius: 4,
};

export function tagChipStyle(color: string, tag?: string): TagChipStyle {
  // The kit's one neutral chip: a fill the colour of the card needs its
  // outline and its label to carry it, so both take the accent.
  if (tag === 'Console') {
    return {
      background: 'rgba(31, 40, 51, 0.30)',
      border: `1px solid ${ACCENT}66`,
      color: ACCENT,
      borderRadius: 4,
    };
  }
  if (!HEX6.test(color.trim())) return NEUTRAL_CHIP;
  const light = luminance(color) > LIGHT_FILL;
  return {
    background: `${color}${light ? '66' : '4D'}`,   // 0.4 / 0.3
    border: `1px solid ${color}${light ? '80' : '66'}`, // 0.5 / 0.4
    color: light ? PAGE_BG : TEXT_PRIMARY,
    borderRadius: 4,
  };
}

// The same chip, dimmed, for a filter that is available but not chosen. The
// text keeps its contrast — a dimmed *label* is unreadable, a dimmed
// *background* is just quieter.
export function tagChipStyleMuted(color: string, tag?: string): TagChipStyle {
  const on = tagChipStyle(color, tag);
  if (tag === 'Console' || !HEX6.test(color.trim())) return on;
  return { ...on, background: `${color}26`, border: `1px solid ${color}40` };
}
