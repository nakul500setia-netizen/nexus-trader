/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0A0A0A',
        surface: '#121212',
        border: 'rgba(255, 255, 255, 0.1)',
        primary: '#007AFF',
        'primary-hover': '#3395FF',
        positive: '#00E676',
        negative: '#FF3B30',
      },
      fontFamily: {
        'heading': ['Manrope', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
