# Icon kit reference

Source: the user's Figma "Logos/favicons" kit, exported to
`C:\Users\user\Desktop\Projects\ttst\images\Logos` and organized here into
`client/src/assets/icons/` with clean kebab-case filenames (originals had
spaces, typos, and cryptic numeric names — see "Renamed from" column).
All are inline-color SVGs (mostly `#66FCF1`/`#8AFFF5` stroke, 24x24 unless
noted) — import directly as a URL (`import x from '.../icons/name.svg'`)
or inline the markup like `QuickLinkIcons.tsx` does when a component needs
a configurable stroke color.

**How to use this file**: when the user pastes a new mockup screenshot,
check its icons against the "Looks like" column below before assuming an
icon needs to be hand-drawn or pulled from the old 8x8 PixelIcon set —
this kit is the higher-fidelity, first-choice source for any redesigned
page.

## Navigation / UI glyphs

| File | Looks like | Renamed from |
|---|---|---|
| `arrow-right.svg` | straight → arrow | `Arrow_right_long.svg` |
| `triangle-right.svg` | solid ▶ triangle (play/expand) | `Arrow_drop_right.svg` |
| `chevron-right.svg` | › chevron | `Expand_right.svg` |
| `chevron-right-double.svg` | ›› double chevron (fast-forward) | `Expand_right_double.svg` |
| `chevron-down.svg` | ⌄ chevron | `Expand_down.svg` |
| `link-arrow.svg` | ^ upward caret/chevron | `Link to.svg` |
| `plus.svg` | + in a soft square | `Add_round.svg` |
| `close.svg` | × | `Close_round.svg` |
| `check.svg` | single ✓ | `Done_round.svg` |
| `check-circle.svg` | ✓ inside a ring | `Done_ring_round.svg` |
| `check-double.svg` | ✓✓ (read-receipt style) | `Done_all_round.svg` |
| `search.svg` | magnifying glass | `Search.svg` |
| `spinner.svg` | 8-tick loading wheel, faded trail | merged from 8 `Frame 119XX[-1].svg` fragments — see note below |

**`spinner.svg` note**: the kit exported this as 8 separate tiny fragment
files (one per tick position: N/S, E/W, NE/SW, NW/SE — each fragment held
one axis's two opposing ticks). Combined them into one static 24x24 glyph
with the same tick geometry/opacity fade rather than shipping 8 files;
wrap it in a CSS `rotate` animation if an actual spinning loader is
needed. The 8 originals were discarded per the user's instruction to
merge multi-frame icons into one and drop the pieces.

## Content / functional icons

| File | Looks like | Renamed from |
|---|---|---|
| `book-open.svg` | open book, rounded | `Book_open.svg` |
| `book-open-alt.svg` | open book, squarer | `Book_open_alt.svg` |
| `graduation-cap.svg` | mortarboard | `Mortarboard.svg` |
| `graduation-cap-alt.svg` | mortarboard, alt style | `Mortarboard_alt.svg` |
| `clipboard-lines.svg` | clipboard with text lines | `Desk_alt.svg` (misnamed in source) |
| `document-lines.svg` | page with list lines | `Order.svg` |
| `receipt.svg` | torn-edge receipt/ticket | `Paper.svg` |
| `notebook.svg` | spiral notebook | `notebook.svg` |
| `edit-pencil.svg` | pencil | `Edit.svg` |
| `folder-add.svg` | folder with + | `folder-add.svg` |
| `trash.svg` | trash can | `Trash.svg` |
| `chart-bars.svg` | bar chart in rounded square | `Chart.svg` |
| `chart-line.svg` | trending-up line chart | `Chart_alt.svg` |
| `sliders.svg` | 2 vertical adjustment sliders | `candlestick.svg` (misnamed in source) |
| `org-chart.svg` | branching node diagram | `Subttasks.svg` (typo fixed) |
| `package-3d.svg` | isometric cube/box | `package.svg` |
| `package-doc.svg` | page with small box | `package_box_alt.svg` |
| `atom.svg` | atom/orbit | `Atom.svg` |
| `chemistry.svg` | hexagon molecule cluster | `Chemistry.svg` |
| `flask.svg` | conical (Erlenmeyer) flask | `Flask_alt.svg` |
| `test-tube.svg` | vial/test tube | `Flask.svg` (name swapped — original was misleading) |
| `cpu.svg` | chip with pins | `CPU.svg` |
| `bug.svg` | ladybug/beetle | `Bug.svg` |
| `fire.svg` | flame | `Fire.svg` |
| `lightbulb.svg` | lightbulb | `Lamp.svg` |
| `lightning-circle.svg` | bolt inside a ring | `lightning_ring.svg` |
| `star.svg` | 5-point star, glow | `Star 1.svg` |
| `medal-ribbon.svg` | ribbon/award badge | `Roll_alt.svg` |
| `shield-check.svg` | shield with ✓ | `Chield_check.svg` (typo fixed) |
| `lock.svg` | padlock | `Lock.svg` |
| `glasses.svg` | glasses | `Glasses.svg` |
| `info-circle.svg` | i inside a ring | `Info.svg` |
| `home.svg` | house | `Home.svg` — same icon already used for "Моё болото" in `QuickLinkIcons.tsx` |
| `user.svg` | single person | `User_alt.svg` |
| `people-group.svg` | 3 overlapping people | `Group.svg` |

## Mascot — frog (vector, brand accent color)

Five jump/pose variants, same character as the nav logo's frog and
`FrogIcon.tsx`'s hero silhouette — pick whichever pose best fits a given
layout when a mockup calls for the frog mascot in a new spot.

`frog-pose-1.svg` · `frog-pose-2.svg` · `frog-pose-3.svg` ·
`frog-pose-4.svg` · `frog-pose-5.svg`

