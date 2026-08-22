// New (Figma) visual language — introduced for the redesign starting with
// the homepage/nav, page by page. Old pages keep the original teal '#66FCF1'
// accent + font-pixel/Inter (hardcoded inline throughout, not this token)
// until they're redesigned too, so importing this doesn't silently recolor
// anything else.
//
// As of 2026-08-09 this file is driven by the user's actual UI Kit export
// (C:\Users\user\Desktop\Projects\ttst\images\Logos\UI Kit.png — colors,
// borders, fonts) rather than per-screen Inspect values, so it's now the
// single source of truth for the redesign's palette: every redesigned page
// should import its colors from here, not hardcode hex. Change a value
// once here and every page that imports it follows — that's the point.

import bugTextureUrl from '../assets/bug-texture.png';

// ── Core palette (exact kit names/roles — see ICONS.md sibling doc for the
// icon-side counterpart of this reference) ─────────────────────────────
export const PAGE_BG = '#0B0C10';      // фон
export const CARD_BG = '#1F2833';      // вторичный фон
export const TEXT_PRIMARY = '#C5C6C7'; // основной текст
export const TEXT_MUTED = '#8A8B8E';   // второстепенный (подписи, дата)
export const ACCENT = '#66FCF1';       // акценты, кнопки, ссылки
export const HOVER = '#8AFFF5';        // ховеры
export const SECONDARY = '#45A29E';    // второстепенные элементы, рамки, ховеры
export const BADGE_NOTIFY = '#EF9F27'; // NEW, бейджики, уведомления — same hex as tailwind's 'amber'

// Kept as aliases of the palette above, not new colors — old call sites
// (StatCard's two-tone big numbers) read naturally as "bright/dim number",
// so keep those names, but they resolve to the same kit values.
export const NUM_BRIGHT = HOVER;
export const NUM_DIM = 'rgba(138, 255, 245, 0.6)';
export const ACCENT_DIM = 'rgba(102, 252, 241, 0.12)';

// ── Semantic colors ───────────────────────────────────────────────────────
// These were the palette's biggest hole: the app has spoken in exactly these
// four colors from the start, and not one of them lived here. `#e05252`
// alone appeared 91 times across the components — the single most-repeated
// literal in the codebase, and the one you would most want to change in one
// place, since it is what every error in the product looks like.
//
// Semantic, not decorative: ERROR means "this went wrong", not "red". Keep
// them distinct from ACCENT, which is identity rather than meaning.
export const ERROR = '#e05252';
export const SUCCESS = '#4ADE80';
export const INFO = '#7F77DD';   // the "rare"/epic tier and the idea-board's own hue

// The muted-text color as an alpha wash over the page, for the several
// places that want "primary text, dimmed" rather than the flat TEXT_MUTED.
// Spelled out as rgba(197, 198, 199, …) in 283 places before this existed.
export const softText = (alpha: number) => `rgba(197, 198, 199, ${alpha})`;

// Surfaces.
export const PAGE_GRADIENT = 'linear-gradient(180deg, #0B0C10 0%, rgba(31, 40, 51, 0.90) 100%)';
export const CARD_SHADOW = '0 6px 12px 0 rgba(0, 0, 0, 0.25)';
// Skill-stat cards ("0/10", "0%", "+-0.0") get a slightly taller shadow
// blur/spread than everything else — per Figma, not a typo of CARD_SHADOW.
export const CARD_SHADOW_TALL = '0 8px 12px 0 rgba(0, 0, 0, 0.25)';

