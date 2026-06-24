/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 12px 40px rgba(15, 23, 42, 0.10)',
      },
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#b9dcff',
          300: '#86c4ff',
          400: '#4fa6ff',
          500: '#2d87ff',
          600: '#1669ef',
          700: '#1551c2',
          800: '#184497',
          900: '#193b78',
        },
      },
    },
  },
  plugins: [],
};
