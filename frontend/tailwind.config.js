/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#FBF5EA',
          bgAlt: '#F3ECDC',
          bgDark: '#0f4c5c',
          surface: 'rgba(15, 76, 92, 0.08)',
          surfaceStrong: 'rgba(15, 76, 92, 0.15)',
          text: '#1B2420',
          textSoft: '#3F4F45',
          textMuted: '#6E7B70',
          textDark: '#F3ECDC',
          line: 'rgba(27,36,32,0.12)',
          primary: '#0f4c5c',
          primaryStrong: '#09343f',
          accent: '#0c77b0',
          accentStrong: '#095e8c',
          gold: '#F0B255',
          danger: '#B23B3B',
        },
      },
      fontFamily: {
        display: ['BeVietnamPro_700Bold', 'system-ui', 'sans-serif'],
        label: ['BeVietnamPro_400Regular', 'system-ui', 'sans-serif'],
        serif: ['Lora_400Regular', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
