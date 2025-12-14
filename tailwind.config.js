/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vpn: {
          bg: '#0f172a',
          panel: '#1e293b',
          primary: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
          text: '#e2e8f0',
          muted: '#94a3b8',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
