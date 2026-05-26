/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1D9E75',
        game: '#0f0f1a',
        'game-card': '#1a1a2e',
        amber: '#EF9F27',
        pixel: '#e8e8d0',
        purple: '#7F77DD',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
