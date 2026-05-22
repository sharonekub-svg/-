/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        shk: {
          bg: '#faf8f4',
          s1: '#f2ede5',
          s2: '#e8e1d6',
          s3: '#ddd7cc',
          tx: '#1e1c18',
          mu: 'rgba(30,28,24,0.45)',
          mu2: 'rgba(30,28,24,0.12)',
          acc: '#c96a3b',
          accLight: '#f5e8de',
          grn: '#4a7c59',
          err: '#c0392b',
          br: 'rgba(30,28,24,0.08)',
          brBr: 'rgba(30,28,24,0.14)',
        },
      },
      fontFamily: {
        display: ['PlayfairDisplay_700Bold'],
        body: ['DMSans_400Regular'],
        bodyMedium: ['DMSans_500Medium'],
        bodySemi: ['DMSans_600SemiBold'],
      },
    },
  },
  plugins: [],
};
