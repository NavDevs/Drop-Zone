import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      fontFamily: {
        heading: ['Orbitron', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'monospace'],
        body: ['"Share Tech Mono"', 'monospace'],
      },
      colors: {
        void: '#090014',
        chrome: '#E0E0E0',
        cardBg: 'rgba(26, 16, 60, 0.85)',
        neonMagenta: '#FF00FF',
        neonCyan: '#00FFFF',
        sunsetOrange: '#FF9900',
        retroBorder: '#2D1B4E',
        primary: {
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f472b6',
          400: '#e879f9',
          500: '#FF00FF',
          600: '#d946ef',
          700: '#c026d3',
          800: '#a21caf',
          900: '#701a75',
          950: '#4a044e',
        },
      },
      boxShadow: {
        neonMagenta: '0 0 15px #FF00FF, 0 0 30px rgba(255, 0, 255, 0.4)',
        neonCyan: '0 0 15px #00FFFF, 0 0 30px rgba(0, 255, 255, 0.4)',
        panelGlow: '0 0 25px rgba(0, 255, 255, 0.15)',
      },
    },
  },
  plugins: [],
} satisfies Config;
