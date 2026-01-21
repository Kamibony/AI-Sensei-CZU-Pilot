/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/**/*.js'
  ],
  
  // ===== OPRAVA: Pridaná sekcia 'safelist' na zachovanie štýlov =====
  safelist: [
    // Combined requested colors with existing used colors (cyan, orange, pink, slate)
    { pattern: /bg-(blue|green|purple|red|yellow|gray|cyan|orange|pink|slate)-(50|100|200|500)/ },
    { pattern: /text-(blue|green|purple|red|yellow|gray|cyan|orange|pink|slate)-(700|800|900)/ },
    { pattern: /border-(blue|green|purple|red|yellow|gray|cyan|orange|pink|slate)-(200|300|400|500)/ },
    { pattern: /border-l-4/ },
    { pattern: /before:(content|absolute|left-0|text-orange-500|font-bold)/ }
  ],
  // =============================================================

  theme: {
    extend: {},
  },
  plugins: [],
}
