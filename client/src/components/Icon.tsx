// Drop-in replacement for PixelIcon.tsx with the exact same prop API
// (name/size/color/color2/className/style), so any file can switch from
// the old 8x8 pixel-grid icons to these clean line icons just by changing
// the import — no call-site changes needed. Paths are sourced from the
// user's real Figma icon-kit export (client/src/assets/icons/*.svg, see
// ICONS.md) wherever a kit file exists for the concept, converted from a
// fixed '#66FCF1' stroke/fill to the `color` prop so every existing call
// site's custom colors (status/rarity/theme) keep working unchanged. Kit
// coverage doesn't include every PixelIcon concept (crown/bee/snail/
// warning/gear/globe/seedling/antenna/camera/wrench/phone/pin/palette/
// microscope/beehive/target/calendar) — those are hand-drawn to match the
// kit's visual language (24x24, 2px stroke, rounded caps/joins) instead.
//
// Note: the kit's own `bug.svg` file is mislabeled — it actually contains
// a flask/chemistry-vessel shape (identical family to flask.svg/
// test-tube.svg), not a ladybug, despite ICONS.md's claim otherwise. The
// 'bug' icon below is hand-drawn for real; HomePage's stats-row bug icon
// (previously importing the mislabeled bug.svg as a static image) was
// switched to use this component instead — see HomePage.tsx.
import React from 'react';

export type IconName =
  | 'bug' | 'crown' | 'bee' | 'snail' | 'warning' | 'lightbulb'
  | 'lock' | 'clipboard' | 'barchart' | 'floppy' | 'books' | 'user'
  | 'search' | 'sparkle' | 'pencil' | 'calendar' | 'trophy' | 'rocket'
  | 'gear' | 'globe' | 'graduation' | 'check' | 'lightning' | 'card'
  | 'seedling' | 'chartup' | 'construction' | 'memo' | 'antenna'
  | 'camera' | 'star' | 'wrench' | 'phone' | 'pin' | 'palette'
  | 'microscope' | 'beehive' | 'target'
  // ── Navigation/UI glyphs (chevron-*.svg, arrow-right.svg, close.svg from
  // the kit — chevron-left/up mirror the kit's right/down path data, the
  // kit doesn't export those two directions separately) — the app-wide
  // "unify every arrow/close glyph to one icon set" pass introduced these,
  // replacing raw ›‹→←▼▲»« and ×/✕ characters everywhere they acted as a
  // UI control (not prose).
  | 'chevronRight' | 'chevronLeft' | 'chevronDown' | 'chevronUp'
  | 'arrowRight' | 'close'
  // ── Added when the restyle pass hit real gaps (delete/reset-password/
  // archive/restore actions were still falling back to raw emoji) —
  // 'trash' is real kit path data (trash.svg); 'key'/'archive'/'undo' are
  // hand-drawn to match (24x24, 2px stroke), no kit source exists for them.
  | 'trash' | 'key' | 'archive' | 'undo' | 'clock'
  // The mascot. 'frogEgg'/'tadpole' lived here too, as the lower rungs of
  // a level ladder that no longer exists (see types.ts).
  | 'frog';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  color2?: string;
  className?: string;
  style?: React.CSSProperties;
}

