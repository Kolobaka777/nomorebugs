/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 2026-08-09: repointed to the redesign's UI Kit palette (see
        // client/src/utils/theme.ts, the canonical source — these Tailwind
        // names are kept only because hundreds of call sites across the
        // whole app already use `text-primary`/`bg-game-card`/etc.;
        // repointing them here is what makes "change it once, it changes
        // everywhere" true for every page, not just the ones importing
        // theme.ts directly. Old teal/cream values retired app-wide.
        primary: '#66FCF1',      // was #1D9E75 — kit's ACCENT
        game: '#0B0C10',         // was #0f0f1a — kit's PAGE_BG
        'game-card': '#1F2833',  // was #1a1a2e — kit's CARD_BG
        amber: '#EF9F27',        // unchanged — already matches kit's BADGE_NOTIFY
        pixel: '#C5C6C7',        // was #e8e8d0 — kit's TEXT_PRIMARY
        purple: '#7F77DD',       // unchanged — not part of the kit, left alone
      },
      fontFamily: {
        // Was the "Press Start 2P" pixel-game font for every heading
        // app-wide; the kit specifies Montserrat for headings/logo/nav
        // instead, so this now resolves there — same reasoning as above,
        // every `font-pixel` call site updates without being touched.
        pixel: ['Montserrat', 'sans-serif'],
        // Was Inter; kit specifies Geist for body/lecture/instruction text.
        sans: ['Geist', 'system-ui', 'sans-serif'],
        montserrat: ['Montserrat', 'sans-serif'],
        geist: ['Geist', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
