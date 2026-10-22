import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        heading: ['Kalam', 'cursive', 'sans-serif'],
        body: ['"Patrick Hand"', 'cursive', 'sans-serif'],
      },
      colors: {
        paper: '#fdfbf7',
        lead: '#2d2d2d',
        pencil: '#2d2d2d',
        mutedPaper: '#e5e0d8',
        markerRed: '#ff4d4d',
        ballpointBlue: '#2d5da1',
        postit: '#fff9c4',
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#ff4d4d',
          600: '#ff3333',
          700: '#e62e2e',
          800: '#cc2929',
          900: '#991f1f',
          950: '#661414',
        },
      },
      boxShadow: {
        sketch: '4px 4px 0px 0px #2d2d2d',
        'sketch-sm': '2px 2px 0px 0px #2d2d2d',
        'sketch-lg': '8px 8px 0px 0px #2d2d2d',
      },
    },
  },
  plugins: [],
} satisfies Config;
