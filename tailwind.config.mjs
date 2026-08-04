/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#050c16',
          900: '#060d1a',
          800: '#0b1726',
          700: '#122036',
        },
        accent: {
          DEFAULT: '#38bdf8',
          dark: '#0284c7',
          light: '#7dd3fc',
        },
        muted: '#94a3b8',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 30px rgba(56,189,248,0.15)',
      },
      backgroundImage: {
        radial: 'radial-gradient(circle at 80% 20%, rgba(56,189,248,0.12) 0%, transparent 40%), radial-gradient(circle at 15% 50%, rgba(3,105,161,0.15) 0%, transparent 45%), radial-gradient(circle at 70% 80%, rgba(56,189,248,0.12) 0%, transparent 40%)',
      },
    },
  },
  plugins: [],
};
