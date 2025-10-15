import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigGoogle from "eslint-config-google";

export default [
  // Povieme ESLintu, aby ignoroval svoj vlastný konfiguračný súbor.
  {
    ignores: ["eslint.config.js"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigGoogle,
  {
    rules: {
      "quotes": ["error", "double"],
      "no-unused-vars": "warn",
      "no-console": "off",
      "indent": ["error", 2],
      "object-curly-spacing": ["error", "always"],
    },
  },
];
