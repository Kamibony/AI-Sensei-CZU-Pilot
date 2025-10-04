import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginImport from "eslint-plugin-import";

// The recommended configs from typescript-eslint are applied to all files by default.
// To fix this, we'll remap them to ONLY apply to our TypeScript source files.
const scopedRecommended = tseslint.configs.recommended.map(config => ({
  ...config,
  files: ["src/**/*.ts"],
}));

export default [
  {
    // Global ignores. This is the most important part.
    // It prevents ESLint from looking inside the compiled output directory.
    ignores: ["lib/"],
  },
  {
    // General configuration for all linted files
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: eslintPluginImport,
    },
    rules: {
        "import/no-unresolved": 0, // Common issue with module resolution
        "quotes": ["error", "double"],
    },
  },
  // Now, spread the SCOPED recommended configs.
  // These will only apply to files matching "src/**/*.ts".
  ...scopedRecommended,
];