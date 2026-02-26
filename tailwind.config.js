/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'kinela-dark': '#070b14',
        'kinela-primary': '#00ff88',
        'kinela-accent': '#3b82f6',
      },
    },
  },
  plugins: [],
}