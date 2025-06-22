/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mns-dark': '#0a0a0a',
        'mns-darker': '#050505',
        'mns-accent': '#1e90ff',
      }
    },
  },
  plugins: [],
}