/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sky: {
          cyan: '#00d4ff',
          blue: '#0066ff',
          dark: '#0a0a0a',
          card: '#111111',
          border: 'rgba(255,255,255,0.08)',
        },
      },
      backgroundImage: {
        'sky-gradient': 'linear-gradient(135deg, #00d4ff 0%, #0066ff 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
