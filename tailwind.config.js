/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        accent: {
          50: '#f3f1ff',
          100: '#e9e6ff',
          200: '#d7d1ff',
          300: '#bdb4ff',
          400: '#9d91ff',
          500: '#806fff',
          600: '#6d5dfc',
          700: '#5a4be7',
          800: '#493bc2',
          900: '#3b3198',
          950: '#241e63',
        },
        ink: {
          50: '#f7f7fb',
          100: '#f0f0f5',
          200: '#e4e4ec',
          300: '#d3d3df',
          400: '#b8b8c7',
          500: '#9797a8',
          600: '#707082',
          700: '#505061',
          800: '#343441',
          850: '#282832',
          900: '#1d1d26',
          950: '#09090f',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideDown: { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        scaleIn: { '0%': { transform: 'scale(0.95)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
};
