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
          bgDark: '#14201B',
          surface: 'rgba(31,111,84,0.06)',
          surfaceStrong: 'rgba(31,111,84,0.12)',
          text: '#1B2420',
          textSoft: '#3F4F45',
          textMuted: '#6E7B70',
          textDark: '#F3ECDC',
          line: 'rgba(27,36,32,0.12)',
          primary: '#1F6F54',
          primaryStrong: '#134A37',
          accent: '#E2703A',
          accentStrong: '#C75A29',
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
