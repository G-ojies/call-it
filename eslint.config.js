import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["public/**/*.js"],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ["*.js"],
    languageOptions: { globals: globals.node }
  }
);
