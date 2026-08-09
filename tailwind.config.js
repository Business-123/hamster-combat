/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(243, 186, 47, 0.55)' },
          '50%': { boxShadow: '0 0 0 8px rgba(243, 186, 47, 0)' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

