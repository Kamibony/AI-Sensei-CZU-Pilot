import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginImport from "eslint-plugin-import";

export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      import: eslintPluginImport,
    },
    rules: {
        "import/no-unresolved": 0, // Disable for now, can be configured later
        "quotes": ["error", "double"],
    },
  },
];