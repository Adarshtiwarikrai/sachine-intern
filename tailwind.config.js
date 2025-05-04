/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class', // ✅ Enable class-based dark mode
    content: [
      "./app/**/*.{js,ts,jsx,tsx}",     // for app directory structure
      "./pages/**/*.{js,ts,jsx,tsx}",   // if using pages directory
      "./components/**/*.{js,ts,jsx,tsx}" // common for shared UI
    ],
    theme: {
      extend: {},
    },
    plugins: [],
  }
  