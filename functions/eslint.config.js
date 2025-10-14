import globals from "globals";
import tseslint from "typescript-eslint";
import pluginJs from "@eslint/js";

export default [
  // Globálna konfigurácia ignonovania
  {
    ignores: [
      "lib/",
      "node_modules/",
      "eslint.config.js",
    ],
  },
  
  // Základné pravidlá odporúčané ESLintom
  pluginJs.configs.recommended,
  
  // Konfigurácia pre TypeScript súbory
  ...tseslint.configs.recommended,

  // Vlastné pravidlá a nastavenia
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "quotes": ["error", "double"],
      "import/no-unresolved": 0,
    },
  },
];