// Each renderer draws its glyph at the native 24x24 kit grid; the outer
// <svg> below scales via viewBox, so `size` just sets the rendered box.
const RENDERERS: Record<IconName, (color: string, color2: string) => React.ReactNode> = {
  // ── From the real kit (client/src/assets/icons/*.svg) ──────────────────
  lightbulb: (c) => <>
    <path d="M13.7891 20.1055C12.9446 20.5278 11.9501 20.5278 11.1056 20.1055C10.5237 19.8146 10.1017 19.2385 9.99753 18.5722C9.90064 17.9527 9.6231 16.9525 8.91546 15.9503C7.4 13.8 6 12 6 9.5C6 6.46243 8.46243 4 11.5 4H12.5C15.5376 4 18 6.46243 18 9.5C18 12 16.6 13.8 15.0845 15.9503C14.3769 16.9525 14.0994 17.9527 14.0025 18.5722C13.8983 19.2385 13.4763 19.8146 12.8944 20.1055" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M14.9923 16C13.1812 17.2106 10.8191 17.2106 9.00806 16" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  lock: (c) => <>
    <path d="M4 13C4 11.1144 4 10.1716 4.58579 9.58579C5.17157 9 6.11438 9 8 9H16C17.8856 9 18.8284 9 19.4142 9.58579C20 10.1716 20 11.1144 20 13V15C20 17.8284 20 19.2426 19.1213 20.1213C18.2426 21 16.8284 21 14 21H10C7.17157 21 5.75736 21 4.87868 20.1213C4 19.2426 4 17.8284 4 15V13Z" stroke={c} strokeWidth="2" />
    <path d="M16 8V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V8" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="15" r="2" fill={c} />
  </>,
  clipboard: (c) => <>
    <path d="M15.5 5C16.9045 5 17.6067 5 18.1111 5.33706C18.3295 5.48298 18.517 5.67048 18.6629 5.88886C19 6.39331 19 7.09554 19 8.5V18C19 19.8856 19 20.8284 18.4142 21.4142C17.8284 22 16.8856 22 15 22H9C7.11438 22 6.17157 22 5.58579 21.4142C5 20.8284 5 19.8856 5 18V8.5C5 7.09554 5 6.39331 5.33706 5.88886C5.48298 5.67048 5.67048 5.48298 5.88886 5.33706C6.39331 5 7.09554 5 8.5 5" stroke={c} strokeWidth="2" />
    <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5C15 6.10457 14.1046 7 13 7H11C9.89543 7 9 6.10457 9 5Z" stroke={c} strokeWidth="2" />
    <path d="M9 12L15 12" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M9 16L13 16" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  barchart: (c) => <>
    <path d="M8 10L8 16" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 12V16" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 8V16" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="3" y="4" width="18" height="16" rx="2" stroke={c} strokeWidth="2" />
  </>,
  // package-3d — repurposed for "коллекция"/save concept rather than a
  // literal floppy disk, which reads as anachronistic in this app's style.
  floppy: (c) => <>
    <path d="M12 21V13M20 8L13.06 3.6625C12.5445 3.34033 12.2868 3.17925 12 3.17925C11.7132 3.17925 11.4555 3.34033 10.94 3.6625L4 8V14.8915C4 15.4334 4 15.7043 4.12536 15.9305C4.25072 16.1567 4.48048 16.3003 4.94 16.5875L12 21L16 18.5L19.06 16.5875C19.5195 16.3003 19.7493 16.1567 19.8746 15.9305C20 15.7043 20 15.4334 20 14.8915V8ZM12 13L4 8M12 13L20 8" stroke={c} strokeWidth="2" strokeLinejoin="round" />
  </>,
  books: (c) => <>
    <path d="M5 17H9C10.6569 17 12 18.3431 12 20V10C12 7.17157 12 5.75736 11.1213 4.87868C10.2426 4 8.82843 4 6 4H5C4.05719 4 3.58579 4 3.29289 4.29289C3 4.58579 3 5.05719 3 6V15C3 15.9428 3 16.4142 3.29289 16.7071C3.58579 17 4.05719 17 5 17Z" stroke={c} strokeWidth="2" />
    <path d="M19 17H15C13.3431 17 12 18.3431 12 20V10C12 7.17157 12 5.75736 12.8787 4.87868C13.7574 4 15.1716 4 18 4H19C19.9428 4 20.4142 4 20.7071 4.29289C21 4.58579 21 5.05719 21 6V15C21 15.9428 21 16.4142 20.7071 16.7071C20.4142 17 19.9428 17 19 17Z" stroke={c} strokeWidth="2" />
  </>,
  user: (c) => <>
    <circle cx="12" cy="7" r="4" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M5.33788 18.3206C5.99897 15.5269 8.77173 14 11.6426 14H12.3574C15.2283 14 18.001 15.5269 18.6621 18.3206C18.79 18.8611 18.8917 19.4268 18.9489 20.0016C19.0036 20.5512 18.5523 21 18 21H6C5.44772 21 4.99642 20.5512 5.0511 20.0016C5.1083 19.4268 5.20997 18.8611 5.33788 18.3206Z" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  search: (c) => <>
    <circle cx="11" cy="11" r="7" stroke={c} strokeWidth="2" />
    <path d="M20 20L17 17" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  // plus.svg — repurposed as "sparkle" (create/new), matches how this app
  // actually uses the sparkle glyph (always a "create X" button).
  sparkle: (c) => <>
    <path d="M12 6L12 18" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M18 12L6 12" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  pencil: (c) => <>
    <path d="M15.1875 5.42383C15.6118 5.46926 15.9499 5.66401 16.2188 5.86914C16.503 6.08603 16.8078 6.39374 17.1211 6.70703L17.293 6.87891C17.6063 7.1922 17.914 7.49698 18.1309 7.78125C18.3653 8.08862 18.5859 8.48644 18.5859 9C18.5859 9.51356 18.3653 9.91138 18.1309 10.2188C17.914 10.503 17.6063 10.8078 17.293 11.1211L10.0986 18.3154C9.94157 18.4725 9.73819 18.6886 9.47461 18.8379C9.21089 18.9872 8.92063 19.0506 8.70508 19.1045L6.09668 19.7559L6.05078 19.7676C5.90293 19.8045 5.68156 19.8628 5.4873 19.8818C5.28061 19.9021 4.82874 19.9088 4.45996 19.54C4.09118 19.1713 4.09794 18.7194 4.11816 18.5127C4.13719 18.3184 4.19546 18.0971 4.23242 17.9492L4.89551 15.2949C4.9494 15.0794 5.0128 14.7891 5.16211 14.5254C5.31138 14.2618 5.5275 14.0584 5.68457 13.9014L12.8789 6.70703C13.1922 6.39374 13.497 6.08603 13.7812 5.86914C14.0886 5.63466 14.4864 5.41406 15 5.41406L15.1875 5.42383Z" stroke={c} strokeWidth="2" />
    <path d="M12.5 7.5L15.5 5.5L18.5 8.5L16.5 11.5L12.5 7.5Z" fill={c} />
  </>,
  trophy: (c) => <>
    <path d="M5 6C5.7099 6 6.09976 6.55148 6.25 6.80566C6.43976 7.12673 6.57667 7.52452 6.67773 7.92871C6.88372 8.75267 7 9.8383 7 11C7 12.1617 6.88372 13.2473 6.67773 14.0713C6.57667 14.4755 6.43976 14.8733 6.25 15.1943C6.09976 15.4485 5.7099 16 5 16C4.2901 16 3.90024 15.4485 3.75 15.1943C3.56024 14.8733 3.42333 14.4755 3.32227 14.0713C3.11628 13.2473 3 12.1617 3 11C3 9.8383 3.11628 8.75267 3.32227 7.92871C3.42333 7.52452 3.56024 7.12673 3.75 6.80566C3.90024 6.55148 4.2901 6 5 6Z" stroke={c} strokeWidth="2" />
    <path d="M19 16C19.6929 16 20.0822 15.4718 20.2388 15.2122C20.4321 14.892 20.5722 14.491 20.6772 14.071C20.8904 13.2183 21 12.1147 21 11C21 9.88534 20.8904 8.78169 20.6772 7.92904C20.5722 7.509 20.4321 7.10805 20.2388 6.78775C20.0822 6.52818 19.6929 6 19 6" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M19 6C19 6 15.9375 7 12 7C8.0625 7 5 6 5 6" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M5 16C5 16 6.44135 15.2356 9.5 15M19 16C19 16 17.5587 15.2356 14.5 15" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M10 8V10M14 8V10" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="13" r="3" stroke={c} strokeWidth="2" />
    <path d="M9.5 15L6 18L8 18.5L9.5 20L12 16L14.5 20L16 18.5L18 18L14.5 15" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  // flask.svg — repurposed for "rocket" (start/begin a lecture); matches
  // the app's own established "🧪 start" motif on course-detail CTAs.
  rocket: (c) => <>
    <path d="M15 5V11.6972C15 11.8946 15.0584 12.0877 15.1679 12.2519L19.9635 19.4453C20.4066 20.1099 19.9302 21 19.1315 21H4.86852C4.06982 21 3.59343 20.1099 4.03647 19.4453L8.83205 12.2519C8.94156 12.0877 9 11.8946 9 11.6972V5" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M16.9 18.2L14.8 15.4C14.6111 15.1482 14.3148 15 14 15H10C9.68524 15 9.38885 15.1482 9.2 15.4L7.1 18.2C6.85279 18.5296 7.08798 19 7.5 19H16.5C16.912 19 17.1472 18.5296 16.9 18.2Z" fill={c} />
    <path d="M7 5H17" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  graduation: (c) => <>
    <path d="M4 10L12 6L20 10L12 14L4 10Z" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 10V14" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 12V17C7 17 7.45455 19 12 19C16.5455 19 17 17 17 17V12" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  check: (c) => <path d="M5 14L8.23309 16.4248C8.66178 16.7463 9.26772 16.6728 9.60705 16.2581L18 6" stroke={c} strokeWidth="2" strokeLinecap="round" />,
  lightning: (c) => <>
    <path d="M11.5 13.8H10.4367C8.90773 13.8 8.14327 13.8 7.85403 13.303C7.56479 12.806 7.94244 12.1413 8.69774 10.812L11.0653 6.64512C11.4403 5.98516 11.6277 5.65517 11.8139 5.70436C12 5.75354 12 6.13307 12 6.89213V9.7C12 9.9357 12 10.0536 12.0732 10.1268C12.1464 10.2 12.2643 10.2 12.5 10.2H13.5633C15.0923 10.2 15.8567 10.2 16.146 10.697C16.4352 11.194 16.0576 11.8587 15.3023 13.188L12.9347 17.3549C12.5597 18.0148 12.3723 18.3448 12.1861 18.2956C12 18.2465 12 17.8669 12 17.1079V14.3C12 14.0643 12 13.9464 11.9268 13.8732C11.8536 13.8 11.7357 13.8 11.5 13.8Z" fill={c} />
    <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="2" />
  </>,
  // receipt.svg — repurposed for "card" (trading-card/ticket concept).
  card: (c) => <>
    <path d="M15 9L20.1429 9C20.477 9 20.644 9 20.766 8.92336C20.8296 8.8834 20.8834 8.82962 20.9234 8.76602C21 8.64405 21 8.47698 21 8.14286L21 6.00001C21 4.34315 19.6569 3.00001 18 3.00001L7 3.00001C5.11438 3.00001 4.17157 3.00001 3.58579 3.58579C3 4.17158 3 5.11439 3 7.00001L3 21L6 20L9 21L12 20L15 21L15 9ZM18 3.00001C16.3431 3.00001 15 4.34315 15 6.00001L15 9" stroke={c} strokeWidth="2" />
    <path d="M7 7L11 7" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M8 11H7" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M7 15L10 15" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  chartup: (c) => <>
    <path d="M17 9L13.9558 13.5662C13.5299 14.2051 12.5728 14.1455 12.2294 13.4587L11.7706 12.5413C11.4272 11.8545 10.4701 11.7949 10.0442 12.4338L7 17" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="3" y="3" width="18" height="18" rx="2" stroke={c} strokeWidth="2" />
  </>,
  // test-tube.svg — repurposed for "construction" ("материал ещё
  // готовится" — reads as "still in the lab").
  construction: (c) => <>
    <path d="M15 9C15 9 15 14.24 15 18.0004C15 19.6573 13.6569 21 12 21C10.3431 21 9 19.6569 9 18V9" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M7 9H17" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 18V15.0548C13 15.0245 12.9755 15 12.9452 15H11.0548C11.0245 15 11 15.0245 11 15.0548V18C11 18.5523 11.4477 19 12 19C12.5523 19 13 18.5523 13 18Z" fill={c} />
    <circle cx="15" cy="4" r="1" fill={c} />
    <circle cx="8.5" cy="5.5" r="1" fill={c} />
  </>,
  memo: (c) => <>
    <rect x="6" y="4" width="13" height="17" rx="2" stroke={c} strokeWidth="2" />
    <path d="M15 10V8" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M4 9H8" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M4 13H8" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M4 17H8" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  star: (c) => <path d="M7.25693 5.21184C7.05552 4.26429 8.1843 3.61259 8.90421 4.26079L11.4764 6.57678C11.7983 6.86667 12.2703 6.91628 12.6455 6.69966L15.643 4.96906C16.4819 4.4847 17.4506 5.35685 17.0565 6.24183L15.6487 9.40379C15.4725 9.79956 15.5712 10.2638 15.8932 10.5537L18.4653 12.8697C19.1852 13.5179 18.6551 14.7086 17.6917 14.6073L14.2494 14.2455C13.8186 14.2003 13.4076 14.4376 13.2314 14.8333L11.8236 17.9953C11.4295 18.8803 10.1333 18.744 9.93187 17.7965L9.21225 14.4109C9.12217 13.9871 8.76948 13.6696 8.33863 13.6243L4.89639 13.2625C3.93297 13.1612 3.66198 11.8863 4.50092 11.4019L7.4984 9.67135C7.87359 9.45473 8.06662 9.02117 7.97655 8.59741L7.25693 5.21184Z" fill={c} />,

  // ── Hand-drawn to match the kit's visual language (24x24, 2px stroke) ──
  bug: (c) => <>
    <ellipse cx="12" cy="13" rx="5" ry="6.5" stroke={c} strokeWidth="2" />
    <path d="M12 7.5V19.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M14.5 6L16.5 4" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M9.5 6L7.5 4" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M7 10L4 9" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M7 13.5L4 13.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M7 17L4 18" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M17 10L20 9" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M17 13.5L20 13.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M17 17L20 18" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  crown: (c) => <>
    <path d="M4 18H20" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M4 18L3 9L8.5 13L12 6L15.5 13L21 9L20 18" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  bee: (c, c2) => <>
    <ellipse cx="12" cy="13" rx="4" ry="5.5" stroke={c} strokeWidth="2" />
    <path d="M8.5 10.5H15.5" stroke={c} strokeWidth="2" />
    <path d="M8.2 15H15.8" stroke={c} strokeWidth="2" />
    <path d="M9 8L6 5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M15 8L18 5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="6.5" cy="10" rx="3" ry="2" transform="rotate(-25 6.5 10)" stroke={c2} strokeWidth="1.5" />
    <ellipse cx="17.5" cy="10" rx="3" ry="2" transform="rotate(25 17.5 10)" stroke={c2} strokeWidth="1.5" />
  </>,
  snail: (c) => <>
    <path d="M9.5 10.5C9.5 8.567 11.067 7 13 7C14.933 7 16.5 8.567 16.5 10.5C16.5 12.433 14.933 14 13 14H11.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12.5" cy="10.5" r="2" stroke={c} strokeWidth="1.5" />
    <path d="M2 18C2 15.7909 4.68629 14 8 14C11.3137 14 14 15.7909 14 18C14 18 11 18 8 18C5 18 2 18 2 18Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M14 17L21 17" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M5 8L4 5.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M7.5 8L7 5.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  // The mascot, hand-drawn to match the kit's 24x24/2px-stroke language
  // (no kit source for it). See PixelAvatar.tsx for the pixel-art version.
  frog: (c) => <>
    <circle cx="8.3" cy="7" r="2.2" stroke={c} strokeWidth="2" />
    <circle cx="15.7" cy="7" r="2.2" stroke={c} strokeWidth="2" />
    <circle cx="8.3" cy="7" r="0.6" fill={c} />
    <circle cx="15.7" cy="7" r="0.6" fill={c} />
    <path d="M4 14.2C4 10.7 7.5 9.2 12 9.2C16.5 9.2 20 10.7 20 14.2C20 18.1 16.5 20 12 20C7.5 20 4 18.1 4 14.2Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
  </>,
  warning: (c) => <>
    <path d="M10.4384 4.44715L2.99049 17.9999C2.62933 18.6666 3.11288 19.5 3.87206 19.5H20.1279C20.8871 19.5 21.3707 18.6666 21.0095 17.9999L13.5616 4.44715C13.1852 3.75237 12.1791 3.75237 11.8027 4.44715H10.4384Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M12 10V13.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16.3" r="1" fill={c} />
  </>,
  calendar: (c) => <>
    <rect x="4" y="5" width="16" height="16" rx="2" stroke={c} strokeWidth="2" />
    <path d="M4 10H20" stroke={c} strokeWidth="2" />
    <path d="M8 3V6.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M16 3V6.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  gear: (c) => <>
    <path d="M4 9L8 6.5L16 6.5L20 9L20 15L16 17.5L8 17.5L4 15Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="2" />
  </>,
  globe: (c) => <>
    <circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="2" />
    <ellipse cx="12" cy="12" rx="3.5" ry="8.5" stroke={c} strokeWidth="1.5" />
    <path d="M3.5 12H20.5" stroke={c} strokeWidth="1.5" />
    <path d="M4.7 8H19.3" stroke={c} strokeWidth="1.5" />
    <path d="M4.7 16H19.3" stroke={c} strokeWidth="1.5" />
  </>,
  seedling: (c) => <>
    <path d="M12 21V13" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M12 13C12 13 6 13 6 7C12 7 12 13 12 13Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M12 10C12 10 18 10 18 5C13 5 12 10 12 10Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M6 21H18" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  antenna: (c) => <>
    <path d="M12 21V11" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="9" r="2" fill={c} />
    <path d="M8.5 12C7 10.6 7 6.9 8.5 5.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M15.5 12C17 10.6 17 6.9 15.5 5.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M6 14.5C3.5 12 3.5 6.5 6 4" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M18 14.5C20.5 12 20.5 6.5 18 4" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  camera: (c) => <>
    <path d="M3 9.5C3 8.09554 3 7.39331 3.33706 6.88886C3.48298 6.67048 3.67048 6.48298 3.88886 6.33706C4.39331 6 5.09554 6 6.5 6H7.5L8.5 4H15.5L16.5 6H17.5C18.9045 6 19.6067 6 20.1111 6.33706C20.3295 6.48298 20.517 6.67048 20.6629 6.88886C21 7.39331 21 8.09554 21 9.5V15.5C21 16.9045 21 17.6067 20.6629 18.1111C20.517 18.3295 20.3295 18.517 20.1111 18.6629C19.6067 19 18.9045 19 17.5 19H6.5C5.09554 19 4.39331 19 3.88886 18.6629C3.67048 18.517 3.48298 18.3295 3.33706 18.1111C3 17.6067 3 16.9045 3 15.5V9.5Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="12.5" r="3.5" stroke={c} strokeWidth="2" />
  </>,
  wrench: (c) => <>
    <path d="M14.5 5.5C15.9 4.1 18 4 19.5 5C19.9 5.25 19.9 5.8 19.55 6.15L17 8.7L18 10L20.55 7.45C20.9 7.1 21.45 7.1 21.7 7.5C22.7 9 22.6 11.1 21.2 12.5C19.9 13.8 18 14 16.5 13.2L8.5 21.2C7.7 22 6.4 22 5.6 21.2C4.8 20.4 4.8 19.1 5.6 18.3L13.6 10.3C12.8 8.8 13 6.9 14.3 5.6L14.5 5.5Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
  </>,
  phone: (c) => <>
    <rect x="7" y="3" width="10" height="18" rx="2" stroke={c} strokeWidth="2" />
    <path d="M11 18H13" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  pin: (c) => <>
    <path d="M12 21C12 21 18 15.5 18 10.5C18 7.18629 15.3137 4.5 12 4.5C8.68629 4.5 6 7.18629 6 10.5C6 15.5 12 21 12 21Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="10.3" r="2.3" stroke={c} strokeWidth="2" />
  </>,
  palette: (c, c2) => <>
    <path d="M12 3C7 3 3 6.8 3 11.5C3 14.5 5.5 16 7.5 16H8.5C9.6 16 10 16.8 10 17.5C10 18.5 9.3 19 9.3 19.7C9.3 20.5 10.1 21 12 21C17 21 21 17 21 12C21 7 17 3 12 3Z" stroke={c} strokeWidth="2" />
    <circle cx="7.7" cy="10.5" r="1.3" fill={c2} />
    <circle cx="12" cy="7.5" r="1.3" fill={c2} />
    <circle cx="16.3" cy="10.5" r="1.3" fill={c2} />
  </>,
  microscope: (c) => <>
    <path d="M5 21H16" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M9 21C9 17 9 15 9 15" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M6 15H13C13.5523 15 14 15.4477 14 16V16C14 16.5523 13.5523 17 13 17H6C5.44772 17 5 16.5523 5 16V16C5 15.4477 5.44772 15 6 15Z" stroke={c} strokeWidth="2" />
    <path d="M11 15V11C11 8.79086 12.7909 7 15 7H15.5" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <circle cx="15.5" cy="5.5" r="2" stroke={c} strokeWidth="2" />
    <path d="M18 10L20 8" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  beehive: (c) => <>
    <path d="M12 3L15.5 5.5V9L12 11.5L8.5 9V5.5L12 3Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9.5 10.2L15 10.2C16.5 10.2 17.5 11.5 17.5 13.3C17.5 15.1 16.5 16.4 15 16.4H9C7.5 16.4 6.5 15.1 6.5 13.3C6.5 11.5 7.5 10.2 9 10.2" stroke={c} strokeWidth="2" strokeLinejoin="round" />
    <path d="M6.5 16.5L4.5 15.5C3.3 16.1 2.5 17.3 2.5 18.7C2.5 20.1 3.3 21.3 4.5 21.9L6.5 20.9" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M17.5 16.5L19.5 15.5C20.7 16.1 21.5 17.3 21.5 18.7C21.5 20.1 20.7 21.3 19.5 21.9L17.5 20.9" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="12" cy="13.3" r="1" fill={c} />
  </>,
  target: (c) => <>
    <circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="2" />
    <circle cx="12" cy="12" r="5" stroke={c} strokeWidth="2" />
    <circle cx="12" cy="12" r="1.5" fill={c} />
  </>,

  // ── Navigation/UI glyphs ────────────────────────────────────────────────
  chevronRight: (c) => <path d="M9 6L15 12L9 18" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  chevronLeft: (c) => <path d="M15 6L9 12L15 18" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  chevronDown: (c) => <path d="M18 9L12 15L6 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  chevronUp: (c) => <path d="M6 15L12 9L18 15" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  arrowRight: (c) => <>
    <path d="M17 12H3" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.7152 11.7966L16.265 7.90356C15.7355 7.52535 15 7.90385 15 8.55455V15.4454C15 16.0961 15.7355 16.4746 16.265 16.0964L21.7152 12.2034C21.8548 12.1037 21.8548 11.8963 21.7152 11.7966Z" fill={c} />
  </>,
  close: (c) => <>
    <path d="M18 6L6 18" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 6L18 18" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  trash: (c) => <>
    <path d="M10 15L10 12" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M14 15L14 12" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M3 7H21C20.0681 7 19.6022 7 19.2346 7.15224C18.7446 7.35523 18.3552 7.74458 18.1522 8.23463C18 8.60218 18 9.06812 18 10V16C18 17.8856 18 18.8284 17.4142 19.4142C16.8284 20 15.8856 20 14 20H10C8.11438 20 7.17157 20 6.58579 19.4142C6 18.8284 6 17.8856 6 16V10C6 9.06812 6 8.60218 5.84776 8.23463C5.64477 7.74458 5.25542 7.35523 4.76537 7.15224C4.39782 7 3.93188 7 3 7Z" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M10.0681 3.37059C10.1821 3.26427 10.4332 3.17033 10.7825 3.10332C11.1318 3.03632 11.5597 3 12 3C12.4403 3 12.8682 3.03632 13.2175 3.10332C13.5668 3.17033 13.8179 3.26427 13.9319 3.37059" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  key: (c) => <>
    <circle cx="8" cy="15" r="4" stroke={c} strokeWidth="2" />
    <path d="M11 12L19 4" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M15 8L18 11" stroke={c} strokeWidth="2" strokeLinecap="round" />
    <path d="M17.5 5.5L20 8" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  archive: (c) => <>
    <rect x="3" y="4" width="18" height="5" rx="1.5" stroke={c} strokeWidth="2" />
    <path d="M5 9V17C5 18.6569 6.34315 20 8 20H16C17.6569 20 19 18.6569 19 17V9" stroke={c} strokeWidth="2" />
    <path d="M10 13H14" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  undo: (c) => <>
    <path d="M4 8.5V4M4 8.5H8.5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 15C6.06925 18.5033 9.75212 21 14 21C18.6944 21 22.5 17.4183 22.5 13C22.5 8.58172 18.6944 5 14 5C9.60618 5 5.99042 8.11055 5.55 12.1" stroke={c} strokeWidth="2" strokeLinecap="round" />
  </>,
  clock: (c) => <>
    <circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="2" />
    <path d="M12 7.5V12L15.2 14" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
};

export default function Icon({ name, size = 16, color = 'currentColor', color2, className, style }: IconProps) {
  const renderer = RENDERERS[name];
  if (!renderer) return null;
  const c2 = color2 ?? color;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      className={className}
      aria-hidden="true"
    >
      {renderer(color, c2)}
    </svg>
  );
}
