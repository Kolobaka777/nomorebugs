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
export const ACCENT_BORDER = 'rgba(102, 252, 241, 0.4)';

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
export const ERROR_DIM = 'rgba(224, 82, 82, 0.1)';
export const ERROR_BORDER = 'rgba(224, 82, 82, 0.4)';
export const SUCCESS = '#4ADE80';
export const WARNING = BADGE_NOTIFY;
export const INFO = '#7F77DD';   // the "rare"/epic tier and the idea-board's own hue
export const TELEGRAM = '#229ED9';

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

// Figma's Inspect panel gave both the results-card and skill-stat-card
// backgrounds as a repeating image tile over #1F2833 ("background:
// url(<path-to-image>) lightgray 0% 0% / 12.75px 12.75px repeat, #1F2833")
// — Figma shows that exact placeholder (always the same 12.75px value) when
// a fill references a local image that was never exported, so that number
// isn't meaningful; the tile size is picked to visually match the user's
// reference screenshot instead. The user supplied the real source asset
// (client/src/assets/bug-texture.png, from her design files' buggground.png
// — 4 pixel-art bugs in a 2x2 sheet) directly — an earlier pass hand-drew an
// approximation instead and got corrected; this uses her actual file.
//
// It's pre-processed offline rather than at runtime, so the card only needs
// a plain low-cost background-image. Two corrections so far:
//   1) an initial pass left the ink nearly invisible/too faint at a 90px
//      tile — bumped alpha 16% → 45%;
//   2) that 45% pass then turned out to have the source's alpha/RGB encoding
//      backwards: the whole 592x592 sheet carried one uniform low alpha
//      (~10%) and the bug *silhouettes* were the lighter RGB values against
//      a black fill — composited over the dark card that reads as light
//      bugs on a dark card, the opposite of the mockup's dark-on-dark look,
//      and at a 120px tile they read as oversized. Reprocessed to flip
//      that: background pixels → fully transparent, ink pixels → solid
//      black scaled to a max ~16% alpha (so composited over #1F2833 it
//      lands only a few percent darker — a subtle emboss, not a stamp),
//      and shrunk the tile 120px → 64px to match the mockup's denser,
//      smaller repeat. See PROGRESS notes if it ever needs reprocessing
//      from a fresh export.
export const CARD_BG_PATTERN = `url("${bugTextureUrl}") 0 0/64px 64px repeat, ${CARD_BG}`;

// One-off label color from the "СТАТИСТИКА ПЛОЩАДКИ" stat-card spec — close
// to but distinct from TEXT_PRIMARY/TEXT_MUTED, so it's its own token rather
// than overloading either of those roles.
export const STAT_LABEL_COLOR = '#E0E0E0';

// Bottom "СТАТИСТИКА ПЛОЩАДКИ" cards — a teal-to-transparent wash rather
// than a flat/patterned fill.
export const STAT_GRADIENT = 'linear-gradient(0deg, rgba(69, 162, 158, 0.23) 0%, rgba(11, 12, 16, 0.00) 100%)';
export const STAT_SHADOW = '0 4px 12px 0 rgba(0, 0, 0, 0.25)';

// The kit's generic "outlined box on page background" treatment — distinct
// from CARD_BG_PATTERN (which is for #1F2833 surfaces like list rows).
// Not wired into any element yet since no current screen calls for it
// (the kit showed it as an unlabeled placeholder rect); available for
// inputs/callouts/dialogs when a future mockup needs it.
export const BORDERED_BOX_BG = `linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.20) 100%), ${PAGE_BG}`;
export const BORDERED_BOX_BORDER = `1px solid ${ACCENT}`;
export const BORDERED_BOX_RADIUS = 8;

// Floating glass header (frosted rounded bar, not a full-bleed solid header).
export const HEADER_BG = 'rgba(31, 40, 51, 0.20)';
export const HEADER_SHADOW = '0 8px 13.6px 0 rgba(0, 0, 0, 0.25)';
export const HEADER_BLUR = 'blur(10px)';

// Role badge ("TESTER" pill) — filled, not just a bordered outline.
export const BADGE_BG = 'rgba(102, 252, 241, 0.60)';
export const BADGE_BORDER = 'rgba(102, 252, 241, 0.80)';

// Section headings ("ТВОИ НАВЫКИ", "СТАТИСТИКА ПЛОЩАДКИ", ...) and the big
// stat-card numbers are consistently 0.2em letter-spacing in the source
// file (6.4px/32px, 3.6px/18px, 2.8px/14px, 8px/40px all reduce to the same
// ratio) — one constant instead of a per-size px value.
export const TRACK_WIDE = '0.2em';

// Fonts — Montserrat for headings/logo/nav, Geist for body/lectures/
// instructions, confirmed by the kit (matches what was already wired into
// tailwind.config.js's `font-montserrat`/`font-geist`, nothing to add here).
