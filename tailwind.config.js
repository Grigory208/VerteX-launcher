/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'launcher-bg': '#0a0e16',
        'launcher-surface': '#111827',
        'launcher-elevated': '#1a2332',
        'launcher-border': '#243044',
        'launcher-primary': '#00e676',
        'launcher-primary-dim': '#00b25e',
        'launcher-accent': '#00b0ff',
        'launcher-danger': '#ff3d57',
        'launcher-warning': '#ffab00',
        'launcher-text': '#e2e8f0',
        'launcher-muted': '#64748b',
      },
      fontFamily: {
        display: ['"Chakra Petch"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 30px rgba(0, 230, 118, 0.3), 0 0 60px rgba(0, 230, 118, 0.15)' },
          '50%': { boxShadow: '0 0 50px rgba(0, 230, 118, 0.5), 0 0 100px rgba(0, 230, 118, 0.25)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
