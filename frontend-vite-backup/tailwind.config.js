/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: 'var(--bg)',
          bgAlt: 'var(--bg-alt)',
          surface: 'var(--surface)',
          surfaceStrong: 'var(--surface-strong)',
          text: 'var(--text)',
          textSoft: 'var(--text-soft)',
          textMuted: 'var(--text-muted)',
          line: 'var(--line)',
          primary: 'var(--primary)',
          primaryStrong: 'var(--primary-strong)',
          accent: 'var(--accent)',
          accentStrong: 'var(--accent-strong)',
          gold: 'var(--gold)',
          danger: 'var(--danger)',
        }
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        serif: ['var(--font-serif)', 'serif'],
        label: ['var(--font-label)', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
