/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './views/*.html',
    './src/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        wired: {
          dark: '#0b1120',
          light: '#f8fafc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