// The bug tile behind every card. Figma's recipe, read off the fill panel and
// then checked against the design's own export of the frame: a pixel-art sheet
// over a solid #1F2833, tiled at 12.75%, with the image fill set to Multiply
// at 10%.
//
// Three things here were wrong for a long time, and all three are worth naming
// because each one was arrived at by eye.
//
// The tile scale. An earlier pass recorded 12.75 as a meaningless placeholder
// Figma shows for an unexported local image, and picked a size by eye instead.
// It is the real tile scale: the sheet is 592px, 592 x 12.75% = 75.48, and
// Figma's canvas measures one repeat at exactly 75.48. We render 74 rather than
// 75.48 on purpose — the art sits on a 16px grid, so the sheet is 37 x 37 art
// pixels, and 74 is exactly two screen pixels per art pixel and exactly an
// eighth of the sheet. The grid survives instead of being resampled. (75.48 is
// 2.04 per art pixel, which is why the mockup's own render is a shade softer
// than the source art.) The asset ships pre-reduced to 74px for the same
// reason: handing the browser a 592px sheet and asking for 64px, which is what
// this used to do, resamples 1.73 screen pixels per art pixel on every paint,
// and pixel art does not survive that.
//
// The blend. Multiply, not Normal — and over a solid card the two are not
// close. Each of the sheet's four ink tones composites to a colour that appears
// in the design's exported frame; under Normal at the same 10%, three of those
// four land on colours the export contains zero pixels of.
//
// The ink. The old processing used each pixel's brightness as its alpha, which
// did two things: it dropped the pure black entirely — 22.1% of the sheet, and
// the outlines, which is most of what makes a bug read as a bug — and it
// inverted the ramp, so the palest grey came out the most opaque. Ink coverage
// was 13.2% where the sheet's is 35.3%. Multiply at 10% over a solid card is
// exactly black at alpha 0.1 * (1 - ink/255), within a fifth of a colour unit,
// so the tile stays a black overlay rather than a bitmap welded to one card
// colour, and CARD_BG can still move without regenerating it.
//
// bug-texture-master.png sits alongside, deliberately not imported: it is the
// 592px sheet the tile is generated from (reduce 8x nearest, then that alpha
// ramp). Keep it — without it the tile cannot be regenerated.
export const CARD_BG_PATTERN = `url("${bugTextureUrl}") 0 0/74px 74px repeat, ${CARD_BG}`;

// One-off label color from the "СТАТИСТИКА ПЛОЩАДКИ" stat-card spec — close
// to but distinct from TEXT_PRIMARY/TEXT_MUTED, so it's its own token rather
// than overloading either of those roles.
export const STAT_LABEL_COLOR = '#E0E0E0';

// Bottom "СТАТИСТИКА ПЛОЩАДКИ" cards — a teal-to-transparent wash rather
// than a flat/patterned fill.
export const STAT_GRADIENT = 'linear-gradient(0deg, rgba(69, 162, 158, 0.23) 0%, rgba(11, 12, 16, 0.00) 100%)';
export const STAT_SHADOW = '0 4px 12px 0 rgba(0, 0, 0, 0.25)';


// Floating glass header (frosted rounded bar, not a full-bleed solid header).
export const HEADER_BG = 'rgba(31, 40, 51, 0.20)';
export const HEADER_SHADOW = '0 8px 13.6px 0 rgba(0, 0, 0, 0.25)';
export const HEADER_BLUR = 'blur(10px)';

// Section headings ("ТВОИ НАВЫКИ", "СТАТИСТИКА ПЛОЩАДКИ", ...) and the big
// stat-card numbers are consistently 0.2em letter-spacing in the source
// file (6.4px/32px, 3.6px/18px, 2.8px/14px, 8px/40px all reduce to the same
// ratio) — one constant instead of a per-size px value.
export const TRACK_WIDE = '0.2em';

// Fonts — Montserrat for headings/logo/nav, Geist for body/lectures/
// instructions, confirmed by the kit (matches what was already wired into
// tailwind.config.js's `font-montserrat`/`font-geist`, nothing to add here).

// ── Contrast ──────────────────────────────────────────────────────────────
//
// Half the badges in the app paint a label over a fill tinted with a colour
// nobody reviewed: a role's hue, a course author's pick, a tester's own accent
// colour. Hardcoding the label near-black — which is what every one of them
// did — only works while the fill stays bright. The admin badge is dark red at
// 60% over the page, which composites to #8B3638, and near-black on that is
// 2.4:1: a word you can see is there and cannot read.
//
// The two functions below answer the only question those call sites actually
// have. blendOver() says what colour the browser really ends up painting, and
// readableTextOn() picks a neutral that survives it.

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1];
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}

