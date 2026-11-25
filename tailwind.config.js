/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pbi: {
          yellow: '#F2C811',
          dark: '#252423',
          gray: '#F3F2F1',
        },
      },
    },
  },
  plugins: [],
};
