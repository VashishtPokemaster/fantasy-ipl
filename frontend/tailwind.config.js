/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ipl: {
          blue: '#004BA0',
          gold: '#F5A623',
          dark: '#0A0E1A',
          card: '#111827',
          border: '#1F2937',
        },
      },
    },
  },
  plugins: [],
};
