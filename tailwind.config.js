/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/**/*.js'
  ],
  
  // ===== OPRAVA: Pridaná sekcia 'safelist' na zachovanie štýlov =====
  safelist: [
    {
      pattern: /(bg|border|text)-(green|blue|orange)-(50|100|200|500|700|800)/,
    },
    {
      pattern: /border-l-4/,
    },
    {
      pattern: /before:(content|absolute|left-0|text-orange-500|font-bold)/,
    }
  ],
  // =============================================================

  theme: {
    extend: {},
  },
  plugins: [],
}