// Relative luminance, sRGB, per WCAG. An unparseable colour scores as black,
// which on this app's near-black page is the safe way to be wrong.
export function relativeLuminance(hex: string): number {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

// What `hex` at `alpha` actually looks like once the page shows through it.
// "#EF9F27" is a light amber; "#EF9F2766" over the page is a dark brown, and
// it is the brown a label has to be legible against.
export function blendOver(hex: string, alpha: number, backdrop: string = PAGE_BG): string {
  const fg = toRgb(hex);
  const bg = toRgb(backdrop);
  if (!fg || !bg) return backdrop;
  const a = Math.min(1, Math.max(0, alpha));
  return `#${[0, 1, 2]
    .map(i => Math.round(fg[i] * a + bg[i] * (1 - a)).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The label is always neutral — a grey, white, or near-black — so the hue
// stays in the fill and the outline, where it costs nobody the word.
//
// Order is the whole design of this ramp. The palette's own two text colours
// come first, so any surface that already read well keeps exactly the label it
// has today and nothing churns; the brighter and darker neutrals are reached
// only where those two both fall short. Both directions stay in one list
// rather than being chosen up front, because a mid-luminance fill — the role
// badge's amber at 60%, say — is the case where the better-looking direction
// still misses and only the other one clears.
const TEXT_RAMP = [TEXT_PRIMARY, PAGE_BG, '#E6E7E8', '#FFFFFF', '#000000'];

// WCAG AA for body text is 4.5:1. Badge and chip labels run 10-12px in
// letterspaced caps, which is where that floor stops being comfortable, so the
// ramp aims a step above it and takes the next neutral up rather than sitting
// on the line. Where nothing clears it — a mid grey has no good answer — the
// best of the five wins.
const MIN_CONTRAST = 5;

export function readableTextOn(background: string): string {
  let best = TEXT_PRIMARY;
  let bestRatio = 0;
  for (const candidate of TEXT_RAMP) {
    const ratio = contrastRatio(candidate, background);
    if (ratio >= MIN_CONTRAST) return candidate;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }
  return best;
}

// ── Type scale ────────────────────────────────────────────────────────────
//
// The kit's ladder — H1, H2, H3, SMALL, BODY, LINK — as style objects rather
// than as a set of numbers each page re-types. Before this, a page heading
// was 28px on one screen, 32px on another and 20px bold on a third, and
// "second-level heading" had four different sizes across the app depending
// on who wrote the page.
//
// Headings are Montserrat and wide-tracked; body is Geist and is not. SMALL
// is the uppercase label the kit uses for section captions and metadata —
// tracked like a heading, sized like a caption.
//
// Spread these into `style`, not merged into className: several of them set
// letterSpacing and lineHeight, which Tailwind would need three utilities
// each to express and which would then be tuned per call site anyway.
export const H1: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif', fontSize: 32, fontWeight: 600,
  lineHeight: '40px', letterSpacing: '6.4px', color: '#E0E0E0',
};
export const H2: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif', fontSize: 24, fontWeight: 600,
  lineHeight: '32px', letterSpacing: '4.8px', color: TEXT_PRIMARY,
};
export const H3: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif', fontSize: 20, fontWeight: 600,
  lineHeight: '28px', letterSpacing: '4px', color: TEXT_PRIMARY,
};
// A heading inside a card, under that card's own heading.
export const H4: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif', fontSize: 16, fontWeight: 600,
  lineHeight: '22px', letterSpacing: '2px', color: TEXT_PRIMARY,
};
export const SMALL: React.CSSProperties = {
  fontFamily: 'Geist, system-ui, sans-serif', fontSize: 12, fontWeight: 500,
  lineHeight: '16px', letterSpacing: TRACK_WIDE, color: TEXT_MUTED,
};
export const BODY: React.CSSProperties = {
  fontFamily: 'Geist, system-ui, sans-serif', fontSize: 14, fontWeight: 400,
  lineHeight: 1.6, color: TEXT_PRIMARY,
};
export const LINK: React.CSSProperties = {
  fontFamily: 'Geist, system-ui, sans-serif', fontSize: 14, fontWeight: 500,
  lineHeight: 1.6, color: ACCENT,
};
