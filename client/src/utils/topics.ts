import { ACCENT, TEXT_PRIMARY, CARD_BG, blendOver, readableTextOn, relativeLuminance } from './theme';

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
  // The kit's neutral chip. A real hex rather than an alpha wash because
  // callers outside the chip — a row's left edge, a legend dot — paint it
  // directly; tagChipStyle gives Console its own treatment and ignores it.
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
// and whose text is chosen for contrast against that fill. Every badge in the
// app once painted the text in the tag colour too, over a 13%-alpha wash of
// the same colour — same hue three times over, so the label sat barely above
// its own background and read as faded rather than as a label.
//
// The fill is that colour at 15-40% alpha over whatever is behind it, so the
// contrast question is about the composite and not about the hex. Scoring the
// hex is what put near-black text on the amber and teal chips, and what made
// every tag missing from the palette above — Мемы, Общее, Custom, Advanced,
// all of which fall through to the body grey — render as near-black on a 15%
// wash of near-black. Composite first, then pick the label.

const HEX6 = /^#[0-9a-f]{6}$/i;

// A chip is painted on a card as often as on the page, and the card is the
// lighter of the two. Score against the card: a label that clears there clears
// on the page as well, where the same wash composites darker.
const CHIP_BACKDROP = CARD_BG;

// Two fill weights, because a light hue at a given alpha reads heavier than a
// dark one. This governs the wash only; the label is picked from what that
// wash composites to.
const LIGHT_FILL = 0.38;
const CHIP_LIGHT = { fill: 0.4, edge: 0.5 };
const CHIP_DARK = { fill: 0.3, edge: 0.4 };
const MUTED = { fill: 0.15, edge: 0.25 };

const alphaHex = (a: number) => Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();

export interface TagChipStyle {
  background: string;
  border: string;
  color: string;
  borderRadius: number;
}

// The kit's one neutral chip — a fill the colour of the card. Doubles as the
// fallback for a colour this cannot compose an alpha onto: custom courses
// carry whatever their author saved, and appending "4D" to an rgba() string
// yields a colour the browser drops silently, leaving a chip with no fill and
// no outline at all, which is worse than the faded ones this replaced.
const NEUTRAL_FILL = 'rgba(31, 40, 51, 0.30)';
const NEUTRAL_TEXT = readableTextOn(blendOver(CARD_BG, 0.3, CHIP_BACKDROP));

const NEUTRAL_CHIP: TagChipStyle = {
  background: NEUTRAL_FILL,
  border: '1px solid rgba(197, 198, 199, 0.35)',
  color: NEUTRAL_TEXT,
  borderRadius: 4,
};

export function tagChipStyle(color: string, tag?: string): TagChipStyle {
  // Console is the kit's neutral chip: its fill is the card colour, so the
  // outline is what carries the tag. The label stays neutral like every other
  // one — a chip is identified by its edge, never by tinted text.
  if (tag === 'Console') {
    return { ...NEUTRAL_CHIP, border: `1px solid ${ACCENT}66` };
  }
  if (!HEX6.test(color.trim())) return NEUTRAL_CHIP;
  const weight = relativeLuminance(color) > LIGHT_FILL ? CHIP_LIGHT : CHIP_DARK;
  return {
    background: `${color}${alphaHex(weight.fill)}`,
    border: `1px solid ${color}${alphaHex(weight.edge)}`,
    color: readableTextOn(blendOver(color, weight.fill, CHIP_BACKDROP)),
    borderRadius: 4,
  };
}

// The same chip, dimmed, for a filter that is available but not chosen. Only
// the background dims: a quieter fill is quieter, a quieter label is just
// unreadable. The label is re-picked rather than inherited, because a 15%
// wash composites to a different colour than a 40% one.
export function tagChipStyleMuted(color: string, tag?: string): TagChipStyle {
  const on = tagChipStyle(color, tag);
  if (tag === 'Console' || !HEX6.test(color.trim())) return on;
  return {
    ...on,
    background: `${color}${alphaHex(MUTED.fill)}`,
    border: `1px solid ${color}${alphaHex(MUTED.edge)}`,
    color: readableTextOn(blendOver(color, MUTED.fill, CHIP_BACKDROP)),
  };
}
